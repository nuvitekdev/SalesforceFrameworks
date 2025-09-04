# Nuvi Permit Application - Complete Requirements Analysis & Implementation Plan

This document delivers an exhaustive requirements discovery, gap analysis, and implementation plan for a production‑ready Permits and Licensing application for Salesforce (LWC, Apex, LWR). It incorporates complete source transcription, research‑driven enhancements, and a prioritized roadmap. No code is implemented in this document.

## Executive Summary
- Scope: End‑to‑end Nuvi‑aligned permitting and licensing on Salesforce, including public portal, dynamic forms, document management, signatures, workflows, AI assistance, notifications, reporting, and compliance.
- Key findings: Core scaffolding exists (objects, LWC wizard, AI/Apex controllers, document/signature utilities). Significant data model expansion, security/sharing, accessibility, public portal LWR alignment, payments, GIS, and compliance hardening are needed.
- Critical gaps: Incomplete data model (many objects with few fields), missing tests, incomplete workflow orchestration definitions, LWR public portal configuration, payments, GIS, comprehensive access control, FedRAMP/FISMA/508 documentation, and complete transcription of diagram content not embedded in PDFs.
- Recommended approach: Metadata‑driven dynamic forms; AI‑assisted intake; strict security model with profiles/perm sets/sharing; Experience Cloud LWR public portal; pay.gov payments; ArcGIS/USGS GIS; platform events for notifications; robust test coverage; USWDS+508 WCAG 2.1 AA; NIST SP 800‑53 control mapping.

## 1. Source Documentation Complete Transcription

### 1.1 Nuvi APD Form Data Dictionary (Transcription)
The following is a faithful, page‑by‑page text extraction of the “Nuvi APD Form Data Dictionary.pdf”. Minor spacing artifacts are from PDF text extraction; the content and order are preserved.

```
=== Page 1 ===

ADP  3160-3  Form  Fields  
(based  on  AFMSS  electronic  form  example)  
Operator  Information  Section  
Desc  Field  Type  Field  Size  Req'd  Values  
Operator  Name  Text  255  Yes  Legal  entity  
Address  Text  255  Yes  Mailing  address  
City  Text  100  Yes   
State  Dropdown  2  Yes  US  states/territories  
Zip  Code  Text  10  Yes  #####  /  #####-####  
Contact  Name  Text  150  Yes  Primary  representative  
Contact  Phone  Text  20  Yes  ###-###-####  
Contact  Email  Text  150  Yes  Valid  email  
Bond  Number(s)  Text  30  Yes  Fed  or  state  well  bond  
Bond  Type  Dropdown  N/A  Yes  Nationwide,  Statewide,  Lease,  Individual  Well  
 
Lease/Agreement  Information  Section   
Desc  Field  Type  Field  Size  Req'd  Values  
Lease  Type  Single-select,  dropdown  or  checkbox  or  radio  button  
N/A  Yes  Federal,  State,  Fee,  Tribal  
Will  this  well  produce  from  this  lease?  
Single-select,  dropdown  or  checkbox  or  radio  button  
N/A  Yes  Yes  No  
Lease  Number  Text  30  Yes  e.g.,  NM-12345  
Unit  or  CA  Agreement  Number  
Text  30  No   
Elevation  (MSL)  Text  100  Yes   
Latitude  Text  100  Yes   

=== Page 2 ===

Longitude  
State  Text  100  Yes   
Meridian  Text  100  Yes   
County  Text  100  Yes   
Township  Text  100  Yes   
Range  Text  100  Yes   
Section  Text  100  Yes   
 
Well  Pad  Information   
Desc  Field  Type  Field  Size  Req'd  Values  
Pad  Name  Text  100  Yes  Operator-assigned  
Pad  ID  System/Auto  N/A  System  Auto-generated  in  AFMSS  
Number  of  Wells  on  Pad  
Number  3  Yes  Integer  
Surface  Ownership  Dropdown  N/A  Yes  Federal,  Tribal,  State,  Fee  
Surface  Owner  Name  Text  150  Conditional  Required  if  non-federal  
Pad  Polygon  /  Map  GIS  Upload  N/A  Yes  Shape  file,  KMZ,  etc.  
Access  Road  Description  
Text  1000  Conditional  Required  if  new  road  
Facilities  on  Pad  Multi-select  N/A  Optional  Separator  tanks,  flare,  compressor,  etc.  
 
Well  Information   
Desc  Field  Type  Field  Size  Req'd  Values  
Well  Name  &  Number  Text  100  Yes  Must  follow  API  naming  
API  Well  Number  Text  15  Conditional  Assigned  if  existing  wellbore  
Well  Type  Dropdown  N/A  Yes  Oil,  Gas,  CBM,  Injection,  Exploratory  
Well  Orientation  Dropdown  N/A  Yes  Vertical,  Directional,  Horizontal,  Sidetrack  
Field/Pool  Name  Text  100  Yes  Reservoir  name  

=== Page 3 ===

Proposed  MD  /  TVD  Number  6,0  Yes  Depth  in  feet  
Bottom  Hole  Location  PLSS  /  Lat-Long  
N/A  Yes  Coordinates  
Surface  Hole  Location  PLSS  /  Lat-Long  
N/A  Yes  Coordinates  
Kickoff  Point  Number  6,0  Conditional  Required  for  directional/horizontal  
H 2 S  Program  Required  Checkbox  Conditional  Yes/No   
Is  this  a  reentry?  Checkbox  Yes  Yes/No   
 
Drilling  Plan  Information   
Desc  Field  Type  Field  Size  Req'd  Values  
Drilling  Plan  Narrative  File  Upload  N/A  Yes  PDF/Word  
Casing  Program  Table  Table  N/A  Yes  Casing  size,  grade,  weight,  setting  depth  
Cement  Program  Table  Table  N/A  Yes  Slurry  design,  yield,  interval  
Mud  Program  Text  1000  Yes  Type,  properties,  weight  
BOP  Program  Dropdown  +  Text  
N/A  Yes  Surface/intermediate/production  details  
Expected  Formation  Pressures  
Text  1000  Optional  psi  ranges  
Expected  Freshwater  Zones  
Text  1000  Yes  Protection  requirements  
Expected  Lost  Circulation  Zones  
Text  1000  Optional  Narrative  
Variance  Requests  Multi-line  Text  1000  Conditional  Specific  CFR  variances  
 
Surface  User  Plan  of  Operations  (SUPO)   
Desc  Field  Type  Field  Size  Req'd  Values  
SUPO  Narrative  File  Upload  N/A  Yes  PDF/Word  
Existing  Roads  Description  
Text  1000  Yes  Condition,  upgrades  
New  Road  Description  Text  1000  Conditional  Required  if  new  construction  

=== Page 4 ===

Location  of  Facilities  Text/Map  N/A  Yes  On/near  pad  
Water  Source  Text  500  Yes  Source  name,  capacity  
Reclamation  Plan  Text  1000  Yes  Interim  &  final  
Cultural/Archaeological  Survey  
File  Upload  N/A  Conditional  Required  in  sensitive  areas  
Wildlife/Vegetation  Surveys  
File  Upload  N/A  Conditional  If  applicable  
```

