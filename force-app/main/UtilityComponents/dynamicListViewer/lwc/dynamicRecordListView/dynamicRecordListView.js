// dynamicRecordListView.js
import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getRecords from '@salesforce/apex/DynamicRecordListViewController.getRecords';
import getRelatedRecords from '@salesforce/apex/DynamicRecordListViewController.getRelatedRecords';
// Assuming getObjectFields is still needed for initial column setup if fields aren't provided directly
// import getObjectFields from '@salesforce/apex/DynamicRecordListViewController.getObjectFields';
import getRelatedObjects from '@salesforce/apex/DynamicRecordListViewController.getRelatedObjects';
import getRecordAllFields from '@salesforce/apex/DynamicRecordListViewController.getRecordAllFields'; // Crucial for modal details

// Constants for configuration and debouncing
const SEARCH_DELAY = 300; // milliseconds delay for debouncing search input
const REQUIRED_FIELDS = ['Id', 'Name']; // Fields always fetched for core functionality (e.g., identifying records, default title)

/**
 * Dynamic Record List View LWC
 * 
 * Displays a filterable, sortable, and paginated list of records for a given SObject.
 * Allows clicking a record to view its details and navigate through related records and lookups
 * within a modal, using breadcrumbs to track the navigation path.
 */
export default class DynamicRecordListView extends NavigationMixin(LightningElement) {
    // --- Public API Properties (Configurable via App Builder or Parent Component) ---

    /** Required. The API name of the SObject to display in the list view */
    @api objectApiName;
    /** Required. A comma-separated string of field API names to display as columns */
    @api listViewFields;
    /** Optional. The field API name to use for the main title in the record detail modal */
    @api titleField = 'Name'; 
    /** Optional. The field API name to use for the subtitle in the record detail modal */
    @api subtitleField;
    /** Optional. The SLDS icon name to display in the modal header */
    @api iconName = 'standard:default'; 
    /** Optional. The number of records to display per page in the list view */
    @api recordsPerPage = 10; 
    /** Optional. Primary theme color */
    @api primaryColor = '#22BDC1';
    /** Optional. Accent theme color */
    @api accentColor = '#D5DF23';
    /** Optional. Main text color */
    @api textColor = '#1d1d1f';
    
    // --- Internal Component State ---
    @track columns = [];
    @track records = [];
    @track totalRecords = 0;
    @track currentPage = 1;
    @track sortBy = 'Name';
    @track sortDirection = 'asc';
    @track searchTerm = '';
    @track isLoading = false;
    @track error = null;
    @track showRecordDetail = false; 
    @track selectedRecord = null; 
    @track isLoadingRecordDetail = false; 
    @track relatedObjects = [];
    @track selectedTab = 'details';
    @track relatedRecords = [];
    @track loadingRelatedRecords = false;
    @track chatterPosts = [];
    @track loadingChatterPosts = false;
    @track relatedRecordsData = [];
    @track loadingRelatedObjects = false;
    @track relatedObjectsLoaded = false;
    @track files = [];
    @track loadingFiles = false;
    @track navigationStack = [];
    @track showFilterPanel = false;
    @track selectedField = null;
    @track selectedOperator = null;
    @track fieldValue = '';
    @track appliedFilters = null;

    searchTimeout;
    initialLoadComplete = false;
    allFieldsForSelectedRecord = {};
    detailedFieldsData = [];

    // --- Lifecycle Hooks ---

    /**
     * Called when the element is inserted into a document.
     * Performs initial setup like applying theme colors and processing configuration if properties are set.
     */
    connectedCallback() {
        this.updateCustomProperties(); // Apply theming early

        // Perform initial setup if required properties are available on connection.
        // Note: @api properties might not be immediately available in connectedCallback if set by parent async.
        // renderedCallback provides a fallback.
        if (this.objectApiName && this.listViewFields) {
            this.processFieldConfiguration();
        } else if (this.objectApiName && !this.listViewFields) {
            // Handle cases where fields aren't provided. Could fetch defaults or show error.
            console.warn('DynamicRecordListView: listViewFields property is missing. Columns may not display correctly.');
            this.handleError('Configuration Error: List view fields (listViewFields) are required but not specified.');
        }
    }

    /**
     * Called after every render of the component.
     * Used here as a safeguard to ensure initial setup runs even if @api properties weren't ready in connectedCallback.
     * Also ensures theme colors are reapplied if those @api properties change.
     */
    renderedCallback() {
        // Ensure initial setup runs only once, after objectApiName is likely settled.
        if (!this.initialLoadComplete && this.objectApiName && this.listViewFields) {
            this.initialLoadComplete = true;
            // Delay slightly with setTimeout allows other rendering updates to settle if needed, but usually direct call is fine.
            // setTimeout(() => this.processFieldConfiguration(), 0); 
            this.processFieldConfiguration(); // Setup columns and load initial data
        }
        this.updateCustomProperties(); // Ensure styles are up-to-date if theme props change
    }

    // --- Initialization and Configuration ---

    /**
     * Sets up the component based on the provided `objectApiName` and `listViewFields`.
     * Parses the fields string, ensures required fields are present for fetching, 
     * configures the `columns` for the list view table, sets default sorting,
     * and triggers the initial `loadRecords` call.
     */
    processFieldConfiguration() {
        // Guard against running without necessary configuration
        if (!this.objectApiName || !this.listViewFields) {
            this.handleError('Configuration incomplete. Please provide both objectApiName and listViewFields.');
            return;
        }
        
        this.isLoading = true; // Start loading indicator for the main list view setup
        try {
            // 1. Parse the comma-separated fields string into a clean array
            let fieldsList = this.listViewFields.split(',')
                .map(field => field.trim()) // Remove whitespace
                .filter(field => field); // Remove any empty strings resulting from extra commas

            // 2. Determine the set of fields needed for the initial SOQL query
            // We need 'Id' always, fields for columns, the default title/subtitle fields for the modal, and the sort field.
            const requiredForFetch = new Set(['Id']); // Always fetch Id
            if (this.titleField) requiredForFetch.add(this.titleField); // Needed for modal title
            if (this.subtitleField) requiredForFetch.add(this.subtitleField); // Needed for modal subtitle
            fieldsList.forEach(f => requiredForFetch.add(f));

            // 3. Prepare `columns` array for the list view table (don't include 'Id' column visually)
            this.columns = fieldsList
                .filter(fieldName => fieldName.toLowerCase() !== 'id') // Filter out 'Id' from visual columns
                .map(fieldName => ({
                    label: this.formatFieldLabel(fieldName), // Generate a readable label
                        fieldName: fieldName,
                    sortable: true // Assume all specified fields are sortable initially
                }));

            // 4. Set default sort field - don't assume 'Name' exists
            // First try the provided sortBy, then titleField, then first field in list
             if (!this.sortBy || !requiredForFetch.has(this.sortBy)) {
                // Don't assume Name exists - use the titleField (which defaults to 'Name' but can be configured)
                // or the first field in the list if titleField is not available
                if (requiredForFetch.has(this.titleField)) {
                    this.sortBy = this.titleField;
                } else {
                    // Use first field if title isn't available, or fallback to Id
                    this.sortBy = fieldsList.length > 0 ? fieldsList[0] : 'Id'; 
                }
            }
            
            // Add the final sortBy field to the fetch list if it wasn't already there
            requiredForFetch.add(this.sortBy); 

            // 5. Reset list view state before loading new data
            this.currentPage = 1;
            this.records = [];
            this.totalRecords = 0;
            this.error = null;

            // 6. Trigger the initial load of records for the list view
            // The actual fields passed to Apex `getRecords` will be derived from `requiredForFetch` inside `loadRecords`.
            this.loadRecords();
            
        } catch (error) {
            this.handleError(error, 'Error processing field configuration');
            this.isLoading = false; // Ensure loading state is turned off on error
        }
    }

