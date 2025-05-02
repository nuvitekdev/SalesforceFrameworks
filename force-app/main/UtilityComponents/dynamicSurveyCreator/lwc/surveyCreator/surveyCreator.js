import { LightningElement, api, track } from 'lwc';
import saveSurvey from '@salesforce/apex/SurveyController.saveSurvey';
import createAndSendResponses from '@salesforce/apex/SurveyController.createAndSendResponses';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Define reduceErrors function locally
function reduceErrors(errors) {
    if (!Array.isArray(errors)) {
        errors = [errors];
    }

    return (
        errors
            // Remove null/undefined items
            .filter((error) => !!error)
            // Extract an error message
            .map((error) => {
                // UI API read errors
                if (Array.isArray(error.body)) {
                    return error.body.map((e) => e.message);
                }
                // UI API DML, Apex and network errors
                else if (error.body && typeof error.body.message === 'string') {
                    // Check for AuraHandledException message
                    if (error.body.message.includes('AuraHandledException: ')) {
                         // Extract message after the prefix
                         return error.body.message.split('AuraHandledException: ')[1];
                    }
                    return error.body.message;
                }
                // JS errors
                else if (typeof error.message === 'string') {
                    return error.message;
                }
                // Unknown error shape so try HTTP status text
                return error.statusText;
            })
            // Flatten
            .reduce((prev, curr) => prev.concat(curr), [])
            // Remove empty strings
            .filter((message) => !!message)
    );
}

export default class SurveyCreator extends LightningElement {
    // --- Component Properties ---
    /**
     * The base URL of the public site/page hosting the survey responder LWC.
     * Example: 'https://yourdomain.my.site.com/yourcommunity'
     * @type {string}
     * @required
     */
    @api publicSiteUrl;

    /**
     * Primary theme color for buttons and active elements.
     * @type {string}
     * @default '#22BDC1'
     */
    @api primaryColor = '#22BDC1';

    /**
     * Accent theme color for highlights or secondary elements.
     * @type {string}
     * @default '#D5DF23'
     */
    @api accentColor = '#D5DF23';

    /**
     * Main text color.
     * @type {string}
     * @default '#1d1d1f'
     */
    @api textColor = '#1d1d1f';

    /**
     * Background color for the component container.
     * @type {string}
     * @default '#ffffff'
     */
    @api backgroundColor = '#ffffff';


    // --- Internal State ---
    /**
     * Tracks the current step in the survey creation process (1-5).
     * @type {number}
     * @track
     */
    @track currentStep = 1;

    /**
     * Holds the data for the main Survey__c record.
     * @type {object}
     * @track
     */
    @track survey = {
        Name: '',
        Description__c: '',
        Welcome_Message__c: '',     // Added for completeness if needed
        Thank_You_Message__c: '',  // Added for completeness if needed
        Is_Active__c: true,
        Expiration_Date__c: null
    };

    /**
     * Array holding the question objects being built.
     * Structure matches QuestionDataWrapper in Apex.
     * @type {Array<object>}
     * @track
     */
    @track questions = [];

    /**
     * String containing comma or newline-separated recipient email addresses.
     * @type {string}
     * @track
     */
    @track recipientEmails = '';

    /**
     * Indicates if an Apex operation is in progress (saving/sending).
     * @type {boolean}
     * @track
     */
    @track isProcessing = false; // Unified processing state

    /**
     * Holds any error message to be displayed.
     * @type {string}
     * @track
     */
    @track error;

    /**
     * Stores the ID of the created Survey__c record after saving.
     * @type {string}
     * @track
     */
    @track surveyId;

    /**
     * Stores the number of emails successfully sent after the operation.
     * @type {number}
     * @track
     */
    @track sentCount = 0;

    // Internal counters for unique keys in loops
    questionKeyCounter = 0;
    optionKeyCounter = 0;

