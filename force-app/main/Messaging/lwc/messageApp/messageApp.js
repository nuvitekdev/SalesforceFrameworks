/**
 * Messaging App Component
 * Provides real-time messaging functionality for both desktop and mobile devices
 * Uses Platform Events on desktop and polling on mobile for cross-platform compatibility
 */
import { LightningElement, track, api } from 'lwc';
import { subscribe, unsubscribe, isEmpEnabled } from 'lightning/empApi';
import { refreshApex } from '@salesforce/apex';
import getRecentMessages from '@salesforce/apex/MessageController.getRecentMessages';
import sendMessage from '@salesforce/apex/MessageController.sendMessage';
import markMessageAsRead from '@salesforce/apex/MessageController.markMessageAsRead';
import searchRecipients from '@salesforce/apex/MessageController.searchRecipients';
import USER_ID from '@salesforce/user/Id';

const POLLING_INTERVAL = 5000; // 5 seconds

export default class MessageApp extends LightningElement {
    // Public properties - now only used for initial values if provided
    @api recipientId;
    @api recipientName;
    @api channelName;
    
    // Private properties
    @track messages = [];
    @track currentMessage = '';
    @track isLoading = true;
    @track error;
    @track activeTab = 'people'; // 'people' or 'channels'
    @track recentRecipients = [];
    
    userId = USER_ID;
    userName = '';
    subscription = {};
    pollingTimer;
    wiredMessagesResult;
    
    // Lifecycle hooks
    connectedCallback() {
        // Only load messages if we have either a recipient or channel
        if (this.hasActiveConversation) {
            // Load initial messages
            this.loadMessages();
            
            // For desktop, subscribe to platform events
            if (this.isDesktop()) {
                this.subscribeToMessages();
            } else {
                // For mobile, set up polling as fallback
                this.startPolling();
            }
        }
        
        // Load any recent conversations
        this.loadRecentConversations();
    }
    
    disconnectedCallback() {
        // Unsubscribe from events
        if (this.isDesktop() && this.subscription) {
            unsubscribe(this.subscription).catch(error => {
                console.error('Error unsubscribing from platform events', error);
            });
        } else {
            this.stopPolling();
        }
    }
    
    // Tab navigation methods
    showRecipientSearch() {
        this.activeTab = 'people';
    }
    
    showChannelManager() {
        this.activeTab = 'channels';
    }
    
    // Recipient selection handlers
    handleRecipientSelect(event) {
        const recipient = event.detail;
        this.recipientId = recipient.id;
        this.recipientName = recipient.name;
        this.channelName = null;
        
        // Load messages for the selected recipient
        this.loadMessages();
        
        // Add recipient to recent conversations
        this.addToRecentRecipients(recipient);
        
        // Start real-time updates
        if (this.isDesktop()) {
            this.subscribeToMessages();
        } else {
            this.startPolling();
        }
    }
    
    handleRecentRecipientSelect(event) {
        const id = event.currentTarget.dataset.id;
        const name = event.currentTarget.dataset.name;
        
        this.recipientId = id;
        this.recipientName = name;
        this.channelName = null;
        
        // Load messages for the selected recipient
        this.loadMessages();
        
        // Start real-time updates
        if (this.isDesktop()) {
            this.subscribeToMessages();
        } else {
            this.startPolling();
        }
    }
    
    // Channel selection handler
    handleChannelSelect(event) {
        const { channelName } = event.detail;
        this.channelName = channelName;
        this.recipientId = null;
        this.recipientName = null;
        
        // Load messages for the selected channel
        this.loadMessages();
        
        // Start real-time updates
        if (this.isDesktop()) {
            this.subscribeToMessages();
        } else {
            this.startPolling();
        }
    }
    
    // Back button handler for mobile
    handleBackClick() {
        // Clear active conversation
        this.recipientId = null;
        this.recipientName = null;
        this.channelName = null;
        this.messages = [];
        
        // Stop real-time updates
        if (this.isDesktop() && this.subscription) {
            unsubscribe(this.subscription).catch(error => {
                console.error('Error unsubscribing from platform events', error);
            });
        } else {
            this.stopPolling();
        }
    }
    
    // Recent conversations management
    loadRecentConversations() {
        // For a real implementation, query recent conversations from database
        // Here we'll just use local storage for demo
        const recentKey = 'messaging_recent_' + this.userId;
        const storedRecents = localStorage.getItem(recentKey);
        
        if (storedRecents) {
            try {
                this.recentRecipients = JSON.parse(storedRecents);
            } catch (e) {
                this.recentRecipients = [];
            }
        }
    }
    
    addToRecentRecipients(recipient) {
        // Check if recipient is already in the list
        const existingIndex = this.recentRecipients.findIndex(r => r.id === recipient.id);
        
        // Remove from current position if exists
        if (existingIndex > -1) {
            this.recentRecipients.splice(existingIndex, 1);
        }
        
        // Add to beginning of array
        this.recentRecipients.unshift({
            id: recipient.id,
            name: recipient.name,
            icon: recipient.icon || '/img/icon/t4v35/standard/user_120.png',
            type: recipient.type
        });
        
        // Limit to 10 recent recipients
        if (this.recentRecipients.length > 10) {
            this.recentRecipients = this.recentRecipients.slice(0, 10);
        }
        
        // Save to localStorage
        const recentKey = 'messaging_recent_' + this.userId;
        localStorage.setItem(recentKey, JSON.stringify(this.recentRecipients));
    }
    
