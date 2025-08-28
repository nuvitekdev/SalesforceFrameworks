# Dynamic List Viewer Utility Component - Comprehensive Technical Documentation

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

The Dynamic List Viewer utility component provides a comprehensive, configurable data grid solution for Salesforce records, featuring:

- **Dynamic Object Support**: View any standard or custom Salesforce object
- **Advanced Search & Filtering**: Full-text search with field-specific filtering
- **Related Record Navigation**: Navigate through lookups and relationships with breadcrumb tracking
- **Modal Detail View**: Comprehensive record details with tabs for related lists
- **Action Integration**: Support for Quick Actions, Flows, and standard record operations
- **Responsive Design**: Adaptive layout optimized for all screen sizes

### Component Structure

```
dynamicListViewer/
├── classes/                              # Apex Backend Services
│   └── DynamicRecordListViewController.cls # Main controller with 2200+ lines
├── lwc/                                  # Lightning Web Components
│   └── dynamicRecordListView/           # Main component
│       ├── dynamicRecordListView.js     # Component logic
│       ├── dynamicRecordListView.html   # Template
│       ├── dynamicRecordListView.css    # Styling
│       └── dynamicRecordListView.js-meta.xml # Metadata
└── README.md                            # Basic documentation
```

### Key Features

#### Core Functionality
- **Object-Agnostic**: Works with any Salesforce standard or custom object
- **Field-Level Security**: Respects user permissions and field accessibility
- **Pagination**: Efficient handling of large datasets with configurable page sizes
- **Sorting**: Multi-column sorting with null value handling
- **Search**: Cross-field search with type-specific matching

#### Advanced Features
- **Related Record Navigation**: Deep-dive into lookups with navigation stack
- **Quick Actions Integration**: Execute flows and actions from the detail modal
- **Related Lists Display**: Show child records in organized tabs
- **File Management**: View associated files and documents
- **Custom Theming**: Configurable colors and branding

### Design Patterns

- **MVC Architecture**: Clear separation between view (LWC) and controller (Apex)
- **Metadata-Driven Configuration**: No code changes required for different objects
- **Progressive Loading**: Lazy loading of related data to optimize performance
- **Responsive UI Pattern**: Mobile-first design with adaptive layouts

## Technical Implementation Details

### Core Technologies

- **Lightning Web Components (LWC)**: Modern JavaScript framework
- **Apex**: Server-side logic with comprehensive error handling
- **Dynamic SOQL**: Runtime query building with security enforcement
- **Schema API**: Real-time object and field discovery
- **Quick Actions API**: Integration with Salesforce action framework

### Data Architecture

#### Primary Objects Supported
- All standard objects (Account, Contact, Case, Opportunity, etc.)
- All custom objects (marked with `__c`)
- Junction objects and metadata types
- System objects (where accessible)

#### Query Optimization Patterns
```apex
// Dynamic field selection with security
List<String> validatedFields = validateFields(objectApiName, fields);

// Pagination with offset limits
Integer limitValue = Math.min(recordsPerPage, MAX_RECORDS_PER_QUERY);
Integer offsetValue = (pageNumber - 1) * limitValue;

// Security-enforced queries
String query = buildBaseQuery(objectApiName, validatedFields) + 
               ' WHERE ' + buildWhereClause() + 
               ' ORDER BY ' + buildOrderByClause() +
               ' LIMIT ' + limitValue + ' OFFSET ' + offsetValue;
```

## API Reference

### DynamicRecordListViewController (Apex)

#### getRecords(parameters)
```apex
@AuraEnabled
public static Map<String, Object> getRecords(
    String objectApiName,
    List<String> fields,
    String sortField,
    String sortDirection,
    String filters,
    Integer recordsPerPage,
    Integer pageNumber,
    String searchTerm,
    String recordTypeNameFilter,
    Boolean showOnlyCreatedByMe
)
```

**Purpose**: Primary method for retrieving paginated, filtered, and sorted records

**Parameters**:
- `objectApiName` (String): API name of object to query (e.g., 'Account', 'Custom_Object__c')
- `fields` (List<String>): Field API names to retrieve. Includes relationship fields (e.g., 'Owner.Name')
- `sortField` (String): Field to sort by. Defaults to 'Id' if invalid
- `sortDirection` (String): 'asc' or 'desc'. Defaults to 'asc'
- `filters` (String): JSON string of filter criteria. Format: `[{"field":"Status","operator":"equals","value":"Open"}]`
- `recordsPerPage` (Integer): Number of records per page (max 1000, default 50)
- `pageNumber` (Integer): Page number to retrieve (1-based)
- `searchTerm` (String): Text to search across all fields
- `recordTypeNameFilter` (String): Comma-separated Record Type names to filter by
- `showOnlyCreatedByMe` (Boolean): Filter to user's created records only

