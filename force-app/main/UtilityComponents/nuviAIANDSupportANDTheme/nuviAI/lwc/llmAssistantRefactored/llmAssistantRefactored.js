import { LightningElement, api, wire, track } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { getRecordNotifyChange } from "lightning/uiRecordApi";
import { CurrentPageReference } from "lightning/navigation";

// Apex Methods
import getLLMConfigurations from "@salesforce/apex/LLMControllerRefactored.getLLMConfigurations";
import handleRequest from "@salesforce/apex/LLMControllerRefactored.handleRequest";
import checkRecordForAnomalies from "@salesforce/apex/LLMControllerRefactored.checkRecordForAnomalies";
import saveAnalysisToField from "@salesforce/apex/LLMControllerRefactored.saveAnalysisToField";
import processImagesWithAI from "@salesforce/apex/LLMControllerRefactored.processImagesWithAI";
import processPdfDocumentWithAI from "@salesforce/apex/LLMControllerRefactored.processPdfDocumentWithAI";
import getPdfAttachmentsForRecord from "@salesforce/apex/LLMControllerRefactored.getPdfAttachmentsForRecord";
import extractFieldsFromDocuments from "@salesforce/apex/LLMControllerRefactored.extractFieldsFromDocuments";
import updateRecordFields from "@salesforce/apex/LLMControllerRefactored.updateRecordFields";

// Utility imports
import {
    ColorUtils,
    MessageFormatter,
    ValidationUtils,
    ConversationManager,
    PromptBuilder,
    ErrorHandler,
    DOMUtils
} from 'c/llmAssistantUtils';

export default class LlmAssistantRefactored extends LightningElement {
    // API Properties
    @api recordId;
    @api primaryColor = "#22BDC1";
    @api accentColor = "#D5DF23";
    @api defaultModelName;
    @api hideModelSelector = false;
    @api cardTitle = "AI Assistant";
    @api contextPrompt = "";
    @api enableAnomalyDetection = false;
    @api enableImageValidation = false;
    @api enableComparison = false;
    @api enableDocumentAnalysis = false;
    @api enableGenerateReport = false;
    @api comparisonRules = "";
    @api compareFrom = "";
    @api relatedObjects = "";
    @api reportObjects = "";
    @api analysisFieldApiName = "";
    @api documentAnalysisFieldsApiNames = "";
    @api questionInputLabel = "Your Question";
    @api questionInputPlaceholder = "Type your question here...";
    @api askButtonLabel = "Ask Question";
    @api conversationOutput;

    // Tracked Properties
    @track llmOptions = [];
    @track selectedLLM;
    @track userPrompt = "";
    @track response;
    @track isLoading = false;
    @track conversationHistory = [];
    @track showConversationHistory = false;
    @track pdfDocuments = [];
    @track showDocumentModal = false;
    @track anomalyCheckResult = "";
    @track anomalyCheckLoading = false;
    @track showAnomalyBanner = false;

    // Wire Properties
    @wire(CurrentPageReference) pageRef;

    // Computed Properties
    get effectiveRecordId() {
        return this.recordId || this.getRecordIdFromPageRef();
    }

    get hasRelatedObjects() {
        return this.relatedObjects && this.relatedObjects.trim().length > 0;
    }

    get isAskDisabled() {
        return !this.selectedLLM || this.isLoading;
    }

    get showAnalyzeButton() {
        return this.enableDocumentAnalysis && this.effectiveRecordId;
    }

    get showImageAnalysisButton() {
        return this.enableImageValidation && this.effectiveRecordId;
    }

    get userChatBubbleColor() {
        return ColorUtils.adjustColor(this.primaryColor, 20);
    }

    get userChatTextColor() {
        return ColorUtils.getContrastColor(this.userChatBubbleColor);
    }

    get aiChatBubbleColor() {
        return '#F5F5F5';
    }

