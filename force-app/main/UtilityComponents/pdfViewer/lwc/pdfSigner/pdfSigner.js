import { LightningElement, api, track, wire } from 'lwc';
import { loadScript, loadStyle } from 'lightning/platformResourceLoader';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Import static resources
import pdfLibResource from '@salesforce/resourceUrl/pdf_lib';
import pdfJsResource from '@salesforce/resourceUrl/pdfjs';

// Import Apex methods
import getPdfBase64 from '@salesforce/apex/PdfSignService.getPdfBase64';
import saveSignedPdf from '@salesforce/apex/PdfSignService.saveSignedPdf';
import getRelatedFiles from '@salesforce/apex/PdfSignService.getRelatedFiles';

export default class PdfSigner extends LightningElement {
    @api recordId;
    @api height = '600px';
    
    @track pdfLoaded = false;
    @track signatureMode = false;
    @track textMode = false;
    @track showSignatureModal = false;
    @track showTextModal = false;
    @track textInputValue = '';
    @track hasChanges = false;
    @track relatedFiles = [];
    @track selectedFileId;
    @track loadingPdf = false;
    @track errorMessage = '';
    
    pdfBytes;
    pdfDoc;
    pdfPages = [];
    annotations = [];
    currentPage = 0;
    clickPosition = { x: 0, y: 0, page: 0 };
    
    // Getter for handling the negation of hasChanges to fix the LWC template error
    get noChanges() {
        return !this.hasChanges;
    }
    
    // Getter for the viewer container style
    get viewerStyle() {
        return `max-height: ${this.height}`;
    }
    
    // Method to clear error messages
    clearError() {
        console.log('Clearing error message');
        this.errorMessage = '';
    }
    
    // Get related files when recordId is available
    @wire(getRelatedFiles, { recordId: '$recordId' })
    wiredFiles({ error, data }) {
        if (data) {
            console.log('Related files found:', data.length);
            this.relatedFiles = data;
        } else if (error) {
            console.error('Error fetching related files', error);
            this.errorMessage = 'Failed to fetch related files: ' + (error.body ? error.body.message : JSON.stringify(error));
        }
    }
    
    get fileOptions() {
        return this.relatedFiles.map(file => ({
            label: file.ContentDocument.Title,
            value: file.ContentDocumentId
        }));
    }
    