### 1.2 Permitting Nuvi Process Document (Extraction and Normalization)
The original PDF contains notes, draft workflows, and high‑level requirements (with significant line‑break artifacts due to formatting). The content is transcribed and normalized below to be self‑contained in this README (no separate raw OCR file retained).

Below is a normalized, comprehensive extraction capturing all workflows, screen intents, and requirements present in the source.

- Submission & Intake
  - Permit Wizard for discovery and application selection (lists direct and related permits; search capability).
  - Applicant profile capture (business/personal); system pre‑fills forms from profile/previous submissions.
  - Minimize redundant data entry; enforce required fields only.
  - Operator involvement toggle (notify/not notify operator by email/portal).
  - Auto‑assignment to Natural Resource Specialist; set intake SLA (e.g., 30 business days).

- Review & Assessment
  - Initial completeness check and RFI loop to applicant.
  - Internal tasks queue by stage; SLA tracking per stage.
  - Multi‑agency review configuration (federal/state/tribal/local as applicable).
  - AI assists with document verification and missing element detection.

- Environmental Analysis (EA) Review & Approval
  - Determine environmental review level (e.g., CX/EA/EIS, or agency equivalent) and prerequisites.
  - Coordinate specialist reviews (wildlife, cultural, hydrology, air, etc.).
  - Public comment readiness check (document set complete, redactions as needed).

- Public Comment Period
  - Publish to public portal; accept and track comments; analyze themes.
  - AI summarization of comments and controversy indicators.
  - Document repository for public‑facing artifacts vs internal artifacts.

- Finalize EA
  - Consolidate findings; mitigation requirements and conditions of approval.
  - Routing for multi‑party approvals; decision record creation.
  - Update timelines; capture decisions and rationale.

- Signature & Distribution
  - Multi‑party electronic signature sequencing based on role.
  - Generate final permit package; distribute to applicant and agencies.
  - Archive with records schedule; FOIA export readiness.

- Additional notes captured
  - Focus area: Oil and natural gas drilling (onshore/offshore) as initial use case.
  - Permit discovery via custom checklists to suggest related permits.
  - Reference to BLM AFMSS APD user guide showing all APD fields.
  - Links/refs mentioned: BLM reporting, official lease search, field mapping spreadsheets.

### 1.3 Lucid Diagram Analysis
- The PDFs reference a stage sequence consistent with: Submission → Intake → Review & Assessment → EA Review & Approval → Public Comment Period → Finalize EA → Signature & Distribution.
- Explicit Lucid diagrams were not embedded in the extracted text. Action: obtain Lucid links or source images to validate stage owners, SLAs, decision gateways, and integrations.
- Implications for design: stage‑based task orchestration, clear entry/exit criteria per stage, async notifications, public/private artifact segregation, and auditable approval chains.

