trigger Nuvi_PermitStatusChangeTrigger on Nuvi_Permit_Status_Change__e (after insert) {
    List<Nuvi_Permit_Status_Log__c> logs = new List<Nuvi_Permit_Status_Log__c>();
    for (Nuvi_Permit_Status_Change__e evt : Trigger.New) {
        Nuvi_Permit_Status_Log__c log = new Nuvi_Permit_Status_Log__c();
        String appId = evt.ApplicationId__c;
        if (appId != null && appId.length() == 18) {
            log.Application__c = (Id) appId;
        }
        log.Stage__c = evt.Stage__c;
        log.Message__c = evt.Message__c;
        logs.add(log);
    }
    if (!logs.isEmpty()) {
        insert logs;
    }
}