    // --- Data Loading ---

    /**
     * Fetches records for the main list view based on the current component state 
     * (objectApiName, columns, sorting, pagination, search term).
     * Called initially by `processFieldConfiguration` and subsequently by sorting, pagination, or search.
     */
    loadRecords() {
        // Don't attempt load if the object API name isn't set
        if (!this.objectApiName) {
            console.warn('loadRecords called without objectApiName.');
            return; 
        }

        this.isLoading = true; // Show loading spinner for list view
        this.error = null; // Clear previous errors before new load attempt

        // Determine the precise set of fields needed for this specific SOQL query:
        // - Always 'Id'
        // - Fields displayed in the columns (`this.columns`)
        // - The current sort field (`this.sortBy`)
        // - Fields potentially used for modal title/subtitle (`this.titleField`, `this.subtitleField`) 
        //   (fetched here so they are available immediately on click before full details load)
        const fieldSet = new Set(['Id']); 
        this.columns.forEach(col => fieldSet.add(col.fieldName));
        if (this.sortBy) fieldSet.add(this.sortBy);
        if (this.titleField) fieldSet.add(this.titleField); 
        if (this.subtitleField) fieldSet.add(this.subtitleField);

        // Call the Apex method to get records
        getRecords({
            objectApiName: this.objectApiName,
            fields: Array.from(fieldSet), // Pass the unique list of fields
            sortField: this.sortBy,
            sortDirection: this.sortDirection,
            filters: this.appliedFilters || '[]', // Use the applied filters or empty array if null
            recordsPerPage: this.recordsPerPage,
            pageNumber: this.currentPage,
            searchTerm: this.searchTerm
        })
        .then(result => {
            // Update component state with the fetched data
            this.records = result.records || [];
            this.totalRecords = result.totalRecords || 0;
            this.isLoading = false; // Hide loading spinner
            this.initialLoadComplete = true;
            
            // Update CSS custom properties
            this.updateCustomProperties();
        })
        .catch(error => {
            // Handle errors during record fetching
            this.handleError(error, 'Error loading records');
            this.records = []; // Clear records on error
            this.totalRecords = 0;
            this.isLoading = false; // Hide loading spinner
        });
    }

    /**
     * Fetches the complete details of a record, including all accessible fields.
     * Called when a record row is clicked in the list view, or when navigating via lookup/breadcrumb.
     * 
     * @param {string} recordId - The Id of the record to fetch details for.
     * @param {string} objectApiName - The API name of the SObject type.
     */
    fetchRecordDetails(recordId, objectApiName) {
        // Error handling
        if (!recordId || !objectApiName) {
            this.handleError('Record ID or Object API Name missing for detail view');
            this.isLoadingRecordDetail = false;
            return;
        }
        
        // Special handling for User IDs to ensure proper object type
        if (recordId.startsWith('005') && objectApiName !== 'User') {
            console.log('Correcting object type from', objectApiName, 'to User for ID', recordId);
            objectApiName = 'User';
        }
        
        this.isLoadingRecordDetail = true;
        console.log(`Fetching details for ${objectApiName} record: ${recordId}`);
        
        // Set the appropriate icon for the object
        this.setIconForObject(objectApiName);
        
        // Show modal if not already visible
        this.showRecordDetail = true;
        
        // Clear prior errors
        this.error = null;
        
        // Fetch the record data with all accessible fields - maintain original parameters order matching Apex
        getRecordAllFields({ objectApiName: objectApiName, recordId: recordId })
            .then(result => {
                console.log('Record details response:', JSON.stringify(result));
                
                // Handle the result based on the actual Apex return format 
                if (result && Array.isArray(result)) {
                    // Success - process the field data array
                    this.detailedFieldsData = result;
                    
                    // Build a record object from the field data
                    const recordData = result.reduce((acc, field) => {
                        acc[field.apiName] = field.value;
                        // Handle reference fields
                        if (field.isReference && field.referenceId) {
                            // Don't assume field.value is a Name field value
                            // Use the display value provided by the server (which has already been determined)
                            acc[field.apiName] = {
                                Id: field.referenceId,
                                DisplayValue: field.value, // Store the display value
                                attributes: { 
                                    type: field.referenceToObject || 'Unknown' // Ensure we have the correct object type
                                }
                            };
                        }
                        return acc;
                    }, { Id: recordId, attributes: { type: objectApiName } });
                    
                    // Store the record data
                    this.selectedRecord = recordData;
                    this.allFieldsForSelectedRecord = recordData;
                    
                    // Load related objects
                    this.loadRelatedObjects(objectApiName);
                    
                    console.log('Processed record data:', JSON.stringify(this.selectedRecord));
                    console.log('Detailed fields data:', JSON.stringify(this.detailedFieldsData));
                } else {
                    // Handle unexpected response format
                    throw new Error('Invalid response format from server');
                }
                
                this.isLoadingRecordDetail = false;
            })
            .catch(error => {
                console.error('Error details:', error);
                
                // Provide a more helpful error message for common issues
                let errorMessage = `Error fetching details for ${objectApiName} record`;
                
                if (error.body && error.body.message) {
                    // Extract the more detailed message from the error body
                    errorMessage = error.body.message;
                    
                    // Check for specific error types and provide more helpful messages
                    if (errorMessage.includes('entity type') && errorMessage.includes('does not support query')) {
                        errorMessage = `Cannot view record details: The object type '${objectApiName}' could not be queried. This might be a system object with limited access.`;
                    } else if (errorMessage.includes('invalid cross reference id')) {
                        errorMessage = `The record could not be found or you don't have access to it.`;
                    }
                }
                
                this.handleError(errorMessage);
                this.isLoadingRecordDetail = false;
            });
    }

