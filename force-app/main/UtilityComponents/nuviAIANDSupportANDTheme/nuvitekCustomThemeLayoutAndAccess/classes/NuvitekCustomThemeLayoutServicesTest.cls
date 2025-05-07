/**
 * Test class for NuvitekCustomThemeLayoutServices
 * Provides comprehensive test coverage for navigation and search functionality
 */
@isTest
private class NuvitekCustomThemeLayoutServicesTest {
    
    @TestSetup
    static void setupTestData() {
        // Create test data for search functionality
        List<Account> testAccounts = new List<Account>();
        for (Integer i = 0; i < 5; i++) {
            Account acc = new Account(
                Name = 'Test Search Account ' + i,
                Description = 'Test account for searching'
            );
            testAccounts.add(acc);
        }
        insert testAccounts;
        
        List<Contact> testContacts = new List<Contact>();
        for (Integer i = 0; i < 5; i++) {
            Contact con = new Contact(
                FirstName = 'Test',
                LastName = 'Contact ' + i,
                Email = 'test' + i + '@example.com'
            );
            testContacts.add(con);
        }
        insert testContacts;
        
        List<Opportunity> testOpportunities = new List<Opportunity>();
        for (Integer i = 0; i < 5; i++) {
            Opportunity opp = new Opportunity(
                Name = 'Test Search Opportunity ' + i,
                StageName = 'Prospecting',
                CloseDate = Date.today().addMonths(1)
            );
            testOpportunities.add(opp);
        }
        insert testOpportunities;
    }
    
    /**
     * Set up mock navigation data
     */
    private static void setupMockNavigation(String menuName) {
        List<NavigationLinkSet> mockNavSets = new List<NavigationLinkSet>();
        List<NavigationMenuItem> mockNavItems = new List<NavigationMenuItem>();
        
        // Create a mock navigation menu
        NavigationLinkSet mockNavMenu = new NavigationLinkSet();
        mockNavMenu.Id = '0Ma000000000001AAA'; // Fake ID
        mockNavMenu.MasterLabel = 'Test ' + menuName;
        mockNavMenu.DeveloperName = menuName;
        mockNavSets.add(mockNavMenu);
        
        // Create parent menu items
        NavigationMenuItem parent1 = new NavigationMenuItem();
        parent1.Id = '0Mb000000000001AAA'; // Fake ID
        parent1.Label = 'Dashboard';
        parent1.Position = 1;
        parent1.Target = '/lightning/page/home';
        parent1.Type = 'InternalLink';
        parent1.Status = 'Live';
        parent1.NavigationLinkSetId = mockNavMenu.Id;
        parent1.ParentId = null;
        mockNavItems.add(parent1);
        
        NavigationMenuItem parent2 = new NavigationMenuItem();
        parent2.Id = '0Mb000000000002AAA'; // Fake ID
        parent2.Label = 'Records';
        parent2.Position = 2;
        parent2.Target = '';
        parent2.Type = 'InternalLink';
        parent2.Status = 'Live';
        parent2.NavigationLinkSetId = mockNavMenu.Id;
        parent2.ParentId = null;
        mockNavItems.add(parent2);
        
        // Create child menu items
        NavigationMenuItem child1 = new NavigationMenuItem();
        child1.Id = '0Mb000000000003AAA'; // Fake ID
        child1.Label = 'Accounts';
        child1.Position = 1;
        child1.Target = '/lightning/o/Account/list';
        child1.Type = 'InternalLink';
        child1.Status = 'Live';
        child1.NavigationLinkSetId = mockNavMenu.Id;
        child1.ParentId = parent2.Id;
        mockNavItems.add(child1);
        
        NavigationMenuItem child2 = new NavigationMenuItem();
        child2.Id = '0Mb000000000004AAA'; // Fake ID
        child2.Label = 'Contacts';
        child2.Position = 2;
        child2.Target = '/lightning/o/Contact/list';
        child2.Type = 'InternalLink';
        child2.Status = 'Live';
        child2.NavigationLinkSetId = mockNavMenu.Id;
        child2.ParentId = parent2.Id;
        mockNavItems.add(child2);
        
        NavigationMenuItem child3 = new NavigationMenuItem();
        child3.Id = '0Mb000000000005AAA'; // Fake ID
        child3.Label = 'Opportunities';
        child3.Position = 3;
        child3.Target = '/lightning/o/Opportunity/list';
        child3.Type = 'InternalLink';
        child3.Status = 'Live';
        child3.NavigationLinkSetId = mockNavMenu.Id;
        child3.ParentId = parent2.Id;
        mockNavItems.add(child3);
        
        // Set the mock data in the service class
        NuvitekCustomThemeLayoutServices.mockNavLinkSets = mockNavSets;
        NuvitekCustomThemeLayoutServices.mockNavMenuItems = mockNavItems;
    }
    
