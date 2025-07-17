public with sharing class LoginEventTriggerHandler {
  public static void handleAfterInsert(List<LoginEvent> newEvents) {
    try {
      Session_Configuration__mdt config = SessionMonitoringService.getSessionConfig();

      if (!config.Enable_Session_Monitoring__c) {
        return;
      }

      List<User_Session_Tracking__c> sessions = new List<User_Session_Tracking__c>();
      Map<Id, LoginEvent> userLatestLogin = new Map<Id, LoginEvent>();

      for (LoginEvent event : newEvents) {
        if (
          !userLatestLogin.containsKey(event.UserId) ||
          event.EventDate > userLatestLogin.get(event.UserId).EventDate
        ) {
          userLatestLogin.put(event.UserId, event);
        }
      }

      for (LoginEvent event : userLatestLogin.values()) {
        User_Session_Tracking__c session = new User_Session_Tracking__c();
        session.User__c = event.UserId;
        session.Session_Id__c = event.SessionKey;
        session.Login_Time__c = event.EventDate;
        session.Last_Activity__c = event.EventDate;
        session.Expected_Timeout__c = event.EventDate.addMinutes(
          Integer.valueOf(config.Session_Timeout_Minutes__c)
        );
        session.Is_Active__c = true;
        session.Session_Type__c = determineSessionType(event.LoginType);
        session.IP_Address__c = event.SourceIp;
        session.Browser_Info__c = event.Browser;
        session.Platform_Info__c = event.Platform;
        session.Login_URL__c = event.LoginUrl;
        session.Device_Type__c = determineDeviceType(event.Platform);
        session.Geographic_Location__c = event.LoginGeoId;

        sessions.add(session);
      }

      if (!sessions.isEmpty()) {
        Database.SaveResult[] results = Database.insert(sessions, false);
        SessionMonitoringService.logDatabaseErrors(
          results,
          'LoginEventTriggerHandler.handleAfterInsert'
        );

        checkConcurrentSessions(userLatestLogin.keySet(), config);
      }
    } catch (Exception e) {
      System.debug(
        LoggingLevel.ERROR,
        'Error in LoginEventTriggerHandler: ' + e.getMessage()
      );
      System.debug(
        LoggingLevel.ERROR,
        'Stack Trace: ' + e.getStackTraceString()
      );
    }
  }

  private static String determineSessionType(String loginType) {
    if (String.isBlank(loginType)) {
      return 'Internal';
    }

    if (loginType.containsIgnoreCase('Portal')) {
      return 'Portal';
    } else if (loginType.containsIgnoreCase('Community')) {
      return 'Community';
    } else {
      return 'Internal';
    }
  }

  private static String determineDeviceType(String platform) {
    if (String.isBlank(platform)) {
      return 'Desktop';
    }

    String platformLower = platform.toLowerCase();
    if (
      platformLower.contains('mobile') ||
      platformLower.contains('android') ||
      platformLower.contains('iphone') ||
      platformLower.contains('ios')
    ) {
      return 'Mobile';
    } else if (
      platformLower.contains('tablet') || platformLower.contains('ipad')
    ) {
      return 'Tablet';
    } else {
      return 'Desktop';
    }
  }

  private static void checkConcurrentSessions(
    Set<Id> userIds,
    Session_Configuration__mdt config
  ) {
    if (
      !config.Enable_Auto_Deactivation__c ||
      config.Max_Concurrent_Sessions__c == null
    ) {
      return;
    }

    Integer maxSessions = Integer.valueOf(config.Max_Concurrent_Sessions__c);

    Map<Id, Integer> activeSessionCounts = new Map<Id, Integer>();
    for (AggregateResult ar : [
      SELECT User__c userId, COUNT(Id) sessionCount
      FROM User_Session_Tracking__c
      WHERE User__c IN :userIds AND Is_Active__c = TRUE
      GROUP BY User__c
      HAVING COUNT(Id) > :maxSessions
    ]) {
      activeSessionCounts.put(
        (Id) ar.get('userId'),
        (Integer) ar.get('sessionCount')
      );
    }

    if (!activeSessionCounts.isEmpty()) {
      SessionMonitoringService.handleConcurrentSessionViolations(
        activeSessionCounts,
        maxSessions
      );
    }
  }
}
