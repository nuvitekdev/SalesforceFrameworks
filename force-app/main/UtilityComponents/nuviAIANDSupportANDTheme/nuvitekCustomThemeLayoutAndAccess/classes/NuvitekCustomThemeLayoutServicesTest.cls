@isTest
private class NuvitekCustomThemeLayoutServicesTest {
    
    /**
     * Set up test data for navigation menu testing
     */
    private static void setupNavigationMockData() {
        // Create mock NavigationLinkSet without explicit IDs
        NavigationLinkSet mockNavMenu = new NavigationLinkSet(
            MasterLabel = 'Test Menu',
            DeveloperName = 'Test_Menu'
        );
        
        // Create another mock menu for coverage
        NavigationLinkSet mockNavMenu2 = new NavigationLinkSet(
            MasterLabel = 'Another Menu',
            DeveloperName = 'Another_Menu'
        );
        
        // Add to mock data list
        NuvitekCustomThemeLayoutServices.mockNavLinkSets.add(mockNavMenu);
        NuvitekCustomThemeLayoutServices.mockNavLinkSets.add(mockNavMenu2);
        
        // Create parent menu items without explicit IDs
        NavigationMenuItem parentItem1 = new NavigationMenuItem(
            Label = 'Parent Item 1',
            Position = 1,
            Target = 'https://example.com/1',
            Type = 'ExternalLink',
            Status = 'Live',
            NavigationLinkSetId = mockNavMenu.Id
        );
        
        NavigationMenuItem parentItem2 = new NavigationMenuItem(
            Label = 'Parent Item 2',
            Position = 2,
            Target = 'https://example.com/2',
            Type = 'ExternalLink',
            Status = 'Live',
            NavigationLinkSetId = mockNavMenu.Id
        );
        
        // Add items to mock data list first so they get mock IDs
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(parentItem1);
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(parentItem2);
        
        // Create child menu items
        NavigationMenuItem childItem1 = new NavigationMenuItem(
            Label = 'Child Item 1',
            Position = 1,
            Target = 'https://example.com/child1',
            Type = 'ExternalLink',
            Status = 'Live',
            ParentId = parentItem1.Id,
            NavigationLinkSetId = mockNavMenu.Id
        );
        
        NavigationMenuItem childItem2 = new NavigationMenuItem(
            Label = 'Child Item 2',
            Position = 2,
            Target = 'https://example.com/child2',
            Type = 'ExternalLink',
            Status = 'Live',
            ParentId = parentItem2.Id,
            NavigationLinkSetId = mockNavMenu.Id
        );
        
        // Add child items to mock data list
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(childItem1);
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(childItem2);
    }
    
    /**
     * Set up a more complex navigation structure with multiple levels and different item types
     */
    private static void setupComplexNavigationMockData() {
        // Create mock NavigationLinkSet
        NavigationLinkSet mockComplexMenu = new NavigationLinkSet(
            MasterLabel = 'Complex Menu',
            DeveloperName = 'Complex_Menu'
        );
        
        NuvitekCustomThemeLayoutServices.mockNavLinkSets.add(mockComplexMenu);
        
        // Create parent menu items
        NavigationMenuItem topLevelItem1 = new NavigationMenuItem(
            Label = 'Top Level 1',
            Position = 1,
            Target = '/top1',
            Type = 'InternalLink',
            Status = 'Live',
            NavigationLinkSetId = mockComplexMenu.Id
        );
        
        NavigationMenuItem topLevelItem2 = new NavigationMenuItem(
            Label = 'Top Level 2',
            Position = 2,
            Target = '/top2',
            Type = 'InternalLink',
            Status = 'Live',
            NavigationLinkSetId = mockComplexMenu.Id
        );
        
        NavigationMenuItem topLevelItem3 = new NavigationMenuItem(
            Label = 'Top Level 3',
            Position = 3,
            Target = 'https://external.example.com',
            Type = 'ExternalLink',
            Status = 'Live',
            NavigationLinkSetId = mockComplexMenu.Id
        );
        
        // Add items to mock data list
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(topLevelItem1);
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(topLevelItem2);
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(topLevelItem3);
        
        // Create second-level items
        NavigationMenuItem secondLevel1 = new NavigationMenuItem(
            Label = 'Second Level 1',
            Position = 1,
            Target = '/second1',
            Type = 'InternalLink',
            Status = 'Live',
            ParentId = topLevelItem1.Id,
            NavigationLinkSetId = mockComplexMenu.Id
        );
        
        NavigationMenuItem secondLevel2 = new NavigationMenuItem(
            Label = 'Second Level 2',
            Position = 2,
            Target = '/second2',
            Type = 'InternalLink',
            Status = 'Live',
            ParentId = topLevelItem1.Id,
            NavigationLinkSetId = mockComplexMenu.Id
        );
        
        NavigationMenuItem secondLevel3 = new NavigationMenuItem(
            Label = 'Second Level 3',
            Position = 1,
            Target = '/second3',
            Type = 'InternalLink',
            Status = 'Live',
            ParentId = topLevelItem2.Id,
            NavigationLinkSetId = mockComplexMenu.Id
        );
        
        // Add second-level items to mock data list
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(secondLevel1);
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(secondLevel2);
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(secondLevel3);
        
        // Create third-level items (deep nesting)
        NavigationMenuItem thirdLevel1 = new NavigationMenuItem(
            Label = 'Third Level 1',
            Position = 1,
            Target = '/third1',
            Type = 'InternalLink',
            Status = 'Live',
            ParentId = secondLevel1.Id,
            NavigationLinkSetId = mockComplexMenu.Id
        );
        
        // Add third-level item to mock data list
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(thirdLevel1);
    }
    
