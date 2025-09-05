public with sharing class Nuvi_Permit_OperatorController {
    public class ApdItem {
        @AuraEnabled public Id id;
        @AuraEnabled public String name;
        @AuraEnabled public String status;
        @AuraEnabled public Date submissionDate;
    }

    public class Dashboard {
        @AuraEnabled public Integer total;
        @AuraEnabled public Integer approved;
        @AuraEnabled public Integer pending;
        @AuraEnabled public Integer draft;
        @AuraEnabled public List<ApdItem> recent;
    }

    @AuraEnabled(cacheable=true)
    public static Dashboard getMyDashboard() {
        Id uid = UserInfo.getUserId();
        List<APD_Application__c> myApds = [
            SELECT Id, Name, Status__c, Submission_Date__c, CreatedDate
            FROM APD_Application__c
            WHERE CreatedById = :uid
            ORDER BY CreatedDate DESC LIMIT 50
        ];
        Integer total = myApds.size();
        Integer approved = 0, pending = 0, draft = 0;
        List<ApdItem> recent = new List<ApdItem>();
        for (APD_Application__c a : myApds) {
            if (a.Status__c == 'Approved') approved++;
            else if (a.Status__c == 'Draft') draft++;
            else pending++;
            if (recent.size() < 10) {
                ApdItem it = new ApdItem();
                it.id = a.Id; it.name = a.Name; it.status = a.Status__c; it.submissionDate = a.Submission_Date__c;
                recent.add(it);
            }
        }
        Dashboard d = new Dashboard();
        d.total = total; d.approved = approved; d.pending = pending; d.draft = draft; d.recent = recent;
        return d;
    }
}

