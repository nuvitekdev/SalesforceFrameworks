import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import processNaturalLanguageQuery from '@salesforce/apex/NaturalLanguageQueryController.processQuery';
import getExampleQueries from '@salesforce/apex/NaturalLanguageQueryController.getExampleQueries';

/**
 * @class
 * @description Natural Language to SOQL component that allows users to query Salesforce data
 * using natural language across specified objects. This component uses AI to convert natural language queries to SOQL.
 * @extends LightningElement
 */
export default class NaturalLanguageToSoql extends LightningElement {
    // =========================================================================
    // API Properties - Configurable via component attributes
    // =========================================================================
    
    /**
     * @type {String}
     * @description Comma-separated API names of the objects to query, passed from the config
     */
    @api objectApiNames = 'Account'; // Default to Account
    
    /**
     * @type {String}
     * @description The Developer Name of the LLM_Configuration__mdt record to use.
     */
    @api llmConfigName = 'OpenAI_GPT4_1_Mini'; // Default config name
    
    /**
     * @type {String}
     * @description Primary color of the component, should match org theme
     */
    @api primaryColor = '#22BDC1';
    
    /**
     * @type {String}
     * @description Accent color of the component
     */
    @api accentColor = '#D5DF23';
    
    /**
     * @type {Number}
     * @description Maximum number of records to return in the query
     */
    @api recordLimit = 50;
    
    /**
     * @type {Boolean}
     * @description Whether to enable query history tracking
     */
    @api enableQueryHistory = false;
    
    // =========================================================================
    // Private/Internal Properties
    // =========================================================================
    
    /**
     * @type {String}
     * @description The natural language query input by the user
     */
    @track userQuery = '';
    
    /**
     * @type {Boolean}
     * @description Indicates whether a query is currently being processed
     */
    @track isProcessing = false;
    
    /**
     * @type {Boolean}
     * @description Indicates whether results are available for display
     */
    @track hasResults = false;
    
    /**
     * @type {Boolean}
     * @description Indicates whether an error occurred during processing
     */
    @track hasError = false;
    
    /**
     * @type {Boolean}
     * @description Indicates when a query returned no results
     */
    @track hasNoResults = false;
    
    /**
     * @type {String}
     * @description Error message for display
     */
    @track errorMessage = '';
    
    /**
     * @type {String}
     * @description Generated SOQL query
     */
    @track generatedSoql = '';
    
    /**
     * @type {Array}
     * @description Results of the SOQL query
     */
    @track results = [];
    
    /**
     * @type {Array}
     * @description Column definitions for the results datatable
     */
    @track columns = [];
    
    /**
     * @type {Number}
     * @description Count of results returned
     */
    @track resultCount = 0;
    
    /**
     * @type {Array}
     * @description History of previous queries
     */
    @track queryHistory = [];

    /**
     * @type {Array}
     * @description Example queries tailored to the selected object
     */
    @track exampleQueries = [];
    
    /**
     * @type {Array}
     * @description Example queries tailored to the selected object
     */
    @track dynamicExampleQueries = [];
    
    /**
     * @type {Boolean}
     * @description Flag to control the loading spinner for examples
     */
    @track isLoadingExamples = false;
    
    // Store parsed object names
    _objectList = [];

    // =========================================================================
    // Lifecycle Hooks
    // =========================================================================
    
    /**
     * @description Connected callback lifecycle hook
     */
    connectedCallback() {
        this.processObjectApiNames(); // Parse the names on init
        this.loadQueryHistory();
        if (!this.recordLimit) this.recordLimit = 50;
        this.fetchDynamicExamples(); // Call new method to fetch examples
    }
    
    /**
     * @description Rendered callback lifecycle hook
     */
    renderedCallback() {
        // Always update theme variables when rendered
        // This ensures changes to primaryColor and accentColor from config are applied
        this.updateThemeVariables();
    }
    
    // =========================================================================
    // Getters
    // =========================================================================
    
