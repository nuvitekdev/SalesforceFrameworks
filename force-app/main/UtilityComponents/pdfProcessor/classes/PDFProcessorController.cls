public with sharing class PDFProcessorController {
    
    @AuraEnabled
    public static String getFileData(String fileId) {
        try {
            // Query the ContentVersion for the file
            ContentVersion contentVersion = [
                SELECT Id, VersionData, FileType, Title 
                FROM ContentVersion 
                WHERE ContentDocumentId = :fileId 
                AND IsLatest = true
                LIMIT 1
            ];
            
            // Check if the file is a PDF
            if (contentVersion.FileType.toLowerCase() != 'pdf') {
                throw new AuraHandledException('Uploaded file is not a PDF');
            }
            
            // Get the file content as Blob
            Blob fileContent = contentVersion.VersionData;
            
            // Convert Blob to base64 string
            return EncodingUtil.base64Encode(fileContent);
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving file data: ' + e.getMessage());
        }
    }
    
    @AuraEnabled
    public static void deleteFile(String fileId) {
        try {
            // Query the ContentDocument
            ContentDocument doc = [SELECT Id FROM ContentDocument WHERE Id = :fileId LIMIT 1];
            
            // Delete the ContentDocument
            delete doc;
        } catch (Exception e) {
            throw new AuraHandledException('Error deleting file: ' + e.getMessage());
        }
    }
}