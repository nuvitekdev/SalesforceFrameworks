import { LightningElement, api } from 'lwc';
import { MessageFormatter } from 'c/llmAssistantUtils';

export default class LlmConversationDisplay extends LightningElement {
    @api conversationHistory = [];
    @api userChatBubbleColor = '#E8F5F5';
    @api userChatTextColor = '#000000';
    @api aiChatBubbleColor = '#F5F5F5';
    @api aiChatTextColor = '#000000';
    @api showHistory = false;
    @api isLoading = false;
    @api conversationSummary = '';
    @api historyInfo = '';

    get displayedMessages() {
        return this.conversationHistory.map(msg => ({
            ...msg,
            formattedContent: this.formatContent(msg.content),
            formattedTime: msg.timestamp || MessageFormatter.formatTimestamp(),
            messageClass: this.getMessageClass(msg.isUser),
            bubbleStyle: this.getBubbleStyle(msg.isUser),
            senderName: msg.isUser ? 'You' : 'AI Assistant'
        }));
    }

    get hasMessages() {
        return this.conversationHistory && this.conversationHistory.length > 0;
    }

    get conversationContainerClass() {
        return 'conversation-container';
    }

    get toggleIconName() {
        return this.showHistory ? 'utility:chevronup' : 'utility:chevrondown';
    }

    formatContent(content) {
        return MessageFormatter.formatMessageContent(content);
    }

    getMessageClass(isUser) {
        return `message-wrapper ${isUser ? 'user-message' : 'ai-message'}`;
    }

    getBubbleStyle(isUser) {
        if (isUser) {
            return `background-color: ${this.userChatBubbleColor}; color: ${this.userChatTextColor};`;
        }
        return `background-color: ${this.aiChatBubbleColor}; color: ${this.aiChatTextColor};`;
    }

    @api
    scrollToBottom() {
        const container = this.template.querySelector('.conversation-container');
        if (container) {
            setTimeout(() => {
                container.scrollTop = container.scrollHeight;
            }, 100);
        }
    }

    handleClearConversation() {
        this.dispatchEvent(new CustomEvent('clearconversation'));
    }

    handleToggleHistory() {
        this.dispatchEvent(new CustomEvent('togglehistory'));
    }

    handleCopyClick(event) {
        const content = event.currentTarget?.dataset?.message || '';
        this.dispatchEvent(new CustomEvent('copymessage', {
            detail: { content }
        }));
    }
}
