@isTest
public class LLMControllerRefactoredTest {
    
    @testSetup
    static void setup() {
        // Create test account
        Account testAccount = new Account(
            Name = 'Test Account',
            Description = 'Test Description'
        );
        insert testAccount;
        
        // Create test case
        Case testCase = new Case(
            Subject = 'Test Case',
            Description = 'Test Case Description',
            AccountId = testAccount.Id
        );
        insert testCase;
    }
    
    @isTest
    static void testGetLLMConfigurations() {
        // Create mock configurations
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        mockConfigs.add(new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            Label = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test-key',
            IsActive__c = true
        ));
        
        Test.startTest();
        LLMControllerRefactored.setMockConfigurations(mockConfigs);
        List<LLM_Configuration__mdt> result = LLMControllerRefactored.getLLMConfigurations();
        Test.stopTest();
        
        System.assertEquals(1, result.size(), 'Should return one configuration');
        System.assertEquals('OpenAI_GPT4', result[0].DeveloperName);
    }
    
    @isTest
    static void testHandleRequest() {
        Account testAccount = [SELECT Id FROM Account LIMIT 1];
        
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        mockConfigs.add(new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            Label = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test-key',
            IsActive__c = true,
            Max_Tokens__c = 4000,
            Temperature__c = 0.7
        ));
        
        Test.startTest();
        LLMControllerRefactored.setMockConfigurations(mockConfigs);
        
        // Mock the HTTP callout
        Test.setMock(HttpCalloutMock.class, new MockLLMHttpCallout());
        
        String result = LLMControllerRefactored.handleRequest(
            testAccount.Id,
            'Test prompt',
            'summarize',
            'OpenAI_GPT4',
            null,
            null,
            null
        );
        Test.stopTest();
        
        System.assertNotEquals(null, result, 'Should return a result');
    }
    
    @isTest
    static void testCheckRecordForAnomalies() {
        Account testAccount = [SELECT Id FROM Account LIMIT 1];
        
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        mockConfigs.add(new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4',
            Label = 'OpenAI GPT-4',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4',
            API_Key__c = 'test-key',
            IsActive__c = true
        ));
        
        Test.startTest();
        LLMControllerRefactored.setMockConfigurations(mockConfigs);
        Test.setMock(HttpCalloutMock.class, new MockLLMHttpCallout());
        
        String result = LLMControllerRefactored.checkRecordForAnomalies(
            testAccount.Id,
            'OpenAI_GPT4',
            'Check for missing fields'
        );
        Test.stopTest();
        
        System.assertNotEquals(null, result, 'Should return anomaly check result');
    }
    
    @isTest
    static void testSaveAnalysisToField() {
        Account testAccount = [SELECT Id FROM Account LIMIT 1];
        
        Test.startTest();
        LLMControllerRefactored.saveAnalysisToField(
            testAccount.Id,
            'Description',
            'Updated analysis text'
        );
        Test.stopTest();
        
        Account updatedAccount = [SELECT Description FROM Account WHERE Id = :testAccount.Id];
        System.assertEquals('Updated analysis text', updatedAccount.Description);
    }
    
    @isTest
    static void testProcessImagesWithAI() {
        Account testAccount = [SELECT Id FROM Account LIMIT 1];
        
        List<LLM_Configuration__mdt> mockConfigs = new List<LLM_Configuration__mdt>();
        mockConfigs.add(new LLM_Configuration__mdt(
            DeveloperName = 'OpenAI_GPT4_Vision',
            Label = 'OpenAI GPT-4 Vision',
            Provider__c = 'OpenAI',
            Model_Name__c = 'gpt-4-vision-preview',
            API_Key__c = 'test-key',
            IsActive__c = true,
            Supports_Files__c = true
        ));
        
        Test.startTest();
        LLMControllerRefactored.setMockConfigurations(mockConfigs);
        Test.setMock(HttpCalloutMock.class, new MockLLMHttpCallout());
        
        String result = LLMControllerRefactored.processImagesWithAI(
            testAccount.Id,
            'Analyze these images'
        );
        Test.stopTest();
        
        System.assertNotEquals(null, result, 'Should return image analysis result');
    }
    
    @isTest
    static void testGetPdfAttachmentsForRecord() {
        Account testAccount = [SELECT Id FROM Account LIMIT 1];
        
        Test.startTest();
        List<Map<String, String>> result = LLMControllerRefactored.getPdfAttachmentsForRecord(testAccount.Id);
        Test.stopTest();
        
        System.assertNotEquals(null, result, 'Should return list of PDFs');
    }
    
    @isTest
    static void testGetObjectMetadataFromId() {
        Account testAccount = [SELECT Id FROM Account LIMIT 1];
        
        Test.startTest();
        Map<String, Object> result = LLMControllerRefactored.getObjectMetadataFromId(testAccount.Id);
        Test.stopTest();
        
        System.assertNotEquals(null, result, 'Should return metadata');
        System.assertEquals('Account', result.get('objectApiName'));
    }
    
    @isTest
    static void testUpdateRecordFields() {
        Account testAccount = [SELECT Id FROM Account LIMIT 1];
        
        Map<String, Object> fieldValues = new Map<String, Object>{
            'Name' => 'Updated Account Name'
        };
        
        Test.startTest();
        LLMControllerRefactored.updateRecordFields(testAccount.Id, fieldValues);
        Test.stopTest();
        
        Account updatedAccount = [SELECT Name FROM Account WHERE Id = :testAccount.Id];
        System.assertEquals('Updated Account Name', updatedAccount.Name);
    }
    
    // Mock HTTP Callout Class
    public class MockLLMHttpCallout implements HttpCalloutMock {
        public HTTPResponse respond(HTTPRequest req) {
            HttpResponse res = new HttpResponse();
            res.setHeader('Content-Type', 'application/json');
            res.setStatusCode(200);
            
            // Return mock response based on endpoint
            if (req.getEndpoint().contains('openai.com')) {
                res.setBody('{"choices":[{"message":{"content":"Mock OpenAI response"}}]}');
            } else if (req.getEndpoint().contains('anthropic.com')) {
                res.setBody('{"content":[{"text":"Mock Anthropic response"}]}');
            } else if (req.getEndpoint().contains('generativelanguage.googleapis.com')) {
                res.setBody('{"candidates":[{"content":{"parts":[{"text":"Mock Google response"}]}}]}');
            } else {
                res.setBody('{"choices":[{"message":{"content":"Mock response"}}]}');
            }
            
            return res;
        }
    }
}