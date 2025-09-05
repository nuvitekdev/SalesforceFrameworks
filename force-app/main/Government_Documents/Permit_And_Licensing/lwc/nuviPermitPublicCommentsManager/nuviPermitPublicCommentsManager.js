import { LightningElement, api, wire, track } from 'lwc';
import listPublicComments from '@salesforce/apex/Nuvi_Permit_AgencyController.listPublicComments';
import addPublicComment from '@salesforce/apex/Nuvi_Permit_AgencyController.addPublicComment';

export default class NuviPermitPublicCommentsManager extends LightningElement {
  @api recordId;
  @track commenterName = '';
  @track sentiment = 'Neutral';
  @track text = '';
  @track comments = [];

  columns = [
    { label: 'Date', fieldName: 'createdDate', type: 'date' },
    { label: 'Name', fieldName: 'commenterName' },
    { label: 'Sentiment', fieldName: 'sentiment' },
    { label: 'Requires Response', fieldName: 'requiresResponse', type: 'boolean' },
    { label: 'Comment', fieldName: 'text' }
  ];

  get sentimentOptions() {
    return [
      { label: 'Support', value: 'Support' },
      { label: 'Oppose', value: 'Oppose' },
      { label: 'Neutral', value: 'Neutral' }
    ];
  }

  @wire(listPublicComments, { applicationId: '$recordId' })
  wiredComments({ data, error }) {
    if (data) this.comments = data;
    if (error) console.error(error);
  }

  handleName(e) { this.commenterName = e.detail.value; }
  handleSentiment(e) { this.sentiment = e.detail.value; }
  handleText(e) { this.text = e.detail.value; }

  async addComment() {
    await addPublicComment({ input: { applicationId: this.recordId, commenterName: this.commenterName, text: this.text, sentiment: this.sentiment } });
    this.text = '';
    // eslint-disable-next-line @lwc/lwc/no-async-operation
    setTimeout(() => { return; }, 0);
  }
}