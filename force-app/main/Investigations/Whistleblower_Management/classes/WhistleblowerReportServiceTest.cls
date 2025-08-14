@isTest
public class WhistleblowerReportServiceTest {
  @testSetup
  static void setup() {
    // Insert a common Whistleblower_Report__c record
    Whistleblower_Report__c testReport = new Whistleblower_Report__c();
    insert testReport;
  }

  // Utility method to retrieve test report
  static Whistleblower_Report__c getTestReport() {
    return [SELECT Id, Status__c FROM Whistleblower_Report__c LIMIT 1];
  }

  @isTest
  static void testConstructor() {
    WhistleblowerReportService service = new WhistleblowerReportService();

    System.assertNotEquals(
      null,
      service.newWhistleblowerReports,
      'New reports map should be initialized'
    );
    System.assertNotEquals(
      null,
      service.oldWhistleblowerReports,
      'Old reports map should be initialized'
    );
  }

  @isTest
  static void testSetAndGetWhistleblowerReport() {
    Whistleblower_Report__c testReport = getTestReport();

    WhistleblowerReportService service = new WhistleblowerReportService();
    service.setWhistleblowerReport(testReport);

    System.assertEquals(
      testReport.Id,
      service.getWhistleblowerReport().Id,
      'The ID should match'
    );
  }

  @isTest
  static void testSetAndGetOldWhistleblowerReport() {
    Whistleblower_Report__c oldReport = getTestReport();

    WhistleblowerReportService service = new WhistleblowerReportService();
    service.setOldWhistleblowerReports(oldReport);

    System.assertEquals(
      oldReport.Id,
      service.getOldWhistleblowerReport().Id,
      'The ID should match'
    );
  }

  @isTest
  static void testSetReportSeverity() {
    WhistleblowerReportService service = new WhistleblowerReportService();

    // Test for High Severity
    // Whistleblower_Report__c highSeverityReport = getTestReport();
    // highSeverityReport.Severity__c = 8; // High severity level
    // update highSeverityReport;

    // service.setWhistleblowerReport(highSeverityReport);
    service.setReportSeverity();
    System.assertEquals(
      'Urgent Investigation',
      service.getWhistleblowerReport().Status__c,
      'Status should be Urgent Investigation for high severity'
    );

    // Test for Medium Severity
    // Whistleblower_Report__c mediumSeverityReport = getTestReport();
    // mediumSeverityReport.Severity__c = 5; // Medium severity level
    // update mediumSeverityReport;

    // service.setWhistleblowerReport(mediumSeverityReport);
    service.setReportSeverity();
    System.assertEquals(
      'Under Investigation',
      service.getWhistleblowerReport().Status__c,
      'Status should be Under Investigation for medium severity'
    );

    // Test for Low Severity
    // Whistleblower_Report__c lowSeverityReport = getTestReport();
    // lowSeverityReport.Severity__c = 4; // Low severity level
    // update lowSeverityReport;

    // service.setWhistleblowerReport(lowSeverityReport);
    service.setReportSeverity();
    System.assertEquals(
      'Initial Review',
      service.getWhistleblowerReport().Status__c,
      'Status should be Initial Review for low severity'
    );
  }
}
