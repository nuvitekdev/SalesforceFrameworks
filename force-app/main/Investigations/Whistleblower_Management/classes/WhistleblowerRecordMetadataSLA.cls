public with sharing class WhistleblowerRecordMetadataSLA {

    @AuraEnabled(cacheable=true)
    public static RecordMetadata getRecordMetadata(Id recordId) {
        RecordMetadata metadata = new RecordMetadata();
        if (recordId != null) {
            // Get the object name from the recordId
            metadata.objectApiName = String.valueOf(recordId.getSObjectType());

            // Perform a describe call to get field information
            Map<String, Schema.SObjectField> fields = Schema.getGlobalDescribe().get(metadata.objectApiName).getDescribe().fields.getMap();

            // Process fields as per your logic, e.g., filtering specific fields
            metadata.fieldApiNames = new List<String>();
            for (String fieldName : fields.keySet()) {
                metadata.fieldApiNames.add(fieldName.toLowerCase());
            }
        }
        system.debug(metadata);
        return metadata;
    }

    public class RecordMetadata {
        @AuraEnabled public String objectApiName;
        @AuraEnabled public List<String> fieldApiNames;
    }
}