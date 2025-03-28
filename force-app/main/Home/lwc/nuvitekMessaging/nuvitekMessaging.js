import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import handleRequest from '@salesforce/apex/LLMController.handleRequest';
import searchRecipients from '@salesforce/apex/NuvitekMessagingController.searchRecipients';
import sendMessage from '@salesforce/apex/NuvitekMessagingController.sendMessage';
import getMessages from '@salesforce/apex/NuvitekMessagingController.getMessages';
import getUnreadMessageCount from '@salesforce/apex/NuvitekMessagingController.getUnreadMessageCount';
import markAsRead from '@salesforce/apex/NuvitekMessagingController.markAsRead';

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
    @api defaultLLMName = 'GPT4o';  // Default LLM for summarization
    @api searchObjects = 'User,Contact,Account,Lead'; // Comma-separated list of objects to search
    @api checkNotificationsInterval = 60; // In seconds
    @api componentHeight = 400; // Component height in pixels
    @api sidebarWidth = '30%'; // Sidebar width as percentage or pixels

    // Private reactive properties
    @track messages = [];
    @track searchTerm = '';
    @track searchResults = [];
    @track isSearching = false;
    @track selectedRecipient = null;
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
            'Select a recipient to start messaging';
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
    }

    disconnectedCallback() {
        // Clear all intervals
        if (this.refreshIntervalId) {
            clearInterval(this.refreshIntervalId);
        }
        
        if (this.notificationCheckIntervalId) {
            clearInterval(this.notificationCheckIntervalId);
        }
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
        if (this.searchTerm.length < 2) return;
        
        this.isSearching = true;
        
        // Split the comma-separated string of object types
        const searchObjectsList = this.searchObjects.split(',').map(obj => obj.trim());
        
        searchRecipients({
            searchTerm: this.searchTerm,
            objectTypes: searchObjectsList
        })
        .then(results => {
            this.searchResults = results.map(result => {
                return {
                    ...result,
                    // Use a placeholder image if none is provided
                    photoUrl: result.photoUrl || this.getPlaceholderImage(result.name)
                };
            });
            
            // Sort results: Users first, then Contacts, then other objects
            this.searchResults.sort((a, b) => {
                // Helper function to assign priority
                const getPriority = (obj) => {
                    if (obj.objectType === 'User') return 1;
                    if (obj.objectType === 'Contact') return 2;
                    return 3;
                };
                
                const priorityA = getPriority(a);
                const priorityB = getPriority(b);
                
                return priorityA - priorityB || a.name.localeCompare(b.name);
            });
        })
        .catch(error => {
            this.handleError(error, 'Error searching for recipients');
        })
        .finally(() => {
            this.isSearching = false;
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
            this.selectedRecipient = recipient;
            this.searchTerm = '';
            this.searchResults = [];
            this.showSearchResults = false;
            
            // Reset message-related state
            this.messages = [];
            this.messageOffset = 0;
            this.allMessagesLoaded = false;
            
            // Load messages for this recipient
            this.loadMessages(true);
            
            // Setup regular refresh for this conversation
            if (this.refreshIntervalId) {
                clearInterval(this.refreshIntervalId);
            }
            
            this.refreshIntervalId = setInterval(() => {
                this.checkForNewMessages();
            }, REFRESH_INTERVAL);
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
            recipientId: this.selectedRecipient.id,
            recipientType: this.selectedRecipient.objectType,
            offset: this.messageOffset,
            limit: 50 // Fetch 50 messages at a time
        })
        .then(result => {
            const newMessages = result.messages;
            
            // Add formatted timestamp to each message
            const processedMessages = newMessages.map(msg => {
                return {
                    ...msg,
                    formattedTimestamp: this.formatTimestamp(msg.timestamp),
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
        if (!this.selectedRecipient) return;
        
        this.isLoadingNewMessages = true;
        
        getMessages({
            recipientId: this.selectedRecipient.id,
            recipientType: this.selectedRecipient.objectType,
            offset: 0,
            limit: 10,
            newerThan: this.getNewestMessageTimestamp()
        })
        .then(result => {
            const newMessages = result.messages;
            
            if (newMessages.length > 0) {
                // Process messages with formatted timestamp
                const processedMessages = newMessages.map(msg => {
                    return {
                        ...msg,
                        formattedTimestamp: this.formatTimestamp(msg.timestamp),
                        messageClass: msg.isFromUser ? 'message user-message' : 'message recipient-message'
                    };
                });
                
                // Add new messages to the end
                this.messages = [...this.messages, ...processedMessages];
                
                // Play a subtle notification sound if messages are from recipient
                if (newMessages.some(msg => !msg.isFromUser)) {
                    this.playNotificationSound();
                }
                
                // Mark as read since conversation is open
                this.markMessagesAsRead();
            }
        })
        .catch(error => {
            console.error('Error checking for new messages:', error);
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
        
        markAsRead({
            recipientId: this.selectedRecipient.id,
            recipientType: this.selectedRecipient.objectType
        })
        .then(() => {
            // Refresh unread count
            this.checkUnreadMessages();
        })
        .catch(error => {
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
        
        sendMessage({
            recipientId: this.selectedRecipient.id,
            recipientType: this.selectedRecipient.objectType,
            content: this.newMessage.trim()
        })
        .then(result => {
            const timestamp = new Date().toISOString();
            
            // Add the new message to the messages array
            this.messages = [
                ...this.messages,
                {
                    id: result.messageId,
                    content: this.newMessage,
                    timestamp: timestamp,
                    formattedTimestamp: this.formatTimestamp(timestamp),
                    isFromUser: true,
                    messageClass: 'message user-message',
                    senderName: 'You',
                    senderPhotoUrl: result.userPhotoUrl || this.getPlaceholderImage('You')
                }
            ];
            
            // Clear the message input
            this.newMessage = '';
            this.isComposing = false;
            
            // Scroll to bottom
            this.scrollToBottom();
        })
        .catch(error => {
            this.handleError(error, 'Error sending message');
        })
        .finally(() => {
            this.isLoading = false;
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
        if (this.messages.length < 5) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Not Enough Messages',
                message: 'Need at least 5 messages to generate a summary',
                variant: 'info'
            }));
            return;
        }
        
        this.isSummarizingChat = true;
        
        // Prepare conversation text for summarization
        const conversationText = this.messages.map(msg => {
            const sender = msg.isFromUser ? 'You' : this.selectedRecipient.name;
            return `${sender}: ${msg.content}`;
        }).join('\n\n');
        
        // Create a summarization prompt
        const summaryPrompt = `Please provide a concise summary of the following conversation, capturing key points and decisions:

${conversationText}

SUMMARY:`;
        
        // Call LLM to summarize
        handleRequest({
            recordId: null,
            configName: this.defaultLLMName,
            prompt: summaryPrompt,
            operation: 'ask'
        })
        .then(result => {
            this.chatSummary = result;
            this.showChatSummary = true;
            
            // Show success toast
            this.dispatchEvent(new ShowToastEvent({
                title: 'Summary Generated',
                message: 'Chat summary created successfully',
                variant: 'success'
            }));
        })
        .catch(error => {
            this.handleError(error, 'Error generating summary');
        })
        .finally(() => {
            this.isSummarizingChat = false;
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
        const sidebar = this.template.querySelector('.sidebar');
        if (sidebar) {
            sidebar.classList.toggle('mobile-visible');
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
}