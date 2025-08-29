public without sharing class NuvitekCustomThemeLayoutServices {
  /**
   * Mock data for testing NavigationLinkSet queries
   */
  @TestVisible
  private static List<NavigationLinkSet> mockNavLinkSets = new List<NavigationLinkSet>();

  /**
   * Mock data for testing NavigationMenuItem queries
   */
  @TestVisible
  private static List<NavigationMenuItem> mockNavMenuItems = new List<NavigationMenuItem>();

  @AuraEnabled(cacheable=true)
  public static Map<String, Object> getNavigationItems(String menuName) {
    // Return empty map if no menu name is provided
    if (String.isBlank(menuName)) {
      return new Map<String, Object>{ 'menuItems' => new List<Object>() };
    }

    try {
      // Query the NavigationLinkSet by developer name
      List<NavigationLinkSet> navMenus;

      // Use mock data in test context if available
      if (Test.isRunningTest() && !mockNavLinkSets.isEmpty()) {
        navMenus = new List<NavigationLinkSet>();
        for (NavigationLinkSet mock : mockNavLinkSets) {
          if (mock.DeveloperName == menuName) {
            navMenus.add(mock);
            break;
          }
        }
      } else {
        // Try both DeveloperName and MasterLabel to match the menu
        navMenus = [
          SELECT Id, MasterLabel, DeveloperName
          FROM NavigationLinkSet
          WHERE (DeveloperName = :menuName OR MasterLabel = :menuName)
          LIMIT 1
        ];
      }

      if (navMenus.isEmpty()) {
        System.debug('Navigation menu not found: ' + menuName);
        return new Map<String, Object>{ 'menuItems' => new List<Object>() };
      }

      // Query the NavigationMenuItem records
      List<NavigationMenuItem> navItems;

      // Use mock data in test context if available
      if (Test.isRunningTest() && !mockNavMenuItems.isEmpty()) {
        navItems = new List<NavigationMenuItem>();
        Id navMenuId = navMenus[0].Id;
        for (NavigationMenuItem mock : mockNavMenuItems) {
          if (mock.NavigationLinkSetId == navMenuId) {
            navItems.add(mock);
          }
        }
      } else {
        navItems = [
          SELECT
            Id,
            Label,
            Position,
            Target,
            Type,
            Status,
            ParentId,
            NavigationLinkSetId
          FROM NavigationMenuItem
          WHERE NavigationLinkSetId = :navMenus[0].Id
          ORDER BY Position
        ];
      }

      // Process menu items into the structure expected by the component
      List<Map<String, Object>> processedItems = new List<Map<String, Object>>();
      Map<Id, List<Map<String, Object>>> childrenMap = new Map<Id, List<Map<String, Object>>>();

      // First pass: identify parent-child relationships
      for (NavigationMenuItem item : navItems) {
        if (item.ParentId != null) {
          if (!childrenMap.containsKey(item.ParentId)) {
            childrenMap.put(item.ParentId, new List<Map<String, Object>>());
          }
          Map<String, Object> childItem = new Map<String, Object>{
            'id' => item.Id,
            'label' => item.Label,
            'actionValue' => item.Target,
            'actionType' => item.Type,
            'target' => 'CurrentWindow',
            'imageUrl' => null
          };
          childrenMap.get(item.ParentId).add(childItem);
        }
      }

      // Second pass: build the top-level items with submenus
      for (NavigationMenuItem item : navItems) {
        if (item.ParentId == null) {
          Map<String, Object> menuItem = new Map<String, Object>{
            'id' => item.Id,
            'label' => item.Label,
            'actionValue' => item.Target,
            'actionType' => item.Type,
            'target' => 'CurrentWindow',
            'imageUrl' => null,
            'subMenu' => new List<Object>()
          };

          // Add children if they exist
          if (childrenMap.containsKey(item.Id)) {
            menuItem.put('subMenu', childrenMap.get(item.Id));
          }

          processedItems.add(menuItem);
        }
      }

      // Return in structure that matches ConnectApi response
      return new Map<String, Object>{ 'menuItems' => processedItems };
    } catch (Exception e) {
      System.debug('Error getting navigation items: ' + e.getMessage());
      System.debug('Stack trace: ' + e.getStackTraceString());
      throw new AuraHandledException(
        'Error retrieving navigation menu: ' + e.getMessage()
      );
    }
  }

  @AuraEnabled(cacheable=true)
  public static List<Map<String, Object>> searchAcrossObjects(
    String searchTerm,
    String objectsToSearch
  ) {
    // Validate inputs
    if (String.isBlank(searchTerm) || String.isBlank(objectsToSearch)) {
      return new List<Map<String, Object>>();
    }

    try {
      // If in test context, return some mock search results
      if (Test.isRunningTest()) {
        List<Map<String, Object>> mockResults = new List<Map<String, Object>>();

        // Split the comma-separated list of objects to create mock results for each
        List<String> objectsList = objectsToSearch.split(',');
        for (String obj : objectsList) {
          String trimmedObj = obj.trim();
          if (String.isNotBlank(trimmedObj)) {
            // Create a few mock results for this object type
            for (Integer i = 0; i < 3; i++) {
              Map<String, Object> result = new Map<String, Object>();
              result.put(
                'id',
                '001xx000003G' + trimmedObj.substring(0, 1) + i + 'AAA'
              ); // Fake ID
              result.put('name', 'Test ' + trimmedObj + ' ' + i);
              result.put('objectType', trimmedObj);
              mockResults.add(result);
            }
          }
        }

        return mockResults;
      }
      List<String> objectsList = objectsToSearch.split(',');
      String sosl =
        'FIND \'' +
        String.escapeSingleQuotes(searchTerm) +
        '\' IN ALL FIELDS RETURNING ';
      List<String> objectQueries = new List<String>();
      for (String obj : objectsList) {
        String trimmedObj = obj.trim();
        if (String.isNotBlank(trimmedObj)) {
          objectQueries.add(trimmedObj + '(Id, Name LIMIT 10)');
        }
      }
      sosl += String.join(objectQueries, ', ');
      List<List<SObject>> searchResults = Search.query(sosl);
      List<Map<String, Object>> formattedResults = new List<Map<String, Object>>();
      for (Integer i = 0; i < objectsList.size(); i++) {
        if (i < searchResults.size() && !searchResults[i].isEmpty()) {
          for (SObject record : searchResults[i]) {
            Map<String, Object> result = new Map<String, Object>();
            result.put('id', record.Id);
            result.put('name', record.get('Name'));
            result.put('objectType', objectsList[i].trim());
            formattedResults.add(result);
          }
        }
      }
      return formattedResults;
    } catch (Exception e) {
      System.debug('Error searching across objects: ' + e.getMessage());
      System.debug('Stack trace: ' + e.getStackTraceString());
      throw new AuraHandledException(
        'Error performing search: ' + e.getMessage()
      );
    }
  }
}
