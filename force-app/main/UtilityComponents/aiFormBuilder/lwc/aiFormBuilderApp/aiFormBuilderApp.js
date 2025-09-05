import { LightningElement, track, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import createTemplateApex from '@salesforce/apex/FormBuilderController.createTemplate';
import updateLatestUploadInfo from '@salesforce/apex/FormBuilderController.updateLatestUploadInfo';
import runFormExtraction from '@salesforce/apex/FormAIService.runFormExtraction';
import saveReviewedFields from '@salesforce/apex/FormBuilderController.saveReviewedFields';
import publishTemplate from '@salesforce/apex/FormBuilderController.publishTemplate';
import deleteTemplate from '@salesforce/apex/FormBuilderController.deleteTemplate';
import LightningConfirm from 'lightning/confirm';
import getTemplateInfo from '@salesforce/apex/FormBuilderController.getTemplateInfo';

export default class AiFormBuilderApp extends NavigationMixin(LightningElement) {
    name = '';
    _templateId;
    previewUrl;
    processing = false;
    @track fields = [];
    showPreview = false;
    tInfo;
    @track diag;

    get disableCreate() { return !this.name || this.name.trim().length < 3; }
    get typeOptions() { return ['Text','TextArea','Number','Date','DateTime','Checkbox','Radio','Picklist','MultiPicklist','Signature']; }
    get disablePreview() { return !this._templateId; }
    get disableOpenFile() { return !(this.tInfo && this.tInfo.contentDocumentId); }

    onName(e) { this.name = e.target.value; }

    @api
    get templateId() {
        return this._templateId;
    }
    set templateId(v) {
        this._templateId = v;
        if (v) {
            // fetch preview and reset state for existing template
            this.loadTemplateInfo(v);
            this.fields = [];
        }
    }

    async loadTemplateInfo(id){
        try {
            const info = await getTemplateInfo({ templateId: id });
            this.previewUrl = info.previewUrl;
            this.tInfo = info;
        } catch (e) {
            // ignore if not available
        }
    }

    async createTemplate() {
        try {
            const id = await createTemplateApex({ name: this.name });
            this._templateId = id;
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Create Template Failed',
                message: e.body ? e.body.message : e.message,
                variant: 'error'
            }));
        }
    }

    async onUploadFinished() {
        await this.refreshFile();
    }

    async refreshFile() {
        try {
            const info = await updateLatestUploadInfo({ templateId: this._templateId });
            this.previewUrl = info.previewUrl;
            this.tInfo = info;
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Refresh Failed',
                message: e.body ? e.body.message : e.message,
                variant: 'error'
            }));
        }
    }

    async runExtraction() {
        if (!this._templateId) return;
        this.processing = true;
        try {
            const res = await runFormExtraction({ templateId: this._templateId });
            // Debug logs similar to nuviAI diagnostics
            const diag = {
                serviceUsed: res?.serviceUsed,
                provider: res?.provider,
                modelName: res?.modelName,
                configName: res?.configName,
                configActive: res?.configActive,
                hasApiKey: res?.hasApiKey,
                baseUrl: res?.baseUrl,
                attachmentCount: res?.attachmentCount,
                fileType: res?.fileType,
                versionId: res?.versionId,
                httpStatus: res?.httpStatus,
                fallbackReason: res?.fallbackReason
            };
            // eslint-disable-next-line no-console
            console.group('AI Extraction Diagnostics');
            // eslint-disable-next-line no-console
            console.log('Diagnostics:', JSON.stringify(diag, null, 2));
            // eslint-disable-next-line no-console
            console.groupEnd();
            this.diag = diag;
            this.dispatchEvent(new ShowToastEvent({
                title: 'AI Extraction',
                message: `Service: ${diag.serviceUsed || 'Unknown'} | Model: ${diag.modelName || ''}${diag.fallbackReason ? ' | Fallback: ' + diag.fallbackReason : ''}`,
                variant: diag.serviceUsed && diag.serviceUsed.startsWith('OpenAI') ? 'success' : 'warning'
            }));
            // Bubble diagnostics up to workspace so it can show at the top
            this.dispatchEvent(new CustomEvent('diagnostics', { detail: diag, bubbles: true, composed: true }));
            this.fields = (res && res.fields) ? res.fields.map((f, i) => ({ key: i, ...f })) : [];
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'AI Extraction Failed',
                message: e.body ? e.body.message : e.message,
                variant: 'error'
            }));
        } finally {
            this.processing = false;
        }
    }

    onFieldChange(e) {
        const idx = parseInt(e.target.dataset.idx, 10);
        const key = e.target.dataset.key;
        const val = e.target.value;
        this.fields = this.fields.map((f, i) => i === idx ? { ...f, [key]: val } : f);
    }
    onFieldBool(e) {
        const idx = parseInt(e.target.dataset.idx, 10);
        const key = e.target.dataset.key;
        const val = e.target.checked;
        this.fields = this.fields.map((f, i) => i === idx ? { ...f, [key]: val } : f);
    }

    async saveReviewed() {
        try {
            const json = JSON.stringify(this.fields.map(({key, ...rest}) => rest));
            await saveReviewedFields({ templateId: this._templateId, fieldsJson: json });
            this.dispatchEvent(new ShowToastEvent({
                title: 'Saved',
                message: 'Reviewed fields saved successfully',
                variant: 'success'
            }));
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Save Failed',
                message: e.body ? e.body.message : e.message,
                variant: 'error'
            }));
        }
    }

    async publish() {
        try {
            await publishTemplate({ templateId: this._templateId });
            this.dispatchEvent(new ShowToastEvent({
                title: 'Published',
                message: 'Template published successfully',
                variant: 'success'
            }));
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Publish Failed',
                message: e.body ? e.body.message : e.message,
                variant: 'error'
            }));
        }
    }

    openPreview() { this.showPreview = true; }
    closePreview() { this.showPreview = false; }

    openFile() {
        const docId = this.tInfo && this.tInfo.contentDocumentId;
        if (!docId) return;
        // Open native file preview overlay
        this[NavigationMixin.Navigate]({
            type: 'standard__namedPage',
            attributes: { pageName: 'filePreview' },
            state: { selectedRecordId: docId }
        });
    }

    async handleDeleteTemplate() {
        if (!this._templateId) return;
        let ok = false;
        try {
            ok = await LightningConfirm.open({
                message: 'Delete this template? This will also remove its field definitions.',
                label: 'Delete Template',
                theme: 'warning'
            });
        } catch (e) {
            // eslint-disable-next-line no-alert
            ok = confirm('Delete this template? This will also remove its field definitions.');
        }
        if (!ok) return;

        try {
            await deleteTemplate({ templateId: this._templateId });
            this.dispatchEvent(new ShowToastEvent({ title: 'Deleted', message: 'Template deleted', variant: 'success' }));
            const deletedId = this._templateId;
            // clear local state
            this._templateId = null;
            this.fields = [];
            this.tInfo = undefined;
            this.previewUrl = undefined;
            this.showPreview = false;
            // notify parent workspace and list
            this.dispatchEvent(new CustomEvent('deleted', { detail: { id: deletedId }, bubbles: true, composed: true }));
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Delete Failed', message: e.body ? e.body.message : e.message, variant: 'error' }));
        }
    }
}
