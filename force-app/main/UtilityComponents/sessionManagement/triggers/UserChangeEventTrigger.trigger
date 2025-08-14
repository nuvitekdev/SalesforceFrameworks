trigger UserChangeEventTrigger on UserChangeEvent(after insert) {
  UserChangeEventTriggerHandler.handleAfterInsert(Trigger.new);
}