    /**
     * Fetches the list of related child *objects* (metadata like label, relationshipName) 
     * for the given object API name. This method can be simplified since we no longer use 
     * dynamic tabs, but keeping the core functionality for future use.
     * 
     * @param {string} objectApiName - The API name of the object to get related objects for.
     */
    loadRelatedObjects(objectApiName) {
        // Clear any previous errors
        this.error = null;

        getRelatedObjects({ objectApiName: objectApiName })
            .then(result => {
                // Store the list of related objects for potential future use
                this.relatedObjects = result || [];
                
                // When the parent record changes, clear the previously loaded related records
                this.relatedRecords = []; 
            })
            .catch(error => {
                // Handle errors fetching related object metadata
                this.handleError(error, `Error loading related objects list for ${objectApiName}`);
                this.relatedObjects = [];
            });
    }

    // --- Event Handlers ---

    /**
     * Handles the click on a record row in the list view. 
     * Opens the first modal page in the navigation stack.
     * 
     * @param {Event} event - The click event from the record row.
     */
    handleRecordClick(event) {
        event.preventDefault();
        
        // Get record ID from the clicked row's data attribute
        const recordId = event.currentTarget.dataset.id;
        
        if (!recordId) {
            this.handleError('Record ID missing from row data');
            return;
        }
        
        this.selectedRecord = null;
        this.detailedFieldsData = [];
        this.relatedObjects = [];
        this.relatedRecords = [];
        this.selectedTab = 'details';
        this.error = null;
        this.showRecordDetail = true;
        this.fetchRecordDetails(recordId, this.objectApiName);
    }

    /**
     * Handles navigation to related records by following lookup/reference fields.
     * Updates navigation stack to support back navigation.
     * 
     * @param {Event} event - The click event from the reference field link.
     */
    handleLookupNavigation(event) {
        event.preventDefault();
        
        // Get the record ID and object API name from the clicked link's data attributes
        const recordId = event.currentTarget.dataset.recordId;
        let objectApiName = event.currentTarget.dataset.objectApiName;
        
        if (!recordId) {
            this.handleError('Missing record ID for lookup navigation');
            return;
        }
        
        // Special handling for User IDs to ensure proper object type
        if (recordId.startsWith('005')) {
            console.log('Detected User ID, ensuring object type is User');
            objectApiName = 'User';
        }
        
        // Ensure we have a valid object API name
        if (!objectApiName || objectApiName === 'Name') {
            // Log error for debugging
            console.error('Invalid object API name for lookup navigation:', objectApiName);
            this.handleError('Cannot navigate to this record: Invalid or unsupported object type.');
            return;
        }
        
        console.log(`Navigating to related record: ${objectApiName}/${recordId}`);
        
        // First, save the current record to the navigation stack
        // This is what enables the back button
        if (this.selectedRecord) {
            this.navigationStack.push({
                recordId: this.selectedRecord.Id,
                objectApiName: this.selectedRecord.attributes.type,
                iconName: this.iconName,
                // Don't use fields that may not exist on all objects
                title: this.recordDetailTitle,
                subtitle: this.recordDetailSubtitle
            });
            console.log('Added to navigation stack:', JSON.stringify(this.navigationStack[this.navigationStack.length - 1]));
        }
        
        // Reset properties for the new record
        this.selectedRecord = null;
        this.detailedFieldsData = [];
        this.relatedObjects = [];
        this.relatedRecords = [];
        this.selectedTab = 'details';
        this.error = null;
        
        // Show loading state
        this.isLoadingRecordDetail = true;
        
        // Fetch the record details for the linked record
        this.fetchRecordDetails(recordId, objectApiName);
    }
    
    /**
     * Handles back navigation from a record to the previous record
     * Pops from navigation stack and navigates to previous record
     * 
     * @param {Event} event - The back button click event
     */
    handleBackNavigation(event) {
        if (event) {
            event.preventDefault();
        }
        
        // Check if we have previous records to navigate back to
        if (this.navigationStack.length === 0) {
            console.log('No previous records to navigate back to');
            return;
        }
        
        // Get the most recent record from the stack
        const previousRecord = this.navigationStack.pop();
        console.log('Navigating back to:', JSON.stringify(previousRecord));
        
        // Reset current record data
        this.selectedRecord = null;
        this.detailedFieldsData = [];
        this.selectedTab = 'details';
        
        // Fetch the previous record details
        this.fetchRecordDetails(previousRecord.recordId, previousRecord.objectApiName);
    }

    /**
     * Closes the record detail modal
     */
    closeRecordDetail() {
        this.showRecordDetail = false;
    }

    /**
     * Handles the `select` event from the `lightning-tabset` in the modal.
     * Updates the `selectedTab` state and triggers loading of related records if a related tab is chosen.
     * 
     * @param {Event} event - The `select` event from `lightning-tabset`.
     */
    handleTabChange(event) {
        const selectedTabValue = event.detail.value;
        this.selectedTab = selectedTabValue;
        
        if (selectedTabValue === 'relatedRecords') {
            this.handleRelatedRecordsClick();
        } else if (selectedTabValue === 'filesAttachments') {
            this.handleFilesAttachmentsClick();
        } else if (selectedTabValue === 'activityHistory') {
            this.handleChatterPostsClick();
        }
    }

    /**
     * Check if the selected record is valid for operations
     * @returns {boolean} True if valid record with required properties
     */
    isValidRecord() {
        return this.selectedRecord && this.selectedRecord.attributes && this.selectedRecord.Id;
    }

    /**
     * Handle related records tab click - automatically load and display related records
     */
    handleRelatedRecordsClick() {
        if (!this.isValidRecord()) {
            this.loadingRelatedRecords = false;
            return;
        }
        
        // If we've already loaded related objects for this record, don't reload
        if (this.relatedObjectsLoaded) {
            return;
        }
        
        this.loadingRelatedObjects = true;
        this.loadingRelatedRecords = true;
        this.relatedRecordsData = [];
        
        // First load available related objects
        loadRelatedObjects({ objectApiName: this.selectedRecord.attributes.type })
            .then(result => {
                this.relatedObjects = result || [];
                
                // If we have related objects, load records for each
                if (this.relatedObjects.length > 0) {
                    return this.loadAllRelatedRecords();
                } else {
                    return Promise.resolve();
                }
            })
            .catch(error => {
                this.handleError(error, 'Error loading related objects');
                return Promise.resolve();
            })
            .finally(() => {
                this.loadingRelatedObjects = false;
            this.loadingRelatedRecords = false;
                this.relatedObjectsLoaded = true;
            });
    }
    
    /**
     * Load records for all related objects
     */
    loadAllRelatedRecords() {
        // Create an array of promises, one for each related object
        const loadPromises = this.relatedObjects.map(relObj => {
            return this.loadRecordsForRelationship(relObj);
        });
        
        // Wait for all promises to resolve
        return Promise.all(loadPromises)
            .then(results => {
                // Filter out empty results and sort by object label
                this.relatedRecordsData = results
                    .filter(item => item && item.records && item.records.length > 0)
                    .sort((a, b) => a.label.localeCompare(b.label));
                
                console.log('Loaded records for', this.relatedRecordsData.length, 'related objects');
            })
            .catch(error => {
                console.error('Error loading related records:', error);
            });
    }
    
