public with sharing class WhistleblowerReportTriggerHandler implements TriggerHandler {
    public WhistleblowerReportTriggerHandler() {}

    /* Before Insert */
    public void beforeInsert(List<sObject> newSObjects) {}
    
    /* After Insert */
    public void afterInsert(Map<Id, sObject> newSObjects) {}

    /* Before Update */
    public void beforeUpdate(Map<Id, sObject> newSObjects, Map<Id, sObject> oldSObjects) {
        
        Map<Id, Whistleblower_Report__c> newWhistleblowerReports = ( Map<Id, Whistleblower_Report__c>)newSObjects;
        Map<Id, Whistleblower_Report__c> oldWhistleblowerReports = ( Map<Id, Whistleblower_Report__c>)oldSObjects;

        WhistleblowerReportService service = new WhistleblowerReportService();

        service.newWhistleblowerReports = newWhistleblowerReports;
        service.oldWhistleblowerReports = oldWhistleblowerReports;
        
        // Pre-processing
        for(Whistleblower_Report__c wbr : newWhistleblowerReports.values()) {
            service.setWhistleblowerReport(wbr);
            service.addWhistleblowerReportOwnerId();
        }
    
        // Post-processing queries (related data)
        service.queryWhistleBlowerReportOwners();

        // Data processing (record updates)
        for(Whistleblower_Report__c wbr : newWhistleblowerReports.values()) {
            service.setBeforeFields();
        }
    }

    /* After Update */
    public void afterUpdate(Map<Id, sObject> newSObjects, Map<Id, sObject> oldSObjects) {

        Map<Id, Whistleblower_Report__c> newWhistleblowerReports = (Map<Id, Whistleblower_Report__c>)newSObjects;
        Map<Id, Whistleblower_Report__c> oldWhistleblowerReports = (Map<Id, Whistleblower_Report__c>)oldSObjects;

        WhistleblowerReportService service = new WhistleblowerReportService();
        
        service.newWhistleblowerReports = newWhistleblowerReports;
        service.oldWhistleblowerReports = oldWhistleblowerReports;

        // Pre-processing Queries would be here
        
        // Pre-processing
        for(Whistleblower_Report__c wbr : newWhistleblowerReports.values()) {
            service.setWhistleblowerReport(wbr);
            service.addWhistleblowerReportOwnerId();
        }

        // Post-processing queries (related data) would be here

        // Data Processing would be here

        // Data prep for finish method would be here

        service.finish();
    }
   

    /* Delete Operations */
    public void beforeDelete(Map<Id, sObject> newSObjects, Map<Id, sObject> oldSObjects) {}
    public void afterDelete(Map<Id, sObject> newSObjects, Map<Id, sObject> oldSObjects) {}

    /* Undelete Operations */
    public void afterUnDelete(Map<Id, sObject> newSObjects, Map<Id, sObject> oldSObjects) {}
}