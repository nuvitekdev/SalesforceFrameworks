@IsTest
private class PayGovService_Test {
    @IsTest
    static void testCreatePaymentIntent() {
        Test.startTest();
        PayGovService.PaymentIntentResult res = PayGovService.createPaymentIntent(125.00, 'USD', 'APP-001');
        Test.stopTest();
        System.assertEquals('CREATED', res.status);
        System.assertNotEquals(null, res.intentId);
    }
}

