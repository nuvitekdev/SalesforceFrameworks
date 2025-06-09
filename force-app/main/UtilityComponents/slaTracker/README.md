# SLA Tracker Component

![SLA Tracker Banner](https://raw.githubusercontent.com/YOUR-ORG/YOUR-REPO/main/docs/images/sla-tracker-banner.png)

## What is the SLA Tracker?

The SLA Tracker is a dynamic, configurable Lightning Web Component (LWC) that provides real-time monitoring of Service Level Agreements (SLAs) directly within Salesforce record pages. It offers visual tracking of response times against configurable targets, allowing teams to stay on top of their service commitments.

### Key Features

- **Dynamic Configuration**: Configure SLA duration, tracking fields, and status values through the component's properties without requiring custom metadata.
- **Real-Time Monitoring**: Live countdown display with automatic updates when SLA status changes.
- **Visual Progress Indicator**: Color-coded progress bar changes from green to yellow to red as the deadline approaches.
- **Multiple Status Support**: Tracks various statuses including Active, Paused, Met, and Breached.
- **Business Hours Integration**: Optional support for calculating SLAs based on business hours.
- **Modern UI/UX**: Clean, Apple-inspired design with responsive layout for all devices.
- **Flow Integration**: Can be used in Flow screens with output variables for SLA status.

## Why Use the SLA Tracker?

Organizations invest significant resources in establishing SLAs to ensure timely service delivery and response. The SLA Tracker component offers several benefits:

1. **Visibility**: Makes SLA deadlines and status visible to all team members, promoting awareness and accountability.
2. **Proactive Management**: Enables teams to identify at-risk SLAs before they breach, allowing for timely intervention.
3. **Flexibility**: Works with any object and timeline requirements through its configurable nature.
4. **Ease of Implementation**: No custom development or technical expertise required to deploy and configure.
5. **Performance Tracking**: Provides data points for reporting on SLA compliance over time.
6. **Customer Satisfaction**: Helps maintain service standards, ultimately leading to better customer experiences.

## Who Should Use This Component?

The SLA Tracker is ideal for:

- **Service Teams**: Customer service, technical support, and help desk teams who manage cases with response time commitments.
- **Project Managers**: Tracking delivery milestones and deadlines for project tasks.
- **Compliance Officers**: Monitoring regulatory or contractual timeline requirements.
- **Operations Managers**: Ensuring internal processes meet established turnaround times.
- **Salesforce Administrators**: Who need a flexible, configurable solution for SLA tracking without custom development.
- **Community Managers**: Adding SLA visibility to customer or partner communities.

## When to Use the SLA Tracker

Implement the SLA Tracker in these scenarios:

- When establishing new service level commitments with customers or partners
- During service quality improvement initiatives
- When facing challenges with SLA compliance
- After identifying the need for better visibility into response times
- To replace manual tracking processes with automated solutions
- When standardizing service operations across teams or departments
- During digital transformation of service processes

## Where to Deploy the SLA Tracker

The SLA Tracker component can be added to:

- **Record Pages**: Add to any standard or custom object's record page.
- **App Pages**: Include in Lightning app pages for holistic SLA monitoring.
- **Home Pages**: Deploy to user home pages for real-time visibility.
- **Utility Bars**: Make available as a utility item for quick access.
- **Flow Screens**: Incorporate into guided processes.
- **Communities**: Add to Experience Cloud pages for customer or partner visibility.

## How to Configure and Use

### Installation

1. Deploy the component using Salesforce CLI or directly within your Salesforce org.
2. Ensure all dependencies (classes, LWC) are deployed together.

### Configuration

#### Basic Setup

1. Navigate to the page where you want to add the SLA Tracker.
2. Edit the page and drag the "SLA Tracker" component from the custom components section.
3. Configure the following required properties:
   - **SLA Duration (Hours)**: Set the number of hours for your SLA target.
   - **Start Time Field**: Field that marks when the SLA clock starts (e.g., CreatedDate).
   - **Status Field**: Field used to determine the current status (e.g., Status__c).

#### Advanced Options

- **Resolution Time Field**: Field that marks when the SLA is considered met.
- **Closed Status Values**: Comma-separated list of status values that indicate the record is closed.
- **Paused Status Values**: Status values that pause the SLA timer.
- **Component Title**: Customize the header text.
- **Color Scheme**: Choose from available themes.
- **Show Past SLA**: Toggle visibility after SLA is met or breached.
- **Show Progress Bar**: Enable/disable the visual progress indicator.
- **Business Hours Only**: Calculate SLA based on business hours.

### Usage Examples

#### Standard Case Management
```
SLA Duration: 8 hours
Start Time Field: CreatedDate
Resolution Time Field: ClosedDate
Status Field: Status
Closed Status Values: Closed,Resolved
Paused Status Values: Awaiting Customer Response,On Hold
```

#### IT Support Tickets
```
SLA Duration: 4 hours
Start Time Field: CreatedDate
Resolution Time Field: ResolutionDate__c
Status Field: Ticket_Status__c
Closed Status Values: Resolved,Cancelled
Paused Status Values: Waiting for Information,Pending Approval
```

#### Compliance Reviews
```
SLA Duration: 120 hours (5 days)
Start Time Field: Submission_Date__c
Resolution Time Field: Approval_Date__c
Status Field: Review_Status__c
Closed Status Values: Approved,Rejected
Paused Status Values: Additional Information Requested
```

## Technical Details

### Component Structure

- **LWC Component**: `slaTracker`
- **Apex Controller**: `SlaTrackerController.cls`
- **Dependencies**: Lightning Data Service (LDS)

### API References

The component exposes the following APIs for Flow integration:

- **slaStatus**: Output variable containing the current SLA status
- **timeRemaining**: Output variable with formatted time remaining

## Troubleshooting

### Common Issues

1. **SLA Not Calculating Correctly**
   - Verify the field names match exactly
   - Check that status values are exact matches

2. **Component Not Visible**
   - Ensure user has access to the component
   - Check if showPastSLA is set correctly

3. **Business Hours Not Working**
   - Verify business hours are configured in Salesforce setup
   - Check businessHoursId if using a non-default business hours record

## Contributing

We welcome contributions to enhance the SLA Tracker component. Please submit pull requests with detailed descriptions of your changes.

## License

This component is available under the MIT License. See LICENSE.md for details.

---

*Developed by Nuvitek - Transforming business through innovative Salesforce solutions.* 