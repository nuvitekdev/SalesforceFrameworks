import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import handleRequest from '@salesforce/apex/LLMController.handleRequest';
import searchRecipients from '@salesforce/apex/NuvitekMessagingController.searchRecipients';
import sendMessage from '@salesforce/apex/NuvitekMessagingController.sendMessage';
import getMessages from '@salesforce/apex/NuvitekMessagingController.getMessages';
import getUnreadMessageCount from '@salesforce/apex/NuvitekMessagingController.getUnreadMessageCount';
import markAsRead from '@salesforce/apex/NuvitekMessagingController.markAsRead';
import getRecentConversations from '@salesforce/apex/NuvitekMessagingController.getRecentConversations';
import getChatSummary from '@salesforce/apex/NuvitekMessagingController.getChatSummary';
import getConversationForUsers from '@salesforce/apex/NuvitekMessagingController.getConversationForUsers';

// Constants
const SEARCH_DELAY = 300; // ms delay for search to prevent too many server calls
const REFRESH_INTERVAL = 30000; // 30 seconds refresh interval
const MAX_MESSAGE_LENGTH = 32000; // Maximum characters in a message

export default class NuvitekMessaging extends NavigationMixin(LightningElement) {
    // Public properties (configurable via metadata)
    @api recordId;
    @api primaryColor = '#22BDC1';  // Default Nuvitek teal
    @api accentColor = '#D5DF23';   // Default Nuvitek lime
    @api backgroundColor = '#FFFFFF';
    @api fontFamily = 'Arial, sans-serif';
    @api fontSize = '14px';
    @api cardTitle = 'Messaging';
    @api defaultLLMName = 'Gemini 2.5';  // Default LLM for summarization
    @api checkNotificationsInterval = 60; // In seconds
    @api componentHeight = 400; // Component height in pixels
    @api sidebarWidth = '30%'; // Sidebar width as percentage or pixels

    // Private reactive properties
    @track messages = [];
    @track searchTerm = '';
    @track searchResults = [];
    @track isSearching = false;
    @track selectedRecipient = null;
    @track conversationId = null;
    @track newMessage = '';
    @track isLoading = false;
    @track hasError = false;
    @track errorMessage = '';
    @track loadingMoreMessages = false;
    @track allMessagesLoaded = false;
    @track messageOffset = 0;
    @track unreadCount = 0;
    @track isComposing = false;
    @track showSearchResults = false;
    @track showNotificationBell = true;
    @track isSummarizingChat = false;
    @track chatSummary = '';
    @track showChatSummary = false;
    @track isLoadingNewMessages = false;
    @track llmOptions = [];
    @track selectedLLM;
    @track showEmojiPicker = false;
    @track fontSizeOptions = [
        { label: 'Small', value: '12px' },
        { label: 'Medium', value: '14px' },
        { label: 'Large', value: '16px' },
        { label: 'Extra Large', value: '18px' }
    ];
    @track fontFamilyOptions = [
        { label: 'Arial', value: 'Arial, sans-serif' },
        { label: 'Helvetica', value: 'Helvetica, sans-serif' },
        { label: 'Times New Roman', value: 'Times New Roman, serif' },
        { label: 'Courier', value: 'Courier, monospace' },
        { label: 'Georgia', value: 'Georgia, serif' }
    ];
    @track isSidebarVisibleMobile = false; // State for mobile sidebar
    @track recentConversations = []; // Array for recent conversations
    @track isLoadingRecent = false; // Loading state for recent conversations
    
    searchTimeoutId = null;
    refreshIntervalId = null;
    notificationCheckIntervalId = null;
    messageEndRef = null;
    hasInitialized = false;

