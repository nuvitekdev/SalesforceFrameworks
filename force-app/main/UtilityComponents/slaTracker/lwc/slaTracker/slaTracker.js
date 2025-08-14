import { LightningElement, api, wire, track } from "lwc";
import { getRecord, getFieldValue } from "lightning/uiRecordApi";
import { CurrentPageReference } from "lightning/navigation";
import getRecordMetadata from "@salesforce/apex/SlaTrackerController.getRecordMetadata";
import calculateBusinessHours from "@salesforce/apex/SlaTrackerController.calculateBusinessHours";

export default class SlaTracker extends LightningElement {
  // API Properties from target configs
  @api recordId;
  @api componentTitle = "Response Time Tracker";
  @api slaDurationHours = 24;
  @api startTimeFieldName = "CreatedDate";
  @api endTimeFieldName = "LastModifiedDate";
  @api statusFieldName = "Status__c";
  @api closedStatusValues = "Closed,Completed,Resolved";
  @api pendingStatusValues = "Pending,On Hold,Waiting";
  @api colorScheme = "standard";
  @api showPastSLA = false;
  @api showProgressBar = false;
  @api businessHoursOnly = false;
  @api businessHoursId;

  // Flow output variables
  @api slaStatus;
  @api timeRemaining;

  // Private properties
  @track _objectApiName;
  @track _recordData;
  @track _slaDeadline;
  @track _timeUntilSLABreach;
  @track _startTime;
  @track _completionTime;
  @track _dynamicFields = [];
  @track _percentComplete = 0;
  @track _hoursUsed = 0;
  @track _hoursRemaining = 0;
  @track errorMessage;
  @track isLoading = true;

  // Countdown timer
  countdownInterval;

  // For record ID detection in portal/community
  @wire(CurrentPageReference)
  pageRef;

  // Record ID helper methods for portals/communities
  getRecordIdFromUrl() {
    const path = window.location.pathname;
    const pathParts = path.split("/");

    const recordId = pathParts.find(
      (part) =>
        (part.length === 15 || part.length === 18) &&
        part.match(/^[a-zA-Z0-9]+$/)
    );
    return recordId || null;
  }

  getRecordIdFromPageRef() {
    if (this.pageRef) {
      if (this.pageRef.attributes && this.pageRef.attributes.recordId) {
        return this.pageRef.attributes.recordId;
      }
      // For Experience/Community sites
      if (this.pageRef.state && this.pageRef.state.recordId) {
        return this.pageRef.state.recordId;
      }
    }
    return null;
  }

  // Get effective record ID from all possible sources
  get effectiveRecordId() {
    return (
      this.recordId ||
      this.getRecordIdFromPageRef() ||
      this.getRecordIdFromUrl()
    );
  }

  // Getters
  get hasRecordId() {
    return !!this.effectiveRecordId;
  }

  get hasRecord() {
    return this.hasRecordId && !this.isLoading && !this.hasError;
  }

  get hasError() {
    return !!this.errorMessage;
  }

  get statusCardClass() {
    let baseClass = "status-card";

    if (this.colorScheme && this.colorScheme !== "standard") {
      baseClass += ` theme-${this.colorScheme.replace("slds-theme_", "")}`;
    }

    return baseClass;
  }

  get statusBadgeClass() {
    return `status-badge ${this.slaStatus ? this.slaStatus.toLowerCase() : "error"}`;
  }

  get countdownLabel() {
    if (this.slaStatus === "Active") {
      return "Time Remaining";
    } else if (this.slaStatus === "Paused") {
      return "Time Paused";
    } else if (this.slaStatus === "Met") {
      return "Time to Resolution";
    } else if (this.slaStatus === "Breached") {
      return "Time Exceeded";
    }
    return "SLA Time";
  }