    /**
     * @description Determines if the run query button should be disabled
     * @returns {Boolean} True if the button should be disabled
     */
    get isQueryButtonDisabled() {
        // Disable if no query text or no objects specified
        return !this.userQuery || 
               this.userQuery.trim().length === 0 || 
               !this.objectApiNames || 
               this.objectApiNames.trim().length === 0 ||
               this._objectList.length === 0;
    }
    
    /**
     * @description Getter to determine if the 'No examples available' message should be shown.
     * @returns {Boolean} True if loading is finished and no dynamic examples were loaded.
     */
    get showNoExamplesMessage() {
        // Show message only if not loading AND the list is empty
        return !this.isLoadingExamples && this.dynamicExampleQueries.length === 0;
    }
    
    // Getter for the header description
    get headerDescription() {
        if (this._objectList.length === 0) {
            return 'Configure Object API Names to enable querying.';
        }
        if (this._objectList.length === 1) {
            return `Ask questions about ${this._objectList[0]} records in plain English`;
        }
        // Simple generic message for multiple objects
        return `Ask questions about ${this._objectList.join(', ')} records in plain English`; 
    }
    
    /**
     * @description Provides a dynamic placeholder text based on configured objects
     * @returns {String} A placeholder example relevant to the configured objects
     */
    get queryPlaceholder() {
        if (this._objectList.length === 0) {
            return 'Example: Configure objects first to enable queries';
        }
        
        // Create placeholder based on available objects
        const hasAccount = this._objectList.includes('Account');
        const hasContact = this._objectList.includes('Contact');
        const hasOpportunity = this._objectList.includes('Opportunity');
        const hasCase = this._objectList.includes('Case');
        const hasLead = this._objectList.includes('Lead');
        
        if (hasAccount && hasContact) {
            return 'Example: Show Accounts in California with their primary Contacts';
        } else if (hasAccount && hasOpportunity) {
            return 'Example: Find Accounts with open Opportunities worth more than $50,000';
        } else if (hasContact) {
            return 'Example: Show Contacts created in the last 30 days with email addresses';
        } else if (hasOpportunity) {
            return 'Example: List Opportunities closing this month with probability over 70%';
        } else if (hasCase) {
            return 'Example: Find high priority Cases that have been open more than 7 days';
        } else if (hasLead) {
            return 'Example: Show Leads from the technology industry that are not contacted yet';
        } else {
            // Generic placeholder for any other object
            return `Example: Show recently created ${this._objectList[0]} records with their key details`;
        }
    }
    
    // =========================================================================
    // Event Handlers
    // =========================================================================
    
    /**
     * @description Handles changes to the natural language query input
     * @param {Event} event - Change event from the input field
     */
    handleQueryChange(event) {
        this.userQuery = event.target.value;
    }
    
    /**
     * @description Handles clearing the query input
     */
    handleClearQuery() {
        this.userQuery = '';
        this.resetQueryState();
    }
    