    // Emoji palette data (sample)
    emojiGroups = [
        { name: 'Smileys', emojis: ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '🥰', '😘'] },
        { name: 'Hand Gestures', emojis: ['👍', '👎', '👌', '👏', '🙌', '👐', '🤲', '🤝', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉'] },
        { name: 'Common', emojis: ['❤️', '🔥', '👀', '✨', '💯', '🎉', '🙏', '💪', '🤔', '👏', '🤦', '🤷', '👋', '🙌', '💬'] }
    ];

    // Computed properties
    get messageInputClasses() {
        return `message-input ${this.isComposing ? 'is-composing' : ''}`;
    }

    get showMessages() {
        return this.selectedRecipient !== null;
    }

    get recipientName() {
        return this.selectedRecipient ? this.selectedRecipient.name : '';
    }

    get recipientPhotoUrl() {
        return this.selectedRecipient ? this.selectedRecipient.photoUrl : '';
    }

    get recipientTitle() {
        return this.selectedRecipient ? this.selectedRecipient.title || '' : '';
    }

    get hasMessages() {
        return this.messages.length > 0;
    }

    get hasUnreadMessages() {
        return this.unreadCount > 0;
    }

    get unreadCountDisplay() {
        return this.unreadCount > 99 ? '99+' : this.unreadCount.toString();
    }

    get noMessagesMessage() {
        return this.selectedRecipient ? 
            `Start a conversation with ${this.selectedRecipient.name}` : 
            'Select a recipient or start a new chat';
    }

    get componentStyle() {
        // Create dynamic CSS variables
        const primaryRGB = this.hexToRgb(this.primaryColor);
        const accentRGB = this.hexToRgb(this.accentColor);
        const bgRGB = this.hexToRgb(this.backgroundColor);

        return `--primary-color: ${this.primaryColor}; 
                --primary-dark: ${this.adjustColor(this.primaryColor, -20)}; 
                --primary-light: ${this.adjustColor(this.primaryColor, 20)};
                --primary-color-rgb: ${primaryRGB};
                --accent-color: ${this.accentColor};
                --accent-dark: ${this.adjustColor(this.accentColor, -20)};
                --accent-light: ${this.adjustColor(this.accentColor, 20)};
                --accent-color-rgb: ${accentRGB};
                --background-color: ${this.backgroundColor};
                --background-color-rgb: ${bgRGB};
                --font-family: ${this.fontFamily};
                --font-size: ${this.fontSize};
                --chat-bubble-user: ${this.adjustColor(this.primaryColor, 40)};
                --chat-bubble-recipient: ${this.adjustColor(this.backgroundColor, -5)};
                --model-badge-color: ${this.primaryColor};`;
    }

    connectedCallback() {
        // Apply dynamic styling
        this.applyDynamicStyling();
        
        // Setup refresh for unread message count
        this.notificationCheckIntervalId = setInterval(() => {
            this.checkUnreadMessages();
        }, this.checkNotificationsInterval * 1000);
        
        // Initial check for unread messages
        this.checkUnreadMessages();
        
        // Load recent conversations on initial load
        this.loadRecentConversations();
        
        // Add listener for window resize to handle responsive changes
        window.addEventListener('resize', this.handleResize.bind(this));
    }

    disconnectedCallback() {
        // Clear all intervals
        if (this.refreshIntervalId) {
            clearInterval(this.refreshIntervalId);
        }
        
        if (this.notificationCheckIntervalId) {
            clearInterval(this.notificationCheckIntervalId);
        }
        
        // Remove resize listener
        window.removeEventListener('resize', this.handleResize.bind(this));
    }

    renderedCallback() {
        // Scroll to bottom when new messages are added
        if (this.hasMessages && !this.loadingMoreMessages) {
            this.scrollToBottom();
        }
        
        // Detect container width and apply appropriate classes
        this.detectContainerSize();
        
        // Try to detect and integrate with Nuvitek theme if available
        if (!this.hasInitialized) {
            this.applyThemeIntegration();
            this.hasInitialized = true;
        }
    }
    
    applyThemeIntegration() {
        try {
            // Try to detect Nuvitek theme container
            const themeContainer = document.querySelector('.nuvitek-theme-container');
            if (themeContainer) {
                const computedStyle = getComputedStyle(themeContainer);
                const themeColor = computedStyle.getPropertyValue('--primary-color').trim();
                const themeAccent = computedStyle.getPropertyValue('--accent-color').trim();
                
                // Only override if we detected values and user hasn't specified custom colors
                if (themeColor && this.primaryColor === '#22BDC1') {
                    this.primaryColor = themeColor;
                }
                if (themeAccent && this.accentColor === '#D5DF23') {
                    this.accentColor = themeAccent;
                }
                
                // Check if theme is dark and adjust accordingly
                const isDarkTheme = themeContainer.classList.contains('theme-dark');
                if (isDarkTheme) {
                    this.template.host.classList.add('theme-dark');
                    this.backgroundColor = '#1d1d1f';
                }
            }
        } catch (error) {
            console.error('Error detecting theme:', error);
        }
    }
    
    applyDynamicStyling() {
        // Apply dynamic CSS variable values
        const hostElement = this.template.host;

        // Extract RGB values for rgba() usage
        const primaryRGB = this.hexToRgb(this.primaryColor);
        const accentRGB = this.hexToRgb(this.accentColor);
        const backgroundRGB = this.hexToRgb(this.backgroundColor || '#FFFFFF');

        // Apply all styling variables
        const style = `
            --primary-color: ${this.primaryColor}; 
            --primary-dark: ${this.adjustColor(this.primaryColor, -20)}; 
            --primary-light: ${this.adjustColor(this.primaryColor, 20)};
            --primary-color-rgb: ${primaryRGB};
            --accent-color: ${this.accentColor};
            --accent-dark: ${this.adjustColor(this.accentColor, -20)};
            --accent-light: ${this.adjustColor(this.accentColor, 20)};
            --accent-color-rgb: ${accentRGB};
            --background-color: ${this.backgroundColor || '#FFFFFF'};
            --background-color-rgb: ${backgroundRGB};
            --font-family: ${this.fontFamily || 'Arial, sans-serif'};
            --font-size: ${this.fontSize || '14px'};
            --chat-bubble-user: ${this.adjustColor(this.primaryColor, 40)};
            --chat-bubble-recipient: ${this.backgroundColor === '#1d1d1f' ? '#292b2f' : '#f5f5f7'};
            --component-height: ${this.componentHeight}px;
            --sidebar-width: ${this.sidebarWidth};
        `;

        hostElement.style = style;
        
        // If dark theme is detected, add theme-dark class
        if (this.backgroundColor === '#1d1d1f' || this.isDarkMode) {
            hostElement.classList.add('theme-dark');
        } else {
            hostElement.classList.remove('theme-dark');
        }
    }

    // Handle search input change with debounce
    handleSearchChange(event) {
        const searchTerm = event.target.value;
        this.searchTerm = searchTerm;
        
        // Clear any existing timeout
        if (this.searchTimeoutId) {
            clearTimeout(this.searchTimeoutId);
        }
        
        if (searchTerm.length >= 2) {
            // Show the search results container immediately
            this.showSearchResults = true;
            this.isSearching = true;
            
            // Set a timeout to actually perform the search
            this.searchTimeoutId = setTimeout(() => {
                this.performSearch();
            }, SEARCH_DELAY);
        } else {
            this.searchResults = [];
            this.showSearchResults = false;
            this.isSearching = false;
        }
    }
    
    // Perform the search
    performSearch() {
        this.isSearching = true;
        this.searchResults = [];
        
        // Remove objectTypes from the parameters sent to Apex
        searchRecipients({ searchTerm: this.searchTerm })
            .then(data => {
                if (data) {
                    this.searchResults = data.map(item => ({
                        id: item.id,
                        name: item.name,
                        title: item.title || '', // Handle potentially null title
                        photoUrl: item.photoUrl || this.getPlaceholderImage(item.name),
                        objectType: 'User' // Hardcode objectType as User for Phase 1
                    }));
                    
                    // Apply prioritization (optional, less relevant with only Users)
                    const getPriority = (obj) => {
                        switch(obj.objectType) {
                            case 'User': return 1;
                            // case 'Contact': return 2; // Keep for future phases if needed
                            // case 'Account': return 3;
                            // case 'Lead': return 4;
                            default: return 5;
                        }
                    };
                    this.searchResults.sort((a, b) => getPriority(a) - getPriority(b));
                    
                    console.log('Search Results:', JSON.parse(JSON.stringify(this.searchResults)));
                } else {
                    this.searchResults = [];
                }
            })
            .catch(error => {
                this.handleError(error, 'Error searching recipients.');
                this.searchResults = [];
            })
            .finally(() => {
                this.isSearching = false;
                this.showSearchResults = true;
            });
    }

    // Generate a placeholder image based on name (return data URL for image)
    getPlaceholderImage(name) {
        // Simple placeholder - in a real app, this would generate an SVG with initials
        const initials = name.split(' ')
            .map(word => word.charAt(0))
            .join('')
            .substring(0, 2)
            .toUpperCase();
        
        return `https://ui-avatars.com/api/?name=${encodeURIComponent(initials)}&background=${this.primaryColor.replace('#', '')}&color=fff`;
    }

    // Handle recipient selection
    handleRecipientSelect(event) {
        const recipientId = event.currentTarget.dataset.id;
        
        // Find the selected recipient
        const recipient = this.searchResults.find(result => result.id === recipientId);
        
        if (recipient) {
            console.log('Selected recipient:', recipient);
            this.resetConversationState(); // Clear old messages/state
            this.selectedRecipient = recipient;
            this.showSearchResults = false;
            this.searchTerm = ''; // Clear search term
            this.isLoading = true; 
            this.hideMobileSidebar(); // Close sidebar on mobile after selection

            // --- Get or Create Conversation ID --- 
            console.log(`Fetching conversation ID for user: ${recipient.id}`);
            getConversationForUsers({ userId1: USER_ID, userId2: recipient.id })
                .then(convoId => {
                    console.log(`Conversation ID received: ${convoId}`);
                    this.conversationId = convoId;
                     // Now load messages using the conversation ID
                    this.loadMessages(true); // Pass conversationId implicitly via this.conversationId
                     // Also mark as read immediately upon opening
                    this.markMessagesAsRead(); 
                    this.updateRecentConversations(recipient); // Update recent list
                })
                .catch(error => {
                    this.handleError(error, 'Error getting conversation details');
                    this.isLoading = false; // Stop loading indicator on error
                });
        } else {
            console.error('Selected recipient not found in search results');
        }
    }

    /**
     * Handle selecting a conversation from the recent list
     */
    handleRecentSelect(event) {
        const conversationId = event.currentTarget.dataset.id;
        const convo = this.recentConversations.find(c => c.id === conversationId);

        if (convo) {
            console.log('Selected recent conversation:', convo);
            this.resetConversationState(); // Clear old messages/state
            this.conversationId = conversationId; // Set the conversation ID directly
            this.selectedRecipient = {
                id: convo.participantId, 
                name: convo.name,
                photoUrl: convo.photoUrl,
                title: convo.title
                // objectType: 'User' // Assuming Phase 1 is User-only for recents
            };
            this.isLoading = true;
            this.hideMobileSidebar(); // Close sidebar on mobile after selection

            // Load messages for this conversation
            this.loadMessages(true); 
            // Mark as read upon opening
            this.markMessagesAsRead();
             // Update recent list (might just reorder or refresh unread status)
            this.updateRecentConversations(this.selectedRecipient);
            
        } else {
             console.error('Selected recent conversation not found');
        }
    }

    // Close search results if clicking outside
    handleCloseSearchResults(event) {
        // Check if click was inside the search results container
        const searchResultsContainer = this.template.querySelector('.search-results-container');
        const searchInput = this.template.querySelector('.search-input');
        
        if (searchResultsContainer && !searchResultsContainer.contains(event.target) && 
            searchInput && !searchInput.contains(event.target)) {
            this.showSearchResults = false;
            // Clear search term if results are closed by clicking away
            if (this.searchTerm.length > 0 && this.searchResults.length === 0) {
                this.searchTerm = ''; 
            }
        }
    }

    // Getter for disabling compose button
    get isComposeDisabled() {
        return !this.isComposing;
    }

    // Load messages for the current conversation
    loadMessages(isInitialLoad = false) {
        if (!this.selectedRecipient) return;
        
        if (isInitialLoad) {
            this.isLoading = true;
        } else {
            this.loadingMoreMessages = true;
        }
        
        getMessages({
            conversationId: this.conversationId,
            offset: this.messageOffset,
            limitNum: 50,
            newerThan: null
        })
        .then(result => {
            const newMessages = result.messages;
            
            // Add formatted timestamp and content to each message
            const processedMessages = newMessages.map(msg => {
                return {
                    ...msg,
                    formattedTimestamp: this.formatTimestamp(msg.timestamp),
                    formattedContent: this.formatMessageContent(msg.content),
                    messageClass: msg.isFromUser ? 'message user-message' : 'message recipient-message'
                };
            });
            
            if (isInitialLoad) {
                // For initial load, replace all messages
                this.messages = processedMessages;
            } else {
                // For pagination, add to the beginning of the array
                this.messages = [...processedMessages, ...this.messages];
            }
            
            // Update offset and check if all messages have been loaded
            this.messageOffset += newMessages.length;
            this.allMessagesLoaded = newMessages.length < 50;
            
            // Mark messages as read
            if (this.selectedRecipient && newMessages.length > 0) {
                this.markMessagesAsRead();
            }
            
            // Update this conversation in the recent list
            this.updateRecentConversations({
                ...this.selectedRecipient,
                lastMessageSnippet: this.newMessage.trim().substring(0, 50) + (this.newMessage.trim().length > 50 ? '...' : ''),
                timestamp: new Date().toISOString()
            });
        })
        .catch(error => {
            this.handleError(error, 'Error loading messages');
        })
        .finally(() => {
            if (isInitialLoad) {
                this.isLoading = false;
            } else {
                this.loadingMoreMessages = false;
            }
        });
    }

    // Check for new messages
    checkForNewMessages() {
        if (this.isLoadingNewMessages || !this.hasInitialized || !this.selectedRecipient || !this.conversationId) {
            // Don't check if already checking, not initialized, or no recipient/conversation selected
            return; 
        }

        // --- Use conversationId --- 
        if (!this.conversationId) {
            console.warn('checkForNewMessages called without conversationId.');
            return;
        }

        this.isLoadingNewMessages = true;
        const newestTimestamp = this.getNewestMessageTimestamp();
        console.log(`Checking for new messages since ${newestTimestamp} in conversation ${this.conversationId}`);

        getMessages({ 
            conversationId: this.conversationId, // Pass conversation ID
            offset: 0, 
            limitNum: 50, // Fetch a decent batch in case many arrived
            newerThan: newestTimestamp // Pass the timestamp of the latest known message
        })
        .then(result => {
            const newMessages = result.messages;
            if (newMessages && newMessages.length > 0) {
                console.log(`Received ${newMessages.length} new messages.`);
                const formattedNewMessages = newMessages.map(msg => ({
                    ...msg,
                    timestamp: new Date(msg.timestamp),
                    formattedTimestamp: this.formatTimestamp(msg.timestamp),
                    formattedContent: this.formatMessageContent(msg.content),
                    messageClass: `message ${msg.isFromUser ? 'user-message' : 'recipient-message'}`
                }));

                // Add new messages to the top (or bottom if reversed) of the list
                this.messages = [...this.messages, ...formattedNewMessages];

                // Only show notification/sound if message is not from current user
                const incomingMessages = formattedNewMessages.filter(msg => !msg.isFromUser);
                if (incomingMessages.length > 0) {
                    this.showBrowserNotification(incomingMessages[0]); // Show for the first incoming one
                    this.playNotificationSound();
                    this.markMessagesAsRead(); // Mark as read since we just displayed them
                }

                // Use requestAnimationFrame to ensure DOM updates before scrolling
                requestAnimationFrame(() => {
                    this.scrollToBottom();
                });
            } else {
                console.log('No new messages found.');
            }
        })
        .catch(error => {
            // Don't show toast for background refresh errors unless critical
            console.error('Error checking for new messages:', error);
            // Optionally stop refresh if error persists
            // this.stopMessageRefresh(); 
        })
        .finally(() => {
            this.isLoadingNewMessages = false;
        });
    }

    // Get timestamp of newest message (for checking for newer messages)
    getNewestMessageTimestamp() {
        if (this.messages.length === 0) return null;
        
        // Sort messages by timestamp (newest first) and get the newest
        const sortedMessages = [...this.messages].sort((a, b) => 
            new Date(b.timestamp) - new Date(a.timestamp)
        );
        
        return sortedMessages[0].timestamp;
    }

    // Check for unread messages across all conversations
    checkUnreadMessages() {
        getUnreadMessageCount()
            .then(result => {
                this.unreadCount = result.count;
                
                // If there are unread messages and notification permission is granted, show notification
                if (this.unreadCount > 0 && Notification && Notification.permission === 'granted') {
                    // Only show a notification if the number has increased
                    if (this.unreadCount > this.previousUnreadCount) {
                        this.showBrowserNotification(`You have ${this.unreadCount} unread message(s)`);
                    }
                }
                
                this.previousUnreadCount = this.unreadCount;
            })
            .catch(error => {
                console.error('Error checking unread messages:', error);
            });
    }

    // Mark current conversation messages as read
    markMessagesAsRead() {
        if (!this.selectedRecipient) return;
        
        // --- Use conversationId if available --- 
        if (!this.conversationId) {
            console.warn('markMessagesAsRead called without conversationId.');
            return;
        }

        console.log(`Marking conversation ${this.conversationId} as read.`);
        markAsRead({ conversationId: this.conversationId }) // Pass conversation ID
            .then(() => {
                console.log('Successfully marked conversation as read.');
                // Update local unread count immediately for responsiveness
                this.unreadCount = 0; 
                 // Update recent list immediately
                const recentIndex = this.recentConversations.findIndex(c => c.id === this.conversationId);
                if (recentIndex !== -1) {
                    this.recentConversations[recentIndex].hasUnread = false;
                    this.recentConversations[recentIndex].unreadCount = 0;
                    // Trigger reactivity if needed (though tracking should handle it)
                    this.recentConversations = [...this.recentConversations]; 
                }
                // Optionally trigger a full refresh of unread count from server if needed elsewhere
                // this.checkUnreadMessages(); 
            })
            .catch(error => {
                // Don't show toast for this background action unless debugging
                 console.error('Error marking messages as read:', error);
            });
    }

    // Handle new message input
    handleMessageChange(event) {
        this.newMessage = event.target.value;
        this.isComposing = this.newMessage.trim().length > 0;
    }

    // Handle keydown in message input (for Enter key sending)
    handleKeyDown(event) {
        // Send message on Enter key (unless Shift is held)
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendNewMessage();
        }
    }

