@IsTest
private class Nuvi_Permit_SignatureController_Test {
    @IsTest
    static void testGetPendingPermitSignatures_NoExisting() {
        APD_Application__c app = new APD_Application__c();
        insert app;

        Test.startTest();
        List<Nuvi_Permit_SignatureController.PermitDocumentSignature> sigs =
            Nuvi_Permit_SignatureController.getPendingPermitSignatures(app.Id, 'DOI', 'DRILLING');
        Test.stopTest();

        System.assertNotEquals(null, sigs, 'Should return a list (possibly empty)');
    }
}

