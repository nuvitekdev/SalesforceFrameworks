public with sharing class LogoutEventStreamTriggerHandler {
  public static void handleAfterInsert(List<LogoutEventStream> newEvents) {
    try {
      Session_Configuration__mdt config = SessionMonitoringService.getSessionConfig();

      if (!config.Enable_Session_Monitoring__c) {
        return;
      }

      Set<String> sessionKeys = new Set<String>();
      Set<Id> userIds = new Set<Id>();
      Map<String, LogoutEventStream> sessionEventMap = new Map<String, LogoutEventStream>();

      for (LogoutEventStream event : newEvents) {
        sessionKeys.add(event.SessionKey);
        userIds.add(event.UserId);
        sessionEventMap.put(event.SessionKey, event);
      }

      List<User_Session_Tracking__c> sessionsToUpdate = [
        SELECT
          Id,
          User__c,
          Session_Id__c,
          Is_Active__c,
          Logout_Time__c,
          Logout_Type__c
        FROM User_Session_Tracking__c
        WHERE Session_Id__c IN :sessionKeys AND Is_Active__c = TRUE
      ];

      Set<Id> affectedUserIds = new Set<Id>();

      for (User_Session_Tracking__c session : sessionsToUpdate) {
        session.Is_Active__c = false;
        session.Logout_Time__c = DateTime.now();

        LogoutEventStream event = sessionEventMap.get(session.Session_Id__c);
        if (event != null) {
          session.Logout_Type__c = determineLogoutType(event);
        }

        affectedUserIds.add(session.User__c);
      }

      if (!sessionsToUpdate.isEmpty()) {
        update sessionsToUpdate;
      }

      if (config.Enable_Auto_Deactivation__c && !affectedUserIds.isEmpty()) {
        checkAndDeactivateUsers(affectedUserIds);
      }
    } catch (Exception e) {
      System.debug(
        LoggingLevel.ERROR,
        'Error in LogoutEventStreamTriggerHandler: ' + e.getMessage()
      );
      System.debug(
        LoggingLevel.ERROR,
        'Stack Trace: ' + e.getStackTraceString()
      );
    }
  }

  private static String determineLogoutType(LogoutEventStream event) {
    if (
      event.EventIdentifier != null && event.EventIdentifier.contains('timeout')
    ) {
      return 'Timeout';
    } else if (
      event.SessionLevel != null && event.SessionLevel.contains('admin')
    ) {
      return 'Admin_Forced';
    } else {
      return 'Manual';
    }
  }

  private static void checkAndDeactivateUsers(Set<Id> userIds) {
    Set<Id> usersWithNoActiveSessions = SessionMonitoringService.getUsersWithNoActiveSessions(
      userIds
    );

    if (!usersWithNoActiveSessions.isEmpty()) {
      SessionMonitoringService.deactivateUsers(usersWithNoActiveSessions);
    }
  }
}
