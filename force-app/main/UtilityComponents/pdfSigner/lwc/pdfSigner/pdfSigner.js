import { LightningElement, api, track, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import PDF_LIB from '@salesforce/resourceUrl/pdf_lib';
import SIGNATURE_PAD from '@salesforce/resourceUrl/signature_pad';
import SIGNATURE from '@salesforce/resourceUrl/signature';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import saveSignedPdf from '@salesforce/apex/PdfSignController.saveSignedPdf';
import getDocumentUrl from '@salesforce/apex/PdfSignController.getDocumentUrl';

export default class PdfSigner extends LightningElement {
    @api recordId;              // Id of record to relate file to (optional)
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
    
    // Getter for radio button checked states
    get isDrawChecked() { return this.signatureMode === 'draw'; }
    get isTypeChecked() { return this.signatureMode === 'type'; }

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
        // You can add code here to adjust the iframe or overlay if needed
    }

    async handleFileChange(event) {
        const file = event.target.files[0];
        if (file && file.type === 'application/pdf') {
            this.pdfFilename = file.name;
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    // Get file as ArrayBuffer
                    const pdfBytes = reader.result;
                    
                    // Convert to base64 for Apex
                    const base64Data = this.arrayBufferToBase64(pdfBytes);
                    
                    // Save temporarily to Salesforce for preview
                    this.contentVersionId = await saveSignedPdf({ 
                        base64Data: base64Data, 
                        fileName: 'temp_' + file.name, 
                        recordId: this.effectiveRecordId,
                        isTemporary: true
                    });
                    
                    console.log('Saved temporary file with ID:', this.contentVersionId);
                    
                    // Get URL for preview
                    const docUrl = await getDocumentUrl({ contentVersionId: this.contentVersionId });
                    this.pdfPreviewUrl = docUrl;
                    
                    // Also load with pdf-lib for later processing
                    const uint8Array = new Uint8Array(pdfBytes);
                    this.pdfDoc = await this.PDFLib.PDFDocument.load(uint8Array);
                    
                    this.currentStep = 1;
                } catch (e) {
                    console.error('PDF load error', e);
                    alert('Failed to load PDF. Please try another file.');
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            alert('Please upload a PDF file.');
        }
    }

    // Step navigation
    goToStep(event) {
        const step = parseInt(event.target.dataset.step, 10);
        this.currentStep = step;
        
        // Initialize canvas when entering signature step
        if (this.currentStep === 2) {
            // We'll let renderedCallback handle the initialization
            // This ensures the DOM is ready
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
        event.preventDefault(); // allow drop
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
    
    handleOverlayClick(event) {
        // Renamed but kept for compatibility - Now doesn't do anything on single click
        // Signature is only placed on double-click
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

    placeSignatureOverlay(offsetX, offsetY) {
        if (!this.signatureImage) {
            console.error('No signature image available');
            return;
        }
        
        // Get the overlay div to place signatures
        const overlay = this.template.querySelector('.pdf-overlay');
        if (!overlay) {
            console.error('Overlay div not found');
            return;
        }
        
        // Generate unique ID for this signature placement
        const placementId = 'sig-' + Date.now() + '-' + Math.round(Math.random() * 1000);
        
        // Initial size (scaled from original)
        const initialWidth = Math.min(200, this.signatureImage.width);
        const aspectRatio = this.signatureImage.height / this.signatureImage.width;
        const initialHeight = initialWidth * aspectRatio;
        
        // Create wrapper div for signature + remove button + resize handles
        const sigWrapper = document.createElement('div');
        sigWrapper.className = 'signature-placement';
        sigWrapper.dataset.id = placementId;
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
        
        // Create remove button
        const removeBtn = document.createElement('div');
        removeBtn.innerHTML = '✖';
        removeBtn.className = 'remove-sig';
        removeBtn.style.position = 'absolute';
        removeBtn.style.top = '-10px';
        removeBtn.style.right = '-10px';
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
        overlay.appendChild(sigWrapper);
        
        // Get dimensions of the iframe for scaling calculations
        const iframe = this.template.querySelector('.pdf-iframe');
        const iframeWidth = iframe ? iframe.clientWidth : 100;
        const iframeHeight = iframe ? iframe.clientHeight : 100;
        
        // Record placement data for PDF processing
        // We'll use percentages to handle different PDF sizes
        const pdfDoc = this.pdfDoc;
        if (pdfDoc) {
            const pdfWidth = pdfDoc.getPage(0).getWidth();
            const pdfHeight = pdfDoc.getPage(0).getHeight();
            
            // Compute relative positions as percentages
            const relativeX = offsetX / iframeWidth;
            const relativeY = offsetY / iframeHeight;
            
            // Calculate actual PDF coordinates (note PDF origin is bottom-left)
            const pdfX = relativeX * pdfWidth;
            const pdfY = pdfHeight - (relativeY * pdfHeight);
            
            // Calculate relative size
            const relativeWidth = initialWidth / iframeWidth;
            const relativeHeight = initialHeight / iframeHeight;
            
            // Store for later use when actually adding to PDF
            this.placedSignatures.push({
                id: placementId,
                x: pdfX,
                y: pdfY,
                width: relativeWidth * pdfWidth,
                height: relativeHeight * pdfHeight,
                element: sigWrapper
            });
            
            console.log('Placed signature at PDF coordinates:', pdfX, pdfY);
        }
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
                const pdfWidth = this.pdfDoc.getPage(0).getWidth();
                const pdfHeight = this.pdfDoc.getPage(0).getHeight();
                
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

    // Final save: combine PDF and upload
    async handleSavePdf() {
        if (!this.pdfDoc) {
            alert('No PDF document loaded');
            return;
        }
        
        try {
            // Check for signatures
            if (this.placedSignatures.length === 0) {
                alert('No signature placed on the document.');
                return;
            }
            
            // Convert dataUrl to bytes for pdf-lib
            const signatureBase64 = this.signatureImage.dataUrl.split(',')[1];
            const signatureBytes = this.base64ToUint8Array(signatureBase64);
            
            // Embed the signature image in PDF
            const pngImage = await this.pdfDoc.embedPng(signatureBytes);
            
            // Draw image on each page as per placements
            this.placedSignatures.forEach(placement => {
                try {
                    // Get page 0 (we're only supporting single page PDFs in this example)
                    const page = this.pdfDoc.getPage(0);
                    
                    // Draw the signature at calculated coordinates
                    page.drawImage(pngImage, {
                        x: placement.x,
                        y: placement.y - placement.height, // adjust for PDF coords (bottom-left origin)
                        width: placement.width,
                        height: placement.height
                    });
                } catch (err) {
                    console.error('Error placing signature:', err);
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
            alert('Error saving PDF: ' + (error.message || error));
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
}