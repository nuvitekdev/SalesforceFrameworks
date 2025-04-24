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
     * @param email The email address of the requester
     * @param phone The phone number of the requester
     * @param contactId The ID of the contact (for portal users)
     * @param suppliedName The name provided by the requester (for unauthenticated users)
     * @return String The ID of the created case
     */
    @AuraEnabled
    public static String createSupportCase(
        String subject,
        String description,
        String priority,
        String applicationContext,
        String email,
        String phone,
        Id contactId,
        String suppliedName
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
            
            // Add user contact information
            if (String.isNotBlank(email)) {
                newCase.SuppliedEmail = email;
            }
            
            if (String.isNotBlank(phone)) {
                newCase.SuppliedPhone = phone;
            }
            
            // Add supplied name for web users
            if (String.isNotBlank(suppliedName)) {
                newCase.SuppliedName = suppliedName;
            }
            
            // Link to contact if provided (portal users)
            if (contactId != null) {
                newCase.ContactId = contactId;
            }
            
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
    
    /**
     * @description Gets current user information for prepopulating the form
     * @return Map<String, Object> Map containing user information
     */
    @AuraEnabled
    public static Map<String, Object> getCurrentUserInfo() {
        try {
            Map<String, Object> userDetails = new Map<String, Object>();
            
            // Get current user
            User currentUser = [
                SELECT Id, Name, Email, Phone, 
                       IsPortalEnabled, ContactId, 
                       Contact.Name, Contact.Email, Contact.Phone
                FROM User 
                WHERE Id = :UserInfo.getUserId()
            ];
            
            // Populate standard user fields
            userDetails.put('userId', currentUser.Id);
            userDetails.put('userName', currentUser.Name);
            userDetails.put('userEmail', currentUser.Email);
            userDetails.put('userPhone', currentUser.Phone);
            userDetails.put('isPortalUser', currentUser.IsPortalEnabled);
            
            // For portal users, add contact information
            if (currentUser.IsPortalEnabled && currentUser.ContactId != null) {
                userDetails.put('contactId', currentUser.ContactId);
                userDetails.put('contactName', currentUser.Contact?.Name);
                userDetails.put('contactEmail', currentUser.Contact?.Email);
                userDetails.put('contactPhone', currentUser.Contact?.Phone);
            }
            
            return userDetails;
            
        } catch (Exception e) {
            System.debug('Error in getCurrentUserInfo: ' + e.getMessage() + ' - ' + e.getStackTraceString());
            throw new AuraHandledException('Error getting user info: ' + e.getMessage());
        }
    }
}