    /**
     * @description Handles executing the natural language query
     */
    async handleRunQuery() {
        // Ensure objects are processed (might change if config is dynamic)
        this.processObjectApiNames(); 
        
        if (this.isQueryButtonDisabled) return;

        // Validate objectApiNames are set
        if (!this._objectList || this._objectList.length === 0) {
            this.handleError('Please specify at least one object API name in the component configuration.');
            return;
        }
        
        this.isProcessing = true;
        this.hasResults = false;
        this.hasError = false;
        this.hasNoResults = false;
        
        try {
            console.log(`Running query across objects: ${this.objectApiNames} using LLM config: ${this.llmConfigName}`);
            // Call Apex to process the natural language query across multiple objects
            const response = await processNaturalLanguageQuery({
                naturalLanguageQuery: this.userQuery,
                objectApiNamesCSV: this.objectApiNames, // Pass the raw CSV string
                recordLimit: this.recordLimit,
                llmConfigName: this.llmConfigName // Pass the configured LLM name
            });
            
            // Process the response (assuming Apex returns the same structure)
            console.log('Raw response from Apex:', JSON.stringify(response, null, 2)); // Log raw response
            
            this.generatedSoql = response.soqlQuery;
            
            // Add recordUrl for navigation before assigning results
            if (response.results && response.results.length > 0 && response.primaryObject) {
                const baseUrl = `/lightning/r/${response.primaryObject}/`;
                this.results = response.results.map(record => {
                    return { 
                        ...record, 
                        recordUrl: baseUrl + record.Id + '/view' 
                    };
                });
                console.log('Processed results with recordUrl:', JSON.stringify(this.results[0]));
            } else {
                this.results = response.results || []; // Ensure results is an array
            }
            console.log('Results assigned to datatable:', JSON.stringify(this.results, null, 2));

            // Make a copy of columns and fix any fieldName issues if necessary
            this.columns = this.processColumnDefinitions(response.columns, response.primaryObject);
            console.log('Columns assigned to datatable:', JSON.stringify(this.columns, null, 2));
            
            this.resultCount = this.results ? this.results.length : 0;
            
            // Determine if we have results
            if (this.results && this.results.length > 0) {
                this.hasResults = true;
                this.hasNoResults = false;
                
                // Add to query history if enabled (log the list of objects queried)
                if (this.enableQueryHistory) {
                    this.addToQueryHistory(this.userQuery, this.generatedSoql, this.objectApiNames);
                }
                
                this.showToast('Query Successful', `Found ${this.resultCount} records`, 'success');
            } else {
                this.hasResults = false;
                this.hasNoResults = true;
                this.generatedSoql = response.soqlQuery || 'No results returned.'; // Show SOQL even if no results
            }
        } catch (error) {
            this.handleError('Error processing query: ' + this.reduceErrors(error));
        } finally {
            this.isProcessing = false;
        }
    }
    
    /**
     * @description Handles refining the current query
     */
    handleRefineQuery() {
        // Keep the current query and object, just hide results to allow editing
        this.hasResults = false;
        this.hasNoResults = false;
    }
    
    /**
     * @description Handles exporting results to CSV
     */
    handleExportCSV() {
        if (!this.results || this.results.length === 0) return;
        
        try {
            const csvContent = this.convertToCSV(this.results, this.columns);
            // Use standard 'text/csv' MIME type for better LWS compatibility
            const blob = new Blob([csvContent], { type: 'text/csv' }); 
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            // Make filename more generic
            link.download = `query_results_${Date.now()}.csv`;
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            this.showToast('Export Complete', 'CSV file has been downloaded', 'success');
        } catch (error) {
            this.handleError('Error exporting to CSV: ' + error.message);
        }
    }
    
    /**
     * @description Handles copying the SOQL query to clipboard
     */
    handleCopyQuery() {
        if (!this.generatedSoql) return;
        
        try {
            navigator.clipboard.writeText(this.generatedSoql)
                .then(() => {
                    this.showToast('Copied!', 'SOQL query copied to clipboard', 'success');
                })
                .catch(err => {
                    this.handleError('Error copying to clipboard: ' + err.message);
                });
        } catch (error) {
            this.handleError('Clipboard functionality not available: ' + error.message);
        }
    }
    
    /**
     * @description Handles clicking on an example query to prefill
     * @param {Event} event - Click event from the example pill
     */
    handleExampleClick(event) {
        this.userQuery = event.currentTarget.dataset.query;
    }
    
    /**
     * @description Handles try again action after an error
     */
    handleTryAgain() {
        this.hasError = false;
        this.errorMessage = '';
    }
    
    // =========================================================================
    // Utility Methods
    // =========================================================================
    
    /**
     * @description Fetches dynamic example queries from Apex using the configured objects.
     */
    async fetchDynamicExamples() {
        this.isLoadingExamples = true;
        this.dynamicExampleQueries = []; // Clear existing examples
        console.log(`Fetching dynamic examples for objects: ${this.objectApiNames} using LLM: ${this.llmConfigName}`);

        try {
            // Call the Apex method imperatively
            const examples = await getExampleQueries({
                objectApiNamesCSV: this.objectApiNames,
                llmConfigName: this.llmConfigName
            });

            if (examples && examples.length > 0) {
                this.dynamicExampleQueries = examples; // Assign the returned list of strings
                console.log('Received dynamic examples:', JSON.stringify(this.dynamicExampleQueries));
            } else {
                console.log('No dynamic examples returned from Apex, using default.');
                // Fallback to generic examples if Apex returns empty or null
                this.generateGenericExampleQueries(); 
                this.dynamicExampleQueries = this.exampleQueries.map(ex => ex.query); // Use the query part
            }
        } catch (error) { 
            console.error('Error fetching dynamic examples:', error);
            this.handleError('Could not load dynamic examples: ' + this.reduceErrors(error));
            // Fallback to generic examples on error
            this.generateGenericExampleQueries();
            this.dynamicExampleQueries = this.exampleQueries.map(ex => ex.query); // Use the query part
        } finally {
            this.isLoadingExamples = false;
        }
    }
    
