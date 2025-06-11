({
    initializeComponent: function(component, helper) {
        // Initialize variables
        component.set('v.fabMenuOpen', false);
        component.set('v.llmAssistantOpen', false);
        component.set('v.helpFormOpen', false);
        component.set('v.scrolled', false);
        component.set('v.mobileMenuOpen', false);
        
        // Initialize footer column data if needed
        this.initColumnMenusData(component);
        
        // Process social links
        this.processSocialLinks(component);
    },
    
    setupScrollListener: function(component) {
        var self = this;
        
        // Define scroll handler
        var handleScroll = function() {
            if (window.scrollY > 20) {
                component.set('v.scrolled', true);
            } else {
                component.set('v.scrolled', false);
            }
            self.updateComputedProperties(component);
        };
        
        // Add scroll listener
        window.addEventListener('scroll', handleScroll);
        
        // Store reference for cleanup (if needed)
        component.set('v.scrollHandler', handleScroll);
    },
    
    loadNavigationData: function(component) {
        var headerMenuName = component.get('v.headerNavigationMenuName');
        var footerMenuName = component.get('v.footerNavigationMenuName');
        
        // Load header navigation
        if (headerMenuName) {
            this.getNavigationItems(component, headerMenuName, 'header');
        } else {
            component.set('v.isHeaderNavLoaded', true);
        }
        
        // Load footer navigation
        if (footerMenuName) {
            this.getNavigationItems(component, footerMenuName, 'footer');
        } else {
            component.set('v.isFooterNavLoaded', true);
        }
    },
    
    getNavigationItems: function(component, menuName, type) {
        var action = component.get('c.getNavigationItems');
        action.setParams({
            menuName: menuName
        });
        
        action.setCallback(this, function(response) {
            var state = response.getState();
            if (state === 'SUCCESS') {
                var data = response.getReturnValue();
                var processedItems = this.processNavItems(component, data, type === 'header');
                
                if (type === 'header') {
                    component.set('v.headerNavItems', processedItems);
                    component.set('v.isHeaderNavLoaded', true);
                } else {
                    component.set('v.footerNavItems', processedItems);
                    component.set('v.isFooterNavLoaded', true);
                    this.processFooterColumns(component);
                }
                
                this.updateComputedProperties(component);
            } else {
                console.error('Error loading navigation items:', response.getError());
                if (type === 'header') {
                    component.set('v.headerNavItems', []);
                    component.set('v.isHeaderNavLoaded', true);
                } else {
                    component.set('v.footerNavItems', []);
                    component.set('v.isFooterNavLoaded', true);
                }
            }
        });
        
        $A.enqueueAction(action);
    },
    
    processNavItems: function(component, navItems, isHeader) {
        if (!navItems || !navItems.menuItems) {
            return [];
        }
        
        var currentUrl = window.location.pathname;
        var hasHomeItem = false;
        var uniqueLabels = new Set();
        var uniqueUrls = new Set();
        
        var processedItems = [];
        
        navItems.menuItems.forEach(function(item) {
            var itemLabel = item.label ? item.label.toLowerCase() : '';
            var itemUrl = item.actionValue;
            
            // Skip duplicates
            if (uniqueLabels.has(itemLabel) || uniqueUrls.has(itemUrl)) {
                return;
            }
            
            // For footer, skip Home items
            if (!isHeader && (
                itemLabel === 'home' ||
                itemUrl === '/' ||
                (itemUrl && itemUrl.endsWith('/home'))
            )) {
                return;
            }
            
            // Add to tracking sets
            if (itemLabel) uniqueLabels.add(itemLabel);
            if (itemUrl) uniqueUrls.add(itemUrl);
            
            // Check if this is a home item
            if (itemLabel === 'home' ||
                itemUrl === '/' ||
                (itemUrl && itemUrl.endsWith('/home'))) {
                hasHomeItem = true;
            }
            
            // Determine if item is active
            var isActive = currentUrl === itemUrl || 
                          (itemUrl && itemUrl.length > 1 && currentUrl === itemUrl) ||
                          (itemUrl === '/' && (currentUrl === '/' || currentUrl.endsWith('/home')));
            
            var processedItem = {
                id: item.id || item.label,
                label: item.label,
                target: itemUrl,
                type: item.actionType,
                imageUrl: item.imageUrl,
                isActive: isActive,
                activeClass: isActive ? 'nav-item active' : 'nav-item',
                ariaCurrent: isActive ? 'page' : null,
                hasChildren: item.subMenu && item.subMenu.length > 0,
                children: item.subMenu ? this.processSubMenu(item.subMenu) : []
            };
            
            processedItems.push(processedItem);
        }.bind(this));
        
        // Add home item if needed (only for header)
        var ensureHomeNavItem = component.get('v.ensureHomeNavItem');
        if (isHeader && ensureHomeNavItem && !hasHomeItem) {
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
    
    processSubMenu: function(subMenu) {
        if (!subMenu || subMenu.length === 0) {
            return [];
        }
        
        var currentUrl = window.location.pathname;
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
    
    initColumnMenusData: function(component) {
        var footerColumnMenus = component.get('v.footerColumnMenus');
        if (!footerColumnMenus) {
            return;
        }
        
        var footerNavigationMenuName = component.get('v.footerNavigationMenuName');
        var menus = footerColumnMenus.split(',').map(function(menu) {
            return menu.trim();
        });
        
        // Process each menu that's different from the main footer menu
        menus.forEach(function(menuName, index) {
            if (menuName && menuName !== footerNavigationMenuName) {
                this.fetchMenuData(component, menuName, index);
            }
        }.bind(this));
    },
    
    fetchMenuData: function(component, menuName, columnIndex) {
        if (!menuName || menuName.trim() === '') {
            return;
        }
        
        var action = component.get('c.getNavigationItems');
        action.setParams({
            menuName: menuName.trim()
        });
        
        action.setCallback(this, function(response) {
            var state = response.getState();
            if (state === 'SUCCESS') {
                var data = response.getReturnValue();
                var processedItems = this.processNavItems(component, data, false);
                
                // Store in column-specific data structure
                var columnMenusData = component.get('v.columnMenusData') || {};
                columnMenusData[columnIndex] = processedItems;
                component.set('v.columnMenusData', columnMenusData);
                
                this.processFooterColumns(component);
            } else {
                console.error('Error loading menu for column ' + columnIndex + ':', response.getError());
            }
        });
        
        $A.enqueueAction(action);
    },
    
    processFooterColumns: function(component) {
        var footerColumnCount = component.get('v.footerColumnCount');
        var footerColumnTitles = component.get('v.footerColumnTitles') || 'Products, Resources, Company';
        var footerNavItems = component.get('v.footerNavItems');
        var columnMenusData = component.get('v.columnMenusData') || {};
        
        var titles = footerColumnTitles.split(',').map(function(title) {
            return title.trim();
        });
        
        var columns = [];
        for (var i = 0; i < footerColumnCount; i++) {
            var columnItems = [];
            
            // Check if we have specific menu data for this column
            if (columnMenusData[i]) {
                columnItems = columnMenusData[i];
            } else if (footerNavItems && footerNavItems.length > 0) {
                // Divide main items among columns
                var totalItems = footerNavItems.length;
                var itemsPerColumn = Math.ceil(totalItems / footerColumnCount);
                var startIndex = i * itemsPerColumn;
                var endIndex = Math.min(startIndex + itemsPerColumn, totalItems);
                
                columnItems = footerNavItems.slice(startIndex, endIndex);
            }
            
            var columnTitle = i < titles.length ? titles[i] : 'Column ' + (i + 1);
            
            columns.push({
                index: i,
                title: columnTitle,
                items: columnItems
            });
        }
        
        component.set('v.footerColumnsWithItems', columns);
        this.updateComputedProperties(component);
    },
    
    processSocialLinks: function(component) {
        var socialLinksCount = component.get('v.socialLinksCount');
        var socialLinkTitles = component.get('v.socialLinkTitles') || 'Facebook, Twitter, LinkedIn, Instagram';
        var socialLinkUrls = component.get('v.socialLinkUrls') || '';
        
        var titles = socialLinkTitles.split(',').map(function(title) {
            return title.trim();
        });
        
        var urls = socialLinkUrls ? socialLinkUrls.split(',').map(function(url) {
            return url.trim();
        }) : [];
        
        var links = [];
        for (var i = 0; i < socialLinksCount; i++) {
            var title = i < titles.length ? titles[i] : 'Social Link ' + (i + 1);
            var url = i < urls.length ? urls[i] : '';
            
            if (url && url.trim() !== '') {
                var iconType = this.getSocialIconType(title);
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
        
        component.set('v.socialLinks', links);
    },
    
    getSocialIconType: function(title) {
        var name = title.toLowerCase();
        if (name.includes('facebook')) return 'facebook';
        if (name.includes('twitter') || name.includes('x')) return 'twitter';
        if (name.includes('linkedin')) return 'linkedin';
        if (name.includes('instagram')) return 'instagram';
        if (name.includes('youtube')) return 'youtube';
        if (name.includes('pinterest')) return 'pinterest';
        if (name.includes('tiktok')) return 'tiktok';
        if (name.includes('github')) return 'github';
        return 'generic';
    },
    
    updateComputedProperties: function(component) {
        // Update theme class
        var themeName = component.get('v.themeName');
        component.set('v.themeClass', 'nuvitek-theme theme-' + themeName);
        
        // Update theme style
        var primaryColor = this.getSafeValue(component.get('v.primaryColor'), '#22BDC1');
        var accentColor = this.getSafeValue(component.get('v.accentColor'), '#D5DF23');
        var textColor = this.getSafeValue(component.get('v.textColor'), '#1d1d1f');
        
        var themeStyle = '--primary-color: ' + primaryColor + '; ' +
                        '--accent-color: ' + accentColor + '; ' +
                        '--text-color: ' + textColor + ';';
        component.set('v.themeStyle', themeStyle);
        
        // Update header class
        var scrolled = component.get('v.scrolled');
        var headerVariant = component.get('v.headerVariant');
        var headerClass = 'site-header';
        if (scrolled) headerClass += ' scrolled';
        if (headerVariant) headerClass += ' variant-' + headerVariant;
        component.set('v.headerClass', headerClass);
        
        // Update header style
        var headerSticky = component.get('v.headerSticky');
        var headerStyle = headerSticky ? 'position: sticky; top: 0;' : '';
        component.set('v.headerStyle', headerStyle);
        
        // Update header container style
        var headerContainerWidth = component.get('v.headerContainerWidth') || 100;
        component.set('v.headerContainerStyle', '--header-container-width: ' + headerContainerWidth + '%;');
        
        // Update logo style
        var logoUrl = component.get('v.logoUrl');
        var logoStyle = '';
        if (logoUrl && logoUrl.trim() !== '') {
            logoStyle = 'background-image: url(' + this.getResourcePath(logoUrl) + ');';
        }
        component.set('v.logoStyle', logoStyle);
        
        // Update hero properties
        var heroLayout = component.get('v.heroLayout');
        component.set('v.isHeroSplit', heroLayout === 'split');
        component.set('v.isHeroFullscreen', heroLayout === 'fullwidth');
        component.set('v.heroSectionClass', 'hero-section layout-' + heroLayout);
        
        // Update hero background style
        var heroBackgroundImage = component.get('v.heroBackgroundImage');
        var showBackgroundVideo = component.get('v.showBackgroundVideo');
        var heroBackgroundStyle = '';
        if (heroBackgroundImage && heroBackgroundImage.trim() !== '' && !showBackgroundVideo) {
            heroBackgroundStyle = 'background-image: url(' + this.getResourcePath(heroBackgroundImage) + ');';
        }
        component.set('v.heroBackgroundStyle', heroBackgroundStyle);
        
        // Update hero overlay style
        var heroBackgroundDarkness = component.get('v.heroBackgroundDarkness') || 0;
        var heroOverlayStyle = this.getHeroOverlayStyle(heroBackgroundDarkness);
        component.set('v.heroOverlayStyle', heroOverlayStyle);
        
        // Update hero subtitle style
        var heroSubtitleStyle = this.getHeroSubtitleStyle(heroBackgroundDarkness);
        component.set('v.heroSubtitleStyle', heroSubtitleStyle);
        
        // Update video overlay style
        var backgroundVideoDarkness = component.get('v.backgroundVideoDarkness') || 35;
        var videoOverlayStyle = 'background-color: rgba(0, 0, 0, ' + (backgroundVideoDarkness / 100) + ');';
        component.set('v.videoOverlayStyle', videoOverlayStyle);
        
        // Update footer properties
        var footerStyle = component.get('v.footerStyle');
        component.set('v.isMinimalFooter', footerStyle === 'minimal');
        component.set('v.shouldShowFooterColumns', footerStyle === 'multi-column');
        component.set('v.footerClass', 'site-footer style-' + footerStyle);
        
        // Update footer columns style
        var footerColumnsStyle = this.getFooterColumnsStyle(component);
        component.set('v.footerColumnsStyle', footerColumnsStyle);
        
        // Update mobile menu classes
        var mobileMenuOpen = component.get('v.mobileMenuOpen');
        component.set('v.mobileMenuButtonClass', mobileMenuOpen ? 'menu-button active' : 'menu-button');
        component.set('v.mobileMenuClass', mobileMenuOpen ? 'mobile-menu open' : 'mobile-menu');
        
        // Update FAB classes
        var fabMenuOpen = component.get('v.fabMenuOpen');
        var helpFormOpen = component.get('v.helpFormOpen');
        var llmAssistantOpen = component.get('v.llmAssistantOpen');
        
        component.set('v.fabMenuClass', fabMenuOpen ? 'fab-menu open' : 'fab-menu');
        component.set('v.helpFormDialogClass', helpFormOpen ? 'dialog support-requester-dialog open' : 'dialog support-requester-dialog');
        component.set('v.llmAssistantDialogClass', llmAssistantOpen ? 'help-form-dialog open' : 'help-form-dialog');
        component.set('v.backdropClass', (helpFormOpen || llmAssistantOpen) ? 'dialog-backdrop active' : 'dialog-backdrop');
        
        // Update scroll indicator class
        var showBackgroundVideo = component.get('v.showBackgroundVideo');
        var scrollIndicatorClass = 'scroll-indicator';
        if (showBackgroundVideo) {
            scrollIndicatorClass += ' on-video-background';
        }
        component.set('v.scrollIndicatorClass', scrollIndicatorClass);
        
        // Update shouldShowHeader
        var useDefaultHeader = component.get('v.useDefaultHeader');
        var shouldShowHeader = false;
        if (useDefaultHeader) {
            var headerNavigationMenuName = component.get('v.headerNavigationMenuName');
            var showProfileIcon = component.get('v.showProfileIcon');
            var showSearchInHeader = component.get('v.showSearchInHeader');
            var logoUrl = component.get('v.logoUrl');
            var ensureHomeNavItem = component.get('v.ensureHomeNavItem');
            
            var hasNavigation = headerNavigationMenuName && headerNavigationMenuName.trim() !== '';
            var hasHeaderContent = hasNavigation || showProfileIcon || showSearchInHeader || logoUrl || ensureHomeNavItem;
            shouldShowHeader = hasHeaderContent;
        }
        component.set('v.shouldShowHeader', shouldShowHeader);
    },
    
    getFooterColumnsStyle: function(component) {
        var footerStyle = component.get('v.footerStyle');
        var footerColumnCount = component.get('v.footerColumnCount');
        
        if (footerStyle === 'minimal' || footerStyle === 'standard') {
            return 'display: flex; justify-content: center; flex-wrap: wrap; gap: var(--spacing-lg);';
        } else {
            return 'grid-template-columns: repeat(' + footerColumnCount + ', 1fr);';
        }
    },
    
    getHeroOverlayStyle: function(heroBackgroundDarkness) {
        if (heroBackgroundDarkness === 0) {
            return 'background: none;';
        }
        
        var opacity = Math.abs(heroBackgroundDarkness) / 100;
        
        if (heroBackgroundDarkness < 0) {
            return 'background: linear-gradient(to bottom, rgba(0, 0, 0, ' + opacity + '), rgba(0, 0, 0, ' + (opacity * 1.2) + '));';
        }
        
        return 'background: linear-gradient(to bottom, rgba(255, 255, 255, ' + opacity + '), rgba(255, 255, 255, ' + opacity + '));';
    },
    
    getHeroSubtitleStyle: function(heroBackgroundDarkness) {
        if (heroBackgroundDarkness > 30) {
            return 'color: rgba(33, 33, 33, 0.95); text-shadow: none;';
        } else {
            return 'color: rgba(255, 255, 255, 0.95); text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);';
        }
    },
    
    getSafeValue: function(value, defaultValue) {
        if (value === null || value === undefined || value === 'null' || value === 'undefined' || value === '') {
            return defaultValue || '';
        }
        return value;
    },
    
    getResourcePath: function(resourceName) {
        if (!resourceName || resourceName.trim() === '') {
            return '';
        }
        
        return '/sfsites/c/resource/' + resourceName;
    },
    
    performSearch: function(component, searchTerm, searchObjects) {
        var action = component.get('c.searchAcrossObjects');
        action.setParams({
            searchTerm: searchTerm,
            objectsToSearch: searchObjects
        });
        
        action.setCallback(this, function(response) {
            var state = response.getState();
            component.set('v.isSearching', false);
            
            if (state === 'SUCCESS') {
                var results = response.getReturnValue();
                component.set('v.searchResults', results);
            } else {
                console.error('Error performing search:', response.getError());
                component.set('v.searchResults', []);
            }
        });
        
        $A.enqueueAction(action);
    },
    
    navigateToUrl: function(component, type, target) {
        if (type === 'InternalLink') {
            var urlEvent = $A.get("e.force:navigateToURL");
            urlEvent.setParams({
                "url": target
            });
            urlEvent.fire();
        } else if (type === 'ExternalLink') {
            window.open(target, '_blank');
        } else {
            // Default fallback
            var urlEvent = $A.get("e.force:navigateToURL");
            urlEvent.setParams({
                "url": target
            });
            urlEvent.fire();
        }
    },
    
    navigateToRecord: function(component, recordId, objectType) {
        var navEvent = $A.get("e.force:navigateToSObject");
        navEvent.setParams({
            "recordId": recordId,
            "slideDevName": "detail"
        });
        navEvent.fire();
    },
    
    applyThemeStyles: function(component) {
        var applyThemeToSlots = component.get('v.applyThemeToSlots');
        var globalThemeOverride = component.get('v.globalThemeOverride');
        
        if (applyThemeToSlots) {
            this.applyThemeToSlottedContent(component);
        }
        
        if (globalThemeOverride) {
            this.applyStylesToOOTBComponents(component);
        }
    },
    
    applyThemeToSlottedContent: function(component) {
        // Apply theme variables to slotted content and facets
        try {
            // Target all themed containers and their children
            var themedContainers = component.getElement().querySelectorAll('.nuvitek-themed-component, .nuvitek-themed-header, .nuvitek-themed-footer');
            
            themedContainers.forEach(function(container) {
                this.applyThemeVariablesToElement(component, container);
                
                // Also apply to any child components within the facets
                var childComponents = container.querySelectorAll('*');
                childComponents.forEach(function(child) {
                    this.applyThemeVariablesToElement(component, child);
                }.bind(this));
            }.bind(this));
            
            // Apply to any Aura components as well
            var auraComponents = component.getElement().querySelectorAll('[data-aura-class]');
            auraComponents.forEach(function(auraComp) {
                auraComp.classList.add('nuvitek-themed-component');
                this.applyThemeVariablesToElement(component, auraComp);
            }.bind(this));
        } catch (error) {
            console.error('Error applying theme to slotted content:', error);
        }
    },
    
    applyStylesToOOTBComponents: function(component) {
        try {
            var globalStyle = document.createElement('style');
            globalStyle.id = 'nuvitek-global-theme-override';
            globalStyle.textContent = this.getGlobalOverrideStyles(component);
            document.head.appendChild(globalStyle);
        } catch (error) {
            console.error('Error applying global styles:', error);
        }
    },
    
    applyThemeVariablesToElement: function(component, element) {
        var primaryColor = this.getSafeValue(component.get('v.primaryColor'), '#22BDC1');
        var accentColor = this.getSafeValue(component.get('v.accentColor'), '#D5DF23');
        var textColor = this.getSafeValue(component.get('v.textColor'), '#1d1d1f');
        var themeName = component.get('v.themeName');
        
        element.style.setProperty('--primary-color', primaryColor);
        element.style.setProperty('--accent-color', accentColor);
        element.style.setProperty('--text-color', textColor);
        
        if (themeName === 'dark') {
            element.style.setProperty('--background', '#1d1d1f');
            element.style.setProperty('--background-alt', '#2d2d2f');
            element.style.setProperty('--text-secondary', '#a1a1a6');
        } else {
            element.style.setProperty('--background', '#ffffff');
            element.style.setProperty('--background-alt', '#f5f5f7');
            element.style.setProperty('--text-secondary', '#6e6e73');
        }
    },
    
    getGlobalOverrideStyles: function(component) {
        var primaryColor = this.getSafeValue(component.get('v.primaryColor'), '#22BDC1');
        
        return `
            .THIS .slds-button_brand,
            .THIS .slds-button--brand,
            :host .slds-button_brand,
            :host .slds-button--brand,
            lightning-button.slds-button_brand,
            lightning-button.slds-button--brand {
                background-color: ${primaryColor} !important;
                border-color: ${primaryColor} !important;
            }
            
            .THIS .slds-card,
            :host .slds-card,
            lightning-card {
                border-radius: 12px !important;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08) !important;
            }
        `;
    },
    
})