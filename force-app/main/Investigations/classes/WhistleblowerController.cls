public without sharing class WhistleblowerController {

    @AuraEnabled(cacheable=true)
    public static List<Whistleblower_Report__c> getReportOptions(Id userId) {
        try {
            // Query Whistleblower Report options created by the user
            List<Whistleblower_Report__c> reports = [
                SELECT Name, Anonymous__c, Category__c, CreatedById, LastModifiedById, 
                    OwnerId, Report_Details__c, Status__c, Severity__c
                FROM Whistleblower_Report__c
                WHERE CreatedById = :userId
            ];

            return reports;
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving report options: ' + e.getMessage());
        }
    }


    @AuraEnabled
    public static List<Whistleblower_Support__c> getSupportCases(Id reportId) {
            try {
                System.debug('TRY START');
                List<Whistleblower_Support__c> supportCases = [
                    SELECT Name, Whistleblower_Report__c, Reporter_First_Name__c, Anonymous__c, 
                        Status__c, Question_Details__c, Response__c
                    FROM Whistleblower_Support__c
                    WHERE Whistleblower_Report__c = :reportId
                ];
                System.debug('TRY NO ERROR');

                return supportCases;
            } catch (Exception e) {
                throw new AuraHandledException('Error retrieving related support cases: ' + e.getMessage());
            }
    }

    @AuraEnabled(cacheable=true)
    public static List<Investigation__c> getRelatedInvestigations(String reportId) {
        try {
            // Query related investigations for the selected report
            List<Investigation__c> investigations = [
                SELECT Name, CreatedById, End_Date__c, Investigation_Details__c, 
                    Investigator__c, LastModifiedById, OwnerId, 
                    Start_Date__c, Whistleblower_Report__c
                FROM Investigation__c
                WHERE Whistleblower_Report__c = :reportId
            ];

            return investigations;
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving related investigations: ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Action_Taken__c> getRelatedActions(List<Id> investigationIds) {
        try {
            // Query related actions with a lookup to Investigation
            List<Action_Taken__c> actions = [
                SELECT Name, Action_Date__c, Action_Details__c, CreatedById, 
                    Effectiveness__c, Follow_Up_Required__c, Investigation__c, 
                    LastModifiedById, OwnerId, Responsible_Party__c
                FROM Action_Taken__c
                WHERE Investigation__c IN :investigationIds
            ];
    
            return actions;
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving related actions: ' + e.getMessage());
        }
    }

    @AuraEnabled(cacheable=true)
    public static Whistleblower_Report__c getReportByUniqueIdentifier(String identifier) {
        return [SELECT Id, Name, Anonymous__c, Category__c, CreatedById, LastModifiedById, 
                OwnerId, Report_Details__c, Reported_Date__c, Status__c, Severity__c
            FROM Whistleblower_Report__c
            WHERE Anonymous_Id__c = :identifier
            LIMIT 1];
    }
    
}