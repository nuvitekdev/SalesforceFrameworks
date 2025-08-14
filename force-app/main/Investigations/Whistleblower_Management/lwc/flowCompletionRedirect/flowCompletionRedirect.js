import { LightningElement, api, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";

export default class RecordRedirect extends NavigationMixin(LightningElement) {
  @api recordId; // Public property to receive the record ID

  connectedCallback() {
    this.navigateToRecordPage();
  }

  navigateToRecordPage() {
    // Check if recordId is available

    if (this.recordId) {
      this[NavigationMixin.Navigate]({
        type: "standard__recordPage",
        attributes: {
          recordId: this.recordId, // Pass the record Id
          objectApiName: "Whistleblower_Report__c", // Replace with the correct object API name
          actionName: "view" // Specify the action (view, edit, etc.)
        }
      });
    }
  }
}
