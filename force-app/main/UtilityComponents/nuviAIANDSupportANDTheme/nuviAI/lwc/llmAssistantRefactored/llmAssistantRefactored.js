import { LightningElement, api, wire, track } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { getRecordNotifyChange } from "lightning/uiRecordApi";
import { CurrentPageReference } from "lightning/navigation";

// Apex Methods
import getLLMConfigurations from "@salesforce/apex/LLMControllerRefactored.getLLMConfigurations";
import handleRequest from "@salesforce/apex/LLMControllerRefactored.handleRequest";
import checkRecordForAnomalies from "@salesforce/apex/LLMControllerRefactored.checkRecordForAnomalies";
import processImagesWithAI from "@salesforce/apex/LLMControllerRefactored.processImagesWithAI";
import processPdfDocumentWithAI from "@salesforce/apex/LLMControllerRefactored.processPdfDocumentWithAI";
import getPdfAttachmentsForRecord from "@salesforce/apex/LLMControllerRefactored.getPdfAttachmentsForRecord";
import extractFieldsFromDocuments from "@salesforce/apex/LLMControllerRefactored.extractFieldsFromDocuments";
import extractFieldsFromAnalyzedContent from "@salesforce/apex/LLMControllerRefactored.extractFieldsFromAnalyzedContent";
import updateRecordFields from "@salesforce/apex/LLMControllerRefactored.updateRecordFields";
import saveAnalysisToField from "@salesforce/apex/LLMControllerRefactored.saveAnalysisToField";
import { loadScript } from 'lightning/platformResourceLoader';
import chartjs from '@salesforce/resourceUrl/chartjs';
import chartjsPluginDatalabels from '@salesforce/resourceUrl/chartjsPluginDatalabels';

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
    @track selectedLLMLabel;
    @track userPrompt = "";
    @track response;
    @track isLoading = false;
    @track conversationHistory = [];
    @track showConversationHistory = false;
    @track conversationSummary = '';
    @track messagesTotalCount = 0;
    @track pdfDocuments = [];
    @track showDocumentModal = false;
    @track anomalyCheckResult = "";
    @track anomalyCheckLoading = false;
    @track showAnomalyBanner = false;
    // Comparison
    @track showComparisonModal = false;
    @track comparisonInput = '';
    @track comparisonCheckLoading = false;
    @track showComparisonBanner = false;
    @track comparisonBannerMessage = '';
    @track comparisonResult = '';
    // Save Analysis
    @track showSaveAnalysisModal = false;
    @track analysisSummary = '';
    @track analysisSummaryCharCount = 0;
    @track responseModelLabel = '';
    // Reporting/Charts (lightweight text fallback)
    chartLoaded = false;
    // Reporting/Charts data
    @track showReportModal = false;
    @track reportData = null; // { chartData: {labels, datasets}, rawResponse, totalRecords, records }
    @track reportChartType = 'bar';
    @track isGeneratingReport = false;
    @track reportError = '';
    chartInstance = null;
    // Field Extraction
    @track showExtractFieldsModal = false;
    @track extractedFieldsData = [];
    // Page context
    pageComponents = [];
    _pageComponentsSummary = '';
    _scannedComponents = false;

    // Wire Properties
    @wire(CurrentPageReference) pageRef;

    // Computed Properties
    get effectiveRecordId() {
        return this.recordId || this.getRecordIdFromPageRef();
    }

    get primaryTextColor() {
        return ColorUtils.getContrastColor(this.primaryColor);
    }

    get accentTextColor() {
        return ColorUtils.getContrastColor(this.accentColor);
    }

    get componentStyle() {
        const adjust = (c, amt) => ColorUtils.adjustColor(c, amt);
        // RGB not strictly needed; keep variables consistent with original pattern
        return `--primary-color: ${this.primaryColor};
                --primary-dark: ${adjust(this.primaryColor, -20)};
                --primary-light: ${adjust(this.primaryColor, 20)};
                --primary-text-color: ${this.primaryTextColor};
                --accent-color: ${this.accentColor};
                --accent-dark: ${adjust(this.accentColor, -20)};
                --accent-light: ${adjust(this.accentColor, 20)};
                --accent-text-color: ${this.accentTextColor};`;
    }

    get comparisonIconName() {
        return (this.comparisonBannerMessage || '').toUpperCase().includes('MEETS')
            ? 'utility:success'
            : 'utility:warning';
    }

    get comparisonBannerClass() {
        return (this.comparisonBannerMessage || '').toUpperCase().includes('MEETS')
            ? 'slds-theme_success'
            : 'slds-theme_warning';
    }

    get chartTypeOptions() {
        return [
            { label: 'Bar', value: 'bar' },
            { label: 'Pie', value: 'pie' },
            { label: 'Line', value: 'line' },
            { label: 'Table', value: 'table' }
        ];
    }

    get isTable() {
        return this.reportChartType === 'table';
    }

    get areActionsDisabled() {
        return !this.selectedLLM || this.isLoading;
    }

    get pageComponentsScanned() {
        return !!this._scannedComponents;
    }

    get historyLimitMessage() {
        const MAX = 50;
        if (this.messagesTotalCount > MAX) {
            const hidden = this.messagesTotalCount - MAX;
            return `Showing ${MAX} of ${this.messagesTotalCount} messages (${hidden} older messages not shown)`;
        }
        return `Showing all ${this.messagesTotalCount} messages`;
    }

    get formattedResponse() {
        if (!this.response) return '';
        return MessageFormatter.formatMessageContent(this.response);
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
        // Try to load Chart.js if reporting is enabled
        if (this.enableGenerateReport && !this.chartLoaded) {
            try {
                await Promise.all([
                    loadScript(this, chartjs),
                    loadScript(this, chartjsPluginDatalabels)
                ]);
                if (window.Chart && window.ChartDataLabels && window.Chart.register) {
                    window.Chart.register(window.ChartDataLabels);
                }
                this.chartLoaded = true;
            } catch (e) {
                // Non-blocking: we still show textual report if chart fails
                // eslint-disable-next-line no-console
                console.warn('Chart libraries failed to load, using text-only reports');
            }
        }
        this.loadConversationFromCache();

        if (this.enableAnomalyDetection && this.effectiveRecordId) {
            this.performAnomalyCheck();
        }

        if (this.enableDocumentAnalysis && this.effectiveRecordId) {
            this.loadPdfDocuments();
        }

        // Auto-comparison check
        this.checkAutoComparison();

        // Theme integration attempt
        this.applyThemeIntegration();
    }

    renderedCallback() {
        // Scan page components once
        if (!this._scannedComponents) {
            try {
                this.pageComponents = DOMUtils.getPageComponents(this.template) || [];
                this._pageComponentsSummary = this.getDOMInformation();
            } catch (e) {
                // ignore
            }
            this._scannedComponents = true;
        }
    }

    applyThemeIntegration() {
        try {
            const themeContainer = document.querySelector('.nuvitek-theme-container');
            if (themeContainer) {
                const style = getComputedStyle(themeContainer);
                const themePrimary = (style.getPropertyValue('--primary-color') || '').trim();
                const themeAccent = (style.getPropertyValue('--accent-color') || '').trim();
                if (themePrimary && this.primaryColor === '#22BDC1') {
                    this.primaryColor = themePrimary;
                }
                if (themeAccent && this.accentColor === '#D5DF23') {
                    this.accentColor = themeAccent;
                }
                if (themeContainer.classList.contains('theme-dark')) {
                    this.template.host.classList.add('theme-dark');
                }
            }
        } catch (e) {
            // ignore
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
            if (this.selectedLLM) {
                const sel = this.llmOptions.find(o => o.value === this.selectedLLM);
                this.selectedLLMLabel = sel ? sel.label : this.selectedLLM;
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
        const sel = this.llmOptions.find(o => o.value === this.selectedLLM);
        this.selectedLLMLabel = sel ? sel.label : this.selectedLLM;
        if (this.enableAnomalyDetection && this.effectiveRecordId && !this.anomalyCheckLoading) {
            this.performAnomalyCheck();
        }
        // Re-evaluate auto comparison
        this.checkAutoComparison();
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

    async handleGenerateReport() {
        // Generate report: call handleRequest and then parse + render
        if (!this.selectedLLM) {
            this.showError('Please select an AI model');
            return;
        }
        this.isGeneratingReport = true;
        this.reportError = '';
        try {
            const params = PromptBuilder.buildRequestParams({
                recordId: this.effectiveRecordId,
                prompt: this.buildPromptWithContext(this.userPrompt || ''),
                operation: 'report',
                selectedLLM: this.selectedLLM,
                objectsToQuery: this.reportObjects,
                relatedObjects: this.relatedObjects,
                contextPrompt: this.contextPrompt
            });
            const result = await handleRequest(params);
            this.reportData = this.createChartDataFromResponse(result, this.userPrompt || '');
            this.showReportModal = true;
            // Clear the input if we used it
            if (this.userPrompt) {
                this.userPrompt = '';
            }
            // Render after modal opens
            setTimeout(() => this.renderCurrentChart(), 100);
        } catch (e) {
            this.reportError = ErrorHandler.getErrorMessage(e);
            this.showError('Report generation failed: ' + this.reportError);
        } finally {
            this.isGeneratingReport = false;
        }
    }

    // Copy handlers
    async handleCopyMessage(event) {
        const content = event.detail?.content || '';
        if (!content) return;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(content);
                this.showSuccess('Message copied to clipboard');
            } else {
                this.showError('Clipboard not available in this context');
            }
        } catch (e) {
            this.showError('Failed to copy');
        }
    }

    async handleCopyResponse() {
        if (!this.response) return;
        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(this.response);
                this.showSuccess('Response copied to clipboard');
            } else {
                this.showError('Clipboard not available in this context');
            }
        } catch (e) {
            this.showError('Failed to copy');
        }
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
        this.conversationSummary = '';
        this.messagesTotalCount = 0;
        this.updateFlowOutput();
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
            const sel = this.llmOptions.find(o => o.value === this.selectedLLM);
            this.responseModelLabel = sel ? (sel.label || this.selectedLLM) : (this.selectedLLMLabel || this.selectedLLM || 'Selected Model');
            const params = PromptBuilder.buildRequestParams({
                recordId: this.effectiveRecordId,
                prompt: this.buildPromptWithContext(this.userPrompt),
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
            // Include the model label with the AI message for history, mirroring original
            this.addMessageToConversation(`${result}`, false);
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
                prompt: this.userPrompt || 'Analyze these documents',
                selectedLLM: this.selectedLLM
            });

            this.addMessageToConversation('Document analysis', true);
            this.addMessageToConversation(result, false);
            this.response = result;

            if (this.documentAnalysisFieldsApiNames) {
                await this.extractFieldsFromDocumentsFromAnalysis([result]);
            }
        } catch (error) {
            this.showError('Document processing failed: ' + ErrorHandler.getErrorMessage(error));
        } finally {
            this.isLoading = false;
        }
    }

    buildPromptWithContext(basePrompt) {
        let prompt = basePrompt || '';
        try {
            const comps = this.pageComponents || [];
            const summary = this._pageComponentsSummary || (comps.length ? comps.slice(0, 25).map(c => `${c.type}${c.id && c.id !== 'no-id' ? '#' + c.id : ''}`).join(', ') : '');
            if (summary) {
                prompt += `\n\nPage Context: The user is viewing a Salesforce record page with the following components:\n${summary}`;
            }
            if (this.conversationSummary) {
                prompt += `\n\nConversation Summary: ${this.conversationSummary}`;
            }
        } catch (e) {
            // ignore
        }
        return prompt;
    }

    // Global DOM information (cards, tabs, related lists, actions)
    getDOMInformation() {
        const pageContent = [];
        try {
            const cards = document.querySelectorAll('lightning-card[title]');
            if (cards && cards.length) {
                pageContent.push('Lightning Cards:');
                cards.forEach(card => {
                    const title = card.title || card.getAttribute('title') || 'Untitled Card';
                    pageContent.push(`- ${title}`);
                });
            }
            const tabs = document.querySelectorAll('lightning-tab[label]');
            if (tabs && tabs.length) {
                pageContent.push('Tabs:');
                tabs.forEach(tab => {
                    const label = tab.label || tab.getAttribute('label') || 'Untitled Tab';
                    pageContent.push(`- ${label}`);
                });
            }
            const relatedLists = document.querySelectorAll('lightning-related-list[title]');
            if (relatedLists && relatedLists.length) {
                pageContent.push('Related Lists:');
                relatedLists.forEach(list => {
                    const title = list.getAttribute('title') || 'Untitled Related List';
                    pageContent.push(`- ${title}`);
                });
            }
            const quickActions = document.querySelectorAll('lightning-action-bar lightning-button[label]');
            if (quickActions && quickActions.length) {
                pageContent.push('Quick Actions:');
                quickActions.forEach(action => {
                    const label = action.label || action.getAttribute('label') || 'Untitled Action';
                    pageContent.push(`- ${label}`);
                });
            }
        } catch (e) {
            // ignore
        }
        return pageContent.join('\n');
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
                targetFieldApiNames: targetFields,
                selectedLLM: this.selectedLLM
            });

            // Handle extraction results
            if (result && result.fields) {
                this.prepareFieldExtractionModal(result.fields);
            }
        } catch (error) {
            console.error('Field extraction failed:', error);
        }
    }

    async extractFieldsFromDocumentsFromAnalysis(analyzedContents) {
        try {
            const targetFields = this.documentAnalysisFieldsApiNames.split(',')
                .map(f => f.trim())
                .filter(f => f);
            if (targetFields.length === 0) return;

            const result = await extractFieldsFromAnalyzedContent({
                recordId: this.effectiveRecordId,
                analyzedDocumentContents: analyzedContents,
                targetFieldApiNames: targetFields,
                selectedLLM: this.selectedLLM
            });
            if (result && result.fields) {
                this.prepareFieldExtractionModal(result.fields);
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Extraction from analyzed content failed', e);
        }
    }

    prepareFieldExtractionModal(fieldsMap) {
        try {
            const values = Object.values(fieldsMap);
            this.extractedFieldsData = values.map(field => ({
                ...field,
                id: field.apiName,
                options: [
                    {
                        label: `Current: ${field.currentValue === null || field.currentValue === undefined ? '(empty)' : field.currentValue}`,
                        value: field.currentValue === null || field.currentValue === undefined ? '__KEEP_CURRENT__' : field.currentValue
                    },
                    ...((field.suggestedValues || []).map(v => ({ label: v, value: v })))
                ],
                selectedValue: field.currentValue === null || field.currentValue === undefined ? '__KEEP_CURRENT__' : field.currentValue
            }));
            if (this.extractedFieldsData.some(f => (f.options || []).length > 1)) {
                this.showExtractFieldsModal = true;
            } else {
                this.showError('No relevant field data could be extracted from the documents.');
            }
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('Error preparing field extraction modal', e);
        }
    }

    handleFieldExtractionCancel() {
        this.showExtractFieldsModal = false;
        this.extractedFieldsData = [];
    }

    async handleFieldExtractionConfirm(event) {
        const selections = event.detail?.selections || {};
        let hasChanges = false;
        const fieldsToUpdate = {};
        (this.extractedFieldsData || []).forEach(field => {
            const selected = selections[field.apiName];
            if (selected && selected !== '__KEEP_CURRENT__' && selected !== field.currentValue) {
                fieldsToUpdate[field.apiName] = selected;
                hasChanges = true;
            }
        });
        if (!hasChanges) {
            this.showExtractFieldsModal = false;
            this.extractedFieldsData = [];
            this.showError('No new values were selected to update.');
            return;
        }
        try {
            await updateRecordFields({ recordId: this.effectiveRecordId, fieldValues: fieldsToUpdate });
            this.showExtractFieldsModal = false;
            this.extractedFieldsData = [];
            this.showSuccess('Record fields updated successfully from document data.');
            getRecordNotifyChange([{ recordId: this.effectiveRecordId }]);
        } catch (e) {
            this.showError('Error updating record fields: ' + ErrorHandler.getErrorMessage(e));
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
        this.messagesTotalCount += 1;

        // Scroll to bottom after adding message
        this.scrollToBottom();

        // Periodic conversation summary generation
        if (this.conversationHistory.length >= 10 && (this.conversationSummary === '' || this.conversationHistory.length % 10 === 0)) {
            // fire and forget; no need to await
            this.generateConversationSummary();
        }
        this.updateFlowOutput();
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

    // Flow output helper to mirror llmAssistant behavior
    updateFlowOutput() {
        if (this.conversationOutput !== undefined) {
            const payload = {
                history: this.conversationHistory,
                summary: this.conversationSummary,
                messageCount: this.messagesTotalCount,
                lastResponse: this.response || ''
            };
            try {
                this.conversationOutput = JSON.stringify(payload);
            } catch (e) {
                // ignore JSON errors
            }
        }
    }

    async generateConversationSummary() {
        try {
            const system = PromptBuilder.buildSystemPrompt('general', this.contextPrompt);
            const convo = this.conversationHistory.map(m => `${m.isUser ? 'User' : 'AI'}: ${m.content}`).join('\n\n');
            const prompt = `${system}Create a concise summary of this AI assistant conversation.\n\n${convo}\n\nFocus on key topics and outcomes. Keep under 300 words.`;
            const result = await handleRequest({
                recordId: this.effectiveRecordId || null,
                prompt,
                operation: 'question',
                selectedLLM: this.selectedLLM,
                objectsToQuery: '',
                relatedObjects: '',
                contextPrompt: this.contextPrompt || ''
            });
            this.conversationSummary = result || '';
            this.updateFlowOutput();
        } catch (e) {
            // swallow errors to avoid interrupting UX
        }
    }

    // Comparison Handlers
    handleComparisonClick() {
        this.comparisonInput = this.compareFrom || '';
        this.showComparisonModal = true;
    }

    handleComparisonInputChange(event) {
        this.comparisonInput = event.target.value;
    }

    handleComparisonModalCancel() {
        this.showComparisonModal = false;
        this.comparisonInput = '';
    }

    async handleComparisonModalConfirm() {
        if (!this.comparisonInput || !this.comparisonInput.trim()) {
            this.showError('Please provide input to compare');
            return;
        }
        this.showComparisonModal = false;
        this.comparisonCheckLoading = true;
        this.showComparisonBanner = false;
        try {
            // Build a comparison-oriented prompt
            let rulesObj;
            try { rulesObj = JSON.parse(this.comparisonRules || '{}'); } catch (e) { rulesObj = { rules: this.comparisonRules || '' }; }
            const system = PromptBuilder.buildSystemPrompt('comparison', this.contextPrompt);
            const prompt = `${system}You are an expert evaluator assessing whether submitted content meets specified standards and requirements.\n\nEVALUATION CRITERIA/RULES:\n${JSON.stringify(rulesObj, null, 2)}\n\nCONTENT TO EVALUATE:\n${this.comparisonInput}`;
            const result = await handleRequest({
                recordId: this.effectiveRecordId || null,
                prompt: this.buildPromptWithContext(prompt),
                operation: 'question',
                selectedLLM: this.selectedLLM,
                objectsToQuery: this.reportObjects || '',
                relatedObjects: this.relatedObjects || '',
                contextPrompt: this.contextPrompt || ''
            });
            this.comparisonResult = result || '';
            this.comparisonResultHtml = this.formatComparisonResult(this.comparisonResult);
            const meets = (this.comparisonResult || '').toUpperCase().includes('MEETS STANDARDS');
            this.comparisonBannerMessage = meets ? 'MEETS' : 'DOES NOT MEET';
            this.showComparisonBanner = true;

            // Log to conversation
            this.addMessageToConversation(`Comparison Request:\n${this.comparisonInput}`, true);
            this.addMessageToConversation(this.comparisonResult, false);
        } catch (e) {
            this.showError('Comparison failed: ' + ErrorHandler.getErrorMessage(e));
        } finally {
            this.comparisonCheckLoading = false;
            this.comparisonInput = '';
        }
    }

    // Save Analysis (to field) Handlers
    async handleSaveAnalysisClick() {
        if (!this.analysisFieldApiName) {
            this.showError('No target field configured');
            return;
        }
        if (!this.response) {
            this.showError('Nothing to save yet');
            return;
        }
        // Build a short synopsis (<= 600 chars) using the LLM
        try {
            this.isLoading = true;
            const system = PromptBuilder.buildSystemPrompt('summarize', this.contextPrompt);
            const synopsisPrompt = `${system}Create a professional, single-paragraph synopsis of the following analysis (STRICT LIMIT: 600 characters).\n\nANALYSIS:\n${this.response}`;
            const synopsis = await handleRequest({
                recordId: this.effectiveRecordId || null,
                prompt: synopsisPrompt,
                operation: 'question',
                selectedLLM: this.selectedLLM,
                objectsToQuery: '',
                relatedObjects: '',
                contextPrompt: this.contextPrompt || ''
            });
            this.analysisSummary = (synopsis || '').slice(0, 600);
            this.analysisSummaryCharCount = this.analysisSummary.length;
            this.showSaveAnalysisModal = true;
        } catch (e) {
            this.showError('Failed to prepare synopsis: ' + ErrorHandler.getErrorMessage(e));
        } finally {
            this.isLoading = false;
        }
    }

    handleSaveAnalysisCancel() {
        this.showSaveAnalysisModal = false;
    }

    async handleSaveAnalysisConfirm() {
        try {
            this.isLoading = true;
            await saveAnalysisToField({
                recordId: this.effectiveRecordId,
                fieldApiName: this.analysisFieldApiName,
                analysisText: this.analysisSummary
            });
            this.showSuccess(`Analysis saved to ${this.analysisFieldApiName}`);
            getRecordNotifyChange([{ recordId: this.effectiveRecordId }]);
            this.showSaveAnalysisModal = false;
        } catch (e) {
            this.showError('Failed to save analysis: ' + ErrorHandler.getErrorMessage(e));
        } finally {
            this.isLoading = false;
        }
    }

    // ----- Auto Comparison -----
    get shouldRunAutoComparison() {
        return !!(this.enableComparison && this.comparisonRules && this.comparisonRules.trim() && (this.compareFrom || this.effectiveRecordId));
    }

    checkAutoComparison() {
        if (!this.selectedLLM || this.comparisonCheckLoading || !this.shouldRunAutoComparison) {
            return;
        }
        if (this._lastCompareFrom === this.compareFrom && this._lastComparisonRules === this.comparisonRules && this.showComparisonBanner) {
            return; // no changes
        }
        this.performAutoComparison();
    }

    async getRecordContextForComparison() {
        if (!this.effectiveRecordId) return '';
        try {
            const params = PromptBuilder.buildRequestParams({
                recordId: this.effectiveRecordId,
                prompt: '',
                operation: 'summarize',
                selectedLLM: this.selectedLLM,
                relatedObjects: this.relatedObjects || '',
                objectsToQuery: ''
            });
            return await handleRequest(params);
        } catch (e) {
            // eslint-disable-next-line no-console
            console.warn('Record context fetch failed', e);
            return '';
        }
    }

    async performAutoComparison() {
        this.comparisonCheckLoading = true;
        this.showComparisonBanner = false;
        this._lastCompareFrom = this.compareFrom;
        this._lastComparisonRules = this.comparisonRules;
        try {
            let contentToCompare = this.compareFrom;
            if (!contentToCompare) {
                contentToCompare = await this.getRecordContextForComparison();
            }
            let rulesObj;
            try { rulesObj = JSON.parse(this.comparisonRules || '{}'); } catch (e) { rulesObj = { rules: this.comparisonRules || '' }; }
            const system = PromptBuilder.buildSystemPrompt('comparison', this.contextPrompt);
            const prompt = `${system}You are an expert evaluator assessing whether submitted content meets specified standards and requirements.\n\nEVALUATION CRITERIA/RULES:\n${JSON.stringify(rulesObj, null, 2)}\n\nCONTENT TO EVALUATE:\n${contentToCompare}`;
            const result = await handleRequest({
                recordId: this.effectiveRecordId || null,
                prompt: this.buildPromptWithContext(prompt),
                operation: 'question',
                selectedLLM: this.selectedLLM,
                objectsToQuery: '',
                relatedObjects: '',
                contextPrompt: this.contextPrompt || ''
            });
            this.comparisonResult = result || '';
            this.comparisonResultHtml = this.formatComparisonResult(this.comparisonResult);
            const meets = (this.comparisonResult || '').toUpperCase().includes('MEETS STANDARDS');
            this.comparisonBannerMessage = meets ? 'MEETS' : 'DOES NOT MEET';
            this.showComparisonBanner = true;
        } catch (e) {
            this.showComparisonBanner = true;
            this.comparisonBannerMessage = 'Auto-comparison failed';
        } finally {
            this.comparisonCheckLoading = false;
        }
    }

    // Format comparison result into HTML for rich-text display
    formatComparisonResult(result) {
        if (!result) return '';
        let formatted = result;
        // Bold and italics
        formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
        // Convert bullet lines to lists
        const lines = formatted.split('\n');
        const html = [];
        let inList = false;
        const bulletRegex = /^\s*([\-\*•])\s+(.*)$/;
        for (let raw of lines) {
            const line = raw.trim();
            const m = bulletRegex.exec(line);
            if (m) {
                if (!inList) { html.push('<ul>'); inList = true; }
                html.push(`<li>${m[2]}</li>`);
                continue;
            }
            if (inList && line === '') {
                html.push('</ul>');
                inList = false;
                continue;
            }
            if (line === '') {
                html.push('<br/>');
            } else {
                if (inList) { html.push('</ul>'); inList = false; }
                html.push(`<p>${line}</p>`);
            }
        }
        if (inList) { html.push('</ul>'); }
        return html.join('');
    }

    // ----- Reporting / Charts -----
    handleChartTypeChange(event) {
        this.reportChartType = event.detail.value;
        setTimeout(() => this.renderCurrentChart(), 100);
    }

    handleReportModalClose() {
        this.showReportModal = false;
        this.reportData = null;
        if (this.chartInstance) {
            this.chartInstance.destroy();
            this.chartInstance = null;
        }
    }

    createChartDataFromResponse(aiResponse, userQuestion = '') {
        try {
            const extracted = this.parseAIResponseForData(aiResponse || '');
            if (extracted.length > 0) {
                const colors = ['#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf'];
                const labels = extracted.map(e => e.label);
                const values = extracted.map(e => e.value);
                const bg = values.map((_, i) => colors[i % colors.length]);
                return {
                    totalRecords: values.reduce((a,b)=>a+b,0),
                    records: extracted,
                    chartData: {
                        labels,
                        datasets: [{ data: values, backgroundColor: bg, borderColor: bg, borderWidth: 1 }]
                    },
                    rawResponse: aiResponse,
                    query: userQuestion
                };
            }
            return { totalRecords: 0, records: [], chartData: { labels: [], datasets: [{ data: [], backgroundColor: [], borderColor: [], borderWidth: 1 }] }, rawResponse: aiResponse, query: userQuestion };
        } catch (e) {
            return { totalRecords: 0, records: [], chartData: { labels: [], datasets: [{ data: [], backgroundColor: [], borderColor: [], borderWidth: 1 }] }, rawResponse: aiResponse, query: userQuestion };
        }
    }

    parseAIResponseForData(response) {
        const data = [];
        const strictPattern = /^[\s\-*]*([A-Za-z][A-Za-z\s\d]{0,30}):\s*(\d+)[\s]*$/gm;
        let m;
        while ((m = strictPattern.exec(response)) !== null) {
            const label = m[1].trim();
            const val = parseInt(m[2], 10);
            if (!isNaN(val) && val >= 0 && label.length <= 30) {
                if (!data.find(d => d.label.toLowerCase() === label.toLowerCase())) {
                    data.push({ label, value: val });
                }
            }
        }
        return data.slice(0, 10);
    }

    renderCurrentChart() {
        if (!this.showReportModal || !this.reportData || this.reportChartType === 'table') {
            return;
        }
        const canvas = this.template.querySelector('.chart-canvas');
        if (!canvas || !window.Chart) {
            return;
        }
        if (this.chartInstance) {
            this.chartInstance.destroy();
        }
        const ctx = canvas.getContext('2d');
        const config = {
            type: this.reportChartType,
            data: this.reportData.chartData,
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: this.reportChartType === 'pie' ? 'right' : 'bottom' },
                    datalabels: this.buildDatalabelsOptions()
                },
                scales: this.reportChartType === 'line' ? { y: { beginAtZero: true } } : undefined
            }
        };
        try {
            // global Chart is provided by static resource
            // eslint-disable-next-line no-undef
            this.chartInstance = new Chart(ctx, config);
        } catch (e) {
            this.showError('Chart render error: ' + e.message);
        }
    }

    buildDatalabelsOptions() {
        try {
            if (this.reportChartType === 'pie') {
                return {
                    color: '#333',
                    formatter: (value, ctx) => {
                        const ds = ctx.chart.data.datasets[0].data || [];
                        const total = ds.reduce((a, b) => a + (parseFloat(b) || 0), 0) || 1;
                        const pct = Math.round((value / total) * 100);
                        return `${pct}%`;
                    }
                };
            }
            return {
                color: '#333',
                anchor: 'end',
                align: 'top',
                formatter: (v) => v
            };
        } catch (e) {
            return {};
        }
    }
}
