# Session Management Solution for Salesforce

A comprehensive end-to-end solution for tracking user sessions, monitoring activity, and automatically managing user deactivation based on session security policies.

## 🚀 Features

### Core Capabilities

- **Real-time Session Tracking**: Monitors all user login events via Change Data Capture (CDC)
- **Advanced Logout Detection**: Tracks manual logouts, browser closes, and timeouts
- **Automatic Session Timeout**: Deactivates inactive sessions after configurable timeout (default: 15 minutes)
- **Concurrent Session Control**: Limits number of active sessions per user
- **User Activity Monitoring**: Tracks mouse movements, clicks, and keyboard activity via utility bar
- **Automatic User Deactivation**: Deactivates users with no active sessions
- **Session Analytics Dashboard**: Comprehensive reporting on session metrics
- **Browser-based Warnings**: Visual warnings before session timeout
- **Email Notifications**: Admin alerts for security events

### Technical Features

- Change Data Capture (CDC) for tracking User login events
- Enhanced logout tracking component for browser close detection
- Real-time activity monitoring through utility bar components
- Batch job for handling stale sessions
- Custom Metadata for configuration
- Lightning Web Components for UI
- Comprehensive test coverage (>75%)
- Production-ready error handling

## 📋 Prerequisites

1. **Salesforce Setup Requirements**:
   - Enable "Force logout on session timeout" in Session Settings
   - Set appropriate session timeout value (default: 15 minutes)
   - Enable Platform Events
   - System Administrator profile or equivalent permissions

2. **Development Requirements**:
   - Salesforce DX CLI
   - VS Code with Salesforce Extensions
   - Node.js and npm

## 🛠️ Installation

### Step 1: Enable Change Data Capture

1. Go to **Setup → Change Data Capture**
2. Select **User** object from Available Entities
3. Move to Selected Entities and Save

### Step 2: Deploy to Salesforce

```bash
# Authenticate to your org
sfdx auth:web:login -a myorg

# Deploy the session management package
sfdx force:source:deploy -p force-app/main/UtilityComponents/sessionManagement -u myorg

# Assign permission set to administrators
sfdx force:user:permset:assign -n Session_Administrator -u myorg
```

### Step 3: Configure Session Settings

1. Navigate to **Setup → Session Settings**
2. Enable **"Force logout on session timeout"**
3. Set **Timeout value** to 15 minutes (or your preference)

### Step 4: Schedule the Batch Job

Execute this anonymous Apex to schedule the session monitor:

```apex
SessionTimeoutMonitor.scheduleJob();
```

### Step 5: Add Components to App

1. **Add Activity Tracker to Utility Bar**:
   - Go to App Manager → Edit your app
   - Add "Session Activity Tracker" to Utility Items
   - Set as hidden (runs in background)

2. **Add Logout Tracker to Utility Bar**:
   - Add "Session Logout Tracker" to Utility Items
   - Set as hidden (runs in background)
   - Configure browser close timeout (default: 15 minutes)

3. **Add Warning Component to Utility Bar**:
   - Add "Session Timeout Warning" to Utility Items
   - Set as hidden (shows only when needed)

4. **Add Dashboard to App**:
   - Create a new Lightning page
   - Add "Session Monitoring Dashboard" component
   - Activate and add to navigation

## 📊 Configuration

### Custom Metadata Settings

Navigate to **Setup → Custom Metadata Types → Session Configuration → Manage Records**

| Setting                          | Default           | Description                            |
| -------------------------------- | ----------------- | -------------------------------------- |
| Session Timeout Minutes          | 15                | Minutes before session expires         |
| Enable Session Monitoring        | true              | Master switch for all features         |
| Enable Auto Deactivation         | true              | Auto-deactivate users with no sessions |
| Admin Email Notifications        | admin@company.com | Email for security alerts              |
| Batch Job Frequency Minutes      | 5                 | How often to check for dead sessions   |
| Max Concurrent Sessions          | 3                 | Maximum sessions per user              |
| Enable Activity Tracking         | true              | Track user activity                    |
| Activity Update Interval Minutes | 5                 | How often to update activity           |
| Session Warning Minutes          | 2                 | Show warning before timeout            |
| Enable Browser Tracking          | true              | Track browser/device info              |

## 🏗️ Architecture

### Data Model

**User_Session_Tracking\_\_c**

- Stores all session information
- Tracks login/logout times and types
- Includes browser, device, and location data
- Formula field for session duration
- Supports multiple logout types: Manual, Timeout, Browser_Closed, Admin_Forced, New Login

### Components

1. **Apex Classes**:
   - `SessionMonitoringService`: Core business logic with logout tracking methods
   - `UserChangeEventTriggerHandler`: Handles CDC events for login detection
   - `SessionTimeoutMonitor`: Batch job for handling stale sessions

