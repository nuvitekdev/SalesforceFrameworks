import { LightningElement, api, wire } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { NavigationMixin } from "lightning/navigation";
import getRecordFiles from "@salesforce/apex/RecordFilesController.getRecordFiles";
import deleteFile from "@salesforce/apex/RecordFilesController.deleteFile";
import shareFileWithPortal from "@salesforce/apex/RecordFilesController.shareFileWithPortal";
import { generateUrl } from 'lightning/fileDownload';
import { refreshApex } from '@salesforce/apex';
import Id from "@salesforce/user/Id";
import isGuest from "@salesforce/user/isGuest";

// Standard columns that match OOTB Files component
const getColumns = (allowDelete) => {
    const baseColumns = [
        {
            label: "Name",
            fieldName: "Title",
            type: "button",
            typeAttributes: {
                label: { fieldName: "Title" },
                variant: "base",
                name: "preview"
            },
            sortable: true,
            hideDefaultActions: true,
            wrapText: false,
            cellAttributes: { alignment: 'left' }
        },
        {
            label: "Type",
            fieldName: "FileType",
            hideDefaultActions: true,
            wrapText: false,
            cellAttributes: { alignment: 'left' }
        },
        {
            label: "Size",
            fieldName: "ContentSize",
            hideDefaultActions: true,
            wrapText: false,
            cellAttributes: { alignment: 'left' }
        },
        {
            label: "Last Modified",
            fieldName: "ContentModifiedDate",
            type: "date",
            sortable: true,
            hideDefaultActions: true,
            wrapText: false,
            cellAttributes: { alignment: 'left' }
        }
    ];

    if (allowDelete) {
        baseColumns.push({
            type: 'action',
            typeAttributes: {
                rowActions: [
                    { label: 'Download', name: 'download' },
                    { label: 'Delete', name: 'delete' }
                ]
            }
        });
    } else {
        baseColumns.push({
            type: 'action',
            typeAttributes: {
                rowActions: [
                    { label: 'Download', name: 'download' }
                ]
            }
        });
    }

    return baseColumns;
};

export default class FileDisplay extends NavigationMixin(LightningElement) {
    @api allowUpload = false;
    @api allowDelete = false;
    @api maxFilesToShow = 10; // Default to showing 10 files before scrolling
    @api primaryColor = "#22BDC1";
    @api accentColor = "#D5DF23";
    @api recordId;
    
    files = [];
    columns = [];
    defaultSortDirection = "desc";
    sortDirection = "desc";
    sortedBy = "ContentModifiedDate";
    showSpinner = false;
    showNoFilesMessage = false;
    wiredFilesResult;
    acceptedFormats = '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
    currentUserId = Id;
    isGuestUser = isGuest;
    showNoRecordError = false;
    
    // Check if running in portal context
    get isPortalContext() {
        return window.location.href.indexOf('/s/') > -1;
    }

    connectedCallback() {
        try {
            // Get record ID and validate it exists
            const effectiveRecordId = this.effectiveRecordId;
            
            // Store the effective record ID back to the API property for consistency
            if (effectiveRecordId && !this.recordId) {
                this.recordId = effectiveRecordId;
            }
            
            if (effectiveRecordId) {
                console.log('Using record ID:', effectiveRecordId, this.recordId ? '(from API property or URL)' : '(from URL detection)');
            } else {
                console.error('Record ID is missing. This component can only be used on record pages or with a specified record ID.');
                this.showNoRecordError = true;
                return;
            }
            
            // Set columns based on allowDelete property
            this.columns = getColumns(this.allowDelete);
            
            // Only hide upload buttons if allowUpload is false
            if (!this.allowUpload) {
                this.applyCssOverride();
            }
            
            // Apply custom styling based on the configured colors
            this.applyCustomStyling();
            
            // Add a small delay to ensure wired data is loaded before trying to share
            setTimeout(() => {
                if (this.files && this.files.length > 0) {
                    this.shareFilesWithPortal();
                }
            }, 2000); // 2-second delay
        } catch (error) {
            console.error('Error initializing component:', error);
        }
    }

    // Get record ID automatically, prioritizing API property then URL
    get effectiveRecordId() {
        // First check if recordId is provided via @api property
        if (this.recordId) {
            return this.recordId;
        }
        // Otherwise try to extract it from URL
        return this.getRecordIdFromUrl();
    }

    getRecordIdFromUrl() {
        try {
            const urlParams = new URL(window.location.href).searchParams;
            // Try to get recordId from URL parameters first
            let recordId = urlParams.get('recordId') || urlParams.get('id');
            
            // If not found in URL params, try to extract from the URL path
            if (!recordId) {
                const path = window.location.pathname;
                const pathParts = path.split('/');
                
                // Find a segment that looks like a Salesforce ID (15 or 18 chars, alphanumeric)
                recordId = pathParts.find(part =>
                    (part.length === 15 || part.length === 18) &&
                    /^[a-zA-Z0-9]+$/.test(part)
                );
            }
            
            return recordId || null;
        } catch (error) {
            console.error('Error getting record ID from URL:', error);
            return null;
        }
    }

