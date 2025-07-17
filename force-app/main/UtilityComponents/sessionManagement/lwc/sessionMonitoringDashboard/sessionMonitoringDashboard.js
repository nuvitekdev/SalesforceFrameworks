import { LightningElement, track, wire } from "lwc";
import { refreshApex } from "@salesforce/apex";
import getSessionAnalytics from "@salesforce/apex/SessionMonitoringService.getSessionAnalytics";
import updateUserActivity from "@salesforce/apex/SessionMonitoringService.updateUserActivity";
import { ShowToastEvent } from "lightning/platformShowToastEvent";

export default class SessionMonitoringDashboard extends LightningElement {
  @track timeFrame = "WEEK";
  @track analytics = {};
  @track isLoading = false;
  @track lastActivityUpdate = 0;

  wiredAnalyticsResult;
  activityInterval;
  refreshInterval;

  timeFrameOptions = [
    { label: "Today", value: "TODAY" },
    { label: "Last 7 Days", value: "WEEK" },
    { label: "Last 30 Days", value: "MONTH" }
  ];

  @wire(getSessionAnalytics, { timeFrame: "$timeFrame" })
  wiredAnalytics(result) {
    this.wiredAnalyticsResult = result;
    this.isLoading = true;

    if (result.data) {
      this.analytics = result.data;
      this.isLoading = false;
    } else if (result.error) {
      this.handleError(result.error);
      this.isLoading = false;
    }
  }

  connectedCallback() {
    this.startActivityTracking();
    this.startAutoRefresh();

    document.addEventListener("click", this.handleUserActivity.bind(this));
    document.addEventListener("keypress", this.handleUserActivity.bind(this));
  }

  disconnectedCallback() {
    this.stopActivityTracking();
    this.stopAutoRefresh();

    document.removeEventListener("click", this.handleUserActivity.bind(this));
    document.removeEventListener(
      "keypress",
      this.handleUserActivity.bind(this)
    );
  }

  startActivityTracking() {
    this.activityInterval = setInterval(() => {
      this.updateActivity();
    }, 300000);
  }

  stopActivityTracking() {
    if (this.activityInterval) {
      clearInterval(this.activityInterval);
    }
  }

  startAutoRefresh() {
    this.refreshInterval = setInterval(() => {
      this.refreshData();
    }, 60000);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  handleUserActivity() {
    const now = Date.now();
    if (now - this.lastActivityUpdate > 300000) {
      this.updateActivity();
      this.lastActivityUpdate = now;
    }
  }

  updateActivity() {
    updateUserActivity()
      .then(() => {
        console.log("Activity updated successfully");
      })
      .catch((error) => {
        console.error("Error updating activity:", error);
      });
  }

  handleTimeFrameChange(event) {
    this.timeFrame = event.detail.value;
  }

  refreshData() {
    refreshApex(this.wiredAnalyticsResult);
  }

  handleRefresh() {
    this.isLoading = true;
    this.refreshData();
  }

  handleError(error) {
    let message = "Unknown error";
    if (Array.isArray(error.body)) {
      message = error.body.map((e) => e.message).join(", ");
    } else if (typeof error.body.message === "string") {
      message = error.body.message;
    }

    this.dispatchEvent(
      new ShowToastEvent({
        title: "Error loading analytics",
        message: message,
        variant: "error"
      })
    );
  }

  get totalSessions() {
    return this.analytics.totalSessions || 0;
  }

  get uniqueUsers() {
    return this.analytics.uniqueUsers || 0;
  }

  get activeSessions() {
    return this.analytics.activeSessions || 0;
  }

  get avgDuration() {
    const avg = this.analytics.avgDuration || 0;
    return Math.round(avg);
  }

  get logoutTypeData() {
    const logoutTypes = this.analytics.logoutTypes || {};
    return Object.entries(logoutTypes).map(([type, count]) => {
      const percentage = this.calculatePercentage(count, this.totalSessions);
      return {
        type: this.formatLogoutType(type),
        count: count,
        percentage: percentage,
        style: `width: ${percentage}%`
      };
    });
  }

  get deviceTypeData() {
    const deviceTypes = this.analytics.deviceTypes || {};
    return Object.entries(deviceTypes).map(([type, count]) => {
      const percentage = this.calculatePercentage(count, this.totalSessions);
      return {
        type: type || "Unknown",
        count: count,
        percentage: percentage,
        style: `width: ${percentage}%`
      };
    });
  }

  formatLogoutType(type) {
    const typeMap = {
      Manual: "Manual Logout",
      Timeout: "Session Timeout",
      Browser_Closed: "Browser Closed",
      Admin_Forced: "Admin Forced"
    };
    return typeMap[type] || type;
  }

  calculatePercentage(value, total) {
    if (!total || total === 0) return 0;
    return Math.round((value / total) * 100);
  }

  get hasLogoutData() {
    return this.logoutTypeData.length > 0;
  }

  get hasDeviceData() {
    return this.deviceTypeData.length > 0;
  }
}
