import { LightningElement, api } from 'lwc';

export default class LlmDocumentModal extends LightningElement {
    @api documents = [];
    @api showModal = false;
    @api modalTitle = 'Select Documents';
    @api modalDescription = '';
    
    selectedDocumentIds = [];

    get hasDocuments() {
        return this.documents && this.documents.length > 0;
    }

    get documentsWithSelection() {
        return this.documents.map(doc => ({
            ...doc,
            isSelected: this.selectedDocumentIds.includes(doc.id)
        }));
    }

    get isConfirmDisabled() {
        return this.selectedDocumentIds.length === 0;
    }

    get selectAllChecked() {
        return this.documents.length > 0 && 
               this.selectedDocumentIds.length === this.documents.length;
    }

    handleDocumentSelection(event) {
        const documentId = event.target.value;
        const isChecked = event.target.checked;

        if (isChecked) {
            this.selectedDocumentIds = [...this.selectedDocumentIds, documentId];
        } else {
            this.selectedDocumentIds = this.selectedDocumentIds.filter(
                id => id !== documentId
            );
        }
    }

    handleSelectAll(event) {
        if (event.target.checked) {
            this.selectedDocumentIds = this.documents.map(doc => doc.id);
        } else {
            this.selectedDocumentIds = [];
        }
    }

    handleCancel() {
        this.selectedDocumentIds = [];
        this.dispatchEvent(new CustomEvent('cancel'));
    }

    handleConfirm() {
        if (this.selectedDocumentIds.length === 0) {
            return;
        }

        this.dispatchEvent(new CustomEvent('confirm', {
            detail: {
                selectedIds: this.selectedDocumentIds
            }
        }));
        
        this.selectedDocumentIds = [];
    }

    @api
    open() {
        this.showModal = true;
    }

    @api
    close() {
        this.showModal = false;
        this.selectedDocumentIds = [];
    }
}