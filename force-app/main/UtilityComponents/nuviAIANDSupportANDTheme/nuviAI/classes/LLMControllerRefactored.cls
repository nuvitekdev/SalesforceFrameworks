public with sharing class LLMControllerRefactored {
    
    private static List<LLM_Configuration__mdt> mockConfigurations;
    
    @AuraEnabled(cacheable=true)
    public static List<LLM_Configuration__mdt> getLLMConfigurations() {
        if (Test.isRunningTest() && mockConfigurations != null) {
            return mockConfigurations;
        }
        
        try {
            return [
                SELECT Id, DeveloperName, Label, Provider__c, Model_Name__c, 
                       API_Key__c, Base_URL__c, Max_Tokens__c, Temperature__c,
                       IsActive__c, Supports_Files__c
                FROM LLM_Configuration__mdt
                WHERE IsActive__c = true
                WITH SECURITY_ENFORCED
            ];
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching LLM configurations: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static String handleRequest(
        String recordId,
        String prompt,
        String operation,
        String selectedLLM,
        String objectsToQuery,
        String relatedObjects,
        String contextPrompt
    ) {
        try {
            validateInputs(prompt, selectedLLM, operation);
            
            LLM_Configuration__mdt config = getLLMConfig(selectedLLM);
            
            String context = buildContext(recordId, objectsToQuery, relatedObjects);
            String attachments = getAttachments(recordId);
            
            String basePrompt = LLMPromptManager.getPromptTemplate(operation, operation);
            if (String.isNotBlank(contextPrompt)) {
                basePrompt = contextPrompt + '\n\n' + basePrompt;
            }
            
            Integer maxTokens = config.Max_Tokens__c != null ? Integer.valueOf(config.Max_Tokens__c) : 4000;
            String fullPrompt = LLMPromptManager.buildFullPrompt(
                basePrompt, context, attachments, prompt, maxTokens
            );
            
            return LLMHttpService.makeLLMCall(
                config.Provider__c,
                config.Model_Name__c,
                config.API_Key__c,
                fullPrompt,
                maxTokens,
                config.Temperature__c
            );
        } catch (Exception e) {
            throw new AuraHandledException('Error processing request: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static String checkRecordForAnomalies(String recordId, String selectedLLM, String rules) {
        try {
            if (String.isBlank(recordId)) {
                throw new AuraHandledException('Record ID is required');
            }
            
            LLM_Configuration__mdt config = getLLMConfig(selectedLLM);
            String context = LLMDataHelper.getRecordContext(recordId);
            
            String prompt = LLMPromptManager.getPromptTemplate('Anomaly', 'anomaly');
            
            if (String.isNotBlank(rules)) {
                prompt += '\n\nCOMPLIANCE RULES:\n' + rules + '\n\n';
            }
            
            prompt += '\n\nRECORD DATA:\n' + context;
            
            return LLMHttpService.makeLLMCall(
                config.Provider__c,
                config.Model_Name__c,
                config.API_Key__c,
                prompt,
                4000,
                0.3
            );
        } catch (Exception e) {
            throw new AuraHandledException('Error checking for anomalies: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static void saveAnalysisToField(String recordId, String fieldApiName, String analysisText) {
        try {
            if (String.isBlank(recordId) || String.isBlank(fieldApiName) || String.isBlank(analysisText)) {
                throw new AuraHandledException('All parameters are required');
            }
            
            Id recId = Id.valueOf(recordId);
            String objectName = recId.getSObjectType().getDescribe().getName();
            
            if (!hasFieldAccess(objectName, fieldApiName, 'UPDATE')) {
                throw new AuraHandledException('Insufficient permissions to update field');
            }
            
            SObject record = Schema.getGlobalDescribe().get(objectName).newSObject(recId);
            record.put(fieldApiName, analysisText);
            
            update record;
        } catch (Exception e) {
            throw new AuraHandledException('Error saving analysis: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static String processImagesWithAI(String recordId, String userSuppliedPrompt) {
        try {
            // Get base64 encoded attachments - ONLY include image types
            List<Map<String, String>> attachments = getDocumentsForVisionAnalysis(recordId, false);
            if (attachments == null || attachments.isEmpty()) {
                return 'No images found for this record.';
            }
            
            // Get API Key from custom metadata for Vision
            List<LLM_Configuration__mdt> configs = [
                SELECT Id, API_Key__c, Model_Name__c, Base_URL__c, Supports_Files__c
                FROM LLM_Configuration__mdt
                WHERE DeveloperName = 'OpenAI_GPT4_Vision'
                WITH SECURITY_ENFORCED
            ];
            
            if (configs.isEmpty()) {
                return 'OpenAI GPT4 Vision configuration not found. Please configure it in custom metadata.';
            }
            
            LLM_Configuration__mdt config = configs[0];
            
            String enhancedPrompt = buildVisionPrompt(userSuppliedPrompt, attachments);
            
            return processWithVisionAPI(config, enhancedPrompt, attachments);
        } catch (Exception e) {
            throw new AuraHandledException('Error processing images: ' + e.getMessage());
        }
    }
    
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getPdfAttachmentsForRecord(String recordId) {
        try {
            if (String.isBlank(recordId)) {
                return new List<Map<String, String>>();
            }
            
            List<ContentDocumentLink> docLinks = [
                SELECT ContentDocumentId, ContentDocument.Title, 
                       ContentDocument.FileType, ContentDocument.ContentSize,
                       ContentDocument.LatestPublishedVersionId
                FROM ContentDocumentLink
                WHERE LinkedEntityId = :recordId
                AND (ContentDocument.FileType = 'PDF' 
                     OR ContentDocument.FileExtension = 'pdf')
                WITH SECURITY_ENFORCED
                ORDER BY ContentDocument.CreatedDate DESC
                LIMIT 50
            ];
            
            List<Map<String, String>> pdfList = new List<Map<String, String>>();
            for (ContentDocumentLink link : docLinks) {
                Map<String, String> pdfInfo = new Map<String, String>{
                    'id' => link.ContentDocumentId,
                    'title' => link.ContentDocument.Title,
                    'size' => LLMDataHelper.formatFileSize(link.ContentDocument.ContentSize),
                    'versionId' => link.ContentDocument.LatestPublishedVersionId
                };
                pdfList.add(pdfInfo);
            }
            
            return pdfList;
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching PDF attachments: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static String processPdfDocumentWithAI(
        String recordId,
        List<String> contentDocumentIds,
        String prompt,
        String selectedLLM
    ) {
        try {
            if (contentDocumentIds == null || contentDocumentIds.isEmpty()) {
                throw new AuraHandledException('No documents selected');
            }
            
            LLM_Configuration__mdt config = getLLMConfig(selectedLLM);
            
            List<String> pdfContents = extractPdfContents(contentDocumentIds);
            String combinedContent = String.join(pdfContents, '\n\n---\n\n');
            
            String documentPrompt = LLMPromptManager.getPromptTemplate('DocumentAnalysis', 'documentanalysis');
            documentPrompt += '\n\nDocuments Content:\n' + combinedContent;
            documentPrompt += '\n\nUser Request:\n' + prompt;
            
            return LLMHttpService.makeLLMCall(
                config.Provider__c,
                config.Model_Name__c,
                config.API_Key__c,
                documentPrompt,
                4000,
                0.7
            );
        } catch (Exception e) {
            throw new AuraHandledException('Error processing PDF: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static Map<String, Object> getObjectMetadataFromId(String recordId) {
        try {
            if (String.isBlank(recordId)) {
                throw new AuraHandledException('Record ID is required');
            }
            
            Id recId = Id.valueOf(recordId);
            Schema.DescribeSObjectResult describe = recId.getSObjectType().getDescribe();
            
            Map<String, Object> metadata = new Map<String, Object>{
                'objectApiName' => describe.getName(),
                'objectLabel' => describe.getLabel(),
                'fields' => getFieldMetadata(describe)
            };
            
            return metadata;
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching metadata: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static Map<String, Object> extractFieldsFromDocuments(
        String recordId,
        List<String> contentDocumentIds,
        List<String> targetFieldApiNames,
        String selectedLLM
    ) {
        try {
            validateFieldExtractionInputs(contentDocumentIds, targetFieldApiNames);
            
            LLM_Configuration__mdt config = getLLMConfig(selectedLLM);
            List<String> pdfContents = extractPdfContents(contentDocumentIds);
            
            String extractionPrompt = LLMPromptManager.getPromptTemplate('FieldExtraction', 'fieldextraction');
            extractionPrompt += 'Requested Fields: ' + String.join(targetFieldApiNames, ', ') + '\n\n';
            extractionPrompt += 'Document Content:\n' + String.join(pdfContents, '\n\n');
            
            String aiResponse = LLMHttpService.makeLLMCall(
                config.Provider__c,
                config.Model_Name__c,
                config.API_Key__c,
                extractionPrompt,
                4000,
                0.3
            );
            
            return buildFieldExtractionResult(recordId, targetFieldApiNames, aiResponse);
        } catch (Exception e) {
            throw new AuraHandledException('Error extracting fields: ' + e.getMessage());
        }
    }

    @AuraEnabled
    public static Map<String, Object> extractFieldsFromAnalyzedContent(
        String recordId,
        List<String> analyzedDocumentContents,
        List<String> targetFieldApiNames,
        String selectedLLM
    ) {
        try {
            if (String.isBlank(recordId)) {
                throw new AuraHandledException('Record ID is required');
            }
            if (analyzedDocumentContents == null || analyzedDocumentContents.isEmpty()) {
                throw new AuraHandledException('No analyzed content provided');
            }
            if (targetFieldApiNames == null || targetFieldApiNames.isEmpty()) {
                throw new AuraHandledException('No fields selected for extraction');
            }

            LLM_Configuration__mdt config = getLLMConfig(selectedLLM);
            String extractionPrompt = LLMPromptManager.getPromptTemplate('FieldExtraction', 'fieldextraction');
            extractionPrompt += 'Requested Fields: ' + String.join(targetFieldApiNames, ', ') + '\n\n';
            extractionPrompt += 'Document Content (Analyzed):\n' + String.join(analyzedDocumentContents, '\n\n');

            String aiResponse = LLMHttpService.makeLLMCall(
                config.Provider__c,
                config.Model_Name__c,
                config.API_Key__c,
                extractionPrompt,
                4000,
                0.3
            );

            return buildFieldExtractionResult(recordId, targetFieldApiNames, aiResponse);
        } catch (Exception e) {
            throw new AuraHandledException('Error extracting fields from analyzed content: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static void updateRecordFields(String recordId, Map<String, Object> fieldValues) {
        try {
            if (String.isBlank(recordId) || fieldValues == null || fieldValues.isEmpty()) {
                throw new AuraHandledException('Invalid parameters');
            }
            
            Id recId = Id.valueOf(recordId);
            String objectName = recId.getSObjectType().getDescribe().getName();
            
            SObject record = Schema.getGlobalDescribe().get(objectName).newSObject(recId);
            
            for (String fieldName : fieldValues.keySet()) {
                if (hasFieldAccess(objectName, fieldName, 'UPDATE')) {
                    Object value = fieldValues.get(fieldName);
                    try {
                        Schema.DescribeFieldResult fieldDescribe = Schema.getGlobalDescribe().get(objectName).getDescribe().fields.getMap().get(fieldName).getDescribe();
                        Schema.DisplayType fieldType = fieldDescribe.getType();
                        if (value == null) {
                            record.put(fieldName, null);
                        } else if (fieldType == Schema.DisplayType.DATE) {
                            record.put(fieldName, (value instanceof Date) ? value : Date.valueOf(String.valueOf(value)));
                        } else if (fieldType == Schema.DisplayType.DATETIME) {
                            record.put(fieldName, (value instanceof Datetime) ? value : Datetime.valueOf(String.valueOf(value)));
                        } else if (fieldType == Schema.DisplayType.BOOLEAN) {
                            record.put(fieldName, (value instanceof Boolean) ? value : Boolean.valueOf(String.valueOf(value)));
                        } else if (fieldType == Schema.DisplayType.CURRENCY || fieldType == Schema.DisplayType.DOUBLE) {
                            record.put(fieldName, (value instanceof Decimal) ? value : Decimal.valueOf(String.valueOf(value)));
                        } else if (fieldType == Schema.DisplayType.INTEGER) {
                            record.put(fieldName, (value instanceof Integer) ? value : Integer.valueOf(String.valueOf(value)));
                        } else {
                            record.put(fieldName, String.valueOf(value));
                        }
                    } catch (Exception typeEx) {
                        throw new AuraHandledException('Invalid value format for field ' + fieldName + ': ' + typeEx.getMessage());
                    }
                }
            }
            
            update record;
        } catch (Exception e) {
            throw new AuraHandledException('Error updating record: ' + e.getMessage());
        }
    }
    
    // Private helper methods
    private static void validateInputs(String prompt, String selectedLLM, String operation) {
        // Allow empty prompt for certain operations that rely on context
        // e.g., summarize/report/anomaly/documentanalysis/fieldextraction/imageanalysis
        Boolean promptRequired = true;
        if (String.isNotBlank(operation)) {
            String op = operation.toLowerCase();
            // Only strictly require a prompt for ad-hoc questions
            if (op != 'question' && op != 'ask') {
                promptRequired = false;
            }
        }

        if (promptRequired && String.isBlank(prompt)) {
            throw new AuraHandledException('Please enter a prompt');
        }
        if (String.isBlank(selectedLLM)) {
            throw new AuraHandledException('Please select an LLM configuration');
        }
    }
    
    private static LLM_Configuration__mdt getLLMConfig(String configName) {
        List<LLM_Configuration__mdt> configs = getLLMConfigurations();
        
        for (LLM_Configuration__mdt config : configs) {
            if (config.DeveloperName == configName) {
                return config;
            }
        }
        
        throw new AuraHandledException('LLM configuration not found: ' + configName);
    }
    
    private static String buildContext(String recordId, String objectsToQuery, String relatedObjects) {
        String context = '';
        
        if (String.isNotBlank(recordId)) {
            context = LLMDataHelper.getRecordContext(recordId);
            
            if (String.isNotBlank(relatedObjects)) {
                String relatedData = LLMDataHelper.getRelatedRecords(recordId, relatedObjects);
                if (String.isNotBlank(relatedData)) {
                    context += '\n\n' + relatedData;
                }
            }
        }
        
        if (String.isNotBlank(objectsToQuery)) {
            String reportData = getReportData(objectsToQuery);
            if (String.isNotBlank(reportData)) {
                context += '\n\n' + reportData;
            }
        }
        
        return context;
    }
    
    private static String getAttachments(String recordId) {
        if (String.isBlank(recordId)) {
            return '';
        }
        
        return LLMDataHelper.getDocumentSummaries(recordId);
    }
    
    
    private static Boolean hasFieldAccess(String objectName, String fieldName, String accessType) {
        try {
            Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectName);
            if (sObjType == null) {
                return false;
            }
            
            Schema.DescribeFieldResult fieldDescribe = sObjType.getDescribe()
                .fields.getMap().get(fieldName).getDescribe();
            
            if (accessType == 'UPDATE') {
                return fieldDescribe.isUpdateable();
            } else if (accessType == 'CREATE') {
                return fieldDescribe.isCreateable();
            } else {
                return fieldDescribe.isAccessible();
            }
        } catch (Exception e) {
            return false;
        }
    }
    
    private static List<Map<String, Object>> prepareImageData(List<String> contentVersionIds) {
        List<Map<String, Object>> imageData = new List<Map<String, Object>>();
        
        List<ContentVersion> versions = [
            SELECT Id, VersionData, FileType, Title
            FROM ContentVersion
            WHERE Id IN :contentVersionIds
            WITH SECURITY_ENFORCED
        ];
        
        for (ContentVersion cv : versions) {
            Map<String, Object> imgMap = new Map<String, Object>{
                'data' => EncodingUtil.base64Encode(cv.VersionData),
                'type' => cv.FileType,
                'title' => cv.Title
            };
            imageData.add(imgMap);
        }
        
        return imageData;
    }
    
    // Removed unused placeholder processWithVisionAPI overload (Object map)
    
    private static List<String> extractPdfContents(List<String> contentDocumentIds) {
        // Implementation for PDF content extraction
        // This would handle reading PDF content from ContentVersion records
        return new List<String>{'PDF content extracted'};
    }
    
    private static List<Map<String, Object>> getFieldMetadata(Schema.DescribeSObjectResult describe) {
        List<Map<String, Object>> fields = new List<Map<String, Object>>();
        
        Map<String, Schema.SObjectField> fieldMap = describe.fields.getMap();
        for (String fieldName : fieldMap.keySet()) {
            Schema.DescribeFieldResult fieldDescribe = fieldMap.get(fieldName).getDescribe();
            
            if (fieldDescribe.isUpdateable()) {
                Map<String, Object> fieldInfo = new Map<String, Object>{
                    'apiName' => fieldDescribe.getName(),
                    'label' => fieldDescribe.getLabel(),
                    'type' => String.valueOf(fieldDescribe.getType()),
                    'required' => fieldDescribe.isNillable() == false
                };
                fields.add(fieldInfo);
            }
        }
        
        return fields;
    }
    
    private static void validateFieldExtractionInputs(
        List<String> contentDocumentIds,
        List<String> targetFieldApiNames
    ) {
        if (contentDocumentIds == null || contentDocumentIds.isEmpty()) {
            throw new AuraHandledException('No documents selected');
        }
        
        if (targetFieldApiNames == null || targetFieldApiNames.isEmpty()) {
            throw new AuraHandledException('No fields selected for extraction');
        }
    }
    
    private static Map<String, Object> buildFieldExtractionResult(String recordId, List<String> targetFieldApiNames, String aiResponse) {
        try {
            Id recId = Id.valueOf(recordId);
            String objectName = recId.getSObjectType().getDescribe().getName();
            Map<String, Schema.SObjectField> allFieldsMap = Schema.getGlobalDescribe().get(objectName).getDescribe().fields.getMap();

            // Prepare base map with metadata and current values
            Map<String, Map<String, Object>> fieldsData = new Map<String, Map<String, Object>>();
            List<String> fieldsToQuery = new List<String>();
            for (String fieldName : targetFieldApiNames) {
                if (allFieldsMap.containsKey(fieldName)) {
                    Schema.DescribeFieldResult dfr = allFieldsMap.get(fieldName).getDescribe();
                    if (dfr.isAccessible()) {
                        Map<String, Object> fieldInfo = new Map<String, Object>{
                            'apiName' => fieldName,
                            'label' => dfr.getLabel(),
                            'type' => dfr.getType().name(),
                            'currentValue' => null,
                            'suggestedValues' => new List<String>()
                        };
                        fieldsData.put(fieldName, fieldInfo);
                        fieldsToQuery.add(fieldName);
                    }
                }
            }
            if (!fieldsToQuery.isEmpty()) {
                String soql = 'SELECT ' + String.join(fieldsToQuery, ',') + ' FROM ' + objectName + ' WHERE Id = :recId LIMIT 1';
                SObject rec = Database.query(soql);
                for (String fn : fieldsToQuery) {
                    if (fieldsData.containsKey(fn)) {
                        fieldsData.get(fn).put('currentValue', rec.get(fn));
                    }
                }
            }

            // Clean and parse AI JSON into suggestions map
            String cleaned = aiResponse;
            if (cleaned == null) cleaned = '';
            if (cleaned.startsWith('```json')) {
                cleaned = cleaned.substring('```json'.length());
            }
            if (cleaned.endsWith('```')) {
                cleaned = cleaned.substring(0, cleaned.length() - 3);
            }
            cleaned = cleaned.trim();

            Map<String, Object> aiSuggestions;
            try {
                aiSuggestions = (Map<String, Object>) JSON.deserializeUntyped(cleaned);
            } catch (Exception je) {
                aiSuggestions = new Map<String, Object>();
            }

            if (aiSuggestions != null) {
                for (String fieldName : targetFieldApiNames) {
                    if (fieldsData.containsKey(fieldName) && aiSuggestions.containsKey(fieldName)) {
                        Object raw = aiSuggestions.get(fieldName);
                        if (raw instanceof List<Object>) {
                            List<String> sugg = new List<String>();
                            for (Object o : (List<Object>) raw) {
                                if (o != null) sugg.add(String.valueOf(o));
                            }
                            fieldsData.get(fieldName).put('suggestedValues', sugg);
                        } else if (raw instanceof String) {
                            fieldsData.get(fieldName).put('suggestedValues', new List<String>{ (String) raw });
                        }
                    }
                }
            }

            return new Map<String, Object>{ 'fields' => fieldsData, 'recordId' => recordId };
        } catch (Exception e) {
            throw new AuraHandledException('Error building extraction result: ' + e.getMessage());
        }
    }
    
    @TestVisible
    private static void setMockConfigurations(List<LLM_Configuration__mdt> configs) {
        mockConfigurations = configs;
    }
    
    private static List<Map<String, String>> getDocumentsForVisionAnalysis(String recordId, Boolean includePdfs) {
        List<Map<String, String>> documents = new List<Map<String, String>>();
        
        if (String.isBlank(recordId)) {
            return documents;
        }
        
        try {
            List<ContentDocumentLink> docLinks = [
                SELECT ContentDocumentId, ContentDocument.LatestPublishedVersionId
                FROM ContentDocumentLink
                WHERE LinkedEntityId = :recordId
                WITH SECURITY_ENFORCED
                LIMIT 100
            ];
            
            if (docLinks.isEmpty()) {
                return documents;
            }
            
            Set<Id> versionIds = new Set<Id>();
            for (ContentDocumentLink link : docLinks) {
                versionIds.add(link.ContentDocument.LatestPublishedVersionId);
            }
            
            String query = 'SELECT Id, VersionData, FileType, Title, ContentSize, FileExtension ' +
                          'FROM ContentVersion WHERE Id IN :versionIds ';
            
            if (includePdfs) {
                query += 'AND (FileType IN (\'PNG\', \'JPG\', \'JPEG\', \'GIF\', \'BMP\', \'WEBP\') OR FileType = \'PDF\') ';
            } else {
                query += 'AND FileType IN (\'PNG\', \'JPG\', \'JPEG\', \'GIF\', \'BMP\', \'WEBP\') ';
            }
            
            query += 'WITH SECURITY_ENFORCED';
            
            List<ContentVersion> versions = Database.query(query);
            
            for (ContentVersion cv : versions) {
                Map<String, String> docMap = new Map<String, String>{
                    'fileName' => cv.Title + '.' + cv.FileExtension,
                    'contentType' => cv.FileType,
                    'base64' => EncodingUtil.base64Encode(cv.VersionData),
                    'fileSize' => LLMDataHelper.formatFileSize(cv.ContentSize)
                };
                documents.add(docMap);
            }
        } catch (Exception e) {
            System.debug('Error getting documents for vision analysis: ' + e.getMessage());
        }
        
        return documents;
    }
    
    private static String buildVisionPrompt(String userSuppliedPrompt, List<Map<String, String>> attachments) {
        String enhancedPrompt = String.isNotBlank(userSuppliedPrompt)
            ? userSuppliedPrompt
            : 'Analyze these images in detail.';
        enhancedPrompt += '\n\n';
        
        // Add formatting instructions
        enhancedPrompt += LLMPromptManager.getPromptTemplate('ImageAnalysis', 'imageanalysis');
        
        enhancedPrompt += '\nImage Information Provided by System:\n';
        Integer imageIndex = 1;
        
        for (Map<String, String> attachment : attachments) {
            String fileName = attachment.get('fileName');
            String contentType = attachment.get('contentType');
            String fileSize = attachment.get('fileSize');
            
            enhancedPrompt += 'Image ' + imageIndex + ': ' + fileName;
            enhancedPrompt += ' (Type: ' + contentType + ')';
            
            if (fileSize != null) {
                enhancedPrompt += ' - Size: ' + fileSize;
            }
            
            enhancedPrompt += '\n';
            imageIndex++;
        }
        
        return enhancedPrompt;
    }
    
    private static String processWithVisionAPI(LLM_Configuration__mdt config, String prompt, List<Map<String, String>> attachments) {
        try {
            HttpRequest req = new HttpRequest();
            req.setEndpoint('https://api.openai.com/v1/chat/completions');
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setHeader('Authorization', 'Bearer ' + config.API_Key__c);
            req.setTimeout(120000);
            
            Map<String, Object> requestBody = new Map<String, Object>();
            requestBody.put('model', config.Model_Name__c != null ? config.Model_Name__c : 'gpt-4-vision-preview');
            requestBody.put('max_tokens', 4000);
            
            List<Map<String, Object>> messages = new List<Map<String, Object>>();
            Map<String, Object> userMessage = new Map<String, Object>();
            userMessage.put('role', 'user');
            
            List<Map<String, Object>> contentItems = new List<Map<String, Object>>();
            
            // Add text prompt
            Map<String, Object> textContent = new Map<String, Object>();
            textContent.put('type', 'text');
            textContent.put('text', prompt);
            contentItems.add(textContent);
            
            // Add images
            for (Map<String, String> attachment : attachments) {
                Map<String, Object> imageContent = new Map<String, Object>();
                imageContent.put('type', 'image_url');
                
                Map<String, Object> imageUrl = new Map<String, Object>();
                imageUrl.put('url', 'data:image/jpeg;base64,' + attachment.get('base64'));
                imageContent.put('image_url', imageUrl);
                
                contentItems.add(imageContent);
            }
            
            userMessage.put('content', contentItems);
            messages.add(userMessage);
            requestBody.put('messages', messages);
            
            String body = JSON.serialize(requestBody);
            req.setBody(body);
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            if (res.getStatusCode() == 200) {
                Map<String, Object> responseMap = (Map<String, Object>)JSON.deserializeUntyped(res.getBody());
                List<Object> choices = (List<Object>)responseMap.get('choices');
                if (choices != null && !choices.isEmpty()) {
                    Map<String, Object> choice = (Map<String, Object>)choices[0];
                    Map<String, Object> message = (Map<String, Object>)choice.get('message');
                    return (String)message.get('content');
                }
            } else {
                return 'Error: ' + res.getStatusCode() + ' - ' + res.getBody();
            }
        } catch (Exception e) {
            return 'Error processing vision request: ' + e.getMessage();
        }
        
        return 'Unable to process images';
    }
    
    private static String getReportData(String objectsToQuery) {
        if (String.isBlank(objectsToQuery)) {
            return '';
        }
        
        List<String> objectList = objectsToQuery.split(',');
        List<String> results = new List<String>();
        
        for (String objName : objectList) {
            String trimmedObjName = objName.trim();
            String objectData = queryObjectForReport(trimmedObjName);
            if (String.isNotBlank(objectData)) {
                results.add(objectData);
            }
        }
        
        return String.join(results, '\n\n');
    }
    
    private static String queryObjectForReport(String objectName) {
        try {
            Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectName);
            if (sObjType == null) {
                return '';
            }
            
            // Build a basic query for the object
            String query = 'SELECT Id, Name FROM ' + objectName + ' WITH SECURITY_ENFORCED LIMIT 100';
            List<SObject> records = Database.query(query);
            
            if (records.isEmpty()) {
                return objectName + ': No records found';
            }
            
            return objectName + ': ' + records.size() + ' records found';
        } catch (Exception e) {
            System.debug('Error querying object ' + objectName + ': ' + e.getMessage());
            return '';
        }
    }
}
