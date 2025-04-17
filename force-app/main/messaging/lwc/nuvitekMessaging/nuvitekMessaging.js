import { LightningElement, wire, track, api } from "lwc";
import { subscribe, unsubscribe, onError, setDebugFlag, isEmpEnabled } from "lightning/empApi";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { refreshApex } from "@salesforce/apex";
import getCurrentUser from "@salesforce/apex/NuvitekMessagingController.getCurrentUser";
import getConversations from "@salesforce/apex/NuvitekMessagingController.getConversations";
import getMessages from "@salesforce/apex/NuvitekMessagingController.getMessages";
import sendMessage from "@salesforce/apex/NuvitekMessagingController.sendMessage";
import findUserOrContact from "@salesforce/apex/NuvitekMessagingController.findUserOrContact";
import startConversation from "@salesforce/apex/NuvitekMessagingController.startConversation";

/**
 * Nuvitek Messaging Component
 * 
 * Provides a real-time messaging interface for Salesforce users
 * allowing them to chat with other users and contacts.
 */
export default class NuvitekMessaging extends LightningElement {
    // Platform event channel for real-time messaging
    channelName = "/event/Nuvitek_Message__e";
    subscription = null;
    
    // State variables
    @track isLoading = true;
    @track error = null;
    @track searchResults = [];
    @track isSearching = false;
    @track showNewMessageModal = false;
    
    // User data
    @track currentUser;
    
    // Conversation data
    @track conversations = [];
    @track selectedConversation = null;
    @track messages = [];
    @track newMessage = '';
    
    // Search input
    @track searchTerm = '';
    
    // Height control for responsive design
    @api componentMaxHeight;
    
    // Initialize component
    connectedCallback() {
        this.initializeComponent();
    }
    
    // Clean up on disconnect
    disconnectedCallback() {
        this.unsubscribeFromEvents();
    }
    
    // Initialize the component
    async initializeComponent() {
        try {
            // Check if platform events are enabled
            const isEmpAvailable = await isEmpEnabled();
            if (!isEmpAvailable) {
                this.error = 'Platform Events are not enabled in this org.';
                this.isLoading = false;
                return;
            }
            
            // Get the current user
            const userResult = await getCurrentUser();
            this.currentUser = userResult;
            
            // Subscribe to platform events
            await this.subscribeToEvents();
            
            // Load conversations
            await this.loadConversations();
            
            this.isLoading = false;
        } catch (error) {
            this.handleError(error);
        }
    }
    
    // Subscribe to platform events for real-time messaging
    async subscribeToEvents() {
        try {
            // Register error listener       
            this.registerErrorListener();
            
            // Callback triggered whenever a new message event is received
            const messageCallback = (response) => {
                this.handleIncomingMessage(response);
            };
            
            // Subscribe to the message channel
            this.subscription = await subscribe(
                this.channelName,
                -1,
                messageCallback
            );
            
            console.log('Successfully subscribed to channel: ' + this.channelName);
        } catch (error) {
            this.handleError(error);
        }
    }
    
    // Unsubscribe from platform events
    unsubscribeFromEvents() {
        if (this.subscription) {
            unsubscribe(this.subscription, response => {
                console.log('Unsubscribed from ' + this.channelName);
                this.subscription = null;
            });
        }
    }
    
    registerErrorListener() {
        onError(error => {
            console.error('EMP API error: ', error);
        });
    }
    
    // Handle error
    handleError(error) {
        console.error('Error: ', error);
        this.error = error.message || (error.body && error.body.message) || 'An unknown error occurred';
        this.isLoading = false;
        
        // Show toast notification for error
        this.dispatchEvent(
            new ShowToastEvent({
                title: 'Error',
                message: this.error,
                variant: 'error'
            })
        );
    }
    
    // Handle incoming message from platform event
    handleIncomingMessage(messageEvent) {
        const payload = messageEvent.data.payload;
        
        // If message is for current conversation, add it to messages
        if (this.selectedConversation && 
            payload.ConversationId__c === this.selectedConversation.id) {
            const isFromCurrentUser = payload.SenderId__c === this.currentUser.id;
            const message = {
                id: messageEvent.data.event.replayId,
                content: payload.Message__c,
                senderId: payload.SenderId__c,
                senderName: payload.SenderName__c,
                timestamp: payload.Timestamp__c,
                isFromCurrentUser: isFromCurrentUser,
                formattedTime: this.formatTimestamp(payload.Timestamp__c),
                messageWrapperClass: isFromCurrentUser ? 'message-wrapper outgoing' : 'message-wrapper incoming',
                messageBubbleClass: isFromCurrentUser ? 'message-bubble outgoing' : 'message-bubble incoming'
            };
            
            this.messages = [...this.messages, message];
            this.scrollToBottom();
        }
        
        // Update conversations list with new message info
        this.updateConversationWithNewMessage(payload);
    }
    
