# Signature Capture Component

![Signature Capture Banner](https://raw.githubusercontent.com/YOUR-ORG/YOUR-REPO/main/docs/images/signature-capture-banner.png)

## What is the Signature Capture?

The Signature Capture is a lightweight, versatile Lightning Web Component (LWC) that enables capturing electronic signatures directly within Salesforce. The component offers both handwritten (drawing) and typed signature options with a clean, elegant interface. Captured signatures are saved as image files that can be stored as Salesforce Files and associated with records.

### Key Features

- **Dual Signature Methods**: Draw signatures with a natural pen-like experience or create typed signatures with elegant fonts.
- **Customizable Appearance**: Configure colors, sizes, and fonts to match your Salesforce theme.
- **Responsive Canvas**: Adapts to different screen sizes for consistent user experience across devices.
- **Real-time Preview**: See the signature as it's being created.
- **Record Association**: Automatically attach signatures to any Salesforce record.
- **Flow Integration**: Designed for seamless integration with Flow screens, with output variables for the saved signature URL.
- **Lightweight Design**: Focused on one task, making it easy to embed anywhere.
- **Accessibility Support**: Keyboard navigation and screen reader compatibility.

## Why Use the Signature Capture?

Capturing signatures is essential for many business processes, and this component offers significant advantages:

1. **Simplicity**: Purpose-built for signature capture, without the complexity of full document signing.
2. **Integration**: Seamlessly embed in any Salesforce page without external tools.
3. **Flexibility**: The versatile design works for quick acknowledgments, approvals, or form completions.
4. **Improved Experience**: Provide an intuitive, in-platform signing experience.
5. **Process Acceleration**: Eliminate the need for printing forms just to capture signatures.
6. **Consistency**: Maintain a uniform signature capture process across all use cases.
7. **Reusability**: The modular design makes it easy to implement in multiple contexts.

## Who Should Use This Component?

The Signature Capture component is ideal for:

- **Sales Representatives**: Capturing customer approvals for quotes, orders, or changes.
- **Field Service Technicians**: Getting confirmation signatures for completed work.
- **Healthcare Providers**: Obtaining patient consent or intake form signatures.
- **Delivery Personnel**: Confirming package receipt directly in Salesforce.
- **Event Managers**: Registering attendees with a signature.
- **HR Teams**: Capturing employee acknowledgment of policies or procedures.
- **Customer Service Representatives**: Documenting verbal authorizations with agent signatures.
- **Retail Employees**: Processing returns or warranty claims with customer signatures.

## When to Use the Signature Capture

Implement the Signature Capture in these scenarios:

- When you need just a signature, not a full document signing process
- In situations where quick signature capture is needed on an existing record
- During in-person customer interactions where immediate confirmation is valuable
- For internal processes requiring approval signatures
- As part of forms or applications that need a signature component
- When you want to reduce paper usage for signature-only processes
- For implementing a legal acknowledgment step in a guided process
- To enhance existing business processes with electronic signature capabilities

## Where to Deploy the Signature Capture

The Signature Capture component can be added to:

- **Record Pages**: Add to any standard or custom object's record page.
- **Flow Screens**: Incorporate into guided processes or wizards.
- **Lightning Apps**: Include in custom Lightning apps where signature capture is relevant.
- **Communities**: Add to Experience Cloud pages for partner or customer signatures.
- **Mobile Apps**: Perfectly suited for Salesforce mobile app deployment.
- **Quick Actions**: Configure as a quick action for rapid signature capture.
- **Utility Items**: Add to utility bar for access across multiple pages.

## How to Configure and Use

### Installation

1. Deploy the component using Salesforce CLI or directly within your Salesforce org.
2. Ensure all dependencies (apex classes, LWC, static resources) are deployed together.

### Configuration

1. Navigate to the page where you want to add the Signature Capture component.
2. Edit the page and drag the "Signature Capture" component from the custom components section.
3. Configure the following properties:
   - **Title**: Heading displayed above the signature pad (default: "Signature Capture")
   - **Subtitle**: Optional instructional text below the title
   - **Default Mode**: Which signature mode to start with ("draw" or "text")
   - **Canvas Height**: Height of the signature area in pixels (default: 200)
   - **Primary Color**: Main theme color (default: #22BDC1)
   - **Accent Color**: Secondary theme color (default: #D5DF23)
   - **Show Preview**: Whether to display a preview of the saved signature

### Usage

1. **Select Mode**: Choose between "Draw" or "Type" signature.
2. **Create Signature**: 
   - In Draw mode: Use mouse or touch to draw signature on the canvas.
   - In Type mode: Type your name in the input field to create a stylized signature.
3. **Clear**: Use the clear button to reset and try again if needed.
4. **Save**: Click the save button to convert the signature to an image and save it.

## Technical Details

### Component Structure

- **LWC Component**: `signatureCapture`
- **Apex Controller**: `SignatureCaptureController.cls`
- **Static Resources**:
  - signature_pad.js: Third-party library for signature drawing
  - signature: Font resources for typed signatures

### Flow Output Variables

- **savedSignatureUrl**: URL to the saved signature image
- **contentDocumentId**: ID of the saved content document

## Troubleshooting

### Common Issues

1. **Canvas Not Working**
   - Ensure browser supports HTML5 Canvas
   - Check for JavaScript console errors
   - Try a different browser if issues persist

2. **Saving Issues**
   - Verify user has permission to create Files
   - Check that record ID is available if associating with a record
   - Ensure apex classes are properly deployed

## Contributing

We welcome contributions to enhance the Signature Capture component. Please submit pull requests with detailed descriptions of your changes.

## License

This component is available under the MIT License. See LICENSE.md for details.

---

*Developed by Nuvitek - Transforming business through innovative Salesforce solutions.* 