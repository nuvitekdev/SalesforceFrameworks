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
    String searchTerm,
    String recordTypeNameFilter,
    Boolean showOnlyCreatedByMe
  ) {
    try {
      // Input validation
      if (String.isBlank(objectApiName)) {
        throw new AuraHandledException('Object API name is required');
      }

      // Security check - verify the object is accessible
      if (!isValidObjectName(objectApiName)) {
        throw new AuraHandledException(
          'Object is not accessible: ' + objectApiName
        );
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
      Integer limitValue = (recordsPerPage != null &&
        recordsPerPage > 0)
        ? Math.min(recordsPerPage, MAX_RECORDS_PER_QUERY)
        : DEFAULT_PAGE_SIZE;

      Integer offsetValue = ((pageNumber != null &&
        pageNumber > 1)
        ? (pageNumber - 1) * limitValue
        : 0);

      // Build the query
      String baseQuery = buildBaseQuery(objectApiName, validatedFields);
      String whereClause = buildWhereClause(
        objectApiName,
        filters,
        searchTerm,
        validatedFields,
        recordTypeNameFilter,
        showOnlyCreatedByMe
      );
      String orderByClause = buildOrderByClause(
        objectApiName,
        sortField,
        sortDirection
      );

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
      throw new AuraHandledException(
        'Error retrieving records: ' + e.getMessage()
      );
    }
  }

  /**
   * Get all available fields for an object
   *
   * @param objectApiName The API name of the object
   * @return List of field information (API name, label, type, reference info)
   */
  @AuraEnabled
  public static List<Map<String, Object>> getObjectFields(
    String objectApiName
  ) {
    try {
      if (String.isBlank(objectApiName)) {
        throw new AuraHandledException('Object API name is required');
      }

      if (!isValidObjectName(objectApiName)) {
        throw new AuraHandledException(
          'Object is not accessible: ' + objectApiName
        );
      }

      List<Map<String, Object>> fieldsList = new List<Map<String, Object>>();

      // Get schema info for the object
      SObjectType objectType = Schema.getGlobalDescribe().get(objectApiName);
      Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe()
        .fields.getMap();

      for (String fieldName : fieldMap.keySet()) {
        Schema.DescribeFieldResult fieldDescribe = fieldMap.get(fieldName)
          .getDescribe();

        // Skip system fields and inaccessible fields
        if (fieldName.startsWith('System') || !fieldDescribe.isAccessible()) {
          continue;
        }

        Map<String, Object> fieldInfo = new Map<String, Object>();
        fieldInfo.put('apiName', fieldName);
        fieldInfo.put('label', fieldDescribe.getLabel());
        fieldInfo.put('type', fieldDescribe.getType().name());

        // Handle reference fields
        Boolean isReference =
          fieldDescribe.getType() == Schema.DisplayType.REFERENCE;
        fieldInfo.put('isReference', isReference);

        if (isReference) {
          List<Schema.SObjectType> references = fieldDescribe.getReferenceTo();
          if (references != null && !references.isEmpty()) {
            fieldInfo.put(
              'referenceToObject',
              references[0].getDescribe().getName()
            );
          }
        }

        fieldsList.add(fieldInfo);
      }

      return fieldsList;
    } catch (AuraHandledException e) {
      throw e;
    } catch (Exception e) {
      throw new AuraHandledException(
        'Error getting object fields: ' + e.getMessage()
      );
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
  public static List<Map<String, Object>> getRelatedObjects(
    String objectApiName
  ) {
    try {
      // --- Input Validation ---
      // Ensure a valid object API name is provided.
      if (String.isBlank(objectApiName)) {
        throw new AuraHandledException('Object API name is required');
      }

      // --- Security Check ---
      // Verify the current user has access to the requested object.
      if (!isValidObjectName(objectApiName)) {
        throw new AuraHandledException(
          'Object is not accessible: ' + objectApiName
        );
      }

      // --- Initialization ---
      List<Map<String, Object>> relatedObjectsList = new List<Map<String, Object>>();

      // --- Schema Describe (Optimized) ---
      // Get the global describe map once to avoid repeated calls within the loop.
      Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
      Schema.SObjectType objectType = globalDescribe.get(objectApiName);

      // If the object type is somehow null (shouldn't happen after isValidObjectName check, but defensive coding)
      if (objectType == null) {
        throw new AuraHandledException(
          'Could not describe object: ' + objectApiName
        );
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
        throw new AuraHandledException(
          'Could not get describe result for object: ' + objectApiName
        );
      }

      List<Schema.ChildRelationship> childRelationships = describeResult.getChildRelationships();
      if (childRelationships == null) {
        // Handle case where child relationships list is null, return empty list
        return relatedObjectsList;
      }

      for (Schema.ChildRelationship childRel : childRelationships) {
        // Stop processing if we've hit the defined limit.
        if (relationshipCount >= maxRelationships)
          break;

        // --- Relationship Details ---
        Schema.SObjectType childObjectType = childRel.getChildSObject();
        String relationshipName = childRel.getRelationshipName();

        // --- Filtering ---
        // Skip if:
        // 1. Relationship name is null (indicates an issue).
        // 2. The child object is not accessible to the user.
        // 3. It's likely a system object (e.g., FeedItem, AttachedContentDocument).
        // 4. It's a history or sharing object, which are often large and less relevant for this UI context.
        if (
          relationshipName == null ||
          childObjectType == null || // Added null check for childObjectType
          !childObjectType.getDescribe().isAccessible() ||
          childObjectType.getDescribe().getName().startsWith('System') ||
          childObjectType.getDescribe().getName().endsWith('History') || // Use endsWith for History tables
          childObjectType.getDescribe().getName().endsWith('Share') // Use endsWith for Share tables
        ) {
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
      throw new AuraHandledException(
        'Error getting related objects: ' + e.getMessage()
      );
    }
  }

  /**
   * Get related records for a specific parent record (convenience method)
   *
   * @param parentId The ID of the parent record
   * @param relationshipName The relationship name from the parent to the child
   * @param objectApiName The API name of the parent object
   * @return List of related records
   */
  public static List<SObject> getRelatedRecords(
    String objectApiName,
    String parentId,
    String relationshipName
  ) {
    return getRelatedRecords(
      objectApiName,
      parentId,
      relationshipName,
      null,
      null
    );
  }

  @AuraEnabled
  public static List<SObject> getRelatedRecords(
    String objectApiName,
    String parentId,
    String relationshipName,
    List<String> fields,
    Integer maxRecords
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
        throw new AuraHandledException(
          'Object is not accessible: ' + objectApiName
        );
      }

      // Ensure the ID is valid format
      Id recordId;
      try {
        recordId = Id.valueOf(parentId);
      } catch (Exception e) {
        throw new AuraHandledException('Invalid ID format: ' + parentId);
      }

      // Get the relationship object via describe calls
      Schema.SObjectType parentType = Schema.getGlobalDescribe()
        .get(objectApiName);

      String relatedObjectName = '';
      for (
        Schema.ChildRelationship rel : parentType.getDescribe()
          .getChildRelationships()
      ) {
        if (rel.getRelationshipName() == relationshipName) {
          relatedObjectName = String.valueOf(rel.getChildSObject());
          break;
        }
      }

      if (String.isBlank(relatedObjectName)) {
        throw new AuraHandledException(
          'Relationship not found: ' + relationshipName
        );
      }

      // Get the related object's schema to determine appropriate name fields
      Schema.SObjectType relatedType = Schema.getGlobalDescribe()
        .get(relatedObjectName);
      Map<String, Schema.SObjectField> fieldMap = relatedType.getDescribe()
        .fields.getMap();

      // Determine fields to query
      Set<String> fieldsToQuery = new Set<String>{ 'Id' }; // Always include Id

      if (fields != null && !fields.isEmpty()) {
        // Use provided fields
        for (String field : fields) {
          // Validate field exists and is accessible
          String fieldName = field.toLowerCase();
          if (
            fieldMap.containsKey(fieldName) &&
            fieldMap.get(fieldName).getDescribe().isAccessible()
          ) {
            fieldsToQuery.add(field);
          }
        }
      } else {
        // Determine the most appropriate "name" field for display
        String nameField = findAppropriateNameField(
          relatedObjectName,
          fieldMap
        );
        if (!String.isBlank(nameField)) {
          fieldsToQuery.add(nameField);
        }
      }

      // Construct query for the related records
      String query =
        'SELECT ' + String.join(new List<String>(fieldsToQuery), ', ');

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
        if (!String.isBlank(relationshipField))
          break;
      }

      if (String.isBlank(relationshipField)) {
        throw new AuraHandledException(
          'Could not determine relationship field'
        );
      }

      query += ' WHERE ' + relationshipField + ' = :recordId';

      // Use provided maxRecords or default
      Integer limitValue = (maxRecords != null &&
        maxRecords > 0)
        ? maxRecords
        : MAX_RELATED_RECORDS;
      query += ' LIMIT ' + limitValue;

      return Database.query(query);
    } catch (AuraHandledException e) {
      throw e;
    } catch (Exception e) {
      throw new AuraHandledException(
        'Error fetching related records: ' + e.getMessage()
      );
    }
  }

  /**
   * Finds the most appropriate field to use as a "name" or title field for an object
   *
   * @param objectName The API name of the object
   * @param fieldMap The map of fields for the object
   * @return The API name of the field to use as name/title
   */
  private static String findAppropriateNameField(
    String objectName,
    Map<String, Schema.SObjectField> fieldMap
  ) {
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
      if (
        fieldMap.containsKey(lowercaseFieldName) &&
        fieldMap.get(lowercaseFieldName).getDescribe().isAccessible()
      ) {
        return fieldName;
      }
    }

    // Fallback: find any text field that might serve as a name/description
    for (String fieldName : fieldMap.keySet()) {
      Schema.DescribeFieldResult describe = fieldMap.get(fieldName)
        .getDescribe();
      if (
        describe.isAccessible() &&
        (describe.getType() == Schema.DisplayType.STRING ||
        describe.getType() == Schema.DisplayType.TEXTAREA)
      ) {
        // Skip system fields and relationship fields
        if (
          !fieldName.endsWith('Id') &&
          !fieldName.startsWith('system') &&
          !fieldName.startsWith('is') &&
          !fieldName.contains('__r')
        ) {
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
  public static List<Map<String, Object>> getRecordAllFields(
    String objectApiName,
    String recordId
  ) {
    // --- Input Validation & Security ---
    if (String.isBlank(objectApiName)) {
      throw new AuraHandledException('Object API name is required');
    }

    // Special handling for User IDs that might be misidentified
    if (
      recordId != null &&
      recordId.startsWith('005') &&
      objectApiName != 'User'
    ) {
      objectApiName = 'User';
    }

    // Verify the object name is valid and queryable
    if (!isQueryableObject(objectApiName)) {
      throw new AuraHandledException(
        'Invalid or unsupported object type: ' + objectApiName
      );
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
        throw new AuraHandledException(
          'Could not describe object: ' + objectApiName
        );
      }
      Map<String, Schema.SObjectField> allFieldsMap = objectType.getDescribe()
        .fields.getMap();

      // --- Identify Accessible Fields and Relationship Fields ---
      for (String fieldName : allFieldsMap.keySet()) {
        // CONSISTENTLY use lowercase for comparisons and storage keys
        String fieldNameLower = fieldName.toLowerCase();
        Schema.DescribeFieldResult fieldDescribe = allFieldsMap.get(fieldName)
          .getDescribe();

        // Skip system or unimportant fields right from the start to improve performance
        if (isSystemOrUnimportantField(fieldNameLower, objectApiName)) {
          continue;
        }

        if (fieldDescribe.isAccessible()) {
          fieldDescribeMap.put(fieldNameLower, fieldDescribe);

          if (
            fieldDescribe.getType() == Schema.DisplayType.REFERENCE &&
            fieldDescribe.getRelationshipName() != null
          ) {
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
      String query =
        'SELECT ' +
        fieldsToQuery +
        ' FROM ' +
        String.escapeSingleQuotes(objectApiName) +
        ' WHERE Id = :recordId LIMIT 1'; // WHERE clause can use uppercase 'Id' - it's case-insensitive here

      List<SObject> records = Database.query(query);

      // --- Process Results ---
      if (records.isEmpty()) {
        throw new AuraHandledException('Record not found or inaccessible.');
      }
      SObject record = records[0];

      // Iterate through the *accessible* fields using the lowercase keys we stored
      for (String fieldApiNameLower : fieldDescribeMap.keySet()) {
        Schema.DescribeFieldResult fieldDescribe = fieldDescribeMap.get(
          fieldApiNameLower
        );
        String fieldApiName = fieldDescribe.getName(); // Get original casing for the final map

        // Skip adding the 'id' field itself to the details list
        if (fieldApiNameLower == 'id')
          continue; // Use lowercase for comparison

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

            if (
              String.isNotBlank(nameField) &&
              relatedRecord.get(nameField) != null
            ) {
              fieldValue = relatedRecord.get(nameField); // Get name field value from related SObject
            } else {
              // Fallback to Id if no name field available or value is null
              fieldValue = 'Record: ' + relatedRecord.get('Id');
            }

            fieldDetail.put('isReference', true);
            fieldDetail.put('referenceId', relatedRecord.get('Id')); // Get Id from related SObject

            // Use the pre-determined object API name from our saved map
            if (relationshipToObjectMap.containsKey(relationshipName)) {
              fieldDetail.put(
                'referenceToObject',
                relationshipToObjectMap.get(relationshipName)
              );
            } else {
              // Fallback - determine object type from the ID
              String objectTypeFromId = getObjectTypeFromId(
                String.valueOf(relatedRecord.get('Id'))
              );
              fieldDetail.put('referenceToObject', objectTypeFromId);
            }
          } else {
            // Related record is null
            fieldValue = null;
            fieldDetail.put('isReference', true); // Still a reference field, just no value
            fieldDetail.put('referenceId', null);

            // Find the target object type from the original describe if possible
            if (relationshipToObjectMap.containsKey(relationshipName)) {
              fieldDetail.put(
                'referenceToObject',
                relationshipToObjectMap.get(relationshipName)
              );
            } else {
              List<Schema.SObjectType> targetTypes = fieldDescribe.getReferenceTo();
              if (targetTypes != null && !targetTypes.isEmpty()) {
                fieldDetail.put(
                  'referenceToObject',
                  targetTypes[0].getDescribe().getName()
                );
              } else {
                fieldDetail.put('referenceToObject', ''); // No object type available
              }
            }
          }
        } else {
          // It's a standard field on the main object
          fieldValue = record.get(fieldApiName); // Use original casing field name to get value from SObject
          fieldDetail.put(
            'isReference',
            fieldDescribe.getType() == Schema.DisplayType.REFERENCE
          );
          if ((Boolean) fieldDetail.get('isReference')) {
            fieldDetail.put('referenceId', record.get(fieldApiName));

            // For these direct reference fields, determine the object type
            List<Schema.SObjectType> targetTypes = fieldDescribe.getReferenceTo();
            if (targetTypes != null && !targetTypes.isEmpty()) {
              fieldDetail.put(
                'referenceToObject',
                targetTypes[0].getDescribe().getName()
              );
            } else {
              // Try to determine object type from ID
              String objectTypeFromId = getObjectTypeFromId(
                String.valueOf(record.get(fieldApiName))
              );
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
        if (
          fieldValue instanceof String &&
          String.isBlank((String) fieldValue) &&
          !isAlwaysIncludeField(fieldApiNameLower)
        ) {
          continue;
        }

        // Skip unnecessary boolean fields set to false
        if (
          fieldValue instanceof Boolean &&
          !(Boolean) fieldValue &&
          !isImportantBooleanField(fieldApiNameLower)
        ) {
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
      throw new AuraHandledException(
        'Failed to retrieve record details: ' + e.getMessage()
      );
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
  private static Boolean isSystemOrUnimportantField(
    String fieldName,
    String objectName
  ) {
    // Standard system fields to exclude for all objects
    Set<String> systemFields = new Set<String>{ 'isdeleted', 'systemmodstamp' };

    // Common prefix/suffix patterns for system or unimportant fields
    List<String> systemPrefixes = new List<String>{
      '_hd',
      '_feed',
      'jigsaw',
      'jigsawcompanyid'
    };

    // Extra patterns specific to User object to filter out the truly unimportant preference fields
    Set<String> userSpecificPatterns = new Set<String>{
      'wtshown',
      'suppressreminder',
      'stayintouch',
      'disablenotification'
    };

    // Important fields to preserve regardless of naming
    Set<String> importantFields = new Set<String>{
      'owner',
      'createdby',
      'lastmodifiedby',
      'user',
      'contact',
      'account',
      'manager',
      'name',
      'email',
      'phone',
      'address',
      'title',
      'department',
      'alias'
    };

    // Always preserve lookup fields
    if (fieldName.endsWith('id') && fieldName.length() > 2) {
      String possibleLookupField = fieldName.substring(
        0,
        fieldName.length() - 2
      );
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
      'name',
      'firstname',
      'lastname',
      'email',
      'phone',
      'title',
      'department',
      'division',
      'status',
      'stage',
      'account',
      'contact',
      'owner',
      'user',
      'manager',
      'createdby',
      'lastmodifiedby',
      'alias',
      'active',
      'username'
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
      'active',
      'isactive',
      'primary',
      'isprimary',
      'default',
      'isdefault',
      'main',
      'ismain',
      'closed',
      'isclosed',
      'partner',
      'ispartner'
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
  private static String buildBaseQuery(
    String objectApiName,
    List<String> fields
  ) {
    return 'SELECT ' + String.join(fields, ', ') + ' FROM ' + objectApiName;
  }

  /**
   * Build the WHERE clause combining filters, search, record type filter, and created by me filter
   */
  private static String buildWhereClause(
    String objectApiName,
    String filtersJson,
    String searchTerm,
    List<String> fields,
    String recordTypeNameFilter,
    Boolean showOnlyCreatedByMe
  ) {
    List<String> conditions = new List<String>();

    // Add "created by me" filter condition
    if (showOnlyCreatedByMe != null && showOnlyCreatedByMe) {
      conditions.add('CreatedById = \'' + UserInfo.getUserId() + '\'');
    }

    // Add record type name filter condition
    if (String.isNotBlank(recordTypeNameFilter)) {
      String recordTypeCondition = buildRecordTypeCondition(
        objectApiName,
        recordTypeNameFilter
      );
      if (String.isNotBlank(recordTypeCondition)) {
        conditions.add(recordTypeCondition);
      }
    }

    // Add conditions from filter criteria
    if (String.isNotBlank(filtersJson)) {
      try {
        List<Filter> filters = (List<Filter>) JSON.deserialize(
          filtersJson,
          List<Filter>.class
        );

        if (filters != null && !filters.isEmpty()) {
          for (Filter filter : filters) {
            if (
              String.isNotBlank(filter.field) &&
              isValidFieldName(objectApiName, filter.field)
            ) {
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

    // Add hardcoded filter to exclude TEMP - File Upload Case records
    if (objectApiName == 'Case') {
      conditions.add('Subject != \'TEMP - File Upload Case\'');
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
            Schema.SObjectType objectType = Schema.getGlobalDescribe()
              .get(objectApiName);
            Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe()
              .fields.getMap();
            Schema.DescribeFieldResult fieldDescribe = fieldMap.get(
                field.toLowerCase()
              )
              .getDescribe();
            Schema.DisplayType fieldType = fieldDescribe.getType();

            // Build appropriate search conditions based on field type
            if (
              fieldType == Schema.DisplayType.STRING ||
              fieldType == Schema.DisplayType.TEXTAREA ||
              fieldType == Schema.DisplayType.PICKLIST ||
              fieldType == Schema.DisplayType.MULTIPICKLIST ||
              fieldType == Schema.DisplayType.PHONE ||
              fieldType == Schema.DisplayType.EMAIL ||
              fieldType == Schema.DisplayType.URL
            ) {
              // Text-based search with LIKE
              searchConditions.add(
                field +
                  ' LIKE \'%' +
                  String.escapeSingleQuotes(searchTerm) +
                  '%\''
              );
            } else if (
              fieldType == Schema.DisplayType.INTEGER ||
              fieldType == Schema.DisplayType.DOUBLE ||
              fieldType == Schema.DisplayType.CURRENCY ||
              fieldType == Schema.DisplayType.PERCENT
            ) {
              // Try to convert search term to a number for number fields
              try {
                Decimal searchNumber = Decimal.valueOf(searchTerm.trim());
                searchConditions.add(field + ' = ' + searchNumber);
              } catch (Exception e) {
                // Ignore if the search term can't be converted to a number
              }
            } else if (
              fieldType == Schema.DisplayType.DATE ||
              fieldType == Schema.DisplayType.DATETIME
            ) {
              // Try to convert search term to a date
              try {
                // Check if the search term might be a year
                if (searchTerm.length() == 4 && searchTerm.isNumeric()) {
                  Integer year = Integer.valueOf(searchTerm);
                  // Search by year
                  searchConditions.add(
                    'CALENDAR_YEAR(' + field + ') = ' + year
                  );
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
                    if (
                      (parts[0].length() == 4 && parts[0].isNumeric()) ||
                      (parts[2].length() == 4 && parts[2].isNumeric())
                    ) {
                      // Create date literal in format YYYY-MM-DD
                      String formattedDate;

                      // Handle YYYY-MM-DD format
                      if (parts[0].length() == 4 && parts[0].isNumeric()) {
                        formattedDate = datePattern;
                      }
                      // Handle MM-DD-YYYY format
                      else if (parts[2].length() == 4 && parts[2].isNumeric()) {
                        formattedDate =
                          parts[2] +
                          '-' +
                          parts[0] +
                          '-' +
                          parts[1];
                      }

                      searchConditions.add(field + ' = ' + formattedDate);
                    }
                  }

                  // Always add a LIKE search for flexible matching
                  searchConditions.add(
                    'STRING(' +
                      field +
                      ') LIKE \'%' +
                      String.escapeSingleQuotes(searchTerm) +
                      '%\''
                  );
                }
                // For month names or month numbers
                else if (searchTerm.isNumeric() && searchTerm.length() <= 2) {
                  Integer month = Integer.valueOf(searchTerm);
                  if (month >= 1 && month <= 12) {
                    searchConditions.add(
                      'CALENDAR_MONTH(' + field + ') = ' + month
                    );
                  }
                }
                // For day numbers
                else if (searchTerm.isNumeric() && searchTerm.length() <= 2) {
                  Integer day = Integer.valueOf(searchTerm);
                  if (day >= 1 && day <= 31) {
                    searchConditions.add(
                      'DAY_IN_MONTH(' + field + ') = ' + day
                    );
                  }
                }
                // Add a general string compare as a fallback
                else {
                  searchConditions.add(
                    'STRING(' +
                      field +
                      ') LIKE \'%' +
                      String.escapeSingleQuotes(searchTerm) +
                      '%\''
                  );
                }
              } catch (Exception e) {
                System.debug(
                  'Error processing date search term: ' + e.getMessage()
                );
                // Add a basic string search as a fallback
                searchConditions.add(
                  'STRING(' +
                    field +
                    ') LIKE \'%' +
                    String.escapeSingleQuotes(searchTerm) +
                    '%\''
                );
              }
            } else if (fieldType == Schema.DisplayType.BOOLEAN) {
              // Try to match boolean values
              if (
                searchTerm.equalsIgnoreCase('true') ||
                searchTerm.equalsIgnoreCase('yes')
              ) {
                searchConditions.add(field + ' = true');
              } else if (
                searchTerm.equalsIgnoreCase('false') ||
                searchTerm.equalsIgnoreCase('no')
              ) {
                searchConditions.add(field + ' = false');
              }
            }
            // Other field types are skipped for searching
          } catch (Exception e) {
            // If any error occurs while building a condition, just skip that field
            System.debug(
              'Error building search condition for field ' +
                field +
                ': ' +
                e.getMessage()
            );
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
  private static String buildOrderByClause(
    String objectApiName,
    String sortField,
    String sortDirection
  ) {
    if (
      String.isBlank(sortField) || !isValidFieldName(objectApiName, sortField)
    ) {
      return ' ORDER BY Id ASC';
    }

    String direction = 'ASC';
    if (
      String.isNotBlank(sortDirection) &&
      (sortDirection.equalsIgnoreCase('desc') ||
      sortDirection.equalsIgnoreCase('descending'))
    ) {
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
    if (
      filter == null ||
      String.isBlank(filter.field) ||
      String.isBlank(filter.operator)
    ) {
      return '';
    }

    String fieldName = String.escapeSingleQuotes(filter.field);
    String condition = '';
    String operatorLower = filter.operator.toLowerCase();

    switch on operatorLower {
      when 'equals' {
        if (String.isNotBlank(filter.value)) {
          condition =
            fieldName +
            ' = \'' +
            String.escapeSingleQuotes(filter.value) +
            '\'';
        }
      }
      when 'notequals' {
        if (String.isNotBlank(filter.value)) {
          condition =
            fieldName +
            ' != \'' +
            String.escapeSingleQuotes(filter.value) +
            '\'';
        }
      }
      when 'contains' {
        if (String.isNotBlank(filter.value)) {
          condition =
            fieldName +
            ' LIKE \'%' +
            String.escapeSingleQuotes(filter.value) +
            '%\'';
        }
      }
      when 'notcontains' {
        if (String.isNotBlank(filter.value)) {
          condition =
            'NOT ' +
            fieldName +
            ' LIKE \'%' +
            String.escapeSingleQuotes(filter.value) +
            '%\'';
        }
      }
      when 'startswith' {
        if (String.isNotBlank(filter.value)) {
          condition =
            fieldName +
            ' LIKE \'' +
            String.escapeSingleQuotes(filter.value) +
            '%\'';
        }
      }
      when 'endswith' {
        if (String.isNotBlank(filter.value)) {
          condition =
            fieldName +
            ' LIKE \'%' +
            String.escapeSingleQuotes(filter.value) +
            '\'';
        }
      }
      when 'greaterthan' {
        if (String.isNotBlank(filter.value)) {
          condition =
            fieldName +
            ' > ' +
            String.escapeSingleQuotes(filter.value);
        }
      }
      when 'lessthan' {
        if (String.isNotBlank(filter.value)) {
          condition =
            fieldName +
            ' < ' +
            String.escapeSingleQuotes(filter.value);
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
   * Build record type filter condition based on comma-separated record type names
   */
  private static String buildRecordTypeCondition(
    String objectApiName,
    String recordTypeNameFilter
  ) {
    if (String.isBlank(recordTypeNameFilter)) {
      return '';
    }

    try {
      // Check if the object has record types
      Schema.SObjectType objectType = Schema.getGlobalDescribe()
        .get(objectApiName);
      if (objectType == null) {
        return '';
      }

      Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe()
        .fields.getMap();
      if (!fieldMap.containsKey('recordtypeid')) {
        // Object doesn't have record types
        return '';
      }

      // Parse the comma-separated record type names
      List<String> recordTypeNames = new List<String>();
      for (String name : recordTypeNameFilter.split(',')) {
        String trimmedName = name.trim();
        if (String.isNotBlank(trimmedName)) {
          recordTypeNames.add(trimmedName);
        }
      }

      if (recordTypeNames.isEmpty()) {
        return '';
      }

      // Get record type IDs for the given names
      List<String> recordTypeIds = new List<String>();
      List<RecordType> recordTypes = [
        SELECT Id, Name, DeveloperName
        FROM RecordType
        WHERE SObjectType = :objectApiName AND IsActive = TRUE
      ];

      for (RecordType rt : recordTypes) {
        for (String searchName : recordTypeNames) {
          if (
            rt.Name.equalsIgnoreCase(searchName) ||
            rt.DeveloperName.equalsIgnoreCase(searchName)
          ) {
            recordTypeIds.add('\'' + rt.Id + '\'');
            break;
          }
        }
      }

      if (recordTypeIds.isEmpty()) {
        // No matching record types found - return condition that matches nothing
        return 'RecordTypeId = null AND RecordTypeId != null';
      }

      // Build the IN condition
      return 'RecordTypeId IN (' + String.join(recordTypeIds, ', ') + ')';
    } catch (Exception e) {
      System.debug('Error building record type condition: ' + e.getMessage());
      return '';
    }
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
   * Now handles relationship fields like Owner.Name, Account.Name, etc.
   */
  private static List<String> validateFields(
    String objectName,
    List<String> fields
  ) {
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

      Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe()
        .fields.getMap();

      for (String field : fields) {
        if (String.isBlank(field)) {
          continue;
        }

        // Check if this is a relationship field (contains a dot)
        if (field.contains('.')) {
          if (isValidRelationshipField(objectName, field, globalDescribe)) {
            validFields.add(field);
          }
        } else {
          // Regular field validation
          if (
            fieldMap.containsKey(field.toLowerCase()) &&
            fieldMap.get(field.toLowerCase()).getDescribe().isAccessible()
          ) {
            validFields.add(field);
          }
        }
      }
    } catch (Exception e) {
      System.debug('Error validating fields: ' + e.getMessage());
    }

    return validFields;
  }

  /**
   * Validate relationship fields like Owner.Name, Account.Name, etc.
   */
  private static Boolean isValidRelationshipField(
    String objectName,
    String relationshipField,
    Map<String, Schema.SObjectType> globalDescribe
  ) {
    try {
      String[] parts = relationshipField.split('\\.');
      if (parts.size() != 2) {
        return false; // Only support one level of relationship for now
      }

      String relationshipName = parts[0];
      String targetField = parts[1];

      Schema.SObjectType objectType = globalDescribe.get(objectName);
      if (objectType == null) {
        return false;
      }

      Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe()
        .fields.getMap();

      // Look for the relationship field (usually ends with Id)
      String relationshipFieldName = relationshipName.toLowerCase();
      if (!relationshipFieldName.endsWith('id')) {
        relationshipFieldName += 'id';
      }

      if (!fieldMap.containsKey(relationshipFieldName)) {
        return false;
      }

      Schema.DescribeFieldResult relationshipDescribe = fieldMap.get(
          relationshipFieldName
        )
        .getDescribe();

      // Check if it's a reference field
      if (relationshipDescribe.getType() != Schema.DisplayType.REFERENCE) {
        return false;
      }

      // Check if the user can access the relationship field
      if (!relationshipDescribe.isAccessible()) {
        return false;
      }

      // Get the referenced object(s)
      List<Schema.SObjectType> referenceTo = relationshipDescribe.getReferenceTo();
      if (referenceTo.isEmpty()) {
        return false;
      }

      // Check if the target field exists on any of the referenced objects
      for (Schema.SObjectType refType : referenceTo) {
        Map<String, Schema.SObjectField> refFieldMap = refType.getDescribe()
          .fields.getMap();
        if (
          refFieldMap.containsKey(targetField.toLowerCase()) &&
          refFieldMap.get(targetField.toLowerCase())
            .getDescribe()
            .isAccessible()
        ) {
          return true;
        }
      }

      return false;
    } catch (Exception e) {
      System.debug(
        'Error validating relationship field ' +
          relationshipField +
          ': ' +
          e.getMessage()
      );
      return false;
    }
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

      Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe()
        .fields.getMap();

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

      Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe()
        .fields.getMap();

      if (!fieldMap.containsKey(fieldName.toLowerCase())) {
        return false;
      }

      Schema.DescribeFieldResult fieldDescribe = fieldMap.get(
          fieldName.toLowerCase()
        )
        .getDescribe();
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
    } catch (Exception e) {
      return false;
    }
  }

  /**
   * Retrieves the related lists for a given object's default page layout.
   * This method respects sharing rules and field-level security.
   *
   * @param objectApiName The API name of the SObject (e.g., 'Account', 'Contact').
   * @param recordTypeId The ID of the record type to get the layout for. If null, the default layout is used.
   * @return A list of maps, where each map represents a related list with its name, label, and icon.
   */
  @AuraEnabled(cacheable=true)
  public static List<Map<String, Object>> getPageLayoutRelatedLists(
    String objectApiName,
    Id recordTypeId
  ) {
    List<Map<String, Object>> relatedLists = new List<Map<String, Object>>();

    if (String.isBlank(objectApiName) || !isValidObjectName(objectApiName)) {
      throw new AuraHandledException(
        'Invalid or inaccessible object API name.'
      );
    }

    try {
      // This is a simplified approach. A more robust solution might involve calling the UI API
      // from the LWC or making a more complex Apex callout to the REST API.
      // For now, we'll use Schema describes to get all child relationships, which is a good approximation.

      Map<String, SObjectType> gd = Schema.getGlobalDescribe();
      SObjectType sobjType = gd.get(objectApiName);
      DescribeSObjectResult describeResult = sobjType.getDescribe();

      for (ChildRelationship cr : describeResult.getChildRelationships()) {
        DescribeSObjectResult childDescribe = cr.getChildSObject()
          .getDescribe();
        String relationshipName = cr.getRelationshipName();

        // Only include related lists for objects the user can access AND that have __r in the relationship name
        if (
          childDescribe.isAccessible() &&
          childDescribe.isQueryable() &&
          relationshipName != null &&
          relationshipName.contains('__r')
        ) {
          Map<String, Object> listInfo = new Map<String, Object>();
          listInfo.put('relationshipName', relationshipName);
          listInfo.put('label', childDescribe.getLabelPlural());
          listInfo.put('objectApiName', childDescribe.getName());

          // Simplified icon logic for demonstration
          listInfo.put(
            'icon',
            'standard:' + String.valueOf(cr.getChildSObject()).toLowerCase()
          );
          System.debug('*** Adding related list: ' + listInfo);
          relatedLists.add(listInfo);
        }
      }
    } catch (Exception e) {
      throw new AuraHandledException(
        'Error fetching page layout related lists: ' + e.getMessage()
      );
    }

    return relatedLists;
  }

  /**
   * Retrieves the available Quick Actions for a given object, including flows.
   * This discovers actual Quick Actions configured for the object.
   *
   * @param actionNames List of action names to look for (can include flows)
   * @param recordId The ID of the record for which to get actions
   * @return A list of maps, where each map contains the action's name, label, and type
   */
  @AuraEnabled(cacheable=true)
  public static List<Map<String, Object>> getObjectActions(
    List<String> actionNames,
    String recordId
  ) {
    List<Map<String, Object>> availableActions = new List<Map<String, Object>>();

    if (actionNames == null || actionNames.isEmpty()) {
      return availableActions;
    }

    try {
      // Get the object API name from the record ID
      String objectApiName = null;
      if (recordId != null) {
        try {
          Id recordIdObj = Id.valueOf(recordId);
          objectApiName = recordIdObj.getSObjectType().getDescribe().getName();
          System.debug(
            'Determined object API name: ' +
              objectApiName +
              ' from record ID: ' +
              recordId
          );
        } catch (Exception idException) {
          System.debug(
            'Error getting object type from record ID ' +
              recordId +
              ': ' +
              idException.getMessage()
          );
          // Continue without the object API name - the method can still work
        }
      }

      // Get available quick actions using the Quick Action describe
      // Only proceed if we have a valid record ID
      List<QuickAction.DescribeAvailableQuickActionResult> allQuickActions = new List<QuickAction.DescribeAvailableQuickActionResult>();

      // Primary approach: Use object API name (more reliable for custom objects)
      if (objectApiName != null) {
        try {
          allQuickActions = QuickAction.DescribeAvailableQuickActions(
            objectApiName
          );
        } catch (Exception objException) {
          System.debug(
            'Error calling DescribeAvailableQuickActions with object API name ' +
              objectApiName +
              ': ' +
              objException.getMessage()
          );

          // Fallback: Try with record ID if object API name fails
          if (recordId != null && recordId.length() >= 15) {
            try {
              allQuickActions = QuickAction.DescribeAvailableQuickActions(
                recordId
              );
              System.debug(
                'Successfully retrieved quick actions using record ID fallback: ' +
                recordId
              );
            } catch (Exception recException) {
              System.debug(
                'Both object API name and record ID approaches failed. Continuing with standard actions only.'
              );
            }
          }
        }
      } else if (recordId != null && recordId.length() >= 15) {
        // If no object API name available, try record ID directly
        try {
          allQuickActions = QuickAction.DescribeAvailableQuickActions(recordId);
          System.debug(
            'Successfully retrieved quick actions using record ID: ' + recordId
          );
        } catch (Exception qaException) {
          System.debug(
            'Error calling DescribeAvailableQuickActions for record ID ' +
              recordId +
              ': ' +
              qaException.getMessage()
          );
        }
      } else {
        System.debug(
          'No valid object API name or record ID available for QuickAction discovery'
        );
      }

      Set<String> processedActionNames = new Set<String>();

      if (allQuickActions != null && !allQuickActions.isEmpty()) {
        for (
          QuickAction.DescribeAvailableQuickActionResult actionResult : allQuickActions
        ) {
          String actionName = actionResult.getName();

          String shortActionName = actionName.contains('.')
            ? actionName.substringAfter('.')
            : actionName;

          // Check if this action was requested (either full name or short name) and hasn't been processed yet
          Boolean isRequested =
            actionNames.contains(actionName) ||
            actionNames.contains(shortActionName);
          Boolean notProcessed =
            !processedActionNames.contains(actionName.toLowerCase()) &&
            !processedActionNames.contains(shortActionName.toLowerCase());

          if (isRequested && notProcessed) {
            Map<String, Object> actionInfo = new Map<String, Object>();
            String actionType = actionResult.getType();

            // Use the short name for display and flow API name, but keep full name for reference
            actionInfo.put('name', shortActionName);
            actionInfo.put('label', actionResult.getLabel());
            actionInfo.put('type', actionType);
            actionInfo.put('fullName', actionName); // Keep the full name for reference

            // Set appropriate icon based on action type
            if (actionType == 'Flow') {
              actionInfo.put('icon', 'standard:flow');
              // For flow actions, we need to determine the actual flow API name
              // The QuickAction API doesn't provide this, so we'll use a mapping approach
              String actualFlowApiName = getFlowApiNameForQuickAction(
                shortActionName,
                objectApiName
              );
              actionInfo.put('flowApiName', actualFlowApiName);
            } else if (actionType == 'Update') {
              actionInfo.put('icon', 'standard:edit');
            } else if (actionType == 'Create') {
              actionInfo.put('icon', 'standard:add');
            } else {
              actionInfo.put('icon', 'standard:quick_text');
            }

            availableActions.add(actionInfo);
            processedActionNames.add(actionName.toLowerCase());
            processedActionNames.add(shortActionName.toLowerCase());
          }
        }
      }

      // Add standard actions that weren't found as quick actions
      Map<String, Map<String, Object>> standardActions = new Map<String, Map<String, Object>>{
        'New' => new Map<String, Object>{
          'name' => 'New',
          'label' => 'New',
          'type' => 'Standard',
          'icon' => 'standard:add'
        },
        'Edit' => new Map<String, Object>{
          'name' => 'Edit',
          'label' => 'Edit',
          'type' => 'Standard',
          'icon' => 'standard:edit'
        },
        'Delete' => new Map<String, Object>{
          'name' => 'Delete',
          'label' => 'Delete',
          'type' => 'Standard',
          'icon' => 'standard:delete'
        }
      };

      for (String actionName : actionNames) {
        if (
          standardActions.containsKey(actionName) &&
          !processedActionNames.contains(actionName.toLowerCase())
        ) {
          availableActions.add(standardActions.get(actionName));
          processedActionNames.add(actionName.toLowerCase());
        }
      }
    } catch (Exception e) {
      System.debug('Error retrieving quick actions: ' + e.getMessage());
      // Fall back to standard actions only
      Map<String, Map<String, Object>> standardActions = new Map<String, Map<String, Object>>{
        'New' => new Map<String, Object>{
          'name' => 'New',
          'label' => 'New',
          'type' => 'Standard',
          'icon' => 'standard:add'
        },
        'Edit' => new Map<String, Object>{
          'name' => 'Edit',
          'label' => 'Edit',
          'type' => 'Standard',
          'icon' => 'standard:edit'
        },
        'Delete' => new Map<String, Object>{
          'name' => 'Delete',
          'label' => 'Delete',
          'type' => 'Standard',
          'icon' => 'standard:delete'
        }
      };

      for (String actionName : actionNames) {
        if (standardActions.containsKey(actionName)) {
          availableActions.add(standardActions.get(actionName));
        }
      }
    }
    return availableActions;
  }

  /**
   * Discover all available Quick Actions (including flows) for an object
   * This method can be used to see what actions are available for configuration
   *
   * @param objectApiName The API name of the object
   * @param recordId Optional record ID to get actions for a specific record
   * @return A list of all available quick actions for the object
   */
  @AuraEnabled(cacheable=true)
  public static List<Map<String, Object>> discoverObjectActions(
    String objectApiName,
    String recordId
  ) {
    List<Map<String, Object>> discoveredActions = new List<Map<String, Object>>();

    try {
      if (String.isBlank(objectApiName)) {
        return discoveredActions;
      }

      // If no record ID provided, we need to create a temporary one for the describe call
      // This is a limitation of the Quick Action API
      Id tempRecordId = recordId;
      if (String.isBlank(recordId)) {
        // Try to find any existing record of this object type
        String query =
          'SELECT Id FROM ' +
          String.escapeSingleQuotes(objectApiName) +
          ' LIMIT 1';
        List<SObject> existingRecords = Database.query(query);
        if (!existingRecords.isEmpty()) {
          tempRecordId = existingRecords[0].Id;
        }
      }

      if (tempRecordId != null) {
        // Get all available quick actions for this record/object
        List<QuickAction.DescribeAvailableQuickActionResult> allQuickActions = QuickAction.DescribeAvailableQuickActions(
          tempRecordId
        );

        if (allQuickActions != null && !allQuickActions.isEmpty()) {
          for (
            QuickAction.DescribeAvailableQuickActionResult actionResult : allQuickActions
          ) {
            Map<String, Object> actionInfo = new Map<String, Object>();
            String actionType = actionResult.getType();

            actionInfo.put('name', actionResult.getName());
            actionInfo.put('label', actionResult.getLabel());
            actionInfo.put('type', actionType);
            actionInfo.put('isFlow', actionType == 'Flow');

            // Set appropriate icon based on action type
            if (actionType == 'Flow') {
              actionInfo.put('icon', 'standard:flow');
            } else if (actionType == 'Update') {
              actionInfo.put('icon', 'standard:edit');
            } else if (actionType == 'Create') {
              actionInfo.put('icon', 'standard:add');
            } else {
              actionInfo.put('icon', 'standard:quick_text');
            }

            discoveredActions.add(actionInfo);
          }
        }
      }
    } catch (Exception e) {
      System.debug('Error discovering object actions: ' + e.getMessage());
    }

    return discoveredActions;
  }

  private static String getFlowApiNameForQuickAction(
    String quickActionName,
    String objectApiName
  ) {
    try {
      // Try to get the flow name from the QuickAction describe result
      // We'll use the getActionEnumOrId() method which might contain flow information

      // First, let's try to describe the specific quick action
      List<QuickAction.DescribeAvailableQuickActionResult> allQuickActions = QuickAction.DescribeAvailableQuickActions(
        objectApiName
      );

      if (allQuickActions != null && !allQuickActions.isEmpty()) {
        for (
          QuickAction.DescribeAvailableQuickActionResult actionResult : allQuickActions
        ) {
          String actionName = actionResult.getName();
          String shortActionName = actionName.contains('.')
            ? actionName.substringAfter('.')
            : actionName;
          String actionType = actionResult.getType();

          // Check if this is the action we're looking for
          if (shortActionName.equals(quickActionName) && actionType == 'Flow') {
            // Try to extract flow name from the action enum or ID
            String actionEnumOrId = actionResult.getActionEnumOrId();

            // Try a mapping approach for known Quick Action -> Flow combinations
            String mappedFlowName = getFlowNameFromMapping(
              shortActionName,
              objectApiName
            );
            if (mappedFlowName != null) {
              return mappedFlowName;
            }

            if (isValidFlowName(shortActionName)) {
              return shortActionName;
            }

            break;
          }
        }
      }
    } catch (Exception e) {
      System.debug(
        '💥 Error getting flow API name for Quick Action: ' + e.getMessage()
      );
      System.debug('💥 Stack trace: ' + e.getStackTraceString());
    }

    // Fallback to the action name if we can't find the flow
    return quickActionName;
  }

  /**
   * Helper method to map Quick Action names to their corresponding Flow API names
   * This is a workaround since the runtime API doesn't expose the flow name directly
   */
  private static String getFlowNameFromMapping(
    String quickActionName,
    String objectApiName
  ) {
    if (String.isBlank(quickActionName)) {
      return null;
    }

    // Create a mapping of known Quick Action names to Flow API names
    // This needs to be maintained manually based on your org's configuration
    Map<String, String> quickActionToFlowMap = new Map<String, String>{
      'Apply' => 'SFL_ViewPostingPositions'
    };

    // Check if we have a mapping for this action
    if (quickActionToFlowMap.containsKey(quickActionName)) {
      String flowApiName = quickActionToFlowMap.get(quickActionName);

      // Validate that the mapped flow actually exists
      if (isValidFlowName(flowApiName)) {
        return flowApiName;
      } else {
        System.debug(
          '⚠️ Mapped flow "' + flowApiName + '" does not exist or is not active'
        );
      }
    }

    return null;
  }

  /**
   * Helper method to validate if a given name is a valid flow API name
   */
  private static Boolean isValidFlowName(String flowName) {
    if (String.isBlank(flowName)) {
      return false;
    }

    try {
      // Query FlowDefinitionView to check if the flow exists
      List<FlowDefinitionView> flows = [
        SELECT Id, ApiName
        FROM FlowDefinitionView
        WHERE ApiName = :flowName AND IsActive = TRUE
        LIMIT 1
      ];

      return !flows.isEmpty();
    } catch (Exception e) {
      System.debug(
        'Error validating flow name ' + flowName + ': ' + e.getMessage()
      );
      return false;
    }
  }
}
