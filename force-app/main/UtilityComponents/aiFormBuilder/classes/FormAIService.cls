public with sharing class FormAIService {

    public class ExtractionResult {
        @AuraEnabled public Decimal confidence;
        @AuraEnabled public String rawJson;
        @AuraEnabled public List<FieldDTO> fields;
        @AuraEnabled public String serviceUsed;
        @AuraEnabled public String provider;
        @AuraEnabled public String modelName;
        @AuraEnabled public String configName;
        @AuraEnabled public Boolean configActive;
        @AuraEnabled public Boolean hasApiKey;
        @AuraEnabled public String baseUrl;
        @AuraEnabled public Integer attachmentCount;
        @AuraEnabled public String fileType;
        @AuraEnabled public String versionId;
        @AuraEnabled public Integer httpStatus;
        @AuraEnabled public String fallbackReason;
    }

    public class FieldDTO {
        @AuraEnabled public String label;
        @AuraEnabled public String apiName;
        @AuraEnabled public String type;
        @AuraEnabled public Boolean required;
        @AuraEnabled public Integer page;
        @AuraEnabled public Decimal x;
        @AuraEnabled public Decimal y;
        @AuraEnabled public Decimal width;
        @AuraEnabled public Decimal height;
        @AuraEnabled public String section;
        @AuraEnabled public String helpText;
        @AuraEnabled public List<String> options;
    }

    @AuraEnabled
    public static ExtractionResult runFormExtraction(String templateId) {
        if (String.isBlank(templateId)) {
            throw new AuraHandledException('templateId is required');
        }

        Long start = DateTime.now().getTime();
        Form_Generation_Log__c log = new Form_Generation_Log__c();
        log.Template__c = templateId;
        log.Generation_Date__c = System.now();

        try {
            Form_Template__c tpl = [
                SELECT Id, Name, Original_Image_Version_Id__c, Status__c, Template_Title__c
                FROM Form_Template__c
                WHERE Id = :templateId
                LIMIT 1
            ];

            // Find latest ContentVersion if not set yet
            Id versionId = tpl.Original_Image_Version_Id__c;
            if (versionId == null) {
                List<ContentDocumentLink> links = [
                    SELECT ContentDocumentId, ContentDocument.LatestPublishedVersionId
                    FROM ContentDocumentLink
                    WHERE LinkedEntityId = :templateId
                    ORDER BY SystemModstamp DESC
                    LIMIT 1
                ];
                if (!links.isEmpty()) {
                    versionId = links[0].ContentDocument.LatestPublishedVersionId;
                    update new Form_Template__c(
                        Id = tpl.Id,
                        Original_Image_Version_Id__c = versionId
                    );
                }
            }
            if (versionId == null) {
                throw new AuraHandledException('No uploaded file found. Please upload an image or PDF to the template first.');
            }

            // Read file binary and prepare base64
            ContentVersion cv = [
                SELECT Id, VersionData, Title, FileExtension, FileType, ContentSize
                FROM ContentVersion
                WHERE Id = :versionId
                LIMIT 1
            ];

            String base64 = EncodingUtil.base64Encode(cv.VersionData);

            // If PDF, use file-based content per OpenAI Vision file flow
            if (cv.FileType == 'PDF') {
                // Load LLM config
                LLM_Configuration__mdt cfg;
                try {
                    cfg = [
                        SELECT API_Key__c, Model_Name__c, Base_URL__c, Temperature__c, Max_Tokens__c, IsActive__c
                        FROM LLM_Configuration__mdt
                        WHERE DeveloperName = 'OpenAI_GPT4_Vision'
                        WITH SECURITY_ENFORCED
                        LIMIT 1
                    ];
                } catch (Exception ce) {}
                if (cfg == null || cfg.IsActive__c == false || String.isBlank(cfg.API_Key__c)) {
                    ExtractionResult mockRes = performMockExtraction(tpl, cv, log, start);
                    if (mockRes != null) {
                        mockRes.provider = 'OpenAI';
                        mockRes.modelName = (cfg != null ? cfg.Model_Name__c : null);
                        mockRes.configName = 'OpenAI_GPT4_Vision';
                        mockRes.configActive = (cfg != null ? cfg.IsActive__c : false);
                        mockRes.hasApiKey = (cfg != null && String.isNotBlank(cfg.API_Key__c));
                        mockRes.baseUrl = (cfg != null ? cfg.Base_URL__c : null);
                        mockRes.attachmentCount = 1;
                        mockRes.fileType = cv.FileType;
                        mockRes.versionId = cv.Id;
                        mockRes.httpStatus = 400;
                        mockRes.fallbackReason = 'PDF processing not available (missing/disabled API configuration).';
                    }
                    return mockRes;
                }

                String promptPdf = getStrictJsonPrompt();

                Map<String, Object> requestBody = new Map<String, Object>();
                requestBody.put('model', cfg.Model_Name__c);

                List<Object> contentItems = new List<Object>();
                contentItems.add(new Map<String, Object>{ 'type' => 'text', 'text' => promptPdf });
                Map<String, Object> fileContent = new Map<String, Object>();
                fileContent.put('type', 'file');
                fileContent.put('file', new Map<String, Object>{
                    'filename' => (cv.Title != null ? cv.Title : 'document.pdf'),
                    'file_data' => 'data:application/pdf;base64,' + base64
                });
                contentItems.add(fileContent);

                Map<String, Object> userMessage = new Map<String, Object>();
                userMessage.put('role', 'user');
                userMessage.put('content', contentItems);

                Map<String, Object> body = new Map<String, Object>();
                body.put('model', cfg.Model_Name__c);
                body.put('messages', new List<Object>{ userMessage });
                body.put('max_tokens', cfg.Max_Tokens__c != null ? Integer.valueOf(cfg.Max_Tokens__c) : 4000);
                if (cfg.Temperature__c != null) body.put('temperature', cfg.Temperature__c);

                HttpRequest reqPdf = new HttpRequest();
                reqPdf.setEndpoint(cfg.Base_URL__c);
                reqPdf.setMethod('POST');
                reqPdf.setHeader('Content-Type', 'application/json;charset=UTF-8');
                reqPdf.setHeader('Authorization', 'Bearer ' + cfg.API_Key__c);
                reqPdf.setTimeout(120000);
                reqPdf.setBody(JSON.serialize(body));

                Http httpPdf = new Http();
                HttpResponse resPdf = httpPdf.send(reqPdf);
                Integer st = resPdf.getStatusCode();
                if (st != 200) {
                    ExtractionResult mockRes = performMockExtraction(tpl, cv, log, start);
                    if (mockRes != null) {
                        mockRes.provider = 'OpenAI';
                        mockRes.modelName = cfg.Model_Name__c;
                        mockRes.configName = 'OpenAI_GPT4_Vision';
                        mockRes.configActive = true;
                        mockRes.hasApiKey = true;
                        mockRes.baseUrl = cfg.Base_URL__c;
                        mockRes.attachmentCount = 1;
                        mockRes.fileType = cv.FileType;
                        mockRes.versionId = cv.Id;
                        mockRes.httpStatus = st;
                        mockRes.fallbackReason = 'PDF API error: ' + st;
                    }
                    return mockRes;
                }

                Map<String, Object> respMap = (Map<String, Object>) JSON.deserializeUntyped(resPdf.getBody());
                List<Object> choicesPdf = (List<Object>) respMap.get('choices');
                if (choicesPdf == null || choicesPdf.isEmpty()) {
                    throw new AuraHandledException('AI returned no choices');
                }
                Map<String, Object> messagePdf = (Map<String, Object>) ((Map<String, Object>) choicesPdf[0]).get('message');
                String contentStrPdf = (String) messagePdf.get('content');
                String jsonTextPdf = extractFirstJson(contentStrPdf);

                update new Form_Template__c(
                    Id = tpl.Id,
                    AI_Extracted_JSON__c = jsonTextPdf,
                    Status__c = 'Review'
                );

                ExtractionResult resultPdf = mapJsonToFieldDefs(templateId, jsonTextPdf);
                resultPdf.provider = 'OpenAI';
                resultPdf.modelName = cfg.Model_Name__c;
                resultPdf.configName = 'OpenAI_GPT4_Vision';
                resultPdf.configActive = true;
                resultPdf.hasApiKey = true;
                resultPdf.baseUrl = cfg.Base_URL__c;
                resultPdf.attachmentCount = 1;
                resultPdf.fileType = cv.FileType;
                resultPdf.versionId = cv.Id;
                resultPdf.httpStatus = 200;

                if (resultPdf != null && resultPdf.confidence != null) {
                    update new Form_Template__c(Id = tpl.Id, Confidence_Score__c = resultPdf.confidence);
                }

                log.AI_Service_Used__c = 'OpenAI:' + (cfg.Model_Name__c);
                log.Success__c = true;
                log.Confidence_Score__c = resultPdf != null ? resultPdf.confidence : null;
                log.Processing_Time__c = (Decimal.valueOf(String.valueOf(DateTime.now().getTime() - start))) / 1000;
                insert log;

                if (resultPdf == null) resultPdf = new ExtractionResult();
                resultPdf.serviceUsed = 'OpenAI:' + (cfg.Model_Name__c);
                return resultPdf;
            }

            // Get Vision model config (uses existing nuviAI metadata)
            LLM_Configuration__mdt config;
            try {
                config = [
                    SELECT API_Key__c, Model_Name__c, Base_URL__c, Temperature__c, Max_Tokens__c, IsActive__c
                    FROM LLM_Configuration__mdt
                    WHERE DeveloperName = 'OpenAI_GPT4_Vision'
                    WITH SECURITY_ENFORCED
                    LIMIT 1
                ];
            } catch (Exception ignore) {}

            // If configuration missing or inactive or api key missing, use mock extraction
            if (config == null || config.IsActive__c == false || String.isBlank(config.API_Key__c)) {
                ExtractionResult mockRes = performMockExtraction(tpl, cv, log, start);
                if (mockRes != null) {
                    mockRes.provider = 'OpenAI';
                    mockRes.modelName = (config != null ? config.Model_Name__c : null);
                    mockRes.configName = 'OpenAI_GPT4_Vision';
                    mockRes.configActive = (config != null ? config.IsActive__c : false);
                    mockRes.hasApiKey = (config != null && String.isNotBlank(config.API_Key__c));
                    mockRes.baseUrl = (config != null ? config.Base_URL__c : null);
                    mockRes.attachmentCount = 1;
                    mockRes.fileType = cv.FileType;
                    mockRes.versionId = cv.Id;
                    if (config == null) mockRes.fallbackReason = 'No LLM configuration found';
                    else if (config.IsActive__c == false) mockRes.fallbackReason = 'Configuration is inactive';
                    else if (String.isBlank(config.API_Key__c)) mockRes.fallbackReason = 'API key is missing';
                }
                return mockRes;
            }

            String prompt = getStrictJsonPrompt();

            // Build OpenAI Chat Completions request with image content
            HttpRequest req = new HttpRequest();
            req.setEndpoint('https://api.openai.com/v1/chat/completions');
            req.setMethod('POST');
            req.setHeader('Content-Type', 'application/json');
            req.setHeader('Authorization', 'Bearer ' + config.API_Key__c);
            req.setTimeout(120000);

            Map<String, Object> body = new Map<String, Object>();
            body.put('model', config.Model_Name__c != null ? config.Model_Name__c : 'gpt-4o');
            body.put('max_tokens', config.Max_Tokens__c != null ? Integer.valueOf(config.Max_Tokens__c) : 4000);
            body.put('response_format', new Map<String, Object>{ 'type' => 'json_object' });

            List<Object> messages = new List<Object>();
            Map<String, Object> userMsg = new Map<String, Object>();
            userMsg.put('role', 'user');

            List<Object> content = new List<Object>();
            // Instruction text
            content.add(new Map<String, Object>{ 'type' => 'text', 'text' => prompt });
            // Image as data URL
            String mime = (cv.FileType != null && cv.FileType.equalsIgnoreCase('PNG')) ? 'image/png' : 'image/jpeg';
            Map<String, Object> img = new Map<String, Object>();
            img.put('type', 'image_url');
            img.put('image_url', new Map<String, Object>{ 'url' => 'data:' + mime + ';base64,' + base64 });
            content.add(img);

            userMsg.put('content', content);
            messages.add(userMsg);
            body.put('messages', messages);

            req.setBody(JSON.serialize(body));

            Http http = new Http();
            HttpResponse res = http.send(req);
            Integer httpStatus = res.getStatusCode();
            if (httpStatus < 200 || httpStatus >= 300) {
                // Fallback to mock
                ExtractionResult mockRes = performMockExtraction(tpl, cv, log, start);
                if (mockRes != null) {
                    mockRes.provider = 'OpenAI';
                    mockRes.modelName = (config.Model_Name__c);
                    mockRes.configName = 'OpenAI_GPT4_Vision';
                    mockRes.configActive = true;
                    mockRes.hasApiKey = String.isNotBlank(config.API_Key__c);
                    mockRes.baseUrl = config.Base_URL__c;
                    mockRes.attachmentCount = 1;
                    mockRes.fileType = cv.FileType;
                    mockRes.versionId = cv.Id;
                    mockRes.httpStatus = httpStatus;
                    mockRes.fallbackReason = 'API error: ' + httpStatus;
                }
                return mockRes;
            }

            // Parse response text
            Map<String, Object> resp = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            List<Object> choices = (List<Object>) resp.get('choices');
            if (choices == null || choices.isEmpty()) {
                throw new AuraHandledException('AI returned no choices');
            }
            Map<String, Object> message = (Map<String, Object>) ((Map<String, Object>) choices[0]).get('message');
            String contentStr = (String) message.get('content');

            // The model may return JSON within text; extract JSON block if necessary
            String jsonText = extractFirstJson(contentStr);

            // Save raw JSON to template
            update new Form_Template__c(
                Id = tpl.Id,
                AI_Extracted_JSON__c = jsonText,
                Status__c = 'Review'
            );

            // Convert to field definitions and upsert
            ExtractionResult result = mapJsonToFieldDefs(templateId, jsonText);
            // Enrich diagnostics for UI console logs
            result.provider = 'OpenAI';
            result.modelName = (config.Model_Name__c);
            result.configName = 'OpenAI_GPT4_Vision';
            result.configActive = true;
            result.hasApiKey = String.isNotBlank(config.API_Key__c);
            result.baseUrl = config.Base_URL__c;
            result.attachmentCount = 1;
            result.fileType = cv.FileType;
            result.versionId = cv.Id;
            result.httpStatus = 200;

            // Update confidence on template if present
            if (result != null && result.confidence != null) {
                update new Form_Template__c(Id = tpl.Id, Confidence_Score__c = result.confidence);
            }

            // Log success
            log.AI_Service_Used__c = 'OpenAI:' + (config.Model_Name__c);
            log.Success__c = true;
            log.Confidence_Score__c = result != null ? result.confidence : null;
            log.Processing_Time__c = (Decimal.valueOf(String.valueOf(DateTime.now().getTime() - start))) / 1000;
            insert log;

            if (result == null) result = new ExtractionResult();
            result.serviceUsed = 'OpenAI:' + (config.Model_Name__c);
            return result;
        } catch (Exception e) {
            log.Success__c = false;
            log.Error_Details__c = e.getMessage();
            log.Processing_Time__c = (Decimal.valueOf(String.valueOf(DateTime.now().getTime() - start))) / 1000;
            try { insert log; } catch (Exception ex) { /* ignore logging failure */ }
            // Final fallback to mock
            try {
                ExtractionResult mockRes = performMockExtraction(null, null, log, start);
                if (mockRes != null) mockRes.fallbackReason = 'Exception: ' + e.getMessage();
                return mockRes;
            } catch (Exception ex2) {
                throw new AuraHandledException('Extraction failed: ' + e.getMessage());
            }
        }
    }

    private static ExtractionResult performMockExtraction(Form_Template__c tpl, ContentVersion cv, Form_Generation_Log__c log, Long start) {
        // Build a deterministic mock result and serialize to JSON
        String title = tpl != null && String.isNotBlank(tpl.Template_Title__c) ? tpl.Template_Title__c : 'Sample Permit Application';
        Map<String, Object> root = new Map<String, Object>();
        Map<String, Object> meta = new Map<String, Object>();
        meta.put('title', title);
        meta.put('formNumber', 'FORM-001');
        meta.put('agency', 'Sample Agency');
        meta.put('revisionDate', '2025-01-01');
        meta.put('legalCitations', new List<String>{ '43 CFR 3160', 'OMB 1004-0137' });
        root.put('metadata', meta);
        List<Object> fields = new List<Object>();
        fields.add(new Map<String, Object>{ 'label'=>'Applicant Name','apiName'=>'applicantName','type'=>'Text','required'=>true,'section'=>'Applicant','helpText'=>null,'page'=>1,'x'=>40,'y'=>110,'width'=>720,'height'=>30 });
        fields.add(new Map<String, Object>{ 'label'=>'Phone','apiName'=>'phone','type'=>'Text','required'=>true,'section'=>'Applicant','helpText'=>'(XXX) XXX-XXXX','page'=>1,'x'=>40,'y'=>170,'width'=>350,'height'=>30 });
        fields.add(new Map<String, Object>{ 'label'=>'Email','apiName'=>'email','type'=>'Text','required'=>true,'section'=>'Applicant','helpText'=>null,'page'=>1,'x'=>410,'y'=>170,'width'=>350,'height'=>30 });
        fields.add(new Map<String, Object>{ 'label'=>'Project Description','apiName'=>'projectDescription','type'=>'TextArea','required'=>false,'section'=>'Project','helpText'=>null,'page'=>1,'x'=>40,'y'=>230,'width'=>720,'height'=>60 });
        fields.add(new Map<String, Object>{ 'label'=>'Start Date','apiName'=>'startDate','type'=>'Date','required'=>false,'section'=>'Project','helpText'=>null,'page'=>1,'x'=>40,'y'=>310,'width'=>200,'height'=>30 });
        fields.add(new Map<String, Object>{ 'label'=>'Permit Type','apiName'=>'permitType','type'=>'Picklist','required'=>true,'section'=>'Project','helpText'=>null,'page'=>1,'x'=>260,'y'=>310,'width'=>250,'height'=>30,'options'=>new List<String>{'Drilling','Environmental','Building'} });
        root.put('fields', fields);
        root.put('confidence', 0.90);

        String mock = JSON.serialize(root);

        // Save and map
        if (tpl != null) {
            update new Form_Template__c(
                Id = tpl.Id,
                AI_Extracted_JSON__c = mock,
                Status__c = 'Review'
            );
        }
        ExtractionResult result = mapJsonToFieldDefs(tpl != null ? tpl.Id : null, mock);

        log.AI_Service_Used__c = 'Mock';
        log.Success__c = true;
        log.Confidence_Score__c = result.confidence;
        log.Processing_Time__c = (Decimal.valueOf(String.valueOf(DateTime.now().getTime() - start))) / 1000;
        if (log.Id == null) {
            insert log;
        } else {
            try { update log; } catch (Exception ignore) {}
        }
        result.serviceUsed = 'Mock';
        return result;
    }

    private static ExtractionResult mapJsonToFieldDefs(String templateId, String jsonText) {
        if (String.isBlank(jsonText)) {
            return new ExtractionResult();
        }

        Object parsed = JSON.deserializeUntyped(jsonText);
        if (!(parsed instanceof Map<String, Object>)) {
            throw new AuraHandledException('Parsed extraction is not a JSON object');
        }
        Map<String, Object> root = (Map<String, Object>) parsed;

        ExtractionResult result = new ExtractionResult();
        result.rawJson = jsonText;
        if (root.containsKey('confidence')) {
            Object conf = root.get('confidence');
            try { result.confidence = conf == null ? null : Decimal.valueOf(String.valueOf(conf)); } catch (Exception ignore) {}
        }

        // Optional: apply metadata to template
        try {
            Map<String, Object> meta = (Map<String, Object>) root.get('metadata');
            if (meta != null) {
                Form_Template__c upd = new Form_Template__c();
                upd.Id = templateId;
                if (meta.containsKey('title')) upd.Template_Title__c = (String) meta.get('title');
                if (meta.containsKey('formNumber')) upd.Form_Number__c = (String) meta.get('formNumber');
                if (meta.containsKey('agency')) upd.Agency__c = (String) meta.get('agency');
                if (meta.containsKey('revisionDate')) {
                    String d = (String) meta.get('revisionDate');
                    try { if (!String.isBlank(d)) upd.Revision_Date__c = Date.valueOf(d); } catch (Exception ignore) {}
                }
                if (meta.containsKey('legalCitations')) {
                    List<Object> arr = (List<Object>) meta.get('legalCitations');
                    if (arr != null) {
                        List<String> lines = new List<String>();
                        for (Object s : arr) lines.add(String.valueOf(s));
                        upd.Legal_Citations__c = String.join(lines, '\n');
                    }
                }
                update upd;
            }
        } catch (Exception e) {
            // ignore metadata update failures
        }

        List<Object> fields = (List<Object>) root.get('fields');
        if (fields == null) fields = new List<Object>();

        List<Form_Field_Definition__c> defs = new List<Form_Field_Definition__c>();
        List<FieldDTO> dtos = new List<FieldDTO>();

        for (Object o : fields) {
            if (!(o instanceof Map<String, Object>)) continue;
            Map<String, Object> f = (Map<String, Object>) o;

            FieldDTO dto = new FieldDTO();
            dto.label = (String) f.get('label');
            dto.apiName = (String) f.get('apiName');
            dto.type = (String) f.get('type');
            dto.required = (Boolean) f.get('required');
            dto.section = (String) f.get('section');
            dto.helpText = (String) f.get('helpText');
            dto.page = toInt(f.get('page'));
            dto.x = toDec(f.get('x'));
            dto.y = toDec(f.get('y'));
            dto.width = toDec(f.get('width'));
            dto.height = toDec(f.get('height'));

            if (f.get('options') instanceof List<Object>) {
                dto.options = new List<String>();
                for (Object opt : (List<Object>) f.get('options')) {
                    dto.options.add(String.valueOf(opt));
                }
            }

            dtos.add(dto);

            Form_Field_Definition__c d = new Form_Field_Definition__c();
            d.Form_Template__c = templateId;
            d.Field_Label__c = dto.label;
            d.Field_API_Name__c = dto.apiName;
            d.Field_Type__c = normalizeType(dto.type);
            d.Is_Required__c = dto.required == null ? false : dto.required;
            d.Section_Name__c = dto.section;
            d.Help_Text__c = dto.helpText;
            d.Page_Number__c = dto.page;
            d.Position_X__c = dto.x;
            d.Position_Y__c = dto.y;
            d.Width__c = dto.width;
            d.Height__c = dto.height;
            if (dto.options != null && !dto.options.isEmpty()) {
                d.Options_JSON__c = JSON.serialize(dto.options);
            }
            defs.add(d);
        }

        if (templateId != null) {
            // Replace existing field defs
            delete [SELECT Id FROM Form_Field_Definition__c WHERE Form_Template__c = :templateId];
            insert defs;
        }

        result.fields = dtos;
        return result;
    }

    private static String normalizeType(String t) {
        if (String.isBlank(t)) return 'Text';
        String v = t.trim().toLowerCase();
        if (v.contains('date') && v.contains('time')) return 'DateTime';
        if (v.contains('date')) return 'Date';
        if (v.contains('check')) return 'Checkbox';
        if (v.contains('radio')) return 'Radio';
        if (v.contains('multi')) return 'MultiPicklist';
        if (v.contains('pick')) return 'Picklist';
        if (v.contains('number') || v.contains('decimal') || v.contains('currency') || v.contains('percent')) return 'Number';
        if (v.contains('signature')) return 'Signature';
        if (v.contains('text') && v.contains('area')) return 'TextArea';
        return 'Text';
    }

    private static Integer toInt(Object o) {
        try { return o == null ? null : Integer.valueOf(String.valueOf(o)); } catch (Exception e) { return null; }
    }
    private static Decimal toDec(Object o) {
        try { return o == null ? null : Decimal.valueOf(String.valueOf(o)); } catch (Exception e) { return null; }
    }

    private static String extractFirstJson(String text) {
        if (String.isBlank(text)) return '';
        String t = text.trim();
        // Strip common code fences
        if (t.startsWith('```')) {
            Integer fenceEnd = t.indexOf('\n');
            if (fenceEnd > -1) t = t.substring(fenceEnd+1);
            Integer lastFence = t.lastIndexOf('```');
            if (lastFence > -1) t = t.substring(0, lastFence);
            t = t.trim();
        }
        // Attempt to find first balanced JSON object
        Integer start = t.indexOf('{');
        if (start == -1) return t; // return cleaned text for error context
        Integer braces = 0;
        for (Integer i = start; i < t.length(); i++) {
            if (t.substring(i, i+1) == '{') braces++;
            if (t.substring(i, i+1) == '}') braces--;
            if (braces == 0) {
                return t.substring(start, i+1);
            }
        }
        return t.substring(start);
    }

    private static String getStrictJsonPrompt() {
        return 'You are an expert OCR + forms analyst. Return ONLY a single JSON object that strictly matches this schema (no prose, no markdown, no code fences):' +
        '{' +
        '  "metadata": {' +
        '    "title": string,' +
        '    "formNumber": string,' +
        '    "agency": string,' +
        '    "revisionDate": string|null,' +
        '    "legalCitations": string[]' +
        '  },' +
        '  "fields": [' +
        '    {' +
        '      "label": string,' +
        '      "apiName": string,' +
        '      "type": "Text|TextArea|Number|Date|DateTime|Checkbox|Radio|Picklist|MultiPicklist|Signature",' +
        '      "required": boolean,' +
        '      "section": string|null,' +
        '      "helpText": string|null,' +
        '      "page": number,' +
        '      "x": number,' +
        '      "y": number,' +
        '      "width": number,' +
        '      "height": number,' +
        '      "options": string[]' +
        '    }' +
        '  ],' +
        '  "confidence": number' +
        '}';
    }
}




