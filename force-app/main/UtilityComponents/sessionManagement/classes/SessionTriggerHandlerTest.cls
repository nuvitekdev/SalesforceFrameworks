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
  static void testBasicSessionCreation() {
    User testUser = [
      SELECT Id
      FROM User
      WHERE Username LIKE 'sessiontest%'
      LIMIT 1
    ];

    Test.startTest();
    // Create a session tracking record directly for testing
    User_Session_Tracking__c session = new User_Session_Tracking__c();
    session.User__c = testUser.Id;
    session.Session_Id__c = 'TEST_SESSION_123';
    session.Is_Active__c = true;
    session.Login_Time__c = DateTime.now();
    session.Session_Type__c = 'Internal';
    session.IP_Address__c = '192.168.1.100';
    session.Browser_Info__c = 'Chrome';
    session.Platform_Info__c = 'Windows';
    insert session;
    Test.stopTest();

    List<User_Session_Tracking__c> sessions = [
      SELECT Id, User__c, Session_Id__c, Is_Active__c
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id
    ];

    System.assertEquals(1, sessions.size(), 'Should have one session');
    System.assertEquals(
      true,
      sessions[0].Is_Active__c,
      'Session should be active'
    );
  }

  @isTest
  static void testSessionUpdate() {
    User testUser = [
      SELECT Id
      FROM User
      WHERE Username LIKE 'sessiontest%'
      LIMIT 1
    ];

    // Create initial session
    User_Session_Tracking__c session = new User_Session_Tracking__c();
    session.User__c = testUser.Id;
    session.Session_Id__c = 'TEST_SESSION_456';
    session.Is_Active__c = true;
    session.Login_Time__c = DateTime.now();
    session.Session_Type__c = 'Internal';
    insert session;

    Test.startTest();
    // Update session
    session.Last_Activity__c = DateTime.now();
    session.Is_Active__c = false;
    session.Logout_Time__c = DateTime.now();
    session.Logout_Type__c = 'Manual';
    update session;
    Test.stopTest();

    User_Session_Tracking__c updatedSession = [
      SELECT Id, Is_Active__c, Logout_Type__c
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
      'Logout type should be Manual'
    );
  }

  @isTest
  static void testMultipleSessions() {
    User testUser = [
      SELECT Id
      FROM User
      WHERE Username LIKE 'sessiontest%'
      LIMIT 1
    ];

    Test.startTest();
    List<User_Session_Tracking__c> sessions = new List<User_Session_Tracking__c>();

    for (Integer i = 0; i < 5; i++) {
      User_Session_Tracking__c session = new User_Session_Tracking__c();
      session.User__c = testUser.Id;
      session.Session_Id__c = 'TEST_SESSION_' + i;
      session.Is_Active__c = (i == 4); // Only last one is active
      session.Login_Time__c = DateTime.now().addMinutes(-i * 10);
      session.Session_Type__c = 'Internal';
      sessions.add(session);
    }

    insert sessions;
    Test.stopTest();

    List<User_Session_Tracking__c> activeSessions = [
      SELECT Id
      FROM User_Session_Tracking__c
      WHERE User__c = :testUser.Id AND Is_Active__c = TRUE
    ];

    System.assertEquals(
      1,
      activeSessions.size(),
      'Should have one active session'
    );
  }

  @isTest
  static void testSessionDurationCalculation() {
    User testUser = [
      SELECT Id
      FROM User
      WHERE Username LIKE 'sessiontest%'
      LIMIT 1
    ];

    DateTime loginTime = DateTime.now().addHours(-2);
    DateTime logoutTime = DateTime.now();

    Test.startTest();
    User_Session_Tracking__c session = new User_Session_Tracking__c();
    session.User__c = testUser.Id;
    session.Session_Id__c = 'TEST_DURATION_SESSION';
    session.Is_Active__c = false;
    session.Login_Time__c = loginTime;
    session.Logout_Time__c = logoutTime;
    session.Session_Type__c = 'Internal';
    insert session;
    Test.stopTest();

    User_Session_Tracking__c insertedSession = [
      SELECT Id, Session_Duration_Minutes__c
      FROM User_Session_Tracking__c
      WHERE Id = :session.Id
    ];

    // Session_Duration_Minutes__c is a formula field
    System.assertNotEquals(
      null,
      insertedSession.Session_Duration_Minutes__c,
      'Duration should be calculated'
    );
  }

  @isTest
  static void testBulkSessionCreation() {
    List<User> testUsers = new List<User>();
    for (Integer i = 0; i < 10; i++) {
      testUsers.add(
        SessionManagementTestDataFactory.createTestUser('Standard User')
      );
    }
    insert testUsers;

    Test.startTest();
    List<User_Session_Tracking__c> sessions = new List<User_Session_Tracking__c>();

    for (User u : testUsers) {
      User_Session_Tracking__c session = new User_Session_Tracking__c();
      session.User__c = u.Id;
      session.Session_Id__c = 'BULK_SESSION_' + u.Id;
      session.Is_Active__c = true;
      session.Login_Time__c = DateTime.now();
      session.Session_Type__c = 'Internal';
      sessions.add(session);
    }

    insert sessions;
    Test.stopTest();

    Integer sessionCount = [
      SELECT COUNT()
      FROM User_Session_Tracking__c
      WHERE Session_Id__c LIKE 'BULK_SESSION_%'
    ];

    System.assertEquals(10, sessionCount, 'Should create 10 sessions');
  }
}