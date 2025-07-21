public with sharing class SessionMonitoringService {
  private static Session_Configuration__mdt cachedConfig;
  private static final String DEFAULT_CONFIG_NAME = 'Default';

  @AuraEnabled(cacheable=true)
  public static Session_Configuration__mdt getSessionConfig() {
    if (cachedConfig != null) {
      return cachedConfig;
    }

    List<Session_Configuration__mdt> configs = [
      SELECT
        Session_Timeout_Minutes__c,
        Enable_Session_Monitoring__c,
        Enable_Auto_Deactivation__c,
        Admin_Email_Notifications__c,
        Batch_Job_Frequency_Minutes__c,
        Max_Concurrent_Sessions__c,
        Enable_Activity_Tracking__c,
        Activity_Update_Interval_Minutes__c,
        Session_Warning_Minutes__c,
        Enable_Browser_Tracking__c
      FROM Session_Configuration__mdt
      WHERE DeveloperName = :DEFAULT_CONFIG_NAME
      LIMIT 1
    ];

    if (configs.isEmpty()) {
      cachedConfig = createDefaultConfig();
    } else {
      cachedConfig = configs[0];
    }

    return cachedConfig;
  }

  private static Session_Configuration__mdt createDefaultConfig() {
    Session_Configuration__mdt config = new Session_Configuration__mdt();
    config.Session_Timeout_Minutes__c = 15;
    config.Enable_Session_Monitoring__c = true;
    config.Enable_Auto_Deactivation__c = true;
    config.Batch_Job_Frequency_Minutes__c = 5;
    config.Max_Concurrent_Sessions__c = 3;
    config.Enable_Activity_Tracking__c = true;
    config.Activity_Update_Interval_Minutes__c = 5;
    config.Session_Warning_Minutes__c = 2;
    config.Enable_Browser_Tracking__c = true;
    return config;
  }

  public static void logDatabaseErrors(
    Database.SaveResult[] results,
    String context
  ) {
    List<String> errors = new List<String>();

    for (Database.SaveResult sr : results) {
      if (!sr.isSuccess()) {
        for (Database.Error err : sr.getErrors()) {
          errors.add(
            context +
              ' - Error: ' +
              err.getMessage() +
              ' Fields: ' +
              err.getFields()
          );
        }
      }
    }

    if (!errors.isEmpty()) {
      System.debug(LoggingLevel.ERROR, String.join(errors, '\n'));
    }
  }

  public static void handleConcurrentSessionViolations(
    Map<Id, Integer> violatingUsers,
    Integer maxSessions
  ) {
    Session_Configuration__mdt config = getSessionConfig();

    List<User_Session_Tracking__c> sessionsToTerminate = [
      SELECT Id, User__c, Session_Id__c, Login_Time__c
      FROM User_Session_Tracking__c
      WHERE User__c IN :violatingUsers.keySet() AND Is_Active__c = TRUE
      ORDER BY Login_Time__c ASC
    ];

    Map<Id, List<User_Session_Tracking__c>> sessionsByUser = new Map<Id, List<User_Session_Tracking__c>>();
    for (User_Session_Tracking__c session : sessionsToTerminate) {
      if (!sessionsByUser.containsKey(session.User__c)) {
        sessionsByUser.put(
          session.User__c,
          new List<User_Session_Tracking__c>()
        );
      }
      sessionsByUser.get(session.User__c).add(session);
    }

    List<User_Session_Tracking__c> sessionsToDeactivate = new List<User_Session_Tracking__c>();
    for (Id userId : sessionsByUser.keySet()) {
      List<User_Session_Tracking__c> userSessions = sessionsByUser.get(userId);
      Integer sessionsToRemove = userSessions.size() - maxSessions;

      for (
        Integer i = 0; i < sessionsToRemove && i < userSessions.size(); i++
      ) {
        User_Session_Tracking__c session = userSessions[i];
        session.Is_Active__c = false;
        session.Logout_Time__c = DateTime.now();
        session.Logout_Type__c = 'Admin_Forced';
        sessionsToDeactivate.add(session);
      }
    }

    if (!sessionsToDeactivate.isEmpty()) {
      update sessionsToDeactivate;

      if (String.isNotBlank(config.Admin_Email_Notifications__c)) {
        sendConcurrentSessionAlert(
          violatingUsers,
          config.Admin_Email_Notifications__c
        );
      }
    }
  }

  public static void deactivateUserSessions(
    Set<Id> userIds,
    String logoutType
  ) {
    List<User_Session_Tracking__c> activeSessions = [
      SELECT Id, User__c, Is_Active__c, Logout_Time__c, Logout_Type__c
      FROM User_Session_Tracking__c
      WHERE User__c IN :userIds AND Is_Active__c = TRUE
    ];

    for (User_Session_Tracking__c session : activeSessions) {
      session.Is_Active__c = false;
      session.Logout_Time__c = DateTime.now();
      session.Logout_Type__c = logoutType;
    }

    if (!activeSessions.isEmpty()) {
      update activeSessions;
    }
  }

  public static Set<Id> getUsersWithNoActiveSessions(Set<Id> userIds) {
    Set<Id> usersWithActiveSessions = new Set<Id>();

    for (User_Session_Tracking__c session : [
      SELECT User__c
      FROM User_Session_Tracking__c
      WHERE User__c IN :userIds AND Is_Active__c = TRUE
    ]) {
      usersWithActiveSessions.add(session.User__c);
    }

    Set<Id> usersWithNoSessions = new Set<Id>();
    for (Id userId : userIds) {
      if (!usersWithActiveSessions.contains(userId)) {
        usersWithNoSessions.add(userId);
      }
    }

    return usersWithNoSessions;
  }

  public static void deactivateUsers(Set<Id> userIds) {
    if (userIds.isEmpty()) {
      return;
    }

    List<User> usersToDeactivate = new List<User>();
    for (Id userId : userIds) {
      usersToDeactivate.add(new User(Id = userId, IsActive = false));
    }

    try {
      update usersToDeactivate;

      Session_Configuration__mdt config = getSessionConfig();
      if (String.isNotBlank(config.Admin_Email_Notifications__c)) {
        sendUserDeactivationAlert(userIds, config.Admin_Email_Notifications__c);
      }
    } catch (Exception e) {
      System.debug(
        LoggingLevel.ERROR,
        'Error deactivating users: ' + e.getMessage()
      );
    }
  }

  private static void sendConcurrentSessionAlert(
    Map<Id, Integer> violatingUsers,
    String adminEmail
  ) {
    try {
      Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
      email.setToAddresses(new List<String>{ adminEmail });
      email.setSubject('Security Alert: Concurrent Session Limit Violations');

      String body = 'The following users have exceeded the concurrent session limit:\n\n';

      List<User> users = [
        SELECT Id, Name, Username
        FROM User
        WHERE Id IN :violatingUsers.keySet()
      ];
      for (User u : users) {
        body +=
          'User: ' +
          u.Name +
          ' (' +
          u.Username +
          ') - Active Sessions: ' +
          violatingUsers.get(u.Id) +
          '\n';
      }

      body += '\nOlder sessions have been automatically terminated.';

      email.setPlainTextBody(body);
      email.setSaveAsActivity(false);

      Messaging.sendEmail(new List<Messaging.SingleEmailMessage>{ email });
    } catch (Exception e) {
      System.debug(
        LoggingLevel.ERROR,
        'Error sending concurrent session alert: ' + e.getMessage()
      );
    }
  }

  private static void sendUserDeactivationAlert(
    Set<Id> userIds,
    String adminEmail
  ) {
    try {
      Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
      email.setToAddresses(new List<String>{ adminEmail });
      email.setSubject(
        'Security Alert: Users Auto-Deactivated Due to Session Timeout'
      );

      String body = 'The following users were automatically deactivated due to session security violations:\n\n';

      List<User> users = [
        SELECT Id, Name, Username
        FROM User
        WHERE Id IN :userIds
      ];
      for (User u : users) {
        body +=
          'User: ' +
          u.Name +
          ' (' +
          u.Username +
          ') - ID: ' +
          u.Id +
          '\n';
      }

      body += '\nTimestamp: ' + DateTime.now().format() + '\n';
      body += '\nPlease review and take appropriate action.';

      email.setPlainTextBody(body);
      email.setSaveAsActivity(false);

      Messaging.sendEmail(new List<Messaging.SingleEmailMessage>{ email });
    } catch (Exception e) {
      System.debug(
        LoggingLevel.ERROR,
        'Error sending user deactivation alert: ' + e.getMessage()
      );
    }
  }

  @AuraEnabled(cacheable=false)
  public static Map<String, Object> getSessionAnalytics(String timeFrame) {
    Map<String, Object> analytics = new Map<String, Object>();

    DateTime startDate;
    if (timeFrame == 'TODAY') {
      startDate = DateTime.now().date();
    } else if (timeFrame == 'WEEK') {
      startDate = DateTime.now().addDays(-7);
    } else if (timeFrame == 'MONTH') {
      startDate = DateTime.now().addMonths(-1);
    } else {
      startDate = DateTime.now().addDays(-7);
    }

    List<AggregateResult> sessionStats = [
      SELECT
        COUNT(Id) totalSessions,
        COUNT_DISTINCT(User__c) uniqueUsers,
        AVG(Session_Duration_Minutes__c) avgDuration,
        MAX(Session_Duration_Minutes__c) maxDuration
      FROM User_Session_Tracking__c
      WHERE Login_Time__c >= :startDate
      WITH SECURITY_ENFORCED
    ];

    if (!sessionStats.isEmpty()) {
      AggregateResult stat = sessionStats[0];
      analytics.put('totalSessions', stat.get('totalSessions'));
      analytics.put('uniqueUsers', stat.get('uniqueUsers'));
      analytics.put('avgDuration', stat.get('avgDuration'));
      analytics.put('maxDuration', stat.get('maxDuration'));
    }

    List<AggregateResult> logoutTypes = [
      SELECT Logout_Type__c, COUNT(Id) logoutCount
      FROM User_Session_Tracking__c
      WHERE Login_Time__c >= :startDate AND Logout_Type__c != NULL
      GROUP BY Logout_Type__c
    ];

    Map<String, Integer> logoutTypeMap = new Map<String, Integer>();
    for (AggregateResult ar : logoutTypes) {
      logoutTypeMap.put(
        (String) ar.get('Logout_Type__c'),
        (Integer) ar.get('logoutCount')
      );
    }
    analytics.put('logoutTypes', logoutTypeMap);

    List<AggregateResult> deviceTypes = [
      SELECT Device_Type__c, COUNT(Id) deviceCount
      FROM User_Session_Tracking__c
      WHERE Login_Time__c >= :startDate
      GROUP BY Device_Type__c
    ];

    Map<String, Integer> deviceTypeMap = new Map<String, Integer>();
    for (AggregateResult ar : deviceTypes) {
      deviceTypeMap.put(
        (String) ar.get('Device_Type__c'),
        (Integer) ar.get('deviceCount')
      );
    }
    analytics.put('deviceTypes', deviceTypeMap);

    analytics.put(
      'activeSessions',
      [SELECT COUNT() FROM User_Session_Tracking__c WHERE Is_Active__c = TRUE]
    );

    return analytics;
  }

  @AuraEnabled
  public static void updateUserActivity() {
    try {
      Id currentUserId = UserInfo.getUserId();

      List<User_Session_Tracking__c> activeSessions = [
        SELECT Id, Last_Activity__c, Expected_Timeout__c
        FROM User_Session_Tracking__c
        WHERE User__c = :currentUserId AND Is_Active__c = TRUE
        ORDER BY Login_Time__c DESC
        LIMIT 1
      ];

      if (!activeSessions.isEmpty()) {
        User_Session_Tracking__c session = activeSessions[0];
        session.Last_Activity__c = DateTime.now();

        Session_Configuration__mdt config = getSessionConfig();
        session.Expected_Timeout__c = DateTime.now()
          .addMinutes(Integer.valueOf(config.Session_Timeout_Minutes__c));

        update session;
      }
    } catch (Exception e) {
      throw new AuraHandledException(
        'Error updating activity: ' + e.getMessage()
      );
    }
  }

  @AuraEnabled
  public static String getCurrentUserSessionId() {
    try {
      Id currentUserId = UserInfo.getUserId();

      List<User_Session_Tracking__c> activeSessions = [
        SELECT Id, Session_Id__c
        FROM User_Session_Tracking__c
        WHERE User__c = :currentUserId AND Is_Active__c = TRUE
        ORDER BY Login_Time__c DESC
        LIMIT 1
      ];

      if (!activeSessions.isEmpty()) {
        return activeSessions[0].Session_Id__c;
      }

      return null;
    } catch (Exception e) {
      throw new AuraHandledException(
        'Error getting session ID: ' + e.getMessage()
      );
    }
  }

  @AuraEnabled
  public static void logUserLogout(String sessionId, String logoutType) {
    try {
      List<User_Session_Tracking__c> sessions = [
        SELECT Id, Is_Active__c, Logout_Time__c, Logout_Type__c
        FROM User_Session_Tracking__c
        WHERE Session_Id__c = :sessionId AND Is_Active__c = TRUE
        LIMIT 1
      ];

      if (!sessions.isEmpty()) {
        User_Session_Tracking__c session = sessions[0];
        session.Is_Active__c = false;
        session.Logout_Time__c = DateTime.now();
        session.Logout_Type__c = logoutType;

        update session;

        // Check if user should be deactivated
        Session_Configuration__mdt config = getSessionConfig();
        if (config.Enable_Auto_Deactivation__c) {
          Id userId = [
            SELECT User__c
            FROM User_Session_Tracking__c
            WHERE Id = :session.Id
          ]
          .User__c;
          Set<Id> userIds = new Set<Id>{ userId };
          Set<Id> usersWithNoSessions = getUsersWithNoActiveSessions(userIds);

          if (!usersWithNoSessions.isEmpty()) {
            deactivateUsers(usersWithNoSessions);
          }
        }
      }
    } catch (Exception e) {
      throw new AuraHandledException('Error logging logout: ' + e.getMessage());
    }
  }
}
