import { LightningElement, api, track, wire } from "lwc";
import getSurveyById from "@salesforce/apex/SurveyPublicController.getSurveyById";
import getSurveyByResponseId from "@salesforce/apex/SurveyPublicController.getSurveyByResponseId";
import validatePasscode from "@salesforce/apex/SurveyPublicController.validatePasscode";
import validatePasscodeBySurveyId from "@salesforce/apex/SurveyPublicController.validatePasscodeBySurveyId";
import submitSurveyResponse from "@salesforce/apex/SurveyPublicController.submitSurveyResponse";
import { CurrentPageReference } from "lightning/navigation";

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
  @api primaryColor = "#22BDC1";
  @api accentColor = "#D5DF23";
  @api textColor = "#1d1d1f";
  @api backgroundColor = "#ffffff";

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

  /**
   * @description Tracks the ID of the current question for rating components
   */
  currentQuestion;

  // --- Passcode Properties ---
  /**
   * @description Indicates if the survey requires a passcode
   */
  @track requiresPasscode = false;

  /**
   * @description Indicates if passcode screen should be shown
   */
  @track showPasscodeScreen = false;

  /**
   * @description The passcode entered by the user
   */
  @track enteredPasscode = "";

  /**
   * @description The response ID from URL parameters
   */
  responseId;

  /**
   * @description Error message for passcode validation
   */
  @track passcodeError;

  // --- Wired Properties ---
  /**
   * @description Wires the CurrentPageReference to extract the survey ID from URL state.
   */
  @wire(CurrentPageReference)
  getStateParameters(currentPageReference) {
    console.log(
      "SurveyResponder: Page reference received:",
      JSON.stringify(currentPageReference)
    );
    if (currentPageReference && currentPageReference.state) {
      console.log(
        "SurveyResponder: Page state:",
        JSON.stringify(currentPageReference.state)
      );

      // Look for response ID or survey ID in URL parameters
      const urlResponseId = currentPageReference.state.responseId;
      const urlSurveyId =
        currentPageReference.state.id || currentPageReference.state.surveyId;

      console.log("SurveyResponder: Extracted responseId:", urlResponseId);
      console.log("SurveyResponder: Extracted surveyId:", urlSurveyId);

      if (urlResponseId) {
        console.log(
          "SurveyResponder: Setting responseId from page state:",
          urlResponseId
        );
        this.responseId = urlResponseId;
        this.loadSurveyByResponseId();
      } else if (urlSurveyId && !this._surveyId) {
        console.log(
          "SurveyResponder: Setting surveyId from page state:",
          urlSurveyId
        );
        this.surveyId = urlSurveyId;
      } else {
        console.warn(
          "SurveyResponder: No survey ID or response ID found in page state."
        );
      }
    } else {
      console.warn(
        "SurveyResponder: No currentPageReference or state received."
      );
    }
  }

  // --- Getters for Template Logic ---
  get componentStyle() {
    // Use direct API properties with fallbacks
    const primaryColor = this.primaryColor || "#22BDC1";
    const accentColor = this.accentColor || "#D5DF23";
    const textColor = this.textColor || "#1d1d1f";
    const backgroundColor = this.backgroundColor || "#ffffff";

    // Convert hex to RGB for rgba values
    const primaryRgb = this.hexToRgb(primaryColor);
    const accentRgb = this.hexToRgb(accentColor);

    // Return a single-line string to avoid CSS validation errors
    return `--primary-color: ${primaryColor}; --primary-color-rgb: ${primaryRgb}; --accent-color: ${accentColor}; --accent-color-rgb: ${accentRgb}; --background-color: ${backgroundColor}; --text-color: ${textColor};`;
  }

  // --- Rating options getter ---
  get ratingOptions() {
    const ratings = [];
    // Assuming we want 5 rating options
    const maxRating = 5;

    for (let i = 1; i <= maxRating; i++) {
      // Check if this rating is selected for the currently active question
      const isSelected = this.responses[this.currentQuestion] === i.toString();

      ratings.push({
        value: i.toString(),
        class: isSelected ? "rating-option rating-selected" : "rating-option",
        selected: isSelected
      });
    }

    return ratings;
  }

  // --- Lifecycle Hooks ---
  /**
   * @description Called when the component is inserted. Checks if surveyId is already set.
   */
  connectedCallback() {
    console.log("SurveyResponder: connectedCallback started");

    // Log the current color values for debugging
    console.log("Color values being applied:", {
      primaryColor: this.primaryColor,
      accentColor: this.accentColor,
      textColor: this.textColor,
      backgroundColor: this.backgroundColor
    });

    // Generate a device fingerprint for tracking submissions
    this.generateDeviceFingerprint();

    if (this._surveyId) {
      this.loadSurvey();
    } else {
      // If surveyId is not set via @api or URL state by now, show an error after a short delay
      // to allow wire service to potentially populate values
      const checkState = () => {
        if (this._surveyId) {
          console.log(
            "SurveyResponder: surveyId found after delay, loading survey."
          );
          this.loadSurvey();
        } else {
          console.error("SurveyResponder: No survey ID found after delay.");
          this.loadError = "Survey ID is missing. Please check the link.";
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
    components.push(
      screen.width + "x" + screen.height + "x" + screen.colorDepth
    );
    components.push(new Date().getTimezoneOffset());

    // Try to get additional browser features
    if (navigator.plugins) {
      components.push(navigator.plugins.length);
    }

    // Create a simple hash
    let fingerprint = components.join("|");

    // Convert to a simple hash
    let hash = 0;
    for (let i = 0; i < fingerprint.length; i++) {
      hash = (hash << 5) - hash + fingerprint.charCodeAt(i);
      hash |= 0; // Convert to 32bit integer
    }

    // Store the fingerprint
    this.deviceFingerprint = "device_" + Math.abs(hash).toString(16);
    console.log("Device fingerprint generated:", this.deviceFingerprint);
  }

  // --- Data Loading ---
  /**
   * @description Loads the survey details using a response ID (with potential passcode requirement)
   */
  loadSurveyByResponseId() {
    if (!this.responseId) {
      this.loadError = "Cannot load survey: Response ID is missing.";
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    this.loadError = null;
    this.surveyData = null;
    this.responses = {};
    this.isCompleted = false;
    this.passcodeError = null;

    // First, try to load without passcode to check if it's required
    getSurveyByResponseId({ responseId: this.responseId, passcode: null })
      .then((result) => {
        this.processSurveyResult(result);
      })
      .catch((error) => {
        const errorMessage = this.reduceErrors(error).join(", ");
        console.error("Error loading survey by response ID:", error);

        // Check if it's a passcode-related error
        if (
          errorMessage.includes("passcode") ||
          errorMessage.includes("Passcode")
        ) {
          this.requiresPasscode = true;
          this.showPasscodeScreen = true;
          this.isLoading = false;
        } else {
          this.loadError =
            errorMessage ||
            "An unknown error occurred while loading the survey.";
          this.isLoading = false;
        }
      });
  }

  /**
   * @description Loads the survey details directly using the survey ID.
   */
  loadSurvey() {
    if (!this._surveyId) {
      this.loadError = "Cannot load survey: Survey ID is missing.";
      this.isLoading = false;
      return;
    }

    this.isLoading = true;
    this.loadError = null;
    this.surveyData = null;
    this.responses = {};
    this.isCompleted = false;
    this.passcodeError = null;

    // Check if the survey has already been submitted by this device
    this.checkPreviousSubmission();

    getSurveyById({ surveyId: this._surveyId })
      .then((result) => {
        // Check if survey requires passcode and we don't have a response ID
        if (result.requiresPasscode && !this.responseId) {
          // For direct survey access with passcode requirement, show passcode screen
          this.requiresPasscode = true;
          this.showPasscodeScreen = true;
          this.surveyData = result; // Store survey data for later use
          this.isLoading = false;
        } else {
          this.processSurveyResult(result);
        }
      })
      .catch((error) => {
        console.error("Error loading survey:", error);
        this.loadError =
          this.reduceErrors(error).join(", ") ||
          "An unknown error occurred while loading the survey.";
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
        const storageKey = "SurveyResponder_Submissions";
        const submissionsStr = localStorage.getItem(storageKey);

        if (submissionsStr) {
          const submissions = JSON.parse(submissionsStr);

          // Check if this survey ID is in the submissions list for this device
          if (
            submissions[this.deviceFingerprint] &&
            submissions[this.deviceFingerprint].includes(this._surveyId)
          ) {
            console.log("User has previously submitted this survey");
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
        console.error("Error checking previous submissions:", error);
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
        const storageKey = "SurveyResponder_Submissions";
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
        console.log(
          "Recorded survey submission for deviceFingerprint:",
          this.deviceFingerprint
        );
      } catch (error) {
        console.error("Error recording submission:", error);
      }
    }
  }

  /**
   * @description Processes the survey result from either getSurveyById or getSurveyByResponseId
   */
  processSurveyResult(result) {
    // Store the responseId if it's provided
    if (result.responseId) {
      this.surveyResponseRecordId = result.responseId;
    }

    // Process the data for easier template rendering
    const processedData = this.processSurveyData(result);
    this.surveyData = processedData;
    this.requiresPasscode = result.requiresPasscode || false;
    this.isLoading = false;
  }

  /**
   * @description Handles passcode input changes
   */
  handlePasscodeChange(event) {
    this.enteredPasscode = event.target.value;
    this.passcodeError = null; // Clear error when user types
  }

  /**
   * @description Validates the entered passcode and loads the survey
   */
  async handlePasscodeSubmit() {
    if (!this.enteredPasscode || this.enteredPasscode.trim() === "") {
      this.passcodeError = "Please enter the passcode.";
      return;
    }

    this.isLoading = true;
    this.passcodeError = null;

    try {
      if (this.responseId) {
        // We have a response ID, validate against specific response
        const result = await getSurveyByResponseId({
          responseId: this.responseId,
          passcode: this.enteredPasscode.trim()
        });

        this.showPasscodeScreen = false;
        this.processSurveyResult(result);
      } else {
        // Direct survey access, validate passcode against any response for this survey
        const isValid = await validatePasscodeBySurveyId({
          surveyId: this._surveyId,
          passcode: this.enteredPasscode.trim()
        });

        if (isValid) {
          this.showPasscodeScreen = false;
          // Process the survey data we already have
          const processedData = this.processSurveyData(this.surveyData);
          this.surveyData = processedData;
          this.isLoading = false;
        } else {
          this.passcodeError =
            "Invalid passcode. Please check your email for the correct passcode.";
          this.isLoading = false;
        }
      }
    } catch (error) {
      const errorMessage = this.reduceErrors(error).join(", ");
      console.error("Error validating passcode:", error);

      if (errorMessage.includes("Invalid passcode")) {
        this.passcodeError =
          "Invalid passcode. Please check your email for the correct passcode.";
      } else {
        this.passcodeError = errorMessage || "Error validating passcode.";
      }
      this.isLoading = false;
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
      processedQuestion.isText = question.Type__c === "Text";
      processedQuestion.isTextarea =
        question.Type__c === "Text Area" || question.Type__c === "Long Text";
      processedQuestion.isRadio =
        question.Type__c === "Multiple Choice - Single" ||
        question.Type__c === "Single Select";
      processedQuestion.isCheckbox =
        question.Type__c === "Multiple Choice - Multiple" ||
        question.Type__c === "Multi Select";
      processedQuestion.isRating = question.Type__c === "Rating";
      processedQuestion.isDate = question.Type__c === "Date";

      // For checkbox and radio options, format for the lightning-* components
      if (
        (processedQuestion.isRadio || processedQuestion.isCheckbox) &&
        question.Answer_Options__r
      ) {
        processedQuestion.Answer_Options__r = question.Answer_Options__r.map(
          (option) => ({
            label: option.Option_Text__c,
            value: option.Id
          })
        );
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

    // Set this as the current question for the ratingOptions getter
    this.currentQuestion = questionId;

    // Update the response
    this.responses[questionId] = value;

    // Update the validation for this rating
    this.updateRatingValidation(questionId, value);

    // Update the UI to show the selected rating
    const ratingButtons = this.template.querySelectorAll(
      `button[data-id="${questionId}"]`
    );
    ratingButtons.forEach((button) => {
      const buttonValue = button.dataset.value;
      // Compare as strings to ensure type safety
      if (buttonValue <= value) {
        button.classList.add("rating-selected");
        button.setAttribute("aria-pressed", "true");
      } else {
        button.classList.remove("rating-selected");
        button.setAttribute("aria-pressed", "false");
      }
    });
  }

  /**
   * @description Updates hidden input used for validation of rating questions
   */
  updateRatingValidation(questionId, value) {
    const validationInput = this.template.querySelector(
      `.rating-validation-input[data-id="${questionId}"]`
    );
    if (validationInput) {
      validationInput.value = value || "";
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
        errorMessage: "No survey data available."
      };
    }

    let allValid = true;
    let errorMessage = "";

    // Check all required questions
    for (const question of this.surveyData.questions) {
      if (question.Is_Required__c) {
        const response = this.responses[question.Id];

        if (!response) {
          // No response for this required question
          allValid = false;
          errorMessage =
            "Please answer all required questions before submitting.";

          // Mark the question as invalid in the UI
          // This depends on how you're managing validation in the template
          this.updateRatingValidation(question.Id, null);

          // Find any lightning-input, lightning-textarea, etc. related to this question
          const inputElements = this.template.querySelectorAll(
            `[data-id="${question.Id}"]`
          );
          inputElements.forEach((input) => {
            if (input.reportValidity) {
              input.reportValidity();
            }
          });
        }
      }
    }

    return {
      isValid: allValid,
      errorMessage:
        errorMessage || "Please correct the errors before submitting."
    };
  }

  /**
   * @description Handles the form submission and sends responses to the server.
   */
  handleSubmit() {
    // Check if the user has already submitted this survey
    if (!this.allowMultipleSubmissions && this.hasPreviouslySubmitted) {
      this.submitError =
        "You have already submitted a response to this survey.";
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
      .then((result) => {
        this.isSubmitting = false;
        this.isCompleted = true;

        // Record this submission to prevent duplicates
        this.recordSubmission();
        this.hasPreviouslySubmitted = true;

        // Dispatch a custom event that other components could listen for
        this.dispatchEvent(
          new CustomEvent("surveysubmit", {
            detail: {
              success: true,
              message: result
            }
          })
        );
      })
      .catch((error) => {
        this.isSubmitting = false;
        console.error("Error submitting survey:", error);
        this.submitError =
          this.reduceErrors(error).join(", ") ||
          "An unknown error occurred while submitting the survey.";

        this.dispatchEvent(
          new CustomEvent("surveysubmit", {
            detail: {
              success: false,
              message: this.submitError
            }
          })
        );
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
        .filter((error) => !!error)
        // Extract an error message
        .map((error) => {
          // UI API read errors
          if (Array.isArray(error.body)) {
            return error.body.map((e) => e.message);
          }
          // UI API DML, Apex and network errors
          else if (error.body && typeof error.body.message === "string") {
            return error.body.message;
          }
          // JS errors
          else if (typeof error.message === "string") {
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

  /**
   * Helper method to convert hex to RGB
   */
  hexToRgb(hex) {
    // Remove # if present
    hex = hex.replace(/^#/, "");

    // Parse hex values
    let r, g, b;
    if (hex.length === 3) {
      // For 3-digit hex codes
      r = parseInt(hex.charAt(0) + hex.charAt(0), 16);
      g = parseInt(hex.charAt(1) + hex.charAt(1), 16);
      b = parseInt(hex.charAt(2) + hex.charAt(2), 16);
    } else {
      // For 6-digit hex codes
      r = parseInt(hex.substring(0, 2), 16);
      g = parseInt(hex.substring(2, 4), 16);
      b = parseInt(hex.substring(4, 6), 16);
    }

    return `${r}, ${g}, ${b}`;
  }
}
