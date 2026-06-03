/**
 * Admin Panel — Users, Reset Data, Audit Log
 */

const Users = {
  view: 'users', // 'users' | 'audit' | 'pending'
  editingId: null,
  pendingDetailId: null,

  render() {
    const container = el('div', { class: 'page' });
    container.appendChild(el('h1', { text: 'Admin' }));

    const isAdmin = Auth.user.role === 'Admin';

    // Tabs
    const tabs = el('div', { class: 'admin-tabs' });

    if (isAdmin) {
      const usersTab = el('button', {
        class: 'btn ' + (this.view === 'users' ? 'btn-primary' : 'btn-ghost'),
        text: 'Users'
      });
      usersTab.addEventListener('click', () => { this.view = 'users'; this.editingId = null; this.pendingDetailId = null; App.handleRoute(); });
      tabs.appendChild(usersTab);
    }

    const auditTab = el('button', {
      class: 'btn ' + (this.view === 'audit' ? 'btn-primary' : 'btn-ghost'),
      text: 'Audit Log'
    });
    auditTab.addEventListener('click', () => { this.view = 'audit'; this.editingId = null; this.pendingDetailId = null; App.handleRoute(); });
    tabs.appendChild(auditTab);

    if (isAdmin) {
      const entity = Auth.activeEntity;
      const pendingDisbursements = DB.getWhere('disbursements', d => d.entity === entity && (d.status === 'Submitted' || d.status === 'Under Review'));
      const pendingChanges = PendingChanges.getAllPending();
      const totalPending = pendingDisbursements.length + pendingChanges.length;

      const pendingTab = el('button', {
        class: 'btn ' + (this.view === 'pending' ? 'btn-primary' : 'btn-ghost'),
        text: 'Pending Approvals'
      });
      if (totalPending > 0) {
        const tabBadge = el('span', { class: 'nav-badge', style: 'margin-left:6px;', text: totalPending > 99 ? '99+' : String(totalPending) });
        pendingTab.appendChild(tabBadge);
      }
      pendingTab.addEventListener('click', () => { this.view = 'pending'; this.editingId = null; this.pendingDetailId = null; App.handleRoute(); });
      tabs.appendChild(pendingTab);
    } else {
      const myPendingTab = el('button', {
        class: 'btn ' + (this.view === 'myPending' ? 'btn-primary' : 'btn-ghost'),
        text: 'My Pending Submissions'
      });
      myPendingTab.addEventListener('click', () => { this.view = 'myPending'; this.editingId = null; this.pendingDetailId = null; App.handleRoute(); });
      tabs.appendChild(myPendingTab);
    }

    container.appendChild(tabs);

    if (this.view === 'users' && isAdmin) {
      container.appendChild(this.renderUsersSection());
    } else if (this.view === 'audit') {
      container.appendChild(this.renderAuditSection());
    } else if (this.view === 'pending' && isAdmin) {
      container.appendChild(this.renderPendingSection());
    } else if (this.view === 'myPending' && !isAdmin) {
      container.appendChild(this.renderMyPendingSection());
    } else if (!isAdmin) {
      this.view = 'myPending';
      container.appendChild(this.renderMyPendingSection());
    } else {
      container.appendChild(this.renderUsersSection());
    }

    return container;
  },

  init() {},

  // ============================================================
  // Users Section
  // ============================================================
  renderUsersSection() {
    const wrapper = el('div');

    // Reset Demo Data section
    const resetSection = el('div', { class: 'reset-section' });
    resetSection.appendChild(el('h3', { text: 'Reset Demo Data' }));
    resetSection.appendChild(el('p', { text: 'This will reset all data to the original demo state. This action cannot be undone.' }));
    const resetBtn = el('button', { class: 'btn btn-danger', text: 'Reset Demo Data' });
    resetBtn.addEventListener('click', () => this.handleReset(resetSection));
    resetSection.appendChild(resetBtn);
    wrapper.appendChild(resetSection);

    // Actions bar
    const actions = el('div', { class: 'actions-bar' });
    const addBtn = el('button', { class: 'btn btn-primary', text: 'Add User' });
    addBtn.addEventListener('click', () => this.showUserForm());
    actions.appendChild(addBtn);
    wrapper.appendChild(actions);

    // List container
    const listContainer = el('div', { class: 'list-container' });
    wrapper.appendChild(listContainer);
    this.renderUserList(listContainer);

    // Form container
    const formContainer = el('div', { class: 'form-container hidden' });
    wrapper.appendChild(formContainer);

    return wrapper;
  },

  clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  },

  renderUserList(container) {
    this.clearNode(container);
    const users = DB.getAll('users');

    if (users.length === 0) {
      container.appendChild(el('p', { text: 'No users found.', class: 'empty-state' }));
      return;
    }

    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Name', 'Email', 'Role', 'Entities', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = el('tbody');
    users.forEach(u => {
      const tr = el('tr');
      tr.appendChild(el('td', { text: u.name }));
      tr.appendChild(el('td', { text: u.email }));
      tr.appendChild(el('td')).appendChild(this.roleBadge(u.role));
      tr.appendChild(el('td', { text: (u.entities || []).join(', ') }));
      const tdAct = el('td');
      const editBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'Edit' });
      editBtn.addEventListener('click', () => this.showUserForm(u.id));
      tdAct.appendChild(editBtn);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  },

  roleBadge(role) {
    const map = {
      'Admin': 'badge-danger',
      'Manager': 'badge-warning',
      'Staff': 'badge-info',
      'Viewer': 'badge-success'
    };
    return el('span', { class: 'badge ' + (map[role] || ''), text: role });
  },

  showUserForm(userId) {
    const container = document.querySelector('#content .form-container');
    const list = document.querySelector('#content .list-container');
    const actions = document.querySelector('#content .actions-bar');
    const resetSection = document.querySelector('#content .reset-section');
    if (container) container.classList.remove('hidden');
    if (list) list.classList.add('hidden');
    if (actions) actions.classList.add('hidden');
    if (resetSection) resetSection.classList.add('hidden');

    this.editingId = userId || null;
    const user = userId ? DB.getById('users', userId) : null;

    this.clearNode(container);
    container.appendChild(el('h2', { text: userId ? 'Edit User' : 'Add User' }));

    const form = el('form', { class: 'form-stacked user-form' });

    // Name
    const nameGroup = el('div', { class: 'form-group' });
    nameGroup.appendChild(el('label', { text: 'Name *' }));
    nameGroup.appendChild(el('input', { type: 'text', name: 'name', value: user ? user.name : '', required: true }));
    nameGroup.appendChild(el('span', { class: 'field-error hidden', text: '' }));
    form.appendChild(nameGroup);

    // Email
    const emailGroup = el('div', { class: 'form-group' });
    emailGroup.appendChild(el('label', { text: 'Email *' }));
    emailGroup.appendChild(el('input', { type: 'email', name: 'email', value: user ? user.email : '', required: true }));
    emailGroup.appendChild(el('span', { class: 'field-error hidden', text: '' }));
    form.appendChild(emailGroup);

    // Password
    const pwGroup = el('div', { class: 'form-group' });
    pwGroup.appendChild(el('label', { text: userId ? 'Password (leave blank to keep current)' : 'Password *' }));
    pwGroup.appendChild(el('input', { type: 'password', name: 'password', required: !userId }));
    pwGroup.appendChild(el('span', { class: 'field-error hidden', text: '' }));
    form.appendChild(pwGroup);

    // Role
    const roleGroup = el('div', { class: 'form-group' });
    roleGroup.appendChild(el('label', { text: 'Role *' }));
    const roleSel = el('select', { name: 'role', required: true });
    ['Admin', 'Manager', 'Staff', 'Viewer'].forEach(r => {
      const opt = el('option', { value: r, text: r });
      if (user && user.role === r) opt.selected = true;
      roleSel.appendChild(opt);
    });
    roleGroup.appendChild(roleSel);
    roleGroup.appendChild(el('span', { class: 'field-error hidden', text: '' }));
    form.appendChild(roleGroup);

    // Entity access
    const entityGroup = el('div', { class: 'form-group' });
    entityGroup.appendChild(el('label', { text: 'Entity Access *' }));
    const entityWrap = el('div', { class: 'entity-checkboxes' });
    ['ATA', 'LTA'].forEach(e => {
      const label = el('label', { class: 'checkbox-label' });
      const cb = el('input', { type: 'checkbox', name: 'entities', value: e });
      if (user && user.entities && user.entities.includes(e)) cb.checked = true;
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + e));
      entityWrap.appendChild(label);
    });
    entityGroup.appendChild(entityWrap);
    entityGroup.appendChild(el('span', { class: 'field-error hidden', text: '' }));
    form.appendChild(entityGroup);

    const btnGroup = el('div', { class: 'form-group form-actions' });
    const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Save User' });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.showUserList());
    btnGroup.appendChild(saveBtn);
    btnGroup.appendChild(cancelBtn);
    form.appendChild(btnGroup);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitUserForm(form);
    });

    container.appendChild(form);
  },

  showUserList() {
    this.editingId = null;
    const container = document.querySelector('#content .form-container');
    const list = document.querySelector('#content .list-container');
    const actions = document.querySelector('#content .actions-bar');
    const resetSection = document.querySelector('#content .reset-section');
    if (container) { this.clearNode(container); container.classList.add('hidden'); }
    if (list) list.classList.remove('hidden');
    if (actions) actions.classList.remove('hidden');
    if (resetSection) resetSection.classList.remove('hidden');
    this.renderUserList(list);
  },

  submitUserForm(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const entityCheckboxes = form.querySelectorAll('input[name="entities"]:checked');
    const entities = Array.from(entityCheckboxes).map(cb => cb.value);

    // Clear previous errors
    form.querySelectorAll('.field-error').forEach(e => { e.classList.add('hidden'); e.textContent = ''; });

    const errors = [];
    if (!data.name || data.name.trim().length < 2) {
      errors.push({ field: 'name', msg: 'Name is required (min 2 characters).' });
    }
    if (!data.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
      errors.push({ field: 'email', msg: 'Please enter a valid email address.' });
    }
    if (!this.editingId && (!data.password || data.password.length < 1)) {
      errors.push({ field: 'password', msg: 'Password is required for new users.' });
    }
    if (entities.length === 0) {
      errors.push({ field: 'entities', msg: 'At least one entity must be selected.' });
    }

    if (errors.length > 0) {
      errors.forEach(err => {
        const group = form.querySelector('[name="' + err.field + '"]')?.closest('.form-group');
        if (group) {
          const elErr = group.querySelector('.field-error');
          if (elErr) {
            elErr.textContent = err.msg;
            elErr.classList.remove('hidden');
          }
        }
      });
      return;
    }

    const record = {
      name: data.name.trim(),
      email: data.email.trim(),
      role: data.role,
      entities: entities,
      isActive: true
    };

    if (this.editingId) {
      if (data.password && data.password.trim()) {
        record.password = data.password.trim();
      }
      DB.update('users', this.editingId, record);
    } else {
      record.id = generateId('u');
      record.password = data.password.trim();
      record.createdAt = new Date().toISOString();
      DB.insert('users', record);
    }

    this.showUserList();
  },

  // ============================================================
  // Reset Demo Data
  // ============================================================
  handleReset(section) {
    // Remove any existing confirmation
    const existing = section.querySelector('.reset-confirm');
    if (existing) existing.remove();

    const confirmWrap = el('div', { class: 'reset-confirm' });
    confirmWrap.appendChild(el('span', { text: 'Are you sure? This will erase all changes.', style: 'color: var(--color-danger); font-size: 0.875rem;' }));
    const yesBtn = el('button', { class: 'btn btn-danger btn-sm', text: 'Yes, Reset' });
    const noBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'Cancel' });
    confirmWrap.appendChild(yesBtn);
    confirmWrap.appendChild(noBtn);
    section.appendChild(confirmWrap);

    yesBtn.addEventListener('click', () => {
      DB.resetToSeed();
      const msg = el('p', { text: 'Data reset successfully. Reloading...', style: 'color: var(--color-success); margin-top: var(--spacing-sm);' });
      section.appendChild(msg);
      setTimeout(() => location.reload(), 800);
    });

    noBtn.addEventListener('click', () => confirmWrap.remove());
  },

  // ============================================================
  // Audit Log
  // ============================================================
  renderAuditSection() {
    const wrapper = el('div');
    const isAdmin = Auth.user.role === 'Admin';

    // Filters
    const filters = el('div', { class: 'audit-filters' });

    const userFilter = el('select', { class: 'form-select' });
    userFilter.appendChild(el('option', { value: '', text: 'All Users' }));
    const users = DB.getAll('users');
    users.forEach(u => {
      const opt = el('option', { value: u.id, text: u.name });
      userFilter.appendChild(opt);
    });
    if (!isAdmin) {
      userFilter.value = Auth.user.id;
      userFilter.disabled = true;
    }
    filters.appendChild(userFilter);

    filters.appendChild(el('span', { text: 'From:', style: 'font-size: 0.875rem; color: var(--color-text-muted);' }));
    const dateFrom = el('input', { type: 'date', class: 'form-select' });
    filters.appendChild(dateFrom);

    filters.appendChild(el('span', { text: 'To:', style: 'font-size: 0.875rem; color: var(--color-text-muted);' }));
    const dateTo = el('input', { type: 'date', class: 'form-select' });
    filters.appendChild(dateTo);

    const filterBtn = el('button', { class: 'btn btn-primary', text: 'Filter' });
    filterBtn.addEventListener('click', () => this.refreshAuditLog(tableContainer, userFilter.value, dateFrom.value, dateTo.value));
    filters.appendChild(filterBtn);

    const clearBtn = el('button', { class: 'btn btn-ghost', text: 'Clear' });
    clearBtn.addEventListener('click', () => {
      if (isAdmin) userFilter.value = '';
      dateFrom.value = '';
      dateTo.value = '';
      this.refreshAuditLog(tableContainer, isAdmin ? '' : Auth.user.id, '', '');
    });
    filters.appendChild(clearBtn);

    wrapper.appendChild(filters);

    const tableContainer = el('div');
    wrapper.appendChild(tableContainer);
    this.refreshAuditLog(tableContainer, isAdmin ? '' : Auth.user.id, '', '');

    return wrapper;
  },

  refreshAuditLog(container, userId, dateFrom, dateTo) {
    this.clearNode(container);
    let logs = DB.getAll('auditLog');

    if (userId) {
      logs = logs.filter(l => l.userId === userId);
    }

    if (dateFrom) {
      const from = new Date(dateFrom + 'T00:00:00');
      logs = logs.filter(l => new Date(l.timestamp) >= from);
    }

    if (dateTo) {
      const to = new Date(dateTo + 'T23:59:59');
      logs = logs.filter(l => new Date(l.timestamp) <= to);
    }

    // Sort newest first
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    if (logs.length === 0) {
      container.appendChild(el('p', { text: 'No audit log entries found.', class: 'empty-state' }));
      return;
    }

    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Timestamp', 'User', 'Action', 'Entity', 'Details'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = el('tbody');
    logs.forEach(l => {
      const user = DB.getById('users', l.userId);
      const tr = el('tr');
      const ts = new Date(l.timestamp);
      tr.appendChild(el('td', { text: formatDate(l.timestamp) + ' ' + ts.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }) }));
      tr.appendChild(el('td', { text: user ? user.name : l.userId }));
      tr.appendChild(el('td', { text: l.action }));
      tr.appendChild(el('td')).appendChild(el('span', { class: 'badge badge-' + (l.entity === 'ATA' ? 'ata' : 'lta'), text: l.entity }));
      tr.appendChild(el('td', { text: l.details || '—' }));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  },

  // ============================================================
  // Pending Approvals Section (merged: PendingChanges + Disbursement Submissions)
  // ============================================================
  renderPendingSection() {
    const wrapper = el('div');

    if (this.pendingDetailId) {
      wrapper.appendChild(this.renderPendingDetail(this.pendingDetailId));
      return wrapper;
    }

    const entity = Auth.activeEntity;
    const pendingChanges = PendingChanges.getAllPending();
    const pendingDisbursements = DB.getWhere('disbursements', d => d.entity === entity && (d.status === 'Submitted' || d.status === 'Under Review'));

    if (pendingChanges.length === 0 && pendingDisbursements.length === 0) {
      wrapper.appendChild(el('p', { text: 'No pending approvals.', class: 'empty-state' }));
      return wrapper;
    }

    // ── Disbursement Submissions ──
    if (pendingDisbursements.length > 0) {
      wrapper.appendChild(el('h3', { text: 'Disbursement Submissions', style: 'margin-top:0;' }));
      const dTable = el('table', { class: 'data-table' });
      const dThead = el('thead');
      const dThr = el('tr');
      ['Category', 'Description', 'Amount', 'Requested By', 'Date', 'Actions'].forEach(h => dThr.appendChild(el('th', { text: h })));
      dThead.appendChild(dThr);
      dTable.appendChild(dThead);

      const dBody = el('tbody');
      pendingDisbursements.forEach(d => {
        const requester = DB.getById('users', d.requestedBy);
        const tr = el('tr');
        tr.appendChild(el('td', { text: d.category }));
        tr.appendChild(el('td', { text: d.description }));
        tr.appendChild(el('td', { text: formatPHP(d.amount) }));
        tr.appendChild(el('td', { text: requester ? requester.name : '—' }));
        tr.appendChild(el('td', { text: formatDate(d.submittedAt) }));

        const tdAct = el('td');
        const reviewBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Review' });
        reviewBtn.addEventListener('click', () => {
          Disbursement.view = 'detail';
          Disbursement.detailId = d.id;
          location.hash = '#disbursement';
        });
        tdAct.appendChild(reviewBtn);
        tr.appendChild(tdAct);
        dBody.appendChild(tr);
      });
      dTable.appendChild(dBody);
      wrapper.appendChild(dTable);
    }

    // ── Structural Change Approvals ──
    if (pendingChanges.length > 0) {
      if (pendingDisbursements.length > 0) {
        wrapper.appendChild(el('h3', { text: 'Structural Change Approvals', style: 'margin-top:var(--spacing-lg);' }));
      }
      const table = el('table', { class: 'data-table' });
      const thead = el('thead');
      const thr = el('tr');
      ['Table', 'Submitted By', 'Date', 'Type', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
      thead.appendChild(thr);
      table.appendChild(thead);

      const tbody = el('tbody');
      pendingChanges.forEach(pc => {
        const submitter = DB.getById('users', pc.submittedBy);
        const tr = el('tr');
        tr.appendChild(el('td', { text: pc.table }));
        tr.appendChild(el('td', { text: submitter ? submitter.name : pc.submittedBy }));
        tr.appendChild(el('td', { text: formatDate(pc.submittedAt) }));
        tr.appendChild(el('td', { text: pc.parentRecordId ? 'Edit' : 'New' }));

        const tdAct = el('td');
        const reviewBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Review' });
        reviewBtn.addEventListener('click', () => {
          this.pendingDetailId = pc.id;
          App.handleRoute();
        });
        tdAct.appendChild(reviewBtn);
        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrapper.appendChild(table);
    }

    return wrapper;
  },

  renderMyPendingSection() {
    const wrapper = el('div');

    if (this.pendingDetailId) {
      wrapper.appendChild(this.renderPendingDetail(this.pendingDetailId));
      return wrapper;
    }

    const pending = PendingChanges.getPendingForUser(Auth.user.id);
    const rejected = PendingChanges.getRejectedForUser(Auth.user.id);
    if (pending.length === 0 && rejected.length === 0) {
      wrapper.appendChild(el('p', { text: 'No pending submissions.', class: 'empty-state' }));
      return wrapper;
    }

    if (pending.length > 0) {
      const table = el('table', { class: 'data-table' });
      const thead = el('thead');
      const thr = el('tr');
      ['Table', 'Date', 'Type', 'Status', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
      thead.appendChild(thr);
      table.appendChild(thead);

      const tbody = el('tbody');
      pending.forEach(pc => {
        const tr = el('tr');
        tr.appendChild(el('td', { text: pc.table }));
        tr.appendChild(el('td', { text: formatDate(pc.submittedAt) }));
        tr.appendChild(el('td', { text: pc.parentRecordId ? 'Edit' : 'New' }));
        tr.appendChild(el('td', { text: pc.status }));

        const tdAct = el('td');
        const reviewBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Review' });
        reviewBtn.addEventListener('click', () => {
          this.pendingDetailId = pc.id;
          App.handleRoute();
        });
        tdAct.appendChild(reviewBtn);

        if (pc.status === 'pending') {
          const withdrawBtn = el('button', { class: 'btn btn-danger btn-sm', text: 'Withdraw' });
          withdrawBtn.addEventListener('click', () => {
            Workflow.showConfirm('Confirm Withdrawal', 'Are you sure you want to withdraw this pending submission?', () => {
              PendingChanges.delete(pc.id);
              App.handleRoute();
            }, 'danger');
          });
          tdAct.appendChild(withdrawBtn);
        }

        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrapper.appendChild(table);
    }

    if (rejected.length > 0) {
      wrapper.appendChild(el('h3', { text: 'Rejected Submissions', style: 'margin-top:var(--spacing-lg);' }));
      const table = el('table', { class: 'data-table' });
      const thead = el('thead');
      const thr = el('tr');
      ['Table', 'Date', 'Type', 'Rejection Reason', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
      thead.appendChild(thr);
      table.appendChild(thead);

      const tbody = el('tbody');
      rejected.forEach(pc => {
        const tr = el('tr');
        tr.appendChild(el('td', { text: pc.table }));
        tr.appendChild(el('td', { text: formatDate(pc.submittedAt) }));
        tr.appendChild(el('td', { text: pc.parentRecordId ? 'Edit' : 'New' }));
        tr.appendChild(el('td', { text: pc.rejectionReason || '—' }));

        const tdAct = el('td');
        const resubmitBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Resubmit' });
        resubmitBtn.addEventListener('click', () => {
          Workflow.showConfirm('Confirm Resubmit', 'Are you sure you want to resubmit this rejected submission?', () => {
            PendingChanges.resubmit(pc.id);
            App.handleRoute();
          }, 'warning');
        });
        tdAct.appendChild(resubmitBtn);
        tr.appendChild(tdAct);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrapper.appendChild(table);
    }

    return wrapper;
  },

  renderPendingDetail(pendingId) {
    const pc = PendingChanges.getById(pendingId);
    if (!pc) {
      this.pendingDetailId = null;
      return el('p', { text: 'Pending change not found.', class: 'empty-state' });
    }

    const canApprove = Auth.user.role === 'Admin' || Auth.user.role === 'Manager';
    const isSubmitter = pc.submittedBy === Auth.user.id;

    const wrapper = el('div');
    const header = el('div', { class: 'form-header-bar' });
    header.appendChild(el('h2', { text: 'Review Pending Change' }));

    const backBtn = el('button', { class: 'btn btn-ghost', text: 'Back to List' });
    backBtn.addEventListener('click', () => {
      this.pendingDetailId = null;
      App.handleRoute();
    });
    header.appendChild(backBtn);
    wrapper.appendChild(header);

    const meta = el('div', { style: 'margin-bottom:var(--spacing-md); font-size:0.875rem; color:var(--color-text-muted);' });
    const submitter = DB.getById('users', pc.submittedBy);
    meta.appendChild(el('strong', { text: 'Table: ' }));
    meta.appendChild(document.createTextNode(pc.table));
    meta.appendChild(el('span', { style: 'margin:0 12px;', text: '|' }));
    meta.appendChild(el('strong', { text: 'Submitted By: ' }));
    meta.appendChild(document.createTextNode(submitter ? submitter.name : pc.submittedBy));
    meta.appendChild(el('span', { style: 'margin:0 12px;', text: '|' }));
    meta.appendChild(el('strong', { text: 'Date: ' }));
    meta.appendChild(document.createTextNode(formatDate(pc.submittedAt)));
    wrapper.appendChild(meta);

    const diffContainer = el('div', { class: 'card', style: 'margin-bottom:var(--spacing-lg);' });
    PendingChanges.renderDiffTable(pc, diffContainer);
    wrapper.appendChild(diffContainer);

    const actions = el('div', { class: 'form-actions-top' });

    if (canApprove) {
      const approveBtn = el('button', { class: 'btn btn-success', text: 'Approve Change' });
      approveBtn.addEventListener('click', () => {
        Workflow.showConfirm('Confirm Approval', 'Are you sure you want to approve this change?', () => {
          PendingChanges.approve(pc.id);
          this.pendingDetailId = null;
          App.handleRoute();
        }, 'success');
      });
      actions.appendChild(approveBtn);

      const rejectBtn = el('button', { class: 'btn btn-danger', text: 'Reject' });
      rejectBtn.addEventListener('click', () => {
        const reason = prompt('Enter rejection reason:');
        if (reason !== null) {
          PendingChanges.reject(pc.id, reason);
          this.pendingDetailId = null;
          App.handleRoute();
        }
      });
      actions.appendChild(rejectBtn);
    } else if (isSubmitter && pc.status === 'pending') {
      const withdrawBtn = el('button', { class: 'btn btn-ghost', text: 'Withdraw Submission' });
      withdrawBtn.addEventListener('click', () => {
        Workflow.showConfirm('Confirm Withdrawal', 'Are you sure you want to withdraw this submission?', () => {
          PendingChanges.delete(pc.id);
          this.pendingDetailId = null;
          App.handleRoute();
        }, 'danger');
      });
      actions.appendChild(withdrawBtn);
    }

    wrapper.appendChild(actions);
    return wrapper;
  }
};
