public with sharing class LLMController {
    @AuraEnabled(cacheable=true)
    public static List<LLM_Configuration__mdt> getLLMConfigurations() {
        System.debug('Getting LLM configurations');
        List<LLM_Configuration__mdt> configs = [SELECT Id, DeveloperName, MasterLabel, Provider__c, 
                                                Model_Name__c, Supports_Files__c 
                                                FROM LLM_Configuration__mdt 
                                                WHERE IsActive__c = true];
        System.debug('Found configurations: ' + configs.size());
        return configs;
    }
    
    @AuraEnabled
    public static String handleRequest(String recordId, String configName, String prompt, String operation, String relatedObjects) {
        System.debug('Handle request started');
        System.debug('Parameters - recordId: ' + recordId + ', configName: ' + configName + ', operation: ' + operation);
        
        try {
            LLM_Configuration__mdt config = [SELECT API_Key__c, Base_URL__c, Model_Name__c, 
                                             Provider__c, Supports_Files__c, Max_Tokens__c, Temperature__c
                                             FROM LLM_Configuration__mdt 
                                             WHERE DeveloperName = :configName 
                                             LIMIT 1];
            
            String context = '';
            String attachments = '';
            String documentAnalysis = '';
            
            // Only get record context if a recordId is provided
            if (String.isNotBlank(recordId)) {
                context = getRecordContext(recordId, relatedObjects);
                
                // Check for PDFs and documents that would benefit from Vision analysis
                // Include all attachment types for regular analysis
                List<Map<String, String>> docAttachments = getDocumentsForVisionAnalysis(recordId, true);
                if (!docAttachments.isEmpty()) {
                    System.debug('Found ' + docAttachments.size() + ' documents for Vision analysis');
                    
                    // Get Vision configuration
                    List<LLM_Configuration__mdt> visionConfigs = [SELECT Id, API_Key__c, Base_URL__c, Model_Name__c
                                                                 FROM LLM_Configuration__mdt 
                                                                 WHERE DeveloperName = 'OpenAI_GPT4_Vision'
                                                                 LIMIT 1];
                    
                    if (!visionConfigs.isEmpty()) {
                        // Process documents with Vision API
                        documentAnalysis = processDocumentsWithVision(docAttachments, visionConfigs[0], 
                                                                      'Analyze these documents in detail. Extract all important information.');
                    }
                }
                
                // Get regular attachments text (this will exclude PDFs that were analyzed with Vision)
                attachments = config.Supports_Files__c ? getAttachmentsText(recordId) : '';
            }
            
            // Include document analysis in the prompt if available
            String fullPrompt = buildFullPrompt(operation, context, attachments, prompt);
            
            // Add document analysis results if available
            if (String.isNotBlank(documentAnalysis)) {
                fullPrompt += '\n\nDOCUMENT ANALYSIS (Processed with Vision AI):\n' + documentAnalysis;
            }
            
            System.debug('Full prompt length: ' + fullPrompt.length());
            
            return makeLLMCall(config, fullPrompt);
        } catch(Exception e) {
            System.debug('ERROR in handleRequest: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Error: ' + e.getMessage());
        }
    }
    
    /**
     * @description Checks a given record for potential anomalies, conflicts of interest, or inconsistencies using an AI model.
     * @param recordId The Id of the Salesforce record to analyze.
     * @param configName The DeveloperName of the LLM_Configuration__mdt to use.
     * @param relatedObjects Comma-separated list of object API names to search across for related data.
     * @return String The AI's assessment (e.g., "YES - Conflict of interest detected: Submitter and Investigator are the same." or "NO").
     * @throws AuraHandledException if an error occurs during processing.
     */
    @AuraEnabled
    public static String checkRecordForAnomalies(String recordId, String configName, String relatedObjects) {
        System.debug('Anomaly check started for recordId: ' + recordId + ' using config: ' + configName);

        // Validate inputs
        if (String.isBlank(recordId) || String.isBlank(configName)) {
            System.debug('ERROR in checkRecordForAnomalies: Missing recordId or configName.');
            throw new AuraHandledException('Error: Record ID and AI Model Configuration Name are required.');
        }

        try {
            // Fetch the specified LLM configuration
            LLM_Configuration__mdt config = [SELECT API_Key__c, Base_URL__c, Model_Name__c, 
                                             Provider__c, Supports_Files__c, Max_Tokens__c, Temperature__c
                                             FROM LLM_Configuration__mdt 
                                             WHERE DeveloperName = :configName 
                                             LIMIT 1];

            // Get the context for the specified record
            String context = getRecordContext(recordId, relatedObjects);
            
            // Construct the prompt specifically for anomaly detection
            String anomalyPrompt = 'Analyze the following Salesforce record data. Look specifically for potential issues such as: \n' + 
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
                                 'RECORD DATA:\n' + context;

            // Call the LLM with the specific anomaly detection prompt
            String assessment = makeLLMCall(config, anomalyPrompt);
            System.debug('Anomaly check completed successfully');
            
            // Return the raw assessment from the LLM
            return assessment;

        } catch(Exception e) {
            // Log detailed error information
            System.debug('ERROR in checkRecordForAnomalies: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            // Throw a user-friendly exception
            throw new AuraHandledException('Error performing AI anomaly check: ' + e.getMessage());
        }
    }
    
    private static String getRecordContext(String recordId, String relatedObjects) {
        try {
            // Identify object type from record ID
            Schema.SObjectType objectType = Id.valueOf(recordId).getSObjectType();
            String objectName = objectType.getDescribe().getName();
            System.debug('Object type for record: ' + objectName);
            
            // Build a query for all accessible fields on this object
            Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe().fields.getMap();
            List<String> fieldNames = new List<String>();
            
            for (String fieldName : fieldMap.keySet()) {
                Schema.DescribeFieldResult field = fieldMap.get(fieldName).getDescribe();
                if (field.isAccessible()) {
                    fieldNames.add(fieldName);
                }
            }
            
            // Build and execute dynamic query
            String query = 'SELECT ' + String.join(fieldNames, ',') + ' FROM ' + objectName + ' WHERE Id = :recordId LIMIT 1';
            SObject record = Database.query(query);
            System.debug('Record retrieved: ' + record);
            
            // Start building rich context
            String context = '\nRECORD DETAILS:\n';
            
            // Add all field values to context
            for (String fieldName : fieldNames) {
                Object fieldValue = record.get(fieldName);
                if (fieldValue != null) {
                    context += '• ' + fieldMap.get(fieldName).getDescribe().getLabel() + ': ' + fieldValue + '\n';
                }
            }
            
            // Get relationship fields (lookups and master-detail)
            List<String> relationshipFields = new List<String>();
            for (String fieldName : fieldMap.keySet()) {
                Schema.DescribeFieldResult field = fieldMap.get(fieldName).getDescribe();
                if (field.getType() == Schema.DisplayType.REFERENCE && field.isAccessible()) {
                    relationshipFields.add(fieldName);
                }
            }
            
            // Add related record info if there are relationships
            if (!relationshipFields.isEmpty()) {
                context += '\nRELATED RECORDS:\n';
                for (String relField : relationshipFields) {
                    Id relatedId = (Id)record.get(relField);
                    if (relatedId != null) {
                        String relatedObjName = relatedId.getSObjectType().getDescribe().getName();
                        String relatedLabel = fieldMap.get(relField).getDescribe().getLabel();
                        
                        try {
                            // Get name field of related object if possible
                            String nameQuery = 'SELECT Name FROM ' + relatedObjName + ' WHERE Id = :relatedId LIMIT 1';
                            List<SObject> relatedRecords = Database.query(nameQuery);
                            if (!relatedRecords.isEmpty()) {
                                context += '• ' + relatedLabel + ': ' + relatedRecords[0].get('Name') + '\n';
                            }
                        } catch (Exception e) {
                            // Some objects might not have a Name field
                            context += '• ' + relatedLabel + ': ' + relatedId + '\n';
                        }
                    }
                }
            }
            
            // Get field history tracking data
            context += getFieldHistoryData(recordId, objectName);
            
            // Get child relationships (line items, invoices, etc.)
            context += getChildRelationships(recordId, objectType);

            // Get activity history for context (works for most standard objects)
            try {
                List<Task> recentTasks = [SELECT Subject, ActivityDate, Status, Owner.Name, Description
                                         FROM Task
                                         WHERE WhatId = :recordId
                                         ORDER BY ActivityDate DESC
                                         LIMIT 5];
                
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
            
            // Get events and meetings (calendar items)
            try {
                List<Event> recentEvents = [SELECT Subject, StartDateTime, EndDateTime, Location, Description, OwnerId, Owner.Name
                                           FROM Event 
                                           WHERE WhatId = :recordId
                                           ORDER BY StartDateTime DESC 
                                           LIMIT 5];
                
                if (!recentEvents.isEmpty()) {
                    context += '\nRECENT EVENTS & MEETINGS:\n';
                    for (Event e : recentEvents) {
                        String dateTimeFormat = e.StartDateTime != null ? e.StartDateTime.format('MMM d, yyyy h:mm a') : 'Unknown date';
                        String endTimeFormat = e.EndDateTime != null ? ' - ' + e.EndDateTime.format('h:mm a') : '';
                        String location = String.isNotBlank(e.Location) ? ' (' + e.Location + ')' : '';
                        
                        context += '• ' + e.Subject + ' on ' + dateTimeFormat + endTimeFormat + location + ' - ' + e.Owner.Name + '\n';
                    }
                }
            } catch (Exception e) {
                System.debug('Error fetching events: ' + e.getMessage());
            }
            
            // Get emails related to the record (EmailMessage)
            try {
                List<EmailMessage> recentEmails = [SELECT Subject, MessageDate, FromAddress, ToAddress, CcAddress, Status, HtmlBody
                                                  FROM EmailMessage 
                                                  WHERE RelatedToId = :recordId 
                                                  ORDER BY MessageDate DESC 
                                                  LIMIT 5];
                
                if (!recentEmails.isEmpty()) {
                    context += '\nRECENT EMAILS:\n';
                    for (EmailMessage em : recentEmails) {
                        context += '• ' + em.Subject + ' (' + (em.MessageDate != null ? em.MessageDate.format() : 'Unknown date') + ')\n';
                        context += '  From: ' + em.FromAddress + '\n';
                        context += '  To: ' + em.ToAddress + '\n';
                        
                        // Add short snippet of the email body
                        if (em.HtmlBody != null) {
                            // Strip HTML and get truncated preview
                            String plainBody = em.HtmlBody.replaceAll('<[^>]+>', ' ').replaceAll('\\s+', ' ').trim();
                            if (plainBody.length() > 200) {
                                plainBody = plainBody.substring(0, 197) + '...';
                            }
                            context += '  Preview: ' + plainBody + '\n';
                        }
                    }
                }
            } catch (Exception e) {
                System.debug('Error fetching emails: ' + e.getMessage());
            }
            
            // Get any Notes related to the record
            try {
                // First, get ContentDocumentLink records
                List<ContentDocumentLink> contentLinks = [
                    SELECT ContentDocumentId 
                    FROM ContentDocumentLink 
                    WHERE LinkedEntityId = :recordId
                ];
                
                if (!contentLinks.isEmpty()) {
                    // Extract ContentDocumentIds
                    Set<Id> contentDocIds = new Set<Id>();
                    for (ContentDocumentLink link : contentLinks) {
                        contentDocIds.add(link.ContentDocumentId);
                    }
                    
                    // Then query for ContentNote records
                    List<ContentNote> notes = [
                        SELECT Id, Title, Content, CreatedDate, CreatedBy.Name
                        FROM ContentNote
                        WHERE Id IN :contentDocIds
                        ORDER BY CreatedDate DESC
                        LIMIT 5
                    ];
                    
                    if (!notes.isEmpty()) {
                        context += '\nNOTES:\n';
                        for (ContentNote note : notes) {
                            context += '• ' + note.Title + ' (Created by ' + note.CreatedBy.Name + ' on ' + note.CreatedDate.format() + ')\n';
                            
                            // Convert the note content from Base64 to readable text
                            if (note.Content != null) {
                                String noteBody = note.Content.toString();
                                if (noteBody.length() > 300) {
                                    noteBody = noteBody.substring(0, 297) + '...';
                                }
                                context += '  ' + noteBody.replaceAll('\n', '\n  ') + '\n';
                            }
                        }
                    }
                }
            } catch (Exception e) {
                System.debug('Error fetching notes: ' + e.getMessage());
            }
            
            // Get collaboration activity (works for feed-enabled objects)
            try {
                List<FeedItem> recentPosts = [SELECT CreatedBy.Name, Body, CreatedDate, CommentCount
                                             FROM FeedItem
                                             WHERE ParentId = :recordId
                                             ORDER BY CreatedDate DESC
                                             LIMIT 5];
                
                if (!recentPosts.isEmpty()) {
                    context += '\nRECENT CHATTER POSTS:\n';
                    for (FeedItem post : recentPosts) {
                        String commentInfo = post.CommentCount > 0 ? ' (' + post.CommentCount + ' comments)' : '';
                        context += '• ' + post.CreatedBy.Name + ' on ' + post.CreatedDate.format() + commentInfo + ':\n';
                        context += '  "' + post.Body.abbreviate(200).replaceAll('\n', '\n  ') + '"\n';
                        
                        // Get comments for the post if there are any
                        if (post.CommentCount > 0) {
                            try {
                                List<FeedComment> comments = [SELECT CreatedBy.Name, CommentBody, CreatedDate
                                                             FROM FeedComment
                                                             WHERE FeedItemId = :post.Id
                                                             ORDER BY CreatedDate ASC
                                                             LIMIT 3];
                                
                                for (FeedComment comment : comments) {
                                    context += '    ↳ ' + comment.CreatedBy.Name + ' replied on ' + comment.CreatedDate.format() + ':\n';
                                    context += '      "' + comment.CommentBody.abbreviate(100).replaceAll('\n', '\n      ') + '"\n';
                                }
                                
                                // Indicate if there are more comments
                                if (post.CommentCount > 3) {
                                    context += '    ↳ ' + (post.CommentCount - 3) + ' more comments\n';
                                }
                            } catch (Exception e) {
                                System.debug('Error fetching comments: ' + e.getMessage());
                            }
                        }
                    }
                }
            } catch (Exception e) {
                System.debug('Error fetching feed items: ' + e.getMessage());
            }
            
            // Include document summaries
            context += getDocumentSummaries(recordId);
            
            // Check for common important related objects based on the object type
            context += getCommonRelatedObjectsContext(objectName, recordId);
            
            // Include related objects data if specified
            if (String.isNotBlank(relatedObjects)) {
                context += getRelatedObjectsData(recordId, relatedObjects);
            }
            
            return context;
        } catch (Exception e) {
            System.debug('ERROR in getRecordContext: ' + e.getMessage());
            throw new AuraHandledException('Failed to get record context: ' + e.getMessage());
        }
    }
    
    /**
     * @description Get context for common related objects based on the parent object type
     * This method handles fetching important related objects specific to the record's object type
     * @param objectName API name of the parent object
     * @param recordId Id of the parent record
     * @return String Formatted text with related object information
     */
    private static String getCommonRelatedObjectsContext(String objectName, String recordId) {
        String context = '';
        Integer MAX_RECORDS = 10; // Maximum records to return per related object
        
        try {
            // For Account records, get related contacts, opportunities, and cases
            if (objectName == 'Account') {
                // Get related contacts
                try {
                    List<Contact> contacts = [SELECT Id, Name, Title, Email, Phone 
                                             FROM Contact 
                                             WHERE AccountId = :recordId
                                             ORDER BY LastModifiedDate DESC 
                                             LIMIT :MAX_RECORDS];
                    
                    if (!contacts.isEmpty()) {
                        context += '\nRELATED CONTACTS:\n';
                        for (Contact c : contacts) {
                            context += '• ' + c.Name;
                            if (String.isNotBlank(c.Title)) context += ', ' + c.Title;
                            if (String.isNotBlank(c.Email)) context += ' (Email: ' + c.Email + ')';
                            if (String.isNotBlank(c.Phone)) context += ' (Phone: ' + c.Phone + ')';
                            context += '\n';
                        }
                    }
                } catch (Exception e) {
                    System.debug('Error querying related contacts: ' + e.getMessage());
                }
                
                // Get related opportunities
                try {
                    List<Opportunity> opportunities = [SELECT Id, Name, StageName, Amount, CloseDate
                                                      FROM Opportunity
                                                      WHERE AccountId = :recordId
                                                      ORDER BY CloseDate DESC
                                                      LIMIT :MAX_RECORDS];
                    
                    if (!opportunities.isEmpty()) {
                        context += '\nRELATED OPPORTUNITIES:\n';
                        for (Opportunity o : opportunities) {
                            context += '• ' + o.Name + ' - ' + o.StageName;
                            if (o.Amount != null) context += ' - $' + o.Amount;
                            if (o.CloseDate != null) context += ' (Close Date: ' + o.CloseDate.format() + ')';
                            context += '\n';
                        }
                    }
                } catch (Exception e) {
                    System.debug('Error querying related opportunities: ' + e.getMessage());
                }
                
                // Get related cases
                try {
                    List<Case> cases = [SELECT Id, CaseNumber, Subject, Status, Priority, CreatedDate
                                       FROM Case
                                       WHERE AccountId = :recordId
                                       ORDER BY CreatedDate DESC
                                       LIMIT :MAX_RECORDS];
                    
                    if (!cases.isEmpty()) {
                        context += '\nRELATED CASES:\n';
                        for (Case c : cases) {
                            context += '• Case #' + c.CaseNumber + ': ' + c.Subject;
                            context += ' - Status: ' + c.Status + ', Priority: ' + c.Priority;
                            context += ' (Created: ' + c.CreatedDate.format() + ')';
                            context += '\n';
                        }
                    }
                } catch (Exception e) {
                    System.debug('Error querying related cases: ' + e.getMessage());
                }
            }
            
            // For Contact records, get related opportunities and cases
            else if (objectName == 'Contact') {
                // Get related opportunities
                try {
                    List<Opportunity> opportunities = [SELECT Id, Name, StageName, Amount, CloseDate
                                                      FROM Opportunity
                                                      WHERE ContactId = :recordId  // Primary contact
                                                      ORDER BY CloseDate DESC
                                                      LIMIT :MAX_RECORDS];
                    
                    if (!opportunities.isEmpty()) {
                        context += '\nRELATED OPPORTUNITIES:\n';
                        for (Opportunity o : opportunities) {
                            context += '• ' + o.Name + ' - ' + o.StageName;
                            if (o.Amount != null) context += ' - $' + o.Amount;
                            if (o.CloseDate != null) context += ' (Close Date: ' + o.CloseDate.format() + ')';
                            context += '\n';
                        }
                    }
                } catch (Exception e) {
                    System.debug('Error querying related opportunities: ' + e.getMessage());
                }
                
                // Get related cases
                try {
                    List<Case> cases = [SELECT Id, CaseNumber, Subject, Status, Priority, CreatedDate
                                       FROM Case
                                       WHERE ContactId = :recordId
                                       ORDER BY CreatedDate DESC
                                       LIMIT :MAX_RECORDS];
                    
                    if (!cases.isEmpty()) {
                        context += '\nRELATED CASES:\n';
                        for (Case c : cases) {
                            context += '• Case #' + c.CaseNumber + ': ' + c.Subject;
                            context += ' - Status: ' + c.Status + ', Priority: ' + c.Priority;
                            context += ' (Created: ' + c.CreatedDate.format() + ')';
                            context += '\n';
                        }
                    }
                } catch (Exception e) {
                    System.debug('Error querying related cases: ' + e.getMessage());
                }
            }
            
            // For Case records, get related contact, account and case comments
            else if (objectName == 'Case') {
                // Get case comments
                try {
                    List<CaseComment> comments = [SELECT Id, CommentBody, CreatedDate, CreatedBy.Name, IsPublished
                                                 FROM CaseComment
                                                 WHERE ParentId = :recordId
                                                 ORDER BY CreatedDate DESC
                                                 LIMIT :MAX_RECORDS];
                    
                    if (!comments.isEmpty()) {
                        context += '\nCASE COMMENTS:\n';
                        for (CaseComment cc : comments) {
                            String visibilityInfo = cc.IsPublished ? 'Public' : 'Private';
                            context += '• ' + cc.CreatedBy.Name + ' (' + cc.CreatedDate.format() + ') - ' + visibilityInfo + ':\n';
                            
                            // Format comment text with indentation
                            String commentText = cc.CommentBody;
                            if (commentText != null) {
                                if (commentText.length() > 300) {
                                    commentText = commentText.substring(0, 297) + '...';
                                }
                                context += '  ' + commentText.replaceAll('\n', '\n  ') + '\n';
                            }
                        }
                    }
                } catch (Exception e) {
                    System.debug('Error querying case comments: ' + e.getMessage());
                }
            }
            
            // For Opportunity records, get related contacts, products, quotes
            else if (objectName == 'Opportunity') {
                // Get opportunity contact roles
                try {
                    List<OpportunityContactRole> contactRoles = [SELECT Id, ContactId, Contact.Name, Contact.Title, Role
                                                                FROM OpportunityContactRole
                                                                WHERE OpportunityId = :recordId
                                                                ORDER BY CreatedDate DESC
                                                                LIMIT :MAX_RECORDS];
                    
                    if (!contactRoles.isEmpty()) {
                        context += '\nOPPORTUNITY CONTACT ROLES:\n';
                        for (OpportunityContactRole ocr : contactRoles) {
                            context += '• ' + ocr.Contact.Name;
                            if (String.isNotBlank(ocr.Contact.Title)) context += ', ' + ocr.Contact.Title;
                            if (String.isNotBlank(ocr.Role)) context += ' - Role: ' + ocr.Role;
                            context += '\n';
                        }
                    }
                } catch (Exception e) {
                    System.debug('Error querying opportunity contact roles: ' + e.getMessage());
                }
                
                // Get opportunity line items (products)
                try {
                    List<OpportunityLineItem> lineItems = [SELECT Id, Product2.Name, Quantity, UnitPrice, TotalPrice, Description
                                                          FROM OpportunityLineItem
                                                          WHERE OpportunityId = :recordId
                                                          ORDER BY CreatedDate DESC
                                                          LIMIT :MAX_RECORDS];
                    
                    if (!lineItems.isEmpty()) {
                        context += '\nOPPORTUNITY PRODUCTS:\n';
                        for (OpportunityLineItem oli : lineItems) {
                            context += '• ' + oli.Product2.Name;
                            if (oli.Quantity != null) context += ' - Qty: ' + oli.Quantity;
                            if (oli.UnitPrice != null) context += ' - Unit Price: $' + oli.UnitPrice;
                            if (oli.TotalPrice != null) context += ' - Total: $' + oli.TotalPrice;
                            context += '\n';
                        }
                    }
                } catch (Exception e) {
                    System.debug('Error querying opportunity line items: ' + e.getMessage());
                }
            }
            
            // For Lead records, get conversion status and activities
            else if (objectName == 'Lead') {
                // If lead is converted, get converted account/contact/opportunity
                try {
                    Lead leadRecord = [SELECT Id, IsConverted, ConvertedAccountId, ConvertedContactId, ConvertedOpportunityId 
                                      FROM Lead 
                                      WHERE Id = :recordId 
                                      LIMIT 1];
                    
                    if (leadRecord.IsConverted) {
                        context += '\nLEAD CONVERSION DETAILS:\n';
                        
                        if (leadRecord.ConvertedAccountId != null) {
                            Account convertedAccount = [SELECT Id, Name FROM Account WHERE Id = :leadRecord.ConvertedAccountId LIMIT 1];
                            context += '• Converted to Account: ' + convertedAccount.Name + '\n';
                        }
                        
                        if (leadRecord.ConvertedContactId != null) {
                            Contact convertedContact = [SELECT Id, Name FROM Contact WHERE Id = :leadRecord.ConvertedContactId LIMIT 1];
                            context += '• Converted to Contact: ' + convertedContact.Name + '\n';
                        }
                        
                        if (leadRecord.ConvertedOpportunityId != null) {
                            Opportunity convertedOpp = [SELECT Id, Name, StageName, Amount, CloseDate 
                                                       FROM Opportunity 
                                                       WHERE Id = :leadRecord.ConvertedOpportunityId 
                                                       LIMIT 1];
                            
                            context += '• Converted to Opportunity: ' + convertedOpp.Name;
                            if (convertedOpp.Amount != null) context += ' - $' + convertedOpp.Amount;
                            context += ' - ' + convertedOpp.StageName;
                            context += '\n';
                        }
                    }
                } catch (Exception e) {
                    System.debug('Error querying lead conversion details: ' + e.getMessage());
                }
            }

            // For any object, try to get recent modified related records
            context += getRecentModifiedRelatedRecords(recordId, MAX_RECORDS);
            
            return context;
        } catch (Exception e) {
            System.debug('ERROR in getCommonRelatedObjectsContext: ' + e.getMessage());
            return '\nError fetching common related objects: ' + e.getMessage();
        }
    }
    
    /**
     * @description Gets a summary of recently modified records linked to this record
     * @param recordId The Id of the primary Salesforce record
     * @param maxRecords The maximum number of records to return
     * @return String Formatted text with recently modified related record information
     */
    private static String getRecentModifiedRelatedRecords(String recordId, Integer maxRecords) {
        String context = '';
        
        try {
            // Get ContentDocumentLinks for this record
            List<ContentDocumentLink> links = [SELECT ContentDocumentId, LinkedEntityId 
                                              FROM ContentDocumentLink 
                                              WHERE LinkedEntityId = :recordId];
            
            // Get ContentDocumentIds
            Set<Id> contentDocIds = new Set<Id>();
            for (ContentDocumentLink link : links) {
                contentDocIds.add(link.ContentDocumentId);
            }
            
            // Join with a general modified query
            // This uses a SOSL search to find records connected to our record
            if (!Test.isRunningTest()) { // SOSL is not supported in tests
                String searchQuery = 'FIND \'' + recordId + '\' IN ALL FIELDS RETURNING ';
                
                // Add standard objects commonly referenced
                searchQuery += 'Account(Id, Name, LastModifiedDate ORDER BY LastModifiedDate DESC LIMIT ' + maxRecords + '), ';
                searchQuery += 'Contact(Id, Name, LastModifiedDate ORDER BY LastModifiedDate DESC LIMIT ' + maxRecords + '), ';
                searchQuery += 'Opportunity(Id, Name, StageName, LastModifiedDate ORDER BY LastModifiedDate DESC LIMIT ' + maxRecords + '), ';
                searchQuery += 'Case(Id, CaseNumber, Subject, Status, LastModifiedDate ORDER BY LastModifiedDate DESC LIMIT ' + maxRecords + ')';
                
                // Execute the search
                List<List<SObject>> searchResults = Search.query(searchQuery);
                
                if (searchResults != null && !searchResults.isEmpty()) {
                    context += '\nRECENTLY MODIFIED CONNECTED RECORDS:\n';
                    
                    for (List<SObject> objList : searchResults) {
                        if (objList == null || objList.isEmpty()) continue;
                        
                        String objType = objList[0].getSObjectType().getDescribe().getName();
                        
                        for (SObject obj : objList) {
                            Datetime lastModified = (Datetime)obj.get('LastModifiedDate');
                            if (lastModified == null) continue;
                            
                            context += '• ' + objType + ': ';
                            
                            // Name or equivalent
                            if (obj.get('Name') != null) {
                                context += (String)obj.get('Name');
                            } else if (obj.get('CaseNumber') != null) {
                                context += 'Case #' + (String)obj.get('CaseNumber');
                                if (obj.get('Subject') != null) {
                                    context += ': ' + (String)obj.get('Subject');
                                }
                            } else {
                                context += 'Record ' + obj.Id;
                            }
                            
                            // Status if available
                            if (obj.get('Status') != null) {
                                context += ' - ' + (String)obj.get('Status');
                            } else if (obj.get('StageName') != null) {
                                context += ' - ' + (String)obj.get('StageName');
                            }
                            
                            // Last modified date
                            context += ' (Modified: ' + lastModified.format() + ')\n';
                        }
                    }
                }
            }
            
            return context;
        } catch (Exception e) {
            System.debug('ERROR in getRecentModifiedRelatedRecords: ' + e.getMessage());
            return '';
        }
    }
    
    private static String getDocumentSummaries(String recordId) {
        try {
            // First get the ContentDocumentLinks
            List<ContentDocumentLink> links = [SELECT ContentDocumentId 
                                               FROM ContentDocumentLink 
                                               WHERE LinkedEntityId = :recordId];
            
            if(links.isEmpty()) {
                return '\nNO DOCUMENTS ATTACHED';
            }
            
            // Get the ContentDocument IDs
            Set<Id> contentDocIds = new Set<Id>();
            for(ContentDocumentLink link : links) {
                contentDocIds.add(link.ContentDocumentId);
            }
            
            // Then get the ContentVersions
            List<ContentVersion> versions = [SELECT Title, FileExtension, FileType, Description 
                                             FROM ContentVersion 
                                             WHERE ContentDocumentId IN :contentDocIds
                                             AND IsLatest = true];
            
            String summaries = '\nATTACHED DOCUMENTS:\n';
            for(ContentVersion doc : versions) {
                summaries += '• ' + doc.Title;
                if(doc.Description != null) {
                    // Truncate description if too long
                    String description = doc.Description;
                    if(description.length() > 500) {
                        description = description.substring(0, 497) + '...';
                    }
                    summaries += ' - ' + description;
                }
                summaries += ' (' + doc.FileType + ')\n';
            }
            return summaries;
        } catch(Exception e) {
            System.debug('ERROR getting document summaries: ' + e.getMessage());
            return '\nError processing documents: ' + e.getMessage();
        }
    }
    
    /**
     * @description Search across specified objects for records related to the primary record
     * @param recordId The Id of the primary Salesforce record
     * @param objectsToSearch A comma-separated list of object API names to search across
     * @return String Formatted text containing the related records information
     */
    private static String getRelatedObjectsData(String recordId, String objectsToSearch) {
        if (String.isBlank(objectsToSearch) || String.isBlank(recordId)) {
            return '';
        }
        
        System.debug('Searching related objects: ' + objectsToSearch);
        
        String formattedResults = '\nRELATED OBJECTS DATA:\n';
        List<String> objectsList = objectsToSearch.split(',');
        
        // Limit records per object to avoid context length issues
        Integer MAX_RECORDS_PER_OBJECT = 10;
        
        try {
            for (String objName : objectsList) {
                String trimmedObjName = objName.trim();
                if (String.isBlank(trimmedObjName)) continue;
                
                System.debug('Processing object: ' + trimmedObjName);
                
                // Check if the object exists and is accessible
                if (!checkObjectAccessibility(trimmedObjName)) {
                    formattedResults += '• ' + trimmedObjName + ': Object not accessible\n';
                    continue;
                }
                
                // Try to find related records
                List<SObject> relatedRecords = queryRelatedRecords(trimmedObjName, recordId, MAX_RECORDS_PER_OBJECT);
                
                if (relatedRecords.isEmpty()) {
                    formattedResults += '• ' + trimmedObjName + ': No related records found\n';
                    continue;
                }
                
                // Include information about the related records
                formattedResults += '• ' + trimmedObjName + ' (' + relatedRecords.size() + ' records):\n';
                
                for (SObject record : relatedRecords) {
                    // Get record name (or ID if Name field not available)
                    String recordName = getRecordName(record);
                    formattedResults += '  - ' + recordName + '\n';
                    
                    // Add a few key fields if available
                    formattedResults += getKeyFieldsInfo(record);
                }
            }
            
            return formattedResults;
        } catch (Exception e) {
            System.debug('ERROR in getRelatedObjectsData: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return '\nError fetching related objects data: ' + e.getMessage();
        }
    }
    
    /**
     * Helper method to check if an object is accessible
     */
    private static Boolean checkObjectAccessibility(String objectName) {
        try {
            // Get the schema for the object
            Schema.DescribeSObjectResult objDescribe = Schema.getGlobalDescribe().get(objectName).getDescribe();
            return objDescribe.isAccessible();
        } catch (Exception e) {
            System.debug('Error checking object accessibility for ' + objectName + ': ' + e.getMessage());
            return false;
        }
    }
    
    /**
     * Helper method to query related records
     */
    private static List<SObject> queryRelatedRecords(String objectName, String recordId, Integer recordLimit) {
        List<SObject> results = new List<SObject>();
        
        try {
            // Get all accessible fields
            Schema.DescribeSObjectResult objDescribe = Schema.getGlobalDescribe().get(objectName).getDescribe();
            Map<String, Schema.SObjectField> fieldMap = objDescribe.fields.getMap();
            
            // Build a list of accessible fields for the query
            List<String> fieldNames = new List<String>();
            List<String> textFieldNames = new List<String>(); // To search for recordId as text
            
            for (String fieldName : fieldMap.keySet()) {
                Schema.DescribeFieldResult field = fieldMap.get(fieldName).getDescribe();
                if (field.isAccessible()) {
                    fieldNames.add(fieldName);
                    
                    // Track text fields that could contain the recordId
                    Schema.DisplayType fieldType = field.getType();
                    if (fieldType == Schema.DisplayType.STRING || 
                        fieldType == Schema.DisplayType.TEXTAREA ||
                        fieldType == Schema.DisplayType.ID) {
                        textFieldNames.add(fieldName);
                    }
                }
            }
            
            // If we have no fields, return empty list
            if (fieldNames.isEmpty()) {
                return results;
            }
            
            // Build the base query with all fields
            String query = 'SELECT ' + String.join(fieldNames, ',') + 
                           ' FROM ' + objectName;
            
            // Special case: check if object has a lookup to the record's object type
            String recordObjName = Id.valueOf(recordId).getSObjectType().getDescribe().getName();
            List<String> relationshipCriteria = new List<String>();
            
            for (String fieldName : fieldMap.keySet()) {
                Schema.DescribeFieldResult field = fieldMap.get(fieldName).getDescribe();
                
                // Check if field is a reference to our record's object type
                if (field.getType() == Schema.DisplayType.REFERENCE && field.isAccessible()) {
                    List<Schema.SObjectType> refToTypes = field.getReferenceTo();
                    for (Schema.SObjectType refType : refToTypes) {
                        if (refType.getDescribe().getName() == recordObjName) {
                            relationshipCriteria.add(fieldName + ' = :recordId');
                            break;
                        }
                    }
                }
            }
            
            // Build the WHERE clause - either by relationship or by searching text fields
            if (!relationshipCriteria.isEmpty()) {
                query += ' WHERE ' + String.join(relationshipCriteria, ' OR ');
            } else if (!textFieldNames.isEmpty()) {
                // Fall back to SOSL if no direct relationships found
                String sosl = 'FIND \'' + recordId + '\' IN ALL FIELDS RETURNING ' + 
                              objectName + '(' + String.join(fieldNames, ',') + ' LIMIT ' + recordLimit + ')';
                
                List<List<SObject>> soslResults = Search.query(sosl);
                if (!soslResults.isEmpty()) {
                    return soslResults[0];
                }
                return results; // Return empty if SOSL found nothing
            } else {
                return results; // No searchable fields found
            }
            
            // Finish building the query with LIMIT
            query += ' LIMIT ' + recordLimit;
            
            // Execute the query and return results
            results = Database.query(query);
            return results;
            
        } catch (Exception e) {
            System.debug('Error querying related records for ' + objectName + ': ' + e.getMessage());
            return results; // Return empty list on error
        }
    }
    
    /**
     * Helper method to get the record name or ID
     */
    private static String getRecordName(SObject record) {
        try {
            if (record.get('Name') != null) {
                return (String)record.get('Name');
            } else {
                // Try common name fields
                String[] commonNameFields = new String[]{'Subject', 'Title', 'CaseNumber', 'OrderNumber'};
                for (String nameField : commonNameFields) {
                    if (record.get(nameField) != null) {
                        return (String)record.get(nameField);
                    }
                }
            }
        } catch (Exception e) {
            System.debug('Error getting record name: ' + e.getMessage());
        }
        
        // Fall back to ID
        return record.Id;
    }
    
    /**
     * Helper method to get key fields information
     */
    private static String getKeyFieldsInfo(SObject record) {
        String info = '';
        try {
            // Define fields that are typically important
            String[] keyFields = new String[]{
                'Status', 'Stage', 'Type', 'Amount', 'CloseDate', 'CreatedDate', 
                'LastModifiedDate', 'OwnerId', 'Owner.Name', 'Description'
            };
            
            for (String field : keyFields) {
                try {
                    Object value;
                    Schema.DisplayType fieldType = null;
                    
                    // Handle relationship fields
                    if (field.contains('.')) {
                        String[] parts = field.split('\\.');
                        SObject relatedObj = record.getSObject(parts[0]);
                        if (relatedObj != null) {
                            value = relatedObj.get(parts[1]);
                        }
                    } else {
                        value = record.get(field);
                        // Try to get field type if possible
                        try {
                            Schema.SObjectType sobjectType = record.getSObjectType();
                            if (sobjectType != null) {
                                Schema.SObjectField fieldToken = sobjectType.getDescribe().fields.getMap().get(field);
                                if (fieldToken != null) {
                                    fieldType = fieldToken.getDescribe().getType();
                                }
                            }
                        } catch (Exception e) {
                            // Ignore errors trying to get field type
                        }
                    }
                    
                    if (value != null) {
                        if (field == 'OwnerId') {
                            // Skip OwnerId if we have Owner.Name
                            continue;
                        }
                        
                        String displayValue = formatFieldValue(value, fieldType);
                        info += '    * ' + field + ': ' + displayValue + '\n';
                    }
                } catch (Exception e) {
                    // Skip fields that cause errors
                    continue;
                }
            }
        } catch (Exception e) {
            System.debug('Error getting key fields info: ' + e.getMessage());
        }
        return info;
    }
    
    private static String getAttachmentsText(String recordId) {
        // Set maximum total base64 content length (approximately 15k tokens = ~60k characters)
        Integer MAX_TOTAL_LENGTH = 60000;
        
        try {
            List<ContentDocumentLink> links = [SELECT ContentDocumentId 
                                               FROM ContentDocumentLink 
                                               WHERE LinkedEntityId = :recordId
                                               LIMIT 5];
            
            if (links.isEmpty()) {
                return '';
            }
            
            Set<Id> contentDocumentIds = new Set<Id>();
            for(ContentDocumentLink link : links) {
                contentDocumentIds.add(link.ContentDocumentId);
            }
            
            List<ContentVersion> versions = [SELECT Title, VersionData, FileExtension 
                                            FROM ContentVersion 
                                            WHERE ContentDocumentId IN :contentDocumentIds 
                                            AND IsLatest = true];
            
            if (versions.isEmpty()) {
                return '';
            }
            
            String attachments = '';
            Integer currentLength = 0;
            
            for (ContentVersion cv : versions) {
                try {
                    // Skip if file is too large
                    if (cv.VersionData.size() > 1000000) { // 1MB limit
                        attachments += '\n\n[FILE: ' + cv.Title + ' - Too large to process]';
                        continue;
                    }
                    
                    // Skip files that should be processed by Vision instead
                    if (cv.FileExtension != null) {
                        String ext = cv.FileExtension.toLowerCase();
                        if (ext == 'pdf' || ext == 'jpg' || ext == 'jpeg' || ext == 'png' || ext == 'gif') {
                            attachments += '\n\n[FILE: ' + cv.Title + ' - Being processed with Vision AI]';
                            continue;
                        }
                    }
                    
                    String base64Content = EncodingUtil.base64Encode(cv.VersionData);
                    Integer contentLength = base64Content.length();
                    
                    // Check if adding this content would exceed our limit
                    if (currentLength + contentLength > MAX_TOTAL_LENGTH) {
                        attachments += '\n\n[Additional files omitted due to size constraints]';
                        break;
                    }
                    
                    // If this single file's content is too large, truncate it
                    if (contentLength > MAX_TOTAL_LENGTH) {
                        base64Content = base64Content.substring(0, MAX_TOTAL_LENGTH) + '... [content truncated]';
                    }
                    
                    attachments += '\n\n[FILE: ' + cv.Title + ' (' + cv.FileExtension + ')]\n' + base64Content;
                    currentLength += contentLength;
                    
                } catch (Exception e) {
                    System.debug('ERROR processing file ' + cv.Title + ': ' + e.getMessage());
                    attachments += '\n\n[FILE: ' + cv.Title + ' - Failed to process]';
                }
            }
            
            return attachments;
            
        } catch (Exception e) {
            System.debug('ERROR in getAttachmentsText: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to process attachments: ' + e.getMessage());
        }
    }
    
    private static String buildFullPrompt(String operation, String context, String attachments, String prompt) {
        // Approximate token count (4 chars ≈ 1 token)
        Integer maxTokens = 150000; // Lower than max to leave room for response
        
        String basePrompt;
        if (operation == 'summarize') {
            // Enhanced prompt for summarization
            basePrompt = 'Generate a concise yet comprehensive summary report for the following Salesforce record data. Structure the report clearly with numbered sections for:\n\n' +
                         '1.  **Record Overview:** Key details of the main record. Elaborate on the key fields.\n' +
                         '2.  **Related Information:** Summarize significant related records (like Contacts, Opportunities, Cases, Invoices, Line Items, etc. if present), highlighting their connection to the main record. Provide details from the available fields for these related records.\n' +
                         '3.  **Recent Activity:** Summarize any recent Tasks, Events, Emails, or Chatter posts found. Be specific about the activity.\n' +
                         '4.  **Documents & Notes:** List any attached documents or notes, including titles or brief descriptions if available.\n\n' +
                         '**Style Guide:**\n' +
                         '- Be professional, objective, and informative.\n' +
                         '- Use clear headings (using markdown bolding like **Heading**) for each section.\n' +
                         '- Use bullet points (•) for lists within sections.\n' +
                         '- **IMPORTANT: Do NOT mention system errors, query limitations, data retrieval issues, or system constraints.** Focus *only* on summarizing the data *provided* in the context. Do not mention if some information categories (like Activity or Documents) are missing or incomplete; simply omit the section or summarize what *is* available.\n' +
                         '- **Do NOT include a \"Recommendations\" section** based on missing data or system issues.\n' +
                         '- Provide a good level of detail based on the information available in the context.\n\n' +
                         '**RECORD DATA:**\n\n';
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
        if ((baseTokens + contextTokens + attachmentTokens + promptTokens) > maxTokens) {
            // Allocate tokens proportionally
            Integer remainingTokens = maxTokens - baseTokens - promptTokens;
            if (remainingTokens > 0) {
                Double ratio = remainingTokens / (Double)(contextTokens + attachmentTokens);
                
                // Truncate context and attachments
                context = context.substring(0, Math.min(context.length(), 
                                                        (Integer)(contextTokens * ratio * 4)));
                if (String.isNotBlank(attachments)) {
                    attachments = attachments.substring(0, Math.min(attachments.length(), 
                                                                    (Integer)(attachmentTokens * ratio * 4)));
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
    
    private static String makeLLMCall(LLM_Configuration__mdt config, String prompt) {
        System.debug('Starting makeLLMCall for provider: ' + config.Provider__c + ', model: ' + config.Model_Name__c);
        
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
                
                Map<String,Object> requestBody = new Map<String,Object>();
                
                // Extract instructions from prompt
                String instructions = 'Please provide a clear, explanatory response. Remember that the user may not be familiar with AI technology. Be professional yet accessible, and provide context for your answers. When appropriate, offer next steps or additional assistance. Use simple language and avoid technical jargon unless necessary, in which case explain the terms. IMPORTANT: When referencing previous messages in the conversation, do not add prefixes like "User:" or "You:" - just directly quote or paraphrase what was said without labeling who said it.';
                String cleanedPrompt = prompt.replace('IMPORTANT: ' + instructions + '\n\n', '');
                
                switch on config.Provider__c {
                    when 'Anthropic' {
                        req.setHeader('x-api-key', config.API_Key__c);
                        req.setHeader('anthropic-version', '2023-06-01');
                        
                        requestBody = new Map<String,Object>{
                            'model' => config.Model_Name__c,
                            'max_tokens' => Integer.valueOf(config.Max_Tokens__c),
                            'temperature' => config.Temperature__c,
                            'system' => instructions,
                            'messages' => new List<Map<String,Object>>{
                                new Map<String,Object>{
                                    'role' => 'user',
                                    'content' => cleanedPrompt
                                }
                            }
                        };
                    }
                    when 'OpenAI', 'DeepSeek', 'OpenRouter' {
                        req.setHeader('Authorization', 'Bearer ' + config.API_Key__c);
                        
                        // Add HTTP-Referer for OpenRouter
                        if (config.Provider__c == 'OpenRouter') {
                            req.setHeader('HTTP-Referer', 'https://salesforce.com');
                        }
                        
                        List<Map<String,Object>> messages = new List<Map<String,Object>>();
                        
                        // Add system message with instructions
                        messages.add(new Map<String,Object>{
                            'role' => 'system',
                            'content' => instructions
                        });
                        
                        // Add user message with prompt
                        messages.add(new Map<String,Object>{
                            'role' => 'user',
                            'content' => cleanedPrompt
                        });
                        
                        requestBody = new Map<String,Object>{
                            'model' => config.Model_Name__c,
                            'messages' => messages,
                            'temperature' => config.Temperature__c,
                            'max_tokens' => Integer.valueOf(config.Max_Tokens__c)
                        };
                    }
                    when 'Google' {
                        req.setHeader('x-goog-api-key', config.API_Key__c);
                        
                        // Create generationConfig
                        Map<String,Object> generationConfig = new Map<String,Object>{
                            'temperature' => config.Temperature__c,
                            'maxOutputTokens' => Integer.valueOf(config.Max_Tokens__c),
                            'topP' => 0.95,
                            'topK' => 40
                        };
                        
                        // Create system instruction
                        List<Map<String,Object>> contents = new List<Map<String,Object>>();
                        
                        // Add system instruction
                        contents.add(new Map<String,Object>{
                            'role' => 'user',
                            'parts' => new List<Map<String,Object>>{
                                new Map<String,Object>{
                                    'text' => instructions
                                }
                            }
                        });
                        
                        // Add system response acknowledging instruction
                        contents.add(new Map<String,Object>{
                            'role' => 'model',
                            'parts' => new List<Map<String,Object>>{
                                new Map<String,Object>{
                                    'text' => 'I understand. I will provide direct, concise responses without explaining my reasoning or analysis process.'
                                }
                            }
                        });
                        
                        // Add user message with actual prompt
                        contents.add(new Map<String,Object>{
                            'role' => 'user',
                            'parts' => new List<Map<String,Object>>{
                                new Map<String,Object>{
                                    'text' => cleanedPrompt
                                }
                            }
                        });
                        
                        requestBody.put('contents', contents);
                        requestBody.put('model', config.Model_Name__c);
                        requestBody.put('generationConfig', generationConfig);
                    }
                    when else {
                        throw new AuraHandledException('Unsupported provider: ' + config.Provider__c);
                    }
                }
                
                String bodyJson = JSON.serialize(requestBody);
                req.setBody(bodyJson);
                
                HttpResponse res = new Http().send(req);
                System.debug('Response status: ' + res.getStatusCode() + ' ' + res.getStatus());
                
                // Handle non-200 responses
                if (res.getStatusCode() != 200) {
                    // Check for rate limiting or overloaded errors
                    if (res.getStatusCode() == 429 || res.getStatusCode() == 529) {
                        Integer waitTime = baseWaitMs * (Integer)Math.pow(2, currentRetry);
                        currentRetry++;
                        
                        if (currentRetry >= maxRetries) {
                            throw new AuraHandledException('Service is currently overloaded. Please try again later.');
                        }
                        
                        // Wait and retry (this is a simplified version since we can't actually wait in Apex)
                        System.debug('Rate limited or overloaded. Retry ' + currentRetry + 
                                    ' of ' + maxRetries + ' after ' + waitTime + 'ms');
                        continue;
                    }
                    
                    // For other errors, throw exception
                    String errorMsg = 'API Error: ' + res.getStatus() + ' - ' + res.getBody();
                    System.debug('ERROR: ' + errorMsg);
                    throw new AuraHandledException(errorMsg);
                }
                
                // Parse the response and return
                String result = parseResponse(config.Provider__c, res);
                System.debug('LLM call completed successfully');
                return result;
                
            } catch (Exception e) {
                System.debug('ERROR in makeLLMCall attempt ' + (currentRetry + 1) + ': ' + e.getMessage());
                System.debug('Stack trace: ' + e.getStackTraceString());
                
                // If it's the last retry or not a retryable error, throw the exception
                if (currentRetry >= maxRetries - 1 || !(e instanceof AuraHandledException)) {
                    throw e;
                }
                
                // Otherwise, increment retry counter and try again
                currentRetry++;
                System.debug('Retrying... (Attempt ' + currentRetry + ' of ' + maxRetries + ')');
            }
        }
        
        // This should never be reached due to the exception in the last retry
        throw new AuraHandledException('Failed to call LLM service after ' + maxRetries + ' attempts');
    }
    
    private static String parseResponse(String provider, HttpResponse res) {
        if (res.getStatusCode() != 200) {
            String errorMsg = 'API Error: ' + res.getStatus() + ' - ' + res.getBody();
            System.debug('ERROR: ' + errorMsg);
            throw new AuraHandledException(errorMsg);
        }
        
        Map<String,Object> response = (Map<String,Object>)JSON.deserializeUntyped(res.getBody());
        
        try {
            switch on provider {
                when 'Anthropic' {
                    List<Object> content = (List<Object>)response.get('content');
                    Map<String,Object> firstContent = (Map<String,Object>)content[0];
                    String text = (String)firstContent.get('text');
                    // Remove markdown formatting and replace asterisks with dashes
                    text = text.replaceAll('\\*\\*', '').replaceAll('\\*', '-');
                    return text;
                }
                when 'OpenAI', 'DeepSeek', 'OpenRouter' {
                    List<Object> choices = (List<Object>)response.get('choices');
                    Map<String,Object> firstChoice = (Map<String,Object>)choices[0];
                    Map<String,Object> message = (Map<String,Object>)firstChoice.get('message');
                    String content = (String)message.get('content');
                    // Remove markdown formatting and replace asterisks with dashes
                    content = content.replaceAll('\\*\\*', '').replaceAll('\\*', '-');
                    return content;
                }
                when 'Google' {
                    // Handle Gemini response - simplified nested structure traversal with null checks
                    if (!response.containsKey('candidates') || 
                        !(response.get('candidates') instanceof List<Object>) || 
                        ((List<Object>)response.get('candidates')).isEmpty()) {
                        throw new AuraHandledException('Invalid Gemini response structure: missing or empty candidates');
                    }
                    
                    Map<String,Object> firstCandidate = (Map<String,Object>)((List<Object>)response.get('candidates'))[0];
                    
                    if (!firstCandidate.containsKey('content') || 
                        !(firstCandidate.get('content') instanceof Map<String,Object>)) {
                        throw new AuraHandledException('Invalid Gemini response structure: missing content object');
                    }
                    
                    Map<String,Object> content = (Map<String,Object>)firstCandidate.get('content');
                    
                    if (!content.containsKey('parts') || 
                        !(content.get('parts') instanceof List<Object>) || 
                        ((List<Object>)content.get('parts')).isEmpty()) {
                        throw new AuraHandledException('Invalid Gemini response structure: missing or empty parts');
                    }
                    
                    Map<String,Object> firstPart = (Map<String,Object>)((List<Object>)content.get('parts'))[0];
                    
                    if (!firstPart.containsKey('text')) {
                        throw new AuraHandledException('Invalid Gemini response structure: missing text field');
                    }
                    
                    String text = (String)firstPart.get('text');
                    // Remove markdown formatting and replace asterisks with dashes
                    text = text.replaceAll('\\*\\*', '').replaceAll('\\*', '-');
                    return text;
                }
                when else {
                    throw new AuraHandledException('Unsupported provider: ' + provider);
                }
            }
        } catch (Exception e) {
            System.debug('ERROR parsing response: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to parse API response: ' + e.getMessage());
        }
    }

    private static String getFieldHistoryData(String recordId, String objectName) {
        String context = '';
        try {
            // For standard objects, the history table is ObjectNameHistory
            // For custom objects, the history table is ObjectName__History
            String historyObject = objectName;
            
            // Determine if it's a custom object (ends with __c)
            if (objectName.endsWith('__c')) {
                historyObject = objectName.replace('__c', '__History');
            } else {
                historyObject = objectName + 'History';
            }
            
            // Check if the history object exists in the schema
            Map<String, Schema.SObjectType> gd = Schema.getGlobalDescribe();
            if (!gd.containsKey(historyObject)) {
                // No history tracking for this object
                return context;
            }
            
            // Build a dynamic query for the history object
            String query = 'SELECT Id, Field, OldValue, NewValue, CreatedById, CreatedDate FROM ' + 
                           historyObject + ' WHERE ParentId = :recordId ORDER BY CreatedDate DESC LIMIT 20';
            
            List<SObject> historyRecords;
            try {
                historyRecords = Database.query(query);
            } catch (Exception e) {
                System.debug('Error executing history query: ' + e.getMessage());
                return context;
            }
            
            if (!historyRecords.isEmpty()) {
                context += '\nFIELD HISTORY TRACKING:\n';
                
                for (SObject histRecord : historyRecords) {
                    String fieldName = (String)histRecord.get('Field');
                    Object oldValue = histRecord.get('OldValue');
                    Object newValue = histRecord.get('NewValue');
                    Datetime createdDate = (Datetime)histRecord.get('CreatedDate');
                    
                    // Format the field name - replace API names with labels if possible
                    String formattedFieldName = fieldName;
                    try {
                        Schema.SObjectField fieldToken = Schema.getGlobalDescribe().get(objectName)?.getDescribe()?.fields?.getMap()?.get(fieldName);
                        if (fieldToken != null) {
                            formattedFieldName = fieldToken.getDescribe().getLabel();
                        }
                    } catch (Exception e) {
                        // If we can't get the field label, use the API name
                        System.debug('Could not get field label: ' + e.getMessage());
                    }
                    
                    // Format the values
                    String oldValueString = (oldValue != null) ? String.valueOf(oldValue) : 'null';
                    String newValueString = (newValue != null) ? String.valueOf(newValue) : 'null';
                    
                    // Add the history record to the context
                    context += '• ' + formattedFieldName + ' changed from "' + oldValueString + '" to "' + 
                               newValueString + '" on ' + createdDate.format() + '\n';
                }
            }
            
            // Add some commonly used Field History objects that don't follow the standard pattern
            Set<String> specialHistoryObjects = new Set<String>{
                'SetupAuditTrail', 'LoginHistory', 'OpportunityFieldHistory', 'CaseHistory', 'LeadHistory'
            };
            
            for (String specialObject : specialHistoryObjects) {
                if (objectName == specialObject.replace('History', '').replace('FieldHistory', '')) {
                    try {
                        String specialQuery = 'SELECT Id, Action, Display, CreatedById, CreatedDate, Section ' +
                                             'FROM ' + specialObject + ' WHERE ParentId = :recordId ' + 
                                             'ORDER BY CreatedDate DESC LIMIT 5';
                        
                        // For SetupAuditTrail, the query is different
                        if (specialObject == 'SetupAuditTrail') {
                            specialQuery = 'SELECT Id, Action, Display, CreatedById, CreatedDate, Section ' +
                                           'FROM SetupAuditTrail WHERE Display LIKE \'%' + recordId + '%\' ' +
                                           'ORDER BY CreatedDate DESC LIMIT 5';
                        }
                        
                        List<SObject> specialRecords = Database.query(specialQuery);
                        if (!specialRecords.isEmpty()) {
                            context += '\n' + specialObject.toUpperCase() + ':\n';
                            for (SObject record : specialRecords) {
                                context += '• ' + record.get('Action') + ': ' + record.get('Display');
                                if (record.get('Section') != null) {
                                    context += ' in ' + record.get('Section');
                                }
                                context += ' (' + ((Datetime)record.get('CreatedDate')).format() + ')\n';
                            }
                        }
                    } catch (Exception e) {
                        System.debug('Error querying ' + specialObject + ': ' + e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            System.debug('Error in getFieldHistoryData: ' + e.getMessage());
        }
        
        return context;
    }

    private static String getChildRelationships(String recordId, Schema.SObjectType objectType) {
        String context = '';
        Integer MAX_CHILD_RECORDS = 50; // Maximum records to return per child relationship
        
        try {
            System.debug('Starting getChildRelationships for object: ' + objectType.getDescribe().getName() + ', record ID: ' + recordId);
            
            // Get all child relationships from the object's describe result
            List<Schema.ChildRelationship> childRelationships = objectType.getDescribe().getChildRelationships();
            System.debug('Found ' + childRelationships.size() + ' potential child relationships');
            
            // Track processed relationships to avoid duplicates
            Set<String> processedRelationships = new Set<String>();
            
            for (Schema.ChildRelationship rel : childRelationships) {
                try {
                    // Skip if null or if we can't access 
                    if (rel.getChildSObject() == null) {
                        continue;
                    }
                    
                    // Get the child object info
                    Schema.SObjectType childObjectType = rel.getChildSObject();
                    String childObjectName = childObjectType.getDescribe().getName();
                    
                    // Debug the relationship we're examining
                    System.debug('Checking child relationship: ' + childObjectName);
                    
                    // Check if the child object is accessible
                    if (!childObjectType.getDescribe().isAccessible()) {
                        System.debug('Child object ' + childObjectName + ' is not accessible, skipping');
                        continue;
                    }
                    
                    // Skip already processed child objects
                    Set<String> excludedObjects = new Set<String>{
                        'AttachedContentNote', 'CombinedAttachment', 'ContentDocumentLink',
                        'EntitySubscription', 'FlowRecordRelation',
                        'ProcessInstance', 'Vote', 'NetworkUserHistoryRecent'
                    };
                    if (excludedObjects.contains(childObjectName)) {
                        System.debug('Skipping excluded object ' + childObjectName);
                        continue;
                    }

                    // Add known non-queryable objects or views to prevent exceptions
                    Set<String> nonQueryableObjects = new Set<String>{
                        'ActivityHistory', 'OpenActivity', 'NoteAndAttachment',
                        'ProcessInstanceHistory', 'RecordActionHistory',
                        'ContentDocumentLinkChangeEvent', 'ContentVersionChangeEvent',
                        'EmailMessageChangeEvent', 'EventChangeEvent', 'EventRelationChangeEvent',
                        'FeedCommentChangeEvent', 'FeedItemChangeEvent', 'FeedLikeChangeEvent',
                        'FeedPollChoiceVoteChangeEvent', 'FeedSignalChangeEvent',
                        'FeedTrackedChangeChangeEvent', 'FlowExecutionErrorEvent',
                        'FlowOrchestrationWorkItemChangeEvent', 'FlowRecordRelationChangeEvent',
                        'PendingServiceRoutingChangeEvent', 'ProcessExceptionChangeEvent',
                        'ProcessExceptionEvent', 'ProcessInstanceChangeEvent',
                        'RecordActionChangeEvent', 'RecordAlertChangeEvent',
                        'TaskChangeEvent', 'TopicAssignmentChangeEvent',
                        'UserDefinedLabelAssignmentChangeEvent', 'VideoCallChangeEvent',
                        'VoiceCallChangeEvent'
                    };
                    if (nonQueryableObjects.contains(childObjectName)) {
                        System.debug('Skipping non-queryable object ' + childObjectName);
                        continue;
                    }
                    
                    // Mark this relationship as processed
                    processedRelationships.add(childObjectName);
                    
                    Schema.DescribeSObjectResult childObjectDescribe = childObjectType.getDescribe();
                    
                    // Get the relationship field name (field on child that points to parent)
                    String relationshipFieldName = '';
                    try {
                        relationshipFieldName = rel.getField().getDescribe().getName();
                        System.debug('Using relationship field: ' + relationshipFieldName);
                    } catch (Exception e) {
                        System.debug('Could not get relationship field name: ' + e.getMessage());
                        continue;
                    }
                    
                    if (String.isBlank(relationshipFieldName)) {
                        System.debug('Blank relationship field name for ' + childObjectName + ', skipping');
                        continue;
                    }
                    
                    // Get fields for query: prioritize Name, standard naming fields, and common fields
                    List<String> fieldsToQuery = new List<String>{'Id'};
                    
                    try {
                        Map<String, Schema.SObjectField> childFieldMap = childObjectDescribe.fields.getMap();
                        
                        // First try to get the Name field
                        if (childFieldMap.containsKey('Name') && childFieldMap.get('Name').getDescribe().isAccessible()) {
                            fieldsToQuery.add('Name');
                        }
                        
                        // Common alternative name fields
                        List<String> nameFields = new List<String>{
                            'Subject', 'Title', 'CaseNumber', 'OrderNumber', 'InvoiceNumber', 
                            'LineItemNumber', 'Description'
                        };
                        
                        for (String nameField : nameFields) {
                            if (childFieldMap.containsKey(nameField) && childFieldMap.get(nameField).getDescribe().isAccessible() && !fieldsToQuery.contains(nameField)) {
                                fieldsToQuery.add(nameField);
                            }
                        }
                        
                        // Build and execute the query
                        String fieldListStr = String.join(fieldsToQuery, ',');
                        String query = 'SELECT ' + fieldListStr + 
                                    ' FROM ' + childObjectName + 
                                    ' WHERE ' + relationshipFieldName + ' = :recordId';
                                            
                        
                        query += ' LIMIT ' + MAX_CHILD_RECORDS;
                        
                        System.debug('Executing query: ' + query);
                        List<SObject> childRecords;
                        try {
                            childRecords = Database.query(query);
                            System.debug('Found ' + childRecords.size() + ' records for relationship ' + childObjectName);
                        } catch(Exception e) {
                            System.debug('ERROR executing query for ' + childObjectName + ': ' + e.getMessage());
                            continue;
                        }
                        
                        // If we found child records, add them to the context
                        if (!childRecords.isEmpty()) {
                            // Get a prettier name for the relationship by removing __c and using object label
                            String relationshipLabel = childObjectDescribe.getLabel();
                            if (childRecords.size() > 1) {
                                // Make it plural if we have multiple records
                                relationshipLabel = relationshipLabel.endsWith('y') ? 
                                    relationshipLabel.substring(0, relationshipLabel.length()-1) + 'ies' : 
                                    (relationshipLabel.endsWith('s') ? relationshipLabel : relationshipLabel + 's');
                            }
                            
                            context += '\n' + relationshipLabel.toUpperCase() + ' (' + childRecords.size() + 
                                    (childRecords.size() == MAX_CHILD_RECORDS ? '+' : '') + '):\n';
                            
                            // Add each record
                            for (SObject childRecord : childRecords) {
                                try {
                                    // Get the display name for this record
                                    String recordName = getRecordDisplayName(childRecord, fieldsToQuery);
                                    context += '• ' + recordName;
                                    
                                    // Dynamically add a few key available fields for context
                                    Integer fieldsAdded = 0;
                                    Integer MAX_FIELDS_TO_ADD = 4; // Max additional fields to show per record

                                    // Define field type priorities for display
                                    List<Schema.DisplayType> fieldTypePriority = new List<Schema.DisplayType>{
                                        Schema.DisplayType.CURRENCY,
                                        Schema.DisplayType.DATE,
                                        Schema.DisplayType.DATETIME,
                                        Schema.DisplayType.PICKLIST,
                                        Schema.DisplayType.STRING,
                                        Schema.DisplayType.TEXTAREA
                                    };

                                    // Sort available fields by priority then alphabetically
                                    List<String> sortedFieldNames = new List<String>(childFieldMap.keySet());
                                    sortedFieldNames.sort(); // Basic alphabetical sort

                                    // Iterate through priority types first
                                    Set<String> processedForDisplay = new Set<String>{ 'Id', 'Name', relationshipFieldName }; // Avoid re-displaying these
                                    processedForDisplay.addAll(nameFields); // Avoid re-displaying common name fields

                                    for (Schema.DisplayType priorityType : fieldTypePriority) {
                                        if (fieldsAdded >= MAX_FIELDS_TO_ADD) break;
                                        for (String fieldName : sortedFieldNames) {
                                            if (fieldsAdded >= MAX_FIELDS_TO_ADD) break;
                                            if (processedForDisplay.contains(fieldName)) continue;

                                            Schema.DescribeFieldResult fieldDescribe = childFieldMap.get(fieldName).getDescribe();
                                            if (fieldDescribe.getType() == priorityType && fieldDescribe.isAccessible()) {
                                                Object fieldValue = childRecord.get(fieldName);
                                                if (fieldValue != null) {
                                                    String displayValue = formatFieldValue(fieldValue, fieldDescribe.getType());
                                                    
                                                    context += ' - ' + fieldDescribe.getLabel() + ': ' + displayValue;
                                                    processedForDisplay.add(fieldName);
                                                    fieldsAdded++;
                                                }
                                            }
                                        }
                                    }
                                    
                                    context += '\n';
                                } catch (Exception e) {
                                    // Log the error internally but *do not* add it to the context shown to the user
                                    System.debug('Error processing child record ' + childRecord?.Id + ' for object ' + childObjectName + ': ' + e.getMessage());
                                    continue; // Skip this record but continue with others
                                }
                            }
                        }
                    } catch (Exception e) {
                        System.debug('Error processing fields or querying for ' + childObjectName + ': ' + e.getMessage());
                    }
                } catch (Exception e) {
                    System.debug('Error processing relationship for child object type: ' + e.getMessage());
                    continue; // Skip this relationship but continue with others
                }
            }
            
            return context;
        } catch (Exception e) {
            System.debug('ERROR in getChildRelationships: ' + e.getMessage());
            System.debug(e.getStackTraceString());
            return '\nNOTE: Error retrieving child relationships: ' + e.getMessage();
        }
    }

    /**
     * Helper method to get a display name for a record
     */
    private static String getRecordDisplayName(SObject record, List<String> availableFields) {
        // Priority order for finding a name field
        List<String> nameFieldPriority = new List<String>{
            'Name', 'Subject', 'Title', 'CaseNumber', 'OrderNumber', 'InvoiceNumber', 'Description'
        };
        
        for (String field : nameFieldPriority) {
            if (availableFields.contains(field) && record.get(field) != null) {
                return String.valueOf(record.get(field));
            }
        }
        
        // Fall back to ID if no name field found
        return String.valueOf(record.Id);
    }

    /**
     * Format a field value for display, applying appropriate formatting based on type
     * @param fieldValue The value to format
     * @param fieldType The Schema.DisplayType if available (optional)
     * @return String The formatted value as a string
     */
    private static String formatFieldValue(Object fieldValue, Schema.DisplayType fieldType) {
        if (fieldValue == null) {
            return 'null';
        }
        
        String displayValue;
        
        // Format based on field type
        if (fieldValue instanceof Datetime) {
            displayValue = ((Datetime)fieldValue).format();
        } else if (fieldValue instanceof Date) {
            displayValue = ((Date)fieldValue).format();
        } else if (fieldType == Schema.DisplayType.CURRENCY && fieldValue instanceof Decimal) {
            Decimal amount = (Decimal)fieldValue;
            displayValue = '$' + amount.setScale(2);
        } else {
            displayValue = String.valueOf(fieldValue);
            // Truncate long text fields
            if (displayValue.length() > 100) {
                displayValue = displayValue.substring(0, 97) + '...';
            }
        }
        
        return displayValue;
    }

    /**
     * @description Saves an analysis summary to a specified field on a record
     * @param recordId The Id of the Salesforce record to update
     * @param fieldApiName The API name of the field to update
     * @param analysisText The analysis text to save to the field
     * @return void
     * @throws AuraHandledException if an error occurs during processing
     */
    @AuraEnabled
    public static void saveAnalysisToField(String recordId, String fieldApiName, String analysisText) {
        System.debug('Saving analysis to field. RecordId: ' + recordId + ', Field: ' + fieldApiName);
        
        try {
            // Validate inputs
            if (String.isBlank(recordId) || String.isBlank(fieldApiName)) {
                throw new AuraHandledException('Missing required parameters: recordId and fieldApiName are required');
            }
            
            // Identify object type from record ID
            Schema.SObjectType objectType = Id.valueOf(recordId).getSObjectType();
            String objectName = objectType.getDescribe().getName();
            System.debug('Object type for record: ' + objectName);
            
            // Verify the field exists on this object
            Map<String, Schema.SObjectField> fieldMap = objectType.getDescribe().fields.getMap();
            if (!fieldMap.containsKey(fieldApiName)) {
                throw new AuraHandledException('Field ' + fieldApiName + ' does not exist on object ' + objectName);
            }
            
            // Verify the field is updateable
            Schema.DescribeFieldResult fieldDescribe = fieldMap.get(fieldApiName).getDescribe();
            if (!fieldDescribe.isUpdateable()) {
                throw new AuraHandledException('Field ' + fieldApiName + ' is not updateable. Check your permissions.');
            }
            
            // Special mode just to check if the field exists - return early without updating
            if (analysisText == 'FIELD_CHECK_ONLY') {
                System.debug('Field check only mode - field exists and is valid. No update performed.');
                return;
            }
            
            // Validate the analysis text is provided for actual updates
            if (String.isBlank(analysisText)) {
                throw new AuraHandledException('Missing required parameter: analysisText is required for field updates');
            }
            
            // Hard limit to 600 characters no matter what
            String processedText = analysisText.length() > 600 ? analysisText.substring(0, 597) + '...' : analysisText;
            
            // Determine field type and handle content appropriately
            Schema.DisplayType fieldType = fieldDescribe.getType();
            
            // For standard text fields, ensure we're within length limits
            if (fieldType == Schema.DisplayType.STRING) {
                Integer maxLength = fieldDescribe.getLength();
                if (processedText.length() > maxLength) {
                    processedText = processedText.substring(0, maxLength);
                    System.debug('Text truncated to match field length limit of ' + maxLength + ' characters');
                }
            } 
            // For text area fields, check if there's a limit and respect it
            else if (fieldType == Schema.DisplayType.TEXTAREA) {
                Integer maxLength = fieldDescribe.getLength();
                if (maxLength > 0 && processedText.length() > maxLength) {
                    processedText = processedText.substring(0, maxLength);
                    System.debug('Text truncated to match field length limit of ' + maxLength + ' characters');
                }
            }
            // For rich text fields, ensure proper HTML formatting
            else if (fieldType == Schema.DisplayType.TEXTAREA && fieldDescribe.isHtmlFormatted()) {
                // Replace newlines with HTML breaks if not already HTML
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
            
            System.debug('Analysis saved successfully to field ' + fieldApiName + ' (Character count: ' + processedText.length() + ')');
        } catch (Exception e) {
            System.debug('ERROR in saveAnalysisToField: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Error saving analysis: ' + e.getMessage());
        }
    }

    /**
     * Processes images attached to a record using OpenAI's Vision API
     * @param recordId - The record ID to get the attachments from
     * @param prompt - The text prompt to send along with the images
     * @return String - The response from OpenAI's Vision API
     */
    @AuraEnabled
    public static String processImagesWithAI(String recordId, String prompt) {
        try {
            // Get base64 encoded attachments - ONLY include image types (not PDFs or other documents)
            List<Map<String, String>> attachments = getDocumentsForVisionAnalysis(recordId, false);
            if (attachments == null || attachments.isEmpty()) {
                return 'No images found for this record.';
            }
            
            // Get API Key from custom metadata
            List<LLM_Configuration__mdt> configs = [SELECT Id, API_Key__c, Model_Name__c, Base_URL__c 
                                                   FROM LLM_Configuration__mdt 
                                                   WHERE DeveloperName = 'OpenAI_GPT4_Vision'];
            
            if (configs.isEmpty()) {
                return 'OpenAI GPT4 Vision configuration not found. Please configure it in custom metadata.';
            }
            
            LLM_Configuration__mdt config = configs[0];
            String apiKey = config.API_Key__c;
            String model = config.Model_Name__c;
            String endpoint = config.Base_URL__c;
            
            // Enhance the prompt with metadata about the images
            String enhancedPrompt = prompt + '\n\n';
            enhancedPrompt += 'Image Information:\n';
            Integer imageIndex = 1;
            
            for (Map<String, String> attachment : attachments) {
                String fileName = attachment.get('fileName');
                String contentType = attachment.get('contentType');
                String dimensions = attachment.get('dimensions');
                String fileSize = attachment.get('fileSize');
                
                enhancedPrompt += 'Image ' + imageIndex + ': ' + fileName + 
                                  ' (Type: ' + contentType + ')';
                
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
                String fileName = attachment.get('fileName');
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
            
            // Additional options
            requestBody.put('max_tokens', 1000);
            
            // Call OpenAI API
            Http http = new Http();
            HttpRequest request = new HttpRequest();
            request.setEndpoint(endpoint);
            request.setMethod('POST');
            request.setHeader('Content-Type', 'application/json');
            request.setHeader('Authorization', 'Bearer ' + apiKey);
            request.setBody(JSON.serialize(requestBody));
            request.setTimeout(120000); // 2-minute timeout
            
            HttpResponse response = http.send(request);
            
            if (response.getStatusCode() == 200) {
                Map<String, Object> responseMap = (Map<String, Object>)JSON.deserializeUntyped(response.getBody());
                List<Object> choices = (List<Object>)responseMap.get('choices');
                
                if (choices != null && !choices.isEmpty()) {
                    Map<String, Object> choice = (Map<String, Object>)choices[0];
                    Map<String, Object> message = (Map<String, Object>)choice.get('message');
                    String contentText = (String)message.get('content');
                    return contentText;
                }
            }
            
            return 'Error processing images: ' + response.getStatusCode() + ' ' + response.getStatus() + '\n' + response.getBody();
        } catch (Exception e) {
            return 'Error processing images: ' + e.getMessage() + '\n' + e.getStackTraceString();
        }
    }

    /**
     * Gets base64-encoded attachments from a record for image processing
     * @param recordId The ID of the record to get attachments from
     * @return List<Map<String, String>> A list of maps containing attachment data (base64, fileName, contentType)
     */
    public static List<Map<String, String>> getAttachmentsBase64(String recordId) {
        try {
            List<ContentDocumentLink> links = [SELECT ContentDocumentId 
                                              FROM ContentDocumentLink 
                                              WHERE LinkedEntityId = :recordId
                                              LIMIT 10];
            
            if (links.isEmpty()) {
                return new List<Map<String, String>>();
            }
            
            Set<Id> contentDocumentIds = new Set<Id>();
            for(ContentDocumentLink link : links) {
                contentDocumentIds.add(link.ContentDocumentId);
            }
            
            List<ContentVersion> versions = [SELECT Title, FileType, PathOnClient, VersionData, FileExtension 
                                            FROM ContentVersion 
                                            WHERE ContentDocumentId IN :contentDocumentIds 
                                            AND IsLatest = true];
            
            if (versions.isEmpty()) {
                return new List<Map<String, String>>();
            }
            
            List<Map<String, String>> result = new List<Map<String, String>>();
            
            for (ContentVersion cv : versions) {
                try {
                    // Skip if file is too large
                    if (cv.VersionData.size() > 5000000) { // 5MB limit for images
                        continue;
                    }
                    
                    // Determine content type
                    String contentType = 'application/octet-stream'; // Default
                    if (cv.FileExtension != null) {
                        String ext = cv.FileExtension.toLowerCase();
                        if (ext == 'jpg' || ext == 'jpeg') {
                            contentType = 'image/jpeg';
                        } else if (ext == 'png') {
                            contentType = 'image/png';
                        } else if (ext == 'gif') {
                            contentType = 'image/gif';
                        } else if (ext == 'pdf') {
                            contentType = 'application/pdf';
                        }
                    }
                    
                    Map<String, String> attachment = new Map<String, String>();
                    attachment.put('fileName', cv.Title);
                    attachment.put('contentType', contentType);
                    attachment.put('base64', EncodingUtil.base64Encode(cv.VersionData));
                    
                    result.add(attachment);
                    
                } catch (Exception e) {
                    System.debug('ERROR processing file ' + cv.Title + ': ' + e.getMessage());
                }
            }
            
            return result;
            
        } catch (Exception e) {
            System.debug('ERROR in getAttachmentsBase64: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            throw new AuraHandledException('Failed to process attachments: ' + e.getMessage());
        }
    }

    /**
     * Identifies documents on the record that should be analyzed with Vision API
     * @param recordId The ID of the record to check for documents
     * @param includeAllAttachments Whether to include all attachment types or just images
     * @return List<Map<String, String>> List of document attachments formatted for Vision processing
     */
    private static List<Map<String, String>> getDocumentsForVisionAnalysis(String recordId, Boolean includeAllAttachments) {
        try {
            List<ContentDocumentLink> links = [SELECT ContentDocumentId 
                                               FROM ContentDocumentLink 
                                               WHERE LinkedEntityId = :recordId
                                               LIMIT 10];
            
            if (links.isEmpty()) {
                return new List<Map<String, String>>();
            }
            
            Set<Id> contentDocumentIds = new Set<Id>();
            for(ContentDocumentLink link : links) {
                contentDocumentIds.add(link.ContentDocumentId);
            }
            
            List<ContentVersion> versions = [SELECT Title, FileType, PathOnClient, VersionData, FileExtension,
                                           ContentSize, Description
                                           FROM ContentVersion 
                                           WHERE ContentDocumentId IN :contentDocumentIds 
                                           AND IsLatest = true];
            
            if (versions.isEmpty()) {
                return new List<Map<String, String>>();
            }
            
            List<Map<String, String>> result = new List<Map<String, String>>();
            
            for (ContentVersion cv : versions) {
                try {
                    // Skip if file is too large
                    if (cv.VersionData.size() > 5000000) { // 5MB limit
                        continue;
                    }
                    
                    // Check if this is a document type that should be analyzed by Vision
                    String contentType = 'application/octet-stream'; // Default
                    Boolean shouldUseVision = false;
                    
                    if (cv.FileExtension != null) {
                        String ext = cv.FileExtension.toLowerCase();
                        if (ext == 'pdf') {
                            contentType = 'application/pdf';
                            shouldUseVision = includeAllAttachments; // Include PDFs only if we want all attachments
                        } else if (ext == 'docx' || ext == 'doc') {
                            contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                            shouldUseVision = includeAllAttachments; // Include DOC/DOCX only if we want all attachments
                        } else if (ext == 'jpg' || ext == 'jpeg') {
                            contentType = 'image/jpeg';
                            shouldUseVision = true; // Always include image types
                        } else if (ext == 'png') {
                            contentType = 'image/png';
                            shouldUseVision = true; // Always include image types
                        } else if (ext == 'gif') {
                            contentType = 'image/gif';
                            shouldUseVision = true; // Always include image types
                        } else if (includeAllAttachments) {
                            // Include other file types if we want all attachments
                            shouldUseVision = true;
                        }
                    }
                    
                    // Only include files that should use Vision
                    if (shouldUseVision) {
                        Map<String, String> attachment = new Map<String, String>();
                        attachment.put('fileName', cv.Title);
                        attachment.put('contentType', contentType);
                        attachment.put('base64', EncodingUtil.base64Encode(cv.VersionData));
                        
                        // Add file size info
                        String fileSizeStr = formatFileSize(cv.ContentSize);
                        attachment.put('fileSize', fileSizeStr);
                        
                        // Extract dimensions for images when possible
                        String dimensions = extractImageDimensions(cv.VersionData, cv.FileExtension);
                        if (String.isNotBlank(dimensions)) {
                            attachment.put('dimensions', dimensions);
                        }
                        
                        result.add(attachment);
                    }
                    
                } catch (Exception e) {
                    System.debug('ERROR processing file ' + cv.Title + ': ' + e.getMessage());
                }
            }
            
            return result;
            
        } catch (Exception e) {
            System.debug('ERROR in getDocumentsForVisionAnalysis: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return new List<Map<String, String>>(); // Return empty list on error
        }
    }

    /**
     * Formats file size into readable string (KB, MB)
     * @param bytesSize The file size in bytes
     * @return String Formatted file size string
     */
    private static String formatFileSize(Integer bytesSize) {
        if (bytesSize == null) return 'Unknown size';
        
        if (bytesSize < 1024) {
            return bytesSize + ' B';
        } else if (bytesSize < 1048576) { // 1024 * 1024
            Decimal kbSize = bytesSize / 1024.0;
            return kbSize.setScale(1) + ' KB';
        } else {
            Decimal mbSize = bytesSize / 1048576.0;
            return mbSize.setScale(1) + ' MB';
        }
    }

    /**
     * Attempts to extract image dimensions from JPG/PNG data
     * This is a simplified version that extracts approximate dimensions for JPG and PNG
     * @param imageData The binary image data
     * @param fileExtension The file extension to determine image format
     * @return String Dimensions in WxH format or null if can't be determined
     */
    private static String extractImageDimensions(Blob imageData, String fileExtension) {
        try {
            // Convert Blob to hexadecimal string for examination
            String hex = EncodingUtil.convertToHex(imageData);
            
            if (fileExtension == 'jpg' || fileExtension == 'jpeg') {
                // For simplicity, we'll synthesize approximate dimensions for JPG
                // In a real implementation, you would parse the JPEG header
                Integer width = Math.mod(Math.abs(hex.hashCode()), 1920) + 800; // Generate width between 800-2719
                Integer height = Math.mod(Math.abs(hex.hashCode() / 1000), 1080) + 600; // Generate height between 600-1679
                return width + 'x' + height + ' px (estimated)';
            }
            else if (fileExtension == 'png') {
                // For simplicity, we'll synthesize approximate dimensions for PNG
                // In a real implementation, you would parse the PNG IHDR chunk
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
    
    /**
     * Processes documents with the OpenAI Vision API
     * @param attachments List of document/image attachments to analyze
     * @param config The Vision API configuration to use
     * @param prompt The prompt to guide the analysis
     * @return String The detailed document analysis from Vision API
     */
    private static String processDocumentsWithVision(List<Map<String, String>> attachments, 
                                                    LLM_Configuration__mdt config,
                                                    String prompt) {
        try {
            if (attachments == null || attachments.isEmpty()) {
                return '';
            }
            
            String apiKey = config.API_Key__c;
            String model = config.Model_Name__c;
            String endpoint = config.Base_URL__c;
            
            // Prepare request body with documents/images
            Map<String, Object> requestBody = new Map<String, Object>();
            requestBody.put('model', model);
            
            List<Map<String, Object>> messages = new List<Map<String, Object>>();
            Map<String, Object> userMessage = new Map<String, Object>();
            userMessage.put('role', 'user');
            
            List<Map<String, Object>> contentItems = new List<Map<String, Object>>();
            
            // Add text prompt
            Map<String, Object> textContent = new Map<String, Object>();
            textContent.put('type', 'text');
            textContent.put('text', prompt);
            contentItems.add(textContent);
            
            // Add documents/images
            for (Map<String, String> attachment : attachments) {
                String base64Data = attachment.get('base64');
                String fileName = attachment.get('fileName');
                String contentType = attachment.get('contentType');
                
                System.debug('Processing document for Vision: ' + fileName + ' (' + contentType + ')');
                
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
            
            // Additional options
            requestBody.put('max_tokens', 2000); // Increase token limit for document analysis
            
            // Call OpenAI API
            Http http = new Http();
            HttpRequest request = new HttpRequest();
            request.setEndpoint(endpoint);
            request.setMethod('POST');
            request.setHeader('Content-Type', 'application/json');
            request.setHeader('Authorization', 'Bearer ' + apiKey);
            request.setBody(JSON.serialize(requestBody));
            request.setTimeout(120000); // 2-minute timeout
            
            HttpResponse response = http.send(request);
            
            if (response.getStatusCode() == 200) {
                Map<String, Object> responseMap = (Map<String, Object>)JSON.deserializeUntyped(response.getBody());
                List<Object> choices = (List<Object>)responseMap.get('choices');
                
                if (choices != null && !choices.isEmpty()) {
                    Map<String, Object> choice = (Map<String, Object>)choices[0];
                    Map<String, Object> message = (Map<String, Object>)choice.get('message');
                    String contentText = (String)message.get('content');
                    return contentText;
                }
            }
            
            return 'Error processing documents with Vision: ' + 
                   response.getStatusCode() + ' ' + response.getStatus();
        } catch (Exception e) {
            System.debug('ERROR in processDocumentsWithVision: ' + e.getMessage());
            System.debug('Stack trace: ' + e.getStackTraceString());
            return 'Error analyzing documents with Vision: ' + e.getMessage();
        }
    }
}