    /**
     * Test getNavigationItems with null/blank menu name
     */
    @isTest
    static void testGetNavigationItemsBlankMenuName() {
        Test.startTest();
        Map<String, Object> result = NuvitekCustomThemeLayoutServices.getNavigationItems('');
        Test.stopTest();
    }
    
    /**
     * Test getNavigationItems with valid menu name
     */
    @isTest
    static void testGetNavigationItemsValidMenuName() {
        // Set up mock data
        setupNavigationMockData();
        
        Test.startTest();
        Map<String, Object> result = NuvitekCustomThemeLayoutServices.getNavigationItems('Test_Menu');
        Test.stopTest();
    }
    
    /**
     * Test getNavigationItems with menu name that doesn't exist
     */
    @isTest
    static void testGetNavigationItemsNonExistentMenuName() {
        // Set up mock data
        setupNavigationMockData();
        
        Test.startTest();
        Map<String, Object> result = NuvitekCustomThemeLayoutServices.getNavigationItems('Non_Existent_Menu');
        Test.stopTest();
    }
    
    /**
     * Test getNavigationItems with alternative approach to cover all paths
     */
    @isTest
    static void testGetNavigationItemsAllPaths() {
        NavigationLinkSet mockNavMenu = new NavigationLinkSet(
            MasterLabel = 'Main Menu',
            DeveloperName = 'Main_Menu'
        );
        
        // Create parent menu item
        NavigationMenuItem parentItem = new NavigationMenuItem(
            Label = 'Parent Menu',
            Position = 1,
            Target = '/home',
            Type = 'InternalLink',
            Status = 'Live',
            NavigationLinkSetId = mockNavMenu.Id
        );
        
        // Clear any existing mock data and add our new mocks
        NuvitekCustomThemeLayoutServices.mockNavLinkSets.clear();
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.clear();
        
        NuvitekCustomThemeLayoutServices.mockNavLinkSets.add(mockNavMenu);
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(parentItem);
        
        Test.startTest();
        Map<String, Object> result = NuvitekCustomThemeLayoutServices.getNavigationItems('Main_Menu');
        Test.stopTest();
    }
    
    /**
     * Test getNavigationItems with empty mockNavLinkSets but running in test context
     */
    @isTest
    static void testGetNavigationItemsEmptyMocks() {
        // Clear mock data but keep test context
        NuvitekCustomThemeLayoutServices.mockNavLinkSets.clear();
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.clear();
        
        Test.startTest();
        // Even though mock data is empty, we're still in test context
        // This should hit the condition: Test.isRunningTest() && !mockNavLinkSets.isEmpty()
        // where !mockNavLinkSets.isEmpty() evaluates to false
        Map<String, Object> result = NuvitekCustomThemeLayoutServices.getNavigationItems('Test_Menu');
        Test.stopTest();
    }
    
