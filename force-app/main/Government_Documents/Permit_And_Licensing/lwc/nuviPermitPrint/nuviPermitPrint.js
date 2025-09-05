import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import { loadScript } from 'lightning/platformResourceLoader';
import PDF_LIB from '@salesforce/resourceUrl/pdf_lib';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import APD_NAME from '@salesforce/schema/APD_Application__c.Name';
import APD_STATUS from '@salesforce/schema/APD_Application__c.Status__c';
import APD_OPERATOR from '@salesforce/schema/APD_Application__c.Operator__c';
import APD_DECISION_DATE from '@salesforce/schema/APD_Application__c.Decision_Date__c';
import uploadPermitFile from '@salesforce/apex/Nuvi_Permit_DocumentController.uploadPermitFile';

function base64ArrayBuffer(bytes) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, chunk);
  }
  return window.btoa(binary);
}

export default class NuviPermitPrint extends NavigationMixin(LightningElement) {
  @api recordId;
  @api agencyType = 'FEDERAL';
  @api permitType = 'DRILLING';
  @api primaryColor = '#22BDC1';
  @api accentColor = '#D5DF23';
  @api defaultFolder = 'Application_Documents';
  @api showInlineSigner = false;

  @track isGenerating = false;
  @track isSaving = false;
  @track pdfUrl;
  @track pdfBytes;
  @track targetFolder;
  @track certificateTitle = 'Permit Certification';
  @track fileName;

  pdfLibLoaded = false;
  PDFLib;

  @wire(getRecord, { recordId: '$recordId', fields: [APD_NAME, APD_STATUS, APD_OPERATOR, APD_DECISION_DATE] })
  apd;

  connectedCallback() {
    this.targetFolder = this.defaultFolder || 'Application_Documents';
    const today = new Date().toISOString().slice(0, 10);
    this.fileName = `Permit_Certificate_${today}.pdf`;
  }

  renderedCallback() {
    if (this.pdfLibLoaded) return;
    this.pdfLibLoaded = true;
    loadScript(this, PDF_LIB)
      .then(() => {
        this.PDFLib = window.PDFLib;
      })
      .catch((e) => {
        this.showToast('Error', 'Failed to load PDF library', 'error');
        this.pdfLibLoaded = false;
      });
  }

  get folderOptions() {
    return [
      { label: 'Application_Documents', value: 'Application_Documents' },
      { label: 'Signed_Documents', value: 'Signed_Documents' },
      { label: 'Regulatory_Correspondence', value: 'Regulatory_Correspondence' }
    ];
  }

  handleTitleChange(e) { this.certificateTitle = e.detail.value; }
  handleFolderChange(e) { this.targetFolder = e.detail.value; }
  handleFileNameChange(e) { this.fileName = e.detail.value; }

