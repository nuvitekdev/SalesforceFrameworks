# Public Portal Module

## Overview

Public-facing portal interface for permit applicants and operators to interact with the Nuvi permit and licensing system. Provides secure, user-friendly access to application submission, status tracking, document management, and payment processing.

## Purpose

Delivers comprehensive self-service capabilities including:
- Online application submission
- Real-time application status tracking
- Secure document upload and management
- Payment processing and fee management
- Communication with review staff
- Public record access and transparency

## Structure

```
├── operator-dashboard/      # Main dashboard for applicants
├── application-status/      # Status tracking and updates
├── document-submission/     # File upload and management
├── payment-portal/         # Fee payment and billing
├── lwc/                    # Lightning Web Components
├── aura/                   # Legacy Aura components
├── objects/                # Public portal data objects
└── classes/                # Portal-specific controllers
```

## Key Components

### Lightning Web Components
- `nuviPermitApplicationWizard` - Permit intake wizard (LWR page)
- `nuviPermitDocumentManager` - Secure file upload and management
- `nuviPermitSignatureManager` - Electronic signatures
- `nuviPermitMap` - Map display for surface/bottom hole locations

### Apex Classes
- `APDApplicationService` - Application save from wizard
- `Nuvi_Permit_DocumentController` - Document management
- `Nuvi_Permit_SignatureController` - Signature workflows
- `PayGovService` - Payment intent service (Named Credential: PayGov)
- `GISProximityService` - Proximity alerts (stub; replace with ArcGIS/USGS)

### Custom Objects
- `DOI_PAL_Portal_Session__c` - User session tracking
- `DOI_PAL_Public_Inquiry__c` - Public questions and responses
- `DOI_PAL_Portal_Preference__c` - User preferences and settings
- `DOI_PAL_Public_Comment__c` - Public comment submissions

## User Experience Design

### Responsive Dashboard
```
┌─────────────────────────────────────────────────┐
│ Nuvi Permits & Licensing Portal                  │
├─────────────────────────────────────────────────┤
│ Welcome, [Operator Name]                        │
│                                                 │
│ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ │
│ │ Active      │ │ Pending     │ │ Completed   │ │
│ │ Applications│ │ Payments    │ │ Permits     │ │
│ │     3       │ │   $12,515   │ │     12      │ │
│ └─────────────┘ └─────────────┘ └─────────────┘ │
│                                                 │
│ Recent Activity:                                │
│ ├ APD-2024-001 - Under Review (Day 15/60)      │
│ ├ REC-2024-005 - Payment Required              │
│ └ MIN-2024-003 - Additional Info Requested     │
└─────────────────────────────────────────────────┘
```

### Application Status Tracking
- Visual timeline with progress indicators
- Estimated completion dates
- Required actions highlighted
- Historical status changes
- Reviewer contact information

### Document Management
- Drag-and-drop file upload
- Document type validation
- Version control and history
- Download and sharing capabilities
- Compliance checking status

## Portal Features

### 1. Application Submission
**New Application Wizard**:
- Guided step-by-step process
- Dynamic form generation based on permit type
- Real-time validation and error checking
- Draft saving and resumption
- Fee calculation and preview

**Supported Application Types**:
- Application for Permit to Drill (APD)
- General Land Use Permits
- Mining and Extraction Permits
- Recreation and Special Use Permits

### 2. Status Tracking
**Real-time Updates**:
- Current review stage identification
- Days elapsed and remaining in SLA
- Required actions and deadlines
- Reviewer assignment information
- Historical timeline view

**Automated Notifications**:
- Email alerts for status changes
- SMS notifications for urgent items
- In-app notification center
- Customizable notification preferences

### 3. Document Management
**Upload Capabilities**:
- Multiple file format support (PDF, DOC, CAD, GIS)
- Large file handling (up to 100MB)
- Batch upload functionality
- Document type auto-detection

**Security Features**:
- Virus scanning and validation
- Encrypted file storage
- Access logging and audit trails
- Document expiration management

### 4. Payment Processing
**Fee Management**:
- Real-time fee calculation
- Multiple payment methods (ACH, Credit Card)
- Payment history and receipts
- Refund processing and tracking

**Financial Integration**:
- Treasury payment systems
- Automated reconciliation
- Tax reporting compliance
- Multi-currency support (future)

## Security Implementation

