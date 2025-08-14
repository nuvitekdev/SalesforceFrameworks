import { LightningElement, api, track, wire } from "lwc";
import { ShowToastEvent } from "lightning/platformShowToastEvent";
import { loadScript } from "lightning/platformResourceLoader";
import PDF_LIB from "@salesforce/resourceUrl/pdf_lib";

// Apex methods
import getAvailableObjects from "@salesforce/apex/PdfTemplateController.getAvailableObjects";
import getObjectFields from "@salesforce/apex/PdfTemplateController.getObjectFields";
import saveTemplate from "@salesforce/apex/PdfTemplateController.saveTemplate";
import loadTemplate from "@salesforce/apex/PdfTemplateController.loadTemplate";
import getAvailableTemplates from "@salesforce/apex/PdfTemplateController.getAvailableTemplates";
import saveSignedPdf from "@salesforce/apex/PdfSignController.saveSignedPdf";
import getDocumentUrl from "@salesforce/apex/PdfSignController.getDocumentUrl";

export default class PdfCreatorDragDrop extends LightningElement {
  // Configurable properties matching pdfSigner style
  @api primaryColor = "#22BDC1";
  @api accentColor = "#D5DF23";
  @api primaryColorRgb = "34, 189, 193";
  @api accentColorRgb = "213, 223, 35";

  // Internal state
  @track currentStep = 0; // 0 = setup, 1 = field selection, 2 = design, 3 = preview/save
  @track selectedObject = null;
  @track availableObjects = [];
  @track allFields = [];
  @track selectedFields = [];
  @track displayedFields = []; // Filtered fields based on search
  @track pageSetup = {
    pageSize: "A4",
    orientation: "portrait",
    pageCount: 1
  };
  @track templateName = "";
  @track templateDescription = "";
  @track placedFields = []; // Fields placed on PDF pages
  @track pdfPages = []; // Array of page objects for rendering
  @track isLoading = false;
  @track isSaving = false;
  @track searchTerm = "";
  @track selectedFieldCategories = new Set(["all"]); // Categories to filter by
  @track fieldCategoryOptions = [
    { label: "All Fields", value: "all", checked: true },
    { label: "Text", value: "Text", checked: false },
    { label: "Number", value: "Number", checked: false },
    { label: "Date/Time", value: "Date/Time", checked: false },
    { label: "Picklist", value: "Picklist", checked: false },
    { label: "Checkbox", value: "Checkbox", checked: false },
    { label: "Formula", value: "Formula", checked: false },
    { label: "Relationship", value: "Relationship", checked: false }
  ];
  @track currentPageNum = 1;
  @track previewMode = false;
  @track selectedFieldForEdit = null; // For field property editing
  @track existingTemplates = [];
  @track selectedTemplateId = null;
  @track savedTemplateId = null; // Track the ID of the saved template for download
  @track templateMode = "create"; // 'create' or 'manage'
  @track selectedExistingTemplate = null; // Selected template for loading/downloading
  @track isLoadingTemplates = false; // Loading state for templates

  // Grid snapping configuration
  @track gridSnapEnabled = true; // Enable grid snapping by default
  gridSize = 10; // Grid size in pixels
  @track showGrid = false; // Show visual grid overlay

  // Theme variables
  themeVariablesSet = false;
  libsLoaded = false;
  PDFLib = null; // PDF-lib reference
  pdfDoc = null; // Current PDF document
  fieldsFiltered = false; // Flag to prevent infinite re-filtering

  // Data storage for images and signatures
  imageData = {}; // Stores base64 image data by placementId
  signatureData = {}; // Stores base64 signature data by placementId

  // Constants for PDF dimensions (in points - 72 points = 1 inch)
  pageSizes = {
    A4: { width: 595, height: 842 },
    Letter: { width: 612, height: 792 },
    Legal: { width: 612, height: 1008 }
  };

  // Getter methods for template conditionals
  get isStep0() {
    console.log("isStep0 called, currentStep:", this.currentStep);
    return this.currentStep === 0;
  }
  get isStep1() {
    console.log("isStep1 called, currentStep:", this.currentStep);
    return this.currentStep === 1;
  }
  get isStep2() {
    console.log("isStep2 called, currentStep:", this.currentStep);
    return this.currentStep === 2;
  }
  get isStep3() {
    console.log("isStep3 called, currentStep:", this.currentStep);
    return this.currentStep === 3;
  }
  get isStep4() {
    console.log("isStep4 called, currentStep:", this.currentStep);
    return this.currentStep === 4;
  }

  // Getter for current step class
  get currentStepClass() {
    const stepClass = `step-${this.currentStep}-mode`;
    console.log("currentStepClass:", stepClass);
    return stepClass;
  }

  // Getter for combined container classes
  get containerClasses() {
    const classes = `pdf-creator-container ${this.currentStepClass}`;
    console.log("containerClasses:", classes);
    return classes;
  }

  // Getter for page navigation
  get isFirstPage() {
    return this.currentPageNum <= 1;
  }

  get isLastPage() {
    return this.currentPageNum >= this.pageSetup.pageCount;
  }

  // Computed properties
  get pageSizeOptions() {
    return [
      { label: "A4 (210 × 297 mm)", value: "A4" },
      { label: "Letter (8.5 × 11 in)", value: "Letter" },
      { label: "Legal (8.5 × 14 in)", value: "Legal" }
    ];
  }

  get orientationOptions() {
    return [
      { label: "Portrait", value: "portrait" },
      { label: "Landscape", value: "landscape" }
    ];
  }

  get fieldCategories() {
    // Get unique categories from fields
    const categories = new Set(["all"]);
    this.allFields.forEach((field) => {
      if (field.category) {
        categories.add(field.category);
      }
    });
    return Array.from(categories).map((cat) => ({
      label: cat === "all" ? "All Fields" : cat,
      value: cat
    }));
  }

  get hasSelectedFields() {
    return this.selectedFields.length > 0;
  }

  get isObjectNotSelected() {
    const notSelected = !this.selectedObject;
    console.log(
      "isObjectNotSelected:",
      notSelected,
      "selectedObject:",
      this.selectedObject
    );
    return notSelected;
  }

  get noFieldsSelected() {
    const noFields = this.selectedFieldCount === 0;
    console.log("noFieldsSelected:", noFields);
    return noFields;
  }

  get selectedFieldCount() {
    const count = this.selectedFields ? this.selectedFields.length : 0;
    console.log("selectedFieldCount:", count);
    return count;
  }

  get totalFieldCount() {
    const count = this.allFields ? this.allFields.length : 0;
    console.log("totalFieldCount:", count);
    return count;
  }

  // Template mode getters
  get isCreateMode() {
    return this.templateMode === "create";
  }

  get isManageMode() {
    return this.templateMode === "manage";
  }

  get templateModeOptions() {
    return [
      { label: "Create New Template", value: "create" },
      { label: "Manage Existing Templates", value: "manage" }
    ];
  }

  get hasExistingTemplates() {
    return this.existingTemplates && this.existingTemplates.length > 0;
  }

  // Getter for placed fields count
  get placedFieldsCount() {
    return this.placedFields ? this.placedFields.length : 0;
  }

  // Get current page dimensions based on setup
  get currentPageDimensions() {
    const baseSize = this.pageSizes[this.pageSetup.pageSize];
    console.log("currentPageDimensions - pageSetup:", this.pageSetup);
    console.log(
      "currentPageDimensions - baseSize for",
      this.pageSetup.pageSize,
      ":",
      baseSize
    );

    // Defensive check - fallback to A4 if pageSize is not found
    if (!baseSize) {
      console.warn(
        "Page size not found:",
        this.pageSetup.pageSize,
        "falling back to A4"
      );
      const fallbackSize = this.pageSizes["A4"];
      if (this.pageSetup.orientation === "landscape") {
        return { width: fallbackSize.height, height: fallbackSize.width };
      }
      return fallbackSize;
    }

    if (this.pageSetup.orientation === "landscape") {
      return { width: baseSize.height, height: baseSize.width };
    }
    return baseSize;
  }

  // Lifecycle hooks
  renderedCallback() {
    console.log("renderedCallback called, currentStep:", this.currentStep);
    console.log(
      "libsLoaded:",
      this.libsLoaded,
      "themeVariablesSet:",
      this.themeVariablesSet
    );

    // Load static resources once
    if (!this.libsLoaded) {
      console.log("Loading PDF-lib...");
      this.libsLoaded = true;
      loadScript(this, PDF_LIB)
        .then(() => {
          this.PDFLib = window.PDFLib;
          console.log("PDF-lib loaded successfully");
        })
        .catch((error) => {
          console.error("Error loading PDF-lib", error);
        });
    }

    // Set theme variables once
    if (!this.themeVariablesSet) {
      console.log("Setting theme variables...");
      this.themeVariablesSet = true;
      this.updateThemeVariables();
      this.updatePathClasses();
    }

    // Initialize PDF pages when entering design step
    if (this.currentStep === 2 && this.pdfPages.length === 0) {
      console.log("Initializing PDF pages for design step...");
      this.initializePdfPages();
    }

    // Fix combobox functionality on step 0 - call multiple times for robustness
    if (this.currentStep === 0) {
      this.ensureComboboxFunctionality();
      // Additional calls with delays to ensure it works
      setTimeout(() => this.ensureComboboxFunctionality(), 500);
      setTimeout(() => this.ensureComboboxFunctionality(), 1000);
    }
  }

  connectedCallback() {
    console.log("connectedCallback called - loading objects and templates...");
    // Load available objects and existing templates on component initialization
    this.loadObjects();
    this.loadExistingTemplates();
  }

  // Load available Salesforce objects
  async loadObjects() {
    console.log("loadObjects called...");
    this.isLoading = true;
    try {
      console.log("Calling getAvailableObjects...");
      const objects = await getAvailableObjects();
      console.log("Raw objects received:", objects);

      this.availableObjects = objects
        .map((obj) => ({
          label: obj.label + (obj.isCustom ? " (Custom)" : ""),
          value: obj.value,
          description: `API Name: ${obj.value}`,
          ...obj
        }))
        .sort((a, b) => a.label.localeCompare(b.label)); // Sort alphabetically
      console.log(
        `Successfully loaded ${this.availableObjects.length} objects:`,
        this.availableObjects
      );

      // Ensure combobox is working after data is loaded
      setTimeout(() => {
        this.ensureComboboxFunctionality();
      }, 100);
    } catch (error) {
      console.error("Error loading objects:", error);
      console.error("Error details:", error.body);
      this.showToast(
        "Error",
        "Failed to load objects: " + error.body?.message,
        "error"
      );
    } finally {
      this.isLoading = false;
      console.log("loadObjects completed, isLoading:", this.isLoading);
    }
  }

  // Handle object selection
  handleObjectSelect(event) {
    console.log("handleObjectSelect called with value:", event.detail.value);
    this.selectedObject = event.detail.value;
    console.log("Selected object set to:", this.selectedObject);

    // Reset field selections when object changes
    this.allFields = [];
    this.selectedFields = [];
    this.displayedFields = [];
    this.fieldsFiltered = false; // Reset filtering flag
    console.log("Field arrays reset");

    // Load fields for selected object
    if (this.selectedObject) {
      console.log("Loading fields for selected object...");
      this.loadFieldsForObject();
    } else {
      console.log("No object selected, skipping field loading");
    }
  }

  // Load fields for selected object
  async loadFieldsForObject() {
    console.log("loadFieldsForObject called for object:", this.selectedObject);
    this.isLoading = true;
    try {
      console.log(
        "Calling getObjectFields with objectApiName:",
        this.selectedObject
      );
      const fields = await getObjectFields({
        objectApiName: this.selectedObject
      });
      console.log("Raw fields received:", fields);

      this.allFields = fields.map((field) => ({
        ...field,
        id: field.value, // Add unique ID for tracking
        selected: false,
        iconName: this.getFieldIcon(field.type),
        category: this.getFieldCategory(field.type) // Add category based on type
      }));
      console.log(
        `Successfully loaded ${this.allFields.length} fields for ${this.selectedObject}:`,
        this.allFields
      );

      // Update displayed fields (only once after loading)
      console.log("Calling filterFields to update display...");
      this.fieldsFiltered = false; // Reset flag before filtering
      this.filterFields();
      this.fieldsFiltered = true; // Set flag to prevent re-filtering
    } catch (error) {
      console.error("Error loading fields:", error);
      console.error("Error details:", error.body);
      this.showToast(
        "Error",
        "Failed to load fields: " + error.body?.message,
        "error"
      );
    } finally {
      this.isLoading = false;
      console.log("loadFieldsForObject completed, isLoading:", this.isLoading);
    }
  }

  // Get icon for field type
  getFieldIcon(fieldType) {
    const iconMap = {
      STRING: "utility:text",
      TEXTAREA: "utility:textarea",
      PICKLIST: "utility:picklist",
      MULTIPICKLIST: "utility:multi_picklist",
      BOOLEAN: "utility:checkbox",
      DATE: "utility:date_input",
      DATETIME: "utility:date_time",
      TIME: "utility:clock",
      EMAIL: "utility:email",
      PHONE: "utility:phone_portrait",
      URL: "utility:link",
      CURRENCY: "utility:currency",
      DOUBLE: "utility:number_input",
      INTEGER: "utility:number_input",
      PERCENT: "utility:percent",
      REFERENCE: "utility:record_lookup",
      ID: "utility:key",
      ENCRYPTED: "utility:lock"
    };
    const icon = iconMap[fieldType] || "utility:text";
    console.log("getFieldIcon for type:", fieldType, "returning:", icon);
    return icon;
  }

  // Get category for field type
  getFieldCategory(fieldType) {
    const categoryMap = {
      STRING: "Text",
      TEXTAREA: "Text",
      EMAIL: "Text",
      PHONE: "Text",
      URL: "Text",
      ID: "Text",
      ENCRYPTED: "Text",
      DOUBLE: "Number",
      INTEGER: "Number",
      CURRENCY: "Number",
      PERCENT: "Number",
      DATE: "Date/Time",
      DATETIME: "Date/Time",
      TIME: "Date/Time",
      PICKLIST: "Picklist",
      MULTIPICKLIST: "Picklist",
      BOOLEAN: "Checkbox",
      REFERENCE: "Relationship",
      FORMULA: "Formula"
    };
    const category = categoryMap[fieldType] || "Text";
    console.log(
      "getFieldCategory for type:",
      fieldType,
      "returning:",
      category
    );
    return category;
  }

