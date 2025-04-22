import { LightningElement, api, track, wire } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { CurrentPageReference } from 'lightning/navigation';

// Import static resources
import SIGNATURE_PAD from '@salesforce/resourceUrl/signature_pad';

// Import Apex methods
import saveSignature from '@salesforce/apex/SignatureCaptureController.saveSignature';

export default class SignatureCapture extends LightningElement {
    @api recordId;
    @api title = 'Signature Capture';
    @api subtitle;
    @api defaultMode = 'draw';
    @api canvasHeight = 200;
    @api signatureFont = 'SignatureFont';
    @api primaryColor = '#22BDC1';
    @api accentColor = '#D5DF23';
    @api textColor = '#1d1d1f';
    @api backgroundColor = '#ffffff';
    @api borderRadius = '12px';
    @api showPreview = false;
    @api allowClear = false;

    // Flow output attributes
    @api savedSignatureUrl;
    @api contentDocumentId;

    @track isLoading = false;
    @track _savedSignatureUrl = '';
    @track signatureType = 'draw';
    @track signatureText = '';
    
    signaturePad;
    canvasElement;
    ctx;
    libraryLoaded = false;
    canvasInitialized = false;
    
    @wire(CurrentPageReference)
    pageRef;
    
    // Getters for conditional rendering
    get isDrawMode() {
        return this.signatureType === 'draw';
    }
    
    get isTextMode() {
        return this.signatureType === 'text';
    }
    
    get canvasStyle() {
        // Always show canvas (for handwritten or text signatures)
        return 'display: block;';
    }
    
    // Get record ID from different sources
    getRecordIdFromUrl() {
        const path = window.location.pathname;
        const pathParts = path.split('/');
        console.log('Path:', path);
        
        const recordId = pathParts.find(part =>
            (part.length === 15 || part.length === 18) &&
            part.match(/^[a-zA-Z0-9]+$/)
        );
        console.log('Found Record ID from URL:', recordId);
        return recordId || null;
    }
    
    getRecordIdFromPageRef() {
        if (this.pageRef) {
            if (this.pageRef.attributes && this.pageRef.attributes.recordId) {
                return this.pageRef.attributes.recordId;
            }
            // For Experience/Community sites
            if (this.pageRef.state && this.pageRef.state.recordId) {
                return this.pageRef.state.recordId;
            }
        }
        return null;
    }
    
    get effectiveRecordId() {
        const id = this.recordId || this.getRecordIdFromPageRef() || this.getRecordIdFromUrl();
        console.log('Effective Record ID:', id);
        return id;
    }
    
    // Computed properties for styling
    get canvasHeightStyle() {
        return `height: ${this.canvasHeight}px;`;
    }

    get showPreviewSection() {
        return this.showPreview && this._savedSignatureUrl;
    }
    
    // Getter for saved signature URL to handle both Flow and non-Flow scenarios
    get displaySignatureUrl() {
        return this._savedSignatureUrl;
    }

    // Update saved signature URL and notify Flow if needed
    updateSavedSignatureUrl(url) {
        this._savedSignatureUrl = url;
        // If in Flow, update the output variable
        if (this.savedSignatureUrl !== undefined) {
            this.savedSignatureUrl = url;
        }
    }
    
    connectedCallback() {
        console.log('Component initialized');
        // Set initial signature type from default mode
        this.signatureType = this.defaultMode;
        
        // Apply custom properties to host element
        this.updateCustomProperties();
        
        // Load signature pad library
        this.loadSignaturePadLibrary();
    }
    
    renderedCallback() {
        console.log('Component rendered');
        // Initialize canvas if library loaded but canvas not yet initialized
        if (this.libraryLoaded && !this.canvasInitialized) {
            this.initializeCanvas();
        }
    }
    
    async loadSignaturePadLibrary() {
        console.log('Loading signature pad library');
        this.isLoading = true;
        
        try {
            await loadScript(this, SIGNATURE_PAD);
            console.log('Signature Pad library loaded successfully');
            this.libraryLoaded = true;
            
            // Wait a moment for DOM to be fully rendered
            setTimeout(() => {
                this.initializeCanvas();
                this.isLoading = false;
            }, 500);
        } catch (error) {
            console.error('Error loading signature pad library:', error);
            this.isLoading = false;
            this.showToast('Error', 'Failed to load signature pad library: ' + error.message, 'error');
        }
    }
    
    initializeCanvas() {
        console.log('Initializing signature pad');
        
        // Get canvas element
        this.canvasElement = this.template.querySelector('.signature-pad');
        
        if (!this.canvasElement) {
            console.error('Canvas element not found');
            return;
        }
        
        console.log('Canvas element found');
        
        // Get 2d context for drawing
        this.ctx = this.canvasElement.getContext('2d');
        
        // Set canvas dimensions based on container size and configured height
        this.canvasElement.width = this.canvasElement.offsetWidth;
        this.canvasElement.height = this.canvasHeight;
        
        // Initialize SignaturePad if in draw mode
        if (this.isDrawMode && window.SignaturePad) {
            try {
                this.signaturePad = new window.SignaturePad(this.canvasElement, {
                    backgroundColor: 'white',
                    penColor: 'black',
                    minWidth: 1,
                    maxWidth: 3
                });
                console.log('Signature pad initialized');
            } catch (error) {
                console.error('Error initializing SignaturePad:', error);
            }
        }
        
        // Mark canvas as initialized
        this.canvasInitialized = true;
        
        // If in text mode, render text signature
        if (this.isTextMode && this.signatureText) {
            this.renderTextSignature();
        }
    }
    
