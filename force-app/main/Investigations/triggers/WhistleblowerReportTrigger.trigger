trigger WhistleblowerReportTrigger on Whistleblower_Report__c (before insert, before update, before delete, after insert, after update, after delete, after undelete) {
    TriggerFactory.createAndExecuteHandler(WhistleblowerReportTriggerHandler.class);
}