    /**
     * Load records for a specific relationship
     */
    loadRecordsForRelationship(relatedObject) {
        return this.fetchRelatedRecords(relatedObject.relationshipName)
            .then(records => {
                if (records && records.length > 0) {
                    console.log('Found', records.length, 'records for', relatedObject.objectApiName);
                    
                    // Add displayName property to each record
                    const processedRecords = records.map(record => {
                        // Copy the record and add displayName
                        return {
                            ...record,
                            displayName: this.formatRecordName(record)
                        };
                    });
                    
                    // Return structured data for this related object and its records
                    return {
                        objectApiName: relatedObject.objectApiName,
                        relationshipName: relatedObject.relationshipName,
                        label: relatedObject.label,
                        records: processedRecords,
                        recordCount: processedRecords.length
                    };
                }
                
                // Return null if no records found
                return null;
            });
    }
    
    /**
     * Check if there are related records to display
     */
    get hasRelatedRecords() {
        return this.relatedRecordsData && this.relatedRecordsData.length > 0;
    }
    
    /**
     * Format a display name for a record
     */
    formatRecordName(record) {
        // Try to use the Name field if available
        if (record.Name) {
            return record.Name;
        }
        
        // For tasks, use Subject
        if (record.Subject) {
            return record.Subject;
        }
        
        // Fallback to record ID
        return record.Id;
    }

    /**
     * Handle Files tab click - automatically load file attachments
     */
    handleFilesAttachmentsClick() {
        if (!this.isValidRecord()) {
            this.loadingFiles = false;
            return;
        }
        
        this.loadingFiles = true;
        this.files = [];
        
        this.fetchRelatedRecords('ContentDocumentLinks')
            .then(result => {
                if (result && result.length > 0) {
                    this.files = this.formatFiles(result);
                } else {
                    this.files = [];
                }
            })
            .catch(error => {
                this.handleError(error, 'Error loading files');
                this.files = [];
            })
            .finally(() => {
                this.loadingFiles = false;
            });
    }
    
    /**
     * Format file records for display
     */
    formatFiles(fileLinks) {
        return fileLinks.map(link => {
            // Try to extract file information from ContentDocument relationship
            const contentDoc = link.ContentDocument || {};
            const fileType = contentDoc.FileType || '';
            
            return {
                id: link.Id,
                title: contentDoc.Title || 'Untitled',
                fileType: fileType,
                iconName: this.getFileIcon(fileType),
                fileSize: this.formatFileSize(contentDoc.ContentSize || 0),
                createdDate: contentDoc.CreatedDate ? this.formatDateTime(contentDoc.CreatedDate) : '',
                createdBy: contentDoc.CreatedBy?.Name || 'Unknown',
                description: contentDoc.Description || '',
                downloadUrl: '/sfc/servlet.shepherd/document/download/' + (contentDoc.Id || '')
            };
        });
    }
    
    /**
     * Get the appropriate SLDS icon for a file type
     */
    getFileIcon(fileType) {
        if (!fileType) return 'doctype:unknown';
        
        const fileTypeLower = fileType.toLowerCase();
        
        // Map common file types to SLDS doctype icons
        const iconMap = {
            'pdf': 'doctype:pdf',
            'doc': 'doctype:word',
            'docx': 'doctype:word',
            'xls': 'doctype:excel',
            'xlsx': 'doctype:excel',
            'csv': 'doctype:csv',
            'ppt': 'doctype:ppt',
            'pptx': 'doctype:ppt',
            'txt': 'doctype:txt',
            'rtf': 'doctype:rtf',
            'html': 'doctype:html',
            'xml': 'doctype:xml',
            'zip': 'doctype:zip',
            'png': 'doctype:image',
            'jpg': 'doctype:image',
            'jpeg': 'doctype:image',
            'gif': 'doctype:image',
            'svg': 'doctype:image',
            'mp4': 'doctype:video',
            'mov': 'doctype:video',
            'mp3': 'doctype:audio',
            'wav': 'doctype:audio',
            'js': 'doctype:code',
            'css': 'doctype:code',
            'java': 'doctype:code',
            'py': 'doctype:code',
            'json': 'doctype:json'
        };
        
        return iconMap[fileTypeLower] || 'doctype:unknown';
    }
    