    // Update conversation list when new message arrives
    updateConversationWithNewMessage(messageData) {
        const updatedConversations = [...this.conversations];
        const conversationIndex = updatedConversations.findIndex(
            conv => conv.id === messageData.ConversationId__c
        );
        
        if (conversationIndex !== -1) {
            // Update existing conversation
            updatedConversations[conversationIndex] = {
                ...updatedConversations[conversationIndex],
                lastMessage: messageData.Message__c,
                lastMessageDate: messageData.Timestamp__c,
                formattedTime: this.formatTimestamp(messageData.Timestamp__c),
                unreadCount: this.selectedConversation?.id === messageData.ConversationId__c 
                    ? 0 
                    : (updatedConversations[conversationIndex].unreadCount || 0) + 1
            };
            
            // Move conversation to top of list
            const conversation = updatedConversations.splice(conversationIndex, 1)[0];
            updatedConversations.unshift(conversation);
        } else {
            // This is a new conversation, refresh conversations list
            this.loadConversations();
            return;
        }
        
        this.conversations = updatedConversations;
    }
    
    // Load user's conversations
    async loadConversations() {
        try {
            this.isLoading = true;
            const data = await getConversations();
            this.conversations = data.map(conv => ({
                ...conv,
                formattedTime: this.formatTimestamp(conv.lastMessageDate)
            }));
            this.isLoading = false;
        } catch (error) {
            this.handleError(error);
        }
    }
    
    // Load messages for a conversation
    async loadMessages(conversationId) {
        if (!conversationId) return;
        
        try {
            this.isLoading = true;
            const data = await getMessages({ conversationId: conversationId });
            this.messages = data.map(msg => ({
                ...msg,
                isFromCurrentUser: msg.senderId === this.currentUser.id,
                formattedTime: this.formatTimestamp(msg.timestamp),
                messageWrapperClass: msg.senderId === this.currentUser.id ? 'message-wrapper outgoing' : 'message-wrapper incoming',
                messageBubbleClass: msg.senderId === this.currentUser.id ? 'message-bubble outgoing' : 'message-bubble incoming'
            }));
            this.scrollToBottom();
            this.isLoading = false;
        } catch (error) {
            this.handleError(error);
        }
    }
    
    // Send a new message
    async handleSendMessage() {
        if (!this.newMessage.trim() || !this.selectedConversation) return;
        
        try {
            const messageContent = this.newMessage.trim();
            this.newMessage = ''; // Clear input immediately for better UX
            
            // Create a message object to display in UI immediately
            const newMessage = {
                id: this.generateLocalId(),
                content: messageContent,
                senderId: this.currentUser.id,
                senderName: this.currentUser.name,
                timestamp: new Date().toISOString(),
                isFromCurrentUser: true,
                formattedTime: this.formatTimestamp(new Date().toISOString()),
                messageWrapperClass: 'message-wrapper outgoing',
                messageBubbleClass: 'message-bubble outgoing'
            };
            
            // Add to UI immediately
            this.messages = [...this.messages, newMessage];
            this.scrollToBottom();
            
            // Send to server
            await sendMessage({
                conversationId: this.selectedConversation.id,
                message: messageContent
            });
        } catch (error) {
            this.handleError(error);
        }
    }
    
    // Generate a local ID for UI messages
    generateLocalId() {
        return 'local-' + Math.random().toString(36).substring(2, 15);
    }
    
