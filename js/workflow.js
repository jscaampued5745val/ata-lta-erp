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

  render() {
    const container = el('div', { class: 'page' });
    container.appendChild(el('h1', { text: 'Workflow' }));

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
    const workRequests = DB.getWhere('workRequests', r => r.entity === entity);

    const actions = el('div', { class: 'actions-bar' });
    const addBtn = el('button', { class: 'btn btn-primary', text: 'Add Work Request' });
    addBtn.addEventListener('click', () => { this.view = 'form'; this.editingId = null; App.handleRoute(); });
    actions.appendChild(addBtn);

    const templateBtn = el('button', { class: 'btn btn-ghost', text: 'Retainer Templates' });
    templateBtn.addEventListener('click', () => { this.view = 'templates'; this.templateEditingId = null; App.handleRoute(); });
    actions.appendChild(templateBtn);

    const statusFilter = el('select', { class: 'form-select', style: 'max-width:200px' });
    statusFilter.appendChild(el('option', { value: '', text: 'All Statuses' }));
    ['Draft', 'Pre-processing', 'Processing', 'Billing', 'Disbursement', 'Completed', 'Cancelled'].forEach(s => {
      statusFilter.appendChild(el('option', { value: s, text: s }));
    });
    statusFilter.addEventListener('change', () => this.refreshList(grid, statusFilter.value));
    actions.appendChild(statusFilter);

    const grid = el('div', { class: 'card-grid' });
    this.refreshList(grid, '');

    const wrapper = el('div');
    wrapper.appendChild(actions);
    wrapper.appendChild(grid);
    return wrapper;
  },

  refreshList(grid, statusFilter) {
    while (grid.firstChild) grid.removeChild(grid.firstChild);
    const entity = Auth.activeEntity;
    const isManagerial = Auth.user.role === 'Admin' || Auth.user.role === 'Manager';

    let wrs = DB.getWhere('workRequests', r => r.entity === entity);

    if (!isManagerial) {
      // Find tasks assigned to this user
      const myTasks = DB.getWhere('tasks', t => t.assigneeId === Auth.user.id || t.assignedTo === Auth.user.id);
      const myWrIds = new Set(myTasks.map(t => t.workRequestId));
      
      // Filter WRs to those where the user is assigned a task, OR assigned the entire WR
      wrs = wrs.filter(r => myWrIds.has(r.id) || r.assignedTo === Auth.user.id);
    }

    if (statusFilter) wrs = wrs.filter(r => r.status === statusFilter);

    if (wrs.length === 0) {
      grid.appendChild(el('p', { text: 'No work requests found.', class: 'empty-state' }));
      return;
    }

    wrs.forEach(wr => {
      const client = DB.getById('clients', wr.clientId);
      const tasks = DB.getWhere('tasks', t => t.workRequestId === wr.id);
      const completed = tasks.filter(t => t.status === 'Completed').length;
      const total = tasks.length || 1;
      const pct = Math.round((completed / total) * 100);

      const card = el('div', { class: 'card wr-card' });
      const header = el('div', { class: 'card-header' });
      const title = el('h3', { class: 'card-title', text: wr.title });
      const statusBadge = this.statusBadge(wr.status);
      header.appendChild(title);
      header.appendChild(statusBadge);
      card.appendChild(header);

      const meta = el('div', { class: 'wr-meta' });
      meta.appendChild(el('span', { text: 'Client: ' + (client?.name || '—') }));
      meta.appendChild(el('span', { text: 'Priority: ' + (wr.priority || 'Normal') }));
      meta.appendChild(el('span', { text: 'Due: ' + (wr.dueDate ? formatDate(wr.dueDate) : '—') }));
      card.appendChild(meta);

      const progressWrap = el('div', { class: 'progress-wrap' });
      const progress = el('div', { class: 'progress' });
      const bar = el('div', { class: 'progress-bar' });
      bar.style.width = pct + '%';
      progress.appendChild(bar);
      progressWrap.appendChild(el('span', { text: completed + '/' + total + ' tasks', class: 'progress-label' }));
      progressWrap.appendChild(progress);
      card.appendChild(progressWrap);

      card.appendChild(this.renderProgressBar(wr.status));

      const cardActions = el('div', { class: 'card-actions' });
      const viewBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { this.view = 'detail'; this.detailWrId = wr.id; App.handleRoute(); });
      cardActions.appendChild(viewBtn);
      card.appendChild(cardActions);

      grid.appendChild(card);
    });
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
    const entity = Auth.activeEntity;
    const wr = this.editingId ? DB.getById('workRequests', this.editingId) : null;
    const container = el('div');
    container.appendChild(el('h2', { text: wr ? 'Edit Work Request' : 'Add Work Request' }));

    const form = el('form', { class: 'form-stacked' });

    const fields = [
      { label: 'Title', name: 'title', type: 'text', required: true },
      { label: 'Description', name: 'description', type: 'text' },
      { label: 'Priority', name: 'priority', type: 'text' },
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

    const btnGroup = el('div', { class: 'form-group form-actions' });
    const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Save Work Request' });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => { this.view = 'list'; this.editingId = null; App.handleRoute(); });
    btnGroup.appendChild(saveBtn);
    btnGroup.appendChild(cancelBtn);
    form.appendChild(btnGroup);

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
    DB.getAll('users').forEach(u => {
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
    const data = Object.fromEntries(new FormData(form).entries());
    const entity = Auth.activeEntity;

    const now = new Date().toISOString();
    const record = {
      title: data.title.trim(),
      description: data.description?.trim() || '',
      clientId: data.clientId,
      priority: data.priority?.trim() || 'Normal',
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

    if (this.editingId) {
      DB.update('workRequests', this.editingId, record);
      const existing = DB.getWhere('tasks', t => t.workRequestId === this.editingId);
      existing.forEach(t => DB.delete('tasks', t.id));
      taskRecords.forEach(t => {
        t.workRequestId = this.editingId;
        DB.insert('tasks', t);
      });
    } else {
      record.id = recordId;
      record.createdAt = now;
      DB.insert('workRequests', record);
      taskRecords.forEach(t => {
        t.workRequestId = record.id;
        DB.insert('tasks', t);
      });
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

  // ============================================================
  // Detail View
  // ============================================================
  renderDetail() {
    const wr = DB.getById('workRequests', this.detailWrId);
    if (!wr) {
      this.view = 'list';
      App.handleRoute();
      return el('div');
    }
    const client = DB.getById('clients', wr.clientId);
    const tasks = DB.getWhere('tasks', t => t.workRequestId === wr.id);

    const container = el('div', { class: 'invoice-detail wide' });
    
    // Top actions bar
    const topActions = el('div', { class: 'actions-bar', style: 'margin-bottom: var(--spacing-lg);' });
    const topBackBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to List' });
    topBackBtn.addEventListener('click', () => { this.view = 'list'; this.detailWrId = null; App.handleRoute(); });
    topActions.appendChild(topBackBtn);
    container.appendChild(topActions);

    container.appendChild(el('h2', { text: wr.title }));

    const meta = el('div', { class: 'wr-meta' });
    meta.appendChild(el('span', { text: 'Client: ' + (client?.name || '—') }));
    meta.appendChild(el('span', { text: 'Status: ' + wr.status }));
    meta.appendChild(el('span', { text: 'Priority: ' + (wr.priority || 'Normal') }));
    container.appendChild(meta);

    container.appendChild(this.renderProgressBar(wr.status));

    const tasksHeader = el('div', { class: 'section-header' });
    tasksHeader.appendChild(el('h3', { text: 'Tasks' }));
    container.appendChild(tasksHeader);

    const taskTable = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Task', 'Assignee', 'Dependencies', 'Status', 'Due', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    taskTable.appendChild(thead);

    const tbody = el('tbody');
    
    const taskMap = {};
    const dependentsMap = {};
    tasks.forEach(t => taskMap[t.id] = t);
    tasks.forEach(t => {
      const preds = t.predecessors || t.dependencies || [];
      preds.forEach(pid => {
        if (!dependentsMap[pid]) dependentsMap[pid] = [];
        dependentsMap[pid].push(t);
      });
    });

    tasks.forEach(t => {
      const assignee = DB.getById('users', t.assigneeId || t.assignedTo);
      const tr = el('tr');
      tr.appendChild(el('td', { text: t.title }));
      tr.appendChild(el('td', { text: assignee?.name || '—' }));

      const depTd = el('td');
      const preds = t.predecessors || t.dependencies || [];
      const predWrap = el('div', { class: 'dependency-list' });
      predWrap.appendChild(el('div', { class: 'dependency-label', text: 'Predecessors' }));
      if (preds.length === 0) {
        predWrap.appendChild(el('div', { class: 'dependency-item predecessor-completed', text: 'None' }));
      } else {
        preds.forEach(pid => {
          const predTask = taskMap[pid];
          const status = predTask?.status || 'Pending';
          const cls = status === 'Completed'
            ? 'predecessor-completed'
            : status === 'Cancelled'
              ? 'predecessor-cancelled'
              : 'predecessor-pending';
          predWrap.appendChild(el('div', { class: 'dependency-item ' + cls, text: predTask?.title || pid }));
        });
      }
      depTd.appendChild(predWrap);

      const dependents = dependentsMap[t.id] || [];
      const depWrap = el('div', { class: 'dependency-list' });
      depWrap.appendChild(el('div', { class: 'dependency-label', text: 'Dependents' }));
      if (dependents.length === 0) {
        depWrap.appendChild(el('div', { class: 'dependency-item predecessor-completed', text: 'None' }));
      } else {
        dependents.forEach(dep => {
          depWrap.appendChild(el('div', { class: 'dependency-item', text: dep.title }));
        });
      }
      depTd.appendChild(depWrap);
      tr.appendChild(depTd);

      tr.appendChild(el('td', { text: t.status }));
      tr.appendChild(el('td', { text: t.dueDate ? formatDate(t.dueDate) : '—' }));
      const tdAct = el('td');

      const isManagerial = Auth.user.role === 'Admin' || Auth.user.role === 'Manager';
      const isMyTask = (t.assigneeId === Auth.user.id || t.assignedTo === Auth.user.id);
      const canUpdate = !isManagerial && isMyTask; // Admins/Managers can't update, Staff can only update their own.

      const statusSel = el('select', { class: 'task-status-sel' });
      const validStatuses = this.getValidNextStatuses(t);
      ['Draft', 'Assigned', 'In Progress', 'For Review', 'Completed', 'Cancelled'].forEach(s => {
        const opt = el('option', { value: s, text: s });
        if (s === t.status) opt.selected = true;
        if (!validStatuses.includes(s) || !canUpdate) opt.disabled = true;
        statusSel.appendChild(opt);
      });
      statusSel.disabled = !canUpdate;
      
      statusSel.addEventListener('change', () => {
        const res = this.updateTaskStatus(t.id, statusSel.value);
        if (res.error) {
          alert(res.error);
          statusSel.value = t.status;
        } else {
          App.handleRoute();
        }
      });
      tdAct.appendChild(statusSel);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    taskTable.appendChild(tbody);
    container.appendChild(taskTable);

    if (tasks.length > 0) {
      if (!this.selectedTaskId || !tasks.find(t => t.id === this.selectedTaskId)) {
        this.selectedTaskId = tasks[0].id;
      }
      container.appendChild(this.renderTaskActivity(tasks));
    }

    return container;
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
          el('td', { text: String(l.hours) }),
          el('td', { text: user?.name || l.userId }),
          el('td', { text: l.note || '—' })
        ]));
      });
      logTable.appendChild(logBody);
      section.appendChild(logTable);
    }

    const logForm = el('form', { class: 'form-stacked' });
    logForm.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Hours *' }),
      el('input', { type: 'number', name: 'logHours', min: 0.25, step: 0.25, required: true })
    ]));
    logForm.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Date *' }),
      el('input', { type: 'date', name: 'logDate', value: new Date().toISOString().slice(0, 10), required: true })
    ]));
    logForm.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Note' }),
      el('input', { type: 'text', name: 'logNote' })
    ]));
    const logBtn = el('button', { type: 'submit', class: 'btn btn-success', text: 'Add Time Log' });
    logForm.appendChild(logBtn);
    logForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(logForm);
      const entry = {
        userId: Auth.user.id,
        hours: parseFloat(fd.get('logHours')) || 0,
        date: fd.get('logDate'),
        note: fd.get('logNote') || ''
      };
      const updatedLogs = [...(task.timeLogs || []), entry];
      DB.update('tasks', task.id, { timeLogs: updatedLogs, updatedAt: new Date().toISOString() });
      App.handleRoute();
    });
    section.appendChild(logForm);

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
    const entity = Auth.activeEntity;
    const template = this.templateEditingId ? DB.getById('retainerTemplates', this.templateEditingId) : null;
    const container = el('div');
    container.appendChild(el('h2', { text: template ? 'Edit Retainer Template' : 'Create Retainer Template' }));

    const form = el('form', { class: 'form-stacked' });

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

    const btnGroup = el('div', { class: 'form-group form-actions' });
    const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Save Template' });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => { this.view = 'templates'; this.templateEditingId = null; App.handleRoute(); });
    btnGroup.appendChild(saveBtn);
    btnGroup.appendChild(cancelBtn);
    form.appendChild(btnGroup);

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