### 1.4 Screen‑by‑Screen Breakdown (Derived from PDFs)
- Landing & Permit Discovery
  - Permit Wizard entry; search permits; suggested related permits via checklist.
  - Authentication or guest start; save‑and‑resume; language/accessibility options.
- Applicant Profile
  - Business legal entity; addresses; contacts; bond info (numbers/types).
  - Operator linking (if distinct from applicant); opt‑in notifications.
- Lease/Agreement Details
  - Lease type (Federal/State/Fee/Tribal); lease number; unit/CA agreement number.
  - Location: State, County, Meridian, Township, Range, Section; Elevation (MSL), Lat/Long.
- Pad Information
  - Pad name/ID; number of wells; ownership; owner name; pad polygon/map upload; access road.
- Well Information
  - Well name/number; API well number; type; orientation; field/pool name; MD/TVD; kickoff; surface/bottom hole locations.
- Drilling Plan
  - Narrative upload; casing program table; cement program table; mud program; BOP program; H2S program flag.
- SUPO (Surface Use Plan of Operations)
  - Narrative upload; existing/new roads; location of facilities; water source; reclamation.
- Environmental & Surveys
  - Cultural/archaeological survey upload; wildlife/vegetation surveys; environmental review prerequisites.
- Attachments & Required Documents
  - Dynamic, permit‑type‑driven list; accepted formats/size; virtual folder placement.
- Review & Validation
  - Client‑side + server validations; AI suggestions and missing element checks; fee preview.
- Payment
- Fee calculation; pay.gov hosted/co-hosted checkout sequence; receipt capture; payment record creation.
- Signatures
  - Multi‑party electronic signatures; role‑based sequencing; audit trail.
- Status & Notifications
  - Timeline, SLA counters; stage summaries; message center; public comment status when applicable.

### 1.5 Business Rules & Validations (Extracted)
- Formats: ZIP (`#####` or `#####-####`), phone (`###-###-####`), email valid; numeric ranges for depths; MD/TVD numeric precision; dropdown enumerations per dictionary.
- Conditionality: Surface owner name required if non‑federal; API number when existing wellbore; kickoff point required for directional/horizontal wells; SUPO/road descriptions when new construction; cultural/wildlife surveys when in sensitive areas.
- Required uploads: Drilling plan narrative; casing/cement program tables; SUPO narrative; surveys based on location sensitivity.
- GIS artifacts: Pad polygon/map required; coordinates for surface and bottom hole locations.
- Completeness checks: All required fields and documents must be present prior to payment/signature.

### 1.6 User Roles & Permissions (Proposed)
- Applicant/Submitter: Create/edit own applications, upload documents, view status, perform payments, sign as applicant.
- Operator (if distinct): View applications tied to operator; sign operator sections; receive notifications.
- Intake Specialist: View new submissions, perform completeness checks, send RFIs, update status.
- Agency Reviewer/Specialist: Access assigned records, add findings/conditions, approve/reject steps.
- Supervisor/Approver: Final approvals, override, stage transitions; audit review.
- FOIA Officer/Records: Export/redact, manage retention, public/private classification.
- Public Viewer: Access published notices and public comment submission.
- Admin: Configure metadata, manage users/permissions, monitor integrations.

### 1.7 Integration Points (Initial Set)
- Payments: pay.gov (REST), transaction status callbacks, reconciliation reports.
- GIS: ArcGIS REST Maps/Feature Services; USGS/USFWS overlays; geocoding APIs.
- Email/SMS: Gov‑approved providers; templates; event triggers.
- Public Comments: Portal intake; optional integrations with gov publishing systems.
- FOIA/Records: Export packages; redaction workflows; retention schedules (NARA).
- AI Services: Existing LLM controller + prompt templates; document analysis; field extraction; anomaly detection.

## 2. Current State Inventory

### 2.1 Existing Components Analysis
- LWC (this package): `nuviPermitApplicationWizard`, `nuviPermitDocumentManager`, `nuviPermitSignatureManager`.
- Apex (selected): `Nuvi_Permit_FormController` (dynamic forms, fees, validation), `Nuvi_Permit_DocumentController`, `Nuvi_Permit_SignatureController`, `Nuvi_Permit_AIController`, `Nuvi_Permit_WorkflowOrchestrator`, `APDApplicationService`, `PermitAIService`.
- Objects (selected): `APD_Application__c` (25 fields), `Well_Information__c` (6 fields), `Document_Package__c` (16 fields), `Drilling_Plan__c`, `Casing_Program__c`, `Cement_Program__c`, `Surface_Use_Plan__c`, `Environmental_Assessment__c`, `NEPA_Assessment__c`, `Lease_Agreement__c`, `Well__c`, `Well_Pad__c`, `Payment_Record__c`, `Operator__c`, `Agency_Review__c`, `Permit_Form_Config__mdt` (6 fields).
- Experience Cloud: `Government_Documents_Portal1` exists (template details TBD); aligns to public portal goal but needs LWR alignment and page composition.

