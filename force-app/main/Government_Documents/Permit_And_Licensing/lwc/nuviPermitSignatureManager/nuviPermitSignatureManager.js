import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';

// Import APD-specific methods
import savePermitSignedDocument from '@salesforce/apex/Nuvi_Permit_SignatureController.savePermitSignedDocument';
import getPendingPermitSignatures from '@salesforce/apex/Nuvi_Permit_SignatureController.getPendingPermitSignatures';
import validatePermitSignaturePermissions from '@salesforce/apex/Nuvi_Permit_SignatureController.validatePermitSignaturePermissions';

// Import base PDF signer component functionality
import { loadScript } from 'lightning/platformResourceLoader';
import PDF_LIB from '@salesforce/resourceUrl/pdf_lib';
import SIGNATURE_PAD from '@salesforce/resourceUrl/signature_pad';

export default class NuviPermitSignatureManager extends NavigationMixin(LightningElement) {
    // API properties
    @api recordId; // APD Application ID
    @api documentType = 'INITIAL_REVIEW'; // INITIAL_REVIEW, EA_DOCUMENT, FONSI, APD_APPROVAL, OPERATOR_ACK, INSPECTION_REPORT
    @api signerRole = 'FIELD_OFFICE_MANAGER'; // FIELD_OFFICE_MANAGER, NEPA_COORDINATOR, LEAD_REVIEWER, etc.
    @api workflowStage = 'Review'; // Current workflow stage
    @api agencyType = 'DOI';
    @api permitType = 'DRILLING';
    @api primaryColor = '#22BDC1';
    @api accentColor = '#D5DF23';

    // Tracked properties
    @track currentStep = 0; // 0=validation, 1=upload, 2=review, 3=sign, 4=place, 5=complete
    @track isLoading = false;
    @track isSaving = false;
    @track errorMessage = '';
    @track successMessage = '';
    
    // APD-specific properties
    @track apdApplication;
    @track pendingSignatures = [];
    @track signatureValidation;
    @track isAuthorizedSigner = false;
    @track requiredSignatureSteps = [];
    @track documentMetadata = {};

    // PDF and signature properties
    @track pdfDoc;
    @track pdfPreviewUrl = '';
    @track signatureImage = null;
    @track placedSignatures = [];
    @track signatureMode = 'draw'; // 'draw' or 'type'
    @track signatureText = '';

    // Component state
    @track showPermissionModal = false;
    @track showDocumentPreview = false;
    @track showSignatureWizard = false;

    // Libraries loaded flag
    libsLoaded = false;

    // Getters for template conditionals
    get isStep0() { return this.currentStep === 0; }
    get isStep1() { return this.currentStep === 1; }
    get isStep2() { return this.currentStep === 2; }
    get isStep3() { return this.currentStep === 3; }
    get isStep4() { return this.currentStep === 4; }
    get isStep5() { return this.currentStep === 5; }

    get isDraw() { return this.signatureMode === 'draw'; }
    get isType() { return this.signatureMode === 'type'; }

    get hasValidationErrors() {
        return this.signatureValidation && !this.signatureValidation.isAuthorized;
    }

    get canProceedToSigning() {
        return this.isAuthorizedSigner && this.pdfDoc && this.documentType && this.signerRole;
    }

    get documentTypeLabel() {
        const labels = {
            'INITIAL_REVIEW': 'Initial APD Review',
            'EA_DOCUMENT': 'Environmental Assessment',
            'FONSI': 'Finding of No Significant Impact',
            'APD_APPROVAL': 'APD Final Approval',
            'OPERATOR_ACK': 'Operator Acknowledgment',
            'INSPECTION_REPORT': 'Inspection Report'
        };
        return labels[this.documentType] || this.documentType;
    }

    get signerRoleLabel() {
        const labels = {
            'FIELD_OFFICE_MANAGER': 'Field Office Manager',
            'NEPA_COORDINATOR': 'NEPA Coordinator',
            'LEAD_REVIEWER': 'Lead Reviewer',
            'ENVIRONMENTAL_SPECIALIST': 'Environmental Specialist',
            'AUTHORIZED_OFFICER': 'Authorized Officer',
            'OPERATOR_REPRESENTATIVE': 'Operator Representative',
            'FIELD_INSPECTOR': 'Field Inspector'
        };
        return labels[this.signerRole] || this.signerRole;
    }

    // Wire methods for data loading
    @wire(getPendingPermitSignatures, { applicationId: '$recordId', agencyType: '$agencyType', permitType: '$permitType' })
    wiredPendingSignatures(result) {
        if (result.data) {
            this.pendingSignatures = result.data;
            this.checkCurrentSignatureInQueue();
        } else if (result.error) {
            console.error('Error loading pending signatures:', result.error);
            this.showToast('Error', 'Failed to load pending signatures', 'error');
        }
    }

    // Lifecycle methods
    connectedCallback() {
        this.initializeComponent();
    }

    renderedCallback() {
        if (!this.libsLoaded) {
            this.loadSignatureLibraries();
        }
    }