**Returns**: 
```json
{
    "records": [/* SObject records */],
    "totalRecords": 150
}
```

**Security**: 
- Validates object accessibility
- Enforces field-level security
- Respects sharing rules
- Prevents SOQL injection

**Performance**:
- Built-in pagination limits (max 1000 per query)
- Selective field queries
- Governor limit protection

#### getObjectFields(objectApiName)
```apex
@AuraEnabled
public static List<Map<String, Object>> getObjectFields(String objectApiName)
```

**Purpose**: Retrieves all accessible fields for an object with metadata

**Returns**:
```json
[
    {
        "apiName": "Name",
        "label": "Account Name",
        "type": "STRING",
        "isReference": false,
        "referenceToObject": null
    },
    {
        "apiName": "OwnerId",
        "label": "Owner ID",
        "type": "REFERENCE",
        "isReference": true,
        "referenceToObject": "User"
    }
]
```

#### getRelatedObjects(objectApiName)
```apex
@AuraEnabled
public static List<Map<String, Object>> getRelatedObjects(String objectApiName)
```

**Purpose**: Discovers child relationships for an object (optimized for performance)

**Features**:
- Filters out system objects (History, Share tables)
- Limits to 10 most relevant relationships
- Includes accessibility checks

**Returns**:
```json
[
    {
        "objectApiName": "Contact",
        "label": "Contacts",
        "relationshipName": "Contacts"
    }
]
```

#### getRelatedRecords(objectApiName, parentId, relationshipName, fields, maxRecords)
```apex
@AuraEnabled
public static List<SObject> getRelatedRecords(
    String objectApiName,
    String parentId,
    String relationshipName,
    List<String> fields,
    Integer maxRecords
)
```

**Purpose**: Retrieves child records for a specific parent

**Use Cases**:
- Related list data loading
- Lookup field exploration
- Parent-child relationship navigation

#### getRecordAllFields(objectApiName, recordId)
```apex
@AuraEnabled(cacheable=true)
public static List<Map<String, Object>> getRecordAllFields(
    String objectApiName,
    String recordId
)
```

**Purpose**: Comprehensive record data retrieval for detail modals

**Features**:
- Intelligent field filtering (excludes system fields)
- Relationship field resolution
- Null value optimization
- Reference field object type determination

**Returns**: Array of field detail objects:
```json
[
    {
        "apiName": "Name",
        "label": "Account Name",
        "type": "STRING",
        "value": "Acme Corporation",
        "isReference": false
    },
    {
        "apiName": "OwnerId",
        "label": "Owner",
        "type": "REFERENCE",
        "value": "John Smith",
        "isReference": true,
        "referenceId": "005XX000004TmiQQAS",
        "referenceToObject": "User"
    }
]
```

#### getPageLayoutRelatedLists(objectApiName, recordTypeId)
```apex
@AuraEnabled(cacheable=true)
public static List<Map<String, Object>> getPageLayoutRelatedLists(
    String objectApiName,
    Id recordTypeId
)
```

**Purpose**: Discovers related lists configured on page layouts

**Note**: Simplified implementation using child relationship discovery. Full page layout integration would require UI API.

#### getObjectActions(actionNames, recordId)
```apex
@AuraEnabled(cacheable=true)
public static List<Map<String, Object>> getObjectActions(
    List<String> actionNames,
    String recordId
)
```

**Purpose**: Retrieves available Quick Actions for an object/record

**Features**:
- Discovers actual configured Quick Actions
- Maps flows to action names
- Provides fallback to standard actions
- Includes action metadata (type, icon, label)

### Private Helper Methods

#### Security & Validation
- `isValidObjectName()`: Object accessibility validation
- `validateFields()`: Field-level security enforcement
- `isValidFieldName()`: Field existence and accessibility check
- `isQueryableObject()`: Query permission validation

#### Query Building
- `buildBaseQuery()`: SELECT and FROM clause construction
- `buildWhereClause()`: Complex filtering with search integration
- `buildOrderByClause()`: Sorting with null handling
- `buildFilterCondition()`: Individual filter condition construction
- `buildRecordTypeCondition()`: Record type filtering

