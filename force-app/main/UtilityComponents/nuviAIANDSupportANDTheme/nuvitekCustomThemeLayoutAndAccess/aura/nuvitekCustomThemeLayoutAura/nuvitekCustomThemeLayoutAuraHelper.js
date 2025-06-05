({
    /**
     * Load navigation data for header and footer
     */
    loadNavigationData : function(component) {
        var headerMenuName = component.get('v.headerNavigationMenuName');
        var footerMenuName = component.get('v.footerNavigationMenuName');
        
        // Load header navigation
        if (headerMenuName) {
            this.loadNavigationMenu(component, headerMenuName, true);
        } else {
            component.set('v.isHeaderNavLoaded', true);
        }
        
        // Load footer navigation
        if (footerMenuName) {
            this.loadNavigationMenu(component, footerMenuName, false);
        } else {
            component.set('v.isFooterNavLoaded', true);
        }
    },
    
    /**
     * Load navigation menu items
     */
    loadNavigationMenu : function(component, menuName, isHeader) {
        var action = component.get("c.getNavigationItems");
        action.setParams({
            menuName: menuName
        });
        
        action.setCallback(this, function(response) {
            var state = response.getState();
            if (state === "SUCCESS") {
                var navItems = response.getReturnValue();
                var processedItems = this.processNavItems(component, navItems, isHeader);
                
                if (isHeader) {
                    component.set('v.headerNavItems', processedItems);
                    component.set('v.isHeaderNavLoaded', true);
                } else {
                    component.set('v.footerNavItems', processedItems);
                    component.set('v.isFooterNavLoaded', true);
                    // Recompute footer columns with the loaded nav items
                    this.computeFooterColumns(component);
                }
            } else {
                console.error('Error loading navigation items:', response.getError());
                if (isHeader) {
                    component.set('v.isHeaderNavLoaded', true);
                } else {
                    component.set('v.isFooterNavLoaded', true);
                }
            }
        });
        
        $A.enqueueAction(action);
    },
    
    /**
     * Process navigation items
     */
    processNavItems : function(component, navData, isHeader) {
        if (!navData || !navData.menuItems) return [];
        
        var currentUrl = window.location.pathname;
        var processedItems = [];
        var hasHomeItem = false;
        
        navData.menuItems.forEach(function(item) {
            // Skip home items in footer
            if (!isHeader && (
                item.label.toLowerCase() === 'home' ||
                item.actionValue === '/' ||
                (item.actionValue && item.actionValue.endsWith('/home'))
            )) {
                return;
            }
            
            // Check if this is home
            if (item.label.toLowerCase() === 'home' ||
                item.actionValue === '/' ||
                (item.actionValue && item.actionValue.endsWith('/home'))) {
                hasHomeItem = true;
            }
            
            var isActive = currentUrl === item.actionValue ||
                          (item.actionValue && item.actionValue.length > 1 && currentUrl === item.actionValue) ||
                          (item.actionValue === '/' && (currentUrl === '/' || currentUrl.endsWith('/home')));
            
            var processedItem = {
                id: item.id || item.label,
                label: item.label,
                target: item.actionValue,
                type: item.actionType,
                imageUrl: item.imageUrl,
                isActive: isActive,
                activeClass: isActive ? 'nav-item active' : 'nav-item',
                ariaCurrent: isActive ? 'page' : null,
                hasChildren: item.subMenu && item.subMenu.length > 0,
                children: item.subMenu ? this.processSubMenu(item.subMenu, currentUrl) : []
            };
            
            processedItems.push(processedItem);
        }, this);
        
        // Add home item if needed for header
        if (isHeader && component.get('v.ensureHomeNavItem') && !hasHomeItem) {
            var homeItem = {
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
            processedItems.unshift(homeItem);
        }
        
        return processedItems;
    },
    
    /**
     * Process submenu items
     */
    processSubMenu : function(subMenu, currentUrl) {
        if (!subMenu || subMenu.length === 0) return [];
        
        return subMenu.map(function(item) {
            var isActive = currentUrl.includes(item.actionValue);
            
            return {
                id: item.id || item.label,
                label: item.label,
                target: item.actionValue,
                type: item.actionType,
                imageUrl: item.imageUrl,
                isActive: isActive,
                activeClass: isActive ? 'nav-dropdown-item active' : 'nav-dropdown-item',
                ariaCurrent: isActive ? 'page' : null,
                hasChildren: false
            };
        });
    },
    
    /**
     * Navigate to target URL
     */
    navigateToTarget : function(component, target, type) {
        if (!target || !type) return;
        
        if (type === 'InternalLink') {
            var urlEvent = $A.get("e.force:navigateToURL");
            urlEvent.setParams({
                "url": target
            });
            urlEvent.fire();
        } else if (type === 'ExternalLink') {
            window.open(target, '_blank');
        } else {
            // Default navigation
            var urlEvent = $A.get("e.force:navigateToURL");
            urlEvent.setParams({
                "url": target
            });
            urlEvent.fire();
        }
    },
    
    /**
     * Perform search
     */
    performSearch : function(component, event) {
        var searchInput = event.target;
        var searchTerm = searchInput.value.trim();
        var objectsToSearch = searchInput.dataset.searchObjects || component.get('v.searchObjects');
        
        if (searchTerm.length >= 2) {
            component.set('v.isSearching', true);
            component.set('v.showSearchResults', true);
            
            var action = component.get("c.searchAcrossObjects");
            action.setParams({
                searchTerm: searchTerm,
                objectsToSearch: objectsToSearch
            });
            
            action.setCallback(this, function(response) {
                var state = response.getState();
                if (state === "SUCCESS") {
                    component.set('v.searchResults', response.getReturnValue());
                } else {
                    console.error('Search error:', response.getError());
                    component.set('v.searchResults', []);
                }
                component.set('v.isSearching', false);
            });
            
            $A.enqueueAction(action);
        } else {
            component.set('v.showSearchResults', false);
            component.set('v.searchResults', []);
        }
    },
    
    /**
     * Setup scroll listener
     */
    setupScrollListener : function(component) {
        var self = this;
        window.addEventListener('scroll', function() {
            var scrolled = window.scrollY > 20;
            component.set('v.scrolled', scrolled);
        });
    },
    
    /**
     * Apply theme settings
     */
    applyThemeSettings : function(component) {
        // Apply CSS variables to the component element
        var element = component.getElement();
        if (element) {
            element.style.setProperty('--primary-color', component.get('v.primaryColor'));
            element.style.setProperty('--accent-color', component.get('v.accentColor'));
            element.style.setProperty('--text-color', component.get('v.textColor'));
        }
    },
    
    /**
     * Apply theme to slotted content
     */
    applyThemeToSlottedContent : function(component) {
        // In Aura, we can't directly access slotted content
        // But we can add classes to the component that will cascade
        var element = component.getElement();
        if (element) {
            element.classList.add('nuvitek-themed-component');
        }
    },
    
    /**
     * Apply global theme overrides
     */
    applyGlobalThemeOverrides : function(component) {
        // Create a style element for global overrides
        var styleId = 'nuvitek-global-theme-override';
        var existingStyle = document.getElementById(styleId);
        
        if (!existingStyle) {
            var styleElement = document.createElement('style');
            styleElement.id = styleId;
            styleElement.textContent = this.getGlobalOverrideStyles(component);
            document.head.appendChild(styleElement);
        }
    },
    
    /**
     * Get global override styles
     */
    getGlobalOverrideStyles : function(component) {
        var primaryColor = component.get('v.primaryColor');
        
        return `
            /* Global SLDS design token overrides */
            .THIS .slds-button_brand,
            .THIS .slds-button--brand {
                background-color: ${primaryColor} !important;
                border-color: ${primaryColor} !important;
            }
            
            .THIS .slds-card {
                border-radius: 12px !important;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
            }
        `;
    },
    
    /**
     * Toggle help form
     */
    toggleHelpForm : function(component) {
        var isOpen = component.get('v.helpFormOpen');
        component.set('v.helpFormOpen', !isOpen);
        
        if (!isOpen) {
            component.set('v.fabMenuOpen', false);
            component.set('v.llmAssistantOpen', false);
        }
    },
    
    /**
     * Toggle LLM Assistant
     */
    toggleLlmAssistant : function(component) {
        var isOpen = component.get('v.llmAssistantOpen');
        component.set('v.llmAssistantOpen', !isOpen);
        
        if (!isOpen) {
            component.set('v.fabMenuOpen', false);
            component.set('v.helpFormOpen', false);
        }
    },
    
    /**
     * Toggle FAB menu
     */
    toggleFabMenu : function(component) {
        var fabOptions = component.get('v.fabOptions');
        
        if (fabOptions !== 'both') {
            // For single option modes, directly trigger that option
            if (fabOptions === 'help_form') {
                this.toggleHelpForm(component);
            } else if (fabOptions === 'ai_assistant') {
                this.toggleLlmAssistant(component);
            }
            return;
        }
        
        var isOpen = component.get('v.fabMenuOpen');
        component.set('v.fabMenuOpen', !isOpen);
        
        if (!isOpen) {
            component.set('v.helpFormOpen', false);
            component.set('v.llmAssistantOpen', false);
        }
    },
    
    /**
     * Initialize footer columns
     */
    initializeFooterColumns : function(component) {
        var columnCount = component.get('v.footerColumnCount');
        var columnTitles = component.get('v.footerColumnTitles').split(',');
        var columnMenus = component.get('v.footerColumnMenus').split(',');
        var footerNavItems = component.get('v.footerNavItems') || [];
        
        var columns = [];
        
        for (var i = 0; i < columnCount; i++) {
            var title = columnTitles[i] ? columnTitles[i].trim() : 'Column ' + (i + 1);
            var menuName = columnMenus[i] ? columnMenus[i].trim() : '';
            
            var columnItems = [];
            
            if (menuName && menuName !== component.get('v.footerNavigationMenuName')) {
                // Load specific menu for this column
                this.loadColumnMenu(component, menuName, i);
            } else {
                // Use items from main footer navigation
                if (footerNavItems.length > 0) {
                    var itemsPerColumn = Math.ceil(footerNavItems.length / columnCount);
                    var startIndex = i * itemsPerColumn;
                    var endIndex = Math.min(startIndex + itemsPerColumn, footerNavItems.length);
                    columnItems = footerNavItems.slice(startIndex, endIndex);
                }
            }
            
            columns.push({
                index: i,
                title: title,
                menuName: menuName,
                items: columnItems
            });
        }
        
        component.set('v.footerColumns', columns);
    },
    
    /**
     * Load specific menu for footer column
     */
    loadColumnMenu : function(component, menuName, columnIndex) {
        var action = component.get("c.getNavigationItems");
        action.setParams({
            menuName: menuName
        });
        
        action.setCallback(this, function(response) {
            var state = response.getState();
            if (state === "SUCCESS") {
                var navItems = response.getReturnValue();
                var processedItems = this.processNavItems(component, navItems, false);
                
                // Update the specific column
                var columns = component.get('v.footerColumns');
                if (columns[columnIndex]) {
                    columns[columnIndex].items = processedItems;
                    component.set('v.footerColumns', columns);
                }
            }
        });
        
        $A.enqueueAction(action);
    },
    
    /**
     * Get social icon name based on platform
     */
    getSocialIconName : function(title) {
        var name = title.toLowerCase();
        
        if (name.includes('facebook')) return 'utility:socialshare';
        if (name.includes('twitter') || name.includes('x')) return 'utility:socialshare';
        if (name.includes('linkedin')) return 'utility:socialshare';
        if (name.includes('instagram')) return 'utility:socialshare';
        if (name.includes('youtube')) return 'utility:video';
        if (name.includes('pinterest')) return 'utility:socialshare';
        
        return 'utility:world';
    },
    
    /**
     * Compute dynamic values for the component
     */
    computeDynamicValues : function(component) {
        // Compute hero overlay style
        this.computeHeroOverlayStyle(component);
        
        // Compute footer columns style
        this.computeFooterColumnsStyle(component);
        
        // Compute footer columns
        this.computeFooterColumns(component);
        
        // Compute social links
        this.computeSocialLinks(component);
        
        // Compute main FAB icon
        this.computeMainFabIcon(component);
        
        // Watch for changes to recompute values
        this.setupValueChangeHandlers(component);
    },
    
    /**
     * Setup handlers to recompute values when attributes change
     */
    setupValueChangeHandlers : function(component) {
        // In Aura, we need to use change handlers on attributes
        // These would be defined in the component markup with aura:handler
        // For now, we'll call the compute methods when values change
        // This can be enhanced by adding specific handlers in the component
    },
    
    /**
     * Compute hero overlay style
     */
    computeHeroOverlayStyle : function(component) {
        var darkness = component.get('v.heroBackgroundDarkness');
        var style = '';
        
        if (darkness === 0) {
            style = 'background: none;';
        } else {
            var opacity = Math.abs(darkness) / 100;
            
            if (darkness < 0) {
                // Darken with black overlay
                style = 'background: linear-gradient(to bottom, rgba(0, 0, 0, ' + opacity + '), rgba(0, 0, 0, ' + (opacity * 1.2) + '));';
            } else {
                // Lighten with white overlay
                style = 'background: linear-gradient(to bottom, rgba(255, 255, 255, ' + opacity + '), rgba(255, 255, 255, ' + opacity + '));';
            }
        }
        
        component.set('v.heroOverlayStyle', style);
    },
    
    /**
     * Compute main FAB icon
     */
    computeMainFabIcon : function(component) {
        var fabOptions = component.get('v.fabOptions');
        var icon = 'utility:add';
        
        if (fabOptions === 'url_link') {
            icon = 'utility:add';
        } else if (fabOptions === 'help_form') {
            icon = component.get('v.helpFormIcon');
        } else if (fabOptions === 'ai_assistant') {
            icon = component.get('v.aiAssistantIcon');
        }
        
        component.set('v.mainFabIcon', icon);
    },
    
    /**
     * Compute footer columns style
     */
    computeFooterColumnsStyle : function(component) {
        var footerStyle = component.get('v.footerStyle');
        var style = '';
        
        if (footerStyle === 'minimal' || footerStyle === 'standard') {
            style = 'display: flex; justify-content: center; flex-wrap: wrap; gap: var(--spacing-lg);';
        } else {
            var columnCount = component.get('v.footerColumnCount');
            style = 'grid-template-columns: repeat(' + columnCount + ', 1fr);';
        }
        
        component.set('v.footerColumnsStyle', style);
    },
    
    /**
     * Compute footer columns
     */
    computeFooterColumns : function(component) {
        var columnCount = component.get('v.footerColumnCount');
        var columnTitles = component.get('v.footerColumnTitles').split(',');
        var footerNavItems = component.get('v.footerNavItems') || [];
        var columns = [];
        
        for (var i = 0; i < columnCount; i++) {
            var title = columnTitles[i] ? columnTitles[i].trim() : 'Column ' + (i + 1);
            var columnItems = [];
            
            // Divide footer nav items among columns
            if (footerNavItems.length > 0) {
                var itemsPerColumn = Math.ceil(footerNavItems.length / columnCount);
                var startIndex = i * itemsPerColumn;
                var endIndex = Math.min(startIndex + itemsPerColumn, footerNavItems.length);
                columnItems = footerNavItems.slice(startIndex, endIndex);
            }
            
            columns.push({
                index: i,
                title: title,
                items: columnItems
            });
        }
        
        component.set('v.footerColumns', columns);
    },
    
    /**
     * Compute social links
     */
    computeSocialLinks : function(component) {
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
                    iconName: this.getSocialIconName(title)
                });
            }
        }
        
        component.set('v.socialLinks', links);
    }
}) 