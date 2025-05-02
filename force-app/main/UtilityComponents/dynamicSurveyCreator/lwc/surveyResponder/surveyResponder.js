import { LightningElement, api, track, wire } from 'lwc';
import getSurveyById from '@salesforce/apex/SurveyPublicController.getSurveyById';
import submitSurveyResponse from '@salesforce/apex/SurveyPublicController.submitSurveyResponse';
import { CurrentPageReference } from 'lightning/navigation';

export default class SurveyResponder extends LightningElement {
    // --- Public API Properties ---
    /**
     * The ID of the survey to load directly.
     * This will be the primary identifier used to load the survey.
     * @type {string}
     */
    _surveyId;
    @api get surveyId() {
        return this._surveyId;
    }
    set surveyId(value) {
        this._surveyId = value;
        // If the surveyId changes, load the survey
        if (value) {
            this.loadSurvey();
        }
    }

    // --- Theme Properties (Can be set if used within an Experience Cloud theme layout) ---
    @api primaryColor = '#22BDC1';
    @api accentColor = '#D5DF23';
    @api textColor = '#1d1d1f';
    @api backgroundColor = '#ffffff';
    
    /**
     * If false, prevents users from submitting the same survey multiple times from the same browser.
     * @type {boolean}
     */
    @api allowMultipleSubmissions = false;

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
    
    /**
     * @description Indicates if the user has previously submitted this survey.
     */
    @track hasPreviouslySubmitted = false;
    
    /**
     * @description Browser device fingerprint used for tracking submissions.
     */
    deviceFingerprint;

    // --- Wired Properties ---
    /**
     * @description Wires the CurrentPageReference to extract the survey ID from URL state.
     */
    @wire(CurrentPageReference)
    getStateParameters(currentPageReference) {
       console.log('SurveyResponder: Page reference received:', JSON.stringify(currentPageReference));
       if (currentPageReference && currentPageReference.state) {
          console.log('SurveyResponder: Page state:', JSON.stringify(currentPageReference.state));
          
          // Look for survey ID in URL parameters
          // Check both 'id' and 'surveyId' parameters for flexibility
          const urlSurveyId = currentPageReference.state.id || currentPageReference.state.surveyId;
          
          console.log('SurveyResponder: Extracted surveyId:', urlSurveyId);
          
          if (urlSurveyId && !this._surveyId) {
             console.log('SurveyResponder: Setting surveyId from page state:', urlSurveyId);
             this.surveyId = urlSurveyId;
          } else if (!urlSurveyId) {
             console.warn('SurveyResponder: No survey ID found in page state.');
          }
       } else {
           console.warn('SurveyResponder: No currentPageReference or state received.');
       }
    }

    // --- Getters for Template Logic ---
    get componentStyle() {
        return `
            --primary-color: ${this.primaryColor};
            --primary-color-rgb: ${this.hexToRgb(this.primaryColor)};
            --accent-color: ${this.accentColor};
            --accent-color-rgb: ${this.hexToRgb(this.accentColor)};
            --text-color: ${this.textColor};
            --background-color: ${this.backgroundColor};
        `;
    }

    // --- Rating options getter ---
    get ratingOptions() {
        // This assumes a 5-point rating scale
        const options = [];
        for (let i = 1; i <= 5; i++) {
            options.push({
                value: i.toString(),
                label: i.toString(),
                class: 'rating-button'
            });
        }
        return options;
    }

    // --- Lifecycle Hooks ---
    /**
     * @description Called when the component is inserted. Checks if surveyId is already set.
     */
    connectedCallback() {
        console.log('SurveyResponder: connectedCallback started. surveyId:', this._surveyId);

        // Generate a device fingerprint for tracking submissions
        this.generateDeviceFingerprint();
        
        if (this._surveyId) {
            this.loadSurvey();
        } else {
            // If surveyId is not set via @api or URL state by now, show an error after a short delay
            // to allow wire service to potentially populate values
            const checkState = () => {
                if (this._surveyId) {
                    console.log('SurveyResponder: surveyId found after delay, loading survey.');
                    this.loadSurvey();
                } else {
                    console.error('SurveyResponder: No survey ID found after delay.');
                    this.loadError = 'Survey ID is missing. Please check the link.';
                    this.isLoading = false;
                }
            };
            // Wait a short moment for the @wire to potentially complete
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            setTimeout(checkState, 300); 
        }
    }

    /**
     * @description Generates a simple device fingerprint based on browser properties
     */
    generateDeviceFingerprint() {
        const components = [];
        
        // Browser and platform information
        components.push(navigator.userAgent);
        components.push(navigator.language);
        components.push(screen.width + 'x' + screen.height + 'x' + screen.colorDepth);
        components.push(new Date().getTimezoneOffset());
        
        // Try to get additional browser features
        if (navigator.plugins) {
            components.push(navigator.plugins.length);
        }
        
        // Create a simple hash
        let fingerprint = components.join('|');
        
        // Convert to a simple hash
        let hash = 0;
        for (let i = 0; i < fingerprint.length; i++) {
            hash = ((hash << 5) - hash) + fingerprint.charCodeAt(i);
            hash |= 0; // Convert to 32bit integer
        }
        
        // Store the fingerprint
        this.deviceFingerprint = 'device_' + Math.abs(hash).toString(16);
        console.log('Device fingerprint generated:', this.deviceFingerprint);
    }

