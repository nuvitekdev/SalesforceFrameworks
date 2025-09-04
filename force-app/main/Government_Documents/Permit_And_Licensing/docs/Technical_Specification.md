# DOI Permits and Licensing System - Technical Implementation Specification

## Executive Summary

This technical specification provides comprehensive implementation guidance for the DOI Permits and Licensing system built on Salesforce Platform. The system transforms the traditional APD processing workflow from a 30+ day manual process into an AI-enhanced, streamlined digital platform that reduces Time-to-Delivery (TTD) while maintaining full regulatory compliance.

## Implementation Overview

### Technology Stack
- **Platform**: Salesforce Lightning Web Runtime (LWR)
- **Frontend**: Lightning Web Components (LWC)
- **Backend**: Apex Classes and Triggers
- **Data Layer**: Custom Objects with Enterprise Data Model
- **Integration**: REST/SOAP APIs, Platform Events
- **AI Services**: Salesforce Einstein Platform + External AI APIs
- **Security**: Platform-native security with government compliance extensions

### Development Structure
```
force-app/main/Government_Documents/Permit_And_Licensing/
├── applications/           # Core permit application processing
├── workflows/              # Multi-agency review workflows  
├── users/                  # Role-based user management
├── documents/              # AI-powered document management
├── ai-services/            # AI integration and processing
├── nepa-assessment/        # Environmental review workflows
├── public-portal/          # Operator-facing interfaces
├── dashboards/             # Analytics and reporting
├── integrations/           # External system connections
├── payments/               # Financial processing
├── gis-mapping/            # Geospatial analysis
├── scheduling/             # Calendar and field visits
├── notifications/          # Communication systems
└── shared-utilities/       # Common components
```

## Core Object Implementation

### 1. APD Application Object (APD_Application__c)

#### Object Definition
```xml
<?xml version="1.0" encoding="UTF-8"?>
<CustomObject xmlns="http://soap.sforce.com/2006/04/metadata">
    <label>APD Application</label>
    <pluralLabel>APD Applications</pluralLabel>
    <nameField>
        <displayFormat>APD-{YYYY}-{000000}</displayFormat>
        <type>AutoNumber</type>
    </nameField>
    <deploymentStatus>Deployed</deploymentStatus>
    <enableActivities>true</enableActivities>
    <enableHistory>true</enableHistory>
    <enableReports>true</enableReports>
    <enableSearch>true</enableSearch>
    <recordTypes>
        <fullName>Standard_APD</fullName>
        <label>Standard APD</label>
        <active>true</active>
    </recordTypes>
    <recordTypes>
        <fullName>High_Risk_APD</fullName>
        <label>High Risk APD</label>
        <active>true</active>
    </recordTypes>
</CustomObject>
```

#### Key Fields Implementation
```apex
// Status Management
DOI_PAL_Status__c (Picklist)
- Values: Draft, Submitted, Initial_Review, Specialist_Review, 
  Field_Visit_Pending, EA_Development, Public_Comment, 
  Final_Review, Approved, Denied, Withdrawn

// Geographic Information  
DOI_PAL_Latitude__c (Number(10,6))
DOI_PAL_Longitude__c (Number(10,6))
DOI_PAL_PLSS_Description__c (Text(255))
DOI_PAL_County__c (Text(100))
DOI_PAL_State__c (Picklist - US States)

// Business Information
DOI_PAL_Operator__c (Lookup to Operator__c)
DOI_PAL_Lease_Number__c (Text(50))
DOI_PAL_Well_Count__c (Number(2,0))
DOI_PAL_Fee_Amount__c (Currency(10,2)) - Default: $12,515

// AI Analysis Results
DOI_PAL_AI_Risk_Score__c (Number(3,2)) - 0.00 to 10.00
DOI_PAL_Proximity_Alerts__c (Multi-Select Picklist)
- Values: National_Park, Wilderness_Area, Cultural_Site, 
  Tribal_Land, Wildlife_Refuge, Water_Source

// Workflow Management
DOI_PAL_Assigned_Field_Office__c (Text(100))
DOI_PAL_Primary_Reviewer__c (Lookup to User)
DOI_PAL_SLA_Status__c (Formula Field)
- Formula: IF(Target_Decision_Date__c < TODAY(), "Overdue", 
  IF(Target_Decision_Date__c <= TODAY() + 3, "At_Risk", "On_Track"))
```

### 2. Workflow Task Object (APD_Review_Task__c)

#### Apex Class for Task Management
```apex
public with sharing class DOI_PAL_TaskManager {
    
    // Create initial review tasks for new APD
    public static void createInitialReviewTasks(Id apdId) {
        List<APD_Review_Task__c> tasks = new List<APD_Review_Task__c>();
        
        // Initial completeness review
        tasks.add(new APD_Review_Task__c(
            DOI_PAL_APD_Application__c = apdId,
            DOI_PAL_Task_Type__c = 'Initial_Review',
            DOI_PAL_Assigned_Role__c = 'Natural_Resource_Specialist',
            DOI_PAL_Due_Date__c = Date.today().addBusinessDays(5),
            DOI_PAL_Priority__c = 'High',
            DOI_PAL_Status__c = 'Pending'
        ));
        
        insert tasks;
    }
    
    // Create specialist review tasks based on proximity analysis
    public static void createSpecialistReviews(Id apdId, Set<String> requiredReviews) {
        List<APD_Review_Task__c> tasks = new List<APD_Review_Task__c>();
        Date dueDate = Date.today().addBusinessDays(14);
        
        for(String reviewType : requiredReviews) {
            tasks.add(new APD_Review_Task__c(
                DOI_PAL_APD_Application__c = apdId,
                DOI_PAL_Task_Type__c = 'Specialist_Review',
                DOI_PAL_Assigned_Role__c = reviewType,
                DOI_PAL_Due_Date__c = dueDate,
                DOI_PAL_Priority__c = 'Standard',
                DOI_PAL_Status__c = 'Pending'
            ));
        }
        
        insert tasks;
    }
    
    // Auto-assign tasks to available reviewers
    @future
    public static void autoAssignTasks(Set<Id> taskIds) {
        Map<String, List<User>> roleToUsers = getUsersByRole();
        List<APD_Review_Task__c> tasksToUpdate = new List<APD_Review_Task__c>();
        
        for(APD_Review_Task__c task : [
            SELECT Id, DOI_PAL_Assigned_Role__c, DOI_PAL_Assigned_User__c
            FROM APD_Review_Task__c 
            WHERE Id IN :taskIds AND DOI_PAL_Assigned_User__c = null
        ]) {
            User assignedUser = getNextAvailableUser(
                roleToUsers.get(task.DOI_PAL_Assigned_Role__c)
            );
            if(assignedUser != null) {
                task.DOI_PAL_Assigned_User__c = assignedUser.Id;
                task.DOI_PAL_Status__c = 'Assigned';
                tasksToUpdate.add(task);
            }
        }
        
        update tasksToUpdate;
    }
    
    // Helper method to balance workload across reviewers
    private static User getNextAvailableUser(List<User> availableUsers) {
        if(availableUsers?.isEmpty() != false) return null;
        
        // Query current workload for each user
        Map<Id, Integer> userWorkload = new Map<Id, Integer>();
        for(AggregateResult ar : [
            SELECT DOI_PAL_Assigned_User__c userId, COUNT(Id) taskCount
            FROM APD_Review_Task__c 
            WHERE DOI_PAL_Assigned_User__c IN :availableUsers
            AND DOI_PAL_Status__c IN ('Assigned', 'In_Progress')
            GROUP BY DOI_PAL_Assigned_User__c
        ]) {
            userWorkload.put((Id)ar.get('userId'), (Integer)ar.get('taskCount'));
        }
        
        // Find user with lowest workload
        User selectedUser = availableUsers[0];
        Integer lowestWorkload = userWorkload.get(selectedUser.Id) ?? 0;
        
        for(User user : availableUsers) {
            Integer workload = userWorkload.get(user.Id) ?? 0;
            if(workload < lowestWorkload) {
                selectedUser = user;
                lowestWorkload = workload;
            }
        }
        
        return selectedUser;
    }
}
```

## AI Services Implementation

### 1. Document Analysis Service

#### Apex Integration with External AI
```apex
public with sharing class DOI_PAL_AIDocumentProcessor {
    
    private static final String AI_ENDPOINT = 'https://api.government-ai.gov/document-analysis';
    
    // Process uploaded document with AI validation
    @future(callout=true)
    public static void processDocument(Id documentId) {
        try {
            APD_Document__c document = [
                SELECT Id, DOI_PAL_File_Name__c, DOI_PAL_File_Content__c,
                       DOI_PAL_Document_Type__c, DOI_PAL_APD_Application__c
                FROM APD_Document__c 
                WHERE Id = :documentId
            ];
            
            // Call AI service for analysis
            AIAnalysisResult result = callAIAnalysisService(document);
            
            // Update document with AI results
            document.DOI_PAL_AI_Validation_Status__c = result.validationStatus;
            document.DOI_PAL_AI_Summary__c = result.summary;
            document.DOI_PAL_Confidence_Score__c = result.confidenceScore;
            document.DOI_PAL_Issues_Found__c = String.join(result.issues, ';');
            
            update document;
            
            // Create follow-up tasks if issues found
            if(result.hasIssues) {
                createValidationTask(document.DOI_PAL_APD_Application__c, result);
            }
            
        } catch(Exception e) {
            // Log error and create manual review task
            System.debug('AI processing failed: ' + e.getMessage());
            createManualReviewTask(documentId);
        }
    }
    
    // AI service callout
    private static AIAnalysisResult callAIAnalysisService(APD_Document__c document) {
        HttpRequest request = new HttpRequest();
        request.setEndpoint(AI_ENDPOINT);
        request.setMethod('POST');
        request.setHeader('Authorization', 'Bearer ' + getAIServiceToken());
        request.setHeader('Content-Type', 'application/json');
        
        Map<String, Object> requestBody = new Map<String, Object>{
            'documentType' => document.DOI_PAL_Document_Type__c,
            'fileName' => document.DOI_PAL_File_Name__c,
            'content' => EncodingUtil.base64Encode(document.DOI_PAL_File_Content__c),
            'validationRules' => getValidationRules(document.DOI_PAL_Document_Type__c)
        };
        
        request.setBody(JSON.serialize(requestBody));
        
        Http http = new Http();
        HttpResponse response = http.send(request);
        
        if(response.getStatusCode() == 200) {
            return (AIAnalysisResult)JSON.deserialize(
                response.getBody(), 
                AIAnalysisResult.class
            );
        } else {
            throw new CalloutException('AI service error: ' + response.getBody());
        }
    }
    
    // Get document-specific validation rules
    private static Map<String, Object> getValidationRules(String documentType) {
        switch on documentType {
            when 'Drilling_Plan' {
                return new Map<String, Object>{
                    'requiredSections' => new List<String>{
                        'Wellbore Design', 'Casing Program', 'Cement Program',
                        'BOP Configuration', 'Mud Program'
                    },
                    'technicalChecks' => new List<String>{
                        'CasingDepthConsistency', 'PressureRatings', 'SafetyFactors'
                    }
                };
            }
            when 'SUPO' {
                return new Map<String, Object>{
                    'requiredSections' => new List<String>{
                        'Access Roads', 'Facilities Layout', 'Reclamation Plan',
                        'Water Sources', 'Waste Management'
                    },
                    'environmentalChecks' => new List<String>{
                        'WildlifeProtection', 'SoilErosion', 'VegetationRestore'
                    }
                };
            }
            when else {
                return new Map<String, Object>{
                    'basicValidation' => true
                };
            }
        }
    }
    
    // AI result wrapper class
    public class AIAnalysisResult {
        public String validationStatus;
        public String summary;
        public Decimal confidenceScore;
        public List<String> issues;
        public Boolean hasIssues;
        public Map<String, Object> extractedData;
    }
}
```

