import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getNavigationItems from '@salesforce/apex/NuvitekCustomThemeLayoutServices.getNavigationItems';
import searchAcrossObjects from '@salesforce/apex/NuvitekCustomThemeLayoutServices.searchAcrossObjects';

/**
 * @slot header This is the header slot
 * @slot footer This is the footer slot
 * @slot default This is the default slot
 * @slot hero-media This slot is for the hero media section
 */
export default class NuvitekCustomThemeLayout extends NavigationMixin(LightningElement) {
    // Base theme properties
    @api primaryColor = '#22BDC1';
    @api accentColor = '#D5DF23';
    @api textColor = '#1d1d1f';
    @api themeName = 'light';
    /**
     * Controls the brightness of the hero section overlay.
     * -1: No overlay (background fully visible)
     * 0: No overlay (background fully visible)
     * 1-100: White overlay with specified opacity (higher values = brighter overlay)
     * @type {number}
     * @default 30
     */
    @api heroBackgroundDarkness = 30; // Default value of 30%
    @track searchResults = [];
    @track isSearching = false;
    @track showSearchResults = false;
    @api searchObjects = 'Account,Contact';


    // Header options
    @api useDefaultHeader = false;
    @api headerNavigationMenuName;
    @api logoUrl;
    @api logoAltText = 'Nuvitek';
    @api showSearchInHeader = false;
    @api headerSticky = false;
    @api headerVariant = 'standard'; // standard, minimal, expanded

    // Footer options
    @api useDefaultFooter = false;
    @api footerNavigationMenuName;
    @api footerStyle = 'standard';
    @api companyName = 'Nuvitek';
    @api footerTagline = 'Delivering innovative solutions since 2012';
    @api footerLegalText = 'All rights reserved. Terms and conditions apply.';

    // Dynamic Footer Columns
    @api footerColumnCount = 3;
    @api footerColumnTitles = 'Products, Resources, Company';
    @api footerColumnMenus = '';

    // Dynamic Social Links
    @api socialLinksCount = 0;
    @api socialLinkTitles = 'Facebook, Twitter, LinkedIn, Instagram';
    @api socialLinkUrls = '';

    // Hero section properties
    @api showHeroSection = false;
    @api heroLayout = 'fullwidth';
    @api heroBackgroundImage;
    @api heroTitle = 'Experience the Future Today';
    @api heroSubtitle = 'Discover innovative solutions designed with you in mind';
    @api heroCTAPrimaryLabel = 'Get Started';
    @api heroCTAPrimaryUrl;
    @api heroCTASecondaryLabel = 'Learn More';
    @api heroCTASecondaryUrl;

    // FAB control
    @api showFab = false;
    @api fabUrl;

    // Video background properties
    @api showBackgroundVideo = false;
    @api backgroundVideoUrl;
    @api backgroundVideoFallbackUrl;
    @api backgroundVideoDarkness = 35;

    // Theme control
    @api applyThemeToSlots = false;
    @api globalThemeOverride = false;

    // Reactive state tracking
    @track scrolled = false;
    @track mobileMenuOpen = false;
    @track helpFormOpen = false;
    @track formSubmitted = false;
    @track formSubmissionMessage = '';
    @track styleInjectionTargets = [];
    @track mutationObserver;
    @track ootbComponentsStyled = false;

    // Navigation data
    @track headerNavItems = [];
    @track footerNavItems = [];
    @track isHeaderNavLoaded = false;
    @track isFooterNavLoaded = false;

    // Column menus data
    @track columnMenusData = {};

    // Add these properties
    @api headerContainerWidth = 100;
    @api showProfileIcon = false;
    @api profilePageUrl = '/profile';
    @api ensureHomeNavItem = false;

    // General utility method to safely get a property value
    getSafeValue(value, defaultValue = '') {
        // Check for null, undefined, or empty strings
        if (value === null || value === undefined || value === 'null' || value === 'undefined' || value === '') {
            return defaultValue;
        }
        return value;
    }

