import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { NavigationMixin } from 'lightning/navigation';
import { getRecord, getRecordNotifyChange } from 'lightning/uiRecordApi';
import { createRecord } from 'lightning/uiRecordApi';
import { loadScript } from 'lightning/platformResourceLoader';
import { CurrentPageReference } from 'lightning/navigation';
import { FlowAttributeChangeEvent } from 'lightning/flowAttributes';

// Custom labels for localization support
import labelCaseCreated from '@salesforce/label/c.SupportRequester_CaseCreated';
import labelError from '@salesforce/label/c.SupportRequester_Error';
import labelSuccess from '@salesforce/label/c.SupportRequester_Success';

// Apex methods 
import saveSupportRecording from '@salesforce/apex/SupportRequesterController.saveSupportRecording';
import getAvailableApps from '@salesforce/apex/SupportRequesterController.getAvailableApps';

// Default instructions text if not provided through configuration
const DEFAULT_INSTRUCTIONS = `
<ul>
    <li>Fill out the support request form with as much detail as possible.</li>
    <li>You can optionally record your screen to help us better understand your issue.</li>
    <li>Click "Start Recording" to begin capturing your screen and narrating the issue.</li>
    <li>Click "Stop Recording" when finished and then submit your support request.</li>
    <li>A support agent will respond to your case as soon as possible.</li>
</ul>
`;

/**
 * Support Requester Component
 * 
 * Allows users to create support cases with screen recording attachments
 * Includes a dynamic FAQ section that can be configured by administrators
 */
export default class SupportRequester extends NavigationMixin(LightningElement) {
    // Public properties exposed for configuration
    @api recordTypeId;
    @api maxDuration = 300;
    @api folderName = 'Support Recordings';
    @api componentTitle = 'Support Request';
    @api primaryColor = '#22BDC1';
    @api accentColor = '#D5DF23';
    @api useDarkTheme = false;
    @api showInstructions = false;
    @api instructionsText;
    @api countdownDuration = 3;
    @api caseSubjectPrefix = '';
    
    // FAQ configuration properties
    @api showFaqSection = false;
    @api faqHeaderTitle = 'Frequently Asked Questions';
    @api showFaqAddButton = false;
    @api defaultFaqItems = '[{"question":"How do I submit a case?","answer":"Fill out the form, add a recording if needed, and click Submit."},{"question":"How long can my recording be?","answer":"Recordings can be up to 5 minutes long by default."}]';
    
    // Flow output property
    @api requestCompleted = false;
    
    // Internal tracked properties for component state
    @track caseSubject = '';
    @track caseDescription = '';
    @track casePriority = 'Medium';
    @track appContext = '';
    @track availableApps = [];
    @track faqItems = [];
    @track isProcessing = false;
    @track errorMessage = '';
    @track createdCaseId;
    @track createdCaseNumber;
    
    // Video recording state
    @track mediaStream;
    @track mediaRecorder;
    @track recordedChunks = [];
    @track videoUrl = '';
    @track recording = false;
    @track countdown = 3;
    @track recordingTime = 0;
    @track recordingTimeFormatted = '00:00';
    @track recordingTimer;
    @track showVideo = false;
    @track showPreview = false;
    @track showCountdown = false;
    @track streamActive = true;
    @track permissionDenied = false;
    
    // Modal state
    @track showFaqModal = false;
    @track showSuccessModal = false;
    @track faqModalTitle = 'Add FAQ Item';
    @track editFaqIndex = -1;
    @track editFaqQuestion = '';
    @track editFaqAnswer = '';
    
    // Toast message state
    @track showToast = false;
    @track toastTitle = '';
    @track toastMessage = '';
    @track toastClass = 'toast toast-info';
    @track toastIcon = 'utility:info';
    
    // Wire to current page reference to detect app context
    @wire(CurrentPageReference)
    pageRef;
    
    // Computed properties
    get recordButtonLabel() {
        return this.recording ? 'Stop Recording' : 'Start Recording';
    }
    
