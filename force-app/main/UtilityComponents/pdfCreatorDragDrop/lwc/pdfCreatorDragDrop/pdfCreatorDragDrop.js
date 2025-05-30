import { LightningElement, api, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { loadScript } from 'lightning/platformResourceLoader';
import PDF_LIB from '@salesforce/resourceUrl/pdf_lib';

// Apex methods
import getAvailableObjects from '@salesforce/apex/PdfTemplateController.getAvailableObjects';
import getObjectFields from '@salesforce/apex/PdfTemplateController.getObjectFields';
import saveTemplate from '@salesforce/apex/PdfTemplateController.saveTemplate';
import loadTemplate from '@salesforce/apex/PdfTemplateController.loadTemplate';
import getAvailableTemplates from '@salesforce/apex/PdfTemplateController.getAvailableTemplates';

export default class PdfCreatorDragDrop extends LightningElement {
    // Configurable properties matching pdfSigner style
    @api primaryColor = '#22BDC1';
    @api accentColor = '#D5DF23';
    @api primaryColorRgb = '34, 189, 193';
    @api accentColorRgb = '213, 223, 35';
    
    // Internal state
    @track currentStep = 0; // 0 = setup, 1 = field selection, 2 = design, 3 = preview/save
    @track selectedObject = null;
    @track availableObjects = [];
    @track allFields = [];
    @track selectedFields = [];
    @track displayedFields = []; // Filtered fields based on search
    @track pageSetup = {
        pageSize: 'A4',
        orientation: 'portrait',
        pageCount: 1
    };
    @track templateName = '';
    @track templateDescription = '';
    @track placedFields = []; // Fields placed on PDF pages
    @track pdfPages = []; // Array of page objects for rendering
    @track isLoading = false;
    @track isSaving = false;
    @track searchTerm = '';
    @track selectedFieldCategories = new Set(['all']); // Categories to filter by
    @track fieldCategoryOptions = [
        { label: 'All Fields', value: 'all', checked: true },
        { label: 'Text', value: 'Text', checked: false },
        { label: 'Number', value: 'Number', checked: false },
        { label: 'Date/Time', value: 'Date/Time', checked: false },
        { label: 'Picklist', value: 'Picklist', checked: false },
        { label: 'Checkbox', value: 'Checkbox', checked: false },
        { label: 'Formula', value: 'Formula', checked: false },
        { label: 'Relationship', value: 'Relationship', checked: false }
    ];
    @track currentPageNum = 1;
    @track previewMode = false;
    @track selectedFieldForEdit = null; // For field property editing
    @track existingTemplates = [];
    @track selectedTemplateId = null;
    
    // Theme variables
    themeVariablesSet = false;
    libsLoaded = false;
    PDFLib = null; // PDF-lib reference
    pdfDoc = null; // Current PDF document
    
    // Constants for PDF dimensions (in points - 72 points = 1 inch)
    pageSizes = {
        'A4': { width: 595, height: 842 },
        'Letter': { width: 612, height: 792 },
        'Legal': { width: 612, height: 1008 }
    };
    
    // Getter methods for template conditionals
    get isStep0() { return this.currentStep === 0; }
    get isStep1() { return this.currentStep === 1; }
    get isStep2() { return this.currentStep === 2; }
    get isStep3() { return this.currentStep === 3; }
    
    // Getter for current step class
    get currentStepClass() {
        return `step-${this.currentStep}-mode`;
    }
    
    // Getter for combined container classes
    get containerClasses() {
        return `pdf-creator-container ${this.currentStepClass}`;
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
            { label: 'A4 (210 × 297 mm)', value: 'A4' },
            { label: 'Letter (8.5 × 11 in)', value: 'Letter' },
            { label: 'Legal (8.5 × 14 in)', value: 'Legal' }
        ];
    }
    
    get orientationOptions() {
        return [
            { label: 'Portrait', value: 'portrait' },
            { label: 'Landscape', value: 'landscape' }
        ];
    }
    
    get fieldCategories() {
        // Get unique categories from fields
        const categories = new Set(['all']);
        this.allFields.forEach(field => {
            if (field.category) {
                categories.add(field.category);
            }
        });
        return Array.from(categories).map(cat => ({
            label: cat === 'all' ? 'All Fields' : cat,
            value: cat
        }));
    }
    
    get hasSelectedFields() {
        return this.selectedFields.length > 0;
    }
    
    get isObjectNotSelected() {
        return !this.selectedObject;
    }
    
    get noFieldsSelected() {
        return !this.hasSelectedFields;
    }
    
    get selectedFieldCount() {
        return this.selectedFields.length;
    }
    
    get totalFieldCount() {
        return this.allFields.length;
    }
    
    // Get current page dimensions based on setup
    get currentPageDimensions() {
        const size = this.pageSizes[this.pageSetup.pageSize];
        if (this.pageSetup.orientation === 'landscape') {
            return { width: size.height, height: size.width };
        }
        return size;
    }
    
    // Lifecycle hooks
    renderedCallback() {
        // Load static resources once
        if (!this.libsLoaded) {
            this.libsLoaded = true;
            loadScript(this, PDF_LIB)
                .then(() => {
                    this.PDFLib = window.PDFLib;
                    console.log('PDF-lib loaded successfully');
                })
                .catch(error => {
                    console.error('Error loading PDF-lib', error);
                });
        }
        
        // Set theme variables once
        if (!this.themeVariablesSet) {
            this.themeVariablesSet = true;
            this.updateThemeVariables();
            this.updatePathClasses();
        }
        
        // Initialize PDF pages when entering design step
        if (this.currentStep === 2 && this.pdfPages.length === 0) {
            this.initializePdfPages();
        }
        
        // Update field display based on filters
        if (this.currentStep === 1) {
            this.filterFields();
        }
    }
    
    connectedCallback() {
        // Load available objects on component initialization
        this.loadObjects();
    }
    
    // Load available Salesforce objects
    async loadObjects() {
        this.isLoading = true;
        try {
            const objects = await getAvailableObjects();
            this.availableObjects = objects.map(obj => ({
                label: obj.label + (obj.isCustom ? ' (Custom)' : ''),
                value: obj.value,
                description: `API Name: ${obj.value}`,
                ...obj
            }));
            console.log(`Loaded ${this.availableObjects.length} objects`);
        } catch (error) {
            console.error('Error loading objects:', error);
            this.showToast('Error', 'Failed to load objects: ' + error.body?.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }
    
    // Handle object selection
    handleObjectSelect(event) {
        this.selectedObject = event.detail.value;
        console.log('Selected object:', this.selectedObject);
        
        // Reset field selections when object changes
        this.allFields = [];
        this.selectedFields = [];
        this.displayedFields = [];
        
        // Load fields for selected object
        if (this.selectedObject) {
            this.loadFieldsForObject();
        }
    }
    
    // Load fields for selected object
    async loadFieldsForObject() {
        this.isLoading = true;
        try {
            const fields = await getObjectFields({ objectApiName: this.selectedObject });
            this.allFields = fields.map(field => ({
                ...field,
                id: field.value, // Add unique ID for tracking
                selected: false,
                iconName: this.getFieldIcon(field.type)
            }));
            console.log(`Loaded ${this.allFields.length} fields for ${this.selectedObject}`);
            
            // Update displayed fields
            this.filterFields();
        } catch (error) {
            console.error('Error loading fields:', error);
            this.showToast('Error', 'Failed to load fields: ' + error.body?.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }
    
    // Get icon for field type
    getFieldIcon(fieldType) {
        const iconMap = {
            'STRING': 'utility:text',
            'TEXTAREA': 'utility:textarea',
            'PICKLIST': 'utility:picklist',
            'MULTIPICKLIST': 'utility:multi_picklist',
            'BOOLEAN': 'utility:checkbox',
            'DATE': 'utility:date_input',
            'DATETIME': 'utility:date_time',
            'TIME': 'utility:clock',
            'EMAIL': 'utility:email',
            'PHONE': 'utility:phone_portrait',
            'URL': 'utility:link',
            'CURRENCY': 'utility:currency',
            'DOUBLE': 'utility:number_input',
            'INTEGER': 'utility:number_input',
            'PERCENT': 'utility:percent',
            'REFERENCE': 'utility:record_lookup',
            'ID': 'utility:key',
            'ENCRYPTED': 'utility:lock'
        };
        return iconMap[fieldType] || 'utility:text';
    }
    
    // Filter fields based on search and category
    filterFields() {
        let filtered = [...this.allFields];
        
        // Apply search filter
        if (this.searchTerm) {
            const searchLower = this.searchTerm.toLowerCase();
            filtered = filtered.filter(field => 
                field.label.toLowerCase().includes(searchLower) ||
                field.value.toLowerCase().includes(searchLower)
            );
        }
        
        // Apply category filter
        if (!this.selectedFieldCategories.has('all')) {
            filtered = filtered.filter(field => 
                this.selectedFieldCategories.has(field.category)
            );
        }
        
        this.displayedFields = filtered;
    }
    
    // Handle search input
    handleFieldSearch(event) {
        this.searchTerm = event.target.value;
        this.filterFields();
    }
    
    // Handle category filter change
    handleCategoryChange(event) {
        const category = event.target.dataset.category;
        const isChecked = event.target.checked;
        
        // Update the checked property in fieldCategoryOptions
        this.fieldCategoryOptions = this.fieldCategoryOptions.map(opt => {
            if (opt.value === category) {
                return { ...opt, checked: isChecked };
            }
            if (category === 'all' && isChecked) {
                // If 'all' is checked, uncheck all others
                return { ...opt, checked: opt.value === 'all' };
            }
            if (category !== 'all' && isChecked && opt.value === 'all') {
                // If any specific category is checked, uncheck 'all'
                return { ...opt, checked: false };
            }
            return opt;
        });
        
        // Update selected categories set
        if (category === 'all') {
            if (isChecked) {
                // Select all categories
                this.selectedFieldCategories = new Set(['all']);
            }
        } else {
            if (isChecked) {
                this.selectedFieldCategories.add(category);
                this.selectedFieldCategories.delete('all');
            } else {
                this.selectedFieldCategories.delete(category);
                if (this.selectedFieldCategories.size === 0) {
                    // If no categories selected, default to 'all'
                    this.selectedFieldCategories.add('all');
                    this.fieldCategoryOptions = this.fieldCategoryOptions.map(opt => ({
                        ...opt,
                        checked: opt.value === 'all'
                    }));
                }
            }
        }
        
        this.filterFields();
    }
    
    // Handle field selection checkbox
    handleFieldSelect(event) {
        const fieldId = event.target.dataset.fieldId;
        const isChecked = event.target.checked;
        
        // Update field selection state
        const field = this.allFields.find(f => f.id === fieldId);
        if (field) {
            field.selected = isChecked;
            
            if (isChecked) {
                // Add to selected fields if not already there
                if (!this.selectedFields.find(f => f.id === fieldId)) {
                    this.selectedFields.push(field);
                }
            } else {
                // Remove from selected fields
                this.selectedFields = this.selectedFields.filter(f => f.id !== fieldId);
            }
        }
        
        // Update displayed fields to reflect selection
        this.displayedFields = [...this.displayedFields];
    }
    
    // Handle select/deselect all
    handleSelectAll() {
        this.displayedFields.forEach(field => {
            field.selected = true;
            if (!this.selectedFields.find(f => f.id === field.id)) {
                this.selectedFields.push(field);
            }
        });
        this.displayedFields = [...this.displayedFields];
    }
    
    handleDeselectAll() {
        this.displayedFields.forEach(field => {
            field.selected = false;
        });
        this.selectedFields = this.selectedFields.filter(
            selected => !this.displayedFields.find(displayed => displayed.id === selected.id)
        );
        this.displayedFields = [...this.displayedFields];
    }
    
    // Page setup handlers
    handlePageSizeChange(event) {
        this.pageSetup.pageSize = event.detail.value;
    }
    
    handleOrientationChange(event) {
        this.pageSetup.orientation = event.detail.value;
    }
    
    handlePageCountChange(event) {
        this.pageSetup.pageCount = parseInt(event.target.value, 10) || 1;
    }
    
    // Navigation between steps
    goToStep(event) {
        const step = parseInt(event.currentTarget.dataset.step, 10);
        const previousStep = this.currentStep;
        
        // Validation before moving forward
        if (step > previousStep) {
            if (previousStep === 0 && !this.selectedObject) {
                this.showToast('Warning', 'Please select an object first', 'warning');
                return;
            }
            if (previousStep === 1 && this.selectedFields.length === 0) {
                this.showToast('Warning', 'Please select at least one field', 'warning');
                return;
            }
        }
        
        this.currentStep = step;
        this.updatePathClasses();
        
        // Initialize design area when entering step 2
        if (step === 2 && this.pdfPages.length === 0) {
            this.initializePdfPages();
        }
    }
    
    // Initialize PDF pages for design
    initializePdfPages() {
        this.pdfPages = [];
        for (let i = 0; i < this.pageSetup.pageCount; i++) {
            this.pdfPages.push({
                pageNumber: i + 1,
                fields: [],
                cssClass: i === 0 ? 'pdf-page active' : 'pdf-page hidden'
            });
        }
        
        // Create blank PDF document
        if (this.PDFLib) {
            this.createBlankPdf();
        }
    }
    
    // Create blank PDF with pdf-lib
    async createBlankPdf() {
        try {
            this.pdfDoc = await this.PDFLib.PDFDocument.create();
            
            // Add pages based on setup
            const { width, height } = this.currentPageDimensions;
            for (let i = 0; i < this.pageSetup.pageCount; i++) {
                this.pdfDoc.addPage([width, height]);
            }
            
            console.log(`Created blank PDF with ${this.pageSetup.pageCount} pages`);
        } catch (error) {
            console.error('Error creating blank PDF:', error);
        }
    }
    
    // Handle drag start for fields
    handleFieldDragStart(event) {
        const fieldId = event.currentTarget.dataset.fieldId;
        const field = this.selectedFields.find(f => f.id === fieldId);
        
        if (field) {
            // Store field data for drop
            event.dataTransfer.setData('fieldData', JSON.stringify(field));
            event.dataTransfer.effectAllowed = 'copy';
            
            // Add visual feedback
            event.currentTarget.classList.add('dragging');
        }
    }
    
    handleFieldDragEnd(event) {
        event.currentTarget.classList.remove('dragging');
    }
    
    // Handle drag over PDF page
    handlePageDragOver(event) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        
        // Add visual feedback
        event.currentTarget.classList.add('drag-over');
    }
    
    handlePageDragLeave(event) {
        event.currentTarget.classList.remove('drag-over');
    }
    
    // Handle drop on PDF page
    handlePageDrop(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
        
        try {
            const fieldData = JSON.parse(event.dataTransfer.getData('fieldData'));
            const pageElement = event.currentTarget;
            const pageNum = parseInt(pageElement.dataset.pageNum, 10);
            
            // Get drop position relative to page
            const rect = pageElement.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            // Convert to PDF coordinates (considering page dimensions)
            const pageWidth = rect.width;
            const pageHeight = rect.height;
            const pdfDimensions = this.currentPageDimensions;
            
            const pdfX = (x / pageWidth) * pdfDimensions.width;
            const pdfY = (y / pageHeight) * pdfDimensions.height;
            
            // Place field on page
            this.placeFieldOnPage(fieldData, pageNum, pdfX, pdfY);
            
        } catch (error) {
            console.error('Error handling drop:', error);
        }
    }
    
    // Place field on PDF page
    placeFieldOnPage(fieldData, pageNum, x, y) {
        const placementId = 'field-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
        
        // Default dimensions based on field type
        let width = 200;
        let height = 30;
        
        if (fieldData.type === 'TEXTAREA' || fieldData.type === 'LONG_TEXT_AREA') {
            height = 80;
        } else if (fieldData.type === 'BOOLEAN') {
            width = 30;
            height = 30;
        }
        
        // Create field placement object
        const placement = {
            id: placementId,
            fieldApiName: fieldData.value,
            fieldLabel: fieldData.label,
            fieldType: fieldData.type,
            pageNumber: pageNum,
            x: x,
            y: y,
            width: width,
            height: height,
            fontSize: 12,
            fontFamily: 'Arial',
            alignment: 'left',
            selected: false
        };
        
        // Add to placed fields
        this.placedFields.push(placement);
        
        // Update page fields array
        const pageIndex = pageNum - 1;
        if (!this.pdfPages[pageIndex].fields) {
            this.pdfPages[pageIndex].fields = [];
        }
        this.pdfPages[pageIndex].fields.push(placement);
        
        // Render the field on the page
        this.renderFieldOnPage(placement);
    }
    
    // Render field element on page
    renderFieldOnPage(placement) {
        const pageElement = this.template.querySelector(`[data-page-num="${placement.pageNumber}"]`);
        if (!pageElement) return;
        
        // Create field element
        const fieldElement = document.createElement('div');
        fieldElement.className = 'placed-field';
        fieldElement.dataset.placementId = placement.id;
        fieldElement.style.position = 'absolute';
        fieldElement.style.left = (placement.x / this.currentPageDimensions.width * 100) + '%';
        fieldElement.style.top = (placement.y / this.currentPageDimensions.height * 100) + '%';
        fieldElement.style.width = (placement.width / this.currentPageDimensions.width * 100) + '%';
        fieldElement.style.height = (placement.height / this.currentPageDimensions.height * 100) + '%';
        
        // Add field content
        fieldElement.innerHTML = `
            <div class="field-content">
                <div class="field-label">${placement.fieldLabel}</div>
                <div class="field-placeholder">[${placement.fieldApiName}]</div>
            </div>
            <div class="field-controls">
                <button class="resize-handle resize-se" data-handle="se"></button>
                <button class="remove-field" data-placement-id="${placement.id}">✖</button>
            </div>
        `;
        
        // Add event listeners
        fieldElement.addEventListener('mousedown', (e) => this.startDragField(e, placement));
        fieldElement.querySelector('.remove-field').addEventListener('click', (e) => this.removeField(e));
        fieldElement.querySelector('.resize-handle').addEventListener('mousedown', (e) => this.startResizeField(e, placement));
        
        pageElement.appendChild(fieldElement);
    }
    
    // Field manipulation methods
    startDragField(event, placement) {
        if (event.target.classList.contains('resize-handle') || event.target.classList.contains('remove-field')) {
            return;
        }
        
        event.preventDefault();
        const fieldElement = event.currentTarget;
        const pageElement = fieldElement.parentElement;
        
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
            
            fieldElement.style.left = Math.max(0, Math.min(newLeft, maxLeft)) + 'px';
            fieldElement.style.top = Math.max(0, Math.min(newTop, maxTop)) + 'px';
            
            // Update placement coordinates
            const rect = pageElement.getBoundingClientRect();
            placement.x = (fieldElement.offsetLeft / rect.width) * this.currentPageDimensions.width;
            placement.y = (fieldElement.offsetTop / rect.height) * this.currentPageDimensions.height;
        };
        
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    
    startResizeField(event, placement) {
        event.preventDefault();
        event.stopPropagation();
        
        const fieldElement = event.currentTarget.closest('.placed-field');
        const pageElement = fieldElement.parentElement;
        const handle = event.currentTarget.dataset.handle;
        
        const startX = event.clientX;
        const startY = event.clientY;
        const startWidth = fieldElement.offsetWidth;
        const startHeight = fieldElement.offsetHeight;
        
        const handleMouseMove = (e) => {
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            
            if (handle.includes('e')) {
                const newWidth = Math.max(50, startWidth + deltaX);
                fieldElement.style.width = newWidth + 'px';
                placement.width = (newWidth / pageElement.offsetWidth) * this.currentPageDimensions.width;
            }
            
            if (handle.includes('s')) {
                const newHeight = Math.max(30, startHeight + deltaY);
                fieldElement.style.height = newHeight + 'px';
                placement.height = (newHeight / pageElement.offsetHeight) * this.currentPageDimensions.height;
            }
        };
        
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        };
        
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
    
    removeField(event) {
        const placementId = event.currentTarget.dataset.placementId;
        
        // Remove from placed fields array
        this.placedFields = this.placedFields.filter(f => f.id !== placementId);
        
        // Remove from page fields
        this.pdfPages.forEach(page => {
            if (page.fields) {
                page.fields = page.fields.filter(f => f.id !== placementId);
            }
        });
        
        // Remove DOM element
        const fieldElement = this.template.querySelector(`[data-placement-id="${placementId}"]`);
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
            cssClass: 'pdf-page hidden' // Default to hidden
        });
        
        // Add page to PDF document
        if (this.pdfDoc) {
            const { width, height } = this.currentPageDimensions;
            this.pdfDoc.addPage([width, height]);
        }
        
        // Update page classes
        this.updatePageClasses();
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
        this.pdfPages = this.pdfPages.map(page => ({
            ...page,
            cssClass: page.pageNumber === this.currentPageNum ? 'pdf-page active' : 'pdf-page hidden'
        }));
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
            this.showToast('Warning', 'Please enter a template name', 'warning');
            return;
        }
        
        if (this.placedFields.length === 0) {
            this.showToast('Warning', 'Please place at least one field on the template', 'warning');
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
                fields: this.placedFields.map(field => ({
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
            
            this.showToast('Success', 'Template saved successfully!', 'success');
            
            // Move to success step
            this.currentStep = 3;
            this.updatePathClasses();
            
        } catch (error) {
            console.error('Error saving template:', error);
            this.showToast('Error', 'Failed to save template: ' + error.body?.message, 'error');
        } finally {
            this.isSaving = false;
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
        this.templateName = '';
        this.templateDescription = '';
        this.selectedTemplateId = null;
        this.pageSetup = {
            pageSize: 'A4',
            orientation: 'portrait',
            pageCount: 1
        };
        this.currentPageNum = 1;
        
        this.updatePathClasses();
    }
    
    // Update path classes based on current step
    updatePathClasses() {
        setTimeout(() => {
            const pathItems = this.template.querySelectorAll('.custom-path-item');
            
            pathItems.forEach((item) => {
                const indicator = item.querySelector('.custom-path-indicator');
                const number = item.querySelector('.custom-path-number');
                const itemStep = parseInt(item.dataset.step, 10);
                
                if (!indicator) return;
                
                // Apply styling based on step status
                if (itemStep < this.currentStep) {
                    // Completed step
                    indicator.style.backgroundColor = this.primaryColor;
                    indicator.style.color = 'white';
                    indicator.style.borderColor = 'transparent';
                    
                    if (number && number.innerHTML !== '✓') {
                        number.innerHTML = '✓';
                    }
                } else if (itemStep === this.currentStep) {
                    // Current step
                    indicator.style.backgroundColor = this.accentColor;
                    indicator.style.color = 'white';
                    indicator.style.borderColor = 'transparent';
                    
                    if (number) {
                        number.innerHTML = itemStep + 1;
                    }
                } else {
                    // Future step
                    indicator.style.backgroundColor = '';
                    indicator.style.color = '';
                    indicator.style.borderColor = '';
                    
                    if (number) {
                        number.innerHTML = itemStep + 1;
                    }
                }
            });
        }, 0);
    }
    
    // Update theme CSS variables
    updateThemeVariables() {
        const host = this.template.host;
        if (host) {
            host.style.setProperty('--theme-primary-color', this.primaryColor);
            host.style.setProperty('--theme-accent-color', this.accentColor);
            host.style.setProperty('--theme-primary-color-rgb', this.primaryColorRgb);
            host.style.setProperty('--theme-accent-color-rgb', this.accentColorRgb);
        }
    }
    
    // Toast helper
    showToast(title, message, variant) {
        const evt = new ShowToastEvent({
            title: title,
            message: message,
            variant: variant
        });
        this.dispatchEvent(evt);
    }
} 