#### Data Processing
- `findAppropriateNameField()`: Intelligent name field detection
- `getObjectTypeFromId()`: Object type determination from record IDs
- `isSystemOrUnimportantField()`: System field filtering
- `isAlwaysIncludeField()`: Important field preservation

## LWC Component Documentation

### Component API Properties

```javascript
// Required Properties
@api objectApiName;           // SObject API name
@api listViewFields;          // Comma-separated field names

// Display Configuration
@api listViewTitle;           // Component title
@api titleField = "Name";     // Record detail title field
@api subtitleField;           // Record detail subtitle field
@api recordsPerPage = 10;     // Pagination size

// Theming
@api primaryColor = "#22BDC1";   // Primary brand color
@api accentColor = "#D5DF23";    // Accent color
@api textColor = "#1d1d1f";      // Text color

// Behavior Configuration
@api maxNavigationDepth = 1;     // Lookup navigation depth
@api recordActionApiNames;       // Quick Action names (comma-separated)
@api recordTypeNameFilter;       // Record Type filtering
@api showOnlyCreatedByMe = false; // User's records only

// Advanced Configuration
@api recordTypeId;               // For page layout related lists
@api relatedListFields;          // JSON config for related list fields
```

### Core Methods

#### Data Management
```javascript
// Load initial records
loadRecords() {
    this.isLoading = true;
    // Calls getRecords Apex method with current configuration
}

// Handle search with debouncing
handleSearchTermChange(event) {
    clearTimeout(this.delayTimeout);
    this.searchTerm = event.target.value;
    this.delayTimeout = setTimeout(() => {
        this.currentPage = 1;
        this.loadRecords();
    }, SEARCH_DELAY);
}

// Handle sorting
handleSort(event) {
    this.sortBy = event.detail.fieldName;
    this.sortDirection = event.detail.sortDirection;
    this.loadRecords();
}
```

#### Navigation & Detail View
```javascript
// Open record detail modal
handleRowAction(event) {
    const recordId = event.detail.row.Id;
    this.openRecordDetail(recordId, this.objectApiName);
}

// Navigate through lookup relationships
navigateToRelatedRecord(recordId, objectApiName) {
    // Add current context to navigation stack
    this.navigationStack.push({
        recordId: this.selectedRecord.Id,
        objectApiName: this.currentObjectApiName,
        title: this.getRecordTitle(this.selectedRecord)
    });
    
    // Load new record
    this.openRecordDetail(recordId, objectApiName);
}

// Breadcrumb navigation
handleBreadcrumbClick(event) {
    const targetIndex = parseInt(event.target.dataset.index, 10);
    const targetNav = this.navigationStack[targetIndex];
    
    // Remove items after target from stack
    this.navigationStack = this.navigationStack.slice(0, targetIndex);
    
    // Navigate to target
    this.openRecordDetail(targetNav.recordId, targetNav.objectApiName);
}
```

#### Related Records Management
```javascript
// Load related records for active tab
loadRelatedRecords(relationshipName, objectApiName) {
    this.loadingRelatedRecords = true;
    
    getRelatedRecords({
        objectApiName: this.currentObjectApiName,
        parentId: this.selectedRecord.Id,
        relationshipName: relationshipName,
        fields: this.getRelatedListFields(objectApiName),
        maxRecords: 50
    })
    .then(result => {
        this.relatedRecords = this.processRelatedRecords(result);
        this.loadingRelatedRecords = false;
    })
    .catch(error => {
        this.showErrorToast('Error loading related records', error);
        this.loadingRelatedRecords = false;
    });
}
```

### Event Handling

#### Standard Events
- `handleSearchTermChange`: Debounced search input
- `handleSort`: Column sorting
- `handleRowAction`: Record selection and actions
- `handleNextPage`/`handlePreviousPage`: Pagination
- `handleRefresh`: Data refresh

#### Custom Events
- `recordselected`: Fired when record is opened in modal
- `recordclosed`: Fired when modal is closed
- `navigationchange`: Fired when navigating through lookups

### Computed Properties

```javascript
// Pagination information
get paginationInfo() {
    const startRecord = (this.currentPage - 1) * this.recordsPerPage + 1;
    const endRecord = Math.min(this.currentPage * this.recordsPerPage, this.totalRecords);
    return `${startRecord} - ${endRecord} of ${this.totalRecords}`;
}

// Navigation controls
get showPreviousPage() {
    return this.currentPage > 1;
}

get showNextPage() {
    return this.currentPage * this.recordsPerPage < this.totalRecords;
}

// Modal breadcrumbs
get breadcrumbs() {
    return this.navigationStack.map((nav, index) => ({
        ...nav,
        isLast: index === this.navigationStack.length - 1
    }));
}

// Action buttons
get availableActions() {
    return this.objectActions.filter(action => 
        this.recordActionApiNames.includes(action.name)
    );
}
```

