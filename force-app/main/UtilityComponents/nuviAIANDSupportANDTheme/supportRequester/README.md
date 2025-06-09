# Support Requester Component

![Support Requester Banner](https://raw.githubusercontent.com/YOUR-ORG/YOUR-REPO/main/docs/images/support-requester-banner.png)

## What is the Support Requester?

The Support Requester is a versatile Lightning Web Component (LWC) that simplifies and streamlines the process of creating support requests within Salesforce. It provides a guided, user-friendly interface for submitting issues, questions, and assistance requests, automatically capturing contextual information and routing requests to the appropriate teams. This component bridges the gap between users and support teams, ensuring efficient communication and issue resolution.

### Key Features

- **Guided Request Process**: Step-by-step wizard interface for creating support requests.
- **Dynamic Form Generation**: Customizable fields based on request type and category.
- **Contextual Awareness**: Automatically captures user, record, and environment information.
- **File Attachments**: Support for screenshots, documents, and other relevant files.
- **Priority Assignment**: Intelligent suggestion of priority levels based on request details.
- **Smart Routing**: Automatic assignment to the appropriate support queue or team.
- **Duplicate Detection**: Identifies similar existing requests to prevent duplicates.
- **Status Tracking**: View status updates of submitted requests.
- **Theme Integration**: Automatically adopts your Salesforce theme for a seamless visual experience.
- **Modern UI/UX**: Clean, Apple-inspired design with responsive layout for all devices.
- **Flow Integration**: Use in Flow screens with output variables for the created request.

## Why Use the Support Requester?

Effective support processes are critical for organizational efficiency, and the Support Requester offers several benefits:

1. **Standardization**: Ensures all required information is collected for every support request.
2. **Efficiency**: Reduces back-and-forth communication to gather missing details.
3. **User Experience**: Provides a simple, intuitive interface for requesting help.
4. **Context Preservation**: Automatically captures relevant contextual information.
5. **Routing Accuracy**: Ensures requests reach the right team or individual.
6. **Time Savings**: Reduces the time spent creating and processing support tickets.
7. **Analytics Enablement**: Standardized requests enable better reporting and insights.
8. **Satisfaction**: Improves both requester and support team experience.

## Who Should Use This Component?

The Support Requester is ideal for:

- **End Users**: Anyone who needs to request technical or business support.
- **Salesforce Administrators**: Managing internal Salesforce support requests.
- **IT Support Teams**: Receiving and processing technical assistance requests.
- **Business Operations**: Handling process or business function support needs.
- **HR Departments**: Processing employee assistance requests.
- **Training Teams**: Managing learning and development support.
- **Change Management Groups**: Supporting users through organizational changes.
- **System Implementers**: Providing support during and after system implementations.

## When to Use the Support Requester

Implement the Support Requester in these scenarios:

- When standardizing the process for requesting internal support
- During implementation of new systems or processes requiring user assistance
- For creating a self-service support request channel
- When support teams struggle with incomplete information in requests
- To replace email-based or informal support request processes
- For improving support request routing and assignment
- When analytics about support requests are needed for improvement
- To provide a consistent support experience across the organization

## Where to Deploy the Support Requester

The Support Requester component can be added to:

- **Home Pages**: Add to user home pages for easy access to support.
- **App Pages**: Include in Lightning app pages for contextual support within applications.
- **Utility Bars**: Make available as a utility item for assistance across the organization.
- **Communities**: Add to Experience Cloud pages for partner or customer support requests.
- **Record Pages**: Add to record pages where contextual support may be needed.
- **Navigation Menus**: Create a dedicated tab for support requests.
- **Help Sections**: Include in custom help or resource areas.
- **Mobile App**: Deploy for on-the-go support request capabilities.

## How to Configure and Use

### Installation

1. Deploy the component using Salesforce CLI or directly within your Salesforce org.
2. Configure support request object and related metadata.
3. Ensure all dependencies (apex classes, LWC, custom objects) are deployed together.

### Configuration

1. Navigate to the page where you want to add the Support Requester.
2. Edit the page and drag the "Support Requester" component from the custom components section.
3. Configure the following properties:
   - **Primary Color**: Main theme color (default: #22BDC1).
   - **Accent Color**: Secondary theme color (default: #D5DF23).
   - **Default Category**: Pre-selected category for requests (optional).
   - **Request Object**: API name of the custom object for support requests.
   - **Enable File Attachments**: Allow users to attach files to requests.
   - **Max Attachment Size**: Maximum file size for attachments (in MB).
   - **Success Message**: Custom message displayed after successful submission.

### Usage

1. **Initiate Request**: Open the component to start a new support request.
2. **Select Category**: Choose the appropriate request category.
3. **Complete Form**: Fill in required details specific to the selected category.
4. **Add Attachments**: Upload screenshots or relevant documents if needed.
5. **Submit Request**: Send the completed request to the support team.
6. **Track Status**: View status updates on submitted requests.

## Technical Details

### Component Structure

- **LWC Component**: `supportRequester`
- **Apex Controller**: `SupportRequestController.cls`
- **Custom Objects**: `Support_Request__c`, `Request_Category__c`

### Integration Points

- **Case Object**: Optional integration with standard Salesforce Cases
- **Knowledge Base**: Can suggest relevant articles during request creation
- **Chatter**: Can create Chatter posts for collaboration on requests
- **Email Services**: Optional email notifications for request updates

## Troubleshooting

### Common Issues

1. **Component Not Loading**
   - Verify all dependencies are properly deployed
   - Check user permissions for support request objects
   - Ensure Apex controller access is granted

2. **File Attachment Issues**
   - Verify file size is within configured limits
   - Check user permissions for ContentDocument objects
   - Ensure supported file types are being used

3. **Routing Problems**
   - Validate assignment rule configuration
   - Check queue memberships and availability
   - Review category-to-team mappings

## Contributing

We welcome contributions to enhance the Support Requester component. Please submit pull requests with detailed descriptions of your changes.

## License

This component is available under the MIT License. See LICENSE.md for details.

---

*Developed by Nuvitek - Transforming business through innovative Salesforce solutions.* 