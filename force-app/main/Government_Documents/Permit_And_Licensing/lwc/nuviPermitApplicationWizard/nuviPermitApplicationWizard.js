import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';

// Import AI-powered methods
import performPermitAnalysis from '@salesforce/apex/Nuvi_Permit_AIController.performPermitAnalysis';
import performLocationAnalysis from '@salesforce/apex/Nuvi_Permit_AIController.performLocationAnalysis';
import verifyPermitDocuments from '@salesforce/apex/Nuvi_Permit_AIController.verifyPermitDocuments';
import prefillPermitFormWithAI from '@salesforce/apex/Nuvi_Permit_AIController.prefillPermitFormWithAI';
import determineEnvironmentalLevel from '@salesforce/apex/Nuvi_Permit_AIController.determineEnvironmentalLevel';

// Import LLM configurations
import getLLMConfigurations from '@salesforce/apex/LLMControllerRefactored.getLLMConfigurations';

// Import document upload
import uploadPermitFile from '@salesforce/apex/Nuvi_Permit_DocumentController.uploadPermitFile';
import saveFromWizard from '@salesforce/apex/APDApplicationService.saveFromWizard';

export default class NuviPermitApplicationWizard extends NavigationMixin(LightningElement) {
    // Wizard state management
    @track currentStep = 1;
    @track totalSteps = 8;
    @track isLoading = false;
    @track isSaving = false;
    @track showAIAssistant = true;
    
    // AI configuration
    @track selectedLLM = 'Claude_3_5_Haiku';
    @track availableLLMs = [];
    @track aiAnalysisResults = {};
    @track aiRecommendations = [];
    @track aiFlags = [];

    // Form data
    @track permitFormData = {
        // Step 1: Operator Information (pre-filled from profile)
        operatorId: '',
        operatorName: '',
        operatorAddress: '',
        operatorPhone: '',
        operatorEmail: '',
        operatorCode: '',
        
        // Step 2: Lease & Location Information
        leaseNumber: '',
        legalDescription: '',
        latitude: null,
        longitude: null,
        county: '',
        state: '',
        blmFieldOffice: '',
        
        // Step 3: Well Information
        wellName: '',
        apiNumber: '',
        wellType: 'Vertical',
        totalDepth: null,
        surfaceLocation: '',
        bottomHoleLocation: '',
        
        // Step 4: Drilling Plan
        wellboreDesign: '',
        casingProgram: '',
        blowoutPreventionEquipment: '',
        mudProgram: '',
        expectedGeologicalFormations: '',
        
        // Step 5: Surface Use Plan (SUPO)
        wellPadLayout: '',
        accessRoads: '',
        pipelines: '',
        constructionMethods: '',
        reclamationPlan: '',
        wasteManagementPlan: '',
        
        // Step 6: Supporting Information
        bondingType: '',
        waterSourceDetails: '',
        culturalResourcesRequired: false,
        
        // Step 7: Document Upload & AI Verification
        uploadedDocuments: [],
        documentVerificationResults: null,
        
        // Step 8: Review & Submit
        feeAmount: 12515,
        priorityLevel: 'Standard',
        expectedSpudDate: null,
        operatorCertification: false
    };

    // Document upload tracking
    @track uploadedFiles = [];
    @track documentVerification = null;
    @track missingDocuments = [];

    // Location analysis results
    @track locationAnalysis = null;
    @track proximityAlerts = [];
    @track environmentalFlags = [];

    // Workflow predictions
    @track predictedNEPALevel = 'EA';
    @track estimatedProcessingTime = '90-120 days';
    @track requiredCoordinatingAgencies = [];

    // Wire methods
    @wire(getLLMConfigurations)
    wiredLLMConfigs(result) {
        if (result.data) {
            this.availableLLMs = result.data.map(config => ({
                label: config.Label,
                value: config.DeveloperName
            }));
        } else if (result.error) {
            console.error('Error loading LLM configurations:', result.error);
        }
    }

    // Getters for step management
    get isStep1() { return this.currentStep === 1; }
    get isStep2() { return this.currentStep === 2; }
    get isStep3() { return this.currentStep === 3; }
    get isStep4() { return this.currentStep === 4; }
    get isStep5() { return this.currentStep === 5; }
    get isStep6() { return this.currentStep === 6; }
    get isStep7() { return this.currentStep === 7; }
    get isStep8() { return this.currentStep === 8; }

    get progressPercentage() {
        return Math.round((this.currentStep / this.totalSteps) * 100);
    }