    // Initialization methods
    async initializeComponent() {
        this.isLoading = true;
        try {
            await this.validateSignaturePermissions();
            if (this.isAuthorizedSigner) {
                this.currentStep = 1; // Move to upload step
            } else {
                this.currentStep = 0; // Stay on validation step
                this.showPermissionModal = true;
            }
        } catch (error) {
            console.error('Error initializing component:', error);
            this.errorMessage = 'Failed to initialize signature component';
        } finally {
            this.isLoading = false;
        }
    }

    async loadSignatureLibraries() {
        try {
            await Promise.all([
                loadScript(this, PDF_LIB),
                loadScript(this, SIGNATURE_PAD)
            ]);
            this.libsLoaded = true;
            console.log('Signature libraries loaded successfully');
        } catch (error) {
            console.error('Error loading signature libraries:', error);
            this.showToast('Error', 'Failed to load signature libraries', 'error');
        }
    }

    // Permission validation methods
    async validateSignaturePermissions() {
        try {
            const result = await validatePermitSignaturePermissions({
                applicationId: this.recordId,
                documentType: this.documentType,
                signerRole: this.signerRole,
                agencyType: this.agencyType
            });
            
            this.signatureValidation = result;
            this.isAuthorizedSigner = result.isAuthorized;
            this.requiredSignatureSteps = result.requiredSteps || [];
            
            if (!result.isAuthorized) {
                this.errorMessage = result.message;
            }
        } catch (error) {
            console.error('Error validating signature permissions:', error);
            this.errorMessage = 'Failed to validate signature permissions';
            this.isAuthorizedSigner = false;
        }
    }

    checkCurrentSignatureInQueue() {
        const currentSignature = this.pendingSignatures.find(
            sig => sig.documentType === this.documentType && sig.signerRole === this.signerRole
        );
        
        if (!currentSignature) {
            this.errorMessage = 'This signature is not currently required in the workflow';
            this.isAuthorizedSigner = false;
        }
    }