### 2. Geospatial Analysis Service

#### GIS Integration for Proximity Analysis
```apex
public with sharing class DOI_PAL_GISAnalyzer {
    
    private static final String GIS_ENDPOINT = 'https://api.usgs.gov/gis/proximity-analysis';
    
    // Analyze proximity to sensitive areas
    @future(callout=true)
    public static void analyzeProximity(Id apdId) {
        try {
            APD_Application__c apd = [
                SELECT Id, DOI_PAL_Latitude__c, DOI_PAL_Longitude__c,
                       DOI_PAL_County__c, DOI_PAL_State__c
                FROM APD_Application__c 
                WHERE Id = :apdId
            ];
            
            ProximityAnalysisResult result = performProximityAnalysis(
                apd.DOI_PAL_Latitude__c, 
                apd.DOI_PAL_Longitude__c
            );
            
            // Update APD with proximity results
            apd.DOI_PAL_Proximity_Alerts__c = String.join(result.alerts, ';');
            apd.DOI_PAL_AI_Risk_Score__c = calculateRiskScore(result);
            apd.DOI_PAL_NEPA_Level_Recommendation__c = recommendNEPALevel(result);
            
            update apd;
            
            // Create required review tasks based on proximity
            createProximityBasedTasks(apdId, result);
            
        } catch(Exception e) {
            System.debug('GIS analysis failed: ' + e.getMessage());
            // Fall back to manual review
            createManualGISReview(apdId);
        }
    }
    
    // Call external GIS service
    private static ProximityAnalysisResult performProximityAnalysis(
        Decimal latitude, Decimal longitude
    ) {
        HttpRequest request = new HttpRequest();
        request.setEndpoint(GIS_ENDPOINT + '/analyze');
        request.setMethod('POST');
        request.setHeader('Authorization', 'Bearer ' + getGISServiceToken());
        request.setHeader('Content-Type', 'application/json');
        
        Map<String, Object> requestBody = new Map<String, Object>{
            'latitude' => latitude,
            'longitude' => longitude,
            'analysisLayers' => new List<String>{
                'national_parks', 'wilderness_areas', 'cultural_sites',
                'tribal_lands', 'wildlife_refuges', 'water_sources'
            },
            'bufferDistances' => new Map<String, Integer>{
                'national_parks' => 5280 * 5, // 5 miles in feet
                'cultural_sites' => 5280 * 1,  // 1 mile
                'tribal_lands' => 5280 * 25    // 25 miles
            }
        };
        
        request.setBody(JSON.serialize(requestBody));
        
        Http http = new Http();
        HttpResponse response = http.send(request);
        
        if(response.getStatusCode() == 200) {
            return (ProximityAnalysisResult)JSON.deserialize(
                response.getBody(),
                ProximityAnalysisResult.class
            );
        } else {
            throw new CalloutException('GIS service error: ' + response.getBody());
        }
    }
    
    // Calculate composite risk score
    private static Decimal calculateRiskScore(ProximityAnalysisResult result) {
        Decimal score = 0.0;
        
        // Base scoring algorithm
        for(ProximityAlert alert : result.proximityAlerts) {
            switch on alert.layerType {
                when 'national_parks' {
                    score += (alert.distance < 2640) ? 3.0 : 1.5; // Within 0.5 miles = high risk
                }
                when 'cultural_sites' {
                    score += (alert.distance < 1000) ? 2.5 : 1.0;
                }
                when 'tribal_lands' {
                    score += (alert.distance < 5280) ? 2.0 : 0.5;
                }
                when 'wilderness_areas' {
                    score += 2.5;
                }
                when 'wildlife_refuges' {
                    score += 1.5;
                }
            }
        }
        
        return Math.min(score, 10.0); // Cap at 10.0
    }
    
    // Recommend NEPA analysis level
    private static String recommendNEPALevel(ProximityAnalysisResult result) {
        Boolean hasNationalPark = false;
        Boolean hasWilderness = false;
        Boolean hasCulturalSite = false;
        
        for(ProximityAlert alert : result.proximityAlerts) {
            if(alert.layerType == 'national_parks') hasNationalPark = true;
            if(alert.layerType == 'wilderness_areas') hasWilderness = true;
            if(alert.layerType == 'cultural_sites' && alert.distance < 1000) hasCulturalSite = true;
        }
        
        if(hasWilderness || (hasNationalPark && hasCulturalSite)) {
            return 'EIS'; // Environmental Impact Statement
        } else if(hasNationalPark || hasCulturalSite) {
            return 'EA';  // Environmental Assessment
        } else {
            return 'CX';  // Categorical Exclusion
        }
    }
    
    // Create review tasks based on proximity findings
    private static void createProximityBasedTasks(
        Id apdId, ProximityAnalysisResult result
    ) {
        List<APD_Review_Task__c> tasks = new List<APD_Review_Task__c>();
        
        for(ProximityAlert alert : result.proximityAlerts) {
            switch on alert.layerType {
                when 'national_parks' {
                    tasks.add(createReviewTask(
                        apdId, 'NPS_Environmental_Review', 'NPS_Coordinator'
                    ));
                }
                when 'tribal_lands' {
                    tasks.add(createReviewTask(
                        apdId, 'Tribal_Consultation', 'BIA_Specialist'
                    ));
                }
                when 'cultural_sites' {
                    tasks.add(createReviewTask(
                        apdId, 'Cultural_Resource_Review', 'Cultural_Specialist'
                    ));
                }
            }
        }
        
        if(!tasks.isEmpty()) {
            insert tasks;
        }
    }
    
    // Helper method to create review tasks
    private static APD_Review_Task__c createReviewTask(
        Id apdId, String taskType, String assignedRole
    ) {
        return new APD_Review_Task__c(
            DOI_PAL_APD_Application__c = apdId,
            DOI_PAL_Task_Type__c = taskType,
            DOI_PAL_Assigned_Role__c = assignedRole,
            DOI_PAL_Due_Date__c = Date.today().addBusinessDays(10),
            DOI_PAL_Status__c = 'Pending',
            DOI_PAL_Priority__c = 'High'
        );
    }
    
    // Proximity analysis result classes
    public class ProximityAnalysisResult {
        public List<String> alerts;
        public List<ProximityAlert> proximityAlerts;
        public Map<String, Object> analysisDetails;
    }
    
    public class ProximityAlert {
        public String layerType;
        public String featureName;
        public Decimal distance;
        public String riskLevel;
    }
}
```

## Lightning Web Component Implementation

### 1. APD Application Wizard Component

#### JavaScript Controller
```javascript
// permit-application-wizard.js
import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import submitAPDApplication from '@salesforce/apex/DOI_PAL_ApplicationController.submitApplication';
import validateDocuments from '@salesforce/apex/DOI_PAL_AIDocumentProcessor.validateDocuments';
import calculateFees from '@salesforce/apex/DOI_PAL_PaymentController.calculateFees';

export default class PermitApplicationWizard extends NavigationMixin(LightningElement) {
    @track currentStep = 1;
    @track applicationData = {};
    @track uploadedDocuments = [];
    @track calculatedFees = 0;
    @track validationResults = {};
    @track isProcessing = false;

    // Wizard steps configuration
    get steps() {
        return [
            { id: 1, label: 'Operator Information', completed: this.isStepCompleted(1) },
            { id: 2, label: 'Lease & Location', completed: this.isStepCompleted(2) },
            { id: 3, label: 'Well & Pad Details', completed: this.isStepCompleted(3) },
            { id: 4, label: 'Document Upload', completed: this.isStepCompleted(4) },
            { id: 5, label: 'Review & Submit', completed: this.isStepCompleted(5) }
        ];
    }

    // Step completion validation
    isStepCompleted(stepNumber) {
        switch(stepNumber) {
            case 1:
                return this.applicationData.operatorName && 
                       this.applicationData.contactEmail;
            case 2:
                return this.applicationData.leaseNumber && 
                       this.applicationData.latitude && 
                       this.applicationData.longitude;
            case 3:
                return this.applicationData.wellName && 
                       this.applicationData.wellType;
            case 4:
                return this.uploadedDocuments.length >= 3; // Minimum required docs
            case 5:
                return this.validationResults.allDocumentsValid;
            default:
                return false;
        }
    }

    // Navigate between steps
    handleStepChange(event) {
        const targetStep = parseInt(event.target.dataset.step);
        if(this.canNavigateToStep(targetStep)) {
            this.currentStep = targetStep;
        }
    }

    canNavigateToStep(targetStep) {
        // Can go backwards or to next step if current is completed
        return targetStep <= this.currentStep || 
               this.isStepCompleted(this.currentStep);
    }

    // Handle form data changes
    handleInputChange(event) {
        const field = event.target.dataset.field;
        const value = event.target.value;
        
        this.applicationData = {
            ...this.applicationData,
            [field]: value
        };

        // Real-time validation for critical fields
        if(field === 'latitude' || field === 'longitude') {
            this.validateCoordinates();
        }
    }

    // Coordinate validation and proximity analysis
    async validateCoordinates() {
        if(this.applicationData.latitude && this.applicationData.longitude) {
            try {
                const proximityResults = await this.analyzeProximity(
                    this.applicationData.latitude,
                    this.applicationData.longitude
                );
                
                this.displayProximityAlerts(proximityResults);
                
            } catch(error) {
                console.error('Proximity analysis failed:', error);
            }
        }
    }

    // Document upload handling
    handleDocumentUpload(event) {
        const files = event.target.files;
        for(let file of files) {
            this.processUploadedFile(file);
        }
    }

    async processUploadedFile(file) {
        try {
            // Convert file to base64
            const base64Content = await this.fileToBase64(file);
            
            const documentRecord = {
                fileName: file.name,
                fileContent: base64Content,
                documentType: this.determineDocumentType(file.name),
                uploadDate: new Date().toISOString()
            };

            this.uploadedDocuments.push(documentRecord);
            
            // Trigger AI validation
            this.validateDocument(documentRecord);
            
        } catch(error) {
            this.showToast('Error', 'File upload failed: ' + error.message, 'error');
        }
    }

    // AI document validation
    async validateDocument(document) {
        try {
            const validationResult = await validateDocuments({
                documents: [document]
            });

            // Update validation status
            this.validationResults[document.fileName] = validationResult;
            
            if(validationResult.hasIssues) {
                this.displayValidationIssues(document.fileName, validationResult.issues);
            }
            
        } catch(error) {
            console.error('Document validation failed:', error);
        }
    }

    // Fee calculation
    async calculateApplicationFees() {
        try {
            const feeCalculation = await calculateFees({
                applicationData: this.applicationData,
                documentCount: this.uploadedDocuments.length
            });
            
            this.calculatedFees = feeCalculation.totalAmount;
            
        } catch(error) {
            this.showToast('Error', 'Fee calculation failed', 'error');
        }
    }

    // Final application submission
    async handleSubmit() {
        if(!this.validateCompleteApplication()) {
            return;
        }

        this.isProcessing = true;

        try {
            const submissionResult = await submitAPDApplication({
                applicationData: this.applicationData,
                documents: this.uploadedDocuments,
                feeAmount: this.calculatedFees
            });

            this.showToast(
                'Success', 
                `APD Application ${submissionResult.applicationNumber} submitted successfully!`, 
                'success'
            );

            // Navigate to application status page
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: submissionResult.applicationId,
                    actionName: 'view'
                }
            });

        } catch(error) {
            this.showToast('Error', 'Submission failed: ' + error.body.message, 'error');
        } finally {
            this.isProcessing = false;
        }
    }

    // Validation helpers
    validateCompleteApplication() {
        const requiredFields = [
            'operatorName', 'contactEmail', 'leaseNumber', 
            'latitude', 'longitude', 'wellName', 'wellType'
        ];

        for(let field of requiredFields) {
            if(!this.applicationData[field]) {
                this.showToast('Error', `${field} is required`, 'error');
                return false;
            }
        }

        if(this.uploadedDocuments.length < 3) {
            this.showToast('Error', 'Minimum 3 documents required', 'error');
            return false;
        }

        return true;
    }

    // Utility methods
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
        });
    }

    determineDocumentType(fileName) {
        const lowerName = fileName.toLowerCase();
        if(lowerName.includes('drilling')) return 'Drilling_Plan';
        if(lowerName.includes('supo')) return 'SUPO';
        if(lowerName.includes('survey')) return 'Survey_Plat';
        if(lowerName.includes('bond')) return 'Bonding_Information';
        return 'Other';
    }

    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(event);
    }
}
```

