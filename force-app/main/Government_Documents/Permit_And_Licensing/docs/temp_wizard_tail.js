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
            // Create Permit Application record with all form data
            const permitRecord = await this.createPermitRecord();
            
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
        // This would create the actual Permit_Application__c record
        // For now, return a mock record ID
        return { Id: 'a03000000000001' };
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