## Configuration Guide

### Basic Setup

#### Lightning Page Configuration
```xml
<!-- Lightning Page or Community -->
<component name="c:dynamicRecordListView">
    <property name="objectApiName" value="Account" />
    <property name="listViewFields" value="Name,Type,Industry,Owner.Name,CreatedDate" />
    <property name="listViewTitle" value="Customer Accounts" />
    <property name="recordsPerPage" value="25" />
    <property name="recordActionApiNames" value="Edit,Delete,Custom_Flow" />
</component>
```

#### App Builder Properties
| Property | Type | Description | Example |
|----------|------|-------------|---------|
| Object API Name | Text | SObject to display | `Account` |
| List View Fields | Text | Comma-separated fields | `Name,Type,Owner.Name` |
| Title | Text | Component header | `My Accounts` |
| Records Per Page | Integer | Pagination size | `20` |
| Primary Color | Color | Brand color | `#1589EE` |
| Record Actions | Text | Quick Action names | `Edit,Delete,New_Flow` |

### Advanced Configuration

#### Field Selection Strategies
```javascript
// Basic fields
"Name,CreatedDate,LastModifiedDate"

// Relationship fields
"Name,Owner.Name,Account.Name,Contact.Email"

// Mixed field types
"Name,Type,AnnualRevenue,Owner.Name,CreatedDate"

// Custom objects
"Name,Status__c,Priority__c,Assigned_User__c"
```

#### Record Type Filtering
```javascript
// Single record type
recordTypeNameFilter: "Standard"

// Multiple record types  
recordTypeNameFilter: "Standard,Premium,Enterprise"

// Developer names also supported
recordTypeNameFilter: "Standard_Account,Premium_Account"
```

#### Related List Field Configuration
```json
{
    "Contact": ["Name", "Email", "Phone", "CreatedDate"],
    "Opportunity": ["Name", "StageName", "Amount", "CloseDate"],
    "Case": ["CaseNumber", "Subject", "Status", "Priority"]
}
```

### Custom Metadata Integration

#### Field Mapping Metadata Type
```apex
// Create custom metadata type: List_View_Config__mdt
public class ListViewConfiguration {
    public static Map<String, List<String>> getFieldsForObject(String objectName) {
        List<List_View_Config__mdt> configs = [
            SELECT Object_API_Name__c, Fields__c
            FROM List_View_Config__mdt 
            WHERE Object_API_Name__c = :objectName
        ];
        
        if (!configs.isEmpty()) {
            return parseFieldConfiguration(configs[0].Fields__c);
        }
        
        return getDefaultFields(objectName);
    }
}
```

## Usage Examples

### Standard Object Implementation

#### Account List with Related Contacts
```html
<c-dynamic-record-list-view
    object-api-name="Account"
    list-view-title="Customer Accounts"
    list-view-fields="Name,Type,Industry,AnnualRevenue,Owner.Name,Phone"
    title-field="Name"
    subtitle-field="Type"
    records-per-page="15"
    record-action-api-names="Edit,Delete,New_Contact"
    max-navigation-depth="2"
    primary-color="#1589EE"
    accent-color="#FFB75D">
</c-dynamic-record-list-view>
```

#### Case Management Dashboard
```html
<c-dynamic-record-list-view
    object-api-name="Case"
    list-view-title="Support Cases"
    list-view-fields="CaseNumber,Subject,Status,Priority,Owner.Name,CreatedDate"
    title-field="Subject"
    subtitle-field="CaseNumber"
    record-type-name-filter="Support,Technical"
    show-only-created-by-me="false"
    record-action-api-names="Edit,Close_Case,Escalate">
</c-dynamic-record-list-view>
```

### Custom Object Implementation

#### Project Management
```html
<c-dynamic-record-list-view
    object-api-name="Project__c"
    list-view-title="Active Projects"
    list-view-fields="Name,Status__c,Priority__c,Start_Date__c,Owner.Name"
    title-field="Name"
    subtitle-field="Status__c"
    records-per-page="20"
    record-action-api-names="Edit,Update_Status,Add_Task"
    related-list-fields='{"Task__c":["Name","Status__c","Due_Date__c"],"Project_Resource__c":["Resource_Name__c","Role__c"]}'>
</c-dynamic-record-list-view>
```

