import { LightningElement, api, track } from 'lwc';
import createReviewTasks from '@salesforce/apex/Nuvi_Permit_AgencyController.createReviewTasks';

export default class NuviPermitReviewAssignment extends LightningElement {
  @api recordId;
  @track selectedRoles = ['Petroleum_Engineer','Wildlife_Biologist','Cultural_Resource_Specialist','Air_Noise_Specialist','NEPA_Coordinator'];
  @track slaDays = 14;

  get roleOptions() {
    return [
      { label: 'Petroleum Engineer', value: 'Petroleum_Engineer' },
      { label: 'Wildlife Biologist', value: 'Wildlife_Biologist' },
      { label: 'Cultural Resource Specialist', value: 'Cultural_Resource_Specialist' },
      { label: 'Air/Noise Specialist', value: 'Air_Noise_Specialist' },
      { label: 'NEPA Coordinator', value: 'NEPA_Coordinator' }
    ];
  }

  handleRoles(e) { this.selectedRoles = e.detail.value; }
  handleSla(e) { this.slaDays = parseInt(e.detail.value, 10) || 14; }

  async createTasks() {
    await createReviewTasks({ req: { applicationId: this.recordId, specialistRoles: this.selectedRoles, slaDays: this.slaDays } });
  }
}

