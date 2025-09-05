public with sharing class FormBuilderController {

    public class TemplateInfo {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public String status;
        @AuraEnabled public Decimal version;
        @AuraEnabled public Decimal confidence;
        @AuraEnabled public String originalVersionId;
        @AuraEnabled public String previewUrl;
        @AuraEnabled public String contentDocumentId;
        @AuraEnabled public String contentVersionId;
        @AuraEnabled public Datetime lastModifiedDate;
    }

    @AuraEnabled
    public static Id createTemplate(String name, String formNumber, String agency, String title) {
        if (String.isBlank(name)) {
            throw new AuraHandledException('Name is required');
        }
        Form_Template__c rec = new Form_Template__c();
        rec.Name = name;
        rec.Form_Number__c = formNumber;
        rec.Agency__c = agency;
        rec.Template_Title__c = title;
        rec.Status__c = 'Draft';
        insert rec;
        return rec.Id;
    }

    @AuraEnabled(cacheable=true)
    public static List<TemplateInfo> listTemplates() {
        List<Form_Template__c> rows = [
            SELECT Id, Name, Status__c, Version__c, Confidence_Score__c, Original_Image_Version_Id__c, LastModifiedDate
            FROM Form_Template__c
            ORDER BY LastModifiedDate DESC
            LIMIT 200
        ];
        List<TemplateInfo> out = new List<TemplateInfo>();
        for (Form_Template__c r : rows) {
            TemplateInfo t = new TemplateInfo();
            t.id = r.Id;
            t.name = r.Name;
            t.status = r.Status__c;
            t.version = r.Version__c;
            t.confidence = r.Confidence_Score__c;
            t.originalVersionId = r.Original_Image_Version_Id__c;
            t.previewUrl = r.Original_Image_Version_Id__c == null ? null : ('/sfc/servlet.shepherd/version/download/' + r.Original_Image_Version_Id__c);
            t.lastModifiedDate = r.LastModifiedDate;
            out.add(t);
        }
        return out;
    }

    @AuraEnabled(cacheable=true)
    public static TemplateInfo getTemplateInfo(String templateId) {
        if (String.isBlank(templateId)) {
            throw new AuraHandledException('templateId required');
        }
        Form_Template__c r = [
            SELECT Id, Name, Status__c, Version__c, Confidence_Score__c,
                   Original_Image_Version_Id__c, Original_Image_URL__c
            FROM Form_Template__c
            WHERE Id = :templateId
            LIMIT 1
        ];
        TemplateInfo t = new TemplateInfo();
        t.id = r.Id;
        t.name = r.Name;
        t.status = r.Status__c;
        t.version = r.Version__c;
        t.confidence = r.Confidence_Score__c;
        t.originalVersionId = r.Original_Image_Version_Id__c;
        t.previewUrl = String.isNotBlank(r.Original_Image_URL__c)
            ? r.Original_Image_URL__c
            : (r.Original_Image_Version_Id__c == null ? null : ('/sfc/servlet.shepherd/version/download/' + r.Original_Image_Version_Id__c));

        // Populate content document/version if available so UI can open without manual refresh
        if (t.originalVersionId != null) {
            try {
                ContentVersion cv = [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :t.originalVersionId LIMIT 1];
                t.contentVersionId = cv.Id;
                t.contentDocumentId = cv.ContentDocumentId;
            } catch (Exception ignore) {
                // fall back to link lookup
            }
        }
        if (t.contentDocumentId == null) {
            try {
                ContentDocumentLink cdl = [
                    SELECT ContentDocumentId, ContentDocument.LatestPublishedVersionId
                    FROM ContentDocumentLink
                    WHERE LinkedEntityId = :templateId
                    ORDER BY SystemModstamp DESC
                    LIMIT 1
                ];
                t.contentDocumentId = String.valueOf(cdl.ContentDocumentId);
                t.contentVersionId = String.valueOf(cdl.ContentDocument.LatestPublishedVersionId);
            } catch (Exception ignore) {
                // none linked yet
            }
        }
        return t;
    }

    @AuraEnabled
    public static TemplateInfo updateLatestUploadInfo(String templateId) {
        if (String.isBlank(templateId)) throw new AuraHandledException('templateId required');
        List<ContentDocumentLink> links = [
            SELECT ContentDocumentId, ContentDocument.LatestPublishedVersionId, ContentDocument.Title,
                   ContentDocument.FileType
            FROM ContentDocumentLink
            WHERE LinkedEntityId = :templateId
            ORDER BY SystemModstamp DESC
            LIMIT 1
        ];
        if (links.isEmpty()) {
            throw new AuraHandledException('No files found linked to this template');
        }
        Id versionId = links[0].ContentDocument.LatestPublishedVersionId;
        Form_Template__c upd = new Form_Template__c(
            Id = templateId,
            Original_Image_Version_Id__c = versionId,
            Original_File_Name__c = links[0].ContentDocument.Title,
            Original_File_Type__c = links[0].ContentDocument.FileType,
            Original_Image_URL__c = '/sfc/servlet.shepherd/version/download/' + versionId
        );
        update upd;

        TemplateInfo t = new TemplateInfo();
        t.id = templateId;
        t.originalVersionId = String.valueOf(versionId);
        t.previewUrl = upd.Original_Image_URL__c;
        t.contentDocumentId = String.valueOf(links[0].ContentDocumentId);
        t.contentVersionId = String.valueOf(versionId);
        return t;
    }

    @AuraEnabled
    public static void saveReviewedFields(String templateId, String fieldsJson) {
        if (String.isBlank(templateId)) throw new AuraHandledException('templateId required');
        if (String.isBlank(fieldsJson)) throw new AuraHandledException('fieldsJson required');

        // Persist the JSON on template for audit
        update new Form_Template__c(Id = templateId, Field_Mapping_JSON__c = fieldsJson);

        // Replace field definitions with reviewed version
        Object parsed = JSON.deserializeUntyped(fieldsJson);
        if (!(parsed instanceof List<Object>)) {
            throw new AuraHandledException('fieldsJson must be a JSON array of field definitions');
        }
        List<Object> arr = (List<Object>) parsed;
        List<Form_Field_Definition__c> defs = new List<Form_Field_Definition__c>();
        for (Object item : arr) {
            if (!(item instanceof Map<String, Object>)) continue;
            Map<String, Object> f = (Map<String, Object>) item;
            Form_Field_Definition__c d = new Form_Field_Definition__c();
            d.Form_Template__c = templateId;
            d.Field_Label__c = (String) f.get('label');
            d.Field_API_Name__c = (String) f.get('apiName');
            d.Field_Type__c = (String) f.get('type');
            d.Is_Required__c = f.get('required') == null ? false : (Boolean) f.get('required');
            d.Section_Name__c = (String) f.get('section');
            d.Help_Text__c = (String) f.get('helpText');
            d.Page_Number__c = toInt(f.get('page'));
            d.Position_X__c = toDec(f.get('x'));
            d.Position_Y__c = toDec(f.get('y'));
            d.Width__c = toDec(f.get('width'));
            d.Height__c = toDec(f.get('height'));
            if (f.get('options') != null) {
                d.Options_JSON__c = JSON.serialize(f.get('options'));
            }
            defs.add(d);
        }
        delete [SELECT Id FROM Form_Field_Definition__c WHERE Form_Template__c = :templateId];
        insert defs;
    }

    @AuraEnabled
    public static void publishTemplate(String templateId) {
        if (String.isBlank(templateId)) throw new AuraHandledException('templateId required');
        Form_Template__c rec = [SELECT Id, Version__c FROM Form_Template__c WHERE Id = :templateId LIMIT 1];
        Decimal next = (rec.Version__c == null ? 1 : rec.Version__c) + 0.1;
        update new Form_Template__c(Id = templateId, Status__c = 'Active', Version__c = next);
    }

    @AuraEnabled
    public static void deleteTemplate(String templateId) {
        if (String.isBlank(templateId)) throw new AuraHandledException('templateId required');
        // Remove related field definitions first
        List<Form_Field_Definition__c> defs = [SELECT Id FROM Form_Field_Definition__c WHERE Form_Template__c = :templateId];
        if (!defs.isEmpty()) delete defs;
        // Delete the template record
        delete new Form_Template__c(Id = templateId);
    }

    private static Integer toInt(Object o) {
        try { return o == null ? null : Integer.valueOf(String.valueOf(o)); } catch (Exception e) { return null; }
    }
    private static Decimal toDec(Object o) {
        try { return o == null ? null : Decimal.valueOf(String.valueOf(o)); } catch (Exception e) { return null; }
    }
}
