public with sharing class nuvitekCustomThemeLayoutAuraController {
    
    /**
     * Get navigation items for a specified menu
     * @param menuName The name of the navigation menu to retrieve
     * @return NavigationMenuWrapper containing menu items
     */
    @AuraEnabled
    public static NavigationMenuWrapper getNavigationItems(String menuName) {
        try {
            if (String.isBlank(menuName)) {
                return new NavigationMenuWrapper();
            }
            
            // Get the navigation menu by name
            List<NavigationMenuItem> menuItems = [
                SELECT Id, Label, Target, Type, Position, ParentId, 
                       DefaultListViewId, AccessRestriction,
                       TargetPrefs
                FROM NavigationMenuItem 
                WHERE NavigationLinkSetId IN (
                    SELECT Id FROM NavigationLinkSet 
                    WHERE DeveloperName = :menuName 
                    AND NetworkId = :Network.getNetworkId()
                )
                ORDER BY Position ASC
            ];
            
            NavigationMenuWrapper wrapper = new NavigationMenuWrapper();
            wrapper.menuItems = new List<NavigationMenuItemWrapper>();
            
            // Create a map to organize parent-child relationships
            Map<Id, List<NavigationMenuItem>> childrenMap = new Map<Id, List<NavigationMenuItem>>();
            List<NavigationMenuItem> topLevelItems = new List<NavigationMenuItem>();
            
            // Organize items by parent relationship
            for (NavigationMenuItem item : menuItems) {
                if (item.ParentId == null) {
                    topLevelItems.add(item);
                } else {
                    if (!childrenMap.containsKey(item.ParentId)) {
                        childrenMap.put(item.ParentId, new List<NavigationMenuItem>());
                    }
                    childrenMap.get(item.ParentId).add(item);
                }
            }
            
            // Process top-level items
            for (NavigationMenuItem item : topLevelItems) {
                NavigationMenuItemWrapper itemWrapper = createMenuItemWrapper(item);
                
                // Add children if they exist
                if (childrenMap.containsKey(item.Id)) {
                    itemWrapper.subMenu = new List<NavigationMenuItemWrapper>();
                    for (NavigationMenuItem childItem : childrenMap.get(item.Id)) {
                        itemWrapper.subMenu.add(createMenuItemWrapper(childItem));
                    }
                }
                
                wrapper.menuItems.add(itemWrapper);
            }
            
            return wrapper;
            
        } catch (Exception e) {
            System.debug('Error getting navigation items: ' + e.getMessage());
            return new NavigationMenuWrapper();
        }
    }
    
    /**
     * Create a wrapper for a navigation menu item
     */
    private static NavigationMenuItemWrapper createMenuItemWrapper(NavigationMenuItem item) {
        NavigationMenuItemWrapper wrapper = new NavigationMenuItemWrapper();
        wrapper.id = item.Id;
        wrapper.label = item.Label;
        wrapper.actionValue = getActionValue(item);
        wrapper.actionType = getActionType(item);
        wrapper.imageUrl = null; // Navigation items don't typically have images
        
        return wrapper;
    }
    
    /**
     * Get the action value (URL/target) from navigation item
     */
    private static String getActionValue(NavigationMenuItem item) {
        String actionValue = item.Target;
        
        // Handle different target types
        if (String.isNotBlank(item.TargetPrefs)) {
            try {
                Map<String, Object> targetPrefs = (Map<String, Object>) JSON.deserializeUntyped(item.TargetPrefs);
                if (targetPrefs.containsKey('url')) {
                    actionValue = (String) targetPrefs.get('url');
                }
            } catch (Exception e) {
                System.debug('Error parsing target prefs: ' + e.getMessage());
            }
        }
        
        return actionValue;
    }
    
    /**
     * Get the action type for navigation
     */
    private static String getActionType(NavigationMenuItem item) {
        if (String.isNotBlank(item.Target)) {
            if (item.Target.startsWith('http://') || item.Target.startsWith('https://')) {
                return 'ExternalLink';
            }
        }
        return 'InternalLink';
    }
    
    /**
     * Search across multiple objects
     * @param searchTerm The term to search for
     * @param objectsToSearch Comma-separated list of objects to search
     * @return List of search results
     */
    @AuraEnabled
    public static List<SearchResultWrapper> searchAcrossObjects(String searchTerm, String objectsToSearch) {
        List<SearchResultWrapper> results = new List<SearchResultWrapper>();
        
        try {
            if (String.isBlank(searchTerm) || searchTerm.length() < 2) {
                return results;
            }
            
            // Clean and prepare search term
            String cleanSearchTerm = String.escapeSingleQuotes(searchTerm.trim());
            List<String> objects = String.isNotBlank(objectsToSearch) ? 
                objectsToSearch.split(',') : new List<String>{'Account', 'Contact', 'Case'};
            
            // Build SOSL query
            String soslQuery = 'FIND \'' + cleanSearchTerm + '*\' IN NAME FIELDS RETURNING ';
            List<String> objectQueries = new List<String>();
            
            for (String obj : objects) {
                String objName = obj.trim();
                if (objName == 'Account') {
                    objectQueries.add('Account(Id, Name LIMIT 5)');
                } else if (objName == 'Contact') {
                    objectQueries.add('Contact(Id, Name, Email LIMIT 5)');
                } else if (objName == 'Case') {
                    objectQueries.add('Case(Id, CaseNumber, Subject LIMIT 5)');
                }
            }
            
            if (objectQueries.isEmpty()) {
                return results;
            }
            
            soslQuery += String.join(objectQueries, ', ') + ' LIMIT 20';
            
            // Execute search
            List<List<SObject>> searchResults = Search.query(soslQuery);
            
            // Process results
            for (List<SObject> objectResults : searchResults) {
                for (SObject record : objectResults) {
                    SearchResultWrapper wrapper = new SearchResultWrapper();
                    wrapper.id = record.Id;
                    wrapper.objectType = String.valueOf(record.getSObjectType());
                    
                    // Set name based on object type
                    if (record instanceof Account) {
                        wrapper.name = ((Account) record).Name;
                    } else if (record instanceof Contact) {
                        Contact contact = (Contact) record;
                        wrapper.name = contact.Name;
                        if (String.isNotBlank(contact.Email)) {
                            wrapper.name += ' (' + contact.Email + ')';
                        }
                    } else if (record instanceof Case) {
                        Case caseRecord = (Case) record;
                        wrapper.name = caseRecord.CaseNumber;
                        if (String.isNotBlank(caseRecord.Subject)) {
                            wrapper.name += ' - ' + caseRecord.Subject;
                        }
                    } else {
                        wrapper.name = String.valueOf(record.get('Name'));
                    }
                    
                    results.add(wrapper);
                }
            }
            
        } catch (Exception e) {
            System.debug('Error in search: ' + e.getMessage());
        }
        
        return results;
    }
    
    /**
     * Wrapper class for navigation menu
     */
    public class NavigationMenuWrapper {
        @AuraEnabled public List<NavigationMenuItemWrapper> menuItems;
        
        public NavigationMenuWrapper() {
            this.menuItems = new List<NavigationMenuItemWrapper>();
        }
    }
    
    /**
     * Wrapper class for navigation menu items
     */
    public class NavigationMenuItemWrapper {
        @AuraEnabled public String id;
        @AuraEnabled public String label;
        @AuraEnabled public String actionValue;
        @AuraEnabled public String actionType;
        @AuraEnabled public String imageUrl;
        @AuraEnabled public List<NavigationMenuItemWrapper> subMenu;
        
        public NavigationMenuItemWrapper() {
            this.subMenu = new List<NavigationMenuItemWrapper>();
        }
    }
    
    /**
     * Wrapper class for search results
     */
    public class SearchResultWrapper {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public String objectType;
    }
}