public with sharing class LLMDataHelper {
    
    public static String getRecordContext(String recordId) {
        if (String.isBlank(recordId)) {
            return '';
        }
        
        try {
            Id recId = Id.valueOf(recordId);
            String objectName = recId.getSObjectType().getDescribe().getName();
            
            Map<String, Schema.SObjectField> fieldMap = Schema.getGlobalDescribe()
                .get(objectName)
                .getDescribe()
                .fields.getMap();
            
            List<String> fieldNames = new List<String>();
            for (String fieldName : fieldMap.keySet()) {
                Schema.DescribeFieldResult fieldDescribe = fieldMap.get(fieldName).getDescribe();
                if (fieldDescribe.isAccessible()) {
                    fieldNames.add(fieldName);
                }
            }
            
            if (fieldNames.isEmpty()) {
                return '';
            }
            
            String query = buildQuery(fieldNames, objectName, recordId);
            List<SObject> records = Database.query(query);
            
            if (records.isEmpty()) {
                return '';
            }
            
            return formatRecordData(records[0], fieldMap);
        } catch (Exception e) {
            System.debug('Error getting record context: ' + e.getMessage());
            return '';
        }
    }
    
    public static String getDocumentSummaries(String recordId) {
        if (String.isBlank(recordId)) {
            return '';
        }
        
        try {
            List<ContentDocumentLink> docLinks = [
                SELECT ContentDocument.Title, ContentDocument.FileType, 
                       ContentDocument.ContentSize, ContentDocument.CreatedDate
                FROM ContentDocumentLink
                WHERE LinkedEntityId = :recordId
                WITH SECURITY_ENFORCED
                LIMIT 100
            ];
            
            if (docLinks.isEmpty()) {
                return '';
            }
            
            List<String> summaries = new List<String>();
            for (ContentDocumentLink link : docLinks) {
                String summary = String.format(
                    '- {0} ({1}, {2})',
                    new List<String>{
                        link.ContentDocument.Title,
                        link.ContentDocument.FileType,
                        formatFileSize(link.ContentDocument.ContentSize)
                    }
                );
                summaries.add(summary);
            }
            
            return 'Attached Documents:\n' + String.join(summaries, '\n');
        } catch (Exception e) {
            System.debug('Error getting document summaries: ' + e.getMessage());
            return '';
        }
    }
    
    public static String getRelatedRecords(String recordId, String relatedObjects) {
        if (String.isBlank(recordId) || String.isBlank(relatedObjects)) {
            return '';
        }
        
        List<String> results = new List<String>();
        List<String> objectList = relatedObjects.split(',');
        
        for (String objName : objectList) {
            String trimmedObjName = objName.trim();
            String relatedData = queryRelatedObject(recordId, trimmedObjName);
            if (String.isNotBlank(relatedData)) {
                results.add(relatedData);
            }
        }
        
        return results.isEmpty() ? '' : String.join(results, '\n\n');
    }
    
    private static String buildQuery(List<String> fieldNames, String objectName, String recordId) {
        String query = 'SELECT ' + String.join(fieldNames, ', ');
        query += ' FROM ' + objectName;
        query += ' WHERE Id = \'' + recordId + '\'';
        query += ' WITH SECURITY_ENFORCED';
        query += ' LIMIT 1';
        return query;
    }
    
    private static String formatRecordData(SObject record, Map<String, Schema.SObjectField> fieldMap) {
        List<String> formattedFields = new List<String>();
        
        for (String fieldName : fieldMap.keySet()) {
            Schema.DescribeFieldResult fieldDescribe = fieldMap.get(fieldName).getDescribe();
            if (!fieldDescribe.isAccessible()) {
                continue;
            }
            
            Object value = record.get(fieldName);
            if (value != null) {
                String label = fieldDescribe.getLabel();
                String formattedValue = formatFieldValue(value, fieldDescribe);
                formattedFields.add(label + ': ' + formattedValue);
            }
        }
        
        return String.join(formattedFields, '\n');
    }
    
    private static String formatFieldValue(Object value, Schema.DescribeFieldResult fieldDescribe) {
        if (value == null) {
            return '';
        }
        
        Schema.DisplayType fieldType = fieldDescribe.getType();
        
        if (fieldType == Schema.DisplayType.DATETIME) {
            return ((DateTime)value).format();
        } else if (fieldType == Schema.DisplayType.DATE) {
            return String.valueOf((Date)value);
        } else if (fieldType == Schema.DisplayType.CURRENCY || fieldType == Schema.DisplayType.DOUBLE) {
            return String.format('{0,number,#,###.00}', new List<Object>{value});
        } else if (fieldType == Schema.DisplayType.PERCENT) {
            return String.valueOf(value) + '%';
        } else {
            return String.valueOf(value);
        }
    }
    
    private static String queryRelatedObject(String recordId, String objectName) {
        try {
            Schema.SObjectType sObjType = Schema.getGlobalDescribe().get(objectName);
            if (sObjType == null) {
                return '';
            }
            
            Map<String, Schema.SObjectField> fields = sObjType.getDescribe().fields.getMap();
            List<String> lookupFields = new List<String>();
            
            for (String fieldName : fields.keySet()) {
                Schema.DescribeFieldResult fieldDescribe = fields.get(fieldName).getDescribe();
                if (fieldDescribe.getType() == Schema.DisplayType.REFERENCE && 
                    fieldDescribe.isAccessible()) {
                    List<Schema.SObjectType> refTypes = fieldDescribe.getReferenceTo();
                    if (!refTypes.isEmpty()) {
                        String refObjectName = refTypes[0].getDescribe().getName();
                        if (recordId.startsWith(refTypes[0].getDescribe().getKeyPrefix())) {
                            lookupFields.add(fieldName);
                        }
                    }
                }
            }
            
            if (lookupFields.isEmpty()) {
                return '';
            }
            
            String whereClause = '';
            for (String field : lookupFields) {
                if (String.isNotBlank(whereClause)) {
                    whereClause += ' OR ';
                }
                whereClause += field + ' = \'' + recordId + '\'';
            }
            
            String query = 'SELECT Id, Name FROM ' + objectName + 
                          ' WHERE (' + whereClause + ') WITH SECURITY_ENFORCED LIMIT 10';
            
            List<SObject> records = Database.query(query);
            if (records.isEmpty()) {
                return '';
            }
            
            List<String> recordNames = new List<String>();
            for (SObject rec : records) {
                recordNames.add('- ' + String.valueOf(rec.get('Name')));
            }
            
            return objectName + ' Records:\n' + String.join(recordNames, '\n');
        } catch (Exception e) {
            System.debug('Error querying related object ' + objectName + ': ' + e.getMessage());
            return '';
        }
    }
    
    public static String formatFileSize(Integer bytesSize) {
        if (bytesSize == null || bytesSize == 0) {
            return '0 bytes';
        }
        
        List<String> units = new List<String>{'bytes', 'KB', 'MB', 'GB'};
        Integer unitIndex = 0;
        Decimal size = bytesSize;
        
        while (size >= 1024 && unitIndex < units.size() - 1) {
            size = size / 1024;
            unitIndex++;
        }
        
        if (unitIndex == 0) {
            return bytesSize + ' ' + units[unitIndex];
        } else {
            return size.setScale(2) + ' ' + units[unitIndex];
        }
    }
    
    public static Map<String, String> parseFiltersFromPrompt(String prompt) {
        Map<String, String> filters = new Map<String, String>();
        
        if (String.isBlank(prompt)) {
            return filters;
        }
        
        String promptLower = prompt.toLowerCase();
        
        Pattern recordTypePattern = Pattern.compile('recordtype\\s*=\\s*[\'"]?([^\'"\\s]+)[\'"]?');
        Matcher recordTypeMatcher = recordTypePattern.matcher(promptLower);
        if (recordTypeMatcher.find()) {
            filters.put('RecordType', recordTypeMatcher.group(1));
        }
        
        Pattern statusPattern = Pattern.compile('status\\s*=\\s*[\'"]?([^\'"\\s]+)[\'"]?');
        Matcher statusMatcher = statusPattern.matcher(promptLower);
        if (statusMatcher.find()) {
            filters.put('Status', statusMatcher.group(1));
        }
        
        Pattern ownerPattern = Pattern.compile('owner\\s*=\\s*[\'"]?([^\'"\\s]+)[\'"]?');
        Matcher ownerMatcher = ownerPattern.matcher(promptLower);
        if (ownerMatcher.find()) {
            filters.put('Owner', ownerMatcher.group(1));
        }
        
        Pattern datePattern = Pattern.compile('(created|modified)\\s+(today|yesterday|this week|last week|this month|last month)');
        Matcher dateMatcher = datePattern.matcher(promptLower);
        if (dateMatcher.find()) {
            String dateField = dateMatcher.group(1).equals('created') ? 'CreatedDate' : 'LastModifiedDate';
            String dateRange = dateMatcher.group(2);
            filters.put(dateField, dateRange);
        }
        
        return filters;
    }
}