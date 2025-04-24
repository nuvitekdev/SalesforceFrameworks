/**
 * Controller for the SLA Tracker LWC component
 * Provides functionality for retrieving record metadata and calculating SLA deadlines
 * including business hours calculations.
 * 
 * @author Nuvitek
 */
public with sharing class SlaTrackerController {
    
    /**
     * Retrieves metadata about a Salesforce record, specifically the object API name
     * 
     * @param recordId ID of the record to get metadata for
     * @return Map containing the object API name for the record
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, String> getRecordMetadata(Id recordId) {
        Map<String, String> result = new Map<String, String>();
        
        try {
            if (recordId == null) {
                throw new AuraHandledException('Record ID cannot be null');
            }
            
            // Get the object API name from the ID prefix
            String objectApiName = recordId.getSObjectType().getDescribe().getName();
            result.put('objectApiName', objectApiName);
            
            return result;
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving record metadata: ' + e.getMessage());
        }
    }
    
    /**
     * Calculates a target date/time based on business hours
     * Adds the specified number of hours to the start time considering business hours
     * 
     * @param startTime The starting date/time for the calculation
     * @param hoursToAdd Number of business hours to add
     * @param businessHoursId Optional ID of the BusinessHours record to use (null for default)
     * @return DateTime representing the target date/time after adding business hours
     */
    @AuraEnabled
    public static DateTime calculateBusinessHours(DateTime startTime, Decimal hoursToAdd, Id businessHoursId) {
        try {
            if (startTime == null) {
                throw new AuraHandledException('Start time cannot be null');
            }
            
            if (hoursToAdd == null || hoursToAdd <= 0) {
                throw new AuraHandledException('Hours to add must be a positive number');
            }
            
            // Get business hours ID to use
            Id bhId = businessHoursId;
            if (bhId == null) {
                // Get default business hours
                List<BusinessHours> defaultBH = [
                    SELECT Id 
                    FROM BusinessHours 
                    WHERE IsDefault = true 
                    LIMIT 1
                ];
                
                if (defaultBH.isEmpty()) {
                    throw new AuraHandledException('No default business hours found. Please configure business hours in Setup.');
                }
                
                bhId = defaultBH[0].Id;
            }
            
            // Convert decimal hours to milliseconds
            Long hoursInMs = (Long)(hoursToAdd * 60 * 60 * 1000);
            
            // Calculate target time using BusinessHours class
            DateTime targetTime = BusinessHours.add(bhId, startTime, hoursInMs);
            
            return targetTime;
        } catch (Exception e) {
            throw new AuraHandledException('Error calculating business hours: ' + e.getMessage());
        }
    }
    
    /**
     * Checks if the current time is within business hours
     * 
     * @param currentTime DateTime to check
     * @param businessHoursId Optional ID of the BusinessHours record to use (null for default)
     * @return Boolean indicating whether the current time is within business hours
     */
    @AuraEnabled(cacheable=true)
    public static Boolean isWithinBusinessHours(DateTime currentTime, Id businessHoursId) {
        try {
            if (currentTime == null) {
                currentTime = DateTime.now();
            }
            
            // Get business hours ID to use
            Id bhId = businessHoursId;
            if (bhId == null) {
                // Get default business hours
                List<BusinessHours> defaultBH = [
                    SELECT Id 
                    FROM BusinessHours 
                    WHERE IsDefault = true 
                    LIMIT 1
                ];
                
                if (defaultBH.isEmpty()) {
                    throw new AuraHandledException('No default business hours found. Please configure business hours in Setup.');
                }
                
                bhId = defaultBH[0].Id;
            }
            
            // Check if within business hours
            return BusinessHours.isWithin(bhId, currentTime);
        } catch (Exception e) {
            throw new AuraHandledException('Error checking business hours: ' + e.getMessage());
        }
    }
}