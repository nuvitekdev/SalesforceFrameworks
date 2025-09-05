import { LightningElement, track, api } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import listTemplates from '@salesforce/apex/FormBuilderController.listTemplates';
import createTemplate from '@salesforce/apex/FormBuilderController.createTemplate';
import deleteTemplate from '@salesforce/apex/FormBuilderController.deleteTemplate';
import LightningConfirm from 'lightning/confirm';

export default class FormTemplateList extends LightningElement {
    @track rows = [];
    @track loading = false;
    @track showCreate = false;
    newName = '';
    // backing data for filter/sort
    rowsAll = [];
    filterStatus = 'all';
    sortBy = 'recent';
    searchQuery = '';
    searchTimer;
    get statusOptions() {
        return [
            { label: 'All', value: 'all' },
            { label: 'Draft', value: 'draft' },
            { label: 'Review', value: 'review' },
            { label: 'Active', value: 'active' },
            { label: 'Processing', value: 'processing' },
            { label: 'Error', value: 'error' }
        ];
    }
    get sortOptions() {
        return [
            { label: 'Recently Updated', value: 'recent' },
            { label: 'Confidence High to Low', value: 'confidence_desc' },
            { label: 'Confidence Low to High', value: 'confidence_asc' },
            { label: 'Name A to Z', value: 'name_asc' },
            { label: 'Status', value: 'status_asc' }
        ];
    }
    _selectedId;
    @api get selectedId() { return this._selectedId; }
    set selectedId(v) {
        this._selectedId = v;
        // update selection state without refetching
        this.rows = this.deriveRows();
    }

    connectedCallback() {
        // Restore preferences
        try {
            const ls = window?.localStorage;
            if (ls) {
                this.filterStatus = ls.getItem('afb.filterStatus') || 'all';
                this.sortBy = ls.getItem('afb.sortBy') || 'recent';
                this.searchQuery = ls.getItem('afb.searchQuery') || '';
            }
        } catch (e) { /* ignore */ }
        this.load();
    }

    @api refresh() {
        return this.load();
    }

    @api removeById(id) {
        if (!id) return;
        this.rowsAll = (this.rowsAll || []).filter(r => r.id !== id);
        this.rows = this.deriveRows();
    }