    // Send a new message
    sendNewMessage() {
        if (!this.selectedRecipient || !this.newMessage.trim()) return;
        
        // Validate message length
        if (this.newMessage.length > MAX_MESSAGE_LENGTH) {
            this.handleError(
                null, 
                `Message is too long. Maximum length is ${MAX_MESSAGE_LENGTH} characters.`
            );
            return;
        }
        
        this.isLoading = true;
        
        // --- Get or Create Conversation ID first if not available ---
        if (!this.conversationId) {
            console.warn('Attempting to send message without a conversationId. This should ideally be set when recipient is selected.');
            // As a fallback, try to derive it here, though this might cause slight delays
            // Ideally, getConversationForUsers should be called in handleRecipientSelect/handleRecentSelect
            // This path is less likely if the UI flow is correct.
            this.isLoading = true;
            getConversationForUsers({ userId1: USER_ID, userId2: this.selectedRecipient.id })
                .then(convoId => {
                    this.conversationId = convoId;
                    this.isLoading = false;
                    this.sendNewMessage(); // Retry sending now that we have the ID
                })
                .catch(error => {
                    this.handleError(error, 'Error initiating conversation before sending message.');
                    this.isLoading = false;
                });
            return; // Exit here, will retry after getting convoId
        }

        const messageContent = this.newMessage.trim();
        if (!messageContent) return;

        this.isComposing = false; // Collapse input on send attempt
        const tempMessageId = `temp_${Date.now()}`;
        const timestamp = new Date().toISOString();

        // Optimistically add the message to the UI
        const optimisticMessage = {
            id: tempMessageId,
            content: messageContent,
            formattedContent: this.formatMessageContent(messageContent), // Apply formatting
            timestamp: new Date(timestamp),
            formattedTimestamp: this.formatTimestamp(timestamp),
            isFromUser: true,
            messageClass: 'message user-message',
            senderName: 'You', 
            senderPhotoUrl: null // We'll get this from the response if needed
        };
        this.messages = [optimisticMessage, ...this.messages];
        this.newMessage = '';
        this.scrollToBottom();

        // Call Apex to send the message
        sendMessage({ recipientUserId: this.selectedRecipient.id, content: messageContent })
            .then(result => {
                console.log('Message sent successfully:', result);
                // Update the temporary message with the real ID and confirm photo
                const messageIndex = this.messages.findIndex(msg => msg.id === tempMessageId);
                if (messageIndex !== -1) {
                    this.messages[messageIndex].id = result.messageId;
                    // Optionally update sender photo if it wasn't available before
                    if (!this.messages[messageIndex].senderPhotoUrl && result.userPhotoUrl) {
                        this.messages[messageIndex].senderPhotoUrl = result.userPhotoUrl;
                    }
                    // Ensure the conversationId is stored from the result
                    if (result.conversationId) {
                        this.conversationId = result.conversationId; 
                    }
                }
                 // Update recent conversations list
                this.updateRecentConversations(this.selectedRecipient);
                // No need to call checkForNewMessages immediately, rely on interval
            })
            .catch(error => {
                this.handleError(error, 'Error sending message');
                // Remove the optimistic message on failure
                this.messages = this.messages.filter(msg => msg.id !== tempMessageId);
            })
            .finally(() => {
                this.isLoading = false;
                // Ensure input focus is managed correctly after send attempt
                const textarea = this.template.querySelector('.message-input textarea');
                if (textarea) {
                    textarea.focus();
                }
            });
    }