#### HTML Template
```html
<!-- permit-application-wizard.html -->
<template>
    <lightning-card title="APD Application Wizard" icon-name="custom:custom63">
        
        <!-- Progress Indicator -->
        <div class="slds-p-around_medium">
            <lightning-progress-indicator 
                current-step={currentStep} 
                type="path" 
                variant="base">
                <template for:each={steps} for:item="step">
                    <lightning-progress-step 
                        key={step.id}
                        label={step.label} 
                        value={step.id}
                        onclick={handleStepChange}
                        data-step={step.id}
                        class={step.completed}>
                    </lightning-progress-step>
                </template>
            </lightning-progress-indicator>
        </div>

        <!-- Step 1: Operator Information -->
        <template if:true={isStep1}>
            <div class="slds-p-around_medium">
                <h2 class="slds-text-heading_medium">Operator Information</h2>
                
                <div class="slds-grid slds-gutters slds-wrap">
                    <div class="slds-col slds-size_1-of-2">
                        <lightning-input 
                            label="Operator Name" 
                            value={applicationData.operatorName}
                            data-field="operatorName"
                            onchange={handleInputChange}
                            required>
                        </lightning-input>
                    </div>
                    
                    <div class="slds-col slds-size_1-of-2">
                        <lightning-input 
                            label="BLM Operator Number" 
                            value={applicationData.blmOperatorNumber}
                            data-field="blmOperatorNumber"
                            onchange={handleInputChange}>
                        </lightning-input>
                    </div>
                </div>
                
                <!-- Contact Information -->
                <div class="slds-grid slds-gutters slds-wrap">
                    <div class="slds-col slds-size_1-of-2">
                        <lightning-input 
                            label="Contact Name" 
                            value={applicationData.contactName}
                            data-field="contactName"
                            onchange={handleInputChange}
                            required>
                        </lightning-input>
                    </div>
                    
                    <div class="slds-col slds-size_1-of-2">
                        <lightning-input 
                            label="Contact Email" 
                            type="email"
                            value={applicationData.contactEmail}
                            data-field="contactEmail"
                            onchange={handleInputChange}
                            required>
                        </lightning-input>
                    </div>
                </div>
            </div>
        </template>

        <!-- Step 2: Lease & Location -->
        <template if:true={isStep2}>
            <div class="slds-p-around_medium">
                <h2 class="slds-text-heading_medium">Lease & Location Information</h2>
                
                <div class="slds-grid slds-gutters slds-wrap">
                    <div class="slds-col slds-size_1-of-3">
                        <lightning-input 
                            label="Lease Number" 
                            value={applicationData.leaseNumber}
                            data-field="leaseNumber"
                            onchange={handleInputChange}
                            required>
                        </lightning-input>
                    </div>
                    
                    <div class="slds-col slds-size_1-of-3">
                        <lightning-input 
                            label="Latitude" 
                            type="number"
                            step="0.000001"
                            value={applicationData.latitude}
                            data-field="latitude"
                            onchange={handleInputChange}
                            required>
                        </lightning-input>
                    </div>
                    
                    <div class="slds-col slds-size_1-of-3">
                        <lightning-input 
                            label="Longitude" 
                            type="number"
                            step="0.000001"
                            value={applicationData.longitude}
                            data-field="longitude"
                            onchange={handleInputChange}
                            required>
                        </lightning-input>
                    </div>
                </div>

                <!-- Proximity Alerts -->
                <template if:true={proximityAlerts}>
                    <div class="slds-m-top_medium">
                        <lightning-card title="Environmental Proximity Alerts" icon-name="utility:warning">
                            <template for:each={proximityAlerts} for:item="alert">
                                <div key={alert.id} class="slds-p-horizontal_medium slds-p-vertical_small">
                                    <lightning-badge 
                                        label={alert.type} 
                                        variant="warning">
                                    </lightning-badge>
                                    <span class="slds-m-left_small">{alert.description}</span>
                                </div>
                            </template>
                        </lightning-card>
                    </div>
                </template>
            </div>
        </template>

        <!-- Step 3: Well & Pad Details -->
        <template if:true={isStep3}>
            <div class="slds-p-around_medium">
                <h2 class="slds-text-heading_medium">Well & Pad Information</h2>
                
                <div class="slds-grid slds-gutters slds-wrap">
                    <div class="slds-col slds-size_1-of-2">
                        <lightning-input 
                            label="Well Name" 
                            value={applicationData.wellName}
                            data-field="wellName"
                            onchange={handleInputChange}
                            required>
                        </lightning-input>
                    </div>
                    
                    <div class="slds-col slds-size_1-of-2">
                        <lightning-combobox 
                            label="Well Type"
                            value={applicationData.wellType}
                            placeholder="Select well type..."
                            options={wellTypeOptions}
                            data-field="wellType"
                            onchange={handleInputChange}
                            required>
                        </lightning-combobox>
                    </div>
                </div>

                <div class="slds-grid slds-gutters slds-wrap">
                    <div class="slds-col slds-size_1-of-3">
                        <lightning-input 
                            label="Measured Depth (MD)" 
                            type="number"
                            value={applicationData.measuredDepth}
                            data-field="measuredDepth"
                            onchange={handleInputChange}>
                        </lightning-input>
                    </div>
                    
                    <div class="slds-col slds-size_1-of-3">
                        <lightning-input 
                            label="True Vertical Depth (TVD)" 
                            type="number"
                            value={applicationData.trueVerticalDepth}
                            data-field="trueVerticalDepth"
                            onchange={handleInputChange}>
                        </lightning-input>
                    </div>
                    
                    <div class="slds-col slds-size_1-of-3">
                        <lightning-combobox 
                            label="Well Orientation"
                            value={applicationData.wellOrientation}
                            placeholder="Select orientation..."
                            options={wellOrientationOptions}
                            data-field="wellOrientation"
                            onchange={handleInputChange}>
                        </lightning-combobox>
                    </div>
                </div>
            </div>
        </template>

        <!-- Step 4: Document Upload -->
        <template if:true={isStep4}>
            <div class="slds-p-around_medium">
                <h2 class="slds-text-heading_medium">Required Documents</h2>
                
                <!-- File Upload Zone -->
                <div class="slds-file-selector slds-file-selector_files">
                    <div class="slds-file-selector__dropzone">
                        <input 
                            type="file" 
                            multiple 
                            accept=".pdf,.doc,.docx,.xls,.xlsx"
                            onchange={handleDocumentUpload}
                            class="slds-file-selector__input slds-assistive-text"
                            id="file-upload">
                        <label class="slds-file-selector__body" for="file-upload">
                            <span class="slds-file-selector__button slds-button slds-button_neutral">
                                <lightning-icon icon-name="utility:upload" size="x-small"></lightning-icon>
                                Upload Files
                            </span>
                            <span class="slds-file-selector__text slds-medium-show">
                                or drop files here
                            </span>
                        </label>
                    </div>
                </div>

                <!-- Document List -->
                <template if:true={uploadedDocuments}>
                    <div class="slds-m-top_medium">
                        <table class="slds-table slds-table_cell-buffer slds-table_bordered">
                            <thead>
                                <tr class="slds-line-height_reset">
                                    <th scope="col">Document Name</th>
                                    <th scope="col">Type</th>
                                    <th scope="col">Status</th>
                                    <th scope="col">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <template for:each={uploadedDocuments} for:item="doc">
                                    <tr key={doc.fileName}>
                                        <td>{doc.fileName}</td>
                                        <td>{doc.documentType}</td>
                                        <td>
                                            <lightning-badge 
                                                label={doc.validationStatus} 
                                                variant={doc.validationVariant}>
                                            </lightning-badge>
                                        </td>
                                        <td>
                                            <lightning-button 
                                                label="Remove" 
                                                onclick={handleRemoveDocument}
                                                data-filename={doc.fileName}
                                                variant="destructive-text">
                                            </lightning-button>
                                        </td>
                                    </tr>
                                </template>
                            </tbody>
                        </table>
                    </div>
                </template>
            </div>
        </template>

        <!-- Step 5: Review & Submit -->
        <template if:true={isStep5}>
            <div class="slds-p-around_medium">
                <h2 class="slds-text-heading_medium">Review & Submit</h2>
                
                <!-- Application Summary -->
                <lightning-card title="Application Summary">
                    <div class="slds-p-around_small">
                        <dl class="slds-list_horizontal slds-wrap">
                            <dt class="slds-item_label slds-text-color_weak">Operator:</dt>
                            <dd class="slds-item_detail">{applicationData.operatorName}</dd>
                            <dt class="slds-item_label slds-text-color_weak">Lease Number:</dt>
                            <dd class="slds-item_detail">{applicationData.leaseNumber}</dd>
                            <dt class="slds-item_label slds-text-color_weak">Well Name:</dt>
                            <dd class="slds-item_detail">{applicationData.wellName}</dd>
                            <dt class="slds-item_label slds-text-color_weak">Location:</dt>
                            <dd class="slds-item_detail">{applicationData.latitude}, {applicationData.longitude}</dd>
                        </dl>
                    </div>
                </lightning-card>

                <!-- Fee Summary -->
                <lightning-card title="Fee Summary" class="slds-m-top_medium">
                    <div class="slds-p-around_small">
                        <div class="slds-grid">
                            <div class="slds-col slds-size_1-of-2">
                                <strong>APD Application Fee:</strong>
                            </div>
                            <div class="slds-col slds-size_1-of-2 slds-text-align_right">
                                <strong>{formattedFeeAmount}</strong>
                            </div>
                        </div>
                    </div>
                </lightning-card>

                <!-- Terms and Conditions -->
                <div class="slds-m-top_medium">
                    <lightning-input 
                        type="checkbox" 
                        label="I certify that the information provided is accurate and complete"
                        checked={termsAccepted}
                        onchange={handleTermsChange}>
                    </lightning-input>
                </div>
            </div>
        </template>

        <!-- Navigation Buttons -->
        <div class="slds-p-around_medium slds-text-align_right">
            <template if:false={isFirstStep}>
                <lightning-button 
                    label="Previous" 
                    onclick={handlePrevious}
                    class="slds-m-right_small">
                </lightning-button>
            </template>
            
            <template if:false={isLastStep}>
                <lightning-button 
                    label="Next" 
                    variant="brand"
                    onclick={handleNext}
                    disabled={cannotProceed}>
                </lightning-button>
            </template>
            
            <template if:true={isLastStep}>
                <lightning-button 
                    label="Submit Application" 
                    variant="brand"
                    onclick={handleSubmit}
                    disabled={cannotSubmit}
                    class="submit-button">
                </lightning-button>
            </template>
        </div>

        <!-- Loading Spinner -->
        <template if:true={isProcessing}>
            <lightning-spinner alternative-text="Processing..." size="large">
            </lightning-spinner>
        </template>

    </lightning-card>
</template>
```

