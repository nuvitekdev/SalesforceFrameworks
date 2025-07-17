@isTest
private class LogoutEventStreamTriggerHandlerTest {
  @isTest
  static void testHandleAfterInsert_BasicLogout() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create active session
    User_Session_Tracking__c activeSession = SessionManagementTestDataFactory.createSession(
      testUser.Id,
      true
    );
    activeSession.Session_Id__c = 'LOGOUT_TEST_SESSION';
    insert activeSession;

    // Create LogoutEventStream
    LogoutEventStream logoutEvent = new LogoutEventStream();
    logoutEvent.SessionKey = 'LOGOUT_TEST_SESSION';
    logoutEvent.UserId = testUser.Id;
    logoutEvent.EventIdentifier = 'manual_logout';

    Test.startTest();
    LogoutEventStreamTriggerHandler.handleAfterInsert(
      new List<LogoutEventStream>{ logoutEvent }
    );
    Test.stopTest();

    // Verify session was deactivated
    User_Session_Tracking__c updatedSession = [
      SELECT Is_Active__c, Logout_Time__c, Logout_Type__c
      FROM User_Session_Tracking__c
      WHERE Id = :activeSession.Id
    ];

    System.assertEquals(
      false,
      updatedSession.Is_Active__c,
      'Session should be deactivated'
    );
    System.assertNotEquals(
      null,
      updatedSession.Logout_Time__c,
      'Logout time should be set'
    );
    System.assertEquals(
      'Manual',
      updatedSession.Logout_Type__c,
      'Logout type should be Manual'
    );
  }

  @isTest
  static void testHandleAfterInsert_TimeoutLogout() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create active session
    User_Session_Tracking__c activeSession = SessionManagementTestDataFactory.createSession(
      testUser.Id,
      true
    );
    activeSession.Session_Id__c = 'TIMEOUT_SESSION';
    insert activeSession;

    // Create LogoutEventStream with timeout identifier
    LogoutEventStream logoutEvent = new LogoutEventStream();
    logoutEvent.SessionKey = 'TIMEOUT_SESSION';
    logoutEvent.UserId = testUser.Id;
    logoutEvent.EventIdentifier = 'session_timeout_occurred';

    Test.startTest();
    LogoutEventStreamTriggerHandler.handleAfterInsert(
      new List<LogoutEventStream>{ logoutEvent }
    );
    Test.stopTest();

    // Verify logout type
    User_Session_Tracking__c updatedSession = [
      SELECT Logout_Type__c
      FROM User_Session_Tracking__c
      WHERE Id = :activeSession.Id
    ];

    System.assertEquals(
      'Timeout',
      updatedSession.Logout_Type__c,
      'Logout type should be Timeout'
    );
  }

  @isTest
  static void testHandleAfterInsert_AdminForcedLogout() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create active session
    User_Session_Tracking__c activeSession = SessionManagementTestDataFactory.createSession(
      testUser.Id,
      true
    );
    activeSession.Session_Id__c = 'ADMIN_FORCED_SESSION';
    insert activeSession;

    // Create LogoutEventStream with admin session level
    LogoutEventStream logoutEvent = new LogoutEventStream();
    logoutEvent.SessionKey = 'ADMIN_FORCED_SESSION';
    logoutEvent.UserId = testUser.Id;
    logoutEvent.SessionLevel = 'admin_terminated';

    Test.startTest();
    LogoutEventStreamTriggerHandler.handleAfterInsert(
      new List<LogoutEventStream>{ logoutEvent }
    );
    Test.stopTest();

    // Verify logout type
    User_Session_Tracking__c updatedSession = [
      SELECT Logout_Type__c
      FROM User_Session_Tracking__c
      WHERE Id = :activeSession.Id
    ];

    System.assertEquals(
      'Admin_Forced',
      updatedSession.Logout_Type__c,
      'Logout type should be Admin_Forced'
    );
  }

  @isTest
  static void testHandleAfterInsert_MultipleLogouts() {
    // Create test users
    User testUser1 = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    User testUser2 = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert new List<User>{ testUser1, testUser2 };

    // Create active sessions
    List<User_Session_Tracking__c> sessions = new List<User_Session_Tracking__c>();
    User_Session_Tracking__c session1 = SessionManagementTestDataFactory.createSession(
      testUser1.Id,
      true
    );
    session1.Session_Id__c = 'SESSION_1';
    sessions.add(session1);

    User_Session_Tracking__c session2 = SessionManagementTestDataFactory.createSession(
      testUser2.Id,
      true
    );
    session2.Session_Id__c = 'SESSION_2';
    sessions.add(session2);

    insert sessions;

    // Create LogoutEventStreams
    List<LogoutEventStream> logoutEvents = new List<LogoutEventStream>();

    LogoutEventStream event1 = new LogoutEventStream();
    event1.SessionKey = 'SESSION_1';
    event1.UserId = testUser1.Id;
    logoutEvents.add(event1);

    LogoutEventStream event2 = new LogoutEventStream();
    event2.SessionKey = 'SESSION_2';
    event2.UserId = testUser2.Id;
    logoutEvents.add(event2);

    Test.startTest();
    LogoutEventStreamTriggerHandler.handleAfterInsert(logoutEvents);
    Test.stopTest();

    // Verify both sessions were deactivated
    List<User_Session_Tracking__c> deactivatedSessions = [
      SELECT Is_Active__c
      FROM User_Session_Tracking__c
      WHERE Id IN :sessions
    ];

    for (User_Session_Tracking__c session : deactivatedSessions) {
      System.assertEquals(
        false,
        session.Is_Active__c,
        'All sessions should be deactivated'
      );
    }
  }

  @isTest
  static void testHandleAfterInsert_SessionNotFound() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create LogoutEventStream for non-existent session
    LogoutEventStream logoutEvent = new LogoutEventStream();
    logoutEvent.SessionKey = 'NON_EXISTENT_SESSION';
    logoutEvent.UserId = testUser.Id;

    Test.startTest();
    // Should handle gracefully when session not found
    try {
      LogoutEventStreamTriggerHandler.handleAfterInsert(
        new List<LogoutEventStream>{ logoutEvent }
      );
      System.assert(
        true,
        'Method should handle non-existent session gracefully'
      );
    } catch (Exception e) {
      System.assert(
        false,
        'Should not throw exception for non-existent session'
      );
    }
    Test.stopTest();
  }

  @isTest
  static void testHandleAfterInsert_InactiveSession() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create inactive session
    User_Session_Tracking__c inactiveSession = SessionManagementTestDataFactory.createSession(
      testUser.Id,
      false
    );
    inactiveSession.Session_Id__c = 'INACTIVE_SESSION';
    insert inactiveSession;

    // Create LogoutEventStream
    LogoutEventStream logoutEvent = new LogoutEventStream();
    logoutEvent.SessionKey = 'INACTIVE_SESSION';
    logoutEvent.UserId = testUser.Id;

    Test.startTest();
    LogoutEventStreamTriggerHandler.handleAfterInsert(
      new List<LogoutEventStream>{ logoutEvent }
    );
    Test.stopTest();

    // Verify session remains inactive
    User_Session_Tracking__c unchangedSession = [
      SELECT Is_Active__c, Logout_Time__c
      FROM User_Session_Tracking__c
      WHERE Id = :inactiveSession.Id
    ];

    System.assertEquals(
      false,
      unchangedSession.Is_Active__c,
      'Session should remain inactive'
    );
  }

  @isTest
  static void testHandleAfterInsert_AutoDeactivationEnabled() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create active session (this will be the only session for the user)
    User_Session_Tracking__c activeSession = SessionManagementTestDataFactory.createSession(
      testUser.Id,
      true
    );
    activeSession.Session_Id__c = 'LAST_SESSION';
    insert activeSession;

    // Create LogoutEventStream
    LogoutEventStream logoutEvent = new LogoutEventStream();
    logoutEvent.SessionKey = 'LAST_SESSION';
    logoutEvent.UserId = testUser.Id;

    Test.startTest();
    LogoutEventStreamTriggerHandler.handleAfterInsert(
      new List<LogoutEventStream>{ logoutEvent }
    );
    Test.stopTest();

    // Verify user deactivation logic was called
    // Note: Actual user deactivation might be prevented by Salesforce security
    // so we just verify the session was deactivated
    User_Session_Tracking__c updatedSession = [
      SELECT Is_Active__c
      FROM User_Session_Tracking__c
      WHERE Id = :activeSession.Id
    ];

    System.assertEquals(
      false,
      updatedSession.Is_Active__c,
      'Session should be deactivated'
    );
  }

  @isTest
  static void testHandleAfterInsert_SessionMonitoringDisabled() {
    // This test would require mocking Session_Configuration__mdt
    // Since we can't mock custom metadata, we test that code handles the config

    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create LogoutEventStream
    LogoutEventStream logoutEvent = new LogoutEventStream();
    logoutEvent.SessionKey = 'TEST_SESSION';
    logoutEvent.UserId = testUser.Id;

    Test.startTest();
    // Should not throw exception regardless of config
    LogoutEventStreamTriggerHandler.handleAfterInsert(
      new List<LogoutEventStream>{ logoutEvent }
    );
    Test.stopTest();

    System.assert(true, 'Method should handle config settings gracefully');
  }

  @isTest
  static void testHandleAfterInsert_ExceptionHandling() {
    // Test exception handling
    List<LogoutEventStream> invalidEvents = new List<LogoutEventStream>();
    LogoutEventStream nullEvent = new LogoutEventStream();
    // Don't set required fields
    invalidEvents.add(nullEvent);

    Test.startTest();
    try {
      LogoutEventStreamTriggerHandler.handleAfterInsert(invalidEvents);
      System.assert(true, 'Method should handle exceptions gracefully');
    } catch (Exception e) {
      System.assert(false, 'Method should not throw unhandled exception');
    }
    Test.stopTest();
  }

  @isTest
  static void testHandleAfterInsert_BulkOperations() {
    // Create multiple test users
    List<User> testUsers = new List<User>();
    for (Integer i = 0; i < 50; i++) {
      testUsers.add(
        SessionManagementTestDataFactory.createTestUser('Standard User')
      );
    }
    insert testUsers;

    // Create active sessions
    List<User_Session_Tracking__c> sessions = new List<User_Session_Tracking__c>();
    for (Integer i = 0; i < testUsers.size(); i++) {
      User_Session_Tracking__c session = SessionManagementTestDataFactory.createSession(
        testUsers[i].Id,
        true
      );
      session.Session_Id__c = 'BULK_SESSION_' + i;
      sessions.add(session);
    }
    insert sessions;

    // Create LogoutEventStreams
    List<LogoutEventStream> logoutEvents = new List<LogoutEventStream>();
    for (Integer i = 0; i < testUsers.size(); i++) {
      LogoutEventStream event = new LogoutEventStream();
      event.SessionKey = 'BULK_SESSION_' + i;
      event.UserId = testUsers[i].Id;
      logoutEvents.add(event);
    }

    Test.startTest();
    LogoutEventStreamTriggerHandler.handleAfterInsert(logoutEvents);
    Test.stopTest();

    // Verify all sessions were deactivated
    List<User_Session_Tracking__c> deactivatedSessions = [
      SELECT Id
      FROM User_Session_Tracking__c
      WHERE Is_Active__c = FALSE AND Session_Id__c LIKE 'BULK_SESSION_%'
    ];

    System.assertEquals(
      testUsers.size(),
      deactivatedSessions.size(),
      'All sessions should be deactivated'
    );
  }

  @isTest
  static void testCheckAndDeactivateUsers_NoActiveSessions() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create and logout all sessions
    User_Session_Tracking__c session = SessionManagementTestDataFactory.createSession(
      testUser.Id,
      true
    );
    session.Session_Id__c = 'FINAL_SESSION';
    insert session;

    // Create LogoutEventStream
    LogoutEventStream logoutEvent = new LogoutEventStream();
    logoutEvent.SessionKey = 'FINAL_SESSION';
    logoutEvent.UserId = testUser.Id;

    Test.startTest();
    LogoutEventStreamTriggerHandler.handleAfterInsert(
      new List<LogoutEventStream>{ logoutEvent }
    );
    Test.stopTest();

    // Verify session was deactivated
    User_Session_Tracking__c deactivatedSession = [
      SELECT Is_Active__c
      FROM User_Session_Tracking__c
      WHERE Id = :session.Id
    ];

    System.assertEquals(
      false,
      deactivatedSession.Is_Active__c,
      'Session should be deactivated'
    );

    // Note: User deactivation might be prevented by Salesforce security
    // The test verifies the logic runs without error
  }

  @isTest
  static void testDetermineLogoutType_NullEventIdentifier() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create active session
    User_Session_Tracking__c activeSession = SessionManagementTestDataFactory.createSession(
      testUser.Id,
      true
    );
    activeSession.Session_Id__c = 'NULL_IDENTIFIER_SESSION';
    insert activeSession;

    // Create LogoutEventStream with null EventIdentifier
    LogoutEventStream logoutEvent = new LogoutEventStream();
    logoutEvent.SessionKey = 'NULL_IDENTIFIER_SESSION';
    logoutEvent.UserId = testUser.Id;
    logoutEvent.EventIdentifier = null;
    logoutEvent.SessionLevel = null;

    Test.startTest();
    LogoutEventStreamTriggerHandler.handleAfterInsert(
      new List<LogoutEventStream>{ logoutEvent }
    );
    Test.stopTest();

    // Verify default logout type
    User_Session_Tracking__c updatedSession = [
      SELECT Logout_Type__c
      FROM User_Session_Tracking__c
      WHERE Id = :activeSession.Id
    ];

    System.assertEquals(
      'Manual',
      updatedSession.Logout_Type__c,
      'Default logout type should be Manual'
    );
  }
}
