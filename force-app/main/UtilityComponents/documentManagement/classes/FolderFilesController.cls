public with sharing class FolderFilesController {
    
    /**
     * Retrieves all folders for a given record
     * @param recordId The ID of the record to get folders for
     * @return List of folder wrappers containing folder name and file count
     */
    @AuraEnabled(cacheable=true)
    public static List<FolderWrapper> getFolders(String recordId) {
        List<FolderWrapper> folders = new List<FolderWrapper>();
        
        if (String.isBlank(recordId)) {
            return folders;
        }
        
        // Get all files for the record
        List<FileWrapper> files = getRecordFiles(recordId);
        
        // Get the predefined folder structure from custom metadata
        List<String> predefinedFolders = getPredefinedFolders();
        
        // Initialize folder map with predefined folders
        Map<String, List<FileWrapper>> folderMap = new Map<String, List<FileWrapper>>();
        for (String folderPath : predefinedFolders) {
            // Only add top-level folders to the map
            String topLevelFolder = folderPath.contains('/') ? folderPath.substringBefore('/') : folderPath;
            if (!folderMap.containsKey(topLevelFolder)) {
                folderMap.put(topLevelFolder, new List<FileWrapper>());
            }
        }
        
        // Always ensure Default folder exists
        if (!folderMap.containsKey('Default')) {
            folderMap.put('Default', new List<FileWrapper>());
        }
        
        // Group files by folder
        for (FileWrapper file : files) {
            String folderName = 'Default';
            
            // Check if file name contains folder path notation
            if (file.Title.contains('/')) {
                folderName = file.Title.substringBefore('/');
                // Update file title to remove folder prefix
                file.Title = file.Title.substringAfter('/');
            }
            
            if (!folderMap.containsKey(folderName)) {
                folderMap.put(folderName, new List<FileWrapper>());
            }
            
            folderMap.get(folderName).add(file);
        }
        
        // Create folder wrappers
        for (String folderName : folderMap.keySet()) {
            FolderWrapper folder = new FolderWrapper();
            folder.name = folderName;
            folder.fileCount = folderMap.get(folderName).size();
            folders.add(folder);
        }
        
        return folders;
    }
    
    /**
     * Retrieves all files within a specified folder for a record
     * @param recordId The ID of the record
     * @param folderName The name of the folder to retrieve files from
     * @return List of file wrappers for the specified folder
     */
    @AuraEnabled(cacheable=true)
    public static List<FileWrapper> getFolderFiles(String recordId, String folderName) {
        if (String.isBlank(recordId)) {
            return new List<FileWrapper>();
        }
        
        // Get all files for the record
        List<FileWrapper> allFiles = getRecordFiles(recordId);
        List<FileWrapper> folderFiles = new List<FileWrapper>();
        
        // If folderName is empty or null, return all files (used for search)
        if (String.isBlank(folderName)) {
            return allFiles;
        }
        
        for (FileWrapper file : allFiles) {
            Boolean isInFolder = false;
            String originalTitle = file.Title;
            
            // Handle files with folder path notation
            if (originalTitle.contains('/')) {
                // For nested folders, we need to check if the file path starts with the folder path
                // or is exactly equal to the folder path for files in root folders
                
                if (folderName.contains('/')) {
                    // This is a nested folder (e.g., "Reports/Monthly")
                    // Check if the file's path starts with this folder's path, followed by a slash
                    // or equals this folder's path (for exact matches)
                    if (originalTitle.startsWith(folderName + '/') || originalTitle.equals(folderName)) {
                        isInFolder = true;
                        
                        // For files directly in this folder, remove just the folder prefix and slash
                        if (originalTitle.startsWith(folderName + '/')) {
                            file.Title = originalTitle.substring(folderName.length() + 1); // +1 for the slash
                        }
                    }
                } else {
                    // This is a root level folder (e.g., "Reports")
                    // Check if it's directly in this folder or in a subfolder of this folder
                    String fileFolderName = originalTitle.substringBefore('/');
                    if (fileFolderName.equals(folderName)) {
                        isInFolder = true;
                        file.Title = originalTitle.substringAfter('/');
                    }
                }
            } else if (folderName == 'Default') {
                // Files without folder notation go in Default folder
                isInFolder = true;
            }
            
            if (isInFolder) {
                folderFiles.add(file);
            }
        }
        
        return folderFiles;
    }
    
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
        
        // Get ContentVersions
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
     * Uploads a file to a specific folder
     * @param recordId The ID of the record to attach the file to
     * @param folderName The folder to place the file in
     * @param fileName The name of the file
     * @param base64Data The file content encoded in base64
     * @param contentType The MIME type of the file
     */
    @AuraEnabled
    public static void uploadFileToFolder(String recordId, String folderName, String fileName, String base64Data, String contentType) {
        if (String.isBlank(recordId) || String.isBlank(fileName)) {
            throw new AuraHandledException('Record ID and file name are required');
        }
        
        try {
            // Determine the full file path with folder prefix
            String fullFileName;
            
            if (String.isBlank(folderName) || folderName == 'Default') {
                // Files in the Default folder don't have a prefix
                fullFileName = fileName;
            } else {
                // Files in other folders have the folder path as prefix
                fullFileName = folderName + '/' + fileName;
            }
            
            // Create ContentVersion record
            ContentVersion cv = new ContentVersion();
            cv.VersionData = EncodingUtil.base64Decode(base64Data);
            cv.Title = fullFileName;
            cv.PathOnClient = fileName; // Keep original filename for download
            cv.FirstPublishLocationId = recordId;
            
            insert cv;
            
            // Get the ContentDocumentId
            cv = [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id LIMIT 1];
            
            // Share file with portal users if needed
            shareFileWithPortal(cv.ContentDocumentId, recordId);
            
        } catch (Exception e) {
            throw new AuraHandledException('Error uploading file: ' + e.getMessage());
        }
    }
    
    /**
     * Creates a new folder (for future extensibility - folders are virtual)
     * @param recordId The ID of the record
     * @param folderName The name of the new folder
     */
    @AuraEnabled
    public static void createFolder(String recordId, String folderName) {
        if (String.isBlank(recordId) || String.isBlank(folderName)) {
            throw new AuraHandledException('Record ID and folder name are required');
        }
        
        // Since folders are virtual, we don't need to create any actual record
        // The folder will be created implicitly when files are added to it
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
     * Retrieves predefined folders from custom metadata
     * @return List of folder paths
     */
    @AuraEnabled(cacheable=true)
    public static List<String> getPredefinedFolders() {
        List<String> folderPaths = new List<String>();
        
        // Get folder structure from Custom Metadata Type
        FolderStructure__mdt defaultStructure;
        try {
            defaultStructure = [
                SELECT LongFolderPaths__c
                FROM FolderStructure__mdt
                WHERE DeveloperName = 'Default_Structure'
                LIMIT 1
            ];
            
            if (defaultStructure != null && !String.isBlank(defaultStructure.LongFolderPaths__c)) {
                // Parse comma-separated folder paths
                folderPaths = defaultStructure.LongFolderPaths__c.split(',');
                
                // Trim whitespace
                for (Integer i = 0; i < folderPaths.size(); i++) {
                    folderPaths[i] = folderPaths[i].trim();
                }
            }
        } catch (Exception e) {
            // If there's an error, return default folders
            folderPaths = new List<String>{'Documents', 'Images', 'Reports/Monthly', 'Reports/Annual', 'Supporting Documents'};
        }
        
        return folderPaths;
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
     * Wrapper class for folder information
     */
    public class FolderWrapper {
        @AuraEnabled public String name;
        @AuraEnabled public Integer fileCount;
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