# Nuvi Permit Application - Comprehensive Implementation Plan

## Overview
This implementation plan combines the best of both Codex's technical depth and Claude's strategic research to build a production-ready Nuvi Permit Application using Salesforce LWC and Apex.

## Key Implementation Principles
- **NO FLOW**: All automation via Apex and LWC only
- **Data Model First**: Complete object schema before UI
- **Leverage Existing**: Use NuviTek utilities and existing components
- **OOTB When Possible**: Use Salesforce config for standard features
- **Security by Default**: FLS, CRUD, sharing rules from the start

## Phase 1: Data Model Enhancement (Current Focus)

### 1.1 Core Objects to Enhance

#### APD_Application__c (Main Application Object)
**Existing Fields**: 25 fields present
**Required Additions**:
```
- Bond_Number__c (Text, 30) ✓
- Bond_Type__c (Picklist) ✓
- Unit_CA_Agreement_Number__c (Text, 30)
- Township__c (Text, 100)
- Will_Produce_From_Lease__c (Checkbox)
- H2S_Program_Required__c (Checkbox)
- Is_Reentry__c (Checkbox)
- Variance_Requests__c (Long Text, 1000)
- Mud_Program__c (Long Text, 1000)
- BOP_Program_Details__c (Long Text, 1000)
- Expected_Formation_Pressures__c (Long Text, 1000)
- Expected_Freshwater_Zones__c (Long Text, 1000)
- Expected_Lost_Circulation_Zones__c (Long Text, 1000)
```

#### Operator__c (Operator Information)
**Required Fields**:
```
- Operator_Name__c (Text, 255) ✓
- Address__c (Text, 255)
- City__c (Text, 100)
- State__c (Picklist)
- Zip_Code__c (Text, 10) - Validation: ##### or #####-####
- Contact_Name__c (Text, 150)
- Contact_Phone__c (Phone) - Validation: ###-###-####
- Contact_Email__c (Email)
```

#### Well_Pad__c (Enhanced)
**Required Fields**:
```
- Pad_Name__c (Text, 100)
- Pad_ID__c (Auto Number)
- Number_of_Wells__c (Number, 3)
- Surface_Ownership__c (Picklist: Federal/Tribal/State/Fee)
- Surface_Owner_Name__c (Text, 150)
- Access_Road_Description__c (Long Text, 1000)
- Facilities_on_Pad__c (Multi-Select Picklist)
- Pad_Polygon_Attachment__c (Lookup to ContentDocument)
- GIS_Coordinates__c (Geolocation)
```

#### Well__c (Individual Well Information)
**Required Fields**:
```
- Well_Name_Number__c (Text, 100)
- API_Well_Number__c (Text, 15)
- Well_Type__c (Picklist: Oil/Gas/CBM/Injection/Exploratory)
- Well_Orientation__c (Picklist: Vertical/Directional/Horizontal/Sidetrack)
- Field_Pool_Name__c (Text, 100)
- Proposed_MD__c (Number, 6,0)
- Proposed_TVD__c (Number, 6,0)
- Kickoff_Point__c (Number, 6,0)
- Bottom_Hole_Location__c (Geolocation)
- Surface_Hole_Location__c (Geolocation)
```

#### Drilling_Plan__c (Enhanced)
**Required Fields**:
```
- APD_Application__c (Master-Detail)
- Drilling_Plan_Narrative__c (Rich Text)
- Drilling_Plan_Document__c (Lookup to ContentDocument)
- Approval_Status__c (Picklist)
- Review_Comments__c (Long Text)
```

#### Surface_Use_Plan__c (SUPO)
**Required Fields**:
```
- APD_Application__c (Master-Detail)
- SUPO_Narrative__c (Rich Text)
- Existing_Roads_Description__c (Long Text, 1000)
- New_Road_Description__c (Long Text, 1000)
- Location_of_Facilities__c (Text)
- Water_Source__c (Text, 500)
- Reclamation_Plan__c (Long Text, 1000)
- Cultural_Survey_Required__c (Checkbox)
- Wildlife_Survey_Required__c (Checkbox)
```

### 1.2 New Objects to Create

