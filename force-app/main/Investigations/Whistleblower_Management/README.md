# Whistleblower Management Application

## Table of Contents
1.  [Overview](#overview)
2.  [System Architecture within this Directory](#system-architecture-within-this-directory)
    *   [Core Objects](#core-objects)
    *   [Apex Classes](#apex-classes)
    *   [Lightning Web Components (LWC)](#lightning-web-components-lwc)
    *   [Queues](#queues)
    *   [Layouts](#layouts)
    *   [Reports](#reports)
    *   [Other Metadata](#other-metadata)
3.  [Business Use Case & Narrative Flow](#business-use-case--narrative-flow)
    *   [The Need](#the-need)
    *   [The Anonymous Reporter (Heidi)](#the-anonymous-reporter-heidi)
    *   [The Internal Reporter (Shahzeb)](#the-internal-reporter-shahzeb)
    *   [The Investigator/Admin (Ben)](#the-investigatoradmin-ben)
4.  [Technical Interactions](#technical-interactions)
5.  [Security & Compliance Considerations](#security--compliance-considerations)

## Overview

This directory contains the core Salesforce metadata components that constitute the **Whistleblower Management Application**. This application provides a secure, confidential, and robust system for organizations to manage the intake, investigation, and resolution of whistleblower reports concerning unethical behavior, potential fraud, or compliance violations.

It facilitates anonymous reporting, structured case management, SLA tracking, investigation documentation, action monitoring, and secure communication, all within the Salesforce platform.

**Key Functionality Enabled by Components in this Directory:**
*   Secure anonymous and identified report submission.
*   End-to-end case lifecycle management (intake, review, investigation, action, closure).
*   Automated SLA tracking for timely responses.
*   Structured investigation workflow and documentation.
*   Tracking and monitoring of corrective actions.
*   Secure communication channels for whistleblower support.
*   Contextual information display (e.g., relevant news).
*   Role-based access and visibility controls.

## System Architecture within this Directory

The components within this `Whistleblower_Management` folder work together to deliver the application's functionality.

### Core Objects

These custom objects form the data foundation:

*   **`Whistleblower_Report__c`**: The central hub for each report.
    *   Captures report details (category, severity, description).
    *   Manages reporter information (anonymous via `Anonymous_Id__c` or identified).
    *   Tracks status, classification, assignment, and SLA compliance.
*   **`Investigation__c`**: Child to `Whistleblower_Report__c`, documents the investigation process.
    *   Records timeline, assigned investigators, findings, and status.
    *   Calculates `Days_To_Completion__c`.
*   **`Action_Taken__c`**: Child to `Whistleblower_Report__c`, details actions taken in response.
    *   Specifies action details, responsible parties, effectiveness, timeline, and follow-up needs.
*   **`Whistleblower_Support__c`**: Manages support interactions with whistleblowers.
    *   Tracks questions, concerns, and responses.
    *   Links to the relevant `Whistleblower_Report__c` if applicable.
*   **`SLA_Settings__mdt`**: Custom Metadata Type storing SLA configurations (e.g., durations). Used by automation to calculate deadlines.

*(Object relationships are primarily defined via Lookup/Master-Detail fields configured within the object definitions located in the `objects/` subdirectory).*

### Apex Classes

Located in the `classes/` subdirectory, these classes provide the backend logic:

*   **`WhistleblowerController`**: Handles UI interactions, likely serving data to and receiving actions from LWCs. Manages report creation, updates, and potentially support requests.
*   **`WhistleblowerReportService`**: Core business logic for processing `Whistleblower_Report__c` records. Might handle creation defaults, status transitions, or complex calculations.
*   **`WhistleblowerNewsFeedService`**: Integrates with an external News API (via Named Credential `TheNewsAPICredential`) to fetch relevant news articles based on report context. Likely utilizes the `WhistleblowerNewsCachePartition` cache partition for performance.
*   **`WhistleblowerRecordMetadataSLA`**: Calculates SLA deadlines and compliance based on rules defined in `SLA_Settings__mdt`. Often invoked by triggers or flows.
*   **`WhistleblowerReportTriggerHandler`**: The handler class called by the `WhistleblowerReportTrigger` (likely located in `triggers/`). Orchestrates logic execution during DML operations on `Whistleblower_Report__c` (e.g., calling `WhistleblowerReportService` or `WhistleblowerRecordMetadataSLA`).
*   **`WhistleblowerReportWrapper`**: A utility class, likely used to structure data conveniently for transfer between Apex and LWCs or for complex data manipulation.
*   **`WhistleblowerSlaTrackerController`**: Backend controller specifically for the `whistleblowerSlaTracker` LWC, providing SLA data.
*   ***Test Classes*** (`...Test.cls`): Ensure the functionality of the corresponding Apex classes through unit testing.

### Lightning Web Components (LWC)

Found in the `lwc/` subdirectory, these components provide the User Interface:

*   **`whistleblowerReportViewerLWC`**: The primary interface for users (anonymous or internal) to submit whistleblower reports. Interacts with `WhistleblowerController` or `WhistleblowerReportService`. Likely used on external Experience Cloud sites and potentially internal pages.
*   **`whistleblowerSlaTracker`**: Displays SLA status and deadlines related to a specific report. Fetches data via `WhistleblowerSlaTrackerController`.
*   **`whistleblowerNewsFeed`**: Displays relevant news articles fetched by `WhistleblowerNewsFeedService`. Provides contextual information on record pages.
*   **`faqAccordion`**: A reusable component to display Frequently Asked Questions in an accordion style, likely used on the portal homepage or support pages.
*   **`fileGenerator`**: Handles file upload functionality, potentially for attaching evidence to reports or investigations.
*   **`flowCompletionRedirect`**: Likely used within Salesforce Flows to navigate the user to a specific page upon flow completion.
*   **`fullPageComponent`**: A layout component, possibly used as a container to structure other components on a page, ensuring consistent layout.

### Queues

Defined in the `queues/` subdirectory, these are used for routing and workload management:

*   `Initial_Evaluation_Queue_Urgent`: For high-priority reports needing immediate review.
*   `Initial_Review`: Standard queue for newly submitted reports.
*   `Under_Investigation`: Queue for reports actively being investigated.
*   `Whistleblower_Report_Follow_Up_Queue`: For reports requiring post-action follow-up.
*   `Whistleblower_Support`: Queue for managing support requests submitted via `Whistleblower_Support__c`.

### Layouts

Located in the `layouts/` subdirectory, these define the page structure for object records:

*   Layouts for `Whistleblower_Report__c`, `Investigation__c`, `Action_Taken__c`, `Whistleblower_Support__c`, and `SLA_Settings__mdt`. They dictate which fields, related lists, and components (like the LWCs mentioned above) appear on the respective record detail pages.

### Reports

Organized within the `reports/` subdirectory (likely under `Whistleblower/` and `WhistleblowerAdmin/` folders):

*   Pre-built reports for analyzing whistleblower data, tracking trends, monitoring SLAs, and overseeing investigations. Folders suggest different reports for standard users and administrators.

### Other Metadata

While not explicitly listed in the prompt's detailed file list, this directory structure typically includes other essential metadata types managed within this functional area:

*   **`flexipages/`**: Contains Lightning Page definitions (e.g., Home pages, Record pages) that arrange components like LWCs and standard components.
*   **`triggers/`**: Holds Apex triggers (e.g., `WhistleblowerReportTrigger`) that initiate Apex logic on DML events.
*   **`workflows/`, `flows/`, `approvalProcesses/`**: Contain declarative automation rules managing status updates, notifications, complex processes, and approvals.
*   **`permissionsets/`**: Define user access levels (e.g., `Whistleblower_Admin`, `Whistleblower_Portal_Access`, potentially a `Guest_User` profile configuration).
*   **`tabs/`**: Define the navigation tabs for the custom objects.
*   **`email/`**: Holds email templates used for notifications.
*   **`customMetadata/`**: Contains records for Custom Metadata Types like `SLA_Settings__mdt`.
*   **`cachePartitions/`**: Defines cache partitions like `WhistleblowerNewsCachePartition` used by `WhistleblowerNewsFeedService`.
*   *(Other directories like `sharingRules`, `groups`, `entitlementProcesses`, `dashboards`, `milestoneTypes`, `topicsForObjects` might contain relevant configurations depending on the specific implementation details.)*

## Business Use Case & Narrative Flow

### The Need

Organizations require a trusted, confidential mechanism for employees and external parties to report potential wrongdoing without fear of reprisal. They also need a structured way to investigate these claims, take appropriate action, and demonstrate compliance. This application fulfills that need.

### The Anonymous Reporter (Heidi)

1.  **Access:** Heidi receives a secure link to the public-facing Whistleblower Portal (likely an Experience Cloud site).
2.  **Privacy:** She reviews the privacy policy on the portal (potentially using the `faqAccordion` LWC).
3.  **Submission:** Heidi uses the `whistleblowerReportViewerLWC` to submit her report. She explicitly chooses to remain anonymous. The system generates a secure `Anonymous_Id__c` for her. No personal data is required.
4.  **Confirmation:** She receives a confirmation and a reference number (or is reminded of her Anonymous ID) to track the report later.
5.  **Follow-up:** Heidi can return to the portal, use her Anonymous ID to check the status (potentially via a dedicated status-checking component or by submitting a `Whistleblower_Support__c` request), provide more information, or respond to clarification requests.

### The Internal Reporter (Shahzeb)

1.  **Access:** Shahzeb logs into the internal Salesforce org or a dedicated internal portal.
2.  **Submission:** He navigates to the Whistleblower app/page and uses the `whistleblowerReportViewerLWC` (potentially a different configuration or page) to submit his report. His user information might be pre-filled, but he understands the report is treated confidentially within the investigation team.
3.  **Tracking:** Shahzeb can track his submitted report directly within Salesforce via the "My Reports" view or the `Whistleblower_Report__c` record.
4.  **Updates:** He receives updates via internal notifications or by checking the record status.

### The Investigator/Admin (Ben)

1.  **Notification/Review:** Ben (or the assigned team/queue) is notified of new reports landing in the `Initial_Review` or `Initial_Evaluation_Queue_Urgent` queues.
2.  **Triage:** Ben reviews the `Whistleblower_Report__c` record (using the defined layout). He assesses jurisdiction, priority, and assigns it for investigation (updating status, potentially assigning to the `Under_Investigation` queue or a specific user). The `WhistleblowerReportTrigger` and `WhistleblowerReportTriggerHandler` fire, potentially invoking `WhistleblowerRecordMetadataSLA` to calculate deadlines displayed by `whistleblowerSlaTracker`.
3.  **Investigation:** If investigation is needed (like for Heidi's case), Ben creates a child `Investigation__c` record. He documents findings, progress, and evidence (potentially using the `fileGenerator` LWC). The `whistleblowerNewsFeed` LWC might display relevant news context on the report page.
4.  **Action:** Based on findings, Ben creates `Action_Taken__c` records (e.g., documenting corrective actions, termination as in the script).
5.  **Support:** If Heidi or Shahzeb submit a `Whistleblower_Support__c` request, it routes to the `Whistleblower_Support` queue, and Ben (or a support team member) responds.
6.  **Closure:** Ben updates the statuses on the `Whistleblower_Report__c`, `Investigation__c`, and `Action_Taken__c` records to "Completed" or "Closed". Automation (Workflows/Flows) might trigger final notifications or updates.
7.  **Reporting:** Ben uses reports from the `reports/` directory and potentially dashboards (`dashboards/`) to monitor overall activity, SLA compliance, and trends.

## Technical Interactions

*   **UI Layer (LWC):** Components like `whistleblowerReportViewerLWC` and `whistleblowerSlaTracker` interact with users and call Apex controllers (`WhistleblowerController`, `WhistleblowerSlaTrackerController`).
*   **Controller Layer (Apex):** Controllers process requests from LWCs, validate data, and call service classes.
*   **Service Layer (Apex):** Classes like `WhistleblowerReportService` and `WhistleblowerNewsFeedService` encapsulate core business logic, interacting with SObjects and external systems (News API).
*   **Trigger Framework (Apex):** Triggers (`WhistleblowerReportTrigger`) react to database events, calling handler classes (`WhistleblowerReportTriggerHandler`) which orchestrate service calls (e.g., `WhistleblowerRecordMetadataSLA`).
*   **Data Layer (Objects):** Custom objects store the application data.
*   **Automation (Flow/Workflow/Process Builder):** Declarative tools handle simpler automation like status changes, email alerts (using templates from `email/`), and field updates, often working alongside Apex triggers.
*   **Configuration (Custom Metadata/Queues/Layouts):** Define operational parameters (SLA timings via `SLA_Settings__mdt`), routing (`queues/`), and UI presentation (`layouts/`, `flexipages/`).

## Security & Compliance Considerations

*   **Anonymity:** The `Anonymous_Id__c` field and the design of the `whistleblowerReportViewerLWC` are crucial for enabling secure anonymous submissions.
*   **Access Control:** `permissionsets/` define who can see and do what. Sharing rules (`sharingRules/`) likely restrict record visibility, ensuring only authorized personnel (investigators, admins in specific groups defined in `groups/`) can access sensitive report details. Field-Level Security further restricts access to specific data points.
*   **Confidentiality:** Secure communication channels (potentially encrypted portal interactions, restricted access to `Whistleblower_Support__c` records) are vital.
*   **Audit Trail:** Salesforce's standard field history tracking, combined with custom logging potentially implemented in Apex, provides an audit trail.
*   **Compliance:** The structured data model and processes support adherence to regulations like SOX, GDPR, etc.