  get progressBarStyle() {
    let colorClass;

    // Determine color based on SLA status and percentage complete
    if (this.slaStatus === "Active") {
      if (this._percentComplete < 60) {
        colorClass = "#2E7D32"; // Green
      } else if (this._percentComplete < 80) {
        colorClass = "#F57C00"; // Orange
      } else {
        colorClass = "#D32F2F"; // Red
      }
    } else if (this.slaStatus === "Met") {
      colorClass = "#2E7D32"; // Green
    } else if (this.slaStatus === "Breached") {
      colorClass = "#D32F2F"; // Red
    } else if (this.slaStatus === "Paused") {
      colorClass = "#F57C00"; // Orange
    } else {
      colorClass = "#757575"; // Gray
    }

    return `width: ${this._percentComplete}%; background-color: ${colorClass};`;
  }

  get startTimeFormatted() {
    return this._startTime
      ? this.formatDateTime(this._startTime)
      : "Not available";
  }

  get slaDeadlineFormatted() {
    return this._slaDeadline
      ? this.formatDateTime(this._slaDeadline)
      : "Not available";
  }

  get completionTimeFormatted() {
    return this._completionTime
      ? this.formatDateTime(this._completionTime)
      : "Not available";
  }

  get showCompletionTime() {
    return this.slaStatus === "Met" || this.slaStatus === "Breached";
  }

  get totalHours() {
    return `${this.slaDurationHours}h total`;
  }

  get hoursUsedFormatted() {
    return `${this._hoursUsed.toFixed(1)}h used`;
  }

  get hoursRemainingFormatted() {
    return `${this._hoursRemaining.toFixed(1)}h left`;
  }

  // Lifecycle hooks
  connectedCallback() {
    // Initialize the component
    if (this.effectiveRecordId) {
      this.isLoading = true;
      this.errorMessage = null;
    }
  }

  disconnectedCallback() {
    // Clear any intervals when component is removed
    this.clearCountdownInterval();
  }

  renderedCallback() {
    // Update progress bar styles
    this.updateProgressBar();
  }

  // Wire methods - update to use effectiveRecordId
  @wire(getRecordMetadata, { recordId: "$effectiveRecordId" })
  wiredRecordMetadata({ error, data }) {
    if (data) {
      this._objectApiName = data.objectApiName;
      this.updateDynamicFields();
    } else if (error) {
      this.handleError(
        "Error fetching record metadata: " + this.getErrorMessage(error)
      );
    }
  }

  @wire(getRecord, {
    recordId: "$effectiveRecordId",
    fields: "$_dynamicFields"
  })
  wiredRecord({ error, data }) {
    if (data) {
      this._recordData = data;
      this.calculateSLA();
    } else if (error) {
      this.handleError(
        "Error fetching record data: " + this.getErrorMessage(error)
      );
    }
  }

  // Methods
  updateProgressBar() {
    if (this.showProgressBar) {
      const progressBarEl = this.template.querySelector(".progress-bar");
      if (progressBarEl) {
        // Determine color based on SLA status and percentage complete
        let colorClass;

        if (this.slaStatus === "Active") {
          if (this._percentComplete < 60) {
            colorClass = "active-early";
          } else if (this._percentComplete < 80) {
            colorClass = "active-midway";
          } else {
            colorClass = "active-late";
          }
        } else if (this.slaStatus === "Met") {
          colorClass = "met";
        } else if (this.slaStatus === "Breached") {
          colorClass = "breached";
        } else if (this.slaStatus === "Paused") {
          colorClass = "paused";
        } else {
          colorClass = "error";
        }

        // Clear all status classes
        progressBarEl.classList.remove(
          "active-early",
          "active-midway",
          "active-late",
          "met",
          "breached",
          "paused",
          "error"
        );

        // Add the appropriate class
        progressBarEl.classList.add(colorClass);

        // Set width based on percentage
        progressBarEl.style.width = `${this._percentComplete}%`;
      }
    }
  }

  updateDynamicFields() {
    if (this._objectApiName) {
      this._dynamicFields = [
        `${this._objectApiName}.${this.startTimeFieldName}`,
        `${this._objectApiName}.${this.endTimeFieldName}`,
        `${this._objectApiName}.${this.statusFieldName}`
      ];
    }
  }

