/**
 * NuvitekMessagingController v2 (Phase 1 - User-to-User)
 * 
 * Apex controller for the Nuvitek Messaging LWC component.
 * Phase 1 focuses on direct User-to-User messaging using the
 * Conversation__c and Conversation_Participant__c objects.
 * Handles:
 * - Searching for User recipients
 * - Sending messages within a Conversation
 * - Retrieving message history for a Conversation
 * - Managing read status via Conversation_Participant__c
 * - Retrieving recent conversations for the user
 */
public with sharing class NuvitekMessagingController {
    
    /**
     * Search for potential User recipients.
     * (Phase 1: Only supports searching for Users).
     * 
     * @param searchTerm Search string to find matching Users.
     * @param objectTypes (Ignored in Phase 1, kept for potential future compatibility).
     * @return List of User search result wrapper objects.
     */
    @AuraEnabled(cacheable=true) // Make cacheable as it only queries User data now
    public static List<UserSearchResultWrapper> searchRecipients(String searchTerm, List<String> objectTypes) {
        // --- Basic Input Validation ---
        if (String.isBlank(searchTerm) || searchTerm.length() < 2) {
            System.debug('NuvitekMessagingController.searchRecipients: Search term too short, returning empty list.');
            return new List<UserSearchResultWrapper>();
        }
        
        // --- Prepare Search Term for SOSL ---
        String sanitizedTerm = String.escapeSingleQuotes(searchTerm);
        sanitizedTerm = sanitizedTerm + '*'; 
        
        List<UserSearchResultWrapper> results = new List<UserSearchResultWrapper>();
        
        try {
            // --- Construct SOSL Query (User only) ---
            String soslQuery = 'FIND :sanitizedTerm IN NAME FIELDS RETURNING User(Id, Name, Title, SmallPhotoUrl, IsActive WHERE IsActive = true) LIMIT 50';
            System.debug('NuvitekMessagingController.searchRecipients: Executing SOSL query: ' + soslQuery);
            
            // --- Execute SOSL Search ---
            List<List<SObject>> searchList = Search.query(soslQuery);
            
            // --- Process User Results ---
            if (searchList != null && !searchList.isEmpty()) {
                List<User> userResults = (List<User>) searchList[0];
                String currentUserId = UserInfo.getUserId();
                for (User u : userResults) {
                    if (u.Id == currentUserId) continue; 
                    UserSearchResultWrapper wrapper = new UserSearchResultWrapper();
                    wrapper.id = u.Id;
                        wrapper.name = u.Name;
                        wrapper.title = u.Title;
                        wrapper.photoUrl = u.SmallPhotoUrl;
                    results.add(wrapper);
                }
                System.debug('NuvitekMessagingController.searchRecipients: Found ' + results.size() + ' User results (excluding current user).');
            } else {
                System.debug('NuvitekMessagingController.searchRecipients: No User results found for term: ' + searchTerm);
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.searchRecipients: Error searching for Users. Term=' + searchTerm + ', Error=' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
            throw new AuraHandledException('Error searching for users: ' + e.getMessage());
        }
        return results;
    }
    
    /**
     * Sends a message from the current user to another user.
     * Finds or creates a Conversation record between the two users.
     * Creates the Nuvitek_Message__c record linked to the conversation.
     * 
     * @param recipientUserId The ID of the User receiving the message.
     * @param content The text content of the message.
     * @return Map containing 'messageId', 'conversationId', and 'userPhotoUrl'.
     */
    @AuraEnabled
    public static Map<String, String> sendMessage(String recipientUserId, String content) {
        // --- Input Validation ---
        if (String.isBlank(recipientUserId) || String.isBlank(content)) {
             System.debug(LoggingLevel.WARN, 'NuvitekMessagingController.sendMessage: recipientUserId or content is blank.');
            throw new AuraHandledException('Recipient user ID and message content cannot be blank.');
        }
        String currentUserId = UserInfo.getUserId();
        if (recipientUserId == currentUserId) {
             System.debug(LoggingLevel.WARN, 'NuvitekMessagingController.sendMessage: User attempting to send message to self.');
            throw new AuraHandledException('You cannot send a message to yourself.');
        }
        // --- Ensure Recipient User Exists and is Active ---
        List<User> recipientUsers = [SELECT Id, Name FROM User WHERE Id = :recipientUserId AND IsActive = true LIMIT 1];
        if (recipientUsers.isEmpty()) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.sendMessage: Recipient User not found or inactive. ID=' + recipientUserId);
            throw new AuraHandledException('Recipient user not found or is inactive.');
        }
        
        try {
            // --- Find or Create Conversation ---
            Id conversationId = findOrCreateConversation(currentUserId, recipientUserId);
            
            // --- Create the Message ---
            Nuvitek_Message__c newMessage = new Nuvitek_Message__c(
                Sender__c = currentUserId,
                Content__c = content,
                Conversation__c = conversationId 
            );
            insert newMessage;
            System.debug('NuvitekMessagingController.sendMessage: Message sent. ID=' + newMessage.Id + ', ConversationID=' + conversationId);

            // --- Get Sender Photo URL ---
            List<User> currentUserList = [SELECT SmallPhotoUrl FROM User WHERE Id = :currentUserId LIMIT 1];
            String userPhotoUrl = '';
            if (!currentUserList.isEmpty()) {
                userPhotoUrl = currentUserList[0].SmallPhotoUrl;
            }

            // --- Return Result ---
            return new Map<String, String>{
                'messageId' => newMessage.Id,
                'conversationId' => conversationId,
                'userPhotoUrl' => userPhotoUrl 
            };
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.sendMessage: Error sending message. CurrentUser=' + currentUserId + ', RecipientUser=' + recipientUserId + ', Error=' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
            throw new AuraHandledException('An error occurred while sending the message: ' + e.getMessage());
        }
    }
    
    /**
     * Helper method to find an existing 1-on-1 Conversation between two users 
     * or create a new one if it doesn't exist.
     * Ensures DML operations (insert) are handled correctly.
     * 
     * @param userId1 ID of the first user.
     * @param userId2 ID of the second user.
     * @return The ID of the existing or newly created Conversation__c record.
     * @throws AuraHandledException if DML fails.
     */
    private static Id findOrCreateConversation(String userId1, String userId2) {
        Id foundConversationId = null;
        
        // --- Try to Find Existing Conversation --- 
        List<Conversation_Participant__c> participants = [
            SELECT Conversation__c, User__c 
            FROM Conversation_Participant__c 
            WHERE User__c IN (:userId1, :userId2)
        ];
        Map<Id, Set<Id>> conversationToUsersMap = new Map<Id, Set<Id>>();
        if (participants != null && !participants.isEmpty()) {
            for (Conversation_Participant__c p : participants) {
                if (!conversationToUsersMap.containsKey(p.Conversation__c)) {
                    conversationToUsersMap.put(p.Conversation__c, new Set<Id>());
                }
                conversationToUsersMap.get(p.Conversation__c).add(p.User__c);
            }
        }
        Set<Id> targetUserSet = new Set<Id>{userId1, userId2};
        for (Id convoId : conversationToUsersMap.keySet()) {
            Set<Id> usersInConvo = conversationToUsersMap.get(convoId);
            if (usersInConvo.size() == 2 && usersInConvo.containsAll(targetUserSet)) {
                foundConversationId = convoId;
                System.debug('NuvitekMessagingController.findOrCreateConversation: Found existing conversation. ID=' + foundConversationId);
                break; 
            }
        }

        // --- Create New Conversation if Not Found --- 
        if (foundConversationId == null) {
            System.debug('NuvitekMessagingController.findOrCreateConversation: No existing conversation found between ' + userId1 + ' and ' + userId2 + '. Creating new one.');
            try {
                Conversation__c newConversation = new Conversation__c();
                Database.insert(newConversation); 
                foundConversationId = newConversation.Id; 
                List<Conversation_Participant__c> participantsToInsert = new List<Conversation_Participant__c>();
                participantsToInsert.add(new Conversation_Participant__c(
                    Conversation__c = foundConversationId, User__c = userId1, Is_Active__c = true
                ));
                participantsToInsert.add(new Conversation_Participant__c(
                    Conversation__c = foundConversationId, User__c = userId2, Is_Active__c = true
                ));
                Database.insert(participantsToInsert); 
                System.debug('NuvitekMessagingController.findOrCreateConversation: Created new conversation and participants. ConversationID=' + foundConversationId);
            } catch (DmlException e) {
                System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.findOrCreateConversation: DML Exception creating conversation/participants. Error=' + e.getMessage());
                throw new AuraHandledException('Failed to create conversation: ' + e.getMessage());
            } catch (Exception e) {
                 System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.findOrCreateConversation: Exception creating conversation/participants. Error=' + e.getMessage());
                 throw new AuraHandledException('An unexpected error occurred while creating the conversation: ' + e.getMessage());
            }
        }
        return foundConversationId;
    }

    /**
     * Get message history for a specific conversation.
     * 
     * @param conversationId ID of the Conversation__c record.
     * @param offset Pagination offset for fetching older messages.
     * @param limitNum Maximum number of messages to return (defaults to 50).
     * @param newerThan Optional ISO 8601 timestamp string to only get messages newer than this.
     * @return Map containing 'messages' (List<MessageWrapper>) and 'hasMore' (Boolean).
     */
    @AuraEnabled
    public static Map<String, Object> getMessages(String conversationId, Integer offset, Integer limitNum, String newerThan) {
        // --- Input Validation ---
        if (String.isBlank(conversationId)) {
            System.debug(LoggingLevel.WARN, 'NuvitekMessagingController.getMessages: conversationId is blank.');
            throw new AuraHandledException('Conversation ID cannot be blank.');
        }
        String currentUserId = UserInfo.getUserId();
        Integer offsetNum = offset != null && offset >= 0 ? offset : 0; 
        Integer validatedLimit = (limitNum != null && limitNum > 0) ? limitNum : 50; 

        // --- Authorization Check ---
        List<Conversation_Participant__c> participants = [
            SELECT Id FROM Conversation_Participant__c 
            WHERE Conversation__c = :conversationId AND User__c = :currentUserId AND Is_Active__c = true LIMIT 1
        ];
        if (participants.isEmpty()) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.getMessages: User ' + currentUserId + ' is not an active participant of Conversation ' + conversationId + '. Access denied.');
            throw new AuraHandledException('You do not have access to this conversation.');
        }
        System.debug('NuvitekMessagingController.getMessages: User ' + currentUserId + ' verified as participant for Conversation ' + conversationId);

        try {
            // --- Build SOQL Query ---
            String queryStrBase = 'SELECT Id, Sender__c, Sender__r.Name, Sender__r.SmallPhotoUrl, Content__c, CreatedDate FROM Nuvitek_Message__c WHERE Conversation__c = :conversationId ';
            String queryStr = queryStrBase;
            Datetime newerThanDate = null; 
            
            // --- Add Time Filter (for fetching new messages) ---
            if (String.isNotBlank(newerThan)) {
                try {
                    newerThanDate = (Datetime)JSON.deserialize('"' + newerThan + '"', Datetime.class);
                    queryStr += ' AND CreatedDate > :newerThanDate '; // Add the filter condition
                    System.debug('NuvitekMessagingController.getMessages: Filtering for messages newer than: ' + newerThanDate);
                } catch (Exception e) {
                    System.debug(LoggingLevel.WARN, 'NuvitekMessagingController.getMessages: Invalid newerThan timestamp format: ' + newerThan + '. Ignoring filter. Error: ' + e.getMessage());
                    newerThanDate = null; // Reset date if invalid
                }
            }
            
            // --- Add Sorting, Limit, and Offset ---
            queryStr += ' ORDER BY CreatedDate ' + (newerThanDate != null ? 'ASC' : 'DESC'); // Sort ASC if getting new, DESC if getting old
            queryStr += ' LIMIT :validatedLimit OFFSET :offsetNum';
            
            System.debug('NuvitekMessagingController.getMessages: Executing query: ' + queryStr);

            // --- Execute Query --- 
            List<Nuvitek_Message__c> messageRecords = Database.query(queryStr);
            
            // --- Reverse Order for Older Messages ---
            if (newerThanDate == null && messageRecords != null && !messageRecords.isEmpty()) {
                List<Nuvitek_Message__c> reversedMessages = new List<Nuvitek_Message__c>();
                for (Integer i = messageRecords.size() - 1; i >= 0; i--) {
                    reversedMessages.add(messageRecords[i]);
                }
                messageRecords = reversedMessages; 
            }
            
            // --- Convert to Wrapper Objects ---
            List<MessageWrapper> messages = new List<MessageWrapper>();
            if (messageRecords != null) {
                for (Nuvitek_Message__c msg : messageRecords) {
                        MessageWrapper wrapper = new MessageWrapper();
                        wrapper.id = msg.Id;
                        wrapper.content = msg.Content__c;
                        wrapper.timestamp = msg.CreatedDate;
                        wrapper.isFromUser = msg.Sender__c == currentUserId;
                    User sender = msg.Sender__r;
                    wrapper.senderName = sender != null ? sender.Name : 'Unknown User'; 
                    wrapper.senderPhotoUrl = sender != null ? sender.SmallPhotoUrl : null; 
                        messages.add(wrapper);
                }
            }
             System.debug('NuvitekMessagingController.getMessages: Returning ' + messages.size() + ' messages for Conversation ' + conversationId);
            
            // --- Determine if More Messages Exist ---
            Boolean hasMore = newerThanDate == null && messages.size() >= validatedLimit;
            
            // --- Return Result ---
            return new Map<String, Object>{
                'messages' => messages,
                'hasMore' => hasMore
            };
        } catch (QueryException qe) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.getMessages: Query Exception retrieving messages. Conversation=' + conversationId + ', Error=' + qe.getMessage() + '\nStackTrace: ' + qe.getStackTraceString());
            throw new AuraHandledException('Error retrieving messages: ' + qe.getMessage());
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.getMessages: Unexpected error retrieving messages. Conversation=' + conversationId + ', Error=' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
            throw new AuraHandledException('An unexpected error occurred while retrieving messages: ' + e.getMessage());
        }
    }
    
    /**
     * Updates the last read timestamp for the current user in a specific conversation.
     * This indicates the user has viewed the conversation up to the current time.
     * 
     * @param conversationId The ID of the Conversation__c record to mark as read.
     */
    @AuraEnabled
    public static void markAsRead(String conversationId) {
        // --- Input Validation ---
        if (String.isBlank(conversationId)) {
            System.debug(LoggingLevel.WARN, 'NuvitekMessagingController.markAsRead: conversationId is blank.');
            throw new AuraHandledException('Conversation ID cannot be blank.');
        }
        String currentUserId = UserInfo.getUserId();
        Datetime nowTimestamp = System.now(); 

        try {
            // --- Find the Current User's Participant Record ---
            List<Conversation_Participant__c> participantRecords = [
                SELECT Id, Last_Read_Timestamp__c FROM Conversation_Participant__c 
                WHERE Conversation__c = :conversationId AND User__c = :currentUserId AND Is_Active__c = true LIMIT 1
            ];

            // --- Update the Timestamp ---
            if (!participantRecords.isEmpty()) {
                Conversation_Participant__c participant = participantRecords[0];
                if (participant.Last_Read_Timestamp__c == null || nowTimestamp > participant.Last_Read_Timestamp__c) {
                    participant.Last_Read_Timestamp__c = nowTimestamp;
                    Database.update(participant); 
                    System.debug('NuvitekMessagingController.markAsRead: Updated Last_Read_Timestamp for User ' + currentUserId + ' in Conversation ' + conversationId + ' to ' + nowTimestamp);
                } else {
                    System.debug('NuvitekMessagingController.markAsRead: Last_Read_Timestamp for User ' + currentUserId + ' in Conversation ' + conversationId + ' is already up-to-date. No update performed.');
                }
            } else {
                System.debug(LoggingLevel.WARN, 'NuvitekMessagingController.markAsRead: Could not find active participant record for User ' + currentUserId + ' in Conversation ' + conversationId);
            }
        } catch (DmlException e) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.markAsRead: DML Exception updating participant timestamp. User=' + currentUserId + ', Conversation=' + conversationId + ', Error=' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
            throw new AuraHandledException('Error marking conversation as read: ' + e.getMessage());
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.markAsRead: Unexpected error updating participant timestamp. User=' + currentUserId + ', Conversation=' + conversationId + ', Error=' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
            throw new AuraHandledException('An unexpected error occurred while marking the conversation as read: ' + e.getMessage());
        }
    }

    /**
     * Get the total count of conversations with unread messages for the current user.
     * An unread conversation is one where the latest message timestamp (from another user) 
     * is newer than the user's Last_Read_Timestamp__c for that conversation.
     * 
     * @return Map containing 'count' (Integer).
     */
    @AuraEnabled
    public static Map<String, Integer> getUnreadMessageCount() {
        String currentUserId = UserInfo.getUserId();
        Integer unreadConversationCount = 0;

        try {
            // --- Step 1: Get conversations the user is part of and their last read timestamp ---
            Map<Id, Datetime> conversationLastReadMap = new Map<Id, Datetime>();
            List<Conversation_Participant__c> userParticipations = [
                SELECT Conversation__c, Last_Read_Timestamp__c FROM Conversation_Participant__c 
                WHERE User__c = :currentUserId AND Is_Active__c = true
            ];
            if (userParticipations.isEmpty()) {
                System.debug('NuvitekMessagingController.getUnreadMessageCount: User ' + currentUserId + ' is not participating in any active conversations.');
                return new Map<String, Integer>{'count' => 0};
            }
            Set<Id> conversationIds = new Set<Id>();
            for (Conversation_Participant__c p : userParticipations) {
                conversationIds.add(p.Conversation__c);
                conversationLastReadMap.put(p.Conversation__c, p.Last_Read_Timestamp__c);
            }
            
            // --- Step 2: Find the timestamp of the latest message *sent by others* in each of those conversations ---
            List<AggregateResult> latestMessageTimestamps = [
                SELECT Conversation__c convoId, MAX(CreatedDate) latestMsgDate 
                FROM Nuvitek_Message__c 
                WHERE Conversation__c IN :conversationIds AND Sender__c != :currentUserId // Critical filter!
                GROUP BY Conversation__c
            ];

            // --- Step 3: Compare latest message timestamp with last read timestamp --- 
            if (latestMessageTimestamps != null && !latestMessageTimestamps.isEmpty()) {
                 System.debug('NuvitekMessagingController.getUnreadMessageCount: Found latest message timestamps for ' + latestMessageTimestamps.size() + ' conversations from others.');
                for (AggregateResult ar : latestMessageTimestamps) {
                    Id convoId = (Id)ar.get('convoId');
                    Datetime latestMsgDate = (Datetime)ar.get('latestMsgDate');
                    Datetime lastReadDate = conversationLastReadMap.get(convoId); 

                    if (lastReadDate == null || (latestMsgDate != null && latestMsgDate > lastReadDate)) {
                        unreadConversationCount++;
                        System.debug('NuvitekMessagingController.getUnreadMessageCount: Conversation ' + convoId + ' marked as unread. LatestMsgByOther=' + latestMsgDate + ', LastReadByUser=' + lastReadDate);
                    }
                }
            } else {
                 System.debug('NuvitekMessagingController.getUnreadMessageCount: No incoming messages found in user\'s conversations.');
            }

            System.debug('NuvitekMessagingController.getUnreadMessageCount: Total unread conversations for User ' + currentUserId + ': ' + unreadConversationCount);
            return new Map<String, Integer>{'count' => unreadConversationCount};
        } catch (QueryException qe) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.getUnreadMessageCount: Query Exception getting unread count. User=' + currentUserId + ', Error=' + qe.getMessage() + '\nStackTrace: ' + qe.getStackTraceString());
             return new Map<String, Integer>{'count' => 0};
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.getUnreadMessageCount: Unexpected error getting unread count. User=' + currentUserId + ', Error=' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
            return new Map<String, Integer>{'count' => 0};
        }
    }
    
    /**
     * Fetches the most recent conversations (User-to-User) for the current user.
     * Retrieves details of the other participant, the last message snippet, 
     * and determines unread status based on Last_Read_Timestamp__c.
     * 
     * @return List<ConversationWrapper> A list of recent conversations, sorted by the last message date.
     */
    @AuraEnabled(cacheable=true) 
    public static List<ConversationWrapper> getRecentConversations() {
        String currentUserId = UserInfo.getUserId();
        List<ConversationWrapper> recentConversations = new List<ConversationWrapper>();
        
        Map<Id, ConversationWrapper> conversationMap = new Map<Id, ConversationWrapper>(); 
        Map<Id, Conversation_Participant__c> userParticipationMap = new Map<Id, Conversation_Participant__c>(); 
        Set<Id> conversationIds = new Set<Id>();
        Set<Id> otherParticipantUserIds = new Set<Id>(); 
        
        try {
            // --- Step 1: Get conversations the current user is actively participating in ---
            List<Conversation_Participant__c> participations = [
                SELECT Id, Conversation__c, User__c, Last_Read_Timestamp__c 
                FROM Conversation_Participant__c 
                WHERE User__c = :currentUserId AND Is_Active__c = true
            ];
            if (participations.isEmpty()) {
                System.debug('NuvitekMessagingController.getRecentConversations: User ' + currentUserId + ' is not in any active conversations.');
                return recentConversations; 
            }
            for (Conversation_Participant__c p : participations) {
                conversationIds.add(p.Conversation__c);
                userParticipationMap.put(p.Conversation__c, p);
                ConversationWrapper wrapper = new ConversationWrapper();
                wrapper.id = p.Conversation__c; 
                conversationMap.put(p.Conversation__c, wrapper);
            }
             System.debug('NuvitekMessagingController.getRecentConversations: User ' + currentUserId + ' is in ' + conversationIds.size() + ' conversations.');

            // --- Step 2: Find the *other* participant in each conversation ---
            List<Conversation_Participant__c> otherParticipants = [
                SELECT Id, Conversation__c, User__c, User__r.Name, User__r.SmallPhotoUrl, User__r.Title 
                FROM Conversation_Participant__c 
                WHERE Conversation__c IN :conversationIds AND User__c != :currentUserId AND Is_Active__c = true 
            ];
            if (otherParticipants != null && !otherParticipants.isEmpty()) {
                 System.debug('NuvitekMessagingController.getRecentConversations: Found ' + otherParticipants.size() + ' other participants across conversations.');
                for (Conversation_Participant__c op : otherParticipants) {
                    if (conversationMap.containsKey(op.Conversation__c)) {
                        ConversationWrapper wrapper = conversationMap.get(op.Conversation__c);
                        wrapper.participantId = op.User__c; 
                        wrapper.name = op.User__r.Name;
                        wrapper.photoUrl = op.User__r.SmallPhotoUrl;
                        wrapper.title = op.User__r.Title;
                        otherParticipantUserIds.add(op.User__c); 
                    }
                }
            }

            // --- Step 3: Find the latest message for each conversation ---
             // Query latest messages to get content reliably
             Map<Id, Nuvitek_Message__c> latestMessageMap = new Map<Id, Nuvitek_Message__c>();
             // Use an optimized query to get only the latest message per conversation
             // This is typically done using a subquery or specific SOQL patterns if possible,
             // but a simple ORDER BY + Map processing is often sufficient and easier to read.
             for (Nuvitek_Message__c msg : [SELECT Id, Conversation__c, Content__c, CreatedDate, Sender__c
                                            FROM Nuvitek_Message__c 
                                            WHERE Conversation__c IN :conversationIds 
                                            ORDER BY CreatedDate DESC]) {
                 // Since we ordered DESC, the first message we encounter for a conversation is the latest
                 if (!latestMessageMap.containsKey(msg.Conversation__c)) {
                     latestMessageMap.put(msg.Conversation__c, msg);
                 }
             }

            // Map latest message info to the ConversationWrapper and determine unread status
            if (!latestMessageMap.isEmpty()) {
                 System.debug('NuvitekMessagingController.getRecentConversations: Found latest message info for ' + latestMessageMap.size() + ' conversations.');
                for (Id convoId : latestMessageMap.keySet()) {
                     if (conversationMap.containsKey(convoId)) {
                        ConversationWrapper wrapper = conversationMap.get(convoId);
                        Nuvitek_Message__c latestMsg = latestMessageMap.get(convoId);
                        Datetime latestMsgDate = latestMsg.CreatedDate;
                        String lastMsgContent = latestMsg.Content__c; 
                        
                        wrapper.lastMessageTimestamp = latestMsgDate;
                        wrapper.lastMessageSnippet = String.isNotBlank(lastMsgContent)
                            ? (lastMsgContent.length() > 50 ? lastMsgContent.substring(0, 50) + '...' : lastMsgContent)
                            : '[No message content]'; 

                        // Determine unread status based on the *current user's* participation record
                        Conversation_Participant__c currentUserParticipant = userParticipationMap.get(convoId);
                        if (currentUserParticipant != null) {
                            Datetime lastReadDate = currentUserParticipant.Last_Read_Timestamp__c;
                            // Check if the latest message is *from someone else* and newer than last read
                            if (latestMsg.Sender__c != currentUserId && (lastReadDate == null || (latestMsgDate != null && latestMsgDate > lastReadDate))) {
                                wrapper.hasUnread = true;
                                // Optional: Calculate unread count (can be complex, skip for Phase 1)
                                System.debug('NuvitekMessagingController.getRecentConversations: Conversation ' + convoId + ' marked as unread for user ' + currentUserId);
                            }
                        }
                    }
                }
            }

            // --- Step 4: Populate the final list and filter --- 
            for (Id convoId : conversationMap.keySet()) {
                 ConversationWrapper wrapper = conversationMap.get(convoId);
                 // Only include conversations where we found the other participant AND it has messages
                 if (String.isNotBlank(wrapper.participantId) && wrapper.lastMessageTimestamp != null) {
                    recentConversations.add(wrapper);
                 } else {
                      System.debug('NuvitekMessagingController.getRecentConversations: Skipping conversation ' + convoId + ' due to missing participant details or no messages.');
                 }
            }
            
            // --- Step 5: Sort by last message timestamp --- 
            if (!recentConversations.isEmpty()) {
                recentConversations.sort(); 
            }
            
            System.debug('NuvitekMessagingController.getRecentConversations: Returning ' + recentConversations.size() + ' recent conversations.');
            return recentConversations;

        } catch (QueryException qe) {
             System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.getRecentConversations: Query Exception. User=' + currentUserId + ', Error=' + qe.getMessage() + '\nStackTrace: ' + qe.getStackTraceString());
            throw new AuraHandledException('Error retrieving recent conversations: ' + qe.getMessage());
        } catch (Exception e) {
             System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.getRecentConversations: Unexpected error. User=' + currentUserId + ', Error=' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
            throw new AuraHandledException('An unexpected error occurred while retrieving recent conversations: ' + e.getMessage());
        }
    }

    /**
     * Finds or creates a conversation between two users and returns its ID.
     * Called by the LWC when selecting a recipient from search results.
     * 
     * @param userId1 The ID of the first user (typically the current user).
     * @param userId2 The ID of the second user (the selected recipient).
     * @return The ID of the Conversation__c record.
     */
    @AuraEnabled
    public static String getConversationForUsers(String userId1, String userId2) {
        // --- Input Validation ---
        if (String.isBlank(userId1) || String.isBlank(userId2)) {
             System.debug(LoggingLevel.WARN, 'NuvitekMessagingController.getConversationForUsers: userId1 or userId2 is blank.');
            throw new AuraHandledException('Both user IDs must be provided.');
        }
        if (userId1 == userId2) {
            System.debug(LoggingLevel.WARN, 'NuvitekMessagingController.getConversationForUsers: User IDs are the same.');
            throw new AuraHandledException('Cannot create a conversation with oneself.');
        }
        System.debug('NuvitekMessagingController.getConversationForUsers: Finding/creating conversation between ' + userId1 + ' and ' + userId2);
        try {
            return findOrCreateConversation(userId1, userId2);
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.getConversationForUsers: Error finding/creating conversation. Error=' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to get or create conversation: ' + e.getMessage());
        }
    }

    /**
     * Generates a summary of a chat conversation using a configured AI model.
     * 
     * @param conversationId The ID of the Conversation__c to summarize.
     * @param modelLabel The MasterLabel of the LLM_Configuration__mdt record to use (e.g., "Gemini 2.5 Pro").
     * @return A string containing the AI-generated summary.
     */
    @AuraEnabled
    public static String getChatSummary(String conversationId, String modelLabel) {
        // --- Input Validation ---
        if (String.isBlank(conversationId) || String.isBlank(modelLabel)) {
            System.debug(LoggingLevel.WARN, 'NuvitekMessagingController.getChatSummary: conversationId or modelLabel is blank.');
            throw new AuraHandledException('Conversation ID and AI Model Label are required.');
        }
        String currentUserId = UserInfo.getUserId();
        System.debug('NuvitekMessagingController.getChatSummary: Request received for Conversation=' + conversationId + ', Model=' + modelLabel + ', User=' + currentUserId);

        // --- Authorization Check ---
        List<Conversation_Participant__c> participants = [
            SELECT Id FROM Conversation_Participant__c 
            WHERE Conversation__c = :conversationId AND User__c = :currentUserId AND Is_Active__c = true LIMIT 1
        ];
        if (participants.isEmpty()) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.getChatSummary: User ' + currentUserId + ' is not an active participant of Conversation ' + conversationId + '. Access denied.');
            throw new AuraHandledException('You do not have access to this conversation.');
        }
        
        try {
            // --- Fetch LLM Configuration ---
            System.debug('NuvitekMessagingController.getChatSummary: Fetching LLM config for label: ' + modelLabel);
            List<LLM_Configuration__mdt> configs = [
                SELECT API_Key__c, Model_Name__c, Provider__c, Max_Tokens__c, Temperature__c
                FROM LLM_Configuration__mdt 
                WHERE MasterLabel = :modelLabel AND IsActive__c = true AND Provider__c = 'Google'
                LIMIT 1
            ];
            if (configs.isEmpty()) {
                 System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.getChatSummary: Active Google LLM Configuration not found for label: ' + modelLabel);
                throw new AuraHandledException('Active AI configuration not found for model: ' + modelLabel + '. Please check Custom Metadata Types.');
            }
            LLM_Configuration__mdt config = configs[0];
             System.debug('NuvitekMessagingController.getChatSummary: Found config: ' + config.Model_Name__c);
            if (String.isBlank(config.API_Key__c)) {
                 System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.getChatSummary: API Key is missing in the LLM Configuration metadata record for ' + modelLabel);
                throw new AuraHandledException('API Key is missing for the selected AI model configuration. Please update the Custom Metadata record.');
            }

            // --- Fetch Conversation Messages ---
            System.debug('NuvitekMessagingController.getChatSummary: Fetching messages for conversation: ' + conversationId);
            List<Nuvitek_Message__c> messages = [
                SELECT Sender__r.Name, Content__c, CreatedDate 
                FROM Nuvitek_Message__c 
                WHERE Conversation__c = :conversationId 
                ORDER BY CreatedDate ASC 
                LIMIT 200 // Limit message history for summarization prompt size
            ];
            if (messages.isEmpty()) {
                System.debug('NuvitekMessagingController.getChatSummary: No messages found to summarize for conversation: ' + conversationId);
                return 'There are no messages in this conversation to summarize.';
            }
            System.debug('NuvitekMessagingController.getChatSummary: Fetched ' + messages.size() + ' messages.');

            // --- Format Messages for Prompt ---
            String formattedMessages = '';
            for (Nuvitek_Message__c msg : messages) {
                formattedMessages += msg.Sender__r.Name + ': ' + msg.Content__c + '\n';
            }
            // Remove trailing newline
            if (formattedMessages.endsWith('\n')) {
                formattedMessages = formattedMessages.removeEnd('\n');
            }
            
            // --- Construct the Prompt ---
            String prompt = 'Summarize the following conversation concisely. Focus on the key topics discussed and any decisions made or actions agreed upon. Keep the summary brief and easy to understand.\n\nCONVERSATION:\n' + formattedMessages;
            System.debug('NuvitekMessagingController.getChatSummary: Prompt length: ' + prompt.length());

            // --- Make API Call ---
            System.debug('NuvitekMessagingController.getChatSummary: Making API call to Google model: ' + config.Model_Name__c);
            String summary = makeGoogleApiCall(config, prompt);
            System.debug('NuvitekMessagingController.getChatSummary: Summary received.');

            return summary;

        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.getChatSummary: Error generating summary. Conversation=' + conversationId + ', Model=' + modelLabel + ', Error=' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
            // Provide a more user-friendly error message
            String userErrorMessage = 'Failed to generate summary. ';
            if (e instanceof CalloutException) {
                userErrorMessage += 'Could not connect to the AI service. Please ensure the Remote Site Setting is configured correctly.';
            } else if (e.getMessage().contains('API Key')) {
                 userErrorMessage += e.getMessage(); // Include specific API key error message
            } else if (e.getMessage().contains('AI configuration')) {
                 userErrorMessage += e.getMessage(); // Include specific config error message
            }
            else {
                userErrorMessage += 'An unexpected error occurred: ' + e.getMessage();
            }
            throw new AuraHandledException(userErrorMessage);
        }
    }

    // --- Internal Helper Methods (Adapted from LLMController) ---

    /**
     * Internal helper to make the HTTP callout to the Google Generative AI API.
     * Handles request construction based on the configuration and prompt.
     * Requires Remote Site Setting for 'https://generativelanguage.googleapis.com'.
     * 
     * @param config The LLM_Configuration__mdt record containing API key, model name, etc.
     * @param prompt The formatted prompt string including the conversation history.
     * @return String The raw response body from the API on success.
     * @throws CalloutException, AuraHandledException for API errors or other issues.
     */
    private static String makeGoogleApiCall(LLM_Configuration__mdt config, String prompt) {
        System.debug('NuvitekMessagingController.makeGoogleApiCall: Preparing Google API request. Model=' + config.Model_Name__c);
        
        // Construct the specific endpoint URL using the model name
        // Example: https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
        // Adjust 'v1beta' or 'v1' as needed based on the specific model's API version
        String apiVersion = 'v1beta'; // Default, might need adjustment based on model
        // Simple check for known model versions, refine as needed
        if (config.Model_Name__c.contains('gemini-2.0') || config.Model_Name__c.contains('gemini-1.0')) {
             apiVersion = 'v1';
        } else if (config.Model_Name__c.contains('gemini-1.5') || config.Model_Name__c.contains('gemini-2.5')) {
             apiVersion = 'v1beta'; 
        }
        // If the Model_Name__c already contains the 'models/' prefix, use it directly
        String modelPath = config.Model_Name__c;
        if (!modelPath.startsWith('models/')) {
             modelPath = 'models/' + modelPath;
        }
        String endpointUrl = 'https://generativelanguage.googleapis.com/' + apiVersion + '/' + modelPath + ':generateContent?key=' + config.API_Key__c;
        
        System.debug('NuvitekMessagingController.makeGoogleApiCall: Endpoint URL: ' + endpointUrl);


        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpointUrl);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setTimeout(120000); // 120 seconds timeout

        // --- Construct Google API Request Body ---
        Map<String, Object> requestBody = new Map<String, Object>();
        List<Map<String, Object>> contents = new List<Map<String, Object>>();
        Map<String, Object> userMessage = new Map<String, Object>();
        List<Map<String, Object>> parts = new List<Map<String, Object>>();
        Map<String, Object> textPart = new Map<String, Object>();

        textPart.put('text', prompt);
        parts.add(textPart);
        userMessage.put('role', 'user');
        userMessage.put('parts', parts);
        contents.add(userMessage);
        requestBody.put('contents', contents);

        // Optional: Add generationConfig if needed (using defaults here)
        Map<String,Object> generationConfig = new Map<String,Object>{
            'temperature' => config.Temperature__c != null ? config.Temperature__c : 0.7, // Default temp if null
            'maxOutputTokens' => config.Max_Tokens__c != null ? Integer.valueOf(config.Max_Tokens__c) : 1024, // Default max tokens
            'topP' => 0.95,
            'topK' => 40
        };
        requestBody.put('generationConfig', generationConfig);
        // --- End Request Body Construction ---

        String bodyJson = JSON.serialize(requestBody);
        req.setBody(bodyJson);
        System.debug('NuvitekMessagingController.makeGoogleApiCall: Request Body: ' + bodyJson.abbreviate(500)); // Log abbreviated body

        // --- Send Request ---
        HttpResponse res = null;
        try {
            res = new Http().send(req);
            System.debug('NuvitekMessagingController.makeGoogleApiCall: Response Status Code: ' + res.getStatusCode());
        } catch (System.CalloutException e) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.makeGoogleApiCall: Callout failed. Check Remote Site Settings for https://generativelanguage.googleapis.com. Error: ' + e.getMessage());
            throw e; // Re-throw CalloutException to be handled upstream
        }

        // --- Handle Response ---
        if (res.getStatusCode() >= 200 && res.getStatusCode() < 300) {
             System.debug('NuvitekMessagingController.makeGoogleApiCall: Success. Response Body: ' + res.getBody().abbreviate(500));
             // Parse and return the text content
             return parseGoogleApiResponse(res.getBody());
        } else {
            // Handle API errors
            String errorMsg = 'Google API Error (' + res.getStatusCode() + ' ' + res.getStatus() + '): ' + res.getBody();
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.makeGoogleApiCall: ' + errorMsg);
            throw new AuraHandledException(errorMsg); // Throw specific error
        }
    }

    /**
     * Internal helper to parse the JSON response from the Google Generative AI API.
     * Extracts the text content from the expected structure.
     * 
     * @param responseBody The JSON string response body from the API.
     * @return String The extracted text summary.
     * @throws AuraHandledException if the response structure is invalid or text is missing.
     */
    private static String parseGoogleApiResponse(String responseBody) {
         System.debug('NuvitekMessagingController.parseGoogleApiResponse: Parsing response...');
        try {
            Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(responseBody);

            if (responseMap.containsKey('candidates')) {
                List<Object> candidates = (List<Object>) responseMap.get('candidates');
                if (candidates != null && !candidates.isEmpty()) {
                    Map<String, Object> firstCandidate = (Map<String, Object>) candidates[0];
                    if (firstCandidate.containsKey('content')) {
                        Map<String, Object> content = (Map<String, Object>) firstCandidate.get('content');
                        if (content.containsKey('parts')) {
                            List<Object> parts = (List<Object>) content.get('parts');
                            if (parts != null && !parts.isEmpty()) {
                                Map<String, Object> firstPart = (Map<String, Object>) parts[0];
                                if (firstPart.containsKey('text')) {
                                    String summaryText = (String) firstPart.get('text');
                                    System.debug('NuvitekMessagingController.parseGoogleApiResponse: Extracted summary text.');
                                    return summaryText.trim(); 
                                }
                            }
                        }
                    }
                }
            }
            
            // Check for specific error structures if needed
            if (responseMap.containsKey('error')) {
                 Map<String, Object> errorDetails = (Map<String, Object>) responseMap.get('error');
                 String errorMessage = 'Google API Error: ' + JSON.serialize(errorDetails);
                  System.debug(LoggingLevel.ERROR,'NuvitekMessagingController.parseGoogleApiResponse: ' + errorMessage);
                  throw new AuraHandledException(errorMessage);
            }

            // If structure is unexpected
            System.debug(LoggingLevel.ERROR,'NuvitekMessagingController.parseGoogleApiResponse: Could not find summary text in the expected response structure.');
            throw new AuraHandledException('Failed to parse AI response. Unexpected format received.');

        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR,'NuvitekMessagingController.parseGoogleApiResponse: Exception during parsing. Error: ' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to parse AI response: ' + e.getMessage());
        }
    }

    // --- Wrapper Classes ---

    /**
     * Wrapper class for returning User search results.
     * Simplified for Phase 1 (User-to-User).
     */
    public class UserSearchResultWrapper {
        @AuraEnabled public String id;       // User ID
        @AuraEnabled public String name;     // User's Name
        @AuraEnabled public String title;    // User's Title
        @AuraEnabled public String photoUrl; // User's SmallPhotoUrl
    }

    /**
     * Wrapper class for returning recent conversation data.
     * Refactored for Phase 1 (User-to-User via Conversation__c).
     */
    public class ConversationWrapper implements Comparable {
        @AuraEnabled public String id;             // Conversation__c ID
        @AuraEnabled public String participantId;  // ID of the *other* user in the conversation
        @AuraEnabled public String name;           // Name of the other participant User
        @AuraEnabled public String photoUrl;       // Photo URL of the other participant User
        @AuraEnabled public String title;          // Title of the other participant User
        @AuraEnabled public String lastMessageSnippet; // Snippet of the last message in the conversation
        @AuraEnabled public Datetime lastMessageTimestamp; // Timestamp of the last message
        @AuraEnabled public Boolean hasUnread = false;    // Calculated based on current user's Last_Read_Timestamp__c
        @AuraEnabled public Integer unreadCount = 0; // Optional: Count (may be omitted in Phase 1)

        // Implement Comparable to sort by lastMessageTimestamp descending
        public Integer compareTo(Object compareTo) {
            ConversationWrapper compareToConvo = (ConversationWrapper)compareTo;
            if (lastMessageTimestamp == null && compareToConvo.lastMessageTimestamp == null) return 0;
            if (lastMessageTimestamp == null) return 1; 
            if (compareToConvo.lastMessageTimestamp == null) return -1;
            if (lastMessageTimestamp.getTime() < compareToConvo.lastMessageTimestamp.getTime()) return 1;
            if (lastMessageTimestamp.getTime() > compareToConvo.lastMessageTimestamp.getTime()) return -1;
            return 0;
        }
    }
    
    /**
     * MessageWrapper class for formatting message data for the UI.
     * Updated for Phase 1: Removed isRead.
     */
    public class MessageWrapper {
        @AuraEnabled public String id;             // Nuvitek_Message__c ID
        @AuraEnabled public String content;        // Message content
        @AuraEnabled public Datetime timestamp;    // Message CreatedDate
        @AuraEnabled public Boolean isFromUser;   // True if Sender__c is the current user
        @AuraEnabled public String senderName;     // Sender's Name
        @AuraEnabled public String senderPhotoUrl; // Sender's SmallPhotoUrl
    }

    // --- Deprecated Methods Removed ---
    // The old versions of sendMessage, getMessages, markAsRead, 
    // getUnreadMessageCount, and getRecentConversations that used
    // recipientId/recipientType have been removed after refactoring.
    
    // --- Old Wrapper Class Removed ---
    // The RecipientWrapper class has been removed as UserSearchResultWrapper is used.

} // End of class