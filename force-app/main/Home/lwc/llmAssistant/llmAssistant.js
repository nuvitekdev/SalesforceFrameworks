import { LightningElement, api, wire, track } from 'lwc';  // Added track import
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getLLMConfigurations from '@salesforce/apex/LLMController.getLLMConfigurations';
import handleRequest from '@salesforce/apex/LLMController.handleRequest';

// Constants
const MAX_HISTORY_MESSAGES = 50; // Maximum number of messages to keep in history

export default class LLMAssistant extends LightningElement {
    @api recordId;
    
    // Design attributes for configuration
    @api primaryColor = '#22BDC1';  // Default Nuvitek teal
    @api accentColor = '#D5DF23';   // Default Nuvitek lime
    @api defaultModelName;          // If provided, this model will be preselected
    @api hideModelSelector = false; // Whether to hide the model selector
    @api cardTitle = 'AI Assistant'; // Configurable title
    @api contextPrompt = '';       // Custom context to provide to the LLM about its purpose/placement
    
    @track llmOptions = [];
    @track selectedLLM;
    @track selectedLLMLabel;
    @track userPrompt = '';
    @track response;
    @track isLoading = false;
    @track hasError = false;
    @track errorMessage = '';
    @track pageComponents = [];  // Added track decorator
    @track pageComponentsScanned = false;
    @track conversationHistory = []; // Track conversation history
    @track showConversationHistory = false; // Default to hiding history
    @track conversationSummary = ''; // Track conversation summary
    @track isSummarizing = false; // Track if summarization is in progress
    @track messagesTotalCount = 0; // Total message count including those pruned due to limits

    // Check if "Analyze Record" button should be shown
    get showAnalyzeButton() {
        return !!this.recordId;
    }

    // Dynamically set CSS variables based on configured colors
    get componentStyle() {
        // Extract RGB values for rgba() usage
        const primaryRGB = this.hexToRgb(this.primaryColor);
        const accentRGB = this.hexToRgb(this.accentColor);

        return `--primary-color: ${this.primaryColor}; 
                --primary-dark: ${this.adjustColor(this.primaryColor, -20)}; 
                --primary-light: ${this.adjustColor(this.primaryColor, 20)};
                --primary-color-rgb: ${primaryRGB};
                --accent-color: ${this.accentColor};
                --accent-dark: ${this.adjustColor(this.accentColor, -20)};
                --accent-light: ${this.adjustColor(this.accentColor, 20)};
                --accent-color-rgb: ${accentRGB};
                --chat-bubble-user: ${this.adjustColor(this.primaryColor, 40)};
                --chat-bubble-ai: #f3f4f6;
                --model-badge-color: ${this.primaryColor};`;
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
    }
    
