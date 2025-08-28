public with sharing class LLMHttpService {
    
    public static String makeLLMCall(String provider, String modelName, String apiKey, 
                                    String prompt, Integer maxTokens, Decimal temperature) {
        try {
            HttpRequest req = buildRequest(provider, modelName, apiKey, prompt, maxTokens, temperature);
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            if (res.getStatusCode() >= 200 && res.getStatusCode() < 300) {
                return parseResponse(provider, res);
            } else {
                handleErrorResponse(provider, res);
                return null;
            }
        } catch (Exception e) {
            throw new LLMException('Error calling ' + provider + ' API: ' + e.getMessage());
        }
    }
    
    private static HttpRequest buildRequest(String provider, String modelName, String apiKey,
                                           String prompt, Integer maxTokens, Decimal temperature) {
        HttpRequest req = new HttpRequest();
        req.setTimeout(120000);
        req.setMethod('POST');
        
        String endpoint = getEndpoint(provider);
        req.setEndpoint(endpoint);
        
        setHeaders(req, provider, apiKey);
        
        String body = buildRequestBody(provider, modelName, prompt, maxTokens, temperature);
        req.setBody(body);
        
        return req;
    }
    
    private static String getEndpoint(String provider) {
        Map<String, String> endpoints = new Map<String, String>{
            'OpenAI' => 'https://api.openai.com/v1/chat/completions',
            'Anthropic' => 'https://api.anthropic.com/v1/messages',
            'Google' => 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent',
            'OpenRouter' => 'https://openrouter.ai/api/v1/chat/completions'
        };
        
        String endpoint = endpoints.get(provider);
        if (String.isBlank(endpoint)) {
            throw new LLMException('Unsupported provider: ' + provider);
        }
        
        return endpoint;
    }
    
    private static void setHeaders(HttpRequest req, String provider, String apiKey) {
        req.setHeader('Content-Type', 'application/json');
        
        if (provider == 'OpenAI' || provider == 'OpenRouter') {
            req.setHeader('Authorization', 'Bearer ' + apiKey);
            if (provider == 'OpenRouter') {
                req.setHeader('HTTP-Referer', 'https://salesforce.com');
                req.setHeader('X-Title', 'Salesforce LLM Integration');
            }
        } else if (provider == 'Anthropic') {
            req.setHeader('x-api-key', apiKey);
            req.setHeader('anthropic-version', '2023-06-01');
        } else if (provider == 'Google') {
            req.setHeader('x-goog-api-key', apiKey);
        }
    }
    
    private static String buildRequestBody(String provider, String modelName, String prompt,
                                          Integer maxTokens, Decimal temperature) {
        Map<String, Object> bodyMap = new Map<String, Object>();
        
        if (provider == 'OpenAI' || provider == 'OpenRouter') {
            bodyMap.put('model', modelName);
            bodyMap.put('messages', new List<Map<String, String>>{
                new Map<String, String>{
                    'role' => 'user',
                    'content' => prompt
                }
            });
            bodyMap.put('max_tokens', maxTokens != null ? maxTokens : 4000);
            bodyMap.put('temperature', temperature != null ? temperature : 0.7);
        } else if (provider == 'Anthropic') {
            bodyMap.put('model', modelName);
            bodyMap.put('messages', new List<Map<String, String>>{
                new Map<String, String>{
                    'role' => 'user',
                    'content' => prompt
                }
            });
            bodyMap.put('max_tokens', maxTokens != null ? maxTokens : 4000);
            bodyMap.put('temperature', temperature != null ? temperature : 0.7);
        } else if (provider == 'Google') {
            bodyMap.put('contents', new List<Map<String, Object>>{
                new Map<String, Object>{
                    'parts' => new List<Map<String, String>>{
                        new Map<String, String>{
                            'text' => prompt
                        }
                    }
                }
            });
            bodyMap.put('generationConfig', new Map<String, Object>{
                'maxOutputTokens' => maxTokens != null ? maxTokens : 4000,
                'temperature' => temperature != null ? temperature : 0.7
            });
        }
        
        return JSON.serialize(bodyMap);
    }
    
    private static String parseResponse(String provider, HttpResponse res) {
        String responseBody = res.getBody();
        
        if (String.isBlank(responseBody)) {
            return 'Empty response from API';
        }
        
        try {
            if (provider == 'OpenAI' || provider == 'OpenRouter') {
                Map<String, Object> responseMap = (Map<String, Object>)JSON.deserializeUntyped(responseBody);
                List<Object> choices = (List<Object>)responseMap.get('choices');
                if (choices != null && !choices.isEmpty()) {
                    Map<String, Object> firstChoice = (Map<String, Object>)choices[0];
                    Map<String, Object> message = (Map<String, Object>)firstChoice.get('message');
                    return (String)message.get('content');
                }
            } else if (provider == 'Anthropic') {
                Map<String, Object> responseMap = (Map<String, Object>)JSON.deserializeUntyped(responseBody);
                List<Object> content = (List<Object>)responseMap.get('content');
                if (content != null && !content.isEmpty()) {
                    Map<String, Object> firstContent = (Map<String, Object>)content[0];
                    return (String)firstContent.get('text');
                }
            } else if (provider == 'Google') {
                Map<String, Object> responseMap = (Map<String, Object>)JSON.deserializeUntyped(responseBody);
                List<Object> candidates = (List<Object>)responseMap.get('candidates');
                if (candidates != null && !candidates.isEmpty()) {
                    Map<String, Object> firstCandidate = (Map<String, Object>)candidates[0];
                    Map<String, Object> content = (Map<String, Object>)firstCandidate.get('content');
                    List<Object> parts = (List<Object>)content.get('parts');
                    if (parts != null && !parts.isEmpty()) {
                        Map<String, Object> firstPart = (Map<String, Object>)parts[0];
                        return (String)firstPart.get('text');
                    }
                }
            }
            
            return 'Could not parse response from ' + provider;
        } catch (Exception e) {
            System.debug('Error parsing response: ' + e.getMessage());
            return 'Error parsing response: ' + e.getMessage();
        }
    }
    
    private static void handleErrorResponse(String provider, HttpResponse res) {
        String errorMessage = 'API Error (' + res.getStatusCode() + '): ';
        
        try {
            Map<String, Object> errorBody = (Map<String, Object>)JSON.deserializeUntyped(res.getBody());
            
            if (provider == 'OpenAI' || provider == 'OpenRouter') {
                Map<String, Object> error = (Map<String, Object>)errorBody.get('error');
                if (error != null) {
                    errorMessage += (String)error.get('message');
                }
            } else if (provider == 'Anthropic') {
                Map<String, Object> error = (Map<String, Object>)errorBody.get('error');
                if (error != null) {
                    errorMessage += (String)error.get('message');
                }
            } else if (provider == 'Google') {
                List<Object> errors = (List<Object>)errorBody.get('error');
                if (errors != null && !errors.isEmpty()) {
                    Map<String, Object> firstError = (Map<String, Object>)errors[0];
                    errorMessage += (String)firstError.get('message');
                }
            }
        } catch (Exception e) {
            errorMessage += res.getBody();
        }
        
        throw new LLMException(errorMessage);
    }
    
    public class LLMException extends Exception {}
}