    async load() {
        this.loading = true;
        try {
            const raw = await listTemplates();
            this.rowsAll = (raw || []).map(r => ({
                ...r,
                _statusClass: this.statusClass(r.status),
                _confidencePct: this.formatConfidence(r.confidence),
                _cardClass: `template-card${this.selectedId && this.selectedId === r.id ? ' selected' : ''}`
            }));
            this.rows = this.deriveRows();
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Load Failed',
                message: e.body ? e.body.message : e.message,
                variant: 'error'
            }));
        } finally {
            this.loading = false;
        }
    }

    // No renderedCallback mutation needed; selection handled in setter

    open(e) {
        const id = e.currentTarget?.dataset?.id || e.target?.dataset?.id;
        if (!id) return;
        this.dispatchEvent(new CustomEvent('open', { detail: { id } }));
    }

    handleOpenClick(e) { e.stopPropagation(); this.open(e); }

    async handleDeleteClick(e) {
        e.stopPropagation();
        const id = e.currentTarget?.dataset?.id || e.target?.dataset?.id;
        if (!id) return;
        let ok = false;
        try {
            ok = await LightningConfirm.open({
                message: 'Delete this template? This cannot be undone.',
                label: 'Delete Template',
                theme: 'warning'
            });
        } catch (err) {
            // Fallback if LightningConfirm not available
            // eslint-disable-next-line no-alert
            ok = confirm('Delete this template? This cannot be undone.');
        }
        if (!ok) return;
        this.loading = true;
        try {
            await deleteTemplate({ templateId: id });
            this.dispatchEvent(new ShowToastEvent({ title: 'Deleted', message: 'Template deleted', variant: 'success' }));
            this.dispatchEvent(new CustomEvent('deleted', { detail: { id } }));
            await this.load();
        } catch (e2) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Delete Failed', message: e2.body ? e2.body.message : e2.message, variant: 'error' }));
        } finally {
            this.loading = false;
        }
    }

    toggleCreate() { this.showCreate = !this.showCreate; }
    handleNameChange(e) { this.newName = e.target.value; }
    get disableCreate() { return !this.newName || this.newName.trim().length < 3; }

    async createNew() {
        if (this.disableCreate) return;
        this.loading = true;
        try {
            const id = await createTemplate({ name: this.newName });
            this.newName = '';
            this.showCreate = false;
            await this.load();
            this.dispatchEvent(new ShowToastEvent({ title: 'Created', message: 'Template created', variant: 'success' }));
            this.dispatchEvent(new CustomEvent('open', { detail: { id } }));
        } catch (e) {
            this.dispatchEvent(new ShowToastEvent({ title: 'Create Failed', message: e.body ? e.body.message : e.message, variant: 'error' }));
        } finally {
            this.loading = false;
        }
    }

    handleFilterChange(e) {
        this.filterStatus = e.detail?.value || 'all';
        this.rows = this.deriveRows();
        this.persistPrefs();
    }
    handleSortChange(e) {
        this.sortBy = e.detail?.value || 'recent';
        this.rows = this.deriveRows();
        this.persistPrefs();
    }
    handleSearchChange(e) {
        const val = e.target?.value || '';
        this.searchQuery = val;
        if (this.searchTimer) window.clearTimeout(this.searchTimer);
        this.searchTimer = window.setTimeout(() => {
            this.rows = this.deriveRows();
            this.persistPrefs();
            this.focusSelectedCard();
        }, 200);
    }
    persistPrefs() {
        try {
            const ls = window?.localStorage;
            if (ls) {
                ls.setItem('afb.filterStatus', this.filterStatus || 'all');
                ls.setItem('afb.sortBy', this.sortBy || 'recent');
                ls.setItem('afb.searchQuery', this.searchQuery || '');
            }
        } catch (e) { /* ignore */ }
    }

    deriveRows() {
        let list = [...(this.rowsAll || [])];
        const fs = (this.filterStatus || 'all');
        if (fs !== 'all') list = list.filter(r => (r.status || '').toLowerCase() === fs);
        // Search filter first
        const q = (this.searchQuery || '').trim().toLowerCase();
        if (q) list = list.filter(r => String(r.name || '').toLowerCase().includes(q));
        const sort = this.sortBy || 'recent';
        if (sort === 'confidence_desc') list.sort((a,b) => (Number(b.confidence||0) - Number(a.confidence||0)));
        else if (sort === 'confidence_asc') list.sort((a,b) => (Number(a.confidence||0) - Number(b.confidence||0)));
        else if (sort === 'name_asc') list.sort((a,b) => String(a.name||'').localeCompare(String(b.name||'')));
        else if (sort === 'status_asc') list.sort((a,b) => String(a.status||'').localeCompare(String(b.status||'')));
        else if (sort === 'recent') list.sort((a,b) => new Date(b.lastModifiedDate) - new Date(a.lastModifiedDate));
        return list.map(r => ({
            ...r,
            _cardClass: `template-card${this.selectedId && this.selectedId === r.id ? ' selected' : ''}`,
            _ariaSelected: this.selectedId && this.selectedId === r.id ? 'true' : 'false'
        }));
    }

    get skeletons() { return [1,2,3,4,5,6]; }
    get hasAnyTemplates() { return (this.rowsAll || []).length > 0; }
    get hasActiveFilters() {
        const hasSearch = (this.searchQuery || '').trim().length > 0;
        const hasStatus = (this.filterStatus || 'all') !== 'all';
        const hasSort = (this.sortBy || 'recent') !== 'recent';
        return hasSearch || hasStatus || hasSort;
    }
    get filterStatusLabel() {
        const map = { all: '', draft: 'Draft', review: 'Review', active: 'Active', processing: 'Processing', error: 'Error' };
        return map[this.filterStatus] || '';
    }
    get sortByLabel() {
        const map = {
            recent: 'Recently Updated',
            confidence_desc: 'Confidence High to Low',
            confidence_asc: 'Confidence Low to High',
            name_asc: 'Name A to Z',
            status_asc: 'Status'
        };
        return map[this.sortBy] || '';
    }
    clearAllFilters() {
        this.filterStatus = 'all';
        this.sortBy = 'recent';
        this.searchQuery = '';
        this.rows = this.deriveRows();
        this.persistPrefs();
        this.focusSelectedCard();
    }

    // Keyboard navigation
    handleKeydown(e) {
        const key = e.key;
        if (!['ArrowDown','ArrowUp','Home','End','Enter'].includes(key)) return;
        e.preventDefault();
        const idx = this.indexOfSelected();
        let nextIdx = idx;
        if (key === 'ArrowDown') nextIdx = idx < 0 ? 0 : Math.min(idx + 1, this.rows.length - 1);
        if (key === 'ArrowUp') nextIdx = idx < 0 ? 0 : Math.max(idx - 1, 0);
        if (key === 'Home') nextIdx = 0;
        if (key === 'End') nextIdx = this.rows.length - 1;
        if (key === 'Enter') {
            const openId = idx >= 0 ? this.rows[idx]?.id : (this.rows[0]?.id);
            if (openId) this.dispatchEvent(new CustomEvent('open', { detail: { id: openId } }));
            return;
        }
        if (nextIdx !== idx && this.rows[nextIdx]) {
            this._selectedId = this.rows[nextIdx].id;
            this.rows = this.deriveRows();
            this.focusSelectedCard();
            // Also announce selection to parent (but do not open)
            this.dispatchEvent(new CustomEvent('open', { detail: { id: this._selectedId } }));
        }
    }
    indexOfSelected() { return this.rows.findIndex(r => r.id === this.selectedId); }
    focusSelectedCard() {
        if (!this.selectedId) return;
        // defer to allow DOM to render
        setTimeout(() => {
            const el = this.template.querySelector(`.template-card[data-id="${this.selectedId}"]`);
            if (el && el.focus) el.focus();
        }, 0);
    }

    statusClass(status) {
        const s = (status || '').toLowerCase();
        if (s === 'active') return 'pill pill--active';
        if (s === 'review') return 'pill pill--review';
        if (s === 'processing') return 'pill pill--processing';
        if (s === 'error') return 'pill pill--error';
        return 'pill pill--draft';
    }

    formatConfidence(conf) {
        if (conf === null || conf === undefined || isNaN(conf)) return '-';
        const pct = Math.round(Number(conf) * 100);
        return `${pct}%`;
    }
}

