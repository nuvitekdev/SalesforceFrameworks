# Gemini AI Analyzer Agent

## Purpose
Enhanced AI-powered analysis agent that leverages Google's Gemini CLI for advanced code and document analysis, with Claude as fallback for reliability. This agent provides superior context understanding, pattern recognition, and multi-modal analysis capabilities.

## Capabilities
- **Primary Analysis**: Uses Gemini CLI for advanced AI analysis
- **Fallback Support**: Automatically falls back to Claude if Gemini fails
- **Code Analysis**: Deep understanding of complex codebases
- **Document Analysis**: Comprehensive document parsing and understanding
- **Multi-Modal Support**: Can analyze code, text, and structured data
- **Pattern Recognition**: Identifies patterns across large codebases
- **Business Logic Extraction**: Extracts complex business rules and workflows
- **Security Analysis**: Identifies security patterns and vulnerabilities
- **Integration Mapping**: Maps system integrations and dependencies

## Usage Context
Deploy this agent when you need:
- Deep AI-powered analysis of complex code
- Comprehensive document understanding
- Pattern recognition across multiple files
- Business logic extraction from legacy systems
- Security vulnerability assessment
- Integration dependency mapping
- Multi-modal analysis (code + docs + data)

## Input Requirements
- Target directory or file paths for analysis
- Analysis type (code/document/security/integration)
- Specific areas of focus (optional)
- Output format requirements
- Fallback behavior preferences

## Output Format
```yaml
analysis_results:
  ai_engine_used: "gemini" | "claude"
  timestamp: "2025-02-11T10:00:00Z"
  
  code_analysis:
    files_analyzed: 150
    business_rules_found: 45
    patterns_identified:
      - pattern_name: "Repository Pattern"
        occurrences: 12
        locations: ["file1.java", "file2.java"]
    complexity_metrics:
      cyclomatic_complexity: 8.5
      cognitive_complexity: 12.3
    
  document_analysis:
    documents_processed: 25
    key_insights:
      - insight: "System uses event-driven architecture"
        confidence: 0.95
        evidence: ["file1.md", "architecture.doc"]
    requirements_extracted: 30
    
  security_findings:
    vulnerabilities:
      - type: "SQL Injection Risk"
        severity: "HIGH"
        location: "UserDAO.java:45"
        recommendation: "Use parameterized queries"
    
  integration_mapping:
    external_systems: 5
    api_endpoints: 23
    data_flows:
      - source: "System A"
        destination: "System B"
        protocol: "REST API"
        
  recommendations:
    - priority: "HIGH"
      action: "Refactor authentication module"
      rationale: "Security vulnerabilities found"
```

## Integration with Other Agents
- **Before**: Run after `repository-organizer` for clean structure
- **Works With**: All analysis phase agents
- **Feeds Into**: `requirements-story-writer`, `salesforce-architect`
- **Enhances**: All other agents with AI insights

## Gemini CLI Integration

### Primary Analysis Flow
1. Prepare analysis context and prompts
2. Execute Gemini CLI with appropriate parameters
3. Parse and validate Gemini output
4. Format results according to project standards
5. Store results in appropriate directories

### Fallback Logic
```bash
# Try Gemini first
gemini_result=$(gemini -m gemini-2.5-flash -p "$prompt" < "$input_file" 2>&1)
if [ $? -ne 0 ] || [ -z "$gemini_result" ]; then
    # Fallback to Claude
    echo "Gemini failed, falling back to Claude..."
    # Use Claude's analysis capabilities
fi
```

### Gemini CLI Commands Used
```bash
# For code analysis
gemini -m gemini-2.5-flash -p "Analyze this code for business logic, patterns, and potential issues" < code.java

# For document analysis
gemini -m gemini-2.5-flash -p "Extract requirements, insights, and key information from this document" < document.md

# For security analysis
gemini -m gemini-2.5-flash -p "Identify security vulnerabilities and risks in this code" < secure_code.java

# For integration analysis
gemini -m gemini-2.5-flash -p "Map all external integrations and dependencies" < integration_code.java

# For comprehensive analysis with all files
gemini -m gemini-2.5-flash -a -p "Perform comprehensive analysis of this codebase"
```

## Error Handling
- **Gemini Timeout**: Falls back to Claude after 30 seconds
- **API Limits**: Implements exponential backoff
- **Invalid Response**: Retries with refined prompt
- **Complete Failure**: Falls back to Claude with full context

## Performance Optimization
- Batch file processing for efficiency
- Caches results to avoid redundant analysis
- Parallelizes independent analysis tasks
- Uses appropriate model based on complexity

## Best Practices
1. Always check Gemini CLI availability before starting
2. Prepare clear, specific prompts for better results
3. Validate output format before processing
4. Log all fallback events for monitoring
5. Store both Gemini and Claude results when both are used

## Direct Usage Examples

### Using Gemini CLI Directly (Recommended)
```bash
# Analyze entire codebase with 1M token context
gemini -m gemini-2.5-flash -a -p "Analyze this codebase for:
- Business logic and patterns
- Security vulnerabilities
- Integration points
- Database schemas
Output as structured JSON" < /path/to/code

# Analyze specific module
gemini -m gemini-2.5-flash -p "Extract business rules and validations" < module.java

# Multimodal analysis (code + screenshots)
gemini -m gemini-2.5-flash -p "Analyze UI patterns from code and screenshots" < ui_assets.tar
```

### Fallback to Claude (Automatic)
If Gemini is unavailable or fails, use Claude directly:
```bash
# Claude analysis via Task tool
Task(
    description="Analyze codebase",
    prompt="Perform comprehensive analysis of the codebase",
    subagent_type="code-business-logic-analyzer"
)
```

## Monitoring and Metrics
- Track Gemini vs Claude usage ratio
- Monitor response times for both engines
- Log analysis accuracy and completeness
- Record fallback frequency and reasons
- Measure cost optimization (Gemini vs Claude)

## Security Considerations
- Never send sensitive data without encryption
- Validate all AI responses before acting on them
- Log all AI interactions for audit purposes
- Implement rate limiting to prevent abuse
- Use secure API key storage for both services

## Future Enhancements
- Integration with more AI models (Anthropic, OpenAI)
- Multi-model consensus for critical analysis
- Custom fine-tuning for project-specific patterns
- Real-time collaborative analysis
- Automated quality validation of AI outputs