    // Handle click on notification bell
    handleNotificationBellClick() {
        if (this.unreadCount === 0) return;
        
        // In a real implementation, you might navigate to a notifications page
        // or have a dropdown showing recent messages
        this.dispatchEvent(new ShowToastEvent({
            title: 'Unread Messages',
            message: `You have ${this.unreadCount} unread messages`,
            variant: 'info'
        }));
    }

    // Request notification permission for browser notifications
    requestNotificationPermission() {
        if (Notification && Notification.permission !== 'granted') {
            Notification.requestPermission();
        }
    }

    // Show browser notification
    showBrowserNotification(message) {
        if (Notification && Notification.permission === 'granted') {
            const notification = new Notification('New Message', {
                body: message,
                icon: '/assets/images/notification-icon.png' // Replace with your icon
            });
            
            notification.onclick = () => {
                window.focus();
                notification.close();
            };
        }
    }

    // Play notification sound
    playNotificationSound() {
        try {
            const audio = new Audio('/assets/sounds/notification.mp3'); // Replace with your sound file
            audio.play();
        } catch (error) {
            console.error('Error playing notification sound:', error);
        }
    }

    // Handle scroll in message container (for infinite scroll / load more)
    handleScroll(event) {
        const container = event.target;
        
        // Check if user has scrolled near the top and we have more messages to load
        if (container.scrollTop < 100 && !this.loadingMoreMessages && !this.allMessagesLoaded) {
            this.loadMessages(false);
        }
    }

