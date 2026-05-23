/**
 * Billing Module
 * Sales Invoice creation, VAT calculation, payment tracking, aging.
 */

const Billing = {
  view: 'list', // 'list' | 'form' | 'detail' | 'aging'
  detailId: null,

  render() {
    const container = el('div', { class: 'page' });
    container.appendChild(el('h1', { text: 'Billing' }));

    if (this.view === 'list') container.appendChild(this.renderList());
    else if (this.view === 'form') container.appendChild(this.renderForm());
    else if (this.view === 'detail') container.appendChild(this.renderDetail());
    else if (this.view === 'aging') container.appendChild(this.renderAging());

    return container;
  },

  init() {},

  getPaidAmount(inv) {
    return inv.paidAmount ?? inv.amountPaid ?? 0;
  },

  getSubtotal(inv) {
    if (typeof inv.subtotal === 'number') return inv.subtotal;
    if (Array.isArray(inv.lineItems)) {
      return inv.lineItems.reduce((sum, item) => sum + (parseFloat(item.amount) || 0), 0);
    }
    return 0;
  },

  getVatAmount(inv) {
    if (typeof inv.vat === 'number') return inv.vat;
    if (typeof inv.vatAmount === 'number') return inv.vatAmount;
    if (Array.isArray(inv.lineItems)) {
      return inv.lineItems.reduce((sum, item) => {
        const amt = parseFloat(item.amount) || 0;
        return sum + (item.vatTreatment === 'VATable' ? amt * 0.12 : 0);
      }, 0);
    }
    return 0;
  },

  // ============================================================
  // List View
  // ============================================================
  renderList() {
    const entity = Auth.activeEntity;
    const invoices = DB.getWhere('invoices', inv => inv.entity === entity);

    const actions = el('div', { class: 'actions-bar' });
    const addBtn = el('button', { class: 'btn btn-primary', text: 'Create Invoice' });
    addBtn.addEventListener('click', () => { this.view = 'form'; this.detailId = null; App.handleRoute(); });
    actions.appendChild(addBtn);

    const statusFilter = el('select', { class: 'form-select', style: 'max-width:200px' });
    statusFilter.appendChild(el('option', { value: '', text: 'All Statuses' }));
    ['Draft', 'Sent', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled'].forEach(s => {
      statusFilter.appendChild(el('option', { value: s, text: s }));
    });
    statusFilter.addEventListener('change', () => this.refreshList(tableContainer, statusFilter.value));
    actions.appendChild(statusFilter);

    const agingBtn = el('button', { class: 'btn btn-ghost', text: 'Aging Report' });
    agingBtn.addEventListener('click', () => { this.view = 'aging'; App.handleRoute(); });
    actions.appendChild(agingBtn);

    const tableContainer = el('div');
    this.refreshList(tableContainer, '');

    const wrapper = el('div');
    wrapper.appendChild(actions);
    wrapper.appendChild(tableContainer);
    return wrapper;
  },

  refreshList(container, statusFilter) {
    while (container.firstChild) container.removeChild(container.firstChild);
    const entity = Auth.activeEntity;
    let invoices = DB.getWhere('invoices', inv => inv.entity === entity);
    if (statusFilter) invoices = invoices.filter(inv => inv.status === statusFilter);

    if (invoices.length === 0) {
      container.appendChild(el('p', { text: 'No invoices found.', class: 'empty-state' }));
      return;
    }

    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Invoice #', 'Client', 'Issue Date', 'Total', 'Status', 'Aging', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = el('tbody');
    const today = new Date();
    invoices.forEach(inv => {
      const client = DB.getById('clients', inv.clientId);
      const due = new Date(inv.dueDate);
      const daysOverdue = Math.floor((today - due) / (1000 * 60 * 60 * 24));
      const agingText = inv.status === 'Paid' ? '—' : (daysOverdue > 0 ? daysOverdue + ' days' : 'Current');

      const tr = el('tr');
      tr.appendChild(el('td', { text: inv.invoiceNumber }));
      tr.appendChild(el('td', { text: client?.name || '—' }));
      tr.appendChild(el('td', { text: formatDate(inv.issueDate) }));
      tr.appendChild(el('td', { text: formatPHP(inv.total) }));
      tr.appendChild(el('td')).appendChild(this.statusBadge(inv.status));
      tr.appendChild(el('td', { text: agingText }));
      const tdAct = el('td');
      const viewBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { this.view = 'detail'; this.detailId = inv.id; App.handleRoute(); });
      tdAct.appendChild(viewBtn);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
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

  // ============================================================
  // Create / Edit Form
  // ============================================================
  renderForm() {
    const entity = Auth.activeEntity;
    const inv = this.detailId ? DB.getById('invoices', this.detailId) : null;
    const container = el('div');
    container.appendChild(el('h2', { text: inv ? 'Edit Invoice' : 'Create Sales Invoice' }));

    const form = el('form', { class: 'form-stacked' });

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
      this.addLineItemRow(itemsList, { type: 'PF', description: '', amount: '', vatTreatment: 'VATable' });
      this.addLineItemRow(itemsList, { type: 'Government Fee', description: '', amount: '', vatTreatment: 'VAT-Exempt' });
    }

    // Totals
    const totals = el('div', { class: 'invoice-totals' });
    totals.appendChild(el('div', { class: 'total-row' }, [el('span', { text: 'Subtotal:' }), el('span', { id: 'inv-subtotal', text: '₱0.00' })]));
    totals.appendChild(el('div', { class: 'total-row' }, [el('span', { text: 'VAT (12%):' }), el('span', { id: 'inv-vat', text: '₱0.00' })]));
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
    // Trigger once
    if (clientSel.value) clientSel.dispatchEvent(new Event('change'));

    // Recalculate totals on input changes
    form.addEventListener('input', () => this.recalcTotals(form));

    const btnGroup = el('div', { class: 'form-group form-actions' });
    const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Save Invoice' });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
    btnGroup.appendChild(saveBtn);
    btnGroup.appendChild(cancelBtn);
    form.appendChild(btnGroup);

    form.addEventListener('submit', e => { e.preventDefault(); this.submitForm(form); });

    container.appendChild(form);
    this.recalcTotals(form);
    return container;
  },

  addLineItemRow(container, item) {
    const row = el('div', { class: 'line-item-row' });

    const typeSel = el('select', { class: 'item-type' });
    ['PF', 'Government Fee'].forEach(t => {
      const opt = el('option', { value: t, text: t });
      if (item?.type === t) opt.selected = true;
      typeSel.appendChild(opt);
    });
    row.appendChild(typeSel);

    const descIn = el('input', { type: 'text', placeholder: 'Description', class: 'item-desc', value: item?.description || '' });
    row.appendChild(descIn);

    const amtIn = el('input', { type: 'number', placeholder: 'Amount', class: 'item-amt', value: item?.amount || '', min: 0, step: 0.01 });
    row.appendChild(amtIn);

    const vatSel = el('select', { class: 'item-vat' });
    ['VATable', 'VAT-Exempt', 'Zero-Rated'].forEach(v => {
      const opt = el('option', { value: v, text: v });
      if (item?.vatTreatment === v) opt.selected = true;
      vatSel.appendChild(opt);
    });
    row.appendChild(vatSel);

    const removeBtn = el('button', { type: 'button', class: 'btn btn-danger btn-sm', text: '×' });
    removeBtn.addEventListener('click', () => {
      row.remove();
      // Trigger totals recalc on closest form
      const form = container.closest('form');
      if (form) this.recalcTotals(form);
    });
    row.appendChild(removeBtn);

    container.appendChild(row);
  },

  recalcTotals(form) {
    const rows = form.querySelectorAll('.line-item-row');
    let subtotal = 0, vat = 0;
    rows.forEach(row => {
      const amt = parseFloat(row.querySelector('.item-amt').value) || 0;
      const vatType = row.querySelector('.item-vat').value;
      subtotal += amt;
      if (vatType === 'VATable') vat += amt * 0.12;
    });
    const total = subtotal + vat;

    const subEl = form.querySelector('#inv-subtotal');
    const vatEl = form.querySelector('#inv-vat');
    const totEl = form.querySelector('#inv-total');
    if (subEl) subEl.textContent = formatPHP(subtotal);
    if (vatEl) vatEl.textContent = formatPHP(vat);
    if (totEl) totEl.textContent = formatPHP(total);
  },

  nextInvoiceNumber(entity) {
    const year = new Date().getFullYear();
    const prefix = entity + '-SI-' + year + '-';
    const existing = DB.getWhere('invoices', inv => inv.invoiceNumber.startsWith(prefix));
    const maxNum = existing.reduce((max, inv) => {
      const parts = inv.invoiceNumber.split('-');
      const num = parseInt(parts[parts.length - 1], 10);
      return num > max ? num : max;
    }, 0);
    return prefix + String(maxNum + 1).padStart(3, '0');
  },

  submitForm(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const entity = Auth.activeEntity;

    // Collect line items
    const rows = form.querySelectorAll('.line-item-row');
    const lineItems = [];
    let subtotal = 0, vat = 0;
    rows.forEach(row => {
      const amt = parseFloat(row.querySelector('.item-amt').value) || 0;
      const vatType = row.querySelector('.item-vat').value;
      subtotal += amt;
      if (vatType === 'VATable') vat += amt * 0.12;
      lineItems.push({
        type: row.querySelector('.item-type').value,
        description: row.querySelector('.item-desc').value.trim(),
        amount: amt,
        vatTreatment: vatType
      });
    });

    const record = {
      invoiceNumber: data.invoiceNumber,
      clientId: data.clientId,
      entity: entity,
      issueDate: data.issueDate,
      dueDate: data.dueDate,
      lineItems,
      subtotal,
      vat,
      total: subtotal + vat,
      status: 'Draft',
      paidAmount: 0
    };

    if (this.detailId) {
      DB.update('invoices', this.detailId, record);
    } else {
      record.id = generateId('inv');
      record.createdAt = new Date().toISOString();
      DB.insert('invoices', record);
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
    
    // Top actions bar
    const topActions = el('div', { class: 'actions-bar', style: 'margin-bottom: var(--spacing-lg);' });
    const backBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to List' });
    backBtn.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
    topActions.appendChild(backBtn);
    container.appendChild(topActions);

    const header = el('div', { class: 'invoice-header' });
    header.appendChild(el('h2', { text: inv.invoiceNumber }));
    header.appendChild(this.statusBadge(inv.status));
    container.appendChild(header);

    const meta = el('div', { class: 'invoice-meta' });
    meta.appendChild(el('p', { text: 'Client: ' + (client?.name || '—') }));
    meta.appendChild(el('p', { text: 'Issue Date: ' + formatDate(inv.issueDate) }));
    meta.appendChild(el('p', { text: 'Due Date: ' + formatDate(inv.dueDate) }));
    container.appendChild(meta);

    // Line items table
    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Type', 'Description', 'Amount', 'VAT Treatment'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);
    const tbody = el('tbody');
    inv.lineItems.forEach(item => {
      const tr = el('tr');
      tr.appendChild(el('td', { text: item.type }));
      tr.appendChild(el('td', { text: item.description }));
      tr.appendChild(el('td', { text: formatPHP(item.amount) }));
      tr.appendChild(el('td', { text: item.vatTreatment }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    // Totals
    const subtotal = this.getSubtotal(inv);
    const vat = this.getVatAmount(inv);
    const paid = this.getPaidAmount(inv);
    const totals = el('div', { class: 'invoice-totals' });
    totals.appendChild(el('div', { class: 'total-row' }, [el('span', { text: 'Subtotal:' }), el('span', { text: formatPHP(subtotal) })]));
    totals.appendChild(el('div', { class: 'total-row' }, [el('span', { text: 'VAT (12%):' }), el('span', { text: formatPHP(vat) })]));
    totals.appendChild(el('div', { class: 'total-row total-grand' }, [el('span', { text: 'Total:' }), el('span', { text: formatPHP(inv.total) })]));
    totals.appendChild(el('div', { class: 'total-row' }, [el('span', { text: 'Paid:' }), el('span', { text: formatPHP(paid) })]));
    totals.appendChild(el('div', { class: 'total-row' }, [el('span', { text: 'Balance:' }), el('span', { text: formatPHP(inv.total - paid) })]));
    container.appendChild(totals);

    // Payment recording
    if (inv.status !== 'Paid' && inv.status !== 'Cancelled') {
      const paySection = el('div', { class: 'form-section' });
      paySection.appendChild(el('h3', { text: 'Record Payment' }));
      const payForm = el('form', { class: 'form-stacked' });
      payForm.appendChild(el('div', { class: 'form-group' }, [el('label', { text: 'Amount Paid' }), el('input', { type: 'number', name: 'payAmount', min: 0, step: 0.01, required: true })]));
      payForm.appendChild(el('div', { class: 'form-group' }, [el('label', { text: 'Payment Date' }), el('input', { type: 'date', name: 'payDate', value: new Date().toISOString().slice(0, 10), required: true })]));
      const methodGroup = el('div', { class: 'form-group' });
      methodGroup.appendChild(el('label', { text: 'Method' }));
      const methodSel = el('select', { name: 'payMethod' });
      ['Cash', 'Check', 'Bank Transfer'].forEach(m => methodSel.appendChild(el('option', { value: m, text: m })));
      methodGroup.appendChild(methodSel);
      payForm.appendChild(methodGroup);
      payForm.appendChild(el('div', { class: 'form-group' }, [el('label', { text: 'Reference #' }), el('input', { type: 'text', name: 'payRef' })]));

      const payBtn = el('button', { type: 'submit', class: 'btn btn-success', text: 'Record Payment' });
      payForm.appendChild(payBtn);
      payForm.addEventListener('submit', e => {
        e.preventDefault();
        const fd = new FormData(payForm);
        const payAmount = parseFloat(fd.get('payAmount')) || 0;
        const currentPaid = this.getPaidAmount(inv);
        const newPaid = currentPaid + payAmount;
        let newStatus = inv.status;
        if (newPaid >= inv.total) newStatus = 'Paid';
        else if (newPaid > 0 && newPaid < inv.total) newStatus = 'Partially Paid';
        DB.update('invoices', inv.id, { paidAmount: newPaid, status: newStatus });
        App.handleRoute();
      });
      paySection.appendChild(payForm);
      container.appendChild(paySection);
    }

    // Actions
    const actions = el('div', { class: 'form-actions' });
    const printBtn = el('button', { class: 'btn btn-ghost', text: 'Print' });
    printBtn.addEventListener('click', () => window.print());
    actions.appendChild(printBtn);

    if (inv.status === 'Draft') {
      const sentBtn = el('button', { class: 'btn btn-primary', text: 'Mark as Sent' });
      sentBtn.addEventListener('click', () => { DB.update('invoices', inv.id, { status: 'Sent' }); App.handleRoute(); });
      actions.appendChild(sentBtn);
    }

    container.appendChild(actions);

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
    container.appendChild(el('h2', { text: 'Aging Report' }));

    const grid = el('div', { class: 'kpi-grid' });
    Object.entries(buckets).forEach(([label, invs]) => {
      const total = invs.reduce((sum, inv) => sum + (inv.total - this.getPaidAmount(inv)), 0);
      grid.appendChild(this.kpiCard(label + ' Days', invs.length + ' invoices', formatPHP(total)));
    });
    container.appendChild(grid);

    const backBtn = el('button', { class: 'btn btn-ghost', text: 'Back to List' });
    backBtn.addEventListener('click', () => { this.view = 'list'; App.handleRoute(); });
    container.appendChild(backBtn);
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
