import { LightningElement, api, track, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import FEE_AMOUNT from '@salesforce/schema/APD_Application__c.Fee_Amount__c';
import processPayment from '@salesforce/apex/Nuvi_Permit_PaymentController.processPayment';

const FIELDS = [FEE_AMOUNT];

export default class NuviPermitPayment extends LightningElement {
  @api recordId;
  @track method = 'Pay.gov';
  @track result;

  @wire(getRecord, { recordId: '$recordId', fields: FIELDS }) apd;

  get amount() {
    return getFieldValue(this.apd.data, FEE_AMOUNT) || 0;
  }

  get amountDisplay() {
    return `$${(this.amount || 0).toFixed(2)}`;
  }

  get methodOptions() {
    return [
      { label: 'Pay.gov', value: 'Pay.gov' },
      { label: 'ACH', value: 'ACH' },
      { label: 'Wire', value: 'Wire' },
      { label: 'Credit Card', value: 'Credit Card' }
    ];
  }

  handleMethod(e) { this.method = e.detail.value; }

  async process() {
    const req = { applicationId: this.recordId, amount: this.amount, currencyCode: 'USD', method: this.method };
    try {
      this.result = await processPayment({ req });
      this.dispatchEvent(new CustomEvent('paymentprocessed', { detail: this.result, bubbles: true, composed: true }));
    } catch (e) {
      this.result = { status: 'ERROR', message: e?.body?.message || e.message };
    }
  }
}