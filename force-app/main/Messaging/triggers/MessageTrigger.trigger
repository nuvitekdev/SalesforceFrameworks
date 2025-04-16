/**
 * Trigger for Message__c object
 * Handles notifications and processing for messages
 */
trigger MessageTrigger on Message__c (after insert, after update) {
    
    if (Trigger.isAfter) {
        if (Trigger.isInsert) {
            // Process new messages and send notifications
            List<MessageNotificationService.NotificationRequest> notifications = new List<MessageNotificationService.NotificationRequest>();
            
            for (Message__c message : Trigger.new) {
                // Only send notifications for messages to other users (not self)
                if (message.Sender__c != message.Recipient__c) {
                    // Create notification request
                    MessageNotificationService.NotificationRequest req = new MessageNotificationService.NotificationRequest();
                    req.messageId = message.Id;
                    
                    // For direct messages
                    if (String.isBlank(message.Channel__c)) {
                        req.recipientId = message.Recipient__c;
                        
                        // Get sender name
                        User sender = [SELECT Name FROM User WHERE Id = :message.Sender__c LIMIT 1];
                        req.senderName = sender.Name;
                    } 
                    // For channel messages
                    else {
                        // Find all users who have participated in the channel
                        Set<Id> channelParticipants = new Set<Id>();
                        for (Message__c existingMsg : [
                            SELECT Sender__c 
                            FROM Message__c 
                            WHERE Channel__c = :message.Channel__c
                            AND Sender__c != :message.Sender__c
                        ]) {
                            channelParticipants.add(existingMsg.Sender__c);
                        }
                        
                        // For each participant, create a notification
                        User sender = [SELECT Name FROM User WHERE Id = :message.Sender__c LIMIT 1];
                        
                        for (Id participant : channelParticipants) {
                            MessageNotificationService.NotificationRequest channelReq = new MessageNotificationService.NotificationRequest();
                            channelReq.messageId = message.Id;
                            channelReq.recipientId = participant;
                            channelReq.senderName = sender.Name;
                            channelReq.content = message.Content__c;
                            channelReq.channelName = message.Channel__c;
                            
                            notifications.add(channelReq);
                        }
                        
                        // Skip adding the main notification for channel messages
                        continue;
                    }
                    
                    req.content = message.Content__c;
                    notifications.add(req);
                }
            }
            
            // Send notifications
            if (!notifications.isEmpty()) {
                MessageNotificationService.sendMessageNotification(notifications);
            }
        }
        
        if (Trigger.isUpdate) {
            // Process message updates (like marking as read)
            // This could update UI counters, etc.
            List<Message__c> readMessages = new List<Message__c>();
            
            for (Message__c message : Trigger.new) {
                Message__c oldMessage = Trigger.oldMap.get(message.Id);
                
                // Check if message was marked as read
                if (!oldMessage.IsRead__c && message.IsRead__c) {
                    readMessages.add(message);
                }
            }
            
            // Process read messages
            // This could update unread counts, etc.
        }
    }
} 