  calculateSLA() {
    if (!this._recordData) {
      return;
    }

    try {
      // Get field values
      const startTimeValue = getFieldValue(
        this._recordData,
        `${this._objectApiName}.${this.startTimeFieldName}`
      );
      const endTimeValue = getFieldValue(
        this._recordData,
        `${this._objectApiName}.${this.endTimeFieldName}`
      );
      const statusValue = getFieldValue(
        this._recordData,
        `${this._objectApiName}.${this.statusFieldName}`
      );

      if (!startTimeValue) {
        this.handleError(
          `Start time field "${this.startTimeFieldName}" does not have a value.`
        );
        return;
      }

      // Parse closed and pending status values
      const closedStatuses = this.closedStatusValues
        .split(",")
        .map((s) => s.trim());
      const pendingStatuses = this.pendingStatusValues
        .split(",")
        .map((s) => s.trim());

      // Set start and end times
      this._startTime = new Date(startTimeValue);

      // Calculate SLA deadline (start time + configured duration)
      if (this.businessHoursOnly) {
        // Use Apex for business hours calculation
        this.calculateSLAWithBusinessHours(this._startTime);
      } else {
        // Simple calculation without business hours
        this._slaDeadline = new Date(this._startTime);
        this._slaDeadline.setHours(
          this._slaDeadline.getHours() + parseInt(this.slaDurationHours, 10)
        );
        this.finalizeSLACalculation(
          statusValue,
          closedStatuses,
          pendingStatuses,
          endTimeValue
        );
      }
    } catch (error) {
      this.handleError("Error calculating SLA: " + this.getErrorMessage(error));
    }
  }

  calculateSLAWithBusinessHours(startTime) {
    calculateBusinessHours({
      startTime: startTime,
      hoursToAdd: this.slaDurationHours,
      businessHoursId: this.businessHoursId || null
    })
      .then((result) => {
        this._slaDeadline = new Date(result);

        // Get values again to use in finalization
        const endTimeValue = getFieldValue(
          this._recordData,
          `${this._objectApiName}.${this.endTimeFieldName}`
        );
        const statusValue = getFieldValue(
          this._recordData,
          `${this._objectApiName}.${this.statusFieldName}`
        );
        const closedStatuses = this.closedStatusValues
          .split(",")
          .map((s) => s.trim());
        const pendingStatuses = this.pendingStatusValues
          .split(",")
          .map((s) => s.trim());

        this.finalizeSLACalculation(
          statusValue,
          closedStatuses,
          pendingStatuses,
          endTimeValue
        );
      })
      .catch((error) => {
        this.handleError(
          "Error calculating business hours: " + this.getErrorMessage(error)
        );
      });
  }

