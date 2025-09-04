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
