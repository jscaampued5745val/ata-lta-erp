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
      
      const actions = el('div', { class: 'title-bar-actions' });
      if (d) {
        const genBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'Generate Voucher', style: 'margin-right:8px;' });
        genBtn.addEventListener('click', () => this.openPrintVoucher(d));
        actions.appendChild(genBtn);
      }
      const backBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to List' });
      backBtn.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
      actions.appendChild(backBtn);
      titleBar.appendChild(actions);
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

  recurringBadge(item) {
    if (!item.fromTemplate) return el('span');
    return el('span', { class: 'badge badge-recurring', text: 'Recurring' });
  },

  statusBadge(status) {
    const map = {
      'Draft': 'badge-warning',
      'Submitted': 'badge-warning',
      'Under Review': 'badge-warning',
      'Pending': 'badge-warning',
      'Approved': 'badge-info',
      'Released': 'badge-success',
      'Rejected': 'badge-danger',
      'Cancelled': 'badge-danger'
    };
    const label = (status === 'Draft' || status === 'Submitted' || status === 'Under Review') ? 'Pending' : status;
    return el('span', { class: 'badge ' + (map[status] || ''), text: label });
  },

  methodIcon(method) {
    const icons = PaymentIcons;
    const def = icons['Other Digital'];
    const cfg = icons[method] || def;
    const wrap = el('span', {
      style: `display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:20px; font-size:0.75rem; font-weight:700; color:${cfg.color}; background:${cfg.bg}; letter-spacing:0.3px;`
    });
    const svgWrap = document.createElement('span');
    svgWrap.innerHTML = cfg.svg;
    wrap.appendChild(svgWrap.firstChild);
    wrap.appendChild(document.createTextNode(cfg.label));
    return wrap;
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

    // "Pending for Release" Section for Handlers
    const pendingForRelease = DB.getWhere('disbursements', d => d.entity === entity && d.status === 'Approved' && d.paymentHandledBy === Auth.user.id);
    if (pendingForRelease.length > 0) {
      const pfrSection = el('div', { class: 'form-section', style: 'background: #fff7ed; border: 1px solid #ffedd5; padding: var(--spacing-md); border-radius: 12px; margin-bottom: var(--spacing-lg);' });
      pfrSection.appendChild(el('h3', { text: '⚠️ Pending for Release', style: 'color: #c2410c; margin-top: 0;' }));
      pfrSection.appendChild(el('p', { text: 'The following disbursements have been approved by Admin and are waiting for your final authorization and fund release.', style: 'font-size: 0.875rem; color: #9a3412; margin-bottom: var(--spacing-md);' }));
      
      const pfrTable = el('table', { class: 'task-table-v2' });
      pfrTable.appendChild(el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Category' }),
          el('th', { text: 'Amount' }),
          el('th', { text: 'Requested By' }),
          el('th', { text: 'Actions', class: 'text-right' })
        ])
      ]));
      const pfrBody = el('tbody');
      pendingForRelease.forEach(d => {
        const tr = el('tr');
        tr.appendChild(el('td', { text: d.category, style: 'font-weight:600;' }));
        tr.appendChild(el('td', { text: formatPHP(d.amount) }));
        const req = DB.getById('users', d.requestedBy);
        tr.appendChild(el('td', { text: req?.name || '—' }));
        const tdAct = el('td', { class: 'text-right' });
        const authBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Authorize Release' });
        authBtn.addEventListener('click', () => { this.detailId = d.id; this.view = 'detail'; App.handleRoute(); });
        tdAct.appendChild(authBtn);
        tr.appendChild(tdAct);
        pfrBody.appendChild(tr);
      });
      pfrTable.appendChild(pfrBody);
      pfrSection.appendChild(pfrTable);
      wrapper.appendChild(pfrSection);
    }

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
    ['Pending', 'Approved', 'Released', 'Rejected'].forEach(s => {
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
      const tdCat = el('td');
      tdCat.appendChild(el('span', { text: d.category }));
      if (d.fromTemplate) {
        tdCat.appendChild(document.createTextNode(' '));
        tdCat.appendChild(this.recurringBadge(d));
      }
      tr.appendChild(tdCat);
      tr.appendChild(el('td', { text: formatPHP(d.amount) }));
      const source = this.getFundSource(d);
      const fundBadge = el('span', { class: 'badge ' + (source === 'Firm Fund' ? 'badge-info' : 'badge-warning'), text: source });
      const tdFund = el('td');
      tdFund.appendChild(fundBadge);
      tr.appendChild(tdFund);
      const displayStatus = (['Draft', 'Submitted', 'Under Review'].includes(d.status)) ? 'Pending' : d.status;
      tr.appendChild(el('td', { text: displayStatus }));
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
    const statuses = ['Pending', 'Approved', 'Released', 'Rejected'];
    const statusColors = {
      'Pending': '#f59e0b',
      'Approved': '#3b82f6',
      'Released': '#10b981',
      'Rejected': '#ef4444'
    };

    statuses.forEach(st => {
      const colColor = statusColors[st] || '#cbd5e1';
      const col = el('div', { class: 'board-column-v2' });
      col.style.borderTop = `4px solid ${colColor}`;
      
      const header = el('div', { class: 'board-column-header-v2' });
      header.appendChild(el('div', { class: 'board-column-title', text: st }));
      col.appendChild(header);

      let colItems = [];
      if (st === 'Pending') {
        colItems = items.filter(d => ['Draft', 'Submitted', 'Under Review', 'Pending'].includes(d.status));
      } else {
        colItems = items.filter(d => d.status === st);
      }
      
      const cardContainer = el('div', { class: 'board-cards-scroll' });

      colItems.forEach(d => {
        const emp = DB.getById('users', this.getEmployeeId(d));
        const card = el('div', { class: 'board-card-v2' });
        card.style.borderLeftColor = colColor;
        card.addEventListener('click', () => { this.view = 'detail'; this.detailId = d.id; App.handleRoute(); });

        // Top: Status path and Date
        const topRow = el('div', { class: 'card-v2-top' });
        const displayStatus = (['Draft', 'Submitted', 'Under Review'].includes(d.status)) ? 'Pending' : d.status;
        topRow.appendChild(el('span', { class: 'card-v2-category', text: `${displayStatus} >` }));
        if (d.fromTemplate) topRow.appendChild(this.recurringBadge(d));
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
      const titleRow = el('div', { class: 'list-item-title' });
      titleRow.appendChild(document.createTextNode(d.category + ' — ' + formatPHP(d.amount)));
      if (d.fromTemplate) {
        titleRow.appendChild(document.createTextNode(' '));
        titleRow.appendChild(this.recurringBadge(d));
      }
      left.appendChild(titleRow);
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

    // Task link (Dynamic based on WR)
    const taskGroup = el('div', { class: 'form-group' });
    taskGroup.appendChild(el('label', { text: 'Link to Specific Task' }));
    const taskSel = el('select', { name: 'linkedTaskId', class: 'form-select' });
    taskSel.appendChild(el('option', { value: '', text: '— Whole Project —' }));
    taskGroup.appendChild(taskSel);
    form.appendChild(taskGroup);

    const updateTasks = () => {
      while (taskSel.firstChild) taskSel.removeChild(taskSel.firstChild);
      taskSel.appendChild(el('option', { value: '', text: '— Whole Project —' }));
      const wrId = wrSel.value;
      if (wrId) {
        DB.getWhere('tasks', t => t.workRequestId === wrId).forEach(t => {
          const opt = el('option', { value: t.id, text: t.title });
          if (existing && existing.linkedTaskId === t.id) opt.selected = true;
          taskSel.appendChild(opt);
        });
      }
    };
    wrSel.addEventListener('change', updateTasks);
    updateTasks(); // Initial load

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
      linkedTaskId: data.linkedTaskId || null,
      entity: entity,
      employeeId: Auth.user.id,
      requestedBy: Auth.user.id,
      status: 'Pending',
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
    const wr = d.linkedWorkRequestId ? DB.getById('workRequests', d.linkedWorkRequestId) : null;
    const client = wr ? DB.getById('clients', wr.clientId) : null;

    const container = el('div', { class: 'invoice-detail' });

    // Breadcrumb handled by render()
    
    // Status and badges
    const statusWrap = el('div', { style: 'display:flex; gap:8px; align-items:center; margin-bottom: var(--spacing-lg);' });
    statusWrap.appendChild(this.statusBadge(d.status));
    if (d.fromTemplate) statusWrap.appendChild(this.recurringBadge(d));
    container.appendChild(statusWrap);

    // Meta Info
    const meta = el('div', { class: 'invoice-meta' });
    meta.appendChild(el('p', { text: 'Client: ' + (client?.name || '—') }));
    meta.appendChild(el('p', { text: 'Date Submitted: ' + formatDate(d.submittedAt) }));
    meta.appendChild(el('p', { text: 'Fund Source: ' + this.getFundSource(d) }));
    if (wr) meta.appendChild(el('p', { text: 'Work Request: ' + wr.title }));
    container.appendChild(meta);

    // Items table (Single row for disbursement)
    const table = el('table', { class: 'data-table' });
    table.appendChild(el('thead', {}, [
      el('tr', {}, [
        el('th', { text: 'Category' }),
        el('th', { text: 'Description' }),
        el('th', { text: 'Amount' })
      ])
    ]));
    const tbody = el('tbody');
    tbody.appendChild(el('tr', {}, [
      el('td', { text: d.category }),
      el('td', { text: d.description }),
      el('td', { text: formatPHP(d.amount) })
    ]));
    table.appendChild(tbody);
    container.appendChild(table);

    // Totals / Summary Box
    const totals = el('div', { class: 'invoice-totals' });
    totals.appendChild(el('div', { class: 'total-row total-grand' }, [
      el('span', { text: 'Total Amount:' }), 
      el('span', { text: formatPHP(d.amount) })
    ]));
    
    if (d.status === 'Released') {
      totals.appendChild(el('div', { class: 'total-row' }, [el('span', { text: 'Released:' }), el('span', { text: formatPHP(d.amount) })]));
      totals.appendChild(el('div', { class: 'total-row' }, [el('span', { text: 'Balance:' }), el('span', { text: formatPHP(0) })]));
    } else {
      totals.appendChild(el('div', { class: 'total-row' }, [el('span', { text: 'Status:' }), el('span', { text: 'Pending Release', style: 'color: #94a3b8;' })]));
    }
    container.appendChild(totals);

    // Payment details (shown if released)
    if (d.status === 'Released' && d.paymentDetails) {
      const payHist = el('div', { class: 'form-section' });
      payHist.appendChild(el('h3', { text: 'Payment Details' }));
      
      const pd = d.paymentDetails;
      const handler = d.paymentHandledBy ? DB.getById('users', d.paymentHandledBy) : null;
      
      const pCard = el('div', { class: 'card', style: 'margin-bottom:12px; padding:16px; border:1px solid #e2e8f0; border-radius:8px;' });

      // Header row
      const header = el('div', { style: 'display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;' });
      const amtBlock = el('div');
      amtBlock.appendChild(el('span', { text: formatPHP(d.amount), style: 'display:block; font-weight:700; font-size:1.25rem; color:#1e293b; line-height:1.2;' }));
      amtBlock.appendChild(el('span', { text: formatDate(pd.date || d.releasedAt), style: 'display:block; font-size:0.75rem; color:#94a3b8; margin-top:2px;' }));
      header.appendChild(amtBlock);
      header.appendChild(this.methodIcon(pd.method));
      pCard.appendChild(header);

      pCard.appendChild(el('div', { style: 'height:1px; background:#e2e8f0; margin:0 0 12px;' }));

      const rows = el('div', { style: 'display:flex; flex-direction:column; gap:6px;' });
      const addRow = (label, value) => {
        if (!value) return;
        const row = el('div', { style: 'display:flex; justify-content:space-between; align-items:baseline; font-size:0.8125rem;' });
        row.appendChild(el('span', { text: label, style: 'color:#94a3b8; font-weight:500;' }));
        row.appendChild(el('span', { text: value, style: 'color:#334155; font-weight:600; text-align:right;' }));
        rows.appendChild(row);
      };

      if (pd.reference) addRow('Reference', pd.reference);
      if (pd.bank) addRow('Bank', pd.bank);
      addRow('Requested By', emp ? emp.name : '—');
      addRow('Released By', handler ? handler.name : '—');

      pCard.appendChild(rows);
      payHist.appendChild(pCard);
      container.appendChild(payHist);
    }

    // Approval Actions
    const isAdmin = Auth.user.role === 'Admin';
    const isPending = ['Draft', 'Submitted', 'Under Review', 'Pending'].includes(d.status);

    if (isPending && isAdmin) {
      const isRequester = Auth.isSelfApprover(this.getEmployeeId(d));
      if (isRequester) {
        container.appendChild(el('p', { class: 'field-error', text: 'You cannot approve your own expense. Wait for another Admin.' }));
      } else {
        const actions = el('div', { class: 'form-actions', style: 'margin-top: var(--spacing-xl); border-top: 1px solid #e2e8f0; padding-top: var(--spacing-lg);' });
        
        const handlerGroup = el('div', { class: 'form-group', style: 'max-width:300px; margin-bottom: var(--spacing-md);' });
        handlerGroup.appendChild(el('label', { text: 'Assign Handler *' }));
        const handlerSel = el('select', { class: 'form-select', name: 'assignedHandler' });
        handlerSel.appendChild(el('option', { value: '', text: '— Select Handler —' }));
        DB.getWhere('users', u => ['Admin', 'Manager', 'Staff'].includes(u.role)).forEach(u => {
          handlerSel.appendChild(el('option', { value: u.id, text: u.name + ' (' + u.role + ')' }));
        });
        actions.appendChild(handlerGroup);

        const approveBtn = el('button', { class: 'btn btn-success', text: 'Approve & Assign Handler' });
        approveBtn.addEventListener('click', () => {
          const handlerId = handlerSel.value;
          if (!handlerId) {
            Workflow.showMessage('Required', 'Please assign a handler to process this request.', 'warning');
            return;
          }
          Workflow.showConfirm('Confirm Approval', `Approve this expense and assign to ${DB.getById('users', handlerId)?.name}?`, () => {
            DB.update('disbursements', d.id, { 
              status: 'Approved', 
              paymentHandledBy: handlerId,
              approvedBy: Auth.user.id,
              approvedAt: new Date().toISOString()
            });
            App.handleRoute();
          }, 'success');
        });
        actions.appendChild(approveBtn);

        const rejectBtn = el('button', { class: 'btn btn-danger', text: 'Reject', style: 'margin-left: 8px;' });
        rejectBtn.addEventListener('click', () => {
          Workflow.showConfirm('Reject Expense', 'Are you sure you want to reject this request?', () => {
            const reason = prompt('Enter rejection reason:');
            if (reason) { this.reject(d.id, reason); App.handleRoute(); }
          }, 'danger');
        });
        actions.appendChild(rejectBtn);
        container.appendChild(actions);
      }
    } else if (d.status === 'Approved') {
        const isHandler = d.paymentHandledBy === Auth.user.id;
        if (isHandler) {
          const actions = el('div', { class: 'form-actions', style: 'margin-top: var(--spacing-xl); border-top: 1px solid #e2e8f0; padding-top: var(--spacing-lg);' });
          const releaseBtn = el('button', { class: 'btn btn-primary', text: 'Authorize & Release Funds' });
          releaseBtn.addEventListener('click', () => { this.showReleaseDialog(d.id); });
          actions.appendChild(releaseBtn);
          container.appendChild(actions);
        } else {
          const handler = DB.getById('users', d.paymentHandledBy);
          container.appendChild(el('p', { class: 'empty-state', text: `Waiting for release authorization from ${handler?.name || 'assigned handler'}.` }));
        }
    }

    return container;
  },

  showReleaseDialog(id) {
    const d = DB.getById('disbursements', id);
    if (!d) return;

    const form = el('form', { class: 'form-stacked' });

    const methodGroup = el('div', { class: 'form-group' });
    methodGroup.appendChild(el('label', { text: 'Payment Method *' }));
    const methodSel = el('select', { name: 'method', required: true, class: 'form-select' });
    ['Cash', 'Check', 'Bank Transfer', 'GCash', 'Maya', 'Other Digital'].forEach(m => methodSel.appendChild(el('option', { value: m, text: m })));
    methodGroup.appendChild(methodSel);
    form.appendChild(methodGroup);

    const refGroup = el('div', { class: 'form-group' });
    refGroup.appendChild(el('label', { text: 'Reference / Check Number *' }));
    refGroup.appendChild(el('input', { type: 'text', name: 'reference', required: true }));
    form.appendChild(refGroup);

    const dateGroup = el('div', { class: 'form-group' });
    dateGroup.appendChild(el('label', { text: 'Date of Release *' }));
    dateGroup.appendChild(el('input', { type: 'date', name: 'date', required: true, value: new Date().toISOString().slice(0, 10) }));
    form.appendChild(dateGroup);

    // Document Requirement
    const docGroup = el('div', { class: 'form-group' });
    docGroup.appendChild(el('label', { text: 'Attached Scanned Document (Required) *' }));
    docGroup.appendChild(el('input', { type: 'file', name: 'releaseDoc', required: true }));
    form.appendChild(docGroup);

    const submitBtn = el('button', { type: 'submit', class: 'btn btn-success', text: 'Confirm & Release Funds' });
    form.appendChild(submitBtn);

    const overlay = Workflow.showModal('Authorize Fund Release', form);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validateRequiredFields(form)) return;
      const fd = new FormData(form);
      const file = form.querySelector('input[name="releaseDoc"]').files[0];
      
      this.release(id, {
        method: fd.get('method'),
        reference: fd.get('reference'),
        date: fd.get('date'),
        processedBy: Auth.user.id,
        filename: file?.name || 'Authorized_Release.pdf'
      });
      overlay.remove();
      App.handleRoute();
    });
  },

  release(id, pd) {
    DB.update('disbursements', id, {
      status: 'Released',
      releasedBy: Auth.user.id,
      releasedAt: new Date().toISOString(),
      paymentDetails: pd,
      releaseFilename: pd.filename
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
    wrapper.appendChild(table);

    return wrapper;
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
      fromTemplate: template.id,
      employeeId: Auth.user.id,
      requestedBy: Auth.user.id,
      status: 'Pending',
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
