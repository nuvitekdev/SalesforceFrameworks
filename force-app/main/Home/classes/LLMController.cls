public with sharing class LLMController {
    @AuraEnabled(cacheable=true)
    public static List<LLM_Configuration__mdt> getLLMConfigurations() {
        System.debug('Getting LLM configurations');
        List<LLM_Configuration__mdt> configs = [SELECT Id, DeveloperName, MasterLabel, Provider__c, 
                                                Model_Name__c, Supports_Files__c 
                                                FROM LLM_Configuration__mdt 
                                                WHERE IsActive__c = true];
        System.debug('Found configurations: ' + configs);
        return configs;
    }
    
    @AuraEnabled
    public static String handleRequest(String recordId, String configName, String prompt, String operation) {
        System.debug('Handle request started');
        System.debug('Parameters - recordId: ' + recordId + ', configName: ' + configName + ', operation: ' + operation);
        System.debug('Prompt: ' + prompt);
        
        try {
            System.debug('Fetching LLM configuration');
            LLM_Configuration__mdt config = [SELECT API_Key__c, Base_URL__c, Model_Name__c, 
                                             Provider__c, Supports_Files__c, Max_Tokens__c, Temperature__c
                                             FROM LLM_Configuration__mdt 
                                             WHERE DeveloperName = :configName 
                                             LIMIT 1];
            System.debug('Found configuration: ' + config);
            
            String context = '';
            String attachments = '';
            
            // Only get record context if a recordId is provided
            if (String.isNotBlank(recordId)) {
                System.debug('Getting record context');
                context = getRecordContext(recordId);
                System.debug('Context length: ' + context.length());
                
                System.debug('Getting attachments');
                attachments = config.Supports_Files__c ? getAttachmentsBase64(recordId) : '';
                System.debug('Attachments length: ' + attachments.length());
            }
            
            System.debug('Building full prompt');
            String fullPrompt = buildFullPrompt(operation, context, attachments, prompt);
            System.debug('Full prompt length: ' + fullPrompt.length());
            
            System.debug('Making LLM call');
            return makeLLMCall(config, fullPrompt);
        } catch(Exception e) {
            System.debug('ERROR in handleRequest: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Error: ' + e.getMessage());
        }
    }
    
    private static String getRecordContext(String recordId) {
        try {
            // Identify object type from record ID
            Schema.SObjectType objectType = Id.valueOf(recordId).getSObjectType();
            String objectName = objectType.getDescribe().getName();
            System.debug('Object type for record: ' + objectName);
            
            // Build a query for all accessible fields on this object
            Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe().fields.getMap();
            List<String> fieldNames = new List<String>();
            
            for (String fieldName : fieldMap.keySet()) {
                Schema.DescribeFieldResult field = fieldMap.get(fieldName).getDescribe();
                if (field.isAccessible()) {
                    fieldNames.add(fieldName);
                }
            }
            
            // Build and execute dynamic query
            String query = 'SELECT ' + String.join(fieldNames, ',') + ' FROM ' + objectName + ' WHERE Id = :recordId LIMIT 1';
            SObject record = Database.query(query);
            System.debug('Record retrieved: ' + record);
            
            // Start building rich context
            String context = '\nRECORD DETAILS:\n';
            
            // Add all field values to context
            for (String fieldName : fieldNames) {
                Object fieldValue = record.get(fieldName);
                if (fieldValue != null) {
                    context += '• ' + fieldMap.get(fieldName).getDescribe().getLabel() + ': ' + fieldValue + '\n';
                }
            }
            
            // Get relationship fields (lookups and master-detail)
            List<String> relationshipFields = new List<String>();
            for (String fieldName : fieldMap.keySet()) {
                Schema.DescribeFieldResult field = fieldMap.get(fieldName).getDescribe();
                if (field.getType() == Schema.DisplayType.REFERENCE && field.isAccessible()) {
                    relationshipFields.add(fieldName);
                }
            }
            
            // Add related record info if there are relationships
            if (!relationshipFields.isEmpty()) {
                context += '\nRELATED RECORDS:\n';
                for (String relField : relationshipFields) {
                    Id relatedId = (Id)record.get(relField);
                    if (relatedId != null) {
                        String relatedObjName = relatedId.getSObjectType().getDescribe().getName();
                        String relatedLabel = fieldMap.get(relField).getDescribe().getLabel();
                        
                        try {
                            // Get name field of related object if possible
                            String nameQuery = 'SELECT Name FROM ' + relatedObjName + ' WHERE Id = :relatedId LIMIT 1';
                            List<SObject> relatedRecords = Database.query(nameQuery);
                            if (!relatedRecords.isEmpty()) {
                                context += '• ' + relatedLabel + ': ' + relatedRecords[0].get('Name') + '\n';
                            }
                        } catch (Exception e) {
                            // Some objects might not have a Name field
                            context += '• ' + relatedLabel + ': ' + relatedId + '\n';
                        }
                    }
                }
            }

            // Get activity history for context (works for most standard objects)
            try {
                List<Task> recentTasks = [SELECT Subject, ActivityDate, Status, Owner.Name, Description
                                         FROM Task
                                         WHERE WhatId = :recordId
                                         ORDER BY ActivityDate DESC
                                         LIMIT 5];
                
                if (!recentTasks.isEmpty()) {
                    context += '\nRECENT TASKS:\n';
                    for (Task t : recentTasks) {
                        context += '• ' + t.Subject + ' (' + t.Status + ')';
                        if (t.ActivityDate != null) {
                            context += ' due ' + t.ActivityDate.format();
                        }
                        context += ' - ' + t.Owner.Name + '\n';
                    }
                }
            } catch (Exception e) {
                System.debug('Error fetching tasks: ' + e.getMessage());
            }
            
            // Get collaboration activity (works for feed-enabled objects)
            try {
                List<FeedItem> recentPosts = [SELECT CreatedBy.Name, Body, CreatedDate
                                             FROM FeedItem
                                             WHERE ParentId = :recordId
                                             ORDER BY CreatedDate DESC
                                             LIMIT 3];
                
                if (!recentPosts.isEmpty()) {
                    context += '\nRECENT DISCUSSIONS:\n';
                    for (FeedItem post : recentPosts) {
                        context += '• ' + post.CreatedBy.Name + ' (' + post.CreatedDate.format() + '): "' +
                            post.Body.abbreviate(100) + '"\n';
                    }
                }
            } catch (Exception e) {
                System.debug('Error fetching feed items: ' + e.getMessage());
            }
            
            // Include document summaries
            context += getDocumentSummaries(recordId);
            
            return context;
        } catch (Exception e) {
            System.debug('ERROR in getRecordContext: ' + e.getMessage());
            throw new AuraHandledException('Failed to get record context: ' + e.getMessage());
        }
    }
    
    private static String getDocumentSummaries(String recordId) {
        try {
            // First get the ContentDocumentLinks
            List<ContentDocumentLink> links = [SELECT ContentDocumentId 
                                               FROM ContentDocumentLink 
                                               WHERE LinkedEntityId = :recordId];
            
            if(links.isEmpty()) {
                return '\nNO DOCUMENTS ATTACHED';
            }
            
            // Get the ContentDocument IDs
            Set<Id> contentDocIds = new Set<Id>();
            for(ContentDocumentLink link : links) {
                contentDocIds.add(link.ContentDocumentId);
            }
            
            // Then get the ContentVersions
            List<ContentVersion> versions = [SELECT Title, FileExtension, FileType, Description 
                                             FROM ContentVersion 
                                             WHERE ContentDocumentId IN :contentDocIds
                                             AND IsLatest = true];
            
            String summaries = '\nATTACHED DOCUMENTS:\n';
            for(ContentVersion doc : versions) {
                summaries += '• ' + doc.Title;
                if(doc.Description != null) {
                    // Truncate description if too long
                    String description = doc.Description;
                    if(description.length() > 500) {
                        description = description.substring(0, 497) + '...';
                    }
                    summaries += ' - ' + description;
                }
                summaries += ' (' + doc.FileType + ')\n';
            }
            return summaries;
        } catch(Exception e) {
            System.debug('ERROR getting document summaries: ' + e.getMessage());
            return '\nError processing documents: ' + e.getMessage();
        }
    }
    
    private static String getBaseQuery(String recordId) {
        System.debug('Generating base query for ID: ' + recordId);
        Schema.SObjectType sobjType = Id.valueOf(recordId).getSObjectType();
        String fields = String.join(new List<String>(sobjType.getDescribe().fields.getMap().keySet()), ',');
        String query = 'SELECT ' + fields + ' FROM ' + sobjType.getDescribe().getName() + ' WHERE Id = :recordId';
        System.debug('Generated query: ' + query);
        return query;
    }
    
    private static String getAttachmentsBase64(String recordId) {
        System.debug('Getting attachments for record: ' + recordId);
        
        // Set maximum total base64 content length (approximately 15k tokens = ~60k characters)
        Integer MAX_TOTAL_LENGTH = 60000;
        
        try {
            List<ContentDocumentLink> links = [SELECT ContentDocumentId 
                                               FROM ContentDocumentLink 
                                               WHERE LinkedEntityId = :recordId
                                               LIMIT 5];
            System.debug('Found ContentDocumentLinks: ' + links.size());
            
            Set<Id> contentDocumentIds = new Set<Id>();
            for(ContentDocumentLink link : links) {
                contentDocumentIds.add(link.ContentDocumentId);
            }
            System.debug('Content Document IDs: ' + contentDocumentIds);
            
            List<ContentVersion> versions = [SELECT Title, VersionData, FileExtension 
                                             FROM ContentVersion 
                                             WHERE ContentDocumentId IN :contentDocumentIds 
                                             AND IsLatest = true];
            System.debug('Found ContentVersions: ' + versions.size());
            
            String attachments = '';
            Integer currentLength = 0;
            
            for(ContentVersion cv : versions) {
                System.debug('Processing file: ' + cv.Title);
                try {
                    // Skip if file is too large
                    if(cv.VersionData.size() > 1000000) { // 1MB limit
                        System.debug('File too large: ' + cv.Title);
                        attachments += '\n\n[FILE: ' + cv.Title + ' - Too large to process]';
                        continue;
                    }
                    
                    String base64Content = EncodingUtil.base64Encode(cv.VersionData);
                    Integer contentLength = base64Content.length();
                    
                    // Check if adding this content would exceed our limit
                    if(currentLength + contentLength > MAX_TOTAL_LENGTH) {
                        System.debug('Reached maximum content length limit');
                        attachments += '\n\n[Additional files omitted due to size constraints]';
                        break;
                    }
                    
                    // If this single file's content is too large, truncate it
                    if(contentLength > MAX_TOTAL_LENGTH) {
                        base64Content = base64Content.substring(0, MAX_TOTAL_LENGTH) + '... [content truncated]';
                    }
                    
                    attachments += '\n\n[FILE: ' + cv.Title + ' (' + cv.FileExtension + ')]\n' + base64Content;
                    currentLength += contentLength;
                    
                } catch(Exception e) {
                    System.debug('ERROR processing file ' + cv.Title + ': ' + e.getMessage());
                    System.debug('Stack trace: ' + e.getStackTraceString());
                    attachments += '\n\n[FILE: ' + cv.Title + ' - Failed to process]';
                }
            }
            
            System.debug('Total attachments string length: ' + attachments.length());
            return attachments;
            
        } catch(Exception e) {
            System.debug('ERROR in getAttachmentsBase64: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to process attachments: ' + e.getMessage());
        }
    }
    
    private static String buildFullPrompt(String operation, String context, String attachments, String prompt) {
        System.debug('Building full prompt');
        
        // Approximate token count (4 chars ≈ 1 token)
        Integer maxTokens = 150000; // Lower than max to leave room for response
        
        String basePrompt;
        if (operation == 'summarize') {
            basePrompt = 'Please provide a comprehensive summary of this Salesforce record including:\n\n' +
            '1. Overview of the main record details\n' +
            '2. Related records and their relationship to this record\n' +
            '3. Recent activity and tasks\n' +
            '4. Any files or attachments\n\n' +
            'Format as a clear, structured report.\n\n';
        } else {
            // For general questions, adjust the prompt based on whether there's a record context
            if (String.isBlank(context)) {
                basePrompt = 'Answer this question based on your knowledge:\n\n';
            } else {
                basePrompt = 'Answer this question about the Salesforce record:\n\n';
            }
        }
        
        // Calculate approximate tokens for each part
        Integer baseTokens = basePrompt.length() / 4;
        Integer contextTokens = context.length() / 4;
        Integer attachmentTokens = attachments.length() / 4;
        Integer promptTokens = prompt.length() / 4;
        
        // If total would exceed limit, trim components
        if ((baseTokens + contextTokens + attachmentTokens + promptTokens) > maxTokens) {
            // Allocate tokens proportionally
            Integer remainingTokens = maxTokens - baseTokens - promptTokens;
            if (remainingTokens > 0) {
                Double ratio = remainingTokens / (Double)(contextTokens + attachmentTokens);
                
                // Truncate context and attachments
                context = context.substring(0, Math.min(context.length(), 
                                                        (Integer)(contextTokens * ratio * 4)));
                if (String.isNotBlank(attachments)) {
                    attachments = attachments.substring(0, Math.min(attachments.length(), 
                                                                    (Integer)(attachmentTokens * ratio * 4)));
                }
            }
        }
        
        String fullPrompt = basePrompt;
        
        // Add context only if available
        if (String.isNotBlank(context)) {
            fullPrompt += context;
        }
        
        if (String.isNotBlank(attachments)) {
            fullPrompt += '\n\nATTACHMENTS AND FILES:\n' + attachments;
        }
        
        if (operation != 'summarize') {
            fullPrompt += '\n\nQUESTION: ' + prompt;
        }
        
        return fullPrompt;
    }
    
    private static String makeLLMCall(LLM_Configuration__mdt config, String prompt) {
        System.debug('Starting makeLLMCall');
        System.debug('Provider: ' + config.Provider__c);
        System.debug('Model: ' + config.Model_Name__c);
        System.debug('Base URL: ' + config.Base_URL__c);
        
        // Set up retry logic parameters
        Integer maxRetries = 3;
        Integer currentRetry = 0;
        Integer baseWaitMs = 1000; // Start with 1 second wait for retries
        
        while (currentRetry < maxRetries) {
            try {
                HttpRequest req = new HttpRequest();
                req.setEndpoint(config.Base_URL__c);
                req.setMethod('POST');
                req.setTimeout(120000); // 2 minutes timeout
                
                // Common headers for all providers
                req.setHeader('Content-Type', 'application/json');
                
                System.debug('Building request body');
                Map<String,Object> requestBody = new Map<String,Object>();
                
                // Extract instructions from prompt
                String instructions = 'Please provide a clear, explanatory response. Remember that the user may not be familiar with AI technology. Be professional yet accessible, and provide context for your answers. When appropriate, offer next steps or additional assistance. Use simple language and avoid technical jargon unless necessary, in which case explain the terms. IMPORTANT: When referencing previous messages in the conversation, do not add prefixes like "User:" or "You:" - just directly quote or paraphrase what was said without labeling who said it.';
                String cleanedPrompt = prompt.replace('IMPORTANT: ' + instructions + '\n\n', '');
                
                switch on config.Provider__c {
                    when 'Anthropic' {
                        System.debug('Preparing Anthropic request');
                        req.setHeader('x-api-key', config.API_Key__c);
                        req.setHeader('anthropic-version', '2023-06-01');
                        
                        requestBody = new Map<String,Object>{
                            'model' => config.Model_Name__c,
                            'max_tokens' => Integer.valueOf(config.Max_Tokens__c),
                            'temperature' => config.Temperature__c,
                            'system' => instructions,
                            'messages' => new List<Map<String,Object>>{
                                new Map<String,Object>{
                                    'role' => 'user',
                                    'content' => cleanedPrompt
                                }
                            }
                        };
                    }
                    when 'OpenAI', 'DeepSeek' {
                        System.debug('Preparing OpenAI/DeepSeek request');
                        req.setHeader('Authorization', 'Bearer ' + config.API_Key__c);
                        
                        List<Map<String,Object>> messages = new List<Map<String,Object>>();
                        
                        // Add system message with instructions
                        messages.add(new Map<String,Object>{
                            'role' => 'system',
                            'content' => instructions
                        });
                        
                        // Add user message with prompt
                        messages.add(new Map<String,Object>{
                            'role' => 'user',
                            'content' => cleanedPrompt
                        });
                        
                        requestBody = new Map<String,Object>{
                            'model' => config.Model_Name__c,
                            'messages' => messages,
                            'temperature' => config.Temperature__c,
                            'max_tokens' => Integer.valueOf(config.Max_Tokens__c)
                        };
                    }
                    when 'Google' {
                        System.debug('Preparing Google request');
                        req.setHeader('x-goog-api-key', config.API_Key__c);
                        
                        // Create generationConfig
                        Map<String,Object> generationConfig = new Map<String,Object>{
                            'temperature' => config.Temperature__c,
                            'maxOutputTokens' => Integer.valueOf(config.Max_Tokens__c),
                            'topP' => 0.95,
                            'topK' => 40
                        };
                        
                        // Create system instruction
                        List<Map<String,Object>> contents = new List<Map<String,Object>>();
                        
                        // Add system instruction
                        contents.add(new Map<String,Object>{
                            'role' => 'user',
                            'parts' => new List<Map<String,Object>>{
                                new Map<String,Object>{
                                    'text' => instructions
                                }
                            }
                        });
                        
                        // Add system response acknowledging instruction
                        contents.add(new Map<String,Object>{
                            'role' => 'model',
                            'parts' => new List<Map<String,Object>>{
                                new Map<String,Object>{
                                    'text' => 'I understand. I will provide direct, concise responses without explaining my reasoning or analysis process.'
                                }
                            }
                        });
                        
                        // Add user message with actual prompt
                        contents.add(new Map<String,Object>{
                            'role' => 'user',
                            'parts' => new List<Map<String,Object>>{
                                new Map<String,Object>{
                                    'text' => cleanedPrompt
                                }
                            }
                        });
                        
                        requestBody.put('contents', contents);
                        requestBody.put('model', config.Model_Name__c);
                        requestBody.put('generationConfig', generationConfig);
                    }
                    when else {
                        throw new AuraHandledException('Unsupported provider: ' + config.Provider__c);
                    }
                }
                
                String bodyJson = JSON.serialize(requestBody);
                System.debug('Request body: ' + bodyJson);
                req.setBody(bodyJson);
                
                System.debug('Making HTTP request...');
                HttpResponse res = new Http().send(req);
                System.debug('Response status: ' + res.getStatus());
                System.debug('Response code: ' + res.getStatusCode());
                
                // Handle non-200 responses
                if (res.getStatusCode() != 200) {
                    // Check for rate limiting or overloaded errors
                    if (res.getStatusCode() == 429 || res.getStatusCode() == 529) {
                        Integer waitTime = baseWaitMs * (Integer)Math.pow(2, currentRetry);
                        currentRetry++;
                        
                        if (currentRetry >= maxRetries) {
                            throw new AuraHandledException('Service is currently overloaded. Please try again later.');
                        }
                        
                        // Wait and retry (this is a simplified version since we can't actually wait in Apex)
                        System.debug('Rate limited or overloaded. Retry ' + currentRetry + 
                                    ' of ' + maxRetries + ' after ' + waitTime + 'ms');
                        continue;
                    }
                    
                    // For other errors, throw exception
                    String errorMsg = 'API Error: ' + res.getStatus() + ' - ' + res.getBody();
                    System.debug('ERROR: ' + errorMsg);
                    throw new AuraHandledException(errorMsg);
                }
                
                System.debug('Response body: ' + res.getBody());
                // Parse the response and return
                return parseResponse(config.Provider__c, res);
                
            } catch (Exception e) {
                System.debug('ERROR in makeLLMCall attempt ' + (currentRetry + 1) + ': ' + e.getMessage());
                System.debug('Stack trace: ' + e.getStackTraceString());
                
                // If it's the last retry or not a retryable error, throw the exception
                if (currentRetry >= maxRetries - 1 || !(e instanceof AuraHandledException)) {
                    throw e;
                }
                
                // Otherwise, increment retry counter and try again
                currentRetry++;
                System.debug('Retrying... (Attempt ' + currentRetry + ' of ' + maxRetries + ')');
            }
        }
        
        // This should never be reached due to the exception in the last retry
        throw new AuraHandledException('Failed to call LLM service after ' + maxRetries + ' attempts');
    }
    
    private static String parseResponse(String provider, HttpResponse res) {
        System.debug('Starting parseResponse for provider: ' + provider);
        System.debug('Response status code: ' + res.getStatusCode());
        
        if (res.getStatusCode() != 200) {
            String errorMsg = 'API Error: ' + res.getStatus() + ' - ' + res.getBody();
            System.debug('ERROR: ' + errorMsg);
            throw new AuraHandledException(errorMsg);
        }
        
        System.debug('Parsing response body: ' + res.getBody());
        Map<String,Object> response = (Map<String,Object>)JSON.deserializeUntyped(res.getBody());
        System.debug('Deserialized response: ' + response);
        
        try {
            switch on provider {
                when 'Anthropic' {
                    System.debug('Parsing Anthropic response');
                    List<Object> content = (List<Object>)response.get('content');
                    Map<String,Object> firstContent = (Map<String,Object>)content[0];
                    String text = (String)firstContent.get('text');
                    System.debug('Extracted text: ' + text);
                    return text;
                }
                when 'OpenAI', 'DeepSeek' {
                    System.debug('Parsing OpenAI/DeepSeek response');
                    List<Object> choices = (List<Object>)response.get('choices');
                    Map<String,Object> firstChoice = (Map<String,Object>)choices[0];
                    Map<String,Object> message = (Map<String,Object>)firstChoice.get('message');
                    String content = (String)message.get('content');
                    System.debug('Content extracted: ' + content);
                    return content;
                }
                when 'Google' {
                    // Handle Gemini response
                    System.debug('Parsing Google/Gemini response');
                    if (response.containsKey('candidates')) {
                        Object candidatesObj = response.get('candidates');
                        if (candidatesObj instanceof List<Object>) {
                            List<Object> candidates = (List<Object>)candidatesObj;
                            if (!candidates.isEmpty()) {
                                Map<String,Object> firstCandidate = (Map<String,Object>)candidates[0];
                                if (firstCandidate.containsKey('content')) {
                                    Map<String,Object> content = (Map<String,Object>)firstCandidate.get('content');
                                    if (content.containsKey('parts')) {
                                        List<Object> parts = (List<Object>)content.get('parts');
                                        if (!parts.isEmpty()) {
                                            Map<String,Object> firstPart = (Map<String,Object>)parts[0];
                                            if (firstPart.containsKey('text')) {
                                                String text = (String)firstPart.get('text');
                                                System.debug('Extracted text from Google/Gemini: ' + text);
                                                return text;
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                    // Fallback for Gemini
                    throw new AuraHandledException('Invalid response structure from Google/Gemini API');
                }
                when else {
                    throw new AuraHandledException('Unsupported provider: ' + provider);
                }
            }
        } catch (Exception e) {
            System.debug('ERROR parsing response: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to parse API response: ' + e.getMessage());
        }
    }
}