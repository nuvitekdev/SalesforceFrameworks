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
     * Initializes the component, adds a default question, and applies theme.
     */
    connectedCallback() {
        this.addQuestion(); // Start with one question
        this.updateThemeVariables(); // Apply custom styling
        
        // Schedule an update of the path indicators after render
        setTimeout(() => {
            this.updatePathClasses();
        }, 100);
    }

    /**
     * Updates the CSS custom properties based on the API values.
     */
    updateThemeVariables() {
        const style = document.createElement('style');
        const rgbPrimary = this.hexToRgb(this.primaryColor);
        const rgbAccent = this.hexToRgb(this.accentColor);

        style.innerText = `
            :host {
                --primary-color: ${this.primaryColor};
                --primary-rgb: ${rgbPrimary};
                --accent-color: ${this.accentColor};
                --accent-rgb: ${rgbAccent};
                --text-color: ${this.textColor};
                --background-color: ${this.backgroundColor};
            }
        `;
        this.template.appendChild(style);
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
        // Use setTimeout to ensure the DOM is updated after currentStep changes
        setTimeout(() => {
            // Debug log for step class
            console.log(`Current step is ${this.currentStep}, using class: ${this.currentStepClass}`);
            
            // No specific classes to add/remove from path items as the CSS handles it based on step-N-mode class
            // But we can update aria attributes for accessibility
            const pathItems = this.template.querySelectorAll('.custom-path-item');
            console.log(`Found ${pathItems.length} path items`);
            
            // Get RGB values of theme colors for custom styling
            const primaryRgb = this.hexToRgb(this.primaryColor);
            const accentRgb = this.hexToRgb(this.accentColor);
            
            pathItems.forEach((item) => {
                const indicator = item.querySelector('.custom-path-indicator');
                const label = item.querySelector('.custom-path-label');
                const number = item.querySelector('.custom-path-number');
                
                if (!indicator) return;
                
                const itemStep = parseInt(item.dataset.step, 10);
                
                // Set aria-current for the current step
                const isCurrent = itemStep === this.currentStep - 1;
                indicator.setAttribute('aria-current', isCurrent ? 'step' : 'false');
                
                // Apply direct styles to ensure proper coloring
                if (itemStep < this.currentStep - 1) {
                    // Completed step - primary color
                    indicator.style.backgroundColor = this.primaryColor;
                    indicator.style.color = 'white';
                    indicator.style.borderColor = 'transparent';
                    indicator.style.boxShadow = `0 1px 4px rgba(${primaryRgb}, 0.3)`;
                    
                    // Convert number to checkmark
                    if (number) {
                        number.innerHTML = '✓';
                        number.style.fontSize = '1.2em';
                    }
                    
                    if (label) {
                        label.style.color = this.textColor;
                    }
                    
                    indicator.setAttribute('aria-label', 'Completed step');
                    console.log(`Step ${itemStep + 1} marked as completed`);
                    
                } else if (itemStep === this.currentStep - 1) {
                    // Current step - accent color
                    indicator.style.backgroundColor = this.accentColor;
                    indicator.style.color = 'white';
                    indicator.style.borderColor = 'transparent';
                    indicator.style.boxShadow = `0 2px 12px rgba(${accentRgb}, 0.5)`;
                    indicator.style.transform = 'translateY(-2px)';
                    
                    if (label) {
                        label.style.color = this.textColor;
                        label.style.fontWeight = '600';
                    }
                    
                    indicator.setAttribute('aria-label', 'Current step');
                    console.log(`Step ${itemStep + 1} marked as current`);
                    
                } else {
                    // Future step - reset to default
                    indicator.style.backgroundColor = '';
                    indicator.style.color = '';
                    indicator.style.borderColor = '';
                    indicator.style.boxShadow = '';
                    indicator.style.transform = '';
                    
                    if (label) {
                        label.style.color = '';
                        label.style.fontWeight = '';
                    }
                    
                    indicator.setAttribute('aria-label', 'Future step');
                    console.log(`Step ${itemStep + 1} marked as future`);
                }
            });
            
            // Also apply connecting lines coloring
            pathItems.forEach((item) => {
                const itemStep = parseInt(item.dataset.step, 10);
                // We need to color the line before steps that are completed or current
                if (itemStep <= this.currentStep - 1 && itemStep > 0) {
                    item.style.setProperty('--line-color', this.primaryColor);
                }
            });
            
            console.log(`Path classes updated for step: ${this.currentStep}`);
        }, 0); // setTimeout with 0ms delay defers execution until after the current stack clears
    }

    // --- Getters for Template Logic ---
    get isStep1() { return this.currentStep === 1; }
    get isStep2() { return this.currentStep === 2; }
    get isStep3() { return this.currentStep === 3; }
    get isStep4() { return this.currentStep === 4; }
    get isStep5() { return this.currentStep === 5; } // Sent Confirmation Step

    get step1Title() { return 'Step 1: Survey Details'; }
    get step2Title() { return 'Step 2: Build Questions'; }
    get step3Title() { return 'Step 3: Add Recipients'; }
    get step4Title() { return 'Step 4: Review and Send'; }
    get step5Title() { return 'Survey Sent!'; }

    get showPreviousButton() { return this.currentStep > 1 && this.currentStep < 5; } // Don't show on first or last step
    get showNextButton() { return this.currentStep < 4; } // Show until Review step
    get showSaveAndSendButton() { return this.currentStep === 4; } // Only on Review step
    get showCreateAnotherButton() { return this.currentStep === 5; } // Only on Confirmation step

    get nextButtonLabel() {
        return this.currentStep === 3 ? 'Review' : 'Next';
    }

    get currentStepClass() {
        // Used for CSS scoping based on current step
        // Adjust to use 0-indexed values for CSS classes to match the data-step attributes
        return `step-${this.currentStep - 1}-mode`;
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
        return `
            background-color: ${this.backgroundColor};
            color: ${this.textColor};
            border: 1px solid var(--border-color, #dddddd);
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
        `;
    }

    get questionsWithComputedFields() {
        return this.questions.map(q => ({
            ...q,
            showOptions: ['Multiple Choice - Single', 'Multiple Choice - Multiple'].includes(q.type)
        }));
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

        // *** ADDED LOGGING ***
        console.log(`handleQuestionChange: index=${questionIndex}, field=${field}, value=${value}`);

        // Find the question to update
        const updatedQuestions = this.questions.map((q, index) => {
            if (index === questionIndex) {
                const updatedQuestion = { ...q, [field]: value };

                // *** ADDED LOGGING ***
                console.log('handleQuestionChange: Updated question object:', JSON.stringify(updatedQuestion));

                // If type changes, reset options if it's no longer a choice type
                if (field === 'type' &&
                    !['Multiple Choice - Single', 'Multiple Choice - Multiple'].includes(value)) {
                    updatedQuestion.answerOptions = []; // Clear options for non-choice types
                }
                // If type becomes a choice type, add a default option if none exist
                else if (field === 'type' &&
                         ['Multiple Choice - Single', 'Multiple Choice - Multiple'].includes(value) &&
                         updatedQuestion.answerOptions.length === 0) {
                    updatedQuestion.answerOptions = [this.createAnswerOption(1)];
                }
                 // If Required checkbox changes
                 else if (field === 'isRequired') {
                     updatedQuestion.isRequired = value;
                 }

                return updatedQuestion;
            }
            return q;
        });

        this.questions = updatedQuestions;
        // *** ADDED LOGGING ***
        console.log('handleQuestionChange: Full questions array after update:', JSON.stringify(this.questions));
    }

    /**
     * Updates an answer option's text when it changes.
     */
    handleOptionChange(event) {
        const questionIndex = parseInt(event.target.dataset.qindex, 10);
        const optionIndex = parseInt(event.target.dataset.optindex, 10);
        const value = event.target.value;

        // Add debug logs
        console.log(`handleOptionChange: qIndex=${questionIndex}, oIndex=${optionIndex}, value=${value}`);

        const updatedQuestions = this.questions.map((q, qIndex) => {
            if (qIndex === questionIndex) {
                const updatedOptions = q.answerOptions.map((opt, oIndex) => {
                    if (oIndex === optionIndex) {
                        return { ...opt, optionText: value }; // Update 'optionText'
                    }
                    return opt;
                });
                return { ...q, answerOptions: updatedOptions };
            }
            return q;
        });
        this.questions = updatedQuestions;
    }

    /**
     * Updates the recipient email string.
     */
    handleEmailChange(event) {
        this.recipientEmails = event.target.value;
        // Force path update after a short delay to ensure visuals are correct
        setTimeout(() => {
            this.forcePathUpdate();
        }, 10);
    }

    // --- Question & Option Management ---
    /**
     * Adds a new, blank question to the survey.
     */
    addQuestion() {
        this.questionKeyCounter++;
        const newQuestion = {
            key: `question-${this.questionKeyCounter}`, // Unique key for LWC iteration
            sObjectType: 'Question__c', // Match Apex wrapper
            Id: null,
            questionText: '',
            type: 'Text', // Default type
            displayOrder: this.questions.length + 1,
            isRequired: false,
            answerOptions: [] // Initialize empty options array, matches wrapper
        };
        this.questions = [...this.questions, newQuestion];
    }

    /**
     * Removes a question based on its index.
     */
    removeQuestion(event) {
        const questionIndexToRemove = parseInt(event.target.dataset.index, 10);
        console.log(`Removing question at index ${questionIndexToRemove}`);
        
        this.questions = this.questions.filter((_, index) => index !== questionIndexToRemove);
        // Re-order remaining questions
        this.questions = this.questions.map((q, index) => ({ ...q, displayOrder: index + 1 }));
    }

    /**
     * Adds a new, blank answer option to a specific question.
     */
    addAnswerOption(event) {
        const questionIndex = parseInt(event.target.dataset.qindex, 10);
        console.log(`Adding option to question index ${questionIndex}`);

        this.questions = this.questions.map((q, index) => {
            if (index === questionIndex) {
                const newOrder = q.answerOptions.length + 1;
                const newOption = this.createAnswerOption(newOrder);
                return { ...q, answerOptions: [...q.answerOptions, newOption] };
            }
            return q;
        });
    }

    /**
     * Helper to create a new answer option object.
     */
    createAnswerOption(order) {
        this.optionKeyCounter++;
        return {
            key: `option-${this.optionKeyCounter}`, // Unique key for LWC iteration
            sObjectType: 'Answer_Option__c', // Match Apex wrapper
            Id: null,
            optionText: '', // Match wrapper
            displayOrder: order // Match wrapper
        };
    }

    /**
     * Removes an answer option from a specific question.
     */
    removeAnswerOption(event) {
        const questionIndex = parseInt(event.target.dataset.qindex, 10);
        const optionIndexToRemove = parseInt(event.target.dataset.optindex, 10);
        
        console.log(`Removing option ${optionIndexToRemove} from question ${questionIndex}`);

        this.questions = this.questions.map((q, index) => {
            if (index === questionIndex) {
                let updatedOptions = q.answerOptions.filter((_, oIndex) => oIndex !== optionIndexToRemove);
                // Re-order remaining options
                updatedOptions = updatedOptions.map((opt, oIndex) => ({ ...opt, displayOrder: oIndex + 1 }));
                return { ...q, answerOptions: updatedOptions };
            }
            return q;
        });
    }

    // --- Navigation and Validation ---
    /**
     * Moves to the next step if the current step is valid.
     */
    handleNext() {
        this.error = null; // Clear previous errors
        if (this.validateForm()) {
            // Log current step before changing
            console.log('Current step before navigation:', this.currentStep);
            
            // Fix navigation to ensure we can go to step 4
            this.currentStep++;
            
            // Update path classes based on new step
            this.updatePathClasses();
            
            // Log current step after changing
            console.log('Current step after navigation:', this.currentStep);
        } else {
            // Validation errors handled within validateForm (shows toast)
            console.log('Validation failed for step:', this.currentStep);
        }
    }

    /**
     * Moves to the previous step.
     */
    handlePrevious() {
        this.error = null; // Clear errors when moving back
        if (this.currentStep > 1) {
            this.currentStep--;
            this.updatePathClasses(); // Update path indicator
        }
    }

    /**
     * Validates the form fields for the current step.
     * @returns {boolean} True if the current step is valid, false otherwise.
     */
    validateForm() {
        let isValid = true;
        let errorMessage = '';

        if (this.currentStep === 1) { // Validate Survey Details
            if (!this.survey.Name || this.survey.Name.trim() === '') {
                isValid = false;
                errorMessage = 'Survey Name is required.';
            }
            // Add validation for Expiration_Date__c if needed (e.g., must be in the future)
            if (this.survey.Expiration_Date__c) {
                 const today = new Date();
                 today.setHours(0, 0, 0, 0); // Compare dates only
                 const expDate = new Date(this.survey.Expiration_Date__c);
                 // Adjust comparison to account for timezone differences if necessary
                 // For simplicity, comparing date part only
                 const expDateUTC = Date.UTC(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
                 const todayUTC = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());

                 if (expDateUTC < todayUTC) {
                      isValid = false;
                      errorMessage = 'Expiration Date cannot be in the past.';
                 }
            }

        } else if (this.currentStep === 2) { // Validate Questions
            if (this.questions.length === 0) {
                isValid = false;
                errorMessage = 'Please add at least one question.';
            } else {
                for (let i = 0; i < this.questions.length; i++) {
                    const q = this.questions[i];

                    // *** ADDED LOGGING ***
                    console.log(`validateForm (Step 2): Checking question ${i + 1}, questionText: '${q.questionText}'`, JSON.stringify(q));

                    if (!q.questionText || q.questionText.trim() === '') {
                        isValid = false;
                        errorMessage = `Question ${i + 1}: Question text cannot be empty.`;
                        break;
                    }
                    if (['Multiple Choice - Single', 'Multiple Choice - Multiple'].includes(q.type)) {
                        if (q.answerOptions.length < 2) {
                            isValid = false;
                            errorMessage = `Question ${i + 1}: Multiple choice questions require at least two answer options.`;
                            break;
                        }
                        for (let j = 0; j < q.answerOptions.length; j++) {
                            if (!q.answerOptions[j].optionText || q.answerOptions[j].optionText.trim() === '') {
                                isValid = false;
                                errorMessage = `Question ${i + 1}, Option ${j + 1}: Answer option text cannot be empty.`;
                                break; // Break inner loop
                            }
                        }
                        if (!isValid) break; // Break outer loop if inner validation failed
                    }
                }
            }
        } else if (this.currentStep === 3) { // Validate Recipients
            // First validate if any emails are provided
            if (!this.recipientEmails || this.recipientEmails.trim() === '') {
                isValid = false;
                errorMessage = 'Please enter at least one recipient email address.';
            } else {
                // Get the list of emails and validate them
                const emailList = this.emailList;
                if (emailList.length === 0) {
                    isValid = false;
                    errorMessage = 'Please enter at least one valid recipient email address.';
                } else if (!this.validateEmails(emailList)) {
                    isValid = false;
                    errorMessage = 'One or more email addresses are invalid. Please check the format.';
                }
            }
            
            // Note: We'll only check publicSiteUrl during final send in step 4
            // This allows users to proceed with the survey creation workflow
            console.log(`Validation for step 3 - Valid: ${isValid}, Emails: ${this.recipientEmails}`);
        } else if (this.currentStep === 4) { // Validate before sending
            // Check publicSiteUrl before allowing send
            if (!this.publicSiteUrl || this.publicSiteUrl.trim() === '') {
                isValid = false;
                errorMessage = 'A valid Public Site URL is required to send surveys.';
            } else if (!this.publicSiteUrl.toLowerCase().startsWith('http')) {
                isValid = false;
                errorMessage = 'Public Site URL must start with http:// or https://';
            }
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
     * Handles the final "Save and Send" button click.
     * Validates the entire survey, saves it, and sends invitations.
     */
    async handleSendSurvey() {
        this.error = null; // Clear previous errors

        // Final validation check (redundant if steps were followed, but good practice)
        if (!this.validateForm() && this.currentStep < 4) {
             this.showToast('Validation Error', 'Please complete all previous steps.', 'error');
             return;
        }
        const emailList = this.emailList;
        if (emailList.length === 0 || !this.validateEmails(emailList)) {
            this.showToast('Validation Error', 'Please provide at least one valid recipient email address.', 'error');
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

        // Prepare the data structure for Apex - matching the updated wrappers
        const surveyData = {
            survey: this.survey,       // Directly pass the survey object
            questions: this.questions // Pass the questions array
        };

        try {
            // Step 1: Save the Survey definition
            const savedSurveyId = await saveSurvey({ surveyJson: JSON.stringify(surveyData) });
            this.surveyId = savedSurveyId; // Store the returned ID
            console.log('Survey saved successfully with ID:', this.surveyId);

            // Step 2: If save was successful, create responses and send emails
            if (this.surveyId) {
                const sendResultCount = await createAndSendResponses({
                    surveyId: this.surveyId,
                    recipientEmails: emailList,
                    publicSiteUrl: this.publicSiteUrl
                });

                this.sentCount = sendResultCount;
                this.showToast('Success', `Survey saved and ${this.sentCount} invitations sent successfully!`, 'success');
                this.currentStep = 5; // Move to confirmation step
                this.updatePathClasses(); // Update path indicator
            } else {
                 // This case should ideally not happen if saveSurvey throws on error
                 throw new Error('Failed to save the survey, cannot proceed to send.');
            }

        } catch (error) {
            // Use reduceErrors to get a clean message
            const errorMessage = reduceErrors(error).join(', ');
            this.error = errorMessage;
            this.showToast('Error', `Failed to save or send survey: ${errorMessage}`, 'error');
            console.error('Error saving/sending survey:', error); // Log detailed error

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

        // Clear any visual error indicators if necessary
        // (e.g., remove error classes from inputs - handled by LWC reactivity)
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
        const step = parseInt(event.currentTarget.dataset.step, 10) + 1; // Convert 0-indexed to 1-indexed
        
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
        if (this.currentStep === 5 && step < 5) {
            this.showToast(
                'Survey Already Sent', 
                'This survey has already been sent. Create a new one to start over.', 
                'warning'
            );
            return;
        }
        
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
}