    /**
     * Test getNavigationItems with complex navigation structure to test different scenarios
     */
    @isTest
    static void testComplexNavigationStructure() {
        // Set up complex navigation data
        setupComplexNavigationMockData();
        
        // Clear existing mock data first to ensure clean state
        NuvitekCustomThemeLayoutServices.mockNavLinkSets.clear();
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.clear();
        
        // Set up complex navigation data again
        setupComplexNavigationMockData();
        
        Test.startTest();
        Map<String, Object> result = NuvitekCustomThemeLayoutServices.getNavigationItems('Complex_Menu');
        Test.stopTest();
    }
    
    /**
     * Test getNavigationItems with no parent-child relationships
     */
    @isTest
    static void testNavigationItemsNoParentChild() {
        // Clear mock data
        NuvitekCustomThemeLayoutServices.mockNavLinkSets.clear();
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.clear();
        
        // Create menu with only parent items, no children
        NavigationLinkSet mockMenu = new NavigationLinkSet(
            MasterLabel = 'Flat Menu',
            DeveloperName = 'Flat_Menu'
        );
        NuvitekCustomThemeLayoutServices.mockNavLinkSets.add(mockMenu);
        
        // Add 3 top-level items with no children
        for (Integer i = 1; i <= 3; i++) {
            NavigationMenuItem item = new NavigationMenuItem(
                Label = 'Item ' + i,
                Position = i,
                Target = '/path' + i,
                Type = 'InternalLink',
                Status = 'Live',
                NavigationLinkSetId = mockMenu.Id
                // No ParentId set - these are top-level items
            );
            NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(item);
        }
        
        Test.startTest();
        Map<String, Object> result = NuvitekCustomThemeLayoutServices.getNavigationItems('Flat_Menu');
        Test.stopTest();
    }
    
    /**
     * Test getNavigationItems exception handling
     */
    @isTest
    static void testNavigationExceptionHandling() {
        Test.startTest();
        
        // Test with a menu name that doesn't exist
        NuvitekCustomThemeLayoutServices.mockNavLinkSets.clear();
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.clear();
        NuvitekCustomThemeLayoutServices.getNavigationItems('Invalid_Menu');
        
        // Try to force an exception
        NuvitekCustomThemeLayoutServices.mockNavLinkSets.clear();
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.clear();
        
        // Add an invalid NavigationLinkSet
        NavigationLinkSet invalidMenu = new NavigationLinkSet();
        NuvitekCustomThemeLayoutServices.mockNavLinkSets.add(invalidMenu);
        
        // Add an invalid NavigationMenuItem
        NavigationMenuItem invalidItem = new NavigationMenuItem();
        invalidItem.NavigationLinkSetId = invalidMenu.Id;
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(invalidItem);
        
        try {
            NuvitekCustomThemeLayoutServices.getNavigationItems('Invalid_Menu');
        } catch (Exception e) {
            // Just catch any exception and continue
        }
        
        Test.stopTest();
    }
    
    /**
     * Test getNavigationItems with only children, no parents
     */
    @isTest
    static void testNavigationItemsOnlyChildren() {
        // Clear mock data
        NuvitekCustomThemeLayoutServices.mockNavLinkSets.clear();
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.clear();
        
        // Create menu
        NavigationLinkSet mockMenu = new NavigationLinkSet(
            MasterLabel = 'Orphan Menu',
            DeveloperName = 'Orphan_Menu'
        );
        NuvitekCustomThemeLayoutServices.mockNavLinkSets.add(mockMenu);
        
        // Create a parent item first (we need its ID)
        NavigationMenuItem parentItem = new NavigationMenuItem(
            Label = 'Parent Item',
            Position = 1,
            Target = '/parent',
            Type = 'InternalLink',
            Status = 'Live',
            NavigationLinkSetId = mockMenu.Id
        );
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(parentItem);
        
        // Create child items only
        for (Integer i = 1; i <= 3; i++) {
            NavigationMenuItem childItem = new NavigationMenuItem(
                Label = 'Child ' + i,
                Position = i,
                Target = '/child' + i,
                Type = 'InternalLink',
                Status = 'Live',
                ParentId = parentItem.Id, // Associate with parent
                NavigationLinkSetId = mockMenu.Id
            );
            NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(childItem);
        }
        
        // Now remove the parent (leaving orphaned children)
        NuvitekCustomThemeLayoutServices.mockNavMenuItems.clear();
        
        // Re-add only children (now they have ParentId but parent doesn't exist)
        for (Integer i = 1; i <= 3; i++) {
            NavigationMenuItem orphanItem = new NavigationMenuItem(
                Label = 'Orphan ' + i,
                Position = i,
                Target = '/orphan' + i,
                Type = 'InternalLink',
                Status = 'Live',
                ParentId = parentItem.Id, // Parent with this ID no longer exists
                NavigationLinkSetId = mockMenu.Id
            );
            NuvitekCustomThemeLayoutServices.mockNavMenuItems.add(orphanItem);
        }
        
        Test.startTest();
        Map<String, Object> result = NuvitekCustomThemeLayoutServices.getNavigationItems('Orphan_Menu');
        Test.stopTest();
    }
    
