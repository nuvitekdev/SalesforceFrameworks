import { LightningElement, api, wire, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import { generateUrl } from 'lightning/fileDownload';

// Apex methods
import getFolderFiles from '@salesforce/apex/FolderFilesController.getFolderFiles';
import getFolders from '@salesforce/apex/FolderFilesController.getFolders';
import uploadFileToFolder from '@salesforce/apex/FolderFilesController.uploadFileToFolder';
import deleteFile from '@salesforce/apex/FolderFilesController.deleteFile';
import getPredefinedFolders from '@salesforce/apex/FolderFilesController.getPredefinedFolders';

// Folder columns for datatable
const folderColumns = [
    {
        label: 'Folder Name',
        fieldName: 'displayName',
        type: 'button',
        typeAttributes: {
            label: { fieldName: 'displayName' },
            variant: 'base',
            iconName: 'standard:folder',
            iconPosition: 'left',
            iconAlternativeText: 'Folder',
            name: 'open_folder'
        },
        sortable: true,
        cellAttributes: { 
            alignment: 'left',
            class: 'folder-name-cell'
        }
    },
    {
        label: 'Path',
        fieldName: 'fullPath',
        type: 'text',
        sortable: true,
        cellAttributes: { alignment: 'left' }
    },
    {
        label: 'Files',
        fieldName: 'fileCount',
        type: 'number',
        sortable: true,
        initialWidth: 100,
        cellAttributes: { alignment: 'center' }
    }
];

export default class FolderFileManager extends NavigationMixin(LightningElement) {
    @api allowDelete = false;
    @api maxItemsToShow = 10;
    @api title = 'File Manager';
    @api folderStructureMetadata = 'Default_Structure'; // The name of the custom metadata record
    @api recordId; // Record ID to associate files with
    @api primaryColor = "#22BDC1";
    @api accentColor = "#D5DF23";
    @api standaloneMode = false; // Whether to operate in standalone mode without a record ID
    
    // Internal property to store the folder structure
    @track folderStructure = [];

    @track folders = [];
    @track files = [];
    @track currentFolderPath = '';
    @track folderHierarchy = [];
    @track showFolders = true;
    @track showFiles = false;
    @track searchTerm = '';
    @track isLoading = false;
    @track showUploadFileModal = false;
    @track sortedBy = 'displayName';
    @track sortDirection = 'asc';
    @track breadcrumbs = [];
    @track noFoldersMessage = false;
    @track noFilesMessage = false;
    @track showNoRecordError = false;
    
    folderColumns = folderColumns;
    wiredFilesResult;
    
    // For file upload
    fileData;
    fileName = '';
    acceptedFormats = '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
    
    /**
     * Returns whether the upload button should be disabled
     * @return {Boolean} True if file upload should be disabled
     */
    get isUploadDisabled() {
        return !this.fileData;
    }
    
    /**
     * Returns the message to display when no folders are found
     * @return {String} No folders message text
     */
    get noFoldersMessageText() {
        return this.searchTerm ? 'No folders found. Try a different search term.' : 'No folders found.';
    }
    
    /**
     * Returns the message to display when no files are found
     * @return {String} No files message text
     */
    get noFilesMessageText() {
        return this.searchTerm ? 
            'No files found in this location. Try a different search term.' : 
            'No files found in this location. Upload a file to get started.';
    }
    
    /**
     * Returns whether the upload button should be shown
     * @return {Boolean} True if upload button should be shown
     */
    get showUploadButton() {
        // Only show upload button when:
        // 1. We're viewing files (not folders) OR in standalone mode at the root level
        // 2. We're not in search mode
        // 3. We're in a specific folder (or Default) OR in standalone mode at the root level
        return (this.showFiles || (this.standaloneMode && this.showFolders)) && 
               !this.searchTerm && 
               (this.currentFolderPath !== '' || (this.standaloneMode && this.showFolders));
    }
    
    /**
     * Returns the columns for the file datatable
     * @return {Array} Columns configuration
     */
    get fileColumns() {
        const columns = [
            {
                label: 'Name',
                fieldName: 'Title',
                type: 'button',
                typeAttributes: {
                    label: { fieldName: 'Title' },
                    variant: 'base',
                    name: 'download',
                    iconName: { fieldName: 'iconName' },
                    iconPosition: 'left'
                },
                sortable: true,
                hideDefaultActions: true,
                wrapText: true,
                cellAttributes: { alignment: 'left' }
            },
            {
                label: 'Type',
                fieldName: 'FileType',
                type: 'text',
                sortable: true,
                hideDefaultActions: true,
                wrapText: false,
                initialWidth: 100,
                cellAttributes: { alignment: 'center' }
            },
            {
                label: 'Last Modified',
                fieldName: 'ContentModifiedDate',
                type: 'date',
                sortable: true,
                typeAttributes: {
                    year: 'numeric',
                    month: 'short',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                },
                hideDefaultActions: true,
                wrapText: false
            }
        ];
        
        // Add actions column (Delete only)
        if (this.allowDelete) {
            columns.push({
                type: 'action',
                typeAttributes: {
                    rowActions: [{ label: 'Delete', name: 'delete' }],
                    menuAlignment: 'right'
                },
                initialWidth: 80
            });
        }
        
        return columns;
    }
    
    /**
     * Returns the effective record ID to use for queries
     * @return {String} The record ID or 'standalone' if in standalone mode
     */
    get effectiveRecordId() {
        if (this.standaloneMode) {
            return 'standalone';
        }
        return this.recordId || this.getRecordIdFromUrl();
    }
    
    /**
     * Extracts record ID from the URL or uses the provided API property
     * @return {String} The record ID
     */
    getRecordIdFromUrl() {
        try {
            // If recordId is already provided via @api, use that
            if (this.recordId) {
                return this.recordId;
            }

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
            
            console.log('Detected Record ID:', recordId);
            return recordId || '';
        } catch (error) {
            console.error('Error getting record ID from URL:', error);
            return '';
        }
    }
    
    /**
     * Component initialization
     */
    connectedCallback() {
        this.isLoading = true;
        
        try {
            // If not in standalone mode, validate record ID
            if (!this.standaloneMode) {
                // Get recordId from API property or URL
                const detectedRecordId = this.recordId || this.getRecordIdFromUrl();
                
                // Store the effective record ID
                this.recordId = detectedRecordId;
                
                // Log the source of the record ID
                if (detectedRecordId) {
                    console.log('Using record ID:', detectedRecordId);
                }
                
                // Validate that we have a record ID
                if (!this.recordId) {
                    console.error('Record ID is missing. This component can only be used on record pages or with a specified record ID, or in standalone mode.');
                    this.showNoRecordError = true;
                    this.isLoading = false;
                    return;
                }
            } else {
                console.log('Operating in standalone mode without a record ID');
            }
            
            // Apply custom styling based on the configured colors
            this.applyCustomStyling();
            
            this.initializeComponent();
        } catch (error) {
            console.error('Error initializing component:', error);
            this.isLoading = false;
        }
    }
    
    /**
     * Applies custom styling based on the primary and accent colors
     */
    applyCustomStyling() {
        try {
            // Create a style element to inject custom CSS based on the configured colors
            const style = document.createElement('style');
            style.innerText = `
                /* Custom styles utilizing the theme colors */
                .folder-manager-container {
                    --primary-color: ${this.primaryColor};
                    --accent-color: ${this.accentColor};
                    --primary-rgb: ${this.hexToRgb(this.primaryColor)};
                    --accent-rgb: ${this.hexToRgb(this.accentColor)};
                    --text-on-primary: ${this.getContrastColor(this.primaryColor)};
                    --text-on-accent: ${this.getContrastColor(this.accentColor)};
                }
            `;
            
            // Apply the styles directly to the host element instead of using appendChild
            const styleContainer = this.template.querySelector('.folder-manager-styles');
            if (styleContainer) {
                styleContainer.appendChild(style);
            } else {
                // If the container isn't available, add the style to the template directly
                this.template.host.appendChild(style);
            }
        } catch (error) {
            console.error('Error applying custom styling:', error);
            // Silently continue if there's an error with the styling
        }
    }

    /**
     * Converts hex color to RGB format
     */
    hexToRgb(hex) {
        // Remove # if present
        hex = hex.replace('#', '');
        
        // Parse the hex values to RGB
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        return `${r}, ${g}, ${b}`;
    }
    
    /**
     * Determines contrasting text color based on background color
     */
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
    
    /**
     * Initializes the component
     */
    initializeComponent() {
        // Load folder structure from Custom Metadata Type and initialize component
        this.loadFolderStructure()
            .then(() => {
                this.setupFolderHierarchy();
                this.showTopLevelFolders();
            })
            .catch(error => {
                this.displayToast('Error', 'Error loading folder structure: ' + this.getErrorMessage(error), 'error');
                this.isLoading = false;
            });
    }
    
    /**
     * Loads folder structure from Custom Metadata Type
     * @return {Promise} Promise that resolves when folder structure is loaded
     */
    loadFolderStructure() {
        return getPredefinedFolders()
            .then(result => {
                this.folderStructure = result || [];
                return this.folderStructure;
            })
            .catch(error => {
                console.error('Error loading folder structure:', error);
                throw error;
            });
    }
    
    /**
     * Sets up folder hierarchy based on folder structure
     */
    setupFolderHierarchy() {
        // Clear existing hierarchy
        this.folderHierarchy = [];
        
        // Process each folder path from the structure
        for (let path of this.folderStructure) {
            const parts = path.split('/');
            
            // Track the full path
            let currentPath = '';
            
            // Process each part of the path
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                
                // Skip empty parts
                if (!part) continue;
                
                // Update current path
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                
                // Check if this folder node already exists
                const existingFolder = this.folderHierarchy.find(f => f.fullPath === currentPath);
                
                if (!existingFolder) {
                    // Add new folder
                    const folder = {
                        id: currentPath.replace(/\//g, '_'),
                        name: part,
                        fullPath: currentPath,
                        displayName: part,
                        fileCount: 0,
                        parent: i > 0 ? parts.slice(0, i).join('/') : null,
                        isExpanded: false
                    };
                    
                    this.folderHierarchy.push(folder);
                }
            }
        }
        
        // Always ensure Default folder exists
        const defaultFolder = this.folderHierarchy.find(f => f.name === 'Default');
        if (!defaultFolder) {
            this.folderHierarchy.push({
                id: 'Default',
                name: 'Default',
                fullPath: 'Default',
                displayName: 'Default',
                fileCount: 0,
                parent: null,
                isExpanded: false
            });
        }
    }
    
    /**
     * Shows top-level folders
     */
    showTopLevelFolders() {
        this.isLoading = true;
        this.showFolders = true;
        this.showFiles = false;
        this.currentFolderPath = '';
        
        // Reset breadcrumbs to just Home
        this.updateBreadcrumbs('');
        
        // Get top-level folders
        getFolders({ recordId: this.effectiveRecordId })
            .then(result => {
                // Merge folder counts from the result with our predefined folders
                const folderCounts = {};
                
                // First, build a map of folder names to counts
                result.forEach(folder => {
                    folderCounts[folder.name] = folder.fileCount || 0;
                });
                
                // Identify top-level folders
                const topLevelFolders = this.folderHierarchy.filter(folder => !folder.parent);
                
                // Update folder counts from real data
                topLevelFolders.forEach(folder => {
                    folder.fileCount = folderCounts[folder.name] || 0;
                });
                
                // Sort folders by name
                topLevelFolders.sort((a, b) => a.name.localeCompare(b.name));
                
                this.folders = topLevelFolders;
                this.noFoldersMessage = this.folders.length === 0;
                this.isLoading = false;
            })
            .catch(error => {
                this.displayToast('Error', 'Error loading folders: ' + this.getErrorMessage(error), 'error');
                this.isLoading = false;
            });
    }
    
    /**
     * Loads files for a specific folder
     * @param {String} folderPath The folder path to load files for
     */
    loadFolderFiles(folderPath) {
        this.isLoading = true;
        this.showFolders = false;
        this.showFiles = true;
        this.currentFolderPath = folderPath;
        
        // Update breadcrumbs
        this.updateBreadcrumbs(folderPath);
        
        // Get files for the folder
        getFolderFiles({ recordId: this.effectiveRecordId, folderName: folderPath })
            .then(result => {
                const processedFiles = this.processFilesResult(result);
                this.files = processedFiles;
                this.noFilesMessage = this.files.length === 0;
                this.isLoading = false;
            })
            .catch(error => {
                this.displayToast('Error', 'Error loading files: ' + this.getErrorMessage(error), 'error');
                this.isLoading = false;
            });
    }
    
    /**
     * Updates breadcrumbs based on current folder path
     * @param {String} folderPath The current folder path
     * @param {Boolean} isSearchResults Whether this is for search results
     * @param {String} searchTerm The search term used (if search results)
     */
    updateBreadcrumbs(folderPath, isSearchResults = false, searchTerm = '') {
        this.breadcrumbs = [];
        
        // Always start with Home
        this.breadcrumbs.push({
            key: 'home',
            label: 'Home',
            name: '',
            computedClass: folderPath === '' && !isSearchResults ? 'breadcrumb-current' : ''
        });
        
        if (isSearchResults) {
            // For search results, add a search results crumb
            this.breadcrumbs.push({
                key: 'search',
                label: `Search: "${searchTerm}"`,
                name: 'search:' + searchTerm,
                computedClass: 'breadcrumb-current'
            });
        } else if (folderPath) {
            // For regular folder navigation, add each path component
            const parts = folderPath.split('/');
            let currentPath = '';
            
            for (let i = 0; i < parts.length; i++) {
                const part = parts[i];
                currentPath = currentPath ? `${currentPath}/${part}` : part;
                
                this.breadcrumbs.push({
                    key: 'crumb_' + i,
                    label: part,
                    name: currentPath,
                    computedClass: i === parts.length - 1 ? 'breadcrumb-current' : ''
                });
            }
        }
    }
    
    /**
     * Handles breadcrumb click event
     * @param {Event} event The click event
     */
    handleBreadcrumbClick(event) {
        const path = event.currentTarget.dataset.path;
        
        if (path === '') {
            // Home breadcrumb clicked
            this.showTopLevelFolders();
        } else if (path.startsWith('search:')) {
            // Search breadcrumb clicked - do nothing, already on search results
        } else {
            // Folder breadcrumb clicked
            this.loadFolderFiles(path);
        }
    }
    
    /**
     * Handles row action for the datatable
     * @param {Event} event The row action event
     */
    handleRowAction(event) {
        const action = event.detail.action;
        const row = event.detail.row;
        
        if (action.name === 'open_folder') {
            // Navigate to the folder
            this.loadFolderFiles(row.fullPath);
        } else if (action.name === 'download') {
            // Download the file
            this.downloadFile(row);
        } else if (action.name === 'delete') {
            // Delete the file
            this.deleteFile(row);
        }
    }
    
    /**
     * Navigates to file preview
     * @param {String} contentDocumentId The content document ID
     */
    navigateToFilePreview(contentDocumentId) {
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
    
    /**
     * Downloads a file
     * @param {Object} file The file to download
     */
    downloadFile(file) {
        generateUrl({
            recordId: file.Id
        }).then(url => {
            window.open(url, '_blank');
        }).catch(error => {
            this.displayToast('Error', 'Error generating download URL: ' + this.getErrorMessage(error), 'error');
        });
    }
    
    /**
     * Deletes a file
     * @param {Object} file The file to delete
     */
    deleteFile(file) {
        if (confirm('Are you sure you want to delete this file?')) {
            this.isLoading = true;
            
            deleteFile({ contentDocumentId: file.ContentDocumentId })
                .then(() => {
                    this.displayToast('Success', 'File deleted successfully', 'success');
                    // Refresh the current view
                    this.loadFolderFiles(this.currentFolderPath);
                })
                .catch(error => {
                    this.displayToast('Error', 'Error deleting file: ' + this.getErrorMessage(error), 'error');
                    this.isLoading = false;
                });
        }
    }
    
    /**
     * Handles upload file button click
     */
    handleUploadFile() {
        if (this.standaloneMode && this.showFolders) {
            // In standalone mode when showing folders, upload to Default folder
            this.currentFolderPath = 'Default';
        }
        
        this.showUploadFileModal = true;
        this.fileData = null;
        this.fileName = '';
    }
    
    /**
     * Handles search input change
     * @param {Event} event The input change event
     */
    handleSearchChange(event) {
        this.searchTerm = event.target.value;
        
        // Clear search if the search box is emptied
        if (!this.searchTerm) {
            if (this.currentFolderPath) {
                this.loadFolderFiles(this.currentFolderPath);
            } else {
                this.showTopLevelFolders();
            }
        }
    }
    
    /**
     * Handles search input keyup event
     */
    handleSearch() {
        // Debounce search
        window.clearTimeout(this.searchTimeout);
        
        if (this.searchTerm) {
            this.searchTimeout = setTimeout(() => {
                this.performSearch();
            }, 300);
        }
    }
    
    /**
     * Performs search for files
     */
    performSearch() {
        this.isLoading = true;
        
        // Extract files from all folders
        getFolderFiles({ recordId: this.effectiveRecordId, folderName: '' })
            .then(result => {
                // Process results
                const allFiles = this.processFilesResult(result);
                
                // Filter files by search term (case insensitive)
                const searchTermLower = this.searchTerm.toLowerCase();
                const filteredFiles = allFiles.filter(file => 
                    file.Title.toLowerCase().includes(searchTermLower)
                );
                
                // Update UI for search results
                this.showFolders = false;
                this.showFiles = true;
                this.files = filteredFiles;
                this.noFilesMessage = this.files.length === 0;
                
                // Update breadcrumbs to show search
                this.updateBreadcrumbs('', true, this.searchTerm);
                
                this.isLoading = false;
            })
            .catch(error => {
                this.displayToast('Error', 'Error searching files: ' + this.getErrorMessage(error), 'error');
                this.isLoading = false;
            });
    }
    
    /**
     * Handles refresh button click
     */
    handleRefresh() {
        // If showing folders, refresh folder view
        if (this.showFolders) {
            this.showTopLevelFolders();
        } 
        // If showing files, refresh current folder
        else if (this.showFiles) {
            if (this.searchTerm) {
                this.performSearch();
            } else {
                this.loadFolderFiles(this.currentFolderPath);
            }
        }
    }
    
    /**
     * Processes file results to add file type icons
     * @param {Array} result The files result from Apex
     * @return {Array} Processed file results with icons
     */
    processFilesResult(result) {
        if (!result) return [];
        
        return result.map(file => {
            const fileType = file.FileType ? file.FileType.toLowerCase() : '';
            let iconName = 'doctype:unknown';
            
            // Determine icon based on file type
            if (fileType === 'pdf') {
                iconName = 'doctype:pdf';
            } else if (['doc', 'docx'].includes(fileType)) {
                iconName = 'doctype:word';
            } else if (['xls', 'xlsx', 'csv'].includes(fileType)) {
                iconName = 'doctype:excel';
            } else if (['ppt', 'pptx'].includes(fileType)) {
                iconName = 'doctype:ppt';
            } else if (['txt', 'rtf'].includes(fileType)) {
                iconName = 'doctype:txt';
            } else if (['png', 'jpg', 'jpeg', 'gif', 'bmp'].includes(fileType)) {
                iconName = 'doctype:image';
            } else if (['zip', 'rar', '7z'].includes(fileType)) {
                iconName = 'doctype:zip';
            }
            
            return { ...file, iconName };
        });
    }
    
    /**
     * Handles file change in the upload modal
     * @param {Event} event The file input change event
     */
    handleFileChange(event) {
        const file = event.target.files[0];
        if (file) {
            const reader = new FileReader();
            this.fileName = file.name;
            
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                this.fileData = {
                    filename: file.name,
                    base64: base64,
                    contentType: file.type
                };
            };
            reader.readAsDataURL(file);
        }
    }
    
    /**
     * Handles cancel button click in the upload modal
     */
    handleCancelUpload() {
        this.showUploadFileModal = false;
        this.fileData = null;
        this.fileName = '';
    }
    
    /**
     * Handles save button click in the upload modal
     */
    handleSaveUpload() {
        if (!this.fileData) {
            this.displayToast('Error', 'Please select a file to upload', 'error');
            return;
        }
        
        this.isLoading = true;
        
        uploadFileToFolder({
            recordId: this.effectiveRecordId,
            folderName: this.currentFolderPath,
            fileName: this.fileData.filename,
            base64Data: this.fileData.base64,
            contentType: this.fileData.contentType
        })
            .then(() => {
                this.showUploadFileModal = false;
                this.displayToast('Success', 'File uploaded successfully', 'success');
                this.fileData = null;
                this.fileName = '';
                
                // If we're at the root in standalone mode, refresh the folders view
                if (this.standaloneMode && this.showFolders) {
                    this.showTopLevelFolders();
                } else {
                    // Otherwise refresh the current folder view
                    this.loadFolderFiles(this.currentFolderPath);
                }
            })
            .catch(error => {
                this.displayToast('Error', 'Error uploading file: ' + this.getErrorMessage(error), 'error');
                this.isLoading = false;
            });
    }
    
    /**
     * Handles column sort for datatables
     * @param {Event} event The sort event
     */
    handleSort(event) {
        this.sortedBy = event.detail.fieldName;
        this.sortDirection = event.detail.sortDirection;
        
        // Apply sorting to the appropriate data
        if (this.showFolders) {
            this.folders = this.sortData(this.folders, this.sortedBy, this.sortDirection);
        } else if (this.showFiles) {
            this.files = this.sortData(this.files, this.sortedBy, this.sortDirection);
        }
    }
    
    /**
     * Sorts data based on field and direction
     * @param {Array} dataToSort The data to sort
     * @param {String} fieldName The field to sort by
     * @param {String} direction The sort direction
     * @return {Array} Sorted data
     */
    sortData(dataToSort, fieldName, direction) {
        const parseValue = (value) => {
            // Handle null/undefined values
            if (value === undefined || value === null) {
                return '';
            }
            
            // Handle dates
            if (value instanceof Date) {
                return value.getTime();
            }
            
            // Return lower case string for string values (case-insensitive sort)
            return typeof value === 'string' ? value.toLowerCase() : value;
        };
        
        // Create a new array to avoid modifying the original
        let sortedData = [...dataToSort];
        
        // Sort the data
        sortedData.sort((a, b) => {
            const valueA = parseValue(a[fieldName]);
            const valueB = parseValue(b[fieldName]);
            
            // Handle numeric comparison
            if (typeof valueA === 'number' && typeof valueB === 'number') {
                return direction === 'asc' ? valueA - valueB : valueB - valueA;
            }
            
            // Handle string comparison
            if (valueA > valueB) {
                return direction === 'asc' ? 1 : -1;
            } else if (valueA < valueB) {
                return direction === 'asc' ? -1 : 1;
            }
            
            return 0; // values are equal
        });
        
        return sortedData;
    }
    
    /**
     * Formats bytes into human-readable format
     * @param {Number} bytes The bytes to format
     * @param {Number} decimals The decimal places
     * @return {String} Formatted size
     */
    formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }
    
    /**
     * Displays a toast message
     * @param {String} title The toast title
     * @param {String} message The toast message
     * @param {String} variant The toast variant (success, error, warning, info)
     */
    displayToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({
                title: title,
                message: message,
                variant: variant
            })
        );
    }
    
    /**
     * Gets an error message from an error object
     * @param {Object} error The error object
     * @return {String} Error message
     */
    getErrorMessage(error) {
        let message = 'Unknown error';
        if (error) {
            if (error.body && error.body.message) {
                message = error.body.message;
            } else if (error.message) {
                message = error.message;
            } else if (typeof error === 'string') {
                message = error;
            }
        }
        return message;
    }
    
    /**
     * Component rendered callback
     */
    renderedCallback() {
        this.fixDropdownPositioning();
    }
    
    /**
     * Fixes dropdown menu positioning for lightning-datatable
     */
    fixDropdownPositioning() {
        // For the file table with the action menu
        const actionCells = this.template.querySelectorAll('.slds-dropdown-trigger button');
        if (actionCells) {
            actionCells.forEach(actionCell => {
                actionCell.click = function() {
                    const dropdown = this.parentElement.querySelector('.slds-dropdown');
                    if (dropdown) {
                        dropdown.style.left = 'auto';
                        dropdown.style.right = '0';
                    }
                };
            });
        }
    }
} 