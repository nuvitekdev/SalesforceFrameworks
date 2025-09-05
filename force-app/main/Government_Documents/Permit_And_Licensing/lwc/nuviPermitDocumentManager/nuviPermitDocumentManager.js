import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';

// Import permit-specific methods
import getPermitFolders from '@salesforce/apex/Nuvi_Permit_DocumentController.getPermitFolders';
import getPermitFolderFiles from '@salesforce/apex/Nuvi_Permit_DocumentController.getPermitFolderFiles';
import uploadPermitFile from '@salesforce/apex/Nuvi_Permit_DocumentController.uploadPermitFile';
import createPermitFolderStructure from '@salesforce/apex/Nuvi_Permit_DocumentController.createPermitFolderStructure';
import movePermitDocument from '@salesforce/apex/Nuvi_Permit_DocumentController.movePermitDocument';

// Import base document management functionality
import deleteFile from '@salesforce/apex/FolderFilesController.deleteFile';

export default class NuviPermitDocumentManager extends NavigationMixin(LightningElement) {
    // API properties
    @api recordId; // Permit Application ID
    @api applicationType = 'Standard'; // Standard, Expedited, Emergency
    @api agencyType = 'FEDERAL'; // FEDERAL, STATE, LOCAL
    @api permitType = 'DRILLING'; // DRILLING, CONSTRUCTION, ENVIRONMENTAL
    @api workflowStage = 'Initial Submission';
    @api showUploadSection;
    @api showFolderCreation;
    @api primaryColor = '#22BDC1';
    @api accentColor = '#D5DF23';
    @api maxFileSize = 10; // MB

    // Tracked properties
    @track selectedFolder = '';
    @track selectedFiles = [];
    @track currentView = 'folders'; // 'folders' or 'files'
    @track isLoading = false;
    @track isUploading = false;
    @track uploadProgress = 0;
    @track searchTerm = '';
    @track viewMode = 'grid'; // 'grid' or 'list'
    
    // Permit-specific properties
    @track permitFolders = [];
    @track currentFolderMetadata = {};
    @track documentTypeOptions = [];
    @track selectedDocumentType = '';
    @track complianceOverview = {};
    
    // Modal states
    @track showUploadModal = false;
    @track showMoveModal = false;
    @track showDeleteConfirm = false;
    @track showComplianceModal = false;
    
    // File operations
    @track fileToDelete = null;
    @track filesToMove = [];
    @track moveTargetFolder = '';
    @track moveReason = '';

    // Wire methods
    @wire(getPermitFolders, { 
        applicationId: '$recordId', 
        agencyType: '$agencyType', 
        permitType: '$permitType' 
    })
    wiredFolders(result) {
        this.foldersResult = result;
        if (result.data) {
            this.permitFolders = result.data;
            this.updateComplianceOverview();
        } else if (result.error) {
            console.error('Error loading folders:', result.error);
            this.showToast('Error', 'Failed to load permit folders', 'error');
        }
    }

    @wire(getPermitFolderFiles, { 
        applicationId: '$recordId', 
        folderName: '$selectedFolder',
        agencyType: '$agencyType',
        permitType: '$permitType'
    })
    wiredFiles(result) {
        this.filesResult = result;
        if (result.data) {
            this.selectedFiles = result.data;
            this.updateCurrentFolderMetadata();
        } else if (result.error) {
            console.error('Error loading files:', result.error);
            this.showToast('Error', 'Failed to load folder files', 'error');
        }
    }

    // Getters for template conditionals
    get isInFolderView() { return this.currentView === 'folders'; }
    get isInFileView() { return this.currentView === 'files'; }
    get hasSelectedFolder() { return Boolean(this.selectedFolder); }
    get hasFiles() { return this.selectedFiles && this.selectedFiles.length > 0; }
    get isGridView() { return this.viewMode === 'grid'; }
    get isListView() { return this.viewMode === 'list'; }

