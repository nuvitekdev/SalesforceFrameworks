public with sharing class Nuvi_Permit_PaymentController {
    public class PaymentRequest {
        @AuraEnabled public Id applicationId;
        @AuraEnabled public Decimal amount;
        @AuraEnabled public String currencyCode;
        @AuraEnabled public String method; // Pay.gov, ACH, Wire, Credit Card
    }

    public class PaymentResult {
        @AuraEnabled public Id paymentRecordId;
        @AuraEnabled public String status;
        @AuraEnabled public String message;
        @AuraEnabled public String reference;
        @AuraEnabled public String intentId;
    }

    @AuraEnabled
    public static PaymentResult processPayment(PaymentRequest req) {
        if (req == null || req.applicationId == null) {
            throw new AuraHandledException('Application and request required');
        }
        Decimal amount = (req.amount == null) ? 0 : req.amount.setScale(2);
        String currencyCodeStr = String.isBlank(req.currencyCode) ? 'USD' : req.currencyCode;
        PayGovService.PaymentIntentResult stub = Nuvi_Permit_PayGovService.createPaymentIntent(amount, currencyCodeStr, (String)req.applicationId);

        Payment_Record__c pr = new Payment_Record__c();
        pr.APD_Application__c = req.applicationId;
        pr.Amount__c = amount;
        pr.Currency__c = currencyCodeStr;
        pr.Status__c = stub.status;
        pr.Intent_Id__c = stub.intentId;
        pr.Reference__c = 'PAY-' + String.valueOf(System.now().year()) + '-' + String.valueOf(Crypto.getRandomInteger()).left(6).replace('-', '0');
        pr.Message__c = stub.message;
        pr.Method__c = String.isBlank(req.method) ? 'Pay.gov' : req.method;
        pr.Processed_On__c = System.now();
        insert pr;

        PaymentResult res = new PaymentResult();
        res.paymentRecordId = pr.Id;
        res.status = pr.Status__c;
        res.message = pr.Message__c;
        res.reference = pr.Reference__c;
        res.intentId = pr.Intent_Id__c;
        return res;
    }

    public class PaymentView {
        @AuraEnabled public Id id;
        @AuraEnabled public Decimal amount;
        @AuraEnabled public String currencyCodeStr;
        @AuraEnabled public String status;
        @AuraEnabled public String reference;
        @AuraEnabled public Datetime processedOn;
        @AuraEnabled public String method;
    }

    @AuraEnabled(cacheable=true)
    public static PaymentView getLatestPayment(Id applicationId) {
        if (applicationId == null) throw new AuraHandledException('Application required');
        List<Payment_Record__c> listPr = [
            SELECT Id, Amount__c, Currency__c, Status__c, Reference__c, Processed_On__c, Method__c
            FROM Payment_Record__c WHERE APD_Application__c = :applicationId
            ORDER BY CreatedDate DESC LIMIT 1
        ];
        if (listPr.isEmpty()) return null;
        Payment_Record__c pr = listPr[0];
        PaymentView pv = new PaymentView();
        pv.id = pr.Id;
        pv.amount = pr.Amount__c;
        pv.currencyCodeStr = pr.Currency__c;
        pv.status = pr.Status__c;
        pv.reference = pr.Reference__c;
        pv.processedOn = pr.Processed_On__c;
        pv.method = pr.Method__c;
        return pv;
    }
}
