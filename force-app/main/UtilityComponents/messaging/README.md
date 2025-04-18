# Nuvitek Messaging Utility Component

A modern, feature-rich messaging system for Salesforce that enables real-time communication between users and contacts. This utility provides a complete messaging solution with conversation management, real-time updates, and advanced features like AI message summarization.

## Features

- **Real-Time Messaging:** Instant message delivery using Salesforce Platform Events
- **User & Contact Communication:** Message any Salesforce user or contact
- **Group Conversations:** Create and manage group chats with multiple participants
- **Conversation Management:** Archive, restore, and delete conversations
- **Message History:** Full conversation history with timestamp display
- **AI Summarization:** Generate AI-powered summaries of long conversations
- **Responsive Design:** Adapts to desktop, tablet, and mobile screens
- **Custom Theming:** Fully customizable colors to match your Salesforce theme
- **Utility Bar Integration:** Available as a utility bar item for global access
- **Experience Cloud Support:** Can be used in communities for external communication

## Components

The Messaging utility consists of multiple integrated components:

1. **LWC Components:**
   - `nuvitekMessaging`: Main messaging interface component
   - `chatComment`: Reusable comment component used within conversations

2. **Apex Controller:**
   - `NuvitekMessagingController`: Handles all server-side operations

3. **Custom Objects:**
   - `Conversation__c`: Stores conversation metadata and participants
   - `Message__c`: Stores individual message content and metadata
   - `Nuvitek_Message__e`: Platform event for real-time message delivery

## Installation

Deploy all components to your Salesforce org:

1. LWC Components:
   - `force-app/main/UtilityComponents/messaging/lwc/nuvitekMessaging`
   - `force-app/main/UtilityComponents/messaging/lwc/chatComment`

2. Apex Controller:
   - `force-app/main/UtilityComponents/messaging/classes/NuvitekMessagingController.cls`

3. Custom Objects:
   - `force-app/main/UtilityComponents/messaging/objects/Conversation__c`
   - `force-app/main/UtilityComponents/messaging/objects/Message__c`
   - `force-app/main/UtilityComponents/messaging/objects/Nuvitek_Message__e`

4. Permission Sets:
   - `force-app/main/UtilityComponents/messaging/permissionsets`

## Usage

The Messaging component can be added to various Salesforce contexts:

### Record Pages

Add to any Salesforce record page to enable contextual conversations:

1. Edit the record page in Lightning App Builder
2. Drag the "Nuvitek Messaging" component to the desired location
3. Configure appearance settings (colors, height)
4. Save and activate the page

### App Pages

Add to Lightning App pages for dedicated messaging workspace:

1. Create a new Lightning App Page in Setup
2. Add the "Nuvitek Messaging" component
3. Configure the component height and colors
4. Save and assign to apps and profiles

### Home Page

Add to the Lightning Home Page for quick access:

1. Edit the Home page in Lightning App Builder
2. Add the "Nuvitek Messaging" component
3. Configure appearance settings
4. Save and activate

### Utility Bar

Add as a global utility available throughout Salesforce:

1. Go to the App Manager in Setup
2. Edit the app's Utility Items
3. Add "Nuvitek Messaging" to the utility bar
4. Configure utility bar settings
5. Save changes

### Experience Cloud (Communities)

Add to Experience Cloud pages for external user messaging:

1. Edit the Experience Builder page
2. Add the "Nuvitek Messaging" component
3. Configure appearance settings to match your community theme
4. Save the page

## Configuration Options

### Layout Settings

| Property | Description | Default |
|----------|-------------|---------|
| componentHeight | Height of the component in pixels (0 for auto) | 600 |
| disableInitialLoading | Disable initial loading spinner | false |

### Theme Settings

| Property | Description | Default |
|----------|-------------|---------|
| primaryColor | Main color for headers, buttons, and UI elements | #22BDC1 |
| accentColor | Secondary color for highlights and selected elements | #D5DF23 |
| messageOutgoingColor | Background color for outgoing message bubbles | #22BDC1 |
| messageIncomingColor | Background color for incoming message bubbles | #D5DF23 |

## Features In Detail

### Starting Conversations

1. Click the "New Message" button
2. Search for users or contacts
3. Select recipients (individual or multiple for group chat)
4. For group conversations, provide a group name
5. Start the conversation

### Managing Conversations

- **Archive:** Hide conversations without deleting them
- **Restore:** Bring archived conversations back to active view
- **Delete:** Permanently remove conversations
- **Selection Mode:** Select multiple conversations for bulk actions

### AI Summarization

Generate AI-powered summaries of long conversations:
1. Open a conversation
2. Click the "AI Summary" button
3. Wait for the summary to be generated
4. Review the key points of the conversation

## User Permissions

Users need the following permissions to use the messaging component:

- Read/Create/Edit access to Conversation__c and Message__c objects
- Access to the NuvitekMessagingController Apex class
- Subscribe permission for the Nuvitek_Message__e platform event

The included permission set (`Nuvitek_Messaging_User`) provides all necessary permissions.

## Use Cases

- **Internal Team Collaboration:** Quick communication between team members
- **Customer Support:** Direct messaging with customers via Experience Cloud
- **Sales Coordination:** Coordinate deal details with team members
- **Project Management:** Team discussions around specific records
- **HR Communications:** Private discussions with employees
- **Cross-Departmental Collaboration:** Break down silos with direct communication

## Technical Considerations

- Uses Platform Events for real-time message delivery
- Leverages localStorage for client-side conversation preferences
- Dynamically adapts to container size
- Automatically generates contrasting text colors based on background colors
- Supports archiving via client-side persistence 