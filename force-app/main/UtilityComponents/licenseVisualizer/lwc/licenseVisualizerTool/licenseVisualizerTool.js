import { LightningElement, api, track, wire } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Apex methods
import getLicenseData from '@salesforce/apex/LicenseVisualizerController.getLicenseData';
import getUserLoginActivity from '@salesforce/apex/LicenseVisualizerController.getUserLoginActivity';
import getFeatureAdoptionData from '@salesforce/apex/LicenseVisualizerController.getFeatureAdoptionData';
import getApiUsageData from '@salesforce/apex/LicenseVisualizerController.getApiUsageData';
import exportData from '@salesforce/apex/LicenseVisualizerController.exportData';
import getLicenseSharingOpportunities from '@salesforce/apex/LicenseVisualizerController.getLicenseSharingOpportunities';
import getInactiveUsers from '@salesforce/apex/LicenseVisualizerController.getInactiveUsers';
import getAccountLockouts from '@salesforce/apex/LicenseVisualizerController.getAccountLockoutsData';

// Static resources for Chart.js
import chartjs from '@salesforce/resourceUrl/chartjs';
import chartjsPluginDatalabels from '@salesforce/resourceUrl/chartjsPluginDatalabels';
import heatmapPlugin from '@salesforce/resourceUrl/heatmapPlugin';

/**
 * Helper method to download a file using native browser functionality
 * @param {Blob} blob - The file content as a Blob
 * @param {String} filename - The name to save the file as
 */
function downloadFile(blob, filename) {
    // Create a URL for the blob
    const url = window.URL.createObjectURL(blob);
    
    // Create a temporary link element
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    
    // Append to the document, click the link, and clean up
    document.body.appendChild(link);
    link.click();
    
    // Remove the link after a short delay
    setTimeout(() => {
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
    }, 100);
}

export default class LicenseVisualizerTool extends LightningElement {
    /**
     * Configuration properties exposed via the component's target config
     */
    @api autoRefreshInterval = 60; // Minutes
    @api showInactiveUsers = false;
    @api inactiveUserThreshold = 90; // Days
    @api defaultTabName = 'license_usage';
    @api displayMode = 'graphical';
    @api colorTheme = 'nuvitek';
    @api enableExport = false;
    @api showDetailedApiUsage = false;
    @api enableRealTimeUpdates = false;

    /**
     * Private tracked state variables
     */
    @track isLoading = true;
    @track errorMessage;
    @track currentTab = 'license_usage';
    @track lastRefreshDate = '';
    @track showInactiveUserModal = false;
    @track showLicenseSharingModal = false;
    @track showLockoutModal = false;
    @track selectedLicense;
    @track inactiveUserDetails = [];
    @track licenseSharingDetails = [];
    @track lockoutDetails = [];

    // Auto-refresh interval handler
    refreshInterval;
    
    // Chart instances
    licenseChart;
    heatmapChart;
    geoMapChart;
    loginMethodChart;
    permissionChart;
    profileChart;
    objectUsageChart;
    apiTrendChart;
    apiConsumersChart;
    connectedAppsChart;
    
    // Chart.js library loaded state
    chartsJsInitialized = false;
    
    // Data for tabs
    @track licenseData = {};
    @track userActivityData = {};
    @track featureAdoptionData = {};
    @track apiUsageData = {};
    
    // Configuration and selection states
    @track selectedTimeScale = 'week';
    @track selectedApiTimeframe = '30days';
    @track sortBy = 'licenseName';
    @track sortDirection = 'asc';
    @track apiSortBy = 'name';
    @track apiSortDirection = 'asc';
    
    // Column definitions for data tables
    @track licenseColumns = [
        { label: 'License Type', fieldName: 'licenseName', type: 'text', sortable: true },
        { label: 'Total Licenses', fieldName: 'totalLicenses', type: 'number', sortable: true },
        { label: 'Assigned', fieldName: 'assignedLicenses', type: 'number', sortable: true },
        { label: 'Inactive', fieldName: 'inactiveLicenses', type: 'number', sortable: true, 
          cellAttributes: { class: { fieldName: 'inactiveClass' } } },
        { label: 'Available', fieldName: 'availableLicenses', type: 'number', sortable: true },
        { label: 'Utilization', fieldName: 'utilizationPercentage', type: 'percent', sortable: true, 
          cellAttributes: { class: { fieldName: 'utilizationClass' } } },
        { label: 'Monthly Cost', fieldName: 'monthlyCost', type: 'currency', sortable: true,
          typeAttributes: { currencyCode: 'USD' } },
        { label: 'Actions', type: 'action',
          typeAttributes: { 
            rowActions: [
                { label: 'View Inactive Users', name: 'view_inactive' },
                { label: 'View Sharing Opportunities', name: 'view_sharing' }
            ]
          }
        }
    ];
    
    @track inactiveUserColumns = [
        { label: 'Name', fieldName: 'name', type: 'text' },
        { label: 'Username', fieldName: 'username', type: 'text' },
        { label: 'Email', fieldName: 'email', type: 'email' },
        { label: 'Profile', fieldName: 'profile', type: 'text' },
        { label: 'Department', fieldName: 'department', type: 'text' },
        { label: 'Title', fieldName: 'title', type: 'text' },
        { label: 'Last Login', fieldName: 'lastLogin', type: 'date',
          typeAttributes: { year: 'numeric', month: 'short', day: 'numeric' } },
        { label: 'Days Since Login', fieldName: 'daysSinceLogin', type: 'text' }
    ];
    
    @track licenseSharingColumns = [
        { label: 'Pattern', fieldName: 'pattern', type: 'text' },
        { label: 'User Count', fieldName: 'userCount', type: 'number' },
        { label: 'Potential Savings', fieldName: 'potentialSavings', type: 'currency',
          typeAttributes: { currencyCode: 'USD' } }
    ];
    
    @track sharingUserColumns = [
        { label: 'Name', fieldName: 'name', type: 'text' },
        { label: 'Username', fieldName: 'username', type: 'text' },
        { label: 'Profile', fieldName: 'profile', type: 'text' }
    ];
    