    /**
     * Test searchAcrossObjects with blank input
     */
    @isTest
    static void testSearchAcrossObjectsBlankInput() {
        Test.startTest();
        NuvitekCustomThemeLayoutServices.searchAcrossObjects('', 'Account,Contact');
        NuvitekCustomThemeLayoutServices.searchAcrossObjects('test', '');
        NuvitekCustomThemeLayoutServices.searchAcrossObjects('', '');
        Test.stopTest();
    }
    
    /**
     * Test searchAcrossObjects with valid input
     */
    @isTest
    static void testSearchAcrossObjectsValidInput() {
        Test.startTest();
        NuvitekCustomThemeLayoutServices.searchAcrossObjects('test', 'Account,Contact,Opportunity');
        Test.stopTest();
    }
    
    /**
     * Test searchAcrossObjects with single object
     */
    @isTest
    static void testSearchAcrossObjectsSingleObject() {
        Test.startTest();
        NuvitekCustomThemeLayoutServices.searchAcrossObjects('test', 'Account');
        Test.stopTest();
    }
    
    /**
     * Test searchAcrossObjects with special characters and whitespace
     */
    @isTest
    static void testSearchAcrossObjectsSpecialChars() {
        Test.startTest();
        NuvitekCustomThemeLayoutServices.searchAcrossObjects('Special\'Char"s!', ' Account , Contact ');
        Test.stopTest();
    }
    
    /**
     * Test searchAcrossObjects with empty object list items
     */
    @isTest
    static void testSearchAcrossObjectsEmptyItems() {
        Test.startTest();
        // Test with empty items in the list
        NuvitekCustomThemeLayoutServices.searchAcrossObjects('test', 'Account,,Contact, ,');
        
        // Test with only whitespace items
        NuvitekCustomThemeLayoutServices.searchAcrossObjects('test', ' , ,  ,');
        
        // Test with trailing commas
        NuvitekCustomThemeLayoutServices.searchAcrossObjects('test', 'Account,Contact,');
        Test.stopTest();
    }
    
    /**
     * Test searchAcrossObjects with many objects
     */
    @isTest
    static void testSearchAcrossObjectsManyObjects() {
        Test.startTest();
        // Test with many objects to hit different branches in result processing
        NuvitekCustomThemeLayoutServices.searchAcrossObjects('test', 
            'Account,Contact,Opportunity,Lead,Case,User,Campaign,Contract');
        Test.stopTest();
    }
    
    /**
     * Test searchAcrossObjects with multiple calls to ensure all code paths are covered
     */
    @isTest
    static void testSearchAcrossObjectsMultipleCalls() {
        Test.startTest();
        
        // First call
        NuvitekCustomThemeLayoutServices.searchAcrossObjects('test1', 'Account');
        
        // Second call with different parameters
        NuvitekCustomThemeLayoutServices.searchAcrossObjects('test2', 'Contact');
        
        // Third call with different parameters
        NuvitekCustomThemeLayoutServices.searchAcrossObjects('test3', 'Opportunity');
        
        Test.stopTest();
    }
    
    /**
     * Test searchAcrossObjects exception path
     */
    @isTest
    static void testSearchAcrossObjectsException() {
        Test.startTest();
        
        try {
            NuvitekCustomThemeLayoutServices.searchAcrossObjects('test', 'InvalidObjectName');
        } catch (Exception e) {
            // Just catch any exception and continue
        }
        
        Test.stopTest();
    }
    
    /**
     * Test searchAcrossObjects with empty results from SOSL
     */
    @isTest
    static void testSearchAcrossObjectsEmptyResults() {
        // Set up mock to return empty results
        Test.setFixedSearchResults(new List<Id>());
        
        Test.startTest();
        NuvitekCustomThemeLayoutServices.searchAcrossObjects('nonexistentterm', 'Account,Contact');
        Test.stopTest();
    }
}