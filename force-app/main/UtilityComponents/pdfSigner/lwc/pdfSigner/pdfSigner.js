import { LightningElement, api, track, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import PDF_LIB from '@salesforce/resourceUrl/pdf_lib';
import SIGNATURE_PAD from '@salesforce/resourceUrl/signature_pad';
import SIGNATURE from '@salesforce/resourceUrl/signature';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import saveSignedPdf from '@salesforce/apex/PdfSignController.saveSignedPdf';
import getDocumentUrl from '@salesforce/apex/PdfSignController.getDocumentUrl';
import deleteTemporaryPdf from '@salesforce/apex/PdfSignController.deleteTemporaryPdf';
import Id from '@salesforce/user/Id';
import { getRecord } from 'lightning/uiRecordApi';
import USER_FEDERATION_ID from '@salesforce/schema/User.FederationIdentifier';

const USER_FIELDS = [USER_FEDERATION_ID];

export default class PdfSigner extends LightningElement {
    // Configurable properties
    @api recordId;              // Id of record to relate file to (optional)
    @api primaryColor = '#22BDC1';
    @api accentColor = '#D5DF23';
    @api primaryColorRgb = '34, 189, 193';
    @api accentColorRgb = '213, 223, 35';

    // User information
    userId = Id;
    federationId;

    @wire(getRecord, { recordId: '$userId', fields: USER_FIELDS })
    wiredUser({ error, data }) {
        if (data) {
            this.federationId = data.fields.FederationIdentifier?.value || null;
            console.log('Current user ID: ' + this.userId);
            console.log('Federation ID: ' + this.federationId);
        } else if (error) {
            console.error('Error loading user data', error);
        }
    }

    // Internal state
    @track currentStep = 0;     // 0 = upload, 1 = preview, 2 = sign, 3 = place
    @track pagePreviews = [];   // {pageNumber, url, width, height} for each page image
    @track signatureMode = 'draw';  // 'draw' or 'type'
    @track signatureText = '';  // Text for typed signatures
    @track modeOptions = [
        { label: 'Draw Signature', value: 'draw' },
        { label: 'Type Signature', value: 'type' }
    ];
    @track successMessage = '';
    @track previewMode = false; // Whether we're in preview mode or direct drag mode
    @track pdfPreviewUrl = '';  // URL to view the PDF in iframe
    @track isPdfLandscape = false; // Track if the PDF is in landscape orientation
    @track zoomLevel = 1.0;    // Zoom level for PDF display
    @track useMultiPageView = false; // Whether to use multi-page view
    @track currentPageNum = 1;  // Current page number (1-based)
    @track totalPages = 1;      // Total number of pages in PDF
    @track isLoading = false;   // Track if a file is currently loading
    pdfPages = [];            // Array to store page data for multi-page view
    
    @wire(CurrentPageReference) pageRef;
    
    pdfDoc;                    // PDFDocument instance from pdf-lib
    PDFLib;                    // reference to pdf-lib global
    signaturePad;              // SignaturePad instance for drawing
    signatureImage = null;     // { dataUrl, width, height } of captured signature
    placedSignatures = [];     // Array of placed signatures: { page, x, y }
    pdfFilename = '';          // original PDF file name
    libsLoaded = false;        // Track if libraries are loaded
    contentVersionId = null;   // ID of the content version for preview
    canvasElement;             // Reference to canvas element
    ctx;                       // Canvas context
    @track fontLoaded = false;      // Track if signature font is loaded
    pdfWidth = 0;              // Width of the PDF page
    pdfHeight = 0;             // Height of the PDF page
    themeVariablesSet = false; // Flag to set variables only once

    // Methods to get recordId from different contexts
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
    
    getRecordIdFromUrl() {
        // Get recordId from URL if present
        const url = window.location.href;
        const idPattern = /\/([a-zA-Z0-9]{15,18})(?:\/|\?|$)/;
        const match = url.match(idPattern);
        return match ? match[1] : null;
    }
    
    get effectiveRecordId() {
        const id = this.recordId || this.getRecordIdFromPageRef() || this.getRecordIdFromUrl();
        console.log('Effective Record ID:', id);
        return id;
    }

    // Added getter methods for template conditionals
    get isStep0() { return this.currentStep === 0; }
    get isStep1() { return this.currentStep === 1; }
    get isStep2() { return this.currentStep === 2; }
    get isStep3() { return this.currentStep === 3; }
    get isStep4() { return this.currentStep === 4; }
    get isDraw() { return this.signatureMode === 'draw'; }
    get isType() { return this.signatureMode === 'type'; }
    
    // Getter for current step class
    get currentStepClass() {
        return `step-${this.currentStep}-mode`;
    }
    
    // Getter for combined container classes
    get containerClasses() {
        return `pdf-signer-container ${this.currentStepClass}`;
    }
    
    // Getter for PDF container class based on orientation
    get pdfContainerClass() {
        return this.isPdfLandscape ? 'iframe-container landscape' : 'iframe-container';
    }

    // Getter for radio button checked states
    get isDrawChecked() { return this.signatureMode === 'draw'; }
    get isTypeChecked() { return this.signatureMode === 'type'; }

    // Getters for page navigation
    get isFirstPage() {
        return this.currentPageNum <= 1;
    }
    
    get isLastPage() {
        return this.currentPageNum >= this.totalPages;
    }

    renderedCallback() {
        // Load static resources once
        if (!this.libsLoaded) {
            this.libsLoaded = true;
            Promise.all([
                loadScript(this, PDF_LIB),
                loadScript(this, SIGNATURE_PAD),
                this.loadFont() // Load the signature font
            ]).then(() => {
                // Save references to globals
                this.PDFLib = window.PDFLib;
                console.log('Libraries loaded successfully');
            }).catch(error => {
                console.error('Error loading libraries', error);
            });
        }
        
        // Set theme variables once after initial render
        if (!this.themeVariablesSet) {
            this.themeVariablesSet = true;
            this.updateThemeVariables();
            this.updatePathClasses(); // Initial path setup
        }
        
        // Initialize SignaturePad when entering signature step
        if (this.currentStep === 2) {
            this.initializeCanvas();
        }
        
        // Add event listener for iframe loaded in step 3
        if (this.currentStep === 3) {
            const iframe = this.template.querySelector('.pdf-iframe');
            if (iframe) {
                // Make sure iframe is properly loaded
                iframe.addEventListener('load', this.handleIframeLoad.bind(this));
                
                // Configure iframe to hide controls
                this.configureIframeView();
                
                // Update signature visibility based on current page
                this.updateSignatureVisibility();
            }
        }
        
        // Update radio button checked state
        if (this.currentStep === 2) {
            const drawInput = this.template.querySelector('input[id="draw"]');
            const textInput = this.template.querySelector('input[id="text"]');
            
            if (drawInput && textInput) {
                drawInput.checked = this.isDraw;
                textInput.checked = this.isType;
            }
        }
        
        // Initialize multi-page view if enabled in step 3
        if (this.currentStep === 3 && this.useMultiPageView) {
            this.renderPdfPagesForSigning();
        }
    }
    
    // Load the signature font and ensure it's ready to use
    async loadFont() {
        // Create a font face to load the signature font
        if (!this.fontLoaded) {
            try {
                const fontFace = new FontFace('SignatureFont', `url(${SIGNATURE}/GreatVibes-Regular.ttf)`);
                const font = await fontFace.load();
                document.fonts.add(font);
                this.fontLoaded = true;
                console.log('Signature font loaded successfully');
            } catch (error) {
                console.error('Error loading signature font:', error);
            }
        }
    }
    
    // Initialize canvas for both drawing and text modes
    initializeCanvas() {
        setTimeout(() => {
            // Get canvas element - we're using a single canvas for both modes now
            this.canvasElement = this.template.querySelector('.signature-pad');
            
            if (!this.canvasElement) {
                console.error('Canvas element not found');
                return;
            }
            
            // Get 2d context for drawing
            this.ctx = this.canvasElement.getContext('2d');
            
            // Set canvas dimensions 
            // This is important for proper drawing/cursor alignment
            const containerWidth = this.canvasElement.parentElement.clientWidth;
            this.canvasElement.width = containerWidth > 0 ? containerWidth : 400;
            this.canvasElement.height = 150;
            
            // Clear canvas with transparent background
            this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
            
            // Initialize SignaturePad if in draw mode
            if (this.isDraw && window.SignaturePad) {
                try {
                    if (this.signaturePad) {
                        this.signaturePad.clear();
                    } else {
                        this.signaturePad = new window.SignaturePad(this.canvasElement, {
                            backgroundColor: 'rgba(255, 255, 255, 0)', // Transparent background
                            penColor: 'black',
                            minWidth: 0.5,
                            maxWidth: 2.5,
                            throttle: 16, // Adjust for better performance
                            velocityFilterWeight: 0.7 // Adjust for smoother lines
                        });
                    }
                    console.log('Signature pad initialized');
                } catch (error) {
                    console.error('Error initializing SignaturePad:', error);
                }
            } else if (this.isType && this.signatureText) {
                // If there's existing text, render it
                this.renderTextSignature();
            }
        }, 100);
    }

    // Render text signature
    renderTextSignature() {
        if (!this.ctx || !this.canvasElement) {
            console.error('Canvas context or element not available');
            return;
        }
        
        // Clear canvas with transparent background
        this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
        
        if (!this.signatureText) {
            return; // Nothing to render
        }
        
        // Ensure font is loaded
        if (!this.fontLoaded) {
            console.log('Font not loaded yet, trying to load again');
            this.loadFont().then(() => {
                this.renderTextSignatureOnCanvas();
            });
        } else {
            this.renderTextSignatureOnCanvas();
        }
    }
    
    // Helper method to actually render the text on canvas
    renderTextSignatureOnCanvas() {
        try {
            // Calculate appropriate font size based on text length and canvas size
            // More text = smaller font size
            const textLength = this.signatureText.length;
            let fontSize;
            
            if (textLength <= 5) {
                fontSize = Math.min(60, this.canvasElement.height / 2);
            } else if (textLength <= 10) {
                fontSize = Math.min(48, this.canvasElement.height / 2.5);
            } else if (textLength <= 15) {
                fontSize = Math.min(36, this.canvasElement.height / 3);
            } else {
                fontSize = Math.min(30, this.canvasElement.height / 3.5);
            }
            
            console.log('Using font size:', fontSize);

            // Set font style - SignatureFont is defined in the CSS
            this.ctx.font = `${fontSize}px SignatureFont, cursive`;
            this.ctx.fillStyle = 'black';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            
            // Apply a slight italic slant for a more signature-like look
            this.ctx.setTransform(1, 0.05, 0, 1, 0, 0);
            
            // Draw text in center of canvas
            this.ctx.fillText(
                this.signatureText,
                this.canvasElement.width / 2,
                this.canvasElement.height / 2
            );
            
            // Reset transform
            this.ctx.setTransform(1, 0, 0, 1, 0, 0);
            
            console.log('Text signature rendered');
        } catch (error) {
            console.error('Error rendering text signature:', error);
        }
    }

    handleIframeLoad() {
        console.log('iframe loaded');
        
        // Configure iframe view
        this.configureIframeView();
        
        // Fix navigation when iframe loads
        this.updateContainerForCurrentPage();
        
        // Force page navigation to ensure we're on the right page
        if (this.currentPageNum > 1) {
            // Try to use PDF.js API for navigation if available
            const iframe = this.template.querySelector('.pdf-iframe');
            if (iframe && iframe.contentWindow) {
                try {
                    if (iframe.contentWindow.PDFViewerApplication) {
                        iframe.contentWindow.PDFViewerApplication.page = this.currentPageNum;
                    }
                } catch (e) {
                    console.warn('Could not set page using PDF.js API:', e);
                }
            }
        }
    }

    // Configure iframe to hide PDF viewer controls and remove scrollbars for step 3
    configureIframeView() {
        const iframe = this.template.querySelector('.pdf-iframe');
        if (!iframe) return;
        
        // Add query parameters to disable UI elements in the PDF viewer
        if (iframe.src && !iframe.src.includes('noToolbar')) {
            const separator = iframe.src.includes('?') ? '&' : '?';
            iframe.src = `${iframe.src}${separator}noToolbar=true&navpanes=0&scrollbar=0&statusbar=0&toolbar=0#toolbar=0&view=FitH`;
        }
        
        // Calculate and set the proper container height based on the PDF dimensions and current orientation
        const container = this.template.querySelector('.iframe-container');
        if (container && this.currentStep === 3) {
            // Get the current page dimensions
            if (this.pdfDoc) {
                try {
                    const pageIndex = this.currentPageNum - 1;
                    const page = this.pdfDoc.getPage(pageIndex);
                    const { width, height } = page.getSize();
                    const aspectRatio = (height / width) * 100;
                    
                    // Set container padding to maintain aspect ratio with no scrollbars
                    container.style.paddingBottom = `${aspectRatio}%`;
                    
                    // Add or remove landscape class
                    const isLandscape = width > height;
                    if (isLandscape) {
                        container.classList.add('landscape');
                    } else {
                        container.classList.remove('landscape');
                    }
                } catch (err) {
                    console.error('Error setting container dimensions:', err);
                }
            }
        }
        
        // Try to access the iframe document once loaded
        iframe.onload = () => {
            try {
                // Only remove scrollbars in step 3
                const isStep3 = this.currentStep === 3;
                
                // Hide PDF viewer controls via style injection
                if (iframe.contentDocument) {
                    const style = document.createElement('style');
                    style.textContent = `
                        #toolbar, #toolbarContainer, .toolbar { 
                            display: none !important; 
                            visibility: hidden !important;
                            height: 0 !important;
                            width: 0 !important;
                            opacity: 0 !important;
                        }
                        #viewerContainer { top: 0 !important; }
                        #viewer .page { margin: 0 !important; }
                        
                        ${isStep3 ? `
                        /* Remove scrollbars only in step 3 */
                        body, html {
                            overflow: hidden !important;
                            height: 100% !important;
                            width: 100% !important;
                        }
                        
                        .pdfViewer .page {
                            margin: 0 !important;
                            border: none !important;
                        }
                        
                        #viewerContainer {
                            overflow: hidden !important;
                        }
                        ` : ''}
                    `;
                    iframe.contentDocument.head.appendChild(style);
                    
                    // Try to find and remove toolbar elements directly
                    const toolbarElements = iframe.contentDocument.querySelectorAll('#toolbar, #toolbarContainer, .toolbar');
                    toolbarElements.forEach(el => {
                        el.style.display = 'none';
                        el.style.visibility = 'hidden';
                        el.style.height = '0';
                        el.remove();
                    });
                    
                    // Try to set page via PDF.js API if available
                    try {
                        if (iframe.contentWindow && iframe.contentWindow.PDFViewerApplication && this.currentPageNum > 1) {
                            iframe.contentWindow.PDFViewerApplication.page = this.currentPageNum;
                        }
                    } catch (err) {
                        console.warn('Could not set page using PDF.js API:', err);
                    }
                }
            } catch (e) {
                console.error('Could not modify iframe content due to same-origin policy', e);
            }
        };
    }
    
    // Analyze PDF orientation and set container sizing
    async analyzePdfOrientation() {
        if (!this.pdfDoc) return;
        
        try {
            // Get first page dimensions
            const page = this.pdfDoc.getPage(0);
            const { width, height } = page.getSize();
            
            // Save PDF dimensions for later use
            this.pdfWidth = width;
            this.pdfHeight = height;
            
            // Determine orientation
            this.isPdfLandscape = width > height;
            
            // Set container height based on actual PDF proportions
            const container = this.template.querySelector('.iframe-container');
            if (container) {
                // Calculate aspect ratio more precisely based on actual PDF dimensions
                const aspectRatio = (height / width) * 100;
                container.style.paddingBottom = `${aspectRatio}%`;
                
                // Add landscape class if needed
                if (this.isPdfLandscape) {
                    container.classList.add('landscape');
                } else {
                    container.classList.remove('landscape');
                }
            }
            
            // Update total pages
            this.totalPages = this.pdfDoc.getPageCount();
            this.currentPageNum = 1;
            
            console.log(`PDF orientation: ${this.isPdfLandscape ? 'Landscape' : 'Portrait'}`);
            console.log(`PDF dimensions: ${width} x ${height}, Aspect Ratio: ${height/width}`);
            console.log(`Total pages: ${this.totalPages}`);
        } catch (e) {
            console.error('Error determining PDF orientation', e);
        }
    }

    // Handle path navigation click
    goToStep(event) {
        const step = parseInt(event.currentTarget.dataset.step, 10);
        this.currentStep = step;
        this.updatePathClasses(); // Update path visuals
        
        // Initialize canvas when entering signature step
        if (this.currentStep === 2) {
            // We'll let renderedCallback handle the initialization
            // This ensures the DOM is ready
        }
        
        // Reset to page 1 when entering placement step
        if (this.currentStep === 3) {
            this.currentPageNum = 1;
            
            // Wait for DOM update before configuring
            setTimeout(() => {
                this.configureIframeView();
            }, 100);
        }
    }
    
    // Handle signature type change (draw or text)
    switchSigMode(event) {
        const newMode = event.target.value;
        console.log('Switching signature mode to:', newMode);
        
        this.signatureMode = newMode === 'draw' ? 'draw' : 'type';
        
        // Clear any existing signature
        this.handleClearSignature();
        
        // Reinitialize canvas for new mode
        this.initializeCanvas();
    }

    // Signature capture handlers
    handleClearSignature() {
        if (this.isDraw && this.signaturePad) {
            this.signaturePad.clear();
            // Clear with transparent background
            if (this.ctx && this.canvasElement) {
                this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
            }
        } else if (this.isType) {
            this.signatureText = '';
            if (this.ctx && this.canvasElement) {
                // Clear with transparent background
                this.ctx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
            }
            const input = this.template.querySelector('[data-id="typedInput"]');
            if (input) {
                input.value = '';
            }
        }
    }
    
    handleTypeInput(event) {
        this.signatureText = event.detail.value;
        
        if (this.isType) {
            this.renderTextSignature();
        }
    }

    // Finish signature capture, move to placement
    handleSignatureSubmit() {
        try {
            if (this.isDraw) {
                if (!this.signaturePad || this.signaturePad.isEmpty()) {
                    alert('Please draw your signature or switch to type mode.');
                    return;
                }
                const dataUrl = this.signaturePad.toDataURL('image/png');
                // Use canvas dimensions for width/height
                this.signatureImage = { 
                    dataUrl, 
                    width: this.canvasElement.width, 
                    height: this.canvasElement.height 
                };
            } else {
                if (!this.signatureText) {
                    alert('Please type your signature before continuing.');
                    return;
                }
                if (!this.canvasElement) {
                    alert('Signature canvas not found.');
                    return;
                }
                const dataUrl = this.canvasElement.toDataURL('image/png');
                this.signatureImage = { 
                    dataUrl, 
                    width: this.canvasElement.width, 
                    height: this.canvasElement.height 
                };
            }
            this.currentStep = 3;
            this.updatePathClasses();
        } catch (e) {
            console.error('Signature capture error', e);
            alert('Error capturing signature: ' + e.message);
        }
    }

    // Drag and drop handlers for placing signature
    handleDragStart(event) {
        // Only one draggable item (the signature image)
        event.dataTransfer.setData('text/plain', 'signature');
        // Optionally, set a drag image
        const img = this.template.querySelector('.signature-thumbnail');
        if (img) {
            event.dataTransfer.setDragImage(img, 50, 25);
        }
    }
    
    handleDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        const uploadContainer = this.template.querySelector('.file-upload-container');
        if (uploadContainer && !uploadContainer.classList.contains('dragover')) {
            uploadContainer.classList.add('dragover');
        }
    }
    
    handleDrop(event) {
        event.preventDefault();
        const overlay = this.template.querySelector('.pdf-overlay');
        if (!overlay) return;
        
        // Get coordinates relative to the overlay
        const rect = overlay.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        
        // Place signature at these coordinates
        this.placeSignatureOverlay(offsetX, offsetY);
    }

    // New method for handling double-click
    handleOverlayDoubleClick(event) {
        // Place signature where double-clicked on the overlay
        const overlay = this.template.querySelector('.pdf-overlay');
        if (overlay) {
            const rect = overlay.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;
            this.placeSignatureOverlay(offsetX, offsetY);
        }
    }

    // Get formatted date and time with identity information
    getFormattedDateTimeWithIdentity() {
        const now = new Date();
        // Format with emphasis on time: MM/DD/YYYY, HH:MM:SS AM/PM
        const dateOptions = { 
            year: 'numeric', 
            month: '2-digit', 
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true
        };
        const dateTimeStr = now.toLocaleString(undefined, dateOptions);
        
        // Use Federation ID if available, otherwise use Salesforce ID
        const userIdentifier = this.federationId || this.userId || 'Unknown';
        
        // Format the identity information
        const identity = {
            dateTime: dateTimeStr,
            userId: userIdentifier,
            browser: navigator.userAgent,
            ipInfo: window.location.hostname
        };
        
        return identity;
    }

    // Create date text element with enhanced information
    createDateElement(identity) {
        const dateDiv = document.createElement('div');
        dateDiv.className = 'signature-date';
        
        // Add date and time with HTML structure
        const dateTimeSpan = document.createElement('div');
        dateTimeSpan.className = 'date-time';
        dateTimeSpan.textContent = identity.dateTime;
        dateDiv.appendChild(dateTimeSpan);
        
        // Add user ID information
        const userIdSpan = document.createElement('div');
        userIdSpan.className = 'user-id';
        userIdSpan.textContent = 'User ID: ' + this.userId;
        dateDiv.appendChild(userIdSpan);
        
        // Add federation ID if it exists
        if (this.federationId) {
            const fedIdSpan = document.createElement('div');
            fedIdSpan.className = 'user-id';
            fedIdSpan.textContent = 'Fed ID: ' + this.federationId;
            dateDiv.appendChild(fedIdSpan);
        }
        
        dateDiv.style.position = 'absolute';
        dateDiv.style.bottom = '-55px'; // More space for two lines of IDs
        dateDiv.style.left = '0';
        dateDiv.style.width = '100%';
        dateDiv.style.pointerEvents = 'none';
        
        return dateDiv;
    }

    // Modified placeSignatureOverlay to consider orientation and current page
    placeSignatureOverlay(offsetX, offsetY) {
        if (!this.signatureImage) {
            this.showToast('Error', 'No signature image available', 'error');
            return;
        }
        
        // Get the overlay div to place signatures
        const overlay = this.template.querySelector('.pdf-overlay');
        if (!overlay) {
            this.showToast('Error', 'Overlay div not found', 'error');
            return;
        }
        
        // Generate unique ID for this signature placement
        const placementId = 'sig-' + Date.now() + '-' + Math.round(Math.random() * 1000);
        
        // Initial size (scaled from original) - LARGER size
        const initialWidth = Math.min(300, this.signatureImage.width * 1.5); // Make initial size larger
        const aspectRatio = this.signatureImage.height / this.signatureImage.width;
        const initialHeight = initialWidth * aspectRatio;
        
        // Create wrapper div for signature + remove button + resize handles
        const sigWrapper = document.createElement('div');
        sigWrapper.className = 'signature-placement';
        sigWrapper.dataset.id = placementId;
        sigWrapper.dataset.pageIndex = this.currentPageNum - 1; // Store page index (0-based)
        sigWrapper.style.position = 'absolute';
        sigWrapper.style.left = offsetX + 'px';
        sigWrapper.style.top = offsetY + 'px';
        sigWrapper.style.zIndex = '10';
        sigWrapper.style.width = initialWidth + 'px';
        sigWrapper.style.height = initialHeight + 'px';
        
        // Create signature image
        const sigImg = document.createElement('img');
        sigImg.src = this.signatureImage.dataUrl;
        sigImg.alt = 'Signature';
        sigImg.style.width = '100%';
        sigImg.style.height = '100%';
        sigImg.style.pointerEvents = 'none'; // Prevent image from capturing events
        
        // Get identity information
        const identity = this.getFormattedDateTimeWithIdentity();
        
        // Create date element with identity info
        const dateDiv = this.createDateElement(identity);
        
        // Create remove button - now at the top-center
        const removeBtn = document.createElement('div');
        removeBtn.innerHTML = '✖';
        removeBtn.className = 'remove-sig';
        removeBtn.style.position = 'absolute';
        removeBtn.style.top = '-10px'; // Position at top
        removeBtn.style.left = '50%'; // Center horizontally
        removeBtn.style.transform = 'translateX(-50%)'; // Center perfectly
        removeBtn.style.backgroundColor = '#f44336';
        removeBtn.style.color = 'white';
        removeBtn.style.borderRadius = '50%';
        removeBtn.style.width = '20px';
        removeBtn.style.height = '20px';
        removeBtn.style.textAlign = 'center';
        removeBtn.style.lineHeight = '20px';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        removeBtn.dataset.id = placementId;
        
        // Create resize handles
        const positions = ['nw', 'ne', 'se', 'sw']; // northwest, northeast, southeast, southwest
        const resizeHandles = {};
        
        positions.forEach(pos => {
            const handle = document.createElement('div');
            handle.className = `resize-handle resize-${pos}`;
            handle.style.position = 'absolute';
            handle.style.width = '10px';
            handle.style.height = '10px';
            handle.style.backgroundColor = '#22BDC1';
            handle.style.borderRadius = '50%';
            handle.style.cursor = pos + '-resize';
            handle.style.zIndex = '11';
            
            // Position the handle
            if (pos.includes('n')) { // North
                handle.style.top = '-5px';
            } else { // South
                handle.style.bottom = '-5px';
            }
            
            if (pos.includes('w')) { // West
                handle.style.left = '-5px';
            } else { // East
                handle.style.right = '-5px';
            }
            
            resizeHandles[pos] = handle;
            sigWrapper.appendChild(handle);
            
            // Add resize event listener
            handle.addEventListener('mousedown', (event) => {
                event.stopPropagation();
                this.startResizeSignature(event, sigWrapper, pos);
            });
        });

        // Add event listener to remove button
        removeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const id = event.target.dataset.id;
            const sigElement = overlay.querySelector(`[data-id="${id}"]`);
            if (sigElement) {
                overlay.removeChild(sigElement);
            }
            // Also remove from our tracking array
            this.placedSignatures = this.placedSignatures.filter(sig => sig.id !== id);
        });
        
        // Add drag functionality to the signature
        sigWrapper.addEventListener('mousedown', this.startDragSignature.bind(this));
        
        // Append elements
        sigWrapper.appendChild(sigImg);
        sigWrapper.appendChild(removeBtn);
        sigWrapper.appendChild(dateDiv);
        overlay.appendChild(sigWrapper);
        
        // Get dimensions of the iframe for scaling calculations
        const iframe = this.template.querySelector('.pdf-iframe');
        const iframeWidth = iframe ? iframe.clientWidth : 100;
        const iframeHeight = iframe ? iframe.clientHeight : 100;
        
        // Record placement data for PDF processing
        // We'll use percentages to handle different PDF sizes
        const pdfDoc = this.pdfDoc;
        if (pdfDoc) {
            // Get page dimensions for the current page
            const pageIndex = this.currentPageNum - 1; // Convert 1-based to 0-based
            const page = pdfDoc.getPage(pageIndex);
            const pdfWidth = page.getWidth();
            const pdfHeight = page.getHeight();
            const isPageLandscape = pdfWidth > pdfHeight;
            
            // Compute relative positions as percentages
            const relativeX = offsetX / iframeWidth;
            const relativeY = offsetY / iframeHeight;
            
            // Calculate actual PDF coordinates (note PDF origin is bottom-left)
            let pdfX, pdfY;
            
            if (isPageLandscape) {
                pdfX = relativeX * pdfWidth;
                pdfY = pdfHeight - (relativeY * pdfHeight);
            } else {
                pdfX = relativeX * pdfWidth;
                pdfY = pdfHeight - (relativeY * pdfHeight);
            }
            
            // Calculate relative size
            const relativeWidth = initialWidth / iframeWidth;
            const relativeHeight = initialHeight / iframeHeight;
            
            // Store for later use when actually adding to PDF
            this.placedSignatures.push({
                id: placementId,
                pageIndex: pageIndex, // Use 0-based page index
                x: pdfX,
                y: pdfY,
                width: relativeWidth * pdfWidth,
                height: relativeHeight * pdfHeight,
                element: sigWrapper,
                isLandscape: isPageLandscape,
                identity: identity // Store the identity information
            });
        }
    }
    
    // New method to handle signature resizing
    startResizeSignature(event, sigElement, resizeHandle) {
        event.preventDefault();
        
        // Initial position and size
        const startX = event.clientX;
        const startY = event.clientY;
        const initialLeft = parseInt(sigElement.style.left) || 0;
        const initialTop = parseInt(sigElement.style.top) || 0;
        const initialWidth = parseInt(sigElement.style.width) || 200;
        const initialHeight = parseInt(sigElement.style.height) || 100;
        
        // Track original aspect ratio
        const aspectRatio = initialHeight / initialWidth;
        
        // Track current signature ID
        const placementId = sigElement.dataset.id;
        
        const handleMouseMove = (moveEvent) => {
            moveEvent.preventDefault();
            
            // Calculate deltas
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;
            
            // Calculate new dimensions based on resize handle
            let newWidth = initialWidth;
            let newHeight = initialHeight;
            let newLeft = initialLeft;
            let newTop = initialTop;
            
            if (resizeHandle.includes('e')) {
                // East - resizing right edge
                newWidth = initialWidth + deltaX;
                newHeight = newWidth * aspectRatio; // Maintain aspect ratio
            } else if (resizeHandle.includes('w')) {
                // West - resizing left edge
                newWidth = initialWidth - deltaX;
                newLeft = initialLeft + deltaX;
                newHeight = newWidth * aspectRatio; // Maintain aspect ratio
            }
            
            if (resizeHandle.includes('s')) {
                // South - resizing bottom edge
                newHeight = initialHeight + deltaY;
                newWidth = newHeight / aspectRatio; // Maintain aspect ratio
                
                // If also resizing west edge, adjust left position
                if (resizeHandle.includes('w')) {
                    newLeft = initialLeft - (newWidth - initialWidth) / 2;
                }
            } else if (resizeHandle.includes('n')) {
                // North - resizing top edge
                newHeight = initialHeight - deltaY;
                newTop = initialTop + deltaY;
                newWidth = newHeight / aspectRatio; // Maintain aspect ratio
                
                // If also resizing west edge, adjust left position
                if (resizeHandle.includes('w')) {
                    newLeft = initialLeft - (newWidth - initialWidth) / 2;
                }
            }
            
            // Apply minimum size constraints
            newWidth = Math.max(50, newWidth);
            newHeight = Math.max(25, newHeight);
            
            // Update element style
            sigElement.style.width = newWidth + 'px';
            sigElement.style.height = newHeight + 'px';
            sigElement.style.left = newLeft + 'px';
            sigElement.style.top = newTop + 'px';
            
            // Get dimensions for scaling to PDF
            const iframe = this.template.querySelector('.pdf-iframe');
            const iframeWidth = iframe ? iframe.clientWidth : 100;
            const iframeHeight = iframe ? iframe.clientHeight : 100;
            
            // Update coordinates in our tracking array
            if (this.pdfDoc) {
                const pageIndex = parseInt(sigElement.dataset.pageIndex, 10) || 0;
                const page = this.pdfDoc.getPage(pageIndex);
                const pdfWidth = page.getWidth();
                const pdfHeight = page.getHeight();
                
                // Find placement in array
                const index = this.placedSignatures.findIndex(p => p.id === placementId);
                if (index >= 0) {
                    // Calculate new relative positions
                    const relX = newLeft / iframeWidth;
                    const relY = newTop / iframeHeight;
                    const relWidth = newWidth / iframeWidth;
                    const relHeight = newHeight / iframeHeight;
                    
                    // Update placement data with new coordinates and size
                    this.placedSignatures[index].x = relX * pdfWidth;
                    this.placedSignatures[index].y = pdfHeight - (relY * pdfHeight);
                    this.placedSignatures[index].width = relWidth * pdfWidth;
                    this.placedSignatures[index].height = relHeight * pdfHeight;
                }
            }
        };
        
        const handleMouseUp = () => {
            // Remove event listeners when done resizing
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        // Add event listeners for resize
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    // Make signatures draggable
    startDragSignature(event) {
        event.preventDefault();
        const sigElement = event.currentTarget;
        const overlay = sigElement.parentElement;
        
        // Initial position
        const startX = event.clientX;
        const startY = event.clientY;
        const elementX = parseInt(sigElement.style.left) || 0;
        const elementY = parseInt(sigElement.style.top) || 0;
        
        // Track current signature ID
        const placementId = sigElement.dataset.id;
        
        const handleMouseMove = (moveEvent) => {
            moveEvent.preventDefault();
            // Calculate new position
            const deltaX = moveEvent.clientX - startX;
            const deltaY = moveEvent.clientY - startY;
            
            // Update element position
            sigElement.style.left = (elementX + deltaX) + 'px';
            sigElement.style.top = (elementY + deltaY) + 'px';
            
            // Update placement data
            const newX = parseInt(sigElement.style.left);
            const newY = parseInt(sigElement.style.top);
            
            // Get dimensions for scaling
            const iframe = this.template.querySelector('.pdf-iframe');
            const iframeWidth = iframe ? iframe.clientWidth : 100;
            const iframeHeight = iframe ? iframe.clientHeight : 100;
            
            // Update coordinates in our tracking array
            if (this.pdfDoc) {
                const pdfWidth = this.pdfDoc.getPage(0).getWidth();
                const pdfHeight = this.pdfDoc.getPage(0).getHeight();
                
                // Find placement in array
                const index = this.placedSignatures.findIndex(p => p.id === placementId);
                if (index >= 0) {
                    // Update with new coordinates (converted to PDF space)
                    const relX = newX / iframeWidth;
                    const relY = newY / iframeHeight;
                    this.placedSignatures[index].x = relX * pdfWidth;
                    this.placedSignatures[index].y = pdfHeight - (relY * pdfHeight);
                }
            }
        };
        
        const handleMouseUp = () => {
            // Remove event listeners when done dragging
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        // Add event listeners for drag
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }

    // Final save: combine PDF and upload
    async handleSavePdf() {
        if (!this.pdfDoc) {
            this.showToast('Error', 'No PDF document loaded', 'error');
            return;
        }
        
        try {
            // Check for signatures
            if (this.placedSignatures.length === 0) {
                this.showToast('Warning', 'No signature placed on the document', 'warning');
                return;
            }
            
            // Convert dataUrl to bytes for pdf-lib
            const signatureBase64 = this.signatureImage.dataUrl.split(',')[1];
            const signatureBytes = this.base64ToUint8Array(signatureBase64);
            
            // Embed the signature image in PDF
            const pngImage = await this.pdfDoc.embedPng(signatureBytes);
            
            // Group signatures by page
            const signaturesByPage = {};
            this.placedSignatures.forEach(placement => {
                const pageIndex = placement.pageIndex || 0;
                if (!signaturesByPage[pageIndex]) {
                    signaturesByPage[pageIndex] = [];
                }
                signaturesByPage[pageIndex].push(placement);
            });
            
            // Draw signatures on each page
            Object.keys(signaturesByPage).forEach(pageIndex => {
                try {
                    const pageIdx = parseInt(pageIndex, 10);
                    // Make sure the page exists in the document
                    if (pageIdx >= this.pdfDoc.getPageCount()) {
                        console.error(`Page ${pageIdx} does not exist in the document`);
                        return;
                    }
                    
                    const page = this.pdfDoc.getPage(pageIdx);
                    const { width, height } = page.getSize();
                    const isPageLandscape = width > height;
                    
                    console.log(`Processing page ${pageIdx} - Size: ${width}x${height}, Landscape: ${isPageLandscape}`);
                    
                    // Place each signature on this page
                    signaturesByPage[pageIndex].forEach(placement => {
                        try {
                            // Log placement details for debugging
                            console.log(`Placing signature at: x=${placement.x}, y=${placement.y}, w=${placement.width}, h=${placement.height}`);
                            
                            // Draw the signature with correct coordinates
                            page.drawImage(pngImage, {
                                x: placement.x,
                                y: placement.y - placement.height, // adjust for PDF coords (bottom-left origin)
                                width: placement.width,
                                height: placement.height
                            });
                            
                            // Draw identity information under signature
                            if (placement.identity) {
                                // Draw date/time with emphasis on time
                                page.drawText(placement.identity.dateTime, {
                                    x: placement.x + (placement.width / 2) - 50, // Center approximately
                                    y: placement.y - placement.height - 15, // Position below signature
                                    size: 8,
                                    color: this.PDFLib.rgb(0, 0, 0)
                                });
                                
                                // Draw user ID information
                                page.drawText('User ID: ' + this.userId, {
                                    x: placement.x + (placement.width / 2) - 40, // Center approximately
                                    y: placement.y - placement.height - 25, // Position further below
                                    size: 6,
                                    color: this.PDFLib.rgb(0.4, 0.4, 0.4)
                                });
                                
                                // Draw federation ID if it exists
                                if (this.federationId) {
                                    page.drawText('Fed ID: ' + this.federationId, {
                                        x: placement.x + (placement.width / 2) - 40, // Center approximately
                                        y: placement.y - placement.height - 35, // Position even further below
                                        size: 6,
                                        color: this.PDFLib.rgb(0.4, 0.4, 0.4)
                                    });
                                }
                            }
                        } catch (err) {
                            console.error(`Error placing signature on page ${pageIdx}:`, err);
                        }
                    });
                } catch (err) {
                    console.error(`Error processing page ${pageIndex}:`, err);
                }
            });
            
            // Save the modified PDF
            const modifiedBytes = await this.pdfDoc.save();
            
            // Convert to base64 for Apex
            const base64Data = this.arrayBufferToBase64(modifiedBytes);
            
            // Generate filename with _signed suffix
            const fileName = this.pdfFilename ? 
                this.pdfFilename.replace(/\.pdf$/i, '_signed.pdf') : 'SignedDocument.pdf';
            
            // Save to Salesforce
            const resultId = await saveSignedPdf({ 
                base64Data: base64Data, 
                fileName: fileName, 
                recordId: this.effectiveRecordId,
                isTemporary: false
            });
            
            // Delete temporary file
            if (this.contentVersionId) {
                try {
                    await deleteTemporaryPdf({ contentVersionId: this.contentVersionId });
                    console.log('Temporary PDF deleted successfully');
                } catch (deleteError) {
                    console.error('Error deleting temporary PDF:', deleteError);
                }
                this.contentVersionId = null;
            }
            
            // Trigger file download for user
            const blob = new Blob([modifiedBytes], { type: 'application/pdf' });
            const downloadUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = fileName;
            a.click();
            URL.revokeObjectURL(downloadUrl);
            
            // Show success message
            this.successMessage = 'Signed PDF saved successfully!';
            this.currentStep = 4; // completion step
        } catch (error) {
            console.error('Error saving signed PDF', error);
            this.showToast('Error', 'Error saving PDF: ' + (error.message || error), 'error');
        }
    }

    // Utility functions
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.length; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }
    
    base64ToUint8Array(base64) {
        const binaryString = atob(base64);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    // Zoom control handlers
    handleZoomIn() {
        this.zoomLevel = Math.min(this.zoomLevel + 0.25, 3.0); // Max zoom 3x
        this.applyZoom();
    }
    
    handleZoomOut() {
        this.zoomLevel = Math.max(this.zoomLevel - 0.25, 0.5); // Min zoom 0.5x
        this.applyZoom();
    }
    
    handleFitWidth() {
        this.zoomLevel = 1.0; // Reset to default
        this.applyZoom();
    }
    
    // Apply zoom level to PDF display
    applyZoom() {
        if (this.useMultiPageView) {
            // Apply zoom to each page in multi-page view
            const container = this.template.querySelector('.pdf-pages-container');
            if (container) {
                const pages = container.querySelectorAll('.pdf-page-card');
                pages.forEach(page => {
                    const baseWidth = page.dataset.baseWidth || page.offsetWidth;
                    page.dataset.baseWidth = baseWidth;
                    page.style.width = `${baseWidth * this.zoomLevel}px`;
                });
            }
        } else {
            // For iframe view, we'd need a different approach
            // This is simplified and might need adjustments
            const iframe = this.template.querySelector('.pdf-iframe');
            if (iframe) {
                iframe.style.transform = `scale(${this.zoomLevel})`;
                iframe.style.transformOrigin = 'top left';
            }
        }
    }
    
    // Render pages individually for better signature placement
    async renderPdfPagesForSigning() {
        if (!this.pdfDoc) return;
        
        try {
            const pageCount = this.pdfDoc.getPageCount();
            this.pdfPages = [];
            
            // Get container for pages
            const container = this.template.querySelector('.pdf-pages-container');
            if (!container) return;
            
            // Clear any existing content
            container.innerHTML = '';
            
            // Calculate appropriate width based on container
            const containerWidth = container.clientWidth;
            const maxPageWidth = Math.min(containerWidth - 20, 800); // Max width with some margin
            
            // Render each page
            for (let i = 0; i < pageCount; i++) {
                const page = this.pdfDoc.getPage(i);
                const { width, height } = page.getSize();
                const aspectRatio = height / width;
                const isLandscape = width > height;
                
                // Create page div with proper aspect ratio
                const pageDiv = document.createElement('div');
                pageDiv.className = 'pdf-page-card';
                pageDiv.dataset.pageIndex = i;
                pageDiv.dataset.isLandscape = isLandscape;
                // Set width based on container, adjust for density
                pageDiv.style.width = `${maxPageWidth}px`;
                
                // Create container with correct aspect ratio
                const pageContainer = document.createElement('div');
                pageContainer.className = 'pdf-page-container';
                pageContainer.style.position = 'relative';
                pageContainer.style.paddingBottom = `${aspectRatio * 100}%`;
                pageContainer.style.overflow = 'hidden';
                
                // Embed iframe for this page
                const iframe = document.createElement('iframe');
                iframe.className = 'pdf-iframe';
                
                // Add parameters to hide toolbar and fit content
                let pageSrc = this.pdfPreviewUrl;
                if (pageSrc.includes('?')) {
                    pageSrc += `&page=${i+1}&toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
                } else {
                    pageSrc += `?page=${i+1}&toolbar=0&navpanes=0&scrollbar=0&view=FitH`;
                }
                pageSrc += '#toolbar=0&view=FitH';
                
                iframe.src = pageSrc;
                iframe.style.position = 'absolute';
                iframe.style.top = '0';
                iframe.style.left = '0';
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = 'none';
                iframe.style.overflow = 'hidden';
                
                // Create overlay for placing signatures
                const overlay = document.createElement('div');
                overlay.className = 'page-overlay';
                overlay.dataset.pageIndex = i;
                overlay.style.position = 'absolute';
                overlay.style.top = '0';
                overlay.style.left = '0';
                overlay.style.width = '100%';
                overlay.style.height = '100%';
                overlay.style.zIndex = '5';
                overlay.addEventListener('dragover', this.handleDragOver.bind(this));
                overlay.addEventListener('drop', (event) => this.handleDropOnPage(event, i));
                overlay.addEventListener('dblclick', (event) => this.handleOverlayDoubleClickOnPage(event, i));
                
                // Page number indicator
                const pageNumber = document.createElement('div');
                pageNumber.className = 'page-number';
                pageNumber.textContent = `Page ${i + 1} of ${pageCount}`;
                
                // Add on-load handler to configure iframe
                iframe.onload = () => {
                    try {
                        if (iframe.contentDocument) {
                            const style = document.createElement('style');
                            style.textContent = `
                                #toolbar, #toolbarContainer, .toolbar { 
                                    display: none !important; 
                                    visibility: hidden !important;
                                    height: 0 !important;
                                    width: 0 !important;
                                    opacity: 0 !important;
                                }
                                #viewerContainer { top: 0 !important; }
                                #viewer .page { margin: 0 !important; }
                            `;
                            iframe.contentDocument.head.appendChild(style);
                            
                            // Remove toolbar elements
                            const toolbarElements = iframe.contentDocument.querySelectorAll('#toolbar, #toolbarContainer, .toolbar');
                            toolbarElements.forEach(el => el.remove());
                        }
                    } catch (e) {
                        console.error('Could not modify iframe content due to same-origin policy', e);
                    }
                };
                
                // Add elements to page container
                pageContainer.appendChild(iframe);
                pageContainer.appendChild(overlay);
                pageContainer.appendChild(pageNumber);
                
                // Add container to page div
                pageDiv.appendChild(pageContainer);
                
                // Add to container
                container.appendChild(pageDiv);
                
                // Store reference to this page
                this.pdfPages.push({
                    index: i,
                    element: pageDiv,
                    overlay: overlay,
                    width: width,
                    height: height,
                    aspectRatio: aspectRatio,
                    isLandscape: isLandscape
                });
            }
        } catch (e) {
            console.error('Error rendering PDF pages', e);
        }
    }
    
    // Handle drop on a specific page in multi-page view
    handleDropOnPage(event, pageIndex) {
        event.preventDefault();
        const overlay = event.currentTarget;
        if (!overlay) return;
        
        // Get coordinates relative to the overlay
        const rect = overlay.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        
        // Place signature at these coordinates on this page
        this.placeSignatureOnPage(offsetX, offsetY, pageIndex);
    }
    
    // Handle double-click on a specific page
    handleOverlayDoubleClickOnPage(event, pageIndex) {
        const overlay = event.currentTarget;
        if (overlay) {
            const rect = overlay.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;
            this.placeSignatureOnPage(offsetX, offsetY, pageIndex);
        }
    }
    
    // Place signature on a specific page
    placeSignatureOnPage(offsetX, offsetY, pageIndex) {
        if (!this.signatureImage) {
            console.error('No signature image available');
            return;
        }
        
        // Get the page info
        const pageInfo = this.pdfPages.find(p => p.index === pageIndex);
        if (!pageInfo) {
            console.error('Page info not found for index:', pageIndex);
            return;
        }
        
        // Get the overlay div to place signatures
        const overlay = pageInfo.overlay;
        if (!overlay) {
            console.error('Overlay div not found for page:', pageIndex);
            return;
        }
        
        // Generate unique ID for this signature placement
        const placementId = 'sig-' + Date.now() + '-' + Math.round(Math.random() * 1000);
        
        // Initial size (scaled from original) - LARGER size
        const initialWidth = Math.min(300, this.signatureImage.width * 1.5); // Make initial size larger
        const aspectRatio = this.signatureImage.height / this.signatureImage.width;
        const initialHeight = initialWidth * aspectRatio;
        
        // Create wrapper div for signature + remove button + resize handles
        const sigWrapper = document.createElement('div');
        sigWrapper.className = 'signature-placement';
        sigWrapper.dataset.id = placementId;
        sigWrapper.dataset.pageIndex = pageIndex;
        sigWrapper.style.position = 'absolute';
        sigWrapper.style.left = offsetX + 'px';
        sigWrapper.style.top = offsetY + 'px';
        sigWrapper.style.zIndex = '10';
        sigWrapper.style.width = initialWidth + 'px';
        sigWrapper.style.height = initialHeight + 'px';
        
        // Create signature image
        const sigImg = document.createElement('img');
        sigImg.src = this.signatureImage.dataUrl;
        sigImg.alt = 'Signature';
        sigImg.style.width = '100%';
        sigImg.style.height = '100%';
        sigImg.style.pointerEvents = 'none'; // Prevent image from capturing events
        
        // Get identity information
        const identity = this.getFormattedDateTimeWithIdentity();
        
        // Create date element with identity info
        const dateDiv = this.createDateElement(identity);
        
        // Create remove button - now at the top-center
        const removeBtn = document.createElement('div');
        removeBtn.innerHTML = '✖';
        removeBtn.className = 'remove-sig';
        removeBtn.style.position = 'absolute';
        removeBtn.style.top = '-10px'; // Position at top
        removeBtn.style.left = '50%'; // Center horizontally
        removeBtn.style.transform = 'translateX(-50%)'; // Center perfectly
        removeBtn.style.backgroundColor = '#f44336';
        removeBtn.style.color = 'white';
        removeBtn.style.borderRadius = '50%';
        removeBtn.style.width = '20px';
        removeBtn.style.height = '20px';
        removeBtn.style.textAlign = 'center';
        removeBtn.style.lineHeight = '20px';
        removeBtn.style.cursor = 'pointer';
        removeBtn.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        removeBtn.dataset.id = placementId;

        // Add event listener to remove button
        removeBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            const id = event.target.dataset.id;
            const sigElement = overlay.querySelector(`[data-id="${id}"]`);
            if (sigElement) {
                overlay.removeChild(sigElement);
            }
            // Also remove from our tracking array
            this.placedSignatures = this.placedSignatures.filter(sig => sig.id !== id);
        });
        
        // Add drag functionality to the signature
        sigWrapper.addEventListener('mousedown', this.startDragSignature.bind(this));
        
        // Append elements
        sigWrapper.appendChild(sigImg);
        sigWrapper.appendChild(removeBtn);
        sigWrapper.appendChild(dateDiv);
        overlay.appendChild(sigWrapper);
        
        // Get dimensions of the page overlay for scaling calculations
        const overlayWidth = overlay.clientWidth;
        const overlayHeight = overlay.clientHeight;
        
        // Calculate PDF coordinates based on page orientation
        const pdfWidth = pageInfo.width;
        const pdfHeight = pageInfo.height;
        
        // Compute relative positions as percentages
        const relativeX = offsetX / overlayWidth;
        const relativeY = offsetY / overlayHeight;
        
        // Calculate actual PDF coordinates (note PDF origin is bottom-left)
        let pdfX, pdfY;
        
        if (pageInfo.isLandscape) {
            pdfX = relativeX * pdfWidth;
            pdfY = pdfHeight - (relativeY * pdfHeight);
        } else {
            pdfX = relativeX * pdfWidth;
            pdfY = pdfHeight - (relativeY * pdfHeight);
        }
        
        // Calculate relative size
        const relativeWidth = initialWidth / overlayWidth;
        const relativeHeight = initialHeight / overlayHeight;
        
        // Store for later use when actually adding to PDF
        this.placedSignatures.push({
            id: placementId,
            pageIndex: pageIndex,
            x: pdfX,
            y: pdfY,
            width: relativeWidth * pdfWidth,
            height: relativeHeight * pdfHeight,
            element: sigWrapper,
            isLandscape: pageInfo.isLandscape,
            identity: identity // Store the identity information
        });
        
        console.log(`Placed signature on page ${pageIndex + 1} at PDF coordinates:`, pdfX, pdfY);
    }

    // Handle page navigation more aggressively to ensure the page changes
    handlePrevPage() {
        if (this.currentPageNum > 1) {
            this.currentPageNum--;
            this.navigateToPage(this.currentPageNum);
            
            // Force scale update after page change to maintain aspect ratio
            setTimeout(() => {
                this.updateContainerForCurrentPage();
            }, 300);
        }
    }
    
    handleNextPage() {
        if (this.currentPageNum < this.totalPages) {
            this.currentPageNum++;
            this.navigateToPage(this.currentPageNum);
            
            // Force scale update after page change to maintain aspect ratio
            setTimeout(() => {
                this.updateContainerForCurrentPage();
            }, 300);
        }
    }
    
    // Navigate to specific page - properly change the PDF page
    navigateToPage(pageNum) {
        this.currentPageNum = pageNum;
        
        const iframe = this.template.querySelector('.pdf-iframe');
        if (iframe) {
            try {
                // Method 1: Try to set the page through iframe source
                let baseUrl = iframe.src.split('#')[0].split('?')[0];
                let separator = baseUrl.includes('?') ? '&' : '?';
                iframe.src = `${baseUrl}${separator}page=${pageNum}&noToolbar=true&navpanes=0&scrollbar=0&statusbar=0&toolbar=0#toolbar=0&view=FitH&page=${pageNum}`;
                
                // Method 2: Try to use PDF.js navigation if available
                setTimeout(() => {
                    try {
                        if (iframe.contentWindow && iframe.contentWindow.PDFViewerApplication) {
                            iframe.contentWindow.PDFViewerApplication.page = pageNum;
                        }
                    } catch (err) {
                        console.warn('Could not navigate using PDF.js API:', err);
                    }
                    
                    // Configure iframe to hide controls when it loads
                    this.configureIframeView();
                    
                    // Update signature visibility based on current page
                    this.updateSignatureVisibility();
                }, 300);
            } catch (err) {
                console.error('Error navigating to page:', err);
            }
        }
    }
    
    // Show/hide signatures based on current page
    updateSignatureVisibility() {
        const overlay = this.template.querySelector('.pdf-overlay');
        if (!overlay) return;
        
        const currentPageIndex = this.currentPageNum - 1; // Convert to 0-based
        
        // Find all signature elements
        const allSignatures = overlay.querySelectorAll('.signature-placement');
        
        // Hide/show based on page
        allSignatures.forEach(sig => {
            const sigPageIndex = parseInt(sig.dataset.pageIndex, 10);
            
            if (sigPageIndex === currentPageIndex) {
                sig.style.display = 'block'; // Show signatures for current page
            } else {
                sig.style.display = 'none'; // Hide signatures for other pages
            }
        });
    }

    // Update container for current page dimensions
    updateContainerForCurrentPage() {
        if (!this.pdfDoc) return;
        
        try {
            const container = this.template.querySelector('.iframe-container');
            if (!container) return;
            
            const pageIndex = this.currentPageNum - 1;
            const page = this.pdfDoc.getPage(pageIndex);
            const { width, height } = page.getSize();
            const aspectRatio = (height / width) * 100;
            
            // Set container padding to maintain aspect ratio with no scrollbars
            container.style.paddingBottom = `${aspectRatio}%`;
            
            // Update landscape class
            const isLandscape = width > height;
            if (isLandscape) {
                container.classList.add('landscape');
            } else {
                container.classList.remove('landscape');
            }
            
            console.log(`Container updated for page ${pageIndex + 1}: ${width}x${height}, ratio: ${aspectRatio.toFixed(2)}%`);
            
            // Also update signature visibility
            this.updateSignatureVisibility();
        } catch (err) {
            console.error('Error updating container for current page:', err);
        }
    }

    // Handle file drag over
    handleDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        const uploadContainer = this.template.querySelector('.file-upload-container');
        if (uploadContainer && !uploadContainer.classList.contains('dragover')) {
            uploadContainer.classList.add('dragover');
        }
    }
    
    // Handle file drag leave
    handleDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        const uploadContainer = this.template.querySelector('.file-upload-container');
        if (uploadContainer) {
            uploadContainer.classList.remove('dragover');
        }
    }
    
    // Handle file drop
    handleFileDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        const uploadContainer = this.template.querySelector('.file-upload-container');
        if (uploadContainer) {
            uploadContainer.classList.remove('dragover');
        }
        const files = event.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type === 'application/pdf') {
                this.processFile(file);
            } else {
                this.showToast('Warning', 'Please upload a PDF file.', 'warning');
            }
        }
    }
    
    // Process file - common function for both drag-drop and file input
    processFile(file) {
        if (file && file.type === 'application/pdf') {
            this.isLoading = true;
            this.pdfFilename = file.name;
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const pdfBytes = reader.result;
                    const base64Data = this.arrayBufferToBase64(pdfBytes);
                    this.contentVersionId = await saveSignedPdf({ 
                        base64Data: base64Data, 
                        fileName: 'temp_' + file.name, 
                        recordId: this.effectiveRecordId,
                        isTemporary: true
                    });
                    const docUrl = await getDocumentUrl({ contentVersionId: this.contentVersionId });
                    this.pdfPreviewUrl = docUrl;
                    const uint8Array = new Uint8Array(pdfBytes);
                    this.pdfDoc = await this.PDFLib.PDFDocument.load(uint8Array);
                    await this.analyzePdfOrientation();
                    this.currentStep = 1;
                    this.updatePathClasses(); // Update path visuals
                    this.isLoading = false;
                } catch (e) {
                    console.error('processFile: PDF load error', e);
                    this.showToast('Error', 'Failed to load PDF. Please try another file.', 'error');
                    this.isLoading = false;
                }
            };
            reader.onerror = (error) => {
                console.error('processFile: FileReader error:', error);
                this.showToast('Error', 'Error reading the file.', 'error');
                this.isLoading = false;
            };
            reader.readAsArrayBuffer(file);
        } else {
            this.showToast('Warning', 'Please upload a PDF file.', 'warning');
        }
    }
    
    // Handle file input change (works for native input too)
    handleFileChange(event) {
        const file = event.target.files[0];
        if (file) {
            this.processFile(file);
        }
    }

    // Re-implement triggerFileInput to click the hidden native input
    triggerFileInput() {
        const nativeFileInput = this.template.querySelector('input[type="file"].file-input-hidden'); 
        if (nativeFileInput) {
            try {
                nativeFileInput.click();
            } catch (e) {
                console.error('Error clicking hidden native input:', e);
            }
        } else {
            console.error('Could not find native input element with selector: input[type="file"].file-input-hidden');
        }
    }

    // Handle clearing the current PDF and returning to upload step
    handleClearPdf() {
        console.log('handleClearPdf: Clearing current PDF.');

        // Reset component state
        this.pdfFilename = '';
        this.pdfPreviewUrl = '';
        this.pdfDoc = null;
        this.pdfWidth = 0;
        this.pdfHeight = 0;
        this.isPdfLandscape = false;
        this.totalPages = 1;
        this.currentPageNum = 1;
        this.signatureImage = null;
        this.placedSignatures = [];
        this.signatureText = '';
        this.signatureMode = 'draw';

        // Delete temporary ContentVersion
        if (this.contentVersionId) {
            console.log('handleClearPdf: Requesting deletion of temporary ContentVersion:', this.contentVersionId);
            deleteTemporaryPdf({ contentVersionId: this.contentVersionId })
                .then(() => {
                    console.log('handleClearPdf: Temporary PDF deleted successfully.');
                })
                .catch(error => {
                    console.error('handleClearPdf: Error deleting temporary PDF:', error);
                });
            this.contentVersionId = null; // Clear ID regardless of delete success
        }

        // Reset to step 0
        this.currentStep = 0;
        this.updatePathClasses(); // Update path visuals
        console.log('handleClearPdf: Resetting to Step 0.');
    }

    /**
     * Updates the CSS classes on the path items based on the current step.
     */
    updatePathClasses() {
        // Use setTimeout to ensure the DOM is updated after currentStep changes
        setTimeout(() => {
            // No specific classes to add/remove from path items as the CSS handles it based on step-N-mode class
            // But we can update aria attributes for accessibility
            const pathItems = this.template.querySelectorAll('.custom-path-item');
            pathItems.forEach((item) => {
                const indicator = item.querySelector('.custom-path-indicator');
                if (!indicator) return;
                
                const itemStep = parseInt(item.dataset.step, 10);
                
                // Set aria-current for the current step
                indicator.setAttribute('aria-current', itemStep === this.currentStep ? 'step' : 'false');
                
                // Set aria-label to indicate status (completed, current, or future)
                if (itemStep < this.currentStep) {
                    indicator.setAttribute('aria-label', 'Completed step');
                } else if (itemStep === this.currentStep) {
                    indicator.setAttribute('aria-label', 'Current step');
                } else {
                    indicator.setAttribute('aria-label', 'Future step');
                }
            });
            
            console.log(`Path classes updated for step: ${this.currentStep}`);
        }, 0); // setTimeout with 0ms delay defers execution until after the current stack clears
    }

    /**
     * Updates the CSS variables on the host element based on API properties.
     */
    updateThemeVariables() {
        const host = this.template.host;
        if (host) {
            host.style.setProperty('--theme-primary-color', this.primaryColor);
            host.style.setProperty('--theme-accent-color', this.accentColor);
            host.style.setProperty('--theme-primary-color-rgb', this.primaryColorRgb);
            host.style.setProperty('--theme-accent-color-rgb', this.accentColorRgb);
            console.log('Theme variables updated:', {
                primary: this.primaryColor,
                accent: this.accentColor,
                primaryRgb: this.primaryColorRgb,
                accentRgb: this.accentColorRgb
            });
        } else {
            console.error('Host element not found for setting theme variables.');
        }
    }

    // Toast notification helper
    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant // info, success, warning, error
        });
        this.dispatchEvent(evt);
    }
}