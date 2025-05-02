/**
 * @description Controller for handling survey responses from the public site.
 * IMPORTANT: This class must be granted access in the public site's Guest User Profile.
 * It should generally run 'without sharing' to allow guest users to query/update necessary records,
 * but ensure all queries and DML operations are secure and specific.
 */
public without sharing class SurveyPublicController {

    /**
     * @description Retrieves the details of a specific survey for display.
     * @param responseId The Unique_Response_ID__c identifying the response attempt.
     * @return SurveyWrapper A wrapper object containing survey and question details.
     */
    @AuraEnabled(cacheable=true)
    public static SurveyWrapper getSurveyDetails(String responseId) {
        // 1. Validate the responseId and find the corresponding Survey_Response__c record.
        List<Survey_Response__c> responses = [
            SELECT Id, Survey__c, Status__c
            FROM Survey_Response__c
            WHERE Unique_Response_ID__c = :responseId
            LIMIT 1
        ];

        if (responses.isEmpty()) {
            throw new AuraHandledException('Invalid survey link.');
        }

        Survey_Response__c responseRecord = responses[0];

        // 2. Check if the survey response is already completed or the survey is inactive.
        // (Allow retaking if needed, based on requirements)
        /*
        if (responseRecord.Status__c == 'Completed') {
            throw new AuraHandledException('This survey has already been completed.');
        }
        */

        Id surveyId = responseRecord.Survey__c;

        // 3. Query the Survey details.
        List<Survey__c> surveys = [
            SELECT Id, Name, Description__c, Welcome_Message__c, Thank_You_Message__c, Is_Active__c
            FROM Survey__c
            WHERE Id = :surveyId AND Is_Active__c = true
            LIMIT 1
        ];

        if (surveys.isEmpty()) {
            throw new AuraHandledException('Survey not found or is inactive.');
        }

        // 4. Query the related Questions and Answer Options.
        List<Question__c> questions = [
            SELECT Id, Question_Text__c, Type__c, Order__c, Is_Required__c,
                   (SELECT Id, Option_Text__c, Order__c
                    FROM Answer_Options__r
                    ORDER BY Order__c ASC)
            FROM Question__c
            WHERE Survey__c = :surveyId
            ORDER BY Order__c ASC
        ];

        // 5. Construct the wrapper object to return.
        SurveyWrapper wrapper = new SurveyWrapper();
        wrapper.survey = surveys[0];
        wrapper.questions = questions;
        wrapper.responseId = responseRecord.Id; // Pass the actual record Id back

        return wrapper;
    }

    /**
     * @description Retrieves the details of a specific survey using the direct Survey ID.
     * This allows for direct access to a survey without requiring a pre-created response record.
     * @param surveyId The ID of the Survey__c record to display
     * @return SurveyWrapper A wrapper object containing survey and question details
     */
    @AuraEnabled(cacheable=true)
    public static SurveyWrapper getSurveyById(String surveyId) {
        try {
            // Validate the ID format
            Id surveyRecordId;
            try {
                surveyRecordId = Id.valueOf(surveyId);
                // Verify this is a Survey__c ID
                if (String.valueOf(surveyRecordId.getSobjectType()) != 'Survey__c') {
                    throw new AuraHandledException('Invalid Survey ID format.');
                }
            } catch (Exception e) {
                throw new AuraHandledException('Invalid Survey ID format.');
            }
            
            // Query the Survey details
            List<Survey__c> surveys = [
                SELECT Id, Name, Description__c, Welcome_Message__c, Thank_You_Message__c, Is_Active__c
                FROM Survey__c
                WHERE Id = :surveyRecordId AND Is_Active__c = true
                LIMIT 1
            ];

            if (surveys.isEmpty()) {
                throw new AuraHandledException('Survey not found or is inactive.');
            }

            // Query the related Questions and Answer Options
            List<Question__c> questions = [
                SELECT Id, Question_Text__c, Type__c, Order__c, Is_Required__c,
                       (SELECT Id, Option_Text__c, Order__c
                        FROM Answer_Options__r
                        ORDER BY Order__c ASC)
                FROM Question__c
                WHERE Survey__c = :surveyRecordId
                ORDER BY Order__c ASC
            ];

            // Construct the wrapper object to return
            // We no longer create a response record here to avoid DML operations
            SurveyWrapper wrapper = new SurveyWrapper();
            wrapper.survey = surveys[0];
            wrapper.questions = questions;
            // Don't set responseId yet - it will be created when the user submits

            return wrapper;
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            System.debug('Error in getSurveyById: ' + e.getMessage() + '\n' + e.getStackTraceString());
            throw new AuraHandledException('Error retrieving survey: ' + e.getMessage());
        }
    }

    /**
     * @description Generates a unique ID for new survey responses
     * @return String A unique identifier
     */
    private static String generateUniqueId() {
        return EncodingUtil.convertToHex(Crypto.generateAESKey(128)).substring(0, 16);
    }

    /**
     * @description Submits the collected survey responses.
     * @param responseId The ID of the Survey_Response__c record being updated.
     * @param responseDataJson JSON string containing the answers keyed by Question__c ID.
     * @param surveyId The Survey__c ID (used for creating a new response if responseId is null)
     * @return String Confirmation message.
     */
    @AuraEnabled
    public static String submitSurveyResponse(Id responseId, String responseDataJson, String surveyId) {
        Survey_Response__c responseRecord;
        Boolean isNewResponse = false;
        
        // Check if we need to create a new response record
        if (responseId == null && String.isNotBlank(surveyId)) {
            try {
                // Create a new response record for this submission
                responseRecord = new Survey_Response__c(
                    Survey__c = surveyId,
                    Status__c = 'In Progress',
                    Unique_Response_ID__c = generateUniqueId()
                );
                insert responseRecord;
                responseId = responseRecord.Id;
                isNewResponse = true;
            } catch (Exception e) {
                throw new AuraHandledException('Failed to create survey response: ' + e.getMessage());
            }
        } else {
            // Use existing response record
            List<Survey_Response__c> responses = [
                SELECT Id, Status__c, Survey__c, Survey__r.Is_Active__c
                FROM Survey_Response__c
                WHERE Id = :responseId
                LIMIT 1
            ];

            if (responses.isEmpty()) {
                throw new AuraHandledException('Invalid response submission.');
            }

            responseRecord = responses[0];

            // Check survey/response status
            if (responseRecord.Status__c == 'Completed') {
                // For now, we'll allow overwriting, but you might want stricter logic.
                System.debug('Warning: Response already completed, overwriting: ' + responseId);
            }
            if (responseRecord.Survey__r.Is_Active__c == false) {
                throw new AuraHandledException('This survey is no longer active.');
            }
        }

        // Continue with rest of the original method...
        // 2. Deserialize the response data.
        Map<String, Object> questionResponsesMap = (Map<String, Object>)JSON.deserializeUntyped(responseDataJson);
        List<Question_Response__c> answersToUpsert = new List<Question_Response__c>();
        List<Question_Response__c> answersToInsert = new List<Question_Response__c>();
        List<Question_Response__c> answersToUpdate = new List<Question_Response__c>();

        // 3. Prepare Question_Response__c records.
        Set<Id> questionIds = new Set<Id>();
        for(String qIdStr : questionResponsesMap.keySet()) {
            try {
                questionIds.add(Id.valueOf(qIdStr));
            } catch (System.StringException e) {
                System.debug('Invalid Question ID format: ' + qIdStr);
                // Handle error - maybe skip this response or throw exception
            }
        }

        // Optional: Query Question__c records to validate types, required status etc.
        Map<Id, Question__c> questionsMap = new Map<Id, Question__c>([
            SELECT Id, Type__c, Is_Required__c FROM Question__c WHERE Id IN :questionIds
        ]);

        // Query existing responses for this Survey Response to determine insert vs update
        Map<Id, Question_Response__c> existingResponses = new Map<Id, Question_Response__c>();
        if (!isNewResponse) {
            for (Question_Response__c existing : [
                SELECT Id, Question__c, Response_Text__c
                FROM Question_Response__c
                WHERE Survey_Response__c = :responseId AND Question__c IN :questionIds
            ]) {
                existingResponses.put(existing.Question__c, existing);
            }
        }

        for (Id questionId : questionIds) {
            Object answerValue = questionResponsesMap.get(String.valueOf(questionId)); // Get value using String key
            String answerText = '';

            // Convert answer to string format suitable for Long Text Area
            if (answerValue instanceof List<Object>) {
                // Handle checkbox answers (list of selected values)
                List<String> selectedOptions = new List<String>();
                for(Object opt : (List<Object>)answerValue) {
                    selectedOptions.add(String.valueOf(opt));
                }
                answerText = String.join(selectedOptions, '; ');
            } else if (answerValue != null) {
                // Handle text, radio, rating
                answerText = String.valueOf(answerValue);
            }

            if (existingResponses.containsKey(questionId)) {
                // Update existing response
                Question_Response__c qrToUpdate = existingResponses.get(questionId);
                qrToUpdate.Response_Text__c = answerText;
                answersToUpdate.add(qrToUpdate);
            } else {
                // Insert new response
                Question_Response__c qrToInsert = new Question_Response__c(
                    Survey_Response__c = responseId,
                    Question__c = questionId,
                    Response_Text__c = answerText
                );
                answersToInsert.add(qrToInsert);
            }
        }

        // 4. Update the main Survey_Response__c status and perform DML.
        responseRecord.Status__c = 'Completed';
        responseRecord.Response_Date__c = System.now();

        try {
            // Perform DML in a transaction
            update responseRecord;
            if (!answersToInsert.isEmpty()) {
                insert answersToInsert;
            }
            if (!answersToUpdate.isEmpty()) {
                update answersToUpdate;
            }

            return 'Survey submitted successfully. Thank you!';
        } catch (Exception e) {
            // Log the error
            System.debug('Error submitting survey response: ' + e.getMessage() + '\n' + e.getStackTraceString());
            // Return a generic error message
            throw new AuraHandledException('An error occurred while submitting your response. Please try again later.');
        }
    }

    /**
     * @description Wrapper class to return survey details to the LWC.
     */
    public class SurveyWrapper {
        @AuraEnabled public Survey__c survey;
        @AuraEnabled public List<Question__c> questions;
        @AuraEnabled public Id responseId; // The *record ID* of the Survey_Response__c
        @AuraEnabled public String uniqueResponseId;
    }
} 