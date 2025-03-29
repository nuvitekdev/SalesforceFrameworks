import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import USER_ID from '@salesforce/user/Id';

// Import Apex methods
import searchRecipients from '@salesforce/apex/NuvitekMessagingController.searchRecipients';
import getRecentConversations from '@salesforce/apex/NuvitekMessagingController.getRecentConversations';
import sendMessage from '@salesforce/apex/NuvitekMessagingController.sendMessage';
import getMessages from '@salesforce/apex/NuvitekMessagingController.getMessages';
import markAsRead from '@salesforce/apex/NuvitekMessagingController.markConversationAsRead';
import getUnreadMessageCount from '@salesforce/apex/NuvitekMessagingController.getUnreadMessageCount';
import getChatSummary from '@salesforce/apex/NuvitekMessagingController.getChatSummary';
import getConversationForUsers from '@salesforce/apex/NuvitekMessagingController.getConversationForUsers';
import getGroupConversationInfo from '@salesforce/apex/NuvitekMessagingController.getGroupConversationInfo';
import createGroupConversation from '@salesforce/apex/NuvitekMessagingController.createGroupConversation';

// Constants
const SEARCH_DELAY = 300; // ms delay for search to prevent too many server calls
const REFRESH_INTERVAL = 30000; // 30 seconds refresh interval
const CHECK_NOTIFICATIONS_INTERVAL = 60000; // 60 seconds
const MAX_MESSAGE_LENGTH = 4000; // Maximum characters in a message

export default class NuvitekMessaging extends NavigationMixin(LightningElement) {
    // Public properties (configurable via metadata)
    @api recordId;
    @api primaryColor = '#22BDC1';  // Default Nuvitek teal
    @api accentColor = '#D5DF23';   // Default Nuvitek lime
    @api backgroundColor = '#FFFFFF';
    @api fontFamily = 'Arial, sans-serif';
    @api fontSize = '14px';
    @api cardTitle = 'Messaging';
    @api defaultLLMName = 'Gemini 2.5 Pro';  // Default LLM for summarization
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
    @track refreshUICounter = 0; // Counter to force UI updates
    @track showMessagesPanel = false; // Explicit flag for message panel visibility
    @track showRecentPanel = true; // Explicit flag for recent panel visibility
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
    
    // New group chat support
    @track isCreatingGroup = false; // Flag to indicate group creation mode
    @track newGroupName = ''; // Name for the new group
    @track newGroupDescription = ''; // Description for the new group
    @track selectedGroupParticipants = []; // Selected participants for the new group
    @track showGroupCreationModal = false; // Modal visibility flag
    @track searchingGroupParticipants = false; // Flag to indicate searching participants
    @track groupParticipantResults = []; // Search results for group participants
    @track showGroupParticipantResults = false; // Flag to show/hide results
    @track selectedObjectTypes = ['User', 'Contact', 'Account', 'Group']; // Default object types for search
    
    // Group info modal
    @track showGroupInfoModal = false; // Flag to show/hide group info modal
    @track groupInfo = {}; // Group conversation details
    @track isGroupAdmin = false; // Flag to indicate if current user is group admin
    
    searchTimeoutId = null;
    refreshIntervalId = null;
    notificationCheckIntervalId = null;
    messageEndRef = null;
    hasInitialized = false;