### 2. Case Management Dashboard Component

#### JavaScript Controller for Multi-Agency Dashboard
```javascript
// case-management-dashboard.js
import { LightningElement, track, wire } from 'lwc';
import { refreshApex } from '@salesforce/apex';
import getAssignedCases from '@salesforce/apex/DOI_PAL_CaseController.getAssignedCases';
import updateTaskStatus from '@salesforce/apex/DOI_PAL_TaskManager.updateTaskStatus';
import escalateOverdueTasks from '@salesforce/apex/DOI_PAL_TaskManager.escalateOverdueTasks';

export default class CaseManagementDashboard extends LightningElement {
    @track selectedFilter = 'my_tasks';
    @track selectedPriority = 'all';
    @track selectedStatus = 'all';
    @track searchTerm = '';
    
    // Data properties
    @track cases = [];
    @track filteredCases = [];
    @track totalCases = 0;
    @track overdueCount = 0;
    @track dueSoonCount = 0;

    // UI state
    @track isLoading = false;
    @track showTaskDetails = false;
    @track selectedTask = null;

    // Filter options
    get filterOptions() {
        return [
            { label: 'My Tasks', value: 'my_tasks' },
            { label: 'My Team', value: 'my_team' },
            { label: 'All Cases', value: 'all_cases' },
            { label: 'High Priority', value: 'high_priority' }
        ];
    }

    get priorityOptions() {
        return [
            { label: 'All Priorities', value: 'all' },
            { label: 'Critical', value: 'critical' },
            { label: 'High', value: 'high' },
            { label: 'Standard', value: 'standard' },
            { label: 'Low', value: 'low' }
        ];
    }

    get statusOptions() {
        return [
            { label: 'All Statuses', value: 'all' },
            { label: 'Pending', value: 'pending' },
            { label: 'In Progress', value: 'in_progress' },
            { label: 'Under Review', value: 'under_review' },
            { label: 'Completed', value: 'completed' }
        ];
    }

    // Wire service to get case data
    @wire(getAssignedCases, { 
        filterType: '$selectedFilter',
        priority: '$selectedPriority',
        status: '$selectedStatus',
        searchTerm: '$searchTerm'
    })
    wiredCases({ error, data }) {
        if (data) {
            this.cases = data;
            this.processCaseData();
        } else if (error) {
            this.showToast('Error', 'Failed to load cases: ' + error.body.message, 'error');
        }
    }

    // Process and calculate summary metrics
    processCaseData() {
        this.totalCases = this.cases.length;
        this.overdueCount = this.cases.filter(c => c.isOverdue).length;
        this.dueSoonCount = this.cases.filter(c => c.isDueSoon && !c.isOverdue).length;
        
        this.filteredCases = this.applyClientSideFilters();
    }

    // Client-side filtering for performance
    applyClientSideFilters() {
        let filtered = [...this.cases];

        if (this.searchTerm) {
            const searchLower = this.searchTerm.toLowerCase();
            filtered = filtered.filter(c => 
                c.applicationName.toLowerCase().includes(searchLower) ||
                c.operatorName.toLowerCase().includes(searchLower) ||
                c.wellName.toLowerCase().includes(searchLower)
            );
        }

        return filtered.sort((a, b) => {
            // Sort by priority, then by due date
            const priorityOrder = { 'critical': 0, 'high': 1, 'standard': 2, 'low': 3 };
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            
            if (priorityDiff !== 0) return priorityDiff;
            
            return new Date(a.dueDate) - new Date(b.dueDate);
        });
    }

    // Event handlers
    handleFilterChange(event) {
        this.selectedFilter = event.detail.value;
    }

    handlePriorityChange(event) {
        this.selectedPriority = event.detail.value;
    }

    handleStatusChange(event) {
        this.selectedStatus = event.detail.value;
    }

    handleSearchChange(event) {
        this.searchTerm = event.target.value;
        
        // Debounce search to avoid too many calls
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            this.processCaseData();
        }, 300);
    }

    // Task management
    async handleTaskStatusUpdate(event) {
        const taskId = event.target.dataset.taskId;
        const newStatus = event.detail.value;
        
        try {
            this.isLoading = true;
            
            await updateTaskStatus({ 
                taskId: taskId, 
                newStatus: newStatus 
            });
            
            this.showToast('Success', 'Task status updated', 'success');
            
            // Refresh data
            return refreshApex(this.wiredCases);
            
        } catch (error) {
            this.showToast('Error', 'Failed to update task: ' + error.body.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleCaseClick(event) {
        const caseId = event.target.dataset.caseId;
        const selectedCase = this.cases.find(c => c.id === caseId);
        
        if (selectedCase) {
            this.selectedTask = selectedCase;
            this.showTaskDetails = true;
        }
    }

    handleCloseTaskDetails() {
        this.showTaskDetails = false;
        this.selectedTask = null;
    }

    // Bulk actions
    async handleEscalateOverdue() {
        try {
            this.isLoading = true;
            
            const result = await escalateOverdueTasks();
            
            this.showToast(
                'Success', 
                `${result.escalatedCount} overdue tasks escalated`, 
                'success'
            );
            
            return refreshApex(this.wiredCases);
            
        } catch (error) {
            this.showToast('Error', 'Escalation failed: ' + error.body.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handleRefresh() {
        return refreshApex(this.wiredCases);
    }

    // Utility methods
    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(event);
    }

    // Computed properties for UI
    get hasCases() {
        return this.filteredCases.length > 0;
    }

    get hasOverdueCases() {
        return this.overdueCount > 0;
    }

    get summaryMessage() {
        return `${this.totalCases} total cases, ${this.overdueCount} overdue, ${this.dueSoonCount} due soon`;
    }
}
```

## Integration Implementation

### 1. Payment Integration with Pay.gov

#### Apex Service for Payment Processing
```apex
public with sharing class DOI_PAL_PaymentController {
    
    private static final String PAYGOV_ENDPOINT = 'https://www.pay.gov/paygov/ws/api/';
    
    // Process APD application payment
    public static PaymentResult processAPDPayment(Id apdApplicationId, Decimal amount) {
        try {
            // Create payment record
            APD_Payment__c payment = new APD_Payment__c(
                DOI_PAL_APD_Application__c = apdApplicationId,
                DOI_PAL_Amount__c = amount,
                DOI_PAL_Status__c = 'Initiated',
                DOI_PAL_Payment_Method__c = 'Credit_Card',
                DOI_PAL_Transaction_Date__c = Datetime.now()
            );
            insert payment;
            
            // Call Pay.gov API
            PaygovResponse response = callPaygovAPI(payment);
            
            // Update payment with response
            payment.DOI_PAL_Transaction_ID__c = response.transactionId;
            payment.DOI_PAL_Status__c = response.status;
            payment.DOI_PAL_Gateway_Response__c = response.responseMessage;
            
            if(response.success) {
                payment.DOI_PAL_Confirmation_Number__c = response.confirmationNumber;
                payment.DOI_PAL_Status__c = 'Completed';
                
                // Update APD status to allow processing
                updateAPDPaymentStatus(apdApplicationId, true);
            } else {
                payment.DOI_PAL_Status__c = 'Failed';
                payment.DOI_PAL_Error_Message__c = response.errorMessage;
            }
            
            update payment;
            
            return new PaymentResult(
                response.success,
                payment.Id,
                response.confirmationNumber,
                response.errorMessage
            );
            
        } catch(Exception e) {
            System.debug('Payment processing failed: ' + e.getMessage());
            throw new PaymentException('Payment processing failed: ' + e.getMessage());
        }
    }
    
    // Call Pay.gov payment API
    private static PaygovResponse callPaygovAPI(APD_Payment__c payment) {
        HttpRequest request = new HttpRequest();
        request.setEndpoint(PAYGOV_ENDPOINT + 'payment/process');
        request.setMethod('POST');
        request.setHeader('Authorization', 'Bearer ' + getPaygovToken());
        request.setHeader('Content-Type', 'application/json');
        
        // Build payment request
        Map<String, Object> paymentData = new Map<String, Object>{
            'amount' => payment.DOI_PAL_Amount__c,
            'description' => 'APD Application Fee',
            'reference' => payment.Name,
            'agencyCode' => 'DOI',
            'applicationId' => payment.DOI_PAL_APD_Application__c,
            'returnUrl' => getReturnUrl(payment.Id)
        };
        
        request.setBody(JSON.serialize(paymentData));
        request.setTimeout(30000); // 30 second timeout
        
        Http http = new Http();
        HttpResponse response = http.send(request);
        
        if(response.getStatusCode() == 200) {
            return (PaygovResponse)JSON.deserialize(
                response.getBody(), 
                PaygovResponse.class
            );
        } else {
            throw new CalloutException('Pay.gov API error: ' + response.getBody());
        }
    }
    
    // Update APD application payment status
    private static void updateAPDPaymentStatus(Id apdId, Boolean paymentCompleted) {
        APD_Application__c apd = new APD_Application__c(
            Id = apdId,
            DOI_PAL_Payment_Status__c = paymentCompleted ? 'Paid' : 'Pending',
            DOI_PAL_Payment_Date__c = paymentCompleted ? Datetime.now() : null
        );
        
        if(paymentCompleted) {
            // Automatically move to initial review if payment completed
            apd.DOI_PAL_Status__c = 'Initial_Review';
            
            // Create initial review task
            DOI_PAL_TaskManager.createInitialReviewTasks(apdId);
        }
        
        update apd;
    }
    
    // Get government authentication token for Pay.gov
    private static String getPaygovToken() {
        // Implementation would retrieve stored credential
        // using Named Credential or Protected Custom Metadata
        return System.Label.DOI_PAL_Paygov_Token;
    }
    
    private static String getReturnUrl(Id paymentId) {
        return URL.getSalesforceBaseUrl().toExternalForm() + 
               '/lightning/r/APD_Payment__c/' + paymentId + '/view';
    }
    
    // Payment response wrapper
    public class PaygovResponse {
        public Boolean success;
        public String transactionId;
        public String confirmationNumber;
        public String status;
        public String responseMessage;
        public String errorMessage;
    }
    
    public class PaymentResult {
        public Boolean success;
        public String paymentId;
        public String confirmationNumber;
        public String errorMessage;
        
        public PaymentResult(Boolean success, String paymentId, 
                           String confirmationNumber, String errorMessage) {
            this.success = success;
            this.paymentId = paymentId;
            this.confirmationNumber = confirmationNumber;
            this.errorMessage = errorMessage;
        }
    }
    
    public class PaymentException extends Exception {}
}
```

### 2. AFMSS Integration for Legacy System Sync