    // Wire the header navigation menu items
    @wire(getNavigationItems, { menuName: '$headerNavigationMenuName' })
    wiredHeaderNavItems({ error, data }) {
        if (data) {
            this.headerNavItems = this.processNavItems(data, true);
            this.isHeaderNavLoaded = true;
        } else if (error) {
            console.error('Error loading header navigation items', error);
            this.headerNavItems = [];
            this.isHeaderNavLoaded = true;
        }
    }

    // Wire the footer navigation menu items
    @wire(getNavigationItems, { menuName: '$footerNavigationMenuName' })
    wiredFooterNavItems({ error, data }) {
        if (data) {
            this.footerNavItems = this.processNavItems(data, false);
            this.isFooterNavLoaded = true;
        } else if (error) {
            console.error('Error loading footer navigation items', error);
            this.footerNavItems = [];
            this.isFooterNavLoaded = true;
        }
    }

    // Lifecycle hooks
    connectedCallback() {
        if (typeof window !== 'undefined') {
            window.addEventListener('scroll', this.handleScroll.bind(this));
            window.addEventListener('resize', this.handleResize.bind(this));
            this.setupMutationObserver();
        }

        // Initialize footer column data if needed
        this.initColumnMenusData();
    }

    // Initialize column menus data
    initColumnMenusData() {
        if (!this.footerColumnMenus) return;

        const menus = this.footerColumnMenusArray;
        menus.forEach((menuName, index) => {
            if (menuName && menuName !== this.footerNavigationMenuName) {
                this.fetchMenuData(menuName)
                    .then(data => {
                        this.columnMenusData[index] = data;
                    })
                    .catch(error => {
                        console.error(`Error loading menu for column ${index}:`, error);
                    });
            }
        });
    }

    // Method to get navigation data for a specific menu
    fetchMenuData(menuName) {
        if (!menuName || menuName.trim() === '') return Promise.resolve([]);
        return new Promise((resolve, reject) => {
            getNavigationItems({ menuName: menuName.trim() })
                .then(data => {
                    resolve(this.processNavItems(data, false));
                })
                .catch(error => {
                    console.error(`Error loading menu: ${menuName}`, error);
                    reject(error);
                });
        });
    }

    renderedCallback() {
        this.applyThemeToSlottedContent();

        if (!this.ootbComponentsStyled && this.globalThemeOverride) {
            this.applyStylesToOOTBComponents();
            this.ootbComponentsStyled = true;
        }
    }

    disconnectedCallback() {
        if (typeof window !== 'undefined') {
            window.removeEventListener('scroll', this.handleScroll.bind(this));
            window.removeEventListener('resize', this.handleResize.bind(this));
        }

        // Disconnect the mutation observer
        if (this.mutationObserver) {
            this.mutationObserver.disconnect();
        }
    }

    // Footer column properties
    get footerColumnTitlesArray() {
        return this.getSafeValue(this.footerColumnTitles, 'Products, Resources, Company').split(',').map(title => title.trim());
    }

    get footerColumnMenusArray() {
        if (!this.footerColumnMenus) return [];
        return this.footerColumnMenus.split(',').map(menu => menu.trim());
    }

    // Social links properties
    get socialLinkTitlesArray() {
        return this.getSafeValue(this.socialLinkTitles, 'Facebook, Twitter, LinkedIn, Instagram').split(',').map(title => title.trim());
    }

    get socialLinkUrlsArray() {
        if (!this.socialLinkUrls) return [];
        return this.socialLinkUrls.split(',').map(url => url.trim());
    }

    // Add this computed property for header container width
    get headerContainerStyle() {
        return `--header-container-width: ${this.headerContainerWidth}%;`;
    }

