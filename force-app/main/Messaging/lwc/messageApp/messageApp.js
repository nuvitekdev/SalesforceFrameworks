/**
 * Messaging App Component
 * Provides real-time messaging functionality for both desktop and mobile devices
 * Uses Platform Events on desktop and polling on mobile for cross-platform compatibility
 */
import { LightningElement, track, api, wire } from 'lwc';
import { subscribe, unsubscribe, isEmpEnabled } from 'lightning/empApi';
import { refreshApex } from '@salesforce/apex';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getRecentMessages from '@salesforce/apex/MessageController.getRecentMessages';
import sendMessage from '@salesforce/apex/MessageController.sendMessage';
import markMessageAsRead from '@salesforce/apex/MessageController.markMessageAsRead';
import searchRecipients from '@salesforce/apex/MessageController.searchRecipients';
import getUnreadCount from '@salesforce/apex/MessageNotificationService.getUnreadCount';
import USER_ID from '@salesforce/user/Id';
import getUserInfo from '@salesforce/apex/MessageController.getUserInfo';

// Import custom notification channel - commented out until message channel is properly configured
// import { subscribe as subscribeToLMS, unsubscribe as unsubscribeFromLMS } from 'lightning/messageService';
// import messageChannel from '@salesforce/messageChannel/MessageChangeChannel';

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
    @track unreadCounts = {}; // Map of recipient/channel ID to unread count
    
    userId = USER_ID;
    userName = '';
    subscription = {};
    pollingTimer;
    wiredMessagesResult;
    messageSubscription; // for LMS
    notificationsEnabled = true; // to control toast notifications
    
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
        
        // Subscribe to custom notifications - temporarily disabled
        // this.subscribeToNotifications();
        
        // Load unread counts
        this.loadUnreadCounts();
        
        // Add event listener for message notifications
        this.handleMessageNotificationBound = this.handleMessageNotification.bind(this);
        window.addEventListener('messagenotification', this.handleMessageNotificationBound);
    }
    
    disconnectedCallback() {
        // Remove event listener when component is destroyed
        window.removeEventListener('messagenotification', this.handleMessageNotificationBound);
        
        // Unsubscribe from events
        if (this.isDesktop() && this.subscription) {
            unsubscribe(this.subscription).catch(error => {
                console.error('Error unsubscribing from platform events', error);
            });
        } else {
            this.stopPolling();
        }
        
        // Unsubscribe from message service - temporarily disabled
        /*
        if (this.messageSubscription) {
            unsubscribeFromLMS(this.messageSubscription);
        }
        */
    }
    
    // Subscribe to custom notifications via Lightning Message Service
    subscribeToNotifications() {
        // Temporarily disabled LMS code
        /*
        if (messageChannel) {
            this.messageSubscription = subscribeToLMS(
                messageChannel,
                (message) => this.handleNotification(message),
                { scope: 'APPLICATION' }
            );
        }
        */
    }
    
    // Handle incoming notification
    handleNotification(message) {
        // Temporarily disabled LMS code
        /*
        if (!message || !this.notificationsEnabled) return;
        
        // Show toast notification if the user is not in the current conversation
        const isCurrentConversation = 
            (message.channelName && message.channelName === this.channelName) ||
            (message.senderId && message.senderId === this.recipientId);
            
        if (!isCurrentConversation) {
            // Show toast notification
            this.dispatchEvent(
                new ShowToastEvent({
                    title: message.title || 'New Message',
                    message: message.body || 'You have a new message',
                    variant: 'info',
                    mode: 'dismissable'
                })
            );
            
            // Update unread counts
            this.loadUnreadCounts();
        }
        */
    }
    
    // Load unread counts for all conversations
    loadUnreadCounts() {
        // For direct messages
        getUnreadCount({ userId: this.userId, channelName: null })
            .then(result => {
                this.unreadCounts['direct'] = result;
            })
            .catch(error => {
                console.error('Error loading unread counts:', error);
            });
            
        // For channels - would need to load counts for each channel
        // This is a placeholder for a more sophisticated implementation
        getUnreadCount({ userId: this.userId, channelName: this.channelName })
            .then(result => {
                if (this.channelName) {
                    this.unreadCounts[this.channelName] = result;
                }
            })
            .catch(error => {
                console.error('Error loading channel unread count:', error);
            });
    }
    
    // Tab navigation methods
    showRecipientSearch() {
        this.activeTab = 'people';
    }
    
    showChannelManager() {
        this.activeTab = 'channels';
    }
    
    // Add this method to handle tab changes
    handleTabChange(event) {
        const tabName = event.currentTarget.dataset.tab;
        if (tabName === 'direct') {
            this.activeTab = 'people';
        } else if (tabName === 'channels') {
            this.activeTab = 'channels';
        }
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
        
        // Clear unread count for this recipient
        this.clearUnreadCount(recipient.id);
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
        
        // Clear unread count for this recipient
        this.clearUnreadCount(id);
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
        
        // Clear unread count for this channel
        this.clearUnreadCount(channelName);
    }
    
    // Clear unread count for a recipient or channel
    clearUnreadCount(id) {
        if (id) {
            this.unreadCounts[id] = 0;
            
            // In a real implementation, you would also update the server-side record
            // This is just updating the UI for now
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
                
                // Load unread counts for each recipient
                this.recentRecipients.forEach(recipient => {
                    this.loadUnreadCountForRecipient(recipient.id);
                });
            } catch (e) {
                this.recentRecipients = [];
            }
        }
    }
    
    // Load unread count for a specific recipient
    loadUnreadCountForRecipient(recipientId) {
        // This would be a server call in a real implementation
        // For now, we'll just use random numbers for demo purposes
        this.unreadCounts[recipientId] = Math.floor(Math.random() * 5);
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
            
            // Clear unread count for this conversation
            if (this.channelName) {
                this.clearUnreadCount(this.channelName);
            } else if (this.recipientId) {
                this.clearUnreadCount(this.recipientId);
            }
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
        
        // Update unread counts if we marked messages as read
        if (unreadMessages.length > 0) {
            // Clear unread count for this conversation
            if (this.channelName) {
                this.clearUnreadCount(this.channelName);
            } else if (this.recipientId) {
                this.clearUnreadCount(this.recipientId);
            }
        }
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
        } else {
            // Message is for a different conversation, update unread counts
            this.loadUnreadCounts();
            
            // Show toast notification
            if (this.notificationsEnabled) {
                let title, body;
                
                if (messageData.Channel__c) {
                    title = 'New message in ' + messageData.Channel__c;
                } else {
                    // Get sender name - in real implementation we'd have this info
                    title = 'New message from ' + 'User';
                }
                
                body = messageData.Content__c || 'New message received';
                
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: title,
                        message: body.length > 60 ? body.substring(0, 57) + '...' : body,
                        variant: 'info',
                        mode: 'dismissable'
                    })
                );
            }
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
    
    // Toggle notifications
    toggleNotifications() {
        this.notificationsEnabled = !this.notificationsEnabled;
        
        // Show confirmation toast
        this.dispatchEvent(
            new ShowToastEvent({
                title: this.notificationsEnabled ? 'Notifications Enabled' : 'Notifications Disabled',
                message: this.notificationsEnabled ? 
                    'You will now receive toast notifications for new messages.' : 
                    'You will no longer receive toast notifications for new messages.',
                variant: 'success'
            })
        );
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
    
    // Get total unread count for direct messages
    get totalUnreadDirectCount() {
        let count = 0;
        for (const id in this.unreadCounts) {
            if (id !== 'direct' && !id.includes('channel_')) {
                count += this.unreadCounts[id] || 0;
            }
        }
        return count;
    }
    
    // Get total unread count for channels
    get totalUnreadChannelCount() {
        let count = 0;
        for (const id in this.unreadCounts) {
            if (id.includes('channel_')) {
                count += this.unreadCounts[id] || 0;
            }
        }
        return count;
    }
    
    /**
     * Handles notification events from the messageNotifier component
     * @param {CustomEvent} event - The messagenotification event
     */
    handleMessageNotification(event) {
        const messageData = event.detail;
        
        // Navigate to the appropriate conversation based on notification type
        if (messageData.isChannelMessage) {
            this.navigateToChannel(messageData.channelName);
        } else {
            this.navigateToConversation(messageData.recipientId);
        }
    }
    
    /**
     * Navigate to a channel conversation
     * @param {String} channelName - The name of the channel to navigate to
     */
    navigateToChannel(channelName) {
        if (!channelName) return;
        
        // Set selected tab to channels
        this.selectedTab = 'channels';
        
        // Find the channel in the list
        const channelFound = this.channels.find(channel => channel.name === channelName);
        
        if (channelFound) {
            // Select the channel
            this.handleChannelSelect({detail: channelFound});
        } else {
            // Refresh channel list if not found
            this.loadChannels().then(() => {
                const channel = this.channels.find(ch => ch.name === channelName);
                if (channel) {
                    this.handleChannelSelect({detail: channel});
                }
            });
        }
    }
    
    /**
     * Navigate to a direct conversation
     * @param {String} recipientId - The ID of the recipient to navigate to
     */
    navigateToConversation(recipientId) {
        if (!recipientId) return;
        
        // Set selected tab to people
        this.selectedTab = 'people';
        
        // Find the recipient in recent conversations
        const recipientFound = this.recentRecipients.find(r => r.id === recipientId);
        
        if (recipientFound) {
            // Select the conversation
            this.handleRecipientSelect({detail: recipientFound});
        } else {
            // Need to load user info and create a conversation
            this.loadUserInfo(recipientId).then(userInfo => {
                if (userInfo) {
                    const recipient = {
                        id: userInfo.Id,
                        name: userInfo.Name,
                        image: userInfo.SmallPhotoUrl,
                        type: 'user'
                    };
                    this.handleRecipientSelect({detail: recipient});
                }
            });
        }
    }
    
    /**
     * Load user information for a given user ID
     * @param {String} userId - The ID of the user to load
     * @returns {Promise} - A promise that resolves with the user info
     */
    loadUserInfo(userId) {
        return getUserInfo({userId: userId})
            .then(result => {
                return result;
            })
            .catch(error => {
                console.error('Error loading user info', error);
                return null;
            });
    }
    
    // Add these getters to determine which tab is active
    get isDirectTabActive() {
        return this.activeTab === 'people';
    }
    
    get isChannelsTabActive() {
        return this.activeTab === 'channels';
    }
    
    // Add these getters to handle unread badge logic
    get hasUnreadDirectMessages() {
        return this.totalUnreadDirectCount > 0;
    }
    
    get hasUnreadChannelMessages() {
        return this.totalUnreadChannelCount > 0;
    }
    
    get unreadDirectCount() {
        return this.totalUnreadDirectCount;
    }
    
    get unreadChannelCount() {
        return this.totalUnreadChannelCount;
    }
    
    // Add mock implementations for filtered lists
    get filteredUsers() {
        // This would normally be populated from search results
        return this.recentRecipients || [];
    }
    
    get filteredChannels() {
        // This would normally be populated from search results
        return [];
    }
    
    // Add hasRecipient getter for conditional rendering
    get hasRecipient() {
        return !!(this.recipientId || this.channelName);
    }
    
    // Add this getter for the recipient or channel name display
    get recipientOrChannelName() {
        return this.channelName || this.recipientName || '';
    }
    
    // Add this getter to determine if the current conversation is a channel
    get isChannel() {
        return !!this.channelName;
    }
    
    // Add this getter for recent users display
    get hasRecentUsers() {
        return this.recentRecipients && this.recentRecipients.length > 0;
    }
    
    get recentUsers() {
        return this.recentRecipients || [];
    }
    
    // Add these methods for search handling
    handleUserSearch(event) {
        const searchTerm = event.target.value;
        // Implement user search functionality
        // This would typically call an Apex method
    }
    
    handleChannelSearch(event) {
        const searchTerm = event.target.value;
        // Implement channel search functionality
        // This would typically call an Apex method
    }

    // Add this method to handle the back button click
    handleBack() {
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

    // Add this method to handle notification toggle
    handleNotificationToggle(event) {
        this.notificationsEnabled = event.target.checked;
        
        // Show confirmation toast
        this.dispatchEvent(
            new ShowToastEvent({
                title: this.notificationsEnabled ? 'Notifications Enabled' : 'Notifications Disabled',
                message: this.notificationsEnabled ? 
                    'You will now receive toast notifications for new messages.' : 
                    'You will no longer receive toast notifications for new messages.',
                variant: 'success'
            })
        );
    }

    // Add these methods for message composition
    handleMessageChange(event) {
        this.currentMessage = event.target.value;
    }

    handleKeyPress(event) {
        // Send message on Enter (but not with Shift+Enter for multiline)
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.handleSendMessage();
        }
    }

    // Add these getters for message composition
    get messageText() {
        return this.currentMessage || '';
    }

    get isSendDisabled() {
        return !this.currentMessage || this.currentMessage.trim() === '';
    }
} 