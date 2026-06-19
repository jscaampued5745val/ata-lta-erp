/**
 * Admin Panel — Users, Reset Data, Audit Log
 */

const Users = {
  view: 'users', // 'users' | 'audit' | 'pending'
  editingId: null,
  pendingDetailId: null,

  render() {
    const container = el('div', { class: 'page' });

    const titleBar = el('div', { class: 'page-title-bar-v2' });
    const h1 = el('h1', { id: 'admin-breadcrumb-h1', class: 'breadcrumb-h1' });
    titleBar.appendChild(h1);
    container.appendChild(titleBar);
    this.updateBreadcrumb(h1);

    const isAdmin = Auth.user.role === 'Admin';

    // Tabs
    const tabs = el('div', { class: 'admin-tabs' });
    tabs.style.marginBottom = '20px'; // align layout nicely below breadcrumb

    if (isAdmin) {
      const usersTab = el('button', {
        class: 'btn ' + (this.view === 'users' ? 'btn-primary' : 'btn-secondary'),
        text: 'Users'
      });
      usersTab.addEventListener('click', () => { this.view = 'users'; this.editingId = null; this.pendingDetailId = null; App.handleRoute(); });
      tabs.appendChild(usersTab);
    }

    const auditTab = el('button', {
      class: 'btn ' + (this.view === 'audit' ? 'btn-primary' : 'btn-secondary'),
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
        class: 'btn ' + (this.view === 'pending' ? 'btn-primary' : 'btn-secondary'),
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
        class: 'btn ' + (this.view === 'myPending' ? 'btn-primary' : 'btn-secondary'),
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

  updateBreadcrumb(h1, subpage) {
    if (!h1) h1 = document.getElementById('admin-breadcrumb-h1');
    if (!h1) return;
    this.clearNode(h1);
    
    if (this.pendingDetailId || subpage) {
      const baseLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Admin' });
      baseLink.addEventListener('click', () => {
        this.pendingDetailId = null;
        this.editingId = null;
        this.showUserList();
        App.handleRoute();
      });
      h1.appendChild(baseLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      
      let label = 'Detail';
      if (this.pendingDetailId) {
        label = 'Review Pending Change';
      } else if (subpage) {
        label = subpage;
      }
      h1.appendChild(document.createTextNode(label));
    } else {
      h1.appendChild(document.createTextNode('Admin'));
    }
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
      const editBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Edit' });
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
    this.updateBreadcrumb(null, userId ? 'Edit User' : 'Add User');
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
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel' });
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
    this.updateBreadcrumb(null);
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
    const noBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Cancel' });
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
    filters.appendChild(wrapFilterFieldWithClear(userFilter));

    // Client Filter
    const clientOptions = [{ value: '', text: 'All Clients' }];
    DB.getAll('clients').forEach(c => {
      clientOptions.push({ value: c.id, text: c.name });
    });
    const clientFilter = createSearchableDropdown({ placeholder: 'All Clients', options: clientOptions });
    filters.appendChild(clientFilter);

    filters.appendChild(el('span', { text: 'From:', style: 'font-size: 0.875rem; color: var(--color-text-muted);' }));
    const dateFrom = el('input', { type: 'date', class: 'form-select' });
    filters.appendChild(wrapFilterFieldWithClear(dateFrom));

    filters.appendChild(el('span', { text: 'To:', style: 'font-size: 0.875rem; color: var(--color-text-muted);' }));
    const dateTo = el('input', { type: 'date', class: 'form-select' });
    filters.appendChild(wrapFilterFieldWithClear(dateTo));

    const clearBtn = el('button', { class: 'btn btn-secondary', text: 'Clear' });
    clearBtn.addEventListener('click', () => {
      if (isAdmin) userFilter.value = '';
      clientFilter.value = '';
      dateFrom.value = '';
      dateTo.value = '';
      this.refreshAuditLog(tableContainer, isAdmin ? '' : Auth.user.id, '', '', '', '');
    });
    filters.appendChild(clearBtn);

    wrapper.appendChild(filters);

    const tableContainer = el('div');
    wrapper.appendChild(tableContainer);

    const triggerRefresh = () => {
      this.refreshAuditLog(tableContainer, userFilter.value, clientFilter.value, clientFilter.searchText, dateFrom.value, dateTo.value);
    };

    userFilter.addEventListener('change', triggerRefresh);
    clientFilter.addEventListener('change', triggerRefresh);
    clientFilter.addEventListener('input', triggerRefresh);
    dateFrom.addEventListener('change', triggerRefresh);
    dateTo.addEventListener('change', triggerRefresh);

    this.refreshAuditLog(tableContainer, isAdmin ? '' : Auth.user.id, '', '', '', '');

    return wrapper;
  },

  refreshAuditLog(container, userId, clientId, clientSearchText, dateFrom, dateTo) {
    this.clearNode(container);
    let logs = DB.getAll('auditLog');

    if (userId) {
      logs = logs.filter(l => l.userId === userId);
    }

    if (clientId || (clientSearchText && clientSearchText.trim() !== '')) {
      const selectedClient = clientId ? DB.getById('clients', clientId) : null;
      if (selectedClient && selectedClient.name === clientSearchText) {
        logs = logs.filter(l => {
          if (!l.details) return false;
          const detailsLower = l.details.toLowerCase();
          return detailsLower.includes(clientId.toLowerCase()) ||
                 detailsLower.includes(selectedClient.name.toLowerCase());
        });
      } else if (clientSearchText && clientSearchText.trim() !== '') {
        const query = clientSearchText.trim().toLowerCase();
        const matchingClients = DB.getAll('clients').filter(c =>
          c.id.toLowerCase().includes(query) || c.name.toLowerCase().includes(query)
        );
        logs = logs.filter(l => {
          if (!l.details) return false;
          const detailsLower = l.details.toLowerCase();
          if (detailsLower.includes(query)) return true;
          return matchingClients.some(c =>
            detailsLower.includes(c.id.toLowerCase()) || detailsLower.includes(c.name.toLowerCase())
          );
        });
      }
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

    const headerBar = el('div', { class: 'form-header-bar', style: 'margin-bottom: 20px;' });
    headerBar.appendChild(el('h2', { text: 'Pending Approvals Queue', style: 'margin: 0;' }));
    wrapper.appendChild(headerBar);

    // View Mode Toggle
    const viewMode = App.getPreferredViewMode('pendingApprovals') || 'board';
    const vmToggle = el('div', { class: 'view-mode-toggle', style: 'margin-bottom: var(--spacing-md);' });
    const vmTable = el('button', { html: ViewIcons.table + ' Table', class: viewMode === 'table' ? 'active' : '' });
    const vmBoard = el('button', { html: ViewIcons.board + ' Board', class: viewMode === 'board' ? 'active' : '' });
    const vmList = el('button', { html: ViewIcons.list + ' List', class: viewMode === 'list' ? 'active' : '' });
    vmTable.addEventListener('click', () => { App.setPreferredViewMode('pendingApprovals', 'table'); App.handleRoute(); });
    vmBoard.addEventListener('click', () => { App.setPreferredViewMode('pendingApprovals', 'board'); App.handleRoute(); });
    vmList.addEventListener('click', () => { App.setPreferredViewMode('pendingApprovals', 'list'); App.handleRoute(); });
    vmToggle.appendChild(vmTable);
    vmToggle.appendChild(vmBoard);
    vmToggle.appendChild(vmList);
    wrapper.appendChild(vmToggle);

    const contentContainer = el('div');
    wrapper.appendChild(contentContainer);

    const items = [
      ...pendingDisbursements.map(d => ({
        type: 'disbursement',
        id: d.id,
        title: `Expense: ${d.category}`,
        subtitle: d.description || 'No description provided',
        amount: d.amount,
        submittedBy: d.requestedBy,
        submittedAt: d.submittedAt,
        raw: d
      })),
      ...pendingChanges.map(pc => {
        const typeStr = pc.parentRecordId ? 'Edit' : 'New';
        const data = pc.proposedData || {};
        let title = `${pc.table.charAt(0).toUpperCase() + pc.table.slice(1)}`;
        let subtitle = `Pending approval for structural change (${typeStr})`;
        let amount = null;
        
        if (pc.table === 'workRequests') {
          title = `Work Request: ${data.title}`;
        } else if (pc.table === 'invoices') {
          title = `Invoice: #${data.invoiceNumber || data.id}`;
          amount = data.total;
        } else if (pc.table === 'transmittals') {
          title = `Transmittal: #${data.transmittalNumber || data.id}`;
        } else if (pc.table === 'clients') {
          title = `Client: ${data.name}`;
        }
        
        return {
          type: 'change',
          id: pc.id,
          title,
          subtitle,
          amount,
          submittedBy: pc.submittedBy,
          submittedAt: pc.submittedAt,
          raw: pc
        };
      })
    ];

    // Sort by submittedAt descending
    items.sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));

    if (viewMode === 'table') {
      this.renderTableView(contentContainer, items);
    } else if (viewMode === 'list') {
      this.renderListView(contentContainer, items);
    } else {
      this.renderBoardView(contentContainer, items);
    }

    return wrapper;
  },

  renderBoardView(container, items) {
    const board = el('div', { class: 'board-v2' });
    
    // Column 1: Expenses
    const expCol = el('div', { class: 'board-column-v2' });
    expCol.style.borderTop = '4px solid #f59e0b';
    const expHeader = el('div', { class: 'board-column-header-v2' });
    expHeader.appendChild(el('div', { class: 'board-column-title', text: 'Expense Submissions' }));
    expCol.appendChild(expHeader);
    const expCards = el('div', { class: 'board-cards-scroll' });
    expCol.appendChild(expCards);
    
    // Column 2: Billing Submissions
    const changeCol = el('div', { class: 'board-column-v2' });
    changeCol.style.borderTop = '4px solid #3b82f6';
    const changeHeader = el('div', { class: 'board-column-header-v2' });
    changeHeader.appendChild(el('div', { class: 'board-column-title', text: 'Billing Submissions' }));
    changeCol.appendChild(changeHeader);
    const changeCards = el('div', { class: 'board-cards-scroll' });
    changeCol.appendChild(changeCards);
    
    items.forEach(item => {
      const submitter = DB.getById('users', item.submittedBy);
      const card = el('div', {
        class: 'board-card-v2 hover-card',
        style: 'background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 12px; cursor: pointer; display: flex; flex-direction: column; transition: all 0.2s ease;'
      });
      card.addEventListener('click', () => {
        if (item.type === 'disbursement') {
          Disbursement.view = 'detail';
          Disbursement.detailId = item.id;
          location.hash = '#disbursement';
        } else {
          this.pendingDetailId = item.id;
          App.handleRoute();
        }
      });
      
      const topRow = el('div', { class: 'card-v2-top', style: 'margin-bottom: 8px;' });
      topRow.appendChild(el('span', { class: 'card-v2-date', text: formatDate(item.submittedAt) }));
      card.appendChild(topRow);
      
      card.appendChild(el('h4', {
        text: item.title,
        style: 'font-size: 0.875rem; font-weight: 600; color: #1e293b; margin: 0 0 4px; line-height: 1.3;'
      }));
      
      card.appendChild(el('p', {
        text: item.subtitle,
        style: 'font-size: 0.75rem; color: #64748b; margin: 0 0 10px; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; height: 32px;'
      }));
      
      card.appendChild(el('div', { style: 'height: 1px; background: #f1f5f9; margin-bottom: 10px;' }));
      
      const bottomRow = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-top: auto;' });
      const infoLeft = el('div', { style: 'display: flex; flex-direction: column;' });
      if (item.amount !== null && item.amount !== undefined) {
        infoLeft.appendChild(el('span', {
          text: formatPHP(item.amount),
          style: 'font-size: 0.875rem; font-weight: 700; color: #0f172a;'
        }));
      }
      infoLeft.appendChild(el('span', {
        text: `By: ${submitter ? submitter.name : 'System'}`,
        style: 'font-size: 10px; color: #64748b;'
      }));
      bottomRow.appendChild(infoLeft);
      
      const reviewBtn = el('button', {
        class: 'btn btn-secondary btn-sm',
        text: 'Review',
        style: 'font-size: 11px; padding: 4px 8px;'
      });
      bottomRow.appendChild(reviewBtn);
      
      card.appendChild(bottomRow);
      
      if (item.type === 'disbursement') {
        expCards.appendChild(card);
      } else {
        changeCards.appendChild(card);
      }
    });
    
    board.appendChild(expCol);
    board.appendChild(changeCol);
    container.appendChild(board);
  },

  renderTableView(container, items) {
    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Type', 'Title / Description', 'Amount', 'Submitted By', 'Date', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);
    
    const tbody = el('tbody');
    items.forEach(item => {
      const submitter = DB.getById('users', item.submittedBy);
      const tr = el('tr', { style: 'cursor: pointer;' });
      tr.addEventListener('click', () => {
        if (item.type === 'disbursement') {
          Disbursement.view = 'detail';
          Disbursement.detailId = item.id;
          location.hash = '#disbursement';
        } else {
          this.pendingDetailId = item.id;
          App.handleRoute();
        }
      });
      
      // Type
      const tdType = el('td');
      const badgeColor = item.type === 'disbursement' ? '#f59e0b' : '#3b82f6';
      const badgeBg = item.type === 'disbursement' ? '#fef3c7' : '#dbeafe';
      const badgeText = item.type === 'disbursement' ? 'Expense' : 'Billing';
      tdType.appendChild(el('span', {
        text: badgeText,
        style: `font-size: 10px; font-weight: 600; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: ${badgeBg}; color: ${badgeColor};`
      }));
      tr.appendChild(tdType);
      
      // Title / Description
      const tdTitle = el('td');
      tdTitle.appendChild(el('div', { text: item.title, style: 'font-weight: 600; color: #1e293b;' }));
      tdTitle.appendChild(el('div', { text: item.subtitle, style: 'font-size: 0.75rem; color: #64748b; margin-top: 2px;' }));
      tr.appendChild(tdTitle);
      
      // Amount
      const tdAmount = el('td', { text: item.amount !== null && item.amount !== undefined ? formatPHP(item.amount) : '—' });
      tr.appendChild(tdAmount);
      
      // Submitted By
      const tdUser = el('td', { text: submitter ? submitter.name : '—' });
      tr.appendChild(tdUser);
      
      // Date
      const tdDate = el('td', { text: formatDate(item.submittedAt) });
      tr.appendChild(tdDate);
      
      // Actions
      const tdAct = el('td');
      const reviewBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Review' });
      tdAct.appendChild(reviewBtn);
      tr.appendChild(tdAct);
      
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  },

  renderListView(container, items) {
    const list = el('div', { class: 'list-view' });
    items.forEach(item => {
      const submitter = DB.getById('users', item.submittedBy);
      const row = el('div', { class: 'list-item', style: 'cursor: pointer;' });
      row.addEventListener('click', () => {
        if (item.type === 'disbursement') {
          Disbursement.view = 'detail';
          Disbursement.detailId = item.id;
          location.hash = '#disbursement';
        } else {
          this.pendingDetailId = item.id;
          App.handleRoute();
        }
      });
      
      const badgeColor = item.type === 'disbursement' ? '#f59e0b' : '#3b82f6';
      const badgeBg = item.type === 'disbursement' ? '#fef3c7' : '#dbeafe';
      const badgeText = item.type === 'disbursement' ? 'Expense' : 'Billing';
      
      const leftPart = el('div', { style: 'display: flex; align-items: center; gap: 12px;' });
      leftPart.appendChild(el('span', {
        text: badgeText,
        style: `font-size: 10px; font-weight: 600; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; background: ${badgeBg}; color: ${badgeColor}; min-width: 60px; text-align: center;`
      }));
      
      const textInfo = el('div');
      textInfo.appendChild(el('div', { class: 'list-item-title', text: item.title }));
      
      let metaText = `Submitted by ${submitter ? submitter.name : 'System'} on ${formatDate(item.submittedAt)}`;
      if (item.amount !== null && item.amount !== undefined) {
        metaText += ` | Amount: ${formatPHP(item.amount)}`;
      }
      textInfo.appendChild(el('div', { class: 'list-item-meta', text: metaText }));
      leftPart.appendChild(textInfo);
      row.appendChild(leftPart);
      
      const rightWrap = el('div', { style: 'margin-left: auto;' });
      rightWrap.appendChild(el('button', { class: 'btn btn-secondary btn-sm', text: 'Review' }));
      row.appendChild(rightWrap);
      
      list.appendChild(row);
    });
    container.appendChild(list);
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
        tr.appendChild(el('td', { text: pc.rejectionReason || '—', style: 'color:var(--color-danger);font-weight:600;' }));

        const tdAct = el('td');
        const resubmitBtn = el('button', { class: 'btn btn-warning btn-sm', text: 'Resubmit' });
        resubmitBtn.addEventListener('click', () => {
          Workflow.showConfirm('Confirm Resubmission', 'Are you sure you want to resubmit this request for approval?', () => {
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

    const wrapper = el('div', { style: 'max-width: 800px; margin: 0 auto;' });
    
    // Header
    const header = el('div', { class: 'form-header-bar', style: 'border-bottom: 1px solid #e2e8f0; padding-bottom: 16px; margin-bottom: 24px;' });
    header.appendChild(el('h2', { text: 'Review Pending Change Request', style: 'margin: 0; font-size: 1.25rem; font-weight: 600; color: #1e3a8a;' }));
    
    const backBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '← Back to List' });
    backBtn.addEventListener('click', () => {
      this.pendingDetailId = null;
      App.handleRoute();
    });
    header.appendChild(backBtn);
    wrapper.appendChild(header);

    // Meta Card
    const submitter = DB.getById('users', pc.submittedBy);
    const metaCard = el('div', {
      style: 'background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin-bottom: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;'
    });
    
    const addMeta = (label, val) => {
      const g = el('div');
      g.appendChild(el('div', { text: label, style: 'font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 4px;' }));
      g.appendChild(el('div', { text: val, style: 'font-size: 0.875rem; font-weight: 500; color: #0f172a;' }));
      metaCard.appendChild(g);
    };

    const niceTableName = pc.table.charAt(0).toUpperCase() + pc.table.slice(1).replace(/([A-Z])/g, ' $1');
    addMeta('Record Entity/Table', niceTableName);
    addMeta('Submitted By', submitter ? submitter.name : pc.submittedBy);
    addMeta('Submission Date', formatDate(pc.submittedAt));
    
    wrapper.appendChild(metaCard);

    // If it's an invoice, show the proposed invoice fields for verification
    if (pc.table === 'invoices') {
      const proposed = pc.proposedData;
      const client = proposed ? DB.getById('clients', proposed.clientId) : null;
      const wr = proposed && proposed.workRequestId ? DB.getById('workRequests', proposed.workRequestId) : null;

      const invoiceReviewSection = el('div', { class: 'form-section', style: 'margin-bottom: 24px;' });
      invoiceReviewSection.appendChild(el('h3', { text: '📄 Invoice / Billing Details', style: 'font-size: 1rem; font-weight: 600; color: #1e3a8a; margin-bottom: 12px;' }));

      const invoiceCard = el('div', { class: 'card', style: 'border: 1px solid #cbd5e1; border-radius: 8px; padding: 20px; background: #f8fafc;' });

      // Meta Grid
      const grid = el('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 16px; margin-bottom: 16px;' });

      const addGridField = (lbl, val) => {
        const field = el('div');
        field.appendChild(el('div', { text: lbl, style: 'font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 4px;' }));
        field.appendChild(el('div', { text: val, style: 'font-size: 0.875rem; font-weight: 600; color: #1e293b;' }));
        grid.appendChild(field);
      };

      addGridField('Invoice Number', proposed ? proposed.invoiceNumber : '—');
      addGridField('Client', client ? client.name : '—');
      addGridField('Work Request / Project', wr ? wr.title : '—');
      addGridField('Issue Date', proposed ? formatDate(proposed.issueDate) : '—');
      addGridField('Due Date', proposed ? formatDate(proposed.dueDate) : '—');
      addGridField('Total Amount', proposed ? formatPHP(proposed.total) : '—');

      invoiceCard.appendChild(grid);

      // Line Items Sub-table
      if (proposed && Array.isArray(proposed.lineItems) && proposed.lineItems.length > 0) {
        invoiceCard.appendChild(el('div', { text: 'Line Items', style: 'font-size: 11px; font-weight: 600; text-transform: uppercase; color: #64748b; margin-bottom: 8px; margin-top: 12px;' }));
        const liTable = el('table', { class: 'data-table', style: 'width: 100%; font-size: 0.8125rem; background: white; border: 1px solid #e2e8f0; border-radius: 6px;' });
        const liThead = el('thead');
        const liThr = el('tr');
        ['Type', 'Description', 'Amount'].forEach(h => liThr.appendChild(el('th', { text: h, style: 'text-align: left; padding: 8px;' })));
        liThead.appendChild(liThr);
        liTable.appendChild(liThead);

        const liTbody = el('tbody');
        proposed.lineItems.forEach(item => {
          const tr = el('tr');
          tr.appendChild(el('td', { text: item.type, style: 'padding: 8px;' }));
          tr.appendChild(el('td', { text: item.description, style: 'padding: 8px;' }));
          tr.appendChild(el('td', { text: formatPHP(item.amount), style: 'padding: 8px; font-weight: 600;' }));
          liTbody.appendChild(tr);
        });
        liTable.appendChild(liTbody);
        invoiceCard.appendChild(liTable);
      }

      invoiceReviewSection.appendChild(invoiceCard);
      wrapper.appendChild(invoiceReviewSection);
    }

    // Diff / Change Details Section
    const diffSection = el('div', { class: 'form-section', style: 'margin-bottom: 24px;' });
    diffSection.appendChild(el('h3', { text: 'Change Comparison', style: 'font-size: 1rem; font-weight: 600; color: #1e293b; margin-bottom: 12px;' }));
    
    const diffContainer = el('div', { class: 'card', style: 'border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; background: white;' });
    
    // Custom diff tables rendering for beautiful layout
    const { current, proposed, diffs, isNew } = PendingChanges.buildDiff(pc);
    diffContainer.innerHTML = '';
    
    if (diffs.length === 0) {
      diffContainer.appendChild(el('p', { text: 'No changes detected between current and proposed data.', class: 'empty-state' }));
    } else {
      // Build a clean, styled table of changed fields only
      const diffTable = el('table', { class: 'report-table', style: 'width: 100%; border-collapse: collapse;' });
      const diffThead = el('thead');
      const diffThr = el('tr');
      ['Field', 'Proposed Value'].forEach(h => diffThr.appendChild(el('th', { text: h, style: 'text-align: left; padding: 10px; background: #f8fafc; border-bottom: 2px solid #e2e8f0; font-size: 0.8125rem;' })));
      diffThead.appendChild(diffThr);
      diffTable.appendChild(diffThead);
      
      const diffTbody = el('tbody');
      diffs.forEach(d => {
        const tr = el('tr');
        
        // Format the key to look nice
        const niceKey = d.key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        
        // Format values
        let oldVal = d.old;
        let newVal = d.new;
        
        // If it's a JSON or long array/object, make it clean
        if (oldVal.startsWith('[') || oldVal.startsWith('{')) {
          try {
            const parsed = JSON.parse(oldVal);
            if (Array.isArray(parsed)) oldVal = `${parsed.length} item(s)`;
          } catch(e) {}
        }
        if (newVal.startsWith('[') || newVal.startsWith('{')) {
          try {
            const parsed = JSON.parse(newVal);
            if (Array.isArray(parsed)) newVal = `${parsed.length} item(s)`;
          } catch(e) {}
        }
        
        tr.appendChild(el('td', { text: niceKey, style: 'padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; font-size: 0.8125rem; color: #334155;' }));
        tr.appendChild(el('td', { text: newVal, style: 'padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; font-size: 0.8125rem; color: #16a34a; background: #f0fdf4;' }));
        diffTbody.appendChild(tr);
      });
      diffTable.appendChild(diffTbody);
      diffContainer.appendChild(diffTable);
    }
    
    diffSection.appendChild(diffContainer);
    wrapper.appendChild(diffSection);

    // Actions Footer
    const actions = el('div', { 
      style: 'display: flex; gap: 12px; border-top: 1px solid #e2e8f0; padding-top: 20px; margin-top: 24px;' 
    });

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
      const withdrawBtn = el('button', { class: 'btn btn-secondary', text: 'Withdraw Submission' });
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