    // Updated processNavItems method with isHeader parameter
    processNavItems(navItems, isHeader) {
        if (!navItems || !navItems.menuItems) return [];

        const currentUrl = window.location.pathname;
        let hasHomeItem = false;

        // Create a Set to track unique item labels/URLs
        const uniqueLabels = new Set();
        const uniqueUrls = new Set();

        // Process the items and filter out duplicates
        const processedItems = navItems.menuItems.reduce((filtered, item) => {
            // Skip if we already have an item with this label or URL
            const itemLabel = item.label?.toLowerCase();
            const itemUrl = item.actionValue;

            // Check for duplicates
            if (uniqueLabels.has(itemLabel) || uniqueUrls.has(itemUrl)) {
                return filtered; // Skip this item
            }

            // For footer, skip Home items
            if (!isHeader && (
                itemLabel === 'home' ||
                itemUrl === '/' ||
                itemUrl?.endsWith('/home')
            )) {
                return filtered; // Skip home items for footer
            }

            // Add to our tracking sets
            if (itemLabel) uniqueLabels.add(itemLabel);
            if (itemUrl) uniqueUrls.add(itemUrl);

            // Check if this is a home item
            if (itemLabel === 'home' ||
                itemUrl === '/' ||
                itemUrl?.endsWith('/home')) {
                hasHomeItem = true;
            }

            // More precise active page detection
            const isActive = currentUrl === itemUrl || 
                            (itemUrl && itemUrl.length > 1 && currentUrl === itemUrl) ||
                            (itemUrl === '/' && (currentUrl === '/' || currentUrl.endsWith('/home')));

            // Create the processed item
            filtered.push({
                id: item.id || item.label,
                label: item.label,
                target: itemUrl,
                type: item.actionType,
                imageUrl: item.imageUrl,
                isActive,
                activeClass: isActive ? 'nav-item active' : 'nav-item',
                ariaCurrent: isActive ? 'page' : null,
                hasChildren: item.subMenu && item.subMenu.length > 0,
                children: item.subMenu ? this.processSubMenu(item.subMenu) : []
            });

            return filtered;
        }, []);

        // Add a Home item if needed and configured (only for header)
        if (isHeader && this.ensureHomeNavItem && !hasHomeItem) {
            const homeItem = {
                id: 'home',
                label: 'Home',
                target: '/',
                type: 'InternalLink',
                imageUrl: null,
                isActive: currentUrl === '/' || currentUrl.endsWith('/home'),
                activeClass: (currentUrl === '/' || currentUrl.endsWith('/home')) ? 'nav-item active' : 'nav-item',
                ariaCurrent: (currentUrl === '/' || currentUrl.endsWith('/home')) ? 'page' : null,
                hasChildren: false,
                children: []
            };

            // Add home item at the beginning
            processedItems.unshift(homeItem);
        }

        return processedItems;
    }

    // Process submenu items
    processSubMenu(subMenu) {
        if (!subMenu || subMenu.length === 0) return [];

        const currentUrl = window.location.pathname;
        return subMenu.map(item => {
            // Determine if this item is active
            const isActive = currentUrl.includes(item.actionValue);

            return {
                id: item.id || item.label,
                label: item.label,
                target: item.actionValue,
                type: item.actionType,
                imageUrl: item.imageUrl,
                isActive,
                activeClass: isActive ? 'nav-dropdown-item active' : 'nav-dropdown-item',
                ariaCurrent: isActive ? 'page' : null,
                hasChildren: false
            };
        });
    }

    // Method to get the title for a specific column index
    getColumnTitle(index) {
        const titles = this.footerColumnTitlesArray;
        if (index < titles.length) {
            return titles[index];
        }
        return `Column ${index + 1}`;
    }

    // Method to get the menu name for a specific column index
    getColumnMenuName(index) {
        const menus = this.footerColumnMenusArray;
        if (index < menus.length && menus[index]) {
            return menus[index];
        }
        return this.footerNavigationMenuName;
    }

    // Method to get the social link title
    getSocialLinkTitle(index) {
        const titles = this.socialLinkTitlesArray;
        if (index < titles.length) {
            return titles[index];
        }
        return `Social Link ${index + 1}`;
    }

    // Method to get the social link URL
    getSocialLinkUrl(index) {
        const urls = this.socialLinkUrlsArray;
        if (index < urls.length) {
            return urls[index];
        }
        return '';
    }

