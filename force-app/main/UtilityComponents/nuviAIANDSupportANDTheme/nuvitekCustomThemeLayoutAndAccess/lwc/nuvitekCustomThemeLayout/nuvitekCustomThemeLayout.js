import { LightningElement, api, track, wire } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import getNavigationItems from "@salesforce/apex/NuvitekCustomThemeLayoutServices.getNavigationItems";
import searchAcrossObjects from "@salesforce/apex/NuvitekCustomThemeLayoutServices.searchAcrossObjects";
import { loadStyle } from "lightning/platformResourceLoader";

/**
 * @slot header This is the header slot
 * @slot footer This is the footer slot
 * @slot default This is the default slot
 * @slot hero-media This slot is for the hero media section
 */
export default class NuvitekCustomThemeLayout extends NavigationMixin(
  LightningElement
) {
  // Base theme properties
  @api primaryColor = "#22BDC1";
  @api accentColor = "#D5DF23";
  @api textColor = "#1d1d1f";
  @api themeName = "light";
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
  @api searchObjects = "Account,Contact";

  // Header options
  @api useDefaultHeader = false;
  @api headerNavigationMenuName;
  @api logoUrl;
  @api logoAltText = "Nuvitek";
  @api showSearchInHeader = false;
  @api headerSticky = false;
  @api headerVariant = "standard"; // standard, minimal, expanded

  // Footer options
  @api useDefaultFooter = false;
  @api footerNavigationMenuName;
  @api footerStyle = "standard";
  @api companyName = "Nuvitek";
  @api footerTagline = "Delivering innovative solutions since 2012";
  @api footerLegalText = "All rights reserved. Terms and conditions apply.";

  // Dynamic Footer Columns
  @api footerColumnCount = 3;
  @api footerColumnTitles = "Products, Resources, Company";
  @api footerColumnMenus = "";

  // Dynamic Social Links
  @api socialLinksCount = 0;
  @api socialLinkTitles = "Facebook, Twitter, LinkedIn, Instagram";
  @api socialLinkUrls = "";

  // Hero section properties
  @api showHeroSection = false;
  @api heroLayout = "fullwidth";
  @api heroBackgroundImage;
  @api heroTitle = "Experience the Future Today";
  @api heroSubtitle = "Discover innovative solutions designed with you in mind";
  @api heroCTAPrimaryLabel = "Get Started";
  @api heroCTAPrimaryUrl;
  @api heroCTASecondaryLabel = "Learn More";
  @api heroCTASecondaryUrl;

  // Banner customization
  @api bannerTextSize = "40px";
  @api bannerTextAlign = "center";

  // FAB control
  @api showFab = false;
  @api fabUrl;
  @api fabOptions = "custom"; // custom, url_link
  @api fabCustomItems = ""; // Format: "Label1,URL1,icon1|Label2,URL2,icon2"
  // COMMENTED OUT - Help Form and AI Assistant not used
  // @api helpFormLabel = "Help Request";
  // @api aiAssistantLabel = "AI Assistant";
  // @api helpFormIcon = "utility:chat";
  // @api aiAssistantIcon = "utility:einstein";

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
  // @track helpFormOpen = false; // COMMENTED OUT - not used
  @track fabMenuOpen = false;
  // @track llmAssistantOpen = false; // COMMENTED OUT - not used
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
  @api profilePageUrl = "/profile";
  @api ensureHomeNavItem = false;

  // General utility method to safely get a property value
  getSafeValue(value, defaultValue = "") {
    // Check for null, undefined, or empty strings
    if (
      value === null ||
      value === undefined ||
      value === "null" ||
      value === "undefined" ||
      value === ""
    ) {
      return defaultValue;
    }
    return value;
  }

  // Wire the header navigation menu items
  @wire(getNavigationItems, { menuName: "$headerNavigationMenuName" })
  wiredHeaderNavItems({ error, data }) {
    if (data) {
      this.headerNavItems = this.processNavItems(data, true);
      this.isHeaderNavLoaded = true;
    } else if (error) {
      console.error("Error loading header navigation items", error);
      this.headerNavItems = [];
      this.isHeaderNavLoaded = true;
    }
  }

  // Wire the footer navigation menu items
  @wire(getNavigationItems, { menuName: "$footerNavigationMenuName" })
  wiredFooterNavItems({ error, data }) {
    if (data) {
      this.footerNavItems = this.processNavItems(data, false);
      this.isFooterNavLoaded = true;
    } else if (error) {
      console.error("Error loading footer navigation items", error);
      this.footerNavItems = [];
      this.isFooterNavLoaded = true;
    }
  }

  // Lifecycle hooks
  connectedCallback() {
    if (typeof window !== "undefined") {
      window.addEventListener("scroll", this.handleScroll.bind(this));
      window.addEventListener("resize", this.handleResize.bind(this));
      this.setupMutationObserver();
    }

    // Initialize footer column data if needed
    this.initColumnMenusData();

    // Initialize new variables
    this.fabMenuOpen = false;
    // this.llmAssistantOpen = false; // COMMENTED OUT - not used
  }

  // Initialize column menus data
  initColumnMenusData() {
    if (!this.footerColumnMenus) return;

    const menus = this.footerColumnMenusArray;
    menus.forEach((menuName, index) => {
      if (menuName && menuName !== this.footerNavigationMenuName) {
        this.fetchMenuData(menuName)
          .then((data) => {
            this.columnMenusData[index] = data;
          })
          .catch((error) => {
            console.error(`Error loading menu for column ${index}:`, error);
          });
      }
    });
  }

  // Method to get navigation data for a specific menu
  fetchMenuData(menuName) {
    if (!menuName || menuName.trim() === "") return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      getNavigationItems({ menuName: menuName.trim() })
        .then((data) => {
          resolve(this.processNavItems(data, false));
        })
        .catch((error) => {
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
    if (typeof window !== "undefined") {
      window.removeEventListener("scroll", this.handleScroll.bind(this));
      window.removeEventListener("resize", this.handleResize.bind(this));
    }

    // Disconnect the mutation observer
    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
    }
  }

  // Footer column properties
  get footerColumnTitlesArray() {
    return this.getSafeValue(
      this.footerColumnTitles,
      "Products, Resources, Company"
    )
      .split(",")
      .map((title) => title.trim());
  }

  get footerColumnMenusArray() {
    if (!this.footerColumnMenus) return [];
    return this.footerColumnMenus.split(",").map((menu) => menu.trim());
  }

  // Social links properties
  get socialLinkTitlesArray() {
    return this.getSafeValue(
      this.socialLinkTitles,
      "Facebook, Twitter, LinkedIn, Instagram"
    )
      .split(",")
      .map((title) => title.trim());
  }

  get socialLinkUrlsArray() {
    if (!this.socialLinkUrls) return [];
    return this.socialLinkUrls.split(",").map((url) => url.trim());
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
      if (
        !isHeader &&
        (itemLabel === "home" || itemUrl === "/" || itemUrl?.endsWith("/home"))
      ) {
        return filtered; // Skip home items for footer
      }

      // Add to our tracking sets
      if (itemLabel) uniqueLabels.add(itemLabel);
      if (itemUrl) uniqueUrls.add(itemUrl);

      // Check if this is a home item
      if (
        itemLabel === "home" ||
        itemUrl === "/" ||
        itemUrl?.endsWith("/home")
      ) {
        hasHomeItem = true;
      }

      // More precise active page detection
      const isActive =
        currentUrl === itemUrl ||
        (itemUrl && itemUrl.length > 1 && currentUrl === itemUrl) ||
        (itemUrl === "/" &&
          (currentUrl === "/" || currentUrl.endsWith("/home")));

      // Create the processed item
      filtered.push({
        id: item.id || item.label,
        label: item.label,
        target: itemUrl,
        type: item.actionType,
        imageUrl: item.imageUrl,
        isActive,
        activeClass: isActive ? "nav-item active" : "nav-item",
        ariaCurrent: isActive ? "page" : null,
        hasChildren: item.subMenu && item.subMenu.length > 0,
        children: item.subMenu ? this.processSubMenu(item.subMenu) : []
      });

      return filtered;
    }, []);

    // Add a Home item if needed and configured (only for header)
    if (isHeader && this.ensureHomeNavItem && !hasHomeItem) {
      const homeItem = {
        id: "home",
        label: "Home",
        target: "/",
        type: "InternalLink",
        imageUrl: null,
        isActive: currentUrl === "/" || currentUrl.endsWith("/home"),
        activeClass:
          currentUrl === "/" || currentUrl.endsWith("/home")
            ? "nav-item active"
            : "nav-item",
        ariaCurrent:
          currentUrl === "/" || currentUrl.endsWith("/home") ? "page" : null,
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
    return subMenu.map((item) => {
      // Determine if this item is active
      const isActive = currentUrl.includes(item.actionValue);

      return {
        id: item.id || item.label,
        label: item.label,
        target: item.actionValue,
        type: item.actionType,
        imageUrl: item.imageUrl,
        isActive,
        activeClass: isActive
          ? "nav-dropdown-item active"
          : "nav-dropdown-item",
        ariaCurrent: isActive ? "page" : null,
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
    return "";
  }

  // Method to determine social icon type
  getSocialIconType(title) {
    const name = title.toLowerCase();
    if (name.includes("facebook")) return "facebook";
    if (name.includes("twitter") || name.includes("x")) return "twitter";
    if (name.includes("linkedin")) return "linkedin";
    if (name.includes("instagram")) return "instagram";
    if (name.includes("youtube")) return "youtube";
    if (name.includes("pinterest")) return "pinterest";
    if (name.includes("tiktok")) return "tiktok";
    if (name.includes("github")) return "github";
    return "generic";
  }

  // Create a function to generate footer column data for the template
  get footerColumnsWithItems() {
    const columns = [];
    for (let i = 0; i < this.footerColumnCount; i++) {
      // Get the menu name for this column
      const menuName = this.getColumnMenuName(i);
      let columnItems = [];

      // If using specific menu for this column, check if we've loaded it
      if (
        menuName !== this.footerNavigationMenuName &&
        this.columnMenusData[i]
      ) {
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

      if (url && url.trim() !== "") {
        const iconType = this.getSocialIconType(title);
        links.push({
          index: i,
          title: title,
          url: url,
          iconType: iconType,
          isFacebook: iconType === "facebook",
          isTwitter: iconType === "twitter",
          isLinkedIn: iconType === "linkedin",
          isInstagram: iconType === "instagram",
          isYoutube: iconType === "youtube",
          isPinterest: iconType === "pinterest",
          isTiktok: iconType === "tiktok",
          isGithub: iconType === "github",
          isGeneric: iconType === "generic"
        });
      }
    }
    return links;
  }

  // Computed property for dynamic grid columns
  get footerColumnsStyle() {
    if (this.footerStyle === "minimal" || this.footerStyle === "standard") {
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
      if (type === "InternalLink") {
        // Internal link navigation
        this[NavigationMixin.Navigate]({
          type: "standard__webPage",
          attributes: {
            url: target
          }
        });
      } else if (type === "ExternalLink") {
        // External link - open in new window
        window.open(target, "_blank");
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
    if (event.type === "submit" || event.keyCode === 13) {
      event.preventDefault();
    }

    // Get the search input
    const searchInput = this.template.querySelector(".search-input");
    const searchTerm = searchInput.value.trim();

    // Get the objects to search (from data attribute or use default)
    const objectsToSearch =
      searchInput.dataset.searchObjects || "Account,Contact,Case";

    // Only search if we have a term
    if (searchTerm.length >= 2) {
      this.isSearching = true;
      this.showSearchResults = true;

      // Call the Apex method
      searchAcrossObjects({ searchTerm, objectsToSearch })
        .then((results) => {
          this.searchResults = results;
          this.isSearching = false;
        })
        .catch((error) => {
          console.error("Error performing search:", error);
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
    if (event.keyCode === 13) {
      // Enter key
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
      type: "standard__recordPage",
      attributes: {
        recordId: recordId,
        objectApiName: objectType,
        actionName: "view"
      }
    });

    // Close the search results
    this.closeSearchResults();

    // Clear the input
    this.template.querySelector(".search-input").value = "";
  }

  setupMutationObserver() {
    // Create a MutationObserver to detect when new components are added to the DOM
    if (window.MutationObserver) {
      this.mutationObserver = new MutationObserver((mutations) => {
        let shouldReapplyStyles = false;

        mutations.forEach((mutation) => {
          if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
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
      const slots = this.template.querySelectorAll("slot");

      slots.forEach((slot) => {
        const slotName = slot.name || "default";
        const assignedElements = slot.assignedElements();

        assignedElements.forEach((el) => {
          // Add theme class to element
          el.classList.add("nuvitek-themed-component");

          // Add slot-specific classes
          if (slotName === "header") {
            el.classList.add("nuvitek-themed-header");
          } else if (slotName === "footer") {
            el.classList.add("nuvitek-themed-footer");
          }

          // Apply CSS variables directly to the element
          this.applyThemeVariablesToElement(el);

          // Recursively process child components
          this.processChildComponents(el);
        });
      });
    } catch (error) {
      console.error("Error applying theme to slotted content:", error);
    }
  }

  processChildComponents(parentElement) {
    // Process all child elements recursively
    if (!parentElement || !parentElement.querySelectorAll) return;

    // Process Lightning components differently to get to their shadow DOM
    const lightningComponents = parentElement.querySelectorAll(
      '[data-id^="lightning-"]'
    );
    lightningComponents.forEach((component) => {
      this.injectStylesIntoLightningComponent(component);
    });

    // Apply theme to standard HTML elements
    const standardElements = parentElement.querySelectorAll(
      "button, input, select, textarea, a"
    );
    standardElements.forEach((element) => {
      this.applyThemeClassesToElement(element);
    });

    // Continue processing child elements that are not Lightning components
    const childElements = parentElement.children;
    if (childElements) {
      Array.from(childElements).forEach((child) => {
        // Skip already processed Lightning components
        if (!child.getAttribute("data-id")?.startsWith("lightning-")) {
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
      case "button":
        element.classList.add("nuvitek-btn");
        if (
          element.classList.contains("slds-button_brand") ||
          element.classList.contains("slds-button--brand")
        ) {
          element.classList.add("nuvitek-btn-primary");
        } else {
          element.classList.add("nuvitek-btn-secondary");
        }
        break;

      case "input":
        element.classList.add("nuvitek-input");
        break;

      case "textarea":
        element.classList.add("nuvitek-input");
        element.classList.add("nuvitek-textarea");
        break;

      case "select":
        element.classList.add("nuvitek-input");
        break;

      case "a":
        if (
          element.classList.contains("slds-button") ||
          element.role === "button"
        ) {
          element.classList.add("nuvitek-btn");
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
    const existingStyle = targetRoot.querySelector(".nuvitek-injected-style");
    if (existingStyle) return;

    // Create a style element
    const styleElement = document.createElement("style");
    styleElement.className = "nuvitek-injected-style";
    styleElement.textContent = this.getThemeVariablesCSS();

    // Append to shadow root
    targetRoot.appendChild(styleElement);
  }

  getThemeVariablesCSS() {
    // Generate CSS variables based on current theme settings
    return `
            :host {
                --primary-color: ${this.getSafeValue(this.primaryColor, "#22BDC1")};
                --accent-color: ${this.getSafeValue(this.accentColor, "#D5DF23")};
                --text-color: ${this.getSafeValue(this.textColor, "#1d1d1f")};
                /* All other variables would be derived from these */
                
                /* Override SLDS variables */
                --sds-c-button-brand-color-background: ${this.getSafeValue(this.primaryColor, "#22BDC1")};
                --sds-c-button-brand-text-color: white;
                --lwc-colorTextLink: ${this.getSafeValue(this.primaryColor, "#22BDC1")};
                
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
    element.style.setProperty(
      "--primary-color",
      this.getSafeValue(this.primaryColor, "#22BDC1")
    );
    element.style.setProperty(
      "--accent-color",
      this.getSafeValue(this.accentColor, "#D5DF23")
    );
    element.style.setProperty(
      "--text-color",
      this.getSafeValue(this.textColor, "#1d1d1f")
    );

    // Set more variables as needed
    if (this.themeName === "dark") {
      element.style.setProperty("--background", "#1d1d1f");
      element.style.setProperty("--background-alt", "#2d2d2f");
      element.style.setProperty("--text-secondary", "#a1a1a6");
    } else {
      element.style.setProperty("--background", "#ffffff");
      element.style.setProperty("--background-alt", "#f5f5f7");
      element.style.setProperty("--text-secondary", "#6e6e73");
    }
  }

  applyStylesToOOTBComponents() {
    // Get the main document stylesheet to inject global styles
    try {
      // Create a style element for global SLDS overrides
      const globalStyle = document.createElement("style");
      globalStyle.id = "nuvitek-global-theme-override";
      globalStyle.textContent = this.getGlobalOverrideStyles();
      document.head.appendChild(globalStyle);
    } catch (error) {
      console.error("Error applying global styles:", error);
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
                background-color: ${this.getSafeValue(this.primaryColor, "#22BDC1")} !important;
                border-color: ${this.getSafeValue(this.primaryColor, "#22BDC1")} !important;
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
    if (!resourceName || resourceName.trim() === "") return "";

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
    if (this.isUrlLink && this.fabUrl) {
      window.location.href = this.fabUrl;
    } else if (this.fabOptions === "help_form") {
      this.toggleHelpForm();
    } else if (this.fabOptions === "ai_assistant") {
      this.toggleLlmAssistant();
    } else {
      // Default to toggle menu when multiple options
      this.toggleFabMenu();
    }
  }

  handleScrollDown() {
    // Get the height of the viewport
    const viewportHeight = window.innerHeight;

    // Scroll to just below the hero section
    window.scrollTo({
      top: viewportHeight,
      behavior: "smooth"
    });
  }

  /* COMMENTED OUT - Help Form not used
  // Toggle the help form (which is now the Support Requester)
  toggleHelpForm() {
    this.helpFormOpen = !this.helpFormOpen;

    // Close menu if the form is being opened
    if (this.helpFormOpen) {
      this.fabMenuOpen = false;
      this.llmAssistantOpen = false;
    }
  }
  */

  // Toggle the FAB menu
  toggleFabMenu() {
    // Toggle menu for custom options
    this.fabMenuOpen = !this.fabMenuOpen;
  }

  /* COMMENTED OUT - LLM Assistant not used
  // Toggle the LLM Assistant dialog
  toggleLlmAssistant() {
    this.llmAssistantOpen = !this.llmAssistantOpen;

    // Close other components if the assistant is being opened
    if (this.llmAssistantOpen) {
      this.fabMenuOpen = false;
      this.helpFormOpen = false;
    }
  }
  */

  // Close all dialogs (used for backdrop clicks)
  closeAllDialogs() {
    this.fabMenuOpen = false;
    // Removed helpFormOpen and llmAssistantOpen - not used
  }

  // Custom FAB links now use direct anchor navigation with proper target attributes

  // Computed properties
  get currentYear() {
    return new Date().getFullYear();
  }

  get isHeroSplit() {
    return this.heroLayout === "split";
  }

  get isHeroFullscreen() {
    return this.heroLayout === "fullwidth";
  }

  get videoOverlayStyle() {
    return `background-color: rgba(0, 0, 0, ${this.backgroundVideoDarkness / 100});`;
  }

  get themeClass() {
    return `nuvitek-theme theme-${this.themeName}`;
  }

  get isDarkTheme() {
    return this.themeName === "dark";
  }

  get showFaqSection() {
    return false; // Always hide FAQ section
  }

  get scrollIndicatorClass() {
    let classes = "scroll-indicator";
    if (this.showBackgroundVideo) {
      classes += " on-video-background";
    }
    return classes;
  }

  get headerClass() {
    let classes = "site-header";
    if (this.scrolled) {
      classes += " scrolled";
    }
    if (this.headerVariant) {
      classes += ` variant-${this.headerVariant}`;
    }
    return classes;
  }

  get headerStyle() {
    let style = "";
    if (this.headerSticky) {
      style += "position: sticky; top: 0;";
    }
    return style;
  }

  get mobileMenuButtonClass() {
    return this.mobileMenuOpen ? "menu-button active" : "menu-button";
  }

  get mobileMenuClass() {
    return this.mobileMenuOpen ? "mobile-menu open" : "mobile-menu";
  }

  get heroSectionClass() {
    return `hero-section layout-${this.heroLayout}`;
  }

  get heroContainerClass() {
    let classes = "hero-container";
    if (this.heroLayout === "banner") {
      classes += ` align-${this.bannerTextAlign}`;
    }
    return classes;
  }

  get heroContentClass() {
    let classes = "hero-content";
    if (this.heroLayout === "banner") {
      classes += ` align-${this.bannerTextAlign}`;
    }
    return classes;
  }

  get heroTitleClass() {
    let classes = "hero-title";
    if (this.heroLayout === "banner") {
      classes += ` align-${this.bannerTextAlign}`;
    }
    return classes;
  }

  get heroTitleStyle() {
    if (this.heroLayout === "banner" && this.bannerTextSize) {
      // Make sure the font-size applies to both the container and all child elements
      return `font-size: ${this.bannerTextSize} !important;`;
    }
    return "";
  }

  get heroTitleTextStyle() {
    if (this.heroLayout === "banner" && this.bannerTextSize) {
      // Ensure the actual text span also gets the font size
      return `font-size: ${this.bannerTextSize} !important;`;
    }
    return "";
  }

  get heroSubtitleClass() {
    let classes = "hero-subtitle";
    if (this.heroLayout === "banner") {
      classes += ` align-${this.bannerTextAlign}`;
    }
    return classes;
  }

  // Update the shouldShowFooterColumns getter
  get shouldShowFooterColumns() {
    // Only show footer columns in multi-column style
    return this.footerStyle === "multi-column";
  }

  // Update the standard style in the footer class
  get footerClass() {
    let classes = "site-footer";
    if (this.footerStyle) {
      classes += ` style-${this.footerStyle}`;
    }
    return classes;
  }

  // Add this computed property to the JavaScript file
  get shouldShowHeader() {
    // Only check for content if using default header
    if (this.useDefaultHeader) {
      const hasNavigation =
        this.headerNavigationMenuName &&
        this.headerNavigationMenuName.trim() !== "";
      const hasHeaderContent =
        hasNavigation ||
        this.showProfileIcon ||
        this.showSearchInHeader ||
        this.logoUrl ||
        this.ensureHomeNavItem;
      return hasHeaderContent;
    }
    // Always return false for default header if not using it
    return false;
  }

  get themeStyle() {
    return `
            --primary-color: ${this.getSafeValue(this.primaryColor, "#22BDC1")};
            --accent-color: ${this.getSafeValue(this.accentColor, "#D5DF23")};
            --text-color: ${this.getSafeValue(this.textColor, "#1d1d1f")};
        `;
  }

  // Computed property for the subtitle style
  get heroSubtitleStyle() {
    const backgroundType = this.detectBackgroundBrightness();

    if (backgroundType === "dark") {
      // Light text for dark backgrounds
      return "color: rgba(255, 255, 255, 0.95); text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);";
    } else {
      // Dark text for light backgrounds
      return "color: rgba(33, 33, 33, 0.95); text-shadow: none;";
    }
  }
  // For the background URL and other resource paths
  get heroBackgroundStyle() {
    let style = "";

    if (
      this.heroBackgroundImage &&
      this.heroBackgroundImage.trim() !== "" &&
      !this.showBackgroundVideo
    ) {
      style += `background-image: url(${this.getResourcePath(this.heroBackgroundImage)});`;
      // Don't add a linear gradient here, we'll use the overlay div instead
    }

    return style;
  }

  // Update the heroOverlayStyle getter to handle both lightening and darkening
  get heroOverlayStyle() {
    // If 0, return no overlay
    if (this.heroBackgroundDarkness === 0) {
      return "background: none;";
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
      return "light"; // This will make text dark (counter-intuitive but matches the logic)
    } else {
      return "dark"; // This will make text light
    }
  }

  // Similarly for the video URL and fallback
  get resolvedVideoUrl() {
    return this.backgroundVideoUrl && this.backgroundVideoUrl.trim() !== ""
      ? this.getResourcePath(this.backgroundVideoUrl)
      : "";
  }

  get resolvedFallbackUrl() {
    return this.backgroundVideoFallbackUrl &&
      this.backgroundVideoFallbackUrl.trim() !== ""
      ? this.getResourcePath(this.backgroundVideoFallbackUrl)
      : "";
  }

  // For the logo style
  get logoStyle() {
    if (this.logoUrl && this.logoUrl.trim() !== "") {
      return `background-image: url(${this.getResourcePath(this.logoUrl)});`;
    }
    return "";
  }

  /* COMMENTED OUT - Help Form dialog not used
  get helpFormDialogClass() {
    return this.helpFormOpen
      ? "dialog support-requester-dialog open"
      : "dialog support-requester-dialog";
  }
  */

  get backdropClass() {
    // Simplified - removed helpFormOpen and llmAssistantOpen
    return "dialog-backdrop";
  }

  get isMinimalFooter() {
    return this.footerStyle === "minimal";
  }

  // Get the class for the FAB menu based on its open state
  get fabMenuClass() {
    return this.fabMenuOpen ? "fab-menu open" : "fab-menu";
  }

  /* COMMENTED OUT - LLM Assistant not used
  // Get the class for the LLM Assistant dialog based on its open state
  get llmAssistantDialogClass() {
    return this.llmAssistantOpen ? "help-form-dialog open" : "help-form-dialog";
  }
  */

  /* COMMENTED OUT - Help Form and AI Assistant not used
  // Helper methods for FAB options
  get showHelpFormOption() {
    return this.fabOptions === "both" || this.fabOptions === "help_form";
  }

  get showAiAssistantOption() {
    return this.fabOptions === "both" || this.fabOptions === "ai_assistant";
  }
  */

  get isUrlLink() {
    return this.fabOptions === "url_link";
  }

  get showCustomItems() {
    return this.fabOptions === "custom" && this.parsedCustomItems.length > 0;
  }

  get hasAnyMenuItems() {
    return this.showCustomItems; // Simplified - only custom items now
  }

  get parsedCustomItems() {
    if (!this.fabCustomItems || this.fabCustomItems.trim() === "") {
      return [];
    }

    try {
      const itemsList = [];
      const items = this.fabCustomItems.split('|');
      
      items.forEach(item => {
        if (item && item.trim() !== "") {
          const parts = item.trim().split(',');
          
          if (parts.length >= 2) {
            const url = parts[1].trim();
            const isExternal = url.startsWith('http://') || url.startsWith('https://') || url.startsWith('mailto:') || url.startsWith('tel:');
            
            const menuItem = {
              label: parts[0].trim(),
              url: url,
              icon: parts[2] ? parts[2].trim() : 'utility:open',
              iconName: parts[2] ? parts[2].trim() : 'open',
              target: isExternal ? '_blank' : '_self',
              rel: isExternal ? 'noopener noreferrer' : null
            };
            
            // Validate the icon name format
            if (!menuItem.icon.includes(':')) {
              menuItem.icon = 'utility:' + menuItem.icon;
            }
            
            itemsList.push(menuItem);
          }
        }
      });
      
      return itemsList;
    } catch(e) {
      console.error("Error parsing custom FAB items:", e);
      return [];
    }
  }

  /* COMMENTED OUT - Help Form icon not used
  // Convert SLDS icon name to SVG path for help form icon
  get helpFormIconSvg() {
    const iconName = this.helpFormIcon.toLowerCase();

    if (iconName.includes("chat")) {
      return `<path d="M8 10.5C8 11.3284 7.32843 12 6.5 12C5.67157 12 5 11.3284 5 10.5C5 9.67157 5.67157 9 6.5 9C7.32843 9 8 9.67157 8 10.5Z" fill="currentColor" />
                    <path d="M12.5 10.5C12.5 11.3284 11.8284 12 11 12C10.1716 12 9.5 11.3284 9.5 10.5C9.5 9.67157 10.1716 9 11 9C11.8284 9 12.5 9.67157 12.5 10.5Z" fill="currentColor" />
                    <path d="M17 10.5C17 11.3284 16.3284 12 15.5 12C14.6716 12 14 11.3284 14 10.5C14 9.67157 14.6716 9 15.5 9C16.3284 9 17 9.67157 17 10.5Z" fill="currentColor" />
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.04346 16.4525C3.22094 16.8088 3.28001 17.2161 3.17712 17.6006L2.58151 19.8267C2.32295 20.793 3.20701 21.677 4.17335 21.4185L6.39939 20.8229C6.78393 20.72 7.19121 20.7791 7.54753 20.9565C8.88837 21.6244 10.4003 22 12 22ZM20 12C20 16.4183 16.4183 20 12 20C10.6867 20 9.44366 19.7117 8.32239 19.1953C7.50777 18.8117 6.56713 18.9307 5.86753 19.3562L4.17335 19.8229L4.63961 18.1288C5.06947 17.4292 5.18846 16.489 4.80525 15.6743C4.28876 14.5528 4 13.3099 4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12Z" fill="currentColor" />`;
    } else if (iconName.includes("help")) {
      return `<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 17h-2v-2h2v2zm2.07-7.75l-.9.92c-.5.51-.86.97-1.04 1.69-.08.32-.13.68-.13 1.14h-2v-.5c0-.46.08-.9.22-1.31.2-.58.53-1.1.95-1.52l1.24-1.26c.46-.44.68-1.1.55-1.8-.13-.72-.69-1.33-1.39-1.53-1.11-.31-2.14.32-2.47 1.27-.12.35-.43.47-.82.47-.33 0-.67-.11-.82-.47C9.29 8.57 10.18 7 11.97 7c1.3 0 2.43.8 2.9 1.97.35 1.02.15 2.27-.8 3.28z" fill="currentColor"/>`;
    } else if (iconName.includes("case")) {
      return `<path d="M9 6h2v2H9V6zm4 0h2v2h-2V6zM9 10h2v2H9v-2zm4 0h2v2h-2v-2zm-4 4h2v2H9v-2zm4 0h2v2h-2v-2z" fill="currentColor"/>
                   <path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1c-1.3 0-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm7 16H5V5h14v14z" fill="currentColor"/>`;
    } else {
      // Default chat icon if none of the above
      return `<path d="M8 10.5C8 11.3284 7.32843 12 6.5 12C5.67157 12 5 11.3284 5 10.5C5 9.67157 5.67157 9 6.5 9C7.32843 9 8 9.67157 8 10.5Z" fill="currentColor" />
                    <path d="M12.5 10.5C12.5 11.3284 11.8284 12 11 12C10.1716 12 9.5 11.3284 9.5 10.5C9.5 9.67157 10.1716 9 11 9C11.8284 9 12.5 9.67157 12.5 10.5Z" fill="currentColor" />
                    <path d="M17 10.5C17 11.3284 16.3284 12 15.5 12C14.6716 12 14 11.3284 14 10.5C14 9.67157 14.6716 9 15.5 9C16.3284 9 17 9.67157 17 10.5Z" fill="currentColor" />
                    <path fill-rule="evenodd" clip-rule="evenodd" d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.5997 2.37562 15.1116 3.04346 16.4525C3.22094 16.8088 3.28001 17.2161 3.17712 17.6006L2.58151 19.8267C2.32295 20.793 3.20701 21.677 4.17335 21.4185L6.39939 20.8229C6.78393 20.72 7.19121 20.7791 7.54753 20.9565C8.88837 21.6244 10.4003 22 12 22ZM20 12C20 16.4183 16.4183 20 12 20C10.6867 20 9.44366 19.7117 8.32239 19.1953C7.50777 18.8117 6.56713 18.9307 5.86753 19.3562L4.17335 19.8229L4.63961 18.1288C5.06947 17.4292 5.18846 16.489 4.80525 15.6743C4.28876 14.5528 4 13.3099 4 12C4 7.58172 7.58172 4 12 4C16.4183 4 20 7.58172 20 12Z" fill="currentColor" />`;
    }
  }
  */

  /* COMMENTED OUT - AI Assistant icon not used
  // Convert SLDS icon name to SVG path for AI assistant icon
  get aiAssistantIconSvg() {
    const iconName = this.aiAssistantIcon.toLowerCase();

    if (iconName.includes("einstein")) {
      return `<path d="M17.72 11.41h-.5v-1.03h.5c.97 0 1.65-.68 1.65-1.64V7.7c0-.96-.68-1.64-1.65-1.64h-.5V4.07c0-1.7-1.36-3.07-3.05-3.07H6.32a3.07 3.07 0 00-3.05 3.07v14.86c0 1.7 1.36 3.07 3.05 3.07h6.86a3.06 3.06 0 003.04-3.07v-1.96h.5c.97 0 1.65-.67 1.65-1.64v-1.03c0-.97-.68-1.64-1.65-1.64h-.5v-1.04h.5c.97 0 1.65-.67 1.65-1.64V8.74c0-.96-.68-1.64-1.65-1.64h-.5V6.07h.5c.17 0 .31.14.31.36v1.03c0 .23.14.36.31.36h1.34c.17 0 .31-.14.31-.36V7.43c0-1.52-1.01-2.68-2.28-2.68h-.5V3.57c0-.4-.34-.71-.73-.71-.4 0-.73.32-.73.71v1.18h-.32c-.4 0-.73.32-.73.71 0 .4.34.71.73.71h.32v1h-4.23c-.4 0-.73.32-.73.71 0 .4.34.71.73.71h4.23v1h-.32c-.4 0-.73.32-.73.71 0 .4.34.71.73.71h.32v1.01h-.35c-.4 0-.73.32-.73.71 0 .39.33.71.73.71h.35v1.01h-.32c-.4 0-.73.32-.73.71 0 .39.34.71.73.71h.32v1.04h-4.25c-.4 0-.73.32-.73.71 0 .39.34.71.73.71h4.25v1h-.32c-.4 0-.73.32-.73.71 0 .39.34.71.73.71h.32v1.18c0 .4.34.71.73.71.4 0 .73-.32.73-.71v-1.18h.5c.17 0 .31.14.31.36v1.03c0 .23.14.36.31.36h1.34c.17 0 .31-.14.31-.36v-1.03c0-.22-.14-.36-.31-.36h-.5v-1h.5c.97 0 1.65-.67 1.65-1.64v-1.03c0-.97-.68-1.64-1.65-1.64h-.5v-1.01h.5c.97 0 1.65-.67 1.65-1.64V9.77c0-.96-.68-1.64-1.65-1.64h-.5V7.07h.5c.17 0 .31.14.31.36v1.03c0 .22.14.36.31.36h1.34c.17 0 .31-.14.31-.36V7.43c0-.22-.14-.36-.31-.36h-.5zm-7.98 7.89c.24.22.4.53.4.89 0 .59-.47 1.06-1.06 1.06s-1.06-.47-1.06-1.06c0-.36.15-.67.4-.89-.4-.23-.67-.66-.67-1.16 0-.65.47-1.2 1.08-1.3-.17-.2-.29-.46-.29-.76 0-.58.39-1.06.9-1.21-.05-.13-.08-.28-.08-.45 0-.74.6-1.33 1.33-1.33.74 0 1.33.6 1.33 1.33 0 .16-.03.32-.08.45.51.15.9.63.9 1.21 0 .3-.12.56-.29.76.61.1 1.08.65 1.08 1.3 0 .5-.27.93-.67 1.16.24.22.4.53.4.89 0 .59-.47 1.06-1.06 1.06s-1.06-.47-1.06-1.06c0-.36.15-.67.4-.89-.25-.13-.45-.35-.58-.62h-1.14c-.13.27-.33.48-.58.62zm5.56-8.19c.45 0 .82.37.82.82 0 .46-.37.83-.82.83-.46 0-.83-.37-.83-.83 0-.45.37-.82.83-.82zm0 3.51c.45 0 .82.37.82.82 0 .45-.37.82-.82.82-.46 0-.83-.37-.83-.82 0-.45.37-.82.83-.82zm0 3.5c.45 0 .82.37.82.83 0 .45-.37.82-.82.82-.46 0-.83-.37-.83-.82 0-.46.37-.83.83-.83z" fill="currentColor"/>`;
    } else if (iconName.includes("bot")) {
      return `<path d="M10.31 22H7.97c-.6 0-1.1-.44-1.2-1.02l-.34-2.17c-.25-.11-.52-.25-.75-.37l-2.08.62a1.22 1.22 0 01-1.41-.45l-1.2-2.06a1.22 1.22 0 01.12-1.48l1.47-1.58c-.02-.14-.04-.27-.04-.41s.02-.27.04-.41L1.12 11.1A1.22 1.22 0 011 9.62l1.2-2.07a1.22 1.22 0 011.41-.44l2.08.62c.24-.13.5-.25.75-.37l.35-2.17c.1-.58.59-1.02 1.19-1.02h2.34c.6 0 1.1.44 1.19 1.03l.35 2.16c.26.13.51.25.76.38l2.06-.62a1.21 1.21 0 011.42.44l1.2 2.07c.27.47.2 1.07-.13 1.47l-1.46 1.58c.03.14.04.28.04.42s-.01.28-.04.42l1.46 1.58c.33.4.4 1 .13 1.47l-1.2 2.07c-.28.47-.81.66-1.42.44l-2.06-.62c-.25.13-.5.26-.76.38l-.35 2.17c-.1.58-.59 1.03-1.19 1.03zM7 12c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2zm8.7 0c0 1.1.9 2 2 2s2-.9 2-2-.9-2-2-2-2 .9-2 2zm4.3 8.5a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM21 19a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0-1.5a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm1.5-1.5a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm0-1.5a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" fill="currentColor"/>`;
    } else if (iconName.includes("knowledge")) {
      return `<path d="M16.39 15.53a.677.677 0 01-.2.48l-1.64 1.64c-.13.13-.3.2-.48.2s-.35-.07-.48-.2l-5.65-5.66a.677.677 0 01-.2-.48c0-.18.07-.35.2-.48l1.64-1.64c.13-.13.3-.2.48-.2s.35.07.48.2l5.66 5.66c.13.13.2.3.2.48zm4.12-4.11c0 .18-.07.35-.2.48l-1.64 1.64c-.13.13-.3.2-.48.2s-.35-.07-.48-.2l-5.66-5.66a.677.677 0 01-.2-.48c0-.18.07-.35.2-.48l1.64-1.64c.13-.13.3-.2.48-.2s.35.07.48.2l5.66 5.66c.13.13.2.3.2.48zM5.51 19.76a.877.877 0 00.68-.31l3.12-3.51c.17-.17.13-.44-.06-.61l-3.2-2.76a.44.44 0 00-.58.07L2.3 16.66a.415.415 0 00.04.61l2.52 2.34c.17.13.41.15.65.15zM11.62 4l-.7.42L9.01 6.06a.477.477 0 01-.45.09.494.494 0 01-.33-.33.477.477 0 01.09-.45l1.91-1.64.71-.42c.71-.42 1.63-.03 1.85.79l.22.82c.09.33-.12.42-.12.42l-.56.29c-.35.14-.48-.05-.48-.05s-.26-.36-.55-.3c-.3.05-.68.62-.68.62z" fill="currentColor"/>`;
    } else if (iconName.includes("message")) {
      return `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else {
      // Default AI icon
      return `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                    <path d="M12 8v4M12 16h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }
  */

  // Update the main FAB button icon to use the configured options
  get mainFabIconSvg() {
    if (this.isUrlLink) {
      return `<path d="M11 5h2v14h-2z" fill="currentColor"/><path d="M5 11h14v2H5z" fill="currentColor"/>`;
    } else {
      // Default plus icon for the menu
      return `<path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
  }
}
