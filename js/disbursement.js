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
      baseLink.addEventListener('click', () => { location.hash = '#disbursement'; });
      h1.appendChild(baseLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      h1.appendChild(document.createTextNode(d?.description || 'Detail'));
      titleBar.appendChild(h1);
      
      const actions = el('div', { class: 'title-bar-actions' });
      if (d) {
        const genExpBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Generate Expense PDF', style: 'margin-right:8px;' });
        genExpBtn.addEventListener('click', () => this.generateExpensePDF(d));
        actions.appendChild(genExpBtn);
        
        const genExpNoLogoBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Generate Expense PDF (No Logo)', style: 'margin-right:8px;' });
        genExpNoLogoBtn.addEventListener('click', () => this.generateExpensePDF(d, true));
        actions.appendChild(genExpNoLogoBtn);

        const genVouchBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Generate Voucher', style: 'margin-right:8px;' });
        genVouchBtn.addEventListener('click', () => this.generateVoucher(d));
        actions.appendChild(genVouchBtn);
      }
      const backBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '← Back to List' });
      backBtn.addEventListener('click', () => { location.hash = '#disbursement'; });
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
      
      const backBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '← Back to List' });
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
    if (Auth.can('disbursement:create')) {
      const addBtn = el('button', { class: 'btn btn-primary', text: 'File Expense' });
      addBtn.addEventListener('click', () => { location.hash = '#disbursement/form'; });
      actions.appendChild(addBtn);

      const templatesBtn = el('button', { class: 'btn btn-secondary', text: 'Templates' });
      templatesBtn.addEventListener('click', () => { this.view = 'templates'; App.handleRoute(); });
      actions.appendChild(templatesBtn);
    }

    const reportBtn = el('button', { class: 'btn btn-secondary', text: 'Summary Report' });
    reportBtn.addEventListener('click', () => { this.view = 'report'; App.handleRoute(); });
    actions.appendChild(reportBtn);

    if (Auth.can('disbursement:request')) {
      const reqBtn = el('button', { class: 'btn btn-primary', text: 'Request Disbursement from Accounting' });
      reqBtn.addEventListener('click', () => { Disbursement.showRequestDisbursementModal(); });
      actions.appendChild(reqBtn);
    }

    const wrapper = el('div');
    wrapper.appendChild(actions);

    // Pending operations requests banner
    if (Auth.can('disbursement:create')) {
      const pendingReqs = DB.getWhere('operationsRequests', r => r.status === 'pending' && r.type === 'disbursement');
      if (pendingReqs.length > 0) {
        const banner = el('div', { class: 'pending-requests-banner', style: 'background:linear-gradient(135deg,#fff8e1,#ffecb3);border:1px solid #ffc107;border-radius:var(--radius-md);padding:var(--spacing-md);margin-bottom:var(--spacing-md);' });
        const bannerTitle = el('div', { style: 'font-weight:600;color:#e65100;margin-bottom:var(--spacing-sm);font-size:0.95rem;' });
        bannerTitle.textContent = `⚠ ${pendingReqs.length} Pending Disbursement Request${pendingReqs.length > 1 ? 's' : ''} from Operations`;
        banner.appendChild(bannerTitle);
        pendingReqs.forEach(req => {
          const row = el('div', { style: 'display:flex;align-items:center;justify-content:space-between;padding:var(--spacing-xs) 0;border-bottom:1px solid #ffe082;' });
          const client = DB.getById('clients', req.clientId);
          const wr = DB.getById('workRequests', req.workRequestId);
          const info = el('span', { style: 'font-size:0.875rem;color:#333;' });
          info.textContent = `${client ? client.name : 'Unknown Client'} – ${wr ? wr.title : 'Unknown WR'} (requested by ${req.requestedBy || 'N/A'})`;
          row.appendChild(info);
          const fulfillBtn = el('button', { class: 'btn btn-primary', text: 'Fulfill', style: 'padding:2px 12px;font-size:0.8rem;' });
          fulfillBtn.addEventListener('click', () => { Disbursement.prefilledWrId = req.workRequestId; Disbursement.prefilledClientId = req.clientId; Disbursement.prefilledRequestId = req.id; location.hash = '#disbursement/form'; });
          row.appendChild(fulfillBtn);
          banner.appendChild(row);
        });
        wrapper.appendChild(banner);
      }
    }

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
        authBtn.addEventListener('click', () => { location.hash = '#disbursement/detail/' + d.id; });
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
    DB.getWhere('workRequests', wr => {
      const wrEnt = (wr.entity || '').toUpperCase();
      if (entity === 'ALL') {
        return Auth.user.entities.map(ae => ae.toUpperCase()).includes(wrEnt);
      }
      return wrEnt === entity.toUpperCase();
    }).forEach(wr => {
      const client = DB.getById('clients', wr.clientId);
      wrFilter.appendChild(el('option', { value: wr.id, text: wr.title + ' — ' + (client?.name || '—') }));
    });
    filtersBar.appendChild(wrapFilterFieldWithClear(wrFilter));

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
    const clientFilter = createSearchableDropdown({ placeholder: 'All Clients', options: clientOptions, maxWidth: '180px' });
    filtersBar.appendChild(clientFilter);

    const empOptions = [{ value: '', text: 'All Employees' }];
    DB.getWhere('users', u => Auth.ALL_ROLES.includes(u.role)).forEach(u => {
      empOptions.push({ value: u.id, text: u.name });
    });
    (DB.getAll('tasks') || []).forEach(t => {
      const name = (t.assigneeName || '').trim();
      if (name && !empOptions.some(opt => opt.value === name || opt.text === name)) {
        empOptions.push({ value: name, text: name });
      }
    });
    const empFilter = createSearchableDropdown({ placeholder: 'All Employees', options: empOptions, maxWidth: '180px' });
    filtersBar.appendChild(empFilter);

    const fundFilter = el('select', { class: 'form-select', style: 'max-width:150px' });
    fundFilter.appendChild(el('option', { value: '', text: 'All Funds' }));
    ['Firm Fund', 'Client Fund'].forEach(f => fundFilter.appendChild(el('option', { value: f, text: f })));
    filtersBar.appendChild(wrapFilterFieldWithClear(fundFilter));

    const statusFilter = el('select', { class: 'form-select', style: 'max-width:150px' });
    statusFilter.appendChild(el('option', { value: '', text: 'All Statuses' }));
    ['Pending', 'Approved', 'Released', 'Rejected'].forEach(s => {
      statusFilter.appendChild(el('option', { value: s, text: s }));
    });
    filtersBar.appendChild(wrapFilterFieldWithClear(statusFilter));

    const dateFrom = el('input', { type: 'date', class: 'form-select' });
    const dateTo = el('input', { type: 'date', class: 'form-select' });
    filtersBar.appendChild(el('span', { text: 'From:', style: 'font-size:0.75rem;color:var(--color-text-muted);' }));
    filtersBar.appendChild(wrapFilterFieldWithClear(dateFrom));
    filtersBar.appendChild(el('span', { text: 'To:', style: 'font-size:0.75rem;color:var(--color-text-muted);' }));
    filtersBar.appendChild(wrapFilterFieldWithClear(dateTo));

    const clearBtn = el('button', {
      class: 'btn btn-secondary btn-sm',
      html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>Clear'
    });
    clearBtn.addEventListener('click', () => {
      wrFilter.value = '';
      clientFilter.value = '';
      empFilter.value = '';
      fundFilter.value = '';
      statusFilter.value = '';
      dateFrom.value = '';
      dateTo.value = '';
      App.clearSavedFilters('disbursement');
      refresh();
    });
    filtersBar.appendChild(clearBtn);

    wrapper.appendChild(filtersBar);

    // Restore saved filters
    const savedFilters = App.restoreFilters('disbursement');
    if (savedFilters) {
      if (savedFilters.workRequest) wrFilter.value = savedFilters.workRequest;
      if (savedFilters.client) clientFilter.value = savedFilters.client;
      if (savedFilters.employee) empFilter.value = savedFilters.employee;
      if (savedFilters.fund) fundFilter.value = savedFilters.fund;
      if (savedFilters.status) statusFilter.value = savedFilters.status;
      if (savedFilters.dateFrom) dateFrom.value = savedFilters.dateFrom;
      if (savedFilters.dateTo) dateTo.value = savedFilters.dateTo;
    }

    const saveCurrentFilters = () => {
      App.saveFilters('disbursement', {
        workRequest: wrFilter.value,
        client: clientFilter.value,
        employee: empFilter.value,
        fund: fundFilter.value,
        status: statusFilter.value,
        dateFrom: dateFrom.value,
        dateTo: dateTo.value
      });
    };

    // View mode toggle
    const viewToggle = el('div', { class: 'view-mode-toggle', style: 'margin-bottom: var(--spacing-md);' });
    const viewIcons = { 'Table': ViewIcons.table, 'Board': ViewIcons.board, 'List': ViewIcons.list };
    [['Table', 'table'], ['Board', 'board'], ['List', 'list']].forEach(([label, mode]) => {
      const btn = el('button', { html: (viewIcons[label] || '') + ' ' + label, class: viewMode === mode ? 'active' : '' });
      btn.addEventListener('click', () => {
        saveCurrentFilters();
        App.setPreferredViewMode('disbursement', mode);
        App.handleRoute();
      });
      viewToggle.appendChild(btn);
    });
    wrapper.appendChild(viewToggle);

    const listContainer = el('div');
    wrapper.appendChild(listContainer);

    const refresh = () => this.refreshList(listContainer, wrFilter.value, clientFilter.value, empFilter.value, fundFilter.value, statusFilter.value, dateFrom.value, dateTo.value, viewMode, empFilter.searchText, clientFilter.searchText);
    [wrFilter, clientFilter, empFilter, fundFilter, statusFilter, dateFrom, dateTo].forEach(f => f.addEventListener('change', () => { saveCurrentFilters(); refresh(); }));
    [empFilter, clientFilter].forEach(el => el.addEventListener('input', () => { saveCurrentFilters(); refresh(); }));

    refresh();

    return wrapper;
  },

  refreshList(container, wrFilter, clientFilter, empFilter, fundFilter, statusFilter, dateFrom, dateTo, viewMode, empSearchText, clientSearchText) {
    while (container.firstChild) container.removeChild(container.firstChild);
    const entity = Auth.activeEntity;
    let items = DB.getWhere('disbursements', d => (entity === 'ALL' ? Auth.user.entities.includes(d.entity) : d.entity === entity));

    if (wrFilter) items = items.filter(d => d.linkedWorkRequestId === wrFilter);
    if (clientFilter || (clientSearchText && clientSearchText.trim() !== '')) {
      const selectedClient = clientFilter ? DB.getById('clients', clientFilter) : null;
      if (selectedClient && selectedClient.name === clientSearchText) {
        items = items.filter(d => {
          if (!d.linkedWorkRequestId) return false;
          const wr = DB.getById('workRequests', d.linkedWorkRequestId);
          return wr && wr.clientId === clientFilter;
        });
      } else if (clientSearchText && clientSearchText.trim() !== '') {
        const query = clientSearchText.trim().toLowerCase();
        items = items.filter(d => {
          if (!d.linkedWorkRequestId) return false;
          const wr = DB.getById('workRequests', d.linkedWorkRequestId);
          if (!wr) return false;
          const client = DB.getById('clients', wr.clientId);
          return client && client.name.toLowerCase().includes(query);
        });
      }
    }
    if (empSearchText && empSearchText.trim() !== '') {
      const query = empSearchText.trim().toLowerCase();
      items = items.filter(d => {
        const empId = d.employeeId || d.requestedBy;
        const u = empId ? DB.getById('users', empId) : null;
        return u && u.name.toLowerCase().includes(query);
      });
    } else if (empFilter) {
      items = items.filter(d => this.getEmployeeId(d) === empFilter);
    }
    if (fundFilter) items = items.filter(d => this.getFundSource(d) === fundFilter);
    if (statusFilter) {
      if (statusFilter === 'Pending') {
        items = items.filter(d => ['Draft', 'Submitted', 'Under Review', 'Pending'].includes(d.status));
      } else {
        items = items.filter(d => d.status === statusFilter);
      }
    }
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
      tdCat.appendChild(el('span', { text: d.category, style: 'font-weight:600;' }));
      if (d.fromTemplate) {
        tdCat.appendChild(document.createTextNode(' '));
        tdCat.appendChild(this.recurringBadge(d));
      }
      if (d.linkedWorkRequestId) {
        const wr = DB.getById('workRequests', d.linkedWorkRequestId);
        if (wr) {
          const wrWrap = el('div', { style: 'font-size: 0.725rem; color: #64748b; margin-top: 4px;' });
          wrWrap.appendChild(el('span', { text: '🔗 ' + wr.title, style: 'font-weight: 500;' }));
          if (d.linkedTaskId) {
            const task = DB.getById('tasks', d.linkedTaskId);
            if (task) {
              wrWrap.appendChild(el('span', { text: ` (Task: ${task.title})`, style: 'color: #8c9ba5; font-style: italic;' }));
            }
          } else {
            wrWrap.appendChild(el('span', { text: ' (Entire WR)', style: 'color: #8c9ba5; font-style: italic;' }));
          }
          tdCat.appendChild(wrWrap);
        }
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
      const viewBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { location.hash = '#disbursement/detail/' + d.id; });
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
      col.style.setProperty('--column-phase-color', colColor);

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
        card.addEventListener('click', () => { location.hash = '#disbursement/detail/' + d.id; });

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
        card.appendChild(el('div', { text: `${emp?.name || '—'} • ${source}`, style: 'font-size:0.875rem;color:#64748b;margin-bottom:8px;' }));

        // Linked WR/Task info
        if (d.linkedWorkRequestId) {
          const wr = DB.getById('workRequests', d.linkedWorkRequestId);
          if (wr) {
            const wrWrap = el('div', { style: 'font-size: 0.725rem; color: #1e40af; margin-bottom: 12px; background: rgba(59,130,246,0.06); border: 1px solid rgba(59,130,246,0.15); border-radius: 4px; padding: 4px 6px; width: 100%; box-sizing: border-box; word-break: break-word;' });
            wrWrap.appendChild(el('span', { text: '🔗 ' + wr.title, style: 'font-weight: 600;' }));
            if (d.linkedTaskId) {
              const task = DB.getById('tasks', d.linkedTaskId);
              if (task) {
                wrWrap.appendChild(el('span', { text: ` (Task: ${task.title})`, style: 'font-style: italic; color: #475569;' }));
              }
            } else {
              wrWrap.appendChild(el('span', { text: ' (Entire WR)', style: 'font-style: italic; color: #475569;' }));
            }
            card.appendChild(wrWrap);
          }
        }

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
      let wrMeta = '';
      if (d.linkedWorkRequestId) {
        const wr = DB.getById('workRequests', d.linkedWorkRequestId);
        if (wr) {
          wrMeta = ' • WR: ' + wr.title;
          if (d.linkedTaskId) {
            const task = DB.getById('tasks', d.linkedTaskId);
            if (task) wrMeta += ` (Task: ${task.title})`;
          } else {
            wrMeta += ' (Entire WR)';
          }
        }
      }
      left.appendChild(el('div', { class: 'list-item-meta', text: (emp?.name || '—') + ' • ' + this.getFundSource(d) + ' • ' + formatDate(d.submittedAt) + wrMeta }));
      item.appendChild(left);
      const viewBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { location.hash = '#disbursement/detail/' + d.id; });
      item.appendChild(viewBtn);
      list.appendChild(item);
    });
    container.appendChild(list);
  },

  // ============================================================
  // Expense Filing Form
  // ============================================================
  renderForm() {
    if (!Auth.can('disbursement:create')) {
      this.view = 'list';
      App.handleRoute();
      return el('div');
    }

    const entity = Auth.activeEntity;
    const isNew = !this.detailId;
    const existing = this.detailId ? DB.getById('disbursements', this.detailId) : null;
    const opReq = this.prefilledRequestId ? DB.getById('operationsRequests', this.prefilledRequestId) : null;
    const prefill = this.prefilledWrId ? { workRequestId: this.prefilledWrId, clientId: this.prefilledClientId } : null;

    const container = el('div');

    // Form header bar
    const headerBar = el('div', { class: 'form-header-bar' });
    headerBar.appendChild(el('h2', { text: isNew ? 'File Expense' : 'Edit Expense' }));
    const headerActions = el('div', { class: 'form-actions-top' });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => { location.hash = '#disbursement'; });
    headerActions.appendChild(cancelBtn);

    const saveBtnTop = el('button', { type: 'submit', class: 'btn btn-primary', text: isNew ? 'Submit Expense' : 'Save Changes', form: 'disbursement-form' });
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
      else if (!existing && opReq && opReq.category === c) opt.selected = true;
      catSel.appendChild(opt);
    });
    catGroup.appendChild(catSel);
    form.appendChild(catGroup);

    const descGroup = el('div', { class: 'form-group' });
    descGroup.appendChild(el('label', { text: 'Description *' }));
    descGroup.appendChild(el('input', { type: 'text', name: 'description', required: true, value: existing ? (existing.description || '') : (opReq ? (opReq.notes || 'Operations Disbursement Request') : '') }));
    form.appendChild(descGroup);

    const amtGroup = el('div', { class: 'form-group' });
    amtGroup.appendChild(el('label', { text: 'Amount (₱) *' }));
    amtGroup.appendChild(el('input', { type: 'number', name: 'amount', min: 0, step: 0.01, required: true, value: existing ? String(existing.amount) : (opReq ? String(opReq.amount) : '') }));
    form.appendChild(amtGroup);

    const receiptGroup = el('div', { class: 'form-group' });
    receiptGroup.appendChild(el('label', { text: 'Receipt (optional)' }));
    receiptGroup.appendChild(el('input', { type: 'file', name: 'receipt' }));
    if (existing && existing.receiptFilename) {
      receiptGroup.appendChild(el('p', { text: 'Current: ' + existing.receiptFilename, style: 'font-size:0.75rem;color:var(--color-text-muted);' }));
    } else if (!existing && opReq && opReq.receiptFilename) {
      receiptGroup.appendChild(el('p', { text: 'Requested receipt: ' + opReq.receiptFilename, style: 'font-size:0.75rem;color:var(--color-text-muted);' }));
    }
    form.appendChild(receiptGroup);

    // Linked Work Request
    const wrGroup = el('div', { class: 'form-group' });
    wrGroup.appendChild(el('label', { text: 'Linked Work Request' }));
    const wrSelAttrs = { name: 'linkedWorkRequestId', class: 'form-select' };
    if (prefill) wrSelAttrs.disabled = true;
    const wrSel = el('select', wrSelAttrs);
    wrSel.appendChild(el('option', { value: '', text: '— None —' }));
    DB.getWhere('workRequests', wr => wr.entity === entity).forEach(wr => {
      const client = DB.getById('clients', wr.clientId);
      const opt = el('option', { value: wr.id, text: wr.title + ' — ' + (client?.name || '—') });
      if (existing && existing.linkedWorkRequestId === wr.id) opt.selected = true;
      else if (!existing && prefill && prefill.workRequestId === wr.id) opt.selected = true;
      wrSel.appendChild(opt);
    });
    wrGroup.appendChild(wrSel);
    if (prefill && prefill.workRequestId) {
      wrGroup.appendChild(el('input', { type: 'hidden', name: 'linkedWorkRequestId', value: prefill.workRequestId }));
    }
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
          else if (!existing && opReq && opReq.linkedTaskId === t.id) opt.selected = true;
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
      status: isNew ? 'Submitted' : (DB.getById('disbursements', this.detailId)?.status || 'Submitted'),
      submittedAt: new Date().toISOString(),
      receiptFilename: receiptFile ? receiptFile.name : (isNew ? null : (DB.getById('disbursements', this.detailId)?.receiptFilename || null))
    };

    if (!isNew) {
      record.id = this.detailId;
      const old = DB.getById('disbursements', this.detailId);
      if (old) {
        record.createdAt = old.createdAt;
        record.submittedAt = old.submittedAt;
        record.requestedBy = old.requestedBy || Auth.user.id;
        record.paymentHandledBy = old.paymentHandledBy || '';
        record.paymentDetails = old.paymentDetails || { method: '', reference: '', bank: '', date: '', processedBy: '' };
      }
    } else {
      record.id = generateId('d');
      record.createdAt = new Date().toISOString();
    }

    // Clean up old WR link if WR changed or was removed
    const old = isNew ? null : DB.getById('disbursements', this.detailId);
    if (old && old.linkedWorkRequestId && old.linkedWorkRequestId !== (record.linkedWorkRequestId || null)) {
      const oldWr = DB.getById('workRequests', old.linkedWorkRequestId);
      if (oldWr) {
        const linkedIds = (oldWr.linkedDisbursementIds || []).filter(id => id !== record.id);
        DB.update('workRequests', oldWr.id, { linkedDisbursementIds: linkedIds });
      }
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

    if (isNew) {
      DB.insert('disbursements', record);
    } else {
      DB.update('disbursements', record.id, record);
    }

    // Fulfill pending operations request if any
    const reqId = this.prefilledRequestId || (record.linkedWorkRequestId ? DB.getWhere('operationsRequests', r => r.workRequestId === record.linkedWorkRequestId && r.type === 'disbursement' && r.status === 'pending')[0]?.id : null);
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

    location.hash = '#disbursement';
  },

  showRequestDisbursementModal() {
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
      const pending = DB.getWhere('operationsRequests', r => r.workRequestId === wr.id && r.type === 'disbursement' && r.status === 'pending');
      if (pending.length === 0) {
        wrSelect.appendChild(el('option', { value: wr.id, text: `${wr.title} — ${client?.name || '—'}` }));
      }
    });
    selectGroup.appendChild(wrSelect);
    wrapper.appendChild(selectGroup);

    const notesGroup = el('div', { class: 'form-group' });
    notesGroup.appendChild(el('label', { text: 'Additional Notes (Optional)' }));
    notesGroup.appendChild(el('textarea', { id: 'disb-opreq-notes', class: 'form-control', style: 'width: 100%; min-height: 80px;', placeholder: 'Provide any details for Accounting staff...' }));
    wrapper.appendChild(notesGroup);

    wrapper.appendChild(el('div', { style: 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;' }, [
      el('button', { id: 'btn-cancel-disb-opreq', class: 'btn btn-ghost', text: 'Cancel' }),
      el('button', { id: 'btn-save-disb-opreq', class: 'btn btn-primary', text: 'Submit Request' })
    ]));

    const overlay = Workflow.showModal('Request Disbursement', wrapper);

    overlay.querySelector('#btn-cancel-disb-opreq').addEventListener('click', () => overlay.remove());
    overlay.querySelector('#btn-save-disb-opreq').addEventListener('click', () => {
      const wrId = wrSelect.value;
      if (!wrId) { alert('Please select a work request.'); return; }
      const wr = DB.getById('workRequests', wrId);
      const notes = overlay.querySelector('#disb-opreq-notes').value.trim();
      const record = {
        id: generateId('opreq'),
        type: 'disbursement',
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
      Workflow.showMessage('Request Submitted', 'Your disbursement request has been submitted to Accounting for review.', 'success');
      App.handleRoute();
    });
  },

  // ============================================================
  // Detail View (with approval actions)
  // ============================================================
  renderDetail() {
    const d = DB.getById('disbursements', this.detailId);
    if (!d) { location.hash = '#disbursement'; return el('div'); }
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
    container.appendChild(meta);

    // Linked Work Request / Task info card
    if (d.linkedWorkRequestId) {
      const linkedWr = DB.getById('workRequests', d.linkedWorkRequestId);
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

        if (d.linkedTaskId) {
          const linkedTask = DB.getById('tasks', d.linkedTaskId);
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

        linkCard.appendChild(el('div', {
          text: 'Status: ' + (linkedWr.status || '—'),
          style: 'margin-top:4px;color:#64748b;font-size:0.75rem;'
        }));
        container.appendChild(linkCard);
      }
    }

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
    const canApprove = Auth.can('disbursement:approve');
    const isPending = ['Draft', 'Submitted', 'Under Review', 'Pending'].includes(d.status);

    if (isPending && canApprove) {
      const isRequester = Auth.isSelfApprover(this.getEmployeeId(d));
      if (isRequester) {
        container.appendChild(el('p', { class: 'field-error', text: 'You cannot approve your own expense. Wait for another Admin or Manager.' }));
      } else {
        const actions = el('div', { class: 'form-actions', style: 'margin-top: var(--spacing-xl); border-top: 1px solid #e2e8f0; padding-top: var(--spacing-lg);' });

        const approveBtn = el('button', { class: 'btn btn-success', text: 'Approve Expense' });
        approveBtn.addEventListener('click', () => {
          this.showApproveDialog(d.id);
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

  showApproveDialog(id) {
    const d = DB.getById('disbursements', id);
    if (!d) return;
    if (!['Draft', 'Submitted', 'Under Review', 'Pending'].includes(d.status)) {
      Workflow.showMessage('Error', 'This disbursement is not pending approval.', 'danger');
      return;
    }
    if (Auth.isSelfApprover(this.getEmployeeId(d))) {
      Workflow.showMessage('Conflict', 'You cannot approve your own expense.', 'warning');
      return;
    }

    const form = el('form', { class: 'form-stacked' });

    const handlerGroup = el('div', { class: 'form-group' });
    handlerGroup.appendChild(el('label', { text: 'Assign Release Handler *' }));
    const handlerSel = el('select', { name: 'handlerId', required: true, class: 'form-select' });
    handlerSel.appendChild(el('option', { value: '', text: '— Select Handler —' }));
    DB.getWhere('users', u => Auth.ALL_ROLES.includes(u.role) && u.id !== d.requestedBy).forEach(u => {
      handlerSel.appendChild(el('option', { value: u.id, text: u.name + ' (' + u.role + ')' }));
    });
    handlerGroup.appendChild(handlerSel);
    form.appendChild(handlerGroup);

    const submitBtn = el('button', { type: 'submit', class: 'btn btn-success', text: 'Approve & Assign' });
    form.appendChild(submitBtn);

    const overlay = Workflow.showModal('Approve Expense & Assign Handler', form);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validateRequiredFields(form)) return;
      const handlerId = handlerSel.value;
      if (handlerId === d.requestedBy) {
        Workflow.showMessage('Conflict', 'The requester cannot be assigned as their own release handler.', 'warning');
        return;
      }
      DB.update('disbursements', d.id, {
        status: 'Approved',
        paymentHandledBy: handlerId,
        approvedBy: Auth.user.id,
        approvedAt: new Date().toISOString()
      });
      overlay.remove();
      App.handleRoute();
    });
  },

  showReleaseDialog(id) {
    const d = DB.getById('disbursements', id);
    if (!d) return;
    if (d.status !== 'Approved') {
      Workflow.showMessage('Error', 'This disbursement is not approved for release.', 'danger');
      return;
    }
    if (d.paymentHandledBy !== Auth.user.id) {
      Workflow.showMessage('Unauthorized', 'You are not assigned to release this disbursement.', 'danger');
      return;
    }

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
  // Expense PDF & Voucher Generation (adopts billing.js format)
  // ============================================================
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

  generateExpensePDF(d, noLogo = false) {
    const emp = DB.getById('users', this.getEmployeeId(d));
    const requester = DB.getById('users', d.requestedBy);
    let approverId = d.approvedBy || d.accountingApprovedBy;
    if (!approverId && (d.status === 'Approved' || d.status === 'Released')) {
      const adminUser = DB.getWhere('users', u => u.role === 'Admin')[0];
      if (adminUser) approverId = adminUser.id;
    }
    const approver = approverId ? DB.getById('users', approverId) : null;
    const handler = d.paymentHandledBy ? DB.getById('users', d.paymentHandledBy) : null;
    const releaser = d.releasedBy ? DB.getById('users', d.releasedBy) : null;
    const wr = d.linkedWorkRequestId ? DB.getById('workRequests', d.linkedWorkRequestId) : null;
    const client = wr ? DB.getById('clients', wr.clientId) : null;
    const entity = d.entity || 'ATA';
    const w = window.open('', '_blank');
    if (!w) return;
    const doc = w.document;

    const baseHref = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
    const base = doc.createElement('base');
    base.href = baseHref;
    doc.head.appendChild(base);

    const title = doc.createElement('title');
    title.textContent = 'Expense Report ' + d.id;
    doc.head.appendChild(title);

    const style = doc.createElement('style');
    style.textContent = `
      @page { size: A4; margin: 15mm 20mm; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #1e293b; max-width: 210mm; margin: 0 auto; padding: 0; }
      .header-container { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; border-bottom: 2px solid #1e293b; padding-bottom: 12px; }
      .logo-box { display: flex; align-items: center; gap: 12px; max-height: 55px; }
      .logo-img { ${entity === 'LTA' ? 'height: 42px; margin-bottom: 5px;' : 'height: 55px;'} display: block; }
      .title-box { text-align: right; }
      .doc-title { font-size: 18pt; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #0f172a; margin: 0; }
      
      .two-col { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
      .col-left { flex: 1.2; border: 1.5px solid #1e293b; padding: 12px; border-radius: 2px; background: #fff; }
      .col-left h3 { font-size: 8.5pt; text-transform: uppercase; color: #64748b; margin: 0 0 6px 0; font-weight: 700; letter-spacing: 0.5px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
      .col-left p { margin: 2px 0; font-size: 10pt; }
      
      .col-right { flex: 0.8; display: flex; flex-direction: column; justify-content: center; font-size: 9.5pt; border: 1.5px dashed #cbd5e1; padding: 12px; border-radius: 2px; }
      .meta-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
      .meta-row:last-child { margin-bottom: 0; }
      .meta-label { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.5px; }
      .meta-val { font-weight: 700; color: #0f172a; }
      
      table { width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 10pt; }
      th { background: #f8fafc; border-top: 1.5px solid #1e293b; border-bottom: 1.5px solid #1e293b; padding: 10px 8px; text-align: left; font-weight: 700; text-transform: uppercase; font-size: 8.5pt; color: #334155; letter-spacing: 0.5px; }
      td { padding: 10px 8px; border-bottom: 1px solid #e2e8f0; color: #0f172a; }
      .num { text-align: right; }
      
      .totals-container { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 16px; gap: 20px; }
      .amount-words-box { flex: 1.2; font-size: 9pt; color: #475569; padding: 10px 0; }
      .amount-words-box strong { color: #0f172a; text-transform: uppercase; font-size: 8pt; display: block; margin-bottom: 4px; letter-spacing: 0.5px; }
      .amount-val-box { flex: 0.8; display: flex; justify-content: flex-end; align-items: center; font-weight: 700; font-size: 11pt; color: #0f172a; }
      .total-label { margin-right: 12px; font-size: 8.5pt; text-transform: uppercase; color: #475569; letter-spacing: 0.5px; }
      .total-amount-box { display: flex; border: 1.5px solid #1e293b; border-radius: 2px; }
      .total-currency { padding: 6px 12px; background: #f1f5f9; border-right: 1.5px solid #1e293b; font-size: 10pt; }
      .total-val { padding: 6px 18px; font-size: 11.5pt; min-width: 120px; text-align: right; font-family: monospace; }
      
      .bottom-layout { display: flex; justify-content: space-between; align-items: flex-start; margin-top: 30px; gap: 24px; }
      .payment-details-box { flex: 1.2; border: 1.5px solid #1e293b; padding: 12px; border-radius: 2px; font-size: 9pt; background: #fff; }
      .payment-details-box h4 { margin: 0 0 8px 0; font-size: 8.5pt; text-transform: uppercase; color: #475569; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; font-weight: 700; letter-spacing: 0.5px; }
      .payment-details-grid { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; }
      .payment-details-grid .lbl { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 7.5pt; }
      .payment-details-grid .val { color: #0f172a; font-weight: 700; }
      .payment-details-line { border-bottom: 1px solid #94a3b8; width: 120px; height: 14px; display: inline-block; }
      
      .signature-row { display: flex; justify-content: space-between; margin-top: 40px; gap: 30px; }
      .signature-box { flex: 1; text-align: center; }
      .signature-box .line { border-top: 1.5px solid #1e293b; padding-top: 6px; font-size: 9.5pt; font-weight: 700; color: #0f172a; }
      .signature-box .line span { font-size: 8pt; color: #64748b; font-weight: 500; display: block; margin-top: 2px; }
      
      .footer { margin-top: 35px; font-size: 8pt; color: #64748b; text-align: center; border-top: 1.5px solid #e2e8f0; padding-top: 12px; }
      .thank-you { font-weight: 700; font-size: 10pt; color: #334155; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px; }
    `;
    doc.head.appendChild(style);

    const isReleased = d.status === 'Released';
    const pd = d.paymentDetails || {};

    let paymentDetailsHtml = '';
    if (isReleased && pd.method) {
      paymentDetailsHtml = `
        <div class="payment-details-grid">
          <span class="lbl">Date:</span>
          <span class="val">${formatDate(pd.date || d.releasedAt)}</span>
          <span class="lbl">Method:</span>
          <span class="val">${pd.method}</span>
          <span class="lbl">Ref/Check No.:</span>
          <span class="val" style="font-family:monospace;">${pd.reference || '—'}</span>
          <span class="lbl">Bank/Branch:</span>
          <span class="val">${pd.bank || '—'}</span>
        </div>
      `;
    } else {
      paymentDetailsHtml = `
        <div class="payment-details-grid">
          <span class="lbl">Date:</span>
          <span class="payment-details-line"></span>
          <span class="lbl">Method:</span>
          <span class="payment-details-line"></span>
          <span class="lbl">Check/Ref No.:</span>
          <span class="payment-details-line"></span>
          <span class="lbl">Bank/Branch:</span>
          <span class="payment-details-line"></span>
        </div>
      `;
    }

    const amountInWords = this._numberToWords(d.amount) + ' PESOS ONLY';
    const cleanAmountString = formatPHP(d.amount).replace('₱', '').trim();

    const thankYouText = 'THANK YOU !!!';
    const entityFooterContact = entity === 'LTA' 
      ? 'Should you have any enquiries concerning this statement, please contact us on 742-8582/404-4928.<br>' 
      : '';

    doc.body.innerHTML = `
      <div class="header-container" style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; border-bottom: 2px solid #1e293b; padding-bottom: 12px;">
        <div class="logo-box">
          ${noLogo ? '' : `<img class="logo-img" src="ERP_Assets/${entity === 'LTA' ? 'LTA-LOGO.jpg' : 'ATA-LOGO.jpg'}" alt="${entity} Logo">`}
          <span style="font-size: 14pt; font-weight: 700; color: #0f172a; letter-spacing: 0.5px; white-space: nowrap;">${entity} Accounting Services Firm</span>
        </div>
        <div class="title-box">
          <h1 class="doc-title">Expense Report</h1>
        </div>
      </div>

      <div class="two-col">
        <div class="col-left">
          <h3>Employee / Requester</h3>
          <p><strong>${emp?.name || '—'}</strong></p>
          <p style="color: #475569; font-size: 9pt; margin-top: 4px;">${requester?.email || '—'}</p>
          <p style="color: #64748b; font-size: 8.5pt; margin-top: 2px;">Requested By: ${requester?.name || '—'}</p>
        </div>
        <div class="col-right">
          <div class="meta-row">
            <span class="meta-label">Ref No.:</span>
            <span class="meta-val">${d.id}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Date Submitted:</span>
            <span class="meta-val">${formatDate(d.submittedAt)}</span>
          </div>
          ${wr ? `
          <div class="meta-row" style="margin-top: 6px; border-top: 1px dashed #cbd5e1; padding-top: 6px;">
            <span class="meta-label">Project Code:</span>
            <span class="meta-val" style="font-size: 8.5pt;">${wr.title || '—'}</span>
          </div>
          ` : ''}
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th>Category</th>
            <th>Description</th>
            <th>Fund Source</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="font-weight: 600;">${d.category}</td>
            <td>${d.description}</td>
            <td>${this.getFundSource(d)}</td>
            <td class="num" style="font-weight: 700; font-family: monospace;">${formatPHP(d.amount)}</td>
          </tr>
        </tbody>
      </table>

      <div class="totals-container">
        <div class="amount-words-box">
          <strong>Amount in Words</strong>
          ${amountInWords}
        </div>
        <div class="amount-val-box">
          <span class="total-label">Total Amount:</span>
          <div class="total-amount-box">
            <div class="total-currency">PHP</div>
            <div class="total-val">${cleanAmountString}</div>
          </div>
        </div>
      </div>

      <div class="bottom-layout">
        <div class="payment-details-box">
          <h4>Payment Details</h4>
          ${paymentDetailsHtml}
        </div>
      </div>

      <div class="signature-row">
        <div class="signature-box">
          <div style="height: 50px;"></div>
          <div class="line">
            ${emp?.name || '—'}
            <span>Prepared By / Date</span>
          </div>
        </div>
        <div class="signature-box">
          <div style="height: 50px;"></div>
          <div class="line">
            ${approver?.name || '—'}
            <span>Approved By / Date</span>
          </div>
        </div>
        <div class="signature-box">
          <div style="height: 50px;"></div>
          <div class="line">
            ${releaser ? releaser.name : (handler ? handler.name : '________________________')}
            <span>Released By / Date</span>
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="thank-you">${thankYouText}</div>
        ${noLogo ? '' : entityFooterContact}
        This Expense Report is issued for internal audit and reimbursement tracking purposes.<br>
        <span style="font-weight: 600; text-transform: uppercase; font-size: 7.5pt; letter-spacing: 0.5px; color: #475569; display: block; margin-top: 4px;">This document is not valid for claim of input tax.</span>
      </div>
    `;

    setTimeout(() => w.print(), 300);
  },

  generateVoucher(d) {
    const noLogo = true;
    const emp = DB.getById('users', this.getEmployeeId(d));
    const requester = DB.getById('users', d.requestedBy);
    let approverId = d.approvedBy || d.accountingApprovedBy;
    if (!approverId && (d.status === 'Approved' || d.status === 'Released')) {
      const adminUser = DB.getWhere('users', u => u.role === 'Admin')[0];
      if (adminUser) approverId = adminUser.id;
    }
    const approver = approverId ? DB.getById('users', approverId) : null;
    const handler = d.paymentHandledBy ? DB.getById('users', d.paymentHandledBy) : null;
    const releaser = d.releasedBy ? DB.getById('users', d.releasedBy) : null;
    const wr = d.linkedWorkRequestId ? DB.getById('workRequests', d.linkedWorkRequestId) : null;
    const client = wr ? DB.getById('clients', wr.clientId) : null;
    const entity = d.entity || 'ATA';
    const w = window.open('', '_blank');
    if (!w) return;
    const doc = w.document;

    const baseHref = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
    const base = doc.createElement('base');
    base.href = baseHref;
    doc.head.appendChild(base);

    const title = doc.createElement('title');
    title.textContent = 'Payment Voucher ' + d.id;
    doc.head.appendChild(title);

    const style = doc.createElement('style');
    style.textContent = `
      @page { size: A4; margin: 15mm 20mm; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 10.5pt; line-height: 1.5; color: #1e293b; max-width: 210mm; margin: 0 auto; padding: 0; }
      .header-container { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; border-bottom: 2px solid #1e293b; padding-bottom: 12px; }
      .logo-box { display: flex; align-items: center; gap: 12px; max-height: 55px; }
      .logo-img { ${entity === 'LTA' ? 'height: 42px; margin-bottom: 5px;' : 'height: 55px;'} display: block; }
      .title-box { text-align: right; }
      .doc-title { font-size: 18pt; font-weight: 700; letter-spacing: 4px; text-transform: uppercase; color: #0f172a; margin: 0; }
      
      .page-break { page-break-before: always; }
      
      .two-col { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
      .col-left { flex: 1.2; border: 1.5px solid #1e293b; padding: 12px; border-radius: 2px; background: #fff; }
      .col-left h3 { font-size: 8.5pt; text-transform: uppercase; color: #64748b; margin: 0 0 6px 0; font-weight: 700; letter-spacing: 0.5px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
      .col-left p { margin: 2px 0; font-size: 10pt; }
      
      .col-right { flex: 0.8; display: flex; flex-direction: column; justify-content: center; font-size: 9.5pt; border: 1.5px dashed #cbd5e1; padding: 12px; border-radius: 2px; }
      .meta-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
      .meta-row:last-child { margin-bottom: 0; }
      .meta-label { color: #64748b; font-weight: 600; text-transform: uppercase; font-size: 8pt; letter-spacing: 0.5px; }
      .meta-val { font-weight: 700; color: #0f172a; }
      
      .section { margin-bottom: 20px; }
      .section h3 { font-size: 9pt; text-transform: uppercase; color: #475569; margin: 0 0 8px; letter-spacing: 0.5px; border-bottom: 1.5px solid #cbd5e1; padding-bottom: 4px; font-weight: 700; }
      .section p { margin: 4px 0; font-size: 9.5pt; }
      
      .grid-2 { display: grid; grid-template-columns: 1.2fr 0.8fr; gap: 16px; margin-bottom: 12px; }
      .box { border: 1.5px solid #1e293b; border-radius: 2px; padding: 12px; background: #fff; }
      
      table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 10pt; }
      th { background: #f8fafc; border-top: 1.5px solid #1e293b; border-bottom: 1.5px solid #1e293b; padding: 8px; text-align: left; font-weight: 700; text-transform: uppercase; font-size: 8.5pt; color: #334155; }
      td { padding: 8px; border-bottom: 1px solid #e2e8f0; color: #0f172a; }
      .num { text-align: right; }
      
      .totals-container { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; gap: 20px; }
      .amount-words { font-style: italic; font-size: 9pt; color: #475569; }
      .total-amount-box { display: flex; border: 1.5px solid #1e293b; border-radius: 2px; }
      .total-currency { padding: 4px 10px; background: #f1f5f9; border-right: 1.5px solid #1e293b; font-size: 9.5pt; font-weight: 700; }
      .total-val { padding: 4px 14px; font-size: 11pt; min-width: 100px; text-align: right; font-family: monospace; font-weight: 700; }
      
      .payment-status-box { border: 1.5px solid #cbd5e1; border-radius: 2px; background: #f8fafc; padding: 10px; margin-top: 8px; color: #1e293b; font-size: 9pt; }
      
      .approval-row { display: flex; justify-content: space-between; margin-top: 40px; gap: 20px; }
      .approval-box { flex: 1; text-align: center; }
      .approval-box .line { border-top: 1.5px solid #1e293b; padding-top: 6px; font-size: 9pt; font-weight: 700; color: #0f172a; }
      .approval-box .line span { font-size: 8pt; color: #64748b; font-weight: 500; display: block; margin-top: 2px; }
      
      .footer { margin-top: 30px; font-size: 8pt; color: #64748b; text-align: center; border-top: 1.5px solid #e2e8f0; padding-top: 10px; }
      .thank-you { font-weight: 700; font-size: 10pt; color: #334155; margin-bottom: 4px; text-transform: uppercase; letter-spacing: 1px; }
    `;
    doc.head.appendChild(style);

    const amountWords = this._numberToWords(d.amount) + ' PESOS ONLY';
    const isReleased = d.status === 'Released';
    const pd = d.paymentDetails || {};
    const cleanAmountString = formatPHP(d.amount).replace('₱', '').trim();

    let paymentDetailsHtml = '';
    if (isReleased && pd.method) {
      const methodCfg = PaymentIcons;
      const def = methodCfg['Other Digital'];
      const cfg = methodCfg[pd.method] || def;

      let detailRows = '';
      const addRow = (label, value) => {
        if (!value) return '';
        return `<div style="display:flex; justify-content:space-between; align-items:baseline; font-size:8.5pt; padding:3px 0; border-bottom: 1px dashed #f1f5f9;">
          <span style="color:#64748b; font-weight:600; text-transform:uppercase; font-size:7.5pt;">${label}</span>
          <span style="color:#0f172a; font-weight:700;">${value}</span>
        </div>`;
      };

      if (pd.reference) detailRows += addRow('Reference / Check No.', pd.reference);
      if (pd.bank) detailRows += addRow('Bank', pd.bank);
      detailRows += addRow('Released By', releaser ? releaser.name : (handler ? handler.name : '—'));
      detailRows += addRow('Date of Release', formatDate(pd.date || d.releasedAt));

      paymentDetailsHtml = `
        <div class="section">
          <h3>Payment Record</h3>
          <div class="grid-2">
            <div class="box" style="display: flex; flex-direction: column; justify-content: space-between;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                <div>
                  <div style="font-weight:700; font-size:1.15rem; color:#0f172a; line-height:1.2; font-family: monospace;">${formatPHP(d.amount)}</div>
                  <div style="font-size:7.5pt; color:#64748b; margin-top:2px;">Released on ${formatDate(pd.date || d.releasedAt)}</div>
                </div>
                <span style="display:inline-flex; align-items:center; gap:6px; padding:3px 8px; border-radius:12px; font-size:7.5pt; font-weight:700; color:${cfg.color}; background:${cfg.bg}; letter-spacing:0.3px; border: 1px solid ${cfg.color}33;">
                  ${cfg.label}
                </span>
              </div>
              <div style="height:1px; background:#e2e8f0; margin:4px 0 8px;"></div>
              <div style="display:flex; flex-direction:column; gap:4px;">${detailRows}</div>
            </div>
            <div class="payment-status-box" style="display: flex; flex-direction: column; justify-content: center; height: 100%; box-sizing: border-box;">
              <p style="margin: 0; font-size:9.5pt; line-height: 1.5; color: #1e293b;">Payment has been authorized by <strong>${approver?.name || 'Authorized Approver'}</strong> and released by <strong>${releaser?.name || handler?.name || 'assigned handler'}</strong>.</p>
            </div>
          </div>
        </div>`;
    } else {
      paymentDetailsHtml = `
        <div class="section">
          <h3>Payment Details</h3>
          <div class="grid-2">
            <div class="box" style="display: flex; flex-direction: column; justify-content: space-between;">
              <p style="margin: 0 0 8px 0; font-size: 9.5pt;"><strong>Amount in Figures:</strong> <span style="font-family: monospace; font-weight: 700;">${formatPHP(d.amount)}</span></p>
              <p class="amount-words" style="margin: 0;"><strong>Amount in Words:</strong> <span style="font-weight: 600;">${amountWords}</span></p>
            </div>
            <div class="box" style="display: flex; flex-direction: column; gap: 4px; font-size: 8.5pt;">
              <div style="display: flex; justify-content: space-between;"><span style="color:#64748b; font-weight:600; text-transform:uppercase; font-size:7.5pt;">Payment Mode:</span> <span style="border-bottom: 1px solid #94a3b8; width: 100px; height: 12px; display: inline-block;"></span></div>
              <div style="display: flex; justify-content: space-between;"><span style="color:#64748b; font-weight:600; text-transform:uppercase; font-size:7.5pt;">Check / Ref No.:</span> <span style="border-bottom: 1px solid #94a3b8; width: 100px; height: 12px; display: inline-block;"></span></div>
              <div style="display: flex; justify-content: space-between;"><span style="color:#64748b; font-weight:600; text-transform:uppercase; font-size:7.5pt;">Bank / Platform:</span> <span style="border-bottom: 1px solid #94a3b8; width: 100px; height: 12px; display: inline-block;"></span></div>
              <div style="display: flex; justify-content: space-between;"><span style="color:#64748b; font-weight:600; text-transform:uppercase; font-size:7.5pt;">Date:</span> <span style="border-bottom: 1px solid #94a3b8; width: 100px; height: 12px; display: inline-block;"></span></div>
            </div>
          </div>
        </div>`;
    }

    const thankYouText = 'THANK YOU !!!';
    const entityFooterContact = entity === 'LTA' 
      ? 'Should you have any enquiries concerning this statement, please contact us on 742-8582/404-4928.<br>' 
      : '';

    doc.body.innerHTML = `
      <div class="header-container" style="display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 20px; border-bottom: 2px solid #1e293b; padding-bottom: 12px;">
        <div class="logo-box">
          ${noLogo ? '' : `<img class="logo-img" src="ERP_Assets/${entity === 'LTA' ? 'LTA-LOGO.jpg' : 'ATA-LOGO.jpg'}" alt="${entity} Logo">`}
          <span style="font-size: 14pt; font-weight: 700; color: #0f172a; letter-spacing: 0.5px; white-space: nowrap;">${entity} Accounting Services Firm</span>
        </div>
        <div class="title-box">
          <h1 class="doc-title">Payment Voucher</h1>
        </div>
      </div>

      <div class="two-col">
        <div class="col-left">
          <h3>Payee Information</h3>
          <p><strong>${emp?.name || '—'}</strong></p>
          <p style="color: #475569; font-size: 9pt; margin-top: 4px;">${requester?.email || '—'}</p>
          <p style="color: #64748b; font-size: 8.5pt; margin-top: 2px;">Fund Source: ${this.getFundSource(d)}</p>
        </div>
        <div class="col-right">
          <div class="meta-row">
            <span class="meta-label">Voucher No.:</span>
            <span class="meta-val">PV-${d.id}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Date:</span>
            <span class="meta-val">${formatDate(new Date().toISOString().slice(0, 10))}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Expense Ref:</span>
            <span class="meta-val">${d.id}</span>
          </div>
          <div class="meta-row">
            <span class="meta-label">Category:</span>
            <span class="meta-val">${d.category}</span>
          </div>
        </div>
      </div>

      ${paymentDetailsHtml}

      <div class="section">
        <h3>Account Distribution (PFRS Chart of Accounts)</h3>
        <table>
          <thead>
            <tr>
              <th>Account Code</th>
              <th>Account Title</th>
              <th class="num">Debit</th>
              <th class="num">Credit</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style="font-family: monospace;">61010</td>
              <td>${d.category} Expense</td>
              <td class="num" style="font-family: monospace;">${formatPHP(d.amount)}</td>
              <td class="num">—</td>
            </tr>
            <tr>
              <td style="font-family: monospace;">11010</td>
              <td>Cash in Bank / Petty Cash</td>
              <td class="num">—</td>
              <td class="num" style="font-family: monospace;">${formatPHP(d.amount)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="section page-break">
        <h3>Supporting Documents</h3>
        <p style="font-size: 9pt; color: #334155; margin: 6px 0;">☐ Expense Report Ref. ${d.id} dated ${formatDate(d.submittedAt)}</p>
        <p style="font-size: 9pt; color: #334155; margin: 6px 0;">☐ Receipt / Proof of Payment: <span style="font-family: monospace; font-weight: 600;">${d.receiptFilename || '_________________'}</span></p>
        <p style="font-size: 9pt; color: #334155; margin: 6px 0;">☐ Work Request: <span style="font-weight: 600;">${wr?.title || '—'}</span></p>
        <p style="font-size: 9pt; color: #334155; margin: 6px 0;">☐ Release Document: <span style="font-family: monospace; font-weight: 600;">${d.releaseFilename || '_________________'}</span></p>
      </div>

      <div class="approval-row">
        <div class="approval-box">
          <div style="height: 45px;"></div>
          <div class="line">
            ${emp?.name || '—'}
            <span>Prepared By / Date</span>
          </div>
        </div>
        <div class="approval-box">
          <div style="height: 45px;"></div>
          <div class="line">
            HENRY WONG
            <span>Reviewed By / Date</span>
          </div>
        </div>
        <div class="approval-box">
          <div style="height: 45px;"></div>
          <div class="line">
            ${approver?.name || '—'}
            <span>Approved By / Date</span>
          </div>
        </div>
        <div class="approval-box">
          <div style="height: 45px;"></div>
          <div class="line">
            ${releaser ? releaser.name : (handler ? handler.name : '________________________')}
            <span>Released By / Date</span>
          </div>
        </div>
        <div class="approval-box">
          <div style="height: 45px;"></div>
          <div class="line">
            ________________________
            <span>Received By / Date</span>
          </div>
        </div>
      </div>

      <div class="footer">
        <div class="thank-you">${thankYouText}</div>
        ${noLogo ? '' : entityFooterContact}
        This Payment Voucher is prepared in accordance with PFRS, RR No. 9-2009, and RMO No. 29-2002.<br>
        Retain for BIR audit trail. ${noLogo ? '' : `Original copy retained by ${entity} Accounting Services Firm.<br>`}
        <span style="font-weight: 600; text-transform: uppercase; font-size: 7.5pt; letter-spacing: 0.5px; color: #475569; display: block; margin-top: 4px;">This document is not valid for claim of input tax.</span>
      </div>
    `;

    setTimeout(() => w.print(), 300);
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
    const container = el('div');

    // Notion-style title section
    const titleSec = el('div', { class: 'side-pane-form-title' });
    titleSec.appendChild(el('div', { class: 'side-pane-icon', text: '📋' }));
    titleSec.appendChild(el('h2', { text: 'New Disbursement Template' }));
    container.appendChild(titleSec);

    const formWrap = el('div', { class: 'side-pane-form-content' });
    const form = el('form', { class: 'form-stacked', id: 'disb-tpl-form' });

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
      window.SidePaneInstance.close();
      this.view = 'templates';
      App.handleRoute();
    });

    formWrap.appendChild(form);
    container.appendChild(formWrap);

    // Sticky footer
    const footer = el('div', { class: 'side-pane-form-footer' });
    footer.appendChild(el('button', { type: 'submit', form: 'disb-tpl-form', class: 'btn btn-primary', text: 'Save Template' }));
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => window.SidePaneInstance.close());
    footer.appendChild(cancelBtn);
    container.appendChild(footer);

    window.SidePaneInstance.open({ content: container });
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
    const topBackBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '← Back to List' });
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
