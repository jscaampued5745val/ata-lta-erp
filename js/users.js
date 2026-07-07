/**
 * Admin Panel — Users, Reset Data, Audit Log
 */

const Users = {
  view: 'users', // 'users' | 'audit' | 'pending'
  editingId: null,
  pendingDetailId: null,
  myPendingViewMode: 'table',
  myRequestsViewMode: 'table',
  filters: {
    category: '',
    status: '',
    date: ''
  },
  pendingCategory: sessionStorage.getItem('admin_pending_category') || 'all',

  render() {
    const container = el('div', { class: 'page admin-tab-page' });

    // Keep the main page header — use role-appropriate title
    const isAdmin = Auth.user.role === 'Admin';
    const titleBar = el('div', { class: 'page-title-bar-v2' });
    const h1 = el('h1', { class: 'page-title-h1', text: isAdmin ? 'Admin' : 'My Submissions' });
    titleBar.appendChild(h1);
    container.appendChild(titleBar);

    const canManageUsers = Auth.can('users:view');

    // Initialize view state dynamically to prevent view state bleed-through
    if (this.lastUserId !== Auth.user.id) {
      this.lastUserId = Auth.user.id;
      if (canManageUsers) {
        this.view = 'users';
      } else {
        const defaultToRequests = (Auth.user.role === 'Operations' || Auth.user.role === 'Manager');
        this.view = defaultToRequests ? 'myRequests' : 'myPending';
      }
      this.filters = { category: '', status: '', dateFrom: '', dateTo: '' };
    }

    if (canManageUsers) {
      const validAdminViews = ['users', 'audit', 'pending'];
      if (!validAdminViews.includes(this.view)) this.view = 'users';
    } else {
      const showRequestsTab = (Auth.user.role === 'Operations' || Auth.user.role === 'Manager');
      const isManager = Auth.user.role === 'Manager';
      const validViews = ['myPending'];
      if (showRequestsTab) validViews.push('myRequests');
      if (isManager) validViews.push('pending');

      if (!validViews.includes(this.view)) {
        this.view = showRequestsTab ? 'myRequests' : 'myPending';
      }
    }

    // Internal Admin tabs use the same module-tab-link style as other pages
    container.appendChild(this.renderTabNav());



    if (this.view === 'users' && canManageUsers) {
      container.appendChild(this.renderUsersSection());
    } else if (this.view === 'audit' && canManageUsers) {
      container.appendChild(this.renderAuditSection());
    } else if (this.view === 'pending' && (canManageUsers || Auth.user.role === 'Manager')) {
      container.appendChild(this.renderPendingSection());
    } else if (this.view === 'myPending' && !canManageUsers) {
      container.appendChild(this.renderMyPendingSection());
    } else if (this.view === 'myRequests' && !canManageUsers) {
      container.appendChild(this.renderMyRequestsSection());
    } else if (!canManageUsers) {
      if (this.view === 'myRequests') {
        container.appendChild(this.renderMyRequestsSection());
      } else if (this.view === 'pending' && Auth.user.role === 'Manager') {
        container.appendChild(this.renderPendingSection());
      } else {
        container.appendChild(this.renderMyPendingSection());
      }
    }

    return container;
  },

  renderTabNav() {
    const canManageUsers = Auth.can('users:view');

    const changeTab = (key) => {
      this.view = key;
      this.editingId = null;
      this.pendingDetailId = null;
      App.handleRoute();
    };

    if (canManageUsers) {
      const userCount = (DB.getAll('users') || []).length;
      const auditCount = (DB.getAll('auditLog') || []).length;
      const pendingCount = (() => {
        if (typeof this.getPendingCategories !== 'function') return 0;
        const categories = this.getPendingCategories();
        return Object.values(categories).reduce((sum, arr) => sum + arr.length, 0);
      })();

      const tabs = [
        { key: 'users', label: 'Users', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>', count: userCount },
        { key: 'audit', label: 'Audit Log', icon: BoardCardIcons.document, count: auditCount },
        { key: 'pending', label: 'Pending Approvals', icon: BoardCardIcons.checkCircle, count: pendingCount }
      ];
      return renderModuleTabNav(tabs, this.view, changeTab);
    }

    const myPendingCount = (PendingChanges.getPendingForUser(Auth.user.id) || []).length;
    const tabs = [
      { key: 'myPending', label: 'My Pending Submissions', icon: BoardCardIcons.checklist, count: myPendingCount }
    ];
    const showRequestsTab = (Auth.user.role === 'Operations' || Auth.user.role === 'Manager');
    if (showRequestsTab) {
      const myRequestsCount = DB.getWhere('operationsRequests', r => r.requestedBy === Auth.user.id).length;
      tabs.push({ key: 'myRequests', label: 'My Requests', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>', count: myRequestsCount });
    }
    const isManager = Auth.user.role === 'Manager';
    if (isManager) {
      const pendingCount = (() => {
        if (typeof this.getPendingCategories !== 'function') return 0;
        const categories = this.getPendingCategories();
        return Object.values(categories).reduce((sum, arr) => sum + arr.length, 0);
      })();
      tabs.push({ key: 'pending', label: 'Pending Approvals', icon: BoardCardIcons.checkCircle, count: pendingCount });
    }
    return renderModuleTabNav(tabs, this.view, changeTab);
  },

  updateBreadcrumb(h1, subpage) {
    if (!h1) h1 = document.getElementById('admin-breadcrumb-h1');
    if (!h1) return;
    this.clearNode(h1);
    const isAdmin = Auth.user.role === 'Admin';
    const sectionLabel = (() => {
      if (this.pendingDetailId) return 'Review Pending Change';
      if (subpage) return subpage;
      switch (this.view) {
        case 'audit': return 'Audit Log';
        case 'pending': return 'Pending Approvals';
        case 'myPending': return 'My Pending Submissions';
        case 'myRequests': return 'My Requests';
        default: return isAdmin ? 'Admin' : 'My Submissions';
      }
    })();

    if (this.view !== 'users' || this.pendingDetailId || subpage) {
      const baseLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: isAdmin ? 'Admin' : 'My Submissions' });
      baseLink.addEventListener('click', () => {
        this.pendingDetailId = null;
        this.editingId = null;
        if (isAdmin) {
          this.view = 'users';
          this.showUserList();
        }
        App.handleRoute();
      });
      h1.appendChild(baseLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      h1.appendChild(document.createTextNode(sectionLabel));
    } else {
      h1.appendChild(document.createTextNode(sectionLabel));
    }
  },

  init() {},

  // ============================================================
  // Users Section
  // ============================================================
  renderUsersSection() {
    const wrapper = el('div', { class: 'page-content-section' });

    // List container
    const listContainer = el('div', { class: 'list-container' });
    wrapper.appendChild(listContainer);
    this.renderUserList(listContainer);

    // Form container
    const formContainer = el('div', { class: 'form-container hidden' });
    wrapper.appendChild(formContainer);

    // Reset Demo Data section (kept subtle at the bottom of the page)
    const resetSection = el('div', { class: 'reset-section reset-section--subtle' });
    const resetTitle = el('h3', { text: 'Reset Demo Data' });
    resetSection.appendChild(resetTitle);
    resetSection.appendChild(el('p', { text: 'This will reset all data to the original demo state. This action cannot be undone.' }));
    const resetBtn = el('button', { class: 'btn btn-outline-danger btn-sm', text: 'Reset Demo Data' });
    resetBtn.addEventListener('click', () => this.handleReset(resetSection));
    resetSection.appendChild(resetBtn);
    wrapper.appendChild(resetSection);

    return wrapper;
  },

  clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  },

  renderUserList(container) {
    this.clearNode(container);
    const users = DB.getAll('users');

    if (users.length === 0) {
      container.appendChild(renderEmptyStateV2({
        variant: 'zero-state',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/></svg>',
        title: 'No users found',
        body: 'Add users to start managing credentials and roles.'
      }));
      return;
    }

    const roleClassMap = {
      'Admin': 'jira-backlog-tag-role-admin',
      'Manager': 'jira-backlog-tag-role-manager',
      'Accounting': 'jira-backlog-tag-role-accounting',
      'Operations': 'jira-backlog-tag-role-operations',
      'Documentation': 'jira-backlog-tag-role-documentation',
      'HR': 'jira-backlog-tag-role-hr'
    };

    const items = users.map((u, idx) => ({
      id: u.id,
      keyText: 'USR-' + String(idx + 1).padStart(2, '0'),
      name: u.name,
      iconHtml: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
      tags: [
        { text: u.role, type: 'role', className: roleClassMap[u.role] || '' },
        { text: u.email, type: 'category' },
        { text: (u.entities || []).join(', ') || 'No entities', type: 'client' },
        { text: u.isActive !== false ? 'Active' : 'Disabled', type: 'status', className: u.isActive !== false ? 'jira-backlog-tag-status-active' : 'jira-backlog-tag-status-disabled' }
      ]
    }));

    const backlog = JiraBacklogList.render({
      title: 'Team Members',
      subtitle: 'users, roles, and entity access',
      items,
      emptyText: 'No users found',
      rowIdPrefix: 'USR',
      countLabel: 'user',
      bulkActions: (selectedIds) => [
        {
          text: 'Disable',
          className: 'btn btn-outline-warning btn-sm',
          onClick: (ids) => {
            const hasSelf = ids.includes(Auth.user.id);
            const targetIds = ids.filter(id => id !== Auth.user.id);
            
            if (targetIds.length === 0) {
              alert('You cannot disable your own user account.');
              return;
            }
            
            let message = `Are you sure you want to disable ${targetIds.length} selected user${targetIds.length === 1 ? '' : 's'}?`;
            if (hasSelf) {
              message += ' (Your own account will not be disabled.)';
            }
            
            Workflow.showConfirm('Disable Users', message, () => {
              targetIds.forEach(id => {
                DB.update('users', id, { isActive: false });
              });
              App.handleRoute();
            }, 'warning');
          }
        },
        {
          text: 'Delete',
          className: 'btn btn-danger btn-sm',
          onClick: (ids) => {
            const hasSelf = ids.includes(Auth.user.id);
            const targetIds = ids.filter(id => id !== Auth.user.id);
            
            if (targetIds.length === 0) {
              alert('You cannot delete your own user account.');
              return;
            }
            
            let message = `Are you sure you want to permanently delete ${targetIds.length} selected user${targetIds.length === 1 ? '' : 's'}? This cannot be undone.`;
            if (hasSelf) {
              message += ' (Your own account will not be deleted.)';
            }
            
            Workflow.showConfirm('Delete Users', message, () => {
              targetIds.forEach(id => {
                DB.delete('users', id);
              });
              App.handleRoute();
            }, 'danger');
          }
        }
      ],
      columns: [
        { label: 'Role', width: '110px' },
        { label: 'Email', width: '220px' },
        { label: 'Entities', width: '180px' },
        { label: 'Status', width: '100px' }
      ],
      headerActions: [
        {
          text: '+ Add User',
          className: 'btn btn-primary btn-sm',
          onClick: () => this.showUserForm()
        }
      ],
      rowActions: (item) => {
        const user = users.find(u => u.id === item.id);
        if (!user) return [];
        return [
          {
            text: 'Edit',
            className: 'btn btn-secondary btn-xs',
            onClick: () => this.showUserForm(user.id)
          }
        ];
      }
    });

    container.appendChild(backlog);
  },

  roleBadge(role) {
    const map = {
      'Admin': 'badge-danger',
      'Manager': 'badge-warning',
      'Accounting': 'badge-info',
      'Operations': 'badge-success',
      'Documentation': 'badge-primary',
      'HR': 'badge-secondary'
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
    Auth.ALL_ROLES.forEach(r => {
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
    const canViewAllAudit = Auth.can('audit:view_all');

    // Jira Filter Toolbar & Active Filters State
    const activeFilters = {
      user: new Set(),
      client: new Set(),
      date: new Set()
    };

    if (!canViewAllAudit) {
      const u = Auth.user?.name;
      if (u) activeFilters.user.add(u);
    }

    const savedFilters = App.restoreFilters('audit');
    if (savedFilters && canViewAllAudit) {
      if (Array.isArray(savedFilters.user)) savedFilters.user.forEach(v => activeFilters.user.add(v));
      if (Array.isArray(savedFilters.client)) savedFilters.client.forEach(v => activeFilters.client.add(v));
      if (Array.isArray(savedFilters.date)) savedFilters.date.forEach(v => activeFilters.date.add(v));
    }

    const saveCurrentFilters = () => {
      App.saveFilters('audit', {
        user: Array.from(activeFilters.user),
        client: Array.from(activeFilters.client),
        date: Array.from(activeFilters.date)
      });
    };

    const getUserOptions = () => DB.getAll('users').map(u => ({ value: u.name, label: u.name }));
    const getClientOptions = () => DB.getAll('clients').map(c => ({ value: c.name, label: c.name }));
    const getDueDateOptions = () => [
      { value: 'Overdue', label: 'Overdue' },
      { value: 'Due Today', label: 'Due Today' },
      { value: 'Due This Week', label: 'Due This Week' },
      { value: 'Due This Month', label: 'Due This Month' },
      { value: 'Due Later', label: 'Due Later' }
    ];

    const categories = {
      user: { label: 'User', getOptions: getUserOptions },
      client: { label: 'Client', getOptions: getClientOptions },
      date: { label: 'Date', hasDatePicker: true, getOptions: getDueDateOptions }
    };

    let searchQuery = '';
    const toolbarContainer = createJiraFilterToolbar({
      moduleName: 'audit',
      searchConfig: {
        placeholder: 'Search audit log...',
        onSearch: (q) => { searchQuery = q; triggerRefresh(); }
      },
      categories,
      activeFilters,
      onFilterChange: () => {
        saveCurrentFilters();
        triggerRefresh();
      }
    });

    const stickyContainer = el('div', { class: 'toolbar-sticky-container' });
    stickyContainer.appendChild(toolbarContainer);
    wrapper.appendChild(stickyContainer);

    const content = el('div', { class: 'page-content-section' });
    const tableContainer = el('div');
    content.appendChild(tableContainer);
    wrapper.appendChild(content);

    const triggerRefresh = () => {
      this.refreshAuditLog(tableContainer, activeFilters, searchQuery);
    };

    triggerRefresh();
    return wrapper;
  },

  refreshAuditLog(container, activeFilters, searchQuery) {
    this.clearNode(container);
    let logs = DB.getAll('auditLog');
    const hasLogs = logs.length > 0;

    if (activeFilters && activeFilters.user && activeFilters.user.size > 0) {
      logs = logs.filter(l => activeFilters.user.has(l.userName || (DB.getById('users', l.userId)?.name)));
    }
    if (activeFilters && activeFilters.client && activeFilters.client.size > 0) {
      logs = logs.filter(l => {
        if (!l.details) return false;
        const detailsLower = l.details.toLowerCase();
        return Array.from(activeFilters.client).some(clientName => detailsLower.includes(clientName.toLowerCase()));
      });
    }
    if (activeFilters && activeFilters.date && activeFilters.date.size > 0) {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const endOfWeek = new Date(now);
      endOfWeek.setDate(now.getDate() + (now.getDay() === 0 ? 0 : 7 - now.getDay()));
      const endOfWeekStr = endOfWeek.toISOString().slice(0, 10);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const endOfMonthStr = endOfMonth.toISOString().slice(0, 10);

      logs = logs.filter(l => {
        const dStr = (l.timestamp || '').slice(0, 10);
        if (!dStr) return false;
        if (activeFilters.date.has(`DATE:${dStr}`)) return true;
        let bucket = 'Due Later';
        if (dStr < todayStr) bucket = 'Overdue';
        else if (dStr === todayStr) bucket = 'Due Today';
        else if (dStr <= endOfWeekStr) bucket = 'Due This Week';
        else if (dStr <= endOfMonthStr) bucket = 'Due This Month';
        return activeFilters.date.has(bucket);
      });
    }

    // Text search filter
    if (searchQuery) {
      logs = logs.filter(l => {
        const hay = [
          l.action || '',
          l.details || '',
          l.userName || '',
        ].join(' ').toLowerCase();
        return hay.includes(searchQuery);
      });
    }

    // Sort newest first
    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const hasActiveFilters = (activeFilters && Object.values(activeFilters).some(s => s && s.size > 0)) || !!searchQuery;

    if (logs.length === 0) {
      if (hasActiveFilters && hasLogs) {
        container.appendChild(renderFilterEmptyState(
          'No audit log entries match your filters',
          null,
          [{ text: 'Clear filters', className: 'btn btn-primary btn-sm', onClick: () => { App.clearSavedFilters('audit'); App.handleRoute(); } }]
        ));
      } else {
        container.appendChild(renderEmptyState('No audit log entries found', null, { variant: 'zero-state' }));
      }
      return;
    }

    const actionClassMap = {
      // Specific audit action phrases first so they win over generic partials.
      login: 'jira-backlog-tag-action-login',
      logout: 'jira-backlog-tag-action-logout',
      'work request created': 'jira-backlog-tag-action-create',
      'task completed': 'jira-backlog-tag-action-approve',
      'invoice sent': 'jira-backlog-tag-action-info',
      'disbursement released': 'jira-backlog-tag-action-release',
      'document stored': 'jira-backlog-tag-action-info',
      'disbursement submitted': 'jira-backlog-tag-action-warning',
      // Generic partials
      create: 'jira-backlog-tag-action-create',
      add: 'jira-backlog-tag-action-create',
      update: 'jira-backlog-tag-action-update',
      edit: 'jira-backlog-tag-action-update',
      delete: 'jira-backlog-tag-action-delete',
      remove: 'jira-backlog-tag-action-delete',
      archive: 'jira-backlog-tag-action-archive',
      approve: 'jira-backlog-tag-action-approve',
      complete: 'jira-backlog-tag-action-approve',
      reject: 'jira-backlog-tag-action-reject',
      submit: 'jira-backlog-tag-action-warning',
      release: 'jira-backlog-tag-action-release',
      sent: 'jira-backlog-tag-action-info',
      stored: 'jira-backlog-tag-action-info'
    };

    const getActionClass = (action) => {
      if (!action) return '';
      // Normalize underscores to spaces so phrase mappings like
      // 'work request created' match 'WORK_REQUEST_CREATED'.
      const normalized = action.toLowerCase().replace(/_/g, ' ');
      const key = Object.keys(actionClassMap).find(k => normalized.includes(k));
      return key ? actionClassMap[key] : '';
    };

    const items = logs.map((l, idx) => {
      const user = DB.getById('users', l.userId);
      const userName = user ? user.name : (l.userName || l.userId);
      const initials = userName.split(' ').map(p => p[0]).slice(0, 2).join('').toUpperCase();
      const avatarStyle = user?.avatarUrl ? `background-image:url('${escapeHtml(user.avatarUrl)}'); background-size:cover; background-position:center;` : '';
      const avatarContent = user?.avatarUrl ? '' : escapeHtml(initials);
      const avatarIcon = `<div class="backlog-avatar${user?.avatarUrl ? ' backlog-avatar--image' : ''}" style="${avatarStyle}">${avatarContent}</div>`;
      const ts = new Date(l.timestamp);

      return {
        id: l.id || idx,
        keyText: 'AUD-' + String(idx + 1).padStart(2, '0'),
        name: l.details || '—',
        iconHtml: avatarIcon,
        tags: [
          { text: l.action || 'Activity', type: 'action', className: 'jira-backlog-tag-action ' + getActionClass(l.action) },
          { text: l.entity, type: 'entity', className: 'badge badge-' + (l.entity === 'ATA' ? 'ata' : 'lta') },
          { text: userName, type: 'client' },
          { text: formatDate(l.timestamp) + ' ' + ts.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }), type: 'schedule' }
        ]
      };
    });

    const backlog = JiraBacklogList.render({
      title: 'Audit Log',
      subtitle: 'system activity and changes',
      items,
      emptyText: 'No audit log entries found',
      rowIdPrefix: 'AUD',
      countLabel: 'entry',
      bulkActions: [],
      selectable: false,
      columns: [
        { label: 'Action', width: '220px' },
        { label: 'Entity', width: '60px' },
        { label: 'User', width: '140px' },
        { label: 'Timestamp', width: '160px' }
      ]
    });

    container.appendChild(backlog);
  },

  // ============================================================
  // Pending Approvals Section (reference-image category layout)
  // ============================================================

  getPendingCategories() {
    const entity = Auth.activeEntity;
    const allPendingChanges = PendingChanges.getAllPending().filter(pc => PendingChanges.canApproveChange(pc));

    const entFilter = ent => {
      const uEnt = (ent || '').toUpperCase();
      if (entity === 'ALL') return Auth.user.entities.map(ae => ae.toUpperCase()).includes(uEnt);
      return uEnt === entity.toUpperCase();
    };

    const workRequestCreation = [];
    const wrPhaseRouting = [];
    const billingToRelease = [];
    const disbursementToRelease = [];
    const transmittalSent = [];
    const taskCreation = [];

    allPendingChanges.forEach(pc => {
      const isNew = !pc.parentRecordId;
      const data = pc.proposedData || {};
      const submitter = DB.getById('users', pc.submittedBy);

      // Resolve the entity for the pending change
      let itemEntity = data.entity;
      if (pc.table === 'workRequestPhaseRouting') {
        const wr = DB.getById('workRequests', pc.parentRecordId);
        itemEntity = wr?.entity;
      }
      if (!itemEntity || itemEntity === 'ALL') {
        itemEntity = (entity === 'ALL') ? (Auth.user.entities[0] || 'ATA') : entity;
      }

      // Filter by the active entity selection
      if (!entFilter(itemEntity)) return;

      if (pc.table === 'workRequests') {
        workRequestCreation.push({
          type: 'change',
          kind: 'workRequestCreation',
          id: pc.id,
          recordId: data.id || pc.parentRecordId,
          title: data.title || 'Work Request',
          description: data.description || (isNew ? 'New work request awaiting approval' : 'Work request edit awaiting approval'),
          amount: null,
          submittedBy: pc.submittedBy,
          submitter,
          submittedAt: pc.submittedAt,
          entity: itemEntity,
          raw: pc
        });
      } else if (pc.table === 'workRequestPhaseRouting') {
        const wr = DB.getById('workRequests', pc.parentRecordId);
        wrPhaseRouting.push({
          type: 'change',
          kind: 'wrPhaseRouting',
          id: pc.id,
          recordId: pc.parentRecordId,
          title: wr ? wr.title : 'Work Request',
          description: `Request to route to ${data.status || 'next phase'}`,
          amount: null,
          submittedBy: pc.submittedBy,
          submitter,
          submittedAt: pc.submittedAt,
          entity: itemEntity,
          raw: pc
        });
      } else if (pc.table === 'invoices') {
        billingToRelease.push({
          type: 'change',
          kind: 'billingInvoiceCreation',
          id: pc.id,
          recordId: data.id || pc.parentRecordId,
          title: `Invoice: ${data.invoiceNumber || data.id || '—'}`,
          description: isNew ? 'New invoice awaiting approval' : 'Invoice edit awaiting approval',
          amount: data.total || null,
          submittedBy: pc.submittedBy,
          submitter,
          submittedAt: pc.submittedAt,
          entity: itemEntity,
          raw: pc
        });
      } else if (pc.table === 'disbursements') {
        disbursementToRelease.push({
          type: 'change',
          kind: 'disbursementCreation',
          id: pc.id,
          recordId: data.id || pc.parentRecordId,
          title: `Expense: ${data.category || '—'}`,
          description: isNew ? 'New expense awaiting approval' : 'Expense edit awaiting approval',
          amount: data.amount || null,
          submittedBy: pc.submittedBy,
          submitter,
          submittedAt: pc.submittedAt,
          entity: itemEntity,
          raw: pc
        });
      } else if (pc.table === 'transmittals') {
        transmittalSent.push({
          type: 'change',
          kind: 'transmittalSent',
          id: pc.id,
          recordId: data.id || pc.parentRecordId,
          title: `Transmittal: ${data.trackingNumber || data.transmittalNumber || data.id || '—'}`,
          description: isNew ? 'New transmittal awaiting approval' : 'Transmittal edit awaiting approval',
          amount: null,
          submittedBy: pc.submittedBy,
          submitter,
          submittedAt: pc.submittedAt,
          entity: itemEntity,
          raw: pc
        });
      } else if (pc.table === 'tasks') {
        const wrId = data.workRequestId;
        const wr = wrId ? DB.getById('workRequests', wrId) : null;
        taskCreation.push({
          type: 'change',
          kind: 'taskCreation',
          id: pc.id,
          recordId: data.id || pc.parentRecordId,
          title: `Task: ${data.title || 'Untitled Task'}`,
          description: wr ? `For WR: ${wr.title}` : 'Task creation/edit awaiting approval',
          amount: null,
          submittedBy: pc.submittedBy,
          submitter,
          submittedAt: pc.submittedAt,
          entity: itemEntity,
          raw: pc
        });
      }
    });

    // Disbursement submissions awaiting approval
    DB.getWhere('disbursements', d => entFilter(d.entity) && ['Submitted', 'Under Review'].includes(d.status)).forEach(d => {
      const submitter = DB.getById('users', d.requestedBy);
      disbursementToRelease.push({
        type: 'record',
        kind: 'disbursementCreation',
        id: d.id,
        recordId: d.id,
        title: `Expense: ${d.category || '—'}`,
        description: d.description || 'Expense submission awaiting approval',
        amount: d.amount || null,
        submittedBy: d.requestedBy,
        submitter,
        submittedAt: d.submittedAt || d.createdAt,
        entity: d.entity,
        raw: d
      });
    });

    // Release-pending disbursements
    DB.getWhere('disbursements', d => entFilter(d.entity) && d.status === 'Release Pending Approval').forEach(d => {
      const submitter = DB.getById('users', d.releaseRequestedBy || d.requestedBy);
      disbursementToRelease.push({
        type: 'record',
        kind: 'disbursementRelease',
        id: d.id,
        recordId: d.id,
        title: `Expense: ${d.category || '—'}`,
        description: 'Disbursement release pending approval',
        amount: d.amount || null,
        submittedBy: d.releaseRequestedBy || d.requestedBy,
        submitter,
        submittedAt: d.releaseRequestedAt || d.submittedAt || d.createdAt,
        entity: d.entity,
        raw: d
      });
    });

    // Release-pending invoices (billing release)
    DB.getWhere('invoices', inv => entFilter(inv.entity) && inv.status === 'Release Pending Approval').forEach(inv => {
      const submitter = DB.getById('users', inv.releaseRequestedBy || inv.createdBy);
      billingToRelease.push({
        type: 'record',
        kind: 'billingRelease',
        id: inv.id,
        recordId: inv.id,
        title: `Invoice: ${inv.invoiceNumber || inv.id || '—'}`,
        description: 'Invoice release (mark as sent) pending approval',
        amount: inv.total || null,
        submittedBy: inv.releaseRequestedBy || inv.createdBy,
        submitter,
        submittedAt: inv.releaseRequestedAt || inv.createdAt,
        entity: inv.entity,
        raw: inv
      });
    });

    // Release-pending transmittals
    DB.getWhere('transmittals', t => entFilter(t.entity) && t.status === 'Release Pending Approval').forEach(t => {
      const submitter = DB.getById('users', t.releaseRequestedBy || t.createdBy);
      transmittalSent.push({
        type: 'record',
        kind: 'transmittalRelease',
        id: t.id,
        recordId: t.id,
        title: `Transmittal: ${t.trackingNumber || t.transmittalNumber || t.id || '—'}`,
        description: 'Transmittal mark-as-sent pending approval',
        amount: null,
        submittedBy: t.releaseRequestedBy || t.createdBy,
        submitter,
        submittedAt: t.releaseRequestedAt || t.createdAt,
        entity: t.entity,
        raw: t
      });
    });

    return {
      workRequestCreation,
      wrPhaseRouting,
      billingToRelease,
      disbursementToRelease,
      transmittalSent,
      taskCreation
    };
  },

  renderPendingSection() {
    const wrapper = el('div');

    if (this.pendingDetailId) {
      wrapper.appendChild(this.renderPendingDetail(this.pendingDetailId));
      return wrapper;
    }

    const categories = this.getPendingCategories();
    const totalPending = Object.values(categories).reduce((sum, arr) => sum + arr.length, 0);

    const categoryDefs = {
      workRequestCreation: { label: 'Work Request Creation', keyPrefix: 'WR' },
      wrPhaseRouting: { label: 'WR Phase Routing', keyPrefix: 'ROUTE' },
      billingToRelease: { label: 'Billing to Release', keyPrefix: 'BIL' },
      disbursementToRelease: { label: 'Disbursement to Release', keyPrefix: 'EXP' },
      transmittalSent: { label: 'Mark Transmittal as Sent', keyPrefix: 'TX' },
      taskCreation: { label: 'Task Creation', keyPrefix: 'TSK' }
    };

    if (totalPending === 0) {
      wrapper.appendChild(renderEmptyState('No pending approvals', null, { variant: 'zero-state' }));
      return wrapper;
    }

    const self = this;

    // Category filter pills (reference-image layout)
    wrapper.appendChild(this.renderPendingPills(categories, categoryDefs, totalPending));

    // Render each non-empty category as its own card
    Object.keys(categoryDefs).forEach(key => {
      if (self.pendingCategory !== 'all' && self.pendingCategory !== key) return;
      const items = categories[key];
      if (!items || items.length === 0) return;
      const def = categoryDefs[key];

      const card = el('div', { class: 'approval-category-card' });

      // Category header with Approve All
      const header = el('div', { class: 'approval-category-header' });
      const title = el('div', { class: 'approval-category-title' });
      title.appendChild(el('span', { text: def.label }));
      title.appendChild(el('span', { class: 'count', text: items.length + ' pending' }));
      header.appendChild(title);

      const approveAllBtn = el('button', { class: 'approve-all-btn' });
      approveAllBtn.innerHTML = BoardCardIcons.checkCircle + ' Approve All';
      approveAllBtn.addEventListener('click', () => {
        Workflow.showConfirm('Approve All', `Approve all ${items.length} items in ${def.label}?`, () => {
          self.approveAll(key);
        }, 'success');
      });
      header.appendChild(approveAllBtn);
      card.appendChild(header);

      // Items list
      const list = el('div', { class: 'approval-items-list' });
      items.forEach((item, idx) => {
        list.appendChild(self.renderPendingApprovalItem(item, idx + 1, def.keyPrefix));
      });
      card.appendChild(list);

      wrapper.appendChild(card);
    });

    return wrapper;
  },

  renderPendingPills(categories, categoryDefs, totalPending) {
    const pillsWrap = el('div', { class: 'approval-filter-pills' });

    const addPill = (key, label, count, isActive, disabled) => {
      const btn = el('button', {
        class: 'approval-filter-pill' + (isActive ? ' active' : '') + (disabled ? ' disabled' : ''),
        title: label,
        disabled: disabled ? true : false
      });
      btn.appendChild(document.createTextNode(label));
      if (count !== undefined) {
        const badge = el('span', { class: 'approval-filter-pill-count', text: String(count) });
        btn.appendChild(document.createTextNode(' '));
        btn.appendChild(badge);
      }
      if (!disabled) {
        btn.addEventListener('click', () => {
          this.pendingCategory = key;
          sessionStorage.setItem('admin_pending_category', key);
          this.pendingDetailId = null;
          App.handleRoute();
        });
      }
      pillsWrap.appendChild(btn);
    };

    addPill('all', 'All', totalPending, this.pendingCategory === 'all', false);

    Object.keys(categoryDefs).forEach(key => {
      const items = categories[key] || [];
      if (items.length === 0) return;
      addPill(key, categoryDefs[key].label, items.length, this.pendingCategory === key, false);
    });

    return pillsWrap;
  },

  renderPendingApprovalItem(item, index, keyPrefix) {
    const submitter = item.submitter;
    const initials = submitter ? getInitials(submitter.name) : getInitials('System');
    const roleLabel = submitter ? `${submitter.role} ${item.entity || Auth.activeEntity || ''}` : 'System';
    const avatarColor = submitter ? groupColor(submitter.name) : '#94a3b8';

    const key = keyPrefix + '-' + String(index).padStart(3, '0');

    const row = el('div', { class: 'approval-item', style: 'cursor: pointer;' });
    row.addEventListener('click', () => {
      if (item.type === 'change') {
        this.pendingDetailId = item.id;
        App.handleRoute();
      } else if (item.kind === 'disbursementCreation' || item.kind === 'disbursementRelease') {
        location.hash = '#disbursement/detail/' + item.id;
      } else if (item.kind === 'billingRelease') {
        location.hash = '#billing/detail/' + item.id;
      } else if (item.kind === 'transmittalRelease') {
        location.hash = '#transmittal/detail/' + item.id;
      }
    });

    // Status icon
    const icon = el('div', { class: 'approval-item-icon' });
    icon.innerHTML = BoardCardIcons.clock;
    row.appendChild(icon);

    // Body
    const body = el('div', { class: 'approval-item-body' });
    body.appendChild(el('div', { class: 'approval-item-key', text: key }));
    body.appendChild(el('div', { class: 'approval-item-title', text: item.title }));
    if (item.description) {
      body.appendChild(el('div', { class: 'approval-item-desc', text: item.description }));
    }

    const meta = el('div', { class: 'approval-item-meta' });
    if (submitter) {
      const badge = el('span', { class: 'submitter-badge' });
      const avatar = el('span', { class: 'submitter-avatar', title: submitter.name });
      avatar.textContent = initials;
      avatar.style.backgroundColor = avatarColor;
      if (submitter.avatarUrl) {
        avatar.style.backgroundImage = `url('${submitter.avatarUrl}')`;
        avatar.textContent = '';
      }
      badge.appendChild(avatar);
      badge.appendChild(el('span', { class: 'submitter-role', text: roleLabel }));
      meta.appendChild(badge);
    }

    const dateEl = el('span', { class: 'approval-item-date' });
    dateEl.innerHTML = BoardCardIcons.calendar + '<span>' + formatDate(item.submittedAt) + '</span>';
    meta.appendChild(dateEl);

    if (item.amount !== null && item.amount !== undefined) {
      meta.appendChild(el('span', { class: 'approval-item-amount', text: formatPHP(item.amount) }));
    }
    body.appendChild(meta);
    row.appendChild(body);

    // Actions reveal on hover
    const actions = el('div', { class: 'approval-item-actions' });
    const rejectBtn = el('button', { class: 'btn btn-sm btn-reject', title: 'Reject' });
    rejectBtn.innerHTML = BoardCardIcons.reject + ' Reject';
    rejectBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.rejectPendingItem(item);
    });

    const approveBtn = el('button', { class: 'btn btn-sm btn-approve', title: 'Approve' });
    approveBtn.innerHTML = BoardCardIcons.checkCircle + ' Approve';
    approveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.approvePendingItem(item);
    });

    actions.appendChild(rejectBtn);
    actions.appendChild(approveBtn);
    row.appendChild(actions);

    return row;
  },

  approvePendingItem(item) {
    if (item.kind === 'wrPhaseRouting') {
      Workflow.showConfirm('Confirm Routing', `Approve routing for ${item.title} to ${item.raw?.proposedData?.status || 'next phase'}?`, () => {
        const nextPhase = item.raw?.proposedData?.status;
        if (nextPhase) {
          DB.update('workRequests', item.recordId, {
            status: nextPhase,
            updatedAt: new Date().toISOString()
          });
        }
        PendingChanges.delete(item.id);
        App.handleRoute();
      }, 'success');
      return;
    }
    if (item.type === 'change') {
      Workflow.showConfirm('Confirm Approval', `Approve ${item.title}?`, () => {
        PendingChanges.approve(item.id);
        App.handleRoute();
      }, 'success');
    } else if (item.kind === 'disbursementCreation') {
      location.hash = '#disbursement/detail/' + item.id;
    } else if (item.kind === 'disbursementRelease') {
      Workflow.showConfirm('Confirm Release', `Approve and release ${item.title}?`, () => {
        DB.update('disbursements', item.id, {
          status: 'Released',
          releasedBy: Auth.user.id,
          releasedAt: new Date().toISOString()
        });
        App.handleRoute();
      }, 'success');
    } else if (item.kind === 'billingRelease') {
      Workflow.showConfirm('Confirm Release', `Approve and mark ${item.title} as sent?`, () => {
        DB.update('invoices', item.id, {
          status: 'Sent',
          releasedBy: Auth.user.id,
          releasedAt: new Date().toISOString()
        });
        App.handleRoute();
      }, 'success');
    } else if (item.kind === 'transmittalRelease') {
      Workflow.showConfirm('Confirm Sent', `Approve and mark ${item.title} as sent?`, () => {
        DB.update('transmittals', item.id, {
          status: 'Sent',
          sentBy: Auth.user.id,
          sentAt: new Date().toISOString()
        });
        App.handleRoute();
      }, 'success');
    }
  },

  rejectPendingItem(item) {
    const reason = prompt('Enter rejection reason:');
    if (reason === null) return;

    if (item.type === 'change') {
      PendingChanges.reject(item.id, reason);
      App.handleRoute();
    } else if (item.kind === 'disbursementCreation') {
      DB.update('disbursements', item.id, {
        status: 'Rejected',
        rejectedBy: Auth.user.id,
        rejectionReason: reason
      });
      App.handleRoute();
    } else if (item.kind === 'disbursementRelease') {
      DB.update('disbursements', item.id, {
        status: 'Approved',
        releaseRejectedBy: Auth.user.id,
        releaseRejectionReason: reason
      });
      App.handleRoute();
    } else if (item.kind === 'billingRelease') {
      DB.update('invoices', item.id, {
        status: 'Approved',
        releaseRejectedBy: Auth.user.id,
        releaseRejectionReason: reason
      });
      App.handleRoute();
    } else if (item.kind === 'transmittalRelease') {
      DB.update('transmittals', item.id, {
        status: 'Draft',
        releaseRejectedBy: Auth.user.id,
        releaseRejectionReason: reason
      });
      App.handleRoute();
    }
  },

  approveAll(categoryKey) {
    const categories = this.getPendingCategories();
    const items = categories[categoryKey] || [];
    if (items.length === 0) return;

    let processed = 0;
    items.forEach(item => {
      if (item.type === 'change') {
        PendingChanges.approve(item.id);
        processed++;
      } else if (item.kind === 'disbursementRelease') {
        DB.update('disbursements', item.id, {
          status: 'Released',
          releasedBy: Auth.user.id,
          releasedAt: new Date().toISOString()
        });
        processed++;
      } else if (item.kind === 'billingRelease') {
        DB.update('invoices', item.id, {
          status: 'Sent',
          releasedBy: Auth.user.id,
          releasedAt: new Date().toISOString()
        });
        processed++;
      } else if (item.kind === 'transmittalRelease') {
        DB.update('transmittals', item.id, {
          status: 'Sent',
          sentBy: Auth.user.id,
          sentAt: new Date().toISOString()
        });
        processed++;
      }
    });

    if (processed > 0) {
      App.handleRoute();
    } else {
      Workflow.showMessage('Approve All', 'Some items require individual review and cannot be bulk-approved.', 'warning');
    }
  },

  // Legacy board/table/list views kept for possible future toggles / backwards compatibility
  renderPendingSectionLegacy() {
    const wrapper = el('div');

    if (this.pendingDetailId) {
      wrapper.appendChild(this.renderPendingDetail(this.pendingDetailId));
      return wrapper;
    }

    const entity = Auth.activeEntity;
    let pendingChanges = PendingChanges.getAllPending();
    pendingChanges = pendingChanges.filter(pc => PendingChanges.canApproveChange(pc));
    const pendingDisbursements = DB.getWhere('disbursements', d => d.entity === entity && (d.status === 'Submitted' || d.status === 'Under Review'));

    if (pendingChanges.length === 0 && pendingDisbursements.length === 0) {
      wrapper.appendChild(renderEmptyState('No pending approvals', null, { variant: 'zero-state' }));
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
        } else if (pc.table === 'tasks') {
           const wrId = data.workRequestId;
           const wr = wrId ? DB.getById('workRequests', wrId) : null;
           title = `Task: ${data.title}`;
           subtitle = wr ? `For WR: ${wr.title}` : 'Pending task approval';
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
    if (items.length === 0) {
      container.appendChild(renderEmptyStateV2({
        variant: 'zero-state',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
        title: 'No pending submissions',
        body: 'Submitted billing and expense requests will appear here for review.'
      }));
      return;
    }

    const self = this;
    let expNumber = 1;
    let billNumber = 1;

    KanbanBoard.render({
      container,
      items,
      getColumnKey: item => item.type === 'disbursement' ? 'expense' : 'billing',
      columns: [
        {
          key: 'expense',
          label: 'Expense Submissions',
          targetStatus: 'expense',
          color: '#f59e0b',
          emptyState: { variant: 'compact', title: 'No expense submissions', body: '' }
        },
        {
          key: 'billing',
          label: 'Billing Submissions',
          targetStatus: 'billing',
          color: '#3b82f6',
          emptyState: { variant: 'compact', title: 'No billing submissions', body: '' }
        }
      ],
      renderCard(item) {
        const submitter = DB.getById('users', item.submittedBy);
        const avatars = submitter ? [{ name: submitter.name, avatarUrl: submitter.avatarUrl }] : [];
        const isExpense = item.type === 'disbursement';
        const key = (isExpense ? 'EXP-' : 'BIL-') + (isExpense ? expNumber++ : billNumber++);
        const color = isExpense ? '#f59e0b' : '#3b82f6';

        const card = buildCompactBoardCard({
          key,
          statusColor: color,
          title: item.title,
          description: item.subtitle,
          date: item.submittedAt ? formatDate(item.submittedAt) : '',
          priority: isExpense ? 'Expense' : 'Billing',
          priorityClass: isExpense ? 'card-v2-priority-medium' : 'card-v2-priority-normal',
          avatars,
          onClick: () => {
            if (isExpense) {
              location.hash = '#disbursement/detail/' + item.id;
            } else {
              self.pendingDetailId = item.id;
              App.handleRoute();
            }
          }
        });

        const footerRight = card.querySelector('.card-v2-footer-right');
        if (item.amount !== null && item.amount !== undefined) {
          footerRight.appendChild(el('div', { class: 'card-v2-footer-item', text: formatPHP(item.amount), style: 'font-weight:700;color:var(--color-text);' }));
        }
        return card;
      },
      cardMenuItems(item) {
        return [{
          label: 'View Details',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
          onClick: () => {
            if (item.type === 'disbursement') {
              location.hash = '#disbursement/detail/' + item.id;
            } else {
              self.pendingDetailId = item.id;
              App.handleRoute();
            }
          }
        }];
      },
      drag: { enabled: false }
    });
  },

  getTypeBadgeInfo(item) {
    if (item.type === 'disbursement') {
      return { text: 'Expense', className: 'badge-warning' };
    }
    
    const table = item.raw && item.raw.table;
    switch (table) {
      case 'tasks':
        return { text: 'Task', className: 'badge-recurring' };
      case 'workRequests':
        return { text: 'Work Request', className: 'badge-preprocessing' };
      case 'invoices':
        return { text: 'Invoice', className: 'badge-billing' };
      case 'transmittals':
        return { text: 'Transmittal', className: 'badge-neutral' };
      case 'clients':
        return { text: 'Client', className: 'badge-info' };
      default:
        return { text: 'Change', className: 'badge-neutral' };
    }
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
          location.hash = '#disbursement/detail/' + item.id;
        } else {
          this.pendingDetailId = item.id;
          App.handleRoute();
        }
      });
      
      // Type
      const tdType = el('td');
      const badgeInfo = this.getTypeBadgeInfo(item);
      tdType.appendChild(el('span', {
        class: `badge ${badgeInfo.className}`,
        text: badgeInfo.text,
        style: 'font-size: 10px; font-weight: 600; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; display: inline-block; min-width: 90px; text-align: center;'
      }));
      tr.appendChild(tdType);
      
      // Title / Description
      const tdTitle = el('td');
      tdTitle.appendChild(el('div', { text: item.title, style: 'font-weight: 600; color: var(--color-text);' }));
      tdTitle.appendChild(el('div', { text: item.subtitle, style: 'font-size: 0.75rem; color: var(--color-text-muted); margin-top: 2px;' }));
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
          location.hash = '#disbursement/detail/' + item.id;
        } else {
          this.pendingDetailId = item.id;
          App.handleRoute();
        }
      });
      
      const badgeInfo = this.getTypeBadgeInfo(item);
      
      const leftPart = el('div', { style: 'display: flex; align-items: center; gap: 12px;' });
      leftPart.appendChild(el('span', {
        class: `badge ${badgeInfo.className}`,
        text: badgeInfo.text,
        style: 'font-size: 10px; font-weight: 600; text-transform: uppercase; padding: 2px 6px; border-radius: 4px; display: inline-block; min-width: 90px; text-align: center;'
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
    const self = this;

    if (this.pendingDetailId) {
      wrapper.appendChild(this.renderPendingDetail(this.pendingDetailId));
      return wrapper;
    }

    // Initialize view mode from localStorage
    this.myPendingViewMode = App.getPreferredViewMode('myPending');
    if (!this.myPendingViewMode || this.myPendingViewMode === 'list') this.myPendingViewMode = 'table';

    // Jira Filter Toolbar & Active Filters State
    const activeFilters = {
      category: new Set(),
      status: new Set(),
      date: new Set()
    };

    const savedFilters = App.restoreFilters('myPending');
    if (savedFilters) {
      if (Array.isArray(savedFilters.category)) savedFilters.category.forEach(v => activeFilters.category.add(v));
      else if (savedFilters.category) activeFilters.category.add(savedFilters.category);
      if (Array.isArray(savedFilters.status)) savedFilters.status.forEach(v => activeFilters.status.add(v));
      else if (savedFilters.status) activeFilters.status.add(savedFilters.status);
      if (Array.isArray(savedFilters.date)) savedFilters.date.forEach(v => activeFilters.date.add(v));
    }

    const saveCurrentFilters = () => {
      App.saveFilters('myPending', {
        category: Array.from(activeFilters.category),
        status: Array.from(activeFilters.status),
        date: Array.from(activeFilters.date)
      });
    };

    const getCategoryOptions = () => [
      { value: 'invoices', label: 'Invoices' },
      { value: 'disbursements', label: 'Disbursements' },
      { value: 'transmittals', label: 'Transmittals' },
      { value: 'clients', label: 'Clients' },
      { value: 'tasks', label: 'Tasks' }
    ];

    const getStatusOptions = () => [
      { value: 'pending', label: 'Pending' },
      { value: 'rejected', label: 'Rejected' }
    ];

    const getDueDateOptions = () => [
      { value: 'Overdue', label: 'Overdue' },
      { value: 'Due Today', label: 'Due Today' },
      { value: 'Due This Week', label: 'Due This Week' },
      { value: 'Due This Month', label: 'Due This Month' },
      { value: 'Due Later', label: 'Due Later' }
    ];

    const categories = {
      category: { label: 'Category', getOptions: getCategoryOptions },
      status: { label: 'Status', getOptions: getStatusOptions },
      date: { label: 'Date', hasDatePicker: true, getOptions: getDueDateOptions }
    };

    const stickyContainer = el('div', { class: 'toolbar-sticky-container' });

    let searchQuery = '';
    const toolbarContainer = createJiraFilterToolbar({
      moduleName: 'myPending',
      searchConfig: {
        placeholder: 'Search pending...',
        onSearch: (q) => { searchQuery = q; updateFilters(); }
      },
      categories,
      activeFilters,
      onFilterChange: () => {
        saveCurrentFilters();
        updateFilters();
      },
      viewMode: this.myPendingViewMode || 'table',
      onViewModeChange: (newMode) => {
        self.myPendingViewMode = newMode;
        App.setPreferredViewMode('myPending', newMode);
        saveCurrentFilters();
        updateFilters();
      }
    });

    stickyContainer.appendChild(toolbarContainer);
    wrapper.appendChild(stickyContainer);

    const listContainer = el('div');
    wrapper.appendChild(listContainer);

    const updateFilters = () => self.refreshMyPendingList(listContainer, activeFilters, self.myPendingViewMode || 'table', searchQuery);
    updateFilters();

    return wrapper;
  },

  refreshMyPendingList(container, activeFilters, viewMode, searchQuery) {
    while (container.firstChild) container.removeChild(container.firstChild);
    const self = this;

    let pending = PendingChanges.getPendingForUser(Auth.user.id);
    let rejected = PendingChanges.getRejectedForUser(Auth.user.id);

    // Combine all items into a unified list
    let allItems = [
      ...pending.map(pc => ({ ...pc, _displayStatus: 'pending' })),
      ...rejected.map(pc => ({ ...pc, _displayStatus: 'rejected' }))
    ];
    const hasItems = allItems.length > 0;

    // Apply category filter
    if (activeFilters.category && activeFilters.category.size > 0) {
      allItems = allItems.filter(pc => activeFilters.category.has(pc.table));
    }

    // Apply status filter
    if (activeFilters.status && activeFilters.status.size > 0) {
      allItems = allItems.filter(pc => activeFilters.status.has(pc.status));
    }

    // Apply date filter (bucket-based + custom date)
    if (activeFilters.date && activeFilters.date.size > 0) {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const endOfWeek = new Date(now);
      endOfWeek.setDate(now.getDate() + (now.getDay() === 0 ? 0 : 7 - now.getDay()));
      const endOfWeekStr = endOfWeek.toISOString().slice(0, 10);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const endOfMonthStr = endOfMonth.toISOString().slice(0, 10);

      allItems = allItems.filter(pc => {
        const dStr = (pc.submittedAt || '').slice(0, 10);
        if (!dStr) return false;
        if (activeFilters.date.has(`DATE:${dStr}`)) return true;
        let bucket = 'Due Later';
        if (dStr < todayStr) bucket = 'Overdue';
        else if (dStr === todayStr) bucket = 'Due Today';
        else if (dStr <= endOfWeekStr) bucket = 'Due This Week';
        else if (dStr <= endOfMonthStr) bucket = 'Due This Month';
        return activeFilters.date.has(bucket);
      });
    }

    // Text search filter
    if (searchQuery) {
      allItems = allItems.filter(pc => {
        const hay = [
          pc.table || '',
          pc.status || '',
          pc.proposedData?.name || pc.proposedData?.title || '',
          pc.submittedBy || '',
        ].join(' ').toLowerCase();
        return hay.includes(searchQuery);
      });
    }

    // Sort newest first
    allItems.sort((a, b) => new Date(b.submittedAt || '') - new Date(a.submittedAt || ''));

    const hasActiveFilters = Object.values(activeFilters).some(s => s && s.size > 0) || !!searchQuery;

    if (allItems.length === 0) {
      if (hasActiveFilters && hasItems) {
        container.appendChild(renderFilterEmptyState(
          'No submissions match your filters',
          null,
          [{ text: 'Clear filters', className: 'btn btn-primary btn-sm', onClick: () => { App.clearSavedFilters('myPending'); App.handleRoute(); } }]
        ));
      } else {
        container.appendChild(renderEmptyStateV2({
          variant: 'zero-state',
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>',
          title: 'No pending submissions',
          body: 'Your pending change requests will appear here once submitted.'
        }));
      }
      return;
    }

    if (viewMode === 'table') {
      this.renderMyPendingTableView(container, allItems);
    } else if (viewMode === 'board') {
      this.renderMyPendingBoardView(container, allItems);
    } else {
      this.renderMyPendingCompactListView(container, allItems);
    }
  },

  _pendingStatusBadge(status) {
    const map = {
      'pending': 'badge badge-warning',
      'rejected': 'badge badge-danger'
    };
    return el('span', { class: map[status] || 'badge', text: status.charAt(0).toUpperCase() + status.slice(1) });
  },

  _pendingCategoryLabel(table) {
    const map = {
      invoices: 'Invoices',
      disbursements: 'Disbursements',
      transmittals: 'Transmittals',
      clients: 'Clients',
      tasks: 'Tasks',
      workRequests: 'Work Requests'
    };
    return map[table] || table;
  },

  renderMyPendingTableView(container, items) {
    const self = this;
    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Category', 'Date', 'Type', 'Status', 'Rejection Reason', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = el('tbody');
    items.forEach(pc => {
      const tr = el('tr');
      tr.appendChild(el('td', { text: self._pendingCategoryLabel(pc.table) }));
      tr.appendChild(el('td', { text: formatDate(pc.submittedAt) }));
      tr.appendChild(el('td', { text: pc.parentRecordId ? 'Edit' : 'New' }));

      const tdStatus = el('td');
      tdStatus.appendChild(self._pendingStatusBadge(pc.status));
      tr.appendChild(tdStatus);

      const tdReason = el('td', { 
        text: pc.status === 'rejected' ? (pc.rejectionReason || '—') : '—', 
        style: pc.status === 'rejected' ? 'color:var(--color-danger);font-weight:600;word-break:break-word;' : '' 
      });
      tr.appendChild(tdReason);

      const tdAct = el('td');
      const reviewBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Review', style: 'margin-right: 4px;' });
      reviewBtn.addEventListener('click', () => {
        self.pendingDetailId = pc.id;
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
      } else if (pc.status === 'rejected') {
        const dismissBtn = el('button', { class: 'btn btn-danger btn-sm', text: 'Dismiss' });
        dismissBtn.addEventListener('click', () => {
          Workflow.showConfirm('Confirm Dismissal', 'Are you sure you want to dismiss and clear this rejected submission?', () => {
            PendingChanges.delete(pc.id);
            App.handleRoute();
          }, 'danger');
        });
        tdAct.appendChild(dismissBtn);
      }

      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  },

  renderMyPendingBoardView(container, items) {
    const self = this;
    const statusColors = {
      'pending': '#f59e0b',
      'rejected': '#ef4444'
    };

    const columns = [
      { key: 'pending', label: 'Pending', targetStatus: 'pending', statuses: ['pending'], color: statusColors['pending'], emptyState: { variant: 'compact', title: 'No pending submissions', body: '' } },
      { key: 'rejected', label: 'Rejected', targetStatus: 'rejected', statuses: ['rejected'], color: statusColors['rejected'], emptyState: { variant: 'compact', title: 'No rejected submissions', body: '' } }
    ];

    let cardNumber = 1;
    const renderCard = (pc) => {
      const statusPriorityClass = pc.status === 'pending' ? 'card-v2-priority-medium' : 'card-v2-priority-critical';
      const progress = pc.status === 'pending' ? 50 : 0;
      return buildCompactBoardCard({
        key: 'SUB-' + cardNumber++,
        progress,
        statusColor: statusColors[pc.status] || '#cbd5e1',
        title: self._pendingCategoryLabel(pc.table),
        description: pc.parentRecordId ? 'Edit existing record' : 'New record submission',
        detail: (pc.status === 'rejected' && pc.rejectionReason) ? pc.rejectionReason : '',
        date: pc.submittedAt ? formatDate(pc.submittedAt) : '',
        priority: pc.status.charAt(0).toUpperCase() + pc.status.slice(1),
        priorityClass: statusPriorityClass,
        onClick: () => {
          self.pendingDetailId = pc.id;
          App.handleRoute();
        }
      });
    };

    const cardMenuItems = (pc) => {
      const menu = [{
        label: 'Review',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        onClick: () => { self.pendingDetailId = pc.id; App.handleRoute(); }
      }];
      if (pc.status === 'pending') {
        menu.push({
          label: 'Withdraw',
          className: 'danger',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
          onClick: () => Workflow.showConfirm('Confirm Withdrawal', 'Are you sure you want to withdraw this pending submission?', () => { PendingChanges.delete(pc.id); App.handleRoute(); }, 'danger')
        });
      }
      if (pc.status === 'rejected') {
        menu.push({
          label: 'Dismiss',
          className: 'danger',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
          onClick: () => Workflow.showConfirm('Confirm Dismissal', 'Are you sure you want to dismiss and clear this rejected submission?', () => { PendingChanges.delete(pc.id); App.handleRoute(); }, 'danger')
        });
      }
      return menu;
    };

    KanbanBoard.render({
      container,
      items,
      columns: columns.map(col => ({
        key: col.key,
        label: col.label,
        targetStatus: col.targetStatus,
        color: col.color,
        emptyState: col.emptyState
      })),
      renderCard,
      cardMenuItems,
      drag: { enabled: false }
    });
  },

  renderMyPendingCompactListView(container, items) {
    const self = this;
    const list = el('div', { class: 'list-view' });
    items.forEach(pc => {
      const item = el('div', { class: 'list-item' });
      const left = el('div');
      left.appendChild(el('div', { class: 'list-item-title', text: self._pendingCategoryLabel(pc.table) }));
      const metaParts = [
        pc.parentRecordId ? 'Edit' : 'New',
        pc.status.charAt(0).toUpperCase() + pc.status.slice(1),
        pc.submittedAt ? formatDate(pc.submittedAt) : ''
      ].filter(Boolean);
      left.appendChild(el('div', { class: 'list-item-meta', text: metaParts.join(' • ') }));
      if (pc.status === 'rejected' && pc.rejectionReason) {
        left.appendChild(el('div', { class: 'list-item-meta', text: 'Reason: ' + pc.rejectionReason, style: 'color:var(--color-danger);' }));
      }
      item.appendChild(left);
      const rightActions = el('div', { style: 'display:flex;gap:4px;align-items:center;' });
      const reviewBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Review' });
      reviewBtn.addEventListener('click', () => { self.pendingDetailId = pc.id; App.handleRoute(); });
      rightActions.appendChild(reviewBtn);
      if (pc.status === 'pending') {
        const withdrawBtn = el('button', { class: 'btn btn-danger btn-sm', text: 'Withdraw' });
        withdrawBtn.addEventListener('click', () => {
          Workflow.showConfirm('Confirm Withdrawal', 'Are you sure you want to withdraw this pending submission?', () => { PendingChanges.delete(pc.id); App.handleRoute(); }, 'danger');
        });
        rightActions.appendChild(withdrawBtn);
      }
      if (pc.status === 'rejected') {
        const dismissBtn = el('button', { class: 'btn btn-danger btn-sm', text: 'Dismiss' });
        dismissBtn.addEventListener('click', () => {
          Workflow.showConfirm('Confirm Dismissal', 'Are you sure you want to dismiss and clear this rejected submission?', () => { PendingChanges.delete(pc.id); App.handleRoute(); }, 'danger');
        });
        rightActions.appendChild(dismissBtn);
      }
      item.appendChild(rightActions);
      list.appendChild(item);
    });
    container.appendChild(list);
  },


  renderPendingDetail(pendingId) {
    const pc = PendingChanges.getById(pendingId);
    if (!pc) {
      this.pendingDetailId = null;
      return renderEmptyStateV2({
        variant: 'zero-state',
        icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
        title: 'Pending change not found',
        body: 'The requested pending change could not be loaded.'
      });
    }

    const canApprove = PendingChanges.canApproveChange(pc);
    const isSubmitter = pc.submittedBy === Auth.user.id;

    const wrapper = el('div', { style: 'max-width: 800px; margin: 0 auto;' });
    
    // Header
    const header = el('div', { class: 'form-header-bar', style: 'border-bottom: 1px solid var(--color-border); padding-bottom: 16px; margin-bottom: 24px;' });
    header.appendChild(el('h2', { text: 'Review Pending Change Request', style: 'margin: 0; font-size: 1.25rem; font-weight: 600; color: var(--color-primary);' }));
    
    const backBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '← Back to List' });
    backBtn.addEventListener('click', () => {
      this.pendingDetailId = null;
      App.handleRoute();
    });
    header.appendChild(backBtn);
    wrapper.appendChild(header);

    // SVGs for Notion Property Grid
    const Icons = {
      workRequest: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1.8 1.8"/><path d="M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1.8-1.8"/></svg>`,
      assignee: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
      coAssignees: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
      priority: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`,
      dueDate: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
      predecessors: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 0 0 6 8v8a6 6 0 0 0 12 0"/><circle cx="18" cy="8" r="3"/><circle cx="6" cy="8" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
      client: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
      status: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
      document: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
      invoice: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 15h.01M12 15h.01M16 15h.01"/></svg>`,
      amount: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/><circle cx="12" cy="15" r="2"/></svg>`,
      checklist: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>`
    };

    function getInitials(name) {
      if (!name) return 'U';
      return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
    }

    function createPropertyRow(label, iconSvg, valueNode) {
      return el('div', { class: 'notion-property-row' }, [
        el('span', { class: 'notion-property-label' }, [
          el('span', { html: iconSvg, style: 'display: flex; align-items: center;' }),
          label
        ]),
        el('span', { class: 'notion-property-value' }, [valueNode])
      ]);
    }

    // Submitter Info
    const submitter = DB.getById('users', pc.submittedBy);
    const submitterName = submitter ? submitter.name : pc.submittedBy;
    const submitterInitials = getInitials(submitterName);

    const singularName = {
      tasks: 'task',
      workRequests: 'work request',
      invoices: 'invoice',
      transmittals: 'transmittal',
      clients: 'client',
      disbursements: 'disbursement'
    }[pc.table] || pc.table;

    // Main Notion Card
    const reviewCard = el('div', { class: 'admin-review-card' });

    // 1. Card Header Row (Avatar, Meta Text, Status Badge)
    const cardHeader = el('div', { class: 'admin-review-card-header' }, [
      el('div', { class: 'admin-review-submitter-info' }, [
        el('div', { class: 'admin-review-avatar', text: submitterInitials }),
        el('div', { class: 'admin-review-meta-text' }, [
          el('strong', { text: submitterName }),
          ` proposed a new ${singularName} · ${formatDate(pc.submittedAt)}`
        ])
      ]),
      el('div', { class: 'admin-review-status-badge', text: 'Awaiting approval' })
    ]);
    reviewCard.appendChild(cardHeader);

    // 2. Title Section
    const proposed = pc.proposedData;
    let recordTitle = '';
    let titleIcon = '';

    if (pc.table === 'tasks') {
      recordTitle = proposed.title || '(Untitled)';
      titleIcon = Icons.checklist;
    } else if (pc.table === 'workRequests') {
      recordTitle = proposed.title || '(Untitled)';
      titleIcon = Icons.document;
    } else if (pc.table === 'invoices') {
      recordTitle = proposed.invoiceNumber || '(No Invoice Number)';
      titleIcon = Icons.invoice;
    } else if (pc.table === 'transmittals') {
      recordTitle = proposed.transmittalNumber || '(No Transmittal Number)';
      titleIcon = Icons.document;
    } else if (pc.table === 'clients') {
      recordTitle = proposed.name || '(No Client Name)';
      titleIcon = Icons.client;
    } else if (pc.table === 'disbursements') {
      recordTitle = proposed.voucherNumber || '(No Voucher Number)';
      titleIcon = Icons.amount;
    } else {
      recordTitle = proposed.title || proposed.name || proposed.invoiceNumber || proposed.voucherNumber || '(Untitled)';
      titleIcon = Icons.document;
    }

    const titleContainer = el('div', { class: 'notion-title-section' }, [
      el('div', { class: 'notion-title-icon', html: titleIcon }),
      el('h3', { class: 'notion-title-text', text: recordTitle })
    ]);
    reviewCard.appendChild(titleContainer);

    // 3. Validation / Warning Banner
    if (pc.table === 'tasks' && (proposed.title && (proposed.title.length <= 2 || proposed.title.toLowerCase() === 's'))) {
      const warningBox = el('div', { class: 'notion-warning-box' }, [
        el('span', { text: '⚠️', style: 'margin-right: 4px;' }),
        el('span', { text: 'Title looks incomplete — verify before approving.' })
      ]);
      reviewCard.appendChild(warningBox);
    }

    // 4. Notion Property Grid
    const propertyGrid = el('div', { class: 'notion-property-grid' });

    if (pc.table === 'tasks') {
      // Work Request
      const wr = proposed.workRequestId ? DB.getById('workRequests', proposed.workRequestId) : null;
      const wrVal = wr 
        ? el('a', { class: 'notion-property-value-link', href: `#operations/detail/${wr.id}`, text: wr.title || proposed.workRequestId })
        : el('span', { text: proposed.workRequestId || 'None' });
      propertyGrid.appendChild(createPropertyRow('Work request', Icons.workRequest, wrVal));

      // Assignee
      const assignee = proposed.assigneeId ? DB.getById('users', proposed.assigneeId) : null;
      const assigneeVal = assignee 
        ? el('span', { text: assignee.name })
        : el('span', { class: 'notion-property-value-warning', html: `⚠️ Not set` });
      propertyGrid.appendChild(createPropertyRow('Assignee', Icons.assignee, assigneeVal));

      // Co-assignees
      const coVal = (proposed.coAssignees && proposed.coAssignees.length > 0)
        ? el('span', { text: proposed.coAssignees.join(', ') })
        : el('span', { style: 'font-style: italic; color: var(--color-text-muted);', text: 'None' });
      propertyGrid.appendChild(createPropertyRow('Co-assignees', Icons.coAssignees, coVal));

      // Priority
      const priority = proposed.priority || 'Normal';
      let priorityClass = 'badge-info';
      if (priority === 'High' || priority === 'Urgent') priorityClass = 'badge-danger';
      else if (priority === 'Low') priorityClass = 'badge-muted';
      const priorityVal = el('span', { 
        class: `badge ${priorityClass}`, 
        text: priority,
        style: 'font-size: 11px; padding: 2px 8px; border-radius: 4px;'
      });
      propertyGrid.appendChild(createPropertyRow('Priority', Icons.priority, priorityVal));

      // Due date
      const dueVal = proposed.dueDate
        ? el('span', { text: formatDate(proposed.dueDate) })
        : el('span', { style: 'font-style: italic; color: var(--color-text-muted);', text: 'Not set' });
      propertyGrid.appendChild(createPropertyRow('Due date', Icons.dueDate, dueVal));

      // Predecessors
      const predVal = (proposed.predecessors && proposed.predecessors.length > 0)
        ? el('span', { text: proposed.predecessors.join(', ') })
        : el('span', { style: 'font-style: italic; color: var(--color-text-muted);', text: 'None' });
      propertyGrid.appendChild(createPropertyRow('Predecessors', Icons.predecessors, predVal));

    } else if (pc.table === 'workRequests') {
      const client = proposed.clientId ? DB.getById('clients', proposed.clientId) : null;
      propertyGrid.appendChild(createPropertyRow('Client', Icons.client, el('span', { text: client ? client.name : 'Not set' })));
      
      const statusVal = el('span', { class: 'badge badge-info', text: proposed.status || 'Draft' });
      propertyGrid.appendChild(createPropertyRow('Status', Icons.status, statusVal));

      const priority = proposed.priority || 'Normal';
      const priorityVal = el('span', { class: 'badge badge-info', text: priority });
      propertyGrid.appendChild(createPropertyRow('Priority', Icons.priority, priorityVal));

      const assignee = proposed.assigneeId ? DB.getById('users', proposed.assigneeId) : null;
      propertyGrid.appendChild(createPropertyRow('Assignee', Icons.assignee, el('span', { text: assignee ? assignee.name : 'Not set' })));

    } else if (pc.table === 'invoices') {
      const client = proposed.clientId ? DB.getById('clients', proposed.clientId) : null;
      propertyGrid.appendChild(createPropertyRow('Client', Icons.client, el('span', { text: client ? client.name : 'Not set' })));

      const wr = proposed.workRequestId ? DB.getById('workRequests', proposed.workRequestId) : null;
      propertyGrid.appendChild(createPropertyRow('Work request', Icons.workRequest, el('span', { text: wr ? wr.title : 'None' })));

      propertyGrid.appendChild(createPropertyRow('Issue date', Icons.dueDate, el('span', { text: formatDate(proposed.issueDate) })));
      propertyGrid.appendChild(createPropertyRow('Due date', Icons.dueDate, el('span', { text: formatDate(proposed.dueDate) })));
      propertyGrid.appendChild(createPropertyRow('Total amount', Icons.amount, el('span', { text: formatPHP(proposed.total), style: 'font-weight: 700;' })));

    } else if (pc.table === 'transmittals') {
      const client = proposed.clientId ? DB.getById('clients', proposed.clientId) : null;
      propertyGrid.appendChild(createPropertyRow('Client', Icons.client, el('span', { text: client ? client.name : 'Not set' })));

      const wr = proposed.workRequestId ? DB.getById('workRequests', proposed.workRequestId) : null;
      propertyGrid.appendChild(createPropertyRow('Work request', Icons.workRequest, el('span', { text: wr ? wr.title : 'None' })));

      propertyGrid.appendChild(createPropertyRow('Date', Icons.dueDate, el('span', { text: formatDate(proposed.date) })));
      propertyGrid.appendChild(createPropertyRow('Status', Icons.status, el('span', { class: 'badge badge-info', text: proposed.status || 'Draft' })));

    } else if (pc.table === 'clients') {
      propertyGrid.appendChild(createPropertyRow('TIN', Icons.document, el('span', { text: proposed.tin || 'None' })));
      propertyGrid.appendChild(createPropertyRow('RDO Code', Icons.dueDate, el('span', { text: proposed.rdoCode || 'None' })));
      propertyGrid.appendChild(createPropertyRow('Contact person', Icons.assignee, el('span', { text: proposed.contactPerson || 'None' })));
      propertyGrid.appendChild(createPropertyRow('Phone', Icons.document, el('span', { text: proposed.phone || 'None' })));
      propertyGrid.appendChild(createPropertyRow('Email', Icons.document, el('span', { text: proposed.email || 'None' })));
      propertyGrid.appendChild(createPropertyRow('Retainer status', Icons.status, el('span', { text: proposed.retainer ? 'Yes' : 'No' })));

    } else if (pc.table === 'disbursements') {
      const client = proposed.clientId ? DB.getById('clients', proposed.clientId) : null;
      propertyGrid.appendChild(createPropertyRow('Client', Icons.client, el('span', { text: client ? client.name : 'Not set' })));
      propertyGrid.appendChild(createPropertyRow('Amount', Icons.amount, el('span', { text: formatPHP(proposed.amount), style: 'font-weight: 700;' })));
      propertyGrid.appendChild(createPropertyRow('Payment method', Icons.document, el('span', { text: proposed.paymentMethod || 'None' })));
      propertyGrid.appendChild(createPropertyRow('Status', Icons.status, el('span', { class: 'badge badge-info', text: proposed.status || 'Draft' })));

    } else {
      for (const [k, v] of Object.entries(proposed)) {
        if (['id', 'createdAt', 'updatedAt', 'tasks', 'lineItems', 'checklist'].includes(k)) continue;
        const displayVal = typeof v === 'object' ? JSON.stringify(v) : String(v);
        const niceKey = k.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        propertyGrid.appendChild(createPropertyRow(niceKey, Icons.document, el('span', { text: displayVal })));
      }
    }

    reviewCard.appendChild(propertyGrid);

    // 5. Checklist or Sub-items section
    let hasSubSection = false;
    const subSectionContainer = el('div', { class: 'notion-sub-section' });

    if (pc.table === 'tasks') {
      hasSubSection = true;
      const checklistCount = proposed.checklist ? proposed.checklist.length : 0;
      subSectionContainer.appendChild(el('div', { class: 'notion-section-divider' }));
      subSectionContainer.appendChild(el('div', { class: 'notion-sub-section-title' }, [
        el('span', { html: Icons.checklist }),
        `Checklist items proposed (${checklistCount})`
      ]));

      if (proposed.checklist && proposed.checklist.length > 0) {
        const list = el('div', { style: 'display: flex; flex-direction: column; gap: 8px; margin-top: 12px;' });
        proposed.checklist.forEach(item => {
          const checkRow = el('div', { style: 'display: flex; align-items: center; gap: 8px;' }, [
            el('input', { type: 'checkbox', disabled: true, checked: item.completed }),
            el('span', { text: item.text, style: 'font-size: 0.875rem; color: var(--color-text); font-style: normal;' })
          ]);
          list.appendChild(checkRow);
        });
        subSectionContainer.appendChild(list);
      } else {
        subSectionContainer.appendChild(el('div', { class: 'notion-sub-section-content', text: 'Staff did not add any checklist items.' }));
      }
    } else if (pc.table === 'invoices' && proposed.lineItems && proposed.lineItems.length > 0) {
      hasSubSection = true;
      subSectionContainer.appendChild(el('div', { class: 'notion-section-divider' }));
      subSectionContainer.appendChild(el('div', { class: 'notion-sub-section-title' }, [
        el('span', { html: Icons.document }),
        `Line Items`
      ]));

      const liTable = el('table', { class: 'data-table', style: 'width: 100%; font-size: 0.8125rem; background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 6px;' });
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
      liTable.style.fontStyle = 'normal';
      subSectionContainer.appendChild(liTable);
    } else if (pc.table === 'workRequests' && proposed.tasks && proposed.tasks.length > 0) {
      hasSubSection = true;
      subSectionContainer.appendChild(el('div', { class: 'notion-section-divider' }));
      subSectionContainer.appendChild(el('div', { class: 'notion-sub-section-title' }, [
        el('span', { html: Icons.checklist }),
        `Proposed Tasks (${proposed.tasks.length})`
      ]));

      const list = el('div', { style: 'display: flex; flex-direction: column; gap: 8px; margin-top: 12px;' });
      proposed.tasks.forEach(t => {
        const taskRow = el('div', { style: 'display: flex; align-items: center; gap: 8px;' }, [
          el('span', { html: Icons.checklist, style: 'color: var(--color-text-muted); opacity: 0.6;' }),
          el('span', { text: t.title, style: 'font-size: 0.875rem; color: var(--color-text); font-style: normal; font-weight: 500;' })
        ]);
        list.appendChild(taskRow);
      });
      subSectionContainer.appendChild(list);
    }

    if (hasSubSection) {
      reviewCard.appendChild(subSectionContainer);
    }

    wrapper.appendChild(reviewCard);

    // 6. Changed Fields (Diff) Table for Edits
    const { current, diffs, isNew } = PendingChanges.buildDiff(pc);
    if (!isNew && diffs.length > 0) {
      const diffSection = el('div', { class: 'form-section', style: 'margin-top: 24px; margin-bottom: 24px;' });
      diffSection.appendChild(el('h3', { text: 'Changed Fields (Diff)', style: 'font-size: 1rem; font-weight: 600; color: var(--color-text); margin-bottom: 12px;' }));

      const diffContainer = el('div', { class: 'card', style: 'border-radius: 8px; padding: 20px;' });
      const diffTable = el('table', { class: 'report-table', style: 'width: 100%; border-collapse: collapse;' });
      const diffThead = el('thead');
      const diffThr = el('tr');
      ['Field', 'Current Approved Value', 'Proposed Pending Value'].forEach(h => diffThr.appendChild(el('th', { text: h, style: 'text-align: left; padding: 10px; background: var(--color-bg-muted); border-bottom: 2px solid var(--color-border); font-size: 0.8125rem;' })));
      diffThead.appendChild(diffThr);
      diffTable.appendChild(diffThead);
      
      const diffTbody = el('tbody');
      diffs.forEach(d => {
        const tr = el('tr');
        const niceKey = d.key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
        
        let oldVal = d.old;
        let newVal = d.new;
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
        
        tr.appendChild(el('td', { text: niceKey, style: 'padding: 12px 10px; border-bottom: 1px solid var(--color-border); font-weight: 600; font-size: 0.8125rem; color: var(--color-text-muted);' }));
        tr.appendChild(el('td', { text: oldVal, style: 'padding: 12px 10px; border-bottom: 1px solid var(--color-border); font-size: 0.8125rem; color: var(--color-text);' }));
        tr.appendChild(el('td', { text: newVal, style: 'padding: 12px 10px; border-bottom: 1px solid var(--color-border); font-weight: 600; font-size: 0.8125rem; color: var(--color-success); background: rgba(52, 211, 153, 0.1);' }));
        diffTbody.appendChild(tr);
      });
      diffTable.appendChild(diffTbody);
      diffContainer.appendChild(diffTable);
      diffSection.appendChild(diffContainer);
      wrapper.appendChild(diffSection);
    }

    // 7. Actions Footer
    const actions = el('div', {
      style: 'display: flex; gap: 12px; border-top: 1px solid var(--color-border); padding-top: 20px; margin-top: 24px;'
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
    } else if (isSubmitter && pc.status === 'rejected') {
      const editResubmitBtn = el('button', { class: 'btn btn-warning', text: 'Edit & Resubmit' });
      editResubmitBtn.addEventListener('click', () => {
        PendingChanges.editingPendingId = pc.id;
        this.pendingDetailId = null;

        if (pc.table === 'invoices') {
          location.hash = `#billing/form/${pc.proposedData.id}`;
        } else if (pc.table === 'disbursements') {
          location.hash = `#disbursement/form/${pc.proposedData.id}`;
        } else if (pc.table === 'transmittals') {
          location.hash = `#transmittal/form/${pc.proposedData.id}`;
        } else if (pc.table === 'clients') {
          location.hash = `#clients/form/${pc.proposedData.id}`;
        } else if (pc.table === 'workRequests') {
          location.hash = `#operations/form/${pc.proposedData.id}`;
        } else if (pc.table === 'tasks') {
          App.handleRoute(); // navigate back to wherever they were
          PendingChanges.editingPendingId = pc.id;
          Workflow.showEditTaskModal(pc.proposedData.id, () => {
            App.handleRoute();
          });
        }
      });
      actions.appendChild(editResubmitBtn);

      const dismissBtn = el('button', { class: 'btn btn-danger', text: 'Dismiss Submission' });
      dismissBtn.addEventListener('click', () => {
        Workflow.showConfirm('Confirm Dismissal', 'Are you sure you want to dismiss and clear this rejected submission?', () => {
          PendingChanges.delete(pc.id);
          this.pendingDetailId = null;
          App.handleRoute();
        }, 'danger');
      });
      actions.appendChild(dismissBtn);
    }

    wrapper.appendChild(actions);
    return wrapper;
  },

  renderMyRequestsSection() {
    const wrapper = el('div');
    const self = this;

    // Initialize view mode from localStorage
    this.myRequestsViewMode = App.getPreferredViewMode('myRequests');
    if (!this.myRequestsViewMode || this.myRequestsViewMode === 'list') this.myRequestsViewMode = 'table';

    // Jira Filter Toolbar & Active Filters State
    const activeFilters = {
      category: new Set(),
      status: new Set(),
      date: new Set()
    };

    const savedFilters = App.restoreFilters('myRequests');
    if (savedFilters) {
      if (Array.isArray(savedFilters.category)) savedFilters.category.forEach(v => activeFilters.category.add(v));
      else if (savedFilters.category) activeFilters.category.add(savedFilters.category);
      if (Array.isArray(savedFilters.status)) savedFilters.status.forEach(v => activeFilters.status.add(v));
      else if (savedFilters.status) activeFilters.status.add(savedFilters.status);
      if (Array.isArray(savedFilters.date)) savedFilters.date.forEach(v => activeFilters.date.add(v));
    }

    const saveCurrentFilters = () => {
      App.saveFilters('myRequests', {
        category: Array.from(activeFilters.category),
        status: Array.from(activeFilters.status),
        date: Array.from(activeFilters.date)
      });
    };

    const getCategoryOptions = () => [
      { value: 'billing', label: 'Billing' },
      { value: 'disbursement', label: 'Disbursement' },
      { value: 'transmittal', label: 'Transmittal' }
    ];

    const getStatusOptions = () => [
      { value: 'pending', label: 'Pending' },
      { value: 'fulfilled', label: 'Fulfilled' },
      { value: 'rejected', label: 'Rejected' }
    ];

    const getDueDateOptions = () => [
      { value: 'Overdue', label: 'Overdue' },
      { value: 'Due Today', label: 'Due Today' },
      { value: 'Due This Week', label: 'Due This Week' },
      { value: 'Due This Month', label: 'Due This Month' },
      { value: 'Due Later', label: 'Due Later' }
    ];

    const categories = {
      category: { label: 'Category', getOptions: getCategoryOptions },
      status: { label: 'Status', getOptions: getStatusOptions },
      date: { label: 'Date', hasDatePicker: true, getOptions: getDueDateOptions }
    };

    const stickyContainer = el('div', { class: 'toolbar-sticky-container' });

    let searchQuery = '';
    const toolbarContainer = createJiraFilterToolbar({
      moduleName: 'myRequests',
      searchConfig: {
        placeholder: 'Search requests...',
        onSearch: (q) => { searchQuery = q; updateFilters(); }
      },
      categories,
      activeFilters,
      onFilterChange: () => {
        saveCurrentFilters();
        updateFilters();
      },
      viewMode: this.myRequestsViewMode || 'table',
      onViewModeChange: (newMode) => {
        self.myRequestsViewMode = newMode;
        App.setPreferredViewMode('myRequests', newMode);
        saveCurrentFilters();
        updateFilters();
      }
    });

    stickyContainer.appendChild(toolbarContainer);
    wrapper.appendChild(stickyContainer);

    const listContainer = el('div');
    wrapper.appendChild(listContainer);

    const updateFilters = () => self.refreshMyRequestsList(listContainer, activeFilters, self.myRequestsViewMode || 'table', searchQuery);
    updateFilters();

    return wrapper;
  },

  _requestStatusBadge(status) {
    const map = {
      'pending': 'badge badge-warning',
      'fulfilled': 'badge badge-success',
      'rejected': 'badge badge-danger'
    };
    return el('span', { class: map[status] || 'badge', text: status.charAt(0).toUpperCase() + status.slice(1) });
  },

  _requestTypeLabel(type) {
    const map = { billing: 'Billing', disbursement: 'Disbursement', transmittal: 'Transmittal' };
    return map[type] || type;
  },

  refreshMyRequestsList(container, activeFilters, viewMode, searchQuery) {
    while (container.firstChild) container.removeChild(container.firstChild);

    let requests = DB.getWhere('operationsRequests', r => r.requestedBy === Auth.user.id);
    const hasItems = requests.length > 0;

    // Apply category filter
    if (activeFilters.category && activeFilters.category.size > 0) {
      requests = requests.filter(r => activeFilters.category.has(r.type));
    }

    // Apply status filter
    if (activeFilters.status && activeFilters.status.size > 0) {
      requests = requests.filter(r => activeFilters.status.has(r.status));
    }

    // Apply date filter (bucket-based + custom date)
    if (activeFilters.date && activeFilters.date.size > 0) {
      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const endOfWeek = new Date(now);
      endOfWeek.setDate(now.getDate() + (now.getDay() === 0 ? 0 : 7 - now.getDay()));
      const endOfWeekStr = endOfWeek.toISOString().slice(0, 10);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const endOfMonthStr = endOfMonth.toISOString().slice(0, 10);

      requests = requests.filter(r => {
        const dStr = (r.requestedAt || '').slice(0, 10);
        if (!dStr) return false;
        if (activeFilters.date.has(`DATE:${dStr}`)) return true;
        let bucket = 'Due Later';
        if (dStr < todayStr) bucket = 'Overdue';
        else if (dStr === todayStr) bucket = 'Due Today';
        else if (dStr <= endOfWeekStr) bucket = 'Due This Week';
        else if (dStr <= endOfMonthStr) bucket = 'Due This Month';
        return activeFilters.date.has(bucket);
      });
    }

    // Text search filter
    if (searchQuery) {
      requests = requests.filter(r => {
        const hay = [
          r.type || '',
          r.status || '',
          r.description || r.reason || '',
        ].join(' ').toLowerCase();
        return hay.includes(searchQuery);
      });
    }

    // Sort newest first
    requests.sort((a, b) => new Date(b.requestedAt || '') - new Date(a.requestedAt || ''));

    const hasActiveFilters = Object.values(activeFilters).some(s => s && s.size > 0) || !!searchQuery;

    if (requests.length === 0) {
      if (hasActiveFilters && hasItems) {
        container.appendChild(renderFilterEmptyState(
          'No requests match your filters',
          null,
          [{ text: 'Clear filters', className: 'btn btn-primary btn-sm', onClick: () => { App.clearSavedFilters('myRequests'); App.handleRoute(); } }]
        ));
      } else {
        container.appendChild(renderEmptyStateV2({
          variant: 'zero-state',
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>',
          title: 'No requests submitted yet',
          body: 'Submit a departmental request in the Operations section.',
          actions: [
            {
              text: 'Go to Operations',
              onClick: () => { location.hash = '#operations'; }
            }
          ]
        }));
      }
      return;
    }

    if (viewMode === 'table') {
      this.renderMyRequestsTableView(container, requests);
    } else if (viewMode === 'board') {
      this.renderMyRequestsBoardView(container, requests);
    } else {
      this.renderMyRequestsCompactListView(container, requests);
    }
  },

  renderMyRequestsTableView(container, requests) {
    const self = this;
    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Request Type', 'Work Request', 'Client', 'Requested At', 'Status', 'Fulfill Info / Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = el('tbody');
    requests.forEach(r => {
      const tr = el('tr');

      tr.appendChild(el('td', { text: this._requestTypeLabel(r.type) }));

      const wr = DB.getById('workRequests', r.workRequestId);
      tr.appendChild(el('td', { text: wr ? wr.title : '—' }));

      const client = DB.getById('clients', r.clientId);
      tr.appendChild(el('td', { text: client ? client.name : '—' }));

      tr.appendChild(el('td', { text: formatDate(r.requestedAt) }));

      const tdSt = el('td');
      tdSt.appendChild(this._requestStatusBadge(r.status));
      tr.appendChild(tdSt);

      const tdAct = el('td');
      const viewBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'View', style: 'margin-right: 8px;' });
      viewBtn.addEventListener('click', () => {
        self.showRequestDetailsModal(r);
      });
      tdAct.appendChild(viewBtn);

      if (r.status === 'pending') {
        const cancelBtn = el('button', { class: 'btn btn-danger btn-sm', text: 'Cancel Request' });
        cancelBtn.addEventListener('click', () => {
          Workflow.showConfirm('Cancel Request', 'Are you sure you want to cancel this request?', () => {
            DB.delete('operationsRequests', r.id);
            App.handleRoute();
          }, 'danger');
        });
        tdAct.appendChild(cancelBtn);
      } else if (r.status === 'fulfilled') {
        const fulfiller = DB.getById('users', r.fulfilledBy);
        tdAct.appendChild(el('span', { text: `Fulfilled by ${fulfiller ? fulfiller.name : 'System'} on ${formatDate(r.fulfilledAt)}`, style: 'color: var(--color-text-muted); font-size: 0.8125rem; margin-left: 4px;' }));
      } else if (r.status === 'rejected') {
        tdAct.appendChild(el('span', { text: r.rejectionReason ? `Reason: ${r.rejectionReason}` : 'No reason provided', style: 'color: var(--color-danger); font-size: 0.8125rem; margin-left: 4px;' }));
      }
      tr.appendChild(tdAct);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  },

  renderMyRequestsBoardView(container, requests) {
    const self = this;
    const statusColors = {
      'pending': '#f59e0b',
      'fulfilled': '#10b981',
      'rejected': '#ef4444'
    };

    const columns = [
      { key: 'pending', label: 'Pending', targetStatus: 'pending', color: statusColors['pending'], emptyState: { variant: 'compact', title: 'No pending requests', body: '' } },
      { key: 'fulfilled', label: 'Fulfilled', targetStatus: 'fulfilled', color: statusColors['fulfilled'], emptyState: { variant: 'compact', title: 'No fulfilled requests', body: '' } },
      { key: 'rejected', label: 'Rejected', targetStatus: 'rejected', color: statusColors['rejected'], emptyState: { variant: 'compact', title: 'No rejected requests', body: '' } }
    ];

    let cardNumber = 1;
    const renderCard = (r) => {
      const wr = DB.getById('workRequests', r.workRequestId);
      const client = DB.getById('clients', r.clientId);
      const statusPriorityMap = {
        'pending': 'card-v2-priority-medium',
        'fulfilled': 'card-v2-priority-low',
        'rejected': 'card-v2-priority-critical'
      };
      const progressMap = { 'pending': 33, 'fulfilled': 100, 'rejected': 0 };

      let detail = '';
      if (r.status === 'fulfilled') {
        const fulfiller = DB.getById('users', r.fulfilledBy);
        detail = `Fulfilled by ${fulfiller ? fulfiller.name : 'System'}`;
      } else if (r.status === 'rejected' && r.rejectionReason) {
        detail = r.rejectionReason;
      }

      return buildCompactBoardCard({
        key: 'REQ-' + cardNumber++,
        progress: progressMap[r.status] || 0,
        statusColor: statusColors[r.status] || '#cbd5e1',
        title: self._requestTypeLabel(r.type),
        description: client ? client.name : '—',
        detail: (wr ? wr.title : '') + (detail ? ' • ' + detail : ''),
        date: r.requestedAt ? formatDate(r.requestedAt) : '',
        priority: r.status.charAt(0).toUpperCase() + r.status.slice(1),
        priorityClass: statusPriorityMap[r.status] || 'card-v2-priority-normal',
        onClick: () => {
          self.showRequestDetailsModal(r);
        }
      });
    };

    const cardMenuItems = (r) => {
      const menu = [
        {
          label: 'View Details',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
          onClick: () => { self.showRequestDetailsModal(r); }
        }
      ];
      if (r.status === 'pending') {
        menu.push({
          label: 'Cancel Request',
          className: 'danger',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
          onClick: () => Workflow.showConfirm('Cancel Request', 'Are you sure you want to cancel this request?', () => { DB.delete('operationsRequests', r.id); App.handleRoute(); }, 'danger')
        });
      }
      return menu;
    };

    KanbanBoard.render({
      container,
      items: requests,
      columns: columns.map(col => ({
        key: col.key,
        label: col.label,
        targetStatus: col.targetStatus,
        color: col.color,
        emptyState: col.emptyState
      })),
      renderCard,
      cardMenuItems,
      drag: { enabled: false }
    });
  },

  renderMyRequestsCompactListView(container, requests) {
    const self = this;
    const list = el('div', { class: 'list-view' });
    requests.forEach(r => {
      const item = el('div', { class: 'list-item' });
      const left = el('div');
      left.appendChild(el('div', { class: 'list-item-title', text: self._requestTypeLabel(r.type) }));
      const wr = DB.getById('workRequests', r.workRequestId);
      const client = DB.getById('clients', r.clientId);
      const metaParts = [
        client ? client.name : '',
        wr ? wr.title : '',
        r.status.charAt(0).toUpperCase() + r.status.slice(1),
        r.requestedAt ? formatDate(r.requestedAt) : ''
      ].filter(Boolean);
      left.appendChild(el('div', { class: 'list-item-meta', text: metaParts.join(' • ') }));
      if (r.status === 'fulfilled') {
        const fulfiller = DB.getById('users', r.fulfilledBy);
        left.appendChild(el('div', { class: 'list-item-meta', text: `Fulfilled by ${fulfiller ? fulfiller.name : 'System'} on ${formatDate(r.fulfilledAt)}`, style: 'color:var(--color-success);' }));
      }
      if (r.status === 'rejected' && r.rejectionReason) {
        left.appendChild(el('div', { class: 'list-item-meta', text: 'Reason: ' + r.rejectionReason, style: 'color:var(--color-danger);' }));
      }
      item.appendChild(left);
      const rightActions = el('div', { style: 'display:flex;gap:4px;align-items:center;' });
      const viewBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => {
        self.showRequestDetailsModal(r);
      });
      rightActions.appendChild(viewBtn);

      if (r.status === 'pending') {
        const cancelBtn = el('button', { class: 'btn btn-danger btn-sm', text: 'Cancel' });
        cancelBtn.addEventListener('click', () => {
          Workflow.showConfirm('Cancel Request', 'Are you sure you want to cancel this request?', () => { DB.delete('operationsRequests', r.id); App.handleRoute(); }, 'danger');
        });
        rightActions.appendChild(cancelBtn);
      }
      rightActions.appendChild(self._requestStatusBadge(r.status));
      item.appendChild(rightActions);
      list.appendChild(item);
    });
    container.appendChild(list);
  },

  showRequestDetailsModal(r) {
    const self = this;
    const wr = DB.getById('workRequests', r.workRequestId);
    const client = DB.getById('clients', r.clientId);
    const submitter = DB.getById('users', r.requestedBy);

    const wrapper = el('div', { class: 'form-stacked notion-form', style: 'padding: var(--spacing-xs); display: flex; flex-direction: column; gap: var(--spacing-md);' });

    // Status / Submitter info box
    const infoBox = el('div', { 
      style: 'background: var(--color-bg-light); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--spacing-sm); display: flex; flex-direction: column; gap: var(--spacing-xs);' 
    }, [
      el('div', { style: 'display:flex; justify-content:space-between; align-items:center;' }, [
        el('span', { text: 'Status', style: 'font-size:0.75rem; color:var(--color-text-muted); font-weight:600; text-transform:uppercase;' }),
        self._requestStatusBadge(r.status)
      ]),
      el('div', { style: 'display:flex; justify-content:space-between; align-items:center;' }, [
        el('span', { text: 'Submitted By', style: 'font-size:0.75rem; color:var(--color-text-muted); font-weight:600; text-transform:uppercase;' }),
        el('span', { text: submitter ? submitter.name : '—', style: 'font-weight:500;' })
      ]),
      el('div', { style: 'display:flex; justify-content:space-between; align-items:center;' }, [
        el('span', { text: 'Submitted At', style: 'font-size:0.75rem; color:var(--color-text-muted); font-weight:600; text-transform:uppercase;' }),
        el('span', { text: formatDate(r.requestedAt), style: 'font-weight:500;' })
      ])
    ]);
    wrapper.appendChild(infoBox);

    // Notion-style Property Grid
    const grid = el('div', { class: 'notion-property-grid', style: 'margin-bottom: var(--spacing-xs);' });

    const addProp = (label, valueNode) => {
      const row = el('div', { class: 'notion-property-row' });
      row.appendChild(el('div', { class: 'notion-property-label', text: label }));
      row.appendChild(el('div', { class: 'notion-property-value' }, [valueNode]));
      grid.appendChild(row);
    };

    addProp('Request Type', document.createTextNode(this._requestTypeLabel(r.type)));
    addProp('Client', document.createTextNode(client ? client.name : '—'));
    
    // Work Request Link / Text
    const wrSpan = el('span', { text: wr ? wr.title : '—' });
    if (wr) {
      wrSpan.style.cursor = 'pointer';
      wrSpan.style.color = 'var(--color-primary)';
      wrSpan.style.textDecoration = 'underline';
      wrSpan.addEventListener('click', () => {
        const overlay = document.querySelector('.modal-overlay');
        if (overlay) overlay.remove();
        location.hash = `#operations/detail/${wr.id}`;
      });
    }
    addProp('Work Request', wrSpan);

    // Render type-specific fields
    if (r.type === 'billing') {
      const linkedTask = r.linkedTaskId ? DB.getById('tasks', r.linkedTaskId) : null;
      addProp('Linked Task', document.createTextNode(linkedTask ? linkedTask.title : '— Whole Project —'));
      addProp('Amount', el('strong', { text: (r.amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'PHP' }) }));
      if (r.receiptFilename) {
        addProp('Receipt File', el('span', { text: r.receiptFilename, style: 'font-family: monospace;' }));
      }
    } else if (r.type === 'disbursement') {
      const linkedTask = r.linkedTaskId ? DB.getById('tasks', r.linkedTaskId) : null;
      addProp('Disbursement Type', document.createTextNode(r.disbursementType ? r.disbursementType.charAt(0).toUpperCase() + r.disbursementType.slice(1) : '—'));
      addProp('Category', document.createTextNode(r.category || '—'));
      addProp('Amount', el('strong', { text: (r.amount || 0).toLocaleString('en-US', { style: 'currency', currency: 'PHP' }) }));
      addProp('Payment Method', document.createTextNode(r.paymentMethod || '—'));
      if (linkedTask) {
        addProp('Linked Task', document.createTextNode(linkedTask.title));
      }
      if (r.receiptFilename) {
        addProp('Receipt File', el('span', { text: r.receiptFilename, style: 'font-family: monospace;' }));
      }
    } else if (r.type === 'transmittal') {
      addProp('Recipient & Delivery', document.createTextNode(r.recipientDetails || '—'));
    }

    wrapper.appendChild(grid);

    // Documents list for Transmittal
    if (r.type === 'transmittal' && r.documents && r.documents.length > 0) {
      wrapper.appendChild(el('h4', { text: 'Documents to Transmit', style: 'margin-top:var(--spacing-xs); margin-bottom:var(--spacing-xs); font-size:0.875rem;' }));
      const docList = el('ul', { style: 'padding-left: var(--spacing-md); margin-bottom: var(--spacing-sm); display:flex; flex-direction:column; gap:4px;' });
      r.documents.forEach(doc => {
        docList.appendChild(el('li', { text: doc, style: 'font-size:0.875rem;' }));
      });
      wrapper.appendChild(docList);
    }

    // Notes
    if (r.notes) {
      wrapper.appendChild(el('h4', { text: 'Notes', style: 'margin-top:var(--spacing-xs); margin-bottom:var(--spacing-xs); font-size:0.875rem;' }));
      wrapper.appendChild(el('div', { 
        text: r.notes, 
        style: 'background: var(--color-bg-light); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: var(--spacing-sm); font-size: 0.875rem; white-space: pre-wrap; font-style: italic;' 
      }));
    }

    // Fulfillment Details or Rejection Details
    if (r.status === 'fulfilled') {
      const fulfiller = DB.getById('users', r.fulfilledBy);
      wrapper.appendChild(el('h4', { text: 'Fulfillment Info', style: 'margin-top:var(--spacing-sm); margin-bottom:var(--spacing-xs); font-size:0.875rem; color:var(--success);' }));
      const fulfillBox = el('div', {
        style: 'background: color-mix(in oklab, var(--success), transparent 95%); border: 1px solid color-mix(in oklab, var(--success), transparent 70%); border-radius: var(--radius-sm); padding: var(--spacing-sm); font-size:0.875rem;'
      }, [
        el('div', { text: `Fulfilled by: ${fulfiller ? fulfiller.name : 'System'}` }),
        el('div', { text: `Fulfilled at: ${formatDate(r.fulfilledAt)}`, style: 'margin-top:4px;' })
      ]);
      wrapper.appendChild(fulfillBox);
    } else if (r.status === 'rejected') {
      const rejecter = r.fulfilledBy ? DB.getById('users', r.fulfilledBy) : null;
      wrapper.appendChild(el('h4', { text: 'Rejection Info', style: 'margin-top:var(--spacing-sm); margin-bottom:var(--spacing-xs); font-size:0.875rem; color:var(--danger);' }));
      const rejectBox = el('div', {
        style: 'background: color-mix(in oklab, var(--danger), transparent 95%); border: 1px solid color-mix(in oklab, var(--danger), transparent 70%); border-radius: var(--radius-sm); padding: var(--spacing-sm); font-size:0.875rem;'
      }, [
        el('div', { text: `Reason: ${r.rejectionReason || 'No reason provided'}` }),
        rejecter ? el('div', { text: `Rejected by: ${rejecter.name}`, style: 'margin-top:4px;' }) : null,
        r.fulfilledAt ? el('div', { text: `Rejected at: ${formatDate(r.fulfilledAt)}`, style: 'margin-top:4px;' }) : null
      ].filter(Boolean));
      wrapper.appendChild(rejectBox);
    }

    const title = `Request Details: ${this._requestTypeLabel(r.type)}`;
    Workflow.showModal(title, wrapper);
  }
};
