/**
 * Disbursement & Expense Module
 * Expense filing, fund source tagging, 2-tier vs 1-tier approval, self-approval block.
 */

const Disbursement = {
  view: 'list', // 'list' | 'form' | 'detail' | 'report'
  detailId: null,

  render() {
    const container = el('div', { class: 'page' });
    container.appendChild(el('h1', { text: 'Disbursement' }));

    if (this.view === 'list') container.appendChild(this.renderList());
    else if (this.view === 'form') container.appendChild(this.renderForm());
    else if (this.view === 'detail') container.appendChild(this.renderDetail());
    else if (this.view === 'report') container.appendChild(this.renderReport());

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

    const actions = el('div', { class: 'actions-bar' });
    const addBtn = el('button', { class: 'btn btn-primary', text: 'File Expense' });
    addBtn.addEventListener('click', () => { this.view = 'form'; this.detailId = null; App.handleRoute(); });
    actions.appendChild(addBtn);

    const fundFilter = el('select', { class: 'form-select', style: 'max-width:150px' });
    fundFilter.appendChild(el('option', { value: '', text: 'All Funds' }));
    ['Firm Fund', 'Client Fund'].forEach(f => fundFilter.appendChild(el('option', { value: f, text: f })));
    actions.appendChild(fundFilter);

    const statusFilter = el('select', { class: 'form-select', style: 'max-width:150px' });
    statusFilter.appendChild(el('option', { value: '', text: 'All Statuses' }));
    ['Draft', 'Submitted', 'Under Review', 'Approved', 'Released', 'Rejected'].forEach(s => {
      statusFilter.appendChild(el('option', { value: s, text: s }));
    });
    actions.appendChild(statusFilter);

    // Month/Year Filters
    const monthFilter = el('select', { class: 'form-select', style: 'max-width:120px' });
    monthFilter.appendChild(el('option', { value: '', text: 'All Months' }));
    ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].forEach((m, i) => {
      monthFilter.appendChild(el('option', { value: String(i), text: m }));
    });
    actions.appendChild(monthFilter);

    const years = [...new Set(DB.getAll('disbursements').map(d => new Date(d.submittedAt || Date.now()).getFullYear()))].sort((a,b) => b-a);
    const yearFilter = el('select', { class: 'form-select', style: 'max-width:110px' });
    yearFilter.appendChild(el('option', { value: '', text: 'All Years' }));
    years.forEach(y => yearFilter.appendChild(el('option', { value: String(y), text: String(y) })));
    actions.appendChild(yearFilter);

    const updateFilters = () => this.refreshList(listContainer, fundFilter.value, statusFilter.value, monthFilter.value, yearFilter.value);
    [fundFilter, statusFilter, monthFilter, yearFilter].forEach(f => f.addEventListener('change', updateFilters));

    const reportBtn = el('button', { class: 'btn btn-ghost', text: 'Summary Report' });
    reportBtn.addEventListener('click', () => { this.view = 'report'; App.handleRoute(); });
    actions.appendChild(reportBtn);

    const listContainer = el('div');
    this.refreshList(listContainer, '', '', '', '');

    const wrapper = el('div');
    wrapper.appendChild(actions);
    wrapper.appendChild(listContainer);
    return wrapper;
  },

  refreshList(container, fundFilter, statusFilter, monthFilter, yearFilter) {
    while (container.firstChild) container.removeChild(container.firstChild);
    const entity = Auth.activeEntity;
    let items = DB.getWhere('disbursements', d => d.entity === entity);
    
    if (fundFilter) items = items.filter(d => this.getFundSource(d) === fundFilter);
    if (statusFilter) items = items.filter(d => d.status === statusFilter);
    if (monthFilter) items = items.filter(d => new Date(d.submittedAt).getMonth() === parseInt(monthFilter));
    if (yearFilter) items = items.filter(d => new Date(d.submittedAt).getFullYear() === parseInt(yearFilter));

    // Default Sort: Latest first
    items.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    if (items.length === 0) {
      container.appendChild(el('p', { text: 'No expenses found.', class: 'empty-state' }));
      return;
    }

    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Employee', 'Category', 'Amount', 'Fund', 'Status', 'Date', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
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

  // ============================================================
  // Expense Filing Form
  // ============================================================
  renderForm() {
    const entity = Auth.activeEntity;
    const container = el('div');
    container.appendChild(el('h2', { text: 'File Expense' }));

    const form = el('form', { class: 'form-stacked' });

    const catGroup = el('div', { class: 'form-group' });
    catGroup.appendChild(el('label', { text: 'Category *' }));
    const catSel = el('select', { name: 'category', required: true });
    ['Transportation', 'Notary', 'Meals', 'Government Fee', 'Other'].forEach(c => {
      catSel.appendChild(el('option', { value: c, text: c }));
    });
    catGroup.appendChild(catSel);
    form.appendChild(catGroup);

    const descGroup = el('div', { class: 'form-group' });
    descGroup.appendChild(el('label', { text: 'Description *' }));
    descGroup.appendChild(el('input', { type: 'text', name: 'description', required: true }));
    form.appendChild(descGroup);

    const amtGroup = el('div', { class: 'form-group' });
    amtGroup.appendChild(el('label', { text: 'Amount (₱) *' }));
    amtGroup.appendChild(el('input', { type: 'number', name: 'amount', min: 0, step: 0.01, required: true }));
    form.appendChild(amtGroup);

    const receiptGroup = el('div', { class: 'form-group' });
    receiptGroup.appendChild(el('label', { text: 'Receipt (optional)' }));
    receiptGroup.appendChild(el('input', { type: 'file', name: 'receipt' }));
    form.appendChild(receiptGroup);

    // Fund Source
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

    // Linked invoice (only for Client Fund)
    const invGroup = el('div', { class: 'form-group hidden', id: 'linked-invoice-group' });
    invGroup.appendChild(el('label', { text: 'Linked Billing Invoice' }));
    const invSel = el('select', { name: 'linkedInvoiceId' });
    invSel.appendChild(el('option', { value: '', text: '— Select Invoice —' }));
    DB.getWhere('invoices', inv => inv.entity === entity && inv.status !== 'Cancelled').forEach(inv => {
      const client = DB.getById('clients', inv.clientId);
      invSel.appendChild(el('option', { value: inv.id, text: inv.invoiceNumber + ' — ' + (client?.name || '—') }));
    });
    invGroup.appendChild(invSel);
    form.appendChild(invGroup);

    form.querySelectorAll('input[name="fundSource"]').forEach(r => {
      r.addEventListener('change', () => {
        const isClient = form.querySelector('input[name="fundSource"]:checked')?.value === 'Client Fund';
        invGroup.classList.toggle('hidden', !isClient);
      });
    });

    const btnGroup = el('div', { class: 'form-group form-actions' });
    const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Submit Expense' });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => { this.view = 'list'; App.handleRoute(); });
    btnGroup.appendChild(saveBtn);
    btnGroup.appendChild(cancelBtn);
    form.appendChild(btnGroup);

    form.addEventListener('submit', e => { e.preventDefault(); this.submitForm(form); });

    container.appendChild(form);
    return container;
  },

  submitForm(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const entity = Auth.activeEntity;
    const receiptInput = form.querySelector('input[name="receipt"]');
    const receiptFile = receiptInput?.files?.[0];

    const record = {
      category: data.category,
      description: data.description.trim(),
      amount: parseFloat(data.amount) || 0,
      fundSource: data.fundSource,
      linkedInvoiceId: data.linkedInvoiceId || null,
      entity: entity,
      employeeId: Auth.user.id,
      status: 'Submitted',
      submittedAt: new Date().toISOString(),
      receiptFilename: receiptFile ? receiptFile.name : null
    };

    record.id = generateId('d');
    DB.insert('disbursements', record);

    this.view = 'list';
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
    meta.appendChild(el('p', { text: 'Employee: ' + (emp?.name || '—') }));
    meta.appendChild(el('p', { text: 'Date Submitted: ' + formatDate(d.submittedAt) }));
    meta.appendChild(el('p', { text: 'Fund Source: ' + this.getFundSource(d) }));
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

    const actions = el('div', { class: 'form-actions', style: 'margin-top: var(--spacing-lg); border-top: 1px solid var(--color-border); padding-top: var(--spacing-lg);' });

    const isRequester = Auth.isSelfApprover(this.getEmployeeId(d));
    const role = Auth.user.role;
    const dept = Auth.user.department;
    const isManagerial = role === 'Admin' || role === 'Manager';
    const isAccounting = dept === 'Accounting';

    // 1. Review Phase (Submitted -> Approved)
    // Handled by Managers/Admins (cannot be requester)
    if (d.status === 'Submitted' || d.status === 'Under Review') {
      if (isManagerial) {
        if (isRequester) {
          container.appendChild(el('p', { class: 'field-error', text: 'You cannot approve your own expense submission.' }));
        } else {
          const approveBtn = el('button', { class: 'btn btn-primary', text: 'Approve Submission' });
          approveBtn.addEventListener('click', () => { this.approve(this.detailId); App.handleRoute(); });
          actions.appendChild(approveBtn);

          const rejectBtn = el('button', { class: 'btn btn-danger', text: 'Reject' });
          rejectBtn.addEventListener('click', () => {
            const reason = prompt('Enter rejection reason:');
            if (reason) { this.reject(this.detailId, reason); App.handleRoute(); }
          });
          actions.appendChild(rejectBtn);
        }
      } else {
        container.appendChild(el('p', { class: 'empty-state', text: 'Waiting for Admin/Manager review.' }));
      }
    }

    // 2. Release Phase (Approved -> Released)
    // Handled by Accounting Staff (cannot be requester OR the same person who approved)
    if (d.status === 'Approved') {
      const isApprover = Auth.user.id === d.approvedBy;
      const canRelease = (isAccounting || isManagerial) && !isRequester && !isApprover;
      
      if (canRelease) {
        const releaseBtn = el('button', { class: 'btn btn-success', text: 'Authorize Release' });
        releaseBtn.addEventListener('click', () => { this.release(this.detailId); App.handleRoute(); });
        actions.appendChild(releaseBtn);

        const rejectBtn = el('button', { class: 'btn btn-danger', text: 'Void / Reject' });
        rejectBtn.addEventListener('click', () => {
          const reason = prompt('Enter reason for voiding:');
          if (reason) { this.reject(this.detailId, reason); App.handleRoute(); }
        });
        actions.appendChild(rejectBtn);
      } else if (isRequester) {
        container.appendChild(el('p', { class: 'field-error', text: 'You cannot release your own expense.' }));
      } else if (isApprover) {
        container.appendChild(el('p', { class: 'field-success', text: 'You approved this expense; a different user (Accounting or another Manager) must authorize the release.' }));
      } else {
        container.appendChild(el('p', { class: 'empty-state', text: 'Waiting for Accounting release authorization.' }));
      }
    }

    container.appendChild(actions);

    return container;
  },

  approve(id) {
    DB.update('disbursements', id, { 
      status: 'Approved', 
      approvedBy: Auth.user.id,
      approvedAt: new Date().toISOString()
    });
    return { success: true };
  },

  release(id) {
    DB.update('disbursements', id, { 
      status: 'Released', 
      releasedBy: Auth.user.id,
      releasedAt: new Date().toISOString() 
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
  // Reimbursement Summary Report
  // ============================================================
  renderReport() {
    const entity = Auth.activeEntity;
    const items = DB.getWhere('disbursements', d => d.entity === entity && d.status === 'Released');

    const container = el('div');
    
    // Top actions bar
    const topActions = el('div', { class: 'actions-bar', style: 'margin-bottom: var(--spacing-lg);' });
    const topBackBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to List' });
    topBackBtn.addEventListener('click', () => { this.view = 'list'; App.handleRoute(); });
    topActions.appendChild(topBackBtn);
    container.appendChild(topActions);

    container.appendChild(el('h2', { text: 'Reimbursement Summary' }));

    // By Employee
    const byEmployee = {};
    items.forEach(d => {
      const emp = DB.getById('users', this.getEmployeeId(d))?.name || 'Unknown';
      byEmployee[emp] = (byEmployee[emp] || 0) + d.amount;
    });

    const empTable = el('table', { class: 'data-table' });
    empTable.appendChild(el('thead', {}, [el('tr', {}, [el('th', { text: 'Employee' }), el('th', { text: 'Total Reimbursed' })])]));
    const empBody = el('tbody');
    Object.entries(byEmployee).forEach(([name, total]) => {
      empBody.appendChild(el('tr', {}, [el('td', { text: name }), el('td', { text: formatPHP(total) })]));
    });
    empTable.appendChild(empBody);
    container.appendChild(el('h3', { text: 'By Employee' }));
    container.appendChild(empTable);

    // By Category
    const byCategory = {};
    items.forEach(d => {
      byCategory[d.category] = (byCategory[d.category] || 0) + d.amount;
    });

    const catTable = el('table', { class: 'data-table' });
    catTable.appendChild(el('thead', {}, [el('tr', {}, [el('th', { text: 'Category' }), el('th', { text: 'Total' })])]));
    const catBody = el('tbody');
    Object.entries(byCategory).forEach(([cat, total]) => {
      catBody.appendChild(el('tr', {}, [el('td', { text: cat }), el('td', { text: formatPHP(total) })]));
    });
    catTable.appendChild(catBody);
    container.appendChild(el('h3', { text: 'By Category' }));
    container.appendChild(catTable);

    // Fund split
    const firmTotal = items.filter(d => this.getFundSource(d) === 'Firm Fund').reduce((s, d) => s + d.amount, 0);
    const clientTotal = items.filter(d => this.getFundSource(d) === 'Client Fund').reduce((s, d) => s + d.amount, 0);

    const fundTable = el('table', { class: 'data-table' });
    fundTable.appendChild(el('thead', {}, [el('tr', {}, [el('th', { text: 'Fund Source' }), el('th', { text: 'Total' })])]));
    const fundBody = el('tbody');
    fundBody.appendChild(el('tr', {}, [el('td', { text: 'Firm Fund' }), el('td', { text: formatPHP(firmTotal) })]));
    fundBody.appendChild(el('tr', {}, [el('td', { text: 'Client Fund' }), el('td', { text: formatPHP(clientTotal) })]));
    fundTable.appendChild(fundBody);
    container.appendChild(el('h3', { text: 'By Fund Source' }));
    container.appendChild(fundTable);

    return container;
  }
};
