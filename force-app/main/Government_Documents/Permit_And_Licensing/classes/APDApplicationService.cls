/**
 * @description Persists Permit Application Wizard data into core APD objects
 * Scalable mapping designed to support additional permit types and agencies.
 */
public with sharing class APDApplicationService {

    public class SaveResult {
        @AuraEnabled public Id applicationId;
    }

    @AuraEnabled
    public static SaveResult saveFromWizard(String applicationId, String formDataJson) {
        // CRUD checks
        if (!Schema.sObjectType.APD_Application__c.isCreateable() && String.isBlank(applicationId)) {
            throw new AuraHandledException('Insufficient access to create APD Application');
        }
        if (!Schema.sObjectType.APD_Application__c.isUpdateable() && String.isNotBlank(applicationId)) {
            throw new AuraHandledException('Insufficient access to update APD Application');
        }
        Map<String, Object> data = (Map<String, Object>) JSON.deserializeUntyped(formDataJson);

        SaveResult res = new SaveResult();

        // 1) Upsert Operator (if not provided)
        Id operatorId = (Id) data.get('operatorId');
        if (operatorId == null) {
            if (!Schema.sObjectType.Operator__c.isCreateable()) {
                throw new AuraHandledException('Insufficient access to create Operator');
            }
            Operator__c op = new Operator__c();
            op.Name = (String) data.get('operatorName');
            op.Street_Address__c = (String) data.get('operatorAddress');
            op.Primary_Contact_Phone__c = (String) data.get('operatorPhone');
            op.Primary_Contact_Email__c = (String) data.get('operatorEmail');
            List<SObject> stripped = Security.stripInaccessible(AccessType.CREATABLE, new List<SObject>{ op }).getRecords();
            insert (Operator__c) stripped[0];
            operatorId = op.Id;
        }

        // 2) Upsert APD Application
        APD_Application__c app = (applicationId != null) ?
            [SELECT Id FROM APD_Application__c WHERE Id = :applicationId WITH SECURITY_ENFORCED LIMIT 1] : new APD_Application__c();

        app.Operator__c = operatorId;
        app.Submission_Date__c = app.Submission_Date__c == null ? Date.today() : app.Submission_Date__c;
        app.Status__c = app.Status__c == null ? 'Submitted' : app.Status__c;
        if (data.containsKey('blmFieldOffice')) app.BLM_Field_Office__c = (String) data.get('blmFieldOffice');
        if (data.containsKey('priorityLevel')) app.Priority_Level__c = (String) data.get('priorityLevel');
        if (data.containsKey('expectedSpudDate') && data.get('expectedSpudDate') != null) {
            app.Expected_Spud_Date__c = Date.valueOf((String) data.get('expectedSpudDate'));
        }
        if (data.containsKey('wellType')) app.Well_Type__c = (String) data.get('wellType');

        if (String.isBlank(applicationId)) {
            List<SObject> strippedCreate = Security.stripInaccessible(AccessType.CREATABLE, new List<SObject>{ app }).getRecords();
            insert (APD_Application__c) strippedCreate[0];
        } else {
            List<SObject> strippedUpdate = Security.stripInaccessible(AccessType.UPDATABLE, new List<SObject>{ app }).getRecords();
            update (APD_Application__c) strippedUpdate[0];
        }
        res.applicationId = app.Id;

        // 3) Lease / Agreement (PLSS & geospatial)
        if (data.containsKey('leaseNumber') || data.containsKey('state') || data.containsKey('county') || data.containsKey('legalDescription')) {
            if (!Schema.sObjectType.Lease_Agreement__c.isCreateable()) {
                throw new AuraHandledException('Insufficient access to create Lease');
            }
            Lease_Agreement__c lease = new Lease_Agreement__c();
            lease.Name = (String) data.get('leaseNumber');
            lease.State__c = (String) data.get('state');
            lease.County__c = (String) data.get('county');
            if (data.get('latitude') != null) lease.Latitude__c = Decimal.valueOf(String.valueOf(data.get('latitude')));
            if (data.get('longitude') != null) lease.Longitude__c = Decimal.valueOf(String.valueOf(data.get('longitude')));
            // PLSS breakdown when provided
            if (data.containsKey('township')) lease.Township__c = (String) data.get('township');
            if (data.containsKey('range')) lease.Range__c = (String) data.get('range');
            if (data.containsKey('section')) lease.Section__c = (String) data.get('section');
            if (data.containsKey('meridian')) lease.Meridian__c = (String) data.get('meridian');
            // Legal description fallback
            if (data.containsKey('legalDescription') && lease.Section__c == null) lease.Section__c = (String) data.get('legalDescription');
            insert (Lease_Agreement__c) Security.stripInaccessible(AccessType.CREATABLE, new List<SObject>{ lease }).getRecords()[0];
        }

        // 4) Well Pad
        if (!Schema.sObjectType.Well_Pad__c.isCreateable()) {
            throw new AuraHandledException('Insufficient access to create Well Pad');
        }
        Well_Pad__c pad = new Well_Pad__c();
        pad.APD_Application__c = app.Id;
        if (data.get('latitude') != null) pad.Pad_Latitude__c = Decimal.valueOf(String.valueOf(data.get('latitude')));
        if (data.get('longitude') != null) pad.Pad_Longitude__c = Decimal.valueOf(String.valueOf(data.get('longitude')));
        if (data.containsKey('accessRoads')) pad.Access_Road_Description__c = (String) data.get('accessRoads');
        insert (Well_Pad__c) Security.stripInaccessible(AccessType.CREATABLE, new List<SObject>{ pad }).getRecords()[0];

        // 5) Well (linked to pad)
        if (!Schema.sObjectType.Well__c.isCreateable()) {
            throw new AuraHandledException('Insufficient access to create Well');
        }
        Well__c well = new Well__c();
        well.Well_Pad__c = pad.Id;
        well.Well_Number__c = (String) data.get('wellName');
        well.API_Well_Number__c = (String) data.get('apiNumber');
        if (data.get('totalDepth') != null) well.Proposed_MD__c = Decimal.valueOf(String.valueOf(data.get('totalDepth')));
        if (data.get('latitude') != null) well.Surface_Hole_Latitude__c = Decimal.valueOf(String.valueOf(data.get('latitude')));
        if (data.get('longitude') != null) well.Surface_Hole_Longitude__c = Decimal.valueOf(String.valueOf(data.get('longitude')));
        if (data.containsKey('wellType')) well.Well_Type__c = (String) data.get('wellType');
        // H2S & reentry flags when provided
        if (data.containsKey('h2sProgramRequired')) well.H2S_Program_Required__c = (Boolean) data.get('h2sProgramRequired');
        if (data.containsKey('reentry')) well.Reentry_Flag__c = (Boolean) data.get('reentry');
        if (data.containsKey('expectedGeologicalFormations')) well.Expected_Formations__c = (String) data.get('expectedGeologicalFormations');
        insert (Well__c) Security.stripInaccessible(AccessType.CREATABLE, new List<SObject>{ well }).getRecords()[0];

        // 6) Drilling Plan
        if (!Schema.sObjectType.Drilling_Plan__c.isCreateable()) {
            throw new AuraHandledException('Insufficient access to create Drilling Plan');
        }
        Drilling_Plan__c dp = new Drilling_Plan__c();
        dp.APD_Application__c = app.Id;
        dp.Casing_Program__c = (String) data.get('casingProgram');
        dp.Mud_Program__c = (String) data.get('mudProgram');
        dp.BOP_Program__c = (String) data.get('blowoutPreventionEquipment');
        if (data.containsKey('expectedFormationPressures')) dp.Expected_Formation_Pressures__c = (String) data.get('expectedFormationPressures');
        if (data.containsKey('expectedFreshwaterZones')) dp.Expected_Freshwater_Zones__c = (String) data.get('expectedFreshwaterZones');
        if (data.containsKey('expectedLostCirculationZones')) dp.Expected_Lost_Circulation_Zones__c = (String) data.get('expectedLostCirculationZones');
        insert (Drilling_Plan__c) Security.stripInaccessible(AccessType.CREATABLE, new List<SObject>{ dp }).getRecords()[0];

        // 7) Surface Use Plan of Operations (SUPO)
        if (!Schema.sObjectType.Surface_Use_Plan__c.isCreateable()) {
            throw new AuraHandledException('Insufficient access to create Surface Use Plan');
        }
        Surface_Use_Plan__c su = new Surface_Use_Plan__c();
        su.APD_Application__c = app.Id;
        su.Roads_Description__c = (String) data.get('accessRoads');
        su.Reclamation_Plan__c = (String) data.get('reclamationPlan');
        su.Water_Source__c = (String) data.get('waterSourceDetails');
        // Additional SUPO details if provided
        if (data.containsKey('newRoadConstruction')) su.New_Road_Construction__c = (Boolean) data.get('newRoadConstruction');
        if (data.containsKey('totalRoadMilesNew')) su.Total_Road_Miles_New__c = Decimal.valueOf(String.valueOf(data.get('totalRoadMilesNew')));
        if (data.containsKey('totalRoadMilesImproved')) su.Total_Road_Miles_Improved__c = Decimal.valueOf(String.valueOf(data.get('totalRoadMilesImproved')));
        if (data.containsKey('waterSourceType')) su.Water_Source_Type__c = (String) data.get('waterSourceType');
        if (data.containsKey('interimReclamation')) su.Interim_Reclamation__c = (Boolean) data.get('interimReclamation');
        if (data.containsKey('finalReclamationTimeline')) su.Final_Reclamation_Timeline__c = (String) data.get('finalReclamationTimeline');
        if (data.containsKey('culturalResourcesRequired')) su.Cultural_Archaeological_Surveys__c = ((Boolean) data.get('culturalResourcesRequired')) ? 'Required: Yes' : 'Required: No';
        insert (Surface_Use_Plan__c) Security.stripInaccessible(AccessType.CREATABLE, new List<SObject>{ su }).getRecords()[0];

        return res;
    }
}