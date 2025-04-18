# Support Requester Component

A comprehensive Salesforce utility that allows users to create support cases with screen recording capabilities. This component features a dynamic FAQ section that can be customized by administrators and provides a seamless user experience for submitting support requests.

## Features

- **Support Case Creation:** Easily create support cases with subject, description, priority, and application context
- **Screen Recording:** Record screen activity with audio narration to better explain issues
- **Dynamic FAQ Section:** Display frequently asked questions that can be expanded/collapsed
- **Admin FAQ Management:** Admin mode for adding, editing, and removing FAQ items
- **Custom Styling:** Configurable colors and theme to match your organization's branding
- **Responsive Design:** Fully adaptive interface for desktop and mobile devices
- **Flow Compatible:** Easy integration into your existing processes
- **User-Friendly Interface:** Intuitive controls with clear instructions

## Components

The Support Requester utility consists of two main components:

1. **LWC Component (`supportRequester`):**
   - Provides the user interface for creating support cases
   - Handles screen recording functionality
   - Manages the dynamic FAQ section
   - Supports both light and dark themes

2. **Apex Controller (`SupportRequesterController`):**
   - Processes video data on the server side
   - Saves recordings as ContentDocument (Salesforce Files)
   - Links recordings to support cases
   - Retrieves available applications for context selection

## Installation

Deploy both components to your Salesforce org:

1. LWC Component: `force-app/main/UtilityComponents/supportRequester/lwc/supportRequester`
2. Apex Controller: `force-app/main/UtilityComponents/supportRequester/classes/SupportRequesterController.cls`

## Usage

The Support Requester can be used in several contexts:

### Record Page

1. Edit the record page layout in Lightning App Builder
2. Drag the "Support Requester" component to the desired location
3. Configure component properties (theme, colors, FAQ options)
4. Save and activate the page

### Home Page

1. Edit the Lightning Home Page in Lightning App Builder
2. Add the "Support Requester" component
3. Configure component properties
4. Save and activate the page

### Flow Screen

Include in a Flow to create guided support processes:

```xml
<screen>
    <fields>
        <field>
            <lightning:supportRequester
                recordTypeId="{!SupportRecordTypeId}"
                maxDuration="300"
                primaryColor="#0070D2"
                accentColor="#04C000"
                folderName="Support Recordings"
                requestCompleted="{!RequestCompleted}" 
                componentTitle="Support Request"
                showFaqSection="true"
            />
        </field>
    </fields>
    <nextWhenReference>RequestCompleted</nextWhenReference>
</screen>
```

### Experience Cloud (Communities)

Add to Experience Cloud pages for external users to submit support requests:

1. Edit the Experience Builder page
2. Add the "Support Requester" component
3. Configure the component to match your Experience Cloud theme
4. Save and publish the page

## Configuration

### Support Case Settings

| Property | Description | Default |
|----------|-------------|---------|
| recordTypeId | ID of the support record type for cases | (Auto-detected) |
| maxDuration | Maximum recording time in seconds | 300 |
| folderName | Name of folder to store recordings | "Support Recordings" |
| componentTitle | Component header title | "Support Request" |
| caseSubjectPrefix | Prefix added to case subjects | "" |

### FAQ Settings

| Property | Description | Default |
|----------|-------------|---------|
| showFaqSection | Display the FAQ section | true |
| faqHeaderTitle | Title for the FAQ section | "Frequently Asked Questions" |
| showFaqAddButton | Enable admin mode for managing FAQs | false |
| defaultFaqItems | JSON string containing default FAQ items | (Basic FAQs) |

### Appearance Settings

| Property | Description | Default |
|----------|-------------|---------|
| primaryColor | Main UI color (header, buttons) | #22BDC1 |
| accentColor | Secondary UI color (highlights) | #D5DF23 |
| useDarkTheme | Apply dark theme to component | false |
| showInstructions | Display instructions panel | true |
| instructionsText | Custom instructions text | (Default help text) |
| countdownDuration | Seconds to countdown before recording | 3 |

## Use Cases

- **Internal Support:** Employees can submit support requests with screen recordings to explain technical issues
- **IT Helpdesk:** Users can record their screen to show exactly what's happening with software problems
- **Customer Support:** Service agents can create detailed support cases with recordings of customer issues
- **Knowledge Base:** The FAQ section can serve as a first-line knowledge base for common issues
- **Self-Service Communities:** Customers can submit support requests directly through Experience Cloud

## Browser Compatibility

- Chrome 49+
- Firefox 29+
- Edge 79+ (Chromium-based)
- Safari 14.1+

Internet Explorer is not supported.

## Security Considerations

- Users must grant camera and microphone permissions in their browser
- Recordings are saved as Salesforce Files with standard sharing rules
- The component respects Salesforce sharing settings using "with sharing" in Apex

## Customization

### Retrieving Applications

The default implementation includes a placeholder method for retrieving available applications. To customize this:

1. Modify the `getAvailableApps()` method in `SupportRequesterController` to retrieve applications from your preferred data source
2. Options include:
   - Custom Metadata Types
   - Custom Settings
   - Custom Objects
   - Query on Application object

### Adding Custom Labels

For full internationalization support:

1. Create custom labels for all messages in the component
2. Replace hardcoded strings with references to the custom labels

## Troubleshooting

1. **Screen Recording Not Working**
   - Ensure browser permissions are granted
   - Check if another application is using the camera/microphone
   - Verify browser compatibility

2. **Support Case Not Created**
   - Check record type ID is valid
   - Verify user has create permission for Case object
   - Look for validation rule conflicts

3. **FAQ Section Missing**
   - Verify the `showFaqSection` property is set to true
   - Check JSON format for `defaultFaqItems` 