/**
 * Utility functions for LLM Assistant
 * Extracted for reusability and maintainability
 */

export class ColorUtils {
    static getContrastColor(hexColor) {
        const rgb = this.hexToRgb(hexColor);
        const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
        return luminance > 0.5 ? '#000000' : '#FFFFFF';
    }

    static hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    static adjustColor(color, amount) {
        return '#' + color.replace(/^#/, '').replace(/../g, color =>
            ('0' + Math.min(255, Math.max(0, parseInt(color, 16) + amount))
                .toString(16)).substr(-2)
        );
    }
}

export class MessageFormatter {
    static formatTimestamp() {
        return new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    static truncateContent(content, maxSize = 150000) {
        if (!content || content.length <= maxSize) {
            return content;
        }
        const warningMsg = '\n\n[Content truncated due to size limits...]';
        return content.substring(0, maxSize - warningMsg.length) + warningMsg;
    }

    static formatMessageContent(content) {
        if (!content) return '';
        
        // Remove any remaining markdown formatting
        return content
            .replace(/\*\*(.*?)\*\*/g, '<b>$1</b>')
            .replace(/\*(.*?)\*/g, '<i>$1</i>')
            .replace(/\n/g, '<br/>');
    }

    static generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
}

export class ValidationUtils {
    static validateInputs(operation, userPrompt, selectedLLM) {
        const errors = [];

        if (!selectedLLM) {
            errors.push('Please select an AI model');
        }

        if (operation === 'question' && !userPrompt?.trim()) {
            errors.push('Please enter a question');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    static validateDocumentSelection(selectedIds) {
        if (!selectedIds || selectedIds.length === 0) {
            return {
                isValid: false,
                error: 'Please select at least one document'
            };
        }
        return { isValid: true };
    }
}

export class ConversationManager {
    static MAX_HISTORY_MESSAGES = 50;
    static CACHE_KEY_PREFIX = 'llmAssistant_conversation_';

    static addMessageToHistory(conversationHistory, message) {
        const newHistory = [...conversationHistory, message];
        
        // Prune old messages if needed
        if (newHistory.length > this.MAX_HISTORY_MESSAGES) {
            const prunedCount = newHistory.length - this.MAX_HISTORY_MESSAGES;
            return {
                history: newHistory.slice(prunedCount),
                prunedCount
            };
        }
        
        return {
            history: newHistory,
            prunedCount: 0
        };
    }

    static summarizeConversation(conversationHistory) {
        if (!conversationHistory || conversationHistory.length === 0) {
            return 'No conversation to summarize';
        }

        const summary = conversationHistory
            .map(msg => `${msg.isUser ? 'User' : 'AI'}: ${msg.content.substring(0, 100)}...`)
            .join('\n');

        return `Conversation Summary (${conversationHistory.length} messages):\n${summary}`;
    }

    static saveToCache(recordId, conversationHistory) {
        try {
            const cacheKey = this.CACHE_KEY_PREFIX + recordId;
            sessionStorage.setItem(cacheKey, JSON.stringify(conversationHistory));
        } catch (e) {
            console.warn('Failed to save conversation to cache:', e);
        }
    }

    static loadFromCache(recordId) {
        try {
            const cacheKey = this.CACHE_KEY_PREFIX + recordId;
            const cached = sessionStorage.getItem(cacheKey);
            return cached ? JSON.parse(cached) : [];
        } catch (e) {
            console.warn('Failed to load conversation from cache:', e);
            return [];
        }
    }

    static clearCache(recordId) {
        try {
            const cacheKey = this.CACHE_KEY_PREFIX + recordId;
            sessionStorage.removeItem(cacheKey);
        } catch (e) {
            console.warn('Failed to clear conversation cache:', e);
        }
    }
}

export class PromptBuilder {
    static buildSystemPrompt(operationType = 'general', contextPrompt = '') {
        const prompts = {
            general: 'You are a helpful AI assistant analyzing Salesforce data.',
            summarize: 'Provide a comprehensive summary of this record.',
            report: 'Analyze the data and provide insights.',
            anomaly: 'Check for potential issues or anomalies.',
            comparison: 'Compare the provided information against the rules.',
            image: 'Analyze the provided images.',
            document: 'Analyze the provided documents.'
        };

        let systemPrompt = prompts[operationType] || prompts.general;
        
        if (contextPrompt) {
            systemPrompt = `${contextPrompt}\n\n${systemPrompt}`;
        }

        return systemPrompt;
    }

    static buildRequestParams(params) {
        const {
            recordId,
            prompt,
            operation,
            selectedLLM,
            objectsToQuery,
            relatedObjects,
            contextPrompt
        } = params;

        return {
            recordId: recordId || null,
            prompt: prompt || '',
            operation: operation || 'question',
            selectedLLM: selectedLLM,
            objectsToQuery: objectsToQuery || '',
            relatedObjects: relatedObjects || '',
            contextPrompt: contextPrompt || ''
        };
    }
}

export class ErrorHandler {
    static getErrorMessage(error) {
        if (typeof error === 'string') {
            return error;
        }
        
        if (error?.body?.message) {
            return error.body.message;
        }
        
        if (error?.message) {
            return error.message;
        }
        
        return 'An unexpected error occurred';
    }

    static isHeapSizeError(errorMessage) {
        const heapSizeIndicators = [
            'heap size',
            'Apex heap size',
            'System.LimitException',
            'Heap Size Limit'
        ];
        
        return heapSizeIndicators.some(indicator => 
            errorMessage.toLowerCase().includes(indicator.toLowerCase())
        );
    }
}

export class DOMUtils {
    static debounce(func, wait) {
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

    static scrollToBottom(container) {
        if (container) {
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 100);
        }
    }

    static getPageComponents(template) {
        const components = [];
        try {
            const allElements = template.querySelectorAll('*');
            allElements.forEach(el => {
                if (el.tagName && el.tagName.includes('-')) {
                    components.push({
                        type: el.tagName.toLowerCase(),
                        id: el.id || 'no-id',
                        className: el.className || 'no-class'
                    });
                }
            });
        } catch (e) {
            console.warn('Failed to scan page components:', e);
        }
        return components;
    }
}

// Export all utilities as a single object for convenience
export default {
    ColorUtils,
    MessageFormatter,
    ValidationUtils,
    ConversationManager,
    PromptBuilder,
    ErrorHandler,
    DOMUtils
};