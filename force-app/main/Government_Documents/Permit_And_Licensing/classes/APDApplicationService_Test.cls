@IsTest
private class APDApplicationService_Test {
    @IsTest
    static void testSaveFromWizard_InsertsRelatedRecords() {
        // Prepare minimal form data
        Map<String, Object> data = new Map<String, Object>{
            'operatorName' => 'Test Operator',
            'operatorAddress' => '123 Main St',
            'operatorPhone' => '555-123-4567',
            'operatorEmail' => 'test@example.com',
            'leaseNumber' => 'NM-12345',
            'legalDescription' => 'T1N R1E S1',
            'latitude' => 35.123,
            'longitude' => -106.543,
            'state' => 'NM',
            'county' => 'Bernalillo',
            'wellName' => 'Well-001',
            'apiNumber' => '12-345-67890-12-34',
            'wellType' => 'Oil',
            'totalDepth' => 1000,
            'blowoutPreventionEquipment' => 'Standard BOP',
            'mudProgram' => 'Water-based',
            'reclamationPlan' => 'Standard plan',
            'waterSourceDetails' => 'Municipal'
        };

        Test.startTest();
        APDApplicationService.SaveResult res = APDApplicationService.saveFromWizard(null, JSON.serialize(data));
        Test.stopTest();

        System.assertNotEquals(null, res);
        System.assertNotEquals(null, res.applicationId, 'Application ID should be returned');

        // Verify application exists
        APD_Application__c app = [SELECT Id, Operator__c FROM APD_Application__c WHERE Id = :res.applicationId LIMIT 1];
        System.assertNotEquals(null, app.Operator__c, 'Operator should be linked');

        // Verify related child records inserted
        Integer pads = [SELECT COUNT() FROM Well_Pad__c WHERE APD_Application__c = :app.Id];
        Integer dps = [SELECT COUNT() FROM Drilling_Plan__c WHERE APD_Application__c = :app.Id];
        Integer supos = [SELECT COUNT() FROM Surface_Use_Plan__c WHERE APD_Application__c = :app.Id];
        System.assert(pads == 1, 'Should create one Well Pad');
        System.assert(dps == 1, 'Should create one Drilling Plan');
        System.assert(supos == 1, 'Should create one Surface Use Plan');
    }
}