    // --- Lifecycle Hooks ---
    /**
     * Lifecycle hook when component is inserted into the DOM.
     * Sets up initial state and default values.
     */
    connectedCallback() {
        // Set current step explicitly to 1 (first step)
        this.currentStep = 1;
        
        // Create initial empty question
        if (this.questions.length === 0) {
            this.addQuestion();
        }
        
        // Update path indicator on initial load
        this.updatePathClasses();
    }

    /**
     * Lifecycle hook when component is rendered.
     * Updates the CSS custom properties and path indicator styles.
     */
    renderedCallback() {
        // Update path classes based on current step
        this.updatePathClasses();
    }

    /**
     * Updates the CSS classes on the path items based on the current step.
     * This is similar to pdfSigner's path indicator implementation.
     */
    updatePathClasses() {
        // Use setTimeout to ensure the DOM is updated
        setTimeout(() => {
            // Get RGB values of theme colors for custom styling
            const primaryRgb = this.hexToRgb(this.primaryColor);
            const accentRgb = this.hexToRgb(this.accentColor);
            
            // Set the overall step mode class on the container
            const container = this.template.querySelector('.custom-path-container');
            
            // Add the appropriate step mode class 
            if (container) {
                // First remove any existing step mode classes
                const existingClasses = Array.from(container.classList)
                    .filter(cls => cls.includes('step-') && cls.includes('-mode'));
                
                ['step-0-mode', 'step-1-mode', 'step-2-mode', 'step-3-mode', 'step-4-mode', 'step-5-mode'].forEach(cls => {
                    if (container.classList.contains(cls)) {
                        container.classList.remove(cls);
                    }
                });
                
                // IMPORTANT FIX: Use the currentStep directly (1-indexed) for the CSS class
                // instead of converting to 0-indexed - this keeps alignment with the CSS selectors
                container.classList.add(`step-${this.currentStep - 1}-mode`);
                
                // Update CSS properties for items based on completion status
                const pathItems = this.template.querySelectorAll('.custom-path-item');
                
                pathItems.forEach((item, index) => {
                    // Get the step index from the data-step attribute
                    const itemStepIndex = parseInt(item.dataset.step, 10);
                    // The step in the UI is 1-indexed for display
                    const displayStep = itemStepIndex + 1;
                    
                    // Get elements
                    const indicator = item.querySelector('.custom-path-indicator');
                    const number = item.querySelector('.custom-path-number');
                    const label = item.querySelector('.custom-path-label');
                    
                    // Set ARIA attributes for accessibility
                    item.setAttribute('aria-current', displayStep === this.currentStep ? 'step' : 'false');
                    item.setAttribute('aria-selected', displayStep === this.currentStep ? 'true' : 'false');
                    
                    // Reset all
                    indicator.style.backgroundColor = '';
                    indicator.style.borderColor = '';
                    number.style.color = '';
                    number.style.fontSize = '';
                    number.style.fontWeight = '';
                    number.innerHTML = displayStep;
                    
                    // Apply styles based on step status
                    if (displayStep < this.currentStep) {
                        // Completed step
                        indicator.style.backgroundColor = `rgb(${primaryRgb})`;
                        indicator.style.borderColor = `rgb(${primaryRgb})`;
                        number.style.color = 'white';
                        // Show checkmark instead of number - make it more visible with unicode heavy checkmark
                        number.innerHTML = '&#10004;'; // Unicode heavy checkmark: ✔
                        number.style.fontSize = '24px'; // Make checkmark larger
                        number.style.fontWeight = 'bold'; // Make checkmark bolder
                        
                        if (label) {
                            label.style.color = this.textColor || '#1d1d1f';
                        }
                    } else if (displayStep === this.currentStep) {
                        // Current step (accent color)
                        indicator.style.backgroundColor = `rgb(${accentRgb})`;
                        indicator.style.borderColor = `rgb(${accentRgb})`;
                        number.style.color = 'rgba(0, 0, 0, 0.8)'; // Dark text on accent color
                        
                        if (label) {
                            label.style.color = this.textColor || '#1d1d1f';
                            label.style.fontWeight = '600';
                        }
                    } else {
                        // Future step - reset everything to default
                        indicator.style.backgroundColor = '';
                        indicator.style.borderColor = '';
                        number.style.color = '';
                        number.style.fontSize = '';
                        number.style.fontWeight = '';
                        number.innerHTML = displayStep;
                        
                        if (label) {
                            label.style.color = '';
                            label.style.fontWeight = '';
                        }
                    }
                });
            }
        }, 0);
    }