    // Handle Enter key press in message input
    handleMessageKeyPress(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.handleSendMessage();
        }
    }
    
    // Handle message input change
    handleMessageChange(event) {
        this.newMessage = event.target.value;
    }
    
    // Search for users or contacts
    async handleSearch(event) {
        const searchTerm = event.target.value.trim();
        this.searchTerm = searchTerm;
        
        if (searchTerm.length < 2) {
            this.searchResults = [];
            this.isSearching = false;
            return;
        }
        
        try {
            this.isSearching = true;
            const results = await findUserOrContact({ searchTerm });
            // Process results to add iconName and other necessary properties
            this.searchResults = results.map(result => {
                return {
                    ...result,
                    // Map the type to userType for the data attribute
                    userType: result.type,
                    // Set appropriate icon name based on type
                    iconName: result.type === 'User' ? 'standard:user' : 'standard:contact'
                };
            });
            this.isSearching = false;
        } catch (error) {
            this.handleError(error);
        }
    }
    
    // Handle click on search result item
    handleResultClick(event) {
        const userId = event.currentTarget.dataset.id;
        const userType = event.currentTarget.dataset.type;
        this.startNewConversation(userId, userType);
    }
    
    // Start a new conversation with selected user/contact
    async startNewConversation(userId, userType) {
        try {
            this.isLoading = true;
            // Call the startConversation Apex method to get the conversation object
            const conversation = await startConversation({ 
                userId: userId, 
                userType: userType 
            });
            
            // Add timestamp formatting
            conversation.formattedTime = this.formatTimestamp(conversation.lastMessageDate);
            
            // Add the new conversation to the top of the list
            this.conversations = [conversation, ...this.conversations];
            
            // Select the new conversation and load its messages
            this.selectedConversation = conversation;
            
            // Load empty message list
            this.messages = [];
            
            // Close the modal
            this.showNewMessageModal = false;
            this.searchTerm = '';
            this.searchResults = [];
            this.isLoading = false;
        } catch (error) {
            this.handleError(error);
        }
    }
    
    // Select a conversation to view
    handleSelectConversation(event) {
        const conversationId = event.currentTarget.dataset.id;
        const selectedConv = this.conversations.find(conv => conv.id === conversationId);
        
        if (selectedConv) {
            // Mark all elements as not selected
            this.template.querySelectorAll('.conversation-item').forEach(item => {
                item.classList.remove('active');
            });
            
            // Mark the clicked element as selected
            event.currentTarget.classList.add('active');
            
            this.selectedConversation = selectedConv;
            this.loadMessages(conversationId);
            
            // Mark as read in conversations list
            this.markConversationAsRead(conversationId);
        }
    }
    
    // Mark conversation as read
    markConversationAsRead(conversationId) {
        const updatedConversations = this.conversations.map(conv => {
            if (conv.id === conversationId) {
                return { ...conv, unreadCount: 0 };
            }
            return conv;
        });
        
        this.conversations = updatedConversations;
    }
    
    // Open new message modal
    handleNewMessage() {
        this.showNewMessageModal = true;
    }
    
    // Close new message modal
    closeNewMessageModal() {
        this.showNewMessageModal = false;
        this.searchTerm = '';
        this.searchResults = [];
    }
    
    // Go back to conversations list
    handleBackToList() {
        this.selectedConversation = null;
    }
    
    // Format timestamp for display
    formatTimestamp(timestamp) {
        if (!timestamp) return '';
        
        const date = new Date(timestamp);
        const now = new Date();
        const diffInDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
        
        if (diffInDays === 0) {
            // Today, show time
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else if (diffInDays === 1) {
            // Yesterday
            return 'Yesterday';
        } else if (diffInDays < 7) {
            // This week, show day name
            return date.toLocaleDateString([], { weekday: 'short' });
        } else {
            // Older, show date
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        }
    }
    
    // Scroll messages to bottom
    scrollToBottom() {
        setTimeout(() => {
            const container = this.template.querySelector('.chat-messages');
            if (container) {
                container.scrollTop = container.scrollHeight;
            }
        }, 50);
    }
    
    // CSS styles based on max height
    get containerStyle() {
        return this.componentMaxHeight 
            ? `max-height: ${this.componentMaxHeight}px; height: ${this.componentMaxHeight}px;` 
            : 'max-height: 600px; height: 600px;';
    }
    
    // Check if message input is empty
    get isMessageEmpty() {
        return !this.newMessage || !this.newMessage.trim();
    }
    
    // Check if we have conversations
    get hasConversations() {
        return this.conversations && this.conversations.length > 0;
    }
    
    // Check if we have messages in the current conversation
    get hasMessages() {
        return this.messages && this.messages.length > 0;
    }
    
    // Check if we have search results
    get hasSearchResults() {
        return this.searchResults && this.searchResults.length > 0;
    }
} 