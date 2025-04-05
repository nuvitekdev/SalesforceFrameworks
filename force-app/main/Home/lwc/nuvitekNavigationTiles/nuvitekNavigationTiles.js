// nuvitekNavigationTiles.js
import { LightningElement, api, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

// Import Apex methods
import getAccessTypesForApp from '@salesforce/apex/NuvitekAccessRequestController.getAccessTypesForApp';
import createAccessRequest from '@salesforce/apex/NuvitekAccessRequestController.createAccessRequest';

export default class NuvitekNavigationTiles extends NavigationMixin(LightningElement) {
    @api columns = 3; // Default number of columns
    @api tileStyle = 'elevated'; // Default style for all tiles
    
    // Comma-delimited list properties
    @api titles = '';
    @api descriptions = '';
    @api icons = '';
    @api colors = '';
    @api links = '';
    @api bgImages = ''; // Property for background images
    
    // Theme properties from parent theme layout
    @api primaryColor = '#22BDC1'; // Default primary color
    @api accentColor = '#D5DF23';  // Default accent color 
    @api textColor = '#1d1d1f';    // Default text color
    
    @track tilesData = [];
    
    // Access Request Modal Properties
    @track isRequestModalOpen = false;
    @track selectedTileIndex = null;
    @track selectedTileTitle = '';
    @track selectedAccessType = '';
    @track accessTypeOptions = [];
    @track justification = '';
    
    // Toast Properties
    @track showToast = false;
    @track toastTitle = '';
    @track toastMessage = '';
    @track toastClass = 'toast toast-info';
    @track toastIcon = 'utility:info';

    connectedCallback() {
        this.processProperties();
        
        // Parse the tilesConfig JSON if it's provided
        if (this.tilesConfig) {
            try {
                this.tilesData = JSON.parse(this.tilesConfig);
                
                // Initialize showMenu property for each tile
                this.tilesData.forEach(tile => {
                    tile.isMenuOpen = false;
                });
            } catch (error) {
                console.error('Error parsing tiles configuration:', error);
                this.tilesData = [];
            }
        }
        
        // Add event listener for clicks outside the menu
        document.addEventListener('click', this.handleClickOutside.bind(this));
        
        // Apply theme variables in the next microtask after the component is fully initialized
        Promise.resolve().then(() => {
            this.applyThemeVariables();
        });
    }
    
    disconnectedCallback() {
        // Remove event listener when component is destroyed
        document.removeEventListener('click', this.handleClickOutside.bind(this));
    }
    
    // Process properties whenever they change
    renderedCallback() {
        if (this._lastProps !== this.getPropString()) {
            this.processProperties();
        }
        
        // Apply the style class dynamically after render
        const tiles = this.template.querySelectorAll('.navigation-tile');
        tiles.forEach((tile) => {
            // Remove any existing style classes
            tile.classList.remove('style-elevated', 'style-flat', 'style-gradient', 'style-minimal', 'style-frosted', 'style-shadow', 'style-accent', 'style-subtle');
            // Add the current style class
            tile.classList.add(`style-${this.tileStyle}`);
        });
        
        // Apply theme variables
        this.applyThemeVariables();
    }
    
    // Apply theme CSS variables to the host element
    applyThemeVariables() {
        const hostElement = this.template.host;
        if (hostElement && hostElement.style) {
            hostElement.style.setProperty('--theme-primary-color', this.primaryColor || '#22BDC1');
            hostElement.style.setProperty('--theme-accent-color', this.accentColor || '#D5DF23');
            hostElement.style.setProperty('--theme-text-color', this.textColor || '#1d1d1f');
        }
    }
    
    // Get a string representation of all properties for change detection
    getPropString() {
        return `${this.titles}|${this.descriptions}|${this.icons}|${this.colors}|${this.links}|${this.bgImages}|${this.tileStyle}|${this.columns}|${this.primaryColor}|${this.accentColor}|${this.textColor}`;
    }
    
    // Computed properties for themed styling
    get modalContainerStyle() {
        return `
            --modal-primary-color: ${this.primaryColor || '#22BDC1'};
            --modal-accent-color: ${this.accentColor || '#D5DF23'};
            --modal-text-color: ${this.textColor || '#1d1d1f'};
        `;
    }
    
    get modalHeaderStyle() {
        return `
            background-color: ${this.primaryColor}10; 
            color: ${this.textColor};
        `;
    }
    
    get primaryButtonStyle() {
        return `
            background-color: ${this.primaryColor};
        `;
    }
    
    get selectArrowStyle() {
        return `
            color: ${this.primaryColor};
        `;
    }
    
    // Process all comma-delimited properties into a usable format
    processProperties() {
        const titleArray = this.splitAndTrim(this.titles);
        const descriptionArray = this.splitAndTrim(this.descriptions);
        const iconArray = this.splitAndTrim(this.icons);
        const colorArray = this.splitAndTrim(this.colors);
        const linkArray = this.splitAndTrim(this.links);
        const bgImageArray = this.splitAndTrim(this.bgImages);
        
        this.tilesData = [];
        
        // Create only as many tiles as we have titles
        for (let i = 0; i < titleArray.length; i++) {
            if (titleArray[i]) {
                // Get the color or use a default
                const accentColor = colorArray[i] || '#0071e3';
                // Check if we have a background image for this tile
                const hasBgImage = bgImageArray[i] && bgImageArray[i].trim() !== '';
                const bgImageUrl = hasBgImage ? bgImageArray[i].trim() : '';
                
                // Determine text color based on tile style and if there's a background image
                let textColor = '#ffffff';
                let backgroundStyle = '';
                let borderStyle = '';
                let hasOverlay = false;
                let overlayStyle = '';
                
                // Apply different styles based on tile style
                if (hasBgImage) {
                    // For background images, we use a dark overlay and white text
                    backgroundStyle = `background-image: url('${bgImageUrl}'); background-size: cover; background-position: center;`;
                    hasOverlay = true;
                    overlayStyle = `background: linear-gradient(rgba(0,0,0,0.4), rgba(0,0,0,0.7));`;
                    textColor = '#ffffff';
                } else {
                    // Apply style based on the selected tileStyle
                    switch(this.tileStyle) {
                        case 'gradient':
                            // Create a subtle gradient using the accent color
                            const lighterShade = this.lightenColor(accentColor, 30);
                            backgroundStyle = `background: linear-gradient(135deg, ${accentColor} 0%, ${lighterShade} 100%);`;
                            break;
                        case 'minimal':
                            // Minimalist white with accent color elements
                            backgroundStyle = `background-color: #ffffff;`;
                            borderStyle = `border-bottom: 3px solid ${accentColor};`;
                            textColor = '#1d1d1f';
                            break;
                        case 'frosted':
                            // Frosted glass effect with accent color
                            backgroundStyle = `background-color: ${this.hexToRgba(accentColor, 0.15)}; backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px);`;
                            borderStyle = `border: 1px solid ${this.hexToRgba(accentColor, 0.3)};`;
                            textColor = '#1d1d1f';
                            break;
                        case 'shadow':
                            // Deep shadow effect
                            backgroundStyle = `background-color: ${accentColor};`;
                            borderStyle = `box-shadow: 6px 6px 0 0 ${this.darkenColor(accentColor, 20)};`;
                            break;
                        case 'accent':
                            // Accent border with light background
                            backgroundStyle = `background-color: ${this.lightenColor(accentColor, 95)};`;
                            borderStyle = `border-left: 5px solid ${accentColor};`;
                            textColor = '#1d1d1f';
                            break;
                        case 'subtle':
                            // Subtle background with accent elements
                            backgroundStyle = `background-color: ${this.lightenColor(accentColor, 92)};`;
                            textColor = '#1d1d1f';
                            break;
                        case 'flat':
                            // Use a lighter version of the accent color for a more subtle look
                            const flatLighterShade = this.lightenColor(accentColor, 85);
                            backgroundStyle = `background-color: ${flatLighterShade};`;
                            textColor = '#1d1d1f';
                            break;
                        case 'elevated':
                        default:
                            // Elevated style - use the accent color directly
                            backgroundStyle = `background-color: ${accentColor};`;
                            break;
                    }
                }
                
                this.tilesData.push({
                    id: `tile-${i}`,
                    title: titleArray[i],
                    description: descriptionArray[i] || '',
                    icon: iconArray[i] || '',
                    accentColor: accentColor,
                    link: linkArray[i] || '',
                    hasIcon: iconArray[i] && iconArray[i].trim() !== '',
                    hasBgImage: hasBgImage,
                    bgImageUrl: bgImageUrl,
                    hasOverlay: hasOverlay,
                    overlayStyle: overlayStyle,
                    style: `${backgroundStyle} ${borderStyle} color: ${textColor};`,
                    iconStyle: `color: ${this.tileStyle === 'minimal' || this.tileStyle === 'frosted' || this.tileStyle === 'accent' || this.tileStyle === 'subtle' || this.tileStyle === 'flat' ? accentColor : '#ffffff'};`,
                    titleStyle: `color: ${textColor};`,
                    descriptionStyle: `color: ${textColor}; opacity: 0.8;`,
                    isMenuOpen: false
                });
            }
        }
        
        this._lastProps = this.getPropString();
    }
    
    // Helper method to split comma-delimited string and trim whitespace
    splitAndTrim(str) {
        if (!str) return [];
        return str.split(',').map(item => item.trim());
    }
    
    // Helper method to lighten a color (used for gradients and flat style)
    lightenColor(color, percent) {
        // Ensure color is in proper format
        if (!color || !color.startsWith('#') || color.length !== 7) {
            return '#0071e3'; // Return default blue if invalid color
        }
        
        // Convert hex to RGB
        let r = parseInt(color.substring(1, 3), 16);
        let g = parseInt(color.substring(3, 5), 16);
        let b = parseInt(color.substring(5, 7), 16);
        
        // Lighten the color
        r = Math.min(255, Math.floor(r + (255 - r) * (percent / 100)));
        g = Math.min(255, Math.floor(g + (255 - g) * (percent / 100)));
        b = Math.min(255, Math.floor(b + (255 - b) * (percent / 100)));
        
        // Convert back to hex
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    // Helper method to darken a color
    darkenColor(color, percent) {
        // Ensure color is in proper format
        if (!color || !color.startsWith('#') || color.length !== 7) {
            return '#0071e3'; // Return default blue if invalid color
        }
        
        // Convert hex to RGB
        let r = parseInt(color.substring(1, 3), 16);
        let g = parseInt(color.substring(3, 5), 16);
        let b = parseInt(color.substring(5, 7), 16);
        
        // Darken the color
        r = Math.max(0, Math.floor(r * (1 - percent / 100)));
        g = Math.max(0, Math.floor(g * (1 - percent / 100)));
        b = Math.max(0, Math.floor(b * (1 - percent / 100)));
        
        // Convert back to hex
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }
    
    // Helper method to convert hex to rgba
    hexToRgba(hex, alpha = 1) {
        // Ensure color is in proper format
        if (!hex || !hex.startsWith('#') || hex.length !== 7) {
            return 'rgba(0, 113, 227, ' + alpha + ')'; // Return default blue if invalid color
        }
        
        // Convert hex to RGB
        const r = parseInt(hex.substring(1, 3), 16);
        const g = parseInt(hex.substring(3, 5), 16);
        const b = parseInt(hex.substring(5, 7), 16);
        
        // Return rgba
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    
    get gridStyle() {
        // If we only have one tile and multiple columns, center it
        if (this.tilesData.length === 1 && this.columns > 1) {
            return `
                display: grid; 
                grid-template-columns: repeat(${this.columns}, 1fr); 
                gap: 16px;
                justify-items: center;
            `;
        }
        return `display: grid; grid-template-columns: repeat(${this.columns}, 1fr); gap: 16px;`;
    }
    
    // Computed property to check if submit button should be disabled
    get isSubmitDisabled() {
        return !this.selectedAccessType || !this.justification;
    }
    
    // Dropdown Menu Handlers
    handleToggleMenu(event) {
        event.stopPropagation();
        const index = parseInt(event.currentTarget.dataset.index, 10);
        
        // Close all other menus
        this.tilesData.forEach((tile, i) => {
            if (i !== index) {
                tile.isMenuOpen = false;
            }
        });
        
        // Toggle the current menu
        this.tilesData[index].isMenuOpen = !this.tilesData[index].isMenuOpen;
    }
    
    // Handle Request Access Option
    handleRequestAccess(event) {
        event.stopPropagation();
        const index = parseInt(event.currentTarget.dataset.index, 10);
        this.selectedTileIndex = index;
        this.selectedTileTitle = this.tilesData[index].title;
        
        // Close the dropdown
        this.tilesData[index].isMenuOpen = false;
        
        // Get access types for this app
        getAccessTypesForApp({ appName: this.selectedTileTitle })
            .then(result => {
                this.accessTypeOptions = result.map(type => {
                    return { label: type.label, value: type.value };
                });
                
                // Open the modal
                this.isRequestModalOpen = true;
            })
            .catch(error => {
                this.showToastNotification('Error', 'Failed to load access types: ' + error.body.message, 'error');
            });
    }
    
    // Modal Handlers
    closeRequestModal() {
        this.isRequestModalOpen = false;
        this.selectedAccessType = '';
        this.justification = '';
    }
    
    handleAccessTypeChange(event) {
        this.selectedAccessType = event.target.value;
    }
    
    handleJustificationChange(event) {
        this.justification = event.target.value;
    }
    
    // Submit Access Request
    submitAccessRequest() {
        const appName = this.selectedTileTitle;
        
        // Create the request
        createAccessRequest({
            appName: appName,
            accessType: this.selectedAccessType,
            justification: this.justification
        })
        .then(result => {
            this.closeRequestModal();
            this.showToastNotification(
                'Request Submitted', 
                'Your access request has been submitted for approval.', 
                'success'
            );
        })
        .catch(error => {
            this.showToastNotification(
                'Error', 
                'Failed to submit request: ' + error.body.message, 
                'error'
            );
        });
    }
    
    // Toast Notification
    showToastNotification(title, message, variant) {
        this.toastTitle = title;
        this.toastMessage = message;
        
        // Set toast style based on variant
        switch (variant) {
            case 'success':
                this.toastClass = 'toast toast-success';
                this.toastIcon = 'utility:success';
                break;
            case 'error':
                this.toastClass = 'toast toast-error';
                this.toastIcon = 'utility:error';
                break;
            case 'warning':
                this.toastClass = 'toast toast-warning';
                this.toastIcon = 'utility:warning';
                break;
            default:
                this.toastClass = 'toast toast-info';
                this.toastIcon = 'utility:info';
        }
        
        // Show the toast
        this.showToast = true;
        
        // Hide after 5 seconds
        setTimeout(() => {
            this.showToast = false;
        }, 5000);
    }
    
    // Handle click on the entire tile
    handleWholeTemplateClick(event) {
        // Get the closest element with a data-index attribute
        const clickedElement = event.currentTarget;
        const index = parseInt(clickedElement.dataset.index, 10);
        
        // Check if the click was on or inside the menu
        const isMenuClick = event.target.closest('.tile-menu') !== null;
        
        // Only navigate if the click wasn't on the menu
        if (!isMenuClick) {
            const tile = this.tilesData[index];
            
            if (!tile || !tile.link) {
                return;
            }
            
            const url = tile.link.trim();
            
            if (url.startsWith('http://') || url.startsWith('https://')) {
                // External URL
                window.open(url, '_blank');
            } else if (url.startsWith('/')) {
                // Relative URL within Salesforce
                this[NavigationMixin.Navigate]({
                    type: 'standard__webPage',
                    attributes: {
                        url: url
                    }
                });
            } else if (url.startsWith('{') && url.endsWith('}')) {
                // JSON page reference format
                try {
                    const pageRef = JSON.parse(url);
                    if (pageRef && pageRef.type) {
                        this[NavigationMixin.Navigate](pageRef);
                    }
                } catch (error) {
                    console.error('Navigation error with JSON page reference:', error);
                }
            } else {
                // Try to handle as a named page
                this[NavigationMixin.Navigate]({
                    type: 'standard__namedPage',
                    attributes: {
                        pageName: url
                    }
                });
            }
        }
    }

    // Original tile click handler - for backward compatibility with existing implementations
    handleTileClick(event) {
        event.stopPropagation();
        const index = parseInt(event.currentTarget.dataset.index, 10);
        const tile = this.tilesData[index];
        
        if (!tile || !tile.link) {
            return;
        }
        
        const url = tile.link.trim();
        
        if (url.startsWith('http://') || url.startsWith('https://')) {
            // External URL
            window.open(url, '_blank');
        } else if (url.startsWith('/')) {
            // Relative URL within Salesforce
            this[NavigationMixin.Navigate]({
                type: 'standard__webPage',
                attributes: {
                    url: url
                }
            });
        } else if (url.startsWith('{') && url.endsWith('}')) {
            // JSON page reference format
            try {
                const pageRef = JSON.parse(url);
                if (pageRef && pageRef.type) {
                    this[NavigationMixin.Navigate](pageRef);
                }
            } catch (error) {
                console.error('Navigation error with JSON page reference:', error);
            }
        } else {
            // Try to handle as a named page
            this[NavigationMixin.Navigate]({
                type: 'standard__namedPage',
                attributes: {
                    pageName: url
                }
            });
        }
    }

    handleMenuToggle(event) {
        event.stopPropagation();
        
        // Get the tile index from the data attribute
        const tileIndex = event.currentTarget.dataset.index;
        
        // Close any open menus first
        this.tilesData.forEach((tile, index) => {
            if (index !== parseInt(tileIndex, 10) && tile.isMenuOpen) {
                this.tilesData[index].isMenuOpen = false;
            }
        });
        
        // Toggle the menu for the clicked tile
        this.tilesData[tileIndex].isMenuOpen = !this.tilesData[tileIndex].isMenuOpen;
        
        // Add a spring animation effect for showing/hiding
        const menuElement = event.currentTarget.nextElementSibling;
        if (this.tilesData[tileIndex].isMenuOpen) {
            // When opening, ensure it's visible before animating
            menuElement.style.display = 'block';
        }
    }

    // Close dropdown when clicking outside
    handleClickOutside(event) {
        const menuButtons = this.template.querySelectorAll('.tile-menu-button');
        const menus = this.template.querySelectorAll('.tile-menu-dropdown');
        
        let clickedInsideMenu = false;
        
        // Check if click was inside any menu button or dropdown
        menuButtons.forEach(button => {
            if (button.contains(event.target)) {
                clickedInsideMenu = true;
            }
        });
        
        menus.forEach(menu => {
            if (menu.contains(event.target)) {
                clickedInsideMenu = true;
            }
        });
        
        // If clicked outside, close all menus
        if (!clickedInsideMenu) {
            this.tilesData.forEach((tile, index) => {
                this.tilesData[index].isMenuOpen = false;
            });
        }
    }
}