  // Get default field dimensions based on field type
  getDefaultFieldDimensions(fieldType) {
    // Default dimensions based on field type - MORE REALISTIC SIZES
    let width = 200;
    let height = 30;

    if (fieldType === "TEXTAREA" || fieldType === "LONG_TEXT_AREA") {
      width = 300;
      height = 100; // Taller for text areas
    } else if (fieldType === "BOOLEAN") {
      width = 20;
      height = 20; // Square for checkboxes
    } else if (
      fieldType === "CURRENCY" ||
      fieldType === "DOUBLE" ||
      fieldType === "INTEGER"
    ) {
      width = 120; // Narrower for numbers
    } else if (fieldType === "DATE" || fieldType === "DATETIME") {
      width = 150; // Medium width for dates
    } else if (fieldType === "PICKLIST" || fieldType === "MULTIPICKLIST") {
      width = 200;
      height = 35; // Slightly taller for dropdowns
    }
    // Generic field dimensions
    else if (fieldType === "GENERIC_TITLE") {
      width = 400;
      height = 40; // Large title
    } else if (fieldType === "GENERIC_SUBTITLE") {
      width = 350;
      height = 30; // Medium subtitle
    } else if (fieldType === "GENERIC_SECTION_HEADER") {
      width = 300;
      height = 35; // Section headers
    } else if (fieldType === "GENERIC_TEXT") {
      width = 400;
      height = 80; // Text blocks
    } else if (fieldType === "GENERIC_DATE") {
      width = 120;
      height = 25; // Compact date
    } else if (fieldType === "GENERIC_PAGE_NUMBER") {
      width = 80;
      height = 20; // Small page number
    } else if (fieldType === "GENERIC_SEPARATOR") {
      width = 400;
      height = 2; // Thin line
    } else if (fieldType === "GENERIC_SIGNATURE") {
      width = 200;
      height = 60; // Signature area
    } else if (fieldType === "GENERIC_IMAGE") {
      width = 150;
      height = 100; // Image/logo area
    } else if (fieldType === "GENERIC_TABLE") {
      width = 500;
      height = 200; // Table area
    }

    return { width, height };
  }

  // Filter fields based on search and category
  filterFields() {
    console.log(
      "filterFields called - searchTerm:",
      this.searchTerm,
      "categories:",
      Array.from(this.selectedFieldCategories)
    );

    // Prevent infinite re-filtering unless explicitly requested
    if (
      this.fieldsFiltered &&
      this.allFields.length > 0 &&
      this.displayedFields.length > 0
    ) {
      console.log("Fields already filtered, skipping to prevent infinite loop");
      return;
    }

    let filtered = [...this.allFields];
    console.log("Starting with", filtered.length, "fields");

    // Apply search filter
    if (this.searchTerm) {
      const searchLower = this.searchTerm.toLowerCase();
      const beforeFilter = filtered.length;
      filtered = filtered.filter(
        (field) =>
          field.label.toLowerCase().includes(searchLower) ||
          field.value.toLowerCase().includes(searchLower)
      );
      console.log(
        "After search filter:",
        filtered.length,
        "fields (was",
        beforeFilter,
        ")"
      );
    }

    // Apply category filter
    if (!this.selectedFieldCategories.has("all")) {
      const beforeFilter = filtered.length;
      filtered = filtered.filter((field) =>
        this.selectedFieldCategories.has(field.category)
      );
      console.log(
        "After category filter:",
        filtered.length,
        "fields (was",
        beforeFilter,
        ")"
      );
    }

    this.displayedFields = filtered;
    console.log(
      "filterFields completed - displayedFields length:",
      this.displayedFields.length
    );
  }

  // Handle search input
  handleFieldSearch(event) {
    this.searchTerm = event.target.value;
    console.log("handleFieldSearch called with term:", this.searchTerm);
    this.fieldsFiltered = false; // Reset flag to allow filtering
    this.filterFields();
  }

  // Handle category filter change
  handleCategoryChange(event) {
    const category = event.target.dataset.category;
    const isChecked = event.target.checked;
    console.log(
      "handleCategoryChange called - category:",
      category,
      "isChecked:",
      isChecked
    );

    // Update the checked property in fieldCategoryOptions
    this.fieldCategoryOptions = this.fieldCategoryOptions.map((opt) => {
      if (opt.value === category) {
        return { ...opt, checked: isChecked };
      }
      if (category === "all" && isChecked) {
        // If 'all' is checked, uncheck all others
        return { ...opt, checked: opt.value === "all" };
      }
      if (category !== "all" && isChecked && opt.value === "all") {
        // If any specific category is checked, uncheck 'all'
        return { ...opt, checked: false };
      }
      return opt;
    });

    // Update selected categories set
    if (category === "all") {
      if (isChecked) {
        // Select all categories
        this.selectedFieldCategories = new Set(["all"]);
      }
    } else {
      if (isChecked) {
        this.selectedFieldCategories.add(category);
        this.selectedFieldCategories.delete("all");
      } else {
        this.selectedFieldCategories.delete(category);
        if (this.selectedFieldCategories.size === 0) {
          // If no categories selected, default to 'all'
          this.selectedFieldCategories.add("all");
          this.fieldCategoryOptions = this.fieldCategoryOptions.map((opt) => ({
            ...opt,
            checked: opt.value === "all"
          }));
        }
      }
    }

    console.log(
      "Updated selectedFieldCategories:",
      Array.from(this.selectedFieldCategories)
    );
    this.fieldsFiltered = false; // Reset flag to allow filtering
    this.filterFields();
  }

  // Handle field selection checkbox
  handleFieldSelect(event) {
    const fieldId = event.target.dataset.fieldId;
    const isChecked = event.target.checked;
    console.log(
      "handleFieldSelect called - fieldId:",
      fieldId,
      "isChecked:",
      isChecked
    );

    // Update field selection state
    const field = this.allFields.find((f) => f.id === fieldId);
    if (field) {
      console.log("Found field:", field.label);
      field.selected = isChecked;

      if (isChecked) {
        // Add to selected fields if not already there
        if (!this.selectedFields.find((f) => f.id === fieldId)) {
          this.selectedFields.push(field);
          console.log(
            "Added field to selection. Total selected:",
            this.selectedFields.length
          );
        }
      } else {
        // Remove from selected fields
        const beforeLength = this.selectedFields.length;
        this.selectedFields = this.selectedFields.filter(
          (f) => f.id !== fieldId
        );
        console.log(
          "Removed field from selection. Was:",
          beforeLength,
          "Now:",
          this.selectedFields.length
        );
      }
    } else {
      console.error("Field not found with ID:", fieldId);
    }

    // Update displayed fields to reflect selection
    this.displayedFields = [...this.displayedFields];
    console.log("Updated displayedFields array");
  }

  // Handle select/deselect all
  handleSelectAll() {
    console.log(
      "handleSelectAll called - selecting",
      this.displayedFields.length,
      "fields"
    );
    this.displayedFields.forEach((field) => {
      field.selected = true;
      if (!this.selectedFields.find((f) => f.id === field.id)) {
        this.selectedFields.push(field);
      }
    });
    this.displayedFields = [...this.displayedFields];
    console.log(
      "All fields selected. Total selected:",
      this.selectedFields.length
    );
  }

  handleDeselectAll() {
    console.log(
      "handleDeselectAll called - deselecting",
      this.displayedFields.length,
      "fields"
    );
    this.displayedFields.forEach((field) => {
      field.selected = false;
    });
    const beforeLength = this.selectedFields.length;
    this.selectedFields = this.selectedFields.filter(
      (selected) =>
        !this.displayedFields.find((displayed) => displayed.id === selected.id)
    );
    console.log(
      "All fields deselected. Was:",
      beforeLength,
      "Now:",
      this.selectedFields.length
    );
    this.displayedFields = [...this.displayedFields];
  }

  // Page setup handlers
  handlePageSizeChange(event) {
    this.pageSetup.pageSize = event.detail.value;
    console.log("Page size changed to:", this.pageSetup.pageSize);
  }

  handleOrientationChange(event) {
    this.pageSetup.orientation = event.detail.value;
    console.log("Orientation changed to:", this.pageSetup.orientation);
  }

  handlePageCountChange(event) {
    this.pageSetup.pageCount = parseInt(event.target.value, 10) || 1;
    console.log("Page count changed to:", this.pageSetup.pageCount);
  }

  // Navigation between steps
  goToStep(event) {
    const step = parseInt(event.currentTarget.dataset.step, 10);
    const previousStep = this.currentStep;

    console.log("goToStep called - from step:", previousStep, "to step:", step);
    console.log(
      "Current state - selectedObject:",
      this.selectedObject,
      "selectedFields:",
      this.selectedFields.length
    );

    // Validation before moving forward
    if (step > previousStep) {
      console.log("Moving forward - checking validation...");
      if (previousStep === 0 && !this.selectedObject) {
        console.log("Validation failed: No object selected");
        this.showToast("Warning", "Please select an object first", "warning");
        return;
      }
      if (previousStep === 1 && this.selectedFields.length === 0) {
        console.log("Validation failed: No fields selected");
        this.showToast(
          "Warning",
          "Please select at least one field",
          "warning"
        );
        return;
      }
    }

    console.log(
      "Validation passed - updating step from",
      this.currentStep,
      "to",
      step
    );
    this.currentStep = step;
    console.log("Step updated - currentStep is now:", this.currentStep);

    try {
      this.updatePathClasses();
      console.log("Path classes updated successfully");
    } catch (error) {
      console.error("Error updating path classes:", error);
    }

    // Initialize design area when entering step 2
    if (step === 2) {
      console.log("Entering step 2 - checking PDF pages...");
      if (this.pdfPages.length === 0) {
        console.log("No PDF pages exist - initializing...");
        try {
          this.initializePdfPages();
          console.log("PDF pages initialized successfully");
        } catch (error) {
          console.error("Error initializing PDF pages:", error);
        }
      } else {
        console.log("PDF pages already exist - re-rendering fields...");
        // Re-render existing fields when returning to design step
        setTimeout(() => {
          this.renderExistingFieldsOnPages();
        }, 100); // Small delay to ensure DOM is ready
      }
    }

    console.log("goToStep completed successfully");
  }

  // Initialize PDF pages for design - Updated to handle existing fields
  initializePdfPages() {
    console.log("initializePdfPages called - pageSetup:", this.pageSetup);
    console.log("Current PDFLib status:", !!this.PDFLib);
    console.log("Existing placed fields:", this.placedFields.length);

    try {
      this.pdfPages = [];
      for (let i = 0; i < this.pageSetup.pageCount; i++) {
        this.pdfPages.push({
          pageNumber: i + 1,
          fields: [],
          cssClass: this.getPageCssClass(i + 1)
        });
      }
      console.log(
        "Created",
        this.pdfPages.length,
        "PDF page objects:",
        this.pdfPages
      );

      // Create blank PDF document
      if (this.PDFLib) {
        console.log("PDFLib is available, creating blank PDF...");
        this.createBlankPdf();
      } else {
        console.warn("PDFLib not loaded yet, skipping PDF creation");
      }

      // If we have existing placed fields (from loaded template), render them
      if (this.placedFields.length > 0) {
        console.log(
          "Rendering",
          this.placedFields.length,
          "existing fields on pages"
        );
        setTimeout(() => {
          this.renderExistingFieldsOnPages();
        }, 100); // Small delay to ensure pages are rendered
      }
    } catch (error) {
      console.error("Error in initializePdfPages:", error);
      throw error;
    }
  }

  // Render existing fields on pages (for loaded templates)
  renderExistingFieldsOnPages() {
    console.log("renderExistingFieldsOnPages called");

    // First, clear all existing field elements from the DOM
    const allPlacedFields = this.template.querySelectorAll(".placed-field");
    console.log(
      "Clearing",
      allPlacedFields.length,
      "existing field elements from DOM"
    );
    allPlacedFields.forEach((field) => field.remove());

    // Clear page fields arrays
    this.pdfPages.forEach((page) => {
      page.fields = [];
    });

    // Now re-render all placed fields
    this.placedFields.forEach((placement) => {
      const pageElement = this.template.querySelector(
        `[data-page-num="${placement.pageNumber}"]`
      );
      if (pageElement) {
        // Update overlay coordinates based on current page size
        const overlayWidth = pageElement.clientWidth;
        const overlayHeight = pageElement.clientHeight;

        // Convert from relative positions to actual overlay coordinates
        placement.overlayX = placement.relativeX * overlayWidth;
        placement.overlayY = placement.relativeY * overlayHeight;
        placement.overlayWidth = placement.relativeWidth * overlayWidth;
        placement.overlayHeight = placement.relativeHeight * overlayHeight;

        console.log(
          `Rendering field ${placement.fieldLabel} on page ${placement.pageNumber} at overlay position:`,
          placement.overlayX,
          placement.overlayY
        );

        // Add to page fields array
        const pageIndex = placement.pageNumber - 1;
        if (!this.pdfPages[pageIndex].fields) {
          this.pdfPages[pageIndex].fields = [];
        }
        this.pdfPages[pageIndex].fields.push(placement);

        // Render the field
        this.renderFieldOnPage(placement, pageElement);
      } else {
        console.warn(`Page element not found for page ${placement.pageNumber}`);
      }
    });
  }

  // Create blank PDF with pdf-lib
  async createBlankPdf() {
    console.log("createBlankPdf called");
    try {
      console.log("Creating new PDFDocument...");
      this.pdfDoc = await this.PDFLib.PDFDocument.create();
      console.log("PDFDocument created successfully");

      // Add pages based on setup
      const dimensions = this.currentPageDimensions;
      console.log("Page dimensions:", dimensions);

      for (let i = 0; i < this.pageSetup.pageCount; i++) {
        console.log(
          "Adding page",
          i + 1,
          "with dimensions:",
          dimensions.width,
          "x",
          dimensions.height
        );
        this.pdfDoc.addPage([dimensions.width, dimensions.height]);
      }

      console.log(
        `Successfully created blank PDF with ${this.pageSetup.pageCount} pages`
      );
    } catch (error) {
      console.error("Error creating blank PDF:", error);
      throw error;
    }
  }

  // Handle drag start for fields
  handleFieldDragStart(event) {
    const fieldId = event.currentTarget.dataset.fieldId;
    console.log("handleFieldDragStart called for field:", fieldId);

    // Look for field in both selectedFields and genericFields
    let field = this.selectedFields.find((f) => f.id === fieldId);
    if (!field) {
      field = this.genericFields.find((f) => f.id === fieldId);
    }

    if (field) {
      console.log("Found field for drag:", field.label);
      // Store field data for drop
      event.dataTransfer.setData("fieldData", JSON.stringify(field));
      event.dataTransfer.effectAllowed = "copy";

      // Add visual feedback
      event.currentTarget.classList.add("dragging");
      console.log("Drag started successfully");
    } else {
      console.error("Field not found for drag start:", fieldId);
    }
  }

