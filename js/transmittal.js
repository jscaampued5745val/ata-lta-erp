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
      baseLink.addEventListener('click', () => { location.hash = '#transmittal'; });
      h1.appendChild(baseLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      h1.appendChild(document.createTextNode(t?.trackingNumber || 'Detail'));
      titleBar.appendChild(h1);
      
      const actions = el('div', { class: 'title-bar-actions' });
      if (t) {
        if (Auth.can('transmittal:mark')) {
          if (t.status === 'Draft') {
            const editBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Edit', style: 'margin-right:8px;' });
            editBtn.addEventListener('click', () => { this.showForm(t.id); });
            actions.appendChild(editBtn);
            const sendBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Mark as Sent', style: 'margin-right:8px;' });
            sendBtn.addEventListener('click', () => {
              Workflow.showConfirm('Confirm Sent', 'Are you sure you want to mark this transmittal as sent?', () => {
                const markData = {
                  status: 'Sent',
                  sentAt: new Date().toISOString(),
                  sentBy: Auth.user.id
                };
                if (Auth.user.role === 'Admin') {
                  // Admin marks are applied immediately
                  DB.update('transmittals', t.id, markData);
                } else {
                  // Manager/Documentation: pending Admin approval
                  const record = Object.assign({}, t, markData, { id: t.id });
                  PendingChanges.submit('transmittals', record, false);
                }
                App.handleRoute();
              }, 'success');
            });
            actions.appendChild(sendBtn);
          } else if (t.status === 'Sent') {
            const ackBtn = el('button', { class: 'btn btn-success btn-sm', text: 'Acknowledge Receipt', style: 'margin-right:8px;' });
            ackBtn.addEventListener('click', () => {
              this.showAcknowledgeDialog(t.id);
            });
            actions.appendChild(ackBtn);
          }
        }

        const printBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Print Transmittal', style: 'margin-right:8px;' });
        printBtn.addEventListener('click', () => this.openPrintLetter(t));
        actions.appendChild(printBtn);
      }
      const backBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '← Back to List' });
      backBtn.addEventListener('click', () => { location.hash = '#transmittal'; });
      actions.appendChild(backBtn);
      titleBar.appendChild(actions);
      container.appendChild(titleBar);
    } else if (this.view === 'list') {
      container.classList.add('transmittal-tab-page');
      const titleBar = el('div', { class: 'page-title-bar-v2' });
      titleBar.appendChild(el('h1', { text: 'Transmittal' }));
      container.appendChild(titleBar);
      container.appendChild(this.renderTabNav());
    }

    if (this.view === 'list') container.appendChild(this.renderList());
    else if (this.view === 'form') {
      if (!Auth.can('transmittal:create')) {
        this.view = 'list';
        container.appendChild(this.renderList());
      } else {
        container.appendChild(this.renderForm());
      }
    }
    else if (this.view === 'detail') container.appendChild(this.renderDetail());

    setTimeout(() => this.updateStickyOffsets(), 0);
    return container;
  },

  init() {
    this.updateStickyOffsets();
  },

  updateStickyOffsets() {
    App.updateStickyOffsets();
  },

  renderTabNav() {
    const tabNav = el('div', { class: 'module-tab-nav' });

    const entity = Auth.activeEntity;
    const count = DB.getWhere('transmittals', t => {
      const tEnt = (t.entity || '').toUpperCase();
      if (entity === 'ALL') {
        return Auth.user.entities.map(ae => ae.toUpperCase()).includes(tEnt);
      }
      return tEnt === entity.toUpperCase();
    }).length;

    const tabs = [
      { key: 'list', label: 'Transmittals', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>', count: count }
    ];

    tabs.forEach(tab => {
      const btn = el('button', { class: 'module-tab-link active' });
      btn.appendChild(parseHTML(tab.icon));
      btn.appendChild(document.createTextNode(' ' + tab.label));
      if (tab.count !== undefined) {
        btn.appendChild(document.createTextNode(' '));
        btn.appendChild(el('span', { class: 'module-badge-count', text: String(tab.count) }));
      }
      tabNav.appendChild(btn);
    });

    const canCreate = Auth.can('transmittal:create');
    const canRequest = Auth.can('transmittal:request');

    if (canCreate && canRequest) {
      const wrapper = el('div', { class: 'split-btn-group' });

      const primaryBtn = el('button', {
        class: 'btn btn-primary btn-sm split-btn-left'
      });
      primaryBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New Transmittal';
      primaryBtn.addEventListener('click', () => {
        this.showForm();
      });
      wrapper.appendChild(primaryBtn);

      const toggleBtn = el('button', {
        class: 'btn btn-primary btn-sm split-btn-right'
      });
      toggleBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
      wrapper.appendChild(toggleBtn);

      const menu = el('div', { class: 'dropdown-menu split-btn-menu hidden' });

      const requestItem = el('button', { class: 'dropdown-item' });
      requestItem.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg> Request Transmittal';
      requestItem.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('hidden');
        Transmittal.showRequestTransmittalModal();
      });

      menu.appendChild(requestItem);
      wrapper.appendChild(menu);

      toggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.toggle('hidden');
      });

      tabNav.appendChild(wrapper);
    } else if (canCreate) {
      const addBtn = el('button', {
        class: 'btn btn-primary btn-sm',
        style: 'margin-left: 16px; display: inline-flex; align-items: center; gap: 6px;',
        html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New Transmittal'
      });
      addBtn.addEventListener('click', () => {
        this.showForm();
      });
      tabNav.appendChild(addBtn);
    } else if (canRequest) {
      const reqBtn = el('button', {
        class: 'btn btn-primary btn-sm',
        style: 'margin-left: 16px; display: inline-flex; align-items: center; gap: 6px;'
      });
      reqBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg> Request Transmittal';
      reqBtn.addEventListener('click', () => { Transmittal.showRequestTransmittalModal(); });
      tabNav.appendChild(reqBtn);
    }

    return tabNav;
  },

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

    const wrapper = el('div');
    const stickyContainer = el('div', { class: 'toolbar-sticky-container' });
    const filters = el('div', { class: 'filters-bar' });



    // Pending operations requests banner
    if (Auth.can('transmittal:create')) {
      const pendingReqs = DB.getWhere('operationsRequests', r => r.status === 'pending' && r.type === 'transmittal');
      if (pendingReqs.length > 0) {
        const banner = el('div', { class: 'pending-requests-banner', style: 'background:linear-gradient(135deg,#fff8e1,#ffecb3);border:1px solid #ffc107;border-radius:var(--radius-md);padding:var(--spacing-md);margin-bottom:var(--spacing-md);' });
        const bannerTitle = el('div', { style: 'font-weight:600;color:#e65100;margin-bottom:var(--spacing-sm);font-size:0.95rem;' });
        bannerTitle.textContent = `⚠ ${pendingReqs.length} Pending Transmittal Request${pendingReqs.length > 1 ? 's' : ''} from Operations`;
        banner.appendChild(bannerTitle);
        pendingReqs.forEach(req => {
          const row = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;padding:var(--spacing-xs) 0;border-bottom:1px solid #ffe082;' });
          const client = DB.getById('clients', req.clientId);
          const wr = DB.getById('workRequests', req.workRequestId);
          const info = el('span', { style: 'font-size:0.875rem;color:#333;' });
          info.textContent = `${client ? client.name : 'Unknown Client'} – ${wr ? wr.title : 'Unknown WR'} (requested by ${req.requestedBy || 'N/A'})`;
          row.appendChild(info);
          const fulfillBtn = el('button', { class: 'btn btn-primary', text: 'Fulfill', style: 'padding:2px 12px;font-size:0.8rem;' });
          fulfillBtn.addEventListener('click', () => { Transmittal.prefilledWrId = req.workRequestId; Transmittal.prefilledClientId = req.clientId; Transmittal.prefilledRequestId = req.id; location.hash = '#transmittal/form'; });
          row.appendChild(fulfillBtn);
          banner.appendChild(row);
        });
        wrapper.appendChild(banner);
      }
    }

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
    filters.appendChild(wrapFilterFieldWithClear(wrFilter));

    const clientOptions = [{ value: '', text: 'All Clients' }];
    DB.getWhere('clients', c => {
      const clientEnt = (c.entity || '').toUpperCase();
      if (entity === 'ALL') {
        return Auth.user.entities.map(ae => ae.toUpperCase()).includes(clientEnt);
      }
      return clientEnt === entity.toUpperCase();
    }).forEach(c => {
      clientOptions.push({ value: c.id, text: c.name });
    });
    const clientFilter = createSearchableDropdown({ placeholder: 'All Clients', options: clientOptions, maxWidth: '200px' });
    filters.appendChild(clientFilter);

    const empOptions = [{ value: '', text: 'All Employees' }];
    DB.getWhere('users', u => {
      const userEnts = (u.entities || []).map(e => e.toUpperCase());
      if (entity === 'ALL') {
        return userEnts.some(e => Auth.user.entities.map(ae => ae.toUpperCase()).includes(e));
      }
      return userEnts.includes(entity.toUpperCase());
    }).forEach(u => {
      empOptions.push({ value: u.id, text: u.name });
    });
    (DB.getAll('tasks') || []).forEach(t => {
      const name = (t.assigneeName || '').trim();
      if (name && !empOptions.some(opt => opt.value === name || opt.text === name)) {
        empOptions.push({ value: name, text: name });
      }
    });
    const empFilter = createSearchableDropdown({ placeholder: 'All Employees', options: empOptions, maxWidth: '200px' });
    filters.appendChild(empFilter);

    const statusFilter = el('select', { class: 'form-select', style: 'max-width:150px' });
    statusFilter.appendChild(el('option', { value: '', text: 'All Statuses' }));
    ['Draft', 'Sent', 'Acknowledged'].forEach(s => statusFilter.appendChild(el('option', { value: s, text: s })));
    filters.appendChild(wrapFilterFieldWithClear(statusFilter));

    const dateFrom = el('input', { type: 'date', class: 'form-select' });
    const dateTo = el('input', { type: 'date', class: 'form-select' });
    filters.appendChild(el('span', { text: 'From:', style: 'font-size:0.75rem;color:var(--color-text-muted);' }));
    filters.appendChild(wrapFilterFieldWithClear(dateFrom));
    filters.appendChild(el('span', { text: 'To:', style: 'font-size:0.75rem;color:var(--color-text-muted);' }));
    filters.appendChild(wrapFilterFieldWithClear(dateTo));

    const clearBtn = el('button', {
      class: 'btn btn-secondary btn-sm',
      html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.5"></path></svg>Clear'
    });
    clearBtn.addEventListener('click', () => {
      wrFilter.value = '';
      clientFilter.value = '';
      empFilter.value = '';
      statusFilter.value = '';
      dateFrom.value = '';
      dateTo.value = '';
      App.clearSavedFilters('transmittals');
      updateFilters();
    });
    filters.appendChild(clearBtn);

    // Restore saved filters
    const savedFilters = App.restoreFilters('transmittals');
    if (savedFilters) {
      if (savedFilters.workRequest) wrFilter.value = savedFilters.workRequest;
      if (savedFilters.client) clientFilter.value = savedFilters.client;
      if (savedFilters.employee) empFilter.value = savedFilters.employee;
      if (savedFilters.status) statusFilter.value = savedFilters.status;
      if (savedFilters.dateFrom) dateFrom.value = savedFilters.dateFrom;
      if (savedFilters.dateTo) dateTo.value = savedFilters.dateTo;
    }

    const saveCurrentFilters = () => {
      App.saveFilters('transmittals', {
        workRequest: wrFilter.value,
        client: clientFilter.value,
        employee: empFilter.value,
        status: statusFilter.value,
        dateFrom: dateFrom.value,
        dateTo: dateTo.value
      });
    };

    // View mode toggle
    const vmToggle = el('div', { class: 'view-mode-toggle' });
    const viewIcons = { 'Table': ViewIcons.table, 'Board': ViewIcons.board, 'List': ViewIcons.list };
    [['Table', 'table'], ['Board', 'board'], ['List', 'list']].forEach(([label, mode]) => {
      const btn = el('button', { html: (viewIcons[label] || '') + ' ' + label, class: this.listViewMode === mode ? 'active' : '' });
      btn.addEventListener('click', () => {
        saveCurrentFilters();
        App.setPreferredViewMode('transmittals', mode);
        App.handleRoute();
      });
      vmToggle.appendChild(btn);
    });

    stickyContainer.appendChild(filters);
    stickyContainer.appendChild(vmToggle);
    wrapper.appendChild(stickyContainer);

    const listContainer = el('div');
    wrapper.appendChild(listContainer);

    const updateFilters = () => this.refreshList(listContainer, wrFilter.value, clientFilter.value, empFilter.value, statusFilter.value, dateFrom.value, dateTo.value, empFilter.searchText, clientFilter.searchText);
    [wrFilter, clientFilter, empFilter, statusFilter, dateFrom, dateTo].forEach(f => f.addEventListener('change', () => { saveCurrentFilters(); updateFilters(); }));
    [empFilter, clientFilter].forEach(el => el.addEventListener('input', () => { saveCurrentFilters(); updateFilters(); }));

    this.refreshList(listContainer, wrFilter.value, clientFilter.value, empFilter.value, statusFilter.value, dateFrom.value, dateTo.value, empFilter.searchText, clientFilter.searchText);
    return wrapper;
  },

  refreshList(container, wrFilter, clientFilter, empFilter, statusFilter, dateFrom, dateTo, empSearchText, clientSearchText) {
    while (container.firstChild) container.removeChild(container.firstChild);
    const entity = Auth.activeEntity;

    let items = DB.getWhere('transmittals', t => (entity === 'ALL' ? Auth.user.entities.includes(t.entity) : t.entity === entity));

    if (wrFilter) items = items.filter(t => t.workRequestId === wrFilter);
    if (clientFilter || (clientSearchText && clientSearchText.trim() !== '')) {
      const selectedClient = clientFilter ? DB.getById('clients', clientFilter) : null;
      if (selectedClient && selectedClient.name === clientSearchText) {
        items = items.filter(t => t.clientId === clientFilter);
      } else if (clientSearchText && clientSearchText.trim() !== '') {
        const query = clientSearchText.trim().toLowerCase();
        items = items.filter(t => {
          const client = DB.getById('clients', t.clientId);
          return client && client.name.toLowerCase().includes(query);
        });
      }
    }

    if (empSearchText && empSearchText.trim() !== '') {
      const query = empSearchText.trim().toLowerCase();
      items = items.filter(t => {
        const creator = t.createdBy ? DB.getById('users', t.createdBy) : null;
        const sender = t.sentBy ? DB.getById('users', t.sentBy) : null;
        const acknowledger = t.acknowledgedBy ? DB.getById('users', t.acknowledgedBy) : null;
        return (creator && creator.name.toLowerCase().includes(query)) ||
               (sender && sender.name.toLowerCase().includes(query)) ||
               (acknowledger && acknowledger.name.toLowerCase().includes(query));
      });
    } else if (empFilter) {
      items = items.filter(t => t.createdBy === empFilter || t.sentBy === empFilter || t.acknowledgedBy === empFilter);
    }
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
      viewBtn.addEventListener('click', () => { location.hash = '#transmittal/detail/' + t.id; });
      tdAct.appendChild(viewBtn);
      if (this.canEditTransmittal(t)) {
        const editBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Edit', style: 'margin-left:4px;' });
        editBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showForm(t.id); });
        tdAct.appendChild(editBtn);
      }
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
      const colItems = items.filter(t => t.status === st);
      const col = el('div', { class: 'board-column-v2' });
      col.style.setProperty('--column-phase-color', colColor);

      const header = el('div', { class: 'board-column-header-v2' });
      const titleWrap = el('div', { class: 'board-column-title' });
      titleWrap.appendChild(el('span', { class: 'board-column-dot', style: 'background:' + colColor + ';' }));
      titleWrap.appendChild(document.createTextNode(st));
      titleWrap.appendChild(el('span', { class: 'board-column-count', text: String(colItems.length) }));
      header.appendChild(titleWrap);
      col.appendChild(header);

      const cardContainer = el('div', { class: 'board-cards-scroll' });
      if (colItems.length === 0) {
        cardContainer.appendChild(el('div', { class: 'empty-state', text: 'No transmittals' }));
      }

      colItems.forEach(t => {
        const clientName = this.getClientName(t.clientId);
        const itemCount = (t.items || []).length;

        const card = el('div', { class: 'board-card-v2' });
        card.style.borderLeftColor = colColor;
        card.addEventListener('click', () => { location.hash = '#transmittal/detail/' + t.id; });

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

        if (this.canEditTransmittal(t)) {
          const cardActions = el('div', { style: 'display:flex;justify-content:flex-end;margin-top:8px;' });
          const editBtn = el('button', { class: 'btn btn-secondary btn-xs', text: 'Edit' });
          editBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showForm(t.id); });
          cardActions.appendChild(editBtn);
          card.appendChild(cardActions);
        }
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
      viewBtn.addEventListener('click', () => { location.hash = '#transmittal/detail/' + t.id; });
      item.appendChild(viewBtn);
      if (this.canEditTransmittal(t)) {
        const editBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Edit', style: 'margin-left:4px;' });
        editBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showForm(t.id); });
        item.appendChild(editBtn);
      }
      list.appendChild(item);
    });
    container.appendChild(list);
  },

  canEditTransmittal(t) {
    return Auth.can('transmittal:edit') && t.status === 'Draft';
  },

  showForm(txId = null) {
    this.detailId = txId;
    const isNew = !txId;
    const existing = isNew ? null : DB.getById('transmittals', txId);

    openFormPanel({
      icon: '📨',
      title: isNew ? 'Create Transmittal' : `Edit Transmittal — ${existing?.trackingNumber || ''}`.trim(),
      formContent: this.renderForm(),
      formId: 'transmittal-form',
      actions: [
        { text: isNew ? 'Create Transmittal' : 'Save Changes', class: 'btn btn-primary', type: 'submit', form: 'transmittal-form' },
        { text: 'Cancel', class: 'btn btn-secondary', onClick: () => closeFormPanelAndRoute('#transmittal') }
      ]
    });
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
    cancelBtn.addEventListener('click', () => { location.hash = '#transmittal'; });
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
      else if (!existing && this.prefilledWrId && this.prefilledWrId === wr.id) opt.selected = true;
      wrSel.appendChild(opt);
    });
    wrGroup.appendChild(wrSel);
    form.appendChild(wrGroup);

    // Client display (auto-populated from WR)
    const clientGroup = el('div', { class: 'form-group' });
    clientGroup.appendChild(el('label', { text: 'Client' }));
    const prefilledClient = this.prefilledClientId ? this.getClientName(this.prefilledClientId) : '';
    const clientDisplay = el('input', { type: 'text', name: 'clientDisplay', disabled: true, value: existing ? this.getClientName(existing.clientId) : prefilledClient });
    clientGroup.appendChild(clientDisplay);
    const clientIdInput = el('input', { type: 'hidden', name: 'clientId', value: existing ? existing.clientId : (this.prefilledClientId || '') });
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

    // Fulfill pending operations request if any
    const reqId = this.prefilledRequestId || (record.workRequestId ? DB.getWhere('operationsRequests', r => r.workRequestId === record.workRequestId && r.type === 'transmittal' && r.status === 'pending')[0]?.id : null);
    if (reqId) {
      DB.update('operationsRequests', reqId, {
        status: 'fulfilled',
        fulfilledBy: Auth.user.id,
        fulfilledAt: new Date().toISOString(),
        linkedRecordId: record.id
      });
    }
    this.prefilledRequestId = null;
    this.prefilledWrId = null;
    this.prefilledClientId = null;

    const msgConfig = {
      title: isNew ? 'Transmittal Created' : 'Transmittal Updated',
      message: 'Transmittal has been ' + (isNew ? 'created' : 'updated') + ' successfully.',
      type: 'success'
    };
    closeFormPanelAndRoute('#transmittal', msgConfig);
  },

  // ============================================================
  // Detail View
  // ============================================================
  showRequestTransmittalModal() {
    const entity = Auth.activeEntity;
    const wrs = DB.getWhere('workRequests', wr => {
      const wrEnt = (wr.entity || '').toUpperCase();
      if (entity === 'ALL') return Auth.user.entities.map(ae => ae.toUpperCase()).includes(wrEnt);
      return wrEnt === entity.toUpperCase();
    });

    const wrapper = el('div', { style: 'display: flex; flex-direction: column; gap: 16px;' });
    const selectGroup = el('div', { class: 'form-group' });
    selectGroup.appendChild(el('label', { text: 'Select Work Request *' }));
    const wrSelect = el('select', { class: 'form-select', style: 'width:100%;' });
    wrSelect.appendChild(el('option', { value: '', text: '— Select —' }));
    wrs.forEach(wr => {
      const client = DB.getById('clients', wr.clientId);
      const pending = DB.getWhere('operationsRequests', r => r.workRequestId === wr.id && r.type === 'transmittal' && r.status === 'pending');
      if (pending.length === 0) {
        wrSelect.appendChild(el('option', { value: wr.id, text: `${wr.title} — ${client?.name || '—'}` }));
      }
    });
    selectGroup.appendChild(wrSelect);
    wrapper.appendChild(selectGroup);

    const notesGroup = el('div', { class: 'form-group' });
    notesGroup.appendChild(el('label', { text: 'Additional Notes (Optional)' }));
    notesGroup.appendChild(el('textarea', { id: 'trans-opreq-notes', class: 'form-control', style: 'width: 100%; min-height: 80px;', placeholder: 'Provide any details for Documentation staff...' }));
    wrapper.appendChild(notesGroup);

    wrapper.appendChild(el('div', { style: 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;' }, [
      el('button', { id: 'btn-cancel-trans-opreq', class: 'btn btn-ghost', text: 'Cancel' }),
      el('button', { id: 'btn-save-trans-opreq', class: 'btn btn-primary', text: 'Submit Request' })
    ]));

    const overlay = Workflow.showModal('Request Transmittal', wrapper);

    overlay.querySelector('#btn-cancel-trans-opreq').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#btn-save-trans-opreq').addEventListener('click', () => {
      const wrId = wrSelect.value;
      if (!wrId) { alert('Please select a work request.'); return; }
      const wr = DB.getById('workRequests', wrId);
      const notes = overlay.querySelector('#trans-opreq-notes').value.trim();
      const record = {
        id: generateId('opreq'),
        type: 'transmittal',
        workRequestId: wrId,
        clientId: wr.clientId,
        requestedBy: Auth.user.id,
        requestedAt: new Date().toISOString(),
        status: 'pending',
        rejectionReason: '',
        notes
      };
      DB.insert('operationsRequests', record);
      overlay.remove();
      Workflow.showMessage('Request Submitted', 'Your transmittal request has been submitted to Documentation for review.', 'success');
      App.handleRoute();
    });
  },

  renderDetail() {
    const t = DB.getById('transmittals', this.detailId);
    if (!t) { location.hash = '#transmittal'; return el('div'); }

    const container = el('div', { class: 'invoice-detail' });

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
      meta.appendChild(el('p', { text: 'Acknowledged: ' + formatDate(t.acknowledgedAt) + ' by ' + (ackBy?.name || '—') + (t.receivedByName ? ` (Received by: ${t.receivedByName})` : '') }));
    }
    if (t.notes) meta.appendChild(el('p', { text: 'Notes: ' + t.notes }));
    container.appendChild(meta);

    // Transmittal Letter Preview
    const letterSection = el('div', { class: 'form-section', style: 'margin-bottom: var(--spacing-lg);' });
    letterSection.appendChild(el('h3', { text: 'Transmittal' }));
    letterSection.appendChild(this.buildLetterPreview(t));
    container.appendChild(letterSection);

    return container;
  },

  showAcknowledgeDialog(id) {
    const t = DB.getById('transmittals', id);
    if (!t) return;

    const form = el('form', { class: 'form-stacked' });

    const nameGroup = el('div', { class: 'form-group' });
    nameGroup.appendChild(el('label', { text: 'Received By (Name) *' }));
    nameGroup.appendChild(el('input', { type: 'text', name: 'receivedBy', required: true, class: 'form-control' }));
    form.appendChild(nameGroup);

    const dateGroup = el('div', { class: 'form-group' });
    dateGroup.appendChild(el('label', { text: 'Received Date *' }));
    dateGroup.appendChild(el('input', { type: 'date', name: 'receivedDate', required: true, class: 'form-control', value: new Date().toISOString().slice(0, 10) }));
    form.appendChild(dateGroup);

    const submitBtn = el('button', { type: 'submit', class: 'btn btn-success', text: 'Confirm Acknowledgment', style: 'margin-top: 12px;' });
    form.appendChild(submitBtn);

    const overlay = Workflow.showModal('Acknowledge Transmittal Receipt', form);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validateRequiredFields(form)) return;
      const fd = new FormData(form);
      const ackData = {
        status: 'Acknowledged',
        acknowledgedAt: fd.get('receivedDate'),
        acknowledgedBy: Auth.user.id,
        receivedByName: fd.get('receivedBy')
      };
      if (Auth.user.role === 'Admin') {
        // Admin acknowledgments are applied immediately
        DB.update('transmittals', t.id, ackData);
      } else {
        // Manager/Documentation: pending Admin approval
        const record = Object.assign({}, t, ackData, { id: t.id });
        PendingChanges.submit('transmittals', record, false);
      }
      overlay.remove();
      App.handleRoute();
    });
  },

  buildLetterPreview(t) {
    const client = DB.getById('clients', t.clientId);
    const wr = DB.getById('workRequests', t.workRequestId);
    const entity = t.entity || 'ATA';
    const fromEntity = entity === 'ATA' ? 'ATA BUSINESS CONSULTANCY SERVICES' : 'LTA BUSINESS CONSULTANCY SERVICES';

    // Date formatting (Entity-aware)
    let formattedDate = '';
    const dateObj = new Date(t.sentAt || t.createdAt || new Date());
    if (entity === 'ATA') {
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      formattedDate = dateObj.toLocaleDateString('en-US', options).toUpperCase();
    } else {
      formattedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${dateObj.getFullYear()}`;
    }

    // TO Field parsing
    const pocUser = DB.getById('users', client?.contactUserId);
    const pocName = pocUser?.name || client?.contactPerson || '';
    const clientName = client?.name || '';
    const tradeName = client?.tradeName || '';

    let toLine1 = pocName || clientName || '';
    let toLine2 = '';
    if (tradeName) {
      toLine2 = entity === 'ATA' ? `(${tradeName})` : tradeName;
    } else if (pocName && clientName) {
      toLine2 = entity === 'ATA' ? `(${clientName})` : clientName;
    }

    const address = client?.address || '';
    let toLine3 = '';
    let toLine4 = '';
    if (address) {
      const firstComma = address.indexOf(',');
      if (firstComma !== -1) {
        toLine3 = address.substring(0, firstComma).trim();
        toLine4 = address.substring(firstComma + 1).trim();
      } else {
        toLine3 = address;
      }
    }

    // Build the table rows for the documents
    const rows = [];
    const totalRows = 12;
    let usedRows = 0;

    (t.items || []).forEach(item => {
      if (usedRows < totalRows) {
        rows.push({ text: (item.documentType || '').toUpperCase(), isEmpty: false });
        usedRows++;
      }
      if (usedRows < totalRows) {
        rows.push({ text: (item.description || '').toUpperCase(), isEmpty: false });
        usedRows++;
      }
    });

    while (usedRows < totalRows) {
      rows.push({ text: '', isEmpty: true });
      usedRows++;
    }

    // Acknowledgment info for the signature
    let sigName = '';
    let sigDate = '';
    if (t.status === 'Acknowledged' && t.receivedByName) {
      sigName = t.receivedByName.toUpperCase();
      if (t.acknowledgedAt) {
        const dObj = new Date(t.acknowledgedAt);
        sigDate = `${dObj.getMonth() + 1}/${dObj.getDate()}/${String(dObj.getFullYear()).slice(-2)}`;
      }
    }

    const letter = el('div', { class: 'transmittal-letter', style: 'background:#fff; color:#000; font-family:Arial, sans-serif; padding:20px; border:1px solid #ccc; max-width:700px; margin:0 auto; box-sizing:border-box;' });

    // Styles local to the preview to ensure styling matches
    const styleEl = el('style', { textContent: `
      .preview-container {
        font-family: Arial, Helvetica, sans-serif;
      }
      .preview-header-table {
        width: 100%;
        border: 2px solid #000;
        border-collapse: collapse;
        margin-bottom: 15px;
      }
      .preview-header-table td {
        border: 2px solid #000;
        padding: 6px 10px;
        vertical-align: top;
      }
      .preview-title-cell {
        text-align: center;
        font-weight: bold;
        font-size: 12pt;
        letter-spacing: 0.5px;
        padding: 8px !important;
      }
      .preview-label-red {
        color: #c2272d;
        font-weight: bold;
        margin-right: 5px;
      }
      .preview-label-bold {
        font-weight: bold;
        margin-right: 5px;
      }
      .preview-underline-line {
        border-bottom: 1.5px solid #000;
        min-height: 16px;
        margin-top: 3px;
        padding-bottom: 1px;
        font-weight: bold;
      }
      .preview-document-box {
        border: 2px solid #000;
        position: relative;
        margin-bottom: 15px;
      }
      .preview-document-title {
        font-weight: bold;
        padding: 6px 10px;
        border-bottom: 2px solid #000;
        background-color: #fff;
        font-size: 10pt;
      }
      .preview-document-table {
        width: 100%;
        border-collapse: collapse;
      }
      .preview-doc-row {
        height: 22px;
      }
      .preview-doc-cell {
        border-bottom: 1px solid #000;
        text-align: center;
        font-weight: bold;
        padding: 2px 4px;
        font-size: 10pt;
      }
      .preview-document-table tr:last-child .preview-doc-cell {
        border-bottom: none;
      }
      .preview-received-stamp {
        position: absolute;
        right: 12%;
        top: 50%;
        transform: translateY(-50%) rotate(-7deg);
        border: 4px double #1e40af;
        color: #1e40af;
        padding: 6px 12px;
        text-align: center;
        background: rgba(255, 255, 255, 0.95);
        border-radius: 4px;
        font-family: 'Courier New', Courier, monospace;
        font-weight: bold;
        pointer-events: none;
        z-index: 100;
      }
      .preview-stamp-title {
        font-size: 14pt;
        letter-spacing: 2px;
        border-bottom: 2px solid #1e40af;
        margin-bottom: 4px;
        padding-bottom: 1px;
      }
      .preview-stamp-date {
        font-size: 11pt;
      }
      .preview-signature-container {
        margin-top: 30px;
        width: 100%;
        max-width: 400px;
        margin-left: auto;
        margin-right: auto;
        text-align: center;
      }
      .preview-sig-info {
        display: flex;
        justify-content: space-between;
        padding: 0 20px;
        font-weight: bold;
        font-size: 11pt;
        min-height: 20px;
      }
      .preview-sig-name {
        flex: 2;
        text-align: center;
      }
      .preview-sig-date {
        flex: 1;
        text-align: right;
      }
      .preview-sig-line {
        border-top: 1.5px solid #000;
        margin-top: 2px;
      }
      .preview-sig-label {
        font-size: 9pt;
        color: #333;
        margin-top: 6px;
      }
    ` });
    letter.appendChild(styleEl);

    // Main layout container
    const container = el('div', { class: 'preview-container' });

    // Table Header Box
    const headerTable = el('table', { class: 'preview-header-table' });
    
    // Row 1: Title
    const r1 = el('tr');
    r1.appendChild(el('td', { colspan: '2', class: 'preview-title-cell', text: 'DOCUMENT TRANSMITTAL FORM' }));
    headerTable.appendChild(r1);

    // Row 2: Doc No & Date
    const r2 = el('tr');
    const tdDocNo = el('td', { style: 'width: 55%;' }, [
      el('span', { class: 'preview-label-red', text: 'TRANSMITTAL DOC NO.:' }),
      el('span', { class: 'value-bold', text: t.trackingNumber })
    ]);
    const tdDate = el('td', { style: 'width: 45%;' }, [
      el('span', { class: 'preview-label-bold', text: 'DATE:' }),
      el('span', { class: 'value-bold', text: formattedDate })
    ]);
    r2.appendChild(tdDocNo);
    r2.appendChild(tdDate);
    headerTable.appendChild(r2);

    // Row 3: FROM & TO
    const r3 = el('tr');
    const tdFrom = el('td', { style: 'width: 55%; line-height: 1.4;' }, [
      el('strong', { text: 'FROM:' }),
      document.createTextNode(' '),
      el('strong', { text: fromEntity }),
      el('br'),
      document.createTextNode('RM 307 Republic Supermarket Bldg,'),
      el('br'),
      document.createTextNode('Soler St., cor. F.Torres St.,'),
      el('br'),
      document.createTextNode('Sta. Cruz, Manila')
    ]);
    const tdTo = el('td', { style: 'width: 45%;' }, [
      el('div', { style: 'display: flex; gap: 8px; align-items: flex-start;' }, [
        el('strong', { text: 'TO:', style: 'margin-top: 3px;' }),
        el('div', { style: 'flex: 1; display: flex; flex-direction: column;' }, [
          el('div', { class: 'preview-underline-line', text: toLine1 }),
          el('div', { class: 'preview-underline-line', text: toLine2 }),
          el('div', { class: 'preview-underline-line', text: toLine3 }),
          el('div', { class: 'preview-underline-line', text: toLine4 })
        ])
      ])
    ]);
    r3.appendChild(tdFrom);
    r3.appendChild(tdTo);
    headerTable.appendChild(r3);

    container.appendChild(headerTable);

    // Document Box
    const docBox = el('div', { class: 'preview-document-box' });
    docBox.appendChild(el('div', { class: 'preview-document-title', text: 'Received the following documents and/or records:' }));
    
    const docTable = el('table', { class: 'preview-document-table' });
    rows.forEach(r => {
      const tr = el('tr', { class: 'preview-doc-row' });
      tr.appendChild(el('td', { class: 'preview-doc-cell', html: r.isEmpty ? '&nbsp;' : r.text }));
      docTable.appendChild(tr);
    });
    docBox.appendChild(docTable);

    // RECEIVED STAMP (if acknowledged)
    if (t.status === 'Acknowledged' && t.acknowledgedAt) {
      const stampDateObj = new Date(t.acknowledgedAt);
      const stampDateStr = stampDateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
      
      const stamp = el('div', { class: 'preview-received-stamp' }, [
        el('div', { class: 'preview-stamp-title', text: 'RECEIVED' }),
        el('div', { class: 'preview-stamp-date', text: stampDateStr })
      ]);
      docBox.appendChild(stamp);
    }
    container.appendChild(docBox);

    // Notes (if any)
    if (t.notes) {
      container.appendChild(el('div', { style: 'margin: 10px 0; font-style: italic; font-size: 9.5pt; color: #555;', text: `Notes: ${t.notes}` }));
    }

    // Signature Box
    const sigContainer = el('div', { class: 'preview-signature-container' });
    sigContainer.appendChild(el('div', { class: 'preview-sig-info' }, [
      el('span', { class: 'preview-sig-name', text: sigName }),
      el('span', { class: 'preview-sig-date', text: sigDate })
    ]));
    sigContainer.appendChild(el('div', { class: 'preview-sig-line' }));
    sigContainer.appendChild(el('div', { class: 'preview-sig-label', text: 'Signature over Printed name / Date Received' }));
    container.appendChild(sigContainer);

    letter.appendChild(container);
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

    const client = DB.getById('clients', t.clientId);
    const wr = DB.getById('workRequests', t.workRequestId);
    const entity = t.entity || 'ATA';
    const fromEntity = entity === 'ATA' ? 'ATA BUSINESS CONSULTANCY SERVICES' : 'LTA BUSINESS CONSULTANCY SERVICES';

    // Date formatting (Entity-aware)
    let formattedDate = '';
    const dateObj = new Date(t.sentAt || t.createdAt || new Date());
    if (entity === 'ATA') {
      const options = { year: 'numeric', month: 'long', day: 'numeric' };
      formattedDate = dateObj.toLocaleDateString('en-US', options).toUpperCase();
    } else {
      formattedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${dateObj.getFullYear()}`;
    }

    // TO Field parsing
    const pocUser = DB.getById('users', client?.contactUserId);
    const pocName = pocUser?.name || client?.contactPerson || '';
    const clientName = client?.name || '';
    const tradeName = client?.tradeName || '';

    let toLine1 = pocName || clientName || '';
    let toLine2 = '';
    if (tradeName) {
      toLine2 = entity === 'ATA' ? `(${tradeName})` : tradeName;
    } else if (pocName && clientName) {
      toLine2 = entity === 'ATA' ? `(${clientName})` : clientName;
    }

    const address = client?.address || '';
    let toLine3 = '';
    let toLine4 = '';
    if (address) {
      const firstComma = address.indexOf(',');
      if (firstComma !== -1) {
        toLine3 = address.substring(0, firstComma).trim();
        toLine4 = address.substring(firstComma + 1).trim();
      } else {
        toLine3 = address;
      }
    }

    // Build the table rows for the documents
    const totalRows = 12;
    let usedRows = 0;
    let rowsHtml = '';

    (t.items || []).forEach(item => {
      if (usedRows < totalRows) {
        rowsHtml += `<tr class="doc-row"><td class="doc-cell">${(item.documentType || '').toUpperCase()}</td></tr>`;
        usedRows++;
      }
      if (usedRows < totalRows) {
        rowsHtml += `<tr class="doc-row"><td class="doc-cell">${(item.description || '').toUpperCase()}</td></tr>`;
        usedRows++;
      }
    });

    while (usedRows < totalRows) {
      rowsHtml += `<tr class="doc-row"><td class="doc-cell">&nbsp;</td></tr>`;
      usedRows++;
    }

    // RECEIVED STAMP (if acknowledged)
    let stampHtml = '';
    if (t.status === 'Acknowledged' && t.acknowledgedAt) {
      const stampDateObj = new Date(t.acknowledgedAt);
      const stampDateStr = stampDateObj.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase();
      stampHtml = `
        <div class="received-stamp">
          <div class="stamp-title">RECEIVED</div>
          <div class="stamp-date">${stampDateStr}</div>
        </div>
      `;
    }

    // Acknowledgment info for the signature
    let sigName = '';
    let sigDate = '';
    if (t.status === 'Acknowledged' && t.receivedByName) {
      sigName = t.receivedByName.toUpperCase();
      if (t.acknowledgedAt) {
        const dObj = new Date(t.acknowledgedAt);
        sigDate = `${dObj.getMonth() + 1}/${dObj.getDate()}/${String(dObj.getFullYear()).slice(-2)}`;
      }
    }

    const style = doc.createElement('style');
    style.textContent = `
      @page {
        size: letter;
        margin: 12mm 15mm;
      }
      body {
        font-family: Arial, Helvetica, sans-serif;
        margin: 0;
        padding: 0;
        color: #000;
        background-color: #fff;
        font-size: 10pt;
        line-height: 1.35;
      }
      .container {
        width: 100%;
        max-width: 680px;
        margin: 0 auto;
        position: relative;
      }
      .header-table {
        width: 100%;
        border: 2px solid #000;
        border-collapse: collapse;
        margin-bottom: 15px;
      }
      .header-table td {
        border: 2px solid #000;
        padding: 6px 10px;
        vertical-align: top;
      }
      .title-cell {
        text-align: center;
        font-weight: bold;
        font-size: 12pt;
        letter-spacing: 0.5px;
        padding: 8px !important;
      }
      .doc-no-cell {
        width: 55%;
      }
      .date-cell {
        width: 45%;
      }
      .label-red {
        color: #c2272d;
        font-weight: bold;
        margin-right: 5px;
      }
      .label-bold {
        font-weight: bold;
        margin-right: 5px;
      }
      .value-bold {
        font-weight: bold;
      }
      .from-cell {
        width: 55%;
        line-height: 1.4;
      }
      .to-cell {
        width: 45%;
        line-height: 1.4;
      }
      .underline-line {
        border-bottom: 1.5px solid #000;
        min-height: 16px;
        margin-top: 3px;
        padding-bottom: 1px;
        font-weight: bold;
      }
      .document-box {
        border: 2px solid #000;
        position: relative;
        margin-bottom: 15px;
      }
      .document-title {
        font-weight: bold;
        padding: 6px 10px;
        border-bottom: 2px solid #000;
        background-color: #fff;
        font-size: 10pt;
      }
      .document-table {
        width: 100%;
        border-collapse: collapse;
      }
      .doc-row {
        height: 22px;
      }
      .doc-cell {
        border-bottom: 1px solid #000;
        text-align: center;
        font-weight: bold;
        padding: 2px 4px;
        font-size: 10pt;
      }
      .document-table tr:last-child .doc-cell {
        border-bottom: none;
      }
      .received-stamp {
        position: absolute;
        right: 12%;
        top: 50%;
        transform: translateY(-50%) rotate(-7deg);
        border: 4px double #1e40af;
        color: #1e40af;
        padding: 6px 12px;
        text-align: center;
        background: rgba(255, 255, 255, 0.95);
        border-radius: 4px;
        font-family: 'Courier New', Courier, monospace;
        font-weight: bold;
        pointer-events: none;
        z-index: 100;
      }
      .stamp-title {
        font-size: 14pt;
        letter-spacing: 2px;
        border-bottom: 2px solid #1e40af;
        margin-bottom: 4px;
        padding-bottom: 1px;
      }
      .stamp-date {
        font-size: 11pt;
        letter-spacing: 1px;
      }
      .signature-container {
        margin-top: 30px;
        width: 100%;
        max-width: 400px;
        margin-left: auto;
        margin-right: auto;
        text-align: center;
      }
      .sig-info {
        display: flex;
        justify-content: space-between;
        padding: 0 20px;
        font-weight: bold;
        font-size: 11pt;
        min-height: 20px;
      }
      .sig-name {
        flex: 2;
        text-align: center;
      }
      .sig-date {
        flex: 1;
        text-align: right;
      }
      .sig-line {
        border-top: 1.5px solid #000;
        margin-top: 2px;
      }
      .sig-label {
        font-size: 9pt;
        color: #333;
        margin-top: 6px;
      }
    `;
    doc.head.appendChild(style);

    const body = doc.body;
    body.innerHTML = `
      <div class="container">
        <table class="header-table">
          <tr>
            <td colspan="2" class="title-cell">DOCUMENT TRANSMITTAL FORM</td>
          </tr>
          <tr>
            <td class="doc-no-cell">
              <span class="label-red">TRANSMITTAL DOC NO.:</span>
              <span class="value-bold">${t.trackingNumber}</span>
            </td>
            <td class="date-cell">
              <span class="label-bold">DATE:</span>
              <span class="value-bold">${formattedDate}</span>
            </td>
          </tr>
          <tr>
            <td class="from-cell">
              <strong>FROM:</strong> <strong>${fromEntity}</strong><br>
              RM 307 Republic Supermarket Bldg,<br>
              Soler St., cor. F.Torres St.,<br>
              Sta. Cruz, Manila
            </td>
            <td class="to-cell">
              <div style="display: flex; gap: 8px; align-items: flex-start;">
                <strong style="margin-top: 3px;">TO:</strong>
                <div style="flex: 1; display: flex; flex-direction: column;">
                  <div class="underline-line">${toLine1}</div>
                  <div class="underline-line">${toLine2}</div>
                  <div class="underline-line">${toLine3}</div>
                  <div class="underline-line">${toLine4}</div>
                </div>
              </div>
            </td>
          </tr>
        </table>

        <div class="document-box">
          <div class="document-title">Received the following documents and/or records:</div>
          <table class="document-table">
            ${rowsHtml}
          </table>
          ${stampHtml}
        </div>

        ${t.notes ? `<div style="margin: 10px 0; font-style: italic; font-size: 9.5pt; color: #555;">Notes: ${t.notes}</div>` : ''}

        <div class="signature-container">
          <div class="sig-info">
            <span class="sig-name">${sigName}</span>
            <span class="sig-date">${sigDate}</span>
          </div>
          <div class="sig-line"></div>
          <div class="sig-label">Signature over Printed name / Date Received</div>
        </div>
      </div>
    `;

    win.focus();
    setTimeout(() => win.print(), 300);
  }
};
