/**
 * @description Core service class for permit application business logic
 * Combines requirements from both Codex's technical analysis and Claude's enhancements
 * NO FLOW - All orchestration via Apex
 */
public with sharing class Nuvi_Permit_ApplicationService {
    
    // Constants for application stages
    public static final String STAGE_DRAFT = 'Draft';
    public static final String STAGE_SUBMITTED = 'Submitted';
    public static final String STAGE_INTAKE_REVIEW = 'Intake Review';
    public static final String STAGE_COMPLETENESS_CHECK = 'Completeness Check';
    public static final String STAGE_TECHNICAL_REVIEW = 'Technical Review';
    public static final String STAGE_ENVIRONMENTAL_REVIEW = 'Environmental Review';
    public static final String STAGE_PUBLIC_COMMENT = 'Public Comment';
    public static final String STAGE_FINAL_REVIEW = 'Final Review';
    public static final String STAGE_APPROVED = 'Approved';
    public static final String STAGE_DENIED = 'Denied';
    public static final String STAGE_WITHDRAWN = 'Withdrawn';
    
    /**
     * @description Submit an application and trigger initial workflow
     * @param applicationId The APD Application record Id
     * @return OperationResult with success status and any messages
     */
    public static OperationResult submitApplication(Id applicationId) {
        OperationResult result = new OperationResult();
        
        try {
            // Validate application completeness
            ValidationResult validation = validateApplication(applicationId);
            if (!validation.isValid) {
                result.success = false;
                result.messages = validation.errors;
                return result;
            }
            
            // Calculate fees
            Decimal feeAmount = calculateApplicationFees(applicationId);
            
            // Update application status and fee
            APD_Application__c app = new APD_Application__c(
                Id = applicationId,
                Status__c = STAGE_SUBMITTED,
                Fee_Amount__c = feeAmount,
                Submission_Date__c = System.today()
            );
            
            // Check CRUD permissions
            if (!Schema.sObjectType.APD_Application__c.isUpdateable()) {
                throw new InsufficientPermissionsException('Insufficient permissions to update application');
            }
            
            update Security.stripInaccessible(AccessType.UPDATABLE, new List<APD_Application__c>{app}).getRecords();
            
            // Create intake review task
            createIntakeReviewTask(applicationId);
            
            // Send notifications via Platform Events
            publishStatusChangeEvent(applicationId, STAGE_DRAFT, STAGE_SUBMITTED);
            
            // AI Analysis for immediate feedback (best-effort, non-blocking)
            try {
                Nuvi_Permit_AIController.performPermitAnalysis(String.valueOf(applicationId), 'DEFAULT', 'FEDERAL');
            } catch (Exception aiEx) {
                System.debug('AI analysis skipped: ' + aiEx.getMessage());
            }
            
            result.success = true;
            result.messages.add('Application submitted successfully. Fee amount: $' + feeAmount);
            
        } catch (Exception e) {
            result.success = false;
            result.messages.add('Error submitting application: ' + e.getMessage());
            logError('submitApplication', e);
        }
        
        return result;
    }
    
    /**
     * @description Validate application completeness based on permit type
     * @param applicationId The APD Application record Id
     * @return ValidationResult with validation status and errors
     */
    public static ValidationResult validateApplication(Id applicationId) {
        ValidationResult result = new ValidationResult();
        result.isValid = true;
        
        // Query application with related records
        APD_Application__c app = [
            SELECT Id, Status__c, Operator__c, Lease_Number__c, Lease_Type__c,
                   Bond_Number__c, Bond_Type__c, County__c, State_Location__c,
                   Elevation_MSL__c, Latitude__c, Longitude__c,
                   (SELECT Id FROM Well_Information__r),
                   (SELECT Id FROM Drilling_Plans__r),
                   (SELECT Id FROM Surface_Use_Plans__r)
            FROM APD_Application__c
            WHERE Id = :applicationId
            LIMIT 1
        ];
        
        // Required field validations
        if (String.isBlank(app.Operator__c)) {
            result.isValid = false;
            result.errors.add('Operator information is required');
        }
        
        if (String.isBlank(app.Lease_Number__c)) {
            result.isValid = false;
            result.errors.add('Lease number is required');
        }
        
        if (String.isBlank(app.Bond_Number__c) || String.isBlank(app.Bond_Type__c)) {
            result.isValid = false;
            result.errors.add('Bond information is required');
        }
        
        // Related record validations
        if (app.Well_Information__r.isEmpty()) {
            result.isValid = false;
            result.errors.add('At least one well must be defined');
        }
        
        if (app.Drilling_Plans__r.isEmpty()) {
            result.isValid = false;
            result.errors.add('Drilling plan is required');
        }
        
        if (app.Surface_Use_Plans__r.isEmpty()) {
            result.isValid = false;
            result.errors.add('Surface use plan is required');
        }
        
        return result;
    }
    
    /**
     * @description Calculate application fees based on permit characteristics
     */
    public static Decimal calculateApplicationFees(Id applicationId) {
        // For demo: flat $250 fee; extend based on permit type/complexity
        return 250;
    }
    
    /**
     * @description Advance application through workflow stages
     */
    public static OperationResult advanceApplication(Id applicationId, String nextStage) {
        OperationResult result = new OperationResult();
        try {
            // Get current application
            APD_Application__c app = [SELECT Id, Status__c FROM APD_Application__c WHERE Id = :applicationId LIMIT 1];
            String currentStage = app.Status__c;
            
            // Update status
            app.Status__c = nextStage;
            update Security.stripInaccessible(AccessType.UPDATABLE, new List<APD_Application__c>{app}).getRecords();
            
            // Create stage-specific tasks
            if (nextStage == STAGE_INTAKE_REVIEW) {
                createIntakeReviewTask(applicationId);
            } else if (nextStage == STAGE_COMPLETENESS_CHECK) {
                createCompletenessCheckTasks(applicationId);
            } else if (nextStage == STAGE_TECHNICAL_REVIEW) {
                createSpecialistReviewTasks(applicationId);
            } else if (nextStage == STAGE_ENVIRONMENTAL_REVIEW) {
                createEnvironmentalReviewTasks(applicationId);
            } else if (nextStage == STAGE_PUBLIC_COMMENT) {
                initiatePublicCommentPeriod(applicationId);
            }
            
            // Publish status change event
            publishStatusChangeEvent(applicationId, currentStage, nextStage);
            
            result.success = true;
            result.messages.add('Application advanced to ' + nextStage);
        } catch (Exception e) {
            result.success = false;
            result.messages.add('Error advancing application: ' + e.getMessage());
            logError('advanceApplication', e);
        }
        return result;
    }
    
    /**
     * @description Create initial intake review task
     */
    private static void createIntakeReviewTask(Id applicationId) {
        Task reviewTask = new Task(
            WhatId = applicationId,
            Subject = 'Intake Review',
            ActivityDate = System.today().addDays(7),
            Priority = 'High',
            Status = 'Not Started'
        );
        insert Security.stripInaccessible(AccessType.CREATABLE, new List<Task>{reviewTask}).getRecords();
    }
    
    /**
     * @description Create tasks for completeness check stage
     */
    private static void createCompletenessCheckTasks(Id applicationId) {
        List<Task> tasks = new List<Task>();
        tasks.add(new Task(
            WhatId = applicationId,
            Subject = 'Verify bond information',
            ActivityDate = System.today().addDays(5),
            Priority = 'Normal',
            Status = 'Not Started'
        ));
        tasks.add(new Task(
            WhatId = applicationId,
            Subject = 'Check surface use plan completeness',
            ActivityDate = System.today().addDays(5),
            Priority = 'Normal',
            Status = 'Not Started'
        ));
        insert Security.stripInaccessible(AccessType.CREATABLE, tasks).getRecords();
    }
    
    /**
     * @description Create specialist review tasks for technical review
     * @param applicationId Application record Id
     */
    private static void createSpecialistReviewTasks(Id applicationId) {
        List<Task> tasks = new List<Task>();
        
        // Based on Codex's analysis - create parallel review tasks
        List<String> specialistTypes = new List<String>{
            'Petroleum Engineer - Well Design Review',
            'Wildlife Biologist - Environmental Impact',
            'Cultural Resource Specialist - Heritage Sites',
            'Air/Noise Specialist - Emissions Analysis'
        };
        
        for (String specialistType : specialistTypes) {
            tasks.add(new Task(
                WhatId = applicationId,
                Subject = specialistType,
                ActivityDate = System.today().addDays(14), // 14-day SLA from Codex
                Priority = 'Normal',
                Status = 'Not Started'
            ));
        }
        
        insert Security.stripInaccessible(AccessType.CREATABLE, tasks).getRecords();
    }
    
    /**
     * @description Create environmental review tasks
     * @param applicationId Application record Id
     */
    private static void createEnvironmentalReviewTasks(Id applicationId) {
        // Determine NEPA level (from Codex analysis)
        String nepaLevel = determineNEPALevel(applicationId);
        
        Task nepaTask = new Task(
            WhatId = applicationId,
            Subject = 'NEPA ' + nepaLevel + ' Review',
            ActivityDate = nepaLevel == 'EA' ? System.today().addDays(30) : System.today().addDays(60),
            Priority = 'High',
            Status = 'Not Started',
            Description = 'Conduct ' + nepaLevel + ' environmental review'
        );
        
        insert Security.stripInaccessible(AccessType.CREATABLE, new List<Task>{nepaTask}).getRecords();
    }
    
    /**
     * @description Determine NEPA review level based on location and impact
     * @param applicationId Application record Id
     * @return NEPA level (CX, EA, or EIS)
     */
    private static String determineNEPALevel(Id applicationId) {
        // Query application location
        APD_Application__c app = [
            SELECT Id, Latitude__c, Longitude__c, NEPA_Required__c
            FROM APD_Application__c
            WHERE Id = :applicationId
            LIMIT 1
        ];
        
        // Check proximity to protected areas (would integrate with GIS service)
        if (app.NEPA_Required__c) {
            // Near national park or protected area - EA minimum
            return 'EA';
        }
        
        // Default to Categorical Exclusion
        return 'CX';
    }
    
    /**
     * @description Initiate public comment period
     * @param applicationId Application record Id
     */
    private static void initiatePublicCommentPeriod(Id applicationId) {
        // Create public comment record
        // This would integrate with Experience Cloud portal
        
        // Placeholder: track public comment period via a Task until fields are added
        Task t = new Task(
            WhatId = applicationId,
            Subject = 'Public Comment Period Started',
            ActivityDate = System.today().addDays(14),
            Status = 'Not Started',
            Priority = 'Low'
        );
        insert Security.stripInaccessible(AccessType.CREATABLE, new List<Task>{ t }).getRecords();
    }
    
    /**
     * @description Publish Platform Event for status change
     * @param applicationId Application record Id
     * @param oldStatus Previous status
     * @param newStatus New status
     */
    private static void publishStatusChangeEvent(Id applicationId, String oldStatus, String newStatus) {
        Nuvi_Permit_StatusEventPublisher.publishStatusChange(applicationId, newStatus, (oldStatus==null ? '' : ('Changed from ' + oldStatus)));
    }
    
    /**
     * @description Log errors for monitoring
     * @param methodName Method where error occurred
     * @param e Exception to log
     */
    private static void logError(String methodName, Exception e) {
        System.debug(LoggingLevel.ERROR, 'Error in ' + methodName + ': ' + e.getMessage());
        System.debug(LoggingLevel.ERROR, 'Stack trace: ' + e.getStackTraceString());
        
        // Could also insert into custom error log object
    }
    
    /**
     * @description Result wrapper for operations
     */
    public class OperationResult {
        @AuraEnabled public Boolean success {get; set;}
        @AuraEnabled public List<String> messages {get; set;}
        
        public OperationResult() {
            this.success = false;
            this.messages = new List<String>();
        }
    }
    
    /**
     * @description Validation result wrapper
     */
    public class ValidationResult {
        @AuraEnabled public Boolean isValid {get; set;}
        @AuraEnabled public List<String> errors {get; set;}
        
        public ValidationResult() {
            this.isValid = true;
            this.errors = new List<String>();
        }
    }
    
    /**
     * @description Custom exception for insufficient permissions
     */
    public class InsufficientPermissionsException extends Exception {}
}