/**
 * Billing Module
 * Sales Invoice creation, payment tracking, aging.
 * VAT removed per v3 schema — total = subtotal.
 */

const Billing = {
  view: 'list', // 'list' | 'form' | 'detail' | 'aging' | 'templates'
  detailId: null,
  pendingPrefill: null, // { clientId, workRequestId } — set when generating billing from a WR

  getInvoiceById(id) {
    if (!id) return null;
    let inv = DB.getById('invoices', id);
    if (!inv) {
      const pc = DB.getWhere('pendingChanges', p => p.table === 'invoices' && p.status === 'pending' && p.proposedData && p.proposedData.id === id)[0];
      if (pc) {
        inv = deepClone(pc.proposedData);
        inv.status = 'Pending';
        inv.pendingChangeId = pc.id;
      }
    }
    return inv;
  },

  render() {
    const container = el('div', { class: 'page' });
    
    if (this.view === 'detail' && this.detailId) {
      const inv = this.getInvoiceById(this.detailId);
      const titleBar = el('div', { class: 'page-title-bar-v2' });
      const h1 = el('h1', { class: 'breadcrumb-h1' });
      const baseLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Billing' });
      baseLink.addEventListener('click', () => { location.hash = '#billing'; });
      h1.appendChild(baseLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      h1.appendChild(document.createTextNode(inv?.invoiceNumber || 'Detail'));
      titleBar.appendChild(h1);
 
      const actions = el('div', { class: 'title-bar-actions' });
      if (inv && inv.status !== 'Draft' && inv.status !== 'Pending') {
        const noLogoLabel = el('label', { style: 'margin-right:12px; font-size:0.8125rem; display:inline-flex; align-items:center; gap:6px; cursor:pointer; color:var(--color-text-muted);' });
        const noLogoCheckbox = el('input', { type: 'checkbox', id: 'print-no-logo' });
        noLogoLabel.appendChild(noLogoCheckbox);
        noLogoLabel.appendChild(document.createTextNode('No Logo (Generic)'));
        actions.appendChild(noLogoLabel);

        const genInvBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Print Invoice', style: 'margin-right:8px;' });
        genInvBtn.addEventListener('click', () => {
          const noLogo = noLogoCheckbox.checked;
          this.generateInvoice(inv, noLogo);
        });
        actions.appendChild(genInvBtn);
        const genVouchBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Print Voucher (No Header)', style: 'margin-right:8px;' });
        genVouchBtn.addEventListener('click', () => this.generateVoucher(inv));
        actions.appendChild(genVouchBtn);
      }
      const backBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '← Back to Invoices' });
      backBtn.addEventListener('click', () => { location.hash = '#billing'; });
      actions.appendChild(backBtn);
      titleBar.appendChild(actions);
      container.appendChild(titleBar);
    } else {
      container.classList.add('billing-tab-page');
      // Tab views: list, templates, aging, trash
      const titleBar = el('div', { class: 'page-title-bar-v2' });
      titleBar.appendChild(el('h1', { text: 'Billing' }));
      container.appendChild(titleBar);

      // Tab navigation
      container.appendChild(this.renderTabNav());
    }

    if (this.view === 'list') container.appendChild(this.renderList());
    else if (this.view === 'form') container.appendChild(this.renderForm());
    else if (this.view === 'detail') container.appendChild(this.renderDetail());
    else if (this.view === 'aging') container.appendChild(this.renderAging());
    else if (this.view === 'templates') container.appendChild(this.renderTemplates());
    else if (this.view === 'trash') container.appendChild(this.renderTrash());

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
    const entity = Auth.activeEntity;
    const tabNav = el('div', { class: 'module-tab-nav' });

    const invoiceCount = DB.getWhere('invoices', inv => {
      const matchesEntity = (entity === 'ALL' ? Auth.user.entities.includes(inv.entity) : inv.entity === entity);
      return matchesEntity && inv.status !== 'Cancelled';
    }).length + DB.getWhere('pendingChanges', pc => pc.table === 'invoices' && pc.status === 'pending').length;

    const templateCount = (DB.getAll('billingTemplates') || []).length;

    const trashCount = DB.getWhere('invoices', inv => {
      const matchesEntity = (entity === 'ALL' ? Auth.user.entities.includes(inv.entity) : inv.entity === entity);
      return matchesEntity && inv.status === 'Cancelled';
    }).length;

    const tabs = [
      { key: 'list', label: 'Invoices', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>', count: invoiceCount },
      { key: 'templates', label: 'Templates', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>', count: templateCount },
      { key: 'aging', label: 'Aging Report', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' },
      { key: 'trash', label: 'Archive', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="21 8 21 21 3 21 3 8"></polyline><rect x="1" y="3" width="22" height="5"></rect><line x1="10" y1="12" x2="14" y2="12"></line></svg>', count: trashCount }
    ];

    tabs.forEach(tab => {
      const btn = el('button', { class: 'module-tab-link' + (this.view === tab.key ? ' active' : '') });
      btn.appendChild(parseHTML(tab.icon));
      btn.appendChild(document.createTextNode(' ' + tab.label));
      if (tab.count !== undefined) {
        btn.appendChild(document.createTextNode(' '));
        btn.appendChild(el('span', { class: 'module-badge-count', text: String(tab.count) }));
      }
      btn.addEventListener('click', () => {
        this.view = tab.key;
        App.handleRoute();
      });
      tabNav.appendChild(btn);
    });

    const canCreate = Auth.can('billing:edit');
    const canRequest = Auth.can('billing:request');

    if (canCreate && canRequest) {
      const wrapper = el('div', { class: 'split-btn-group' });

      const primaryBtn = el('button', {
        class: 'btn btn-primary btn-sm split-btn-left'
      });
      primaryBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New Billing';
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
      requestItem.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg> Request Billing';
      requestItem.addEventListener('click', (e) => {
        e.stopPropagation();
        menu.classList.add('hidden');
        Billing.showRequestInvoiceModal();
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
        html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New Billing'
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
      reqBtn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg> Request Billing';
      reqBtn.addEventListener('click', () => { Billing.showRequestInvoiceModal(); });
      tabNav.appendChild(reqBtn);
    }

    return tabNav;
  },

  getPaidAmount(inv) {
    if (Array.isArray(inv.payments)) {
      return inv.payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    }
    return inv.paidAmount || 0;
  },

  getSubtotal(inv) {
    if (typeof inv.subtotal === 'number') return inv.subtotal;
    if (Array.isArray(inv.lineItems)) {
      return inv.lineItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    }
    return 0;
  },

  // ============================================================
  // List View
  // ============================================================
  renderList() {
    const entity = Auth.activeEntity;
    const wrapper = el('div');
    const stickyContainer = el('div', { class: 'toolbar-sticky-container' });



    // Pending operations requests banner
    if (Auth.can('billing:edit')) {
      const pendingReqs = DB.getWhere('operationsRequests', r => r.status === 'pending' && r.type === 'billing');
      if (pendingReqs.length > 0) {
        const banner = el('div', { class: 'pending-requests-banner', style: 'background:linear-gradient(135deg,#fff8e1,#ffecb3);border:1px solid #ffc107;border-radius:var(--radius-md);padding:var(--spacing-md);margin-bottom:var(--spacing-md);' });
        const bannerTitle = el('div', { style: 'font-weight:600;color:#e65100;margin-bottom:var(--spacing-sm);font-size:0.95rem;' });
        bannerTitle.textContent = `⚠ ${pendingReqs.length} Pending Invoice Request${pendingReqs.length > 1 ? 's' : ''} from Operations`;
        banner.appendChild(bannerTitle);
        pendingReqs.forEach(req => {
          const row = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;padding:var(--spacing-xs) 0;border-bottom:1px solid #ffe082;' });
          const client = DB.getById('clients', req.clientId);
          const wr = DB.getById('workRequests', req.workRequestId);
          const info = el('span', { style: 'font-size:0.875rem;color:#333;' });
          info.textContent = `${client ? client.name : 'Unknown Client'} – ${wr ? wr.title : 'Unknown WR'} (requested by ${req.requestedBy || 'N/A'})`;
          row.appendChild(info);
          const fulfillBtn = el('button', { class: 'btn btn-primary', text: 'Fulfill', style: 'padding:2px 12px;font-size:0.8rem;' });
          fulfillBtn.addEventListener('click', () => {
            Billing.prefilledWrId = req.workRequestId;
            Billing.prefilledClientId = req.clientId;
            Billing.prefilledRequestId = req.id;
            Billing.showForm();
          });
          row.appendChild(fulfillBtn);
          banner.appendChild(row);
        });
        wrapper.appendChild(banner);
      }
    }

    // Filters
    const filters = el('div', { class: 'filters-bar' });
    const wrFilter = el('select', { class: 'form-select' });
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
    const clientFilter = createSearchableDropdown({ placeholder: 'All Clients', options: clientOptions });
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
    const empFilter = createSearchableDropdown({ placeholder: 'All Employees', options: empOptions });
    filters.appendChild(empFilter);

    const dateFrom = el('input', { type: 'date', class: 'form-select' });
    const dateTo = el('input', { type: 'date', class: 'form-select' });
    filters.appendChild(el('span', { text: 'From', style: 'font-size:0.8125rem;color:var(--color-text-muted);' }));
    filters.appendChild(wrapFilterFieldWithClear(dateFrom));
    filters.appendChild(el('span', { text: 'To', style: 'font-size:0.8125rem;color:var(--color-text-muted);' }));
    filters.appendChild(wrapFilterFieldWithClear(dateTo));

    const statusFilter = el('select', { class: 'form-select' });
    statusFilter.appendChild(el('option', { value: '', text: 'All Statuses' }));
    ['Draft', 'Pending', 'Approved', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'].forEach(s => {
      statusFilter.appendChild(el('option', { value: s, text: s }));
    });
    filters.appendChild(wrapFilterFieldWithClear(statusFilter));

    const clearBtn = el('button', {
      class: 'btn btn-secondary btn-sm',
      html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.5"></path></svg>Clear'
    });
    clearBtn.addEventListener('click', () => {
      wrFilter.value = '';
      clientFilter.value = '';
      empFilter.value = '';
      dateFrom.value = '';
      dateTo.value = '';
      statusFilter.value = '';
      App.clearSavedFilters('billing');
      refresh();
    });
    filters.appendChild(clearBtn);

    stickyContainer.appendChild(filters);

    // Restore saved filters
    const savedFilters = App.restoreFilters('billing');
    if (savedFilters) {
      if (savedFilters.workRequest) wrFilter.value = savedFilters.workRequest;
      if (savedFilters.client) clientFilter.value = savedFilters.client;
      if (savedFilters.employee) empFilter.value = savedFilters.employee;
      if (savedFilters.dateFrom) dateFrom.value = savedFilters.dateFrom;
      if (savedFilters.dateTo) dateTo.value = savedFilters.dateTo;
      if (savedFilters.status) statusFilter.value = savedFilters.status;
    }

    const saveCurrentFilters = () => {
      App.saveFilters('billing', {
        workRequest: wrFilter.value,
        client: clientFilter.value,
        employee: empFilter.value,
        dateFrom: dateFrom.value,
        dateTo: dateTo.value,
        status: statusFilter.value
      });
    };

    // View mode toggle
    const viewMode = App.getPreferredViewMode('billing') || 'table';
    const vmToggle = el('div', { class: 'view-mode-toggle' });
    const vmTable = el('button', { html: ViewIcons.table + ' Table', class: viewMode === 'table' ? 'active' : '' });
    const vmBoard = el('button', { html: ViewIcons.board + ' Board', class: viewMode === 'board' ? 'active' : '' });
    const vmList = el('button', { html: ViewIcons.list + ' List', class: viewMode === 'list' ? 'active' : '' });
    vmTable.addEventListener('click', () => { saveCurrentFilters(); App.setPreferredViewMode('billing', 'table'); App.handleRoute(); });
    vmBoard.addEventListener('click', () => { saveCurrentFilters(); App.setPreferredViewMode('billing', 'board'); App.handleRoute(); });
    vmList.addEventListener('click', () => { saveCurrentFilters(); App.setPreferredViewMode('billing', 'list'); App.handleRoute(); });
    vmToggle.appendChild(vmTable);
    vmToggle.appendChild(vmBoard);
    vmToggle.appendChild(vmList);
    stickyContainer.appendChild(vmToggle);
    wrapper.appendChild(stickyContainer);

    const contentContainer = el('div');
    wrapper.appendChild(contentContainer);

    const refresh = () => {
      while (contentContainer.firstChild) contentContainer.removeChild(contentContainer.firstChild);
      let invoices = DB.getWhere('invoices', inv => {
        const matchesEntity = (entity === 'ALL' ? Auth.user.entities.includes(inv.entity) : inv.entity === entity);
        return matchesEntity && inv.status !== 'Cancelled';
      });
      
      const pendingInvs = DB.getWhere('pendingChanges', pc => {
        if (pc.table !== 'invoices' || pc.status !== 'pending') return false;
        const inv = pc.proposedData;
        const matchesEntity = (entity === 'ALL' ? Auth.user.entities.includes(inv.entity) : inv.entity === entity);
        if (!matchesEntity) return false;
        if (!Auth.can('billing:approve') && pc.submittedBy !== Auth.user?.id) return false;
        return true;
      }).map(pc => {
        const inv = deepClone(pc.proposedData);
        inv.status = 'Pending';
        inv.pendingChangeId = pc.id;
        return inv;
      });

      invoices = [...invoices, ...pendingInvs];

      if (wrFilter.value) invoices = invoices.filter(inv => {
        const wr = DB.getById('workRequests', inv.workRequestId);
        return wr && wr.id === wrFilter.value;
      });
      const selectedClient = clientFilter.value ? DB.getById('clients', clientFilter.value) : null;
      if (selectedClient && selectedClient.name === clientFilter.searchText) {
        invoices = invoices.filter(inv => inv.clientId === clientFilter.value);
      } else if (clientFilter.searchText && clientFilter.searchText.trim() !== '') {
        const query = clientFilter.searchText.trim().toLowerCase();
        invoices = invoices.filter(inv => {
          const client = DB.getById('clients', inv.clientId);
          return client && client.name.toLowerCase().includes(query);
        });
      }
      if (empFilter.searchText && empFilter.searchText.trim() !== '') {
        const query = empFilter.searchText.trim().toLowerCase();
        invoices = invoices.filter(inv => {
          const creator = inv.createdBy ? DB.getById('users', inv.createdBy) : null;
          if (creator && creator.name.toLowerCase().includes(query)) return true;
          const tasks = inv.workRequestId ? DB.getWhere('tasks', t => t.workRequestId === inv.workRequestId) : [];
          return tasks.some(t => {
            if (t.assigneeId) {
              const u = DB.getById('users', t.assigneeId);
              if (u && u.name.toLowerCase().includes(query)) return true;
            }
            if (t.assigneeName && t.assigneeName.toLowerCase().includes(query)) return true;
            return false;
          });
        });
      } else if (empFilter.value) {
        invoices = invoices.filter(inv => inv.createdBy === empFilter.value);
      }
      if (dateFrom.value) invoices = invoices.filter(inv => inv.issueDate >= dateFrom.value);
      if (dateTo.value) invoices = invoices.filter(inv => inv.issueDate <= dateTo.value);
      if (statusFilter.value) invoices = invoices.filter(inv => inv.status === statusFilter.value);

      if (viewMode === 'table') this.refreshTable(contentContainer, invoices);
      else if (viewMode === 'board') this.refreshBoard(contentContainer, invoices);
      else this.refreshListCompact(contentContainer, invoices);
    };

    [wrFilter, clientFilter, empFilter, dateFrom, dateTo, statusFilter].forEach(el => el.addEventListener('change', () => { saveCurrentFilters(); refresh(); }));
    [empFilter, clientFilter].forEach(el => el.addEventListener('input', () => { saveCurrentFilters(); refresh(); }));
    refresh();

    return wrapper;
  },

  refreshTable(container, invoices) {
    if (invoices.length === 0) {
      container.appendChild(el('p', { text: 'No invoices found.', class: 'empty-state' }));
      return;
    }
    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Invoice #', 'Client', 'Issue Date', 'Total', 'Paid', 'Balance', 'Status', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = el('tbody');
    invoices.forEach(inv => {
      const client = DB.getById('clients', inv.clientId);
      const paid = this.getPaidAmount(inv);
      const balance = inv.total - paid;
      const tr = el('tr');
      const tdInvoice = el('td');
      tdInvoice.appendChild(el('span', { text: inv.invoiceNumber, style: 'font-weight:600;' }));
      if (inv.fromTemplate) tdInvoice.appendChild(this.recurringBadge(inv));
      if (inv.workRequestId) {
        const wr = DB.getById('workRequests', inv.workRequestId);
        if (wr) {
          const wrWrap = el('div', { style: 'font-size: 0.725rem; color: #64748b; margin-top: 4px;' });
          wrWrap.appendChild(el('span', { text: '🔗 ' + wr.title, style: 'font-weight: 500;' }));
          if (inv.linkedTaskId) {
            const task = DB.getById('tasks', inv.linkedTaskId);
            if (task) {
              wrWrap.appendChild(el('span', { text: ` (Task: ${task.title})`, style: 'color: #8c9ba5; font-style: italic;' }));
            }
          } else {
            wrWrap.appendChild(el('span', { text: ' (Entire WR)', style: 'color: #8c9ba5; font-style: italic;' }));
          }
          tdInvoice.appendChild(wrWrap);
        }
      }
      tr.appendChild(tdInvoice);
      tr.appendChild(el('td', { text: client?.name || '—' }));
      tr.appendChild(el('td', { text: formatDate(inv.issueDate) }));
      tr.appendChild(el('td', { text: formatPHP(inv.total) }));
      tr.appendChild(el('td', { text: formatPHP(paid) }));
      tr.appendChild(el('td', { text: formatPHP(balance) }));
      tr.appendChild(el('td')).appendChild(this.statusBadge(inv.status));
      const tdAct = el('td');
      const viewBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { location.hash = '#billing/detail/' + inv.id; });
      tdAct.appendChild(viewBtn);

      if (inv.status === 'Draft') {
        const editBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Edit', style: 'margin-left:4px;' });
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showForm(inv.id);
        });
        tdAct.appendChild(editBtn);
        const trashBtn = el('button', { class: 'btn btn-danger btn-sm', text: 'Trash', style: 'margin-left:4px;' });
        trashBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.trashInvoice(inv.id);
        });
        tdAct.appendChild(trashBtn);
      }
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  },

  refreshBoard(container, invoices) {
    const board = el('div', { class: 'board-v2' });
    const statuses = ['Draft', 'Pending', 'Approved', 'Sent', 'Partially Paid', 'Paid', 'Overdue'];
    const statusColors = {
      'Draft': '#94a3b8',
      'Pending': '#f59e0b',
      'Approved': '#10b981',
      'Sent': '#3b82f6',
      'Partially Paid': '#f59e0b',
      'Paid': '#10b981',
      'Overdue': '#ef4444'
    };

    statuses.forEach(st => {
      const colColor = statusColors[st] || '#cbd5e1';
      const colInvs = invoices.filter(inv => inv.status === st);

      const col = el('div', { class: 'board-column-v2' });
      col.style.setProperty('--column-phase-color', colColor);

      const header = el('div', { class: 'board-column-header-v2' });
      const titleWrap = el('div', { class: 'board-column-title' });
      titleWrap.appendChild(el('span', { class: 'board-column-dot', style: 'background:' + colColor + ';' }));
      titleWrap.appendChild(document.createTextNode(st));
      titleWrap.appendChild(el('span', { class: 'board-column-count', text: String(colInvs.length) }));
      header.appendChild(titleWrap);
      col.appendChild(header);

      const cardContainer = el('div', { class: 'board-cards-scroll' });

      if (st === 'Draft') {
        const addCard = el('div', {
          class: 'board-card-v2 add-billing-card',
          style: 'border: 1px dashed #94a3b8; background: rgba(148, 163, 184, 0.02); display: flex; align-items: center; justify-content: center; gap: 8px; padding: 12px; font-weight: 600; color: #94a3b8; margin-bottom: var(--spacing-sm, 12px); cursor: pointer;'
        });
        addCard.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Add Billing';
        addCard.addEventListener('click', () => {
          this.showForm();
        });
        cardContainer.appendChild(addCard);
      }

      if (colInvs.length === 0 && st !== 'Draft') {
        cardContainer.appendChild(el('div', { class: 'empty-state', text: 'No invoices' }));
      }

      colInvs.forEach(inv => {
        const client = DB.getById('clients', inv.clientId);
        const paid = this.getPaidAmount(inv);
        const balance = inv.total - paid;
        const progress = inv.total > 0 ? Math.round((paid / inv.total) * 100) : 0;

        const card = el('div', { class: 'board-card-v2' });
        card.style.borderLeftColor = colColor;
        card.addEventListener('click', () => { location.hash = '#billing/detail/' + inv.id; });

        // Top: Info path and Issue Date
        const topRow = el('div', { class: 'card-v2-top' });
        topRow.appendChild(el('span', { class: 'card-v2-category', text: `${inv.status} >` }));
        if (inv.fromTemplate) topRow.appendChild(this.recurringBadge(inv));
        topRow.appendChild(el('span', { class: 'card-v2-date', text: formatDate(inv.issueDate) }));
        card.appendChild(topRow);

        // Title Row
        const titleRow = el('div', { class: 'card-v2-title-row' });
        titleRow.appendChild(el('div', { class: 'card-v2-title', text: inv.invoiceNumber }));
        card.appendChild(titleRow);

        // Client info
        card.appendChild(el('div', { text: client?.name || '—', style: 'font-size:0.875rem;color:#64748b;margin-bottom:8px;' }));

        // Linked WR/Task info
        if (inv.workRequestId) {
          const wr = DB.getById('workRequests', inv.workRequestId);
          if (wr) {
            const wrWrap = el('div', { style: 'font-size: 0.725rem; color: #1e40af; margin-bottom: 12px; background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.15); border-radius: 4px; padding: 4px 6px; width: 100%; box-sizing: border-box; word-break: break-word;' });
            wrWrap.appendChild(el('span', { text: '🔗 ' + wr.title, style: 'font-weight: 600;' }));
            if (inv.linkedTaskId) {
              const task = DB.getById('tasks', inv.linkedTaskId);
              if (task) {
                wrWrap.appendChild(el('span', { text: ` (Task: ${task.title})`, style: 'font-style: italic; color: #475569;' }));
              }
            } else {
              wrWrap.appendChild(el('span', { text: ' (Entire WR)', style: 'font-style: italic; color: #475569;' }));
            }
            card.appendChild(wrWrap);
          }
        }

        // Meta: Progress and Financials
        const metaRow = el('div', { class: 'card-v2-meta' });
        const metaLeft = el('div', { class: 'card-v2-meta-left' });
        
        const progBar = el('div', { class: 'card-v2-progress' });
        progBar.appendChild(el('div', { class: 'card-v2-progress-fill', style: `width: ${progress}%; background-color: ${colColor};` }));
        metaLeft.appendChild(progBar);
        metaLeft.appendChild(el('span', { class: 'card-v2-meta-text', text: `${progress}%` }));
        metaRow.appendChild(metaLeft);

        const financials = el('div', { style: 'text-align:right;' });
        financials.appendChild(el('div', { class: 'card-v2-meta-text', text: formatPHP(inv.total), style: 'font-weight:700;color:#1e293b;' }));
        if (balance > 0 && balance < inv.total) {
          financials.appendChild(el('div', { text: `Bal: ${formatPHP(balance)}`, style: 'font-size:0.7rem;color:#ef4444;font-weight:600;' }));
        }
        metaRow.appendChild(financials);
        card.appendChild(metaRow);

        // Card actions for Draft invoices
        if (inv.status === 'Draft') {
          const cardActions = el('div', { style: 'display:flex; gap:6px; margin-top:8px; padding-top:8px; border-top:1px solid #e2e8f0;' });
          const editBtn = el('button', { class: 'btn btn-secondary btn-xs', text: 'Edit' });
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.showForm(inv.id);
          });
          cardActions.appendChild(editBtn);
          const trashBtn = el('button', { class: 'btn btn-danger btn-xs', text: 'Trash' });
          trashBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.trashInvoice(inv.id);
          });
          cardActions.appendChild(trashBtn);
          card.appendChild(cardActions);
        }

        cardContainer.appendChild(card);
      });
      col.appendChild(cardContainer);
      board.appendChild(col);
    });
    container.appendChild(board);
  },

  refreshListCompact(container, invoices) {
    if (invoices.length === 0) {
      container.appendChild(el('p', { text: 'No invoices found.', class: 'empty-state' }));
      return;
    }
    const list = el('div', { class: 'list-view' });
    invoices.forEach(inv => {
      const client = DB.getById('clients', inv.clientId);
      const row = el('div', { class: 'list-item' });
      const paid = this.getPaidAmount(inv);
      const balance = inv.total - paid;
      let wrMeta = '';
      if (inv.workRequestId) {
        const wr = DB.getById('workRequests', inv.workRequestId);
        if (wr) {
          wrMeta = ' | WR: ' + wr.title;
          if (inv.linkedTaskId) {
            const task = DB.getById('tasks', inv.linkedTaskId);
            if (task) wrMeta += ` (Task: ${task.title})`;
          } else {
            wrMeta += ' (Entire WR)';
          }
        }
      }
      row.appendChild(el('div', {}, [
        el('div', { class: 'list-item-title', text: inv.invoiceNumber + ' — ' + (client?.name || '—') }),
        el('div', { class: 'list-item-meta', text: formatDate(inv.issueDate) + ' | ' + formatPHP(inv.total) + ' | Paid: ' + formatPHP(paid) + ' | Bal: ' + formatPHP(balance) + wrMeta })
      ]));
      const rightWrap = el('div', { style: 'display:flex; gap:6px; align-items:center; margin-left:auto;' });
      const badgeWrap = el('div', { style: 'display:flex; gap:4px; align-items:center;' });
      badgeWrap.appendChild(this.statusBadge(inv.status));
      if (inv.fromTemplate) badgeWrap.appendChild(this.recurringBadge(inv));
      rightWrap.appendChild(badgeWrap);

      // List actions for Draft invoices
      if (inv.status === 'Draft') {
        const editBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Edit' });
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showForm(inv.id);
        });
        rightWrap.appendChild(editBtn);
        const trashBtn = el('button', { class: 'btn btn-danger btn-sm', text: 'Trash' });
        trashBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.trashInvoice(inv.id);
        });
        rightWrap.appendChild(trashBtn);
      }

      row.appendChild(rightWrap);
      row.addEventListener('click', () => { location.hash = '#billing/detail/' + inv.id; });
      list.appendChild(row);
    });
    container.appendChild(list);
  },

  statusBadge(status) {
    const map = {
      'Draft': 'badge-info',
      'Pending': 'badge-warning',
      'Approved': 'badge-success',
      'Sent': 'badge-warning',
      'Partially Paid': 'badge-warning',
      'Paid': 'badge-success',
      'Overdue': 'badge-danger',
      'Cancelled': 'badge-danger'
    };
    return el('span', { class: 'badge ' + (map[status] || ''), text: status });
  },

  recurringBadge(inv) {
    if (!inv.fromTemplate) return el('span');
    return el('span', { class: 'badge badge-recurring', text: 'Recurring' });
  },

  // ============================================================
  // Create / Edit Form
  // ============================================================
  renderForm(invoiceId = null) {
    if (!Auth.can('billing:edit')) {
      this.view = 'list';
      App.handleRoute();
      return el('div');
    }

    const entity = Auth.activeEntity;
    const activeId = invoiceId || this.detailId;
    const inv = activeId ? this.getInvoiceById(activeId) : null;
    const opReq = this.prefilledRequestId ? DB.getById('operationsRequests', this.prefilledRequestId) : null;
    const prefill = this.pendingPrefill || (this.prefilledWrId ? { workRequestId: this.prefilledWrId, clientId: this.prefilledClientId } : null);
    this.pendingPrefill = null; // consume once
    const container = el('div');

    // Header bar
    const headerBar = el('div', { class: 'form-header-bar' });
    headerBar.appendChild(el('h2', { text: inv ? 'Edit Invoice' : 'Create Sales Invoice' }));
    const topActions = el('div', { class: 'form-actions-top' });
    const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Save Invoice', form: 'invoice-form' });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => { location.hash = '#billing'; });
    topActions.appendChild(saveBtn);
    topActions.appendChild(cancelBtn);
    headerBar.appendChild(topActions);
    container.appendChild(headerBar);

    const form = el('form', { id: 'invoice-form', class: 'form-stacked' });

    // Client
    const clientGroup = el('div', { class: 'form-group' });
    clientGroup.appendChild(el('label', { text: 'Client *' }));
    const clientSelAttrs = { name: 'clientId', required: true };
    if (prefill) clientSelAttrs.disabled = true;
    const clientSel = el('select', clientSelAttrs);
    clientSel.appendChild(el('option', { value: '', text: '— Select Client —' }));
    DB.getWhere('clients', c => c.entity === entity).forEach(c => {
      const opt = el('option', { value: c.id, text: c.name });
      if (inv && inv.clientId === c.id) opt.selected = true;
      else if (!inv && prefill && prefill.clientId === c.id) opt.selected = true;
      clientSel.appendChild(opt);
    });
    clientGroup.appendChild(clientSel);
    if (prefill) {
      clientGroup.appendChild(el('input', { type: 'hidden', name: 'clientId', value: prefill.clientId }));
    }
    form.appendChild(clientGroup);

    // Work Request link
    const wrGroup = el('div', { class: 'form-group' });
    wrGroup.appendChild(el('label', { text: 'Link to Work Request' }));
    const wrSelAttrs = { name: 'workRequestId' };
    if (prefill) wrSelAttrs.disabled = true;
    const wrSel = el('select', wrSelAttrs);
    wrSel.appendChild(el('option', { value: '', text: '— None —' }));
    DB.getWhere('workRequests', wr => wr.entity === entity).forEach(wr => {
      const opt = el('option', { value: wr.id, text: wr.title });
      if (inv && inv.workRequestId === wr.id) opt.selected = true;
      else if (!inv && prefill && prefill.workRequestId === wr.id) opt.selected = true;
      wrSel.appendChild(opt);
    });
    wrGroup.appendChild(wrSel);
    if (prefill && prefill.workRequestId) {
      wrGroup.appendChild(el('input', { type: 'hidden', name: 'workRequestId', value: prefill.workRequestId }));
    }
    form.appendChild(wrGroup);

    // Task link (Dynamic based on WR)
    const taskGroup = el('div', { class: 'form-group' });
    taskGroup.appendChild(el('label', { text: 'Link to Specific Task' }));
    const taskSel = el('select', { name: 'linkedTaskId' });
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
          if (inv && inv.linkedTaskId === t.id) opt.selected = true;
          else if (!inv && opReq && opReq.linkedTaskId === t.id) opt.selected = true;
          taskSel.appendChild(opt);
        });
      }
    };
    wrSel.addEventListener('change', updateTasks);
    updateTasks(); // Initial load

    // Dates
    const dateGroup = el('div', { class: 'form-group' });
    dateGroup.appendChild(el('label', { text: 'Issue Date *' }));
    dateGroup.appendChild(el('input', { type: 'date', name: 'issueDate', value: inv ? inv.issueDate : new Date().toISOString().slice(0, 10), required: true }));
    form.appendChild(dateGroup);

    const dueGroup = el('div', { class: 'form-group' });
    dueGroup.appendChild(el('label', { text: 'Due Date *' }));
    dueGroup.appendChild(el('input', { type: 'date', name: 'dueDate', value: inv ? inv.dueDate : '', required: true }));
    form.appendChild(dueGroup);

    // Invoice Number (auto)
    const numGroup = el('div', { class: 'form-group' });
    numGroup.appendChild(el('label', { text: 'Invoice Number' }));
    const numInput = el('input', { type: 'text', name: 'invoiceNumber', value: inv ? inv.invoiceNumber : this.nextInvoiceNumber(entity), readonly: true });
    numGroup.appendChild(numInput);
    form.appendChild(numGroup);

    // Line Items
    const itemsSection = el('div', { class: 'form-section' });
    itemsSection.appendChild(el('h3', { text: 'Line Items' }));
    const itemsList = el('div', { id: 'line-item-rows' });
    itemsSection.appendChild(itemsList);

    const addItemBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: '+ Add Line Item' });
    addItemBtn.addEventListener('click', () => this.addLineItemRow(itemsList));
    itemsSection.appendChild(addItemBtn);
    form.appendChild(itemsSection);

    // Pre-populate existing line items
    if (inv && inv.lineItems) {
      inv.lineItems.forEach(item => this.addLineItemRow(itemsList, item));
    } else if (opReq) {
      this.addLineItemRow(itemsList, { 
        type: 'Professional Fee', 
        description: opReq.notes || 'Operations Request Billing', 
        amount: opReq.amount ? String(opReq.amount) : '' 
      });
    } else {
      this.addLineItemRow(itemsList, { type: 'Professional Fee', description: '', amount: '' });
      this.addLineItemRow(itemsList, { type: 'Government Fee', description: '', amount: '' });
    }

    // Totals (no VAT)
    const totals = el('div', { class: 'invoice-totals' });
    totals.appendChild(el('div', { class: 'total-row' }, [el('span', { text: 'Subtotal:' }), el('span', { id: 'inv-subtotal', text: '₱0.00' })]));
    totals.appendChild(el('div', { class: 'total-row total-grand' }, [el('span', { text: 'Total:' }), el('span', { id: 'inv-total', text: '₱0.00' })]));
    form.appendChild(totals);

    // Seller / Buyer info preview
    const infoSection = el('div', { class: 'form-section' });
    infoSection.appendChild(el('h3', { text: 'Seller / Buyer Info' }));
    const infoBox = el('div', { class: 'invoice-info-box' });
    infoBox.appendChild(el('p', { text: 'Seller: ' + entity + ' Accounting Firm | TIN: 000-000-000-0000 | Branch: 0001' }));
    infoBox.appendChild(el('p', { id: 'buyer-info', text: 'Buyer: —' }));
    infoSection.appendChild(infoBox);
    form.appendChild(infoSection);

    // Update buyer info on client change
    clientSel.addEventListener('change', () => {
      const cid = clientSel.value;
      const c = cid ? DB.getById('clients', cid) : null;
      const buyerEl = document.getElementById('buyer-info');
      if (buyerEl && c) {
        buyerEl.textContent = 'Buyer: ' + c.name + ' | TIN: ' + (c.tin || '—');
      } else if (buyerEl) {
        buyerEl.textContent = 'Buyer: —';
      }
    });
    if (clientSel.value) clientSel.dispatchEvent(new Event('change'));

    // Recalculate totals on input changes
    form.addEventListener('input', () => this.recalcTotals(form));

    form.addEventListener('submit', e => { e.preventDefault(); this.submitForm(form); });

    container.appendChild(form);
    this.recalcTotals(form);
    return container;
  },

  addLineItemRow(container, item) {
    const row = el('div', { class: 'line-item-row' });

    const typeSel = el('select', { class: 'item-type' });
    ['Professional Fee', 'Government Fee'].forEach(t => {
      const opt = el('option', { value: t, text: t });
      if (item?.type === t) opt.selected = true;
      typeSel.appendChild(opt);
    });
    row.appendChild(typeSel);

    const descIn = el('input', { type: 'text', placeholder: 'Description', class: 'item-desc', value: item?.description || '' });
    row.appendChild(descIn);

    const amtIn = el('input', { type: 'number', placeholder: 'Amount', class: 'item-amt', value: item?.amount || '', min: 0, step: 0.01 });
    row.appendChild(amtIn);

    const removeBtn = el('button', { type: 'button', class: 'btn btn-danger btn-sm', text: '×' });
    removeBtn.addEventListener('click', () => {
      row.remove();
      const form = container.closest('form');
      if (form) this.recalcTotals(form);
    });
    row.appendChild(removeBtn);

    container.appendChild(row);
  },

  recalcTotals(form) {
    const rows = form.querySelectorAll('.line-item-row');
    let subtotal = 0;
    rows.forEach(row => {
      const amt = parseFloat(row.querySelector('.item-amt').value) || 0;
      subtotal += amt;
    });

    const subEl = form.querySelector('#inv-subtotal');
    const totEl = form.querySelector('#inv-total');
    if (subEl) subEl.textContent = formatPHP(subtotal);
    if (totEl) totEl.textContent = formatPHP(subtotal);
  },

  nextInvoiceNumber(entity) {
    const year = new Date().getFullYear();
    const prefix = entity + '-SI-' + year + '-';
    const existing = DB.getWhere('invoices', inv => inv.invoiceNumber && inv.invoiceNumber.startsWith(prefix));
    const maxNum = existing.reduce((max, inv) => {
      const parts = inv.invoiceNumber.split('-');
      const num = parseInt(parts[parts.length - 1], 10);
      return num > max ? num : max;
    }, 0);
    return prefix + String(maxNum + 1).padStart(3, '0');
  },

  submitForm(form) {
    if (!validateRequiredFields(form)) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const entity = Auth.activeEntity;

    const rows = form.querySelectorAll('.line-item-row');
    const lineItems = [];
    let subtotal = 0;
    rows.forEach(row => {
      const amt = parseFloat(row.querySelector('.item-amt').value) || 0;
      subtotal += amt;
      lineItems.push({
        type: row.querySelector('.item-type').value,
        description: row.querySelector('.item-desc').value.trim(),
        amount: amt
      });
    });

    const isNew = !this.detailId;
    const inv = isNew ? null : this.getInvoiceById(this.detailId);

    const record = {
      invoiceNumber: data.invoiceNumber,
      clientId: data.clientId,
      workRequestId: data.workRequestId || null,
      linkedTaskId: data.linkedTaskId || null,
      entity: entity,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      lineItems,
      subtotal,
      vat: 0,
      total: subtotal,
      status: isNew ? 'Draft' : (inv?.status || 'Draft'),
      payments: inv?.payments || []
    };
    if (inv) {
      // Preserve fields not in form
      record.status = inv.status;
      record.payments = inv.payments || [];
      record.paidAmount = inv.paidAmount || 0;
      record.createdBy = inv.createdBy || Auth.user.id;
    } else {
      record.createdBy = Auth.user.id;
    }

    if (isNew) {
      record.id = generateId('inv');
      record.createdAt = new Date().toISOString();
      record.updatedAt = record.createdAt;
    } else {
      record.id = this.detailId;
      record.updatedAt = new Date().toISOString();
    }

    let result = { approved: true };
    if (isNew || record.status === 'Draft') {
      if (isNew) {
        DB.insert('invoices', record);
      } else {
        DB.update('invoices', record.id, record);
      }
      // Link to WR if selected
      if (data.workRequestId) {
        const wr = DB.getById('workRequests', data.workRequestId);
        if (wr) {
          DB.update('workRequests', wr.id, { linkedInvoiceId: record.id });
        }
      }
    } else {
      result = PendingChanges.submit('invoices', record, isNew);

      if (result.approved) {
        // Clean up old WR back-link if WR changed during edit
        if (!isNew && inv && inv.workRequestId && inv.workRequestId !== (data.workRequestId || null)) {
          const oldWr = DB.getById('workRequests', inv.workRequestId);
          if (oldWr && oldWr.linkedInvoiceId === record.id) {
            DB.update('workRequests', oldWr.id, { linkedInvoiceId: null });
          }
        }

        // Link to WR if selected (only if approved)
        if (data.workRequestId) {
          const wr = DB.getById('workRequests', data.workRequestId);
          if (wr) {
            DB.update('workRequests', wr.id, { linkedInvoiceId: record.id });
          }
        }
      }
    }

    // Fulfill pending operations request if any
    const reqId = this.prefilledRequestId || (data.workRequestId ? DB.getWhere('operationsRequests', r => r.workRequestId === data.workRequestId && r.type === 'billing' && r.status === 'pending')[0]?.id : null);
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

    const isApproved = result ? result.approved : true;
    const wrName = data.workRequestId ? (DB.getById('workRequests', data.workRequestId)?.title || '') : '';
    const linkMsg = wrName ? ' Linked to "' + wrName + '".' : '';
    const msgConfig = {
      title: 'Invoice ' + (isNew ? 'Created' : 'Updated'),
      message: isApproved
        ? 'Invoice ' + record.invoiceNumber + ' has been ' + (isNew ? 'created' : 'updated') + ' successfully.' + linkMsg
        : 'Invoice ' + record.invoiceNumber + ' ' + (isNew ? 'creation' : 'update') + ' request has been submitted for Admin approval.',
      type: 'success'
    };
    closeFormPanelAndRoute('#billing', msgConfig);
  },

  showForm(invoiceId = null) {
    this.detailId = invoiceId;
    const isNew = !invoiceId;
    const inv = isNew ? null : this.getInvoiceById(invoiceId);

    openFormPanel({
      icon: '🧾',
      title: isNew ? 'Create Sales Invoice' : `Edit Invoice ${inv?.invoiceNumber || ''}`.trim(),
      formContent: this.renderForm(invoiceId),
      formId: 'invoice-form',
      actions: [
        { text: isNew ? 'Save Invoice' : 'Save Changes', class: 'btn btn-primary', type: 'submit', form: 'invoice-form' },
        { text: 'Cancel', class: 'btn btn-secondary', onClick: () => closeFormPanelAndRoute('#billing') }
      ]
    });
  },

  showRequestInvoiceModal() {
    const entity = Auth.activeEntity;
    const wrs = DB.getWhere('workRequests', wr => {
      const wrEnt = (wr.entity || '').toUpperCase();
      if (entity === 'ALL') return Auth.user.entities.map(ae => ae.toUpperCase()).includes(wrEnt);
      return wrEnt === entity.toUpperCase();
    });

    const wrapper = el('div', { style: 'display: flex; flex-direction: column; gap: var(--spacing-md); min-width: 420px; max-width: 500px;' });
    const form = el('form', { class: 'form-stacked' });

    // 1. Select Work Request
    const wrGroup = el('div', { class: 'form-group' });
    wrGroup.appendChild(el('label', { text: 'Select Work Request *' }));
    const wrSelect = el('select', { name: 'workRequestId', class: 'form-select', required: true });
    wrSelect.appendChild(el('option', { value: '', text: '— Select Work Request —' }));
    wrs.forEach(wr => {
      const client = DB.getById('clients', wr.clientId);
      const pending = DB.getWhere('operationsRequests', r => r.workRequestId === wr.id && r.type === 'billing' && r.status === 'pending');
      if (pending.length === 0) {
        wrSelect.appendChild(el('option', { value: wr.id, text: `${wr.title} — ${client?.name || '—'}` }));
      }
    });
    wrGroup.appendChild(wrSelect);
    form.appendChild(wrGroup);

    // 2. Link to Specific Task (dynamic select)
    const taskGroup = el('div', { class: 'form-group' });
    taskGroup.appendChild(el('label', { text: 'Link to Specific Task' }));
    const taskSelect = el('select', { name: 'linkedTaskId', class: 'form-select' });
    taskSelect.appendChild(el('option', { value: '', text: '— Whole Project —' }));
    taskGroup.appendChild(taskSelect);
    form.appendChild(taskGroup);

    const updateTasks = () => {
      while (taskSelect.firstChild) taskSelect.removeChild(taskSelect.firstChild);
      taskSelect.appendChild(el('option', { value: '', text: '— Whole Project —' }));
      const wrId = wrSelect.value;
      if (wrId) {
        const tasks = DB.getWhere('tasks', t => t.workRequestId === wrId) || [];
        tasks.forEach(t => {
          taskSelect.appendChild(el('option', { value: t.id, text: t.title }));
        });
      }
    };
    wrSelect.addEventListener('change', updateTasks);

    // 3. Billing Amount
    const amtGroup = el('div', { class: 'form-group' });
    amtGroup.appendChild(el('label', { text: 'Billing Amount (₱) *' }));
    const amtIn = el('input', { type: 'text', inputmode: 'decimal', name: 'amount', placeholder: '0.00', required: true });
    amtIn.addEventListener('input', () => { amtIn.value = amtIn.value.replace(/[^0-9.,]/g, ''); });
    amtIn.addEventListener('focus', () => { const n = parseFloat(String(amtIn.value).replace(/[₱$,\s]/g, '')) || 0; amtIn.value = n > 0 ? String(n) : ''; });
    amtIn.addEventListener('blur', () => { const n = parseFloat(String(amtIn.value).replace(/[₱$,\s]/g, '')) || 0; amtIn.value = n > 0 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''; });
    amtGroup.appendChild(amtIn);
    form.appendChild(amtGroup);

    // 4. Attachment / Proof
    const fileGroup = el('div', { class: 'form-group' });
    fileGroup.appendChild(el('label', { text: 'Proof of Completion (optional)' }));
    const fileIn = el('input', { type: 'file', name: 'receipt' });
    fileGroup.appendChild(fileIn);
    form.appendChild(fileGroup);

    // 5. Notes
    const notesGroup = el('div', { class: 'form-group' });
    notesGroup.appendChild(el('label', { text: 'Billing Notes (Optional)' }));
    const notesArea = el('textarea', { name: 'notes', class: 'form-control', style: 'min-height: 80px;', placeholder: 'e.g. Requesting milestone Downpayment billing...' });
    notesGroup.appendChild(notesArea);
    form.appendChild(notesGroup);

    // Footer actions
    const footer = el('div', { style: 'display: flex; justify-content: flex-end; gap: 8px; margin-top: var(--spacing-md); border-top: 1px solid var(--color-border); padding-top: var(--spacing-sm);' }, [
      el('button', { id: 'btn-cancel-opreq', class: 'btn btn-ghost', type: 'button', text: 'Cancel' }),
      el('button', { id: 'btn-save-opreq', class: 'btn btn-primary', type: 'submit', text: 'Submit Request' })
    ]);
    form.appendChild(footer);
    wrapper.appendChild(form);

    const overlay = Workflow.showModal('Request Invoice from Accounting', wrapper);

    overlay.querySelector('#btn-cancel-opreq').addEventListener('click', () => overlay.remove());

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const wrId = wrSelect.value;
      if (!wrId) {
        Workflow.showMessage('Validation Error', 'Please select a work request.', 'warning');
        return;
      }
      const wr = DB.getById('workRequests', wrId);

      const amtStr = amtIn.value;
      const amount = parseFloat(amtStr.replace(/[₱$,\s]/g, '')) || 0;
      if (amount <= 0) {
        Workflow.showMessage('Validation Error', 'Please enter a valid billing amount.', 'warning');
        return;
      }

      const linkedTaskId = taskSelect.value;
      const notes = notesArea.value.trim();
      const receiptFile = fileIn.files?.[0];

      const record = {
        id: generateId('opreq'),
        type: 'billing',
        workRequestId: wrId,
        clientId: wr.clientId,
        requestedBy: Auth.user.id,
        requestedAt: new Date().toISOString(),
        status: 'pending',
        rejectionReason: '',
        linkedTaskId: linkedTaskId || '',
        amount: amount,
        notes: notes,
        receiptFilename: receiptFile ? receiptFile.name : null
      };

      DB.insert('operationsRequests', record);
      overlay.remove();

      Workflow.showMessage(
        'Request Submitted',
        'Your invoice request has been submitted to Accounting for review.',
        'success'
      );

      App.handleRoute();
    });
  },

  // ============================================================
  // Detail View (with payment recording)
  // ============================================================
  renderDetail() {
    const inv = this.getInvoiceById(this.detailId);
    if (!inv) { location.hash = '#billing'; return el('div'); }
    const client = DB.getById('clients', inv.clientId);

    const container = el('div', { class: 'invoice-detail' });

    // Status and badges
    const statusWrap = el('div', { style: 'display:flex; gap:8px; align-items:center; margin-bottom: var(--spacing-lg);' });
    statusWrap.appendChild(this.statusBadge(inv.status));
    if (inv.fromTemplate) statusWrap.appendChild(this.recurringBadge(inv));
    container.appendChild(statusWrap);

    if (inv.status === 'Draft' && inv.rejectionReason) {
      const rejBanner = el('div', {
        class: 'alert-banner alert-danger',
        style: 'background: #fef2f2; border: 1px solid #fee2e2; color: #b91c1c; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 0.875rem; display: flex; align-items: center; gap: 8px;'
      });
      rejBanner.appendChild(el('span', { html: '❌' }));
      rejBanner.appendChild(el('span', { html: `<strong>Rejection Reason:</strong> ${inv.rejectionReason}` }));
      container.appendChild(rejBanner);
    }

    if (inv.status === 'Pending') {
      const banner = el('div', {
        class: 'alert-banner alert-warning',
        style: 'background: #fffbeb; border: 1px solid #fef3c7; color: #b45309; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 0.875rem; display: flex; align-items: center; gap: 8px;'
      });
      banner.appendChild(el('span', { html: '⚠️' }));
      banner.appendChild(el('span', { text: 'This invoice is pending administrative approval and cannot be printed, sent, or have payments recorded until approved.' }));
      container.appendChild(banner);
    }

    const meta = el('div', { class: 'invoice-meta' });
    meta.appendChild(el('p', { text: 'Client: ' + (client?.name || '—') }));
    meta.appendChild(el('p', { text: 'Issue Date: ' + formatDate(inv.issueDate) }));
    meta.appendChild(el('p', { text: 'Due Date: ' + formatDate(inv.dueDate) }));
    container.appendChild(meta);

    // Linked Work Request / Task info card
    if (inv.workRequestId) {
      const linkedWr = DB.getById('workRequests', inv.workRequestId);
      if (linkedWr) {
        const linkCard = el('div', {
          style: 'background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.15);border-radius:8px;padding:12px 16px;margin-bottom:var(--spacing-md);font-size:0.8125rem;'
        });
        const linkHeader = el('div', {
          style: 'display:flex;align-items:center;gap:6px;margin-bottom:6px;color:#1e40af;font-weight:600;'
        });
        linkHeader.appendChild(el('span', { html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>' }));
        linkHeader.appendChild(el('span', { text: 'Linked Work Request' }));
        linkCard.appendChild(linkHeader);

        const wrLink = el('a', {
          href: 'javascript:void(0)',
          text: linkedWr.title,
          style: 'color:#2563eb;font-weight:500;text-decoration:none;'
        });
        wrLink.addEventListener('click', () => {
          location.hash = '#operations/detail/' + linkedWr.id;
        });
        wrLink.addEventListener('mouseenter', () => { wrLink.style.textDecoration = 'underline'; });
        wrLink.addEventListener('mouseleave', () => { wrLink.style.textDecoration = 'none'; });
        linkCard.appendChild(wrLink);

        if (inv.linkedTaskId) {
          const linkedTask = DB.getById('tasks', inv.linkedTaskId);
          if (linkedTask) {
            linkCard.appendChild(el('div', {
              text: '↳ Scope: Task — ' + linkedTask.title,
              style: 'margin-top:4px;color:#64748b;font-size:0.75rem;'
            }));
          }
        } else {
          linkCard.appendChild(el('div', {
            text: '↳ Scope: Entire Work Request / Project',
            style: 'margin-top:4px;color:#64748b;font-size:0.75rem;'
          }));
        }

        // Show WR phase status
        linkCard.appendChild(el('div', {
          text: 'Status: ' + (linkedWr.status || '—'),
          style: 'margin-top:4px;color:#64748b;font-size:0.75rem;'
        }));
        container.appendChild(linkCard);
      }
    }

    // Line items table
    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Type', 'Description', 'Amount'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);
    const tbody = el('tbody');
    inv.lineItems.forEach(item => {
      const tr = el('tr');
      tr.appendChild(el('td', { text: item.type }));
      tr.appendChild(el('td', { text: item.description }));
      tr.appendChild(el('td', { text: formatPHP(item.amount) }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    // Totals
    const subtotal = this.getSubtotal(inv);
    const paid = this.getPaidAmount(inv);
    const totals = el('div', { class: 'invoice-totals' });
    totals.appendChild(el('div', { class: 'total-row total-grand' }, [el('span', { text: 'Total:' }), el('span', { text: formatPHP(inv.total) })]));
    totals.appendChild(el('div', { class: 'total-row' }, [el('span', { text: 'Paid:' }), el('span', { text: formatPHP(paid) })]));
    totals.appendChild(el('div', { class: 'total-row' }, [el('span', { text: 'Balance:' }), el('span', { text: formatPHP(inv.total - paid) })]));
    container.appendChild(totals);

    // Payments history
    if (Array.isArray(inv.payments) && inv.payments.length > 0) {
      const payHist = el('div', { class: 'form-section', style: 'overflow-x:auto;' });
      payHist.appendChild(el('h3', { text: 'Payment Details' }));
      inv.payments.forEach(p => {
        const pCard = el('div', { class: 'card', style: 'margin-bottom:12px; padding:16px; border:1px solid #e2e8f0; border-radius:8px;' });

        // Header row: amount left, method icon right
        const header = el('div', { style: 'display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;' });
        const amtBlock = el('div');
        amtBlock.appendChild(el('span', { text: formatPHP(p.amount), style: 'display:block; font-weight:700; font-size:1.25rem; color:#1e293b; line-height:1.2;' }));
        amtBlock.appendChild(el('span', { text: formatDate(p.date), style: 'display:block; font-size:0.75rem; color:#94a3b8; margin-top:2px;' }));
        header.appendChild(amtBlock);
        header.appendChild(this.methodIcon(p.method));
        pCard.appendChild(header);

        // Divider
        pCard.appendChild(el('div', { style: 'height:1px; background:#e2e8f0; margin:0 0 12px;' }));

        // Payment metadata rows (label : value pairs)
        const rows = el('div', { style: 'display:flex; flex-direction:column; gap:6px;' });

        const addRow = (label, value) => {
          if (!value) return;
          const row = el('div', { style: 'display:flex; justify-content:space-between; align-items:baseline; font-size:0.8125rem;' });
          row.appendChild(el('span', { text: label, style: 'color:#94a3b8; font-weight:500;' }));
          row.appendChild(el('span', { text: value, style: 'color:#334155; font-weight:600; text-align:right;' }));
          rows.appendChild(row);
        };

        if (p.reference) addRow('Reference', p.reference);
        if (p.checkNumber) addRow('Check Number', p.checkNumber);
        if (p.bankName) addRow('Bank', p.bankName);
        if (p.bankAccount) addRow('Account Number', p.bankAccount);
        if (p.transactionId) addRow('Transaction ID', p.transactionId);
        if (p.digitalAccount) addRow('Wallet / Account', p.digitalAccount);
        if (p.cardLast4) addRow('Card Number', '**** ' + p.cardLast4);

        const recorder = p.recordedBy ? DB.getById('users', p.recordedBy) : null;
        const collector = p.collectedBy ? DB.getById('users', p.collectedBy) : null;
        addRow('Recorded By', recorder ? recorder.name : '—');
        addRow('Collected By', collector ? collector.name : '—');

        pCard.appendChild(rows);

        if (p.notes) {
          pCard.appendChild(el('div', { style: 'height:1px; background:#e2e8f0; margin:12px 0;' }));
          pCard.appendChild(el('div', { text: p.notes, style: 'font-size:0.8125rem; color:#64748b; font-style:italic; line-height:1.4;' }));
        }
        payHist.appendChild(pCard);
      });
      container.appendChild(payHist);
    }

    // Payment recording
    if (Auth.can('billing:edit') && inv.status !== 'Paid' && inv.status !== 'Cancelled' && inv.status !== 'Pending') {
      const paySection = el('div', { class: 'form-section' });
      paySection.appendChild(el('h3', { text: 'Record Payment' }));
      const payForm = el('form', { class: 'form-stacked' });

      // Amount and Date (always shown)
      payForm.appendChild(el('div', { class: 'form-group' }, [
        el('label', { text: 'Amount Paid *' }),
        el('input', { type: 'number', name: 'payAmount', min: 0, step: 0.01, required: true, placeholder: `Balance remaining: ${formatPHP(inv.total - paid)}` })
      ]));
      payForm.appendChild(el('div', { class: 'form-group' }, [
        el('label', { text: 'Payment Date *' }),
        el('input', { type: 'date', name: 'payDate', value: new Date().toISOString().slice(0, 10), required: true })
      ]));

      // Payment Method
      const methodGroup = el('div', { class: 'form-group' });
      methodGroup.appendChild(el('label', { text: 'Payment Method *' }));
      const methodSel = el('select', { name: 'payMethod', required: true });
      const methods = [
        { value: '', text: '— Select Method —' },
        { value: 'Cash', text: 'Cash' },
        { value: 'Check', text: 'Check' },
        { value: 'Bank Transfer', text: 'Bank Transfer (Wire / Deposit)' },
        { value: 'GCash', text: 'GCash' },
        { value: 'Maya', text: 'Maya' },
        { value: 'Credit Card', text: 'Credit Card' },
        { value: 'Debit Card', text: 'Debit Card' },
        { value: 'PayPal', text: 'PayPal' },
        { value: 'Other Digital', text: 'Other Digital Wallet / Platform' }
      ];
      methods.forEach(m => methodSel.appendChild(el('option', { value: m.value, text: m.text })));
      methodGroup.appendChild(methodSel);
      payForm.appendChild(methodGroup);

      // Conditional field groups
      const createFieldGroup = (name, label, type = 'text', placeholder = '') =>
        el('div', { class: 'form-group pay-field-group', 'data-method': name, style: 'display:none;' }, [
          el('label', { text: label }),
          el('input', { type, name, placeholder })
        ]);

      const checkFields = el('div', { class: 'pay-check-fields', style: 'display:none;' });
      checkFields.appendChild(createFieldGroup('checkNumber', 'Check Number *', 'text', 'e.g., 0001234'));
      checkFields.appendChild(createFieldGroup('bankName', 'Bank Name *', 'text', 'e.g., BDO, BPI, Metrobank'));
      payForm.appendChild(checkFields);

      const bankFields = el('div', { class: 'pay-bank-fields', style: 'display:none;' });
      bankFields.appendChild(createFieldGroup('bankName', 'Bank Name *', 'text', 'e.g., BDO, BPI'));
      bankFields.appendChild(createFieldGroup('bankAccount', 'Bank Account Number', 'text', 'e.g., 1234-5678-9012'));
      bankFields.appendChild(createFieldGroup('transactionId', 'Transaction / Reference ID *', 'text', 'e.g., REF-2025-001'));
      payForm.appendChild(bankFields);

      const digitalFields = el('div', { class: 'pay-digital-fields', style: 'display:none;' });
      digitalFields.appendChild(createFieldGroup('transactionId', 'Transaction / Reference ID *', 'text', 'e.g., GCASH-REF-001'));
      digitalFields.appendChild(createFieldGroup('digitalAccount', 'Wallet / Account Number', 'text', 'e.g., 0917-123-4567'));
      payForm.appendChild(digitalFields);

      const cardFields = el('div', { class: 'pay-card-fields', style: 'display:none;' });
      cardFields.appendChild(createFieldGroup('cardLast4', 'Card Last 4 Digits', 'text', 'e.g., 1234'));
      cardFields.appendChild(createFieldGroup('transactionId', 'Authorization / Reference Code *', 'text', 'e.g., AUTH-XXXXXX'));
      cardFields.appendChild(createFieldGroup('bankName', 'Card Issuer / Bank', 'text', 'e.g., BDO, Metrobank'));
      payForm.appendChild(cardFields);

      // Toggle conditional fields
      methodSel.addEventListener('change', () => {
        const m = methodSel.value;
        checkFields.style.display = m === 'Check' ? 'block' : 'none';
        bankFields.style.display = m === 'Bank Transfer' ? 'block' : 'none';
        digitalFields.style.display = ['GCash','Maya','PayPal','Other Digital'].includes(m) ? 'block' : 'none';
        cardFields.style.display = ['Credit Card','Debit Card'].includes(m) ? 'block' : 'none';
      });

      // Reference / common fields
      payForm.appendChild(el('div', { class: 'form-group' }, [
        el('label', { text: 'General Reference / Receipt No.' }),
        el('input', { type: 'text', name: 'payRef', placeholder: 'Any additional reference number' })
      ]));

      payForm.appendChild(el('div', { class: 'form-group' }, [
        el('label', { text: 'Payment Notes' }),
        el('textarea', { name: 'payNotes', rows: 2, placeholder: 'e.g., Partial payment, installment #1, etc.' })
      ]));

      const collectorGroup = el('div', { class: 'form-group' });
      collectorGroup.appendChild(el('label', { text: 'Payment Collected By' }));
      const collectorSel = el('select', { name: 'payCollectedBy' });
      collectorSel.appendChild(el('option', { value: '', text: '— Select User —' }));
      DB.getAll('users').forEach(u => {
        const opt = el('option', { value: u.id, text: u.name });
        collectorSel.appendChild(opt);
      });
      collectorGroup.appendChild(collectorSel);
      payForm.appendChild(collectorGroup);

      const payBtn = el('button', { type: 'submit', class: 'btn btn-success', text: 'Record Payment' });
      payForm.appendChild(payBtn);
      payForm.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(payForm);
        const method = fd.get('payMethod');
        const payAmount = parseFloat(fd.get('payAmount')) || 0;

        // Build payment record with method-specific details
        const paymentRecord = {
          amount: payAmount,
          date: fd.get('payDate'),
          method,
          reference: fd.get('payRef') || '',
          recordedBy: Auth.user.id,
          collectedBy: fd.get('payCollectedBy') || '',
          notes: fd.get('payNotes') || '',
          recordedAt: new Date().toISOString()
        };

        // Add method-specific fields
        if (method === 'Check') {
          paymentRecord.checkNumber = fd.get('checkNumber') || '';
          paymentRecord.bankName = fd.get('bankName') || '';
        }
        if (method === 'Bank Transfer') {
          paymentRecord.bankName = fd.get('bankName') || '';
          paymentRecord.bankAccount = fd.get('bankAccount') || '';
          paymentRecord.transactionId = fd.get('transactionId') || '';
        }
        if (['GCash','Maya','PayPal','Other Digital'].includes(method)) {
          paymentRecord.transactionId = fd.get('transactionId') || '';
          paymentRecord.digitalAccount = fd.get('digitalAccount') || '';
        }
        if (['Credit Card','Debit Card'].includes(method)) {
          paymentRecord.cardLast4 = fd.get('cardLast4') || '';
          paymentRecord.transactionId = fd.get('transactionId') || '';
          paymentRecord.bankName = fd.get('bankName') || '';
        }

        const payments = inv.payments || [];
        payments.push(paymentRecord);
        const newPaid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        let newStatus = inv.status;
        if (newPaid >= inv.total) newStatus = 'Paid';
        else if (newPaid > 0 && newPaid < inv.total) newStatus = 'Partially Paid';
        DB.update('invoices', inv.id, { payments, paidAmount: newPaid, status: newStatus, updatedAt: new Date().toISOString() });
        App.handleRoute();
      });
      paySection.appendChild(payForm);
      container.appendChild(paySection);
    }

    // BIR compliance footer (visible only in print via CSS)
    const birFooter = el('div', { class: 'bir-footer', style: 'margin-top:40px; padding-top:20px; border-top:2px solid var(--color-border); display:none;' });
    birFooter.appendChild(el('p', { style: 'font-size:0.75rem; color:var(--color-text-muted); text-align:center;', text: 'This document is not valid for claim of input tax.' }));
    container.appendChild(birFooter);

    // Status actions
    const actions = el('div', { class: 'form-actions' });
    const canApprove = Auth.can('billing:approve');
    const canEdit = Auth.can('billing:edit');
    
    if (inv.status === 'Draft') {
      if (canEdit) {
        const editBtn = el('button', { class: 'btn btn-secondary', text: 'Edit Invoice', style: 'margin-right:8px;' });
        editBtn.addEventListener('click', () => {
          this.showForm(inv.id);
        });
        actions.appendChild(editBtn);

        const trashBtn = el('button', { class: 'btn btn-danger', text: 'Trash', style: 'margin-right:8px;' });
        trashBtn.addEventListener('click', () => {
          this.trashInvoice(inv.id);
        });
        actions.appendChild(trashBtn);
      }

      if (canApprove) {
        const approveBtn = el('button', { class: 'btn btn-success', text: 'Approve' });
        approveBtn.addEventListener('click', () => {
          DB.update('invoices', inv.id, { status: 'Approved', updatedAt: new Date().toISOString() });
          // Link to WR if selected
          if (inv.workRequestId) {
            const wr = DB.getById('workRequests', inv.workRequestId);
            if (wr) {
              DB.update('workRequests', wr.id, { linkedInvoiceId: inv.id });
            }
          }
          App.handleRoute();
        });
        actions.appendChild(approveBtn);
      } else if (canEdit) {
        const sendBtn = el('button', { class: 'btn btn-primary', text: 'Send for Approval' });
        sendBtn.addEventListener('click', () => {
          // Set local status to Pending
          DB.update('invoices', inv.id, { status: 'Pending', updatedAt: new Date().toISOString() });
          // Submit pending change to set status to Approved
          PendingChanges.submit('invoices', { ...inv, status: 'Approved' }, false);
          
          Workflow.showMessage('Submitted', 'Invoice has been sent for administrative approval.', 'success');
          App.handleRoute();
        });
        actions.appendChild(sendBtn);
      }
    } else if (inv.status === 'Approved' && canEdit) {
      const sentBtn = el('button', { class: 'btn btn-primary', text: 'Mark as Sent' });
      sentBtn.addEventListener('click', () => {
        DB.update('invoices', inv.id, { status: 'Sent', updatedAt: new Date().toISOString() });
        App.handleRoute();
      });
      actions.appendChild(sentBtn);
    }
    container.appendChild(actions);

    return container;
  },

  generateInvoice(inv, noLogo = false) {
    const client = DB.getById('clients', inv.clientId);
    const entity = inv.entity || 'ATA';
    const w = window.open('', '_blank');
    if (!w) return;
    const d = w.document;

    const title = d.createElement('title');
    title.textContent = 'Statement ' + inv.invoiceNumber;
    d.head.appendChild(title);

    const style = d.createElement('style');
    style.textContent = `
      @page { size: A4; margin: 15mm 20mm; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #000; max-width: 210mm; margin: 0 auto; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      
      /* Generic Header Styles */
      .generic-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 5px;
      }
      .generic-company-name {
        font-size: 15pt;
        font-weight: 800;
        color: #000;
        letter-spacing: 0.5px;
        font-family: 'Segoe UI', Arial, sans-serif;
      }
      .generic-title {
        font-size: 24pt;
        font-weight: 800;
        letter-spacing: 2px;
        color: #000;
      }
      .generic-header-divider {
        border-bottom: 2px solid #000;
        margin-bottom: 20px;
      }

      /* ATA Header Styles */
      .header-container-ata {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 5px;
      }
      .logo-area-ata {
        display: flex;
        align-items: center;
        background: linear-gradient(90deg, #e0f2fe 0%, #e0f2fe 80%, transparent 100%);
        padding: 6px 20px 6px 6px;
        border-radius: 40px 0 0 40px;
        width: 70%;
      }
      .logo-oval-ata {
        width: 110px;
        height: 65px;
        background-color: #00A3E0;
        border-radius: 50% / 50%;
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
        margin-right: 15px;
      }
      .logo-oval-ata img {
        width: 90%;
        height: 90%;
        object-fit: contain;
      }
      .company-name-ata {
        font-size: 15pt;
        font-weight: 800;
        color: #002D62;
        letter-spacing: 0.5px;
        font-family: 'Arial Black', sans-serif;
      }
      .statement-title-ata {
        font-size: 24pt;
        font-weight: 800;
        letter-spacing: 2px;
        color: #000;
      }
      .header-divider-ata {
        border-bottom: 2px solid #000;
        margin-bottom: 20px;
      }

      /* LTA Header Styles */
      .header-container-lta {
        display: flex;
        align-items: stretch;
        height: 60px;
        margin-bottom: 20px;
        border-bottom: 2px solid #000;
        padding-bottom: 6px;
      }
      .logo-banner-lta {
        display: flex;
        align-items: center;
        background-color: #007cc0;
        color: white;
        padding: 0 15px;
        flex: 1;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .logo-img-lta {
        height: 40px;
        width: 40px;
        border-radius: 4px;
        background: #fff;
        padding: 2px;
        margin-right: 12px;
        object-fit: contain;
      }
      .company-name-lta {
        font-size: 13pt;
        font-weight: 700;
        letter-spacing: 0.5px;
      }
      .slanted-block-lta {
        background-color: #1e293b;
        color: white;
        display: flex;
        align-items: center;
        padding: 0 20px 0 30px;
        font-size: 13pt;
        font-weight: 700;
        clip-path: polygon(15px 0, 100% 0, 100% 100%, 0 100%);
        margin-left: -15px;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .right-statement-lta {
        display: flex;
        align-items: center;
        padding: 0 15px;
        font-size: 20pt;
        font-weight: 800;
        color: #000;
      }

      /* Common Layout */
      .two-col {
        display: flex;
        justify-content: space-between;
        gap: 20px;
        margin-bottom: 20px;
      }
      .col-bill-to {
        border: 1.5px solid #000;
        padding: 10px;
        width: 55%;
      }
      .bill-to-title {
        font-size: 10pt;
        font-weight: 700;
        border-bottom: 1px solid #000;
        padding-bottom: 4px;
        margin-bottom: 6px;
        text-transform: uppercase;
      }
      .bill-to-content {
        font-size: 10pt;
        line-height: 1.4;
      }
      .bill-to-content p {
        margin: 2px 0;
      }
      .col-details {
        width: 40%;
        display: flex;
        align-items: flex-start;
        justify-content: flex-end;
      }
      .details-table {
        border-collapse: collapse;
        border: 1.5px solid #000;
        width: 100%;
      }
      .details-table td {
        border: 1px solid #000;
        padding: 6px 10px;
        font-size: 9pt;
      }
      .details-label {
        font-weight: 700;
        background-color: #f8fafc;
        width: 55%;
      }
      .details-value {
        text-align: right;
        font-family: monospace;
        font-size: 10pt;
      }

      /* Items Table */
      .items-table {
        width: 100%;
        border-collapse: collapse;
        margin: 20px 0;
        border: 1.5px solid #000;
      }
      .items-table th {
        border: 1px solid #000;
        padding: 8px;
        background-color: #f8fafc;
        font-weight: 700;
        font-size: 9pt;
        text-align: left;
        text-transform: uppercase;
      }
      .items-table td {
        border: 1px solid #000;
        padding: 8px;
        font-size: 10pt;
      }
      .items-table .num {
        text-align: right;
        font-family: monospace;
      }

      /* Bottom Layout */
      .bottom-container {
        display: flex;
        justify-content: space-between;
        margin-top: 20px;
        align-items: flex-start;
      }
      .payment-details-box {
        border: 1.5px solid #000;
        padding: 10px;
        width: 45%;
        font-size: 9pt;
      }
      .payment-details-title {
        font-weight: 700;
        margin-bottom: 8px;
      }
      .payment-details-row {
        display: flex;
        margin-bottom: 6px;
        align-items: baseline;
      }
      .payment-details-row span:first-child {
        margin-right: 5px;
        white-space: nowrap;
      }
      .fill-line {
        flex-grow: 1;
        border-bottom: 1px dotted #000;
        min-height: 12px;
        margin-right: 15px;
        padding-bottom: 1px;
      }
      .total-box-container {
        width: 50%;
        display: flex;
        justify-content: flex-end;
      }
      .total-table {
        border-collapse: collapse;
        border: 2px double #000;
        width: 100%;
      }
      .total-table td {
        padding: 10px;
        font-size: 11pt;
        font-weight: 700;
        border: 1px solid #000;
      }
      .total-label {
        background-color: #f8fafc;
        width: 50%;
      }
      .total-currency {
        text-align: center;
        width: 15%;
      }
      .total-value {
        text-align: right;
        width: 35%;
        font-family: monospace;
        font-size: 12pt;
      }

      /* Signatures */
      .signature-row {
        display: flex;
        justify-content: space-between;
        margin-top: 40px;
        gap: 20px;
      }
      .signature-box {
        width: 30%;
        display: flex;
        flex-direction: column;
      }
      .signature-label {
        font-size: 10pt;
        font-weight: 700;
        margin-bottom: 40px;
      }
      .signature-line-container {
        border-top: 1.5px solid #000;
        padding-top: 4px;
        text-align: center;
      }
      .signature-name-printed {
        font-size: 9pt;
        font-weight: 700;
        text-transform: uppercase;
      }

      /* Payment summary styles */
      .pay-summary {
        margin: 20px 0;
        border: 1.5px solid #cbd5e1;
        border-radius: 6px;
        padding: 15px;
        background-color: #f8fafc;
      }
      .pay-summary h4 {
        margin: 0 0 10px;
        font-size: 10pt;
        text-transform: uppercase;
        color: #475569;
        border-bottom: 1px solid #cbd5e1;
        padding-bottom: 4px;
      }
      .pay-card {
        border: 1px solid #e2e8f0;
        border-radius: 4px;
        padding: 10px;
        margin-bottom: 8px;
        background: #fff;
        font-size: 9pt;
      }
      .pay-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      /* Footer */
      .footer-container {
        margin-top: 30px;
        text-align: center;
      }
      .thank-you {
        font-size: 11pt;
        font-weight: 700;
        letter-spacing: 1px;
        margin-bottom: 4px;
      }
      .footer-text {
        font-size: 9pt;
        font-weight: bold;
      }
      .footer-text.underline {
        text-decoration: underline;
      }

      .vat-breakdown {
        background: #f8fafc;
        padding: 12px;
        border-radius: 4px;
        margin-top: 12px;
        font-size: 9pt;
        border: 1px solid #cbd5e1;
      }
      .vat-breakdown p {
        margin: 2px 0;
      }
    `;
    d.head.appendChild(style);

    const subtotal = this.getSubtotal(inv);
    const vatAmount = parseFloat(inv.vat) || 0;
    const isVat = vatAmount > 0;
    const paid = this.getPaidAmount(inv);
    const balance = inv.total - paid;
    const hasPayments = Array.isArray(inv.payments) && inv.payments.length > 0;

    let dateVal = '';
    let cashVal = '';
    let checkVal = '';
    let bankVal = '';

    if (hasPayments) {
      const p = inv.payments[0];
      if (p) {
        dateVal = p.date ? formatDate(p.date) : '';
        if (p.method === 'Cash') {
          cashVal = formatPHP(p.amount);
        } else if (p.method === 'Check') {
          checkVal = p.checkNumber || '';
          bankVal = p.bankName || '';
        } else {
          // Digital methods
          cashVal = formatPHP(p.amount);
          checkVal = p.transactionId || p.reference || '';
          bankVal = p.bankName || p.method || '';
        }
      }
    }

    let headerHtml = '';
    if (noLogo) {
      headerHtml = `
        <div class="generic-header">
          <div class="generic-company-name">${entity === 'ATA' ? 'A.T.A. BUSINESS CONSULTANCY' : 'LTA BUSINESS MANAGEMENT CORP'}</div>
          <div class="generic-title">STATEMENT</div>
        </div>
        <div class="generic-header-divider"></div>
      `;
    } else if (entity === 'ATA') {
      headerHtml = `
        <div class="header-container-ata">
          <div style="display: flex; align-items: center;">
            <img src="ERP_Assets/ATA-LOGO.jpg" alt="ATA Logo" style="height: 65px; object-fit: contain; margin-right: 12px;">
            <span class="company-name-ata">A.T.A. BUSINESS CONSULTANCY</span>
          </div>
          <div class="statement-title-ata">STATEMENT</div>
        </div>
        <div class="header-divider-ata"></div>
      `;
    } else {
      headerHtml = `
        <div class="header-container-lta">
          <div class="logo-banner-lta">
            <img src="ERP_Assets/LTA-LOGO.jpg" class="logo-img-lta" alt="LTA Logo">
            <span class="company-name-lta">LTA BUSINESS MANAGEMENT CORP</span>
          </div>
          <div class="slanted-block-lta">STATEMENT</div>
        </div>
      `;
    }

    let tableHeaders = '';
    if (noLogo || entity === 'ATA') {
      tableHeaders = `
        <tr>
          <th style="width: 15%;">DATE</th>
          <th style="width: 65%;">DESCRIPTION</th>
          <th style="width: 20%; text-align: right;">AMOUNT DUE</th>
        </tr>
      `;
    } else {
      tableHeaders = `
        <tr>
          <th style="width: 15%;">DATE</th>
          <th style="width: 55%;">DESCRIPTION</th>
          <th style="width: 10%;"></th>
          <th style="width: 20%; text-align: right;">AMOUNT DUE</th>
        </tr>
      `;
    }

    let balanceForwardRow = '';
    if (noLogo || entity === 'ATA') {
      balanceForwardRow = `
        <tr>
          <td></td>
          <td style="font-weight: bold; text-align: right;">BALANCE FORWARD:</td>
          <td></td>
        </tr>
      `;
    } else {
      balanceForwardRow = `
        <tr>
          <td></td>
          <td style="font-weight: bold; text-align: right;">BALANCE FORWARD:</td>
          <td></td>
          <td></td>
        </tr>
      `;
    }

    const lineItemsHtml = inv.lineItems.map((li, idx) => {
      const qty = parseFloat(li.qty) || 1;
      const unit = parseFloat(li.unitCost || li.amount) || 0;
      const total = qty * unit;
      const dateStr = idx === 0 ? formatDate(inv.issueDate) : '';
      let descStr = escapeHtml(li.description || '—');
      if (qty > 1) {
        descStr += ` (Qty: ${qty} x ${formatPHP(unit)})`;
      }
      if (li.type) {
        descStr = `[${escapeHtml(li.type)}] ${descStr}`;
      }

      if (noLogo || entity === 'ATA') {
        return `
          <tr>
            <td>${escapeHtml(dateStr)}</td>
            <td>${descStr}</td>
            <td class="num">${formatPHP(total)}</td>
          </tr>
        `;
      } else {
        return `
          <tr>
            <td>${escapeHtml(dateStr)}</td>
            <td>${descStr}</td>
            <td></td>
            <td class="num">${formatPHP(total)}</td>
          </tr>
        `;
      }
    }).join('');



    const vatHtml = isVat
      ? `<div class="vat-breakdown">
          <p><strong>VAT Breakdown</strong></p>
          <p>VATable Sales: ${formatPHP(subtotal)}</p>
          <p>VAT Amount (12%): ${formatPHP(vatAmount)}</p>
          <p>Total Amount Due: ${formatPHP(inv.total)}</p>
        </div>`
      : '';

    const clientNameEscaped = escapeHtml(client?.name || '—');
    const clientTradeNameEscaped = client?.tradeName ? `<p>(${escapeHtml(client.tradeName)})</p>` : '';
    const clientAddressEscaped = escapeHtml(client?.address || '—');
    const clientTinEscaped = client?.tin ? `<p>TIN: ${escapeHtml(client.tin)}</p>` : '';
    const invoiceNumberEscaped = escapeHtml(inv.invoiceNumber);
    const invoiceDateEscaped = escapeHtml(formatDate(inv.issueDate));
    const dateValEscaped = escapeHtml(dateVal);
    const cashValEscaped = escapeHtml(cashVal);
    const checkValEscaped = escapeHtml(checkVal);
    const bankValEscaped = escapeHtml(bankVal);

    d.body.innerHTML = `
      ${headerHtml}

      <div class="two-col">
        <div class="col-bill-to">
          <div class="bill-to-title">${entity === 'ATA' ? 'BILL TO' : 'BILL TO:'}</div>
          <div class="bill-to-content">
            <p><strong>${clientNameEscaped}</strong></p>
            ${clientTradeNameEscaped}
            <p>${clientAddressEscaped}</p>
            ${clientTinEscaped}
          </div>
        </div>
        <div class="col-details">
          <table class="details-table">
            <tr>
              <td class="details-label">STATEMENT NUMBER</td>
              <td class="details-value">${invoiceNumberEscaped}</td>
            </tr>
            <tr>
              <td class="details-label">STATEMENT DATE</td>
              <td class="details-value">${invoiceDateEscaped}</td>
            </tr>
          </table>
        </div>
      </div>

      <table class="items-table">
        <thead>
          ${tableHeaders}
        </thead>
        <tbody>
          ${balanceForwardRow}
          ${lineItemsHtml}
        </tbody>
      </table>

      <div class="bottom-container">
        <div class="payment-details-box">
          <div class="payment-details-title">PAYMENT DETAILS:</div>
          <div class="payment-details-row"><span>DATE:</span><span class="fill-line" style="padding-left: 5px; font-weight: bold;">${dateValEscaped}</span></div>
          <div class="payment-details-row"><span>CASH:</span><span class="fill-line" style="padding-left: 5px; font-weight: bold;">${cashValEscaped}</span></div>
          <div class="payment-details-row"><span>DATE/CHECK NO.:</span><span class="fill-line" style="padding-left: 5px; font-weight: bold;">${checkValEscaped}</span></div>
          <div class="payment-details-row"><span>BANK/BRANCH:</span><span class="fill-line" style="padding-left: 5px; font-weight: bold;">${bankValEscaped}</span></div>
        </div>
        <div class="total-box-container" style="width: 50%;">
          <table class="total-table">
            <tr>
              <td class="total-label">TOTAL AMOUNT DUE</td>
              <td class="total-currency">PHP</td>
              <td class="total-value">${formatPHP(inv.total).replace('₱', '').trim()}</td>
            </tr>
          </table>
        </div>
      </div>
      ${vatHtml}

      <div class="signature-row">
        <div class="signature-box">
          <div class="signature-label">Noted by:</div>
          <div class="signature-line-container">
            <div class="signature-name-printed">HENRY WONG</div>
          </div>
        </div>
        <div class="signature-box">
          <div class="signature-label">Prepared by:</div>
          <div class="signature-line-container">
            <div class="signature-name-printed">&nbsp;</div>
          </div>
        </div>
        <div class="signature-box">
          <div class="signature-label">Received by:</div>
          <div class="signature-line-container">
            <div class="signature-name-printed">&nbsp;</div>
          </div>
        </div>
      </div>

      <div class="footer-container">
        <div class="thank-you">THANK YOU !!!</div>
        ${entity === 'ATA'
          ? `<div class="footer-text">customer's copy</div>`
          : `<div class="footer-text underline">Should you have any enquiries concerning this statement, please contact us on 742-8582/404-4928</div>`
        }
      </div>

    `;

    setTimeout(() => w.print(), 300);
  },

  generateVoucher(inv) {
    const client = DB.getById('clients', inv.clientId);
    const entity = inv.entity || 'ATA';
    const w = window.open('', '_blank');
    if (!w) return;
    const d = w.document;

    const title = d.createElement('title');
    title.textContent = 'Payment Voucher ' + inv.invoiceNumber;
    d.head.appendChild(title);

    const style = d.createElement('style');
    style.textContent = `
      @page { size: A4; margin: 15mm 20mm; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1e293b; max-width: 210mm; margin: 0 auto; padding: 0; }
      .doc-title { text-align: center; font-size: 16pt; font-weight: 700; letter-spacing: 4px; margin: 0 0 16px; text-transform: uppercase; }
      .page-break { page-break-before: always; }
      .section { margin-bottom: 20px; }
      .section h3 { font-size: 10pt; text-transform: uppercase; color: #64748b; margin: 0 0 8px; letter-spacing: 0.5px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
      .section p { margin: 4px 0; font-size: 10pt; }
      .section strong { color: #334155; }
      .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
      .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
      .box { border: 1px solid #cbd5e1; border-radius: 4px; padding: 12px; }
      table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }
      th { background: #f8fafc; border-bottom: 2px solid #1e293b; padding: 8px; text-align: left; font-weight: 600; text-transform: uppercase; font-size: 9pt; }
      td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
      .num { text-align: right; }
      .amount-words { font-style: italic; font-size: 10pt; color: #475569; margin-top: 4px; }
      .approval-row { display: flex; justify-content: space-between; margin-top: 48px; gap: 24px; }
      .approval-box { flex: 1; text-align: center; }
      .approval-box .line { border-top: 1px solid #1e293b; margin-top: 40px; padding-top: 4px; font-size: 9pt; }
      .footer { margin-top: 24px; font-size: 8pt; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    `;
    d.head.appendChild(style);

    const subtotal = this.getSubtotal(inv);
    const paid = this.getPaidAmount(inv);
    const balance = inv.total - paid;
    const amountWords = this._numberToWords(inv.total) + ' PESOS ONLY';

    // Build dynamic payment details section
    let paymentDetailsHtml = '';
    if (Array.isArray(inv.payments) && inv.payments.length > 0) {
      // If payments exist, show each one with full details
      const payRows = inv.payments.map((p, idx) => {
        const pAmountWords = this._numberToWords(p.amount) + ' PESOS ONLY';
        let detailRows = '';
        if (p.method === 'Check') {
          detailRows = `
            <tr><td><strong>Check Number</strong></td><td>${escapeHtml(p.checkNumber || '—')}</td></tr>
            <tr><td><strong>Drawee Bank</strong></td><td>${escapeHtml(p.bankName || '—')}</td></tr>`;
        } else if (p.method === 'Bank Transfer') {
          detailRows = `
            <tr><td><strong>Bank Name</strong></td><td>${escapeHtml(p.bankName || '—')}</td></tr>
            <tr><td><strong>Account Number</strong></td><td>${escapeHtml(p.bankAccount || '—')}</td></tr>
            <tr><td><strong>Transaction Reference</strong></td><td>${escapeHtml(p.transactionId || '—')}</td></tr>`;
        } else if (['GCash','Maya','PayPal','Other Digital'].includes(p.method)) {
          detailRows = `
            <tr><td><strong>Wallet / Account</strong></td><td>${escapeHtml(p.digitalAccount || '—')}</td></tr>
            <tr><td><strong>Transaction Reference</strong></td><td>${escapeHtml(p.transactionId || '—')}</td></tr>`;
        } else if (['Credit Card','Debit Card'].includes(p.method)) {
          detailRows = `
            <tr><td><strong>Card Last 4 Digits</strong></td><td>**** ${escapeHtml(p.cardLast4 || '—')}</td></tr>
            <tr><td><strong>Authorization Code</strong></td><td>${escapeHtml(p.transactionId || '—')}</td></tr>
            <tr><td><strong>Card Issuer</strong></td><td>${escapeHtml(p.bankName || '—')}</td></tr>`;
        }
        return `
          <div class="box" style="margin-bottom:12px;">
            <p><strong>Payment ${idx + 1} — ${escapeHtml(p.method)}</strong> <span style="font-size:9pt;color:#475569;">(${formatDate(p.date)})</span></p>
            <div class="grid-2">
              <div>
                <p><strong>Amount:</strong> ${formatPHP(p.amount)}</p>
                <p class="amount-words">${escapeHtml(pAmountWords)}</p>
              </div>
              <div>
                <table style="margin:0;">${detailRows}</table>
              </div>
            </div>
            ${p.reference ? `<p style="margin-top:6px; font-size:9pt; color:#64748b;">General Ref: ${escapeHtml(p.reference)}</p>` : ''}
            ${p.notes ? `<p style="font-size:9pt; color:#64748b; font-style:italic;">Notes: ${escapeHtml(p.notes)}</p>` : ''}
          </div>`;
      }).join('');

      const remainingHtml = balance > 0
        ? `<div class="box" style="background:#fef3c7; border-color:#f59e0b;">
             <p><strong>Remaining Balance:</strong> ${formatPHP(balance)}</p>
             <p style="font-size:9pt;">Invoice is partially paid. ${inv.payments.length} payment(s) recorded.</p>
           </div>`
        : `<div class="box" style="background:#dcfce7; border-color:#10b981;">
             <p><strong>Status: FULLY PAID</strong></p>
             <p style="font-size:9pt;">All ${inv.payments.length} payment(s) have been recorded and applied.</p>
           </div>`;

      paymentDetailsHtml = `
        <div class="section">
          <h3>Payment Record</h3>
          ${payRows}
          ${remainingHtml}
        </div>`;
    } else {
      // No payments recorded — show template blanks for manual entry
      paymentDetailsHtml = `
        <div class="section">
          <h3>Payment Details</h3>
          <div class="grid-2">
            <div class="box">
              <p><strong>Amount in Figures:</strong> ${formatPHP(inv.total)}</p>
              <p class="amount-words"><strong>Amount in Words:</strong> ${escapeHtml(amountWords)}</p>
            </div>
            <div class="box">
              <p><strong>Payment Mode:</strong> ___________________</p>
              <p><strong>Check / Ref No.:</strong> ___________________</p>
              <p><strong>Bank / Platform:</strong> ___________________</p>
              <p><strong>Date:</strong> ___________________</p>
            </div>
          </div>
        </div>`;
    }

    const clientNameEscaped = escapeHtml(client?.name || '—');
    const clientTinEscaped = escapeHtml(client?.tin || '—');
    const clientAddressEscaped = escapeHtml(client?.address || '—');
    const invoiceNumberEscaped = escapeHtml(inv.invoiceNumber);

    d.body.innerHTML = `
      <div style="text-align:center; margin-bottom:4px;">
        <div style="font-size:14pt; font-weight:700; letter-spacing:1px;">${escapeHtml(entity)} Accounting Services Firm</div>
      </div>
      <div style="border-bottom:2px solid #1e293b; margin-bottom:16px;"></div>

      <div class="doc-title">Payment Voucher</div>

      <div class="grid-2">
        <div class="box">
          <h3>Voucher Details</h3>
          <p><strong>Voucher No.:</strong> PV-${invoiceNumberEscaped}</p>
          <p><strong>Date:</strong> ${formatDate(new Date().toISOString().slice(0, 10))}</p>
          <p><strong>Reference Invoice:</strong> ${invoiceNumberEscaped}</p>
        </div>
        <div class="box">
          <h3>Payee Information</h3>
          <p><strong>${clientNameEscaped}</strong></p>
          <p>TIN: ${clientTinEscaped}</p>
          <p>${clientAddressEscaped}</p>
        </div>
      </div>

      ${paymentDetailsHtml}

      <div class="section">
        <h3>Account Distribution (PFRS Chart of Accounts)</h3>
        <table>
          <thead>
            <tr><th>Account Code</th><th>Account Title</th><th>Debit</th><th>Credit</th></tr>
          </thead>
          <tbody>
            <tr><td>61010</td><td>Professional Fees Expense</td><td class="num">${formatPHP(subtotal)}</td><td class="num">—</td></tr>
            <tr><td>22010</td><td>Expanded Withholding Tax Payable (EWT)</td><td class="num">${formatPHP(Math.round(subtotal * 0.10 * 100) / 100)}</td><td class="num">—</td></tr>
            <tr><td>11010</td><td>Cash in Bank</td><td class="num">—</td><td class="num">${formatPHP(inv.total)}</td></tr>
          </tbody>
        </table>
      </div>

      <div class="section page-break">
        <h3>Supporting Documents</h3>
        <p>☐ Service Invoice No. ${invoiceNumberEscaped} dated ${formatDate(inv.issueDate)}</p>
        <p>☐ Purchase Order / Contract Reference: _________________</p>
        <p>☐ BIR Form 2307 (Certificate of Creditable Tax Withheld at Source): _________________</p>
      </div>

      <div class="approval-row">
        <div class="approval-box">
          <div class="line">Prepared By<br><span style="font-size:8pt;color:#64748b;">Signature / Printed Name / Date</span></div>
        </div>
        <div class="approval-box">
          <div class="line">Reviewed By<br><span style="font-size:8pt;color:#64748b;">Signature / Printed Name / Date</span></div>
        </div>
        <div class="approval-box">
          <div class="line">Approved By<br><span style="font-size:8pt;color:#64748b;">Signature / Printed Name / Date</span></div>
        </div>
        <div class="approval-box">
          <div class="line">Received By<br><span style="font-size:8pt;color:#64748b;">Payee Signature / Printed Name / Date</span></div>
        </div>
      </div>

      <div class="footer">
        This Payment Voucher is prepared in accordance with PFRS, RR No. 9-2009, and RMO No. 29-2002.<br>
        Retain for BIR audit trail. EWT remittance via BIR Form 1601-EQ.
      </div>
    `;

    setTimeout(() => w.print(), 300);
  },

  _numberToWords(num) {
    const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const convert = (n) => {
      if (n < 20) return ones[n];
      if (n < 100) return tens[Math.floor(n / 10)] + (n % 10 ? ' ' + ones[n % 10] : '');
      if (n < 1000) return ones[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' and ' + convert(n % 100) : '');
      if (n < 1000000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + convert(n % 1000) : '');
      if (n < 1000000000) return convert(Math.floor(n / 1000000)) + ' Million' + (n % 1000000 ? ' ' + convert(n % 1000000) : '');
      return '';
    };
    const whole = Math.floor(num);
    const dec = Math.round((num - whole) * 100);
    let result = convert(whole) || 'Zero';
    if (dec > 0) result += ' and ' + convert(dec) + ' Centavos';
    return result.toUpperCase();
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
  // Templates View
  // ============================================================
  renderTemplates() {
    const entity = Auth.activeEntity;
    const wrapper = el('div');

    const actions = el('div', { class: 'actions-bar' });
    const addBtn = el('button', { class: 'btn btn-primary', text: '+ New Template' });
    addBtn.addEventListener('click', () => this.showTemplateForm());
    actions.appendChild(addBtn);
    wrapper.appendChild(actions);

    const listContainer = el('div');
    wrapper.appendChild(listContainer);
    this.refreshTemplateList(listContainer);
    return wrapper;
  },

  refreshTemplateList(container) {
    while (container.firstChild) container.removeChild(container.firstChild);
    const entity = Auth.activeEntity;
    const templates = DB.getWhere('billingTemplates', t => t.entity === entity);
    if (templates.length === 0) {
      container.appendChild(el('p', { text: 'No billing templates found.', class: 'empty-state' }));
      return;
    }
    
    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    thead.appendChild(el('tr', {}, [
      el('th', { text: 'Template Name' }),
      el('th', { text: 'Client' }),
      el('th', { text: 'Schedule' }),
      el('th', { text: 'Fee' }),
      el('th', { text: 'Actions' })
    ]));
    table.appendChild(thead);

    const tbody = el('tbody');
    templates.forEach(t => {
      const client = DB.getById('clients', t.clientId);
      const tr = el('tr');
      tr.appendChild(el('td', { text: t.name, style: 'font-weight:600;' }));
      tr.appendChild(el('td', { text: client?.name || '—' }));
      tr.appendChild(el('td', { text: t.schedule, style: 'text-transform:capitalize;' }));
      tr.appendChild(el('td', { text: formatPHP(t.pfAmount) }));
      
      const tdAct = el('td');
      const genBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Generate' });
      genBtn.addEventListener('click', () => this.generateFromTemplate(t));
      tdAct.appendChild(genBtn);
      
      const editBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Edit', style: 'margin-left:4px;' });
      editBtn.addEventListener('click', () => this.showTemplateForm(t));
      tdAct.appendChild(editBtn);

      const delBtn = el('button', { class: 'btn btn-danger btn-sm', text: '×', style: 'margin-left:4px;' });
      delBtn.addEventListener('click', () => {
        Workflow.showConfirm('Delete Template', `Are you sure you want to delete "${t.name}"?`, () => {
          DB.delete('billingTemplates', t.id);
          App.handleRoute();
        }, 'danger');
      });
      tdAct.appendChild(delBtn);

      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  },

  showTemplateForm(existing = null) {
    const entity = Auth.activeEntity;
    const container = el('div');

    // Notion-style title section
    const titleSec = el('div', { class: 'side-pane-form-title' });
    titleSec.appendChild(el('div', { class: 'side-pane-icon', text: '📋' }));
    titleSec.appendChild(el('h2', { text: existing ? 'Edit Template' : 'New Billing Template' }));
    container.appendChild(titleSec);

    const formWrap = el('div', { class: 'side-pane-form-content' });
    const form = el('form', { class: 'form-stacked', id: 'billing-tpl-form' });
    
    form.appendChild(el('div', { class: 'form-group' }, [el('label', { text: 'Template Name *' }), el('input', { type: 'text', name: 'name', required: true, value: existing?.name || '' })]));

    const clientGroup = el('div', { class: 'form-group' });
    clientGroup.appendChild(el('label', { text: 'Client *' }));
    const clientSel = el('select', { name: 'clientId', required: true });
    clientSel.appendChild(el('option', { value: '', text: '— Select Client —' }));
    DB.getWhere('clients', c => c.entity === entity).forEach(c => {
      const opt = el('option', { value: c.id, text: c.name });
      if (existing && existing.clientId === c.id) opt.selected = true;
      clientSel.appendChild(opt);
    });
    clientGroup.appendChild(clientSel);
    form.appendChild(clientGroup);

    const schedGroup = el('div', { class: 'form-group' });
    schedGroup.appendChild(el('label', { text: 'Schedule *' }));
    const schedSel = el('select', { name: 'schedule', required: true });
    ['monthly', 'quarterly'].forEach(s => {
      const opt = el('option', { value: s, text: s });
      if (existing && existing.schedule === s) opt.selected = true;
      schedSel.appendChild(opt);
    });
    schedGroup.appendChild(schedSel);
    form.appendChild(schedGroup);

    form.appendChild(el('div', { class: 'form-group' }, [el('label', { text: 'Professional Fee Amount *' }), el('input', { type: 'number', name: 'pfAmount', min: 0, step: 0.01, required: true, value: existing?.pfAmount || '' })]));

    form.addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(form);
      const record = {
        name: fd.get('name').trim(),
        clientId: fd.get('clientId'),
        entity: entity,
        schedule: fd.get('schedule'),
        pfAmount: parseFloat(fd.get('pfAmount')) || 0,
        lineItems: [
          { type: 'Professional Fee', description: fd.get('name').trim(), amount: parseFloat(fd.get('pfAmount')) || 0 }
        ],
        updatedAt: new Date().toISOString()
      };

      if (existing) {
        DB.update('billingTemplates', existing.id, record);
      } else {
        record.id = generateId('bt');
        record.createdAt = new Date().toISOString();
        DB.insert('billingTemplates', record);
      }
      closeFormPanelAndRoute();
    });

    formWrap.appendChild(form);
    container.appendChild(formWrap);

    // Sticky footer
    const footer = el('div', { class: 'side-pane-form-footer' });
    footer.appendChild(el('button', { type: 'submit', form: 'billing-tpl-form', class: 'btn btn-primary', text: 'Save Template' }));
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => closeFormPanelAndRoute());
    footer.appendChild(cancelBtn);
    container.appendChild(footer);

    if (window.SidePaneInstance && typeof window.SidePaneInstance.open === 'function') {
      window.SidePaneInstance.open({ content: container });
    }
  },

  generateFromTemplate(t) {
    const entity = Auth.activeEntity;
    const now = new Date();
    const inv = {
      id: generateId('inv'),
      clientId: t.clientId,
      entity: entity,
      invoiceNumber: this.nextInvoiceNumber(entity),
      issueDate: now.toISOString().slice(0, 10),
      dueDate: new Date(now.getFullYear(), now.getMonth() + 1, now.getDate()).toISOString().slice(0, 10),
      status: 'Draft',
      lineItems: deepClone(t.lineItems || []),
      subtotal: t.pfAmount || 0,
      vat: 0,
      total: t.pfAmount || 0,
      paidAmount: 0,
      payments: [],
      fromTemplate: t.id,
      createdBy: Auth.user.id,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString()
    };
    DB.insert('invoices', inv);
    Workflow.showMessage('Invoice Success', 'Generated invoice ' + inv.invoiceNumber, 'success');
    this.view = 'list';
    App.handleRoute();
  },

  trashInvoice(id) {
    const inv = DB.getById('invoices', id);
    if (!inv || inv.status !== 'Draft') return;
    Workflow.showConfirm('Move to Trash',
      `Are you sure you want to move invoice "${inv.invoiceNumber}" to trash? Only Draft invoices can be trashed.`,
      () => {
        // Clean up WR backlink
        if (inv.workRequestId) {
          const wr = DB.getById('workRequests', inv.workRequestId);
          if (wr && wr.linkedInvoiceId === inv.id) {
            DB.update('workRequests', wr.id, { linkedInvoiceId: null });
          }
        }
        DB.update('invoices', id, { status: 'Cancelled', updatedAt: new Date().toISOString() });
        App.handleRoute();
      },
      'danger'
    );
  },

  restoreInvoice(id) {
    const inv = DB.getById('invoices', id);
    if (!inv || inv.status !== 'Cancelled') return;
    DB.update('invoices', id, { status: 'Draft', updatedAt: new Date().toISOString() });
    if (inv.workRequestId) {
      const wr = DB.getById('workRequests', inv.workRequestId);
      if (wr) {
        DB.update('workRequests', wr.id, { linkedInvoiceId: inv.id });
      }
    }
    App.handleRoute();
  },

  renderTrash() {
    const entity = Auth.activeEntity;
    const trashed = DB.getWhere('invoices', inv => {
      const invEnt = (inv.entity || '').toUpperCase();
      if (entity === 'ALL') {
        return Auth.user.entities.map(ae => ae.toUpperCase()).includes(invEnt);
      }
      return invEnt === entity.toUpperCase();
    }).filter(inv => inv.status === 'Cancelled');

    const container = el('div');
    const topActions = el('div', { class: 'form-header-bar', style: 'margin-bottom: var(--spacing-lg);' });
    topActions.appendChild(el('h2', { text: 'Archived Invoices' }));
    container.appendChild(topActions);

    if (trashed.length === 0) {
      container.appendChild(el('p', { text: 'Archive is empty.', class: 'empty-state' }));
      return container;
    }

    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Invoice #', 'Client', 'Issue Date', 'Total', 'Archived At', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = el('tbody');
    trashed.forEach(inv => {
      const client = DB.getById('clients', inv.clientId);
      const tr = el('tr');
      const tdInvoice = el('td');
      tdInvoice.appendChild(el('span', { text: inv.invoiceNumber }));
      if (inv.fromTemplate) tdInvoice.appendChild(this.recurringBadge(inv));
      tr.appendChild(tdInvoice);
      tr.appendChild(el('td', { text: client?.name || '—' }));
      tr.appendChild(el('td', { text: formatDate(inv.issueDate) }));
      tr.appendChild(el('td', { text: formatPHP(inv.total) }));
      tr.appendChild(el('td', { text: formatDate(inv.updatedAt) }));
      const tdAct = el('td');
      const restoreBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Restore' });
      restoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.restoreInvoice(inv.id);
      });
      tdAct.appendChild(restoreBtn);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    return container;
  },

  // ============================================================
  // Aging Report
  // ============================================================
  renderAging() {
    const entity = Auth.activeEntity;
    const today = new Date();
    const invoices = DB.getWhere('invoices', inv => inv.entity === entity && inv.status !== 'Paid' && inv.status !== 'Cancelled');

    const buckets = { '0-30': [], '31-60': [], '61-90': [], '90+': [] };
    invoices.forEach(inv => {
      const days = Math.floor((today - new Date(inv.dueDate)) / (1000 * 60 * 60 * 24));
      if (days <= 30) buckets['0-30'].push(inv);
      else if (days <= 60) buckets['31-60'].push(inv);
      else if (days <= 90) buckets['61-90'].push(inv);
      else buckets['90+'].push(inv);
    });

    const container = el('div');

    const grid = el('div', { class: 'kpi-grid' });
    Object.entries(buckets).forEach(([label, invs]) => {
      const total = invs.reduce((sum, inv) => sum + (inv.total - this.getPaidAmount(inv)), 0);
      grid.appendChild(this.kpiCard(label + ' Days', invs.length + ' invoices', formatPHP(total)));
    });
    container.appendChild(grid);

    return container;
  },

  kpiCard(label, sub, value) {
    const card = el('div', { class: 'kpi-card' });
    card.appendChild(el('div', { class: 'kpi-label', text: label }));
    card.appendChild(el('div', { class: 'kpi-sub', text: sub }));
    card.appendChild(el('div', { class: 'kpi-value', text: value }));
    return card;
  }
};
