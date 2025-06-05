/**
 * DynamicRecordListViewController
 * 
 * Apex controller for the Dynamic Record List View LWC.
 * Provides methods for retrieving records, fields, and related objects
 * with dynamic queries and robust error handling.
 * 
 * @author Your Name
 */
public with sharing class DynamicRecordListViewController {
    
    private static final Integer MAX_RECORDS_PER_QUERY = 1000;
    private static final Integer DEFAULT_PAGE_SIZE = 50;
    private static final Integer MAX_RELATED_RECORDS = 100;
    
    /**
     * Get records for a specific object based on various parameters
     * 
     * @param objectApiName The API name of the object to query
     * @param fields List of field API names to retrieve
     * @param sortField Field to sort by
     * @param sortDirection Sort direction (asc or desc)
     * @param filters JSON string of filter criteria
     * @param recordsPerPage Number of records per page
     * @param pageNumber Page number to retrieve
     * @param searchTerm Text to search for across fields
     * @return Map with records and total record count
     */
    @AuraEnabled
    public static Map<String, Object> getRecords(
        String objectApiName,
        List<String> fields,
        String sortField,
        String sortDirection,
        String filters,
        Integer recordsPerPage,
        Integer pageNumber,
        String searchTerm
    ) {
        try {
            // Input validation
            if (String.isBlank(objectApiName)) {
                throw new AuraHandledException('Object API name is required');
            }
            
            // Security check - verify the object is accessible
            if (!isValidObjectName(objectApiName)) {
                throw new AuraHandledException('Object is not accessible: ' + objectApiName);
            }
            
            // Ensure we have fields to query and always include Id
            List<String> validatedFields = new List<String>();
            if (fields == null || fields.isEmpty()) {
                validatedFields.add('Id');
                validatedFields.add('Name');
            } else {
                validatedFields = validateFields(objectApiName, fields);
                if (!validatedFields.contains('Id')) {
                    validatedFields.add('Id');
                }
            }
            
            // Enforce pagination limits for performance
            Integer limitValue = (recordsPerPage != null && recordsPerPage > 0) 
                ? Math.min(recordsPerPage, MAX_RECORDS_PER_QUERY) 
                : DEFAULT_PAGE_SIZE;
            
            Integer offsetValue = ((pageNumber != null && pageNumber > 1) ? (pageNumber - 1) * limitValue : 0);
            
            // Build the query
            String baseQuery = buildBaseQuery(objectApiName, validatedFields);
            String whereClause = buildWhereClause(objectApiName, filters, searchTerm, validatedFields);
            String orderByClause = buildOrderByClause(objectApiName, sortField, sortDirection);
            
            // Construct the main query for records
            String recordQuery = baseQuery;
            if (String.isNotBlank(whereClause)) {
                recordQuery += ' WHERE ' + whereClause;
            }
            recordQuery += orderByClause;
            recordQuery += ' LIMIT ' + limitValue + ' OFFSET ' + offsetValue;
            
            // Execute record query
            List<SObject> records = Database.query(recordQuery);
            
            // Construct count query for total records
            String countQuery = 'SELECT COUNT() FROM ' + objectApiName;
            if (String.isNotBlank(whereClause)) {
                countQuery += ' WHERE ' + whereClause;
            }
            
            // Execute count query
            Integer totalRecords = Database.countQuery(countQuery);
            
            // Prepare result
            Map<String, Object> result = new Map<String, Object>();
            result.put('records', records);
            result.put('totalRecords', totalRecords);
            
            return result;
        } catch (AuraHandledException e) {
            throw e; // Re-throw AuraHandledExceptions as they're already properly formatted
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving records: ' + e.getMessage());
        }
    }
    
    /**
     * Get all available fields for an object
     * 
     * @param objectApiName The API name of the object
     * @return List of field information (API name, label, type, reference info)
     */
    @AuraEnabled
    public static List<Map<String, Object>> getObjectFields(String objectApiName) {
        try {
            if (String.isBlank(objectApiName)) {
                throw new AuraHandledException('Object API name is required');
            }
            
            if (!isValidObjectName(objectApiName)) {
                throw new AuraHandledException('Object is not accessible: ' + objectApiName);
            }
            
            List<Map<String, Object>> fieldsList = new List<Map<String, Object>>();
            
            // Get schema info for the object
            SObjectType objectType = Schema.getGlobalDescribe().get(objectApiName);
            Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe().fields.getMap();
            
            for (String fieldName : fieldMap.keySet()) {
                Schema.DescribeFieldResult fieldDescribe = fieldMap.get(fieldName).getDescribe();
                
                // Skip system fields and inaccessible fields
                if (fieldName.startsWith('System') || !fieldDescribe.isAccessible()) {
                    continue;
                }
                
                Map<String, Object> fieldInfo = new Map<String, Object>();
                fieldInfo.put('apiName', fieldName);
                fieldInfo.put('label', fieldDescribe.getLabel());
                fieldInfo.put('type', fieldDescribe.getType().name());
                
                // Handle reference fields
                Boolean isReference = fieldDescribe.getType() == Schema.DisplayType.REFERENCE;
                fieldInfo.put('isReference', isReference);
                
                if (isReference) {
                    List<Schema.SObjectType> references = fieldDescribe.getReferenceTo();
                    if (references != null && !references.isEmpty()) {
                        fieldInfo.put('referenceToObject', references[0].getDescribe().getName());
                    }
                }
                
                fieldsList.add(fieldInfo);
            }
            
            return fieldsList;
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('Error getting object fields: ' + e.getMessage());
        }
    }
    
    /**
     * Get related objects for a given object.
     * This optimized version includes limits and filters to prevent governor limit issues
     * and reduce payload size.
     *
     * @param objectApiName The API name of the object.
     * @return List of related object information (limited and filtered).
     */
    @AuraEnabled
    public static List<Map<String, Object>> getRelatedObjects(String objectApiName) {
        try {
            // --- Input Validation & Security ---
            if (String.isBlank(objectApiName)) {
                throw new AuraHandledException('Object API name is required');
            }
            if (!isValidObjectName(objectApiName)) {
                throw new AuraHandledException('Object is not accessible: ' + objectApiName);
            }

            // --- Initialization ---
            List<Map<String, Object>> relatedObjectsList = new List<Map<String, Object>>();
            SObjectType objectType = Schema.getGlobalDescribe().get(objectApiName);
            if (objectType == null) {
                throw new AuraHandledException('Could not describe object: ' + objectApiName);
            }

            // --- Configuration for what to show ---
            // Exclude relationships handled in dedicated UI tabs (Files, Activity, etc.) to avoid duplication.
            Set<String> excludedRelationshipNames = new Set<String>{
                'FeedItems', 'AttachedContentDocuments', 'ContentDocumentLinks', 
                'ActivityHistories', 'OpenActivities', 'Tasks', 'Events', 'Feeds',
                'ProcessInstances', 'ProcessSteps'
            };

            // Whitelist of common standard child objects that are usually relevant on page layouts.
            // This helps filter out less common/system-related standard objects.
            Set<String> commonStandardChildObjects = new Set<String>{
                'Contact', 'Opportunity', 'Case', 'Order', 'Asset', 'Contract', 'Quote', 'Solution', 'Account', 'Lead', 'Campaign', 'User'
            };

            // --- Governor Limit Prevention ---
            Integer relationshipCount = 0;
            Integer maxRelationships = 20; // Limit to a reasonable number of relevant relationships

            // --- Child Relationship Processing ---
            List<Schema.ChildRelationship> childRelationships = objectType.getDescribe().getChildRelationships();
            if (childRelationships == null) {
                return relatedObjectsList;
            }

            for (Schema.ChildRelationship childRel : childRelationships) {
                // Stop processing if we've hit the defined limit.
                if (relationshipCount >= maxRelationships) break;

                String relationshipName = childRel.getRelationshipName();

                // --- Filtering Logic ---

                // 1. Skip if relationship name is null or explicitly excluded
                if (String.isBlank(relationshipName) || excludedRelationshipNames.contains(relationshipName)) {
                    continue;
                }

                Schema.SObjectType childObjectType = childRel.getChildSObject();

                // 2. Skip if child object is null or not accessible
                if (childObjectType == null || !childObjectType.getDescribe().isAccessible()) {
                    continue;
                }

                String childObjectName = childObjectType.getDescribe().getName();

                // 3. Skip history, sharing, and change event objects which are noisy
                if (childObjectName.endsWith('History') || childObjectName.endsWith('Share') || childObjectName.endsWith('ChangeEvent')) {
                    continue;
                }

                // 4. Main Curation Logic: Include if it's a custom object OR it's in our whitelist of common standard objects.
                boolean isCustomObject = childObjectName.endsWith('__c');
                boolean isCommonStandardObject = commonStandardChildObjects.contains(childObjectName);

                if (!isCustomObject && !isCommonStandardObject) {
                    continue; // It's a standard object we don't want to show by default
                }
                
                // --- Prepare Data for LWC ---
                Map<String, Object> relatedObj = new Map<String, Object>();
                relatedObj.put('objectApiName', childObjectName);
                relatedObj.put('label', childObjectType.getDescribe().getLabel());
                relatedObj.put('relationshipName', relationshipName);

                relatedObjectsList.add(relatedObj);
                relationshipCount++; // Increment counter
            }

            return relatedObjectsList;

        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException('Error getting related objects: ' + e.getMessage());
        }
    }
    
    /**
     * Get related records for a specific parent record and relationship
     * Enhanced to support field configuration
     * 
     * @param parentId The ID of the parent record
     * @param relationshipName The relationship name from the parent to the child
     * @param objectApiName The API name of the parent object
     * @param fields Optional list of fields to query
     * @param maxRecords Maximum number of records to return
     * @return List of related records
     */
    @AuraEnabled
    public static List<SObject> getRelatedRecords(
        String objectApiName,
        String parentId,
        String relationshipName,
        List<String> fields,
        Integer maxRecords
    ) {
        try {
            // [Validation code remains the same]
            if (String.isBlank(parentId)) {
                throw new AuraHandledException('Parent ID is required');
            }
            
            if (String.isBlank(relationshipName)) {
                throw new AuraHandledException('Relationship name is required');
            }
            
            if (String.isBlank(objectApiName)) {
                throw new AuraHandledException('Object API name is required');
            }
            
            // Ensure the ID is valid format
            Id recordId = Id.valueOf(parentId);
            
            // Get the relationship object via describe calls
            Schema.SObjectType parentType = Schema.getGlobalDescribe().get(objectApiName);
            
            String relatedObjectName = '';
            Schema.SObjectField relationshipField = null;
            
            for (Schema.ChildRelationship rel : parentType.getDescribe().getChildRelationships()) {
                if (rel.getRelationshipName() != null && rel.getRelationshipName().equalsIgnoreCase(relationshipName)) {
                    relatedObjectName = String.valueOf(rel.getChildSObject());
                    relationshipField = rel.getField();
                    break;
                }
            }
            
            if (String.isBlank(relatedObjectName)) {
                throw new AuraHandledException('Relationship not found: ' + relationshipName);
            }
            
            // Build the query with specified fields or defaults
            Set<String> fieldsToQuery = new Set<String>{'Id'};
            
            if (fields != null && !fields.isEmpty()) {
                fieldsToQuery.addAll(fields);
            } else {
                // Use default fields for the object
                fieldsToQuery.addAll(getDefaultFieldsForRelatedList(relatedObjectName));
            }
            
            // Ensure we have valid fields
            fieldsToQuery = validateFieldsForQuery(relatedObjectName, fieldsToQuery);
            
            String query = 'SELECT ' + String.join(new List<String>(fieldsToQuery), ', ');
            query += ' FROM ' + relatedObjectName;
            query += ' WHERE ' + relationshipField.getDescribe().getName() + ' = :recordId';
            
            // Add limit
            Integer limitValue = (maxRecords != null && maxRecords > 0) ? 
                Math.min(maxRecords, MAX_RELATED_RECORDS) : MAX_RELATED_RECORDS;
            query += ' LIMIT ' + limitValue;
            
            return Database.query(query);
            
        } catch (Exception e) {
            throw new AuraHandledException('Error fetching related records: ' + e.getMessage());
        }
    }
    
    /**
     * Finds the most appropriate field to use as a "name" or title field for an object
     * 
     * @param objectName The API name of the object
     * @param fieldMap The map of fields for the object
     * @return The API name of the field to use as name/title
     */
    private static String findAppropriateNameField(String objectName, Map<String, Schema.SObjectField> fieldMap) {
        // Check for common name fields in order of preference
        List<String> potentialNameFields = new List<String>{
            'Name',
            'Subject',
            'Title',
            'CaseNumber',
            'OrderNumber',
            'ContractNumber',
            'SolutionNumber',
            'FirstName',
            'LastName'
        };
        
        // For custom objects, they typically have Name field
        if (objectName.endsWith('__c') && fieldMap.containsKey('name')) {
            return 'Name';
        }
        
        // Check if any of the potential name fields exists and is accessible
        for (String fieldName : potentialNameFields) {
            String lowercaseFieldName = fieldName.toLowerCase();
            if (fieldMap.containsKey(lowercaseFieldName) && fieldMap.get(lowercaseFieldName).getDescribe().isAccessible()) {
                return fieldName;
            }
        }
        
        // Fallback: find any text field that might serve as a name/description
        for (String fieldName : fieldMap.keySet()) {
            Schema.DescribeFieldResult describe = fieldMap.get(fieldName).getDescribe();
            if (describe.isAccessible() && 
                (describe.getType() == Schema.DisplayType.STRING || 
                 describe.getType() == Schema.DisplayType.TEXTAREA)) {
                // Skip system fields and relationship fields
                if (!fieldName.endsWith('Id') && 
                    !fieldName.startsWith('system') && 
                    !fieldName.startsWith('is') &&
                    !fieldName.contains('__r')) {
                    return describe.getName();
                }
            }
        }
        
        // If no appropriate field is found, just return Id as we always query it
        return '';
    }
    
    /**
     * Determine the proper object type from an ID with special handling for polymorphic relations
     * 
     * @param recordId The ID to analyze
     * @return String The API name of the object
     */
    private static String getObjectTypeFromId(String recordId) {
        if (String.isBlank(recordId)) {
            return '';
        }
        
        try {
            // Convert to Id type for proper prefix analysis
            Id idValue = Id.valueOf(recordId);
            
            // Handle specific ID prefixes directly to ensure accuracy
            String prefix = idValue.getSObjectType().getDescribe().getKeyPrefix();
            
            // Special handling for User vs Group - both can be owners
            if (recordId.startsWith('005')) {
                return 'User'; // 005 prefix is always User
            } else if (recordId.startsWith('00G')) {
                return 'Group'; // 00G prefix is always Group
            }
            
            // Fall back to standard method for other object types
            return idValue.getSObjectType().getDescribe().getName();
        } catch (Exception e) {
            return '';
        }
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getRecordAllFields(String objectApiName, String recordId) {
        // --- Input Validation & Security ---
        if (String.isBlank(objectApiName)) {
            throw new AuraHandledException('Object API name is required');
        }
        
        // Special handling for User IDs that might be misidentified
        if (recordId != null && recordId.startsWith('005') && objectApiName != 'User') {
            System.debug('Correcting object type from ' + objectApiName + ' to User for ID ' + recordId);
            objectApiName = 'User';
        }
        
        // Verify the object name is valid and queryable 
        if (!isQueryableObject(objectApiName)) {
            throw new AuraHandledException('Invalid or unsupported object type: ' + objectApiName);
        }
        
        if (String.isBlank(recordId)) {
            throw new AuraHandledException('Record ID is required');
        }
        
        // Validate Id format
        try {
            Id.valueOf(recordId); 
        } catch (Exception e) {
            throw new AuraHandledException('Invalid Record ID format: ' + recordId);
        }
        
        System.debug('Requesting details for ' + objectApiName + ' record: ' + recordId);

        // --- Prepare Field Information Collection ---
        List<Map<String, Object>> fieldDetailsList = new List<Map<String, Object>>();
        Map<String, DescribeFieldResult> fieldDescribeMap = new Map<String, DescribeFieldResult>();
        // Use a Set to automatically handle duplicate fields - CONSISTENTLY USE LOWERCASE
        Set<String> queryFieldSet = new Set<String>(); 
        queryFieldSet.add('id'); // Initialize with lowercase 'id'

        Map<String, String> relationshipNameMap = new Map<String, String>(); // Map field name to relationship name (e.g., accountid -> Account)
        Map<String, String> relationshipNameFieldMap = new Map<String, String>(); // Map relationship name to appropriate display field
        Map<String, String> relationshipToObjectMap = new Map<String, String>(); // Map relationship name to actual object API name

        try {
            // --- Get Schema Information ---
            SObjectType objectType = Schema.getGlobalDescribe().get(objectApiName);
            if (objectType == null) {
                 throw new AuraHandledException('Could not describe object: ' + objectApiName);
            }
            Map<String, Schema.SObjectField> allFieldsMap = objectType.getDescribe().fields.getMap();

            // --- Identify Accessible Fields and Relationship Fields ---
            for (String fieldName : allFieldsMap.keySet()) {
                // CONSISTENTLY use lowercase for comparisons and storage keys
                String fieldNameLower = fieldName.toLowerCase();
                Schema.DescribeFieldResult fieldDescribe = allFieldsMap.get(fieldName).getDescribe();
                
                // Skip system or unimportant fields right from the start to improve performance
                if (isSystemOrUnimportantField(fieldNameLower, objectApiName)) {
                    continue;
                }
                
                if (fieldDescribe.isAccessible()) {
                    fieldDescribeMap.put(fieldNameLower, fieldDescribe);
                    
                    if (fieldDescribe.getType() == Schema.DisplayType.REFERENCE && fieldDescribe.getRelationshipName() != null) {
                        // It's a relationship field
                        String relationshipName = fieldDescribe.getRelationshipName();
                        relationshipNameMap.put(fieldNameLower, relationshipName);
                        
                        // Get the related object type
                        List<Schema.SObjectType> referenceTo = fieldDescribe.getReferenceTo();
                        String relatedObjectName = '';
                        
                        if (referenceTo != null && !referenceTo.isEmpty()) {
                            Schema.SObjectType relatedObjectType = referenceTo[0];
                            relatedObjectName = relatedObjectType.getDescribe().getName();
                            
                            // Store the proper object API name for this relationship
                            relationshipToObjectMap.put(relationshipName, relatedObjectName);
                            
                            // Find appropriate name field for related object
                            String nameField = findAppropriateNameField(
                                relatedObjectName, 
                                relatedObjectType.getDescribe().fields.getMap()
                            );
                            
                            // Store the right name field for this relationship
                            relationshipNameFieldMap.put(relationshipName, nameField);
                            
                            // Always add Id for the relationship
                            queryFieldSet.add(relationshipName + '.Id');
                            
                            // Add appropriate name field if found
                            if (String.isNotBlank(nameField)) {
                                queryFieldSet.add(relationshipName + '.' + nameField);
                            }
                        } else {
                            // Just get Id if can't determine relationship fields
                            queryFieldSet.add(relationshipName + '.Id');
                        }
                    } else {
                        queryFieldSet.add(fieldNameLower);
                    }
                }
            }

            // --- Build and Execute Query ---
            List<String> queryFieldsList = new List<String>(queryFieldSet);
            String fieldsToQuery = String.join(queryFieldsList, ', ');
            String query = 'SELECT ' + fieldsToQuery + ' FROM ' + String.escapeSingleQuotes(objectApiName) + 
                           ' WHERE Id = :recordId LIMIT 1'; // WHERE clause can use uppercase 'Id' - it's case-insensitive here
            
            System.debug(LoggingLevel.WARN, 'DynamicRecordListView: Executing Record Detail Query: ' + query); 
            
            List<SObject> records = Database.query(query);

            // --- Process Results --- 
             if (records.isEmpty()) {
                throw new AuraHandledException('Record not found or inaccessible.');
            }
            SObject record = records[0];

            // Iterate through the *accessible* fields using the lowercase keys we stored
            for (String fieldApiNameLower : fieldDescribeMap.keySet()) {
                 Schema.DescribeFieldResult fieldDescribe = fieldDescribeMap.get(fieldApiNameLower);
                 String fieldApiName = fieldDescribe.getName(); // Get original casing for the final map

                 // Skip adding the 'id' field itself to the details list
                 if(fieldApiNameLower == 'id') continue; // Use lowercase for comparison

                 Map<String, Object> fieldDetail = new Map<String, Object>();
                 fieldDetail.put('apiName', fieldApiName); // Use original casing for display/mapping in LWC if needed
                 fieldDetail.put('label', fieldDescribe.getLabel());
                 fieldDetail.put('type', fieldDescribe.getType().name()); 
                 fieldDetail.put('isReference', false);

                 Object fieldValue = null;

                 // --- Handle Field Value Extraction (including relationships) ---
                 if (relationshipNameMap.containsKey(fieldApiNameLower)) {
                     // It's a reference field we queried via relationship (e.g., accountid -> Account)
                     String relationshipName = relationshipNameMap.get(fieldApiNameLower);
                     SObject relatedRecord = record.getSObject(relationshipName);
                     
                     if (relatedRecord != null) {
                         // Get the appropriate name field for this relationship
                         String nameField = relationshipNameFieldMap.get(relationshipName);
                         
                         if (String.isNotBlank(nameField) && relatedRecord.get(nameField) != null) {
                             fieldValue = relatedRecord.get(nameField); // Get name field value from related SObject
                         } else {
                             // Fallback to Id if no name field available or value is null
                             fieldValue = 'Record: ' + relatedRecord.get('Id');
                         }
                         
                         fieldDetail.put('isReference', true);
                         fieldDetail.put('referenceId', relatedRecord.get('Id')); // Get Id from related SObject
                         
                         // Use the pre-determined object API name from our saved map
                         if (relationshipToObjectMap.containsKey(relationshipName)) {
                             fieldDetail.put('referenceToObject', relationshipToObjectMap.get(relationshipName));
                         } else {
                             // Fallback - determine object type from the ID
                             String objectTypeFromId = getObjectTypeFromId(String.valueOf(relatedRecord.get('Id')));
                             fieldDetail.put('referenceToObject', objectTypeFromId);
                         }
                     } else {
                         // Related record is null
                         fieldValue = null;
                         fieldDetail.put('isReference', true); // Still a reference field, just no value
                         fieldDetail.put('referenceId', null);
                         
                         // Find the target object type from the original describe if possible
                         if (relationshipToObjectMap.containsKey(relationshipName)) {
                             fieldDetail.put('referenceToObject', relationshipToObjectMap.get(relationshipName));
                         } else {
                             List<Schema.SObjectType> targetTypes = fieldDescribe.getReferenceTo();
                             if(targetTypes != null && !targetTypes.isEmpty()){                             
                                fieldDetail.put('referenceToObject', targetTypes[0].getDescribe().getName());
                             } else {
                                fieldDetail.put('referenceToObject', ''); // No object type available
                             }
                         }
                     }
                 } else {
                     // It's a standard field on the main object
                     fieldValue = record.get(fieldApiName); // Use original casing field name to get value from SObject
                     fieldDetail.put('isReference', fieldDescribe.getType() == Schema.DisplayType.REFERENCE);
                     if((Boolean)fieldDetail.get('isReference')){
                        fieldDetail.put('referenceId', record.get(fieldApiName)); 
                         
                         // For these direct reference fields, determine the object type
                         List<Schema.SObjectType> targetTypes = fieldDescribe.getReferenceTo();
                         if(targetTypes != null && !targetTypes.isEmpty()){                             
                            fieldDetail.put('referenceToObject', targetTypes[0].getDescribe().getName());
                         } else {
                            // Try to determine object type from ID
                            String objectTypeFromId = getObjectTypeFromId(String.valueOf(record.get(fieldApiName)));
                            if (String.isNotBlank(objectTypeFromId)) {
                                fieldDetail.put('referenceToObject', objectTypeFromId);
                            } else {
                                fieldDetail.put('referenceToObject', ''); // No object type available
                            }
                         }
                     }
                 }

                 // Skip null/empty values to reduce payload size unless they are important fields
                 if (fieldValue == null && !isAlwaysIncludeField(fieldApiNameLower)) {
                     continue;
                 }
                 
                 // Skip default/empty string values
                 if (fieldValue instanceof String && String.isBlank((String)fieldValue) && !isAlwaysIncludeField(fieldApiNameLower)) {
                     continue;
                 }
                 
                 // Skip unnecessary boolean fields set to false
                 if (fieldValue instanceof Boolean && !(Boolean)fieldValue && !isImportantBooleanField(fieldApiNameLower)) {
                     continue;
                 }
                 
                 // Add the value to the field detail
                 fieldDetail.put('value', fieldValue);
                 
                 // Add to the output list
                 fieldDetailsList.add(fieldDetail);
            }

            return fieldDetailsList;

        } catch (AuraHandledException e) {
            throw e; // Re-throw known handled exceptions
        } catch (Exception e) {
            // Catch unexpected errors (QueryException, NullPointerException, etc.)
            throw new AuraHandledException('Failed to retrieve record details: ' + e.getMessage());
        }
    }
    
    /**
     * Determines whether a field should be considered a system field or otherwise unimportant
     * for display purposes. Used to filter out fields that generally aren't useful in the UI.
     * 
     * @param fieldName The lowercase API name of the field to check
     * @param objectName The API name of the object the field belongs to
     * @return Boolean Whether the field is a system field or unimportant
     */
    private static Boolean isSystemOrUnimportantField(String fieldName, String objectName) {
        // Standard system fields to exclude for all objects
        Set<String> systemFields = new Set<String>{
            'isdeleted', 'systemmodstamp'
        };
        
        // Common prefix/suffix patterns for system or unimportant fields
        List<String> systemPrefixes = new List<String>{
            '_hd', '_feed', 'jigsaw', 'jigsawcompanyid'
        };
        
        // Extra patterns specific to User object to filter out the truly unimportant preference fields
        Set<String> userSpecificPatterns = new Set<String>{
            'wtshown', 'suppressreminder', 'stayintouch', 'disablenotification'
        };
        
        // Important fields to preserve regardless of naming
        Set<String> importantFields = new Set<String>{
            'owner', 'createdby', 'lastmodifiedby', 'user', 'contact', 'account', 'manager',
            'name', 'email', 'phone', 'address', 'title', 'department', 'alias'
        };
        
        // Always preserve lookup fields
        if (fieldName.endsWith('id') && fieldName.length() > 2) {
            String possibleLookupField = fieldName.substring(0, fieldName.length() - 2);
            for (String important : importantFields) {
                if (possibleLookupField.contains(important)) {
                    return false; // Don't filter out important lookup fields
                }
            }
        }
        
        // Check if this is a field we explicitly want to keep
        for (String important : importantFields) {
            if (fieldName.contains(important)) {
                return false; // Don't filter out important fields
            }
        }
        
        // Check standard system fields
        for (String pattern : systemFields) {
            if (fieldName.equals(pattern)) {
                return true;
            }
        }
        
        // Check system prefixes/patterns
        for (String prefix : systemPrefixes) {
            if (fieldName.contains(prefix)) {
                return true;
            }
        }
        
        // Apply User object specific filters - only for obvious user preferences
        if (objectName == 'User') {
            for (String pattern : userSpecificPatterns) {
                if (fieldName.contains(pattern)) {
                    return true;
                }
            }
        }
        
        return false;
    }
    
    /**
     * Determines whether a field should always be included even if it's null/empty
     * Used for fields that are important to display even when they have no value
     * 
     * @param fieldName Lowercase API name of the field
     * @return Boolean Whether to always include the field
     */
    private static Boolean isAlwaysIncludeField(String fieldName) {
        // List of fields that should always be included regardless of value
        Set<String> importantFields = new Set<String>{
            'name', 'firstname', 'lastname', 'email', 'phone', 'title', 'department',
            'division', 'status', 'stage', 'account', 'contact', 'owner', 'user',
            'manager', 'createdby', 'lastmodifiedby', 'alias', 'active', 'username'
        };
        
        for (String field : importantFields) {
            if (fieldName.contains(field)) {
                return true;
            }
        }
        
        // Always include ID fields (lookup relationships)
        if (fieldName.endsWith('id') && fieldName.length() > 2) {
            return true;
        }
        
        return false;
    }
    
    /**
     * Determines whether a boolean field is important enough to display even when false
     * 
     * @param fieldName Lowercase API name of the field
     * @return Boolean Whether the boolean field is important
     */
    private static Boolean isImportantBooleanField(String fieldName) {
        // List of boolean fields that should be included even when false
        Set<String> importantBooleanFields = new Set<String>{
            'active', 'isactive', 'primary', 'isprimary', 'default', 'isdefault', 
            'main', 'ismain', 'closed', 'isclosed', 'partner', 'ispartner'
        };
        
        for (String field : importantBooleanFields) {
            if (fieldName.contains(field)) {
                return true;
            }
        }
        
        return false;
    }
    
    // ------------------- Private Helper Methods -------------------
    
    /**
     * Build the base query with SELECT and FROM clauses
     */
    private static String buildBaseQuery(String objectApiName, List<String> fields) {
        return 'SELECT ' + String.join(fields, ', ') + ' FROM ' + objectApiName;
    }
    
    /**
     * Build the WHERE clause combining filters and search
     */
    private static String buildWhereClause(String objectApiName, String filtersJson, String searchTerm, List<String> fields) {
        List<String> conditions = new List<String>();
        
        // Add conditions from filter criteria
        if (String.isNotBlank(filtersJson)) {
            try {
                List<Filter> filters = (List<Filter>)JSON.deserialize(filtersJson, List<Filter>.class);
                
                if (filters != null && !filters.isEmpty()) {
                    for (Filter filter : filters) {
                        if (String.isNotBlank(filter.field) && isValidFieldName(objectApiName, filter.field)) {
                            String condition = buildFilterCondition(filter);
                            if (String.isNotBlank(condition)) {
                                conditions.add(condition);
                            }
                        }
                    }
                }
            } catch (Exception e) {
                // If there's an error parsing filters, just ignore and continue
            }
        }
        
        // Add search term condition
        if (String.isNotBlank(searchTerm)) {
            List<String> searchConditions = new List<String>();
            
            // Search through all fields that have been passed to the controller
            // These are the fields displayed in the list view
            for (String field : fields) {
                // Only include fields that can be searched with a LIKE operator
                // Get the field type to determine how to build the search condition
                if (isValidFieldName(objectApiName, field)) {
                    try {
                        Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectApiName);
                        Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe().fields.getMap();
                        Schema.DescribeFieldResult fieldDescribe = fieldMap.get(field.toLowerCase()).getDescribe();
                        Schema.DisplayType fieldType = fieldDescribe.getType();
                        
                        // Build appropriate search conditions based on field type
                        if (fieldType == Schema.DisplayType.STRING ||
                            fieldType == Schema.DisplayType.TEXTAREA ||
                            fieldType == Schema.DisplayType.PICKLIST ||
                            fieldType == Schema.DisplayType.MULTIPICKLIST ||
                            fieldType == Schema.DisplayType.PHONE ||
                            fieldType == Schema.DisplayType.EMAIL ||
                            fieldType == Schema.DisplayType.URL) {
                            // Text-based search with LIKE
                            searchConditions.add(field + ' LIKE \'%' + String.escapeSingleQuotes(searchTerm) + '%\'');
                        } else if (fieldType == Schema.DisplayType.INTEGER || 
                                  fieldType == Schema.DisplayType.DOUBLE ||
                                  fieldType == Schema.DisplayType.CURRENCY ||
                                  fieldType == Schema.DisplayType.PERCENT) {
                            // Try to convert search term to a number for number fields
                            try {
                                Decimal searchNumber = Decimal.valueOf(searchTerm.trim());
                                searchConditions.add(field + ' = ' + searchNumber);
                            } catch (Exception e) {
                                // Ignore if the search term can't be converted to a number
                            }
                        } else if (fieldType == Schema.DisplayType.DATE || 
                                  fieldType == Schema.DisplayType.DATETIME) {
                            // Try to convert search term to a date
                            try {
                                // Check if the search term might be a year
                                if (searchTerm.length() == 4 && searchTerm.isNumeric()) {
                                    Integer year = Integer.valueOf(searchTerm);
                                    // Search by year
                                    searchConditions.add('CALENDAR_YEAR(' + field + ') = ' + year);
                                }
                                // Check if it might be a full or partial date
                                else if (searchTerm.contains('/') || searchTerm.contains('-')) {
                                    // Try different date patterns
                                    String datePattern = searchTerm;
                                    
                                    // Option 1: Convert exact date match using date literals
                                    // Force a string format that Salesforce date literals can understand
                                    datePattern = datePattern.replace('/', '-');

                                    // For dates like YYYY-MM-DD
                                    if (datePattern.split('-').size() == 3) {
                                        String[] parts = datePattern.split('-');
                                        // Check if it looks like a valid date format
                                        if ((parts[0].length() == 4 && parts[0].isNumeric()) || 
                                            (parts[2].length() == 4 && parts[2].isNumeric())) {
                                            // Create date literal in format YYYY-MM-DD
                                            String formattedDate;
                                            
                                            // Handle YYYY-MM-DD format
                                            if (parts[0].length() == 4 && parts[0].isNumeric()) {
                                                formattedDate = datePattern;
                                            } 
                                            // Handle MM-DD-YYYY format
                                            else if (parts[2].length() == 4 && parts[2].isNumeric()) {
                                                formattedDate = parts[2] + '-' + parts[0] + '-' + parts[1];
                                            }
                                            
                                            searchConditions.add(field + ' = ' + formattedDate);
                                        }
                                    }
                                    
                                    // Always add a LIKE search for flexible matching
                                    searchConditions.add('STRING(' + field + ') LIKE \'%' + 
                                                        String.escapeSingleQuotes(searchTerm) + '%\'');
                                }
                                // For month names or month numbers
                                else if (searchTerm.isNumeric() && searchTerm.length() <= 2) {
                                    Integer month = Integer.valueOf(searchTerm);
                                    if (month >= 1 && month <= 12) {
                                        searchConditions.add('CALENDAR_MONTH(' + field + ') = ' + month);
                                    }
                                }
                                // For day numbers
                                else if (searchTerm.isNumeric() && searchTerm.length() <= 2) {
                                    Integer day = Integer.valueOf(searchTerm);
                                    if (day >= 1 && day <= 31) {
                                        searchConditions.add('DAY_IN_MONTH(' + field + ') = ' + day);
                                    }
                                }
                                // Add a general string compare as a fallback
                                else {
                                    searchConditions.add('STRING(' + field + ') LIKE \'%' + 
                                                    String.escapeSingleQuotes(searchTerm) + '%\'');
                                }
                            } catch (Exception e) {
                                System.debug('Error processing date search term: ' + e.getMessage());
                                // Add a basic string search as a fallback
                                searchConditions.add('STRING(' + field + ') LIKE \'%' + 
                                                String.escapeSingleQuotes(searchTerm) + '%\'');
                            }
                        } else if (fieldType == Schema.DisplayType.BOOLEAN) {
                            // Try to match boolean values
                            if (searchTerm.equalsIgnoreCase('true') || 
                                searchTerm.equalsIgnoreCase('yes')) {
                                searchConditions.add(field + ' = true');
                            } else if (searchTerm.equalsIgnoreCase('false') || 
                                      searchTerm.equalsIgnoreCase('no')) {
                                searchConditions.add(field + ' = false');
                            }
                        }
                        // Other field types are skipped for searching
                    } catch (Exception e) {
                        // If any error occurs while building a condition, just skip that field
                        System.debug('Error building search condition for field ' + field + ': ' + e.getMessage());
                    }
                }
            }
            
            if (!searchConditions.isEmpty()) {
                conditions.add('(' + String.join(searchConditions, ' OR ') + ')');
            }
        }
        
        // Join all conditions with AND
        return String.join(conditions, ' AND ');
    }
    
    /**
     * Build the ORDER BY clause
     */
    private static String buildOrderByClause(String objectApiName, String sortField, String sortDirection) {
        if (String.isBlank(sortField) || !isValidFieldName(objectApiName, sortField)) {
            return ' ORDER BY Id ASC';
        }
        
        String direction = 'ASC';
        if (String.isNotBlank(sortDirection) && 
            (sortDirection.equalsIgnoreCase('desc') || sortDirection.equalsIgnoreCase('descending'))) {
            direction = 'DESC';
        }
        
        return ' ORDER BY ' + sortField + ' ' + direction + ' NULLS LAST';
    }
    
    /**
     * Helper class for filter conditions
     */
    private class Filter {
        public String field { get; set; }
        public String operator { get; set; }
        public String value { get; set; }
    }
    
    /**
     * Build a filter condition based on the filter object
     */
    private static String buildFilterCondition(Filter filter) {
        if (filter == null || String.isBlank(filter.field) || String.isBlank(filter.operator)) {
            return '';
        }
        
        String fieldName = String.escapeSingleQuotes(filter.field);
        String condition = '';
        String operatorLower = filter.operator.toLowerCase();
        
        switch on operatorLower {
            when 'equals' {
                if (String.isNotBlank(filter.value)) {
                    condition = fieldName + ' = \'' + String.escapeSingleQuotes(filter.value) + '\'';
                }
            }
            when 'notequals' {
                if (String.isNotBlank(filter.value)) {
                    condition = fieldName + ' != \'' + String.escapeSingleQuotes(filter.value) + '\'';
                }
            }
            when 'contains' {
                if (String.isNotBlank(filter.value)) {
                    condition = fieldName + ' LIKE \'%' + String.escapeSingleQuotes(filter.value) + '%\'';
                }
            }
            when 'notcontains' {
                if (String.isNotBlank(filter.value)) {
                    condition = 'NOT ' + fieldName + ' LIKE \'%' + String.escapeSingleQuotes(filter.value) + '%\'';
                }
            }
            when 'startswith' {
                if (String.isNotBlank(filter.value)) {
                    condition = fieldName + ' LIKE \'' + String.escapeSingleQuotes(filter.value) + '%\'';
                }
            }
            when 'endswith' {
                if (String.isNotBlank(filter.value)) {
                    condition = fieldName + ' LIKE \'%' + String.escapeSingleQuotes(filter.value) + '\'';
                }
            }
            when 'greaterthan' {
                if (String.isNotBlank(filter.value)) {
                    condition = fieldName + ' > ' + String.escapeSingleQuotes(filter.value);
                }
            }
            when 'lessthan' {
                if (String.isNotBlank(filter.value)) {
                    condition = fieldName + ' < ' + String.escapeSingleQuotes(filter.value);
                }
            }
            when 'isnull' {
                condition = fieldName + ' = null';
            }
            when 'isnotnull' {
                condition = fieldName + ' != null';
            }
        }
        
        return condition;
    }
    
    /**
     * Validate that an object name is valid and accessible
     */
    private static Boolean isValidObjectName(String objectName) {
        if (String.isBlank(objectName)) {
            return false;
        }
        
        Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
        Schema.SObjectType objectType = globalDescribe.get(objectName);
        
        return objectType != null && objectType.getDescribe().isAccessible();
    }
    
    /**
     * Validate that field names exist and are accessible for the given object
     */
    private static List<String> validateFields(String objectName, List<String> fields) {
        List<String> validFields = new List<String>();
        
        if (String.isBlank(objectName) || fields == null || fields.isEmpty()) {
            return validFields;
        }
        
        try {
            Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
            Schema.SObjectType objectType = globalDescribe.get(objectName);
            
            if (objectType == null) {
                return validFields;
            }
            
            Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe().fields.getMap();
            
            for (String field : fields) {
                if (String.isNotBlank(field) && fieldMap.containsKey(field.toLowerCase()) && 
                    fieldMap.get(field.toLowerCase()).getDescribe().isAccessible()) {
                    validFields.add(field);
                }
            }
        } catch (Exception e) {
        }
        
        return validFields;
    }
    
    /**
     * Check if a field name is valid for an object
     */
    private static Boolean isValidFieldName(String objectName, String fieldName) {
        if (String.isBlank(objectName) || String.isBlank(fieldName)) {
            return false;
        }
        
        try {
            Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
            Schema.SObjectType objectType = globalDescribe.get(objectName);
            
            if (objectType == null) {
                return false;
            }
            
            Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe().fields.getMap();
            
            return fieldMap.containsKey(fieldName.toLowerCase()) && 
                fieldMap.get(fieldName.toLowerCase()).getDescribe().isAccessible();
        } catch (Exception e) {
            return false;
        }
    }
    
    /**
     * Check if a field is a text field that can be used for searching
     */
    private static Boolean isTextField(String objectName, String fieldName) {
        if (String.isBlank(objectName) || String.isBlank(fieldName)) {
            return false;
        }
        
        try {
            Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
            Schema.SObjectType objectType = globalDescribe.get(objectName);
            
            if (objectType == null) {
                return false;
            }
            
            Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe().fields.getMap();
            
            if (!fieldMap.containsKey(fieldName.toLowerCase())) {
                return false;
            }
            
            Schema.DescribeFieldResult fieldDescribe = fieldMap.get(fieldName.toLowerCase()).getDescribe();
            Schema.DisplayType fieldType = fieldDescribe.getType();
            
            // Consider these types searchable by text
            return fieldType == Schema.DisplayType.STRING ||
                fieldType == Schema.DisplayType.TEXTAREA ||
                fieldType == Schema.DisplayType.PICKLIST ||
                fieldType == Schema.DisplayType.MULTIPICKLIST ||
                fieldType == Schema.DisplayType.PHONE ||
                fieldType == Schema.DisplayType.EMAIL ||
                fieldType == Schema.DisplayType.URL;
        } catch (Exception e) {
            return false;
        }
    }

    /**
     * Helper method to validate if an object API name is a queryable Salesforce object
     * 
     * @param objectName The object API name to validate
     * @return Boolean - true if the object exists and can be queried
     */
    private static Boolean isQueryableObject(String objectName) {
        if (String.isBlank(objectName)) {
            return false;
        }
        
        // Never use 'Name' as an object - it's a field, not an object
        if (objectName.equalsIgnoreCase('Name')) {
            return false;
        }
        
        try {
            // Check if it's a valid SObject name
            Schema.SObjectType sType = Schema.getGlobalDescribe().get(objectName);
            if (sType == null) {
                return false;
            }
            
            // Check if it's queryable
            Schema.DescribeSObjectResult describeResult = sType.getDescribe();
            return describeResult.isQueryable() && describeResult.isAccessible();
        } catch(Exception e) {
            return false;
        }
    }

    /**
     * Get page layout related lists for a given object and record type
     * This retrieves only the related lists configured on the page layout
     * 
     * @param objectApiName The API name of the object
     * @param recordTypeId Optional record type ID
     * @return List of related list information from page layout
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getPageLayoutRelatedLists(String objectApiName, String recordTypeId) {
        try {
            if (String.isBlank(objectApiName)) {
                throw new AuraHandledException('Object API name is required');
            }
            
            List<Map<String, Object>> relatedListsInfo = new List<Map<String, Object>>();
            
            // Get the object describe
            Schema.SObjectType sObjectType = Schema.getGlobalDescribe().get(objectApiName);
            if (sObjectType == null) {
                throw new AuraHandledException('Invalid object: ' + objectApiName);
            }
            
            // Get default record type if not provided
            if (String.isBlank(recordTypeId)) {
                List<Schema.RecordTypeInfo> rtInfos = sObjectType.getDescribe().getRecordTypeInfos();
                for (Schema.RecordTypeInfo rtInfo : rtInfos) {
                    if (rtInfo.isDefaultRecordTypeMapping() && rtInfo.isActive()) {
                        recordTypeId = rtInfo.getRecordTypeId();
                        break;
                    }
                }
            }
            
            // Get page layout metadata using Metadata API wrapper
            // Note: This is a simplified version - in production, you'd use Metadata API or UI API
            List<String> commonRelatedLists = getCommonRelatedListsForObject(objectApiName);
            
            // Get child relationships
            for (Schema.ChildRelationship childRel : sObjectType.getDescribe().getChildRelationships()) {
                String relationshipName = childRel.getRelationshipName();
                if (String.isBlank(relationshipName)) continue;
                
                Schema.SObjectType childSObjectType = childRel.getChildSObject();
                if (childSObjectType == null || !childSObjectType.getDescribe().isAccessible()) continue;
                
                String childObjectName = childSObjectType.getDescribe().getName();
                
                // Filter to only include common related lists
                if (commonRelatedLists.contains(relationshipName)) {
                    Map<String, Object> relatedListInfo = new Map<String, Object>();
                    relatedListInfo.put('objectApiName', childObjectName);
                    relatedListInfo.put('relationshipName', relationshipName);
                    relatedListInfo.put('label', childSObjectType.getDescribe().getLabelPlural());
                    relatedListInfo.put('icon', getObjectIcon(childObjectName));
                    
                    // Get default fields for the related list
                    List<String> defaultFields = getDefaultFieldsForRelatedList(childObjectName);
                    relatedListInfo.put('fields', defaultFields);
                    
                    relatedListsInfo.add(relatedListInfo);
                }
            }
            
            return relatedListsInfo;
            
        } catch (Exception e) {
            throw new AuraHandledException('Error getting page layout related lists: ' + e.getMessage());
        }
    }
    
    /**
     * Get common related lists based on object type
     * This is a simplified approach - in production, use Metadata API or UI API
     */
    private static List<String> getCommonRelatedListsForObject(String objectApiName) {
        Map<String, List<String>> commonRelatedListsMap = new Map<String, List<String>>{
            'Account' => new List<String>{'Contacts', 'Opportunities', 'Cases', 'Tasks', 'Events', 'OpenActivities', 'ActivityHistories', 'AttachedContentDocuments', 'CombinedAttachments'},
            'Contact' => new List<String>{'Cases', 'Tasks', 'Events', 'OpenActivities', 'ActivityHistories', 'AttachedContentDocuments', 'CombinedAttachments'},
            'Opportunity' => new List<String>{'OpportunityLineItems', 'OpportunityContactRoles', 'Tasks', 'Events', 'OpenActivities', 'ActivityHistories', 'AttachedContentDocuments'},
            'Case' => new List<String>{'CaseComments', 'Tasks', 'Events', 'OpenActivities', 'ActivityHistories', 'AttachedContentDocuments', 'CombinedAttachments'},
            'Lead' => new List<String>{'Tasks', 'Events', 'OpenActivities', 'ActivityHistories', 'AttachedContentDocuments', 'CombinedAttachments'}
        };
        
        // Return common related lists for the object, or a default set
        List<String> relatedLists = commonRelatedListsMap.get(objectApiName);
        if (relatedLists == null) {
            // Default related lists for custom objects
            relatedLists = new List<String>{'Tasks', 'Events', 'AttachedContentDocuments', 'CombinedAttachments'};
        }
        
        return relatedLists;
    }
    
    /**
     * Get default fields for a related list
     */
    private static List<String> getDefaultFieldsForRelatedList(String objectApiName) {
        Map<String, List<String>> defaultFieldsMap = new Map<String, List<String>>{
            'Contact' => new List<String>{'Name', 'Title', 'Email', 'Phone'},
            'Opportunity' => new List<String>{'Name', 'StageName', 'Amount', 'CloseDate'},
            'Case' => new List<String>{'CaseNumber', 'Subject', 'Status', 'Priority'},
            'Task' => new List<String>{'Subject', 'ActivityDate', 'Status', 'Priority'},
            'Event' => new List<String>{'Subject', 'StartDateTime', 'EndDateTime', 'Location'},
            'OpportunityLineItem' => new List<String>{'Product2.Name', 'Quantity', 'UnitPrice', 'TotalPrice'},
            'CaseComment' => new List<String>{'CommentBody', 'CreatedDate', 'CreatedBy.Name'}
        };
        
        List<String> fields = defaultFieldsMap.get(objectApiName);
        if (fields == null) {
            // Default fields for unknown objects
            fields = new List<String>{'Name', 'CreatedDate', 'LastModifiedDate'};
        }
        
        return fields;
    }
    
    /**
     * Get the appropriate icon for an object
     */
    private static String getObjectIcon(String objectApiName) {
        // Standard object icons
        Map<String, String> iconMap = new Map<String, String>{
            'Account' => 'standard:account',
            'Contact' => 'standard:contact',
            'Opportunity' => 'standard:opportunity',
            'Case' => 'standard:case',
            'Task' => 'standard:task',
            'Event' => 'standard:event',
            'Lead' => 'standard:lead',
            'ContentDocument' => 'standard:file',
            'Attachment' => 'standard:attachment'
        };
        
        String icon = iconMap.get(objectApiName);
        if (icon == null) {
            icon = objectApiName.endsWith('__c') ? 'standard:custom' : 'standard:default';
        }
        
        return icon;
    }

    /**
     * Get available actions for an object
     * 
     * @param objectApiName The API name of the object
     * @param recordId Optional record ID for record-specific actions
     * @return List of available actions
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getObjectActions(String objectApiName, String recordId) {
        try {
            List<Map<String, Object>> actions = new List<Map<String, Object>>();
            
            // NOTE: Dynamically fetching all quick actions in Apex is not directly supported.
            // The UI API is the standard way to get a complete list of available actions.
            // For now, we will return a set of standard, essential actions.
            
            // Add standard actions that are generally available
            actions.add(createAction('Edit', 'Edit', 'standard:edit', 'standard'));
            actions.add(createAction('Delete', 'Delete', 'standard:delete', 'standard'));
            actions.add(createAction('Clone', 'Clone', 'standard:clone', 'standard'));
            
            return actions;
            
        } catch (Exception e) {
            throw new AuraHandledException('Error getting object actions: ' + e.getMessage());
        }
    }
    
    /**
     * Helper method to create an action map
     */
    private static Map<String, Object> createAction(String name, String label, String icon, String type) {
        Map<String, Object> action = new Map<String, Object>();
        action.put('name', name);
        action.put('label', label);
        action.put('icon', icon);
        action.put('type', type);
        return action;
    }
    
    /**
     * Launch a flow with input parameters
     * 
     * @param flowApiName The API name of the flow
     * @param inputVariables Map of input variable names to values
     * @return Flow interview ID or result
     */
    @AuraEnabled
    public static String launchFlow(String flowApiName, Map<String, Object> inputVariables) {
        try {
            if (String.isBlank(flowApiName)) {
                throw new AuraHandledException('Flow API name is required');
            }
            
            // Create a new flow interview
            Flow.Interview flowInterview = Flow.Interview.createInterview(flowApiName, inputVariables);
            
            // Start the flow
            flowInterview.start();
            
            // Return success message or flow outputs if needed
            return 'Flow launched successfully';
            
        } catch (Exception e) {
            throw new AuraHandledException('Error launching flow: ' + e.getMessage());
        }
    }
    
    /**
     * Validate that fields exist and are accessible
     */
    private static Set<String> validateFieldsForQuery(String objectApiName, Set<String> requestedFields) {
        Set<String> validFields = new Set<String>();
        
        Schema.SObjectType objectType = Schema.getGlobalDescribe().get(objectApiName);
        if (objectType == null) return validFields;
        
        Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe().fields.getMap();
        
        for (String field : requestedFields) {
            // Handle relationship fields (e.g., 'Account.Name')
            if (field.contains('.')) {
                validFields.add(field); // Add as-is, will be validated by SOQL
            } else if (fieldMap.containsKey(field.toLowerCase()) && 
                       fieldMap.get(field.toLowerCase()).getDescribe().isAccessible()) {
                validFields.add(field);
            }
        }
        
        return validFields;
    }
}