### 2.2 Available Utilities
- `force-app/main/UtilityComponents/pdfSigner` (Apex + LWC + static resources) for in‑platform PDF signing.
- `force-app/main/UtilityComponents/nuviAIANDSupportANDTheme/nuviAI` including `LLMController` pattern, LLM metadata (`LLM_Configuration__mdt`, `LLM_Prompt_Template__mdt`), and assistant LWCs.
- Theme and layout utilities under `nuvitekCustomThemeLayoutAndAccess` plus common UI components (e.g., `heroBanner`, `supportRequester`).

### 2.3 Theme Components
- NuviTek theme layout and navigation LWCs/Aura support consistent branding; should be applied across portal and console apps.

### 2.4 AI Components
- Reusable LLM controller pattern (Apex) and assistant LWCs; supports multi‑provider LLMs, document analysis, comparisons, and caching.
- PAL‑specific AI Apex classes present (`Nuvi_Permit_AIController`, `PermitAIService`) for document analysis, field extraction, environmental checks.

## 3. Comprehensive Gap Analysis

### 3.1 Gap Analysis Matrix

| Requirement | Current State | Gap | Priority | Effort | Dependencies | Suggested Solution |
|------------|---------------|-----|----------|--------|--------------|-------------------|
| Complete APD data model | `APD_Application__c` has many core fields; related objects exist | Operator/bond, lease details, SUPO, drilling plan tables incomplete | P0 | L | APD dictionary | Add fields per Section 1.1; normalize picklists; relationships to Operator/Lease/Well/Pad |
| Drilling/Casing/Cement tables | Objects exist but with 0 fields | Missing detailed program structures | P0 | M | APD dictionary | Create related child objects or JSON metadata to store tabular specs with validation |
| Surface Use Plan (SUPO) | Object exists, fields absent | SUPO narrative, roads, facilities, reclamation | P0 | M | APD dictionary | Add SUPO fields, file uploads, GIS links; validation |
| Environmental/NEPA | Objects exist with minimal fields | Review level, specialists, findings, mitigation | P0 | M | Policy refs | Expand `Environmental_Assessment__c`, `NEPA_Assessment__c`; link to `Document_Package__c` |
| Lease/Agreement modeling | `Lease_Agreement__c` minimal | Lease type, number, unit/CA linkage | P0 | S | APD dictionary | Add fields; enforce referential integrity to applications |
| Well/Pad modeling | Base objects present | Missing pad facilities, well orientation, kickoff, locations | P0 | M | APD dictionary | Add fields + GIS geometry refs; link to application |
| Validation rules | Minimal | Field formats, conditional requirements | P0 | M | Data dictionary | Implement VRs per dictionary (zip, phone, email, numeric ranges) |
| Sharing/security model | Not defined here | Profiles, perm sets, object/field perms, sharing | P0 | M | Org context | Define RBAC by role; private OWD; record sharing via teams/queues |
| Public portal (LWR) | Experience site present | Confirm LWR template; page structure, auth, theming | P0 | M | Site license | Stand up LWR template; compose wizard/status pages; SSO |
| Payments | No payment integration | Fee calc exists; payment processing missing | P0 | M | pay.gov | Integrate pay.gov; Payment record; refund/void; reconciliation |
| GIS integration | Not present | Parcel/pad map, layers, proximity | P0 | M | ArcGIS/USGS | ArcGIS REST maps; store coordinates; proximity analysis service |
| Notifications | Partial via Apex tasks | Email/SMS/push templates and events | P1 | S | Gov comms | Platform Events + Transactional email/SMS; notify applicant/agency |
| Approvals | Signatures controller exists | End‑to‑end approval chains and audit | P1 | M | Policy | Configure approval processes; integrate with signature sequencing |
| Reporting/analytics | Not defined | Operational and compliance dashboards | P1 | M | Data model | Reports/dashboards; Tableau CRM optional; audit metrics |
| AI permits assistant (LWC) | Not present | `permitsAI` UI missing | P1 | M | nuviAI | New LWC reusing LLM controller + metadata; field mapping |
| OCR/auto-extraction | AI Apex exists | Broader OCR, templates, confidence UX | P1 | M | pdf libs | Enhance AI pipelines; capture confidence and human-in-the-loop |
| Test coverage | No tests in PAL package | <85% coverage | P0 | M | CI/CD | Add Apex tests for controllers/services and happy/error paths |
| Compliance docs | Not present in repo | SSP, 508 VPAT, control mappings | P0 | M | Security team | Produce artifacts aligned to NIST 800‑53/FedRAMP/508 |
| FOIA support | Not explicit | Redaction/export, retention mapping | P1 | S | NARA | Add FOIA export job, redaction workflow, retention tags |
| Accessibility | Not enforced | USWDS + WCAG 2.1 AA gaps | P0 | M | UX audit | USWDS tokens/components; accessibility testing plan |
| Audit logging | Partial (platform) | Fine‑grained business audit logs | P1 | S | Sec reqs | Field history, event monitoring, immutable logs for key actions |
| Mobile inspector | Not present | Field app for inspections | P2 | L | MDM | Mobile app via Field Service/LWR mobile; offline forms |
| Inter‑agency APIs | Not present | Inbound/outbound exchange | P2 | M | MOUs | OpenAPI spec; NIEM‑aligned payloads; endpoints |

