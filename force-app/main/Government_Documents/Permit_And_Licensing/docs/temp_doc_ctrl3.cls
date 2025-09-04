    if (String.isNotBlank(baseDescription)) {
      return baseDescription + ' (' + agencyType + ' ' + permitType + ')';
    }
    
    return 'Permit-related documents for ' + folderName + ' (' + agencyType + ')';
  }

  private static Boolean isRequiredFolder(String folderName, String agencyType, String permitType) {
    Set<String> requiredFolders = new Set<String>{
      'Application_Documents',
      'Technical_Plans',
      'Signed_Documents'
    };
    
    // Add permit-type specific required folders
    if (permitType == 'Environmental' || permitType == 'Drilling') {
      requiredFolders.add('Environmental_Documents');
    }
    
    return requiredFolders.contains(folderName);
  }

  private static String getFolderWorkflowStage(String folderName) {
    Map<String, String> workflowStages = new Map<String, String>{
      'Application_Documents' => 'Initial Submission',
      'Technical_Plans' => 'Technical Review',
      'Environmental_Documents' => 'Environmental Review',
      'Regulatory_Correspondence' => 'Agency Coordination',
      'Signed_Documents' => 'Final Approval',
      'Supporting_Documents' => 'Documentation'
    };
    
    String stage = workflowStages.get(folderName);
    return stage == null ? 'General' : stage;
  }

  private static List<String> getAllowedFileTypes(String folderName) {
    Map<String, List<String>> allowedTypes = new Map<String, List<String>>{
      'Application_Documents' => new List<String>{'PDF', 'DOC', 'DOCX', 'XLS', 'XLSX'},
      'Technical_Plans' => new List<String>{'PDF', 'DWG', 'PNG', 'JPG', 'TIFF', 'CAD'},
      'Environmental_Documents' => new List<String>{'PDF', 'DOC', 'DOCX', 'XLS', 'XLSX'},
      'Regulatory_Correspondence' => new List<String>{'PDF', 'DOC', 'DOCX', 'MSG', 'EML'},
      'Signed_Documents' => new List<String>{'PDF'},
      'Supporting_Documents' => new List<String>{'PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'PNG', 'JPG', 'ZIP'}
    };
    
    List<String> types = allowedTypes.get(folderName);
    return (types == null) ? new List<String>{'PDF', 'DOC', 'DOCX'} : types;
  }

  private static Integer getMaxFileSize(String folderName) {
    // Return max file size in MB
    Map<String, Integer> maxSizes = new Map<String, Integer>{
      'Technical_Plans' => 50, // Larger for CAD/engineering files
      'Environmental_Documents' => 25,
      'Supporting_Documents' => 25
    };
    
    Integer sizeMb = maxSizes.get(folderName);
    return sizeMb == null ? 10 : sizeMb; // Default 10MB
  }

  private static Integer getFolderSortOrder(String folderName) {
    Map<String, Integer> sortOrders = new Map<String, Integer>{
      'Application_Documents' => 1,
      'Technical_Plans' => 2,
      'Environmental_Documents' => 3,
      'Regulatory_Correspondence' => 4,
      'Signed_Documents' => 5,
      'Supporting_Documents' => 6
    };
    
    Integer order = sortOrders.get(folderName);
    return order == null ? 10 : order;
  }

  private static Map<String, Document_Package__c> getDocumentPackageMap(String applicationId) {
    Map<String, Document_Package__c> packageMap = new Map<String, Document_Package__c>();
    
    List<Document_Package__c> packages = [
      SELECT Id, Content_Version_Id__c, Document_Type__c, Status__c, 
             Signer_Role__c, Signature_Date__c, Workflow_Stage__c, Virtual_Folder_Path__c
      FROM Document_Package__c
      WHERE APD_Application__c = :applicationId
    ];
    
    for (Document_Package__c pkg : packages) {
      if (pkg.Content_Version_Id__c != null) {
        packageMap.put(pkg.Content_Version_Id__c, pkg);
      }
    }
    
    return packageMap;
  }

  private static Boolean isSignatureRequired(FolderFilesController.FileWrapper file, String folderName, String permitType) {
    return folderName == 'Signed_Documents' || 
           file.Title.toLowerCase().contains('approval') ||
           file.Title.toLowerCase().contains('signed');
  }

  private static String getComplianceStatus(FolderFilesController.FileWrapper file, String folderName, String agencyType) {
    // Simplified compliance check - in real implementation would be more complex
    if (folderName == 'Signed_Documents') {
      return 'Compliant';
    } else if (folderName == 'Environmental_Documents') {
      return 'Under Review';
    }
    return 'Pending Review';
  }

  private static void validatePermitDocumentPlacement(String documentType, String folderName, String agencyType, String permitType) {
    // Define valid folder-document type combinations (customizable by agency/permit type)
    Map<String, Set<String>> validCombinations = new Map<String, Set<String>>{
      'Application_Documents' => new Set<String>{'APPLICATION_FORM', 'PERMIT_REQUEST', 'APPLICANT_INFO'},
      'Technical_Plans' => new Set<String>{'TECHNICAL_PLAN', 'ENGINEERING_DRAWING', 'SPECIFICATIONS'},
      'Environmental_Documents' => new Set<String>{'ENVIRONMENTAL_ASSESSMENT', 'IMPACT_STUDY', 'MITIGATION_PLAN'},
      'Regulatory_Correspondence' => new Set<String>{'AGENCY_LETTER', 'RESPONSE', 'CONSULTATION'},
      'Signed_Documents' => new Set<String>{'APPROVAL', 'PERMIT', 'CERTIFICATION', 'SIGNATURE'},
      'Supporting_Documents' => new Set<String>{'REFERENCE_DOC', 'ADDITIONAL_INFO', 'SUPPLEMENT'}
    };

    if (validCombinations.containsKey(folderName) && 
        !validCombinations.get(folderName).contains(documentType)) {
      throw new AuraHandledException('Document type "' + documentType + '" is not allowed in folder "' + folderName + '"');
    }
  }

  private static String generateFullFileName(String folderName, String fileName) {
    return (String.isBlank(folderName) || folderName == 'Application_Documents') ? 
           fileName : folderName + '/' + fileName;
  }

  private static String generateVirtualFolderPath(String applicationId, String folderName) {
    return '/Permits/' + applicationId + '/' + folderName;
  }

  private static void logPermitDocumentActivity(String applicationId, String contentVersionId, String activityType, String message, String agencyType) {
    try {
      Schema.SObjectType sType = Schema.getGlobalDescribe().get('Stakeholder_Communication__c');
      if (sType == null) {
        return; // Object not present in org; skip logging
      }
      SObject activity = sType.newSObject();
      activity.put('APD_Application__c', applicationId);
      activity.put('Communication_Type__c', 'Document Activity');
      activity.put('Message__c', message);
      activity.put('Stakeholder__c', UserInfo.getUserId());
      activity.put('Communication_Date__c', System.now());
      activity.put('Related_Content_Version__c', contentVersionId);
      activity.put('Activity_Type__c', activityType);
      activity.put('Agency_Type__c', agencyType);
      insert activity;
    } catch (Exception e) {
      System.debug('Skipping document activity log: ' + e.getMessage());
    }
  }

  private static void checkWorkflowCompletion(SObject application, String documentType, String folderName, String agencyType) {
    // Check if required documents are now complete and advance workflow if needed
    // This would be expanded based on specific permit workflow requirements
  }

  private static List<String> getNextRequiredDocuments(SObject application, String completedDocumentType, String agencyType, String permitType) {
    List<String> nextDocs = new List<String>();
    
    // Generic next document logic based on permit type
    if (completedDocumentType == 'APPLICATION_FORM') {
      nextDocs.add('Technical plans and specifications');
      if (permitType == 'Environmental' || permitType == 'Drilling') {
        nextDocs.add('Environmental assessment documentation');
      }
    }
    
    return nextDocs;
  }

  private static void validatePermitDocumentMove(String applicationId, String contentVersionId, String currentFolder, String targetFolder, String agencyType) {
    // Add business logic to validate document moves based on workflow state and agency rules
    try {
      SObject application = getApplicationRecord(applicationId);
      
      // Example: Don't allow moving signed documents once application is approved
      String status = (String) application.get('Status__c');
      if (status == 'Approved' && currentFolder == 'Signed_Documents') {
        throw new AuraHandledException('Cannot move signed documents after application approval');
      }
    } catch (Exception e) {
      System.debug('Error validating document move: ' + e.getMessage());
    }
  }

  // Wrapper classes
  public class PermitFolderWrapper implements Comparable {
    @AuraEnabled public String name;
    @AuraEnabled public Integer fileCount;
    @AuraEnabled public PermitFolderMetadata metadata;
    @AuraEnabled public String agencyType;
    @AuraEnabled public String permitType;

    public Integer compareTo(Object compareTo) {
      PermitFolderWrapper other = (PermitFolderWrapper) compareTo;
      return this.metadata.sortOrder - other.metadata.sortOrder;
    }
  }

  public class PermitFolderMetadata {
    @AuraEnabled public String description;
    @AuraEnabled public Boolean isRequired;
    @AuraEnabled public String workflowStage;
    @AuraEnabled public List<String> allowedFileTypes;
    @AuraEnabled public Integer maxFileSize;
    @AuraEnabled public Integer sortOrder;
    @AuraEnabled public String agencyType;
    @AuraEnabled public String permitType;
  }

  public class PermitFileWrapper {
    @AuraEnabled public String id;
    @AuraEnabled public String contentDocumentId;
    @AuraEnabled public String title;
    @AuraEnabled public String fileType;
    @AuraEnabled public Long contentSize;
    @AuraEnabled public Datetime contentModifiedDate;
    @AuraEnabled public String documentType;
    @AuraEnabled public String status;
    @AuraEnabled public String signerRole;
    @AuraEnabled public Datetime signatureDate;
    @AuraEnabled public String workflowStage;
    @AuraEnabled public String virtualFolderPath;
    @AuraEnabled public Boolean isSignatureRequired;
    @AuraEnabled public String complianceStatus;
    @AuraEnabled public String agencyType;
    @AuraEnabled public String permitType;
  }

  /**
   * Determines the appropriate AI operation based on document characteristics
   * @param documentType The permit document type
   * @param folderName The folder where document is stored
   * @param fileType The file extension/type
   * @return AI operation type string
   */
  private static String determineAIOperation(String documentType, String folderName, String fileType) {
    // Visual/Image documents require OCR/Image Analysis
    Set<String> visualDocTypes = new Set<String>{
      'SITE_PLAN', 'TECHNICAL_DRAWING', 'CROSS_SECTION', 'SURFACE_LAYOUT',
      'ENGINEERING_DRAWING', 'MAP', 'AERIAL_PHOTO', 'SURVEY_PLAT'
    };
    
    Set<String> imageFileTypes = new Set<String>{'PNG', 'JPG', 'JPEG', 'TIFF', 'GIF', 'BMP'};
    
    if (visualDocTypes.contains(documentType) || imageFileTypes.contains(fileType.toUpperCase())) {
      return 'IMAGE_ANALYSIS';
    }
    
    // Environmental documents need specialized analysis
    if (folderName.contains('Environmental') || documentType.contains('ENVIRONMENTAL')) {
      return 'ENVIRONMENTAL_ANALYSIS';
    }
    
    // Application forms and permits need field extraction
    Set<String> formDocTypes = new Set<String>{
      'APD_FORM', 'APPLICATION_FORM', 'PERMIT_REQUEST', 'LEASE_AGREEMENT'
    };
    
    if (formDocTypes.contains(documentType)) {
      return 'FIELD_EXTRACTION';
    }
    
    // Regulatory documents need compliance checking
    if (folderName.contains('Regulatory') || folderName.contains('Signed')) {
      return 'COMPLIANCE_CHECK';
    }
    
    // Default to general document analysis
    return 'DOCUMENT_ANALYSIS';
  }

  public class PermitUploadResult {
    @AuraEnabled public String contentVersionId;
    @AuraEnabled public String documentPackageId;
    @AuraEnabled public String message;
    @AuraEnabled public List<String> nextRequiredDocuments;
    
    // AI Analysis Results
    @AuraEnabled public Boolean aiAnalysisComplete = false;
    @AuraEnabled public Decimal aiConfidence;
    @AuraEnabled public List<String> aiRecommendations;
    @AuraEnabled public Map<String, Object> extractedData;

    public PermitUploadResult(String cvId, String dpId, String msg, List<String> nextDocs) {
      this.contentVersionId = cvId;
      this.documentPackageId = dpId;
      this.message = msg;
      this.nextRequiredDocuments = nextDocs;
    }
  }
}
