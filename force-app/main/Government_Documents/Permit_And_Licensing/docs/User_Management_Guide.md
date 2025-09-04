# Users Module

## Overview

Multi-role user management system for Nuvi permit and licensing application. Manages user authentication, role-based access control, and agency-specific permissions across federal departments and external operators.

## Purpose

Provides comprehensive user management including:
- Multi-agency user authentication
- Role-based access control (RBAC)
- Permission set assignments
- User onboarding and training tracking
- Cross-agency collaboration tools
- Security clearance management

## Structure

```
├── operators/           # Permit applicants and consultants
├── blm-staff/          # Bureau of Land Management personnel
├── nps-staff/          # National Park Service personnel
├── bia-staff/          # Bureau of Indian Affairs personnel
├── sol-staff/          # Solicitor's Office legal staff
├── admin-users/        # System administrators
├── objects/            # Custom user-related objects
├── classes/            # User management Apex classes
├── permissionsets/     # Permission set definitions
└── profiles/           # Profile configurations
```

## User Role Definitions

### 1. Operators (External Users)
**Description**: Permit applicants, consulting firms, and industry representatives

**Permissions**:
- Submit new applications
- Upload required documents
- Track application status
- Communicate with reviewers
- Make payments and fees
- Access public portal features

**Access Levels**:
- Create/Read/Edit: Own applications only
- Read: Public application status
- No Delete permissions on submitted applications

### 2. BLM Staff (Bureau of Land Management)
**Description**: Federal employees responsible for land management decisions

**Roles**:
- **BLM Technical Reviewers**: Engineering and technical analysis
- **BLM Environmental Specialists**: Environmental impact assessment
- **BLM Managers**: Approval authority and oversight
- **BLM Administrators**: System configuration and user management

**Permissions**:
- Review assigned applications
- Update application status
- Generate reports and analytics
- Coordinate with other agencies
- Manage workflow assignments

### 3. NPS Staff (National Park Service)
**Description**: Personnel managing national parks and monuments

**Roles**:
- **NPS Environmental Reviewers**: Park-specific environmental review
- **NPS Cultural Resource Specialists**: Historical and cultural impact
- **NPS Superintendents**: Park-level approval authority

**Permissions**:
- Review applications affecting park boundaries
- Provide advisory input on environmental impacts
- Access cultural resource databases
- Coordinate with tribal representatives

### 4. BIA Staff (Bureau of Indian Affairs)
**Description**: Federal employees managing tribal trust responsibilities

**Roles**:
- **BIA Tribal Liaisons**: Coordination with tribal governments
- **BIA Trust Officers**: Trust land impact assessment
- **BIA Cultural Specialists**: Traditional use and cultural impact

**Permissions**:
- Review applications on or near tribal lands
- Facilitate tribal consultation processes
- Access restricted cultural resource information
- Coordinate Section 106 compliance

### 5. SOL Staff (Solicitor's Office)
**Description**: Legal counsel for Department of Interior

**Roles**:
- **SOL Attorneys**: Legal review and opinion
- **SOL Paralegals**: Legal research and document preparation
- **SOL Managers**: Legal oversight and coordination

**Permissions**:
- Review legal aspects of applications
- Provide legal opinions and guidance
- Access litigation and compliance records
- Coordinate with Department of Justice

### 6. Admin Users (System Administrators)
**Description**: Technical personnel managing system operations

**Roles**:
- **System Administrators**: Full system access
- **Security Administrators**: Security configuration
- **Business Analysts**: Process improvement and configuration

**Permissions**:
- Full system configuration access
- User management and provisioning
- System monitoring and maintenance
- Data backup and recovery operations

## Security Matrix

| Role Category | Application Data | Financial Data | Legal Documents | Cultural Resources | System Config |
|--------------|------------------|----------------|-----------------|-------------------|---------------|
| Operators | Own Only | Own Only | Own Only | No Access | No Access |
| BLM Staff | Assigned | Read All | Read All | Read All | Limited |
| NPS Staff | Advisory | No Access | Read Relevant | Read All | No Access |
| BIA Staff | Tribal Related | No Access | Read Relevant | Full Access | No Access |
| SOL Staff | Legal Review | Read All | Full Access | Read All | No Access |
| Admin Users | Read All | No Access | No Access | No Access | Full Access |

## Permission Sets

### Core Permission Sets
- `DOI_PAL_Operator_Base` - Basic operator permissions
- `DOI_PAL_Operator_Premium` - Enhanced operator features
- `DOI_PAL_Reviewer_Base` - Standard reviewer permissions
- `DOI_PAL_Reviewer_Advanced` - Senior reviewer capabilities
- `DOI_PAL_Manager_Permissions` - Management oversight
- `DOI_PAL_Admin_Full` - Full administrative access

### Specialized Permission Sets
- `DOI_PAL_Environmental_Reviewer` - Environmental assessment tools
- `DOI_PAL_Legal_Review` - Legal document access
- `DOI_PAL_Cultural_Resources` - Cultural impact assessment
- `DOI_PAL_Financial_Processing` - Payment and fee management
- `DOI_PAL_GIS_Access` - Mapping and spatial analysis

## User Onboarding Process

### 1. Account Provisioning
- PIV card authentication setup
- Role assignment based on position
- Security clearance verification
- Training requirement assignment

### 2. System Training
- Role-specific training modules
- Certification requirements
- Hands-on practice environment
- Competency assessments

### 3. Access Activation
- Manager approval workflow
- Security office clearance
- Final permission set assignment
- Account activation notification

## Best Practices

### Security Implementation
- Enforce PIV card authentication for federal users
- Implement multi-factor authentication for external users
- Regular access reviews and certifications
- Automated account deactivation for inactive users

### Role Management
- Follow principle of least privilege
- Implement role-based inheritance
- Regular permission set reviews
- Clear segregation of duties

### User Experience
- Single sign-on integration
- Intuitive role-specific dashboards
- Mobile-responsive design
- Comprehensive help documentation

## Integration Points

- **Authentication**: PIV card and CAC integration
- **Directory Services**: Active Directory Federation
- **Training Systems**: Learning management system
- **HR Systems**: Employee onboarding workflow
- **Security Systems**: Background check verification

## Configuration Examples

### Creating User Record
```apex
User newBLMUser = new User(
    Username = 'john.doe@blm.gov',
    Email = 'john.doe@blm.gov',
    FirstName = 'John',
    LastName = 'Doe',
    Alias = 'jdoe',
    ProfileId = [SELECT Id FROM Profile WHERE Name = 'Nuvi BLM Staff'].Id,
    UserRoleId = [SELECT Id FROM UserRole WHERE Name = 'BLM Technical Reviewer'].Id
);
```

### Permission Set Assignment
```apex
PermissionSetAssignment psa = new PermissionSetAssignment(
    AssigneeId = userId,
    PermissionSetId = [SELECT Id FROM PermissionSet 
                      WHERE Name = 'DOI_PAL_Environmental_Reviewer'].Id
);
```

## Compliance Requirements

### Federal Standards
- FISMA security controls implementation
- FedRAMP authorization compliance
- PIV/CAC authentication requirements
- NIST cybersecurity framework adherence

### Audit and Monitoring
- Complete user access logging
- Regular access certification
- Privileged user monitoring
- Suspicious activity detection

## Testing Requirements

- Role-based access testing for all user types
- Security penetration testing
- Single sign-on integration testing
- Performance testing under user load
- User acceptance testing for each role

## Maintenance and Support

- Regular permission set reviews
- User access certification campaigns
- Role definition updates
- Training material maintenance
- Help desk support procedures