    /**
     * Format file size in human-readable format
     */
    formatFileSize(bytes) {
        if (!bytes || bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    /**
     * Check if there are files to display
     */
    get hasFiles() {
        return this.files && this.files.length > 0;
    }

    /**
     * Handle Chatter/Activity tab click
     */
    handleChatterPostsClick() {
        if (!this.isValidRecord()) {
            this.loadingChatterPosts = false;
            return;
        }
        
        this.loadingChatterPosts = true;
        this.chatterPosts = [];
        
        // Try to load FeedItems first (this is the standard relationship name)
        this.tryLoadFeedItems()
            .then(success => {
                if (!success) {
                    // If no FeedItems, try ActivityHistories
                    return this.loadActivityHistory();
                }
                return true;
            })
            .finally(() => {
                this.loadingChatterPosts = false;
            });
    }
    
    /**
     * Helper method to fetch related records for a given relationship
     * @param {String} relationshipName - Name of the relationship to query
     * @returns {Promise} Promise that resolves with related records or empty array
     */
    fetchRelatedRecords(relationshipName) {
        if (!this.isValidRecord()) {
            return Promise.resolve([]);
        }
        
        const params = {
            objectApiName: this.selectedRecord.attributes.type,
            parentId: this.selectedRecord.Id,
            relationshipName: relationshipName
        };
        
        return getRelatedRecords(params).catch(() => []);
    }

    /**
     * Try to load FeedItems using the standard relationship
     * @returns {Promise<boolean>} True if items were found
     */
    tryLoadFeedItems() {
        return this.fetchRelatedRecords('FeedItems')
            .then(result => {
                if (result && result.length > 0) {
                    this.chatterPosts = this.formatChatterPosts(result);
                    return true;
                } 
                
                // If no results, try ContentDocumentLinks as additional content
                return this.tryLoadContentDocuments();
            });
    }
    
    /**
     * Try to load ContentDocumentLinks (Files)
     * @returns {Promise<boolean>} True if items were found
     */
    tryLoadContentDocuments() {
        return this.fetchRelatedRecords('ContentDocumentLinks')
            .then(result => {
                if (result && result.length > 0) {
                    // Add files as a special type of activity
                    const fileItems = result.map(link => {
                        return {
                            id: link.Id,
                            createdDate: link.SystemModstamp ? this.formatDateTime(link.SystemModstamp) : '',
                            createdById: link.LastModifiedById,
                            createdByName: 'File Attachment',
                            body: link.ContentDocument?.Description || 'File: ' + (link.ContentDocument?.Title || 'Untitled'),
                            type: 'File',
                            title: link.ContentDocument?.Title || 'File Attachment'
                        };
                    });
                    
                    this.chatterPosts = [...this.chatterPosts, ...fileItems];
                    return true;
                }
                return false;
            });
    }
    
    /**
     * Load activity history as fallback
     */
    loadActivityHistory() {
        return this.fetchRelatedRecords('ActivityHistories')
            .then(result => {
                if (result && result.length > 0) {
                    this.chatterPosts = [...this.chatterPosts, ...this.formatActivityRecords(result)];
                    return true;
                }
                
                // If no ActivityHistories, try Tasks
                return this.tryLoadTasks();
            });
    }
    
    /**
     * Try to load Tasks as a fallback
     * @returns {Promise<boolean>} True if items were found
     */
    tryLoadTasks() {
        return this.fetchRelatedRecords('Tasks')
            .then(result => {
                if (result && result.length > 0) {
                    this.chatterPosts = [...this.chatterPosts, ...this.formatActivityRecords(result)];
                    return true;
                }
                
                return this.tryLoadEvents();
            });
    }
    
    /**
     * Try to load Events as a final fallback
     * @returns {Promise<boolean>} True if items were found
     */
    tryLoadEvents() {
        return this.fetchRelatedRecords('Events')
            .then(result => {
                if (result && result.length > 0) {
                    this.chatterPosts = [...this.chatterPosts, ...this.formatActivityRecords(result)];
                    return true;
                }
                
                return false;
            });
    }
    
    /**
     * Format chatter posts for display
     */
    formatChatterPosts(posts) {
        return posts.map(post => {
            const createdDate = post.CreatedDate ? this.formatDateTime(post.CreatedDate) : '';
            const body = post.Body || '';
            
            return {
                id: post.Id,
                createdDate: createdDate,
                createdById: post.CreatedById,
                createdByName: post.CreatedBy?.Name || 'User',
                body: body,
                type: 'Feed',
                title: 'Post'
            };
        });
    }
    
    /**
     * Format activity records for display
     */
    formatActivityRecords(activities) {
        return activities.map(activity => {
            const activityDate = activity.ActivityDate ? this.formatDate(activity.ActivityDate) : '';
            const subject = activity.Subject || '';
            
            return {
                id: activity.Id,
                createdDate: activityDate,
                createdById: activity.OwnerId,
                createdByName: activity.Owner?.Name || 'User',
                body: activity.Description || '',
                type: activity.attributes.type,
                title: subject
            };
        });
    }
    
    /**
     * Check if there are Chatter posts to display
     */
    get hasChatterPosts() {
        return this.chatterPosts && this.chatterPosts.length > 0;
    }

    /**
     * Handles search input changes with debouncing to prevent excessive server calls.
     * Updates searchTerm and triggers record reload after a short delay.
     * 
     * @param {Event} event - The input change event from the search field.
     */
    handleSearch(event) {
        const searchValue = event.target.value;
        
        // Clear any existing timeout
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
        
        // Set a new timeout for debouncing
        this.searchTimeout = setTimeout(() => {
            // Update the searchTerm property
            this.searchTerm = searchValue;
            
            // Reset to first page when searching
            this.currentPage = 1;
            
            // Load records with the new search term
            this.loadRecords();
        }, 300); // 300ms debounce delay
    }

    /**
     * Handles clicks on pagination buttons to navigate between pages of records.
     * Updates currentPage and triggers a record reload.
     * 
     * @param {Event} event - The click event from a pagination button.
     */
    handlePageChange(event) {
        // Get page number from button data attribute
        const page = parseInt(event.currentTarget.dataset.page, 10);
        
        // Don't do anything if the page is invalid or the same as current
        if (isNaN(page) || page === this.currentPage) {
            return;
        }
        
        // Update current page and reload records
        this.currentPage = page;
        this.loadRecords();
    }

    /**
     * Handles clicks on column headers to sort the data.
     * Updates sortBy and sortDirection properties, then triggers a record reload.
     * 
     * @param {Event} event - The click event from a column header.
     */
    handleSort(event) {
        // Get field name from the clicked column's data attribute
        const field = event.currentTarget.dataset.field;
        
        // Don't sort if no field is provided
        if (!field) {
            return;
        }
        
        // If clicking the current sort field, toggle direction
        // Otherwise, set the new field with ascending direction
        if (this.sortBy === field) {
            this.sortDirection = this.sortDirection === 'asc' ? 'desc' : 'asc';
        } else {
            this.sortBy = field;
            this.sortDirection = 'asc';
        }
        
        // Reload records with new sort parameters
        this.loadRecords();
    }

    // --- Utility Methods ---

    /**
     * Formats a field API name into a more human-readable label.
     * Example: 'MyCustomField__c' becomes 'My Custom Field'.
     * This is a basic implementation and could be enhanced (e.g., using Schema labels if fetched).
     * 
     * @param {string} fieldName - The field API name (e.g., 'BillingCity', 'Account__c').
     * @returns {string} A formatted label string.
     */
    formatFieldLabel(fieldName) {
         if (!fieldName) return '';
         // 1. Remove '__c' suffix for custom fields/objects
         // 2. Replace '__r' suffix for relationship fields (optional, depends on desired display)
         // 3. Replace underscores with spaces
         // 4. Simple Title Case (capitalize first letter of each word)
         return fieldName
             .replace(/__c$/, '') 
             .replace(/__r$/, '') 
             .replace(/_/g, ' ')
             .replace(/\b\w/g, char => char.toUpperCase()); // Capitalize first letter of each word
    }

    /**
     * Applies the configured theme colors (`primaryColor`, `accentColor`, `textColor`)
     * as CSS custom properties on the component's root element. This allows the CSS
     * file to use these dynamic colors via `var(--primary-color)`, etc.
     * Also calculates and sets RGB versions for potential use with `rgba()` for opacity.
     */
     updateCustomProperties() {
        const container = this.template.querySelector('.container'); // Target the main container div
        if (container) {
            // Set the main color properties
            container.style.setProperty('--primary-color', this.primaryColor);
            container.style.setProperty('--accent-color', this.accentColor);
            container.style.setProperty('--text-color', this.textColor);

            // Helper function to extract RGB values from common CSS color formats (hex, rgb)
            const extractRGB = (color) => {
                if (!color) return '0, 0, 0'; // Default to black if color is invalid or missing

                // Handle 3 or 6 digit hex codes (#rgb or #rrggbb)
                if (color.startsWith('#')) {
                    let hex = color.slice(1);
                    if (hex.length === 3) {
                        hex = hex.split('').map(c => c + c).join(''); // Expand #rgb to #rrggbb
                    }
                    if (hex.length === 6) {
                        const r = parseInt(hex.slice(0, 2), 16) || 0;
                        const g = parseInt(hex.slice(2, 4), 16) || 0;
                        const b = parseInt(hex.slice(4, 6), 16) || 0;
                        return `${r}, ${g}, ${b}`;
                    }
                } 
                // Handle rgb() or rgba() formats
                else if (color.startsWith('rgb')) {
                     try {
                         // Extract the comma-separated values inside the parentheses
                         const values = color.match(/\(([^)]+)\)/)[1].split(',').slice(0, 3).map(Number);
                         if (values.length === 3 && values.every(v => !isNaN(v))) {
                             return values.join(',');
                         }
                    } catch (e) {
                         // Ignore parsing errors
                         console.warn(`Could not parse RGB color: ${color}`, e);
                    }
                }

                // Fallback if parsing failed or format is unrecognized
                 console.warn(`Unrecognized color format for RGB extraction: ${color}. Using default black.`);
                return '0, 0, 0'; 
            };

            // Set the RGB versions as CSS custom properties
            container.style.setProperty('--primary-color-rgb', extractRGB(this.primaryColor));
            container.style.setProperty('--accent-color-rgb', extractRGB(this.accentColor));
        }
    }


    /**
     * Provides a standardized way to handle errors encountered within the component.
     * It logs the error to the console for debugging and displays a user-friendly
     * toast notification with the error details. It also updates the `error` property
     * which can optionally be used to display an inline error message in the component's template.
     * 
     * @param {Error | string | object} error - The error object (standard JS Error, Apex error, etc.) or an error message string.
     * @param {string} [contextMessage='An error occurred'] - A brief message describing the context or operation where the error happened.
     */
    handleError(error, contextMessage = 'An error occurred') {
        // Log the full error details to the console for developers
        console.error(contextMessage + ':', error);

        // Attempt to extract a user-friendly message from various error formats
        let message = 'Unknown error'; // Default message
        if (typeof error === 'string') {
            message = error; // If error is just a string
        } else if (error?.body?.message) {
            // Standard Apex error structure passed to LWC
            message = error.body.message;
        } else if (error?.message) {
            // Standard JavaScript Error object message
            message = error.message;
        } else if (error?.statusText) {
             // Possible Fetch API or network error structure
             message = error.statusText;
        } else if (typeof error === 'object') {
            // Fallback for other object types, convert to string
            try {
                message = JSON.stringify(error);
            } catch (e) { /* ignore stringify errors */ }
        }

        // Update the reactive 'error' property - this could be used to display an inline error message in the template.
        // Example: <template if:true={error}><div class="error-panel">{error}</div></template>
         this.error = `${contextMessage}: ${message}`; 

        // Display a toast notification to the user
        try {
        this.dispatchEvent(
            new ShowToastEvent({
                    title: contextMessage, // Show context in the toast title
                    message: message,      // Show extracted message in the body
                    variant: 'error',      // Style as an error toast
                    mode: 'sticky'         // Keep the toast visible until the user dismisses it
                })
            );
        } catch(toastError) {
            console.error('Error dispatching toast notification:', toastError);
            // Fallback if toast fails: maybe update the inline error more prominently
        }
    }


    // --- Getters for Template Logic ---

    /**
     * Processes records for display in the data table, ensuring consistent formatting.
     * 
     * @returns {Array<object>} Records with formatted data ready for display.
     */
    get recordsWithData() {
        if (!this.records || !this.records.length) {
            return [];
        }
        
        return this.records.map(record => {
            // Process each record into display format
            const formattedRecord = { id: record.Id };
            const cellsData = [];
            
            // Format each column's data
            this.columns.forEach(column => {
                const fieldName = column.fieldName;
                let value = record[fieldName];
                
                // Handle relationship fields (they're objects with DisplayValue or other fields)
                if (value && typeof value === 'object') {
                    // If it has DisplayValue property from our server-side formatting
                    if (value.DisplayValue) {
                        value = value.DisplayValue;
                    } 
                    // Fallback to Id if nothing else available
                    else {
                        value = value.Id || '';
                    }
                }
                
                // Convert null/undefined to empty string for display
                if (value === null || value === undefined) {
                    value = '';
                }
                
                // Add to cells for this record
                cellsData.push({
                    key: `${record.Id}-${fieldName}`,
                    value: String(value)
                });
            });
            
            formattedRecord.cellsData = cellsData;
            return formattedRecord;
         });
    }


     /**
      * Calculates the icon name to display next to each sortable column header
      * based on the current `sortBy` and `sortDirection` state.
      * 
      * @returns {Array<object>} An array of column objects, each augmented with an `iconName` property 
      *                          (e.g., 'utility:arrowup', 'utility:arrowdown', or a default).
      */
     get sortIconData() {
         // Map over the defined columns
         return this.columns.map(col => {
             let iconName = 'utility:arrowup'; // Default icon (or consider utility:text for non-sorted)
             // If this column is the currently sorted column
             if (this.sortBy === col.fieldName) {
                 // Set icon based on direction
                 iconName = this.sortDirection === 'asc' ? 'utility:arrowup' : 'utility:arrowdown';
             } else {
                 // Optionally, use a different icon or no icon for non-sorted columns
                 iconName = 'utility:text'; // Example: Subtle icon indicating sortability
             }
             // Return a new object combining the original column data and the calculated icon name
             return {
                 ...col, // Spread existing column properties (label, fieldName, etc.)
                 iconName: iconName // Add the dynamic icon name
             };
         });
     }

    /**
     * Simple boolean getter to check if there are any records loaded for the main list view.
     * Used for conditionally rendering the table or the 'empty state' message.
     * 
     * @returns {boolean} `true` if `records` array has items, `false` otherwise.
     */
    get hasRecords() {
        return this.records && this.records.length > 0;
    }
    
    /**
     * Calculates the total number of pages required for pagination based on `totalRecords` and `recordsPerPage`.
     * 
     * @returns {number} The total number of pages. Returns 0 if no records.
     */
    get totalPages() {
        if (this.recordsPerPage <= 0) return 0; // Avoid division by zero
        return Math.ceil(this.totalRecords / this.recordsPerPage);
    }

    /**
     * Determines if the 'Previous' pagination button should be disabled (i.e., on the first page).
     * 
     * @returns {boolean} `true` if on page 1, `false` otherwise.
     */
    get isPreviousButtonDisabled() {
        return this.currentPage <= 1;
    }

    /**
     * Determines if the 'Next' pagination button should be disabled (i.e., on the last page).
     * 
     * @returns {boolean} `true` if on the last page or if there's only one page, `false` otherwise.
     */
    get isNextButtonDisabled() {
        return this.currentPage >= this.totalPages;
    }

    /**
     * Gets the title for the record detail modal header. 
     * Uses the field specified by `titleField`, falls back to 'Name', then 'Id', then a default string.
     * 
     * @returns {string} The calculated title for the modal.
     */
    get recordDetailTitle() {
        if (!this.selectedRecord) {
            return 'Record Details';
        }
        
        // Use the configured titleField (which defaults to Name but can be changed)
        const titleValue = this.selectedRecord[this.titleField];
        
        // Handle when the title field is not available or null
        if (titleValue === undefined || titleValue === null) {
            return `${this.selectedRecord.attributes.type} Record`;
        }
        
        // Handle reference fields which are stored as objects with DisplayValue
        if (titleValue && typeof titleValue === 'object' && titleValue.DisplayValue) {
            return titleValue.DisplayValue;
        }
        
        return String(titleValue);
    }

    /**
     * Get subtitle for record detail modal that doesn't rely on Name field
     */
    get recordDetailSubtitle() {
        if (!this.selectedRecord) {
            return '';
        }
        
        // If subtitleField is specified and available, use it
        if (this.subtitleField && this.selectedRecord[this.subtitleField]) {
            const subtitleValue = this.selectedRecord[this.subtitleField];
            
            // Handle reference fields
            if (subtitleValue && typeof subtitleValue === 'object' && subtitleValue.DisplayValue) {
                return subtitleValue.DisplayValue;
            }
            
            return String(subtitleValue);
        }
        
        // Fallback to showing record ID
        return `Record ID: ${this.selectedRecord.Id}`;
    }

    /**
     * Processes the detailed field data for display in the modal's 'Details' tab.
     * 
     * @returns {Array<object>} An array of field objects ready for display.
     */
    get displayFields() {
        console.log('displayFields getter called');
        // If the detailed field data hasn't loaded yet, return an empty array.
        if (!this.detailedFieldsData || !Array.isArray(this.detailedFieldsData) || this.detailedFieldsData.length === 0 || this.isLoadingRecordDetail) {
            console.log('No detailed fields data available');
            return [];
        }

        const fieldsToDisplay = [];
        
        // List of system fields to exclude
        const systemFields = [
            'id', 'isdeleted', 'createddate', 'createdbyid', 'lastmodifieddate', 
            'lastmodifiedbyid', 'systemmodstamp', 'lastactivitydate', 'lastvieweddate', 
            'lastreferenceddate'
        ];
        
        console.log(`Processing ${this.detailedFieldsData.length} fields for display`);
        
        // Process field data
        this.detailedFieldsData.forEach(field => {
            // Skip fields with missing required properties
            if (!field.apiName || !field.label) {
                console.log(`Skipping field with missing properties:`, field);
                return;
            }
            
            // Skip system fields
            if (systemFields.includes(field.apiName.toLowerCase())) {
                console.log(`Skipping system field: ${field.apiName}`);
                return;
            }
            
            // Format the value based on field type
            let displayValue = this.formatFieldValue(field);
            
            // Make sure reference fields have a valid object API name - never use "Name" as an object type
            if (field.isReference && (!field.referenceToObject || field.referenceToObject === 'Name')) {
                console.log(`Warning: Reference field ${field.apiName} has invalid object type: ${field.referenceToObject}`);
                // Skip fields with invalid reference object types to prevent navigation errors
                if (!field.referenceToObject) {
                    field.isReference = false; // Don't treat as reference if no valid object type
                }
            }
            
            // Add the field to the display list
            fieldsToDisplay.push({
                fieldName: field.apiName,
                label: this.formatFieldLabel(field.label), // Format label for display
                value: displayValue,
                isReference: field.isReference || false,
                referenceId: field.referenceId || null,
                referenceToObject: field.referenceToObject || null
            });
        });

        // Group related fields together and sort
        return this.sortFieldsForDisplay(fieldsToDisplay);
    }

    /**
     * Sort fields to show standard fields first, then custom fields, with logical grouping.
     */
    sortFieldsForDisplay(fields) {
        // Group fields by "related" concepts
        const ownerFields = ['OwnerId', 'Owner', 'CreatedById', 'CreatedBy', 'LastModifiedById', 'LastModifiedBy'];
        const dateFields = ['CreatedDate', 'LastModifiedDate', 'LastActivityDate'];
        const nameFields = ['Name', 'FirstName', 'LastName', 'Title', 'Subject', 'CaseNumber'];
        
        // Assign grouping weights to determine display order
        const getWeight = (fieldName) => {
            const lowerName = fieldName.toLowerCase();
            if (nameFields.some(f => lowerName.includes(f.toLowerCase()))) return 1;  // Name fields first
            if (ownerFields.some(f => lowerName.includes(f.toLowerCase()))) return 50; // Owner fields at end
            if (dateFields.some(f => lowerName.includes(f.toLowerCase()))) return 40;  // Date fields near end
            if (lowerName.endsWith('__c')) return 30; // Custom fields in the middle
            return 20; // Other standard fields
        };
        
        // Sort by weight and then alphabetically within groups
        return fields.sort((a, b) => {
            const weightA = getWeight(a.fieldName);
            const weightB = getWeight(b.fieldName);
            if (weightA !== weightB) return weightA - weightB;
            return a.label.localeCompare(b.label);
        });
    }

    /**
     * Format field values for display based on their type.
     */
    formatFieldValue(field) {
        // Handle null/undefined
        if (field.value === null || field.value === undefined) {
            return '';
        }
        
        // Format based on type
        switch (field.type) {
            case 'BOOLEAN':
                return field.value ? 'Yes' : 'No';
            case 'DATE':
                return this.formatDate(field.value);
            case 'DATETIME':
                return this.formatDateTime(field.value);
            case 'CURRENCY':
                return this.formatCurrency(field.value);
            case 'PERCENT':
                return `${field.value}%`;
            case 'PHONE':
                return field.value; // Already formatted by Salesforce
            case 'EMAIL':
                return field.value; // Already formatted by Salesforce
            case 'URL':
                return field.value; // URLs will be handled as regular text unless special UI needed
            default:
                return field.value.toString();
        }
    }

    /**
     * Format date values for display.
     */
    formatDate(dateStr) {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString();
        } catch (e) {
            return dateStr; // Return original if parsing fails
        }
    }

