({
    // Load Whistleblower Report options
    doInit: function (component, event, helper) {
        helper.loadReportOptions(component);
    },

    // Handle report selection change
    handleReportChange: function (component, event, helper) {
        helper.handleReportChange(component, event);
    },
})