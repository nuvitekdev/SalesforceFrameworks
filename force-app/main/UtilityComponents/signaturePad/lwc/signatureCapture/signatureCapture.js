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
    @track isLoading = false;
    @track savedSignatureUrl = '';
    @track signatureType = 'draw'; // Default to draw mode
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
    
    connectedCallback() {
        console.log('Component initialized');
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
        
        // Set canvas dimensions based on container size
        this.canvasElement.width = this.canvasElement.offsetWidth;
        this.canvasElement.height = this.canvasElement.offsetHeight;
        
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
                backgroundColor: 'white',
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
    
    renderTextSignature() {
        console.log('Rendering text signature');
        if (!this.ctx || !this.canvasElement) {
            console.error('Canvas context or element not available');
            return;
        }
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        if (!this.signatureText) {
            return; // Nothing to render
        }
        
        // Set font size based on text length and canvas width
        const fontSize = Math.min(this.canvasElement.height / 3, 
                               this.canvasElement.width / (this.signatureText.length * 0.7));
        
        // Configure text style
        this.ctx.font = `${fontSize}px SignatureFont, cursive`;
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
        } else if (this.isTextMode && this.ctx && this.canvasElement) {
            this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
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
            // Get signature as PNG data URL
            let signatureData;
            if (this.canvasElement) {
                signatureData = this.canvasElement.toDataURL('image/png');
            } else {
                throw new Error('Canvas element not available');
            }
            
            // Remove the data URL prefix to get just the base64 data
            const base64Data = signatureData.split(',')[1];
            const recordId = this.effectiveRecordId;
            
            console.log('Calling Apex to save signature for record:', recordId);
            
            // Call Apex method to save the signature
            saveSignature({ 
                recordId: recordId,
                signatureBody: base64Data,
                fileName: 'Signature_' + new Date().getTime() + '.png'
            })
            .then(result => {
                this.isLoading = false;
                this.savedSignatureUrl = signatureData;
                console.log('Signature saved successfully');
                this.showToast('Success', 'Signature saved successfully', 'success');
                
                // Dispatch event for potential parent components
                this.dispatchEvent(new CustomEvent('signaturesaved', {
                    detail: {
                        success: true,
                        contentDocumentId: result
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
}