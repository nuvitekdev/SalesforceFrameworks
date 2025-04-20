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

    /** 
     * Required. The API name of the SObject to display in the list view (e.g., 'Account', 'MyCustomObject__c'). 
     */
    @api objectApiName;
    /** 
     * Required. A comma-separated string of field API names to display as columns in the list view (e.g., 'Name,BillingCity,Owner.Name'). 
     * Relationship fields (like Owner.Name) might require specific handling in Apex or post-processing if not directly supported by the basic query.
     */
    @api listViewFields;
    /** 
     * Optional. The field API name to use for the main title in the record detail modal. Defaults to 'Name'.
     */
    @api titleField = 'Name'; 
    /** 
     * Optional. The field API name to use for the subtitle in the record detail modal. 
     */
    @api subtitleField;
    /** 
     * Optional. The SLDS icon name to display in the modal header (e.g., 'standard:account', 'custom:custom14'). Defaults to 'standard:default'.
     */
    @api iconName = 'standard:default'; 
    /** 
     * Optional. The number of records to display per page in the list view. Defaults to 10.
     */
    @api recordsPerPage = 10; 
    /** 
     * Optional. Primary theme color (e.g., CSS color value like '#22BDC1' or 'rgb(34, 189, 193)'). 
     * Used for styling elements like buttons or highlights via CSS variables.
     */
    @api primaryColor = '#22BDC1';
    /** 
     * Optional. Accent theme color. 
     */
    @api accentColor = '#D5DF23';
    /** 
     * Optional. Main text color. 
     */
    @api textColor = '#1d1d1f';
    
    // --- Internal Component State (Tracked Properties) ---

    // List View State
    /** @type {Array<object>} Columns configuration for the list view table. */
    @track columns = [];
    /** @type {Array<object>} Records currently displayed in the list view page. */
    @track records = [];
    /** @type {number} Total number of records matching the current filter/search criteria. */
    @track totalRecords = 0;
    /** @type {number} The current page number being displayed in the list view. */
    @track currentPage = 1;
    /** @type {string} The API name of the field the list view is currently sorted by. */
    @track sortBy = 'Name'; // Default sort field
    /** @type {'asc' | 'desc'} The current sort direction ('asc' or 'desc'). */
    @track sortDirection = 'asc';
    /** @type {string} The current search term entered by the user. */
    @track searchTerm = '';
    /** @type {boolean} Indicates if the main list view is currently loading data. */
    @track isLoading = false;
    /** @type {string | null} Holds the error message to be displayed, if any. */
    @track error = null;

    // Modal State
    /** @type {boolean} Controls the visibility of the record detail modal. */
    @track showRecordDetail = false; 
    /** @type {object | null} Holds the *complete* data (all accessible fields) of the record currently being viewed *in the modal*. This object updates during lookup/breadcrumb navigation. */
    @track selectedRecord = null; 
    /** @type {boolean} Indicates if the modal is currently loading data (e.g., fetching full details or related records). */
    @track isLoadingRecordDetail = false; 
    /** @type {Array<object>} List of related child objects (metadata like label, relationshipName) for the `selectedRecord`. Fetched via `getRelatedObjects`. */
    @track relatedObjects = [];
    /** @type {string} The currently active tab value in the modal ('details' or a relationshipName). */
    @track selectedTab = 'details';
    /** @type {Array<object>} The list of actual related records for the currently selected related list tab. Fetched via `getRelatedRecords`. */
    @track relatedRecords = [];
    /** @type {boolean} Indicates if the related records list (within a modal tab) is currently loading. */
    @track loadingRelatedRecords = false;
    
    // --- Additional properties for More menu and breadcrumbs ---
    // @track relatedBreadcrumbs = []; // Breadcrumbs for related records
    // @track showRelatedBreadcrumbs = false; // Control visibility of related breadcrumbs

    // --- Private Internal Properties (Not tracked, used for internal logic) ---

    /** Timeout ID used for debouncing the search input handler. */
    searchTimeout;
    /** Flag to ensure initial configuration and data load happens only once. */
    initialLoadComplete = false;
    /** Stores the full SObject data fetched by `getRecordAllFields` for the record currently shown in the modal. Separate from `selectedRecord` which might initially hold partial list view data. */
    allFieldsForSelectedRecord = {}; 
    /** Stores the detailed field list (with type info) fetched by `getRecordAllFields` */
    detailedFieldsData = [];

    // --- Component State Properties ---
    @track navigationStack = []; // Array of pages in the navigation stack
    
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
            fieldsList.forEach(f => requiredForFetch.add(f)); // Add all specified list view fields

            // 3. Prepare `columns` array for the list view table (don't include 'Id' column visually)
            this.columns = fieldsList
                .filter(fieldName => fieldName.toLowerCase() !== 'id') // Filter out 'Id' from visual columns
                .map(fieldName => ({
                    label: this.formatFieldLabel(fieldName), // Generate a readable label
                        fieldName: fieldName,
                    sortable: true // Assume all specified fields are sortable initially
                }));

            // 4. Set default sort field ('Name' if available, otherwise first field in list)
            // Ensure the default sortBy field is actually in our fetch list.
             if (!this.sortBy || !requiredForFetch.has(this.sortBy)) {
                this.sortBy = requiredForFetch.has('Name') ? 'Name' : (fieldsList[0] || 'Id'); // Fallback to Id if list is empty somehow
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
            filters: '[]', // Filters not implemented in this version yet, pass empty JSON array
            recordsPerPage: this.recordsPerPage,
            pageNumber: this.currentPage,
            searchTerm: this.searchTerm
        })
        .then(result => {
            // Update component state with the fetched data
            this.records = result.records || [];
            this.totalRecords = result.totalRecords || 0;
            this.isLoading = false; // Hide loading spinner
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
            console.error('Missing recordId or objectApiName in fetchRecordDetails');
            this.handleError('Missing data for record lookup.');
            return;
        }
        
        // Set loading indicators
        this.isLoadingRecordDetail = true;
        this.showRecordDetail = true; // Show modal if not already visible
        this.error = null; // Clear prior errors
        
        console.log(`Fetching details for ${objectApiName}/${recordId}`);
        
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
                            acc[field.apiName] = {
                                Id: field.referenceId,
                                Name: field.value,
                                attributes: { type: field.referenceToObject }
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
                console.error('Error loading record details:', error);
                this.handleError(error, `Error loading ${objectApiName} record`);
                this.isLoadingRecordDetail = false;
            });
    }

    /**
     * Fetches the list of related child *objects* (metadata like label, relationshipName) 
     * for the given object API name. Uses the *optimized* Apex method which includes filtering
     * and limits to prevent errors. Called after `fetchRecordDetails` succeeds.
     * 
     * @param {string} objectApiName - The API name of the object to get related objects for (typically the type of `selectedRecord`).
     */
    loadRelatedObjects(objectApiName) {
         // This usually happens quickly as part of the detail load, so no separate loading indicator unless needed.
         this.error = null; // Clear related errors

        getRelatedObjects({ objectApiName: objectApiName })
            .then(result => {
                // Store the list of related objects (used to build the tabs)
                this.relatedObjects = result || [];
                 
                 // When the parent record changes (due to lookup/breadcrumb navigation), 
                 // we need to clear the previously loaded related records list.
                 this.relatedRecords = []; 

                 // Also, if the previously selected tab was a relationship name, 
                 // check if that relationship still exists for the *new* parent object.
                 // If not, reset the active tab back to 'details'.
                 if (this.selectedTab !== 'details' && !this.relatedObjects.some(rel => rel.relationshipName === this.selectedTab)) {
                    this.selectedTab = 'details';
                 }
            })
            .catch(error => {
                // Handle errors fetching related object metadata
                this.handleError(error, `Error loading related objects list for ${objectApiName}`);
                this.relatedObjects = []; // Clear related objects list on error
            });
    }

    /**
     * Fetches the actual related child *records* based on the currently selected related object tab (`selectedTab`).
     * Called when a related object tab is clicked in the modal (`handleTabChange`).
     */
    loadRelatedRecords() {
        // Guard conditions: Ensure we have a selected record loaded and the active tab is actually a relationship name.
        if (!this.selectedRecord || !this.selectedRecord.Id || this.selectedTab === 'details') {
             this.relatedRecords = []; // Clear list if conditions aren't met
             console.log('Cannot load related records: missing record data or "details" tab is selected');
            return;
        }

        // Find the specific related object metadata for the selected tab
        const selectedRelationship = this.relatedObjects.find(rel => rel.relationshipName === this.selectedTab);
        if (!selectedRelationship) {
            console.error(`No relationship metadata found for tab: ${this.selectedTab}`);
            this.loadingRelatedRecords = false;
            this.relatedRecords = [];
            return;
        }

        console.log(`Loading related records for: ${selectedRelationship.label} (${this.selectedTab})`);
        
        this.loadingRelatedRecords = true; // Show loading indicator within the tab content
        this.error = null; // Clear related errors

        // Find the metadata for the selected relationship (needed for the parent objectApiName)
        // The parent objectApiName is the type of the record currently in the modal (`selectedRecord`).
        const parentObjectApiName = this.selectedRecord.attributes?.type; 
        if (!parentObjectApiName) {
            console.error('Cannot determine parent object API name for loading related records.');
            this.handleError('Internal Error: Missing parent object type.', 'Related Records Load Error');
            this.loadingRelatedRecords = false;
            this.relatedRecords = [];
            return;
        }

        // Call Apex to get the related records
        getRelatedRecords({
             objectApiName: parentObjectApiName, // API name of the *parent* record (the one in the modal)
            parentId: this.selectedRecord.Id, // ID of the parent record
            relationshipName: this.selectedTab // The relationshipName selected via the tab
        })
        .then(result => {
            // Update state with the fetched related records (Apex currently returns Id, Name)
            // Could enhance Apex to return more fields if needed for display.
            this.relatedRecords = result || [];
            console.log(`Successfully loaded ${this.relatedRecords.length} related records`);
            this.loadingRelatedRecords = false; // Hide loading indicator
        })
        .catch(error => {
            // Handle errors during related record fetch
            console.error(`Error loading related records:`, error);
            this.handleError(error, `Error loading related ${this.selectedTab} records`);
            this.relatedRecords = []; // Clear list on error
            this.loadingRelatedRecords = false; // Hide loading indicator
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
        
        console.log(`Record clicked: ${recordId}`);
        
        // Reset properties
        this.selectedRecord = null;
        this.detailedFieldsData = [];
        this.relatedObjects = [];
        this.relatedRecords = [];
        this.selectedTab = 'details';
        
        // Clear any existing errors
        this.error = null;
        
        // Show the modal - fetchRecordDetails will populate it
        this.showRecordDetail = true;
        
        // Fetch the record details
        this.fetchRecordDetails(recordId, this.objectApiName);
    }

    /**
     * Handles navigation to a lookup/reference record when clicked in the detail panel or related list.
     * 
     * @param {Event} event - The click event from the lookup link.
     */
    handleLookupNavigation(event) {
        event.preventDefault(); // Prevent default link behavior
        
        // Get record ID and object API name from the clicked link's data attributes
        const recordId = event.currentTarget.dataset.recordId;
        const objectApiName = event.currentTarget.dataset.objectApiName;
        
        if (!recordId || !objectApiName) {
            console.error('Missing recordId or objectApiName for lookup navigation');
            return;
        }
        
        console.log(`Navigating to lookup: ${objectApiName}/${recordId}`);
        
        // Reset data
        this.selectedRecord = null;
        this.detailedFieldsData = [];
        
        // Fetch the record details for the looked-up record
        this.fetchRecordDetails(recordId, objectApiName);
    }
    
    /**
     * Handles back navigation from a related record modal
     * 
     * @param {string} modalId - The ID of the modal to navigate back from
     */
    handleBackNavigation(modalId) {
        const modalElement = this.template.querySelector(`#${modalId}`);
        if (modalElement) {
            // Animation to slide out
            modalElement.classList.remove('active');
            
            // Remove from DOM after animation completes
            setTimeout(() => {
                modalElement.remove();
            }, 300);
        }
    }
    
    /**
     * Closes a related record modal
     * 
     * @param {string} modalId - The ID of the modal to close
     */
    closeRelatedModal(modalId) {
        const modalElement = this.template.querySelector(`#${modalId}`);
        if (modalElement) {
            modalElement.remove();
        }
    }
    
    /**
     * Closes the record detail modal and all related modals
     */
    closeRecordDetail() {
        this.showRecordDetail = false;
    }

    /**
     * Adds a new page to the navigation stack and loads its data
     * 
     * @param {string} recordId - The record ID to display in the new page
     * @param {string} objectApiName - The API name of the object
     * @param {number} parentIndex - The index of the parent page (for back navigation)
     */
    addPageToStack(recordId, objectApiName, parentIndex = -1) {
        // Generate a unique ID for this page
        const pageId = `page-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const headingId = `heading-${pageId}`;
        const contentId = `content-${pageId}`;
        
        // Create the page object with initial state
        const newPage = {
            id: pageId,
            headingId: headingId,
            contentId: contentId,
            recordId: recordId,
            objectApiName: objectApiName,
            title: `Loading ${objectApiName} record...`,
            subtitle: '',
            objectLabel: objectApiName,
            iconName: this.getIconForObjectType(objectApiName),
            isLoading: true,
            selectedTab: 'details',
            displayFields: [],
            relatedObjectTabsData: [],
            relatedRecords: [],
            loadingRelatedRecords: false,
            noFieldsToDisplay: false,
            showBackButton: parentIndex >= 0,
            previousPageIndex: parentIndex,
            previousPageTitle: parentIndex >= 0 ? this.getPreviousPageTitle(parentIndex) : '',
            pageClasses: `page-modal record-modal slds-modal slds-fade-in-open ${this.getPagePositionClass(this.navigationStack.length)}`
        };
        
        // Add the new page to the navigation stack
        this.navigationStack = [...this.navigationStack, newPage];
        
        // Update the position classes for all pages in the stack
        this.updatePagePositionClasses();
        
        // Load the page data
        this.fetchPageDetails(this.navigationStack.length - 1);
    }

    /**
     * Updates the position classes for all pages in the navigation stack
     */
    updatePagePositionClasses() {
        const stackLength = this.navigationStack.length;
        
        if (stackLength <= 0) return;
        
        // Create a new array to ensure reactivity
        const updatedStack = this.navigationStack.map((page, index) => {
            return {
                ...page,
                pageClasses: `page-modal record-modal slds-modal slds-fade-in-open ${this.getPagePositionClass(index, stackLength - 1)}`
            };
        });
        
        this.navigationStack = updatedStack;
    }

    /**
     * Determines the position class for a page based on its index
     * 
     * @param {number} pageIndex - The index of the page in the stack
     * @param {number} activeIndex - The index of the currently active page
     * @returns {string} The CSS class for positioning
     */
    getPagePositionClass(pageIndex, activeIndex = null) {
        if (activeIndex === null) {
            // When adding a new page, it's active by default
            return 'active';
        } else if (pageIndex === activeIndex) {
            return 'active';
        } else if (pageIndex < activeIndex) {
            return 'previous';
        } else {
            return 'next';
        }
    }

    /**
     * Gets the title of a previous page for back button labeling
     * 
     * @param {number} index - The index of the previous page
     * @returns {string} The title of the previous page
     */
    getPreviousPageTitle(index) {
        if (index >= 0 && index < this.navigationStack.length) {
            return this.navigationStack[index].title || 'Previous Record';
        }
        return 'Previous Record';
    }

    /**
     * Gets the appropriate icon name for an object type
     * 
     * @param {string} objectApiName - The API name of the object
     * @returns {string} The icon name to use
     */
    getIconForObjectType(objectApiName) {
        // Map common objects to their icons
        const iconMap = {
            'Account': 'standard:account',
            'Contact': 'standard:contact',
            'Opportunity': 'standard:opportunity',
            'Case': 'standard:case',
            'Lead': 'standard:lead',
            'User': 'standard:user',
            'Task': 'standard:task',
            'Event': 'standard:event',
            'Attachment': 'standard:file',
            'ContentDocument': 'standard:document'
        };
        
        // Try to get a specific icon, or fallback to default
        return iconMap[objectApiName] || this.iconName || 'standard:default';
    }

    /**
     * Fetches details for a specific page in the navigation stack
     * 
     * @param {number} pageIndex - The index of the page in the stack
     */
    fetchPageDetails(pageIndex) {
        if (pageIndex < 0 || pageIndex >= this.navigationStack.length) {
            console.error('Invalid page index for fetchPageDetails:', pageIndex);
            return;
        }
        
        const page = this.navigationStack[pageIndex];
        const { recordId, objectApiName } = page;
        
        console.log(`Fetching details for page ${pageIndex}: ${objectApiName}/${recordId}`);
        
        // Call Apex to get record details - maintain original parameters order matching Apex
        getRecordAllFields({ objectApiName: objectApiName, recordId: recordId })
            .then(result => {
                // Handle the result based on the actual Apex return format
                if (result && Array.isArray(result)) {
                    // Process the field data array
                    const displayFields = this.processFieldsForDisplay(result);
                    
                    // Build a record object from the field data
                    const recordData = result.reduce((acc, field) => {
                        acc[field.apiName] = field.value;
                        // Handle reference fields
                        if (field.isReference && field.referenceId) {
                            acc[field.apiName] = {
                                Id: field.referenceId,
                                Name: field.value,
                                attributes: { type: field.referenceToObject }
                            };
                        }
                        return acc;
                    }, { Id: recordId, attributes: { type: objectApiName } });
                    
                    // Extract record name for title
                    const nameField = result.find(f => f.apiName === this.titleField || f.apiName === 'Name');
                    const title = nameField?.value || `${objectApiName} Record`;
                    
                    // Extract subtitle if configured
                    let subtitle = '';
                    if (this.subtitleField) {
                        const subtitleField = result.find(f => f.apiName === this.subtitleField);
                        subtitle = subtitleField?.value || '';
                    }
                    
                    // Update the page in the navigation stack
                    this.updatePageInStack(pageIndex, {
                        isLoading: false,
                        title: title,
                        subtitle: subtitle,
                        displayFields: displayFields,
                        record: recordData,
                        noFieldsToDisplay: displayFields.length === 0
                    });
                    
                    // Load related objects for this page
                    this.loadRelatedObjectsForPage(pageIndex, objectApiName);
                } else {
                    throw new Error('Invalid response format from server');
                }
            })
            .catch(error => {
                console.error('Error loading record details:', error);
                this.handleError(error, `Error loading ${objectApiName} record`);
                
                // Update page with error state
                this.updatePageInStack(pageIndex, {
                    isLoading: false,
                    title: `${objectApiName} (Error)`,
                    noFieldsToDisplay: true
                });
            });
    }

    /**
     * Processes field data into a format suitable for display
     * 
     * @param {Array} fieldsData - The array of field data objects from Apex
     * @returns {Array} Processed fields ready for display
     */
    processFieldsForDisplay(fieldsData) {
        if (!fieldsData || !Array.isArray(fieldsData)) return [];
        
        return fieldsData
            .filter(field => field.label && field.apiName) // Ensure required properties
            .map(field => ({
                label: field.label,
                value: field.value || '',
                fieldName: field.apiName,
                isReference: field.isReference || false,
                referenceId: field.referenceId || null,
                referenceToObject: field.referenceToObject || null
            }));
    }

    /**
     * Updates a specific page in the navigation stack
     * 
     * @param {number} pageIndex - The index of the page to update
     * @param {Object} updates - The properties to update
     */
    updatePageInStack(pageIndex, updates) {
        if (pageIndex < 0 || pageIndex >= this.navigationStack.length) {
            console.error('Invalid page index for updatePageInStack:', pageIndex);
            return;
        }
        
        // Create a new array with the updated page
        const updatedStack = [...this.navigationStack];
        updatedStack[pageIndex] = {
            ...updatedStack[pageIndex],
            ...updates
        };
        
        this.navigationStack = updatedStack;
    }

    /**
     * Loads related objects for a specific page
     * 
     * @param {number} pageIndex - The index of the page
     * @param {string} objectApiName - The API name of the object
     */
    loadRelatedObjectsForPage(pageIndex, objectApiName) {
        getRelatedObjects({ objectApiName: objectApiName })
            .then(result => {
                // Process related objects for tabs
                const relatedObjectTabsData = this.processRelatedObjectsForTabs(result);
                
                // Update the page
                this.updatePageInStack(pageIndex, {
                    relatedObjectTabsData: relatedObjectTabsData
                });
            })
            .catch(error => {
                console.error('Error loading related objects:', error);
                this.handleError(error, `Error loading related objects for ${objectApiName}`);
            });
    }

    /**
     * Processes related objects data into a format suitable for tabs
     * 
     * @param {Array} relatedObjects - The array of related objects from Apex
     * @returns {Array} Processed related objects ready for tabs
     */
    processRelatedObjectsForTabs(relatedObjects) {
        if (!relatedObjects || !Array.isArray(relatedObjects)) return [];
        
        // Filter to only show the types requested by the user
        const relevantRelationshipTypes = [
            'Attachments', 'ContentDocumentLinks', 'Notes', 'Tasks', 'Cases', 
            'Opportunities', 'Contacts', 'Accounts', 'FeedItems', 'ApprovalProcesses'
        ];
        
        return relatedObjects
            .filter(relObj => relevantRelationshipTypes.some(type => 
                relObj.relationshipName.includes(type) || 
                relObj.objectApiName.includes(type)))
            .map(relObj => ({
                label: relObj.label,
                value: relObj.relationshipName,
                relationshipName: relObj.relationshipName,
                objectApiName: relObj.objectApiName
            }));
    }

    /**
     * Handles the `select` event from the `lightning-tabset` in the modal.
     * Updates the `selectedTab` state and triggers loading of related records if a related tab is chosen.
     * 
     * @param {Event} event - The `select` event from `lightning-tabset`.
     */
    handleTabChange(event) {
        // The `value` of the selected tab ('details', 'more', or relationshipName) is in event.target.value
        const newTabValue = event.target.value;
        console.log(`Tab changed to: ${newTabValue}`);
        
        this.selectedTab = newTabValue; 

        // If the newly selected tab is a related object tab (i.e., not 'details' or 'more'), load its records.
        if (this.selectedTab !== 'details' && this.selectedTab !== 'more') {
            console.log(`Loading related records for relationship: ${this.selectedTab}`);
            this.loadRelatedRecords();
        } else if (this.selectedTab === 'details') {
            // If switching back to the 'details' tab, clear the related records list.
            this.relatedRecords = [];
            this.loadingRelatedRecords = false; // Ensure loading indicator is off
        }
    }

    /**
     * Handles back navigation from a page
     * 
     * @param {Event} event - The back button click event
     */
    handleBackNavigation(event) {
        const pageIndex = parseInt(event.currentTarget.dataset.index, 10) || 0;
        
        if (pageIndex < 0 || pageIndex >= this.navigationStack.length) {
            console.error('Invalid page index for handleBackNavigation:', pageIndex);
            return;
        }
        
        const page = this.navigationStack[pageIndex];
        
        // Navigate back to the parent page
        if (page.previousPageIndex >= 0) {
            this.removePageFromStack(pageIndex);
        }
    }

    /**
     * Handles closing a page
     * 
     * @param {Event} event - The close button click event
     */
    handleClosePage(event) {
        const pageIndex = parseInt(event.currentTarget.dataset.index, 10) || 0;
        
        if (pageIndex === 0) {
            // If closing the first page, close the entire modal
            this.closeAllPages();
        } else {
            // Otherwise just remove this page from the stack
            this.removePageFromStack(pageIndex);
        }
    }

    /**
     * Removes a page from the navigation stack
     * 
     * @param {number} pageIndex - The index of the page to remove
     */
    removePageFromStack(pageIndex) {
        if (pageIndex <= 0 || pageIndex >= this.navigationStack.length) {
            console.error('Invalid page index for removePageFromStack:', pageIndex);
            return;
        }
        
        // Remove the page
        const updatedStack = this.navigationStack.filter((_, index) => index !== pageIndex);
        
        // Update the stack
        this.navigationStack = updatedStack;
        
        // Update position classes
        this.updatePagePositionClasses();
    }

    /**
     * Closes all pages and resets the navigation stack
     */
    closeAllPages() {
        this.showRecordDetail = false;
        this.navigationStack = [];
    }

    /**
     * Handler for the Related Records click in More menu
     */
    handleRelatedRecordsClick() {
        console.log('Related Records clicked');
        // Implementation for related records view
    }
    
    /**
     * Handler for the Files and Attachments click in More menu
     */
    handleFilesAttachmentsClick() {
        console.log('Files and Attachments clicked');
        // Implementation for files and attachments view
    }
    
    /**
     * Handler for the Chatter Posts click in More menu
     */
    handleChatterPostsClick() {
        console.log('Chatter Posts clicked');
        // Implementation for chatter posts view
    }
    
    /**
     * Handler for the Approvals click in More menu
     */
    handleApprovalsClick() {
        console.log('Approvals clicked');
        // Implementation for approvals view
    }
    
    /**
     * Handler for the Notes click in More menu
     */
    handleNotesClick() {
        console.log('Notes clicked');
        // Implementation for notes view
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
     * Prepares the records data for display in the main list view table. 
     * This getter maps the raw record data fetched from Apex into a structure
     * suitable for the template's iteration, particularly if custom cell formatting or actions were needed.
     * Currently, it creates a `cellsData` array for each record, mapping column definitions to record values.
     * 
     * @returns {Array<object>} An array of record objects, each containing an `id`, the original `record` data, 
     *                          and a `cellsData` array for table cell iteration. Returns empty array if no records.
     */
    get recordsWithData() {
         if (!this.records || this.records.length === 0) return [];
         // console.log(`[recordsWithData] Processing ${this.records.length} records.`); // Log: How many records are we starting with?

         // Map each record to the structure expected by the template's table loop
         return this.records.map((record, index) => {
            // console.log(`[recordsWithData] Record ${index}:`, JSON.stringify(record)); // Log: What does the raw record look like?
             // Create an array of cell data based on the defined columns
             const cellsData = this.columns.map(col => {
                 // Basic value retrieval. Add handling for relationship fields (e.g., record['Owner.Name']) if needed.
                 // This assumes field names in `this.columns` directly match keys in the `record` object.
                 const value = record[col.fieldName] ?? ''; // Use nullish coalescing for undefined/null fields
                 // console.log(`[recordsWithData] Record ${index} - Column: ${col.fieldName}, Raw Value: ${record[col.fieldName]}, Display Value: ${value}`); // Log: Field name and value being processed
                 return { 
                     key: `${record.Id}-${col.fieldName}`, // Unique key for the cell in the loop
                     value: value // The value to display
                    };
             });
             const resultData = {
                 id: record.Id, // Record Id for the row key and click handler
                 record: record, // Keep the original record data accessible if needed
                 cellsData: cellsData // Array of cell data for the template to iterate over
             };
             // console.log(`[recordsWithData] Record ${index} - Processed Data:`, JSON.stringify(resultData)); // Log: Final structure for this record
             return resultData;
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
        // Show loading text if the selected record data isn't fully loaded yet
        if (this.isLoadingRecordDetail || !this.selectedRecord) return 'Loading...'; 
        
        // Return the title field value, or name, or ID, or default
        return this.selectedRecord[this.titleField] ||
               this.selectedRecord.Name ||
               this.selectedRecord.Id ||
               'Record Detail';
    }

    /**
     * Gets the subtitle for the record detail modal header.
     * Uses the field specified by `subtitleField` from the detailed data.
     * 
     * @returns {string} The subtitle string, or empty string if not applicable.
     */
    get recordDetailSubtitle() {
        if (this.isLoadingRecordDetail || !this.subtitleField || !this.selectedRecord) return '';
        return this.selectedRecord[this.subtitleField] || '';
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
            
            // Add field even if value is null/undefined, displaying blank instead
            const displayValue = (field.value !== null && field.value !== undefined) ? field.value : '';
            
            // Add the field to the display list
            fieldsToDisplay.push({
                fieldName: field.apiName,
                label: field.label,
                value: displayValue,
                isReference: field.isReference || false,
                referenceId: field.referenceId || null,
                referenceToObject: field.referenceToObject || null
            });
            
            console.log(`Added field: ${field.label} (${field.apiName}) = ${displayValue}`);
        });

        // Sort fields by label
        fieldsToDisplay.sort((a, b) => a.label.localeCompare(b.label));
        
        console.log(`Total fields to display: ${fieldsToDisplay.length}`);
        return fieldsToDisplay;
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
     * Generates the tab data structure for related objects.
     * 
     * @returns {Array<object>} An array of tab configuration objects.
     */
    get filteredRelatedObjectTabsData() {
        // If no related objects metadata loaded, return empty array
        if (!this.relatedObjects || this.relatedObjects.length === 0) {
            return [];
        }
        
        // Filter related objects to show only relevant ones
        const relevantRelationshipTypes = [
            'Attachments', 'ContentDocumentLinks', 'Notes', 'Tasks', 'Cases', 
            'Opportunities', 'Contacts', 'Accounts', 'FeedItems', 'ApprovalProcesses'
        ];
        
        // Map the filtered related objects metadata to the structure needed for lightning-tab
        return this.relatedObjects
            .filter(relObj => relevantRelationshipTypes.some(type => 
                relObj.relationshipName.includes(type) || 
                relObj.objectApiName.includes(type)))
            .map(relObj => ({
                label: relObj.label,
                value: relObj.relationshipName,
                relationshipName: relObj.relationshipName,
                objectApiName: relObj.objectApiName
            }));
    }
}