/**
 * @description Lightweight workflow engine for APD review stages.
 * Creates Tasks for Technical, Environmental (NEPA), Legal, and Final Approval.
 */
public with sharing class DOI_PAL_WorkflowOrchestrator {

    public class WorkflowResponse {
        @AuraEnabled public Id applicationId;
        @AuraEnabled public List<Id> taskIds;
        public WorkflowResponse(Id appId, List<Id> ids) { applicationId = appId; taskIds = ids; }
    }

    @AuraEnabled
    public static WorkflowResponse initiateReviewWorkflow(Id applicationId, String workflowType) {
        if (applicationId == null) throw new AuraHandledException('Application ID is required');
        List<Task> tasks = new List<Task>();

        // Stage definitions with basic SLAs (days)
        tasks.add(buildStageTask(applicationId, 'Technical Review', 15));
        tasks.add(buildStageTask(applicationId, 'Environmental Review (NEPA)', 30));
        tasks.add(buildStageTask(applicationId, 'Legal Review', 10));
        tasks.add(buildStageTask(applicationId, 'Final Approval', 5));

        insert tasks;
        return new WorkflowResponse(applicationId, new List<Id>(new Map<Id, Task>(tasks).keySet()));
    }

    private static Task buildStageTask(Id whatId, String subject, Integer slaDays) {
        Task t = new Task();
        t.Subject = subject;
        t.Status = 'Not Started';
        t.Priority = 'Normal';
        t.ActivityDate = Date.today().addDays(slaDays);
        t.WhatId = whatId;
        t.OwnerId = UserInfo.getUserId();
        return t;
    }
}