    // Scroll to bottom of message container
    scrollToBottom() {
        setTimeout(() => {
            const messageContainer = this.template.querySelector('.message-container');
            if (messageContainer) {
                messageContainer.scrollTop = messageContainer.scrollHeight;
            }
        }, 0);
    }

    // Handle chat summarization
    summarizeChat() {
        if (!this.conversationId) {
            this.handleError(null, 'Cannot summarize: No active conversation selected.');
            return;
        }
        if (!this.defaultLLMName) {
             this.handleError(null, 'Cannot summarize: Default AI model name is not configured.');
            return;
        }

        console.log(`Requesting summary for conversation ${this.conversationId} using model ${this.defaultLLMName}`);
        this.isSummarizingChat = true;
        this.showChatSummary = true; // Show the section with the loading spinner
        this.chatSummary = ''; // Clear previous summary

        getChatSummary({ conversationId: this.conversationId, modelLabel: this.defaultLLMName })
            .then(summary => {
                console.log('Summary received:', summary);
                this.chatSummary = summary;
            })
            .catch(error => {
                this.handleError(error, 'Error generating chat summary');
                this.chatSummary = 'Failed to generate summary.'; // Display error in summary box
            })
            .finally(() => {
                this.isSummarizingChat = false;
                console.log('Summarization finished.');
            });
    }

