# PDF Template Creator (Drag & Drop)

![PDF Template Creator Banner](https://raw.githubusercontent.com/YOUR-ORG/YOUR-REPO/main/docs/images/pdf-template-creator-banner.png)

## What is the PDF Template Creator?

The PDF Template Creator is an innovative Lightning Web Component (LWC) that empowers users to design custom PDF templates by dragging and dropping Salesforce fields onto blank pages. Built with the same modern, Apple-inspired UI as the PDF Signer component, it provides an intuitive visual interface for creating dynamic document templates without any coding required.

### Key Features

- **Visual Template Design**: Drag and drop interface for placing fields on PDF pages
- **Object & Field Selection**: Choose from any accessible Salesforce object and its fields
- **Smart Field Filtering**: Search and filter fields by type, requirement status, and more
- **Multi-Page Support**: Create templates with multiple pages and navigate between them
- **Field Positioning**: Precisely position, resize, and arrange fields on each page
- **Template Persistence**: Save templates for reuse across your organization
- **Responsive Design**: Works seamlessly on desktop, tablet, and mobile devices
- **Customizable Theming**: Match your organization's branding with configurable colors

## Why Use the PDF Template Creator?

Traditional document generation often requires technical expertise or expensive third-party solutions. The PDF Template Creator democratizes this process by providing:

1. **No-Code Solution**: Business users can create templates without developer involvement
2. **Visual Design**: See exactly how your PDFs will look while designing them
3. **Salesforce Native**: Direct integration with your Salesforce data model
4. **Cost Savings**: Eliminate expensive document generation subscriptions
5. **Flexibility**: Create templates for any use case - invoices, quotes, reports, certificates
6. **Version Control**: Built-in template versioning for change management
7. **Rapid Iteration**: Quickly modify templates as business needs evolve

## Who Should Use This Component?

The PDF Template Creator is ideal for:

- **Sales Operations**: Design quote and proposal templates
- **Finance Teams**: Create invoice and statement templates
- **HR Departments**: Build offer letters and employee documents
- **Marketing Teams**: Design certificates and branded materials
- **Service Teams**: Create work order and service report templates
- **Compliance Officers**: Build standardized compliance documents
- **System Administrators**: Empower users with self-service template creation
- **Business Analysts**: Rapidly prototype document requirements

## When to Use the PDF Template Creator

Deploy this component when:

- You need to generate PDFs from Salesforce data
- Business users request new document templates frequently
- You want to standardize document formats across the organization
- External document generation tools are too expensive or complex
- You need to quickly iterate on document designs
- Multiple departments need their own custom templates
- You're replacing manual document creation processes

## Where to Deploy the Component

The PDF Template Creator can be added to:

- **App Pages**: Create a dedicated template design workspace
- **Home Pages**: Provide quick access for template creators
- **Record Pages**: Design templates specific to certain record types
- **Flow Screens**: Integrate template creation into business processes
- **Experience Cloud**: Enable partners to create their own templates
- **Custom Apps**: Build document management solutions

## How to Configure and Use

### Installation

1. Deploy all component files using Salesforce CLI or your preferred deployment method
2. Ensure the custom objects (PDF_Template__c and PDF_Template_Field__c) are created
3. Assign appropriate permissions to users who will create templates

### Configuration

1. Add the component to your desired page
2. Configure theme colors (optional):
   - **Primary Color**: Main theme color
   - **Accent Color**: Highlight color
   - **RGB Values**: For transparency effects

### Usage Guide

#### Step 1: Setup
1. Select the Salesforce object for your template
2. Choose page size (A4, Letter, Legal)
3. Select orientation (Portrait or Landscape)
4. Set initial number of pages

#### Step 2: Select Fields
1. Browse all available fields from the selected object
2. Use search to find specific fields
3. Filter by field type (Text, Number, Date, etc.)
4. Select fields to include in your template

#### Step 3: Design
1. Drag fields from the palette onto the PDF page
2. Position fields precisely where needed
3. Resize field containers as required
4. Navigate between pages
5. Add additional pages if needed

#### Step 4: Save
1. Name your template
2. Add an optional description
3. Save the template for future use

## Technical Architecture

### Component Structure

```
pdfCreatorDragDrop/
├── lwc/
│   └── pdfCreatorDragDrop/
│       ├── pdfCreatorDragDrop.js
│       ├── pdfCreatorDragDrop.html
│       ├── pdfCreatorDragDrop.css
│       └── pdfCreatorDragDrop.js-meta.xml
└── classes/
    ├── PdfTemplateController.cls
    └── PdfTemplateController.cls-meta.xml
```

### Data Model

**PDF_Template__c**
- Stores template metadata
- Tracks versions and status
- Links to object API names

**PDF_Template_Field__c**
- Stores field placements
- Maintains positioning data
- Preserves formatting options

### Key Methods

- `getAvailableObjects()`: Retrieves accessible Salesforce objects
- `getObjectFields()`: Gets fields for selected object
- `saveTemplate()`: Persists template definition
- `loadTemplate()`: Retrieves existing templates

## Best Practices

1. **Template Naming**: Use clear, descriptive names
2. **Field Selection**: Only include necessary fields
3. **Page Layout**: Leave adequate spacing between fields
4. **Testing**: Preview templates with sample data
5. **Versioning**: Create new versions for major changes
6. **Documentation**: Add descriptions to templates

## Future Enhancements

- **Preview Mode**: Real-time preview with sample data
- **Field Formatting**: Advanced formatting options
- **Conditional Logic**: Show/hide fields based on data
- **Template Library**: Pre-built template marketplace
- **Bulk Generation**: Generate multiple PDFs at once
- **Email Integration**: Direct email delivery of generated PDFs

## Troubleshooting

### Common Issues

1. **Object Not Visible**
   - Check user permissions for the object
   - Ensure object is not hidden or deprecated

2. **Fields Missing**
   - Verify field-level security
   - Check if fields are visible to the user

3. **Drag and Drop Not Working**
   - Ensure browser supports HTML5 drag/drop
   - Check for JavaScript errors

4. **Template Not Saving**
   - Verify create/edit permissions on custom objects
   - Check for validation rule conflicts

## Contributing

We welcome contributions! Please submit pull requests with:
- Clear descriptions of changes
- Test coverage for new features
- Documentation updates

## Support

For issues or questions:
1. Check the troubleshooting guide
2. Review existing issues on GitHub
3. Contact your system administrator

## License

This component is available under the MIT License. See LICENSE.md for details.

---

*Developed by Nuvitek - Empowering businesses with innovative Salesforce solutions.* 