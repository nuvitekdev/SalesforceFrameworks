# NuviAI Assistant Component

![NuviAI Assistant Banner](https://raw.githubusercontent.com/YOUR-ORG/YOUR-REPO/main/docs/images/nuviai-banner.png)

## What is the NuviAI Assistant?

The NuviAI Assistant is a cutting-edge Lightning Web Component (LWC) that brings the power of Large Language Models (LLMs) directly into Salesforce. This intelligent assistant enables users to interact with AI models, analyze records, summarize information, generate content, and perform advanced compliance checks—all without leaving the Salesforce platform. The component connects to various AI providers, providing a unified interface for AI capabilities that enhance user productivity and data insights.

### Key Features

- **Multi-Model Support**: Connect to various LLM providers including OpenAI, Anthropic, Google, DeepSeek, and OpenRouter.
- **Contextual Awareness**: Understands record data and related objects for accurate, relevant responses.
- **Conversation History**: Maintains conversation context for natural, ongoing interactions with automatic summarization.
- **Anomaly Detection**: Proactively identifies unusual patterns or potential issues in records with real-time alerts.
- **Standards Comparison**: NEW! Compare content against predefined rules, standards, or criteria for compliance validation.
- **Comprehensive Record Analysis**: Deep analysis of records including all fields, related data, files, and activity history.
- **Document Analysis**: Process PDFs and extract structured data with field mapping capabilities.
- **Image & Vision Analysis**: Process attached images using OpenAI's Vision capabilities to extract information and insights.
- **Content Generation**: Creates drafts for emails, summaries, reports, and other business content.
- **Analysis Saving**: Save AI analysis directly to record fields for future reference with character limits.
- **Theme Integration**: Automatically adopts your Salesforce theme for a seamless visual experience.
- **Modern UI/UX**: Clean, Apple-inspired design with responsive layout for all devices.
- **Flow Integration**: Use in Flow screens with output variables for AI-generated content.
- **Performance Optimized**: Advanced caching, memory management, and optimized prompts for efficient operation.

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
10. **Compliance**: Validate content against organizational standards and regulatory requirements.
11. **Quality Assurance**: Automatically check documents, applications, and content for completeness and accuracy.

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
- **Compliance Officers**: Validating documents and content against regulatory standards.
- **HR Teams**: Screening applications, resumes, and employee documents against criteria.
- **Quality Assurance**: Checking proposals, contracts, and submissions for completeness.
- **Grant Reviewers**: Evaluating applications against funding criteria and requirements.
- **Procurement Teams**: Comparing vendor proposals against procurement standards.

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
- When validating content against organizational standards, policies, or regulatory requirements
- For screening applications, proposals, or submissions against predefined criteria
- During compliance reviews and quality assurance processes
- When you need consistent evaluation of documents or content against established rubrics

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
   - **Enable Comparison**: NEW! Turn on standards comparison and compliance validation.
   - **Comparison Rules (TO)**: JSON or text rules/standards to compare content against.
   - **Compare From (Source)**: Content to automatically compare. If provided, runs automatic comparison; if empty, shows manual comparison button.
   - **Enable Image Analysis**: Enable the ability to analyze images attached to records.
   - **Enable Document Analysis**: Turn on PDF processing and document analysis.
   - **Document Analysis Fields**: Comma-separated field API names for data extraction.
   - **Related Objects**: Comma-separated list of related objects to include in context.
   - **Analysis Field API Name**: Field where analysis summaries can be saved.

### Usage

1. **Ask Questions**: Type natural language queries about the current record or general topics.
2. **Analyze Record**: Click the analyze button to get AI insights about the current record.
3. **Analyze Images**: Process attached images and PDFs to extract text and visual information.
4. **Analyze Documents**: Process PDF files with advanced document analysis and field extraction.
5. **Compare to Standards**: NEW! Validate content against predefined rules and standards (manual or automatic).
6. **Generate Content**: Request drafts of emails, summaries, or other content.
7. **Save Analysis**: Save important insights directly to the record for future reference.
8. **View History**: Access previous conversations for context or reference.

---

## 🚀 Core Features Deep Dive

### 1. Natural Language Conversations

**What it does:**

- Engage in natural language conversations with AI models
- Ask questions about specific records or general topics
- Get contextual responses based on current record data

**How to use:**

1. Type your question in the text area
2. Click "Ask Question"
3. View the AI response in the conversation area
4. Continue the conversation with follow-up questions

**Example questions:**

- "What are the key details about this account?"
- "Draft an email to follow up on this opportunity"
- "What's unusual about this case compared to others?"
- "Summarize the recent activity on this record"

---

### 2. Comprehensive Record Analysis

**What it analyzes:**

- **All Record Fields**: Standard and custom fields, formula fields, roll-ups
- **Related Records**: Child and parent relationships (configurable)
- **Field History**: Changes over time, who made changes, when
- **Activity History**: Tasks, events, emails, calls
- **Chatter Feed**: Posts, comments, mentions, discussions
- **Files & Attachments**: PDFs, images, documents (with vision analysis)
- **Special Object Data**:
  - **Cases**: Case comments, email threads
  - **Opportunities**: Products, quotes, team members
  - **Accounts**: All related contacts, opportunities, cases
  - **Leads**: Campaign history, conversion status

**How to use:**

1. Navigate to any record page
2. Click "Analyze Record"
3. Wait for comprehensive analysis
4. Review insights and recommendations

**Configuration options:**

- Set "Related Objects" to include specific child objects
- Enable "Document Analysis" to process attachments
- Configure "Analysis Field" to save summaries

**Example output:**

```
ACCOUNT ANALYSIS - Acme Corporation

BASIC INFORMATION:
• Industry: Technology • Revenue: $50M • Employees: 200
• Created: 2023-01-15 • Last Modified: 2 days ago

RELATED CONTACTS (5):
• John Smith (CEO) - Primary contact, very responsive
• Jane Doe (CFO) - Financial decision maker
• Bob Johnson (IT Director) - Technical stakeholder

OPPORTUNITIES (3 Active):
• Enterprise License Deal - $500K - Closing Next Month
• Support Renewal - $100K - 90% probability
• New Project Phase 2 - $250K - Early stage

RECENT ACTIVITY:
• 12 emails in last 30 days
• 3 meetings scheduled
• 2 proposals sent

CHATTER ACTIVITY:
• 5 posts in last week about contract negotiations
• Sales team discussing pricing strategy
• Customer success mentioned implementation challenges

ATTACHED DOCUMENTS:
• Contract_2024.pdf - Standard terms, 2-year commitment
• ROI_Analysis.xlsx - Shows 300% ROI projection
• Implementation_Plan.pdf - 6-month timeline

KEY INSIGHTS:
• High-value account with strong engagement
• Multiple active opportunities indicate growth potential
• Recent activity suggests imminent decision
• Strong relationships across multiple departments

RECOMMENDATIONS:
• Schedule executive review meeting
• Address implementation concerns raised in Chatter
• Follow up on Enterprise License Deal closing timeline
```

---

### 3. 🆕 Standards Comparison & Compliance Validation

**What it does:**

- Compare any content against predefined rules, standards, or criteria
- Validate compliance with organizational policies
- Screen applications, proposals, or documents
- Provide detailed gap analysis and recommendations
- **Automatic comparison** when content is provided via Flow or programmatically
- **Manual comparison** when users need to input content on-demand

**How to configure:**

1. Enable "Comparison" in component settings
2. Define your rules in "Comparison Rules (TO)" field
3. Use JSON format for complex criteria or plain text for simple rules
4. **For automatic comparison**: Set "Compare From (Source)" with content to compare
5. **For manual comparison**: Leave "Compare From" empty to show user input button

**Rule formats:**

**JSON Format (Structured):**

```json
{
  "position": "Senior Salesforce Developer",
  "requirements": {
    "experience": {
      "minimum_years": 5,
      "technologies": ["Salesforce", "Apex", "LWC", "Integration"]
    },
    "education": "Bachelor's degree or equivalent experience",
    "certifications": ["Salesforce Certified", "Platform Developer I"],
    "skills": {
      "technical": ["REST/SOAP APIs", "Data Migration", "CI/CD"],
      "soft": ["Communication", "Problem Solving", "Team Leadership"]
    }
  },
  "preferences": {
    "industry_experience": ["Healthcare", "Financial Services"],
    "additional_certs": ["Platform Developer II", "System Architect"]
  }
}
```

**Plain Text Format (Simple):**

```
Grant Application Requirements:
• Project must serve underserved communities
• Budget cannot exceed $50,000
• Timeline must be 12 months or less
• Must include sustainability plan
• Requires letters of support from community partners
• Detailed budget breakdown required
• Clear measurable outcomes defined
• Previous grant experience preferred
```

**How to use:**

**Manual Comparison (when "Compare From" is empty):**

1. Click "Compare to Standards"
2. Enter or paste content to evaluate:
   - Resume text
   - Proposal content
   - Application details
   - Document excerpts
   - Record data references
3. Click "Compare"
4. Review detailed analysis

**Automatic Comparison (when "Compare From" has content):**

1. Content is automatically compared when component loads
2. Results appear in banner immediately
3. No user input required
4. Perfect for Flow integration or programmatic use

**Example output:**

```
MEETS STANDARDS ✓

Overall Assessment: The application meets most requirements with minor gaps

Detailed Analysis:
✓ EXPERIENCE: MET - 7 years Salesforce development experience
✓ TECHNICAL SKILLS: MET - Apex, LWC, Integration APIs demonstrated
✓ EDUCATION: MET - Bachelor's in Computer Science
⚠ CERTIFICATIONS: PARTIALLY MET - Has Platform Developer I, missing Admin cert
✗ INDUSTRY EXPERIENCE: NOT MET - No healthcare experience mentioned

Strengths:
• Strong technical background with relevant project examples
• Leadership experience managing development teams
• Recent work with complex integrations
• Active in Salesforce community

Gaps/Weaknesses:
• No healthcare industry experience
• Missing Salesforce Admin certification
• Limited mention of CI/CD practices

Improvement Recommendations:
• Highlight any healthcare-adjacent experience
• Mention plans to obtain Admin certification
• Provide examples of deployment and testing practices
```

**Use cases:**

- **HR**: Screen resumes against job requirements
- **Procurement**: Evaluate vendor proposals against RFP criteria
- **Compliance**: Check documents against regulatory standards
- **Quality Assurance**: Validate content against style guides
- **Grant Management**: Assess applications against funding criteria

---

### 4. Anomaly Detection & Alerts

**What it does:**

- Automatically scans records for unusual patterns
- Identifies potential issues or inconsistencies
- Provides real-time alerts when anomalies are detected
- Integrates with document analysis for comprehensive checking

**When it runs:**

- Automatically when component loads (if enabled)
- When model selection changes
- Can include document analysis if PDFs are attached

**What it looks for:**

- Unusual field values or combinations
- Missing required information
- Inconsistent data patterns
- Suspicious activity or changes
- Document content that doesn't match record data

**Example alerts:**

```
⚠️ POTENTIAL ISSUES DETECTED

Document Anomaly: The attached contract shows a different company name
than the Account record. Contract shows "ACME Corp" but Account name
is "ACME Corporation Ltd."

Data Inconsistency: Last activity date is 6 months ago but Opportunity
close date is next week. This may indicate stale data or missed updates.

Missing Information: High-value opportunity ($500K) is missing key
stakeholder contacts and decision maker information.
```

---

### 5. Document Analysis & Data Extraction

**What it does:**

- Process PDF documents attached to records
- Extract structured data and map to Salesforce fields
- Analyze document content for insights
- Integrate with record analysis for complete context

**How to configure:**

1. Enable "Document Analysis"
2. Set "Document Analysis Fields" to comma-separated field API names
3. Component will extract data and suggest field updates

**Example workflow:**

1. Upload invoice PDF to record
2. Click "Analyze Documents"
3. AI extracts: Invoice number, amount, date, vendor
4. Modal shows suggested field mappings
5. User reviews and confirms updates
6. Fields are automatically updated

**Field extraction example:**

```
EXTRACTED DATA FROM DOCUMENTS:

Invoice Number: INV-2024-001
• Current: (empty)
• Suggested: INV-2024-001
• Action: Update field

Invoice Amount: $15,750.00
• Current: $15,000.00
• Suggested: $15,750.00
• Action: Update to match document

Vendor Name: Acme Supplies Inc
• Current: Acme Supplies
• Suggested: Acme Supplies Inc
• Action: Update for consistency
```

---

### 6. Image & Vision Analysis

**What it does:**

- Process images (JPG, PNG, GIF) attached to records
- Extract text using OCR capabilities
- Analyze visual content and diagrams
- Provide structured analysis with suitability assessment

**Two analysis modes:**

**"Analyze Images" button:**

- Processes only image files
- Detailed visual analysis
- Text extraction from images
- Suitability assessment for each image

**"Analyze Record" button:**

- Processes ALL attachments including images
- Combines vision analysis with record data
- Comprehensive document analysis

**Example image analysis:**

```
IMAGE ANALYSIS RESULTS:

📄 Business_Card.jpg
CONTENT ANALYSIS:
• Contact: John Smith, Senior Director
• Company: Acme Corporation
• Phone: (555) 123-4567
• Email: john.smith@acme.com
• Address: 123 Business Ave, Suite 400, City, ST 12345

VISUAL ELEMENTS:
• Professional business card design
• Company logo in top right
• Clean, readable font
• High contrast black text on white background

SUITABILITY ASSESSMENT:
✓ High quality image suitable for contact extraction
✓ All text clearly visible and readable
✓ Professional appearance appropriate for business use
✓ Contains complete contact information
```

---

### 7. Conversation Management

**Features:**

- **Message History**: Maintains up to 50 recent messages
- **Auto-Summarization**: Creates summaries when conversations get long
- **Message Limits**: Prevents memory overflow with intelligent pruning
- **Copy Functions**: Copy individual messages or full responses
- **Expandable View**: Toggle conversation history visibility

**Memory management:**

- Keeps last 50 messages in active memory
- Auto-generates summaries for longer conversations
- Combines recent messages with summary for context
- Displays total message count including archived

---

### 8. Analysis Saving & Field Integration

**What it does:**

- Save AI analysis directly to Salesforce record fields
- Character limit enforcement (600 characters)
- Field validation and permission checking
- Synopsis generation for easy consumption

**How it works:**

1. After analysis, modal appears if field is configured
2. AI generates concise synopsis (under 600 characters)
3. User reviews and can save to designated field
4. Record is automatically refreshed

**Synopsis example:**

```
RECORD SYNOPSIS (487/600 characters):

The record shows a high-value technology account with strong
engagement and multiple active opportunities totaling $750K.
Recent activity indicates imminent Enterprise License decision.
Key relationships established across executive, financial, and
technical stakeholders. Implementation concerns noted in Chatter
require addressing. Recommendation: Schedule executive review
and follow up on contract negotiations timing.
```

---

### 9. Performance & Optimization

**Features:**

- **Caching**: Color calculations, style generation, and record context
- **Memory Management**: Automatic cleanup and cache limits
- **Debounced Inputs**: Prevents excessive API calls
- **Optimized Prompts**: Enhanced for clarity and token efficiency
- **Error Handling**: Graceful failures with user-friendly messages
- **Loading States**: Clear indicators for all async operations

**Technical optimizations:**

- Advanced color caching system
- Memoized expensive operations
- Intelligent conversation pruning
- Optimized DOM scanning
- Modern JavaScript APIs (Clipboard, etc.)

---

### 10. Multi-Model Support

**Supported providers:**

- **OpenAI**: GPT-4, GPT-4-Turbo, GPT-4-Vision
- **Anthropic**: Claude-3, Claude-2
- **Google**: Gemini Pro, Gemini Vision
- **DeepSeek**: DeepSeek-Coder, DeepSeek-Chat
- **OpenRouter**: Various open-source models

**Model selection:**

- Dropdown selector (can be hidden)
- Default model configuration
- Automatic model switching for vision tasks
- Provider-specific optimizations

---

## 🎯 Use Case Examples

### HR: Resume Screening

```json
{
  "position": "Senior Salesforce Developer",
  "must_have": [
    "5+ years Salesforce development",
    "Apex and LWC experience",
    "Integration experience",
    "Bachelor's degree or equivalent"
  ],
  "nice_to_have": [
    "Salesforce certifications",
    "Healthcare industry experience",
    "Team leadership experience"
  ]
}
```

### Procurement: Vendor Evaluation

```json
{
  "rfp_requirements": {
    "budget": "Under $100,000",
    "timeline": "6 months maximum",
    "certifications": ["ISO 9001", "SOC 2"],
    "experience": "5+ years in similar projects",
    "references": "3 recent client references required"
  }
}
```

### Compliance: Document Review

```
Regulatory Compliance Checklist:
• All required signatures present
• Dates within acceptable range
• Dollar amounts match supporting documentation
• Approval workflow completed
• Risk assessment included
• Compliance officer review completed
```

---

## 📋 Deployment Scenarios

### Scenario 1: HR Department - Resume Screening

**Configuration:**

- Enable Comparison: ✓
- Comparison Rules: Job requirements JSON
- Enable Document Analysis: ✓
- Document Analysis Fields: `Resume_Score__c,Skills_Match__c,Experience_Years__c`

**Workflow:**

1. Recruiter uploads resume to candidate record
2. Click "Compare to Standards"
3. Paste resume text or reference attached document
4. Get instant compliance assessment
5. Save analysis to candidate record

### Scenario 2: Procurement - RFP Evaluation

**Configuration:**

- Enable Comparison: ✓
- Comparison Rules (TO): RFP requirements and scoring criteria
- Compare From (Source): (empty for manual comparison)
- Related Objects: `Quote,Contract,Vendor_Reference__c`
- Analysis Field: `Evaluation_Summary__c`

**Workflow:**

1. Upload vendor proposal to opportunity
2. Click "Analyze Record" for comprehensive review
3. Use "Compare to Standards" for specific RFP compliance
4. Save evaluation summary to record
5. Reference in vendor selection process

**Alternative Automated Workflow (using Flow):**

1. Flow extracts proposal content to text variable
2. Sets "Compare From" field with proposal content
3. Component automatically compares against RFP rules
4. Results appear in banner without user input

### Scenario 3: Sales - Deal Analysis

**Configuration:**

- Enable Anomaly Detection: ✓
- Related Objects: `Contact,OpportunityLineItem,Quote`
- Analysis Field: `Deal_Assessment__c`
- Enable Document Analysis: ✓

**Workflow:**

1. Component automatically flags unusual deal patterns
2. "Analyze Record" provides comprehensive deal overview
3. Process attached contracts and proposals
4. Save deal assessment for management review

### Scenario 4: Compliance - Document Review

**Configuration:**

- Enable Comparison: ✓
- Comparison Rules (TO): Regulatory requirements checklist
- Compare From (Source): (empty for manual, or set via Flow for automatic)
- Enable Document Analysis: ✓
- Document Analysis Fields: `Compliance_Status__c,Review_Date__c`

**Manual Workflow:**

1. Upload compliance documents to record
2. "Compare to Standards" against regulatory requirements
3. Extract key data to compliance fields
4. Generate compliance summary for auditors

**Automated Flow Workflow:**

1. Flow processes uploaded documents
2. Extracts document content to text variable
3. Sets "Compare From" with extracted content
4. Component automatically validates against regulatory rules
5. Banner shows immediate compliance status

## Technical Details

### Component Structure

- **LWC Component**: `llmAssistant`
- **Apex Controller**: `LLMController.cls`
- **Component Configuration**: 15+ configurable properties
- **Multi-Provider Support**: OpenAI, Anthropic, Google, DeepSeek, OpenRouter
- **Custom Metadata**: LLM_Configuration\_\_mdt for provider settings

### Core Architecture

**Frontend (LWC):**

- Modern JavaScript with ES6+ features
- Advanced caching and memory management
- Responsive design with Apple-inspired UI
- Real-time conversation management
- Optimized DOM manipulation

**Backend (Apex):**

- Comprehensive record analysis engine
- Multi-provider API integration
- Document processing and Vision API support
- Field extraction and data mapping
- Anomaly detection algorithms
- Standards comparison engine

### Advanced Features Implementation

**Standards Comparison:**

- JSON and plain text rule parsing
- Structured comparison prompts
- Detailed gap analysis generation
- Compliance scoring and recommendations

**Document Analysis:**

- PDF to base64 conversion
- Vision API integration for all document types
- Field mapping and extraction
- Data validation and suggestion system

**Anomaly Detection:**

- Real-time pattern analysis
- Historical data comparison
- Document consistency checking
- Automated alert generation

**Performance Optimizations:**

- Color calculation caching
- Conversation history pruning
- Debounced input handling
- Intelligent content truncation
- Memory leak prevention

### Security Considerations

- **API Security**: Named Credentials for secure API key storage
- **Data Privacy**: Salesforce security model compliance
- **Field-Level Security**: Respects user permissions and sharing rules
- **Document Processing**: Secure base64 encoding with size limits
- **Error Handling**: No sensitive data in error messages
- **Cache Management**: Automatic cleanup of sensitive cached data

## Troubleshooting

### Common Issues

#### 1. **Model Not Available**

**Symptoms:** "Model not found" or connection errors
**Solutions:**

- Verify API credentials in Named Credentials
- Check usage limits with AI provider
- Ensure network connectivity to AI service
- Confirm LLM_Configuration\_\_mdt records are properly set up

#### 2. **Comparison Feature Not Working**

**Symptoms:** "Compare to Standards" button not visible or auto-comparison not running
**Solutions:**

- Verify "Enable Comparison" is checked in component settings
- Ensure "Comparison Rules (TO)" field is not empty
- Check that rules are in valid JSON format (if using JSON)
- For manual comparison: ensure "Compare From (Source)" is empty
- For automatic comparison: ensure "Compare From (Source)" has content
- Confirm user has access to the component and related data

#### 3. **Document Analysis Failures**

**Symptoms:** PDF processing errors or incomplete extraction
**Solutions:**

- Ensure documents are under 3MB size limit
- Check file format is supported (PDF, JPG, PNG, GIF)
- Verify OpenAI Vision API configuration
- Confirm documents are properly attached to record

#### 4. **Anomaly Detection Not Running**

**Symptoms:** No alerts or banner appearing
**Solutions:**

- Verify "Enable Anomaly Detection" is checked
- Ensure component is on a record page with data
- Check that selected LLM model is properly configured
- Confirm user has read access to record and related data

#### 5. **Performance Issues**

**Symptoms:** Slow response times or timeouts
**Solutions:**

- Limit "Related Objects" to essential objects only
- Reduce number of PDF documents (max 3 recommended)
- Use more specific prompts for complex questions
- Consider using faster models for simple operations

#### 6. **Field Saving Issues**

**Symptoms:** Cannot save analysis to record field
**Solutions:**

- Verify "Analysis Field API Name" is correct
- Check user has edit permissions on the field
- Ensure field exists on the current object
- Confirm field can accept the data type being saved

#### 7. **Memory or Browser Issues**

**Symptoms:** Component becomes unresponsive
**Solutions:**

- Refresh the page to clear component cache
- Check browser console for JavaScript errors
- Clear browser cache and cookies
- Try in incognito/private browsing mode

### Performance Optimization Tips

1. **Optimize Related Objects**: Only include necessary related objects
2. **Limit Document Size**: Keep attachments under 1MB when possible
3. **Use Specific Prompts**: More targeted questions get faster responses
4. **Regular Cache Cleanup**: Component automatically manages cache
5. **Monitor Usage**: Track AI provider usage to avoid rate limits

### Best Practices

#### For Standards Comparison:

- Keep rules specific and measurable
- Use JSON for complex multi-criteria evaluations
- Test rules with sample content first
- Update rules based on feedback and results

#### For Document Analysis:

- Upload clear, high-resolution documents
- Ensure text is readable and well-contrasted
- Limit to essential documents for analysis
- Use consistent document formats when possible

#### For Anomaly Detection:

- Configure related objects thoughtfully
- Review alerts regularly to tune sensitivity
- Train users on interpreting anomaly results
- Establish workflows for alert follow-up

## Contributing

We welcome contributions to enhance the NuviAI Assistant component. Please submit pull requests with detailed descriptions of your changes.

## License

This component is available under the MIT License. See LICENSE.md for details.

---

_Developed by Nuvitek - Transforming business through innovative Salesforce solutions._