    /**
     * Test getNavigationItems with valid menu name - full navigation structure
     */
    @isTest
    static void testGetNavigationItems() {
        // Set up mock navigation data
        setupMockNavigation('MainMenu');
        
        Test.startTest();
        
        // Call the service with our mocked menu name
        Map<String, Object> result = NuvitekCustomThemeLayoutServices.getNavigationItems('MainMenu');
        
        // Validate the result
        System.assertNotEquals(null, result, 'Result should not be null');
        System.assert(result.containsKey('menuItems'), 'Result should contain menuItems key');
        
        // Verify we get the expected data structure back
        List<Object> menuItems = (List<Object>)result.get('menuItems');
        System.assertEquals(2, menuItems.size(), 'Should have 2 parent menu items');
        
        // Verify first parent menu item
        Map<String, Object> firstItem = (Map<String, Object>)menuItems[0];
        System.assertEquals('Dashboard', firstItem.get('label'), 'First item should be Dashboard');
        System.assertEquals('InternalLink', firstItem.get('actionType'), 'Action type should match');
        System.assertEquals('/lightning/page/home', firstItem.get('actionValue'), 'Action value should match');
        
        // Verify second parent has children
        Map<String, Object> secondItem = (Map<String, Object>)menuItems[1];
        System.assertEquals('Records', secondItem.get('label'), 'Second item should be Records');
        
        List<Object> subMenu = (List<Object>)secondItem.get('subMenu');
        System.assertEquals(3, subMenu.size(), 'Records should have 3 child items');
        
        // Verify first child of Records
        Map<String, Object> firstChild = (Map<String, Object>)subMenu[0];
        System.assertEquals('Accounts', firstChild.get('label'), 'First child should be Accounts');
        
        Test.stopTest();
    }
    
    /**
     * Test getNavigationItems with empty menu name
     */
    @isTest
    static void testGetNavigationItemsWithEmptyMenuName() {
        Test.startTest();
        
        // Verify that calling with an empty menu name returns empty result
        Map<String, Object> result = NuvitekCustomThemeLayoutServices.getNavigationItems('');
        
        System.assertNotEquals(null, result, 'Result should not be null');
        System.assert(result.containsKey('menuItems'), 'Result should contain menuItems key');
        
        List<Object> menuItems = (List<Object>)result.get('menuItems');
        System.assertEquals(0, menuItems.size(), 'Menu items should be empty for empty menu name');
        
        // Verify that calling with null menu name returns empty result
        result = NuvitekCustomThemeLayoutServices.getNavigationItems(null);
        
        System.assertNotEquals(null, result, 'Result should not be null');
        System.assert(result.containsKey('menuItems'), 'Result should contain menuItems key');
        
        menuItems = (List<Object>)result.get('menuItems');
        System.assertEquals(0, menuItems.size(), 'Menu items should be empty for null menu name');
        
        Test.stopTest();
    }
    
    /**
     * Test getNavigationItems with non-existent menu name
     */
    @isTest
    static void testGetNavigationItemsNonExistentMenu() {
        // Set up mock navigation data for a different menu
        setupMockNavigation('OtherMenu');
        
        Test.startTest();
        
        // Call with a menu name that doesn't match our mock
        Map<String, Object> result = NuvitekCustomThemeLayoutServices.getNavigationItems('NonExistentMenu');
        
        System.assertNotEquals(null, result, 'Result should not be null');
        System.assert(result.containsKey('menuItems'), 'Result should contain menuItems key');
        
        List<Object> menuItems = (List<Object>)result.get('menuItems');
        System.assertEquals(0, menuItems.size(), 'Menu items should be empty for non-existent menu');
        
        Test.stopTest();
    }
    
