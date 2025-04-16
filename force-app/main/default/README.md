# Salesforce Chat Framework

A lightning component framework for real-time chat functionality in Salesforce using Platform Events.

## Overview

This framework implements a real-time chat application using Salesforce Lightning Web Components (LWC) and Platform Events. It provides a seamless chat experience where multiple users can communicate in real-time within the Salesforce platform.

## Key Components

### Platform Events
- **LWC_Chat__e**: Platform event that handles message delivery between users
  - Fields:
    - ChatUserId__c
    - ChatUserName__c
    - Message__c
    - MessageType__c
    - ProfileImageType__c
    - ProfileImageValue__c

### Apex Classes
- **LwcPlatformEventChatController**: Controller for handling chat operations
  - Methods:
    - getUserData(): Retrieves the current user's information
    - publish(): Publishes chat messages as platform events

### Lightning Web Components
- **chatContent**: Displays the chat messages
- **chatComment**: Handles user inputs and message submission
- **empApiSample**: Implements the Emp API for subscribing to platform events

## Installation

1. Deploy the components to your Salesforce org
2. Assign the appropriate permission sets to users
3. Add the chat components to the desired Lightning pages

## Usage

The chat framework can be embedded in Experience Cloud sites, Lightning pages, or custom applications. Users with appropriate permissions can:
- Send and receive real-time messages
- View user information with profile images
- See typing indicators and message status

## Configuration

The framework is customizable through component attributes and custom metadata. Key configuration options include:
- Chat window height
- Message types
- User profile display options

## Security

The framework implements "with sharing" context to ensure proper record-level security. All operations respect the user's permissions and sharing settings.

## Development

When extending this framework, follow these guidelines:
- Maintain the existing component structure
- Use Platform Events for real-time operations
- Follow Salesforce best practices for Lightning Web Component development 