    get aiChatTextColor() {
        return '#000000';
    }

    // Lifecycle Hooks
    async connectedCallback() {
        await this.loadLLMConfigurations();
        this.loadConversationFromCache();
        
        if (this.enableAnomalyDetection && this.effectiveRecordId) {
            this.performAnomalyCheck();
        }

        if (this.enableDocumentAnalysis && this.effectiveRecordId) {
            this.loadPdfDocuments();
        }
    }

    disconnectedCallback() {
        this.saveConversationToCache();
    }

    // Configuration Methods
    async loadLLMConfigurations() {
        try {
            const configs = await getLLMConfigurations();
            this.llmOptions = configs.map(config => ({
                label: config.Label || config.DeveloperName,
                value: config.DeveloperName
            }));

            if (this.defaultModelName) {
                this.selectedLLM = this.defaultModelName;
            } else if (this.llmOptions.length > 0) {
                this.selectedLLM = this.llmOptions[0].value;
            }
        } catch (error) {
            this.showError('Failed to load AI models: ' + ErrorHandler.getErrorMessage(error));
        }
    }

    async loadPdfDocuments() {
        try {
            const pdfs = await getPdfAttachmentsForRecord({
                recordId: this.effectiveRecordId
            });
            
            this.pdfDocuments = pdfs || [];
        } catch (error) {
            console.error('Error loading PDF documents:', error);
        }
    }

    // Event Handlers
    handleModelChange(event) {
        this.selectedLLM = event.detail.value;
    }

    handlePromptChange(event) {
        this.userPrompt = event.target.value;
    }

    async handleAsk() {
        await this.processRequest('question');
    }

    async handleSummarize() {
        await this.processRequest('summarize');
    }

    async handleAnalyzeImages() {
        if (!this.effectiveRecordId) {
            this.showError('Record ID is required for image analysis');
            return;
        }

        this.isLoading = true;
        try {
            const result = await processImagesWithAI({
                recordId: this.effectiveRecordId,
                userSuppliedPrompt: this.userPrompt || 'Analyze these images in detail'
            });

            this.addMessageToConversation(this.userPrompt || 'Analyze images', true);
            this.addMessageToConversation(result, false);
            this.response = result;
        } catch (error) {
            this.showError('Image analysis failed: ' + ErrorHandler.getErrorMessage(error));
        } finally {
            this.isLoading = false;
        }
    }

    handleShowDocumentModal() {
        if (this.pdfDocuments.length === 0) {
            this.showError('No PDF documents available');
            return;
        }
        this.showDocumentModal = true;
    }

    handleDocumentModalCancel() {
        this.showDocumentModal = false;
    }

    async handleDocumentModalConfirm(event) {
        this.showDocumentModal = false;
        const selectedIds = event.detail.selectedIds;
        await this.processDocuments(selectedIds);
    }

    handleClearConversation() {
        this.conversationHistory = [];
        ConversationManager.clearCache(this.effectiveRecordId);
        this.response = null;
    }

    handleToggleHistory() {
        this.showConversationHistory = !this.showConversationHistory;
    }

    // Core Processing Methods
    async processRequest(operation) {
        const validation = ValidationUtils.validateInputs(
            operation,
            this.userPrompt,
            this.selectedLLM
        );

        if (!validation.isValid) {
            this.showError(validation.errors.join(', '));
            return;
        }

        this.isLoading = true;
        try {
            const params = PromptBuilder.buildRequestParams({
                recordId: this.effectiveRecordId,
                prompt: this.userPrompt,
                operation,
                selectedLLM: this.selectedLLM,
                objectsToQuery: this.reportObjects,
                relatedObjects: this.relatedObjects,
                contextPrompt: this.contextPrompt
            });

            const result = await handleRequest(params);

            if (operation === 'question') {
                this.addMessageToConversation(this.userPrompt, true);
            }
            this.addMessageToConversation(result, false);
            this.response = result;

        } catch (error) {
            this.showError('Request failed: ' + ErrorHandler.getErrorMessage(error));
        } finally {
            this.isLoading = false;
        }
    }

