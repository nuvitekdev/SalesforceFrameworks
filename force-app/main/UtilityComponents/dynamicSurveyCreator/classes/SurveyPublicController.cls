/**
 * @description Controller for handling survey responses from the public site.
 * IMPORTANT: This class must be granted access in the public site's Guest User Profile.
 * It should generally run 'without sharing' to allow guest users to query/update necessary records,
 * but ensure all queries and DML operations are secure and specific.
 */
public without sharing class SurveyPublicController {
  /**
   * @description Wrapper class for survey data
   */
  public class SurveyWrapper {
    @AuraEnabled
    public Survey__c survey { get; set; }
    @AuraEnabled
    public List<Question__c> questions { get; set; }
    @AuraEnabled
    public Id responseId { get; set; }
    @AuraEnabled
    public Boolean requiresPasscode { get; set; }
  }

  /**
   * @description Validates passcode for a survey response
   * @param responseId The Unique_Response_ID__c identifying the response attempt
   * @param passcode The passcode entered by the user
   * @return Boolean True if passcode is valid or not required
   */
  @AuraEnabled
  public static Boolean validatePasscode(String responseId, String passcode) {
    try {
      // Find the survey response record
      List<Survey_Response__c> responses = [
        SELECT Id, Survey__c, Passcode__c, Survey__r.Require_Passcode__c
        FROM Survey_Response__c
        WHERE Unique_Response_ID__c = :responseId
        LIMIT 1
      ];

      if (responses.isEmpty()) {
        throw new AuraHandledException('Invalid survey link.');
      }

      Survey_Response__c responseRecord = responses[0];

      // If survey doesn't require passcode, return true
      if (!responseRecord.Survey__r.Require_Passcode__c) {
        return true;
      }

      // If passcode is required, validate it
      if (
        String.isBlank(passcode) || String.isBlank(responseRecord.Passcode__c)
      ) {
        return false;
      }

      return passcode.equals(responseRecord.Passcode__c);
    } catch (Exception e) {
      System.debug('Error validating passcode: ' + e.getMessage());
      throw new AuraHandledException(
        'Error validating passcode: ' + e.getMessage()
      );
    }
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
        SELECT
          Id,
          Name,
          Description__c,
          Welcome_Message__c,
          Thank_You_Message__c,
          Is_Active__c,
          Require_Passcode__c
        FROM Survey__c
        WHERE Id = :surveyRecordId AND Is_Active__c = TRUE
        LIMIT 1
      ];

      if (surveys.isEmpty()) {
        throw new AuraHandledException('Survey not found or is inactive.');
      }

      // Query the related Questions and Answer Options
      List<Question__c> questions = [
        SELECT
          Id,
          Question_Text__c,
          Type__c,
          Order__c,
          Is_Required__c,
          (
            SELECT Id, Option_Text__c, Order__c
            FROM Answer_Options__r
            ORDER BY Order__c ASC
          )
        FROM Question__c
        WHERE Survey__c = :surveyRecordId
        ORDER BY Order__c ASC
      ];

      // Construct the wrapper object to return
      SurveyWrapper wrapper = new SurveyWrapper();
      wrapper.survey = surveys[0];
      wrapper.questions = questions;
      wrapper.requiresPasscode = surveys[0].Require_Passcode__c;

      return wrapper;
    } catch (AuraHandledException e) {
      throw e;
    } catch (Exception e) {
      System.debug(
        'Error in getSurveyById: ' +
          e.getMessage() +
          '\n' +
          e.getStackTraceString()
      );
      throw new AuraHandledException(
        'Error retrieving survey: ' + e.getMessage()
      );
    }
  }

  /**
   * @description Retrieves survey details using a response ID with passcode validation
   * @param responseId The Unique_Response_ID__c identifying the response attempt
   * @param passcode The passcode for accessing the survey (optional)
   * @return SurveyWrapper A wrapper object containing survey and question details
   */
  @AuraEnabled(cacheable=true)
  public static SurveyWrapper getSurveyByResponseId(
    String responseId,
    String passcode
  ) {
    try {
      // Find the survey response record
      List<Survey_Response__c> responses = [
        SELECT
          Id,
          Survey__c,
          Status__c,
          Passcode__c,
          Survey__r.Require_Passcode__c
        FROM Survey_Response__c
        WHERE Unique_Response_ID__c = :responseId
        LIMIT 1
      ];

      if (responses.isEmpty()) {
        throw new AuraHandledException('Invalid survey link.');
      }

      Survey_Response__c responseRecord = responses[0];
      Id surveyId = responseRecord.Survey__c;

      // Validate passcode if required
      if (responseRecord.Survey__r.Require_Passcode__c) {
        if (
          String.isBlank(passcode) || String.isBlank(responseRecord.Passcode__c)
        ) {
          throw new AuraHandledException(
            'Passcode is required to access this survey.'
          );
        }

        if (!passcode.equals(responseRecord.Passcode__c)) {
          throw new AuraHandledException(
            'Invalid passcode. Please check your email for the correct passcode.'
          );
        }
      }

      // Query the Survey details
      List<Survey__c> surveys = [
        SELECT
          Id,
          Name,
          Description__c,
          Welcome_Message__c,
          Thank_You_Message__c,
          Is_Active__c,
          Require_Passcode__c
        FROM Survey__c
        WHERE Id = :surveyId AND Is_Active__c = TRUE
        LIMIT 1
      ];

      if (surveys.isEmpty()) {
        throw new AuraHandledException('Survey not found or is inactive.');
      }

      // Query the related Questions and Answer Options
      List<Question__c> questions = [
        SELECT
          Id,
          Question_Text__c,
          Type__c,
          Order__c,
          Is_Required__c,
          (
            SELECT Id, Option_Text__c, Order__c
            FROM Answer_Options__r
            ORDER BY Order__c ASC
          )
        FROM Question__c
        WHERE Survey__c = :surveyId
        ORDER BY Order__c ASC
      ];

      // Construct the wrapper object to return
      SurveyWrapper wrapper = new SurveyWrapper();
      wrapper.survey = surveys[0];
      wrapper.questions = questions;
      wrapper.responseId = responseRecord.Id;
      wrapper.requiresPasscode = surveys[0].Require_Passcode__c;

      return wrapper;
    } catch (AuraHandledException e) {
      throw e;
    } catch (Exception e) {
      System.debug(
        'Error in getSurveyByResponseId: ' +
          e.getMessage() +
          '\n' +
          e.getStackTraceString()
      );
      throw new AuraHandledException(
        'Error retrieving survey: ' + e.getMessage()
      );
    }
  }

  /**
   * @description Validates passcode for direct survey access by survey ID
   * @param surveyId The ID of the Survey__c record
   * @param passcode The passcode entered by the user
   * @return Boolean True if passcode is valid
   */
  @AuraEnabled
  public static Boolean validatePasscodeBySurveyId(
    String surveyId,
    String passcode
  ) {
    try {
      // Validate the ID format
      Id surveyRecordId;
      try {
        surveyRecordId = Id.valueOf(surveyId);
        if (String.valueOf(surveyRecordId.getSobjectType()) != 'Survey__c') {
          throw new AuraHandledException('Invalid Survey ID format.');
        }
      } catch (Exception e) {
        throw new AuraHandledException('Invalid Survey ID format.');
      }

      // Find any survey response record for this survey with the given passcode
      List<Survey_Response__c> responses = [
        SELECT Id, Survey__c, Passcode__c, Survey__r.Require_Passcode__c
        FROM Survey_Response__c
        WHERE
          Survey__c = :surveyRecordId
          AND Passcode__c = :passcode
          AND Survey__r.Require_Passcode__c = TRUE
        LIMIT 1
      ];

      // If we found a matching passcode, it's valid
      return !responses.isEmpty();
    } catch (Exception e) {
      System.debug('Error validating passcode by survey ID: ' + e.getMessage());
      return false;
    }
  }

  /**
   * @description Generates a unique ID for new survey responses
   * @return String A unique identifier
   */
  private static String generateUniqueId() {
    return EncodingUtil.convertToHex(Crypto.generateAESKey(128))
      .substring(0, 16);
  }

  /**
   * @description Submits the collected survey responses.
   * @param responseId The ID of the Survey_Response__c record being updated.
   * @param responseDataJson JSON string containing the answers keyed by Question__c ID.
   * @param surveyId The Survey__c ID (used for creating a new response if responseId is null)
   * @return String Confirmation message.
   */
  @AuraEnabled
  public static String submitSurveyResponse(
    Id responseId,
    String responseDataJson,
    String surveyId
  ) {
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
        throw new AuraHandledException(
          'Failed to create survey response: ' + e.getMessage()
        );
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

      if (!responseRecord.Survey__r.Is_Active__c) {
        throw new AuraHandledException('This survey is no longer active.');
      }
    }

    try {
      // Parse the response data
      Map<String, Object> responseData = (Map<String, Object>) JSON.deserializeUntyped(
        responseDataJson
      );
      List<Question_Response__c> questionResponsesToUpsert = new List<Question_Response__c>();

      for (String questionId : responseData.keySet()) {
        Object responseValue = responseData.get(questionId);
        String responseText = '';

        if (responseValue instanceof List<Object>) {
          // Handle multi-select responses
          List<Object> selectedValues = (List<Object>) responseValue;
          List<String> valueStrings = new List<String>();
          for (Object val : selectedValues) {
            valueStrings.add(String.valueOf(val));
          }
          responseText = String.join(valueStrings, ';');
        } else {
          responseText = String.valueOf(responseValue);
        }

        Question_Response__c qr = new Question_Response__c(
          Survey_Response__c = responseId,
          Question__c = questionId,
          Response_Text__c = responseText
        );
        questionResponsesToUpsert.add(qr);
      }

      // Upsert question responses
      if (!questionResponsesToUpsert.isEmpty()) {
        upsert questionResponsesToUpsert;
      }

      // Update the survey response status
      responseRecord.Status__c = 'Completed';
      responseRecord.Response_Date__c = System.now();
      update responseRecord;

      return 'Survey response submitted successfully!';
    } catch (Exception e) {
      System.debug('Error submitting survey response: ' + e.getMessage());
      throw new AuraHandledException(
        'Failed to submit survey response: ' + e.getMessage()
      );
    }
  }
}
