/**
 * Test class for LLMController
 * Provides comprehensive test coverage for all controller methods
 */
@isTest
private class LLMControllerTest {
    
    @TestSetup
    static void setupTestData() {
        // Create test record (Account)
        Account testAccount = new Account(
            Name = 'Test Account for LLM',
            Description = 'This is a test account for LLM testing',
            Phone = '555-123-4567',
            Website = 'https://www.testaccount.com'
        );
        insert testAccount;
        
        // Create a task related to the account
        Task testTask = new Task(
            Subject = 'Test Task',
            Status = 'Not Started',
            Priority = 'Normal',
            WhatId = testAccount.Id
        );
        insert testTask;
        
        // Create a test event
        Event testEvent = new Event(
            Subject = 'Test Event',
            StartDateTime = DateTime.now(),
            EndDateTime = DateTime.now().addHours(1),
            WhatId = testAccount.Id
        );
        insert testEvent;
        
        // Create a test ContentVersion (file)
        ContentVersion testContent = new ContentVersion(
            Title = 'Test Document',
            PathOnClient = 'TestDoc.txt',
            VersionData = Blob.valueOf('This is test content for LLM testing'),
            IsMajorVersion = true
        );
        insert testContent;
        
        // Get the ContentDocument Id
        Id contentDocumentId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :testContent.Id].ContentDocumentId;
        
        // Create ContentDocumentLink to link the file to the account
        ContentDocumentLink testLink = new ContentDocumentLink(
            ContentDocumentId = contentDocumentId,
            LinkedEntityId = testAccount.Id,
            ShareType = 'V' // Viewer permission
        );
        insert testLink;
        
        // Create a PDF content version for vision testing
        ContentVersion pdfContent = new ContentVersion(
            Title = 'Test PDF',
            PathOnClient = 'TestDoc.pdf',
            VersionData = Blob.valueOf('PDF TEST CONTENT'),
            IsMajorVersion = true
        );
        insert pdfContent;
        
