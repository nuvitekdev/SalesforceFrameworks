import { LightningElement, api, track } from 'lwc';

export default class NuviPermitPrecheckWizard extends LightningElement {
  @api recordId;
  @track leaseNumber = '';
  @track surfaceAgreement = '';
  @track surfaceType = '';
  @track bondType = '';
  @track bondNumber = '';
  @track messages = [];

  get surfaceTypeOptions() {
    return [
      { label: 'Federal', value: 'FEDERAL' },
      { label: 'State', value: 'STATE' },
      { label: 'Private', value: 'PRIVATE' },
      { label: 'Tribal', value: 'TRIBAL' }
    ];
  }

  get bondTypeOptions() {
    return [
      { label: 'Individual', value: 'INDIVIDUAL' },
      { label: 'Statewide', value: 'STATEWIDE' },
      { label: 'Nationwide', value: 'NATIONWIDE' }
    ];
  }

  handleLeaseChange(e) { this.leaseNumber = e.detail.value; }
  handleSurfaceChange(e) { this.surfaceAgreement = e.detail.value; }
  handleSurfaceType(e) { this.surfaceType = e.detail.value; }
  handleBondType(e) { this.bondType = e.detail.value; }
  handleBondNumber(e) { this.bondNumber = e.detail.value; }

  verifyLease() {
    this.messages = [...this.messages, `Lease ${this.leaseNumber || '(none)'} verified (demo).`];
  }
  verifyBond() {
    this.messages = [...this.messages, `Bond ${this.bondNumber || '(none)'} valid (demo).`];
  }
  handleContinue() {
    this.dispatchEvent(new CustomEvent('precheckcomplete', { detail: {
      leaseNumber: this.leaseNumber,
      surfaceType: this.surfaceType,
      surfaceAgreement: this.surfaceAgreement,
      bondType: this.bondType,
      bondNumber: this.bondNumber
    }, bubbles: true, composed: true }));
  }
}