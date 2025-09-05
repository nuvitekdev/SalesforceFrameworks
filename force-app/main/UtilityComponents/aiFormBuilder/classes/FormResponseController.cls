public with sharing class FormResponseController {

    @AuraEnabled
    public static Id saveResponse(String templateId, String submittedJson, String submitterName, String submitterEmail) {
        if (String.isBlank(templateId)) throw new AuraHandledException('templateId required');
        if (String.isBlank(submittedJson)) throw new AuraHandledException('submittedJson required');

        Form_Response__c r = new Form_Response__c();
        r.Template__c = templateId;
        r.Submitted_JSON__c = submittedJson;
        r.Status__c = 'Submitted';
        insert r;
        return r.Id;
    }

    @AuraEnabled(cacheable=true)
    public static List<Form_Field_Definition__c> getFieldDefinitions(String templateId) {
        if (String.isBlank(templateId)) return new List<Form_Field_Definition__c>();
        return [
            SELECT Id, Field_Label__c, Field_API_Name__c, Field_Type__c, Is_Required__c,
                   Help_Text__c, Section_Name__c, Page_Number__c, Options_JSON__c
            FROM Form_Field_Definition__c
            WHERE Form_Template__c = :templateId
            ORDER BY Page_Number__c, Section_Name__c, Field_Label__c
        ];
    }
}

