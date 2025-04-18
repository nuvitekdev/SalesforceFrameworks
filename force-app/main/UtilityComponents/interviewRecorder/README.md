# Interview Recorder Utility Component

A comprehensive Salesforce utility that allows users to record video interviews using their webcam, which can then be saved as Salesforce Files and linked to any record. Perfect for capturing candidate interviews, customer testimonials, or any video-based information that needs to be stored within Salesforce.

## Features

- **Video Recording:** Record high-quality video interviews directly in Salesforce
- **Customizable Duration:** Configure maximum recording length to fit your needs
- **Preview & Review:** Watch recordings before submission to ensure quality
- **Salesforce Files Integration:** Automatically saves recordings as Salesforce Files
- **Record Association:** Links recordings to any Salesforce record
- **Responsive Design:** Fully adaptive interface for desktop and mobile devices
- **Flow Compatible:** Easy integration into your existing processes
- **Custom Branding:** Configurable colors to match your organization's branding
- **User-Friendly Interface:** Intuitive controls with clear instructions

## Components

The Interview Recorder utility consists of two main components:

1. **LWC Component (`interviewRecorder`):**
   - Provides the user interface for recording, previewing, and submitting videos
   - Handles browser media access and recording functionality
   - Manages the video recording process and user interaction

2. **Apex Controller (`InterviewRecorderController`):**
   - Processes video data on the server side
   - Saves recordings as ContentDocument (Salesforce Files)
   - Links recordings to specified Salesforce records

## Installation

Deploy both components to your Salesforce org:

1. LWC Component: `force-app/main/UtilityComponents/interviewRecorder/lwc/interviewRecorder`
2. Apex Controller: `force-app/main/UtilityComponents/interviewRecorder/classes/InterviewRecorderController.cls`

## Usage

The Interview Recorder can be used in several contexts:

### Record Page

1. Edit the record page layout in Lightning App Builder
2. Drag the "Video Interview Recorder" component to the desired location
3. Configure component properties (title, colors, duration limits)
4. Save and activate the page

### Home Page

1. Edit the Lightning Home Page in Lightning App Builder
2. Add the "Video Interview Recorder" component
3. **Important:** When using on a Home Page, you must provide a recordId in the component configuration
4. Configure other visual and functional settings
5. Save and activate the page

### Flow Screen

Include in a Flow to create guided interview processes:

```xml
<screen>
    <fields>
        <field>
            <lightning:interviewRecorder
                recordId="{!Application__c.Id}"
                maxDuration="300"
                primaryColor="#0070D2"
                accentColor="#04C000"
                folderName="Application Interviews"
                recordingCompleted="{!InterviewCompleted}" 
                componentTitle="Application Video Interview"
                showInstructions="true"
            />
        </field>
    </fields>
    <nextWhenReference>InterviewCompleted</nextWhenReference>
</screen>
```

### Experience Cloud (Communities)

Add to Experience Cloud pages for external users to submit video interviews:

1. Edit the Experience Builder page
2. Add the "Video Interview Recorder" component
3. Specify the record ID to link recordings to
4. Configure appearance to match your Experience Cloud theme

## Configuration

### Functional Settings

| Property | Description | Default |
|----------|-------------|---------|
| recordId | ID of record to link recordings to | (required) |
| maxDuration | Maximum recording time in seconds | 300 |
| folderName | Name of folder to store recordings | "Interview Recordings" |
| countdownDuration | Seconds to countdown before recording | 3 |
| recordingCompleted | Boolean output (for Flows) | false |

### UI Customization

| Property | Description | Default |
|----------|-------------|---------|
| componentTitle | Component header title | "Video Interview Recorder" |
| showInstructions | Display instructions panel | true |
| instructionsTitle | Instructions panel title | "Interview Recording Instructions" |
| primaryColor | Main UI color (header, buttons) | #22BDC1 |
| accentColor | Secondary UI color (highlights) | #D5DF23 |

## Use Cases

- **Recruiting:** Record candidate interview responses for hiring teams to review
- **Customer Success:** Capture customer testimonials or feedback
- **Training:** Record role-playing exercises or demonstrations
- **Field Service:** Document on-site conditions or completed work
- **Healthcare:** Record patient consent or treatment explanations
- **Sales:** Capture prospect introductions or product demos

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

## Troubleshooting

1. **Camera/Microphone Not Working**
   - Ensure browser permissions are granted
   - Check if another application is using the camera

2. **Saving Failed**
   - Verify the user has create permission for ContentDocument
   - Check if recording exceeds Salesforce file size limits
   
3. **Flow Integration Issues**
   - Ensure recordId is correctly passed to the component
   - Verify recordingCompleted attribute is used for flow control 