  handleFieldDragEnd(event) {
    console.log("handleFieldDragEnd called");
    event.currentTarget.classList.remove("dragging");
  }

  // Handle drag over PDF page
  handlePageDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";

    // Add visual feedback
    event.currentTarget.classList.add("drag-over");
  }

  handlePageDragLeave(event) {
    event.currentTarget.classList.remove("drag-over");
  }

  // Handle drop on PDF page
  handlePageDrop(event) {
    event.preventDefault();
    event.currentTarget.classList.remove("drag-over");

    try {
      const fieldData = JSON.parse(event.dataTransfer.getData("fieldData"));
      const pageElement = event.currentTarget;
      const pageNum = parseInt(pageElement.dataset.pageNum, 10);

      // Get drop position relative to page - USING SAME COORDINATE SYSTEM AS PDFSIGNER
      const rect = pageElement.getBoundingClientRect();
      let offsetX = event.clientX - rect.left;
      let offsetY = event.clientY - rect.top;

      // Get default field dimensions based on type
      const fieldDimensions = this.getDefaultFieldDimensions(fieldData.type);

      // Adjust position to account for field dimensions (center the field on cursor)
      offsetX = Math.max(0, offsetX - fieldDimensions.width / 2);
      offsetY = Math.max(0, offsetY - fieldDimensions.height / 2);

      // Ensure field doesn't go past page boundaries
      const maxX = pageElement.clientWidth - fieldDimensions.width;
      const maxY = pageElement.clientHeight - fieldDimensions.height;
      offsetX = Math.min(offsetX, maxX);
      offsetY = Math.min(offsetY, maxY);

      // Apply grid snapping if enabled
      if (this.gridSnapEnabled) {
        offsetX = Math.round(offsetX / this.gridSize) * this.gridSize;
        offsetY = Math.round(offsetY / this.gridSize) * this.gridSize;
      }

      console.log("Drop position adjusted:", {
        offsetX,
        offsetY,
        pageWidth: pageElement.clientWidth,
        pageHeight: pageElement.clientHeight
      });

      // Place field on page using pdfSigner coordinate system
      this.placeFieldOnPage(fieldData, pageNum, offsetX, offsetY, pageElement);
    } catch (error) {
      console.error("Error handling drop:", error);
    }
  }

  // Place field on PDF page - USING PDFSIGNER COORDINATE SYSTEM
  placeFieldOnPage(fieldData, pageNum, offsetX, offsetY, pageElement) {
    const placementId =
      "field-" + Date.now() + "-" + Math.random().toString(36).substr(2, 9);

    // Get page dimensions for coordinate conversion (like pdfSigner)
    const overlayWidth = pageElement.clientWidth;
    const overlayHeight = pageElement.clientHeight;
    const pdfDimensions = this.currentPageDimensions;

    // Get field dimensions
    const dimensions = this.getDefaultFieldDimensions(fieldData.type);
    const width = dimensions.width;
    const height = dimensions.height;

    // Compute relative positions as percentages (pdfSigner method)
    const relativeX = offsetX / overlayWidth;
    const relativeY = offsetY / overlayHeight;

    // Calculate actual PDF coordinates (PDF origin is bottom-left)
    // For PDF: Y increases from bottom to top
    // For UI: Y increases from top to bottom
    const pdfX = relativeX * pdfDimensions.width;
    // Correct calculation: measure from bottom of page, accounting for field height
    const pdfY =
      pdfDimensions.height -
      ((offsetY + height) / overlayHeight) * pdfDimensions.height;

    // Calculate relative size (pdfSigner method)
    const relativeWidth = width / overlayWidth;
    const relativeHeight = height / overlayHeight;

    // Create field placement object with PDF coordinates
    const placement = {
      id: placementId,
      fieldApiName: fieldData.value,
      fieldLabel: fieldData.label,
      fieldType: fieldData.type,
      pageNumber: pageNum,
      x: pdfX, // Store PDF coordinates
      y: pdfY, // Store PDF coordinates (from bottom)
      width: relativeWidth * pdfDimensions.width, // PDF width
      height: relativeHeight * pdfDimensions.height, // PDF height
      fontSize: 12,
      fontFamily: "Arial",
      alignment: "left",
      selected: false,
      // Store overlay positions for UI rendering
      overlayX: offsetX,
      overlayY: offsetY,
      overlayWidth: width,
      overlayHeight: height,
      // Store relative positions for later use
      relativeX: relativeX,
      relativeY: relativeY,
      relativeWidth: relativeWidth,
      relativeHeight: relativeHeight
    };

    // Add to placed fields
    this.placedFields.push(placement);

    // Update page fields array
    const pageIndex = pageNum - 1;
    if (!this.pdfPages[pageIndex].fields) {
      this.pdfPages[pageIndex].fields = [];
    }
    this.pdfPages[pageIndex].fields.push(placement);

    // Render the field on the page with proper form element
    this.renderFieldOnPage(placement, pageElement);

    console.log(
      `Placed field ${fieldData.label} at PDF coordinates:`,
      pdfX,
      pdfY
    );
  }

  // Render field element on page - CREATE ACTUAL FORM ELEMENTS BASED ON TYPE
  renderFieldOnPage(placement, pageElement) {
    if (!pageElement) {
      pageElement = this.template.querySelector(
        `[data-page-num="${placement.pageNumber}"]`
      );
    }
    if (!pageElement) return;

    // Create field container
    const fieldElement = document.createElement("div");
    fieldElement.className = "placed-field";
    fieldElement.dataset.placementId = placement.id;
    fieldElement.style.position = "absolute";
    fieldElement.style.left = placement.overlayX + "px";
    fieldElement.style.top = placement.overlayY + "px";
    fieldElement.style.width = placement.overlayWidth + "px";
    fieldElement.style.height = placement.overlayHeight + "px";

    // Create the actual form element based on field type
    const formElement = this.createFormElementByType(placement);

    // Add field label
    const labelElement = document.createElement("div");
    labelElement.className = "field-label";
    labelElement.textContent = placement.fieldLabel;
    labelElement.style.fontSize = "10px";
    labelElement.style.fontWeight = "bold";
    labelElement.style.marginBottom = "2px";
    labelElement.style.color = "#333";
    labelElement.style.pointerEvents = "none";

    // Add form element container
    const formContainer = document.createElement("div");
    formContainer.className = "field-form-element";
    formContainer.appendChild(formElement);

    // Add field content
    const fieldContent = document.createElement("div");
    fieldContent.className = "field-content";
    fieldContent.appendChild(labelElement);
    fieldContent.appendChild(formContainer);

    fieldElement.appendChild(fieldContent);

    // Add field controls
    const controlsDiv = document.createElement("div");
    controlsDiv.className = "field-controls";
    controlsDiv.innerHTML = `
            <button class="resize-handle resize-se" data-handle="se"></button>
            <button class="remove-field" data-placement-id="${placement.id}">✖</button>
        `;

    fieldElement.appendChild(controlsDiv);

    // Add event listeners
    fieldElement.addEventListener("mousedown", (e) =>
      this.startDragField(e, placement)
    );
    fieldElement
      .querySelector(".remove-field")
      .addEventListener("click", (e) => this.removeField(e));
    fieldElement
      .querySelector(".resize-handle")
      .addEventListener("mousedown", (e) =>
        this.startResizeField(e, placement)
      );

    pageElement.appendChild(fieldElement);
  }

  // Create actual form elements based on field type
  createFormElementByType(placement) {
    let element;

    switch (placement.fieldType) {
      case "TEXTAREA":
      case "LONG_TEXT_AREA":
        element = document.createElement("textarea");
        element.placeholder = `Enter ${placement.fieldLabel}...`;
        element.style.width = "100%";
        element.style.height = "80px";
        element.style.resize = "none";
        element.style.border = "1px solid #ccc";
        element.style.borderRadius = "4px";
        element.style.padding = "4px";
        element.style.fontSize = "12px";
        element.style.fontFamily = "Arial, sans-serif";
        break;

      case "BOOLEAN":
        element = document.createElement("input");
        element.type = "checkbox";
        element.style.width = "18px";
        element.style.height = "18px";
        element.style.margin = "0";
        break;

      case "DATE":
        element = document.createElement("input");
        element.type = "date";
        element.style.width = "100%";
        element.style.border = "1px solid #ccc";
        element.style.borderRadius = "4px";
        element.style.padding = "4px";
        element.style.fontSize = "12px";
        break;

      case "DATETIME":
        element = document.createElement("input");
        element.type = "datetime-local";
        element.style.width = "100%";
        element.style.border = "1px solid #ccc";
        element.style.borderRadius = "4px";
        element.style.padding = "4px";
        element.style.fontSize = "12px";
        break;

      case "TIME":
        element = document.createElement("input");
        element.type = "time";
        element.style.width = "100%";
        element.style.border = "1px solid #ccc";
        element.style.borderRadius = "4px";
        element.style.padding = "4px";
        element.style.fontSize = "12px";
        break;

      case "EMAIL":
        element = document.createElement("input");
        element.type = "email";
        element.placeholder = `Enter ${placement.fieldLabel}...`;
        element.style.width = "100%";
        element.style.border = "1px solid #ccc";
        element.style.borderRadius = "4px";
        element.style.padding = "4px";
        element.style.fontSize = "12px";
        break;

      case "PHONE":
        element = document.createElement("input");
        element.type = "tel";
        element.placeholder = `Enter ${placement.fieldLabel}...`;
        element.style.width = "100%";
        element.style.border = "1px solid #ccc";
        element.style.borderRadius = "4px";
        element.style.padding = "4px";
        element.style.fontSize = "12px";
        break;

      case "URL":
        element = document.createElement("input");
        element.type = "url";
        element.placeholder = `Enter ${placement.fieldLabel}...`;
        element.style.width = "100%";
        element.style.border = "1px solid #ccc";
        element.style.borderRadius = "4px";
        element.style.padding = "4px";
        element.style.fontSize = "12px";
        break;

      case "CURRENCY":
      case "DOUBLE":
      case "INTEGER":
      case "PERCENT":
        element = document.createElement("input");
        element.type = "number";
        element.placeholder = `Enter ${placement.fieldLabel}...`;
        element.style.width = "100%";
        element.style.border = "1px solid #ccc";
        element.style.borderRadius = "4px";
        element.style.padding = "4px";
        element.style.fontSize = "12px";
        if (placement.fieldType === "CURRENCY") {
          element.step = "0.01";
        } else if (placement.fieldType === "INTEGER") {
          element.step = "1";
        }
        break;

      case "PICKLIST":
        element = document.createElement("select");
        element.style.width = "100%";
        element.style.border = "1px solid #ccc";
        element.style.borderRadius = "4px";
        element.style.padding = "4px";
        element.style.fontSize = "12px";
        // Add placeholder option
        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = `Select ${placement.fieldLabel}...`;
        defaultOption.disabled = true;
        defaultOption.selected = true;
        element.appendChild(defaultOption);
        // Add sample options
        ["Option 1", "Option 2", "Option 3"].forEach((optText) => {
          const option = document.createElement("option");
          option.value = optText.toLowerCase().replace(" ", "_");
          option.textContent = optText;
          element.appendChild(option);
        });
        break;

      case "MULTIPICKLIST":
        element = document.createElement("select");
        element.multiple = true;
        element.size = 3;
        element.style.width = "100%";
        element.style.border = "1px solid #ccc";
        element.style.borderRadius = "4px";
        element.style.padding = "4px";
        element.style.fontSize = "12px";
        // Add sample options
        ["Option 1", "Option 2", "Option 3", "Option 4"].forEach((optText) => {
          const option = document.createElement("option");
          option.value = optText.toLowerCase().replace(" ", "_");
          option.textContent = optText;
          element.appendChild(option);
        });
        break;

      // Generic field types
      case "GENERIC_TITLE":
        element = document.createElement("h1");
        element.contentEditable = true;
        element.textContent = "Document Title";
        element.style.fontSize = "24px";
        element.style.fontWeight = "bold";
        element.style.color = "#333";
        element.style.margin = "0";
        element.style.padding = "4px";
        element.style.border = "1px dashed #ccc";
        break;

      case "GENERIC_SUBTITLE":
        element = document.createElement("h2");
        element.contentEditable = true;
        element.textContent = "Subtitle";
        element.style.fontSize = "18px";
        element.style.fontWeight = "600";
        element.style.color = "#555";
        element.style.margin = "0";
        element.style.padding = "4px";
        element.style.border = "1px dashed #ccc";
        break;

      case "GENERIC_SECTION_HEADER":
        element = document.createElement("h3");
        element.contentEditable = true;
        element.textContent = "Section Header";
        element.style.fontSize = "16px";
        element.style.fontWeight = "bold";
        element.style.color = "#444";
        element.style.margin = "0";
        element.style.padding = "4px";
        element.style.borderBottom = "2px solid #22BDC1";
        break;

      case "GENERIC_TEXT":
        element = document.createElement("div");
        element.contentEditable = true;
        element.textContent = "Enter your text here...";
        element.style.fontSize = "12px";
        element.style.color = "#666";
        element.style.padding = "8px";
        element.style.border = "1px dashed #ccc";
        element.style.minHeight = "60px";
        element.style.lineHeight = "1.5";
        break;

      case "GENERIC_DATE":
        element = document.createElement("span");
        element.textContent = new Date().toLocaleDateString();
        element.style.fontSize = "12px";
        element.style.color = "#666";
        element.style.padding = "4px";
        break;

      case "GENERIC_PAGE_NUMBER":
        element = document.createElement("span");
        element.textContent = `Page ${placement.pageNumber}`;
        element.style.fontSize = "10px";
        element.style.color = "#999";
        element.style.padding = "2px";
        break;

      case "GENERIC_SEPARATOR":
        element = document.createElement("hr");
        element.style.border = "none";
        element.style.borderTop = "1px solid #ccc";
        element.style.margin = "0";
        element.style.width = "100%";
        break;

      case "GENERIC_SIGNATURE":
        element = document.createElement("div");
        element.className = "signature-field-container";
        element.style.width = "100%";
        element.style.height = "100%";
        element.style.position = "relative";

        // Create canvas for signature drawing
        const canvas = document.createElement("canvas");
        canvas.width = 200;
        canvas.height = 60;
        canvas.style.width = "100%";
        canvas.style.height = "calc(100% - 20px)";
        canvas.style.border = "1px solid #ccc";
        canvas.style.backgroundColor = "white";
        canvas.style.cursor = "crosshair";
        canvas.dataset.placementId = placement.id;

        // Initialize signature drawing
        this.initializeSignatureCanvas(canvas);

        element.appendChild(canvas);

        // Add clear button and label
        const signControls = document.createElement("div");
        signControls.style.display = "flex";
        signControls.style.justifyContent = "space-between";
        signControls.style.alignItems = "center";
        signControls.style.marginTop = "2px";

        const signLabel = document.createElement("span");
        signLabel.textContent = "Signature";
        signLabel.style.fontSize = "10px";
        signLabel.style.color = "#666";

        const clearBtn = document.createElement("button");
        clearBtn.textContent = "Clear";
        clearBtn.style.fontSize = "10px";
        clearBtn.style.padding = "2px 6px";
        clearBtn.style.border = "1px solid #ccc";
        clearBtn.style.borderRadius = "3px";
        clearBtn.style.backgroundColor = "#f5f5f5";
        clearBtn.style.cursor = "pointer";
        clearBtn.onclick = () => this.clearSignatureCanvas(canvas);

        signControls.appendChild(signLabel);
        signControls.appendChild(clearBtn);
        element.appendChild(signControls);
        break;

      case "GENERIC_IMAGE":
        element = document.createElement("div");
        element.className = "image-field-container";
        element.style.width = "100%";
        element.style.height = "100%";
        element.style.position = "relative";
        element.style.border = "2px dashed #ccc";
        element.style.backgroundColor = "#f5f5f5";
        element.style.display = "flex";
        element.style.flexDirection = "column";
        element.style.alignItems = "center";
        element.style.justifyContent = "center";
        element.style.overflow = "hidden";

        // Create file input (hidden)
        const fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.style.display = "none";
        fileInput.dataset.placementId = placement.id;

        // Create image preview
        const imgPreview = document.createElement("img");
        imgPreview.style.maxWidth = "100%";
        imgPreview.style.maxHeight = "100%";
        imgPreview.style.display = "none";
        imgPreview.dataset.placementId = placement.id;

        // Create upload prompt
        const uploadPrompt = document.createElement("div");
        uploadPrompt.style.textAlign = "center";
        uploadPrompt.style.padding = "10px";
        uploadPrompt.innerHTML = `
                    <div style="font-size: 24px; color: #999; margin-bottom: 5px;">📷</div>
                    <div style="color: #666; font-size: 11px;">Click to upload image</div>
                `;

        // Handle file selection
        fileInput.onchange = (e) =>
          this.handleImageUpload(e, imgPreview, uploadPrompt, placement.id);

        // Make container clickable
        element.style.cursor = "pointer";
        element.onclick = () => fileInput.click();

        element.appendChild(fileInput);
        element.appendChild(imgPreview);
        element.appendChild(uploadPrompt);
        break;

      case "GENERIC_TABLE":
        element = document.createElement("table");
        element.style.width = "100%";
        element.style.borderCollapse = "collapse";
        element.style.fontSize = "12px";
        // Create sample table structure
        const thead = document.createElement("thead");
        const headerRow = document.createElement("tr");
        ["Column 1", "Column 2", "Column 3"].forEach((header) => {
          const th = document.createElement("th");
          th.textContent = header;
          th.style.border = "1px solid #ccc";
          th.style.padding = "4px";
          th.style.backgroundColor = "#f0f0f0";
          th.contentEditable = true;
          headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        element.appendChild(thead);

        const tbody = document.createElement("tbody");
        for (let i = 0; i < 3; i++) {
          const row = document.createElement("tr");
          for (let j = 0; j < 3; j++) {
            const td = document.createElement("td");
            td.textContent = `Data ${i + 1}-${j + 1}`;
            td.style.border = "1px solid #ccc";
            td.style.padding = "4px";
            td.contentEditable = true;
            row.appendChild(td);
          }
          tbody.appendChild(row);
        }
        element.appendChild(tbody);
        break;

      default:
        // Default to text input for STRING and other types
        element = document.createElement("input");
        element.type = "text";
        element.placeholder = `Enter ${placement.fieldLabel}...`;
        element.style.width = "100%";
        element.style.border = "1px solid #ccc";
        element.style.borderRadius = "4px";
        element.style.padding = "4px";
        element.style.fontSize = "12px";
        break;
    }

    // Common styling for all elements
    element.style.boxSizing = "border-box";
    element.style.outline = "none";
    element.style.backgroundColor = "#fff";

    // Focus styling
    element.addEventListener("focus", () => {
      element.style.borderColor = "#22BDC1";
      element.style.boxShadow = "0 0 0 1px #22BDC1";
    });

    element.addEventListener("blur", () => {
      element.style.borderColor = "#ccc";
      element.style.boxShadow = "none";
    });

    return element;
  }

  // Field manipulation methods - Updated for new coordinate system
  startDragField(event, placement) {
    if (
      event.target.classList.contains("resize-handle") ||
      event.target.classList.contains("remove-field")
    ) {
      return;
    }

    // Don't start drag if clicking on form elements
    if (
      event.target.tagName === "INPUT" ||
      event.target.tagName === "TEXTAREA" ||
      event.target.tagName === "SELECT" ||
      event.target.classList.contains("field-form-element")
    ) {
      return;
    }

    event.preventDefault();
    const fieldElement = event.currentTarget;
    const pageElement = fieldElement.parentElement;

    // Add dragging class to disable form element interactions
    fieldElement.classList.add("dragging");

    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = fieldElement.offsetLeft;
    const startTop = fieldElement.offsetTop;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const newLeft = startLeft + deltaX;
      const newTop = startTop + deltaY;

      // Keep within page bounds
      const maxLeft = pageElement.offsetWidth - fieldElement.offsetWidth;
      const maxTop = pageElement.offsetHeight - fieldElement.offsetHeight;

      let constrainedLeft = Math.max(0, Math.min(newLeft, maxLeft));
      let constrainedTop = Math.max(0, Math.min(newTop, maxTop));

      // Apply grid snapping if enabled
      if (this.gridSnapEnabled) {
        constrainedLeft =
          Math.round(constrainedLeft / this.gridSize) * this.gridSize;
        constrainedTop =
          Math.round(constrainedTop / this.gridSize) * this.gridSize;
      }

      fieldElement.style.left = constrainedLeft + "px";
      fieldElement.style.top = constrainedTop + "px";

      // Update placement coordinates using pdfSigner method
      const overlayWidth = pageElement.clientWidth;
      const overlayHeight = pageElement.clientHeight;
      const pdfDimensions = this.currentPageDimensions;

      const relativeX = constrainedLeft / overlayWidth;
      const relativeY = constrainedTop / overlayHeight;

      // Calculate PDF coordinates (bottom-left origin)
      placement.x = relativeX * pdfDimensions.width;
      placement.y = pdfDimensions.height - relativeY * pdfDimensions.height;

      // Update overlay positions
      placement.overlayX = constrainedLeft;
      placement.overlayY = constrainedTop;
    };

    const handleMouseUp = () => {
      fieldElement.classList.remove("dragging");
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  startResizeField(event, placement) {
    event.preventDefault();
    event.stopPropagation();

    const fieldElement = event.currentTarget.closest(".placed-field");
    const pageElement = fieldElement.parentElement;
    const handle = event.currentTarget.dataset.handle;

    const startX = event.clientX;
    const startY = event.clientY;
    const startWidth = fieldElement.offsetWidth;
    const startHeight = fieldElement.offsetHeight;

    const handleMouseMove = (e) => {
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let newWidth = startWidth;
      let newHeight = startHeight;

      if (handle.includes("e")) {
        newWidth = Math.max(50, startWidth + deltaX);
      }

      if (handle.includes("s")) {
        newHeight = Math.max(30, startHeight + deltaY);
      }

      fieldElement.style.width = newWidth + "px";
      fieldElement.style.height = newHeight + "px";

      // Update placement dimensions using pdfSigner method
      const overlayWidth = pageElement.clientWidth;
      const overlayHeight = pageElement.clientHeight;
      const pdfDimensions = this.currentPageDimensions;

      const relativeWidth = newWidth / overlayWidth;
      const relativeHeight = newHeight / overlayHeight;

      placement.width = relativeWidth * pdfDimensions.width;
      placement.height = relativeHeight * pdfDimensions.height;

      // Update overlay dimensions
      placement.overlayWidth = newWidth;
      placement.overlayHeight = newHeight;
    };

    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  removeField(event) {
    const placementId = event.currentTarget.dataset.placementId;

    // Remove from placed fields array
    this.placedFields = this.placedFields.filter((f) => f.id !== placementId);

    // Remove from page fields
    this.pdfPages.forEach((page) => {
      if (page.fields) {
        page.fields = page.fields.filter((f) => f.id !== placementId);
      }
    });

    // Remove DOM element
    const fieldElement = this.template.querySelector(
      `[data-placement-id="${placementId}"]`
    );
    if (fieldElement) {
      fieldElement.remove();
    }
  }

  // Add new page
  handleAddPage() {
    this.pageSetup.pageCount++;
    this.pdfPages.push({
      pageNumber: this.pageSetup.pageCount,
      fields: [],
      cssClass: "pdf-page hidden" // Default to hidden
    });

    // Add page to PDF document
    if (this.pdfDoc) {
      const { width, height } = this.currentPageDimensions;
      this.pdfDoc.addPage([width, height]);
    }

    // Update page classes
    this.updatePageClasses();
  }

  // Auto-create fields handler
  handleAutoCreateFields() {
    console.log("handleAutoCreateFields called");

    if (this.selectedFields.length === 0) {
      this.showToast(
        "Warning",
        "Please select fields before using auto-create",
        "warning"
      );
      return;
    }

    // Clear existing placed fields if any
    if (this.placedFields.length > 0) {
      const confirmClear = confirm(
        "This will clear all existing field placements. Continue?"
      );
      if (!confirmClear) {
        return;
      }
      // Clear all existing fields
      this.placedFields = [];
      this.pdfPages.forEach((page) => {
        page.fields = [];
      });
      // Remove all field elements from DOM
      const allPlacedFields = this.template.querySelectorAll(".placed-field");
      allPlacedFields.forEach((field) => field.remove());
    }

    // Get the first page element
    const firstPageElement = this.template.querySelector('[data-page-num="1"]');
    if (!firstPageElement) {
      console.error("First page element not found");
      return;
    }

    // Define layout parameters
    const pageWidth = firstPageElement.clientWidth;
    const pageHeight = firstPageElement.clientHeight;
    const margin = 40; // Margin from edges
    const spacing = 25; // Spacing between fields - increased for better visibility
    const columnWidth = (pageWidth - 2 * margin - spacing) / 2; // Two-column layout

    let currentPage = 1;
    let currentX = margin;
    let currentY = margin + 60; // Start below page header area
    let isLeftColumn = true;

    // Group fields by category for better organization
    const fieldsByCategory = {
      required: [],
      text: [],
      number: [],
      date: [],
      picklist: [],
      checkbox: [],
      other: []
    };

    // Categorize fields
    this.selectedFields.forEach((field) => {
      if (field.isRequired) {
        fieldsByCategory.required.push(field);
      } else if (field.type === "BOOLEAN") {
        fieldsByCategory.checkbox.push(field);
      } else if (
        ["CURRENCY", "DOUBLE", "INTEGER", "PERCENT"].includes(field.type)
      ) {
        fieldsByCategory.number.push(field);
      } else if (["DATE", "DATETIME", "TIME"].includes(field.type)) {
        fieldsByCategory.date.push(field);
      } else if (["PICKLIST", "MULTIPICKLIST"].includes(field.type)) {
        fieldsByCategory.picklist.push(field);
      } else if (
        ["STRING", "TEXTAREA", "EMAIL", "PHONE", "URL"].includes(field.type)
      ) {
        fieldsByCategory.text.push(field);
      } else {
        fieldsByCategory.other.push(field);
      }
    });

    // Place fields in order: required first, then by category
    const orderedFields = [
      ...fieldsByCategory.required,
      ...fieldsByCategory.text,
      ...fieldsByCategory.number,
      ...fieldsByCategory.date,
      ...fieldsByCategory.picklist,
      ...fieldsByCategory.checkbox,
      ...fieldsByCategory.other
    ];

    // Place each field
    orderedFields.forEach((field, index) => {
      const dimensions = this.getDefaultFieldDimensions(field.type);
      let fieldWidth = dimensions.width;
      let fieldHeight = dimensions.height;

      // Adjust width for column layout
      if (field.type !== "BOOLEAN" && fieldWidth > columnWidth) {
        fieldWidth = columnWidth;
      }

      // Check if we need to move to next row
      if (
        !isLeftColumn &&
        currentY + fieldHeight + spacing > pageHeight - margin
      ) {
        // Move to next page
        currentPage++;
        if (currentPage > this.pageSetup.pageCount) {
          this.handleAddPage();
        }
        currentY = margin + 60;
        isLeftColumn = true;
        currentX = margin;
      }

      // Place field
      const pageElement = this.template.querySelector(
        `[data-page-num="${currentPage}"]`
      );
      if (pageElement) {
        // For checkboxes, place in left column only
        if (field.type === "BOOLEAN") {
          currentX = margin;
          isLeftColumn = true;
        } else if (!isLeftColumn) {
          currentX = margin + columnWidth + spacing;
        }

        this.placeFieldOnPage(
          field,
          currentPage,
          currentX,
          currentY,
          pageElement
        );

        // Update position for next field
        if (field.type === "BOOLEAN") {
          // Checkboxes are small, can fit multiple in a row
          if (
            index < orderedFields.length - 1 &&
            orderedFields[index + 1].type === "BOOLEAN"
          ) {
            currentX += fieldWidth + 40; // Move right for next checkbox
            if (currentX + fieldWidth > pageWidth - margin) {
              currentX = margin;
              currentY += fieldHeight + spacing;
            }
          } else {
            currentY += fieldHeight + spacing;
            isLeftColumn = true;
            currentX = margin;
          }
        } else {
          // Regular fields
          if (isLeftColumn) {
            isLeftColumn = false;
          } else {
            currentY += fieldHeight + spacing;
            isLeftColumn = true;
            currentX = margin;
          }
        }
      }
    });

    this.showToast(
      "Success",
      `Placed ${orderedFields.length} fields on ${currentPage} page(s)`,
      "success"
    );
  }

  // Page navigation
  handlePrevPage() {
    if (this.currentPageNum > 1) {
      this.currentPageNum--;
      this.updatePageClasses();
    }
  }

  handleNextPage() {
    if (this.currentPageNum < this.pageSetup.pageCount) {
      this.currentPageNum++;
      this.updatePageClasses();
    }
  }

  // Update page CSS classes based on current page
  updatePageClasses() {
    // Update the pdfPages array with proper CSS classes
    this.pdfPages = this.pdfPages.map((page) => ({
      ...page,
      cssClass: this.getPageCssClass(page.pageNumber)
    }));
  }

  // Get CSS class for a page
  getPageCssClass(pageNumber) {
    let cssClass = "pdf-page";
    if (pageNumber === this.currentPageNum) {
      cssClass += " active";
    } else {
      cssClass += " hidden";
    }
    if (this.showGrid) {
      cssClass += " show-grid";
    }
    return cssClass;
  }

  // Template input handlers
  handleTemplateNameChange(event) {
    this.templateName = event.target.value;
  }

  handleTemplateDescriptionChange(event) {
    this.templateDescription = event.target.value;
  }

  // Save template
  async handleSaveTemplate() {
    if (!this.templateName) {
      this.showToast("Warning", "Please enter a template name", "warning");
      return;
    }

    if (this.placedFields.length === 0) {
      this.showToast(
        "Warning",
        "Please place at least one field on the template",
        "warning"
      );
      return;
    }

    this.isSaving = true;

    try {
      // Prepare template data
      const templateData = {
        templateId: this.selectedTemplateId,
        name: this.templateName,
        description: this.templateDescription,
        objectApiName: this.selectedObject,
        pageCount: this.pageSetup.pageCount,
        pageSize: this.pageSetup.pageSize,
        orientation: this.pageSetup.orientation,
        isActive: true,
        fields: this.placedFields.map((field) => ({
          fieldApiName: field.fieldApiName,
          fieldLabel: field.fieldLabel,
          fieldType: field.fieldType,
          pageNumber: field.pageNumber,
          xPosition: field.x,
          yPosition: field.y,
          width: field.width,
          height: field.height,
          fontSize: field.fontSize,
          fontFamily: field.fontFamily,
          alignment: field.alignment,
          formatOptions: field.formatOptions || null
        }))
      };

      // Save template
      const templateId = await saveTemplate({
        templateDataJson: JSON.stringify(templateData)
      });

      // Store the saved template ID for download
      this.savedTemplateId = templateId;
      console.log("Template saved with ID:", this.savedTemplateId);

      this.showToast("Success", "Template saved successfully!", "success");

      // Move to success step
      this.currentStep = 4;
      this.updatePathClasses();
    } catch (error) {
      console.error("Error saving template:", error);
      this.showToast(
        "Error",
        "Failed to save template: " + error.body?.message,
        "error"
      );
    } finally {
      this.isSaving = false;
    }
  }

  // Generate preview PDF
  async handleGeneratePreview() {
    console.log("handleGeneratePreview called");

    if (this.placedFields.length === 0) {
      this.showToast(
        "Warning",
        "Please place at least one field on the template before generating preview",
        "warning"
      );
      return;
    }

    if (!this.PDFLib) {
      this.showToast(
        "Error",
        "PDF library not loaded yet. Please try again.",
        "error"
      );
      return;
    }

    this.isGeneratingPreview = true;

    try {
      console.log("Generating preview PDF...");

      // Generate the PDF bytes
      const pdfBytes = await this.generatePreviewPdfBytes();

      // Convert to base64 for saving to Salesforce
      const base64String = this.arrayBufferToBase64(pdfBytes);

      // Save as temporary PDF to Salesforce
      console.log("Saving preview PDF to Salesforce...");
      const contentVersionId = await this.savePdfToSalesforce(
        base64String,
        `${this.templateName || "Template"}_Preview.pdf`,
        null, // no record association
        true // temporary file
      );

      this.previewContentVersionId = contentVersionId;

      // Get preview URL
      const downloadUrl = await this.getDocumentDownloadUrl(contentVersionId);
      this.previewUrl = downloadUrl;

      console.log("Preview generated successfully. URL:", this.previewUrl);
      this.showToast("Success", "Preview generated successfully!", "success");
    } catch (error) {
      console.error("Error generating preview:", error);
      this.showToast(
        "Error",
        "Failed to generate preview: " + error.message,
        "error"
      );
    } finally {
      this.isGeneratingPreview = false;
    }
  }

  // Generate preview PDF bytes (separate method for reusability)
  async generatePreviewPdfBytes() {
    console.log("generatePreviewPdfBytes started");

    if (!this.PDFLib) {
      throw new Error("PDF library not loaded yet");
    }

    // Ensure pageSetup has defaults
    if (!this.pageSetup.pageSize) {
      this.pageSetup.pageSize = "A4";
    }
    if (!this.pageSetup.orientation) {
      this.pageSetup.orientation = "portrait";
    }
    if (!this.pageSetup.pageCount) {
      this.pageSetup.pageCount = 1;
    }

    try {
      console.log("Creating PDF document for preview...");

      // Create a new PDF document
      const pdfDoc = await this.PDFLib.PDFDocument.create();

      // Add pages based on template settings
      const dimensions = this.currentPageDimensions;
      console.log("Page dimensions:", JSON.stringify(dimensions));

      if (!dimensions || !dimensions.width || !dimensions.height) {
        throw new Error(
          "Invalid page dimensions: " + JSON.stringify(dimensions)
        );
      }

      for (let i = 0; i < this.pageSetup.pageCount; i++) {
        const page = pdfDoc.addPage([dimensions.width, dimensions.height]);

        // Add page title
        const helveticaFont = await pdfDoc.embedFont(
          this.PDFLib.StandardFonts.Helvetica
        );
        const boldFont = await pdfDoc.embedFont(
          this.PDFLib.StandardFonts.HelveticaBold
        );

        // Page header with "PREVIEW" watermark
        page.drawText(
          `${this.templateName || "Template"} - Page ${i + 1} [PREVIEW]`,
          {
            x: 50,
            y: dimensions.height - 50,
            size: 16,
            font: boldFont,
            color: this.PDFLib.rgb(0.13, 0.74, 0.76) // Theme primary color
          }
        );

        // Template info on first page - removed Object and Page Size display
        if (i === 0 && this.templateDescription) {
          page.drawText(`${this.templateDescription}`, {
            x: 50,
            y: dimensions.height - 50,
            size: 10,
            font: helveticaFont,
            color: this.PDFLib.rgb(0.4, 0.4, 0.4)
          });
        }

        // Add field placements for this page
        const pageFields = this.placedFields.filter(
          (field) => field.pageNumber === i + 1
        );
        console.log(
          `Page ${i + 1} has ${pageFields.length} fields:`,
          pageFields.map((f) => f.fieldLabel)
        );

        for (const field of pageFields) {
          // PDF coordinates are already stored correctly (bottom-left origin)
          // Just ensure all values are numbers
          const pdfX = Number(field.x) || 0;
          const pdfY = Number(field.y) || 0; // Already in PDF coordinates
          const fieldWidth = Number(field.width) || 200;
          const fieldHeight = Number(field.height) || 30;

          console.log(
            "Creating form field:",
            field.fieldLabel,
            "at coordinates:",
            {
              x: pdfX,
              y: pdfY,
              width: fieldWidth,
              height: fieldHeight,
              type: field.fieldType
            }
          );

          // Create actual fillable form fields based on field type
          const form = pdfDoc.getForm();

          try {
            // Handle generic field types first
            if (field.fieldType === "GENERIC_SIGNATURE") {
              // Draw signature with actual data if available
              await this.drawSignatureToPdf(
                page,
                field,
                pdfX,
                pdfY,
                fieldWidth,
                fieldHeight,
                pdfDoc
              );
            } else if (field.fieldType === "GENERIC_IMAGE") {
              // Check if we have image data for this field
              if (this.imageData && this.imageData[field.id]) {
                try {
                  const imageDataUrl = this.imageData[field.id];
                  let embeddedImage;

                  // Embed image based on type
                  if (imageDataUrl.includes("data:image/png")) {
                    embeddedImage = await pdfDoc.embedPng(imageDataUrl);
                  } else if (
                    imageDataUrl.includes("data:image/jpeg") ||
                    imageDataUrl.includes("data:image/jpg")
                  ) {
                    embeddedImage = await pdfDoc.embedJpg(imageDataUrl);
                  }

                  if (embeddedImage) {
                    // Draw the actual image
                    page.drawImage(embeddedImage, {
                      x: pdfX,
                      y: pdfY,
                      width: fieldWidth,
                      height: fieldHeight
                    });
                  }
                } catch (error) {
                  console.error("Error embedding image:", error);
                  // Fall back to placeholder
                  this.drawImagePlaceholder(
                    page,
                    pdfX,
                    pdfY,
                    fieldWidth,
                    fieldHeight,
                    field,
                    helveticaFont
                  );
                }
              } else {
                // Draw image placeholder if no image uploaded
                this.drawImagePlaceholder(
                  page,
                  pdfX,
                  pdfY,
                  fieldWidth,
                  fieldHeight,
                  field,
                  helveticaFont
                );
              }
            } else if (field.fieldType === "GENERIC_TITLE") {
              // Draw title text
              page.drawText(field.fieldLabel, {
                x: pdfX,
                y: pdfY + fieldHeight - 20,
                size: 24,
                font: boldFont,
                color: this.PDFLib.rgb(0.1, 0.1, 0.1)
              });
            } else if (field.fieldType === "GENERIC_SUBTITLE") {
              // Draw subtitle text
              page.drawText(field.fieldLabel, {
                x: pdfX,
                y: pdfY + fieldHeight - 16,
                size: 18,
                font: boldFont,
                color: this.PDFLib.rgb(0.3, 0.3, 0.3)
              });
            } else if (field.fieldType === "GENERIC_SECTION_HEADER") {
              // Draw section header
              page.drawText(field.fieldLabel, {
                x: pdfX,
                y: pdfY + fieldHeight - 14,
                size: 14,
                font: boldFont,
                color: this.PDFLib.rgb(0.2, 0.2, 0.2)
              });

              // Draw underline
              page.drawLine({
                start: { x: pdfX, y: pdfY },
                end: { x: pdfX + fieldWidth, y: pdfY },
                thickness: 1,
                color: this.PDFLib.rgb(0.8, 0.8, 0.8)
              });
            } else if (field.fieldType === "GENERIC_TEXT") {
              // Draw text block placeholder
              page.drawRectangle({
                x: pdfX,
                y: pdfY,
                width: fieldWidth,
                height: fieldHeight,
                borderColor: this.PDFLib.rgb(0.9, 0.9, 0.9),
                borderWidth: 1,
                color: this.PDFLib.rgb(0.98, 0.98, 0.98)
              });

              page.drawText("[Text Block]", {
                x: pdfX + 5,
                y: pdfY + fieldHeight - 15,
                size: 10,
                font: helveticaFont,
                color: this.PDFLib.rgb(0.6, 0.6, 0.6)
              });
            } else if (field.fieldType === "GENERIC_DATE") {
              // Draw current date
              page.drawText(new Date().toLocaleDateString(), {
                x: pdfX,
                y: pdfY + fieldHeight - 12,
                size: 10,
                font: helveticaFont,
                color: this.PDFLib.rgb(0.1, 0.1, 0.1)
              });
            } else if (field.fieldType === "GENERIC_PAGE_NUMBER") {
              // Draw page number
              page.drawText(`Page ${i + 1}`, {
                x: pdfX,
                y: pdfY + fieldHeight - 12,
                size: 10,
                font: helveticaFont,
                color: this.PDFLib.rgb(0.4, 0.4, 0.4)
              });
            } else if (field.fieldType === "GENERIC_SEPARATOR") {
              // Draw separator line
              page.drawLine({
                start: { x: pdfX, y: pdfY + fieldHeight / 2 },
                end: { x: pdfX + fieldWidth, y: pdfY + fieldHeight / 2 },
                thickness: 1,
                color: this.PDFLib.rgb(0.8, 0.8, 0.8),
                opacity: 0.5
              });
            } else if (field.fieldType === "GENERIC_TABLE") {
              // Draw table with actual data if available
              await this.drawTableToPdf(
                page,
                field,
                pdfX,
                pdfY,
                fieldWidth,
                fieldHeight,
                helveticaFont,
                pdfDoc
              );
            } else if (field.fieldType === "BOOLEAN") {
              // Create checkbox field
              const checkBox = form.createCheckBox(
                `${field.fieldApiName}_${i}`
              );
              checkBox.addToPage(page, {
                x: pdfX,
                y: pdfY,
                width: fieldWidth,
                height: fieldHeight
              });

              // Add label next to checkbox
              page.drawText(field.fieldLabel, {
                x: pdfX + fieldWidth + 5,
                y: pdfY + fieldHeight / 2 - 6,
                size: 10,
                font: helveticaFont,
                color: this.PDFLib.rgb(0.1, 0.1, 0.1)
              });
            } else if (
              field.fieldType === "PICKLIST" ||
              field.fieldType === "MULTIPICKLIST"
            ) {
              // Create dropdown field
              const dropdown = form.createDropdown(
                `${field.fieldApiName}_${i}`
              );
              dropdown.addOptions([
                "Option 1",
                "Option 2",
                "Option 3",
                "Other"
              ]);
              dropdown.select(""); // No default selection
              dropdown.addToPage(page, {
                x: pdfX,
                y: pdfY,
                width: fieldWidth,
                height: fieldHeight
              });

              // Add label above dropdown
              page.drawText(field.fieldLabel, {
                x: pdfX,
                y: pdfY + fieldHeight + 5,
                size: 10,
                font: boldFont,
                color: this.PDFLib.rgb(0.1, 0.1, 0.1)
              });
            } else if (
              field.fieldType === "TEXTAREA" ||
              field.fieldType === "LONG_TEXT_AREA"
            ) {
              // Create multiline text field
              const textField = form.createTextField(
                `${field.fieldApiName}_${i}`
              );
              textField.setMultiline(true);
              textField.addToPage(page, {
                x: pdfX,
                y: pdfY,
                width: fieldWidth,
                height: fieldHeight
              });

              // Add label above text area
              page.drawText(field.fieldLabel, {
                x: pdfX,
                y: pdfY + fieldHeight + 5,
                size: 10,
                font: boldFont,
                color: this.PDFLib.rgb(0.1, 0.1, 0.1)
              });
            } else {
              // Create single-line text field for all other types (STRING, EMAIL, PHONE, etc.)
              const textField = form.createTextField(
                `${field.fieldApiName}_${i}`
              );
              textField.addToPage(page, {
                x: pdfX,
                y: pdfY,
                width: fieldWidth,
                height: fieldHeight
              });

              // Set placeholder text based on field type
              let placeholder = "";
              switch (field.fieldType) {
                case "EMAIL":
                  placeholder = "email@example.com";
                  break;
                case "PHONE":
                  placeholder = "(555) 123-4567";
                  break;
                case "URL":
                  placeholder = "https://example.com";
                  break;
                case "DATE":
                  placeholder = "MM/DD/YYYY";
                  break;
                case "DATETIME":
                  placeholder = "MM/DD/YYYY HH:MM";
                  break;
                case "CURRENCY":
                case "DOUBLE":
                case "INTEGER":
                  placeholder = "0";
                  break;
                default:
                  placeholder = `Enter ${field.fieldLabel}...`;
              }

              // Add label above text field
              page.drawText(field.fieldLabel, {
                x: pdfX,
                y: pdfY + fieldHeight + 5,
                size: 10,
                font: boldFont,
                color: this.PDFLib.rgb(0.1, 0.1, 0.1)
              });

              // Add placeholder/helper text inside field (light gray)
              page.drawText(placeholder, {
                x: pdfX + 3,
                y: pdfY + fieldHeight / 2 - 4,
                size: 8,
                font: helveticaFont,
                color: this.PDFLib.rgb(0.6, 0.6, 0.6)
              });
            }
          } catch (fieldError) {
            console.warn(
              "Error creating form field:",
              field.fieldLabel,
              fieldError
            );

            // Fallback to visual representation if form field creation fails
            page.drawRectangle({
              x: pdfX,
              y: pdfY,
              width: fieldWidth,
              height: fieldHeight,
              borderColor: this.PDFLib.rgb(0.13, 0.74, 0.76),
              borderWidth: 1,
              color: this.PDFLib.rgb(0.13, 0.74, 0.76, 0.1)
            });

            // Add field label
            page.drawText(field.fieldLabel, {
              x: pdfX + 4,
              y: pdfY + fieldHeight - 12,
              size: 10,
              font: boldFont,
              color: this.PDFLib.rgb(0.1, 0.1, 0.1)
            });
          }
        }

        // Add page footer with preview notice
        page.drawText(
          `PREVIEW - Generated on ${new Date().toLocaleDateString()}`,
          {
            x: 50,
            y: 30,
            size: 8,
            font: helveticaFont,
            color: this.PDFLib.rgb(0.6, 0.6, 0.6)
          }
        );
      }

      // Generate PDF bytes
      console.log("Generating PDF bytes...");
      const pdfBytes = await pdfDoc.save();

      return pdfBytes;
    } catch (error) {
      console.error("Error in generatePreviewPdfBytes:", error);
      throw error;
    }
  }

  // Start over
  handleStartOver() {
    // Reset all state
    this.currentStep = 0;
    this.selectedObject = null;
    this.allFields = [];
    this.selectedFields = [];
    this.displayedFields = [];
    this.placedFields = [];
    this.pdfPages = [];
    this.templateName = "";
    this.templateDescription = "";
    this.selectedTemplateId = null;
    this.savedTemplateId = null; // Reset saved template ID
    this.selectedExistingTemplate = null; // Reset selected existing template
    this.templateMode = "create"; // Reset to create mode
    this.fieldsFiltered = false; // Reset filtering flag
    this.previewUrl = ""; // Reset preview URL
    this.isGeneratingPreview = false; // Reset preview generation state
    this.previewContentVersionId = null; // Reset preview content version ID
    this.pageSetup = {
      pageSize: "A4",
      orientation: "portrait",
      pageCount: 1
    };
    this.currentPageNum = 1;

    this.updatePathClasses();
  }

  // Download template preview
  async handleDownloadTemplate() {
    if (!this.savedTemplateId) {
      this.showToast("Error", "No template to download", "error");
      return;
    }

    if (!this.PDFLib) {
      this.showToast(
        "Error",
        "PDF library not loaded yet. Please try again.",
        "error"
      );
      return;
    }

    this.isLoading = true;

    try {
      await this.generateTemplatePdf();
    } catch (error) {
      console.error("Error generating template PDF:", error);
      this.showToast(
        "Error",
        "Failed to generate template PDF: " + error.message,
        "error"
      );
    } finally {
      this.isLoading = false;
    }
  }

  // Load existing templates
  async loadExistingTemplates() {
    console.log("loadExistingTemplates called...");
    this.isLoadingTemplates = true;
    try {
      console.log("Calling getAvailableTemplates...");
      const templates = await getAvailableTemplates();
      console.log("Raw templates received:", templates);

      this.existingTemplates = templates.map((template) => ({
        ...template,
        formattedDate: template.lastModifiedDate
          ? new Date(template.lastModifiedDate).toLocaleDateString()
          : "",
        hasDescription: !!template.description
      }));
      console.log(
        `Successfully loaded ${this.existingTemplates.length} templates:`,
        this.existingTemplates
      );
    } catch (error) {
      console.error("Error loading templates:", error);
      this.showToast(
        "Error",
        "Failed to load existing templates: " + error.body?.message,
        "error"
      );
    } finally {
      this.isLoadingTemplates = false;
    }
  }

  // Handle template mode change
  handleTemplateModeChange(event) {
    const newMode = event.detail.value;
    console.log("Template mode changed to:", newMode);
    this.templateMode = newMode;

    // Reset selections when switching modes
    this.selectedObject = null;
    this.selectedExistingTemplate = null;
  }

  // Handle create new template button click
  handleCreateNewTemplateClick() {
    console.log("Create new template clicked");
    this.templateMode = "create";
    this.selectedObject = null;
    this.selectedExistingTemplate = null;
  }

  // Handle existing template selection
  handleExistingTemplateSelect(event) {
    const templateId = event.currentTarget.dataset.templateId;
    console.log("Selected existing template:", templateId);

    this.selectedExistingTemplate = this.existingTemplates.find(
      (t) => t.id === templateId
    );
    console.log("Selected template data:", this.selectedExistingTemplate);
  }

  // Download existing template
  async handleDownloadExistingTemplate(event) {
    const templateId = event.currentTarget.dataset.templateId;
    console.log("Download existing template:", templateId);

    const template = this.existingTemplates.find((t) => t.id === templateId);
    if (!template) {
      this.showToast("Error", "Template not found", "error");
      return;
    }

    this.isLoadingTemplates = true;

    try {
      // Load the full template data
      console.log("Loading template data for download...");
      const templateData = await loadTemplate({ templateId: templateId });
      console.log(
        "Loaded template data for download:",
        JSON.stringify(templateData, null, 2)
      );

      // Temporarily store the data for PDF generation
      const originalData = {
        templateName: this.templateName,
        templateDescription: this.templateDescription,
        selectedObject: this.selectedObject,
        pageSetup: { ...this.pageSetup },
        placedFields: [...this.placedFields]
      };

      // Set template data for PDF generation with validation
      this.templateName = templateData.name || "Untitled Template";
      this.templateDescription = templateData.description || "";
      this.selectedObject = templateData.objectApiName || "Unknown";

      // Ensure pageSetup has valid values
      this.pageSetup = {
        pageSize: templateData.pageSize || "A4",
        orientation: templateData.orientation || "portrait",
        pageCount: parseInt(templateData.pageCount) || 1
      };

      console.log(
        "Set pageSetup for download:",
        JSON.stringify(this.pageSetup)
      );

      // Convert template fields to placed fields format with proper type conversion
      this.placedFields = (templateData.fields || []).map((field) => ({
        id: "existing-" + Math.random().toString(36).substr(2, 9),
        fieldApiName: field.fieldApiName || "unknown",
        fieldLabel: field.fieldLabel || "Unknown Field",
        fieldType: field.fieldType || "STRING",
        pageNumber: parseInt(field.pageNumber) || 1,
        x: parseFloat(field.xPosition) || 0,
        y: parseFloat(field.yPosition) || 0,
        width: parseFloat(field.width) || 200,
        height: parseFloat(field.height) || 30,
        fontSize: parseFloat(field.fontSize) || 12,
        fontFamily: field.fontFamily || "Arial",
        alignment: field.alignment || "left"
      }));

      console.log(
        "Set placedFields for download:",
        this.placedFields.length,
        "fields"
      );
      console.log(
        "Sample field coordinates:",
        this.placedFields[0]
          ? {
              x: this.placedFields[0].x,
              y: this.placedFields[0].y,
              xType: typeof this.placedFields[0].x,
              yType: typeof this.placedFields[0].y
            }
          : "no fields"
      );

      // Generate PDF
      await this.generateTemplatePdf();

      // Restore original data
      this.templateName = originalData.templateName;
      this.templateDescription = originalData.templateDescription;
      this.selectedObject = originalData.selectedObject;
      this.pageSetup = originalData.pageSetup;
      this.placedFields = originalData.placedFields;
    } catch (error) {
      console.error("Error downloading existing template:", error);
      console.error(
        "Full error object:",
        JSON.stringify(error, Object.getOwnPropertyNames(error))
      );

      // Try to extract meaningful error message
      let errorMessage = "Unknown error occurred";
      if (error.body && error.body.message) {
        errorMessage = error.body.message;
      } else if (error.message) {
        errorMessage = error.message;
      } else if (typeof error === "string") {
        errorMessage = error;
      }

      this.showToast(
        "Error",
        "Failed to download template: " + errorMessage,
        "error"
      );
    } finally {
      this.isLoadingTemplates = false;
    }
  }

  // Load existing template for editing
  async handleLoadTemplateForEdit(event) {
    const templateId = event.currentTarget.dataset.templateId;
    console.log("Load template for edit:", templateId);

    this.isLoading = true;

    try {
      // Load the full template data
      const templateData = await loadTemplate({ templateId: templateId });
      console.log("Loaded template data for editing:", templateData);

      // Set all the template data
      this.selectedTemplateId = templateId;
      this.templateName = templateData.name;
      this.templateDescription = templateData.description || "";
      this.selectedObject = templateData.objectApiName;
      this.pageSetup = {
        pageSize: templateData.pageSize,
        orientation: templateData.orientation,
        pageCount: parseInt(templateData.pageCount) || 1
      };

      // Load fields for the object
      await this.loadFieldsForObject();

      // Convert template fields to placed fields format with proper coordinate conversion
      this.placedFields = (templateData.fields || []).map((field) => {
        // Convert PDF coordinates back to overlay coordinates for rendering
        // This is the reverse of what we do in placeFieldOnPage
        const pdfDimensions = this.currentPageDimensions;

        // PDF coordinates (stored in database)
        const pdfX = parseFloat(field.xPosition) || 0;
        const pdfY = parseFloat(field.yPosition) || 0;
        const pdfWidth = parseFloat(field.width) || 200;
        const pdfHeight = parseFloat(field.height) || 30;

        // Convert to relative positions (assuming standard page dimensions for now)
        // We'll update these when the pages are actually rendered
        const relativeX = pdfX / pdfDimensions.width;
        const relativeY = (pdfDimensions.height - pdfY) / pdfDimensions.height; // Convert from bottom-left to top-left
        const relativeWidth = pdfWidth / pdfDimensions.width;
        const relativeHeight = pdfHeight / pdfDimensions.height;

        return {
          id: "loaded-" + Math.random().toString(36).substr(2, 9),
          fieldApiName: field.fieldApiName || "unknown",
          fieldLabel: field.fieldLabel || "Unknown Field",
          fieldType: field.fieldType || "STRING",
          pageNumber: parseInt(field.pageNumber) || 1,
          x: pdfX, // Store PDF coordinates
          y: pdfY, // Store PDF coordinates
          width: pdfWidth, // PDF width
          height: pdfHeight, // PDF height
          fontSize: parseFloat(field.fontSize) || 12,
          fontFamily: field.fontFamily || "Arial",
          alignment: field.alignment || "left",
          // Store relative positions for overlay rendering (will be updated when pages render)
          relativeX: relativeX,
          relativeY: relativeY,
          relativeWidth: relativeWidth,
          relativeHeight: relativeHeight
        };
      });

      // Mark fields as selected in the field list
      this.selectedFields = this.allFields.filter((field) =>
        this.placedFields.some((placed) => placed.fieldApiName === field.value)
      );
      this.selectedFields.forEach((field) => (field.selected = true));

      this.showToast("Success", "Template loaded successfully!", "success");

      // Go directly to design step since we have everything loaded
      this.currentStep = 2;
      this.updatePathClasses();

      // Initialize PDF pages and render fields
      setTimeout(() => {
        this.initializePdfPages();
      }, 100);
    } catch (error) {
      console.error("Error loading template for edit:", error);
      this.showToast(
        "Error",
        "Failed to load template: " + error.body?.message || error.message,
        "error"
      );
    } finally {
      this.isLoading = false;
    }
  }

  // Extract PDF generation logic for reuse
  async generateTemplatePdf() {
    console.log("generateTemplatePdf started");
    console.log("PDFLib available:", !!this.PDFLib);
    console.log("pageSetup:", JSON.stringify(this.pageSetup));
    console.log("placedFields count:", this.placedFields?.length || 0);

    if (!this.PDFLib) {
      throw new Error("PDF library not loaded yet");
    }

    // Ensure pageSetup has defaults
    if (!this.pageSetup.pageSize) {
      console.warn("pageSetup.pageSize is missing, setting default to A4");
      this.pageSetup.pageSize = "A4";
    }
    if (!this.pageSetup.orientation) {
      console.warn(
        "pageSetup.orientation is missing, setting default to portrait"
      );
      this.pageSetup.orientation = "portrait";
    }
    if (!this.pageSetup.pageCount) {
      console.warn("pageSetup.pageCount is missing, setting default to 1");
      this.pageSetup.pageCount = 1;
    }

    console.log(
      "generateTemplatePdf - after defaults:",
      JSON.stringify(this.pageSetup)
    );

    try {
      console.log("Generating PDF template...");

      // Create a new PDF document
      const pdfDoc = await this.PDFLib.PDFDocument.create();

      // Add pages based on template settings
      const dimensions = this.currentPageDimensions;
      console.log("Page dimensions:", JSON.stringify(dimensions));

      if (!dimensions || !dimensions.width || !dimensions.height) {
        throw new Error(
          "Invalid page dimensions: " + JSON.stringify(dimensions)
        );
      }

      for (let i = 0; i < this.pageSetup.pageCount; i++) {
        const page = pdfDoc.addPage([dimensions.width, dimensions.height]);

        // Add page title
        const helveticaFont = await pdfDoc.embedFont(
          this.PDFLib.StandardFonts.Helvetica
        );
        const boldFont = await pdfDoc.embedFont(
          this.PDFLib.StandardFonts.HelveticaBold
        );

        // Add date generated at bottom left
        const dateGenerated = new Date().toLocaleDateString();
        page.drawText(`Generated: ${dateGenerated}`, {
          x: 10,
          y: 10,
          size: 8,
          font: helveticaFont,
          color: this.PDFLib.rgb(0.5, 0.5, 0.5)
        });

        // Template info on first page - removed Object and Page Size display
        if (i === 0 && this.templateDescription) {
          page.drawText(`${this.templateDescription}`, {
            x: 50,
            y: dimensions.height - 50,
            size: 10,
            font: helveticaFont,
            color: this.PDFLib.rgb(0.4, 0.4, 0.4)
          });
        }

        // Add field placements for this page
        const pageFields = this.placedFields.filter(
          (field) => field.pageNumber === i + 1
        );
        console.log(
          `Page ${i + 1} has ${pageFields.length} fields:`,
          pageFields.map((f) => f.fieldLabel)
        );

        for (const field of pageFields) {
          // PDF coordinates are already stored correctly (bottom-left origin)
          // Just ensure all values are numbers
          const pdfX = Number(field.x) || 0;
          const pdfY = Number(field.y) || 0; // Already in PDF coordinates
          const fieldWidth = Number(field.width) || 200;
          const fieldHeight = Number(field.height) || 30;

          console.log(
            "Creating form field:",
            field.fieldLabel,
            "at coordinates:",
            {
              x: pdfX,
              y: pdfY,
              width: fieldWidth,
              height: fieldHeight,
              type: field.fieldType
            }
          );

          // Create actual fillable form fields based on field type
          const form = pdfDoc.getForm();

          try {
            // Handle generic field types first
            if (field.fieldType === "GENERIC_SIGNATURE") {
              // Draw signature with actual data if available
              await this.drawSignatureToPdf(
                page,
                field,
                pdfX,
                pdfY,
                fieldWidth,
                fieldHeight,
                pdfDoc
              );
            } else if (field.fieldType === "GENERIC_IMAGE") {
              // Check if we have image data for this field
              if (this.imageData && this.imageData[field.id]) {
                try {
                  const imageDataUrl = this.imageData[field.id];
                  let embeddedImage;

                  // Embed image based on type
                  if (imageDataUrl.includes("data:image/png")) {
                    embeddedImage = await pdfDoc.embedPng(imageDataUrl);
                  } else if (
                    imageDataUrl.includes("data:image/jpeg") ||
                    imageDataUrl.includes("data:image/jpg")
                  ) {
                    embeddedImage = await pdfDoc.embedJpg(imageDataUrl);
                  }

                  if (embeddedImage) {
                    // Draw the actual image
                    page.drawImage(embeddedImage, {
                      x: pdfX,
                      y: pdfY,
                      width: fieldWidth,
                      height: fieldHeight
                    });
                  }
                } catch (error) {
                  console.error("Error embedding image:", error);
                  // Fall back to placeholder
                  this.drawImagePlaceholder(
                    page,
                    pdfX,
                    pdfY,
                    fieldWidth,
                    fieldHeight,
                    field,
                    helveticaFont
                  );
                }
              } else {
                // Draw image placeholder if no image uploaded
                this.drawImagePlaceholder(
                  page,
                  pdfX,
                  pdfY,
                  fieldWidth,
                  fieldHeight,
                  field,
                  helveticaFont
                );
              }
            } else if (field.fieldType === "GENERIC_TITLE") {
              // Draw title text
              page.drawText(field.fieldLabel, {
                x: pdfX,
                y: pdfY + fieldHeight - 20,
                size: 24,
                font: boldFont,
                color: this.PDFLib.rgb(0.1, 0.1, 0.1)
              });
            } else if (field.fieldType === "GENERIC_SUBTITLE") {
              // Draw subtitle text
              page.drawText(field.fieldLabel, {
                x: pdfX,
                y: pdfY + fieldHeight - 16,
                size: 18,
                font: boldFont,
                color: this.PDFLib.rgb(0.3, 0.3, 0.3)
              });
            } else if (field.fieldType === "GENERIC_SECTION_HEADER") {
              // Draw section header
              page.drawText(field.fieldLabel, {
                x: pdfX,
                y: pdfY + fieldHeight - 14,
                size: 14,
                font: boldFont,
                color: this.PDFLib.rgb(0.2, 0.2, 0.2)
              });

              // Draw underline
              page.drawLine({
                start: { x: pdfX, y: pdfY },
                end: { x: pdfX + fieldWidth, y: pdfY },
                thickness: 1,
                color: this.PDFLib.rgb(0.8, 0.8, 0.8)
              });
            } else if (field.fieldType === "GENERIC_TEXT") {
              // Draw text block placeholder
              page.drawRectangle({
                x: pdfX,
                y: pdfY,
                width: fieldWidth,
                height: fieldHeight,
                borderColor: this.PDFLib.rgb(0.9, 0.9, 0.9),
                borderWidth: 1,
                color: this.PDFLib.rgb(0.98, 0.98, 0.98)
              });

              page.drawText("[Text Block]", {
                x: pdfX + 5,
                y: pdfY + fieldHeight - 15,
                size: 10,
                font: helveticaFont,
                color: this.PDFLib.rgb(0.6, 0.6, 0.6)
              });
            } else if (field.fieldType === "GENERIC_DATE") {
              // Draw current date
              page.drawText(new Date().toLocaleDateString(), {
                x: pdfX,
                y: pdfY + fieldHeight - 12,
                size: 10,
                font: helveticaFont,
                color: this.PDFLib.rgb(0.1, 0.1, 0.1)
              });
            } else if (field.fieldType === "GENERIC_PAGE_NUMBER") {
              // Draw page number
              page.drawText(`Page ${i + 1}`, {
                x: pdfX,
                y: pdfY + fieldHeight - 12,
                size: 10,
                font: helveticaFont,
                color: this.PDFLib.rgb(0.4, 0.4, 0.4)
              });
            } else if (field.fieldType === "GENERIC_SEPARATOR") {
              // Draw separator line
              page.drawLine({
                start: { x: pdfX, y: pdfY + fieldHeight / 2 },
                end: { x: pdfX + fieldWidth, y: pdfY + fieldHeight / 2 },
                thickness: 1,
                color: this.PDFLib.rgb(0.8, 0.8, 0.8),
                opacity: 0.5
              });
            } else if (field.fieldType === "GENERIC_TABLE") {
              // Draw table with actual data if available
              await this.drawTableToPdf(
                page,
                field,
                pdfX,
                pdfY,
                fieldWidth,
                fieldHeight,
                helveticaFont,
                pdfDoc
              );
            } else if (field.fieldType === "BOOLEAN") {
              // Create checkbox field
              const checkBox = form.createCheckBox(
                `${field.fieldApiName}_${i}`
              );
              checkBox.addToPage(page, {
                x: pdfX,
                y: pdfY,
                width: fieldWidth,
                height: fieldHeight
              });

              // Add label next to checkbox
              page.drawText(field.fieldLabel, {
                x: pdfX + fieldWidth + 5,
                y: pdfY + fieldHeight / 2 - 6,
                size: 10,
                font: helveticaFont,
                color: this.PDFLib.rgb(0.1, 0.1, 0.1)
              });
            } else if (
              field.fieldType === "PICKLIST" ||
              field.fieldType === "MULTIPICKLIST"
            ) {
              // Create dropdown field
              const dropdown = form.createDropdown(
                `${field.fieldApiName}_${i}`
              );
              dropdown.addOptions([
                "Option 1",
                "Option 2",
                "Option 3",
                "Other"
              ]);
              dropdown.select(""); // No default selection
              dropdown.addToPage(page, {
                x: pdfX,
                y: pdfY,
                width: fieldWidth,
                height: fieldHeight
              });

              // Add label above dropdown
              page.drawText(field.fieldLabel, {
                x: pdfX,
                y: pdfY + fieldHeight + 5,
                size: 10,
                font: boldFont,
                color: this.PDFLib.rgb(0.1, 0.1, 0.1)
              });
            } else if (
              field.fieldType === "TEXTAREA" ||
              field.fieldType === "LONG_TEXT_AREA"
            ) {
              // Create multiline text field
              const textField = form.createTextField(
                `${field.fieldApiName}_${i}`
              );
              textField.setMultiline(true);
              textField.addToPage(page, {
                x: pdfX,
                y: pdfY,
                width: fieldWidth,
                height: fieldHeight
              });

              // Add label above text area
              page.drawText(field.fieldLabel, {
                x: pdfX,
                y: pdfY + fieldHeight + 5,
                size: 10,
                font: boldFont,
                color: this.PDFLib.rgb(0.1, 0.1, 0.1)
              });
            } else {
              // Create single-line text field for all other types (STRING, EMAIL, PHONE, etc.)
              const textField = form.createTextField(
                `${field.fieldApiName}_${i}`
              );
              textField.addToPage(page, {
                x: pdfX,
                y: pdfY,
                width: fieldWidth,
                height: fieldHeight
              });

              // Set placeholder text based on field type
              let placeholder = "";
              switch (field.fieldType) {
                case "EMAIL":
                  placeholder = "email@example.com";
                  break;
                case "PHONE":
                  placeholder = "(555) 123-4567";
                  break;
                case "URL":
                  placeholder = "https://example.com";
                  break;
                case "DATE":
                  placeholder = "MM/DD/YYYY";
                  break;
                case "DATETIME":
                  placeholder = "MM/DD/YYYY HH:MM";
                  break;
                case "CURRENCY":
                case "DOUBLE":
                case "INTEGER":
                  placeholder = "0";
                  break;
                default:
                  placeholder = `Enter ${field.fieldLabel}...`;
              }

              // Add label above text field
              page.drawText(field.fieldLabel, {
                x: pdfX,
                y: pdfY + fieldHeight + 5,
                size: 10,
                font: boldFont,
                color: this.PDFLib.rgb(0.1, 0.1, 0.1)
              });

              // Add placeholder/helper text inside field (light gray)
              page.drawText(placeholder, {
                x: pdfX + 3,
                y: pdfY + fieldHeight / 2 - 4,
                size: 8,
                font: helveticaFont,
                color: this.PDFLib.rgb(0.6, 0.6, 0.6)
              });
            }
          } catch (fieldError) {
            console.warn(
              "Error creating form field:",
              field.fieldLabel,
              fieldError
            );

            // Fallback to visual representation if form field creation fails
            page.drawRectangle({
              x: pdfX,
              y: pdfY,
              width: fieldWidth,
              height: fieldHeight,
              borderColor: this.PDFLib.rgb(0.13, 0.74, 0.76),
              borderWidth: 1,
              color: this.PDFLib.rgb(0.13, 0.74, 0.76, 0.1)
            });

            // Add field label
            page.drawText(field.fieldLabel, {
              x: pdfX + 4,
              y: pdfY + fieldHeight - 12,
              size: 10,
              font: boldFont,
              color: this.PDFLib.rgb(0.1, 0.1, 0.1)
            });
          }
        }

        // Add page footer
        page.drawText(`Generated on ${new Date().toLocaleDateString()}`, {
          x: 50,
          y: 30,
          size: 8,
          font: helveticaFont,
          color: this.PDFLib.rgb(0.6, 0.6, 0.6)
        });
      }

      // Generate PDF bytes
      console.log("Generating PDF bytes...");
      const pdfBytes = await pdfDoc.save();

      // Convert to base64 for saving to Salesforce
      const base64String = this.arrayBufferToBase64(pdfBytes);

      // Save PDF to Salesforce for record keeping
      console.log("Saving PDF to Salesforce...");
      const contentVersionId = await this.savePdfToSalesforce(
        base64String,
        `${this.templateName}_Template.pdf`,
        null, // no record association
        false // not temporary
      );

      // Force immediate download using blob instead of Salesforce URL
      console.log("Creating blob for immediate download...");
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);

      // Create download link and force download
      const link = document.createElement("a");
      link.href = url;
      link.download = `${this.templateName}_Template.pdf`;
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the blob URL
      window.URL.revokeObjectURL(url);

      this.showToast(
        "Success",
        "Template PDF downloaded successfully!",
        "success"
      );
    } catch (error) {
      console.error("Error in generateTemplatePdf:", error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        pageSetup: this.pageSetup,
        templateName: this.templateName,
        placedFieldsCount: this.placedFields?.length
      });
      throw error;
    }
  }

  // Helper method to save PDF to Salesforce (reusing logic from pdfSigner)
  async savePdfToSalesforce(base64Data, fileName, recordId, isTemporary) {
    try {
      return await saveSignedPdf({
        base64Data: base64Data,
        fileName: fileName,
        recordId: recordId,
        isTemporary: isTemporary
      });
    } catch (error) {
      console.error("Error saving PDF to Salesforce:", error);
      throw error;
    }
  }

  // Helper method to get document download URL (reusing logic from pdfSigner)
  async getDocumentDownloadUrl(contentVersionId) {
    try {
      return await getDocumentUrl({ contentVersionId: contentVersionId });
    } catch (error) {
      console.error("Error getting document URL:", error);
      throw error;
    }
  }

  // Helper method to convert array buffer to base64
  arrayBufferToBase64(buffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  // Update path classes based on current step
  updatePathClasses() {
    console.log("updatePathClasses called - currentStep:", this.currentStep);

    setTimeout(() => {
      try {
        const pathItems = this.template.querySelectorAll(".custom-path-item");
        console.log("Found", pathItems.length, "path items");

        pathItems.forEach((item) => {
          const indicator = item.querySelector(".custom-path-indicator");
          const number = item.querySelector(".custom-path-number");
          const itemStep = parseInt(item.dataset.step, 10);

          console.log(
            "Processing path item for step:",
            itemStep,
            "current step:",
            this.currentStep
          );

          if (!indicator) {
            console.warn("No indicator found for step:", itemStep);
            return;
          }

          // Apply styling based on step status
          if (itemStep < this.currentStep) {
            // Completed step
            console.log("Styling step", itemStep, "as completed");
            indicator.style.backgroundColor = this.primaryColor;
            indicator.style.color = "white";
            indicator.style.borderColor = "transparent";

            if (number && number.innerHTML !== "✓") {
              number.innerHTML = "✓";
            }
          } else if (itemStep === this.currentStep) {
            // Current step
            console.log("Styling step", itemStep, "as current");
            indicator.style.backgroundColor = this.accentColor;
            indicator.style.color = "white";
            indicator.style.borderColor = "transparent";

            if (number) {
              number.innerHTML = itemStep + 1;
            }
          } else {
            // Future step
            console.log("Styling step", itemStep, "as future");
            indicator.style.backgroundColor = "";
            indicator.style.color = "";
            indicator.style.borderColor = "";

            if (number) {
              number.innerHTML = itemStep + 1;
            }
          }
        });

        console.log("Path classes updated successfully");
      } catch (error) {
        console.error("Error updating path classes:", error);
      }
    }, 10);
  }

  // Update theme variables in CSS
  updateThemeVariables() {
    console.log("updateThemeVariables called");
    try {
      const style = this.template.host.style;

      // Set theme colors
      style.setProperty("--theme-primary-color", this.primaryColor);
      style.setProperty("--theme-accent-color", this.accentColor);
      style.setProperty("--theme-primary-color-rgb", this.primaryColorRgb);
      style.setProperty("--theme-accent-color-rgb", this.accentColorRgb);

      console.log("Theme variables set:", {
        primary: this.primaryColor,
        accent: this.accentColor,
        primaryRgb: this.primaryColorRgb,
        accentRgb: this.accentColorRgb
      });
    } catch (error) {
      console.error("Error setting theme variables:", error);
    }
  }

  // Show toast message
  showToast(title, message, variant) {
    console.log("showToast called:", { title, message, variant });
    try {
      const evt = new ShowToastEvent({
        title: title,
        message: message,
        variant: variant
      });
      this.dispatchEvent(evt);
    } catch (error) {
      console.error("Error showing toast:", error);
    }
  }

  // Ensure combobox search functionality works properly
  ensureComboboxFunctionality() {
    setTimeout(() => {
      try {
        const combobox = this.template.querySelector(
          'lightning-combobox[name="object"]'
        );
        if (combobox) {
          console.log("Found combobox, enhancing functionality...");

          // Try to access the internal input element
          const comboboxElement = combobox.template;
          if (comboboxElement) {
            const input = comboboxElement.querySelector("input");
            if (input) {
              console.log("Found input element, applying fixes...");

              // Ensure input is fully functional
              input.style.pointerEvents = "auto";
              input.style.userSelect = "text";
              input.style.backgroundColor = "white";
              input.style.color = "#1d1d1f";
              input.style.fontSize = "14px";
              input.style.padding = "8px 12px";
              input.style.zIndex = "10";
              input.tabIndex = 0;
              input.setAttribute("autocomplete", "off");

              // Force focus capabilities
              input.addEventListener("focus", () => {
                console.log("Input focused");
                input.style.backgroundColor = "white";
                input.style.color = "#1d1d1f";
              });

              input.addEventListener("input", (e) => {
                console.log("Input typing detected:", e.target.value);
                // Ensure the text is visible
                input.style.color = "#1d1d1f";
                input.style.backgroundColor = "white";
              });

              // Also check for combobox container
              const comboboxContainer =
                comboboxElement.querySelector(".slds-combobox");
              if (comboboxContainer) {
                comboboxContainer.style.zIndex = "10";
                console.log("Enhanced combobox container");
              }

              // Check for dropdown
              const dropdown = comboboxElement.querySelector(".slds-dropdown");
              if (dropdown) {
                dropdown.style.position = "absolute";
                dropdown.style.zIndex = "1000";
                dropdown.style.maxHeight = "240px";
                dropdown.style.overflowY = "auto";
                console.log("Enhanced dropdown positioning");
              }

              console.log("Combobox input functionality enhanced successfully");
            } else {
              console.log("Input element not found in combobox template");
            }
          } else {
            console.log("Could not access combobox template");
          }

          // Also try to access via different selector paths
          const allInputs = this.template.querySelectorAll("input");
          allInputs.forEach((input, index) => {
            if (input.type === "text" || input.type === "search") {
              console.log(`Enhancing input ${index}:`, input);
              input.style.backgroundColor = "white";
              input.style.color = "#1d1d1f";
              input.style.fontSize = "14px";
              input.style.zIndex = "10";
            }
          });
        } else {
          console.log("Combobox not found");
        }
      } catch (error) {
        console.log("Error enhancing combobox functionality:", error);
      }
    }, 200); // Increased timeout to ensure combobox is fully rendered
  }

  // Preview-related properties
  @track previewUrl = ""; // URL for PDF preview
  @track isGeneratingPreview = false; // Loading state for preview generation
  @track previewContentVersionId = null; // Content version ID for preview PDF

  // Generic fields that can be added to any template
  @track genericFields = [
    {
      id: "generic-title",
      label: "Title",
      value: "generic_title",
      type: "GENERIC_TITLE",
      iconName: "utility:text",
      category: "Generic"
    },
    {
      id: "generic-subtitle",
      label: "Subtitle",
      value: "generic_subtitle",
      type: "GENERIC_SUBTITLE",
      iconName: "utility:text",
      category: "Generic"
    },
    {
      id: "generic-section-header",
      label: "Section Header",
      value: "generic_section_header",
      type: "GENERIC_SECTION_HEADER",
      iconName: "utility:section",
      category: "Generic"
    },
    {
      id: "generic-text",
      label: "Text Block",
      value: "generic_text",
      type: "GENERIC_TEXT",
      iconName: "utility:note",
      category: "Generic"
    },
    {
      id: "generic-date",
      label: "Current Date",
      value: "generic_date",
      type: "GENERIC_DATE",
      iconName: "utility:date_input",
      category: "Generic"
    },
    {
      id: "generic-page-number",
      label: "Page Number",
      value: "generic_page_number",
      type: "GENERIC_PAGE_NUMBER",
      iconName: "utility:page",
      category: "Generic"
    },
    {
      id: "generic-separator",
      label: "Separator Line",
      value: "generic_separator",
      type: "GENERIC_SEPARATOR",
      iconName: "utility:minus",
      category: "Generic"
    },
    {
      id: "generic-signature",
      label: "Signature Field",
      value: "generic_signature",
      type: "GENERIC_SIGNATURE",
      iconName: "utility:edit",
      category: "Generic"
    },
    {
      id: "generic-logo",
      label: "Logo/Image",
      value: "generic_logo",
      type: "GENERIC_IMAGE",
      iconName: "utility:image",
      category: "Generic"
    },
    {
      id: "generic-table",
      label: "Table",
      value: "generic_table",
      type: "GENERIC_TABLE",
      iconName: "utility:table",
      category: "Generic"
    }
  ];

  // Grid snap toggle handler
  handleGridSnapToggle(event) {
    this.gridSnapEnabled = event.target.checked;
    console.log("Grid snap toggled:", this.gridSnapEnabled);
  }

  // Show grid toggle handler
  handleShowGridToggle(event) {
    this.showGrid = event.target.checked;
    console.log("Show grid toggled:", this.showGrid);

    // Update page classes to show/hide grid
    this.updatePageClasses();
  }

  // Initialize signature canvas for drawing
  initializeSignatureCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    let isDrawing = false;
    let lastX = 0;
    let lastY = 0;

    // Store signature data
    if (!this.signatureData) {
      this.signatureData = {};
    }

    canvas.addEventListener("mousedown", (e) => {
      isDrawing = true;
      const rect = canvas.getBoundingClientRect();
      lastX = e.clientX - rect.left;
      lastY = e.clientY - rect.top;
    });

    canvas.addEventListener("mousemove", (e) => {
      if (!isDrawing) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(x, y);
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.stroke();

      lastX = x;
      lastY = y;
    });

    canvas.addEventListener("mouseup", () => {
      isDrawing = false;
      // Store signature data
      const placementId = canvas.dataset.placementId;
      this.signatureData[placementId] = canvas.toDataURL();
    });

    canvas.addEventListener("mouseleave", () => {
      isDrawing = false;
    });

    // Touch support for mobile
    canvas.addEventListener("touchstart", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent("mousedown", {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      canvas.dispatchEvent(mouseEvent);
    });

    canvas.addEventListener("touchmove", (e) => {
      e.preventDefault();
      const touch = e.touches[0];
      const mouseEvent = new MouseEvent("mousemove", {
        clientX: touch.clientX,
        clientY: touch.clientY
      });
      canvas.dispatchEvent(mouseEvent);
    });

    canvas.addEventListener("touchend", (e) => {
      e.preventDefault();
      const mouseEvent = new MouseEvent("mouseup", {});
      canvas.dispatchEvent(mouseEvent);
    });
  }

  // Clear signature canvas
  clearSignatureCanvas(canvas) {
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const placementId = canvas.dataset.placementId;
    if (this.signatureData) {
      delete this.signatureData[placementId];
    }
  }

  // Handle image upload
  handleImageUpload(event, imgPreview, uploadPrompt, placementId) {
    const file = event.target.files[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();

      reader.onload = (e) => {
        imgPreview.src = e.target.result;
        imgPreview.style.display = "block";
        uploadPrompt.style.display = "none";

        // Store image data
        if (!this.imageData) {
          this.imageData = {};
        }
        this.imageData[placementId] = e.target.result;
      };

      reader.readAsDataURL(file);
    }
  }

  // Helper method to draw image placeholder
  drawImagePlaceholder(page, x, y, width, height, field, font) {
    page.drawRectangle({
      x: x,
      y: y,
      width: width,
      height: height,
      borderColor: this.PDFLib.rgb(0.7, 0.7, 0.7),
      borderWidth: 1,
      color: this.PDFLib.rgb(0.95, 0.95, 0.95)
    });

    // Add image icon and label in center
    page.drawText("[ " + field.fieldLabel + " ]", {
      x: x + width / 2 - field.fieldLabel.length * 3,
      y: y + height / 2 - 5,
      size: 10,
      font: font,
      color: this.PDFLib.rgb(0.5, 0.5, 0.5)
    });
  }

  // Helper method to draw table to PDF
  async drawTableToPdf(page, field, x, y, width, height, font, pdfDoc) {
    const { rgb } = this.PDFLib;

    // Try to get table data from DOM
    const tableElement = this.template.querySelector(
      `[data-placement-id="${field.id}"] table`
    );

    if (tableElement) {
      // Pre-load bold font if needed
      let boldFont = font;
      if (pdfDoc) {
        try {
          boldFont = await pdfDoc.embedFont(
            this.PDFLib.StandardFonts.HelveticaBold
          );
        } catch (error) {
          console.error("Error loading bold font:", error);
        }
      }

      // Extract table data from DOM
      const rows = Array.from(tableElement.querySelectorAll("tr"));
      const numRows = rows.length;
      const numCols = rows[0] ? rows[0].querySelectorAll("td, th").length : 3;

      const cellWidth = width / numCols;
      const cellHeight = Math.min(height / numRows, 25); // Max 25 points per row

      // Draw table with actual data
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
        const row = rows[rowIndex];
        const cells = Array.from(row.querySelectorAll("td, th"));
        const isHeader = row.parentElement.tagName === "THEAD";

        for (let colIndex = 0; colIndex < cells.length; colIndex++) {
          const cell = cells[colIndex];
          const cellX = x + colIndex * cellWidth;
          const cellY = y + height - (rowIndex + 1) * cellHeight; // PDF coordinates

          // Draw cell border
          page.drawRectangle({
            x: cellX,
            y: cellY,
            width: cellWidth,
            height: cellHeight,
            borderColor: rgb(0, 0, 0),
            borderWidth: 1,
            color: isHeader ? rgb(0.94, 0.94, 0.94) : undefined
          });

          // Draw cell text
          const cellText = cell.textContent || "";
          if (cellText) {
            const fontSize = isHeader ? 10 : 9;
            const textFont = isHeader ? boldFont : font;

            page.drawText(cellText, {
              x: cellX + 5,
              y: cellY + cellHeight / 2 - 4,
              size: fontSize,
              font: textFont,
              color: rgb(0, 0, 0),
              maxWidth: cellWidth - 10
            });
          }
        }
      }
    } else {
      // Draw default table placeholder
      page.drawRectangle({
        x: x,
        y: y,
        width: width,
        height: height,
        borderColor: rgb(0.7, 0.7, 0.7),
        borderWidth: 1
      });

      // Draw sample table structure
      const rows = 3;
      const cols = 3;
      const rowHeight = height / rows;
      const colWidth = width / cols;

      // Draw horizontal lines
      for (let r = 1; r < rows; r++) {
        page.drawLine({
          start: { x: x, y: y + r * rowHeight },
          end: { x: x + width, y: y + r * rowHeight },
          thickness: 0.5,
          color: rgb(0.8, 0.8, 0.8)
        });
      }

      // Draw vertical lines
      for (let c = 1; c < cols; c++) {
        page.drawLine({
          start: { x: x + c * colWidth, y: y },
          end: { x: x + c * colWidth, y: y + height },
          thickness: 0.5,
          color: rgb(0.8, 0.8, 0.8)
        });
      }

      page.drawText("[Table]", {
        x: x + 5,
        y: y + height - 15,
        size: 10,
        font: font,
        color: rgb(0.6, 0.6, 0.6)
      });
    }
  }

  // Helper method to draw signature to PDF
  async drawSignatureToPdf(page, field, x, y, width, height, pdfDoc) {
    if (this.signatureData && this.signatureData[field.id]) {
      try {
        const signatureDataUrl = this.signatureData[field.id];
        const signatureImage = await pdfDoc.embedPng(signatureDataUrl);
        page.drawImage(signatureImage, {
          x: x,
          y: y,
          width: width,
          height: height
        });
      } catch (error) {
        console.error("Error drawing signature:", error);
        // Fall back to signature line
        this.drawSignatureLine(page, field, x, y, width, height);
      }
    } else {
      // Draw signature line if no signature
      this.drawSignatureLine(page, field, x, y, width, height);
    }
  }

  // Helper method to draw signature line
  drawSignatureLine(page, field, x, y, width, height) {
    const { rgb } = this.PDFLib;

    // Draw signature line
    page.drawLine({
      start: { x: x, y: y + height / 2 },
      end: { x: x + width, y: y + height / 2 },
      thickness: 1,
      color: rgb(0, 0, 0),
      opacity: 0.5
    });

    // Add signature label below the line (simplified without requiring font)
    page.drawText(field.fieldLabel || "Signature", {
      x: x,
      y: y + height / 2 - 15,
      size: 8,
      color: rgb(0.4, 0.4, 0.4)
    });
  }
}
