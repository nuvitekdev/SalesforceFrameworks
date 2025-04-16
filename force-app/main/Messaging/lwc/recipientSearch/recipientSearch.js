/**
 * Search component for finding message recipients (users and contacts)
 */
import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import searchRecipients from '@salesforce/apex/MessageController.searchRecipients';

export default class RecipientSearch extends LightningElement {
    @api label = 'Search for users or contacts';
    @api placeholder = 'Start typing name...';
    
    @track searchResults = [];
    @track isSearching = false;
    @track showResults = false;
    @track searchTerm = '';
    
    /**
     * Handle input changes for search
     */
    handleSearchChange(event) {
        this.searchTerm = event.target.value;
        
        // Only search if we have 2+ characters
        if (this.searchTerm.length >= 2) {
            this.performSearch();
        } else {
            this.searchResults = [];
            this.showResults = false;
        }
    }
    
    /**
     * Search for recipients
     */
    performSearch() {
        this.isSearching = true;
        this.showResults = true;
        
        searchRecipients({ searchTerm: this.searchTerm })
            .then(results => {
                this.searchResults = results;
                this.isSearching = false;
            })
            .catch(error => {
                this.handleError(error);
                this.isSearching = false;
            });
    }
    
    /**
     * Handle recipient selection
     */
    handleRecipientSelect(event) {
        const recipientId = event.currentTarget.dataset.id;
        const recipientName = event.currentTarget.dataset.name;
        const recipientType = event.currentTarget.dataset.type;
        
        // Create recipient object
        const recipient = {
            id: recipientId,
            name: recipientName,
            type: recipientType
        };
        
        // Dispatch custom event
        const selectEvent = new CustomEvent('select', {
            detail: recipient
        });
        this.dispatchEvent(selectEvent);
        
        // Reset search
        this.searchTerm = '';
        this.searchResults = [];
        this.showResults = false;
    }
    
    /**
     * Close search results
     */
    closeResults() {
        this.showResults = false;
    }
    
    /**
     * Handle errors
     */
    handleError(error) {
        console.error('Error searching recipients:', error);
        const message = error.body ? error.body.message : 'Unknown error';
        
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Error searching',
                message: message,
                variant: 'error'
            })
        );
    }
} 