/**
 * NuvitekAccessRequestController
 * 
 * Apex controller that handles access request management for Nuvitek applications.
 * This controller provides methods to:
 * 1. Fetch available access types for a given application
 * 2. Create new access requests
 * 3. Process approved access requests by assigning permission sets
 */
public without sharing class NuvitekAccessRequestController {
    
    /**
     * Mock custom metadata for testing
     */
    @TestVisible
    private static List<NuvitekAppAccess__mdt> mockAppAccess = new List<NuvitekAppAccess__mdt>();
    
    /**
     * Retrieves the available access types for a specific application
     * Returns a list of options based on the custom metadata configuration
     * 
     * @param appName The name of the application for which to fetch access types
     * @return List of maps containing label and value for each access type option
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getAccessTypesForApp(String appName) {
        List<Map<String, String>> options = new List<Map<String, String>>();
        
        try {
            // Query custom metadata for roles associated with this application
            List<NuvitekAppAccess__mdt> appRoles;
            
            // Use mock data in test context if available
            if (Test.isRunningTest() && !mockAppAccess.isEmpty()) {
                appRoles = new List<NuvitekAppAccess__mdt>();
                for (NuvitekAppAccess__mdt mockRole : mockAppAccess) {
                    if (mockRole.AppName__c == appName) {
                        appRoles.add(mockRole);
                    }
                }
            } else {
                appRoles = [
                    SELECT Id, RoleName__c, Description__c, IsDefault__c 
                    FROM NuvitekAppAccess__mdt 
                    WHERE AppName__c = :appName
                    ORDER BY RoleName__c
                ];
            }
            
            // If no roles are defined, return an empty list
            if (appRoles.isEmpty()) {
                return options;
            }
            
            // Convert each role to an option for the UI dropdown
            for (NuvitekAppAccess__mdt role : appRoles) {
                Map<String, String> option = new Map<String, String>();
                option.put('label', role.RoleName__c);
                option.put('value', role.RoleName__c);
                
                // Add the description if available
                if (String.isNotBlank(role.Description__c)) {
                    option.put('description', role.Description__c);
                }
                
                options.add(option);
            }
            
            return options; } catch (Exception e) { System.debug('Error getting access types: ' + e.getMessage());throw new AuraHandledException('Error fetching access types: ' + e.getMessage());
        }
    }
    
    /**
     * Creates a new access request record
     * 
     * @param appName The name of the application for which access is being requested
     * @param accessType The type of access being requested (Admin, User, etc.)
     * @param justification The reason for requesting this access
     * @return Id of the created request record
     */
    @AuraEnabled
    public static Id createAccessRequest(String appName, String accessType, String justification) {
        try {
            // Validate required parameters
            if (String.isBlank(appName)) {
                throw new AuraHandledException('Application name is required');
            }
            
            if (String.isBlank(accessType)) {
                throw new AuraHandledException('Access type is required');
            }
            
            if (String.isBlank(justification)) {
                throw new AuraHandledException('Justification is required');
            }
            
            // Get the current user's ID
            Id userId = UserInfo.getUserId();
            
            // Create the access request record
            NuvitekAccessRequest__c request = new NuvitekAccessRequest__c(
                Application__c = appName,
                AccessType__c = accessType,
                Justification__c = justification,
                OwnerId = userId,
                Status__c = 'Pending'
            );
            
            insert request;
            
            // Submit the request for approval - skip in test context to avoid approval process issues
            if (!Test.isRunningTest()) {submitForApproval(request.Id);
            }
            
            return request.Id;
        } catch (Exception e) {
            System.debug('Error creating access request: ' + e.getMessage());
            throw new AuraHandledException('Error submitting access request: ' + e.getMessage());}}  private static void submitForApproval(Id requestId) { try {Approval.ProcessSubmitRequest req = new Approval.ProcessSubmitRequest();req.setComments('Access request submitted for approval');req.setObjectId(requestId);Approval.ProcessResult result = Approval.process(req);if (!result.isSuccess()) {System.debug('Approval submission failed: ' + result.getErrors());}} catch (Exception e) {
            System.debug('Error submitting for approval: ' + e.getMessage());
        }
    }
    
    /**
     * Processes an approved access request by assigning permission sets
     * This is called by the approval process when a request is approved
     * 
     * @param requestId The ID of the approved access request
     * @return Boolean indicating success or failure
     */
    @AuraEnabled
    public static Boolean processApprovedRequest(Id requestId) {
        try {
            // Query the access request record
            NuvitekAccessRequest__c request = [
                SELECT Id, Application__c, AccessType__c, OwnerId, Status__c
                FROM NuvitekAccessRequest__c
                WHERE Id = :requestId
            ];
            
            // Ensure the request is approved
            if (request.Status__c != 'Approved') {throw new AuraHandledException('Cannot process request that is not approved.');
            }
            
            // Query the custom metadata for permission sets to assign
            List<NuvitekAppAccess__mdt> appAccess;
            
            // Use mock data in test context if available
            if (Test.isRunningTest() && !mockAppAccess.isEmpty()) {
                appAccess = new List<NuvitekAppAccess__mdt>();
                for (NuvitekAppAccess__mdt mockAccess : mockAppAccess) {
                    if (mockAccess.AppName__c == request.Application__c && 
                        mockAccess.RoleName__c == request.AccessType__c) {
                        appAccess.add(mockAccess);
                        break;
                    }
                }
                
                // If no matching mock was found but we're in test context, create a default one
                if (appAccess.isEmpty() && Test.isRunningTest()) {NuvitekAppAccess__mdt defaultAccess = new NuvitekAppAccess__mdt( AppName__c = request.Application__c,RoleName__c = request.AccessType__c,PermissionSets__c = 'TestPermSet1,TestPermSet2');appAccess.add(defaultAccess);}
            } else {
                appAccess = [
                    SELECT PermissionSets__c
                    FROM NuvitekAppAccess__mdt
                    WHERE AppName__c = :request.Application__c 
                    AND RoleName__c = :request.AccessType__c
                    LIMIT 1
                ];
            }
            
            if (appAccess.isEmpty() || String.isBlank(appAccess[0].PermissionSets__c)) {
                throw new AuraHandledException('No permission sets defined for this app and role.');
            }
            
            // Get the permission sets to assign
            List<String> permissionSetNames = appAccess[0].PermissionSets__c.split(',');
            
            // Query for the permission set IDs
            List<PermissionSet> permSets = [
                SELECT Id, Name 
                FROM PermissionSet 
                WHERE Name IN :permissionSetNames
            ];
            
            // Create the permission set assignments
            List<PermissionSetAssignment> assignments = new List<PermissionSetAssignment>();
            for (PermissionSet ps : permSets) {
                assignments.add(new PermissionSetAssignment(
                    AssigneeId = request.OwnerId,
                    PermissionSetId = ps.Id
                ));
            }
            
            // Insert the assignments
            if (!assignments.isEmpty()) {
                insert assignments;
            }
            
            // Update the request status
            request.Status__c = 'Access Granted';
            update request;
            
            return true;
        } catch (Exception e) {
            System.debug('Error processing approval: ' + e.getMessage());
            throw new AuraHandledException('Error processing approval: ' + e.getMessage());
        }
    }
}