    // Utility methods
    isDesktop() {
        // Check if empApi is supported (desktop)
        return isEmpEnabled();
    }
    
    subscribeToMessages() {
        // Create platform event channel
        const channel = '/event/MessageEvent__e';
            
        // Subscribe to platform event channel
        subscribe(channel, -1, (message) => {
            this.handleMessage(message);
        }).then(response => {
            this.subscription = response;
        }).catch(error => {
            console.error('Error subscribing to platform events', error);
            this.startPolling(); // Fallback to polling if subscription fails
        });
    }
    
    startPolling() {
        // Set up polling for message updates
        this.pollingTimer = setInterval(() => {
            this.loadMessages();
        }, POLLING_INTERVAL);
    }
    
    stopPolling() {
        // Clear polling timer
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
        }
    }
    
    loadMessages() {
        // Only load if we have an active conversation
        if (!this.hasActiveConversation) return;
        
        // Set loading state
        this.isLoading = true;
        
        // Call Apex to get recent messages
        getRecentMessages({ 
            recipientId: this.recipientId,
            channelName: this.channelName
        })
        .then(result => {
            // Process and sort messages by timestamp
            this.messages = this.processMessages(result);
            
            // Mark any unread messages as read
            this.markUnreadMessagesAsRead(result);
            
            // Clear loading state
            this.isLoading = false;
            
            // Scroll to bottom
            this.scrollToBottom();
        })
        .catch(error => {
            this.error = error;
            this.isLoading = false;
        });
    }
    
    processMessages(messageRecords) {
        // Convert Apex results to component format
        return messageRecords.map(record => {
            return {
                id: record.Id,
                sender: record.Sender__c,
                senderName: record.Sender__r ? record.Sender__r.Name : 'Unknown',
                content: record.Content__c,
                timestamp: record.Timestamp__c,
                isRead: record.IsRead__c,
                isMine: record.Sender__c === this.userId
            };
        }).sort((a, b) => {
            // Sort by timestamp, most recent at the bottom
            return new Date(a.timestamp) - new Date(b.timestamp);
        });
    }
    
    markUnreadMessagesAsRead(messages) {
        // Find all unread messages sent by others
        const unreadMessages = messages.filter(msg => 
            !msg.IsRead__c && msg.Sender__c !== this.userId
        );
        
        // Mark each unread message as read
        unreadMessages.forEach(msg => {
            markMessageAsRead({ messageId: msg.Id })
                .catch(error => console.error('Error marking message as read', error));
        });
    }
    
    handleSendMessage() {
        // Validate message content
        if (!this.currentMessage.trim()) {
            return;
        }
        
        // Send message
        sendMessage({ 
            recipientId: this.recipientId,
            content: this.currentMessage,
            channelName: this.channelName 
        })
        .then(() => {
            // Clear current message
            this.currentMessage = '';
            
            // For mobile, immediately refresh message list
            if (!this.isDesktop()) {
                this.loadMessages();
            }
            
            // Scroll to bottom after sending
            this.scrollToBottom();
        })
        .catch(error => {
            this.error = error;
        });
    }
    
    handleMessage(event) {
        // Process incoming message event
        const messageData = event.data.payload;
        
        // Only process relevant messages
        if (this.isRelevantMessage(messageData)) {
            // Load messages to ensure we have the latest data
            this.loadMessages();
        }
    }
    
    isRelevantMessage(messageData) {
        // Check if message is relevant for this user/channel
        if (this.channelName) {
            return messageData.Channel__c === this.channelName;
        } else {
            return (messageData.RecipientId__c === this.userId || 
                   messageData.SenderId__c === this.recipientId);
        }
    }
    
    handleInputChange(event) {
        this.currentMessage = event.target.value;
    }
    
    handleKeyDown(event) {
        // Send message on Enter (but not with Shift+Enter for multiline)
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.handleSendMessage();
        }
    }
    
    scrollToBottom() {
        // Scroll the message list to the bottom
        setTimeout(() => {
            const messageList = this.template.querySelector('.message-list');
            if (messageList) {
                messageList.scrollTop = messageList.scrollHeight;
            }
        }, 100);
    }
    
    // Getters for template
    get hasMessages() {
        return this.messages && this.messages.length > 0;
    }
    
    get headerTitle() {
        return this.channelName ? this.channelName : this.recipientName;
    }
    
    get hasActiveConversation() {
        return !!(this.recipientId || this.channelName);
    }
    
    get isRecipientSearchActive() {
        return this.activeTab === 'people';
    }
    
    get isChannelManagerActive() {
        return this.activeTab === 'channels';
    }
    
    get isBackVisible() {
        // Show back button on mobile when in a conversation
        const isMobile = window.innerWidth <= 768;
        return isMobile && this.hasActiveConversation;
    }
} 