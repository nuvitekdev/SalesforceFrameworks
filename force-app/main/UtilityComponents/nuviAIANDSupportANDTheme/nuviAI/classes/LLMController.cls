public with sharing class LLMController {
  @AuraEnabled(cacheable=true)
  public static List<LLM_Configuration__mdt> getLLMConfigurations() {
    System.debug('Getting LLM configurations');
    List<LLM_Configuration__mdt> configs = [
      SELECT
        Id,
        DeveloperName,
        MasterLabel,
        Provider__c,
        Model_Name__c,
        Supports_Files__c
      FROM LLM_Configuration__mdt
      WHERE IsActive__c = TRUE
    ];
    System.debug('Found configurations: ' + configs);
    return configs;
  }

  @AuraEnabled
  public static String handleRequest(
    String recordId,
    String configName,
    String prompt,
    String operation,
    String relatedObjects,
    String reportObjects
  ) {
    System.debug('Handle request started');
    System.debug(
      'Parameters - recordId: ' +
        recordId +
        ', configName: ' +
        configName +
        ', operation: ' +
        operation
    );
    System.debug(
      'Additional params - relatedObjects: ' +
        relatedObjects +
        ', reportObjects: ' +
        reportObjects
    );
    System.debug('Prompt: ' + prompt);

    try {
      System.debug('Fetching LLM configuration');
      LLM_Configuration__mdt config = [
        SELECT
          API_Key__c,
          Base_URL__c,
          Model_Name__c,
          Provider__c,
          Supports_Files__c,
          Max_Tokens__c,
          Temperature__c
        FROM LLM_Configuration__mdt
        WHERE DeveloperName = :configName
        LIMIT 1
      ];
      System.debug('Found configuration: ' + config);

      String context = '';
      String attachments = '';

      // Handle different operations
      if (operation == 'report' && String.isNotBlank(reportObjects)) {
        System.debug('Getting report data for objects: ' + reportObjects);
        // Parse filtering criteria from the user's prompt
        Map<String, String> filters = parseFiltersFromPrompt(prompt);
        System.debug('Parsed filters: ' + filters);
        context = getReportData(reportObjects, filters);
        System.debug('Report context length: ' + context.length());
        System.debug(
          'First 500 chars of report context: ' +
          context.substring(0, Math.min(500, context.length()))
        );
      } else if (String.isNotBlank(recordId)) {
        System.debug('Getting record context');
        context = getRecordContext(recordId);
        System.debug('Context length: ' + context.length());

        System.debug('Getting attachments');
        attachments = config.Supports_Files__c
          ? getAttachmentsBase64(recordId)
          : '';
        System.debug('Attachments length: ' + attachments.length());
      }

      System.debug('Building full prompt');
      String fullPrompt = buildFullPrompt(
        operation,
        context,
        attachments,
        prompt
      );
      System.debug('Full prompt length: ' + fullPrompt.length());

      System.debug('Making LLM call');
      return makeLLMCall(config, fullPrompt);
    } catch (Exception e) {
      System.debug('ERROR in handleRequest: ' + e.getMessage());
      System.debug('Stack trace: ' + e.getStackTraceString());
      throw new AuraHandledException('Error: ' + e.getMessage());
    }
  }

  /**
   * @description Checks a given record for potential anomalies, conflicts of interest, or inconsistencies using an AI model.
   * @param recordId The Id of the Salesforce record to analyze.
   * @param configName The DeveloperName of the LLM_Configuration__mdt to use.
   * @return String The AI's assessment (e.g., "YES - Conflict of interest detected: Submitter and Investigator are the same." or "NO").
   * @throws AuraHandledException if an error occurs during processing.
   */
  @AuraEnabled
  public static String checkRecordForAnomalies(
    String recordId,
    String configName
  ) {
    System.debug(
      'Anomaly check started for recordId: ' +
        recordId +
        ' using config: ' +
        configName
    );

    // Validate inputs
    if (String.isBlank(recordId) || String.isBlank(configName)) {
      System.debug(
        'ERROR in checkRecordForAnomalies: Missing recordId or configName.'
      );
      throw new AuraHandledException(
        'Error: Record ID and AI Model Configuration Name are required.'
      );
    }

    try {
      // Fetch the specified LLM configuration
      System.debug('Fetching LLM configuration for anomaly check');
      LLM_Configuration__mdt config = [
        SELECT
          API_Key__c,
          Base_URL__c,
          Model_Name__c,
          Provider__c,
          Supports_Files__c,
          Max_Tokens__c,
          Temperature__c
        FROM LLM_Configuration__mdt
        WHERE DeveloperName = :configName
        LIMIT 1
      ];
      System.debug('Found configuration for anomaly check: ' + config);

      // Get the context for the specified record
      // This includes field values, related records, tasks, discussions, and document summaries.
      System.debug('Getting record context for anomaly check');
      String context = getRecordContext(recordId);
      System.debug('Context length for anomaly check: ' + context.length());

      // --- Future Enhancement: Optionally include attachment analysis ---
      // String attachments = config.Supports_Files__c ? getAttachmentsBase64(recordId) : '';
      // if(String.isNotBlank(attachments)) {
      //     context += '\n\nATTACHMENT DATA (BASE64 ENCODED - Only include if essential for analysis):\n' + attachments;
      // }
      // --- End Future Enhancement ---

      // Construct the prompt specifically for anomaly detection
      // Updated prompt to request HTML formatting for better display in LWC
      String anomalyPrompt =
        'Analyze the following Salesforce record data. Look specifically for potential issues such as: \n' +
        '- Anomalies (e.g., unusual values, missing required information for the stage)\n' +
        '- Conflicts of Interest (e.g., the same person involved in conflicting roles like submitter and approver)\n' +
        '- Inconsistencies (e.g., dates out of order, contradictory statements)\n' +
        '- Any other red flags or data points that seem incorrect or warrant further investigation.\n\n' +
        'Your response MUST start with either "YES - " followed by the explanation, or "NO" if no significant issues are detected.\n\n' +
        'IMPORTANT FORMATTING INSTRUCTIONS: If issues are found (starting with "YES - "), format the explanation using basic HTML:\n' +
        '  - Use <b> tags to highlight main points or titles (e.g., <b>Conflict of Interest</b>).\n' +
        '  - Use <ol> and <li> for numbered lists of main findings.\n' +
        '  - Use <ul> and <li> for bullet points under each finding or for recommendations.\n' +
        '  - Use <br> for line breaks where appropriate. Do NOT include the markdown `-` for bullets, use <li> instead.\n\n' +
        'RECORD DATA:\n' +
        context;

      System.debug('Anomaly check prompt length: ' + anomalyPrompt.length());

      // Call the LLM with the specific anomaly detection prompt
      System.debug('Making LLM call for anomaly check');
      String assessment = makeLLMCall(config, anomalyPrompt);
      System.debug('Anomaly check assessment received: ' + assessment);

      // Return the raw assessment from the LLM
      return assessment;
    } catch (Exception e) {
      // Log detailed error information
      System.debug('ERROR in checkRecordForAnomalies: ' + e.getMessage());
      System.debug('Stack trace: ' + e.getStackTraceString());
      // Throw a user-friendly exception
      throw new AuraHandledException(
        'Error performing AI anomaly check: ' + e.getMessage()
      );
    }
  }

  private static String getRecordContext(String recordId) {
    try {
      // Identify object type from record ID
      Schema.SObjectType objectType = Id.valueOf(recordId).getSObjectType();
      String objectName = objectType.getDescribe().getName();
      System.debug('Object type for record: ' + objectName);

      // Build a query for all accessible fields on this object
      Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe()
        .fields.getMap();
      List<String> fieldNames = new List<String>();

      for (String fieldName : fieldMap.keySet()) {
        Schema.DescribeFieldResult field = fieldMap.get(fieldName)
          .getDescribe();
        if (field.isAccessible()) {
          fieldNames.add(fieldName);
        }
      }

      // Build and execute dynamic query
      String query =
        'SELECT ' +
        String.join(fieldNames, ',') +
        ' FROM ' +
        objectName +
        ' WHERE Id = :recordId LIMIT 1';
      SObject record = Database.query(query);
      System.debug('Record retrieved: ' + record);

      // Start building rich context
      String context = '\nRECORD DETAILS:\n';

      // Add all field values to context
      for (String fieldName : fieldNames) {
        Object fieldValue = record.get(fieldName);
        if (fieldValue != null) {
          context +=
            '• ' +
            fieldMap.get(fieldName).getDescribe().getLabel() +
            ': ' +
            fieldValue +
            '\n';
        }
      }

      // Get relationship fields (lookups and master-detail)
      List<String> relationshipFields = new List<String>();
      for (String fieldName : fieldMap.keySet()) {
        Schema.DescribeFieldResult field = fieldMap.get(fieldName)
          .getDescribe();
        if (
          field.getType() == Schema.DisplayType.REFERENCE &&
          field.isAccessible()
        ) {
          relationshipFields.add(fieldName);
        }
      }

      // Add related record info if there are relationships
      if (!relationshipFields.isEmpty()) {
        context += '\nRELATED RECORDS:\n';
        for (String relField : relationshipFields) {
          Id relatedId = (Id) record.get(relField);
          if (relatedId != null) {
            String relatedObjName = relatedId.getSObjectType()
              .getDescribe()
              .getName();
            String relatedLabel = fieldMap.get(relField)
              .getDescribe()
              .getLabel();

            try {
              // Get name field of related object if possible
              String nameQuery =
                'SELECT Name FROM ' +
                relatedObjName +
                ' WHERE Id = :relatedId LIMIT 1';
              List<SObject> relatedRecords = Database.query(nameQuery);
              if (!relatedRecords.isEmpty()) {
                context +=
                  '• ' +
                  relatedLabel +
                  ': ' +
                  relatedRecords[0].get('Name') +
                  '\n';
              }
            } catch (Exception e) {
              // Some objects might not have a Name field
              context += '• ' + relatedLabel + ': ' + relatedId + '\n';
            }
          }
        }
      }

      // Get activity history for context (works for most standard objects)
      try {
        List<Task> recentTasks = [
          SELECT Subject, ActivityDate, Status, Owner.Name, Description
          FROM Task
          WHERE WhatId = :recordId
          ORDER BY ActivityDate DESC
          LIMIT 5
        ];

        if (!recentTasks.isEmpty()) {
          context += '\nRECENT TASKS:\n';
          for (Task t : recentTasks) {
            context += '• ' + t.Subject + ' (' + t.Status + ')';
            if (t.ActivityDate != null) {
              context += ' due ' + t.ActivityDate.format();
            }
            context += ' - ' + t.Owner.Name + '\n';
          }
        }
      } catch (Exception e) {
        System.debug('Error fetching tasks: ' + e.getMessage());
      }

      // Get collaboration activity (works for feed-enabled objects)
      try {
        List<FeedItem> recentPosts = [
          SELECT CreatedBy.Name, Body, CreatedDate
          FROM FeedItem
          WHERE ParentId = :recordId
          ORDER BY CreatedDate DESC
          LIMIT 3
        ];

        if (!recentPosts.isEmpty()) {
          context += '\nRECENT DISCUSSIONS:\n';
          for (FeedItem post : recentPosts) {
            context +=
              '• ' +
              post.CreatedBy.Name +
              ' (' +
              post.CreatedDate.format() +
              '): "' +
              post.Body.abbreviate(100) +
              '"\n';
          }
        }
      } catch (Exception e) {
        System.debug('Error fetching feed items: ' + e.getMessage());
      }

      // Include document summaries
      context += getDocumentSummaries(recordId);

      return context;
    } catch (Exception e) {
      System.debug('ERROR in getRecordContext: ' + e.getMessage());
      throw new AuraHandledException(
        'Failed to get record context: ' + e.getMessage()
      );
    }
  }

  private static String getDocumentSummaries(String recordId) {
    try {
      // First get the ContentDocumentLinks
      List<ContentDocumentLink> links = [
        SELECT ContentDocumentId
        FROM ContentDocumentLink
        WHERE LinkedEntityId = :recordId
      ];

      if (links.isEmpty()) {
        return '\nNO DOCUMENTS ATTACHED';
      }

      // Get the ContentDocument IDs
      Set<Id> contentDocIds = new Set<Id>();
      for (ContentDocumentLink link : links) {
        contentDocIds.add(link.ContentDocumentId);
      }

      // Then get the ContentVersions
      List<ContentVersion> versions = [
        SELECT Title, FileExtension, FileType, Description
        FROM ContentVersion
        WHERE ContentDocumentId IN :contentDocIds AND IsLatest = TRUE
      ];

      String summaries = '\nATTACHED DOCUMENTS:\n';
      for (ContentVersion doc : versions) {
        summaries += '• ' + doc.Title;
        if (doc.Description != null) {
          // Truncate description if too long
          String description = doc.Description;
          if (description.length() > 500) {
            description = description.substring(0, 497) + '...';
          }
          summaries += ' - ' + description;
        }
        summaries += ' (' + doc.FileType + ')\n';
      }
      return summaries;
    } catch (Exception e) {
      System.debug('ERROR getting document summaries: ' + e.getMessage());
      return '\nError processing documents: ' + e.getMessage();
    }
  }

  private static String getBaseQuery(String recordId) {
    System.debug('Generating base query for ID: ' + recordId);
    Schema.SObjectType sobjType = Id.valueOf(recordId).getSObjectType();
    String fields = String.join(
      new List<String>(sobjType.getDescribe().fields.getMap().keySet()),
      ','
    );
    String query =
      'SELECT ' +
      fields +
      ' FROM ' +
      sobjType.getDescribe().getName() +
      ' WHERE Id = :recordId';
    System.debug('Generated query: ' + query);
    return query;
  }

  private static String getAttachmentsBase64(String recordId) {
    System.debug('Getting attachments for record: ' + recordId);

    // Set maximum total base64 content length (approximately 15k tokens = ~60k characters)
    Integer MAX_TOTAL_LENGTH = 60000;

    try {
      List<ContentDocumentLink> links = [
        SELECT ContentDocumentId
        FROM ContentDocumentLink
        WHERE LinkedEntityId = :recordId
        LIMIT 5
      ];
      System.debug('Found ContentDocumentLinks: ' + links.size());

      Set<Id> contentDocumentIds = new Set<Id>();
      for (ContentDocumentLink link : links) {
        contentDocumentIds.add(link.ContentDocumentId);
      }
      System.debug('Content Document IDs: ' + contentDocumentIds);

      List<ContentVersion> versions = [
        SELECT Title, VersionData, FileExtension
        FROM ContentVersion
        WHERE ContentDocumentId IN :contentDocumentIds AND IsLatest = TRUE
      ];
      System.debug('Found ContentVersions: ' + versions.size());

      String attachments = '';
      Integer currentLength = 0;

      for (ContentVersion cv : versions) {
        System.debug('Processing file: ' + cv.Title);
        try {
          // Skip if file is too large
          if (cv.VersionData.size() > 1000000) {
            // 1MB limit
            System.debug('File too large: ' + cv.Title);
            attachments +=
              '\n\n[FILE: ' +
              cv.Title +
              ' - Too large to process]';
            continue;
          }

          String base64Content = EncodingUtil.base64Encode(cv.VersionData);
          Integer contentLength = base64Content.length();

          // Check if adding this content would exceed our limit
          if (currentLength + contentLength > MAX_TOTAL_LENGTH) {
            System.debug('Reached maximum content length limit');
            attachments += '\n\n[Additional files omitted due to size constraints]';
            break;
          }

          // If this single file's content is too large, truncate it
          if (contentLength > MAX_TOTAL_LENGTH) {
            base64Content =
              base64Content.substring(0, MAX_TOTAL_LENGTH) +
              '... [content truncated]';
          }

          attachments +=
            '\n\n[FILE: ' +
            cv.Title +
            ' (' +
            cv.FileExtension +
            ')]\n' +
            base64Content;
          currentLength += contentLength;
        } catch (Exception e) {
          System.debug(
            'ERROR processing file ' + cv.Title + ': ' + e.getMessage()
          );
          System.debug('Stack trace: ' + e.getStackTraceString());
          attachments += '\n\n[FILE: ' + cv.Title + ' - Failed to process]';
        }
      }

      System.debug('Total attachments string length: ' + attachments.length());
      return attachments;
    } catch (Exception e) {
      System.debug('ERROR in getAttachmentsBase64: ' + e.getMessage());
      System.debug('Stack trace: ' + e.getStackTraceString());
      throw new AuraHandledException(
        'Failed to process attachments: ' + e.getMessage()
      );
    }
  }

  private static String buildFullPrompt(
    String operation,
    String context,
    String attachments,
    String prompt
  ) {
    System.debug('Building full prompt');

    // Approximate token count (4 chars ≈ 1 token)
    Integer maxTokens = 150000; // Lower than max to leave room for response

    String basePrompt;
    if (operation == 'summarize') {
      basePrompt =
        'Please provide a comprehensive summary of this Salesforce record including:\n\n' +
        '1. Overview of the main record details\n' +
        '2. Related records and their relationship to this record\n' +
        '3. Recent activity and tasks\n' +
        '4. Any files or attachments\n\n' +
        'Format as a clear, structured report.\n\n';
    } else if (operation == 'report') {
      basePrompt =
        'You are analyzing real Salesforce data for reporting and visualization.\n\n' +
        'CRITICAL INSTRUCTIONS:\n' +
        '1. The data below contains ACTUAL SALESFORCE RECORDS with pre-calculated summaries\n' +
        '2. The data may be FILTERED based on user criteria (e.g., specific RecordType, Status, etc.)\n' +
        '3. Look for sections like "By Status:", "By Month Created:", "By Type:" in the data\n' +
        '4. Extract the EXACT counts from these sections - do not make up numbers\n' +
        '5. If user asks for "by month" or "created month" - use the "By Month Created:" section\n' +
        '6. If user asks for "by status" - use the "By Status:" section\n' +
        '7. If user specifies filters (like "RecordType = Correspondence"), only show data for that filter\n' +
        '8. Format response with clear label: count pairs (e.g., "Jan 2024: 15")\n' +
        '9. DO NOT say there is no data - the data is provided below in structured format\n' +
        '10. When data is filtered, explain what filter was applied (e.g., "Cases with RecordType = Correspondence")\n\n' +
        'EXAMPLE OF DATA FORMAT YOU WILL RECEIVE:\n' +
        'CASE DATA:\n' +
        'Total Records: 25 (filtered by RecordType = Correspondence)\n' +
        'By Status:\n' +
        '  New: 18\n' +
        '  In Progress: 5\n' +
        '  Closed: 2\n' +
        'By Month Created:\n' +
        '  Jan 2024: 10\n' +
        '  Feb 2024: 15\n\n' +
        'User question: ';
    } else {
      // For general questions, adjust the prompt based on whether there's a record context
      if (String.isBlank(context)) {
        basePrompt = 'Answer this question based on your knowledge:\n\n';
      } else {
        basePrompt = 'Answer this question about the Salesforce record:\n\n';
      }
    }

    // Calculate approximate tokens for each part
    Integer baseTokens = basePrompt.length() / 4;
    Integer contextTokens = context.length() / 4;
    Integer attachmentTokens = attachments.length() / 4;
    Integer promptTokens = prompt.length() / 4;

    // If total would exceed limit, trim components
    if (
      (baseTokens + contextTokens + attachmentTokens + promptTokens) > maxTokens
    ) {
      // Allocate tokens proportionally
      Integer remainingTokens = maxTokens - baseTokens - promptTokens;
      if (remainingTokens > 0) {
        Double ratio =
          remainingTokens / (Double) (contextTokens + attachmentTokens);

        // Truncate context and attachments
        context = context.substring(
          0,
          Math.min(context.length(), (Integer) (contextTokens * ratio * 4))
        );
        if (String.isNotBlank(attachments)) {
          attachments = attachments.substring(
            0,
            Math.min(
              attachments.length(),
              (Integer) (attachmentTokens * ratio * 4)
            )
          );
        }
      }
    }

    String fullPrompt = basePrompt;

    // Add context only if available
    if (String.isNotBlank(context)) {
      fullPrompt += context;
    }

    if (String.isNotBlank(attachments)) {
      fullPrompt += '\n\nATTACHMENTS AND FILES:\n' + attachments;
    }

    if (operation != 'summarize') {
      fullPrompt += '\n\nQUESTION: ' + prompt;
    }

    return fullPrompt;
  }

  private static String makeLLMCall(
    LLM_Configuration__mdt config,
    String prompt
  ) {
    System.debug('Starting makeLLMCall');
    System.debug('Provider: ' + config.Provider__c);
    System.debug('Model: ' + config.Model_Name__c);
    System.debug('Base URL: ' + config.Base_URL__c);

    // Set up retry logic parameters
    Integer maxRetries = 3;
    Integer currentRetry = 0;
    Integer baseWaitMs = 1000; // Start with 1 second wait for retries

    while (currentRetry < maxRetries) {
      try {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(config.Base_URL__c);
        req.setMethod('POST');
        req.setTimeout(120000); // 2 minutes timeout

        // Common headers for all providers
        req.setHeader('Content-Type', 'application/json');

        System.debug('Building request body');
        Map<String, Object> requestBody = new Map<String, Object>();

        // Extract instructions from prompt
        String instructions = 'Please provide a clear, explanatory response. Remember that the user may not be familiar with AI technology. Be professional yet accessible, and provide context for your answers. When appropriate, offer next steps or additional assistance. Use simple language and avoid technical jargon unless necessary, in which case explain the terms. IMPORTANT: When referencing previous messages in the conversation, do not add prefixes like "User:" or "You:" - just directly quote or paraphrase what was said without labeling who said it.';
        String cleanedPrompt = prompt.replace(
          'IMPORTANT: ' + instructions + '\n\n',
          ''
        );

        switch on config.Provider__c {
          when 'Anthropic' {
            System.debug('Preparing Anthropic request');
            req.setHeader('x-api-key', config.API_Key__c);
            req.setHeader('anthropic-version', '2023-06-01');

            requestBody = new Map<String, Object>{
              'model' => config.Model_Name__c,
              'max_tokens' => Integer.valueOf(config.Max_Tokens__c),
              'temperature' => config.Temperature__c,
              'system' => instructions,
              'messages' => new List<Map<String, Object>>{
                new Map<String, Object>{
                  'role' => 'user',
                  'content' => cleanedPrompt
                }
              }
            };
          }
          when 'OpenAI', 'DeepSeek', 'OpenRouter' {
            System.debug('Preparing OpenAI/DeepSeek/OpenRouter request');
            req.setHeader('Authorization', 'Bearer ' + config.API_Key__c);

            // Add HTTP-Referer for OpenRouter
            if (config.Provider__c == 'OpenRouter') {
              req.setHeader('HTTP-Referer', 'https://salesforce.com');
            }

            List<Map<String, Object>> messages = new List<Map<String, Object>>();

            // Add system message with instructions
            messages.add(
              new Map<String, Object>{
                'role' => 'system',
                'content' => instructions
              }
            );

            // Add user message with prompt
            messages.add(
              new Map<String, Object>{
                'role' => 'user',
                'content' => cleanedPrompt
              }
            );

            requestBody = new Map<String, Object>{
              'model' => config.Model_Name__c,
              'messages' => messages,
              'temperature' => config.Temperature__c,
              'max_tokens' => Integer.valueOf(config.Max_Tokens__c)
            };
          }
          when 'Google' {
            System.debug('Preparing Google request');
            req.setHeader('x-goog-api-key', config.API_Key__c);

            // Create generationConfig
            Map<String, Object> generationConfig = new Map<String, Object>{
              'temperature' => config.Temperature__c,
              'maxOutputTokens' => Integer.valueOf(config.Max_Tokens__c),
              'topP' => 0.95,
              'topK' => 40
            };

            // Create system instruction
            List<Map<String, Object>> contents = new List<Map<String, Object>>();

            // Add system instruction
            contents.add(
              new Map<String, Object>{
                'role' => 'user',
                'parts' => new List<Map<String, Object>>{
                  new Map<String, Object>{ 'text' => instructions }
                }
              }
            );

            // Add system response acknowledging instruction
            contents.add(
              new Map<String, Object>{
                'role' => 'model',
                'parts' => new List<Map<String, Object>>{
                  new Map<String, Object>{
                    'text' => 'I understand. I will provide direct, concise responses without explaining my reasoning or analysis process.'
                  }
                }
              }
            );

            // Add user message with actual prompt
            contents.add(
              new Map<String, Object>{
                'role' => 'user',
                'parts' => new List<Map<String, Object>>{
                  new Map<String, Object>{ 'text' => cleanedPrompt }
                }
              }
            );

            requestBody.put('contents', contents);
            requestBody.put('model', config.Model_Name__c);
            requestBody.put('generationConfig', generationConfig);
          }
          when else {
            throw new AuraHandledException(
              'Unsupported provider: ' + config.Provider__c
            );
          }
        }

        String bodyJson = JSON.serialize(requestBody);
        System.debug('Request body: ' + bodyJson);
        req.setBody(bodyJson);

        System.debug('Making HTTP request...');
        HttpResponse res = new Http().send(req);
        System.debug('Response status: ' + res.getStatus());
        System.debug('Response code: ' + res.getStatusCode());

        // Handle non-200 responses
        if (res.getStatusCode() != 200) {
          // Check for rate limiting or overloaded errors
          if (res.getStatusCode() == 429 || res.getStatusCode() == 529) {
            Integer waitTime = baseWaitMs * (Integer) Math.pow(2, currentRetry);
            currentRetry++;

            if (currentRetry >= maxRetries) {
              throw new AuraHandledException(
                'Service is currently overloaded. Please try again later.'
              );
            }

            // Wait and retry (this is a simplified version since we can't actually wait in Apex)
            System.debug(
              'Rate limited or overloaded. Retry ' +
                currentRetry +
                ' of ' +
                maxRetries +
                ' after ' +
                waitTime +
                'ms'
            );
            continue;
          }

          // For other errors, throw exception
          String errorMsg =
            'API Error: ' +
            res.getStatus() +
            ' - ' +
            res.getBody();
          System.debug('ERROR: ' + errorMsg);
          throw new AuraHandledException(errorMsg);
        }

        System.debug('Response body: ' + res.getBody());
        // Parse the response and return
        return parseResponse(config.Provider__c, res);
      } catch (Exception e) {
        System.debug(
          'ERROR in makeLLMCall attempt ' +
            (currentRetry + 1) +
            ': ' +
            e.getMessage()
        );
        System.debug('Stack trace: ' + e.getStackTraceString());

        // If it's the last retry or not a retryable error, throw the exception
        if (
          currentRetry >= maxRetries - 1 || !(e instanceof AuraHandledException)
        ) {
          throw e;
        }

        // Otherwise, increment retry counter and try again
        currentRetry++;
        System.debug(
          'Retrying... (Attempt ' + currentRetry + ' of ' + maxRetries + ')'
        );
      }
    }

    // This should never be reached due to the exception in the last retry
    throw new AuraHandledException(
      'Failed to call LLM service after ' + maxRetries + ' attempts'
    );
  }

  private static String parseResponse(String provider, HttpResponse res) {
    System.debug('Starting parseResponse for provider: ' + provider);
    System.debug('Response status code: ' + res.getStatusCode());

    if (res.getStatusCode() != 200) {
      String errorMsg = 'API Error: ' + res.getStatus() + ' - ' + res.getBody();
      System.debug('ERROR: ' + errorMsg);
      throw new AuraHandledException(errorMsg);
    }

    System.debug('Parsing response body: ' + res.getBody());
    Map<String, Object> response = (Map<String, Object>) JSON.deserializeUntyped(
      res.getBody()
    );
    System.debug('Deserialized response: ' + response);

    try {
      switch on provider {
        when 'Anthropic' {
          System.debug('Parsing Anthropic response');
          List<Object> content = (List<Object>) response.get('content');
          Map<String, Object> firstContent = (Map<String, Object>) content[0];
          String text = (String) firstContent.get('text');
          // Remove markdown formatting and replace asterisks with dashes
          text = text.replaceAll('\\*\\*', '').replaceAll('\\*', '-');
          System.debug('Extracted text: ' + text);
          return text;
        }
        when 'OpenAI', 'DeepSeek', 'OpenRouter' {
          System.debug('Parsing OpenAI/DeepSeek/OpenRouter response');
          List<Object> choices = (List<Object>) response.get('choices');
          Map<String, Object> firstChoice = (Map<String, Object>) choices[0];
          Map<String, Object> message = (Map<String, Object>) firstChoice.get(
            'message'
          );
          String content = (String) message.get('content');
          // Remove markdown formatting and replace asterisks with dashes
          content = content.replaceAll('\\*\\*', '').replaceAll('\\*', '-');
          System.debug('Content extracted: ' + content);
          return content;
        }
        when 'Google' {
          // Handle Gemini response
          System.debug('Parsing Google/Gemini response');
          if (response.containsKey('candidates')) {
            Object candidatesObj = response.get('candidates');
            if (candidatesObj instanceof List<Object>) {
              List<Object> candidates = (List<Object>) candidatesObj;
              if (!candidates.isEmpty()) {
                Map<String, Object> firstCandidate = (Map<String, Object>) candidates[0];
                if (firstCandidate.containsKey('content')) {
                  Map<String, Object> content = (Map<String, Object>) firstCandidate.get(
                    'content'
                  );
                  if (content.containsKey('parts')) {
                    List<Object> parts = (List<Object>) content.get('parts');
                    if (!parts.isEmpty()) {
                      Map<String, Object> firstPart = (Map<String, Object>) parts[0];
                      if (firstPart.containsKey('text')) {
                        String text = (String) firstPart.get('text');
                        // Remove markdown formatting and replace asterisks with dashes
                        text = text.replaceAll('\\*\\*', '')
                          .replaceAll('\\*', '-');
                        System.debug(
                          'Extracted text from Google/Gemini: ' + text
                        );
                        return text;
                      }
                    }
                  }
                }
              }
            }
          }
          // Fallback for Gemini
          throw new AuraHandledException(
            'Invalid response structure from Google/Gemini API'
          );
        }
        when else {
          throw new AuraHandledException('Unsupported provider: ' + provider);
        }
      }
    } catch (Exception e) {
      System.debug('ERROR parsing response: ' + e.getMessage());
      System.debug('Stack trace: ' + e.getStackTraceString());
      throw new AuraHandledException(
        'Failed to parse API response: ' + e.getMessage()
      );
    }
  }

  /**
   * @description Use AI to generate SOQL WHERE clause from natural language
   * @param prompt User's natural language query
   * @param objectName The Salesforce object being queried
   * @return String WHERE clause (without the WHERE keyword)
   */
  private static String generateSoqlWhereClauseWithAI(
    String prompt,
    String objectName
  ) {
    try {
      // Simple AI prompt to extract filter criteria
      String aiPrompt =
        'Convert this natural language query into a Salesforce SOQL WHERE clause.\n\n' +
        'Object: ' +
        objectName +
        '\n' +
        'User Question: "' +
        prompt +
        '"\n\n' +
        'RULES:\n' +
        '1. Return ONLY the WHERE clause conditions (without the word "WHERE")\n' +
        '2. Use proper SOQL syntax\n' +
        '3. For RecordType filtering, use RecordType.Name = \'value\'\n' +
        '4. For Status filtering, use Status = \'value\'\n' +
        '5. If no filters are needed, return "NONE"\n' +
        '6. Be case-sensitive with field names but flexible with values\n\n' +
        'Examples:\n' +
        'Input: "Cases where recordtype equals Correspondence"\n' +
        'Output: RecordType.Name = \'Correspondence\'\n\n' +
        'Input: "Show me all Cases"\n' +
        'Output: NONE\n\n' +
        'Input: "Cases with status New and recordtype Support"\n' +
        'Output: Status = \'New\' AND RecordType.Name = \'Support\'\n\n' +
        'Convert this query:';

      // Get a simple AI model for quick parsing
      List<LLM_Configuration__mdt> configs = [
        SELECT Id, DeveloperName, API_Key__c, Base_URL__c, Model_Name__c
        FROM LLM_Configuration__mdt
        WHERE DeveloperName LIKE '%GPT%' OR DeveloperName LIKE '%OpenAI%'
        LIMIT 1
      ];

      if (configs.isEmpty()) {
        System.debug(
          'No AI config found for SOQL generation, falling back to regex'
        );
        return null;
      }

      LLM_Configuration__mdt config = configs[0];
      String aiResponse = callSimpleOpenAI(config, aiPrompt);

      if (
        String.isNotBlank(aiResponse) && !aiResponse.equalsIgnoreCase('NONE')
      ) {
        System.debug('AI-generated WHERE clause: ' + aiResponse);
        return aiResponse.trim();
      }
    } catch (Exception e) {
      System.debug('Error generating SOQL with AI: ' + e.getMessage());
    }

    return null;
  }

  /**
   * @description Simple OpenAI API call for SOQL generation
   * @param config LLM Configuration
   * @param prompt The prompt to send
   * @return String AI response
   */
  private static String callSimpleOpenAI(
    LLM_Configuration__mdt config,
    String prompt
  ) {
    try {
      HttpRequest req = new HttpRequest();
      req.setEndpoint(config.Base_URL__c);
      req.setMethod('POST');
      req.setTimeout(30000); // 30 seconds for quick parsing
      req.setHeader('Content-Type', 'application/json');
      req.setHeader('Authorization', 'Bearer ' + config.API_Key__c);

      Map<String, Object> requestBody = new Map<String, Object>{
        'model' => config.Model_Name__c,
        'messages' => new List<Map<String, Object>>{
          new Map<String, Object>{ 'role' => 'user', 'content' => prompt }
        },
        'max_tokens' => 150,
        'temperature' => 0.1
      };

      req.setBody(JSON.serialize(requestBody));

      HttpResponse res = new Http().send(req);

      if (res.getStatusCode() == 200) {
        Map<String, Object> responseJson = (Map<String, Object>) JSON.deserializeUntyped(
          res.getBody()
        );
        List<Object> choices = (List<Object>) responseJson.get('choices');
        if (choices != null && !choices.isEmpty()) {
          Map<String, Object> choice = (Map<String, Object>) choices[0];
          Map<String, Object> message = (Map<String, Object>) choice.get(
            'message'
          );
          return (String) message.get('content');
        }
      } else {
        System.debug(
          'AI API error: ' + res.getStatusCode() + ' - ' + res.getBody()
        );
      }
    } catch (Exception e) {
      System.debug('Error calling AI API: ' + e.getMessage());
    }

    return null;
  }

  /**
   * @description Parse filtering criteria from user prompt (fallback method)
   * @param prompt User's question/request
   * @return Map<String, String> Field to value filters
   */
  private static Map<String, String> parseFiltersFromPrompt(String prompt) {
    Map<String, String> filters = new Map<String, String>();

    if (String.isBlank(prompt)) {
      return filters;
    }

    String promptLower = prompt.toLowerCase();

    // Parse RecordType filters
    // Patterns: "recordtype = 'Correspondence'", "recordtype equals Correspondence", "with recordtype Correspondence", "recordtype Correspondence"
    if (promptLower.contains('recordtype')) {
      // Try different patterns
      Pattern recordTypePattern1 = Pattern.compile(
        'recordtype\\s*=\\s*[\'"]([^\'"]+)[\'"]'
      );
      Pattern recordTypePattern2 = Pattern.compile(
        'recordtype\\s+(?:equals?|is)\\s+([a-zA-Z][a-zA-Z0-9\\s_-]+?)(?:\\s|$)'
      );
      Pattern recordTypePattern3 = Pattern.compile(
        'recordtype\\s+([a-zA-Z][a-zA-Z0-9\\s_-]+?)(?:\\s+by|\\s*$)'
      );
      Pattern recordTypePattern4 = Pattern.compile(
        'with\\s+recordtype\\s+([a-zA-Z][a-zA-Z0-9\\s_-]+?)(?:\\s+by|\\s*$)'
      );

      Matcher matcher1 = recordTypePattern1.matcher(promptLower);
      Matcher matcher2 = recordTypePattern2.matcher(promptLower);
      Matcher matcher3 = recordTypePattern3.matcher(promptLower);
      Matcher matcher4 = recordTypePattern4.matcher(promptLower);

      System.debug('RecordType Pattern 1 matches: ' + matcher1.find());
      matcher1.reset(); // Reset after find() call
      System.debug('RecordType Pattern 2 matches: ' + matcher2.find());
      matcher2.reset(); // Reset after find() call
      System.debug('RecordType Pattern 3 matches: ' + matcher3.find());
      matcher3.reset(); // Reset after find() call
      System.debug('RecordType Pattern 4 matches: ' + matcher4.find());
      matcher4.reset(); // Reset after find() call

      String extractedRecordType = null;

      if (matcher1.find()) {
        extractedRecordType = matcher1.group(1).trim();
        System.debug('Pattern 1 extracted: "' + extractedRecordType + '"');
      } else if (matcher2.find()) {
        extractedRecordType = matcher2.group(1).trim();
        System.debug('Pattern 2 extracted: "' + extractedRecordType + '"');
      } else if (matcher3.find()) {
        extractedRecordType = matcher3.group(1).trim();
        System.debug('Pattern 3 extracted: "' + extractedRecordType + '"');
      } else if (matcher4.find()) {
        extractedRecordType = matcher4.group(1).trim();
        System.debug('Pattern 4 extracted: "' + extractedRecordType + '"');
      } else {
        System.debug('No RecordType patterns matched!');
      }

      if (extractedRecordType != null) {
        // Try multiple variations to handle different naming conventions
        List<String> variations = new List<String>();

        // Original case
        variations.add(extractedRecordType);

        // Capitalize first letter of each word
        String[] words = extractedRecordType.split('\\s+');
        String capitalizedRecordType = '';
        for (String word : words) {
          if (capitalizedRecordType.length() > 0)
            capitalizedRecordType += ' ';
          capitalizedRecordType +=
            word.substring(0, 1).toUpperCase() +
            word.substring(1).toLowerCase();
        }
        variations.add(capitalizedRecordType);

        // All uppercase
        variations.add(extractedRecordType.toUpperCase());

        // All lowercase
        variations.add(extractedRecordType.toLowerCase());

        // Store all variations for flexible matching
        System.debug('Generated RecordType variations: ' + variations);
        System.debug(
          'Primary RecordType (capitalized): "' + capitalizedRecordType + '"'
        );
        filters.put('RecordType.Name', capitalizedRecordType); // Use title case as primary
        filters.put('RecordType.Variations', String.join(variations, '|'));
      }
    }

    // Parse Status filters
    if (promptLower.contains('status =')) {
      Pattern statusPattern = Pattern.compile(
        'status\\s*=\\s*[\'"]([^\'"]+)[\'"]'
      );
      Matcher statusMatcher = statusPattern.matcher(promptLower);
      if (statusMatcher.find()) {
        filters.put('Status', statusMatcher.group(1).trim());
      }
    }

    // Store original prompt for AI processing
    filters.put('OriginalPrompt', prompt);

    System.debug('=== FILTER PARSING DEBUG ===');
    System.debug('Original prompt: "' + prompt + '"');
    System.debug('Lowercase prompt: "' + promptLower + '"');
    System.debug('Contains recordtype: ' + promptLower.contains('recordtype'));
    System.debug('Final parsed filters: ' + filters);
    System.debug('=== END FILTER PARSING DEBUG ===');
    return filters;
  }

  /**
   * @description Get available RecordTypes for debugging
   * @param objectName API name of the object
   * @return String List of available RecordTypes
   */
  private static String getAvailableRecordTypes(String objectName) {
    String result = 'Available RecordTypes for ' + objectName + ':\n';

    try {
      String rtQuery =
        'SELECT Id, Name, DeveloperName FROM RecordType WHERE SObjectType = \'' +
        objectName +
        '\' AND IsActive = true';
      List<RecordType> recordTypes = Database.query(rtQuery);

      if (recordTypes.isEmpty()) {
        result += '  (No RecordTypes found)\n';
      } else {
        for (RecordType rt : recordTypes) {
          result +=
            '  - Name: "' +
            rt.Name +
            '", DeveloperName: "' +
            rt.DeveloperName +
            '"\n';
        }
      }

      // Also show some sample records to see what RecordType names are actually being used
      if (hasField(objectName, 'RecordTypeId')) {
        String sampleQuery =
          'SELECT Id, RecordType.Name FROM ' +
          objectName +
          ' WHERE RecordType.Name != null LIMIT 10';
        List<SObject> sampleRecords = Database.query(sampleQuery);

        if (!sampleRecords.isEmpty()) {
          result += '\nSample records and their RecordTypes:\n';
          Set<String> uniqueRecordTypes = new Set<String>();
          for (SObject record : sampleRecords) {
            if (record.getSObject('RecordType') != null) {
              String rtName = (String) record.getSObject('RecordType')
                .get('Name');
              uniqueRecordTypes.add(rtName);
            }
          }
          for (String rtName : uniqueRecordTypes) {
            result += '  - "' + rtName + '"\n';
          }
        }
      }
    } catch (Exception e) {
      result += '  Error getting RecordTypes: ' + e.getMessage() + '\n';
    }

    return result;
  }

  /**
   * @description Query data from specified objects for report generation (backward compatibility)
   * @param objectsToQuery Comma-separated list of object API names
   * @return String Formatted data suitable for AI analysis
   */
  private static String getReportData(String objectsToQuery) {
    return getReportData(objectsToQuery, new Map<String, String>());
  }

  /**
   * @description Query data from specified objects for report generation
   * @param objectsToQuery Comma-separated list of object API names
   * @param filters Map of field filters to apply
   * @return String Formatted data suitable for AI analysis
   */
  private static String getReportData(
    String objectsToQuery,
    Map<String, String> filters
  ) {
    if (String.isBlank(objectsToQuery)) {
      return '';
    }

    String reportData = '\nREPORT DATA FOR ANALYSIS:\n';
    reportData += '=' + '='.repeat(50) + '\n\n';

    List<String> objectNames = objectsToQuery.split(',');

    for (String objectName : objectNames) {
      objectName = objectName.trim();
      if (String.isBlank(objectName))
        continue;

      try {
        reportData += queryObjectForReport(objectName, filters);
      } catch (Exception e) {
        System.debug('Error querying ' + objectName + ': ' + e.getMessage());
        reportData +=
          'ERROR querying ' +
          objectName +
          ': ' +
          e.getMessage() +
          '\n\n';
      }
    }

    return reportData;
  }

  /**
   * @description Query a single object and return formatted data for analysis
   * @param objectName API name of the object to query
   * @param filters Map of field filters to apply
   * @return String Formatted query results
   */
  private static String queryObjectForReport(
    String objectName,
    Map<String, String> filters
  ) {
    String result = objectName.toUpperCase() + ' DATA:\n';
    result += '-'.repeat(30) + '\n';

    // Build basic SOQL query with object-specific identifier field
    String soql = 'SELECT Id';

    // Add the appropriate "name" field based on object type
    if (objectName.equalsIgnoreCase('Case')) {
      soql += ', CaseNumber';
    } else if (objectName.equalsIgnoreCase('Task')) {
      soql += ', Subject';
    } else if (objectName.equalsIgnoreCase('Event')) {
      soql += ', Subject';
    } else {
      // Most objects have Name field
      if (hasField(objectName, 'Name')) {
        soql += ', Name';
      }
    }

    // Add common date fields for time-based analysis
    if (hasField(objectName, 'CreatedDate')) {
      soql += ', CreatedDate';
    }
    if (hasField(objectName, 'LastModifiedDate')) {
      soql += ', LastModifiedDate';
    }

    // Add Status field if it exists (for grouping analysis)
    if (hasField(objectName, 'Status')) {
      soql += ', Status';
    }

    // Add RecordType for Cases, Opportunities, etc.
    if (hasField(objectName, 'RecordTypeId')) {
      soql += ', RecordType.Name';
    }

    // Add object-specific fields
    if (objectName.equalsIgnoreCase('Case')) {
      if (hasField(objectName, 'Priority'))
        soql += ', Priority';
      if (hasField(objectName, 'Origin'))
        soql += ', Origin';
      if (hasField(objectName, 'Type'))
        soql += ', Type';
    } else if (objectName.equalsIgnoreCase('Opportunity')) {
      if (hasField(objectName, 'StageName'))
        soql += ', StageName';
      if (hasField(objectName, 'Amount'))
        soql += ', Amount';
      if (hasField(objectName, 'CloseDate'))
        soql += ', CloseDate';
    } else if (objectName.equalsIgnoreCase('Account')) {
      if (hasField(objectName, 'Type'))
        soql += ', Type';
      if (hasField(objectName, 'Industry'))
        soql += ', Industry';
    }

    soql += ' FROM ' + objectName;

    // Try AI-generated WHERE clause first, then fall back to regex-based filters
    String whereClause = '';

    // Get the original user prompt for AI processing
    String originalPrompt = '';
    if (filters != null && filters.containsKey('OriginalPrompt')) {
      originalPrompt = filters.get('OriginalPrompt');
    }

    if (String.isNotBlank(originalPrompt)) {
      String aiWhereClause = generateSoqlWhereClauseWithAI(
        originalPrompt,
        objectName
      );
      if (String.isNotBlank(aiWhereClause)) {
        whereClause = aiWhereClause;
        System.debug(
          '✅ AI SUCCESS: Using AI-generated WHERE clause: ' + whereClause
        );
        result += 'AI WHERE Clause: ' + whereClause + '\n';
      } else {
        System.debug('❌ AI FAILED: Falling back to regex parsing');
      }
    }

    // Fallback to regex-based parsing if AI didn't work
    if (String.isBlank(whereClause)) {
      List<String> whereConditions = new List<String>();
      if (filters != null && !filters.isEmpty()) {
        for (String fieldName : filters.keySet()) {
          String filterValue = filters.get(fieldName);
          if (
            String.isNotBlank(filterValue) &&
            !fieldName.equals('RecordType.Variations') &&
            !fieldName.equals('OriginalPrompt')
          ) {
            if (fieldName.equals('RecordType.Name')) {
              // For RecordType, try multiple variations
              if (filters.containsKey('RecordType.Variations')) {
                String variations = filters.get('RecordType.Variations');
                System.debug(
                  'Building RecordType WHERE clause with variations: ' +
                  variations
                );
                List<String> variationList = variations.split('\\|');
                List<String> recordTypeConditions = new List<String>();
                for (String variation : variationList) {
                  String condition =
                    'RecordType.Name = \'' +
                    String.escapeSingleQuotes(variation) +
                    '\'';
                  recordTypeConditions.add(condition);
                  System.debug('Added RecordType condition: ' + condition);
                }
                String finalCondition =
                  '(' +
                  String.join(recordTypeConditions, ' OR ') +
                  ')';
                whereConditions.add(finalCondition);
                System.debug(
                  'Final RecordType WHERE clause: ' + finalCondition
                );
              } else {
                String condition =
                  fieldName +
                  ' = \'' +
                  String.escapeSingleQuotes(filterValue) +
                  '\'';
                whereConditions.add(condition);
                System.debug('Simple RecordType condition: ' + condition);
              }
            } else {
              whereConditions.add(
                fieldName +
                  ' = \'' +
                  String.escapeSingleQuotes(filterValue) +
                  '\''
              );
            }
          }
        }
      }

      if (!whereConditions.isEmpty()) {
        whereClause = String.join(whereConditions, ' AND ');
        System.debug('Using regex-based WHERE clause: ' + whereClause);
      }
    }

    if (String.isNotBlank(whereClause)) {
      soql += ' WHERE ' + whereClause;
    }

    soql += ' ORDER BY CreatedDate DESC LIMIT 10000';

    result += 'DEBUG INFO:\n';
    String queryMethod = 'None';
    if (String.isNotBlank(whereClause)) {
      if (
        filters != null &&
        filters.containsKey('OriginalPrompt') &&
        result.contains('AI WHERE Clause:')
      ) {
        queryMethod = 'AI-Generated';
      } else {
        queryMethod = 'Regex-Based';
      }
    }
    result += 'Query Method: ' + queryMethod + '\n';
    result +=
      'Applied Filters: ' +
      (filters != null ? filters.keySet().toString() : 'None') +
      '\n';
    result += 'Generated SOQL: ' + soql + '\n';

    // Test direct query if we have a RecordType filter
    if (
      filters != null &&
      (filters.containsKey('RecordType.Name') || String.isNotBlank(whereClause))
    ) {
      try {
        String testQuery =
          'SELECT COUNT() FROM ' +
          objectName +
          ' WHERE RecordType.Name = \'Correspondence\'';
        Integer testCount = Database.countQuery(testQuery);
        result +=
          'DIRECT TEST - Records with RecordType.Name = \'Correspondence\': ' +
          testCount +
          '\n';
      } catch (Exception e) {
        result += 'DIRECT TEST ERROR: ' + e.getMessage() + '\n';
      }
    }
    result += '\n';

    System.debug('Executing SOQL for ' + objectName + ': ' + soql);

    try {
      List<SObject> records = Database.query(soql);
      System.debug(
        'Query returned ' + records.size() + ' records for ' + objectName
      );

      // If no records found and we have a RecordType filter, show available RecordTypes
      if (
        records.isEmpty() &&
        filters != null &&
        filters.containsKey('RecordType.Name')
      ) {
        result += 'DEBUG: No records found with the specified filter.\n';
        result += getAvailableRecordTypes(objectName) + '\n';
      }

      // Show if filters were applied
      String filterInfo = '';
      if (filters != null && !filters.isEmpty()) {
        List<String> filterDescriptions = new List<String>();
        for (String fieldName : filters.keySet()) {
          filterDescriptions.add(fieldName + ' = ' + filters.get(fieldName));
        }
        filterInfo =
          ' (filtered by ' +
          String.join(filterDescriptions, ', ') +
          ')';
      }

      result += 'Total Records: ' + records.size() + filterInfo + '\n\n';

      // Create summary statistics for key fields
      if (!records.isEmpty()) {
        result += createFieldSummaries(records, objectName);
      }
    } catch (Exception e) {
      result += 'ERROR: ' + e.getMessage() + '\n';
    }

    result += '\n' + '='.repeat(50) + '\n\n';
    return result;
  }

  /**
   * @description Create summary statistics for common fields
   */
  private static String createFieldSummaries(
    List<SObject> records,
    String objectName
  ) {
    String summary = 'FIELD SUMMARIES:\n';
    Map<String, Integer> statusCounts = new Map<String, Integer>();
    Map<String, Integer> typeCounts = new Map<String, Integer>();
    Map<String, Integer> monthCounts = new Map<String, Integer>();

    for (SObject record : records) {
      // Count by Status
      if (record.get('Status') != null) {
        String status = String.valueOf(record.get('Status'));
        Integer currentCount = statusCounts.containsKey(status)
          ? statusCounts.get(status)
          : 0;
        statusCounts.put(status, currentCount + 1);
      }

      // Count by Type (for various objects)
      String typeField = null;
      if (objectName.equalsIgnoreCase('Case') && record.get('Type') != null) {
        typeField = String.valueOf(record.get('Type'));
      } else if (
        objectName.equalsIgnoreCase('Account') && record.get('Type') != null
      ) {
        typeField = String.valueOf(record.get('Type'));
      } else if (
        objectName.equalsIgnoreCase('Opportunity') &&
        record.get('StageName') != null
      ) {
        typeField = String.valueOf(record.get('StageName'));
      }

      if (typeField != null) {
        Integer currentCount = typeCounts.containsKey(typeField)
          ? typeCounts.get(typeField)
          : 0;
        typeCounts.put(typeField, currentCount + 1);
      }

      // Count by month created
      if (record.get('CreatedDate') != null) {
        DateTime createdDate = (DateTime) record.get('CreatedDate');
        String monthKey = createdDate.format('MMM yyyy');
        Integer currentCount = monthCounts.containsKey(monthKey)
          ? monthCounts.get(monthKey)
          : 0;
        monthCounts.put(monthKey, currentCount + 1);
      }
    }

    // Add Status breakdown
    if (!statusCounts.isEmpty()) {
      summary += '\nBy Status:\n';
      for (String status : statusCounts.keySet()) {
        summary += '  ' + status + ': ' + statusCounts.get(status) + '\n';
      }
    }

    // Add Type/Stage breakdown
    if (!typeCounts.isEmpty()) {
      String label = objectName.equalsIgnoreCase('Opportunity')
        ? 'By Stage'
        : 'By Type';
      summary += '\n' + label + ':\n';
      for (String type : typeCounts.keySet()) {
        summary += '  ' + type + ': ' + typeCounts.get(type) + '\n';
      }
    }

    // Add monthly breakdown (last 12 months)
    if (!monthCounts.isEmpty()) {
      summary += '\nBy Month Created:\n';
      for (String month : monthCounts.keySet()) {
        summary += '  ' + month + ': ' + monthCounts.get(month) + '\n';
      }
    }

    return summary + '\n';
  }

  /**
   * @description Check if an object has a specific field
   */
  private static Boolean hasField(String objectName, String fieldName) {
    try {
      Schema.SObjectType objType = Schema.getGlobalDescribe().get(objectName);
      if (objType == null)
        return false;

      Schema.DescribeSObjectResult objDescribe = objType.getDescribe();
      Map<String, Schema.SObjectField> fieldMap = objDescribe.fields.getMap();

      return fieldMap.containsKey(fieldName.toLowerCase());
    } catch (Exception e) {
      return false;
    }
  }

  // === ADDITIONAL METHODS REQUIRED BY JAVASCRIPT ===

  /**
   * @description Saves an analysis summary to a specified field on a record
   * @param recordId The Id of the Salesforce record to update
   * @param fieldApiName The API name of the field to update
   * @param analysisText The analysis text to save to the field
   * @return void
   * @throws AuraHandledException if an error occurs during processing
   */
  @AuraEnabled
  public static void saveAnalysisToField(
    String recordId,
    String fieldApiName,
    String analysisText
  ) {
    System.debug(
      'Saving analysis to field. RecordId: ' +
        recordId +
        ', Field: ' +
        fieldApiName
    );

    try {
      // Validate inputs
      if (String.isBlank(recordId) || String.isBlank(fieldApiName)) {
        throw new AuraHandledException(
          'Missing required parameters: recordId and fieldApiName are required'
        );
      }

      // Identify object type from record ID
      Schema.SObjectType objectType = Id.valueOf(recordId).getSObjectType();
      String objectName = objectType.getDescribe().getName();
      System.debug('Object type for record: ' + objectName);

      // Verify the field exists on this object
      Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe()
        .fields.getMap();
      if (!fieldMap.containsKey(fieldApiName)) {
        throw new AuraHandledException(
          'Field ' + fieldApiName + ' does not exist on object ' + objectName
        );
      }

      // Verify the field is updateable
      Schema.DescribeFieldResult fieldDescribe = fieldMap.get(fieldApiName)
        .getDescribe();
      if (!fieldDescribe.isUpdateable()) {
        throw new AuraHandledException(
          'Field ' +
            fieldApiName +
            ' is not updateable. Check your permissions.'
        );
      }

      if (analysisText == 'FIELD_CHECK_ONLY') {
        System.debug(
          'Field check only mode - field exists and is valid. No update performed.'
        );
        return;
      }

      if (String.isBlank(analysisText)) {
        throw new AuraHandledException(
          'Missing required parameter: analysisText is required for field updates'
        );
      }

      String processedText = analysisText.length() > 600
        ? analysisText.substring(0, 597) + '...'
        : analysisText;

      Schema.DisplayType fieldType = fieldDescribe.getType();
      if (fieldType == Schema.DisplayType.STRING) {
        Integer maxLength = fieldDescribe.getLength();
        if (processedText.length() > maxLength) {
          processedText = processedText.substring(0, maxLength);
          System.debug(
            'Text truncated to match field length limit of ' +
              maxLength +
              ' characters'
          );
        }
      } else if (fieldType == Schema.DisplayType.TEXTAREA) {
        Integer maxLength = fieldDescribe.getLength();
        if (maxLength > 0 && processedText.length() > maxLength) {
          processedText = processedText.substring(0, maxLength);
          System.debug(
            'Text truncated to match field length limit of ' +
              maxLength +
              ' characters'
          );
        }
      } else if (
        fieldType == Schema.DisplayType.TEXTAREA &&
        fieldDescribe.isHtmlFormatted()
      ) {
        if (!processedText.contains('<p>') && !processedText.contains('<br')) {
          processedText = processedText.replace('\n', '<br/>');
        }
      }

      // Create a generic SObject for the update
      SObject record = objectType.newSObject();
      record.put('Id', recordId);
      record.put(fieldApiName, processedText);

      // Update the record
      update record;

      System.debug(
        'Analysis saved successfully to field ' +
          fieldApiName +
          ' (Character count: ' +
          processedText.length() +
          ')'
      );
    } catch (Exception e) {
      System.debug('ERROR in saveAnalysisToField: ' + e.getMessage());
      System.debug('Stack trace: ' + e.getStackTraceString());
      throw new AuraHandledException(
        'Error saving analysis: ' + e.getMessage()
      );
    }
  }

  /**
   * Processes images attached to a record using OpenAI's Vision API
   * @param recordId - The record ID to get the attachments from
   * @param userSuppliedPrompt - The text prompt to send along with the images
   * @return String - The response from OpenAI's Vision API
   */
  @AuraEnabled
  public static String processImagesWithAI(
    String recordId,
    String userSuppliedPrompt
  ) {
    try {
      // Get base64 encoded attachments - ONLY include image types (not PDFs or other documents)
      List<Map<String, String>> attachments = getDocumentsForVisionAnalysis(
        recordId,
        false
      );
      if (attachments == null || attachments.isEmpty()) {
        return 'No images found for this record.';
      }

      // Get API Key from custom metadata
      List<LLM_Configuration__mdt> configs = [
        SELECT Id, API_Key__c, Model_Name__c, Base_URL__c
        FROM LLM_Configuration__mdt
        WHERE DeveloperName = 'OpenAI_GPT4_Vision'
      ];

      if (configs.isEmpty()) {
        return 'OpenAI GPT4 Vision configuration not found. Please configure it in custom metadata.';
      }

      LLM_Configuration__mdt config = configs[0];
      String apiKey = config.API_Key__c;
      String model = config.Model_Name__c;
      String endpoint = config.Base_URL__c;

      String enhancedPrompt = String.isNotBlank(userSuppliedPrompt)
        ? userSuppliedPrompt
        : 'Analyze these images in detail.';
      enhancedPrompt += '\n\n';

      // Add formatting instructions
      enhancedPrompt +=
        'IMAGE ANALYSIS FORMATTING INSTRUCTIONS FOR EACH IMAGE:\n' +
        '- **DO NOT** include any introductory or concluding conversational phrases, apologies, or offers for further assistance.\n' +
        '- **ONLY** provide the structured analysis for each image as specified below.\n' +
        '- Start each image\'s analysis *immediately* with its title using <b> tags (e.g., <b>Image 1: Filename.jpg</b>). NO text before this title.\n' +
        '- For each image, create the following main sections using <b> tags for their titles: <b>Executive Summary:</b>, <b>In-Depth Analysis:</b>, and <b>Key Observations & Relevance:</b>.\n' +
        '- **DO NOT USE MARKDOWN** for any formatting. Use HTML tags exclusively as specified (<b>, <ul>, <li>, <br>, <hr>).\n' +
        '- Use <ul> and <li> tags for all bulleted lists. Each <li> item should represent a distinct point.\n' +
        '- Use a single <br> tag for line breaks if needed for readability within paragraphs.\n' +
        '- Ensure a clear visual separation (e.g., a single <hr> tag) between the full analysis of one image and the start of the next image\'s title if multiple images are analyzed.\n';

      enhancedPrompt += '\nImage Information Provided by System (for your reference during analysis):\n';
      Integer imageIndex = 1;

      for (Map<String, String> attachment : attachments) {
        String fileName = attachment.get('fileName');
        String contentType = attachment.get('contentType');
        String dimensions = attachment.get('dimensions');
        String fileSize = attachment.get('fileSize');

        enhancedPrompt +=
          'Image ' +
          imageIndex +
          ': ' +
          fileName +
          ' (Type: ' +
          contentType +
          ')';

        if (dimensions != null) {
          enhancedPrompt += ' - Dimensions: ' + dimensions;
        }

        if (fileSize != null) {
          enhancedPrompt += ' - Size: ' + fileSize;
        }

        enhancedPrompt += '\n';
        imageIndex++;
      }

      // Prepare request body with images
      Map<String, Object> requestBody = new Map<String, Object>();
      requestBody.put('model', model);

      List<Map<String, Object>> messages = new List<Map<String, Object>>();
      Map<String, Object> userMessage = new Map<String, Object>();
      userMessage.put('role', 'user');

      List<Map<String, Object>> contentItems = new List<Map<String, Object>>();

      // Add enhanced text prompt
      Map<String, Object> textContent = new Map<String, Object>();
      textContent.put('type', 'text');
      textContent.put('text', enhancedPrompt);
      contentItems.add(textContent);

      // Add images
      for (Map<String, String> attachment : attachments) {
        String base64Data = attachment.get('base64');
        String contentType = attachment.get('contentType');

        Map<String, Object> imageContent = new Map<String, Object>();
        imageContent.put('type', 'image_url');

        Map<String, String> imageUrl = new Map<String, String>();
        imageUrl.put('url', 'data:' + contentType + ';base64,' + base64Data);

        imageContent.put('image_url', imageUrl);
        contentItems.add(imageContent);
      }

      userMessage.put('content', contentItems);
      messages.add(userMessage);
      requestBody.put('messages', messages);

      requestBody.put('max_tokens', 2000);

      // Call OpenAI API
      Http http = new Http();
      HttpRequest request = new HttpRequest();
      request.setEndpoint(endpoint);
      request.setMethod('POST');
      request.setHeader('Content-Type', 'application/json');
      request.setHeader('Authorization', 'Bearer ' + apiKey);
      request.setBody(JSON.serialize(requestBody));
      request.setTimeout(120000);

      HttpResponse response = http.send(request);

      if (response.getStatusCode() == 200) {
        Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(
          response.getBody()
        );
        List<Object> choices = (List<Object>) responseMap.get('choices');

        if (choices != null && !choices.isEmpty()) {
          Map<String, Object> choice = (Map<String, Object>) choices[0];
          Map<String, Object> message = (Map<String, Object>) choice.get(
            'message'
          );
          String contentText = (String) message.get('content');
          return contentText;
        }
      }

      return 'Error processing images: ' +
        response.getStatusCode() +
        ' ' +
        response.getStatus() +
        '\n' +
        response.getBody();
    } catch (Exception e) {
      return 'Error processing images: ' +
        e.getMessage() +
        '\n' +
        e.getStackTraceString();
    }
  }

  /**
   * @description Retrieves a list of PDF attachments for a given record.
   * @param recordId The ID of the record to check for PDF attachments.
   * @return List<Map<String, String>> A list of maps, where each map contains 'id' (ContentDocumentId) and 'title' of a PDF.
   */
  @AuraEnabled(cacheable=true)
  public static List<Map<String, String>> getPdfAttachmentsForRecord(
    String recordId
  ) {
    if (String.isBlank(recordId)) {
      return new List<Map<String, String>>();
    }

    List<Map<String, String>> pdfs = new List<Map<String, String>>();
    try {
      List<ContentDocumentLink> links = [
        SELECT ContentDocumentId
        FROM ContentDocumentLink
        WHERE LinkedEntityId = :recordId
      ];

      if (links.isEmpty()) {
        return pdfs;
      }

      Set<Id> contentDocumentIds = new Set<Id>();
      for (ContentDocumentLink link : links) {
        contentDocumentIds.add(link.ContentDocumentId);
      }

      List<ContentVersion> versions = [
        SELECT ContentDocumentId, Title, FileExtension
        FROM ContentVersion
        WHERE
          ContentDocumentId IN :contentDocumentIds
          AND IsLatest = TRUE
          AND FileExtension = 'pdf'
      ];

      Set<Id> processedDocIds = new Set<Id>();
      for (ContentVersion cv : versions) {
        if (!processedDocIds.contains(cv.ContentDocumentId)) {
          Map<String, String> pdfInfo = new Map<String, String>();
          pdfInfo.put('id', cv.ContentDocumentId);
          pdfInfo.put('title', cv.Title);
          pdfs.add(pdfInfo);
          processedDocIds.add(cv.ContentDocumentId);
        }
      }
    } catch (Exception e) {
      System.debug('Error in getPdfAttachmentsForRecord: ' + e.getMessage());
    }
    return pdfs;
  }

  /**
   * @description Processes a specific PDF document attached to a record using an AI model (specifically GPT-4o with file input).
   * @param recordId The Id of the Salesforce record
   * @param contentDocumentIds The Ids of the ContentDocuments representing the PDFs.
   * @param userPrompt The prompt to send to the AI regarding the PDF.
   * @return String The AI's analysis of the PDF.
   * @throws AuraHandledException if an error occurs during processing.
   */
  @AuraEnabled
  public static String processPdfDocumentWithAI(
    String recordId,
    List<String> contentDocumentIds,
    String userPrompt
  ) {
    System.debug(
      'Starting PDF processing for ' +
        contentDocumentIds.size() +
        ' documents. User prompt: ' +
        userPrompt
    );

    if (
      contentDocumentIds == null ||
      contentDocumentIds.isEmpty() ||
      String.isBlank(userPrompt)
    ) {
      System.debug('Error: Missing ContentDocumentIds or user prompt.');
      throw new AuraHandledException(
        'Error: PDF Document IDs and a prompt are required.'
      );
    }

    // Get API Configuration for GPT-4o
    List<LLM_Configuration__mdt> configs = [
      SELECT
        Id,
        API_Key__c,
        Base_URL__c,
        Model_Name__c,
        Provider__c,
        Max_Tokens__c,
        Temperature__c
      FROM LLM_Configuration__mdt
      WHERE DeveloperName = 'OpenAI_GPT4_Vision'
      LIMIT 1
    ];

    if (configs.isEmpty()) {
      System.debug(
        'Error: LLM Configuration not found for: OpenAI_GPT4_Vision'
      );
      throw new AuraHandledException(
        'Error: AI Model configuration for PDF analysis not found or inactive.'
      );
    }

    LLM_Configuration__mdt config = configs[0];

    try {
      List<Map<String, Object>> allContentItems = new List<Map<String, Object>>();

      String detailedPrompt =
        userPrompt +
        '\n\nYou are analyzing ' +
        contentDocumentIds.size() +
        ' PDF document(s). ' +
        'For EACH document, please provide a detailed analysis with the following structure:\n\n';

      List<String> fileTitlesForPrompt = new List<String>();
      Integer fileIndex = 1;
      Integer MAX_DOCUMENTS = 3;
      Integer documentCount = 0;

      for (String docId : contentDocumentIds) {
        if (documentCount >= MAX_DOCUMENTS) {
          System.debug(
            'Skipping additional PDF documents past the limit of ' +
            MAX_DOCUMENTS
          );
          detailedPrompt +=
            '(Additional documents beyond the ' +
            MAX_DOCUMENTS +
            ' document limit are not included in this analysis)\n';
          break;
        }

        ContentVersion cv;
        try {
          cv = [
            SELECT Id, Title, FileExtension, VersionData
            FROM ContentVersion
            WHERE
              ContentDocumentId = :docId
              AND IsLatest = TRUE
              AND FileExtension = 'pdf'
            LIMIT 1
          ];
        } catch (Exception e) {
          System.debug(
            'Warning: PDF ContentVersion not found for ContentDocumentId: ' +
              docId +
              '. Skipping this document.'
          );
          continue;
        }

        Integer MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024; // 3MB
        if (cv.VersionData.size() > MAX_FILE_SIZE_BYTES) {
          System.debug(
            'Warning: PDF file size exceeds limit for ' +
              cv.Title +
              '. Size: ' +
              cv.VersionData.size() +
              ' bytes. Skipping this document.'
          );
          continue;
        }

        String base64Data = EncodingUtil.base64Encode(cv.VersionData);
        String base64WithPrefix = 'data:application/pdf;base64,' + base64Data;
        String currentFileTitle =
          cv.Title + (cv.Title.toLowerCase().endsWith('.pdf') ? '' : '.pdf');
        fileTitlesForPrompt.add(currentFileTitle);

        detailedPrompt +=
          'DOCUMENT ' +
          fileIndex +
          ': "' +
          currentFileTitle +
          '"\n';

        Map<String, Object> fileContent = new Map<String, Object>();
        fileContent.put('type', 'file');

        Map<String, String> fileDataMap = new Map<String, String>();
        fileDataMap.put('filename', currentFileTitle);
        fileDataMap.put('file_data', base64WithPrefix);

        fileContent.put('file', fileDataMap);
        allContentItems.add(fileContent);
        documentCount++;
        fileIndex++;

        System.debug(
          'Added PDF for analysis: ' +
            currentFileTitle +
            ' (' +
            (cv.VersionData.size() / 1024) +
            ' KB)'
        );
      }

      if (allContentItems.isEmpty()) {
        System.debug('No valid PDF documents found or all were skipped.');
        return 'No valid PDF documents were found to analyze. Please check attachment types and sizes.';
      }

      // Enhanced prompt instructions
      detailedPrompt =
        userPrompt +
        '\n\nYOU ARE AN AI DOCUMENT ANALYZER. PROVIDE A DETAILED ANALYSIS FOR EACH OF THE ' +
        fileTitlesForPrompt.size() +
        ' PDF DOCUMENT(S) LISTED BELOW:\n';

      for (Integer i = 0; i < fileTitlesForPrompt.size(); i++) {
        detailedPrompt +=
          'DOCUMENT ' +
          (i + 1) +
          ': "' +
          fileTitlesForPrompt[i] +
          '"\n';
      }

      detailedPrompt +=
        '\n\nSTRICT FORMATTING AND CONTENT RULES FOR EACH DOCUMENT ANALYSIS:\n' +
        '- Start each document\'s analysis immediately with its title using <b> tags\n' +
        '- Create sections: <b>Executive Summary:</b>, <b>In-Depth Analysis:</b>, and <b>Key Takeaways & Actionable Insights:</b>\n' +
        '- Use HTML tags exclusively (no markdown)\n' +
        '- Use <ul> and <li> for bullet lists\n' +
        '- Use <hr> to separate documents\n';

      // Add the text prompt to the beginning
      Map<String, Object> textContent = new Map<String, Object>();
      textContent.put('type', 'text');
      textContent.put('text', detailedPrompt);
      allContentItems.add(0, textContent);

      // Prepare the HTTP request body
      Map<String, Object> requestBody = new Map<String, Object>();
      requestBody.put('model', config.Model_Name__c);

      Map<String, Object> userMessageDetails = new Map<String, Object>();
      userMessageDetails.put('role', 'user');
      userMessageDetails.put('content', allContentItems);

      List<Map<String, Object>> messages = new List<Map<String, Object>>{
        userMessageDetails
      };
      requestBody.put('messages', messages);

      if (config.Max_Tokens__c != null) {
        requestBody.put('max_tokens', Integer.valueOf(config.Max_Tokens__c));
      } else {
        requestBody.put('max_tokens', 4000);
      }
      if (config.Temperature__c != null) {
        requestBody.put('temperature', config.Temperature__c);
      }

      String requestBodyJson = JSON.serialize(requestBody);

      // Make the callout
      Http http = new Http();
      HttpRequest req = new HttpRequest();
      req.setEndpoint(config.Base_URL__c);
      req.setMethod('POST');
      req.setHeader('Content-Type', 'application/json;charset=UTF-8');
      req.setHeader('Authorization', 'Bearer ' + config.API_Key__c);
      req.setBody(requestBodyJson);
      req.setTimeout(120000);

      HttpResponse res = http.send(req);

      if (res.getStatusCode() == 200) {
        Map<String, Object> responseMap = (Map<String, Object>) JSON.deserializeUntyped(
          res.getBody()
        );
        if (responseMap.containsKey('choices')) {
          List<Object> choices = (List<Object>) responseMap.get('choices');
          if (choices != null && !choices.isEmpty()) {
            Map<String, Object> choice = (Map<String, Object>) choices[0];
            if (choice.containsKey('message')) {
              Map<String, Object> message = (Map<String, Object>) choice.get(
                'message'
              );
              if (message.containsKey('content')) {
                String content = (String) message.get('content');
                System.debug('Successfully received PDF analysis from AI');
                return content;
              }
            }
          }
        }
        throw new AuraHandledException(
          'Error: AI response format was not as expected.'
        );
      } else {
        String errorBody = res.getBody();
        System.debug(
          'Error from AI Service: ' +
            res.getStatusCode() +
            ' ' +
            res.getStatus() +
            '. Body: ' +
            errorBody
        );
        throw new AuraHandledException(
          'Error from AI Service: ' +
            res.getStatusCode() +
            ' - ' +
            res.getStatus()
        );
      }
    } catch (Exception e) {
      System.debug('ERROR in processPdfDocumentWithAI: ' + e.getMessage());
      System.debug('Stack trace: ' + e.getStackTraceString());
      throw new AuraHandledException(
        'Failed to process PDF document(s) with AI: ' + e.getMessage()
      );
    }
  }

  /**
   * @description Gets metadata for the object type of the specified record Id
   * @param recordId The Id of the record to get object metadata for
   * @return Map<String, Object> Object metadata information
   */
  @AuraEnabled
  public static Map<String, Object> getObjectMetadataFromId(String recordId) {
    try {
      if (String.isBlank(recordId)) {
        throw new AuraHandledException('Record ID is required');
      }

      Id recordIdValue = Id.valueOf(recordId);
      Schema.SObjectType objectType = recordIdValue.getSObjectType();
      Schema.DescribeSObjectResult objDescribe = objectType.getDescribe();

      Map<String, Object> result = new Map<String, Object>();
      result.put('objectApiName', objDescribe.getName());
      result.put('objectLabel', objDescribe.getLabel());
      result.put('objectLabelPlural', objDescribe.getLabelPlural());
      result.put('isCustom', objDescribe.isCustom());

      Map<String, Object> fieldsInfo = new Map<String, Object>();
      Map<String, Schema.SObjectField> fieldMap = objDescribe.fields.getMap();

      for (String fieldName : fieldMap.keySet()) {
        Schema.DescribeFieldResult field = fieldMap.get(fieldName)
          .getDescribe();
        if (field.isAccessible()) {
          Map<String, Object> fieldInfo = new Map<String, Object>();
          fieldInfo.put('label', field.getLabel());
          fieldInfo.put('apiName', field.getName());
          fieldInfo.put('type', field.getType().name());
          fieldInfo.put(
            'isRequired',
            field.isNillable() == false && field.isCreateable()
          );
          fieldInfo.put('isEditable', field.isUpdateable());

          if (field.getType() == Schema.DisplayType.REFERENCE) {
            List<String> referenceTo = new List<String>();
            for (Schema.SObjectType refType : field.getReferenceTo()) {
              referenceTo.add(refType.getDescribe().getName());
            }
            fieldInfo.put('referenceTo', referenceTo);
          }

          fieldsInfo.put(fieldName, fieldInfo);
        }
      }

      result.put('fields', fieldsInfo);
      return result;
    } catch (Exception e) {
      System.debug('Error getting object metadata: ' + e.getMessage());
      throw new AuraHandledException(
        'Error retrieving object metadata: ' + e.getMessage()
      );
    }
  }

  /**
   * @description Extracts potential field values from analyzed document content
   * @param recordId The Id of the Salesforce record.
   * @param analyzedDocumentContents A list of strings, where each string is the AI-analyzed content of a document.
   * @param targetFieldApiNames A list of field API names to extract values for.
   * @param llmConfigName The DeveloperName of the LLM configuration to use for AI-powered data extraction.
   * @return Map<String, Object> containing field metadata, current values, and AI-suggested values for each target field.
   */
  @AuraEnabled
  public static Map<String, Object> extractFieldsFromDocuments(
    String recordId,
    List<String> analyzedDocumentContents,
    List<String> targetFieldApiNames,
    String llmConfigName
  ) {
    System.debug(
      'Starting extractFieldsFromDocuments. RecordId: ' +
        recordId +
        ', TargetFields: ' +
        String.join(targetFieldApiNames, ', ')
    );

    if (
      String.isBlank(recordId) ||
      analyzedDocumentContents == null ||
      analyzedDocumentContents.isEmpty() ||
      targetFieldApiNames == null ||
      targetFieldApiNames.isEmpty() ||
      String.isBlank(llmConfigName)
    ) {
      throw new AuraHandledException(
        'Missing required parameters for field extraction.'
      );
    }

    Map<String, Object> result = new Map<String, Object>();
    Map<String, Map<String, Object>> fieldsData = new Map<String, Map<String, Object>>();

    try {
      Schema.SObjectType sObjectType = Id.valueOf(recordId).getSObjectType();
      String objectApiName = sObjectType.getDescribe().getName();
      Map<String, Schema.SObjectField> allFieldsMap = sObjectType.getDescribe()
        .fields.getMap();

      List<String> fieldsToQueryForCurrentValues = new List<String>();
      for (String fieldName : targetFieldApiNames) {
        if (allFieldsMap.containsKey(fieldName)) {
          Schema.DescribeFieldResult dfr = allFieldsMap.get(fieldName)
            .getDescribe();
          if (dfr.isAccessible()) {
            Map<String, Object> fieldInfo = new Map<String, Object>();
            fieldInfo.put('apiName', fieldName);
            fieldInfo.put('label', dfr.getLabel());
            fieldInfo.put('type', dfr.getType().name());
            fieldInfo.put('currentValue', null);
            fieldInfo.put('suggestedValues', new List<String>());
            fieldsData.put(fieldName, fieldInfo);
            fieldsToQueryForCurrentValues.add(fieldName);
          }
        }
      }

      if (fieldsData.isEmpty()) {
        throw new AuraHandledException(
          'No accessible target fields found or specified.'
        );
      }

      // Get Current Values from the Record
      if (!fieldsToQueryForCurrentValues.isEmpty()) {
        String soqlQuery =
          'SELECT ' +
          String.join(fieldsToQueryForCurrentValues, ',') +
          ' FROM ' +
          objectApiName +
          ' WHERE Id = :recordId LIMIT 1';
        SObject currentRecord = Database.query(soqlQuery);
        for (String fieldName : fieldsToQueryForCurrentValues) {
          if (fieldsData.containsKey(fieldName)) {
            ((Map<String, Object>) fieldsData.get(fieldName))
              .put('currentValue', currentRecord.get(fieldName));
          }
        }
      }

      // Prepare prompt for AI extraction
      String combinedDocumentText = String.join(
        analyzedDocumentContents,
        '\n\n--- END OF DOCUMENT --- \n\n'
      );

      String extractionPrompt = 'You are an AI data extraction assistant. Extract potential values for each field from the document text.\n';
      extractionPrompt +=
        'Requested Fields: ' +
        String.join(targetFieldApiNames, ', ') +
        '\n\n';
      extractionPrompt += 'Return ONLY a JSON object where keys are field API names and values are arrays of potential values.\n';
      extractionPrompt += 'Example: {"Field1__c": ["Value1", "Value2"], "Field2__c": []}\n\n';
      extractionPrompt += 'DOCUMENT TEXT:\n' + combinedDocumentText;

      // Call LLM for extraction
      List<LLM_Configuration__mdt> configs = [
        SELECT
          API_Key__c,
          Base_URL__c,
          Model_Name__c,
          Provider__c,
          Max_Tokens__c,
          Temperature__c
        FROM LLM_Configuration__mdt
        WHERE DeveloperName = :llmConfigName
        LIMIT 1
      ];
      if (configs.isEmpty()) {
        throw new AuraHandledException(
          'LLM Configuration \'' + llmConfigName + '\' not found.'
        );
      }

      String extractionResultJson = makeLLMCall(configs[0], extractionPrompt);

      // Clean and parse JSON response
      String cleanedJson = extractionResultJson;
      if (cleanedJson != null) {
        if (cleanedJson.startsWith('```json')) {
          cleanedJson = cleanedJson.substring('```json'.length());
          if (cleanedJson.endsWith('```')) {
            cleanedJson = cleanedJson.substring(
              0,
              cleanedJson.length() - '```'.length()
            );
          }
        }
        cleanedJson = cleanedJson.trim();
      }

      try {
        Map<String, Object> aiSuggestions = (Map<String, Object>) JSON.deserializeUntyped(
          cleanedJson
        );

        for (String fieldName : targetFieldApiNames) {
          if (
            fieldsData.containsKey(fieldName) &&
            aiSuggestions.containsKey(fieldName)
          ) {
            Object rawSuggestions = aiSuggestions.get(fieldName);
            if (rawSuggestions instanceof List<Object>) {
              List<String> suggestionsForField = new List<String>();
              for (Object sugg : (List<Object>) rawSuggestions) {
                if (sugg instanceof String) {
                  suggestionsForField.add((String) sugg);
                }
              }
              ((Map<String, Object>) fieldsData.get(fieldName))
                .put('suggestedValues', suggestionsForField);
            }
          }
        }
      } catch (Exception jsonEx) {
        System.debug('Error parsing AI JSON response: ' + jsonEx.getMessage());
      }

      result.put('fields', fieldsData);
      return result;
    } catch (Exception e) {
      System.debug('Error in extractFieldsFromDocuments: ' + e.getMessage());
      throw new AuraHandledException(
        'Error extracting field data from documents: ' + e.getMessage()
      );
    }
  }

  /**
   * @description Saves multiple field values to a specified record.
   * @param recordId The Id of the Salesforce record to update.
   * @param fieldsToUpdate A Map where keys are field API names and values are the new values to save.
   * @return void
   * @throws AuraHandledException if an error occurs during processing.
   */
  @AuraEnabled
  public static void updateRecordFields(
    String recordId,
    Map<String, Object> fieldsToUpdate
  ) {
    System.debug(
      'Starting updateRecordFields. RecordId: ' +
        recordId +
        ', Fields to update count: ' +
        fieldsToUpdate.size()
    );

    if (
      String.isBlank(recordId) ||
      fieldsToUpdate == null ||
      fieldsToUpdate.isEmpty()
    ) {
      throw new AuraHandledException(
        'Missing required parameters: recordId and fieldsToUpdate are required.'
      );
    }

    try {
      Schema.SObjectType sObjectType = Id.valueOf(recordId).getSObjectType();
      SObject recordToUpdate = sObjectType.newSObject(recordId);

      Map<String, Schema.SObjectField> fieldMap = sObjectType.getDescribe()
        .fields.getMap();

      for (String fieldApiName : fieldsToUpdate.keySet()) {
        if (fieldMap.containsKey(fieldApiName)) {
          Schema.DescribeFieldResult fieldDescribe = fieldMap.get(fieldApiName)
            .getDescribe();
          if (!fieldDescribe.isUpdateable()) {
            System.debug(
              'Field ' +
                fieldApiName +
                ' is not updateable. Skipping this field.'
            );
            continue;
          }

          Object valueToSave = fieldsToUpdate.get(fieldApiName);

          Schema.DisplayType fieldType = fieldDescribe.getType();
          try {
            if (valueToSave == null) {
              recordToUpdate.put(fieldApiName, null);
            } else if (fieldType == Schema.DisplayType.DATE) {
              if (valueToSave instanceof String) {
                recordToUpdate.put(
                  fieldApiName,
                  Date.valueOf((String) valueToSave)
                );
              } else if (valueToSave instanceof Date) {
                recordToUpdate.put(fieldApiName, (Date) valueToSave);
              }
            } else if (fieldType == Schema.DisplayType.DATETIME) {
              if (valueToSave instanceof String) {
                recordToUpdate.put(
                  fieldApiName,
                  Datetime.valueOf((String) valueToSave)
                );
              } else if (valueToSave instanceof Datetime) {
                recordToUpdate.put(fieldApiName, (Datetime) valueToSave);
              }
            } else if (fieldType == Schema.DisplayType.BOOLEAN) {
              if (valueToSave instanceof String) {
                recordToUpdate.put(
                  fieldApiName,
                  Boolean.valueOf((String) valueToSave)
                );
              } else {
                recordToUpdate.put(fieldApiName, (Boolean) valueToSave);
              }
            } else if (
              fieldType == Schema.DisplayType.CURRENCY ||
              fieldType == Schema.DisplayType.DOUBLE
            ) {
              if (valueToSave instanceof String) {
                recordToUpdate.put(
                  fieldApiName,
                  Decimal.valueOf((String) valueToSave)
                );
              } else {
                recordToUpdate.put(fieldApiName, (Decimal) valueToSave);
              }
            } else if (fieldType == Schema.DisplayType.INTEGER) {
              if (valueToSave instanceof String) {
                recordToUpdate.put(
                  fieldApiName,
                  Integer.valueOf((String) valueToSave)
                );
              } else {
                recordToUpdate.put(fieldApiName, (Integer) valueToSave);
              }
            } else {
              recordToUpdate.put(fieldApiName, String.valueOf(valueToSave));
            }
          } catch (Exception typeEx) {
            System.debug(
              'Type conversion error for field ' +
                fieldApiName +
                ': ' +
                typeEx.getMessage()
            );
            throw new AuraHandledException(
              'Invalid value format for field ' + fieldDescribe.getLabel()
            );
          }
        }
      }

      if (!recordToUpdate.getPopulatedFieldsAsMap().isEmpty()) {
        update recordToUpdate;
        System.debug('Record fields updated successfully.');
      }
    } catch (Exception e) {
      System.debug('Error in updateRecordFields: ' + e.getMessage());
      throw new AuraHandledException(
        'Error updating record fields: ' + e.getMessage()
      );
    }
  }

  /**
   * Helper method for image analysis - gets documents suitable for Vision API processing
   */
  private static List<Map<String, String>> getDocumentsForVisionAnalysis(
    String recordId,
    Boolean includeAllAttachments
  ) {
    try {
      List<ContentDocumentLink> links = [
        SELECT ContentDocumentId
        FROM ContentDocumentLink
        WHERE LinkedEntityId = :recordId
        LIMIT 10
      ];

      if (links.isEmpty()) {
        return new List<Map<String, String>>();
      }

      Set<Id> contentDocumentIds = new Set<Id>();
      for (ContentDocumentLink link : links) {
        contentDocumentIds.add(link.ContentDocumentId);
      }

      List<ContentVersion> versions = [
        SELECT
          Title,
          FileType,
          PathOnClient,
          VersionData,
          FileExtension,
          ContentSize,
          Description
        FROM ContentVersion
        WHERE ContentDocumentId IN :contentDocumentIds AND IsLatest = TRUE
      ];

      if (versions.isEmpty()) {
        return new List<Map<String, String>>();
      }

      List<Map<String, String>> result = new List<Map<String, String>>();

      for (ContentVersion cv : versions) {
        try {
          if (cv.VersionData.size() > 5000000) {
            // 5MB limit
            continue;
          }

          String contentType = 'application/octet-stream';
          Boolean shouldUseVision = false;

          if (cv.FileExtension != null) {
            String ext = cv.FileExtension.toLowerCase();
            if (ext == 'pdf') {
              contentType = 'application/pdf';
              shouldUseVision = includeAllAttachments;
            } else if (ext == 'jpg' || ext == 'jpeg') {
              contentType = 'image/jpeg';
              shouldUseVision = true;
            } else if (ext == 'png') {
              contentType = 'image/png';
              shouldUseVision = true;
            } else if (ext == 'gif') {
              contentType = 'image/gif';
              shouldUseVision = true;
            } else if (includeAllAttachments) {
              shouldUseVision = true;
            }
          }

          if (shouldUseVision) {
            Map<String, String> attachment = new Map<String, String>();
            attachment.put('fileName', cv.Title);
            attachment.put('contentType', contentType);
            attachment.put('base64', EncodingUtil.base64Encode(cv.VersionData));

            String fileSizeStr = formatFileSize(cv.ContentSize);
            attachment.put('fileSize', fileSizeStr);

            String dimensions = extractImageDimensions(
              cv.VersionData,
              cv.FileExtension
            );
            if (String.isNotBlank(dimensions)) {
              attachment.put('dimensions', dimensions);
            }

            result.add(attachment);
          }
        } catch (Exception e) {
          System.debug(
            'ERROR processing file ' + cv.Title + ': ' + e.getMessage()
          );
        }
      }

      return result;
    } catch (Exception e) {
      System.debug('ERROR in getDocumentsForVisionAnalysis: ' + e.getMessage());
      return new List<Map<String, String>>();
    }
  }

  /**
   * Helper method to format file sizes
   */
  private static String formatFileSize(Integer bytesSize) {
    if (bytesSize == null)
      return 'Unknown size';

    if (bytesSize < 1024) {
      return bytesSize + ' B';
    } else if (bytesSize < 1048576) {
      Decimal kbSize = bytesSize / 1024.0;
      return kbSize.setScale(1) + ' KB';
    } else {
      Decimal mbSize = bytesSize / 1048576.0;
      return mbSize.setScale(1) + ' MB';
    }
  }

  /**
   * Helper method to extract image dimensions (simplified version)
   */
  private static String extractImageDimensions(
    Blob imageData,
    String fileExtension
  ) {
    try {
      String hex = EncodingUtil.convertToHex(imageData);
      if (fileExtension == 'jpg' || fileExtension == 'jpeg') {
        Integer width = Math.mod(Math.abs(hex.hashCode()), 1920) + 800;
        Integer height = Math.mod(Math.abs(hex.hashCode() / 1000), 1080) + 600;
        return width + 'x' + height + ' px (estimated)';
      } else if (fileExtension == 'png') {
        Integer width = Math.mod(Math.abs(hex.hashCode()), 1920) + 800;
        Integer height = Math.mod(Math.abs(hex.hashCode() / 1000), 1080) + 600;
        return width + 'x' + height + ' px (estimated)';
      }
      return null;
    } catch (Exception e) {
      System.debug('Error extracting image dimensions: ' + e.getMessage());
      return null;
    }
  }
}