    applyCssOverride() {
        const style = document.createElement('style');
        style.innerText = `
            .forceContentFileUploadButton,
            lightning-file-upload, 
            .forceContentFileMultipleUpload, 
            button[title="Upload Files"],
            [title="Upload Files"],
            .slds-file-selector,
            button.slds-button.slds-button_neutral[aria-label="Upload Files"],
            div[title="Upload Files"] {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
    }

    applyCustomStyling() {
        try {
            // Create a style element to inject custom CSS based on the configured colors
            const style = document.createElement('style');
            style.innerText = `
                .file-display-container {
                    --primary-color: ${this.primaryColor};
                    --accent-color: ${this.accentColor};
                    --primary-rgb: ${this.hexToRgb(this.primaryColor)};
                    --accent-rgb: ${this.hexToRgb(this.accentColor)};
                    --text-on-primary: ${this.getContrastColor(this.primaryColor)};
                    --text-on-accent: ${this.getContrastColor(this.accentColor)};
                    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                    padding: 1.5rem;
                    border-radius: 12px;
                    background: #ffffff;
                    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
                    transition: all 0.2s ease-in-out;
                }
                
                .file-display-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-bottom: 1rem;
                    margin-bottom: 1rem;
                    border-bottom: 1px solid #f2f2f2;
                }
                
                .file-display-container lightning-button button.slds-button_brand {
                    background-color: var(--primary-color);
                    border-color: var(--primary-color);
                    color: var(--text-on-primary);
                    border-radius: 20px;
                    padding: 0 20px;
                    height: 36px;
                    transition: all 0.2s ease-in-out;
                    font-weight: 500;
                }
                
                .file-display-container lightning-button button.slds-button_brand:hover {
                    transform: translateY(-1px);
                    box-shadow: 0 4px 8px rgba(var(--primary-rgb), 0.2);
                }
                
                .file-display-container lightning-file-upload .slds-file-selector__dropzone {
                    border-radius: 20px;
                    border: 2px dashed var(--accent-color);
                    transition: all 0.3s ease;
                }
                
                .file-display-container lightning-file-upload .slds-file-selector__dropzone:hover {
                    background-color: rgba(var(--accent-rgb), 0.05);
                }
                
                .file-display-container lightning-datatable .slds-cell-fixed {
                    background-color: rgba(var(--primary-rgb), 0.05);
                }
                
                .file-display-container lightning-datatable tbody tr {
                    transition: background-color 0.2s ease;
                }
                
                .file-display-container lightning-datatable tbody tr:hover {
                    background-color: rgba(var(--accent-rgb), 0.05);
                }
                
                .empty-state {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    padding: 3rem;
                    color: #666;
                    background: rgba(var(--primary-rgb), 0.03);
                    border-radius: 8px;
                    margin: 1rem 0;
                }
                
                .empty-state-icon {
                    width: 3rem;
                    height: 3rem;
                    margin-bottom: 1rem;
                    color: var(--primary-color);
                }
                