    /**
     * Test for error handling in getNavigationItems
     */
    @isTest
    static void testGetNavigationItemsExceptionHandling() {
        // Set up mock navigation data that will cause an exception
        // We'll create a mock that includes a child item with a parent ID that doesn't exist
        List<NavigationLinkSet> mockNavSets = new List<NavigationLinkSet>();
        List<NavigationMenuItem> mockNavItems = new List<NavigationMenuItem>();
        
        // Create a mock navigation menu
        NavigationLinkSet mockNavMenu = new NavigationLinkSet();
        mockNavMenu.Id = '0Ma000000000001AAA'; // Fake ID
        mockNavMenu.MasterLabel = 'Test Menu';
        mockNavMenu.DeveloperName = 'TestMenu';
        mockNavSets.add(mockNavMenu);
        
        // Create a menu item with a non-existent parent
        NavigationMenuItem brokenItem = new NavigationMenuItem();
        brokenItem.Id = '0Mb000000000099AAA'; // Fake ID
        brokenItem.Label = 'Broken Item';
        brokenItem.Position = 1;
        brokenItem.Target = '/broken';
        brokenItem.Type = 'InternalLink';
        brokenItem.Status = 'Live';
        brokenItem.NavigationLinkSetId = mockNavMenu.Id;
        
        // Set a parent ID that doesn't exist in our mocks
        brokenItem.ParentId = '0Mb999999999999AAA'; // Non-existent parent
        mockNavItems.add(brokenItem);
        
        // Set the mock data
        NuvitekCustomThemeLayoutServices.mockNavLinkSets = mockNavSets;
        NuvitekCustomThemeLayoutServices.mockNavMenuItems = mockNavItems;
        
        Test.startTest();
        
        // The service should handle the exception gracefully
        try {
            Map<String, Object> result = NuvitekCustomThemeLayoutServices.getNavigationItems('TestMenu');
            
            // We should still get a valid result even with an orphaned child
            System.assertNotEquals(null, result, 'Result should not be null even with potential errors');
            System.assert(result.containsKey('menuItems'), 'Result should contain menuItems key');
            
            List<Object> menuItems = (List<Object>)result.get('menuItems');
            System.assertEquals(0, menuItems.size(), 'Should have no parent menu items');
            
        } catch (Exception e) {
            System.assert(false, 'No exception should be thrown, it should be caught internally: ' + e.getMessage());
        }
        
        Test.stopTest();
    }
    
    /**
     * Test searchAcrossObjects with valid search term and objects
     */
    @isTest
    static void testSearchAcrossObjects() {
        Test.startTest();
        
        // Create fixed search results for testing
        Id acctId = [SELECT Id FROM Account WHERE Name = 'Test Search Account 0' LIMIT 1].Id;
        Id contactId = [SELECT Id FROM Contact WHERE LastName = 'Contact 0' LIMIT 1].Id;
        Id oppId = [SELECT Id FROM Opportunity WHERE Name = 'Test Search Opportunity 0' LIMIT 1].Id;
        
        List<Id> fixedSearchResults = new List<Id>{acctId, contactId, oppId};
        Test.setFixedSearchResults(fixedSearchResults);
        
        // Execute the search
        List<Map<String, Object>> results = NuvitekCustomThemeLayoutServices.searchAcrossObjects(
            'Test Search', 
            'Account,Contact,Opportunity'
        );
        
        // Validate results - should have at least one result
        System.assertNotEquals(null, results, 'Search results should not be null');
        System.assert(!results.isEmpty(), 'Search results should not be empty with fixed search results');
        
        // Verify that we're getting expected object types in results
        Set<String> objectTypes = new Set<String>();
        for (Map<String, Object> result : results) {
            if (result.containsKey('objectType')) {
                objectTypes.add((String)result.get('objectType'));
            }
        }
        
        // Due to how Test.setFixedSearchResults works, we may not get all three types
        // But we should get at least one
        System.assert(!objectTypes.isEmpty(), 'Should have found at least one object type in results');
        
        Test.stopTest();
    }
    