    // Method to determine social icon type
    getSocialIconType(title) {
        const name = title.toLowerCase();
        if (name.includes('facebook')) return 'facebook';
        if (name.includes('twitter') || name.includes('x')) return 'twitter';
        if (name.includes('linkedin')) return 'linkedin';
        if (name.includes('instagram')) return 'instagram';
        if (name.includes('youtube')) return 'youtube';
        if (name.includes('pinterest')) return 'pinterest';
        if (name.includes('tiktok')) return 'tiktok';
        if (name.includes('github')) return 'github';
        return 'generic';
    }

    // Create a function to generate footer column data for the template
    get footerColumnsWithItems() {
        const columns = [];
        for (let i = 0; i < this.footerColumnCount; i++) {
            // Get the menu name for this column
            const menuName = this.getColumnMenuName(i);
            let columnItems = [];

            // If using specific menu for this column, check if we've loaded it
            if (menuName !== this.footerNavigationMenuName && this.columnMenusData[i]) {
                columnItems = this.columnMenusData[i];
            } else {
                // If using main footer menu or specific menu not loaded yet,
                // divide main items among columns
                if (this.footerNavItems && this.footerNavItems.length > 0) {
                    const totalItems = this.footerNavItems.length;
                    const itemsPerColumn = Math.ceil(totalItems / this.footerColumnCount);
                    const startIndex = i * itemsPerColumn;
                    const endIndex = Math.min(startIndex + itemsPerColumn, totalItems);

                    columnItems = this.footerNavItems.slice(startIndex, endIndex);
                }
            }

            columns.push({
                index: i,
                title: this.getColumnTitle(i),
                menuName: menuName,
                items: columnItems
            });
        }
        return columns;
    }

    // Create a computed property for the social links
    get socialLinks() {
        const links = [];
        for (let i = 0; i < this.socialLinksCount; i++) {
            const title = this.getSocialLinkTitle(i);
            const url = this.getSocialLinkUrl(i);
            
            if (url && url.trim() !== '') {
                const iconType = this.getSocialIconType(title);
                links.push({
                    index: i,
                    title: title,
                    url: url,
                    iconType: iconType,
                    isFacebook: iconType === 'facebook',
                    isTwitter: iconType === 'twitter',
                    isLinkedIn: iconType === 'linkedin',
                    isInstagram: iconType === 'instagram',
                    isYoutube: iconType === 'youtube',
                    isPinterest: iconType === 'pinterest',
                    isTiktok: iconType === 'tiktok',
                    isGithub: iconType === 'github',
                    isGeneric: iconType === 'generic'
                });
            }
        }
        return links;
    }

    // Computed property for dynamic grid columns
    get footerColumnsStyle() {
        if (this.footerStyle === 'minimal' || this.footerStyle === 'standard') {
            // For minimal and standard styles, use flex layout
            return `display: flex; justify-content: center; flex-wrap: wrap; gap: var(--spacing-lg);`;
        } else {
            // For multi-column and expanded styles, use grid layout
            const columnCount = this.footerColumnCount;
            return `grid-template-columns: repeat(${columnCount}, 1fr);`;
        }
    }

    // Handle navigation item click
    handleNavItemClick(event) {
        event.preventDefault();
        const target = event.currentTarget.dataset.target;
        const type = event.currentTarget.dataset.type;

        if (target && type) {
            // Use NavigationMixin to handle navigation
            if (type === 'InternalLink') {
                // Internal link navigation
                this[NavigationMixin.Navigate]({
                    type: 'standard__webPage',
                    attributes: {
                        url: target
                    }
                });
            } else if (type === 'ExternalLink') {
                // External link - open in new window
                window.open(target, '_blank');
            } else {
                // Default fallback for other navigation types
                this[NavigationMixin.Navigate]({
                    type: type,
                    attributes: {
                        url: target
                    }
                });
            }
        }

        // Close mobile menu if open
        if (this.mobileMenuOpen) {
            this.toggleMobileMenu();
        }
    }