#### Platform Event for Real-time Sync
```apex
// Platform Event Definition: AFMSS_Sync_Event__e
public class DOI_PAL_AFMSSIntegration {
    
    // Sync APD application to AFMSS
    @future(callout=true)
    public static void syncAPDToAFMSS(Id apdId) {
        try {
            APD_Application__c apd = getAPDWithDetails(apdId);
            
            AFMSSRequest request = buildAFMSSRequest(apd);
            AFMSSResponse response = callAFMSSAPI(request);
            
            // Update APD with AFMSS reference
            apd.DOI_PAL_AFMSS_Number__c = response.afmssNumber;
            apd.DOI_PAL_AFMSS_Status__c = response.status;
            apd.DOI_PAL_Last_AFMSS_Sync__c = Datetime.now();
            
            update apd;
            
            // Log integration success
            createIntegrationLog(apdId, 'AFMSS', 'SUCCESS', response.message);
            
        } catch(Exception e) {
            // Log integration failure
            createIntegrationLog(apdId, 'AFMSS', 'ERROR', e.getMessage());
            
            // Publish platform event for retry
            AFMSS_Sync_Event__e syncEvent = new AFMSS_Sync_Event__e(
                DOI_PAL_APD_Id__c = apdId,
                DOI_PAL_Retry_Count__c = 1,
                DOI_PAL_Error_Message__c = e.getMessage()
            );
            
            EventBus.publish(syncEvent);
        }
    }
    
    // Platform Event Handler for retry logic
    @InvocableMethod(label='Handle AFMSS Sync Event')
    public static void handleAFMSSSyncEvent(List<AFMSS_Sync_Event__e> events) {
        for(AFMSS_Sync_Event__e event : events) {
            if(event.DOI_PAL_Retry_Count__c <= 3) {
                // Retry with exponential backoff
                Integer delayMinutes = (Integer)Math.pow(2, event.DOI_PAL_Retry_Count__c);
                
                System.scheduleBatch(
                    new AFMSSRetryBatch(event.DOI_PAL_APD_Id__c),
                    'AFMSS Retry - ' + event.DOI_PAL_APD_Id__c,
                    delayMinutes
                );
            } else {
                // Max retries reached, create manual task
                createManualSyncTask(event.DOI_PAL_APD_Id__c);
            }
        }
    }
    
    private static AFMSSRequest buildAFMSSRequest(APD_Application__c apd) {
        return new AFMSSRequest(
            apd.DOI_PAL_Operator__r.Name,
            apd.DOI_PAL_Lease_Number__c,
            apd.DOI_PAL_Well_Name__c,
            apd.DOI_PAL_Latitude__c,
            apd.DOI_PAL_Longitude__c,
            apd.DOI_PAL_County__c,
            apd.DOI_PAL_State__c
        );
    }
    
    private static void createIntegrationLog(Id recordId, String systemName, 
                                           String status, String message) {
        Integration_Log__c log = new Integration_Log__c(
            DOI_PAL_Record_Id__c = recordId,
            DOI_PAL_System_Name__c = systemName,
            DOI_PAL_Status__c = status,
            DOI_PAL_Message__c = message,
            DOI_PAL_Timestamp__c = Datetime.now()
        );
        insert log;
    }
}
```

## Testing & Quality Assurance

### 1. Apex Test Classes

#### Comprehensive Test Coverage
```apex
@isTest
public class DOI_PAL_ApplicationController_Test {
    
    @TestSetup
    static void setupTestData() {
        // Create test operator
        Operator__c testOperator = new Operator__c(
            Name = 'Test Oil Company',
            DOI_PAL_BLM_Operator_Number__c = 'OP12345',
            DOI_PAL_Primary_Contact_Email__c = 'test@testoil.com'
        );
        insert testOperator;
        
        // Create test lease
        Lease_Agreement__c testLease = new Lease_Agreement__c(
            Name = 'NM-12345',
            DOI_PAL_Lease_Type__c = 'Federal',
            DOI_PAL_State__c = 'NM',
            DOI_PAL_County__c = 'Otero'
        );
        insert testLease;
    }
    
    @isTest
    static void testAPDSubmission_Success() {
        // Get test data
        Operator__c operator = [SELECT Id FROM Operator__c LIMIT 1];
        Lease_Agreement__c lease = [SELECT Id FROM Lease_Agreement__c LIMIT 1];
        
        // Prepare application data
        Map<String, Object> applicationData = new Map<String, Object>{
            'operatorId' => operator.Id,
            'leaseId' => lease.Id,
            'wellName' => 'Test Well #1',
            'wellType' => 'Oil',
            'latitude' => 33.123456,
            'longitude' => -105.654321,
            'measuredDepth' => 8500,
            'trueVerticalDepth' => 8200
        };
        
        List<Map<String, Object>> documents = new List<Map<String, Object>>{
            new Map<String, Object>{
                'fileName' => 'drilling_plan.pdf',
                'documentType' => 'Drilling_Plan',
                'fileContent' => EncodingUtil.base64Encode(Blob.valueOf('test content'))
            }
        };
        
        Test.startTest();
        
        // Mock HTTP callouts for AI and GIS services
        Test.setMock(HttpCalloutMock.class, new DOI_PAL_MockHttpResponse());
        
        DOI_PAL_ApplicationController.ApplicationResult result = 
            DOI_PAL_ApplicationController.submitAPDApplication(
                applicationData, documents, 12515.00
            );
        
        Test.stopTest();
        
        // Verify results
        System.assertNotEquals(null, result.applicationId, 'Application ID should be set');
        System.assertNotEquals(null, result.applicationNumber, 'Application number should be set');
        
        // Verify APD record created
        APD_Application__c createdAPD = [
            SELECT Id, DOI_PAL_Status__c, DOI_PAL_Fee_Amount__c,
                   DOI_PAL_AI_Risk_Score__c, DOI_PAL_NEPA_Level_Recommendation__c
            FROM APD_Application__c 
            WHERE Id = :result.applicationId
        ];
        
        System.assertEquals('Submitted', createdAPD.DOI_PAL_Status__c);
        System.assertEquals(12515.00, createdAPD.DOI_PAL_Fee_Amount__c);
        System.assertNotEquals(null, createdAPD.DOI_PAL_AI_Risk_Score__c);
        
        // Verify initial review task created
        List<APD_Review_Task__c> reviewTasks = [
            SELECT Id, DOI_PAL_Task_Type__c, DOI_PAL_Status__c
            FROM APD_Review_Task__c 
            WHERE DOI_PAL_APD_Application__c = :result.applicationId
        ];
        
        System.assertEquals(1, reviewTasks.size(), 'Initial review task should be created');
        System.assertEquals('Initial_Review', reviewTasks[0].DOI_PAL_Task_Type__c);
    }
    
    @isTest
    static void testProximityAnalysis_NationalParkAlert() {
        // Create APD near national park
        APD_Application__c apd = new APD_Application__c(
            DOI_PAL_Operator__c = [SELECT Id FROM Operator__c LIMIT 1].Id,
            DOI_PAL_Lease_Number__c = 'NM-12345',
            DOI_PAL_Well_Name__c = 'White Sands Test Well',
            DOI_PAL_Latitude__c = 32.7872, // Near White Sands National Park
            DOI_PAL_Longitude__c = -106.3256,
            DOI_PAL_Status__c = 'Submitted'
        );
        insert apd;
        
        Test.startTest();
        
        // Mock GIS service response with national park proximity
        Test.setMock(HttpCalloutMock.class, new DOI_PAL_MockGISResponse());
        
        DOI_PAL_GISAnalyzer.analyzeProximity(apd.Id);
        
        Test.stopTest();
        
        // Verify proximity analysis results
        APD_Application__c updatedAPD = [
            SELECT DOI_PAL_Proximity_Alerts__c, DOI_PAL_AI_Risk_Score__c,
                   DOI_PAL_NEPA_Level_Recommendation__c
            FROM APD_Application__c 
            WHERE Id = :apd.Id
        ];
        
        System.assert(
            updatedAPD.DOI_PAL_Proximity_Alerts__c.contains('National_Park'),
            'National Park alert should be set'
        );
        System.assert(updatedAPD.DOI_PAL_AI_Risk_Score__c > 5.0, 'Risk score should be elevated');
        System.assertEquals('EA', updatedAPD.DOI_PAL_NEPA_Level_Recommendation__c);
        
        // Verify NPS review task created
        List<APD_Review_Task__c> npsTasks = [
            SELECT Id FROM APD_Review_Task__c 
            WHERE DOI_PAL_APD_Application__c = :apd.Id 
            AND DOI_PAL_Task_Type__c = 'NPS_Environmental_Review'
        ];
        
        System.assertEquals(1, npsTasks.size(), 'NPS review task should be created');
    }
    
    @isTest
    static void testTaskAssignment_LoadBalancing() {
        // Create multiple users with different workloads
        List<User> testUsers = createTestUsers(3);
        
        // Create existing tasks for load balancing test
        createExistingTasks(testUsers);
        
        // Create new APD requiring task assignment
        APD_Application__c apd = createTestAPD();
        
        Test.startTest();
        
        DOI_PAL_TaskManager.createSpecialistReviews(
            apd.Id, 
            new Set<String>{'Petroleum_Engineer', 'Wildlife_Biologist'}
        );
        
        Test.stopTest();
        
        // Verify load balancing worked correctly
        List<APD_Review_Task__c> newTasks = [
            SELECT DOI_PAL_Assigned_User__c, DOI_PAL_Assigned_Role__c
            FROM APD_Review_Task__c 
            WHERE DOI_PAL_APD_Application__c = :apd.Id
        ];
        
        System.assertEquals(2, newTasks.size(), 'Two specialist tasks should be created');
        
        // Verify tasks assigned to users with lowest workload
        for(APD_Review_Task__c task : newTasks) {
            System.assertNotEquals(null, task.DOI_PAL_Assigned_User__c, 
                                 'Task should be assigned to a user');
        }
    }
    
    // Helper methods for test data creation
    private static List<User> createTestUsers(Integer count) {
        List<User> users = new List<User>();
        
        for(Integer i = 0; i < count; i++) {
            users.add(new User(
                FirstName = 'Test',
                LastName = 'User' + i,
                Email = 'testuser' + i + '@doi.gov',
                Username = 'testuser' + i + '@doi.gov.test',
                Alias = 'tuser' + i,
                ProfileId = [SELECT Id FROM Profile WHERE Name = 'Standard User' LIMIT 1].Id,
                TimeZoneSidKey = 'America/Denver',
                LocaleSidKey = 'en_US',
                EmailEncodingKey = 'UTF-8',
                LanguageLocaleKey = 'en_US'
            ));
        }
        
        insert users;
        return users;
    }
    
    private static void createExistingTasks(List<User> users) {
        List<APD_Review_Task__c> existingTasks = new List<APD_Review_Task__c>();
        
        // Create uneven workload distribution for testing
        for(Integer i = 0; i < users.size(); i++) {
            Integer taskCount = i + 1; // User 0 gets 1 task, User 1 gets 2, etc.
            
            for(Integer j = 0; j < taskCount; j++) {
                existingTasks.add(new APD_Review_Task__c(
                    DOI_PAL_APD_Application__c = createTestAPD().Id,
                    DOI_PAL_Task_Type__c = 'Specialist_Review',
                    DOI_PAL_Assigned_User__c = users[i].Id,
                    DOI_PAL_Status__c = 'In_Progress',
                    DOI_PAL_Due_Date__c = Date.today().addBusinessDays(5)
                ));
            }
        }
        
        insert existingTasks;
    }
    
    private static APD_Application__c createTestAPD() {
        APD_Application__c apd = new APD_Application__c(
            DOI_PAL_Operator__c = [SELECT Id FROM Operator__c LIMIT 1].Id,
            DOI_PAL_Lease_Number__c = 'TEST-' + System.currentTimeMillis(),
            DOI_PAL_Well_Name__c = 'Test Well',
            DOI_PAL_Status__c = 'Submitted'
        );
        insert apd;
        return apd;
    }
}

// Mock HTTP response for external service testing
public class DOI_PAL_MockHttpResponse implements HttpCalloutMock {
    
    public HttpResponse respond(HttpRequest request) {
        HttpResponse response = new HttpResponse();
        response.setStatusCode(200);
        response.setHeader('Content-Type', 'application/json');
        
        if(request.getEndpoint().contains('document-analysis')) {
            // Mock AI document analysis response
            Map<String, Object> aiResponse = new Map<String, Object>{
                'validationStatus' => 'Valid',
                'summary' => 'Document contains all required sections',
                'confidenceScore' => 0.95,
                'issues' => new List<String>(),
                'hasIssues' => false
            };
            response.setBody(JSON.serialize(aiResponse));
            
        } else if(request.getEndpoint().contains('proximity-analysis')) {
            // Mock GIS proximity analysis response
            Map<String, Object> gisResponse = new Map<String, Object>{
                'alerts' => new List<String>{'National_Park'},
                'proximityAlerts' => new List<Map<String, Object>>{
                    new Map<String, Object>{
                        'layerType' => 'national_parks',
                        'featureName' => 'White Sands National Park',
                        'distance' => 3500, // 3500 feet = ~0.66 miles
                        'riskLevel' => 'High'
                    }
                }
            };
            response.setBody(JSON.serialize(gisResponse));
        }
        
        return response;
    }
}
```