    // Toggle chat summary visibility
    toggleChatSummary() {
        this.showChatSummary = !this.showChatSummary;
    }

    // Handle error and show toast notification
    handleError(error, fallbackMessage) {
        console.error(fallbackMessage, error);
        
        const errorMessage = error?.body?.message || error?.message || fallbackMessage;
        
        this.dispatchEvent(new ShowToastEvent({
            title: 'Error',
            message: errorMessage,
            variant: 'error'
        }));
    }

    // Toggle emoji picker
    toggleEmojiPicker() {
        this.showEmojiPicker = !this.showEmojiPicker;
    }

    // Insert emoji into message
    insertEmoji(event) {
        const emoji = event.currentTarget.dataset.emoji;
        if (emoji) {
            this.newMessage += emoji;
            this.isComposing = true;
            
            // Focus back on the input after inserting emoji
            setTimeout(() => {
                const inputField = this.template.querySelector('.message-input');
                if (inputField) {
                    inputField.focus();
                }
            }, 0);
        }
    }

    // Color manipulation helper function
    adjustColor(color, amount) {
        // Simple implementation - in production you'd want a more robust color manipulation
        try {
            if (!color || !color.startsWith('#')) return color;
            
            // Convert hex to RGB
            let r = parseInt(color.substring(1, 3), 16);
            let g = parseInt(color.substring(3, 5), 16);
            let b = parseInt(color.substring(5, 7), 16);
            
            // Adjust each component
            r = Math.max(0, Math.min(255, r + amount));
            g = Math.max(0, Math.min(255, g + amount));
            b = Math.max(0, Math.min(255, b + amount));
            
            // Convert back to hex
            return '#' + 
                ((1 << 24) + (r << 16) + (g << 8) + b)
                .toString(16)
                .slice(1);
        } catch (e) {
            console.error('Error adjusting color:', e);
            return color; // Return original on error
        }
    }

