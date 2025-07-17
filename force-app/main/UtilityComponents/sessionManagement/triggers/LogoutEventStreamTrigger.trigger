trigger LogoutEventStreamTrigger on LogoutEventStream(after insert) {
  LogoutEventStreamTriggerHandler.handleAfterInsert(Trigger.new);
}