Legend: Priority (P0 critical → P2 nice‑to‑have), Effort (S/M/L T‑shirt sizing).

### 3.2 Data Model Gaps (detail)
- Operator: legal entity, contacts, bond numbers/types; relationship to APD applications.
- Lease: type, number, state/tribal/federal indicator; unit/CA link; meridian/T/R/S.
- Well/Pad: API number, orientation, MD/TVD, kickoff, surface/bottom hole locations (PLSS/Lat‑Long), pad facilities and ownership.
- Drilling/Casing/Cement: structured child records for program tables; validations (grades/weights/depths).
- SUPO: narratives, roads (existing/new), facilities map, water source, reclamation, surveys (cultural/archaeological, wildlife/vegetation) with file uploads and conditional rules.
- Environmental/NEPA: review level, specialists, findings, mitigation, timelines, required coordination and public comment tracking.
- Payments: fee schedule snapshot, method, transaction IDs, status, reconciliation references.

### 3.3 Component Gaps
- AI intake assistant UI (`permitsAI`) absent; needs LLM config selector, context scoping, auto‑suggestions, and validation feedback.
- Public portal wizard/status pages not composed; need LWR pages and unauth/SSO access.
- Document manager to integrate virtual folders + AI verification + signature routing dashboards.

### 3.4 Integration Gaps
- Payments (pay.gov), GIS (ArcGIS/USGS), email/SMS, public comment intake, FOIA export, and inter‑agency APIs.

### 3.5 Security & Compliance Gaps
- RBAC model, OWD/sharing rules, permission sets, row‑level sharing for multi‑agency access, FedRAMP boundary documentation, ATO artifacts, Section 508 VPAT, audit/event monitoring.

### 3.6 User Experience Gaps
- USWDS‑aligned theming and WCAG 2.1 AA checks; progressive disclosure to minimize noise; mobile‑responsive public portal patterns; inline AI suggestions with explainability.

## 4. Research Findings & Recommendations

### 4.1 Government Permit System Best Practices (selected leaders)
- Accela Civic Platform: extensive permitting/licensing, inspections, plan review, public portal.
- Tyler EnerGov: land management, licensing, plan review, mobile inspections.
- OpenGov Permitting & Licensing (ViewPoint): cloud permitting with public portal and workflows.
- Oracle Public Sector Compliance and Regulation: enterprise permitting/inspections/plan review.
- Clariti (cloud permitting): modern UX, configuration‑first, public portal and contractor accounts.
- Also relevant: Salesforce Public Sector Solutions (Permits/Licensing), Granicus, Cityworks for work/asset integration.

Common features beyond PDFs:
- Public portal with account creation, permit discovery, intelligent checklists, and status tracking.
- Integrated payments with dynamic fee calculation, refunds, and reconciliation.
- Mobile inspector apps with scheduling, geotagging, and offline.
- GIS parcel/overlay lookup and proximity analysis.
- Plan review tools (markup, revisions), hearings scheduling, public comment management.
- Robust reporting/analytics and audit/compliance dashboards.

### 4.2 Recommended Additional Features
- Public comment workspace with AI summarization and deduplication.
- Renewal automation with reminders, proration, and late fees.
- Contractor/vendor registry and license validation.
- Code enforcement integration (cases/violations, citations).
- Inter‑agency collaboration space with controlled sharing.
- Auto‑generated decision documents with clause libraries.
- Full audit logging with immutable append‑only store for key events.

### 4.3 Technology Stack Recommendations
- Authentication: SSO (SAML/OIDC), MFA (NIST 800‑63‑3 AAL2), device trust where applicable.
- Architecture: API‑first; metadata‑driven forms; event‑driven (Platform Events) for notifications; batch/queued processing for heavy tasks.
- Public Portal: Experience Cloud LWR template; USWDS tokens; guest access (limited) + account/SSO.
- GIS: ArcGIS REST + hosted maps; store WKT/GeoJSON as text for geometry snapshot; geocoding as needed.
- Notifications: Email templates; SMS via approved providers; in‑app and portal notifications.
- Analytics: Standard Reports/Dashboards; optional Tableau CRM; event logs for ops metrics.
- Document OCR: AI‑backed extraction; confidence scoring with human review; pdfSigner for e‑sign.
- Optional: Blockchain for permit verification (hash anchoring), IoT telemetry for monitored activities (future).

