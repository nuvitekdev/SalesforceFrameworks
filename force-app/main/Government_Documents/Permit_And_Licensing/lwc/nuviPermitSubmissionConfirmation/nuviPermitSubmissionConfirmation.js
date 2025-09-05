import { LightningElement, api, wire, track } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import NAME from '@salesforce/schema/APD_Application__c.Name';
import getLatestPayment from '@salesforce/apex/Nuvi_Permit_PaymentController.getLatestPayment';
import { NavigationMixin } from 'lightning/navigation';

const FIELDS = [NAME];

export default class NuviPermitSubmissionConfirmation extends NavigationMixin(LightningElement) {
  @api recordId;
  @track payment;
  @wire(getRecord, { recordId: '$recordId', fields: FIELDS }) apd;

  get apdName() { return getFieldValue(this.apd.data, NAME); }

  @wire(getLatestPayment, { applicationId: '$recordId' })
  wiredPayment({ data }) { if (data) this.payment = data; }

  openRecord() {
    this[NavigationMixin.Navigate]({
      type: 'standard__recordPage',
      attributes: { recordId: this.recordId, objectApiName: 'APD_Application__c', actionName: 'view' }
    });
  }
}

