# Whistleblower Management System - Comprehensive Technical Documentation

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [System Architecture Overview](#system-architecture-overview)
3. [Data Model & Database Design](#data-model--database-design)
4. [Backend Services & Business Logic](#backend-services--business-logic)
5. [Frontend Components & User Interface](#frontend-components--user-interface)
6. [Workflow Automation & Business Processes](#workflow-automation--business-processes)
7. [Security & Access Control](#security--access-control)
8. [API Integrations](#api-integrations)
9. [Implementation Requirements](#implementation-requirements)
10. [User Journey Flows](#user-journey-flows)
11. [Technical Specifications](#technical-specifications)
12. [Testing & Quality Assurance](#testing--quality-assurance)

---

## Executive Summary

The Whistleblower Management System is a comprehensive platform designed to handle confidential reporting of unethical behavior, compliance violations, and fraud within organizations. The system supports both anonymous and identified reporting, provides structured investigation workflows, tracks Service Level Agreements (SLA), and ensures secure communication channels.

### Key Capabilities
- **Anonymous Reporting**: Secure submission without revealing identity
- **Case Management**: End-to-end tracking from submission to resolution
- **Investigation Tracking**: Structured workflow for investigations
- **Action Monitoring**: Track and verify corrective actions
- **SLA Compliance**: Automated deadline tracking
- **Support System**: Q&A functionality for reporters
- **News Integration**: Contextual news feed related to whistleblowing
- **Role-Based Access**: Granular permissions for different user types

---

## System Architecture Overview

### Three-Tier Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    PRESENTATION LAYER                        │
│  ┌─────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │  Report Viewer  │  │  SLA Tracker   │  │  News Feed   │ │
│  │   Component     │  │   Component    │  │  Component   │ │
│  └─────────────────┘  └────────────────┘  └──────────────┘ │
│  ┌─────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │ FAQ Accordion   │  │ File Generator │  │ Full Page    │ │
│  │   Component     │  │   Component    │  │  Layout      │ │
│  └─────────────────┘  └────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    BUSINESS LOGIC LAYER                      │
│  ┌─────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │ Report Service  │  │  SLA Service   │  │ News Service │ │
│  └─────────────────┘  └────────────────┘  └──────────────┘ │
│  ┌─────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │Trigger Handlers │  │  Controllers   │  │  Wrappers    │ │
│  └─────────────────┘  └────────────────┘  └──────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATA ACCESS LAYER                       │
│  ┌─────────────────┐  ┌────────────────┐  ┌──────────────┐ │
│  │ Whistleblower   │  │ Investigation  │  │Action Taken  │ │
│  │    Report       │  │                │  │              │ │
│  └─────────────────┘  └────────────────┘  └──────────────┘ │
│  ┌─────────────────┐  ┌────────────────┐                   │
│  │   Support       │  │ SLA Settings   │                   │
│  │   Tickets       │  │   Metadata     │                   │
│  └─────────────────┘  └────────────────┘                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model & Database Design

### 1. Core Entities

#### **WhistleblowerReport** (Main Entity)
Primary table for storing whistleblower submissions.

| Field Name | Type | Description | Constraints |
|------------|------|-------------|-------------|
| id | UUID/String | Unique identifier | Primary Key, Auto-generated |
| anonymous_id | String | Auto-generated ID for anonymous reports | Format: WB-{0000}, Unique |
| is_anonymous | Boolean | Indicates if report is anonymous | Default: false |
| reporter_id | Foreign Key | Reference to User table | Nullable for anonymous |
| category | Enum | Report category | Values: Ethics, Safety, Fraud |
| severity | Enum | Severity level | Values: Low, Medium, High, Urgent |
| visibility_desired | Enum | Reporter's privacy preference | Values: Non-Anonymous/Non-Confidential, Fully Anonymous, Confidential |
| report_details | Text | Detailed description | Required, Max 32768 chars |
| status | Enum | Current status | Values: Initial Review, Under Investigation, Closed |
| status_reason | Enum | Reason for status | Dependent on status |
| reported_date | DateTime | Submission timestamp | Auto-set on creation |
| closed_date | DateTime | Closure timestamp | Auto-calculated |
| assignee_id | Foreign Key | Assigned investigator | Reference to User |
| communication_preference | Enum | Preferred contact method | Values: Email, Phone |
| terms_acknowledged | Boolean | Terms acceptance | Required |
| privacy_terms_acknowledged | Boolean | Privacy acceptance | Required |
| within_office_jurisdiction | Boolean | Jurisdiction flag | Default: false |
| fits_within_office_priorities | Boolean | Priority alignment | Default: false |
| initial_response | Text | Initial investigator response | Max 255 chars |
| days_to_completion | Integer | Calculated field | Formula based |
| has_access | Boolean | Access control flag | Formula based |

**Calculated Fields:**
- `reporter_name`: Derived from User relationship
- `reporter_email`: Derived from User relationship
- `reporter_phone`: Derived from User relationship
- `reporter_employer`: Derived from User relationship
- `employment_status`: Checks if reporter has employment data
- `has_required_user_data`: Validates reporter data completeness

#### **Investigation** (Child of WhistleblowerReport)
Tracks investigation process for each report.

| Field Name | Type | Description | Constraints |
|------------|------|-------------|-------------|
| id | UUID/String | Unique identifier | Primary Key |
| whistleblower_report_id | Foreign Key | Parent report | Required, Cascade restrict |
| investigation_details | Text | Investigation notes | Max 32768 chars |
| investigator_id | Foreign Key | Assigned investigator | Reference to User |
| start_date | DateTime | Investigation start | |
| end_date | DateTime | Investigation end | |
| status | Enum | Investigation status | Values: Active, Paused, Pending Report Evaluation, Closed |
| status_reason | Enum | Detailed status reason | Dependent on status |
| days_to_completion | Integer | Duration calculation | Formula based |
| has_access | Boolean | Access control | Formula based |

#### **ActionTaken** (Child of Investigation)
Records actions taken as investigation outcomes.

| Field Name | Type | Description | Constraints |
|------------|------|-------------|-------------|
| id | UUID/String | Unique identifier | Primary Key |
| whistleblower_report_id | Foreign Key | Parent report | Required, Cascade restrict |
| investigation_id | Foreign Key | Parent investigation | Required, Cascade restrict |
| action_details | Text | Action description | Max 255 chars |
| action_date | DateTime | When action was taken | |
| responsible_party_id | Foreign Key | Who executed action | Reference to User |
| status | Enum | Action status | Values: Pending Investigation, Terminated Employee, Put Employee On Warning, No Action Taken |
| follow_up_required | Boolean | Needs follow-up | Default: false |
| effectiveness | Text | Effectiveness notes | Max 255 chars |
| has_access | Boolean | Access control | Formula based |

#### **WhistleblowerSupport** (Optional relationship to Report)
Handles Q&A and support requests.

| Field Name | Type | Description | Constraints |
|------------|------|-------------|-------------|
| id | UUID/String | Unique identifier | Primary Key |
| whistleblower_report_id | Foreign Key | Related report | Optional |
| reporter_id | Foreign Key | Support requester | Reference to User |
| is_anonymous | Boolean | Anonymous request | Default: false |
| question_details | Text | Question/concern | Max 32768 chars |
| response | Text | Support response | Max 32768 chars |
| status | Enum | Ticket status | Values: Open, In Progress, Closed |
| reporter_first_name | String | Derived field | Formula based |
| has_access | Boolean | Access control | Formula based |

#### **SLASettings** (Configuration Metadata)
Stores SLA configuration parameters.

| Field Name | Type | Description | Constraints |
|------------|------|-------------|-------------|
| id | UUID/String | Unique identifier | Primary Key |
| name | String | Setting name | Unique |
| duration | Integer | SLA duration in hours | Required |

### 2. Relationships

```
WhistleblowerReport (1) ──┬──> (N) Investigation
                          ├──> (N) ActionTaken
                          └──> (N) WhistleblowerSupport

Investigation (1) ────────> (N) ActionTaken
```

---

## Backend Services & Business Logic

### 1. Core Services

#### **WhistleblowerReportService**
Handles all business logic for report processing.

**Key Methods:**
- `createReport(reportData)`: Creates new whistleblower report
- `updateReport(reportId, updates)`: Updates existing report
- `setBeforeFields(reports)`: Pre-processes report data before save
- `queryReportOwners(reportIds)`: Retrieves report owner information
- `validateReportData(report)`: Validates report completeness

**Business Rules:**
- Anonymous reports auto-generate unique ID (WB-XXXX format)
- Fraud category auto-escalates to Urgent severity
- Reports require terms acknowledgment
- Status transitions follow defined workflow

#### **InvestigationService**
Manages investigation lifecycle.

**Key Methods:**
- `createInvestigation(reportId)`: Creates investigation for report
- `updateInvestigationStatus(investigationId, status)`: Updates status
- `assignInvestigator(investigationId, userId)`: Assigns investigator
- `closeInvestigation(investigationId, reason)`: Closes with reason

**Business Rules:**
- Active status auto-sets start date
- Closed status auto-sets end date
- Closing as "Unsubstantial" or "Inconclusive" cascades to actions

#### **SLAService**
Calculates and tracks SLA compliance.

**Key Methods:**
- `calculateSLADeadline(reportDate, slaConfig)`: Calculates deadline
- `checkSLAStatus(report, currentTime)`: Returns Active/Met/Breached
- `getSLAConfiguration(recordType)`: Retrieves SLA settings
- `getTimeRemaining(deadline, currentTime)`: Calculates countdown

**SLA States:**
- Active: Within SLA timeframe
- Met: Completed before deadline
- Breached: Exceeded deadline
- Not Applicable: Closed without SLA

#### **NewsIntegrationService**
Fetches relevant news from external API.

**Key Methods:**
- `fetchNews(searchTerms)`: Retrieves news articles
- `cacheNews(articles, cacheKey)`: Stores in cache (3-hour TTL)
- `getCachedNews(cacheKey)`: Retrieves from cache
- `formatNewsItems(rawData)`: Formats API response

**Integration Details:**
- API Endpoint: External news API
- Search Query: "whistleblower AND federal AND government AND USA"
- Cache Strategy: Platform cache with 3-hour expiration
- Response Format: JSON with source, title, description, image, URL

### 2. Controllers

#### **MainController**
Handles UI requests and data operations.

**Endpoints/Methods:**
- `GET /reports/user/{userId}`: Get user's reports
- `GET /reports/anonymous/{uniqueId}`: Get anonymous report
- `GET /investigations/report/{reportId}`: Get related investigations
- `GET /actions/investigation/{investigationId}`: Get actions taken
- `GET /support/report/{reportId}`: Get support tickets
- `POST /reports`: Create new report
- `PUT /reports/{reportId}`: Update report

### 3. Data Wrapper Pattern

**ReportWrapper**
Encapsulates report data with additional functionality:
```javascript
class ReportWrapper {
  - report: WhistleblowerReport
  - isNew: boolean
  - hasAccess: boolean
  - relatedInvestigations: Investigation[]
  - relatedActions: ActionTaken[]
}
```

---

## Frontend Components & User Interface

### 1. Main Components

#### **ReportViewerComponent**
Primary interface for report submission and viewing.

**Features:**
- Dual-mode access (authenticated/anonymous)
- Hierarchical data display
- Real-time updates
- Responsive grid layout

**Props/Inputs:**
- `userId`: Current user ID
- `isGuestUser`: Boolean for anonymous access
- `recordId`: Report ID for viewing

**Methods:**
- `loadUserReports()`: Fetches user's reports
- `searchByUniqueId(id)`: Finds anonymous report
- `refreshData()`: Updates display

#### **SLATrackerComponent**
Real-time SLA monitoring display.

**Features:**
- Live countdown timer
- Color-coded status badges
- Configurable field mappings

**Props/Inputs:**
- `recordId`: Report/Investigation ID
- `objectApiName`: Object type
- `deadlineFieldName`: Field containing deadline
- `closedDateFieldName`: Field for closure date

**Status Colors:**
- Green: Active (within SLA)
- Yellow: Met (completed on time)
- Red: Breached (overdue)
- Blue: Loading
- Orange: Error

#### **NewsFeedComponent**
Carousel displaying relevant news.

**Features:**
- Auto-rotation (7-second intervals)
- Manual navigation
- Image support
- External links

**Data Structure:**
```javascript
{
  imageUrl: string,
  title: string,
  description: string,
  source: string,
  articleUrl: string
}
```

#### **FAQAccordionComponent**
Expandable FAQ sections.

**FAQ Topics:**
1. What is a whistleblower?
2. Identity disclosure requirements
3. Report visibility and updates
4. Support contact options
5. Legal representation
6. Privacy protections
7. Investigation timelines
8. Evidence requirements
9. Self-protection measures
10. Job security concerns
11. Claim retraction process
12. Evidence submission methods
13. Retaliation protection

#### **FileGeneratorComponent**
Multi-format file download utility.

**Supported Formats:**
- JSON: Structured data export
- Text: Plain text format
- Markdown: Formatted documentation

**Use Case:** Provides downloadable reference for anonymous report IDs

#### **FlowRedirectComponent**
Post-submission navigation handler.

**Function:** Automatically redirects to report view after submission

#### **FullPageLayoutComponent**
Container for full-screen experiences.

**Props:**
- `backgroundColor`: Customizable background
- `content`: Slot for embedded components

---

## Workflow Automation & Business Processes

### 1. Automated Flows

#### **Report Submission Flow**
Multi-step wizard for report creation.

**Steps:**
1. **Terms Acknowledgment**
   - Display terms of service
   - Require acceptance checkbox
   
2. **Privacy Selection**
   - Fully Anonymous
   - Confidential
   - Non-Anonymous/Non-Confidential
   
3. **User Information** (if not anonymous)
   - Name, email, phone
   - Employment details
   
4. **Report Details**
   - Category selection
   - Severity assessment
   - Detailed description
   
5. **Queue Assignment**
   - Urgent → Initial_Evaluation_Queue_Urgent
   - Others → Initial_Review
   
6. **Approval Submission**
   - Auto-submit to approval process
   
7. **Confirmation**
   - Display unique ID for anonymous
   - Send email for non-anonymous

#### **Investigation Creation Flow**
Triggered on report status update.

**Logic:**
- When: Report first updated (contains 'WB-')
- Creates: Investigation record
- Sets: Initial status and assigns to queue
- Links: Creates Action record

#### **Investigation Lifecycle Flow**
Manages investigation status changes.

**Rules:**
- Status = Active → Set start_date = NOW
- Status = Closed → Set end_date = NOW
- Closed as Unsubstantial/Inconclusive → Update all actions to "No Action Taken"

#### **Support Ticket Flow**
Handles support request creation.

**Process:**
1. Identify user type (anonymous/authenticated)
2. Validate report access
3. Create support record
4. Send confirmation (non-anonymous only)

### 2. Approval Process

#### **Report Review Approval**
Evaluates jurisdiction and priority.

**Entry Criteria:** Status = "Initial Review"

**Step 1: Jurisdiction & Priority Check**
- Approver: Initial_Review queue
- Approval Actions:
  - Set within_office_jurisdiction = true
  - Set fits_within_office_priorities = true
- Rejection Actions:
  - Set status = "Closed"
  - Set status_reason = "Out of jurisdiction"
  - Send rejection email

**Final Approval:**
- Set status = "Under Investigation"
- Assign to Under_Investigation queue
- Send approval notification
- Lock record

### 3. Email Notifications

**Templates Required:**
1. **Submission Confirmation**
   - Recipient: Reporter
   - Content: Confirmation number, next steps
   
2. **Approval Notification**
   - Recipient: Reporter
   - Content: Investigation initiated
   
3. **Rejection - Jurisdiction**
   - Recipient: Reporter
   - Content: Out of scope explanation
   
4. **Rejection - Priority**
   - Recipient: Reporter
   - Content: Priority mismatch explanation
   
5. **Final Response**
   - Recipient: Reporter
   - Content: Investigation outcome

---

## Security & Access Control

### 1. Permission Models

#### **Administrator Permissions**
Full system access for investigation teams.

**Object Permissions:**
- Create, Read, Update, Delete all objects
- View All Records
- Modify All Records

**Field Access:**
- All fields read/write except formula fields
- Access to sensitive reporter information

**Additional Access:**
- All Apex classes
- All workflows and automations
- All reports and dashboards

#### **Portal User Permissions**
Limited access for reporters.

**Object Permissions:**
- Create: All objects
- Read: Own records only
- Update: Own records only
- Delete: None

**Field Restrictions:**
- Cannot edit: Assignee, Anonymous_Id, calculated fields
- Cannot view: Other users' data

**Flow Access:**
- Report submission flow
- Support ticket creation flow

### 2. Access Control Implementation

#### **Row-Level Security**
Formula-based access control using `has_access` field.

**Logic:**
```sql
has_access = (current_user_id == reporter_id) OR 
             (current_user HAS admin_permission) OR
             (current_user IN investigation_team)
```

#### **Field-Level Security**
Sensitive field protection.

**Protected Fields:**
- Reporter personal information (for anonymous)
- Investigation details (for reporters)
- Internal notes and assessments

### 3. Queue-Based Access

**Queue Structure:**
- Initial_Review: First-level reviewers
- Initial_Evaluation_Queue_Urgent: Senior reviewers
- Under_Investigation: Active investigators
- Whistleblower_Support: Support team

**Queue Members:**
- Groups: Whistleblower_Admins, Whistleblower_Investigators
- Individual users as needed

---

## API Integrations

### 1. News API Integration

**Endpoint:** External News API Service

**Authentication:** API Key (should be stored securely)

**Request Format:**
```json
{
  "q": "whistleblower AND federal AND government AND USA",
  "language": "en",
  "limit": 10,
  "seed": "<random_number>"
}
```

**Response Format:**
```json
{
  "articles": [
    {
      "source": {
        "name": "Source Name"
      },
      "title": "Article Title",
      "description": "Article Description",
      "urlToImage": "https://...",
      "url": "https://..."
    }
  ]
}
```

**Caching Strategy:**
- Cache Key: "WhistleblowerNewsFeed"
- TTL: 3 hours
- Fallback: Return empty array on failure

---

## Implementation Requirements

### 1. Technology Stack Considerations

#### **Backend Requirements**
- RESTful API framework
- ORM/Database abstraction layer
- Background job processing
- Caching mechanism (Redis/Memcached)
- Email service integration
- File storage service

#### **Frontend Requirements**
- Component-based UI framework
- State management solution
- Real-time update capability (WebSockets/Polling)
- Responsive design framework
- Accessibility compliance (WCAG 2.1)

#### **Database Requirements**
- ACID compliance
- Foreign key constraints
- Trigger/stored procedure support
- Full-text search capability
- Backup and recovery

### 2. Performance Requirements

**Response Times:**
- Page load: < 2 seconds
- API responses: < 500ms
- Search operations: < 1 second
- File uploads: Progress indication

**Scalability:**
- Support 10,000+ concurrent users
- Handle 100,000+ reports
- 1M+ API calls/day

### 3. Compliance Requirements

**Data Privacy:**
- GDPR compliance
- CCPA compliance
- Right to erasure
- Data portability

**Security Standards:**
- SOC 2 Type II
- ISO 27001
- HTTPS/TLS 1.3
- Data encryption at rest

---

## User Journey Flows

### 1. Anonymous Reporter Journey

```
Start → Portal Landing → Privacy Policy Review → 
Report Submission → Receive Unique ID → 
[Later] Check Status → View Updates → 
Submit Support Question → Review Response → End
```

### 2. Internal Reporter Journey

```
Start → Internal Login → Navigate to Whistleblower → 
Submit Report → Track in Dashboard → 
Receive Notifications → View Investigation → 
See Actions Taken → End
```

### 3. Investigator Journey

```
Start → Queue Assignment → Review Report → 
Accept/Reject Jurisdiction → Create Investigation → 
Document Findings → Create Actions → 
Update Statuses → Close Case → End
```

---

## Technical Specifications

### 1. Data Validation Rules

**Report Submission:**
- Report details: Required, 100-32768 characters
- Category: Required, valid enum value
- Terms acknowledged: Must be true
- Anonymous reports: No personal data required

**Investigation:**
- Linked to valid report
- Investigator must be active user
- Status transitions follow workflow

### 2. Business Logic Rules

**Severity Escalation:**
- Category = "Fraud" → Severity = "Urgent"

**Queue Assignment:**
- Severity = "Urgent" → Initial_Evaluation_Queue_Urgent
- Others → Initial_Review

**SLA Calculation:**
- Start: Report submission time
- Duration: From SLA_Settings configuration
- Exclusions: Weekends/holidays (if configured)

### 3. Integration Points

**Email Service:**
- SMTP configuration
- Template management
- Bounce handling
- Delivery tracking

**File Storage:**
- Evidence attachments
- Generated reports
- Document versioning
- Access control

**External APIs:**
- News service
- Translation services (if multi-language)
- Analytics platforms

---

## Testing & Quality Assurance

### 1. Test Coverage Requirements

**Unit Tests:**
- 90% code coverage minimum
- All service methods
- All data validations
- Error scenarios

**Integration Tests:**
- API endpoint testing
- Workflow automation
- Email delivery
- External API mocking

**UI Tests:**
- Component rendering
- User interactions
- Form validations
- Accessibility

### 2. Test Scenarios

**Anonymous Reporting:**
1. Submit without personal data
2. Retrieve using unique ID
3. Cannot access others' reports
4. Support ticket creation

**Investigation Flow:**
1. Report approval process
2. Investigation creation
3. Status transitions
4. Action cascading

**SLA Tracking:**
1. Deadline calculation
2. Real-time countdown
3. Status changes
4. Breach notifications

### 3. Performance Testing

**Load Testing:**
- 1000 concurrent report submissions
- 10000 concurrent read operations
- Queue processing under load
- Cache performance

**Security Testing:**
- SQL injection prevention
- XSS protection
- Authentication bypass attempts
- Data access violations

---

## Conclusion

This Whistleblower Management System provides a comprehensive solution for handling sensitive reports with appropriate security, workflow automation, and user experience considerations. The architecture is designed to be platform-agnostic while maintaining the sophisticated features required for enterprise-grade whistleblower management.

Key implementation priorities:
1. Security and anonymity
2. Workflow automation
3. SLA compliance
4. User experience
5. Audit trail
6. Scalability

The system can be implemented using various technology stacks while maintaining the core functionality and business logic described in this documentation.