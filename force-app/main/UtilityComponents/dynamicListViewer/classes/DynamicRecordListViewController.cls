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
            // --- Input Validation ---
            // Ensure a valid object API name is provided.
            if (String.isBlank(objectApiName)) {
                throw new AuraHandledException('Object API name is required');
            }

            // --- Security Check ---
            // Verify the current user has access to the requested object.
            if (!isValidObjectName(objectApiName)) {
                throw new AuraHandledException('Object is not accessible: ' + objectApiName);
            }

            // --- Initialization ---
            List<Map<String, Object>> relatedObjectsList = new List<Map<String, Object>>();

            // --- Schema Describe (Optimized) ---
            // Get the global describe map once to avoid repeated calls within the loop.
            Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
            Schema.SObjectType objectType = globalDescribe.get(objectApiName);

            // If the object type is somehow null (shouldn't happen after isValidObjectName check, but defensive coding)
            if (objectType == null) {
                 throw new AuraHandledException('Could not describe object: ' + objectApiName);
            }

            // --- Governor Limit Prevention ---
            // Set a reasonable limit for the number of child relationships to process.
            // This prevents exceeding CPU time limits or hitting other governor limits
            // when dealing with objects with a very large number of relationships.
            Integer relationshipCount = 0;
            Integer maxRelationships = 10; // Limit to the potentially most relevant relationships

            // --- Child Relationship Processing ---
            Schema.DescribeSObjectResult describeResult = objectType.getDescribe();
            if (describeResult == null) {
                // Handle case where describe result is null
                 throw new AuraHandledException('Could not get describe result for object: ' + objectApiName);
            }

            List<Schema.ChildRelationship> childRelationships = describeResult.getChildRelationships();
            if (childRelationships == null) {
                // Handle case where child relationships list is null, return empty list
                return relatedObjectsList;
            }


            for (Schema.ChildRelationship childRel : childRelationships) {
                // Stop processing if we've hit the defined limit.
                if (relationshipCount >= maxRelationships) break;

                // --- Relationship Details ---
                Schema.SObjectType childObjectType = childRel.getChildSObject();
                String relationshipName = childRel.getRelationshipName();

                // --- Filtering ---
                // Skip if:
                // 1. Relationship name is null (indicates an issue).
                // 2. The child object is not accessible to the user.
                // 3. It's likely a system object (e.g., FeedItem, AttachedContentDocument).
                // 4. It's a history or sharing object, which are often large and less relevant for this UI context.
                if (relationshipName == null ||
                    childObjectType == null || // Added null check for childObjectType
                    !childObjectType.getDescribe().isAccessible() ||
                    childObjectType.getDescribe().getName().startsWith('System') ||
                    childObjectType.getDescribe().getName().endsWith('History') || // Use endsWith for History tables
                    childObjectType.getDescribe().getName().endsWith('Share')) // Use endsWith for Share tables
                {
                    continue; // Skip this relationship
                }

                // --- Prepare Data for LWC ---
                Map<String, Object> relatedObj = new Map<String, Object>();
                String childObjectName = childObjectType.getDescribe().getName();

                // Only include essential information needed by the LWC to minimize payload.
                relatedObj.put('objectApiName', childObjectName);
                relatedObj.put('label', childObjectType.getDescribe().getLabel());
                relatedObj.put('relationshipName', relationshipName);
                // Removed 'fieldName' as it wasn't used in the frontend requirement.

                relatedObjectsList.add(relatedObj);
                relationshipCount++; // Increment the counter only when a relationship is added.
            }

            // --- Return Result ---
            return relatedObjectsList;

        } catch (AuraHandledException e) {
            // Re-throw exceptions already formatted for the LWC.
            throw e;
        } catch (Exception e) {
            // Catch any other unexpected exceptions and wrap them for the LWC.
            throw new AuraHandledException('Error getting related objects: ' + e.getMessage());
        }
    }
    
    /**
     * Get related records for a specific parent record
     * 
     * @param parentId The ID of the parent record
     * @param relationshipName The relationship name from the parent to the child
     * @param objectApiName The API name of the parent object
     * @return List of related records
     */
    @AuraEnabled
    public static List<SObject> getRelatedRecords(
        String objectApiName,
        String parentId,
        String relationshipName
    ) {
        try {
            if (String.isBlank(parentId)) {
                throw new AuraHandledException('Parent ID is required');
            }
            
            if (String.isBlank(relationshipName)) {
                throw new AuraHandledException('Relationship name is required');
            }
            
            if (String.isBlank(objectApiName)) {
                throw new AuraHandledException('Object API name is required');
            }
            
            if (!isValidObjectName(objectApiName)) {
                throw new AuraHandledException('Object is not accessible: ' + objectApiName);
            }
            
            // Ensure the ID is valid format
            Id recordId;
            try {
                recordId = Id.valueOf(parentId);
            } catch (Exception e) {
                throw new AuraHandledException('Invalid ID format: ' + parentId);
            }
            
            // Get the relationship object via describe calls
            Schema.SObjectType parentType = Schema.getGlobalDescribe().get(objectApiName);
            
            String relatedObjectName = '';
            for (Schema.ChildRelationship rel : parentType.getDescribe().getChildRelationships()) {
                if (rel.getRelationshipName() == relationshipName) {
                    relatedObjectName = String.valueOf(rel.getChildSObject());
                    break;
                }
            }
            
            if (String.isBlank(relatedObjectName)) {
                throw new AuraHandledException('Relationship not found: ' + relationshipName);
            }
            
            // Get the related object's schema to determine appropriate name fields
            Schema.SObjectType relatedType = Schema.getGlobalDescribe().get(relatedObjectName);
            Map<String, Schema.SObjectField> fieldMap = relatedType.getDescribe().fields.getMap();
            
            // Determine the most appropriate "name" field for display
            String nameField = findAppropriateNameField(relatedObjectName, fieldMap);
            
            // Construct query for the related records 
            // Always include Id and dynamically determined name field
            String query = 'SELECT Id';
            
            if (!String.isBlank(nameField)) {
                query += ', ' + nameField;
            }
            
            query += ' FROM ' + String.escapeSingleQuotes(relatedObjectName);
            
            // Add relationship field
            String relationshipField = '';
            
            for (Schema.SObjectField field : fieldMap.values()) {
                Schema.DescribeFieldResult describe = field.getDescribe();
                if (describe.getType() == Schema.DisplayType.REFERENCE) {
                    List<Schema.SObjectType> referenceTo = describe.getReferenceTo();
                    for (Schema.SObjectType refType : referenceTo) {
                        if (refType == parentType) {
                            relationshipField = describe.getName();
                            break;
                        }
                    }
                }
                if (!String.isBlank(relationshipField)) break;
            }
            
            if (String.isBlank(relationshipField)) {
                throw new AuraHandledException('Could not determine relationship field');
            }
            
            query += ' WHERE ' + relationshipField + ' = :recordId';
            query += ' LIMIT ' + MAX_RELATED_RECORDS;
            
            return Database.query(query);
        } catch (AuraHandledException e) {
            throw e;
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

                 // --- Handle Field Value Extraction (including relationships) ---
                 if (relationshipNameMap.containsKey(fieldApiNameLower)) {
                     // It's a reference field we queried via relationship (e.g., accountid -> Account)
                     String relationshipName = relationshipNameMap.get(fieldApiNameLower);
                     SObject relatedRecord = record.getSObject(relationshipName);
                     
                     if (relatedRecord != null) {
                         // Get the appropriate name field for this relationship
                         String nameField = relationshipNameFieldMap.get(relationshipName);
                         
                         if (String.isNotBlank(nameField) && relatedRecord.get(nameField) != null) {
                             fieldDetail.put('value', relatedRecord.get(nameField)); // Get name field value from related SObject
                         } else {
                             // Fallback to Id if no name field available or value is null
                             fieldDetail.put('value', 'Record: ' + relatedRecord.get('Id'));
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
                         fieldDetail.put('value', null);
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
                     fieldDetail.put('value', record.get(fieldApiName)); // Use original casing field name to get value from SObject
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
            
            for (String field : fields) {
                if (isTextField(objectApiName, field)) {
                    searchConditions.add(field + ' LIKE \'%' + String.escapeSingleQuotes(searchTerm) + '%\'');
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
}