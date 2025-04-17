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
import createGroupConversation from "@salesforce/apex/NuvitekMessagingController.createGroupConversation";
import generateAISummary from "@salesforce/apex/NuvitekMessagingController.generateAISummary";

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
    
    // Theme and branding properties
    @api primaryColor = '#22BDC1';
    @api accentColor = '#D5DF23';
    @api messageOutgoingColor = '#22BDC1';
    @api messageIncomingColor = '#D5DF23';
    
    // Layout properties
    @api componentHeight = 600;
    
    // Functionality properties
    @api disableInitialLoading = false;
    
    // State variables
    @track isLoading = false;
    @track error = null;
    @track searchResults = [];
    @track selectedSearchResults = [];
    @track isSearching = false;
    @track showNewMessageModal = false;
    @track isCreatingGroup = false;
    @track groupName = '';
    
    // User data
    @track currentUser;
    
    // Conversation data
    @track conversations = [];
    @track selectedConversation = null;
    @track messages = [];
    @track newMessage = '';
    
    // Search input
    @track searchTerm = '';
    
    // AI Summary related properties
    @track showAISummary = false;
    @track isGeneratingSummary = false;
    @track conversationSummary = '';
    
    // Add properties for other entity types
    @track isOtherEntitySelection = false;
    @track selectedEntityType = 'All';
    
    // Initialize component
    connectedCallback() {
        this.initializeComponent();
    }
    
    // Clean up on disconnect
    disconnectedCallback() {
        this.unsubscribeFromEvents();
        this.showAISummary = false; // Ensure AI summary panel is closed when component is destroyed
    }
    
    // Initialize the component
    async initializeComponent() {
        try {
            // Only show loading spinner if disableInitialLoading is false
            this.isLoading = !this.disableInitialLoading;
            
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
    
    // Determine contrasting text color (black or white) for a background color
    getContrastColor(hexColor) {
        if (!hexColor) return '#ffffff'; // Default to white text if no color provided
        
        // Remove the # if it exists
        hexColor = hexColor.replace('#', '');
        
        // Convert hex to RGB
        let r = parseInt(hexColor.substr(0, 2), 16);
        let g = parseInt(hexColor.substr(2, 2), 16);
        let b = parseInt(hexColor.substr(4, 2), 16);
        
        // Calculate the brightness (using a weighted formula for perceived brightness)
        let brightness = (r * 0.299 + g * 0.587 + b * 0.114);
        
        // Return white for dark backgrounds, black for light backgrounds
        return brightness > 160 ? '#000000' : '#ffffff';
    }
    
    // CSS custom properties for theme
    get themeStyles() {
        // Get text colors based on background brightness
        const headerTextColor = this.getContrastColor(this.primaryColor);
        const outgoingTextColor = this.getContrastColor(this.messageOutgoingColor);
        const incomingTextColor = this.getContrastColor(this.messageIncomingColor);
        
        // Default background and border colors
        const backgroundColor = '#ffffff';
        const backgroundAltColor = '#f5f5f7';
        const borderColor = '#e0e5ee';
        
        return `
            --primary-color: ${this.primaryColor};
            --accent-color: ${this.accentColor};
            --background: ${backgroundColor};
            --background-alt: ${backgroundAltColor};
            --border-color: ${borderColor};
            --header-text-color: ${headerTextColor};
            --message-outgoing-color: ${this.messageOutgoingColor};
            --message-incoming-color: ${this.messageIncomingColor};
            --message-outgoing-text-color: ${outgoingTextColor};
            --message-incoming-text-color: ${incomingTextColor};
            --group-participants-color: ${headerTextColor};
        `;
    }
    
    // CSS styles based on responsive design
    get containerStyle() {
        const heightStyle = this.componentHeight > 0 
            ? `height: ${this.componentHeight}px; max-height: 100%;` 
            : 'height: 100%;';
        
        return `${heightStyle} ${this.themeStyles}`;
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
        console.log('Received message event:', JSON.stringify(payload));
        
        // If message is for current conversation, add it to messages
        if (this.selectedConversation && 
            payload.ConversationId__c === this.selectedConversation.id) {
            
            // Check if we're at the bottom of the messages (to know if we should auto-scroll)
            const isAtBottom = this.isScrolledToBottom;
            
            const isFromCurrentUser = payload.SenderId__c === this.currentUser.id;
            
            // Only add the message if it's not from the current user or if it's not already in the messages array
            // (to avoid duplicates from the optimistic UI update)
            const isDuplicate = this.messages.some(msg => 
                (msg.content === payload.Message__c && 
                 msg.senderId === payload.SenderId__c &&
                 Math.abs(new Date(msg.timestamp) - new Date(payload.Timestamp__c)) < 5000)
            );
            
            if (!isDuplicate) {
                const message = {
                    id: messageEvent.data.event.replayId || this.generateLocalId(),
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
                
                // Only scroll to bottom if we're already at the bottom or if this is our own message
                if (isAtBottom || isFromCurrentUser) {
                    this.scrollToBottom();
                }
            }
        }
        
        // Update conversations list with new message info without triggering reloads
        this.updateConversationWithNewMessage(payload);
    }
    
    // Update conversation list when new message arrives
    updateConversationWithNewMessage(messageData) {
        const updatedConversations = [...this.conversations];
        const conversationIndex = updatedConversations.findIndex(
            conv => conv.id === messageData.ConversationId__c
        );
        
        if (conversationIndex !== -1) {
            // Check if the message is from the current user
            const isFromCurrentUser = messageData.SenderId__c === this.currentUser.id;
            
            // Update existing conversation
            updatedConversations[conversationIndex] = {
                ...updatedConversations[conversationIndex],
                lastMessage: messageData.Message__c,
                lastMessageDate: messageData.Timestamp__c,
                formattedTime: this.formatTimestamp(messageData.Timestamp__c),
                // Only increment unread count if:
                // 1. Message is not from current user
                // 2. The conversation isn't currently selected
                unreadCount: this.selectedConversation?.id === messageData.ConversationId__c || isFromCurrentUser
                    ? updatedConversations[conversationIndex].unreadCount || 0
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
    
    // Load conversations from the server
    async loadConversations() {
        try {
            // Only show loading if disableInitialLoading is false
            if (!this.disableInitialLoading) {
                this.isLoading = true;
            }
            
            const result = await getConversations();
            
            // Add formatted timestamps to each conversation
            if (result) {
                this.conversations = result.map(conv => {
                    return {
                        ...conv,
                        formattedTime: this.formatTimestamp(conv.lastMessageDate)
                    };
                });
            } else {
                this.conversations = [];
            }
            
            this.isLoading = false;
        } catch (error) {
            this.handleError(error);
        }
    }
    
    // Load messages for the selected conversation
    async loadMessages(conversationId) {
        if (!conversationId) return;
        
        try {
            // Store current scroll position
            const messagesContainer = this.template.querySelector('.chat-messages');
            const scrollPos = messagesContainer ? messagesContainer.scrollTop : 0;
            const scrolledToBottom = this.isScrolledToBottom;
            
            // Only show loading if disableInitialLoading is false and if we're fetching for the first time
            const initialLoad = !this.messages || this.messages.length === 0;
            if (!this.disableInitialLoading && initialLoad) {
                this.isLoading = true;
            }
            
            const result = await getMessages({ conversationId: conversationId });
            
            // Add formatted timestamps to each message
            if (result) {
                const newMessages = result.map(msg => this.formatMessage(msg));
                
                // Check if new messages are different from current ones before updating
                const shouldUpdate = this.messages.length !== newMessages.length ||
                    JSON.stringify(this.messages.map(m => m.id)) !== JSON.stringify(newMessages.map(m => m.id));
                
                if (shouldUpdate) {
                    this.messages = newMessages;
                    
                    // Handle scroll position based on context
                    if (initialLoad || scrolledToBottom) {
                        // For initial load or if user was at bottom, scroll to bottom
                        this.scrollToBottom();
                    } else if (messagesContainer) {
                        // Otherwise maintain scroll position
                        setTimeout(() => {
                            messagesContainer.scrollTop = scrollPos;
                        }, 10);
                    }
                }
            } else {
                this.messages = [];
            }
            
            this.isLoading = false;
        } catch (error) {
            this.handleError(error);
        }
    }
    
    // Format a message object with display properties
    formatMessage(msg) {
        return {
            ...msg,
            isFromCurrentUser: msg.senderId === this.currentUser.id,
            formattedTime: this.formatTimestamp(msg.timestamp),
            messageWrapperClass: msg.senderId === this.currentUser.id ? 'message-wrapper outgoing' : 'message-wrapper incoming',
            messageBubbleClass: msg.senderId === this.currentUser.id ? 'message-bubble outgoing' : 'message-bubble incoming'
        };
    }
    
    // Generate a temporary local ID for optimistic UI updates
    generateLocalId() {
        return 'temp-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
    }
    
    // Send a new message
    async handleSendMessage() {
        if (!this.newMessage || !this.newMessage.trim() || !this.selectedConversation) {
            return;
        }
        
        try {
            // Prepare the message text
            const messageText = this.newMessage.trim();
            
            // Store current scroll position and status
            const messagesContainer = this.template.querySelector('.chat-messages');
            const isAtBottom = this.isScrolledToBottom;
            
            // Clear the input field immediately for better UX
            this.newMessage = '';
            
            // Create a temporary optimistic message to show immediately
            const tempMessage = {
                id: this.generateLocalId(),
                senderId: this.currentUser.id,
                senderName: this.currentUser.name,
                content: messageText,
                timestamp: new Date(),
                isFromCurrentUser: true,
                formattedTime: this.formatTimestamp(new Date()),
                messageWrapperClass: 'message-wrapper outgoing',
                messageBubbleClass: 'message-bubble outgoing'
            };
            
            // Add the optimistic message to the UI
            this.messages = [...this.messages, tempMessage];
            
            // Only scroll if we were already at the bottom
            if (isAtBottom) {
                this.scrollToBottom();
            }
            
            // Send the message to the server without waiting for UI updates
            sendMessage({
                conversationId: this.selectedConversation.id,
                message: messageText
            })
            .then(() => {
                // Silently update the conversation in the list without reloading
                const updatedConversations = [...this.conversations];
                const conversationIndex = updatedConversations.findIndex(
                    conv => conv.id === this.selectedConversation.id
                );
                
                if (conversationIndex !== -1) {
                    // Update existing conversation locally
                    updatedConversations[conversationIndex] = {
                        ...updatedConversations[conversationIndex],
                        lastMessage: messageText,
                        lastMessageDate: new Date(),
                        formattedTime: this.formatTimestamp(new Date())
                    };
                    
                    // Move conversation to top of list
                    const conversation = updatedConversations.splice(conversationIndex, 1)[0];
                    updatedConversations.unshift(conversation);
                    
                    // Update conversations without triggering a reload
                    this.conversations = updatedConversations;
                }
            })
            .catch(error => {
                this.handleError(error);
                // Restore the message if sending failed
                this.newMessage = messageText;
            });
            
        } catch (error) {
            this.handleError(error);
            // Restore the message if sending failed
            this.newMessage = messageText;
        }
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
        
        // Adjust textarea height if needed
        this.adjustTextareaHeight();
    }
    
    // Adjust textarea height based on content
    adjustTextareaHeight() {
        setTimeout(() => {
            const textarea = this.template.querySelector('lightning-textarea');
            if (textarea) {
                const textareaElement = textarea.querySelector('textarea');
                if (textareaElement) {
                    // Reset height to recalculate
                    textareaElement.style.height = 'auto';
                    
                    // Calculate new height (with max height limit)
                    const maxHeight = 150; // Maximum height in pixels
                    const newHeight = Math.min(textareaElement.scrollHeight, maxHeight);
                    
                    // Apply new height
                    textareaElement.style.height = newHeight + 'px';
                    
                    // Scroll to bottom if we're at the bottom already
                    if (this.isScrolledToBottom) {
                        this.scrollToBottom();
                    }
                }
            }
        }, 0);
    }
    
    // Check if scrolled to bottom
    get isScrolledToBottom() {
        const container = this.template.querySelector('.chat-messages');
        if (container) {
            const threshold = 30; // pixels from bottom
            return (container.scrollHeight - container.scrollTop - container.clientHeight) < threshold;
        }
        return false;
    }
    
    // Component lifecycle hooks
    renderedCallback() {
        // Apply container style
        const container = this.template.querySelector('.messaging-container');
        if (container) {
            // Apply the container style
            const heightStyle = this.componentHeight > 0 
                ? `height: ${this.componentHeight}px; max-height: 100%;` 
                : 'height: 100%;';
            
            container.style.cssText = `${heightStyle} ${this.themeStyles}`;
        }
        
        // Adjust textarea height if needed
        if (!this._textareaInitialized && this.template.querySelector('lightning-textarea')) {
            this._textareaInitialized = true;
            this.adjustTextareaHeight();
        }
    }
    
    // Toggle between individual recipient, group, and other entity types
    toggleGroupCreation() {
        this.isCreatingGroup = !this.isCreatingGroup;
        this.isOtherEntitySelection = false;
        this.selectedSearchResults = [];
        
        // Reset selection state in search results
        this.searchResults = this.searchResults.map(result => {
            return { ...result, isSelected: false };
        });
    }
    
    // Toggle other entity selection mode
    toggleOtherEntityCreation() {
        this.isOtherEntitySelection = true;
        this.isCreatingGroup = false;
        this.selectedSearchResults = [];
        
        // Reset selection state in search results
        this.searchResults = this.searchResults.map(result => {
            return { ...result, isSelected: false };
        });
    }
    
    // Handle entity type change
    handleEntityTypeChange(event) {
        this.selectedEntityType = event.target.value;
        // Reset search results when entity type changes
        this.searchResults = [];
        this.searchTerm = '';
    }
    
    // Handle change in group name input
    handleGroupNameChange(event) {
        this.groupName = event.target.value;
    }
    
    // Calculate button variants for different selection modes
    get individualButtonVariant() {
        return !this.isCreatingGroup && !this.isOtherEntitySelection ? 'brand' : 'neutral';
    }
    
    get groupButtonVariant() {
        return this.isCreatingGroup ? 'brand' : 'neutral';
    }
    
    get otherButtonVariant() {
        return this.isOtherEntitySelection ? 'brand' : 'neutral';
    }
    
    get individualButtonDisabled() {
        // This should only be disabled when it's already selected (normal mode)
        // It should be enabled when in group or other mode
        return !this.isCreatingGroup && !this.isOtherEntitySelection ? true : false;
    }
    
    get groupButtonDisabled() {
        return this.isCreatingGroup;
    }
    
    get otherButtonDisabled() {
        return this.isOtherEntitySelection;
    }
    
    // Search for users, contacts, or other entities
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
            
            // Use the appropriate entity type for searching
            let entityTypeForSearch = null;
            if (this.isOtherEntitySelection) {
                entityTypeForSearch = this.selectedEntityType;
            }
            
            const results = await findUserOrContact({ 
                searchTerm: searchTerm,
                entityType: entityTypeForSearch
            });
            
            // Process results to add iconName and other necessary properties
            this.searchResults = results.map(result => {
                let iconName = 'standard:user'; // Default icon
                
                // Set appropriate icon name based on type
                switch(result.type) {
                    case 'User':
                        iconName = 'standard:user';
                        break;
                    case 'Contact':
                        iconName = 'standard:contact';
                        break;
                    case 'PublicGroup':
                        iconName = 'standard:groups';
                        break;
                    case 'ChatterGroup':
                        iconName = 'standard:collaboration';
                        break;
                    case 'Queue':
                        iconName = 'standard:queue';
                        break;
                    case 'Role':
                        iconName = 'standard:user_role';
                        break;
                    default:
                        iconName = 'standard:user';
                }
                
                return {
                    ...result,
                    // Map the type to userType for the data attribute
                    userType: result.type,
                    // Set icon name
                    iconName: iconName,
                    // Check if this result is already selected
                    isSelected: this.selectedSearchResults.some(selected => selected.id === result.id)
                };
            });
            
            this.isSearching = false;
        } catch (error) {
            this.handleError(error);
        }
    }
    
    // Update search input label based on selected mode
    get searchInputLabel() {
        if (this.isCreatingGroup) {
            return 'Add Participants';
        } else if (this.isOtherEntitySelection) {
            // Provide more specific search labels based on entity type
            switch(this.selectedEntityType) {
                case 'All':
                    return 'Search for all entity types';
                case 'User':
                    return 'Search for users';
                case 'Contact':
                    return 'Search for contacts';
                case 'PublicGroup':
                    return 'Search for public groups';
                case 'ChatterGroup':
                    return 'Search for chatter groups';
                case 'Queue':
                    return 'Search for queues';
                case 'Role':
                    return 'Search for users with this role';
                default:
                    return `Search for ${this.selectedEntityType}`;
            }
        } else {
            return 'Search for users or contacts';
        }
    }
    
    // Handle click on search result item
    handleResultClick(event) {
        const userId = event.currentTarget.dataset.id;
        const userType = event.currentTarget.dataset.type;
        
        if (this.isCreatingGroup) {
            // For group creation, toggle selection
            const index = this.selectedSearchResults.findIndex(result => result.id === userId);
            
            if (index === -1) {
                // Add to selected list
                const result = this.searchResults.find(result => result.id === userId);
                if (result) {
                    const selected = { ...result, isSelected: true };
                    this.selectedSearchResults.push(selected);
                    
                    // Update search results to show as selected
                    this.searchResults = this.searchResults.map(result => {
                        if (result.id === userId) {
                            return { ...result, isSelected: true };
                        }
                        return result;
                    });
                }
            } else {
                // Remove from selected list
                this.selectedSearchResults.splice(index, 1);
                
                // Update search results to show as unselected
                this.searchResults = this.searchResults.map(result => {
                    if (result.id === userId) {
                        return { ...result, isSelected: false };
                    }
                    return result;
                });
            }
        } else {
            // For regular 1-on-1 conversation
            this.startNewConversation(userId, userType);
        }
    }
    
    // Start a new conversation with selected user/contact/entity
    async startNewConversation(entityId, entityType) {
        try {
            // Only show loading if disableInitialLoading is false
            if (!this.disableInitialLoading) {
                this.isLoading = true;
            }
            
            // Call the startConversation Apex method to get the conversation object
            const conversation = await startConversation({ 
                entityId: entityId, 
                entityType: entityType 
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
            
            // Reset other entity selection state
            this.isOtherEntitySelection = false;
            this.selectedEntityType = 'All';
        } catch (error) {
            this.handleError(error);
        }
    }
    
    // Create a new group conversation
    async createGroup() {
        if (this.selectedSearchResults.length < 2) {
            this.showToast('Error', 'You need to select at least 2 participants for a group', 'error');
            return;
        }
        
        try {
            // Only show loading if disableInitialLoading is false
            if (!this.disableInitialLoading) {
                this.isLoading = true;
            }
            
            // Prepare participant list
            const participants = this.selectedSearchResults.map(p => ({
                id: p.id,
                type: p.userType
            }));
            
            // Call Apex method to create the group
            const conversation = await createGroupConversation({
                groupName: this.groupName || null,
                participants: participants
            });
            
            // Add timestamp formatting
            conversation.formattedTime = this.formatTimestamp(conversation.lastMessageDate);
            
            // Add the new conversation to the top of the list
            this.conversations = [conversation, ...this.conversations];
            
            // Select the new conversation
            this.selectedConversation = conversation;
            
            // Reset state and close modal
            this.showNewMessageModal = false;
            this.searchTerm = '';
            this.searchResults = [];
            this.selectedSearchResults = [];
            this.isCreatingGroup = false;
            this.groupName = '';
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
            
            // Store previous conversation id to check if we're switching or staying on same conversation
            const prevConversationId = this.selectedConversation?.id;
            
            // Update the selected conversation
            this.selectedConversation = selectedConv;
            
            // Only load messages if we're switching to a different conversation
            if (prevConversationId !== conversationId) {
                this.loadMessages(conversationId);
                
                // Close AI summary panel when changing conversations
                this.showAISummary = false;
            }
            
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
        this.showAISummary = false;
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
    
    // Scroll to the bottom of messages
    scrollToBottom() {
        // Use setTimeout to ensure DOM is updated before scrolling
        setTimeout(() => {
            const container = this.template.querySelector('.chat-messages');
            if (container) {
                // Force a reflow to ensure heights are calculated correctly
                void container.offsetHeight;
                
                // Set scroll position to bottom
                container.scrollTop = container.scrollHeight;
                
                // Double-check the scroll position after a short delay
                // This helps with certain edge cases where content might still be loading
                setTimeout(() => {
                    if (container.scrollTop + container.clientHeight < container.scrollHeight - 10) {
                        container.scrollTop = container.scrollHeight;
                    }
                }, 100);
            }
        }, 50);
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
    
    // Calculate button variants for group creation buttons
    get individualButtonVariant() {
        return this.isCreatingGroup ? 'neutral' : 'brand';
    }
    
    get groupButtonVariant() {
        return this.isCreatingGroup ? 'brand' : 'neutral';
    }
    
    get individualButtonDisabled() {
        return !this.isCreatingGroup;
    }
    
    get groupButtonDisabled() {
        return this.isCreatingGroup;
    }
    
    get createGroupButtonDisabled() {
        return this.selectedSearchResults.length < 2;
    }
    
    get createEntityButtonDisabled() {
        return this.selectedSearchResults.length !== 1;
    }
    
    // Start a conversation with the selected entity (for Other entity types)
    startConversationWithEntity() {
        if (this.selectedSearchResults.length !== 1) {
            this.showToast('Error', 'Please select exactly one entity to start a conversation with', 'error');
            return;
        }
        
        const selectedEntity = this.selectedSearchResults[0];
        this.startNewConversation(selectedEntity.id, selectedEntity.userType);
    }
    
    // Handle pill removal for selected participants
    handlePillRemove(event) {
        const userId = event.target.dataset.id;
        const userType = event.target.dataset.type;
        
        // Use the same logic as handleResultClick for consistency
        this.handleResultClick({
            currentTarget: { 
                dataset: { 
                    id: userId, 
                    type: userType 
                }
            }
        });
    }
    
    // Add computed class for list items
    get searchResults() {
        if (!this._searchResults) {
            return [];
        }
        
        return this._searchResults.map(result => {
            return {
                ...result,
                listItemClass: result.isSelected ? 'search-result-item selected' : 'search-result-item'
            };
        });
    }
    
    set searchResults(value) {
        this._searchResults = value;
    }
    
    // Helper to show toast notifications
    showToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({
                title: title,
                message: message,
                variant: variant || 'info'
            })
        );
    }
    
    // Format the summary for display with rich text
    get formattedSummary() {
        if (!this.conversationSummary) {
            return '';
        }
        
        // Replace line breaks with HTML breaks for proper display
        return this.conversationSummary.replace(/\n/g, '<br/>');
    }
    
    // Handle AI summarize button click
    async handleAISummarize() {
        // If no conversation or no messages, do nothing
        if (!this.selectedConversation || !this.hasMessages) {
            this.showToast('Info', 'No messages to summarize', 'info');
            return;
        }
        
        // Toggle the summary display off if it's already showing
        if (this.showAISummary && !this.isGeneratingSummary) {
            this.showAISummary = false;
            return;
        }
        
        // Set up state for generating summary
        this.showAISummary = true;
        this.isGeneratingSummary = true;
        this.conversationSummary = '';
        
        try {
            // Create a detailed summary context with conversation information
            const summaryContext = {
                conversationId: this.selectedConversation.id,
                conversationType: this.selectedConversation.isGroup ? 'Group' : 'Individual',
                participants: this.selectedConversation.isGroup ? this.selectedConversation.status : this.selectedConversation.recipientName,
                messageCount: this.messages.length,
                startTime: this.messages.length > 0 ? this.messages[0].timestamp : null,
                endTime: this.messages.length > 0 ? this.messages[this.messages.length - 1].timestamp : null
            };
            
            // Format messages for the AI with full content
            const messageData = this.messages.map(msg => ({
                id: msg.id,
                sender: msg.senderName,
                content: msg.content,
                timestamp: msg.timestamp,
                isFromCurrentUser: msg.isFromCurrentUser
            }));
            
            console.log('Sending conversation for summarization:', {
                context: summaryContext,
                messageCount: messageData.length
            });
            
            // Call Apex method to generate summary
            const result = await generateAISummary({
                conversationContext: JSON.stringify(summaryContext),
                messages: JSON.stringify(messageData)
            });
            
            // Update state with generated summary
            this.conversationSummary = result;
            this.isGeneratingSummary = false;
        } catch (error) {
            this.handleError(error);
            this.conversationSummary = 'Unable to generate summary at this time.';
            this.isGeneratingSummary = false;
        }
    }
    
    // Close the summary panel
    closeSummary() {
        this.showAISummary = false;
    }
} 