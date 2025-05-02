# NuviAI Assistant Component

![NuviAI Assistant Banner](https://raw.githubusercontent.com/YOUR-ORG/YOUR-REPO/main/docs/images/nuviai-banner.png)

## What is the NuviAI Assistant?

The NuviAI Assistant is a cutting-edge Lightning Web Component (LWC) that brings the power of Large Language Models (LLMs) directly into Salesforce. This intelligent assistant enables users to interact with AI models, analyze records, summarize information, and generate content—all without leaving the Salesforce platform. The component connects to various AI providers, providing a unified interface for AI capabilities that enhance user productivity and data insights.

### Key Features

- **Multi-Model Support**: Connect to various LLM providers including OpenAI, Anthropic, and more.
- **Contextual Awareness**: Understands record data and related objects for accurate, relevant responses.
- **Conversation History**: Maintains conversation context for natural, ongoing interactions.
- **Anomaly Detection**: Proactively identifies unusual patterns or potential issues in records.
- **Content Generation**: Creates drafts for emails, summaries, reports, and other business content.
- **Summary Creation**: Distills complex information into concise, actionable summaries.
- **Analysis Saving**: Save AI analysis directly to record fields for future reference.
- **Image Analysis**: Process attached images and PDFs using OpenAI's Vision capabilities to extract information and insights.
- **Theme Integration**: Automatically adopts your Salesforce theme for a seamless visual experience.
- **Modern UI/UX**: Clean, Apple-inspired design with responsive layout for all devices.
- **Flow Integration**: Use in Flow screens with output variables for AI-generated content.

## Why Use the NuviAI Assistant?

Artificial Intelligence is transforming how businesses operate, and the NuviAI Assistant offers several benefits:

1. **Productivity**: Reduce time spent on repetitive writing tasks and data analysis.
2. **Insights**: Uncover hidden patterns and relationships in your data.
3. **Consistency**: Generate standardized content that follows organizational guidelines.
4. **Accessibility**: Make AI capabilities available to all users without technical expertise.
5. **Integration**: Keep users within Salesforce rather than switching to external AI tools.
6. **Decision Support**: Provide AI-driven recommendations to aid decision-making.
7. **Learning**: Help users understand complex information through AI-powered explanations.
8. **Innovation**: Enable new use cases and opportunities with embedded AI capabilities.
9. **Document Processing**: Extract text and information from images and documents without manual entry.

## Who Should Use This Component?

The NuviAI Assistant is ideal for:

- **Sales Representatives**: Generating personalized outreach messages and analyzing deal signals.
- **Service Agents**: Summarizing customer issues and drafting response templates.
- **Account Managers**: Creating relationship summaries and identifying opportunities.
- **Marketing Teams**: Drafting content ideas and analyzing campaign performance.
- **Operations Managers**: Identifying process inefficiencies and summarizing reports.
- **Executives**: Getting quick insights on records and generating summaries of complex data.
- **Administrators**: Creating documentation and analyzing system configurations.
- **Analysts**: Uncovering data patterns and generating preliminary findings.
- **Documentation Teams**: Extracting and processing text from images and scanned documents.

## When to Use the NuviAI Assistant

Implement the NuviAI Assistant in these scenarios:

- When users need to generate written content quickly and consistently
- During data analysis tasks requiring deeper insights and pattern recognition
- For identifying anomalies or unusual patterns in record data
- When summarizing lengthy conversations, emails, or documents
- To provide answers to complex questions about records or Salesforce data
- During decision-making processes that benefit from AI-powered recommendations
- For creating first drafts of reports, proposals, or other business documents
- To provide self-service AI assistance to employees across the organization
- When you need to extract information from attached images, diagrams, or PDFs
- For processing and analyzing visual content like receipts, business cards, or screenshots

## Where to Deploy the NuviAI Assistant

The NuviAI Assistant component can be added to:

- **Record Pages**: Add to any standard or custom object's record page for contextual assistance.
- **App Pages**: Include in Lightning app pages for global AI assistance.
- **Home Pages**: Add to user home pages for easy access to AI capabilities.
- **Utility Bars**: Make available as a utility item for assistance across the application.
- **Flow Screens**: Incorporate into guided processes for AI-powered steps.
- **Communities**: Add to Experience Cloud pages for partner or customer self-service.
- **Lightning Console**: Add to console layouts for agent assistance.
- **Mobile App**: Deploy for on-the-go AI assistance.

## How to Configure and Use

### Installation

1. Deploy the component using Salesforce CLI or directly within your Salesforce org.
2. Configure connected app settings for your LLM providers.
3. Ensure all dependencies (apex classes, LWC, custom settings) are deployed together.

### Configuration

1. Navigate to the page where you want to add the NuviAI Assistant.
2. Edit the page and drag the "LLM Assistant" component from the custom components section.
3. Configure the following properties:
   - **Primary Color**: Main theme color (default: #22BDC1).
   - **Accent Color**: Secondary theme color (default: #D5DF23).
   - **Card Title**: Title displayed in the component header (default: "AI Assistant").
   - **Default Model Name**: Preferred LLM to use by default.
   - **Hide Model Selector**: Option to simplify UI by hiding model selection.
   - **Context Prompt**: Custom context to provide to the LLM about its purpose.
   - **Enable Anomaly Detection**: Turn on automatic checking for unusual patterns.
   - **Enable Image Analysis**: Enable the ability to analyze images attached to records.
   - **Related Objects**: Comma-separated list of related objects to include in context.
   - **Analysis Field API Name**: Field where analysis summaries can be saved.

### Usage

1. **Ask Questions**: Type natural language queries about the current record or general topics.
2. **Analyze Record**: Click the analyze button to get AI insights about the current record.
3. **Analyze Images**: Process attached images and PDFs to extract text and visual information.
4. **Generate Content**: Request drafts of emails, summaries, or other content.
5. **Save Analysis**: Save important insights directly to the record for future reference.
6. **View History**: Access previous conversations for context or reference.

### Image Analysis Feature

The Image Analysis capability allows you to:
- Extract text from images and documents using OpenAI's Vision API
- Understand diagrams, charts, and visual content
- Process PDFs to extract meaningful information
- Analyze business cards, receipts, and other visual materials
- Convert image content into structured information

To use this feature:
1. Ensure the "Enable Image Analysis" option is turned on (this shows the "Analyze Images" button)
2. Upload images or documents (JPG, PNG, GIF, PDF) to the Salesforce record as Files
3. Click the "Analyze Images" button in the LLM Assistant
4. Optionally enter a prompt to guide the analysis (e.g., "Extract contact information from this business card")
5. The AI will process the images and provide detailed information about their contents

**Automatic Document Analysis:**
- When using "Analyze Record", PDFs and images are automatically detected and processed using OpenAI's Vision API
- This happens even if you select a different model from the dropdown - documents always use Vision capabilities
- The analysis will include a dedicated "Document Analysis" section containing the Vision API's interpretation
- This integration provides seamless document understanding without requiring a separate analysis step

**Important Notes:**
- Image analysis always uses OpenAI's GPT4o Vision model, regardless of which model is selected in the dropdown
- The model name in the response will correctly display as "OpenAI GPT4o Vision" when using the dedicated "Analyze Images" button
- PDF files are fully supported and will be processed like images
- Files must be under 5MB to be processed
- Multiple images/documents can be analyzed in a single request

**Analyzing Content with GPT4o Vision:**

This component provides two different ways to analyze document content:

1. **Analyze Images Button:** 
   - Processes ONLY image files (JPG, PNG, GIF)
   - Ignores PDFs and other document types
   - Best for specifically analyzing visual content
   - Uses OpenAI's GPT4o Vision model

2. **Analyze Record Button:**
   - Processes ALL attachment types (images, PDFs, documents)
   - Uses Vision capabilities for all attachments (not just images)
   - Provides comprehensive document analysis alongside record details
   - Combines standard LLM analysis with Vision-powered document insights
   - Always uses GPT4o for document analysis regardless of selected model

This dual approach gives you flexibility - use "Analyze Images" when you only want to focus on visual content, and use "Analyze Record" when you want a complete analysis of all record data including all attached documents.

## Technical Details

### Component Structure

- **LWC Component**: `llmAssistant`
- **Apex Controller**: `LLMController.cls`
- **Custom Settings**: Configuration for LLM providers and defaults

### Image Processing Implementation

The image processing functionality works by:
1. Retrieving image attachments from the current record using Salesforce's ContentDocument API
2. Converting each image to base64 format
3. Sending the images to OpenAI's Vision-capable models (GPT-4 Vision)
4. Processing the response and displaying the results to the user

This implementation has several advantages:
- No need to store images in external systems
- Secure processing within the Salesforce ecosystem
- Support for multiple file types including JPEG, PNG, and PDF
- Ability to process multiple images in a single request
- Integration with the existing conversation history system

### Security Considerations

- API keys for LLM providers are stored securely using Named Credentials
- Data sent to external AI services follows Salesforce security best practices
- The component respects Salesforce field-level security and sharing rules
- Images are processed securely with appropriate size limits and controls

## Troubleshooting

### Common Issues

1. **Model Not Available**
   - Verify API credentials are properly configured
   - Check usage limits with the AI provider
   - Ensure network connectivity to the AI service

2. **Incomplete Analysis**
   - Consider providing more context in prompts
   - Check if the AI model has access to necessary data
   - Try a different model if available

3. **Performance Issues**
   - Large amounts of data may slow response times
   - Consider limiting the scope of related data included
   - Use more specific prompts for complex questions

4. **Image Processing Issues**
   - Ensure images are under the 5MB size limit
   - Check that the file format is supported (JPEG, PNG, GIF, PDF)
   - Verify the OpenAI GPT4 Vision configuration is properly set up
   - For better results with text extraction, provide clear images with good contrast

## Contributing

We welcome contributions to enhance the NuviAI Assistant component. Please submit pull requests with detailed descriptions of your changes.

## License

This component is available under the MIT License. See LICENSE.md for details.

---

*Developed by Nuvitek - Transforming business through innovative Salesforce solutions.* 