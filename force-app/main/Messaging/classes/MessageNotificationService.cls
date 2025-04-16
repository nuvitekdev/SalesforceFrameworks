/**
 * Service class for handling message notifications
 * Provides methods for sending custom notifications to users
 */
public with sharing class MessageNotificationService {
    
    // Static map to store unread counts in memory
    private static Map<String, Integer> unreadCountMap = new Map<String, Integer>();
    
    /**
     * Send a notification to a user when they receive a new message
     * @param messageId - The ID of the message
     * @param recipientId - The ID of the recipient user
     * @param senderName - The name of the message sender
     * @param content - The content of the message
     * @param channelName - The name of the channel (if applicable)
     */
    @InvocableMethod(label='Send Message Notification' description='Sends a notification to a user for a new message')
    public static void sendMessageNotification(List<NotificationRequest> requests) {
        if (requests == null || requests.isEmpty()) {
            return;
        }
        
        // Process each notification request
        for (NotificationRequest req : requests) {
            sendSingleNotification(req);
        }
    }
    
    /**
     * Send a single notification for a new message
     * @param req - NotificationRequest with message details
     */
    private static void sendSingleNotification(NotificationRequest req) {
        try {
            // Skip if the recipient is the sender (self-messages)
            if (req.recipientId == UserInfo.getUserId()) {
                return;
            }
            
            // Create a custom notification
            Messaging.CustomNotification notification = new Messaging.CustomNotification();
            
            // Set notification type - needs to be created in setup
            CustomNotificationType notificationType = [
                SELECT Id, DeveloperName 
                FROM CustomNotificationType 
                WHERE DeveloperName = 'Message_Notification'
                LIMIT 1
            ];
            notification.setNotificationTypeId(notificationType.Id);
            
            // Set notification title and body
            String title = req.channelName != null ? 'New message in ' + req.channelName : 'New message from ' + req.senderName;
            String body = req.content.length() > 100 ? req.content.substring(0, 97) + '...' : req.content;
            
            notification.setTitle(title);
            notification.setBody(body);
            
            // Set target (the message record)
            notification.setTargetId(req.messageId);
            
            // Send notification to recipient
            Set<String> recipients = new Set<String>{ req.recipientId };
            notification.send(recipients);
            
            // Update the unread count for UI display
            updateUnreadCount(req.recipientId, req.channelName);
            
        } catch (Exception e) {
            System.debug('Error sending notification: ' + e.getMessage());
        }
    }
    
    /**
     * Update the unread message count for a user
     * @param userId - The ID of the user
     * @param channelName - The channel name (if applicable)
     */
    private static void updateUnreadCount(String userId, String channelName) {
        try {
            // Query for the unread messages
            Integer unreadCount;
            
            if (String.isNotBlank(channelName)) {
                // For channel messages
                unreadCount = [
                    SELECT COUNT() 
                    FROM Message__c 
                    WHERE Channel__c = :channelName 
                    AND Sender__c != :userId
                    AND IsRead__c = false
                ];
            } else {
                // For direct messages
                unreadCount = [
                    SELECT COUNT() 
                    FROM Message__c 
                    WHERE Recipient__c = :userId
                    AND IsRead__c = false
                ];
            }
            
            // Store the count in a custom setting or platform cache for UI access
            // This is a placeholder - you would implement your preferred storage method
            storeUnreadCount(userId, channelName, unreadCount);
            
        } catch (Exception e) {
            System.debug('Error updating unread count: ' + e.getMessage());
        }
    }
    
    /**
     * Store the unread count for a user/channel
     * This is a placeholder - implement your preferred storage method
     */
    private static void storeUnreadCount(String userId, String channelName, Integer count) {
        // Use a static map instead of Platform Cache
        String cacheKey = 'unread_' + userId + '_' + (channelName != null ? channelName : 'direct');
        unreadCountMap.put(cacheKey, count);
        
        // Comment out Platform Cache code that requires configuration
        // Cache.Org.put('unread_' + userId + '_' + (channelName != null ? channelName : 'direct'), count);
        
        // Option 2: Custom Setting (would need to be created)
        // UnreadMessages__c setting = UnreadMessages__c.getInstance(userId);
        // if (setting == null) {
        //     setting = new UnreadMessages__c(SetupOwnerId = userId);
        // }
        // if (String.isNotBlank(channelName)) {
        //     // Store channel unread count in a field
        //     // setting.Channel_Count__c = count;
        // } else {
        //     // Store direct message unread count in a field
        //     // setting.Direct_Count__c = count;
        // }
        // upsert setting;
    }
    
    /**
     * Get the unread count for a user
     * @param userId - The ID of the user
     * @param channelName - The channel name (if applicable)
     * @return Integer - The number of unread messages
     */
    @AuraEnabled
    public static Integer getUnreadCount(String userId, String channelName) {
        // Use static map instead of Platform Cache
        String cacheKey = 'unread_' + userId + '_' + (channelName != null ? channelName : 'direct');
        Integer count = unreadCountMap.get(cacheKey);
        
        // If count is null, just return 0
        return count != null ? count : 0;
    }
    
    /**
     * Class for handling notification requests
     */
    public class NotificationRequest {
        @InvocableVariable(required=true)
        public Id messageId;
        
        @InvocableVariable(required=true)
        public Id recipientId;
        
        @InvocableVariable(required=true)
        public String senderName;
        
        @InvocableVariable(required=true)
        public String content;
        
        @InvocableVariable
        public String channelName;
    }
} 