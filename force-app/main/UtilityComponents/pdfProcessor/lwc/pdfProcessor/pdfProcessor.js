import { LightningElement, api, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Import static resources
import JSPDF_RESOURCE from '@salesforce/resourceUrl/jsPDFMin';
import SIGNATURE_PAD from '@salesforce/resourceUrl/signature_pad';
import PDFJSLIB from '@salesforce/resourceUrl/pdfjs';

// Import Apex methods
import getFileData from '@salesforce/apex/PDFProcessorController.getFileData';
import deleteFile from '@salesforce/apex/PDFProcessorController.deleteFile';

export default class PdfProcessor extends LightningElement {
    @api recordId;
    @track isLoading = false;
    @track showPreview = false;
    @track showSignatureSection = false;
    @track finalPdfGenerated = false;
    
    acceptedFormats = ['.pdf'];
    fileId;
    pdfData;
    signaturePad;
    jspdfDoc;
    pdfDocument;
    pdfPages = [];
    
    get previewStyle() {
        return this.showPreview ? 'display: block;' : 'display: none;';
    }
    
    get signatureStyle() {
        return this.showSignatureSection ? 'display: block;' : 'display: none;';
    }
    
    get downloadStyle() {
        return this.finalPdfGenerated ? 'display: block;' : 'display: none;';
    }
    
    connectedCallback() {
        console.log('PdfProcessor: Connected callback triggered');
        window.setTimeout(() => {
            this.initializeLibraries();
        }, 100);
    }
    
    async initializeLibraries() {
        console.log('PdfProcessor: Initializing libraries - START');
        this.isLoading = true;
        
        try {
            // Load jsPDF first
            console.log('PdfProcessor: Loading jsPDF');
            await loadScript(this, JSPDF_RESOURCE);
            console.log('PdfProcessor: jsPDF loaded successfully');
            
            // Then load signature pad
            console.log('PdfProcessor: Loading signature_pad');
            await loadScript(this, SIGNATURE_PAD);
            console.log('PdfProcessor: Signature Pad loaded successfully');
            
            // Finally try to load PDF.js
            console.log('PdfProcessor: Loading PDF.js');
            const pdfJsPath = PDFJSLIB + '/build/pdf.js';
            await loadScript(this, pdfJsPath);
            console.log('PdfProcessor: PDF.js loaded successfully');
            
            // Set the worker source - important!
            if (window.pdfjsLib) {
                console.log('PdfProcessor: Setting PDF.js worker path');
                // IMPORTANT: Use the fake worker to avoid cross-origin issues in LWS
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = '';
                console.log('PdfProcessor: Using fake worker for PDF.js');
            } else {
                console.error('PdfProcessor: pdfjsLib not found in window object');
            }
            
            this.isLoading = false;
            console.log('PdfProcessor: All libraries loaded successfully');
        } catch (error) {
            console.error('PdfProcessor: Error loading libraries:', error);
            this.isLoading = false;
            this.showToast('Error', 'Failed to load libraries: ' + error.message, 'error');
        }
    }
    
    handleUploadFinished(event) {
        console.log('PdfProcessor: File upload finished event triggered');
        this.isLoading = true;
        
        const uploadedFiles = event.detail.files;
        if (uploadedFiles.length > 0) {
            this.fileId = uploadedFiles[0].documentId;
            
            getFileData({ fileId: this.fileId })
                .then(result => {
                    console.log('PdfProcessor: File data retrieved successfully');
                    this.pdfData = result;
                    this.renderPdf(result);
                })
                .catch(error => {
                    console.error('PdfProcessor: Error getting file data:', error);
                    this.isLoading = false;
                    this.showToast('Error', 'Failed to process PDF: ' + error.message, 'error');
                });
        } else {
            this.isLoading = false;
        }
    }
    
    async renderPdf(base64Data) {
        console.log('PdfProcessor: Rendering PDF - START');
        try {
            const pdfContainer = this.template.querySelector('.pdf-container');
            if (!pdfContainer) {
                throw new Error('PDF container element not found in DOM');
            }
            
            // Clear container
            while (pdfContainer.firstChild) {
                pdfContainer.removeChild(pdfContainer.firstChild);
            }
            
            // Convert base64 to array buffer
            const binaryString = atob(base64Data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            
            // Load PDF document using simplier approach to avoid DataCloneError
            if (!window.pdfjsLib) {
                throw new Error('PDF.js library not loaded correctly');
            }
            
            try {
                // Use a simpler approach without storing the entire PDF document
                const loadingTask = window.pdfjsLib.getDocument({ data: bytes });
                this.pdfDocument = await loadingTask.promise;
                
                // Just get each page one at a time and render it
                const numPages = this.pdfDocument.numPages;
                console.log('PdfProcessor: PDF has', numPages, 'pages');
                
                for (let i = 1; i <= numPages; i++) {
                    // Create canvas for the page
                    const canvas = document.createElement('canvas');
                    canvas.className = 'pdf-page';
                    pdfContainer.appendChild(canvas);
                    
                    // Get the page and render it directly without storing
                    const page = await this.pdfDocument.getPage(i);
                    const viewport = page.getViewport({ scale: 1.5 });
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    
                    const renderContext = {
                        canvasContext: canvas.getContext('2d'),
                        viewport: viewport
                    };
                    
                    await page.render(renderContext).promise;
                    console.log('PdfProcessor: Page', i, 'rendered');
                    
                    // Don't store page data in this.pdfPages to avoid DataCloneError
                    // Instead, store basic info we'll need later
                    this.pdfPages.push({
                        width: viewport.width,
                        height: viewport.height,
                        pageNumber: i
                    });
                }
                
                this.showPreview = true;
                this.isLoading = false;
                console.log('PdfProcessor: PDF rendered successfully');
            } catch (pdfError) {
                console.error('PdfProcessor: Error rendering PDF:', pdfError);
                throw pdfError;
            }
        } catch (error) {
            console.error('PdfProcessor: Error in renderPdf:', error);
            this.isLoading = false;
            this.showToast('Error', 'Failed to render PDF: ' + error.message, 'error');
        }
    }
    
    initializeSignaturePad() {
        console.log('PdfProcessor: Initializing signature pad');
        const canvas = this.template.querySelector('.signature-pad');
        if (canvas && window.SignaturePad) {
            canvas.width = 500;
            canvas.height = 200;
            
            try {
                this.signaturePad = new window.SignaturePad(canvas, {
                    backgroundColor: 'rgba(255, 255, 255, 0.9)',
                    penColor: 'black'
                });
                console.log('PdfProcessor: Signature pad initialized successfully');
            } catch (sigError) {
                console.error('PdfProcessor: Error initializing signature pad:', sigError);
            }
        } else {
            console.error('PdfProcessor: Cannot initialize signature pad - canvas or library missing');
        }
    }
    
    handleAddSignature() {
        console.log('PdfProcessor: Add signature button clicked');
        this.showSignatureSection = true;
        
        // Use setTimeout to give the DOM time to update before initializing
        setTimeout(() => {
            this.initializeSignaturePad();
        }, 100);
    }
    
    handleClearSignature() {
        console.log('PdfProcessor: Clear signature button clicked');
        if (this.signaturePad) {
            this.signaturePad.clear();
            console.log('PdfProcessor: Signature cleared');
        }
    }
    
    handleApplySignature() {
        console.log('PdfProcessor: Apply signature button clicked');
        if (!this.signaturePad || this.signaturePad.isEmpty()) {
            this.showToast('Error', 'Please add a signature before applying', 'error');
            return;
        }
        
        this.isLoading = true;
        const signatureImage = this.signaturePad.toDataURL('image/png');
        this.generatePdfWithSignature(signatureImage);
    }
    
    async generatePdfWithSignature(signatureImage) {
        console.log('PdfProcessor: Generating PDF with signature');
        try {
            if (!window.jspdf) {
                throw new Error('jsPDF library not loaded correctly');
            }
            
            // Create new jsPDF instance
            const { jsPDF } = window.jspdf;
            this.jspdfDoc = new jsPDF({
                orientation: 'portrait',
                unit: 'pt'
            });
            
            // Get all canvas elements to create the PDF
            const canvases = this.template.querySelectorAll('.pdf-page');
            if (!canvases || canvases.length === 0) {
                throw new Error('No rendered PDF pages found');
            }
            
            // For each canvas (page), add it to the PDF
            for (let i = 0; i < canvases.length; i++) {
                // Add new page for all pages except the first one
                if (i > 0) {
                    this.jspdfDoc.addPage();
                }
                
                const canvas = canvases[i];
                const pageData = this.pdfPages[i];
                
                // Add the page content to jsPDF
                const pageImage = canvas.toDataURL('image/jpeg', 0.95);
                this.jspdfDoc.addImage(pageImage, 'JPEG', 0, 0, pageData.width, pageData.height);
                
                // Add signature to the last page
                if (i === canvases.length - 1) {
                    // Add signature at the bottom of the last page
                    const signatureWidth = 200;
                    const signatureHeight = 80;
                    const signatureX = (pageData.width - signatureWidth) / 2;
                    const signatureY = pageData.height - signatureHeight - 50;
                    
                    this.jspdfDoc.addImage(
                        signatureImage,
                        'PNG',
                        signatureX,
                        signatureY,
                        signatureWidth,
                        signatureHeight
                    );
                }
            }
            
            this.finalPdfGenerated = true;
            this.showSignatureSection = false;
            this.isLoading = false;
            this.showToast('Success', 'Signature added to PDF successfully', 'success');
        } catch (error) {
            console.error('PdfProcessor: Error generating PDF with signature:', error);
            this.isLoading = false;
            this.showToast('Error', 'Failed to add signature to PDF: ' + error.message, 'error');
        }
    }
    
    handleDownloadPdf() {
        console.log('PdfProcessor: Download PDF button clicked');
        if (this.jspdfDoc) {
            try {
                this.jspdfDoc.save('signed_document.pdf');
                
                // Clean up by deleting the temporary file
                if (this.fileId) {
                    deleteFile({ fileId: this.fileId })
                        .catch(error => {
                            console.error('PdfProcessor: Error deleting temporary file:', error);
                        });
                }
            } catch (saveError) {
                console.error('PdfProcessor: Error saving PDF:', saveError);
                this.showToast('Error', 'Failed to download PDF: ' + saveError.message, 'error');
            }
        } else {
            this.showToast('Error', 'No PDF document available for download', 'error');
        }
    }
    
    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(evt);
    }
}