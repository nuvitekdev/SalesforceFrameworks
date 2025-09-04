public with sharing class Nuvi_Permit_StatusEventPublisher {
    @AuraEnabled
    public static void publishStatusChange(Id applicationId, String stage, String message) {
        StatusEventPublisher.publishStatusChange(applicationId, stage, message);
    }
}