### 2. Lightning Web Component Tests

#### Jest Test Suite
```javascript
// __tests__/permit-application-wizard.test.js
import { createElement } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import PermitApplicationWizard from 'c/permitApplicationWizard';
import submitAPDApplication from '@salesforce/apex/DOI_PAL_ApplicationController.submitApplication';

// Mock Apex method
jest.mock(
    '@salesforce/apex/DOI_PAL_ApplicationController.submitApplication',
    () => {
        const { createApexTestWireAdapter } = require('@salesforce/sfdx-lwc-jest');
        return {
            default: createApexTestWireAdapter(jest.fn())
        };
    },
    { virtual: true }
);

describe('c-permit-application-wizard', () => {
    afterEach(() => {
        // Clean up DOM after each test
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
        
        // Reset mocks
        jest.clearAllMocks();
    });

    it('should render initial wizard step correctly', () => {
        const element = createElement('c-permit-application-wizard', {
            is: PermitApplicationWizard
        });
        document.body.appendChild(element);

        // Verify initial state
        const progressIndicator = element.shadowRoot.querySelector('lightning-progress-indicator');
        expect(progressIndicator).toBeTruthy();
        expect(progressIndicator.currentStep).toBe(1);

        // Verify step 1 content is displayed
        const operatorNameInput = element.shadowRoot.querySelector('[data-field="operatorName"]');
        expect(operatorNameInput).toBeTruthy();
        expect(operatorNameInput.required).toBe(true);
    });

    it('should validate required fields before allowing next step', async () => {
        const element = createElement('c-permit-application-wizard', {
            is: PermitApplicationWizard
        });
        document.body.appendChild(element);

        // Try to go to next step without filling required fields
        const nextButton = element.shadowRoot.querySelector('lightning-button[label="Next"]');
        nextButton.click();

        await Promise.resolve(); // Wait for DOM updates

        // Should still be on step 1
        expect(element.currentStep).toBe(1);

        // Fill required fields
        const operatorNameInput = element.shadowRoot.querySelector('[data-field="operatorName"]');
        operatorNameInput.value = 'Test Operator';
        operatorNameInput.dispatchEvent(new CustomEvent('change'));

        const contactEmailInput = element.shadowRoot.querySelector('[data-field="contactEmail"]');
        contactEmailInput.value = 'test@operator.com';
        contactEmailInput.dispatchEvent(new CustomEvent('change'));

        await Promise.resolve();

        // Now should be able to proceed
        nextButton.click();
        await Promise.resolve();

        expect(element.currentStep).toBe(2);
    });

    it('should handle document upload and validation', async () => {
        const element = createElement('c-permit-application-wizard', {
            is: PermitApplicationWizard
        });
        document.body.appendChild(element);

        // Navigate to document upload step
        element.currentStep = 4;
        await Promise.resolve();

        // Mock file upload
        const fileInput = element.shadowRoot.querySelector('input[type="file"]');
        const mockFile = new File(['test content'], 'drilling_plan.pdf', { 
            type: 'application/pdf' 
        });

        // Simulate file selection
        Object.defineProperty(fileInput, 'files', {
            value: [mockFile],
            writable: false,
        });

        fileInput.dispatchEvent(new CustomEvent('change'));
        await Promise.resolve();

        // Verify document was processed
        expect(element.uploadedDocuments.length).toBe(1);
        expect(element.uploadedDocuments[0].fileName).toBe('drilling_plan.pdf');
        expect(element.uploadedDocuments[0].documentType).toBe('Drilling_Plan');
    });

    it('should handle coordinate validation and proximity alerts', async () => {
        const element = createElement('c-permit-application-wizard', {
            is: PermitApplicationWizard
        });
        document.body.appendChild(element);

        // Navigate to location step
        element.currentStep = 2;
        await Promise.resolve();

        // Enter coordinates near White Sands National Park
        const latitudeInput = element.shadowRoot.querySelector('[data-field="latitude"]');
        latitudeInput.value = 32.7872;
        latitudeInput.dispatchEvent(new CustomEvent('change'));

        const longitudeInput = element.shadowRoot.querySelector('[data-field="longitude"]');
        longitudeInput.value = -106.3256;
        longitudeInput.dispatchEvent(new CustomEvent('change'));

        await Promise.resolve();

        // Mock proximity analysis would trigger alerts
        // Verify alert display (would require mocking the proximity service)
    });

    it('should handle application submission successfully', async () => {
        const element = createElement('c-permit-application-wizard', {
            is: PermitApplicationWizard
        });
        document.body.appendChild(element);

        // Set up complete application data
        element.applicationData = {
            operatorName: 'Test Operator',
            contactEmail: 'test@operator.com',
            leaseNumber: 'NM-12345',
            latitude: 33.123456,
            longitude: -105.654321,
            wellName: 'Test Well #1',
            wellType: 'Oil'
        };

        element.uploadedDocuments = [
            { fileName: 'drilling_plan.pdf', documentType: 'Drilling_Plan' },
            { fileName: 'supo.pdf', documentType: 'SUPO' },
            { fileName: 'survey.pdf', documentType: 'Survey_Plat' }
        ];

        element.calculatedFees = 12515.00;
        element.currentStep = 5;

        await Promise.resolve();

        // Mock successful submission
        submitAPDApplication.mockResolvedValue({
            success: true,
            applicationId: 'a001234567890123',
            applicationNumber: 'APD-2025-000001'
        });

        // Submit application
        const submitButton = element.shadowRoot.querySelector('.submit-button');
        submitButton.click();

        await Promise.resolve();

        // Verify success toast was shown
        const toastEvent = new ShowToastEvent({
            title: 'Success',
            message: 'APD Application APD-2025-000001 submitted successfully!',
            variant: 'success'
        });

        expect(element.dispatchEvent).toHaveBeenCalledWith(toastEvent);
    });

    it('should handle submission errors gracefully', async () => {
        const element = createElement('c-permit-application-wizard', {
            is: PermitApplicationWizard
        });
        document.body.appendChild(element);

        // Set up application for submission
        element.currentStep = 5;
        element.applicationData = { operatorName: 'Test' };

        await Promise.resolve();

        // Mock submission error
        submitAPDApplication.mockRejectedValue({
            body: { message: 'Invalid lease number' }
        });

        const submitButton = element.shadowRoot.querySelector('.submit-button');
        submitButton.click();

        await Promise.resolve();

        // Verify error handling
        expect(element.isProcessing).toBe(false);
    });
});
```

## Performance Optimization

### 1. Governor Limit Management

#### Bulk Processing Patterns
```apex
public class DOI_PAL_BulkProcessingUtility {
    
    // Process multiple APDs in bulk to avoid governor limits
    public static void processBulkAPDSubmissions(List<APD_Application__c> apds) {
        // Separate processing lists
        List<APD_Application__c> apdsForGISAnalysis = new List<APD_Application__c>();
        List<APD_Document__c> documentsForAI = new List<APD_Document__c>();
        List<APD_Review_Task__c> tasksToCreate = new List<APD_Review_Task__c>();
        
        // Pre-query related data to avoid query limits
        Set<Id> operatorIds = new Set<Id>();
        Set<String> leaseNumbers = new Set<String>();
        
        for(APD_Application__c apd : apds) {
            if(apd.DOI_PAL_Operator__c != null) {
                operatorIds.add(apd.DOI_PAL_Operator__c);
            }
            if(apd.DOI_PAL_Lease_Number__c != null) {
                leaseNumbers.add(apd.DOI_PAL_Lease_Number__c);
            }
        }
        
        // Bulk query related records
        Map<Id, Operator__c> operatorMap = new Map<Id, Operator__c>([
            SELECT Id, Name, DOI_PAL_BLM_Operator_Number__c
            FROM Operator__c 
            WHERE Id IN :operatorIds
        ]);
        
        Map<String, Lease_Agreement__c> leaseMap = new Map<String, Lease_Agreement__c>();
        for(Lease_Agreement__c lease : [
            SELECT Name, DOI_PAL_Lease_Type__c, DOI_PAL_State__c
            FROM Lease_Agreement__c 
            WHERE Name IN :leaseNumbers
        ]) {
            leaseMap.put(lease.Name, lease);
        }
        
        // Process each APD with bulk patterns
        for(APD_Application__c apd : apds) {
            try {
                // Validate and enrich APD data
                validateAPDData(apd, operatorMap, leaseMap);
                
                // Determine processing requirements
                if(needsGISAnalysis(apd)) {
                    apdsForGISAnalysis.add(apd);
                }
                
                // Create initial tasks
                tasksToCreate.addAll(createInitialTasks(apd));
                
            } catch(Exception e) {
                // Log error but continue processing other APDs
                System.debug('Error processing APD ' + apd.Id + ': ' + e.getMessage());
                
                // Create error task for manual review
                tasksToCreate.add(createErrorReviewTask(apd.Id, e.getMessage()));
            }
        }
        
        // Bulk DML operations
        if(!tasksToCreate.isEmpty()) {
            insert tasksToCreate;
        }
        
        // Queue async processing for GIS analysis
        if(!apdsForGISAnalysis.isEmpty()) {
            queueGISAnalysis(apdsForGISAnalysis);
        }
    }
    
    // Queue GIS analysis in batches to avoid callout limits
    private static void queueGISAnalysis(List<APD_Application__c> apds) {
        List<Id> apdIds = new List<Id>();
        for(APD_Application__c apd : apds) {
            apdIds.add(apd.Id);
        }
        
        // Use Queueable with chaining for bulk GIS processing
        if(!System.isQueueable() && !System.isFuture() && !System.isBatch()) {
            System.enqueueJob(new DOI_PAL_GISBatchProcessor(apdIds));
        }
    }
    
    // Queueable class for GIS batch processing
    public class DOI_PAL_GISBatchProcessor implements Queueable, Database.AllowsCallouts {
        private List<Id> apdIds;
        private Integer currentIndex;
        
        public DOI_PAL_GISBatchProcessor(List<Id> apdIds) {
            this.apdIds = apdIds;
            this.currentIndex = 0;
        }
        
        public void execute(QueueableContext context) {
            // Process up to 10 APDs per execution to manage callout limits
            Integer processingLimit = Math.min(currentIndex + 10, apdIds.size());
            
            for(Integer i = currentIndex; i < processingLimit; i++) {
                try {
                    processGISAnalysis(apdIds[i]);
                } catch(Exception e) {
                    System.debug('GIS processing failed for APD ' + apdIds[i] + ': ' + e.getMessage());
                }
            }
            
            // Chain next batch if more APDs to process
            if(processingLimit < apdIds.size()) {
                DOI_PAL_GISBatchProcessor nextBatch = new DOI_PAL_GISBatchProcessor(apdIds);
                nextBatch.currentIndex = processingLimit;
                
                if(!Test.isRunningTest()) {
                    System.enqueueJob(nextBatch);
                }
            }
        }
    }
}
```

### 2. Caching Strategy

