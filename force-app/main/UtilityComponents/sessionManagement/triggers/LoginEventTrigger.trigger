trigger LoginEventTrigger on LoginEvent(after insert) {
  LoginEventTriggerHandler.handleAfterInsert(Trigger.new);
}
