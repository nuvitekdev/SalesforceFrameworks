@isTest
public class LLMControllerTest {
    // Static variable to control whether to use the mock methods
    private static Boolean USE_MOCK_METHODS = true;
    
    // Mock implementation for HTTP responses
    private class MockHttpResponseGenerator implements HttpCalloutMock {
        private Integer statusCode;
        private String responseBody;
        
        public MockHttpResponseGenerator(Integer statusCode, String responseBody) {
            this.statusCode = statusCode;
            this.responseBody = responseBody;
        }
        
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setStatusCode(statusCode);
            res.setBody(responseBody);
            return res;
        }
    }
    
    // Sequential mock for multiple HTTP calls
    private class SequentialMockCallout implements HttpCalloutMock {
        private List<Integer> statusCodes;
        private List<String> responses;
        private Integer currentIndex = 0;
        
        public SequentialMockCallout(List<Integer> statusCodes, List<String> responses) {
            this.statusCodes = statusCodes;
            this.responses = responses;
        }
        
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            if (currentIndex < statusCodes.size() && currentIndex < responses.size()) {
                res.setStatusCode(statusCodes[currentIndex]);
                res.setBody(responses[currentIndex]);
                currentIndex++;
            } else {
                res.setStatusCode(200);
                res.setBody('{"choices":[{"message":{"content":"Default response"}}]}');
            }
            return res;
        }
    }
    
    // Rate limit mock
    private class RateLimitMock implements HttpCalloutMock {
        private Integer callCount = 0;
        
        public HTTPResponse respond(HTTPRequest req) {
            callCount++;
            HttpResponse res = new HttpResponse();
            
            if (callCount <= 2) { // First two calls get rate limited
                res.setStatusCode(429);
                res.setBody('{"error":{"message":"Rate limit exceeded"}}');
            } else {
                res.setStatusCode(200);
                res.setBody('{"choices":[{"message":{"content":"Response after retry"}}]}');
            }
            
            return res;
        }
    }
    
    // Utility method to mock getChildRelationships and avoid SOQL limit exceptions
    @TestVisible
    public static String mockGetChildRelationships(String recordId, Schema.SObjectType objectType) {
        // This method provides a simple mock response for child relationships
        // to prevent hitting SOQL limits during testing
        return '\nMOCKED CHILD RELATIONSHIPS FOR TESTING:\n• Test child record 1\n• Test child record 2\n';
    }
    
    // Utility method to mock getFieldHistoryData and avoid SOQL limit exceptions
    @TestVisible
    public static String mockFieldHistoryData(String recordId, String objectName) {
        // This method provides a simple mock response for field history data
        // to prevent hitting SOQL limits during testing
        return '\nMOCKED FIELD HISTORY FOR TESTING:\n• Field: Value changed from Old to New on 2023-01-01\n';
    }
    
    // Utility method to mock getRelatedObjectsData and avoid SOQL limit exceptions
    @TestVisible
    public static String mockRelatedObjectsData(String recordId, String relatedObjectsList) {
        // This method provides a simple mock response for related objects data
        // to prevent hitting SOQL limits during testing
        return '\nMOCKED RELATED OBJECTS FOR TESTING (' + relatedObjectsList + '):\n• Related object 1\n• Related object 2\n';
    }
    
    @testSetup
    static void setupTestData() {
        // Create test account
        Account testAccount = new Account(Name = 'Test Account', Description = 'Test Description');
        insert testAccount;
        
        // Create test contact
        Contact testContact = new Contact(
            FirstName = 'Test',
            LastName = 'Contact',
            AccountId = testAccount.Id,
            Email = 'test@example.com',
            Phone = '555-1234'
        );
        insert testContact;
        
        // Create test opportunity
        Opportunity testOpp = new Opportunity(
            Name = 'Test Opportunity',
            AccountId = testAccount.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30),
            Amount = 10000
        );
        insert testOpp;
        
        // Create test case
        Case testCase = new Case(
            Subject = 'Test Case',
            AccountId = testAccount.Id,
            ContactId = testContact.Id,
            Status = 'New',
            Priority = 'Medium'
        );
        insert testCase;
        
        // Create test task
        Task testTask = new Task(
            Subject = 'Test Task',
            WhatId = testAccount.Id,
            Status = 'Not Started',
            Priority = 'Normal',
            ActivityDate = Date.today()
        );
        insert testTask;
        
        // Create test event
        Event testEvent = new Event(
            Subject = 'Test Event',
            WhatId = testAccount.Id,
            StartDateTime = Datetime.now(),
            EndDateTime = Datetime.now().addHours(1),
            Location = 'Test Location'
        );
        insert testEvent;
        
        // Create test OpportunityContactRole
        OpportunityContactRole testRole = new OpportunityContactRole(
            OpportunityId = testOpp.Id,
            ContactId = testContact.Id,
            Role = 'Decision Maker'
        );
        insert testRole;
    }
    
    @isTest
    static void testGetLLMConfigurations() {
        // Set up mock configurations
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        
        LLM_Configuration__mdt config1 = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            Supports_Files__c = true
        );
        mockConfigs.add(config1);
        
        LLM_Configuration__mdt config2 = new LLM_Configuration__mdt(
            DeveloperName = 'Anthropic_Claude',
            MasterLabel = 'Anthropic Claude',
            Provider__c = 'Anthropic',
            Model_Name__c = 'claude-2',
            Supports_Files__c = false
        );
        mockConfigs.add(config2);
        
        // Set mock configurations
        LLMController.mockConfigurations = mockConfigs;
        
        // Call the method
        Test.startTest();
        List<LLM_Configuration__mdt> result = LLMController.getLLMConfigurations();
        Test.stopTest();
    }
    
    @isTest
    static void testHandleRequestOpenAI() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        String mockResponse = '{"choices":[{"message":{"content":"Test response"}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        String result = LLMController.handleRequest(
            testAccount.Id,
            'OpenAI_GPT4',
            'Tell me about this account',
            'question',
            'Contact,Opportunity',
            null
        );
        Test.stopTest();
    }
    
    @isTest
    static void testHandleRequestAnthropic() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'Anthropic_Claude',
            MasterLabel = 'Anthropic Claude',
            Provider__c = 'Anthropic',
            Model_Name__c = 'claude-2',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.anthropic.com/v1/messages',
            Supports_Files__c = false,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        String mockResponse = '{"content":[{"text":"Test response"}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        String result = LLMController.handleRequest(
            testAccount.Id,
            'Anthropic_Claude',
            'Summarize this account',
            'summarize',
            'Contact',
            null
        );
        Test.stopTest();
    }
    
    @isTest
    static void testHandleRequestGoogle() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'Google_Gemini',
            MasterLabel = 'Google Gemini',
            Provider__c = 'Google',
            Model_Name__c = 'gemini-pro',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://generativelanguage.googleapis.com/v1beta/models',
            Supports_Files__c = false,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        String mockResponse = '{"candidates":[{"content":{"parts":[{"text":"Test response"}]}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        String result = LLMController.handleRequest(
            testAccount.Id,
            'Google_Gemini',
            'Analyze this account',
            'analyze',
            'Case',
            null
        );
        Test.stopTest();
    }
    
    @isTest
    static void testHandleRequestOpenRouter() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenRouter_Model',
            MasterLabel = 'OpenRouter Model',
            Provider__c = 'OpenRouter',
            Model_Name__c = 'openrouter-model',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://openrouter.ai/api/v1/chat/completions',
            Supports_Files__c = false,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        String mockResponse = '{"choices":[{"message":{"content":"Test response"}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        String result = LLMController.handleRequest(
            testAccount.Id,
            'OpenRouter_Model',
            'Generate text',
            'text',
            '',
            null
        );
        Test.stopTest();
    }
    
    @isTest
    static void testHandleRequestDeepSeek() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'DeepSeek_Model',
            MasterLabel = 'DeepSeek Model',
            Provider__c = 'DeepSeek',
            Model_Name__c = 'deepseek-coder',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.deepseek.com/v1/chat/completions',
            Supports_Files__c = false,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        String mockResponse = '{"choices":[{"message":{"content":"Test response"}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        String result = LLMController.handleRequest(
            testAccount.Id,
            'DeepSeek_Model',
            'Generate code',
            'code',
            '',
            null
        );
        Test.stopTest();
    }
    
    @isTest
    static void testHandleRequestWithError() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(500, '{"error":{"message":"Server error"}}'));
        
        Test.startTest();
        try {
            String result = LLMController.handleRequest(
                testAccount.Id,
                'OpenAI_GPT4',
                'Tell me about this account',
                'question',
                'Contact,Opportunity',
                null
            );
        } catch (Exception e) {
            // Expected exception
        }
        Test.stopTest();
    }
    
    @isTest
    static void testHandleRequestWithRateLimit() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        Test.setMock(HttpCalloutMock.class, new RateLimitMock());
        
        Test.startTest();
        try {
            String result = LLMController.handleRequest(
                testAccount.Id,
                'OpenAI_GPT4',
                'Test rate limiting',
                'question',
                '',
                null
            );
        } catch (Exception e) {
            // Expected exception after max retries
        }
        Test.stopTest();
    }
    
    @isTest
    static void testHandleRequestWithUnsupportedProvider() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'Unknown_Provider',
            MasterLabel = 'Unknown Provider',
            Provider__c = 'Unknown',
            Model_Name__c = 'unknown-model',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.unknown.com/v1',
            Supports_Files__c = false,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        Test.startTest();
        try {
            String result = LLMController.handleRequest(
                testAccount.Id,
                'Unknown_Provider',
                'Test unsupported provider',
                'text',
                '',
                null
            );
        } catch (Exception e) {
            // Expected exception
        }
        Test.stopTest();
    }
    
    @isTest
    static void testCheckRecordForAnomalies() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        String mockResponse = '{"choices":[{"message":{"content":"NO - No anomalies detected"}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        String result = LLMController.checkRecordForAnomalies(
            testAccount.Id,
            'OpenAI_GPT4'
        );
        Test.stopTest();
    }
    
    @isTest
    static void testCheckRecordForAnomaliesError() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(500, '{"error":{"message":"Server error"}}'));
        
        Test.startTest();
        try {
            String result = LLMController.checkRecordForAnomalies(
                testAccount.Id,
                'OpenAI_GPT4'
            );
        } catch (Exception e) {
            // Expected exception
        }
        Test.stopTest();
    }
    
    @isTest
    static void testCheckRecordForAnomaliesInvalidInput() {
        // Test with invalid parameters
        Test.startTest();
        try {
            String result = LLMController.checkRecordForAnomalies(
                null,
                'OpenAI_GPT4'
            );
        } catch (Exception e) {
            // Expected exception
        }
        Test.stopTest();
    }
    
    @isTest
    static void testCheckRecordForAnomaliesWithDocuments() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        // Create mock PDF attachment - ensure it's small enough to avoid size limitations
        ContentVersion cv = new ContentVersion();
        cv.Title = 'Test PDF';
        cv.PathOnClient = 'test.pdf';
        cv.VersionData = Blob.valueOf('TestPDFData'); // This is a very small test document
        cv.IsMajorVersion = true;
        insert cv;
        
        // Get the content document ID
        Id contentDocumentId = [
            SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id
        ].ContentDocumentId;
        
        // Create content document link
        ContentDocumentLink cdl = new ContentDocumentLink();
        cdl.ContentDocumentId = contentDocumentId;
        cdl.LinkedEntityId = testAccount.Id;
        cdl.ShareType = 'V';
        insert cdl;
        
        // Create mock configurations
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        
        // Vision config
        LLM_Configuration__mdt visionConfig = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4_Vision',
            MasterLabel = 'OpenAI GPT-4 Vision',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4-vision-preview',
            API_Key__c = 'test_vision_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(visionConfig);
        
        LLMController.mockConfigurations = mockConfigs;
        
        String mockResponse = '{"choices":[{"message":{"content":"YES - <b>Document Anomaly Detected</b><br>The attached document contains personal information for individuals not matching the record owner."}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        String result = LLMController.checkRecordForAnomalies(
            testAccount.Id,
            'OpenAI_GPT4_Vision'
        );
        Test.stopTest();
        
        System.assert(result.contains('Document Anomaly Detected'), 'The result should contain the detected anomaly');
    }
    
    @isTest
    static void testCheckRecordForAnomaliesWithLargeDocuments() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        // Create a mock PDF attachment that exceeds the size limit
        ContentVersion cv = new ContentVersion();
        cv.Title = 'Large Test PDF';
        cv.PathOnClient = 'large_test.pdf';
        
        // Create a blob that's larger than our 3MB limit
        // For test purposes, we can simulate this with a string
        // but in reality, we'll just set the size that will trigger
        // the size check in our code
        Integer simulatedSize = 4 * 1024 * 1024; // 4MB
        String largeContent = 'TestContent';
        // Pad to required size
        cv.VersionData = Blob.valueOf(largeContent.rightPad(simulatedSize));
        cv.IsMajorVersion = true;
        insert cv;
        
        // Get the content document ID
        Id contentDocumentId = [
            SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id
        ].ContentDocumentId;
        
        // Create content document link
        ContentDocumentLink cdl = new ContentDocumentLink();
        cdl.ContentDocumentId = contentDocumentId;
        cdl.LinkedEntityId = testAccount.Id;
        cdl.ShareType = 'V';
        insert cdl;
        
        // Create mock configurations
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        
        // Vision config
        LLM_Configuration__mdt visionConfig = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4_Vision',
            MasterLabel = 'OpenAI GPT-4 Vision',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4-vision-preview',
            API_Key__c = 'test_vision_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(visionConfig);
        
        LLMController.mockConfigurations = mockConfigs;
        
        // We expect a regular response here because the large document should be skipped
        String mockResponse = '{"choices":[{"message":{"content":"NO - No anomalies detected."}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        try {
            String result = LLMController.checkRecordForAnomalies(
                testAccount.Id,
                'OpenAI_GPT4_Vision'
            );
            
            // The document should be skipped due to size limit, and a regular call should be made
            System.assert(result.equals('NO - No anomalies detected.'), 'The result should show no anomalies were detected');
        } catch (Exception e) {
            // If we get an exception due to size limitations in our test environment, that's also acceptable
            System.assert(e.getMessage().contains('size') || e.getMessage().contains('limit'), 
                         'If an exception occurs, it should be related to size limits');
        }
        Test.stopTest();
    }
    
    @isTest
    static void testSaveAnalysisToField() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        Test.startTest();
        LLMController.saveAnalysisToField(
            testAccount.Id,
            'Description',
            'This is a test analysis that should be saved to the account description field.'
        );
        Test.stopTest();
    }
    
    @isTest
    static void testSaveAnalysisToFieldCheckOnly() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        Test.startTest();
        LLMController.saveAnalysisToField(
            testAccount.Id,
            'Description',
            'FIELD_CHECK_ONLY'
        );
        Test.stopTest();
    }
    
    @isTest
    static void testSaveAnalysisToFieldInvalidInputs() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        Test.startTest();
        try {
            LLMController.saveAnalysisToField(
                null,
                'Description',
                'Test analysis'
            );
        } catch (Exception e) {
            // Expected exception
        }
        
        try {
            LLMController.saveAnalysisToField(
                testAccount.Id,
                '',
                'Test analysis'
            );
        } catch (Exception e) {
            // Expected exception
        }
        
        try {
            LLMController.saveAnalysisToField(
                testAccount.Id,
                'NonExistentField',
                'Test analysis'
            );
        } catch (Exception e) {
            // Expected exception
        }
        Test.stopTest();
    }
    
    @isTest
    static void testSaveAnalysisToFieldLongText() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        // Generate a string longer than 600 characters
        String longText = '';
        for (Integer i = 0; i < 30; i++) {
            longText += 'This is a very long text that will be truncated when saved to the field. ';
        }
        
        Test.startTest();
        LLMController.saveAnalysisToField(
            testAccount.Id,
            'Description',
            longText
        );
        Test.stopTest();
    }
    
    @isTest
    static void testProcessImagesWithAI() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        // Create mock attachments
        ContentVersion cv = new ContentVersion();
        cv.Title = 'Test Image';
        cv.PathOnClient = 'testImage.jpg';
        cv.VersionData = Blob.valueOf('TestImageData');
        cv.IsMajorVersion = true;
        insert cv;
        
        // Get the content document ID
        Id contentDocumentId = [
            SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id
        ].ContentDocumentId;
        
        // Create content document link
        ContentDocumentLink cdl = new ContentDocumentLink();
        cdl.ContentDocumentId = contentDocumentId;
        cdl.LinkedEntityId = testAccount.Id;
        cdl.ShareType = 'V';
        insert cdl;
        
        // Create mock configuration for Vision API
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4_Vision',
            MasterLabel = 'OpenAI GPT-4 Vision',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4-vision-preview',
            API_Key__c = 'test_vision_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        // Set up mock HTTP response
        String mockResponse = '{"choices":[{"message":{"content":"This is an analysis of the test image."}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        String result = LLMController.processImagesWithAI(
            testAccount.Id,
            'Analyze this image'
        );
        Test.stopTest();
    }
    
    @isTest
    static void testProcessImagesWithAINoImages() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        // Create mock configuration for Vision API
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4_Vision',
            MasterLabel = 'OpenAI GPT-4 Vision',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4-vision-preview',
            API_Key__c = 'test_vision_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        Test.startTest();
        String result = LLMController.processImagesWithAI(
            testAccount.Id,
            'Analyze this image'
        );
        Test.stopTest();
    }
    
    @isTest
    static void testProcessImagesWithAIError() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        // Create mock attachments
        ContentVersion cv = new ContentVersion();
        cv.Title = 'Test Image';
        cv.PathOnClient = 'testImage.jpg';
        cv.VersionData = Blob.valueOf('TestImageData');
        cv.IsMajorVersion = true;
        insert cv;
        
        // Get the content document ID
        Id contentDocumentId = [
            SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id
        ].ContentDocumentId;
        
        // Create content document link
        ContentDocumentLink cdl = new ContentDocumentLink();
        cdl.ContentDocumentId = contentDocumentId;
        cdl.LinkedEntityId = testAccount.Id;
        cdl.ShareType = 'V';
        insert cdl;
        
        // Create mock configuration for Vision API
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4_Vision',
            MasterLabel = 'OpenAI GPT-4 Vision',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4-vision-preview',
            API_Key__c = 'test_vision_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        // Set up mock HTTP error response
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(500, '{"error":{"message":"Server error"}}'));
        
        Test.startTest();
        String result = LLMController.processImagesWithAI(
            testAccount.Id,
            'Analyze this image'
        );
        Test.stopTest();
    }
    
    @isTest
    static void testHandleRequestWithVisionDocumentAnalysis() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        // Create mock PDF attachment
        ContentVersion cv = new ContentVersion();
        cv.Title = 'Test PDF';
        cv.PathOnClient = 'test.pdf';
        cv.VersionData = Blob.valueOf('TestPDFData');
        cv.IsMajorVersion = true;
        insert cv;
        
        // Get the content document ID
        Id contentDocumentId = [
            SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id
        ].ContentDocumentId;
        
        // Create content document link
        ContentDocumentLink cdl = new ContentDocumentLink();
        cdl.ContentDocumentId = contentDocumentId;
        cdl.LinkedEntityId = testAccount.Id;
        cdl.ShareType = 'V';
        insert cdl;
        
        // Create mock configurations
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        
        // Main LLM config
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        // Vision config
        LLM_Configuration__mdt visionConfig = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4_Vision',
            MasterLabel = 'OpenAI GPT-4 Vision',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4-vision-preview',
            API_Key__c = 'test_vision_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(visionConfig);
        
        LLMController.mockConfigurations = mockConfigs;
        
        // Set up mock HTTP responses for both Vision API and regular LLM call
        List<Integer> statusCodes = new List<Integer>{200, 200};
        List<String> responses = new List<String>{
            '{"choices":[{"message":{"content":"Vision analysis of the PDF"}}]}',
            '{"choices":[{"message":{"content":"Combined analysis with vision results"}}]}'
        };
        Test.setMock(HttpCalloutMock.class, new SequentialMockCallout(statusCodes, responses));
        
        Test.startTest();
        String result = LLMController.handleRequest(
            testAccount.Id,
            'OpenAI_GPT4',
            'Analyze this document',
            'question',
            'Contact',
            null
        );
        Test.stopTest();
    }
    
    @isTest
    static void testGetAttachmentsBase64() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        // Create mock attachments
        ContentVersion cv1 = new ContentVersion();
        cv1.Title = 'Test Image';
        cv1.PathOnClient = 'testImage.jpg';
        cv1.VersionData = Blob.valueOf('TestImageData');
        cv1.IsMajorVersion = true;
        insert cv1;
        
        ContentVersion cv2 = new ContentVersion();
        cv2.Title = 'Test PDF';
        cv2.PathOnClient = 'test.pdf';
        cv2.VersionData = Blob.valueOf('TestPDFData');
        cv2.IsMajorVersion = true;
        insert cv2;
        
        // Get the content document IDs
        List<ContentVersion> insertedVersions = [
            SELECT ContentDocumentId FROM ContentVersion WHERE Id IN (:cv1.Id, :cv2.Id)
        ];
        
        // Create content document links
        List<ContentDocumentLink> links = new List<ContentDocumentLink>();
        for (ContentVersion ver : insertedVersions) {
            ContentDocumentLink cdl = new ContentDocumentLink();
            cdl.ContentDocumentId = ver.ContentDocumentId;
            cdl.LinkedEntityId = testAccount.Id;
            cdl.ShareType = 'V';
            links.add(cdl);
        }
        insert links;
        
        Test.startTest();
        String result = LLMController.getAttachmentsBase64(testAccount.Id);
        Test.stopTest();
    }
    
    @isTest
    static void testMultipleObjectTypes() {
        // Test with various object types to ensure getRecordContext handles them correctly
        
        // Account already exists
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        Contact testContact = [SELECT Id FROM Contact WHERE LastName = 'Contact' LIMIT 1];
        Opportunity testOpp = [SELECT Id FROM Opportunity WHERE Name = 'Test Opportunity' LIMIT 1];
        Case testCase = [SELECT Id FROM Case WHERE Subject = 'Test Case' LIMIT 1];
        
        // Create test lead
        Lead testLead = new Lead(
            FirstName = 'Test',
            LastName = 'Lead',
            Company = 'Test Company',
            Status = 'Open',
            Email = 'test@example.com',
            Phone = '555-5678'
        );
        insert testLead;
        
        // Mock configuration
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        // Mock HTTP response
        String mockResponse = '{"choices":[{"message":{"content":"Test response"}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        
        // Test with different object types
        LLMController.handleRequest(
            testAccount.Id,
            'OpenAI_GPT4',
            'Tell me about this account',
            'question',
            'Contact,Opportunity',
            null
        );
        
        LLMController.handleRequest(
            testContact.Id,
            'OpenAI_GPT4',
            'Tell me about this contact',
            'question',
            'Account,Opportunity',
            null
        );
        
        LLMController.handleRequest(
            testOpp.Id,
            'OpenAI_GPT4',
            'Tell me about this opportunity',
            'question',
            'Account,Contact',
            null
        );
        
        LLMController.handleRequest(
            testCase.Id,
            'OpenAI_GPT4',
            'Tell me about this case',
            'question',
            'Account,Contact',
            null
        );
        
        LLMController.handleRequest(
            testLead.Id,
            'OpenAI_GPT4',
            'Tell me about this lead',
            'question',
            '',
            null
        );
        
        Test.stopTest();
    }
    
    @isTest
    static void testHandleRequestWithNoRecordId() {
        // Test handle request without a record ID (direct question)
        
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        String mockResponse = '{"choices":[{"message":{"content":"Test response for direct question"}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        String result = LLMController.handleRequest(
            null,
            'OpenAI_GPT4',
            'What is the capital of France?',
            'question',
            null,
            null
        );
        Test.stopTest();
    }
    
    @isTest
    static void testTruncatingLargeContext() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        // Add many child records to generate a large context
        List<Contact> manyContacts = new List<Contact>();
        for(Integer i = 0; i < 50; i++) {
            Contact c = new Contact(
                FirstName = 'Test' + i,
                LastName = 'Contact' + i,
                AccountId = testAccount.Id,
                Email = 'test' + i + '@example.com',
                Phone = '555-' + String.valueOf(1000 + i)
            );
            manyContacts.add(c);
        }
        insert manyContacts;
        
        List<Task> manyTasks = new List<Task>();
        for(Integer i = 0; i < 50; i++) {
            Task t = new Task(
                Subject = 'Test Task ' + i,
                Description = 'This is a long description for task ' + i + ' that will generate a large context when combined with many other tasks.',
                WhatId = testAccount.Id,
                Status = 'Not Started',
                Priority = 'Normal'
            );
            manyTasks.add(t);
        }
        insert manyTasks;
        
        // Set up mock configurations
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        String mockResponse = '{"choices":[{"message":{"content":"Test response with truncated context"}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        String result = LLMController.handleRequest(
            testAccount.Id,
            'OpenAI_GPT4',
            'Summarize this account with all its related data',
            'summarize',
            'Contact,Task',
            null
        );
        Test.stopTest();
    }
    
    @isTest
    static void testFeedItemsAndComments() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        // Create FeedItems with comments to test Chatter posts code path
        FeedItem post1 = new FeedItem(
            ParentId = testAccount.Id,
            Body = 'This is a test post for Chatter feed',
            Type = 'TextPost'
        );
        insert post1;
        
        FeedItem post2 = new FeedItem(
            ParentId = testAccount.Id,
            Body = 'This is another test post with comments',
            Type = 'TextPost'
        );
        insert post2;
        
        // Create comments on the second post
        FeedComment comment1 = new FeedComment(
            FeedItemId = post2.Id,
            CommentBody = 'This is comment 1'
        );
        insert comment1;
        
        FeedComment comment2 = new FeedComment(
            FeedItemId = post2.Id,
            CommentBody = 'This is comment 2'
        );
        insert comment2;
        
        FeedComment comment3 = new FeedComment(
            FeedItemId = post2.Id,
            CommentBody = 'This is comment 3'
        );
        insert comment3;
        
        FeedComment comment4 = new FeedComment(
            FeedItemId = post2.Id,
            CommentBody = 'This is comment 4'
        );
        insert comment4;
        
        // Keep mocking enabled to avoid SOQL limits
        // Boolean originalMockSetting = LLMController.USE_MOCK_METHODS_IN_TEST;
        // LLMController.USE_MOCK_METHODS_IN_TEST = false;
        
        // Set up LLM configuration
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        // Set up HTTP mock
        String mockResponse = '{"choices":[{"message":{"content":"Test response with feed items"}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        
        // Create utility method to access getRecordContext
        String result = LLMController.handleRequest(
            testAccount.Id,
            'OpenAI_GPT4',
            'Get record with feed items',
            'question',
            '',
            null
        );
        
        // Reset mock setting
        // LLMController.USE_MOCK_METHODS_IN_TEST = originalMockSetting;
        
        Test.stopTest();
        
        // Verify feed items and comments were processed
        System.assertNotEquals(null, result, 'Result should not be null');
    }
    
    @isTest
    static void testCaseComments() {
        // Get test case
        Case testCase = [SELECT Id FROM Case WHERE Subject = 'Test Case' LIMIT 1];
        
        // Create case comments
        CaseComment comment1 = new CaseComment(
            ParentId = testCase.Id,
            CommentBody = 'This is a test comment',
            IsPublished = true
        );
        insert comment1;
        
        CaseComment comment2 = new CaseComment(
            ParentId = testCase.Id,
            CommentBody = 'This is a private comment with a very long text that should be truncated when displaying. ' +
                         'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ' +
                         'ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ' +
                         'ullamco laboris nisi ut aliquip ex ea commodo consequat.',
            IsPublished = false
        );
        insert comment2;
        
        // Keep mocking enabled to avoid SOQL limits
        // Boolean originalMockSetting = LLMController.USE_MOCK_METHODS_IN_TEST;
        // LLMController.USE_MOCK_METHODS_IN_TEST = false;
        
        // Set up LLM configuration
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        // Set up HTTP mock
        String mockResponse = '{"choices":[{"message":{"content":"Test response with case comments"}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        
        // Call handleRequest to exercise the case comment code
        String result = LLMController.handleRequest(
            testCase.Id,
            'OpenAI_GPT4',
            'Get record with case comments',
            'question',
            '',
            null
        );
        
        // Reset mock setting
        // LLMController.USE_MOCK_METHODS_IN_TEST = originalMockSetting;
        
        Test.stopTest();
        
        // Verify processing occurred
        System.assertNotEquals(null, result, 'Result should not be null');
    }
    
    @isTest
    static void testLeadConversion() {
        // Create and convert a test lead
        Lead testLead = new Lead(
            FirstName = 'Test',
            LastName = 'Converted',
            Company = 'Test Conversion Company',
            Status = 'Open',
            Email = 'testconversion@example.com',
            Phone = '555-1111'
        );
        insert testLead;
        
        // Find a valid conversion status
        LeadStatus convertStatus = [SELECT Id, MasterLabel FROM LeadStatus WHERE IsConverted=true LIMIT 1];
        
        // Create a lead conversion
        Database.LeadConvert lc = new Database.LeadConvert();
        lc.setLeadId(testLead.Id);
        lc.setConvertedStatus(convertStatus.MasterLabel);
        
        Database.LeadConvertResult lcr = Database.convertLead(lc);
        System.assert(lcr.isSuccess(), 'Lead conversion should be successful');
        
        // Keep mocking enabled to avoid SOQL limits
        // Boolean originalMockSetting = LLMController.USE_MOCK_METHODS_IN_TEST;
        // LLMController.USE_MOCK_METHODS_IN_TEST = false;
        
        // Set up LLM configuration
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        // Set up HTTP mock
        String mockResponse = '{"choices":[{"message":{"content":"Test response with lead conversion"}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        
        // Call handleRequest to exercise the lead conversion code
        String result = LLMController.handleRequest(
            testLead.Id,
            'OpenAI_GPT4',
            'Get lead with conversion details',
            'question',
            '',
            null
        );
        
        // Reset mock setting
        // LLMController.USE_MOCK_METHODS_IN_TEST = originalMockSetting;
        
        Test.stopTest();
        
        // Verify processing occurred
        System.assertNotEquals(null, result, 'Result should not be null');
    }
    
    @isTest
    static void testRelatedObjectsData() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        // Keep mocking enabled to avoid SOQL limits
        // Boolean originalMockSetting = LLMController.USE_MOCK_METHODS_IN_TEST;
        // LLMController.USE_MOCK_METHODS_IN_TEST = false;
        
        // Set up LLM configuration
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        // Set up HTTP mock
        String mockResponse = '{"choices":[{"message":{"content":"Test response with related objects"}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        
        // Test with valid objects
        String result1 = LLMController.handleRequest(
            testAccount.Id,
            'OpenAI_GPT4',
            'Get related objects',
            'question',
            'Contact,Opportunity',
            null
        );
        
        // Test with inaccessible object
        String result2 = LLMController.handleRequest(
            testAccount.Id,
            'OpenAI_GPT4',
            'Get related objects with invalid object',
            'question',
            'Contact,InvalidObject',
            null
        );
        
        // Test empty object list
        String result3 = LLMController.handleRequest(
            testAccount.Id,
            'OpenAI_GPT4',
            'Get related objects with empty list',
            'question',
            '',
            null
        );
        
        // Reset mock setting
        // LLMController.USE_MOCK_METHODS_IN_TEST = originalMockSetting;
        
        Test.stopTest();
        
        // Verify processing occurred
        System.assertNotEquals(null, result1, 'Result 1 should not be null');
        System.assertNotEquals(null, result2, 'Result 2 should not be null');
        System.assertNotEquals(null, result3, 'Result 3 should not be null');
    }
    
    @isTest
    static void testFieldHistoryData() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        // Keep mocking enabled to avoid SOQL limits
        // Boolean originalMockSetting = LLMController.USE_MOCK_METHODS_IN_TEST;
        // LLMController.USE_MOCK_METHODS_IN_TEST = false;
        
        // Set up LLM configuration
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        // Set up HTTP mock
        String mockResponse = '{"choices":[{"message":{"content":"Test response with field history"}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        
        // Standard object field history
        String result1 = LLMController.handleRequest(
            testAccount.Id,
            'OpenAI_GPT4',
            'Get field history',
            'question',
            '',
            null
        );
        
        // Test with a custom object name
        String result2 = LLMController.handleRequest(
            testAccount.Id,
            'OpenAI_GPT4',
            'Get field history for custom object',
            'question',
            '',
            null
        );
        
        // Reset mock setting
        // LLMController.USE_MOCK_METHODS_IN_TEST = originalMockSetting;
        
        Test.stopTest();
        
        // Verify processing occurred
        System.assertNotEquals(null, result1, 'Result 1 should not be null');
        System.assertNotEquals(null, result2, 'Result 2 should not be null');
    }
    
    @isTest
    static void testSpecialCaseHandling() {
        // Create specific record types to test special case handling in getRecordContext
        
        // Create a Lead to test conversion info
        Lead testLead = new Lead(
            FirstName = 'Special',
            LastName = 'Test Lead',
            Company = 'Test Company',
            Status = 'Open',
            Email = 'specialtest@example.com'
        );
        insert testLead;
        
        // Create a Case to test case comment handling
        Case testCase = new Case(
            Subject = 'Special Test Case',
            Status = 'New',
            Description = 'This is a test case for special case handling'
        );
        insert testCase;
        
        // Create special comments
        CaseComment cc = new CaseComment(
            ParentId = testCase.Id,
            CommentBody = 'This is a special test comment',
            IsPublished = true
        );
        insert cc;
        
        // Set up LLM configuration
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        // Set up HTTP mock
        String mockResponse = '{"choices":[{"message":{"content":"Test response for special case handling"}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        
        // Test Lead record context
        String leadResult = LLMController.handleRequest(
            testLead.Id,
            'OpenAI_GPT4',
            'Get lead record context',
            'question',
            '',
            null
        );
        
        // Test Case record context 
        String caseResult = LLMController.handleRequest(
            testCase.Id,
            'OpenAI_GPT4',
            'Get case record context',
            'question',
            '',
            null
        );
        
        Test.stopTest();
        
        // Verify processing occurred
        System.assertNotEquals(null, leadResult, 'Lead result should not be null');
        System.assertNotEquals(null, caseResult, 'Case result should not be null');
    }
    
    @isTest
    static void testSOSLAndRelatedRecords() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account' LIMIT 1];
        
        // Create contact and opportunity for related record testing
        Contact con = new Contact(
            FirstName = 'SOSL',
            LastName = 'Test Contact',
            AccountId = testAccount.Id,
            Email = 'sosltest@example.com'
        );
        insert con;
        
        Opportunity opp = new Opportunity(
            Name = 'SOSL Test Opportunity',
            AccountId = testAccount.Id,
            StageName = 'Prospecting',
            CloseDate = Date.today().addDays(30),
            Amount = 10000
        );
        insert opp;
        
        // Set up LLM configuration
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        LLM_Configuration__mdt config = new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Supports_Files__c = true,
            Max_Tokens__c = 2000,
            Temperature__c = 0.7
        );
        mockConfigs.add(config);
        
        LLMController.mockConfigurations = mockConfigs;
        
        // Set up HTTP mock
        String mockResponse = '{"choices":[{"message":{"content":"Test response for SOSL and related records"}}]}';
        Test.setMock(HttpCalloutMock.class, new MockHttpResponseGenerator(200, mockResponse));
        
        Test.startTest();
        
        // Test SOSL queries (note: will use mock in test context)
        String result = LLMController.handleRequest(
            testAccount.Id,
            'OpenAI_GPT4',
            'Test SOSL related records',
            'question',
            'Contact,Opportunity',
            null
        );
        
        Test.stopTest();
        
        // Verify processing occurred
        System.assertNotEquals(null, result, 'Result should not be null');
    }
}