    /**
     * Format datetime values for display.
     */
    formatDateTime(dateTimeStr) {
        try {
            const date = new Date(dateTimeStr);
            return date.toLocaleString();
        } catch (e) {
            return dateTimeStr; // Return original if parsing fails
        }
    }

    /**
     * Format currency values for display.
     */
    formatCurrency(value) {
        try {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
            }).format(value);
        } catch (e) {
            return value.toString(); // Return original if formatting fails
        }
    }

    /**
     * Checks if there are any fields prepared for display in the modal's 'Details' tab.
     * 
     * @returns {boolean} `true` if `displayFields` array is empty AND not currently loading.
     */
    get noFieldsToDisplay() {
        const hasNoFields = !this.isLoadingRecordDetail && this.displayFields.length === 0;
        console.log(`noFieldsToDisplay: ${hasNoFields} (isLoading=${this.isLoadingRecordDetail}, displayFieldsLength=${this.displayFields.length})`);
        
        if (hasNoFields) {
            console.log('Detailed field data state:', JSON.stringify({
                detailedFieldsDataExists: !!this.detailedFieldsData,
                detailedFieldsDataLength: this.detailedFieldsData ? this.detailedFieldsData.length : 0,
                selectedRecordExists: !!this.selectedRecord
            }));
        }
        
        return hasNoFields;
    }

    /**
     * Whether there's a record to go back to in the navigation stack
     */
    get hasBackRecord() {
        return this.navigationStack && this.navigationStack.length > 0;
    }

    /**
     * Sets the appropriate icon for the given object type
     * 
     * @param {string} objectApiName - The API name of the object
     */
    setIconForObject(objectApiName) {
        if (!objectApiName) return;
        
        // Common standard objects use their own icons
        const standardObjects = {
            'Account': 'standard:account',
            'Contact': 'standard:contact',
            'Lead': 'standard:lead',
            'Opportunity': 'standard:opportunity',
            'Case': 'standard:case',
            'Task': 'standard:task',
            'User': 'standard:user',
            'Campaign': 'standard:campaign',
            'Contract': 'standard:contract',
            'Order': 'standard:orders',
            'Product2': 'standard:product',
            'Asset': 'standard:asset'
        };
        
        // If it's a standard object with a predefined icon, use it
        if (standardObjects[objectApiName]) {
            this.iconName = standardObjects[objectApiName];
        } 
        // For custom objects, use the custom icon with appropriate number
        else if (objectApiName.endsWith('__c')) {
            // Determine which custom icon to use (1-100) based on object name
            // This is simplified - in a production environment you might want a more sophisticated approach
            const hash = Array.from(objectApiName).reduce((acc, char) => acc + char.charCodeAt(0), 0);
            const iconNum = (hash % 100) + 1; // Get a number between 1 and 100
            this.iconName = `standard:custom${iconNum}`;
        } 
        // Default to generic icon
        else {
            this.iconName = 'standard:default';
        }
        
        console.log(`Set icon for ${objectApiName} to ${this.iconName}`);
    }

    /**
     * Returns the previous page number, used by the pagination "previous" button.
     * 
     * @returns {number} The previous page number.
     */
    get previousPage() {
        return this.currentPage - 1;
    }

    /**
     * Returns the next page number, used by the pagination "next" button.
     * 
     * @returns {number} The next page number.
     */
    get nextPage() {
        return this.currentPage + 1;
    }

    /**
     * Determines whether to show pagination controls based on total records.
     * 
     * @returns {boolean} True if pagination should be displayed.
     */
    get showPagination() {
        return this.totalRecords > this.recordsPerPage;
    }

    // Object icon for list header - automatically determined from objectApiName
    get objectIcon() {
        if (!this.objectApiName) return 'standard:default';
        
        // Handle standard objects with predefined icons
        const standardObjects = {
            'Account': 'standard:account',
            'Contact': 'standard:contact',
            'Lead': 'standard:lead',
            'Opportunity': 'standard:opportunity',
            'Case': 'standard:case',
            'Task': 'standard:task',
            'User': 'standard:user',
            'Campaign': 'standard:campaign',
            'Contract': 'standard:contract',
            'Order': 'standard:orders',
            'Product2': 'standard:product',
            'Asset': 'standard:asset'
        };
        
        // If it's a known standard object, use its icon
        if (standardObjects[this.objectApiName]) {
            return standardObjects[this.objectApiName];
        } 
        
        // For custom objects, use the custom icon
        if (this.objectApiName.endsWith('__c')) {
            return 'standard:custom';
        }
        
        // Default icon
        return 'standard:default';
    }

    // Human-readable object label for the header
    get objectLabel() {
        if (!this.objectApiName) return 'Records';
        
        // Simple logic to format the API name for display
        // In a real implementation, you might fetch labels via Schema
        let label = this.objectApiName;
        
        // Remove __c for custom objects
        if (label.endsWith('__c')) {
            label = label.substring(0, label.length - 3);
        }
        
        // Split by capital letters and join with spaces
        label = label.replace(/([A-Z])/g, ' $1').trim();
        
        // Title case the label
        return label.charAt(0).toUpperCase() + label.slice(1);
    }

    // Human-readable sort field label for the header
    get sortByLabel() {
        return this.formatFieldLabel(this.sortBy);
    }

    // For template binding - filter panel classes
    get filterPanelClass() {
        return this.showFilterPanel 
            ? 'filter-panel expanded' 
            : 'filter-panel collapsed';
    }
    
    // Available fields for filtering
    get fieldOptions() {
        // Create options from columns
        return this.columns.map(column => {
            return {
                label: column.label,
                value: column.fieldName
            };
        });
    }
    
    // Available operators for filtering
    get operatorOptions() {
        return [
            { label: 'Equals', value: 'equals' },
            { label: 'Not Equals', value: 'notEquals' },
            { label: 'Contains', value: 'contains' },
            { label: 'Starts With', value: 'startsWith' },
            { label: 'Ends With', value: 'endsWith' },
            { label: 'Less Than', value: 'lessThan' },
            { label: 'Greater Than', value: 'greaterThan' },
            { label: 'Is Null', value: 'isNull' },
            { label: 'Is Not Null', value: 'isNotNull' }
        ];
    }
    
    // Whether the apply filter button should be enabled
    get canApplyFilter() {
        // Enable if we have field and operator selected
        // For isNull/isNotNull, we don't need a value
        if (!this.selectedField || !this.selectedOperator) return false;
        
        if (this.selectedOperator === 'isNull' || this.selectedOperator === 'isNotNull') {
            return true;
        }
        
        return this.fieldValue && this.fieldValue.trim() !== '';
    }
    
    // For template binding - disabled states
    get isOperatorDisabled() {
        return !this.selectedField;
    }
    
    get isValueDisabled() {
        return !this.selectedOperator;
    }
    
    get isApplyDisabled() {
        return !this.canApplyFilter;
    }

    // Toggle filter panel visibility
    toggleFilterPanel() {
        this.showFilterPanel = !this.showFilterPanel;
    }
    
    handleFieldSelection(event) {
        this.selectedField = event.detail.value;
        // Reset dependent values
        this.selectedOperator = null;
        this.fieldValue = '';
    }
    
    handleOperatorSelection(event) {
        this.selectedOperator = event.detail.value;
        // Reset field value
        this.fieldValue = '';
    }
    
    handleFieldValueChange(event) {
        this.fieldValue = event.detail.value;
    }
    
    applyFilter() {
        if (!this.canApplyFilter) return;
        
        const filter = {
            field: this.selectedField,
            operator: this.selectedOperator,
            value: this.fieldValue
        };
        
        // Format the filter as JSON string for the backend
        this.appliedFilters = JSON.stringify([filter]);
        
        console.log('Applying filter:', this.appliedFilters);
        
        // Hide the filter panel
        this.showFilterPanel = false;
        
        // Reset to first page and reload records with the new filter
        this.currentPage = 1;
        this.loadRecords();
    }
    
    clearFilters() {
        // Clear filter UI state
        this.selectedField = null;
        this.selectedOperator = null;
        this.fieldValue = '';
        
        // Clear applied filters
        this.appliedFilters = null;
        
        console.log('Clearing filters');
        
        // Reload records without filters
        this.currentPage = 1;
        this.loadRecords();
        
        // Close the filter panel
        this.showFilterPanel = false;
    }
}