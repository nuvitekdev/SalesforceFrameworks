@IsTest
private class Nuvi_PermitStatusChangeTrigger_Test {
    @IsTest
    static void testPublishCreatesLog() {
        APD_Application__c app = new APD_Application__c();
        insert app;

        Test.startTest();
        Nuvi_Permit_Status_Change__e evt = new Nuvi_Permit_Status_Change__e(
            ApplicationId__c = (String) app.Id,
            Stage__c = 'Intake',
            Message__c = 'Submitted'
        );
        EventBus.publish(evt);
        Test.stopTest();

        List<Nuvi_Permit_Status_Log__c> logs = [SELECT Id, Application__c, Stage__c, Message__c FROM Nuvi_Permit_Status_Log__c WHERE Application__c = :app.Id LIMIT 10];
        System.assert(logs.size() >= 1, 'Log record should be created');
        System.assertEquals('Intake', logs[0].Stage__c);
    }
}
