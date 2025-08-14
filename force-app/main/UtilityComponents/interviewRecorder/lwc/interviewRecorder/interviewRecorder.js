import { LightningElement, api, track } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { FlowAttributeChangeEvent } from "lightning/flowSupport";
import saveInterviewRecording from "@salesforce/apex/InterviewRecorderController.saveInterviewRecording";

export default class InterviewRecorder extends LightningElement {
  // API properties from configuration
  @api recordId; // Optional override for record ID
  @api maxDuration = 300; // Maximum recording duration in seconds (default: 5 minutes)
  @api folderName = "Interview Recordings"; // Default folder name
  @api recordingCompleted = false; // Flow output attribute

  // UI customization properties
  @api componentTitle = "Video Interview Recorder";
  @api showInstructions = false;
  @api instructionsTitle = "Interview Recording Instructions";
  @api primaryColor = "#22BDC1";
  @api accentColor = "#D5DF23";
  @api countdownDuration = 3;
  @api customButtonClasses = "";

  // Tracked state properties
  @track recording = false;
  @track countdown = 3; // Initial countdown before recording starts
  @track recordingTime = 0;
  @track showCountdown = false;
  @track videoUrl = null;
  @track recordedBlob = null;
  @track showPreview = false;
  @track isProcessing = false;
  @track errorMessage = "";
  @track streamActive = false;
  @track permissionDenied = false;

  // Private member variables
  mediaRecorder;
  recordedChunks = [];
  countdownInterval;
  recordingInterval;
  stream;

  // Lifecycle hooks
  connectedCallback() {
    // Set the countdown from the configurable property
    this.countdown = this.countdownDuration;

    // Initialize camera when component loads
    this.initializeCamera();
  }

  renderedCallback() {
    // Apply dynamic styles based on configuration
    this.applyCustomStyles();

    // Connect stream to video only if we're not showing a preview
    if (this.stream && !this.showPreview) {
      this.connectStreamToVideo();
    }

    // Update progress bar width programmatically
    if (this.recording) {
      const timerBar = this.template.querySelector(".timer-bar");
      if (timerBar) {
        timerBar.style.width = `${this.recordingTimePercent}%`;
      }
    }
  }

  disconnectedCallback() {
    this.stopStream();
  }

  // Apply custom styles based on configuration properties
  applyCustomStyles() {
    const root = this.template.host;

    // Apply custom colors
    root.style.setProperty("--primary-color", this.primaryColor);
    root.style.setProperty(
      "--primary-gradient",
      `linear-gradient(90deg, ${this.primaryColor} 0%, ${this.accentColor} 100%)`
    );
    root.style.setProperty("--accent-color", this.accentColor);
    root.style.setProperty(
      "--accent-gradient",
      `linear-gradient(90deg, ${this.accentColor} 0%, ${this.adjustColor(this.accentColor, -20)} 100%)`
    );

    // Determine text colors based on background brightness
    const accentTextColor = this.getContrastingTextColor(this.accentColor);
    const primaryTextColor = this.getContrastingTextColor(this.primaryColor);

    // Apply text colors
    root.style.setProperty("--accent-text-color", accentTextColor);
    root.style.setProperty("--primary-text-color", primaryTextColor);

    // Set button text colors based on background
    setTimeout(() => {
      const brandButtons = this.template.querySelectorAll(
        '.primary-action .control-button:not([variant="destructive"])'
      );
      if (brandButtons.length) {
        brandButtons.forEach((btn) => {
          btn.style.setProperty("--slds-c-button-text-color", accentTextColor);
        });
      }
    }, 0);

    // Apply custom classes to buttons if configured
    if (this.customButtonClasses) {
      const buttons = this.template.querySelectorAll("lightning-button");
      buttons.forEach((button) => {
        this.customButtonClasses.split(" ").forEach((cls) => {
          button.classList.add(cls);
        });
      });
    }
  }

