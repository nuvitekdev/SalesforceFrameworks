import { LightningElement, wire, track } from 'lwc';
import getExecutiveKPIs from '@salesforce/apex/Nuvi_Permit_WorkspaceController.getExecutiveKPIs';
import getBottlenecks from '@salesforce/apex/Nuvi_Permit_WorkspaceController.getBottlenecks';
import getByFieldOffice from '@salesforce/apex/Nuvi_Permit_WorkspaceController.getByFieldOffice';

export default class NuviPermitExecutivePanel extends LightningElement {
  @track kpis;
  @track bottlenecks = [];
  @track offices = [];

  bottleneckColumns = [
    { label: 'Task Type', fieldName: 'taskType' },
    { label: 'Avg Age (days)', fieldName: 'avgAgeDays', type: 'number' },
    { label: 'Open Count', fieldName: 'count', type: 'number' }
  ];

  officeColumns = [
    { label: 'Field Office', fieldName: 'officeName' },
    { label: 'Total', fieldName: 'total', type: 'number' },
    { label: 'Approved', fieldName: 'approved', type: 'number' },
    { label: 'Avg TTD (days)', fieldName: 'avgTTD', type: 'number' }
  ];

  @wire(getExecutiveKPIs) wiredKpis({ data }) { if (data) this.kpis = data; }
  @wire(getBottlenecks) wiredBottlenecks({ data }) { if (data) this.bottlenecks = data; }
  @wire(getByFieldOffice) wiredOffices({ data }) { if (data) this.offices = data; }

  get avgTtdDisplay() { return (this.kpis && this.kpis.avgTTD != null) ? `${Math.round(this.kpis.avgTTD)} days` : '—'; }
  get approvalRateDisplay() { return (this.kpis && this.kpis.approvalRate != null) ? `${Math.round(this.kpis.approvalRate)}%` : '—'; }
}