public with sharing class StatusEventPublisher {
    @AuraEnabled
    public static void publishStatusChange(Id applicationId, String stage, String message) {
        // Publish platform event for decoupled notifications
        Nuvi_Permit_Status_Change__e evt = new Nuvi_Permit_Status_Change__e(
            ApplicationId__c = (String) applicationId,
            Stage__c = stage,
            Message__c = message
        );
        EventBus.publish(evt);
    }
}
