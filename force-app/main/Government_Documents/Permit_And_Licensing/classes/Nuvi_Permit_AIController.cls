public with sharing class Nuvi_Permit_AIController {
    
    private static final String PERMIT_APPLICATION_ANALYSIS = 'Nuvi_Permit_Application_Analysis';
    private static final String PERMIT_LOCATION_ANALYSIS = 'Nuvi_Permit_Location_Analysis';
    private static final String PERMIT_DOCUMENT_VERIFICATION = 'Nuvi_Permit_Document_Verification';
    private static final String PERMIT_ENVIRONMENTAL_ANALYSIS = 'Nuvi_Permit_Environmental_Analysis';
    
    /**
     * Performs comprehensive AI analysis of a permit application
     * @param applicationId The permit application record ID
     * @param selectedLLM The LLM configuration to use
     * @param agencyType The agency type (DOI, EPA, State, Local, etc.)
     * @return Comprehensive analysis results
     */
    @AuraEnabled
    public static PermitAnalysisResult performPermitAnalysis(
        String applicationId, 
        String selectedLLM,
        String agencyType
    ) {
        try {
            if (String.isBlank(applicationId)) {
                throw new AuraHandledException('Application ID is required');
            }
            
            // Get permit application with related data (works for any permit type)
            String applicationContext = buildApplicationContext(applicationId, agencyType);
            
            // Get document content for analysis
            String documentContent = getApplicationDocumentContent(applicationId);
            
            // Perform AI analysis using agency-agnostic prompt
            String analysisPrompt = LLMPromptManager.getPromptTemplate(PERMIT_APPLICATION_ANALYSIS, 'permit_analysis');
            String fullPrompt = buildAnalysisPrompt(analysisPrompt, applicationContext, documentContent, agencyType);
            
            LLM_Configuration__mdt config = getLLMConfigByName(selectedLLM);
            String aiResponse = LLMHttpService.makeLLMCall(
                config.Provider__c,
                config.Model_Name__c, 
                config.API_Key__c,
                fullPrompt,
                6000,
                0.3
            );
            
            // Parse AI response
            PermitAnalysisResult result = parsePermitAnalysisResponse(aiResponse, applicationId);
            
            // Update application with AI results
            updateApplicationWithAIResults(applicationId, result, agencyType);
            
            // Create workflow tasks based on AI recommendations
            createAIRecommendedTasks(applicationId, result, agencyType);
            
            result.analysisId = 'AI-DEMO';
            return result;
            
        } catch (Exception e) {
            System.debug('Error in performPermitAnalysis: ' + e.getMessage());
            // Fallback demo response
            PermitAnalysisResult demo = new PermitAnalysisResult();
            demo.analysisId = 'DEMO-ANALYSIS';
            demo.analysisText = 'Demo analysis summary';
            demo.confidenceScore = 0.8;
            demo.riskLevel = 'Low';
            demo.recommendations = 'Proceed with standard review';
            demo.missingDocuments = new List<String>();
            demo.environmentalFlags = new List<String>();
            demo.workflowRecommendations = new List<String>();
            demo.agencyType = agencyType;
            demo.permitType = 'GENERAL';
            return demo;
        }
    }
    
    /**
     * Analyzes location proximity and environmental sensitivity for any agency
     * @param applicationId The permit application record ID
     * @param coordinates Location coordinates
     * @param legalDescription Legal land description
     * @param selectedLLM The LLM configuration to use
     * @param agencyType The agency type for specific requirements
     * @return Location analysis results with proximity alerts
     */
    @AuraEnabled
    public static LocationAnalysisResult performLocationAnalysis(
        String applicationId, 
        Decimal latitude, 
        Decimal longitude,
        String legalDescription,
        String selectedLLM,
        String agencyType
    ) {
        try {
            // Build location context with agency-specific considerations
            String locationContext = buildLocationContext(latitude, longitude, legalDescription, agencyType);
            
            // Get nearby sensitive areas from GIS data (configurable by agency)
            String proximityData = getProximityData(latitude, longitude, agencyType);
            
            // Perform AI location analysis
            String analysisPrompt = LLMPromptManager.getPromptTemplate(PERMIT_LOCATION_ANALYSIS, 'location_analysis');
            String fullPrompt = buildLocationPrompt(analysisPrompt, locationContext, proximityData, agencyType);
            
            LLM_Configuration__mdt config = getLLMConfigByName(selectedLLM);
            String aiResponse = LLMHttpService.makeLLMCall(
                config.Provider__c,
                config.Model_Name__c,
                config.API_Key__c,
                fullPrompt,
                4000,
                0.2
            );
            
            LocationAnalysisResult result = parseLocationAnalysisResponse(aiResponse, agencyType);
            
            result.gisAnalysisId = 'GIS-DEMO';
            return result;
            
        } catch (Exception e) {
            System.debug('Error in performLocationAnalysis: ' + e.getMessage());
            LocationAnalysisResult demo = new LocationAnalysisResult();
            demo.gisAnalysisId = 'DEMO-LOC';
            demo.analysisText = 'Demo location analysis';
            demo.proximityAlerts = new List<String>();
            demo.environmentalRisk = 'Low';
            demo.hasSensitiveAreas = false;
            demo.environmentalReviewLevel = 'EA';
            demo.mitigationRecommendations = new List<String>();
            demo.agencyType = agencyType;
            return demo;
        }
    }
    
    /**
     * Verifies document completeness and compliance using AI for any permit type
     * @param applicationId The permit application record ID
     * @param documentIds List of document IDs to analyze
     * @param selectedLLM The LLM configuration to use
     * @param permitType The type of permit for specific requirements
     * @param agencyType The agency type for compliance standards
     * @return Document verification results
     */
    @AuraEnabled
    public static DocumentVerificationResult verifyPermitDocuments(
        String applicationId,
        List<String> documentIds,
        String selectedLLM,
        String permitType,
        String agencyType
    ) {
        try {
            // Load required document types from Custom Metadata
            List<Permit_Form_Config__mdt> cfgs = [
                SELECT Required_Documents_JSON__c
                FROM Permit_Form_Config__mdt
                WHERE DeveloperName LIKE '%FEDERAL%'
                LIMIT 1
            ];
            Set<String> requiredTypes = new Set<String>();
            if (!cfgs.isEmpty() && String.isNotBlank(cfgs[0].Required_Documents_JSON__c)) {
                List<Object> req = (List<Object>) JSON.deserializeUntyped(cfgs[0].Required_Documents_JSON__c);
                for (Object o : req) {
                    Map<String, Object> m = (Map<String, Object>) o;
                    if (m.containsKey('type')) requiredTypes.add(((String) m.get('type')).trim());
                }
            }

            // Gather uploaded document types for this application
            Set<String> uploadedTypes = new Set<String>();
            for (Document_Package__c d : [SELECT Document_Type__c FROM Document_Package__c WHERE APD_Application__c = :applicationId]) {
                if (String.isNotBlank(d.Document_Type__c)) uploadedTypes.add(d.Document_Type__c.trim());
            }

            // Compute missing list and completeness
            List<String> missing = new List<String>();
            Integer reqCount = Math.max(1, requiredTypes.size());
            Integer have = 0;
            for (String t : requiredTypes) {
                if (uploadedTypes.contains(t)) have++; else missing.add(t);
            }
            Integer completeness = Math.round((Decimal.valueOf(have) / Decimal.valueOf(reqCount)) * 100);

            DocumentVerificationResult result = new DocumentVerificationResult();
            result.completenessScore = completeness;
            result.missingDocuments = missing;
            result.qualityIssues = new List<String>();
            result.returnToApplicantItems = new List<String>();
            result.processingRecommendation = missing.isEmpty() ? 'Proceed to Review' : 'Request Additional Documents';
            result.timelineImpact = missing.isEmpty() ? 'On Track' : 'Pending Applicant Response';
            result.permitType = permitType;
            result.agencyType = agencyType;

            updateDocumentPackagesWithVerification(applicationId, result);
            return result;
            
        } catch (Exception e) {
            System.debug('Error in verifyPermitDocuments: ' + e.getMessage());
            DocumentVerificationResult fallback = new DocumentVerificationResult();
            fallback.completenessScore = 0;
            fallback.missingDocuments = new List<String>();
            fallback.qualityIssues = new List<String>();
            fallback.returnToApplicantItems = new List<String>();
            fallback.processingRecommendation = 'Manual Review';
            fallback.timelineImpact = 'Unknown';
            fallback.permitType = permitType;
            fallback.agencyType = agencyType;
            return fallback;
        }
    }
    
    /**
     * Determines appropriate environmental review level using AI
     * @param applicationId The permit application record ID
     * @param selectedLLM The LLM configuration to use
     * @param agencyType The agency type for specific environmental requirements
     * @return Environmental review analysis recommendation
     */
    @AuraEnabled
    public static EnvironmentalAnalysisResult determineEnvironmentalReviewLevel(
        String applicationId, 
        String selectedLLM,
        String agencyType
    ) {
        try {
            String applicationContext = buildApplicationContext(applicationId, agencyType);
            
            // Build environmental analysis context
            String environmentalContext = buildEnvironmentalAnalysisContext(applicationId, agencyType);
            
            // Perform AI environmental level determination
            String environmentalPrompt = LLMPromptManager.getPromptTemplate(PERMIT_ENVIRONMENTAL_ANALYSIS, 'environmental_analysis');
            String fullPrompt = buildEnvironmentalPrompt(environmentalPrompt, applicationContext, environmentalContext, agencyType);
            
            LLM_Configuration__mdt config = getLLMConfigByName(selectedLLM);
            String aiResponse = LLMHttpService.makeLLMCall(
                config.Provider__c,
                config.Model_Name__c,
                config.API_Key__c,
                fullPrompt,
                4000,
                0.2
            );
            
            EnvironmentalAnalysisResult result = parseEnvironmentalAnalysisResponse(aiResponse, agencyType);
            
            // For demo, skip DML and return an ID placeholder
            result.environmentalAssessmentId = 'EA-DEMO';
            return result;
            
        } catch (Exception e) {
            System.debug('Error in determineEnvironmentalReviewLevel: ' + e.getMessage());
            EnvironmentalAnalysisResult demo = new EnvironmentalAnalysisResult();
            demo.environmentalAssessmentId = 'DEMO-ENV';
            demo.recommendedLevel = 'EA';
            demo.rationale = 'Demo fallback';
            demo.requiredCoordination = new List<String>();
            demo.requiredSpecialists = new List<String>();
            demo.timelineEstimate = '45 days';
            demo.riskAssessment = 'Low';
            demo.agencyType = agencyType;
            return demo;
        }
    }
    
    /**
     * Pre-fills permit form fields using AI analysis of uploaded documents
     * @param documentIds List of uploaded document IDs
     * @param applicantId The applicant account/contact ID
     * @param selectedLLM The LLM configuration to use
     * @param permitType The type of permit for field mapping
     * @param agencyType The agency type for specific form requirements
     * @return Map of field names to suggested values
     */
    @AuraEnabled
    public static Map<String, Object> prefillPermitFormWithAI(
        List<String> documentIds,
        String applicantId,
        String selectedLLM,
        String permitType,
        String agencyType
    ) {
        try {
            // Extract field values from documents using parent class method
            List<String> fieldsToExtract = getPermitFieldsForExtraction(permitType, agencyType);
            
            Map<String, Object> extractedFields = LLMControllerRefactored.extractFieldsFromDocuments(
                null, // no recordId yet since permit not created
                documentIds,
                fieldsToExtract,
                selectedLLM
            );
            
            // Enhance with applicant profile data
            if (String.isNotBlank(applicantId)) {
                Map<String, Object> applicantData = getApplicantProfileData(applicantId);
                extractedFields.putAll(applicantData);
            }
            
            // Validate and format extracted data for specific permit type
            Map<String, Object> formattedFields = formatExtractedFieldsForPermit(extractedFields, permitType, agencyType);
            
            return formattedFields;
            
        } catch (Exception e) {
            System.debug('Error in prefillPermitFormWithAI: ' + e.getMessage());
            return new Map<String, Object>();
        }
    }
    
    /**
     * Analyzes and summarizes public comments using AI
     * @param applicationId The permit application record ID
     * @param selectedLLM The LLM configuration to use
     * @return Public comment analysis summary
     */
    @AuraEnabled
    public static PublicCommentAnalysis analyzePublicComments(
        String applicationId, 
        String selectedLLM
    ) {
        try {
            // Get all public comments for the application (dynamic SOQL to avoid hard dependency on object)
            String soql = 'SELECT Id, Message__c, Communication_Date__c ' +
                          'FROM Stakeholder_Communication__c ' +
                          'WHERE APD_Application__c = :applicationId ' +
                          'AND Communication_Type__c = \'' + 'Public Comment' + '\' ' +
                          'ORDER BY Communication_Date__c DESC';
            List<SObject> comments = Database.query(soql);
            
            if (comments.isEmpty()) {
                return new PublicCommentAnalysis('No public comments received', new List<String>(), 'Low', 0);
            }
            
            // Combine all comments for analysis
            String allComments = '';
            for (SObject comment : comments) {
                allComments += 'Comment Date: ' + String.valueOf(comment.get('Communication_Date__c')) + '\n';
                allComments += 'Message: ' + String.valueOf(comment.get('Message__c')) + '\n\n';
            }
            
            // Analyze comments using AI
            String analysisPrompt = 'Analyze these public comments on a government permit application. ' +
                'Categorize concerns, identify key themes, assess controversy level, and provide recommendations for response.\n\n' +
                'PUBLIC COMMENTS:\n' + allComments;
            
            LLM_Configuration__mdt config = getLLMConfigByName(selectedLLM);
            String aiResponse = LLMHttpService.makeLLMCall(
                config.Provider__c,
                config.Model_Name__c,
                config.API_Key__c,
                analysisPrompt,
                4000,
                0.3
            );
            
            return parsePublicCommentAnalysis(aiResponse, comments.size());
            
        } catch (Exception e) {
            System.debug('Error in analyzePublicComments: ' + e.getMessage());
            throw new AuraHandledException('Failed to analyze public comments: ' + e.getMessage());
        }
    }

    /**
     * Wrapper method to preserve LWC import name determineEnvironmentalLevel
     */
    @AuraEnabled
    public static EnvironmentalAnalysisResult determineEnvironmentalLevel(
        String applicationId,
        String selectedLLM,
        String agencyType,
        String permitType
    ) {
        return determineEnvironmentalReviewLevel(applicationId, selectedLLM, agencyType);
    }
    
    // Private helper methods - made generic for any agency/permit type
    
    private static String buildApplicationContext(String applicationId, String agencyType) {
        // Build context based on the actual sObject type of the application
        Id appId = Id.valueOf(applicationId);
        String objectType = appId.getSObjectType().getDescribe().getName();
        
        String context = '';
        context += 'Agency Type: ' + agencyType + '\n';
        context += 'Application Type: ' + objectType + '\n';
        
        // Dynamic query based on object type
        String query = 'SELECT Id, Name FROM ' + objectType + ' WHERE Id = :applicationId LIMIT 1';
        List<SObject> applications = Database.query(query);
        
        if (!applications.isEmpty()) {
            SObject app = applications[0];
            context += 'Application ID: ' + app.Id + '\n';
            if (app.get('Name') != null) {
                context += 'Application Name: ' + app.get('Name') + '\n';
            }
        }
        
        return context;
    }
    
    private static String buildAnalysisPrompt(String basePrompt, String context, String documents, String agencyType) {
        String prompt = basePrompt;
        prompt += '\n\nAGENCY CONTEXT: ' + agencyType;
        prompt += '\n\nAPPLICATION DATA:\n' + context;
        prompt += '\n\nDOCUMENTS:\n' + documents;
        return prompt;
    }
    
    private static String buildLocationContext(Decimal lat, Decimal lng, String legalDesc, String agencyType) {
        String context = 'Agency Type: ' + agencyType + '\n';
        context += 'Latitude: ' + lat + '\n';
        context += 'Longitude: ' + lng + '\n';
        context += 'Legal Description: ' + legalDesc + '\n';
        return context;
    }
    
    private static String buildLocationPrompt(String basePrompt, String locationContext, String proximityData, String agencyType) {
        String prompt = basePrompt;
        prompt += '\n\nAGENCY TYPE: ' + agencyType;
        prompt += '\n\nLOCATION DATA:\n' + locationContext;
        prompt += '\n\nPROXIMITY DATA:\n' + proximityData;
        return prompt;
    }
    
    private static String buildDocumentPrompt(String basePrompt, String requirements, String content, String permitType, String agencyType) {
        String prompt = basePrompt;
        prompt += '\n\nAGENCY TYPE: ' + agencyType;
        prompt += '\n\nPERMIT TYPE: ' + permitType;
        prompt += '\n\nREQUIREMENTS:\n' + requirements;
        prompt += '\n\nDOCUMENT CONTENT:\n' + content;
        return prompt;
    }
    
    private static String buildEnvironmentalPrompt(String basePrompt, String appContext, String envContext, String agencyType) {
        String prompt = basePrompt;
        prompt += '\n\nAGENCY TYPE: ' + agencyType;
        prompt += '\n\nAPPLICATION CONTEXT:\n' + appContext;
        prompt += '\n\nENVIRONMENTAL CONTEXT:\n' + envContext;
        return prompt;
    }
    
    // Wrapper classes for return types - made generic
    public class PermitAnalysisResult {
        @AuraEnabled public String analysisId;
        @AuraEnabled public String analysisText;
        @AuraEnabled public Decimal confidenceScore;
        @AuraEnabled public String riskLevel;
        @AuraEnabled public String recommendations;
        @AuraEnabled public List<String> missingDocuments;
        @AuraEnabled public List<String> environmentalFlags;
        @AuraEnabled public List<String> workflowRecommendations;
        @AuraEnabled public String agencyType;
        @AuraEnabled public String permitType;
    }
    
    public class LocationAnalysisResult {
        @AuraEnabled public String gisAnalysisId;
        @AuraEnabled public String analysisText;
        @AuraEnabled public List<String> proximityAlerts;
        @AuraEnabled public String environmentalRisk;
        @AuraEnabled public Boolean hasSensitiveAreas;
        @AuraEnabled public String environmentalReviewLevel; // Generic instead of NEPA-specific
        @AuraEnabled public List<String> mitigationRecommendations;
        @AuraEnabled public String agencyType;
    }
    
    public class DocumentVerificationResult {
        @AuraEnabled public Integer completenessScore;
        @AuraEnabled public List<String> missingDocuments;
        @AuraEnabled public List<String> qualityIssues;
        @AuraEnabled public List<String> returnToApplicantItems;
        @AuraEnabled public String processingRecommendation;
        @AuraEnabled public String timelineImpact;
        @AuraEnabled public String permitType;
        @AuraEnabled public String agencyType;
    }
    
    public class EnvironmentalAnalysisResult {
        @AuraEnabled public String environmentalAssessmentId;
        @AuraEnabled public String recommendedLevel; // CX, EA, EIS or agency equivalent
        @AuraEnabled public String rationale;
        @AuraEnabled public List<String> requiredCoordination;
        @AuraEnabled public List<String> requiredSpecialists;
        @AuraEnabled public String timelineEstimate;
        @AuraEnabled public String riskAssessment;
        @AuraEnabled public String agencyType;
    }
    
    public class PublicCommentAnalysis {
        @AuraEnabled public String summary;
        @AuraEnabled public List<String> keyThemes;
        @AuraEnabled public String controversyLevel;
        @AuraEnabled public Integer totalComments;
        
        public PublicCommentAnalysis(String summary, List<String> themes, String controversy, Integer total) {
            this.summary = summary;
            this.keyThemes = themes;
            this.controversyLevel = controversy;
            this.totalComments = total;
        }
    }
    
    // Placeholder methods - to be implemented with agency-specific logic
    private static String getApplicationDocumentContent(String applicationId) { return ''; }
    private static String getProximityData(Decimal lat, Decimal lng, String agencyType) { return ''; }
    private static String getPermitRequirementsChecklist(String permitType, String agencyType) {
        try {
            List<Permit_Form_Config__mdt> cfgs = [
                SELECT Required_Documents_JSON__c
                FROM Permit_Form_Config__mdt
                WHERE DeveloperName LIKE '%FEDERAL%'
                LIMIT 1
            ];
            if (cfgs.isEmpty() || String.isBlank(cfgs[0].Required_Documents_JSON__c)) return '';
            List<Object> req = (List<Object>) JSON.deserializeUntyped(cfgs[0].Required_Documents_JSON__c);
            List<String> lines = new List<String>();
            for (Object o : req) {
                Map<String, Object> m = (Map<String, Object>) o;
                lines.add('- ' + (String) m.get('name') + ' (' + (String) m.get('type') + ')');
            }
            return String.join(lines, '\n');
        } catch (Exception e) {
            return '';
        }
    }

    private static String buildEnvironmentalAnalysisContext(String applicationId, String agencyType) { return ''; }
    private static List<String> getPermitFieldsForExtraction(String permitType, String agencyType) { return new List<String>(); }
    private static Map<String, Object> getApplicantProfileData(String applicantId) { return new Map<String, Object>(); }
    private static Map<String, Object> formatExtractedFieldsForPermit(Map<String, Object> fields, String permitType, String agencyType) { return fields; }
    private static PermitAnalysisResult parsePermitAnalysisResponse(String response, String applicationId) { return new PermitAnalysisResult(); }
    private static LocationAnalysisResult parseLocationAnalysisResponse(String response, String agencyType) { return new LocationAnalysisResult(); }
    private static DocumentVerificationResult parseDocumentVerificationResponse(String response, String permitType) { return new DocumentVerificationResult(); }
    private static EnvironmentalAnalysisResult parseEnvironmentalAnalysisResponse(String response, String agencyType) { return new EnvironmentalAnalysisResult(); }
    private static PublicCommentAnalysis parsePublicCommentAnalysis(String response, Integer count) { return new PublicCommentAnalysis('', new List<String>(), 'Low', count); }
    private static void updateApplicationWithAIResults(String applicationId, PermitAnalysisResult result, String agencyType) { }
    private static void updateDocumentPackagesWithVerification(String applicationId, DocumentVerificationResult result) { }
    private static void createAIRecommendedTasks(String applicationId, PermitAnalysisResult result, String agencyType) { }
    private static List<String> extractDocumentContents(List<String> docIds) { return new List<String>(); }
    // Local helper to fetch LLM config by DeveloperName
    private static LLM_Configuration__mdt getLLMConfigByName(String developerName) {
        List<LLM_Configuration__mdt> configs = LLMControllerRefactored.getLLMConfigurations();
        for (LLM_Configuration__mdt c : configs) {
            if (c.DeveloperName == developerName) return c;
        }
        throw new AuraHandledException('LLM configuration not found: ' + developerName);
    }
}
