import { LightningElement, api, wire, track } from 'lwc';
import listDocuments from '@salesforce/apex/Nuvi_Permit_AgencyController.listDocuments';

export default class NuviPermitSpecialistReviewPanel extends LightningElement {
  @api recordId;
  @track docs = [];
  columns = [
    { label: 'Title', fieldName: 'title' },
    { label: 'Type', fieldName: 'type' },
    { label: 'Status', fieldName: 'status' },
    { label: 'AI', fieldName: 'aiStatus' }
  ];

  @wire(listDocuments, { applicationId: '$recordId' })
  wiredDocs({ data }) { if (data) this.docs = data; }
}

