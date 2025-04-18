/**
 * @description Controller for the supportRequester LWC component
 * Handles saving video recordings to Salesforce Files (ContentDocument),
 * and creating support cases
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
     * @description Creates a new case using the Support Request record type
     * @param subject The case subject
     * @param description The case description
     * @param priority The case priority
     * @param applicationContext The application context
     * @return String The ID of the created case
     */
    @AuraEnabled
    public static String createSupportCase(
        String subject,
        String description,
        String priority,
        String applicationContext
    ) {
        try {
            // Validate inputs
            if (String.isBlank(subject) || String.isBlank(description)) {
                throw new AuraHandledException('Subject and description are required');
            }
            
            // Get the Support_Request record type ID
            Id supportRequestRecordTypeId = Schema.SObjectType.Case.getRecordTypeInfosByDeveloperName()
                .get('Support_Request')
                .getRecordTypeId();
            
            // Create the case
            Case newCase = new Case(
                Subject = subject,
                Description = description,
                Priority = String.isNotBlank(priority) ? priority : 'Medium',
                Origin = 'Web',
                Status = 'New',
                RecordTypeId = supportRequestRecordTypeId
            );
            
            // Add application context if available
            if (String.isNotBlank(applicationContext)) {
                newCase.Application__c = applicationContext;
            }
            
            // Insert the case
            insert newCase;
            
            return newCase.Id;
            
        } catch (Exception e) {
            System.debug('Error in createSupportCase: ' + e.getMessage() + ' - ' + e.getStackTraceString());
            throw new AuraHandledException('Error creating case: ' + e.getMessage());
        }
    }
} 