### Integration with Flows

#### Flow Action Configuration
```html
<!-- Component setup -->
<c-dynamic-record-list-view
    object-api-name="Opportunity"
    record-action-api-names="Edit,Clone_Opportunity,Generate_Quote"
    flow-api-name-mapping='{"Generate_Quote":"SFL_GenerateQuote","Clone_Opportunity":"SFL_CloneOpportunity"}'>
</c-dynamic-record-list-view>
```

#### Flow Input Variables
```javascript
// When launching flows, component passes these variables:
{
    recordId: selectedRecordId,
    objectApiName: currentObjectApiName,
    // Additional context variables based on flow requirements
}
```

### Community/Portal Integration

#### Partner Portal Configuration
```html
<c-dynamic-record-list-view
    object-api-name="Account"
    list-view-fields="Name,Type,Industry,BillingCity"
    show-only-created-by-me="true"
    record-action-api-names="Edit,View_Details"
    max-navigation-depth="1">
</c-dynamic-record-list-view>
```

#### Customer Self-Service
```html
<c-dynamic-record-list-view
    object-api-name="Case"
    list-view-title="My Support Cases"
    list-view-fields="CaseNumber,Subject,Status,CreatedDate"
    show-only-created-by-me="true"
    record-action-api-names="View_Details,Add_Comment">
</c-dynamic-record-list-view>
```

### Programmatic Usage

#### Dynamic Configuration
```javascript
// Parent component dynamic setup
export default class ParentComponent extends LightningElement {
    @track dynamicConfig = {};
    
    connectedCallback() {
        this.setupConfiguration();
    }
    
    setupConfiguration() {
        // Determine configuration based on user profile/role
        const userProfile = this.getCurrentUserProfile();
        
        if (userProfile === 'Sales Manager') {
            this.dynamicConfig = {
                objectApiName: 'Opportunity',
                listViewFields: 'Name,StageName,Amount,CloseDate,Owner.Name',
                recordActionApiNames: 'Edit,Clone,Mark_Closed_Won'
            };
        } else if (userProfile === 'Support Agent') {
            this.dynamicConfig = {
                objectApiName: 'Case',
                listViewFields: 'CaseNumber,Subject,Status,Priority,CreatedDate',
                recordActionApiNames: 'Edit,Close,Escalate'
            };
        }
    }
}
```

## Security Considerations

### Access Control Implementation

#### Object-Level Security
```apex
// Automatic object accessibility check
private static Boolean isValidObjectName(String objectName) {
    Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectName);
    return objectType != null && objectType.getDescribe().isAccessible();
}
```

#### Field-Level Security
```apex
// Field accessibility validation
private static List<String> validateFields(String objectName, List<String> fields) {
    List<String> validFields = new List<String>();
    Map<String, Schema.SObjectField> fieldMap = 
        Schema.getGlobalDescribe().get(objectName)
        .getDescribe().fields.getMap();
    
    for (String field : fields) {
        if (fieldMap.containsKey(field.toLowerCase()) && 
            fieldMap.get(field.toLowerCase()).getDescribe().isAccessible()) {
            validFields.add(field);
        }
    }
    return validFields;
}
```

#### Sharing Rules Compliance
```apex
// All queries automatically respect sharing rules through "with sharing" class
public with sharing class DynamicRecordListViewController {
    // Queries only return records user can access
    public static List<SObject> records = Database.query(dynamicQuery);
}
```

#### Portal User Considerations
```apex
// Special handling for portal users
Boolean isPortalUser = UserInfo.getUserType().contains('Customer') || 
                      UserInfo.getUserType().contains('Partner');

if (isPortalUser) {
    // Additional filtering for external users
    whereClause += ' AND IsVisibleToPortal = true';
}
```

### Input Validation

#### SOQL Injection Prevention
```apex
// All user inputs are properly escaped
String condition = fieldName + ' LIKE \'%' + 
    String.escapeSingleQuotes(searchTerm) + '%\'';

// Object and field names validated against schema
if (!isValidObjectName(objectApiName)) {
    throw new AuraHandledException('Invalid object: ' + objectApiName);
}
```

#### Parameter Sanitization
```apex
// Numeric parameter validation
Integer limitValue = (recordsPerPage != null && recordsPerPage > 0) 
    ? Math.min(recordsPerPage, MAX_RECORDS_PER_QUERY) 
    : DEFAULT_PAGE_SIZE;

// String parameter validation
if (String.isBlank(objectApiName)) {
    throw new AuraHandledException('Object API name is required');
}
```