    handleSignatureTypeChange(event) {
        console.log('Signature type changed:', event.target.value);
        this.signatureType = event.target.value;
        
        // Clear the canvas
        this.handleClearClick();
        
        // Reinitialize canvas for new mode
        if (this.isDrawMode && window.SignaturePad && this.canvasElement) {
            this.signaturePad = new window.SignaturePad(this.canvasElement, {
                backgroundColor: 'white',  // Always use white background
                penColor: 'black',
                minWidth: 1,
                maxWidth: 3
            });
        } else if (this.isTextMode && this.signatureText) {
            this.renderTextSignature();
        }
    }
    
    handleTextChange(event) {
        console.log('Text changed:', event.detail.value);
        this.signatureText = event.detail.value;
        
        if (this.isTextMode && this.canvasInitialized) {
            this.renderTextSignature();
        }
    }
    
    // Helper function to detect background color and determine best contrast color
    determineContrastColor(backgroundColor) {
        // If background is transparent or not provided, default to black
        if (!backgroundColor || backgroundColor === 'rgba(0,0,0,0)') {
            return 'black';
        }
        
        // Convert background color to RGB
        let r, g, b;
        if (backgroundColor.startsWith('#')) {
            r = parseInt(backgroundColor.slice(1, 3), 16);
            g = parseInt(backgroundColor.slice(3, 5), 16);
            b = parseInt(backgroundColor.slice(5, 7), 16);
        } else if (backgroundColor.startsWith('rgb')) {
            [r, g, b] = backgroundColor.match(/\d+/g).map(Number);
        } else {
            return 'black'; // Default to black if color format is unknown
        }
        
        // Calculate relative luminance
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        // Return black for light backgrounds, white for dark backgrounds
        return luminance > 0.5 ? 'black' : 'white';
    }
    
    renderTextSignature() {
        console.log('Rendering text signature');
        if (!this.ctx || !this.canvasElement) {
            console.error('Canvas context or element not available');
            return;
        }
        
        // Clear canvas and fill with white background
        this.ctx.fillStyle = 'white';
        this.ctx.fillRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        if (!this.signatureText) {
            return; // Nothing to render
        }
        
        // Set font size based on text length and canvas width
        const fontSize = Math.min(this.canvasElement.height / 3, 
                               this.canvasElement.width / (this.signatureText.length * 0.7));
        
        // Configure text style
        this.ctx.font = `${fontSize}px ${this.signatureFont}, cursive`;
        this.ctx.fillStyle = 'black';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';
        
        // Draw text
        this.ctx.fillText(
            this.signatureText,
            this.canvasElement.width / 2,
            this.canvasElement.height / 2
        );
    }
    
    handleClearClick() {
        console.log('Clear button clicked');
        if (this.isDrawMode && this.signaturePad) {
            this.signaturePad.clear();
            // Re-fill with white background after clearing
            this.ctx.fillStyle = 'white';
            this.ctx.fillRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        } else if (this.isTextMode && this.ctx && this.canvasElement) {
            // Clear with white background
            this.ctx.fillStyle = 'white';
            this.ctx.fillRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        }
    }
    
    handleSaveClick() {
        console.log('Save button clicked');
        
        if (this.isDrawMode && this.signaturePad) {
            if (this.signaturePad.isEmpty()) {
                this.showToast('Error', 'Please draw a signature before saving', 'error');
                return;
            }
        } else if (this.isTextMode && !this.signatureText) {
            this.showToast('Error', 'Please enter text for your signature', 'error');
            return;
        }
        
        this.saveSignature();
    }
    
