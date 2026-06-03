/**
 * Billing Module
 * Sales Invoice creation, payment tracking, aging.
 * VAT removed per v3 schema — total = subtotal.
 */

const Billing = {
  view: 'list', // 'list' | 'form' | 'detail' | 'aging' | 'templates'
  detailId: null,

  render() {
    const container = el('div', { class: 'page' });
    
    if (this.view === 'detail' && this.detailId) {
      const inv = DB.getById('invoices', this.detailId);
      const titleBar = el('div', { class: 'page-title-bar-v2' });
      const h1 = el('h1', { class: 'breadcrumb-h1' });
      const baseLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Billing' });
      baseLink.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
      h1.appendChild(baseLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      h1.appendChild(document.createTextNode(inv?.invoiceNumber || 'Detail'));
      titleBar.appendChild(h1);

      const actions = el('div', { class: 'title-bar-actions' });
      if (inv && inv.status !== 'Draft') {
        const genInvBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Generate Invoice', style: 'margin-right:8px;' });
        genInvBtn.addEventListener('click', () => this.generateInvoice(inv));
        actions.appendChild(genInvBtn);
        const genVouchBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'Generate Voucher', style: 'margin-right:8px;' });
        genVouchBtn.addEventListener('click', () => this.generateVoucher(inv));
        actions.appendChild(genVouchBtn);
      }
      const backBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to Invoices' });
      backBtn.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
      actions.appendChild(backBtn);
      titleBar.appendChild(actions);
      container.appendChild(titleBar);
    } else if (this.view === 'templates') {
      const titleBar = el('div', { class: 'page-title-bar-v2' });
      const h1 = el('h1', { class: 'breadcrumb-h1' });
      const baseLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Billing' });
      baseLink.addEventListener('click', () => { this.view = 'list'; App.handleRoute(); });
      h1.appendChild(baseLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      h1.appendChild(document.createTextNode('Templates'));
      titleBar.appendChild(h1);

      const backBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to Invoices' });
      backBtn.addEventListener('click', () => { this.view = 'list'; App.handleRoute(); });
      titleBar.appendChild(backBtn);
      container.appendChild(titleBar);
    } else if (this.view === 'trash') {
      const titleBar = el('div', { class: 'page-title-bar-v2' });
      const h1 = el('h1', { class: 'breadcrumb-h1' });
      const baseLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Billing' });
      baseLink.addEventListener('click', () => { this.view = 'list'; App.handleRoute(); });
      h1.appendChild(baseLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      h1.appendChild(document.createTextNode('Trash'));
      titleBar.appendChild(h1);

      const backBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to Invoices' });
      backBtn.addEventListener('click', () => { this.view = 'list'; App.handleRoute(); });
      titleBar.appendChild(backBtn);
      container.appendChild(titleBar);
    } else {
      container.appendChild(el('h1', { text: 'Billing' }));
    }

    if (this.view === 'list') container.appendChild(this.renderList());
    else if (this.view === 'form') container.appendChild(this.renderForm());
    else if (this.view === 'detail') container.appendChild(this.renderDetail());
    else if (this.view === 'aging') container.appendChild(this.renderAging());
    else if (this.view === 'templates') container.appendChild(this.renderTemplates());
    else if (this.view === 'trash') container.appendChild(this.renderTrash());

    return container;
  },

  init() {},

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

    // Header bar
    const headerBar = el('div', { class: 'form-header-bar' });
    headerBar.appendChild(el('h2', { text: 'Invoices' }));
    const topActions = el('div', { class: 'form-actions-top' });
    const addBtn = el('button', { class: 'btn btn-primary', text: 'Create Invoice' });
    addBtn.addEventListener('click', () => { this.view = 'form'; this.detailId = null; App.handleRoute(); });
    topActions.appendChild(addBtn);
    const templatesBtn = el('button', { class: 'btn btn-ghost', text: 'Templates' });
    templatesBtn.addEventListener('click', () => { this.view = 'templates'; App.handleRoute(); });
    topActions.appendChild(templatesBtn);
    const agingBtn = el('button', { class: 'btn btn-ghost', text: 'Aging Report' });
    agingBtn.addEventListener('click', () => { this.view = 'aging'; App.handleRoute(); });
    topActions.appendChild(agingBtn);
    const trashBtn = el('button', { class: 'btn btn-ghost', text: 'Trash' });
    trashBtn.addEventListener('click', () => { this.view = 'trash'; App.handleRoute(); });
    topActions.appendChild(trashBtn);
    headerBar.appendChild(topActions);
    wrapper.appendChild(headerBar);

    // Filters
    const filters = el('div', { class: 'filters-bar' });
    const wrFilter = el('select', { class: 'form-select' });
    wrFilter.appendChild(el('option', { value: '', text: 'All Work Requests' }));
    DB.getWhere('workRequests', wr => wr.entity === entity).forEach(wr => {
      wrFilter.appendChild(el('option', { value: wr.id, text: wr.title }));
    });
    filters.appendChild(wrFilter);

    const clientFilter = el('select', { class: 'form-select' });
    clientFilter.appendChild(el('option', { value: '', text: 'All Clients' }));
    DB.getWhere('clients', c => c.entity === entity).forEach(c => {
      clientFilter.appendChild(el('option', { value: c.id, text: c.name }));
    });
    filters.appendChild(clientFilter);

    const empFilter = el('select', { class: 'form-select' });
    empFilter.appendChild(el('option', { value: '', text: 'All Employees' }));
    DB.getWhere('users', u => u.entities?.map(e => e.toUpperCase()).includes(entity)).forEach(u => {
      empFilter.appendChild(el('option', { value: u.id, text: u.name }));
    });
    filters.appendChild(empFilter);

    const dateFrom = el('input', { type: 'date', class: 'form-select' });
    const dateTo = el('input', { type: 'date', class: 'form-select' });
    filters.appendChild(el('span', { text: 'From', style: 'font-size:0.875rem;color:var(--color-text-muted);' }));
    filters.appendChild(dateFrom);
    filters.appendChild(el('span', { text: 'To', style: 'font-size:0.875rem;color:var(--color-text-muted);' }));
    filters.appendChild(dateTo);

    const statusFilter = el('select', { class: 'form-select' });
    statusFilter.appendChild(el('option', { value: '', text: 'All Statuses' }));
    ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'].forEach(s => {
      statusFilter.appendChild(el('option', { value: s, text: s }));
    });
    filters.appendChild(statusFilter);

    wrapper.appendChild(filters);

    // View mode toggle
    const viewMode = App.getPreferredViewMode('billing') || 'table';
    const vmToggle = el('div', { class: 'view-mode-toggle', style: 'margin-bottom:var(--spacing-md);' });
    const vmTable = el('button', { text: 'Table', class: viewMode === 'table' ? 'active' : '' });
    const vmBoard = el('button', { text: 'Board', class: viewMode === 'board' ? 'active' : '' });
    const vmList = el('button', { text: 'List', class: viewMode === 'list' ? 'active' : '' });
    vmTable.addEventListener('click', () => { App.setPreferredViewMode('billing', 'table'); App.handleRoute(); });
    vmBoard.addEventListener('click', () => { App.setPreferredViewMode('billing', 'board'); App.handleRoute(); });
    vmList.addEventListener('click', () => { App.setPreferredViewMode('billing', 'list'); App.handleRoute(); });
    vmToggle.appendChild(vmTable);
    vmToggle.appendChild(vmBoard);
    vmToggle.appendChild(vmList);
    wrapper.appendChild(vmToggle);

    const contentContainer = el('div');
    wrapper.appendChild(contentContainer);

    const refresh = () => {
      while (contentContainer.firstChild) contentContainer.removeChild(contentContainer.firstChild);
      let invoices = DB.getWhere('invoices', inv => inv.entity === entity && inv.status !== 'Cancelled');
      if (wrFilter.value) invoices = invoices.filter(inv => {
        const wr = DB.getById('workRequests', inv.workRequestId);
        return wr && wr.id === wrFilter.value;
      });
      if (clientFilter.value) invoices = invoices.filter(inv => inv.clientId === clientFilter.value);
      if (empFilter.value) invoices = invoices.filter(inv => inv.createdBy === empFilter.value);
      if (dateFrom.value) invoices = invoices.filter(inv => inv.issueDate >= dateFrom.value);
      if (dateTo.value) invoices = invoices.filter(inv => inv.issueDate <= dateTo.value);
      if (statusFilter.value) invoices = invoices.filter(inv => inv.status === statusFilter.value);

      if (viewMode === 'table') this.refreshTable(contentContainer, invoices);
      else if (viewMode === 'board') this.refreshBoard(contentContainer, invoices);
      else this.refreshListCompact(contentContainer, invoices);
    };

    [wrFilter, clientFilter, empFilter, dateFrom, dateTo, statusFilter].forEach(el => el.addEventListener('change', refresh));
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
      tdInvoice.appendChild(el('span', { text: inv.invoiceNumber }));
      if (inv.fromTemplate) tdInvoice.appendChild(this.recurringBadge(inv));
      tr.appendChild(tdInvoice);
      tr.appendChild(el('td', { text: client?.name || '—' }));
      tr.appendChild(el('td', { text: formatDate(inv.issueDate) }));
      tr.appendChild(el('td', { text: formatPHP(inv.total) }));
      tr.appendChild(el('td', { text: formatPHP(paid) }));
      tr.appendChild(el('td', { text: formatPHP(balance) }));
      tr.appendChild(el('td')).appendChild(this.statusBadge(inv.status));
      const tdAct = el('td');
      if (inv.status === 'Draft') {
        const editBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'Edit' });
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.view = 'form'; this.detailId = inv.id; App.handleRoute();
        });
        tdAct.appendChild(editBtn);
        const trashBtn = el('button', { class: 'btn btn-danger btn-sm', text: 'Trash', style: 'margin-left:4px;' });
        trashBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.trashInvoice(inv.id);
        });
        tdAct.appendChild(trashBtn);
      } else {
        const viewBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'View' });
        viewBtn.addEventListener('click', () => { this.view = 'detail'; this.detailId = inv.id; App.handleRoute(); });
        tdAct.appendChild(viewBtn);
      }
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  },

  refreshBoard(container, invoices) {
    if (invoices.length === 0) {
      container.appendChild(el('p', { text: 'No invoices found.', class: 'empty-state' }));
      return;
    }
    const board = el('div', { class: 'board-v2' });
    const statuses = ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue'];
    const statusColors = {
      'Draft': '#94a3b8',
      'Sent': '#3b82f6',
      'Partially Paid': '#f59e0b',
      'Paid': '#10b981',
      'Overdue': '#ef4444'
    };

    statuses.forEach(st => {
      const colColor = statusColors[st] || '#cbd5e1';
      const col = el('div', { class: 'board-column-v2' });
      col.style.borderTop = `4px solid ${colColor}`;
      
      const header = el('div', { class: 'board-column-header-v2' });
      header.appendChild(el('div', { class: 'board-column-title', text: st }));
      col.appendChild(header);

      const colInvs = invoices.filter(inv => inv.status === st);
      const cardContainer = el('div', { class: 'board-cards-scroll' });

      colInvs.forEach(inv => {
        const client = DB.getById('clients', inv.clientId);
        const paid = this.getPaidAmount(inv);
        const balance = inv.total - paid;
        const progress = inv.total > 0 ? Math.round((paid / inv.total) * 100) : 0;

        const card = el('div', { class: 'board-card-v2' });
        card.style.borderLeftColor = colColor;
        card.addEventListener('click', () => { this.view = 'detail'; this.detailId = inv.id; App.handleRoute(); });

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
        card.appendChild(el('div', { text: client?.name || '—', style: 'font-size:0.875rem;color:#64748b;margin-bottom:12px;' }));

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
          const editBtn = el('button', { class: 'btn btn-ghost btn-xs', text: 'Edit' });
          editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.view = 'form'; this.detailId = inv.id; App.handleRoute();
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
      row.appendChild(el('div', {}, [
        el('div', { class: 'list-item-title', text: inv.invoiceNumber + ' — ' + (client?.name || '—') }),
        el('div', { class: 'list-item-meta', text: formatDate(inv.issueDate) + ' | ' + formatPHP(inv.total) + ' | Paid: ' + formatPHP(paid) + ' | Bal: ' + formatPHP(balance) })
      ]));
      const rightWrap = el('div', { style: 'display:flex; gap:6px; align-items:center; margin-left:auto;' });
      const badgeWrap = el('div', { style: 'display:flex; gap:4px; align-items:center;' });
      badgeWrap.appendChild(this.statusBadge(inv.status));
      if (inv.fromTemplate) badgeWrap.appendChild(this.recurringBadge(inv));
      rightWrap.appendChild(badgeWrap);

      // List actions for Draft invoices
      if (inv.status === 'Draft') {
        const editBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'Edit' });
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.view = 'form'; this.detailId = inv.id; App.handleRoute();
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
      row.addEventListener('click', () => { this.view = 'detail'; this.detailId = inv.id; App.handleRoute(); });
      list.appendChild(row);
    });
    container.appendChild(list);
  },

  statusBadge(status) {
    const map = {
      'Draft': 'badge-info',
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
  renderForm() {
    const entity = Auth.activeEntity;
    const inv = this.detailId ? DB.getById('invoices', this.detailId) : null;
    const container = el('div');

    // Header bar
    const headerBar = el('div', { class: 'form-header-bar' });
    headerBar.appendChild(el('h2', { text: inv ? 'Edit Invoice' : 'Create Sales Invoice' }));
    const topActions = el('div', { class: 'form-actions-top' });
    const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Save Invoice', form: 'invoice-form' });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
    topActions.appendChild(saveBtn);
    topActions.appendChild(cancelBtn);
    headerBar.appendChild(topActions);
    container.appendChild(headerBar);

    const form = el('form', { id: 'invoice-form', class: 'form-stacked' });

    // Client
    const clientGroup = el('div', { class: 'form-group' });
    clientGroup.appendChild(el('label', { text: 'Client *' }));
    const clientSel = el('select', { name: 'clientId', required: true });
    clientSel.appendChild(el('option', { value: '', text: '— Select Client —' }));
    DB.getWhere('clients', c => c.entity === entity).forEach(c => {
      const opt = el('option', { value: c.id, text: c.name });
      if (inv && inv.clientId === c.id) opt.selected = true;
      clientSel.appendChild(opt);
    });
    clientGroup.appendChild(clientSel);
    form.appendChild(clientGroup);

    // Work Request link
    const wrGroup = el('div', { class: 'form-group' });
    wrGroup.appendChild(el('label', { text: 'Link to Work Request' }));
    const wrSel = el('select', { name: 'workRequestId' });
    wrSel.appendChild(el('option', { value: '', text: '— None —' }));
    DB.getWhere('workRequests', wr => wr.entity === entity).forEach(wr => {
      const opt = el('option', { value: wr.id, text: wr.title });
      if (inv && inv.workRequestId === wr.id) opt.selected = true;
      wrSel.appendChild(opt);
    });
    wrGroup.appendChild(wrSel);
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
    const inv = isNew ? null : DB.getById('invoices', this.detailId);

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

    const result = PendingChanges.submit('invoices', record, isNew);

    // Link to WR if selected
    if (data.workRequestId) {
      const wr = DB.getById('workRequests', data.workRequestId);
      if (wr && result.approved) {
        const linked = new Set(wr.linkedInvoiceId ? [wr.linkedInvoiceId] : []);
        linked.add(record.id);
        DB.update('workRequests', wr.id, { linkedInvoiceId: record.id });
      }
    }

    this.view = 'list';
    this.detailId = null;
    App.handleRoute();
  },

  // ============================================================
  // Detail View (with payment recording)
  // ============================================================
  renderDetail() {
    const inv = DB.getById('invoices', this.detailId);
    if (!inv) { this.view = 'list'; App.handleRoute(); return el('div'); }
    const client = DB.getById('clients', inv.clientId);

    const container = el('div', { class: 'invoice-detail' });

    // Status and badges
    const statusWrap = el('div', { style: 'display:flex; gap:8px; align-items:center; margin-bottom: var(--spacing-lg);' });
    statusWrap.appendChild(this.statusBadge(inv.status));
    if (inv.fromTemplate) statusWrap.appendChild(this.recurringBadge(inv));
    container.appendChild(statusWrap);

    const meta = el('div', { class: 'invoice-meta' });
    meta.appendChild(el('p', { text: 'Client: ' + (client?.name || '—') }));
    meta.appendChild(el('p', { text: 'Issue Date: ' + formatDate(inv.issueDate) }));
    meta.appendChild(el('p', { text: 'Due Date: ' + formatDate(inv.dueDate) }));
    container.appendChild(meta);

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
      const payHist = el('div', { class: 'form-section' });
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
    if (inv.status !== 'Paid' && inv.status !== 'Cancelled') {
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
    if (inv.status === 'Draft') {
      const sentBtn = el('button', { class: 'btn btn-primary', text: 'Mark as Sent' });
      sentBtn.addEventListener('click', () => { DB.update('invoices', inv.id, { status: 'Sent' }); App.handleRoute(); });
      actions.appendChild(sentBtn);
    }
    container.appendChild(actions);

    return container;
  },

  generateInvoice(inv) {
    const client = DB.getById('clients', inv.clientId);
    const entity = inv.entity || 'ATA';
    const w = window.open('', '_blank');
    if (!w) return;
    const d = w.document;

    const title = d.createElement('title');
    title.textContent = 'Service Invoice ' + inv.invoiceNumber;
    d.head.appendChild(title);

    const style = d.createElement('style');
    style.textContent = `
      @page { size: A4; margin: 15mm 20mm; }
      body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 11pt; line-height: 1.5; color: #1e293b; max-width: 210mm; margin: 0 auto; padding: 0; }
      .doc-title { text-align: center; font-size: 16pt; font-weight: 700; letter-spacing: 4px; margin: 0 0 16px; text-transform: uppercase; }
      .two-col { display: flex; justify-content: space-between; gap: 24px; margin-bottom: 20px; }
      .col { flex: 1; }
      .col h3 { font-size: 10pt; text-transform: uppercase; color: #64748b; margin: 0 0 4px; letter-spacing: 0.5px; }
      .col p { margin: 2px 0; font-size: 10pt; }
      .details-bar { display: flex; gap: 32px; margin-bottom: 20px; font-size: 10pt; border: 1px solid #cbd5e1; padding: 8px 12px; border-radius: 4px; }
      .details-bar span { flex: 1; }
      .details-bar strong { color: #334155; }
      table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 10pt; }
      th { background: #f8fafc; border-bottom: 2px solid #1e293b; padding: 8px; text-align: left; font-weight: 600; text-transform: uppercase; font-size: 9pt; letter-spacing: 0.5px; }
      td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
      .num { text-align: right; }
      .totals { margin-top: 16px; border-top: 2px solid #1e293b; padding-top: 12px; }
      .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 10pt; }
      .totals-row.grand { font-weight: 700; font-size: 12pt; border-top: 1px solid #cbd5e1; padding-top: 8px; margin-top: 4px; }
      .vat-breakdown { background: #f8fafc; padding: 12px; border-radius: 4px; margin-top: 12px; font-size: 9pt; }
      .vat-breakdown p { margin: 2px 0; }
      .signature-row { display: flex; justify-content: space-between; margin-top: 48px; gap: 40px; }
      .signature-box { flex: 1; text-align: center; }
      .signature-box .line { border-top: 1px solid #1e293b; margin-top: 40px; padding-top: 4px; font-size: 9pt; }
      .disclaimer { margin-top: 32px; padding: 10px; border: 2px solid #dc2626; color: #dc2626; font-size: 9pt; font-weight: 700; text-align: center; text-transform: uppercase; }
      .pay-status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 9pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
      .pay-status.paid { background: #dcfce7; color: #166534; }
      .pay-status.partial { background: #fef3c7; color: #92400e; }
      .pay-status.unpaid { background: #fee2e2; color: #991b1b; }
      .pay-summary { margin: 16px 0; }
      .pay-summary h4 { margin: 0 0 12px; font-size: 10pt; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px; }
      .pay-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 12px; background: #fff; }
      .pay-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
      .pay-card-amt { font-weight: 700; font-size: 1.25rem; color: #1e293b; line-height: 1.2; }
      .pay-card-date { font-size: 0.75rem; color: #94a3b8; margin-top: 2px; }
      .pay-card-badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.3px; }
      .pay-card-divider { height: 1px; background: #e2e8f0; margin: 0 0 12px; }
      .pay-card-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 0.8125rem; padding: 3px 0; }
      .pay-card-label { color: #94a3b8; font-weight: 500; }
      .pay-card-value { color: #334155; font-weight: 600; text-align: right; }
      .pay-card-notes { margin-top: 12px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 0.8125rem; color: #64748b; font-style: italic; line-height: 1.4; }
      .footer { margin-top: 24px; font-size: 8pt; color: #64748b; text-align: center; border-top: 1px solid #e2e8f0; padding-top: 8px; }
    `;
    d.head.appendChild(style);

    const subtotal = this.getSubtotal(inv);
    const vatAmount = parseFloat(inv.vat) || 0;
    const isVat = vatAmount > 0;
    const paid = this.getPaidAmount(inv);
    const balance = inv.total - paid;
    const payStatusClass = paid >= inv.total ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    const payStatusText = paid >= inv.total ? 'PAID' : paid > 0 ? 'PARTIALLY PAID' : 'UNPAID';

    const lineItemsHtml = inv.lineItems.map(li => {
      const qty = parseFloat(li.qty) || 1;
      const unit = parseFloat(li.unitCost || li.amount) || 0;
      const total = qty * unit;
      return `<tr><td>${li.type ? '[' + li.type + '] ' : ''}${li.description || '—'}</td><td class="num">${qty}</td><td class="num">${formatPHP(unit)}</td><td class="num">${formatPHP(total)}</td></tr>`;
    }).join('');

    const vatHtml = isVat
      ? `<div class="vat-breakdown"><p><strong>VAT Breakdown</strong></p><p>VATable Sales: ${formatPHP(subtotal)}</p><p>VAT Amount (12%): ${formatPHP(vatAmount)}</p><p>Total Amount Due: ${formatPHP(inv.total)}</p></div>`
      : `<div class="disclaimer">This document is not valid for claim of input tax.</div>`;

    // Build payment summary if payments exist
    let paySummaryHtml = '';
    if (Array.isArray(inv.payments) && inv.payments.length > 0) {
      const payCards = inv.payments.map(p => {
        const methodCfg = PaymentIcons;
        const def = methodCfg['Other Digital'];
        const cfg = methodCfg[p.method] || def;

        let detailRows = '';
        const addRow = (label, value) => {
          if (!value) return '';
          return `<div style="display:flex; justify-content:space-between; align-items:baseline; font-size:0.8125rem; padding:3px 0;"><span style="color:#94a3b8; font-weight:500;">${label}</span><span style="color:#334155; font-weight:600; text-align:right;">${value}</span></div>`;
        };

        if (p.reference) detailRows += addRow('Reference', p.reference);
        if (p.checkNumber) detailRows += addRow('Check Number', p.checkNumber);
        if (p.bankName) detailRows += addRow('Bank', p.bankName);
        if (p.bankAccount) detailRows += addRow('Account Number', p.bankAccount);
        if (p.transactionId) detailRows += addRow('Transaction ID', p.transactionId);
        if (p.digitalAccount) detailRows += addRow('Wallet / Account', p.digitalAccount);
        if (p.cardLast4) addRow('Card Number', '**** ' + p.cardLast4);

        const recorder = p.recordedBy ? DB.getById('users', p.recordedBy) : null;
        const collector = p.collectedBy ? DB.getById('users', p.collectedBy) : null;
        detailRows += addRow('Recorded By', recorder ? recorder.name : '—');
        detailRows += addRow('Collected By', collector ? collector.name : '—');

        const notesHtml = p.notes
          ? `<div style="margin-top:12px; padding-top:12px; border-top:1px solid #e2e8f0; font-size:0.8125rem; color:#64748b; font-style:italic; line-height:1.4;">${p.notes}</div>`
          : '';

        return `
          <div style="border:1px solid #e2e8f0; border-radius:8px; padding:16px; margin-bottom:12px; background:#fff;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
              <div>
                <div style="font-weight:700; font-size:1.25rem; color:#1e293b; line-height:1.2;">${formatPHP(p.amount)}</div>
                <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">${formatDate(p.date)}</div>
              </div>
              <span style="display:inline-flex; align-items:center; gap:6px; padding:4px 10px; border-radius:20px; font-size:0.75rem; font-weight:700; color:${cfg.color}; background:${cfg.bg}; letter-spacing:0.3px;">
                ${cfg.svg} ${cfg.label}
              </span>
            </div>
            <div style="height:1px; background:#e2e8f0; margin:0 0 12px;"></div>
            <div style="display:flex; flex-direction:column; gap:6px;">${detailRows}</div>
            ${notesHtml}
          </div>`;
      }).join('');

      paySummaryHtml = `
        <div class="pay-summary">
          <h4>Payment Details</h4>
          ${payCards}
          <div style="margin-top:8px; text-align:right; font-weight:600; font-size:10pt;">Total Paid: ${formatPHP(paid)} | Balance: ${formatPHP(balance)}</div>
        </div>`;
    }

    d.body.innerHTML = `
      <div style="text-align:center; margin-bottom:4px;">
        <div style="font-size:14pt; font-weight:700; letter-spacing:1px;">${entity} Accounting Services Firm</div>
      </div>
      <div style="border-bottom:2px solid #1e293b; margin-bottom:16px;"></div>

      <div class="doc-title">Service Invoice</div>

      <div class="two-col">
        <div class="col">
          <h3>Sold To / Client</h3>
          <p><strong>${client?.name || '—'}</strong></p>
          <p>TIN: ${client?.tin || '—'}</p>
          <p>${client?.address || '—'}</p>
        </div>
        <div class="col">
          <h3>Invoice Details</h3>
          <p><strong>Invoice No.:</strong> ${inv.invoiceNumber}</p>
          <p><strong>Date Issued:</strong> ${formatDate(inv.issueDate)}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr><th>Description of Service</th><th class="num">Qty</th><th class="num">Unit Cost</th><th class="num">Amount</th></tr>
        </thead>
        <tbody>
          ${lineItemsHtml}
        </tbody>
      </table>

      <div class="totals">
        ${isVat ? `<div class="totals-row"><span>Value Added Tax (12%)</span><span>${formatPHP(vatAmount)}</span></div>` : ''}
        <div class="totals-row grand"><span>Total Amount Due</span><span>${formatPHP(inv.total)}</span></div>
      </div>

      ${paySummaryHtml}
      ${vatHtml}

      <div class="signature-row">
        <div class="signature-box">
          <div class="line">Authorized Representative<br><span style="font-size:8pt;color:#64748b;">Signature over Printed Name / Date</span></div>
        </div>
        <div class="signature-box">
          <div class="line">Client Acknowledgment<br><span style="font-size:8pt;color:#64748b;">Signature over Printed Name / Date</span></div>
        </div>
      </div>

      <div class="footer">
        This Service Invoice is issued in compliance with Revenue Regulations No. 7-2024 (Ease of Paying Taxes Act).<br>
        For questions, contact ${entity} Accounting Services Firm.<br>
        Original copy retained for BIR audit trail.
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
            <tr><td><strong>Check Number</strong></td><td>${p.checkNumber || '—'}</td></tr>
            <tr><td><strong>Drawee Bank</strong></td><td>${p.bankName || '—'}</td></tr>`;
        } else if (p.method === 'Bank Transfer') {
          detailRows = `
            <tr><td><strong>Bank Name</strong></td><td>${p.bankName || '—'}</td></tr>
            <tr><td><strong>Account Number</strong></td><td>${p.bankAccount || '—'}</td></tr>
            <tr><td><strong>Transaction Reference</strong></td><td>${p.transactionId || '—'}</td></tr>`;
        } else if (['GCash','Maya','PayPal','Other Digital'].includes(p.method)) {
          detailRows = `
            <tr><td><strong>Wallet / Account</strong></td><td>${p.digitalAccount || '—'}</td></tr>
            <tr><td><strong>Transaction Reference</strong></td><td>${p.transactionId || '—'}</td></tr>`;
        } else if (['Credit Card','Debit Card'].includes(p.method)) {
          detailRows = `
            <tr><td><strong>Card Last 4 Digits</strong></td><td>**** ${p.cardLast4 || '—'}</td></tr>
            <tr><td><strong>Authorization Code</strong></td><td>${p.transactionId || '—'}</td></tr>
            <tr><td><strong>Card Issuer</strong></td><td>${p.bankName || '—'}</td></tr>`;
        }
        return `
          <div class="box" style="margin-bottom:12px;">
            <p><strong>Payment ${idx + 1} — ${p.method}</strong> <span style="font-size:9pt;color:#475569;">(${formatDate(p.date)})</span></p>
            <div class="grid-2">
              <div>
                <p><strong>Amount:</strong> ${formatPHP(p.amount)}</p>
                <p class="amount-words">${pAmountWords}</p>
              </div>
              <div>
                <table style="margin:0;">${detailRows}</table>
              </div>
            </div>
            ${p.reference ? `<p style="margin-top:6px; font-size:9pt; color:#64748b;">General Ref: ${p.reference}</p>` : ''}
            ${p.notes ? `<p style="font-size:9pt; color:#64748b; font-style:italic;">Notes: ${p.notes}</p>` : ''}
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
              <p class="amount-words"><strong>Amount in Words:</strong> ${amountWords}</p>
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

    d.body.innerHTML = `
      <div style="text-align:center; margin-bottom:4px;">
        <div style="font-size:14pt; font-weight:700; letter-spacing:1px;">${entity} Accounting Services Firm</div>
      </div>
      <div style="border-bottom:2px solid #1e293b; margin-bottom:16px;"></div>

      <div class="doc-title">Payment Voucher</div>

      <div class="grid-2">
        <div class="box">
          <h3>Voucher Details</h3>
          <p><strong>Voucher No.:</strong> PV-${inv.invoiceNumber}</p>
          <p><strong>Date:</strong> ${formatDate(new Date().toISOString().slice(0, 10))}</p>
          <p><strong>Reference Invoice:</strong> ${inv.invoiceNumber}</p>
        </div>
        <div class="box">
          <h3>Payee Information</h3>
          <p><strong>${client?.name || '—'}</strong></p>
          <p>TIN: ${client?.tin || '—'}</p>
          <p>${client?.address || '—'}</p>
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
        <p>☐ Service Invoice No. ${inv.invoiceNumber} dated ${formatDate(inv.issueDate)}</p>
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
      
      const editBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'Edit', style: 'margin-left:4px;' });
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
    const form = el('form', { class: 'form-stacked' });
    
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

    const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Save Template' });
    form.appendChild(submitBtn);

    const overlay = Workflow.showModal(existing ? 'Edit Template' : 'New Billing Template', form);

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
      overlay.remove();
      App.handleRoute();
    });
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
    App.handleRoute();
  },

  renderTrash() {
    const entity = Auth.activeEntity;
    const trashed = DB.getWhere('invoices', inv => inv.entity === entity && inv.status === 'Cancelled');

    const container = el('div');
    const topActions = el('div', { class: 'form-header-bar', style: 'margin-bottom: var(--spacing-lg);' });
    topActions.appendChild(el('h2', { text: 'Trashed Invoices' }));
    container.appendChild(topActions);

    if (trashed.length === 0) {
      container.appendChild(el('p', { text: 'Trash is empty.', class: 'empty-state' }));
      return container;
    }

    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Invoice #', 'Client', 'Issue Date', 'Total', 'Trashed At', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
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
    const topActions = el('div', { class: 'form-header-bar', style: 'margin-bottom: var(--spacing-lg);' });
    topActions.appendChild(el('h2', { text: 'Aging Report' }));
    const backBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to List' });
    backBtn.addEventListener('click', () => { this.view = 'list'; App.handleRoute(); });
    topActions.appendChild(backBtn);
    container.appendChild(topActions);

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