### Data Privacy

#### Sensitive Field Filtering
```apex
// Automatic filtering of sensitive system fields
private static Boolean isSystemOrUnimportantField(String fieldName, String objectName) {
    Set<String> systemFields = new Set<String>{
        'isdeleted', 'systemmodstamp', '_hd', '_feed'
    };
    return systemFields.contains(fieldName.toLowerCase());
}
```

#### Audit Logging
```apex
// All record access is automatically logged through Salesforce audit trail
// Custom logging for sensitive operations
System.debug(LoggingLevel.INFO, 
    'User ' + UserInfo.getUserId() + 
    ' accessed ' + records.size() + 
    ' records from ' + objectApiName);
```

## Integration Patterns

### Flow Integration

#### Screen Flow Components
```xml
<!-- Flow Screen Component -->
<component name="c:dynamicRecordListView">
    <property name="objectApiName" value="{!ObjectVariable}" />
    <property name="recordActionApiNames" value="Edit,Process_Record" />
</component>
```

#### Flow Input/Output Variables
```javascript
// Component fires events that Flow can capture
const selectionEvent = new CustomEvent('recordselected', {
    detail: {
        recordId: selectedRecord.Id,
        objectApiName: this.objectApiName,
        recordData: selectedRecord
    }
});
this.dispatchEvent(selectionEvent);
```

### Lightning Page Integration

#### Dynamic Tabs
```javascript
// Configure different list views per tab
export default class TabbedListView extends LightningElement {
    @track activeTab = 'accounts';
    
    get currentObjectConfig() {
        const configs = {
            'accounts': {
                objectApiName: 'Account',
                listViewFields: 'Name,Type,Industry,Owner.Name'
            },
            'contacts': {
                objectApiName: 'Contact', 
                listViewFields: 'Name,Email,Phone,Account.Name'
            }
        };
        return configs[this.activeTab];
    }
}
```

#### Record Page Integration
```html
<!-- Related Records component on record page -->
<c-dynamic-record-list-view
    object-api-name="Contact"
    list-view-fields="Name,Email,Phone,CreatedDate"
    list-view-title="Related Contacts"
    filter-criteria='[{"field":"AccountId","operator":"equals","value":"{!recordId}"}]'>
</c-dynamic-record-list-view>
```

### Community Integration

#### Public Knowledge Base
```html
<c-dynamic-record-list-view
    object-api-name="Knowledge__kav"
    list-view-fields="Title,Summary,PublishStatus,LastPublishedDate"
    show-only-created-by-me="false"
    record-action-api-names="View_Article">
</c-dynamic-record-list-view>
```

#### Partner Resource Center
```html
<c-dynamic-record-list-view
    object-api-name="Partner_Resource__c"
    list-view-fields="Name,Type__c,Category__c,LastModifiedDate"
    record-action-api-names="Download,Share">
</c-dynamic-record-list-view>
```

### Mobile App Integration

#### Mobile-Optimized Configuration
```html
<c-dynamic-record-list-view
    object-api-name="Task"
    list-view-fields="Subject,Status,Priority,DueDate"
    records-per-page="5"
    max-navigation-depth="1"
    primary-color="#007ACC">
</c-dynamic-record-list-view>
```

#### Offline Considerations
```javascript
// Check connectivity and adjust behavior
get isOnline() {
    return navigator.onLine;
}

loadRecords() {
    if (!this.isOnline) {
        this.showErrorToast('Offline', 'Please check your internet connection');
        return;
    }
    // Normal loading logic
}
```

### Salesforce Mobile Integration

#### Mobile Cards
```xml
<!-- Mobile Card Configuration -->
<mobileCard>
    <component name="c:dynamicRecordListView">
        <property name="objectApiName" value="Account" />
        <property name="listViewFields" value="Name,Type,Phone" />
        <property name="recordsPerPage" value="10" />
    </component>
</mobileCard>
```

## Troubleshooting Guide

### Common Issues and Resolutions

#### 1. No Records Displayed

**Symptoms**: Component loads but shows empty state despite data existing

**Possible Causes**:
- Invalid object API name
- Field-level security blocking field access
- Sharing rules preventing record access
- Invalid field names in configuration

**Diagnostic Steps**:
```apex
// Test in Developer Console
DynamicRecordListViewController.getRecords(
    'Account',
    new List<String>{'Name', 'Type'},
    'Name',
    'asc',
    null,
    10,
    1,
    null,
    null,
    false
);
```