    // Add this method to handle the search
    handleSearch(event) {
        // Prevent default form submission
        if (event.type === 'submit' || event.keyCode === 13) {
            event.preventDefault();
        }
        
        // Get the search input
        const searchInput = this.template.querySelector('.search-input');
        const searchTerm = searchInput.value.trim();
        
        // Get the objects to search (from data attribute or use default)
        const objectsToSearch = searchInput.dataset.searchObjects || 'Account,Contact,Case';
        
        // Only search if we have a term
        if (searchTerm.length >= 2) {
            this.isSearching = true;
            this.showSearchResults = true;
            
            // Call the Apex method
            searchAcrossObjects({ searchTerm, objectsToSearch })
                .then(results => {
                    this.searchResults = results;
                    this.isSearching = false;
                })
                .catch(error => {
                    console.error('Error performing search:', error);
                    this.isSearching = false;
                    this.searchResults = [];
                });
        } else {
            this.showSearchResults = false;
            this.searchResults = [];
        }
    }

    // Add method to handle keyboard input
    handleSearchKeyup(event) {
        if (event.keyCode === 13) { // Enter key
            this.handleSearch(event);
        } else if (event.target.value.trim().length >= 2) {
            // Optional: You could implement auto-search here
            this.handleSearch(event);
        } else if (event.target.value.trim().length === 0) {
            this.showSearchResults = false;
            this.searchResults = [];
        }
    }

    // Add method to close search results
    closeSearchResults() {
        this.showSearchResults = false;
    }

