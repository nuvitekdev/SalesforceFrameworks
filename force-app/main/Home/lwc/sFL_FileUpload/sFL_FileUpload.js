import { LightningElement, api, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { FlowAttributeChangeEvent } from 'lightning/flowSupport';
import { CurrentPageReference } from 'lightning/navigation';
import { NavigationMixin } from 'lightning/navigation';

export default class SFL_FileUpload extends NavigationMixin(LightningElement) {
    @api recordId;
    @api acceptedFormats;
    @api multiple = false; // Initialize to false - default will be set in meta XML
    @api label = 'Upload Files';
    @api required = false;
    @api fileNames;
    @api uploadComplete = false;
    
    fileData = [];
    hasErrors = false;
    isLoading = false;
    isFlow = false;
    isCommunity = false;
    _pageRefInitialized = false;
    _renderedOnce = false;

    // Get current page context to determine if in a flow
    @wire(CurrentPageReference)
    pageRef(result) {
        if (result && !this._pageRefInitialized) {
            this._pageRefInitialized = true;
            try {
                // Check if we're in a flow
                this.isFlow = result.type === 'standard__flow' || 
                            (result.state && result.state.hasOwnProperty('c__flow'));
                
                // Check if we're in a community/experience site
                this.isCommunity = window.location.href.indexOf('/s/') > -1 || 
                                 window.location.href.indexOf('.site.com/') > -1 ||
                                 result.type === 'comm__namedPage';
                
                // If we're on a record page, we can get the recordId from the page reference
                if (!this.recordId && result.attributes && result.attributes.recordId) {
                    this.recordId = result.attributes.recordId;
                }
            } catch (error) {
                console.error('Error initializing from page reference:', error);
            }
        }
    }

    connectedCallback() {
        // Set initial loading state
        this.isLoading = true;
        
        // Detect if we're in an Experience/Community site via URL
        if (!this.isCommunity && window.location.href) {
            this.isCommunity = window.location.href.indexOf('/s/') > -1 || 
                              window.location.href.indexOf('.site.com/') > -1;
        }
        
        // Safety timeout to ensure component is fully initialized
        window.setTimeout(() => {
            if (this.isLoading) {
                this.isLoading = false;
            }
            
            // Special handling for Experience sites
            if (this.isCommunity && this.template.querySelector('lightning-file-upload')) {
                try {
                    // Force refresh the file uploader in community context
                    this.template.querySelector('lightning-file-upload').focus();
                } catch (error) {
                    console.error('Error initializing file uploader in community:', error);
                }
            }
        }, 2000);
    }

    get acceptedFileFormats() {
        try {
            return this.acceptedFormats ? this.acceptedFormats.split(',').map(format => format.trim()) : null;
        } catch (error) {
            console.error('Error processing acceptedFormats:', error);
            return null;
        }
    }

    get hasUploadedFiles() {
        return this.fileData && this.fileData.length > 0;
    }

    get uploadedFileNames() {
        try {
            return this.fileData && this.fileData.length ? 
                   this.fileData.map(file => file.name).join(', ') : '';
        } catch (error) {
            console.error('Error getting file names:', error);
            return '';
        }
    }

    handleUploadFinished(event) {
        try {
            this.isLoading = true;
            const files = event.detail.files || [];
            this.fileData = [...this.fileData, ...files];
            
            this.uploadComplete = true;
            this.fileNames = this.uploadedFileNames;
            
            // Only dispatch flow events if in a flow
            if (this.isFlow) {
                try {
                    // Notify the flow that files were uploaded
                    const uploadCompleteEvt = new FlowAttributeChangeEvent('uploadComplete', true);
                    this.dispatchEvent(uploadCompleteEvt);
                    
                    const fileNamesEvt = new FlowAttributeChangeEvent('fileNames', this.fileNames);
                    this.dispatchEvent(fileNamesEvt);
                } catch (flowError) {
                    console.error('Error dispatching flow events:', flowError);
                }
            }
            
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Success',
                    message: 'Files uploaded successfully',
                    variant: 'success'
                })
            );
        } catch (error) {
            console.error('Error in handleUploadFinished:', error);
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Error',
                    message: 'There was an error uploading the files',
                    variant: 'error'
                })
            );
        } finally {
            this.isLoading = false;
        }
    }

    @api
    validate() {
        if (this.required && !this.hasUploadedFiles) {
            return {
                isValid: false,
                errorMessage: 'Please upload at least one file.'
            };
        }
        return { isValid: true };
    }

    handleClearFiles() {
        try {
            this.fileData = [];
            this.uploadComplete = false;
            this.hasErrors = false;
            this.fileNames = '';
            
            // Only dispatch flow events if in a flow
            if (this.isFlow) {
                try {
                    // Notify the flow of changes
                    const uploadCompleteEvt = new FlowAttributeChangeEvent('uploadComplete', false);
                    this.dispatchEvent(uploadCompleteEvt);
                    
                    const fileNamesEvt = new FlowAttributeChangeEvent('fileNames', '');
                    this.dispatchEvent(fileNamesEvt);
                } catch (flowError) {
                    console.error('Error dispatching flow events:', flowError);
                }
            }
        } catch (error) {
            console.error('Error in handleClearFiles:', error);
        }
    }
    
    handleError(event) {
        this.hasErrors = true;
        this.isLoading = false;
        
        const errorMessage = event.detail?.message || 'An error occurred during file upload';
        console.error('File upload error:', errorMessage);
        
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Error',
                message: errorMessage,
                variant: 'error'
            })
        );
    }
    
    renderedCallback() {
        // Ensure component is properly initialized in Experience sites
        if (this.recordId && this._renderedOnce !== true) {
            this._renderedOnce = true;
            // Force refresh of file uploader if needed
            if (this.template.querySelector('lightning-file-upload')) {
                this.template.querySelector('lightning-file-upload').focus();
            }
        }
    }
} 