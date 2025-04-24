/**
 * @description Controller for the interviewRecorder LWC component
 * Handles saving video recordings to Salesforce Files (ContentDocument) and
 * linking them to the specified record
 */
public with sharing class InterviewRecorderController {
    
    /**
     * @description Saves a recorded interview as a ContentDocument and links it to the specified record
     * @param recordId The ID of the record to link the document to
     * @param fileName The name of the file to create
     * @param base64Data The base64-encoded file data
     * @param contentType The MIME type of the file
     * @param folderName The name of the folder to store the file in (currently not supported)
     * @return ContentDocumentId The ID of the created ContentDocument
     */
    @AuraEnabled
    public static String saveInterviewRecording(
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
            cv.Description = 'Interview recording submitted on ' + System.now().format();
            
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
            System.debug('Error in saveInterviewRecording: ' + e.getMessage() + ' - ' + e.getStackTraceString());
            throw new AuraHandledException('Error saving recording: ' + e.getMessage());
        }
    }
}