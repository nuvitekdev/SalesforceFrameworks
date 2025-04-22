public with sharing class PdfSignService {
    @AuraEnabled(cacheable=true)
    public static String getPdfBase64(Id contentVersionId) {
        ContentVersion cv = [SELECT VersionData FROM ContentVersion WHERE Id = :contentVersionId];
        return EncodingUtil.base64Encode(cv.VersionData);
    }
    
    @AuraEnabled
    public static Id saveSignedPdf(String parentId, String fileName, String base64Data){
        ContentVersion cv = new ContentVersion(
            Title = fileName,
            PathOnClient = fileName,
            VersionData = EncodingUtil.base64Decode(base64Data),
            FirstPublishLocationId = parentId
        );
        insert cv;
        return cv.Id;
    }
    
    @AuraEnabled(cacheable=true)
    public static List<ContentDocumentLink> getRelatedFiles(Id recordId) {
        return [SELECT ContentDocumentId, ContentDocument.Title, ContentDocument.FileType 
                FROM ContentDocumentLink 
                WHERE LinkedEntityId = :recordId 
                AND ContentDocument.FileType = 'PDF'
                ORDER BY ContentDocument.CreatedDate DESC];
    }
} 