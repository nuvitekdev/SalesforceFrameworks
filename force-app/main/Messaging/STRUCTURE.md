# Messaging Solution Structure

This document provides an overview of the complete Salesforce Messaging solution file structure.

## Directory Structure

```
force-app/main/Messaging/
├── README.md                                 # Documentation and implementation guide
├── STRUCTURE.md                              # This file - structure overview
├── classes/                                  # Apex classes
│   ├── MessageController.cls                 # Main controller for messaging functionality
│   └── MessageController.cls-meta.xml        # Metadata for MessageController
├── lwc/                                      # Lightning Web Components
│   └── messageApp/                           # Main messaging component
│       ├── messageApp.css                    # Styling for messaging UI
│       ├── messageApp.html                   # HTML template for messaging UI
│       ├── messageApp.js                     # JavaScript controller for messaging
│       └── messageApp.js-meta.xml            # Metadata for messageApp LWC
├── messaging/                                # Lightning Message Service
│   └── MessageChannel.messageChannel-meta.xml # Message channel for messaging events
├── objects/                                  # Custom objects
│   ├── Message__c/                           # Message custom object
│   │   ├── Message__c.object-meta.xml        # Metadata for Message__c
│   │   └── fields/                           # Message__c fields
│   │       ├── Channel__c.field-meta.xml     # Channel field - for group chats
│   │       ├── Content__c.field-meta.xml     # Content field - message text
│   │       ├── IsRead__c.field-meta.xml      # IsRead field - message read status
│   │       ├── Recipient__c.field-meta.xml   # Recipient field - message recipient
│   │       ├── Sender__c.field-meta.xml      # Sender field - message sender
│   │       └── Timestamp__c.field-meta.xml   # Timestamp field - when message was sent
│   └── MessageEvent__e/                      # Message platform event
│       ├── MessageEvent__e.object-meta.xml   # Metadata for MessageEvent__e
│       └── fields/                           # MessageEvent__e fields
│           ├── Channel__c.field-meta.xml     # Channel field - for group chats
│           ├── Content__c.field-meta.xml     # Content field - message text
│           ├── RecipientId__c.field-meta.xml # RecipientId field - message recipient
│           ├── SenderId__c.field-meta.xml    # SenderId field - message sender
│           └── Timestamp__c.field-meta.xml   # Timestamp field - when message was sent
├── permissionsets/                           # Permission sets
│   └── Messaging_User.permissionset-meta.xml # Permissions for messaging users
├── tabs/                                     # Custom tabs
│   ├── Message__c.tab-meta.xml               # Tab for Message__c object
│   └── MessageApp.tab-meta.xml               # Tab for MessageApp LWC
└── triggers/                                 # Apex triggers
    ├── MessageTrigger.trigger                # Trigger for Message__c
    └── MessageTrigger.trigger-meta.xml       # Metadata for MessageTrigger
```

## Component Overview

1. **Custom Objects**:
   - `Message__c`: Stores message records persistently
   - `MessageEvent__e`: Platform event for real-time message notification

2. **Apex Classes**:
   - `MessageController`: Handles sending and retrieving messages

3. **Apex Triggers**:
   - `MessageTrigger`: Processes message updates (read status, etc.)

4. **LWC Components**:
   - `messageApp`: Main UI component for messaging

5. **Custom Tabs**:
   - `Message__c`: Tab for viewing message records
   - `MessageApp`: Tab for accessing the messaging application

6. **Permission Sets**:
   - `Messaging_User`: Provides necessary permissions for messaging users

7. **Documentation**:
   - `README.md`: Implementation and user guide
   - `STRUCTURE.md`: File structure overview

## Deployment Instructions

See the `README.md` file for detailed deployment and implementation instructions. 