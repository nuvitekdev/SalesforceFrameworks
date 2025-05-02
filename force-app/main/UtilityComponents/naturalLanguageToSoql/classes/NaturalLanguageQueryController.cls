/**
 * @description Controller class for the Natural Language to SOQL component
 * Uses an LLM to convert natural language queries to SOQL potentially spanning multiple configured objects.
 * Runs 'without sharing' to allow queries based on natural language intent to return records
 * the user might not directly own or have explicit sharing access to, mimicking a broader data exploration capability.
 * Field-level security IS still checked when gathering metadata to build the LLM prompt,
 * preventing the AI from knowing about or using fields the user cannot access.
 * @author Nuvitek
 */
public without sharing class NaturalLanguageQueryController {
    
    /**
     * @description Retrieves object information
     * @param objectApiName The API name of the object
     * @return Map<String, Object> Map containing object information like label, fields, etc.
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getObjectInfo(String objectApiName) {
        Map<String, Object> result = new Map<String, Object>();
        
        try {
            // Validate objectApiName is not null or empty
            if (String.isBlank(objectApiName)) {
                throw new AuraHandledException('Object API Name is required');
            }
            
            // Check if the object exists in schema
            Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
            if (!globalDescribe.containsKey(objectApiName)) {
                throw new AuraHandledException('Object not found: ' + objectApiName);
            }
            
            // Get object describe
            Schema.DescribeSObjectResult objDescribe = globalDescribe.get(objectApiName).getDescribe();
            
            // Get basic object info
            result.put('apiName', objectApiName);
            result.put('label', objDescribe.getLabel());
            result.put('labelPlural', objDescribe.getLabelPlural());
            result.put('keyPrefix', objDescribe.getKeyPrefix());
            
            // Get accessible fields
            Map<String, Schema.SObjectField> fieldMap = objDescribe.fields.getMap();
            List<Map<String, Object>> fieldsInfo = new List<Map<String, Object>>();
            
            for (String fieldName : fieldMap.keySet()) {
                Schema.DescribeFieldResult fieldDescribe = fieldMap.get(fieldName).getDescribe();
                
                // Only include accessible fields
                if (fieldDescribe.isAccessible()) {
                    Map<String, Object> fieldInfo = new Map<String, Object>{
                        'apiName' => fieldName,
                        'label' => fieldDescribe.getLabel(),
                        'type' => fieldDescribe.getType().name(),
                        'isFilterable' => fieldDescribe.isFilterable(),
                        'isSortable' => fieldDescribe.isSortable()
                    };
                    
                    fieldsInfo.add(fieldInfo);
                }
            }
            
            result.put('fields', fieldsInfo);
            
            return result;
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving object info: ' + e.getMessage());
        }
    }
    
    /**
     * @description Processes a natural language query using an LLM to generate and execute SOQL.
     * Attempts to query across multiple specified objects if configured.
     * @param naturalLanguageQuery The natural language query from the user.
     * @param objectApiNamesCSV A comma-separated string of object API names to consider.
     * @param recordLimit Maximum number of records to return.
     * @param llmConfigName The Developer Name of the LLM Configuration to use.
     * @return Map<String, Object> Map containing the generated SOQL, query results, and column definitions.
     */
    @AuraEnabled
    public static Map<String, Object> processQuery(String naturalLanguageQuery, String objectApiNamesCSV, Integer recordLimit, String llmConfigName) {
        Map<String, Object> result = new Map<String, Object>();
        Map<String, Schema.SObjectField> combinedFieldMap = new Map<String, Schema.SObjectField>();
        List<String> allAccessibleFieldApiNames = new List<String>();
        String fieldDetailsForPrompt = '';
        String generatedSoql = '';
        List<SObject> queryResults = new List<SObject>();
        List<Map<String, Object>> columns = new List<Map<String, Object>>();
        LLM_Configuration__mdt llmConfig;
        List<String> objectNames = new List<String>();
        String primaryObjectName = ''; // The object the final query will primarily target

        try {
            // -----------------------------------------------------------------
            // 1. Input Validation & Setup
            // -----------------------------------------------------------------
            if (String.isBlank(naturalLanguageQuery)) {
                throw new AuraHandledException('Please provide a natural language query.');
            }
            if (String.isBlank(objectApiNamesCSV)) {
                throw new AuraHandledException('Please specify at least one object API name in the configuration.');
            }
             // Use provided llmConfigName or default if blank
            String configNameToUse = String.isNotBlank(llmConfigName) ? llmConfigName : 'OpenAI_GPT4_1_Mini';
            System.debug('Using LLM Configuration: ' + configNameToUse);
            
            // Parse and validate object names
            for(String name : objectApiNamesCSV.split(',')){
                String trimmedName = name.trim();
                if(String.isNotBlank(trimmedName)){
                    objectNames.add(trimmedName);
                }
            }
            if (objectNames.isEmpty()) {
                 throw new AuraHandledException('No valid object API names provided in the configuration.');
            }
            
            recordLimit = (recordLimit == null || recordLimit <= 0) ? 50 : Math.min(recordLimit, 200);
            System.debug('Processing query for objects: ' + String.join(objectNames, ', ') + ', Limit: ' + recordLimit);

            // -----------------------------------------------------------------
            // 2. Get Combined Metadata for All Specified Objects
            // -----------------------------------------------------------------
            try {
                Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
                for(String objName : objectNames) {
                    if (!globalDescribe.containsKey(objName)) {
                         System.debug('Warning: Specified object not found or inaccessible, skipping: ' + objName);
                         continue; // Skip invalid/inaccessible objects
                    }
                    Schema.SObjectType objType = globalDescribe.get(objName);
                    Schema.DescribeSObjectResult objDescribe = objType.getDescribe();
                    Map<String, Schema.SObjectField> currentFieldMap = objDescribe.fields.getMap();
                    
                    // Add accessible fields from this object to combined list and prompt details
                    for (String fieldName : currentFieldMap.keySet()) {
                        Schema.SObjectField field = currentFieldMap.get(fieldName);
                        if (field != null) {
                            Schema.DescribeFieldResult fieldDescribe = field.getDescribe();
                            if (fieldDescribe.isAccessible()) {
                                // Store with object prefix for uniqueness and clarity for LLM
                                String prefixedFieldName = objName + '.' + fieldName;
                                allAccessibleFieldApiNames.add(prefixedFieldName);
                                combinedFieldMap.put(prefixedFieldName, field);
                                // Format for prompt: Object.API_Name (Label) - Type
                                fieldDetailsForPrompt += prefixedFieldName + ' (' + fieldDescribe.getLabel() + ') - Type: ' + fieldDescribe.getType() + '\n';
                            }
                        }
                    }
                }
                
                if (combinedFieldMap.isEmpty()) {
                     throw new AuraHandledException('No accessible fields found for any of the specified objects: ' + String.join(objectNames, ', '));
                }
                System.debug('Found ' + combinedFieldMap.size() + ' total accessible fields across specified objects.');
                
            } catch (Exception e) {
                System.debug('Error getting combined object metadata: ' + e.getMessage());
                throw new AuraHandledException('Error accessing object metadata for specified objects: ' + e.getMessage());
            }

            // -----------------------------------------------------------------
            // 3. Prepare and Call LLM for SOQL Generation (Multi-Object Aware)
            // -----------------------------------------------------------------
            try {
                // Retrieve the LLM configuration using the provided or default name
                llmConfig = getLLMConfig(configNameToUse);

                // Updated system instructions for multi-object context
                String systemInstructions = 
                    'You are an expert Salesforce SOQL generator. Your task is to generate a SINGLE, valid SOQL query based on a natural language request and metadata from one or more Salesforce objects.\n' + 
                    'RULES:\n' + 
                    '1. Identify the PRIMARY object the user seems interested in from their query and the provided object list.\n' + 
                    '2. Construct a SOQL query starting with \'SELECT ... FROM PrimaryObject ...\'.\n' + 
                    '3. Use the FIELDS PROVIDED in the list. Fields are prefixed with their Object Name (e.g., Account.Name, Contact.Email). Use this relationship syntax in your query where appropriate (e.g., SELECT Id, Name, Account.Name FROM Contact...).\n' + 
                    '4. ONLY use fields and relationships implicitly available from the provided field list. Do NOT hallucinate fields or relationships.\n' + 
                    '5. Ensure the generated query respects the Required Record Limit.\n' + 
                    '6. Apply filtering (WHERE), sorting (ORDER BY), and aggregation based on the natural language query, using correct SOQL syntax and the prefixed field names.\n' + 
                    '7. ***IMPORTANT: Always include the \'Id\' field of the primary object (the one in the FROM clause) in the SELECT statement.***\n' +
                    '8. ONLY return the raw SOQL query string. No explanations, apologies, or markdown formatting.\n' +
                    '9. If the query cannot be reasonably answered with a single query based on the primary object and provided fields/relationships, return the text \'ERROR: Cannot form a single query for this request.\'\n' +
                    '10. CRITICAL: Use only valid Salesforce SOQL functions for date operations:\n' +
                    '   - For date literals use: TODAY, YESTERDAY, TOMORROW, LAST_WEEK, THIS_WEEK, NEXT_WEEK, etc.\n' +
                    '   - For date functions in WHERE conditions, use: DAY_ONLY(), CALENDAR_YEAR(), CALENDAR_QUARTER(), DAY_IN_MONTH(), etc.\n' +
                    '   - For month comparisons, use: CALENDAR_MONTH(date) = 1 (for January)\n' +
                    '   - For current month filtering, use: CALENDAR_MONTH(fieldName) = CALENDAR_MONTH(TODAY)\n' +
                    '   - Date functions can only be used properly in GROUP BY clauses or WHERE clauses with proper syntax\n' +
                    '   - Examples of correct date syntax: \n' +
                    '     * WHERE Birthdate = THIS_MONTH \n' +
                    '     * WHERE CALENDAR_YEAR(CreatedDate) = 2023 \n' +
                    '     * WHERE DAY_IN_MONTH(fieldName) = 15\n' +
                    '11. BIRTHDAY QUERIES: For finding birthdays in the current month, use:\n' +
                    '    - WHERE Birthdate != NULL AND Birthdate = THIS_MONTH\n' +
                    '    - Do NOT use: CALENDAR_MONTH(Birthdate) = CALENDAR_MONTH(TODAY) in WHERE clauses\n' +
                    '    - Example for contacts with birthdays this month: SELECT Id, Name, Birthdate FROM Contact WHERE Birthdate != NULL AND Birthdate = THIS_MONTH ORDER BY DAY_IN_MONTH(Birthdate) ASC';

                // Construct the prompt for the LLM
                String llmPrompt = 
                    'Natural Language Query: "' + naturalLanguageQuery + '"\n\n' + 
                    'Available Salesforce Objects: ' + String.join(objectNames, ', ') + '\n\n' + 
                    'Available Fields (ObjectName.ApiName (Label) - Type):\n' + fieldDetailsForPrompt + '\n' + 
                    'Required Record Limit: ' + recordLimit + '\n\n' + 
                    'Generate the SOQL query:';
                
                System.debug('Sending multi-object prompt to LLM. Length: ' + llmPrompt.length());
                generatedSoql = makeLLMCall(llmConfig, llmPrompt, systemInstructions);
                System.debug('Raw SOQL received from LLM: ' + generatedSoql);

                // Check if LLM returned an error message
                if (String.isNotBlank(generatedSoql) && generatedSoql.startsWith('ERROR:')) {
                    throw new AuraHandledException('The AI could not generate a query for your request: ' + generatedSoql.removeStart('ERROR: ').trim());
                }
                
                // Basic cleanup
                generatedSoql = generatedSoql.trim().removeStart('```sql\n').removeEnd('\n```').trim();
                generatedSoql = generatedSoql.trim().removeStart('```soql\n').removeEnd('\n```').trim();
                generatedSoql = generatedSoql.trim().removeStart('```').removeEnd('```').trim();
                System.debug('Cleaned SOQL from LLM: ' + generatedSoql);

            } catch (AuraHandledException e) {
                throw e; // Re-throw specific errors from LLM
            } catch (Exception e) {
                System.debug('Error during LLM call or config retrieval: ' + e.getMessage());
                throw new AuraHandledException('Error communicating with the AI service: ' + e.getMessage());
            }

            // ---- Retry Loop for SOQL Validation and Execution ----
            Integer maxRetries = 5; // Increased from 3 to 5
            Integer retryCount = 0;
            Boolean queryExecutedSuccessfully = false;
            String lastError = 'Unknown validation or execution error.'; // Default error

            while (retryCount < maxRetries && !queryExecutedSuccessfully) {
                String attemptSoql = generatedSoql; // Use the latest version for this attempt
                System.debug('--- SOQL Execution Attempt #' + (retryCount + 1) + ' ---');
                System.debug('Using SOQL for this attempt: ' + attemptSoql); // Log the query being attempted
                
                try {
                    // -----------------------------------------------------------------
                    // 4. Validate the Generated SOQL (inside loop)
                    // -----------------------------------------------------------------
                    primaryObjectName = extractPrimaryObjectFromSOQL(attemptSoql, objectNames);
                    if (String.isBlank(primaryObjectName)) {
                        throw new AuraHandledException('AI query does not target one of the specified objects (' + String.join(objectNames, ',') + ').');
                    }
                    System.debug('Attempt #' + (retryCount + 1) + ' - Primary object: ' + primaryObjectName);
                    
                    validateGeneratedSOQL(attemptSoql, primaryObjectName, objectNames, recordLimit, allAccessibleFieldApiNames);
                    attemptSoql = ensureQueryLimit(attemptSoql, recordLimit); // Ensure limit on each attempt
                    System.debug('Attempt #' + (retryCount + 1) + ' - Validated & Limited SOQL: ' + attemptSoql);

                    // -----------------------------------------------------------------
                    // 5. Execute Query (inside loop)
                    // -----------------------------------------------------------------
                    queryResults = Database.query(attemptSoql);
                    generatedSoql = attemptSoql; // Store the successfully executed query
                    queryExecutedSuccessfully = true; // Mark success to exit loop
                    System.debug('Attempt #' + (retryCount + 1) + ' - SOQL executed successfully. Records: ' + queryResults.size());

                } catch (QueryException qe) {
                    retryCount++;
                    lastError = 'Error executing SOQL: ' + qe.getMessage() + '. Query: [' + attemptSoql + ']';
                    System.debug('Attempt #' + retryCount + ' failed (QueryException): ' + lastError);
                    if (retryCount >= maxRetries) break; // Exit loop if max retries reached

                    // Ask LLM to fix the query
                    System.debug('Asking LLM to fix the query due to QueryException.');
                    String fixPrompt = 
                        'The following Salesforce SOQL query failed execution:\n' + attemptSoql + '\n\n' + 
                        'Error Message: ' + qe.getMessage() + '\n\n' + 
                        'Original User Request: "' + naturalLanguageQuery + '"\n\n' + 
                        'Available Objects: ' + String.join(objectNames, ', ') + '\n' + 
                        'Available Fields list was previously provided.\n\n' +
                        'IMPORTANT REMINDER: Use only valid Salesforce SOQL syntax. Specifically for date operations:\n' +
                        '- Use date literals like TODAY, THIS_MONTH, NEXT_N_DAYS:7\n' +
                        '- For date functions, be careful with proper syntax in WHERE clauses\n' +
                        '- For month comparisons, use: CALENDAR_MONTH(date) = 1 (for January)\n' +
                        '- For current month: WHERE Birthdate = THIS_MONTH\n\n' +
                        'Please rewrite the SOQL query to fix the error while still fulfilling the original user request. Ensure it is valid Salesforce SOQL. Only return the corrected SOQL string.';
                    
                    String fixInstructions = 'You are a Salesforce SOQL expert correcting a previously failed query based on an error message. Return only the raw, corrected SOQL string. Ensure you use valid Salesforce date functions and proper SOQL syntax.';
                    generatedSoql = makeLLMCall(llmConfig, fixPrompt, fixInstructions);
                    generatedSoql = generatedSoql.trim().removeStart('```sql\n').removeEnd('\n```').trim();
                    generatedSoql = generatedSoql.trim().removeStart('```soql\n').removeEnd('\n```').trim();
                    generatedSoql = generatedSoql.trim().removeStart('```').removeEnd('```').trim();
                    System.debug('LLM proposed fix (Attempt #' + (retryCount + 1) + '): ' + generatedSoql);

                } catch (AuraHandledException ahe) {
                    // Catch validation errors or other handled exceptions
                     retryCount++;
                     lastError = 'Validation or processing error: ' + ahe.getMessage() + '. Query: [' + attemptSoql + ']';
                     System.debug('Attempt #' + retryCount + ' failed (AuraHandledException): ' + lastError);
                     if (retryCount >= maxRetries) break; // Exit loop if max retries reached

                     // Ask LLM to fix the query based on this error
                     System.debug('Asking LLM to fix the query due to AuraHandledException.');
                     String fixPrompt = 
                        'The following Salesforce SOQL query failed validation or processing:\n' + attemptSoql + '\n\n' + 
                        'Error Message: ' + ahe.getMessage() + '\n\n' + 
                        'Original User Request: "' + naturalLanguageQuery + '"\n\n' + 
                        'Available Objects: ' + String.join(objectNames, ', ') + '\n' + 
                        'Available Fields list was previously provided.\n\n' +
                        'IMPORTANT REMINDER: Use only valid Salesforce SOQL syntax. Specifically for date operations:\n' +
                        '- Use date literals like TODAY, THIS_MONTH, NEXT_N_DAYS:7\n' +
                        '- For date functions, be careful with proper syntax in WHERE clauses\n' +
                        '- For current month comparisons, use WHERE Birthdate = THIS_MONTH\n' +
                        '- Avoid complex date functions in WHERE conditions unless using proper syntax\n\n' +
                        'Please rewrite the SOQL query to fix the error while still fulfilling the original user request. Ensure it is valid Salesforce SOQL and respects validation rules (e.g., correct object, accessible fields). Only return the corrected SOQL string.';
                    
                    String fixInstructions = 'You are a Salesforce SOQL expert correcting a previously failed query based on an error message. Return only the raw, corrected SOQL string. Ensure you use valid Salesforce date functions and proper SOQL syntax.';
                    generatedSoql = makeLLMCall(llmConfig, fixPrompt, fixInstructions);
                    generatedSoql = generatedSoql.trim().removeStart('```sql\n').removeEnd('\n```').trim();
                    generatedSoql = generatedSoql.trim().removeStart('```soql\n').removeEnd('\n```').trim();
                    generatedSoql = generatedSoql.trim().removeStart('```').removeEnd('```').trim();
                    System.debug('LLM proposed fix (Attempt #' + (retryCount + 1) + '): ' + generatedSoql);

                } catch (Exception e) {
                    // Catch unexpected errors during validation/execution attempt
                    System.debug('Unexpected error during SOQL attempt #' + (retryCount + 1) + ': ' + e.getMessage());
                    lastError = 'Unexpected error during SOQL execution: ' + e.getMessage();
                    // Don't retry on unexpected system errors, throw immediately
                    throw new AuraHandledException(lastError);
                }
            } // End While Loop

            // Check if loop finished without success
            if (!queryExecutedSuccessfully) {
                 System.debug('Query execution failed after ' + maxRetries + ' attempts.');
                 throw new AuraHandledException('The AI generated a query that failed execution after multiple correction attempts. Last error: ' + lastError);
            }

            // -----------------------------------------------------------------
            // 6. Prepare Columns (after successful execution)
            // -----------------------------------------------------------------
            try {
                 // Prepare columns using the *successfully executed* SOQL and primary object
                columns = getColumnsFromQuery(generatedSoql, primaryObjectName, combinedFieldMap);
            } catch (Exception e) {
                System.debug('Error preparing columns after successful query execution: ' + e.getMessage());
                 columns = new List<Map<String, Object>>();
                 System.debug('Could not prepare columns for datatable, returning empty column set.');
                 // Optionally: Show a warning toast to the user later?
            }

            // -----------------------------------------------------------------
            // 7. Return Results
            // -----------------------------------------------------------------
            result.put('soqlQuery', generatedSoql); // Return the final, successful query
            result.put('results', queryResults);
            result.put('columns', columns);
            result.put('primaryObject', primaryObjectName); // Add primary object name
            
            // Add Debugging for returned data
            if (queryResults != null && !queryResults.isEmpty()) {
                System.debug('First Query Result Record: ' + JSON.serializePretty(queryResults[0]));
            } else {
                System.debug('Query returned no results.');
            }
            System.debug('Generated Columns for Datatable: ' + JSON.serializePretty(columns));
            // End Debugging

            System.debug('Natural Language Query processed successfully.');
            return result;

        } catch (AuraHandledException e) {
            System.debug('AuraHandledException in processQuery: ' + e.getMessage());
            throw e;
        } catch (Exception e) {
            System.debug('Unexpected Exception in processQuery: ' + e.getMessage());
            System.debug('Stack Trace: ' + e.getStackTraceString());
            throw new AuraHandledException('An unexpected error occurred: ' + e.getMessage());
        }
    }

    /**
     * @description Extracts the primary object name from the FROM clause of a SOQL query.
     * @param soqlQuery The SOQL query string.
     * @param allowedObjectNames List of valid object names allowed in the FROM clause.
     * @return String The extracted primary object name, or null if not found or not allowed.
     */
    private static String extractPrimaryObjectFromSOQL(String soqlQuery, List<String> allowedObjectNames) {
        if (String.isBlank(soqlQuery)) return null;
        
        String upperQuery = soqlQuery.toUpperCase();
        Integer fromIndex = upperQuery.indexOf(' FROM ');
        if (fromIndex == -1) return null;
        
        // Get text after " FROM "
        String fromPart = soqlQuery.substring(fromIndex + 6).trim();
        
        // Find the end of the object name (space, WHERE, ORDER, LIMIT, GROUP, etc.)
        Integer endIndex = fromPart.length();
        List<String> terminators = new List<String>{' ', 'WHERE', 'ORDER', 'LIMIT', 'GROUP', 'OFFSET'};
        for(String term : terminators) {
            Integer termIndex = fromPart.toUpperCase().indexOf(term);
            if(termIndex != -1) {
                endIndex = Math.min(endIndex, termIndex);
            }
        }
        
        String potentialObjectName = fromPart.substring(0, endIndex).trim();
        
        // Check if the extracted name is in the list of allowed objects (case-insensitive)
        for(String allowed : allowedObjectNames) {
            if(allowed.equalsIgnoreCase(potentialObjectName)) {
                return allowed; // Return the original (correctly cased) name
            }
        }
        
        return null; // Not found or not allowed
    }

    /**
     * @description Validates the SOQL query string generated by the LLM (Multi-Object Aware).
     * @param generatedSoql The SOQL query string from the LLM.
     * @param primaryObjectApiName The primary object identified in the FROM clause.
     * @param allowedObjectNames All object names provided in the config.
     * @param expectedLimit The expected record limit.
     * @param accessiblePrefixedFields A list of accessible field API names (e.g., Account.Name).
     * @throws AuraHandledException if the query fails validation checks.
     */
    private static void validateGeneratedSOQL(String generatedSoql, String primaryObjectApiName, List<String> allowedObjectNames, Integer expectedLimit, List<String> accessiblePrefixedFields) {
        if (String.isBlank(generatedSoql)) {
            throw new AuraHandledException('AI returned an empty query.');
        }

        String upperQuery = generatedSoql.toUpperCase();

        // 1. Check for basic SELECT structure
        if (!upperQuery.trim().startsWith('SELECT ')) {
            throw new AuraHandledException('Query must start with SELECT.');
        }

        // 2. Verify the FROM clause object is one of the allowed ones (already done by extractPrimaryObjectFromSOQL)
        if (String.isBlank(primaryObjectApiName)) {
             throw new AuraHandledException('Could not identify a valid primary object in the FROM clause from the allowed list: ' + String.join(allowedObjectNames, ', '));
        }

        // 3. Check for potentially malicious keywords
        List<String> forbiddenKeywords = new List<String>{' DELETE ', ' UPDATE ', ' INSERT ', ' UPSERT ', ' SYSTEM.RUNAS'};
        for (String keyword : forbiddenKeywords) {
            if (upperQuery.contains(keyword)) {
                throw new AuraHandledException('Query contains forbidden keywords (' + keyword.trim() + ').');
            }
        }
        
        // 4. Check if selected fields are accessible (more complex with relationships)
        try {
            Integer selectIndex = upperQuery.indexOf('SELECT ');
            Integer endSelectIndex = upperQuery.indexOf(' FROM');
            if (endSelectIndex > selectIndex + 7) {
                String selectFieldsPart = generatedSoql.substring(selectIndex + 6, endSelectIndex).trim();
                Set<String> accessibleSet = new Set<String>(accessiblePrefixedFields);
                
                for(String fieldItem : selectFieldsPart.split(',')){
                    String cleanField = fieldItem.trim().split(' ')[0]; // Handle aliases like 'Account.Name an'
                    
                    // Ignore aggregate functions for now (e.g., COUNT(Id))
                    if (cleanField.contains('(') && cleanField.contains(')')) continue;

                    // Normalize field: Add primary object prefix if missing
                    String prefixedFieldToCheck = cleanField;
                    if (!cleanField.contains('.')) {
                        prefixedFieldToCheck = primaryObjectApiName + '.' + cleanField;
                    }
                    
                    // Check accessibility (case-insensitive)
                    if (!accessibleSet.contains(prefixedFieldToCheck)) {
                        Boolean foundCaseInsensitive = false;
                        for(String accessible : accessibleSet) {
                            if(accessible.equalsIgnoreCase(prefixedFieldToCheck)) {
                                foundCaseInsensitive = true;
                                break;
                            }
                        }
                        if(!foundCaseInsensitive){
                            throw new AuraHandledException('Query selects potentially inaccessible or non-existent field: ' + cleanField);
                        }
                    }
                }
            }
        } catch (Exception e) {
             System.debug('Warning: Could not fully validate selected fields due to parsing error: ' + e.getMessage());
             // Allow query if basic structure is okay
        }

        System.debug('Basic multi-object SOQL validation passed.');
    }

    /**
     * @description Ensures the SOQL query has a LIMIT clause matching the specified limit.
     * Adds or modifies the LIMIT clause if necessary.
     * @param soqlQuery The input SOQL query.
     * @param recordLimit The desired record limit.
     * @return String The SOQL query with the correct LIMIT clause.
     */
    private static String ensureQueryLimit(String soqlQuery, Integer recordLimit) {
        String upperQuery = soqlQuery.toUpperCase();
        Integer limitIndex = upperQuery.lastIndexOf(' LIMIT ');
        
        if (limitIndex > -1) {
            // Limit clause exists, find where it ends
            Integer endOfQueryIndex = upperQuery.length();
            Integer offsetIndex = upperQuery.indexOf(' OFFSET ', limitIndex);
            Integer endLimitValueIndex = (offsetIndex > -1) ? offsetIndex : endOfQueryIndex;
            
            // Extract the part before LIMIT and the part after (if any)
            String beforeLimit = soqlQuery.substring(0, limitIndex);
            String afterLimitValue = (endLimitValueIndex < soqlQuery.length()) ? soqlQuery.substring(endLimitValueIndex) : '';
            
            // Reconstruct with the correct limit
            return beforeLimit + ' LIMIT ' + recordLimit + afterLimitValue;
        } else {
            // No LIMIT clause found, append it
            // Check if there's an OFFSET clause without a LIMIT
             Integer offsetIndex = upperQuery.lastIndexOf(' OFFSET ');
             if(offsetIndex > -1) {
                 // Insert LIMIT before OFFSET
                 return soqlQuery.substring(0, offsetIndex) + ' LIMIT ' + recordLimit + soqlQuery.substring(offsetIndex);
             } else {
                 // Append LIMIT to the end
                 return soqlQuery + ' LIMIT ' + recordLimit;
             }
        }
    }

    /**
     * @description Extracts columns from a SOQL query for Lightning Datatable (Multi-Object Aware).
     * @param soqlQuery The SOQL query to analyze.
     * @param primaryObjectName The primary object identified in the FROM clause.
     * @param combinedFieldMap Pre-fetched map of accessible fields (prefixed: Object.Field) to their SObjectField tokens.
     * @return List<Map<String, Object>> List of column definitions.
     */
    private static List<Map<String, Object>> getColumnsFromQuery(String soqlQuery, String primaryObjectName, Map<String, Schema.SObjectField> combinedFieldMap) {
        List<Map<String, Object>> columns = new List<Map<String, Object>>();
        System.debug('getColumnsFromQuery - v4 - Preparing columns for Primary Object: ' + primaryObjectName + ', SOQL: ' + soqlQuery);

        try {
            // Basic SOQL Parsing
            String upperQuery = soqlQuery.toUpperCase();
            Integer selectIndex = upperQuery.indexOf('SELECT ');
            Integer fromIndex = upperQuery.indexOf(' FROM');
            if (selectIndex < 0 || fromIndex < 0 || fromIndex <= selectIndex + 6) {
                System.debug('getColumnsFromQuery - Invalid SOQL format.');
                return columns; // Return empty list if format is invalid
            }
            String selectClause = soqlQuery.substring(selectIndex + 7, fromIndex).trim();
            List<String> selectedItems = new List<String>();
            for (String item : selectClause.split(',')) { if(String.isNotBlank(item)) { selectedItems.add(item.trim()); } }

            // Fallback if metadata isn't available (shouldn't happen often with current logic)
            if (combinedFieldMap == null || combinedFieldMap.isEmpty()) {
                System.debug('getColumnsFromQuery - Combined field map is empty. Falling back.');
                for (String item : selectedItems) {
                     String fieldName = item.contains(' ') ? item.substring(item.lastIndexOf(' ') + 1).trim() : item.trim();
                     columns.add(new Map<String, Object>{ 'label' => fieldName, 'fieldName' => fieldName, 'type' => 'text' });
                }
                return columns;
            }

            // --- Loop through selected items ---
            for (String originalSelectItem : selectedItems) {
                System.debug('getColumnsFromQuery - Processing Item: [' + originalSelectItem + ']');

                String corePathOrFunction = originalSelectItem;
                String alias = null;
                Boolean isRelationship = false;
                Boolean isAggregate = false;

                // 1. Detect Alias
                Integer lastSpaceIndex = originalSelectItem.lastIndexOf(' ');
                if (lastSpaceIndex > 0) {
                    String potentialAlias = originalSelectItem.substring(lastSpaceIndex + 1);
                    if (!potentialAlias.contains('.') && !potentialAlias.contains('(')) {
                        alias = potentialAlias;
                        corePathOrFunction = originalSelectItem.substring(0, lastSpaceIndex).trim();
                        System.debug('getColumnsFromQuery - Alias: [' + alias + '], Core: [' + corePathOrFunction + ']');
                    } else {
                        corePathOrFunction = originalSelectItem;
                         System.debug('getColumnsFromQuery - No simple alias detected, Core: [' + corePathOrFunction + ']');
                    }
                }

                // 2. Determine type
                if (corePathOrFunction.contains('.')) { isRelationship = true; }
                else if (corePathOrFunction.contains('(')) { isAggregate = true; }

                // 3. Determine fieldName for Datatable - THIS IS THE KEY FIX
                String fieldNameForDataTable;
                if (alias != null) {
                    fieldNameForDataTable = alias;
                } else if (isRelationship) {
                    fieldNameForDataTable = corePathOrFunction;
                } else if (isAggregate) {
                    fieldNameForDataTable = corePathOrFunction;
                } else {
                     // Remove the object prefix for simple fields
                     String prefixToRemove = primaryObjectName + '.';
                     if(corePathOrFunction.toLowerCase().startsWith(prefixToRemove.toLowerCase())) {
                         // Extract just the field name without the object prefix
                         fieldNameForDataTable = corePathOrFunction.substring(prefixToRemove.length());
                         
                         // For standard field names, convert to proper case (Id, Name, etc.)
                         if(fieldNameForDataTable.equalsIgnoreCase('id')) {
                             fieldNameForDataTable = 'Id';
                         } else if(fieldNameForDataTable.equalsIgnoreCase('firstname')) {
                             fieldNameForDataTable = 'FirstName';
                         } else if(fieldNameForDataTable.equalsIgnoreCase('lastname')) {
                             fieldNameForDataTable = 'LastName';
                         } else if(fieldNameForDataTable.equalsIgnoreCase('name')) {
                             fieldNameForDataTable = 'Name';
                         } else if(fieldNameForDataTable.equalsIgnoreCase('email')) {
                             fieldNameForDataTable = 'Email';
                         }
                         // Add other common field name mappings as needed
                         
                         System.debug('getColumnsFromQuery - Removed prefix, using standard field name: [' + fieldNameForDataTable + ']');
                     } else {
                         fieldNameForDataTable = corePathOrFunction;
                     }
                }
                 System.debug('getColumnsFromQuery - Determined Datatable fieldName: [' + fieldNameForDataTable + ']');

                // 4. Determine Label & Type/Attributes
                String fieldLabel = (alias != null) ? alias : corePathOrFunction;
                String columnType = 'text';
                Map<String, Object> typeAttributes = null;
                Schema.DescribeFieldResult fieldDescribe = null;
                String mapKey = isRelationship ? corePathOrFunction : (isAggregate ? null : primaryObjectName + '.' + corePathOrFunction);

                if (mapKey != null && combinedFieldMap.containsKey(mapKey)) {
                    try {
                        fieldDescribe = combinedFieldMap.get(mapKey)?.getDescribe();
                        if (fieldDescribe != null) {
                            if (alias == null) { fieldLabel = fieldDescribe.getLabel(); }
                            columnType = getDataTableFieldType(fieldDescribe.getType());
                            typeAttributes = getTypeAttributes(fieldDescribe.getType());
                        }
                    } catch (Exception descEx) { System.debug('getColumnsFromQuery - Describe failed for mapKey [' + mapKey + ']: ' + descEx.getMessage()); }
                } else if (isAggregate) {
                     if (corePathOrFunction.toUpperCase().startsWith('COUNT(')) columnType = 'number';
                     else if (corePathOrFunction.toUpperCase().startsWith('SUM(')) columnType = 'number';
                     else if (corePathOrFunction.toUpperCase().startsWith('AVG(')) columnType = 'number';
                     else columnType = 'text';
                }

                 // 5. Special handling for ID field Link
                 String finalFieldNameForColumn = fieldNameForDataTable;
                 if ((corePathOrFunction.equalsIgnoreCase('Id') || corePathOrFunction.equalsIgnoreCase(primaryObjectName + '.Id')) && !isRelationship && !isAggregate) {
                     columnType = 'url';
                     finalFieldNameForColumn = 'recordUrl';
                     typeAttributes = new Map<String, Object>{
                         'label' => new Map<String, Object>{ 'fieldName' => 'Id' },
                         'target' => '_self'
                     };
                     fieldLabel = (fieldDescribe != null ? fieldDescribe.getLabel() : 'Id');
                     System.debug('getColumnsFromQuery - Configuring Id column as URL. Label: [' + fieldLabel + '], finalFieldName: [recordUrl]');
                 }

                // 6. Create Column Definition
                Map<String, Object> column = new Map<String, Object>{
                    'label' => fieldLabel,
                    'fieldName' => finalFieldNameForColumn,
                    'type' => columnType
                };
                if (typeAttributes != null) { column.put('typeAttributes', typeAttributes); }
                System.debug('getColumnsFromQuery - Adding Column Def: ' + JSON.serialize(column));
                columns.add(column);
            } // End loop

        } catch (Exception e) {
             System.debug('getColumnsFromQuery - Error parsing SOQL: ' + e.getMessage() + '\nStack: ' + e.getStackTraceString());
             // Fallback logic...
              columns = new List<Map<String, Object>>(); // Reset columns on error
            try { // Inner try for fallback
                 String selectClause = soqlQuery.substring(soqlQuery.toUpperCase().indexOf('SELECT ') + 7, soqlQuery.toUpperCase().indexOf(' FROM')).trim();
                 for (String item : selectClause.split(',')) {
                     String cleanItem = item.trim();
                     // Extract just the field name without object prefix for the fallback case too
                     String fieldName = cleanItem.contains(' ') ? cleanItem.substring(cleanItem.lastIndexOf(' ') + 1) : cleanItem;
                     if (fieldName.contains('.')) {
                         fieldName = fieldName.substring(fieldName.lastIndexOf('.') + 1);
                     }
                     // Capitalize standard field names
                     if (fieldName.equalsIgnoreCase('id')) fieldName = 'Id';
                     if (fieldName.equalsIgnoreCase('name')) fieldName = 'Name';
                     if (fieldName.equalsIgnoreCase('firstname')) fieldName = 'FirstName';
                     if (fieldName.equalsIgnoreCase('lastname')) fieldName = 'LastName';
                     
                     columns.add(new Map<String, Object>{ 'label' => fieldName, 'fieldName' => fieldName, 'type' => 'text' });
                 }
                 System.debug('getColumnsFromQuery - Falling back to basic column generation.');
            } catch (Exception fallbackEx) {
                System.debug('getColumnsFromQuery - Error during fallback column generation: ' + fallbackEx.getMessage());
                columns.add(new Map<String, Object>{ 'label' => 'Error', 'fieldName' => 'Error', 'type' => 'text' });
            }
        }

        System.debug('getColumnsFromQuery - Finished generating ' + columns.size() + ' columns.');
        return columns;
    }
    
    /**
     * @description Converts Salesforce field types to Lightning datatable types
     * @param fieldType The Salesforce field type
     * @return String The Lightning datatable field type
     */
    private static String getDataTableFieldType(Schema.DisplayType fieldType) {
        switch on fieldType {
            when DATE {
                return 'date';
            }
            when DATETIME {
                return 'date-local';
            }
            when CURRENCY {
                return 'currency';
            }
            when DOUBLE, INTEGER, LONG {
                return 'number';
            }
            when BOOLEAN {
                return 'boolean';
            }
            when URL {
                return 'url';
            }
            when PHONE {
                return 'phone';
            }
            when EMAIL {
                return 'email';
            }
            when PERCENT {
                return 'percent';
            }
            when else {
                return 'text';
            }
        }
    }

    /**
     * @description Gets type attributes for specific datatable column types.
     * @param fieldType The Salesforce field type (Schema.DisplayType).
     * @return Map<String, Object> Map of type attributes, or null if none needed.
     */
     private static Map<String, Object> getTypeAttributes(Schema.DisplayType fieldType) {
         if (fieldType == Schema.DisplayType.CURRENCY) {
            return new Map<String, Object>{
                'currencyCode' => UserInfo.getDefaultCurrency(), 'minimumFractionDigits' => 2
            };
        } else if (fieldType == Schema.DisplayType.DATE) {
            return new Map<String, Object>{
                'year' => 'numeric', 'month' => 'short', 'day' => '2-digit'
            };
        } else if (fieldType == Schema.DisplayType.DATETIME) {
            return new Map<String, Object>{
                'year' => 'numeric', 'month' => 'short', 'day' => '2-digit',
                'hour' => '2-digit', 'minute' => '2-digit'
            };
        } else if (fieldType == Schema.DisplayType.PERCENT) {
             return new Map<String, Object>{
                'minimumFractionDigits' => 2
            };
        }
        // Add more type attributes as needed (e.g., for URL targets)
        return null;
     }

    // =========================================================================
    // LLM Integration Methods
    // =========================================================================
    
    /**
     * @description Retrieves the specified LLM configuration metadata record.
     * @param configName The Developer Name of the LLM_Configuration__mdt to retrieve.
     * @return LLM_Configuration__mdt The configuration record.
     * @throws AuraHandledException If the configuration is not found or inactive.
     */
    private static LLM_Configuration__mdt getLLMConfig(String configName) {
        // Validate input config name
        if (String.isBlank(configName)) {
             throw new AuraHandledException('LLM Configuration Name cannot be blank.');
        }
        
        try {
            LLM_Configuration__mdt config = [
                SELECT API_Key__c, Base_URL__c, Model_Name__c, 
                       Provider__c, Supports_Files__c, Max_Tokens__c, Temperature__c
                FROM LLM_Configuration__mdt 
                WHERE DeveloperName = :configName AND IsActive__c = true
                LIMIT 1
            ];
            
            if (config == null) {
                throw new AuraHandledException(
                    'Active LLM Configuration named \'' + configName + '\' not found or is inactive. ' + 
                    'Please ensure an active LLM_Configuration__mdt record with DeveloperName=\'' + configName + '\' exists.'
                );
            }
            return config;
        } catch (QueryException qe) {
            System.debug('QueryException finding LLM config \'' + configName + '\': ' + qe.getMessage());
            throw new AuraHandledException(
                'Error retrieving LLM configuration \'' + configName + '\': ' + qe.getMessage() + 
                ' Ensure the LLM_Configuration__mdt object and its fields are accessible.'
            );
        } catch (Exception e) {
            System.debug('Exception finding LLM config \'' + configName + '\': ' + e.getMessage());
            throw new AuraHandledException('An unexpected error occurred while retrieving the LLM configuration \'' + configName + '\': ' + e.getMessage());
        }
    }

    /**
     * @description Makes the actual call to the configured LLM API endpoint.
     * This is adapted from LLMController.cls
     * @param config The LLM Configuration metadata record.
     * @param prompt The full prompt string to send to the LLM.
     * @param instructions System instructions for the LLM.
     * @return String The raw text response from the LLM.
     * @throws AuraHandledException If the API call fails or returns an error.
     */
    private static String makeLLMCall(LLM_Configuration__mdt config, String prompt, String instructions) {
        System.debug('Starting makeLLMCall for provider: ' + config.Provider__c + ', model: ' + config.Model_Name__c);
        
        // Set up retry logic parameters
        Integer maxRetries = 3;
        Integer currentRetry = 0;
        Integer baseWaitMs = 1000; // Start with 1 second wait
        
        while (currentRetry < maxRetries) {
            try {
                // Initialize HTTP request
                HttpRequest req = new HttpRequest();
                req.setEndpoint(config.Base_URL__c);
                req.setMethod('POST');
                req.setTimeout(120000); // 2 minutes timeout
                
                // Common headers
                req.setHeader('Content-Type', 'application/json');
                
                // Prepare request body based on provider
                Map<String,Object> requestBody = new Map<String,Object>();
                
                // Provider-specific request structure
                switch on config.Provider__c {
                    when 'Anthropic' {
                        req.setHeader('x-api-key', config.API_Key__c);
                        req.setHeader('anthropic-version', '2023-06-01');
                        
                        requestBody = new Map<String,Object>{
                            'model' => config.Model_Name__c,
                            'max_tokens' => Integer.valueOf(config.Max_Tokens__c),
                            'temperature' => config.Temperature__c,
                            'system' => instructions,
                            'messages' => new List<Map<String,Object>>{
                                new Map<String,Object>{ 'role' => 'user', 'content' => prompt }
                            }
                        };
                    }
                    when 'OpenAI', 'DeepSeek', 'OpenRouter' {
                        req.setHeader('Authorization', 'Bearer ' + config.API_Key__c);
                        if (config.Provider__c == 'OpenRouter') {
                            req.setHeader('HTTP-Referer', 'https://salesforce.com'); // Required by OpenRouter
                        }
                        
                        requestBody = new Map<String,Object>{
                            'model' => config.Model_Name__c,
                            'messages' => new List<Map<String,Object>>{
                                new Map<String,Object>{ 'role' => 'system', 'content' => instructions },
                                new Map<String,Object>{ 'role' => 'user', 'content' => prompt }
                            },
                            'temperature' => config.Temperature__c,
                            'max_tokens' => Integer.valueOf(config.Max_Tokens__c)
                        };
                    }
                    when 'Google' {
                         req.setHeader('x-goog-api-key', config.API_Key__c);
                        
                        // Define the structure for Google Gemini API call
                        Map<String,Object> generationConfig = new Map<String,Object>{
                            'temperature' => config.Temperature__c,
                            'maxOutputTokens' => Integer.valueOf(config.Max_Tokens__c)
                        };

                        List<Map<String,Object>> contents = new List<Map<String,Object>>{
                            new Map<String,Object>{
                                'role' => 'user',
                                'parts' => new List<Map<String,Object>>{ new Map<String,Object>{ 'text' => instructions } }
                            },
                            new Map<String,Object>{
                                'role' => 'model',
                                'parts' => new List<Map<String,Object>>{ new Map<String,Object>{ 'text' => 'Understood. I will generate only the SOQL query.' } } // Simple acknowledgement
                            },
                            new Map<String,Object>{
                                'role' => 'user',
                                'parts' => new List<Map<String,Object>>{ new Map<String,Object>{ 'text' => prompt } }
                            }
                        };
                        
                        requestBody.put('contents', contents);
                        // Note: Google might use 'model' or other fields; adjust if needed based on their API docs
                        requestBody.put('model', config.Model_Name__c); // Assuming model name is passed here
                        requestBody.put('generationConfig', generationConfig);
                    }
                    when else {
                        throw new AuraHandledException('Unsupported LLM provider specified in configuration: ' + config.Provider__c);
                    }
                }
                
                // Serialize the body and set it
                String bodyJson = JSON.serialize(requestBody);
                req.setBody(bodyJson);
                
                // Send the request
                HttpResponse res = new Http().send(req);
                System.debug('LLM API Response Status: ' + res.getStatusCode() + ' ' + res.getStatus());
                
                // Handle non-200 responses
                if (res.getStatusCode() != 200) {
                    // Check for retryable errors (rate limiting, server overload)
                    if (res.getStatusCode() == 429 || res.getStatusCode() == 529 || res.getStatusCode() == 503) {
                        Integer waitTime = baseWaitMs * (Integer)Math.pow(2, currentRetry);
                        currentRetry++;
                        
                        if (currentRetry >= maxRetries) {
                            throw new AuraHandledException('LLM service is unavailable or rate limited after multiple retries. Please try again later.');
                        }
                        
                        // Simple delay simulation for logging - Apex cannot truly sleep
                        System.debug('LLM API rate limited or overloaded. Retry ' + currentRetry + ' of ' + maxRetries + '. Waiting simulated ' + waitTime + 'ms');
                        // In a real-world scenario with platform events or async Apex, a true delay could be implemented.
                        continue; // Continue to the next retry iteration
                    }
                    
                    // For other errors, throw a detailed exception
                    String errorMsg = 'LLM API Error: (' + res.getStatusCode() + ' ' + res.getStatus() + ') - ' + res.getBody();
                    System.debug('ERROR: ' + errorMsg);
                    throw new AuraHandledException(errorMsg);
                }
                
                // Parse the successful response
                String result = parseLLMResponse(config.Provider__c, res);
                System.debug('LLM call completed successfully.');
                return result;
                
            } catch (Exception e) {
                // Log any exception during the call attempt
                System.debug('ERROR in makeLLMCall attempt ' + (currentRetry + 1) + ': ' + e.getMessage());
                System.debug('Stack trace: ' + e.getStackTraceString());
                
                // If it's the last retry or not an explicitly handled retryable error, rethrow
                if (currentRetry >= maxRetries - 1 || !(e instanceof CalloutException)) { 
                    // Check if it's an AuraHandledException, if so, rethrow it directly
                    if (e instanceof AuraHandledException) {
                        throw e;
                    } else {
                        // Wrap other exceptions
                        throw new AuraHandledException('Failed to call LLM service: ' + e.getMessage());
                    }
                }
                
                // Increment retry counter and loop again
                currentRetry++;
                System.debug('Retrying LLM call... (Attempt ' + currentRetry + ' of ' + maxRetries + ')');
            }
        }
        
        // This should theoretically not be reached due to the logic above, but acts as a safeguard.
        throw new AuraHandledException('Failed to call LLM service after ' + maxRetries + ' attempts.');
    }

    /**
     * @description Parses the HTTP response from the LLM API based on the provider.
     * Extracts the main text content.
     * This is adapted from LLMController.cls
     * @param provider The name of the LLM provider (e.g., 'OpenAI', 'Anthropic', 'Google').
     * @param res The HttpResponse object received from the API call.
     * @return String The extracted text content from the LLM response.
     * @throws AuraHandledException If the response format is invalid or text cannot be extracted.
     */
    private static String parseLLMResponse(String provider, HttpResponse res) {
        // Ensure the response is valid before parsing
        if (res == null || res.getStatusCode() != 200 || String.isBlank(res.getBody())) {
            String errorMsg = 'Invalid or empty LLM response received. Status: ' + 
                              (res != null ? String.valueOf(res.getStatusCode()) : 'N/A');
            System.debug(errorMsg);
            throw new AuraHandledException(errorMsg);
        }
        
        // Deserialize the JSON response body
        Map<String,Object> response = (Map<String,Object>)JSON.deserializeUntyped(res.getBody());
        
        try {
            // Extract text based on the provider's response structure
            switch on provider {
                when 'Anthropic' {
                    // Navigate Anthropic structure: response -> content -> [0] -> text
                    if (response.containsKey('content') && response.get('content') instanceof List<Object>) {
                        List<Object> contentList = (List<Object>)response.get('content');
                        if (!contentList.isEmpty() && contentList[0] instanceof Map<String,Object>) {
                            Map<String,Object> firstContent = (Map<String,Object>)contentList[0];
                            if (firstContent.containsKey('text')) {
                                return (String)firstContent.get('text');
                            }
                        }
                    }
                    throw new AuraHandledException('Invalid Anthropic response format: Cannot find text content.');
                }
                when 'OpenAI', 'DeepSeek', 'OpenRouter' {
                    // Navigate OpenAI structure: response -> choices -> [0] -> message -> content
                    if (response.containsKey('choices') && response.get('choices') instanceof List<Object>) {
                        List<Object> choicesList = (List<Object>)response.get('choices');
                        if (!choicesList.isEmpty() && choicesList[0] instanceof Map<String,Object>) {
                            Map<String,Object> firstChoice = (Map<String,Object>)choicesList[0];
                            if (firstChoice.containsKey('message') && firstChoice.get('message') instanceof Map<String,Object>) {
                                Map<String,Object> message = (Map<String,Object>)firstChoice.get('message');
                                if (message.containsKey('content')) {
                                    return (String)message.get('content');
                                }
                            }
                        }
                    }
                    throw new AuraHandledException('Invalid OpenAI/Compatible response format: Cannot find message content.');
                }
                when 'Google' {
                    // Navigate Google Gemini structure: response -> candidates -> [0] -> content -> parts -> [0] -> text
                     if (response.containsKey('candidates') && response.get('candidates') instanceof List<Object>) {
                        List<Object> candidates = (List<Object>)response.get('candidates');
                        if (!candidates.isEmpty() && candidates[0] instanceof Map<String,Object>) {
                            Map<String,Object> firstCandidate = (Map<String,Object>)candidates[0];
                            if (firstCandidate.containsKey('content') && firstCandidate.get('content') instanceof Map<String,Object>) {
                                Map<String,Object> content = (Map<String,Object>)firstCandidate.get('content');
                                if (content.containsKey('parts') && content.get('parts') instanceof List<Object>) {
                                    List<Object> parts = (List<Object>)content.get('parts');
                                    if (!parts.isEmpty() && parts[0] instanceof Map<String,Object>) {
                                        Map<String,Object> firstPart = (Map<String,Object>)parts[0];
                                        if (firstPart.containsKey('text')) {
                                            return (String)firstPart.get('text');
                                        }
                                    }
                                }
                            }
                        }
                    }
                    throw new AuraHandledException('Invalid Google Gemini response format: Cannot find text part.');
                }
                when else {
                    // Throw exception for unsupported providers
                    throw new AuraHandledException('Parsing logic not implemented for LLM provider: ' + provider);
                }
            }
        } catch (Exception e) {
            // Catch any unexpected parsing errors
            System.debug('ERROR parsing LLM response: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to parse LLM API response: ' + e.getMessage());
        }
    }

    // =========================================================================
    // Example Query Generation
    // =========================================================================

    /**
     * @description Calls the LLM to generate relevant example natural language queries based on the provided objects.
     * @param objectApiNamesCSV Comma-separated string of object API names.
     * @param llmConfigName The Developer Name of the LLM Configuration to use.
     * @return List<String> A list of example query strings.
     */
    @AuraEnabled(cacheable=true)
    public static List<String> getExampleQueries(String objectApiNamesCSV, String llmConfigName) {
        List<String> exampleQueries = new List<String>();
        LLM_Configuration__mdt llmConfig;
        List<String> objectNames = new List<String>();
        String objectInfoForPrompt = '';

        try {
            // 1. Validate Inputs
            if (String.isBlank(objectApiNamesCSV)) {
                System.debug('getExampleQueries: No object API names provided, returning empty list.');
                return exampleQueries; // Return empty list if no objects
            }
            String configNameToUse = String.isNotBlank(llmConfigName) ? llmConfigName : 'OpenAI_GPT4_1_Mini';

            // 2. Parse and Get Basic Object Info
            Map<String, Schema.SObjectType> globalDescribe = Schema.getGlobalDescribe();
            for(String name : objectApiNamesCSV.split(',')){
                String trimmedName = name.trim();
                if(String.isNotBlank(trimmedName) && globalDescribe.containsKey(trimmedName)){
                    try {
                        Schema.DescribeSObjectResult objDescribe = globalDescribe.get(trimmedName).getDescribe();
                        // Check accessibility of the object itself
                        if (objDescribe.isAccessible()) {
                            objectNames.add(trimmedName);
                            objectInfoForPrompt += '- ' + trimmedName + ' (Label: ' + objDescribe.getLabel() + ')\n';
                        } else {
                             System.debug('getExampleQueries: Object not accessible, skipping: ' + trimmedName);
                        }
                    } catch (Exception e) {
                        System.debug('getExampleQueries: Error describing object ' + trimmedName + ': ' + e.getMessage());
                        // Ignore objects that cause errors during describe
                    }
                } else if (String.isNotBlank(trimmedName)) {
                    System.debug('getExampleQueries: Object not found in schema, skipping: ' + trimmedName);
                }
            }

            if (objectNames.isEmpty()) {
                 System.debug('getExampleQueries: No valid or accessible objects found, returning empty list.');
                return exampleQueries;
            }
            System.debug('getExampleQueries: Generating examples for objects: ' + String.join(objectNames, ', '));

            // 3. Prepare Prompt for LLM
            llmConfig = getLLMConfig(configNameToUse); // Reuse existing method

            String systemInstructions = 
                'You are an assistant that generates example Salesforce natural language queries.\n' +
                'RULES:\n' +
                '1. Generate exactly 4 concise, diverse example natural language queries suitable for a Salesforce user querying the provided objects.\n' +
                '2. The examples should be SHORT (max 10 words each) and represent common use cases for the given objects (e.g., finding recent records, filtering by status or amount, specific locations).\n' +
                '3. Base your examples ONLY on the general nature of the Salesforce objects provided. Do NOT assume specific custom fields exist.\n' +
                '4. IMPORTANT: Return ONLY the raw example queries, each on a NEW LINE. Do NOT include numbering, bullet points, explanations, or any other text.';

            String llmPrompt = 
                'Generate 4 example natural language queries for a Salesforce user working with the following objects:\n' + 
                objectInfoForPrompt + 
                '\nFollow the rules in the system instructions precisely. Output only the raw queries, one per line.';

            System.debug('getExampleQueries: Sending prompt to LLM for examples. Length: ' + llmPrompt.length());

            // 4. Call LLM
            String rawResponse = makeLLMCall(llmConfig, llmPrompt, systemInstructions);
            System.debug('getExampleQueries: Raw response from LLM: ' + rawResponse);

            // 5. Parse Response
            if (String.isNotBlank(rawResponse)) {
                // Split response by newline, trim whitespace, and filter out empty lines
                for (String line : rawResponse.split('\r?\n')) { // Handles Windows and Unix newlines
                    String trimmedLine = line.trim();
                    if (String.isNotBlank(trimmedLine)) {
                        exampleQueries.add(trimmedLine);
                    } 
                }
                // Ensure we don't exceed a reasonable number (e.g., max 5)
                 if (exampleQueries != null && exampleQueries.size() > 5) { // Check size before creating sublist
                     List<String> limitedQueries = new List<String>();
                     for(Integer i = 0; i < 5; i++) {
                         limitedQueries.add(exampleQueries[i]);
                     }
                     exampleQueries = limitedQueries; // Replace original list with the limited one
                 }
            } else {
                 System.debug('getExampleQueries: LLM returned a blank response.');
            }

        } catch (AuraHandledException e) {
            System.debug('getExampleQueries: AuraHandledException occurred: ' + e.getMessage());
            // Don't throw, just return empty/default list so UI doesn't break
            exampleQueries = getDefaultExamples(); // Fallback
        } catch (Exception e) {
            System.debug('getExampleQueries: Unexpected exception occurred: ' + e.getMessage() + ' Stack: ' + e.getStackTraceString());
            // Don't throw, just return empty/default list
             exampleQueries = getDefaultExamples(); // Fallback
        }

        // Fallback if LLM failed or returned no examples
        if (exampleQueries.isEmpty()) {
            System.debug('getExampleQueries: No examples generated by LLM or error occurred, returning default examples.');
            exampleQueries = getDefaultExamples();
        }

        System.debug('getExampleQueries: Returning ' + exampleQueries.size() + ' examples.');
        return exampleQueries;
    }

    /**
     * @description Provides a default set of example queries if LLM generation fails.
     * @return List<String> Default example query strings.
     */
    private static List<String> getDefaultExamples() {
        return new List<String> {
            'Show recent Accounts',
            'Open Opportunities > 10k',
            'Contacts in CA',
            'High priority Cases'
        };
    }
} 