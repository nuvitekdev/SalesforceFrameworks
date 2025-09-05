public with sharing class Nuvi_Permit_DocumentController {
  
  /**
   * Gets the predefined permit folder structure for a permit application
   * @param applicationId The ID of the permit application
   * @param agencyType The type of agency (DOI, EPA, State, Local, etc.)
   * @param permitType The type of permit (Drilling, Environmental, Building, etc.)
   * @return List of permit-specific folder wrappers
   */
  @AuraEnabled(cacheable=true)
  public static List<PermitFolderWrapper> getPermitFolders(
    String applicationId, 
    String agencyType, 
    String permitType
  ) {
    List<PermitFolderWrapper> permitFolders = new List<PermitFolderWrapper>();
    
    if (String.isBlank(applicationId)) {
      return permitFolders;
    }

    // Get application details to determine folder structure
    SObject application = getApplicationRecord(applicationId);
    if (application == null) {
      return permitFolders;
    }

    // Get all files for the application record
    List<FolderFilesController.FileWrapper> allFiles = FolderFilesController.getRecordFiles(applicationId);
    
    // Get permit-specific predefined folders
    List<String> permitFolderPaths = getPermitPredefinedFolders(agencyType, permitType, application);
    
    // Initialize folder map
    Map<String, List<FolderFilesController.FileWrapper>> folderMap = new Map<String, List<FolderFilesController.FileWrapper>>();
    Map<String, PermitFolderMetadata> folderMetadataMap = new Map<String, PermitFolderMetadata>();
    
    // Initialize all permit folders
    for (String folderPath : permitFolderPaths) {
      String topLevelFolder = folderPath.contains('/') ? folderPath.substringBefore('/') : folderPath;
      
      if (!folderMap.containsKey(topLevelFolder)) {
        folderMap.put(topLevelFolder, new List<FolderFilesController.FileWrapper>());
        folderMetadataMap.put(topLevelFolder, getPermitFolderMetadata(topLevelFolder, agencyType, permitType));
      }
    }

    // Group files by folder
    for (FolderFilesController.FileWrapper file : allFiles) {
      String folderName = 'Application_Documents';
      
      // Check if file name contains folder path notation
      if (file.Title.contains('/')) {
        folderName = file.Title.substringBefore('/');
        file.Title = file.Title.substringAfter('/');
      }
      
      if (!folderMap.containsKey(folderName)) {
        folderMap.put(folderName, new List<FolderFilesController.FileWrapper>());
        folderMetadataMap.put(folderName, getPermitFolderMetadata(folderName, agencyType, permitType));
      }
      
      folderMap.get(folderName).add(file);
    }

    // Create permit folder wrappers
    for (String folderName : folderMap.keySet()) {
      PermitFolderWrapper folder = new PermitFolderWrapper();
      folder.name = folderName;
      folder.fileCount = folderMap.get(folderName).size();
      folder.metadata = folderMetadataMap.get(folderName);
      folder.agencyType = agencyType;
      folder.permitType = permitType;
      permitFolders.add(folder);
    }

    // Sort folders by workflow priority
    permitFolders.sort();
    
    return permitFolders;
  }

  /**
   * Gets files for a specific permit folder with enhanced metadata
   * @param applicationId The application ID
   * @param folderName The folder name
   * @param agencyType The agency type
   * @param permitType The permit type
   * @return List of enhanced file wrappers
   */
  @AuraEnabled(cacheable=true)
  public static List<PermitFileWrapper> getPermitFolderFiles(
    String applicationId, 
    String folderName,
    String agencyType,
    String permitType
  ) {
    List<PermitFileWrapper> permitFiles = new List<PermitFileWrapper>();
    
    if (String.isBlank(applicationId)) {
      return permitFiles;
    }

    // Get basic files from shared controller
    List<FolderFilesController.FileWrapper> basicFiles = FolderFilesController.getFolderFiles(applicationId, folderName);
    
    // Get Document Package records for additional metadata
    Map<String, Document_Package__c> docPackageMap = getDocumentPackageMap(applicationId);

    // Enhance files with permit-specific metadata
    for (FolderFilesController.FileWrapper basicFile : basicFiles) {
      PermitFileWrapper permitFile = new PermitFileWrapper();
      permitFile.id = basicFile.Id;
      permitFile.contentDocumentId = basicFile.ContentDocumentId;
      permitFile.title = basicFile.Title;
      permitFile.fileType = basicFile.FileType;
      permitFile.contentSize = basicFile.ContentSize;
      permitFile.contentModifiedDate = basicFile.ContentModifiedDate;
      permitFile.agencyType = agencyType;
      permitFile.permitType = permitType;
      
      // Add permit-specific metadata
      Document_Package__c docPackage = docPackageMap.get(basicFile.Id);
      if (docPackage != null) {
        permitFile.documentType = docPackage.Document_Type__c;
        permitFile.status = docPackage.Status__c;
        permitFile.signerRole = docPackage.Signer_Role__c;
        permitFile.signatureDate = docPackage.Signature_Date__c;
        permitFile.workflowStage = docPackage.Workflow_Stage__c;
        permitFile.virtualFolderPath = docPackage.Virtual_Folder_Path__c;
      }
      
      permitFile.isSignatureRequired = isSignatureRequired(basicFile, folderName, permitType);
      permitFile.complianceStatus = getComplianceStatus(basicFile, folderName, agencyType);
      
      permitFiles.add(permitFile);
    }
    
    return permitFiles;
  }

  /**
   * Uploads a file to permit-specific folder with enhanced tracking and AI processing
   * @param applicationId The application ID
   * @param folderName The folder name
   * @param fileName The file name
   * @param base64Data The base64 encoded file data
   * @param contentType The file content type
   * @param documentType The permit document type
   * @param workflowStage The current workflow stage
   * @param agencyType The agency type
   * @param permitType The permit type
   * @return PermitUploadResult with upload details and AI analysis
   */
  @AuraEnabled
  public static PermitUploadResult uploadPermitFile(
    String applicationId,
    String folderName,
    String fileName,
    String base64Data,
    String contentType,
    String documentType,
    String workflowStage,
    String agencyType,
    String permitType
  ) {
    if (String.isBlank(applicationId) || String.isBlank(fileName)) {
      throw new AuraHandledException('Application ID and file name are required');
    }

    try {
      // Validate application exists and user has access
      SObject application = getApplicationRecord(applicationId);
      if (application == null) {
        throw new AuraHandledException('Application record not found');
      }

      // Validate document type and folder combination
      validatePermitDocumentPlacement(documentType, folderName, agencyType, permitType);

      // Upload file using parent class method
      FolderFilesController.uploadFileToFolder(applicationId, folderName, fileName, base64Data, contentType);

      // Get the newly created ContentVersion
      ContentVersion newFile = [
        SELECT Id, ContentDocumentId, Title, FileType
        FROM ContentVersion
        WHERE Title = :generateFullFileName(folderName, fileName)
        AND FirstPublishLocationId = :applicationId
        ORDER BY CreatedDate DESC
        LIMIT 1
      ];

      // Create Document Package record for tracking
      if (!Schema.sObjectType.Document_Package__c.isCreateable()) {
        throw new AuraHandledException('Insufficient access to create Document Package');
      }
      Document_Package__c docPackage = new Document_Package__c(
        APD_Application__c = applicationId, // Make this generic field name
        Content_Version_Id__c = newFile.Id,
        Document_Type__c = documentType,
        Status__c = 'Uploaded',
        Virtual_Folder_Path__c = generateVirtualFolderPath(applicationId, folderName),
        Workflow_Stage__c = workflowStage,
        Submission_Date__c = System.now(),
        Agency_Type__c = agencyType,
        Permit_Type__c = permitType
      );
      insert (Document_Package__c) Security.stripInaccessible(AccessType.CREATABLE, new List<SObject>{ docPackage }).getRecords()[0];

      // **AI PROCESSING: Automatically analyze uploaded document**
      Nuvi_Permit_AIService.PermitAIResult aiResult = null;
      try {
        // Determine AI operation based on document type and folder
        String aiOperation = determineAIOperation(documentType, folderName, newFile.FileType);
        
        // Process document with AI
        aiResult = Nuvi_Permit_AIService.processPermitDocument(
          newFile.Id,
          aiOperation,
          documentType,
          permitType,
          agencyType
        );
        
        // Update document package with AI results
        if (!Schema.sObjectType.Document_Package__c.isUpdateable()) {
          throw new AuraHandledException('Insufficient access to update Document Package');
        }
        docPackage.AI_Confidence_Score__c = aiResult.confidence;
        docPackage.AI_Risk_Score__c = aiResult.riskScore;
        docPackage.AI_Analysis_Status__c = 'Completed';
        docPackage.AI_Recommendations__c = String.join(aiResult.recommendations, '; ');
        update (Document_Package__c) Security.stripInaccessible(AccessType.UPDATABLE, new List<SObject>{ docPackage }).getRecords()[0];
        
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
    if (permitType == 'Drilling' || permitType == 'Oil_Gas' || permitType == 'DRILLING') {
      folders.addAll(new List<String>{
        'Technical_Plans/Drilling_Plans',
        'Technical_Plans/Drilling_Plans/Narrative',
        'Technical_Plans/Drilling_Plans/Casing',
        'Technical_Plans/Drilling_Plans/Cement',
        'Technical_Plans/Drilling_Plans/Mud',
        'Technical_Plans/Drilling_Plans/BOP',
        'Technical_Plans/Safety_Equipment',
        'Environmental_Documents/NEPA_Assessment',
        'Environmental_Documents/Cultural_Resources',
        'Environmental_Documents/Wildlife_Surveys',
        'Environmental_Documents/Water_Resources',
        'SUPO/Narrative',
        'SUPO/Existing_Roads',
        'SUPO/New_Roads',
        'SUPO/Facilities',
        'SUPO/Water',
        'SUPO/Reclamation',
        'SUPO/Cultural',
        'SUPO/Wildlife'
      });
    } else if (permitType == 'Environmental' || permitType == 'ENVIRONMENTAL') {
      folders.addAll(new List<String>{
        'Environmental_Documents/Impact_Assessment',
        'Environmental_Documents/Mitigation_Plans',
        'Environmental_Documents/Monitoring_Plans'
      });
    } else if (permitType == 'Building' || permitType == 'CONSTRUCTION' || permitType == 'BUILDING') {
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
      'Technical_Plans' => new List<String>{'PDF', 'DWG', 'DXF', 'PNG', 'JPG', 'TIFF', 'CAD', 'SHP', 'SHX', 'DBF', 'PRJ', 'KML', 'KMZ'},
      'Environmental_Documents' => new List<String>{'PDF', 'DOC', 'DOCX', 'XLS', 'XLSX', 'SHP', 'SHX', 'DBF', 'PRJ', 'KML', 'KMZ'},
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
      'Technical_Plans' => 100, // Larger for CAD/GIS files
      'Environmental_Documents' => 50,
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
      'Application_Documents' => new Set<String>{'APPLICATION_FORM', 'PERMIT_REQUEST', 'APPLICANT_INFO', 'APD_FORM'},
      'Technical_Plans' => new Set<String>{'TECHNICAL_PLAN', 'ENGINEERING_DRAWING', 'SPECIFICATIONS', 'WELL_PLAN', 'SURFACE_LAYOUT', 'CROSS_SECTION'},
      'Technical_Plans/Drilling_Plans' => new Set<String>{'WELL_PLAN', 'APD_FORM'},
      'Technical_Plans/Drilling_Plans/Narrative' => new Set<String>{'WELL_PLAN'},
      'Technical_Plans/Drilling_Plans/Casing' => new Set<String>{'CASING_PROGRAM'},
      'Technical_Plans/Drilling_Plans/Cement' => new Set<String>{'CEMENT_PROGRAM'},
      'Technical_Plans/Drilling_Plans/Mud' => new Set<String>{'MUD_PROGRAM'},
      'Technical_Plans/Drilling_Plans/BOP' => new Set<String>{'BOP_PROGRAM'},
      'Environmental_Documents' => new Set<String>{'ENVIRONMENTAL_ASSESSMENT', 'IMPACT_STUDY', 'MITIGATION_PLAN', 'EA_DOCUMENT', 'FONSI', 'CULTURAL_SURVEY', 'WILDLIFE_STUDY'},
      'SUPO/Narrative' => new Set<String>{'SUPO_NARRATIVE'},
      'SUPO/Existing_Roads' => new Set<String>{'ROAD_PLAN'},
      'SUPO/New_Roads' => new Set<String>{'ROAD_PLAN'},
      'SUPO/Facilities' => new Set<String>{'FACILITIES_LAYOUT'},
      'SUPO/Water' => new Set<String>{'WATER_SOURCE'},
      'SUPO/Reclamation' => new Set<String>{'RECLAMATION_PLAN'},
      'SUPO/Cultural' => new Set<String>{'CULTURAL_SURVEY'},
      'SUPO/Wildlife' => new Set<String>{'WILDLIFE_STUDY'},
      'Regulatory_Correspondence' => new Set<String>{'AGENCY_LETTER', 'RESPONSE', 'CONSULTATION'},
      'Signed_Documents' => new Set<String>{'APPROVAL', 'PERMIT', 'CERTIFICATION', 'SIGNATURE', 'APD_APPROVAL', 'OPERATOR_ACK'},
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