    get recordButtonVariant() {
        return this.recording ? 'destructive' : 'brand';
    }
    
    get recordButtonDisabled() {
        return this.isProcessing || this.permissionDenied;
    }
    
    get themeClass() {
        return this.useDarkTheme ? 'dark' : 'light';
    }
    
    get instructionsTextFormatted() {
        return this.instructionsText || DEFAULT_INSTRUCTIONS;
    }
    
    get isModalSaveDisabled() {
        return !this.editFaqQuestion.trim() || !this.editFaqAnswer.trim();
    }
    
    get isSubmitDisabled() {
        return !this.caseSubject.trim() || 
               !this.caseDescription.trim() || 
               this.isProcessing ||
               (this.recording);
    }
    
    // Lifecycle hooks
    connectedCallback() {
        this.loadStyles();
        this.loadApps();
        this.loadFaqItems();
        this.detectAppContext();
    }
    
    renderedCallback() {
        // Handle dynamic styling
        this.applyDynamicStyles();
    }
    
    disconnectedCallback() {
        this.stopMediaTracks();
        this.clearTimers();
    }
    
    /**
     * Applies custom styling based on configured colors
     */
    applyDynamicStyles() {
        const style = document.createElement('style');
        style.innerText = `
            :host {
                --primary-color: ${this.primaryColor};
                --primary-color-rgb: ${this.hexToRgb(this.primaryColor)};
                --primary-dark: ${this.darkenColor(this.primaryColor, 0.15)};
                --primary-light: ${this.lightenColor(this.primaryColor, 0.2)};
                --accent-color: ${this.accentColor};
                --accent-color-rgb: ${this.hexToRgb(this.accentColor)};
                --accent-dark: ${this.darkenColor(this.accentColor, 0.15)};
                --accent-light: ${this.lightenColor(this.accentColor, 0.2)};
            }
        `;
        
        this.template.querySelector('.support-requester-container').appendChild(style);
    }
    
    /**
     * Loads the list of available apps for context selection
     */
    loadApps() {
        getAvailableApps()
            .then(result => {
                this.availableApps = result.map(app => ({
                    label: app.label,
                    value: app.value
                }));
                
                // Set default app context if available
                if (this.availableApps.length > 0) {
                    this.appContext = this.availableApps[0].value;
                }
            })
            .catch(error => {
                console.error('Error loading apps:', error);
                this.showErrorToast('Error loading applications', error.message);
            });
    }
    
    /**
     * Detects the current app context from the URL if possible
     */
    detectAppContext() {
        if (this.pageRef && this.pageRef.state && this.pageRef.state.app) {
            const currentAppName = this.pageRef.state.app;
            // Update subject to include app context if prefix is provided
            if (this.caseSubjectPrefix) {
                this.caseSubject = `${this.caseSubjectPrefix} (${currentAppName})`;
            }
        }
    }
    
    /**
     * Loads FAQ items from the defaultFaqItems configuration
     */
    loadFaqItems() {
        try {
            const parsedItems = JSON.parse(this.defaultFaqItems);
            this.faqItems = parsedItems.map((item, index) => ({
                id: `faq-${index}`,
                question: item.question,
                answer: item.answer,
                isOpen: false,
                iconClass: 'faq-toggle',
                answerClass: 'faq-answer'
            }));
        } catch (error) {
            console.error('Error parsing FAQ items:', error);
            this.faqItems = [];
        }
    }
    
    /**
     * Applies custom styles for the component
     */
    loadStyles() {
        // Dynamic styling will be applied in renderedCallback
    }
    
    /**
     * Converts hex color to RGB format
     */
    hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        if (!result) return '0, 0, 0';
        
        const r = parseInt(result[1], 16);
        const g = parseInt(result[2], 16);
        const b = parseInt(result[3], 16);
        
