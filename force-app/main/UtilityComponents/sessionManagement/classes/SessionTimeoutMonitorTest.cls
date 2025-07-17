@isTest
public class SessionTimeoutMonitorTest {
  @testSetup
  static void setup() {
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;
  }

  @isTest
  static void testScheduleJob() {
    Test.startTest();
    SessionTimeoutMonitor.scheduleJob();
    Test.stopTest();

    List<CronTrigger> jobs = [
      SELECT Id, CronJobDetail.Name
      FROM CronTrigger
      WHERE CronJobDetail.Name = 'Session Timeout Monitor'
    ];

    System.assertEquals(1, jobs.size(), 'Job should be scheduled');
  }

  @isTest
  static void testGenerateCronExpression() {
    String cron5Min = SessionTimeoutMonitorTest.invokeCronGeneration(5);
    String cron10Min = SessionTimeoutMonitorTest.invokeCronGeneration(10);
    String cron15Min = SessionTimeoutMonitorTest.invokeCronGeneration(15);
    String cron30Min = SessionTimeoutMonitorTest.invokeCronGeneration(30);
    String cron60Min = SessionTimeoutMonitorTest.invokeCronGeneration(60);

    System.assertEquals(
      '0 0,5,10,15,20,25,30,35,40,45,50,55 * * * ?',
      cron5Min
    );
    System.assertEquals('0 0,10,20,30,40,50 * * * ?', cron10Min);
    System.assertEquals('0 0,15,30,45 * * * ?', cron15Min);
    System.assertEquals('0 0,30 * * * ?', cron30Min);
    System.assertEquals('0 0 * * * ?', cron60Min);
  }

  @isTest
  static void testBatchExecution() {
    User testUser = [
      SELECT Id
      FROM User
      WHERE Username LIKE 'sessiontest%'
      LIMIT 1
    ];

    List<User_Session_Tracking__c> sessions = new List<User_Session_Tracking__c>();

    User_Session_Tracking__c expiredSession = SessionManagementTestDataFactory.createSession(
      testUser.Id,
      true
    );
    expiredSession.Expected_Timeout__c = DateTime.now().addMinutes(-10);
    sessions.add(expiredSession);

    User_Session_Tracking__c activeSession = SessionManagementTestDataFactory.createSession(
      testUser.Id,
      true
    );
    activeSession.Expected_Timeout__c = DateTime.now().addMinutes(10);
    sessions.add(activeSession);

    insert sessions;

    Test.startTest();
    SessionTimeoutMonitor monitor = new SessionTimeoutMonitor();
    Database.executeBatch(monitor);
    Test.stopTest();

    User_Session_Tracking__c updatedExpired = [
      SELECT Is_Active__c, Logout_Type__c
      FROM User_Session_Tracking__c
      WHERE Id = :expiredSession.Id
    ];

    System.assertEquals(
      false,
      updatedExpired.Is_Active__c,
      'Expired session should be inactive'
    );
    System.assertEquals(
      'Timeout',
      updatedExpired.Logout_Type__c,
      'Should be marked as timeout'
    );

    User_Session_Tracking__c updatedActive = [
      SELECT Is_Active__c
      FROM User_Session_Tracking__c
      WHERE Id = :activeSession.Id
    ];

    System.assertEquals(
      true,
      updatedActive.Is_Active__c,
      'Active session should remain active'
    );
  }

  @isTest
  static void testBatchWithUserDeactivation() {
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    User_Session_Tracking__c expiredSession = SessionManagementTestDataFactory.createSession(
      testUser.Id,
      true
    );
    expiredSession.Expected_Timeout__c = DateTime.now().addMinutes(-10);
    insert expiredSession;

    Test.startTest();
    SessionTimeoutMonitor monitor = new SessionTimeoutMonitor();
    Database.executeBatch(monitor);
    Test.stopTest();

    User_Session_Tracking__c updatedSession = [
      SELECT Is_Active__c, Logout_Type__c
      FROM User_Session_Tracking__c
      WHERE Id = :expiredSession.Id
    ];

    System.assertEquals(
      false,
      updatedSession.Is_Active__c,
      'Session should be inactive'
    );
  }

  @isTest
  static void testSchedulableExecute() {
    Test.startTest();
    SessionTimeoutMonitor monitor = new SessionTimeoutMonitor();
    String jobId = System.schedule('Test Job', '0 0 * * * ?', monitor);

    CronTrigger ct = [SELECT Id, State FROM CronTrigger WHERE Id = :jobId];
    System.assertEquals('WAITING', ct.State, 'Job should be in waiting state');

    Test.stopTest();
  }

  private static String invokeCronGeneration(Integer minutes) {
    SessionTimeoutMonitor monitor = new SessionTimeoutMonitor();
    Type monitorType = Type.forName('SessionTimeoutMonitor');

    String methodName = 'generateCronExpression';
    Object result = monitorType.getMethod(
        methodName,
        new List<Type>{ Integer.class }
      )
      .invoke(null, new List<Object>{ minutes });

    return (String) result;
  }
}