### 4.4 Compliance & Security Enhancements
- Accessibility: Section 508 (WCAG 2.0 AA) with aim for WCAG 2.1 AA; USWDS components; automated and manual testing.
- Security: FISMA/NIST SP 800‑53 Rev 5; RMF (SP 800‑37); FedRAMP boundary if SaaS; FIPS 199/200 categorization.
- Identity: NIST 800‑63‑3 digital identity; PIV/CAC where needed; JIT provisioning for portal.
- Records/FOIA: NARA retention schedules; FOIA export and redaction workflow; public/private segregation.
- Privacy: SORN/PIA as applicable; data minimization; consent and notices.

### 4.5 Salesforce Feasibility (OOTB vs Custom)
This plan includes everything requested, tapered to Salesforce capabilities. The matrix below clarifies configuration vs custom work using LWC/Apex.

| Capability | OOTB/Config | Custom (LWC/Apex) | Notes/Constraints |
|---|---|---|---|
| Authentication (SSO/MFA, PIV/CAC via SAML) | Yes | — | SSO via Auth Providers/SSO; MFA standard; CAC through SAML IdP. |
| Experience Cloud Public Portal (LWR) | Yes | Page LWCs | Requires Experience Cloud licenses; LWR CSP; no Aura on LWR pages. |
| Permit Wizard (multi‑step, metadata‑driven) | — | Yes | Implemented via LWC + `Permit_Form_Config__mdt` + Apex services. |
| Dynamic Forms on record pages | Yes | — | For standard record pages; wizard still needs custom LWC. |
| Data Model (objects/fields/VRs) | Yes | — | All schema+validations are config (metadata). |
| Document Uploads & Files | Yes | Optional | Uses Files/ContentVersion; foldering via custom fields/UI patterns. |
| PDF Signing | — | Yes | Use provided `pdfSigner` (custom). 3rd‑party e‑sign also possible. |
| Approvals | Yes | Optional | Standard Approval Processes; advanced routing may use Apex. |
| Payments (pay.gov) | — | Yes | Named Credentials + External Services/callouts; custom LWC checkout. |
| GIS Maps/Proximity | — | Yes | Custom LWC embedding ArcGIS REST; CSP Trusted Sites; caching. |
| Notifications (email) | Yes | Optional | Apex emails (Messaging.SingleEmailMessage) or Email Alerts invoked by Apex; Platform Events for orchestration. |
| Notifications (SMS/push) | — | Yes | Requires provider integration (Apex callouts) or Marketing Cloud add‑ons. |
| Public Comment Intake | Partial | Yes | Experience forms + custom objects/moderation workflow + AI summaries. |
| Reporting & Dashboards | Yes | — | Operational/compliance dashboards; optional Tableau CRM add‑on. |
| Audit & History | Yes | Optional | Field History Tracking; Event Monitoring (add‑on) for user activity logs. |
| FOIA/Redaction/Export | — | Yes | Custom export sets, redaction workflow; consider external tools for redaction. |
| Mobile Inspectors | Partial | Yes | Salesforce Mobile supports; offline/inspection best with Field Service add‑on. |
| AI Assistant (permitsAI) | — | Yes | Reuse `LLMController` + metadata; Named Credentials for providers. |

Key platform constraints and assumptions
- Experience Cloud LWR: Use LWC only; validate external domains (CSP Trusted Sites); guest user data access is tightly restricted-prefer authenticated accounts for submissions.
- No Flow usage: All automation/orchestration implemented via Apex and LWC; no Salesforce Flow (screen, record-triggered, or autolaunched) is used.
- Payments: No native pay.gov; implement secure callouts with Named Credentials; store transaction IDs/status; adhere to PCI scope guidance.
- GIS: No native ArcGIS embedding; use JS SDK/REST from LWC; performance tune and cache layer queries.
- E-Signatures: Custom `pdfSigner` is in-org; for FedRAMP-bound environments, confirm solution compliance or use approved vendors.
- AI: External LLMs require Named Credentials; respect FLS/sharing; avoid sending sensitive data; provider availability varies by GovCloud.
- Eventing: Use Platform Events for decoupled notifications/processes; governor limits apply-queueable/batch where needed.

## 5. Implementation Roadmap

Tags: [Apex], [LWC]. Untagged items are configuration/operations.

### 5.1 Phase 1: Foundation (Weeks 1‑4)
- Finalize data model per APD dictionary; add validation rules and picklists.
- Define RBAC: profiles, permission sets, OWD, sharing rules, queues/teams.
- Set up Experience Cloud LWR site skeleton; apply NuviTek theme; basic navigation.
- Establish CI/CD, code quality gates, and baseline Apex test scaffolding. [Apex]

### 5.2 Phase 2: Core Features (Weeks 5‑8)
- Build dynamic form configs in `Permit_Form_Config__mdt`; extend `Nuvi_Permit_FormController` parsing and validation rules. [Apex]
- Compose LWC wizard screens. [LWC]
- Integrate document manager. [LWC]
- Implement fee calculation with payment intent. [Apex]
- Implement workflow orchestration (Apex-only) for Submission → Intake → Review & Assessment. [Apex]
- Integrate pdfSigner with signature sequencing. [LWC][Apex]
- Define approval processes (submit/advance via Apex). [Apex]

