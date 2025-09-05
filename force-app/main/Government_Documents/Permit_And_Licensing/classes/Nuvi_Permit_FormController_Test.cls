@IsTest
private class Nuvi_Permit_FormController_Test {
    @IsTest
    static void testGetFormConfigurationAndFee() {
        Test.startTest();
        Nuvi_Permit_FormController.FormConfiguration cfg = Nuvi_Permit_FormController.getFormConfiguration('DRILLING', 'FEDERAL');
        Decimal fee = Nuvi_Permit_FormController.calculateApplicationFee('DRILLING', JSON.serialize(new Map<String, Object>()), 'Standard');
        Map<String, Object> validation = Nuvi_Permit_FormController.validateFormData('DRILLING', JSON.serialize(new Map<String, Object>{ 'operatorName' => 'X' }));
        Test.stopTest();

        System.assertNotEquals(null, cfg, 'Form config should not be null');
        System.assert(cfg.processingTimes != null, 'Processing times present');
        System.assert(fee >= 0, 'Fee should be non-negative');
        System.assertEquals(true, validation.containsKey('isValid'), 'Validation result should have isValid');
    }
}