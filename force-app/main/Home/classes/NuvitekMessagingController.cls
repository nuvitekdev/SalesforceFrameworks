/**
 * NuvitekMessagingController
 * 
 * Apex controller for the Nuvitek Messaging LWC component that handles:
 * - Searching for recipients (Users, Contacts, Accounts, etc.)
 * - Sending messages
 * - Retrieving message history
 * - Managing unread message counts
 */
public with sharing class NuvitekMessagingController {
    
    /**
     * Search for potential message recipients across multiple object types
     * 
     * @param searchTerm Search string to find matching recipients
     * @param objectTypes List of API names of objects to search (User, Contact, Account, etc.)
     * @return List of recipient wrapper objects with details
     */
    @AuraEnabled
    public static List<RecipientWrapper> searchRecipients(String searchTerm, List<String> objectTypes) {
        if (String.isBlank(searchTerm) || searchTerm.length() < 2) {
            return new List<RecipientWrapper>();
        }
        
        // Sanitize search term for SOSL
        String sanitizedTerm = String.escapeSingleQuotes(searchTerm);
        sanitizedTerm = sanitizedTerm + '*'; // Add wildcard for partial matches
        
        List<RecipientWrapper> results = new List<RecipientWrapper>();
        
        try {
            // Build SOSL query string based on requested object types
            String soslQueryStr = 'FIND :sanitizedTerm IN NAME FIELDS RETURNING ';
            
            List<String> returningClauses = new List<String>();
            
            // Add RETURNING clauses for each object type
            for (String objType : objectTypes) {
                objType = objType.trim();
                
                if (objType.equalsIgnoreCase('User')) {
                    returningClauses.add('User(Id, Name, Title, SmallPhotoUrl, IsActive WHERE IsActive = true)');
                } else if (objType.equalsIgnoreCase('Contact')) {
                    returningClauses.add('Contact(Id, Name, Title, Email, AccountId, Account.Name, PhotoUrl)');
                } else if (objType.equalsIgnoreCase('Account')) {
                    returningClauses.add('Account(Id, Name, BillingCity, Phone)');
                } else if (objType.equalsIgnoreCase('Lead')) {
                    returningClauses.add('Lead(Id, Name, Title, Company, Email, Status)');
                }
            }
            
            // If no valid object types, return empty results
            if (returningClauses.isEmpty()) {
                return results;
            }
            
            // Finalize the SOSL query
            soslQueryStr += String.join(returningClauses, ', ');
            soslQueryStr += ' LIMIT 50';
            
            System.debug('Executing SOSL query: ' + soslQueryStr);
            
            // Execute the search
            List<List<SObject>> searchResults = Search.query(soslQueryStr);
            
            // Process the results for each object type
            for (Integer i = 0; i < objectTypes.size() && i < searchResults.size(); i++) {
                String objectType = objectTypes[i].trim();
                List<SObject> objResults = searchResults[i];
                
                for (SObject obj : objResults) {
                    RecipientWrapper wrapper = new RecipientWrapper();
                    wrapper.id = obj.Id;
                    wrapper.objectType = objectType;
                    
                    if (objectType.equalsIgnoreCase('User')) {
                        User u = (User)obj;
                        wrapper.name = u.Name;
                        wrapper.title = u.Title;
                        wrapper.photoUrl = u.SmallPhotoUrl;
                        wrapper.additionalInfo = 'Salesforce User';
                    } else if (objectType.equalsIgnoreCase('Contact')) {
                        Contact c = (Contact)obj;
                        wrapper.name = c.Name;
                        wrapper.title = c.Title;
                        wrapper.photoUrl = c.PhotoUrl;
                        wrapper.email = c.Email;
                        wrapper.accountId = c.AccountId;
                        wrapper.accountName = c.Account?.Name;
                        wrapper.additionalInfo = c.Email;
                    } else if (objectType.equalsIgnoreCase('Account')) {
                        Account a = (Account)obj;
                        wrapper.name = a.Name;
                        wrapper.title = a.BillingCity;
                        wrapper.additionalInfo = a.Phone;
                    } else if (objectType.equalsIgnoreCase('Lead')) {
                        Lead l = (Lead)obj;
                        wrapper.name = l.Name;
                        wrapper.title = l.Title;
                        wrapper.email = l.Email;
                        wrapper.additionalInfo = l.Company;
                    }
                    
                    results.add(wrapper);
                }
            }
            
        } catch (Exception e) {
            System.debug('Error in searchRecipients: ' + e.getMessage());
            throw new AuraHandledException('Error searching for recipients: ' + e.getMessage());
        }
        
        return results;
    }
    
    /**
     * Send a message to a recipient
     * 
     * @param recipientId Id of the recipient (User, Contact, Account, etc.)
     * @param recipientType Type of recipient object (User, Contact, Account, etc.)
     * @param content Message content
     * @return Map containing the messageId and userPhotoUrl
     */
    @AuraEnabled
    public static Map<String, String> sendMessage(String recipientId, String recipientType, String content) {
        try {
            // Get current user info
            User currentUser = [SELECT Id, Name, SmallPhotoUrl FROM User WHERE Id = :UserInfo.getUserId()];
            
            // Create a message record
            Nuvitek_Message__c message = new Nuvitek_Message__c(
                Sender__c = UserInfo.getUserId(),
                Content__c = content,
                Is_Read__c = true // Sender's messages are always read
            );
            
            // Set recipient fields based on type
            if (recipientType.equalsIgnoreCase('User')) {
                message.Recipient_User__c = recipientId;
            } else if (recipientType.equalsIgnoreCase('Contact')) {
                message.Recipient_Contact__c = recipientId;
            } else if (recipientType.equalsIgnoreCase('Account')) {
                message.Recipient_Account__c = recipientId;
            } else if (recipientType.equalsIgnoreCase('Lead')) {
                message.Recipient_Lead__c = recipientId;
            } else {
                throw new AuraHandledException('Unsupported recipient type: ' + recipientType);
            }
            
            insert message;
            
            // Return the message ID and the sender's photo URL
            return new Map<String, String>{
                'messageId' => message.Id,
                'userPhotoUrl' => currentUser.SmallPhotoUrl
            };
            
        } catch (Exception e) {
            System.debug('Error in sendMessage: ' + e.getMessage());
            throw new AuraHandledException('Error sending message: ' + e.getMessage());
        }
    }
    
    /**
     * Get message history for a conversation
     * 
     * @param recipientId Id of the recipient
     * @param recipientType Type of recipient object
     * @param offset Pagination offset
     * @param limitNum Maximum number of messages to return (will default to 50 if invalid)
     * @param newerThan Optional timestamp to only get messages newer than this
     * @return Map containing messages and pagination info
     */
    @AuraEnabled
    public static Map<String, Object> getMessages(String recipientId, String recipientType, Integer offset, Integer limitNum, String newerThan) {
        try {
            // Initialize variables first
            String currentUserId = UserInfo.getUserId();
            Integer offsetNum = offset != null ? offset : 0;
            // Ensure limitNum has a valid default value
            Integer validatedLimit = (limitNum != null && limitNum > 0) ? limitNum : 50; // Use a new variable for the validated limit
            
            // Query to find messages
            String queryStr = 'SELECT Id, Sender__c, Sender__r.Name, Content__c, CreatedDate, Is_Read__c FROM Nuvitek_Message__c WHERE ';
            
            // Add recipient condition based on type
            if (recipientType.equalsIgnoreCase('User')) {
                queryStr += '(Recipient_User__c = :recipientId AND Sender__c = :currentUserId) OR ' +
                          '(Recipient_User__c = :currentUserId AND Sender__c = :recipientId)';
            } else if (recipientType.equalsIgnoreCase('Contact')) {
                queryStr += '(Recipient_Contact__c = :recipientId AND Sender__c = :currentUserId)';
            } else if (recipientType.equalsIgnoreCase('Account')) {
                queryStr += '(Recipient_Account__c = :recipientId AND Sender__c = :currentUserId) OR ' +
                          '(Sender__c = :currentUserId AND Recipient_Account__c = :recipientId)';
            } else if (recipientType.equalsIgnoreCase('Lead')) {
                queryStr += '(Recipient_Lead__c = :recipientId AND Sender__c = :currentUserId) OR ' +
                          '(Sender__c = :currentUserId AND Recipient_Lead__c = :recipientId)';
            } else {
                throw new AuraHandledException('Unsupported recipient type: ' + recipientType);
            }
            
            // Add time filter if newerThan is provided
            if (String.isNotBlank(newerThan)) {
                Datetime newerThanDate = (Datetime)JSON.deserialize('"' + newerThan + '"', Datetime.class);
                queryStr += ' AND CreatedDate > :newerThanDate';
            }
            
            // Add sorting, offset and limit - Use the validatedLimit variable
            queryStr += ' ORDER BY CreatedDate ' + (String.isBlank(newerThan) ? 'DESC' : 'ASC');
            queryStr += ' LIMIT :validatedLimit OFFSET :offsetNum';
            
            // Execute the query
            List<Nuvitek_Message__c> messageRecords = Database.query(queryStr);
            
            // If fetching older messages, we want to return them in chronological order
            if (String.isBlank(newerThan) && messageRecords != null && !messageRecords.isEmpty()) {
                messageRecords = messageRecords.clone();
                // Use standard sorting method instead of lambda
                messageRecords.sort();
            }
            
            // Get current user info for photo URLs
            User currentUser = [SELECT SmallPhotoUrl FROM User WHERE Id = :currentUserId];
            
            // Convert to wrapper objects for the UI
            List<MessageWrapper> messages = new List<MessageWrapper>();
            if (messageRecords != null) {
                for (Nuvitek_Message__c msg : messageRecords) {
                    if (msg != null) {
                        MessageWrapper wrapper = new MessageWrapper();
                        wrapper.id = msg.Id;
                        wrapper.content = msg.Content__c;
                        wrapper.timestamp = msg.CreatedDate;
                        wrapper.isFromUser = msg.Sender__c == currentUserId;
                        wrapper.senderName = wrapper.isFromUser ? 'You' : (msg.Sender__r != null ? msg.Sender__r.Name : 'Unknown');
                        wrapper.senderPhotoUrl = wrapper.isFromUser ? currentUser.SmallPhotoUrl : '/img/icon/t4v35/standard/user_120.png';
                        wrapper.isRead = msg.Is_Read__c;
                        
                        messages.add(wrapper);
                    }
                }
            }
            
            // Return messages and pagination info - Use the validatedLimit variable for comparison
            return new Map<String, Object>{
                'messages' => messages,
                'hasMore' => (messages.size() >= validatedLimit)
            };
            
        } catch (Exception e) {
            System.debug('Error in getMessages: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Error retrieving messages: ' + e.getMessage());
        }
    }
    
    /**
     * Mark messages in a conversation as read
     * 
     * @param recipientId Id of the recipient
     * @param recipientType Type of recipient object
     */
    @AuraEnabled
    public static void markAsRead(String recipientId, String recipientType) {
        try {
            // Initialize variables first
            String currentUserId = UserInfo.getUserId();
            
            String queryStr = 'SELECT Id FROM Nuvitek_Message__c WHERE ';
            
            // Add conditions based on recipient type
            if (recipientType.equalsIgnoreCase('User')) {
                queryStr += 'Recipient_User__c = :currentUserId AND Sender__c = :recipientId';
            } else if (recipientType.equalsIgnoreCase('Contact')) {
                queryStr += 'Recipient_User__c = :currentUserId AND Recipient_Contact__c = :recipientId';
            } else if (recipientType.equalsIgnoreCase('Account')) {
                queryStr += 'Recipient_User__c = :currentUserId AND Recipient_Account__c = :recipientId';
            } else if (recipientType.equalsIgnoreCase('Lead')) {
                queryStr += 'Recipient_User__c = :currentUserId AND Recipient_Lead__c = :recipientId';
            } else {
                throw new AuraHandledException('Unsupported recipient type: ' + recipientType);
            }
            
            queryStr += ' AND Is_Read__c = false';
            
            List<Nuvitek_Message__c> unreadMessages = Database.query(queryStr);
            
            // Mark messages as read
            if (unreadMessages != null && !unreadMessages.isEmpty()) {
                for (Nuvitek_Message__c msg : unreadMessages) {
                    if (msg != null) {
                        msg.Is_Read__c = true;
                    }
                }
                
                update unreadMessages;
            }
            
        } catch (Exception e) {
            System.debug('Error in markAsRead: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Error marking messages as read: ' + e.getMessage());
        }
    }
    
    /**
     * Get count of unread messages for the current user
     * 
     * @return Map containing the count of unread messages
     */
    @AuraEnabled
    public static Map<String, Integer> getUnreadMessageCount() {
        try {
            String currentUserId = UserInfo.getUserId();
            
            // Query for unread messages where current user is recipient
            Integer count = [SELECT COUNT() FROM Nuvitek_Message__c 
                            WHERE Recipient_User__c = :currentUserId 
                            AND Is_Read__c = false];
            
            return new Map<String, Integer>{
                'count' => count != null ? count : 0
            };
            
        } catch (Exception e) {
            System.debug('Error in getUnreadMessageCount: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            // Return 0 instead of throwing an exception to avoid UI errors
            return new Map<String, Integer>{
                'count' => 0
            };
        }
    }
    
    /**
     * RecipientWrapper class for returning search results
     */
    public class RecipientWrapper {
        @AuraEnabled public String id;
        @AuraEnabled public String objectType;
        @AuraEnabled public String name;
        @AuraEnabled public String title;
        @AuraEnabled public String photoUrl;
        @AuraEnabled public String email;
        @AuraEnabled public String accountId;
        @AuraEnabled public String accountName;
        @AuraEnabled public String additionalInfo;
    }
    
    /**
     * MessageWrapper class for formatting message data for the UI
     */
    public class MessageWrapper {
        @AuraEnabled public String id;
        @AuraEnabled public String content;
        @AuraEnabled public Datetime timestamp;
        @AuraEnabled public Boolean isFromUser;
        @AuraEnabled public String senderName;
        @AuraEnabled public String senderPhotoUrl;
        @AuraEnabled public Boolean isRead;
    }
}