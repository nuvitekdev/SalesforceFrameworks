({
    /**
     * Initialize component on load
     */
    doInit : function(component, event, helper) {
        // Set current year for footer
        component.set('v.currentYear', new Date().getFullYear());
        
        // Load navigation data
        helper.loadNavigationData(component);
        
        // Setup scroll listener
        helper.setupScrollListener(component);
        
        // Initialize theme settings
        helper.applyThemeSettings(component);
    },
    
    /**
     * Handle component render
     */
    onRender : function(component, event, helper) {
        // Apply theme to slotted content if enabled
        if (component.get('v.applyThemeToSlots')) {
            helper.applyThemeToSlottedContent(component);
        }
        
        // Apply global theme overrides if enabled
        if (component.get('v.globalThemeOverride')) {
            helper.applyGlobalThemeOverrides(component);
        }
    },
    
    /**
     * Toggle mobile menu
     */
    toggleMobileMenu : function(component, event, helper) {
        var isOpen = component.get('v.mobileMenuOpen');
        component.set('v.mobileMenuOpen', !isOpen);
    },
    
    /**
     * Handle navigation item click
     */
    handleNavItemClick : function(component, event, helper) {
        event.preventDefault();
        
        var target = event.currentTarget.dataset.target;
        var type = event.currentTarget.dataset.type;
        
        helper.navigateToTarget(component, target, type);
        
        // Close mobile menu if open
        if (component.get('v.mobileMenuOpen')) {
            component.set('v.mobileMenuOpen', false);
        }
    },
    
    /**
     * Handle search input keyup
     */
    handleSearchKeyup : function(component, event, helper) {
        if (event.keyCode === 13) { // Enter key
            helper.performSearch(component, event);
        } else if (event.target.value.trim().length >= 2) {
            // Auto-search on typing
            helper.performSearch(component, event);
        } else if (event.target.value.trim().length === 0) {
            component.set('v.showSearchResults', false);
            component.set('v.searchResults', []);
        }
    },
    
    /**
     * Handle search button click
     */
    handleSearch : function(component, event, helper) {
        helper.performSearch(component, event);
    },
    
    /**
     * Close search results
     */
    closeSearchResults : function(component, event, helper) {
        component.set('v.showSearchResults', false);
    },
    
    /**
     * Handle search result click
     */
    handleResultClick : function(component, event, helper) {
        var recordId = event.currentTarget.dataset.id;
        var objectType = event.currentTarget.dataset.objectType;
        
        // Navigate to record
        var navEvt = $A.get("e.force:navigateToSObject");
        navEvt.setParams({
            "recordId": recordId
        });
        navEvt.fire();
        
        // Close search results
        component.set('v.showSearchResults', false);
        
        // Clear search input
        var searchInput = component.find('searchInput');
        if (searchInput) {
            searchInput.set('v.value', '');
        }
    },
    
    /**
     * Handle scroll down button click
     */
    handleScrollDown : function(component, event, helper) {
        // Scroll to below hero section
        window.scrollTo({
            top: window.innerHeight,
            behavior: 'smooth'
        });
    },
    
    /**
     * Handle FAB button click
     */
    handleFabClick : function(component, event, helper) {
        var fabOptions = component.get('v.fabOptions');
        var fabUrl = component.get('v.fabUrl');
        
        if (fabOptions === 'url_link' && fabUrl) {
            window.location.href = fabUrl;
        } else if (fabOptions === 'help_form') {
            helper.toggleHelpForm(component);
        } else if (fabOptions === 'ai_assistant') {
            helper.toggleLlmAssistant(component);
        } else {
            // Toggle menu for 'both' option
            helper.toggleFabMenu(component);
        }
    },
    
    /**
     * Toggle help form
     */
    toggleHelpForm : function(component, event, helper) {
        helper.toggleHelpForm(component);
    },
    
    /**
     * Toggle LLM Assistant
     */
    toggleLlmAssistant : function(component, event, helper) {
        helper.toggleLlmAssistant(component);
    },
    
    /**
     * Close all dialogs
     */
    closeAllDialogs : function(component, event, helper) {
        component.set('v.fabMenuOpen', false);
        component.set('v.helpFormOpen', false);
        component.set('v.llmAssistantOpen', false);
    },
    
    /**
     * Handle scroll events
     */
    handleScroll : function(component, event, helper) {
        var scrolled = window.scrollY > 20;
        component.set('v.scrolled', scrolled);
    },
    
    /**
     * Get hero overlay style
     */
    getHeroOverlayStyle : function(component) {
        var darkness = component.get('v.heroBackgroundDarkness');
        
        if (darkness === 0) {
            return 'background: none;';
        }
        
        var opacity = Math.abs(darkness) / 100;
        
        if (darkness < 0) {
            // Darken with black overlay
            return 'background: linear-gradient(to bottom, rgba(0, 0, 0, ' + opacity + '), rgba(0, 0, 0, ' + (opacity * 1.2) + '));';
        }
        
        // Lighten with white overlay
        return 'background: linear-gradient(to bottom, rgba(255, 255, 255, ' + opacity + '), rgba(255, 255, 255, ' + opacity + '));';
    },
    
    /**
     * Get main FAB icon based on options
     */
    getMainFabIcon : function(component) {
        var fabOptions = component.get('v.fabOptions');
        
        if (fabOptions === 'url_link') {
            return 'utility:add';
        } else if (fabOptions === 'help_form') {
            return component.get('v.helpFormIcon');
        } else if (fabOptions === 'ai_assistant') {
            return component.get('v.aiAssistantIcon');
        } else {
            // Default plus icon for menu
            return 'utility:add';
        }
    },
    
    /**
     * Get footer columns style
     */
    getFooterColumnsStyle : function(component) {
        var footerStyle = component.get('v.footerStyle');
        
        if (footerStyle === 'minimal' || footerStyle === 'standard') {
            return 'display: flex; justify-content: center; flex-wrap: wrap; gap: var(--spacing-lg);';
        } else {
            var columnCount = component.get('v.footerColumnCount');
            return 'grid-template-columns: repeat(' + columnCount + ', 1fr);';
        }
    },
    
    /**
     * Get footer columns data
     */
    getFooterColumns : function(component) {
        return component.get('v.footerColumns') || [];
    },
    
    /**
     * Get social links
     */
    getSocialLinks : function(component) {
        var socialLinksCount = component.get('v.socialLinksCount');
        var socialLinkTitles = component.get('v.socialLinkTitles').split(',');
        var socialLinkUrls = component.get('v.socialLinkUrls').split(',');
        var links = [];
        
        for (var i = 0; i < socialLinksCount; i++) {
            var title = socialLinkTitles[i] ? socialLinkTitles[i].trim() : '';
            var url = socialLinkUrls[i] ? socialLinkUrls[i].trim() : '';
            
            if (url) {
                links.push({
                    title: title,
                    url: url,
                    iconName: helper.getSocialIconName(title)
                });
            }
        }
        
        return links;
    }
}) 