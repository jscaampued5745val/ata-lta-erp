/**
 * Transmittal Module
 * Create, send, and acknowledge transmittal letters with itemized document lists.
 */

const Transmittal = {
  view: 'list',
  detailId: null,
  listViewMode: 'table',

  render() {
    this.listViewMode = App.getPreferredViewMode('transmittals');
    const container = el('div', { class: 'page' });
    
    if (this.view === 'detail' && this.detailId) {
      const t = DB.getById('transmittals', this.detailId);
      const titleBar = el('div', { class: 'page-title-bar-v2' });
      const h1 = el('h1', { class: 'breadcrumb-h1' });
      const baseLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Transmittal' });
      baseLink.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
      h1.appendChild(baseLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      h1.appendChild(document.createTextNode(t?.trackingNumber || 'Detail'));
      titleBar.appendChild(h1);
      
      const backBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '← Back to List' });
      backBtn.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
      titleBar.appendChild(backBtn);
      container.appendChild(titleBar);
    } else {
      container.appendChild(el('h1', { text: 'Transmittal' }));
    }

    if (this.view === 'list') container.appendChild(this.renderList());
    else if (this.view === 'form') container.appendChild(this.renderForm());
    else if (this.view === 'detail') container.appendChild(this.renderDetail());

    return container;
  },

  init() {},

  // ============================================================
  // Helpers
  // ============================================================
  statusBadge(status) {
    const map = {
      'Draft': 'badge badge-ghost',
      'Sent': 'badge badge-info',
      'Acknowledged': 'badge badge-success'
    };
    return el('span', { class: map[status] || 'badge', text: status });
  },

  generateTrackingNumber(entity) {
    const year = new Date().getFullYear();
    const prefix = entity + '-TX-' + year + '-';
    const existing = DB.getWhere('transmittals', t => t.entity === entity && t.trackingNumber && t.trackingNumber.startsWith(prefix));
    let maxSeq = 0;
    existing.forEach(t => {
      const parts = t.trackingNumber.split('-');
      const seq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    });
    return prefix + String(maxSeq + 1).padStart(3, '0');
  },

  getClientName(clientId) {
    const client = DB.getById('clients', clientId);
    return client?.name || '—';
  },

  getWorkRequestTitle(wrId) {
    const wr = DB.getById('workRequests', wrId);
    return wr?.title || '—';
  },

  // ============================================================
  // List View
  // ============================================================
  renderList() {
    const entity = Auth.activeEntity;

    const actions = el('div', { class: 'actions-bar' });
    const addBtn = el('button', { class: 'btn btn-primary', text: 'Create Transmittal' });
    addBtn.addEventListener('click', () => { this.view = 'form'; this.detailId = null; App.handleRoute(); });
    actions.appendChild(addBtn);

    const wrapper = el('div');
    wrapper.appendChild(actions);

    // Filters bar
    const filtersBar = el('div', { class: 'filters-bar' });

    const wrFilter = el('select', { class: 'form-select', style: 'max-width:200px' });
    wrFilter.appendChild(el('option', { value: '', text: 'All Work Requests' }));
    DB.getWhere('workRequests', wr => {
      const wrEnt = (wr.entity || '').toUpperCase();
      if (entity === 'ALL') {
        return Auth.user.entities.map(ae => ae.toUpperCase()).includes(wrEnt);
      }
      return wrEnt === entity.toUpperCase();
    }).forEach(wr => {
      wrFilter.appendChild(el('option', { value: wr.id, text: wr.title }));
    });
    filtersBar.appendChild(wrFilter);

    const clientFilter = el('select', { class: 'form-select', style: 'max-width:200px' });
    clientFilter.appendChild(el('option', { value: '', text: 'All Clients' }));
    DB.getWhere('clients', c => {
      const clientEnt = (c.entity || '').toUpperCase();
      if (entity === 'ALL') {
        return Auth.user.entities.map(ae => ae.toUpperCase()).includes(clientEnt);
      }
      return clientEnt === entity.toUpperCase();
    }).forEach(c => {
      clientFilter.appendChild(el('option', { value: c.id, text: c.name }));
    });
    filtersBar.appendChild(clientFilter);

    const empFilter = el('select', { class: 'form-select', style: 'max-width:200px' });
    empFilter.appendChild(el('option', { value: '', text: 'All Employees' }));
    DB.getWhere('users', u => {
      const userEnts = (u.entities || []).map(e => e.toUpperCase());
      if (entity === 'ALL') {
        return userEnts.some(e => Auth.user.entities.map(ae => ae.toUpperCase()).includes(e));
      }
      return userEnts.includes(entity.toUpperCase());
    }).forEach(u => {
      empFilter.appendChild(el('option', { value: u.id, text: u.name }));
    });
    filtersBar.appendChild(empFilter);

    const statusFilter = el('select', { class: 'form-select', style: 'max-width:150px' });
    statusFilter.appendChild(el('option', { value: '', text: 'All Statuses' }));
    ['Draft', 'Sent', 'Acknowledged'].forEach(s => statusFilter.appendChild(el('option', { value: s, text: s })));
    filtersBar.appendChild(statusFilter);

    const dateFrom = el('input', { type: 'date', class: 'form-select', style: 'max-width:140px' });
    const dateTo = el('input', { type: 'date', class: 'form-select', style: 'max-width:140px' });
    filtersBar.appendChild(el('span', { text: 'From:', style: 'font-size:0.75rem;color:var(--color-text-muted);' }));
    filtersBar.appendChild(dateFrom);
    filtersBar.appendChild(el('span', { text: 'To:', style: 'font-size:0.75rem;color:var(--color-text-muted);' }));
    filtersBar.appendChild(dateTo);

    const clearBtn = el('button', {
      class: 'btn btn-secondary btn-sm',
      html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>Clear'
    });
    clearBtn.addEventListener('click', () => {
      wrFilter.value = '';
      clientFilter.value = '';
      empFilter.value = '';
      statusFilter.value = '';
      dateFrom.value = '';
      dateTo.value = '';
      updateFilters();
    });
    filtersBar.appendChild(clearBtn);

    wrapper.appendChild(filtersBar);

    // View mode toggle
    const viewToggle = el('div', { class: 'view-mode-toggle', style: 'margin-bottom:var(--spacing-md);' });
    const viewIcons = { 'Table': ViewIcons.table, 'Board': ViewIcons.board, 'List': ViewIcons.list };
    [['Table', 'table'], ['Board', 'board'], ['List', 'list']].forEach(([label, mode]) => {
      const btn = el('button', { html: (viewIcons[label] || '') + ' ' + label, class: this.listViewMode === mode ? 'active' : '' });
      btn.addEventListener('click', () => {
        App.setPreferredViewMode('transmittals', mode);
        App.handleRoute();
      });
      viewToggle.appendChild(btn);
    });
    wrapper.appendChild(viewToggle);

    const listContainer = el('div');
    wrapper.appendChild(listContainer);

    const updateFilters = () => this.refreshList(listContainer, wrFilter.value, clientFilter.value, empFilter.value, statusFilter.value, dateFrom.value, dateTo.value);
    [wrFilter, clientFilter, empFilter, statusFilter, dateFrom, dateTo].forEach(f => f.addEventListener('change', updateFilters));

    this.refreshList(listContainer, wrFilter.value, clientFilter.value, empFilter.value, statusFilter.value, dateFrom.value, dateTo.value);
    return wrapper;
  },

  refreshList(container, wrFilter, clientFilter, empFilter, statusFilter, dateFrom, dateTo) {
    while (container.firstChild) container.removeChild(container.firstChild);
    const entity = Auth.activeEntity;

    let items = DB.getWhere('transmittals', t => (entity === 'ALL' ? Auth.user.entities.includes(t.entity) : t.entity === entity));

    if (wrFilter) items = items.filter(t => t.workRequestId === wrFilter);
    if (clientFilter) items = items.filter(t => t.clientId === clientFilter);
    if (empFilter) items = items.filter(t => t.createdBy === empFilter || t.sentBy === empFilter || t.acknowledgedBy === empFilter);
    if (statusFilter) items = items.filter(t => t.status === statusFilter);
    if (dateFrom) {
      const fromTime = new Date(dateFrom).getTime();
      items = items.filter(t => {
        const d = t.sentAt || t.createdAt || '';
        return d && new Date(d).getTime() >= fromTime;
      });
    }
    if (dateTo) {
      const toTime = new Date(dateTo);
      toTime.setHours(23, 59, 59, 999);
      items = items.filter(t => {
        const d = t.sentAt || t.createdAt || '';
        return d && new Date(d).getTime() <= toTime.getTime();
      });
    }

    items.sort((a, b) => {
      const da = a.sentAt || a.createdAt || '';
      const db = b.sentAt || b.createdAt || '';
      return new Date(db) - new Date(da);
    });

    if (items.length === 0) {
      container.appendChild(el('p', { text: 'No transmittals found.', class: 'empty-state' }));
      return;
    }

    if (this.listViewMode === 'table') {
      this.renderTableView(container, items);
    } else if (this.listViewMode === 'board') {
      this.renderBoardView(container, items);
    } else {
      this.renderCompactListView(container, items);
    }
  },

  renderTableView(container, items) {
    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Tracking #', 'Work Request', 'Client', 'Status', 'Items', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = el('tbody');
    items.forEach(t => {
      const tr = el('tr');
      tr.appendChild(el('td', { text: t.trackingNumber }));
      tr.appendChild(el('td', { text: this.getWorkRequestTitle(t.workRequestId) }));
      tr.appendChild(el('td', { text: this.getClientName(t.clientId) }));
      const tdStatus = el('td');
      tdStatus.appendChild(this.statusBadge(t.status));
      tr.appendChild(tdStatus);
      tr.appendChild(el('td', { text: String((t.items || []).length) }));
      const tdAct = el('td');
      const viewBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { this.view = 'detail'; this.detailId = t.id; App.handleRoute(); });
      tdAct.appendChild(viewBtn);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  },

  renderBoardView(container, items) {
    if (items.length === 0) {
      container.appendChild(el('p', { text: 'No transmittals found.', class: 'empty-state' }));
      return;
    }
    const board = el('div', { class: 'board-v2' });
    const statuses = ['Draft', 'Sent', 'Acknowledged'];
    const statusColors = {
      'Draft': '#94a3b8',
      'Sent': '#3b82f6',
      'Acknowledged': '#10b981'
    };

    statuses.forEach(st => {
      const colColor = statusColors[st] || '#cbd5e1';
      const col = el('div', { class: 'board-column-v2' });
      col.style.borderTop = `4px solid ${colColor}`;
      
      const header = el('div', { class: 'board-column-header-v2' });
      header.appendChild(el('div', { class: 'board-column-title', text: st }));
      col.appendChild(header);

      const colItems = items.filter(t => t.status === st);
      const cardContainer = el('div', { class: 'board-cards-scroll' });

      colItems.forEach(t => {
        const clientName = this.getClientName(t.clientId);
        const itemCount = (t.items || []).length;

        const card = el('div', { class: 'board-card-v2' });
        card.style.borderLeftColor = colColor;
        card.addEventListener('click', () => { this.view = 'detail'; this.detailId = t.id; App.handleRoute(); });

        // Top: Status path and Date
        const topRow = el('div', { class: 'card-v2-top' });
        topRow.appendChild(el('span', { class: 'card-v2-category', text: `${t.status} >` }));
        const date = t.sentAt || t.createdAt;
        topRow.appendChild(el('span', { class: 'card-v2-date', text: formatDate(date) }));
        card.appendChild(topRow);

        // Title Row
        const titleRow = el('div', { class: 'card-v2-title-row' });
        titleRow.appendChild(el('div', { class: 'card-v2-title', text: t.trackingNumber }));
        card.appendChild(titleRow);

        // Subtitle: Client and Item Count
        card.appendChild(el('div', { text: `${clientName} • ${itemCount} items`, style: 'font-size:0.875rem;color:#64748b;margin-bottom:12px;' }));

        // Meta: Details
        const metaRow = el('div', { class: 'card-v2-meta' });
        const wr = DB.getById('workRequests', t.workRequestId);
        if (wr) {
          metaRow.appendChild(el('div', { class: 'card-v2-meta-text', text: wr.title, style: 'font-weight:600;color:#1e293b;font-size:0.75rem;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;' }));
        }
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
    items.forEach(t => {
      const item = el('div', { class: 'list-item' });
      const left = el('div');
      left.appendChild(el('div', { class: 'list-item-title', text: t.trackingNumber }));
      left.appendChild(el('div', { class: 'list-item-meta', text: this.getClientName(t.clientId) + ' • ' + this.getWorkRequestTitle(t.workRequestId) + ' • ' + String((t.items || []).length) + ' items' }));
      item.appendChild(left);
      const viewBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { this.view = 'detail'; this.detailId = t.id; App.handleRoute(); });
      item.appendChild(viewBtn);
      list.appendChild(item);
    });
    container.appendChild(list);
  },

  // ============================================================
  // Create Form
  // ============================================================
  renderForm() {
    const entity = Auth.activeEntity;
    const isNew = !this.detailId;
    const existing = this.detailId ? DB.getById('transmittals', this.detailId) : null;

    const container = el('div');

    // Form header bar
    const headerBar = el('div', { class: 'form-header-bar' });
    headerBar.appendChild(el('h2', { text: isNew ? 'Create Transmittal' : 'Edit Transmittal' }));
    const headerActions = el('div', { class: 'form-actions-top' });
    const saveTopBtn = el('button', { type: 'button', class: 'btn btn-primary', text: isNew ? 'Create Transmittal' : 'Save Changes' });
    saveTopBtn.addEventListener('click', () => { this.submitForm(form); });
    headerActions.appendChild(saveTopBtn);
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
    headerActions.appendChild(cancelBtn);
    headerBar.appendChild(headerActions);
    container.appendChild(headerBar);

    const form = el('form', { id: 'transmittal-form', class: 'form-stacked' });

    // Work Request
    const wrGroup = el('div', { class: 'form-group' });
    wrGroup.appendChild(el('label', { text: 'Work Request *' }));
    const wrSel = el('select', { name: 'workRequestId', required: true });
    wrSel.appendChild(el('option', { value: '', text: '— Select Work Request —' }));
    DB.getWhere('workRequests', wr => wr.entity === entity).forEach(wr => {
      const opt = el('option', { value: wr.id, text: wr.title });
      if (existing && existing.workRequestId === wr.id) opt.selected = true;
      wrSel.appendChild(opt);
    });
    wrGroup.appendChild(wrSel);
    form.appendChild(wrGroup);

    // Client display (auto-populated from WR)
    const clientGroup = el('div', { class: 'form-group' });
    clientGroup.appendChild(el('label', { text: 'Client' }));
    const clientDisplay = el('input', { type: 'text', name: 'clientDisplay', disabled: true, value: existing ? this.getClientName(existing.clientId) : '' });
    clientGroup.appendChild(clientDisplay);
    const clientIdInput = el('input', { type: 'hidden', name: 'clientId', value: existing ? existing.clientId : '' });
    clientGroup.appendChild(clientIdInput);
    form.appendChild(clientGroup);

    wrSel.addEventListener('change', () => {
      const wr = DB.getById('workRequests', wrSel.value);
      if (wr) {
        clientDisplay.value = this.getClientName(wr.clientId);
        clientIdInput.value = wr.clientId;
      } else {
        clientDisplay.value = '';
        clientIdInput.value = '';
      }
    });

    // Tracking Number
    const tnGroup = el('div', { class: 'form-group' });
    tnGroup.appendChild(el('label', { text: 'Tracking Number' }));
    const tnWrap = el('div', { style: 'display:flex; gap: var(--spacing-sm); align-items:center;' });
    const tnInput = el('input', { type: 'text', name: 'trackingNumber', readonly: true, value: existing ? existing.trackingNumber : '' });
    tnInput.style.flex = '1';
    tnWrap.appendChild(tnInput);
    const genBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Generate' });
    genBtn.addEventListener('click', () => {
      tnInput.value = this.generateTrackingNumber(entity);
    });
    tnWrap.appendChild(genBtn);
    tnGroup.appendChild(tnWrap);
    form.appendChild(tnGroup);

    // Itemized document list
    const itemsSection = el('div', { class: 'form-group' });
    itemsSection.appendChild(el('label', { text: 'Items *' }));
    const itemsTable = el('table', { class: 'data-table', style: 'margin-bottom: var(--spacing-sm);' });
    const itemsThead = el('thead');
    const itemsThr = el('tr');
    ['Document Type', 'Description', ''].forEach(h => itemsThr.appendChild(el('th', { text: h })));
    itemsThead.appendChild(itemsThr);
    itemsTable.appendChild(itemsThead);
    const itemsTbody = el('tbody');
    itemsTbody.id = 'transmittal-items-tbody';
    itemsTable.appendChild(itemsTbody);
    itemsSection.appendChild(itemsTable);

    const addRowBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '+ Add Item' });
    addRowBtn.addEventListener('click', () => this.addItemRow(itemsTbody));
    itemsSection.appendChild(addRowBtn);
    form.appendChild(itemsSection);

    // Pre-populate rows for existing
    if (existing && existing.items && existing.items.length > 0) {
      existing.items.forEach(item => this.addItemRow(itemsTbody, item.description, item.documentType));
    } else {
      this.addItemRow(itemsTbody);
    }

    // Notes
    const notesGroup = el('div', { class: 'form-group' });
    notesGroup.appendChild(el('label', { text: 'Notes' }));
    const notesTextarea = el('textarea', { name: 'notes', rows: 3 });
    notesTextarea.textContent = existing ? (existing.notes || '') : '';
    notesGroup.appendChild(notesTextarea);
    form.appendChild(notesGroup);

    form.addEventListener('submit', (e) => { e.preventDefault(); this.submitForm(form); });

    container.appendChild(form);
    return container;
  },

  addItemRow(tbody, description = '', documentType = '') {
    const tr = el('tr');

    const typeTd = el('td');
    const typeSel = el('select', { class: 'item-doc-type', required: true });
    typeSel.appendChild(el('option', { value: '', text: '— Select Type —' }));
    ['Original Scan', 'Generated Copy', 'Government Receipt', 'Final Deliverable', 'Other'].forEach(t => {
      const opt = el('option', { value: t, text: t });
      if (documentType === t) opt.selected = true;
      typeSel.appendChild(opt);
    });
    typeTd.appendChild(typeSel);
    tr.appendChild(typeTd);

    const descTd = el('td');
    const descInput = el('input', { type: 'text', class: 'item-description', required: true, value: description, placeholder: 'Description' });
    descTd.appendChild(descInput);
    tr.appendChild(descTd);

    const actTd = el('td');
    const remBtn = el('button', { type: 'button', class: 'btn btn-danger btn-sm', text: 'Remove' });
    remBtn.addEventListener('click', () => {
      if (tbody.querySelectorAll('tr').length > 1) {
        tbody.removeChild(tr);
      }
    });
    actTd.appendChild(remBtn);
    tr.appendChild(actTd);

    tbody.appendChild(tr);
  },

  submitForm(form) {
    if (!validateRequiredFields(form)) return;

    const entity = Auth.activeEntity;
    const data = Object.fromEntries(new FormData(form).entries());
    const isNew = !this.detailId;
    const tbody = document.getElementById('transmittal-items-tbody');

    const items = [];
    tbody.querySelectorAll('tr').forEach(row => {
      const desc = row.querySelector('.item-description')?.value.trim();
      const type = row.querySelector('.item-doc-type')?.value;
      if (desc && type) {
        items.push({ description: desc, documentType: type });
      }
    });

    if (items.length === 0) {
      Workflow.showMessage('Item Error', 'Please add at least one item.', 'danger');
      return;
    }

    const record = {
      workRequestId: data.workRequestId,
      clientId: data.clientId,
      trackingNumber: data.trackingNumber || this.generateTrackingNumber(entity),
      status: 'Draft',
      items,
      notes: data.notes || '',
      entity,
      sentAt: '',
      acknowledgedAt: '',
      sentBy: '',
      acknowledgedBy: ''
    };

    if (!isNew) {
      record.id = this.detailId;
      const old = DB.getById('transmittals', this.detailId);
      if (old) {
        record.status = old.status;
        record.sentAt = old.sentAt;
        record.acknowledgedAt = old.acknowledgedAt;
        record.sentBy = old.sentBy;
        record.acknowledgedBy = old.acknowledgedBy;
        record.createdAt = old.createdAt;
        record.createdBy = old.createdBy;
      }
    } else {
      record.id = generateId('tx');
      record.createdAt = new Date().toISOString();
      record.createdBy = Auth.user.id;
    }

    const result = PendingChanges.submit('transmittals', record, isNew);

    if (result.approved) {
      // Clean up old WR link if WR changed
      const old = isNew ? null : DB.getById('transmittals', this.detailId);
      if (old && old.workRequestId && old.workRequestId !== (record.workRequestId || null)) {
        const oldWr = DB.getById('workRequests', old.workRequestId);
        if (oldWr) {
          const linkedIds = (oldWr.linkedTransmittalIds || []).filter(id => id !== record.id);
          DB.update('workRequests', oldWr.id, { linkedTransmittalIds: linkedIds });
        }
      }

      // Link to Work Request
      if (record.workRequestId) {
        const wr = DB.getById('workRequests', record.workRequestId);
        if (wr) {
          const linkedIds = new Set(wr.linkedTransmittalIds || []);
          linkedIds.add(record.id);
          DB.update('workRequests', wr.id, { linkedTransmittalIds: Array.from(linkedIds) });
        }
      }
    }

    this.view = 'list';
    this.detailId = null;
    App.handleRoute();
  },

  // ============================================================
  // Detail View
  // ============================================================
  renderDetail() {
    const t = DB.getById('transmittals', this.detailId);
    if (!t) { this.view = 'list'; App.handleRoute(); return el('div'); }

    const container = el('div', { class: 'invoice-detail' });

    // Top actions bar
    const topActions = el('div', { class: 'actions-bar', style: 'margin-bottom: var(--spacing-lg);' });
    const topBackBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '← Back to List' });
    topBackBtn.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
    topActions.appendChild(topBackBtn);

    const printBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Print Transmittal' });
    printBtn.addEventListener('click', () => this.openPrintLetter(t));
    topActions.appendChild(printBtn);

    container.appendChild(topActions);

    // Header
    const header = el('div', { class: 'invoice-header' });
    header.appendChild(el('h2', { text: 'Transmittal ' + t.trackingNumber }));
    header.appendChild(this.statusBadge(t.status));
    container.appendChild(header);

    // Meta
    const meta = el('div', { class: 'invoice-meta' });
    meta.appendChild(el('p', { text: 'Work Request: ' + this.getWorkRequestTitle(t.workRequestId) }));
    meta.appendChild(el('p', { text: 'Client: ' + this.getClientName(t.clientId) }));
    if (t.sentAt) {
      const sender = DB.getById('users', t.sentBy);
      meta.appendChild(el('p', { text: 'Sent: ' + formatDate(t.sentAt) + ' by ' + (sender?.name || '—') }));
    }
    if (t.acknowledgedAt) {
      const ackBy = DB.getById('users', t.acknowledgedBy);
      meta.appendChild(el('p', { text: 'Acknowledged: ' + formatDate(t.acknowledgedAt) + ' by ' + (ackBy?.name || '—') }));
    }
    if (t.notes) meta.appendChild(el('p', { text: 'Notes: ' + t.notes }));
    container.appendChild(meta);

    // Transmittal Letter Preview
    const letterSection = el('div', { class: 'form-section', style: 'margin-bottom: var(--spacing-lg);' });
    letterSection.appendChild(el('h3', { text: 'Transmittal' }));
    letterSection.appendChild(this.buildLetterPreview(t));
    container.appendChild(letterSection);

    // Actions
    const actions = el('div', { class: 'form-actions', style: 'margin-top: var(--spacing-lg); border-top: 1px solid var(--color-border); padding-top: var(--spacing-lg);' });

    if (t.status === 'Draft') {
      const sendBtn = el('button', { class: 'btn btn-primary', text: 'Mark as Sent' });
      sendBtn.addEventListener('click', () => {
        Workflow.showConfirm('Confirm Sent', 'Are you sure you want to mark this transmittal as sent?', () => {
          DB.update('transmittals', t.id, {
            status: 'Sent',
            sentAt: new Date().toISOString(),
            sentBy: Auth.user.id
          });
          App.handleRoute();
        }, 'success');
      });
      actions.appendChild(sendBtn);
    } else if (t.status === 'Sent') {
      const ackSection = el('div', { class: 'form-section' });
      ackSection.appendChild(el('h4', { text: 'Acknowledgment' }));
      const ackForm = el('form', { class: 'form-stacked' });

      const nameGroup = el('div', { class: 'form-group' });
      nameGroup.appendChild(el('label', { text: 'Received By (Name) *' }));
      nameGroup.appendChild(el('input', { type: 'text', name: 'receivedBy', required: true }));
      ackForm.appendChild(nameGroup);

      const dateGroup = el('div', { class: 'form-group' });
      dateGroup.appendChild(el('label', { text: 'Received Date *' }));
      dateGroup.appendChild(el('input', { type: 'date', name: 'receivedDate', required: true, value: new Date().toISOString().slice(0, 10) }));
      ackForm.appendChild(dateGroup);

      const ackBtn = el('button', { type: 'submit', class: 'btn btn-success', text: 'Mark as Acknowledged' });
      ackForm.appendChild(ackBtn);

      ackForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!validateRequiredFields(ackForm)) return;
        const fd = new FormData(ackForm);
        DB.update('transmittals', t.id, {
          status: 'Acknowledged',
          acknowledgedAt: fd.get('receivedDate'),
          acknowledgedBy: Auth.user.id,
          receivedByName: fd.get('receivedBy')
        });
        App.handleRoute();
      });

      ackSection.appendChild(ackForm);
      actions.appendChild(ackSection);
    }

    container.appendChild(actions);
    return container;
  },

  buildLetterPreview(t) {
    const client = DB.getById('clients', t.clientId);
    const wr = DB.getById('workRequests', t.workRequestId);
    const entityName = t.entity === 'ATA' ? 'ATA Accounting' : 'LTA Accounting';

    const letter = el('div', { class: 'transmittal-letter' });

    const header = el('div', { style: 'text-align:center; margin-bottom: var(--spacing-lg); border-bottom: 2px solid var(--color-border); padding-bottom: var(--spacing-md);' });
    header.appendChild(el('h2', { text: entityName, style: 'margin:0; font-size:1.25rem;' }));
    header.appendChild(el('p', { text: 'Transmittal', style: 'margin:0; font-size:0.875rem; color:var(--color-text-muted);' }));
    letter.appendChild(header);

    const metaBlock = el('div', { style: 'margin-bottom: var(--spacing-lg);' });
    metaBlock.appendChild(el('p', { text: 'Date: ' + (t.sentAt ? formatDate(t.sentAt) : formatDate(new Date().toISOString())) }));
    metaBlock.appendChild(el('p', { text: 'To: ' + (client?.name || '—') }));
    metaBlock.appendChild(el('p', { text: 'Re: Work Request — ' + (wr?.title || '—') }));
    metaBlock.appendChild(el('p', { text: 'Tracking Number: ' + t.trackingNumber, class: 'tracking-number' }));
    letter.appendChild(metaBlock);

    const intro = el('p', { text: 'Please find below the itemized list of documents being transmitted:' });
    letter.appendChild(intro);

    const itemTable = el('table', { style: 'width:100%; border-collapse:collapse; margin: var(--spacing-md) 0;' });
    const itemThead = el('thead');
    const itemThr = el('tr');
    ['Document Type', 'Description'].forEach(h => {
      const th = el('th', { text: h });
      th.style.borderBottom = '2px solid #333';
      th.style.textAlign = 'left';
      th.style.padding = '8px';
      itemThr.appendChild(th);
    });
    itemThead.appendChild(itemThr);
    itemTable.appendChild(itemThead);

    const itemTbody = el('tbody');
    (t.items || []).forEach((item, idx) => {
      const tr = el('tr');
      [item.documentType, item.description].forEach(val => {
        const td = el('td', { text: val });
        td.style.borderBottom = '1px solid #ddd';
        td.style.padding = '8px';
        tr.appendChild(td);
      });
      itemTbody.appendChild(tr);
    });
    itemTable.appendChild(itemTbody);
    letter.appendChild(itemTable);

    const notesBlock = el('div', { style: 'margin: var(--spacing-md) 0; font-style:italic; color:var(--color-text-muted);' });
    if (t.notes) {
      notesBlock.appendChild(el('p', { text: 'Notes: ' + t.notes }));
    }
    letter.appendChild(notesBlock);

    const sigBlock = el('div', { style: 'margin-top: var(--spacing-xl);' });
    sigBlock.appendChild(el('p', { text: 'Prepared by:' }));
    sigBlock.appendChild(el('div', { style: 'height: 48px;' }));
    sigBlock.appendChild(el('p', { text: '_______________________________', style: 'margin:0;' }));
    sigBlock.appendChild(el('p', { text: 'Authorized Representative', style: 'margin:0; font-size:0.8125rem; color:var(--color-text-muted);' }));
    letter.appendChild(sigBlock);

    const ackBlock = el('div', { style: 'margin-top: var(--spacing-xl); border-top: 1px dashed var(--color-border); padding-top: var(--spacing-lg);' });
    ackBlock.appendChild(el('p', { text: 'Received by:' }));
    ackBlock.appendChild(el('div', { style: 'height: 48px;' }));
    ackBlock.appendChild(el('p', { text: '_______________________________', style: 'margin:0;' }));
    ackBlock.appendChild(el('p', { text: 'Name / Signature / Date', style: 'margin:0; font-size:0.8125rem; color:var(--color-text-muted);' }));
    letter.appendChild(ackBlock);

    return letter;
  },

  openPrintLetter(t) {
    const win = window.open('', '_blank');
    if (!win) return;

    const doc = win.document;
    const meta = doc.createElement('meta');
    meta.setAttribute('charset', 'UTF-8');
    doc.head.appendChild(meta);
    const title = doc.createElement('title');
    title.textContent = 'Transmittal — ' + t.trackingNumber;
    doc.head.appendChild(title);

    const style = doc.createElement('style');
    style.textContent = 'body { font-family: Georgia, serif; margin: 40px; color: #333; line-height: 1.6; } h2 { margin: 0 0 4px 0; font-size: 1.25rem; } .sub { font-size: 0.875rem; color: #666; margin: 0 0 24px 0; } table { width: 100%; border-collapse: collapse; margin: 16px 0; } th, td { text-align: left; padding: 8px; border-bottom: 1px solid #ddd; } th { border-bottom: 2px solid #333; } .tracking-number { font-family: monospace; font-size: 0.875rem; color: #666; letter-spacing: 0.05em; } .sig-space { height: 48px; } .dashed-top { border-top: 1px dashed #ccc; padding-top: 24px; margin-top: 32px; }';
    doc.head.appendChild(style);

    const client = DB.getById('clients', t.clientId);
    const wr = DB.getById('workRequests', t.workRequestId);
    const entityName = t.entity === 'ATA' ? 'ATA Accounting' : 'LTA Accounting';

    const body = doc.body;

    const h2 = doc.createElement('h2');
    h2.textContent = entityName;
    body.appendChild(h2);
    const sub = doc.createElement('p');
    sub.className = 'sub';
    sub.textContent = 'Transmittal';
    body.appendChild(sub);

    const metaP = doc.createElement('div');
    const pDate = doc.createElement('p');
    pDate.textContent = 'Date: ' + (t.sentAt ? formatDate(t.sentAt) : formatDate(new Date().toISOString()));
    metaP.appendChild(pDate);
    const pTo = doc.createElement('p');
    pTo.textContent = 'To: ' + (client?.name || '—');
    metaP.appendChild(pTo);
    const pRe = doc.createElement('p');
    pRe.textContent = 'Re: Work Request — ' + (wr?.title || '—');
    metaP.appendChild(pRe);
    const pTrack = doc.createElement('p');
    pTrack.className = 'tracking-number';
    pTrack.textContent = 'Tracking Number: ' + t.trackingNumber;
    metaP.appendChild(pTrack);
    body.appendChild(metaP);

    const intro = doc.createElement('p');
    intro.textContent = 'Please find below the itemized list of documents being transmitted:';
    body.appendChild(intro);

    const table = doc.createElement('table');
    const thead = doc.createElement('thead');
    const thr = doc.createElement('tr');
    ['Document Type', 'Description'].forEach(h => {
      const th = doc.createElement('th');
      th.textContent = h;
      thr.appendChild(th);
    });
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = doc.createElement('tbody');
    (t.items || []).forEach((item, idx) => {
      const tr = doc.createElement('tr');
      [item.documentType, item.description].forEach(val => {
        const td = doc.createElement('td');
        td.textContent = val;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    body.appendChild(table);

    if (t.notes) {
      const notes = doc.createElement('p');
      notes.style.fontStyle = 'italic';
      notes.style.color = '#666';
      notes.textContent = 'Notes: ' + t.notes;
      body.appendChild(notes);
    }

    const sig = doc.createElement('div');
    const sigP1 = doc.createElement('p');
    sigP1.textContent = 'Prepared by:';
    sig.appendChild(sigP1);
    const sigSpace = doc.createElement('div');
    sigSpace.className = 'sig-space';
    sig.appendChild(sigSpace);
    const sigLine = doc.createElement('p');
    sigLine.textContent = '_______________________________';
    sig.appendChild(sigLine);
    const sigLabel = doc.createElement('p');
    sigLabel.style.fontSize = '0.8125rem';
    sigLabel.style.color = '#666';
    sigLabel.style.margin = '0';
    sigLabel.textContent = 'Authorized Representative';
    sig.appendChild(sigLabel);
    body.appendChild(sig);

    const ack = doc.createElement('div');
    ack.className = 'dashed-top';
    const ackP1 = doc.createElement('p');
    ackP1.textContent = 'Received by:';
    ack.appendChild(ackP1);
    const ackSpace = doc.createElement('div');
    ackSpace.className = 'sig-space';
    ack.appendChild(ackSpace);
    const ackLine = doc.createElement('p');
    ackLine.textContent = '_______________________________';
    ack.appendChild(ackLine);
    const ackLabel = doc.createElement('p');
    ackLabel.style.fontSize = '0.8125rem';
    ackLabel.style.color = '#666';
    ackLabel.style.margin = '0';
    ackLabel.textContent = 'Name / Signature / Date';
    ack.appendChild(ackLabel);
    body.appendChild(ack);

    win.focus();
    setTimeout(() => win.print(), 300);
  }
};