    // Convert hex color to RGB values
    hexToRgb(hex) {
        // Default fallback
        if (!hex || !hex.startsWith('#')) return '34, 189, 193';
        
        // Remove the # if present
        hex = hex.replace('#', '');
        
        // Handle shorthand hex
        if (hex.length === 3) {
            hex = hex.split('').map(char => char + char).join('');
        }
        
        // Parse the hex values
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        
        return `${r}, ${g}, ${b}`;
    }

    // Format timestamp for messages
    formatTimestamp(timestamp) {
        const date = new Date(timestamp);
        const now = new Date();
        const yesterday = new Date(now);
        yesterday.setDate(yesterday.getDate() - 1);
        
        // Today: show time only
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        // Yesterday: show "Yesterday" with time
        if (date.toDateString() === yesterday.toDateString()) {
            return `Yesterday ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
        }
        
        // This year: show month and day with time
        if (date.getFullYear() === now.getFullYear()) {
            return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + 
                   ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }
        
        // Different year: show full date
        return date.toLocaleDateString() + ' ' + 
               date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    /**
     * Add a toggleSidebar method to handle mobile sidebar visibility 
     */
    toggleSidebar() {
        const sidebar = this.template.querySelector('[data-id="sidebar"]');
        const backdrop = this.template.querySelector('.sidebar-backdrop');
        if (sidebar && backdrop) {
            this.isSidebarVisibleMobile = !this.isSidebarVisibleMobile;
            if (this.isSidebarVisibleMobile) {
                sidebar.classList.add('mobile-visible');
                backdrop.classList.add('visible');
            } else {
                sidebar.classList.remove('mobile-visible');
                backdrop.classList.remove('visible');
            }
        }
    }
    
    /**
     * Handles clicking the backdrop to close the mobile sidebar
     */
    handleBackdropClick() {
        if (this.isSidebarVisibleMobile) {
            this.hideMobileSidebar();
        }
    }
    
    /**
     * Explicitly hides the mobile sidebar
     */
    hideMobileSidebar() {
        const sidebar = this.template.querySelector('[data-id="sidebar"]');
        const backdrop = this.template.querySelector('.sidebar-backdrop');
        if (sidebar && backdrop) {
            this.isSidebarVisibleMobile = false;
            sidebar.classList.remove('mobile-visible');
            backdrop.classList.remove('visible');
        }
    }

    // Modify get methods for removing font selectors from UI
    get fontSizeOptions() {
        return null; // No longer needed
    }

    get fontFamilyOptions() {
        return null; // No longer needed
    }

    /**
     * Detect the parent container size and apply the appropriate CSS class
     */
    detectContainerSize() {
        try {
            const container = this.template.querySelector('.nuvitek-messaging-container');
            if (!container) return;
            
            // Find the closest container with an slds-col class
            let parentElement = container.parentElement;
            let foundSizeClass = false;
            
            while (parentElement && !foundSizeClass) {
                // Check for Salesforce grid size classes
                const classList = parentElement.className.split(' ');
                
                for (const cls of classList) {
                    if (cls.includes('slds-size_') || cls.includes('slds-large-size_') || 
                        cls.includes('slds-medium-size_')) {
                        
                        // Reset existing classes
                        container.classList.remove('slds-size_6-of-12-container');
                        container.classList.remove('slds-size_4-of-12-container');
                        
                        // Apply the appropriate class
                        if (cls.includes('_6-of-12') || cls.includes('_6-of-')) {
                            container.classList.add('slds-size_6-of-12-container');
                            foundSizeClass = true;
                        } else if (cls.includes('_4-of-12') || cls.includes('_4-of-')) {
                            container.classList.add('slds-size_4-of-12-container');
                            foundSizeClass = true;
                        }
                        
                        break;
                    }
                }
                
                if (!foundSizeClass && parentElement.parentElement) {
                    parentElement = parentElement.parentElement;
                } else {
                    break;
                }
            }
            
            // If no specific size class found, check the width directly
            if (!foundSizeClass) {
                const containerWidth = container.offsetWidth;
                
                // Reset existing classes
                container.classList.remove('slds-size_6-of-12-container');
                container.classList.remove('slds-size_4-of-12-container');
                
                // Apply class based on actual width
                if (containerWidth < 600) {
                    container.classList.add('slds-size_4-of-12-container');
                } else if (containerWidth < 900) {
                    container.classList.add('slds-size_6-of-12-container');
                }
            }
        } catch (error) {
            console.error('Error detecting container size:', error);
        }
    }

    /**
     * Handles window resize events to manage sidebar visibility on desktop vs mobile
     */
    handleResize() {
        const isMobile = window.innerWidth <= 767;
        const sidebar = this.template.querySelector('[data-id="sidebar"]');
        const backdrop = this.template.querySelector('.sidebar-backdrop');
        const body = this.template.querySelector('.messaging-body');

        if (!isMobile) {
            // If switching to desktop view and mobile sidebar was open, hide it properly
            if (this.isSidebarVisibleMobile) {
                this.isSidebarVisibleMobile = false;
                if (sidebar) sidebar.classList.remove('mobile-visible');
                if (backdrop) backdrop.classList.remove('visible');
            }
            if (body) body.classList.remove('mobile-view');
        } else {
            if (body) body.classList.add('mobile-view');
        }
        
        // Re-detect container size on resize
        this.detectContainerSize();
    }

    /**
     * Loads the list of recent conversations from Apex
     */
    loadRecentConversations() {
        this.isLoadingRecent = true;
        getRecentConversations()
            .then(results => {
                // Process results: generate placeholder images if needed
                this.recentConversations = results.map(convo => ({
                    ...convo,
                    photoUrl: convo.photoUrl || this.getPlaceholderImage(convo.name)
                }));
            })
            .catch(error => {
                this.handleError(error, 'Error loading recent conversations');
                this.recentConversations = []; // Clear on error
            })
            .finally(() => {
                this.isLoadingRecent = false;
            });
    }
    
    /**
     * Updates the recent conversations list when a new chat is started/selected.
     * Moves the selected conversation to the top.
     * @param {object} recipient - The recipient object selected (from search or recent)
     */
    updateRecentConversations(recipient) {
        if (!recipient) return;

        // Check if this conversation already exists in recent
        const existingIndex = this.recentConversations.findIndex(convo => convo.id === recipient.id);
        
        let updatedRecents = [...this.recentConversations];

        if (existingIndex > -1) {
            // If exists, remove it from its current position
            updatedRecents.splice(existingIndex, 1);
        } 
        
        // Create a new entry or update the existing one for the top
        const newEntry = {
            id: recipient.id,
            name: recipient.name,
            photoUrl: recipient.photoUrl || this.getPlaceholderImage(recipient.name),
            title: recipient.title,
            objectType: recipient.objectType,
            lastMessageSnippet: 'Conversation started', // Placeholder - update when messages load/send
            hasUnread: false, // Assume read when selected
            unreadCount: 0,
            timestamp: new Date().toISOString() // Use current time for sorting initially
        };

        // Add the new/updated entry to the beginning of the array
        updatedRecents.unshift(newEntry);

        // Limit the number of recent conversations shown (e.g., 20)
        if (updatedRecents.length > 20) {
            updatedRecents = updatedRecents.slice(0, 20);
        }

        this.recentConversations = updatedRecents;
    }
    
    /**
     * Helper to check if there are recent conversations
     */
    get hasRecentConversations() {
        return this.recentConversations.length > 0;
    }
    
    /** 
     * Reset conversation-specific state when changing recipients
     */
    resetConversationState() {
        this.messages = [];
        this.selectedRecipient = null;
        this.conversationId = null; // <-- Reset conversation ID
        this.messageOffset = 0;
        this.allMessagesLoaded = false;
        this.hasInitialized = false;
        this.newMessage = '';
        this.isComposing = false;
        this.stopMessageRefresh(); // Stop refresh when changing conversations
        this.showChatSummary = false; // Hide summary section
        this.chatSummary = '';
        this.isSummarizingChat = false;
        console.log('Conversation state reset.');
    }
    
    /**
     * Start the interval timer to check for new messages
     */
    startMessageRefresh() {
        // Clear existing interval first
        if (this.refreshIntervalId) {
            clearInterval(this.refreshIntervalId);
        }
        // Set new interval
        this.refreshIntervalId = setInterval(() => {
            this.checkForNewMessages();
        }, REFRESH_INTERVAL);
    }

    /**
     * Formats message content (e.g., for links, markdown in the future).
     * Currently just returns content, ready for lwc:inner-html.
     * @param {string} content - Raw message content
     * @returns {string} - Formatted HTML string for display
     */
    formatMessageContent(content) {
        // Basic link detection (replace with a more robust library if needed)
        const urlRegex = /(\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|!:,.;]*[-A-Z0-9+&@#\/%=~_|])/ig;
        let formatted = content.replace(urlRegex, function(url) {
            return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
        });
        
        // Simple newline to <br> conversion
        formatted = formatted.replace(/\n/g, '<br />');
        
        // Basic bold/italic markdown (example)
        // formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        
        return formatted; 
    }
}