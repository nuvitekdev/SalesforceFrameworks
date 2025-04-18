import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { createRecord } from 'lightning/uiRecordApi';
import { CurrentPageReference } from 'lightning/navigation';

// Apex methods 
import saveSupportRecording from '@salesforce/apex/SupportRequesterController.saveSupportRecording';
import createSupportCase from '@salesforce/apex/SupportRequesterController.createSupportCase';

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
    
    // Media capture configuration
    @api enableScreenRecording = false;
    @api enableScreenshot = false;
    @api captureMode = ''; // This will be determined by enableScreenRecording and enableScreenshot
    
    // FAQ configuration properties
    @api showFaqSection = false;
    @api faqHeaderTitle = 'Frequently Asked Questions';
    @api defaultFaqItems = '[{"question":"How do I submit a case?","answer":"Fill out the form, add a recording if needed, and click Submit."},{"question":"How long can my recording be?","answer":"Recordings can be up to 5 minutes long by default."}]';
    @api layoutOrientation = 'horizontal';
    
    // Flow output property
    @api requestCompleted = false;
    
    // Internal tracked properties for component state
    @track caseSubject = '';
    @track caseDescription = '';
    @track casePriority = 'Medium';
    @track appContext = '';
    @track faqItems = [];
    @track isProcessing = false;
    @track errorMessage = '';
    @track createdCaseId;
    @track createdCaseNumber;
    
    // Media capture state
    @track mediaStream;
    @track mediaRecorder;
    @track recordedChunks = [];
    @track videoUrl = '';
    @track screenshotUrl = '';
    @track recording = false;
    @track countdown = 3;
    @track recordingTime = 0;
    @track recordingTimeFormatted = '00:00';
    @track recordingTimer;
    @track showVideo = false;
    @track showPreview = false;
    @track showScreenshot = false;
    @track showCountdown = false;
    @track streamActive = true;
    @track permissionDenied = false;
    @track screenshotPermissionDenied = false;
    @track screenshotErrorMessage = '';
    
    // Success Modal state
    @track showSuccessModal = false;
    
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
    
    get screenshotButtonDisabled() {
        return this.isProcessing || this.screenshotPermissionDenied;
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
    
    get isSubmitDisabled() {
        return !this.caseSubject.trim() || 
               !this.caseDescription.trim() || 
               this.isProcessing ||
               (this.recording);
    }
    
    get layoutClass() {
        return this.layoutOrientation === 'vertical' ? 'support-layout-vertical' : 'support-layout-horizontal';
    }
    
    // Determine the effective captureMode based on what's enabled
    get effectiveCaptureMode() {
        if (this.enableScreenRecording && this.enableScreenshot) {
            return this.captureMode || 'both';
        } else if (this.enableScreenRecording) {
            return 'recording';
        } else if (this.enableScreenshot) {
            return 'screenshot';
        } else {
            return this.captureMode || 'recording';
        }
    }
    
    get showRecordingOption() {
        // If enableScreenRecording is true or not explicitly set, show recording option
        return this.enableScreenRecording !== false;
    }
    
    get showScreenshotOption() {
        return this.enableScreenshot && (this.effectiveCaptureMode === 'screenshot' || this.effectiveCaptureMode === 'both');
    }
    
    get showMediaTypeTabs() {
        return this.enableScreenRecording && this.enableScreenshot && this.effectiveCaptureMode === 'both';
    }
    
    get isRecordingActive() {
        return this.recording;
    }
    
    get isScreenshotActive() {
        return this.showScreenshot;
    }
    
    get recordingTabClass() {
        return this.recording ? 'media-tab media-tab-active' : 'media-tab';
    }
    
    get screenshotTabClass() {
        return this.showScreenshot ? 'media-tab media-tab-active' : 'media-tab';
    }
    
    get showMediaSection() {
        // Always show media section by default, to match previous behavior
        return true;
    }
    
    // New getter to determine if download button should be shown
    get showDownloadButton() {
        return this.showPreview && this.recordedChunks.length > 0;
    }
    
    // Dynamic instructions title based on enabled features
    get instructionsTitle() {
        if (this.enableScreenRecording && this.enableScreenshot) {
            return 'Recording and Screenshot Instructions';
        } else if (this.enableScreenRecording) {
            return 'Recording Instructions';
        } else if (this.enableScreenshot) {
            return 'Screenshot Instructions';
        } else {
            return 'Instructions';
        }
    }
    
    // Lifecycle hooks
    connectedCallback() {
        this.loadStyles();
        this.detectAppContext();
        this.loadFaqItemsFromConfig();
        this.enableScreenRecording = true;
        this.showInstructions = true;
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
     * Detects the application context from the current page
     */
    detectAppContext() {
        if (this.pageRef) {
            // Logic to detect app context from page reference
            // Example: extract app name from URL or attributes
        }
    }
    
    /**
     * Loads FAQ items from the defaultFaqItems configuration
     */
    loadFaqItemsFromConfig() {
        try {
            const parsedItems = JSON.parse(this.defaultFaqItems);
            this.faqItems = parsedItems.map((item, index) => ({
                id: `default-${index}`,
                question: item.question,
                answer: item.answer,
                category: 'General',
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
     * Handles app context field changes
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
        
        // Create case using Apex controller
        createSupportCase({
            subject: this.caseSubject,
            description: this.caseDescription,
            priority: this.casePriority,
            applicationContext: this.appContext
        })
        .then(caseId => {
            // Store the created case ID
            this.createdCaseId = caseId;
            
            // Get the Case Number (will need to query for this in a real implementation)
            this.createdCaseNumber = 'Case-' + Math.floor(Math.random() * 10000); // Placeholder
            
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
        // Create an array to hold all our upload promises
        const uploadPromises = [];
        let recordingUploadStarted = false;
        let screenshotUploadStarted = false;
        
        // Handle video upload
        if (this.showPreview && this.recordedChunks.length > 0) {
            recordingUploadStarted = true;
            const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
            const reader = new FileReader();
            
            const recordingPromise = new Promise((resolve, reject) => {
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
                        resolve(result);
                    })
                    .catch(error => {
                        console.error('Error uploading recording:', error);
                        // Show warning toast but continue
                        this.showToastMessage(
                            'Recording Upload Failed', 
                            'Your recording could not be uploaded, but the case was created.',
                            'warning'
                        );
                        resolve(null); // Resolve with null to allow other uploads to continue
                    });
                };
                
                reader.onerror = () => {
                    reject(new Error('Failed to read recording file'));
                };
                
                reader.readAsDataURL(blob);
            });
            
            uploadPromises.push(recordingPromise);
        } 
        
        // Handle screenshot upload - now a separate condition, not an else-if
        if (this.showScreenshot && this.screenshotUrl) {
            screenshotUploadStarted = true;
            const base64Data = this.screenshotUrl.split(',')[1];
            const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
            const fileName = `Support_Screenshot_${timestamp}.png`;
            
            const screenshotPromise = saveSupportRecording({
                recordId: caseId,
                fileName: fileName,
                base64Data: base64Data,
                contentType: 'image/png',
                folderName: this.folderName
            })
            .then(result => {
                console.log('Screenshot uploaded:', result);
                return result;
            })
            .catch(error => {
                console.error('Error uploading screenshot:', error);
                // Show warning toast but continue
                this.showToastMessage(
                    'Screenshot Upload Failed', 
                    'Your screenshot could not be uploaded, but the case was created.',
                    'warning'
                );
                return null; // Return null to allow other uploads to continue
            });
            
            uploadPromises.push(screenshotPromise);
        }
        
        // If we have started any uploads, wait for all to complete
        if (uploadPromises.length > 0) {
            Promise.all(uploadPromises)
                .then(() => {
                    // Show appropriate success message based on what was uploaded
                    if (recordingUploadStarted && screenshotUploadStarted) {
                        this.showSuccessToast('Case Created', 'Your case and media attachments were successfully submitted.');
                    } else if (recordingUploadStarted) {
                        this.showSuccessToast('Case Created', 'Your case and screen recording were successfully submitted.');
                    } else if (screenshotUploadStarted) {
                        this.showSuccessToast('Case Created', 'Your case and screenshot were successfully submitted.');
                    }
                    this.finalizeCaseCreation();
                })
                .catch(error => {
                    console.error('Error in uploads:', error);
                    this.showToastMessage(
                        'Case Created - Attachments Failed', 
                        `Your case was created (${this.createdCaseNumber}) but one or more attachments could not be uploaded.`,
                        'warning'
                    );
                    this.finalizeCaseCreation();
                });
        } else {
            // No uploads to do, just finalize the case
            this.finalizeCaseCreation();
        }
    }
    
    /**
     * Finalizes the case creation process
     */
    finalizeCaseCreation() {
        // Set the processing state to false
        this.isProcessing = false;
        
        // Show success modal
        this.showSuccessModal = true;
        
        // Set the completion flag for Flow
        this.requestCompleted = true;
        
        // Dispatch event to notify parent components
        this.dispatchEvent(new CustomEvent('casecreated', {
            detail: {
                caseId: this.createdCaseId,
                caseNumber: this.createdCaseNumber
            }
        }));
    }
    
    /**
     * Closes the success modal and resets the form
     */
    handleSuccessModalClose() {
        this.showSuccessModal = false;
        this.resetForm();
    }
    
    /**
     * Resets the form after submission
     */
    resetForm() {
        // Reset form fields
        this.caseSubject = '';
        this.caseDescription = '';
        this.casePriority = 'Medium';
        this.appContext = '';
        
        // Reset media state
        this.discardRecording();
        this.discardScreenshot();
        
        // Reset other state
        this.errorMessage = '';
        this.createdCaseId = null;
        this.createdCaseNumber = null;
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
     * Starts the screen recording process
     */
    startRecording() {
        if (this.recording) return;
        
        // First get user permissions for screen recording
        this.prepareRecording()
            .then(() => {
                this.startCountdown();
            })
            .catch(error => {
                console.error('Error preparing recording:', error);
                this.permissionDenied = true;
                this.errorMessage = 'Screen recording permission denied. Please allow screen sharing to record your issue.';
            });
    }
    
    /**
     * Prepares the screen recording by requesting permissions
     */
    prepareRecording() {
        return new Promise((resolve, reject) => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                reject(new Error('Screen recording is not supported in this browser.'));
                return;
            }
            
            // Reset any existing recording state
            this.stopMediaTracks();
            this.recordedChunks = [];
            this.permissionDenied = false;
            this.errorMessage = '';
            
            // Request screen sharing with audio
            navigator.mediaDevices.getDisplayMedia({ 
                video: { 
                    cursor: 'always',
                    frameRate: { ideal: 30 }
                },
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    sampleRate: 44100
                }
            })
            .then(screenStream => {
                // We need to explicitly get audio from the user's microphone
                navigator.mediaDevices.getUserMedia({ 
                    audio: {
                        echoCancellation: true,
                        noiseSuppression: true,
                        sampleRate: 44100
                    }
                })
                .then(audioStream => {
                    // Combine both streams
                    const combinedStream = new MediaStream();
                    
                    // Add all video tracks from screen stream
                    screenStream.getVideoTracks().forEach(track => {
                        combinedStream.addTrack(track);
                    });
                    
                    // Add all audio tracks from microphone stream
                    audioStream.getAudioTracks().forEach(track => {
                        combinedStream.addTrack(track);
                    });
                    
                    this.mediaStream = combinedStream;
                    this.showVideo = true;
                    this.streamActive = true;
                    
                    // Set the video element source
                    const videoElement = this.template.querySelector('.video-element');
                    if (videoElement) {
                        videoElement.srcObject = combinedStream;
                        videoElement.muted = true; // Mute during recording to prevent feedback
                    }
                    
                    resolve();
                })
                .catch(error => {
                    // Fall back to just screen with system audio if mic access fails
                    console.warn('Microphone access denied, falling back to screen only:', error);
                    this.mediaStream = screenStream;
                    this.showVideo = true;
                    this.streamActive = true;
                    
                    // Set the video element source
                    const videoElement = this.template.querySelector('.video-element');
                    if (videoElement) {
                        videoElement.srcObject = screenStream;
                        videoElement.muted = true;
                    }
                    
                    resolve();
                });
            })
            .catch(error => {
                console.error('Permission error:', error);
                reject(error);
            });
        });
    }
    
    /**
     * Starts the countdown before recording begins
     */
    startCountdown() {
        this.countdown = this.countdownDuration;
        this.showCountdown = true;
        
        const countdownInterval = setInterval(() => {
            this.countdown -= 1;
            
            if (this.countdown <= 0) {
                clearInterval(countdownInterval);
                this.showCountdown = false;
                this.initializeRecording();
            }
        }, 1000);
    }
    
    /**
     * Initializes the recording after countdown
     */
    initializeRecording() {
        if (!this.mediaStream) return;
        
        try {
            // Create MediaRecorder instance with appropriate MIME type and bitrate
            const options = { 
                mimeType: 'video/webm;codecs=vp9,opus',
                videoBitsPerSecond: 2500000, // 2.5 Mbps
                audioBitsPerSecond: 128000   // 128 kbps
            };
            
            try {
                this.mediaRecorder = new MediaRecorder(this.mediaStream, options);
            } catch (e) {
                // Fallback if preferred codecs are not supported
                console.warn('Preferred codec not supported, using default:', e);
                this.mediaRecorder = new MediaRecorder(this.mediaStream);
            }
            
            // Set up event handlers
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data && event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = () => {
                // Create video URL from chunks
                const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
                this.videoUrl = URL.createObjectURL(blob);
                
                // Update UI
                this.showPreview = true;
                this.streamActive = false;
                this.recording = false;
                
                // Make sure video element has all needed attributes for playback
                const videoElement = this.template.querySelector('.video-element');
                if (videoElement) {
                    // Remove the stream source object
                    videoElement.srcObject = null;
                    // Set the blob URL
                    videoElement.src = this.videoUrl;
                    videoElement.controls = true;
                    videoElement.muted = false; // Unmute for playback
                    videoElement.autoplay = false;
                    videoElement.load(); // Force reload with new source
                }
                
                // Stop all tracks
                this.stopMediaTracks();
            };
            
            // Start recording with 1s segments
            this.mediaRecorder.start(1000);
            
            // Update state
            this.recording = true;
            this.recordingTime = 0;
            this.recordingTimeFormatted = '00:00';
            
            // Start timer
            this.startRecordingTimer();
            
        } catch (error) {
            console.error('Error initializing recording:', error);
            this.errorMessage = `Error initializing recording: ${error.message}`;
            this.stopMediaTracks();
        }
    }
    
    /**
     * Starts the timer to track recording duration
     */
    startRecordingTimer() {
        // Clear any existing timer
        this.clearTimers();
        
        // Start a new timer
        this.recordingTimer = setInterval(() => {
            this.recordingTime += 1;
            this.recordingTimeFormatted = this.formatRecordingTime();
            
            // Update progress bar
            const percentage = (this.recordingTime / this.maxDuration) * 100;
            this.updateProgressBar(percentage);
            
            // Auto-stop when max duration is reached
            if (this.recordingTime >= this.maxDuration) {
                this.stopRecording();
            }
        }, 1000);
    }
    
    /**
     * Updates the recording progress bar
     */
    updateProgressBar(percentage) {
        const progressBar = this.template.querySelector('.timer-bar');
        if (progressBar) {
            progressBar.style.width = `${percentage}%`;
        }
    }
    
    /**
     * Formats the recording time as MM:SS
     */
    formatRecordingTime() {
        const minutes = Math.floor(this.recordingTime / 60);
        const seconds = this.recordingTime % 60;
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
    
    /**
     * Stops the current recording
     */
    stopRecording() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        
        this.clearTimers();
        this.recording = false;
    }
    
    /**
     * Handles discard button click
     */
    handleDiscardClick() {
        this.discardRecording();
    }
    
    /**
     * Discards the current recording
     */
    discardRecording() {
        // Clear recording data
        this.recordedChunks = [];
        this.videoUrl = '';
        
        // Reset UI state
        this.showVideo = false;
        this.showPreview = false;
        this.recording = false;
        this.streamActive = true;
        
        // Stop media tracks
        this.stopMediaTracks();
        
        // Clear timers
        this.clearTimers();
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
     * Clears all active timers
     */
    clearTimers() {
        if (this.recordingTimer) {
            clearInterval(this.recordingTimer);
            this.recordingTimer = null;
        }
    }
    
    /**
     * Handles retry permissions button click
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
    
    /**
     * Takes a screenshot of the current screen
     */
    handleTakeScreenshot() {
        if (this.isProcessing || this.screenshotPermissionDenied) return;
        
        this.prepareScreenCapture()
            .then(() => {
                // Take screenshot immediately without countdown
                this.captureScreenshot();
            })
            .catch(error => {
                console.error('Error preparing screen capture:', error);
                this.screenshotPermissionDenied = true;
                this.screenshotErrorMessage = 'Screen capture permission denied. Please allow screen sharing to capture your screen.';
            });
    }
    
    /**
     * Prepares the screen capture by requesting permissions
     */
    prepareScreenCapture() {
        return new Promise((resolve, reject) => {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
                reject(new Error('Screen capture is not supported in this browser.'));
                return;
            }
            
            // Reset any existing capture state
            this.stopMediaTracks();
            this.permissionDenied = false;
            this.errorMessage = '';
            
            // Request screen sharing
            navigator.mediaDevices.getDisplayMedia({ 
                video: { 
                    cursor: 'always'
                },
                audio: false // No audio needed for screenshots
            })
            .then(stream => {
                this.mediaStream = stream;
                
                // For screenshots, we don't need to display the video stream
                if (this.recording) {
                    this.showVideo = true;
                    this.streamActive = true;
                    
                    // Set the video element source
                    const videoElement = this.template.querySelector('.video-element');
                    if (videoElement) {
                        videoElement.srcObject = stream;
                    }
                }
                
                resolve();
            })
            .catch(error => {
                console.error('Permission error:', error);
                reject(error);
            });
        });
    }
    
    /**
     * Captures a screenshot from the media stream
     */
    captureScreenshot() {
        if (!this.mediaStream) return;
        
        try {
            // Create a video element to capture the frame
            const videoElement = document.createElement('video');
            videoElement.srcObject = this.mediaStream;
            
            videoElement.onloadedmetadata = () => {
                // Play the video (required to capture frame)
                videoElement.play();
                
                // Wait a small amount of time to ensure video is playing
                setTimeout(() => {
                    // Create a canvas to draw the screenshot
                    const canvas = document.createElement('canvas');
                    canvas.width = videoElement.videoWidth;
                    canvas.height = videoElement.videoHeight;
                    
                    // Draw the video frame to the canvas
                    const context = canvas.getContext('2d');
                    context.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
                    
                    // Convert to data URL
                    this.screenshotUrl = canvas.toDataURL('image/png');
                    
                    // Update UI
                    this.showScreenshot = true;
                    this.streamActive = false;
                    
                    // Stop all tracks
                    this.stopMediaTracks();
                    
                    // Clean up
                    videoElement.pause();
                    videoElement.srcObject = null;
                }, 100);
            };
        } catch (error) {
            console.error('Error capturing screenshot:', error);
            this.errorMessage = `Error capturing screenshot: ${error.message}`;
            this.stopMediaTracks();
        }
    }
    
    /**
     * Discards the current screenshot
     */
    discardScreenshot() {
        // Clear screenshot data
        this.screenshotUrl = '';
        
        // Reset UI state
        this.showScreenshot = false;
        this.streamActive = true;
        
        // Stop media tracks
        this.stopMediaTracks();
    }
    
    /**
     * Handles discard button click for screenshot
     */
    handleDiscardScreenshot() {
        this.discardScreenshot();
    }
    
    /**
     * Retry screenshot permissions after they've been denied
     */
    handleRetryScreenshotPermissions() {
        this.screenshotPermissionDenied = false;
        this.screenshotErrorMessage = '';
        this.handleTakeScreenshot();
    }
    
    /**
     * Handles downloading the recorded video
     */
    handleDownloadClick() {
        if (!this.recordedChunks.length || !this.videoUrl) {
            this.showToastMessage('Error', 'No video available to download', 'error');
            return;
        }

        try {
            // Create a temporary anchor element
            const downloadLink = document.createElement('a');
            
            // Set its href to the video URL
            downloadLink.href = this.videoUrl;
            
            // Set the download attribute with a filename
            const timestamp = new Date().toISOString().replace(/[-:.]/g, '');
            const fileName = `Support_Recording_${timestamp}.webm`;
            downloadLink.download = fileName;
            
            // Append to body, click and remove
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
            this.showToastMessage('Success', 'Video download started', 'success');
        } catch (error) {
            console.error('Error downloading video:', error);
            this.showToastMessage('Error', 'Failed to download video', 'error');
        }
    }
} 