    @track apiUsageColumns = [
        { label: 'Name', fieldName: 'name', type: 'text', sortable: true },
        { label: 'Type', fieldName: 'type', type: 'text', sortable: true },
        { label: 'API Calls (24h)', fieldName: 'apiCalls24h', type: 'number', sortable: true },
        { label: 'API Calls (7d)', fieldName: 'apiCalls7d', type: 'number', sortable: true },
        { label: 'API Calls (30d)', fieldName: 'apiCalls30d', type: 'number', sortable: true },
        { label: 'Last Used', fieldName: 'lastUsed', type: 'date', sortable: true,
          typeAttributes: { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' } },
        { label: 'Trend', fieldName: 'trend', type: 'percent', sortable: true, 
          cellAttributes: { class: { fieldName: 'trendClass' } } }
    ];
    
    @track timeScaleOptions = [
        { label: 'Day', value: 'day' },
        { label: 'Week', value: 'week' },
        { label: 'Month', value: 'month' }
    ];
    
    @track apiTimeframeOptions = [
        { label: '24 Hours', value: '24hours' },
        { label: '7 Days', value: '7days' },
        { label: '30 Days', value: '30days' },
        { label: '90 Days', value: '90days' }
    ];
    
    // Columns and settings for user activity details
    @track userActivityColumns = [
        { label: 'Name', fieldName: 'name', type: 'text', sortable: true },
        { label: 'Username', fieldName: 'username', type: 'text', sortable: true },
        { label: 'Profile', fieldName: 'profile', type: 'text', sortable: true },
        { label: 'Last Login', fieldName: 'lastLogin', type: 'date', sortable: true,
          typeAttributes: { year: 'numeric', month: 'short', day: 'numeric' } },
        { label: 'Days Since Login', fieldName: 'daysSinceLogin', type: 'text', sortable: true },
        { label: 'Status', fieldName: 'status', type: 'text', sortable: true,
          cellAttributes: { class: { fieldName: 'statusClass' } } }
    ];
    
    // Columns for profile activity matrix
    @track profileActivityColumns = [
        { label: 'Profile', fieldName: 'profileName', type: 'text', sortable: true },
        { label: 'User Count', fieldName: 'userCount', type: 'number', sortable: true },
        { label: '% of Total', fieldName: 'userPercent', type: 'percent', sortable: true },
        { label: 'Active Users', fieldName: 'activeUsersCount', type: 'number', sortable: true },
        { label: '% Active', fieldName: 'activeUsersPercent', type: 'percent', sortable: true,
          cellAttributes: { class: { fieldName: 'activityClass' } } },
        { label: 'Login Count', fieldName: 'loginCount', type: 'number', sortable: true },
        { label: 'Avg Logins/User', fieldName: 'avgLoginsPerUser', type: 'number', sortable: true }
    ];
    
    // Columns for account lockouts
    @track lockoutColumns = [
        { label: 'Name', fieldName: 'name', type: 'text' },
        { label: 'Username', fieldName: 'username', type: 'text' },
        { label: 'Email', fieldName: 'email', type: 'email' },
        { label: 'Profile', fieldName: 'profileName', type: 'text' },
        { label: 'Lockout Time', fieldName: 'lockoutTime', type: 'date',
          typeAttributes: { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' } },
        { label: 'Application', fieldName: 'application', type: 'text' },
        { label: 'Browser', fieldName: 'browser', type: 'text' },
        { label: 'Source IP', fieldName: 'sourceIp', type: 'text' },
        { label: 'Login Type', fieldName: 'loginType', type: 'text' }
    ];
    
    /**
     * Lifecycle hooks
     */
    connectedCallback() {
        // Set the current tab based on the default from config
        this.currentTab = this.defaultTabName;
        
        // Format the current date and time for last refreshed
        this.updateLastRefreshedDate();
        
        // Initialize data loading
        this.loadData();
        
        // Set up auto-refresh if enabled
        this.setupAutoRefresh();
    }
    
    disconnectedCallback() {
        // Clear any intervals when component is destroyed
        this.clearAutoRefresh();
        
        // Destroy any existing chart instances
        this.destroyCharts();
    }
    
    renderedCallback() {
        // Current tab implementation
        if (!this.currentTab && this.defaultTabName) {
            this.currentTab = this.defaultTabName;
        }
        
        // If Chart.js is not initialized and we don't have an error message
        if (!this.chartsJsInitialized && !this.errorMessage && this.displayMode === 'graphical') {
            // Initialize Chart.js only once
            try {
                this.initializeChartJs();
            } catch (error) {
                console.error('Error initializing Chart.js:', error);
                this.handleError('Failed to initialize chart libraries');
            }
        }

        // Set the last refreshed date if not set
        if (!this.lastRefreshDate) {
            this.updateLastRefreshedDate();
        }
    }
    
    isChartContainerReady() {
        try {
            // Check if current tab has chart containers
            if (this.isLicenseTab) {
                return !!this.template.querySelector('.chart-area');
            } else if (this.isUserActivityTab) {
                return !!this.template.querySelector('.login-trend-chart') || 
                       !!this.template.querySelector('.heatmap-chart');
            } else if (this.isFeatureTab) {
                return !!this.template.querySelector('.permission-chart') || 
                       !!this.template.querySelector('.profile-chart');
            } else if (this.isApiTab) {
                return !!this.template.querySelector('.api-trend-chart');
            }
            return false;
        } catch (error) {
            console.error('Error checking chart container:', error);
            return false;
        }
    }

    initializeChartJs() {
        console.log('Initializing Chart.js libraries');
        
        // Track loading state
        let loadingPromiseResolved = false;
        
        // Set a timeout in case loading takes too long
        const loadingTimeout = setTimeout(() => {
            if (!loadingPromiseResolved) {
                console.error('Timeout loading Chart.js libraries');
                this.handleError('Timeout loading chart libraries. Try refreshing the page.');
            }
        }, 10000); // 10 second timeout
        
        // Load Chart.js and its plugins with proper error handling
        Promise.all([
            loadScript(this, chartjs),
            loadScript(this, chartjsPluginDatalabels),
            loadScript(this, heatmapPlugin)
        ])
        .then(() => {
            loadingPromiseResolved = true;
            clearTimeout(loadingTimeout);
            console.log('Chart.js libraries loaded successfully');
            
            // Check if Chart object is available
            if (typeof Chart === 'undefined') {
                throw new Error('Chart object not found after loading libraries');
            }
            
            this.chartsJsInitialized = true;
            
            // Initialize charts based on the active tab
            this.initializeChartsForCurrentTab();
        })
        .catch(error => {
            loadingPromiseResolved = true;
            clearTimeout(loadingTimeout);
            console.error('Error loading Chart.js libraries:', error);
            this.handleError('Error loading chart libraries: ' + this.reduceError(error));
        });
    }
    
    initializeChartsForCurrentTab() {
        // Defer chart rendering to ensure DOM is ready
        setTimeout(() => {
            try {
                console.log('Initializing charts for tab:', this.currentTab);
                
                if (this.isLicenseTab) {
                    this.renderLicenseChart();
                } else if (this.isUserActivityTab) {
                    this.renderUserActivityCharts();
                } else if (this.isFeatureTab) {
                    this.renderFeatureAdoptionCharts();
                } else if (this.isApiTab) {
                    this.renderApiUsageCharts();
                }
            } catch (error) {
                console.error('Error initializing charts for tab:', error);
                this.handleError('Error initializing charts: ' + this.reduceError(error));
            }
        }, 250); // Slightly longer timeout to ensure DOM is ready
    }
    
    destroyCharts() {
        // Helper to safely destroy chart instances
        const destroyChart = (chart) => {
            if (chart) {
                chart.destroy();
            }
        };
        
        // Destroy all chart instances
        destroyChart(this.licenseChart);
        destroyChart(this.heatmapChart);
        destroyChart(this.geoMapChart);
        destroyChart(this.loginMethodChart);
        destroyChart(this.permissionChart);
        destroyChart(this.profileChart);
        destroyChart(this.objectUsageChart);
        destroyChart(this.permProfileChart);
        destroyChart(this.apiTrendChart);
        destroyChart(this.apiConsumersChart);
        destroyChart(this.connectedAppsChart);
    }
    
    /**
     * Chart rendering methods
     */
    renderLicenseChart() {
        if (this.displayMode !== 'graphical' || !this.licenseData.licenseDetails) {
            return;
        }
        
        const ctx = this.getCanvasContext('.chart-area');
        if (!ctx) {
            this.handleError('Error rendering license chart: Canvas context could not be obtained');
            return;
        }
        
        // Extract data for the chart
        const licenseNames = [];
        const assignedValues = [];
        const inactiveValues = [];
        const availableValues = [];
        
        this.licenseData.licenseDetails.forEach(license => {
            licenseNames.push(license.licenseName);
            assignedValues.push(license.assignedLicenses - license.inactiveLicenses);
            inactiveValues.push(license.inactiveLicenses);
            availableValues.push(license.availableLicenses);
        });
        
        // Define the chart data
        const data = {
            labels: licenseNames,
            datasets: [
                {
                    label: 'Active Users',
                    backgroundColor: this.getChartColorByTheme('primary'),
                    data: assignedValues
                },
                {
                    label: 'Inactive Users',
                    backgroundColor: this.getChartColorByTheme('danger'),
                    data: inactiveValues
                },
                {
                    label: 'Available Licenses',
                    backgroundColor: this.getChartColorByTheme('neutral'),
                    data: availableValues
                }
            ]
        };
        
        // Define chart options
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false // We have a custom legend
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                },
                datalabels: {
                    color: '#fff',
                    font: {
                        weight: 'bold'
                    },
                    display: function(context) {
                        return context.dataset.data[context.dataIndex] > 0;
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: {
                        display: false
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true
                }
            }
        };
        
        // Create the chart
        try {
            this.licenseChart = new Chart(ctx, {
                type: 'bar',
                data: data,
                options: options
            });
        } catch (error) {
            this.handleError('Error creating license chart: ' + this.reduceError(error));
        }
    }
    
    renderUserActivityCharts() {
        if (this.displayMode !== 'graphical' || !this.userActivityData) {
            return;
        }
        
        console.log('Preparing to render user activity charts');
        
        // Check that the data objects we need actually exist
        if (!this.userActivityData.heatmapData || !this.userActivityData.geoData || !this.userActivityData.loginMethodData) {
            console.warn('Some user activity data is missing:', 
                        'heatmapData:', !!this.userActivityData.heatmapData,
                        'geoData:', !!this.userActivityData.geoData,
                        'loginMethodData:', !!this.userActivityData.loginMethodData);
        }
        
        // Map of containers to check and their corresponding rendering functions
        const containerMap = {
            '.login-trend-chart': () => this.renderLoginTrendChart(),
            '.heatmap-chart': () => this.renderLoginHeatmap(),
            '.geo-map-container': () => this.renderGeoDistribution(),
            '.login-method-chart': () => this.renderLoginMethodChart()
        };
        
        // First check all containers
        const checkContainers = () => {
            let allContainersFound = true;
            const missingContainers = [];
            
            // Check each container
            for (const selector in containerMap) {
                const container = this.template.querySelector(selector);
                if (!container) {
                    missingContainers.push(selector);
                    allContainersFound = false;
                }
            }
            
            if (!allContainersFound) {
                console.warn('Missing chart containers:', missingContainers.join(', '));
                return false;
            }
            
            return true;
        };
        
        // Attempt to render charts with retries
        const attemptRendering = (attempt = 0) => {
            if (attempt >= 3) {
                console.error('Failed to find all chart containers after 3 attempts');
                this.handleError('Some charts could not be rendered due to missing containers');
                return;
            }
            
            if (!checkContainers()) {
                // Try again after a delay - increase delay with each attempt
                setTimeout(() => attemptRendering(attempt + 1), 1000 * (attempt + 1));
                return;
            }
            
            // All containers found, render charts
            console.log('All containers found, rendering charts');
            
            try {
                // Render each chart if container exists and has data
                for (const selector in containerMap) {
                    try {
                        const container = this.template.querySelector(selector);
                        if (container) {
                            containerMap[selector]();
                        }
                    } catch (err) {
                        console.error(`Error rendering chart for ${selector}:`, err);
                    }
                }
            } catch (error) {
                console.error('Error rendering user activity charts:', error);
                this.handleError('Error rendering user activity charts: ' + this.reduceError(error));
            }
        };
        
        // Start rendering process
        attemptRendering();
    }
    
    renderLoginTrendChart() {
        const ctx = this.getCanvasContext('.login-trend-chart');
        if (!ctx) {
            this.handleError('Error rendering login trend chart: Canvas context could not be obtained');
            return;
        }
        
        // Use trendData from userActivityData if available, or create sample data
        const trendData = this.userActivityData.trendData || [];
        
        if (trendData.length === 0) {
            console.warn('No login trend data available');
            return;
        }
        
        // Prepare data for the line chart
        const data = {
            labels: trendData.map(item => item.label),
            datasets: [{
                label: 'Logins',
                data: trendData.map(item => item.value),
                fill: true,
                backgroundColor: 'rgba(52, 152, 219, 0.2)',
                borderColor: this.getChartColorByTheme('primary'),
                tension: 0.4,
                pointBackgroundColor: this.getChartColorByTheme('primary'),
                pointBorderColor: '#fff',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        };
        
        // Define chart options
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        drawBorder: false
                    }
                }
            }
        };
        
        // Create the chart
        try {
            this.loginTrendChart = new Chart(ctx, {
                type: 'line',
                data: data,
                options: options
            });
        } catch (error) {
            this.handleError('Error creating login trend chart: ' + this.reduceError(error));
        }
    }
    
    renderLoginHeatmap() {
        const ctx = this.getCanvasContext('.heatmap-chart');
        if (!ctx) {
            this.handleError('Error rendering heatmap: Canvas context could not be obtained');
            return;
        }
        
        const heatmapData = this.userActivityData.heatmapData || [];
        
        // If the 'matrix' chart type is not available, use a standard heatmap with bar chart
        try {
            console.log('Rendering heatmap with data points:', heatmapData.length);
            
            // Extract unique labels
            const hours = [...new Set(heatmapData.map(item => item.hour))];
            const days = [...new Set(heatmapData.map(item => item.day))];
            
            // Prepare dataset in a format suitable for bar chart instead of matrix
            // Group data by day for stacked bar chart
            const datasets = [];
            
            days.forEach(day => {
                const dayData = heatmapData.filter(item => item.day === day);
                const data = hours.map(hour => {
                    const item = dayData.find(d => d.hour === hour);
                    return item ? item.value : 0;
                });
                
                // Create a dataset for each day
                datasets.push({
                    label: day,
                    data: data,
                    backgroundColor: this.getChartColorByTheme('primary', 0.7),
                    borderColor: this.getChartColorByTheme('primary'),
                    borderWidth: 1
                });
            });
            
            // Define the chart data
            const data = {
                labels: hours,
                datasets: datasets
            };
            
            // Define chart options
            const options = {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            boxWidth: 12,
                            padding: 10
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                return `${context.dataset.label}: ${context.raw} logins`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Time of Day'
                        },
                        grid: {
                            display: false
                        }
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Login Count'
                        },
                        beginAtZero: true,
                        stacked: true
                    }
                }
            };
            
            // Create the chart - using bar type instead of matrix
            this.heatmapChart = new Chart(ctx, {
                type: 'bar',
                data: data,
                options: options
            });
            console.log('Heatmap chart created successfully');
        } catch (error) {
            console.error('Detailed heatmap error:', error);
            this.handleError('Error creating heatmap chart: ' + this.reduceError(error));
            
            // Fallback to a simple bar chart if there's an error
            try {
                // Super simple fallback chart
                const fallbackData = {
                    labels: ['Morning', 'Afternoon', 'Evening'],
                    datasets: [{
                        label: 'Login Activity',
                        data: [65, 59, 80],
                        backgroundColor: this.getChartColorByTheme('primary')
                    }]
                };
                
                this.heatmapChart = new Chart(ctx, {
                    type: 'bar',
                    data: fallbackData,
                    options: {
                        responsive: true,
                        maintainAspectRatio: false
                    }
                });
            } catch (fallbackError) {
                console.error('Even fallback chart failed:', fallbackError);
            }
        }
    }
    
    renderGeoDistribution() {
        const ctx = this.getCanvasContext('.geo-map-container');
        if (!ctx) {
            this.handleError('Error rendering geo distribution chart: Canvas context could not be obtained');
            return;
        }
        
        const geoData = this.userActivityData.geoData || [];
        
        // Prepare data for the pie chart
        const data = {
            labels: geoData.map(item => item.region),
            datasets: [{
                data: geoData.map(item => item.count),
                backgroundColor: this.getChartColorPalette(),
                borderWidth: 1,
                borderColor: '#fff'
            }]
        };
        
        // Define chart options
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        padding: 15
                    }
                },
                datalabels: {
                    color: '#fff',
                    font: {
                        weight: 'bold'
                    },
                    formatter: (value, ctx) => {
                        const sum = ctx.dataset.data.reduce((a, b) => a + b, 0);
                        const percentage = (value * 100 / sum).toFixed(1) + '%';
                        return percentage;
                    }
                }
            }
        };
        
        // Create the chart
        try {
            this.geoMapChart = new Chart(ctx, {
                type: 'pie',
                data: data,
                options: options
            });
        } catch (error) {
            this.handleError('Error creating geo distribution chart: ' + this.reduceError(error));
        }
    }
    
    renderLoginMethodChart() {
        const ctx = this.getCanvasContext('.login-method-chart');
        if (!ctx) {
            this.handleError('Error rendering login method chart: Canvas context could not be obtained');
            return;
        }
        
        const methodData = this.userActivityData.loginMethodData || [];
        
        // Prepare data for the doughnut chart
        const data = {
            labels: methodData.map(item => item.method),
            datasets: [{
                data: methodData.map(item => item.percentage),
                backgroundColor: this.getChartColorPalette(),
                borderWidth: 1,
                borderColor: '#fff'
            }]
        };
        
        // Define chart options
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        padding: 15
                    }
                }
            }
        };
        
        // Create the chart
        try {
            this.loginMethodChart = new Chart(ctx, {
                type: 'doughnut',
                data: data,
                options: options
            });
        } catch (error) {
            this.handleError('Error creating login method chart: ' + this.reduceError(error));
        }
    }
    
    renderFeatureAdoptionCharts() {
        if (this.displayMode !== 'graphical' || !this.featureAdoptionData) {
            return;
        }
        
        // Defer rendering to ensure DOM is ready with a longer timeout
        setTimeout(() => {
            try {
                console.log('Rendering feature adoption charts');
                // Use a defensive approach - only render if we have actual data
                if (this.featureAdoptionData.permissionSetData && this.featureAdoptionData.permissionSetData.length > 0) {
                    this.renderPermissionSetChart();
                }
                
                if (this.featureAdoptionData.profileData && this.featureAdoptionData.profileData.length > 0) {
                    this.renderProfileChart();
                }
                
                if (this.featureAdoptionData.objectUsageData && this.featureAdoptionData.objectUsageData.length > 0) {
                    this.renderObjectUsageChart();
                }
                
                if (this.featureAdoptionData.permissionSetByProfile && this.featureAdoptionData.permissionSetByProfile.length > 0) {
                    this.renderPermProfileChart();
                }
            } catch (error) {
                this.handleError('Error rendering feature adoption charts: ' + this.reduceError(error));
            }
        }, 250); // Longer timeout to ensure DOM is properly rendered
    }
    
    renderPermissionSetChart() {
        const ctx = this.getCanvasContext('.permission-chart');
        if (!ctx) {
            this.handleError('Error rendering permission set chart: Canvas context could not be obtained');
            return;
        }
        
        const permSetData = this.featureAdoptionData.permissionSetData || [];
        
        // Prepare data for the horizontal bar chart
        const data = {
            labels: permSetData.map(item => item.name),
            datasets: [{
                data: permSetData.map(item => item.count),
                backgroundColor: this.getChartColorByTheme('primary'),
                borderColor: 'rgba(0, 0, 0, 0.1)',
                borderWidth: 1
            }]
        };
        
        // Define chart options
        const options = {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        display: true,
                        drawBorder: false
                    }
                },
                y: {
                    grid: {
                        display: false
                    }
                }
            }
        };
        
        // Create the chart
        try {
            this.permissionChart = new Chart(ctx, {
                type: 'bar',
                data: data,
                options: options
            });
        } catch (error) {
            this.handleError('Error creating permission set chart: ' + this.reduceError(error));
        }
    }
    
    renderProfileChart() {
        const ctx = this.getCanvasContext('.profile-chart');
        if (!ctx) {
            this.handleError('Error rendering profile chart: Canvas context could not be obtained');
            return;
        }
        
        const profileData = this.featureAdoptionData.profileData || [];
        
        // Prepare data for the doughnut chart
        const data = {
            labels: profileData.map(item => item.name),
            datasets: [{
                data: profileData.map(item => item.count),
                backgroundColor: this.getChartColorPalette(),
                borderWidth: 1,
                borderColor: '#fff'
            }]
        };
        
        // Define chart options
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '60%',
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        padding: 15
                    }
                }
            }
        };
        
        // Create the chart
        try {
            this.profileChart = new Chart(ctx, {
                type: 'doughnut',
                data: data,
                options: options
            });
        } catch (error) {
            this.handleError('Error creating profile chart: ' + this.reduceError(error));
        }
    }
    
    renderObjectUsageChart() {
        const ctx = this.getCanvasContext('.object-usage-chart');
        if (!ctx) {
            this.handleError('Error rendering object usage chart: Canvas context could not be obtained');
            return;
        }
        
        const objectData = this.featureAdoptionData.objectUsageData || [];
        
        // Sort data by record count (descending)
        const sortedData = [...objectData].sort((a, b) => b.recordCount - a.recordCount);
        
        // Prepare data for the horizontal bar chart
        const data = {
            labels: sortedData.map(item => item.name),
            datasets: [{
                data: sortedData.map(item => item.recordCount),
                backgroundColor: this.getChartColorByTheme('accent'),
                borderColor: 'rgba(0, 0, 0, 0.1)',
                borderWidth: 1
            }]
        };
        
        // Define chart options
        const options = {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    grid: {
                        display: true,
                        drawBorder: false
                    }
                },
                y: {
                    grid: {
                        display: false
                    }
                }
            }
        };
        
        // Create the chart
        try {
            this.objectUsageChart = new Chart(ctx, {
                type: 'bar',
                data: data,
                options: options
            });
        } catch (error) {
            this.handleError('Error creating object usage chart: ' + this.reduceError(error));
        }
    }
    
    renderPermProfileChart() {
        const ctx = this.getCanvasContext('.perm-profile-chart');
        if (!ctx) {
            this.handleError('Error rendering permission set by profile chart: Canvas context could not be obtained');
            return;
        }
        
        const permProfileData = this.featureAdoptionData.permissionSetByProfile || [];
        
        if (permProfileData.length === 0) {
            console.warn('No permission set by profile data available');
            return;
        }
        
        // Get unique profiles and permission sets
        const profiles = [...new Set(permProfileData.map(item => item.profileName))];
        const permSets = [...new Set(permProfileData.map(item => item.permissionSetName))];
        
        // Create datasets for each profile
        const datasets = profiles.map((profile, index) => {
            const profileData = permProfileData.filter(item => item.profileName === profile);
            
            // Map data to match permission set order
            const data = permSets.map(permSet => {
                const match = profileData.find(item => item.permissionSetName === permSet);
                return match ? match.userCount : 0;
            });
            
            return {
                label: profile,
                data: data,
                backgroundColor: this.getChartColorPalette()[index % this.getChartColorPalette().length],
                barPercentage: 0.8,
                categoryPercentage: 0.9
            };
        });
        
        // Chart data configuration
        const data = {
            labels: permSets,
            datasets: datasets
        };
        
        // Chart options
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                tooltip: {
                    mode: 'index',
                    intersect: false
                },
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        padding: 10
                    }
                }
            },
            scales: {
                x: {
                    stacked: true,
                    grid: {
                        display: false
                    },
                    ticks: {
                        autoSkip: false,
                        maxRotation: 45,
                        minRotation: 45
                    }
                },
                y: {
                    stacked: true,
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: 'Number of Users'
                    }
                }
            }
        };
        
        // Create the chart
        try {
            this.permProfileChart = new Chart(ctx, {
                type: 'bar',
                data: data,
                options: options
            });
        } catch (error) {
            this.handleError('Error creating permission set by profile chart: ' + this.reduceError(error));
        }
    }
    
    renderApiUsageCharts() {
        if (this.displayMode !== 'graphical' || !this.apiUsageData) {
            return;
        }
        
        // Defer rendering to ensure DOM is ready with a longer timeout
        setTimeout(() => {
            try {
                console.log('Rendering API usage charts');
                // Use a defensive approach - only render if we have actual data
                if (this.apiUsageData.trendData && this.apiUsageData.trendData.length > 0) {
                    this.renderApiTrendChart();
                }
                
                if (this.apiUsageData.apiConsumers && this.apiUsageData.apiConsumers.length > 0) {
                    this.renderApiConsumersChart();
                }
                
                if (this.apiUsageData.connectedApps && this.apiUsageData.connectedApps.length > 0) {
                    this.renderConnectedAppsChart();
                }
            } catch (error) {
                this.handleError('Error rendering API usage charts: ' + this.reduceError(error));
            }
        }, 250); // Longer timeout to ensure DOM is properly rendered
    }
    
    renderApiTrendChart() {
        const ctx = this.getCanvasContext('.api-trend-chart');
        if (!ctx) {
            this.handleError('Error rendering API trend chart: Canvas context could not be obtained');
            return;
        }
        
        const trendData = this.apiUsageData.trendData || [];
        
        // Prepare data for the line chart
        const data = {
            labels: trendData.map(item => item.label),
            datasets: [{
                label: 'API Calls',
                data: trendData.map(item => item.value),
                fill: true,
                backgroundColor: 'rgba(34, 189, 193, 0.2)',
                borderColor: this.getChartColorByTheme('primary'),
                tension: 0.4,
                pointBackgroundColor: this.getChartColorByTheme('primary'),
                pointBorderColor: '#fff',
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        };
        
        // Define chart options
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    mode: 'index',
                    intersect: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        drawBorder: false
                    }
                }
            }
        };
        
        // Create the chart
        try {
            this.apiTrendChart = new Chart(ctx, {
                type: 'line',
                data: data,
                options: options
            });
        } catch (error) {
            this.handleError('Error creating API trend chart: ' + this.reduceError(error));
        }
    }
    
    renderApiConsumersChart() {
        const ctx = this.getCanvasContext('.api-consumers-chart');
        if (!ctx) {
            this.handleError('Error rendering API consumers chart: Canvas context could not be obtained');
            return;
        }
        
        const consumersData = this.apiUsageData.apiConsumers || [];
        
        // Prepare data for the pie chart
        const data = {
            labels: consumersData.map(item => item.name),
            datasets: [{
                data: consumersData.map(item => item.percentage),
                backgroundColor: this.getChartColorPalette(),
                borderWidth: 1,
                borderColor: '#fff'
            }]
        };
        
        // Define chart options
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: {
                        boxWidth: 12,
                        padding: 15
                    }
                },
                datalabels: {
                    color: '#fff',
                    font: {
                        weight: 'bold'
                    },
                    formatter: (value) => {
                        return value + '%';
                    }
                }
            }
        };
        
        // Create the chart
        try {
            this.apiConsumersChart = new Chart(ctx, {
                type: 'pie',
                data: data,
                options: options
            });
        } catch (error) {
            this.handleError('Error creating API consumers chart: ' + this.reduceError(error));
        }
    }
    
    renderConnectedAppsChart() {
        const ctx = this.getCanvasContext('.connected-apps-chart');
        if (!ctx) {
            this.handleError('Error rendering connected apps chart: Canvas context could not be obtained');
            return;
        }
        
        const appsData = this.apiUsageData.connectedApps || [];
        
        // Prepare data for the bar chart
        const data = {
            labels: appsData.map(item => item.name),
            datasets: [{
                data: appsData.map(item => item.calls),
                backgroundColor: this.getChartColorByTheme('accent'),
                borderColor: 'rgba(0, 0, 0, 0.1)',
                borderWidth: 1
            }]
        };
        
        // Define chart options
        const options = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        drawBorder: false
                    }
                }
            }
        };
        
        // Create the chart
        try {
            this.connectedAppsChart = new Chart(ctx, {
                type: 'bar',
                data: data,
                options: options
            });
        } catch (error) {
            this.handleError('Error creating connected apps chart: ' + this.reduceError(error));
        }
    }
    
    /**
     * Helper methods for chart rendering
     */
    getChartColorByTheme(type) {
        const colorMap = {
            nuvitek: {
                primary: '#22BDC1',
                accent: '#D5DF23',
                danger: '#F53F50',
                success: '#23C552',
                warning: '#F8A100',
                neutral: '#7C8693'
            },
            salesforce: {
                primary: '#0070D2',
                accent: '#FFAF03',
                danger: '#D4504C',
                success: '#04844B',
                warning: '#FFB75D',
                neutral: '#706E6B'
            },
            neutral: {
                primary: '#5A6ACF',
                accent: '#5AC8FA',
                danger: '#FF3B30',
                success: '#34C759',
                warning: '#FF9500',
                neutral: '#8E8E93'
            },
            dark: {
                primary: '#24C8DB',
                accent: '#D223FB',
                danger: '#FF453A',
                success: '#30D158',
                warning: '#FFD60A',
                neutral: '#6C7C8C'
            },
            light: {
                primary: '#007AFF',
                accent: '#5856D6',
                danger: '#FF2D55',
                success: '#4CD964',
                warning: '#FF9500',
                neutral: '#AEAEB2'
            }
        };
        
        // Default to nuvitek theme if the specified theme doesn't exist
        const themeColors = colorMap[this.colorTheme] || colorMap.nuvitek;
        return themeColors[type] || themeColors.primary;
    }
    
    getChartColorPalette() {
        const baseTheme = this.colorTheme || 'nuvitek';
        
        // Define color palettes for each theme
        const palettes = {
            nuvitek: ['#22BDC1', '#D5DF23', '#F53F50', '#23C552', '#F8A100', '#7C8693', '#5A73F3', '#10A789', '#E85B98', '#AA67FF'],
            salesforce: ['#0070D2', '#FFAF03', '#D4504C', '#04844B', '#FFB75D', '#706E6B', '#16325C', '#54698D', '#A094ED', '#4BC076'],
            neutral: ['#5A6ACF', '#5AC8FA', '#FF3B30', '#34C759', '#FF9500', '#8E8E93', '#007AFF', '#AF52DE', '#FF9500', '#5AC8FA'],
            dark: ['#24C8DB', '#D223FB', '#FF453A', '#30D158', '#FFD60A', '#6C7C8C', '#0A84FF', '#BF5AF2', '#FF9F0A', '#64D2FF'],
            light: ['#007AFF', '#5856D6', '#FF2D55', '#4CD964', '#FF9500', '#AEAEB2', '#32ADE6', '#AF52DE', '#FF9500', '#64D2FF']
        };
        
        return palettes[baseTheme] || palettes.nuvitek;
    }
    
    /**
     * Data loading methods
     */
    loadData() {
        this.isLoading = true;
        
        if (this.isLicenseTab) {
            this.loadLicenseData();
        } else if (this.isUserActivityTab) {
            this.loadUserActivityData();
        } else if (this.isFeatureTab) {
            this.loadFeatureAdoptionData();
        } else if (this.isApiTab) {
            this.loadApiUsageData();
        }
    }
    
    loadLicenseData() {
        getLicenseData({ showInactiveUsers: this.showInactiveUsers, inactiveUserThreshold: this.inactiveUserThreshold })
            .then(result => {
                this.licenseData = JSON.parse(result);
                
                // Sort license data
                this.sortLicenseData();
                
                this.isLoading = false;
                
                // Render charts if in graphical mode
                if (this.displayMode === 'graphical') {
                    this.initializeChartsForCurrentTab();
                }
            })
            .catch(error => {
                this.handleError('Error loading license data: ' + this.reduceError(error));
            });
    }
    
    loadUserActivityData() {
        getUserLoginActivity({ 
            timeScale: this.selectedTimeScale,
            inactiveUserThreshold: this.inactiveUserThreshold 
        })
        .then(result => {
            this.userActivityData = JSON.parse(result);
            
            // Load account lockout data after user activity data
            this.loadAccountLockouts();
            
            this.isLoading = false;
            
            // If chart.js is initialized, render the charts
            if (this.chartsJsInitialized) {
                this.renderUserActivityCharts();
            }
        })
        .catch(error => {
            this.handleError('Error loading user activity data: ' + this.reduceError(error));
            this.isLoading = false;
        });
    }
    
    loadFeatureAdoptionData() {
        getFeatureAdoptionData()
        .then(result => {
            this.featureAdoptionData = JSON.parse(result);
            this.isLoading = false;
            
            // If chart.js is initialized, render the charts
            if (this.chartsJsInitialized) {
                this.renderFeatureAdoptionCharts();
            }
        })
        .catch(error => {
            this.handleError('Error loading feature adoption data: ' + this.reduceError(error));
        });
    }
    
    loadApiUsageData() {
        getApiUsageData({ 
            timeframe: this.selectedApiTimeframe,
            showDetailed: this.showDetailedApiUsage 
        })
        .then(result => {
            this.apiUsageData = JSON.parse(result);
            this.isLoading = false;
            
            // If chart.js is initialized, render the charts
            if (this.chartsJsInitialized) {
                this.renderApiUsageCharts();
            }
        })
        .catch(error => {
            this.handleError('Error loading API usage data: ' + this.reduceError(error));
        });
    }
    
    setupAutoRefresh() {
        // Clear any existing interval
        this.clearAutoRefresh();
        
        // Set up new interval if autoRefreshInterval > 0
        if (this.autoRefreshInterval > 0) {
            const intervalMs = this.autoRefreshInterval * 60 * 1000; // Convert minutes to milliseconds
            this.refreshInterval = setInterval(() => {
                this.handleRefreshClick();
            }, intervalMs);
        }
    }
    
    clearAutoRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
    }
    
    updateLastRefreshedDate() {
        const now = new Date();
        this.lastRefreshDate = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        }).format(now);
    }
    
    /**
     * Event handlers
     */
    handleTabSelect(event) {
        const selectedTab = event.currentTarget.dataset.tab;
        
        if (this.currentTab !== selectedTab) {
            this.currentTab = selectedTab;
            this.isLoading = true;
            
            // Clear any error
            this.errorMessage = null;
            
            // Load data for the selected tab
            this.loadData();
        }
    }
    
    handleRefreshClick() {
        this.loadData();
    }
    
    handleExportClick() {
        // Determine what data to export based on the current tab
        const exportType = this.currentTab;
        
        // Prepare filters
        let filters = {};
        
        if (this.isLicenseTab) {
            filters = {
                showInactiveUsers: this.showInactiveUsers,
                inactiveUserThreshold: this.inactiveUserThreshold
            };
        } else if (this.isUserActivityTab) {
            filters = {
                timeScale: this.selectedTimeScale,
                inactiveUserThreshold: this.inactiveUserThreshold
            };
        } else if (this.isFeatureTab) {
            filters = {};
        } else if (this.isApiTab) {
            filters = {
                timeframe: this.selectedApiTimeframe,
                showDetailed: this.showDetailedApiUsage
            };
        }
        
        // Call the export method
        exportData({ exportType, filters: JSON.stringify(filters) })
            .then(result => {
                // Convert base64 string to blob
                const byteCharacters = atob(result);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'text/csv' });
                
                // Save the file
                const fileName = this.getExportFileName();
                downloadFile(blob, fileName);
            })
            .catch(error => {
                this.showToast('Error', 'Failed to export data: ' + this.reduceError(error), 'error');
            });
    }
    
    // Handle row actions for license table
    handleRowAction(event) {
        const action = event.detail.action;
        const row = event.detail.row;
        
        if (action.name === 'view_inactive') {
            this.viewInactiveUsers(row);
        } else if (action.name === 'view_sharing') {
            this.viewLicenseSharing(row);
        }
    }
    
    /**
     * View inactive users for a specific license
     * 
     * @param {Object} licenseRow License row data
     */
    viewInactiveUsers(licenseRow) {
        this.isLoading = true;
        this.selectedLicense = { ...licenseRow };
        
        // Calculate inactive savings if not already present
        if (!this.selectedLicense.inactiveSavings) {
            this.selectedLicense.inactiveSavings = (this.selectedLicense.inactiveLicenses * this.selectedLicense.costPerActiveUser).toFixed(2);
        }
        
        getInactiveUsers({ 
            licenseType: licenseRow.licenseName, 
            inactiveThreshold: this.inactiveUserThreshold 
        })
            .then(result => {
                const data = JSON.parse(result);
                this.inactiveUserDetails = data.inactiveUsers || [];
                this.showInactiveUserModal = true;
                this.isLoading = false;
            })
            .catch(error => {
                this.handleError(this.reduceError(error));
                this.isLoading = false;
            });
    }
    
    // View license sharing opportunities
    viewLicenseSharing(licenseRow) {
        this.selectedLicense = licenseRow;
        
        // Find sharing opportunities for this license
        if (this.licenseData.sharingOpportunities) {
            const sharingOpp = this.licenseData.sharingOpportunities.find(
                opp => opp.licenseId === licenseRow.id
            );
            
            if (sharingOpp) {
                this.licenseSharingDetails = sharingOpp.sharingGroups;
                this.showLicenseSharingModal = true;
            } else {
                this.showToast('No Sharing Opportunities', 
                             'No license sharing opportunities identified for this license type.', 'info');
            }
        } else {
            this.showToast('No Sharing Opportunities', 
                         'No license sharing opportunities identified.', 'info');
        }
    }
    
    // Close the inactive user modal
    closeInactiveUserModal() {
        this.showInactiveUserModal = false;
    }
    
    // Close the license sharing modal
    closeLicenseSharingModal() {
        this.showLicenseSharingModal = false;
    }
    
    // Export inactive users to CSV
    exportInactiveUsers() {
        // Prepare filters
        const filters = {
            inactiveUserThreshold: this.inactiveUserThreshold,
            licenseId: this.selectedLicense.id
        };
        
        // Call the export method
        exportData({ exportType: 'inactive_users', filters: JSON.stringify(filters) })
            .then(result => {
                // Convert base64 string to blob
                const byteCharacters = atob(result);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'text/csv' });
                
                // Save the file
                const fileName = `Inactive_Users_${this.selectedLicense.licenseName}.csv`;
                downloadFile(blob, fileName);
            })
            .catch(error => {
                this.showToast('Error', 'Failed to export data: ' + this.reduceError(error), 'error');
            });
    }
    
    // Export license sharing opportunities to CSV
    exportLicenseSharing() {
        // Prepare filters
        const filters = {
            licenseId: this.selectedLicense.id
        };
        
        // Call the export method
        exportData({ exportType: 'license_sharing', filters: JSON.stringify(filters) })
            .then(result => {
                // Convert base64 string to blob
                const byteCharacters = atob(result);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'text/csv' });
                
                // Save the file
                const fileName = `License_Sharing_${this.selectedLicense.licenseName}.csv`;
                downloadFile(blob, fileName);
            })
            .catch(error => {
                this.showToast('Error', 'Failed to export data: ' + this.reduceError(error), 'error');
            });
    }
    
    /**
     * View users in a specific sharing group
     * 
     * @param {Event} event Button click event
     */
    viewSharingGroupUsers(event) {
        const groupId = event.currentTarget.dataset.id;
        
        // Find the group with this ID
        const selectedGroup = this.licenseSharingDetails.find(group => group.id === groupId);
        
        if (selectedGroup && selectedGroup.users) {
            // Create a modal to display the users in this group
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Group Users',
                    message: `Showing ${selectedGroup.users.length} users with pattern: ${selectedGroup.pattern}`,
                    variant: 'info'
                })
            );
            
            // Here you would typically display these users in a modal
            // For now, we'll just log them
            console.log('Users in group:', selectedGroup.users);
        }
    }
    
    /**
     * Loads license sharing data
     * 
     * @param {String} licenseType The license type to analyze
     */
    loadLicenseSharingData(licenseType) {
        this.isLoading = true;
        
        getLicenseSharingOpportunities({ licenseType: licenseType })
            .then(result => {
                const data = JSON.parse(result);
                
                // Process sharing groups to ensure they have IDs
                if (data.sharingGroups && Array.isArray(data.sharingGroups)) {
                    this.licenseSharingDetails = data.sharingGroups.map((group, index) => {
                        // Ensure each group has an ID
                        return {
                            ...group,
                            id: group.id || 'group-' + index,
                            potentialSavings: group.potentialSavings || '0'
                        };
                    });
                } else {
                    this.licenseSharingDetails = [];
                }
                
                this.isLoading = false;
            })
            .catch(error => {
                this.handleError(this.reduceError(error));
                this.isLoading = false;
            });
    }
    
    /**
     * Loads account lockout data for the current time scale
     */
    loadAccountLockouts() {
        // Setting loading state to false will be handled by parent method
        getAccountLockouts({ timeScale: this.selectedTimeScale })
            .then(result => {
                const data = JSON.parse(result);
                this.lockoutDetails = data.lockouts || [];
                
                // Update the lockout count in the summary if available
                if (this.userActivityData && this.userActivityData.summary) {
                    this.userActivityData.summary.lockoutCount = data.count || 0;
                }
            })
            .catch(error => {
                // We don't set isLoading=false here as the parent method handles it
                console.error('Error loading account lockout data: ' + this.reduceError(error));
            });
    }
    
    /**
     * Shows the account lockout details modal
     */
    viewLockoutDetails() {
        if (this.lockoutDetails && this.lockoutDetails.length > 0) {
            this.showLockoutModal = true;
        } else {
            this.showToast('No Lockouts Found', 'No account lockouts were detected in the selected time period.', 'info');
        }
    }
    
    /**
     * Closes the account lockout modal
     */
    closeLockoutModal() {
        this.showLockoutModal = false;
    }
    
    /**
     * Export lockout details to CSV
     */
    exportLockoutDetails() {
        // Prepare filters
        const filters = {
            timeScale: this.selectedTimeScale
        };
        
        // Call the export method
        exportData({ exportType: 'account_lockouts', filters: JSON.stringify(filters) })
            .then(result => {
                // Convert base64 string to blob
                const byteCharacters = atob(result);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'text/csv' });
                
                // Save the file
                const fileName = `Account_Lockouts_${this.formatDate(new Date())}.csv`;
                downloadFile(blob, fileName);
            })
            .catch(error => {
                this.showToast('Error', 'Failed to export lockout data: ' + this.reduceError(error), 'error');
            });
    }
    
    /**
     * Helper to format a date for filenames
     */
    formatDate(date) {
        return date.toISOString().slice(0, 10);
    }
    
    /**
     * Utility methods
     */
    getExportFileName() {
        const date = new Date();
        const dateStr = date.toISOString().slice(0, 10);
        
        switch (this.currentTab) {
            case 'license_usage':
                return `License_Usage_${dateStr}`;
            case 'user_activity':
                return `User_Activity_${dateStr}`;
            case 'feature_adoption':
                return `Feature_Adoption_${dateStr}`;
            case 'api_usage':
                return `API_Usage_${dateStr}`;
            default:
                return `License_Visualizer_Export_${dateStr}`;
        }
    }
    
    toggleDisplayMode() {
        const modes = ['graphical', 'tabular', 'compact'];
        const currentIndex = modes.indexOf(this.displayMode);
        const nextIndex = (currentIndex + 1) % modes.length;
        this.displayMode = modes[nextIndex];
        
        // Re-render charts if we switched to or from graphical mode
        if (this.chartsJsInitialized) {
            this.initializeChartsForCurrentTab();
        }
    }
    
    handleTimeScaleChange(event) {
        this.selectedTimeScale = event.detail.value;
        this.loadUserActivityData();
    }
    
    handleApiTimeframeChange(event) {
        this.selectedApiTimeframe = event.detail.value;
        this.loadApiUsageData();
    }
    
    handleSort(event) {
        this.sortBy = event.detail.fieldName;
        this.sortDirection = event.detail.sortDirection;
        this.sortLicenseData();
    }
    
    handleApiSort(event) {
        this.apiSortBy = event.detail.fieldName;
        this.apiSortDirection = event.detail.sortDirection;
        this.sortApiData();
    }
    
    /**
     * Sorting methods
     */
    sortLicenseData() {
        const data = [...this.licenseData.licenseDetails];
        data.sort((a, b) => {
            return this.sortItems(a, b, this.sortBy, this.sortDirection);
        });
        this.licenseData.licenseDetails = data;
    }
    
    sortApiData() {
        const data = [...this.apiUsageData.apiUsageDetails];
        data.sort((a, b) => {
            return this.sortItems(a, b, this.apiSortBy, this.apiSortDirection);
        });
        this.apiUsageData.apiUsageDetails = data;
    }
    
    sortItems(a, b, field, direction) {
        const valueA = a[field] ? a[field] : '';
        const valueB = b[field] ? b[field] : '';
        
        let result = 0;
        if (valueA < valueB) {
            result = -1;
        } else if (valueA > valueB) {
            result = 1;
        }
        
        return direction === 'asc' ? result : -result;
    }
    
    /**
     * Utility methods
     */
    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(evt);
    }
    
    handleError(errorMessage) {
        this.errorMessage = errorMessage;
        this.isLoading = false;
        console.error(errorMessage);
    }
    
    reduceError(error) {
        // Helper method to extract error messages from various error formats
        if (typeof error === 'string') {
            return error;
        } else if (error.body?.message) {
            return error.body.message;
        } else if (error.message) {
            return error.message;
        } else {
            return JSON.stringify(error);
        }
    }
    
    /**
     * Getters for UI states
     */
    get hasError() {
        return !!this.errorMessage;
    }
    
    get isLicenseTab() {
        return this.currentTab === 'license_usage';
    }
    
    get isUserActivityTab() {
        return this.currentTab === 'user_activity';
    }
    
    get isFeatureTab() {
        return this.currentTab === 'feature_adoption';
    }
    
    get isApiTab() {
        return this.currentTab === 'api_usage';
    }
    
    get isAutoRefreshEnabled() {
        return this.autoRefreshInterval > 0;
    }
    
    get licenseTabClass() {
        return `tab-item ${this.isLicenseTab ? 'active' : ''}`;
    }
    
    get userActivityTabClass() {
        return `tab-item ${this.isUserActivityTab ? 'active' : ''}`;
    }
    
    get featureTabClass() {
        return `tab-item ${this.isFeatureTab ? 'active' : ''}`;
    }
    
    get apiTabClass() {
        return `tab-item ${this.isApiTab ? 'active' : ''}`;
    }
    
    get displayModeIcon() {
        switch(this.displayMode) {
            case 'graphical':
                return 'utility:chart';
            case 'tabular':
                return 'utility:table';
            case 'compact':
                return 'utility:list';
            default:
                return 'utility:chart';
        }
    }
    
    // Summary card getters from license data
    get totalLicenseCount() {
        return this.licenseData?.summary?.totalLicenses || 0;
    }
    
    get assignedLicenseCount() {
        return this.licenseData?.summary?.assignedLicenses || 0;
    }
    
    get assignedLicensePercentage() {
        const total = this.totalLicenseCount;
        const assigned = this.assignedLicenseCount;
        return total > 0 ? Math.round((assigned / total) * 100) : 0;
    }
    
    get inactiveUserCount() {
        return this.licenseData?.summary?.inactiveUsers || 0;
    }
    
    get potentialSavings() {
        return this.licenseData?.summary?.potentialSavings || '$0';
    }
    
    get licenseTableData() {
        return this.licenseData?.licenseDetails || [];
    }
    
    // User activity data getters
    get usersActiveToday() {
        return this.userActivityData?.summary?.activeToday || 0;
    }
    
    get usersActiveTodayPercentage() {
        return this.userActivityData?.summary?.activeTodayPercentage || 0;
    }
    
    get avgSessionDuration() {
        return this.userActivityData?.summary?.avgSessionDuration || '0m';
    }
    
    get mobileUserPercentage() {
        return this.userActivityData?.summary?.mobilePercentage || 0;
    }
    
    get peakUsageTime() {
        return this.userActivityData?.summary?.peakTime || 'N/A';
    }
    
    get uniqueUsersThisWeek() {
        return this.userActivityData?.summary?.activeLastWeek || 0;
    }
    
    get uniqueUsersThisMonth() {
        return this.userActivityData?.summary?.activeLastMonth || 0;
    }
    
    get inactiveUserPercentage() {
        return this.userActivityData?.summary?.inactivePercentage || 0;
    }
    
    get userLockouts() {
        return this.userActivityData?.summary?.lockoutCount || 0;
    }
    
    get userActivityDetails() {
        return this.userActivityData?.userDetails || [];
    }
    
    // Feature adoption data getters
    get permissionSetUsage() {
        return this.featureAdoptionData?.metrics?.permissionSetUsage || 0;
    }
    
    get reportAdoption() {
        return this.featureAdoptionData?.metrics?.reportAdoption || 0;
    }
    
    get dashboardAdoption() {
        return this.featureAdoptionData?.metrics?.dashboardAdoption || 0;
    }
    
    get chatterUsage() {
        return this.featureAdoptionData?.metrics?.chatterUsage || 0;
    }
    
    // API usage data getters
    get totalApiCalls() {
        return this.apiUsageData?.summary?.totalApiCalls || 0;
    }
    
    get apiUsagePercentage() {
        return this.apiUsageData?.summary?.usagePercentage || 0;
    }
    
    get dataStorageUsed() {
        return this.apiUsageData?.summary?.dataStorageUsed || '0 MB';
    }
    
    get dataStoragePercentage() {
        return this.apiUsageData?.summary?.dataStoragePercentage || 0;
    }
    
    get fileStorageUsed() {
        return this.apiUsageData?.summary?.fileStorageUsed || '0 MB';
    }
    
    get fileStoragePercentage() {
        return this.apiUsageData?.summary?.fileStoragePercentage || 0;
    }
    
    get apiTrendValue() {
        return this.apiUsageData?.summary?.trendValue || '0%';
    }
    
    get apiUsageTableData() {
        return this.apiUsageData?.apiUsageDetails || [];
    }

    // Add a safe method to get canvas context
    getCanvasContext(selector) {
        try {
            // Find the container element
            const container = this.template.querySelector(selector);
            if (!container) {
                console.error(`Chart container not found: ${selector}`);
                return null;
            }
            
            // Log container dimensions to help debug
            const rect = container.getBoundingClientRect();
            console.log(`Container ${selector} dimensions:`, {
                width: rect.width,
                height: rect.height,
                offsetWidth: container.offsetWidth,
                offsetHeight: container.offsetHeight
            });
            
            // If container has zero dimensions, add minimum dimensions
            if (rect.width === 0 || rect.height === 0) {
                container.style.minWidth = '300px';
                container.style.minHeight = '200px';
                console.warn(`Container ${selector} has zero dimensions, setting minimum size`);
            }
            
            // Clear the container first
            container.innerHTML = '';
            
            // Create a fresh canvas with an ID to make debugging easier
            const canvas = document.createElement('canvas');
            const canvasId = `chart-${selector.replace(/[^a-zA-Z0-9]/g, '-')}`;
            canvas.id = canvasId;
            
            // Add the canvas to the container
            container.appendChild(canvas);
            
            // Get the context
            const context = canvas.getContext('2d');
            if (!context) {
                console.error(`Failed to get 2d context for canvas in ${selector}`);
                return null;
            }
            
            // Set canvas dimensions to match container or use defaults
            const containerWidth = Math.max(container.offsetWidth || rect.width, 300);
            const containerHeight = Math.max(container.offsetHeight || rect.height, 200);
            
            // Set canvas element dimensions (actual pixels)
            canvas.width = containerWidth * window.devicePixelRatio;
            canvas.height = containerHeight * window.devicePixelRatio;
            
            // Set canvas display dimensions (CSS pixels)
            canvas.style.width = `${containerWidth}px`;
            canvas.style.height = `${containerHeight}px`;
            
            // Scale the context to match device pixel ratio
            context.scale(window.devicePixelRatio, window.devicePixelRatio);
            
            console.log(`Canvas created successfully for ${selector} with dimensions ${containerWidth}x${containerHeight}`);
            
            return context;
        } catch (error) {
            console.error(`Error creating canvas context for ${selector}:`, error);
            return null;
        }
    }

    // Add the handleToggleDetailedApiUsage method
    handleToggleDetailedApiUsage(event) {
        this.showDetailedApiUsage = event.target.checked;
        this.loadApiUsageData();
    }
} 