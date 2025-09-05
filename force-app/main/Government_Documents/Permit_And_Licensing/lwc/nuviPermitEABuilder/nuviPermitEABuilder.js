import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { loadScript } from 'lightning/platformResourceLoader';
import PDF_LIB from '@salesforce/resourceUrl/pdf_lib';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import APD_NAME from '@salesforce/schema/APD_Application__c.Name';
import APD_OPERATOR from '@salesforce/schema/APD_Application__c.Operator__c';
import uploadPermitFile from '@salesforce/apex/Nuvi_Permit_DocumentController.uploadPermitFile';
import createReviewTasks from '@salesforce/apex/Nuvi_Permit_AgencyController.createReviewTasks';

const APD_FIELDS = [APD_NAME, APD_OPERATOR];

export default class NuviPermitEABuilder extends LightningElement {
  @api recordId;
  @track nepaLevel = 'Environmental Assessment (EA)';
  @track purpose = '';
  @track proposed = '';
  @track impacts = '';
  @track mitigations = '';
  @track consultation = '';
  @track pdfUrl;
  @track isSaving = false;
  libLoaded = false;
  PDFLib;

  @wire(getRecord, { recordId: '$recordId', fields: APD_FIELDS }) apd;

  get nepaOptions() {
    return [
      { label: 'Categorical Exclusion (CX)', value: 'Categorical Exclusion (CX)' },
      { label: 'Environmental Assessment (EA)', value: 'Environmental Assessment (EA)' },
      { label: 'Environmental Impact Statement (EIS)', value: 'Environmental Impact Statement (EIS)' }
    ];
  }

  renderedCallback() {
    if (this.libLoaded) return;
    this.libLoaded = true;
    loadScript(this, PDF_LIB).then(() => { this.PDFLib = window.PDFLib; }).catch(() => { this.libLoaded = false; });
  }

  handleNepa(e) { this.nepaLevel = e.detail.value; }
  handlePurpose(e) { this.purpose = e.detail.value; }
  handleProposed(e) { this.proposed = e.detail.value; }
  handleImpacts(e) { this.impacts = e.detail.value; }
  handleMitigations(e) { this.mitigations = e.detail.value; }
  handleConsultation(e) { this.consultation = e.detail.value; }

  importFromApd() {
    const name = getFieldValue(this.apd.data, APD_NAME) || '';
    const op = getFieldValue(this.apd.data, APD_OPERATOR) || '';
    if (!this.purpose) this.purpose = `The purpose of the proposed action is to evaluate the APD ${name} by ${op}.`;
    if (!this.proposed) this.proposed = `The proposed action is to drill and complete the ${name} well in accordance with submitted plans.`;
    this.toast('Imported', 'Imported basic details from APD', 'success');
  }

  importFromSpecialists() {
    if (!this.impacts) this.impacts = 'Impacts summary compiled from specialist reviews (demo placeholder).';
    if (!this.mitigations) this.mitigations = 'Mitigations compiled from COAs and specialist recommendations (demo placeholder).';
    this.toast('Imported', 'Imported summaries from specialists (demo).', 'success');
  }

  aiSuggest() {
    if (!this.consultation) this.consultation = 'Consultation conducted with NPS, BIA, and state agencies; responses incorporated (demo).';
    this.toast('AI Suggest', 'AI added draft text (demo).', 'info');
  }

  async previewPdf() {
    if (!this.PDFLib) { this.toast('Error','PDF library not ready','error'); return; }
    try {
      const { PDFDocument, StandardFonts, rgb } = this.PDFLib;
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const page = pdfDoc.addPage([612, 792]);
      let y = 760; const m = 40;
      const drawH = (t)=>{ page.drawText(t,{x:m,y, size:14, font:bold}); y-=18; };
      const drawP = (t)=>{ const w=612-(m*2); const words=(t||'').split(' '); let line=''; for(const w1 of words){const tl=line?`${line} ${w1}`:w1; const s=font.widthOfTextAtSize(tl,11); if(s>w){ page.drawText(line,{x:m,y,size:11,font}); y-=14; line=w1; } else line=tl; } if(line){ page.drawText(line,{x:m,y,size:11,font}); y-=14; } y-=6; };
      const name = getFieldValue(this.apd.data, APD_NAME) || '';
      page.drawText(`EA for ${name}`,{x:m,y, size:16, font:bold, color:rgb(0.13,0.74,0.76)}); y-=24;
      drawH(`NEPA Level: ${this.nepaLevel}`); y-=6;
      drawH('1. Purpose and Need'); drawP(this.purpose);
      drawH('2. Proposed Action'); drawP(this.proposed);
      drawH('3. Environmental Impacts'); drawP(this.impacts);
      drawH('4. Mitigation Measures'); drawP(this.mitigations);
      drawH('5. Consultation & Coordination'); drawP(this.consultation);
      const bytes = await pdfDoc.save();
      const blob = new Blob([bytes],{type:'application/pdf'});
      this.pdfUrl = URL.createObjectURL(blob);
    } catch(e) { this.toast('Error', 'Failed to render PDF', 'error'); }
  }

  async saveDraft() {
    if (!this.pdfUrl) await this.previewPdf();
    this.isSaving = true;
    try {
      const b = await fetch(this.pdfUrl).then(r=>r.arrayBuffer());
      const b64 = this.arrayBufferToBase64(b);
      await uploadPermitFile({
        applicationId: this.recordId,
        folderName: 'Environmental_Documents/NEPA_Documents',
        fileName: 'EA_Draft.pdf',
        base64Data: b64,
        contentType: 'application/pdf',
        documentType: 'EA_DRAFT',
        workflowStage: 'Environmental Review',
        agencyType: 'DOI',
        permitType: 'DRILLING'
      });
      this.toast('Saved', 'EA draft saved to record', 'success');
    } catch(e) { this.toast('Error','Failed to save draft','error'); }
    finally { this.isSaving = false; }
  }

  async submitForReview() {
    await this.saveDraft();
    try {
      await createReviewTasks({ req: { applicationId: this.recordId, specialistRoles: ['NEPA_Coordinator'], slaDays: 7 } });
      this.toast('Submitted', 'EA submitted for internal review', 'success');
    } catch(e) { this.toast('Error','Failed to submit for review','error'); }
  }

  arrayBufferToBase64(buffer) { let binary=''; const bytes=new Uint8Array(buffer); for(let i=0;i<bytes.length;i++) binary+=String.fromCharCode(bytes[i]); return btoa(binary); }
  toast(title, message, variant) { this.dispatchEvent(new ShowToastEvent({ title, message, variant })); }
}

