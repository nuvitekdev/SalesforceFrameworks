@isTest
private class RecordFilesController_Test {
    
    /**
     * Tests retrieving files for a record
     */
    @isTest
    static void testGetRecordFiles() {
        // Create test account
        Account testAccount = new Account(Name = 'Test Account');
        insert testAccount;
        
        // Create test content
        ContentVersion cv = new ContentVersion(
            Title = 'Test Document.pdf',
            PathOnClient = 'Test Document.pdf',
            VersionData = Blob.valueOf('Test Content'),
            IsMajorVersion = true
        );
        insert cv;
        
        // Get ContentDocumentId
        cv = [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id LIMIT 1];
        
        // Create ContentDocumentLink
        ContentDocumentLink link = new ContentDocumentLink(
            ContentDocumentId = cv.ContentDocumentId,
            LinkedEntityId = testAccount.Id,
            ShareType = 'V',
            Visibility = 'AllUsers'
        );
        insert link;
        
        // Test getRecordFiles method
        Test.startTest();
        List<RecordFilesController.FileWrapper> files = RecordFilesController.getRecordFiles(testAccount.Id);
        Test.stopTest();
        
        // Verify results
        System.assertEquals(1, files.size(), 'Should return one file');
        System.assertEquals('Test Document.pdf', files[0].Title, 'Should return correct file name');
    }
    
    /**
     * Tests sharing a file with portal users
     */
    @isTest
    static void testShareFileWithPortal() {
        // Create test account
        Account testAccount = new Account(Name = 'Test Account');
        insert testAccount;
        
        // Create test content
        ContentVersion cv = new ContentVersion(
            Title = 'Test Document.pdf',
            PathOnClient = 'Test Document.pdf',
            VersionData = Blob.valueOf('Test Content'),
            IsMajorVersion = true
        );
        insert cv;
        
        // Get ContentDocumentId
        cv = [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id LIMIT 1];
        
        // Test shareFileWithPortal method
        Test.startTest();
        RecordFilesController.shareFileWithPortal(cv.ContentDocumentId, testAccount.Id);
        Test.stopTest();
        
        // Verify ContentDocumentLink was created
        List<ContentDocumentLink> links = [
            SELECT ShareType, Visibility
            FROM ContentDocumentLink
            WHERE ContentDocumentId = :cv.ContentDocumentId
            AND LinkedEntityId = :testAccount.Id
        ];
        
        System.assertEquals(1, links.size(), 'Should create one content document link');
        System.assertEquals('V', links[0].ShareType, 'Should set ShareType to Viewer');
        System.assertEquals('AllUsers', links[0].Visibility, 'Should set Visibility to AllUsers');
    }
    
    /**
     * Tests deleting a file
     */
    @isTest
    static void testDeleteFile() {
        // Create test content
        ContentVersion cv = new ContentVersion(
            Title = 'Test Document.pdf',
            PathOnClient = 'Test Document.pdf',
            VersionData = Blob.valueOf('Test Content'),
            IsMajorVersion = true
        );
        insert cv;
        
        // Get ContentDocumentId
        cv = [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id LIMIT 1];
        String contentDocId = cv.ContentDocumentId;
        
        // Test deleteFile method
        Test.startTest();
        RecordFilesController.deleteFile(contentDocId);
        Test.stopTest();
        
        // Verify content document was deleted
        List<ContentDocument> docs = [SELECT Id FROM ContentDocument WHERE Id = :contentDocId];
        System.assertEquals(0, docs.size(), 'Content document should be deleted');
    }
} 