    // Add method to handle result click
    handleResultClick(event) {
        const recordId = event.currentTarget.dataset.id;
        const objectType = event.currentTarget.dataset.objectType;
        
        // Navigate to the record using NavigationMixin
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: recordId,
                objectApiName: objectType,
                actionName: 'view'
            }
        });
        
        // Close the search results
        this.closeSearchResults();
        
        // Clear the input
        this.template.querySelector('.search-input').value = '';
    }

    setupMutationObserver() {
        // Create a MutationObserver to detect when new components are added to the DOM
        if (window.MutationObserver) {
            this.mutationObserver = new MutationObserver(mutations => {
                let shouldReapplyStyles = false;

                mutations.forEach(mutation => {
                    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                        shouldReapplyStyles = true;
                    }
                });

                if (shouldReapplyStyles) {
                    this.applyThemeToSlottedContent();
                }
            });

            // Start observing the entire component for child changes
            const config = { childList: true, subtree: true };
            this.mutationObserver.observe(this.template.host, config);
        }
    }

    // Apply theme to slotted content
    applyThemeToSlottedContent() {
        if (!this.applyThemeToSlots) return;

        try {
            // Get all slot elements
            const slots = this.template.querySelectorAll('slot');

            slots.forEach(slot => {
                const slotName = slot.name || 'default';
                const assignedElements = slot.assignedElements();

                assignedElements.forEach(el => {
                    // Add theme class to element
                    el.classList.add('nuvitek-themed-component');

                    // Add slot-specific classes
                    if (slotName === 'header') {
                        el.classList.add('nuvitek-themed-header');
                    } else if (slotName === 'footer') {
                        el.classList.add('nuvitek-themed-footer');
                    }

                    // Apply CSS variables directly to the element
                    this.applyThemeVariablesToElement(el);

                    // Recursively process child components
                    this.processChildComponents(el);
                });
            });
        } catch (error) {
            console.error('Error applying theme to slotted content:', error);
        }
    }

    processChildComponents(parentElement) {
        // Process all child elements recursively
        if (!parentElement || !parentElement.querySelectorAll) return;

        // Process Lightning components differently to get to their shadow DOM
        const lightningComponents = parentElement.querySelectorAll('[data-id^="lightning-"]');
        lightningComponents.forEach(component => {
            this.injectStylesIntoLightningComponent(component);
        });

        // Apply theme to standard HTML elements 
        const standardElements = parentElement.querySelectorAll('button, input, select, textarea, a');
        standardElements.forEach(element => {
            this.applyThemeClassesToElement(element);
        });

        // Continue processing child elements that are not Lightning components
        const childElements = parentElement.children;
        if (childElements) {
            Array.from(childElements).forEach(child => {
                // Skip already processed Lightning components
                if (!child.getAttribute('data-id')?.startsWith('lightning-')) {
                    this.processChildComponents(child);
                }
            });
        }
    }

    applyThemeClassesToElement(element) {
        if (!element) return;

        // Map HTML elements to our utility classes
        const tagName = element.tagName.toLowerCase();

        switch (tagName) {
            case 'button':
                element.classList.add('nuvitek-btn');
                if (element.classList.contains('slds-button_brand') ||
                    element.classList.contains('slds-button--brand')) {
                    element.classList.add('nuvitek-btn-primary');
                } else {
                    element.classList.add('nuvitek-btn-secondary');
                }
                break;

            case 'input':
                element.classList.add('nuvitek-input');
                break;

            case 'textarea':
                element.classList.add('nuvitek-input');
                element.classList.add('nuvitek-textarea');
                break;

            case 'select':
                element.classList.add('nuvitek-input');
                break;

            case 'a':
                if (element.classList.contains('slds-button') ||
                    element.role === 'button') {
                    element.classList.add('nuvitek-btn');
                }
                break;
        }
    }

    injectStylesIntoLightningComponent(component) {
        // Attempt to access shadow root and inject styles
        if (component.shadowRoot) {
            this.injectStyleElement(component.shadowRoot);
        }

        // Some components expose their template differently
        if (component.template) {
            this.injectStyleElement(component.template);
        }
    }

    injectStyleElement(targetRoot) {
        if (!targetRoot) return;

        // Check if styles are already injected
        const existingStyle = targetRoot.querySelector('.nuvitek-injected-style');
        if (existingStyle) return;

        // Create a style element
        const styleElement = document.createElement('style');
        styleElement.className = 'nuvitek-injected-style';
        styleElement.textContent = this.getThemeVariablesCSS();

        // Append to shadow root
        targetRoot.appendChild(styleElement);
    }

    getThemeVariablesCSS() {
        // Generate CSS variables based on current theme settings
        return `
            :host {
                --primary-color: ${this.getSafeValue(this.primaryColor, '#22BDC1')};
                --accent-color: ${this.getSafeValue(this.accentColor, '#D5DF23')};
                --text-color: ${this.getSafeValue(this.textColor, '#1d1d1f')};
                /* All other variables would be derived from these */
                
                /* Override SLDS variables */
                --sds-c-button-brand-color-background: ${this.getSafeValue(this.primaryColor, '#22BDC1')};
                --sds-c-button-brand-text-color: white;
                --lwc-colorTextLink: ${this.getSafeValue(this.primaryColor, '#22BDC1')};
                
                /* More SLDS overrides as needed */
            }
            
            /* Basic style resets */
            .slds-button {
                transition: all 0.3s ease;
            }
            
            .slds-button:hover {
                transform: translateY(-2px);
            }
            
            /* Specific component overrides can be added here */
        `;
    }

    applyThemeVariablesToElement(element) {
        // Directly apply CSS variables to the element's style
        element.style.setProperty('--primary-color', this.getSafeValue(this.primaryColor, '#22BDC1'));
        element.style.setProperty('--accent-color', this.getSafeValue(this.accentColor, '#D5DF23'));
        element.style.setProperty('--text-color', this.getSafeValue(this.textColor, '#1d1d1f'));

        // Set more variables as needed
        if (this.themeName === 'dark') {
            element.style.setProperty('--background', '#1d1d1f');
            element.style.setProperty('--background-alt', '#2d2d2f');
            element.style.setProperty('--text-secondary', '#a1a1a6');
        } else {
            element.style.setProperty('--background', '#ffffff');
            element.style.setProperty('--background-alt', '#f5f5f7');
            element.style.setProperty('--text-secondary', '#6e6e73');
        }
    }

    applyStylesToOOTBComponents() {
        // Get the main document stylesheet to inject global styles
        try {
            // Create a style element for global SLDS overrides
            const globalStyle = document.createElement('style');
            globalStyle.id = 'nuvitek-global-theme-override';
            globalStyle.textContent = this.getGlobalOverrideStyles();
            document.head.appendChild(globalStyle);
        } catch (error) {
            console.error('Error applying global styles:', error);
        }
    }

    getGlobalOverrideStyles() {
        return `
            /* Global SLDS design token overrides */
            .THIS .slds-button_brand,
            .THIS .slds-button--brand,
            :host .slds-button_brand,
            :host .slds-button--brand,
            lightning-button.slds-button_brand,
            lightning-button.slds-button--brand {
                background-color: ${this.getSafeValue(this.primaryColor, '#22BDC1')} !important;
                border-color: ${this.getSafeValue(this.primaryColor, '#22BDC1')} !important;
            }
            
            /* Additional global overrides can be added here */
            .THIS .slds-card,
            :host .slds-card,
            lightning-card {
                border-radius: 12px !important;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
            }
            
            /* More comprehensive overrides would go here */
        `;
    }

    // Get full resource path with prefix
    getResourcePath(resourceName) {
        if (!resourceName || resourceName.trim() === '') return '';
        
        // Always use the format that works in your environment
        return `/sfsites/c/resource/${resourceName}`;
    }

    // Event handlers
    handleScroll() {
        if (window.scrollY > 20) {
            this.scrolled = true;
        } else {
            this.scrolled = false;
        }
    }

    handleResize() {
        // Handle responsive adjustments if needed
    }

    toggleMobileMenu() {
        this.mobileMenuOpen = !this.mobileMenuOpen;
    }

    handleFabClick() {
        if (this.fabUrl) {
            window.location.href = this.fabUrl;
        }
    }

    handleScrollDown() {
        // Get the height of the viewport
        const viewportHeight = window.innerHeight;

        // Scroll to just below the hero section
        window.scrollTo({
            top: viewportHeight,
            behavior: 'smooth'
        });
    }

    toggleHelpForm() {
        this.helpFormOpen = !this.helpFormOpen;
        this.formSubmitted = false;
    }

    handleHelpFormSubmit(event) {
        event.preventDefault();

        // Here you would typically call an apex method to submit the form
        // For now we'll just simulate a successful submission
        this.formSubmitted = true;
        this.formSubmissionMessage = 'Your help request has been submitted successfully! We\'ll get back to you soon.';

        // Reset form after 3 seconds
        setTimeout(() => {
            this.helpFormOpen = false;
            this.formSubmitted = false;
            // Reset the form fields
            const form = this.template.querySelector('.help-request-form');
            if (form) {
                form.reset();
            }
        }, 3000);
    }

    // Computed properties
    get currentYear() {
        return new Date().getFullYear();
    }

    get isHeroSplit() {
        return this.heroLayout === 'split';
    }

    get isHeroFullscreen() {
        return this.heroLayout === 'fullwidth';
    }

    get videoOverlayStyle() {
        return `background-color: rgba(0, 0, 0, ${this.backgroundVideoDarkness / 100});`;
    }

    get themeClass() {
        return `nuvitek-theme theme-${this.themeName}`;
    }

    get scrollIndicatorClass() {
        let classes = 'scroll-indicator';
        if (this.showBackgroundVideo) {
            classes += ' on-video-background';
        }
        return classes;
    }

    get headerClass() {
        let classes = 'site-header';
        if (this.scrolled) {
            classes += ' scrolled';
        }
        if (this.headerVariant) {
            classes += ` variant-${this.headerVariant}`;
        }
        return classes;
    }

    get headerStyle() {
        let style = '';
        if (this.headerSticky) {
            style += 'position: sticky; top: 0;';
        }
        return style;
    }

    get mobileMenuButtonClass() {
        return this.mobileMenuOpen ? 'menu-button active' : 'menu-button';
    }

    get mobileMenuClass() {
        return this.mobileMenuOpen ? 'mobile-menu open' : 'mobile-menu';
    }

    get heroSectionClass() {
        return `hero-section layout-${this.heroLayout}`;
    }

    // Update the shouldShowFooterColumns getter
    get shouldShowFooterColumns() {
        // Only show footer columns in multi-column style
        return this.footerStyle === 'multi-column';
    }

    // Update the standard style in the footer class
    get footerClass() {
        let classes = 'site-footer';
        if (this.footerStyle) {
            classes += ` style-${this.footerStyle}`;
        }
        return classes;
    }

    // Add this computed property to the JavaScript file
    get shouldShowHeader() {
        // Only check for content if using default header
        if (this.useDefaultHeader) {
            const hasNavigation = this.headerNavigationMenuName && this.headerNavigationMenuName.trim() !== '';
            const hasHeaderContent = hasNavigation || this.showProfileIcon || this.showSearchInHeader || 
                                   this.logoUrl || this.ensureHomeNavItem;
            return hasHeaderContent;
        }
        // Always return false for default header if not using it
        return false;
    }

    get themeStyle() {
        return `
            --primary-color: ${this.getSafeValue(this.primaryColor, '#22BDC1')};
            --accent-color: ${this.getSafeValue(this.accentColor, '#D5DF23')};
            --text-color: ${this.getSafeValue(this.textColor, '#1d1d1f')};
        `;
    }

    // Computed property for the subtitle style
    get heroSubtitleStyle() {
        const backgroundType = this.detectBackgroundBrightness();
        
        if (backgroundType === 'dark') {
            // Light text for dark backgrounds
            return 'color: rgba(255, 255, 255, 0.95); text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);';
        } else {
            // Dark text for light backgrounds
            return 'color: rgba(33, 33, 33, 0.95); text-shadow: none;';
        }
    }
    // For the background URL and other resource paths
    get heroBackgroundStyle() {
        let style = '';
        
        if (this.heroBackgroundImage && this.heroBackgroundImage.trim() !== '' && !this.showBackgroundVideo) {
            style += `background-image: url(${this.getResourcePath(this.heroBackgroundImage)});`;
            // Don't add a linear gradient here, we'll use the overlay div instead
        }
        
        return style;
    }

    // Update the heroOverlayStyle getter to handle both lightening and darkening
    get heroOverlayStyle() {
        // If 0, return no overlay
        if (this.heroBackgroundDarkness === 0) {
            return 'background: none;';
        }
        
        // Convert to opacity value (1% = 0.01, 100% = 1.0)
        const opacity = Math.abs(this.heroBackgroundDarkness) / 100;
        
        // If negative, darken with black overlay
        if (this.heroBackgroundDarkness < 0) {
            // Create a darker gradient for negative values
            return `background: linear-gradient(to bottom, rgba(0, 0, 0, ${opacity}), rgba(0, 0, 0, ${opacity * 1.2}));`;
        }
        
        // If positive, lighten with white overlay
        return `background: linear-gradient(to bottom, rgba(255, 255, 255, ${opacity}), rgba(255, 255, 255, ${opacity}));`;
    }
    
    // Update the detection method to determine text color based on overlay brightness
    detectBackgroundBrightness() {
        // Check overlay brightness - if higher than 30%, use dark text
        if (this.heroBackgroundDarkness > 30) {
            return 'light'; // This will make text dark (counter-intuitive but matches the logic)
        } else {
            return 'dark'; // This will make text light
        }
    }

    // Similarly for the video URL and fallback
    get resolvedVideoUrl() {
        return this.backgroundVideoUrl && this.backgroundVideoUrl.trim() !== '' ? 
            this.getResourcePath(this.backgroundVideoUrl) : '';
    }

    get resolvedFallbackUrl() {
        return this.backgroundVideoFallbackUrl && this.backgroundVideoFallbackUrl.trim() !== '' ? 
            this.getResourcePath(this.backgroundVideoFallbackUrl) : '';
    }

    // For the logo style
    get logoStyle() {
        if (this.logoUrl && this.logoUrl.trim() !== '') {
            return `background-image: url(${this.getResourcePath(this.logoUrl)});`;
        }
        return '';
    }

    get helpFormDialogClass() {
        return this.helpFormOpen ? 'help-form-dialog open' : 'help-form-dialog';
    }

    get backdropClass() {
        return this.helpFormOpen ? 'dialog-backdrop active' : 'dialog-backdrop';
    }

    get isMinimalFooter() {
        return this.footerStyle === 'minimal';
    }
}