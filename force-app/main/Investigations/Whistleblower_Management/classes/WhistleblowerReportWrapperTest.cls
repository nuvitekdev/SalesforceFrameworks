@isTest
public class WhistleblowerReportWrapperTest {
  @testSetup
  static void setup() {
    // Insert a common Whistleblower_Report__c record
    Whistleblower_Report__c testReport = new Whistleblower_Report__c();
    // Add required fields to testReport if there are any
    insert testReport;
  }

  // Utility method to retrieve the test report
  static Whistleblower_Report__c getTestReport() {
    return [SELECT Id FROM Whistleblower_Report__c LIMIT 1];
  }

  @isTest
  static void testConstructorWithValidData() {
    Whistleblower_Report__c testReport = getTestReport();

    // Execute the test
    Test.startTest();
    WhistleblowerReportWrapper wrapper = new WhistleblowerReportWrapper(
      testReport
    );
    Test.stopTest();

    // Perform assertions
    System.assertNotEquals(null, wrapper, 'Wrapper should not be null');
    System.assertEquals(testReport.Id, wrapper.wbr.Id, 'The ID should match');
  }

  @isTest
  static void testConstructorWithNull() {
    // Expect an exception when the input is null
    Boolean exceptionThrown = false;
    try {
      WhistleblowerReportWrapper wrapper = new WhistleblowerReportWrapper(null);
    } catch (WhistleblowerReportWrapper.WhistleblowerReportWrapperException e) {
      exceptionThrown = true;
    }

    // Assert that an exception was thrown
    System.assertEquals(
      true,
      exceptionThrown,
      'An exception should have been thrown'
    );
  }

  @isTest
  static void testIsNewProperty() {
    // Test with a new Whistleblower_Report__c (not inserted)
    Whistleblower_Report__c newReport = new Whistleblower_Report__c();
    WhistleblowerReportWrapper newWrapper = new WhistleblowerReportWrapper(
      newReport
    );
    System.assertEquals(
      true,
      newWrapper.isNew,
      'isNew should be true for a new record'
    );

    // Test with an existing Whistleblower_Report__c
    Whistleblower_Report__c existingReport = getTestReport();
    WhistleblowerReportWrapper existingWrapper = new WhistleblowerReportWrapper(
      existingReport
    );
    System.assertEquals(
      false,
      existingWrapper.isNew,
      'isNew should be false for an existing record'
    );
  }
}