    connectedCallback() {
        console.log('PdfSigner initialized. Loading libraries...');
        Promise.all([
            loadScript(this, pdfLibResource),
            loadScript(this, pdfJsResource + '/build/pdf.js'),
            loadScript(this, pdfJsResource + '/build/pdf.worker.js'),
            loadStyle(this, pdfJsResource + '/web/pdf_viewer.css')
        ]).then(() => {
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = pdfJsResource + '/build/pdf.worker.js';
                window.pdfjsLib.disableWorker = false;
                console.log('PDF.js initialized with worker support');
            } else {
                console.error('PDF.js not found on window');
                this.errorMessage = 'PDF.js failed to initialize.';
            }
        }).catch(error => {
            const message = error.message || JSON.stringify(error);
            console.error('Failed to load PDF libraries:', message);
            this.errorMessage = 'Failed to load libraries: ' + message;
            this.showToast('Error', this.errorMessage, 'error');
        });
    }    
    
    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file) {
            console.log('File selected:', file.name, 'Size:', file.size, 'Type:', file.type);
            this.loadingPdf = true;
            this.errorMessage = '';
            
            const reader = new FileReader();
            reader.onload = () => {
                console.log('FileReader loaded file successfully. Data size:', reader.result.byteLength);
                const arrayBuffer = reader.result;
                const base64 = this.arrayBufferToBase64(arrayBuffer);
                console.log('Converted to base64, length:', base64.length);
                this.loadPdf(base64);
            };
            reader.onerror = (error) => {
                console.error('FileReader error:', error);
                this.loadingPdf = false;
                this.errorMessage = 'Failed to read file: ' + (error.message || 'Unknown error');
                this.showToast('Error', 'Failed to read the file.', 'error');
            };
            reader.readAsArrayBuffer(file);
        }
    }
    
    handleFileSelection(event) {
        this.selectedFileId = event.detail.value;
        console.log('Selected file ID:', this.selectedFileId);
        this.loadingPdf = true;
        this.errorMessage = '';
        
        const selectedFile = this.relatedFiles.find(
            file => file.ContentDocumentId === this.selectedFileId
        );
        
        if (selectedFile) {
            console.log('Loading file:', selectedFile.ContentDocument.Title);
            getPdfBase64({ contentVersionId: selectedFile.ContentDocumentId })
                .then(base64 => {
                    console.log('PDF retrieved from server, base64 length:', base64.length);
                    this.loadPdf(base64);
                })
                .catch(error => {
                    console.error('Error loading PDF from server', error);
                    this.loadingPdf = false;
                    this.errorMessage = 'Failed to load PDF from server: ' + (error.body ? error.body.message : JSON.stringify(error));
                    this.showToast('Error', 'Failed to load PDF file.', 'error');
                });
        }
    }
    
    loadPdf(base64) {
        console.log('Starting to load PDF, base64 length:', base64.length);
        this.pdfBytes = base64;
        this.loadingPdf = true;
        
        // Convert base64 to array buffer for PDF.js
        const binaryString = window.atob(base64);
        console.log('Converted base64 to binary string, length:', binaryString.length);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        
        console.log('Created Uint8Array, length:', bytes.length);
        console.log('PDF.js available:', typeof window.pdfjsLib !== 'undefined');
        
        // Load the PDF with PDF.js
        if (!window.pdfjsLib) {
            console.error('PDF.js library not available!');
            this.loadingPdf = false;
            this.errorMessage = 'PDF.js library not properly loaded. Please refresh the page.';
            this.showToast('Error', 'PDF viewer not properly initialized.', 'error');
            return;
        }
        
        // Create a data URL from the bytes for direct rendering
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const blobURL = URL.createObjectURL(blob);
        
        try {
            // First make sure the DOM is ready and pdfLoaded is set to show the container
            this.pdfLoaded = true;
            
            // Use a simpler approach - let browser handle PDF rendering via embed/iframe
            setTimeout(() => {
                const viewerContainer = this.template.querySelector('.pdf-viewer');
                if (!viewerContainer) {
                    console.error('Could not find PDF viewer container element!');
                    this.loadingPdf = false;
                    this.errorMessage = 'Could not initialize PDF viewer container.';
                    return;
                }
                
                // Clear any existing content
                viewerContainer.innerHTML = '';
                
                // Create an iframe or embed element to display the PDF
                const embedElement = document.createElement('embed');
                embedElement.src = blobURL;
                embedElement.type = 'application/pdf';
                embedElement.style.width = '100%';
                embedElement.style.height = '600px';
                embedElement.style.border = 'none';
                
                // Add the embed element to the container
                viewerContainer.appendChild(embedElement);
                this.loadingPdf = false;
                
                // Store the PDF data for annotations
                this.pdfDoc = {
                    numPages: 1,  // We don't know exactly, but we're not using this for page-by-page rendering now
                    url: blobURL
                };
                
                // Add a click listener for annotations
                viewerContainer.addEventListener('click', this.handleViewerClick.bind(this));
                
                console.log('PDF rendered successfully using embed element');
            }, 100);
        } catch (error) {
            console.error('Error rendering PDF:', error);
            this.loadingPdf = false;
            this.errorMessage = 'Failed to render PDF: ' + (error.message || JSON.stringify(error));
            this.showToast('Error', 'Failed to render PDF.', 'error');
        }
    }
    
    handleViewerClick(event) {
        if (this.signatureMode || this.textMode) {
            const rect = event.currentTarget.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            console.log(`Viewer clicked at position (${x}, ${y})`);
            
            // Store position for later use
            this.clickPosition = {
                x: x,
                y: y,
                page: 0  // Since we're using a single embed, we're always on "page 0"
            };
            
            if (this.signatureMode) {
                console.log('Entering signature capture mode');
                this.showSignatureModal = true;
                this.signatureMode = false;
            } else if (this.textMode) {
                console.log('Entering text input mode');
                this.showTextModal = true;
                this.textMode = false;
            }
        }
    }
    
    enterSignatureMode() {
        console.log('Entering signature mode - click on PDF to place signature');
        this.signatureMode = true;
        this.textMode = false;
    }
    
    enterTextMode() {
        console.log('Entering text mode - click on PDF to place text');
        this.textMode = true;
        this.signatureMode = false;
    }
    
    handleSignatureCapture(event) {
        const signatureData = event.detail;
        console.log('Signature captured:', signatureData.type);
        this.showSignatureModal = false;
        
        // Add signature to annotations array
        this.annotations.push({
            type: 'signature',
            data: signatureData,
            position: { ...this.clickPosition }
        });
        
        // Track the annotation for saving - visual feedback only
        this.drawAnnotationOnCanvas('signature', signatureData, this.clickPosition);
    }
    
    cancelSignatureInput() {
        console.log('Signature input cancelled');
        this.showSignatureModal = false;
    }
    
    handleTextInputChange(event) {
        this.textInputValue = event.target.value;
    }
    
    applyTextInput() {
        if (this.textInputValue) {
            console.log('Applying text input:', this.textInputValue);
            const textData = {
                text: this.textInputValue,
                font: 'Helvetica',
                size: 12
            };
            
            this.annotations.push({
                type: 'text',
                data: textData,
                position: { ...this.clickPosition }
            });
            
            // Track the annotation for saving - visual feedback only
            this.drawAnnotationOnCanvas('text', textData, this.clickPosition);
            this.showTextModal = false;
            this.textInputValue = '';
        }
    }
    
    cancelTextInput() {
        console.log('Text input cancelled');
        this.showTextModal = false;
        this.textInputValue = '';
    }
    
    drawAnnotationOnCanvas(type, data, position) {
        console.log(`Drawing ${type} annotation at position:`, position);
        
        // We're now using embed instead of canvas, so we can't draw on the PDF preview
        // Instead, just track the annotations for saving
        this.hasChanges = true;
        
        // Show a visual indicator that the annotation was added
        this.showToast('Success', `${type === 'signature' ? 'Signature' : 'Text'} added to PDF`, 'success');
    }
    
    async savePdf() {
        try {
            console.log('Starting to save PDF with annotations');
            this.showToast('Info', 'Processing PDF...', 'info');
            
            // Use pdf-lib to modify the PDF
            if (!window.PDFLib) {
                console.error('PDF-lib not available!');
                this.showToast('Error', 'PDF processing library not loaded.', 'error');
                return;
            }
            
            const { PDFDocument, rgb } = window.PDFLib;
            console.log('PDF-lib loaded, creating document');
            
            // Load the original PDF
            const arrayBuffer = this.base64ToArrayBuffer(this.pdfBytes);
            const pdfDoc = await PDFDocument.load(arrayBuffer);
            console.log('Original PDF loaded into PDF-lib');
            
            // Apply each annotation
            console.log(`Applying ${this.annotations.length} annotations`);
            
            // Since we're using a single embed element, we need to draw all annotations on page 0
            if (this.annotations.length > 0) {
                const page = pdfDoc.getPages()[0]; // Always use the first page with our simplified approach
                
                for (const annotation of this.annotations) {
                    console.log(`Processing annotation: ${annotation.type} at position:`, annotation.position);
                    
                    if (annotation.type === 'signature') {
                        // Convert data URL to Uint8Array
                        console.log('Converting signature to PNG data');
                        const signatureImg = await this.dataURLToUint8Array(annotation.data.dataUrl);
                        
                        // Embed the image
                        console.log('Embedding signature image');
                        const signatureEmbed = await pdfDoc.embedPng(signatureImg);
                        
                        // Draw the signature on the page - adjust Y coordinate based on PDF height
                        console.log('Drawing signature on PDF page');
                        page.drawImage(signatureEmbed, {
                            x: annotation.position.x,
                            y: page.getHeight() - annotation.position.y - 50, // PDF coordinate system starts from bottom-left
                            width: 150,
                            height: 50
                        });
                    } else if (annotation.type === 'text') {
                        // Draw text on the page - adjust Y coordinate based on PDF height
                        console.log('Drawing text on PDF page:', annotation.data.text);
                        page.drawText(annotation.data.text, {
                            x: annotation.position.x,
                            y: page.getHeight() - annotation.position.y,
                            size: annotation.data.size,
                            color: rgb(0, 0, 0)
                        });
                    }
                }
            }
            
            // Save the modified PDF
            console.log('Saving modified PDF');
            const modifiedPdfBytes = await pdfDoc.save();
            const base64Data = this.arrayBufferToBase64(modifiedPdfBytes);
            
            // Save to Salesforce
            console.log('Saving PDF to Salesforce');
            const fileName = 'Signed_Document.pdf';
            saveSignedPdf({
                parentId: this.recordId,
                fileName: fileName,
                base64Data: base64Data
            })
            .then(result => {
                console.log('PDF saved successfully, ContentVersion ID:', result);
                this.showToast('Success', 'PDF saved successfully.', 'success');
                this.resetComponent();
            })
            .catch(error => {
                console.error('Error saving PDF to Salesforce', error);
                this.showToast('Error', 'Failed to save PDF: ' + (error.body ? error.body.message : JSON.stringify(error)), 'error');
            });
        } catch (error) {
            console.error('Error in savePdf', error);
            this.showToast('Error', 'Failed to process and save PDF: ' + (error.message || JSON.stringify(error)), 'error');
        }
    }
    
    resetComponent() {
        console.log('Resetting component');
        
        // Revoke any object URLs created
        if (this.pdfDoc && this.pdfDoc.url) {
            URL.revokeObjectURL(this.pdfDoc.url);
        }
        
        // Clear the PDF viewer if present
        const viewerContainer = this.template.querySelector('.pdf-viewer');
        if (viewerContainer) {
            viewerContainer.innerHTML = '';
        }
        
        // Reset component state
        this.pdfLoaded = false;
        this.signatureMode = false;
        this.textMode = false;
        this.hasChanges = false;
        this.annotations = [];
        this.pdfPages = [];
        this.selectedFileId = null;
        this.loadingPdf = false;
        this.errorMessage = '';
        this.pdfDoc = null;
    }
    
    // Utility methods
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }
    
    base64ToArrayBuffer(base64) {
        const binaryString = window.atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }
    
    async dataURLToUint8Array(dataURL) {
        const base64String = dataURL.split(',')[1];
        return this.base64ToArrayBuffer(base64String);
    }
    
    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(event);
    }
} 