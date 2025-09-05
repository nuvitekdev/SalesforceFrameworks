import { LightningElement, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class AiFormBuilderWorkspace extends LightningElement {
    @track selectedId;
    @track diag;

    onOpen(event) {
        this.selectedId = event.detail.id;
    }

    onDiagnostics(event) {
        this.diag = event.detail;
        try {
            // Bring diagnostics panel into view
            // eslint-disable-next-line no-undef
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } catch (e) {
            // ignore
        }
    }

    copyDiag() {
        const txt = JSON.stringify(this.diag || {}, null, 2);
        try {
            // eslint-disable-next-line no-undef
            navigator.clipboard.writeText(txt);
            this.dispatchEvent(new ShowToastEvent({
                title: 'Copied',
                message: 'Diagnostics copied to clipboard',
                variant: 'success'
            }));
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Copy Failed',
                message: 'Could not copy diagnostics',
                variant: 'error'
            }));
        }
    }

    get diagAsJson() {
        try { return JSON.stringify(this.diag || {}, null, 2); } catch (e) { return ''; }
    }

    onDeleted(event) {
        const deletedId = event.detail?.id;
        if (deletedId && deletedId === this.selectedId) {
            this.selectedId = null;
        }
        this.dispatchEvent(new ShowToastEvent({ title: 'Template Deleted', message: 'Selection cleared', variant: 'info' }));
        // Ask the list to refresh so the deleted item disappears
        try {
            const list = this.template.querySelector('c-form-template-list');
            if (list) {
                if (deletedId && list.removeById) list.removeById(deletedId);
                // Also force a reload in the background to stay in sync
                if (list.refresh) list.refresh();
            }
        } catch (e) { /* ignore */ }
    }
}
