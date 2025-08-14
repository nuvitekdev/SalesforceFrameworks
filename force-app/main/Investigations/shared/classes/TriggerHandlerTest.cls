@isTest
public class TriggerHandlerTest {
  @testSetup
  static void setup() {
    // Inserting a common Account record for all tests
    List<Account> accounts = new List<Account>{
      new Account(Name = 'Test Account')
    };
    insert accounts;
  }

  // Utility method to retrieve test account
  static Account getTestAccount() {
    return [SELECT Id, Name FROM Account LIMIT 1];
  }

  // Test for beforeInsert operation
  @isTest
  static void testBeforeInsert() {
    MockTriggerHandler handler = new MockTriggerHandler();
    List<SObject> newRecords = new List<SObject>{ getTestAccount() };

    handler.beforeInsert(newRecords);

    System.assertEquals(
      true,
      handler.beforeInsertCalled,
      'beforeInsert should be called'
    );
  }

  // Test for afterInsert operation
  @isTest
  static void testAfterInsert() {
    MockTriggerHandler handler = new MockTriggerHandler();
    Account testAccount = getTestAccount();

    handler.afterInsert(new Map<Id, SObject>{ testAccount.Id => testAccount });

    System.assertEquals(
      true,
      handler.afterInsertCalled,
      'afterInsert should be called'
    );
  }

  // Test for beforeUpdate operation
  @isTest
  static void testBeforeUpdate() {
    MockTriggerHandler handler = new MockTriggerHandler();
    Account testAccount = getTestAccount();

    testAccount.Name = 'Updated Name';
    Map<Id, SObject> newRecords = new Map<Id, SObject>{
      testAccount.Id => testAccount
    };
    Map<Id, SObject> oldRecords = new Map<Id, SObject>{
      testAccount.Id => testAccount.clone()
    };

    handler.beforeUpdate(newRecords, oldRecords);

    System.assertEquals(
      true,
      handler.beforeUpdateCalled,
      'beforeUpdate should be called'
    );
  }

  // Test for afterUpdate operation
  @isTest
  static void testAfterUpdate() {
    MockTriggerHandler handler = new MockTriggerHandler();
    Account testAccount = getTestAccount();

    testAccount.Name = 'Updated Name';
    update testAccount;
    Map<Id, SObject> newRecords = new Map<Id, SObject>{
      testAccount.Id => testAccount
    };
    Map<Id, SObject> oldRecords = new Map<Id, SObject>{
      testAccount.Id => testAccount.clone()
    };

    handler.afterUpdate(newRecords, oldRecords);

    System.assertEquals(
      true,
      handler.afterUpdateCalled,
      'afterUpdate should be called'
    );
  }

  // Test for beforeDelete operation
  @isTest
  static void testBeforeDelete() {
    MockTriggerHandler handler = new MockTriggerHandler();
    Account testAccount = getTestAccount();

    Map<Id, SObject> oldRecords = new Map<Id, SObject>{
      testAccount.Id => testAccount
    };

    delete testAccount;

    handler.beforeDelete(new Map<Id, SObject>(), oldRecords);

    System.assertEquals(
      true,
      handler.beforeDeleteCalled,
      'beforeDelete should be called'
    );
  }

  // Test for afterDelete operation
  @isTest
  static void testAfterDelete() {
    MockTriggerHandler handler = new MockTriggerHandler();
    Account testAccount = getTestAccount();

    Map<Id, SObject> oldRecords = new Map<Id, SObject>{
      testAccount.Id => testAccount
    };

    delete testAccount;

    handler.afterDelete(new Map<Id, SObject>(), oldRecords);

    System.assertEquals(
      true,
      handler.afterDeleteCalled,
      'afterDelete should be called'
    );
  }

  // Test for afterUnDelete operation
  @isTest
  static void testAfterUnDelete() {
    MockTriggerHandler handler = new MockTriggerHandler();
    Account testAccount = getTestAccount();

    delete testAccount;
    undelete testAccount;

    Map<Id, SObject> newRecords = new Map<Id, SObject>{
      testAccount.Id => testAccount
    };

    handler.afterUnDelete(newRecords, new Map<Id, SObject>());

    System.assertEquals(
      true,
      handler.afterUnDeleteCalled,
      'afterUnDelete should be called'
    );
  }
}