2. **Triggers**:
   - `UserChangeEventTrigger`: On UserChangeEvent for CDC-based login tracking

3. **Lightning Web Components**:
   - `sessionMonitoringDashboard`: Analytics dashboard
   - `sessionActivityTracker`: Mouse movement and activity monitoring
   - `sessionLogoutTracker`: Advanced logout detection (button clicks and browser close)
   - `sessionTimeoutWarning`: Visual timeout warnings

### How It Works

1. **Login Detection**: When a user logs in, CDC captures the LastLoginDate change and creates a new session record
2. **Activity Tracking**: The utility bar component monitors mouse movements, clicks, and keyboard activity
3. **Logout Detection**:
   - Manual logout: Intercepted by detecting logout button clicks
   - Browser close: Detected via beforeunload/unload events with 15-minute timeout
   - Timeout: Sessions inactive for 15 minutes are marked as timed out
4. **Session Cleanup**: Batch job runs every 5 minutes to clean up stale sessions

## 📈 Usage Guide

### For Administrators

1. **Monitor Active Sessions**:
   - View the Session Monitoring Dashboard
   - Track real-time session counts
   - Analyze logout patterns

2. **Review Session Records**:
   - Navigate to User Session Tracking tab
   - Filter by user, date, or status
   - Export data for compliance

3. **Configure Security Policies**:
   - Update Session Configuration metadata
   - Adjust timeout and warning periods
   - Set concurrent session limits

### For End Users

1. **Session Warnings**:
   - Users see a warning 2 minutes before timeout
   - Can click "Continue Working" to extend session
   - Can choose to logout immediately

2. **Activity Tracking**:
   - Sessions automatically extend with activity
   - No action needed for active users
   - Transparent background operation

## 🔒 Security Considerations

1. **Data Security**:
   - All session data respects sharing rules
   - IP addresses and location data are tracked
   - Sensitive data is never logged

2. **Compliance**:
   - Supports audit requirements
   - Provides complete session history
   - Email notifications for security events

3. **Best Practices**:
   - Regular review of session data
   - Monitor for unusual patterns
   - Update admin email for notifications

## 🧪 Testing

### Run All Tests

```bash
sfdx force:apex:test:run -n SessionMonitoringServiceTest,SessionTimeoutMonitorTest,UserChangeEventTriggerHandlerTest -r human
```

### Code Coverage

- Target: >75% coverage
- Current: ~85% coverage
- Includes positive and negative test cases

## 🚨 Troubleshooting

### Common Issues

1. **Sessions Not Being Tracked**:
   - Verify Change Data Capture is enabled for User object
   - Check Session Configuration metadata settings
   - Ensure UserChangeEventTrigger is active
   - Verify utility bar components are added to your app

2. **Logout Not Being Detected**:
   - Ensure Session Logout Tracker is added to utility bar
   - Check browser console for errors
   - Verify logout button detection patterns match your org
   - Check localStorage for stale session data

3. **Batch Job Not Running**:
   - Check Scheduled Jobs in Setup
   - Verify job is in "Waiting" state
   - Re-run `SessionTimeoutMonitor.scheduleJob()`

4. **Browser Close Not Working**:
   - Browser close detection has a 15-minute timeout
   - Check browser console before closing
   - Ensure JavaScript is enabled
   - Some browsers may block beforeunload events

5. **Users Not Being Deactivated**:
   - Check Enable_Auto_Deactivation\_\_c setting
   - Verify user has no active sessions
   - Check debug logs for errors

### Debug Mode

Enable debug logs for these classes:

- SessionMonitoringService
- UserChangeEventTriggerHandler
- SessionTimeoutMonitor

### Browser Console Commands

```javascript
// Check if logout tracker is initialized
console.log("[Session Status]", localStorage.getItem("sessionId"));

// Check last activity time
console.log(
  "[Last Activity]",
  new Date(parseInt(localStorage.getItem("lastActivityTime")))
);

// Force logout (for testing)
document.dispatchEvent(new CustomEvent("force-logout"));
```

## 📝 Maintenance

### Regular Tasks

1. **Weekly**:
   - Review session analytics
   - Check for failed batch jobs
   - Monitor email notifications

2. **Monthly**:
   - Analyze session patterns
   - Review security policies
   - Clean up old session records

3. **Quarterly**:
   - Update configuration as needed
   - Review and update documentation
   - Performance optimization

## 🤝 Support

For issues or questions:

1. Check debug logs
2. Review this documentation
3. Contact your Salesforce administrator
4. Submit a support ticket

## 📄 License

This solution is provided as-is for use within your Salesforce organization.

---

**Version**: 1.0.0  
**Last Updated**: 2024  
**Compatibility**: Salesforce API v58.0+
