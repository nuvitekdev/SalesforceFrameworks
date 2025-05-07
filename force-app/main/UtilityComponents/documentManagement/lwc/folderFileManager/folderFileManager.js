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
        cellAttributes: { alignment: 'left' }
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
    @track sortedBy = 'ContentModifiedDate';
    @track sortDirection = 'desc';
    @track breadcrumbs = [];
    @track noFoldersMessage = false;
    @track noFilesMessage = false;
    @track showNoRecordError = false;
    
    folderColumns = folderColumns;
    wiredFilesResult;
    
    // For file upload
    @track selectedFiles = [];
    @track isFileUploading = false;
    acceptedFormats = '.pdf,.png,.jpg,.jpeg,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv';
    maxFilesLimit = 10;
    
    /**
     * Returns a readable version of the accepted formats
     * @return {String} Display-friendly version of file formats
     */
    get acceptedFormatsDisplay() {
        return this.acceptedFormats
            .split(',')
            .map(format => format.replace('.', '').toUpperCase())
            .join(', ');
    }
    
    /**
     * Returns whether any files are selected
     * @return {Boolean} True if files are selected
     */
    get hasSelectedFiles() {
        return this.selectedFiles.length > 0;
    }
    
    /**
     * Returns the count of selected files
     * @return {Number} Number of selected files
     */
    get selectedFilesCount() {
        return this.selectedFiles.length;
    }
    
    /**
     * Returns whether the files limit warning should be shown
     * @return {Boolean} True if the warning should be shown
     */
    get showFilesLimitWarning() {
        return this.selectedFiles.length >= this.maxFilesLimit;
    }
    
    /**
     * Returns whether the upload button should be disabled
     * @return {Boolean} True if file upload should be disabled
     */
    get isUploadDisabled() {
        return this.selectedFiles.length === 0;
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
        // Show upload button when:
        // 1. We're viewing files (not folders)
        // 2. We're not in search mode
        // 3. We're in a specific folder OR viewing the main folder area
        return this.showFiles && 
               !this.searchTerm;
        // Removed the currentFolderPath !== '' condition to allow uploads in main folder area
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
                cellAttributes: { alignment: 'left' }
            },
            {
                label: 'Size',
                fieldName: 'ContentSizeFormatted',
                type: 'text',
                sortable: true,
                hideDefaultActions: true,
                wrapText: false,
                initialWidth: 100,
                cellAttributes: { alignment: 'left' }
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
                wrapText: false,
                cellAttributes: { alignment: 'left' }
            }
        ];
        
        // Add actions column
        if (this.allowDelete) {
            columns.push({
                type: 'action',
                typeAttributes: {
                    rowActions: [
                        { label: 'Download', name: 'download' },
                        { label: 'Delete', name: 'delete' }
                    ],
                    menuAlignment: 'right'
                },
                initialWidth: 80
            });
        } else {
            columns.push({
                type: 'action',
                typeAttributes: {
                    rowActions: [
                        { label: 'Download', name: 'download' }
                    ],
                    menuAlignment: 'right'
                },
                initialWidth: 80
            });
        }
        
        return columns;
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
            
            return recordId || '';
        } catch (error) {
            return '';
        }
    }
    
    /**
     * Component initialization
     */
    connectedCallback() {
        this.isLoading = true;
        
        try {
            // Get recordId from API property or URL
            const effectiveRecordId = this.recordId || this.getRecordIdFromUrl();
            
            // Store the effective record ID
            this.recordId = effectiveRecordId;
            
            // Set default sort to ContentModifiedDate descending
            this.sortedBy = 'ContentModifiedDate';
            this.sortDirection = 'desc';
            
            // Validate that we have a record ID
            if (!this.recordId) {
                this.showNoRecordError = true;
                this.isLoading = false;
                return;
            }
            
            // Apply custom styling based on the configured colors
            this.applyCustomStyling();
            
            this.initializeComponent();
        } catch (error) {
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
        getFolders({ recordId: this.recordId })
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
        getFolderFiles({ recordId: this.recordId, folderName: folderPath })
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
        try {
            // Check if file has ContentDocumentId or Id
            const fileId = file.ContentDocumentId || file.Id;
            
            if (!fileId) {
                this.displayToast('Error', 'File ID is missing. Cannot download file.', 'error');
                return;
            }
            
            // Use a different approach for download that doesn't rely on substring
            // Create a link and trigger a download directly
            this[NavigationMixin.Navigate]({
                type: 'standard__webPage',
                attributes: {
                    url: '/sfc/servlet.shepherd/document/download/' + fileId
                }
            });
        } catch (error) {
            this.displayToast('Error', 'Error downloading file: ' + this.getErrorMessage(error), 'error');
        }
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
        this.showUploadFileModal = true;
        this.selectedFiles = [];
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
     * Handles refresh button click
     */
    handleRefresh() {
        // Show loading spinner first
        this.isLoading = true;
        
        // Display a toast message to indicate refresh is in progress
        this.displayToast('Refreshing', 'Refreshing content...', 'success');
        
        // Use the forceDataRefresh method to ensure we get fresh data
        this.forceDataRefresh();
    }
    
    /**
     * Performs search for files and folders
     */
    performSearch() {
        if (!this.searchTerm || this.searchTerm.trim() === '') {
            return;
        }

        this.isLoading = true;
        const searchTermLower = this.searchTerm.toLowerCase();

        // Promise for searching files - get all files regardless of folder
        const searchFilesPromise = getFolderFiles({ recordId: this.recordId, folderName: '' })
            .then(result => {
                // Process results
                const allFiles = this.processFilesResult(result || []);
                
                // Sort files by modified date descending by default
                allFiles.sort((a, b) => {
                    if (a.ContentModifiedDate && b.ContentModifiedDate) {
                        return new Date(b.ContentModifiedDate) - new Date(a.ContentModifiedDate);
                    }
                    return 0;
                });
                
                // Filter files by search term (case insensitive)
                return allFiles.filter(file => 
                    (file.Title && file.Title.toLowerCase().includes(searchTermLower)) ||
                    (file.FileType && file.FileType.toLowerCase().includes(searchTermLower))
                );
            })
            .catch(error => {
                this.displayToast('Error', 'Error searching files: ' + this.getErrorMessage(error), 'error');
                return [];
            });
        
        // Promise for searching all folders in the hierarchy (pre-defined)
        const folderHierarchySearch = () => {
            // Perform local search on all available folders in hierarchy with strict filtering
            return this.folderHierarchy.filter(folder => {
                // Only include folders with valid names that contain the search term
                return folder && 
                    folder.name && 
                    typeof folder.name === 'string' &&
                    folder.name.trim() !== '' && 
                    folder.name.toLowerCase().includes(searchTermLower);
            });
        };

        // Promise for searching folders from the server
        const searchFoldersPromise = getFolders({ recordId: this.recordId })
            .then(result => {
                try {
                    // First, filter matching folders without modifying them
                    const serverMatchingFolders = (result || []).filter(folder => {
                        // Check if folder has a valid name property
                        return folder && 
                            folder.name && 
                            typeof folder.name === 'string' &&
                            folder.name.trim() !== '' && 
                            folder.name.toLowerCase().includes(searchTermLower);
                    })
                    .map(folder => {
                        // Create fresh objects instead of modifying proxy objects
                        return {
                            id: folder.id || '',
                            name: folder.name || '',
                            fullPath: folder.fullPath || folder.name || '',
                            displayName: folder.displayName || folder.name || '',
                            fileCount: folder.fileCount || 0,
                            parent: folder.parent || null,
                            isExpanded: false
                        };
                    });
                    
                    // Then, get all matching folders from our pre-defined hierarchy
                    const hierarchyMatchingFolders = folderHierarchySearch().map(folder => {
                        // Create fresh objects instead of modifying proxy objects
                        return {
                            id: folder.id || '',
                            name: folder.name || '',
                            fullPath: folder.fullPath || folder.name || '',
                            displayName: folder.displayName || folder.name || '',
                            fileCount: folder.fileCount || 0,
                            parent: folder.parent || null,
                            isExpanded: folder.isExpanded || false
                        };
                    });
                    
                    // Merge both sets, using a Map to avoid duplicates
                    const folderMap = new Map();
                    
                    // Add server folders
                    serverMatchingFolders.forEach(folder => {
                        if (folder && folder.name && folder.name.trim() !== '') {
                            folderMap.set(folder.id || folder.fullPath || folder.name, folder);
                        }
                    });
                    
                    // Add hierarchy folders, but don't override existing ones
                    hierarchyMatchingFolders.forEach(folder => {
                        if (folder && folder.name && folder.name.trim() !== '' && 
                            !folderMap.has(folder.id || folder.fullPath || folder.name)) {
                            folderMap.set(folder.id || folder.fullPath || folder.name, folder);
                        }
                    });
                    
                    // Convert map back to array
                    const filteredFolders = Array.from(folderMap.values());
                    
                    return filteredFolders;
                } catch (error) {
                    return folderHierarchySearch().map(folder => {
                        // Create fresh objects instead of modifying proxy objects
                        return {
                            id: folder.id || '',
                            name: folder.name || '',
                            fullPath: folder.fullPath || folder.name || '',
                            displayName: folder.displayName || folder.name || '',
                            fileCount: folder.fileCount || 0,
                            parent: folder.parent || null,
                            isExpanded: folder.isExpanded || false
                        };
                    });
                }
            })
            .catch(error => {
                this.displayToast('Error', 'Error searching folders: ' + this.getErrorMessage(error), 'error');
                // Fall back to searching just the hierarchy
                return folderHierarchySearch().map(folder => {
                    // Create fresh objects instead of modifying proxy objects
                    return {
                        id: folder.id || '',
                        name: folder.name || '',
                        fullPath: folder.fullPath || folder.name || '',
                        displayName: folder.displayName || folder.name || '',
                        fileCount: folder.fileCount || 0,
                        parent: folder.parent || null,
                        isExpanded: folder.isExpanded || false
                    };
                });
            });
        
        // Process all search promises
        Promise.all([searchFilesPromise, searchFoldersPromise])
            .then(([filteredFiles, filteredFolders]) => {
                // Final check for valid folders
                const validFolders = filteredFolders.filter(folder => 
                    folder && 
                    folder.name && 
                    typeof folder.name === 'string' &&
                    folder.name.trim() !== '' &&
                    folder.displayName && 
                    typeof folder.displayName === 'string'
                );
                
                // Determine what content to show based on search results
                const hasFiles = filteredFiles.length > 0;
                const hasFolders = validFolders.length > 0;
                
                // ALWAYS show both sections in search mode, regardless of whether there are results
                // This ensures consistent UI when searching and guarantees the folder table gets displayed
                this.showFolders = true;
                this.showFiles = true;
                
                // Update the data
                this.files = filteredFiles;
                this.folders = validFolders; // Use the extra-filtered folders
                
                // Set empty state messages
                this.noFilesMessage = !hasFiles;
                this.noFoldersMessage = !hasFolders;
                
                // Update breadcrumbs to show search
                this.updateBreadcrumbs('', true, this.searchTerm);
                
                this.isLoading = false;
            })
            .catch(error => {
                this.displayToast('Error', 'Error searching: ' + this.getErrorMessage(error), 'error');
                this.isLoading = false;
            });
    }
    
    /**
     * Processes file results and sort by most recent by default
     */
    processFilesResult(result) {
        if (!result) return [];
        
        const processedFiles = result.map(file => {
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
            
            // Format the content size if available
            let formattedSize = '';
            if (file.ContentSize) {
                formattedSize = this.formatBytes(file.ContentSize);
            }
            
            return { 
                ...file, 
                iconName,
                ContentSizeFormatted: formattedSize 
            };
        });
        
        // Sort files by modified date descending by default (newest first)
        processedFiles.sort((a, b) => {
            if (a.ContentModifiedDate && b.ContentModifiedDate) {
                return new Date(b.ContentModifiedDate) - new Date(a.ContentModifiedDate);
            }
            return 0;
        });
        
        return processedFiles;
    }
    
    /**
     * Handles the drag over event for file drop
     * @param {Event} event - The drag over event
     */
    handleDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const uploadContainer = this.template.querySelector('.file-upload-container');
        if (uploadContainer && !uploadContainer.classList.contains('dragover')) {
            uploadContainer.classList.add('dragover');
        }
    }
    
    /**
     * Handles the drag leave event for file drop
     * @param {Event} event - The drag leave event
     */
    handleDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const uploadContainer = this.template.querySelector('.file-upload-container');
        if (uploadContainer && uploadContainer.classList.contains('dragover')) {
            uploadContainer.classList.remove('dragover');
        }
    }
    
    /**
     * Handles the file drop event
     * @param {Event} event - The file drop event
     */
    handleFileDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        
        const uploadContainer = this.template.querySelector('.file-upload-container');
        if (uploadContainer && uploadContainer.classList.contains('dragover')) {
            uploadContainer.classList.remove('dragover');
        }
        
        // Get the dropped files
        const files = event.dataTransfer.files;
        if (files.length > 0) {
            this.processMultipleFiles(files);
        }
    }
    
    /**
     * Processes multiple files for upload
     * @param {FileList} fileList - The list of files to process
     */
    processMultipleFiles(fileList) {
        // Check how many more files we can accept
        const remainingSlots = this.maxFilesLimit - this.selectedFiles.length;
        
        if (remainingSlots <= 0) {
            this.displayToast('Warning', `You can only upload up to ${this.maxFilesLimit} files at once.`, 'warning');
            return;
        }
        
        // Convert FileList to Array to be able to slice
        const filesArray = Array.from(fileList);
        
        // Only take the first N files where N is the remaining slots
        const filesToProcess = filesArray.slice(0, remainingSlots);
        
        // If we had to truncate, show a warning
        if (filesArray.length > remainingSlots) {
            this.displayToast('Warning', `Only the first ${remainingSlots} files were selected due to the ${this.maxFilesLimit} file limit.`, 'warning');
        }
        
        // Process each file
        filesToProcess.forEach(file => {
            this.processFile(file);
        });
    }
    
    /**
     * Processes a file for upload
     * @param {File} file - The file to process
     */
    processFile(file) {
        if (file) {
            this.isFileUploading = true;
            
            const reader = new FileReader();
            
            reader.onload = () => {
                const base64 = reader.result.split(',')[1];
                
                // Generate a unique ID for this file
                const fileId = 'file_' + Date.now() + '_' + Math.round(Math.random() * 1000);
                
                // Determine file type icon
                const fileExtension = file.name.split('.').pop().toLowerCase();
                let iconName = 'doctype:attachment';
                
                // Set appropriate icon based on file type
                if (['pdf'].includes(fileExtension)) {
                    iconName = 'doctype:pdf';
                } else if (['doc', 'docx'].includes(fileExtension)) {
                    iconName = 'doctype:word';
                } else if (['xls', 'xlsx', 'csv'].includes(fileExtension)) {
                    iconName = 'doctype:excel';
                } else if (['ppt', 'pptx'].includes(fileExtension)) {
                    iconName = 'doctype:ppt';
                } else if (['txt', 'rtf'].includes(fileExtension)) {
                    iconName = 'doctype:txt';
                } else if (['png', 'jpg', 'jpeg', 'gif'].includes(fileExtension)) {
                    iconName = 'doctype:image';
                } else if (['zip', 'rar', '7z'].includes(fileExtension)) {
                    iconName = 'doctype:zip';
                }
                
                // Add file to selected files
                this.selectedFiles.push({
                    id: fileId,
                    filename: file.name,
                    base64: base64,
                    contentType: file.type,
                    iconName: iconName,
                    size: file.size
                });
                
                this.isFileUploading = false;
            };
            
            reader.onerror = (error) => {
                this.displayToast('Error', 'Error reading file: ' + error, 'error');
                this.isFileUploading = false;
            };
            
            reader.readAsDataURL(file);
        }
    }
    
    /**
     * Handles file change from input element
     * @param {Event} event - The file input change event
     */
    handleFileChange(event) {
        try {
            const files = event.target.files;
            if (files && files.length > 0) {
                this.processMultipleFiles(files);
            }
        } catch (error) {
            this.displayToast('Error', 'Error selecting files: ' + this.getErrorMessage(error), 'error');
        }
    }
    
    /**
     * Removes a file from the selected files
     * @param {Event} event - The click event
     */
    removeFile(event) {
        const index = parseInt(event.currentTarget.dataset.index, 10);
        if (!isNaN(index) && index >= 0 && index < this.selectedFiles.length) {
            // Create a new array without the file at the specified index
            this.selectedFiles = [
                ...this.selectedFiles.slice(0, index),
                ...this.selectedFiles.slice(index + 1)
            ];
        }
    }
    
    /**
     * Clears all selected files
     */
    clearSelectedFiles() {
        this.selectedFiles = [];
    }
    
    /**
     * Triggers the native file input click event
     */
    triggerFileInput() {
        const fileInput = this.template.querySelector('.file-input-hidden');
        if (fileInput) {
            fileInput.click();
        }
    }
    
    /**
     * Handles cancel button click in the upload modal
     */
    handleCancelUpload() {
        this.showUploadFileModal = false;
        this.selectedFiles = [];
    }
    
    /**
     * Handles save button click in the upload modal
     */
    handleSaveUpload() {
        if (this.selectedFiles.length === 0) {
            this.displayToast('Error', 'Please select at least one file to upload', 'error');
            return;
        }
        
        this.isLoading = true;
        
        // Create a queue of files to upload
        const uploadQueue = [...this.selectedFiles];
        const totalFiles = uploadQueue.length;
        let uploadedCount = 0;
        let failedCount = 0;
        
        // Process files one by one
        const processNext = () => {
            if (uploadQueue.length === 0) {
                // All files have been processed
                this.showUploadFileModal = false;
                
                // Show summary toast
                if (failedCount === 0) {
                    this.displayToast(
                        'Success', 
                        `Successfully uploaded ${uploadedCount} file${uploadedCount !== 1 ? 's' : ''}.`, 
                        'success'
                    );
                } else {
                    this.displayToast(
                        'Warning', 
                        `Uploaded ${uploadedCount} file${uploadedCount !== 1 ? 's' : ''}, but ${failedCount} file${failedCount !== 1 ? 's' : ''} failed.`, 
                        'warning'
                    );
                }
                
                this.selectedFiles = [];
                
                // Force a complete refresh to show newly uploaded files
                // Use a direct server fetch instead of relying on cache
                this.forceDataRefresh();
                
                return;
            }
            
            // Get the next file to upload
            const fileToUpload = uploadQueue.shift();
            
            // Upload the file
            uploadFileToFolder({
                recordId: this.recordId,
                folderName: this.currentFolderPath,
                fileName: fileToUpload.filename,
                base64Data: fileToUpload.base64,
                contentType: fileToUpload.contentType
            })
                .then(() => {
                    // Increment uploaded count
                    uploadedCount++;
                    
                    // Update progress message
                    this.displayToast(
                        'In Progress', 
                        `Uploading file ${uploadedCount + failedCount} of ${totalFiles}`, 
                        'info'
                    );
                    
                    // Process the next file
                    processNext();
                })
                .catch(error => {
                    console.error('Error uploading file:', fileToUpload.filename, error);
                    
                    // Increment failed count
                    failedCount++;
                    
                    // Display error for this file
                    this.displayToast(
                        'Error', 
                        `Failed to upload ${fileToUpload.filename}: ${this.getErrorMessage(error)}`, 
                        'error'
                    );
                    
                    // Continue with the next file
                    processNext();
                });
        };
        
        // Start processing the queue
        processNext();
    }
    
    /**
     * Forces a complete data refresh by fetching directly from server
     * This ensures we see newly uploaded files without cache issues
     */
    forceDataRefresh() {
        this.isLoading = true;
        
        // Clear any cached data
        this.wiredFilesResult = undefined;
        this.wiredFoldersResult = undefined;
        
        // For search results, run the search again
        if (this.searchTerm) {
            this.performSearch();
            return;
        }
        
        // Wait to ensure server has processed the uploads
        setTimeout(() => {
            if (this.currentFolderPath) {
                // If we're in a folder, fetch directly from server with a timestamp to bypass cache
                getFolderFiles({ 
                    recordId: this.recordId, 
                    folderName: this.currentFolderPath,
                    timestamp: Date.now() // Add timestamp to bypass cache
                })
                .then(result => {
                    const processedFiles = this.processFilesResult(result);
                    this.files = processedFiles;
                    this.noFilesMessage = this.files.length === 0;
                    this.isLoading = false;
                })
                .catch(error => {
                    this.displayToast('Error', 'Unable to refresh files: ' + this.getErrorMessage(error), 'error');
                    this.isLoading = false;
                    
                    // As a last resort, reload the page
                    window.location.reload();
                });
            } else {
                // If we're at the root, refresh the top-level folders with timestamp to bypass cache
                getFolders({ 
                    recordId: this.recordId,
                    timestamp: Date.now() // Add timestamp to bypass cache
                })
                .then(result => {
                    // Process folder results and refresh UI
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
                    this.displayToast('Error', 'Unable to refresh folders: ' + this.getErrorMessage(error), 'error');
                    this.isLoading = false;
                    
                    // As a last resort, reload the page
                    window.location.reload();
                });
            }
        }, 1000); // Longer delay to ensure uploads are fully processed on the server
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