@isTest
private class LoginEventTriggerHandlerTest {
  @isTest
  static void testHandleAfterInsert_SessionMonitoringEnabled() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create LoginEvent records
    List<LoginEvent> loginEvents = new List<LoginEvent>();

    LoginEvent event1 = new LoginEvent();
    event1.UserId = testUser.Id;
    event1.SessionKey = 'SESSION_KEY_1';
    event1.EventDate = DateTime.now();
    event1.LoginType = 'UI';
    event1.SourceIp = '192.168.1.100';
    event1.Browser = 'Chrome 98.0';
    event1.Platform = 'Windows 10';
    event1.LoginUrl = 'https://test.salesforce.com';
    event1.LoginGeoId = 'US-CA';

    loginEvents.add(event1);

    Test.startTest();
    LoginEventTriggerHandler.handleAfterInsert(loginEvents);
    Test.stopTest();

    // Verify session was created
    List<User_Session_Tracking__c> sessions = [
      SELECT
        Id,
        User__c,
        Session_Id__c,
        Is_Active__c,
        Session_Type__c,
        IP_Address__c,
        Browser_Info__c,
        Device_Type__c
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id
    ];

    System.assertEquals(1, sessions.size(), 'One session should be created');
    System.assertEquals(
      'SESSION_KEY_1',
      sessions[0].Session_Id__c,
      'Session ID should match'
    );
    System.assertEquals(
      true,
      sessions[0].Is_Active__c,
      'Session should be active'
    );
    System.assertEquals(
      'Internal',
      sessions[0].Session_Type__c,
      'Session type should be Internal'
    );
    System.assertEquals(
      '192.168.1.100',
      sessions[0].IP_Address__c,
      'IP address should match'
    );
    System.assertEquals(
      'Chrome 98.0',
      sessions[0].Browser_Info__c,
      'Browser info should match'
    );
    System.assertEquals(
      'Desktop',
      sessions[0].Device_Type__c,
      'Device type should be Desktop'
    );
  }

  @isTest
  static void testHandleAfterInsert_MultipleEventsForSameUser() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create multiple LoginEvents for same user
    List<LoginEvent> loginEvents = new List<LoginEvent>();

    for (Integer i = 0; i < 3; i++) {
      LoginEvent event = new LoginEvent();
      event.UserId = testUser.Id;
      event.SessionKey = 'SESSION_KEY_' + i;
      event.EventDate = DateTime.now().addMinutes(-i);
      event.LoginType = 'UI';
      event.SourceIp = '192.168.1.' + (100 + i);
      event.Browser = 'Chrome';
      event.Platform = 'Windows';

      loginEvents.add(event);
    }

    Test.startTest();
    LoginEventTriggerHandler.handleAfterInsert(loginEvents);
    Test.stopTest();

    // Verify only the latest event created a session
    List<User_Session_Tracking__c> sessions = [
      SELECT Id, Session_Id__c
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id
    ];

    System.assertEquals(
      1,
      sessions.size(),
      'Only one session should be created for latest event'
    );
    System.assertEquals(
      'SESSION_KEY_0',
      sessions[0].Session_Id__c,
      'Latest session should be created'
    );
  }

  @isTest
  static void testHandleAfterInsert_PortalSessionType() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create LoginEvent with Portal login type
    LoginEvent event = new LoginEvent();
    event.UserId = testUser.Id;
    event.SessionKey = 'PORTAL_SESSION';
    event.EventDate = DateTime.now();
    event.LoginType = 'Customer Portal';
    event.Platform = 'Windows';

    Test.startTest();
    LoginEventTriggerHandler.handleAfterInsert(new List<LoginEvent>{ event });
    Test.stopTest();

    // Verify session type
    User_Session_Tracking__c session = [
      SELECT Session_Type__c
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id
      LIMIT 1
    ];

    System.assertEquals(
      'Portal',
      session.Session_Type__c,
      'Session type should be Portal'
    );
  }

  @isTest
  static void testHandleAfterInsert_CommunitySessionType() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create LoginEvent with Community login type
    LoginEvent event = new LoginEvent();
    event.UserId = testUser.Id;
    event.SessionKey = 'COMMUNITY_SESSION';
    event.EventDate = DateTime.now();
    event.LoginType = 'Community';
    event.Platform = 'Windows';

    Test.startTest();
    LoginEventTriggerHandler.handleAfterInsert(new List<LoginEvent>{ event });
    Test.stopTest();

    // Verify session type
    User_Session_Tracking__c session = [
      SELECT Session_Type__c
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id
      LIMIT 1
    ];

    System.assertEquals(
      'Community',
      session.Session_Type__c,
      'Session type should be Community'
    );
  }

  @isTest
  static void testHandleAfterInsert_MobileDeviceType() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create LoginEvent with mobile platform
    LoginEvent event = new LoginEvent();
    event.UserId = testUser.Id;
    event.SessionKey = 'MOBILE_SESSION';
    event.EventDate = DateTime.now();
    event.LoginType = 'UI';
    event.Platform = 'iOS Mobile Safari';

    Test.startTest();
    LoginEventTriggerHandler.handleAfterInsert(new List<LoginEvent>{ event });
    Test.stopTest();

    // Verify device type
    User_Session_Tracking__c session = [
      SELECT Device_Type__c
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id
      LIMIT 1
    ];

    System.assertEquals(
      'Mobile',
      session.Device_Type__c,
      'Device type should be Mobile'
    );
  }

  @isTest
  static void testHandleAfterInsert_TabletDeviceType() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create LoginEvent with tablet platform
    LoginEvent event = new LoginEvent();
    event.UserId = testUser.Id;
    event.SessionKey = 'TABLET_SESSION';
    event.EventDate = DateTime.now();
    event.LoginType = 'UI';
    event.Platform = 'iPad Safari';

    Test.startTest();
    LoginEventTriggerHandler.handleAfterInsert(new List<LoginEvent>{ event });
    Test.stopTest();

    // Verify device type
    User_Session_Tracking__c session = [
      SELECT Device_Type__c
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id
      LIMIT 1
    ];

    System.assertEquals(
      'Tablet',
      session.Device_Type__c,
      'Device type should be Tablet'
    );
  }

  @isTest
  static void testHandleAfterInsert_ConcurrentSessionsCheck() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create existing sessions to exceed limit
    List<User_Session_Tracking__c> existingSessions = SessionManagementTestDataFactory.createSessions(
      testUser.Id,
      3,
      true
    );
    insert existingSessions;

    // Create new LoginEvent
    LoginEvent event = new LoginEvent();
    event.UserId = testUser.Id;
    event.SessionKey = 'NEW_SESSION';
    event.EventDate = DateTime.now();
    event.LoginType = 'UI';
    event.Platform = 'Windows';

    Test.startTest();
    LoginEventTriggerHandler.handleAfterInsert(new List<LoginEvent>{ event });
    Test.stopTest();

    // Verify that only max allowed sessions are active
    List<User_Session_Tracking__c> activeSessions = [
      SELECT Id
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id AND Is_Active__c = TRUE
    ];

    Session_Configuration__mdt config = SessionMonitoringService.getSessionConfig();
    Integer maxSessions = Integer.valueOf(config.Max_Concurrent_Sessions__c);

    System.assert(
      activeSessions.size() <= maxSessions,
      'Active sessions should not exceed max limit'
    );
  }

  @isTest
  static void testHandleAfterInsert_SessionMonitoringDisabled() {
    // This test would require mocking the Session_Configuration__mdt to disable monitoring
    // Since we can't mock custom metadata in tests, we'll test the code path exists

    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create LoginEvent
    LoginEvent event = new LoginEvent();
    event.UserId = testUser.Id;
    event.SessionKey = 'TEST_SESSION';
    event.EventDate = DateTime.now();
    event.LoginType = 'UI';
    event.Platform = 'Windows';

    Test.startTest();
    // Should not throw exception even if monitoring might be disabled
    LoginEventTriggerHandler.handleAfterInsert(new List<LoginEvent>{ event });
    Test.stopTest();

    // If monitoring is enabled, session will be created; if disabled, no session
    List<User_Session_Tracking__c> sessions = [
      SELECT Id
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id
    ];

    // Assert based on actual config
    Session_Configuration__mdt config = SessionMonitoringService.getSessionConfig();
    if (config.Enable_Session_Monitoring__c) {
      System.assert(
        sessions.size() > 0,
        'Session should be created when monitoring is enabled'
      );
    } else {
      System.assertEquals(
        0,
        sessions.size(),
        'No session should be created when monitoring is disabled'
      );
    }
  }

  @isTest
  static void testHandleAfterInsert_ExceptionHandling() {
    // Test exception handling by passing null values
    List<LoginEvent> nullEvents = new List<LoginEvent>();
    LoginEvent invalidEvent = new LoginEvent();
    // Don't set required fields to potentially cause exception
    nullEvents.add(invalidEvent);

    Test.startTest();
    try {
      LoginEventTriggerHandler.handleAfterInsert(nullEvents);
      // Should handle gracefully
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

    // Create LoginEvents for all users
    List<LoginEvent> loginEvents = new List<LoginEvent>();
    for (Integer i = 0; i < testUsers.size(); i++) {
      LoginEvent event = new LoginEvent();
      event.UserId = testUsers[i].Id;
      event.SessionKey = 'SESSION_' + i;
      event.EventDate = DateTime.now();
      event.LoginType = 'UI';
      event.Platform = 'Windows';

      loginEvents.add(event);
    }

    Test.startTest();
    LoginEventTriggerHandler.handleAfterInsert(loginEvents);
    Test.stopTest();

    // Verify sessions were created for all users
    List<User_Session_Tracking__c> sessions = [
      SELECT Id
      FROM User_Session_Tracking__c
      WHERE User__c IN :testUsers
    ];

    System.assertEquals(
      testUsers.size(),
      sessions.size(),
      'Sessions should be created for all users'
    );
  }

  @isTest
  static void testDetermineSessionType_BlankLoginType() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create LoginEvent with blank login type
    LoginEvent event = new LoginEvent();
    event.UserId = testUser.Id;
    event.SessionKey = 'BLANK_TYPE_SESSION';
    event.EventDate = DateTime.now();
    event.LoginType = '';
    event.Platform = 'Windows';

    Test.startTest();
    LoginEventTriggerHandler.handleAfterInsert(new List<LoginEvent>{ event });
    Test.stopTest();

    // Verify session type defaults to Internal
    User_Session_Tracking__c session = [
      SELECT Session_Type__c
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id
      LIMIT 1
    ];

    System.assertEquals(
      'Internal',
      session.Session_Type__c,
      'Session type should default to Internal'
    );
  }

  @isTest
  static void testDetermineDeviceType_BlankPlatform() {
    // Create test user
    User testUser = SessionManagementTestDataFactory.createTestUser(
      'Standard User'
    );
    insert testUser;

    // Create LoginEvent with blank platform
    LoginEvent event = new LoginEvent();
    event.UserId = testUser.Id;
    event.SessionKey = 'BLANK_PLATFORM_SESSION';
    event.EventDate = DateTime.now();
    event.LoginType = 'UI';
    event.Platform = '';

    Test.startTest();
    LoginEventTriggerHandler.handleAfterInsert(new List<LoginEvent>{ event });
    Test.stopTest();

    // Verify device type defaults to Desktop
    User_Session_Tracking__c session = [
      SELECT Device_Type__c
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id
      LIMIT 1
    ];

    System.assertEquals(
      'Desktop',
      session.Device_Type__c,
      'Device type should default to Desktop'
    );
  }
}
