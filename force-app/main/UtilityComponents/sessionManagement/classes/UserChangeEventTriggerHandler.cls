public with sharing class UserChangeEventTriggerHandler {
  public static void handleAfterInsert(List<UserChangeEvent> newEvents) {
    try {
      Session_Configuration__mdt config = SessionMonitoringService.getSessionConfig();

      if (!config.Enable_Session_Monitoring__c) {
        return;
      }

      List<User_Session_Tracking__c> sessionsToCreate = new List<User_Session_Tracking__c>();
      Set<Id> userIds = new Set<Id>();

      for (UserChangeEvent event : newEvents) {
        // Check if LastLoginDate changed
        if (
          event.LastLoginDate != null && hasFieldChanged(event, 'LastLoginDate')
        ) {
          // Get the User Id from the change event
          EventBus.ChangeEventHeader header = event.ChangeEventHeader;
          if (
            header != null &&
            header.RecordIds != null &&
            !header.RecordIds.isEmpty()
          ) {
            Id userId = header.RecordIds[0];
            userIds.add(userId);

            // Create a new session tracking record
            User_Session_Tracking__c session = new User_Session_Tracking__c();
            session.User__c = userId;
            session.Session_Id__c = generateSessionId(userId);
            session.Login_Time__c = event.LastLoginDate;
            session.Last_Activity__c = event.LastLoginDate;
            session.Expected_Timeout__c = event.LastLoginDate.addMinutes(
              Integer.valueOf(config.Session_Timeout_Minutes__c)
            );
            session.Is_Active__c = true;
            session.Session_Type__c = 'Internal'; // Default, can be enhanced

            // Try to capture additional info from event header
            if (header != null) {
              session.IP_Address__c = header.CommitUser; // This gives us who made the change
            }

            sessionsToCreate.add(session);
          }
        }
      }

      if (!sessionsToCreate.isEmpty()) {
        // Deactivate previous sessions for these users
        deactivatePreviousSessions(userIds);

        // Insert new sessions
        Database.SaveResult[] results = Database.insert(
          sessionsToCreate,
          false
        );
        SessionMonitoringService.logDatabaseErrors(
          results,
          'UserChangeEventTriggerHandler.handleAfterInsert'
        );

        // Check concurrent sessions
        checkConcurrentSessions(userIds, config);
      }
    } catch (Exception e) {
      System.debug(
        LoggingLevel.ERROR,
        'Error in UserChangeEventTriggerHandler: ' + e.getMessage()
      );
      System.debug(
        LoggingLevel.ERROR,
        'Stack Trace: ' + e.getStackTraceString()
      );
    }
  }

  private static Boolean hasFieldChanged(
    UserChangeEvent event,
    String fieldName
  ) {
    // Check if the field is in the changed fields header
    EventBus.ChangeEventHeader header = event.ChangeEventHeader;
    if (header != null && header.ChangedFields != null) {
      for (String field : header.ChangedFields) {
        if (field.equalsIgnoreCase(fieldName)) {
          return true;
        }
      }
    }
    return false;
  }

  private static String generateSessionId(Id userId) {
    // Generate a unique session ID
    return userId + '_' + DateTime.now().getTime();
  }

  private static void deactivatePreviousSessions(Set<Id> userIds) {
    List<User_Session_Tracking__c> activeSessions = [
      SELECT Id, Is_Active__c, Logout_Time__c, Logout_Type__c
      FROM User_Session_Tracking__c
      WHERE User__c IN :userIds AND Is_Active__c = TRUE
    ];

    for (User_Session_Tracking__c session : activeSessions) {
      session.Is_Active__c = false;
      session.Logout_Time__c = DateTime.now();
      session.Logout_Type__c = 'New Login';
    }

    if (!activeSessions.isEmpty()) {
      update activeSessions;
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