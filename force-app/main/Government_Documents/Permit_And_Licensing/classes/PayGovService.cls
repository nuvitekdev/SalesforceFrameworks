public with sharing class PayGovService {
    public class PaymentIntentResult {
        @AuraEnabled public String intentId;
        @AuraEnabled public Decimal amount;
        @AuraEnabled public String status;
        @AuraEnabled public String message;
    }

    @AuraEnabled
    public static PaymentIntentResult createPaymentIntent(Decimal amount, String currencyCode, String applicationId) {
        PaymentIntentResult res = new PaymentIntentResult();
        res.amount = amount;
        try {
            // Placeholder: in test, return deterministic; in prod, call Named Credential
            if (Test.isRunningTest()) {
                res.intentId = 'TEST_INTENT_001';
                res.status = 'CREATED';
                res.message = 'Test intent created';
                return res;
            }
            // Integration not configured yet. Commented out callout example.
            // HttpRequest req = new HttpRequest();
            // req.setEndpoint('callout:PayGov/intents');
            // req.setMethod('POST');
            // req.setHeader('Content-Type', 'application/json');
            // req.setBody(JSON.serialize(new Map<String, Object>{
            //     'amount' => amount, 'currency' => currencyCode, 'applicationId' => applicationId
            // }));
            // Http http = new Http();
            // HttpResponse resp = http.send(req);
            // if (resp.getStatusCode() >= 200 && resp.getStatusCode() < 300) {
            //     Map<String, Object> body = (Map<String, Object>) JSON.deserializeUntyped(resp.getBody());
            //     res.intentId = (String) body.get('id');
            //     res.status = (String) body.get('status');
            //     res.message = 'Created';
            //     return res;
            // }
            // throw new AuraHandledException('Pay.gov error: ' + resp.getStatus());
            res.intentId = 'NOT_CONFIGURED';
            res.status = 'NOT_CONFIGURED';
            res.message = 'Pay.gov integration commented out. Configure Named Credential and uncomment.';
            return res;
        } catch (Exception e) {
            res.status = 'ERROR';
            res.message = e.getMessage();
            return res;
        }
    }
}