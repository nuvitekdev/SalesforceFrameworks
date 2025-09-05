public with sharing class Nuvi_Permit_GISProximityService {
    @AuraEnabled(cacheable=true)
    public static List<String> getProximityAlerts(Decimal latitude, Decimal longitude) {
        return GISProximityService.getProximityAlerts(latitude, longitude);
    }
}