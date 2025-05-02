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
        System.debug(LoggingLevel.DEBUG, 'saveSurvey initiated. JSON received: ' + surveyJson);
        Savepoint sp = Database.setSavepoint();
        Id surveyId;

        try {
            // Deserialize the JSON into wrapper classes
            SurveyDataWrapper wrapper = (SurveyDataWrapper)JSON.deserialize(surveyJson, SurveyDataWrapper.class);

            // Validate the wrapper data (basic checks)
            if (wrapper == null || wrapper.survey == null || String.isBlank(wrapper.survey.Name)) {
                throw new AuraHandledException('Invalid survey data provided. Survey Name is required.');
            }
            if (wrapper.questions == null || wrapper.questions.isEmpty()) {
                 throw new AuraHandledException('At least one question is required to save the survey.');
            }

            // Prepare Survey record for DML
            Survey__c surveyToSave = wrapper.survey;
            // Remove fields that might not be updateable - removed system fields
            surveyToSave.OwnerId = null;
            // System fields removed as they're not writeable

            // Using upsert is safer if editing is intended
            Database.UpsertResult surveyResult = Database.upsert(surveyToSave, Survey__c.Id, false);
            if (!surveyResult.isSuccess()) {
                throw createAuraException('Failed to save Survey record', surveyResult.getErrors());
            }
            surveyId = surveyResult.getId();
            System.debug(LoggingLevel.INFO, 'Survey Upsert successful. ID: ' + surveyId);

            // --- Prepare Questions and Options --- //
            List<Question__c> questionsToUpsert = new List<Question__c>();
            List<Answer_Option__c> optionsFromPayload = new List<Answer_Option__c>(); // Store all options from payload temporarily
            Map<Integer, List<Answer_Option__c>> questionIndexToOptionsMap = new Map<Integer, List<Answer_Option__c>>(); // Map options to their question wrapper index

            Set<Id> currentQuestionIds = new Set<Id>();
            Set<Id> currentOptionIds = new Set<Id>();

            // First pass: Prepare Questions and gather Options with their question index
            for (Integer i = 0; i < wrapper.questions.size(); i++) {
                QuestionDataWrapper questionWrapper = wrapper.questions[i];
                Question__c question = new Question__c(
                    Id = questionWrapper.Id,
                    Survey__c = surveyId, // Link to parent survey
                    Question_Text__c = questionWrapper.questionText, // Updated field name
                    Type__c = questionWrapper.type, // Updated field name
                    Order__c = questionWrapper.displayOrder, // Updated field name
                    Is_Required__c = questionWrapper.isRequired != null ? questionWrapper.isRequired : false // Updated field name
                );
                questionsToUpsert.add(question);
                if (question.Id != null) {
                    currentQuestionIds.add(question.Id);
                }

                // Gather options associated with this question's index
                List<Answer_Option__c> currentQuestionOptions = new List<Answer_Option__c>();
                if (questionWrapper.answerOptions != null) { // Updated field name
                    for (AnswerOptionWrapper optionWrapper : questionWrapper.answerOptions) { // Updated field name
                        Answer_Option__c option = new Answer_Option__c(
                            Id = optionWrapper.Id,
                            Option_Text__c = optionWrapper.optionText, // Updated field name
                            Order__c = optionWrapper.displayOrder // Updated field name
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

            // --- Upsert Questions --- //
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
            for (Integer i = 0; i < wrapper.questions.size(); i++) {
                Id savedQuestionId = questionIndexToSavedIdMap.get(i);
                List<Answer_Option__c> optionsForThisQuestion = questionIndexToOptionsMap.get(i);
                if (savedQuestionId != null && optionsForThisQuestion != null) {
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

            // --- Handle Deletes (If supporting editing/removal) --- //
            // This part needs careful implementation based on how you want editing to work.
            // Example: Query existing questions/options for this survey ID *excluding* those just upserted,
            // then delete the ones not found in the current payload.
            // List<Question__c> questionsToDelete = [SELECT Id FROM Question__c WHERE Survey__c = :surveyId AND Id NOT IN :currentQuestionIds];
            // List<Answer_Option__c> optionsToDelete = [SELECT Id FROM Answer_Option__c WHERE Question__c IN (SELECT Id FROM Question__c WHERE Survey__c = :surveyId) AND Id NOT IN :currentOptionIds];
            // if (!questionsToDelete.isEmpty()) Database.delete(questionsToDelete, false);
            // if (!optionsToDelete.isEmpty()) Database.delete(optionsToDelete, false);

            System.debug(LoggingLevel.INFO, 'saveSurvey completed successfully for Survey ID: ' + surveyId);
            return surveyId;

        } catch (Exception e) {
            Database.rollback(sp); // Roll back transaction on error

            // Enhanced Logging
            String exceptionType = String.valueOf(e).substring(0, String.valueOf(e).indexOf(':'));
            System.debug(LoggingLevel.ERROR, '***** SURVEY SAVE ERROR *****');
            System.debug(LoggingLevel.ERROR, 'Exception Type: ' + exceptionType);
            System.debug(LoggingLevel.ERROR, 'Detail Message: ' + e.getMessage());
            System.debug(LoggingLevel.ERROR, 'Line Number: ' + e.getLineNumber());
            System.debug(LoggingLevel.ERROR, 'Stack Trace: \n' + e.getStackTraceString());
            System.debug(LoggingLevel.ERROR, 'Initial JSON Payload: ' + surveyJson); // Log the input data
            System.debug(LoggingLevel.ERROR, '***************************');

            // Create User-Friendly Error Message
            String userMessage = 'An unexpected error occurred while saving the survey.'; // Default
            if (e instanceof System.JSONException || e.getMessage().contains('deserialize')) {
                 userMessage = 'Invalid data format received. Please check the survey details and questions.';
            } else if (e instanceof DmlException) {
                DmlException dmlEx = (DmlException)e;
                // Try to get a more specific DML message
                if (dmlEx.getNumDml() > 0) {
                     userMessage = 'Error saving data: ' + dmlEx.getDmlMessage(0);
                      // Log specific DML details
                      System.debug(LoggingLevel.ERROR, 'DML Error Details: Index=' + dmlEx.getDmlIndex(0) +
                         ', FieldNames=' + String.join(dmlEx.getDmlFieldNames(0), ', ') +
                         ', Id=' + dmlEx.getDmlId(0));
                } else {
                     userMessage = 'Error during data operation: ' + dmlEx.getMessage();
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
             surveyToSend = [SELECT Id, Name, Is_Active__c FROM Survey__c WHERE Id = :surveyId LIMIT 1];
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

            // --- Create Survey Response Record --- //
            Survey_Response__c response = new Survey_Response__c(
                Survey__c = surveyId,
                Respondent_Email__c = email,
                Status__c = 'Not Started', // Default status
                Unique_Response_ID__c = uniqueId
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
            mail.setHtmlBody(createEmailHtmlBody(surveyToSend.Name, surveyLink));
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
     * @description Creates the HTML body for the survey invitation email.
     * @param surveyName The name of the survey.
     * @param surveyLink The unique link for the recipient.
     * @return String The HTML email body.
     */
    private static String createEmailHtmlBody(String surveyName, String surveyLink) {
        // Simplified inline styles to avoid Apex parsing issues
        String bodyStyle = 'font-family: Arial, sans-serif; line-height: 1.6; color: #333333;';
        String containerStyle = 'padding: 20px; border: 1px solid #dddddd; border-radius: 5px; max-width: 600px; margin: 20px auto;';
        String headerStyle = 'font-size: 1.2em; font-weight: bold; margin-bottom: 15px;';
        String buttonStyle = 'display: inline-block; padding: 12px 25px; margin: 20px 0; font-size: 1em; color: #ffffff !important; background-color: #007bff; text-decoration: none; border-radius: 5px;';
        String linkStyle = 'color: #007bff; text-decoration: none; word-break: break-all;';
        String footerStyle = 'margin-top: 20px; font-size: 0.9em; color: #777777;';

        // Safely escape HTML in survey name
        String safeSurveyName = surveyName.replace('<', '&lt;').replace('>', '&gt;');

        String htmlBody = '<!DOCTYPE html><html><head></head><body style="' + bodyStyle + '">' +
            '<div style="' + containerStyle + '">' +
            '<div style="' + headerStyle + '">Invitation to Participate in a Survey</div>' +
            '<p>Hello,</p>' +
            '<p>We invite you to share your feedback by participating in our survey: <strong>' + safeSurveyName + '</strong>.</p>' +
            '<p>Your input is valuable to us.</p>' +
            '<a href="' + surveyLink + '" style="' + buttonStyle + '" target="_blank">Start Survey</a>' +
            '<p>If the button above does not work, please copy and paste the following link into your web browser:</p>' +
            '<p><a href="' + surveyLink + '" style="' + linkStyle + '" target="_blank">' + surveyLink + '</a></p>' +
            '<div style="' + footerStyle + '">Thank you for your time and participation.</div>' +
            '</div></body></html>';

        return htmlBody;
    }

    // --- Helper for creating AuraHandledException from DML errors --- //
    private static AuraHandledException createAuraException(String prefix, List<Database.Error> errors) {
        String message = prefix + ': ';
        for (Database.Error error : errors) {
            message += error.getStatusCode() + ': ' + error.getMessage(); // Include status code
            if (error.getFields() != null && !error.getFields().isEmpty()) {
                message += ' (Fields: ' + String.join(error.getFields(), ', ') + ')';
            }
            message += '; ';
        }
        return new AuraHandledException(message.removeEnd('; '));
    }
} 