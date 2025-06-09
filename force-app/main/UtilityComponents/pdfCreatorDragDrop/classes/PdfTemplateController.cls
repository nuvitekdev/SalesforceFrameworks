public with sharing class PdfTemplateController {
    
    /**
     * Get list of available Salesforce objects that can be used for PDF templates
     * Returns standard and custom objects that are accessible to the user
     */
    @AuraEnabled(cacheable=true)
    public static List<ObjectInfo> getAvailableObjects() {
        List<ObjectInfo> objects = new List<ObjectInfo>();
        
        try {
            // Get all objects accessible to the user
            Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
            
            for (String objectName : globalDescribe.keySet()) {
                Schema.SObjectType sObjType = globalDescribe.get(objectName);
                Schema.DescribeSObjectResult objDescribe = sObjType.getDescribe();
                
                // Filter out system objects and objects the user can't access
                if (objDescribe.isAccessible() && 
                    !objDescribe.isDeprecatedAndHidden() &&
                    objDescribe.isQueryable() &&
                    !objectName.endsWith('__mdt') && // Exclude metadata types
                    !objectName.endsWith('__e') &&   // Exclude platform events
                    !objectName.endsWith('__b') &&   // Exclude big objects
                    !objectName.endsWith('__x') &&   // Exclude external objects
                    !objectName.contains('__Tag') && // Exclude tag objects
                    !objectName.contains('__History') && // Exclude history objects
                    !objectName.contains('__Feed') && // Exclude feed objects
                    !objectName.contains('__Share')) { // Exclude share objects
                    
                    ObjectInfo objInfo = new ObjectInfo();
                    objInfo.value = objectName;
                    objInfo.label = objDescribe.getLabel();
                    objInfo.isCustom = objDescribe.isCustom();
                    objInfo.keyPrefix = objDescribe.getKeyPrefix();
                    objects.add(objInfo);
                }
            }
            
            // Sort objects: Standard first (alphabetically), then Custom (alphabetically)
            objects.sort();
            
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving objects: ' + e.getMessage());
        }
        
        return objects;
    }
    
    /**
     * Get all fields for a specific object
     * Returns field metadata including type, label, and formatting options
     */
    @AuraEnabled(cacheable=true)
    public static List<FieldInfo> getObjectFields(String objectApiName) {
        List<FieldInfo> fields = new List<FieldInfo>();
        
        try {
            // Get the object describe
            Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectApiName);
            if (sObjType == null) {
                throw new AuraHandledException('Object not found: ' + objectApiName);
            }
            
            Schema.DescribeSObjectResult objDescribe = sObjType.getDescribe();
            Map<String, Schema.SObjectField> fieldMap = objDescribe.fields.getMap();
            
            // Process each field
            for (String fieldName : fieldMap.keySet()) {
                Schema.DescribeFieldResult fieldDescribe = fieldMap.get(fieldName).getDescribe();
                
                // Only include accessible fields
                if (fieldDescribe.isAccessible()) {
                    FieldInfo fieldInfo = new FieldInfo();
                    fieldInfo.value = fieldDescribe.getName();
                    fieldInfo.label = fieldDescribe.getLabel();
                    fieldInfo.type = fieldDescribe.getType().name();
                    fieldInfo.isRequired = !fieldDescribe.isNillable();
                    fieldInfo.isCustom = fieldDescribe.isCustom();
                    fieldInfo.helpText = fieldDescribe.getInlineHelpText();
                    fieldInfo.length = fieldDescribe.getLength();
                    fieldInfo.precision = fieldDescribe.getPrecision();
                    fieldInfo.scale = fieldDescribe.getScale();
                    
                    // Get reference information if it's a lookup/master-detail
                    if (fieldDescribe.getType() == Schema.DisplayType.REFERENCE) {
                        List<Schema.SObjectType> references = fieldDescribe.getReferenceTo();
                        if (!references.isEmpty()) {
                            fieldInfo.referenceObjectName = references[0].getDescribe().getName();
                            fieldInfo.referenceObjectLabel = references[0].getDescribe().getLabel();
                        }
                    }
                    
                    // Get picklist values if it's a picklist
                    if (fieldDescribe.getType() == Schema.DisplayType.PICKLIST || 
                        fieldDescribe.getType() == Schema.DisplayType.MULTIPICKLIST) {
                        List<Schema.PicklistEntry> picklistValues = fieldDescribe.getPicklistValues();
                        fieldInfo.picklistValues = new List<PicklistValue>();
                        for (Schema.PicklistEntry ple : picklistValues) {
                            if (ple.isActive()) {
                                PicklistValue plValue = new PicklistValue();
                                plValue.label = ple.getLabel();
                                plValue.value = ple.getValue();
                                fieldInfo.picklistValues.add(plValue);
                            }
                        }
                    }
                    
                    // Set field category for UI grouping
                    fieldInfo.category = getFieldCategory(fieldDescribe);
                    
                    fields.add(fieldInfo);
                }
            }
            
            // Sort fields: Required first, then alphabetically by label
            fields.sort();
            
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving fields: ' + e.getMessage());
        }
        
        return fields;
    }
    
    /**
     * Save a PDF template definition
     * Creates or updates the template and its field mappings
     */
    @AuraEnabled
    public static String saveTemplate(String templateDataJson) {
        try {
            // Parse the template data
            TemplateData templateData = (TemplateData) JSON.deserialize(templateDataJson, TemplateData.class);
            
            // Create or update the template record
            PDF_Template__c template = new PDF_Template__c();
            template.Name = templateData.name;
            template.Description__c = templateData.description;
            template.Object_API_Name__c = templateData.objectApiName;
            template.Page_Count__c = templateData.pageCount;
            template.Page_Size__c = templateData.pageSize;
            template.Orientation__c = templateData.orientation;
            template.Is_Active__c = templateData.isActive != null ? templateData.isActive : true;
            template.Template_Version__c = 1.0;
            
            // If updating existing template
            if (String.isNotBlank(templateData.templateId)) {
                template.Id = templateData.templateId;
                
                // Increment version
                PDF_Template__c existingTemplate = [SELECT Template_Version__c FROM PDF_Template__c WHERE Id = :templateData.templateId LIMIT 1];
                template.Template_Version__c = existingTemplate.Template_Version__c + 1.0;
                
                // Delete existing field mappings
                delete [SELECT Id FROM PDF_Template_Field__c WHERE PDF_Template__c = :templateData.templateId];
            }
            
            upsert template;
            
            // Create field mappings
            List<PDF_Template_Field__c> templateFields = new List<PDF_Template_Field__c>();
            for (TemplateFieldData fieldData : templateData.fields) {
                PDF_Template_Field__c templateField = new PDF_Template_Field__c();
                templateField.PDF_Template__c = template.Id;
                templateField.Field_API_Name__c = fieldData.fieldApiName;
                templateField.Field_Label__c = fieldData.fieldLabel;
                templateField.Field_Type__c = fieldData.fieldType;
                templateField.Page_Number__c = fieldData.pageNumber;
                templateField.X_Position__c = fieldData.xPosition;
                templateField.Y_Position__c = fieldData.yPosition;
                templateField.Width__c = fieldData.width;
                templateField.Height__c = fieldData.height;
                templateField.Font_Size__c = fieldData.fontSize != null ? fieldData.fontSize : 12;
                templateField.Font_Family__c = fieldData.fontFamily != null ? fieldData.fontFamily : 'Arial';
                templateField.Alignment__c = fieldData.alignment != null ? fieldData.alignment : 'left';
                templateField.Format_Options__c = fieldData.formatOptions;
                templateFields.add(templateField);
            }
            
            if (!templateFields.isEmpty()) {
                insert templateFields;
            }
            
            return template.Id;
            
        } catch (Exception e) {
            throw new AuraHandledException('Error saving template: ' + e.getMessage());
        }
    }
    
    /**
     * Load an existing template
     * Returns the template definition with all field mappings
     */
    @AuraEnabled(cacheable=true)
    public static TemplateData loadTemplate(String templateId) {
        try {
            // Query template with fields
            PDF_Template__c template = [
                SELECT Id, Name, Description__c, Object_API_Name__c, Page_Count__c, 
                       Page_Size__c, Orientation__c, Is_Active__c, Template_Version__c,
                       (SELECT Id, Field_API_Name__c, Field_Label__c, Field_Type__c, 
                               Page_Number__c, X_Position__c, Y_Position__c, Width__c, Height__c,
                               Font_Size__c, Font_Family__c, Alignment__c, Format_Options__c
                        FROM PDF_Template_Fields__r
                        ORDER BY Page_Number__c, Y_Position__c)
                FROM PDF_Template__c
                WHERE Id = :templateId
                LIMIT 1
            ];
            
            // Convert to TemplateData
            TemplateData templateData = new TemplateData();
            templateData.templateId = template.Id;
            templateData.name = template.Name;
            templateData.description = template.Description__c;
            templateData.objectApiName = template.Object_API_Name__c;
            templateData.pageCount = Integer.valueOf(template.Page_Count__c);
            templateData.pageSize = template.Page_Size__c;
            templateData.orientation = template.Orientation__c;
            templateData.isActive = template.Is_Active__c;
            templateData.version = template.Template_Version__c;
            
            // Convert field mappings
            templateData.fields = new List<TemplateFieldData>();
            for (PDF_Template_Field__c field : template.PDF_Template_Fields__r) {
                TemplateFieldData fieldData = new TemplateFieldData();
                fieldData.fieldApiName = field.Field_API_Name__c;
                fieldData.fieldLabel = field.Field_Label__c;
                fieldData.fieldType = field.Field_Type__c;
                fieldData.pageNumber = Integer.valueOf(field.Page_Number__c);
                fieldData.xPosition = field.X_Position__c;
                fieldData.yPosition = field.Y_Position__c;
                fieldData.width = field.Width__c;
                fieldData.height = field.Height__c;
                fieldData.fontSize = Integer.valueOf(field.Font_Size__c);
                fieldData.fontFamily = field.Font_Family__c;
                fieldData.alignment = field.Alignment__c;
                fieldData.formatOptions = field.Format_Options__c;
                templateData.fields.add(fieldData);
            }
            
            return templateData;
            
        } catch (Exception e) {
            throw new AuraHandledException('Error loading template: ' + e.getMessage());
        }
    }
    
    /**
     * Get list of available templates
     * Returns active templates for selection
     */
    @AuraEnabled(cacheable=true)
    public static List<TemplateInfo> getAvailableTemplates() {
        List<TemplateInfo> templates = new List<TemplateInfo>();
        
        try {
            for (PDF_Template__c template : [
                SELECT Id, Name, Description__c, Object_API_Name__c, Page_Count__c,
                       CreatedDate, LastModifiedDate, Template_Version__c
                FROM PDF_Template__c
                WHERE Is_Active__c = true
                ORDER BY Name
                LIMIT 200
            ]) {
                TemplateInfo info = new TemplateInfo();
                info.id = template.Id;
                info.name = template.Name;
                info.description = template.Description__c;
                info.objectName = template.Object_API_Name__c;
                info.pageCount = Integer.valueOf(template.Page_Count__c);
                info.createdDate = template.CreatedDate;
                info.lastModifiedDate = template.LastModifiedDate;
                info.version = template.Template_Version__c;
                templates.add(info);
            }
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving templates: ' + e.getMessage());
        }
        
        return templates;
    }
    
    /**
     * Generate a PDF from a template and record data
     * Returns the ContentVersion Id of the generated PDF
     */
    @AuraEnabled
    public static String generatePdfFromTemplate(String templateId, String recordId) {
        try {
            // This would integrate with pdf-lib to generate the actual PDF
            // For now, returning a placeholder
            throw new AuraHandledException('PDF generation will be implemented with pdf-lib integration');
            
        } catch (Exception e) {
            throw new AuraHandledException('Error generating PDF: ' + e.getMessage());
        }
    }
    
    /**
     * Helper method to categorize fields for UI grouping
     */
    private static String getFieldCategory(Schema.DescribeFieldResult fieldDescribe) {
        Schema.DisplayType fieldType = fieldDescribe.getType();
        
        if (fieldDescribe.isCalculated()) {
            return 'Formula';
        } else if (fieldType == Schema.DisplayType.REFERENCE) {
            return 'Relationship';
        } else if (fieldType == Schema.DisplayType.PICKLIST || 
                   fieldType == Schema.DisplayType.MULTIPICKLIST) {
            return 'Picklist';
        } else if (fieldType == Schema.DisplayType.DATE || 
                   fieldType == Schema.DisplayType.DATETIME || 
                   fieldType == Schema.DisplayType.TIME) {
            return 'Date/Time';
        } else if (fieldType == Schema.DisplayType.CURRENCY || 
                   fieldType == Schema.DisplayType.DOUBLE || 
                   fieldType == Schema.DisplayType.INTEGER || 
                   fieldType == Schema.DisplayType.PERCENT) {
            return 'Number';
        } else if (fieldType == Schema.DisplayType.BOOLEAN) {
            return 'Checkbox';
        } else {
            return 'Text';
        }
    }
    
    // Inner classes for data structures
    
    public class ObjectInfo implements Comparable {
        @AuraEnabled public String value;
        @AuraEnabled public String label;
        @AuraEnabled public Boolean isCustom;
        @AuraEnabled public String keyPrefix;
        
        public Integer compareTo(Object compareTo) {
            ObjectInfo compareToObj = (ObjectInfo)compareTo;
            // Standard objects first, then custom
            if (this.isCustom != compareToObj.isCustom) {
                return this.isCustom ? 1 : -1;
            }
            // Then alphabetically by label
            return this.label.compareTo(compareToObj.label);
        }
    }
    
    public class FieldInfo implements Comparable {
        @AuraEnabled public String value;
        @AuraEnabled public String label;
        @AuraEnabled public String type;
        @AuraEnabled public Boolean isRequired;
        @AuraEnabled public Boolean isCustom;
        @AuraEnabled public String helpText;
        @AuraEnabled public String category;
        @AuraEnabled public Integer length;
        @AuraEnabled public Integer precision;
        @AuraEnabled public Integer scale;
        @AuraEnabled public String referenceObjectName;
        @AuraEnabled public String referenceObjectLabel;
        @AuraEnabled public List<PicklistValue> picklistValues;
        
        public Integer compareTo(Object compareTo) {
            FieldInfo compareToField = (FieldInfo)compareTo;
            // Required fields first
            if (this.isRequired != compareToField.isRequired) {
                return this.isRequired ? -1 : 1;
            }
            // Then alphabetically by label
            return this.label.compareTo(compareToField.label);
        }
    }
    
    public class PicklistValue {
        @AuraEnabled public String label;
        @AuraEnabled public String value;
    }
    
    public class TemplateData {
        @AuraEnabled public String templateId;
        @AuraEnabled public String name;
        @AuraEnabled public String description;
        @AuraEnabled public String objectApiName;
        @AuraEnabled public Integer pageCount;
        @AuraEnabled public String pageSize;
        @AuraEnabled public String orientation;
        @AuraEnabled public Boolean isActive;
        @AuraEnabled public Decimal version;
        @AuraEnabled public List<TemplateFieldData> fields;
    }
    
    public class TemplateFieldData {
        @AuraEnabled public String fieldApiName;
        @AuraEnabled public String fieldLabel;
        @AuraEnabled public String fieldType;
        @AuraEnabled public Integer pageNumber;
        @AuraEnabled public Decimal xPosition;
        @AuraEnabled public Decimal yPosition;
        @AuraEnabled public Decimal width;
        @AuraEnabled public Decimal height;
        @AuraEnabled public Integer fontSize;
        @AuraEnabled public String fontFamily;
        @AuraEnabled public String alignment;
        @AuraEnabled public String formatOptions;
    }
    
    public class TemplateInfo {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public String description;
        @AuraEnabled public String objectName;
        @AuraEnabled public Integer pageCount;
        @AuraEnabled public DateTime createdDate;
        @AuraEnabled public DateTime lastModifiedDate;
        @AuraEnabled public Decimal version;
    }
} 