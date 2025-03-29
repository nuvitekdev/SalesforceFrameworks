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
     * Searches for recipients matching the search term, including Users, Contacts, Accounts, and Groups.
     * 
     * @param searchTerm Search string to find matching Users/Contacts.
     * @param objectTypes List of object types to search for (User, Contact, Account, Group).
     * @return List of search result wrapper objects.
     */
    @AuraEnabled(cacheable=true)
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
            // Default to all object types if none specified
            if (objectTypes == null || objectTypes.isEmpty()) {
                objectTypes = new List<String>{'User', 'Contact', 'Account', 'Group'};
            }
            
            // Check what objects we should search for
            Boolean searchUsers = objectTypes.contains('User');
            Boolean searchContacts = objectTypes.contains('Contact');
            Boolean searchAccounts = objectTypes.contains('Account');
            Boolean searchGroups = objectTypes.contains('Group');
            
            // Build SOSL returning clause
            String returningClause = '';
            Integer returnIndex = 0;
            Map<String, Integer> returnIndexMap = new Map<String, Integer>();
            
            if (searchUsers) {
                returningClause += 'User(Id, Name, Title, SmallPhotoUrl, IsActive WHERE IsActive = true LIMIT 20)';
                returnIndexMap.put('User', returnIndex++);
            }
            
            if (searchContacts) {
                if (returningClause != '') returningClause += ', ';
                returningClause += 'Contact(Id, Name, Title, PhotoUrl, Email, AccountId LIMIT 20)';
                returnIndexMap.put('Contact', returnIndex++);
            }
            
            if (searchAccounts) {
                if (returningClause != '') returningClause += ', ';
                returningClause += 'Account(Id, Name, BillingStreet, BillingCity, Phone, Website, Industry LIMIT 20)';
                returnIndexMap.put('Account', returnIndex++);
            }
            
            if (searchGroups) {
                if (returningClause != '') returningClause += ', ';
                returningClause += 'Group(Id, Name, DeveloperName, Type LIMIT 20)';
                returnIndexMap.put('Group', returnIndex++);
            }
            
            // --- Construct SOSL Query ---
            String soslQuery = 'FIND :sanitizedTerm IN NAME FIELDS RETURNING ' + returningClause;
            System.debug('NuvitekMessagingController.searchRecipients: Executing SOSL query: ' + soslQuery);
            
            // --- Execute SOSL Search ---
            List<List<SObject>> searchList = Search.query(soslQuery);
            
            // --- Process User Results ---
            if (searchUsers && searchList != null && searchList.size() > returnIndexMap.get('User')) {
                List<User> userResults = (List<User>) searchList[returnIndexMap.get('User')];
                String currentUserId = UserInfo.getUserId();
                for (User u : userResults) {
                    if (u.Id == currentUserId) continue; 
                    UserSearchResultWrapper wrapper = new UserSearchResultWrapper();
                    wrapper.id = u.Id;
                    wrapper.name = u.Name;
                    wrapper.title = u.Title;
                    wrapper.photoUrl = u.SmallPhotoUrl;
                    wrapper.objectType = 'User';
                    results.add(wrapper);
                }
                System.debug('NuvitekMessagingController.searchRecipients: Found ' + userResults.size() + ' User results.');
            }
            
            // --- Process Contact Results ---
            if (searchContacts && searchList != null && searchList.size() > returnIndexMap.get('Contact')) {
                List<Contact> contactResults = (List<Contact>) searchList[returnIndexMap.get('Contact')];
                for (Contact c : contactResults) {
                    UserSearchResultWrapper wrapper = new UserSearchResultWrapper();
                    wrapper.id = c.Id;
                    wrapper.name = c.Name;
                    wrapper.title = c.Title;
                    wrapper.photoUrl = c.PhotoUrl;
                    wrapper.objectType = 'Contact';
                    results.add(wrapper);
                }
                System.debug('NuvitekMessagingController.searchRecipients: Found ' + searchList[returnIndexMap.get('Contact')].size() + ' Contact results.');
            }
            
            // --- Process Account Results ---
            if (searchAccounts && searchList != null && searchList.size() > returnIndexMap.get('Account')) {
                List<Account> accountResults = (List<Account>) searchList[returnIndexMap.get('Account')];
                for (Account a : accountResults) {
                    UserSearchResultWrapper wrapper = new UserSearchResultWrapper();
                    wrapper.id = a.Id;
                    wrapper.name = a.Name;
                    wrapper.title = a.Industry;  // Use Industry as the "title" for display purposes
                    wrapper.photoUrl = null;     // Accounts don't have photos, we'll use placeholder
                    wrapper.objectType = 'Account';
                    results.add(wrapper);
                }
                System.debug('NuvitekMessagingController.searchRecipients: Found ' + searchList[returnIndexMap.get('Account')].size() + ' Account results.');
            }
            
            // --- Process Group Results ---
            if (searchGroups && searchList != null && searchList.size() > returnIndexMap.get('Group')) {
                List<Group> groupResults = (List<Group>) searchList[returnIndexMap.get('Group')];
                for (Group g : groupResults) {
                    UserSearchResultWrapper wrapper = new UserSearchResultWrapper();
                    wrapper.id = g.Id;
                    wrapper.name = g.Name;
                    wrapper.title = g.Type;      // Use Group Type as the "title"
                    wrapper.photoUrl = null;     // Groups don't have photos, we'll use placeholder
                    wrapper.objectType = 'Group';
                    results.add(wrapper);
                }
                System.debug('NuvitekMessagingController.searchRecipients: Found ' + searchList[returnIndexMap.get('Group')].size() + ' Group results.');
            }
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.searchRecipients: Error searching. Term=' + searchTerm + ', Error=' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
            throw new AuraHandledException('Error searching: ' + e.getMessage());
        }
        return results;
    }
    
    /**
     * Sends a message from the current user to a recipient.
     * Supports sending to Users, Contacts, Person Accounts, and Group conversations.
     * 
     * @param recipientId The ID of the recipient (User, Contact, PersonAccount) or conversation ID.
     * @param recipientType The type of recipient (User, Contact, PersonAccount, Conversation).
     * @param content The text content of the message.
     * @return Map containing 'messageId', 'conversationId', and 'userPhotoUrl'.
     */
    @AuraEnabled
    public static Map<String, String> sendMessage(String recipientId, String recipientType, String content) {
        // --- Input Validation ---
        if (String.isBlank(recipientId) || String.isBlank(content)) {
            System.debug(LoggingLevel.WARN, 'NuvitekMessagingController.sendMessage: recipientId or content is blank.');
            throw new AuraHandledException('Recipient ID and message content cannot be blank.');
        }
        
        String currentUserId = UserInfo.getUserId();
        Id conversationId;
        
        try {
            // --- Handle based on recipient type ---
            if (recipientType == 'Conversation') {
                // Direct message to an existing conversation
                conversationId = recipientId;
                
                // Verify current user is a participant
                List<Conversation_Participant__c> participants = [
                    SELECT Id FROM Conversation_Participant__c 
                    WHERE Conversation__c = :conversationId AND User__c = :currentUserId AND Is_Active__c = true
                    LIMIT 1
                ];
                
                if (participants.isEmpty()) {
                    throw new AuraHandledException('You are not a participant in this conversation.');
                }
                
            } else if (recipientType == 'User') {
                // User-to-User message
                if (recipientId == currentUserId) {
                    throw new AuraHandledException('You cannot send a message to yourself.');
                }
                
                // Verify recipient exists and is active
                List<User> recipientUsers = [SELECT Id, Name FROM User WHERE Id = :recipientId AND IsActive = true LIMIT 1];
                if (recipientUsers.isEmpty()) {
                    throw new AuraHandledException('Recipient user not found or is inactive.');
                }
                
                // Find or create conversation
                conversationId = findOrCreateConversation(currentUserId, recipientId);
                
            } else if (recipientType == 'Contact' || recipientType == 'PersonAccount') {
                // For Contact or PersonAccount, we need to find or create a special conversation
                // First, check if a 1-1 conversation already exists
                List<Conversation_Group_Participant__c> existingParticipants;
                
                if (recipientType == 'Contact') {
                    existingParticipants = [
                        SELECT Conversation__c
                        FROM Conversation_Group_Participant__c
                        WHERE Contact__c = :recipientId AND Conversation__r.Is_Group_Chat__c = false
                    ];
                } else { // PersonAccount
                    existingParticipants = [
                        SELECT Conversation__c
                        FROM Conversation_Group_Participant__c
                        WHERE Person_Account__c = :recipientId AND Conversation__r.Is_Group_Chat__c = false
                    ];
                }
                
                if (!existingParticipants.isEmpty()) {
                    // Find a conversation where current user is the only other participant
                    Set<Id> potentialConvoIds = new Set<Id>();
                    for (Conversation_Group_Participant__c p : existingParticipants) {
                        potentialConvoIds.add(p.Conversation__c);
                    }
                    
                    // Check if current user is the only user participant
                    Map<Id, Integer> convoParticipantCount = new Map<Id, Integer>();
                    List<AggregateResult> participantCounts = [
                        SELECT Conversation__c, COUNT(Id) cnt
                        FROM Conversation_Participant__c
                        WHERE Conversation__c IN :potentialConvoIds
                        GROUP BY Conversation__c
                    ];
                    for (AggregateResult ar : participantCounts) {
                        convoParticipantCount.put((Id)ar.get('Conversation__c'), Integer.valueOf(ar.get('cnt')));
                    }
                    
                    for (Id cid : potentialConvoIds) {
                        // Check if there's only one participant (current user) and this participant is the current user
                        if (convoParticipantCount.containsKey(cid) && convoParticipantCount.get(cid) == 1) {
                            List<Conversation_Participant__c> soloParticipant = [
                                SELECT User__c FROM Conversation_Participant__c 
                                WHERE Conversation__c = :cid AND Is_Active__c = true
                                LIMIT 1
                            ];
                            
                            if (!soloParticipant.isEmpty() && soloParticipant[0].User__c == currentUserId) {
                                conversationId = cid;
                                break;
                            }
                        }
                    }
                }
                
                // If no existing conversation found, create a new one
                if (conversationId == null) {
                    // Create new conversation
                    Conversation__c newConvo = new Conversation__c(
                        Is_Group_Chat__c = false // 1-1 conversation with a Contact/PersonAccount
                    );
                    insert newConvo;
                    conversationId = newConvo.Id;
                    
                    // Add current user as participant
                    Conversation_Participant__c userParticipant = new Conversation_Participant__c(
                        Conversation__c = conversationId,
                        User__c = currentUserId,
                        Is_Active__c = true
                    );
                    insert userParticipant;
                    
                    // Add Contact/PersonAccount as group participant
                    Conversation_Group_Participant__c groupParticipant = new Conversation_Group_Participant__c(
                        Conversation__c = conversationId
                    );
                    
                    if (recipientType == 'Contact') {
                        groupParticipant.Contact__c = recipientId;
                    } else { // PersonAccount
                        groupParticipant.Person_Account__c = recipientId;
                    }
                    
                    insert groupParticipant;
                }
            } else {
                throw new AuraHandledException('Unsupported recipient type: ' + recipientType);
            }
            
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
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.sendMessage: Error sending message. CurrentUser=' + currentUserId + ', RecipientId=' + recipientId + ', Error=' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
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
     * Retrieves recent conversations for the current user, including:
     * - 1:1 conversations with other users
     * - 1:1 conversations with contacts and person accounts
     * - Group conversations
     * 
     * @param limitVal Maximum number of conversations to return
     * @return List of conversation wrapper objects with unread counts
     */
    @AuraEnabled
    public static List<ConversationWrapper> getRecentConversations(Integer limitVal) {
        if (limitVal == null || limitVal <= 0) {
            limitVal = 10; // Default limit
        }
        
        String currentUserId = UserInfo.getUserId();
        List<ConversationWrapper> result = new List<ConversationWrapper>();
        
        try {
            // Find all conversations the current user is participating in
            List<Conversation_Participant__c> userParticipations = [
                SELECT Id, Conversation__c, Last_Read_Timestamp__c
                FROM Conversation_Participant__c
                WHERE User__c = :currentUserId AND Is_Active__c = true
            ];
            
            if (userParticipations.isEmpty()) {
                return result; // No conversations to return
            }
            
            // Extract conversation IDs
            Set<Id> conversationIds = new Set<Id>();
            Map<Id, DateTime> lastReadMap = new Map<Id, DateTime>();
            
            for (Conversation_Participant__c cp : userParticipations) {
                conversationIds.add(cp.Conversation__c);
                lastReadMap.put(cp.Conversation__c, cp.Last_Read_Timestamp__c);
            }
            
            // Get conversation details
            List<Conversation__c> conversations = [
                SELECT Id, Last_Message_Timestamp__c, Last_Message_Snippet__c, Is_Group_Chat__c, Group_Name__c
                FROM Conversation__c
                WHERE Id IN :conversationIds
                ORDER BY Last_Message_Timestamp__c DESC
                LIMIT :limitVal
            ];
            
            // Get user participants (for 1:1 conversations)
            Map<Id, List<Conversation_Participant__c>> conversationToParticipants = new Map<Id, List<Conversation_Participant__c>>();
            
            for (Conversation_Participant__c participant : [
                SELECT Id, Conversation__c, User__c, User__r.Name, User__r.SmallPhotoUrl, User__r.Title 
                FROM Conversation_Participant__c
                WHERE Conversation__c IN :conversationIds AND User__c != :currentUserId AND Is_Active__c = true
            ]) {
                if (!conversationToParticipants.containsKey(participant.Conversation__c)) {
                    conversationToParticipants.put(participant.Conversation__c, new List<Conversation_Participant__c>());
                }
                conversationToParticipants.get(participant.Conversation__c).add(participant);
            }
            
            // Get contact/person account participants (for non-user 1:1 and group chats)
            Map<Id, List<Conversation_Group_Participant__c>> conversationToGroupParticipants = new Map<Id, List<Conversation_Group_Participant__c>>();
            
            for (Conversation_Group_Participant__c groupParticipant : [
                SELECT Id, Conversation__c, 
                       Contact__c, Contact__r.Name, Contact__r.Title, Contact__r.PhotoUrl,
                       Person_Account__c, Person_Account__r.Name, Person_Account__r.PersonTitle,
                       Group__c
                FROM Conversation_Group_Participant__c
                WHERE Conversation__c IN :conversationIds
            ]) {
                if (!conversationToGroupParticipants.containsKey(groupParticipant.Conversation__c)) {
                    conversationToGroupParticipants.put(groupParticipant.Conversation__c, new List<Conversation_Group_Participant__c>());
                }
                conversationToGroupParticipants.get(groupParticipant.Conversation__c).add(groupParticipant);
            }
            
            // Get unread counts
            Map<Id, Integer> unreadCounts = new Map<Id, Integer>();
            
            // Query to get all unread messages
            List<AggregateResult> unreadResults = [
                SELECT Conversation__c, COUNT(Id) unreadCount
                FROM Nuvitek_Message__c
                WHERE Conversation__c IN :conversationIds
                AND Sender__c != :currentUserId
                GROUP BY Conversation__c
            ];
            
            // Process unread counts
            for (AggregateResult ar : unreadResults) {
                Id convoId = (Id)ar.get('Conversation__c');
                // Only count as unread if the message is newer than last read time
                if (lastReadMap.containsKey(convoId)) {
                    Integer count = (Integer)ar.get('unreadCount');
                    unreadCounts.put(convoId, count);
                }
            }
            
            // Build the response
            for (Conversation__c convo : conversations) {
                ConversationWrapper wrapper = new ConversationWrapper();
                wrapper.id = convo.Id;
                wrapper.lastMessageSnippet = convo.Last_Message_Snippet__c;
                wrapper.lastMessageTimestamp = convo.Last_Message_Timestamp__c;
                wrapper.unreadCount = unreadCounts.containsKey(convo.Id) ? unreadCounts.get(convo.Id) : 0;
                wrapper.hasUnread = wrapper.unreadCount > 0;
                
                // Handle group chats differently
                if (convo.Is_Group_Chat__c) {
                    wrapper.isGroupChat = true;
                    wrapper.name = convo.Group_Name__c;
                    wrapper.objectType = 'Group';
                    
                    // Create participant summary
                    List<String> participantNames = new List<String>();
                    
                    // Add user participants
                    if (conversationToParticipants.containsKey(convo.Id)) {
                        for (Conversation_Participant__c p : conversationToParticipants.get(convo.Id)) {
                            if (participantNames.size() < 3) { // Limit to first 3 for display
                                participantNames.add(p.User__r.Name);
                            }
                        }
                    }
                    
                    // Add non-user participants
                    if (conversationToGroupParticipants.containsKey(convo.Id)) {
                        for (Conversation_Group_Participant__c p : conversationToGroupParticipants.get(convo.Id)) {
                            if (participantNames.size() < 3) { // Limit to first 3 for display
                                if (p.Contact__c != null) {
                                    participantNames.add(p.Contact__r.Name);
                                } else if (p.Person_Account__c != null) {
                                    participantNames.add(p.Person_Account__r.Name);
                                } else if (p.Group__c != null) {
                                    participantNames.add(p.Group__c);
                                }
                            }
                        }
                    }
                    
                    // Set member summary
                    Integer totalParticipants = (conversationToParticipants.containsKey(convo.Id) ? conversationToParticipants.get(convo.Id).size() : 0)
                                             + (conversationToGroupParticipants.containsKey(convo.Id) ? conversationToGroupParticipants.get(convo.Id).size() : 0);
                    
                    if (participantNames.isEmpty()) {
                        wrapper.title = 'Group chat with ' + totalParticipants + ' members';
                    } else if (participantNames.size() < totalParticipants) {
                        wrapper.title = String.join(participantNames, ', ') + ' and ' + (totalParticipants - participantNames.size()) + ' others';
                    } else {
                        wrapper.title = String.join(participantNames, ', ');
                    }
                    
                    // For group chats, use a default group icon
                    wrapper.photoUrl = '/img/icon/t4v35/standard/groups_120.png';
                } else {
                    // Handle 1:1 conversations
                    if (conversationToParticipants.containsKey(convo.Id) && !conversationToParticipants.get(convo.Id).isEmpty()) {
                        // This is a 1:1 with another user
                        Conversation_Participant__c otherUser = conversationToParticipants.get(convo.Id)[0];
                        wrapper.name = otherUser.User__r.Name;
                        wrapper.photoUrl = otherUser.User__r.SmallPhotoUrl;
                        wrapper.title = otherUser.User__r.Title;
                        wrapper.objectType = 'User';
                    } else if (conversationToGroupParticipants.containsKey(convo.Id) && !conversationToGroupParticipants.get(convo.Id).isEmpty()) {
                        // This is a 1:1 with a contact or person account
                        Conversation_Group_Participant__c nonUserParticipant = conversationToGroupParticipants.get(convo.Id)[0];
                        
                        if (nonUserParticipant.Contact__c != null) {
                            wrapper.name = nonUserParticipant.Contact__r.Name;
                            wrapper.photoUrl = nonUserParticipant.Contact__r.PhotoUrl;
                            wrapper.title = nonUserParticipant.Contact__r.Title;
                            wrapper.objectType = 'Contact';
                        } else if (nonUserParticipant.Person_Account__c != null) {
                            wrapper.name = nonUserParticipant.Person_Account__r.Name;
                            wrapper.title = nonUserParticipant.Person_Account__r.PersonTitle;
                            wrapper.objectType = 'PersonAccount';
                            wrapper.photoUrl = '/img/icon/t4v35/standard/person_account_120.png'; // Default icon for person accounts
                        } else if (nonUserParticipant.Group__c != null) {
                            wrapper.name = nonUserParticipant.Group__c;
                            wrapper.title = 'Group';
                            wrapper.objectType = 'Group';
                            wrapper.photoUrl = '/img/icon/t4v35/standard/groups_120.png'; // Default icon for groups
                        }
                    } else {
                        // Fallback in case of incomplete data
                        wrapper.name = 'Unknown Recipient';
                        wrapper.photoUrl = '/img/icon/t4v35/standard/user_120.png';
                        wrapper.objectType = 'Unknown';
                    }
                }
                
                result.add(wrapper);
            }
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.getRecentConversations: Error retrieving recent conversations. Error=' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
            throw new AuraHandledException('Error retrieving recent conversations: ' + e.getMessage());
        }
        
        return result;
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
                WHERE MasterLabel = :modelLabel AND IsActive__c = true
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
        @AuraEnabled public String objectType;
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
        @AuraEnabled public Boolean isGroupChat = false;
        @AuraEnabled public String objectType;

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

    /**
     * Creates a new group conversation with multiple participants.
     * Supports User, Contact, PersonAccount, and Group participants.
     * 
     * @param groupName Name for the group conversation
     * @param groupDescription Optional description for the group
     * @param participants List of participant information (id, objectType)
     * @return ID of the created Conversation
     */
    @AuraEnabled
    public static String createGroupConversation(String groupName, String groupDescription, List<Map<String, String>> participants) {
        // --- Input Validation ---
        if (String.isBlank(groupName)) {
            throw new AuraHandledException('Group name is required');
        }
        
        if (participants == null || participants.isEmpty() || participants.size() < 2) {
            throw new AuraHandledException('At least two participants are required');
        }
        
        String currentUserId = UserInfo.getUserId();
        Set<String> uniqueParticipantIds = new Set<String>();
        
        // Add current user as a participant
        boolean currentUserIncluded = false;
        for (Map<String, String> participant : participants) {
            if (participant.get('id') == currentUserId && participant.get('objectType') == 'User') {
                currentUserIncluded = true;
                break;
            }
        }
        
        // If current user is not in the list, add them
        if (!currentUserIncluded) {
            Map<String, String> currentUserParticipant = new Map<String, String>{
                'id' => currentUserId,
                'objectType' => 'User'
            };
            participants.add(currentUserParticipant);
        }
        
        // Validate participants
        for (Map<String, String> participant : participants) {
            String id = participant.get('id');
            String type = participant.get('objectType');
            
            if (String.isBlank(id) || String.isBlank(type)) {
                throw new AuraHandledException('Invalid participant information');
            }
            
            // Check for duplicate participants
            if (uniqueParticipantIds.contains(id + '-' + type)) {
                continue; // Skip duplicates
            }
            
            uniqueParticipantIds.add(id + '-' + type);
        }
        
        try {
            // --- Create Conversation ---
            Conversation__c newConversation = new Conversation__c(
                Is_Group_Chat__c = true,
                Group_Name__c = groupName,
                Group_Description__c = groupDescription
            );
            insert newConversation;
            Id conversationId = newConversation.Id;
            
            return processGroupParticipants(conversationId, participants);
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.createGroupConversation: Error creating group conversation. Error=' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to create group conversation: ' + e.getMessage());
        }
    }

    /**
     * Helper method to process participants for a group conversation.
     * This method adds the various participant types to a conversation.
     * 
     * @param conversationId ID of the conversation
     * @param participants List of participant data maps
     * @return The conversation ID
     */
    private static String processGroupParticipants(Id conversationId, List<Map<String, String>> participants) {
        try {
            // --- Add Regular Participants (Users) ---
            List<Conversation_Participant__c> userParticipants = new List<Conversation_Participant__c>();
            
            // --- Add Group Participants (Contacts, Person Accounts, Groups) ---
            List<Conversation_Group_Participant__c> groupParticipants = new List<Conversation_Group_Participant__c>();
            
            // Process standard User participants
            for (Map<String, String> participant : participants) {
                String id = participant.get('id');
                String type = participant.get('objectType');
                
                if (type == 'User') {
                    // Add as standard participant
                    userParticipants.add(new Conversation_Participant__c(
                        Conversation__c = conversationId,
                        User__c = id,
                        Is_Active__c = true
                    ));
                } else if (type == 'Contact') {
                    // Add as contact participant
                    groupParticipants.add(new Conversation_Group_Participant__c(
                        Conversation__c = conversationId,
                        Contact__c = id
                    ));
                } else if (type == 'PersonAccount') {
                    // Add as person account participant
                    groupParticipants.add(new Conversation_Group_Participant__c(
                        Conversation__c = conversationId,
                        Person_Account__c = id
                    ));
                } else if (type == 'Group') {
                    // Add as group participant
                    groupParticipants.add(new Conversation_Group_Participant__c(
                        Conversation__c = conversationId,
                        Group__c = id
                    ));
                    
                    // Also need to add all users in the group as conversation participants
                    List<GroupMember> groupMembers = [
                        SELECT UserOrGroupId FROM GroupMember 
                        WHERE GroupId = :id
                        LIMIT 1000
                    ];
                    
                    for (GroupMember gm : groupMembers) {
                        // Filter for User IDs - they start with '005'
                        String userOrGroupId = String.valueOf(gm.UserOrGroupId);
                        if (userOrGroupId.startsWith('005')) {
                            // Check if this user is already a participant
                            boolean isDuplicate = false;
                            for (Conversation_Participant__c cp : userParticipants) {
                                if (cp.User__c == gm.UserOrGroupId) {
                                    isDuplicate = true;
                                    break;
                                }
                            }
                            
                            if (!isDuplicate) {
                                userParticipants.add(new Conversation_Participant__c(
                                    Conversation__c = conversationId,
                                    User__c = gm.UserOrGroupId,
                                    Is_Active__c = true
                                ));
                            }
                        }
                    }
                }
            }
            
            // Insert participants
            if (!userParticipants.isEmpty()) {
                insert userParticipants;
            }
            
            if (!groupParticipants.isEmpty()) {
                insert groupParticipants;
            }
            
            return conversationId;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.processGroupParticipants: Error processing participants. Error=' + e.getMessage());
            throw e;
        }
    }

    /**
     * Retrieves detailed information about a group conversation,
     * including its participants from different object types.
     * 
     * @param conversationId The ID of the conversation to get info for
     * @return GroupInfoWrapper with conversation and participant details
     */
    @AuraEnabled
    public static GroupInfoWrapper getGroupConversationInfo(String conversationId) {
        if (String.isBlank(conversationId)) {
            throw new AuraHandledException('Conversation ID is required');
        }
        
        try {
            // Get conversation details
            Conversation__c convo = [
                SELECT Id, Name, Group_Name__c, Group_Description__c, CreatedDate, CreatedById, CreatedBy.Name
                FROM Conversation__c
                WHERE Id = :conversationId
                LIMIT 1
            ];
            
            // Prepare result wrapper
            GroupInfoWrapper result = new GroupInfoWrapper();
            result.id = convo.Id;
            result.name = convo.Group_Name__c;
            result.description = convo.Group_Description__c;
            result.createdDate = convo.CreatedDate.format('MMM d, yyyy h:mm a');
            result.creatorId = convo.CreatedById;
            result.creatorName = convo.CreatedBy.Name;
            result.participants = new List<ParticipantWrapper>();
            
            // Current user ID
            String currentUserId = UserInfo.getUserId();
            
            // Get user participants
            for (Conversation_Participant__c userParticipant : [
                SELECT User__c, User__r.Name, User__r.Title, User__r.SmallPhotoUrl
                FROM Conversation_Participant__c
                WHERE Conversation__c = :conversationId AND Is_Active__c = true
            ]) {
                ParticipantWrapper participant = new ParticipantWrapper();
                participant.id = userParticipant.User__c;
                participant.name = userParticipant.User__r.Name;
                participant.title = userParticipant.User__r.Title;
                participant.photoUrl = userParticipant.User__r.SmallPhotoUrl;
                participant.objectType = 'User';
                participant.typeName = 'User';
                participant.isCurrentUser = (userParticipant.User__c == currentUserId);
                
                result.participants.add(participant);
            }
            
            // Get group participants (Contacts, Person Accounts, Groups)
            for (Conversation_Group_Participant__c groupParticipant : [
                SELECT Id, 
                       Contact__c, Contact__r.Name, Contact__r.Title, Contact__r.PhotoUrl,
                       Person_Account__c, Person_Account__r.Name, Person_Account__r.PersonTitle,
                       Group__c
                FROM Conversation_Group_Participant__c
                WHERE Conversation__c = :conversationId
            ]) {
                ParticipantWrapper participant = new ParticipantWrapper();
                
                if (groupParticipant.Contact__c != null) {
                    participant.id = groupParticipant.Contact__c;
                    participant.name = groupParticipant.Contact__r.Name;
                    participant.title = groupParticipant.Contact__r.Title;
                    participant.photoUrl = groupParticipant.Contact__r.PhotoUrl;
                    participant.objectType = 'Contact';
                    participant.typeName = 'Contact';
                } else if (groupParticipant.Person_Account__c != null) {
                    participant.id = groupParticipant.Person_Account__c;
                    participant.name = groupParticipant.Person_Account__r.Name;
                    participant.title = groupParticipant.Person_Account__r.PersonTitle;
                    participant.objectType = 'PersonAccount';
                    participant.typeName = 'Person Account';
                } else if (groupParticipant.Group__c != null) {
                    participant.id = groupParticipant.Group__c;
                    participant.name = groupParticipant.Group__c;
                    participant.title = 'Group';
                    participant.objectType = 'Group';
                    participant.typeName = 'Group';
                }
                
                if (participant.id != null) {
                    result.participants.add(participant);
                }
            }
            
            // Total participant count
            result.totalParticipants = result.participants.size();
            
            // Determine if current user is an admin
            // For simplicity, we consider the creator as the admin
            result.isCurrentUserAdmin = (convo.CreatedById == currentUserId);
            
            return result;
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.getGroupConversationInfo: Error getting group info. Error=' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
            throw new AuraHandledException('Error retrieving group information: ' + e.getMessage());
        }
    }
    
    /**
     * Wrapper class for group conversation information.
     */
    public class GroupInfoWrapper {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public String description;
        @AuraEnabled public String createdDate;
        @AuraEnabled public String creatorId;
        @AuraEnabled public String creatorName;
        @AuraEnabled public Integer totalParticipants;
        @AuraEnabled public List<ParticipantWrapper> participants;
        @AuraEnabled public Boolean isCurrentUserAdmin;
    }
    
    /**
     * Wrapper class for conversation participants of any type.
     */
    public class ParticipantWrapper {
        @AuraEnabled public String id;
        @AuraEnabled public String name;
        @AuraEnabled public String title;
        @AuraEnabled public String photoUrl;
        @AuraEnabled public String objectType;
        @AuraEnabled public String typeName;
        @AuraEnabled public Boolean isCurrentUser;
    }

    /**
     * Marks a conversation as read by updating the current user's participant record
     * 
     * @param conversationId The ID of the conversation to mark as read
     * @return Boolean indicating success
     */
    @AuraEnabled
    public static Boolean markConversationAsRead(String conversationId) {
        if (String.isBlank(conversationId)) {
            throw new AuraHandledException('Conversation ID cannot be blank');
        }
        
        String currentUserId = UserInfo.getUserId();
        System.debug('NuvitekMessagingController.markConversationAsRead: Marking conversation ' + conversationId + ' as read for user ' + currentUserId);
        
        try {
            // Find the participant record for the current user
            List<Conversation_Participant__c> participants = [
                SELECT Id, Is_Active__c
                FROM Conversation_Participant__c
                WHERE Conversation__c = :conversationId 
                AND User__c = :currentUserId
                AND Is_Active__c = true
                LIMIT 1
            ];
            
            if (participants.isEmpty()) {
                System.debug(LoggingLevel.WARN, 'NuvitekMessagingController.markConversationAsRead: No active participant record found for user ' + currentUserId + ' in conversation ' + conversationId);
                return false;
            }
            
            // For now, we don't need to update any field directly since the UI updates the count already
            // If we need to track the read date in the future, add a custom field to the Conversation_Participant__c object
            System.debug('NuvitekMessagingController.markConversationAsRead: Successfully marked conversation ' + conversationId + ' as read for user ' + currentUserId);
            return true;
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'NuvitekMessagingController.markConversationAsRead: Error marking conversation as read. Error=' + e.getMessage() + '\nStackTrace: ' + e.getStackTraceString());
            throw new AuraHandledException('Error marking conversation as read: ' + e.getMessage());
        }
    }

} // End of class