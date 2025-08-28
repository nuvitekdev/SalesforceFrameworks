# Utility Components

A comprehensive collection of reusable Lightning Web Components and Apex utilities designed for cross-domain functionality across the Nuvitek Salesforce Frameworks.

## Overview

The UtilityComponents library provides 15+ production-ready components that can be leveraged across multiple business domains. Each component is designed with modularity, performance, and government compliance requirements in mind.

## Component Categories

### Document Management

- **[Document Management](./documentManagement/README.md)**: File upload, folder management, and document organization
- **[PDF Creator Drag & Drop](./pdfCreatorDragDrop/README.md)**: Dynamic PDF generation with drag-and-drop field placement
- **[PDF Signer](./pdfSigner/README.md)**: Digital signature capabilities for PDF documents

### AI & Intelligence

- **[NuviAI](./nuviAIANDSupportANDTheme/nuviAI/README.md)**: Multi-provider LLM integration (OpenAI, Anthropic, Google Gemini)
- **[Natural Language to SOQL](./naturalLanguageToSoql/README.md)**: Convert natural language queries to SOQL

### Communication & Messaging

- **[Messaging](./messaging/README.md)**: Real-time chat and communication platform
- **[NuviMessaging](./nuviMessaging/README.md)**: Advanced messaging with platform events

### UI & Experience

- **[Hero Banner](./nuviAIANDSupportANDTheme/heroBanner/README.md)**: Dynamic hero banners for applications
- **[Custom Theme & Layout](./nuviAIANDSupportANDTheme/nuvitekCustomThemeLayoutAndAccess/README.md)**: Custom theming and access control
- **[Dynamic List Viewer](./dynamicListViewer/README.md)**: Configurable record list displays

### Data Collection & Analysis

- **[Dynamic Survey Creator](./dynamicSurveyCreator/README.md)**: Create and manage surveys with various question types
- **[Interview Recorder](./interviewRecorder/README.md)**: Audio recording for interviews and meetings
- **[Signature Pad](./signaturePad/README.md)**: Electronic signature capture

### Monitoring & Analytics

- **[License Visualizer](./licenseVisualizer/README.md)**: Salesforce license usage visualization with Chart.js
- **[SLA Tracker](./slaTracker/README.md)**: Service Level Agreement monitoring and reporting
- **[Session Management](./sessionManagement/README.md)**: User session tracking and timeout management

### Support & Access

- **[Support Requester](./nuviAIANDSupportANDTheme/supportRequester/README.md)**: IT support ticket creation and management

## Architecture Principles

### Modularity

Each component is self-contained with its own:

- Lightning Web Components (`/lwc` folder)
- Apex Controllers (`/classes` folder)
- Custom Objects & Metadata (`/objects` folder)
- Static Resources (`/staticresources` folder)
- Permission Sets (`/permissionsets` folder)

### Reusability

Components are designed to be:

- Domain-agnostic where possible
- Configurable through metadata or component properties
- Well-documented with usage examples
- Test-covered for reliability

### Government Compliance

All components consider:

- Security and field-level access controls
- Audit trail requirements
- Data retention policies
- 508 Compliance for accessibility

## Component Structure Standards

Each utility component follows this standardized structure:

```
componentName/
├── README.md                    # Component documentation
├── classes/                     # Apex controllers and services
│   ├── ComponentController.cls
│   ├── ComponentController.cls-meta.xml
│   ├── ComponentControllerTest.cls
│   └── ComponentControllerTest.cls-meta.xml
├── lwc/                        # Lightning Web Components
│   ├── jsconfig.json
│   └── componentName/
│       ├── componentName.html
│       ├── componentName.js
│       ├── componentName.js-meta.xml
│       ├── componentName.css
│       └── __tests__/          # Jest tests (when applicable)
├── objects/                    # Custom objects and fields
├── staticresources/           # Static resources (JS libraries, etc.)
├── permissionsets/           # Access controls
└── customMetadata/           # Configuration metadata
```

## Installation & Usage

### Individual Component Deployment

Each component can be deployed independently:

```bash
# Deploy a specific component
sf project deploy start -m "LightningComponentBundle:componentName" -o targetOrg
```

### Full UtilityComponents Deployment

Deploy all utility components:

```bash
# Deploy entire UtilityComponents folder
sf project deploy start -d force-app/main/UtilityComponents -o targetOrg
```

### Component Dependencies

Some components have dependencies on others:

- **NuviAI** components may require **Custom Theme & Layout** for proper styling
- **Messaging** components work best with **Session Management**
- **Document Management** integrates with **PDF Creator** and **PDF Signer**

## Development Guidelines

### Adding New Components

1. Create component folder under appropriate category
2. Follow the standardized folder structure
3. Include comprehensive README with:
   - Purpose and use cases
   - Installation instructions
   - Configuration options
   - Usage examples
   - Dependencies
4. Add Jest tests for LWC components
5. Ensure >75% Apex test coverage
6. Update this main README

### Best Practices

- Use consistent naming conventions (camelCase for LWC, PascalCase for Apex)
- Implement proper error handling
- Consider governor limits in all Apex code
- Make components configurable through metadata when possible
- Include comprehensive inline documentation

### Testing Standards

- All Apex classes must have corresponding test classes
- LWC components should include Jest unit tests
- Integration tests for complex workflows
- Test both positive and negative scenarios

## Component Matrix

| Component             | LWC | Apex | Objects | External APIs           | Complexity |
| --------------------- | --- | ---- | ------- | ----------------------- | ---------- |
| Document Management   | ✓   | ✓    | ✓       | -                       | Medium     |
| PDF Creator           | ✓   | ✓    | ✓       | -                       | High       |
| PDF Signer            | ✓   | ✓    | -       | PDF-lib.js              | Medium     |
| NuviAI                | ✓   | ✓    | ✓       | OpenAI/Anthropic/Gemini | High       |
| Natural Language SOQL | ✓   | ✓    | -       | AI Services             | Medium     |
| Messaging             | ✓   | ✓    | ✓       | Platform Events         | High       |
| Hero Banner           | ✓   | -    | -       | -                       | Low        |
| Custom Theme          | ✓   | ✓    | ✓       | -                       | Medium     |
| Dynamic List Viewer   | ✓   | ✓    | -       | -                       | Medium     |
| Survey Creator        | ✓   | ✓    | ✓       | -                       | High       |
| Interview Recorder    | ✓   | ✓    | -       | MediaRecorder API       | Medium     |
| Signature Pad         | ✓   | ✓    | -       | Signature Pad JS        | Low        |
| License Visualizer    | ✓   | ✓    | -       | Chart.js                | Medium     |
| SLA Tracker           | ✓   | ✓    | -       | -                       | Medium     |
| Session Management    | ✓   | ✓    | ✓       | Platform Events         | High       |
| Support Requester     | ✓   | ✓    | ✓       | -                       | Medium     |

## Support & Maintenance

### Component Ownership

Each component has dedicated documentation specifying:

- Primary maintainer/contact
- Known issues and limitations
- Roadmap for future enhancements

### Reporting Issues

When reporting issues:

1. Check component-specific README first
2. Include Salesforce org version and component version
3. Provide detailed reproduction steps
4. Include any error messages or logs

### Contributing

1. Follow existing patterns and conventions
2. Update documentation for any changes
3. Ensure all tests pass before submitting
4. Consider backward compatibility

## Version History

- **v1.0**: Initial release with core 15 components
- Components are continuously maintained and updated
- Check individual component READMEs for specific version information

---

For detailed documentation on each component, navigate to the specific component folder and review its README file.
