/**
 * Channel Manager component for creating and selecting chat channels
 */
import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getChannels from '@salesforce/apex/MessageController.getChannels';
import createChannel from '@salesforce/apex/MessageController.createChannel';

export default class ChannelManager extends LightningElement {
    @track channels = [];
    @track newChannelName = '';
    @track isCreatingChannel = false;
    @track isLoading = true;
    @track showCreateForm = false;
    
    /**
     * Load channels on init
     */
    connectedCallback() {
        this.loadChannels();
    }
    
    /**
     * Load available channels
     */
    loadChannels() {
        this.isLoading = true;
        
        getChannels()
            .then(results => {
                this.channels = results;
                this.isLoading = false;
            })
            .catch(error => {
                this.handleError(error);
                this.isLoading = false;
            });
    }
    
    /**
     * Toggle channel creation form
     */
    toggleCreateForm() {
        this.showCreateForm = !this.showCreateForm;
        if (this.showCreateForm) {
            // Focus the input field when form is shown
            setTimeout(() => {
                const input = this.template.querySelector('.channel-input');
                if (input) {
                    input.focus();
                }
            }, 100);
        }
    }
    
    /**
     * Handle channel input change
     */
    handleChannelNameChange(event) {
        this.newChannelName = event.target.value;
    }
    
    /**
     * Create a new channel
     */
    createNewChannel() {
        if (!this.newChannelName.trim()) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Error',
                    message: 'Please enter a channel name',
                    variant: 'error'
                })
            );
            return;
        }
        
        this.isCreatingChannel = true;
        
        createChannel({ channelName: this.newChannelName.trim() })
            .then(() => {
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Success',
                        message: 'Channel created successfully',
                        variant: 'success'
                    })
                );
                
                // Reset form
                this.newChannelName = '';
                this.showCreateForm = false;
                
                // Refresh channels
                this.loadChannels();
                
                // Select the new channel
                this.selectChannel(this.newChannelName.trim());
                
                this.isCreatingChannel = false;
            })
            .catch(error => {
                this.handleError(error);
                this.isCreatingChannel = false;
            });
    }
    
    /**
     * Handle channel selection
     */
    handleChannelSelect(event) {
        const channelName = event.currentTarget.dataset.name;
        this.selectChannel(channelName);
    }
    
    /**
     * Select a channel and notify parent
     */
    selectChannel(channelName) {
        // Dispatch custom event
        const selectEvent = new CustomEvent('select', {
            detail: { channelName }
        });
        this.dispatchEvent(selectEvent);
    }
    
    /**
     * Handle errors
     */
    handleError(error) {
        console.error('Error in channel manager:', error);
        const message = error.body ? error.body.message : 'Unknown error';
        
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Error',
                message: message,
                variant: 'error'
            })
        );
    }
} 