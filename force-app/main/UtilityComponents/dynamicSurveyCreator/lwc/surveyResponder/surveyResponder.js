import { LightningElement, api, track, wire } from 'lwc';
import getSurveyDetails from '@salesforce/apex/SurveyPublicController.getSurveyDetails';
import submitSurveyResponse from '@salesforce/apex/SurveyPublicController.submitSurveyResponse';
import { CurrentPageReference } from 'lightning/navigation';

export default class SurveyResponder extends LightningElement {
    // --- Public API Properties ---
    /**
     * The unique ID from the URL identifying this specific survey response attempt.
     * This will typically be passed via the URL parameter.
     * @type {string}
     */
    _responseId;
    @api get responseId() {
        return this._responseId;
    }
    set responseId(value) {
        this._responseId = value;
        // If the responseId changes, reload the survey
        if (value) {
            this.loadSurvey();
        }
    }

    // --- Theme Properties (Can be set if used within an Experience Cloud theme layout) ---
    @api primaryColor = '#22BDC1';
    @api accentColor = '#D5DF23';
    @api textColor = '#1d1d1f';
    @api backgroundColor = '#ffffff';

    // --- State Properties ---
    /**
     * @description Holds the survey data (Survey__c, Questions__r, Answer_Options__r) fetched from Apex.
     */
    @track surveyData;
    /**
     * @description Stores the user's responses, keyed by Question__c ID.
     */
    @track responses = {};
    /**
     * @description Indicates if the survey data is currently being loaded.
     */
    @track isLoading = true;
    /**
     * @description Indicates if the response is currently being submitted.
     */
    @track isSubmitting = false;
    /**
     * @description Indicates if the survey response has been successfully submitted.
     */
    @track isCompleted = false;
    /**
     * @description Holds any error message during the loading process.
     */
    @track loadError;
    /**
     * @description Holds any error message during the submission process.
     */
    @track submitError;
    /**
     * @description The record ID of the Survey_Response__c being updated.
     */
    surveyResponseRecordId;

    // --- Wired Properties ---
    /**
     * @description Wires the CurrentPageReference to potentially extract the responseId from URL state.
     */
    @wire(CurrentPageReference)
    getStateParameters(currentPageReference) {
       if (currentPageReference && currentPageReference.state) {
          // Look for a state parameter named 'responseId' (adjust key if needed)
          const stateResponseId = currentPageReference.state.responseId;
          if (stateResponseId && !this._responseId) {
             console.log('Setting responseId from page state:', stateResponseId);
             this.responseId = stateResponseId;
          }
       }
    }

    // --- Getters for Template Logic ---

    /**
     * @description Dynamically computes the style for the main container based on theme properties.
     */
    get componentStyle() {
        return `
            --primary-color: ${this.primaryColor};
            --accent-color: ${this.accentColor};
            --text-color: ${this.textColor};
            --background-color: ${this.backgroundColor};
            /* Add other derived variables if needed */
        `;
    }

    /**
     * @description Options for the Rating (1-5) question type.
     */
    get ratingOptions() {
        const options = [];
        for (let i = 1; i <= 5; i++) {
            options.push({ label: String(i), value: String(i) });
        }
        return options;
    }

    // --- Lifecycle Hooks ---

    /**
     * @description Called when the component is inserted. Checks if responseId is already set.
     */
    connectedCallback() {
        if (this._responseId) {
            this.loadSurvey();
        } else {
            // If responseId is not set via @api or URL state by now, show an error
            this.loadError = 'Survey response ID is missing. Please check the link.';
            this.isLoading = false;
            console.error('SurveyResponder: responseId is missing.');
        }
    }

    // --- Data Loading ---
    /**
     * @description Loads the survey details from the Apex controller based on the responseId.
     */
    loadSurvey() {
        if (!this._responseId) {
            this.loadError = 'Cannot load survey: Response ID is missing.';
            this.isLoading = false;
            return;
        }

        this.isLoading = true;
        this.loadError = null;
        this.surveyData = null;
        this.responses = {};
        this.isCompleted = false;

        getSurveyDetails({ responseId: this._responseId })
            .then(result => {
                this.surveyResponseRecordId = result.responseId;
                // Process the data for easier template rendering
                const processedData = this.processSurveyData(result);
                this.surveyData = processedData;
                this.isLoading = false;
            })
            .catch(error => {
                console.error('Error loading survey:', error);
                this.loadError = this.reduceErrors(error).join(', ') || 'An unknown error occurred while loading the survey.';
                this.isLoading = false;
            });
    }

    /**
     * @description Processes the raw survey data from Apex to add helper flags and format options.
     * @param {object} rawData - The data returned from SurveyPublicController.getSurveyDetails.
     * @returns {object} Processed survey data suitable for the template.
     */
    processSurveyData(rawData) {
        if (!rawData || !rawData.questions) {
            return rawData;
        }

        const processedQuestions = rawData.questions.map((q, index) => {
            const question = { ...q }; // Clone the question object
            question.displayOrder = index + 1;
            question.isText = q.Type__c === 'Text';
            question.isTextarea = q.Type__c === 'Textarea';
            question.isRadio = q.Type__c === 'Radio';
            question.isCheckbox = q.Type__c === 'Checkbox';
            question.isRating = q.Type__c === 'Rating (1-5)';

            // Format options for radio/checkbox groups
            if (question.isRadio || question.isCheckbox) {
                question.Answer_Options__r = (q.Answer_Options__r || []).map(opt => ({
                    label: opt.Option_Text__c,
                    value: opt.Option_Text__c // Use text as value for simplicity
                }));
            }

            return question;
        });

        return {
            ...rawData,
            questions: processedQuestions
        };
    }