    /**
     * Test searchAcrossObjects with empty inputs
     */
    @isTest
    static void testSearchAcrossObjectsErrors() {
        Test.startTest();
        
        // Test with empty search term
        List<Map<String, Object>> emptyTermResults = NuvitekCustomThemeLayoutServices.searchAcrossObjects(
            '', 
            'Account,Contact,Opportunity'
        );
        
        System.assertEquals(0, emptyTermResults.size(), 'Should return empty list for empty search term');
        
        // Test with empty objects list
        List<Map<String, Object>> emptyObjectsResults = NuvitekCustomThemeLayoutServices.searchAcrossObjects(
            'Test', 
            ''
        );
        
        System.assertEquals(0, emptyObjectsResults.size(), 'Should return empty list for empty objects list');
        
        // Test with null search term
        List<Map<String, Object>> nullTermResults = NuvitekCustomThemeLayoutServices.searchAcrossObjects(
            null, 
            'Account,Contact,Opportunity'
        );
        
        System.assertEquals(0, nullTermResults.size(), 'Should return empty list for null search term');
        
        // Test with null objects list
        List<Map<String, Object>> nullObjectsResults = NuvitekCustomThemeLayoutServices.searchAcrossObjects(
            'Test', 
            null
        );
        
        System.assertEquals(0, nullObjectsResults.size(), 'Should return empty list for null objects list');
        
        // Test with invalid object type to test exception handling
        try {
            List<Map<String, Object>> invalidObjectResults = NuvitekCustomThemeLayoutServices.searchAcrossObjects(
                'Test', 
                'Account,NonExistentObject,Contact'
            );
            
            // The method should catch the exception internally and return an empty list or valid partial results
            System.assertNotEquals(null, invalidObjectResults, 'Result should not be null even with invalid object');
        } catch (Exception e) {
            System.assert(false, 'No exception should be thrown, it should be caught internally: ' + e.getMessage());
        }
        
        Test.stopTest();
    }
    
    /**
     * Test searchAcrossObjects with special characters in search term
     */
    @isTest
    static void testSearchAcrossObjectsSpecialChars() {
        Test.startTest();
        
        // Create fixed search results for testing
        Id acctId = [SELECT Id FROM Account WHERE Name = 'Test Search Account 0' LIMIT 1].Id;
        
        List<Id> fixedSearchResults = new List<Id>{acctId};
        Test.setFixedSearchResults(fixedSearchResults);
        
        // Execute search with special characters that should be escaped
        List<Map<String, Object>> results = NuvitekCustomThemeLayoutServices.searchAcrossObjects(
            'Test\'s & "Quotes"', 
            'Account'
        );
        
        // Validate that the search executed without error
        System.assertNotEquals(null, results, 'Search results should not be null with special chars');
        
        Test.stopTest();
    }
    
    /**
     * Test searchAcrossObjects with different object combinations
     */
    @isTest
    static void testSearchAcrossObjectsCombinations() {
        Test.startTest();
        
        Id acctId = [SELECT Id FROM Account WHERE Name = 'Test Search Account 0' LIMIT 1].Id;
        Test.setFixedSearchResults(new List<Id>{acctId});
        
        // Test with a single object
        List<Map<String, Object>> singleResults = NuvitekCustomThemeLayoutServices.searchAcrossObjects(
            'Test', 
            'Account'
        );
        
        System.assertNotEquals(null, singleResults, 'Single object search should return results');
        
        // Test with multiple objects with spaces in the list
        List<Map<String, Object>> multiResults = NuvitekCustomThemeLayoutServices.searchAcrossObjects(
            'Test', 
            'Account, Contact, Opportunity'  // Note the spaces after commas
        );
        
        System.assertNotEquals(null, multiResults, 'Multi-object search should return results');
        
        // Test with case variations in object names
        List<Map<String, Object>> caseResults = NuvitekCustomThemeLayoutServices.searchAcrossObjects(
            'Test', 
            'account,CONTACT,Opportunity'  // Mixed case
        );
        
        System.assertNotEquals(null, caseResults, 'Mixed case object names should work');
        
        Test.stopTest();
    }
} 