  finalizeSLACalculation(
    statusValue,
    closedStatuses,
    pendingStatuses,
    endTimeValue
  ) {
    const now = new Date();

    // Determine SLA status
    if (closedStatuses.includes(statusValue)) {
      // Record is closed - check if it was completed before or after deadline
      this._completionTime = new Date(endTimeValue);

      this.slaStatus =
        this._completionTime <= this._slaDeadline ? "Met" : "Breached";
      this._timeUntilSLABreach = this.formatTimeDifference(
        this._startTime,
        this._completionTime
      );

      // Calculate percent as ratio of actual time to target time
      const actualDuration = this._completionTime - this._startTime;
      const targetDuration = this._slaDeadline - this._startTime;
      this._percentComplete = Math.min(
        100,
        Math.round((actualDuration / targetDuration) * 100)
      );

      // Calculate hours used and remaining
      this._hoursUsed = actualDuration / (1000 * 60 * 60);
      this._hoursRemaining = Math.max(
        0,
        this.slaDurationHours - this._hoursUsed
      );
    } else if (pendingStatuses.includes(statusValue)) {
      // SLA paused due to pending status
      this.slaStatus = "Paused";
      this._timeUntilSLABreach = this.formatTimeDifference(
        now,
        this._slaDeadline
      );

      // Calculate percent complete before pausing
      const elapsedTime = now - this._startTime;
      const totalDuration = this._slaDeadline - this._startTime;
      this._percentComplete = Math.min(
        100,
        Math.round((elapsedTime / totalDuration) * 100)
      );

      // Calculate hours used and remaining
      this._hoursUsed = elapsedTime / (1000 * 60 * 60);
      this._hoursRemaining = Math.max(
        0,
        this.slaDurationHours - this._hoursUsed
      );
    } else {
      // Active SLA - Check if current time exceeds deadline
      if (now > this._slaDeadline) {
        this.slaStatus = "Breached";
        this._timeUntilSLABreach = "Exceeded Deadline";
        this._percentComplete = 100;

        // All hours used and no hours remaining when breached
        this._hoursUsed = parseFloat(this.slaDurationHours);
        this._hoursRemaining = 0;
      } else {
        this.slaStatus = "Active";
        this._timeUntilSLABreach = this.formatTimeDifference(
          now,
          this._slaDeadline
        );

        // Calculate percentage complete
        const elapsed = now - this._startTime;
        const total = this._slaDeadline - this._startTime;
        this._percentComplete = Math.min(
          100,
          Math.round((elapsed / total) * 100)
        );

        // Calculate hours used and remaining
        this._hoursUsed = elapsed / (1000 * 60 * 60);
        this._hoursRemaining = Math.max(
          0,
          this.slaDurationHours - this._hoursUsed
        );

        // Start countdown timer for active SLAs
        this.startCountdown();
      }
    }

    // Update Flow output variable if in a Flow
    this.timeRemaining = this._timeUntilSLABreach;

    // Hide component if status is met or breached and showPastSLA is false
    if (
      !this.showPastSLA &&
      (this.slaStatus === "Met" || this.slaStatus === "Breached")
    ) {
      const card = this.template.querySelector("lightning-card");
      if (card) {
        card.classList.add("slds-hide");
      }
    }

    this.isLoading = false;

    // Update progress bar
    this.updateProgressBar();
  }

  startCountdown() {
    // Clear any existing interval
    this.clearCountdownInterval();

    // Only start countdown for active SLAs
    if (this.slaStatus === "Active") {
      this.countdownInterval = setInterval(() => {
        const now = new Date();

        if (now > this._slaDeadline) {
          // SLA breached during countdown
          this.slaStatus = "Breached";
          this._timeUntilSLABreach = "Exceeded Deadline";
          this._percentComplete = 100;
          this._hoursUsed = parseFloat(this.slaDurationHours);
          this._hoursRemaining = 0;
          this.clearCountdownInterval();
        } else {
          // Update countdown and percentage
          this._timeUntilSLABreach = this.formatTimeDifference(
            now,
            this._slaDeadline
          );

          const elapsed = now - this._startTime;
          const total = this._slaDeadline - this._startTime;
          this._percentComplete = Math.min(
            100,
            Math.round((elapsed / total) * 100)
          );

          // Update hours calculations
          this._hoursUsed = elapsed / (1000 * 60 * 60);
          this._hoursRemaining = Math.max(
            0,
            this.slaDurationHours - this._hoursUsed
          );
        }

        // Update Flow output variable if in a Flow
        this.timeRemaining = this._timeUntilSLABreach;

        // Update progress bar
        this.updateProgressBar();
      }, 1000);
    }
  }

  clearCountdownInterval() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
  }

  formatTimeDifference(startDate, endDate) {
    if (!startDate || !endDate) {
      return "N/A";
    }

    let diff = endDate - startDate;

    // Handle negative time differences (for breached SLAs)
    const isNegative = diff < 0;
    diff = Math.abs(diff);

    // Calculate time components
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    // Build formatted string
    let result = "";

    if (days > 0) {
      result += `${days}d `;
    }

    result += `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;

    if (isNegative) {
      result = `-${result}`;
    }

    return result;
  }

  formatDateTime(dateObj) {
    if (!dateObj) {
      return "";
    }

    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true
    }).format(dateObj);
  }

  handleError(message) {
    this.errorMessage = message;
    this.isLoading = false;
    console.error(message);
  }

  getErrorMessage(error) {
    if (typeof error === "string") {
      return error;
    }
    return error.body?.message || error.message || JSON.stringify(error);
  }
}
