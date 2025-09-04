public with sharing class GISProximityService {
    /**
     * Placeholder proximity service. Replace with ArcGIS/USGS calls.
     */
    @AuraEnabled(cacheable=true)
    public static List<String> getProximityAlerts(Decimal latitude, Decimal longitude) {
        List<String> alerts = new List<String>();
        if (latitude == null || longitude == null) return alerts;
        // Heuristic demo alerts
        if (latitude > 35 && latitude < 36 && longitude < -100 && longitude > -112) {
            alerts.add('Within 2 miles of protected wildlife area');
        }
        if (Math.mod(Math.abs(latitude.intValue() + longitude.intValue()), 5) == 0) {
            alerts.add('Cultural resource sensitivity flagged in vicinity');
        }
        return alerts;
    }
}

