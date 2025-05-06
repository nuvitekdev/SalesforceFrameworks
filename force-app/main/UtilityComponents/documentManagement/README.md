# Document Management Component

This README provides information about the Document Management component package, which includes folderFileManager and fileDisplay components.

## Features

- **folderFileManager**: A component that provides folder-based file management for records
- **fileDisplay**: A simpler component that displays files related to a record

## Recent Updates

- Added standalone mode to folderFileManager to allow using it without a record ID
- Improved header styling with darker gradient background
- Fixed breadcrumb carrot alignment
- Added ability to upload files from the main folder area in standalone mode

## How to Use Standalone Mode

The folderFileManager component now supports a "standalone mode" that allows uploading and managing files without associating them with a record. This is useful for:

- App pages where no record context is available
- Community pages that need general file management
- Collecting files that don't need to be tied to specific records

To use standalone mode:

1. When adding the component to an App Page or Home Page, the "Standalone Mode" property will be set to true by default
2. When adding to a Community Page, set the "Standalone Mode" property to true and leave "Record ID" empty
3. Files uploaded in standalone mode will be owned by the current user but not linked to any records

In standalone mode, the component still uses the same folder structure but stores files without record association.

## Component Properties

### folderFileManager

| Property | Type | Description |
|----------|------|-------------|
| title | String | The title to display for the component |
| allowDelete | Boolean | Whether users can delete files |
| folderStructureMetadata | String | The developer name of the Custom Metadata record that defines the folder structure |
| recordId | String | The record ID to associate files with (not required in standalone mode) |
| standaloneMode | Boolean | Whether to operate in standalone mode without a record ID |
| primaryColor | String | Primary accent color for buttons, icons and interactive elements |
| accentColor | String | Secondary accent color for gradients and decorations |

### fileDisplay

| Property | Type | Description |
|----------|------|-------------|
| allowUpload | Boolean | Whether to allow file upload functionality |
| allowDelete | Boolean | Whether to allow users to delete files |
| recordId | String | The record ID to associate files with |
| maxFilesToShow | Integer | Maximum number of files to display in the scrollable table |
| primaryColor | String | Primary accent color for buttons, icons and interactive elements |
| accentColor | String | Secondary accent color for highlights and decorations |

## Overview

The Document Management component offers a comprehensive solution for organizing, storing, and managing files in Salesforce with a clean, modern UI inspired by Apple's Human Interface Guidelines. It consists of two primary components:

1. **folderFileManager**: A hierarchical folder-based file manager with customizable folder structures defined in metadata.
2. **fileDisplay**: A streamlined file viewer and manager for record-specific files with upload and download capabilities.

## Key Features

- **Hierarchical Folder Structure**: Create and customize folder hierarchies via Custom Metadata Type.
- **Intuitive Navigation**: Easy breadcrumb navigation between folders with search functionality.
- **Drag & Drop Uploads**: Simple file uploads to specific folders or records.
- **Multiple File Actions**: Download, delete, and preview files with a single click.
- **Record Association**: Automatically associate files with any Salesforce record.
- **Portal Compatibility**: Works seamlessly in Experience Cloud sites with automatic file sharing.
- **Mobile Responsive**: Clean, responsive design works across all device types.
- **Sleek, Modern UI**: Apple-inspired interface with fluid animations and intuitive controls.
- **Theme Customization**: Configure colors to match your brand and Salesforce theme.

## Why Use This Component?

1. **Enhanced Organization**: Structure files logically with customizable folder hierarchies.
2. **Improved User Experience**: Modern, intuitive interface eliminates Salesforce's basic file list limitations.
3. **Simplified Administration**: Centralized management without external systems or additional licenses.
4. **Better Collaboration**: Makes file sharing and access intuitive for both internal and external users.
5. **Cost Efficiency**: Eliminates need for third-party document management solutions.
6. **Seamless Integration**: Native Salesforce solution that works with standard Files functionality.
7. **Flexible Implementation**: Use on any record page, home page, app page, or Experience Cloud site.

## Who Should Use This Component?

- **Sales Teams**: Organize sales collateral, contracts, and customer documents.
- **Service Teams**: Manage case documentation, knowledge articles, and customer files.
- **Legal Departments**: Structure legal documents with appropriate folder hierarchies.
- **Operations Teams**: Maintain operational documentation and process files.
- **Marketing Teams**: Organize marketing materials, assets, and digital content.
- **HR Departments**: Store and organize employee documents securely.
- **Project Teams**: Maintain project documentation with structured organization.
- **Communities**: Provide document access to partners and customers in Experience Cloud.

## When to Use the Document Management Component

Implement this component when:

- Your organization needs a structured way to organize Salesforce files
- Users struggle to find important documents in Salesforce
- You need to provide easy document access to portal users
- You want to replace an external document management system
- Record-specific documents need better organization
- Users need a familiar file/folder interface for documents
- You need to implement a file-based business process in Salesforce

## Component Details

### folderFileManager Component

The folder-based file manager component provides:

- **Custom Folder Structures**: Define folder structures in FolderStructure__mdt Custom Metadata Type.
- **Intuitive Navigation**: Easy folder browsing with breadcrumb trails.
- **Search Capability**: Find files and folders quickly with built-in search.
- **File Actions**: Download, delete, and preview files with row actions.
- **File Upload**: Upload files directly to specific folders.
- **Record Association**: Associate files with any Salesforce record.

### fileDisplay Component

The record-specific file viewer component provides:

- **Record Context**: Automatically displays files related to the current record.
- **Upload Capability**: Add files directly to records when enabled.
- **Download/Delete**: File management actions with appropriate permissions.
- **Sorting**: Sort files by name, type, size, or modified date.
- **Portal Sharing**: Automatically shares files appropriately in portal contexts.

## How to Configure and Use

### Installation

1. Deploy the component to your Salesforce org.
2. Create FolderStructure__mdt records to define your folder hierarchies.

### Configuration

#### folderFileManager Component

Add to any Salesforce page and configure:

- **Title**: The component header text.
- **Allow Delete**: Enable/disable file deletion capability.
- **Record ID**: The record to associate files with (optional, auto-detected on record pages).
- **Folder Structure Metadata**: The name of the Custom Metadata record that defines the folder structure.
- **Primary Color**: Main theme color.
- **Accent Color**: Secondary theme color for highlights and interactive elements.

#### fileDisplay Component

Add to record pages and configure:

- **Allow Upload**: Enable/disable file upload capability.
- **Allow Delete**: Enable/disable file deletion capability.
- **Max Files to Show**: Number of files to display before scrolling.
- **Primary Color**: Main theme color.
- **Accent Color**: Secondary theme color for highlights and interactive elements.

### Custom Metadata Setup

Create FolderStructure__mdt records with:

- **Label**: Name of the folder structure.
- **Description**: Detailed description for admin reference.
- **Folder Paths**: Comma-separated list of folder paths (use "/" for nested folders).

Example folder paths:
```
Documents,Reports,Images,Reports/Monthly,Reports/Annual,Supporting Documents
```

## Technical Architecture

### Apex Classes

- **FolderFilesController**: Manages folder-related operations and hierarchies.
- **RecordFilesController**: Handles record-specific file operations.
- **Test Classes**: Comprehensive test coverage for all controllers.

### Lightning Web Components

- **folderFileManager**: The folder-based file manager with nested navigation.
- **fileDisplay**: The record-specific file display component.

### Custom Metadata Type

- **FolderStructure__mdt**: Defines folder hierarchies that can be created.

## Security Considerations

- File operations honor standard Salesforce permissions.
- In Experience Cloud, files are automatically shared with guest or authenticated users based on context.
- Controllers use "without sharing" to ensure files can be accessed appropriately.

## Troubleshooting

### Common Issues

1. **Files Not Appearing**
   - Verify user has read access to ContentDocument and ContentVersion objects.
   - Check if files are shared properly with the running user.

2. **Cannot Delete Files**
   - Verify user has delete permissions on ContentDocument.
   - Check that the allow delete property is enabled on the component.

3. **Folder Structure Not Appearing**
   - Verify FolderStructure__mdt records are properly configured.
   - Check spellings and ensure folder paths use proper format.

4. **Upload Issues**
   - Verify user has create permissions on ContentDocument.
   - Check that recordId is properly set on the component.

## Best Practices

1. **Folder Structure Design**: Keep folder hierarchies relatively shallow (2-3 levels deep) for best usability.
2. **Performance Considerations**: Limit the number of files per folder to improve load times.
3. **Permission Setup**: Create permission sets for different user types to control file access.
4. **Naming Conventions**: Establish file naming conventions for better search results.

## Customization Opportunities

The component can be extended to support:

- Additional file actions (share, version history, etc.)
- Custom file preview handlers for specialized file types
- Integration with other document-related processes
- Custom file metadata capture

## License

This component is available under the MIT License. See LICENSE.md for details.

## Limitations and Requirements

### Record Context Required
Both components in this package (`folderFileManager` and `fileDisplay`) require a valid Salesforce record context to function properly. They can only be used in the following ways:

1. **On Salesforce Record Pages**: The components will automatically detect the current record's ID.
2. **On Experience Cloud with an explicit Record ID**: When using in Experience Cloud, you must provide a valid Record ID in the component configuration.

The components will display an error message if placed on pages without a valid record context (such as Home pages, App pages without record context, or custom tabs).

### Best Practices for Deployment
- Always place these components on record-detail pages or record-related sections.
- When using in Experience Cloud, always provide a valid record ID in the component properties.
- Test the components on the appropriate page types before deploying to production.
- Ensure record sharing settings allow access to the files by the intended users.

### Troubleshooting Component Errors
If you see errors related to "Cannot read properties of null (reading 'appendChild')" or missing record context:
1. Verify the component is placed on a record page or has a record ID specified.
2. Check if the record ID property is properly configured for Experience Cloud pages.
3. Verify the user has access to the record specified in the component properties.

---

*Developed by Nuvitek - Transforming business through innovative Salesforce solutions.* 