    get filteredFiles() {
        if (!this.selectedFiles || !this.searchTerm) {
            return this.selectedFiles || [];
        }
        
        return this.selectedFiles.filter(file =>
            file.title.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
            (file.documentType && file.documentType.toLowerCase().includes(this.searchTerm.toLowerCase()))
        );
    }

    get currentFolderTitle() {
        return this.selectedFolder || 'APD Documents';
    }

    get uploadModalTitle() {
        return `Upload to ${this.selectedFolder || 'APD Documents'}`;
    }

    get canUploadToFolder() {
        return this.currentFolderMetadata && 
               (this.currentFolderMetadata.allowedFileTypes || []).length > 0;
    }

    get allowedFileTypes() {
        if (this.currentFolderMetadata && this.currentFolderMetadata.allowedFileTypes) {
            return this.currentFolderMetadata.allowedFileTypes.map(type => '.' + type.toLowerCase()).join(',');
        }
        return '.pdf,.doc,.docx,.xls,.xlsx';
    }

    get maxFileSizeBytes() {
        const folderMaxSize = this.currentFolderMetadata?.maxFileSize || this.maxFileSize;
        return folderMaxSize * 1024 * 1024; // Convert MB to bytes
    }

    get complianceOverviewItems() {
        return Object.keys(this.complianceOverview).map(key => ({
            label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
            value: this.complianceOverview[key],
            status: this.getComplianceStatus(key, this.complianceOverview[key])
        }));
    }

    get viewModeOptions() {
        return [
            { label: 'Grid View', value: 'grid' },
            { label: 'List View', value: 'list' }
        ];
    }

    // Lifecycle methods
    connectedCallback() {
        this.initializeDocumentTypes();
        // Auto-create permit folder structure when configured
        if (this.showFolderCreation && this.recordId) {
            // Best-effort; ignore errors silently in init phase
            createPermitFolderStructure({
                applicationId: this.recordId,
                agencyType: this.agencyType,
                permitType: this.permitType
            }).then(() => refreshApex(this.foldersResult)).catch(() => {});
        }
    }

    // Initialization methods
    initializeDocumentTypes() {
        this.documentTypeOptions = [
            { label: 'APD Form', value: 'APD_FORM' },
            { label: 'Lease Agreement', value: 'LEASE_AGREEMENT' },
            { label: 'Bond Documentation', value: 'BOND_DOCUMENTATION' },
            { label: 'Well Plan', value: 'WELL_PLAN' },
            { label: 'Surface Layout', value: 'SURFACE_LAYOUT' },
            { label: 'Cross Section', value: 'CROSS_SECTION' },
            { label: 'Environmental Assessment', value: 'EA_DOCUMENT' },
            { label: 'FONSI', value: 'FONSI' },
            { label: 'Cultural Survey', value: 'CULTURAL_SURVEY' },
            { label: 'Wildlife Study', value: 'WILDLIFE_STUDY' },
            { label: 'Agency Letter', value: 'AGENCY_LETTER' },
            { label: 'RFI Response', value: 'RFI_RESPONSE' },
            { label: 'Consultation', value: 'CONSULTATION' },
            { label: 'Initial Review', value: 'INITIAL_REVIEW' },
            { label: 'APD Approval', value: 'APD_APPROVAL' },
            { label: 'Operator Acknowledgment', value: 'OPERATOR_ACK' },
            { label: 'Supporting Document', value: 'REFERENCE_DOC' },
            { label: 'Additional Information', value: 'ADDITIONAL_INFO' },
            { label: 'Amendment', value: 'AMENDMENT' }
        ];
    }

    updateComplianceOverview() {
        if (!this.permitFolders) return;
        
        this.complianceOverview = {
            total_folders: this.permitFolders.length,
            required_folders: this.permitFolders.filter(f => f.metadata?.isRequired).length,
            folders_with_files: this.permitFolders.filter(f => f.fileCount > 0).length,
            total_files: this.permitFolders.reduce((sum, f) => sum + f.fileCount, 0),
            signed_documents: this.permitFolders.find(f => f.name === 'Signed_Documents')?.fileCount || 0,
            ai_processed_files: this.selectedFiles?.filter(f => f.aiAnalysisComplete).length || 0
        };
    }

