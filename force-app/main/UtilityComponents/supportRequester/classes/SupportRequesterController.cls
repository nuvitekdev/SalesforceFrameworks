/**
 * @description Controller for the supportRequester LWC component
 * Handles saving video recordings to Salesforce Files (ContentDocument) and
 * retrieving available applications for context selection
 */
public with sharing class SupportRequesterController {
    
    /**
     * @description Saves a support request recording as a ContentDocument and links it to the specified record
     * @param recordId The ID of the record to link the document to (typically a Case)
     * @param fileName The name of the file to create
     * @param base64Data The base64-encoded file data
     * @param contentType The MIME type of the file
     * @param folderName The name of the folder to store the file in (currently not supported by ContentVersion)
     * @return ContentDocumentId The ID of the created ContentDocument
     */
    @AuraEnabled
    public static String saveSupportRecording(
        String recordId,
        String fileName,
        String base64Data,
        String contentType,
        String folderName
    ) {
        try {
            // Validate inputs
            if (String.isBlank(recordId) || String.isBlank(base64Data)) {
                throw new AuraHandledException('Required parameters are missing');
            }
            
            // Create ContentVersion
            ContentVersion cv = new ContentVersion();
            cv.Title = fileName;
            cv.PathOnClient = fileName;
            cv.VersionData = EncodingUtil.base64Decode(base64Data);
            cv.FirstPublishLocationId = recordId; // Automatically shares the file with the record
            cv.Description = 'Support recording submitted on ' + System.now().format();
            
            // Note: While we're keeping the folderName parameter for future use,
            // ContentVersion doesn't support direct folder assignment.
            // Files are organized in Salesforce Files system based on related records.
            
            // Insert the ContentVersion
            insert cv;
            
            // Get the ContentDocumentId
            ContentVersion insertedCv = [
                SELECT Id, ContentDocumentId 
                FROM ContentVersion 
                WHERE Id = :cv.Id 
                LIMIT 1
            ];
            
            // Return the ContentDocumentId
            return insertedCv.ContentDocumentId;
            
        } catch (Exception e) {
            System.debug('Error in saveSupportRecording: ' + e.getMessage() + ' - ' + e.getStackTraceString());
            throw new AuraHandledException('Error saving recording: ' + e.getMessage());
        }
    }
    
    /**
     * @description Retrieves a list of available applications for context selection
     * This method can be customized to retrieve apps from any custom object or metadata
     * @return List<ApplicationOption> List of application options with label and value
     */
    @AuraEnabled(cacheable=true)
    public static List<ApplicationOption> getAvailableApps() {
        List<ApplicationOption> options = new List<ApplicationOption>();
        
        try {
            // Get list of available apps from App Settings custom metadata
            // This is a placeholder - implement with your own application data source
            // Could be from custom settings, metadata, or by querying actual apps
            
            // Example implementation - this would be replaced with actual data source
            options.add(new ApplicationOption('Sales App', 'sales'));
            options.add(new ApplicationOption('Service App', 'service'));
            options.add(new ApplicationOption('Marketing App', 'marketing'));
            options.add(new ApplicationOption('Community Portal', 'community'));
            options.add(new ApplicationOption('Other', 'other'));
            
            return options;
        } catch (Exception e) {
            System.debug('Error in getAvailableApps: ' + e.getMessage() + ' - ' + e.getStackTraceString());
            throw new AuraHandledException('Error retrieving available applications: ' + e.getMessage());
        }
    }
    
    /**
     * @description Wrapper class for application options
     */
    public class ApplicationOption {
        @AuraEnabled public String label { get; set; }
        @AuraEnabled public String value { get; set; }
        
        public ApplicationOption(String label, String value) {
            this.label = label;
            this.value = value;
        }
    }
} 