    // Emoji palette data (sample)
    emojiGroups = [
        { name: 'Smileys', emojis: ['😀', '😁', '😂', '🤣', '😃', '😄', '😅', '😆', '😉', '😊', '😋', '😎', '😍', '🥰', '😘'] },
        { name: 'Hand Gestures', emojis: ['👍', '👎', '👌', '👏', '🙌', '👐', '🤲', '🤝', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉'] },
        { name: 'Common', emojis: ['❤️', '🔥', '👀', '✨', '💯', '🎉', '🙏', '💪', '🤔', '👏', '🤦', '🤷', '👋', '🙌', '��'] }
    ];

    // Track mobile sidebar state
    @track isMobileSidebarVisible = false;

    // Computed properties
    get messageInputClasses() {
        return `message-input ${this.isComposing ? 'is-composing' : ''}`;
    }

    get showMessages() {
        // Use explicit showMessagesPanel flag as primary check
        if (this.showMessagesPanel === true) {
            return true;
        }
        
        // Fallback to checking if recipient is selected and conversation exists
        return this.selectedRecipient !== null && this.conversationId;
    }

    get recipientName() {
        return this.selectedRecipient ? this.selectedRecipient.name : '';
    }

    get recipientPhotoUrl() {
        return this.selectedRecipient ? this.selectedRecipient.photoUrl : '';
    }

    get recipientTitle() {
        return this.selectedRecipient ? this.selectedRecipient.title : '';
    }

    get recipientInitials() {
        if (!this.selectedRecipient || !this.selectedRecipient.name) {
            return '';
        }
        
        // Extract initials from the recipient name
        const nameParts = this.selectedRecipient.name.split(' ');
        if (nameParts.length === 1) {
            // If only one word, return first two characters
            return nameParts[0].substring(0, 2).toUpperCase();
        } else {
            // Return first letter of first and last word
            return (nameParts[0].charAt(0) + nameParts[nameParts.length - 1].charAt(0)).toUpperCase();
        }
    }

    get hasMessages() {
        return this.messages && this.messages.length > 0;
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
        
        // Setup resize listener for responsive behavior
        this.handleResize = this.handleResize.bind(this);
        window.addEventListener('resize', this.handleResize);
        this.handleResize();
        
        // Setup refresh for unread message count
        this.notificationCheckIntervalId = setInterval(() => {
            this.checkUnreadMessages();
        }, this.checkNotificationsInterval * 1000);
        
        // Initial check for unread messages
        this.checkUnreadMessages();
        
        // Load recent conversations on initial load
        this.loadRecentConversations();
    }

    disconnectedCallback() {
        // Clean up resize listener
        window.removeEventListener('resize', this.handleResize);
        
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
        this.isSearching = true;
        this.searchResults = [];
        
        // Include all object types: User, Contact, Account, Group
        searchRecipients({ 
            searchTerm: this.searchTerm,
            objectTypes: ['User', 'Contact', 'Account', 'Group']
        })
            .then(data => {
                if (data) {
                    this.searchResults = data.map(item => ({
                        id: item.id,
                        name: item.name,
                        title: item.title || '', // Handle potentially null title
                        photoUrl: item.photoUrl || null, // Use null so we can check in the template
                        objectType: item.objectType || 'User', // Use objectType from server or default to User
                        iconName: this.getIconForObjectType(item.objectType || 'User') // Get the appropriate icon
                    }));
                    
                    // Apply prioritization for all object types
                    const getPriority = (obj) => {
                        switch(obj.objectType) {
                            case 'User': return 1;      // Users first
                            case 'Contact': return 2;   // Contacts second
                            case 'Account': return 3;   // Accounts third
                            case 'Group': return 4;     // Groups last
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

    /**
     * Handles selection of a recipient from search results
     * Supports User, Contact, Person Account, and Group recipients
     * Ensures proper conversation setup and message loading
     */
    handleRecipientSelect(event) {
        const recipientId = event.currentTarget.dataset.id;
        const objectType = event.currentTarget.dataset.type || 'User';
        
        // Find the selected recipient from search results
        const recipient = this.searchResults.find(r => r.id === recipientId);
        
        if (!recipient) {
            console.error('Recipient not found in search results');
            return;
        }
        
        console.log('Selected recipient from search:', JSON.stringify(recipient));
        console.log('Search Results:', JSON.stringify(this.searchResults));
        
        // Determine if this is a group chat
        const isGroup = objectType === 'Group';
        
        // Close search results
            this.showSearchResults = false;
        
        // Reset conversation state (clear messages, etc.)
        this.resetConversationState();
        
        // For users, find or create a 1:1 conversation
        if (objectType === 'User') {
            console.log(`User recipient selected: ${recipient.name}`);
            this.isLoading = true; 
            
            // For users, we need to find or create a 1:1 conversation
            getConversationForUsers({ 
                userId1: USER_ID, 
                userId2: recipientId 
            })
            .then(conversationId => {
                console.log(`User conversation set up: ${conversationId}`);
                
                // Set the conversation ID from Apex
                this.conversationId = conversationId;
                
                // Set the selected recipient with proper properties
                this.selectedRecipient = {
                    ...recipient,
                    isGroupChat: false
                };
                
                // Update UI state flags - explicitly show messages panel and hide recent panel
                this.showMessagesPanel = true;
                this.showRecentPanel = false;
                
                // Add debugging logs
                console.log('Show messages state after user selection:', this.showMessages);
                console.log('Conversation ID after user selection:', this.conversationId);
                
                // Force a UI refresh  
                this.refreshUICounter = (this.refreshUICounter || 0) + 1;
                
                // If we have a conversation, load messages and mark as read
                if (this.conversationId) {
                    // Small delay to allow UI to update first
                    setTimeout(() => {
                        this.loadMessages(true);
                    this.markMessagesAsRead(); 
                        
                        // Update recent conversations to include this one at the top
                        this.updateRecentConversations(this.selectedRecipient);
                    }, 100);
                }
                })
                .catch(error => {
                console.error('Error in getConversationForUsers:', error);
                this.handleError(error, 'Error setting up conversation');
            })
            .finally(() => {
                this.isLoading = false;
            });
        } 
        // For Groups, Contacts, Accounts, etc.
        else {
            console.log(`Non-user recipient selected: ${objectType}`);
            
            // For non-User recipients, we'll create the conversation when sending first message
            this.selectedRecipient = {
                ...recipient,
                isGroupChat: isGroup
            };
            
            this.conversationId = null; // Will be created on first message send
            
            // Update UI state - explicitly show messages panel and hide recent panel
            this.showMessagesPanel = true;
            this.showRecentPanel = false;
            this.isLoading = false;
            
            // Force UI refresh
            this.refreshUICounter = (this.refreshUICounter || 0) + 1;
            
            console.log('Show messages state after non-user selection:', this.showMessages);
        }
    }

    /**
     * Handle selecting a conversation from the recent list
     */
    handleRecentSelect(event) {
        const conversationId = event.currentTarget.dataset.id;
        
        // Add additional console logging for debugging
        console.log('Recent conversation selected. Dataset:', JSON.stringify(event.currentTarget.dataset));
        console.log('Looking for conversation with ID:', conversationId);
        
        // Find the corresponding conversation object
        const convo = this.recentConversations.find(c => c.id === conversationId);
        
        console.log('Found conversation:', convo ? JSON.stringify(convo) : 'null');

        if (convo) {
            // Clear old messages/state before setting new properties
            this.resetConversationState(); 
            
            // Set conversation ID directly
            this.conversationId = conversationId; 
            
            // CRITICAL: Update UI state flags FIRST before any async operations
            this.showMessagesPanel = true;
            this.showRecentPanel = false;
            
            // Create proper recipient object with all required properties
            this.selectedRecipient = {
                id: convo.id, 
                name: convo.name,
                photoUrl: convo.photoUrl,
                title: convo.title,
                objectType: convo.objectType || 'User', // Include objectType from the conversation
                isGroupChat: convo.isGroupChat || false // Ensure group chat status is set
            };
            
            console.log('Selected recipient set to:', JSON.stringify(this.selectedRecipient));
            console.log('Show messages state:', this.showMessages);
            
            // Force component to re-render by manipulating a tracked property
            this.refreshUICounter = (this.refreshUICounter || 0) + 1;
            
            // Close mobile sidebar if applicable
            this.hideMobileSidebar();
            
            // AFTER UI updates are in place, then set loading state and fetch messages
            this.isLoading = true;

            // Load messages for this conversation - use zero delay to run immediately
            // after component updates
            setTimeout(() => {
            this.loadMessages(true); 
                
            // Mark as read upon opening
            this.markMessagesAsRead();
                
             // Update recent list (might just reorder or refresh unread status)
            this.updateRecentConversations(this.selectedRecipient);
                
                this.isLoading = false;
            }, 0);
            
        } else {
             console.error('Selected recent conversation not found in recentConversations array');
             console.log('Available conversations:', JSON.stringify(this.recentConversations));
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
        // Enable button when there's text in the message field
        return !this.newMessage || this.newMessage.trim() === '';
    }

    /**
     * Gets the current user's name from the UI
     * This is a fallback in case USER_ID matching doesn't work
     */
    getCurrentUserName() {
        // In the UI, current user is likely "Shahzeb Khan" based on screenshot
        // But this is a simplification - in a real app, we'd use a better approach
        return 'Shahzeb Khan';
    }
    
    /**
     * Load messages for the current conversation
     */
    loadMessages(isInitialLoad = false) {
        // Validate conversation ID - should be a valid Salesforce ID
        if (!this.conversationId) {
            console.error('Cannot load messages: No conversation ID available');
            this.isLoading = false;
            return;
        }
        
        // Basic Salesforce ID validation (should be 15 or 18 chars)
        if (typeof this.conversationId !== 'string' || 
            (this.conversationId.length !== 15 && this.conversationId.length !== 18)) {
            console.error(`Invalid conversation ID format: ${this.conversationId}`);
            this.isLoading = false;
            return;
        }
        
        if (isInitialLoad) {
            this.isLoading = true;
            this.messages = [];
            this.messageOffset = 0;
            this.allMessagesLoaded = false;
        } else {
            this.loadingMoreMessages = true;
        }
        
        // Get current user name for matching
        const currentUserName = this.getCurrentUserName();
        
        console.log(`Loading messages for conversation ${this.conversationId}, offset=${this.messageOffset}`);
        console.log('Current USER_ID:', USER_ID);
        console.log('Current user name:', currentUserName);
        
        // Use getMessages, not getMessagesByConversationId (which seems to be incorrect)
        getMessages({
            conversationId: this.conversationId,
            offset: this.messageOffset,
            limitNum: 20,
            newerThan: null // Set to null for regular loading (not checking for new)
        })
        .then(result => {
            console.log('Message loading result:', JSON.stringify(result));
            
            if (result && result.messages) {
                if (result.messages.length === 0) {
                    this.allMessagesLoaded = true;
                } else {
                    // Log the first message to check sender details
                    if (result.messages.length > 0) {
                        const sampleMsg = result.messages[0];
                        console.log('Sample message details:', {
                            senderId: sampleMsg.senderId,
                            senderName: sampleMsg.senderName,
                            isCurrentUser: sampleMsg.senderId === USER_ID
                        });
                    }
                    
                    // Format messages for display
                    const formattedMessages = result.messages.map(msg => {
                        // Check if message is from current user by ID ONLY, not name
                        const isFromUser = msg.senderId === USER_ID;
                        
                        console.log(`Message from ${msg.senderName} (${msg.senderId}), isFromUser: ${isFromUser}`);
                        
                        return {
                            id: msg.id,
                            content: msg.content,
                            formattedContent: this.formatMessageContent(msg.content),
                            timestamp: new Date(msg.timestamp),
                            formattedTimestamp: this.formatTimestamp(msg.timestamp),
                            senderId: msg.senderId,
                            senderName: msg.senderName,
                            senderPhotoUrl: msg.senderPhotoUrl,
                            isFromUser: isFromUser,
                            messageClass: isFromUser ? 'message user-message' : 'message recipient-message'
                        };
                    });
                    
                    // Append or prepend based on load direction
                    if (isInitialLoad) {
                        this.messages = formattedMessages;
                    } else {
                        this.messages = [...formattedMessages, ...this.messages]; // Older messages at the top
                    }
                    
                    this.messageOffset += result.messages.length;
                }
            
            // Mark messages as read
                if (isInitialLoad && result.messages.length > 0) {
                this.markMessagesAsRead();
            }
            
                // Scroll to bottom on initial load
                if (isInitialLoad) {
                    this.scrollToBottom();
                }
                
                // Update hasMore flag
                this.hasMoreMessages = result.hasMore;
            }
        })
        .catch(error => {
            console.error('Error in loadMessages:', error);
            this.handleError(error, 'Error loading messages');
        })
        .finally(() => {
                this.isLoading = false;
                this.loadingMoreMessages = false;
        });
    }

    /**
     * Check for new messages in the current conversation
     * Loads and displays any new messages that have arrived
     */
    checkForNewMessages() {
        // Skip if we're already loading or have no conversation
        if (this.isLoadingNewMessages || !this.hasInitialized || !this.selectedRecipient || !this.conversationId) {
            return;
        }

        this.isLoadingNewMessages = true;
        const newestTimestamp = this.getNewestMessageTimestamp();
        
        console.log(`Checking for new messages since ${newestTimestamp} in conversation ${this.conversationId}`);

        getMessages({ 
            conversationId: this.conversationId,
            offset: 0, 
            limitNum: 50, // Fetch a decent batch in case many arrived
            newerThan: newestTimestamp // Only get messages newer than our latest
        })
        .then(result => {
            const newMessages = result.messages;
            if (newMessages && newMessages.length > 0) {
                console.log(`Received ${newMessages.length} new messages`);
                
                // Get current user name for matching
                const currentUserName = this.getCurrentUserName();
                
                // Format the new messages
                const formattedNewMessages = newMessages.map(msg => {
                    // Check if message is from current user by ID ONLY, not name
                    const isFromUser = msg.senderId === USER_ID;
                    
                    console.log(`New message from ${msg.senderName} (${msg.senderId}), isFromUser: ${isFromUser}`);
                    
                    return {
                        id: msg.id,
                        content: msg.content,
                        formattedContent: this.formatMessageContent(msg.content),
                        timestamp: new Date(msg.timestamp),
                        formattedTimestamp: this.formatTimestamp(msg.timestamp),
                        senderId: msg.senderId,
                        senderName: msg.senderName,
                        senderPhotoUrl: msg.senderPhotoUrl,
                        isFromUser: isFromUser,
                        messageClass: isFromUser ? 'message user-message' : 'message recipient-message'
                    };
                });

                // Add new messages to the existing list
                this.messages = [...this.messages, ...formattedNewMessages];

                // Only show notification/sound if message is not from current user
                const incomingMessages = formattedNewMessages.filter(msg => !msg.isFromUser);
                if (incomingMessages.length > 0) {
                    // Show notification for the first incoming message
                    this.showBrowserNotification(`New message from ${incomingMessages[0].senderName}`);
                    
                    // Play sound for notification
                    this.playNotificationSound();
                    
                    // Mark as read if we're currently viewing this conversation
                    this.markMessagesAsRead();
                }

                // Scroll to the bottom to show new messages
                    this.scrollToBottom();
            }
        })
        .catch(error => {
            console.error('Error checking for new messages:', error);
        })
        .finally(() => {
            this.isLoadingNewMessages = false;
        });
    }

    /**
     * Gets the timestamp of the newest message in the current conversation
     * Used for checking for newer messages
     */
    getNewestMessageTimestamp() {
        if (!this.messages || this.messages.length === 0) {
            return null;
        }
        
        // Find the newest message timestamp
        const newest = this.messages.reduce((latest, msg) => {
            const msgDate = new Date(msg.timestamp);
            return msgDate > latest ? msgDate : latest;
        }, new Date(0));
        
        return newest.toISOString();
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

    /**
     * Mark current conversation messages as read
     * Updates read timestamp in Salesforce and local UI state
     */
    markMessagesAsRead() {
        if (!this.selectedRecipient) return;
        
        // Must have a conversation ID
        if (!this.conversationId) {
            console.warn('markMessagesAsRead called without conversationId');
            return;
        }

        console.log(`Marking conversation ${this.conversationId} as read`);
        markAsRead({ conversationId: this.conversationId })
            .then(() => {
                console.log('Successfully marked conversation as read');
                
                // Update local unread count and UI immediately for responsiveness
                this.unreadCount = 0; 
                
                // Update recent list if it exists
                if (this.recentConversations) {
                const recentIndex = this.recentConversations.findIndex(c => c.id === this.conversationId);
                if (recentIndex !== -1) {
                    this.recentConversations[recentIndex].hasUnread = false;
                    this.recentConversations[recentIndex].unreadCount = 0;
                        
                        // Trigger reactivity
                    this.recentConversations = [...this.recentConversations]; 
                }
                }
            })
            .catch(error => {
                // Log error but don't show to user since this is a background operation
                 console.error('Error marking messages as read:', error);
            });
    }

    // Handle message input change
    handleMessageChange(event) {
        this.newMessage = event.target.value;
        // Set isComposing based on whether there's text in the field
        this.isComposing = (this.newMessage && this.newMessage.trim() !== '');
        // Adjust height with a slight delay to allow for pasting
        setTimeout(() => {
            this.autoAdjustTextareaHeight(event.target);
        }, 0);
    }

    // Handle key press in message input
    handleKeyDown(event) {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            this.sendNewMessage();
        } else {
            // Auto adjust height after a small delay to account for pasted content
            setTimeout(() => {
                this.autoAdjustTextareaHeight(event.target);
            }, 10);
        }
    }

    /**
     * Sends a new message to the current recipient
     * Supports sending to Users, Contacts, Person Accounts, and Groups
     */
    sendNewMessage() {
        if (!this.selectedRecipient || !this.newMessage.trim()) {
            return;
        }
        
        this.isLoading = true;
        
        // Store message value before it's cleared
        const messageContent = this.newMessage.trim();
        
        // Clear input immediately for better UX
        this.newMessage = '';
        this.isComposing = false;
        
        // Different logic based on recipient type
        let recipientId = this.selectedRecipient.id;
        let recipientType = this.selectedRecipient.objectType;
        
        // If we already have a conversation ID, use that
        if (this.conversationId) {
            recipientId = this.conversationId;
            recipientType = 'Conversation';
        }
        
        // Call Apex to send message
        sendMessage({
            recipientId: recipientId,
            recipientType: recipientType,
            content: messageContent
        })
        .then(result => {
            // If we didn't have a conversation ID before, set it now
            if (!this.conversationId) {
                this.conversationId = result.conversationId;
            }
            
            // Check if we need to add the message to the local list
            // (avoiding duplication with real-time updates)
            const isNewMessage = !this.messages.some(msg => msg.id === result.messageId);
            
            if (isNewMessage) {
                // Add the message to our local array - at the end (bottom)
                const newMessage = {
                    id: result.messageId,
                    content: messageContent,
                    isFromUser: true,
                    messageClass: 'message user-message',
                    timestamp: new Date(),
                    formattedTimestamp: this.formatTimestamp(new Date()),
                    formattedContent: this.formatMessageContent(messageContent),
                    senderName: this.getCurrentUserName(), // Add sender name for consistency
                    senderPhotoUrl: result.userPhotoUrl
                };
                
                // Append to the end, not prepend to the beginning
                this.messages = [...this.messages, newMessage];
                
                // Update recent conversations to reflect this conversation
                this.updateRecentConversations({
                    id: this.conversationId,
                    name: this.selectedRecipient.name,
                    objectType: this.selectedRecipient.objectType,
                    title: this.selectedRecipient.title,
                    photoUrl: this.selectedRecipient.photoUrl,
                    isGroupChat: this.selectedRecipient.isGroupChat
                });
                
                // Scroll to bottom
                this.scrollToBottom();
            }
        })
        .catch(error => {
            // Restore the message if sending failed
            this.newMessage = messageContent;
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

    /**
     * Scrolls the message container to the bottom to show the latest messages
     */
    scrollToBottom() {
        try {
            // Use setTimeout with a small delay to ensure the DOM is updated
        setTimeout(() => {
                const container = this.template.querySelector('.message-container');
                if (container) {
                    console.log('Scrolling to bottom, height:', container.scrollHeight);
                    // Force scroll to very bottom
                    container.scrollTop = container.scrollHeight + 1000;
                    
                    // Double-check scroll after a bit more time to ensure it worked
                    // (sometimes DOM updates can happen after the first scroll)
                    setTimeout(() => {
                        if (container.scrollTop < container.scrollHeight - container.clientHeight) {
                            container.scrollTop = container.scrollHeight + 1000;
                        }
                    }, 100);
                } else {
                    console.warn('Message container not found for scrolling');
                }
            }, 50);
        } catch (error) {
            console.error('Error scrolling to bottom:', error);
        }
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
        this.isMobileView = window.innerWidth < 768;

        // When switching to desktop view, reset mobile sidebar
        if (!this.isMobileView) {
                this.isSidebarVisibleMobile = false;
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
                console.log('Raw recent conversations data:', JSON.stringify(results));
                
                // Process results: ensure all required properties exist and format properly
                this.recentConversations = results.map(convo => {
                    // Ensure we have all required properties with fallbacks
                    return {
                        id: convo.id || '',
                        name: convo.name || 'Unknown',
                        photoUrl: convo.photoUrl || this.getPlaceholderImage(convo.name || 'Unknown'),
                        title: convo.title || '',
                        objectType: convo.objectType || 'User',
                        isGroupChat: Boolean(convo.isGroupChat),
                        lastMessageSnippet: convo.lastMessageSnippet || 'No messages',
                        hasUnread: Boolean(convo.hasUnread),
                        unreadCount: typeof convo.unreadCount === 'number' ? convo.unreadCount : 0,
                        timestamp: convo.lastMessageTimestamp || new Date().toISOString()
                    };
                });
                
                console.log('Processed recent conversations:', JSON.stringify(this.recentConversations));
            })
            .catch(error => {
                console.error('Error in loadRecentConversations:', error);
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
     * Reset conversation state when selecting a new recipient
     * Note: This does NOT reset UI state flags (showMessagesPanel, showRecentPanel)
     * and does NOT clear selectedRecipient or conversationId - those should be set by the caller
     */
    resetConversationState() {
        // Log current state before reset
        console.log('Resetting conversation state, current UI flags:', {
            showMessagesPanel: this.showMessagesPanel,
            showRecentPanel: this.showRecentPanel,
            hasSelectedRecipient: !!this.selectedRecipient,
            conversationId: this.conversationId
        });

        // Reset message-related state only - NOT conversation identifiers
        this.messages = [];
        this.newMessage = '';
        this.messageOffset = 0;
        this.isLoading = false;
        this.loadingMoreMessages = false;
        this.allMessagesLoaded = false;
        this.hasError = false;
        this.errorMessage = '';
        this.isComposing = false;
        this.showChatSummary = false;
        this.chatSummary = '';
        this.isSummarizingChat = false;
        
        // Stop message refresh when changing conversations
        if (this.refreshIntervalId) {
            this.stopMessageRefresh();
        }
        
        // DO NOT reset these critical properties - they should be managed
        // by the calling method:
        // this.selectedRecipient = null;
        // this.conversationId = null;
        // this.showMessagesPanel = false;
        // this.showRecentPanel = true;
        
        // Log state after reset
        console.log('Conversation state reset complete, preserving IDs:', {
            showMessagesPanel: this.showMessagesPanel,
            showRecentPanel: this.showRecentPanel,
            selectedRecipient: this.selectedRecipient ? this.selectedRecipient.name : null,
            conversationId: this.conversationId
        });
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
     */
    formatMessageContent(content) {
        if (!content) return '';
        
        // Convert URLs to clickable links
        content = content.replace(
            /(https?:\/\/[^\s]+)/g, 
            '<a href="$1" target="_blank" rel="noopener">$1</a>'
        );
        
        // Convert line breaks to <br>
        content = content.replace(/\n/g, '<br>');
        
        // Escape HTML except for our allowed tags
        const div = document.createElement('div');
        div.textContent = content;
        content = div.innerHTML;
        
        // Restore the links we created
        content = content.replace(/&lt;a href="(.*?)" target="_blank" rel="noopener"&gt;(.*?)&lt;\/a&gt;/g, 
                               '<a href="$1" target="_blank" rel="noopener">$2</a>');
        
        // Replace emoji shortcodes with actual emojis
        const emojiMap = {
            ':)': '😊',
            ':D': '😃',
            ':(': '😔',
            ':P': '😛',
            ';)': '😉',
            '<3': '❤️',
            ':+1:': '👍',
            ':-1:': '👎'
        };
        
        Object.keys(emojiMap).forEach(code => {
            content = content.replace(new RegExp(code.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1'), 'g'), emojiMap[code]);
        });
        
        return content;
    }

    /**
     * Shows the group creation modal to start a new group conversation
     */
    handleNewGroupChat() {
        this.showGroupCreationModal = true;
        this.isCreatingGroup = true;
        this.newGroupName = '';
        this.newGroupDescription = '';
        this.selectedGroupParticipants = [];
        this.showGroupParticipantResults = false;
        
        // Send analytics event - group creation started
        this.fireAnalyticsEvent('group_creation_started');
    }
    
    /**
     * Handles closing the group creation modal
     */
    handleCloseGroupModal() {
        this.showGroupCreationModal = false;
        this.isCreatingGroup = false;
        this.groupParticipantResults = [];
    }
    
    /**
     * Handles group name change in the modal
     */
    handleGroupNameChange(event) {
        this.newGroupName = event.target.value;
    }
    
    /**
     * Handles group description change in the modal
     */
    handleGroupDescriptionChange(event) {
        this.newGroupDescription = event.target.value;
    }
    
    /**
     * Handles search for group participants
     */
    handleGroupParticipantSearch(event) {
        const searchTerm = event.target.value;
        
        if (this.searchTimeoutId) {
            clearTimeout(this.searchTimeoutId);
        }
        
        // If search term is empty, hide results
        if (!searchTerm || searchTerm.length < 2) {
            this.showGroupParticipantResults = false;
            return;
        }
        
        // Debounce the search to avoid excessive server calls
        this.searchTimeoutId = setTimeout(() => {
            this.searchGroupParticipants(searchTerm);
        }, 300);
    }
    
    /**
     * Search for potential group participants across different object types
     */
    searchGroupParticipants(searchTerm) {
        this.searchingGroupParticipants = true;
        this.showGroupParticipantResults = true;
        
        searchRecipients({ 
            searchTerm: searchTerm,
            objectTypes: this.selectedObjectTypes
        })
        .then(results => {
            // Filter out already selected participants
            this.groupParticipantResults = results.filter(result => 
                !this.selectedGroupParticipants.some(selected => 
                    selected.id === result.id && selected.objectType === result.objectType
                )
            );
            this.searchingGroupParticipants = false;
        })
        .catch(error => {
            this.handleError(error, 'Error searching for participants');
            this.searchingGroupParticipants = false;
        });
    }
    
    /**
     * Handle selection of a participant for the group
     */
    handleAddGroupParticipant(event) {
        const id = event.currentTarget.dataset.id;
        const type = event.currentTarget.dataset.type;
        
        // Find the participant in the results
        const participant = this.groupParticipantResults.find(
            r => r.id === id && r.objectType === type
        );
        
        if (participant) {
            // Add to selected participants
            this.selectedGroupParticipants = [
                ...this.selectedGroupParticipants,
                participant
            ];
            
            // Remove from results to avoid duplication
            this.groupParticipantResults = this.groupParticipantResults.filter(
                r => !(r.id === id && r.objectType === type)
            );
        }
    }
    
    /**
     * Remove a participant from the group creation selection
     */
    handleRemoveGroupParticipant(event) {
        const id = event.currentTarget.dataset.id;
        const type = event.currentTarget.dataset.type;
        
        // Find the participant in the selected list
        const participant = this.selectedGroupParticipants.find(
            p => p.id === id && p.objectType === type
        );
        
        // Remove from selected participants
        this.selectedGroupParticipants = this.selectedGroupParticipants.filter(
            p => !(p.id === id && p.objectType === type)
        );
    }
    
    /**
     * Create a new group conversation with the selected participants
     */
    createGroupConversation() {
        // Validation
        if (!this.newGroupName) {
            this.showToast('Error', 'Please enter a group name', 'error');
            return;
        }
        
        if (this.selectedGroupParticipants.length < 1) {
            this.showToast('Error', 'Please add at least one participant', 'error');
            return;
        }
        
        this.isLoading = true;
        
        // Prepare participants data structure
        const participants = this.selectedGroupParticipants.map(p => ({
            id: p.id,
            objectType: p.objectType
        }));
        
        // Call Apex to create the group
        createGroupConversation({
            groupName: this.newGroupName,
            groupDescription: this.newGroupDescription,
            participants: participants
        })
        .then(conversationId => {
            // Close modal
            this.handleCloseGroupModal();
            
            // Set as current conversation
            this.conversationId = conversationId;
            this.selectedRecipient = {
                id: conversationId,
                name: this.newGroupName,
                objectType: 'Conversation',
                isGroupChat: true
            };
            
            // Load messages
            this.loadMessages(true);
            
            // Refresh recent conversations
            this.loadRecentConversations();
            
            // Show success message
            this.showToast('Success', 'Group conversation created', 'success');
            
            // Analytics event
            this.fireAnalyticsEvent('group_created', {
                num_participants: participants.length
            });
        })
        .catch(error => {
            this.handleError(error, 'Error creating group conversation');
        })
        .finally(() => {
            this.isLoading = false;
        });
    }
    
    /**
     * Toggle selection of an object type for participant search
     */
    handleObjectTypeToggle(event) {
        const type = event.currentTarget.dataset.type;
        
        if (this.selectedObjectTypes.includes(type)) {
            // Remove if already selected
            this.selectedObjectTypes = this.selectedObjectTypes.filter(t => t !== type);
        } else {
            // Add if not selected
            this.selectedObjectTypes = [...this.selectedObjectTypes, type];
        }
    }
    
    /**
     * Fire an analytics event for tracking user interactions
     */
    fireAnalyticsEvent(eventName, params = {}) {
        // Using Lightning Interaction API if available
        if (this.pageRef) {
            const analyticsInteraction = {
                pageEntityId: this.pageRef.attributes.recordId || 'home_page',
                pageContext: {
                    entityName: 'Messaging',
                    entityId: this.conversationId || 'no_conversation'
                }
            };
            
            // Add any additional parameters
            Object.keys(params).forEach(key => {
                analyticsInteraction[key] = params[key];
            });
            
            // Fire the event
            this.dispatchEvent(new CustomEvent('lightning__interactionanalytics', {
                bubbles: true,
                composed: true,
                detail: {
                    eventName: eventName,
                    eventData: analyticsInteraction
                }
            }));
        }
    }
    
    /**
     * Show a toast notification message
     */
    showToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({
                title,
                message,
                variant
            })
        );
    }

    /**
     * Determine if an object type is selected
     * This properly handles LWC data binding for HTML attributes
     */
    isObjectTypeSelected(type) {
        return this.selectedObjectTypes.includes(type);
    }
    
    /**
     * Get the CSS class for an object type filter
     */
    get userTypeClass() {
        return `type-filter ${this.isObjectTypeSelected('User') ? 'selected' : ''}`;
    }
    
    get contactTypeClass() {
        return `type-filter ${this.isObjectTypeSelected('Contact') ? 'selected' : ''}`;
    }
    
    get accountTypeClass() {
        return `type-filter ${this.isObjectTypeSelected('Account') ? 'selected' : ''}`;
    }
    
    get groupTypeClass() {
        return `type-filter ${this.isObjectTypeSelected('Group') ? 'selected' : ''}`;
    }

    /**
     * Shows group information in a modal
     */
    showGroupInfo() {
        if (!this.selectedRecipient || !this.selectedRecipient.isGroupChat) {
            return;
        }
        
        // Show loading state while we fetch detailed information
        this.isLoading = true;
        
        // Get group information from the server
        getGroupConversationInfo({ conversationId: this.conversationId })
            .then(result => {
                // Store group info for display
                this.groupInfo = result;
                this.showGroupInfoModal = true;
            })
            .catch(error => {
                this.handleError(error, 'Failed to load group information');
            })
            .finally(() => {
                this.isLoading = false;
            });
    }
    
    /**
     * Closes the group info modal
     */
    handleCloseGroupInfoModal() {
        this.showGroupInfoModal = false;
    }

    /**
     * Returns the appropriate icon name for each object type
     * @param {String} type - The object type (User, Contact, etc.)
     * @return {String} - The SLDS icon name
     */
    getIconForObjectType(type) {
        switch(type) {
            case 'User': return 'standard:user';
            case 'Contact': return 'standard:contact';
            case 'Account': return 'standard:account';
            case 'Group': return 'standard:groups';
            default: return 'standard:default';
        }
    }

    // Toggle mobile sidebar visibility
    toggleMobileSidebar() {
        console.log('Toggling mobile sidebar visibility');
        this.isMobileSidebarVisible = !this.isMobileSidebarVisible;
        
        // Find the sidebar element and toggle the class
        const sidebarElement = this.template.querySelector('.sidebar');
        if (sidebarElement) {
            if (this.isMobileSidebarVisible) {
                sidebarElement.classList.add('mobile-visible');
            } else {
                sidebarElement.classList.remove('mobile-visible');
            }
        }
    }

    // Handle click outside to close mobile sidebar
    handleMessagesClick() {
        // If we're in mobile view and sidebar is open, close it
        if (this.isMobileView && this.isMobileSidebarVisible) {
            this.isMobileSidebarVisible = false;
            const sidebarElement = this.template.querySelector('.sidebar');
            if (sidebarElement) {
                sidebarElement.classList.remove('mobile-visible');
            }
        }
    }

    // Compute sidebar classes
    get sidebarClasses() {
        let classes = 'sidebar';
        if (this.isMobileSidebarVisible) {
            classes += ' mobile-visible';
        }
        return classes;
    }

    // Auto adjust textarea height based on content
    autoAdjustTextareaHeight(textarea) {
        if (!textarea) return;
        
        console.log('Auto-adjusting textarea height');
        
        // Reset the height temporarily to get the correct scrollHeight
        textarea.style.height = 'auto';
        
        // Get the textarea's scroll height
        const scrollHeight = textarea.scrollHeight;
        
        // Set maximum height (match CSS)
        const maxHeight = 280; // Increased to match CSS
        
        // Apply height, allowing it to grow up to max height
        const newHeight = Math.min(scrollHeight, maxHeight);
        textarea.style.height = newHeight + 'px';
        
        // Adjust the container height accordingly
        this.expandContainers(newHeight);
    }

    // Expand all related containers when textarea grows
    expandContainers(textareaHeight) {
        const baseHeight = 40; // Base height of textarea
        const extraExpansion = textareaHeight - baseHeight; // Calculate how much we need to expand
        // Multiply expansion factor to make it more aggressive
        const expansionFactor = extraExpansion * 1.5;
        
        // Get all relevant containers
        const inputContainer = this.template.querySelector('.message-input-container');
        const messageBody = this.template.querySelector('.messaging-body');
        const messagingContainer = this.template.querySelector('.nuvitek-messaging-container');
        
        if (inputContainer) {
            // Add padding for the container with extra room
            const paddingHeight = 30; // Increased padding
            const containerHeight = textareaHeight + paddingHeight;
            inputContainer.style.height = containerHeight + 'px';
            
            // Force component redraw to prevent layout issues
            this.refreshUICounter++;
            
            // Force component to recalculate layout with a slight delay
            window.setTimeout(() => {
                if (messageBody) {
                    // Ensure messaging body expands significantly more
                    const currentHeight = parseInt(getComputedStyle(messageBody).height, 10) || 400;
                    const newHeight = currentHeight + expansionFactor;
                    
                    messageBody.style.minHeight = `${newHeight}px`;
                    messageBody.style.height = 'auto';
                    
                    // Force direct style to ensure expansion
                    messageBody.style.setProperty('min-height', `${newHeight}px`, 'important');
                    messageBody.style.setProperty('height', 'auto', 'important');
                }
                
                // Expand the main container
                if (messagingContainer) {
                    const currentHeight = parseInt(getComputedStyle(messagingContainer).height, 10) || 400;
                    const newContainerHeight = currentHeight + expansionFactor;
                    
                    messagingContainer.style.height = 'auto';
                    messagingContainer.style.minHeight = `${newContainerHeight}px`;
                    messagingContainer.style.setProperty('min-height', `${newContainerHeight}px`, 'important');
                }
                
                // Find and expand Lightning card elements
                this.expandLightningCardElements(expansionFactor);
                
                // Scroll message container to bottom
                this.scrollToBottom();
            }, 10);
        }
    }

    // Target and expand Lightning card components
    expandLightningCardElements(expansionFactor) {
        // Find main Lightning container elements
        const container = this.template.querySelector('.nuvitek-messaging-container');
        if (!container) return;
        
        try {
            // Find card and body elements - have to use DOM traversal since they're in the shadow DOM
            const cardElement = container.querySelector('lightning-card');
            
            if (cardElement) {
                // Get current height to expand from
                const currentCardHeight = cardElement.offsetHeight || 400;
                const newCardHeight = currentCardHeight + expansionFactor;
                
                // Set minimum height directly on card element
                cardElement.style.minHeight = `${newCardHeight}px`;
                cardElement.style.height = 'auto';
                cardElement.style.overflow = 'visible';
                cardElement.style.setProperty('min-height', `${newCardHeight}px`, 'important');
                
                // Access shadow DOM if possible
                const cardRoot = cardElement.shadowRoot || cardElement;
                
                if (cardRoot) {
                    const cardBody = cardRoot.querySelector('.slds-card__body');
                    if (cardBody) {
                        // Apply more aggressive styling
                        cardBody.style.height = 'auto';
                        cardBody.style.minHeight = `${newCardHeight}px`;
                        cardBody.style.overflow = 'visible';
                        // Force with !important
                        cardBody.style.setProperty('height', 'auto', 'important');
                        cardBody.style.setProperty('min-height', `${newCardHeight}px`, 'important');
                        cardBody.style.setProperty('overflow', 'visible', 'important');
                    }
                    
                    const card = cardRoot.querySelector('.slds-card');
                    if (card) {
                        // Apply more aggressive styling
                        card.style.height = 'auto';
                        card.style.minHeight = `${newCardHeight}px`;
                        card.style.overflow = 'visible';
                        // Force with !important
                        card.style.setProperty('height', 'auto', 'important');
                        card.style.setProperty('min-height', `${newCardHeight}px`, 'important');
                        card.style.setProperty('overflow', 'visible', 'important');
                    }
                }
            }
            
            // Force parent containers to expand (for good measure)
            let parentNode = this.template.host;
            for (let i = 0; i < 5 && parentNode; i++) { // Limit to 5 levels up
                if (parentNode.style) {
                    parentNode.style.height = 'auto';
                    parentNode.style.minHeight = `${400 + expansionFactor}px`;
                    parentNode.style.overflow = 'visible';
                    // Force with !important
                    parentNode.style.setProperty('height', 'auto', 'important');
                    parentNode.style.setProperty('min-height', `${400 + expansionFactor}px`, 'important');
                    parentNode.style.setProperty('overflow', 'visible', 'important');
                }
                parentNode = parentNode.parentNode;
            }
        } catch (error) {
            console.error('Error expanding Lightning card:', error);
        }
    }
}