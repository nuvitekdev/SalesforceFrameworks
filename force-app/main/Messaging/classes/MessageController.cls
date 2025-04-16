/**
 * Controller for the messaging functionality
 * Handles sending and retrieving messages across desktop and mobile
 */
public with sharing class MessageController {
    
    /**
     * Retrieves recent messages for a user or channel
     * @param recipientId - The Id of the recipient user
     * @param channelName - The name of the channel/group chat
     * @return List<Message__c> - A list of recent messages
     */
    @AuraEnabled
    public static List<Message__c> getRecentMessages(String recipientId, String channelName) {
        // Query messages based on recipient or channel
        if (String.isNotBlank(channelName)) {
            return [SELECT Id, Sender__c, Sender__r.Name, Content__c, Timestamp__c, IsRead__c 
                    FROM Message__c 
                    WHERE Channel__c = :channelName
                    ORDER BY Timestamp__c DESC 
                    LIMIT 50];
        } else {
            return [SELECT Id, Sender__c, Sender__r.Name, Content__c, Timestamp__c, IsRead__c 
                    FROM Message__c 
                    WHERE (Sender__c = :UserInfo.getUserId() AND Recipient__c = :recipientId)
                    OR (Sender__c = :recipientId AND Recipient__c = :UserInfo.getUserId())
                    ORDER BY Timestamp__c DESC 
                    LIMIT 50];
        }
    }
    
    /**
     * Sends a message to a recipient or channel
     * @param recipientId - The Id of the recipient user
     * @param content - The message content
     * @param channelName - The name of the channel/group chat
     */
    @AuraEnabled
    public static void sendMessage(String recipientId, String content, String channelName) {
        // Create message record
        Message__c msg = new Message__c(
            Sender__c = UserInfo.getUserId(),
            Content__c = content,
            Timestamp__c = Datetime.now()
        );
        
        if (String.isNotBlank(channelName)) {
            msg.Channel__c = channelName;
        } else {
            msg.Recipient__c = recipientId;
        }
        
        insert msg;
        
        // Publish platform event - using a more direct approach
        // Create a new platform event instance
        SObject platformEvent = Schema.getGlobalDescribe().get('MessageEvent__e').newSObject();
        
        // Set field values
        platformEvent.put('SenderId__c', UserInfo.getUserId());
        platformEvent.put('Content__c', content);
        platformEvent.put('Timestamp__c', Datetime.now());
        
        if (String.isNotBlank(channelName)) {
            platformEvent.put('Channel__c', channelName);
        } else {
            platformEvent.put('RecipientId__c', recipientId);
        }
        
        // Publish the event
        EventBus.publish(platformEvent);
    }
    
    /**
     * Marks a message as read
     * @param messageId - The Id of the message to mark as read
     */
    @AuraEnabled
    public static void markMessageAsRead(String messageId) {
        Message__c message = [SELECT Id, IsRead__c FROM Message__c WHERE Id = :messageId LIMIT 1];
        message.IsRead__c = true;
        update message;
    }

    /**
     * Searches for users that match the search term
     * @param searchTerm - The search term to match against user names
     * @return List<Map<String, Object>> - List of matching users
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> searchUsers(String searchTerm) {
        if (String.isBlank(searchTerm)) {
            return new List<Map<String, Object>>();
        }
        
        // Format search term for SOSL
        String searchKey = '%' + searchTerm + '%';
        
        // Search for users
        List<User> users = [
            SELECT Id, Name, SmallPhotoUrl, Email
            FROM User
            WHERE IsActive = true
            AND Name LIKE :searchKey
            ORDER BY Name
            LIMIT 10
        ];
        
        // Convert to generic maps for consistent return format with contacts
        List<Map<String, Object>> results = new List<Map<String, Object>>();
        for (User user : users) {
            Map<String, Object> result = new Map<String, Object>{
                'id' => user.Id,
                'name' => user.Name,
                'icon' => user.SmallPhotoUrl,
                'subtitle' => 'User • ' + user.Email,
                'type' => 'user'
            };
            results.add(result);
        }
        
        return results;
    }
    
    /**
     * Searches for contacts that match the search term
     * @param searchTerm - The search term to match against contact names
     * @return List<Contact> - List of matching contacts
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> searchContacts(String searchTerm) {
        if (String.isBlank(searchTerm)) {
            return new List<Map<String, Object>>();
        }
        
        // Format search term for SOSL
        String searchKey = '%' + searchTerm + '%';
        
        // Search for contacts
        List<Contact> contacts = [
            SELECT Id, Name, Email, Phone, Account.Name
            FROM Contact
            WHERE Name LIKE :searchKey
            ORDER BY Name
            LIMIT 10
        ];
        
        // Convert to maps
        List<Map<String, Object>> results = new List<Map<String, Object>>();
        for (Contact contact : contacts) {
            String subtitle = 'Contact';
            if (contact.Account != null) {
                subtitle += ' • ' + contact.Account.Name;
            }
            if (String.isNotBlank(contact.Email)) {
                subtitle += ' • ' + contact.Email;
            }
            
            Map<String, Object> result = new Map<String, Object>{
                'id' => contact.Id,
                'name' => contact.Name,
                'icon' => '/img/icon/t4v35/standard/contact_120.png',
                'subtitle' => subtitle,
                'type' => 'contact'
            };
            results.add(result);
        }
        
        return results;
    }
    
    /**
     * Combined search for users and contacts
     * @param searchTerm - The search term to match against names
     * @return List<Map<String, Object>> - List of matching users and contacts
     */
    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> searchRecipients(String searchTerm) {
        if (String.isBlank(searchTerm)) {
            return new List<Map<String, Object>>();
        }
        
        List<Map<String, Object>> users = searchUsers(searchTerm);
        List<Map<String, Object>> contacts = searchContacts(searchTerm);
        
        // Combine results
        List<Map<String, Object>> results = new List<Map<String, Object>>();
        results.addAll(users);
        results.addAll(contacts);
        
        return results;
    }
    
    /**
     * Get all available chat channels
     * @return List<String> - List of channel names
     */
    @AuraEnabled(cacheable=true)
    public static List<String> getChannels() {
        List<AggregateResult> results = [
            SELECT Channel__c
            FROM Message__c
            WHERE Channel__c != null
            GROUP BY Channel__c
            ORDER BY Channel__c
        ];
        
        List<String> channels = new List<String>();
        for (AggregateResult result : results) {
            channels.add((String)result.get('Channel__c'));
        }
        
        return channels;
    }
    
    /**
     * Creates a new chat channel
     * @param channelName - The name of the new channel
     */
    @AuraEnabled
    public static void createChannel(String channelName) {
        if (String.isBlank(channelName)) {
            throw new AuraHandledException('Channel name cannot be blank');
        }
        
        // Create a welcome message in the channel
        Message__c msg = new Message__c(
            Sender__c = UserInfo.getUserId(),
            Content__c = 'Channel created: ' + channelName,
            Channel__c = channelName,
            Timestamp__c = Datetime.now()
        );
        
        insert msg;
    }

    /**
     * Get user information by ID
     * @param userId - The ID of the user to retrieve
     * @return MessageUserInfo - Basic information about the user
     */
    @AuraEnabled
    public static MessageUserInfo getUserInfo(String userId) {
        try {
            User user = [
                SELECT Id, Name, SmallPhotoUrl, Email, Title
                FROM User
                WHERE Id = :userId
                LIMIT 1
            ];
            
            MessageUserInfo info = new MessageUserInfo();
            info.Id = user.Id;
            info.Name = user.Name;
            info.SmallPhotoUrl = user.SmallPhotoUrl;
            info.Email = user.Email;
            info.Title = user.Title;
            
            return info;
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving user information: ' + e.getMessage());
        }
    }

    /**
     * Inner class for returning user information
     */
    public class MessageUserInfo {
        @AuraEnabled public String Id;
        @AuraEnabled public String Name;
        @AuraEnabled public String SmallPhotoUrl;
        @AuraEnabled public String Email;
        @AuraEnabled public String Title;
        
        /**
         * Return the user Id
         * @return String - The ID of the user
         */
        public String getUserId() {
            return this.Id;
        }
    }
} 