#### Casing_Program_Detail__c
```
- Drilling_Plan__c (Master-Detail)
- Casing_Size__c (Text)
- Casing_Grade__c (Text)
- Casing_Weight__c (Number)
- Setting_Depth__c (Number)
- Sequence__c (Number)
```

#### Cement_Program_Detail__c
```
- Drilling_Plan__c (Master-Detail)
- Slurry_Design__c (Text)
- Yield__c (Number)
- Interval_Top__c (Number)
- Interval_Bottom__c (Number)
- Sequence__c (Number)
```

#### Environmental_Review__c (Enhanced)
```
- APD_Application__c (Lookup)
- Review_Type__c (Picklist: CX/EA/EIS)
- Review_Status__c (Picklist)
- Specialist_Type__c (Picklist: Wildlife/Cultural/Hydrology/Air)
- Findings__c (Rich Text)
- Mitigation_Requirements__c (Rich Text)
- Review_Date__c (Date)
- Reviewer__c (Lookup to User)
```

### 1.3 Validation Rules

#### APD_Application__c Validations
```apex
// Zip Code Format
AND(
    NOT(REGEX(Zip_Code__c, "^\\d{5}$")),
    NOT(REGEX(Zip_Code__c, "^\\d{5}-\\d{4}$"))
)
Error: "Zip code must be ##### or #####-####"

// Phone Format
NOT(REGEX(Contact_Phone__c, "^\\d{3}-\\d{3}-\\d{4}$"))
Error: "Phone must be ###-###-####"

// Kickoff Point Required for Directional/Horizontal
AND(
    OR(
        ISPICKVAL(Well_Orientation__c, "Directional"),
        ISPICKVAL(Well_Orientation__c, "Horizontal")
    ),
    ISBLANK(Kickoff_Point__c)
)
Error: "Kickoff point required for directional/horizontal wells"
```

## Phase 2: LWC Components Development

### 2.1 Enhanced Permit Application Wizard

#### nuviPermitApplicationWizard (Enhance Existing)
```javascript
// Key Enhancements:
- Dynamic field rendering based on Permit_Form_Config__mdt
- Progressive disclosure (show fields based on previous selections)
- Auto-save functionality every 30 seconds
- Validation on each step before progression
- Integration with AI suggestions
- Mobile-responsive design
```

### 2.2 New Components to Build

#### nuviPermitAI (New AI Assistant)
```javascript
// Leveraging existing nuviAI utilities:
- Real-time field suggestions
- Document analysis and extraction
- Completeness checking
- Regulatory compliance validation
```

#### nuviGISMapViewer (New GIS Component)
```javascript
// Features:
- ArcGIS REST API integration
- Well/pad location visualization
- Proximity analysis to protected areas
- Drawing tools for pad polygons
```

#### nuviPaymentProcessor (New Payment Component)
```javascript
// Features:
- Fee calculation display
- pay.gov integration UI
- Payment status tracking
- Receipt generation
```

## Phase 3: Apex Services Implementation

### 3.1 Core Services

#### Nuvi_Permit_ApplicationService (Enhanced)
```apex
public with sharing class Nuvi_Permit_ApplicationService {
    // Status management
    public static void updateApplicationStatus(Id applicationId, String newStatus)
    
    // Validation orchestration
    public static ValidationResult validateApplication(Id applicationId)
    
    // Fee calculation
    public static Decimal calculateFees(Id applicationId)
    
    // Workflow advancement
    public static void advanceToNextStage(Id applicationId)
}
```

#### Nuvi_Permit_WorkflowOrchestrator (New)
```apex
public with sharing class Nuvi_Permit_WorkflowOrchestrator {
    // No Flow - all Apex orchestration
    
    // Stage transitions
    public static void transitionStage(Id applicationId, String fromStage, String toStage)
    
    // Parallel task creation
    public static void createReviewTasks(Id applicationId)
    
    // SLA monitoring
    public static void checkSLABreaches()
    
    // Notification orchestration
    public static void sendStageNotifications(Id applicationId, String stage)
}
```

#### GISIntegrationService (New)
```apex
public with sharing class GISIntegrationService {
    // ArcGIS REST callouts
    public static Map<String, Object> getLocationData(Decimal latitude, Decimal longitude)
    
    // Proximity analysis
    public static ProximityResult checkProximityToProtectedAreas(Decimal lat, Decimal lng)
    
    // Geocoding
    public static Coordinates geocodeAddress(String address)
}
```

