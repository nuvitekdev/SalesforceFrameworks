import { LightningElement, wire, api, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getReportOptions from '@salesforce/apex/WhistleblowerController.getReportOptions';
import getRelatedInvestigations from '@salesforce/apex/WhistleblowerController.getRelatedInvestigations';
import getRelatedActions from '@salesforce/apex/WhistleblowerController.getRelatedActions';
import getReportByUniqueIdentifier from '@salesforce/apex/WhistleblowerController.getReportByUniqueIdentifier';
import userId from '@salesforce/user/Id';

export default class WhistleblowerReportViewer extends NavigationMixin(LightningElement) {
    userId = userId;

    @api recordId;
    @track isGuestUser = false;
    @track uniqueIdentifier;
    @track selectedReportId;
    @track selectedInvestigationId; 
    @track selectedActionId;
    @track selectedSupportCaseId;
    @track reportOptions = [];
    @track investigations = [];
    @track actions = [];
    @track supportCases = [];
    @track excludeMySupportTickets = false;
    @track mainTitle = [];
    @track mainTitleSpan = [];

    // Define row actions
    getRowActions(row, doneCallback) {
        const actions = [{ label: 'View Details', name: 'view_details' }];
        doneCallback(actions);
    }

    // Fetch whistleblower report options on component initialization
    connectedCallback() {
        this.isGuestUser = (this.userId == null);
        if (!this.isGuestUser) {
            this.mainTitle = 'Whistleblower Submissions & Results'
            this.mainTitleSpan = 'Authenticated User'
            this.fetchReportOptions();
        } else {
            this.mainTitle = 'Whistleblower Submissions & Results'
            this.mainTitleSpan = 'Anonymous User Access'
        }

    }

    // Fetch whistleblower report options
    fetchReportOptions() {
        getReportOptions({ userId: this.userId })
            .then((result) => {
                console.log((result));
                this.reportOptions = result.map((obj) => ({
                    label: obj.Name,
                    value: obj.Id
                }));
            })
            .catch((error) => {
                console.error('Error fetching report options', error);
            });
    }

    fetchRelatedSupportCases() {
        console.log('fetch related support cases');
        getSupportCases({ reportId: this.selectedReportId })
            .then((result) => {
                console.log(result);
                this.supportCases = result.map((obj) => ({
                    label: obj.Name,
                    value: obj.Id
                }));
            })
            .catch((error) => {
                console.error('Error fetching related investigations', error);
            });
    }

    // Fetch related investigations for the selected report
    fetchRelatedInvestigations() {
        console.log('fetch related investigations');
        getRelatedInvestigations({ reportId: this.selectedReportId })
            .then((result) => {
                console.log(result);
                this.investigations = result.map((obj) => ({
                    label: obj.Name,
                    value: obj.Id
                }));
            })
            .catch((error) => {
                console.error('Error fetching related investigations', error);
            });
    }

    // Fetch related actions for the selected investigation
    fetchRelatedActions() {
        if (this.selectedInvestigationId) {
            getRelatedActions({ investigationIds: [this.selectedInvestigationId] })
                .then((result) => {
                this.actions = result.map((obj) => ({
                    label: obj.Name,
                    value: obj.Id
                }));
                })
                .catch((error) => {
                    console.error('Error fetching related actions', error);
                });
        } else {
            this.actions = []; // Clear actions if no investigation selected
        }
    }

    // handle report change
    handleReportChange(event) {
        this.selectedReportId = event.detail.value;
        this.selectedInvestigationId = null; // Reset selected investigation
        this.investigations = []; // Clear investigations
        this.actions = []; // Clear actions

        // Fetch related investigations only after a report is selected
        if (this.selectedReportId) {
            this.fetchRelatedInvestigations();
            this.fetchRelatedSupportCases();
        }
    }

    // Handle change in selected investigation
    handleInvestigationChange(event) {
        this.selectedInvestigationId = event.detail.value;
        this.fetchRelatedActions(); // Call fetchRelatedActions when investigation changes
    }

    // New method to handle action selection
    handleActionChange(event) {
        this.selectedActionId = event.detail.value;
    }

    handleExcludeSupportTicketsChange(event) {
        this.excludeMySupportTickets = event.target.checked;
        // Call the method to fetch support cases again if needed
        if(this.selectedReportId && !this.excludeMySupportTickets) {
            console.log('WORKED')
            this.fetchRelatedSupportCases();
        }
    }

    handleSupportCaseChange(event) {
        this.selectedSupportCaseId = event.target.value;
    }

    handleUniqueIdentifierChange(event) {
        this.uniqueIdentifier = event.target.value;
    }

    
    findReportForGuest() {
        if (this.isGuestUser && this.uniqueIdentifier) {
            getReportByUniqueIdentifier({ identifier: this.uniqueIdentifier })
                .then(result => {
                    if (result) {
                        this.selectedReportId = result.Id; // Assuming the result has an Id field
    
                        // If there are other related properties you need to update, do so here
                        // For example, if you need to load investigations related to the report:
                        this.selectedInvestigationId = null; // Reset selected investigation
                        this.selectedActionId = null;
                        this.selectedSupportCaseId = null;
                        this.investigations = []; // Clear investigations
                        this.actions = []; // Clear actions
                        this.supportCases = []; // Clear Support Cases
                        this.fetchRelatedInvestigations(); // Assuming you have a method to fetch related investigations
    
                        // You might also want to handle scenarios where no result is found:
                    } else {
                        this.selectedReportId = null;
                        // Handle no result found, like showing an error message or clearing fields
                    }
                })
                .catch(error => {
                    // Handle the error, such as displaying an error message to the user
                    console.error('Error fetching report by unique identifier:', error);
                    // Reset all relevant fields or show an error message
                    this.selectedReportId = null;
                    // ... reset other related properties as needed
                });
        }
    }
    
}