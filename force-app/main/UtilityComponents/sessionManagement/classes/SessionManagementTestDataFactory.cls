@isTest
public class SessionManagementTestDataFactory {
  public static User_Session_Tracking__c createSession(
    Id userId,
    Boolean isActive
  ) {
    User_Session_Tracking__c session = new User_Session_Tracking__c(
      User__c = userId,
      Session_Id__c = 'TEST_SESSION_' +
        String.valueOf(Math.random()).substring(2, 10),
      Login_Time__c = DateTime.now().addMinutes(-30),
      Last_Activity__c = DateTime.now().addMinutes(-5),
      Expected_Timeout__c = DateTime.now().addMinutes(10),
      Is_Active__c = isActive,
      Session_Type__c = 'Internal',
      IP_Address__c = '192.168.1.1',
      Browser_Info__c = 'Chrome/98.0',
      Device_Type__c = 'Desktop',
      Platform_Info__c = 'Windows',
      Geographic_Location__c = 'US'
    );

    if (!isActive) {
      session.Logout_Time__c = DateTime.now();
      session.Logout_Type__c = 'Manual';
    }

    return session;
  }

  public static List<User_Session_Tracking__c> createSessions(
    Id userId,
    Integer count,
    Boolean isActive
  ) {
    List<User_Session_Tracking__c> sessions = new List<User_Session_Tracking__c>();

    for (Integer i = 0; i < count; i++) {
      sessions.add(createSession(userId, isActive));
    }

    return sessions;
  }

  public static Session_Configuration__mdt createMockConfig() {
    Session_Configuration__mdt config = new Session_Configuration__mdt(
      DeveloperName = 'Default',
      Session_Timeout_Minutes__c = 15,
      Enable_Session_Monitoring__c = true,
      Enable_Auto_Deactivation__c = true,
      Admin_Email_Notifications__c = 'admin@test.com',
      Batch_Job_Frequency_Minutes__c = 5,
      Max_Concurrent_Sessions__c = 3,
      Enable_Activity_Tracking__c = true,
      Activity_Update_Interval_Minutes__c = 5,
      Session_Warning_Minutes__c = 2,
      Enable_Browser_Tracking__c = true
    );

    return config;
  }

  public static User createTestUser(String profileName) {
    String uniqueUserName =
      'sessiontest' +
      DateTime.now().getTime() +
      '@testorg.com';

    Profile p = [SELECT Id FROM Profile WHERE Name = :profileName LIMIT 1];

    User u = new User(
      Alias = 'standt',
      Email = 'sessiontest@testorg.com',
      EmailEncodingKey = 'UTF-8',
      LastName = 'Testing',
      LanguageLocaleKey = 'en_US',
      LocaleSidKey = 'en_US',
      ProfileId = p.Id,
      TimeZoneSidKey = 'America/Los_Angeles',
      UserName = uniqueUserName,
      IsActive = true
    );

    return u;
  }
}
