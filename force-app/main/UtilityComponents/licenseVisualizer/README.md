# License Visualization Tool

## Overview

The License Visualization Tool is a comprehensive Salesforce Lightning Web Component (LWC) dashboard that provides real-time insights into your organization's license usage, user activity patterns, feature adoption metrics, and API consumption. With a modern Apple-inspired UI design, this tool empowers Salesforce administrators to optimize license allocation, identify inactive users, monitor adoption trends, and track critical system usage metrics.

## Deployment Instructions

### 1. Deploy Component Files

Deploy all files in the `force-app/main/UtilityComponents/licenseVisualizer` directory to your Salesforce org.

Using Salesforce CLI:

```
sfdx force:source:deploy -p force-app/main/UtilityComponents/licenseVisualizer
```

### 2. Upload Required Static Resources

Upload these three files as Static Resources with the EXACT names:

- `chartjs` - Chart.js library (v3.9.1)
- `chartjsPluginDatalabels` - Chart.js Datalabels plugin
- `heatmapPlugin` - Chart.js Matrix plugin for heatmaps

### 3. Access the Component

- Add to App or Home pages via the Lightning App Builder
- Access via the pre-configured License Dashboard App Page

## Features

### 1. License Usage Dashboard

- **License Utilization Overview**: Visual breakdown of license allocation across all license types
- **Assigned vs Available Licenses**: Track assigned, inactive, and available licenses
- **Inactive User Detection**: Identify users who haven't logged in for a configurable period
- **Cost Analysis**: Estimate potential savings from reassigning inactive user licenses

### 2. User Activity Tracking

- **Login Activity Heatmap**: Visualize login patterns by day and time
- **Geographical Distribution**: See where your users are logging in from
- **Login Method Analysis**: Track how users access Salesforce (web, mobile, API)
- **Mobile Adoption**: Track mobile vs desktop usage patterns

### 3. Feature Adoption Analytics

- **Permission Set Usage**: Track which permission sets are most widely used
- **Profile Distribution**: Visualize user distribution across profiles
- **Object Usage**: See which objects have the most records
- **Report & Dashboard Adoption**: Track how many users are using reports and dashboards

### 4. API Usage Monitoring

- **API Call Tracking**: Monitor API usage against daily limits
- **Storage Usage**: Track data and file storage consumption
- **API Trends**: Analyze API usage patterns over time
- **Top API Consumers**: Identify which users or connected apps use the most API calls

## Configuration Options

The component offers several configuration options:

- **Auto Refresh Interval**: How often the dashboard refreshes (minutes)
- **Show Inactive Users**: Include inactive users in license counts
- **Inactive User Threshold**: Days without login to consider a user inactive
- **Default Tab**: Which tab to display when the component loads
- **Display Mode**: Graphical, tabular, or compact display modes
- **Color Theme**: Select from multiple color schemes
- **Enable Data Export**: Allow exporting data to Excel format
- **Show Detailed API Usage**: Display detailed API usage metrics
- **Enable Real-Time Updates**: Use streaming API for real-time updates

## Troubleshooting

- **Missing Static Resources**: Ensure `chartjs`, `chartjsPluginDatalabels`, and `heatmapPlugin` are uploaded with exact names
- **Chart Display Issues**: If charts don't render, check browser console and verify static resources are correct
- **Data Display Issues**: Verify the user has access to necessary objects (User, UserLicense, Profile, LoginHistory)

## Support and Maintenance

This component is maintained by Nuvitek. For support or feature requests, please contact your Nuvitek representative.

## License

This component is provided by Nuvitek and is subject to the terms of your Nuvitek license agreement.
