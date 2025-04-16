import { LightningElement, wire } from 'lwc';
import { subscribe, unsubscribe, onError, setDebugFlag, isEmpEnabled } from 'lightning/empApi';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import Id from '@salesforce/user/Id';

export default class MessageNotifier extends NavigationMixin(LightningElement) {
    channelName = '/event/New_Message_Notification__e';
    subscription = {};
    currentUserId = Id;

    // Initialize component
    connectedCallback() {
        // Register error listener for empApi
        this.registerErrorListener();
        
        // Subscribe to the message notification event channel
        this.subscribeToChannel();
    }

    // Disconnect from empApi when component is removed
    disconnectedCallback() {
        this.unsubscribeFromChannel();
    }

    // Subscribe to the platform event channel
    subscribeToChannel() {
        // Callback for when a message is received
        const messageCallback = (response) => {
            console.log('New message event received: ', JSON.stringify(response));
            
            // Extract the event data
            const eventData = response.data.payload;
            
            // Only show notification if the current user is the recipient
            if (eventData.RecipientId__c === this.currentUserId) {
                this.showNotification(eventData);
            }
        };

        // Subscribe to the event channel
        subscribe(this.channelName, -1, messageCallback)
            .then(response => {
                console.log('Subscription request sent to: ', JSON.stringify(response.channel));
                this.subscription = response;
            })
            .catch(error => {
                console.error('Failed to subscribe to channel: ', JSON.stringify(error));
            });
    }

    // Unsubscribe from the platform event channel
    unsubscribeFromChannel() {
        unsubscribe(this.subscription, (response) => {
            console.log('Unsubscribed from message notifications: ', JSON.stringify(response));
        });
    }

    // Register error listener
    registerErrorListener() {
        onError(error => {
            console.error('EMP API error: ', JSON.stringify(error));
        });
    }

    // Show toast notification
    showNotification(eventData) {
        // Determine title based on whether it's a channel message or direct message
        const title = eventData.IsChannelMessage__c 
            ? `New message in ${eventData.ChannelName__c}`
            : `New message from ${eventData.SenderName__c}`;
        
        // Create and dispatch the toast event
        const toastEvent = new ShowToastEvent({
            title: title,
            message: eventData.MessageSnippet__c,
            variant: 'info',
            mode: 'dismissable'
        });
        this.dispatchEvent(toastEvent);
        
        // Add click handler to navigate to the message
        this.handleToastClick(eventData);
    }

    // Navigate to the message when the toast is clicked
    handleToastClick(eventData) {
        // The platform doesn't support direct click events on toast notifications
        // So we would implement navigation within the messaging app UI
        // This would typically be handled by a pubsub event or Lightning Message Service
        
        // Dispatch a custom event that the messaging app can listen for
        const navigateEvent = new CustomEvent('messagenotification', {
            detail: {
                messageId: eventData.MessageId__c,
                isChannelMessage: eventData.IsChannelMessage__c,
                channelName: eventData.ChannelName__c,
                senderId: null, // This info isn't in the event currently
                recipientId: eventData.RecipientId__c
            },
            bubbles: true,
            composed: true
        });
        this.dispatchEvent(navigateEvent);
    }
} 