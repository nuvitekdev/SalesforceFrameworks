# Dynamic Survey Creator Utility Component - Comprehensive Technical Documentation

## Table of Contents

1. [Component Architecture Overview](#component-architecture-overview)
2. [Technical Implementation Details](#technical-implementation-details)
3. [API Reference](#api-reference)
4. [LWC Component Documentation](#lwc-component-documentation)
5. [Configuration Guide](#configuration-guide)
6. [Usage Examples](#usage-examples)
7. [Security Considerations](#security-considerations)
8. [Integration Patterns](#integration-patterns)
9. [Troubleshooting Guide](#troubleshooting-guide)
10. [Performance Optimization](#performance-optimization)

## Component Architecture Overview

### Purpose and Business Value

The Dynamic Survey Creator utility component provides a comprehensive survey management platform for Salesforce, featuring:

- **Drag-and-Drop Survey Builder**: Visual interface for creating complex surveys
- **Multi-Step Question Types**: Support for text, multiple choice, rating scales, and more
- **Email Distribution System**: Automated survey invitations with unique response links
- **Response Analytics**: Real-time response tracking and analysis
- **Public Portal Integration**: Secure survey responses via Experience Cloud
- **Passcode Protection**: Optional security for sensitive surveys

### Component Structure

```
dynamicSurveyCreator/
├── classes/                              # Apex Backend Services
│   ├── SurveyController.cls             # Internal survey management
│   └── SurveyPublicController.cls       # Public portal access (without sharing)
├── lwc/                                  # Lightning Web Components
│   ├── surveyCreator/                   # Survey builder interface
│   │   ├── surveyCreator.js            # Main creation logic
│   │   ├── surveyCreator.html          # Builder template
│   │   └── surveyCreator.css           # Styling
│   └── surveyResponder/                 # Public response interface
│       ├── surveyResponder.js          # Response collection logic
│       ├── surveyResponder.html        # Response template
│       └── surveyResponder.css         # Response styling
└── objects/                             # Custom Objects
    ├── Survey__c/                       # Main survey records
    ├── Question__c/                     # Individual questions
    ├── Answer_Option__c/                # Multiple choice options
    ├── Survey_Response__c/              # Response tracking
    └── Question_Response__c/            # Individual answers
```

### Data Model Architecture

#### Core Objects Relationships

```
Survey__c (Parent)
├── Question__c (Children)
│   └── Answer_Option__c (Grandchildren)
└── Survey_Response__c (Children)
    └── Question_Response__c (Grandchildren)
```

#### Key Fields Structure

**Survey__c Fields:**
- `Name`: Survey title
- `Description__c`: Survey purpose description
- `Welcome_Message__c`: Introduction text for respondents
- `Thank_You_Message__c`: Completion confirmation text
- `Is_Active__c`: Publication status
- `Require_Passcode__c`: Security setting

**Question__c Fields:**
- `Survey__c`: Lookup to parent survey
- `Question_Text__c`: Question content
- `Type__c`: Question type (Text, Multiple Choice, Rating, etc.)
- `Order__c`: Display sequence
- `Is_Required__c`: Mandatory response flag

### Design Patterns

- **Multi-Step Wizard Pattern**: Step-by-step survey creation workflow
- **Builder Pattern**: Dynamic question and option creation
- **Public Guest Access Pattern**: Secure anonymous response collection
- **Email Template Pattern**: Automated invitation distribution
- **Analytics Dashboard Pattern**: Response data visualization

## Technical Implementation Details

### Core Technologies

- **Lightning Web Components (LWC)**: Modern JavaScript framework
- **Apex Controllers**: Secure server-side processing with sharing controls
- **Custom Objects**: Flexible data model for survey structures
- **Email Services**: Salesforce Messaging API integration
- **Community Portal**: Experience Cloud integration for public access
- **Crypto Services**: Secure ID and passcode generation

### Survey Creation Workflow

#### 5-Step Creation Process
1. **Survey Details**: Basic information and settings
2. **Question Builder**: Add and configure questions
3. **Preview**: Review complete survey structure
4. **Distribution**: Send invitations to recipients
5. **Analytics**: Monitor responses and analyze results

#### Question Types Supported
- **Text**: Single-line text input
- **Textarea**: Multi-line text input
- **Multiple Choice**: Single selection radio buttons
- **Checkbox**: Multi-selection checkboxes
- **Rating Scale**: Numerical rating systems
- **Date**: Date picker inputs
- **Email**: Email validation inputs
- **Number**: Numeric inputs with validation

### Security Architecture

#### Internal vs Public Controllers
```apex
// Internal operations (with sharing)
public with sharing class SurveyController {
    // Survey management for authenticated users
}

// Public operations (without sharing)
public without sharing class SurveyPublicController {
    // Guest user response collection
    // Carefully controlled data access
}
```

#### Passcode System
- Optional 6-digit passcode per response
- Cryptographically generated using `Crypto.getRandomInteger()`
- Validated server-side before survey access
- Included in email invitations

#### Unique Response Tracking
- Cryptographic unique IDs using `Crypto.generateAesKey(128)`
- URL-safe response identification
- One-time use response records
- Status tracking (Not Started, In Progress, Completed)

## API Reference

### SurveyController (Internal - With Sharing)

#### saveSurvey(surveyJson)
```apex
@AuraEnabled
public static Id saveSurvey(String surveyJson)
```

**Purpose**: Saves complete survey structure including questions and answer options

**Parameters**:
- `surveyJson` (String): JSON representation of survey data structure

**Input JSON Structure**:
```json
{
  "survey": {
    "Id": "optional_existing_id",
    "Name": "Customer Satisfaction Survey",
    "Description__c": "Quarterly feedback collection",
    "Welcome_Message__c": "Thank you for participating",
    "Thank_You_Message__c": "Your feedback is valuable",
    "Is_Active__c": true,
    "Require_Passcode__c": false
  },
  "questions": [
    {
      "Id": "optional_existing_id",
      "questionText": "How would you rate our service?",
      "type": "Multiple Choice",
      "displayOrder": 1,
      "isRequired": true,
      "answerOptions": [
        {
          "Id": "optional_existing_id",
          "optionText": "Excellent",
          "displayOrder": 1
        },
        {
          "optionText": "Good",
          "displayOrder": 2
        }
      ]
    }
  ]
}
```

**Returns**: `Id` of the saved Survey__c record

**Features**:
- Transactional integrity with savepoints
- Comprehensive validation and error handling
- Support for both new surveys and updates
- Bulk DML operations for performance
- Detailed error logging and user-friendly messages

#### createAndSendResponses(surveyId, recipientEmails, publicSiteUrl)
```apex
@AuraEnabled
public static Integer createAndSendResponses(
    Id surveyId,
    List<String> recipientEmails,
    String publicSiteUrl
)
```

**Purpose**: Creates individual response records and sends personalized email invitations

**Parameters**:
- `surveyId` (Id): Survey to distribute
- `recipientEmails` (List<String>): Email addresses of recipients
- `publicSiteUrl` (String): Base URL for Experience Cloud site

**Process Flow**:
1. Validates survey is active and accessible
2. Creates unique `Survey_Response__c` records for each recipient
3. Generates cryptographic unique IDs and passcodes
4. Constructs personalized survey URLs
5. Sends HTML email invitations
6. Returns count of successful email sends

**Email Template Features**:
- Professional HTML formatting with inline styles
- Responsive design for mobile devices
- Unique survey links per recipient
- Passcode display (if required)
- Fallback plain text link
- Corporate branding elements

#### getUserSurveys()
```apex
@AuraEnabled(cacheable=true)
public static List<SurveyWithStats> getUserSurveys()
```

**Purpose**: Retrieves all surveys created by the current user with response statistics

**Returns**: List of `SurveyWithStats` objects containing:
```json
[
  {
    "survey": {
      "Id": "a001234567890ABC",
      "Name": "Employee Feedback Survey",
      "Description__c": "Annual employee satisfaction",
      "CreatedDate": "2024-01-15T10:30:00.000Z",
      "Is_Active__c": true
    },
    "responseCount": 47
  }
]
```

#### getSurveyResponses(surveyId)
```apex
@AuraEnabled(cacheable=true)
public static SurveyResponseData getSurveyResponses(Id surveyId)
```

**Purpose**: Retrieves detailed response data for analytics

**Security**: Only returns surveys owned by current user

**Returns**: Complete survey structure with all completed responses

### SurveyPublicController (Public - Without Sharing)

#### getSurveyById(surveyId)
```apex
@AuraEnabled(cacheable=true)
public static SurveyWrapper getSurveyById(String surveyId)
```

**Purpose**: Direct survey access for public use (without pre-created response)

**Security Features**:
- Only returns active surveys
- No user authentication required
- Limited to essential survey data
- No access to response statistics

#### getSurveyByResponseId(responseId, passcode)
```apex
@AuraEnabled(cacheable=true)
public static SurveyWrapper getSurveyByResponseId(String responseId, String passcode)
```

**Purpose**: Retrieves survey using unique response ID with passcode validation

**Parameters**:
- `responseId` (String): Unique response identifier from email link
- `passcode` (String): Security passcode (if required)

**Validation Process**:
1. Validates response ID exists and survey is active
2. Checks passcode requirement and validates if needed
3. Returns survey structure with response tracking ID
4. Enables progress tracking and completion

#### validatePasscode(responseId, passcode)
```apex
@AuraEnabled
public static Boolean validatePasscode(String responseId, String passcode)
```

**Purpose**: Server-side passcode validation for enhanced security

#### submitSurveyResponse(responseId, responseDataJson, surveyId)
```apex
@AuraEnabled
public static String submitSurveyResponse(
    Id responseId,
    String responseDataJson,
    String surveyId
)
```

**Purpose**: Processes and saves survey responses

**Parameters**:
- `responseId` (Id): Survey response record ID (null for direct access)
- `responseDataJson` (String): JSON of answers keyed by Question__c IDs
- `surveyId` (String): Survey ID for direct access scenarios

**Response Data Format**:
```json
{
  "a011234567890ABC": "Excellent service",
  "a011234567890DEF": ["Option 1", "Option 3"],
  "a011234567890GHI": "5"
}
```

**Processing Features**:
- Handles multi-select responses (arrays)
- Upserts question responses for partial completion support
- Updates response status and completion timestamp
- Comprehensive error handling and validation

### Wrapper Classes

#### SurveyDataWrapper
```apex
public class SurveyDataWrapper {
    @AuraEnabled public Survey__c survey { get; set; }
    @AuraEnabled public List<QuestionDataWrapper> questions { get; set; }
}
```

#### QuestionDataWrapper
```apex
public class QuestionDataWrapper {
    @AuraEnabled public String Id { get; set; }
    @AuraEnabled public String questionText { get; set; }
    @AuraEnabled public String type { get; set; }
    @AuraEnabled public Integer displayOrder { get; set; }
    @AuraEnabled public Boolean isRequired { get; set; }
    @AuraEnabled public List<AnswerOptionWrapper> answerOptions { get; set; }
}
```

#### SurveyWrapper (Public Controller)
```apex
public class SurveyWrapper {
    @AuraEnabled public Survey__c survey { get; set; }
    @AuraEnabled public List<Question__c> questions { get; set; }
    @AuraEnabled public Id responseId { get; set; }
    @AuraEnabled public Boolean requiresPasscode { get; set; }
}
```

## LWC Component Documentation

### SurveyCreator Component

#### Public API Properties

```javascript
// Required Configuration
@api publicSiteUrl;              // Experience Cloud base URL

// Theming Properties
@api primaryColor = "#22BDC1";   // Primary brand color
@api accentColor = "#D5DF23";    // Accent color
@api textColor = "#1d1d1f";      // Text color
@api backgroundColor = "#ffffff"; // Background color
```

#### Core State Management

```javascript
// Workflow State
@track currentStep = 1;          // Wizard step (1-5)
@track isLoading = false;        // Loading indicator
@track error = null;             // Error state

// Survey Data
@track survey = {                // Main survey record
    Name: "",
    Description__c: "",
    Welcome_Message__c: "",
    Thank_You_Message__c: "",
    Is_Active__c: false,
    Require_Passcode__c: false
};

@track questions = [];           // Question collection
@track recipients = [];          // Email distribution list

// Management Features
@track savedSurveys = [];        // User's survey list
@track selectedSurveyResponses = []; // Analytics data
```

#### Key Methods

##### Survey Management
```javascript
// Save survey structure
async handleSaveSurvey() {
    try {
        this.isLoading = true;
        const surveyData = this.prepareSurveyData();
        const surveyId = await saveSurvey({ surveyJson: JSON.stringify(surveyData) });
        this.survey.Id = surveyId;
        this.showSuccess('Survey saved successfully!');
    } catch (error) {
        this.handleError('Save failed', error);
    } finally {
        this.isLoading = false;
    }
}

// Prepare data structure for Apex
prepareSurveyData() {
    return {
        survey: this.survey,
        questions: this.questions.map(q => ({
            Id: q.Id,
            questionText: q.questionText,
            type: q.type,
            displayOrder: q.displayOrder,
            isRequired: q.isRequired,
            answerOptions: q.answerOptions || []
        }))
    };
}
```

##### Question Builder
```javascript
// Add new question
handleAddQuestion() {
    const newQuestion = {
        tempId: this.generateTempId(),
        questionText: '',
        type: 'Text',
        displayOrder: this.questions.length + 1,
        isRequired: false,
        answerOptions: []
    };
    this.questions = [...this.questions, newQuestion];
}

// Update question properties
handleQuestionChange(event) {
    const questionIndex = parseInt(event.target.dataset.index, 10);
    const field = event.target.dataset.field;
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    
    this.questions[questionIndex][field] = value;
    this.questions = [...this.questions]; // Trigger reactivity
}

// Add answer option to multiple choice questions
handleAddOption(event) {
    const questionIndex = parseInt(event.target.dataset.index, 10);
    const newOption = {
        tempId: this.generateTempId(),
        optionText: '',
        displayOrder: this.questions[questionIndex].answerOptions.length + 1
    };
    
    this.questions[questionIndex].answerOptions.push(newOption);
    this.questions = [...this.questions];
}
```

##### Distribution System
```javascript
// Send survey invitations
async handleSendSurvey() {
    if (!this.validateDistribution()) return;
    
    try {
        this.isLoading = true;
        const emailList = this.recipients.map(r => r.email);
        
        const successCount = await createAndSendResponses({
            surveyId: this.survey.Id,
            recipientEmails: emailList,
            publicSiteUrl: this.publicSiteUrl
        });
        
        this.showSuccess(`Survey sent to ${successCount} recipients`);
        this.currentStep = 5; // Move to analytics
        
    } catch (error) {
        this.handleError('Failed to send survey', error);
    } finally {
        this.isLoading = false;
    }
}

// Validate distribution requirements
validateDistribution() {
    if (!this.survey.Id) {
        this.showError('Please save the survey first');
        return false;
    }
    
    if (!this.publicSiteUrl) {
        this.showError('Public site URL is required for distribution');
        return false;
    }
    
    if (this.recipients.length === 0) {
        this.showError('Please add at least one recipient');
        return false;
    }
    
    return true;
}
```

##### Analytics and Management
```javascript
// Load user's surveys for management
async loadUserSurveys() {
    try {
        this.savedSurveys = await getUserSurveys();
    } catch (error) {
        console.error('Error loading surveys:', error);
    }
}

// View survey responses
async viewSurveyResponses(surveyId) {
    try {
        this.isLoading = true;
        const responseData = await getSurveyResponses({ surveyId });
        this.selectedSurveyResponses = responseData.responses;
        this.showResponseModal = true;
    } catch (error) {
        this.handleError('Failed to load responses', error);
    } finally {
        this.isLoading = false;
    }
}
```

#### Event Handling

```javascript
// Step navigation
handleNext() {
    if (this.validateCurrentStep()) {
        this.currentStep = Math.min(this.currentStep + 1, 5);
    }
}

handlePrevious() {
    this.currentStep = Math.max(this.currentStep - 1, 1);
}

// Form validation
validateCurrentStep() {
    switch (this.currentStep) {
        case 1:
            return this.validateSurveyDetails();
        case 2:
            return this.validateQuestions();
        case 4:
            return this.validateDistribution();
        default:
            return true;
    }
}

// Email recipient management
handleAddRecipient() {
    const emailInput = this.template.querySelector('[data-id="email-input"]');
    const email = emailInput.value.trim();
    
    if (this.isValidEmail(email) && !this.recipients.some(r => r.email === email)) {
        this.recipients = [...this.recipients, {
            id: this.generateTempId(),
            email: email
        }];
        emailInput.value = '';
    }
}

handleRemoveRecipient(event) {
    const recipientId = event.target.dataset.id;
    this.recipients = this.recipients.filter(r => r.id !== recipientId);
}
```

### SurveyResponder Component

#### Public API Properties

```javascript
// Required for public access
@api surveyId;                   // Direct survey access
@api responseId;                 // Response tracking ID

// Theming
@api primaryColor = "#22BDC1";
@api accentColor = "#D5DF23";
@api textColor = "#1d1d1f";
@api backgroundColor = "#ffffff";
```

#### Core Functionality

```javascript
// Survey loading with passcode validation
async loadSurvey() {
    try {
        this.isLoading = true;
        
        let surveyData;
        if (this.responseId) {
            // Load via response ID with passcode
            surveyData = await getSurveyByResponseId({
                responseId: this.responseId,
                passcode: this.passcode
            });
        } else {
            // Direct access by survey ID
            surveyData = await getSurveyById({
                surveyId: this.surveyId
            });
        }
        
        this.survey = surveyData.survey;
        this.questions = surveyData.questions;
        this.requiresPasscode = surveyData.requiresPasscode;
        
    } catch (error) {
        this.handleError('Failed to load survey', error);
    } finally {
        this.isLoading = false;
    }
}

// Response submission
async handleSubmit() {
    if (!this.validateResponses()) return;
    
    try {
        this.isSubmitting = true;
        const responseData = this.prepareResponseData();
        
        const result = await submitSurveyResponse({
            responseId: this.responseId,
            responseDataJson: JSON.stringify(responseData),
            surveyId: this.surveyId
        });
        
        this.showThankYou = true;
        this.showSuccess(result);
        
    } catch (error) {
        this.handleError('Failed to submit response', error);
    } finally {
        this.isSubmitting = false;
    }
}

// Response data preparation
prepareResponseData() {
    const responseData = {};
    
    this.questions.forEach(question => {
        const response = this.responses[question.Id];
        if (response !== undefined && response !== null && response !== '') {
            responseData[question.Id] = response;
        }
    });
    
    return responseData;
}
```

#### Question Type Handlers

```javascript
// Text input handler
handleTextResponse(event) {
    const questionId = event.target.dataset.questionId;
    this.responses[questionId] = event.target.value;
}

// Multiple choice handler
handleRadioResponse(event) {
    const questionId = event.target.dataset.questionId;
    this.responses[questionId] = event.target.value;
}

// Checkbox handler
handleCheckboxResponse(event) {
    const questionId = event.target.dataset.questionId;
    
    if (!this.responses[questionId]) {
        this.responses[questionId] = [];
    }
    
    const value = event.target.value;
    const isChecked = event.target.checked;
    
    if (isChecked) {
        this.responses[questionId].push(value);
    } else {
        this.responses[questionId] = this.responses[questionId].filter(v => v !== value);
    }
}

// Rating scale handler
handleRatingResponse(event) {
    const questionId = event.target.dataset.questionId;
    const rating = parseInt(event.target.value, 10);
    this.responses[questionId] = rating;
}
```

#### Computed Properties

```javascript
// Progress tracking
get completionPercentage() {
    const totalQuestions = this.questions.length;
    const answeredQuestions = Object.keys(this.responses).length;
    return totalQuestions > 0 ? Math.round((answeredQuestions / totalQuestions) * 100) : 0;
}

// Validation helpers
get requiredQuestionsAnswered() {
    return this.questions.every(question => {
        if (!question.Is_Required__c) return true;
        const response = this.responses[question.Id];
        return response !== undefined && response !== null && response !== '';
    });
}

get canSubmit() {
    return this.requiredQuestionsAnswered && !this.isSubmitting;
}
```

## Configuration Guide

### Basic Setup

#### Lightning App Builder Configuration
```xml
<!-- Lightning Page Component -->
<component name="c:surveyCreator">
    <property name="publicSiteUrl" value="https://yourdomain.my.site.com/surveys" />
    <property name="primaryColor" value="#1589EE" />
    <property name="accentColor" value="#FFB75D" />
</component>
```

#### Experience Cloud Setup

1. **Create Public Site**:
   - Setup → Digital Experiences → All Sites
   - Create new site for survey responses
   - Configure guest user permissions

2. **Deploy SurveyResponder Component**:
   ```xml
   <!-- Experience Builder Page -->
   <component name="c:surveyResponder">
       <property name="primaryColor" value="#1589EE" />
       <property name="backgroundColor" value="#f8f9fa" />
   </component>
   ```

3. **URL Structure**:
   ```
   https://yourdomain.my.site.com/surveys/s/survey?responseId={uniqueId}
   ```

### Guest User Profile Configuration

#### Required Object Permissions
```xml
<objectPermissions>
    <allowCreate>false</allowCreate>
    <allowDelete>false</allowDelete>
    <allowEdit>false</allowEdit>
    <allowRead>true</allowRead>
    <object>Survey__c</object>
    <viewAllRecords>false</viewAllRecords>
</objectPermissions>

<objectPermissions>
    <allowCreate>true</allowCreate>
    <allowDelete>false</allowDelete>
    <allowEdit>true</allowEdit>
    <allowRead>true</allowRead>
    <object>Survey_Response__c</object>
    <viewAllRecords>false</viewAllRecords>
</objectPermissions>
```

#### Required Apex Class Access
```xml
<classAccesses>
    <apexClass>SurveyPublicController</apexClass>
    <enabled>true</enabled>
</classAccesses>
```

### Email Template Customization

#### Custom HTML Template
```apex
private static String createEmailHtmlBody(String surveyName, String surveyLink, String passcode) {
    String htmlBody = '<!DOCTYPE html><html><head>' +
        '<meta name="viewport" content="width=device-width, initial-scale=1.0">' +
        '</head><body style="font-family: Arial, sans-serif; margin: 0; padding: 20px;">' +
        '<div style="max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #e0e0e0;">' +
        '    <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center;">' +
        '        <h1 style="margin: 0; font-size: 28px;">Survey Invitation</h1>' +
        '        <p style="margin: 10px 0 0 0; font-size: 18px;">' + surveyName + '</p>' +
        '    </div>' +
        '    <div style="padding: 40px 30px;">' +
        '        <p style="font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">Dear Participant,</p>' +
        '        <p style="font-size: 16px; line-height: 1.6;">We value your feedback and would appreciate if you could take a few minutes to complete our survey.</p>';
    
    if (String.isNotBlank(passcode)) {
        htmlBody += '        <div style="background: #f8f9fa; border-left: 4px solid #007bff; padding: 20px; margin: 20px 0;">' +
            '            <p style="margin: 0; font-weight: bold; color: #007bff;">Your Survey Passcode: ' + passcode + '</p>' +
            '        </div>';
    }
    
    htmlBody += '        <div style="text-align: center; margin: 40px 0;">' +
        '            <a href="' + surveyLink + '" style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-size: 16px; font-weight: bold; display: inline-block;">Take Survey</a>' +
        '        </div>' +
        '        <p style="font-size: 14px; color: #666; text-align: center;">Thank you for your time and valuable feedback.</p>' +
        '    </div>' +
        '</div></body></html>';
    
    return htmlBody;
}
```

### Advanced Configuration

#### Custom Question Types
```javascript
// Extend question types in surveyCreator.js
get questionTypes() {
    return [
        { label: 'Text', value: 'Text' },
        { label: 'Textarea', value: 'Textarea' },
        { label: 'Multiple Choice', value: 'Multiple Choice' },
        { label: 'Checkbox', value: 'Checkbox' },
        { label: 'Rating Scale', value: 'Rating' },
        { label: 'Date', value: 'Date' },
        { label: 'Email', value: 'Email' },
        { label: 'Number', value: 'Number' },
        { label: 'File Upload', value: 'File' },        // Custom type
        { label: 'Signature', value: 'Signature' }       // Custom type
    ];
}
```

#### Branding Configuration
```css
/* Custom CSS for corporate branding */
.survey-container {
    --primary-color: var(--lwc-colorBrandPrimary, #1589EE);
    --accent-color: var(--lwc-colorBrandSecondary, #FFB75D);
    --text-color: var(--lwc-colorTextDefault, #181818);
    --background-color: var(--lwc-colorBackgroundAlt, #fafaf9);
    --border-radius: 8px;
    --shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.survey-header {
    background: linear-gradient(135deg, var(--primary-color), var(--accent-color));
    color: white;
    padding: 2rem;
    border-radius: var(--border-radius) var(--border-radius) 0 0;
}

.question-card {
    background: var(--background-color);
    border: 1px solid #e5e5e5;
    border-radius: var(--border-radius);
    box-shadow: var(--shadow);
    margin-bottom: 1.5rem;
    padding: 1.5rem;
}
```

## Usage Examples

### Internal Survey Creation

#### Employee Feedback Survey
```html
<!-- Lightning App Builder -->
<c-survey-creator 
    public-site-url="https://company.my.site.com/feedback"
    primary-color="#003366"
    accent-color="#0066CC"
    text-color="#333333">
</c-survey-creator>
```

#### Customer Satisfaction Survey
```javascript
// Programmatic configuration
const surveyConfig = {
    publicSiteUrl: 'https://company.my.site.com/customer-feedback',
    survey: {
        Name: 'Q4 Customer Satisfaction Survey',
        Description__c: 'Annual customer experience feedback collection',
        Welcome_Message__c: 'Thank you for being a valued customer. Your feedback helps us improve our services.',
        Thank_You_Message__c: 'Thank you for your time. Your feedback is important to us.',
        Is_Active__c: true,
        Require_Passcode__c: true
    },
    questions: [
        {
            questionText: 'How would you rate your overall experience?',
            type: 'Rating',
            isRequired: true,
            displayOrder: 1
        },
        {
            questionText: 'What could we improve?',
            type: 'Textarea',
            isRequired: false,
            displayOrder: 2
        }
    ]
};
```

### Public Survey Response

#### Anonymous Survey Access
```html
<!-- Experience Builder Page -->
<c-survey-responder
    survey-id="a00XX000004L9bYQAS"
    primary-color="#22BDC1"
    accent-color="#D5DF23">
</c-survey-responder>
```

#### Secure Response with Passcode
```html
<!-- URL with response tracking -->
<c-survey-responder
    response-id="unique-response-id-12345"
    primary-color="#1589EE">
</c-survey-responder>
```

### Integration with Flows

#### Survey Creation Flow
```xml
<!-- Screen Flow Integration -->
<component name="c:surveyCreator">
    <property name="publicSiteUrl" value="{!PublicSiteURL}" />
    <property name="primaryColor" value="{!BrandPrimaryColor}" />
</component>
```

#### Post-Survey Actions
```javascript
// Custom event handling after survey completion
handleSurveyCompleted(event) {
    const surveyData = event.detail;
    
    // Trigger follow-up actions
    this.createCaseFromFeedback(surveyData);
    this.sendThankYouEmail(surveyData.recipientEmail);
    this.updateCustomerRecord(surveyData);
}
```

### Automated Survey Distribution

#### Scheduled Survey Sending
```apex
// Scheduled class for periodic surveys
public class WeeklySurveyScheduler implements Schedulable {
    public void execute(SchedulableContext SC) {
        // Get active customers
        List<Contact> customers = [
            SELECT Email 
            FROM Contact 
            WHERE Customer_Status__c = 'Active' 
            AND Email != null
        ];
        
        // Send weekly satisfaction survey
        List<String> emails = new List<String>();
        for (Contact c : customers) {
            emails.add(c.Email);
        }
        
        SurveyController.createAndSendResponses(
            'a00XX000004L9bYQAS', // Weekly survey ID
            emails,
            'https://company.my.site.com/feedback'
        );
    }
}
```

#### Event-Driven Survey Distribution
```apex
// Trigger-based survey sending
trigger AccountTrigger on Account (after update) {
    List<String> customerEmails = new List<String>();
    
    for (Account acc : Trigger.new) {
        Account oldAcc = Trigger.oldMap.get(acc.Id);
        
        // Send survey after deal closure
        if (acc.Stage__c == 'Closed Won' && oldAcc.Stage__c != 'Closed Won') {
            if (String.isNotBlank(acc.CustomerEmail__c)) {
                customerEmails.add(acc.CustomerEmail__c);
            }
        }
    }
    
    if (!customerEmails.isEmpty()) {
        SurveyController.createAndSendResponses(
            'a00XX000004L9cZQAS', // Post-sale survey ID
            customerEmails,
            System.Label.Survey_Public_URL
        );
    }
}
```

## Security Considerations

### Data Protection

#### Sensitive Information Handling
```apex
// No PII in debug logs
private static void logSurveyActivity(String action, Id surveyId, Integer recipientCount) {
    System.debug(LoggingLevel.INFO, 
        'Survey Action: ' + action + 
        ' | Survey ID: ' + surveyId + 
        ' | Recipients: ' + recipientCount
    );
    // Never log email addresses or response content
}
```

#### Response Data Encryption
```apex
// Optional encryption for sensitive responses
private static String encryptSensitiveResponse(String responseText) {
    if (isSensitiveContent(responseText)) {
        Blob key = Crypto.generateAesKey(256);
        Blob encryptedData = Crypto.encryptWithManagedIV('AES256', key, Blob.valueOf(responseText));
        return EncodingUtil.base64Encode(encryptedData);
    }
    return responseText;
}
```

### Access Control Implementation

#### Guest User Restrictions
```apex
// Controlled access in SurveyPublicController
public without sharing class SurveyPublicController {
    
    // Only allow access to active surveys
    private static Boolean isSurveyAccessible(Id surveyId) {
        List<Survey__c> surveys = [
            SELECT Is_Active__c 
            FROM Survey__c 
            WHERE Id = :surveyId 
            AND Is_Active__c = TRUE
        ];
        return !surveys.isEmpty();
    }
    
    // Rate limiting for guest users
    private static void validateGuestAccess() {
        // Implement rate limiting logic
        // Check for suspicious activity patterns
    }
}
```

#### CSRF Protection
```javascript
// CSRF token validation in LWC
import { getCurrentPageReference } from 'lightning/navigation';

export default class SurveyResponder extends LightningElement {
    connectedCallback() {
        this.pageRef = getCurrentPageReference();
        this.validatePageReference();
    }
    
    validatePageReference() {
        // Validate page context for security
        if (!this.pageRef || !this.isValidReferrer()) {
            this.showError('Invalid access');
            return;
        }
    }
}
```

### Passcode Security

#### Strong Passcode Generation
```apex
private static String generatePasscode() {
    // Use cryptographically secure random number generation
    Integer randomNumber = Math.abs(Crypto.getRandomInteger());
    
    // Ensure 6-digit format
    String passcode = String.valueOf(randomNumber).substring(0, 6);
    while (passcode.length() < 6) {
        passcode = '0' + passcode;
    }
    
    // Avoid easily guessed patterns
    if (isWeakPasscode(passcode)) {
        return generatePasscode(); // Regenerate
    }
    
    return passcode;
}

private static Boolean isWeakPasscode(String passcode) {
    // Check for patterns like 111111, 123456, etc.
    Set<String> weakPatterns = new Set<String>{
        '000000', '111111', '123456', '654321', '000001'
    };
    return weakPatterns.contains(passcode);
}
```

## Integration Patterns

### Salesforce Platform Integration

#### Service Cloud Integration
```apex
// Create cases from negative feedback
public class SurveyResponseProcessor {
    @InvocableMethod(label='Process Survey Response' description='Create follow-up actions from survey responses')
    public static void processSurveyResponses(List<Id> responseIds) {
        List<Question_Response__c> responses = [
            SELECT Id, Response_Text__c, Question__r.Question_Text__c, 
                   Survey_Response__r.Respondent_Email__c
            FROM Question_Response__c 
            WHERE Survey_Response__c IN :responseIds
        ];
        
        List<Case> casesToCreate = new List<Case>();
        
        for (Question_Response__c qr : responses) {
            if (isNegativeFeedback(qr.Response_Text__c)) {
                Case feedbackCase = new Case(
                    Subject = 'Survey Feedback Follow-up',
                    Description = 'Question: ' + qr.Question__r.Question_Text__c + '\n' +
                                 'Response: ' + qr.Response_Text__c,
                    Origin = 'Survey',
                    Priority = 'Medium',
                    ContactEmail = qr.Survey_Response__r.Respondent_Email__c
                );
                casesToCreate.add(feedbackCase);
            }
        }
        
        if (!casesToCreate.isEmpty()) {
            insert casesToCreate;
        }
    }
    
    private static Boolean isNegativeFeedback(String responseText) {
        Set<String> negativeKeywords = new Set<String>{
            'poor', 'bad', 'terrible', 'disappointed', 'unsatisfied', 'complaint'
        };
        
        String lowerResponse = responseText.toLowerCase();
        for (String keyword : negativeKeywords) {
            if (lowerResponse.contains(keyword)) {
                return true;
            }
        }
        return false;
    }
}
```

#### Marketing Cloud Integration
```apex
// Send survey data to Marketing Cloud for segmentation
public class MarketingCloudIntegration {
    @future(callout=true)
    public static void syncSurveyDataToMC(Set<Id> responseIds) {
        List<Survey_Response__c> responses = [
            SELECT Id, Respondent_Email__c, Response_Date__c, 
                   Survey__r.Name, Survey__c
            FROM Survey_Response__c 
            WHERE Id IN :responseIds
        ];
        
        HttpRequest req = new HttpRequest();
        req.setEndpoint('https://YOUR_MC_SUBDOMAIN.rest.marketingcloudapis.com/hub/v1/dataevents/key:SurveyCompletion/rowset');
        req.setMethod('POST');
        req.setHeader('Authorization', 'Bearer ' + getAccessToken());
        req.setHeader('Content-Type', 'application/json');
        
        List<Map<String, Object>> dataEvents = new List<Map<String, Object>>();
        
        for (Survey_Response__c resp : responses) {
            dataEvents.add(new Map<String, Object>{
                'keys' => new Map<String, Object>{
                    'EmailAddress' => resp.Respondent_Email__c
                },
                'values' => new Map<String, Object>{
                    'SurveyName' => resp.Survey__r.Name,
                    'CompletionDate' => resp.Response_Date__c.format('yyyy-MM-dd'),
                    'SurveyId' => resp.Survey__c
                }
            });
        }
        
        req.setBody(JSON.serialize(dataEvents));
        Http h = new Http();
        HttpResponse res = h.send(req);
        
        System.debug('Marketing Cloud sync response: ' + res.getStatusCode());
    }
}
```

### External System Integration

#### Webhook Notifications
```apex
// Send webhooks on survey completion
@future(callout=true)
public static void sendWebhookNotification(Id surveyResponseId) {
    Survey_Response__c response = [
        SELECT Id, Survey__c, Survey__r.Name, Respondent_Email__c, Response_Date__c
        FROM Survey_Response__c 
        WHERE Id = :surveyResponseId
    ];
    
    Map<String, Object> webhookData = new Map<String, Object>{
        'event' => 'survey_completed',
        'survey_id' => response.Survey__c,
        'survey_name' => response.Survey__r.Name,
        'response_id' => response.Id,
        'completion_date' => response.Response_Date__c,
        'respondent_email' => response.Respondent_Email__c
    };
    
    HttpRequest req = new HttpRequest();
    req.setEndpoint(System.Label.Survey_Webhook_URL);
    req.setMethod('POST');
    req.setHeader('Content-Type', 'application/json');
    req.setHeader('Authorization', 'Bearer ' + System.Label.Webhook_Token);
    req.setBody(JSON.serialize(webhookData));
    
    Http h = new Http();
    HttpResponse res = h.send(req);
    
    if (res.getStatusCode() != 200) {
        System.debug(LoggingLevel.ERROR, 'Webhook failed: ' + res.getBody());
    }
}
```

#### BI/Analytics Integration
```apex
// Export survey data for BI analysis
public class SurveyDataExporter {
    @InvocableMethod(label='Export Survey Data')
    public static void exportSurveyData(List<Id> surveyIds) {
        List<Survey__c> surveys = [
            SELECT Id, Name, CreatedDate,
                   (SELECT Id, Question_Text__c, Type__c FROM Questions__r),
                   (SELECT Id, Status__c, Response_Date__c, Respondent_Email__c FROM Survey_Responses__r)
            FROM Survey__c 
            WHERE Id IN :surveyIds
        ];
        
        // Generate CSV or JSON export
        String csvData = generateCSVExport(surveys);
        
        // Send to external BI system or store in ContentDocument
        ContentVersion cv = new ContentVersion(
            Title = 'Survey Export ' + System.now().format(),
            PathOnClient = 'survey_export_' + System.now().format('yyyyMMdd') + '.csv',
            VersionData = Blob.valueOf(csvData),
            FirstPublishLocationId = UserInfo.getUserId()
        );
        insert cv;
    }
    
    private static String generateCSVExport(List<Survey__c> surveys) {
        List<String> csvRows = new List<String>{
            'Survey Name,Survey Created,Question Text,Question Type,Response Date,Response Text'
        };
        
        // Process survey data into CSV format
        // Implementation details...
        
        return String.join(csvRows, '\n');
    }
}
```

## Troubleshooting Guide

### Common Issues and Resolutions

#### 1. Survey Not Loading in Public Site

**Symptoms**: SurveyResponder shows "Survey not found" error

**Possible Causes**:
- Survey is inactive
- Guest user permissions insufficient
- Invalid survey ID or response ID
- Site security settings blocking access

**Resolution Steps**:
```apex
// Debug in Developer Console
SurveyPublicController.getSurveyById('a00XX000004L9bYQAS');

// Check survey status
SELECT Id, Name, Is_Active__c FROM Survey__c WHERE Id = 'a00XX000004L9bYQAS';

// Verify guest user permissions
SELECT Id, Name FROM Profile WHERE Name LIKE '%Guest%';
```

**Guest User Checklist**:
- [ ] Survey__c read access enabled
- [ ] Question__c read access enabled
- [ ] Answer_Option__c read access enabled
- [ ] SurveyPublicController class access granted
- [ ] Site settings allow guest access to component

#### 2. Email Distribution Failures

**Symptoms**: `createAndSendResponses` returns 0 successful sends

**Possible Causes**:
- Email deliverability limits exceeded
- Invalid email addresses
- Org-wide email address not configured
- Email template rendering issues

**Debug Process**:
```apex
// Test email sending in Anonymous Apex
SurveyController.createAndSendResponses(
    'a00XX000004L9bYQAS',
    new List<String>{'test@example.com'},
    'https://test.my.site.com'
);

// Check email limits
System.debug('Daily email limit: ' + Limits.getEmailInvocations());
System.debug('Emails sent today: ' + Limits.getLimitEmailInvocations());
```

**Resolution**:
1. Configure Org-Wide Email Address
2. Verify recipient email formats
3. Check daily email limits
4. Test with single recipient first

#### 3. Passcode Validation Failures

**Symptoms**: Valid passcodes rejected during survey access

**Possible Causes**:
- Case sensitivity issues
- Leading/trailing whitespace
- Character encoding problems
- Database synchronization delays

**Fix Implementation**:
```apex
// Enhanced passcode validation
public static Boolean validatePasscode(String responseId, String passcode) {
    try {
        // Normalize passcode input
        String normalizedPasscode = passcode != null ? passcode.trim() : '';
        
        List<Survey_Response__c> responses = [
            SELECT Id, Passcode__c, Survey__r.Require_Passcode__c
            FROM Survey_Response__c
            WHERE Unique_Response_ID__c = :responseId
            LIMIT 1
        ];
        
        if (responses.isEmpty()) {
            System.debug('No response found for ID: ' + responseId);
            return false;
        }
        
        Survey_Response__c responseRecord = responses[0];
        
        if (!responseRecord.Survey__r.Require_Passcode__c) {
            return true;
        }
        
        String storedPasscode = responseRecord.Passcode__c != null ? 
            responseRecord.Passcode__c.trim() : '';
        
        Boolean isValid = normalizedPasscode.equals(storedPasscode);
        System.debug('Passcode validation - Expected: ' + storedPasscode + 
                    ', Received: ' + normalizedPasscode + ', Valid: ' + isValid);
        
        return isValid;
        
    } catch (Exception e) {
        System.debug('Passcode validation error: ' + e.getMessage());
        return false;
    }
}
```

#### 4. Response Submission Failures

**Symptoms**: Survey responses not saving correctly

**Possible Causes**:
- Required field validation failures
- Data type conversion errors
- Duplicate response attempts
- Governor limit exceptions

**Debug and Fix**:
```javascript
// Enhanced error handling in surveyResponder.js
async handleSubmit() {
    try {
        this.isSubmitting = true;
        this.clearErrors();
        
        // Validate all required responses
        const validationResult = this.validateAllResponses();
        if (!validationResult.isValid) {
            this.showValidationErrors(validationResult.errors);
            return;
        }
        
        // Prepare and clean response data
        const responseData = this.prepareCleanResponseData();
        
        const result = await submitSurveyResponse({
            responseId: this.responseId,
            responseDataJson: JSON.stringify(responseData),
            surveyId: this.surveyId
        });
        
        this.handleSubmissionSuccess(result);
        
    } catch (error) {
        this.handleSubmissionError(error);
    } finally {
        this.isSubmitting = false;
    }
}

validateAllResponses() {
    const errors = [];
    const responses = {};
    
    this.questions.forEach(question => {
        const response = this.getQuestionResponse(question.Id);
        
        if (question.Is_Required__c && this.isEmptyResponse(response)) {
            errors.push({
                questionId: question.Id,
                message: `${question.Question_Text__c} is required`
            });
        } else if (response !== null && response !== undefined) {
            responses[question.Id] = response;
        }
    });
    
    return {
        isValid: errors.length === 0,
        errors: errors,
        responses: responses
    };
}

prepareCleanResponseData() {
    const cleanData = {};
    
    Object.keys(this.responses).forEach(questionId => {
        const response = this.responses[questionId];
        
        if (response !== null && response !== undefined && response !== '') {
            if (Array.isArray(response)) {
                // Clean array responses
                const cleanArray = response.filter(item => 
                    item !== null && item !== undefined && item !== ''
                );
                if (cleanArray.length > 0) {
                    cleanData[questionId] = cleanArray;
                }
            } else if (typeof response === 'string') {
                // Trim string responses
                const trimmed = response.trim();
                if (trimmed.length > 0) {
                    cleanData[questionId] = trimmed;
                }
            } else {
                cleanData[questionId] = response;
            }
        }
    });
    
    return cleanData;
}
```

#### 5. Component Styling Issues

**Symptoms**: Survey appearance broken or inconsistent

**Possible Causes**:
- CSS conflicts with page styles
- Responsive design breaking on mobile
- Theme color variables not applied
- Browser compatibility issues

**CSS Fixes**:
```css
/* Comprehensive component styling */
.survey-container {
    /* Reset and isolate styles */
    all: initial;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    
    /* CSS Custom Properties for theming */
    --primary-color: #22BDC1;
    --accent-color: #D5DF23;
    --text-color: #1d1d1f;
    --background-color: #ffffff;
    --border-color: #e5e5e5;
    --error-color: #d73527;
    --success-color: #4caf50;
    
    /* Container styles */
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
    background: var(--background-color);
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* Responsive design */
@media (max-width: 768px) {
    .survey-container {
        margin: 10px;
        padding: 15px;
    }
    
    .question-card {
        padding: 15px;
        margin-bottom: 15px;
    }
    
    .survey-button {
        width: 100%;
        padding: 15px;
        font-size: 16px;
    }
}

/* Form element normalization */
.survey-input {
    width: 100%;
    padding: 12px;
    border: 2px solid var(--border-color);
    border-radius: 4px;
    font-size: 16px;
    transition: border-color 0.2s ease;
}

.survey-input:focus {
    outline: none;
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px rgba(34, 189, 193, 0.1);
}

/* Error states */
.survey-input.error {
    border-color: var(--error-color);
}

.error-message {
    color: var(--error-color);
    font-size: 14px;
    margin-top: 5px;
    display: flex;
    align-items: center;
}

.error-message::before {
    content: '⚠';
    margin-right: 5px;
}
```

### Performance Optimization

#### Query Optimization

```apex
// Optimized survey loading with selective fields
@AuraEnabled(cacheable=true)
public static SurveyWrapper getSurveyByIdOptimized(String surveyId) {
    // Single query with selective field access
    List<Survey__c> surveys = [
        SELECT Id, Name, Description__c, Welcome_Message__c, 
               Thank_You_Message__c, Is_Active__c, Require_Passcode__c
        FROM Survey__c 
        WHERE Id = :surveyId AND Is_Active__c = TRUE
        LIMIT 1
    ];
    
    if (surveys.isEmpty()) {
        throw new AuraHandledException('Survey not found or inactive');
    }
    
    // Separate query for questions with bulk loading
    List<Question__c> questions = [
        SELECT Id, Question_Text__c, Type__c, Order__c, Is_Required__c,
               (SELECT Id, Option_Text__c, Order__c 
                FROM Answer_Options__r 
                ORDER BY Order__c ASC)
        FROM Question__c 
        WHERE Survey__c = :surveyId
        ORDER BY Order__c ASC
    ];
    
    SurveyWrapper wrapper = new SurveyWrapper();
    wrapper.survey = surveys[0];
    wrapper.questions = questions;
    wrapper.requiresPasscode = surveys[0].Require_Passcode__c;
    
    return wrapper;
}
```

#### Client-Side Performance

```javascript
// Debounced response saving for auto-save functionality
debounceTimeout;

handleResponseChange(event) {
    const questionId = event.target.dataset.questionId;
    const value = event.target.value;
    
    // Update local state immediately
    this.responses[questionId] = value;
    
    // Debounce auto-save to avoid excessive server calls
    clearTimeout(this.debounceTimeout);
    this.debounceTimeout = setTimeout(() => {
        this.autoSaveResponse(questionId, value);
    }, 1000); // 1 second delay
}

async autoSaveResponse(questionId, value) {
    try {
        // Only save if response ID exists (survey in progress)
        if (this.responseId) {
            await this.savePartialResponse(questionId, value);
        }
    } catch (error) {
        console.error('Auto-save failed:', error);
        // Don't show error to user for auto-save failures
    }
}

// Virtual scrolling for surveys with many questions
@track visibleQuestions = [];
@track scrollTop = 0;

updateVisibleQuestions() {
    const questionHeight = 200; // Approximate height per question
    const containerHeight = 600; // Visible container height
    const buffer = 2; // Buffer questions above/below visible area
    
    const startIndex = Math.max(0, 
        Math.floor(this.scrollTop / questionHeight) - buffer
    );
    const endIndex = Math.min(this.questions.length - 1,
        Math.ceil((this.scrollTop + containerHeight) / questionHeight) + buffer
    );
    
    this.visibleQuestions = this.questions.slice(startIndex, endIndex + 1);
}

handleScroll(event) {
    this.scrollTop = event.target.scrollTop;
    this.updateVisibleQuestions();
}
```

---

*This comprehensive documentation provides detailed technical guidance for implementing and using the Dynamic Survey Creator utility component. For additional support or custom development, contact the technical team.*

**Document Version**: 1.0  
**Last Updated**: 2024-12-19  
**Compatibility**: Salesforce API 62.0+, Experience Cloud Sites