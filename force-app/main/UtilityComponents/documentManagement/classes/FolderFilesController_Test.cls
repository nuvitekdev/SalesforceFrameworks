@isTest
private class FolderFilesController_Test {
    
    /**
     * Tests getting folders for a record
     */
    @isTest
    static void testGetFolders() {
        // Create test account
        Account testAccount = new Account(Name = 'Test Account');
        insert testAccount;
        
        // Create test content
        ContentVersion cv1 = new ContentVersion(
            Title = 'Documents/Test Document.pdf',
            PathOnClient = 'Test Document.pdf',
            VersionData = Blob.valueOf('Test Content'),
            IsMajorVersion = true
        );
        insert cv1;
        
        // Get ContentDocumentId
        cv1 = [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :cv1.Id LIMIT 1];
        
        // Create ContentDocumentLink
        ContentDocumentLink link1 = new ContentDocumentLink(
            ContentDocumentId = cv1.ContentDocumentId,
            LinkedEntityId = testAccount.Id,
            ShareType = 'V',
            Visibility = 'AllUsers'
        );
        insert link1;
        
        // Test getFolders method
        Test.startTest();
        List<FolderFilesController.FolderWrapper> folders = FolderFilesController.getFolders(testAccount.Id);
        Test.stopTest();
        
        // Verify results
        System.assertEquals(true, folders.size() > 0, 'Should return at least one folder');
        
        Boolean foundDocumentsFolder = false;
        for (FolderFilesController.FolderWrapper folder : folders) {
            if (folder.name == 'Documents') {
                foundDocumentsFolder = true;
                System.assertEquals(1, folder.fileCount, 'Documents folder should have 1 file');
            }
        }
        
        System.assertEquals(true, foundDocumentsFolder, 'Should include Documents folder');
    }
    
    /**
     * Tests getting files within a specific folder
     */
    @isTest
    static void testGetFolderFiles() {
        // Create test account
        Account testAccount = new Account(Name = 'Test Account');
        insert testAccount;
        
        // Create test content in Documents folder
        ContentVersion cv1 = new ContentVersion(
            Title = 'Documents/Test Document.pdf',
            PathOnClient = 'Test Document.pdf',
            VersionData = Blob.valueOf('Test Content 1'),
            IsMajorVersion = true
        );
        insert cv1;
        
        // Create test content in Images folder
        ContentVersion cv2 = new ContentVersion(
            Title = 'Images/Test Image.jpg',
            PathOnClient = 'Test Image.jpg',
            VersionData = Blob.valueOf('Test Content 2'),
            IsMajorVersion = true
        );
        insert cv2;
        
        // Get ContentDocumentIds
        cv1 = [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :cv1.Id LIMIT 1];
        cv2 = [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :cv2.Id LIMIT 1];
        
        // Create ContentDocumentLinks
        ContentDocumentLink link1 = new ContentDocumentLink(
            ContentDocumentId = cv1.ContentDocumentId,
            LinkedEntityId = testAccount.Id,
            ShareType = 'V',
            Visibility = 'AllUsers'
        );
        insert link1;
        
        ContentDocumentLink link2 = new ContentDocumentLink(
            ContentDocumentId = cv2.ContentDocumentId,
            LinkedEntityId = testAccount.Id,
            ShareType = 'V',
            Visibility = 'AllUsers'
        );
        insert link2;
        
        // Test getFolderFiles method for Documents folder
        Test.startTest();
        List<FolderFilesController.FileWrapper> documentFiles = FolderFilesController.getFolderFiles(testAccount.Id, 'Documents');
        Test.stopTest();
        
        // Verify results
        System.assertEquals(1, documentFiles.size(), 'Should return 1 file in Documents folder');
        System.assertEquals('Test Document.pdf', documentFiles[0].Title, 'Should return correct file name');
    }
} 