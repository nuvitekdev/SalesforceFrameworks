import { LightningElement, api } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import signaturePadResource from '@salesforce/resourceUrl/signature_pad';

export default class SignatureModal extends LightningElement {
    @api showModal = false;
    signaturePad;
    typedName = '';
    selectedFont = 'cursive';
    canvasElement;
    previewElement;
    
    fontOptions = [
        { label: 'Cursive', value: 'cursive' },
        { label: 'Serif', value: 'serif' },
        { label: 'Sans-serif', value: 'sans-serif' }
    ];
    
    connectedCallback() {
        Promise.all([
            loadScript(this, signaturePadResource)
        ]).then(() => {
            this.initializeSignaturePad();
        }).catch(error => {
            console.error('Error loading SignaturePad:', error);
        });
    }
    
    renderedCallback() {
        if (!this.canvasElement && this.template.querySelector('canvas.signature-pad')) {
            this.initializeSignaturePad();
        }
        
        // Apply font styling to the preview element
        if (this.typedName) {
            this.updatePreviewStyle();
        }
    }
    
    updatePreviewStyle() {
        const previewElement = this.template.querySelector('.signature-preview');
        if (previewElement) {
            previewElement.style.fontFamily = this.selectedFont;
            previewElement.style.fontSize = '2rem';
        }
    }
    
    initializeSignaturePad() {
        this.canvasElement = this.template.querySelector('canvas.signature-pad');
        if (this.canvasElement && window.SignaturePad) {
            // Set canvas dimensions
            const wrapper = this.canvasElement.closest('.signature-container');
            this.canvasElement.width = wrapper.clientWidth;
            this.canvasElement.height = 200;
            
            // Initialize signature pad
            this.signaturePad = new window.SignaturePad(this.canvasElement, {
                backgroundColor: 'rgb(255, 255, 255)',
                penColor: 'rgb(0, 0, 0)'
            });
        }
    }
    
    handleClearSignature() {
        if (this.signaturePad) {
            this.signaturePad.clear();
        }
    }
    
    handleNameChange(event) {
        this.typedName = event.target.value;
        this.updatePreviewStyle();
    }
    
    handleFontChange(event) {
        this.selectedFont = event.target.value;
        this.updatePreviewStyle();
    }
    
    handleCancel() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }
    
    handleApply() {
        let signatureData;
        const activeTab = this.template.querySelector('lightning-tabset').activeTabValue;
        
        if (activeTab === 'Draw') {
            if (this.signaturePad && !this.signaturePad.isEmpty()) {
                signatureData = {
                    type: 'drawn',
                    dataUrl: this.signaturePad.toDataURL()
                };
            } else {
                // Show error that signature is required
                return;
            }
        } else {
            if (this.typedName) {
                // Create canvas for typed signature
                const canvas = document.createElement('canvas');
                canvas.width = 500;
                canvas.height = 200;
                const ctx = canvas.getContext('2d');
                
                // Clear canvas
                ctx.fillStyle = 'white';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // Draw text
                ctx.font = `2rem ${this.selectedFont}`;
                ctx.fillStyle = 'black';
                ctx.textBaseline = 'middle';
                ctx.fillText(this.typedName, 50, canvas.height / 2);
                
                signatureData = {
                    type: 'typed',
                    dataUrl: canvas.toDataURL(),
                    text: this.typedName,
                    font: this.selectedFont
                };
            } else {
                // Show error that name is required
                return;
            }
        }
        
        this.dispatchEvent(new CustomEvent('signed', {
            detail: signatureData
        }));
    }
} 