/**
 * Disbursement & Expense Module
 * Expense filing, fund source tagging, 1-tier approval, templates, print voucher.
 */

const Disbursement = {
  view: 'list', // 'list' | 'form' | 'detail' | 'report' | 'templates'
  detailId: null,
  listViewMode: 'table', // 'table' | 'board' | 'list'

  render() {
    const container = el('div', { class: 'page' });
    
    if (this.view === 'detail' && this.detailId) {
      const d = DB.getById('disbursements', this.detailId);
      const titleBar = el('div', { class: 'page-title-bar-v2' });
      const h1 = el('h1', { class: 'breadcrumb-h1' });
      const baseLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Disbursement' });
      baseLink.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
      h1.appendChild(baseLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      h1.appendChild(document.createTextNode(d?.description || 'Detail'));
      titleBar.appendChild(h1);
      
      const backBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to List' });
      backBtn.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
      titleBar.appendChild(backBtn);
      container.appendChild(titleBar);
    } else if (this.view === 'templates') {
      const titleBar = el('div', { class: 'page-title-bar-v2' });
      const h1 = el('h1', { class: 'breadcrumb-h1' });
      const baseLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Disbursement' });
      baseLink.addEventListener('click', () => { this.view = 'list'; App.handleRoute(); });
      h1.appendChild(baseLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      h1.appendChild(document.createTextNode('Templates'));
      titleBar.appendChild(h1);
      
      const backBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to List' });
      backBtn.addEventListener('click', () => { this.view = 'list'; App.handleRoute(); });
      titleBar.appendChild(backBtn);
      container.appendChild(titleBar);
    } else {
      container.appendChild(el('h1', { text: 'Disbursement' }));
    }

    if (this.view === 'list') container.appendChild(this.renderList());
    else if (this.view === 'form') container.appendChild(this.renderForm());
    else if (this.view === 'detail') container.appendChild(this.renderDetail());
    else if (this.view === 'report') container.appendChild(this.renderReport());
    else if (this.view === 'templates') container.appendChild(this.renderTemplates());

    return container;
  },

  init() {},

  getFundSource(item) {
    if (item.fundSource) return item.fundSource;
    if (item.type === 'ClientFunded') return 'Client Fund';
    return 'Firm Fund';
  },

  getEmployeeId(item) {
    return item.employeeId || item.requestedBy;
  },

  // ============================================================
  // List View
  // ============================================================
  renderList() {
    const entity = Auth.activeEntity;
    const viewMode = App.getPreferredViewMode('disbursement');

    const actions = el('div', { class: 'actions-bar' });
    const addBtn = el('button', { class: 'btn btn-primary', text: 'File Expense' });
    addBtn.addEventListener('click', () => { this.view = 'form'; this.detailId = null; App.handleRoute(); });
    actions.appendChild(addBtn);

    const templatesBtn = el('button', { class: 'btn btn-ghost', text: 'Templates' });
    templatesBtn.addEventListener('click', () => { this.view = 'templates'; App.handleRoute(); });
    actions.appendChild(templatesBtn);

    const reportBtn = el('button', { class: 'btn btn-ghost', text: 'Summary Report' });
    reportBtn.addEventListener('click', () => { this.view = 'report'; App.handleRoute(); });
    actions.appendChild(reportBtn);

    const wrapper = el('div');
    wrapper.appendChild(actions);

    // Filters bar
    const filtersBar = el('div', { class: 'filters-bar' });

    const wrFilter = el('select', { class: 'form-select', style: 'max-width:180px' });
    wrFilter.appendChild(el('option', { value: '', text: 'All Work Requests' }));
    DB.getWhere('workRequests', wr => wr.entity === entity).forEach(wr => {
      const client = DB.getById('clients', wr.clientId);
      wrFilter.appendChild(el('option', { value: wr.id, text: wr.title + ' — ' + (client?.name || '—') }));
    });
    filtersBar.appendChild(wrFilter);

    const clientFilter = el('select', { class: 'form-select', style: 'max-width:180px' });
    clientFilter.appendChild(el('option', { value: '', text: 'All Clients' }));
    DB.getWhere('clients', c => c.entity === entity).forEach(c => {
      clientFilter.appendChild(el('option', { value: c.id, text: c.name }));
    });
    filtersBar.appendChild(clientFilter);

    const empFilter = el('select', { class: 'form-select', style: 'max-width:180px' });
    empFilter.appendChild(el('option', { value: '', text: 'All Employees' }));
    DB.getWhere('users', u => ['Admin', 'Manager', 'Staff'].includes(u.role)).forEach(u => {
      empFilter.appendChild(el('option', { value: u.id, text: u.name }));
    });
    filtersBar.appendChild(empFilter);

    const fundFilter = el('select', { class: 'form-select', style: 'max-width:150px' });
    fundFilter.appendChild(el('option', { value: '', text: 'All Funds' }));
    ['Firm Fund', 'Client Fund'].forEach(f => fundFilter.appendChild(el('option', { value: f, text: f })));
    filtersBar.appendChild(fundFilter);

    const statusFilter = el('select', { class: 'form-select', style: 'max-width:150px' });
    statusFilter.appendChild(el('option', { value: '', text: 'All Statuses' }));
    ['Draft', 'Submitted', 'Under Review', 'Approved', 'Released', 'Rejected'].forEach(s => {
      statusFilter.appendChild(el('option', { value: s, text: s }));
    });
    filtersBar.appendChild(statusFilter);

    const dateFrom = el('input', { type: 'date', class: 'form-select', style: 'max-width:140px' });
    const dateTo = el('input', { type: 'date', class: 'form-select', style: 'max-width:140px' });
    filtersBar.appendChild(el('span', { text: 'From:', style: 'font-size:0.75rem;color:var(--color-text-muted);' }));
    filtersBar.appendChild(dateFrom);
    filtersBar.appendChild(el('span', { text: 'To:', style: 'font-size:0.75rem;color:var(--color-text-muted);' }));
    filtersBar.appendChild(dateTo);

    wrapper.appendChild(filtersBar);

    // View mode toggle
    const viewToggle = el('div', { class: 'view-mode-toggle', style: 'margin-bottom: var(--spacing-md);' });
    [['Table', 'table'], ['Board', 'board'], ['List', 'list']].forEach(([label, mode]) => {
      const btn = el('button', { text: label, class: viewMode === mode ? 'active' : '' });
      btn.addEventListener('click', () => {
        App.setPreferredViewMode('disbursement', mode);
        App.handleRoute();
      });
      viewToggle.appendChild(btn);
    });
    wrapper.appendChild(viewToggle);

    const listContainer = el('div');
    wrapper.appendChild(listContainer);

    const refresh = () => this.refreshList(listContainer, wrFilter.value, clientFilter.value, empFilter.value, fundFilter.value, statusFilter.value, dateFrom.value, dateTo.value, viewMode);
    [wrFilter, clientFilter, empFilter, fundFilter, statusFilter, dateFrom, dateTo].forEach(f => f.addEventListener('change', refresh));

    refresh();

    return wrapper;
  },

  refreshList(container, wrFilter, clientFilter, empFilter, fundFilter, statusFilter, dateFrom, dateTo, viewMode) {
    while (container.firstChild) container.removeChild(container.firstChild);
    const entity = Auth.activeEntity;
    let items = DB.getWhere('disbursements', d => d.entity === entity);

    if (wrFilter) items = items.filter(d => d.linkedWorkRequestId === wrFilter);
    if (clientFilter) {
      items = items.filter(d => {
        if (!d.linkedWorkRequestId) return false;
        const wr = DB.getById('workRequests', d.linkedWorkRequestId);
        return wr && wr.clientId === clientFilter;
      });
    }
    if (empFilter) items = items.filter(d => this.getEmployeeId(d) === empFilter);
    if (fundFilter) items = items.filter(d => this.getFundSource(d) === fundFilter);
    if (statusFilter) items = items.filter(d => d.status === statusFilter);
    if (dateFrom) {
      const fromDate = new Date(dateFrom).getTime();
      items = items.filter(d => new Date(d.submittedAt).getTime() >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      items = items.filter(d => new Date(d.submittedAt).getTime() <= toDate.getTime());
    }

    items.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    if (items.length === 0) {
      container.appendChild(el('p', { text: 'No expenses found.', class: 'empty-state' }));
      return;
    }

    if (viewMode === 'table') {
      this.renderTableView(container, items);
    } else if (viewMode === 'board') {
      this.renderBoardView(container, items);
    } else {
      this.renderCompactListView(container, items);
    }
  },

  renderTableView(container, items) {
    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Employee', 'Category', 'Amount', 'Fund', 'Status', 'Payment Method', 'Date', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = el('tbody');
    items.forEach(d => {
      const emp = DB.getById('users', this.getEmployeeId(d));
      const tr = el('tr');
      tr.appendChild(el('td', { text: emp?.name || '—' }));
      tr.appendChild(el('td', { text: d.category }));
      tr.appendChild(el('td', { text: formatPHP(d.amount) }));
      const source = this.getFundSource(d);
      const fundBadge = el('span', { class: 'badge ' + (source === 'Firm Fund' ? 'badge-info' : 'badge-warning'), text: source });
      const tdFund = el('td');
      tdFund.appendChild(fundBadge);
      tr.appendChild(tdFund);
      tr.appendChild(el('td', { text: d.status }));
      const payMethod = (d.status === 'Released' && d.paymentDetails?.method) ? d.paymentDetails.method : '—';
      tr.appendChild(el('td', { text: payMethod }));
      tr.appendChild(el('td', { text: formatDate(d.submittedAt) }));
      const tdAct = el('td');
      const viewBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { this.view = 'detail'; this.detailId = d.id; App.handleRoute(); });
      tdAct.appendChild(viewBtn);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  },

  renderBoardView(container, items) {
    if (items.length === 0) {
      container.appendChild(el('p', { text: 'No expenses found.', class: 'empty-state' }));
      return;
    }
    const board = el('div', { class: 'board-v2' });
    const statuses = ['Draft', 'Submitted', 'Under Review', 'Approved', 'Released', 'Rejected'];
    const statusColors = {
      'Draft': '#94a3b8',
      'Submitted': '#3b82f6',
      'Under Review': '#f59e0b',
      'Approved': '#10b981',
      'Released': '#6366f1',
      'Rejected': '#ef4444'
    };

    statuses.forEach(st => {
      const colColor = statusColors[st] || '#cbd5e1';
      const col = el('div', { class: 'board-column-v2' });
      col.style.borderTop = `4px solid ${colColor}`;
      
      const header = el('div', { class: 'board-column-header-v2' });
      header.appendChild(el('div', { class: 'board-column-title', text: st }));
      col.appendChild(header);

      const colItems = items.filter(d => d.status === st);
      const cardContainer = el('div', { class: 'board-cards-scroll' });

      colItems.forEach(d => {
        const emp = DB.getById('users', this.getEmployeeId(d));
        const card = el('div', { class: 'board-card-v2' });
        card.style.borderLeftColor = colColor;
        card.addEventListener('click', () => { this.view = 'detail'; this.detailId = d.id; App.handleRoute(); });

        // Top: Status path and Date
        const topRow = el('div', { class: 'card-v2-top' });
        topRow.appendChild(el('span', { class: 'card-v2-category', text: `${d.status} >` }));
        topRow.appendChild(el('span', { class: 'card-v2-date', text: formatDate(d.submittedAt) }));
        card.appendChild(topRow);

        // Title Row
        const titleRow = el('div', { class: 'card-v2-title-row' });
        titleRow.appendChild(el('div', { class: 'card-v2-title', text: d.category }));
        card.appendChild(titleRow);

        // Subtitle: Employee and Fund
        const source = this.getFundSource(d);
        card.appendChild(el('div', { text: `${emp?.name || '—'} • ${source}`, style: 'font-size:0.875rem;color:#64748b;margin-bottom:12px;' }));

        // Meta: Financials
        const metaRow = el('div', { class: 'card-v2-meta' });
        metaRow.appendChild(el('div', { class: 'card-v2-meta-text', text: formatPHP(d.amount), style: 'font-weight:700;color:#1e293b;font-size:1.125rem;' }));
        card.appendChild(metaRow);

        cardContainer.appendChild(card);
      });
      col.appendChild(cardContainer);
      board.appendChild(col);
    });
    container.appendChild(board);
  },

  renderCompactListView(container, items) {
    const list = el('div', { class: 'list-view' });
    items.forEach(d => {
      const emp = DB.getById('users', this.getEmployeeId(d));
      const item = el('div', { class: 'list-item' });
      const left = el('div');
      left.appendChild(el('div', { class: 'list-item-title', text: d.category + ' — ' + formatPHP(d.amount) }));
      left.appendChild(el('div', { class: 'list-item-meta', text: (emp?.name || '—') + ' • ' + this.getFundSource(d) + ' • ' + formatDate(d.submittedAt) }));
      item.appendChild(left);
      const viewBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { this.view = 'detail'; this.detailId = d.id; App.handleRoute(); });
      item.appendChild(viewBtn);
      list.appendChild(item);
    });
    container.appendChild(list);
  },

  // ============================================================
  // Expense Filing Form
  // ============================================================
  renderForm() {
    const entity = Auth.activeEntity;
    const isNew = !this.detailId;
    const existing = this.detailId ? DB.getById('disbursements', this.detailId) : null;

    const container = el('div');

    // Form header bar
    const headerBar = el('div', { class: 'form-header-bar' });
    headerBar.appendChild(el('h2', { text: isNew ? 'File Expense' : 'Edit Expense' }));
    const headerActions = el('div', { class: 'form-actions-top' });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
    headerActions.appendChild(cancelBtn);

    const saveBtnTop = el('button', { type: 'submit', class: 'btn btn-primary', text: isNew ? 'Submit Expense' : 'Save Changes' });
    headerActions.appendChild(saveBtnTop);

    headerBar.appendChild(headerActions);
    container.appendChild(headerBar);

    const form = el('form', { class: 'form-stacked', id: 'disbursement-form' });

    const catGroup = el('div', { class: 'form-group' });
    catGroup.appendChild(el('label', { text: 'Category *' }));
    const catSel = el('select', { name: 'category', required: true, class: 'form-select' });
    ['Transportation', 'Notary', 'Meals', 'Government Fee', 'Other'].forEach(c => {
      const opt = el('option', { value: c, text: c });
      if (existing && existing.category === c) opt.selected = true;
      catSel.appendChild(opt);
    });
    catGroup.appendChild(catSel);
    form.appendChild(catGroup);

    const descGroup = el('div', { class: 'form-group' });
    descGroup.appendChild(el('label', { text: 'Description *' }));
    descGroup.appendChild(el('input', { type: 'text', name: 'description', required: true, value: existing ? (existing.description || '') : '' }));
    form.appendChild(descGroup);

    const amtGroup = el('div', { class: 'form-group' });
    amtGroup.appendChild(el('label', { text: 'Amount (₱) *' }));
    amtGroup.appendChild(el('input', { type: 'number', name: 'amount', min: 0, step: 0.01, required: true, value: existing ? String(existing.amount) : '' }));
    form.appendChild(amtGroup);

    const receiptGroup = el('div', { class: 'form-group' });
    receiptGroup.appendChild(el('label', { text: 'Receipt (optional)' }));
    receiptGroup.appendChild(el('input', { type: 'file', name: 'receipt' }));
    if (existing && existing.receiptFilename) {
      receiptGroup.appendChild(el('p', { text: 'Current: ' + existing.receiptFilename, style: 'font-size:0.75rem;color:var(--color-text-muted);' }));
    }
    form.appendChild(receiptGroup);

    // Linked Work Request
    const wrGroup = el('div', { class: 'form-group' });
    wrGroup.appendChild(el('label', { text: 'Linked Work Request' }));
    const wrSel = el('select', { name: 'linkedWorkRequestId', class: 'form-select' });
    wrSel.appendChild(el('option', { value: '', text: '— None —' }));
    DB.getWhere('workRequests', wr => wr.entity === entity).forEach(wr => {
      const client = DB.getById('clients', wr.clientId);
      const opt = el('option', { value: wr.id, text: wr.title + ' — ' + (client?.name || '—') });
      if (existing && existing.linkedWorkRequestId === wr.id) opt.selected = true;
      wrSel.appendChild(opt);
    });
    wrGroup.appendChild(wrSel);
    form.appendChild(wrGroup);

    // Fund Source
    const fundGroup = el('div', { class: 'form-group' });
    fundGroup.appendChild(el('label', { text: 'Fund Source *' }));
    const fundWrap = el('div', { class: 'radio-group' });
    ['Firm Fund', 'Client Fund'].forEach(f => {
      const label = el('label', { class: 'radio-label' });
      const radio = el('input', { type: 'radio', name: 'fundSource', value: f, required: true });
      if (existing ? existing.fundSource === f : f === 'Firm Fund') radio.checked = true;
      label.appendChild(radio);
      label.appendChild(document.createTextNode(' ' + f));
      fundWrap.appendChild(label);
    });
    fundGroup.appendChild(fundWrap);
    form.appendChild(fundGroup);

    // Linked invoice (only for Client Fund)
    const invGroup = el('div', { class: 'form-group hidden', id: 'linked-invoice-group' });
    invGroup.appendChild(el('label', { text: 'Linked Billing Invoice' }));
    const invSel = el('select', { name: 'linkedInvoiceId', class: 'form-select' });
    invSel.appendChild(el('option', { value: '', text: '— Select Invoice —' }));
    DB.getWhere('invoices', inv => inv.entity === entity && inv.status !== 'Cancelled').forEach(inv => {
      const client = DB.getById('clients', inv.clientId);
      const opt = el('option', { value: inv.id, text: inv.invoiceNumber + ' — ' + (client?.name || '—') });
      if (existing && existing.linkedInvoiceId === inv.id) opt.selected = true;
      invSel.appendChild(opt);
    });
    invGroup.appendChild(invSel);
    form.appendChild(invGroup);

    form.querySelectorAll('input[name="fundSource"]').forEach(r => {
      r.addEventListener('change', () => {
        const isClient = form.querySelector('input[name="fundSource"]:checked')?.value === 'Client Fund';
        invGroup.classList.toggle('hidden', !isClient);
      });
    });
    // Trigger initial state
    const initialClientFund = existing && existing.fundSource === 'Client Fund';
    if (initialClientFund) invGroup.classList.remove('hidden');

    form.addEventListener('submit', e => { e.preventDefault(); this.submitForm(form); });

    container.appendChild(form);
    return container;
  },

  submitForm(form) {
    if (!validateRequiredFields(form)) return;

    const data = Object.fromEntries(new FormData(form).entries());
    const entity = Auth.activeEntity;
    const receiptInput = form.querySelector('input[name="receipt"]');
    const receiptFile = receiptInput?.files?.[0];
    const isNew = !this.detailId;

    const record = {
      category: data.category,
      description: data.description.trim(),
      amount: parseFloat(data.amount) || 0,
      fundSource: data.fundSource,
      linkedInvoiceId: data.linkedInvoiceId || null,
      linkedWorkRequestId: data.linkedWorkRequestId || null,
      entity: entity,
      employeeId: Auth.user.id,
      requestedBy: Auth.user.id,
      status: 'Submitted',
      submittedAt: new Date().toISOString(),
      receiptFilename: receiptFile ? receiptFile.name : (isNew ? null : (DB.getById('disbursements', this.detailId)?.receiptFilename || null))
    };

    if (!isNew) {
      record.id = this.detailId;
      const old = DB.getById('disbursements', this.detailId);
      if (old) {
        record.createdAt = old.createdAt;
        record.status = old.status; // preserve status on edit
        record.submittedAt = old.submittedAt;
        record.requestedBy = old.requestedBy || Auth.user.id; // preserve original requester
        record.paymentHandledBy = old.paymentHandledBy || '';
        record.paymentDetails = old.paymentDetails || { method: '', reference: '', bank: '', date: '', processedBy: '' };
      }
    } else {
      record.id = generateId('d');
      record.createdAt = new Date().toISOString();
    }

    // If linked to a WR, update WR's linkedDisbursementIds
    if (record.linkedWorkRequestId) {
      const wr = DB.getById('workRequests', record.linkedWorkRequestId);
      if (wr) {
        const linkedIds = new Set(wr.linkedDisbursementIds || []);
        linkedIds.add(record.id);
        DB.update('workRequests', wr.id, { linkedDisbursementIds: Array.from(linkedIds) });
      }
    }

    PendingChanges.submit('disbursements', record, isNew);

    this.view = 'list';
    this.detailId = null;
    App.handleRoute();
  },

  // ============================================================
  // Detail View (with approval actions)
  // ============================================================
  renderDetail() {
    const d = DB.getById('disbursements', this.detailId);
    if (!d) { this.view = 'list'; App.handleRoute(); return el('div'); }
    const emp = DB.getById('users', this.getEmployeeId(d));
    const container = el('div', { class: 'invoice-detail' });

    // Top actions bar
    const topActions = el('div', { class: 'actions-bar', style: 'margin-bottom: var(--spacing-lg);' });
    const topBackBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to List' });
    topBackBtn.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
    topActions.appendChild(topBackBtn);

    // Print button
    const printBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'Print Voucher' });
    printBtn.addEventListener('click', () => this.openPrintVoucher(d));
    topActions.appendChild(printBtn);

    container.appendChild(topActions);

    const header = el('div', { class: 'invoice-header' });
    header.appendChild(el('h2', { text: d.category }));

    const map = {
      'Submitted': 'badge-info',
      'Under Review': 'badge-warning',
      'Approved': 'badge-success',
      'Released': 'badge-success',
      'Rejected': 'badge-danger',
      'Cancelled': 'badge-danger'
    };
    header.appendChild(el('span', { class: 'badge ' + (map[d.status] || ''), text: d.status }));
    container.appendChild(header);

    const meta = el('div', { class: 'invoice-meta' });
    const requester = DB.getById('users', d.requestedBy);
    const handler = d.paymentHandledBy ? DB.getById('users', d.paymentHandledBy) : null;
    meta.appendChild(el('p', { text: 'Requested By: ' + (requester?.name || emp?.name || '—') }));
    if (handler) {
      meta.appendChild(el('p', { text: 'Payment Handled By: ' + handler.name }));
    }
    meta.appendChild(el('p', { text: 'Date Submitted: ' + formatDate(d.submittedAt) }));
    meta.appendChild(el('p', { text: 'Fund Source: ' + this.getFundSource(d) }));
    if (d.linkedWorkRequestId) {
      const wr = DB.getById('workRequests', d.linkedWorkRequestId);
      if (wr) meta.appendChild(el('p', { text: 'Work Request: ' + wr.title }));
    }
    container.appendChild(meta);

    const infoSection = el('div', { class: 'form-section', style: 'margin-bottom: var(--spacing-lg);' });
    infoSection.appendChild(el('h3', { text: 'Expense Details' }));
    const infoBox = el('div', { class: 'invoice-info-box' });
    infoBox.appendChild(el('p', { text: 'Description: ' + d.description }));
    if (d.receiptFilename) infoBox.appendChild(el('p', { text: 'Receipt: ' + d.receiptFilename }));
    infoSection.appendChild(infoBox);
    container.appendChild(infoSection);

    const totals = el('div', { class: 'invoice-totals' });
    totals.appendChild(el('div', { class: 'total-row total-grand' }, [el('span', { text: 'Total Amount:' }), el('span', { text: formatPHP(d.amount) })]));
    container.appendChild(totals);

    // Payment details (shown if released)
    if (d.status === 'Released' && d.paymentDetails) {
      const paySection = el('div', { class: 'form-section', style: 'margin-bottom: var(--spacing-lg);' });
      paySection.appendChild(el('h3', { text: 'Payment Details' }));
      const payBox = el('div', { class: 'invoice-info-box' });
      const pd = d.paymentDetails;
      const handler = DB.getById('users', d.paymentHandledBy);
      payBox.appendChild(el('p', { text: 'Method: ' + (pd.method || '—') }));
      payBox.appendChild(el('p', { text: 'Reference: ' + (pd.reference || '—') }));
      payBox.appendChild(el('p', { text: 'Bank: ' + (pd.bank || '—') }));
      payBox.appendChild(el('p', { text: 'Date: ' + (pd.date ? formatDate(pd.date) : '—') }));
      payBox.appendChild(el('p', { text: 'Handled By: ' + (handler?.name || '—') }));
      paySection.appendChild(payBox);
      container.appendChild(paySection);
    }

    const actions = el('div', { class: 'form-actions', style: 'margin-top: var(--spacing-lg); border-top: 1px solid var(--color-border); padding-top: var(--spacing-lg);' });

    const isRequester = Auth.isSelfApprover(this.getEmployeeId(d));
    const isAdmin = Auth.user.role === 'Admin';

    // 1-Tier Admin Approval Chain
    if (d.status === 'Submitted' || d.status === 'Under Review' || d.status === 'Approved') {
      if (isAdmin) {
        if (isRequester) {
          container.appendChild(el('p', { class: 'field-error', text: 'You cannot approve/release your own expense submission. Please wait for another Admin to process it.' }));
        } else {
          const releaseBtn = el('button', { class: 'btn btn-success', text: 'Approve & Release' });
          releaseBtn.addEventListener('click', () => { this.showReleaseDialog(d.id); });
          actions.appendChild(releaseBtn);

          const rejectBtn = el('button', { class: 'btn btn-danger', text: 'Reject' });
          rejectBtn.addEventListener('click', () => {
            const reason = prompt('Enter rejection reason:');
            if (reason) { this.reject(this.detailId, reason); App.handleRoute(); }
          });
          actions.appendChild(rejectBtn);
        }
      } else {
        container.appendChild(el('p', { class: 'empty-state', text: 'Waiting for Admin review and release.' }));
      }
    }

    container.appendChild(actions);

    return container;
  },

  showReleaseDialog(id) {
    const d = DB.getById('disbursements', id);
    if (!d) return;

    // Build modal for payment details
    const overlay = el('div', { class: 'modal-overlay' });
    const modal = el('div', { class: 'modal' });
    const modalHeader = el('div', { class: 'modal-header' });
    modalHeader.appendChild(el('h3', { class: 'modal-title', text: 'Release Payment' }));
    const closeBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '×' });
    closeBtn.addEventListener('click', () => overlay.remove());
    modalHeader.appendChild(closeBtn);
    modal.appendChild(modalHeader);

    const modalBody = el('div', { class: 'modal-body' });
    const form = el('form', { class: 'form-stacked' });

    const methodGroup = el('div', { class: 'form-group' });
    methodGroup.appendChild(el('label', { text: 'Payment Method *' }));
    const methodSel = el('select', { name: 'method', required: true, class: 'form-select' });
    ['Cash', 'Check', 'Bank Transfer', 'GCash', 'Other'].forEach(m => methodSel.appendChild(el('option', { value: m, text: m })));
    methodGroup.appendChild(methodSel);
    form.appendChild(methodGroup);

    const refGroup = el('div', { class: 'form-group' });
    refGroup.appendChild(el('label', { text: 'Reference Number' }));
    refGroup.appendChild(el('input', { type: 'text', name: 'reference' }));
    form.appendChild(refGroup);

    const bankGroup = el('div', { class: 'form-group' });
    bankGroup.appendChild(el('label', { text: 'Bank' }));
    bankGroup.appendChild(el('input', { type: 'text', name: 'bank' }));
    form.appendChild(bankGroup);

    const dateGroup = el('div', { class: 'form-group' });
    dateGroup.appendChild(el('label', { text: 'Payment Date *' }));
    dateGroup.appendChild(el('input', { type: 'date', name: 'date', required: true, value: new Date().toISOString().slice(0, 10) }));
    form.appendChild(dateGroup);

    const handlerGroup = el('div', { class: 'form-group' });
    handlerGroup.appendChild(el('label', { text: 'Payment Handled By *' }));
    const handlerSel = el('select', { name: 'paymentHandledBy', required: true, class: 'form-select' });
    handlerSel.appendChild(el('option', { value: '', text: '— Select User —' }));
    DB.getWhere('users', u => ['Admin', 'Manager', 'Staff'].includes(u.role)).forEach(u => {
      handlerSel.appendChild(el('option', { value: u.id, text: u.name + ' (' + u.role + ')' }));
    });
    handlerGroup.appendChild(handlerSel);
    form.appendChild(handlerGroup);

    const submitBtn = el('button', { type: 'submit', class: 'btn btn-success', text: 'Confirm Release' });
    form.appendChild(submitBtn);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validateRequiredFields(form)) return;
      const fd = new FormData(form);
      this.release(id, {
        method: fd.get('method'),
        reference: fd.get('reference') || '',
        bank: fd.get('bank') || '',
        date: fd.get('date'),
        processedBy: Auth.user.id
      }, fd.get('paymentHandledBy'));
      overlay.remove();
      App.handleRoute();
    });

    modalBody.appendChild(form);
    modal.appendChild(modalBody);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  },

  approve(id) {
    DB.update('disbursements', id, {
      status: 'Approved',
      approvedBy: Auth.user.id,
      approvedAt: new Date().toISOString()
    });
    return { success: true };
  },

  release(id, paymentDetails, paymentHandledBy) {
    DB.update('disbursements', id, {
      status: 'Released',
      releasedBy: Auth.user.id,
      releasedAt: new Date().toISOString(),
      paymentHandledBy: paymentHandledBy || Auth.user.id,
      paymentDetails: paymentDetails || { method: '', reference: '', bank: '', date: '', processedBy: Auth.user.id }
    });
  },

  reject(id, reason) {
    DB.update('disbursements', id, {
      status: 'Rejected',
      rejectedBy: Auth.user.id,
      rejectionReason: reason
    });
  },

  // ============================================================
  // Print Voucher
  // ============================================================
  openPrintVoucher(d) {
    const emp = DB.getById('users', this.getEmployeeId(d));
    const requester = DB.getById('users', d.requestedBy);
    const handler = d.paymentHandledBy ? DB.getById('users', d.paymentHandledBy) : null;
    const win = window.open('', '_blank');
    if (!win) return;

    const doc = win.document;
    const meta = doc.createElement('meta');
    meta.setAttribute('charset', 'UTF-8');
    doc.head.appendChild(meta);
    const title = doc.createElement('title');
    title.textContent = 'Payment Voucher';
    doc.head.appendChild(title);

    const style = doc.createElement('style');
    style.textContent = `
      body { font-family: Arial, sans-serif; margin: 40px; color: #333; }
      .voucher-header { text-align: center; margin-bottom: 24px; }
      .voucher-header h1 { margin: 0; font-size: 1.5rem; text-transform: uppercase; letter-spacing: 1px; }
      .voucher-header p { margin: 4px 0 0; font-size: 0.875rem; color: #666; }
      table.voucher-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      table.voucher-table td { padding: 10px 0; border-bottom: 1px solid #ddd; vertical-align: top; }
      table.voucher-table td.label { width: 35%; color: #555; font-size: 0.875rem; }
      table.voucher-table td.value { font-weight: 600; }
      table.voucher-table td.total { font-size: 1.125rem; font-weight: 700; color: #000; }
      .signatures { display: flex; justify-content: space-between; margin-top: 48px; }
      .signature-block { width: 45%; text-align: center; }
      .signature-line { border-top: 1px solid #333; padding-top: 8px; margin-top: 48px; }
      .signature-label { font-size: 0.875rem; color: #555; }
      .signature-name { font-weight: 600; }
    `;
    doc.head.appendChild(style);

    const body = doc.body;

    const header = doc.createElement('div');
    header.className = 'voucher-header';
    const h1 = doc.createElement('h1');
    h1.textContent = 'Payment Voucher';
    header.appendChild(h1);
    const sub = doc.createElement('p');
    sub.textContent = 'Disbursement #' + d.id;
    header.appendChild(sub);
    body.appendChild(header);

    const table = doc.createElement('table');
    table.className = 'voucher-table';

    const rows = [
      { label: 'Voucher No', value: d.id },
      { label: 'Date of Request', value: formatDate(d.submittedAt) },
      { label: 'Date of Disbursement', value: (d.releasedAt ? formatDate(d.releasedAt) : (d.paymentDetails?.date ? formatDate(d.paymentDetails.date) : '—')) },
      { label: 'Payee', value: emp?.name || '—' },
      { label: 'Category', value: d.category },
      { label: 'Description', value: d.description },
      { label: 'Fund Source', value: this.getFundSource(d) },
      { label: 'Amount', value: formatPHP(d.amount), isTotal: true }
    ];

    if (d.paymentDetails && d.paymentDetails.method) {
      rows.push({ label: 'Payment Method', value: d.paymentDetails.method });
      rows.push({ label: 'Reference / Check No.', value: d.paymentDetails.reference || '—' });
      rows.push({ label: 'Bank', value: d.paymentDetails.bank || '—' });
    }

    rows.forEach(r => {
      const tr = doc.createElement('tr');
      const tdLabel = doc.createElement('td');
      tdLabel.className = 'label';
      tdLabel.textContent = r.label;
      const tdValue = doc.createElement('td');
      tdValue.className = r.isTotal ? 'value total' : 'value';
      tdValue.textContent = r.value;
      tr.appendChild(tdLabel);
      tr.appendChild(tdValue);
      table.appendChild(tr);
    });
    body.appendChild(table);

    const sigWrap = doc.createElement('div');
    sigWrap.className = 'signatures';

    const prepBlock = doc.createElement('div');
    prepBlock.className = 'signature-block';
    const prepLine = doc.createElement('div');
    prepLine.className = 'signature-line';
    const prepName = doc.createElement('div');
    prepName.className = 'signature-name';
    prepName.textContent = requester?.name || emp?.name || '—';
    const prepLabel = doc.createElement('div');
    prepLabel.className = 'signature-label';
    prepLabel.textContent = 'Prepared By';
    prepBlock.appendChild(prepLine);
    prepBlock.appendChild(prepName);
    prepBlock.appendChild(prepLabel);
    sigWrap.appendChild(prepBlock);

    const appBlock = doc.createElement('div');
    appBlock.className = 'signature-block';
    const appLine = doc.createElement('div');
    appLine.className = 'signature-line';
    const appName = doc.createElement('div');
    appName.className = 'signature-name';
    appName.textContent = handler?.name || '—';
    const appLabel = doc.createElement('div');
    appLabel.className = 'signature-label';
    appLabel.textContent = 'Approved By';
    appBlock.appendChild(appLine);
    appBlock.appendChild(appName);
    appBlock.appendChild(appLabel);
    sigWrap.appendChild(appBlock);

    body.appendChild(sigWrap);

    win.focus();
    setTimeout(() => win.print(), 300);
  },

  // ============================================================
  // Templates View
  // ============================================================
  renderTemplates() {
    const entity = Auth.activeEntity;
    const templates = DB.getWhere('disbursementTemplates', t => t.entity === entity);

    const wrapper = el('div');

    const actions = el('div', { class: 'actions-bar' });
    const newTemplateBtn = el('button', { class: 'btn btn-primary btn-sm', text: '+ New Template' });
    newTemplateBtn.addEventListener('click', () => this.showTemplateForm());
    actions.appendChild(newTemplateBtn);

    wrapper.appendChild(actions);

    if (templates.length === 0) {
      wrapper.appendChild(el('p', { text: 'No templates found.', class: 'empty-state' }));
      return wrapper;
    }

    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Name', 'Category', 'Amount', 'Fund Source', 'Schedule', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = el('tbody');
    templates.forEach(t => {
      const tr = el('tr');
      tr.appendChild(el('td', { text: t.name }));
      tr.appendChild(el('td', { text: t.category }));
      tr.appendChild(el('td', { text: formatPHP(t.amount) }));
      tr.appendChild(el('td', { text: t.fundSource }));
      tr.appendChild(el('td', { text: t.schedule || '—' }));
      const tdAct = el('td');
      const genBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Generate Next Period' });
      genBtn.addEventListener('click', () => this.generateFromTemplate(t));
      tdAct.appendChild(genBtn);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    return container;
  },

  showTemplateForm() {
    const entity = Auth.activeEntity;

    const overlay = el('div', { class: 'modal-overlay' });
    const modal = el('div', { class: 'modal' });

    const modalHeader = el('div', { class: 'modal-header' });
    modalHeader.appendChild(el('h3', { class: 'modal-title', text: 'New Disbursement Template' }));
    const closeBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '×' });
    closeBtn.addEventListener('click', () => overlay.remove());
    modalHeader.appendChild(closeBtn);
    modal.appendChild(modalHeader);

    const modalBody = el('div', { class: 'modal-body' });
    const form = el('form', { class: 'form-stacked' });

    const nameGroup = el('div', { class: 'form-group' });
    nameGroup.appendChild(el('label', { text: 'Template Name *' }));
    nameGroup.appendChild(el('input', { type: 'text', name: 'name', required: true }));
    form.appendChild(nameGroup);

    const catGroup = el('div', { class: 'form-group' });
    catGroup.appendChild(el('label', { text: 'Category *' }));
    const catSel = el('select', { name: 'category', required: true, class: 'form-select' });
    ['Transportation', 'Notary', 'Meals', 'Government Fee', 'Other'].forEach(c => {
      catSel.appendChild(el('option', { value: c, text: c }));
    });
    catGroup.appendChild(catSel);
    form.appendChild(catGroup);

    const amtGroup = el('div', { class: 'form-group' });
    amtGroup.appendChild(el('label', { text: 'Amount (₱) *' }));
    amtGroup.appendChild(el('input', { type: 'number', name: 'amount', min: 0, step: 0.01, required: true }));
    form.appendChild(amtGroup);

    const fundGroup = el('div', { class: 'form-group' });
    fundGroup.appendChild(el('label', { text: 'Fund Source *' }));
    const fundWrap = el('div', { class: 'radio-group' });
    ['Firm Fund', 'Client Fund'].forEach(f => {
      const label = el('label', { class: 'radio-label' });
      const radio = el('input', { type: 'radio', name: 'fundSource', value: f, required: true });
      if (f === 'Firm Fund') radio.checked = true;
      label.appendChild(radio);
      label.appendChild(document.createTextNode(' ' + f));
      fundWrap.appendChild(label);
    });
    fundGroup.appendChild(fundWrap);
    form.appendChild(fundGroup);

    const scheduleGroup = el('div', { class: 'form-group' });
    scheduleGroup.appendChild(el('label', { text: 'Schedule' }));
    scheduleGroup.appendChild(el('input', { type: 'text', name: 'schedule', placeholder: 'e.g. Monthly, Weekly, Quarterly' }));
    form.appendChild(scheduleGroup);

    const descGroup = el('div', { class: 'form-group' });
    descGroup.appendChild(el('label', { text: 'Description' }));
    descGroup.appendChild(el('textarea', { name: 'description', rows: 3 }));
    form.appendChild(descGroup);

    const wrGroup = el('div', { class: 'form-group' });
    wrGroup.appendChild(el('label', { text: 'Linked Work Request (optional)' }));
    const wrSel = el('select', { name: 'linkedWorkRequestId', class: 'form-select' });
    wrSel.appendChild(el('option', { value: '', text: '— None —' }));
    DB.getWhere('workRequests', wr => wr.entity === entity).forEach(wr => {
      const client = DB.getById('clients', wr.clientId);
      wrSel.appendChild(el('option', { value: wr.id, text: wr.title + ' — ' + (client?.name || '—') }));
    });
    wrGroup.appendChild(wrSel);
    form.appendChild(wrGroup);

    const invGroup = el('div', { class: 'form-group' });
    invGroup.appendChild(el('label', { text: 'Linked Invoice (optional)' }));
    const invSel = el('select', { name: 'linkedInvoiceId', class: 'form-select' });
    invSel.appendChild(el('option', { value: '', text: '— None —' }));
    DB.getWhere('invoices', inv => inv.entity === entity && inv.status !== 'Cancelled').forEach(inv => {
      const client = DB.getById('clients', inv.clientId);
      invSel.appendChild(el('option', { value: inv.id, text: inv.invoiceNumber + ' — ' + (client?.name || '—') }));
    });
    invGroup.appendChild(invSel);
    form.appendChild(invGroup);

    const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Save Template' });
    form.appendChild(submitBtn);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validateRequiredFields(form)) return;
      const data = Object.fromEntries(new FormData(form).entries());
      const template = {
        id: generateId('dtpl'),
        entity: entity,
        name: data.name.trim(),
        category: data.category,
        amount: parseFloat(data.amount) || 0,
        fundSource: data.fundSource,
        schedule: data.schedule || '',
        description: data.description || '',
        linkedWorkRequestId: data.linkedWorkRequestId || null,
        linkedInvoiceId: data.linkedInvoiceId || null,
        createdAt: new Date().toISOString(),
        createdBy: Auth.user.id
      };
      DB.insert('disbursementTemplates', template);
      overlay.remove();
      this.view = 'templates';
      App.handleRoute();
    });

    modalBody.appendChild(form);
    modal.appendChild(modalBody);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
  },

  generateFromTemplate(template) {
    const record = {
      id: generateId('d'),
      category: template.category,
      description: template.description || template.name,
      amount: template.amount,
      fundSource: template.fundSource,
      linkedInvoiceId: template.linkedInvoiceId || null,
      linkedWorkRequestId: template.linkedWorkRequestId || null,
      entity: template.entity,
      employeeId: Auth.user.id,
      requestedBy: Auth.user.id,
      status: 'Submitted',
      submittedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      receiptFilename: null,
      paymentHandledBy: '',
      paymentDetails: { method: '', reference: '', bank: '', date: '', processedBy: '' }
    };

    DB.insert('disbursements', record);

    // Link to WR if applicable
    if (record.linkedWorkRequestId) {
      const wr = DB.getById('workRequests', record.linkedWorkRequestId);
      if (wr) {
        const linkedIds = new Set(wr.linkedDisbursementIds || []);
        linkedIds.add(record.id);
        DB.update('workRequests', wr.id, { linkedDisbursementIds: Array.from(linkedIds) });
      }
    }

    Workflow.showMessage('Template Success', 'Disbursement generated from template: ' + template.name, 'success');
    this.view = 'list';
    App.handleRoute();
  },

  // ============================================================
  // Reimbursement Summary Report
  // ============================================================
  renderReport() {
    const entity = Auth.activeEntity;
    const items = DB.getWhere('disbursements', d => d.entity === entity && d.status === 'Released');

    const container = el('div', { class: 'page' });

    // Top actions bar
    const topActions = el('div', { class: 'actions-bar', style: 'margin-bottom: var(--spacing-lg);' });
    const topBackBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to List' });
    topBackBtn.addEventListener('click', () => { this.view = 'list'; App.handleRoute(); });
    topActions.appendChild(topBackBtn);
    container.appendChild(topActions);

    container.appendChild(el('h2', { text: 'Reimbursement Summary', style: 'margin-bottom: var(--spacing-lg);' }));

    const grid = el('div', { class: 'bento-grid' });

    // By Employee
    const byEmployee = {};
    items.forEach(d => {
      const empName = DB.getById('users', this.getEmployeeId(d))?.name || 'Unknown';
      if (!byEmployee[empName]) byEmployee[empName] = { count: 0, total: 0 };
      byEmployee[empName].count++;
      byEmployee[empName].total += d.amount;
    });

    const empCard = el('div', { class: 'bento-item bento-half report-card' });
    empCard.appendChild(el('h3', { text: 'By Employee', style: 'margin-top:0;' }));
    const empTable = el('table', { class: 'report-table' });
    empTable.appendChild(el('thead', {}, [
      el('tr', {}, [
        el('th', { text: 'Employee' }),
        el('th', { text: 'Count', class: 'text-center' }),
        el('th', { text: 'Total', class: 'text-center' })
      ])
    ]));
    const empBody = el('tbody');
    Object.entries(byEmployee).forEach(([name, data]) => {
      empBody.appendChild(el('tr', {}, [
        el('td', { text: name }),
        el('td', { text: String(data.count), class: 'text-center' }),
        el('td', { text: formatPHP(data.total), class: 'text-center' })
      ]));
    });
    empTable.appendChild(empBody);
    empCard.appendChild(empTable);
    grid.appendChild(empCard);

    // By Category
    const byCategory = {};
    items.forEach(d => {
      if (!byCategory[d.category]) byCategory[d.category] = { count: 0, total: 0 };
      byCategory[d.category].count++;
      byCategory[d.category].total += d.amount;
    });

    const catCard = el('div', { class: 'bento-item bento-half report-card' });
    catCard.appendChild(el('h3', { text: 'By Category', style: 'margin-top:0;' }));
    const catTable = el('table', { class: 'report-table' });
    catTable.appendChild(el('thead', {}, [
      el('tr', {}, [
        el('th', { text: 'Category' }),
        el('th', { text: 'Count', class: 'text-center' }),
        el('th', { text: 'Total', class: 'text-center' })
      ])
    ]));
    const catBody = el('tbody');
    Object.entries(byCategory).forEach(([cat, data]) => {
      catBody.appendChild(el('tr', {}, [
        el('td', { text: cat }),
        el('td', { text: String(data.count), class: 'text-center' }),
        el('td', { text: formatPHP(data.total), class: 'text-center' })
      ]));
    });
    catTable.appendChild(catBody);
    catCard.appendChild(catTable);
    grid.appendChild(catCard);

    // Fund split
    const firmItems = items.filter(d => this.getFundSource(d) === 'Firm Fund');
    const clientItems = items.filter(d => this.getFundSource(d) === 'Client Fund');
    const firmTotal = firmItems.reduce((s, d) => s + d.amount, 0);
    const clientTotal = clientItems.reduce((s, d) => s + d.amount, 0);

    const fundCard = el('div', { class: 'bento-item bento-full report-card' });
    fundCard.appendChild(el('h3', { text: 'By Fund Source', style: 'margin-top:0;' }));
    const fundSplitWrap = el('div', { class: 'fund-split', style: 'margin-bottom: var(--spacing-md);' });
    fundSplitWrap.appendChild(el('div', { class: 'fund-box' }, [
      el('div', { class: 'fund-label', text: 'Firm Fund' }),
      el('div', { class: 'fund-value', text: formatPHP(firmTotal) }),
      el('div', { style: 'font-size: 0.8rem; color: var(--color-text-muted);', text: firmItems.length + ' items' })
    ]));
    fundSplitWrap.appendChild(el('div', { class: 'fund-box' }, [
      el('div', { class: 'fund-label', text: 'Client Fund' }),
      el('div', { class: 'fund-value', text: formatPHP(clientTotal) }),
      el('div', { style: 'font-size: 0.8rem; color: var(--color-text-muted);', text: clientItems.length + ' items' })
    ]));
    fundCard.appendChild(fundSplitWrap);
    grid.appendChild(fundCard);

    container.appendChild(grid);
    return container;
  }
};
