import { LightningElement, api, track, wire } from 'lwc';
import { CurrentPageReference } from 'lightning/navigation';
import PDF_LIB from '@salesforce/resourceUrl/pdf_lib';
import SIGNATURE_PAD from '@salesforce/resourceUrl/signature_pad';
import SIGNATURE from '@salesforce/resourceUrl/signature';
import { loadScript } from 'lightning/platformResourceLoader';
import saveSignedPdf from '@salesforce/apex/PdfSignController.saveSignedPdf';

export default class PdfSigner extends LightningElement {
    @api recordId;              // Id of record to relate file to (optional)
    @track currentStep = 0;     // 0 = upload, 1 = preview, 2 = sign, 3 = place
    @track pagePreviews = [];   // {pageNumber, url, width, height} for each page image
    @track signatureMode = 'draw';  // 'draw' or 'type'
    @track modeOptions = [
        { label: 'Draw Signature', value: 'draw' },
        { label: 'Type Signature', value: 'type' }
    ];
    @track successMessage = '';
    
    @wire(CurrentPageReference) pageRef;
    
    pdfDoc;                    // PDFDocument instance from pdf-lib
    PDFLib;                    // reference to pdf-lib global
    signaturePad;              // SignaturePad instance for drawing
    signatureImage = null;     // { dataUrl, width, height } of captured signature
    placedSignatures = [];     // Array of placed signatures: { page, x, y }
    pdfFilename = '';          // original PDF file name
    libsLoaded = false;        // Track if libraries are loaded
    pdfBytes;                  // Raw PDF bytes for rendering

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

    // Added getter methods for styling
    get pageContainerStyle() {
        return `max-width: 280px; height: auto; margin: 0.5rem;`;
    }

    get pdfObjectStyle() {
        return `width: 100%; height: 400px; background-color: white;`;
    }

    renderedCallback() {
        // Load static resources once
        if (!this.libsLoaded) {
            this.libsLoaded = true;
            Promise.all([
                loadScript(this, PDF_LIB),
                loadScript(this, SIGNATURE_PAD)
            ]).then(() => {
                // Save references to globals
                this.PDFLib = window.PDFLib;
                console.log('Libraries loaded successfully');
            }).catch(error => {
                console.error('Error loading libraries', error);
            });
        }
        
        // Initialize signature components when on signature step
        if (this.currentStep === 2) {
            // Initialize drawing pad
            if (this.signatureMode === 'draw') {
                const canvas = this.template.querySelector('canvas.sig-pad');
                if (canvas) {
                    // Set canvas dimensions if needed
                    if (canvas.width !== canvas.offsetWidth) {
                        canvas.width = canvas.offsetWidth;
                    }
                    
                    // Initialize or reset signature pad
                    if (!this.signaturePad) {
                        console.log('Initializing signature pad');
                        this.signaturePad = new window.SignaturePad(canvas, {
                            minWidth: 0.5, 
                            maxWidth: 2, 
                            penColor: 'black',
                            backgroundColor: 'white'
                        });
                    } else {
                        // Recreate to ensure it's working properly
                        this.signaturePad.clear();
                    }
                }
            }
            
            // Initialize type signature canvas
            if (this.signatureMode === 'type') {
                const canvas = this.template.querySelector('canvas.sig-type');
                if (canvas) {
                    // Set canvas dimensions if needed
                    if (canvas.width !== canvas.offsetWidth) {
                        canvas.width = canvas.offsetWidth;
                    }
                    
                    // Clear canvas for typing
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    
                    // If there's existing text, render it
                    const inputField = this.template.querySelector('[data-id="typedInput"]');
                    if (inputField && inputField.value) {
                        this.handleTypeInput({ target: { value: inputField.value } });
                    }
                }
            }
        }
    }