#### PaymentIntegrationService (New)
```apex
public with sharing class PaymentIntegrationService {
    // pay.gov integration
    public static PaymentResult initiatePayment(Id applicationId, Decimal amount)
    
    // Payment status check
    public static String checkPaymentStatus(String transactionId)
    
    // Reconciliation
    @future
    public static void reconcilePayments()
}
```

### 3.2 Trigger Framework

#### APDApplicationTrigger
```apex
trigger APDApplicationTrigger on APD_Application__c (
    before insert, before update, after insert, after update
) {
    APDApplicationTriggerHandler.handle();
}

public class APDApplicationTriggerHandler {
    // Bulk-safe patterns
    // Status transitions
    // Audit logging
    // Platform Events for notifications
}
```

## Phase 4: Integration Implementation

### 4.1 Named Credentials Setup
```
- PayGov_API (pay.gov integration)
- ArcGIS_REST (GIS services)
- OpenAI_API (AI services - existing)
- Federal_Register_API (publishing)
```

### 4.2 Platform Events
```
- Nuvi_Permit_Status_Change__e
- Review_Task_Created__e
- Payment_Completed__e
- SLA_Breach_Alert__e
```

### 4.3 Custom Metadata Types
```
- Permit_Form_Config__mdt (existing, enhance)
- Permit_Fee_Schedule__mdt (new)
- Review_Stage_Config__mdt (new)
- SLA_Configuration__mdt (new)
```

## Phase 5: Security & Compliance

### 5.1 Permission Sets
```
- DOI_Permit_Applicant
- DOI_Intake_Specialist
- DOI_Agency_Reviewer
- DOI_Supervisor
- DOI_System_Admin
```

### 5.2 Sharing Rules
```
- Private OWD on all permit objects
- Criteria-based sharing for agency reviewers
- Manual sharing for cross-agency collaboration
```

### 5.3 Field-Level Security
```
- Restricted fields for PII
- Read-only for calculated fields
- Agency-specific field visibility
```

## Phase 6: Testing Strategy

### 6.1 Apex Test Classes
```apex
@isTest
private class PermitApplicationServiceTest {
    // Happy path tests
    // Bulk tests (200+ records)
    // Negative tests
    // Governor limit tests
}
```

### 6.2 LWC Jest Tests
```javascript
// Component rendering tests
// User interaction tests
// Wire adapter tests
// Error handling tests
```

## Phase 7: Deployment Strategy

### 7.1 Package Structure
```
force-app/
  main/
    Government_Documents/
      Permit_And_Licensing/
        objects/
        classes/
        lwc/
        triggers/
        customMetadata/
        permissionsets/
        staticresources/
```

### 7.2 Deployment Order
1. Custom Objects & Fields
2. Validation Rules
3. Custom Metadata
4. Apex Classes
5. Triggers
6. LWC Components
7. Permission Sets
8. Experience Cloud Configuration

## Implementation Timeline

### Week 1-2: Data Model & Security
- Complete all object/field creation
- Validation rules
- Permission sets and sharing

### Week 3-4: Apex Services
- Core service classes
- Trigger framework
- Integration stubs

### Week 5-6: LWC Components
- Wizard enhancement
- New components
- AI integration

### Week 7-8: Integrations
- Payment integration
- GIS integration
- Notification setup

### Week 9-10: Testing & Refinement
- Test coverage >85%
- Performance optimization
- Security review

### Week 11-12: Deployment & Training
- Production deployment
- User training
- Documentation

## Success Metrics
- Application processing time: <20 days (from 30+)
- First-time completeness: >80%
- User satisfaction: >85%
- System performance: <3 second page loads
- Test coverage: >85%
- Zero critical security vulnerabilities

## Risk Mitigation
- Governor Limits: Bulkification, async processing
- Integration Failures: Retry logic, fallback modes
- Data Quality: Validation rules, AI assistance
- User Adoption: Training, intuitive UI
- Compliance: Regular audits, documentation

---

This plan incorporates:
- Codex's detailed technical specifications and OOTB vs Custom analysis
- Claude's federal context and modern UX patterns
- Both analyses' data model requirements
- Security and compliance best practices
- Realistic Salesforce implementation approach
