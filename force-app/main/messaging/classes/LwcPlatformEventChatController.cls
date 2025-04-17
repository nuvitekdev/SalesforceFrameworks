public with sharing class LwcPlatformEventChatController {
  @AuraEnabled(cacheable=true)
  public static User getUserData() {
    return [
      SELECT Id, Name, SmallPhotoUrl
      FROM User
      WHERE Id = :UserInfo.getUserId()
    ];
  }

  @AuraEnabled(cacheable=true)
  public static List<UserContactWrapper> searchUsers(String searchTerm) {
    List<UserContactWrapper> results = new List<UserContactWrapper>();
    
    String searchKey = '%' + searchTerm + '%';
    
    // Search for Users
    for(User usr : [
      SELECT Id, Name, SmallPhotoUrl, Email
      FROM User
      WHERE Name LIKE :searchKey OR Email LIKE :searchKey
      LIMIT 10
    ]) {
      results.add(new UserContactWrapper(
        usr.Id,
        usr.Name,
        usr.SmallPhotoUrl,
        usr.Email,
        'User'
      ));
    }
    
    // Search for Contacts
    for(Contact cnt : [
      SELECT Id, Name, Email, PhotoUrl
      FROM Contact
      WHERE Name LIKE :searchKey OR Email LIKE :searchKey
      LIMIT 10
    ]) {
      results.add(new UserContactWrapper(
        cnt.Id,
        cnt.Name,
        cnt.PhotoUrl,
        cnt.Email,
        'Contact'
      ));
    }
    
    return results;
  }
  
  @AuraEnabled
  public static String createConversation(String name, List<String> memberIds) {
    // Ensure current user is included in members
    String currentUserId = UserInfo.getUserId();
    if (!memberIds.contains(currentUserId)) {
      memberIds.add(currentUserId);
    }
    
    // Create conversation record
    Conversation__c conv = new Conversation__c(
      Name = name,
      Members__c = String.join(memberIds, ';')
    );
    insert conv;
    
    // Create junction records for each member
    List<ConversationMember__c> members = new List<ConversationMember__c>();
    
    for (String memberId : memberIds) {
      if (memberId.startsWith('005')) { // User ID prefix
        members.add(new ConversationMember__c(
          Conversation__c = conv.Id,
          User__c = memberId
        ));
      } else if (memberId.startsWith('003')) { // Contact ID prefix
        members.add(new ConversationMember__c(
          Conversation__c = conv.Id,
          Contact__c = memberId
        ));
      }
    }
    
    if (!members.isEmpty()) {
      insert members;
    }
    
    return conv.Id;
  }
  
  @AuraEnabled(cacheable=true)
  public static List<ConversationWrapper> getUserConversations() {
    String currentUserId = UserInfo.getUserId();
    List<ConversationWrapper> results = new List<ConversationWrapper>();
    
    // Find conversations where the current user is a member
    Set<Id> conversationIds = new Set<Id>();
    for (ConversationMember__c member : [
      SELECT Conversation__c
      FROM ConversationMember__c
      WHERE User__c = :currentUserId
    ]) {
      conversationIds.add(member.Conversation__c);
    }
    
    // Get conversation details
    for (Conversation__c conv : [
      SELECT Id, Name, Members__c
      FROM Conversation__c
      WHERE Id IN :conversationIds
    ]) {
      results.add(new ConversationWrapper(
        conv.Id,
        conv.Name,
        conv.Members__c
      ));
    }
    
    return results;
  }

  @AuraEnabled
  public static void publish(
    String userId,
    String userName,
    String messageType,
    String message,
    String profileType,
    String profileValue,
    String conversationId,
    String recipientIds
  ) {
    List<LWC_Chat__e> events = new List<LWC_Chat__e>();
    events.add(
      new LWC_Chat__e(
        MessageType__c = messageType,
        Message__c = message,
        ChatUserId__c = userId,
        ChatUserName__c = userName,
        ProfileImageValue__c = profileValue,
        ProfileImageType__c = profileType,
        ConversationId__c = conversationId,
        RecipientIds__c = recipientIds
      )
    );

    // Call method to publish events
    List<Database.SaveResult> results = EventBus.publish(events);

    // Inspect publishing result for each event
    for (Database.SaveResult sr : results) {
      if (sr.isSuccess()) {
        // System.debug('Successfully published event.');
      } else {
        for (Database.Error err : sr.getErrors()) {
          System.debug(
            'Error returned: ' +
            err.getStatusCode() +
            ' - ' +
            err.getMessage()
          );
        }
      }
    }
  }
  
  public class UserContactWrapper {
    @AuraEnabled public String id;
    @AuraEnabled public String name;
    @AuraEnabled public String photoUrl;
    @AuraEnabled public String email;
    @AuraEnabled public String type;
    
    public UserContactWrapper(String id, String name, String photoUrl, String email, String type) {
      this.id = id;
      this.name = name;
      this.photoUrl = photoUrl;
      this.email = email;
      this.type = type;
    }
  }
  
  public class ConversationWrapper {
    @AuraEnabled public String id;
    @AuraEnabled public String name;
    @AuraEnabled public String members;
    
    public ConversationWrapper(String id, String name, String members) {
      this.id = id;
      this.name = name;
      this.members = members;
    }
  }
}
