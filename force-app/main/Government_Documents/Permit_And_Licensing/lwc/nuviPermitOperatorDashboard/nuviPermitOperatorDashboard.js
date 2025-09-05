import { LightningElement, wire, track } from 'lwc';
import getMyDashboard from '@salesforce/apex/Nuvi_Permit_OperatorController.getMyDashboard';

export default class NuviPermitOperatorDashboard extends LightningElement {
  @track data;
  columns = [
    { label: 'APD', fieldName: 'name' },
    { label: 'Status', fieldName: 'status' },
    { label: 'Submitted', fieldName: 'submissionDate', type: 'date' }
  ];

  @wire(getMyDashboard)
  wired({ data }) { if (data) this.data = data; }
}

