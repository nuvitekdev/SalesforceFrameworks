public with sharing class SignatureCaptureController {
    
    @AuraEnabled
    public static String saveSignature(String recordId, String signatureBody, String fileName) {
        try {
            // Decode the base64 string to get the file content
            Blob signatureBlob = EncodingUtil.base64Decode(signatureBody);
            
            // Create ContentVersion
            ContentVersion cv = new ContentVersion();
            cv.Title = fileName;
            cv.PathOnClient = fileName;
            cv.VersionData = signatureBlob;
            cv.IsMajorVersion = true;
            
            insert cv;
            
            // Get the ContentDocument ID
            Id contentDocumentId = [
                SELECT ContentDocumentId 
                FROM ContentVersion 
                WHERE Id = :cv.Id
            ].ContentDocumentId;
            
            // Create ContentDocumentLink to link the file to the record if recordId is provided
            if (recordId != null) {
                ContentDocumentLink cdl = new ContentDocumentLink();
                cdl.ContentDocumentId = contentDocumentId;
                cdl.LinkedEntityId = recordId;
                cdl.ShareType = 'V'; // V = Viewer, C = Collaborator, I = Inferred
                cdl.Visibility = 'AllUsers';
                
                insert cdl;
            }
            
            return contentDocumentId;
        } catch (Exception e) {
            throw new AuraHandledException('Error saving signature: ' + e.getMessage());
        }
    }
}