    async processDocuments(documentIds) {
        this.isLoading = true;
        try {
            const result = await processPdfDocumentWithAI({
                recordId: this.effectiveRecordId,
                contentDocumentIds: documentIds,
                userPrompt: this.userPrompt || 'Analyze these documents'
            });

            this.addMessageToConversation('Document analysis', true);
            this.addMessageToConversation(result, false);
            this.response = result;

            if (this.documentAnalysisFieldsApiNames) {
                await this.extractFieldsFromDocuments(documentIds);
            }
        } catch (error) {
            this.showError('Document processing failed: ' + ErrorHandler.getErrorMessage(error));
        } finally {
            this.isLoading = false;
        }
    }

    async extractFieldsFromDocuments(documentIds) {
        try {
            const targetFields = this.documentAnalysisFieldsApiNames.split(',')
                .map(f => f.trim())
                .filter(f => f);

            if (targetFields.length === 0) return;

            const result = await extractFieldsFromDocuments({
                recordId: this.effectiveRecordId,
                contentDocumentIds: documentIds,
                targetFieldApiNames: targetFields
            });

            // Handle extraction results
            if (result && result.fields) {
                // Show field extraction modal or process results
                console.log('Extracted fields:', result);
            }
        } catch (error) {
            console.error('Field extraction failed:', error);
        }
    }

    async performAnomalyCheck() {
        if (!this.selectedLLM || !this.effectiveRecordId) return;

        this.anomalyCheckLoading = true;
        try {
            const result = await checkRecordForAnomalies({
                recordId: this.effectiveRecordId,
                selectedLLM: this.selectedLLM,
                rules: this.comparisonRules
            });

            this.anomalyCheckResult = result;
            this.showAnomalyBanner = result && result.toUpperCase().startsWith('YES');
        } catch (error) {
            console.error('Anomaly check failed:', error);
        } finally {
            this.anomalyCheckLoading = false;
        }
    }

    // Conversation Management
    addMessageToConversation(content, isUser) {
        const message = {
            id: MessageFormatter.generateMessageId(),
            content: MessageFormatter.truncateContent(content),
            isUser,
            timestamp: MessageFormatter.formatTimestamp()
        };

        const result = ConversationManager.addMessageToHistory(
            this.conversationHistory,
            message
        );

        this.conversationHistory = result.history;

        // Scroll to bottom after adding message
        this.scrollToBottom();
    }

    loadConversationFromCache() {
        if (this.effectiveRecordId) {
            this.conversationHistory = ConversationManager.loadFromCache(
                this.effectiveRecordId
            );
        }
    }

    saveConversationToCache() {
        if (this.effectiveRecordId && this.conversationHistory.length > 0) {
            ConversationManager.saveToCache(
                this.effectiveRecordId,
                this.conversationHistory
            );
        }
    }

    scrollToBottom() {
        const conversationDisplay = this.template.querySelector('c-llm-conversation-display');
        if (conversationDisplay) {
            conversationDisplay.scrollToBottom();
        }
    }

    // Utility Methods
    getRecordIdFromPageRef() {
        if (!this.pageRef) return null;
        
        const state = this.pageRef.state;
        if (state && state.recordId) {
            return state.recordId;
        }
        
        const attributes = this.pageRef.attributes;
        if (attributes && attributes.recordId) {
            return attributes.recordId;
        }
        
        return null;
    }

    showError(message) {
        const event = new ShowToastEvent({
            title: 'Error',
            message: message,
            variant: 'error'
        });
        this.dispatchEvent(event);
    }

    showSuccess(message) {
        const event = new ShowToastEvent({
            title: 'Success',
            message: message,
            variant: 'success'
        });
        this.dispatchEvent(event);
    }
}