    handleFileChange(event) {
        const file = event.target.files[0];
        if (file && file.type === 'application/pdf') {
            this.pdfFilename = file.name;
            const reader = new FileReader();
            reader.onload = async () => {
                try {
                    const pdfBytes = new Uint8Array(reader.result);
                    // Load PDF document using pdf-lib
                    this.pdfDoc = await this.PDFLib.PDFDocument.load(pdfBytes);
                    // Prepare page previews
                    await this.preparePagePreviews();
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

    async preparePagePreviews() {
        this.pagePreviews = [];
        const totalPages = this.pdfDoc.getPageCount();
        console.log('Total PDF pages:', totalPages);
        
        // Save pdfBytes for later use
        this.pdfBytes = await this.pdfDoc.save();
        
        // Generate preview images for each page using canvas
        for (let i = 0; i < totalPages; i++) {
            const page = this.pdfDoc.getPage(i);
            const width = page.getWidth();
            const height = page.getHeight();
            
            try {
                // Create a data URL by rendering to canvas
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                
                // Clear canvas with white background
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, width, height);
                
                // Draw page number as placeholder (will be replaced with actual content when viewed)
                ctx.fillStyle = '#666666';
                ctx.font = '18px Arial';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(`Page ${i+1} (Loading Preview...)`, width/2, height/2);
                
                const pagePreview = canvas.toDataURL('image/png');
                
                // Add to page previews
                this.pagePreviews.push({
                    pageNumber: i+1,
                    url: pagePreview,
                    canvas: canvas,
                    width,
                    height
                });
            } catch (error) {
                console.error('Error creating preview for page', i+1, error);
                // Add a placeholder for failed pages
                const placeholderImage = this.createPlaceholderImage(width, height, i+1);
                this.pagePreviews.push({
                    pageNumber: i+1,
                    url: placeholderImage,
                    width,
                    height
                });
            }
        }
        
        // Schedule rendering of actual page contents
        requestAnimationFrame(() => {
            this.renderPageContents();
        });
    }
    
    // Render actual PDF page contents to canvas after initial preview is shown
    async renderPageContents() {
        if (!this.pdfBytes || !this.pagePreviews.length) return;
        
        for (let i = 0; i < this.pagePreviews.length; i++) {
            const pageData = this.pagePreviews[i];
            const canvas = pageData.canvas;
            if (!canvas) continue;
            
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            
            // Draw page contents (simplified version - just the page number)
            ctx.fillStyle = '#000000';
            ctx.font = '16px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`Page ${pageData.pageNumber}`, canvas.width/2, canvas.height/2);
            
            // Update the preview image
            this.pagePreviews[i].url = canvas.toDataURL('image/png');
        }
        
        // Force reactivity update
        this.pagePreviews = [...this.pagePreviews];
    }
    
    createPlaceholderImage(width, height, pageNum) {
        // Create a simple SVG placeholder for a PDF page
        return `data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}' viewBox='0 0 ${width} ${height}'%3E%3Crect fill='%23f0f0f0' width='${width}' height='${height}'/%3E%3Ctext fill='%23999' font-family='sans-serif' font-size='14' x='50%25' y='50%25' text-anchor='middle'%3EPage ${pageNum}%3C/text%3E%3C/svg%3E`;
    }

    // Step navigation
    goToStep(event) {
        const step = parseInt(event.target.dataset.step, 10);
        
        // Don't allow advancing to signature placement without a signature
        if (step === 3 && !this.signatureImage) {
            alert('Please create a signature first.');
            return;
        }
        
        this.currentStep = step;
        
        // Update path styling
        const pathItems = this.template.querySelectorAll('.slds-path__item');
        if (pathItems && pathItems.length) {
            pathItems.forEach((item, index) => {
                // Remove all classes first
                item.classList.remove('slds-is-complete');
                item.classList.remove('slds-is-current');
                item.classList.remove('slds-is-active');
                
                // Add appropriate class based on current step
                if (index < step) {
                    item.classList.add('slds-is-complete');
                } else if (index === step) {
                    item.classList.add('slds-is-current');
                    item.classList.add('slds-is-active');
                }
                
                // Update aria-selected attribute
                const link = item.querySelector('a');
                if (link) {
                    link.setAttribute('aria-selected', index === step ? 'true' : 'false');
                    link.setAttribute('tabindex', index === step ? '0' : '-1');
                }
            });
        }
    }
    
    switchSigMode(event) {
        this.signatureMode = event.detail.value;
        
        // Need to re-initialize the appropriate signature pad after switching modes
        setTimeout(() => {
            if (this.signatureMode === 'draw') {
                const canvas = this.template.querySelector('canvas.sig-pad');
                if (canvas) {
                    // Reinitialize the signature pad for drawing
                    this.signaturePad = new window.SignaturePad(canvas, {
                        minWidth: 0.5, 
                        maxWidth: 2, 
                        penColor: 'black'
                    });
                }
            } else if (this.signatureMode === 'type') {
                const canvas = this.template.querySelector('canvas.sig-type');
                if (canvas) {
                    // Clear the type canvas
                    const ctx = canvas.getContext('2d');
                    ctx.fillStyle = 'white';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
            }
        }, 100);
    }

    handleClearSignature() {
        if (this.signatureMode === 'draw') {
            // Clear the signature pad
            if (this.signaturePad) {
                this.signaturePad.clear();
            }
        } else if (this.signatureMode === 'type') {
            // Clear the typed input and canvas
            const inputField = this.template.querySelector('[data-id="typedInput"]');
            if (inputField) {
                inputField.value = '';
            }
            
            const canvas = this.template.querySelector('canvas.sig-type');
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        }
    }

    handleTypeInput(event) {
        const text = event.target.value;
        if (!text) return;
        
        const canvas = this.template.querySelector('canvas.sig-type');
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        // Clear the canvas
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw the text in a cursive font
        ctx.fillStyle = 'black';
        ctx.font = '40px cursive';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);
    }

    handleSignatureSubmit() {
        // Get signature from canvas based on current mode
        let signatureDataUrl;
        let signatureWidth = 300;
        let signatureHeight = 150;
        
        if (this.signatureMode === 'draw') {
            const canvas = this.template.querySelector('canvas.sig-pad');
            if (!canvas || !this.signaturePad || this.signaturePad.isEmpty()) {
                alert('Please draw your signature first.');
                return;
            }
            signatureDataUrl = this.signaturePad.toDataURL();
            signatureWidth = canvas.width;
            signatureHeight = canvas.height;
        } else if (this.signatureMode === 'type') {
            const canvas = this.template.querySelector('canvas.sig-type');
            const input = this.template.querySelector('[data-id="typedInput"]');
            if (!canvas || !input || !input.value.trim()) {
                alert('Please type your signature first.');
                return;
            }
            signatureDataUrl = canvas.toDataURL();
            signatureWidth = canvas.width;
            signatureHeight = canvas.height;
        }
        
        if (!signatureDataUrl) {
            alert('Failed to capture signature. Please try again.');
            return;
        }
        
        // Store signature image data
        this.signatureImage = {
            dataUrl: signatureDataUrl,
            width: signatureWidth,
            height: signatureHeight
        };
        
        // Navigate to next step
        this.currentStep = 3;
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
        const pageIndex = event.currentTarget.dataset.pageIndex;
        if (!pageIndex) return;
        // Only proceed if our signature was dropped
        const data = event.dataTransfer.getData('text/plain');
        if (data !== 'signature') return;
        const rect = event.currentTarget.getBoundingClientRect();
        const offsetX = event.clientX - rect.left;
        const offsetY = event.clientY - rect.top;
        this.placeSignaturePreview(pageIndex, offsetX, offsetY);
    }
    
    handlePageClick(event) {
        // Optionally allow placing by click
        const pageIndex = event.currentTarget.dataset.pageIndex;
        if (pageIndex && this.signatureImage) {
            const rect = event.currentTarget.getBoundingClientRect();
            const offsetX = event.clientX - rect.left;
            const offsetY = event.clientY - rect.top;
            this.placeSignaturePreview(pageIndex, offsetX, offsetY);
        }
    }

    placeSignaturePreview(pageNumber, offsetX, offsetY) {
        if (!this.signatureImage) {
            console.error('No signature image available');
            return;
        }
        
        // Get the drop zone for this page
        const pageContainer = this.template.querySelector(`.page-drop-layer[data-page-index="${pageNumber}"]`);
        if (!pageContainer) {
            console.error('Page container not found', pageNumber);
            return;
        }
        
        // Create signature preview element
        const id = `sig-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const signatureDiv = document.createElement('div');
        signatureDiv.className = 'placed-signature';
        signatureDiv.id = id;
        signatureDiv.dataset.pageNumber = pageNumber;
        
        // Calculate position (make sure signature is centered on the drop point)
        const signatureWidth = 150;  // Fixed width for preview
        const origWidth = this.signatureImage.width;
        const origHeight = this.signatureImage.height;
        const aspectRatio = origHeight / origWidth;
        const signatureHeight = Math.round(signatureWidth * aspectRatio);
        
        // Position signature div (centered on the mouse position)
        const xPos = Math.max(0, offsetX - (signatureWidth / 2));
        const yPos = Math.max(0, offsetY - (signatureHeight / 2));
        
        // Set signature style and position
        signatureDiv.style.width = `${signatureWidth}px`;
        signatureDiv.style.height = `${signatureHeight}px`;
        signatureDiv.style.top = `${yPos}px`;
        signatureDiv.style.left = `${xPos}px`;
        
        // Create remove button
        const removeBtn = document.createElement('div');
        removeBtn.className = 'remove-signature';
        removeBtn.textContent = '×';
        removeBtn.dataset.id = id;
        removeBtn.title = 'Remove signature';
        
        // Add event listener to remove button
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const sigId = e.target.dataset.id;
            const sigElement = document.getElementById(sigId);
            if (sigElement) {
                sigElement.remove();
                
                // Also remove from tracked placed signatures
                this.placedSignatures = this.placedSignatures.filter(sig => sig.id !== sigId);
            }
        });
        
        // Create signature image
        const img = document.createElement('img');
        img.src = this.signatureImage.dataUrl;
        img.alt = 'Signature';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'contain';
        
        // Add drag functionality
        signatureDiv.addEventListener('mousedown', this.handleDragSignatureStart.bind(this));
        
        // Append elements
        signatureDiv.appendChild(img);
        signatureDiv.appendChild(removeBtn);
        pageContainer.appendChild(signatureDiv);
        
        // Track this signature for PDF generation
        this.placedSignatures.push({
            id,
            page: pageNumber,
            x: xPos,
            y: yPos,
            width: signatureWidth,
            height: signatureHeight
        });
    }
    
    // Enable dragging placed signatures to reposition
    handleDragSignatureStart(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const signatureDiv = event.currentTarget;
        const pageContainer = signatureDiv.parentElement;
        let startX = event.clientX;
        let startY = event.clientY;
        let startLeft = parseInt(signatureDiv.style.left, 10) || 0;
        let startTop = parseInt(signatureDiv.style.top, 10) || 0;
        
        const handleDragMove = (moveEvent) => {
            moveEvent.preventDefault();
            
            // Calculate new position
            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            const newLeft = Math.max(0, startLeft + dx);
            const newTop = Math.max(0, startTop + dy);
            
            // Limit to container bounds
            const maxLeft = pageContainer.offsetWidth - signatureDiv.offsetWidth;
            const maxTop = pageContainer.offsetHeight - signatureDiv.offsetHeight;
            signatureDiv.style.left = `${Math.min(newLeft, maxLeft)}px`;
            signatureDiv.style.top = `${Math.min(newTop, maxTop)}px`;
            
            // Update tracked placement
            const sigId = signatureDiv.id;
            const placedIndex = this.placedSignatures.findIndex(sig => sig.id === sigId);
            if (placedIndex >= 0) {
                this.placedSignatures[placedIndex].x = parseInt(signatureDiv.style.left, 10);
                this.placedSignatures[placedIndex].y = parseInt(signatureDiv.style.top, 10);
            }
        };
        
        const handleDragEnd = () => {
            document.removeEventListener('mousemove', handleDragMove);
            document.removeEventListener('mouseup', handleDragEnd);
        };
        
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
    }

    // Final save: combine PDF and upload
    async handleSavePdf() {
        if (!this.pdfDoc) {
            alert('No PDF document loaded');
            return;
        }
        
        try {
            // Embed the signature image in the PDF only if at least one placement
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
                    const pageIndex = placement.page - 1;
                    if (pageIndex < 0 || pageIndex >= this.pdfDoc.getPageCount()) {
                        console.error('Invalid page index:', pageIndex);
                        return;
                    }
                    
                    const page = this.pdfDoc.getPage(pageIndex);
                    const pageWidth = page.getWidth();
                    const pageHeight = page.getHeight();
                    
                    // Get placement information
                    const containerWidth = 280; // Width of our preview container
                    const containerHeight = 400; // Height of our preview container
                    
                    // Calculate scale factors to convert from screen coordinates to PDF points
                    const scaleX = pageWidth / containerWidth;
                    const scaleY = pageHeight / containerHeight;
                    
                    // Calculate scaled dimensions for signature
                    const sigWidth = placement.width * scaleX;
                    const sigHeight = placement.height * scaleY;
                    
                    // Convert screen coordinates to PDF coordinates
                    // Note: PDF coordinates start from bottom-left, while screen coordinates start from top-left
                    const pdfX = placement.x * scaleX;
                    const pdfY = pageHeight - ((placement.y + placement.height) * scaleY);
                    
                    console.log(`Placing signature on page ${placement.page} at PDF coords (${pdfX}, ${pdfY})`);
                    
                    // Draw the signature on the PDF
                    page.drawImage(pngImage, {
                        x: pdfX,
                        y: pdfY,
                        width: sigWidth,
                        height: sigHeight
                    });
                } catch (err) {
                    console.error('Error placing signature on page:', err);
                }
            });
            
            // Save the modified PDF
            const modifiedBytes = await this.pdfDoc.save();
            
            // Convert to base64 for Apex
            const base64Data = this.arrayBufferToBase64(modifiedBytes);
            
            // Generate filename with _signed suffix
            const fileName = this.pdfFilename ? 
                this.pdfFilename.replace(/\.pdf$/i, '_signed.pdf') : 'SignedDocument.pdf';
            
            // Use the effective record ID when saving
            const finalRecordId = this.effectiveRecordId;
            console.log('Saving with record ID:', finalRecordId);
            
            // Save to Salesforce with error handling
            try {
                const resultId = await saveSignedPdf({ 
                    base64Data: base64Data, 
                    fileName: fileName, 
                    recordId: finalRecordId 
                });
                
                console.log('PDF saved successfully with ID:', resultId);
                
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
            } catch (saveError) {
                console.error('Server error saving PDF:', saveError);
                let errorMessage = 'Error saving PDF to Salesforce: ';
                
                if (saveError.body && saveError.body.message) {
                    errorMessage += saveError.body.message;
                } else if (saveError.message) {
                    errorMessage += saveError.message;
                } else {
                    errorMessage += 'Unknown server error. Please check if the record exists and you have permissions.';
                }
                
                alert(errorMessage);
                
                // Still allow downloading even if server save failed
                try {
                    const blob = new Blob([modifiedBytes], { type: 'application/pdf' });
                    const downloadUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = downloadUrl;
                    a.download = fileName;
                    a.click();
                    URL.revokeObjectURL(downloadUrl);
                    alert('PDF downloaded locally, but could not be saved to Salesforce.');
                } catch (downloadError) {
                    console.error('Error downloading PDF:', downloadError);
                    alert('Could not download PDF: ' + downloadError.message);
                }
            }
        } catch (error) {
            console.error('Error processing signed PDF', error);
            alert('Error processing PDF: ' + (error.message || error));
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