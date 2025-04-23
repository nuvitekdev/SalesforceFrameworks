public with sharing class PdfSignController {
    @AuraEnabled(cacheable=false)
    public static Id saveSignedPdf(String base64Data, String fileName, Id recordId) {
        if (base64Data == null) {
            throw new AuraHandledException('No PDF data received');
        }
        // Decode Base64 to Blob
        Blob pdfBlob;
        try {
            pdfBlob = EncodingUtil.base64Decode(base64Data);
        } catch (Exception e) {
            throw new AuraHandledException('Invalid PDF data: ' + e.getMessage());
        }
        if (fileName == null || fileName.trim().length() == 0) {
            fileName = 'SignedDocument.pdf';
        }
        if (!fileName.toLowerCase().endsWith('.pdf')) {
            fileName += '.pdf';
        }
        
        // Create ContentVersion record
        ContentVersion cv = new ContentVersion();
        cv.Title = fileName;
        cv.PathOnClient = fileName;
        cv.VersionData = pdfBlob;
        cv.FirstPublishLocationId = recordId; // This will auto-create the ContentDocumentLink
        
        try {
            insert cv;
            
            // If FirstPublishLocationId didn't work or we need specific sharing settings
            if (recordId != null) {
                // Query to get the ContentDocumentId created
                cv = [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id LIMIT 1];
                
                // Check if ContentDocumentLink already exists
                List<ContentDocumentLink> existingLinks = [
                    SELECT Id FROM ContentDocumentLink 
                    WHERE ContentDocumentId = :cv.ContentDocumentId 
                    AND LinkedEntityId = :recordId
                    LIMIT 1
                ];
                
                // Create link only if it doesn't exist
                if (existingLinks.isEmpty()) {
                    ContentDocumentLink link = new ContentDocumentLink();
                    link.ContentDocumentId = cv.ContentDocumentId;
                    link.LinkedEntityId = recordId;
                    link.ShareType = 'V'; // Viewer permission
                    link.Visibility = 'AllUsers'; // All users with record access can see
                    insert link;
                }
            }
            
            return cv.Id;
            
        } catch (Exception e) {
            System.debug('Error saving PDF: ' + e.getMessage() + ' Stack: ' + e.getStackTraceString());
            throw new AuraHandledException('Error saving PDF: ' + e.getMessage());
        }
    }
}