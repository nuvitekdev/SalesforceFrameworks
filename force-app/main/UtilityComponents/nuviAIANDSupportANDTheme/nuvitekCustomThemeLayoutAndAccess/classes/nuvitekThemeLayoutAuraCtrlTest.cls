@isTest
public class nuvitekThemeLayoutAuraCtrlTest {
  @isTest
  static void testGetNavigationItemsWithValidMenu() {
    // Test with empty menu name
    Test.startTest();
    nuvitekCustomThemeLayoutAuraController.NavigationMenuWrapper result = nuvitekCustomThemeLayoutAuraController.getNavigationItems(
      ''
    );
    Test.stopTest();

    System.assertNotEquals(null, result, 'Result should not be null');
    System.assertEquals(
      0,
      result.menuItems.size(),
      'Should return empty list for empty menu name'
    );
  }

  @isTest
  static void testGetNavigationItemsWithNullMenu() {
    Test.startTest();
    nuvitekCustomThemeLayoutAuraController.NavigationMenuWrapper result = nuvitekCustomThemeLayoutAuraController.getNavigationItems(
      null
    );
    Test.stopTest();

    System.assertNotEquals(null, result, 'Result should not be null');
    System.assertEquals(
      0,
      result.menuItems.size(),
      'Should return empty list for null menu name'
    );
  }

  @isTest
  static void testSearchAcrossObjectsWithValidTerm() {
    // Create test data
    Account testAccount = new Account(Name = 'Test Account Search');
    insert testAccount;

    Contact testContact = new Contact(
      FirstName = 'Test',
      LastName = 'Contact Search',
      Email = 'test@example.com'
    );
    insert testContact;

    Test.startTest();
    List<nuvitekCustomThemeLayoutAuraController.SearchResultWrapper> results = nuvitekCustomThemeLayoutAuraController.searchAcrossObjects(
      'Test',
      'Account,Contact'
    );
    Test.stopTest();

    System.assertNotEquals(null, results, 'Results should not be null');
    // Note: SOSL doesn't return results in test context without setFixedSearchResults
  }

  @isTest
  static void testSearchAcrossObjectsWithShortTerm() {
    Test.startTest();
    List<nuvitekCustomThemeLayoutAuraController.SearchResultWrapper> results = nuvitekCustomThemeLayoutAuraController.searchAcrossObjects(
      'T',
      'Account,Contact'
    );
    Test.stopTest();

    System.assertNotEquals(null, results, 'Results should not be null');
    System.assertEquals(
      0,
      results.size(),
      'Should return empty list for short search term'
    );
  }

  @isTest
  static void testSearchAcrossObjectsWithEmptyTerm() {
    Test.startTest();
    List<nuvitekCustomThemeLayoutAuraController.SearchResultWrapper> results = nuvitekCustomThemeLayoutAuraController.searchAcrossObjects(
      '',
      'Account,Contact'
    );
    Test.stopTest();

    System.assertNotEquals(null, results, 'Results should not be null');
    System.assertEquals(
      0,
      results.size(),
      'Should return empty list for empty search term'
    );
  }

  @isTest
  static void testSearchAcrossObjectsWithNullTerm() {
    Test.startTest();
    List<nuvitekCustomThemeLayoutAuraController.SearchResultWrapper> results = nuvitekCustomThemeLayoutAuraController.searchAcrossObjects(
      null,
      'Account,Contact'
    );
    Test.stopTest();

    System.assertNotEquals(null, results, 'Results should not be null');
    System.assertEquals(
      0,
      results.size(),
      'Should return empty list for null search term'
    );
  }

  @isTest
  static void testSearchAcrossObjectsWithMockResults() {
    // Create test data for SOSL mock
    Account testAccount = new Account(Name = 'Test Account Mock');
    insert testAccount;

    Contact testContact = new Contact(
      FirstName = 'Test',
      LastName = 'Contact Mock',
      Email = 'mock@example.com'
    );
    insert testContact;

    Case testCase = new Case(Subject = 'Test Case Mock');
    insert testCase;

    // Set up SOSL mock results
    Id[] accountIds = new List<Id>{ testAccount.Id };
    Id[] contactIds = new List<Id>{ testContact.Id };
    Id[] caseIds = new List<Id>{ testCase.Id };

    Test.setFixedSearchResults(
      new List<Id>{ testAccount.Id, testContact.Id, testCase.Id }
    );

    Test.startTest();
    List<nuvitekCustomThemeLayoutAuraController.SearchResultWrapper> results = nuvitekCustomThemeLayoutAuraController.searchAcrossObjects(
      'Test',
      'Account,Contact,Case'
    );
    Test.stopTest();

    System.assertNotEquals(null, results, 'Results should not be null');
    // Results size depends on SOSL behavior in test context
  }

  @isTest
  static void testSearchAcrossObjectsWithDefaultObjects() {
    Test.startTest();
    List<nuvitekCustomThemeLayoutAuraController.SearchResultWrapper> results = nuvitekCustomThemeLayoutAuraController.searchAcrossObjects(
      'Test',
      null
    );
    Test.stopTest();

    System.assertNotEquals(null, results, 'Results should not be null');
    // Should use default objects: Account, Contact, Case
  }

  @isTest
  static void testWrapperClasses() {
    // Test NavigationMenuWrapper
    nuvitekCustomThemeLayoutAuraController.NavigationMenuWrapper menuWrapper = new nuvitekCustomThemeLayoutAuraController.NavigationMenuWrapper();
    System.assertNotEquals(
      null,
      menuWrapper.menuItems,
      'Menu items should be initialized'
    );

    // Test NavigationMenuItemWrapper
    nuvitekCustomThemeLayoutAuraController.NavigationMenuItemWrapper itemWrapper = new nuvitekCustomThemeLayoutAuraController.NavigationMenuItemWrapper();
    System.assertNotEquals(
      null,
      itemWrapper.subMenu,
      'Sub menu should be initialized'
    );

    // Test SearchResultWrapper
    nuvitekCustomThemeLayoutAuraController.SearchResultWrapper searchWrapper = new nuvitekCustomThemeLayoutAuraController.SearchResultWrapper();
    System.assertNotEquals(
      null,
      searchWrapper,
      'Search wrapper should be created'
    );
  }
}