**Resolution**:
1. Verify object name spelling and API name
2. Check user permissions on object and fields
3. Validate field names against object schema
4. Test with minimal field set first

#### 2. Search Not Working

**Symptoms**: Search input doesn't filter results

**Possible Causes**:
- Search term too short (less than 2 characters)
- Field types don't support text search
- Special characters in search term
- Performance timeout on complex searches

**Debug Steps**:
```javascript
// Enable debug logging
handleSearchTermChange(event) {
    console.log('Search term:', event.target.value);
    console.log('Debounce timeout:', this.delayTimeout);
    // Rest of method
}
```

**Resolution**:
1. Verify search term length requirements
2. Check field types support LIKE operations
3. Test with simple terms first
4. Review debug logs for errors

#### 3. Related Records Not Loading

**Symptoms**: Modal opens but related lists are empty

**Possible Causes**:
- Invalid relationship names
- Related object access permissions
- Related record sharing restrictions
- Configuration errors in related list fields

**Debug Process**:
```apex
// Test relationship query
List<Schema.ChildRelationship> relationships = 
    Account.SObjectType.getDescribe().getChildRelationships();

for (Schema.ChildRelationship rel : relationships) {
    System.debug('Relationship: ' + rel.getRelationshipName());
    System.debug('Child Object: ' + rel.getChildSObject());
}
```

#### 4. Quick Actions Not Appearing

**Symptoms**: Record modal shows but action buttons missing

**Possible Causes**:
- Invalid action API names
- Actions not configured for object
- Permission issues with actions
- Flow not active or accessible

**Resolution Steps**:
```apex
// Discover available actions
List<Map<String, Object>> actions = 
    DynamicRecordListViewController.discoverObjectActions('Account', recordId);

System.debug('Available actions: ' + actions);
```

#### 5. Performance Issues

**Symptoms**: Slow loading, timeouts, or page freezing

**Possible Causes**:
- Large result sets without proper pagination
- Complex relationship queries
- Too many fields in selection
- Inefficient filtering

**Optimization Steps**:
1. Reduce `recordsPerPage` to 10-25
2. Limit field selection to essential fields
3. Add selective filters to reduce dataset
4. Review query execution plans

**Performance Monitoring**:
```apex
// Add timing to methods
public static Map<String, Object> getRecords(/* parameters */) {
    Long startTime = System.currentTimeMillis();
    
    try {
        // Method implementation
        Map<String, Object> result = /* query results */;
        
        Long executionTime = System.currentTimeMillis() - startTime;
        System.debug('Query execution time: ' + executionTime + 'ms');
        
        return result;
    } catch (Exception e) {
        Long executionTime = System.currentTimeMillis() - startTime;
        System.debug('Query failed after: ' + executionTime + 'ms');
        throw e;
    }
}
```

#### 6. Modal Not Opening

**Symptoms**: Clicking records doesn't open detail modal

**Possible Causes**:
- JavaScript errors blocking execution
- Missing record permissions
- Template rendering issues
- Event handler not properly bound

**Debug Steps**:
```javascript
// Check for JavaScript errors
handleRowAction(event) {
    console.log('Row action triggered:', event.detail);
    try {
        const recordId = event.detail.row.Id;
        console.log('Opening record:', recordId);
        this.openRecordDetail(recordId, this.objectApiName);
    } catch (error) {
        console.error('Error in handleRowAction:', error);
    }
}
```

### Debug Mode Activation

```javascript
// Enable comprehensive debugging
connectedCallback() {
    this.debugMode = window.location.href.includes('debug=true');
    if (this.debugMode) {
        console.log('Debug mode enabled for Dynamic List Viewer');
        console.log('Configuration:', {
            objectApiName: this.objectApiName,
            listViewFields: this.listViewFields,
            recordsPerPage: this.recordsPerPage
        });
    }
}

debugLog(message, data) {
    if (this.debugMode) {
        console.log(`[DynamicListViewer] ${message}`, data);
    }
}
```

### Error Handling Best Practices

```javascript
// Comprehensive error handling
async loadRecords() {
    this.isLoading = true;
    this.error = null;
    
    try {
        const result = await getRecords({
            objectApiName: this.objectApiName,
            fields: this.fieldsArray,
            // ... other parameters
        });
        
        this.records = result.records;
        this.totalRecords = result.totalRecords;
        
    } catch (error) {
        console.error('Error loading records:', error);
        
        // Provide user-friendly error messages
        if (error.message.includes('Invalid object')) {
            this.error = 'The requested data type is not available';
        } else if (error.message.includes('Field is not accessible')) {
            this.error = 'You do not have permission to view all requested information';
        } else {
            this.error = 'Unable to load records. Please try again';
        }
        
        // Clear existing data
        this.records = [];
        this.totalRecords = 0;
        
    } finally {
        this.isLoading = false;
    }
}
```