    // --- Getters for Template Logic ---
    get isStep1() { return this.currentStep === 1; }
    get isStep2() { return this.currentStep === 2; }
    get isStep3() { return this.currentStep === 3; }
    get isStep4() { return this.currentStep === 4; }
    get isStep5() { return this.currentStep === 5; } // Created Survey, show ID
    get isStep6() { return this.currentStep === 6; } // Sent Confirmation Step

    get step1Title() { return 'Step 1: Survey Details'; }
    get step2Title() { return 'Step 2: Build Questions'; }
    get step3Title() { return 'Step 3: Add Recipients'; }
    get step4Title() { return 'Step 4: Review'; }
    get step5Title() { return 'Step 5: Survey Created'; }
    get step6Title() { return 'Survey Sent!'; }

    get showPreviousButton() { return this.currentStep > 1 && this.currentStep !== 6; } // Don't show on first or confirmation step
    get showNextButton() { return this.currentStep < 4; } // Show until Review step
    get showSaveButton() { return this.currentStep === 4; } // Only on Review step
    get showSendButton() { return this.currentStep === 5; } // Only on Created step
    get showCreateAnotherButton() { return this.currentStep === 6; } // Only on Sent Confirmation step
    get showNavButtons() { return this.currentStep <= 4; } // Only show navigation buttons for steps 1-4

    get nextButtonLabel() {
        return this.currentStep === 3 ? 'Review' : 'Next';
    }

    get currentStepClass() {
        // Convert from 1-indexed step to 0-indexed CSS class
        const stepIndex = this.currentStep - 1;
        return `step-${stepIndex}-mode`;
    }

    get questionTypeOptions() {
        return [
            { label: 'Text', value: 'Text' },
            { label: 'Text Area', value: 'Text Area' },
            { label: 'Multiple Choice (Single Answer)', value: 'Multiple Choice - Single' },
            { label: 'Multiple Choice (Multiple Answers)', value: 'Multiple Choice - Multiple' },
            { label: 'Rating (1-5)', value: 'Rating' },
            { label: 'Date', value: 'Date' }
        ];
    }

    get optionInputLabel() {
        // Dynamic label for adding options based on question type
        // Note: This logic might need refinement depending on exact requirements.
        return 'Add Answer Option';
    }

    /**
     * Generates CSS styles for the component's container.
     * @returns {string} CSS style string.
     */
    get componentStyle() {
        // Use direct API properties with fallbacks
        const primaryColor = this.primaryColor || '#22BDC1';
        const accentColor = this.accentColor || '#D5DF23';
        const textColor = this.textColor || '#1d1d1f';
        const backgroundColor = this.backgroundColor || '#ffffff';
        
        // Convert hex to RGB for rgba values
        const primaryRgb = this.hexToRgb(primaryColor);
        const accentRgb = this.hexToRgb(accentColor);
        
        // Return a single-line string to avoid CSS validation errors
        return `--primary-color: ${primaryColor}; --primary-color-rgb: ${primaryRgb}; --accent-color: ${accentColor}; --accent-color-rgb: ${accentRgb}; --background-color: ${backgroundColor}; --text-color: ${textColor};`;
    }

    get questionsWithComputedFields() {
        return this.questions.map(q => {
            if (!q) return q;
            
            // Determine if this question type should show answer options
            const showOptions = q.type && 
                ['Multiple Choice - Single', 'Multiple Choice - Multiple'].includes(q.type);
            
            // Ensure answerOptions is always an array
            const answerOptions = Array.isArray(q.answerOptions) ? q.answerOptions : [];
            
            return {
                ...q,
                showOptions,
                answerOptions
            };
        });
    }

