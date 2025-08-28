# Document Management Utility Component - Comprehensive Technical Documentation

## Table of Contents

1. [Component Architecture Overview](#component-architecture-overview)
2. [Technical Implementation Details](#technical-implementation-details)
3. [API Reference](#api-reference)
4. [LWC Component Documentation](#lwc-component-documentation)
5. [Configuration Guide](#configuration-guide)
6. [Usage Examples](#usage-examples)
7. [Security Considerations](#security-considerations)
8. [Integration Patterns](#integration-patterns)
9. [Troubleshooting Guide](#troubleshooting-guide)
10. [Performance Optimization](#performance-optimization)

## Component Architecture Overview

### Purpose and Business Value

The Document Management utility component provides a comprehensive file management solution for Salesforce records, featuring:

- **Virtual Folder Structure**: Organize files without physical folders using metadata-driven hierarchy
- **Portal Integration**: Full support for Experience Cloud and portal users
- **Drag-and-Drop Interface**: Modern file upload with batch processing capabilities
- **Search Functionality**: Cross-file and folder search with real-time results
- **Custom Theming**: Configurable UI colors and branding

### Component Structure

```
documentManagement/
├── classes/                           # Apex Backend Services
│   ├── FolderFilesController.cls     # Virtual folder management
│   ├── RecordFilesController.cls     # Direct file operations
│   └── *Test.cls                     # Comprehensive test classes
├── lwc/                              # Lightning Web Components
│   ├── folderFileManager/           # Main file management interface
│   └── fileDisplay/                 # Simple file display widget
├── objects/                          # Custom Metadata Types
│   └── FolderStructure__mdt/        # Folder hierarchy configuration
└── customMetadata/                   # Default configuration
    └── Default_Structure.md-meta.xml # Pre-configured folder structure
```

### Design Patterns

- **Virtual Folder Pattern**: Files organized through naming conventions (folder/subfolder/file.ext)
- **Metadata-Driven Configuration**: Folder structures defined in Custom Metadata Types
- **Portal-Aware Security**: Dynamic permission checks based on user context
- **Responsive UI**: Mobile-first design with adaptive layouts

## Technical Implementation Details

### Core Technologies

- **Apex**: Server-side logic with comprehensive bulkification
- **Lightning Web Components**: Modern JavaScript framework with ES6+ features
- **Custom Metadata Types**: Configuration without code deployment
- **Content Management**: Salesforce Files and Libraries integration
- **Platform Events**: Real-time updates (planned enhancement)

### Data Model

#### Content Objects Used

```apex
// Standard Salesforce Objects
- ContentDocument (File metadata)
- ContentVersion (File versions)
- ContentDocumentLink (Record associations)

// Custom Metadata Types
- FolderStructure__mdt (Folder definitions)
```

#### Virtual Folder Implementation

Files are organized using a path-based naming convention:
- `Documents/Contracts/contract.pdf` → Folder: "Documents/Contracts", File: "contract.pdf"
- `Images/profile.jpg` → Folder: "Images", File: "profile.jpg"
- `report.pdf` → Folder: "Default", File: "report.pdf"

## API Reference

### FolderFilesController (Apex)

#### getFolders(String recordId)
```apex
@AuraEnabled(cacheable=true)
public static List<FolderWrapper> getFolders(String recordId)
```
**Purpose**: Retrieves virtual folders for a record with file counts  
**Parameters**: 
- `recordId` (String): Salesforce record ID
**Returns**: `List<FolderWrapper>` containing folder information
**Caching**: Enabled for performance
**Security**: WITH SECURITY_ENFORCED implied through ContentDocumentLink queries

**Example Response**:
```json
[
  {
    "name": "Documents",
    "fileCount": 5
  },
  {
    "name": "Images", 
    "fileCount": 2
  }
]
```

#### getFolderFiles(String recordId, String folderName)
```apex
@AuraEnabled(cacheable=true)
public static List<FileWrapper> getFolderFiles(String recordId, String folderName)
```
**Purpose**: Retrieves files within a specific virtual folder  
**Parameters**:
- `recordId` (String): Salesforce record ID
- `folderName` (String): Virtual folder path (e.g., "Documents/Contracts")
**Returns**: `List<FileWrapper>` containing file information
**Special Cases**:
- Empty `folderName` returns all files (used for search)
- "Default" folder contains files without path prefixes

#### uploadFileToFolder(String recordId, String folderName, String fileName, String base64Data, String contentType)
```apex
@AuraEnabled
public static void uploadFileToFolder(String recordId, String folderName, String fileName, String base64Data, String contentType)
```
**Purpose**: Uploads file to specific virtual folder  
**Parameters**:
- `recordId` (String): Target record ID
- `folderName` (String): Virtual folder path
- `fileName` (String): Original filename
- `base64Data` (String): File content in base64
- `contentType` (String): MIME type

**File Naming Logic**:
```apex
// Default folder
fileName = "report.pdf"

// Specific folder  
fileName = "Documents/Contracts/report.pdf"
```

#### deleteFile(String contentDocumentId)
```apex
@AuraEnabled
public static void deleteFile(String contentDocumentId)
```
**Purpose**: Permanently deletes a file  
**Parameters**: 
- `contentDocumentId` (String): ContentDocument ID to delete
**Security**: Inherits user's delete permissions on ContentDocument

#### shareFileWithPortal(String contentDocumentId, String recordId)
```apex
@AuraEnabled
public static void shareFileWithPortal(String contentDocumentId, String recordId)
```
**Purpose**: Configures file visibility for portal users  
**Parameters**:
- `contentDocumentId` (String): File to share
- `recordId` (String): Associated record
**Behavior**: Sets ShareType='V' (Viewer) and Visibility='AllUsers'

#### getPredefinedFolders()
```apex
@AuraEnabled(cacheable=true)
public static List<String> getPredefinedFolders()
```
**Purpose**: Retrieves folder structure from Custom Metadata Type  
**Returns**: `List<String>` of folder paths
**Fallback**: Returns default folders if metadata query fails

**Default Folders**:
```apex
'Documents', 'Images', 'Reports/Monthly', 'Reports/Annual', 'Supporting Documents'
```

### RecordFilesController (Apex)

#### getRecordFiles(String recordId)
```apex
@AuraEnabled(cacheable=true)
public static List<FileWrapper> getRecordFiles(String recordId)
```
**Purpose**: Direct file retrieval without folder processing  
**Use Case**: Simple file listings and integrations  
**Portal Handling**: Automatic filtering for external users

### Wrapper Classes

#### FolderWrapper
```apex
public class FolderWrapper {
    @AuraEnabled public String name;
    @AuraEnabled public Integer fileCount;
}
```

#### FileWrapper
```apex
public class FileWrapper {
    @AuraEnabled public String Id;              // ContentVersion Id
    @AuraEnabled public String ContentDocumentId;
    @AuraEnabled public String Title;
    @AuraEnabled public String FileType;
    @AuraEnabled public Long ContentSize;
    @AuraEnabled public Datetime ContentModifiedDate;
}
```

## LWC Component Documentation

### folderFileManager

#### Component API

```javascript
@api allowDelete = false;           // Enable delete functionality
@api maxItemsToShow = 10;          // Items per page (planned)
@api title = "File Manager";       // Component title
@api folderStructureMetadata = "Default_Structure"; // Metadata record name
@api recordId;                     // Record to associate files with
@api primaryColor = "#22BDC1";     // Primary theme color
@api accentColor = "#D5DF23";      // Accent theme color
```

#### Key Methods

##### connectedCallback()
```javascript
connectedCallback() {
    // 1. Extracts recordId from URL if not provided via @api
    // 2. Applies custom theming
    // 3. Initializes folder structure from metadata
    // 4. Shows top-level folders
}
```

##### performSearch()
```javascript
performSearch() {
    // Debounced search across files and folders
    // Shows both file and folder results simultaneously
    // Updates breadcrumbs to indicate search mode
}
```

##### handleFileUpload()
```javascript
handleSaveUpload() {
    // Sequential file upload with progress tracking
    // Error handling per file
    // Automatic refresh after completion
}
```

#### Event Handling

```javascript
// File Operations
handleRowAction(event)      // Download, delete file actions
handleFileChange(event)     // File input change
handleFileDrop(event)       // Drag-and-drop file upload

// Navigation  
handleBreadcrumbClick(event) // Folder navigation via breadcrumbs
handleSort(event)           // Column sorting

// Search
handleSearchChange(event)   // Search input
handleSearch()             // Debounced search execution
```

#### Custom Styling

The component supports dynamic theming through CSS custom properties:

```css
.folder-manager-container {
    --primary-color: #22BDC1;
    --accent-color: #D5DF23;
    --primary-rgb: 34, 189, 193;
    --accent-rgb: 213, 223, 35;
    --text-on-primary: #ffffff;
    --text-on-accent: #000000;
}
```

### fileDisplay

Simplified component for basic file listing without folder management.

## Configuration Guide

### Custom Metadata Type Setup

#### FolderStructure__mdt Fields

| Field | Type | Purpose |
|-------|------|---------|
| DeveloperName | Text | Unique identifier (e.g., 'Default_Structure') |
| LongFolderPaths__c | Long Text Area | Comma-separated folder paths |
| LongDescription__c | Long Text Area | Documentation for this structure |

#### Creating Folder Structures

1. **Navigate to Setup > Custom Metadata Types**
2. **Find FolderStructure**
3. **Create New Record**:

```
DeveloperName: HR_Document_Structure
LongFolderPaths__c: 
Personnel Files/Active,
Personnel Files/Terminated,
Policies/HR,
Policies/Safety,
Training Materials,
Performance Reviews,
Benefits/Medical,
Benefits/Retirement

LongDescription__c: 
Folder structure for HR Administrative processes including personnel management, policy documents, training materials, and benefits administration.
```

### Component Configuration

#### Lightning Page Setup

```xml
<component name="c:folderFileManager">
    <property name="recordId" value="{!recordId}" />
    <property name="title" value="Contract Documents" />
    <property name="allowDelete" value="true" />
    <property name="folderStructureMetadata" value="Contract_Structure" />
    <property name="primaryColor" value="#1f4e79" />
    <property name="accentColor" value="#ff6b35" />
</component>
```

#### Permission Set Configuration

Create permission sets for different user levels:

```xml
<!-- File Manager Users -->
<PermissionSet>
    <objectPermissions>
        <object>ContentDocument</object>
        <allowRead>true</allowRead>
        <allowCreate>true</allowCreate>
        <allowDelete>false</allowDelete>
    </objectPermissions>
    <objectPermissions>
        <object>ContentVersion</object>
        <allowRead>true</allowRead>
        <allowCreate>true</allowCreate>
    </objectPermissions>
</PermissionSet>
```

## Usage Examples

### Basic Implementation

```html
<!-- Lightning Page or Community -->
<c-folder-file-manager 
    record-id="0031U00000qQjOdQAK"
    title="Project Documents"
    allow-delete="true"
    primary-color="#2B5CE6"
    accent-color="#FFB75D">
</c-folder-file-manager>
```

### Advanced Configuration

```javascript
// Custom folder structure for specific business process
const customConfig = {
    folderStructureMetadata: 'Investigation_Documents',
    title: 'Investigation File Manager',
    allowDelete: false, // Compliance requirement
    primaryColor: '#C41E3A', // Corporate red
    accentColor: '#FFD700'   // Corporate gold
};
```

### Integration with Flow

```xml
<!-- Flow Screen Component -->
<component name="c:folderFileManager">
    <property name="recordId" value="{!recordId}" />
    <property name="title" value="Upload Evidence" />
    <property name="allowDelete" value="false" />
    <property name="folderStructureMetadata" value="Evidence_Structure" />
</component>
```

### Programmatic File Upload

```javascript
// JavaScript for bulk upload scenarios
import uploadFileToFolder from '@salesforce/apex/FolderFilesController.uploadFileToFolder';

async function uploadMultipleFiles(recordId, files) {
    for (const file of files) {
        try {
            const base64 = await convertToBase64(file);
            await uploadFileToFolder({
                recordId: recordId,
                folderName: 'Batch Upload',
                fileName: file.name,
                base64Data: base64,
                contentType: file.type
            });
        } catch (error) {
            console.error('Upload failed:', file.name, error);
        }
    }
}
```

## Security Considerations

### Access Control Implementation

#### Portal User Security
```apex
// Automatic portal user detection
Boolean isPortalUser = 
    UserInfo.getUserType() == 'PowerCustomerSuccess' ||
    UserInfo.getUserType() == 'PowerPartner' ||
    UserInfo.getUserType() == 'CustomerSuccess' ||
    UserInfo.getUserType() == 'CspLitePortal';

// Portal-specific query filtering
if (isPortalUser) {
    links = [
        SELECT ContentDocumentId, LinkedEntityId, ShareType, Visibility
        FROM ContentDocumentLink
        WHERE LinkedEntityId = :recordId
        AND (ShareType = 'V' OR ShareType = 'C')
        AND Visibility = 'AllUsers'
    ];
}
```

#### File Sharing Controls
```apex
// Explicit sharing for portal access
ContentDocumentLink link = new ContentDocumentLink();
link.ContentDocumentId = contentDocumentId;
link.LinkedEntityId = recordId;
link.ShareType = 'V';        // Viewer access
link.Visibility = 'AllUsers'; // Visible to all users
insert link;
```

### Security Best Practices

1. **Field-Level Security**: All SOQL queries respect user permissions
2. **Input Validation**: All user inputs sanitized and validated
3. **File Size Limits**: Enforced through platform limits and UI controls
4. **File Type Restrictions**: Configurable accepted formats
5. **Delete Permissions**: Controlled through allowDelete property

### Compliance Features

- **Audit Trail**: All file operations logged through Salesforce standard audit
- **Data Retention**: Configurable through Salesforce retention policies
- **Encryption**: Files encrypted at rest through platform features
- **Access Logging**: User access tracked through standard Salesforce logs

## Integration Patterns

### With Business Processes

#### Flow Integration
```xml
<!-- Process Builder / Flow Actions -->
<processMetadataValues>
    <name>FieldAssignments</name>
    <value>
        <stringValue>c:folderFileManager</stringValue>
        <valueType>reference</valueType>
    </value>
</processMetadataValues>
```

#### Approval Process Integration
```apex
// Trigger example for document requirements
trigger CaseDocumentRequirement on Case (before update) {
    for (Case c : Trigger.new) {
        if (c.Status == 'Under Review') {
            // Check for required documents
            Integer docCount = [
                SELECT COUNT()
                FROM ContentDocumentLink
                WHERE LinkedEntityId = :c.Id
            ];
            
            if (docCount == 0) {
                c.addError('Required documents must be uploaded before review');
            }
        }
    }
}
```

### With External Systems

#### REST API Integration
```apex
@RestResource(urlMapping='/documentManagement/*')
global with sharing class DocumentManagementAPI {
    
    @HttpPost
    global static String uploadDocument() {
        RestRequest req = RestContext.request;
        RestResponse res = RestContext.response;
        
        // Extract parameters
        String recordId = req.params.get('recordId');
        String folderName = req.params.get('folderName');
        String fileName = req.params.get('fileName');
        String base64Data = req.requestBody.toString();
        
        try {
            FolderFilesController.uploadFileToFolder(
                recordId, folderName, fileName, base64Data, 'application/pdf'
            );
            
            return '{"status":"success","message":"File uploaded successfully"}';
        } catch (Exception e) {
            res.statusCode = 400;
            return '{"status":"error","message":"' + e.getMessage() + '"}';
        }
    }
}
```

### With Other Components

#### Cross-Component Communication
```javascript
// Event-driven integration
import { publish, MessageContext } from 'lightning/messageService';
import DOCUMENT_CHANNEL from '@salesforce/messageChannel/DocumentUpdate__c';

// Notify other components of file changes
publish(this.messageContext, DOCUMENT_CHANNEL, {
    recordId: this.recordId,
    action: 'file_uploaded',
    fileName: fileName,
    folderName: folderName
});
```

## Troubleshooting Guide

### Common Issues and Resolutions

#### 1. Files Not Displaying

**Symptoms**: Component loads but shows no files
**Possible Causes**:
- Invalid recordId
- Permission issues
- Portal user without proper sharing

**Resolution Steps**:
```apex
// Debug query in Developer Console
List<ContentDocumentLink> links = [
    SELECT ContentDocumentId, LinkedEntityId, ShareType, Visibility
    FROM ContentDocumentLink
    WHERE LinkedEntityId = 'RECORD_ID_HERE'
];
System.debug('Found links: ' + links.size());

// Check user permissions
System.debug('User type: ' + UserInfo.getUserType());
System.debug('User profile: ' + UserInfo.getProfileId());
```

#### 2. Upload Failures

**Symptoms**: Files selected but upload fails
**Possible Causes**:
- File size too large
- Invalid file type
- Governor limit exceeded
- Permission insufficient

**Resolution Steps**:
1. Check file size limits in Setup
2. Verify accepted file formats
3. Review debug logs for specific errors
4. Confirm user has ContentDocument create permissions

#### 3. Portal User Access Issues

**Symptoms**: Internal users see files, portal users don't
**Possible Causes**:
- ContentDocumentLink visibility settings
- Sharing rule configuration
- Experience Cloud settings

**Resolution Steps**:
```apex
// Fix sharing for portal users
FolderFilesController.shareFileWithPortal(
    contentDocumentId, 
    recordId
);

// Verify sharing settings
List<ContentDocumentLink> links = [
    SELECT Visibility, ShareType
    FROM ContentDocumentLink
    WHERE ContentDocumentId = 'DOCUMENT_ID'
];
```

#### 4. Search Not Working

**Symptoms**: Search returns no results despite files existing
**Possible Causes**:
- Case sensitivity issues
- Special characters in file names
- Cached data problems

**Resolution Steps**:
1. Clear browser cache
2. Check for special characters in search
3. Verify file titles in database
4. Test with simple search terms

#### 5. Custom Metadata Issues

**Symptoms**: Folder structure not loading correctly
**Possible Causes**:
- Incorrect metadata API name
- Missing metadata record
- Syntax errors in folder paths

**Resolution Steps**:
```apex
// Test metadata query
FolderStructure__mdt structure = [
    SELECT LongFolderPaths__c
    FROM FolderStructure__mdt
    WHERE DeveloperName = 'Your_Structure_Name'
];
System.debug('Folder paths: ' + structure.LongFolderPaths__c);
```

### Performance Troubleshooting

#### Slow Loading Times

**Check Points**:
1. Record has excessive file count (>100 files)
2. Complex folder hierarchy (>5 levels deep)
3. Large file sizes affecting browser performance
4. Network connectivity issues

**Optimization Steps**:
1. Implement pagination for large file sets
2. Simplify folder structure
3. Consider file archival for old files
4. Enable caching where appropriate

#### Memory Issues

**Symptoms**: Browser becomes unresponsive during file operations
**Solutions**:
1. Reduce maxFilesLimit property
2. Implement chunked file uploads
3. Add loading indicators
4. Optimize file processing logic

### Debug Mode Activation

```javascript
// Add to component for debugging
connectedCallback() {
    this.debugMode = true; // Enable debug logging
    console.log('Debug mode enabled for folderFileManager');
}

// Debug helper method
debugLog(message, data) {
    if (this.debugMode) {
        console.log(`[FolderFileManager] ${message}`, data);
    }
}
```

## Performance Optimization

### Caching Strategy

#### Apex Caching
```apex
// Cacheable methods for better performance
@AuraEnabled(cacheable=true)
public static List<FileWrapper> getRecordFiles(String recordId) {
    // Implementation uses SOQL query results that can be cached
}
```

#### LWC Caching
```javascript
// Wire service caching
@wire(getFolders, { recordId: '$recordId' })
wiredFolders({ error, data }) {
    // Automatic caching via wire service
}
```

### Governor Limit Management

#### Bulk Operations
```apex
// Efficient bulk file processing
public static void processBulkUploads(List<FileUploadRequest> requests) {
    List<ContentVersion> versions = new List<ContentVersion>();
    
    for (FileUploadRequest request : requests) {
        ContentVersion cv = new ContentVersion();
        cv.Title = request.folderName + '/' + request.fileName;
        cv.VersionData = EncodingUtil.base64Decode(request.base64Data);
        cv.FirstPublishLocationId = request.recordId;
        versions.add(cv);
    }
    
    insert versions; // Single DML operation
}
```

#### Query Optimization
```apex
// Selective queries with indexed fields
List<ContentDocumentLink> links = [
    SELECT ContentDocumentId, LinkedEntityId, ShareType, Visibility
    FROM ContentDocumentLink
    WHERE LinkedEntityId = :recordId
    AND ContentDocumentId IN :contentDocIds // Use indexed fields
];
```

### UI Performance

#### Lazy Loading Implementation
```javascript
// Implement virtual scrolling for large file lists
renderedCallback() {
    if (this.files.length > 50) {
        this.implementVirtualScrolling();
    }
}

implementVirtualScrolling() {
    // Show only visible items plus buffer
    const visibleItems = this.calculateVisibleItems();
    this.displayFiles = this.files.slice(0, visibleItems);
}
```

#### Debounced Operations
```javascript
// Debounced search to prevent excessive server calls
handleSearchChange(event) {
    clearTimeout(this.searchTimeout);
    this.searchTimeout = setTimeout(() => {
        this.performSearch();
    }, 300); // 300ms debounce
}
```

### Memory Management

#### File Processing Optimization
```javascript
// Process files in chunks to avoid memory issues
async processLargeFileSet(files) {
    const chunkSize = 5;
    for (let i = 0; i < files.length; i += chunkSize) {
        const chunk = files.slice(i, i + chunkSize);
        await this.processFileChunk(chunk);
        
        // Brief pause to allow garbage collection
        await new Promise(resolve => setTimeout(resolve, 10));
    }
}
```

## Deployment Guide

### Pre-Deployment Checklist

- [ ] Custom Metadata Types deployed
- [ ] Permission sets configured
- [ ] Default folder structure configured
- [ ] Component properties reviewed
- [ ] Integration points tested
- [ ] Security settings verified

### Deployment Steps

1. **Deploy Metadata**:
```bash
sfdx force:source:deploy -p force-app/main/UtilityComponents/documentManagement/objects
sfdx force:source:deploy -p force-app/main/UtilityComponents/documentManagement/customMetadata
```

2. **Deploy Apex Classes**:
```bash
sfdx force:source:deploy -p force-app/main/UtilityComponents/documentManagement/classes
```

3. **Deploy LWC Components**:
```bash
sfdx force:source:deploy -p force-app/main/UtilityComponents/documentManagement/lwc
```

4. **Assign Permissions**:
```bash
sfdx force:user:permset:assign -n Document_Manager_User -u user@example.com
```

### Post-Deployment Validation

```apex
// Anonymous Apex for validation
String testRecordId = '0031U00000qQjOdQAK'; // Replace with actual ID

// Test folder retrieval
List<FolderFilesController.FolderWrapper> folders = 
    FolderFilesController.getFolders(testRecordId);
System.debug('Folders found: ' + folders.size());

// Test file retrieval  
List<FolderFilesController.FileWrapper> files = 
    FolderFilesController.getFolderFiles(testRecordId, 'Default');
System.debug('Files found: ' + files.size());

// Test metadata access
List<String> predefinedFolders = FolderFilesController.getPredefinedFolders();
System.debug('Predefined folders: ' + predefinedFolders);
```

---

*This documentation represents a comprehensive technical guide for the Document Management utility component. For additional support or feature requests, contact the development team.*

**Document Version**: 1.0  
**Last Updated**: 2024-12-19  
**Compatibility**: Salesforce API 62.0+