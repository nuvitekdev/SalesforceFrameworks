({
  doInit: function (component, event, helper) {
    try {
      // Initialize the component
      helper.initializeComponent(component, helper);

      // Set current year
      var currentDate = new Date();
      component.set("v.currentYear", currentDate.getFullYear());

      // Initialize computed properties
      helper.updateComputedProperties(component);

      // Set up scroll listeners
      helper.setupScrollListener(component);

      // Load navigation data
      helper.loadNavigationData(component);

      // Initialize theme styles
      helper.applyThemeStyles(component);
    } catch (e) {
      console.error("Error in doInit:", e);
    }
  },

  handleNavItemClick: function (component, event, helper) {
    event.preventDefault();

    var target = event.currentTarget.dataset.target;
    var type = event.currentTarget.dataset.type;

    if (target && type) {
      helper.navigateToUrl(component, type, target);
    }

    // Close mobile menu if open
    var mobileMenuOpen = component.get("v.mobileMenuOpen");
    if (mobileMenuOpen) {
      component.set("v.mobileMenuOpen", false);
      helper.updateComputedProperties(component);
    }
  },

  handleSearch: function (component, event, helper) {
    try {
      // Prevent default form submission
      if (
        event.type === "submit" ||
        (event.getParams && event.getParams().keyCode === 13)
      ) {
        event.preventDefault();
      }

      // Get the search input
      var searchInput = component.find("searchInput");
      if (searchInput && searchInput.getElement) {
        var searchTerm = searchInput.getElement().value.trim();
        var searchObjects =
          component.get("v.searchObjects") || "Account,Contact,Case";

        // Only search if we have a term
        if (searchTerm.length >= 2) {
          component.set("v.isSearching", true);
          component.set("v.showSearchResults", true);

          helper.performSearch(component, searchTerm, searchObjects);
        } else {
          component.set("v.showSearchResults", false);
          component.set("v.searchResults", []);
        }
      }
    } catch (e) {
      console.error("Error in handleSearch:", e);
    }
  },

  handleSearchKeyup: function (component, event, helper) {
    try {
      var keyCode =
        (event.getParams && event.getParams().keyCode) || event.keyCode;

      if (keyCode === 13) {
        // Enter key
        this.handleSearch(component, event, helper);
      } else {
        var searchInput = event.target || event.currentTarget;
        if (
          searchInput &&
          searchInput.value &&
          searchInput.value.trim().length >= 2
        ) {
          // Optional: You could implement auto-search here
          this.handleSearch(component, event, helper);
        } else if (
          searchInput &&
          searchInput.value &&
          searchInput.value.trim().length === 0
        ) {
          component.set("v.showSearchResults", false);
          component.set("v.searchResults", []);
        }
      }
    } catch (e) {
      console.error("Error in handleSearchKeyup:", e);
    }
  },

  closeSearchResults: function (component, event, helper) {
    component.set("v.showSearchResults", false);
  },

  handleResultClick: function (component, event, helper) {
    try {
      var recordId = event.currentTarget.dataset.id;
      var objectType = event.currentTarget.dataset.objectType;

      // Navigate to the record
      helper.navigateToRecord(component, recordId, objectType);

      // Close the search results
      component.set("v.showSearchResults", false);

      // Clear the input
      var searchInput = component.find("searchInput");
      if (searchInput && searchInput.getElement) {
        searchInput.getElement().value = "";
      }
    } catch (e) {
      console.error("Error in handleResultClick:", e);
    }
  },

  toggleMobileMenu: function (component, event, helper) {
    var currentValue = component.get("v.mobileMenuOpen");
    component.set("v.mobileMenuOpen", !currentValue);
    helper.updateComputedProperties(component);
  },

  handleFabClick: function (component, event, helper) {
    try {
      var fabOptions = component.get("v.fabOptions");
      var fabUrl = component.get("v.fabUrl");

      if (fabOptions === "url_link" && fabUrl) {
        window.location.href = fabUrl;
      } else {
        // Default to toggle menu for custom options
        var currentValue = component.get("v.fabMenuOpen");
        component.set("v.fabMenuOpen", !currentValue);
        helper.updateComputedProperties(component);
      }
    } catch (e) {
      console.error("Error in handleFabClick:", e);
    }
  },

  handleScrollDown: function (component, event, helper) {
    // Get the height of the viewport
    var viewportHeight = window.innerHeight;

    // Scroll to just below the hero section
    window.scrollTo({
      top: viewportHeight,
      behavior: "smooth"
    });
  },

  /* COMMENTED OUT - Help Form not used
  toggleHelpForm: function (component, event, helper) {
    var currentValue = component.get("v.helpFormOpen");
    component.set("v.helpFormOpen", !currentValue);

    // Close menu if the form is being opened
    if (!currentValue) {
      component.set("v.fabMenuOpen", false);
      component.set("v.llmAssistantOpen", false);
    }

    helper.updateComputedProperties(component);
  },
  */

  toggleFabMenu: function (component, event, helper) {
    // Toggle menu for custom options
    var currentValue = component.get("v.fabMenuOpen");
    component.set("v.fabMenuOpen", !currentValue);
    helper.updateComputedProperties(component);
  },

  /* COMMENTED OUT - LLM Assistant not used
  toggleLlmAssistant: function (component, event, helper) {
    var currentValue = component.get("v.llmAssistantOpen");
    component.set("v.llmAssistantOpen", !currentValue);

    // Close other components if the assistant is being opened
    if (!currentValue) {
      component.set("v.fabMenuOpen", false);
      component.set("v.helpFormOpen", false);
    }

    helper.updateComputedProperties(component);
  },
  */

  closeAllDialogs: function (component, event, helper) {
    component.set("v.fabMenuOpen", false);
    // Removed helpFormOpen and llmAssistantOpen - not used
    helper.updateComputedProperties(component);
  },

  afterRender: function (component, event, helper) {
    // Inject SVG icons after rendering
    helper.injectSvgIcons(component);
  },

  handleDestroy: function(component, event, helper) {
    // Clean up the icon interval when component is destroyed
    var iconInterval = component.get("v.iconInterval");
    if (iconInterval) {
      clearInterval(iconInterval);
    }
  }
});