    saveSignature() {
        console.log('Saving signature');
        this.isLoading = true;
        
        try {
            // Get signature as PNG data URL with white background
            let signatureData;
            if (this.canvasElement) {
                // Create a temporary canvas to handle background properly
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = this.canvasElement.width;
                tempCanvas.height = this.canvasElement.height;
                const tempCtx = tempCanvas.getContext('2d');
                
                // Fill with white background
                tempCtx.fillStyle = 'white';
                tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);
                
                // Draw the signature onto temp canvas
                tempCtx.drawImage(this.canvasElement, 0, 0);
                
                signatureData = tempCanvas.toDataURL('image/png');
            } else {
                throw new Error('Canvas element not available');
            }
            
            // Remove the data URL prefix to get just the base64 data
            const base64Data = signatureData.split(',')[1];
            
            // Get record ID from property or auto-detection
            const recordId = this.recordId || this.getRecordIdFromPageRef() || this.getRecordIdFromUrl();
            
            console.log('Calling Apex to save signature for record:', recordId);
            
            // Call Apex method to save the signature
            saveSignature({ 
                recordId: recordId,
                signatureBody: base64Data,
                fileName: 'Signature_' + new Date().getTime() + '.png'
            })
            .then(result => {
                this.isLoading = false;
                this.updateSavedSignatureUrl(signatureData);
                
                // If in Flow, update the content document ID
                if (this.contentDocumentId !== undefined) {
                    this.contentDocumentId = result;
                }
                
                console.log('Signature saved successfully');
                this.showToast('Success', 'Signature saved successfully', 'success');
                
                // Dispatch event for potential parent components
                this.dispatchEvent(new CustomEvent('signaturesaved', {
                    detail: {
                        success: true,
                        contentDocumentId: result,
                        signatureUrl: signatureData
                    }
                }));
            })
            .catch(error => {
                this.isLoading = false;
                console.error('Error saving signature:', error);
                this.showToast('Error', 'Failed to save signature: ' + error.message, 'error');
                
                // Dispatch event with error
                this.dispatchEvent(new CustomEvent('signaturesaved', {
                    detail: {
                        success: false,
                        errorMessage: error.message
                    }
                }));
            });
        } catch (error) {
            this.isLoading = false;
            console.error('Error processing signature:', error);
            this.showToast('Error', 'Failed to process signature: ' + error.message, 'error');
        }
    }
    
    showToast(title, message, variant) {
        console.log('Showing toast message:', title, message);
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(event);
    }
    
    // Handle window resize
    connectedCallback() {
        this.loadSignaturePadLibrary();
        window.addEventListener('resize', this.handleResize.bind(this));
    }
    
    disconnectedCallback() {
        window.removeEventListener('resize', this.handleResize.bind(this));
    }
    
    handleResize() {
        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
        }
        
        this.resizeTimeout = setTimeout(() => {
            if (this.canvasElement) {
                const oldWidth = this.canvasElement.width;
                const oldHeight = this.canvasElement.height;
                
                // Get the current signature data
                let signatureData = null;
                if (this.isDrawMode && this.signaturePad && !this.signaturePad.isEmpty()) {
                    signatureData = this.signaturePad.toDataURL();
                }
                
                // Resize canvas
                this.canvasElement.width = this.canvasElement.offsetWidth;
                this.canvasElement.height = this.canvasElement.offsetHeight;
                
                // Redraw signature
                if (this.isDrawMode && signatureData) {
                    // Reinitialize signature pad
                    this.signaturePad = new window.SignaturePad(this.canvasElement, {
                        backgroundColor: 'white',
                        penColor: 'black',
                        minWidth: 1,
                        maxWidth: 3
                    });
                    
                    // Load image
                    this.loadImageIntoSignaturePad(signatureData);
                } else if (this.isTextMode && this.signatureText) {
                    this.renderTextSignature();
                }
            }
        }, 200);
    }
    
    loadImageIntoSignaturePad(dataUrl) {
        if (!dataUrl) return;
        
        const image = new Image();
        image.onload = () => {
            this.ctx.drawImage(image, 0, 0, this.canvasElement.width, this.canvasElement.height);
        };
        image.src = dataUrl;
    }

    // Update CSS custom properties based on configuration
    updateCustomProperties() {
        const host = this.template.host;
        host.style.setProperty('--primary-color-override', this.primaryColor);
        host.style.setProperty('--accent-color-override', this.accentColor);
        host.style.setProperty('--text-color-override', this.textColor);
        host.style.setProperty('--background-color-override', this.backgroundColor);
        host.style.setProperty('--border-radius-override', this.borderRadius);
        
        // Calculate and set derived colors
        const primaryRgb = this.hexToRgb(this.primaryColor);
        if (primaryRgb) {
            host.style.setProperty('--primary-color-rgb', `${primaryRgb.r}, ${primaryRgb.g}, ${primaryRgb.b}`);
            host.style.setProperty('--primary-dark-override', this.adjustBrightness(this.primaryColor, -20));
            host.style.setProperty('--primary-light-override', this.adjustBrightness(this.primaryColor, 20));
        }
        
        const accentRgb = this.hexToRgb(this.accentColor);
        if (accentRgb) {
            host.style.setProperty('--accent-color-rgb', `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);
            host.style.setProperty('--accent-dark-override', this.adjustBrightness(this.accentColor, -20));
            host.style.setProperty('--accent-light-override', this.adjustBrightness(this.accentColor, 20));
        }
    }

    // Helper function to convert hex to RGB
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    // Helper function to adjust color brightness
    adjustBrightness(hex, percent) {
        const rgb = this.hexToRgb(hex);
        if (!rgb) return hex;
        
        const adjust = (value) => {
            value = Math.floor(value * (1 + percent / 100));
            return Math.min(255, Math.max(0, value));
        };
        
        const r = adjust(rgb.r);
        const g = adjust(rgb.g);
        const b = adjust(rgb.b);
        
        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    }
}