  // Utility function to determine if text should be black or white based on background color brightness
  getContrastingTextColor(hexColor) {
    // Default to black if no color provided
    if (!hexColor) return "#000000";

    // Handle rgba format
    if (hexColor.startsWith("rgba")) {
      const rgbaValues = hexColor.match(
        /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*(\d+(?:\.\d+)?))?\)/
      );
      if (rgbaValues) {
        const r = parseInt(rgbaValues[1], 10);
        const g = parseInt(rgbaValues[2], 10);
        const b = parseInt(rgbaValues[3], 10);
        // Calculate brightness using YIQ formula
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        // Return black for light backgrounds, white for dark backgrounds
        return brightness >= 128 ? "#000000" : "#ffffff";
      }
    }

    // Convert 3-char hex to 6-char
    let hex = hexColor.replace("#", "");
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((char) => char + char)
        .join("");
    }

    // Handle hex format
    if (hex.length === 6) {
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      // Calculate brightness using YIQ formula
      const brightness = (r * 299 + g * 587 + b * 114) / 1000;
      // Return black for light backgrounds, white for dark backgrounds
      return brightness >= 128 ? "#000000" : "#ffffff";
    }

    // Default to black if color format not recognized
    return "#000000";
  }

  // Helper to darken/lighten a color
  adjustColor(color, amount) {
    let usePound = false;

    if (color[0] === "#") {
      color = color.slice(1);
      usePound = true;
    }

    const num = parseInt(color, 16);

    let r = (num >> 16) + amount;
    r = Math.max(Math.min(r, 255), 0);

    let g = ((num >> 8) & 0x00ff) + amount;
    g = Math.max(Math.min(g, 255), 0);

    let b = (num & 0x0000ff) + amount;
    b = Math.max(Math.min(b, 255), 0);

    return (
      (usePound ? "#" : "") +
      (g | (r << 8) | (b << 16)).toString(16).padStart(6, "0")
    );
  }

  // Computed properties
  get recordingTimeFormatted() {
    const minutes = Math.floor(this.recordingTime / 60);
    const seconds = this.recordingTime % 60;
    return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  get recordingTimePercent() {
    return (this.recordingTime / this.maxDuration) * 100;
  }

  get recordButtonLabel() {
    return this.recording ? "Stop Recording" : "Start Recording";
  }

  get recordButtonVariant() {
    return this.recording ? "destructive" : "brand";
  }

  get recordButtonDisabled() {
    return (
      this.isProcessing ||
      this.showCountdown ||
      (!this.streamActive && !this.recording)
    );
  }

  get showVideo() {
    return this.streamActive || this.showPreview;
  }

  // Add methods to get record ID
  getRecordIdFromUrl() {
    const path = window.location.pathname;
    const pathParts = path.split("/");
    console.log("Path:", path);
    console.log("Path Parts:", pathParts);

    const recordId = pathParts.find(
      (part) =>
        (part.length === 15 || part.length === 18) &&
        part.match(/^[a-zA-Z0-9]+$/)
    );
    console.log("Found Record ID from URL:", recordId);
    return recordId || null;
  }

  get effectiveRecordId() {
    const id = this.recordId || this.getRecordIdFromUrl();
    console.log("Effective Record ID:", id);
    return id;
  }

  get isHomePageWithoutRecordId() {
    // Detect if we're on a page without a record ID
    return !this.effectiveRecordId;
  }

  get showRecordIdWarning() {
    // Only show warning when no record ID can be found
    const hasRecordId = !!this.effectiveRecordId;
    return !hasRecordId;
  }

  // Initialize webcam and microphone
  async initializeCamera() {
    try {
      // Request permissions for camera and microphone
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false // Don't activate microphone until actually recording
      });

      this.streamActive = true;
      this.permissionDenied = false;

      // Set stream to video element
      this.connectStreamToVideo();
    } catch (error) {
      console.error("Error accessing media devices:", error);
      this.permissionDenied = true;
      this.errorMessage =
        "Cannot access camera or microphone. Please ensure you have granted permission.";
    }
  }

  // Connect stream to video element - separate method so we can call it when needed
  connectStreamToVideo() {
    if (this.stream && !this.showPreview) {
      const videoElement = this.template.querySelector("video");
      if (videoElement) {
        // Only set srcObject if it's different to avoid interrupting play requests
        if (videoElement.srcObject !== this.stream) {
          videoElement.srcObject = this.stream;

          // Always ensure video is muted during live preview to prevent feedback
          videoElement.muted = true;

          // Add preview mode class to disable pointer events
          videoElement.classList.add("preview-mode");
          videoElement.classList.remove("playback-mode");

          // Make sure video is playing, with better error handling
          videoElement.play().catch((err) => {
            console.error("Error playing video:", err);
            // If we get an abort error, try again after a short delay
            if (err.name === "AbortError") {
              setTimeout(() => {
                videoElement
                  .play()
                  .catch((e) => console.error("Retry play failed:", e));
              }, 100);
            }
          });
        }
      }
    }
  }

  // Start recording process with countdown
  startRecordingProcess() {
    // Verify recordId is set when needed
    if (!this.effectiveRecordId) {
      this.showToast(
        "Error",
        "A Record ID is required to save the recording. Please configure this component with a valid Record ID.",
        "error"
      );
      return;
    }

    if (!this.streamActive || this.recording || this.showCountdown) return;

    this.showCountdown = true;
    this.countdown = this.countdownDuration;

    // Start countdown timer
    this.countdownInterval = setInterval(() => {
      this.countdown--;
      if (this.countdown <= 0) {
        clearInterval(this.countdownInterval);
        this.showCountdown = false;
        this.startRecording();
      }
    }, 1000);
  }

  // Update the timer bar width
  updateTimerBar() {
    const timerBar = this.template.querySelector(".timer-bar");
    if (timerBar) {
      timerBar.style.width = `${this.recordingTimePercent}%`;
    }
  }

  // Start actual recording
  startRecording() {
    if (!this.stream) return;

    // Stop any existing streams first to prevent interference
    this.stopMediaTracks();

    // Request permissions for camera AND microphone now with specific constraints for better quality
    navigator.mediaDevices
      .getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        }
      })
      .then((recordStream) => {
        this.stream = recordStream;
        this.streamActive = true;
        this.connectStreamToVideo();

        this.recordedChunks = [];
        this.recording = true;
        this.recordingTime = 0;
        this.showPreview = false;
        this.videoUrl = null;

        // Initialize timer bar
        this.updateTimerBar();

        // Setup MediaRecorder with better encoding options
        const options = {
          mimeType: "video/webm;codecs=vp9,opus",
          audioBitsPerSecond: 128000,
          videoBitsPerSecond: 2500000
        };

        try {
          this.mediaRecorder = new MediaRecorder(this.stream, options);
        } catch (e) {
          // Fallback to default options if the browser doesn't support specified codecs
          console.log("Using fallback MediaRecorder options");
          this.mediaRecorder = new MediaRecorder(this.stream);
        }

        // Handle data available event
        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.recordedChunks.push(event.data);
          }
        };

        // Handle recording stop event
        this.mediaRecorder.onstop = () => {
          // Stop all tracks to ensure microphone is turned off
          this.stopMediaTracks();

          const blob = new Blob(this.recordedChunks, { type: "video/webm" });
          this.recordedBlob = blob;

          // First disconnect the stream to avoid conflicts
          const videoElement = this.template.querySelector("video");
          if (videoElement) {
            videoElement.srcObject = null;
            videoElement.pause();

            // Remove preview mode class and add playback mode class
            videoElement.classList.remove("preview-mode");
            videoElement.classList.add("playback-mode");
          }

          // Now set up the recorded video
          this.videoUrl = URL.createObjectURL(blob);
          this.showPreview = true;

          // Reinitialize camera for further recording (without audio)
          this.initializeCamera();
        };

        // Request data in shorter intervals for more reliable recording
        this.mediaRecorder.start(1000); // Collect data every second

        // Setup timer for recording duration
        this.recordingInterval = setInterval(() => {
          this.recordingTime++;
          this.updateTimerBar(); // Update timer bar on each interval
          if (this.recordingTime >= this.maxDuration) {
            this.stopRecording();
          }
        }, 1000);
      })
      .catch((error) => {
        console.error("Error accessing audio for recording:", error);
        this.errorMessage =
          "Cannot access microphone. Please ensure you have granted permission.";
        // Try to reinitialize just the camera
        this.initializeCamera();
      });
  }

  // Helper to stop all media tracks properly
  stopMediaTracks() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
      });
    }
  }

  // Stop recording
  stopRecording() {
    if (!this.recording) return;

    clearInterval(this.recordingInterval);
    this.recording = false;

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
  }

  // Submit recording to Salesforce
  async submitRecording() {
    if (!this.recordedBlob || !this.effectiveRecordId) {
      if (!this.effectiveRecordId) {
        this.showToast(
          "Error",
          "A Record ID is required to save the recording. Please configure this component with a valid Record ID.",
          "error"
        );
      }
      return;
    }

    this.isProcessing = true;
    this.errorMessage = "";

    try {
      // Convert Blob to Base64
      const base64Data = await this.blobToBase64(this.recordedBlob);

      // Prepare file data
      const fileName = `Interview_${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      const fileType = "video/webm";

      // Save to Salesforce
      const result = await saveInterviewRecording({
        recordId: this.effectiveRecordId,
        fileName: fileName,
        base64Data: base64Data,
        contentType: fileType,
        folderName: this.folderName
      });

      if (!result || result.error) {
        throw new Error(result?.error || "Failed to save recording");
      }

      // Set recordingCompleted flag for Flow
      this.recordingCompleted = true;
      // Dispatch change event for Flow attribute
      if (this.template.querySelector("lightning-flow-support")) {
        const attributeChangeEvent = new FlowAttributeChangeEvent(
          "recordingCompleted",
          true
        );
        this.dispatchEvent(attributeChangeEvent);
      }

      // Show success message
      this.showToast(
        "Success",
        "Interview recording saved successfully",
        "success"
      );

      // Reset the recorder
      this.resetRecorder();

      // Dispatch event to notify parent component
      this.dispatchEvent(
        new CustomEvent("recordingsaved", {
          detail: { success: true }
        })
      );
    } catch (error) {
      console.error("Error submitting recording:", error);

      // More detailed error message
      let errorMsg = "Failed to save recording. ";
      if (error.body) {
        errorMsg += error.body.message || JSON.stringify(error.body);
      } else if (error.message) {
        errorMsg += error.message;
      } else {
        errorMsg += JSON.stringify(error);
      }

      this.errorMessage = errorMsg;

      this.showToast("Error", errorMsg, "error");

      this.dispatchEvent(
        new CustomEvent("recordingsaved", {
          detail: { success: false, error: errorMsg }
        })
      );
    } finally {
      this.isProcessing = false;
    }
  }

  // Helper function to display toast messages
  showToast(title, message, variant) {
    this.dispatchEvent(
      new ShowToastEvent({
        title: title,
        message: message,
        variant: variant
      })
    );
  }

  // Reset recorder state
  resetRecorder() {
    if (this.videoUrl) {
      URL.revokeObjectURL(this.videoUrl);
    }

    this.recordedChunks = [];
    this.recordedBlob = null;
    this.videoUrl = null;
    this.showPreview = false;
    this.recordingTime = 0;
  }

  // Discard current recording and restart
  discardRecording() {
    this.resetRecorder();
    // Keep stream active for new recording
  }

  // Helper method to convert Blob to Base64
  blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        // Remove data URL prefix (e.g., "data:video/webm;base64,")
        const base64data = reader.result.split(",")[1];
        resolve(base64data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Stop the media stream
  stopStream() {
    if (this.recording) {
      this.stopRecording();
    }

    this.stopMediaTracks();
    this.stream = null;
    this.streamActive = false;

    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
    }

    if (this.recordingInterval) {
      clearInterval(this.recordingInterval);
    }
  }

  // Event handlers
  handleRecordClick() {
    if (this.recording) {
      this.stopRecording();
    } else {
      this.startRecordingProcess();
    }
  }

  handleSubmitClick() {
    this.submitRecording();
  }

  handleDiscardClick() {
    this.discardRecording();
  }

  handleRetryPermissions() {
    this.permissionDenied = false;
    this.errorMessage = "";
    this.initializeCamera();
  }

  // Handle actions for download button
  handleDownloadClick() {
    if (!this.recordedBlob || !this.videoUrl) {
      this.showToast("Error", "No video available to download", "error");
      return;
    }

    try {
      // Create a temporary anchor element
      const downloadLink = document.createElement("a");

      // Set its href to the video URL
      downloadLink.href = this.videoUrl;

      // Set the download attribute with a filename
      const fileName = `Interview_Recording_${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
      downloadLink.download = fileName;

      // Append to body, click and remove
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      this.showToast("Success", "Video download started", "success");
    } catch (error) {
      console.error("Error downloading video:", error);
      this.showToast("Error", "Failed to download video", "error");
    }
  }
}
