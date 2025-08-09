import { LightningElement } from "lwc";
import logUserLogout from "@salesforce/apex/SessionMonitoringService.logUserLogout";
import getUserSessionId from "@salesforce/apex/SessionMonitoringService.getCurrentUserSessionId";

export default class SessionLogoutTracker extends LightningElement {
  sessionId;
  isLoggingOut = false;
  lastActivityTime = Date.now();
  browserCloseTimeout = 15; // 15 minutes in milliseconds
  activityCheckInterval;

  connectedCallback() {
    this.initializeLogoutTracking();
  }

  disconnectedCallback() {
    this.cleanup();
  }

  async initializeLogoutTracking() {
    try {
      // Get current session ID
      this.sessionId = await getUserSessionId();

      if (!this.sessionId) {
        console.log("[Logout Tracker] No active session found");
        return;
      }

      // Track logout button clicks
      this.interceptLogoutButton();

      // Track browser close/tab close
      this.trackBrowserClose();

      // Track page visibility changes
      this.trackPageVisibility();

      // Start activity monitoring for browser close detection
      this.startActivityMonitoring();

      console.log("[Logout Tracker] Initialized successfully");
    } catch (error) {
      console.error("[Logout Tracker] Initialization error:", error);
    }
  }

  interceptLogoutButton() {
    // Monitor for logout button clicks
    document.addEventListener(
      "click",
      (event) => {
        const target = event.target;

        // Check for common logout button patterns
        if (this.isLogoutElement(target)) {
          console.log("[Logout Tracker] Logout button clicked");
          this.handleLogout("Manual");
        }
      },
      true
    );
  }

  isLogoutElement(element) {
    if (!element) return false;

    // Check element and its parents for logout indicators
    let currentElement = element;
    for (let i = 0; i < 5 && currentElement; i++) {
      const text = currentElement.textContent || "";
      const href = currentElement.href || "";
      const onclick = currentElement.onclick
        ? currentElement.onclick.toString()
        : "";

      // Check for logout patterns
      if (
        text.toLowerCase().includes("log out") ||
        text.toLowerCase().includes("logout") ||
        text.toLowerCase().includes("sign out") ||
        href.includes("/logout") ||
        href.includes("/secur/logout.jsp") ||
        onclick.includes("logout")
      ) {
        return true;
      }

      currentElement = currentElement.parentElement;
    }

    return false;
  }

  trackBrowserClose() {
    // Use beforeunload to detect browser/tab close
    window.addEventListener("beforeunload", (event) => {
      if (!this.isLoggingOut) {
        // Send logout signal with browser close type
        this.handleLogout("Browser_Closed", false);

        // Store last activity time in localStorage for recovery
        localStorage.setItem("lastActivityTime", Date.now().toString());
        localStorage.setItem("sessionId", this.sessionId);
      }
    });

    // Use unload as backup
    window.addEventListener("unload", () => {
      if (!this.isLoggingOut) {
        this.handleLogout("Browser_Closed", false);
      }
    });
  }

  trackPageVisibility() {
    // Track when page becomes hidden (browser minimized, tab switched)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        // Page is hidden, store timestamp
        localStorage.setItem("pageHiddenTime", Date.now().toString());
      } else {
        // Page is visible again, check if we need to timeout
        const hiddenTime = localStorage.getItem("pageHiddenTime");
        if (hiddenTime) {
          const hiddenDuration = Date.now() - parseInt(hiddenTime);
          const timeoutMs = this.browserCloseTimeout * 60 * 1000;

          if (hiddenDuration > timeoutMs) {
            // Session should be timed out
            this.handleLogout("Timeout");
          }

          localStorage.removeItem("pageHiddenTime");
        }
      }
    });
  }

  startActivityMonitoring() {
    // Check for stale sessions on page load
    this.checkForStaleSession();

    // Monitor user activity
    ["click", "keypress", "mousemove", "scroll"].forEach((eventType) => {
      document.addEventListener(
        eventType,
        () => {
          this.lastActivityTime = Date.now();
        },
        { passive: true }
      );
    });

    // Periodically check for timeout
    this.activityCheckInterval = setInterval(() => {
      const inactiveTime = Date.now() - this.lastActivityTime;
      const timeoutMs = this.browserCloseTimeout * 60 * 1000;

      if (inactiveTime > timeoutMs) {
        this.handleLogout("Timeout");
      }
    }, 60000); // Check every minute
  }

  checkForStaleSession() {
    // Check if there was a previous session that wasn't properly closed
    const lastActivity = localStorage.getItem("lastActivityTime");
    const oldSessionId = localStorage.getItem("sessionId");

    if (lastActivity && oldSessionId && oldSessionId !== this.sessionId) {
      const timeSinceActivity = Date.now() - parseInt(lastActivity);
      const timeoutMs = this.browserCloseTimeout * 60 * 1000;

      if (timeSinceActivity > timeoutMs) {
        // Previous session wasn't properly closed, mark it as browser closed
        this.markSessionAsClosed(oldSessionId, "Browser_Closed");
      }

      // Clean up old session data
      localStorage.removeItem("lastActivityTime");
      localStorage.removeItem("sessionId");
    }
  }

  async handleLogout(logoutType, waitForResponse = true) {
    if (this.isLoggingOut) return;

    this.isLoggingOut = true;
    console.log(`[Logout Tracker] Handling logout: ${logoutType}`);

    try {
      if (waitForResponse) {
        await logUserLogout({
          sessionId: this.sessionId,
          logoutType: logoutType
        });
      } else {
        // Fire and forget for browser close events
        logUserLogout({
          sessionId: this.sessionId,
          logoutType: logoutType
        }).catch((error) => {
          console.error("[Logout Tracker] Error logging logout:", error);
        });
      }

      // Clean up local storage
      localStorage.removeItem("lastActivityTime");
      localStorage.removeItem("sessionId");
      localStorage.removeItem("pageHiddenTime");
    } catch (error) {
      console.error("[Logout Tracker] Error handling logout:", error);
    } finally {
      if (waitForResponse) {
        this.isLoggingOut = false;
      }
    }
  }

  async markSessionAsClosed(sessionId, logoutType) {
    try {
      await logUserLogout({
        sessionId: sessionId,
        logoutType: logoutType
      });
    } catch (error) {
      console.error(
        "[Logout Tracker] Error marking old session as closed:",
        error
      );
    }
  }

  cleanup() {
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
    }
  }
}