import { LightningElement, api, track } from 'lwc';

export default class LlmFieldExtractionModal extends LightningElement {
    @api showModal = false;
    @api modalTitle = 'Review Extracted Field Values';
    @api modalDescription = 'Review and select values to update on the record.';
    @api fields = [];

    @track selections = {};

    connectedCallback() {
        this.initializeSelections();
    }

    renderedCallback() {
        // Ensure selections stay in sync if fields prop changes
        this.initializeSelections();
    }

    initializeSelections() {
        if (!this.fields) return;
        const next = {};
        this.fields.forEach(f => {
            // Default selection: keep current or first suggested if empty
            next[f.apiName] = f.selectedValue || (f.currentValue == null ? '__KEEP_CURRENT__' : f.currentValue);
        });
        this.selections = next;
    }

    get fieldsView() {
        if (!this.fields) return [];
        return this.fields.map(f => ({
            ...f,
            selection: this.selections && this.selections[f.apiName] != null
                ? this.selections[f.apiName]
                : (f.selectedValue || (f.currentValue == null ? '__KEEP_CURRENT__' : f.currentValue))
        }));
    }

    get hasFields() {
        return this.fields && this.fields.length > 0;
    }

    handleSelectChange(event) {
        const apiName = event.target.dataset.api;
        const value = event.detail.value;
        this.selections = { ...this.selections, [apiName]: value };
    }

    handleCancel() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    handleConfirm() {
        this.dispatchEvent(new CustomEvent('confirm', {
            detail: {
                selections: this.selections
            }
        }));
    }
}
