public with sharing class Nuvi_Permit_SignatureController {
  
  @AuraEnabled(cacheable=false)
  public static PermitSignatureResult savePermitSignedDocument(
    String base64Data,
    String fileName,
    String applicationId,
    String documentType,
    String signerRole,
    String workflowStage,
    String agencyType,
    String permitType
  ) {
    if (base64Data == null) {
      throw new AuraHandledException('No PDF data received');
    }

    if (applicationId == null) {
      throw new AuraHandledException('Application ID is required');
    }

    // Validate application exists and get current status
    SObject application = getApplicationRecord(applicationId, agencyType);
    if (application == null) {
      throw new AuraHandledException('Application not found');
    }

    // Validate signer role and document type combination
    validateSignaturePermissions(documentType, signerRole, getApplicationStatus(application), agencyType, permitType);

    // Generate appropriate file name based on document type and application
    String generatedFileName = generatePermitDocumentFileName(
      fileName, 
      documentType, 
      getApplicationNumber(application),
      getApplicationName(application),
      agencyType
    );

    try {
      // Save the signed PDF using parent class method
      Id contentVersionId = saveSignedPdf(
        base64Data,
        generatedFileName,
        applicationId,
        false // Not temporary
      );

      // Create Document Package record for tracking
      if (!Schema.sObjectType.Document_Package__c.isCreateable()) {
        throw new AuraHandledException('Insufficient access to create Document Package');
      }
      Document_Package__c docPackage = new Document_Package__c(
        APD_Application__c = applicationId, // Make this generic
        Document_Type__c = documentType,
        Content_Version_Id__c = contentVersionId,
        Signer_Role__c = signerRole,
        Workflow_Stage__c = workflowStage,
        Signature_Date__c = System.now(),
        Status__c = 'Signed',
        Virtual_Folder_Path__c = generateVirtualFolderPath(getApplicationNumber(application), documentType),
        Agency_Type__c = agencyType,
        Permit_Type__c = permitType
      );
      insert (Document_Package__c) Security.stripInaccessible(AccessType.CREATABLE, new List<SObject>{ docPackage }).getRecords()[0];

      // Update application workflow based on document type and signer role
      updatePermitWorkflowStatus(application, documentType, signerRole, workflowStage, agencyType);

      // Log the signature event
      logSignatureEvent(applicationId, contentVersionId, documentType, signerRole, agencyType);

      // Trigger next workflow steps if applicable
      triggerNextWorkflowSteps(application, documentType, signerRole, agencyType, permitType);

      return new PermitSignatureResult(
        contentVersionId,
        docPackage.Id,
        generatedFileName,
        'Signature completed successfully',
        getNextRequiredSignatures(application, documentType, agencyType, permitType)
      );

    } catch (Exception e) {
      System.debug('Error in savePermitSignedDocument: ' + e.getMessage());
      throw new AuraHandledException('Failed to save permit signed document: ' + e.getMessage());
    }
  }

  @AuraEnabled(cacheable=false)
  public static List<PermitDocumentSignature> getPendingPermitSignatures(
    String applicationId,
    String agencyType,
    String permitType
  ) {
    if (String.isBlank(applicationId)) {
      throw new AuraHandledException('Application ID is required');
    }

    List<PermitDocumentSignature> pendingSignatures = new List<PermitDocumentSignature>();

    try {
      SObject application = getApplicationRecord(applicationId, agencyType);
      if (application == null) {
        throw new AuraHandledException('Application not found');
      }

      String applicationStatus = getApplicationStatus(application);
      Boolean needsEnvironmentalReview = needsEnvironmentalReview(application, agencyType, permitType);

      // Get existing signatures for this application
      List<Document_Package__c> existingSignatures = [
        SELECT Id, Document_Type__c, Status__c, Signer_Role__c, Workflow_Stage__c
        FROM Document_Package__c 
        WHERE APD_Application__c = :applicationId
        AND Status__c IN ('Pending', 'In Review', 'Signed')
      ];

      // Determine required signatures based on application status and agency requirements
      pendingSignatures.addAll(determineRequiredSignatures(
        application, 
        existingSignatures, 
        agencyType, 
        permitType
      ));

      return pendingSignatures;

    } catch (Exception e) {
      System.debug('Error in getPendingPermitSignatures: ' + e.getMessage());
      throw new AuraHandledException('Failed to retrieve pending signatures: ' + e.getMessage());
    }
  }

  @AuraEnabled(cacheable=false)
  public static PermitSignatureValidation validatePermitSignaturePermissions(
    String applicationId,
    String documentType,
    String signerRole,
    String agencyType
  ) {
    try {
      SObject application = getApplicationRecord(applicationId, agencyType);
      if (application == null) {
        throw new AuraHandledException('Application not found');
      }

      Id currentUserId = UserInfo.getUserId();
      
      // Check if user has required role for this signature type
      Boolean hasPermission = checkUserSignaturePermissions(currentUserId, signerRole, application, agencyType);
      
      String message = hasPermission ? 
        'User authorized for signature type: ' + signerRole :
        'User not authorized for signature type: ' + signerRole;

      List<String> requiredSteps = getRequiredSignatureSteps(application, documentType, agencyType);

      return new PermitSignatureValidation(hasPermission, message, requiredSteps);

    } catch (Exception e) {
      System.debug('Error in validatePermitSignaturePermissions: ' + e.getMessage());
      throw new AuraHandledException('Failed to validate signature permissions: ' + e.getMessage());
    }
  }

  // Core PDF storage method
  private static Id saveSignedPdf(String base64Data, String fileName, String recordId, Boolean isTemporary) {
    try {
      // Create ContentVersion
      ContentVersion contentVersion = new ContentVersion(
        Title = fileName,
        PathOnClient = fileName,
        VersionData = EncodingUtil.base64Decode(base64Data),
        ContentLocation = 'S'
      );
      
      insert contentVersion;
      
      // Get ContentDocument Id
      ContentVersion cv = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :contentVersion.Id];
      
      // Create ContentDocumentLink to associate with record
      if (!isTemporary && String.isNotBlank(recordId)) {
        ContentDocumentLink cdl = new ContentDocumentLink(
          LinkedEntityId = recordId,
          ContentDocumentId = cv.ContentDocumentId,
          ShareType = 'V'
        );
        insert cdl;
      }
      
      return contentVersion.Id;
    } catch (Exception e) {
      System.debug('Error saving PDF: ' + e.getMessage());
      throw new AuraHandledException('Failed to save PDF document: ' + e.getMessage());
    }
  }

  // Private helper methods - made generic for any agency/permit type

  private static SObject getApplicationRecord(String applicationId, String agencyType) {
    try {
      Id appId = Id.valueOf(applicationId);
      String objectType = appId.getSObjectType().getDescribe().getName();
      
      // Build dynamic query based on object type
      Set<String> fieldsToQuery = new Set<String>{'Id', 'Name'};
      
      // Add common status field if it exists
      if (hasField(objectType, 'Status__c')) {
        fieldsToQuery.add('Status__c');
      }
      
      // Add application number field variations
      if (hasField(objectType, 'Application_Number__c')) {
        fieldsToQuery.add('Application_Number__c');
      }
      
      // Add assigned reviewer if exists
      if (hasField(objectType, 'Assigned_Reviewer__c')) {
        fieldsToQuery.add('Assigned_Reviewer__c');
      }
      
      String query = 'SELECT ' + String.join(new List<String>(fieldsToQuery), ', ') + 
                     ' FROM ' + objectType + ' WHERE Id = :applicationId LIMIT 1';
      
      List<SObject> applications = Database.query(query);
      return applications.isEmpty() ? null : applications[0];
    } catch (Exception e) {
      System.debug('Error getting application record: ' + e.getMessage());
      return null;
    }
  }

  private static Boolean hasField(String objectType, String fieldName) {
    try {
      Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectType);
      if (sObjType != null) {
        Map<String, Schema.SObjectField> fieldMap = sObjType.getDescribe().fields.getMap();
        return fieldMap.containsKey(fieldName);
      }
      return false;
    } catch (Exception e) {
      return false;
    }
  }

  private static String getApplicationStatus(SObject application) {
    try {
      return (String) application.get('Status__c');
    } catch (Exception e) {
      return 'Unknown';
    }
  }

  private static String getApplicationNumber(SObject application) {
    try {
      if (application.get('Application_Number__c') != null) {
        return (String) application.get('Application_Number__c');
      }
      return (String) application.get('Name');
    } catch (Exception e) {
      return String.valueOf(application.Id).substring(0, 8);
    }
  }

  private static String getApplicationName(SObject application) {
    try {
      return (String) application.get('Name');
    } catch (Exception e) {
      return 'Permit Application';
    }
  }

  private static void validateSignaturePermissions(String documentType, String signerRole, String applicationStatus, String agencyType, String permitType) {
    // Define valid combinations of document types and signer roles (configurable by agency)
    Map<String, Set<String>> validCombinations = getValidSignatureCombinations(agencyType, permitType);

    if (!validCombinations.containsKey(documentType)) {
      throw new AuraHandledException('Invalid document type: ' + documentType);
    }

    if (!validCombinations.get(documentType).contains(signerRole)) {
      throw new AuraHandledException('Invalid signer role "' + signerRole + '" for document type "' + documentType + '"');
    }

    // Additional validation based on application status
    validateStatusBasedSignature(documentType, applicationStatus, agencyType);
  }

  private static Map<String, Set<String>> getValidSignatureCombinations(String agencyType, String permitType) {
    // Base combinations that work for most agencies
    Map<String, Set<String>> baseCombinations = new Map<String, Set<String>>{
      'INITIAL_REVIEW' => new Set<String>{'MANAGER', 'LEAD_REVIEWER', 'SUPERVISOR'},
      'TECHNICAL_REVIEW' => new Set<String>{'TECHNICAL_SPECIALIST', 'ENGINEER', 'SCIENTIST'},
      'ENVIRONMENTAL_REVIEW' => new Set<String>{'ENVIRONMENTAL_SPECIALIST', 'ENVIRONMENTAL_COORDINATOR'},
      'FINAL_APPROVAL' => new Set<String>{'MANAGER', 'AUTHORIZED_OFFICER', 'DIRECTOR'},
      'APPLICANT_ACKNOWLEDGMENT' => new Set<String>{'APPLICANT_REPRESENTATIVE', 'AUTHORIZED_AGENT'},
      'INSPECTION_REPORT' => new Set<String>{'INSPECTOR', 'FIELD_REPRESENTATIVE'}
    };

    // Customize based on agency type
    if (agencyType == 'DOI') {
      baseCombinations.put('APD_APPROVAL', new Set<String>{'FIELD_OFFICE_MANAGER', 'AUTHORIZED_OFFICER'});
      baseCombinations.put('NEPA_CLEARANCE', new Set<String>{'NEPA_COORDINATOR'});
    } else if (agencyType == 'EPA') {
      baseCombinations.put('ENVIRONMENTAL_PERMIT', new Set<String>{'EPA_SPECIALIST', 'REGIONAL_ADMINISTRATOR'});
      baseCombinations.put('COMPLIANCE_CERTIFICATION', new Set<String>{'COMPLIANCE_OFFICER'});
    }

    return baseCombinations;
  }

  private static void validateStatusBasedSignature(String documentType, String applicationStatus, String agencyType) {
    // Example validation logic - customize per agency
    if (documentType == 'FINAL_APPROVAL' && !applicationStatus.contains('Pending')) {
      throw new AuraHandledException('Application must be in pending status for final approval signature');
    }
  }

  private static String generatePermitDocumentFileName(String originalFileName, String documentType, String applicationNumber, String applicationName, String agencyType) {
    String timestamp = DateTime.now().format('yyyy-MM-dd_HHmm');
    String cleanAppName = applicationName.replaceAll('[^a-zA-Z0-9]', '');
    
    String prefix = getDocumentPrefix(documentType, agencyType);
    
    return prefix + '_' + applicationNumber + '_' + cleanAppName + '_' + timestamp + '_signed.pdf';
  }

  private static String getDocumentPrefix(String documentType, String agencyType) {
    Map<String, String> prefixes = new Map<String, String>{
      'INITIAL_REVIEW' => agencyType + '_InitialReview',
      'TECHNICAL_REVIEW' => agencyType + '_TechnicalReview',
      'ENVIRONMENTAL_REVIEW' => agencyType + '_EnvironmentalReview',
      'FINAL_APPROVAL' => agencyType + '_FinalApproval',
      'APPLICANT_ACKNOWLEDGMENT' => agencyType + '_ApplicantAck',
      'INSPECTION_REPORT' => agencyType + '_Inspection'
    };
    
    return prefixes.get(documentType) != null ? prefixes.get(documentType) : agencyType + '_Document';
  }

  private static String generateVirtualFolderPath(String applicationNumber, String documentType) {
    return '/Permits/' + applicationNumber + '/Signatures/' + documentType;
  }

  private static void updatePermitWorkflowStatus(SObject application, String documentType, String signerRole, String workflowStage, String agencyType) {
    // Update application status based on completed signature
    String currentStatus = getApplicationStatus(application);
    String newStatus = determineNewStatus(currentStatus, documentType, signerRole, agencyType);
    
    if (newStatus != currentStatus && hasField(application.getSObjectType().getDescribe().getName(), 'Status__c')) {
      try {
        application.put('Status__c', newStatus);
        
        // Add decision date if final approval
        if (documentType == 'FINAL_APPROVAL' && hasField(application.getSObjectType().getDescribe().getName(), 'Decision_Date__c')) {
          application.put('Decision_Date__c', Date.today());
        }
        
        update application;
      } catch (Exception e) {
        System.debug('Error updating application status: ' + e.getMessage());
      }
    }
  }

  private static String determineNewStatus(String currentStatus, String documentType, String signerRole, String agencyType) {
    // Generic status progression logic
    if (documentType == 'INITIAL_REVIEW') {
      if (currentStatus == 'Submitted') {
        return 'Under Technical Review';
      }
    } else if (documentType == 'TECHNICAL_REVIEW') {
      if (currentStatus == 'Under Technical Review') {
        return 'Environmental Review';
      }
    } else if (documentType == 'ENVIRONMENTAL_REVIEW') {
      if (currentStatus == 'Environmental Review') {
        return 'Pending Decision';
      }
    } else if (documentType == 'FINAL_APPROVAL') {
      if (currentStatus == 'Pending Decision') {
        return 'Approved';
      }
    }
    
    return currentStatus; // No status change
  }

  private static void logSignatureEvent(String applicationId, Id contentVersionId, String documentType, String signerRole, String agencyType) {
    try {
      Schema.SObjectType sType = Schema.getGlobalDescribe().get('Stakeholder_Communication__c');
      if (sType == null) return;
      SObject communication = sType.newSObject();
      communication.put('APD_Application__c', applicationId);
      communication.put('Communication_Type__c', 'Signature Event');
      communication.put('Message__c', 'Document signed: ' + documentType + ' by role: ' + signerRole + ' (' + agencyType + ')');
      communication.put('Stakeholder__c', UserInfo.getUserId());
      communication.put('Communication_Date__c', System.now());
      communication.put('Related_Content_Version__c', contentVersionId);
      communication.put('Agency_Type__c', agencyType);
      insert communication;
    } catch (Exception e) {
      System.debug('Skipping signature event log: ' + e.getMessage());
    }
  }

  private static void triggerNextWorkflowSteps(SObject application, String documentType, String signerRole, String agencyType, String permitType) {
    try {
      Schema.SObjectType sType = Schema.getGlobalDescribe().get('Workflow_Step__c');
      if (sType == null) return;
      List<SObject> nextSteps = new List<SObject>();

      if (documentType == 'INITIAL_REVIEW') {
        SObject step = sType.newSObject();
        step.put('APD_Application__c', String.valueOf(application.Id));
        step.put('Step_Name__c', 'Technical Review');
        step.put('Status__c', 'Pending');
        step.put('Due_Date__c', Date.today().addDays(14));
        step.put('Description__c', 'Conduct technical review of application');
        step.put('Agency_Type__c', agencyType);
        nextSteps.add(step);
      } else if (documentType == 'TECHNICAL_REVIEW') {
        if (needsEnvironmentalReview(application, agencyType, permitType)) {
          SObject step = sType.newSObject();
          step.put('APD_Application__c', String.valueOf(application.Id));
          step.put('Step_Name__c', 'Environmental Review');
          step.put('Status__c', 'Pending');
          step.put('Due_Date__c', Date.today().addDays(30));
          step.put('Description__c', 'Conduct environmental impact assessment');
          step.put('Agency_Type__c', agencyType);
          nextSteps.add(step);
        }
      } else if (documentType == 'ENVIRONMENTAL_REVIEW') {
        SObject step = sType.newSObject();
        step.put('APD_Application__c', String.valueOf(application.Id));
        step.put('Step_Name__c', 'Final Decision');
        step.put('Status__c', 'Pending');
        step.put('Due_Date__c', Date.today().addDays(15));
        step.put('Description__c', 'Review all documents and make final decision');
        step.put('Agency_Type__c', agencyType);
        nextSteps.add(step);
      }

      if (!nextSteps.isEmpty()) {
        insert nextSteps;
      }
    } catch (Exception e) {
      System.debug('Skipping workflow step creation: ' + e.getMessage());
    }
  }

  private static List<String> getNextRequiredSignatures(SObject application, String completedDocumentType, String agencyType, String permitType) {
    List<String> nextSignatures = new List<String>();

    if (completedDocumentType == 'INITIAL_REVIEW') {
      nextSignatures.add('Technical Review - Specialist signature required');
      if (needsEnvironmentalReview(application, agencyType, permitType)) {
        nextSignatures.add('Environmental Review - Environmental coordinator signature required');
      }
    } else if (completedDocumentType == 'TECHNICAL_REVIEW') {
      if (needsEnvironmentalReview(application, agencyType, permitType)) {
        nextSignatures.add('Environmental Review - Environmental specialist signature required');
      } else {
        nextSignatures.add('Final Approval - Manager signature required');
      }
    } else if (completedDocumentType == 'ENVIRONMENTAL_REVIEW') {
      nextSignatures.add('Final Approval - Authorized officer signature required');
    } else if (completedDocumentType == 'FINAL_APPROVAL') {
      nextSignatures.add('Applicant Acknowledgment - Applicant signature required');
    }

    return nextSignatures;
  }

  private static Boolean needsEnvironmentalReview(SObject application, String agencyType, String permitType) {
    // Determine if environmental review is needed based on permit type and agency
    if (permitType == 'Environmental' || permitType == 'Drilling') {
      return true;
    }
    
    // Check application-specific fields if available
    try {
      if (hasField(application.getSObjectType().getDescribe().getName(), 'Environmental_Review_Required__c')) {
        return (Boolean) application.get('Environmental_Review_Required__c');
      }
    } catch (Exception e) {
      System.debug('Error checking environmental review requirement: ' + e.getMessage());
    }
    
    return false; // Default to no environmental review
  }

  private static List<PermitDocumentSignature> determineRequiredSignatures(
    SObject application, 
    List<Document_Package__c> existingSignatures,
    String agencyType,
    String permitType
  ) {
    List<PermitDocumentSignature> required = new List<PermitDocumentSignature>();
    String applicationStatus = getApplicationStatus(application);
    
    // Determine required signatures based on current status
    if (applicationStatus == 'Submitted') {
      if (!hasSignature(existingSignatures, 'INITIAL_REVIEW', 'MANAGER')) {
        required.add(new PermitDocumentSignature(
          'INITIAL_REVIEW',
          'MANAGER',
          'Initial Application Review',
          'Required for processing to continue',
          1
        ));
      }
    }
    
    if (applicationStatus == 'Under Technical Review') {
      if (!hasSignature(existingSignatures, 'TECHNICAL_REVIEW', 'TECHNICAL_SPECIALIST')) {
        required.add(new PermitDocumentSignature(
          'TECHNICAL_REVIEW',
          'TECHNICAL_SPECIALIST',
          'Technical Review',
          'Technical analysis and validation required',
          2
        ));
      }
    }
    
    if (needsEnvironmentalReview(application, agencyType, permitType) && applicationStatus == 'Environmental Review') {
      if (!hasSignature(existingSignatures, 'ENVIRONMENTAL_REVIEW', 'ENVIRONMENTAL_SPECIALIST')) {
        required.add(new PermitDocumentSignature(
          'ENVIRONMENTAL_REVIEW',
          'ENVIRONMENTAL_SPECIALIST',
          'Environmental Assessment',
          'Environmental impact review required',
          3
        ));
      }
    }
    
    if (applicationStatus == 'Pending Decision') {
      if (!hasSignature(existingSignatures, 'FINAL_APPROVAL', 'MANAGER')) {
        required.add(new PermitDocumentSignature(
          'FINAL_APPROVAL',
          'MANAGER',
          'Final Approval',
          'Final decision and approval signature',
          4
        ));
      }
    }
    
    return required;
  }

  private static Boolean hasSignature(List<Document_Package__c> docPackages, String documentType, String signerRole) {
    for (Document_Package__c doc : docPackages) {
      if (doc.Document_Type__c == documentType && 
          doc.Signer_Role__c == signerRole && 
          doc.Status__c == 'Signed') {
        return true;
      }
    }
    return false;
  }

  private static Boolean checkUserSignaturePermissions(Id userId, String signerRole, SObject application, String agencyType) {
    // Check user's profile and permission sets for signature authorization
    List<PermissionSetAssignment> userPermissions = [
      SELECT PermissionSet.Name
      FROM PermissionSetAssignment 
      WHERE AssigneeId = :userId
    ];

    Set<String> userPermissionSetNames = new Set<String>();
    for (PermissionSetAssignment psa : userPermissions) {
      userPermissionSetNames.add(psa.PermissionSet.Name);
    }

    // Define required permission sets for each signer role (customizable by agency)
    Map<String, Set<String>> rolePermissions = getRolePermissions(agencyType);

    if (!rolePermissions.containsKey(signerRole)) {
      return false;
    }

    // Check if user has any of the required permission sets
    for (String requiredPermission : rolePermissions.get(signerRole)) {
      if (userPermissionSetNames.contains(requiredPermission)) {
        return true;
      }
    }

    // Additional check: if user is assigned reviewer for this application
    try {
      if (hasField(application.getSObjectType().getDescribe().getName(), 'Assigned_Reviewer__c')) {
        Id assignedReviewer = (Id) application.get('Assigned_Reviewer__c');
        if (assignedReviewer == userId && 
            (signerRole == 'MANAGER' || signerRole == 'LEAD_REVIEWER')) {
          return true;
        }
      }
    } catch (Exception e) {
      System.debug('Error checking assigned reviewer: ' + e.getMessage());
    }

    return false;
  }

  private static Map<String, Set<String>> getRolePermissions(String agencyType) {
    Map<String, Set<String>> basePermissions = new Map<String, Set<String>>{
      'MANAGER' => new Set<String>{'Permit_Manager', 'Application_Approver'},
      'LEAD_REVIEWER' => new Set<String>{'Lead_Reviewer', 'Application_Reviewer'},
      'TECHNICAL_SPECIALIST' => new Set<String>{'Technical_Specialist', 'Subject_Matter_Expert'},
      'ENVIRONMENTAL_SPECIALIST' => new Set<String>{'Environmental_Specialist', 'Environmental_Reviewer'},
      'AUTHORIZED_OFFICER' => new Set<String>{'Authorized_Officer', 'Senior_Approver'},
      'APPLICANT_REPRESENTATIVE' => new Set<String>{'Applicant_Representative', 'External_User'},
      'INSPECTOR' => new Set<String>{'Field_Inspector', 'Compliance_Officer'}
    };

    // Customize based on agency
    if (agencyType == 'DOI') {
      basePermissions.put('FIELD_OFFICE_MANAGER', new Set<String>{'Nuvi_Field_Office_Manager', 'Nuvi_Approver'});
      basePermissions.put('NEPA_COORDINATOR', new Set<String>{'Nuvi_NEPA_Coordinator', 'Nuvi_Environmental_Reviewer'});
    } else if (agencyType == 'EPA') {
      basePermissions.put('EPA_SPECIALIST', new Set<String>{'EPA_Environmental_Specialist', 'EPA_Reviewer'});
      basePermissions.put('REGIONAL_ADMINISTRATOR', new Set<String>{'EPA_Regional_Administrator', 'EPA_Senior_Approver'});
    }

    return basePermissions;
  }

  private static List<String> getRequiredSignatureSteps(SObject application, String documentType, String agencyType) {
    List<String> steps = new List<String>();
    
    steps.add('1. Verify document completeness and accuracy');
    steps.add('2. Review application details and supporting documentation');
    
    // Add document-type specific steps
    if (documentType == 'INITIAL_REVIEW') {
      steps.add('3. Confirm initial review completion');
      steps.add('4. Validate regulatory compliance');
      steps.add('5. Authorize progression to technical review');
    } else if (documentType == 'TECHNICAL_REVIEW') {
      steps.add('3. Verify technical specifications');
      steps.add('4. Confirm safety and design standards');
      steps.add('5. Validate technical feasibility');
      steps.add('6. Authorize progression to next stage');
    } else if (documentType == 'ENVIRONMENTAL_REVIEW') {
      steps.add('3. Verify environmental assessment completion');
      steps.add('4. Confirm environmental impact analysis');
      steps.add('5. Validate mitigation measures');
      steps.add('6. Authorize environmental clearance');
    } else if (documentType == 'FINAL_APPROVAL') {
      steps.add('3. Review all previous signatures and approvals');
      steps.add('4. Confirm final regulatory compliance');
      steps.add('5. Make final approval decision');
      steps.add('6. Authorize permit issuance');
    }
    
    return steps;
  }

  // Wrapper classes for return types
  public class PermitSignatureResult {
    @AuraEnabled public Id contentVersionId;
    @AuraEnabled public Id documentPackageId;
    @AuraEnabled public String fileName;
    @AuraEnabled public String message;
    @AuraEnabled public List<String> nextRequiredSignatures;

    public PermitSignatureResult(Id cvId, Id dpId, String fName, String msg, List<String> nextSigs) {
      this.contentVersionId = cvId;
      this.documentPackageId = dpId;
      this.fileName = fName;
      this.message = msg;
      this.nextRequiredSignatures = nextSigs;
    }
  }

  public class PermitDocumentSignature {
    @AuraEnabled public String documentType;
    @AuraEnabled public String signerRole;
    @AuraEnabled public String displayName;
    @AuraEnabled public String description;
    @AuraEnabled public Integer priority;

    public PermitDocumentSignature(String docType, String role, String name, String description, Integer pri) {
      this.documentType = docType;
      this.signerRole = role;
      this.displayName = name;
      this.description = description;
      this.priority = pri;
    }
  }

  public class PermitSignatureValidation {
    @AuraEnabled public Boolean isAuthorized;
    @AuraEnabled public String message;
    @AuraEnabled public List<String> requiredSteps;

    public PermitSignatureValidation(Boolean auth, String msg, List<String> steps) {
      this.isAuthorized = auth;
      this.message = msg;
      this.requiredSteps = steps;
    }
  }
}