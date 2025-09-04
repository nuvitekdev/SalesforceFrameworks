# Nuvi Permit System - Experience Cloud Configuration Guide

## Table of Contents

1. [Experience Cloud Site Setup](#experience-cloud-site-setup)
2. [Public APD Search Portal](#public-apd-search-portal)
3. [Operator Self-Service Portal](#operator-self-service-portal)
4. [Stakeholder Engagement Portal](#stakeholder-engagement-portal)
5. [Mobile-First Configuration](#mobile-first-configuration)
6. [Security & Access Control](#security--access-control)
7. [SEO & Public Access Optimization](#seo--public-access-optimization)
8. [Performance & Analytics](#performance--analytics)

## Experience Cloud Site Setup

### Site 1: Nuvi Public APD Portal

#### Initial Site Configuration
```
Site Name: Nuvi Public Permit Portal
Template: LWR (Lightning Web Runtime) - LWC-only pages
URL: https://Nuvi-permits.force.com (or custom domain)
Purpose: Public access to permit information and transparency
Access: Public (no login required for basic search)
Theme: Government/Professional
Primary Colors: #22BDC1 (Nuvi Blue), #D5DF23 (Nuvi Green)
```

#### Step-by-Step Site Creation

##### Step 1: Create Experience Cloud Site
1. **Setup** → **Digital Experiences** → **All Sites**
2. **New** → **Create**
3. **Template Selection**: "Customer Service"
4. **Site Details**:
   - Name: "Nuvi Public Permit Portal"
   - URL Path: "Nuvi-permits"
   - Description: "Public access to Department of Interior drilling permits"

##### Step 2: Basic Site Configuration
1. **Administration** → **Settings** → **General**
   ```
   Site Settings:
   - Site Name: Nuvi Public Permit Portal
   - Site Description: Search and track oil & gas drilling permits
   - Default Language: English (US)
   - Time Zone: Mountain Time (US & Canada)
   - Currency: USD
   ```

##### Step 3: Add LWC Pages and Components (LWR)
1. Create App Page "Permit Application" and add:
   - `nuviPermitApplicationWizard` (main region)
   - `nuviPermitDocumentManager` (secondary region, optional)
   - `nuviPermitSignatureManager` (secondary region, optional)
2. Create App Page "Permit Status" and add:
   - `permitMap` (top region)
   - `nuviPermitDocumentManager` (main)
3. Publish the site after adding navigation entries.

##### Step 4: CSP Trusted Sites (LWR)
Add CSP Trusted Sites for:
- LLM providers in use (OpenAI/Anthropic/Google/OpenRouter as applicable)
- ArcGIS REST API (if using maps): `https://*.arcgis.com`, `https://*.arcgisonline.com`
- Pay.gov endpoint via Named Credential domain

##### Step 5: Named Credentials
Create Named Credential `PayGov` (HTTP Callout) pointing to pay.gov REST endpoint; enable per-profile access.

##### Step 6: Authentication & SSO
- Configure SSO (SAML/OIDC) for registered users (operator/reviewer)
- Keep guest access limited to read-only public pages; do not allow guest data submission

##### Step 7: Platform Events & Dashboards
- Verify `Nuvi_Permit_Status_Change__e` is deployed and active.
- Add an Apex subscriber trigger (included) that writes to `Nuvi_Permit_Status_Log__c`.
- Build a dashboard page sourcing from `Nuvi_Permit_Status_Log__c` to show stage transitions and SLA metrics.

2. **Administration** → **Login & Registration**
   ```
   Public Access Settings:
   - Allow Public Access: Enabled
   - Public User Profile: Nuvi Public Portal User
   - Guest User Sharing: Restricted (security-focused)
   - Registration: Optional (for enhanced features)
   ```

##### Step 3: Theme Customization
1. **Builder** → **Settings** → **Theme**
2. **Custom Theme Configuration**:
   ```css
   /* Nuvi Brand Colors */
   :root {
     --primary-color: #22BDC1;        /* Nuvi Teal */
     --secondary-color: #D5DF23;      /* Nuvi Lime */
     --accent-color: #1f4e79;         /* Government Blue */
     --success-color: #4CAF50;        /* Green */
     --warning-color: #FF9800;        /* Orange */
     --error-color: #F44336;          /* Red */
     --background-primary: #FFFFFF;    /* White */
     --background-secondary: #F8F9FA;  /* Light Gray */
     --text-primary: #2C3E50;         /* Dark Blue Gray */
     --text-secondary: #7F8C8D;       /* Medium Gray */
   }
   
   /* Government Accessibility Compliance */
   .slds-button {
     min-height: 44px; /* WCAG touch target size */
   }
   
   .slds-input {
     min-height: 44px;
     border: 2px solid #BDC3C7; /* High contrast borders */
   }
   
   /* Focus indicators for keyboard navigation */
   *:focus {
     outline: 3px solid #22BDC1;
     outline-offset: 2px;
   }
   ```

#### Site Structure & Navigation

##### Primary Navigation Menu
```
Navigation Structure:
├── Home (Landing Page)
├── Search Permits
│   ├── Basic Search
│   ├── Advanced Search  
│   ├── Map View
│   └── Recent Applications
├── Public Information
│   ├── Process Overview
│   ├── Environmental Documents
│   ├── Public Comments
│   └── Appeals Process
├── Resources
│   ├── Forms & Documents
│   ├── Contact Information
│   ├── FAQ
│   └── Legal Resources
└── For Operators (Login Required)
    ├── Submit Application
    ├── My Applications
    ├── Document Center
    └── Account Settings
```

##### Footer Configuration
```
Footer Links:
├── About Nuvi
├── Privacy Policy
├── Terms of Use
├── Accessibility Statement (Section 508)
├── FOIA Requests
├── Contact Us
├── Site Map
└── Government Links
    ├── USA.gov
    ├── Regulations.gov
    └── Data.gov
```

### Site 2: Operator Self-Service Portal

#### Portal Configuration
```
Site Name: Nuvi Operator Services Portal
Template: Partner Central
URL: https://operators.Nuvi-permits.force.com
Access: Login Required (Authenticated Users Only)
User Types: External Users (Operators, Consultants, Legal Representatives)
Security: Enhanced (PIV card integration where applicable)
```

#### Nuvitek Theme Integration

**IMPORTANT**: This portal now uses the **Nuvitek Custom Theme Layout** component for a flashy, dense, and visually engaging experience with minimal white space.

##### Theme Configuration
Add the Nuvitek Custom Theme Layout to your Experience Cloud pages:

```html
<!-- Add to Experience Builder Page Template -->
<c-nuvitek-custom-theme-layout
    theme-variant="portal-flashy"
    enable-animations="true"
    show-particle-background="true"
    enable-glassmorphism="true"
    density-level="high"
    white-space-mode="minimal">
    
    <!-- Your existing portal content goes here -->
    <div slot="main-content">
        <!-- Portal dashboard and components -->
    </div>
    
    <!-- Optional floating elements -->
    <div slot="floating-elements">
        <div class="floating-stats">
            <div class="stat-card">
                <span class="stat-number">124</span>
                <span class="stat-label">Active Permits</span>
            </div>
        </div>
    </div>
</c-nuvitek-custom-theme-layout>
```

##### Flashy Portal Design Strategy

**Objective**: Create a busy, information-dense portal with flashy visuals and minimal white space.

###### Key Design Principles:
1. **Maximum Information Density** - Pack multiple data points into compact layouts
2. **Dynamic Visual Elements** - Use animations, gradients, and glassmorphism effects
3. **Layered UI** - Multiple floating and overlapping elements
4. **Real-time Updates** - Live data feeds and status indicators
5. **Minimal White Space** - Use every pixel for valuable content or visual appeal

###### CSS Variables for Flashy Design:
```css
/* Add to Experience Cloud CSS */
:root {
    --nuvitek-gradient-hero: linear-gradient(135deg, var(--nuvitek-primary) 0%, var(--nuvitek-primary-dark) 50%, var(--nuvitek-accent) 100%);
    --nuvitek-gradient-card: linear-gradient(145deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
    --nuvitek-shadow-glow: 0 0 40px rgba(var(--nuvitek-primary-rgb), 0.3);
    --nuvitek-shadow-elevated: 0 20px 40px rgba(0,0,0,0.1), 0 0 20px rgba(var(--nuvitek-primary-rgb), 0.2);
    --nuvitek-backdrop-blur: blur(20px);
    --nuvitek-animation-float: float 6s ease-in-out infinite;
    --nuvitek-animation-pulse: pulse 2s ease-in-out infinite;
    --nuvitek-animation-shimmer: shimmer 3s ease-in-out infinite;
}

@keyframes float {
    0%, 100% { transform: translateY(0px); }
    50% { transform: translateY(-10px); }
}

@keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

@keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
}
```

###### Enhanced Hero Section with Animations:
```html
<div class="flashy-hero-section">
    <!-- Animated Background Particles -->
    <div class="particle-background">
        <div class="particle particle-1"></div>
        <div class="particle particle-2"></div>
        <div class="particle particle-3"></div>
    </div>
    
    <!-- Main Hero Content -->
    <div class="hero-content">
        <div class="hero-title-section">
            <h1 class="animated-title">Nuvi Permit Portal</h1>
            <div class="subtitle-with-stats">
                <p class="hero-subtitle">Real-time permit management and compliance tracking</p>
                <div class="inline-stats">
                    <div class="stat-badge animate-pulse">
                        <span class="stat-number">1,247</span>
                        <span class="stat-label">Active Permits</span>
                    </div>
                    <div class="stat-badge animate-pulse">
                        <span class="stat-number">98.2%</span>
                        <span class="stat-label">Compliance Rate</span>
                    </div>
                    <div class="stat-badge animate-pulse">
                        <span class="stat-number">24</span>
                        <span class="stat-label">Pending Reviews</span>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Quick Action Cards -->
        <div class="quick-actions-grid">
            <div class="action-card glassmorphism">
                <div class="action-icon">📄</div>
                <h3>Submit Application</h3>
                <p>New permit application</p>
                <div class="action-stats">Last: 2 min ago</div>
            </div>
            <div class="action-card glassmorphism">
                <div class="action-icon">📊</div>
                <h3>View Dashboard</h3>
                <p>Real-time analytics</p>
                <div class="action-stats">Updated: Live</div>
            </div>
            <div class="action-card glassmorphism">
                <div class="action-icon">📋</div>
                <h3>Track Status</h3>
                <p>Application progress</p>
                <div class="action-stats">3 updates today</div>
            </div>
            <div class="action-card glassmorphism">
                <div class="action-icon">💬</div>
                <h3>Messages</h3>
                <p>Communication center</p>
                <div class="action-stats notification-badge">5 new</div>
            </div>
        </div>
    </div>
</div>
```

###### Dense Dashboard Layout:
```html
<div class="dense-dashboard-container">
    <!-- Main Dashboard Grid -->
    <div class="dashboard-grid">
        <!-- Left Column - Primary Stats -->
        <div class="stats-column">
            <div class="stat-card-large glassmorphism">
                <div class="stat-header">
                    <h3>Permit Overview</h3>
                    <div class="live-indicator">● LIVE</div>
                </div>
                <div class="stat-body">
                    <div class="primary-stat">
                        <span class="stat-number gradient-text">1,247</span>
                        <span class="stat-label">Total Active</span>
                    </div>
                    <div class="sub-stats-grid">
                        <div class="sub-stat">
                            <span class="number">89</span>
                            <span class="label">Pending</span>
                        </div>
                        <div class="sub-stat">
                            <span class="number">156</span>
                            <span class="label">In Review</span>
                        </div>
                        <div class="sub-stat">
                            <span class="number">1,002</span>
                            <span class="label">Approved</span>
                        </div>
                    </div>
                </div>
            </div>
            
            <!-- Compact Status Cards -->
            <div class="status-cards-grid">
                <div class="status-card urgent">
                    <div class="status-icon">⚠️</div>
                    <div class="status-info">
                        <span class="status-count">12</span>
                        <span class="status-label">Urgent</span>
                    </div>
                    <div class="status-trend up">+3</div>
                </div>
                <div class="status-card warning">
                    <div class="status-icon">⏰</div>
                    <div class="status-info">
                        <span class="status-count">34</span>
                        <span class="status-label">Due Soon</span>
                    </div>
                    <div class="status-trend down">-7</div>
                </div>
                <div class="status-card success">
                    <div class="status-icon">✅</div>
                    <div class="status-info">
                        <span class="status-count">156</span>
                        <span class="status-label">Completed</span>
                    </div>
                    <div class="status-trend up">+23</div>
                </div>
            </div>
        </div>
        
        <!-- Center Column - Activity Feed -->
        <div class="activity-column">
            <div class="activity-feed-card glassmorphism">
                <div class="activity-header">
                    <h3>Live Activity</h3>
                    <div class="activity-controls">
                        <button class="filter-btn active">All</button>
                        <button class="filter-btn">Mine</button>
                        <button class="filter-btn">Team</button>
                    </div>
                </div>
                <div class="activity-list">
                    <div class="activity-item">
                        <div class="activity-icon new">📄</div>
                        <div class="activity-content">
                            <div class="activity-title">New permit submitted</div>
                            <div class="activity-meta">APD-2024-001247 • 2 min ago</div>
                        </div>
                        <div class="activity-status pending">Pending</div>
                    </div>
                    <div class="activity-item">
                        <div class="activity-icon approved">✅</div>
                        <div class="activity-content">
                            <div class="activity-title">Environmental review completed</div>
                            <div class="activity-meta">APD-2024-001245 • 15 min ago</div>
                        </div>
                        <div class="activity-status approved">Approved</div>
                    </div>
                    <!-- More activity items with minimal spacing -->
                </div>
            </div>
            
            <!-- Compact Calendar Widget -->
            <div class="mini-calendar-widget glassmorphism">
                <div class="calendar-header">
                    <h4>Upcoming Deadlines</h4>
                </div>
                <div class="calendar-items">
                    <div class="calendar-item urgent">
                        <div class="date">Dec 5</div>
                        <div class="event">NEPA Review Due</div>
                    </div>
                    <div class="calendar-item warning">
                        <div class="date">Dec 8</div>
                        <div class="event">Public Comment Period</div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Right Column - Quick Tools -->
        <div class="tools-column">
            <div class="tools-panel glassmorphism">
                <h3>Quick Tools</h3>
                <div class="tools-grid">
                    <button class="tool-btn">
                        <div class="tool-icon">📊</div>
                        <span>Analytics</span>
                    </button>
                    <button class="tool-btn">
                        <div class="tool-icon">📋</div>
                        <span>Reports</span>
                    </button>
                    <button class="tool-btn">
                        <div class="tool-icon">🗺️</div>
                        <span>GIS View</span>
                    </button>
                    <button class="tool-btn">
                        <div class="tool-icon">💬</div>
                        <span class="notification-dot">Chat</span>
                    </button>
                </div>
            </div>
            
            <!-- Live Map Preview -->
            <div class="map-preview glassmorphism">
                <div class="map-header">
                    <h4>Active Sites</h4>
                    <div class="map-stats">247 sites</div>
                </div>
                <div class="map-container">
                    <!-- Embedded map or map component -->
                    <div class="map-placeholder">
                        <div class="map-markers">
                            <div class="marker active"></div>
                            <div class="marker pending"></div>
                            <div class="marker approved"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Bottom Row - Data Tables with Minimal White Space -->
    <div class="data-tables-section">
        <div class="table-tabs">
            <button class="tab-btn active">Recent Applications</button>
            <button class="tab-btn">Pending Reviews</button>
            <button class="tab-btn">Compliance Issues</button>
        </div>
        <div class="dense-table glassmorphism">
            <!-- Compact data table with hover effects -->
            <table class="compact-table">
                <thead>
                    <tr>
                        <th>Permit ID</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Days</th>
                        <th>Priority</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="table-row">
                        <td><strong>APD-001247</strong></td>
                        <td>Drilling</td>
                        <td><span class="status-badge pending">Pending</span></td>
                        <td>12</td>
                        <td><span class="priority high">High</span></td>
                        <td><button class="action-btn">View</button></td>
                    </tr>
                    <!-- More compact rows -->
                </tbody>
            </table>
        </div>
    </div>
</div>
```

#### Authentication Setup
1. **Administration** → **Login & Registration**
   ```
   Authentication Options:
   - Username/Password (standard)
   - Single Sign-On (SSO) via SAML
   - PIV Card Authentication (for federal contractors)
   - Multi-Factor Authentication (required)
   
   Registration Process:
   - Self-Registration: Disabled (controlled access)
   - Admin Approval Required: Yes
   - Email Verification: Required
   - Identity Verification: Manual review process
   ```

2. **User Profile Configuration**:
   ```
   Profile: Nuvi Operator Portal User
   Object Permissions:
   - APD Applications: Read/Create (own records only)
   - APD Documents: Read/Create (own records only)
   - APD Payments: Read (own records only)
   - Operators: Read (own record only)
   - Public Comments: Create/Read
   
   Field Permissions:
   - Full access to operator-relevant fields
   - Read-only access to government review fields
   - No access to internal review comments
   ```

## Public APD Search Portal

### Page 1: Public Search Landing Page

#### Page Configuration
```
Page Name: APD Public Search
URL: /public-search
Layout Type: Full Width
Template: App Page
Access: Public (no authentication required)
```

#### Component Layout Design
```html
<!-- Top Section: Search Interface -->
<div class="search-hero-section">
    <div class="slds-container_large slds-p-around_large">
        
        <!-- Page Header -->
        <div class="slds-text-align_center slds-m-bottom_large">
            <h1 class="slds-text-heading_large">Nuvi Oil & Gas Permit Search</h1>
            <p class="slds-text-body_regular">
                Search and track Department of Interior drilling permits. 
                Access environmental documents and public records.
            </p>
        </div>
        
        <!-- Quick Search Component -->
        <c-Nuvi-public-search-hero
            placeholder="Search by operator, location, or permit number..."
            show-filters="true"
            default-radius="50"
            primary-color="#22BDC1"
            accent-color="#D5DF23">
        </c-Nuvi-public-search-hero>
        
    </div>
</div>

<!-- Main Content: Search Results & Map -->
<div class="slds-container_fluid">
    <div class="slds-grid slds-gutters slds-wrap">
        
        <!-- Left Column: Search Results -->
        <div class="slds-col slds-size_8-of-12 slds-large-size_8-of-12">
            
            <!-- Search Filters Bar -->
            <c-Nuvi-search-filters
                show-date-range="true"
                show-status-filter="true"
                show-location-filter="true"
                show-operator-filter="true"
                show-environmental-filter="true">
            </c-Nuvi-search-filters>
            
            <!-- Search Results List -->
            <c-Nuvi-public-search-results
                results-per-page="25"
                show-snippets="true"
                show-document-count="true"
                enable-sorting="true"
                sort-options="relevance,date,location,status">
            </c-Nuvi-public-search-results>
            
        </div>
        
        <!-- Right Column: Interactive Map -->
        <div class="slds-col slds-size_4-of-12 slds-large-size_4-of-12">
            
            <c-Nuvi-public-permit-map
                zoom-level="6"
                center-state="US"
                marker-clustering="true"
                show-legend="true"
                show-filters="true"
                satellite-view="false"
                height="600px">
            </c-Nuvi-public-permit-map>
            
        </div>
        
    </div>
</div>

<!-- Bottom Section: Featured Information -->
<div class="slds-container_large slds-p-around_large">
    
    <!-- Statistics Dashboard -->
    <c-Nuvi-public-statistics
        show-totals="true"
        show-trends="true" 
        time-period="last-12-months"
        chart-type="summary">
    </c-Nuvi-public-statistics>
    
    <!-- Recent Activity Feed -->
    <c-Nuvi-recent-public-activity
        activity-limit="10"
        show-environmental-docs="true"
        show-decisions="true"
        show-public-comments="true">
    </c-Nuvi-recent-public-activity>
    
</div>
```

#### LWC Component: Nuvi Public Search Hero

```javascript
// doiPublicSearchHero.js
import { LightningElement, track, api } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import searchPublicAPDs from '@salesforce/apex/DOI_PAL_PublicSearchController.searchPublicAPDs';

export default class DoiPublicSearchHero extends NavigationMixin(LightningElement) {
    @api placeholder = 'Search permits...';
    @api showFilters = false;
    @api defaultRadius = 50;
    @api primaryColor = '#22BDC1';
    @api accentColor = '#D5DF23';
    
    @track searchTerm = '';
    @track locationSearch = '';
    @track selectedFilters = {};
    @track isLoading = false;
    @track showAdvancedFilters = false;
    
    // Quick search options
    get quickSearchOptions() {
        return [
            { label: 'Recent Applications (30 days)', value: 'recent' },
            { label: 'Currently Under Review', value: 'under_review' },
            { label: 'Public Comment Period', value: 'public_comment' },
            { label: 'Recently Approved', value: 'approved' },
            { label: 'Environmental Assessments', value: 'environmental' }
        ];
    }
    
    // Location-based quick searches
    get locationOptions() {
        return [
            { label: 'New Mexico', value: 'NM' },
            { label: 'Colorado', value: 'CO' },
            { label: 'Wyoming', value: 'WY' },
            { label: 'Montana', value: 'MT' },
            { label: 'North Dakota', value: 'ND' }
        ];
    }
    
    connectedCallback() {
        this.applyCustomStyling();
    }
    
    applyCustomStyling() {
        const style = document.createElement('style');
        style.innerText = `
            .Nuvi-search-hero {
                --primary-color: ${this.primaryColor};
                --accent-color: ${this.accentColor};
            }
        `;
        document.head.appendChild(style);
    }
    
    handleSearchInput(event) {
        this.searchTerm = event.target.value;
        
        // Debounced search suggestions
        clearTimeout(this.searchTimeout);
        this.searchTimeout = setTimeout(() => {
            if (this.searchTerm.length > 2) {
                this.loadSearchSuggestions();
            }
        }, 300);
    }
    
    handleQuickSearch(event) {
        const searchType = event.target.dataset.searchType;
        this.performQuickSearch(searchType);
    }
    
    async performQuickSearch(searchType) {
        this.isLoading = true;
        
        try {
            const searchParams = this.buildQuickSearchParams(searchType);
            const results = await searchPublicAPDs(searchParams);
            
            // Navigate to results page with parameters
            this[NavigationMixin.Navigate]({
                type: 'standard__webPage',
                attributes: {
                    url: '/search-results?' + this.buildUrlParams(searchParams)
                }
            });
            
        } catch (error) {
            this.showErrorMessage('Search failed. Please try again.');
        } finally {
            this.isLoading = false;
        }
    }
    
    buildQuickSearchParams(searchType) {
        const baseParams = {
            publicAccess: true,
            includeDocuments: true
        };
        
        switch (searchType) {
            case 'recent':
                return {
                    ...baseParams,
                    dateRange: 'LAST_N_DAYS:30',
                    sortBy: 'submission_date_desc'
                };
            case 'under_review':
                return {
                    ...baseParams,
                    status: 'Under_Review,Specialist_Review,NEPA_Analysis',
                    sortBy: 'days_in_review_desc'
                };
            case 'public_comment':
                return {
                    ...baseParams,
                    status: 'Public_Comment',
                    hasPublicDocuments: true,
                    sortBy: 'comment_deadline_asc'
                };
            case 'approved':
                return {
                    ...baseParams,
                    status: 'Approved',
                    dateRange: 'LAST_N_DAYS:90',
                    sortBy: 'approval_date_desc'
                };
            case 'environmental':
                return {
                    ...baseParams,
                    hasEnvironmentalDocuments: true,
                    documentTypes: 'EA,EIS,FONSI',
                    sortBy: 'environmental_significance_desc'
                };
            default:
                return baseParams;
        }
    }
    
    handleAdvancedSearch() {
        this.showAdvancedFilters = !this.showAdvancedFilters;
    }
    
    handleLocationSearch(event) {
        const location = event.detail.value;
        this.locationSearch = location;
        
        if (location) {
            this.performLocationSearch(location);
        }
    }
    
    async performLocationSearch(location) {
        // Implement geospatial search
        this.isLoading = true;
        
        try {
            const searchParams = {
                location: location,
                radius: this.defaultRadius,
                publicAccess: true
            };
            
            const results = await searchPublicAPDs(searchParams);
            this.handleSearchResults(results);
            
        } catch (error) {
            this.showErrorMessage('Location search failed. Please try again.');
        } finally {
            this.isLoading = false;
        }
    }
    
    // Utility methods
    showErrorMessage(message) {
        // Show toast notification
        this.dispatchEvent(new ShowToastEvent({
            title: 'Search Error',
            message: message,
            variant: 'error'
        }));
    }
    
    buildUrlParams(params) {
        return Object.keys(params)
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
            .join('&');
    }
}
```

#### Component HTML Template
```html
<!-- doiPublicSearchHero.html -->
<template>
    <div class="Nuvi-search-hero slds-card slds-p-around_large">
        
        <!-- Main Search Input -->
        <div class="slds-form-element slds-m-bottom_medium">
            <div class="slds-form-element__control slds-input-has-icon slds-input-has-icon_right">
                <lightning-icon 
                    icon-name="utility:search" 
                    size="small" 
                    class="slds-input__icon slds-input__icon_right">
                </lightning-icon>
                <lightning-input
                    type="search"
                    placeholder={placeholder}
                    value={searchTerm}
                    onchange={handleSearchInput}
                    class="search-input-large">
                </lightning-input>
            </div>
        </div>
        
        <!-- Quick Search Options -->
        <div class="slds-m-bottom_medium">
            <p class="slds-text-body_small slds-m-bottom_small">Popular searches:</p>
            <div class="slds-button-group-row">
                <template for:each={quickSearchOptions} for:item="option">
                    <lightning-button
                        key={option.value}
                        label={option.label}
                        variant="neutral"
                        size="small"
                        data-search-type={option.value}
                        onclick={handleQuickSearch}
                        class="slds-m-right_x-small slds-m-bottom_x-small">
                    </lightning-button>
                </template>
            </div>
        </div>
        
        <!-- Location Search -->
        <div class="slds-grid slds-gutters">
            <div class="slds-col slds-size_6-of-12">
                <lightning-combobox
                    label="Search by State"
                    placeholder="Select a state..."
                    options={locationOptions}
                    onchange={handleLocationSearch}>
                </lightning-combobox>
            </div>
            <div class="slds-col slds-size_6-of-12">
                <lightning-button
                    label="Advanced Search"
                    variant="brand-outline"
                    onclick={handleAdvancedSearch}
                    class="slds-float_right">
                </lightning-button>
            </div>
        </div>
        
        <!-- Advanced Filters (Collapsible) -->
        <template if:true={showAdvancedFilters}>
            <div class="slds-section slds-is-open slds-m-top_medium">
                <div class="slds-section__content">
                    <c-Nuvi-advanced-search-filters
                        selected-filters={selectedFilters}
                        onfilterchange={handleFilterChange}>
                    </c-Nuvi-advanced-search-filters>
                </div>
            </div>
        </template>
        
        <!-- Loading Indicator -->
        <template if:true={isLoading}>
            <div class="slds-is-relative slds-m-top_medium">
                <lightning-spinner 
                    alternative-text="Searching..."
                    size="small">
                </lightning-spinner>
            </div>
        </template>
        
    </div>
</template>
```

### Page 2: APD Detail Public View

#### Page Configuration for Individual APD Details
```
Page Name: Public APD Details
URL: /permit/{permitId}
Layout: Standard Record Page (Custom)
Access: Public with restrictions
```

#### Public APD Detail Component
```javascript
// doiPublicApdDetail.js
export default class DoiPublicApdDetail extends LightningElement {
    @api recordId;
    @track apdData = {};
    @track publicDocuments = [];
    @track environmentalData = {};
    @track timelineData = [];
    @track isLoading = true;
    
    connectedCallback() {
        this.loadPublicAPDData();
    }
    
    async loadPublicAPDData() {
        try {
            this.apdData = await getPublicAPDDetails({ apdId: this.recordId });
            this.publicDocuments = await getPublicDocuments({ apdId: this.recordId });
            this.environmentalData = await getEnvironmentalSummary({ apdId: this.recordId });
            this.timelineData = await getPublicTimeline({ apdId: this.recordId });
        } catch (error) {
            this.handleError(error);
        } finally {
            this.isLoading = false;
        }
    }
    
    // Public-safe data only - no sensitive information
    get safeAPDData() {
        return {
            publicId: this.apdData.publicId, // Not Salesforce ID
            operatorName: this.apdData.operatorName, // Company only
            generalLocation: this.apdData.state + ', ' + this.apdData.county,
            submissionDate: this.apdData.submissionDate,
            currentStatus: this.apdData.publicStatus, // Simplified status
            environmentalReview: this.apdData.nepaLevel,
            publicCommentPeriod: this.apdData.publicCommentPeriod
        };
    }
}
```

#### Public APD Detail Page Layout
```html
<template>
    <div class="public-apd-detail">
        
        <!-- Header Section -->
        <div class="slds-page-header">
            <div class="slds-grid">
                <div class="slds-col slds-has-flexi-truncate">
                    <div class="slds-media">
                        <div class="slds-media__body">
                            <h1 class="slds-page-header__title">
                                Permit Application {safeAPDData.publicId}
                            </h1>
                            <p class="slds-text-body_small">
                                {safeAPDData.operatorName} • {safeAPDData.generalLocation}
                            </p>
                        </div>
                    </div>
                </div>
                <div class="slds-col slds-no-flex slds-grid slds-grid_align-end">
                    <lightning-badge 
                        label={safeAPDData.currentStatus}
                        variant={statusVariant}>
                    </lightning-badge>
                </div>
            </div>
        </div>
        
        <!-- Main Content Grid -->
        <div class="slds-grid slds-gutters slds-wrap">
            
            <!-- Left Column: Application Info -->
            <div class="slds-col slds-size_8-of-12">
                
                <!-- Basic Information Card -->
                <lightning-card title="Application Information" icon-name="custom:custom63">
                    <div class="slds-p-horizontal_small">
                        <dl class="slds-list_horizontal">
                            <dt class="slds-item_label">Permit ID:</dt>
                            <dd class="slds-item_detail">{safeAPDData.publicId}</dd>
                            <dt class="slds-item_label">Operator:</dt>
                            <dd class="slds-item_detail">{safeAPDData.operatorName}</dd>
                            <dt class="slds-item_label">Location:</dt>
                            <dd class="slds-item_detail">{safeAPDData.generalLocation}</dd>
                            <dt class="slds-item_label">Submitted:</dt>
                            <dd class="slds-item_detail">
                                <lightning-formatted-date-time 
                                    value={safeAPDData.submissionDate}>
                                </lightning-formatted-date-time>
                            </dd>
                            <dt class="slds-item_label">Environmental Review:</dt>
                            <dd class="slds-item_detail">{safeAPDData.environmentalReview}</dd>
                        </dl>
                    </div>
                </lightning-card>
                
                <!-- Environmental Summary -->
                <template if:true={environmentalData}>
                    <lightning-card title="Environmental Review Summary" icon-name="custom:custom85" class="slds-m-top_medium">
                        <div class="slds-p-horizontal_small">
                            <c-Nuvi-environmental-summary-public
                                environmental-data={environmentalData}
                                show-mitigation="true"
                                show-consultations="true">
                            </c-Nuvi-environmental-summary-public>
                        </div>
                    </lightning-card>
                </template>
                
                <!-- Public Documents -->
                <lightning-card title="Public Documents" icon-name="standard:document" class="slds-m-top_medium">
                    <div class="slds-p-horizontal_small">
                        <c-Nuvi-public-document-list
                            documents={publicDocuments}
                            show-preview="true"
                            allow-download="true"
                            document-types="EA,FONSI,Decision_Record">
                        </c-Nuvi-public-document-list>
                    </div>
                </lightning-card>
                
                <!-- Public Comments Section -->
                <template if:true={showPublicComments}>
                    <lightning-card title="Public Comment Period" icon-name="standard:feedback" class="slds-m-top_medium">
                        <div class="slds-p-horizontal_small">
                            <c-Nuvi-public-comment-section
                                apd-id={recordId}
                                allow-new-comments={acceptingComments}
                                show-comment-count="true"
                                moderated="true">
                            </c-Nuvi-public-comment-section>
                        </div>
                    </lightning-card>
                </template>
                
            </div>
            
            <!-- Right Column: Timeline & Map -->
            <div class="slds-col slds-size_4-of-12">
                
                <!-- Processing Timeline -->
                <lightning-card title="Processing Timeline" icon-name="utility:timeline">
                    <div class="slds-p-horizontal_small">
                        <c-Nuvi-public-timeline
                            timeline-data={timelineData}
                            show-estimates="true"
                            compact-view="true">
                        </c-Nuvi-public-timeline>
                    </div>
                </lightning-card>
                
                <!-- Location Map (General Area Only) -->
                <lightning-card title="General Location" icon-name="utility:location" class="slds-m-top_medium">
                    <div class="slds-p-horizontal_small">
                        <c-Nuvi-general-location-map
                            state={apdData.state}
                            county={apdData.county}
                            zoom-level="8"
                            show-exact-location="false"
                            height="300px">
                        </c-Nuvi-general-location-map>
                    </div>
                </lightning-card>
                
                <!-- Contact Information -->
                <lightning-card title="Contact Information" icon-name="utility:contact_request" class="slds-m-top_medium">
                    <div class="slds-p-horizontal_small">
                        <dl class="slds-list_stacked">
                            <dt class="slds-item_label">Field Office:</dt>
                            <dd class="slds-item_detail">{apdData.fieldOfficeName}</dd>
                            <dt class="slds-item_label">Phone:</dt>
                            <dd class="slds-item_detail">{apdData.fieldOfficePhone}</dd>
                            <dt class="slds-item_label">Email:</dt>
                            <dd class="slds-item_detail">
                                <lightning-formatted-email 
                                    value={apdData.fieldOfficeEmail}>
                                </lightning-formatted-email>
                            </dd>
                        </dl>
                    </div>
                </lightning-card>
                
            </div>
            
        </div>
        
    </div>
</template>
```

## Operator Self-Service Portal

### Operator Dashboard Configuration

#### Dashboard Page Layout
```
Page Name: Operator Dashboard
URL: /dashboard
Layout: App Page (Custom)
Access: Authenticated Operators Only
Personalization: Dynamic content based on operator
```

#### Operator Dashboard Components
```html
<!-- Operator Dashboard Layout -->
<div class="operator-portal-dashboard">
    
    <!-- Welcome Section -->
    <div class="slds-welcome-mat slds-welcome-mat_splash">
        <div class="slds-welcome-mat__content">
            <div class="slds-grid">
                <div class="slds-col slds-size_8-of-12">
                    <h1 class="slds-welcome-mat__title">
                        Welcome back, {operatorName}
                    </h1>
                    <p class="slds-welcome-mat__body">
                        Manage your APD applications, track status, and access important documents.
                    </p>
                </div>
                <div class="slds-col slds-size_4-of-12 slds-text-align_right">
                    <lightning-button 
                        label="Submit New APD" 
                        variant="brand"
                        onclick={handleNewAPD}
                        class="slds-m-left_medium">
                    </lightning-button>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Status Overview Cards -->
    <div class="slds-grid slds-gutters slds-wrap slds-m-bottom_large">
        
        <div class="slds-col slds-size_3-of-12">
            <c-Nuvi-status-card
                title="Active Applications"
                count={activeCount}
                icon="custom:custom63"
                variant="info"
                onclick={handleViewActive}>
            </c-Nuvi-status-card>
        </div>
        
        <div class="slds-col slds-size_3-of-12">
            <c-Nuvi-status-card
                title="Pending Documents"
                count={pendingDocsCount}
                icon="standard:document"
                variant="warning"
                urgent={hasPendingDocs}
                onclick={handleViewPending}>
            </c-Nuvi-status-card>
        </div>
        
        <div class="slds-col slds-size_3-of-12">
            <c-Nuvi-status-card
                title="Approved This Year"
                count={approvedCount}
                icon="utility:success"
                variant="success"
                onclick={handleViewApproved}>
            </c-Nuvi-status-card>
        </div>
        
        <div class="slds-col slds-size_3-of-12">
            <c-Nuvi-status-card
                title="Compliance Items"
                count={complianceCount}
                icon="utility:warning"
                variant="error"
                urgent={hasComplianceIssues}
                onclick={handleViewCompliance}>
            </c-Nuvi-status-card>
        </div>
        
    </div>
    
    <!-- Main Content Grid -->
    <div class="slds-grid slds-gutters">
        
        <!-- Left Column: Recent Activity & Applications -->
        <div class="slds-col slds-size_8-of-12">
            
            <!-- Recent Applications Table -->
            <lightning-card title="My Applications" icon-name="custom:custom63">
                <div slot="actions">
                    <lightning-button-menu 
                        alternative-text="Application actions"
                        icon-name="utility:down"
                        menu-alignment="auto">
                        <lightning-menu-item 
                            value="view_all" 
                            label="View All Applications">
                        </lightning-menu-item>
                        <lightning-menu-item 
                            value="export" 
                            label="Export to Excel">
                        </lightning-menu-item>
                        <lightning-menu-item 
                            value="print" 
                            label="Print Summary">
                        </lightning-menu-item>
                    </lightning-button-menu>
                </div>
                
                <div class="slds-p-horizontal_small">
                    <c-Nuvi-operator-application-list
                        operator-id={operatorId}
                        max-records="10"
                        show-actions="true"
                        sortable="true"
                        filterable="true">
                    </c-Nuvi-operator-application-list>
                </div>
            </lightning-card>
            
            <!-- Recent Activity Feed -->
            <lightning-card title="Recent Activity" icon-name="utility:activity" class="slds-m-top_medium">
                <div class="slds-p-horizontal_small">
                    <c-Nuvi-activity-timeline
                        operator-id={operatorId}
                        activity-limit="15"
                        show-system-activities="true"
                        show-user-activities="true"
                        time-range="30">
                    </c-Nuvi-activity-timeline>
                </div>
            </lightning-card>
            
        </div>
        
        <!-- Right Column: Quick Actions & Information -->
        <div class="slds-col slds-size_4-of-12">
            
            <!-- Quick Actions Panel -->
            <lightning-card title="Quick Actions" icon-name="utility:quick_action">
                <div class="slds-p-horizontal_small">
                    <div class="slds-button-group-list">
                        
                        <lightning-button
                            label="Submit New APD"
                            variant="brand"
                            icon-name="utility:add"
                            onclick={handleNewAPD}
                            class="slds-button_full-width slds-m-bottom_small">
                        </lightning-button>
                        
                        <lightning-button
                            label="Upload Documents"
                            variant="neutral"
                            icon-name="utility:upload"
                            onclick={handleUploadDocs}
                            class="slds-button_full-width slds-m-bottom_small">
                        </lightning-button>
                        
                        <lightning-button
                            label="Schedule Meeting"
                            variant="neutral"
                            icon-name="utility:event"
                            onclick={handleScheduleMeeting}
                            class="slds-button_full-width slds-m-bottom_small">
                        </lightning-button>
                        
                        <lightning-button
                            label="Contact Field Office"
                            variant="neutral"
                            icon-name="utility:call"
                            onclick={handleContactOffice}
                            class="slds-button_full-width slds-m-bottom_small">
                        </lightning-button>
                        
                        <lightning-button
                            label="Payment History"
                            variant="neutral"
                            icon-name="utility:money"
                            onclick={handlePaymentHistory}
                            class="slds-button_full-width">
                        </lightning-button>
                        
                    </div>
                </div>
            </lightning-card>
            
            <!-- Important Notifications -->
            <lightning-card title="Important Notices" icon-name="utility:notification" class="slds-m-top_medium">
                <div class="slds-p-horizontal_small">
                    <c-Nuvi-operator-notifications
                        operator-id={operatorId}
                        notification-types="deadline,compliance,system"
                        max-notifications="5"
                        auto-refresh="true">
                    </c-Nuvi-operator-notifications>
                </div>
            </lightning-card>
            
            <!-- Compliance Status -->
            <lightning-card title="Compliance Overview" icon-name="utility:shield" class="slds-m-top_medium">
                <div class="slds-p-horizontal_small">
                    <c-Nuvi-compliance-status
                        operator-id={operatorId}
                        show-upcoming-deadlines="true"
                        show-overdue-items="true"
                        alert-on-issues="true">
                    </c-Nuvi-compliance-status>
                </div>
            </lightning-card>
            
        </div>
        
    </div>
    
</div>
```

### APD Submission Wizard Integration

#### Multi-Step Application Process
```javascript
// doiOperatorApdWizard.js - Operator-specific version
export default class DoiOperatorApdWizard extends LightningElement {
    @api operatorId;
    @track currentStep = 1;
    @track applicationData = {};
    @track availableLeases = [];
    @track operatorProfile = {};
    
    // Integration with existing document management
    @track documentManager;
    @track pdfSigner;
    
    connectedCallback() {
        this.loadOperatorProfile();
        this.loadAvailableLeases();
        this.initializeDocumentManager();
    }
    
    async loadOperatorProfile() {
        // Load operator information for auto-population
        this.operatorProfile = await getOperatorProfile({ operatorId: this.operatorId });
        this.prePopulateOperatorData();
    }
    
    prePopulateOperatorData() {
        // Auto-populate form with operator information
        this.applicationData = {
            ...this.applicationData,
            operatorName: this.operatorProfile.name,
            operatorNumber: this.operatorProfile.blmNumber,
            primaryContact: this.operatorProfile.primaryContact,
            mailingAddress: this.operatorProfile.mailingAddress,
            bondInformation: this.operatorProfile.activeBonds
        };
    }
    
    initializeDocumentManager() {
        // Initialize document management with APD-specific structure
        this.documentManager = this.template.querySelector('c-Nuvi-apd-document-manager');
        if (this.documentManager) {
            this.documentManager.initialize({
                recordType: 'APD_Application',
                folderStructure: 'APD_Standard',
                operatorId: this.operatorId
            });
        }
    }
    
    // Step navigation with validation
    async handleNext() {
        if (await this.validateCurrentStep()) {
            this.currentStep++;
            this.saveProgress();
        }
    }
    
    async validateCurrentStep() {
        switch (this.currentStep) {
            case 1:
                return this.validateOperatorInformation();
            case 2:
                return this.validateLeaseInformation();
            case 3:
                return this.validateWellInformation();
            case 4:
                return this.validateDocuments();
            case 5:
                return this.validatePayment();
            default:
                return true;
        }
    }
    
    async handleSubmit() {
        if (await this.validateCompleteApplication()) {
            this.submitApplication();
        }
    }
    
    async submitApplication() {
        const applicationData = {
            ...this.applicationData,
            operatorId: this.operatorId,
            submissionDate: new Date().toISOString(),
            documents: this.documentManager.getUploadedDocuments(),
            paymentAmount: this.calculateFees()
        };
        
        try {
            const result = await submitOperatorAPD(applicationData);
            
            // Show success and redirect
            this.showSuccessMessage(result);
            this.redirectToApplicationStatus(result.applicationId);
            
        } catch (error) {
            this.showErrorMessage(error.body.message);
        }
    }
}
```

## Stakeholder Engagement Portal

### Public Comment System Configuration

#### Public Comment Component
```javascript
// doiPublicCommentSystem.js
export default class DoiPublicCommentSystem extends LightningElement {
    @api apdId;
    @api commentPeriodActive = false;
    @api allowAnonymous = true;
    @api moderationRequired = true;
    
    @track comments = [];
    @track newComment = {
        commenterName: '',
        commenterEmail: '',
        organization: '',
        comment: '',
        attachments: []
    };
    
    async loadExistingComments() {
        try {
            this.comments = await getPublicComments({ 
                apdId: this.apdId,
                approvedOnly: true 
            });
        } catch (error) {
            console.error('Failed to load comments:', error);
        }
    }
    
    handleSubmitComment() {
        if (this.validateComment()) {
            this.submitComment();
        }
    }
    
    async submitComment() {
        const commentData = {
            apdId: this.apdId,
            ...this.newComment,
            submissionDate: new Date().toISOString(),
            ipAddress: this.getClientIP(),
            requiresModeration: this.moderationRequired
        };
        
        try {
            await submitPublicComment(commentData);
            
            this.showSuccessMessage(
                this.moderationRequired 
                    ? 'Comment submitted for review'
                    : 'Comment published successfully'
            );
            
            this.resetForm();
            
            if (!this.moderationRequired) {
                this.loadExistingComments();
            }
            
        } catch (error) {
            this.showErrorMessage('Failed to submit comment: ' + error.body.message);
        }
    }
    
    validateComment() {
        const isValid = 
            this.newComment.comment.length >= 10 &&
            this.newComment.comment.length <= 5000 &&
            (this.allowAnonymous || (this.newComment.commenterName && this.newComment.commenterEmail));
            
        if (!isValid) {
            this.showErrorMessage('Please provide a valid comment (10-5000 characters) and contact information if required.');
        }
        
        return isValid;
    }
}
```

## Security & Access Control

### Profile and Permission Configuration

#### Public Portal Security
```apex
// Public User Profile Configuration
Profile: Nuvi Public Portal User

Object Permissions:
- APD_Application__c: Read (public records only)
- APD_Document__c: Read (public documents only)
- NEPA_Assessment__c: Read (public environmental documents only)
- Public_Comment__c: Create, Read (own comments only)

Field-Level Security:
- Allow: Public-safe fields only
- Restrict: Internal review fields, sensitive location data, personal information
- Hide: Salesforce IDs, internal status fields, reviewer comments

Apex Class Access:
- DOI_PAL_PublicSearchController: Enabled
- DOI_PAL_PublicDocumentController: Enabled
- DOI_PAL_PublicCommentController: Enabled
- All internal controllers: Disabled

IP Restrictions: None (public access)
Login Hours: 24/7
Session Settings: 2-hour timeout for anonymous users
```

#### Operator Portal Security
```apex
// Operator Portal User Profile
Profile: Nuvi Operator Portal User

Object Permissions:
- APD_Application__c: Read (own records), Create
- APD_Document__c: Read (own records), Create
- APD_Payment__c: Read (own records)
- Operator__c: Read (own record), Edit
- Public_Comment__c: Create, Read

Record Access:
- APD Applications: Own records only (via sharing rules)
- Documents: Own records only
- Payments: Own records only

Field-Level Security:
- Allow: Operator-relevant fields
- Read-Only: Government review fields, status fields
- Hide: Internal review comments, sensitive government data

Apex Class Access:
- DOI_PAL_OperatorController: Enabled
- DOI_PAL_ApplicationController: Enabled
- DOI_PAL_DocumentController: Enabled
- Internal/Admin controllers: Disabled

Additional Security:
- Two-Factor Authentication: Required
- IP Restrictions: Configurable per operator
- Login Hours: Business hours (configurable)
- Session Timeout: 4 hours
```

### Data Sharing Configuration

#### Sharing Rules for Multi-Tenancy
```apex
// APD Application Sharing Rule
Rule Name: APD Applications - Operator Access
Based On: Owner-based sharing rule
Owner: All Internal Users
Share With: Public Group "All Operators"
Access Level: Read Only

Criteria:
- Record Owner: Internal User (BLM Staff)
- APD Status: Not Draft
- Public Visibility: True

// Document Sharing Rules
Rule Name: Public Documents - External Access
Based On: Criteria-based sharing rule
Criteria: 
- Document Type: EA, FONSI, Decision Record
- Public Access: True
- Confidential Flag: False
Share With: Public Group "Portal Users"
Access Level: Read Only
```

#### Guest User Sharing Configuration
```apex
// Guest User Record Access Settings
Object: APD_Application__c
Guest User Access: Read
Criteria:
- Public_Visibility__c = TRUE
- Status != "Draft,Withdrawn"
- Confidential_Information__c != TRUE

Sharing Set Name: Public APD Access
Target Object: APD_Application__c
Access Level: Read
Criteria: Same as above

// Document Access for Guest Users
Object: APD_Document__c  
Guest User Access: Read
Criteria:
- Document_Type__c = "EA,FONSI,Decision_Record,Public_Notice"
- Public_Access__c = TRUE
- Confidential__c = FALSE
```

## Mobile-First Configuration

### Responsive Design Implementation

#### Mobile Optimization Settings
```css
/* Mobile-First CSS Variables */
:root {
  --mobile-breakpoint: 768px;
  --tablet-breakpoint: 1024px;
  --desktop-breakpoint: 1200px;
  
  --touch-target-size: 44px;
  --mobile-font-size: 16px;
  --mobile-line-height: 1.5;
  --mobile-spacing: 16px;
}

/* Mobile-Specific Styles */
@media screen and (max-width: 768px) {
  
  .slds-card {
    margin-bottom: var(--mobile-spacing);
    border-radius: 8px;
  }
  
  .slds-button {
    min-height: var(--touch-target-size);
    font-size: var(--mobile-font-size);
  }
  
  .slds-input {
    min-height: var(--touch-target-size);
    font-size: var(--mobile-font-size);
  }
  
  /* Single column layout on mobile */
  .slds-grid {
    flex-direction: column;
  }
  
  .slds-col {
    width: 100% !important;
  }
  
  /* Mobile navigation */
  .mobile-nav-toggle {
    display: block;
  }
  
  .desktop-nav {
    display: none;
  }
  
}

/* Tablet Optimization */
@media screen and (min-width: 769px) and (max-width: 1024px) {
  
  .slds-col_2-of-12,
  .slds-col_3-of-12,
  .slds-col_4-of-12 {
    width: 50% !important;
  }
  
  .slds-col_6-of-12,
  .slds-col_8-of-12 {
    width: 100% !important;
  }
  
}
```

#### Progressive Web App Configuration
```json
// manifest.json for PWA capabilities
{
  "name": "Nuvi Permits Portal",
  "short_name": "Nuvi Permits",
  "description": "Department of Interior Oil & Gas Permits",
  "start_url": "/",
  "display": "standalone",
  "orientation": "portrait",
  "theme_color": "#22BDC1",
  "background_color": "#FFFFFF",
  "icons": [
    {
      "src": "/resource/doi_icon_192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/resource/doi_icon_512.png", 
      "sizes": "512x512",
      "type": "image/png"
    }
  ],
  "categories": ["government", "business"],
  "lang": "en-US"
}
```

## Performance & Analytics

### Site Performance Optimization

#### Caching Strategy
```javascript
// Service Worker for Offline Capability
// sw.js
const CACHE_NAME = 'Nuvi-permits-v1';
const urlsToCache = [
  '/',
  '/search',
  '/static/css/main.css',
  '/static/js/main.js',
  '/static/images/Nuvi-logo.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // Return cached version or fetch from network
        return response || fetch(event.request);
      })
  );
});
```

#### Performance Monitoring
```javascript
// Performance Analytics Integration
class DOIPerformanceMonitor {
  static trackPageLoad(pageName) {
    if ('performance' in window) {
      window.addEventListener('load', () => {
        const perfData = performance.getEntriesByType('navigation')[0];
        
        // Track key metrics
        this.trackMetric('page_load_time', perfData.loadEventEnd - perfData.loadEventStart, pageName);
        this.trackMetric('first_contentful_paint', this.getFirstContentfulPaint(), pageName);
        this.trackMetric('time_to_interactive', this.getTimeToInteractive(), pageName);
      });
    }
  }
  
  static trackUserInteraction(action, component) {
    this.trackEvent('user_interaction', {
      action: action,
      component: component,
      timestamp: Date.now(),
      sessionId: this.getSessionId()
    });
  }
  
  static trackError(error, component) {
    this.trackEvent('error', {
      message: error.message,
      stack: error.stack,
      component: component,
      userAgent: navigator.userAgent,
      url: window.location.href
    });
  }
}
```

### Analytics Dashboard Configuration

#### Google Analytics 4 Integration
```html
<!-- Google Analytics 4 Configuration -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  
  gtag('config', 'GA_MEASUREMENT_ID', {
    // Government-specific configuration
    anonymize_ip: true,
    respect_dnt: true,
    cookie_expires: 0, // Session only
    
    // Custom dimensions for Nuvi tracking
    custom_map: {
      'custom_dimension_1': 'user_type',     // Public, Operator, Government
      'custom_dimension_2': 'permit_type',   // APD, etc.
      'custom_dimension_3': 'field_office',  // Geographic tracking
      'custom_dimension_4': 'device_type'    // Mobile, Desktop, Tablet
    }
  });
  
  // Track permit searches
  function trackPermitSearch(searchTerm, resultCount) {
    gtag('event', 'search', {
      search_term: searchTerm,
      result_count: resultCount,
      content_category: 'permits'
    });
  }
  
  // Track document downloads
  function trackDocumentDownload(documentType, permitId) {
    gtag('event', 'file_download', {
      file_name: documentType,
      permit_id: permitId,
      content_category: 'public_documents'
    });
  }
</script>
```

## Internal App Flashy Design Configuration

### Nuvitek Theme for Internal Apps

For internal Salesforce apps (Lightning Experience), configure the Nuvitek Custom Theme Layout for maximum information density and flashy visuals:

#### Lightning App Configuration
```javascript
// App Builder Configuration for Internal Apps
<c-nuvitek-custom-theme-layout
    theme-variant="internal-dense"
    enable-animations="true"
    show-particle-background="false"
    enable-glassmorphism="true"
    density-level="maximum"
    white-space-mode="none">
    
    <!-- Internal app pages and components -->
    <div slot="main-content">
        <!-- Dense internal dashboards -->
    </div>
</c-nuvitek-custom-theme-layout>
```

#### Internal App Flashy Dashboard Layout
```html
<!-- Internal Staff Dashboard with Maximum Density -->
<div class="internal-app-container">
    <!-- Top Status Bar with Live Metrics -->
    <div class="status-bar-flashy">
        <div class="metric-pill">
            <span class="metric-value">247</span>
            <span class="metric-label">Active</span>
        </div>
        <div class="metric-pill urgent">
            <span class="metric-value">12</span>
            <span class="metric-label">Urgent</span>
        </div>
        <div class="metric-pill">
            <span class="metric-value">89</span>
            <span class="metric-label">Pending</span>
        </div>
        <div class="metric-pill success">
            <span class="metric-value">156</span>
            <span class="metric-label">Completed</span>
        </div>
        <div class="live-time">
            <span id="current-time">3:45 PM</span>
        </div>
    </div>
    
    <!-- Dense Multi-Column Layout -->
    <div class="dense-multi-column">
        <!-- Column 1: Quick Stats & Actions -->
        <div class="dense-column column-1">
            <div class="compact-widget">
                <h4>Today's Activity</h4>
                <div class="mini-stats">
                    <div class="mini-stat">
                        <span class="number">34</span>
                        <span class="label">New Applications</span>
                    </div>
                    <div class="mini-stat">
                        <span class="number">12</span>
                        <span class="label">Reviews Due</span>
                    </div>
                    <div class="mini-stat">
                        <span class="number">8</span>
                        <span class="label">Approvals</span>
                    </div>
                </div>
            </div>
            
            <div class="quick-actions-compact">
                <button class="action-btn-small">New Review</button>
                <button class="action-btn-small">Bulk Update</button>
                <button class="action-btn-small">Reports</button>
                <button class="action-btn-small">Analytics</button>
            </div>
        </div>
        
        <!-- Column 2: Live Activity Feed -->
        <div class="dense-column column-2">
            <div class="live-feed-compact">
                <h4>Live Feed <span class="live-dot">●</span></h4>
                <div class="feed-items">
                    <div class="feed-item">
                        <div class="feed-icon">📄</div>
                        <div class="feed-text">
                            <strong>APD-001247</strong> submitted
                            <div class="feed-meta">2m ago • John Smith</div>
                        </div>
                    </div>
                    <div class="feed-item">
                        <div class="feed-icon">✅</div>
                        <div class="feed-text">
                            <strong>APD-001245</strong> approved
                            <div class="feed-meta">5m ago • Sarah Johnson</div>
                        </div>
                    </div>
                    <div class="feed-item">
                        <div class="feed-icon">⚠️</div>
                        <div class="feed-text">
                            <strong>APD-001243</strong> requires attention
                            <div class="feed-meta">8m ago • System</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Column 3: Charts & Analytics -->
        <div class="dense-column column-3">
            <div class="mini-chart-container">
                <h4>Performance</h4>
                <div class="chart-placeholder">
                    <!-- Mini chart with sparklines -->
                    <div class="sparkline">📈</div>
                    <div class="chart-stats">
                        <span class="trend-up">+12%</span>
                        <span class="vs-last">vs last week</span>
                    </div>
                </div>
            </div>
            
            <div class="priority-queue">
                <h4>Priority Queue</h4>
                <div class="priority-items">
                    <div class="priority-item high">
                        <span class="priority-badge">HIGH</span>
                        <span class="priority-text">NEPA Review Due</span>
                    </div>
                    <div class="priority-item medium">
                        <span class="priority-badge">MED</span>
                        <span class="priority-text">Public Comment</span>
                    </div>
                    <div class="priority-item low">
                        <span class="priority-badge">LOW</span>
                        <span class="priority-text">Documentation</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Bottom Section: Dense Data Grid -->
    <div class="dense-data-section">
        <div class="data-controls">
            <div class="filter-pills">
                <button class="filter-pill active">All</button>
                <button class="filter-pill">Mine</button>
                <button class="filter-pill">Team</button>
                <button class="filter-pill">Urgent</button>
            </div>
            <div class="view-controls">
                <button class="view-btn active">Grid</button>
                <button class="view-btn">List</button>
                <button class="view-btn">Cards</button>
            </div>
        </div>
        
        <div class="ultra-dense-table">
            <table class="internal-table">
                <thead>
                    <tr>
                        <th>ID</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Assignee</th>
                        <th>Due</th>
                        <th>Actions</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="table-row-dense">
                        <td><strong>APD-001247</strong></td>
                        <td>Drilling</td>
                        <td><span class="status-mini pending">Pending</span></td>
                        <td><span class="priority-mini high">High</span></td>
                        <td>J. Smith</td>
                        <td>Dec 5</td>
                        <td><button class="action-mini">→</button></td>
                    </tr>
                    <!-- More ultra-compact rows -->
                </tbody>
            </table>
        </div>
    </div>
</div>
```

### Complete Flashy CSS Styles

Add this comprehensive CSS to your Experience Cloud or Lightning App:

```css
/* ===== FLASHY PORTAL & INTERNAL APP STYLES ===== */

/* Global Flashy Variables */
:root {
    --flashy-primary: #1a73e8;
    --flashy-secondary: #34a853;
    --flashy-accent: #ea4335;
    --flashy-warning: #fbbc04;
    --flashy-surface: rgba(255, 255, 255, 0.95);
    --flashy-surface-dark: rgba(0, 0, 0, 0.8);
    --flashy-glass: rgba(255, 255, 255, 0.1);
    --flashy-shadow: 0 8px 32px rgba(31, 38, 135, 0.37);
    --flashy-shadow-lg: 0 20px 40px rgba(0, 0, 0, 0.1);
    --flashy-border: 1px solid rgba(255, 255, 255, 0.18);
    --flashy-gradient-1: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    --flashy-gradient-2: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    --flashy-gradient-3: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
    --flashy-animation-speed: 0.3s;
    --flashy-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);
}

/* Glassmorphism Base */
.glassmorphism {
    background: var(--flashy-glass);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: var(--flashy-border);
    border-radius: 16px;
    box-shadow: var(--flashy-shadow);
}

/* Animated Background Elements */
.particle-background {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    z-index: -1;
}

.particle {
    position: absolute;
    width: 4px;
    height: 4px;
    background: var(--flashy-primary);
    border-radius: 50%;
    animation: particle-float 20s infinite linear;
}

.particle-1 { left: 20%; animation-delay: 0s; }
.particle-2 { left: 50%; animation-delay: 5s; }
.particle-3 { left: 80%; animation-delay: 10s; }

@keyframes particle-float {
    0% { transform: translateY(100vh) rotate(0deg); opacity: 0; }
    10% { opacity: 1; }
    90% { opacity: 1; }
    100% { transform: translateY(-100px) rotate(360deg); opacity: 0; }
}

/* Flashy Hero Section */
.flashy-hero-section {
    position: relative;
    background: var(--flashy-gradient-1);
    padding: 40px 20px;
    margin-bottom: 20px;
    border-radius: 20px;
    overflow: hidden;
}

.animated-title {
    font-size: 3.5rem;
    font-weight: 700;
    background: linear-gradient(45deg, #fff, #f0f0f0);
    background-clip: text;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    text-align: center;
    margin-bottom: 20px;
    animation: title-glow 2s ease-in-out infinite alternate;
}

@keyframes title-glow {
    from { filter: drop-shadow(0 0 10px rgba(255,255,255,0.5)); }
    to { filter: drop-shadow(0 0 20px rgba(255,255,255,0.8)); }
}

/* Inline Stats */
.inline-stats {
    display: flex;
    justify-content: center;
    gap: 20px;
    flex-wrap: wrap;
    margin: 20px 0;
}

.stat-badge {
    background: var(--flashy-glass);
    backdrop-filter: blur(10px);
    padding: 12px 24px;
    border-radius: 30px;
    text-align: center;
    border: 1px solid rgba(255,255,255,0.2);
    animation: var(--nuvitek-animation-pulse);
}

.stat-number {
    display: block;
    font-size: 2rem;
    font-weight: 700;
    color: white;
}

.stat-label {
    display: block;
    font-size: 0.9rem;
    color: rgba(255,255,255,0.8);
}

/* Quick Actions Grid */
.quick-actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-top: 30px;
    padding: 0 20px;
}

.action-card {
    padding: 24px;
    text-align: center;
    transition: transform var(--flashy-animation-speed) var(--flashy-bounce);
    cursor: pointer;
    position: relative;
}

.action-card:hover {
    transform: translateY(-8px) scale(1.02);
    box-shadow: var(--flashy-shadow-lg);
}

.action-icon {
    font-size: 3rem;
    margin-bottom: 12px;
    animation: var(--nuvitek-animation-float);
}

.action-card h3 {
    color: white;
    margin: 12px 0 8px 0;
    font-weight: 600;
}

.action-card p {
    color: rgba(255,255,255,0.8);
    font-size: 0.9rem;
    margin-bottom: 12px;
}

.action-stats {
    font-size: 0.8rem;
    color: var(--flashy-accent);
    font-weight: 500;
}

.notification-badge {
    position: relative;
}

.notification-badge::after {
    content: '';
    position: absolute;
    top: -8px;
    right: -8px;
    width: 16px;
    height: 16px;
    background: var(--flashy-accent);
    border-radius: 50%;
    animation: var(--nuvitek-animation-pulse);
}

/* Dense Dashboard Container */
.dense-dashboard-container {
    display: flex;
    flex-direction: column;
    gap: 15px;
    padding: 0;
}

.dashboard-grid {
    display: grid;
    grid-template-columns: 300px 1fr 280px;
    gap: 15px;
    margin-bottom: 15px;
}

/* Status Bar for Internal Apps */
.status-bar-flashy {
    display: flex;
    align-items: center;
    gap: 12px;
    background: var(--flashy-gradient-2);
    padding: 12px 20px;
    border-radius: 12px;
    margin-bottom: 15px;
}

.metric-pill {
    background: rgba(255,255,255,0.2);
    padding: 8px 16px;
    border-radius: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 60px;
}

.metric-value {
    font-size: 1.4rem;
    font-weight: 700;
    color: white;
}

.metric-label {
    font-size: 0.7rem;
    color: rgba(255,255,255,0.8);
}

.metric-pill.urgent {
    background: rgba(234, 67, 53, 0.3);
    animation: var(--nuvitek-animation-pulse);
}

.metric-pill.success {
    background: rgba(52, 168, 83, 0.3);
}

/* Dense Multi-Column Layout */
.dense-multi-column {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 15px;
    margin-bottom: 15px;
}

.dense-column {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.compact-widget {
    background: var(--flashy-glass);
    backdrop-filter: blur(10px);
    padding: 16px;
    border-radius: 12px;
    border: var(--flashy-border);
}

.compact-widget h4 {
    margin: 0 0 12px 0;
    font-size: 1.1rem;
    font-weight: 600;
}

.mini-stats {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.mini-stat {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 0;
}

.mini-stat .number {
    font-weight: 700;
    color: var(--flashy-primary);
}

.mini-stat .label {
    font-size: 0.9rem;
    color: #666;
}

/* Live Feed Compact */
.live-feed-compact {
    background: var(--flashy-glass);
    backdrop-filter: blur(10px);
    padding: 16px;
    border-radius: 12px;
    border: var(--flashy-border);
    height: fit-content;
}

.live-feed-compact h4 {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 12px 0;
}

.live-dot {
    color: var(--flashy-secondary);
    animation: var(--nuvitek-animation-pulse);
}

.feed-items {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.feed-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid rgba(0,0,0,0.1);
}

.feed-item:last-child {
    border-bottom: none;
}

.feed-icon {
    font-size: 1.2rem;
    width: 20px;
    text-align: center;
}

.feed-text {
    flex: 1;
}

.feed-meta {
    font-size: 0.8rem;
    color: #666;
    margin-top: 2px;
}

/* Ultra Dense Tables */
.ultra-dense-table {
    background: var(--flashy-surface);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: var(--flashy-shadow);
}

.internal-table {
    width: 100%;
    border-collapse: collapse;
}

.internal-table th {
    background: var(--flashy-gradient-3);
    color: white;
    padding: 8px 12px;
    font-weight: 600;
    font-size: 0.9rem;
}

.table-row-dense {
    transition: background var(--flashy-animation-speed);
}

.table-row-dense:hover {
    background: rgba(26, 115, 232, 0.1);
}

.internal-table td {
    padding: 6px 12px;
    font-size: 0.9rem;
    border-bottom: 1px solid rgba(0,0,0,0.1);
}

/* Status and Priority Badges */
.status-mini {
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 0.7rem;
    font-weight: 500;
}

.status-mini.pending {
    background: rgba(251, 188, 4, 0.2);
    color: #f9ab00;
}

.priority-mini.high {
    background: rgba(234, 67, 53, 0.2);
    color: #ea4335;
}

.action-mini {
    background: var(--flashy-primary);
    color: white;
    border: none;
    border-radius: 6px;
    padding: 4px 8px;
    cursor: pointer;
    font-size: 0.8rem;
}

/* Responsive Design */
@media (max-width: 1200px) {
    .dashboard-grid {
        grid-template-columns: 1fr 1fr;
    }
    
    .dense-multi-column {
        grid-template-columns: 1fr 1fr;
    }
}

@media (max-width: 768px) {
    .dashboard-grid {
        grid-template-columns: 1fr;
    }
    
    .dense-multi-column {
        grid-template-columns: 1fr;
    }
    
    .quick-actions-grid {
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
    
    .status-bar-flashy {
        flex-wrap: wrap;
    }
    
    .animated-title {
        font-size: 2.5rem;
    }
}

/* Animation Performance Optimizations */
* {
    will-change: auto;
}

.action-card, .stat-badge, .metric-pill {
    transform: translateZ(0);
}

/* Accessibility Improvements */
@media (prefers-reduced-motion: reduce) {
    * {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
    }
}

/* Focus States for Accessibility */
.action-card:focus,
.tool-btn:focus,
.action-btn-small:focus {
    outline: 2px solid var(--flashy-primary);
    outline-offset: 2px;
}
```

---

This comprehensive Experience Cloud guide provides complete configuration instructions for building a government-compliant, accessible, and performant public portal system with **flashy, dense UI design using the Nuvitek Custom Theme Layout**. The guide now includes both external portal and internal app configurations with minimal white space and maximum visual impact.

*Guide Version: 1.0*  
*Last Updated: September 3, 2025*  
*Compliance: Section 508, WCAG 2.1 AA, Government Web Standards*