### 5.3 Phase 3: Advanced Features (Weeks 9‑12)
- GIS maps (ArcGIS embed). [LWC]
- Proximity analysis service. [Apex]
- Environmental/NEPA Apex services and data model extensions. [Apex]
- Public comment intake UX and moderation workspace. [LWC]
- Public comment analysis and publishing orchestration. [Apex]
- Reporting and dashboards (ops + compliance).
- Audit logging and event monitoring; custom audit events if required. [Apex]
- Payment integration with pay.gov; reconciliation jobs; refunds/voids. [Apex]

### 5.4 Phase 4: AI & Automation (Weeks 13‑16)
- `permitsAI` LWC built on nuviAI metadata pattern; field mapping, autosuggestions, and validation assist. [LWC][Apex]
- Document OCR/auto‑extraction confidence UX; human‑in‑the‑loop corrections. [LWC][Apex]
- Predictive SLAs and risk scoring; proactive notifications; renewal automation groundwork. [Apex]
- Accessibility and security verification; performance testing; launch readiness.

## 6. Technical Specifications

- Data Model
  - Extend `APD_Application__c`, `Operator__c`, `Lease_Agreement__c`, `Well__c`, `Well_Pad__c` per Section 1.1.
  - Child tables: `Casing_Program__c`, `Cement_Program__c`, `Drilling_Plan__c` detail records with validation.
  - `Surface_Use_Plan__c` with narratives + uploads; conditional fields; GIS refs.
  - `Environmental_Assessment__c`, `NEPA_Assessment__c` with review level, coordination, findings, mitigation.
  - `Payment_Record__c` with pay.gov IDs, status, amount, method, settlement date.

- Apex Layer (no implementation in this doc)
  - Services: application intake, validation, fee calculation, payment orchestration, GIS proximity, AI assist.
  - Trigger handlers (as needed) for status transitions; bulk‑safe patterns.
  - Batch/queueables for heavy processing (document AI, GIS batch checks, payment reconciliation).
  - REST APIs for public portal operations (if required) with strict auth and rate limiting.
  - Tests: target >85% coverage; include negative paths and bulk tests.

- LWC Components
  - Use existing wizard/doc/signature LWCs; add `permitsAI` LWC modeled on `nuviAI` assistant with metadata config.
  - Reuse `pdfSigner` for signatures; incorporate `signature_pad` resource in workflow.
  - Apply NuviTek theme components across portal and console.

- `permitsAI` LWC Specification (no implementation)
  - Purpose: AI‑assisted intake and review — auto‑suggest field values, validate completeness, explain requirements, and map document content to fields.
  - Inputs: `recordId` (optional), `permitType`, `agencyType`, `contextScope` (fields/related/documents), `promptTemplateName`.
  - Outputs/Events: `suggestions` (field/value/confidence), `missingItems`, `risks`, `applySuggestions` event, `validateRequest` event.
  - Services: Calls existing `LLMController` (or `LLMControllerRefactored`) via Apex wrapper; uses `LLM_Configuration__mdt` and `LLM_Prompt_Template__mdt` for provider/model selection and prompts.
  - UX: Inline suggestion chips, confidence badges, "why" explainers, one‑click apply with undo, accessibility‑first controls.
  - Security: Respects FLS/sharing; redact/omit sensitive fields from prompts; Named Credentials for API keys.

- Public Portal (LWR)
  - Template: LWR Experience; guest access (limited), account/SSO; status tracker; payments; public comments.
  - Accessibility: USWDS tokens; keyboard/contrast validation; error messaging standards.

- Notifications
  - Platform Events + email/SMS; message templates; SLA breach alerts; applicant status updates.

## 7. Risk Assessment & Mitigation
- Security/ATO: Early engagement with ISSO; produce SSP/control mappings; boundary diagrams; scanning.
- Data quality: Enforce validations; AI suggestions with human review; audit corrections.
- Integration risk: Stub/fallback modes; robust error handling; retries and alerting.
- Change management: Metadata‑driven forms minimize code changes; strong versioning.
- Accessibility: Formal 508 testing; iterative UX reviews; include assistive tech users in UAT.

## 8. Resource Requirements
- Roles: Salesforce architect, Apex/LWC engineers, UX/Accessibility specialist, GIS engineer, DevOps, QA, Security/Compliance, Product owner, SME(s) for permits/NEPA.
- Tools: Salesforce org(s), Experience Cloud, Dev Hub/CI, code scanning, testing tools, ArcGIS, pay.gov sandbox, monitoring/logging.

## 9. Success Metrics
- Time‑to‑permit: target >40% reduction; SLA adherence >95%.
- First‑time completeness rate: >80% with AI assist.
- Public comment processing time: reduced by >50% with summarization.
- Accessibility conformance: WCAG 2.1 AA; zero critical defects at launch.
- Test coverage: >85%; defect escape rate <2% post‑go‑live.

