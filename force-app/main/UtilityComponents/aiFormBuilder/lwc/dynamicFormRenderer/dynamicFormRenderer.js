import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getFieldDefinitions from '@salesforce/apex/FormResponseController.getFieldDefinitions';
import saveResponse from '@salesforce/apex/FormResponseController.saveResponse';

export default class DynamicFormRenderer extends LightningElement {
    @api templateId;
    @track fields = [];

    connectedCallback() {
        this.load();
    }
    async load() {
        if (!this.templateId) return;
        const result = await getFieldDefinitions({ templateId: this.templateId });
        this.fields = (result || []).map(f => {
            let opts = [];
            try { opts = JSON.parse(f.Options_JSON__c || '[]').map(v => ({ label: v, value: v })); } catch(e) {}
            const type = f.Field_Type__c;
            return {
                ...f,
                _options: opts,
                _isText: type === 'Text',
                _isTextArea: type === 'TextArea',
                _isNumber: type === 'Number',
                _isDate: type === 'Date',
                _isDateTime: type === 'DateTime',
                _isCheckbox: type === 'Checkbox',
                _isPicklist: type === 'Picklist' || type === 'MultiPicklist'
            };
        });
    }

    get grouped() {
        const map = new Map();
        this.fields.forEach(f => {
            const key = f.Section_Name__c || '';
            if (!map.has(key)) map.set(key, []);
            map.get(key).push(f);
        });
        return Array.from(map.entries()).map(([key, items]) => ({ key, items }));
    }

    // booleans are prepared in load()

    // options prepared in load()

    async submit() {
        const inputs = this.template.querySelectorAll('[data-id]');
        const data = {};
        inputs.forEach(el => {
            const id = el.dataset.id;
            if (el.type === 'checkbox') {
                data[id] = el.checked;
            } else if (el.options) {
                const combobox = el;
                data[id] = combobox.value;
            } else {
                data[id] = el.value;
            }
        });
        try {
            await saveResponse({ templateId: this.templateId, submittedJson: JSON.stringify(data) });
            this.dispatchEvent(new ShowToastEvent({
                title: 'Submitted',
                message: 'Form response saved',
                variant: 'success'
            }));
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Submit Failed',
                message: e.body ? e.body.message : e.message,
                variant: 'error'
            }));
        }
    }
}
