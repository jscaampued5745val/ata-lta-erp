/**
 * Workflow & Task Management Module
 * Work Request CRUD, task assignment, dependency engine (DAG), retainer templates.
 */

const Workflow = {
  editingId: null,
  view: 'list',
  detailWrId: null,
  templateEditingId: null,
  selectedTaskId: null,

  /**
   * Open a centered modal with a title and arbitrary body content.
   * Returns the overlay element so callers can remove it.
   */
  showModal(title, bodyEl, onClose) {
    const overlay = el('div', { class: 'modal-overlay' });
    const modal = el('div', { class: 'modal' });
    const header = el('div', { class: 'modal-header' });
    header.appendChild(el('h3', { class: 'modal-title', text: title }));
    const closeBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '✕' });
    closeBtn.addEventListener('click', () => { overlay.remove(); if (onClose) onClose(); });
    header.appendChild(closeBtn);
    modal.appendChild(header);
    const body = el('div', { class: 'modal-body' });
    body.appendChild(bodyEl);
    modal.appendChild(body);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) { overlay.remove(); if (onClose) onClose(); }
    });
    return overlay;
  },

  render() {
    const container = el('div', { class: 'page' });
    
    if (this.view === 'detail' && this.detailWrId) {
      const wr = DB.getById('workRequests', this.detailWrId);
      const isManagerial = Auth.user.role === 'Admin' || Auth.user.role === 'Manager';
      const titleBar = el('div', { class: 'page-title-bar-v2' });
      const h1 = el('h1', { class: 'breadcrumb-h1' });
      const opLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Operations' });
      opLink.addEventListener('click', () => { this.view = 'list'; this.detailWrId = null; App.handleRoute(); });
      h1.appendChild(opLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      h1.appendChild(document.createTextNode(wr?.title || 'Detail'));
      titleBar.appendChild(h1);
      
      const actions = el('div', { class: 'title-bar-actions' });
      if (isManagerial && wr) {
        const addBtn = el('button', { class: 'btn btn-primary btn-sm', text: '+ Add Task', style: 'margin-right: var(--spacing-sm);' });
        addBtn.addEventListener('click', () => { this.showAddTaskModal(wr.id, () => App.handleRoute()); });
        actions.appendChild(addBtn);
      }
      const backBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to List' });
      backBtn.addEventListener('click', () => { this.view = 'list'; this.detailWrId = null; App.handleRoute(); });
      actions.appendChild(backBtn);
      titleBar.appendChild(actions);
      container.appendChild(titleBar);
    } else {
      container.appendChild(el('h1', { text: 'Operations' }));
    }

    if (this.view === 'list') {
      container.appendChild(this.renderList());
    } else if (this.view === 'form') {
      container.appendChild(this.renderForm());
    } else if (this.view === 'detail') {
      container.appendChild(this.renderDetail());
    } else if (this.view === 'templates') {
      container.appendChild(this.renderTemplates());
    } else if (this.view === 'templateForm') {
      container.appendChild(this.renderTemplateForm());
    }

    return container;
  },

  init() {},

  // ============================================================
  // List View
  // ============================================================
  renderList() {
    const entity = Auth.activeEntity;
    const isManagerial = Auth.user.role === 'Admin' || Auth.user.role === 'Manager';

    const wrapper = el('div');

    // Header bar
    const headerBar = el('div', { class: 'form-header-bar' });
    headerBar.appendChild(el('h2', { text: 'Work Requests' }));
    const topActions = el('div', { class: 'form-actions-top' });
    if (Auth.user.role === 'Manager') {
      const addBtn = el('button', { class: 'btn btn-primary', text: 'Add Work Request' });
      addBtn.addEventListener('click', () => { this.view = 'form'; this.editingId = null; App.handleRoute(); });
      topActions.appendChild(addBtn);
      const templateBtn = el('button', { class: 'btn btn-ghost', text: 'Retainer Templates' });
      templateBtn.addEventListener('click', () => { this.view = 'templates'; this.templateEditingId = null; App.handleRoute(); });
      topActions.appendChild(templateBtn);
    }
    headerBar.appendChild(topActions);
    wrapper.appendChild(headerBar);

    // Filters
    const filters = el('div', { class: 'filters-bar' });
    const priorityFilter = el('select', { class: 'form-select' });
    priorityFilter.appendChild(el('option', { value: '', text: 'All Priorities' }));
    ['Urgent', 'Priority', 'Low Priority'].forEach(p => priorityFilter.appendChild(el('option', { value: p, text: p })));
    filters.appendChild(priorityFilter);

    const empFilter = el('select', { class: 'form-select' });
    empFilter.appendChild(el('option', { value: '', text: 'All Employees' }));
    DB.getWhere('users', u => u.entities?.map(e => e.toUpperCase()).includes(entity)).forEach(u => {
      empFilter.appendChild(el('option', { value: u.id, text: u.name }));
    });
    filters.appendChild(empFilter);

    const clientFilter = el('select', { class: 'form-select' });
    clientFilter.appendChild(el('option', { value: '', text: 'All Clients' }));
    DB.getWhere('clients', c => c.entity === entity).forEach(c => {
      clientFilter.appendChild(el('option', { value: c.id, text: c.name }));
    });
    filters.appendChild(clientFilter);

    const dateFrom = el('input', { type: 'date', class: 'form-select' });
    const dateTo = el('input', { type: 'date', class: 'form-select' });
    filters.appendChild(el('span', { text: 'Due From', style: 'font-size:0.875rem;color:var(--color-text-muted);' }));
    filters.appendChild(dateFrom);
    filters.appendChild(el('span', { text: 'Due To', style: 'font-size:0.875rem;color:var(--color-text-muted);' }));
    filters.appendChild(dateTo);

    const statusFilter = el('select', { class: 'form-select' });
    statusFilter.appendChild(el('option', { value: '', text: 'All Statuses' }));
    ['Draft', 'Pre-processing', 'Processing', 'Billing', 'Disbursement', 'Completed', 'Cancelled'].forEach(s => {
      statusFilter.appendChild(el('option', { value: s, text: s }));
    });
    filters.appendChild(statusFilter);
    wrapper.appendChild(filters);

    // View mode toggle
    const viewMode = App.getPreferredViewMode('operations');
    const vmToggle = el('div', { class: 'view-mode-toggle', style: 'margin-bottom:var(--spacing-md);' });
    const vmTable = el('button', { text: 'Table', class: viewMode === 'table' ? 'active' : '' });
    const vmBoard = el('button', { text: 'Board', class: viewMode === 'board' ? 'active' : '' });
    const vmList = el('button', { text: 'List', class: viewMode === 'list' ? 'active' : '' });
    vmTable.addEventListener('click', () => { App.setPreferredViewMode('operations', 'table'); App.handleRoute(); });
    vmBoard.addEventListener('click', () => { App.setPreferredViewMode('operations', 'board'); App.handleRoute(); });
    vmList.addEventListener('click', () => { App.setPreferredViewMode('operations', 'list'); App.handleRoute(); });
    vmToggle.appendChild(vmTable);
    vmToggle.appendChild(vmBoard);
    vmToggle.appendChild(vmList);
    wrapper.appendChild(vmToggle);

    const contentContainer = el('div');
    wrapper.appendChild(contentContainer);

    const refresh = () => {
      while (contentContainer.firstChild) contentContainer.removeChild(contentContainer.firstChild);
      let wrs = DB.getWhere('workRequests', r => r.entity === entity);
      if (!isManagerial && !Auth.can('dms:handover')) {
        const myTasks = DB.getWhere('tasks', t => t.assigneeId === Auth.user.id || t.assignedTo === Auth.user.id);
        const myWrIds = new Set(myTasks.map(t => t.workRequestId));
        wrs = wrs.filter(r => myWrIds.has(r.id) || r.assignedTo === Auth.user.id);
      }
      if (priorityFilter.value) wrs = wrs.filter(r => r.priority === priorityFilter.value);
      if (empFilter.value) wrs = wrs.filter(r => r.assignedTo === empFilter.value);
      if (clientFilter.value) wrs = wrs.filter(r => r.clientId === clientFilter.value);
      if (dateFrom.value) wrs = wrs.filter(r => r.dueDate && r.dueDate >= dateFrom.value);
      if (dateTo.value) wrs = wrs.filter(r => r.dueDate && r.dueDate <= dateTo.value);
      if (statusFilter.value) wrs = wrs.filter(r => r.status === statusFilter.value);

      if (viewMode === 'table') this.refreshTable(contentContainer, wrs);
      else if (viewMode === 'board') this.refreshBoard(contentContainer, wrs);
      else this.refreshListCompact(contentContainer, wrs);
    };

    [priorityFilter, empFilter, clientFilter, dateFrom, dateTo, statusFilter].forEach(el => el.addEventListener('change', refresh));
    refresh();

    return wrapper;
  },

  refreshTable(container, wrs) {
    if (wrs.length === 0) {
      container.appendChild(el('p', { text: 'No work requests found.', class: 'empty-state' }));
      return;
    }
    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Title', 'Client', 'Priority', 'Status', 'Due', 'Assignee', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);
    const tbody = el('tbody');
    wrs.forEach(wr => {
      const client = DB.getById('clients', wr.clientId);
      const assignedUser = DB.getById('users', wr.assignedTo);
      const tr = el('tr');
      tr.appendChild(el('td', { text: wr.title }));
      tr.appendChild(el('td', { text: client?.name || '—' }));
      tr.appendChild(el('td', { text: wr.priority || '—' }));
      tr.appendChild(el('td')).appendChild(this.statusBadge(wr.status));
      tr.appendChild(el('td', { text: wr.dueDate ? formatDate(wr.dueDate) : '—' }));
      tr.appendChild(el('td', { text: assignedUser?.name || '—' }));
      const tdAct = el('td');
      const viewBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { this.view = 'detail'; this.detailWrId = wr.id; App.handleRoute(); });
      tdAct.appendChild(viewBtn);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  },

  refreshBoard(container, wrs) {
    if (wrs.length === 0) {
      container.appendChild(el('p', { text: 'No work requests found.', class: 'empty-state' }));
      return;
    }
    const board = el('div', { class: 'board-v2' });
    const statuses = ['Draft', 'Pre-processing', 'Processing', 'Billing', 'Disbursement', 'Completed', 'Cancelled'];
    const statusColors = {
      'Draft': '#94a3b8',
      'Pre-processing': '#3b82f6',
      'Processing': '#f59e0b',
      'Billing': '#a855f7',
      'Disbursement': '#6366f1',
      'Completed': '#10b981',
      'Cancelled': '#ef4444'
    };

    statuses.forEach(st => {
      const colColor = statusColors[st] || '#cbd5e1';
      const col = el('div', { class: 'board-column-v2' });
      col.style.borderTop = `4px solid ${colColor}`;
      
      const header = el('div', { class: 'board-column-header-v2' });
      header.appendChild(el('div', { class: 'board-column-title', text: st }));
      col.appendChild(header);

      const colWrs = wrs.filter(wr => wr.status === st);
      const cardContainer = el('div', { class: 'board-cards-scroll' });

      colWrs.forEach(wr => {
        const tasks = DB.getWhere('tasks', t => t.workRequestId === wr.id);
        const completedTasks = tasks.filter(t => t.status === 'Completed').length;
        const totalTasks = tasks.length;
        const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        
        const allComments = tasks.reduce((acc, t) => acc + (t.comments?.length || 0), 0);
        const allDocs = tasks.reduce((acc, t) => acc + (t.taskDocuments?.length || 0), 0);

        const assigneeIds = [...new Set(tasks.map(t => t.assigneeId || t.assignedTo).filter(Boolean))];
        const assignees = assigneeIds.map(id => DB.getById('users', id)).filter(Boolean);

        const card = el('div', { class: 'board-card-v2' });
        card.style.borderLeftColor = colColor;
        card.addEventListener('click', () => { this.view = 'detail'; this.detailWrId = wr.id; App.handleRoute(); });

        // Top: Priority path and Due Date
        const topRow = el('div', { class: 'card-v2-top' });
        const categoryPath = el('span', { class: 'card-v2-category', text: `${wr.priority} >` });
        topRow.appendChild(categoryPath);
        if (wr.dueDate) {
          topRow.appendChild(el('span', { class: 'card-v2-date', text: formatDate(wr.dueDate) }));
        }
        card.appendChild(topRow);

        // Middle: Title and Checkbox placeholder
        const titleRow = el('div', { class: 'card-v2-title-row' });
        const checkbox = el('div', { class: 'card-v2-checkbox' });
        if (wr.status === 'Completed') checkbox.classList.add('checked');
        titleRow.appendChild(checkbox);
        titleRow.appendChild(el('div', { class: 'card-v2-title', text: wr.title }));
        card.appendChild(titleRow);

        // Metadata: Progress, Doc count, Comment count, Avatars
        const metaRow = el('div', { class: 'card-v2-meta' });
        const metaLeft = el('div', { class: 'card-v2-meta-left' });
        
        if (totalTasks > 0) {
          const progBar = el('div', { class: 'card-v2-progress' });
          progBar.appendChild(el('div', { class: 'card-v2-progress-fill', style: `width: ${progress}%; background-color: ${colColor};` }));
          metaLeft.appendChild(progBar);
          metaLeft.appendChild(el('span', { class: 'card-v2-meta-text', text: `${progress}%` }));
        }

        if (allDocs > 0) {
          metaLeft.appendChild(el('span', { class: 'card-v2-meta-icon', text: `📎 ${allDocs}` }));
        }
        if (allComments > 0) {
          metaLeft.appendChild(el('span', { class: 'card-v2-meta-icon', text: `💬 ${allComments}` }));
        }
        metaRow.appendChild(metaLeft);

        const avatars = el('div', { class: 'card-v2-avatars' });
        assignees.slice(0, 3).forEach(u => {
          const av = el('div', { class: 'avatar-xs' });
          if (u.avatarUrl) av.style.backgroundImage = `url('${u.avatarUrl}')`;
          avatars.appendChild(av);
        });
        metaRow.appendChild(avatars);
        card.appendChild(metaRow);

        cardContainer.appendChild(card);
      });

      col.appendChild(cardContainer);
      
      board.appendChild(col);
    });
    container.appendChild(board);
  },

  refreshListCompact(container, wrs) {
    if (wrs.length === 0) {
      container.appendChild(el('p', { text: 'No work requests found.', class: 'empty-state' }));
      return;
    }
    const list = el('div', { class: 'list-view' });
    wrs.forEach(wr => {
      const client = DB.getById('clients', wr.clientId);
      const row = el('div', { class: 'list-item' });
      row.appendChild(el('div', {}, [
        el('div', { class: 'list-item-title', text: wr.title }),
        el('div', { class: 'list-item-meta', text: (client?.name || '—') + ' | Due: ' + (wr.dueDate ? formatDate(wr.dueDate) : '—') })
      ]));
      row.appendChild(this.statusBadge(wr.status));
      row.addEventListener('click', () => { this.view = 'detail'; this.detailWrId = wr.id; App.handleRoute(); });
      list.appendChild(row);
    });
    container.appendChild(list);
  },

  statusBadge(status) {
    const map = {
      'Draft': 'badge-info',
      'Pre-processing': 'badge-info',
      'Processing': 'badge-warning',
      'Billing': 'badge-warning',
      'Disbursement': 'badge-warning',
      'Completed': 'badge-success',
      'Cancelled': 'badge-danger'
    };
    return el('span', { class: 'badge ' + (map[status] || ''), text: status });
  },

  renderProgressBar(status) {
    const stages = ['Work Request', 'Pre-processing', 'Processing', 'Billing', 'Disbursement', 'Documentation'];
    const map = { 'Draft': 0, 'Pre-processing': 1, 'Processing': 2, 'Billing': 3, 'Disbursement': 4, 'Completed': 5, 'Cancelled': 5 };
    const current = map[status] ?? 0;
    const wrap = el('div', { class: 'workflow-progress' });
    stages.forEach((s, i) => {
      const step = el('div', { class: 'progress-step', text: s });
      if (i < current) step.classList.add('completed');
      else if (i === current) step.classList.add('active');
      wrap.appendChild(step);
    });
    return wrap;
  },

  // ============================================================
  // Create / Edit Form
  // ============================================================
  renderForm() {
    const isManagerial = Auth.user.role === 'Admin' || Auth.user.role === 'Manager';
    if (!isManagerial) {
      this.view = 'list';
      App.handleRoute();
      return el('div');
    }

    const entity = Auth.activeEntity;
    const wr = this.editingId ? DB.getById('workRequests', this.editingId) : null;
    const container = el('div');

    // Header bar
    const headerBar = el('div', { class: 'form-header-bar' });
    headerBar.appendChild(el('h2', { text: wr ? 'Edit Work Request' : 'Add Work Request' }));
    const topActions = el('div', { class: 'form-actions-top' });
    const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Save Work Request', form: 'wr-form' });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => { this.view = 'list'; this.editingId = null; App.handleRoute(); });
    topActions.appendChild(saveBtn);
    topActions.appendChild(cancelBtn);
    headerBar.appendChild(topActions);
    container.appendChild(headerBar);

    const form = el('form', { id: 'wr-form', class: 'form-stacked' });

    const fields = [
      { label: 'Title', name: 'title', type: 'text', required: true },
      { label: 'Description', name: 'description', type: 'text' },
      { label: 'Due Date', name: 'dueDate', type: 'date' },
    ];
    fields.forEach(f => {
      const group = el('div', { class: 'form-group' });
      group.appendChild(el('label', { text: f.label + (f.required ? ' *' : '') }));
      const input = el('input', {
        type: f.type, name: f.name,
        value: wr ? (wr[f.name] || '') : '',
        required: f.required
      });
      group.appendChild(input);
      form.appendChild(group);
    });

    // Priority dropdown
    const priorityGroup = el('div', { class: 'form-group' });
    priorityGroup.appendChild(el('label', { text: 'Priority' }));
    const prioritySel = el('select', { name: 'priority' });
    ['Urgent', 'Priority', 'Low Priority'].forEach(p => {
      const opt = el('option', { value: p, text: p });
      if (wr && wr.priority === p) opt.selected = true;
      prioritySel.appendChild(opt);
    });
    // Fallback selection if existing priority doesn't match
    if (wr && wr.priority && !['Urgent','Priority','Low Priority'].includes(wr.priority)) {
      const fallbackOpt = el('option', { value: wr.priority, text: wr.priority });
      fallbackOpt.selected = true;
      prioritySel.insertBefore(fallbackOpt, prioritySel.firstChild);
    }
    priorityGroup.appendChild(prioritySel);
    form.appendChild(priorityGroup);

    // Client dropdown
    const clientGroup = el('div', { class: 'form-group' });
    clientGroup.appendChild(el('label', { text: 'Client *' }));
    const clientSel = el('select', { name: 'clientId', required: true });
    clientSel.appendChild(el('option', { value: '', text: '— Select Client —' }));
    DB.getWhere('clients', c => c.entity === entity).forEach(c => {
      const opt = el('option', { value: c.id, text: c.name });
      if (wr && wr.clientId === c.id) opt.selected = true;
      clientSel.appendChild(opt);
    });
    clientGroup.appendChild(clientSel);
    form.appendChild(clientGroup);

    // Retainer Template selector
    const templateGroup = el('div', { class: 'form-group' });
    templateGroup.appendChild(el('label', { text: 'Use Retainer Template' }));
    const templateSel = el('select', { name: 'templateId' });
    templateSel.appendChild(el('option', { value: '', text: '— None —' }));
    DB.getWhere('retainerTemplates', t => t.entity === entity).forEach(t => {
      templateSel.appendChild(el('option', { value: t.id, text: t.name }));
    });
    templateGroup.appendChild(templateSel);
    form.appendChild(templateGroup);

    // Retainer checkbox
    const retainerGroup = el('div', { class: 'form-group' });
    const retLabel = el('label', { class: 'checkbox-label' });
    const retCb = el('input', { type: 'checkbox', name: 'isRetainer' });
    retLabel.appendChild(retCb);
    retLabel.appendChild(document.createTextNode(' Save as retainer template'));
    retainerGroup.appendChild(retLabel);

    const scheduleGroup = el('div', { class: 'form-group hidden', id: 'retainer-schedule' });
    scheduleGroup.appendChild(el('label', { text: 'Schedule' }));
    const scheduleSel = el('select', { name: 'schedule' });
    ['monthly', 'quarterly'].forEach(s => scheduleSel.appendChild(el('option', { value: s, text: s })));
    scheduleGroup.appendChild(scheduleSel);
    retainerGroup.appendChild(scheduleGroup);

    const amountGroup = el('div', { class: 'form-group hidden', id: 'retainer-amount' });
    amountGroup.appendChild(el('label', { text: 'Professional Fee Amount (₱)' }));
    amountGroup.appendChild(el('input', { type: 'number', name: 'templateAmount', min: 0, step: 0.01 }));
    retainerGroup.appendChild(amountGroup);

    retCb.addEventListener('change', () => {
      scheduleGroup.classList.toggle('hidden', !retCb.checked);
      amountGroup.classList.toggle('hidden', !retCb.checked);
    });
    form.appendChild(retainerGroup);

    // Tasks section
    const tasksSection = el('div', { class: 'form-section' });
    tasksSection.appendChild(el('h3', { text: 'Tasks' }));
    const tasksList = el('div', { id: 'task-rows' });
    tasksSection.appendChild(tasksList);

    const loadTemplateBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Load Template Tasks' });
    loadTemplateBtn.addEventListener('click', () => this.loadTemplateTasks(templateSel.value, tasksList));
    tasksSection.appendChild(loadTemplateBtn);

    const addTaskBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: '+ Add Task' });
    addTaskBtn.addEventListener('click', () => this.addTaskRow(tasksList));
    tasksSection.appendChild(addTaskBtn);
    form.appendChild(tasksSection);

    // Pre-populate existing tasks if editing
    if (wr) {
      const existingTasks = DB.getWhere('tasks', t => t.workRequestId === wr.id);
      existingTasks.forEach(t => this.addTaskRow(tasksList, t));
    } else {
      this.addTaskRow(tasksList);
      this.addTaskRow(tasksList);
    }
    this.updatePredecessorOptions(tasksList);

    form.addEventListener('submit', e => { e.preventDefault(); this.submitForm(form); });

    container.appendChild(form);
    return container;
  },

  addTaskRow(container, taskData) {
    const row = el('div', { class: 'task-row' });
    row.dataset.taskKey = taskData?.id || generateId('tmp');
    const existingPred = (taskData?.predecessors || taskData?.dependencies || [])[0];
    if (existingPred) row.dataset.predKey = existingPred;

    const titleIn = el('input', { type: 'text', placeholder: 'Task title', class: 'task-title-input', value: taskData?.title || '' });
    titleIn.addEventListener('input', () => this.updatePredecessorOptions(container));
    row.appendChild(titleIn);

    const assigneeSel = el('select', { class: 'task-assignee' });
    assigneeSel.appendChild(el('option', { value: '', text: '— Assignee —' }));
    
    // Only show users from the same entity
    const entity = Auth.activeEntity;
    const staffPool = DB.getWhere('users', u => u.entities.includes(entity) || u.entities.includes(entity.toLowerCase()));
    
    staffPool.forEach(u => {
      const opt = el('option', { value: u.id, text: u.name });
      if (taskData && (taskData.assigneeId === u.id || taskData.assignedTo === u.id)) opt.selected = true;
      assigneeSel.appendChild(opt);
    });
    row.appendChild(assigneeSel);

    const predSel = el('select', { class: 'task-pred' });
    predSel.addEventListener('change', () => {
      row.dataset.predKey = predSel.value;
    });
    row.appendChild(predSel);

    const removeBtn = el('button', { type: 'button', class: 'btn btn-danger btn-sm', text: '×' });
    removeBtn.addEventListener('click', () => {
      row.remove();
      this.updatePredecessorOptions(container);
    });
    row.appendChild(removeBtn);

    container.appendChild(row);
    this.updatePredecessorOptions(container);
  },

  updatePredecessorOptions(container) {
    const rows = Array.from(container.querySelectorAll('.task-row'));
    const tasks = rows.map((row, idx) => ({
      key: row.dataset.taskKey,
      label: row.querySelector('.task-title-input').value.trim() || `Task ${idx + 1}`
    }));

    rows.forEach((row, idx) => {
      const predSel = row.querySelector('.task-pred');
      const current = row.dataset.predKey || predSel.value || '';
      predSel.innerHTML = '';
      predSel.appendChild(el('option', { value: '', text: '— No predecessor —' }));

      tasks.forEach(task => {
        if (task.key === row.dataset.taskKey) return;
        const opt = el('option', { value: task.key, text: task.label });
        predSel.appendChild(opt);
      });

      if (current) {
        predSel.value = current;
        row.dataset.predKey = predSel.value === current ? current : '';
      } else {
        row.dataset.predKey = '';
      }
    });
  },

  loadTemplateTasks(templateId, container) {
    if (!templateId) {
      alert('Please select a retainer template first.');
      return;
    }
    const template = DB.getById('retainerTemplates', templateId);
    if (!template) return;
    while (container.firstChild) container.removeChild(container.firstChild);
    (template.tasks || []).forEach(task => {
      this.addTaskRow(container, task);
    });
    this.updatePredecessorOptions(container);
  },

  submitForm(form) {
    if (!validateRequiredFields(form)) return;
    const data = Object.fromEntries(new FormData(form).entries());
    const entity = Auth.activeEntity;

    const now = new Date().toISOString();
    const record = {
      title: data.title.trim(),
      description: data.description?.trim() || '',
      clientId: data.clientId,
      priority: data.priority?.trim() || 'Priority',
      dueDate: data.dueDate || '',
      entity: entity,
      status: this.editingId ? (DB.getById('workRequests', this.editingId)?.status || 'Draft') : 'Draft',
      updatedAt: now
    };

    // Collect tasks from rows
    const taskRows = form.querySelectorAll('.task-row');
    const tasks = [];
    taskRows.forEach(row => {
      const title = row.querySelector('.task-title-input').value.trim();
      if (!title) return;
      tasks.push({
        key: row.dataset.taskKey || generateId('tmp'),
        title,
        assigneeId: row.querySelector('.task-assignee').value || null,
        predecessorKey: row.querySelector('.task-pred').value || ''
      });
    });

    const cycleCheck = tasks.map(t => ({
      id: t.key,
      predecessors: t.predecessorKey ? [t.predecessorKey] : []
    }));
    if (this.detectCycle(cycleCheck)) {
      alert('Task dependencies contain a cycle. Please fix before saving.');
      return;
    }

    const existingTasksById = {};
    if (this.editingId) {
      DB.getWhere('tasks', t => t.workRequestId === this.editingId).forEach(t => {
        existingTasksById[t.id] = t;
      });
    }

    const recordId = this.editingId || generateId('wr');
    const idMap = new Map();
    tasks.forEach(t => idMap.set(t.key, generateId('t')));

    const taskRecords = tasks.map((t, i) => {
      const existing = existingTasksById[t.key];
      const predId = t.predecessorKey ? idMap.get(t.predecessorKey) : null;
      return {
        id: idMap.get(t.key),
        workRequestId: recordId,
        title: t.title,
        assigneeId: t.assigneeId || null,
        predecessors: predId ? [predId] : [],
        status: existing?.status || 'Draft',
        dueDate: record.dueDate,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        sortOrder: i
      };
    });

    const isNew = !this.editingId;
    if (isNew) {
      record.id = recordId;
      record.createdAt = now;
      record.linkedInvoiceId = null;
      record.linkedDisbursementIds = [];
      record.linkedTransmittalIds = [];
    } else {
      record.id = this.editingId;
      const existingWr = DB.getById('workRequests', this.editingId);
      record.linkedInvoiceId = existingWr?.linkedInvoiceId || null;
      record.linkedDisbursementIds = existingWr?.linkedDisbursementIds || [];
      record.linkedTransmittalIds = existingWr?.linkedTransmittalIds || [];
    }

    const result = PendingChanges.submit('workRequests', record, isNew);

    // Tasks are always saved directly (they're child records, not structural mutations per se)
    if (result.approved) {
      if (isNew) {
        taskRecords.forEach(t => {
          t.workRequestId = record.id;
          DB.insert('tasks', t);
        });
      } else {
        const existing = DB.getWhere('tasks', t => t.workRequestId === this.editingId);
        existing.forEach(t => DB.delete('tasks', t.id));
        taskRecords.forEach(t => {
          t.workRequestId = this.editingId;
          DB.insert('tasks', t);
        });
      }
    } else {
      // When pending, tasks aren't saved yet. In a real system they'd be staged too.
      // For this prototype, we just let the WR be pending and tasks will be created on approval.
    }

    if (data.isRetainer) {
      const tmplId = generateId('rt');
      const tmplMap = new Map();
      tasks.forEach(t => tmplMap.set(t.key, generateId('rtt')));
      const tmplTasks = tasks.map(t => {
        const predId = t.predecessorKey ? tmplMap.get(t.predecessorKey) : null;
        return {
          id: tmplMap.get(t.key),
          title: t.title,
          assigneeId: t.assigneeId || null,
          predecessors: predId ? [predId] : []
        };
      });
      DB.insert('retainerTemplates', {
        id: tmplId,
        name: record.title + ' Template',
        description: record.description,
        clientId: record.clientId,
        entity: record.entity,
        schedule: data.schedule || 'monthly',
        pfAmount: parseFloat(data.templateAmount) || 0,
        tasks: tmplTasks,
        createdAt: now,
        updatedAt: now
      });
    }

    this.view = 'list';
    this.editingId = null;
    App.handleRoute();
  },

  renderDetail() {
    const wr = DB.getById('workRequests', this.detailWrId);
    if (!wr) {
      this.view = 'list';
      App.handleRoute();
      return el('div');
    }
    const client = DB.getById('clients', wr.clientId);
    const tasks = DB.getWhere('tasks', t => t.workRequestId === wr.id);
    const isManagerial = Auth.user.role === 'Admin' || Auth.user.role === 'Manager';

    const container = el('div', { class: 'project-detail-v2' });

    // Beautified Sub-Header
    const subHeader = el('div', { class: 'detail-sub-header-v2' });
    
    const infoItems = [
      { label: 'Client', value: client?.name || '—' },
      { label: 'Status', value: wr.status },
      { label: 'Priority', value: wr.priority || 'Normal' }
    ];

    infoItems.forEach(item => {
      const div = el('div', { class: 'detail-info-item' });
      div.appendChild(el('span', { class: 'detail-info-label', text: item.label }));
      div.appendChild(el('span', { class: 'detail-info-value', text: item.value }));
      subHeader.appendChild(div);
    });
    container.appendChild(subHeader);

    // Modern Centered Progress Indicator
    container.appendChild(this.renderModernProgressBar(wr.status));

    // Task List (Grouped table design)
    const listWrapper = el('div', { class: 'task-list-v2' });
    
    // Default Sorting: Priority > Due Date > Completed at bottom
    const sortedTasks = [...tasks].sort((a, b) => {
      const aComp = a.status === 'Completed' ? 1 : 0;
      const bComp = b.status === 'Completed' ? 1 : 0;
      if (aComp !== bComp) return aComp - bComp;

      const pMap = { 'Urgent': 3, 'Priority': 2, 'Low Priority': 1, 'Normal': 0 };
      const aP = pMap[a.priority] || 0;
      const bP = pMap[b.priority] || 0;
      if (aP !== bP) return bP - aP;

      if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return 0;
    });

    const isDocStaff = Auth.user?.name?.toLowerCase().includes('documentation') ||
                       Auth.user?.email?.toLowerCase().startsWith('docs@');

    const groups = { 'General Tasks': sortedTasks };
    for (const [groupName, groupTasks] of Object.entries(groups)) {
      const groupEl = el('div', { class: 'task-group-v2' });
      const groupHeader = el('div', { class: 'task-group-header' });
      groupHeader.appendChild(el('span', { text: groupName }));
      groupHeader.appendChild(el('span', { class: 'task-group-count', text: ` — ${groupTasks.length} tasks` }));
      groupEl.appendChild(groupHeader);

      const table = el('table', { class: 'task-table-v2' });
      const thead = el('thead');
      const thr = el('tr');
      ['Task', 'Assigned To', 'Due Date', 'Progress Status', 'Priority', 'Est. Amount', 'Hours'].forEach(h => {
        thr.appendChild(el('th', { text: h }));
      });
      thead.appendChild(thr);
      table.appendChild(thead);

      const tbody = el('tbody');
      let totalAmount = 0;
      let totalHours = 0;

      groupTasks.forEach(t => {
        const assignee = DB.getById('users', t.assigneeId || t.assignedTo);
        const tr = el('tr', { class: 'task-row-v2' });
        
        // Totals calculation
        const hours = (t.timeLogs || []).reduce((acc, l) => acc + (l.hours || 0), 0);
        totalHours += hours;
        totalAmount += 1200; // Mock amount per task

        // Task Title Cell (With collapsible indicator)
        const tdTitle = el('td');
        const titleWrap = el('div', { class: 'task-v2-title-cell' });
        titleWrap.appendChild(el('span', { class: 'task-v2-row-caret', text: '›' }));
        titleWrap.appendChild(el('div', { class: 'task-v2-title' + (t.status === 'Completed' ? ' completed' : ''), text: t.title }));
        tdTitle.appendChild(titleWrap);
        tr.appendChild(tdTitle);

        // Assigned To
        const tdAssignee = el('td');
        const assigneeWrap = el('div', { style: 'display:flex; align-items:center; gap:var(--spacing-xs);' });
        const av = el('div', { class: 'avatar-xs' });
        if (assignee?.avatarUrl) av.style.backgroundImage = `url('${assignee.avatarUrl}')`;
        assigneeWrap.appendChild(av);
        assigneeWrap.appendChild(el('span', { text: assignee?.name || 'Unassigned', style: !assignee ? 'color:var(--color-text-muted);font-style:italic;' : '' }));
        tdAssignee.appendChild(assigneeWrap);
        tr.appendChild(tdAssignee);

        // Due Date
        tr.appendChild(el('td', { text: t.dueDate ? formatDate(t.dueDate) : '—' }));

        // Progress Status (Dropdown with Left Arrow)
        const tdStatus = el('td');
        const statusWrapper = el('div', { class: 'status-dropdown-wrapper-v2' });
        const statusSel = el('select', { class: 'form-select status-dropdown-v2' });
        statusSel.addEventListener('click', (e) => e.stopPropagation()); // Prevent accordion toggle

        const flow = ['Draft', 'Assigned', 'In Progress', 'For Review', 'Completed', 'Cancelled'];
        flow.forEach(s => {
          const opt = el('option', { value: s, text: s });
          if (s === t.status) opt.selected = true;
          if (s === 'Completed' && t.status !== 'For Review' && t.status !== 'Completed') {
              opt.disabled = true;
          }
          statusSel.appendChild(opt);
        });

        const sColors = { 'Completed': '#10b981', 'In Progress': '#f59e0b', 'Draft': '#94a3b8', 'For Review': '#a855f7', 'Assigned': '#3b82f6', 'Cancelled': '#ef4444' };
        statusSel.style.color = sColors[t.status] || '#1e293b';

        statusSel.addEventListener('change', () => {
          const res = this.updateTaskStatus(t.id, statusSel.value);
          if (res.error) {
            alert(res.error);
            statusSel.value = t.status;
          } else {
            App.handleRoute();
          }
        });

        statusWrapper.appendChild(statusSel);
        tdStatus.appendChild(statusWrapper);
        tr.appendChild(tdStatus);

        // Priority
        const tdPriority = el('td');
        const pColors = { 'Urgent': '#ef4444', 'Priority': '#f59e0b', 'Low Priority': '#10b981', 'Normal': '#94a3b8' };
        const pText = t.priority === 'Urgent' ? '● Critical' : t.priority === 'Priority' ? '↑ High' : t.priority || 'Normal';
        tdPriority.appendChild(el('span', { class: 'priority-badge-v2', style: `color:${pColors[t.priority] || '#94a3b8'}`, text: pText }));
        tr.appendChild(tdPriority);

        // Financials (Aligned)
        tr.appendChild(el('td', { text: formatPHP(1200) }));

        // Hours (Aligned)
        tr.appendChild(el('td', { text: hours > 0 ? `${hours}h` : '—' }));

        tbody.appendChild(tr);

        // Accordion Details Row
        const detailsTr = el('tr', { class: 'task-details-row hidden' });
        const detailsTd = el('td', { colspan: 7 });
        const detailsContainer = el('div', { class: 'task-details-container' });
        
        const detailsGrid = el('div', { class: 'task-details-grid' });
        
        // Attached Documents Section
        const isAdmin = Auth.user.role === 'Admin';
        const isDocStaff = Auth.user.role === 'Staff' && Auth.can('dms:handover');
        
        const docsSection = el('div', { class: 'task-details-col' });
        const docsHeader = el('div', { class: 'details-section-title' });
        docsHeader.appendChild(el('span', { text: 'Attached Documents' }));
        
        // Only Documentation Staff can upload
        if (isDocStaff) {
          const addDocBtn = el('button', { class: 'btn btn-primary btn-xs btn-add-inline', text: '+ Upload Scanned' });
          addDocBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showAddDocumentModal(t.id); });
          docsHeader.appendChild(addDocBtn);
        }
        
        docsSection.appendChild(docsHeader);

        const docsList = el('div', { class: 'details-content-list' });
        if ((t.taskDocuments || []).length === 0) {
          docsList.appendChild(el('div', { class: 'empty-state', text: 'No documents attached.' }));
        } else {
          t.taskDocuments.forEach((d, dIdx) => {
            const item = el('div', { class: 'detail-item-v2', style: 'display:flex; justify-content:space-between; align-items:center;' });
            const leftSide = el('div', { style: 'display:flex; flex-direction:column;' });
            
            const fName = d.fileName || d.filename;

            // Only Admin can click to view actual file
            if (isAdmin) {
              const dmsDoc = DB.getWhere('documents', doc => 
                (doc.fileName === fName) && doc.workRequestId === wr.id
              )[0];

              if (dmsDoc && dmsDoc.dataUrl) {
                const link = el('a', { 
                  href: '#', 
                  text: fName, 
                  style: 'color:#2563eb; font-weight:600; text-decoration:underline; cursor:pointer;' 
                });
                link.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const win = window.open();
                  if (win) {
                    win.document.write('<iframe src="' + dmsDoc.dataUrl + '" frameborder="0" style="position:fixed; top:0; left:0; bottom:0; right:0; width:100%; height:100%; border:none; margin:0; padding:0; overflow:hidden; z-index:999999;" allowfullscreen></iframe>');
                  }
                });
                leftSide.appendChild(link);
              } else {
                leftSide.appendChild(el('span', { text: fName }));
              }
            } else {
              // Non-admins see the name but cannot click/view
              leftSide.appendChild(el('span', { text: fName }));
            }
            
            leftSide.appendChild(el('span', { class: 'kpi-label', text: formatDate(d.uploadDate) }));
            item.appendChild(leftSide);

            // Delete Button: Documentation Staff and Admin can remove
            if (isDocStaff || isAdmin) {
              const delBtn = el('button', { 
                class: 'btn btn-ghost btn-xs', 
                text: '×', 
                style: 'color:var(--color-danger); font-size:1.2rem; padding:0 4px; line-height:1;' 
              });
              delBtn.title = 'Remove Attachment';
              delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm(`Remove "${fName}" from this task?`)) {
                  const updatedTaskDocs = t.taskDocuments.filter((_, i) => i !== dIdx);
                  DB.update('tasks', t.id, { taskDocuments: updatedTaskDocs });
                  const dmsMatch = DB.getWhere('documents', doc => 
                    doc.fileName === fName && doc.workRequestId === wr.id
                  )[0];
                  if (dmsMatch) DB.delete('documents', dmsMatch.id);
                  App.handleRoute();
                }
              });
              item.appendChild(delBtn);
            }

            docsList.appendChild(item);

            // --- Start of Comment Section ---
            const commentToggle = el('button', { 
              class: 'btn btn-ghost btn-xs', 
              text: '💬 Comments' + (d.comments?.length ? ` (${d.comments.length})` : ''), 
              style: 'margin-left: 10px; font-size: 0.75rem; color: var(--color-text-muted);' 
            });
            const commentContainer = el('div', { class: 'doc-comments-container hidden', style: 'margin: 8px 0 16px 20px; padding: 12px; background: #f8fafc; border-radius: 8px; border-left: 3px solid #cbd5e1;' });
            
            commentToggle.addEventListener('click', (e) => {
              e.stopPropagation();
              commentContainer.classList.toggle('hidden');
            });
            
            const renderComments = () => {
              commentContainer.innerHTML = '';
              const list = el('div', { style: 'display:flex; flex-direction:column; gap:8px;' });
              
              if (!d.comments || d.comments.length === 0) {
                list.appendChild(el('div', { class: 'empty-state', text: 'No comments for this document.', style: 'padding: 4px 0;' }));
              } else {
                d.comments.forEach((c, cIdx) => {
                  const commentRow = el('div', { style: 'background:white; padding:8px 12px; border-radius:6px; border: 1px solid #e2e8f0; position:relative;' });
                  const cUser = DB.getById('users', c.userId);
                  
                  const header = el('div', { style: 'display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.75rem;' });
                  header.appendChild(el('span', { text: cUser?.name || 'Unknown', style: 'font-weight:600; color:var(--color-primary);' }));
                  header.appendChild(el('span', { text: formatDate(c.date), style: 'color:var(--color-text-muted);' }));
                  commentRow.appendChild(header);

                  const contentArea = el('div', { style: 'font-size:0.875rem; color:#334155; line-height:1.4;' });
                  contentArea.textContent = c.text;
                  commentRow.appendChild(contentArea);

                  // Admin Actions: Edit/Delete
                  if (isAdmin) {
                    const cActions = el('div', { style: 'display:flex; gap:8px; margin-top:8px; border-top:1px solid #f1f5f9; padding-top:4px;' });
                    
                    const editBtn = el('button', { class: 'btn btn-link btn-xs', text: 'Edit', style: 'padding:0; font-size:0.7rem;' });
                    editBtn.addEventListener('click', (e) => {
                      e.stopPropagation();
                      const originalText = c.text;
                      contentArea.innerHTML = '';
                      const editInput = el('textarea', { class: 'form-control', style: 'width:100%; min-height:40px; font-size:0.875rem;', text: originalText });
                      contentArea.appendChild(editInput);
                      
                      cActions.classList.add('hidden');
                      const editActions = el('div', { style: 'display:flex; gap:8px; margin-top:4px;' });
                      const saveEditBtn = el('button', { class: 'btn btn-primary btn-xs', text: 'Save' });
                      const cancelEditBtn = el('button', { class: 'btn btn-ghost btn-xs', text: 'Cancel' });
                      
                      saveEditBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        const newText = editInput.value.trim();
                        if (newText) {
                          c.text = newText;
                          c.date = new Date().toISOString();
                          DB.update('tasks', t.id, { taskDocuments: t.taskDocuments });
                          renderComments();
                        }
                      });
                      
                      cancelEditBtn.addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        renderComments();
                      });
                      
                      editActions.appendChild(saveEditBtn);
                      editActions.appendChild(cancelEditBtn);
                      contentArea.appendChild(editActions);
                    });
                    
                    const delBtn = el('button', { class: 'btn btn-link btn-xs', text: 'Delete', style: 'padding:0; font-size:0.7rem; color:var(--color-danger);' });
                    delBtn.addEventListener('click', (e) => {
                      e.stopPropagation();
                      if (confirm('Delete this comment?')) {
                        d.comments.splice(cIdx, 1);
                        DB.update('tasks', t.id, { taskDocuments: t.taskDocuments });
                        renderComments();
                        commentToggle.textContent = '💬 Comments' + (d.comments?.length ? ` (${d.comments.length})` : '');
                      }
                    });
                    
                    cActions.appendChild(editBtn);
                    cActions.appendChild(delBtn);
                    commentRow.appendChild(cActions);
                  }
                  list.appendChild(commentRow);
                });
              }
              commentContainer.appendChild(list);

              if (isAdmin) {
                const addForm = el('div', { style: 'margin-top:12px; padding-top:12px; border-top: 1px solid #cbd5e1;' });
                const addInput = el('textarea', { placeholder: 'Write a comment...', class: 'form-control', style: 'width:100%; min-height:50px; font-size:0.875rem;' });
                const addBtnRow = el('div', { style: 'display:flex; gap:8px; margin-top:8px;' });
                const saveNewBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Save Comment' });
                
                saveNewBtn.addEventListener('click', (e) => {
                  e.stopPropagation();
                  const text = addInput.value.trim();
                  if (text) {
                    if (!d.comments) d.comments = [];
                    d.comments.push({ userId: Auth.user.id, date: new Date().toISOString(), text });
                    DB.update('tasks', t.id, { taskDocuments: t.taskDocuments });
                    addInput.value = '';
                    renderComments();
                    commentToggle.textContent = '💬 Comments' + (d.comments?.length ? ` (${d.comments.length})` : '');
                  }
                });
                
                addBtnRow.appendChild(saveNewBtn);
                addForm.appendChild(addInput);
                addForm.appendChild(addBtnRow);
                commentContainer.appendChild(addForm);
              }
            };
            
            renderComments();
            docsList.appendChild(commentToggle);
            docsList.appendChild(commentContainer);
            // --- End of Comment Section ---
          });
        }
        docsSection.appendChild(docsList);
        detailsGrid.appendChild(docsSection);

        // Time Log Today Section
        const timeSection = el('div', { class: 'task-details-col' });
        const timeHeader = el('div', { class: 'details-section-title' });
        timeHeader.appendChild(el('span', { text: 'Time Log Today' }));
        if ((t.assigneeId || t.assignedTo) === Auth.user.id) {
          const addTimeBtn = el('button', { class: 'btn btn-primary btn-xs btn-add-inline', text: '+ Add Log' });
          addTimeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showAddTimeLogModal(t.id); });
          timeHeader.appendChild(addTimeBtn);
        }
        timeSection.appendChild(timeHeader);

        const timeList = el('div', { class: 'details-content-list' });
        const today = new Date().toISOString().slice(0, 10);
        const todayLogs = (t.timeLogs || []).filter(l => l.date === today);
        if (todayLogs.length === 0) {
          timeList.appendChild(el('div', { class: 'empty-state', text: 'No logs for today.' }));
        } else {
          todayLogs.forEach(l => {
            const logDate = new Date(l.date);
            const dateStr = logDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', weekday: 'short' });
            const item = el('div', { class: 'detail-item-v2' });
            item.appendChild(el('span', { text: `${dateStr} • ${l.startTime} - ${l.endTime}` }));
            item.appendChild(el('span', { class: 'kpi-label', text: `${l.hours}h` }));
            timeList.appendChild(item);
          });
        }
        timeSection.appendChild(timeList);
        detailsGrid.appendChild(timeSection);

        detailsContainer.appendChild(detailsGrid);
        detailsTd.appendChild(detailsContainer);
        detailsTr.appendChild(detailsTd);
        tbody.appendChild(detailsTr);

        tr.addEventListener('click', () => {
          tr.classList.toggle('expanded');
          detailsTr.classList.toggle('hidden');
        });
      });
      table.appendChild(tbody);

      // Aligned Footer Totals
      const tfoot = el('tfoot');
      const footTr = el('tr');
      for(let i=0; i<5; i++) footTr.appendChild(el('td')); // Empty placeholders
      footTr.appendChild(el('td', { text: formatPHP(totalAmount) }));
      footTr.appendChild(el('td', { text: `${totalHours} hrs` }));
      tfoot.appendChild(footTr);
      table.appendChild(tfoot);

      groupEl.appendChild(table);
      listWrapper.appendChild(groupEl);
    }
    
    container.appendChild(listWrapper);

    return container;
  },

  showAddDocumentModal(taskId) {
    const task = DB.getById('tasks', taskId);
    if (!task) return;
    const wr = DB.getById('workRequests', task.workRequestId);

    const form = el('form', { class: 'form-stacked' });
    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Select File *' }),
      el('input', { type: 'file', name: 'docFile', required: true })
    ]));
    const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Upload' });
    form.appendChild(submitBtn);

    const overlay = this.showModal('Upload Document', form, null);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const file = form.querySelector('input[name="docFile"]').files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        const now = new Date().toISOString();
        
        // 1. Update taskDocuments metadata
        const entry = {
          fileName: file.name,
          uploadDate: now.slice(0, 10),
          uploaderId: Auth.user.id
        };
        const updatedDocs = [...(task.taskDocuments || []), entry];
        DB.update('tasks', taskId, { taskDocuments: updatedDocs, updatedAt: now });

        // 2. Also create a record in DMS documents table so it is viewable
        const dmsRecord = {
          id: generateId('doc'),
          fileName: file.name,
          workRequestId: task.workRequestId,
          document_type: 'original_scan',
          category: 'Requirement Docs',
          uploader: Auth.user.id,
          uploadDate: now,
          description: `Uploaded via task: ${task.title}`,
          handover_log: [],
          entity: wr?.entity || Auth.activeEntity,
          dataUrl: dataUrl,
          versions: [],
          comments: [],
          documentLifecycle: 'collected',
          scannedBy: '',
          envelopeId: '',
          storedLocation: ''
        };
        DB.insert('documents', dmsRecord);

        overlay.remove();
        App.handleRoute();
      };
      reader.readAsDataURL(file);
    });
  },

  showAddTimeLogModal(taskId) {
    const form = el('form', { class: 'form-stacked' });
    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Start Time *' }),
      el('input', { type: 'time', name: 'start', required: true })
    ]));
    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'End Time *' }),
      el('input', { type: 'time', name: 'end', required: true })
    ]));
    const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Save Log' });
    form.appendChild(submitBtn);

    const overlay = this.showModal('Add Time Log Today', form, null);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const start = fd.get('start');
      const end = fd.get('end');
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      if (eh < sh || (eh === sh && em <= sm)) {
        alert('End time must be after start time.');
        return;
      }
      const hours = Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 4) / 4;
      const entry = {
        userId: Auth.user.id,
        startTime: start,
        endTime: end,
        date: new Date().toISOString().slice(0, 10),
        hours
      };
      const task = DB.getById('tasks', taskId);
      
      // Guard: prevent double time log for the same day
      const alreadyLogged = (task.timeLogs || []).some(l => l.date === entry.date && l.userId === Auth.user.id);
      if (alreadyLogged) {
        alert('You have already logged time for this task today.');
        return;
      }

      const updatedLogs = [...(task.timeLogs || []), entry];
      DB.update('tasks', taskId, { timeLogs: updatedLogs, updatedAt: new Date().toISOString() });
      overlay.remove();
      App.handleRoute();
    });
  },

  showAddTaskModal(wrId, onAdded) {
    const form = el('form', { class: 'form-stacked' });
    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Task Title *' }),
      el('input', { type: 'text', name: 'title', required: true })
    ]));
    
    const assigneeGroup = el('div', { class: 'form-group' });
    assigneeGroup.appendChild(el('label', { text: 'Assignee' }));
    const assigneeSel = el('select', { name: 'assigneeId' });
    assigneeSel.appendChild(el('option', { value: '', text: '— Select Assignee —' }));
    DB.getAll('users').forEach(u => {
      assigneeSel.appendChild(el('option', { value: u.id, text: u.name }));
    });
    assigneeGroup.appendChild(assigneeSel);
    form.appendChild(assigneeGroup);

    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Due Date' }),
      el('input', { type: 'date', name: 'dueDate' })
    ]));

    const priorityGroup = el('div', { class: 'form-group' });
    priorityGroup.appendChild(el('label', { text: 'Priority' }));
    const prioritySel = el('select', { name: 'priority' });
    ['Normal', 'Low Priority', 'Priority', 'Urgent'].forEach(p => {
      prioritySel.appendChild(el('option', { value: p, text: p }));
    });
    priorityGroup.appendChild(prioritySel);
    form.appendChild(priorityGroup);

    const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Add Task' });
    form.appendChild(submitBtn);

    const overlay = this.showModal('Add New Task', form, null);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validateRequiredFields(form)) return;
      const data = Object.fromEntries(new FormData(form).entries());
      const newTask = {
        id: generateId('t'),
        workRequestId: wrId,
        title: data.title.trim(),
        assigneeId: data.assigneeId || null,
        status: 'Draft',
        priority: data.priority || 'Normal',
        dueDate: data.dueDate || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        predecessors: [],
        timeLogs: [],
        taskDocuments: [],
        comments: []
      };
      DB.insert('tasks', newTask);
      overlay.remove();
      if (onAdded) onAdded();
    });
  },

  renderModernProgressBar(status) {
    const stages = ['Work Request', 'Pre-processing', 'Processing', 'Billing', 'Disbursement', 'Documentation'];
    const map = { 'Draft': 0, 'Pre-processing': 1, 'Processing': 2, 'Billing': 3, 'Disbursement': 4, 'Completed': 5, 'Cancelled': 5 };
    const current = map[status] ?? 0;
    
    const wrapper = el('div', { class: 'modern-progress-wrapper' });
    const track = el('div', { class: 'modern-progress-track' });
    
    // Calculate fill width
    const fillPercent = (current / (stages.length - 1)) * 100;
    const fill = el('div', { class: 'modern-progress-fill', style: `width: ${fillPercent}%` });
    track.appendChild(fill);
    
    stages.forEach((s, i) => {
      const step = el('div', { class: 'modern-progress-step' });
      const dot = el('div', { class: 'modern-progress-dot' });
      if (i <= current) dot.classList.add('completed');
      if (i === current) dot.classList.add('active');
      
      const label = el('div', { class: 'modern-progress-label', text: s });
      if (i === current) label.classList.add('active');
      
      step.appendChild(dot);
      step.appendChild(label);
      
      // Position the step evenly
      step.style.left = `${(i / (stages.length - 1)) * 100}%`;
      track.appendChild(step);
    });
    
    wrapper.appendChild(track);
    return wrapper;
  },

  renderTaskActivity(tasks) {
    const task = tasks.find(t => t.id === this.selectedTaskId) || tasks[0];
    const section = el('div', { class: 'form-section' });
    section.appendChild(el('h3', { text: 'Task Activity' }));

    const selectorGroup = el('div', { class: 'form-group' });
    selectorGroup.appendChild(el('label', { text: 'Select Task' }));
    const selector = el('select', { class: 'form-select' });
    tasks.forEach(t => {
      const opt = el('option', { value: t.id, text: t.title });
      if (t.id === task.id) opt.selected = true;
      selector.appendChild(opt);
    });
    selector.addEventListener('change', () => {
      this.selectedTaskId = selector.value;
      App.handleRoute();
    });
    selectorGroup.appendChild(selector);
    section.appendChild(selectorGroup);

    // Time Log
    section.appendChild(el('h4', { text: 'Time Log' }));
    const logs = task.timeLogs || [];
    if (logs.length === 0) {
      section.appendChild(el('p', { class: 'empty-state', text: 'No time logs recorded yet.' }));
    } else {
      const logTable = el('table', { class: 'data-table' });
      logTable.appendChild(el('thead', {}, [
        el('tr', {}, [
          el('th', { text: 'Date' }),
          el('th', { text: 'Start' }),
          el('th', { text: 'End' }),
          el('th', { text: 'Hours' }),
          el('th', { text: 'User' }),
          el('th', { text: 'Note' })
        ])
      ]));
      const logBody = el('tbody');
      logs.forEach(l => {
        const user = DB.getById('users', l.userId);
        logBody.appendChild(el('tr', {}, [
          el('td', { text: formatDate(l.date) }),
          el('td', { text: l.startTime || '—' }),
          el('td', { text: l.endTime || '—' }),
          el('td', { text: String(l.hours) }),
          el('td', { text: user?.name || l.userId }),
          el('td', { text: l.note || '—' })
        ]));
      });
      logTable.appendChild(logBody);
      section.appendChild(logTable);
    }

    // Task Activity section keeps read-only history only;
    // add forms have been moved to modals inside each task accordion panel.

    // Comments
    section.appendChild(el('h4', { text: 'Comments' }));
    const comments = task.comments || [];
    if (comments.length === 0) {
      section.appendChild(el('p', { class: 'empty-state', text: 'No comments yet.' }));
    } else {
      const commentList = el('div');
      comments.forEach(c => {
        const user = DB.getById('users', c.userId);
        commentList.appendChild(el('div', { class: 'card', style: 'margin-bottom: var(--spacing-sm);' }, [
          el('div', { class: 'kpi-label', text: (user?.name || c.userId) + ' • ' + formatDate(c.date) }),
          el('div', { text: c.comment })
        ]));
      });
      section.appendChild(commentList);
    }

    const commentForm = el('form', { class: 'form-stacked' });
    commentForm.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Add Comment *' }),
      el('textarea', { name: 'commentText', rows: 3, required: true })
    ]));
    const commentBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Post Comment' });
    commentForm.appendChild(commentBtn);
    commentForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(commentForm);
      const entry = {
        userId: Auth.user.id,
        date: new Date().toISOString(),
        comment: fd.get('commentText').trim()
      };
      if (!entry.comment) return;
      const updatedComments = [...(task.comments || []), entry];
      DB.update('tasks', task.id, { comments: updatedComments, updatedAt: new Date().toISOString() });
      App.handleRoute();
    });
    section.appendChild(commentForm);

    return section;
  },

  getValidNextStatuses(task) {
    const flow = ['Draft', 'Assigned', 'In Progress', 'For Review', 'Completed'];
    if (task.status === 'Completed' || task.status === 'Cancelled') {
      return [task.status];
    }
    const idx = Math.max(flow.indexOf(task.status), 0);
    const allowed = new Set(flow.slice(0, idx + 2));
    allowed.add('Cancelled');
    return Array.from(allowed);
  },

  // ============================================================
  // Dependency Engine
  // ============================================================
  canStart(taskId) {
    const task = DB.getById('tasks', taskId);
    const preds = task?.predecessors || task?.dependencies || [];
    if (preds.length === 0) return true;
    return preds.every(pid => {
      const p = DB.getById('tasks', pid);
      return p && p.status === 'Completed';
    });
  },

  updateTaskStatus(taskId, newStatus) {
    const task = DB.getById('tasks', taskId);
    if (!task) return { error: 'Task not found.' };
    if (task.status === 'Completed' || task.status === 'Cancelled') {
      return { error: 'Completed and cancelled tasks are immutable.' };
    }
    if ((newStatus === 'In Progress' || newStatus === 'Completed') && !this.canStart(taskId)) {
      return { error: 'Predecessor tasks must be completed first.' };
    }
    if (newStatus === 'Cancelled') {
      const dependents = DB.getWhere('tasks', t =>
        (t.predecessors || t.dependencies || []).includes(taskId)
      );
      dependents.forEach(d => DB.update('tasks', d.id, { status: 'Cancelled' }));
    }
    DB.update('tasks', taskId, { status: newStatus, updatedAt: new Date().toISOString() });
    return { success: true };
  },

  detectCycle(tasks) {
    const adj = {};
    tasks.forEach(t => { adj[t.id] = t.predecessors || t.dependencies || []; });
    const visited = new Set();
    const recStack = new Set();
    function dfs(node) {
      visited.add(node);
      recStack.add(node);
      for (const neighbor of adj[node] || []) {
        if (!visited.has(neighbor) && dfs(neighbor)) return true;
        if (recStack.has(neighbor)) return true;
      }
      recStack.delete(node);
      return false;
    }
    for (const node of Object.keys(adj)) {
      if (!visited.has(node) && dfs(node)) return true;
    }
    return false;
  },

  // ============================================================
  // Retainer Templates
  // ============================================================
  renderTemplates() {
    const isOnlyManager = Auth.user.role === 'Manager';
    if (!isOnlyManager) {
      this.view = 'list';
      App.handleRoute();
      return el('div');
    }

    const entity = Auth.activeEntity;
    const templates = DB.getWhere('retainerTemplates', t => t.entity === entity);

    const wrapper = el('div');
    const actions = el('div', { class: 'actions-bar' });
    const addBtn = el('button', { class: 'btn btn-primary', text: 'Create Template' });
    addBtn.addEventListener('click', () => { this.view = 'templateForm'; this.templateEditingId = null; App.handleRoute(); });
    actions.appendChild(addBtn);

    const backBtn = el('button', { class: 'btn btn-ghost', text: 'Back to Work Requests' });
    backBtn.addEventListener('click', () => { this.view = 'list'; App.handleRoute(); });
    actions.appendChild(backBtn);
    wrapper.appendChild(actions);

    if (templates.length === 0) {
      wrapper.appendChild(el('p', { class: 'empty-state', text: 'No retainer templates found.' }));
      return wrapper;
    }

    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Template', 'Client', 'Schedule', 'PF Amount', 'Tasks', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = el('tbody');
    templates.forEach(t => {
      const client = DB.getById('clients', t.clientId);
      const tr = el('tr');
      tr.appendChild(el('td', { text: t.name }));
      tr.appendChild(el('td', { text: client?.name || '—' }));
      tr.appendChild(el('td', { text: t.schedule || '—' }));
      tr.appendChild(el('td', { text: formatPHP(t.pfAmount || 0) }));
      tr.appendChild(el('td', { text: String((t.tasks || []).length) }));
      const tdAct = el('td');
      const genBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Generate' });
      genBtn.addEventListener('click', () => this.generateFromTemplate(t.id));
      tdAct.appendChild(genBtn);
      const editBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'Edit' });
      editBtn.addEventListener('click', () => { this.view = 'templateForm'; this.templateEditingId = t.id; App.handleRoute(); });
      tdAct.appendChild(editBtn);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  },

  renderTemplateForm() {
    const isOnlyManager = Auth.user.role === 'Manager';
    if (!isOnlyManager) {
      this.view = 'list';
      App.handleRoute();
      return el('div');
    }

    const entity = Auth.activeEntity;
    const template = this.templateEditingId ? DB.getById('retainerTemplates', this.templateEditingId) : null;
    const container = el('div');

    const headerBar = el('div', { class: 'form-header-bar' });
    headerBar.appendChild(el('h2', { text: template ? 'Edit Retainer Template' : 'Create Retainer Template' }));

    const topActions = el('div', { class: 'form-actions-top' });
    const saveBtn = el('button', { type: 'submit', form: 'template-form', class: 'btn btn-primary', text: 'Save Template' });
    topActions.appendChild(saveBtn);
    
    if (template) {
      const delBtn = el('button', { type: 'button', class: 'btn btn-danger', text: 'Delete', style: 'margin-left: 8px;' });
      delBtn.addEventListener('click', () => {
        if(confirm('Are you sure you want to delete this template?')) {
          DB.delete('retainerTemplates', template.id);
          this.view = 'templates'; 
          this.templateEditingId = null; 
          App.handleRoute();
        }
      });
      topActions.appendChild(delBtn);
    }

    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel', style: 'margin-left: 8px;' });
    cancelBtn.addEventListener('click', () => { this.view = 'templates'; this.templateEditingId = null; App.handleRoute(); });
    topActions.appendChild(cancelBtn);

    headerBar.appendChild(topActions);
    container.appendChild(headerBar);

    const form = el('form', { id: 'template-form', class: 'form-stacked' });

    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Template Name *' }),
      el('input', { type: 'text', name: 'name', required: true, value: template?.name || '' })
    ]));

    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Description' }),
      el('textarea', { name: 'description', rows: 3, text: template?.description || '' })
    ]));

    const clientGroup = el('div', { class: 'form-group' });
    clientGroup.appendChild(el('label', { text: 'Client *' }));
    const clientSel = el('select', { name: 'clientId', required: true });
    clientSel.appendChild(el('option', { value: '', text: '— Select Client —' }));
    DB.getWhere('clients', c => c.entity === entity).forEach(c => {
      const opt = el('option', { value: c.id, text: c.name });
      if (template && template.clientId === c.id) opt.selected = true;
      clientSel.appendChild(opt);
    });
    clientGroup.appendChild(clientSel);
    form.appendChild(clientGroup);

    const scheduleGroup = el('div', { class: 'form-group' });
    scheduleGroup.appendChild(el('label', { text: 'Schedule *' }));
    const scheduleSel = el('select', { name: 'schedule', required: true });
    ['monthly', 'quarterly'].forEach(s => {
      const opt = el('option', { value: s, text: s });
      if (template && template.schedule === s) opt.selected = true;
      scheduleSel.appendChild(opt);
    });
    scheduleGroup.appendChild(scheduleSel);
    form.appendChild(scheduleGroup);

    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Professional Fee (₱) *' }),
      el('input', { type: 'number', name: 'pfAmount', min: 0, step: 0.01, required: true, value: template?.pfAmount || '' })
    ]));

    const tasksSection = el('div', { class: 'form-section' });
    tasksSection.appendChild(el('h3', { text: 'Template Tasks' }));
    const tasksList = el('div', { id: 'template-task-rows' });
    tasksSection.appendChild(tasksList);

    const addTaskBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: '+ Add Task' });
    addTaskBtn.addEventListener('click', () => this.addTaskRow(tasksList));
    tasksSection.appendChild(addTaskBtn);

    form.appendChild(tasksSection);

    if (template && template.tasks) {
      template.tasks.forEach(t => this.addTaskRow(tasksList, t));
    } else {
      this.addTaskRow(tasksList);
    }
    this.updatePredecessorOptions(tasksList);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitTemplateForm(form, tasksList);
    });

    container.appendChild(form);
    return container;
  },

  submitTemplateForm(form, tasksList) {
    const data = Object.fromEntries(new FormData(form).entries());
    const now = new Date().toISOString();

    const taskRows = tasksList.querySelectorAll('.task-row');
    const tasks = [];
    taskRows.forEach(row => {
      const title = row.querySelector('.task-title-input').value.trim();
      if (!title) return;
      tasks.push({
        key: row.dataset.taskKey || generateId('tmp'),
        title,
        assigneeId: row.querySelector('.task-assignee')?.value || null,
        predecessorKey: row.querySelector('.task-pred')?.value || ''
      });
    });

    const cycleCheck = tasks.map(t => ({
      id: t.key,
      predecessors: t.predecessorKey ? [t.predecessorKey] : []
    }));
    if (this.detectCycle(cycleCheck)) {
      alert('Template tasks contain a cycle. Please fix before saving.');
      return;
    }

    const idMap = new Map();
    tasks.forEach(t => idMap.set(t.key, generateId('rtt')));

    const taskRecords = tasks.map(t => {
      const predId = t.predecessorKey ? idMap.get(t.predecessorKey) : null;
      return {
        id: idMap.get(t.key),
        title: t.title,
        assigneeId: t.assigneeId || null,
        predecessors: predId ? [predId] : []
      };
    });

    const record = {
      id: this.templateEditingId || generateId('rt'),
      name: data.name.trim(),
      description: data.description?.trim() || '',
      clientId: data.clientId,
      entity: Auth.activeEntity,
      schedule: data.schedule,
      pfAmount: parseFloat(data.pfAmount) || 0,
      tasks: taskRecords,
      updatedAt: now
    };

    if (this.templateEditingId) {
      record.createdAt = DB.getById('retainerTemplates', this.templateEditingId)?.createdAt || now;
      DB.update('retainerTemplates', this.templateEditingId, record);
    } else {
      record.createdAt = now;
      DB.insert('retainerTemplates', record);
    }

    this.view = 'templates';
    this.templateEditingId = null;
    App.handleRoute();
  },

  generateFromTemplate(templateId) {
    const template = DB.getById('retainerTemplates', templateId);
    if (!template) return;
    const now = new Date();
    const nowIso = now.toISOString();
    const titleSuffix = now.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
    const dueDate = new Date(now.getTime() + (template.schedule === 'quarterly' ? 90 : 30) * 86400000);

    const workRequest = {
      id: generateId('wr'),
      title: `${template.name} (${titleSuffix})`,
      description: template.description || '',
      clientId: template.clientId,
      priority: 'Normal',
      dueDate: dueDate.toISOString().slice(0, 10),
      entity: template.entity,
      status: 'Draft',
      createdAt: nowIso,
      updatedAt: nowIso
    };
    DB.insert('workRequests', workRequest);

    const idMap = new Map();
    (template.tasks || []).forEach(t => idMap.set(t.id, generateId('t')));

    (template.tasks || []).forEach((t, idx) => {
      const mappedPreds = (t.predecessors || []).map(pid => idMap.get(pid)).filter(Boolean);
      DB.insert('tasks', {
        id: idMap.get(t.id),
        workRequestId: workRequest.id,
        title: t.title,
        assigneeId: t.assigneeId || null,
        predecessors: mappedPreds,
        status: 'Draft',
        dueDate: workRequest.dueDate,
        createdAt: nowIso,
        updatedAt: nowIso,
        sortOrder: idx
      });
    });

    this.view = 'detail';
    this.detailWrId = workRequest.id;
    App.handleRoute();
  }
};
