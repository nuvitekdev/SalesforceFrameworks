# Dynamic List Viewer

## Overview
The Dynamic List Viewer is a flexible, configurable Lightning Web Component (LWC) that allows users to display and interact with records from any Salesforce object. It provides a modern, responsive interface for viewing, sorting, searching, and navigating through record data with minimal configuration required.

## Who Should Use This?
- **Salesforce Administrators** who need to quickly add list views to Lightning Pages
- **Salesforce Developers** looking for a reusable component to display record data
- **Business Users** who want customizable views of their data without custom development
- **Lightning Experience and Community Users** who need optimized record browsing experiences

## What Does It Do?
The Dynamic List Viewer provides the following capabilities:

### Core Features
- **Dynamic Data Display**: Show records from any standard or custom object
- **Configurable Columns**: Specify which fields to display in the list view
- **Pagination**: Navigate through large datasets with built-in pagination
- **Sorting**: Sort data by clicking on column headers
- **Search**: Filter records with a built-in search bar
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices

### Advanced Features
- **Dynamic Data Display**: Show records from any standard or custom object
- **Configurable Columns**: Specify which fields to display in the list view
- **Pagination**: Navigate through large datasets with built-in pagination
- **Sorting**: Sort data by clicking on column headers
- **Search**: Filter records with a built-in search bar
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices
- **Complete Record Details**: When clicking a record, all accessible fields are retrieved and displayed in the detail view
- **Hidden System Fields**: System fields like ID are used internally but hidden from users in the detail view
- **Related Records**: View related records in a tabbed interface
- **Visual Customization**: Customize primary, accent, and text colors to match your branding

## When To Use It?
- When you need a quick way to display records without building custom components
- When standard list views don't provide enough flexibility
- When you want to embed record lists in custom Lightning pages
- When users need to search, sort, and filter records in an intuitive interface
- When you want to show related records in context
- When you need consistent record display across multiple objects

## Where To Use It?
- **Lightning App Pages**: Add to any app page to create custom workspaces
- **Lightning Record Pages**: Show related records on a record detail page
- **Lightning Home Pages**: Display important records on dashboard-style home pages
- **Lightning Communities**: Provide community users with access to relevant records
- **Lightning Flow Screens**: Embed in flows to allow users to select records

## Why Use It?
### Benefits
- **Reduces Development Time**: No need to create custom components for each list view
- **Improves User Experience**: Modern, responsive interface with intuitive controls
- **Increases Flexibility**: Configure once, reuse many times with different objects
- **Enhances Productivity**: Quick access to records and their details in one component
- **Simplifies Maintenance**: Single component to update rather than multiple custom list views

### Technical Advantages
- Optimized performance with pagination and lazy loading
- Follows Salesforce Lightning Design System standards
- Built using modern LWC practices for reliability
- Handles errors gracefully with clear user feedback
- Easy to extend with additional functionality if needed

## How To Use It

### Basic Setup
1. Drag the "Dynamic Record List View" component onto your Lightning page
2. Configure the "Object API Name" property with the API name of the object you want to display
3. Specify the fields to display in the "List View Fields" property as a comma-separated list

### Important Notes
- **The component automatically includes the Id and Name fields** - you don't need to specify them in List View Fields
- For optimal performance, limit the number of fields displayed in the main list view
- Do not specify the same field in both List View Fields and as Title/Subtitle Field to avoid duplicate field errors

### Configuration Options
- **Object API Name**: The API name of the object to display (e.g., "Account", "Contact", "Custom_Object__c")
- **List View Fields**: Comma-separated list of field API names to display as columns (e.g., "Name,Phone,Industry,CreatedDate")
- **Title Field**: Field to use as the title in record detail view (defaults to Name if blank)
- **Subtitle Field**: Field to use as the subtitle in record detail view
- **Icon Field**: Field containing an icon name to display
- **Primary Color**: Primary theme color for headers and buttons
- **Accent Color**: Secondary color for highlights and accents
- **Text Color**: Main text color throughout the component

### Troubleshooting Common Errors
- **Internal server error (500)**: This may be due to:
  - Permission issues: Ensure the running user has access to all the fields being queried
  - Invalid field names: Check that all field names are correct and exist in the object
  - Duplicate fields: Make sure you're not specifying the same field multiple times
- **Duplicate field error**: Occurs when the same field is included multiple times in the query
  - Don't include Name in List View Fields if you also set it as the Title Field
  - Use different fields for List View Fields, Title Field, Subtitle Field, and Icon Field
- **No records loading**: Check that:
  - The object API name is correct
  - The running user has access to the object and fields
  - Search terms or filters aren't excluding all records

## Technical Architecture
The component is built with the following technologies:
- Lightning Web Components (LWC) framework
- Apex controllers for server-side data operations
- SLDS (Salesforce Lightning Design System) for styling

## Examples

### Account List Example
```xml
<lightning-card title="Accounts">
    <c-dynamic-record-list-view
        object-api-name="Account"
        list-view-fields="Industry,Phone,AnnualRevenue,Type"
        subtitle-field="Industry">
    </c-dynamic-record-list-view>
</lightning-card>
```

### Custom Object Example
```xml
<lightning-card title="Projects">
    <c-dynamic-record-list-view
        object-api-name="Project__c"
        list-view-fields="Status__c,Start_Date__c,End_Date__c,Budget__c"
        subtitle-field="Status__c">
    </c-dynamic-record-list-view>
</lightning-card>
```

## Support & Maintenance
For issues, feature requests, or contributions:
- Contact the development team via the internal Slack channel #dynamic-components-support
- Log issues in the internal JIRA project under "Dynamic Components"
- Refer to the technical documentation in the codebase for detailed implementation details 