    get canProceedToNext() {
        switch (this.currentStep) {
            case 1: return this.isStep1Valid();
            case 2: return this.isStep2Valid();
            case 3: return this.isStep3Valid();
            case 4: return this.isStep4Valid();
            case 5: return this.isStep5Valid();
            case 6: return this.isStep6Valid();
            case 7: return this.isStep7Valid();
            case 8: return this.isStep8Valid();
            default: return false;
        }
    }

    get currentStepTitle() {
        const titles = {
            1: 'Operator Information',
            2: 'Lease & Location',
            3: 'Well Information', 
            4: 'Drilling Plan',
            5: 'Surface Use Plan',
            6: 'Supporting Information',
            7: 'Document Upload & Verification',
            8: 'Review & Submit'
        };
        return titles[this.currentStep];
    }

    get wellTypeOptions() {
        return [
            { label: 'Oil', value: 'Oil' },
            { label: 'Gas', value: 'Gas' },
            { label: 'Oil and Gas', value: 'Oil and Gas' },
            { label: 'Injection', value: 'Injection' },
            { label: 'Disposal', value: 'Disposal' },
            { label: 'Observation', value: 'Observation' },
            { label: 'Water Supply', value: 'Water Supply' },
            { label: 'Geothermal', value: 'Geothermal' },
            { label: 'CBM', value: 'CBM' }
        ];
    }

    get priorityLevelOptions() {
        return [
            { label: 'Standard (30-60 days)', value: 'Standard' },
            { label: 'Expedited (10-20 days)', value: 'Expedited' },
            { label: 'Emergency (1-5 days)', value: 'Emergency' }
        ];
    }

    get bondingTypeOptions() {
        return [
            { label: 'Individual Bond', value: 'Individual' },
            { label: 'Statewide Bond', value: 'Statewide' }
        ];
    }

    // Lifecycle methods
    connectedCallback() {
        this.initializeWizard();
    }

    // Initialization
    async initializeWizard() {
        this.isLoading = true;
        try {
            // Pre-fill operator information from user profile if available
            await this.prefillOperatorInformation();
            
            // Initialize AI assistant with welcome message
            this.aiRecommendations.push({
                type: 'info',
                title: 'Welcome to the Permit Application Wizard',
                message: 'I\'ll help guide you through the permit application process with intelligent suggestions and real-time validation.',
                timestamp: new Date().toLocaleTimeString()
            });

        } catch (error) {
            console.error('Error initializing wizard:', error);
            this.showToast('Error', 'Failed to initialize application wizard', 'error');
        } finally {
            this.isLoading = false;
        }
    }

    async prefillOperatorInformation() {
        try {
            // In a real implementation, this would fetch from user profile/account
            // For now, we'll simulate with placeholder data
            this.permitFormData.operatorName = 'Sample Operator LLC';
            this.permitFormData.operatorAddress = '123 Oil Field Road, Denver, CO 80202';
            this.permitFormData.operatorPhone = '(555) 123-4567';
            this.permitFormData.operatorEmail = 'operator@example.com';
        } catch (error) {
            console.error('Error prefilling operator information:', error);
        }
    }

    // Navigation methods
    handleNextStep() {
        if (this.canProceedToNext) {
            this.performStepValidationAndAdvance();
        }
    }

