# DOI Permits System - Dashboard & Report Building Guides

## Table of Contents

1. [Executive Dashboard Setup](#executive-dashboard-setup)
2. [Operational Reports Configuration](#operational-reports-configuration)  
3. [Public Transparency Reports](#public-transparency-reports)
4. [Performance Analytics Dashboards](#performance-analytics-dashboards)
5. [Compliance & Audit Reports](#compliance--audit-reports)
6. [Mobile Dashboard Configuration](#mobile-dashboard-configuration)
7. [Scheduled Report Automation](#scheduled-report-automation)

## Executive Dashboard Setup

### Dashboard 1: DOI APD Executive Overview

#### Dashboard Configuration
```
Dashboard Name: DOI APD Executive Overview
Folder: DOI Permits - Executive Reports
Running User: System Administrator
Refresh Frequency: Every 2 hours during business hours
Layout: 3x4 Grid (12 components)
Access: Executive Team, Field Office Managers
```

#### Component 1: APD Processing Pipeline
```
Component Type: Horizontal Bar Chart
Title: APDs by Processing Stage
Data Source: "APD Status Summary" report
Chart Properties:
- Grouping: DOI_PAL_Status__c (Picklist field)
- Aggregation: Record Count
- Sort Order: By Value (Descending)
- Max Bars: 10
- Color Scheme: Custom (Green for Approved, Yellow for In Progress, Red for Overdue)
- Show Legend: Yes
- Show Values: Yes

Size: 2x1 (spans 2 columns, 1 row)
Position: Top Left
```

#### Component 2: SLA Performance Gauge
```
Component Type: Gauge Chart
Title: Overall SLA Compliance Rate
Data Source: "SLA Performance Summary" report
Chart Properties:
- Metric: Percentage of tasks completed within SLA
- Min Value: 0%
- Max Value: 100%
- Target: 95%
- Ranges:
  - Red: 0-70% (Critical)
  - Yellow: 70-90% (Warning)  
  - Green: 90-100% (Excellent)
- Show Target Line: Yes

Size: 1x1
Position: Top Center
```

#### Component 3: Revenue Generated
```
Component Type: Metric
Title: APD Fee Revenue (YTD)
Data Source: "APD Revenue Summary" report
Chart Properties:
- Metric: Sum of DOI_PAL_Fee_Amount__c
- Format: Currency ($12,515,000)
- Comparison: Previous Year Same Period
- Trend Indicator: Yes (Green/Red arrow)

Size: 1x1
Position: Top Right
```

#### Component 4: Geographic Distribution Map
```
Component Type: Map
Title: APD Activity by State
Data Source: "APD Geographic Distribution" report
Chart Properties:
- Location Field: DOI_PAL_State__c
- Size By: Record Count
- Color By: DOI_PAL_Status__c
- Clustering: Enabled
- Zoom Level: Country
- Show State Boundaries: Yes

Size: 2x2
Position: Middle Left
```

#### Component 5: Processing Time Trends
```
Component Type: Line Chart
Title: Average Processing Time Trends (6 Months)
Data Source: "Processing Time Analysis" report
Chart Properties:
- X-Axis: Month (DOI_PAL_Submission_Date__c)
- Y-Axis: Average Processing Days (Formula field)
- Date Range: Last 6 Months
- Trend Line: Yes
- Goal Line: 30 days (red), 21 days (yellow), 14 days (green)
- Point Markers: Yes

Size: 2x1
Position: Middle Right
```

#### Component 6: Top Field Offices by Volume
```
Component Type: Horizontal Bar Chart
Title: Top 10 Field Offices by APD Volume
Data Source: "Field Office Performance" report  
Chart Properties:
- Grouping: DOI_PAL_Assigned_Field_Office__c
- Aggregation: Record Count
- Sort Order: Descending
- Max Bars: 10
- Show Percentage: Yes
- Color: Single color (DOI Blue)

Size: 2x1
Position: Bottom Left
```

#### Component 7: Recent Critical Alerts
```
Component Type: Table
Title: Critical Issues Requiring Attention
Data Source: "Critical APD Alerts" report
Table Properties:
- Columns: APD Name, Issue Type, Days Open, Assigned User
- Max Rows: 5
- Sort: By Priority (High to Low), then by Days Open
- Conditional Formatting: Red for >SLA, Yellow for approaching SLA
- Click Action: Open APD record

Size: 2x1  
Position: Bottom Right
```

### Creating the Executive Dashboard - Step by Step

#### Step 1: Navigate to Dashboards
1. Go to **App Launcher** → **Dashboards**
2. Click **New Dashboard**
3. Enter **Dashboard Name**: "DOI APD Executive Overview"
4. Select **Folder**: Create new folder "DOI Permits - Executive Reports"
5. Choose **Running User**: System Administrator or dedicated integration user

#### Step 2: Set Dashboard Properties
1. Click **Dashboard Properties**
2. Set **Refresh Schedule**: Every 2 hours (8 AM - 6 PM, weekdays)
3. Configure **Mobile Settings**: Enable mobile optimization
4. Set **Sharing**: Share with Executive Team public group

#### Step 3: Add Components (Detailed Walkthrough)

##### Adding Component 1: APD Processing Pipeline
1. Click **+ Component** 
2. Select **Chart Type**: Horizontal Bar Chart
3. **Choose Data Source**:
   - Click **Create New Report**
   - **Report Type**: APD Applications
   - **Report Format**: Summary Report
4. **Configure Report**:
   - **Group By**: DOI_PAL_Status__c
   - **Show**: All APD Applications
   - **Filters**: 
     - Created Date = THIS_YEAR
     - Status ≠ "Draft"
   - **Sort**: Record Count (Descending)
5. **Save Report** as "APD Status Summary"
6. **Configure Chart**:
   - Title: "APDs by Processing Stage"
   - Y-Axis: Status
   - X-Axis: Record Count
   - Colors: Status-based (Green for Approved, etc.)
7. **Size**: 2 columns × 1 row
8. **Save Component**

##### Adding Component 2: SLA Performance Gauge
1. Click **+ Component**
2. Select **Chart Type**: Gauge
3. **Create Supporting Report**:
   - **Report Type**: Review Tasks with APD Applications
   - **Report Format**: Summary Report
   - **Group By**: SLA_Status__c (Formula field)
   - **Create Formula Field**: 
     ```
     SLA_Compliance_Rate__c = 
     IF(DOI_PAL_Due_Date__c >= TODAY(), "On Time", "Overdue")
     ```
   - **Show Summary**: Record Count
   - **Add Percentage Calculation**:
     - Create bucket field for On Time vs Total
     - Use summary formula: (On Time Count / Total Count) * 100
4. **Configure Gauge**:
   - Min: 0%, Max: 100%
   - Target: 95%
   - Color ranges as specified above
5. **Save** as "SLA Performance Gauge"

##### Adding Component 3: Revenue Metric
1. Click **+ Component**
2. Select **Component Type**: Metric
3. **Create Revenue Report**:
   - **Report Type**: APD Applications with Payments
   - **Show**: All APD Applications
   - **Filters**: 
     - Payment Status = "Completed"
     - Payment Date = THIS_YEAR
   - **Summarize**: Sum of DOI_PAL_Fee_Amount__c
4. **Configure Metric**:
   - **Value**: Sum of Fee Amount
   - **Format**: Currency
   - **Comparison**: Previous year (create second report for comparison)
5. **Save** as "APD Revenue YTD"

### Report Creation Guide

## Operational Reports Configuration

### Report 1: APD Status Summary

#### Report Setup Instructions
1. **Navigate to Reports** → **New Report**
2. **Select Report Type**: APD Applications
3. **Report Format**: Summary Report

#### Configuration Details
```
Report Name: APD Status Summary
Folder: DOI Permits - Operational Reports
Description: Summary of all APDs by current processing stage

Fields to Include:
- APD Application Name (APD_Application__c.Name)
- Operator Name (DOI_PAL_Operator__r.Name)
- Submission Date (DOI_PAL_Submission_Date__c)
- Current Status (DOI_PAL_Status__c)
- Days in Current Stage (Formula Field)
- Assigned Field Office (DOI_PAL_Assigned_Field_Office__c)
- Primary Reviewer (DOI_PAL_Primary_Reviewer__r.Name)
- Target Decision Date (DOI_PAL_Target_Decision_Date__c)

Grouping:
- Primary Group: DOI_PAL_Status__c
- Secondary Group: DOI_PAL_Assigned_Field_Office__c

Filters:
- Record Type = "Standard APD"
- DOI_PAL_Status__c ≠ "Draft"
- Created Date = THIS_YEAR

Summary Fields:
- Record Count (by status)
- Average Days in Stage (custom formula)
- Percent of Total (by status)

Sort Order:
- By Status (custom sort: Submitted, Initial Review, Under Review, etc.)
- Then by Days in Stage (descending)
```

#### Formula Fields to Create
```apex
// Days in Current Stage
Days_in_Current_Stage__c = 
TODAY() - 
CASE(
  DOI_PAL_Status__c,
  "Submitted", DOI_PAL_Submission_Date__c,
  "Initial_Review", DOI_PAL_Initial_Review_Start_Date__c,
  "Under_Review", DOI_PAL_Specialist_Review_Start_Date__c,
  "Public_Comment", DOI_PAL_Public_Comment_Start_Date__c,
  DOI_PAL_Last_Status_Change_Date__c
)

// SLA Status Indicator  
SLA_Status__c = 
IF(
  DOI_PAL_Target_Decision_Date__c < TODAY(),
  "Overdue",
  IF(
    DOI_PAL_Target_Decision_Date__c <= TODAY() + 3,
    "At Risk", 
    "On Track"
  )
)
```

### Report 2: Field Office Performance Analysis

#### Detailed Configuration
```
Report Name: Field Office Performance Analysis
Report Type: APD Applications with Review Tasks
Format: Matrix Report

Row Groupings:
1. Field Office Name (DOI_PAL_Assigned_Field_Office__c)
2. Review Task Type (DOI_PAL_Task_Type__c)

Column Groupings:
1. Task Status (DOI_PAL_Status__c)
2. SLA Compliance (Custom Formula)

Summarize By:
- Record Count
- Average Days to Complete
- SLA Compliance Rate (%)

Filters:
- Created Date = LAST_N_DAYS:90
- Task Status ≠ "Draft"
- Field Office ≠ NULL

Custom Summary Formulas:
1. Average Processing Time:
   RowCount:AVG(DOI_PAL_Days_to_Complete__c)

2. SLA Compliance Rate:
   RowCount(SLA_Status__c="On Time") / RowCount() * 100

Conditional Formatting:
- Red: SLA Compliance < 70%
- Yellow: SLA Compliance 70-89%
- Green: SLA Compliance ≥ 90%
```

### Report 3: Specialist Workload Analysis

#### Step-by-Step Creation
1. **Report Type**: Review Tasks with Users and APD Applications
2. **Format**: Matrix Report

```
Configuration:
Row Groupings:
- Assigned User Name
- User Role (DOI_PAL_Review_Role__c)

Column Groupings:  
- Task Priority (DOI_PAL_Priority__c)
- Task Status (DOI_PAL_Status__c)

Values to Summarize:
- Record Count
- Average Days Open
- Overdue Task Count

Filters:
- Task Status = "Pending,In Progress,Under Review"
- User.IsActive = TRUE
- Assigned Date = LAST_N_DAYS:30

Cross Filters:
- APD Applications: Status ≠ "Approved,Denied,Withdrawn"
- Users: DOI_PAL_Review_Role__c ≠ NULL

Time-Based Columns:
- This Week
- Last Week  
- This Month
- Last Month

Summary Statistics:
- Total Active Tasks per User
- Average Task Age
- SLA Compliance by User
- Task Completion Velocity
```

### Report 4: NEPA Environmental Assessment Tracking

```
Report Name: NEPA EA Processing Status
Report Type: NEPA Assessments with APD Applications
Format: Tabular Report

Fields:
- APD Name (linked)
- Operator Name  
- Location (State, County)
- NEPA Level (CX, EA, EIS)
- EA Status (Draft, Under Review, Public Comment, Final)
- Environmental Specialist
- Cultural Resource Status
- Wildlife Impact Assessment Status
- Public Comment Period Start/End
- Days in Current NEPA Stage

Grouping:
- Group by NEPA Level
- Sub-group by EA Status

Filters:
- NEPA Level ≠ "CX" (focus on EA and EIS only)
- EA Status ≠ "Complete"
- APD Status ≠ "Withdrawn"

Custom Columns:
- Days Until Public Comment Deadline
- Required Consultations Completed (%)
- Environmental Issues Count
- Public Comments Received

Conditional Formatting:
- Red: Past public comment deadline
- Yellow: Public comment ending within 3 days
- Green: On schedule

Chart:
- Type: Stacked Bar Chart
- X-Axis: NEPA Level
- Y-Axis: Count
- Stacks: EA Status
```

## Public Transparency Reports

### Report 5: Public APD Search Report

#### Configuration for Public Portal
```
Report Name: Public APD Directory
Folder: Public Reports (publicly accessible)
Report Type: APD Applications (with sharing restrictions)
Format: Tabular Report

Public-Safe Fields Only:
- APD Application Number (public ID, not Salesforce ID)
- Operator Name (company name only)
- General Location (State, County - no specific coordinates)
- Application Date
- Current Status (simplified: Submitted, Under Review, Approved, Denied)
- Permit Type (APD, etc.)
- Expected Decision Date
- Public Document Links (EA, FONSI only)

Security Filters:
- Only show records with Public_Visibility__c = TRUE
- Hide records with Confidential_Information__c = TRUE
- Status ≠ "Draft,Withdrawn"

Data Privacy:
- No personal information (individual names, specific addresses)
- No sensitive environmental or cultural site details
- No proprietary operator information
- Aggregate location data only

Public Access Settings:
- Available without login
- Embedded in Experience Cloud site
- Mobile-responsive layout
- Search and filter capabilities
```

### Report 6: Environmental Impact Dashboard Data

```
Report Name: Environmental Assessment Public Summary
Purpose: Support public transparency on environmental reviews
Format: Summary Report

Groupings:
- Environmental Impact Category
- Mitigation Measures Required (Yes/No)
- Geographic Region

Summary Data:
- Total APDs with EA required
- Average EA processing time
- Public comments received count
- Environmental concerns identified
- Mitigation measures implemented

Public-Safe Environmental Data:
- Air Quality Impact Level (Low, Medium, High)
- Wildlife Habitat Impact (None, Minor, Moderate)  
- Cultural Resource Considerations (Yes/No - no specifics)
- Water Resource Impact Assessment
- Cumulative Impact Analysis Results

Chart Support:
- Pie chart: EA outcomes (No Impact, Minor Impact, etc.)
- Bar chart: APDs by environmental risk level
- Map: APDs by state (count only, no specific locations)
```

## Performance Analytics Dashboards

### Dashboard 2: Operational Performance Metrics

#### Dashboard Layout (3x3 Grid)
```
Dashboard Name: DOI APD Operational Performance
Target Users: Field Office Managers, Operations Staff
Refresh: Every hour during business hours

Component Layout:

Row 1:
[SLA Compliance Trend] [Processing Time by Stage] [Specialist Utilization]

Row 2:  
[Bottleneck Analysis] [Quality Metrics] [Cost per Application]

Row 3:
[Weekly Throughput] [Error Rate Tracking] [Automation Success Rate]
```

#### Component Specifications

##### SLA Compliance Trend (Line Chart)
```
Data Source: SLA Tracking Historical Report
Time Period: Last 90 days (daily data points)
Metrics:
- Overall SLA Compliance %
- By Task Type (Initial Review, Specialist Review, etc.)
- Target Line: 95%
Lines:
- Total SLA Compliance (blue, solid)
- Initial Review SLA (green, dashed)  
- Specialist Review SLA (orange, dashed)
- Final Approval SLA (red, dashed)
```

##### Processing Time by Stage (Stacked Bar Chart)
```
Data Source: Stage Duration Analysis Report  
Grouping: APD Processing Stage
Metrics: Average days in each stage
Stacks:
- Waiting Time (red)
- Active Processing Time (green)  
- Review/Approval Time (blue)
Goal Lines:
- Initial Review: 5 days
- Specialist Review: 14 days
- Final Approval: 7 days
```

##### Specialist Utilization (Heat Map)
```
Data Source: User Workload Matrix Report
Rows: Individual specialists
Columns: Week of year
Color Coding:
- Green: Optimal workload (80-100% capacity)
- Yellow: Over capacity (100-120%)
- Red: Severely overloaded (>120%)
- Blue: Under utilized (<80%)
Interactive: Click to see individual's task list
```

##### Bottleneck Analysis (Waterfall Chart)
```
Data Source: Processing Stage Analysis
Shows: Where applications are getting stuck
Metrics:
- Applications entering stage
- Applications exiting stage  
- Net accumulation per stage
- Average time in stage
Identifies: Stages with highest accumulation
Goal: Highlight process improvement opportunities
```

##### Quality Metrics (Multi-Metric Display)
```
Data Source: Multiple quality tracking reports
Metrics Grid:
┌─────────────────┬──────────┬────────┐
│ Metric          │ Current  │ Target │
├─────────────────┼──────────┼────────┤
│ Rework Rate     │ 5.2%     │ <3%    │
│ Appeal Rate     │ 1.8%     │ <2%    │
│ Accuracy Score  │ 96.4%    │ >98%   │
│ Completeness    │ 94.1%    │ >95%   │
└─────────────────┴──────────┴────────┘
Color coding: Green (meets target), Yellow (close), Red (below)
```

### Dashboard 3: AI Performance Tracking

#### AI Analytics Components
```
Dashboard Name: DOI APD AI Performance Analytics
Purpose: Monitor AI system effectiveness and accuracy

Components:

1. Document Processing Accuracy
   - AI validation accuracy vs. human review
   - False positive/negative rates
   - Processing time with vs. without AI

2. Risk Assessment Performance  
   - AI risk scores vs. actual outcomes
   - Prediction accuracy over time
   - Calibration curves

3. Automation Success Rates
   - Tasks fully automated vs. requiring human intervention
   - Routing accuracy (correct field office assignment)
   - Document classification accuracy

4. Cost Savings from AI
   - Hours saved through automation
   - Cost per application reduction
   - ROI of AI implementation
```

## Compliance & Audit Reports

### Report 7: Comprehensive Audit Trail

#### Configuration
```
Report Name: APD Compliance Audit Trail
Purpose: Support regulatory compliance and audits
Report Type: APD Applications with Field History

Required Fields:
- APD Identification Information
- All status changes with timestamps
- User information for all actions
- Document upload/modification history
- Signature events with IP addresses
- Payment transaction records
- SLA compliance documentation

Field History Tracking:
- Enable for all critical APD fields
- Track: Old Value, New Value, Changed By, Date/Time
- Retain: 7 years (federal requirement)

Audit-Specific Filters:
- Date Range: Custom (for specific audit periods)
- Status Changes: All
- User Types: All (internal and external)
- Document Actions: All

Export Options:
- Excel format for external auditors
- PDF for official documentation  
- CSV for data analysis
```

### Report 8: Signature Compliance Report

```
Report Name: Digital Signature Compliance Tracking
Report Type: APD Signature Audits with Users and APDs

Compliance Fields:
- Signature Event ID
- APD Application (linked)
- Document Type (EA, FONSI, etc.)
- Signer Information (role, not personal details)
- Signature Date/Time (with timezone)
- IP Address (security audit)
- User Agent (browser/device)
- Signature Method (drawn, typed, uploaded)
- Document Hash (integrity verification)
- Legal Compliance Status

Groupings:
- By Document Type
- By Signing Authority Level
- By Month (for trend analysis)

Validation Checks:
- All required signatures present
- Signature order compliance
- Time limits compliance (e.g., EA signed within X days)
- User authorization validation
- Document integrity verification

Compliance Alerts:
- Missing signatures
- Out-of-order signing
- Unauthorized signers
- Document tampering detected
```

### Report 9: FOIA Request Support Report

```
Report Name: FOIA-Compliant APD Information
Purpose: Support Freedom of Information Act requests
Security Level: Controlled access with redaction capabilities

Configuration:
- Filter out confidential/sensitive information
- Redact personal identifiers automatically
- Include only publicly-releasable documents
- Support bulk export with privacy compliance

Redaction Rules:
- Personal information (SSN, addresses, phone numbers)
- Cultural resource location details
- Proprietary operator information
- Ongoing enforcement actions
- Security-sensitive data

Approved Fields for FOIA:
- APD public identifier
- Operator name (company only)
- General location (state/county)
- Application and decision dates
- Environmental assessment outcomes
- Public comment summaries (not individual comments)
- Final permit conditions (general only)
```

## Mobile Dashboard Configuration

### Mobile-Optimized Dashboard: Field Inspector Mobile

#### Configuration
```
Dashboard Name: DOI Field Inspector Mobile Dashboard
Target Device: Tablets and large phones
Layout: Single column, scrollable
Components: 6 key metrics optimized for mobile

Mobile-Specific Settings:
- Font Size: Large (minimum 14pt)
- Touch Targets: Minimum 44px
- Component Spacing: 16px between components
- Offline Capability: Cache last 24 hours of data
- GPS Integration: Show nearby APDs
```

#### Mobile Components

##### Component 1: My Assigned Inspections
```
Type: Card List View
Data: Review tasks assigned to current user
Fields:
- APD Name (large text)
- Location (with GPS distance)
- Due Date (with countdown)
- Priority (color coded)
- Quick Actions: Call Operator, Get Directions, Update Status

Touch Actions:
- Tap: Open APD details
- Swipe Left: Mark complete
- Swipe Right: Schedule follow-up
- Long Press: Quick notes
```

##### Component 2: Today's Schedule
```
Type: Timeline View
Data: Scheduled activities for current day
Features:
- Time blocks with travel time
- Weather integration
- Traffic alerts
- Sync with device calendar

Interactive Features:
- Drag to reschedule
- Add travel time automatically
- Emergency contact information
- Offline mode support
```

##### Component 3: Quick Status Updates
```
Type: Action Panel
Functions:
- Update inspection status
- Upload photos from camera
- Record GPS coordinates
- Voice-to-text notes
- Submit reports

Offline Support:
- Queue actions when offline
- Sync when connection restored
- Indicate sync status
- Conflict resolution
```

### Creating Mobile Dashboard - Step by Step

#### Step 1: Mobile Layout Configuration
1. **Dashboard Settings** → **Mobile**
2. **Layout**: Select "Single Column"
3. **Component Size**: Set to "Mobile Optimized"
4. **Navigation**: Enable swipe gestures
5. **Refresh**: Set to "Manual" (save battery)

#### Step 2: Component Optimization
1. **For Each Component**:
   - Reduce data density
   - Use larger fonts and icons
   - Simplify color schemes
   - Enable touch interactions
2. **Test on Actual Devices**:
   - Various screen sizes
   - Different orientations
   - Network conditions (slow/offline)

## Scheduled Report Automation

### Setting Up Automated Report Delivery

#### Weekly Executive Summary
```
Report: DOI APD Weekly Executive Summary
Schedule: Every Monday at 6:00 AM MT
Recipients: 
- DOI Executive Team
- Field Office Managers
- Regional Directors

Content:
- Previous week's statistics
- Key performance indicators
- Critical issues requiring attention
- Upcoming deadlines and milestones

Format Options:
- PDF attachment (for reading)
- Excel attachment (for analysis)  
- Inline HTML (for mobile viewing)
- Dashboard URL (for interactive exploration)
```

#### Monthly Compliance Report
```
Report: Monthly APD Compliance Status
Schedule: First business day of each month
Recipients:
- Compliance Team
- Legal Department  
- External Auditors (if applicable)

Automated Validation:
- Check all SLA compliance
- Verify signature completeness
- Validate audit trail integrity
- Confirm regulatory compliance

Distribution:
- Secure email delivery
- Encrypted attachments
- Access logging
- Delivery confirmation
```

### Report Subscription Setup

#### Creating Subscriptions
1. **Navigate to Report**
2. **Click "Subscribe"**
3. **Configure Schedule**:
   - Frequency: Daily, Weekly, Monthly, Custom
   - Time: Consider recipient time zones
   - Day: Business days only for most reports
   - Format: PDF for formal reports, Excel for data analysis

#### Advanced Subscription Options
```
Conditional Delivery:
- Only send if data changes
- Send only when thresholds exceeded
- Skip empty reports
- Include comparison to previous period

Dynamic Recipients:
- Based on data in report (e.g., assigned users)
- Role-based distribution lists
- Geographic distribution
- Language preferences

Custom Formatting:
- Company branding
- Executive summary page
- Data visualization preferences
- Mobile-friendly formatting
```

### Report Performance Optimization

#### Large Report Optimization
```
Strategies:
1. Use Report Filters:
   - Limit date ranges
   - Filter inactive records
   - Use indexed fields for performance

2. Optimize Queries:
   - Avoid complex formulas in large datasets
   - Use summary reports instead of detail
   - Implement data archiving

3. Schedule During Off-Peak Hours:
   - Night time processing for large reports
   - Stagger multiple report runs
   - Monitor system performance impact

4. Use Report Caching:
   - Cache frequently accessed reports
   - Refresh cache on schedule
   - Provide real-time vs. cached options
```

#### Monitoring Report Performance
```
Key Metrics to Track:
- Report execution time
- Data volume processed
- User access patterns
- Error rates and failures
- System resource utilization

Alerting:
- Long-running report notifications
- Failed report execution alerts
- Unusual data patterns
- Performance degradation warnings
```

## Best Practices & Troubleshooting

### Dashboard Best Practices

#### Design Guidelines
```
1. Visual Hierarchy:
   - Most important metrics prominently displayed
   - Consistent color scheme
   - Logical component arrangement
   - Clear titles and labels

2. Performance Considerations:
   - Limit components per dashboard (max 15)
   - Use efficient report queries
   - Implement appropriate caching
   - Monitor refresh times

3. User Experience:
   - Mobile-responsive design
   - Intuitive navigation
   - Contextual help
   - Drill-down capabilities

4. Security & Privacy:
   - Role-based access control
   - Data filtering by user permissions
   - Audit trail for dashboard access
   - Compliance with data protection laws
```

### Common Issues & Solutions

#### Dashboard Loading Issues
```
Problem: Dashboard takes too long to load
Solutions:
1. Reduce number of components
2. Optimize underlying reports
3. Implement data archiving
4. Use summary data instead of detail
5. Schedule refresh during off-peak hours

Problem: Components not displaying correctly
Solutions:
1. Check report permissions
2. Verify data filters
3. Update browser cache
4. Test with different users
5. Review mobile vs. desktop settings
```

#### Report Performance Issues
```
Problem: Reports timing out
Solutions:
1. Add selective filters
2. Use indexed fields in filters
3. Implement date range limits
4. Archive old data
5. Use summary reports for large datasets

Problem: Inaccurate data in reports
Solutions:
1. Verify field mappings
2. Check formula field calculations
3. Review filter logic
4. Validate data sources
5. Test with known datasets
```

---

This comprehensive guide provides step-by-step instructions for creating all necessary dashboards and reports to support the DOI Permits system. Each configuration is detailed with specific field mappings, formatting options, and best practices to ensure successful implementation.

*Guide Version: 1.0*  
*Last Updated: September 3, 2025*  
*Compatibility: Salesforce Lightning Experience*