    // --- Utility Methods ---
    /**
     * Converts a HEX color value to RGB.
     * @param {string} hex - The hex color string (e.g., '#RRGGBB').
     * @returns {string} The RGB color string (e.g., 'R, G, B').
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return '0, 0, 0'; // Default to black on parse error
        const r = parseInt(result[1], 16);
        const g = parseInt(result[2], 16);
        const b = parseInt(result[3], 16);
        return `${r}, ${g}, ${b}`;
    }

    // --- Event Handlers ---
    /**
     * Updates the survey object when details change.
     */
    handleSurveyDetailChange(event) {
        const field = event.target.dataset.field;
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        this.survey = { ...this.survey, [field]: value };
    }

    /**
     * Updates a question's details when its fields change.
     */
    handleQuestionChange(event) {
        // Correctly parse data-index from the HTML
        const questionIndex = parseInt(event.target.dataset.index, 10); 
        const field = event.target.dataset.field; // e.g., 'questionText', 'type', 'isRequired'
        let value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;

        // Create a copy of the questions array and the specific question to modify
        const questions = [...this.questions];
        const updatedQuestion = { ...questions[questionIndex] };

        // Update the specific field
        updatedQuestion[field] = value;
        
        // Update required flag separately as it needs special handling
        if (field === 'isRequired') {
            updatedQuestion.isRequired = value;
        }
        
        // Replace the question in the array
        questions[questionIndex] = updatedQuestion;
        
        // Update the questions array
        this.questions = questions;
    }

    /**
     * Updates an answer option when its value changes.
     */
    handleOptionChange(event) {
        const questionIndex = parseInt(event.target.dataset.qindex, 10);
        const optionIndex = parseInt(event.target.dataset.optindex, 10);
        const value = event.target.value;

        // Create a copy of the questions array
        const questions = [...this.questions];
        
        // Create a copy of the specific question
        const question = { ...questions[questionIndex] };
        
        // Create a copy of the options array
        const options = [...question.answerOptions];
        
        // Create a copy of the specific option
        const option = { ...options[optionIndex] };
        
        // Update the option value
        option.optionText = value;
        
        // Replace the option in the options array
        options[optionIndex] = option;
        
        // Replace the options in the question
        question.answerOptions = options;
        
        // Replace the question in the questions array
        questions[questionIndex] = question;
        
        // Update the questions array
        this.questions = questions;
    }

    /**
     * Updates the recipient email addresses.
     */
    handleEmailChange(event) {
        this.recipientEmails = event.target.value;
    }

    // --- Question & Option Management ---
    /**
     * Adds a new question to the questions array.
     */
    addQuestion() {
        // Create a new question
        const newQuestion = {
            key: `q_${this.questionKeyCounter++}`,
            sObjectType: 'Question__c',
            Id: null,
            questionText: '',
            type: 'Text',
            displayOrder: this.questions.length + 1,
            isRequired: false,
            answerOptions: []
        };
        
        // Add it to the questions array
        this.questions = [...this.questions, newQuestion];
    }

    /**
     * Removes a question from the questions array.
     */
    removeQuestion(event) {
        // Ensure we get the correct index by checking different data attributes
        const qindex = event.target.dataset.qindex;
        const index = event.target.dataset.index;
        
        // Use whichever attribute is available
        const questionIndexToRemove = parseInt(qindex || index, 10);
        
        if (isNaN(questionIndexToRemove)) {
            this.showToast('Error', 'Could not determine which question to remove.', 'error');
            return;
        }
        
        this.questions = this.questions.filter((_, index) => index !== questionIndexToRemove);
    }

