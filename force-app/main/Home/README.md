# Nuvitek Access Request System

This package provides a comprehensive access request management system for Salesforce applications. It allows users to easily request access to various applications through the navigation tiles interface, and provides an approval workflow for administrators to review and grant access.

## Features

- **Request Access UI** - Integrated with navigation tiles for easy access
- **Role-Based Access** - Define different roles (Admin, User, etc.) for each application
- **Custom Metadata-Driven** - Application roles and permission sets defined in metadata
- **Approval Workflow** - Automated approval process for access requests
- **Automatic Permission Assignment** - Permissions automatically assigned after approval

## Components

### Objects

- **NuvitekAccessRequest__c** - Custom object that tracks access requests
  - Fields:
    - Application__c - The application for which access is requested
    - AccessType__c - The type of access (Admin, User, etc.)
    - Requester__c - The user requesting access
    - Justification__c - Reason for requesting access
    - Status__c - Current status (Pending, Approved, Rejected, Access Granted)

### Custom Metadata Types

- **NuvitekAppAccess__mdt** - Defines application access roles and permissions
  - Fields:
    - AppName__c - Name of the application
    - RoleName__c - Role name (Admin, User, etc.)
    - PermissionSets__c - Comma-separated list of permission sets to assign
    - IsDefault__c - Whether this is the default role for the app
    - Description__c - Description of the role and its capabilities

### Apex Classes

- **NuvitekAccessRequestController** - Main controller for the access request functionality
  - Methods:
    - getAccessTypesForApp - Gets available roles for an application
    - createAccessRequest - Creates a new access request
    - processApprovedRequest - Processes an approved request

### LWC Components

- **nuvitekNavigationTiles** - Enhanced navigation tiles with access request dropdown

### Permission Sets

- **NuvitekAccessManager** - For administrators who manage access requests
- **NuvitekAccessRequester** - For users who need to request access

## Usage

### For End Users

1. Navigate to the application tile
2. Click the dropdown menu in the top right corner of the tile
3. Select "Request Access"
4. Choose the desired access type and provide justification
5. Submit the request
6. Once approved, you'll be granted the appropriate permissions

### For Administrators

1. Access requests can be reviewed from the "Nuvitek Access Requests" tab
2. Approve or reject requests based on justification and policy
3. Upon approval, permissions are automatically assigned

### Adding New Applications

To add support for a new application:

1. Create new NuvitekAppAccess__mdt records for each role
2. Specify the permission sets required for each role
3. Ensure the application name matches what's displayed in the navigation tiles

## Security Considerations

- Permission sets control who can create, view, and approve access requests
- Only approved requests result in permission assignment
- All requests and approvals are tracked for audit purposes

## Maintenance

- Review and update permission sets as application security requirements change
- Add or modify roles as needed to reflect organizational changes 