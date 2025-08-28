# Nuvitek Salesforce Frameworks

A comprehensive Salesforce DX project providing government-focused applications and reusable utility components.

## Overview

This repository contains a collection of Salesforce applications designed for government/public sector use cases, along with a comprehensive suite of utility components that can be leveraged across multiple domains.

## Project Structure

```
force-app/main/
├── Document_Routing/          # Document workflow and routing solutions
├── Ethics_Compliance/         # Ethics and compliance management
├── Government_Documents/       # Government-specific document processing
├── HR_Administrative/         # Human Resources administrative processes
├── Home/                     # Shared platform components and configs
├── Inventory/                # Asset and inventory management
├── Investigations/           # Investigation and compliance workflows
├── Travel/                   # Travel management and approval processes
└── UtilityComponents/        # Reusable cross-domain components
```

## Key Features

- **Domain-Driven Architecture**: Each business domain has its own dedicated folder structure
- **Comprehensive Utility Components**: 15+ reusable components including AI integration, document management, messaging, and more
- **Government-Focused**: Built specifically for public sector compliance and administrative needs
- **Salesforce Best Practices**: Following Salesforce DX patterns with proper test coverage and documentation

## Quick Start

1. **Clone the Repository**

   ```bash
   git clone <repository-url>
   cd SalesforceFrameworks
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Deploy to Scratch Org**

   ```bash
   sf org create scratch -f config/project-scratch-def.json -a MyScratchOrg
   sf project deploy start -o MyScratchOrg
   ```

4. **Run Tests**
   ```bash
   npm run test:unit
   sf apex test run -o MyScratchOrg
   ```

## Utility Components

The UtilityComponents folder contains 15+ reusable components:

- **Document Management**: File upload, folder management, PDF creation
- **AI Integration**: LLM assistant with multiple provider support
- **Messaging**: Real-time chat and communication tools
- **Survey Tools**: Dynamic survey creation and response collection
- **Security**: Session management, signature capture, access controls
- **Visualization**: License tracking, SLA monitoring, data visualization

See [UtilityComponents README](./force-app/main/UtilityComponents/README.md) for detailed component documentation.

## Domain Applications

### Document Routing

Handles document workflows, FOIA requests, correspondence management, and routing processes.

### Ethics Compliance

Manages ethics submissions, OGE-450 forms, and compliance workflows.

### Government Documents

Processes acquisitions, contracts, permits, licenses, and purchasing workflows.

### HR Administrative

Comprehensive HR processes including onboarding, performance management, grievances, and benefits.

### Investigations

Investigation workflows for EEO, OIG, whistleblower reports, and compliance matters.

### Travel

Travel request processing, expense management, and passport tracking.

## Development Guidelines

### Code Quality

- All Apex classes must have >75% test coverage
- LWC components should include Jest tests
- Run `npm run lint && npm run prettier:verify` before commits
- Follow Salesforce naming conventions

### Architecture Principles

- Maintain separation of concerns between domains
- Leverage shared utility components for common functionality
- Implement proper error handling and governor limit considerations
- Use consistent naming patterns across all components

## Repository Statistics

- **43** JavaScript files (LWC components)
- **53** Apex classes
- **30** HTML templates
- **625** Documentation files
- **15+** Utility components
- **7** Business domains

## Contributing

1. Follow the existing folder structure and naming conventions
2. Add comprehensive test coverage for new components
3. Update documentation for any new features
4. Run quality checks before submitting changes

## Support

For questions about specific components or domains, refer to the README files in each respective folder:

- [Document Routing](./force-app/main/Document_Routing/README.md)
- [Ethics Compliance](./force-app/main/Ethics_Compliance/README.md)
- [Government Documents](./force-app/main/Government_Documents/README.md)
- [HR Administrative](./force-app/main/HR_Administrative/README.md)
- [Investigations](./force-app/main/Investigations/README.md)
- [Travel](./force-app/main/Travel/README.md)
- [Utility Components](./force-app/main/UtilityComponents/README.md)

## Configuration

The project uses Salesforce API version 62.0 and follows standard Salesforce DX project structure. See `sfdx-project.json` for package configuration details.