    /**
     * @description Updates CSS variables based on the component's configuration
     */
    updateThemeVariables() {
        // Get the host element
        const hostElement = this.template.host;
        
        // Set CSS variables for theming
        hostElement.style.setProperty('--primary-color', this.primaryColor);
        hostElement.style.setProperty('--accent-color', this.accentColor);
        
        // Derive RGB values for transparency effects
        const getRgbValues = (hex) => {
            // Remove # if present
            hex = hex.replace('#', '');
            
            // Check for shorthand hex and expand if needed
            if (hex.length === 3) {
                hex = hex.split('').map(c => c + c).join('');
            }
            
            // Ensure hex is 6 characters (default to black if invalid)
            if (hex.length !== 6) {
                console.warn('Invalid hex color format:', hex);
                return '0, 0, 0';
            }
            
            // Parse the hex values
            const r = parseInt(hex.substring(0, 2), 16);
            const g = parseInt(hex.substring(2, 4), 16);
            const b = parseInt(hex.substring(4, 6), 16);
            
            return `${r}, ${g}, ${b}`;
        };
        
        // Set RGB variables for both primary and accent colors
        try {
            // Always try to set the RGB values, regardless of formatting
            const primaryRgb = getRgbValues(this.primaryColor);
            const accentRgb = getRgbValues(this.accentColor);
            
            hostElement.style.setProperty('--primary-color-rgb', primaryRgb);
            hostElement.style.setProperty('--accent-color-rgb', accentRgb);
            
            console.log(`Theme variables updated: Primary=${this.primaryColor}, Accent=${this.accentColor}`);
        } catch (error) {
            console.error('Error setting RGB color values', error);
        }
    }

    /**
     * @description Generates generic example queries suitable for multi-object context
     */
    generateGenericExampleQueries() {
        // Create dynamic examples based on common objects
        // These are only used as fallbacks if the AI-generated examples fail
        const examples = [];
        
        if (this._objectList.includes('Account')) {
            examples.push({ id: 'recentAccounts', query: `Show me recent ${this._objectList.includes('Account') ? 'Accounts' : 'records'}` });
        }
        
        if (this._objectList.includes('Opportunity')) {
            examples.push({ id: 'openOpps', query: 'Find open Opportunities' });
        } else if (this._objectList.includes('Case')) {
            examples.push({ id: 'openCases', query: 'Show open Cases' });
        } else {
            examples.push({ id: 'recentRecords', query: 'Show me newest records' });
        }
        
        if (this._objectList.includes('Contact')) {
            examples.push({ id: 'contactsQuery', query: 'Find Contacts in California' });
        } else if (this._objectList.includes('Lead')) {
            examples.push({ id: 'leadsQuery', query: 'Show Leads from New York' });
        } else {
            examples.push({ id: 'locationQuery', query: 'Find records in a specific location' });
        }
        
        if (this._objectList.includes('Case')) {
            examples.push({ id: 'priorityCases', query: 'Show high priority Cases' });
        } else if (this._objectList.includes('Task')) {
            examples.push({ id: 'tasksDue', query: 'Tasks due this week' });
        } else {
            examples.push({ id: 'statusQuery', query: 'Find records with specific status' });
        }
        
        // Ensure we have at least 4 examples even if no matching objects were found
        if (examples.length < 4) {
            examples.push({ id: 'genericQuery', query: 'Show records created this month' });
        }
        
        // Limit to 4 examples
        this.exampleQueries = examples.slice(0, 4);
    }
    
