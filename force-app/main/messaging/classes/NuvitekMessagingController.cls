/**
 * NuvitekMessagingController
 * 
 * Apex controller for the nuvitekMessaging LWC that handles backend operations
 * like retrieving conversations, messages, and sending messages.
 */
public with sharing class NuvitekMessagingController {
    
    /**
     * Get current user information
     * 
     * @return UserDetails object with user data
     */
    @AuraEnabled(cacheable=true)
    public static UserDetails getCurrentUser() {
        try {
            User currentUser = [
                SELECT Id, Name, SmallPhotoUrl, Email, IsActive 
                FROM User 
                WHERE Id = :UserInfo.getUserId() 
                LIMIT 1
            ];
            
            return new UserDetails(
                currentUser.Id, 
                currentUser.Name, 
                currentUser.SmallPhotoUrl,
                currentUser.Email,
                currentUser.IsActive
            );
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving user information: ' + e.getMessage());
        }
    }
    
    /**
     * Get conversations for the current user
     * 
     * @return List of Conversation objects
     */
    @AuraEnabled
    public static List<Conversation> getConversations() {
        try {
            Id currentUserId = UserInfo.getUserId();
            List<Conversation> conversations = new List<Conversation>();
            
            // Query for all conversations instead of filtering by participant
            List<Conversation__c> allRecords = [
                SELECT Id, RecipientName__c, RecipientId__c, RecipientProfileImage__c, 
                       LastMessage__c, LastMessageDate__c, Participants__c, IsGroup__c, GroupName__c
                FROM Conversation__c 
                ORDER BY LastMessageDate__c DESC
            ];
            
            // Filter on the client side
            for (Conversation__c record : allRecords) {
                // Parse the JSON stored in Participants__c
                if (record.Participants__c != null) {
                    List<String> participants = (List<String>)JSON.deserialize(record.Participants__c, List<String>.class);
                    // Check if current user is a participant
                    if (participants.contains(currentUserId)) {
                        // Determine if the other person is online (simplified example)
                        Boolean isOnline = false;
                        String status = 'Offline';
                        
                        // Check if this is a group conversation
                        if (record.IsGroup__c) {
                            // Get participant names for group display
                            Map<String, String> participantNames = new Map<String, String>();
                            
                            // Filter user IDs (can't use LIKE on ID fields)
                            List<String> userIdsFiltered = new List<String>();
                            for(String pId : participants) {
                                if(pId.startsWith('005')) {
                                    userIdsFiltered.add(pId);
                                }
                            }
                            
                            // Query users with properly filtered IDs
                            if (!userIdsFiltered.isEmpty()) {
                                List<User> users = [SELECT Id, Name FROM User WHERE Id IN :userIdsFiltered];
                                for (User usr : users) {
                                    participantNames.put(usr.Id, usr.Name);
                                }
                            }
                            
                            // Create a list of participant names for display
                            List<String> participantNamesList = new List<String>();
                            for (String pId : participants) {
                                if (participantNames.containsKey(pId)) {
                                    participantNamesList.add(participantNames.get(pId));
                                }
                            }
                            
                            // Limit to a reasonable number to avoid overly long lists
                            if (participantNamesList.size() > 10) {
                                List<String> limitedNames = new List<String>();
                                // Add first 10 names
                                for (Integer i = 0; i < 10 && i < participantNamesList.size(); i++) {
                                    limitedNames.add(participantNamesList[i]);
                                }
                                limitedNames.add('and ' + (participants.size() - 10) + ' more');
                                participantNamesList = limitedNames;
                            }
                            
                            // Set status to the comma-delimited list of participant names
                            status = String.join(participantNamesList, ', ');
                            
                            conversations.add(new Conversation(
                                record.Id,
                                record.RecipientName__c,
                                status,
                                record.LastMessage__c,
                                record.LastMessageDate__c,
                                null, // Group doesn't have a profile image
                                false,
                                0,    // Unread count would be calculated in a real implementation
                                true, // This is a group
                                participants // Add participants list
                            ));
                        } else {
                            // This is a 1-on-1 conversation
                            if (record.RecipientId__c != null && record.RecipientId__c.startsWith('005')) {
                                // If the recipient is a user, check their last login time
                                try {
                                    User recipient = [
                                        SELECT LastLoginDate 
                                        FROM User 
                                        WHERE Id = :record.RecipientId__c
                                        LIMIT 1
                                    ];
                                    
                                    if (recipient.LastLoginDate != null && 
                                        recipient.LastLoginDate > Datetime.now().addMinutes(-15)) {
                                        isOnline = true;
                                        status = 'Active now';
                                    } else if (recipient.LastLoginDate != null) {
                                        status = 'Last seen ' + formatTimeSince(recipient.LastLoginDate);
                                    }
                                } catch (Exception e) {
                                    // Recipient user might not exist anymore, continue with offline status
                                }
                            }
                            
                            conversations.add(new Conversation(
                                record.Id,
                                record.RecipientName__c,
                                status,
                                record.LastMessage__c,
                                record.LastMessageDate__c,
                                record.RecipientProfileImage__c,
                                isOnline,
                                0 // Unread count would be calculated in a real implementation
                            ));
                        }
                    }
                }
            }
            
            return conversations;
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving conversations: ' + e.getMessage());
        }
    }
    
    /**
     * Create a new conversation or get an existing one with the specified user
     * 
     * @param userId The ID of the user or contact to chat with
     * @param userType The type of user (User or Contact)
     * @return Conversation object
     */
    @AuraEnabled
    public static Conversation startConversation(String userId, String userType) {
        try {
            Id currentUserId = UserInfo.getUserId();
            User currentUser = [SELECT Name FROM User WHERE Id = :currentUserId LIMIT 1];
            
            // Get recipient information based on user type
            String recipientName;
            String recipientProfileImage;
            Boolean isOnline = false;
            String status = 'Offline';
            
            // Default to User type if null
            if (userType == null) {
                userType = 'User';
            }
            
            if (userType == 'User') {
                User recipient = [SELECT Id, Name, SmallPhotoUrl, LastLoginDate FROM User WHERE Id = :userId LIMIT 1];
                recipientName = recipient.Name;
                recipientProfileImage = recipient.SmallPhotoUrl;
                
                // Consider a user online if they've logged in within the last 15 minutes
                if (recipient.LastLoginDate != null && 
                    recipient.LastLoginDate > Datetime.now().addMinutes(-15)) {
                    isOnline = true;
                    status = 'Active now';
                } else if (recipient.LastLoginDate != null) {
                    status = 'Last seen ' + formatTimeSince(recipient.LastLoginDate);
                }
            } else if (userType == 'Contact') {
                Contact recipient = [SELECT Id, Name, PhotoUrl FROM Contact WHERE Id = :userId LIMIT 1];
                recipientName = recipient.Name;
                recipientProfileImage = recipient.PhotoUrl != null ? 
                    recipient.PhotoUrl : '/img/icon/t4v35/standard/contact_120.png';
            } else {
                throw new AuraHandledException('Invalid user type: ' + userType);
            }
            
            // Check if a conversation already exists with this user by querying all and filtering
            List<Conversation__c> allConversations = [
                SELECT Id, RecipientName__c, RecipientId__c, RecipientProfileImage__c, 
                       LastMessage__c, LastMessageDate__c, Participants__c
                FROM Conversation__c
            ];
            
            List<Conversation__c> existingConversations = new List<Conversation__c>();
            
            // Filter conversations manually
            for (Conversation__c conv : allConversations) {
                if (conv.Participants__c != null) {
                    List<String> participants = (List<String>)JSON.deserialize(conv.Participants__c, List<String>.class);
                    if (participants.contains(currentUserId) && participants.contains(userId)) {
                        existingConversations.add(conv);
                    }
                }
            }
            
            Conversation__c convoRecord;
            
            if (!existingConversations.isEmpty()) {
                // Use existing conversation
                convoRecord = existingConversations[0];
            } else {
                // Create a new conversation
                String participants = JSON.serialize(new List<String>{currentUserId, userId});
                String welcomeMessage = 'Start chatting with ' + recipientName;
                
                convoRecord = new Conversation__c(
                    Participants__c = participants,
                    RecipientId__c = userId,
                    RecipientName__c = recipientName,
                    RecipientProfileImage__c = recipientProfileImage,
                    LastMessage__c = welcomeMessage,
                    LastMessageDate__c = System.now()
                );
                
                insert convoRecord;
            }
            
            return new Conversation(
                convoRecord.Id,
                convoRecord.RecipientName__c,
                status,
                convoRecord.LastMessage__c,
                convoRecord.LastMessageDate__c,
                convoRecord.RecipientProfileImage__c,
                isOnline,
                0
            );
        } catch (Exception e) {
            throw new AuraHandledException('Error starting conversation: ' + e.getMessage());
        }
    }
    
    /**
     * Get messages for a specific conversation
     * 
     * @param conversationId The ID of the conversation
     * @return List of Message objects
     */
    @AuraEnabled
    public static List<Message> getMessages(String conversationId) {
        try {
            List<Message> messages = new List<Message>();
            
            // Query messages for this conversation
            List<Message__c> records = [
                SELECT Id, Content__c, SenderId__c, SenderName__c, Timestamp__c
                FROM Message__c
                WHERE Conversation__c = :conversationId
                ORDER BY Timestamp__c
            ];
            
            for (Message__c record : records) {
                messages.add(new Message(
                    record.Id,
                    record.Content__c,
                    record.SenderId__c,
                    record.SenderName__c,
                    record.Timestamp__c
                ));
            }
            
            return messages;
        } catch (Exception e) {
            throw new AuraHandledException('Error retrieving messages: ' + e.getMessage());
        }
    }
    
    /**
     * Send a message in a conversation
     * 
     * @param conversationId The ID of the conversation
     * @param message The message content
     * @return The ID of the created message
     */
    @AuraEnabled
    public static String sendMessage(String conversationId, String message) {
        try {
            Id currentUserId = UserInfo.getUserId();
            User currentUser = [SELECT Name FROM User WHERE Id = :currentUserId LIMIT 1];
            
            // Create the message record
            Message__c messageRecord = new Message__c(
                Conversation__c = conversationId,
                Content__c = message,
                SenderId__c = currentUserId,
                SenderName__c = currentUser.Name,
                Timestamp__c = System.now()
            );
            
            insert messageRecord;
            
            // Update the conversation's last message
            Conversation__c convo = [SELECT Id, Participants__c FROM Conversation__c WHERE Id = :conversationId LIMIT 1];
            convo.LastMessage__c = message;
            convo.LastMessageDate__c = System.now();
            
            update convo;
            
            // Create a platform event for real-time messaging
            Nuvitek_Message__e messagingEvent = new Nuvitek_Message__e(
                ConversationId__c = conversationId,
                Message__c = message,
                SenderId__c = currentUserId,
                SenderName__c = currentUser.Name,
                Timestamp__c = System.now()
            );
            
            // Publish the event
            EventBus.publish(messagingEvent);
            
            return messageRecord.Id;
        } catch (Exception e) {
            throw new AuraHandledException('Error sending message: ' + e.getMessage());
        }
    }
    
    /**
     * Search for users or contacts
     * 
     * @param searchTerm The search term to find users/contacts
     * @return List of SearchResult objects
     */
    @AuraEnabled
    public static List<SearchResult> findUserOrContact(String searchTerm) {
        try {
            List<SearchResult> results = new List<SearchResult>();
            
            // Search for users
            String searchQuery = '%' + searchTerm + '%';
            List<User> users = [
                SELECT Id, Name, SmallPhotoUrl, Title
                FROM User
                WHERE Name LIKE :searchQuery AND Id != :UserInfo.getUserId() AND IsActive = true
                LIMIT 10
            ];
            
            for (User u : users) {
                results.add(new SearchResult(
                    u.Id,
                    'User',
                    u.Name,
                    u.Title != null ? u.Title : 'User',
                    u.SmallPhotoUrl
                ));
            }
            
            // Search for contacts
            List<Contact> contacts = [
                SELECT Id, Name, Title, PhotoUrl
                FROM Contact
                WHERE Name LIKE :searchQuery
                LIMIT 10
            ];
            
            for (Contact c : contacts) {
                String photoUrl = c.PhotoUrl != null ? c.PhotoUrl : '/img/icon/t4v35/standard/contact_120.png';
                results.add(new SearchResult(
                    c.Id,
                    'Contact',
                    c.Name,
                    c.Title != null ? c.Title : 'Contact',
                    photoUrl
                ));
            }
            
            return results;
        } catch (Exception e) {
            throw new AuraHandledException('Error searching for users/contacts: ' + e.getMessage());
        }
    }
    
    /**
     * Helper method to format a time since a specific datetime
     * 
     * @param dt The datetime to format
     * @return Formatted string (e.g. "2h ago", "yesterday", "3d ago")
     */
    private static String formatTimeSince(Datetime dt) {
        Long diffInSeconds = (Datetime.now().getTime() - dt.getTime()) / 1000;
        
        if (diffInSeconds < 60) {
            return 'just now';
        } else if (diffInSeconds < 3600) {
            Long minutes = diffInSeconds / 60;
            return minutes + (minutes == 1 ? 'm ago' : 'm ago');
        } else if (diffInSeconds < 86400) {
            Long hours = diffInSeconds / 3600;
            return hours + (hours == 1 ? 'h ago' : 'h ago');
        } else if (diffInSeconds < 172800) {
            return 'yesterday';
        } else {
            Long days = diffInSeconds / 86400;
            return days + (days == 1 ? 'd ago' : 'd ago');
        }
    }
    
    /**
     * Generate a random ID for demo purposes
     * 
     * @return Random string ID
     */
    private static String generateRandomId() {
        return EncodingUtil.convertToHex(Crypto.generateAESKey(128)).substring(0, 18);
    }
    
    /**
     * Inner class to represent a user
     */
    public class UserDetails {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public String profileImage;
        @AuraEnabled public String email;
        @AuraEnabled public Boolean isActive;
        
        public UserDetails(String id, String name, String profileImage, String email, Boolean isActive) {
            this.id = id;
            this.name = name;
            this.profileImage = profileImage;
            this.email = email;
            this.isActive = isActive;
        }
    }
    
    /**
     * Inner class to represent a conversation
     */
    public class Conversation {
        @AuraEnabled public String id;
        @AuraEnabled public String recipientName;
        @AuraEnabled public String status;
        @AuraEnabled public String lastMessage;
        @AuraEnabled public Datetime lastMessageDate;
        @AuraEnabled public String recipientProfileImage;
        @AuraEnabled public Boolean isOnline;
        @AuraEnabled public Integer unreadCount;
        @AuraEnabled public Boolean isGroup;
        @AuraEnabled public List<String> participants;
        
        public Conversation(
            String id,
            String recipientName,
            String status,
            String lastMessage,
            Datetime lastMessageDate,
            String recipientProfileImage,
            Boolean isOnline,
            Integer unreadCount
        ) {
            this.id = id;
            this.recipientName = recipientName;
            this.status = status;
            this.lastMessage = lastMessage;
            this.lastMessageDate = lastMessageDate;
            this.recipientProfileImage = recipientProfileImage;
            this.isOnline = isOnline;
            this.unreadCount = unreadCount;
            this.isGroup = false;
            this.participants = new List<String>();
        }
        
        public Conversation(
            String id,
            String recipientName,
            String status,
            String lastMessage,
            Datetime lastMessageDate,
            String recipientProfileImage,
            Boolean isOnline,
            Integer unreadCount,
            Boolean isGroup,
            List<String> participants
        ) {
            this.id = id;
            this.recipientName = recipientName;
            this.status = status;
            this.lastMessage = lastMessage;
            this.lastMessageDate = lastMessageDate;
            this.recipientProfileImage = recipientProfileImage;
            this.isOnline = isOnline;
            this.unreadCount = unreadCount;
            this.isGroup = isGroup;
            this.participants = participants;
        }
    }
    
    /**
     * Inner class to represent a message
     */
    public class Message {
        @AuraEnabled public String id;
        @AuraEnabled public String content;
        @AuraEnabled public String senderId;
        @AuraEnabled public String senderName;
        @AuraEnabled public Datetime timestamp;
        
        public Message(
            String id,
            String content,
            String senderId,
            String senderName,
            Datetime timestamp
        ) {
            this.id = id;
            this.content = content;
            this.senderId = senderId;
            this.senderName = senderName;
            this.timestamp = timestamp;
        }
    }
    
    /**
     * Inner class to represent a search result
     */
    public class SearchResult {
        @AuraEnabled public String id;
        @AuraEnabled public String type;
        @AuraEnabled public String name;
        @AuraEnabled public String title;
        @AuraEnabled public String profileImage;
        
        public SearchResult(
            String id,
            String type,
            String name,
            String title,
            String profileImage
        ) {
            this.id = id;
            this.type = type;
            this.name = name;
            this.title = title;
            this.profileImage = profileImage;
        }
    }
    
    /**
     * Create a new group conversation with multiple participants
     * 
     * @param userIds List of user or contact IDs to include in the group
     * @param userTypes Map of user IDs to their types (User or Contact)
     * @param groupName Name of the group conversation
     * @return Conversation object representing the group
     */
    @AuraEnabled
    public static Conversation createGroupConversation(List<String> userIds, Map<String, String> userTypes, String groupName) {
        try {
            Id currentUserId = UserInfo.getUserId();
            User currentUser = [SELECT Name FROM User WHERE Id = :currentUserId LIMIT 1];
            
            // Add current user to participants if not already included
            List<String> allParticipants = new List<String>(userIds);
            if (!allParticipants.contains(currentUserId)) {
                allParticipants.add(currentUserId);
            }
            
            // Get participant names for group display
            Map<String, String> participantNames = new Map<String, String>();
            
            // Filter users from participants (can't use LIKE on ID fields)
            List<String> userIdsFiltered = new List<String>();
            for(String pId : allParticipants) {
                // Check if it's a User ID (starts with 005)
                if(pId.startsWith('005')) {
                    userIdsFiltered.add(pId);
                }
            }
            
            // Query users with properly filtered IDs
            List<User> users = [SELECT Id, Name FROM User WHERE Id IN :userIdsFiltered];
            for (User usr : users) {
                participantNames.put(usr.Id, usr.Name);
            }
            
            // Also get contact names if any participants are contacts
            List<String> contactIds = new List<String>();
            for (String userId : allParticipants) {
                if (userTypes.containsKey(userId) && userTypes.get(userId) == 'Contact') {
                    contactIds.add(userId);
                }
            }
            
            if (!contactIds.isEmpty()) {
                List<Contact> contacts = [SELECT Id, Name FROM Contact WHERE Id IN :contactIds];
                for (Contact cnt : contacts) {
                    participantNames.put(cnt.Id, cnt.Name);
                }
            }
            
            // Format group name if not provided
            if (String.isBlank(groupName)) {
                List<String> names = new List<String>();
                for (String participant : allParticipants) {
                    if (participant != currentUserId && participantNames.containsKey(participant)) {
                        names.add(participantNames.get(participant));
                    }
                }
                
                if (names.size() <= 3) {
                    groupName = String.join(names, ', ');
                } else {
                    groupName = String.join(new List<String>{names[0], names[1]}, ', ') + ' and ' + (names.size() - 2) + ' others';
                }
            }
            
            // Create a list of participant names for display
            List<String> participantNamesList = new List<String>();
            for (String pId : allParticipants) {
                if (participantNames.containsKey(pId)) {
                    participantNamesList.add(participantNames.get(pId));
                }
            }
            
            // Limit to a reasonable number to avoid overly long lists
            if (participantNamesList.size() > 10) {
                List<String> limitedNames = new List<String>();
                // Add first 10 names
                for (Integer i = 0; i < 10 && i < participantNamesList.size(); i++) {
                    limitedNames.add(participantNamesList[i]);
                }
                limitedNames.add('and ' + (allParticipants.size() - 10) + ' more');
                participantNamesList = limitedNames;
            }
            
            // Set status to the comma-delimited list of participant names
            String status = String.join(participantNamesList, ', ');
            
            // Create the group conversation
            String participants = JSON.serialize(allParticipants);
            String welcomeMessage = currentUser.Name + ' created group "' + groupName + '"';
            
            Conversation__c convoRecord = new Conversation__c(
                Participants__c = participants,
                RecipientName__c = groupName,
                IsGroup__c = true,
                GroupName__c = groupName,
                LastMessage__c = welcomeMessage,
                LastMessageDate__c = System.now()
            );
            
            insert convoRecord;
            
            return new Conversation(
                convoRecord.Id,
                convoRecord.RecipientName__c,
                status,
                convoRecord.LastMessage__c,
                convoRecord.LastMessageDate__c,
                null, // Group profile image could be implemented
                false,
                0,
                true, // isGroup
                allParticipants // Add participants list
            );
        } catch (Exception e) {
            throw new AuraHandledException('Error creating group conversation: ' + e.getMessage());
        }
    }
} 