    get complianceProgressPercent() {
        const req = this.complianceOverview?.required_folders || 0;
        const have = this.complianceOverview?.folders_with_files || 0;
        if (!req) return 0;
        return Math.min(100, Math.round((have / req) * 100));
    }

    updateCurrentFolderMetadata() {
        if (this.selectedFolder && this.permitFolders) {
            const folder = this.permitFolders.find(f => f.name === this.selectedFolder);
            this.currentFolderMetadata = folder?.metadata || {};
        }
    }

    // Navigation methods
    handleFolderSelect(event) {
        this.selectedFolder = event.currentTarget.dataset.folder;
        this.currentView = 'files';
    }

    handleBackToFolders() {
        this.currentView = 'folders';
        this.selectedFolder = '';
        this.searchTerm = '';
    }

    handleViewModeChange(event) {
        this.viewMode = event.detail.value;
    }

    // Search functionality
    handleSearch(event) {
        this.searchTerm = event.target.value;
    }

    handleClearSearch() {
        this.searchTerm = '';
    }

    // File upload methods
    handleUploadClick() {
        this.showUploadModal = true;
        this.selectedDocumentType = '';
    }

    handleUploadModalClose() {
        this.showUploadModal = false;
        this.resetUploadForm();
    }

    handleDocumentTypeChange(event) {
        this.selectedDocumentType = event.detail.value;
    }

    handleFileUpload(event) {
        const files = event.target.files;
        if (files.length === 0) return;

        this.validateAndUploadFiles(Array.from(files));
    }

    handleFileDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
    }

    handleFileDrop(event) {
        event.preventDefault();
        const files = Array.from(event.dataTransfer.files);
        this.validateAndUploadFiles(files);
    }

    async validateAndUploadFiles(files) {
        if (!this.selectedDocumentType) {
            this.showToast('Error', 'Please select a document type', 'error');
            return;
        }

        const validFiles = [];
        const errors = [];

        for (const file of files) {
            // Validate file size
            if (file.size > this.maxFileSizeBytes) {
                errors.push(`${file.name}: File too large (max ${this.currentFolderMetadata?.maxFileSize || this.maxFileSize}MB)`);
                continue;
            }

            // Validate file type
            const fileExtension = file.name.split('.').pop().toUpperCase();
            const allowedTypes = this.currentFolderMetadata?.allowedFileTypes || [];
            
            if (allowedTypes.length > 0 && !allowedTypes.includes(fileExtension)) {
                errors.push(`${file.name}: File type not allowed in this folder`);
                continue;
            }

            validFiles.push(file);
        }

        if (errors.length > 0) {
            this.showToast('Validation Errors', errors.join('; '), 'error');
        }

        if (validFiles.length > 0) {
            await this.uploadFiles(validFiles);
        }
    }

    async uploadFiles(files) {
        this.isUploading = true;
        this.uploadProgress = 0;

        try {
            let completed = 0;
            const total = files.length;

            for (const file of files) {
                const base64 = await this.fileToBase64(file);
                
                const uploadResult = await uploadPermitFile({
                    applicationId: this.recordId,
                    folderName: this.selectedFolder,
                    fileName: file.name,
                    base64Data: base64,
                    contentType: file.type,
                    documentType: this.selectedDocumentType,
                    workflowStage: this.workflowStage,
                    agencyType: this.agencyType,
                    permitType: this.permitType
                });

                // Show AI analysis results if available
                if (uploadResult.aiAnalysisComplete) {
                    this.showAIAnalysisResults(uploadResult);
                }

                completed++;
                this.uploadProgress = Math.round((completed / total) * 100);
            }

            this.showToast('Success', 
                `${files.length} file${files.length > 1 ? 's' : ''} uploaded successfully`, 
                'success');
            
            this.showUploadModal = false;
            this.resetUploadForm();
            
            // Refresh data
            await Promise.all([
                refreshApex(this.foldersResult),
                refreshApex(this.filesResult)
            ]);

        } catch (error) {
            console.error('Upload error:', error);
            this.showToast('Error', 'Failed to upload files: ' + error.body?.message, 'error');
        } finally {
            this.isUploading = false;
            this.uploadProgress = 0;
        }
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                resolve(base64);
            };
            reader.onerror = error => reject(error);
        });
    }

    resetUploadForm() {
        this.selectedDocumentType = '';
        this.uploadProgress = 0;
        
        // Reset file input
        const fileInput = this.template.querySelector('input[type="file"]');
        if (fileInput) {
            fileInput.value = '';
        }
    }

    // File operations
    handleFileSelect(event) {
        const fileId = event.currentTarget.dataset.fileId;
        const file = this.selectedFiles.find(f => f.id === fileId);
        const action = event.detail?.action || event.currentTarget.dataset.action;
        if (!file) return;
        if (action === 'delete') {
            this.fileToDelete = file;
            this.showDeleteConfirm = true;
        } else if (action === 'move') {
            this.filesToMove = [file];
            this.showMoveModal = true;
        } else if (action === 'view') {
            this.viewFile(file);
        } else if (action === 'ai-analysis') {
            this.showFileAIAnalysis(file);
        }
    }

    handleDeleteConfirm() {
        this.deleteSelectedFile();
    }

    handleDeleteCancel() {
        this.showDeleteConfirm = false;
        this.fileToDelete = null;
    }

    async deleteSelectedFile() {
        if (!this.fileToDelete) return;

        try {
            await deleteFile({ contentDocumentId: this.fileToDelete.contentDocumentId });
            
            this.showToast('Success', 'File deleted successfully', 'success');
            this.showDeleteConfirm = false;
            this.fileToDelete = null;

            // Refresh data
            await Promise.all([
                refreshApex(this.foldersResult),
                refreshApex(this.filesResult)
            ]);

        } catch (error) {
            console.error('Delete error:', error);
            this.showToast('Error', 'Failed to delete file: ' + error.body?.message, 'error');
        }
    }

    // Move operations
    handleMoveModalClose() {
        this.showMoveModal = false;
        this.filesToMove = [];
        this.moveTargetFolder = '';
        this.moveReason = '';
    }

    handleMoveTargetChange(event) {
        this.moveTargetFolder = event.detail.value;
    }

    handleMoveReasonChange(event) {
        this.moveReason = event.detail.value;
    }

    async handleMoveConfirm() {
        if (!this.moveTargetFolder || !this.moveReason) {
            this.showToast('Error', 'Please select target folder and provide reason', 'error');
            return;
        }

        try {
            for (const file of this.filesToMove) {
                await movePermitDocument({
                    applicationId: this.recordId,
                    contentVersionId: file.id,
                    targetFolderName: this.moveTargetFolder,
                    reason: this.moveReason,
                    agencyType: this.agencyType
                });
            }

            this.showToast('Success', 'File(s) moved successfully', 'success');
            this.handleMoveModalClose();

            // Refresh data
            await Promise.all([
                refreshApex(this.foldersResult),
                refreshApex(this.filesResult)
            ]);

        } catch (error) {
            console.error('Move error:', error);
            this.showToast('Error', 'Failed to move files: ' + error.body?.message, 'error');
        }
    }

    // File viewing
    viewFile(file) {
        this[NavigationMixin.Navigate]({
            type: 'standard__namedPage',
            attributes: {
                pageName: 'filePreview'
            },
            state: {
                selectedRecordId: file.id
            }
        });
    }

    // Compliance methods
    handleShowCompliance() {
        this.showComplianceModal = true;
    }

    handleComplianceModalClose() {
        this.showComplianceModal = false;
    }

    getComplianceStatus(key, value) {
        if (key === 'required_folders' && value === this.complianceOverview.total_folders) {
            return 'success';
        } else if (key === 'signed_documents' && value > 0) {
            return 'success';
        } else if (key === 'folders_with_files' && value < this.complianceOverview.required_folders) {
            return 'warning';
        }
        return 'neutral';
    }

    // Folder structure creation
    async handleCreateFolderStructure() {
        this.isLoading = true;
        try {
            await createPermitFolderStructure({
                applicationId: this.recordId,
                agencyType: this.agencyType,
                permitType: this.permitType
            });

            this.showToast('Success', 'APD folder structure created successfully', 'success');
            
            // Refresh folders
            await refreshApex(this.foldersResult);

        } catch (error) {
            console.error('Folder creation error:', error);
            this.showToast('Error', 'Failed to create folder structure: ' + error.body?.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    // AI Analysis Methods
    showAIAnalysisResults(uploadResult) {
        const confidence = Math.round(uploadResult.aiConfidence * 100);
        let aiMessage = `AI Analysis Complete (${confidence}% confidence)`;
        
        if (uploadResult.aiRecommendations && uploadResult.aiRecommendations.length > 0) {
            aiMessage += `\n\nRecommendations:\n• ${uploadResult.aiRecommendations.join('\n• ')}`;
        }
        
        this.showToast('AI Analysis Results', aiMessage, 'success');
        
        // Store AI results for display in file list
        if (uploadResult.extractedData) {
            this.storeAIResults(uploadResult.contentVersionId, {
                confidence: uploadResult.aiConfidence,
                recommendations: uploadResult.aiRecommendations,
                extractedData: uploadResult.extractedData
            });
        }
    }
    
    storeAIResults(fileId, aiResults) {
        // Store AI results in component state for display
        if (!this.aiResults) {
            this.aiResults = new Map();
        }
        this.aiResults.set(fileId, aiResults);
    }
    
    getAIResults(fileId) {
        return this.aiResults?.get(fileId) || null;
    }
    
    // Enhanced file operations with AI context
    handleFileSelect(event) {
        const fileId = event.currentTarget.dataset.fileId;
        const file = this.selectedFiles.find(f => f.id === fileId);
        
        if (event.detail.action === 'delete') {
            this.fileToDelete = file;
            this.showDeleteConfirm = true;
        } else if (event.detail.action === 'move') {
            this.filesToMove = [file];
            this.showMoveModal = true;
        } else if (event.detail.action === 'view') {
            this.viewFile(file);
        } else if (event.detail.action === 'ai-analysis') {
            this.showFileAIAnalysis(file);
        }
    }
    
    showFileAIAnalysis(file) {
        const aiResults = this.getAIResults(file.id);
        if (aiResults) {
            const confidence = Math.round(aiResults.confidence * 100);
            let analysisMessage = `AI Analysis for ${file.title}\n\n`;
            analysisMessage += `Confidence: ${confidence}%\n\n`;
            
            if (aiResults.recommendations) {
                analysisMessage += `Recommendations:\n• ${aiResults.recommendations.join('\n• ')}\n\n`;
            }
            
            if (aiResults.extractedData) {
                analysisMessage += 'Key Data Extracted:\n';
                Object.keys(aiResults.extractedData).forEach(key => {
                    if (aiResults.extractedData[key]) {
                        analysisMessage += `• ${key}: ${aiResults.extractedData[key]}\n`;
                    }
                });
            }
            
            this.showToast('AI Analysis Details', analysisMessage, 'info');
        } else {
            this.showToast('No AI Analysis', 'This file has not been processed with AI analysis yet.', 'warning');
        }
    }

    // Utility methods
    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(event);
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDate(dateString) {
        if (!dateString) return '';
        return new Date(dateString).toLocaleDateString();
    }
}