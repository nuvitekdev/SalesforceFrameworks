import { LightningElement, api, wire, track } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import getSLADuration from '@salesforce/apex/WhistleblowerSlaTrackerController.getSLADuration';
import getRecordMetadata from '@salesforce/apex/WhistleblowerSlaTrackerController.getRecordMetadata';

export default class WhistleblowerSlaTracker extends LightningElement {
    @api recordId;
    @api statusFieldName = 'Status__c';
    @api createdDateFieldName = 'CreatedDate';
    @api lastModifiedDateFieldName = 'LastModifiedDate';

    @track timeUntilSLABreach;
    @track slaStatus;
    @track slaDurationHours;
    @track slaDeadline;
    @track whistleblowerData;
    @track objectApiName;

    @wire(getRecordMetadata, { recordId: '$recordId' })
    wiredRecordMetadata({ error, data }) {
        if (data) {
            this.objectApiName = data.objectApiName;
        } else if (error) {
            console.error('Error fetching record metadata:', error);
        }
    }

    @wire(getSLADuration)
    wiredSLADuration({ error, data }) {
        if (data) {
            this.slaDurationHours = data;
            this.calculateSLA();
        } else {
            console.error('Error fetching SLA duration from Apex:', error);
        }
    }

    @wire(getRecord, { recordId: '$recordId', fields: '$dynamicFields' })
    wiredRecord({ error, data }) {
        if (data) {
            this.whistleblowerData = data;
            this.calculateSLA();
        } else {
            console.error('Error fetching record data:', error);
        }
    }

    get dynamicFields() {
        const fields = [
            `${this.objectApiName}.${this.createdDateFieldName}`,
            `${this.objectApiName}.${this.lastModifiedDateFieldName}`,
            `${this.objectApiName}.${this.statusFieldName}`
        ];
        return fields;
    }

    get statusClass() {
        const statusClass = `btn-max-w status ${this.slaStatus ? this.slaStatus.toLowerCase() : ''}`;
        return statusClass;
    }

    startCountdown() {
        if (this.countdownInterval) {
            clearInterval(this.countdownInterval);
        }
    
        // Only start the countdown if the SLA status is not 'Met'
        if (this.slaStatus !== 'Met') {
            this.countdownInterval = setInterval(() => {
                const now = new Date();
    
                if (this.slaStatus === 'Closed') {
                    // If the status is 'Closed', check if the SLA was met or breached
                    const lastModifiedDate = new Date(this.whistleblowerData.fields[this.lastModifiedDateFieldName].value);
                    this.slaStatus = lastModifiedDate <= this.slaDeadline ? 'Met' : 'Breached';
                    this.timeUntilSLABreach = this.formatTimeDifference(lastModifiedDate, this.slaDeadline);
    
                    // Stop the countdown if the SLA was met
                    if (this.slaStatus === 'Met') {
                        clearInterval(this.countdownInterval);
                    }
                } else if (now <= this.slaDeadline) {
                    // If SLA deadline hasn't passed, update the time until SLA breach
                    this.timeUntilSLABreach = this.formatTimeDifference(now, this.slaDeadline);
                } else {
                    // If SLA deadline has passed, set the status to 'Breached'
                    this.timeUntilSLABreach = 'N/A';
                    this.slaStatus = 'Breached';
                    clearInterval(this.countdownInterval);
                }
            }, 1000);
        } else {
            // If the status is already 'Met', calculate the time until SLA breach once and stop the countdown
            const lastModifiedDate = new Date(this.whistleblowerData.fields[this.lastModifiedDateFieldName].value);
            this.timeUntilSLABreach = this.formatTimeDifference(lastModifiedDate, this.slaDeadline);
        }
    }      

    calculateSLA() {
        if (this.whistleblowerData && this.slaDurationHours !== undefined) {
            const createdDateValue = getFieldValue(this.whistleblowerData, `${this.objectApiName}.${this.createdDateFieldName}`);
            const lastModifiedDateValue = getFieldValue(this.whistleblowerData, `${this.objectApiName}.${this.lastModifiedDateFieldName}`);
            const statusValue = getFieldValue(this.whistleblowerData, `${this.objectApiName}.${this.statusFieldName}`);

            this.slaDeadline = new Date(createdDateValue);
            this.slaDeadline.setHours(this.slaDeadline.getHours() + parseInt(this.slaDurationHours));

            if (isNaN(this.slaDeadline)) {
                console.error('Invalid SLA deadline calculated:', this.slaDeadline);
                this.slaStatus = 'Error';
                return;
            }

            switch (statusValue) {
                case 'Closed':
                    // For 'Closed' status, check if the SLA deadline was met
                    this.slaStatus = new Date(lastModifiedDateValue) <= this.slaDeadline ? 'Met' : 'Breached';
                    break;
                default:
                    // For all other statuses, check if the current time is before the SLA deadline
                    this.slaStatus = new Date() <= this.slaDeadline ? 'Active' : 'Breached';
                    break;
            }            

            if (this.slaStatus === 'Active') {
                this.timeUntilSLABreach = this.formatTimeDifference(new Date(), this.slaDeadline);
            } else {
                this.timeUntilSLABreach = 'N/A';
            }
        } else {
            this.slaStatus = 'Loading';
        }

        this.startCountdown();
    }

    formatTimeDifference(startDate, endDate) {
        const diff = endDate - startDate;
        const hours = Math.floor(diff / 3600000);
        const minutes = Math.floor((diff % 3600000) / 60000);
        const seconds = Math.floor((diff % 60000) / 1000);
        const formattedTime = `${hours}h ${minutes}m ${seconds}s`;
        return formattedTime;
    }
}