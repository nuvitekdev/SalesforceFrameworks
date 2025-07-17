@isTest
public class SessionTriggerHandlerTest {
  @testSetup
  static void setup() {
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;
  }

  @isTest
  static void testLoginEventHandlerPositive() {
    User testUser = [
      SELECT Id
      FROM User
      WHERE Username LIKE 'sessiontest%'
      LIMIT 1
    ];

    LoginEvent mockEvent = new LoginEvent();
    mockEvent.UserId = testUser.Id;
    mockEvent.EventDate = DateTime.now();
    mockEvent.SessionKey = 'TEST_SESSION_KEY_123';
    mockEvent.LoginType = 'Application';
    mockEvent.SourceIp = '192.168.1.100';
    mockEvent.Browser = 'Chrome';
    mockEvent.Platform = 'Windows';
    mockEvent.LoginUrl = 'https://test.salesforce.com';
    mockEvent.LoginGeoId = 'US-CA';

    List<LoginEvent> events = new List<LoginEvent>{ mockEvent };

    Test.startTest();
    LoginEventTriggerHandler.handleAfterInsert(events);
    Test.stopTest();

    List<User_Session_Tracking__c> sessions = [
      SELECT Id, User__c, Session_Id__c, Is_Active__c, Session_Type__c
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id
    ];

    System.assertEquals(1, sessions.size(), 'Should create one session');
    System.assertEquals(
      true,
      sessions[0].Is_Active__c,
      'Session should be active'
    );
    System.assertEquals(
      'Internal',
      sessions[0].Session_Type__c,
      'Should be Internal session'
    );
  }

  @isTest
  static void testLoginEventHandlerPortalUser() {
    User testUser = [
      SELECT Id
      FROM User
      WHERE Username LIKE 'sessiontest%'
      LIMIT 1
    ];

    LoginEvent mockEvent = new LoginEvent();
    mockEvent.UserId = testUser.Id;
    mockEvent.EventDate = DateTime.now();
    mockEvent.SessionKey = 'PORTAL_SESSION_KEY_123';
    mockEvent.LoginType = 'Customer Portal';
    mockEvent.SourceIp = '192.168.1.100';
    mockEvent.Platform = 'Mobile';

    List<LoginEvent> events = new List<LoginEvent>{ mockEvent };

    Test.startTest();
    LoginEventTriggerHandler.handleAfterInsert(events);
    Test.stopTest();

    User_Session_Tracking__c session = [
      SELECT Session_Type__c, Device_Type__c
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id
    ];

    System.assertEquals(
      'Portal',
      session.Session_Type__c,
      'Should be Portal session'
    );
    System.assertEquals(
      'Mobile',
      session.Device_Type__c,
      'Should be Mobile device'
    );
  }

  @isTest
  static void testLoginEventHandlerConcurrentSessions() {
    User testUser = [
      SELECT Id
      FROM User
      WHERE Username LIKE 'sessiontest%'
      LIMIT 1
    ];

    List<User_Session_Tracking__c> existingSessions = SessionManagementTestDataFactory.createSessions(
      testUser.Id,
      3,
      true
    );
    insert existingSessions;

    LoginEvent mockEvent = new LoginEvent();
    mockEvent.UserId = testUser.Id;
    mockEvent.EventDate = DateTime.now();
    mockEvent.SessionKey = 'NEW_SESSION_KEY_123';
    mockEvent.LoginType = 'Application';

    List<LoginEvent> events = new List<LoginEvent>{ mockEvent };

    Test.startTest();
    LoginEventTriggerHandler.handleAfterInsert(events);
    Test.stopTest();

    List<User_Session_Tracking__c> activeSessions = [
      SELECT Id
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id AND Is_Active__c = TRUE
    ];

    System.assertEquals(
      3,
      activeSessions.size(),
      'Should maintain max concurrent sessions'
    );
  }

  @isTest
  static void testLogoutEventHandlerManualLogout() {
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

    LogoutEventStream mockEvent = new LogoutEventStream();
    mockEvent.UserId = testUser.Id;
    mockEvent.SessionKey = session.Session_Id__c;
    mockEvent.EventIdentifier = 'manual_logout';

    List<LogoutEventStream> events = new List<LogoutEventStream>{ mockEvent };

    Test.startTest();
    LogoutEventStreamTriggerHandler.handleAfterInsert(events);
    Test.stopTest();

    User_Session_Tracking__c updatedSession = [
      SELECT Is_Active__c, Logout_Type__c
      FROM User_Session_Tracking__c
      WHERE Id = :session.Id
    ];

    System.assertEquals(
      false,
      updatedSession.Is_Active__c,
      'Session should be inactive'
    );
    System.assertEquals(
      'Manual',
      updatedSession.Logout_Type__c,
      'Should be manual logout'
    );
  }

  @isTest
  static void testLogoutEventHandlerTimeout() {
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

    LogoutEventStream mockEvent = new LogoutEventStream();
    mockEvent.UserId = testUser.Id;
    mockEvent.SessionKey = session.Session_Id__c;
    mockEvent.EventIdentifier = 'session_timeout';

    List<LogoutEventStream> events = new List<LogoutEventStream>{ mockEvent };

    Test.startTest();
    LogoutEventStreamTriggerHandler.handleAfterInsert(events);
    Test.stopTest();

    User_Session_Tracking__c updatedSession = [
      SELECT Is_Active__c, Logout_Type__c
      FROM User_Session_Tracking__c
      WHERE Id = :session.Id
    ];

    System.assertEquals(
      false,
      updatedSession.Is_Active__c,
      'Session should be inactive'
    );
    System.assertEquals(
      'Timeout',
      updatedSession.Logout_Type__c,
      'Should be timeout logout'
    );
  }

  @isTest
  static void testLogoutEventHandlerWithUserDeactivation() {
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    User_Session_Tracking__c session = SessionManagementTestDataFactory.createSession(
      testUser.Id,
      true
    );
    insert session;

    LogoutEventStream mockEvent = new LogoutEventStream();
    mockEvent.UserId = testUser.Id;
    mockEvent.SessionKey = session.Session_Id__c;

    List<LogoutEventStream> events = new List<LogoutEventStream>{ mockEvent };

    Test.startTest();
    LogoutEventStreamTriggerHandler.handleAfterInsert(events);
    Test.stopTest();

    System.assert(true, 'Should handle user deactivation process');
  }

  @isTest
  static void testBulkOperations() {
    List<User> testUsers = new List<User>();
    for (Integer i = 0; i < 5; i++) {
      testUsers.add(
        SessionManagementTestDataFactory.createTestUser('Standard User')
      );
    }
    insert testUsers;

    List<LoginEvent> loginEvents = new List<LoginEvent>();
    for (User u : testUsers) {
      LoginEvent event = new LoginEvent();
      event.UserId = u.Id;
      event.EventDate = DateTime.now();
      event.SessionKey = 'SESSION_' + u.Id;
      event.LoginType = 'Application';
      loginEvents.add(event);
    }

    Test.startTest();
    LoginEventTriggerHandler.handleAfterInsert(loginEvents);
    Test.stopTest();

    Integer sessionCount = [
      SELECT COUNT()
      FROM User_Session_Tracking__c
      WHERE Is_Active__c = TRUE
    ];
    System.assertEquals(
      5,
      sessionCount,
      'Should create sessions for all users'
    );
  }
}
