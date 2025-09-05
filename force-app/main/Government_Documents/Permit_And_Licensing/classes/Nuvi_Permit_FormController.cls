/**
 * @description Dynamic Form Generation Controller for Multi-Agency Permit System
 * Leverages utility components (Dynamic Survey Creator pattern) for scalable form generation
 * 
 * @author Nuvitek Government Solutions Team
 * @version 1.0.0
 */
public with sharing class Nuvi_Permit_FormController {
    
    /**
     * @description Wrapper class for permit type information
     */
    public class PermitTypeInfo {
        @AuraEnabled public String permitTypeName { get; set; }
        @AuraEnabled public String displayName { get; set; }
        @AuraEnabled public String description { get; set; }
        @AuraEnabled public Integer totalSteps { get; set; }
        @AuraEnabled public Decimal baseFee { get; set; }
        @AuraEnabled public Boolean aiEnabled { get; set; }
        @AuraEnabled public Boolean gisRequired { get; set; }
        @AuraEnabled public Boolean publicPortalEnabled { get; set; }
    }
    
    /**
     * @description Wrapper class for form configuration
     */
    public class FormConfiguration {
        @AuraEnabled public List<FormStep> steps { get; set; }
        @AuraEnabled public List<DocumentRequirement> requiredDocuments { get; set; }
        @AuraEnabled public List<DocumentRequirement> optionalDocuments { get; set; }
        @AuraEnabled public List<String> reviewAgencies { get; set; }
        @AuraEnabled public ProcessingTimes processingTimes { get; set; }
        @AuraEnabled public FeeCalculation feeCalculation { get; set; }
    }
    
    /**
     * @description Form step structure
     */
    public class FormStep {
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public Integer stepNumber { get; set; }
        @AuraEnabled public List<FormField> fields { get; set; }
        @AuraEnabled public String instructions { get; set; }
    }
    
    /**
     * @description Dynamic form field definition
     */
    public class FormField {
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public String type { get; set; }
        @AuraEnabled public String label { get; set; }
        @AuraEnabled public Boolean required { get; set; }
        @AuraEnabled public List<String> options { get; set; }
        @AuraEnabled public String helpText { get; set; }
        @AuraEnabled public String placeholder { get; set; }
        @AuraEnabled public Integer maxLength { get; set; }
        @AuraEnabled public String pattern { get; set; }
        @AuraEnabled public Decimal min { get; set; }
        @AuraEnabled public Decimal max { get; set; }
        @AuraEnabled public Integer precision { get; set; }
        @AuraEnabled public String dependsOn { get; set; }
        @AuraEnabled public Object defaultValue { get; set; }
    }
    
    /**
     * @description Document requirement structure
     */
    public class DocumentRequirement {
        @AuraEnabled public String type { get; set; }
        @AuraEnabled public String name { get; set; }
        @AuraEnabled public String description { get; set; }
        @AuraEnabled public Boolean required { get; set; }
        @AuraEnabled public List<String> acceptedFormats { get; set; }
        @AuraEnabled public Integer maxSizeMB { get; set; }
        @AuraEnabled public String folder { get; set; }
    }
    
    /**
     * @description Processing times configuration
     */
    public class ProcessingTimes {
        @AuraEnabled public Integer standardDays { get; set; }
        @AuraEnabled public Integer expeditedDays { get; set; }
        @AuraEnabled public Integer emergencyDays { get; set; }
    }
    
    /**
     * @description Fee calculation structure
     */
    public class FeeCalculation {
        @AuraEnabled public Decimal baseFee { get; set; }
        @AuraEnabled public List<FeeRule> additionalRules { get; set; }
        @AuraEnabled public Decimal expeditedMultiplier { get; set; }
    }
    
    /**
     * @description Individual fee calculation rule
     */
    public class FeeRule {
        @AuraEnabled public String field { get; set; }
        @AuraEnabled public Decimal threshold { get; set; }
        @AuraEnabled public Decimal rate { get; set; }
        @AuraEnabled public String description { get; set; }
    }
    
    /**
     * @description Get all available permit types for a specific agency
     * @param agencyType Agency type (FEDERAL, STATE, LOCAL)
     * @return List of available permit types
     */
    @AuraEnabled(cacheable=true)
    public static List<PermitTypeInfo> getAvailablePermitTypes(String agencyType) {
        // Demo-safe default: one permit type
        List<PermitTypeInfo> permitTypes = new List<PermitTypeInfo>();
        PermitTypeInfo info = new PermitTypeInfo();
        info.permitTypeName = 'DRILLING';
        info.displayName = 'Drilling Permit (APD)';
        info.description = 'Application for Permit to Drill';
        info.totalSteps = 8;
        info.baseFee = 12515;
        info.aiEnabled = true;
        info.gisRequired = true;
        info.publicPortalEnabled = true;
        permitTypes.add(info);
        return permitTypes;
    }
    
    /**
     * @description Get complete form configuration for a specific permit type
     * @param permitTypeName Name of the permit type
     * @param agencyType Agency type for customization
     * @return Complete form configuration
     */
    @AuraEnabled(cacheable=true)
    public static FormConfiguration getFormConfiguration(String permitTypeName, String agencyType) {
        FormConfiguration cfg = new FormConfiguration();
        cfg.steps = new List<FormStep>();
        cfg.requiredDocuments = new List<DocumentRequirement>();
        cfg.optionalDocuments = new List<DocumentRequirement>();
        cfg.reviewAgencies = new List<String>{ agencyType };
        cfg.processingTimes = new ProcessingTimes();
        cfg.processingTimes.standardDays = 30;
        cfg.processingTimes.expeditedDays = 15;
        cfg.processingTimes.emergencyDays = 7;
        cfg.feeCalculation = new FeeCalculation();
        cfg.feeCalculation.baseFee = 12515; // Default APD base fee
        cfg.feeCalculation.additionalRules = new List<FeeRule>();

        try {
            // Try to load dynamic configuration from Custom Metadata (lightweight JSON snippets)
            Permit_Form_Config__mdt[] defs = [
                SELECT Steps_JSON__c, Required_Documents_JSON__c, Optional_Documents_JSON__c, Fee_Rules_JSON__c
                FROM Permit_Form_Config__mdt
                WHERE DeveloperName LIKE '%FEDERAL%'
                LIMIT 1
            ];
            if (!defs.isEmpty()) {
                Permit_Form_Config__mdt def = defs[0];
                if (String.isNotBlank(def.Steps_JSON__c)) {
                    cfg.steps = parseFormSteps(def.Steps_JSON__c);
                }
                if (String.isNotBlank(def.Required_Documents_JSON__c)) {
                    cfg.requiredDocuments = parseDocumentRequirements(def.Required_Documents_JSON__c, true);
                }
                if (String.isNotBlank(def.Optional_Documents_JSON__c)) {
                    cfg.optionalDocuments = parseDocumentRequirements(def.Optional_Documents_JSON__c, false);
                }
                if (String.isNotBlank(def.Fee_Rules_JSON__c)) {
                    cfg.feeCalculation.additionalRules = parseFeeRules(def.Fee_Rules_JSON__c);
                }
            } else {
                // Minimal sensible defaults if no metadata present
                FormStep s1 = new FormStep(); s1.name = 'Applicant Information'; s1.stepNumber = 1; s1.fields = new List<FormField>();
                cfg.steps.add(s1);
            }
        } catch (Exception e) {
            System.debug('Error loading form configuration: ' + e.getMessage());
            // Keep defaults on failure
            if (cfg.steps.isEmpty()) {
                FormStep s1 = new FormStep(); s1.name = 'Applicant Information'; s1.stepNumber = 1; s1.fields = new List<FormField>();
                cfg.steps.add(s1);
            }
        }

        return cfg;
    }
    
    /**
     * @description Parse JSON form configuration into structured steps
     * @param jsonConfig JSON configuration string
     * @return List of form steps
     */
    private static List<FormStep> parseFormSteps(String jsonConfig) {
        List<FormStep> steps = new List<FormStep>();
        
        try {
            Map<String, Object> configMap = (Map<String, Object>) JSON.deserializeUntyped(jsonConfig);
            List<Object> stepsData = (List<Object>) configMap.get('steps');
            
            Integer stepNumber = 1;
            for (Object stepData : stepsData) {
                Map<String, Object> stepMap = (Map<String, Object>) stepData;
                
                FormStep step = new FormStep();
                step.name = (String) stepMap.get('name');
                step.stepNumber = stepNumber++;
                step.instructions = (String) stepMap.get('instructions');
                step.fields = new List<FormField>();
                
                List<Object> fieldsData = (List<Object>) stepMap.get('fields');
                if (fieldsData != null) {
                    for (Object fieldData : fieldsData) {
                        Map<String, Object> fieldMap = (Map<String, Object>) fieldData;
                        
                        FormField field = new FormField();
                        field.name = (String) fieldMap.get('name');
                        field.type = (String) fieldMap.get('type');
                        field.label = (String) fieldMap.get('label');
                        field.required = (Boolean) fieldMap.get('required');
                        field.helpText = (String) fieldMap.get('helpText');
                        field.placeholder = (String) fieldMap.get('placeholder');
                        field.pattern = (String) fieldMap.get('pattern');
                        field.dependsOn = (String) fieldMap.get('dependsOn');
                        field.defaultValue = fieldMap.get('defaultValue');
                        
                        // Handle numeric fields
                        if (fieldMap.containsKey('maxLength')) {
                            field.maxLength = Integer.valueOf(fieldMap.get('maxLength'));
                        }
                        if (fieldMap.containsKey('min')) {
                            field.min = (Decimal) fieldMap.get('min');
                        }
                        if (fieldMap.containsKey('max')) {
                            field.max = (Decimal) fieldMap.get('max');
                        }
                        if (fieldMap.containsKey('precision')) {
                            field.precision = Integer.valueOf(fieldMap.get('precision'));
                        }
                        
                        // Handle picklist options
                        if (fieldMap.containsKey('options')) {
                            List<Object> optionsData = (List<Object>) fieldMap.get('options');
                            field.options = new List<String>();
                            for (Object option : optionsData) {
                                field.options.add(String.valueOf(option));
                            }
                        }
                        
                        step.fields.add(field);
                    }
                }
                
                steps.add(step);
            }
            
        } catch (Exception e) {
            System.debug('Error parsing form configuration: ' + e.getMessage());
        }
        
        return steps;
    }
    
    /**
     * @description Parse document requirements from JSON
     * @param jsonConfig JSON configuration string
     * @param required Whether these are required documents
     * @return List of document requirements
     */
    private static List<DocumentRequirement> parseDocumentRequirements(String jsonConfig, Boolean required) {
        List<DocumentRequirement> requirements = new List<DocumentRequirement>();
        
        try {
            List<Object> docsData = (List<Object>) JSON.deserializeUntyped(jsonConfig);
            
            for (Object docData : docsData) {
                Map<String, Object> docMap = (Map<String, Object>) docData;
                
                DocumentRequirement req = new DocumentRequirement();
                req.type = (String) docMap.get('type');
                req.name = (String) docMap.get('name');
                req.description = (String) docMap.get('description');
                req.required = required;
                
                // Set default accepted formats
                req.acceptedFormats = new List<String>{'pdf', 'doc', 'docx', 'xls', 'xlsx', 'jpg', 'png'};
                req.maxSizeMB = 10;
                
                requirements.add(req);
            }
            
        } catch (Exception e) {
            System.debug('Error parsing document requirements: ' + e.getMessage());
        }
        
        return requirements;
    }
    
    /**
     * @description Parse fee calculation rules from JSON
     * @param jsonConfig JSON configuration string
     * @return List of fee rules
     */
    private static List<FeeRule> parseFeeRules(String jsonConfig) {
        List<FeeRule> rules = new List<FeeRule>();
        
        try {
            Map<String, Object> configMap = (Map<String, Object>) JSON.deserializeUntyped(jsonConfig);
            List<Object> rulesData = (List<Object>) configMap.get('rules');
            
            if (rulesData != null) {
                for (Object ruleData : rulesData) {
                    Map<String, Object> ruleMap = (Map<String, Object>) ruleData;
                    
                    FeeRule rule = new FeeRule();
                    rule.field = (String) ruleMap.get('field');
                    rule.threshold = (Decimal) ruleMap.get('threshold');
                    rule.rate = (Decimal) ruleMap.get('rate');
                    rule.description = (String) ruleMap.get('description');
                    
                    rules.add(rule);
                }
            }
            
        } catch (Exception e) {
            System.debug('Error parsing fee rules: ' + e.getMessage());
        }
        
        return rules;
    }
    
    /**
     * @description Calculate total application fee based on form data and rules
     * @param permitTypeName Name of the permit type
     * @param formData Application form data as JSON string
     * @param priorityLevel Priority level (Standard, Expedited, Emergency)
     * @return Calculated total fee
     */
    @AuraEnabled
    public static Decimal calculateApplicationFee(String permitTypeName, String formData, String priorityLevel) {
        try {
            // Get fee configuration
            FormConfiguration config = getFormConfiguration(permitTypeName, 'FEDERAL');
            Decimal totalFee = config.feeCalculation.baseFee;
            
            // Parse form data
            Map<String, Object> dataMap = (Map<String, Object>) JSON.deserializeUntyped(formData);
            
            // Apply additional fee rules
            if (config.feeCalculation.additionalRules != null) {
                for (FeeRule rule : config.feeCalculation.additionalRules) {
                    if (dataMap.containsKey(rule.field)) {
                        Decimal fieldValue = Decimal.valueOf(String.valueOf(dataMap.get(rule.field)));
                        if (fieldValue > rule.threshold) {
                            totalFee += (fieldValue - rule.threshold) * rule.rate;
                        }
                    }
                }
            }
            
            // Apply priority multiplier
            if ('Expedited'.equals(priorityLevel)) {
                totalFee *= 1.5; // 50% increase for expedited
            } else if ('Emergency'.equals(priorityLevel)) {
                totalFee *= 2.0; // 100% increase for emergency
            }
            
            return totalFee;
            
        } catch (Exception e) {
            System.debug('Error calculating fee: ' + e.getMessage());
            throw new AuraHandledException('Unable to calculate application fee: ' + e.getMessage());
        }
    }
    
    /**
     * @description Validate form data against permit type requirements
     * @param permitTypeName Name of the permit type
     * @param formData Application form data as JSON string
     * @return Validation results
     */
    @AuraEnabled
    public static Map<String, Object> validateFormData(String permitTypeName, String formData) {
        Map<String, Object> result = new Map<String, Object>();
        List<String> errors = new List<String>();
        List<String> warnings = new List<String>();
        
        try {
            FormConfiguration config = getFormConfiguration(permitTypeName, 'FEDERAL');
            Map<String, Object> dataMap = (Map<String, Object>) JSON.deserializeUntyped(formData);
            
            // Validate required fields
            for (FormStep step : config.steps) {
                for (FormField field : step.fields) {
                    if (field.required && !dataMap.containsKey(field.name)) {
                        errors.add('Required field missing: ' + field.label);
                    }
                    
                    // Pattern validation
                    if (String.isNotBlank(field.pattern) && dataMap.containsKey(field.name)) {
                        String value = String.valueOf(dataMap.get(field.name));
                        if (!Pattern.matches(field.pattern, value)) {
                            errors.add('Invalid format for field: ' + field.label);
                        }
                    }
                }
            }
            
            result.put('isValid', errors.isEmpty());
            result.put('errors', errors);
            result.put('warnings', warnings);
            
        } catch (Exception e) {
            System.debug('Error validating form data: ' + e.getMessage());
            errors.add('Validation error: ' + e.getMessage());
            result.put('isValid', false);
            result.put('errors', errors);
            result.put('warnings', warnings);
        }
        
        return result;
    }
}