    // File handling methods
    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file && file.type === 'application/pdf') {
            this.processAPDDocument(file);
        } else {
            this.showToast('Error', 'Please select a valid PDF file', 'error');
        }
    }

    async processAPDDocument(file) {
        this.isLoading = true;
        try {
            const arrayBuffer = await this.readFileAsArrayBuffer(file);
            const uint8Array = new Uint8Array(arrayBuffer);
            
            // Load PDF with pdf-lib
            this.pdfDoc = await window.PDFLib.PDFDocument.load(uint8Array);
            
            // Create preview URL
            const blob = new Blob([arrayBuffer], { type: 'application/pdf' });
            this.pdfPreviewUrl = URL.createObjectURL(blob);
            
            // Store document metadata
            this.documentMetadata = {
                fileName: file.name,
                fileSize: file.size,
                pageCount: this.pdfDoc.getPageCount(),
                documentType: this.documentType,
                signerRole: this.signerRole
            };
            
            this.currentStep = 2; // Move to review step
        } catch (error) {
            console.error('Error processing PDF document:', error);
            this.showToast('Error', 'Failed to process PDF document', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    readFileAsArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = () => reject(reader.error);
            reader.readAsArrayBuffer(file);
        });
    }

    // Document review methods
    handleApproveDocument() {
        this.currentStep = 3; // Move to signature step
        this.showSignatureWizard = true;
    }

    handleRejectDocument() {
        this.errorMessage = 'Document rejected. Please upload a corrected version.';
        this.currentStep = 1; // Back to upload step
    }

    // Signature creation methods
    handleSignatureTypeChange(event) {
        this.signatureMode = event.detail.value;
        this.clearSignature();
    }

    handleTextSignatureChange(event) {
        this.signatureText = event.detail.value;
        if (this.isType) {
            this.renderTextSignature();
        }
    }

    clearSignature() {
        this.signatureImage = null;
        this.signatureText = '';
        // Clear signature pad if exists
        const canvas = this.template.querySelector('canvas.signature-pad');
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    renderTextSignature() {
        const canvas = this.template.querySelector('canvas.signature-pad');
        if (!canvas || !this.signatureText) return;
        
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        // Set font style for signature
        ctx.font = '48px "SignatureFont", cursive';
        ctx.fillStyle = 'black';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Draw signature text
        ctx.fillText(this.signatureText, canvas.width / 2, canvas.height / 2);
    }

    async captureSignature() {
        const canvas = this.template.querySelector('canvas.signature-pad');
        if (!canvas) {
            this.showToast('Error', 'Signature canvas not found', 'error');
            return;
        }

        // Convert canvas to image data
        const dataUrl = canvas.toDataURL('image/png');
        this.signatureImage = {
            dataUrl: dataUrl,
            width: canvas.width,
            height: canvas.height
        };

        this.currentStep = 4; // Move to placement step
    }

    // Signature placement methods
    handleSignaturePlacement(event) {
        const rect = event.currentTarget.getBoundingClientRect();
        const x = event.clientX - rect.left;
        const y = event.clientY - rect.top;
        
        this.placeSignatureAt(x, y);
    }

    placeSignatureAt(x, y) {
        if (!this.signatureImage) return;
        
        // Calculate PDF coordinates
        const pageIndex = 0; // Assuming single page for now
        const page = this.pdfDoc.getPage(pageIndex);
        const { width: pdfWidth, height: pdfHeight } = page.getSize();
        
        // Store signature placement
        const placement = {
            id: Date.now().toString(),
            pageIndex: pageIndex,
            x: (x / 800) * pdfWidth, // Assuming 800px canvas width
            y: pdfHeight - (y / 600) * pdfHeight, // PDF coords are bottom-left origin
            width: 150,
            height: 75,
            signatureData: this.signatureImage,
            documentType: this.documentType,
            signerRole: this.signerRole,
            timestamp: new Date().toISOString()
        };
        
        this.placedSignatures.push(placement);
        this.renderSignaturePlacement(placement);
    }

    renderSignaturePlacement(placement) {
        // Create visual representation of placed signature
        const overlay = this.template.querySelector('.pdf-overlay');
        if (!overlay) return;
        
        const sigElement = document.createElement('div');
        sigElement.className = 'signature-placement';
        sigElement.style.position = 'absolute';
        sigElement.style.left = (placement.x / this.pdfDoc.getPage(0).getWidth()) * 800 + 'px';
        sigElement.style.top = (1 - placement.y / this.pdfDoc.getPage(0).getHeight()) * 600 + 'px';
        sigElement.style.width = '150px';
        sigElement.style.height = '75px';
        sigElement.style.border = '2px solid #22BDC1';
        sigElement.style.backgroundColor = 'rgba(34, 189, 193, 0.1)';
        sigElement.innerHTML = `<div style="text-align: center; font-size: 12px; padding: 5px;">${this.signerRoleLabel}<br/>${new Date().toLocaleDateString()}</div>`;
        
        overlay.appendChild(sigElement);
    }

    // Final save methods
    async handleSaveSignedDocument() {
        if (this.placedSignatures.length === 0) {
            this.showToast('Warning', 'Please place your signature on the document', 'warning');
            return;
        }

        this.isSaving = true;
        try {
            // Add signatures to PDF
            const signedPdfBytes = await this.addSignaturesToPdf();
            
            // Convert to base64
            const base64Data = this.arrayBufferToBase64(signedPdfBytes);
            
            // Save through APD controller
            const result = await savePermitSignedDocument({
                base64Data: base64Data,
                fileName: this.documentMetadata.fileName,
                applicationId: this.recordId,
                documentType: this.documentType,
                signerRole: this.signerRole,
                workflowStage: this.workflowStage,
                agencyType: this.agencyType,
                permitType: this.permitType
            });

            this.successMessage = result.message;
            this.currentStep = 5; // Move to completion step

            // Refresh pending signatures
            return refreshApex(this.wiredPendingSignatures);

        } catch (error) {
            console.error('Error saving signed document:', error);
            this.showToast('Error', 'Failed to save signed document: ' + error.body?.message, 'error');
        } finally {
            this.isSaving = false;
        }
    }

    async addSignaturesToPdf() {
        // Embed signature image
        const signatureBytes = this.base64ToUint8Array(this.signatureImage.dataUrl.split(',')[1]);
        const embeddedImage = await this.pdfDoc.embedPng(signatureBytes);
        
        // Add signature to each placement
        for (const placement of this.placedSignatures) {
            const page = this.pdfDoc.getPage(placement.pageIndex);
            
            // Draw signature image
            page.drawImage(embeddedImage, {
                x: placement.x,
                y: placement.y - placement.height,
                width: placement.width,
                height: placement.height
            });
            
            // Add signature metadata
            page.drawText(`Signed by: ${this.signerRoleLabel}`, {
                x: placement.x,
                y: placement.y - placement.height - 15,
                size: 8,
                color: window.PDFLib.rgb(0, 0, 0)
            });
            
            page.drawText(`Date: ${new Date().toLocaleString()}`, {
                x: placement.x,
                y: placement.y - placement.height - 25,
                size: 8,
                color: window.PDFLib.rgb(0, 0, 0)
            });
        }
        
        return await this.pdfDoc.save();
    }

    // Navigation methods
    handlePreviousStep() {
        if (this.currentStep > 0) {
            this.currentStep--;
        }
    }

    handleNextStep() {
        if (this.currentStep < 5) {
            this.currentStep++;
        }
    }

    handleStartOver() {
        this.currentStep = 1;
        this.clearSignature();
        this.placedSignatures = [];
        this.errorMessage = '';
        this.successMessage = '';
    }

    // Modal handlers
    handleClosePermissionModal() {
        this.showPermissionModal = false;
    }

    handleCloseDocumentPreview() {
        this.showDocumentPreview = false;
    }

    handleCloseSignatureWizard() {
        this.showSignatureWizard = false;
    }

    // Utility methods
    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    base64ToUint8Array(base64) {
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }
        return bytes;
    }

    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(event);
    }

    // Navigation to record page
    navigateToAPDRecord() {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: this.recordId,
                actionName: 'view'
            }
        });
    }
}