        return `${r}, ${g}, ${b}`;
    }
    
    /**
     * Darkens a hex color by a specified amount
     */
    darkenColor(hex, amount) {
        let r = parseInt(hex.substring(1, 3), 16);
        let g = parseInt(hex.substring(3, 5), 16);
        let b = parseInt(hex.substring(5, 7), 16);

        r = Math.max(0, Math.floor(r * (1 - amount)));
        g = Math.max(0, Math.floor(g * (1 - amount)));
        b = Math.max(0, Math.floor(b * (1 - amount)));
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    /**
     * Lightens a hex color by a specified amount
     */
    lightenColor(hex, amount) {
        let r = parseInt(hex.substring(1, 3), 16);
        let g = parseInt(hex.substring(3, 5), 16);
        let b = parseInt(hex.substring(5, 7), 16);

        r = Math.min(255, Math.floor(r + (255 - r) * amount));
        g = Math.min(255, Math.floor(g + (255 - g) * amount));
        b = Math.min(255, Math.floor(b + (255 - b) * amount));
        
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    // ===== FORM HANDLING =====
    
    /**
     * Handles subject field changes
     */
    handleSubjectChange(event) {
        this.caseSubject = event.target.value;
    }
    
    /**
     * Handles description field changes
     */
    handleDescriptionChange(event) {
        this.caseDescription = event.target.value;
    }
    
    /**
     * Handles priority selection changes
     */
    handlePriorityChange(event) {
        this.casePriority = event.target.value;
    }
    
    /**
     * Handles app context selection changes
     */
    handleAppContextChange(event) {
        this.appContext = event.target.value;
    }
    
    /**
     * Submits the support case
     */
    handleSubmitCase() {
        if (this.isSubmitDisabled) return;
        
        this.isProcessing = true;
        this.errorMessage = '';
        
        // Prepare case fields
        const fields = {
            Subject: this.caseSubject,
            Description: this.caseDescription,
            Priority: this.casePriority,
            Origin: 'Web',
            Status: 'New'
        };
        
        // Add recordTypeId if provided
        if (this.recordTypeId) {
            fields.RecordTypeId = this.recordTypeId;
        }
        
        // Add application context if selected
        if (this.appContext) {
            fields.Application__c = this.appContext;
        }
        
        // Create case record
        const recordInput = { apiName: 'Case', fields };
        
        createRecord(recordInput)
            .then(caseRecord => {
                this.createdCaseId = caseRecord.id;
                this.createdCaseNumber = caseRecord.fields.CaseNumber.value;
                
                // If we have a video recording, upload it and link to the case
                if (this.showPreview && this.recordedChunks.length > 0) {
                    this.uploadRecording(this.createdCaseId);
                } else {
                    this.finalizeCaseCreation();
                }
            })
            .catch(error => {
                this.isProcessing = false;
                console.error('Error creating case:', error);
                this.errorMessage = `Error creating case: ${error.body?.message || error.message || 'Unknown error'}`;
                this.showErrorToast('Error creating case', this.errorMessage);
            });
    }
    
    /**
     * Uploads the recorded video and links it to the created case
     */
    uploadRecording(caseId) {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const reader = new FileReader();
        
        reader.onload = () => {
            const base64Data = reader.result.split(',')[1];
            const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
            const fileName = `Support_Recording_${timestamp}.webm`;
            
            saveSupportRecording({
                recordId: caseId,
                fileName: fileName,
                base64Data: base64Data,
                contentType: 'video/webm',
                folderName: this.folderName
            })
            .then(result => {
                console.log('Recording uploaded:', result);
                this.finalizeCaseCreation();
            })
            .catch(error => {
                console.error('Error uploading recording:', error);
                // Still show success as case was created, but note upload error
                this.showToastMessage(
                    'Case Created - Recording Failed', 
                    `Your case was created (${this.createdCaseNumber}) but the recording could not be uploaded.`,
                    'warning'
                );
                this.finalizeCaseCreation();
            });
        };
        
        reader.readAsDataURL(blob);
    }
    
    /**
     * Finalizes case creation by showing success and resetting the form
     */
    finalizeCaseCreation() {
        this.isProcessing = false;
        this.showSuccessModal = true;
        this.requestCompleted = true;
        
        // Notify any parent components (like flows) that creation is complete
        const createEvent = new CustomEvent('casecreated', {
            detail: {
                caseId: this.createdCaseId,
                caseNumber: this.createdCaseNumber
            }
        });
        this.dispatchEvent(createEvent);
    }
    
    /**
     * Closes the success modal and optionally resets the form
     */
    handleSuccessModalClose() {
        this.showSuccessModal = false;
        
        // Reset form for new submission
        this.resetForm();
    }
    
    /**
     * Resets the form for a new submission
     */
    resetForm() {
        this.caseSubject = '';
        this.caseDescription = '';
        this.casePriority = 'Medium';
        // Keep appContext as is for convenience
        
        // Reset recording state
        this.discardRecording();
        
        // Reset error state
        this.errorMessage = '';
    }
    
    // ===== RECORDING FUNCTIONALITY =====
    
    /**
     * Handles the record button click
     */
    handleRecordClick() {
        if (this.recording) {
            this.stopRecording();
        } else {
            this.startRecording();
        }
    }
    
    /**
     * Starts the recording process
     */
    startRecording() {
        this.permissionDenied = false;
        this.errorMessage = '';
        
        // Get screen recording with audio
        if (navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
            navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'always'
                },
                audio: true
            })
            .then(screenStream => {
                this.mediaStream = screenStream;
                
                // Also capture microphone audio if possible
                navigator.mediaDevices.getUserMedia({ audio: true, video: false })
                    .then(audioStream => {
                        // Combine screen and audio streams
                        const tracks = [
                            ...screenStream.getVideoTracks(),
                            ...audioStream.getAudioTracks()
                        ];
                        this.mediaStream = new MediaStream(tracks);
                        this.prepareRecording();
                    })
                    .catch(error => {
                        // Continue with just screen audio
                        console.warn('Microphone access denied, continuing with screen audio only:', error);
                        this.prepareRecording();
                    });
                
                // Set up stream ended handler
                screenStream.getVideoTracks()[0].onended = () => {
                    this.stopRecording();
                };
                
                this.showVideo = true;
                this.streamActive = true;
                
                // Show video preview
                const videoElement = this.template.querySelector('.video-element');
                if (videoElement) {
                    videoElement.srcObject = screenStream;
                }
            })
            .catch(error => {
                console.error('Error accessing screen:', error);
                this.permissionDenied = true;
                this.errorMessage = 'Screen sharing permission denied. Please allow screen sharing to record your issue.';
            });
        } else {
            this.permissionDenied = true;
            this.errorMessage = 'Screen recording is not supported in your browser. Please use Chrome, Edge, or Firefox.';
        }
    }
    
    /**
     * Prepares recording after streams are initialized
     */
    prepareRecording() {
        try {
            // Start countdown
            this.startCountdown();
        } catch (error) {
            console.error('Error preparing recording:', error);
            this.errorMessage = `Error preparing recording: ${error.message}`;
            this.stopMediaTracks();
        }
    }
    
    /**
     * Starts the countdown before recording
     */
    startCountdown() {
        this.countdown = this.countdownDuration;
        this.showCountdown = true;
        
        const countdownInterval = setInterval(() => {
            this.countdown--;
            
            if (this.countdown <= 0) {
                clearInterval(countdownInterval);
                this.showCountdown = false;
                this.initializeRecording();
            }
        }, 1000);
    }
    
    /**
     * Initializes the MediaRecorder and starts recording
     */
    initializeRecording() {
        try {
            // Initialize MediaRecorder
            this.mediaRecorder = new MediaRecorder(this.mediaStream, {
                mimeType: 'video/webm;codecs=vp9,opus'
            });
            
            // Set up event handlers
            this.mediaRecorder.ondataavailable = event => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                // Create URL for the recorded video
                const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
                this.videoUrl = URL.createObjectURL(blob);
                
                // Update UI state
                this.showPreview = true;
                this.streamActive = false;
                this.recording = false;
                
                // Stop all media tracks
                this.stopMediaTracks();
            };
            
            // Start recording
            this.recordedChunks = [];
            this.mediaRecorder.start(1000); // Collect data every second
            this.recording = true;
            
            // Start the recording timer
            this.startRecordingTimer();
            
            // Initialize progress bar
            this.updateProgressBar(0);
            
        } catch (error) {
            console.error('Error initializing recorder:', error);
            this.errorMessage = `Error initializing recorder: ${error.message}`;
            this.stopMediaTracks();
        }
    }
    
    /**
     * Starts the timer to track recording duration
     */
    startRecordingTimer() {
        this.recordingTime = 0;
        this.recordingTimeFormatted = '00:00';
        
        this.recordingTimer = setInterval(() => {
            this.recordingTime++;
            this.formatRecordingTime();
            this.updateProgressBar(this.recordingTime / this.maxDuration * 100);
            
            // Stop recording if max duration is reached
            if (this.recordingTime >= this.maxDuration) {
                this.stopRecording();
            }
        }, 1000);
    }
    
    /**
     * Updates the progress bar
     */
    updateProgressBar(percentage) {
        const progressBar = this.template.querySelector('.timer-bar');
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }
    }
    
    /**
     * Formats the recording time for display
     */
    formatRecordingTime() {
        const minutes = Math.floor(this.recordingTime / 60).toString().padStart(2, '0');
        const seconds = (this.recordingTime % 60).toString().padStart(2, '0');
        this.recordingTimeFormatted = `${minutes}:${seconds}`;
    }
    
    /**
     * Stops the recording
     */
    stopRecording() {
        if (this.mediaRecorder && this.recording) {
            this.mediaRecorder.stop();
            
            // Clear the timer
            this.clearTimers();
        }
    }
    
    /**
     * Discards the current recording
     */
    handleDiscardClick() {
        this.discardRecording();
    }
    
    /**
     * Discards the recording and resets state
     */
    discardRecording() {
        // Reset recording state
        this.videoUrl = '';
        this.recordedChunks = [];
        this.showPreview = false;
        this.showVideo = false;
        
        // Stop media tracks if still active
        this.stopMediaTracks();
    }
    
    /**
     * Stops all media tracks
     */
    stopMediaTracks() {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }
    }
    
    /**
     * Clears all timers
     */
    clearTimers() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
    }
    
    /**
     * Retries after permission denial
     */
    handleRetryPermissions() {
        this.permissionDenied = false;
        this.errorMessage = '';
        this.startRecording();
    }
    
    // ===== FAQ MANAGEMENT =====
    
    /**
     * Toggles the expansion state of an FAQ item
     */
    handleToggleFaq(event) {
        const index = parseInt(event.currentTarget.dataset.index, 10);
        
        // Toggle this one and close others
        this.faqItems = this.faqItems.map((item, i) => {
            const isOpen = i === index ? !item.isOpen : false;
            return {
                ...item,
                isOpen,
                iconClass: isOpen ? 'faq-toggle faq-toggle-open' : 'faq-toggle',
                answerClass: isOpen ? 'faq-answer faq-answer-open' : 'faq-answer'
            };
        });
    }
    
    /**
     * Opens the modal to add a new FAQ item
     */
    handleAddFaqClick() {
        this.editFaqIndex = -1;
        this.editFaqQuestion = '';
        this.editFaqAnswer = '';
        this.faqModalTitle = 'Add FAQ Item';
        this.showFaqModal = true;
    }
    
    /**
     * Opens the modal to edit an existing FAQ item
     */
    handleEditFaq(event) {
        event.stopPropagation();
        const index = parseInt(event.currentTarget.dataset.index, 10);
        const faq = this.faqItems[index];
        
        this.editFaqIndex = index;
        this.editFaqQuestion = faq.question;
        this.editFaqAnswer = faq.answer;
        this.faqModalTitle = 'Edit FAQ Item';
        this.showFaqModal = true;
    }
    
    /**
     * Deletes an FAQ item
     */
    handleDeleteFaq(event) {
        event.stopPropagation();
        const index = parseInt(event.currentTarget.dataset.index, 10);
        
        this.faqItems = this.faqItems.filter((_, i) => i !== index);
        
        // Show toast notification
        this.showToastMessage('FAQ Item Deleted', 'The FAQ item has been removed.', 'success');
    }
    
    /**
     * Handles FAQ question changes in the edit modal
     */
    handleFaqQuestionChange(event) {
        this.editFaqQuestion = event.target.value;
    }
    
    /**
     * Handles FAQ answer changes in the edit modal
     */
    handleFaqAnswerChange(event) {
        this.editFaqAnswer = event.target.value;
    }
    
    /**
     * Saves the FAQ edits
     */
    handleSaveFaq() {
        if (this.isModalSaveDisabled) return;
        
        if (this.editFaqIndex >= 0) {
            // Edit existing item
            this.faqItems = this.faqItems.map((item, index) => {
                if (index === this.editFaqIndex) {
                    return {
                        ...item,
                        question: this.editFaqQuestion,
                        answer: this.editFaqAnswer
                    };
                }
                return item;
            });
            
            this.showToastMessage('FAQ Item Updated', 'The FAQ item has been updated.', 'success');
        } else {
            // Add new item
            const newItem = {
                id: `faq-${this.faqItems.length}`,
                question: this.editFaqQuestion,
                answer: this.editFaqAnswer,
                isOpen: false,
                iconClass: 'faq-toggle',
                answerClass: 'faq-answer'
            };
            
            this.faqItems = [...this.faqItems, newItem];
            this.showToastMessage('FAQ Item Added', 'A new FAQ item has been added.', 'success');
        }
        
        this.handleCloseModal();
    }
    
    /**
     * Closes the FAQ edit modal
     */
    handleCloseModal() {
        this.showFaqModal = false;
    }
    
    // ===== UTILITY METHODS =====
    
    /**
     * Shows a toast message
     */
    showToastMessage(title, message, variant) {
        // Set toast properties
        this.toastTitle = title;
        this.toastMessage = message;
        this.toastClass = `toast toast-${variant}`;
        
        // Set appropriate icon
        switch (variant) {
            case 'success':
                this.toastIcon = 'utility:success';
                break;
            case 'error':
                this.toastIcon = 'utility:error';
                break;
            case 'warning':
                this.toastIcon = 'utility:warning';
                break;
            default:
                this.toastIcon = 'utility:info';
        }
        
        // Show toast
        this.showToast = true;
        
        // Hide after delay
        setTimeout(() => {
            this.showToast = false;
        }, 5000);
    }
    
    /**
     * Shows an error toast message
     */
    showErrorToast(title, message) {
        this.showToastMessage(title, message, 'error');
    }
    
    /**
     * Shows a success toast message
     */
    showSuccessToast(title, message) {
        this.showToastMessage(title, message, 'success');
    }

    handleSubmitSuccess(event) {
        // Get the created case ID
        const caseId = event.detail.id;
        this.isLoading = false;
        this.isCaseCreated = true;
        
        // If we have a recording that needs to be saved, attach it to the case
        if (this.recordingData) {
            this.saveRecording(caseId)
                .then(() => {
                    this.showToast('Success', 'Support request submitted successfully with screen recording', 'success');
                    // For flow screens, update the output property
                    this.requestCompleted = true;
                    this.dispatchEvent(new FlowAttributeChangeEvent('requestCompleted', true));
                })
                .catch(error => {
                    console.error('Error saving recording:', error);
                    this.showToast('Success', 'Support request submitted successfully, but there was an error attaching the recording', 'warning');
                });
        } else {
            this.showToast('Success', 'Support request submitted successfully', 'success');
            // For flow screens, update the output property
            this.requestCompleted = true;
            this.dispatchEvent(new FlowAttributeChangeEvent('requestCompleted', true));
        }
    }
} 