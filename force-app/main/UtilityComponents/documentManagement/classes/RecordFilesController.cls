public without sharing class RecordFilesController {
    /**
     * Retrieves all files for a record
     * @param recordId The ID of the record to get files for
     * @return List of file wrappers for the record
     */
    @AuraEnabled(cacheable=true)
    public static List<FileWrapper> getRecordFiles(String recordId) {
        List<FileWrapper> fileWrappers = new List<FileWrapper>();
        
        if (String.isBlank(recordId)) {
            return fileWrappers;
        }
        
        // Check if running in portal context
        Boolean isPortalUser = UserInfo.getUserType() == 'PowerCustomerSuccess' 
                            || UserInfo.getUserType() == 'PowerPartner' 
                            || UserInfo.getUserType() == 'CustomerSuccess' 
                            || UserInfo.getUserType() == 'CspLitePortal';
        
        List<ContentDocumentLink> links;
        
        // For portal users, we need to ensure visibility
        if (isPortalUser) {
            // Query with ShareType and Visibility filters appropriate for external users
            links = [
                SELECT ContentDocumentId, LinkedEntityId, ShareType, Visibility
                FROM ContentDocumentLink 
                WHERE LinkedEntityId = :recordId
                AND (ShareType = 'V' OR ShareType = 'C') // V=Viewer, C=Collaborator
                AND Visibility = 'AllUsers' // Only files visible to all users
            ];
        } else {
            // For internal users, we can use standard query
            links = [
                SELECT ContentDocumentId, LinkedEntityId, ShareType, Visibility
                FROM ContentDocumentLink 
                WHERE LinkedEntityId = :recordId
            ];
        }
        
        Set<Id> contentDocIds = new Set<Id>();
        for (ContentDocumentLink link : links) {
            contentDocIds.add(link.ContentDocumentId);
        }
        
        if (contentDocIds.isEmpty()) {
            return fileWrappers;
        }
        
        // Get ContentVersions without checking for custom fields
        List<ContentVersion> versions = [
            SELECT Id, Title, ContentDocumentId, FileType, FileExtension, ContentSize, ContentModifiedDate
            FROM ContentVersion 
            WHERE ContentDocumentId IN :contentDocIds
            AND IsLatest = true
        ];
        
        for (ContentVersion cv : versions) {
            FileWrapper wrapper = new FileWrapper();
            wrapper.Id = cv.Id;
            wrapper.ContentDocumentId = cv.ContentDocumentId;
            wrapper.Title = cv.Title;
            wrapper.FileType = cv.FileType;
            wrapper.ContentSize = cv.ContentSize;
            wrapper.ContentModifiedDate = cv.ContentModifiedDate;
            
            fileWrappers.add(wrapper);
        }
        
        return fileWrappers;
    }
    
    /**
     * Deletes a file
     * @param contentDocumentId The ID of the content document to delete
     */
    @AuraEnabled
    public static void deleteFile(String contentDocumentId) {
        if (String.isBlank(contentDocumentId)) {
            throw new AuraHandledException('ContentDocumentId is required');
        }
        
        try {
            // Query the ContentDocument to delete
            ContentDocument doc = [
                SELECT Id 
                FROM ContentDocument 
                WHERE Id = :contentDocumentId
                LIMIT 1
            ];
            
            // Delete the ContentDocument
            delete doc;
        } catch (Exception e) {
            throw new AuraHandledException('Error deleting file: ' + e.getMessage());
        }
    }
    
    /**
     * Shares a file with portal users
     * @param contentDocumentId The ID of the content document to share
     * @param recordId The ID of the record to share with
     */
    @AuraEnabled
    public static void shareFileWithPortal(String contentDocumentId, String recordId) {
        if (String.isBlank(contentDocumentId) || String.isBlank(recordId)) {
            throw new AuraHandledException('ContentDocumentId and RecordId are required');
        }
        
        try {
            // First check if a link already exists
            List<ContentDocumentLink> existingLinks = [
                SELECT Id, ShareType, Visibility
                FROM ContentDocumentLink
                WHERE ContentDocumentId = :contentDocumentId
                AND LinkedEntityId = :recordId
            ];
            
            if (!existingLinks.isEmpty()) {
                // Update existing link
                ContentDocumentLink link = existingLinks[0];
                link.ShareType = 'V'; // V = Viewer
                link.Visibility = 'AllUsers';
                update link;
            } else {
                // Create new link
                ContentDocumentLink link = new ContentDocumentLink();
                link.ContentDocumentId = contentDocumentId;
                link.LinkedEntityId = recordId;
                link.ShareType = 'V'; // V = Viewer
                link.Visibility = 'AllUsers';
                insert link;
            }
        } catch (Exception e) {
            throw new AuraHandledException('Error sharing file: ' + e.getMessage());
        }
    }
    
    /**
     * Wrapper class for file information
     */
    public class FileWrapper {
        @AuraEnabled public String Id;
        @AuraEnabled public String ContentDocumentId;
        @AuraEnabled public String Title;
        @AuraEnabled public String FileType;
        @AuraEnabled public Long ContentSize;
        @AuraEnabled public Datetime ContentModifiedDate;
    }
} 