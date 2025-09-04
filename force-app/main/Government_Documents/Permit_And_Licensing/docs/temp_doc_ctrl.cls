        Workflow_Stage__c = workflowStage,
        Submission_Date__c = System.now(),
        Agency_Type__c = agencyType,
        Permit_Type__c = permitType
      );
      insert docPackage;

      // **AI PROCESSING: Automatically analyze uploaded document**
      PermitAIService.PermitAIResult aiResult = null;
      try {
        // Determine AI operation based on document type and folder
        String aiOperation = determineAIOperation(documentType, folderName, newFile.FileType);
        
        // Process document with AI
        aiResult = PermitAIService.processPermitDocument(
          newFile.Id,
          aiOperation,
          documentType,
          permitType,
          agencyType
        );
        
        // Update document package with AI results
        docPackage.AI_Confidence_Score__c = aiResult.confidence;
        docPackage.AI_Risk_Score__c = aiResult.riskScore;
        docPackage.AI_Analysis_Status__c = 'Completed';
        docPackage.AI_Recommendations__c = String.join(aiResult.recommendations, '; ');
        update docPackage;
        
      } catch (Exception aiError) {
        System.debug('AI processing error: ' + aiError.getMessage());
        // Update status to indicate AI processing failed
        docPackage.AI_Analysis_Status__c = 'Failed';
        docPackage.AI_Processing_Error__c = aiError.getMessage();
        update docPackage;
      }

      // Log upload activity
      logPermitDocumentActivity(applicationId, newFile.Id, 'FILE_UPLOADED', 
        'File uploaded: ' + fileName + ' to folder: ' + folderName + 
        (aiResult != null ? ' (AI Analyzed)' : ''), agencyType);

      // Check if this completes any workflow requirements
      checkWorkflowCompletion(application, documentType, folderName, agencyType);

      // Enhanced result with AI insights
      PermitUploadResult result = new PermitUploadResult(
        newFile.Id,
        docPackage.Id,
        'File uploaded successfully to ' + folderName + 
        (aiResult != null ? ' and analyzed with AI' : ''),
        getNextRequiredDocuments(application, documentType, agencyType, permitType)
      );
      
      // Add AI insights to result
      if (aiResult != null) {
        result.aiAnalysisComplete = true;
        result.aiConfidence = aiResult.confidence;
        result.aiRecommendations = aiResult.recommendations;
        result.extractedData = aiResult.extractedData;
      }

      return result;

    } catch (Exception e) {
      System.debug('Error in uploadPermitFile: ' + e.getMessage());
      throw new AuraHandledException('Failed to upload permit file: ' + e.getMessage());
    }
  }

  /**
   * Creates permit-specific folder structure for a new application
   * @param applicationId The application ID
   * @param agencyType The agency type
   * @param permitType The permit type
   * @return List of created folder names
   */
  @AuraEnabled
  public static List<String> createPermitFolderStructure(
    String applicationId, 
    String agencyType, 
    String permitType
  ) {
    if (String.isBlank(applicationId)) {
      throw new AuraHandledException('Application ID is required');
    }

    try {
      SObject application = getApplicationRecord(applicationId);
      if (application == null) {
        throw new AuraHandledException('Application record not found');
      }

      List<String> createdFolders = getPermitPredefinedFolders(agencyType, permitType, application);

      // Log folder structure creation
      logPermitDocumentActivity(applicationId, null, 'FOLDER_STRUCTURE_CREATED',
        'Permit folder structure created for ' + permitType + ' permit', agencyType);

      return createdFolders;

    } catch (Exception e) {
      throw new AuraHandledException('Failed to create permit folder structure: ' + e.getMessage());
    }
  }

  /**
   * Moves a document from one permit folder to another with workflow validation
   * @param applicationId The application ID
   * @param contentVersionId The file to move
   * @param targetFolderName The destination folder
   * @param reason The reason for the move
   * @param agencyType The agency type
   */
  @AuraEnabled
  public static void movePermitDocument(
    String applicationId,
    String contentVersionId,
    String targetFolderName,
    String reason,
    String agencyType
  ) {
    if (String.isBlank(applicationId) || String.isBlank(contentVersionId) || String.isBlank(targetFolderName)) {
      throw new AuraHandledException('Application ID, Content Version ID, and target folder are required');
    }

    try {
      // Get current file information
      ContentVersion file = [
        SELECT Id, Title, ContentDocumentId
        FROM ContentVersion
        WHERE Id = :contentVersionId
        LIMIT 1
      ];

      // Extract current folder from title
      String currentFolder = file.Title.contains('/') ? file.Title.substringBefore('/') : 'Application_Documents';
      String fileName = file.Title.contains('/') ? file.Title.substringAfter('/') : file.Title;

      // Validate the move is allowed
      validatePermitDocumentMove(applicationId, contentVersionId, currentFolder, targetFolderName, agencyType);

      // Update the file title with new folder path
      String newTitle = targetFolderName.equals('Application_Documents') ? 
        fileName : targetFolderName + '/' + fileName;
      
      file.Title = newTitle;
      update file;

      // Update Document Package record if it exists
      List<Document_Package__c> docPackages = [
        SELECT Id, Virtual_Folder_Path__c
        FROM Document_Package__c
        WHERE Content_Version_Id__c = :contentVersionId
        LIMIT 1
      ];

      if (!docPackages.isEmpty()) {
        docPackages[0].Virtual_Folder_Path__c = generateVirtualFolderPath(applicationId, targetFolderName);
        update docPackages[0];
      }

      // Log the move
      logPermitDocumentActivity(applicationId, contentVersionId, 'DOCUMENT_MOVED',
        'Document moved from ' + currentFolder + ' to ' + targetFolderName + '. Reason: ' + reason, agencyType);

    } catch (Exception e) {
      throw new AuraHandledException('Failed to move permit document: ' + e.getMessage());
    }
  }

  // Private helper methods - made generic for any agency/permit type

  private static SObject getApplicationRecord(String applicationId) {
    try {
      Id appId = Id.valueOf(applicationId);
      String objectType = appId.getSObjectType().getDescribe().getName();
      
      String query = 'SELECT Id, Name FROM ' + objectType + ' WHERE Id = :applicationId LIMIT 1';
      List<SObject> applications = Database.query(query);
      
      return applications.isEmpty() ? null : applications[0];
    } catch (Exception e) {
      System.debug('Error getting application record: ' + e.getMessage());
      return null;
    }
  }

  private static List<String> getPermitPredefinedFolders(String agencyType, String permitType, SObject application) {
    List<String> folders = new List<String>();
    
    // Base folders for all permit types
    folders.addAll(new List<String>{
      'Application_Documents',
      'Technical_Plans',
      'Environmental_Documents',
      'Regulatory_Correspondence',
      'Signed_Documents',
      'Supporting_Documents'
    });

    // Add permit-type specific folders
    if (permitType == 'Drilling' || permitType == 'Oil_Gas') {
      folders.addAll(new List<String>{
        'Technical_Plans/Drilling_Plans',
        'Technical_Plans/Safety_Equipment',
        'Environmental_Documents/NEPA_Assessment',
        'Environmental_Documents/Cultural_Resources'
      });
    } else if (permitType == 'Environmental') {
      folders.addAll(new List<String>{
        'Environmental_Documents/Impact_Assessment',
        'Environmental_Documents/Mitigation_Plans',
        'Environmental_Documents/Monitoring_Plans'
      });
    } else if (permitType == 'Building') {
      folders.addAll(new List<String>{
        'Technical_Plans/Architectural_Plans',
        'Technical_Plans/Engineering_Plans',
        'Technical_Plans/Site_Plans'
      });
    }

    // Add agency-specific folders
    if (agencyType == 'DOI') {
      folders.add('Signed_Documents/BLM_Approvals');
      folders.add('Environmental_Documents/NEPA_Documents');
    } else if (agencyType == 'EPA') {
      folders.add('Environmental_Documents/EPA_Requirements');
      folders.add('Regulatory_Correspondence/EPA_Coordination');
    }

    return folders;
  }

  private static PermitFolderMetadata getPermitFolderMetadata(String folderName, String agencyType, String permitType) {
    PermitFolderMetadata metadata = new PermitFolderMetadata();
    metadata.description = getFolderDescription(folderName, agencyType, permitType);
    metadata.isRequired = isRequiredFolder(folderName, agencyType, permitType);
    metadata.workflowStage = getFolderWorkflowStage(folderName);
    metadata.allowedFileTypes = getAllowedFileTypes(folderName);
    metadata.maxFileSize = getMaxFileSize(folderName);
    metadata.sortOrder = getFolderSortOrder(folderName);
    metadata.agencyType = agencyType;
    metadata.permitType = permitType;
    
    return metadata;
  }

  private static String getFolderDescription(String folderName, String agencyType, String permitType) {
    Map<String, String> descriptions = new Map<String, String>{
      'Application_Documents' => 'Core application forms and initial submission documents',
      'Technical_Plans' => 'Technical specifications, plans, and engineering documents',
      'Environmental_Documents' => 'Environmental assessments, compliance reports, and impact studies',
      'Regulatory_Correspondence' => 'Communications with regulatory agencies and responses to requests',
      'Signed_Documents' => 'Digitally signed approvals, permits, and official decisions',
      'Supporting_Documents' => 'Additional supporting materials and reference documents'
    };
    
    String baseDescription = descriptions.get(folderName);
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
