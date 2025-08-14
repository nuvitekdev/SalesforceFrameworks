public with sharing class PdfSignController {
  @AuraEnabled(cacheable=false)
  public static Id saveSignedPdf(
    String base64Data,
    String fileName,
    Id recordId,
    Boolean isTemporary
  ) {
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

    ContentVersion cv = new ContentVersion();
    cv.Title = fileName;
    cv.PathOnClient = fileName;
    cv.VersionData = pdfBlob;

    if (isTemporary != null && isTemporary) {
      cv.Description = 'Temporary PDF for preview - will be deleted';
    }

    insert cv;

    // We need to query back to get ContentDocumentId
    cv = [
      SELECT Id, ContentDocumentId
      FROM ContentVersion
      WHERE Id = :cv.Id
      LIMIT 1
    ];

    if (recordId != null) {
      ContentDocumentLink link = new ContentDocumentLink();
      link.ContentDocumentId = cv.ContentDocumentId;
      link.LinkedEntityId = recordId;
      link.ShareType = 'V';
      link.Visibility = 'AllUsers';
      insert link;
    }

    return cv.Id;
  }

  @AuraEnabled(cacheable=false)
  public static String getDocumentUrl(Id contentVersionId) {
    if (contentVersionId == null) {
      throw new AuraHandledException('No Content Version Id provided');
    }

    try {
      ContentVersion cv = [
        SELECT Id, ContentDocumentId
        FROM ContentVersion
        WHERE Id = :contentVersionId
        LIMIT 1
      ];

      return '/sfc/servlet.shepherd/document/download/' + cv.ContentDocumentId;
    } catch (Exception e) {
      throw new AuraHandledException(
        'Error retrieving document URL: ' + e.getMessage()
      );
    }
  }

  @AuraEnabled(cacheable=false)
  public static void deleteTemporaryPdf(Id contentVersionId) {
    if (contentVersionId == null) {
      throw new AuraHandledException('No Content Version Id provided');
    }

    try {
      // First, get the ContentDocument ID from the ContentVersion
      ContentVersion cv = [
        SELECT Id, ContentDocumentId, Description
        FROM ContentVersion
        WHERE Id = :contentVersionId
        LIMIT 1
      ];

      // Only delete if it's a temporary file (safety check)
      if (
        cv.Description != null &&
        cv.Description.contains('Temporary PDF for preview')
      ) {
        // Delete the ContentDocument (this will cascade delete all versions and links)
        if (cv.ContentDocumentId != null) {
          ContentDocument cd = new ContentDocument(Id = cv.ContentDocumentId);
          delete cd;
        }
      }
    } catch (Exception e) {
      throw new AuraHandledException(
        'Error deleting temporary PDF: ' + e.getMessage()
      );
    }
  }
}
