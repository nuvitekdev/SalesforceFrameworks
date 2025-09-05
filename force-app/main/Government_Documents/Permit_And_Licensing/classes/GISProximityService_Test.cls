@IsTest
private class GISProximityService_Test {
    @IsTest
    static void testProximityAlerts() {
        Test.startTest();
        List<String> alerts = GISProximityService.getProximityAlerts(35.5, -105.0);
        Test.stopTest();
        System.assertNotEquals(null, alerts);
    }
}