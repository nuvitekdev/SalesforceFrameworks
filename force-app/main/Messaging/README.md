# Salesforce Cross-Platform Messaging Solution

This package provides a complete messaging solution that works across desktop and mobile Salesforce interfaces using Platform Events.

## Table of Contents
1. [Architecture Overview](#architecture-overview)
2. [Key Features](#key-features)
3. [Implementation Guide](#implementation-guide)
4. [User Guide](#user-guide)
5. [Admin Guide](#admin-guide)
6. [Extending the Solution](#extending-the-solution)
7. [Troubleshooting](#troubleshooting)

## Architecture Overview

The solution consists of the following components:

1. **Message__c Custom Object**: Stores all message records persistently
2. **MessageEvent__e Platform Event**: Enables real-time message notifications
3. **MessageApp Lightning Web Component**: Main UI component with chat functionality
4. **RecipientSearch LWC**: Sub-component for searching users and contacts
5. **ChannelManager LWC**: Sub-component for creating and managing channels
6. **MessageController Apex Class**: Handles all server-side logic
7. **MessageTrigger**: Processes message updates like read status changes

### Technical Approach

- **Real-time Messaging**: Uses Platform Events on desktop with EMP API
- **Mobile Support**: Falls back to polling strategy on mobile where EMP API isn't fully supported
- **Persistent Storage**: All messages stored in Message__c custom object
- **Recipient Discovery**: Search for both users and contacts directly in the UI
- **Channel Management**: Create and join group chats with intuitive UI

## Key Features

### Intuitive User Experience
- No configuration required - search and connect with anyone
- Modern, responsive design that works on desktop and mobile
- Apple Human Interface Guidelines-inspired clean UI

### Search & Discovery
- Search for any user or contact in your org
- View recent conversation history
- Create and join group chat channels

### Messaging
- Real-time message delivery
- Read receipts
- Message history persistence
- Group messaging through channels

### Security & Privacy
- Complete with permission sets
- Records secured via Salesforce sharing model
- History tracking enabled

## Implementation Guide

### Step 1: Deploy the Solution

1. Deploy this package to your Salesforce org using SFDX:
   ```bash
   sfdx force:source:deploy -p force-app/main/Messaging
   ```

2. Alternatively, you can deploy using the Metadata API or change sets.

### Step 2: Assign Permissions

1. Assign the permission set to users:
   ```bash
   sfdx force:user:permset:assign -n Messaging_User -u <username>
   ```

### Step 3: Access the Messaging App

1. Users can access the messaging app through:
   - The "Messaging App" tab in the navigation menu
   - Lightning App Builder pages where you've added the component
   - Experience Cloud pages where you've added the component

## User Guide

### Starting the App

1. Click on the "Messaging App" tab in the navigation bar
2. The app opens with a sidebar on the left and a welcome screen on the right
3. The sidebar has two tabs: "People" and "Channels"

### Finding and Messaging People

#### Search for Recipients
1. On the "People" tab (default), use the search box to find users or contacts
2. Type at least 2 characters to start searching
3. Results show both Salesforce users and contacts with their details
4. Click on a result to start a conversation

#### Recent Conversations
1. Below the search box, you'll see a list of your recent conversations
2. Click on any recipient to resume your conversation
3. Recent conversations persist even when you leave the app

### Using Channels (Group Chats)

#### Join Existing Channels
1. Click the "Channels" tab in the sidebar
2. View a list of all available channels
3. Click on any channel to join the conversation

#### Create a New Channel
1. Click the "+" icon in the Channels tab header
2. Enter a name for your new channel
3. Click "Create" to create the channel
4. The channel becomes immediately available to all users

### Sending and Receiving Messages

1. Type your message in the text area at the bottom
2. Press Enter or click the Send button to send
3. Your messages appear in blue on the right
4. Messages from others appear in gray on the left with the sender's name
5. Messages are automatically marked as read when displayed

### Mobile Experience
1. On mobile devices, the interface adapts automatically
2. The sidebar appears at the top with conversations below
3. A back button allows navigation between the list and conversations
4. Messages update every 5 seconds on mobile devices

## Admin Guide

### Monitoring Usage
1. Monitor platform event usage in Setup > Platform Tools > Events > Platform Events
2. Monitor data storage usage for Message__c records
3. Use the Message__c tab to view and manage message records

### Data Management
1. Set up a message retention policy using the sample batch class:

```apex
public class MessageCleanupBatch implements Database.Batchable<sObject> {
    public Database.QueryLocator start(Database.BatchableContext bc) {
        // Get messages older than 90 days
        return Database.getQueryLocator([
            SELECT Id FROM Message__c 
            WHERE Timestamp__c < :DateTime.now().addDays(-90)
        ]);
    }
    
    public void execute(Database.BatchableContext bc, List<Message__c> scope) {
        delete scope;
    }
    
    public void finish(Database.BatchableContext bc) { }
}

// Schedule this batch job to run periodically:
System.scheduleBatch(new MessageCleanupBatch(), 'Message Cleanup', 200, 1);
```

### Performance Optimization
1. The component limits queries to 50 messages at a time
2. Consider adding custom indexes for the following fields:
   - Message__c.Channel__c
   - Message__c.Timestamp__c
   - Message__c.Sender__c
   - Message__c.Recipient__c

### Security
1. Review the Messaging_User permission set for appropriate access
2. Ensure proper field-level security for all Message__c fields
3. Consider implementing a trigger to enforce any necessary security rules

## Extending the Solution

### Adding File Attachments
1. Create a new custom object MessageAttachment__c with fields:
   - Message__c (Master-Detail to Message__c)
   - File__c (ContentDocument lookup)
   
2. Add a file upload component to the UI:
```html
<!-- Add to messageApp.html in the compose area -->
<lightning-file-upload
    label="Attach Files"
    name="fileUploader"
    accept={acceptedFormats}
    record-id={recordId}
    onuploadfinished={handleUploadFinished}>
</lightning-file-upload>
```

3. Process the uploaded files in your controller

### Adding Typing Indicators
1. Create a new platform event TypingIndicator__e with fields:
   - UserId__c
   - ChannelId__c
   - RecipientId__c
   
2. Publish this event when a user is typing:
```javascript
// Add to handleInputChange in messageApp.js
if (!this.isTyping) {
    this.isTyping = true;
    this.publishTypingEvent();
    
    // Reset typing indicator after delay
    this.typingTimeout = setTimeout(() => {
        this.isTyping = false;
    }, 3000);
}
```

3. Subscribe to this event to show typing indicators

### Enhancing Channel Features
1. Add channel membership tracking
2. Implement private channels with invitations
3. Add channel administration features

## Troubleshooting

### Common Issues

#### Messages Not Appearing Real-Time
1. Check that platform events are properly configured
2. Verify that the user has permissions to subscribe to platform events
3. Check browser console for errors in subscription
4. Try refreshing the page or clearing browser cache

#### Messages Not Saving
1. Verify that the user has Create/Read permissions on the Message__c object
2. Check validation rules that might be blocking record creation
3. Check Apex logs for any errors during message sending
4. Ensure the user has access to the recipient records

#### Search Not Returning Results
1. Verify the user has access to User and Contact records
2. Check for any filters that might be limiting search results
3. Ensure search terms are at least 2 characters long
4. Check Apex logs for any search errors

#### Channels Not Appearing
1. Verify the user has access to Message__c records
2. Check for any sharing rules that might be limiting channel visibility
3. Try creating a new channel to refresh the channel list
4. Check Apex logs for any errors in the getChannels method

### Support

For additional support, contact your Salesforce administrator or the package maintainer. 