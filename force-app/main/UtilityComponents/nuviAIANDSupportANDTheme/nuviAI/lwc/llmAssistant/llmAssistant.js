import { LightningElement, api, wire, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { getRecordNotifyChange } from 'lightning/uiRecordApi';
import getLLMConfigurations from '@salesforce/apex/LLMController.getLLMConfigurations';
import handleRequest from '@salesforce/apex/LLMController.handleRequest';
import checkRecordForAnomalies from '@salesforce/apex/LLMController.checkRecordForAnomalies';
import saveAnalysisToField from '@salesforce/apex/LLMController.saveAnalysisToField';
import processImagesWithAI from '@salesforce/apex/LLMController.processImagesWithAI';
import { getRecord } from 'lightning/uiRecordApi';
import { getObjectInfo } from 'lightning/uiObjectInfoApi';
import ID_FIELD from '@salesforce/schema/Account.Id';
import { CurrentPageReference } from 'lightning/navigation';

// Constants
const MAX_HISTORY_MESSAGES = 50; // Maximum number of messages to keep in history

export default class LLMAssistant extends LightningElement {
    @api recordId;
    @wire(CurrentPageReference) pageRef;
    
    // Design attributes for configuration from targetConfig
    @api primaryColor = '#22BDC1';  // Default Nuvitek teal
    @api accentColor = '#D5DF23';   // Default Nuvitek lime
    @api defaultModelName;          // If provided, this model will be preselected
    @api hideModelSelector = false; // Whether to hide the model selector
    @api cardTitle = 'AI Assistant'; // Configurable title
    @api contextPrompt = '';       // Custom context to provide to the LLM about its purpose/placement
    @api enableAnomalyDetection = false; // Whether to enable anomaly detection
    @api enableImageValidation = false; // Kept for backward compatibility/external dependencies
    @api relatedObjects = '';      // Comma-separated list of object API names to search across for related data
    @api analysisFieldApiName = ''; // API name of field to save analysis summary
    
    @track llmOptions = [];
    @track selectedLLM;
    @track selectedLLMLabel;
    @track userPrompt = '';
    @track response;
    @track isLoading = false;
    @track hasError = false;
    @track errorMessage = '';
    @track pageComponents = [];
    @track pageComponentsScanned = false;
    @track conversationHistory = []; // Track conversation history
    @track showConversationHistory = false; // Default to hiding history
    @track conversationSummary = ''; // Track conversation summary
    @track messagesTotalCount = 0; // Total message count including those pruned due to limits
    
    // New properties for analysis field functionality
    @track objectApiName;
    @track fieldLabel;
    @track showSaveAnalysisModal = false;
    @track currentAnalysis = '';
    @track analysisSummary = '';
    @track analysisSummaryCharCount = 0;
    
    // --- New properties for Anomaly Check ---
    @track anomalyCheckResult = ''; // Store the full result text from the AI
    @track anomalyCheckLoading = false; // Track if the initial anomaly check is running
    @track showAnomalyBanner = false; // Flag to control banner visibility
    @track anomalyBannerMessage = ''; // Message to display in the banner
    // --- End Anomaly Check properties ---
    
    // --- Accordion Control ---
    @track activeAccordionSections = []; // Keep track of open sections
    // --- End Accordion Control ---
    
    // Cache for memoized functions
    colorCache = new Map();
    styleCache = null;
    lastPrimaryColor = null;
    lastAccentColor = null;

    // Computed properties for text colors based on background brightness
    get primaryTextColor() {
        return this.getContrastColor(this.primaryColor);
    }
    
    get accentTextColor() {
        return this.getContrastColor(this.accentColor);
    }
    
    get userChatBubbleColor() {
        return this.adjustColor(this.primaryColor, 40); // Lighter version of primary
    }
    
    get userChatTextColor() {
        return this.getContrastColor(this.userChatBubbleColor);
    }
    
    get aiChatBubbleColor() {
        return "#f3f4f6"; // Light gray for AI bubbles
    }
    
    get aiChatTextColor() {
        return "#1d1d1f"; // Dark text for light backgrounds
    }

    // Check if "Analyze Record" button should be shown
    get showAnalyzeButton() {
        return !!this.recordId;
    }
    
    // Check if "Analyze Images" button should be shown
    get showImageAnalysisButton() {
        return !!this.recordId && this.enableImageValidation;
    }
    
    // Check if related objects are configured
    get hasRelatedObjects() {
        return !!this.relatedObjects && this.relatedObjects.trim() !== '';
    }

    // Dynamically set CSS variables based on configured colors
    get componentStyle() {
        // Use cached style if colors haven't changed
        if (this.styleCache && this.lastPrimaryColor === this.primaryColor && 
            this.lastAccentColor === this.accentColor) {
            return this.styleCache;
        }
        
        // Extract RGB values for rgba() usage
        const primaryRGB = this.hexToRgb(this.primaryColor);
        const accentRGB = this.hexToRgb(this.accentColor);
        
        // Get contrast text colors
        const primaryTextColor = this.primaryTextColor;
        const accentTextColor = this.accentTextColor;
        const userChatTextColor = this.userChatTextColor;

        // Create the style string
        this.styleCache = `--primary-color: ${this.primaryColor}; 
                --primary-dark: ${this.adjustColor(this.primaryColor, -20)}; 
                --primary-light: ${this.adjustColor(this.primaryColor, 20)};
                --primary-color-rgb: ${primaryRGB};
                --primary-text-color: ${primaryTextColor};
                --accent-color: ${this.accentColor};
                --accent-dark: ${this.adjustColor(this.accentColor, -20)};
                --accent-light: ${this.adjustColor(this.accentColor, 20)};
                --accent-color-rgb: ${accentRGB};
                --accent-text-color: ${accentTextColor};
                --chat-bubble-user: ${this.userChatBubbleColor};
                --chat-bubble-ai: ${this.aiChatBubbleColor};
                --chat-text-user: ${userChatTextColor};
                --chat-text-ai: ${this.aiChatTextColor};
                --model-badge-color: ${this.primaryColor};
                --model-badge-text-color: ${primaryTextColor};`;
        
        // Update cache tracking variables
        this.lastPrimaryColor = this.primaryColor;
        this.lastAccentColor = this.accentColor;
        
        return this.styleCache;
    }
    
    // Get contrast color (black or white) based on background brightness
    getContrastColor(hexColor) {
        // Default to black if no color provided
        if (!hexColor || !hexColor.startsWith('#')) return '#000000';
        
        // Check cache first
        const cacheKey = `contrast_${hexColor}`;
        if (this.colorCache.has(cacheKey)) {
            return this.colorCache.get(cacheKey);
        }
        
        // Parse hex color efficiently
        const r = parseInt(hexColor.slice(1, 3), 16);
        const g = parseInt(hexColor.slice(3, 5), 16);
        const b = parseInt(hexColor.slice(5, 7), 16);
        
        // Calculate luminance using the perceived brightness formula
        // (Weighted average for human perception: R:0.299, G:0.587, B:0.114)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        
        // Use white text for dark backgrounds, black text for light backgrounds
        const result = luminance > 0.5 ? '#000000' : '#FFFFFF';
        
        // Cache the result
        this.colorCache.set(cacheKey, result);
        return result;
    }
    
    // Control visibility of model selector
    get showModelSelector() {
        return !this.hideModelSelector && this.llmOptions.length > 0;
    }
    
    // Getters for toggle button
    get toggleIconName() {
        return this.showConversationHistory ? 'utility:chevronup' : 'utility:chevrondown';
    }
    
    get toggleAlternativeText() {
        return this.showConversationHistory ? 'Hide conversation' : 'Show conversation';
    }
    
    get toggleTitle() {
        return this.showConversationHistory ? 'Hide conversation' : 'Show conversation';
    }

    // Getter for history limit message
    get historyLimitMessage() {
        if (this.messagesTotalCount > MAX_HISTORY_MESSAGES) {
            const hiddenMessages = this.messagesTotalCount - MAX_HISTORY_MESSAGES;
            return `Showing ${MAX_HISTORY_MESSAGES} of ${this.messagesTotalCount} messages (${hiddenMessages} older messages not shown)`;
        }
        return `Showing all ${this.messagesTotalCount} messages`;
    }
    
    // Helper for message class
    getMessageClass(isUser) {
        return isUser ? 'chat-message user-message' : 'chat-message ai-message';
    }
    
    // Helper for formatting message content
    getFormattedMessageContent(content) {
        return content.replace(/\n/g, '<br />');
    }
    
    // Format the conversation summary for display
    get formattedSummary() {
        return this.conversationSummary.replace(/\n/g, '<br />');
    }
    
    // Get formatted timestamp for messages
    getFormattedTimestamp() {
        const now = new Date();
        return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // Format conversation for sending to LLM
    getConversationSummary() {
        if (this.conversationHistory.length === 0) return '';
        
        // If we have a generated summary and more than 10 messages, use it
        if (this.conversationSummary && this.conversationHistory.length > 10) {
            // Get just the recent messages (last 5)
            const recentMessages = this.conversationHistory.slice(-5);
            const recentMessagesSummary = recentMessages.map(msg => {
                const role = msg.isUser ? 'You' : 'AI';
                return `${role}: ${msg.content}`;
            }).join('\n\n');
            
            return `CONVERSATION SUMMARY:\n${this.conversationSummary}\n\nRECENT MESSAGES:\n${recentMessagesSummary}`;
        }
        
        // Otherwise format all messages
        const summary = this.conversationHistory.map(msg => {
            const role = msg.isUser ? 'You' : 'AI';
            return `${role}: ${msg.content}`;
        }).join('\n\n');
        
        return `PREVIOUS CONVERSATION:\n${summary}\n\n`;
    }

    // Clear conversation history
    clearConversation() {
        this.conversationHistory = [];
        this.conversationSummary = '';
        this.messagesTotalCount = 0;
        this.response = '';
        
        // Show feedback
        const clearButton = this.template.querySelector('.clear-button');
        if (clearButton) {
            this.provideFeedback(clearButton, 'Conversation cleared');
        }
    }
    
    // Toggle conversation history visibility
    toggleConversationHistory() {
        this.showConversationHistory = !this.showConversationHistory;
        
        // Set button data attributes for animation
        setTimeout(() => {
            const toggleButton = this.template.querySelector('.toggle-chat-button');
            const container = this.template.querySelector('.conversation-container');
            
            if (toggleButton) {
                toggleButton.setAttribute('data-expanded', this.showConversationHistory ? 'true' : 'false');
            }
            
            if (container) {
                container.setAttribute('data-expanded', this.showConversationHistory ? 'true' : 'false');
            }
        }, 0);
    }

    // Summarize conversation using the LLM
    summarizeConversation() {
        if (this.conversationHistory.length < 10) {
            return; // Only summarize if there are enough messages to warrant it
        }
        
        // Don't summarize if already in progress
        if (this.isSummarizing) return;
        
        this.isSummarizing = true;
        
        // Prepare conversation text for summarization
        const conversationText = this.conversationHistory.map(msg => {
            const role = msg.isUser ? 'You' : 'AI';
            return `${role}: ${msg.content}`;
        }).join('\n\n');
        
        // Create a summarization prompt
        const summaryPrompt = `Please provide a concise summary of the following conversation, capturing key points, questions, and answers:

${conversationText}

SUMMARY:`;
        
        // Call LLM to summarize
        handleRequest({
            recordId: null,
            configName: this.selectedLLM,
            prompt: summaryPrompt,
            operation: 'ask'
        })
        .then(result => {
            this.conversationSummary = result;
        })
        .catch(error => {
            console.error('Error summarizing conversation:', error);
        })
        .finally(() => {
            this.isSummarizing = false;
        });
    }

    // Add a message to conversation history, maintaining the maximum limit
    addMessageToHistory(message) {
        this.messagesTotalCount++;
        
        // Add the new message
        this.conversationHistory.push(message);
        
        // If we exceed the limit, remove oldest messages
        if (this.conversationHistory.length > MAX_HISTORY_MESSAGES) {
            this.conversationHistory = this.conversationHistory.slice(
                this.conversationHistory.length - MAX_HISTORY_MESSAGES
            );
        }
        
        // If we have more than 10 messages and don't have a summary yet,
        // or if we have 10 more messages since the last summary, generate a new one
        if (this.conversationHistory.length >= 10 && 
            (!this.conversationSummary || this.conversationHistory.length % 10 === 0)) {
            this.summarizeConversation();
        }
    }

    // Provide feedback on user actions
    provideFeedback(element, successMessage) {
        // Add ripple effect
        const ripple = document.createElement('span');
        ripple.classList.add('ripple-effect');
        
        // For custom buttons, add ripple as a child
        if (element.classList.contains('custom-button')) {
            element.appendChild(ripple);
            
            // Calculate ripple position
            const rect = element.getBoundingClientRect();
            const size = Math.max(rect.width, rect.height);
            const x = event.clientX - rect.left - size / 2;
            const y = event.clientY - rect.top - size / 2;
            
            ripple.style.width = ripple.style.height = `${size}px`;
            ripple.style.left = `${x}px`;
            ripple.style.top = `${y}px`;
        } else {
            // For lightning components
            element.appendChild(ripple);
        }
        
        // Show brief toast feedback
        this.dispatchEvent(new ShowToastEvent({
            title: 'Success',
            message: successMessage,
            variant: 'success',
            mode: 'dismissable',
            duration: 1000 // Shorter duration for better UX
        }));
        
        // Remove ripple after animation completes
        setTimeout(() => {
            ripple.remove();
        }, 500);
    }

    connectedCallback() {
        console.log('LLM Assistant connected');
        // Preload LLM configurations when connected
        this.loadLLMConfigurations();
        
        // Setup debounced handlers
        this.debouncedPromptChange = this.debounce((event) => {
            this.userPrompt = event.detail.value;
        }, 300); // 300ms debounce

        // If the component is on a record page and has a recordId, get the object API name
        if (this.effectiveRecordId) {
            // The first 3 characters of a Salesforce ID represent the object's key prefix
            this.objectApiName = this.effectiveRecordId.substring(0, 3);
            console.log('Record ID detected:', this.effectiveRecordId);
            console.log('Object API Name key prefix:', this.objectApiName);
        }
    }
    
    renderedCallback() {
        if (!this.pageComponentsScanned && this.recordId) {
            // Use requestAnimationFrame for better timing with UI updates
            requestAnimationFrame(() => {
                this.pageComponents = this.getDOMInformation();
                this.pageComponentsScanned = true;
            });
        } else if (!this.recordId) {
            // Set as scanned if we're not on a record page
            this.pageComponentsScanned = true;
        }
        
        // Try to detect and integrate with Nuvitek theme if available
        this.applyThemeIntegration();
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
                }
            }
        } catch (error) {
            console.error('Error detecting theme:', error);
        }
    }
    
    // Debounce function to limit frequency of calls
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Load LLM configurations once instead of using wire that might re-run
    loadLLMConfigurations() {
        getLLMConfigurations()
            .then(data => {
                if (data && data.length > 0) {
                    // Map configurations to combobox options
                    this.llmOptions = data.map(config => ({
                        label: config.MasterLabel,
                        value: config.DeveloperName,
                        provider: config.Provider__c,
                        supportsFiles: config.Supports_Files__c
                    }));
                    
                    console.log('LLM configuration options loaded:', this.llmOptions.length);
                    
                    // Set default model if specified in design attributes, or use the first model
                    if (this.defaultModelName && this.llmOptions.some(opt => opt.value === this.defaultModelName)) {
                        this.selectedLLM = this.defaultModelName;
                    } else if (this.llmOptions.length > 0) {
                        this.selectedLLM = this.llmOptions[0].value;
                    }
                    
                    // Set the label after selecting the model
                    if (this.selectedLLM) {
                        const selectedOption = this.llmOptions.find(opt => opt.value === this.selectedLLM);
                        this.selectedLLMLabel = selectedOption ? selectedOption.label : 'Unknown Model';
                        
                        // For a record page, perform an initial anomaly check
                        if (this.enableAnomalyDetection && this.effectiveRecordId) {
                            this.performInitialAnomalyCheck();
                        }
                    }
                } else {
                    console.warn('No LLM configurations found');
                }
            })
            .catch(error => {
                console.error('Error loading LLM configurations:', error);
                this.showError(error.body?.message || 'Error fetching LLM configurations');
            });
    }

    handlePromptChange(event) {
        // Use the debounced version to avoid excessive state updates
        this.debouncedPromptChange(event);
    }
    
    handleModelChange(event) {
        this.selectedLLM = event.detail.value;
        const selectedOption = this.llmOptions.find(opt => opt.value === this.selectedLLM);
        this.selectedLLMLabel = selectedOption ? selectedOption.label : 'Unknown Model';
        console.log('Model changed to:', this.selectedLLMLabel);
        // --- Trigger anomaly check if the model is changed manually and hasn't run yet ---
        // This ensures it runs even if the default/first selection failed or wasn't ready
        if (!this.anomalyCheckResult && !this.anomalyCheckLoading) {
            this.performInitialAnomalyCheck();
        }
    }

    // Adjust a hex color by a percentage amount (more efficient version)
    adjustColor(color, amount) {
        // Check cache first for performance
        const cacheKey = `adjust_${color}_${amount}`;
        if (this.colorCache.has(cacheKey)) {
            return this.colorCache.get(cacheKey);
        }
        
        if (!color || !color.startsWith('#')) {
            return color; // Return unchanged if invalid
        }
        
        let hex = color.slice(1);
        
        // Normalize to 6 digits
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        
        // Parse hex to RGB value directly
        let r = parseInt(hex.slice(0, 2), 16);
        let g = parseInt(hex.slice(2, 4), 16);
        let b = parseInt(hex.slice(4, 6), 16);
        
        // Adjust each channel by percentage
        r = Math.max(0, Math.min(255, r + amount));
        g = Math.max(0, Math.min(255, g + amount));
        b = Math.max(0, Math.min(255, b + amount));
        
        // Convert back to hex using template string for efficiency
        const result = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
        
        // Cache the result
        this.colorCache.set(cacheKey, result);
        return result;
    }

    handleAsk() {
        this.handleLLMRequest('ask');
    }

    handleSummarize() {
        this.handleLLMRequest('summarize');
    }

    /**
     * @description Handles the click on the "Analyze Images" button to process image files attached to the record
     */
    handleAnalyzeImages() {
        if (!this.recordId) {
            this.showError('Record ID is required to analyze images.');
            return;
        }
        
        this.isLoading = true;
        this.clearErrors();
        
        // Include assistant context in the prompt if available
        let fullPrompt = this.userPrompt || 'Analyze these images and describe what you see in detail. For any text visible in the images, transcribe it accurately.';
        
        // Add assistant context if available
        if (this.contextPrompt) {
            fullPrompt = `ASSISTANT CONTEXT: ${this.contextPrompt}\n\n${fullPrompt}`;
        }
        
        processImagesWithAI({ 
            recordId: this.recordId, 
            prompt: fullPrompt
        })
        .then(result => {
            // Store response and update UI
            this.response = result;
            
            // Add to conversation history
            this.addMessageToHistory({
                id: this.generateMessageId(),
                sender: 'You',
                isUser: true,
                content: 'Analyze images: ' + this.userPrompt,
                formattedContent: this.getFormattedMessageContent('Analyze images: ' + this.userPrompt),
                timestamp: this.getFormattedTimestamp()
            });
            
            this.addMessageToHistory({
                id: this.generateMessageId(),
                sender: 'AI Assistant',
                isUser: false,
                content: result,
                formattedContent: this.getFormattedMessageContent(result),
                timestamp: this.getFormattedTimestamp(),
                model: 'OpenAI GPT4o Vision'
            });
            
            // Scroll to the response
            this.scrollToBottom();
        })
        .catch(error => {
            this.showError('Error analyzing images: ' + this.getErrorMessage(error));
        })
        .finally(() => {
            this.isLoading = false;
        });
    }

    // Replace your existing handleLLMRequest method with this version
    handleLLMRequest(operation) {
        if (!this.validateInputs(operation)) return;
        
        this.isLoading = true;
        this.clearErrors();
        this.response = '';
        
        // Only get DOM information if we're on a record page
        let domInfo = '';
        if (this.effectiveRecordId) {
            domInfo = this.truncateContent(this.getDOMInformation(), 10000);
        }
        
        // Add user's message to conversation history
        let userMessage = this.userPrompt.trim();
        
        // For summarize operations, indicate it was an analysis request
        if (operation === 'summarize') {
            userMessage = 'Analyze this record: ' + userMessage;
        }
        
        // Add to conversation history
        const userMessageObj = {
            id: Date.now(),
            content: userMessage,
            formattedContent: userMessage.replace(/\n/g, '<br />'),
            sender: 'User',
            timestamp: this.getFormattedTimestamp(),
            isUser: true
        };
        
        this.addMessageToHistory(userMessageObj);
        
        // Include conversation history in the prompt
        const conversationContext = this.getConversationSummary();
        
        // Combine and truncate the final prompt
        let finalPrompt;
        if (operation === 'summarize') {
            if (!this.effectiveRecordId) {
                this.showError('Cannot analyze record: No record is available');
                this.isLoading = false;
                return;
            }
            
            // Add context about component placement/purpose if provided
            const contextInfo = this.contextPrompt ? 
                `ASSISTANT CONTEXT: ${this.contextPrompt}\n\n` : '';
                
            finalPrompt = this.truncateContent(
                `${contextInfo}${conversationContext}PAGE COMPONENT INFORMATION:\n${domInfo}\n\n${this.userPrompt}`
            );
        } else {
            // Add context about component placement/purpose if provided
            const contextInfo = this.contextPrompt ? 
                `ASSISTANT CONTEXT: ${this.contextPrompt}\n\n` : '';
                
            finalPrompt = this.truncateContent(
                `${contextInfo}${conversationContext}${this.userPrompt}`
            );
        }

        // Variable to control when to show results
        let shouldShowResultsImmediately = true;
        let analysisResult = '';

        // If this is analyze operation and we have a field to save to, we'll need to prepare modal first
        if (operation === 'summarize' && this.effectiveRecordId && this.analysisFieldApiName && this.analysisFieldApiName.trim() !== '') {
            shouldShowResultsImmediately = false;
        }

        handleRequest({
            recordId: this.effectiveRecordId || null, // Use effectiveRecordId instead of recordId
            configName: this.selectedLLM,
            prompt: finalPrompt,
            operation: operation,
            relatedObjects: this.relatedObjects
        })
        .then(result => {
            // Store the result but don't show it immediately if we need to prepare the modal
            analysisResult = result;
            
            // If this is a summarize operation and we have a field to save to, prepare the modal
            if (operation === 'summarize' && this.effectiveRecordId && this.analysisFieldApiName && this.analysisFieldApiName.trim() !== '') {
                this.currentAnalysis = result;
                return this.prepareSynopsisModal(result);
            } else {
                return Promise.resolve();
            }
        })
        .then(() => {
            // Now that modal is prepared (if needed), show the results
            this.response = analysisResult;
            
            // Add AI response to conversation history
            const aiMessageObj = {
                id: Date.now(),
                content: analysisResult,
                formattedContent: analysisResult.replace(/\n/g, '<br />'),
                sender: 'AI Assistant',
                timestamp: this.getFormattedTimestamp(),
                isUser: false,
                model: this.selectedLLMLabel
            };
            
            this.addMessageToHistory(aiMessageObj);
            
            // Clear input field after successful response
            this.userPrompt = '';
            
            // Show success toast
            this.dispatchEvent(new ShowToastEvent({
                title: 'Response Generated',
                message: operation === 'ask' ? 'Your question has been answered' : 'Record analysis complete',
                variant: 'success'
            }));
            
            // Auto-scroll to bottom of conversation
            this.scrollToBottom();
        })
        .catch(error => {
            if (error.body?.message?.includes('prompt is too long')) {
                this.showError('Request contained too much information. Some details have been omitted.');
            } else {
                this.showError(error.body?.message || 'Error processing request');
            }
        })
        .finally(() => {
            this.isLoading = false;
        });
    }
    
    // Helper to scroll to bottom of conversation
    scrollToBottom() {
        setTimeout(() => {
            const chatContainer = this.template.querySelector('.conversation-container');
            if (chatContainer) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
        }, 100);
    }

    truncateContent(content, maxSize = 150000) { // Using 150000 to leave room for response
        if (!content) return '';
        
        // Rough approximation of tokens (4 characters ≈ 1 token)
        const approxTokenLength = Math.ceil(content.length / 4);
        
        if (approxTokenLength <= maxSize) {
            return content;
        }
    
        // If it's too long, truncate while preserving structure
        const sections = content.split('\n\n');
        let truncatedContent = '';
        let currentSize = 0;
    
        for (const section of sections) {
            const sectionTokens = Math.ceil(section.length / 4);
            if (currentSize + sectionTokens > maxSize) {
                break;
            }
            truncatedContent += section + '\n\n';
            currentSize += sectionTokens;
        }
    
        return truncatedContent + '\n[Content truncated due to length limitations]';
    }

    validateInputs(operation) {
        // When analyzing a record, we need a recordId
        if (operation === 'summarize' && !this.effectiveRecordId) {
            this.showError('No record ID available for analysis');
            return false;
        }
        
        // Model selection is always required
        if (!this.selectedLLM) {
            this.showError('Please select an AI model first');
            return false;
        }
        
        // User prompt is required for asking questions
        if (operation === 'ask' && !this.userPrompt?.trim()) {
            this.showError('Please enter a question');
            return false;
        }
        
        // Check prompt length
        if (this.userPrompt && this.userPrompt.length > 32000) {
            this.showError('Question is too long');
            return false;
        }
        
        return true;
    }

    showError(message) {
        console.error('Error:', message);
        this.hasError = true;
        this.errorMessage = message;
        
        // Also show a toast notification
        this.dispatchEvent(new ShowToastEvent({
            title: 'Error',
            message: message,
            variant: 'error'
        }));
        
        setTimeout(() => this.clearErrors(), 5000);
    }

    clearErrors() {
        this.hasError = false;
        this.errorMessage = '';
    }

    // Helper method to render response with formatting
    get formattedResponse() {
        if (!this.response) return '';
        
        // Replace newlines with HTML breaks
        let formatted = this.response.replace(/\n/g, '<br />');
        
        // Remove any "User:" prefixes that might have slipped through
        formatted = formatted.replace(/User:\s+/g, '');
        formatted = formatted.replace(/You:\s+/g, '');
        
        return formatted;
    }
    
    // Copy response to clipboard
    copyResponseToClipboard(event) {
        if (!this.response) return;
        
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = this.response;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        document.execCommand('copy');
        document.body.removeChild(tempTextArea);
        
        // Provide immediate feedback
        this.provideFeedback(event.target, 'Response copied to clipboard');
    }

    // Copy a specific message to clipboard
    copyMessageToClipboard(event) {
        const message = event.currentTarget.dataset.message;
        if (!message) return;
        
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = message;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        document.execCommand('copy');
        document.body.removeChild(tempTextArea);
        
        // Provide immediate feedback
        this.provideFeedback(event.target, 'Message copied to clipboard');
    }

    // Get information about page components - optimized version
    getDOMInformation() {
        // Skip scanning if it's already been done
        if (this.pageComponentsScanned && this.pageComponents.length > 0) {
            return this.pageComponents.join('\n');
        }
        
        const pageContent = [];
        
        try {
            // Get the entire page container more efficiently with a direct selector
            const componentSelector = 'one-record-home-flexipage2, one-record-home-flexipage';
            const pageContainer = document.querySelector(componentSelector);
            
            if (pageContainer) {
                // Create a single cached NodeList for each component type
                
                // Get lightning cards - use attribute selector for efficiency
                const cards = document.querySelectorAll('lightning-card[title]');
                if (cards.length) {
                    pageContent.push('Lightning Cards:');
                    Array.from(cards).forEach(card => {
                        const title = card.title || card.getAttribute('title') || 'Untitled Card';
                        pageContent.push(`- ${title}`);
                    });
                }

                // Get tabs more efficiently with a specific selector
                const tabs = document.querySelectorAll('lightning-tab[label]');
                if (tabs.length) {
                    pageContent.push('Tabs:');
                    Array.from(tabs).forEach(tab => {
                        const label = tab.label || tab.getAttribute('label') || 'Untitled Tab';
                        pageContent.push(`- ${label}`);
                    });
                }

                // Get related lists
                const relatedLists = document.querySelectorAll('lightning-related-list[title]');
                if (relatedLists.length) {
                    pageContent.push('Related Lists:');
                    Array.from(relatedLists).forEach(list => {
                        const title = list.getAttribute('title') || 'Untitled Related List';
                        pageContent.push(`- ${title}`);
                    });
                }

                // Get actions more efficiently with specific selector
                const quickActions = document.querySelectorAll('lightning-action-bar lightning-button[label]');
                if (quickActions.length) {
                    pageContent.push('Quick Actions:');
                    Array.from(quickActions).forEach(action => {
                        const label = action.label || action.getAttribute('label') || 'Untitled Action';
                        pageContent.push(`- ${label}`);
                    });
                }

                // Get custom components (those starting with 'c-')
                // Use a more efficient attribute-starts-with selector
                const customComponents = document.querySelectorAll('[data-component-id^="c-"]');
                if (customComponents.length) {
                    pageContent.push('Custom Components:');
                    // Convert to array once and then map directly
                    const componentIds = Array.from(customComponents)
                        .map(comp => comp.getAttribute('data-component-id'))
                        .filter(id => id); // Filter out null/undefined
                    
                    // Use Set to remove duplicates
                    new Set(componentIds).forEach(id => {
                        pageContent.push(`- ${id}`);
                    });
                }
            }
            
            // Store the scanned data for future use
            this.pageComponents = pageContent;
            this.pageComponentsScanned = true;
            
        } catch (error) {
            console.error('Error gathering DOM information:', error);
            pageContent.push('Error gathering page component information');
            // Don't mark as scanned on error so we'll try again next time
            this.pageComponentsScanned = false;
        }

        return pageContent.join('\n');
    }

    // Convert hex color to RGB values - optimized version
    hexToRgb(hex) {
        // Check cache first
        const cacheKey = `rgb_${hex}`;
        if (this.colorCache.has(cacheKey)) {
            return this.colorCache.get(cacheKey);
        }
        
        // Default fallback
        if (!hex || typeof hex !== 'string' || !hex.startsWith('#')) {
            return '34, 189, 193';
        }
        
        let r, g, b;
        
        // Handle different hex formats efficiently
        if (hex.length === 4) {
            // #RGB format
            r = parseInt(hex.charAt(1) + hex.charAt(1), 16);
            g = parseInt(hex.charAt(2) + hex.charAt(2), 16);
            b = parseInt(hex.charAt(3) + hex.charAt(3), 16);
        } else if (hex.length === 7) {
            // #RRGGBB format
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        } else {
            // Invalid format
            return '34, 189, 193';
        }
        
        const result = `${r}, ${g}, ${b}`;
        
        // Cache the result
        this.colorCache.set(cacheKey, result);
        return result;
    }

    // Perform the initial anomaly check when the component has the recordId and a model selected
    async performInitialAnomalyCheck() {
        // Only run if anomaly detection is enabled, we have a recordId and a selected LLM
        if (!this.enableAnomalyDetection || !this.effectiveRecordId || !this.selectedLLM || this.anomalyCheckLoading) {
            console.log('Anomaly check skipped: ' + 
                (!this.enableAnomalyDetection ? 'Anomaly detection disabled, ' : '') +
                (!this.effectiveRecordId ? 'Missing recordId, ' : '') + 
                (!this.selectedLLM ? 'No LLM selected, ' : '') + 
                (this.anomalyCheckLoading ? 'Already loading' : ''));
            return;
        }
        
        console.log('Performing initial anomaly check...');
        this.anomalyCheckLoading = true;
        this.showAnomalyBanner = false; // Reset banner state
        this.anomalyBannerMessage = ''; // Clear previous message
        this.anomalyCheckResult = '';   // Clear previous result

        try {
            // Call the Apex method
            const result = await checkRecordForAnomalies({ 
                recordId: this.effectiveRecordId, 
                configName: this.selectedLLM,
                relatedObjects: this.relatedObjects
            });

            console.log('Anomaly check result received:', result);
            this.anomalyCheckResult = result; // Store the raw result
            
            // Check if the result indicates an anomaly (starts with "YES")
            if (result && result.toUpperCase().startsWith('YES')) {
                this.showAnomalyBanner = true;
                // Extract the explanation part after "YES - "
                this.anomalyBannerMessage = result.substring(result.indexOf('-') + 1).trim(); 
                console.log('Anomaly detected, banner will be shown:', this.anomalyBannerMessage);
                // Automatically open the accordion when an issue is detected
                this.activeAccordionSections = ['anomalySection']; 
            } else {
                this.showAnomalyBanner = false;
                console.log('No anomalies detected by initial check.');
                // Ensure accordion is closed if no issue
                this.activeAccordionSections = []; 
            }

        } catch (error) {
            // Handle errors during the anomaly check (e.g., Apex error, network issue)
            console.error('Error during initial anomaly check:', error);
            // Optionally show a toast or log the error, but maybe don't block the main UI
            // We'll display a generic message in the banner spot for visibility
            this.showAnomalyBanner = true;
            this.anomalyBannerMessage = 'Could not perform automatic record analysis. Please proceed with caution or try analyzing manually.';
            // Automatically open the accordion when there is an error
            this.activeAccordionSections = ['anomalySection'];
            // Consider adding a more specific error log for admins/devs
            // this.showError('Failed to perform initial anomaly check: ' + this.getErrorMessage(error));
        } finally {
            // Ensure loading state is turned off
            this.anomalyCheckLoading = false;
            console.log('Anomaly check finished.');
        }
    }

    // Utility to extract error messages
    getErrorMessage(error) {
        let message = 'Unknown error';
        // Check if it's an AuraHandledException
        if (error?.body?.message) {
            message = error.body.message;
        }
        // Check for other common error structures
        else if (error?.message) {
            message = error.message;
        }
        return message;
    }

    // Wire to get the record data first to determine object API name properly
    @wire(getRecord, { recordId: '$effectiveRecordId', fields: [ID_FIELD] })
    wiredRecord({ error, data }) {
        if (data) {
            // Extract the object API name from the record data
            this.objectApiName = data.apiName;
            console.log('Record loaded. Object API Name:', this.objectApiName);
        } else if (error) {
            console.error('Error loading record:', error);
        }
    }

    // Wire to get object info once we have the object API name
    @wire(getObjectInfo, { objectApiName: '$objectApiName' })
    wiredObjectInfo({ error, data }) {
        if (data) {
            console.log('Object info loaded:', data.apiName);
            console.log('Field exists check will run when analyzing record');
            
            // If the field was configured, check if it exists
            if (this.analysisFieldApiName) {
                const fieldExists = Object.keys(data.fields).includes(this.analysisFieldApiName);
                console.log(`Field ${this.analysisFieldApiName} exists:`, fieldExists);
                
                if (!fieldExists) {
                    console.warn(`WARNING: Field '${this.analysisFieldApiName}' does not exist on ${data.apiName}`);
                }
            }
        } else if (error) {
            console.error('Error loading object info:', error);
        }
    }

    // New method to prepare synopsis modal that returns a Promise
    prepareSynopsisModal(analysis) {
        return new Promise((resolve, reject) => {
            console.log('Preparing synopsis modal for field:', this.analysisFieldApiName);
            
            // Make sure we have a recordId and analysis field name
            if (!this.effectiveRecordId || !this.analysisFieldApiName) {
                console.error('Missing recordId or analysisFieldApiName');
                resolve(); // Resolve anyway to continue the flow
                return;
            }
            
            // Get the current object info from our wired property
            const objectInfo = this.template.querySelector('lightning-record-edit-form')?.getObjectInfo() || 
                             (this.wiredObjectInfo && this.wiredObjectInfo.data);
            
            // If we don't have object info yet, try to get it through the wire service
            if (!objectInfo) {
                console.log('Object info not available yet - checking directly with apex');
                
                // Use apex to check field existence
                saveAnalysisToField({
                    recordId: this.effectiveRecordId,
                    fieldApiName: this.analysisFieldApiName,
                    analysisText: 'FIELD_CHECK_ONLY'
                })
                .then(() => {
                    console.log('Field exists check passed via Apex');
                    // Set a default field label if we couldn't get it from object info
                    this.fieldLabel = this.analysisFieldApiName;
                    console.log('Setting default field label:', this.fieldLabel);
                    this.prepareSynopsisSummary(analysis)
                        .then(() => resolve())
                        .catch(error => reject(error));
                })
                .catch(error => {
                    console.error('Field check failed:', error);
                    this.showError(`Field '${this.analysisFieldApiName}' does not exist or is not accessible. Please check the component configuration.`);
                    resolve(); // Resolve anyway to continue the flow
                });
                return;
            }
            
            // Check if the field exists on the object
            console.log('Checking if field exists in object info');
            const fieldExists = objectInfo.fields && Object.keys(objectInfo.fields).includes(this.analysisFieldApiName);
            console.log(`Field ${this.analysisFieldApiName} exists:`, fieldExists);
            
            if (fieldExists) {
                // Get the field label for display in the modal
                this.fieldLabel = objectInfo.fields[this.analysisFieldApiName].label || this.analysisFieldApiName;
                console.log('Field label:', this.fieldLabel);
                this.prepareSynopsisSummary(analysis)
                    .then(() => resolve())
                    .catch(error => reject(error));
            } else {
                this.showError(`Field '${this.analysisFieldApiName}' does not exist on this object. Please check the component configuration.`);
                resolve(); // Resolve anyway to continue the flow
            }
        });
    }

    // Helper method to prepare synopsis summary that returns a Promise
    prepareSynopsisSummary(analysis) {
        return new Promise((resolve, reject) => {
            // Create a summarized version for the field
            // Strict character limit of 500-600 characters (about 90 words)
            const promptForSummary = 
            `Create a professional Synopsis of the following record analysis in a single concise paragraph (STRICT LIMIT: 500-600 characters maximum, about 90 words).
            
            IMPORTANT: The character limit is STRICT and the synopsis MUST be under 600 characters total.
            
            The synopsis should:
            - Begin with "The record" or a more specific descriptor based on the record type
            - Focus only on the most critical information
            - Use extremely concise language with no unnecessary words
            - Be immediately useful for someone reviewing this record
            
            Here is the analysis to summarize:
            
            ${analysis}`;
            
            console.log('Getting full record context...');
            // First get full record context to have the most complete information
            handleRequest({
                recordId: this.effectiveRecordId,
                configName: this.selectedLLM,
                prompt: 'Provide a detailed analysis of this record including all important fields and relationships.',
                operation: 'summarize',
                relatedObjects: this.relatedObjects
            })
            .then(recordContext => {
                console.log('Record context received, generating summary...');
                // Now generate the summary with both the original analysis and record context
                const enhancedPrompt = 
                `${promptForSummary}
                
                Additionally, here is the complete record information to ensure accuracy:
                
                ${recordContext}
                
                FINAL REMINDER: The output MUST be under 600 characters total.`;
                
                return handleRequest({
                    recordId: this.effectiveRecordId,
                    configName: this.selectedLLM,
                    prompt: enhancedPrompt,
                    operation: 'ask',
                    relatedObjects: ''
                });
            })
            .then(summary => {
                console.log('Summary generated, length:', summary.length, 'characters');
                // Enforce the character limit
                if (summary.length > 600) {
                    this.analysisSummary = summary.substring(0, 597) + '...';
                    console.log('Summary truncated to 600 characters');
                } else {
                    this.analysisSummary = summary;
                }
                // Set character count for display
                this.analysisSummaryCharCount = this.analysisSummary.length;
                console.log('Showing save modal with character count:', this.analysisSummaryCharCount);
                this.showSaveAnalysisModal = true;
                resolve();
            })
            .catch(error => {
                console.error('Error generating summary:', error);
                // If summary generation fails, use a simplified approach
                handleRequest({
                    recordId: this.effectiveRecordId,
                    configName: this.selectedLLM,
                    prompt: `${promptForSummary} REMEMBER: Output MUST be 600 characters or less.`,
                    operation: 'ask',
                    relatedObjects: ''
                })
                .then(fallbackSummary => {
                    console.log('Fallback summary generated, length:', fallbackSummary.length);
                    // Enforce the character limit on fallback too
                    if (fallbackSummary.length > 600) {
                        this.analysisSummary = fallbackSummary.substring(0, 597) + '...';
                    } else {
                        this.analysisSummary = fallbackSummary;
                    }
                    // Set character count for display
                    this.analysisSummaryCharCount = this.analysisSummary.length;
                    console.log('Showing save modal with fallback summary');
                    this.showSaveAnalysisModal = true;
                    resolve();
                })
                .catch(fallbackError => {
                    console.error('Fallback summary generation failed:', fallbackError);
                    // If all else fails, use a truncated version of the analysis
                    const truncatedAnalysis = analysis.substring(0, 597);
                    this.analysisSummary = truncatedAnalysis + (analysis.length > 597 ? '...' : '');
                    this.analysisSummaryCharCount = this.analysisSummary.length;
                    console.log('Using truncated analysis as last resort');
                    this.showSaveAnalysisModal = true;
                    resolve();
                });
            });
        });
    }

    // Handle modal confirmation to save analysis to field
    handleSaveAnalysisConfirm() {
        console.log('Saving analysis to field:', this.analysisFieldApiName);
        console.log('Field label for toast:', this.fieldLabel);
        
        // Ensure we have a field label, use API name as fallback
        if (!this.fieldLabel) {
            this.fieldLabel = this.analysisFieldApiName;
            console.log('Using API name as field label fallback:', this.fieldLabel);
        }
        
        this.showSaveAnalysisModal = false;
        
        // Show spinner while saving
        this.isLoading = true;
        
        saveAnalysisToField({
            recordId: this.effectiveRecordId,
            fieldApiName: this.analysisFieldApiName,
            analysisText: this.analysisSummary
        })
        .then(() => {
            console.log('Analysis saved successfully');
            
            // Refresh the record data
            getRecordNotifyChange([{recordId: this.effectiveRecordId}]);
            
            // Show success toast with field label or API name
            const fieldDisplayName = this.fieldLabel || this.analysisFieldApiName || 'specified';
            
            this.dispatchEvent(new ShowToastEvent({
                title: 'Success',
                message: `Analysis saved to ${fieldDisplayName} field`,
                variant: 'success'
            }));
            
            // Update if we're in a record form context
            const recordEditForm = this.template.querySelector('lightning-record-edit-form');
            if (recordEditForm) {
                recordEditForm.submit();
            }
        })
        .catch(error => {
            console.error('Error saving analysis:', error);
            this.showError(`Error saving analysis to field: ${this.getErrorMessage(error)}`);
        })
        .finally(() => {
            this.isLoading = false;
        });
    }
    
    // Handle modal cancellation
    handleSaveAnalysisCancel() {
        this.showSaveAnalysisModal = false;
    }

    // Get class for character count based on length
    get characterCountClass() {
        if (this.analysisSummaryCharCount > 580) {
            return 'character-count-error';
        } else if (this.analysisSummaryCharCount > 500) {
            return 'character-count-warning';
        }
        return '';
    }

    // Get recordId from PageReference if available
    getRecordIdFromPageRef() {
        if (this.pageRef && this.pageRef.attributes) {
            return this.pageRef.attributes.recordId || null;
        }
        return null;
    }

    // Get recordId from URL if present
    getRecordIdFromUrl() {
        const url = window.location.href;
        const idPattern = /\/([a-zA-Z0-9]{15,18})(?:\/|\?|$)/;
        const match = url.match(idPattern);
        return match ? match[1] : null;
    }
    
    // Get the effective record ID from all possible sources
    get effectiveRecordId() {
        const id = this.recordId || this.getRecordIdFromPageRef() || this.getRecordIdFromUrl();
        console.log('Effective Record ID:', id);
        return id;
    }

    // Check if message ID already exists
    generateMessageId() {
        return 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
    }
}