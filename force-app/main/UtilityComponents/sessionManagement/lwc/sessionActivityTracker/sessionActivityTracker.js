import { LightningElement } from "lwc";
import updateUserActivity from "@salesforce/apex/SessionMonitoringService.updateUserActivity";
import getSessionConfig from "@salesforce/apex/SessionMonitoringService.getSessionConfig";

export default class SessionActivityTracker extends LightningElement {
  activityInterval;
  lastActivityUpdate = 0;
  updateIntervalMinutes = 5;
  isTracking = false;

  connectedCallback() {
    this.initializeTracking();
  }

  disconnectedCallback() {
    this.stopTracking();
  }

  async initializeTracking() {
    try {
      const config = await getSessionConfig();

      if (!config.Enable_Activity_Tracking__c) {
        return;
      }

      this.updateIntervalMinutes =
        config.Activity_Update_Interval_Minutes__c || 5;
      this.isTracking = true;

      this.updateActivity();

      this.activityInterval = setInterval(
        () => {
          this.updateActivity();
        },
        this.updateIntervalMinutes * 60 * 1000
      );

      this.attachEventListeners();
    } catch (error) {
      console.error("Error initializing activity tracking:", error);
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
      this.throttledMouseMove.bind(this),
      true
    );
    document.addEventListener(
      "scroll",
      this.handleUserActivity.bind(this),
      true
    );

    window.addEventListener("focus", this.handleWindowFocus.bind(this));
    window.addEventListener("blur", this.handleWindowBlur.bind(this));
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
      this.throttledMouseMove.bind(this),
      true
    );
    document.removeEventListener(
      "scroll",
      this.handleUserActivity.bind(this),
      true
    );

    window.removeEventListener("focus", this.handleWindowFocus.bind(this));
    window.removeEventListener("blur", this.handleWindowBlur.bind(this));
  }

  handleUserActivity() {
    if (!this.isTracking) return;

    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastActivityUpdate;
    const updateThreshold = this.updateIntervalMinutes * 60 * 1000;

    if (timeSinceLastUpdate > updateThreshold) {
      this.updateActivity();
      this.lastActivityUpdate = now;
    }
  }

  throttledMouseMove = this.throttle(() => {
    this.handleUserActivity();
  }, 5000);

  throttle(func, delay) {
    let timeoutId;
    let lastExecTime = 0;

    return function (...args) {
      const currentTime = Date.now();

      if (currentTime - lastExecTime > delay) {
        lastExecTime = currentTime;
        func.apply(this, args);
      } else {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(
          () => {
            lastExecTime = Date.now();
            func.apply(this, args);
          },
          delay - (currentTime - lastExecTime)
        );
      }
    };
  }

  handleWindowFocus() {
    if (!this.isTracking) return;

    const timeSinceLastUpdate = Date.now() - this.lastActivityUpdate;
    if (timeSinceLastUpdate > 60000) {
      this.updateActivity();
    }
  }

  handleWindowBlur() {
    // Optionally track when user leaves the window
  }

  async updateActivity() {
    if (!this.isTracking) return;

    try {
      await updateUserActivity();
      console.log(
        "[Session Tracker] Activity updated at",
        new Date().toLocaleTimeString()
      );
    } catch (error) {
      console.error("[Session Tracker] Error updating activity:", error);

      if (
        error.body &&
        error.body.message &&
        error.body.message.includes("SESSION_NOT_FOUND")
      ) {
        this.stopTracking();
      }
    }
  }

  stopTracking() {
    this.isTracking = false;

    if (this.activityInterval) {
      clearInterval(this.activityInterval);
      this.activityInterval = null;
    }

    this.detachEventListeners();
  }
}