## 10. Key Research Questions — Answers
- Top 5 government permit systems: Accela Civic Platform; Tyler EnerGov; OpenGov Permitting & Licensing (ViewPoint); Oracle Public Sector Compliance and Regulation; Clariti. Also relevant: Salesforce Public Sector Solutions.
- Modern features beyond PDFs: Public portal accounts and discovery; mobile inspections; GIS overlays; plan review/markups; integrated payments/refunds; renewals; hearing scheduling; comment management; analytics; robust audit and FOIA tooling.
- Federal accessibility requirements: Section 508 (Refresh) aligned to WCAG 2.0 AA; recommended target WCAG 2.1 AA; use USWDS components; conduct automated + manual AT testing.
- Security frameworks for Nuvi: FISMA; NIST SP 800‑53 Rev 5 controls; RMF (NIST 800‑37); FedRAMP for cloud services; FIPS 199/200 categorization; NIST 800‑63‑3 for identity (MFA/SSO); OMB zero‑trust directives as applicable.
- Public records requests handling: FOIA processes with retention schedules (NARA), redaction workflows, exportable record sets, audit logs; separation of public vs internal artifacts.
- Permit fee processing best practices: Calculate fees upfront; integrate with pay.gov; capture transaction IDs and status; support refunds/voids; nightly reconciliation; clear receipts; prevent duplicate payments; handle partials where policy allows.
- Tribal sovereignty considerations: Respect EO 13175; dedicated consultation steps; restricted data handling for sensitive locations; configurable review participants; capture tribal input and agreements.
- Environmental review integrations: Support CX/EA/EIS pathways; integrate environmental datasets and services (e.g., USFWS IPaC, EPA datasets, USGS layers); track specialist reviews and mitigation.
- Standard APIs for integration: No single federal permit API; recommend OpenAPI‑first, NIEM‑aligned schemas for inter‑agency exchange; OGC standards for GIS; pay.gov for payments; standard REST/JSON + webhooks.

### References (selected)
- Section 508 / WCAG: https://www.section508.gov/ and https://www.w3.org/TR/WCAG21/
- USWDS Design System: https://designsystem.digital.gov/
- NIST SP 800‑53 Rev 5: https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final
- NIST Digital Identity (800‑63‑3): https://pages.nist.gov/800-63-3/
- FedRAMP: https://www.fedramp.gov/
- pay.gov: https://www.pay.gov/
- ArcGIS REST API: https://developers.arcgis.com/rest/

## Appendices

### A. Glossary of Terms
- APD: Application for Permit to Drill. SUPO: Surface Use Plan of Operations. NEPA: National Environmental Policy Act. EA/EIS/CX: Environmental review levels.

### B. Reference Architecture Diagrams
- Pending Lucid exports (not embedded in PDFs). Request source links to incorporate precise diagrams.

### C. Compliance Checklist (excerpt)
- NIST SP 800‑53 Rev 5 controls mapped to features (AC, AU, IA, SC, SI families).
- Section 508/WCAG 2.1 AA verification plan (keyboard, contrast, labels, focus, error handling, media).
- Records/FOIA readiness (retention, redaction, export, audit, public/private segregation).
- Privacy (PIA/SORN), consent banners/notices, cookie policies per OMB.

### D. Testing Strategy
- Unit tests for Apex services/controllers; component tests for LWCs.
- Integration tests for payments, GIS, AI; perf tests for peak intake.
- Accessibility testing with automated tooling + manual AT sessions.

### E. Apex Orchestration Patterns (No Flow)
- Layered architecture: Triggers → thin Trigger Handlers → Service classes → Domain logic; keep business rules in services; keep triggers bulk‑safe and minimal.
- Status machine: Centralize application status transitions in a service; validate allowed transitions; emit Platform Events on change.
- Platform Events: Publish events for stage changes and notifications; subscribe via Apex triggers on events; ensure idempotency with replay IDs.
- Asynchronous work: Use Queueable for callouts and long‑running tasks; Batch Apex for large data ops; chain queueables carefully; respect limits.
- Integrations: Named Credentials (JWT where possible); retry with exponential backoff; log failures to `Integration_Log__c` and provide a retry job.
- Error handling: Throw typed exceptions with user‑safe messages; map to LWC errors; include correlation IDs in logs.
- Security: Enforce CRUD/FLS with `with sharing` and `Security.stripInaccessible`; check row‑level access; never overexpose in Apex methods.
- Validation: Prefer service‑level validation and VRs; avoid heavy validation in triggers; keep SOQL/DML out of loops; use maps/sets.
- Logging & audit: Field History Tracking on critical objects; custom audit object for key events; Event Monitoring (if licensed); platform event logs.
- Testing: Factory pattern for test data; cover happy/error/bulk/asynch paths; assert state transitions and events; target >85% coverage.

---

Notes
- The normalized extraction above supersedes any raw OCR artifacts; the separate raw file was removed during cleanup.
- This README is analysis/planning only—no implementation code was added or changed.


