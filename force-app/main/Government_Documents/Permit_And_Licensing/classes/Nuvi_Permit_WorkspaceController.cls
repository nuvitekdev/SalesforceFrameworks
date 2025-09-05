public with sharing class Nuvi_Permit_WorkspaceController {
    public class KPISummary {
        @AuraEnabled public Decimal avgTTD;
        @AuraEnabled public Decimal approvalRate;
        @AuraEnabled public Integer inProgress;
        @AuraEnabled public Integer total;
    }

    @AuraEnabled(cacheable=true)
    public static KPISummary getExecutiveKPIs() {
        KPISummary s = new KPISummary();
        Integer total = (Integer) [SELECT count() FROM APD_Application__c];
        Integer inProg = (Integer) [SELECT count() FROM APD_Application__c WHERE Status__c IN ('Draft','Submitted','In Review','Public Comment')];
        Integer appr = (Integer) [SELECT count() FROM APD_Application__c WHERE Status__c = 'Approved'];
        s.total = total;
        s.inProgress = inProg;
        s.approvalRate = total > 0 ? (Decimal.valueOf(appr) / Decimal.valueOf(total)) * 100 : 0;

        List<APD_Application__c> approved = [
            SELECT Submission_Date__c, Decision_Date__c
            FROM APD_Application__c
            WHERE Status__c = 'Approved' AND Submission_Date__c != NULL AND Decision_Date__c != NULL
            LIMIT 2000
        ];
        Decimal sum = 0; Integer count = 0;
        for (APD_Application__c a : approved) {
            Integer days = a.Decision_Date__c.daysBetween(a.Submission_Date__c);
            sum += days; count++;
        }
        s.avgTTD = (count > 0) ? (sum / count) : 0;
        return s;
    }

    public class BottleneckItem {
        @AuraEnabled public String taskType;
        @AuraEnabled public Decimal avgAgeDays;
        @AuraEnabled public Integer count;
    }

    @AuraEnabled(cacheable=true)
    public static List<BottleneckItem> getBottlenecks() {
        // Approximate: average age of open review tasks by type (CreatedDate to today)
        List<BottleneckItem> out = new List<BottleneckItem>();
        List<Review_Task__c> tasks = [
            SELECT Task_Type__c, CreatedDate, Status__c
            FROM Review_Task__c WHERE Status__c != 'Complete' LIMIT 5000
        ];
        Map<String, List<Integer>> ages = new Map<String, List<Integer>>();
        Date today = Date.today();
        for (Review_Task__c t : tasks) {
            String key = String.isBlank(t.Task_Type__c) ? 'Unspecified' : t.Task_Type__c;
            Integer age = today.daysBetween(t.CreatedDate.date());
            if (!ages.containsKey(key)) ages.put(key, new List<Integer>());
            ages.get(key).add(age);
        }
        for (String key : ages.keySet()) {
            List<Integer> listAges = ages.get(key);
            Integer n = listAges.size();
            Decimal sum = 0; for (Integer d : listAges) sum += d;
            BottleneckItem bi = new BottleneckItem();
            bi.taskType = key;
            bi.avgAgeDays = n > 0 ? (sum / n) : 0;
            bi.count = n;
            out.add(bi);
        }
        return out;
    }

    public class OfficeSummary {
        @AuraEnabled public String officeName;
        @AuraEnabled public Integer total;
        @AuraEnabled public Integer approved;
        @AuraEnabled public Decimal avgTTD;
    }

    @AuraEnabled(cacheable=true)
    public static List<OfficeSummary> getByFieldOffice() {
        Map<String, OfficeSummary> mapOut = new Map<String, OfficeSummary>();
        for (APD_Application__c a : [SELECT BLM_Field_Office__c, Status__c, Submission_Date__c, Decision_Date__c FROM APD_Application__c LIMIT 5000]) {
            String off = String.isBlank(a.BLM_Field_Office__c) ? 'Unassigned' : a.BLM_Field_Office__c;
            if (!mapOut.containsKey(off)) {
                OfficeSummary os = new OfficeSummary(); os.officeName = off; os.total = 0; os.approved = 0; os.avgTTD = 0; mapOut.put(off, os);
            }
            OfficeSummary os2 = mapOut.get(off);
            os2.total++;
            if (a.Status__c == 'Approved') {
                os2.approved++;
                if (a.Submission_Date__c != null && a.Decision_Date__c != null) {
                    Integer days = a.Decision_Date__c.daysBetween(a.Submission_Date__c);
                    if (os2.avgTTD == null || os2.avgTTD == 0) os2.avgTTD = days;
                    else os2.avgTTD = (os2.avgTTD + days) / 2;
                }
            }
        }
        return new List<OfficeSummary>(mapOut.values());
    }
}