    /**
     * @description Resets the query state
     */
    resetQueryState() {
        this.hasResults = false;
        this.hasError = false;
        this.hasNoResults = false;
        this.results = [];
        this.columns = [];
        this.generatedSoql = '';
        this.resultCount = 0;
    }
    
    /**
     * @description Handles displaying error messages
     * @param {String} message - Error message to display
     */
    handleError(message) {
        this.hasError = true;
        this.errorMessage = message;
        this.hasResults = false;
        this.hasNoResults = false;
        console.error(message);
    }
    
    /**
     * @description Shows a toast notification
     * @param {String} title - Toast title
     * @param {String} message - Toast message
     * @param {String} variant - Toast variant (success, error, warning, info)
     */
    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title,
            message,
            variant
        });
        this.dispatchEvent(event);
    }
    
    /**
     * @description Converts array of objects to CSV string
     * @param {Array} objArray - Array of objects to convert
     * @param {Array} columns - Column definitions
     * @returns {String} CSV formatted string
     */
    convertToCSV(objArray, columns) {
        if (!columns || columns.length === 0) {
            // Fallback if columns aren't generated properly
            if (objArray.length > 0) {
                const headers = Object.keys(objArray[0]);
                const headerRow = headers.map(header => `"${header}"`).join(',');
                const dataRows = objArray.map(obj => {
                    return headers.map(header => {
                        const value = obj[header];
                        return value !== undefined && value !== null
                            ? `"${String(value).replace(/"/g, '""')}"`
                            : '""';
                    }).join(',');
                });
                 return [headerRow, ...dataRows].join('\n');
            } else {
                return ''; // No data
            }
        }

        const headerRow = columns.map(col => `"${col.label}"`).join(',');
        const dataRows = objArray.map(obj => {
            return columns
                .map(col => {
                    let value = obj[col.fieldName];
                    // Handle potential relationship fields (basic flattening)
                    if (col.fieldName && col.fieldName.includes('.')) {
                        try {
                            let parts = col.fieldName.split('.');
                            value = obj;
                            for(let part of parts) {
                                if (value && typeof value === 'object') {
                                    value = value[part];
                                } else {
                                    value = null;
                                    break;
                                }
                            }
                        } catch (e) {
                            value = 'Error accessing nested field';
                        }
                    }
                    return value !== undefined && value !== null
                        ? `"${String(value).replace(/"/g, '""')}"`
                        : '""';
                })
                .join(',');
        });
        return [headerRow, ...dataRows].join('\n');
    }
    
    /**
     * @description Reduces error messages from a complex error object
     * @param {Object|Array|String} errors - Error or errors to process
     * @returns {String} User-friendly error message
     */
    reduceErrors(errors) {
        if (!errors) {
            return 'Unknown error';
        }
        
        // If it's just a string, return it
        if (typeof errors === 'string') {
            return errors;
        }
        
        // If it's an array, process each error
        if (Array.isArray(errors)) {
            return errors
                .map(error => this.reduceErrors(error))
                .filter(message => !!message)
                .join(', ');
        }
        
        // If it's an error object with a message
        if (errors.message) {
            return errors.message;
        }
        
        // If it's a Salesforce UI API error
        if (errors.body && errors.body.message) {
            return errors.body.message;
        }
        
        // If it's a Salesforce error with a pageErrors array
        if (errors.body && Array.isArray(errors.body.pageErrors) && errors.body.pageErrors.length > 0) {
            return errors.body.pageErrors.map(e => e.message).join(', ');
        }
        
        // If it's a Salesforce error with a fieldErrors object
        if (errors.body && errors.body.fieldErrors) {
            const fieldErrors = [];
            for (const field in errors.body.fieldErrors) {
                if (Array.isArray(errors.body.fieldErrors[field]) && errors.body.fieldErrors[field].length > 0) {
                    fieldErrors.push(...errors.body.fieldErrors[field].map(e => e.message));
                }
            }
            if (fieldErrors.length > 0) {
                return fieldErrors.join(', ');
            }
        }
        
        // Default error message
        return 'Unknown error occurred';
    }
    
    /**
     * @description Adds a query to the query history
     * @param {String} naturalQuery - The natural language query
     * @param {String} soqlQuery - The generated SOQL query
     * @param {String} objectNames - The queried object names
     */
    addToQueryHistory(naturalQuery, soqlQuery, objectNames) {
        const historyEntry = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            naturalQuery,
            soqlQuery,
            objectNames // Store the list/string of objects
        };
        
        this.queryHistory = [historyEntry, ...this.queryHistory];
        if (this.queryHistory.length > 10) {
            this.queryHistory = this.queryHistory.slice(0, 10);
        }
        this.saveQueryHistory();
    }
    
    /**
     * @description Saves query history to localStorage
     */
    saveQueryHistory() {
        if (typeof localStorage !== 'undefined') {
            try {
                localStorage.setItem('nlq_history', JSON.stringify(this.queryHistory));
            } catch (error) {
                console.error('Error saving query history to localStorage', error);
            }
        }
    }
    
    /**
     * @description Loads query history from localStorage
     */
    loadQueryHistory() {
        if (typeof localStorage !== 'undefined' && this.enableQueryHistory) {
            try {
                const savedHistory = localStorage.getItem('nlq_history');
                if (savedHistory) {
                    this.queryHistory = JSON.parse(savedHistory);
                }
            } catch (error) {
                console.error('Error loading query history from localStorage', error);
                this.queryHistory = [];
            }
        }
    }

    // Process the comma-separated string into an array
    processObjectApiNames() {
        if (this.objectApiNames && typeof this.objectApiNames === 'string') {
            this._objectList = this.objectApiNames.split(',').map(name => name.trim()).filter(name => name.length > 0);
            console.log('Configured objects:', JSON.stringify(this._objectList));
        } else {
            this._objectList = [];
        }
    }

    /**
     * @description Process column definitions to fix any fieldName issues 
     * @param {Array} columnsFromServer - The column definitions from Apex
     * @param {String} primaryObject - The primary object from the query
     * @returns {Array} - Fixed column definitions
     */
    processColumnDefinitions(columnsFromServer, primaryObject) {
        if (!columnsFromServer || !columnsFromServer.length) return [];
        
        // Standard field name mapping to avoid hardcoding
        const standardFieldMap = {
            'id': 'Id',
            'name': 'Name',
            'firstname': 'FirstName',
            'lastname': 'LastName',
            'email': 'Email',
            'phone': 'Phone',
            'title': 'Title',
            'department': 'Department',
            'accountid': 'AccountId',
            'contactid': 'ContactId',
            'ownerid': 'OwnerId',
            'createddate': 'CreatedDate',
            'lastmodifieddate': 'LastModifiedDate',
            'description': 'Description',
            'type': 'Type',
            'industry': 'Industry',
            'status': 'Status',
            'stagename': 'StageName',
            'amount': 'Amount',
            'closedate': 'CloseDate',
            'probability': 'Probability',
            'rating': 'Rating',
            'priority': 'Priority',
            'subject': 'Subject',
            'origin': 'Origin',
            'reason': 'Reason',
            'leadsource': 'LeadSource',
            'isactive': 'IsActive',
            'isdeleted': 'IsDeleted',
            'birthdate': 'Birthdate'
        };
        
        return columnsFromServer.map(column => {
            // Create a copy of the column to avoid modifying the original
            const processedColumn = { ...column };
            
            // Only process if fieldName contains a period (object prefix)
            if (processedColumn.fieldName && processedColumn.fieldName.includes('.')) {
                const parts = processedColumn.fieldName.split('.');
                
                // If it's a simple object.field pattern with the primary object
                if (parts.length === 2 && parts[0].toLowerCase() === primaryObject.toLowerCase()) {
                    const fieldName = parts[1];
                    const fieldNameLower = fieldName.toLowerCase();
                    
                    // Use the standard field mapping or the original field name if not in map
                    processedColumn.fieldName = standardFieldMap[fieldNameLower] || fieldName;
                    
                    console.log(`Processed column: ${column.fieldName} -> ${processedColumn.fieldName}`);
                }
                // Leave relationship fields as-is for now since we would need to handle flattening them
            }
            
            return processedColumn;
        });
    }
} 