  async generatePdf() {
    if (!this.PDFLib) { this.showToast('Error', 'PDF library not ready', 'error'); return; }
    this.isGenerating = true;
    try {
      const { PDFDocument, StandardFonts, rgb } = this.PDFLib;
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage([612, 792]);
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const margin = 50;
      const width = page.getWidth();
      const yStart = page.getHeight() - margin;
      page.drawText(this.certificateTitle || 'Permit Certification', { x: margin, y: yStart, size: 20, font: bold, color: rgb(0.13, 0.74, 0.76) });
      const apdData = this.apd && this.apd.data ? this.apd.data : null;
      const apdName = (apdData && getFieldValue(apdData, APD_NAME)) || this.recordId || '';
      const status = (apdData && getFieldValue(apdData, APD_STATUS)) || '-';
      const operator = (apdData && getFieldValue(apdData, APD_OPERATOR)) || '-';
      const decision = (apdData && getFieldValue(apdData, APD_DECISION_DATE)) || '';
      const lines = [
        `Application: ${apdName}`,
        `Operator: ${operator}`,
        `Status: ${status}`,
        `Decision Date: ${decision}`,
        `Generated On: ${new Date().toLocaleString()}`
      ];
      let y = yStart - 40;
      lines.forEach((text) => { page.drawText(text, { x: margin, y, size: 12, font, color: rgb(0.11, 0.11, 0.12) }); y -= 18; });
      page.drawLine({ start: { x: margin, y: y - 8 }, end: { x: width - margin, y: y - 8 }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
      y -= 30;
      const certText = 'This certificate confirms the permit conditions and approvals as processed through the official workflow. By signing, the undersigned acknowledges the terms and conditions associated with this permit.';
      const textWidth = width - margin * 2;
      const words = certText.split(' ');
      let line = '';
      const linesOut = [];
      for (const w of words) { const testLine = line ? `${line} ${w}` : w; const size = font.widthOfTextAtSize(testLine, 12); if (size > textWidth) { linesOut.push(line); line = w; } else { line = testLine; } }
      if (line) linesOut.push(line);
      linesOut.forEach((l) => { page.drawText(l, { x: margin, y, size: 12, font, color: rgb(0.11, 0.11, 0.12) }); y -= 16; });
      y -= 30;
      page.drawText('Signature:', { x: margin, y, size: 12, font: bold, color: rgb(0.11, 0.11, 0.12) });
      page.drawRectangle({ x: margin + 80, y: y - 5, width: 300, height: 40, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 1 });
      y -= 60;
      page.drawText('Date:', { x: margin, y, size: 12, font: bold, color: rgb(0.11, 0.11, 0.12) });
      page.drawRectangle({ x: margin + 80, y: y - 5, width: 150, height: 25, borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 1 });
      const bytes = await pdfDoc.save();
      this.pdfBytes = bytes;
      const blob = new Blob([bytes], { type: 'application/pdf' });
      this.pdfUrl = URL.createObjectURL(blob);
      this.showToast('Success', 'Certificate generated', 'success');
    } catch (e) {
      console.error(e);
      this.showToast('Error', 'Could not generate PDF', 'error');
    } finally { this.isGenerating = false; }
  }

  downloadPdf() { if (!this.pdfBytes) return; const blob = new Blob([this.pdfBytes], { type: 'application/pdf' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = this.fileName || 'Permit_Certificate.pdf'; a.click(); URL.revokeObjectURL(url); }

  async saveToRecord() {
    if (!this.pdfBytes) { this.showToast('Error', 'Generate the PDF first', 'error'); return; }
    this.isSaving = true;
    try {
      const b64 = base64ArrayBuffer(new Uint8Array(this.pdfBytes));
      const fileName = (this.fileName || 'Permit_Certificate.pdf').replace(/\s+/g, '_');
      const result = await uploadPermitFile({ applicationId: this.recordId, folderName: this.targetFolder || 'Application_Documents', fileName, base64Data: b64, contentType: 'application/pdf', documentType: 'PERMIT_CERTIFICATE', workflowStage: 'Final Approval', agencyType: this.agencyType, permitType: this.permitType });
      this.showToast('Saved', 'Certificate saved to record', 'success');
      const signer = this.template.querySelector('c-pdf-signer');
      const cvId = result && (result.contentVersionId || result.contentversionid || result.content_version_id);
      if (signer && cvId) { try { await signer.loadPdfByContentVersionId(cvId, fileName); } catch (e) { console.error('Failed to preload signer inline', e); } }
      if (cvId) { this.dispatchEvent(new CustomEvent('certificategenerated', { detail: { contentVersionId: cvId, fileName }, bubbles: true, composed: true })); }
    } catch (e) { console.error(e); const msg = e?.body?.message || e.message || 'Failed to save file'; this.showToast('Error', msg, 'error'); }
    finally { this.isSaving = false; }
  }

  navigateToSigner() { this[NavigationMixin.Navigate]({ type: 'standard__recordPage', attributes: { recordId: this.recordId, objectApiName: 'APD_Application__c', actionName: 'view' } }); }
  showToast(title, message, variant) { this.dispatchEvent(new ShowToastEvent({ title, message, variant })); }
}