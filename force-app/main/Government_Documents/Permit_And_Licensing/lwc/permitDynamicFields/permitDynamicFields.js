import { LightningElement, api } from 'lwc';

export default class PermitDynamicFields extends LightningElement {
    @api fields = [];
    @api formData = {};

    get normalizedFields() {
        return (this.fields || []).map((f) => {
            const t = (f.type || 'text').toLowerCase();
            const isPicklist = t === 'picklist' || t === 'select';
            const inputType = ['text','email','tel','number','date','checkbox','url','time','search','password'].includes(t)
                ? t
                : 'text';
            const optionsNormalized = (f.options || []).map((v) => ({ label: v, value: v }));
            const value = this.formData ? this.formData[f.name] : undefined;
            return {
                ...f,
                isPicklist,
                inputType,
                optionsNormalized,
                value,
            };
        });
    }

    handleChange(event) {
        const name = event.currentTarget.dataset.name;
        let value;
        if (event.target.type === 'checkbox') {
            value = event.target.checked;
        } else {
            value = event.target.value;
        }
        this.dispatchEvent(new CustomEvent('fieldchange', { detail: { name, value } }));
    }
}