## Performance Optimization

### Query Optimization

#### Selective Field Queries
```apex
// Only query needed fields
List<String> essentialFields = new List<String>{'Id', 'Name', 'LastModifiedDate'};

// Avoid querying all fields
// BAD: SELECT * FROM Account
// GOOD: SELECT Id, Name, Type FROM Account
```

#### Efficient Pagination
```apex
// Use LIMIT and OFFSET for large datasets
String query = baseQuery + 
    ' LIMIT ' + Math.min(recordsPerPage, MAX_RECORDS_PER_QUERY) +
    ' OFFSET ' + ((pageNumber - 1) * recordsPerPage);

// Consider using cursor-based pagination for very large datasets
```

#### Index Utilization
```apex
// Structure WHERE clauses to use indexes
// GOOD: WHERE CreatedDate > LAST_N_DAYS:30 AND OwnerId = :userId
// BAD: WHERE YEAR(CreatedDate) = 2024
```

### Client-Side Performance

#### Lazy Loading Implementation
```javascript
// Load related data only when needed
handleTabChange(event) {
    const tabName = event.target.value;
    
    if (tabName === 'related' && !this.relatedRecordsLoaded) {
        this.loadRelatedRecords();
    }
}

// Implement virtual scrolling for large lists
@track virtualizedRecords = [];

updateVisibleRecords() {
    const startIndex = this.scrollTop / this.rowHeight;
    const endIndex = startIndex + this.visibleRowCount;
    
    this.virtualizedRecords = this.allRecords.slice(
        Math.floor(startIndex), 
        Math.ceil(endIndex)
    );
}
```

#### Memory Management
```javascript
// Clean up resources when component is destroyed
disconnectedCallback() {
    // Clear timeouts
    if (this.delayTimeout) {
        clearTimeout(this.delayTimeout);
    }
    
    // Clear intervals
    if (this.refreshInterval) {
        clearInterval(this.refreshInterval);
    }
    
    // Clear large data structures
    this.records = [];
    this.relatedRecords = [];
}
```

#### Caching Strategy
```javascript
// Implement simple caching for repeated queries
@track queryCache = new Map();

async getRecordsWithCache(queryKey, queryParams) {
    if (this.queryCache.has(queryKey)) {
        const cached = this.queryCache.get(queryKey);
        const now = Date.now();
        
        // Cache for 5 minutes
        if (now - cached.timestamp < 300000) {
            return cached.data;
        }
    }
    
    const result = await getRecords(queryParams);
    
    this.queryCache.set(queryKey, {
        data: result,
        timestamp: Date.now()
    });
    
    return result;
}
```

### Governor Limit Management

#### Bulk Operations
```apex
// Process records in batches to avoid limits
public static void processBulkRecords(List<String> recordIds) {
    final Integer BATCH_SIZE = 200;
    
    for (Integer i = 0; i < recordIds.size(); i += BATCH_SIZE) {
        List<String> batchIds = new List<String>();
        
        for (Integer j = i; j < Math.min(i + BATCH_SIZE, recordIds.size()); j++) {
            batchIds.add(recordIds[j]);
        }
        
        processBatch(batchIds);
    }
}
```

#### Query Optimization
```apex
// Use selective queries to reduce row limits
Map<Id, Account> accountMap = new Map<Id, Account>([
    SELECT Id, Name, Type
    FROM Account
    WHERE Id IN :accountIds  // Use Set<Id> for better performance
    AND Type != null         // Selective conditions
    LIMIT 50000             // Explicit limit
]);
```

#### CPU Time Management
```apex
// Monitor CPU time usage
public static List<SObject> complexProcessing(List<SObject> records) {
    Long startCpuTime = Limits.getCpuTime();
    
    for (SObject record : records) {
        // Complex processing logic
        
        // Check CPU time periodically
        if (Limits.getCpuTime() - startCpuTime > 8000) { // 8 seconds
            break; // Exit to avoid timeout
        }
    }
    
    return processedRecords;
}
```

---

*This documentation provides a comprehensive technical reference for the Dynamic List Viewer utility component. For additional support or customization requests, contact the development team.*

**Document Version**: 1.0  
**Last Updated**: 2024-12-19  
**Compatibility**: Salesforce API 62.0+