    // --- Response Handling ---

    /**
     * @description Handles changes in input fields (Text, Textarea, Radio, Checkbox).
     * @param {Event} event - The input change event.
     */
    handleResponseChange(event) {
        const questionId = event.target.dataset.id;
        const value = event.target.value;
        this.responses[questionId] = value;

        // Special handling for rating validation input if needed
        if(event.target.classList.contains('rating-validation-input')){
             this.updateRatingValidation(questionId, value);
        }
    }

    /**
     * @description Handles clicks on rating buttons.
     * @param {Event} event - The button click event.
     */
    handleRatingClick(event) {
        const questionId = event.currentTarget.dataset.id;
        const value = event.currentTarget.dataset.value;

        // Update the internal response state
        this.responses[questionId] = value;

        // Update button styles visually
        const buttons = this.template.querySelectorAll(`.rating-button[data-id="${questionId}"]`);
        buttons.forEach(button => {
            const buttonValue = button.dataset.value;
            const isSelected = buttonValue === value;
            button.classList.toggle('selected', isSelected);
            button.setAttribute('aria-pressed', isSelected);
        });

        // Update hidden input for validation purposes
        this.updateRatingValidation(questionId, value);
    }

    /**
    * @description Updates the hidden input associated with a rating question for validation.
    * @param {string} questionId - The ID of the question.
    * @param {string} value - The selected rating value.
    */
    updateRatingValidation(questionId, value){
        const validationInput = this.template.querySelector(`.rating-validation-input[data-id="${questionId}"]`);
        if(validationInput) {
            validationInput.value = value; // Set value to allow LWC validation
            validationInput.reportValidity(); // Trigger validation check
        }
    }

    // --- Submission Logic ---

    /**
     * @description Validates the form before submission.
     * @returns {boolean} True if the form is valid, false otherwise.
     */
    validateResponses() {
        let isValid = true;

        // Use lightning-input/textarea/radio/checkbox built-in validation
        this.template.querySelectorAll('lightning-input, lightning-textarea, lightning-radio-group, lightning-checkbox-group').forEach(input => {
            if (!input.reportValidity()) {
                isValid = false;
            }
        });

        // Custom validation for required rating questions
        this.template.querySelectorAll('.rating-validation-input[required]').forEach(input => {
            if (!input.value) {
                // Manually show error message - LWC validation doesn't work well on hidden inputs
                const questionContainer = input.closest('.question-container');
                if (questionContainer) {
                    let errorElement = questionContainer.querySelector('.rating-error-message');
                    if (!errorElement) {
                        errorElement = document.createElement('div');
                        errorElement.className = 'slds-form-element__help slds-text-color_error rating-error-message';
                        input.parentNode.appendChild(errorElement);
                    }
                    errorElement.textContent = 'Please select a rating.';
                }
                isValid = false;
            } else {
                 const questionContainer = input.closest('.question-container');
                 if (questionContainer) {
                    const errorElement = questionContainer.querySelector('.rating-error-message');
                    if(errorElement) errorElement.remove();
                 }
            }
        });

        return isValid;
    }

    /**
     * @description Handles the submission of the survey responses.
     */
    handleSubmit() {
        this.submitError = null; // Clear previous errors

        if (!this.validateResponses()) {
            this.submitError = 'Please answer all required questions before submitting.';
            return;
        }

        this.isSubmitting = true;

        // Prepare the data to send to Apex
        const responseDataJson = JSON.stringify(this.responses);

        submitSurveyResponse({ responseId: this.surveyResponseRecordId, responseDataJson: responseDataJson })
            .then(result => {
                console.log('Submission successful:', result);
                this.isCompleted = true;
                this.isSubmitting = false;
                // Optionally scroll to top or show thank you message prominently
                window.scrollTo(0, 0);
            })
            .catch(error => {
                console.error('Error submitting survey:', error);
                this.submitError = this.reduceErrors(error).join(', ') || 'An unknown error occurred while submitting.';
                this.isSubmitting = false;
            });
    }

    // --- Utility Functions ---

    /**
     * Reduces Salesforce Apex errors into a readable string array.
     * @param {object} errors - The error object from a wire or imperative Apex call.
     * @returns {string[]} An array of error messages.
     */
    reduceErrors(errors) {
        if (!Array.isArray(errors)) {
            errors = [errors];
        }

        return (
            errors
                .filter((error) => !!error)
                .map((error) => {
                    if (Array.isArray(error.body)) {
                        return error.body.map((e) => e.message);
                    }
                    else if (error?.body?.message) {
                        return error.body.message;
                    }
                    else if (error?.message) {
                        return error.message;
                    }
                    return 'Unknown error';
                })
                .flat()
        );
    }
} 