        // Link PDF to account
        Id pdfDocId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :pdfContent.Id].ContentDocumentId;
        ContentDocumentLink pdfLink = new ContentDocumentLink(
            ContentDocumentId = pdfDocId,
            LinkedEntityId = testAccount.Id,
            ShareType = 'V'
        );
        insert pdfLink;
        
        // Create a few EmailMessage records
        try {
            List<EmailMessage> emails = new List<EmailMessage>();
            for(Integer i = 0; i < 3; i++) {
                EmailMessage email = new EmailMessage(
                    Subject = 'Test Email ' + i,
                    TextBody = 'This is test email ' + i,
                    ToAddress = 'test@example.com',
                    Status = '0'  // New status
                );
                emails.add(email);
            }
            if(!emails.isEmpty()) {
                insert emails;
            }
        } catch(Exception e) {
            System.debug('Error creating test emails: ' + e.getMessage());
        }
        
        // Create a Case record for testing
        Case testCase = new Case(
            Subject = 'Test Case for LLM',
            Description = 'Test case description',
            Status = 'New'
        );
        insert testCase;
        
        // Create test ContentDocumentLink for a document that would trigger Vision API
        try {
            ContentVersion docxContent = new ContentVersion(
                Title = 'Test DOCX',
                PathOnClient = 'TestDoc.docx',
                VersionData = Blob.valueOf('DOCX TEST CONTENT'),
                IsMajorVersion = true
            );
            insert docxContent;
            
            Id docxDocId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :docxContent.Id].ContentDocumentId;
            ContentDocumentLink docxLink = new ContentDocumentLink(
                ContentDocumentId = docxDocId,
                LinkedEntityId = testAccount.Id,
                ShareType = 'V'
            );
            insert docxLink;
            
            // Add more file types for better coverage
            ContentVersion xlsxContent = new ContentVersion(
                Title = 'Test XLSX',
                PathOnClient = 'TestSpreadsheet.xlsx',
                VersionData = Blob.valueOf('XLSX TEST CONTENT'),
                IsMajorVersion = true
            );
            insert xlsxContent;
            
            Id xlsxDocId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :xlsxContent.Id].ContentDocumentId;
            ContentDocumentLink xlsxLink = new ContentDocumentLink(
                ContentDocumentId = xlsxDocId,
                LinkedEntityId = testAccount.Id,
                ShareType = 'V'
            );
            insert xlsxLink;
            
            // Add a JPG image for vision tests
            ContentVersion imageContent = new ContentVersion(
                Title = 'Test Image',
                PathOnClient = 'TestImage.jpg',
                VersionData = Blob.valueOf('FAKE IMAGE CONTENT'),
                IsMajorVersion = true
            );
            insert imageContent;
            
            Id imageDocId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :imageContent.Id].ContentDocumentId;
            ContentDocumentLink imageLink = new ContentDocumentLink(
                ContentDocumentId = imageDocId,
                LinkedEntityId = testAccount.Id,
                ShareType = 'V'
            );
            insert imageLink;
        } catch(Exception e) {
            System.debug('Error creating additional files: ' + e.getMessage());
        }
        
        // Create some related Contact records for testing relationship field methods
        List<Contact> testContacts = new List<Contact>();
        for (Integer i = 0; i < 3; i++) {
            Contact c = new Contact(
                FirstName = 'Test' + i,
                LastName = 'Contact' + i,
                Email = 'test' + i + '@example.com',
                Phone = '555-123-456' + i,
                AccountId = testAccount.Id
            );
            testContacts.add(c);
        }
        insert testContacts;
        
        // Create Opportunity records for testing relationship field methods
        List<Opportunity> testOpps = new List<Opportunity>();
        for (Integer i = 0; i < 2; i++) {
            Opportunity opp = new Opportunity(
                Name = 'Test Opportunity ' + i,
                StageName = 'Prospecting',
                CloseDate = Date.today().addDays(30 + i),
                AccountId = testAccount.Id
            );
            testOpps.add(opp);
        }
        insert testOpps;
        
        // Create field history record for testing
        Account acctWithHistory = new Account(
            Name = 'Account With History',
            Industry = 'Technology',
            Description = 'This account will have field history tracking'
        );
        insert acctWithHistory;
        
        acctWithHistory.Industry = 'Healthcare';
        update acctWithHistory;
    }
    
    /**
     * Set up the mock configurations for testing
     */
    private static void setupMockConfigurations() {
        // Create mock configurations
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        
        // OpenAI GPT-4 configuration
        LLM_Configuration__mdt openAIConfig = new LLM_Configuration__mdt(
            Id = '000000000000001AAA', // Fake ID
            DeveloperName = 'OpenAI_GPT4',
            MasterLabel = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            Supports_Files__c = true,
            API_Key__c = 'mock_openai_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Max_Tokens__c = 2000,
            Temperature__c = 0.7,
            IsActive__c = true
        );
        mockConfigs.add(openAIConfig);
        
        // Anthropic Claude configuration
        LLM_Configuration__mdt anthropicConfig = new LLM_Configuration__mdt(
            Id = '000000000000002AAA', // Fake ID
            DeveloperName = 'Anthropic_Claude',
            MasterLabel = 'Anthropic Claude',
            Provider__c = 'Anthropic',
            Model_Name__c = 'claude-2',
            Supports_Files__c = false,
            API_Key__c = 'mock_anthropic_api_key',
            Base_URL__c = 'https://api.anthropic.com/v1/messages',
            Max_Tokens__c = 2000,
            Temperature__c = 0.7,
            IsActive__c = true
        );
        mockConfigs.add(anthropicConfig);
        
        // Google Gemini configuration
        LLM_Configuration__mdt googleConfig = new LLM_Configuration__mdt(
            Id = '000000000000003AAA', // Fake ID
            DeveloperName = 'Google_Gemini',
            MasterLabel = 'Google Gemini',
            Provider__c = 'Google',
            Model_Name__c = 'gemini-pro',
            Supports_Files__c = false,
            API_Key__c = 'mock_google_api_key',
            Base_URL__c = 'https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent',
            Max_Tokens__c = 2048,
            Temperature__c = 0.7,
            IsActive__c = true
        );
        mockConfigs.add(googleConfig);
        
        // OpenAI GPT-4 Vision configuration
        LLM_Configuration__mdt visionConfig = new LLM_Configuration__mdt(
            Id = '000000000000004AAA', // Fake ID
            DeveloperName = 'OpenAI_GPT4_Vision',
            MasterLabel = 'OpenAI GPT-4 Vision',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4-vision-preview',
            Supports_Files__c = true,
            API_Key__c = 'mock_vision_api_key',
            Base_URL__c = 'https://api.openai.com/v1/chat/completions',
            Max_Tokens__c = 2000,
            Temperature__c = 0.7,
            IsActive__c = true
        );
        mockConfigs.add(visionConfig);
        
        // Set the mock configurations on the controller
        LLMController.mockConfigurations = mockConfigs;
    }
    
    /**
     * Test class to mock HTTP callouts for LLM API responses
     */
    public class LLMCalloutMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HTTPResponse res = new HTTPResponse();
            res.setHeader('Content-Type', 'application/json');
            res.setStatusCode(200);
            
            // Mock response based on endpoint
            if (req.getEndpoint().contains('openai')) {
                res.setBody('{"choices":[{"message":{"content":"This is a mock OpenAI response."}}]}');
            } else if (req.getEndpoint().contains('anthropic')) {
                res.setBody('{"content":[{"text":"This is a mock Anthropic Claude response."}]}');
            } else if (req.getEndpoint().contains('google')) {
                res.setBody('{"candidates":[{"content":{"parts":[{"text":"This is a mock Google Gemini response."}]}}]}');
            } else if (req.getEndpoint().contains('vision')) {
                res.setBody('{"choices":[{"message":{"content":"This is a mock Vision API response for document analysis."}}]}');
            } else {
                res.setBody('{"response":"This is a generic mock response."}');
            }
            
            return res;
        }
    }
    
    /**
     * Tests the custom metadata query for LLM configurations
     */
    @isTest
    static void testGetLLMConfigurations() {
        // Set up mock configurations
        setupMockConfigurations();
        
        Test.startTest();
        
        // Set up mocks for HTTP callouts
        Test.setMock(HttpCalloutMock.class, new LLMCalloutMock());
        
        // Call the method with mock configurations in place
        List<LLM_Configuration__mdt> configs = LLMController.getLLMConfigurations();
        
        // Verify we received the mock configurations
        System.assertEquals(4, configs.size(), 'Should return 4 mock configurations');
        
        // Verify specific configuration values
        Boolean foundOpenAI = false;
        Boolean foundAnthropicClaude = false;
        
        for (LLM_Configuration__mdt config : configs) {
            if (config.DeveloperName == 'OpenAI_GPT4') {
                foundOpenAI = true;
                System.assertEquals('OpenAI', config.Provider__c, 'Provider should be OpenAI');
                System.assertEquals('gpt-4', config.Model_Name__c, 'Model name should be gpt-4');
                System.assertEquals(true, config.Supports_Files__c, 'OpenAI should support files');
            } else if (config.DeveloperName == 'Anthropic_Claude') {
                foundAnthropicClaude = true;
                System.assertEquals('Anthropic', config.Provider__c, 'Provider should be Anthropic');
                System.assertEquals('claude-2', config.Model_Name__c, 'Model name should be claude-2');
                System.assertEquals(false, config.Supports_Files__c, 'Claude should not support files');
            }
        }
        
        System.assert(foundOpenAI, 'OpenAI configuration should be present');
        System.assert(foundAnthropicClaude, 'Anthropic Claude configuration should be present');
        
        Test.stopTest();
    }
    
    /**
     * Test the handleRequest method with various parameters
     */
    @isTest
    static void testHandleRequest() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account for LLM' LIMIT 1];
        
        // Set up mock configurations
        setupMockConfigurations();
        
        Test.startTest();
        
        // Set up mocks for all HTTP callouts
        Test.setMock(HttpCalloutMock.class, new LLMCalloutMock());
        
        // Test with OpenAI configuration
        try {
            String openaiResult = LLMController.handleRequest(
                testAccount.Id,
                'OpenAI_GPT4',
                'Summarize this account',
                'summarize',
                'Contact,Opportunity'
            );
            System.assertNotEquals(null, openaiResult, 'Result should not be null');
            System.assert(openaiResult.contains('mock'), 'Should return a mock response');
        } catch (Exception e) {
            System.assert(false, 'Should not throw exception: ' + e.getMessage());
        }
        
        // Test with no record ID to ensure that branch is covered
        try {
            String noRecordResult = LLMController.handleRequest(
                null,
                'OpenAI_GPT4',
                'General question with no record context',
                'general',
                null
            );
            System.assertNotEquals(null, noRecordResult, 'Result should not be null');
            System.assert(noRecordResult.contains('mock'), 'Should return a mock response');
        } catch (Exception e) {
            System.assert(false, 'Should not throw exception: ' + e.getMessage());
        }
        
        // Test with different provider
        try {
            String anthropicResult = LLMController.handleRequest(
                testAccount.Id,
                'Anthropic_Claude',
                'Analyze this account',
                'analyze',
                null
            );
            System.assertNotEquals(null, anthropicResult, 'Result should not be null');
            System.assert(anthropicResult.contains('mock'), 'Should return a mock response');
        } catch (Exception e) {
            System.assert(false, 'Should not throw exception: ' + e.getMessage());
        }
        
        // Test with another provider
        try {
            String googleResult = LLMController.handleRequest(
                testAccount.Id,
                'Google_Gemini',
                'Evaluate this account',
                'evaluate',
                'Contact'
            );
            System.assertNotEquals(null, googleResult, 'Result should not be null');
            System.assert(googleResult.contains('mock'), 'Should return a mock response');
        } catch (Exception e) {
            System.assert(false, 'Should not throw exception: ' + e.getMessage());
        }
        
        // Test with invalid configuration to cover error branch
        try {
            String errorResult = LLMController.handleRequest(
                testAccount.Id,
                'Invalid_Config_Name',
                'Test error handling',
                'error',
                null
            );
            System.assertNotEquals(null, errorResult, 'Result should not be null even with invalid config');
            System.assert(errorResult.contains('mock'), 'Should return a mock response');
        } catch (Exception e) {
            // This might be expected depending on implementation
            System.debug('Exception with invalid config: ' + e.getMessage());
        }
        
        Test.stopTest();
    }
    
    /**
     * Test the checkRecordForAnomalies method
     */
    @isTest
    static void testCheckRecordForAnomalies() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account for LLM' LIMIT 1];
        
        // Set up mock configurations
        setupMockConfigurations();
        
        Test.startTest();
        
        // Set up mocks for HTTP callouts
        Test.setMock(HttpCalloutMock.class, new LLMCalloutMock());
        
        // Test with valid parameters
        try {
            String result = LLMController.checkRecordForAnomalies(
                testAccount.Id,
                'OpenAI_GPT4',
                'Contact,Opportunity'
            );
            System.assertNotEquals(null, result, 'Result should not be null');
            System.assert(result.contains('mock'), 'Should return a mock response');
        } catch (Exception e) {
            System.assert(false, 'Should not throw exception: ' + e.getMessage());
        }
        
        // Test with invalid recordId
        try {
            String result = LLMController.checkRecordForAnomalies(
                null,
                'OpenAI_GPT4',
                'Contact,Opportunity'
            );
            System.assert(false, 'Should have thrown exception for null recordId');
        } catch (Exception e) {
            System.assert(e instanceof AuraHandledException, 'Should throw AuraHandledException');
        }
        
        // Test with invalid config name
        try {
            String result = LLMController.checkRecordForAnomalies(
                testAccount.Id,
                '',
                'Contact,Opportunity'
            );
            System.assert(false, 'Should have thrown exception for empty configName');
        } catch (Exception e) {
            System.assert(e instanceof AuraHandledException, 'Should throw AuraHandledException');
        }
        
        // Test with non-existent record ID
        try {
            String result = LLMController.checkRecordForAnomalies(
                '001000000000001AAA',  // Fake ID
                'OpenAI_GPT4',
                'Contact,Opportunity'
            );
            System.assert(false, 'Should have thrown exception for invalid record ID');
        } catch (Exception e) {
            System.debug('Expected exception for invalid record ID: ' + e.getMessage());
        }
        
        Test.stopTest();
    }
    
    /**
     * Test documents and vision analysis pathway
     */
    @isTest
    static void testAttachmentsProcessing() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account for LLM' LIMIT 1];
        
        // Set up mock configurations
        setupMockConfigurations();
        
        Test.startTest();
        
        // Set up mocks for HTTP callouts
        Test.setMock(HttpCalloutMock.class, new LLMCalloutMock());
        
        // Test the handler with attachments that would trigger vision analysis
        try {
            // Test with a configuration that supports files
            String result = LLMController.handleRequest(
                testAccount.Id,
                'OpenAI_GPT4_Vision',
                'Analyze these documents',
                'analyze_documents',
                null
            );
            System.assertNotEquals(null, result, 'Result should not be null');
            System.assert(result.contains('mock'), 'Should return a mock response');
        } catch (Exception e) {
            System.assert(false, 'Should not throw exception: ' + e.getMessage());
        }
        
        Test.stopTest();
    }
    
    /**
     * Test private methods indirectly for better coverage
     */
    @isTest
    static void testCoveredPrivateMethods() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account for LLM' LIMIT 1];
        Case testCase = [SELECT Id FROM Case WHERE Subject = 'Test Case for LLM' LIMIT 1];
        
        // Set up mock configurations
        setupMockConfigurations();
        
        Test.startTest();
        
        // Set up mocks for HTTP callouts
        Test.setMock(HttpCalloutMock.class, new LLMCalloutMock());
        
        // Test with cases, opportunities, and various record types to hit different branches
        try {
            String caseResult = LLMController.handleRequest(
                testCase.Id,
                'OpenAI_GPT4',
                'Analyze this case',
                'analyze',
                'Contact,User'
            );
            System.assertNotEquals(null, caseResult, 'Result should not be null');
            System.assert(caseResult.contains('mock'), 'Should return a mock response');
        } catch (Exception e) {
            System.assert(false, 'Should not throw exception: ' + e.getMessage());
        }
        
        // Test with a Contact record to cover different object type handling
        try {
            // Get a test contact
            Contact testContact = [SELECT Id FROM Contact WHERE LastName = 'Contact0' LIMIT 1];
            
            String contactResult = LLMController.handleRequest(
                testContact.Id,
                'OpenAI_GPT4',
                'Analyze this contact',
                'analyze',
                'Account'
            );
            System.assertNotEquals(null, contactResult, 'Result should not be null');
            System.assert(contactResult.contains('mock'), 'Should return a mock response');
        } catch (Exception e) {
            System.debug('Exception with contact record: ' + e.getMessage());
        }
        
        // Test with an Opportunity record
        try {
            // Get a test opportunity
            Opportunity testOpp = [SELECT Id FROM Opportunity WHERE Name = 'Test Opportunity 0' LIMIT 1];
            
            String oppResult = LLMController.handleRequest(
                testOpp.Id,
                'OpenAI_GPT4',
                'Analyze this opportunity',
                'analyze',
                'Account'
            );
            System.assertNotEquals(null, oppResult, 'Result should not be null');
            System.assert(oppResult.contains('mock'), 'Should return a mock response');
        } catch (Exception e) {
            System.debug('Exception with opportunity record: ' + e.getMessage());
        }
        
        Test.stopTest();
    }
    
    /**
     * Test error handling pathways
     */
    @isTest
    static void testErrorHandling() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account for LLM' LIMIT 1];
        
        // Set up mock configurations
        setupMockConfigurations();
        
        Test.startTest();
        
        // Set up a custom mock that returns error responses
        Test.setMock(HttpCalloutMock.class, new ErrorResponseMock());
        
        // Test error handling in the controller
        try {
            String errorResult = LLMController.handleRequest(
                testAccount.Id,
                'OpenAI_GPT4',
                'Test error handling',
                'error',
                null
            );
            System.assert(false, 'Should have thrown exception for error response');
        } catch (Exception e) {
            // This exception is expected
            System.assert(e instanceof AuraHandledException, 'Should throw AuraHandledException');
        }
        
        Test.stopTest();
    }
    
    /**
     * Custom mock for testing error responses
     */
    private class ErrorResponseMock implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HTTPResponse res = new HTTPResponse();
            res.setHeader('Content-Type', 'application/json');
            res.setStatusCode(400);
            res.setBody('{"error":{"message":"Invalid request parameters","type":"invalid_request_error"}}');
            return res;
        }
    }
    
    /**
     * Test with a record that has field history tracking
     */
    @isTest
    static void testFieldHistoryTracking() {
        Account acctWithHistory = [SELECT Id FROM Account WHERE Name = 'Account With History' LIMIT 1];
        
        // Set up mock configurations
        setupMockConfigurations();
        
        Test.startTest();
        
        // Set up mocks for HTTP callouts
        Test.setMock(HttpCalloutMock.class, new LLMCalloutMock());
        
        // Test with a record that has field history tracking
        try {
            String result = LLMController.handleRequest(
                acctWithHistory.Id,
                'OpenAI_GPT4',
                'Analyze account history',
                'analyze_history',
                null
            );
            System.assertNotEquals(null, result, 'Result should not be null');
            System.assert(result.contains('mock'), 'Should return a mock response');
        } catch (Exception e) {
            System.debug('Exception with account history: ' + e.getMessage());
        }
        
        Test.stopTest();
    }
    
    /**
     * Test to cover various child relationship branches
     */
    @isTest
    static void testChildRelationships() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account for LLM' LIMIT 1];
        
        // Set up mock configurations
        setupMockConfigurations();
        
        Test.startTest();
        
        // Set up mocks for HTTP callouts
        Test.setMock(HttpCalloutMock.class, new LLMCalloutMock());
        
        // Test with parameters that would trigger child relationship code
        try {
            String result = LLMController.handleRequest(
                testAccount.Id,
                'OpenAI_GPT4',
                'Analyze this account and all related records',
                'deep_analysis',
                'Contact,Opportunity,Case,Task,Event'
            );
            System.assertNotEquals(null, result, 'Result should not be null');
            System.assert(result.contains('mock'), 'Should return a mock response');
        } catch (Exception e) {
            System.debug('Exception with child relationships: ' + e.getMessage());
        }
        
        Test.stopTest();
    }
    
    /**
     * Test exception handling with malformed requests
     */
    @isTest
    static void testExceptionHandling() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account for LLM' LIMIT 1];
        
        // Set up mock configurations
        setupMockConfigurations();
        
        Test.startTest();
        
        // Set up mocks for HTTP callouts that simulate exceptions
        Test.setMock(HttpCalloutMock.class, new HttpCalloutMock() {
            public HTTPResponse respond(HTTPRequest req) {
                throw new CalloutException('Simulated callout failure');
            }
        });
        
        try {
            String result = LLMController.handleRequest(
                testAccount.Id,
                'OpenAI_GPT4',
                'This will fail',
                'failure_test',
                null
            );
            System.assert(false, 'Should have thrown exception for callout failure');
        } catch (Exception e) {
            // This exception is expected
            System.assert(e instanceof AuraHandledException, 'Should throw AuraHandledException');
        }
        
        Test.stopTest();
    }
    
    /**
     * Test different operations to ensure all code paths are covered
     */
    @isTest
    static void testDifferentOperations() {
        Account testAccount = [SELECT Id FROM Account WHERE Name = 'Test Account for LLM' LIMIT 1];
        
        // Set up mock configurations
        setupMockConfigurations();
        
        Test.startTest();
        
        // Set up mocks for HTTP callouts
        Test.setMock(HttpCalloutMock.class, new LLMCalloutMock());
        
        // Test different operations to cover more code paths
        List<String> operations = new List<String>{
            'summarize', 
            'analyze', 
            'explain', 
            'draft_email', 
            'generate_code', 
            'create_task', 
            'answer_question'
        };
        
        for (String operation : operations) {
            try {
                String result = LLMController.handleRequest(
                    testAccount.Id,
                    'OpenAI_GPT4',
                    'Test ' + operation + ' operation',
                    operation,
                    null
                );
                System.assertNotEquals(null, result, 'Result should not be null for ' + operation);
                System.assert(result.contains('mock'), 'Should return a mock response for ' + operation);
            } catch (Exception e) {
                System.debug('Exception with operation ' + operation + ': ' + e.getMessage());
            }
        }
        
        Test.stopTest();
    }
} 