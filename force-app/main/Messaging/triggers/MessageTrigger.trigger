/**
 * Trigger to handle Message__c events
 * Processes updates to messages such as read status changes
 */
trigger MessageTrigger on Message__c (after update) {
    // Check if this is an update operation
    if (Trigger.isUpdate) {
        // Process updated messages
        for (Message__c message : Trigger.new) {
            // Get the old version of the record
            Message__c oldMessage = Trigger.oldMap.get(message.Id);
            
            // Handle read status changes
            if (message.IsRead__c == true && oldMessage.IsRead__c == false) {
                // Perform any additional actions needed when a message is read
                // For example, you could send a notification or update counts
                System.debug('Message marked as read: ' + message.Id);
            }
        }
    }
} 