public with sharing class Nuvi_Permit_PayGovService {
    @AuraEnabled
    public static PayGovService.PaymentIntentResult createPaymentIntent(Decimal amount, String currencyCode, String applicationId) {
        return PayGovService.createPaymentIntent(amount, currencyCode, applicationId);
    }
}