#### Platform Cache Implementation
```apex
public class DOI_PAL_CacheManager {
    
    private static final String CACHE_PARTITION = 'DOI_PAL_Cache';
    private static final Integer CACHE_TTL_HOURS = 4;
    
    // Cache frequently accessed reference data
    public static List<User> getCachedReviewers(String role) {
        String cacheKey = 'reviewers_' + role;
        
        List<User> reviewers = (List<User>)Cache.Org.get(
            CACHE_PARTITION + '.' + cacheKey
        );
        
        if(reviewers == null) {
            // Query and cache reviewers
            reviewers = [
                SELECT Id, Name, Email, IsActive
                FROM User 
                WHERE IsActive = true 
                AND DOI_PAL_Review_Role__c = :role
                ORDER BY Name
            ];
            
            Cache.Org.put(
                CACHE_PARTITION + '.' + cacheKey,
                reviewers,
                CACHE_TTL_HOURS * 3600 // TTL in seconds
            );
        }
        
        return reviewers;
    }
    
    // Cache GIS analysis results to avoid repeated API calls
    public static DOI_PAL_GISAnalyzer.ProximityAnalysisResult getCachedProximityAnalysis(
        Decimal latitude, Decimal longitude
    ) {
        // Create cache key from coordinates (rounded to reduce cache size)
        String coordinateKey = String.valueOf(latitude).substring(0, 8) + '_' + 
                              String.valueOf(longitude).substring(0, 9);
        String cacheKey = 'gis_' + coordinateKey;
        
        DOI_PAL_GISAnalyzer.ProximityAnalysisResult result = 
            (DOI_PAL_GISAnalyzer.ProximityAnalysisResult)Cache.Org.get(
                CACHE_PARTITION + '.' + cacheKey
            );
        
        if(result == null) {
            // Perform analysis and cache result
            result = DOI_PAL_GISAnalyzer.performProximityAnalysis(latitude, longitude);
            
            Cache.Org.put(
                CACHE_PARTITION + '.' + cacheKey,
                result,
                12 * 3600 // 12 hour TTL for GIS data
            );
        }
        
        return result;
    }
    
    // Cache document validation results
    public static void cacheDocumentValidation(String documentHash, 
                                             DOI_PAL_AIDocumentProcessor.AIAnalysisResult result) {
        String cacheKey = 'doc_validation_' + documentHash;
        
        Cache.Org.put(
            CACHE_PARTITION + '.' + cacheKey,
            result,
            24 * 3600 // 24 hour TTL for document analysis
        );
    }
    
    public static DOI_PAL_AIDocumentProcessor.AIAnalysisResult getCachedDocumentValidation(
        String documentHash
    ) {
        String cacheKey = 'doc_validation_' + documentHash;
        
        return (DOI_PAL_AIDocumentProcessor.AIAnalysisResult)Cache.Org.get(
            CACHE_PARTITION + '.' + cacheKey
        );
    }
    
    // Clear cache when reference data changes
    public static void clearUserCache() {
        Cache.Org.remove(CACHE_PARTITION + '.reviewers_Natural_Resource_Specialist');
        Cache.Org.remove(CACHE_PARTITION + '.reviewers_Petroleum_Engineer');
        Cache.Org.remove(CACHE_PARTITION + '.reviewers_Wildlife_Biologist');
        // Clear other role caches as needed
    }
}
```

## Security Implementation

### 1. Field-Level Security and Validation

#### Comprehensive Security Rules
```apex
public with sharing class DOI_PAL_SecurityManager {
    
    // Validate user access to APD records
    public static Boolean canAccessAPD(Id apdId, String accessType) {
        APD_Application__c apd = [
            SELECT Id, DOI_PAL_Status__c, DOI_PAL_Assigned_Field_Office__c,
                   DOI_PAL_Primary_Reviewer__c, DOI_PAL_Operator__c
            FROM APD_Application__c 
            WHERE Id = :apdId
        ];
        
        User currentUser = getCurrentUserInfo();
        
        switch on accessType {
            when 'READ' {
                return canReadAPD(apd, currentUser);
            }
            when 'EDIT' {
                return canEditAPD(apd, currentUser);
            }
            when 'DELETE' {
                return canDeleteAPD(apd, currentUser);
            }
            when else {
                return false;
            }
        }
    }
    
    private static Boolean canReadAPD(APD_Application__c apd, User currentUser) {
        // System administrators can read all
        if(isSystemAdmin(currentUser)) return true;
        
        // Operators can read their own applications
        if(isOperatorUser(currentUser) && 
           apd.DOI_PAL_Operator__c == currentUser.DOI_PAL_Operator__c) {
            return true;
        }
        
        // BLM staff can read applications in their field office
        if(isBLMUser(currentUser) && 
           apd.DOI_PAL_Assigned_Field_Office__c == currentUser.DOI_PAL_Field_Office__c) {
            return true;
        }
        
        // Assigned reviewers can read their assigned cases
        if(apd.DOI_PAL_Primary_Reviewer__c == currentUser.Id) {
            return true;
        }
        
        // Interagency users can read cases with their review tasks
        if(isInteragencyUser(currentUser) && hasAssignedTasks(apd.Id, currentUser.Id)) {
            return true;
        }
        
        return false;
    }
    
    private static Boolean canEditAPD(APD_Application__c apd, User currentUser) {
        // Operators can only edit draft applications
        if(isOperatorUser(currentUser) && 
           apd.DOI_PAL_Status__c == 'Draft' &&
           apd.DOI_PAL_Operator__c == currentUser.DOI_PAL_Operator__c) {
            return true;
        }
        
        // BLM reviewers can edit during review process
        if(isBLMUser(currentUser) && 
           apd.DOI_PAL_Status__c != 'Approved' && 
           apd.DOI_PAL_Status__c != 'Denied' &&
           (apd.DOI_PAL_Primary_Reviewer__c == currentUser.Id ||
            isFieldOfficeManager(currentUser))) {
            return true;
        }
        
        // System admins can always edit (with audit trail)
        if(isSystemAdmin(currentUser)) {
            logAdminAccess(apd.Id, currentUser.Id, 'EDIT');
            return true;
        }
        
        return false;
    }
    
    // Validate sensitive field access
    public static Boolean canAccessSensitiveField(String objectName, String fieldName) {
        User currentUser = getCurrentUserInfo();
        
        // Cultural resource locations - restricted access
        if(fieldName.contains('Cultural_Site_Location') || 
           fieldName.contains('Archaeological_Site')) {
            return isCulturalResourceSpecialist(currentUser) || 
                   isTribalRepresentative(currentUser);
        }
        
        // Financial information - restricted access
        if(fieldName.contains('Payment') || fieldName.contains('Fee')) {
            return isFinancialUser(currentUser) || isSystemAdmin(currentUser);
        }
        
        // PII fields - restricted access
        if(fieldName.contains('SSN') || fieldName.contains('Personal_ID')) {
            return isAuthorizedPIIUser(currentUser);
        }
        
        return true; // Default allow for non-sensitive fields
    }
    
    // Data Loss Prevention - scan for sensitive content
    public static void validateDocumentContent(APD_Document__c document) {
        String content = document.DOI_PAL_File_Content__c?.toLowerCase();
        
        if(String.isBlank(content)) return;
        
        List<String> violations = new List<String>();
        
        // Check for SSN patterns
        if(Pattern.matches('.*\\d{3}-?\\d{2}-?\\d{4}.*', content)) {
            violations.add('Potential SSN detected');
        }
        
        // Check for credit card patterns
        if(Pattern.matches('.*\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}[\\s-]?\\d{4}.*', content)) {
            violations.add('Potential credit card number detected');
        }
        
        // Check for cultural site coordinates (if not authorized user)
        if(content.contains('sacred') || content.contains('burial') || 
           content.contains('ceremonial')) {
            if(!isCulturalResourceSpecialist(getCurrentUserInfo())) {
                violations.add('Cultural resource information requires authorization');
            }
        }
        
        if(!violations.isEmpty()) {
            document.DOI_PAL_Security_Violations__c = String.join(violations, '; ');
            document.DOI_PAL_Security_Review_Required__c = true;
            
            // Create security review task
            createSecurityReviewTask(document);
        }
    }
    
    // Helper methods for role checking
    private static Boolean isSystemAdmin(User user) {
        return user.Profile.Name == 'System Administrator' ||
               user.DOI_PAL_Role__c == 'System_Administrator';
    }
    
    private static Boolean isOperatorUser(User user) {
        return user.Profile.Name == 'DOI PAL Operator' ||
               user.DOI_PAL_Role__c == 'Operator';
    }
    
    private static Boolean isBLMUser(User user) {
        return user.DOI_PAL_Agency__c == 'BLM';
    }
    
    private static Boolean isInteragencyUser(User user) {
        return user.DOI_PAL_Agency__c == 'NPS' ||
               user.DOI_PAL_Agency__c == 'BIA' ||
               user.DOI_PAL_Agency__c == 'OEPC' ||
               user.DOI_PAL_Agency__c == 'SOL';
    }
    
    private static Boolean isCulturalResourceSpecialist(User user) {
        return user.DOI_PAL_Role__c == 'Cultural_Resource_Specialist' ||
               user.DOI_PAL_Certifications__c?.contains('Cultural_Resource');
    }
    
    private static Boolean isTribalRepresentative(User user) {
        return user.DOI_PAL_Role__c == 'Tribal_Representative' ||
               user.DOI_PAL_Agency__c == 'Tribal_Government';
    }
    
    // Audit logging for compliance
    private static void logAdminAccess(Id recordId, Id userId, String action) {
        Security_Audit_Log__c auditLog = new Security_Audit_Log__c(
            DOI_PAL_Record_Id__c = recordId,
            DOI_PAL_User_Id__c = userId,
            DOI_PAL_Action__c = action,
            DOI_PAL_Timestamp__c = Datetime.now(),
            DOI_PAL_IP_Address__c = Auth.SessionManagement.getCurrentSession()?.get('SourceIp'),
            DOI_PAL_Justification__c = 'System administrator access'
        );
        
        insert auditLog;
    }
}
```

## Deployment & DevOps

### 1. Deployment Pipeline

#### Salesforce DX Project Configuration
```json
// sfdx-project.json
{
    "packageDirectories": [
        {
            "path": "force-app/main/Government_Documents/Permit_And_Licensing",
            "default": true,
            "package": "DOI_PAL_Core",
            "versionName": "ver 1.0",
            "versionNumber": "1.0.0.NEXT"
        },
        {
            "path": "force-app/main/default/objects",
            "package": "DOI_PAL_Objects",
            "versionName": "ver 1.0",
            "versionNumber": "1.0.0.NEXT"
        }
    ],
    "name": "DOI_Permits_And_Licensing",
    "namespace": "",
    "sfdcLoginUrl": "https://login.salesforce.com",
    "sourceApiVersion": "58.0",
    "packageAliases": {
        "DOI_PAL_Core": "0Ho...",
        "DOI_PAL_Objects": "0Ho..."
    }
}
```