                @media (hover: hover) {
                    .file-display-container lightning-datatable tbody tr:hover {
                        transform: translateY(-2px);
                        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
                    }
                }
            `;
            
            // Apply the styles safely with null checking
            const styleContainer = this.template.querySelector('.file-display-styles');
            if (styleContainer) {
                styleContainer.appendChild(style);
            } else {
                // Fallback to host element if container isn't available
                this.template.host.appendChild(style);
            }
        } catch (error) {
            console.error('Error applying custom styling:', error);
            // Continue component initialization without styling if error occurs
        }
    }

    // Helper to convert hex to RGB format
    hexToRgb(hex) {
        // Remove # if present
        hex = hex.replace('#', '');
        
        // Parse the hex values to RGB
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        return `${r}, ${g}, ${b}`;
    }
    
    // Helper to determine contrasting text color (white or black) based on background color
    getContrastColor(hexColor) {
        // Remove # if present
        hexColor = hexColor.replace('#', '');
        
        // Parse hex values to RGB
        const r = parseInt(hexColor.substring(0, 2), 16);
        const g = parseInt(hexColor.substring(2, 4), 16);
        const b = parseInt(hexColor.substring(4, 6), 16);
        
        // Calculate luminance using the formula for relative luminance in sRGB space
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        // Return white for dark backgrounds, black for light backgrounds
        return luminance > 0.5 ? '#000000' : '#ffffff';
    }

    @wire(getRecordFiles, {
        recordId: "$effectiveRecordId"
    })
    wiredFiles(result) {
        this.wiredFilesResult = result;
        const { error, data } = result;
        this.showSpinner = true;
        
        if (data) {
            this.files = data.map((file) => {
                return {
                    ...file,
                    ContentSize: this.formatBytes(file.ContentSize),
                    fileUrl: generateUrl(file.ContentDocumentId)
                };
            });
            
            // Sort files by last modified date
            this.files.sort(this.sortBy('ContentModifiedDate', -1));
            
            this.showNoFilesMessage = this.files.length === 0;
            
            // If there are files, share them with portal users
            if (this.files.length > 0) {
                this.shareFilesWithPortal();
            } else {
                this.showSpinner = false;
            }
        } else if (error) {
            console.error('Error fetching files:', error);
            this.showNoFilesMessage = true;
            this.showSpinner = false;
        } else {
            this.showSpinner = false;
        }
    }

    // New method to share all files with portal users
    shareFilesWithPortal() {
        // Create a counter to track progress
        let processedCount = 0;
        const totalFiles = this.files.length;
        
        if (totalFiles === 0) {
            this.showSpinner = false;
            return;
        }
        
        // Process each file
        this.files.forEach(file => {
            if (!file.ContentDocumentId) {
                processedCount++;
                if (processedCount === totalFiles) {
                    this.showSpinner = false;
                }
                return;
            }
            
            // Call the Apex method to share the file
            shareFileWithPortal({
                contentDocumentId: file.ContentDocumentId,
                recordId: this.effectiveRecordId
            })
            .then(() => {
                processedCount++;
                
                // When all files are processed, hide spinner
                if (processedCount === totalFiles) {
                    this.showSpinner = false;
                }
            })
            .catch(error => {
                processedCount++;
                
                // Even if some fail, continue and hide spinner when all are processed
                if (processedCount === totalFiles) {
                    this.showSpinner = false;
                }
            });
        });
    }

    navigateToFilePreview(contentDocumentId) {
        // In a Portal context, just download the file instead of trying to preview
        if (this.isPortalContext) {
            const file = this.files.find(f => f.ContentDocumentId === contentDocumentId);
            if (file) {
                this.downloadFile(file);
            }
            return;
        }
        
        // For internal users, navigate to file preview page using NavigationMixin
        this[NavigationMixin.Navigate]({
            type: 'standard__namedPage',
            attributes: {
                pageName: 'filePreview'
            },
            state: {
                selectedRecordId: contentDocumentId
            }
        });
    }

    handleUploadFinished(event) {
        const uploadedFiles = event.detail.files;
        this.displayToast(
            'Success',
            `${uploadedFiles.length} file(s) uploaded successfully`,
            'success'
        );
        
        // Refresh the file list - this will also trigger sharing
        this.refreshFiles();
    }

    handleRowAction(event) {
        const action = event.detail.action;
        const row = event.detail.row;
        
        if (event.detail.action.name === 'preview') {
            // Handle file name click for preview or download in portal
            this.navigateToFilePreview(row.ContentDocumentId);
            return;
        }
        
        switch (action.name) {
            case 'download':
                this.downloadFile(row);
                break;
            case 'delete':
                this.deleteFile(row);
                break;
            default:
                break;
        }
    }

    downloadFile(file) {
        if (!file || !file.ContentDocumentId) {
            return;
        }
        
        // Use the file URL to trigger download
        window.open(file.fileUrl, '_blank');
    }

    deleteFile(file) {
        if (!file || !file.ContentDocumentId) {
            return;
        }
        
        this.showSpinner = true;
        deleteFile({ contentDocumentId: file.ContentDocumentId })
            .then(() => {
                this.displayToast('Success', 'File deleted successfully', 'success');
                this.refreshFiles();
            })
            .catch(error => {
                this.displayToast('Error', 'Unable to delete file', 'error');
                this.showSpinner = false;
            });
    }

    refreshFiles() {
        this.showSpinner = true;
        
        // First refresh the file list
        refreshApex(this.wiredFilesResult)
            .then(() => {
                // After refresh completes, share files with portal users
                if (this.files && this.files.length > 0) {
                    this.shareFilesWithPortal();
                } else {
                    this.showSpinner = false;
                }
            })
            .catch(error => {
                console.error('Error refreshing files:', error);
                this.showSpinner = false;
            });
    }

    onHandleSort(event) {
        const { fieldName: sortedBy, sortDirection } = event.detail;
        
        const cloneData = [...this.files];
        cloneData.sort(this.sortBy(sortedBy, sortDirection === 'asc' ? 1 : -1));
        this.files = cloneData;
        this.sortDirection = sortDirection;
        this.sortedBy = sortedBy;
    }

    sortBy(field, reverse, primer) {
        const key = primer
            ? function (x) {
                  return primer(x[field]);
              }
            : function (x) {
                  return x[field];
              };

        return function (a, b) {
            a = key(a);
            b = key(b);
            return reverse * ((a > b) - (b > a));
        };
    }

    displayToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(evt);
    }

    formatBytes(bytes, decimals = 1) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    handleRefreshClick() {
        this.displayToast('Refreshing', 'Refreshing files list...', 'success');
        this.refreshFiles();
    }
}