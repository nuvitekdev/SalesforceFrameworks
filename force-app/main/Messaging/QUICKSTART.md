# Messaging App Quick Start Guide

This quick start guide will help you get up and running with the Messaging App in minutes.

## Getting Started

### For Administrators

1. **Deploy the package** to your Salesforce org
   ```bash
   sfdx force:source:deploy -p force-app/main/Messaging
   ```

2. **Assign permissions** to users who need access to the messaging app
   ```bash
   sfdx force:user:permset:assign -n Messaging_User -u <username>
   ```

3. **Verify the tab** is visible in the navigation menu
   - If not, add the "Messaging App" tab to your navigation menu in Setup

4. **Configure Notifications**
   - To enable global notifications, add the messageNotifier component to your app's utility bar:
     1. Go to Setup → User Interface → App Manager
     2. Find and edit your Lightning App
     3. Select "Utility Items" in the App Builder
     4. Click "Add Utility Item" and select "Custom Component"
     5. Choose the "messageNotifier" component
     6. Save your changes

### For Users

1. **Access the app** by clicking on the "Messaging App" tab in your navigation menu

2. **Find and message people**:
   - Use the search box on the People tab to find users or contacts
   - Type at least 2 characters to start searching
   - Click on a person to start a conversation
   - Recent conversations appear below the search box

3. **Use chat channels (group chats)**:
   - Click the "Channels" tab to see available channels
   - Select a channel to join, or create a new one with the "+" button
   - All users with the Messaging_User permission set can see all channels

4. **Send messages**:
   - Type in the text box at the bottom of the conversation
   - Press Enter or click the Send button
   - Messages are delivered in real-time on desktop, and within 5 seconds on mobile

## Common Actions

### Finding Users or Contacts

1. Click the "People" tab (default)
2. Type the name in the search box
3. Results include both Salesforce users and contacts
4. Click on a result to start messaging

### Creating a Channel

1. Click the "Channels" tab
2. Click the "+" icon in the top right
3. Enter a channel name
4. Click "Create"
5. The channel is now available to all users

### Resuming a Conversation

1. Open the messaging app
2. Click the "People" tab
3. Find the person in your "Recent Conversations" list
4. Click on their name to resume the conversation

### Mobile Usage

1. Access the app from your mobile device
2. The interface adapts automatically to your screen size
3. Use the back button to navigate between conversations and contact/channel lists
4. Messages update automatically every 5 seconds

### Real-time Notifications

1. **In-app notifications**
   - Toast notifications appear automatically when you receive new messages
   - Click a notification to navigate directly to that conversation
   - Notifications work whether you're in the messaging app or elsewhere

2. **Notification settings**
   - Use the toggle in the sidebar of the messaging app to enable/disable notifications

## Troubleshooting Tips

- **Messages not appearing?** Try refreshing the page
- **Can't find a user?** Verify you're typing at least 2 characters in the search
- **Channel not visible?** Make sure you have the proper permissions assigned
- **Mobile issues?** Check your connection and try clearing your browser cache

For more details, refer to the complete [README.md](./README.md) documentation. 