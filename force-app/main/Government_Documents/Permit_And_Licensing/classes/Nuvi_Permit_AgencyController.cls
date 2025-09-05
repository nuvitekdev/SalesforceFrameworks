public with sharing class Nuvi_Permit_AgencyController {
    public class IntakeSummary {
        @AuraEnabled public Id applicationId;
        @AuraEnabled public String applicationNumber;
        @AuraEnabled public String status;
        @AuraEnabled public List<String> proximityAlerts;
        @AuraEnabled public String nepaRecommendation;
        @AuraEnabled public String nepaReason;
        @AuraEnabled public List<String> missingDocuments;
        @AuraEnabled public Boolean feePaid;
        @AuraEnabled public Decimal feeAmount;
    }

    @AuraEnabled(cacheable=true)
    public static IntakeSummary getIntakeSummary(Id applicationId) {
        if (applicationId == null) throw new AuraHandledException('Application Id required');
        APD_Application__c app = [SELECT Id, Name, Status__c, Fee_Amount__c, Latitude__c, Longitude__c FROM APD_Application__c WHERE Id = :applicationId LIMIT 1];

        List<String> alerts = Nuvi_Permit_GISProximityService.getProximityAlerts((Decimal)app.get('Latitude__c'), (Decimal)app.get('Longitude__c'));
        Map<String, Object> nepa = recommendNEPA(app, alerts);

        // Determine document completeness (basic): require Drilling Program, SUPO
        Set<String> need = new Set<String>{'DRILLING_PROGRAM','SUPO','SURVEY_PLAT'};
        for (Document_Package__c dp : [SELECT Document_Type__c, Status__c FROM Document_Package__c WHERE APD_Application__c = :app.Id]) {
            if (dp.Document_Type__c != null && need.contains(dp.Document_Type__c)) {
                need.remove(dp.Document_Type__c);
            }
        }

        Boolean feePaid = false;
        for (Payment_Record__c pr : [SELECT Status__c FROM Payment_Record__c WHERE APD_Application__c = :app.Id ORDER BY CreatedDate DESC LIMIT 1]) {
            feePaid = (pr.Status__c == 'PAID' || pr.Status__c == 'CREATED' || pr.Status__c == 'NOT_CONFIGURED');
        }

        IntakeSummary s = new IntakeSummary();
        s.applicationId = app.Id;
        s.applicationNumber = app.Name;
        s.status = app.Status__c;
        s.proximityAlerts = alerts;
        s.nepaRecommendation = (String) nepa.get('level');
        s.nepaReason = (String) nepa.get('reason');
        s.missingDocuments = new List<String>(need);
        s.feePaid = feePaid;
        s.feeAmount = app.Fee_Amount__c;
        return s;
    }

    private static Map<String, Object> recommendNEPA(APD_Application__c app, List<String> alerts) {
        Map<String, Object> out = new Map<String, Object>();
        // Very simple rules demo: any proximity alert → EA, else EA default
        if (alerts != null && !alerts.isEmpty()) {
            out.put('level','EA');
            out.put('reason','Proximity alerts present');
            return out;
        }
        out.put('level','EA');
        out.put('reason','Default assessment required');
        return out;
    }

    public class AssignmentRequest {
        @AuraEnabled public Id applicationId;
        @AuraEnabled public List<String> specialistRoles; // role API names
        @AuraEnabled public Integer slaDays;
    }

    public class AssignmentResult {
        @AuraEnabled public List<Id> taskIds;
    }

    @AuraEnabled
    public static AssignmentResult createReviewTasks(AssignmentRequest req) {
        if (req == null || req.applicationId == null || req.specialistRoles == null || req.specialistRoles.isEmpty()) {
            throw new AuraHandledException('Application and roles required');
        }
        Integer sla = (req.slaDays == null || req.slaDays <= 0) ? 14 : req.slaDays;
        List<Review_Task__c> toInsert = new List<Review_Task__c>();
        for (String role : req.specialistRoles) {
            Review_Task__c rt = new Review_Task__c();
            rt.APD_Application__c = req.applicationId;
            rt.Task_Type__c = (role == 'NEPA_Coordinator') ? 'Environmental Review' : 'Technical Review';
            rt.Specialist_Role__c = role;
            rt.Status__c = 'Not Started';
            rt.SLA_Days__c = sla;
            rt.Due_Date__c = Date.today().addDays(sla);
            rt.Is_Parallel__c = true;
            toInsert.add(rt);
        }
        insert toInsert;
        AssignmentResult res = new AssignmentResult();
        res.taskIds = new List<Id>();
        for (Review_Task__c r : toInsert) res.taskIds.add(r.Id);
        return res;
    }

    // Simple document list view
    public class DocItem {
        @AuraEnabled public String id;
        @AuraEnabled public String title;
        @AuraEnabled public String type;
        @AuraEnabled public String status;
        @AuraEnabled public String aiStatus;
        @AuraEnabled public String contentDocumentId;
    }

    @AuraEnabled(cacheable=true)
    public static List<DocItem> listDocuments(Id applicationId) {
        if (applicationId == null) throw new AuraHandledException('Application Id required');
        List<DocItem> out = new List<DocItem>();
        for (Document_Package__c dp : [
            SELECT Id, Document_Type__c, Status__c, AI_Analysis_Status__c, Content_Version_Id__c
            FROM Document_Package__c WHERE APD_Application__c = :applicationId ORDER BY CreatedDate DESC
        ]) {
            DocItem d = new DocItem();
            d.id = dp.Id;
            d.type = dp.Document_Type__c;
            d.status = dp.Status__c;
            d.aiStatus = dp.AI_Analysis_Status__c;
            d.title = dp.Document_Type__c;
            if (dp.Content_Version_Id__c != null) {
                ContentVersion cv = [SELECT ContentDocumentId, Title FROM ContentVersion WHERE Id = :dp.Content_Version_Id__c LIMIT 1];
                d.contentDocumentId = cv.ContentDocumentId;
                d.title = cv.Title;
            }
            out.add(d);
        }
        return out;
    }

    // Public comments
    public class CommentInput {
        @AuraEnabled public Id applicationId;
        @AuraEnabled public String commenterName;
        @AuraEnabled public String text;
        @AuraEnabled public String sentiment; // Support/Oppose/Neutral
    }

    @AuraEnabled
    public static Id addPublicComment(CommentInput input) {
        if (input == null || input.applicationId == null || String.isBlank(input.text)) {
            throw new AuraHandledException('Comment text and application required');
        }
        Public_Comment__c pc = new Public_Comment__c();
        pc.APD_Application__c = input.applicationId;
        pc.Commenter_Name__c = input.commenterName;
        pc.Comment_Text__c = input.text;
        pc.Sentiment__c = String.isBlank(input.sentiment) ? 'Neutral' : input.sentiment;
        insert pc;
        return pc.Id;
    }

    public class CommentView {
        @AuraEnabled public Id id;
        @AuraEnabled public String commenterName;
        @AuraEnabled public String text;
        @AuraEnabled public String sentiment;
        @AuraEnabled public Boolean requiresResponse;
        @AuraEnabled public Datetime createdDate;
    }

    @AuraEnabled(cacheable=true)
    public static List<CommentView> listPublicComments(Id applicationId) {
        if (applicationId == null) throw new AuraHandledException('Application Id required');
        List<CommentView> out = new List<CommentView>();
        for (Public_Comment__c pc : [SELECT Id, Commenter_Name__c, Comment_Text__c, Sentiment__c, Requires_Response__c, CreatedDate FROM Public_Comment__c WHERE APD_Application__c = :applicationId ORDER BY CreatedDate DESC]) {
            CommentView v = new CommentView();
            v.id = pc.Id;
            v.commenterName = pc.Commenter_Name__c;
            v.text = pc.Comment_Text__c;
            v.sentiment = pc.Sentiment__c;
            v.requiresResponse = pc.Requires_Response__c;
            v.createdDate = pc.CreatedDate;
            out.add(v);
        }
        return out;
    }
}
