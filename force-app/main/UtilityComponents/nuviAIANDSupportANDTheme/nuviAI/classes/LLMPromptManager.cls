public with sharing class LLMPromptManager {
    
    private static Map<String, LLM_Prompt_Template__mdt> promptCache;
    
    public static String getPromptTemplate(String promptType, String operation) {
        if (promptCache == null) {
            loadPromptCache();
        }
        
        String key = buildPromptKey(promptType, operation);
        LLM_Prompt_Template__mdt template = promptCache.get(key);
        
        if (template != null && String.isNotBlank(template.Prompt_Template__c)) {
            return template.Prompt_Template__c;
        }
        
        return getDefaultPrompt(promptType, operation);
    }
    
    private static void loadPromptCache() {
        promptCache = new Map<String, LLM_Prompt_Template__mdt>();
        
        List<LLM_Prompt_Template__mdt> templates = [
            SELECT Id, DeveloperName, Operation_Type__c, Prompt_Template__c, IsActive__c
            FROM LLM_Prompt_Template__mdt
            WHERE IsActive__c = true
            WITH SECURITY_ENFORCED
        ];
        
        for (LLM_Prompt_Template__mdt template : templates) {
            if (String.isNotBlank(template.Operation_Type__c)) {
                promptCache.put(template.Operation_Type__c.toLowerCase(), template);
            }
        }
    }
    
    private static String buildPromptKey(String promptType, String operation) {
        if (String.isNotBlank(operation)) {
            return operation.toLowerCase();
        }
        return String.isNotBlank(promptType) ? promptType.toLowerCase() : 'default';
    }
    
    private static String getDefaultPrompt(String promptType, String operation) {
        if (operation == 'summarize') {
            return 'Please provide a comprehensive summary of this Salesforce record including:\n\n' +
                   '1. Overview of the main record details\n' +
                   '2. Related records and their relationship to this record\n' +
                   '3. Any attached documents or files (if present)\n' +
                   '4. Key insights or important information\n\n';
        } else if (operation == 'report') {
            return 'You are analyzing real Salesforce data for reporting and visualization.\n\n' +
                   'CRITICAL INSTRUCTIONS:\n' +
                   '1. The data below contains ACTUAL SALESFORCE RECORDS with pre-calculated summaries\n' +
                   '2. The data may be FILTERED based on user criteria\n' +
                   '3. USE THE EXACT NUMBERS PROVIDED - do not estimate or round\n' +
                   '4. If data appears to be filtered, acknowledge this in your response\n' +
                   '5. Format numbers clearly and consistently\n' +
                   '6. If asked for charts or visualizations, provide the data in a format suitable for charting\n\n';
        } else if (operation == 'anomaly') {
            return 'Analyze this Salesforce record for potential anomalies or issues:\n\n' +
                   '1. Check for missing required fields\n' +
                   '2. Identify any unusual patterns or data inconsistencies\n' +
                   '3. Flag potential compliance or business rule violations\n' +
                   '4. Suggest corrective actions if issues are found\n\n';
        } else if (operation == 'documentanalysis') {
            return 'You are analyzing PDF document(s). For EACH document, please provide:\n\n' +
                   '1. Document type and purpose\n' +
                   '2. Key information extracted\n' +
                   '3. Important dates, amounts, or references\n' +
                   '4. Relevant entities mentioned\n' +
                   '5. Summary of main content\n\n';
        } else if (operation == 'fieldextraction') {
            return 'You are an AI data extraction assistant. Extract potential values for each field from the document text.\n' +
                   'For each field, provide:\n' +
                   '1. Extracted value(s)\n' +
                   '2. Confidence level\n' +
                   '3. Source location in document\n\n';
        } else if (operation == 'imageanalysis') {
            return 'Analyze the provided image(s) and provide:\n\n' +
                   '1. Description of what is shown\n' +
                   '2. Any text visible in the image\n' +
                   '3. Relevant details for business context\n' +
                   '4. Quality assessment\n\n';
        } else if (String.isNotBlank(promptType) && promptType.equalsIgnoreCase('question')) {
            return 'Answer this question about the Salesforce record:\n\n';
        } else {
            return 'Answer this question based on your knowledge:\n\n';
        }
    }
    
    
    public static String buildFullPrompt(String basePrompt, String context, 
                                        String attachments, String userPrompt, 
                                        Integer maxTokens) {
        Integer baseTokens = estimateTokens(basePrompt);
        Integer contextTokens = estimateTokens(context);
        Integer attachmentTokens = estimateTokens(attachments);
        Integer userTokens = estimateTokens(userPrompt);
        
        Integer totalTokens = baseTokens + contextTokens + attachmentTokens + userTokens;
        Integer tokenLimit = maxTokens != null ? maxTokens : 4000;
        
        if (totalTokens > tokenLimit) {
            Integer availableForContext = tokenLimit - baseTokens - userTokens - 500;
            
            if (availableForContext > 0) {
                if (attachmentTokens > availableForContext / 2) {
                    attachments = truncateText(attachments, availableForContext / 2);
                    availableForContext = availableForContext / 2;
                }
                
                if (contextTokens > availableForContext) {
                    context = truncateText(context, availableForContext);
                }
            } else {
                attachments = '';
                context = truncateText(context, 500);
            }
        }
        
        String fullPrompt = basePrompt;
        
        if (String.isNotBlank(context)) {
            fullPrompt += 'RECORD DATA:\n' + context + '\n\n';
        }
        
        if (String.isNotBlank(attachments)) {
            fullPrompt += 'DOCUMENT SUMMARIES:\n' + attachments + '\n\n';
        }
        
        fullPrompt += 'USER QUESTION:\n' + userPrompt;
        
        return fullPrompt;
    }
    
    private static Integer estimateTokens(String text) {
        return String.isNotBlank(text) ? text.length() / 4 : 0;
    }
    
    private static String truncateText(String text, Integer maxTokens) {
        if (String.isBlank(text)) {
            return '';
        }
        
        Integer maxChars = maxTokens * 4;
        if (text.length() <= maxChars) {
            return text;
        }
        
        return text.substring(0, maxChars) + '... [truncated]';
    }
}