    /**
     * Adds an answer option to a multiple-choice question.
     */
    addAnswerOption(event) {
        // Ensure we get the correct index by checking different data attributes
        const qindex = event.target.dataset.qindex;
        const index = event.target.dataset.index;
        
        // Use whichever attribute is available
        const questionIndex = parseInt(qindex || index, 10);
        
        if (isNaN(questionIndex)) {
            this.showToast('Error', 'Could not determine which question to add an option to.', 'error');
            return;
        }
        
        // Create a copy of the questions array
        const questions = [...this.questions];
        
        if (!questions[questionIndex]) {
            this.showToast('Error', `Question at index ${questionIndex} not found.`, 'error');
            return;
        }
        
        // Get the current options count
        const optionsCount = 
            questions[questionIndex].answerOptions ? 
            questions[questionIndex].answerOptions.length : 0;
        
        // Create a new option
        const newOption = this.createAnswerOption(optionsCount + 1);
        
        // Ensure answerOptions array exists
        if (!questions[questionIndex].answerOptions) {
            questions[questionIndex].answerOptions = [];
        }
        
        // Add the option to the question
        questions[questionIndex].answerOptions = [...questions[questionIndex].answerOptions, newOption];
        
        // Update the questions array
        this.questions = questions;
    }

    /**
     * Creates a new answer option object.
     */
    createAnswerOption(order) {
        return {
            key: `o_${this.optionKeyCounter++}`,
            sObjectType: 'Answer_Option__c',
            Id: null,
            optionText: '',
            displayOrder: order
        };
    }

    /**
     * Removes an answer option from a multiple-choice question.
     */
    removeAnswerOption(event) {
        const questionIndex = parseInt(event.target.dataset.qindex, 10);
        const optionIndexToRemove = parseInt(event.target.dataset.optindex, 10);

        // Create a copy of the questions array
        const questions = [...this.questions];
        
        // Create a copy of the specific question
        const question = { ...questions[questionIndex] };
        
        // Filter out the option to remove
        question.answerOptions = question.answerOptions.filter((_, index) => index !== optionIndexToRemove);

        // Re-order remaining options
        question.answerOptions = question.answerOptions.map((opt, oIndex) => ({ ...opt, displayOrder: oIndex + 1 }));
        
        // Replace the question in the questions array
        questions[questionIndex] = question;
        
        // Update the questions array
        this.questions = questions;
    }

    // --- Navigation and Validation ---
    /**
     * Moves to the next step in the survey creation process.
     * Validates the current step before proceeding.
     */
    handleNext() {
        // Validate the current step
        if (!this.validateForm()) {
            return;
        }
        
        // Move to the next step
        this.currentStep += 1;
        
        // Update the path indicator
        this.updatePathClasses();
    }

    /**
     * Moves to the previous step in the survey creation process.
     */
    handlePrevious() {
        if (this.currentStep > 1) {
            // Move to the previous step
            this.currentStep -= 1;
            
            // Update the path indicator
            this.updatePathClasses();
        }
    }

    /**
     * Validates the current form step.
     * @returns {boolean} True if validation passes, false otherwise.
     */
    validateForm() {
        let isValid = true;
        let errorMessage = '';
        
        if (this.currentStep === 1) {
            // Validate Survey Details
            if (!this.survey.Name || this.survey.Name.trim() === '') {
                isValid = false;
                errorMessage = 'Please enter a survey name.';
            }
        } else if (this.currentStep === 2) {
            // Validate Questions
            const hasQuestions = this.questions.length > 0;
            if (!hasQuestions) {
                isValid = false;
                errorMessage = 'Add at least one question to your survey.';
            } else {
                // Check each question
                for (let i = 0; i < this.questions.length; i++) {
                    const q = this.questions[i];
                    
                    // Check if question has text
                    if (!q.questionText || q.questionText.trim() === '') {
                    isValid = false;
                        errorMessage = `Question ${i + 1} is missing question text.`;
                        break;
                    }
                    
                    // For multiple choice, check if options exist
                    if (q.type.startsWith('Multiple Choice') && (!q.answerOptions || q.answerOptions.length < 2)) {
                        isValid = false;
                        errorMessage = `Question ${i + 1} needs at least two answer options.`;
                        break;
                }
            }
            }
        } else if (this.currentStep === 3) {
            // Step 3 is now just an informational step, no validation needed
            isValid = true;
        } else if (this.currentStep === 4) { // Validate before sending
            // Check publicSiteUrl before allowing send
            if (!this.publicSiteUrl || this.publicSiteUrl.trim() === '') {
                isValid = false;
                errorMessage = 'A valid Public Site URL is required to send surveys.';
            } else if (!this.publicSiteUrl.toLowerCase().startsWith('http')) {
                isValid = false;
                errorMessage = 'Public Site URL must start with http:// or https://';
            }
        } else if (this.currentStep === 5) {
            // We only need validation for step 5 when sending emails
            // handleSendEmails method handles its own validation
            isValid = true;
        } else if (this.currentStep === 6) {
            // Step 6 is now just an informational step, no validation needed
            isValid = true;
        }

        if (!isValid) {
            this.showToast('Validation Error', errorMessage, 'error');
        }
        return isValid;
    }

