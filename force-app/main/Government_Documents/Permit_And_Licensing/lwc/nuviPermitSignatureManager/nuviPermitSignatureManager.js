import { LightningElement, api } from 'lwc';

export default class NuviPermitSignatureManager extends LightningElement {
  @api recordId;
  @api primaryColor = '#22BDC1';
  @api accentColor = '#D5DF23';

  // Handle certificate generated event from permitPrint
  handleCertificateGenerated(event) {
    const { contentVersionId, fileName } = event.detail || {};
    const signer = this.template.querySelector('c-pdf-signer');
    if (signer && contentVersionId) {
      try {
        signer.loadPdfByContentVersionId(contentVersionId, fileName || 'Permit_Certificate.pdf');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error('Failed to load certificate into signer', e);
      }
    }
  }
}
