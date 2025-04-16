# Message Notification System

This document explains the toast notification system implemented for real-time messaging alerts.

## Architecture

The notification system uses a Custom Platform Event approach with the following components:

1. **New_Message_Notification__e Platform Event**: Dedicated event type specifically for new message notifications
2. **MessageTrigger**: Publishes platform events when new messages are inserted
3. **messageApp LWC**: Main messaging component that includes built-in notification functionality

## How It Works

### 1. Platform Event Publishing
When a new message is created:
- The `MessageTrigger` fires on `after insert`
- It creates a `New_Message_Notification__e` platform event with:
  - RecipientId__c: The ID of the message recipient
  - SenderName__c: The name of the message sender
  - MessageSnippet__c: A snippet of the message content (truncated to 100 chars)
  - ChannelName__c: If it's a channel message, the channel name

### 2. Event Subscription
- The `messageApp` LWC uses the `lightning/empApi` module to subscribe to the platform event
- It receives notifications in real-time when events are published
- The subscription is maintained regardless of whether the user is in an active conversation

### 3. Toast Notifications
- When an event is received, the component checks if the notification is for the current user
- For direct messages: Displays a toast notification if RecipientId__c matches current user ID
- For channel messages: Displays a toast notification for all users (could be filtered by subscription)
- Notifications are suppressed when the user is already actively viewing the conversation that received a message

## Smart Notification Behavior
- Shows notifications even when the user is not actively in a conversation
- Suppresses notifications when the user is already viewing that conversation and the window is in focus
- Automatically refreshes the message list if a notification comes in for the current conversation

## Advantages

- **Efficiency**: Only events specifically for notifications are published and processed
- **Control**: Fine-grained control over when notifications are sent and what data is included
- **Customization**: Easy to customize notification content and appearance
- **Integrated Experience**: Notifications are part of the main messaging component, which simplifies deployment and provides a cohesive user experience

## Installation

1. Deploy the platform event definition
2. Deploy the updated MessageTrigger
3. Deploy the updated messageApp LWC component

## Usage

The notification functionality is automatically enabled when the messageApp component is used - no additional components needed in the utility bar. Toast notifications will appear for any new messages received, except when the user is already viewing that conversation. 