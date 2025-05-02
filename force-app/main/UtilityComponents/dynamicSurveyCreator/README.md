# Dynamic Survey Creator

A custom Salesforce survey solution built using Lightning Web Components and Apex controllers. This package provides a cost-effective alternative to Salesforce's premium Survey feature, allowing you to create, distribute, and collect responses to custom surveys.

## Overview

The Dynamic Survey Creator solution consists of two primary components:

1. **surveyCreator (Internal)**: An LWC for Salesforce users to create surveys, add questions, and manage recipients.
2. **surveyResponder (Public)**: An LWC designed for external users to view and respond to surveys through a Salesforce Site or Experience Cloud page.

## Data Model

The solution uses five custom objects:

1. **Survey__c**: Stores survey details like name, description, welcome message, and thank you message.
2. **Question__c**: Stores individual questions related to a survey, including question text, type, and display order.
3. **Answer_Option__c**: Stores answer options for Radio and Checkbox type questions.
4. **Survey_Response__c**: Tracks individual response sessions from recipients.
5. **Question_Response__c**: Stores answers to specific questions within a response.

### Relationships

- Survey__c (1) → Question__c (Many)
- Question__c (1) → Answer_Option__c (Many)
- Survey__c (1) → Survey_Response__c (Many)
- Survey_Response__c (1) → Question_Response__c (Many)
- Question__c (1) → Question_Response__c (Many)

## Installation

### Prerequisites

- Salesforce org with My Domain enabled
- Experience Cloud or Salesforce Sites configured (for public responses)
- "Lightning Web Security for DOM API Access" critical update enabled

### Setup Steps

1. **Deploy the components to your org**:
   ```
   sf project deploy start --source-dir force-app/main/UtilityComponents/dynamicSurveyCreator
   ```

2. **Create custom objects**:
   - Create the five custom objects as described in the data model
   - Ensure all relationships are properly configured

3. **Configure public access**:
   - Create a Salesforce Site or Experience Cloud page
   - Add the surveyResponder component to a public page
   - Configure guest user profile permissions for the custom objects

4. **Add the surveyCreator component to internal pages**:
   - Add the surveyCreator LWC to a Lightning page, app, or tab
   - Set the publicSiteUrl property to your Salesforce Site/Experience Cloud URL

## Using the Survey Creator

The Survey Creator follows a 5-step process:

### Step 1: Survey Details

1. Enter the basic information for your survey:
   - Survey Name (required)
   - Description
   - Welcome Message
   - Thank You Message

### Step 2: Build Questions

1. Add questions using the "Add Question" button
2. Configure each question:
   - Question Text
   - Question Type (Text, Textarea, Radio, Checkbox, Rating)
   - Required/Optional toggle
3. For Radio and Checkbox questions, add answer options

### Step 3: Add Recipients

1. Enter recipient email addresses
   - Separate multiple emails with commas or new lines
   - Each email must be valid

### Step 4: Review and Send

1. Review survey details and recipient list
2. Confirm the public site URL is correctly configured
3. Click "Send Survey" to generate unique links and send emails

### Step 5: Confirmation

1. View confirmation message with count of sent invitations
2. Option to create another survey

## Email Invitations

The system sends personalized emails to recipients with:
- Survey name and description
- A unique link that pre-populates the recipient's information
- The link expires when completed or after a set period

## Response Collection

When recipients complete the survey:
1. Their responses are recorded in Survey_Response__c and Question_Response__c objects
2. They see the custom thank you message
3. The status of their response is updated to "Completed"

## Viewing Results

Survey responses can be viewed:
1. Through standard Salesforce reports and dashboards
2. By creating custom list views on the Survey_Response__c object
3. By querying the data through SOQL or creating custom Visualforce/Lightning pages

## Customization

The component allows for customization through:
- Primary color and accent color properties
- Custom welcome and thank you messages
- Custom email templates (by modifying the Apex controller)

## Limitations

- No branching logic or conditional questions
- No file upload questions
- Limited question types
- No multimedia support (images, videos)

## Troubleshooting

Common issues:
1. **Emails not sending**: Check that your org has email deliverability enabled
2. **Public access errors**: Verify guest user permissions on all custom objects
3. **Data saving errors**: Check field-level security settings
4. **CSS or styling issues**: Test in different browsers

## Contributing

Feel free to extend this solution with additional features:
- Question branching
- Additional question types
- Advanced reporting
- Custom styling

## License

This project is available under the MIT License. 