public with sharing class SessionTimeoutMonitor implements Schedulable, Database.Batchable<sObject>, Database.Stateful {
  private Session_Configuration__mdt config;
  private Integer processedSessions = 0;
  private Integer deactivatedSessions = 0;
  private Integer deactivatedUsers = 0;

  public static void scheduleJob() {
    Session_Configuration__mdt config = SessionMonitoringService.getSessionConfig();

    if (!config.Enable_Session_Monitoring__c) {
      System.debug('Session monitoring is disabled. Skipping job scheduling.');
      return;
    }

    Integer frequency = Integer.valueOf(config.Batch_Job_Frequency_Minutes__c);

    String jobName = 'Session Timeout Monitor';

    List<CronTrigger> existingJobs = [
      SELECT Id
      FROM CronTrigger
      WHERE CronJobDetail.Name = :jobName AND State != 'DELETED'
    ];

    for (CronTrigger job : existingJobs) {
      System.abortJob(job.Id);
    }

    String cronExp = generateCronExpression(frequency);
    System.schedule(jobName, cronExp, new SessionTimeoutMonitor());
  }

  private static String generateCronExpression(Integer frequencyMinutes) {
    if (frequencyMinutes >= 60) {
      return '0 0 * * * ?';
    } else if (frequencyMinutes == 30) {
      return '0 0,30 * * * ?';
    } else if (frequencyMinutes == 15) {
      return '0 0,15,30,45 * * * ?';
    } else if (frequencyMinutes == 10) {
      return '0 0,10,20,30,40,50 * * * ?';
    } else {
      return '0 0,5,10,15,20,25,30,35,40,45,50,55 * * * ?';
    }
  }

  public void execute(SchedulableContext ctx) {
    config = SessionMonitoringService.getSessionConfig();

    if (!config.Enable_Session_Monitoring__c) {
      return;
    }

    Database.executeBatch(this, 200);
  }

  public Database.QueryLocator start(Database.BatchableContext bc) {
    config = SessionMonitoringService.getSessionConfig();

    DateTime cutoffTime = DateTime.now();

    return Database.getQueryLocator(
      [
        SELECT
          Id,
          User__c,
          Session_Id__c,
          Expected_Timeout__c,
          Last_Activity__c,
          Is_Active__c,
          Logout_Time__c,
          Logout_Type__c
        FROM User_Session_Tracking__c
        WHERE Is_Active__c = TRUE AND Expected_Timeout__c < :cutoffTime
      ]
    );
  }

  public void execute(
    Database.BatchableContext bc,
    List<User_Session_Tracking__c> scope
  ) {
    processedSessions += scope.size();

    Set<String> sessionIds = new Set<String>();
    Map<String, User_Session_Tracking__c> sessionMap = new Map<String, User_Session_Tracking__c>();

    for (User_Session_Tracking__c session : scope) {
      sessionIds.add(session.Session_Id__c);
      sessionMap.put(session.Session_Id__c, session);
    }

    Set<String> activeAuthSessions = new Set<String>();
    try {
      for (AuthSession auth : [
        SELECT Id, SessionId
        FROM AuthSession
        WHERE SessionId IN :sessionIds AND SessionType != 'ChatterNetworks'
      ]) {
        activeAuthSessions.add(auth.SessionId);
      }
    } catch (Exception e) {
      System.debug(
        LoggingLevel.WARN,
        'Unable to query AuthSession: ' + e.getMessage()
      );
    }

    List<User_Session_Tracking__c> sessionsToUpdate = new List<User_Session_Tracking__c>();
    Set<Id> affectedUserIds = new Set<Id>();

    for (String sessionId : sessionIds) {
      if (!activeAuthSessions.contains(sessionId)) {
        User_Session_Tracking__c session = sessionMap.get(sessionId);
        session.Is_Active__c = false;
        session.Logout_Time__c = DateTime.now();
        session.Logout_Type__c = 'Timeout';
        sessionsToUpdate.add(session);
        affectedUserIds.add(session.User__c);
        deactivatedSessions++;
      }
    }

    if (!sessionsToUpdate.isEmpty()) {
      update sessionsToUpdate;

      if (config.Enable_Auto_Deactivation__c && !affectedUserIds.isEmpty()) {
        Set<Id> usersToDeactivate = SessionMonitoringService.getUsersWithNoActiveSessions(
          affectedUserIds
        );

        if (!usersToDeactivate.isEmpty()) {
          SessionMonitoringService.deactivateUsers(usersToDeactivate);
          deactivatedUsers += usersToDeactivate.size();
        }
      }
    }
  }

  public void finish(Database.BatchableContext bc) {
    String logMessage = String.format(
      'SessionTimeoutMonitor completed. Processed: {0} sessions, Deactivated: {1} sessions, {2} users',
      new List<Object>{
        processedSessions,
        deactivatedSessions,
        deactivatedUsers
      }
    );

    System.debug(LoggingLevel.INFO, logMessage);

    if (
      deactivatedUsers > 0 &&
      String.isNotBlank(config.Admin_Email_Notifications__c)
    ) {
      sendCompletionNotification();
    }
  }

  private void sendCompletionNotification() {
    try {
      Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
      email.setToAddresses(
        new List<String>{ config.Admin_Email_Notifications__c }
      );
      email.setSubject('Session Timeout Monitor - Batch Job Completion');

      String body = 'Session Timeout Monitor batch job has completed.\n\n';
      body += 'Summary:\n';
      body += '- Sessions Processed: ' + processedSessions + '\n';
      body += '- Sessions Deactivated: ' + deactivatedSessions + '\n';
      body += '- Users Deactivated: ' + deactivatedUsers + '\n';
      body += '\nTimestamp: ' + DateTime.now().format();

      email.setPlainTextBody(body);
      email.setSaveAsActivity(false);

      Messaging.sendEmail(new List<Messaging.SingleEmailMessage>{ email });
    } catch (Exception e) {
      System.debug(
        LoggingLevel.ERROR,
        'Error sending completion notification: ' + e.getMessage()
      );
    }
  }
}