    // Toggle conversation history visibility
    toggleConversationHistory() {
        this.showConversationHistory = !this.showConversationHistory;
        
        // Set button data attributes for animation
        setTimeout(() => {
            const toggleButton = this.template.querySelector('.toggle-chat-button');
            if (toggleButton) {
                toggleButton.setAttribute('data-expanded', this.showConversationHistory ? 'true' : 'false');
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
            console.log('Generated conversation summary');
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

    connectedCallback() {
        this.applyDynamicStyling();
        
        // Initialize empty conversation history array if needed
        if (!this.conversationHistory) {
            this.conversationHistory = [];
        }
    }
    
    renderedCallback() {
        if (!this.pageComponentsScanned && this.recordId) {
            // Only scan page components if we're on a record page
            setTimeout(() => {
                this.pageComponents = this.getDOMInformation();
                this.pageComponentsScanned = true;
            }, 1000);
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
    
    applyDynamicStyling() {
        // Apply dynamic CSS variable values
        const hostElement = this.template.host;
        hostElement.style = this.componentStyle;
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

    @wire(getLLMConfigurations)
    wiredConfigs({ data, error }) {
        if (data) {
            console.log('LLM configurations received:', data);
            
            // Map the configurations to combobox options
            this.llmOptions = data.map(config => {
                return {
                    label: `${config.MasterLabel} (${config.Provider__c})`,
                    value: config.DeveloperName
                };
            });
            
            console.log('LLM options:', this.llmOptions);
            
            // Select the first option by default if none specified
            if (this.llmOptions.length > 0 && !this.selectedLLM) {
                // Check if there's a default model specified
                if (this.defaultModelName) {
                    const defaultConfig = this.llmOptions.find(
                        option => option.value === this.defaultModelName
                    );
                    
                    if (defaultConfig) {
                        this.selectedLLM = defaultConfig.value;
                        this.selectedLLMLabel = defaultConfig.label;
                        console.log('Default model selected:', this.selectedLLM);
                    }
                }
            }
        } else if (error) {
            console.error('Error fetching LLM configurations:', error);
            this.showError(error.body?.message || 'Error fetching LLM configurations');
        }
    }

    handleModelChange(event) {
        this.selectedLLM = event.detail.value;
        // Store the label as well for display purposes
        const selectedOption = this.llmOptions.find(option => option.value === this.selectedLLM);
        this.selectedLLMLabel = selectedOption ? selectedOption.label : '';
        console.log('Selected LLM:', this.selectedLLM, 'Label:', this.selectedLLMLabel);
    }

    handlePromptChange(event) {
        this.userPrompt = event.detail.value;
    }

    handleAsk() {
        console.log('Handling Ask request');
        this.handleLLMRequest('ask');
    }

    handleSummarize() {
        console.log('Handling Analyze record request');
        this.handleLLMRequest('summarize');
    }

    handleLLMRequest(operation) {
        if (!this.validateInputs(operation)) return;
    
        this.isLoading = true;
        this.clearErrors();
        this.response = '';
    
        // Only get DOM information if we're on a record page
        let domInfo = '';
        if (this.recordId) {
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
            if (!this.recordId) {
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
    
        handleRequest({
            recordId: this.recordId || null, // Pass null if no record ID
            configName: this.selectedLLM,
            prompt: finalPrompt,
            operation: operation
        })
        .then(result => {
            console.log('LLM Response received:', result);
            this.response = result;
            
            // Add AI response to conversation history
            const aiMessageObj = {
                id: Date.now(),
                content: result,
                formattedContent: result.replace(/\n/g, '<br />'),
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
            setTimeout(() => {
                const chatContainer = this.template.querySelector('.conversation-container');
                if (chatContainer) {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
            }, 100);
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
        if (operation === 'summarize' && !this.recordId) {
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

    // New method to copy response to clipboard
    copyResponseToClipboard() {
        if (!this.response) return;
        
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = this.response;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        document.execCommand('copy');
        document.body.removeChild(tempTextArea);
        
        // Show success toast
        this.dispatchEvent(new ShowToastEvent({
            title: 'Copied!',
            message: 'Response copied to clipboard',
            variant: 'success'
        }));
    }

    // Add this new method to your LWC class
    getDOMInformation() {
        // Get all Lightning components on the page
        const pageContent = [];
        
        try {
            // Get the entire page container
            const pageContainer = document.querySelector('one-record-home-flexipage2');
            if (pageContainer) {
                // Get all lightning cards
                const cards = document.querySelectorAll('lightning-card');
                cards.forEach(card => {
                    const title = card.title || card.getAttribute('title') || 'Untitled Card';
                    pageContent.push(`Lightning Card: ${title}`);
                });

                // Get all tabs
                const tabs = document.querySelectorAll('lightning-tab-bar lightning-tab');
                if (tabs.length) {
                    pageContent.push('Tabs found:');
                    tabs.forEach(tab => {
                        const label = tab.label || tab.getAttribute('label') || 'Untitled Tab';
                        pageContent.push(`- ${label}`);
                    });
                }

                // Get all related lists
                const relatedLists = document.querySelectorAll('lightning-related-list');
                relatedLists.forEach(list => {
                    const title = list.getAttribute('title') || 'Untitled Related List';
                    pageContent.push(`Related List: ${title}`);
                });

                // Get all quick actions
                const quickActions = document.querySelectorAll('lightning-action-bar lightning-button');
                if (quickActions.length) {
                    pageContent.push('Quick Actions:');
                    quickActions.forEach(action => {
                        const label = action.label || action.getAttribute('label') || 'Untitled Action';
                        pageContent.push(`- ${label}`);
                    });
                }

                // Get all custom components (those starting with 'c-')
                const customComponents = document.querySelectorAll('[data-component-id^="c-"]');
                if (customComponents.length) {
                    pageContent.push('Custom Components:');
                    customComponents.forEach(component => {
                        const id = component.getAttribute('data-component-id');
                        pageContent.push(`- ${id}`);
                    });
                }
            }
        } catch (error) {
            console.error('Error gathering DOM information:', error);
            pageContent.push('Error gathering page component information');
        }

        return pageContent.join('\n');
    }

    // New method to copy a specific message to clipboard
    copyMessageToClipboard(event) {
        const message = event.currentTarget.dataset.message;
        if (!message) return;
        
        const tempTextArea = document.createElement('textarea');
        tempTextArea.value = message;
        document.body.appendChild(tempTextArea);
        tempTextArea.select();
        document.execCommand('copy');
        document.body.removeChild(tempTextArea);
        
        // Show success toast
        this.dispatchEvent(new ShowToastEvent({
            title: 'Copied!',
            message: 'Message copied to clipboard',
            variant: 'success'
        }));
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
}