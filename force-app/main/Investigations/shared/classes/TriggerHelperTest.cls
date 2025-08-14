@isTest
public class TriggerHelperTest {
  @testSetup
  static void setupData() {
    // Create and insert a test Account
    Account testAccount = new Account(Name = 'Test Account');
    insert testAccount;
  }

  @isTest
  static void testCaseTriggerStatus() {
    // Test the initial status
    System.assertEquals(
      false,
      TriggerHelper.getCaseTriggerHasRun(),
      'Initially, Case trigger should not have run'
    );

    // Set the trigger to have run and test
    TriggerHelper.setCaseTriggerHasRun(true);
    System.assertEquals(
      true,
      TriggerHelper.getCaseTriggerHasRun(),
      'Case trigger should have run after setting it'
    );

    // Reset and test again
    TriggerHelper.setCaseTriggerHasRun(false);
    System.assertEquals(
      false,
      TriggerHelper.getCaseTriggerHasRun(),
      'Case trigger should not have run after resetting'
    );
  }

  @isTest
  static void testWhistleBlowerReportTriggerStatus() {
    // Test the initial status
    System.assertEquals(
      false,
      TriggerHelper.getWhistleBlowerReportTriggerHasRun(),
      'Initially, Whistle Blower Report trigger should not have run'
    );

    // Set the trigger to have run and test
    TriggerHelper.setWhistleBlowerReportTriggerHasRun(true);
    System.assertEquals(
      true,
      TriggerHelper.getWhistleBlowerReportTriggerHasRun(),
      'Whistle Blower Report trigger should have run after setting it'
    );

    // Reset and test again
    TriggerHelper.setWhistleBlowerReportTriggerHasRun(false);
    System.assertEquals(
      false,
      TriggerHelper.getWhistleBlowerReportTriggerHasRun(),
      'Whistle Blower Report trigger should not have run after resetting'
    );
  }

  @isTest
  static void testAccountOwnerChanged() {
    // Retrieve the test account created in setupData
    Account testAccount = [SELECT Id FROM Account LIMIT 1];

    // Test the initial status
    System.assertEquals(
      false,
      TriggerHelper.getAccountOwnerHasChangedSet(testAccount.Id),
      'Initially, account owner should not be considered as changed'
    );

    // Add the Account Id and test
    TriggerHelper.addAccountOwnerHasChanged(testAccount.Id);
    System.assertEquals(
      true,
      TriggerHelper.getAccountOwnerHasChangedSet(testAccount.Id),
      'Account owner should be considered as changed after adding the Account Id'
    );
  }
}
