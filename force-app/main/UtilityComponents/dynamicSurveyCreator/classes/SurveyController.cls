/**
 * @description Controller for managing Survey__c related operations, intended for internal use.
 */
public with sharing class SurveyController {

    /**
     * @description Top-level wrapper for deserializing the survey data JSON.
     */
    public class SurveyDataWrapper {
        @AuraEnabled public Survey__c survey {get; set;}
        @AuraEnabled public List<QuestionDataWrapper> questions {get; set;}

        public SurveyDataWrapper() {
            this.questions = new List<QuestionDataWrapper>();
        }
    }

    /**
     * @description Wrapper for deserializing individual question data, including options.
     */
    public class QuestionDataWrapper {
        @AuraEnabled public String sObjectType { get; set; } // Should be 'Question__c'
        @AuraEnabled public String Id { get; set; }
        @AuraEnabled public String questionText { get; set; } // Changed from Question_Text__c
        @AuraEnabled public String type { get; set; } // Changed from Type__c
        @AuraEnabled public Integer displayOrder { get; set; } // Changed from Order__c
        @AuraEnabled public Boolean isRequired { get; set; } // Changed from Is_Required__c
        @AuraEnabled public List<AnswerOptionWrapper> answerOptions { get; set; } // Changed from Answer_Options__r

        public QuestionDataWrapper() {
            this.answerOptions = new List<AnswerOptionWrapper>();
        }
    }

    /**
     * @description Wrapper for deserializing individual answer option data.
     */
    public class AnswerOptionWrapper {
        @AuraEnabled public String sObjectType { get; set; } // Should be 'Answer_Option__c'
        @AuraEnabled public String Id { get; set; }
        @AuraEnabled public String optionText { get; set; } // Changed from Option_Text__c
        @AuraEnabled public Integer displayOrder { get; set; } // Changed from Order__c

        public AnswerOptionWrapper() {}
    }

    /**
     * @description Saves a Survey__c record along with its related Question__c and Answer_Option__c records.
     * Expects a JSON string representing the survey structure.
     * @param surveyJson JSON string containing survey and question data.
     * @return ID of the saved Survey__c record.
     * @exception AuraHandledException if saving fails.
     */
    @AuraEnabled
    public static Id saveSurvey(String surveyJson) {
        // Safe logging - don't risk exceptions just for logging
        try {
            if (surveyJson != null) {
                Integer maxLogLength = Math.min(surveyJson.length(), 255);
                System.debug(LoggingLevel.DEBUG, 'saveSurvey initiated. JSON received (first 255 chars): ' + 
                         surveyJson.substring(0, maxLogLength) + 
                         (surveyJson.length() > 255 ? '...' : ''));
            } else {
                System.debug(LoggingLevel.DEBUG, 'saveSurvey initiated. JSON received: null');
            }
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Error logging survey JSON: ' + e.getMessage());
        }
        
        Savepoint sp = Database.setSavepoint();
        Id surveyId;

        try {
            // Basic validation before attempting to deserialize
            if (String.isBlank(surveyJson)) {
                throw new AuraHandledException('No survey data provided. Please complete the survey form.');
            }
            
            // Clean the JSON string if needed (handle any potential issues)
            surveyJson = cleanJsonString(surveyJson);
            
            // Deserialize the JSON into wrapper classes
            SurveyDataWrapper wrapper;
            try {
                wrapper = (SurveyDataWrapper)System.JSON.deserialize(surveyJson, SurveyDataWrapper.class);
            } catch (JSONException je) {
                System.debug(LoggingLevel.ERROR, 'JSON Parse Error: ' + je.getMessage());
                System.debug(LoggingLevel.ERROR, 'JSON Content (first 1000 chars): ' + 
                            (surveyJson.length() > 1000 ? surveyJson.substring(0, 1000) + '...' : surveyJson));
                throw new AuraHandledException('Unable to parse survey data: ' + je.getMessage());
            } catch (Exception e) {
                System.debug(LoggingLevel.ERROR, 'General Parse Error: ' + e.getMessage());
                System.debug(LoggingLevel.ERROR, 'Error Type: ' + e.getTypeName());
                throw new AuraHandledException('Error processing survey data: ' + e.getMessage());
            }

            // Validate the wrapper data (basic checks)
            if (wrapper == null) {
                throw new AuraHandledException('Survey data is empty or invalid format.');
            } 
            
            if (wrapper.survey == null) {
                throw new AuraHandledException('Survey details are missing or invalid.');
            }
            
            if (String.isBlank(wrapper.survey.Name)) {
                throw new AuraHandledException('Survey Name is required.');
            }
            
            if (wrapper.questions == null || wrapper.questions.isEmpty()) {
                 throw new AuraHandledException('At least one question is required to save the survey.');
            }

            // Prepare Survey record for DML
            Survey__c surveyToSave = wrapper.survey;
            
            // *** ADDED DEBUG LOG ***
            System.debug(LoggingLevel.DEBUG, 'Attempting to upsert Survey__c: ' + JSON.serializePretty(surveyToSave));
            
            try {
                // Using upsert is safer if editing is intended
                Database.UpsertResult surveyResult = Database.upsert(surveyToSave, Survey__c.Id, false);
                if (!surveyResult.isSuccess()) {
                    throw createAuraException('Failed to save Survey record', surveyResult.getErrors());
                }
                surveyId = surveyResult.getId();
                System.debug(LoggingLevel.INFO, 'Survey Upsert successful. ID: ' + surveyId);
            } catch (DmlException de) {
                System.debug(LoggingLevel.ERROR, 'DML Exception on Survey insert: ' + de.getMessage());
                throw new AuraHandledException('Error saving survey: ' + de.getMessage());
            }

            // --- Prepare Questions and Options --- //
            List<Question__c> questionsToUpsert = new List<Question__c>();
            List<Answer_Option__c> optionsFromPayload = new List<Answer_Option__c>(); // Store all options from payload temporarily
            Map<Integer, List<Answer_Option__c>> questionIndexToOptionsMap = new Map<Integer, List<Answer_Option__c>>(); // Map options to their question wrapper index

            Set<Id> currentQuestionIds = new Set<Id>();
            Set<Id> currentOptionIds = new Set<Id>();

            // First pass: Prepare Questions and gather Options with their question index
            for (Integer i = 0; i < wrapper.questions.size(); i++) {
                QuestionDataWrapper questionWrapper = wrapper.questions[i];
                
                if (questionWrapper == null) {
                    System.debug(LoggingLevel.WARN, 'Null question at index ' + i);
                    continue; // Skip null questions
                }
                
                // If a field is missing, use a default value
                String questionText = questionWrapper.questionText != null ? questionWrapper.questionText : '';
                String questionType = questionWrapper.type != null ? questionWrapper.type : 'Text';
                Integer displayOrder = questionWrapper.displayOrder != null ? questionWrapper.displayOrder : (i + 1);
                Boolean isRequired = questionWrapper.isRequired != null ? questionWrapper.isRequired : false;
                
                Question__c question = new Question__c(
                    Id = questionWrapper.Id,
                    Survey__c = surveyId, // Link to parent survey
                    Question_Text__c = questionText,
                    Type__c = questionType,
                    Order__c = displayOrder,
                    Is_Required__c = isRequired
                );
                questionsToUpsert.add(question);
                if (question.Id != null) {
                    currentQuestionIds.add(question.Id);
                }

                // Gather options associated with this question's index
                List<Answer_Option__c> currentQuestionOptions = new List<Answer_Option__c>();
                if (questionWrapper.answerOptions != null) {
                    for (AnswerOptionWrapper optionWrapper : questionWrapper.answerOptions) {
                        if (optionWrapper == null) {
                            continue; // Skip null options
                        }
                        
                        // Handle potential null values
                        String optionText = optionWrapper.optionText != null ? optionWrapper.optionText : '';
                        Integer optionOrder = optionWrapper.displayOrder != null ? optionWrapper.displayOrder : 1;
                        
                        Answer_Option__c option = new Answer_Option__c(
                            Id = optionWrapper.Id,
                            Option_Text__c = optionText,
                            Order__c = optionOrder
                            // Question__c will be set after questions are upserted
                        );
                        optionsFromPayload.add(option);
                        currentQuestionOptions.add(option);
                        if (option.Id != null) {
                            currentOptionIds.add(option.Id);
                        }
                    }
                }
                questionIndexToOptionsMap.put(i, currentQuestionOptions);
            }

            try {
                // --- Upsert Questions --- //
                if (questionsToUpsert.isEmpty()) {
                    throw new AuraHandledException('No valid questions found to save.');
                }
                
                List<Database.UpsertResult> questionResults = Database.upsert(questionsToUpsert, Question__c.Id, false);
    
                // Map original question index to the saved/upserted Question ID
                Map<Integer, Id> questionIndexToSavedIdMap = new Map<Integer, Id>();
                for (Integer i = 0; i < questionResults.size(); i++) {
                    if (questionResults[i].isSuccess()) {
                        questionIndexToSavedIdMap.put(i, questionResults[i].getId());
                    } else {
                        throw createAuraException('Failed to save Question ' + (i+1), questionResults[i].getErrors());
                    }
                }
    
                 // --- Link Options to Saved Questions --- //
                List<Answer_Option__c> finalOptionsToUpsert = new List<Answer_Option__c>();
                for (Integer i = 0; i < questionsToUpsert.size(); i++) {
                    Id savedQuestionId = questionIndexToSavedIdMap.get(i);
                    List<Answer_Option__c> optionsForThisQuestion = questionIndexToOptionsMap.get(i);
                    if (savedQuestionId != null && optionsForThisQuestion != null && !optionsForThisQuestion.isEmpty()) {
                        for (Answer_Option__c option : optionsForThisQuestion) {
                            option.Question__c = savedQuestionId; // Link to the correct, saved Question ID
                            finalOptionsToUpsert.add(option);
                        }
                    }
                }
    
                // --- Upsert Options --- //
                if (!finalOptionsToUpsert.isEmpty()) {
                    List<Database.UpsertResult> optionResults = Database.upsert(finalOptionsToUpsert, Answer_Option__c.Id, false);
                    for (Database.UpsertResult optResult : optionResults) {
                        if (!optResult.isSuccess()) {
                            throw createAuraException('Failed to save Answer Option', optResult.getErrors());
                        }
                    }
                }
            } catch (DmlException de) {
                System.debug(LoggingLevel.ERROR, 'DML Exception on Questions/Options: ' + de.getMessage());
                throw new AuraHandledException('Error saving questions or options: ' + de.getMessage());
            }

            System.debug(LoggingLevel.INFO, 'Survey saved successfully with ID: ' + surveyId);
            return surveyId;

        } catch (Exception e) {
            Database.rollback(sp); // Roll back transaction on error

            // Enhanced Logging
            String exceptionType = String.valueOf(e);
            if (exceptionType.contains(':')) {
                exceptionType = exceptionType.substring(0, exceptionType.indexOf(':'));
            }
            
            System.debug(LoggingLevel.ERROR, '***** SURVEY SAVE ERROR *****');
            System.debug(LoggingLevel.ERROR, 'Exception Type: ' + exceptionType);
            System.debug(LoggingLevel.ERROR, 'Detail Message: ' + e.getMessage());
            System.debug(LoggingLevel.ERROR, 'Line Number: ' + e.getLineNumber());
            System.debug(LoggingLevel.ERROR, 'Stack Trace: \n' + e.getStackTraceString());
            
            // Log a shorter version of the payload to avoid exceeding debug log size limits
            if (surveyJson != null) {
                Integer maxLen = Math.min(surveyJson.length(), 1000);
                System.debug(LoggingLevel.ERROR, 'Initial JSON Payload (truncated): ' + surveyJson.substring(0, maxLen) + 
                             (surveyJson.length() > 1000 ? '...' : ''));
            }
            System.debug(LoggingLevel.ERROR, '***************************');

            // Create User-Friendly Error Message
            String userMessage = 'An unexpected error occurred while saving the survey.'; // Default
            if (e instanceof System.JSONException || e.getMessage().contains('deserialize')) {
                 userMessage = 'Invalid data format received. Please check the survey details and questions format.';
            } else if (e instanceof DmlException) {
                DmlException dmlEx = (DmlException)e;
                // Try to get a more specific DML message
                if (dmlEx.getNumDml() > 0) {
                     userMessage = 'Error saving data: ' + dmlEx.getDmlMessage(0);
                }
            } else if (e instanceof AuraHandledException) {
                 userMessage = e.getMessage(); // Use message from our explicit throws
            }
            // Avoid exposing generic 'Script-thrown exception'
            else if (String.isNotBlank(e.getMessage()) && !e.getMessage().startsWith('Script-thrown exception')) {
                 userMessage = e.getMessage(); // Use raw message if it seems informative
            }

            throw new AuraHandledException(userMessage);
        }
    }

    /**
     * @description Cleans a JSON string to remove potential issues
     * @param jsonString The JSON string to clean
     * @return A cleaned JSON string
     */
    private static String cleanJsonString(String jsonString) {
        if (String.isBlank(jsonString)) {
            return '';
        }
        
        // Simply perform basic replacements that might cause issues
        String cleanedJson = jsonString;
        
        try {
            // Replace problematic backslash-escape sequences
            cleanedJson = cleanedJson.replace('\\\\', '\\');
            cleanedJson = cleanedJson.replace('\\\"', '"');
            
            // Replace any unescaped quotes and special characters
            cleanedJson = cleanedJson.replace('\"', '"');
            
            // Handle ampersands (these can sometimes cause issues)
            cleanedJson = cleanedJson.replace('&', '&amp;');
        } catch (Exception e) {
            System.debug(LoggingLevel.WARN, 'Error in cleanJsonString: ' + e.getMessage());
            // Just return the original if any error occurs
            return jsonString;
        }
        
        return cleanedJson;
    }

    /**
     * @description Creates Survey_Response__c records for each recipient and sends an email with a unique link.
     * @param surveyId The ID of the Survey__c to send.
     * @param recipientEmails List of email addresses.
     * @param publicSiteUrl The base URL of the public site/page hosting the survey responder LWC.
     * @return Integer The number of emails successfully prepared for sending.
     * @exception AuraHandledException if sending fails or required parameters are missing.
     */
    @AuraEnabled
    public static Integer createAndSendResponses(Id surveyId, List<String> recipientEmails, String publicSiteUrl) {
        // --- Input Validation ---
        if (surveyId == null) {
            throw new AuraHandledException('Survey ID is required.');
        }
        if (recipientEmails == null || recipientEmails.isEmpty()) {
            throw new AuraHandledException('At least one recipient email is required.');
        }
        if (String.isBlank(publicSiteUrl)) {
            throw new AuraHandledException('Public Site URL is required for sending.');
        }
        // Optional: Validate the URL format basic check
        if (!publicSiteUrl.toLowerCase().startsWith('http')) {
             throw new AuraHandledException('Invalid Public Site URL format. It should start with http:// or https://');
        }

        // --- Query Survey Details (Optional but good for context/validation) ---
        Survey__c surveyToSend;
        try {
             surveyToSend = [SELECT Id, Name, Is_Active__c, Require_Passcode__c FROM Survey__c WHERE Id = :surveyId LIMIT 1];
             if (!surveyToSend.Is_Active__c) {
                 throw new AuraHandledException('Cannot send an inactive survey.');
             }
        } catch (QueryException qe) {
            throw new AuraHandledException('Survey not found or inaccessible.');
        }

        // --- Prepare Responses and Emails --- //
        List<Survey_Response__c> responsesToInsert = new List<Survey_Response__c>();
        List<Messaging.SingleEmailMessage> emailsToSend = new List<Messaging.SingleEmailMessage>();
        Set<String> uniqueEmails = new Set<String>(recipientEmails); // Ensure uniqueness

        // Get Org-Wide Email Address (Optional, fallback to user email)
        List<OrgWideEmailAddress> oweaList = [SELECT Id FROM OrgWideEmailAddress LIMIT 1]; // Use List

        for (String email : uniqueEmails) {
            // --- Create Unique ID --- //
            String uniqueId = generateUniqueResponseId();
            
            // --- Generate Passcode if required --- //
            String passcode = null;
            if (surveyToSend.Require_Passcode__c) {
                passcode = generatePasscode();
            }

            // --- Create Survey Response Record --- //
            Survey_Response__c response = new Survey_Response__c(
                Survey__c = surveyId,
                Respondent_Email__c = email,
                Status__c = 'Not Started', // Default status
                Unique_Response_ID__c = uniqueId,
                Passcode__c = passcode
            );
            responsesToInsert.add(response);

            // --- Construct Unique Survey Link --- //
            String cleanPublicSiteUrl = publicSiteUrl.removeEnd('/');
            // *** IMPORTANT: Update '/s/survey' if your page path is different! ***
            String surveyLink = cleanPublicSiteUrl + '/s/survey?responseId=' + uniqueId;

            // --- Create Email Message --- //
            Messaging.SingleEmailMessage mail = new Messaging.SingleEmailMessage();
            if (oweaList != null && !oweaList.isEmpty()) {
                mail.setOrgWideEmailAddressId(oweaList[0].Id);
            }
            mail.setToAddresses(new List<String>{ email });
            // Escape apostrophe in subject
            mail.setSubject('You\'re Invited to Take Our Survey: ' + surveyToSend.Name);
            mail.setHtmlBody(createEmailHtmlBody(surveyToSend.Name, surveyLink, passcode));
            mail.setSaveAsActivity(false); // Typically set to false for bulk survey sends
            emailsToSend.add(mail);
        }

        // --- Perform DML and Send Emails --- //
        Savepoint sp = Database.setSavepoint(); // Use savepoint for email sending part too
        Integer successfulSends = 0;
        try {
            // Insert Survey Response records
            if (!responsesToInsert.isEmpty()) {
                Database.SaveResult[] responseResults = Database.insert(responsesToInsert, false); // Allow partial success
                // Optional: Check results for errors if needed
                for (Database.SaveResult sr : responseResults) {
                    if (!sr.isSuccess()) {
                         // Log or handle DML errors for specific responses if necessary
                         System.debug(LoggingLevel.WARN, 'Failed to insert Survey_Response__c: ' + sr.getErrors()[0].getMessage());
                    }
                }
            }

            // Send Emails (Up to Salesforce limits per transaction)
            if (!emailsToSend.isEmpty()) {
                Messaging.SendEmailResult[] emailResults = Messaging.sendEmail(emailsToSend, false); // Allow partial success

                for(Integer i = 0; i < emailResults.size(); i++) {
                    Messaging.SendEmailResult ser = emailResults[i];
                    String recipientAddress = emailsToSend[i].getToAddresses()[0]; // Get corresponding email
                    if (ser.isSuccess()) {
                        successfulSends++;
                    } else {
                        // Log errors for failed emails - Fixed error in the error handling
                        if (ser.getErrors() != null && !ser.getErrors().isEmpty()) {
                            for(Messaging.SendEmailError sendError : ser.getErrors()) {
                                System.debug(LoggingLevel.ERROR, 'Email Send Error for [' + recipientAddress + ']: (' + 
                                    sendError.getStatusCode() + ') ' + sendError.getMessage());
                            }
                        }
                    }
                }
            }
            return successfulSends;

        } catch (Exception e) {
            Database.rollback(sp); // Rollback DML if email sending fails catastrophically
             // Fix System.debug string concatenation and escape sequence
            System.debug(LoggingLevel.ERROR, 'Error creating responses or sending emails: ' + e.getMessage() + '\n' + e.getStackTraceString());
            // Attempt to provide a more specific error if possible
            String userMessage = 'An error occurred while processing the survey invitations.';
            if (e instanceof DmlException) {
                // Get more specific DML error message
                userMessage = 'Error saving survey responses: ' + e.getDmlMessage(0);
            } else if (e instanceof EmailException) {
                 userMessage = 'Error sending emails: ' + e.getMessage();
            }
             // Avoid exposing generic 'Script-thrown exception'
            if (String.isBlank(userMessage) || userMessage.startsWith('Script-thrown exception')) {
                userMessage = 'An unexpected error occurred during sending.';
            }
            throw new AuraHandledException(userMessage);
        }
    }

    /**
     * @description Generates a reasonably unique string for the Survey Response ID.
     * Uses crypto class for better randomness.
     * @return String A unique identifier.
     */
    private static String generateUniqueResponseId() {
        Blob random = Crypto.generateAesKey(128); // 16 bytes = 128 bits
        return EncodingUtil.convertToHex(random).substring(0, 20); // Use first 20 hex chars for brevity
    }
    
    /**
     * @description Generates a 6-digit passcode for survey access.
     * @return String A 6-digit passcode.
     */
    private static String generatePasscode() {
        // Generate a random 6-digit passcode
        Integer randomNumber = Math.abs(Crypto.getRandomInteger());
        String passcode = String.valueOf(randomNumber).left(6);
        
        // Ensure it's exactly 6 digits by padding with zeros if needed
        while (passcode.length() < 6) {
            passcode = '0' + passcode;
        }
        
        return passcode;
    }

    /**
     * @description Creates the HTML body for the survey invitation email.
     * @param surveyName The name of the survey.
     * @param surveyLink The unique link for the recipient.
     * @param passcode The passcode for accessing the survey (optional).
     * @return String The HTML email body.
     */
    private static String createEmailHtmlBody(String surveyName, String surveyLink, String passcode) {
        // Simplified inline styles to avoid Apex parsing issues
        String bodyStyle = 'font-family: Arial, sans-serif; line-height: 1.6; color: #333333;';
        String containerStyle = 'padding: 20px; border: 1px solid #dddddd; border-radius: 5px; max-width: 600px; margin: 20px auto;';
        String headerStyle = 'font-size: 1.2em; font-weight: bold; margin-bottom: 15px;';
        String buttonStyle = 'display: inline-block; padding: 12px 25px; margin: 20px 0; font-size: 1em; color: #ffffff !important; background-color: #007bff; text-decoration: none; border-radius: 5px;';
        String linkStyle = 'color: #007bff; text-decoration: none; word-break: break-all;';
        String footerStyle = 'margin-top: 20px; font-size: 0.9em; color: #777777;';
        String passcodeStyle = 'background-color: #f8f9fa; border: 2px solid #007bff; border-radius: 8px; padding: 15px; margin: 15px 0; text-align: center; font-size: 1.1em; font-weight: bold; color: #007bff;';

        // Safely escape HTML in survey name
        String safeSurveyName = surveyName.replace('<', '&lt;').replace('>', '&gt;');
        
        // Build passcode section if passcode is provided
        String passcodeSection = '';
        if (String.isNotBlank(passcode)) {
            passcodeSection = '<div style="' + passcodeStyle + '">' +
                '<p style="margin: 0 0 10px 0; font-size: 0.9em; color: #666666;">Your Survey Passcode:</p>' +
                '<div style="font-size: 1.8em; letter-spacing: 3px; color: #007bff;">' + passcode + '</div>' +
                '<p style="margin: 10px 0 0 0; font-size: 0.8em; color: #666666;">You will need to enter this passcode to access the survey</p>' +
                '</div>';
        }

        String htmlBody = '<!DOCTYPE html><html><head></head><body style="' + bodyStyle + '">' +
            '<div style="' + containerStyle + '">' +
            '<div style="' + headerStyle + '">Invitation to Participate in a Survey</div>' +
            '<p>Hello,</p>' +
            '<p>We invite you to share your feedback by participating in our survey: <strong>' + safeSurveyName + '</strong>.</p>' +
            '<p>Your input is valuable to us.</p>' +
            passcodeSection +
            '<a href="' + surveyLink + '" style="' + buttonStyle + '" target="_blank">Start Survey</a>' +
            '<p>If the button above does not work, please copy and paste the following link into your web browser:</p>' +
            '<p><a href="' + surveyLink + '" style="' + linkStyle + '" target="_blank">' + surveyLink + '</a></p>' +
            '<div style="' + footerStyle + '">Thank you for your time and participation.</div>' +
            '</div></body></html>';

        return htmlBody;
    }

    // --- Helper for creating AuraHandledException from DML errors --- //
    private static AuraHandledException createAuraException(String prefix, List<Database.Error> errors) {
        String detailedMessage = prefix;
        
        if (errors != null && !errors.isEmpty()) {
            try {
                // Safely try to get details from the first error
                Database.Error firstError = errors[0];
                if (firstError != null) {
                    detailedMessage += ': (' + firstError.getStatusCode() + ') ' + firstError.getMessage();
                    
                    // Safely try to add fields
                    List<String> fields = firstError.getFields();
                    if (fields != null && !fields.isEmpty()) {
                        detailedMessage += ' [Fields: ' + String.join(fields, ', ') + ']';
                    }
                } else {
                    detailedMessage += ': Unknown database error details';
                }
            } catch (Exception e) {
                // Fallback if accessing error details fails
                detailedMessage += ': Failed to retrieve detailed error message (' + e.getMessage() + ')';
            }
        } else {
            detailedMessage += ': No specific error details provided';
        }
        
        // Log the detailed message before throwing
        System.debug(LoggingLevel.ERROR, 'Creating AuraHandledException with message: ' + detailedMessage);
        
        return new AuraHandledException(detailedMessage);
    }

    /**
     * @description Gets all surveys created by the current user
     * @return List<SurveyWithStats> List of surveys with response statistics
     */
    @AuraEnabled(cacheable=true)
    public static List<SurveyWithStats> getUserSurveys() {
        try {
            // First get all surveys by current user
            List<Survey__c> surveys = [
                SELECT Id, Name, Description__c, CreatedDate, Is_Active__c
                FROM Survey__c 
                WHERE CreatedById = :UserInfo.getUserId()
                ORDER BY CreatedDate DESC
            ];

            // Get survey IDs for response count query
            Set<Id> surveyIds = new Set<Id>();
            for (Survey__c survey : surveys) {
                surveyIds.add(survey.Id);
            }

            // Get response counts by survey (separate query to avoid relationship depth issues)
            Map<Id, Integer> responseCountMap = new Map<Id, Integer>();
            if (!surveyIds.isEmpty()) {
                List<AggregateResult> responseCounts = [
                    SELECT Survey__c, COUNT(Id) responseCount
                    FROM Survey_Response__c 
                    WHERE Survey__c IN :surveyIds
                    GROUP BY Survey__c
                ];
                
                for (AggregateResult ar : responseCounts) {
                    Id surveyId = (Id)ar.get('Survey__c');
                    Integer count = (Integer)ar.get('responseCount');
                    responseCountMap.put(surveyId, count);
                }
            }

            // Build result list
            List<SurveyWithStats> surveyStats = new List<SurveyWithStats>();
            for (Survey__c survey : surveys) {
                SurveyWithStats stat = new SurveyWithStats();
                stat.survey = survey;
                stat.responseCount = responseCountMap.containsKey(survey.Id) ? responseCountMap.get(survey.Id) : 0;
                surveyStats.add(stat);
            }

            return surveyStats;
        } catch (Exception e) {
            System.debug('Error getting user surveys: ' + e.getMessage());
            throw new AuraHandledException('Error retrieving surveys: ' + e.getMessage());
        }
    }

    /**
     * @description Gets responses for a specific survey
     * @param surveyId The ID of the survey
     * @return SurveyResponseData Survey data with responses
     */
    @AuraEnabled(cacheable=true)
    public static SurveyResponseData getSurveyResponses(Id surveyId) {
        try {
            // Validate user owns this survey
            List<Survey__c> surveys = [
                SELECT Id, Name, Description__c 
                FROM Survey__c 
                WHERE Id = :surveyId AND CreatedById = :UserInfo.getUserId()
                LIMIT 1
            ];

            if (surveys.isEmpty()) {
                throw new AuraHandledException('Survey not found or access denied.');
            }

            // Get survey with questions (separate query)
            Survey__c surveyWithQuestions = [
                SELECT Id, Name, Description__c
                FROM Survey__c 
                WHERE Id = :surveyId 
                LIMIT 1
            ];

            // Get questions for this survey
            List<Question__c> questions = [
                SELECT Id, Question_Text__c, Type__c, Order__c, Is_Required__c
                FROM Question__c
                WHERE Survey__c = :surveyId
                ORDER BY Order__c
            ];

            // Get answer options for these questions
            Set<Id> questionIds = new Set<Id>();
            for (Question__c q : questions) {
                questionIds.add(q.Id);
            }

            List<Answer_Option__c> answerOptions = new List<Answer_Option__c>();
            if (!questionIds.isEmpty()) {
                answerOptions = [
                    SELECT Id, Question__c, Option_Text__c, Order__c
                    FROM Answer_Option__c
                    WHERE Question__c IN :questionIds
                    ORDER BY Question__c, Order__c
                ];
            }

            // Map answer options to questions
            Map<Id, List<Answer_Option__c>> questionToOptionsMap = new Map<Id, List<Answer_Option__c>>();
            for (Answer_Option__c option : answerOptions) {
                if (!questionToOptionsMap.containsKey(option.Question__c)) {
                    questionToOptionsMap.put(option.Question__c, new List<Answer_Option__c>());
                }
                questionToOptionsMap.get(option.Question__c).add(option);
            }

            // Get responses with their question responses
            List<Survey_Response__c> responses = [
                SELECT Id, Name, Respondent_Email__c, Status__c, Response_Date__c
                FROM Survey_Response__c 
                WHERE Survey__c = :surveyId AND Status__c = 'Completed'
                ORDER BY Response_Date__c DESC
            ];

            // Get question responses for these survey responses
            Set<Id> responseIds = new Set<Id>();
            for (Survey_Response__c resp : responses) {
                responseIds.add(resp.Id);
            }

            List<Question_Response__c> questionResponses = new List<Question_Response__c>();
            if (!responseIds.isEmpty()) {
                questionResponses = [
                    SELECT Id, Survey_Response__c, Question__c, Response_Text__c,
                           Question__r.Question_Text__c, Question__r.Order__c
                    FROM Question_Response__c
                    WHERE Survey_Response__c IN :responseIds
                    ORDER BY Question__r.Order__c
                ];
            }

            // Map question responses to survey responses
            Map<Id, List<Question_Response__c>> responseToQuestionsMap = new Map<Id, List<Question_Response__c>>();
            for (Question_Response__c qr : questionResponses) {
                if (!responseToQuestionsMap.containsKey(qr.Survey_Response__c)) {
                    responseToQuestionsMap.put(qr.Survey_Response__c, new List<Question_Response__c>());
                }
                responseToQuestionsMap.get(qr.Survey_Response__c).add(qr);
            }

            SurveyResponseData responseData = new SurveyResponseData();
            responseData.survey = surveyWithQuestions;
            responseData.responses = responses;
            
            return responseData;
        } catch (Exception e) {
            System.debug('Error getting survey responses: ' + e.getMessage());
            throw new AuraHandledException('Error retrieving survey responses: ' + e.getMessage());
        }
    }

    /**
     * @description Wrapper class for survey with response count
     */
    public class SurveyWithStats {
        @AuraEnabled public Survey__c survey { get; set; }
        @AuraEnabled public Integer responseCount { get; set; }
    }

    /**
     * @description Wrapper class for survey response data
     */
    public class SurveyResponseData {
        @AuraEnabled public Survey__c survey { get; set; }
        @AuraEnabled public List<Survey_Response__c> responses { get; set; }
    }
}