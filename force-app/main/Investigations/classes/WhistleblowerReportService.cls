public with sharing class WhistleblowerReportService {

    public WhistleblowerReportService() {
        this.newWhistleblowerReports = new Map<Id, Whistleblower_Report__c>();
        this.oldWhistleblowerReports = new Map<Id, Whistleblower_Report__c>();
    }

    /* Trigger Record Properties */
    private WhistleblowerReportWrapper wbrWrapper; 
    private WhistleblowerReportWrapper oldWhistleblowerReportWrapper;

    public Map<Id, Whistleblower_Report__c> newWhistleblowerReports { get; set; }
    public Map<Id, Whistleblower_Report__c> oldWhistleblowerReports { get; set; }

    public Whistleblower_Report__c getWhistleblowerReport() {
        if (this.wbrWrapper != null) {
            return this.wbrWrapper.wbr;
        }
        return null;
    }

    public Whistleblower_Report__c getOldWhistleblowerReport() {
        if (this.oldWhistleblowerReportWrapper != null) {
            return this.oldWhistleblowerReportWrapper.wbr;
        }
        return null;
    }

    public void setWhistleblowerReport(Whistleblower_Report__c wbr) {
        if (wbr != null) {
            this.wbrWrapper = new WhistleblowerReportWrapper(wbr);
        }
    }

    public void setWhistleblowerReports(Whistleblower_Report__c wbr, Whistleblower_Report__c oldWhistleblowerReport) {
        if (wbr != null) {
            this.wbrWrapper = new WhistleblowerReportWrapper(wbr);
        }
        if (oldWhistleblowerReport != null) {
            this.oldWhistleblowerReportWrapper = new WhistleblowerReportWrapper(oldWhistleblowerReport);
        }
    }

    public void setOldWhistleblowerReports(Whistleblower_Report__c wbr) {
        if (wbr != null) {
            this.oldWhistleblowerReportWrapper = new WhistleblowerReportWrapper(wbr);
        }
    }

    /* lists, sets and maps for processing */
    private List<Id> whistleblowerReportOwnerIdList = new List<Id>();
    private Map<Id, User> whistleblowerReportOwnerMap;

    /* Queries */
    public void queryWhistleblowerReportOwners() {
        if (!this.whistleblowerReportOwnerIdList.isEmpty()) {
            this.whistleblowerReportOwnerMap = new Map<Id, User>([SELECT Id FROM User WHERE id IN :this.whistleblowerReportOwnerIdList]);
        }
    }

    /* Data Collection Methods */
    public void addWhistleblowerReportOwnerId() {
        if (this.wbrWrapper != null && this.wbrWrapper.wbr != null) {
            this.whistleblowerReportOwnerIdList.add(this.wbrWrapper.wbr.OwnerId);
        }
    }

    /* Data Setter Methods */
    public void setBeforeFields() {
        this.setReportSeverity();
    }

    public void setReportSeverity() {
        // if (this.wbrWrapper != null && this.wbrWrapper.wbr != null) {
        //     // severity is required so no null check
        //     this.wbrWrapper.wbr.Status__c = 'Initial Review';
        // }
    }

    public void finish() {
        // finish DML statements for other objects
    }
}