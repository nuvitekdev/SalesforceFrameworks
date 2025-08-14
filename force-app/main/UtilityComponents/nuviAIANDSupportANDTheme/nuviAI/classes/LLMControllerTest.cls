@isTest
public class LLMControllerTest {
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

  @testSetup
  static void setupTestData() {
    // Create test account
    Account testAccount = new Account(
      Name = 'Test Account',
      Description = 'Test Description'
    );
    insert testAccount;

    // Create test contact
    Contact testContact = new Contact(
      FirstName = 'Test',
      LastName = 'Contact',
      AccountId = testAccount.Id,
      Email = 'test@example.com'
    );
    insert testContact;
  }

  @isTest
  static void testGetLLMConfigurations() {
    Test.startTest();
    List<LLM_Configuration__mdt> result = LLMController.getLLMConfigurations();
    Test.stopTest();

    System.assertNotEquals(null, result, 'Result should not be null');
  }

  @isTest
  static void testHandleRequestBasic() {
    Account testAccount = [SELECT Id FROM Account LIMIT 1];

    String mockResponse = '{"choices":[{"message":{"content":"Test response"}}]}';
    Test.setMock(
      HttpCalloutMock.class,
      new MockHttpResponseGenerator(200, mockResponse)
    );

    Test.startTest();
    String result = LLMController.handleRequest(
      testAccount.Id,
      'TestProvider',
      'Tell me about this account',
      'question',
      'Contact',
      null
    );
    Test.stopTest();

    System.assertNotEquals(null, result, 'Result should not be null');
  }

  @isTest
  static void testHandleRequestWithError() {
    Account testAccount = [SELECT Id FROM Account LIMIT 1];

    Test.setMock(
      HttpCalloutMock.class,
      new MockHttpResponseGenerator(500, '{"error":{"message":"Server error"}}')
    );

    Test.startTest();
    try {
      String result = LLMController.handleRequest(
        testAccount.Id,
        'TestProvider',
        'Tell me about this account',
        'question',
        null,
        null
      );
      System.assert(false, 'Expected exception was not thrown');
    } catch (AuraHandledException e) {
      System.assertNotEquals(
        null,
        e.getMessage(),
        'Exception message should not be null'
      );
    }
    Test.stopTest();
  }

  @isTest
  static void testCheckRecordForAnomalies() {
    Account testAccount = [SELECT Id FROM Account LIMIT 1];

    String mockResponse = '{"choices":[{"message":{"content":"NO - No anomalies detected"}}]}';
    Test.setMock(
      HttpCalloutMock.class,
      new MockHttpResponseGenerator(200, mockResponse)
    );

    Test.startTest();
    String result = LLMController.checkRecordForAnomalies(
      testAccount.Id,
      'TestProvider'
    );
    Test.stopTest();

    System.assertNotEquals(null, result, 'Result should not be null');
  }

  @isTest
  static void testCheckRecordForAnomaliesWithError() {
    Account testAccount = [SELECT Id FROM Account LIMIT 1];

    Test.setMock(
      HttpCalloutMock.class,
      new MockHttpResponseGenerator(500, '{"error":{"message":"Server error"}}')
    );

    Test.startTest();
    try {
      String result = LLMController.checkRecordForAnomalies(
        testAccount.Id,
        'TestProvider'
      );
      System.assert(false, 'Expected exception was not thrown');
    } catch (AuraHandledException e) {
      System.assertNotEquals(
        null,
        e.getMessage(),
        'Exception message should not be null'
      );
    }
    Test.stopTest();
  }

  @isTest
  static void testHandleRequestSummarizeOperation() {
    Account testAccount = [SELECT Id FROM Account LIMIT 1];

    String mockResponse = '{"choices":[{"message":{"content":"Summary response"}}]}';
    Test.setMock(
      HttpCalloutMock.class,
      new MockHttpResponseGenerator(200, mockResponse)
    );

    Test.startTest();
    String result = LLMController.handleRequest(
      testAccount.Id,
      'TestProvider',
      'Summarize this record',
      'summarize',
      'Contact,Opportunity',
      'Account'
    );
    Test.stopTest();

    System.assertNotEquals(null, result, 'Result should not be null');
  }

  @isTest
  static void testHandleRequestWithNullRecordId() {
    String mockResponse = '{"choices":[{"message":{"content":"Direct response"}}]}';
    Test.setMock(
      HttpCalloutMock.class,
      new MockHttpResponseGenerator(200, mockResponse)
    );

    Test.startTest();
    String result = LLMController.handleRequest(
      null,
      'TestProvider',
      'Direct question without record context',
      'question',
      null,
      null
    );
    Test.stopTest();

    System.assertNotEquals(null, result, 'Result should not be null');
  }

  @isTest
  static void testHandleRequestInvalidConfig() {
    Account testAccount = [SELECT Id FROM Account LIMIT 1];

    Test.startTest();
    try {
      String result = LLMController.handleRequest(
        testAccount.Id,
        'NonExistentConfig',
        'Test prompt',
        'question',
        null,
        null
      );
      System.assert(false, 'Expected exception was not thrown');
    } catch (AuraHandledException e) {
      System.assertNotEquals(
        null,
        e.getMessage(),
        'Exception message should not be null'
      );
    }
    Test.stopTest();
  }
}
