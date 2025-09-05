import { LightningElement, api, wire, track } from 'lwc';
import getIntakeSummary from '@salesforce/apex/Nuvi_Permit_AgencyController.getIntakeSummary';
import createReviewTasks from '@salesforce/apex/Nuvi_Permit_AgencyController.createReviewTasks';

export default class NuviPermitIntakeReview extends LightningElement {
  @api recordId;
  @track summary;

  @wire(getIntakeSummary, { applicationId: '$recordId' })
  wiredSummary({ data }) { if (data) this.summary = data; }

  async completeIntake() {
    const roles = ['Petroleum_Engineer','Wildlife_Biologist','Cultural_Resource_Specialist','Air_Noise_Specialist','NEPA_Coordinator'];
    await createReviewTasks({ req: { applicationId: this.recordId, specialistRoles: roles, slaDays: 14 } });
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => { return; }, 0);
  }
}