    /**
     * Validates an array of email addresses.
     * @param {Array<string>} emails - Array of email strings.
     * @returns {boolean} True if all emails are valid, false otherwise.
     */
    validateEmails(emails) {
        // More robust email regex
        const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
        return emails.every(email => emailRegex.test(email.trim()));
    }


    // --- Data Operations ---
    /**
     * Handles the "Save Survey" button click.
     * Creates the survey and all its questions.
     */
    async handleSaveSurvey() {
        this.error = null; // Clear previous errors
        
        // Validate the form
        if (!this.validateForm()) {
            return;
        }

        // Start processing
        this.isProcessing = true;
        
        try {
            // Sanitize the data to remove any potential issues
            const sanitizeString = (str) => {
                if (!str) return '';
                
                // Convert to string in case it's a different type
                let result = String(str);
                
                try {
                    // Handle HTML entities and special characters first
                    result = result
                        .replace(/&/g, '&amp;')     // Replace & with &amp;
                        .replace(/</g, '&lt;')      // Replace < with &lt;
                        .replace(/>/g, '&gt;')      // Replace > with &gt;
                        .replace(/"/g, '&quot;')    // Replace " with &quot;
                        .replace(/'/g, '&#39;')     // Replace ' with &#39;
                        
                        // Also handle common problematic characters for JSON
                        .replace(/\\/g, '\\\\')     // Escape backslashes
                        .replace(/\n/g, ' ')        // Replace newlines with spaces
                        .replace(/\r/g, ' ')        // Replace carriage returns with spaces
                        .replace(/\t/g, ' ')        // Replace tabs with spaces
                        .replace(/\f/g, ' ');       // Replace form feeds with spaces
                } catch (e) {
                    // If any error in sanitization, return an empty string to be safe
                    console.error('Error sanitizing string:', e);
                    return '';
                }
                
                return result;
            };
            
            // Prepare the data structure for Apex with sanitized values
            const formattedQuestions = this.questions.map((q, index) => {
                if (!q) return null;
                
                // Map to the fields expected by the Apex controller
                return {
                    sObjectType: 'Question__c',
                    Id: q.Id || null,
                    questionText: sanitizeString(q.questionText || ''),
                    type: sanitizeString(q.type || 'Text'),
                    displayOrder: index + 1,
                    isRequired: q.isRequired === true,
                    answerOptions: Array.isArray(q.answerOptions) ? q.answerOptions.map((opt, optIndex) => {
                        if (!opt) return null;
                        return {
                            sObjectType: 'Answer_Option__c',
                            Id: opt.Id || null,
                            optionText: sanitizeString(opt.optionText || ''),
                            displayOrder: optIndex + 1
                        };
                    }).filter(Boolean) : [] // Remove any null entries
                };
            }).filter(Boolean); // Remove any null entries
            
            // Create a clean survey object with only the fields we need
            const cleanSurvey = {
                Id: this.survey.Id || null,
                Name: sanitizeString(this.survey.Name || ''),
                Description__c: sanitizeString(this.survey.Description__c || ''),
                Welcome_Message__c: sanitizeString(this.survey.Welcome_Message__c || ''),
                Thank_You_Message__c: sanitizeString(this.survey.Thank_You_Message__c || ''),
                Is_Active__c: this.survey.Is_Active__c === true,
                Expiration_Date__c: this.survey.Expiration_Date__c || null
            };
            
        const surveyData = {
                survey: cleanSurvey,
                questions: formattedQuestions
            };
            
            // Use a more robust way to convert to JSON
            let surveyJson;
            try {
                // Use JSON.stringify with a replacer function to handle any circular references
                surveyJson = JSON.stringify(surveyData, (key, value) => {
                    // Convert any objects that might cause issues to simpler forms
                    if (typeof value === 'object' && value !== null) {
                        // Handle dates
                        if (value instanceof Date) {
                            return value.toISOString();
                        }
                    }
                    return value;
                });
            } catch (jsonError) {
                throw new Error('Failed to convert survey data to JSON: ' + jsonError.message);
            }
            
            // Save the Survey definition using the imported saveSurvey method
            const savedSurveyId = await saveSurvey({ 
                surveyJson: surveyJson
            });
            
            this.surveyId = savedSurveyId; // Store the returned ID
            
            // Show success toast
            this.showToast('Success', 'Survey created successfully! You can now send invitations.', 'success');
            
            // Move to step 5 (Survey Created) where we show the survey ID
            this.currentStep = 5;
            this.updatePathClasses();
        } catch (error) {
            // Use reduceErrors to get a clean message
            const errorMessage = reduceErrors(error).join(', ');
            this.error = errorMessage;
            this.showToast('Error', `Failed to save survey: ${errorMessage}`, 'error');
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Handles the "Send Emails" button click.
     * Sends invitations for the already created survey.
     */
    async handleSendEmails() {
        this.error = null; // Clear previous errors

        const emailList = this.emailList;
        if (emailList.length === 0) {
            this.showToast('Validation Error', 'Please provide at least one valid recipient email address.', 'error');
            return;
        }
        if (!this.validateEmails(emailList)) {
            this.showToast('Validation Error', 'Please ensure all email addresses are valid.', 'error');
            return;
        }
        if (!this.publicSiteUrl || this.publicSiteUrl.trim() === '') {
            this.showToast('Configuration Error', 'A valid Public Site URL is required.', 'error');
            return;
        }
        if (!this.publicSiteUrl.toLowerCase().startsWith('http')) {
            this.showToast('Configuration Error', 'Public Site URL must start with http:// or https://.', 'error');
            return;
        }

        this.isProcessing = true;

        try {
            // Send emails for the saved survey
            const sendResultCount = await createAndSendResponses({
                surveyId: this.surveyId,
                recipientEmails: emailList,
                publicSiteUrl: this.publicSiteUrl
            });

            this.sentCount = sendResultCount;
            this.showToast('Success', `${this.sentCount} invitations sent successfully!`, 'success');
            this.currentStep = 6; // Move to confirmation step
            this.updatePathClasses(); // Update path indicator
        } catch (error) {
            // Use reduceErrors to get a clean message
            const errorMessage = reduceErrors(error).join(', ');
            this.error = errorMessage;
            this.showToast('Error', `Failed to send survey: ${errorMessage}`, 'error');
            console.error('Error sending survey:', error);
        } finally {
            this.isProcessing = false;
        }
    }

    // --- Post-Send Actions ---
    /**
     * Resets the component state to create a new survey.
     */
    handleCreateAnother() {
        // Reset state variables
        this.currentStep = 1;
        this.survey = {
            Name: '',
            Description__c: '',
            Welcome_Message__c: '',
            Thank_You_Message__c: '',
            Is_Active__c: true,
            Expiration_Date__c: null
        };
        this.questions = [];
        this.recipientEmails = '';
        this.isProcessing = false;
        this.error = null;
        this.surveyId = null;
        this.sentCount = 0;
        this.questionKeyCounter = 0;
        this.optionKeyCounter = 0;

        // Add the initial question back
        this.addQuestion();

        // Update path indicator
        this.updatePathClasses();
    }


    // --- Toast Notification ---
    /**
     * Displays a toast message.
     * @param {string} title - The title of the toast.
     * @param {string} message - The main message body.
     * @param {string} variant - Toast variant ('success', 'error', 'warning', 'info').
     */
    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant,
            mode: 'dismissable' // Or 'pester' or 'sticky'
        });
        this.dispatchEvent(event);
    }

    /**
     * Converts the recipientEmails string to an array of email addresses.
     * @returns {Array<string>} An array of email addresses.
     */
    get emailList() {
        if (!this.recipientEmails) return [];
        
        // Split emails by commas or newlines
        const emailStr = this.recipientEmails.trim();
        const emails = emailStr.split(/[,\n\r]+/);
        
        // Clean up whitespace and remove empty entries
        return emails
            .map(email => email.trim())
            .filter(email => email.length > 0);
    }

    /**
     * Handle step navigation when clicking on path indicators
     * @param {Event} event - The click event
     */
    goToStep(event) {
        const stepIndex = parseInt(event.currentTarget.dataset.step, 10);
        const step = stepIndex + 1; // Convert from 0-indexed to 1-indexed
        
        // Don't allow skipping forward
        if (step > this.currentStep) {
            this.showToast(
                'Cannot Skip Steps', 
                'Please complete the current step before proceeding.', 
                'warning'
            );
            return;
        }
        
        // Don't allow going back from confirmation
        if (this.currentStep === 6 && step < 6) {
            this.showToast(
                'Survey Already Sent', 
                'This survey has already been sent. Create a new one to start over.', 
                'warning'
            );
            return;
        }
        
        // Check if we're navigating backwards
        const goingBack = step < this.currentStep;
        
        // Proceed with navigation
        this.currentStep = step;
        this.updatePathClasses();
    }

    /**
     * Update path classes - call this when the currentStep changes or when 
     * the component needs to refresh its visual state
     */
    forcePathUpdate() {
        // Force a re-render of the path indicators
        this.updatePathClasses();
    }

    /**
     * @description Generates the direct survey link for public access
     * @return {string} The complete URL to access the survey directly
     */
    get directSurveyLink() {
        if (!this.surveyId || !this.publicSiteUrl) {
            return 'Configure site URL in Settings tab';
        }
        
        // Ensure the URL has a trailing slash
        let baseUrl = this.publicSiteUrl;
        if (!baseUrl.endsWith('/')) {
            baseUrl += '/';
        }
        
        // Return the complete URL with the survey ID parameter
        return `${baseUrl}survey?id=${this.surveyId}`;
    }

    /**
     * Copies the survey ID to the clipboard and shows a toast message
     */
    copySurveyIdToClipboard() {
        if (!this.surveyId) return;
        
        // Create a temporary element to copy from
        const el = document.createElement('textarea');
        el.value = this.surveyId;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        
        // Show toast
        this.showToast('Copied!', 'Survey ID copied to clipboard', 'success');
    }
    
    /**
     * Copies the direct survey link to the clipboard and shows a toast message
     */
    copyDirectLinkToClipboard() {
        if (!this.directSurveyLink || this.directSurveyLink.includes('Configure')) {
            this.showToast('Error', 'Please configure the public site URL first', 'error');
            return;
        }
        
        // Create a temporary element to copy from
        const el = document.createElement('textarea');
        el.value = this.directSurveyLink;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
        
        // Show toast
        this.showToast('Copied!', 'Survey link copied to clipboard', 'success');
    }

    /**
     * Legacy method for backward compatibility.
     * This is now replaced by handleSaveSurvey
     */
    async handleSendSurvey() {
        // Call the current implementation to maintain compatibility
        await this.handleSaveSurvey();
    }
} 