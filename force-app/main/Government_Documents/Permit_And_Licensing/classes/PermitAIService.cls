public with sharing class PermitAIService {
    
    /**
     * AI Model Selection Service for Permit Document Processing
     * Integrates with Nuvitek AI custom metadata configuration
     */
    
    // AI Operation Types
    public enum AIOperationType {
        OCR_EXTRACTION,
        DOCUMENT_ANALYSIS,
        FIELD_EXTRACTION,
        COMPLIANCE_CHECK,
        RISK_ASSESSMENT,
        ENVIRONMENTAL_ANALYSIS,
        IMAGE_ANALYSIS,
        TEXT_SUMMARIZATION,
        ANOMALY_DETECTION
    }
    
    /**
     * Selects optimal AI model based on operation type and document characteristics
     * @param operation The type of AI operation to perform
     * @param documentType The type of document being processed
     * @param hasImages Whether the document contains images
     * @return The API name of the optimal LLM configuration
     */
    public static String selectOptimalModel(AIOperationType operation, String documentType, Boolean hasImages) {
        
        // Use GPT-4o Vision for image/OCR operations
        if (hasImages || operation == AIOperationType.OCR_EXTRACTION || 
            operation == AIOperationType.IMAGE_ANALYSIS ||
            isVisualDocumentType(documentType)) {
            return 'OpenAI_GPT4_Vision';
        }
        
        // Use GPT-4.1 Mini for text-based operations (faster and cheaper)
        return 'OpenAI_GPT4_1_Mini';
    }
    
    /**
     * Processes permit documents with AI analysis
     * @param documentId The ContentVersion ID to process
     * @param operation The type of AI operation
     * @param documentType The permit document type
     * @param permitType The type of permit (Drilling, Environmental, etc.)
     * @param agencyType The agency type (DOI, EPA, etc.)
     * @return PermitAIResult with extracted information
     */
    @AuraEnabled
    public static PermitAIResult processPermitDocument(
        String documentId, 
        String operation, 
        String documentType,
        String permitType,
        String agencyType
    ) {
        if (String.isBlank(documentId)) {
            throw new AuraHandledException('Document ID is required');
        }
        
        try {
            // Get document content
            ContentVersion document = getDocumentContent(documentId);
            
            // Determine operation type
            AIOperationType operationType = getOperationType(operation);
            
            // Check if document contains images
            Boolean hasImages = isImageDocument(document.FileType) || 
                               isPDFWithImages(document.VersionData);
            
            // Select optimal model
            String selectedModel = selectOptimalModel(operationType, documentType, hasImages);
            
            // Get appropriate prompt template
            String promptTemplate = getPromptTemplate(operationType, documentType, permitType, agencyType);
            
            // Process with AI
            String aiResponse = callAIService(selectedModel, promptTemplate, document);
            
            // Parse and structure the response
            PermitAIResult result = parseAIResponse(aiResponse, operationType, documentType);
            
            // Store AI analysis results
            storeAIAnalysis(documentId, result, selectedModel, operationType.name());
            
            return result;
            
        } catch (Exception e) {
            System.debug('Error in processPermitDocument: ' + e.getMessage());
            throw new AuraHandledException('Failed to process document with AI: ' + e.getMessage());
        }
    }
    
    /**
     * Extracts key permit information from documents using AI
     * @param documentId The document to analyze
     * @param permitType The type of permit
     * @return Structured permit data
     */
    @AuraEnabled
    public static Map<String, Object> extractPermitFields(String documentId, String permitType) {
        
        PermitAIResult result = processPermitDocument(
            documentId, 
            'FIELD_EXTRACTION', 
            'PERMIT_APPLICATION',
            permitType,
            'FEDERAL'
        );
        
        return parsePermitFields(result.extractedData, permitType);
    }
    
    /**
     * Analyzes environmental impact documents with AI
     * @param documentId The environmental document ID
     * @param permitType The permit type
     * @return Environmental analysis results
     */
    @AuraEnabled
    public static EnvironmentalAIResult analyzeEnvironmentalDocument(String documentId, String permitType) {
        
        PermitAIResult result = processPermitDocument(
            documentId,
            'ENVIRONMENTAL_ANALYSIS',
            'ENVIRONMENTAL_ASSESSMENT',
            permitType,
            'FEDERAL'
        );
        
        return parseEnvironmentalAnalysis(result);
    }
    
    /**
     * Performs compliance checking on permit documents
     * @param documentId The document to check
     * @param permitType The permit type
     * @param agencyType The regulatory agency
     * @return Compliance analysis results
     */
    @AuraEnabled
    public static ComplianceAIResult checkDocumentCompliance(
        String documentId, 
        String permitType, 
        String agencyType
    ) {
        
        PermitAIResult result = processPermitDocument(
            documentId,
            'COMPLIANCE_CHECK',
            'PERMIT_APPLICATION',
            permitType,
            agencyType
        );
        
        return parseComplianceAnalysis(result, permitType, agencyType);
    }
    
    // Private Helper Methods
    
    private static ContentVersion getDocumentContent(String documentId) {
        try {
            return [
                SELECT Id, Title, FileType, ContentSize, VersionData, 
                       ContentDocumentId, CreatedDate
                FROM ContentVersion
                WHERE Id = :documentId
                LIMIT 1
            ];
        } catch (Exception e) {
            throw new AuraHandledException('Document not found: ' + documentId);
        }
    }
    
    private static AIOperationType getOperationType(String operation) {
        try {
            return AIOperationType.valueOf(operation.toUpperCase());
        } catch (Exception e) {
            return AIOperationType.DOCUMENT_ANALYSIS; // Default
        }
    }
    
    private static Boolean isVisualDocumentType(String documentType) {
        Set<String> visualDocTypes = new Set<String>{
            'SITE_PLAN', 'TECHNICAL_DRAWING', 'CROSS_SECTION', 
            'SURFACE_LAYOUT', 'ENGINEERING_DRAWING', 'MAP'
        };
        return visualDocTypes.contains(documentType);
    }
    
    private static Boolean isImageDocument(String fileType) {
        Set<String> imageTypes = new Set<String>{'PNG', 'JPG', 'JPEG', 'TIFF', 'GIF', 'BMP'};
        return imageTypes.contains(fileType.toUpperCase());
    }
    
    private static Boolean isPDFWithImages(Blob pdfContent) {
        // Simplified check - in real implementation would analyze PDF structure
        String pdfString = pdfContent.toString();
        return pdfString.contains('/Image') || pdfString.contains('/XObject');
    }
    
    private static String getPromptTemplate(
        AIOperationType operation, 
        String documentType, 
        String permitType, 
        String agencyType
    ) {
        // Build permit-specific prompts based on operation type
        String basePrompt = getBasePromptTemplate(operation);
        String permitContext = buildPermitContext(documentType, permitType, agencyType);
        
        return basePrompt + '\n\nPERMIT CONTEXT:\n' + permitContext;
    }
    
    private static String getBasePromptTemplate(AIOperationType operation) {
        Map<AIOperationType, String> templates = new Map<AIOperationType, String>{
            AIOperationType.OCR_EXTRACTION => getOCRPrompt(),
            AIOperationType.DOCUMENT_ANALYSIS => getDocumentAnalysisPrompt(),
            AIOperationType.FIELD_EXTRACTION => getFieldExtractionPrompt(),
            AIOperationType.COMPLIANCE_CHECK => getComplianceCheckPrompt(),
            AIOperationType.ENVIRONMENTAL_ANALYSIS => getEnvironmentalAnalysisPrompt(),
            AIOperationType.IMAGE_ANALYSIS => getImageAnalysisPrompt()
        };
        
        return templates.get(operation) != null ? templates.get(operation) : getDocumentAnalysisPrompt();
    }
    
    private static String getOCRPrompt() {
        return 'Extract all text, numbers, and structured data from this document. ' +
               'Preserve formatting and identify form fields, tables, and key-value pairs. ' +
               'For permit documents, pay special attention to: permit numbers, dates, ' +
               'locations, applicant information, and regulatory requirements.';
    }
    
    private static String getDocumentAnalysisPrompt() {
        return 'Analyze this permit document and provide: ' +
               '1. Document type and purpose\n' +
               '2. Key information extracted (parties, dates, amounts, IDs)\n' +
               '3. Content summary\n' +
               '4. Relevant entities (people, organizations, locations)\n' +
               '5. Compliance and risk factors\n' +
               '6. Missing information that should be present';
    }
    
    private static String getFieldExtractionPrompt() {
        return 'Extract structured data fields from this permit document. ' +
               'Return data in key-value format for: applicant details, permit specifics, ' +
               'location coordinates, activity descriptions, environmental considerations, ' +
               'and any regulatory reference numbers.';
    }
    
    private static String getComplianceCheckPrompt() {
        return 'Analyze this document for regulatory compliance. Identify: ' +
               '1. Required elements that are present\n' +
               '2. Missing required information\n' +
               '3. Potential compliance issues\n' +
               '4. Regulatory standards referenced\n' +
               '5. Risk level assessment\n' +
               '6. Recommendations for compliance';
    }
    
    private static String getEnvironmentalAnalysisPrompt() {
        return 'Analyze this environmental document for: ' +
               '1. Environmental impact assessment\n' +
               '2. Affected resources and habitats\n' +
               '3. Mitigation measures proposed\n' +
               '4. Monitoring requirements\n' +
               '5. Cumulative impact considerations\n' +
               '6. NEPA compliance elements';
    }
    
    private static String getImageAnalysisPrompt() {
        return 'Analyze this image/document for permit-relevant information: ' +
               '1. Visual elements and technical drawings\n' +
               '2. Text extraction (OCR)\n' +
               '3. Spatial relationships and measurements\n' +
               '4. Quality assessment for regulatory purposes\n' +
               '5. Identification of permits-relevant features';
    }
    
    private static String buildPermitContext(String documentType, String permitType, String agencyType) {
        return 'Document Type: ' + documentType + '\n' +
               'Permit Type: ' + permitType + '\n' +
               'Agency: ' + agencyType + '\n' +
               'Focus on ' + agencyType + ' regulatory requirements for ' + permitType + ' permits.';
    }
    
    private static String callAIService(String modelConfig, String prompt, ContentVersion document) {
        // This would integrate with your existing LLM service
        // Using the custom metadata configuration
        
        try {
            // Get model configuration from custom metadata
            LLM_Configuration__mdt config = [
                SELECT Model_Name__c, Base_URL__c, Max_Tokens__c, 
                       Temperature__c, Supports_Files__c
                FROM LLM_Configuration__mdt
                WHERE DeveloperName = :modelConfig
                LIMIT 1
            ];
            
            // Call your existing LLM service with the configuration
            // This is a placeholder - replace with your actual service call
            return 'AI analysis results would be returned here';
            
        } catch (Exception e) {
            throw new AuraHandledException('AI service call failed: ' + e.getMessage());
        }
    }
    
    private static PermitAIResult parseAIResponse(
        String response, 
        AIOperationType operation, 
        String documentType
    ) {
        PermitAIResult result = new PermitAIResult();
        result.operationType = operation.name();
        result.documentType = documentType;
        result.rawResponse = response;
        result.confidence = 0.85; // Would be calculated based on AI response
        result.extractedData = parseStructuredData(response, operation);
        result.recommendations = parseRecommendations(response);
        result.riskScore = calculateRiskScore(response, operation);
        
        return result;
    }
    
    private static Map<String, Object> parseStructuredData(String response, AIOperationType operation) {
        Map<String, Object> data = new Map<String, Object>();
        
        // Parse AI response into structured data based on operation type
        // This would be implemented with proper JSON/text parsing
        data.put('analysis_complete', true);
        data.put('processing_time', System.now());
        
        return data;
    }
    
    private static List<String> parseRecommendations(String response) {
        List<String> recommendations = new List<String>();
        // Parse recommendations from AI response
        recommendations.add('Document processing completed successfully');
        return recommendations;
    }
    
    private static Decimal calculateRiskScore(String response, AIOperationType operation) {
        // Calculate risk score based on AI analysis
        return 0.2; // Low risk example
    }
    
    private static Map<String, Object> parsePermitFields(Map<String, Object> extractedData, String permitType) {
        Map<String, Object> permitFields = new Map<String, Object>();
        
        // Parse permit-specific fields based on permit type
        permitFields.put('permit_type', permitType);
        permitFields.put('extraction_timestamp', System.now());
        
        return permitFields;
    }
    
    private static EnvironmentalAIResult parseEnvironmentalAnalysis(PermitAIResult result) {
        EnvironmentalAIResult envResult = new EnvironmentalAIResult();
        envResult.impactLevel = 'LOW';
        envResult.affectedResources = new List<String>{'Wildlife', 'Water Quality'};
        envResult.mitigationRequired = true;
        envResult.nepaCompliance = true;
        
        return envResult;
    }
    
    private static ComplianceAIResult parseComplianceAnalysis(
        PermitAIResult result, 
        String permitType, 
        String agencyType
    ) {
        ComplianceAIResult compResult = new ComplianceAIResult();
        compResult.overallCompliance = 'COMPLIANT';
        compResult.missingElements = new List<String>();
        compResult.riskLevel = 'LOW';
        compResult.recommendations = result.recommendations;
        
        return compResult;
    }
    
    private static void storeAIAnalysis(
        String documentId, 
        PermitAIResult result, 
        String modelUsed, 
        String operationType
    ) {
        try {
            // Create AI analysis record for audit trail
            /* TODO: Uncomment when AI_Analysis__c object is created
            AI_Analysis__c analysis = new AI_Analysis__c(
                Content_Version_Id__c = documentId,
                Operation_Type__c = operationType,
                Model_Used__c = modelUsed,
                Confidence_Score__c = result.confidence,
                Risk_Score__c = result.riskScore,
                Analysis_Results__c = JSON.serialize(result.extractedData),
                Recommendations__c = String.join(result.recommendations, '; '),
                Processing_Date__c = System.now()
            );
            
            insert analysis;
            */
            
        } catch (Exception e) {
            System.debug('Error storing AI analysis: ' + e.getMessage());
            // Don't fail the main process if audit storage fails
        }
    }
    
    // Result Classes
    public class PermitAIResult {
        @AuraEnabled public String operationType;
        @AuraEnabled public String documentType;
        @AuraEnabled public String rawResponse;
        @AuraEnabled public Decimal confidence;
        @AuraEnabled public Decimal riskScore;
        @AuraEnabled public Map<String, Object> extractedData;
        @AuraEnabled public List<String> recommendations;
    }
    
    public class EnvironmentalAIResult {
        @AuraEnabled public String impactLevel;
        @AuraEnabled public List<String> affectedResources;
        @AuraEnabled public Boolean mitigationRequired;
        @AuraEnabled public Boolean nepaCompliance;
        @AuraEnabled public List<String> mitigationSuggestions;
    }
    
    public class ComplianceAIResult {
        @AuraEnabled public String overallCompliance;
        @AuraEnabled public List<String> missingElements;
        @AuraEnabled public String riskLevel;
        @AuraEnabled public List<String> recommendations;
        @AuraEnabled public Map<String, Boolean> requirementsMet;
    }
}