    // --- Data Loading ---
    /**
     * @description Loads the survey details directly using the survey ID.
     */
    loadSurvey() {
        if (!this._surveyId) {
            this.loadError = 'Cannot load survey: Survey ID is missing.';
            this.isLoading = false;
            return;
        }

        this.isLoading = true;
        this.loadError = null;
        this.surveyData = null;
        this.responses = {};
        this.isCompleted = false;

        // Check if the survey has already been submitted by this device
        this.checkPreviousSubmission();

        getSurveyById({ surveyId: this._surveyId })
            .then(result => {
                // Store the responseId if it's provided (legacy support)
                if (result.responseId) {
                    this.surveyResponseRecordId = result.responseId;
                }
                
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
     * @description Checks if the user has previously submitted this survey
     */
    checkPreviousSubmission() {
        if (!this.allowMultipleSubmissions && this._surveyId) {
            try {
                // Get the stored submission records from localStorage
                const storageKey = 'SurveyResponder_Submissions';
                const submissionsStr = localStorage.getItem(storageKey);
                
                if (submissionsStr) {
                    const submissions = JSON.parse(submissionsStr);
                    
                    // Check if this survey ID is in the submissions list for this device
                    if (submissions[this.deviceFingerprint] && 
                        submissions[this.deviceFingerprint].includes(this._surveyId)) {
                        console.log('User has previously submitted this survey');
                        this.hasPreviouslySubmitted = true;
                        this.isCompleted = true; // Show the thank you screen
                        
                        // Don't set loadError since this isn't an error condition
                        // This will prevent the error panel from showing
                    } else {
                        this.hasPreviouslySubmitted = false;
                    }
                } else {
                    this.hasPreviouslySubmitted = false;
                }
            } catch (error) {
                console.error('Error checking previous submissions:', error);
                // In case of error, we let the user continue
                this.hasPreviouslySubmitted = false;
            }
        }
    }

    /**
     * @description Records a submission for the current survey and device
     */
    recordSubmission() {
        if (!this.allowMultipleSubmissions && this._surveyId) {
            try {
                // Get the stored submission records from localStorage
                const storageKey = 'SurveyResponder_Submissions';
                const submissionsStr = localStorage.getItem(storageKey);
                
                // Parse existing submissions or create a new object
                let submissions = {};
                if (submissionsStr) {
                    submissions = JSON.parse(submissionsStr);
                }
                
                // Ensure the device entry exists
                if (!submissions[this.deviceFingerprint]) {
                    submissions[this.deviceFingerprint] = [];
                }
                
                // Add this survey ID to the submissions list for this device
                if (!submissions[this.deviceFingerprint].includes(this._surveyId)) {
                    submissions[this.deviceFingerprint].push(this._surveyId);
                }
                
                // Store back to localStorage
                localStorage.setItem(storageKey, JSON.stringify(submissions));
                console.log('Recorded survey submission for deviceFingerprint:', this.deviceFingerprint);
            } catch (error) {
                console.error('Error recording submission:', error);
            }
        }
    }

    /**
     * @description Processes survey data for use in the template.
     */
    processSurveyData(rawData) {
        // Check if survey is null or empty
        if (!rawData || !rawData.survey || !rawData.questions) {
            return null;
        }

        // Process the questions array to add display properties
        const processedQuestions = rawData.questions.map((question, index) => {
            // Create a new object instead of modifying the original directly
            let processedQuestion = { ...question };
            
            // Set the display order (1-based)
            processedQuestion.displayOrder = index + 1;

            // Add question type flags for template rendering
            processedQuestion.isText = question.Type__c === 'Text';
            processedQuestion.isTextarea = question.Type__c === 'Long Text';
            processedQuestion.isRadio = question.Type__c === 'Single Select';
            processedQuestion.isCheckbox = question.Type__c === 'Multi Select';
            processedQuestion.isRating = question.Type__c === 'Rating';

            // For checkbox and radio options, format for the lightning-* components
            if ((processedQuestion.isRadio || processedQuestion.isCheckbox) && question.Answer_Options__r) {
                processedQuestion.Answer_Options__r = question.Answer_Options__r.map(option => ({
                    label: option.Option_Text__c,
                    value: option.Id
                }));
            }

            return processedQuestion;
        });

        // Return the processed data
        return {
            survey: rawData.survey,
            questions: processedQuestions
        };
    }

    /**
     * @description Handles regular inputs and textareas.
     */
    handleResponseChange(event) {
        const questionId = event.target.dataset.id;
        const value = event.target.value;
        
        this.responses[questionId] = value;
    }

    /**
     * @description Handles rating selections.
     */
    handleRatingClick(event) {
        const questionId = event.currentTarget.dataset.id;
        const value = event.currentTarget.dataset.value;
        
        // Update the response
        this.responses[questionId] = value;
        
        // Update the validation for this rating
        this.updateRatingValidation(questionId, value);
        
        // Update the UI to show the selected rating
        const ratingButtons = this.template.querySelectorAll(`button[data-id="${questionId}"]`);
        ratingButtons.forEach(button => {
            const buttonValue = button.dataset.value;
            // Compare as strings to ensure type safety
            if (buttonValue <= value) {
                button.classList.add('rating-selected');
                button.setAttribute('aria-pressed', 'true');
            } else {
                button.classList.remove('rating-selected');
                button.setAttribute('aria-pressed', 'false');
            }
        });
    }

    /**
     * @description Updates hidden input used for validation of rating questions
     */
    updateRatingValidation(questionId, value){
        const validationInput = this.template.querySelector(`.rating-validation-input[data-id="${questionId}"]`);
        if (validationInput) {
            validationInput.value = value || '';
            // Manually trigger validation if empty
            if (!value && validationInput.required) {
                validationInput.reportValidity();
            }
        }
    }

    /**
     * @description Validates all required questions have answers.
     * @returns {Object} Object with isValid and errorMessage properties.
     */
    validateResponses() {
        if (!this.surveyData || !this.surveyData.questions) {
            return { 
                isValid: false, 
                errorMessage: 'No survey data available.' 
            };
        }

        let allValid = true;
        let errorMessage = '';
        
        // Check all required questions
        for (const question of this.surveyData.questions) {
            if (question.Is_Required__c) {
                const response = this.responses[question.Id];
                
                if (!response) {
                    // No response for this required question
                    allValid = false;
                    errorMessage = 'Please answer all required questions before submitting.';
                    
                    // Mark the question as invalid in the UI
                    // This depends on how you're managing validation in the template
                    this.updateRatingValidation(question.Id, null);
                    
                    // Find any lightning-input, lightning-textarea, etc. related to this question
                    const inputElements = this.template.querySelectorAll(`[data-id="${question.Id}"]`);
                    inputElements.forEach(input => {
                        if (input.reportValidity) {
                            input.reportValidity();
                        }
                    });
                }
            }
        }
        
        return { 
            isValid: allValid, 
            errorMessage: errorMessage || 'Please correct the errors before submitting.' 
        };
    }

    /**
     * @description Handles the form submission and sends responses to the server.
     */
    handleSubmit() {
        // Check if the user has already submitted this survey
        if (!this.allowMultipleSubmissions && this.hasPreviouslySubmitted) {
            this.submitError = 'You have already submitted a response to this survey.';
            return;
        }

        // Validate responses
        const { isValid, errorMessage } = this.validateResponses();
        if (!isValid) {
            this.submitError = errorMessage;
            return;
        }

        this.isSubmitting = true;
        this.submitError = null;

        // Prepare the response data
        const responseData = JSON.stringify(this.responses);

        // Submit the survey response
        submitSurveyResponse({ 
            responseId: this.surveyResponseRecordId, 
            responseDataJson: responseData,
            surveyId: this._surveyId // Pass the survey ID for new response creation
        })
            .then(result => {
                this.isSubmitting = false;
                this.isCompleted = true;
                
                // Record this submission to prevent duplicates
                this.recordSubmission();
                this.hasPreviouslySubmitted = true;
                
                // Dispatch a custom event that other components could listen for
                this.dispatchEvent(new CustomEvent('surveysubmit', {
                    detail: {
                        success: true,
                        message: result
                    }
                }));
            })
            .catch(error => {
                this.isSubmitting = false;
                console.error('Error submitting survey:', error);
                this.submitError = this.reduceErrors(error).join(', ') || 'An unknown error occurred while submitting the survey.';
                
                this.dispatchEvent(new CustomEvent('surveysubmit', {
                    detail: {
                        success: false,
                        message: this.submitError
                    }
                }));
            });
    }

    /**
     * @description Utility function to extract error messages from complex error objects.
     */
    reduceErrors(errors) {
        if (!Array.isArray(errors)) {
            errors = [errors];
        }

        return (
            errors
                // Remove null/undefined items
                .filter(error => !!error)
                // Extract an error message
                .map(error => {
                    // UI API read errors
                    if (Array.isArray(error.body)) {
                        return error.body.map(e => e.message);
                    }
                    // UI API DML, Apex and network errors
                    else if (error.body && typeof error.body.message === 'string') {
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
                .filter(message => !!message)
        );
    }

    /**
     * Utility function to convert hex color to RGB.
     */
    hexToRgb(hex) {
        // Remove the hash if it exists
        hex = hex.replace(/^#/, '');
        
        // Parse the hex color
        const bigint = parseInt(hex, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        
        return `${r}, ${g}, ${b}`;
    }
} 