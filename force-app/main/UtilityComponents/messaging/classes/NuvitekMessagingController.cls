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
            
            // Query for all conversations along with the most recent message to get sender info
            List<Conversation__c> allRecords = [
                SELECT Id, RecipientName__c, RecipientId__c, RecipientProfileImage__c, 
                       LastMessage__c, LastMessageDate__c, Participants__c, IsGroup__c, GroupName__c
                FROM Conversation__c 
                ORDER BY LastMessageDate__c DESC
            ];
            
            // Get the latest message for each conversation to fetch sender details
            Set<Id> conversationIds = new Set<Id>();
            for (Conversation__c conv : allRecords) {
                conversationIds.add(conv.Id);
            }
            
            // Map to store the latest message sender details by conversation ID
            Map<Id, Message__c> latestMessageMap = new Map<Id, Message__c>();
            
            // Query the latest message for each conversation
            if (!conversationIds.isEmpty()) {
                List<Message__c> latestMessages = [
                    SELECT Id, Conversation__c, SenderId__c, SenderName__c, Timestamp__c 
                    FROM Message__c 
                    WHERE Conversation__c IN :conversationIds 
                    ORDER BY Timestamp__c DESC
                    LIMIT 1000
                ];
                
                // Create a map of conversation ID to the latest message
                Map<Id, Message__c> tempMap = new Map<Id, Message__c>();
                for (Message__c msg : latestMessages) {
                    if (!tempMap.containsKey(msg.Conversation__c) || 
                        tempMap.get(msg.Conversation__c).Timestamp__c < msg.Timestamp__c) {
                        tempMap.put(msg.Conversation__c, msg);
                    }
                }
                
                latestMessageMap = tempMap;
            }
            
            // Filter on the client side
            for (Conversation__c record : allRecords) {
                // Parse the JSON stored in Participants__c
                if (record.Participants__c != null) {
                    List<String> participants = (List<String>)JSON.deserialize(record.Participants__c, List<String>.class);
                    // Check if current user is a participant
                    if (participants.contains(currentUserId)) {
                        // Get sender info from the latest message if available
                        String senderId = null;
                        String senderName = null;
                        
                        if (latestMessageMap.containsKey(record.Id)) {
                            Message__c latestMsg = latestMessageMap.get(record.Id);
                            senderId = latestMsg.SenderId__c;
                            senderName = latestMsg.SenderName__c;
                        }
                        
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
                                participants, // Add participants list
                                senderId,
                                senderName
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
                                0, // Unread count
                                false, // Not a group
                                participants,
                                senderId,
                                senderName
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
     * Create a new conversation or get an existing one with the specified entity
     * 
     * @param entityId The ID of the entity to chat with (user, contact, group, etc.)
     * @param entityType The type of entity (User, Contact, PublicGroup, ChatterGroup, Queue, Role)
     * @return Conversation object
     */
    @AuraEnabled
    public static Conversation startConversation(String entityId, String entityType) {
        try {
            Id currentUserId = UserInfo.getUserId();
            User currentUser = [SELECT Name FROM User WHERE Id = :currentUserId LIMIT 1];
            
            // Get recipient information based on entity type
            String recipientName;
            String recipientProfileImage;
            Boolean isOnline = false;
            String status = 'Offline';
            List<String> participants = new List<String>();
            Boolean isGroup = false;
            
            // Default to User type if null
            if (entityType == null) {
                entityType = 'User';
            }
            
            participants.add(currentUserId); // Always add current user
            
            if (entityType == 'User') {
                User recipient = [SELECT Id, Name, SmallPhotoUrl, LastLoginDate FROM User WHERE Id = :entityId LIMIT 1];
                recipientName = recipient.Name;
                recipientProfileImage = recipient.SmallPhotoUrl;
                participants.add(recipient.Id);
                
                // Consider a user online if they've logged in within the last 15 minutes
                if (recipient.LastLoginDate != null && 
                    recipient.LastLoginDate > Datetime.now().addMinutes(-15)) {
                    isOnline = true;
                    status = 'Active now';
                } else if (recipient.LastLoginDate != null) {
                    status = 'Last seen ' + formatTimeSince(recipient.LastLoginDate);
                }
            } else if (entityType == 'Contact') {
                Contact recipient = [SELECT Id, Name, PhotoUrl FROM Contact WHERE Id = :entityId LIMIT 1];
                recipientName = recipient.Name;
                recipientProfileImage = recipient.PhotoUrl;
                participants.add(recipient.Id);
                status = 'Contact';
            } else if (entityType == 'PublicGroup') {
                Group publicGroup = [SELECT Id, Name FROM Group WHERE Id = :entityId LIMIT 1];
                recipientName = publicGroup.Name;
                recipientProfileImage = null;
                status = 'Public Group';
                isGroup = true;
                
                // Add group members to participants
                for (GroupMember member : [SELECT UserOrGroupId FROM GroupMember WHERE GroupId = :entityId]) {
                    if (member.UserOrGroupId != null && String.valueOf(member.UserOrGroupId).startsWith('005')) {
                        participants.add(member.UserOrGroupId);
                    }
                }
            } else if (entityType == 'ChatterGroup') {
                CollaborationGroup chatterGroup = [SELECT Id, Name, SmallPhotoUrl FROM CollaborationGroup WHERE Id = :entityId LIMIT 1];
                recipientName = chatterGroup.Name;
                recipientProfileImage = chatterGroup.SmallPhotoUrl;
                status = 'Chatter Group';
                isGroup = true;
                
                // Add Chatter group members to participants
                for (CollaborationGroupMember member : [SELECT MemberId FROM CollaborationGroupMember WHERE CollaborationGroupId = :entityId]) {
                    participants.add(member.MemberId);
                }
            } else if (entityType == 'Queue') {
                Group queue = [SELECT Id, Name FROM Group WHERE Id = :entityId LIMIT 1];
                recipientName = queue.Name;
                recipientProfileImage = null;
                status = 'Queue';
                isGroup = true;
                
                // Add queue members to participants
                for (GroupMember member : [SELECT UserOrGroupId FROM GroupMember WHERE GroupId = :entityId]) {
                    if (member.UserOrGroupId != null && String.valueOf(member.UserOrGroupId).startsWith('005')) {
                        participants.add(member.UserOrGroupId);
                    }
                }
            } else if (entityType == 'Role') {
                UserRole role = [SELECT Id, Name FROM UserRole WHERE Id = :entityId LIMIT 1];
                recipientName = role.Name;
                recipientProfileImage = null;
                status = 'Role';
                isGroup = true;
                
                // Add users with this role to participants
                for (User user : [SELECT Id FROM User WHERE UserRoleId = :entityId]) {
                    participants.add(user.Id);
                }
            }
            
            // Check if conversation already exists - IMPROVED!
            // First, check if the participants list contains exactly these two participants
            // We need to find a conversation where:
            // 1. The current user and this entity are the ONLY participants (for 1:1 chats)
            // 2. OR we find the existing group conversation with matching name (for groups)
            
            List<Conversation__c> existingConversations = new List<Conversation__c>();
            
            if (isGroup) {
                // For groups, find by name
                existingConversations = [
                    SELECT Id, RecipientName__c, RecipientId__c, RecipientProfileImage__c, 
                           LastMessage__c, LastMessageDate__c, Participants__c, IsGroup__c
                    FROM Conversation__c 
                    WHERE IsGroup__c = true AND RecipientName__c = :recipientName
                    LIMIT 1
                ];
            } else {
                // For 1:1 conversations, find by participant
                List<Conversation__c> potentialConversations = [
                    SELECT Id, RecipientName__c, RecipientId__c, RecipientProfileImage__c, 
                           LastMessage__c, LastMessageDate__c, Participants__c, IsGroup__c
                    FROM Conversation__c 
                    WHERE IsGroup__c = false
                    ORDER BY LastMessageDate__c DESC
                ];
                
                // Manually filter to find 1:1 conversation with exactly these two participants
                for (Conversation__c convo : potentialConversations) {
                    if (convo.Participants__c != null) {
                        List<String> convoParticipants = (List<String>)JSON.deserialize(convo.Participants__c, List<String>.class);
                        
                        // Check if this conversation has exactly our two participants
                        if (convoParticipants.size() == 2 && 
                            convoParticipants.contains(currentUserId) && 
                            convoParticipants.contains(entityId)) {
                            existingConversations.add(convo);
                            break; // Found what we're looking for
                        }
                    }
                }
            }
            
            Conversation__c convoRecord;
            
            if (!existingConversations.isEmpty()) {
                // Use existing conversation
                convoRecord = existingConversations[0];
                
                // Update recipient name to ensure it always shows correctly
                if (!isGroup) {
                    // For 1:1 chats, the recipient name depends on who's viewing
                    // If the current user is the original recipient, we should update
                    // the recipient name to show the other person
                    if (convoRecord.RecipientId__c == currentUserId) {
                        convoRecord.RecipientName__c = recipientName;
                        convoRecord.RecipientId__c = entityId;
                        convoRecord.RecipientProfileImage__c = recipientProfileImage;
                        update convoRecord;
                    }
                }
            } else {
                // Create a new conversation
                convoRecord = new Conversation__c(
                    RecipientId__c = entityId,
                    RecipientName__c = recipientName,
                    RecipientProfileImage__c = recipientProfileImage,
                    LastMessageDate__c = System.now(),
                    LastMessage__c = 'Conversation started',
                    IsGroup__c = isGroup,
                    Participants__c = JSON.serialize(participants)
                );
                
                insert convoRecord;
            }
            
            // Get the latest message sender for the conversation
            String senderId = null;
            String senderName = null;
            
            List<Message__c> latestMessages = [
                SELECT Id, SenderId__c, SenderName__c
                FROM Message__c
                WHERE Conversation__c = :convoRecord.Id
                ORDER BY Timestamp__c DESC
                LIMIT 1
            ];
            
            if (!latestMessages.isEmpty()) {
                Message__c latestMsg = latestMessages[0];
                senderId = latestMsg.SenderId__c;
                senderName = latestMsg.SenderName__c;
            }
            
            if (isGroup) {
                return new Conversation(
                    convoRecord.Id,
                    convoRecord.RecipientName__c,
                    status,
                    convoRecord.LastMessage__c,
                    convoRecord.LastMessageDate__c,
                    convoRecord.RecipientProfileImage__c,
                    isOnline,
                    0,
                    true,
                    participants,
                    senderId,
                    senderName
                );
            } else {
                return new Conversation(
                    convoRecord.Id,
                    convoRecord.RecipientName__c,
                    status,
                    convoRecord.LastMessage__c,
                    convoRecord.LastMessageDate__c,
                    convoRecord.RecipientProfileImage__c,
                    isOnline,
                    0,
                    false,
                    participants,
                    senderId,
                    senderName
                );
            }
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
     * Search for users, contacts, and additional entity types
     * 
     * @param searchTerm The search term to find users/contacts/groups/queues/roles
     * @param entityType The type of entity to search for (null for all)
     * @return List of SearchResult objects
     */
    @AuraEnabled
    public static List<SearchResult> findUserOrContact(String searchTerm, String entityType) {
        try {
            List<SearchResult> results = new List<SearchResult>();
            String searchQuery = '%' + searchTerm + '%';
            
            // If no specific entity type is specified or if it's 'User', search for users
            if (entityType == null || entityType == 'All' || entityType == 'User') {
                // Search for users
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
            }
            
            // If no specific entity type is specified or if it's 'Contact', search for contacts
            if (entityType == null || entityType == 'All' || entityType == 'Contact') {
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
            }
            
            // Search for Public Groups if requested
            if (entityType == null || entityType == 'All' || entityType == 'PublicGroup') {
                List<Group> publicGroups = [
                    SELECT Id, Name, DeveloperName
                    FROM Group
                    WHERE Name LIKE :searchQuery AND Type = 'Regular'
                    LIMIT 10
                ];
                
                for (Group g : publicGroups) {
                    results.add(new SearchResult(
                        g.Id,
                        'PublicGroup',
                        g.Name,
                        'Public Group',
                        '/img/icon/t4v35/standard/groups_120.png'
                    ));
                }
            }
            
            // Search for Chatter Groups if requested
            if (entityType == null || entityType == 'All' || entityType == 'ChatterGroup') {
                List<CollaborationGroup> chatterGroups = [
                    SELECT Id, Name, Description, SmallPhotoUrl
                    FROM CollaborationGroup
                    WHERE Name LIKE :searchQuery
                    LIMIT 10
                ];
                
                for (CollaborationGroup cg : chatterGroups) {
                    String photoUrl = cg.SmallPhotoUrl != null ? cg.SmallPhotoUrl : '/img/icon/t4v35/standard/groups_120.png';
                    results.add(new SearchResult(
                        cg.Id,
                        'ChatterGroup',
                        cg.Name,
                        'Chatter Group',
                        photoUrl
                    ));
                }
            }
            
            // Search for Queues if requested
            if (entityType == null || entityType == 'All' || entityType == 'Queue') {
                List<Group> queues = [
                    SELECT Id, Name, DeveloperName
                    FROM Group
                    WHERE Name LIKE :searchQuery AND Type = 'Queue'
                    LIMIT 10
                ];
                
                for (Group q : queues) {
                    results.add(new SearchResult(
                        q.Id,
                        'Queue',
                        q.Name,
                        'Queue',
                        '/img/icon/t4v35/standard/queue_120.png'
                    ));
                }
            }
            
            // Search for Roles if requested
            if (entityType == null || entityType == 'All' || entityType == 'Role') {
                List<UserRole> roles = [
                    SELECT Id, Name, DeveloperName
                    FROM UserRole
                    WHERE Name LIKE :searchQuery
                    LIMIT 10
                ];
                
                for (UserRole r : roles) {
                    results.add(new SearchResult(
                        r.Id,
                        'Role',
                        r.Name,
                        'Role',
                        '/img/icon/t4v35/standard/user_role_120.png'
                    ));
                }
            }
            
            return results;
        } catch (Exception e) {
            throw new AuraHandledException('Error searching for entities: ' + e.getMessage());
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
     * Inner class for Conversation data
     */
    public class Conversation {
        @AuraEnabled public String id;
        @AuraEnabled public String recipientName;
        @AuraEnabled public String recipientId;
        @AuraEnabled public String status;
        @AuraEnabled public String lastMessage;
        @AuraEnabled public Datetime lastMessageDate;
        @AuraEnabled public String recipientProfileImage;
        @AuraEnabled public Boolean isOnline;
        @AuraEnabled public Integer unreadCount;
        @AuraEnabled public Boolean isGroup;
        @AuraEnabled public List<String> participants;
        @AuraEnabled public String senderId;     // Added for correct name display
        @AuraEnabled public String senderName;   // Added for correct name display
        
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
            List<String> participants,
            String senderId,
            String senderName
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
            this.senderId = senderId;
            this.senderName = senderName;
        }
        
        // Overloaded constructor for non-group conversations without sender info
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
            this(id, recipientName, status, lastMessage, lastMessageDate, 
                recipientProfileImage, isOnline, unreadCount, false, null, null, null);
        }
        
        // Overloaded constructor for group conversations without sender info
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
            this(id, recipientName, status, lastMessage, lastMessageDate, 
                recipientProfileImage, isOnline, unreadCount, isGroup, participants, null, null);
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
            if (userTypes != null) {
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
                allParticipants, // Add participants list
                null,
                null
            );
        } catch (Exception e) {
            throw new AuraHandledException('Error creating group conversation: ' + e.getMessage());
        }
    }
    
    /**
     * Generate an AI summary of a conversation
     * 
     * @param conversationContext JSON string containing context about the conversation
     * @param messages JSON string containing the messages to summarize
     * @return A formatted summary of the conversation
     */
    @AuraEnabled
    public static String generateAISummary(String conversationContext, String messages) {
        try {
            // Parse the context and messages
            Map<String, Object> context = (Map<String, Object>)JSON.deserializeUntyped(conversationContext);
            List<Object> messageList = (List<Object>)JSON.deserializeUntyped(messages);
            
            // Log the request for debugging
            System.debug('Context: ' + context);
            System.debug('Messages to summarize: ' + messageList.size());
            
            // Build the prompt for the AI model
            String prompt = buildAISummaryPrompt(context, messageList);
            
            // Get the default LLM configuration to use
            List<LLM_Configuration__mdt> configs = LLMController.getLLMConfigurations();
            if (configs.isEmpty()) {
                return 'Error: No LLM configurations available.';
            }
            
            // Use the first available configuration (or you could filter for a specific one)
            String configName = configs[0].DeveloperName;
            
            try {
                // Call the LLM service via the LLMController
                String summary = LLMController.handleRequest(
                    null, // No record ID needed for conversation summary
                    configName, 
                    prompt,
                    'no summarize', // Use the summarize operation type
                    null // No related objects needed
                );
                
                // Return the formatted summary from the AI model
                return summary;
            } catch (Exception e) {
                System.debug('Error calling LLM service: ' + e.getMessage());
                return 'Error generating AI summary: ' + e.getMessage();
            }
        } catch (Exception e) {
            System.debug('Error in generateAISummary: ' + e.getMessage());
            System.debug(e.getStackTraceString());
            return 'Error processing conversation data: ' + e.getMessage();
        }
    }
    
    /**
     * Build a detailed prompt for the AI model to summarize a conversation
     * 
     * @param context Map containing conversation context
     * @param messageList List of messages to analyze
     * @return Structured prompt for the AI model
     */
    private static String buildAISummaryPrompt(Map<String, Object> context, List<Object> messageList) {
        String conversationType = (String)context.get('conversationType');
        String participants = (String)context.get('participants');
        Integer messageCount = messageList.size();
        
        // Start building the detailed prompt
        String prompt = 'You are an AI assistant tasked with summarizing a conversation from Salesforce messaging.\n\n';
        
        // Add conversation context
        prompt += 'CONVERSATION CONTEXT:\n';
        prompt += '- Type: ' + (String.isNotBlank(conversationType) ? conversationType : 'Direct Message') + '\n';
        prompt += '- Participants: ' + (String.isNotBlank(participants) ? participants : 'Unknown') + '\n';
        prompt += '- Total Messages: ' + messageCount + '\n';
        
        if (context.containsKey('startTime') && context.containsKey('endTime')) {
            prompt += '- Timeframe: ' + context.get('startTime') + ' to ' + context.get('endTime') + '\n';
        }
        
        // Add instructions for the AI
        prompt += '\nINSTRUCTIONS:\n';
        prompt += '1. Analyze the conversation and provide a concise summary (3-4 paragraphs).\n';
        prompt += '2. Identify the main topics discussed.\n';
        prompt += '3. Extract any key questions, action items, or decisions made.\n';
        prompt += '4. Note any important dates, numbers, or specific details mentioned.\n';
        prompt += '5. Format your summary into sections: Overview, Key Points, and Action Items/Next Steps.\n';
        prompt += '6. If the conversation is very short or lacks substantial content, acknowledge this briefly.\n\n';
        
        // Add the actual messages
        prompt += 'MESSAGES:\n';
        
        // Process and add each message
        for (Object msgObj : messageList) {
            Map<String, Object> msg = (Map<String, Object>)msgObj;
            String sender = (String)msg.get('sender');
            String content = (String)msg.get('content');
            String timestamp = (String)msg.get('timestamp');
            
            if (String.isNotBlank(content)) {
                prompt += sender + ' (' + timestamp + '): ' + content + '\n\n';
            }
        }
        
        return prompt;
    }
    
    /**
     * Delete a conversation and all its messages
     * 
     * @param conversationId ID of the conversation to delete
     * @return Boolean indicating if the deletion was successful
     */
    @AuraEnabled
    public static Boolean deleteConversation(String conversationId) {
        try {
            // First delete all messages in the conversation
            List<Message__c> messages = [SELECT Id FROM Message__c WHERE Conversation__c = :conversationId];
            if (!messages.isEmpty()) {
                delete messages;
            }
            
            // Then delete the conversation itself
            Conversation__c conversation = [SELECT Id FROM Conversation__c WHERE Id = :conversationId LIMIT 1];
            delete conversation;
            
            return true;
        } catch (Exception e) {
            throw new AuraHandledException('Error deleting conversation: ' + e.getMessage());
        }
    }
    
    /**
     * Delete multiple conversations and all their messages
     * 
     * @param conversationIds List of conversation IDs to delete
     * @return Integer count of successfully deleted conversations
     */
    @AuraEnabled
    public static Integer deleteConversations(List<String> conversationIds) {
        try {
            // Delete all messages in the selected conversations
            List<Message__c> messages = [SELECT Id FROM Message__c WHERE Conversation__c IN :conversationIds];
            if (!messages.isEmpty()) {
                delete messages;
            }
            
            // Delete the conversations
            List<Conversation__c> conversations = [SELECT Id FROM Conversation__c WHERE Id IN :conversationIds];
            delete conversations;
            
            return conversations.size();
        } catch (Exception e) {
            throw new AuraHandledException('Error deleting conversations: ' + e.getMessage());
        }
    }
}