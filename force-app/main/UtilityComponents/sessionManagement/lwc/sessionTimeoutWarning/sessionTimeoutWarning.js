import { LightningElement, track } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import getSessionConfig from "@salesforce/apex/SessionMonitoringService.getSessionConfig";
import updateUserActivity from "@salesforce/apex/SessionMonitoringService.updateUserActivity";

export default class SessionTimeoutWarning extends LightningElement {
  @track showWarning = false;
  @track timeRemaining = 0;

  sessionTimeoutMinutes = 15;
  warningMinutes = 2;
  lastActivity = Date.now();
  warningTimer;
  countdownTimer;
  checkInterval;

  connectedCallback() {
    this.initializeWarningSystem();
  }

  disconnectedCallback() {
    this.cleanup();
  }

  async initializeWarningSystem() {
    try {
      const config = await getSessionConfig();

      if (!config.Enable_Session_Monitoring__c) {
        return;
      }

      this.sessionTimeoutMinutes = config.Session_Timeout_Minutes__c || 15;
      this.warningMinutes = config.Session_Warning_Minutes__c || 2;

      this.attachEventListeners();
      this.startSessionCheck();
    } catch (error) {
      console.error("Error initializing session warning:", error);
    }
  }

  attachEventListeners() {
    document.addEventListener(
      "click",
      this.handleUserActivity.bind(this),
      true
    );
    document.addEventListener(
      "keypress",
      this.handleUserActivity.bind(this),
      true
    );
    document.addEventListener(
      "mousemove",
      this.handleUserActivity.bind(this),
      true
    );
  }

  detachEventListeners() {
    document.removeEventListener(
      "click",
      this.handleUserActivity.bind(this),
      true
    );
    document.removeEventListener(
      "keypress",
      this.handleUserActivity.bind(this),
      true
    );
    document.removeEventListener(
      "mousemove",
      this.handleUserActivity.bind(this),
      true
    );
  }

  handleUserActivity() {
    this.lastActivity = Date.now();

    if (this.showWarning) {
      this.extendSession();
    }
  }

  startSessionCheck() {
    this.checkInterval = setInterval(() => {
      this.checkSessionTimeout();
    }, 30000);
  }

  checkSessionTimeout() {
    const inactiveTime = (Date.now() - this.lastActivity) / 1000 / 60;
    const timeUntilTimeout = this.sessionTimeoutMinutes - inactiveTime;

    if (timeUntilTimeout <= this.warningMinutes && timeUntilTimeout > 0) {
      if (!this.showWarning) {
        this.showSessionWarning(timeUntilTimeout);
      }
    } else if (timeUntilTimeout <= 0) {
      this.handleSessionExpired();
    }
  }

  showSessionWarning(minutesRemaining) {
    this.showWarning = true;
    this.timeRemaining = Math.floor(minutesRemaining * 60);

    this.countdownTimer = setInterval(() => {
      this.timeRemaining--;

      if (this.timeRemaining <= 0) {
        this.handleSessionExpired();
      }
    }, 1000);
  }

  async extendSession() {
    try {
      await updateUserActivity();

      this.showWarning = false;
      this.clearTimers();
      this.lastActivity = Date.now();

      this.dispatchEvent(
        new ShowToastEvent({
          title: "Session Extended",
          message: "Your session has been extended.",
          variant: "success"
        })
      );
    } catch (error) {
      console.error("Error extending session:", error);

      this.dispatchEvent(
        new ShowToastEvent({
          title: "Error",
          message: "Unable to extend session. Please save your work.",
          variant: "error"
        })
      );
    }
  }

  handleSessionExpired() {
    this.showWarning = false;
    this.clearTimers();

    this.dispatchEvent(
      new ShowToastEvent({
        title: "Session Expired",
        message: "Your session has expired. You will be logged out.",
        variant: "warning",
        mode: "sticky"
      })
    );

    setTimeout(() => {
      window.location.href = "/secur/logout.jsp";
    }, 3000);
  }

  clearTimers() {
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }

    if (this.warningTimer) {
      clearTimeout(this.warningTimer);
      this.warningTimer = null;
    }
  }

  cleanup() {
    this.clearTimers();

    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.detachEventListeners();
  }

  handleContinueSession() {
    this.extendSession();
  }

  handleLogout() {
    window.location.href = "/secur/logout.jsp";
  }

  get formattedTimeRemaining() {
    const minutes = Math.floor(this.timeRemaining / 60);
    const seconds = this.timeRemaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  get warningMessage() {
    return `Your session will expire in ${this.formattedTimeRemaining} due to inactivity.`;
  }
}