    async performStepValidationAndAdvance() {
        this.isLoading = true;
        
        try {
            switch (this.currentStep) {
                case 2:
                    await this.performLocationValidation();
                    break;
                case 3:
                    await this.performWellInformationValidation();
                    break;
                case 7:
                    await this.performDocumentVerification();
                    break;
                case 8:
                    await this.performFinalValidation();
                    return; // Don't advance, stay on submit step
            }
            
            this.currentStep++;
            this.addAIRecommendationForStep();
            
        } catch (error) {
            console.error('Error in step validation:', error);
            this.showToast('Error', 'Validation failed: ' + error.body?.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    handlePreviousStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
        }
    }

    // Location validation with AI analysis
    async performLocationValidation() {
        if (this.permitFormData.latitude && this.permitFormData.longitude) {
            try {
                const locationResult = await performLocationAnalysis({
                    applicationId: null, // No permit record yet
                    latitude: this.permitFormData.latitude,
                    longitude: this.permitFormData.longitude,
                    legalDescription: this.permitFormData.legalDescription,
                    selectedLLM: this.selectedLLM,
                    agencyType: 'FEDERAL',
                    permitType: 'DRILLING'
                });

                this.locationAnalysis = locationResult;
                this.proximityAlerts = locationResult.proximityAlerts || [];
                this.environmentalFlags = locationResult.environmentalFlags || [];
                this.predictedNEPALevel = locationResult.nepaLevelRecommended || 'EA';

                // Add AI recommendations based on location analysis
                if (this.proximityAlerts.length > 0) {
                    this.aiFlags.push({
                        type: 'warning',
                        title: 'Location Proximity Alert',
                        message: `Your proposed location is near sensitive areas: ${this.proximityAlerts.join(', ')}. This may require additional environmental review.`,
                        timestamp: new Date().toLocaleTimeString()
                    });
                }

                // Determine field office jurisdiction
                this.permitFormData.blmFieldOffice = this.determineFieldOffice(
                    this.permitFormData.latitude, 
                    this.permitFormData.longitude
                );

            } catch (error) {
                console.error('Location validation error:', error);
                this.showToast('Warning', 'Location analysis failed, but you can continue', 'warning');
            }
        }
    }

    // Well information validation
    async performWellInformationValidation() {
        try {
            // Validate API number format
            if (this.permitFormData.apiNumber && !this.isValidAPINumber(this.permitFormData.apiNumber)) {
                throw new Error('Invalid API number format. Must be 14 digits (XX-XXX-XXXXX-XX-XX)');
            }

            // AI analysis of well design feasibility
            const wellAnalysis = await this.analyzeWellDesignFeasibility();
            if (wellAnalysis.hasIssues) {
                this.aiFlags.push({
                    type: 'warning',
                    title: 'Well Design Review',
                    message: wellAnalysis.message,
                    timestamp: new Date().toLocaleTimeString()
                });
            }

        } catch (error) {
            throw error;
        }
    }

    // Document verification with AI
    async performDocumentVerification() {
        if (this.uploadedFiles.length === 0) {
            throw new Error('Please upload required documents before proceeding');
        }

        try {
            const documentIds = this.uploadedFiles.map(file => file.contentVersionId);
            const verificationResult = await verifyPermitDocuments({
                applicationId: null, // No permit record yet
                documentIds: documentIds,
                selectedLLM: this.selectedLLM,
                agencyType: 'FEDERAL',
                permitType: 'DRILLING'
            });

            this.documentVerification = verificationResult;
            this.missingDocuments = verificationResult.missingDocuments || [];

            if (verificationResult.completenessScore < 8) {
                this.aiFlags.push({
                    type: 'error',
                    title: 'Document Completeness Issues',
                    message: `Completeness score: ${verificationResult.completenessScore}/10. Missing: ${verificationResult.missingDocuments.join(', ')}`,
                    timestamp: new Date().toLocaleTimeString()
                });
            }

            // AI pre-fill suggestions based on documents
            if (documentIds.length > 0) {
                const prefillSuggestions = await prefillPermitFormWithAI({
                    documentIds: documentIds,
                    applicantId: this.permitFormData.operatorId,
                    selectedLLM: this.selectedLLM,
                    agencyType: 'FEDERAL',
                    permitType: 'DRILLING'
                });

                this.suggestFormPrefill(prefillSuggestions);
            }

        } catch (error) {
            console.error('Document verification error:', error);
            throw error;
        }
    }

    // Final validation before submit
    async performFinalValidation() {
        try {
            // Comprehensive AI analysis of complete application
            const finalAnalysis = await this.performComprehensiveAIAnalysis();
            
            if (finalAnalysis.riskLevel === 'High') {
                this.aiFlags.push({
                    type: 'error',
                    title: 'High Risk Application',
                    message: finalAnalysis.message,
                    timestamp: new Date().toLocaleTimeString()
                });
            }

            // Estimate processing timeline
            this.estimatedProcessingTime = this.calculateProcessingTime();
            
        } catch (error) {
            console.error('Final validation error:', error);
            throw error;
        }
    }

    // Form field handlers
    handleInputChange(event) {
        const fieldName = event.target.dataset.field;
        const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        
        this.permitFormData[fieldName] = value;

        // Trigger AI suggestions for certain fields
        if (['latitude', 'longitude', 'legalDescription'].includes(fieldName)) {
            this.debounceLocationAnalysis();
        }
    }

    // File upload handlers
    handleFileUpload(event) {
        const files = event.target.files;
        if (files.length > 0) {
            this.uploadFilesToSalesforce(Array.from(files));
        }
    }

    async uploadFilesToSalesforce(files) {
        this.isLoading = true;
        try {
            for (const file of files) {
                const base64 = await this.fileToBase64(file);
                
                // Determine document type based on filename
                const documentType = this.classifyDocumentType(file.name);
                
                const uploadResult = await uploadPermitFile({
                    applicationId: null, // No permit record yet - will be created on submit
                    folderName: 'Application_Documents',
                    fileName: file.name,
                    base64Data: base64,
                    contentType: file.type,
                    documentType: documentType,
                    workflowStage: 'Initial Submission',
                    agencyType: 'FEDERAL',
                    permitType: 'DRILLING'
                });

                this.uploadedFiles.push({
                    name: file.name,
                    type: documentType,
                    size: file.size,
                    contentVersionId: uploadResult.contentVersionId,
                    uploadDate: new Date().toLocaleDateString()
                });
            }

            this.showToast('Success', `${files.length} file(s) uploaded successfully`, 'success');
            
            // Trigger AI document analysis
            await this.analyzeUploadedDocuments();

        } catch (error) {
            console.error('File upload error:', error);
            this.showToast('Error', 'Failed to upload files: ' + error.body?.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    async analyzeUploadedDocuments() {
        if (this.uploadedFiles.length === 0) return;

        try {
            const documentIds = this.uploadedFiles.map(file => file.contentVersionId);
            const analysisResult = await verifyPermitDocuments({
                applicationId: null,
                documentIds: documentIds,
                selectedLLM: this.selectedLLM,
                agencyType: 'FEDERAL',
                permitType: 'DRILLING'
            });

            // Update UI with analysis results
            this.addAIAnalysisResults(analysisResult);

        } catch (error) {
            console.error('Document analysis error:', error);
        }
    }

    // AI Assistant methods
    addAIRecommendationForStep() {
        const stepRecommendations = {
            2: {
                type: 'info',
                title: 'Location Analysis Complete',
                message: `Based on your coordinates, I've determined jurisdiction and checked for proximity to sensitive areas. ${this.proximityAlerts.length > 0 ? 'Please review the proximity alerts.' : 'No immediate environmental concerns detected.'}`
            },
            3: {
                type: 'info',
                title: 'Well Information Review',
                message: `Well type: ${this.permitFormData.wellType}. Make sure your drilling plan aligns with the proposed well design.`
            },
            4: {
                type: 'info',
                title: 'Technical Review Ready',
                message: 'Your drilling plan will be reviewed by BLM petroleum engineers. Ensure all safety equipment specifications are complete.'
            },
            5: {
                type: 'info',
                title: 'Environmental Considerations',
                message: 'Surface use planning is critical for environmental compliance. Include detailed reclamation measures.'
            },
            7: {
                type: 'info',
                title: 'Document AI Analysis',
                message: `I've analyzed your uploaded documents. Completeness score: ${this.documentVerification?.completenessScore || 'Pending'}/10`
            }
        };

        if (stepRecommendations[this.currentStep]) {
            this.aiRecommendations.push({
                ...stepRecommendations[this.currentStep],
                timestamp: new Date().toLocaleTimeString()
            });
        }
    }

    suggestFormPrefill(suggestions) {
        if (Object.keys(suggestions).length > 0) {
            this.aiRecommendations.push({
                type: 'success',
                title: 'AI Form Pre-fill Suggestions',
                message: `I found ${Object.keys(suggestions).length} fields that can be pre-filled from your documents. Review and accept the suggestions.`,
                timestamp: new Date().toLocaleTimeString(),
                suggestions: suggestions
            });
        }
    }

    handleAcceptSuggestion(event) {
        const fieldName = event.target.dataset.field;
        const value = event.target.dataset.value;
        
        this.permitFormData[fieldName] = value;
        
        this.showToast('Success', `Updated ${fieldName} with AI suggestion`, 'success');
    }

    // Submit application
    async handleSubmitApplication() {
        this.isSaving = true;
        
        try {
            // Persist Permit Application and related details
            const saveResp = await saveFromWizard({
                applicationId: null,
                formDataJson: JSON.stringify(this.permitFormData)
            });
            const permitRecord = { Id: saveResp.applicationId };
            
            // Perform final AI analysis on complete application
            const finalAnalysis = await performPermitAnalysis({
                applicationId: permitRecord.Id,
                selectedLLM: this.selectedLLM,
                agencyType: 'FEDERAL',
                permitType: 'DRILLING'
            });

            // Determine environmental review level
            await determineEnvironmentalLevel({
                applicationId: permitRecord.Id,
                selectedLLM: this.selectedLLM,
                agencyType: 'FEDERAL',
                permitType: 'DRILLING'
            });

            this.showToast('Success', 'Permit Application submitted successfully!', 'success');
            
            // Navigate to the created permit record
            this[NavigationMixin.Navigate]({
                type: 'standard__recordPage',
                attributes: {
                    recordId: permitRecord.Id,
                    actionName: 'view'
                }
            });

        } catch (error) {
            console.error('Submit application error:', error);
            this.showToast('Error', 'Failed to submit application: ' + error.body?.message, 'error');
        } finally {
            this.isSaving = false;
        }
    }

    async createPermitRecord() {
        // Deprecated placeholder retained for backward compatibility
        const saveResp = await saveFromWizard({
            applicationId: null,
            formDataJson: JSON.stringify(this.permitFormData)
        });
        return { Id: saveResp.applicationId };
    }

    // Validation methods
    isStep1Valid() {
        return this.permitFormData.operatorName && 
               this.permitFormData.operatorAddress && 
               this.permitFormData.operatorEmail;
    }

    isStep2Valid() {
        return this.permitFormData.leaseNumber && 
               this.permitFormData.legalDescription && 
               this.permitFormData.latitude && 
               this.permitFormData.longitude;
    }

    isStep3Valid() {
        return this.permitFormData.wellName && 
               this.permitFormData.wellType && 
               this.permitFormData.totalDepth;
    }

    isStep4Valid() {
        return this.permitFormData.wellboreDesign && 
               this.permitFormData.casingProgram && 
               this.permitFormData.blowoutPreventionEquipment;
    }

    isStep5Valid() {
        return this.permitFormData.wellPadLayout && 
               this.permitFormData.reclamationPlan && 
               this.permitFormData.wasteManagementPlan;
    }

    isStep6Valid() {
        return this.permitFormData.bondingType;
    }

    isStep7Valid() {
        return this.uploadedFiles.length >= 3 && // Minimum required documents
               (!this.documentVerification || this.documentVerification.completenessScore >= 7);
    }

    isStep8Valid() {
        return this.permitFormData.operatorCertification && 
               this.permitFormData.expectedSpudDate;
    }

    // Utility methods
    isValidAPINumber(apiNumber) {
        // API number format validation (14 digits: XX-XXX-XXXXX-XX-XX)
        const apiRegex = /^\d{2}-\d{3}-\d{5}-\d{2}-\d{2}$/;
        return apiRegex.test(apiNumber);
    }

    classifyDocumentType(filename) {
        const name = filename.toLowerCase();
        if (name.includes('permit') || name.includes('application')) return 'PERMIT_FORM';
        if (name.includes('drilling') || name.includes('plan')) return 'WELL_PLAN';
        if (name.includes('supo') || name.includes('surface')) return 'SURFACE_PLAN';
        if (name.includes('survey') || name.includes('plat')) return 'SURVEY_PLAT';
        if (name.includes('bond')) return 'BOND_DOCUMENTATION';
        if (name.includes('cultural')) return 'CULTURAL_SURVEY';
        return 'SUPPORTING_DOCUMENT';
    }

    determineFieldOffice(latitude, longitude) {
        // Simplified field office determination based on location
        // In production, this would use actual GIS data
        if (latitude > 35 && latitude < 40 && longitude > -110 && longitude < -100) {
            return 'Socorro Field Office';
        }
        return 'Regional Field Office';
    }

    calculateProcessingTime() {
        let baseTime = 90; // Base processing time in days
        
        if (this.proximityAlerts.length > 0) baseTime += 30;
        if (this.predictedNEPALevel === 'EIS') baseTime += 180;
        if (this.permitFormData.priorityLevel === 'Expedited') baseTime = Math.max(20, baseTime * 0.5);
        if (this.permitFormData.priorityLevel === 'Emergency') baseTime = Math.max(5, baseTime * 0.2);
        
        return `${Math.round(baseTime)}-${Math.round(baseTime * 1.3)} days`;
    }

    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result.split(',')[1]);
            reader.onerror = error => reject(error);
        });
    }

    debounceLocationAnalysis = this.debounce(this.performLocationValidation.bind(this), 1000);

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    showToast(title, message, variant) {
        const event = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(event);
    }

    // Placeholder methods for AI analysis
    async analyzeWellDesignFeasibility() {
        return { hasIssues: false, message: '' };
    }

    async performComprehensiveAIAnalysis() {
        return { riskLevel: 'Low', message: 'Application appears complete and compliant' };
    }

    addAIAnalysisResults(results) {
        this.aiRecommendations.push({
            type: results.completenessScore >= 8 ? 'success' : 'warning',
            title: 'Document Analysis Complete',
            message: `Completeness: ${results.completenessScore}/10. ${results.missingDocuments?.length || 0} items need attention.`,
            timestamp: new Date().toLocaleTimeString()
        });
    }
}