#### GitHub Actions CI/CD Pipeline
```yaml
# .github/workflows/deploy.yml
name: DOI PAL Deployment Pipeline

on:
  push:
    branches: [main, develop, feature/*]
  pull_request:
    branches: [main, develop]

jobs:
  validate-and-test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Install Salesforce CLI
      run: |
        wget https://developer.salesforce.com/media/salesforce-cli/sfdx/channels/stable/sfdx-linux-x64.tar.xz
        mkdir ~/sfdx
        tar xJf sfdx-linux-x64.tar.xz -C ~/sfdx --strip-components 1
        echo "$HOME/sfdx/bin" >> $GITHUB_PATH
        
    - name: Authorize Dev Hub
      run: |
        echo ${{ secrets.DEVHUB_JWT_KEY }} | base64 -d > devhub.key
        sfdx force:auth:jwt:grant \
          --clientid ${{ secrets.DEVHUB_CONSUMER_KEY }} \
          --jwtkeyfile devhub.key \
          --username ${{ secrets.DEVHUB_USERNAME }} \
          --setdefaultdevhubusername \
          --setalias DevHub
          
    - name: Create Scratch Org
      run: |
        sfdx force:org:create \
          --targetdevhubusername DevHub \
          --setdefaultusername \
          --definitionfile config/project-scratch-def.json \
          --setalias ScratchOrg \
          --wait 10 \
          --durationdays 1
          
    - name: Deploy Source
      run: |
        sfdx force:source:push --targetusername ScratchOrg
        
    - name: Run Apex Tests
      run: |
        sfdx force:apex:test:run \
          --targetusername ScratchOrg \
          --wait 10 \
          --resultformat tap \
          --codecoverage \
          --testlevel RunLocalTests
          
    - name: Run LWC Tests
      run: |
        npm install
        npm run test:unit
        
    - name: Security Scan
      run: |
        sfdx scanner:run \
          --target "force-app/main/**/*.cls,force-app/main/**/*.js" \
          --format sarif \
          --outfile security-results.sarif
          
    - name: Upload Security Results
      uses: github/codeql-action/upload-sarif@v2
      if: always()
      with:
        sarif_file: security-results.sarif
        
    - name: Cleanup
      if: always()
      run: |
        sfdx force:org:delete --targetusername ScratchOrg --noprompt
        rm -f devhub.key

  deploy-staging:
    needs: validate-and-test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Deploy to Staging
      run: |
        # Deployment commands for staging environment
        sfdx force:auth:jwt:grant \
          --clientid ${{ secrets.STAGING_CONSUMER_KEY }} \
          --jwtkeyfile staging.key \
          --username ${{ secrets.STAGING_USERNAME }} \
          --instanceurl ${{ secrets.STAGING_URL }}
          
        sfdx force:source:deploy \
          --sourcepath force-app/main \
          --targetusername ${{ secrets.STAGING_USERNAME }} \
          --wait 30 \
          --testlevel RunLocalTests

  deploy-production:
    needs: validate-and-test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    environment: production
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Deploy to Production
      run: |
        # Production deployment with additional safeguards
        sfdx force:auth:jwt:grant \
          --clientid ${{ secrets.PROD_CONSUMER_KEY }} \
          --jwtkeyfile production.key \
          --username ${{ secrets.PROD_USERNAME }} \
          --instanceurl ${{ secrets.PROD_URL }}
          
        # Validate deployment first
        sfdx force:source:deploy \
          --sourcepath force-app/main \
          --targetusername ${{ secrets.PROD_USERNAME }} \
          --wait 30 \
          --testlevel RunLocalTests \
          --checkonly
          
        # Deploy if validation passes
        sfdx force:source:deploy \
          --sourcepath force-app/main \
          --targetusername ${{ secrets.PROD_USERNAME }} \
          --wait 30 \
          --testlevel RunLocalTests
```

### 2. Environment Configuration

#### Scratch Org Definition
```json
// config/project-scratch-def.json
{
    "orgName": "DOI Permits and Licensing",
    "edition": "Enterprise",
    "features": ["EnableSetPasswordInApi", "AuthorApex"],
    "settings": {
        "lightningExperienceSettings": {
            "enableS1DesktopEnabled": true
        },
        "mobileSettings": {
            "enableS1EncryptedStoragePref2": false
        },
        "securitySettings": {
            "enableAdminLoginAsAnyUser": true,
            "sessionSettings": {
                "forceRelogin": false,
                "requiredSessionLevel": "HIGH_ASSURANCE",
                "sessionTimeout": "FOUR_HOURS"
            }
        },
        "orgPreferenceSettings": {
            "enforceIpRestrictions": false,
            "s1DesktopEnabled": true
        }
    }
}
```

## Monitoring & Maintenance

### 1. Performance Monitoring

#### Custom Platform Events for System Health
```apex
// System Health Monitoring
public class DOI_PAL_SystemMonitor {
    
    // Monitor SLA compliance across all active tasks
    @InvocableMethod(label='Check SLA Compliance')
    public static void checkSLACompliance() {
        List<APD_Review_Task__c> atRiskTasks = [
            SELECT Id, Name, DOI_PAL_Due_Date__c, DOI_PAL_Assigned_User__c,
                   DOI_PAL_APD_Application__c, DOI_PAL_Task_Type__c
            FROM APD_Review_Task__c 
            WHERE DOI_PAL_Status__c IN ('Pending', 'In_Progress')
            AND DOI_PAL_Due_Date__c <= :Date.today().addDays(2)
        ];
        
        if(!atRiskTasks.isEmpty()) {
            // Publish platform event for automated response
            List<SLA_Alert_Event__e> alerts = new List<SLA_Alert_Event__e>();
            
            for(APD_Review_Task__c task : atRiskTasks) {
                alerts.add(new SLA_Alert_Event__e(
                    DOI_PAL_Task_Id__c = task.Id,
                    DOI_PAL_APD_Id__c = task.DOI_PAL_APD_Application__c,
                    DOI_PAL_Alert_Type__c = 'SLA_AT_RISK',
                    DOI_PAL_Alert_Message__c = 'Task ' + task.Name + ' due in 2 days'
                ));
            }
            
            EventBus.publish(alerts);
        }
    }
    
    // Monitor system performance metrics
    public static void checkSystemPerformance() {
        // Check API response times
        checkAPIPerformance();
        
        // Check database performance
        checkDatabasePerformance();
        
        // Check integration health
        checkIntegrationHealth();
    }
    
    private static void checkAPIPerformance() {
        List<Integration_Log__c> recentLogs = [
            SELECT DOI_PAL_System_Name__c, DOI_PAL_Response_Time__c
            FROM Integration_Log__c 
            WHERE CreatedDate >= :Datetime.now().addHours(-1)
            AND DOI_PAL_Response_Time__c != null
        ];
        
        Map<String, List<Decimal>> responseTimesBySystem = new Map<String, List<Decimal>>();
        
        for(Integration_Log__c log : recentLogs) {
            if(!responseTimesBySystem.containsKey(log.DOI_PAL_System_Name__c)) {
                responseTimesBySystem.put(log.DOI_PAL_System_Name__c, new List<Decimal>());
            }
            responseTimesBySystem.get(log.DOI_PAL_System_Name__c).add(log.DOI_PAL_Response_Time__c);
        }
        
        // Check for performance degradation
        for(String system : responseTimesBySystem.keySet()) {
            List<Decimal> responseTimes = responseTimesBySystem.get(system);
            Decimal averageTime = calculateAverage(responseTimes);
            
            if(averageTime > getPerformanceThreshold(system)) {
                createPerformanceAlert(system, averageTime);
            }
        }
    }
    
    private static void createPerformanceAlert(String system, Decimal averageTime) {
        Performance_Alert_Event__e alert = new Performance_Alert_Event__e(
            DOI_PAL_System_Name__c = system,
            DOI_PAL_Average_Response_Time__c = averageTime,
            DOI_PAL_Alert_Type__c = 'PERFORMANCE_DEGRADATION',
            DOI_PAL_Timestamp__c = Datetime.now()
        );
        
        EventBus.publish(alert);
    }
}
```

### 2. Automated Backup and Recovery

#### Data Export and Archival
```apex
public class DOI_PAL_DataArchivalService implements Database.Batchable<sObject>, Schedulable {
    
    private Date archivalDate;
    
    public DOI_PAL_DataArchivalService() {
        // Archive records older than 7 years (federal requirement)
        this.archivalDate = Date.today().addYears(-7);
    }
    
    public void execute(SchedulableContext sc) {
        Database.executeBatch(this, 200);
    }
    
    public Database.QueryLocator start(Database.BatchableContext bc) {
        return Database.getQueryLocator([
            SELECT Id, Name, DOI_PAL_Status__c, DOI_PAL_Final_Decision_Date__c,
                   (SELECT Id FROM APD_Documents__r),
                   (SELECT Id FROM APD_Review_Tasks__r),
                   (SELECT Id FROM APD_Payments__r)
            FROM APD_Application__c 
            WHERE DOI_PAL_Status__c IN ('Approved', 'Denied', 'Withdrawn')
            AND DOI_PAL_Final_Decision_Date__c <= :archivalDate
        ]);
    }
    
    public void execute(Database.BatchableContext bc, List<APD_Application__c> records) {
        List<Archive_Record__c> archiveRecords = new List<Archive_Record__c>();
        List<Id> recordsToDelete = new List<Id>();
        
        for(APD_Application__c apd : records) {
            // Create archive record with complete data
            Archive_Record__c archive = new Archive_Record__c(
                DOI_PAL_Original_Record_Id__c = apd.Id,
                DOI_PAL_Record_Type__c = 'APD_Application',
                DOI_PAL_Archive_Date__c = Date.today(),
                DOI_PAL_Data_Snapshot__c = JSON.serialize(apd),
                DOI_PAL_Final_Status__c = apd.DOI_PAL_Status__c,
                DOI_PAL_Decision_Date__c = apd.DOI_PAL_Final_Decision_Date__c
            );
            
            archiveRecords.add(archive);
            recordsToDelete.add(apd.Id);
        }
        
        // Insert archive records
        if(!archiveRecords.isEmpty()) {
            insert archiveRecords;
        }
        
        // Delete original records (cascade will handle related records)
        if(!recordsToDelete.isEmpty()) {
            delete [SELECT Id FROM APD_Application__c WHERE Id IN :recordsToDelete];
        }
        
        // Log archival activity
        System.debug('Archived ' + records.size() + ' APD records');
    }
    
    public void finish(Database.BatchableContext bc) {
        // Schedule next run for tomorrow
        if(!Test.isRunningTest()) {
            System.schedule(
                'DOI PAL Daily Archival ' + Datetime.now().format(),
                '0 0 2 * * ?', // 2 AM daily
                new DOI_PAL_DataArchivalService()
            );
        }
    }
}
```

## Conclusion

This comprehensive technical specification provides a complete implementation roadmap for the DOI Permits and Licensing system. The architecture leverages Salesforce platform capabilities while incorporating AI services, external integrations, and government compliance requirements.

Key implementation highlights:

### Technical Excellence
- **Scalable Architecture**: Supports thousands of concurrent users and applications
- **AI Integration**: Document validation, risk assessment, and intelligent routing
- **Multi-Agency Workflows**: Complex parallel and sequential review processes
- **Government Compliance**: FedRAMP, FISMA, Section 508, and federal security standards

### Performance & Reliability
- **Governor Limit Optimization**: Bulk processing patterns and efficient queries
- **Caching Strategy**: Platform cache for frequently accessed data
- **Error Handling**: Comprehensive exception handling and retry logic
- **Monitoring**: Real-time performance monitoring and alerting

### Security & Compliance
- **Role-Based Security**: Granular permissions based on agency and function
- **Data Protection**: Encryption, audit trails, and sensitive data controls
- **Integration Security**: Secure API connections and authentication
- **Compliance Reporting**: Automated audit logs and compliance dashboards

### User Experience
- **Intuitive Interfaces**: Guided wizards and responsive design
- **Real-Time Feedback**: AI-powered validation and status updates
- **Mobile Optimization**: Full functionality on tablets and smartphones
- **Accessibility**: Section 508 compliance for government users

The system transforms the traditional 30+ day APD processing timeline into an efficient, transparent, AI-enhanced platform that significantly reduces Time-to-Delivery while maintaining full regulatory compliance and environmental protection standards.

Implementation success requires close collaboration between development teams, subject matter experts, and end users throughout the 20-week development lifecycle, with iterative refinement based on real-world usage and stakeholder feedback.

---
*Document Version: 1.0*  
*Last Updated: September 3, 2025*  
*Total Pages: 87*  
*Contact: Salesforce Development Team*