### Authentication
- Multi-factor authentication required
- PIV card support for government contractors
- Session timeout and management
- Account lockout protection

### Data Protection
- End-to-end encryption for sensitive data
- Field-level security enforcement
- Audit logging for all actions
- Data retention policy compliance

### Access Control
```apex
// Example: Ensure users can only access their own data
public with sharing class DOI_PAL_PublicPortalController {
    @AuraEnabled(cacheable=true)
    public static List<DOI_PAL_Application__c> getMyApplications() {
        return [SELECT Id, Name, Status__c, Application_Type__c 
                FROM DOI_PAL_Application__c 
                WHERE Applicant_Contact__c = :UserInfo.getUserId()
                WITH SECURITY_ENFORCED
                ORDER BY CreatedDate DESC];
    }
}
```

## Public Transparency Features

### Public Search
- Approved permit database search
- Environmental assessment documents
- Public comment viewing
- GIS mapping integration

### Open Data
- API endpoints for public data
- Downloadable datasets
- Real-time statistics
- Historical trend analysis

## Mobile Optimization

### Responsive Design
- Mobile-first approach
- Touch-optimized interfaces
- Offline capability for forms
- Progressive web app features

### Mobile-Specific Features
- Camera integration for document photos
- GPS location services
- Push notifications
- Biometric authentication

## Integration Points

- **Applications Module**: Application data synchronization
- **Documents Module**: File storage and management
- **Payments Module**: Fee processing integration
- **Notifications Module**: Communication services
- **GIS Mapping Module**: Location visualization
- **AI Services Module**: Document validation assistance

## Performance Optimization

### Caching Strategy
- Application data caching
- Document metadata caching
- User preference caching
- Static resource optimization

### Loading Optimization
- Lazy loading for large datasets
- Progressive image loading
- Asynchronous API calls
- Optimized bundle sizes

## Configuration Examples

### Portal Page Setup
```javascript
// Lightning Web Component for operator dashboard
import { LightningElement, wire } from 'lwc';
import getMyApplications from '@salesforce/apex/DOI_PAL_PublicPortalController.getMyApplications';

export default class DoiPalOperatorDashboard extends LightningElement {
    @wire(getMyApplications)
    applications;

    get activeApplications() {
        return this.applications?.data?.filter(app => 
            app.Status__c === 'Under Review' || app.Status__c === 'Submitted'
        ) || [];
    }
}
```

### Custom Portal Branding
```css
/* Custom CSS for Nuvi branding */
.Nuvi-portal-header {
    background: linear-gradient(135deg, #1e3a5f 0%, #2c5f41 100%);
    color: white;
    padding: 1rem 2rem;
}

.Nuvi-card {
    border-left: 4px solid #2c5f41;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    border-radius: 8px;
}
```

## Testing Requirements

### Functional Testing
- Cross-browser compatibility testing
- Mobile device testing
- Accessibility compliance (Section 508)
- Performance testing under load

### Security Testing
- Penetration testing
- Authentication bypass testing
- Data injection attack testing
- Session management validation

### User Acceptance Testing
- Operator workflow testing
- Payment processing validation
- Document upload testing
- Status notification verification

## Compliance Requirements

### Accessibility (Section 508)
- Screen reader compatibility
- Keyboard navigation support
- Color contrast compliance
- Alternative text for images

### Privacy (Privacy Act)
- Privacy notice display
- Consent management
- Data minimization
- User rights implementation

### Security (FISMA)
- Authority to Operate (ATO)
- Continuous monitoring
- Incident response procedures
- Security control implementation

## Maintenance and Support

### Help Documentation
- User guides and tutorials
- Video walkthroughs
- FAQ sections
- Troubleshooting guides

### Support Channels
- Online chat support
- Email support tickets
- Phone support during business hours
- Self-service knowledge base

### System Monitoring
- Uptime monitoring
- Performance metrics
- Error rate tracking
- User satisfaction surveys
### LWR Configuration Notes
- Use LWR template; add App Pages for the wizard and status views.
- Add components to pages: `nuviPermitApplicationWizard`, `nuviPermitDocumentManager`, `nuviPermitSignatureManager`, `nuviPermitMap`.
- CSP Trusted Sites: LLM providers, ArcGIS domains, and pay.gov endpoint.
- Named Credential: Create `PayGov` and assign to integration profile.


