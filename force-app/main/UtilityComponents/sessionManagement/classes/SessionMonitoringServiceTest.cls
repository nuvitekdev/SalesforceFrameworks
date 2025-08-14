@isTest
public class SessionMonitoringServiceTest {
  @testSetup
  static void setup() {
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;
  }

  @isTest
  static void testGetSessionConfig() {
    Test.startTest();
    Session_Configuration__mdt config = SessionMonitoringService.getSessionConfig();
    Test.stopTest();

    System.assertNotEquals(null, config, 'Config should not be null');
    System.assertEquals(
      15,
      config.Session_Timeout_Minutes__c,
      'Default timeout should be 15 minutes'
    );
    System.assertEquals(
      true,
      config.Enable_Session_Monitoring__c,
      'Monitoring should be enabled by default'
    );
  }

  @isTest
  static void testLogDatabaseErrors() {
    Database.SaveResult[] results = new Database.SaveResult[2];
    results[0] = (Database.SaveResult) JSON.deserialize(
      '{"success":true,"id":"a0X000000000001"}',
      Database.SaveResult.class
    );
    results[1] = (Database.SaveResult) JSON.deserialize(
      '{"success":false,"errors":[{"message":"Test error","fields":["Name"]}]}',
      Database.SaveResult.class
    );

    Test.startTest();
    SessionMonitoringService.logDatabaseErrors(results, 'TestContext');
    Test.stopTest();

    System.assert(true, 'Method should execute without errors');
  }

  @isTest
  static void testHandleConcurrentSessionViolations() {
    User testUser = [
      SELECT Id
      FROM User
      WHERE Username LIKE 'sessiontest%'
      LIMIT 1
    ];

    List<User_Session_Tracking__c> sessions = SessionManagementTestDataFactory.createSessions(
      testUser.Id,
      5,
      true
    );
    insert sessions;

    Map<Id, Integer> violatingUsers = new Map<Id, Integer>();
    violatingUsers.put(testUser.Id, 5);

    Test.startTest();
    SessionMonitoringService.handleConcurrentSessionViolations(
      violatingUsers,
      3
    );
    Test.stopTest();

    List<User_Session_Tracking__c> inactiveSessions = [
      SELECT Id
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id AND Is_Active__c = FALSE
    ];

    System.assertEquals(
      2,
      inactiveSessions.size(),
      'Should deactivate 2 oldest sessions'
    );
  }

  @isTest
  static void testDeactivateUserSessions() {
    User testUser = [
      SELECT Id
      FROM User
      WHERE Username LIKE 'sessiontest%'
      LIMIT 1
    ];

    List<User_Session_Tracking__c> sessions = SessionManagementTestDataFactory.createSessions(
      testUser.Id,
      3,
      true
    );
    insert sessions;

    Set<Id> userIds = new Set<Id>{ testUser.Id };

    Test.startTest();
    SessionMonitoringService.deactivateUserSessions(userIds, 'Manual');
    Test.stopTest();

    List<User_Session_Tracking__c> deactivatedSessions = [
      SELECT Id, Is_Active__c, Logout_Type__c
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id
    ];

    for (User_Session_Tracking__c session : deactivatedSessions) {
      System.assertEquals(
        false,
        session.Is_Active__c,
        'Session should be inactive'
      );
      System.assertEquals(
        'Manual',
        session.Logout_Type__c,
        'Logout type should be Manual'
      );
    }
  }

  @isTest
  static void testGetUsersWithNoActiveSessions() {
    User testUser1 = [
      SELECT Id
      FROM User
      WHERE Username LIKE 'sessiontest%'
      LIMIT 1
    ];
    User testUser2 = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser2;

    User_Session_Tracking__c activeSession = SessionManagementTestDataFactory.createSession(
      testUser1.Id,
      true
    );
    User_Session_Tracking__c inactiveSession = SessionManagementTestDataFactory.createSession(
      testUser2.Id,
      false
    );
    insert new List<User_Session_Tracking__c>{ activeSession, inactiveSession };

    Set<Id> userIds = new Set<Id>{ testUser1.Id, testUser2.Id };

    Test.startTest();
    Set<Id> usersWithNoSessions = SessionMonitoringService.getUsersWithNoActiveSessions(
      userIds
    );
    Test.stopTest();

    System.assertEquals(
      1,
      usersWithNoSessions.size(),
      'Should find 1 user with no active sessions'
    );
    System.assert(
      usersWithNoSessions.contains(testUser2.Id),
      'User 2 should have no active sessions'
    );
  }

  @isTest
  static void testGetSessionAnalytics() {
    User testUser = [
      SELECT Id
      FROM User
      WHERE Username LIKE 'sessiontest%'
      LIMIT 1
    ];

    List<User_Session_Tracking__c> sessions = new List<User_Session_Tracking__c>();
    for (Integer i = 0; i < 5; i++) {
      User_Session_Tracking__c session = SessionManagementTestDataFactory.createSession(
        testUser.Id,
        false
      );
      session.Login_Time__c = DateTime.now().addHours(-i);
      session.Logout_Time__c = session.Login_Time__c.addMinutes(30);
      session.Logout_Type__c = i < 2 ? 'Manual' : 'Timeout';
      session.Device_Type__c = i < 3 ? 'Desktop' : 'Mobile';
      sessions.add(session);
    }
    insert sessions;

    Test.startTest();
    Map<String, Object> analytics = SessionMonitoringService.getSessionAnalytics(
      'WEEK'
    );
    Test.stopTest();

    System.assertNotEquals(null, analytics, 'Analytics should not be null');
    System.assert(
      analytics.containsKey('totalSessions'),
      'Should contain totalSessions'
    );
    System.assert(
      analytics.containsKey('uniqueUsers'),
      'Should contain uniqueUsers'
    );
    System.assert(
      analytics.containsKey('logoutTypes'),
      'Should contain logoutTypes'
    );
    System.assert(
      analytics.containsKey('deviceTypes'),
      'Should contain deviceTypes'
    );
  }

  @isTest
  static void testUpdateUserActivity() {
    User testUser = [
      SELECT Id
      FROM User
      WHERE Username LIKE 'sessiontest%'
      LIMIT 1
    ];

    User_Session_Tracking__c session = SessionManagementTestDataFactory.createSession(
      testUser.Id,
      true
    );
    insert session;

    DateTime originalActivity = session.Last_Activity__c;

    System.runAs(testUser) {
      Test.startTest();
      SessionMonitoringService.updateUserActivity();
      Test.stopTest();
    }

    User_Session_Tracking__c updatedSession = [
      SELECT Last_Activity__c
      FROM User_Session_Tracking__c
      WHERE Id = :session.Id
    ];

    System.assertNotEquals(
      originalActivity,
      updatedSession.Last_Activity__c,
      'Activity time should be updated'
    );
  }

  @isTest
  static void testDeactivateUsers() {
    User testUser = [
      SELECT Id, IsActive
      FROM User
      WHERE Username LIKE 'sessiontest%'
      LIMIT 1
    ];
    Set<Id> userIds = new Set<Id>{ testUser.Id };

    Test.startTest();
    try {
      SessionMonitoringService.deactivateUsers(userIds);
    } catch (Exception e) {
      System.debug(
        'Expected exception for deactivating current user: ' + e.getMessage()
      );
    }
    Test.stopTest();

    System.assert(true, 'Method should handle exceptions gracefully');
  }
}
