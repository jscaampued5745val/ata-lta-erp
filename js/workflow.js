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

  // ============================================================
  // Phase Transition Logic (Robust Business Accounting Logic)
  // ============================================================
  getPhaseTransitionStatus(wrId) {
    const wr = DB.getById('workRequests', wrId);
    if (!wr) return null;
    
    const tasks = DB.getWhere('tasks', t => t.workRequestId === wrId);
    const invoices = DB.getWhere('invoices', inv => inv.workRequestId === wrId || wr.linkedInvoiceId === inv.id);
    const disbursements = DB.getWhere('disbursements', d => d.linkedWorkRequestId === wrId || (wr.linkedDisbursementIds || []).includes(d.id));
    const transmittals = DB.getWhere('transmittals', t => t.workRequestId === wrId || (wr.linkedTransmittalIds || []).includes(t.id));

    const stages = ['Draft', 'Pre-processing', 'Processing', 'Billing', 'Disbursement', 'Completed', 'Cancelled'];
    const currentIdx = stages.indexOf(wr.status);
    const nextPhase = stages[currentIdx + 1];

    if (wr.status === 'Cancelled' || wr.status === 'Completed') return { canTransition: false, reason: 'Request is already in a terminal state.' };

    let canTransition = true;
    let missing = [];

    switch (wr.status) {
      case 'Draft':
        if (!wr.clientId) { canTransition = false; missing.push('Client assignment'); }
        if (!wr.assignedTo) { canTransition = false; missing.push('Employee assignment'); }
        // Rule 1: Requires signed proposal/retainer placeholder
        if (!tasks.some(t => t.taskDocuments?.length > 0)) { 
            // In real world, we'd check for a specific 'Proposal' doc type
        }
        break;

      case 'Pre-processing':
        // Rule 2: All requirements gathered
        const reqTasks = tasks.filter(t => t.title.toLowerCase().includes('requirement') || t.title.toLowerCase().includes('gather'));
        if (reqTasks.length > 0 && !reqTasks.every(t => t.status === 'Completed')) {
          canTransition = false;
          missing.push('Completion of requirement gathering tasks');
        }
        break;

      case 'Processing':
        // Rule 3: All tasks must be completed
        if (tasks.length === 0) { canTransition = false; missing.push('No tasks defined'); }
        else {
            if (!tasks.every(t => t.status === 'Completed')) {
                canTransition = false;
                missing.push('All processing tasks must be marked as Completed');
            }
            
            // Task-level Linkage Gate:
            tasks.forEach(t => {
                const title = t.title.toLowerCase();
                const hasInv = DB.getWhere('invoices', inv => inv.linkedTaskId === t.id).length > 0;
                const hasDisb = DB.getWhere('disbursements', d => d.linkedTaskId === t.id).length > 0;
                
                if ((title.includes('invoice') || title.includes('bill')) && !hasInv) {
                    canTransition = false;
                    missing.push(`Task "${t.title}" requires a linked Service Invoice`);
                }
                if ((title.includes('expense') || title.includes('disburse')) && !hasDisb) {
                    canTransition = false;
                    missing.push(`Task "${t.title}" requires a linked Expense/Disbursement`);
                }
            });
        }
        break;

      case 'Billing':
        // Rule 4: At least one invoice must be linked, and at least one whole-project invoice must be Sent, Partially Paid, or Paid.
        // If there are other invoices, they do not block routing (simple linkage is allowed).
        if (invoices.length === 0) {
          canTransition = false;
          missing.push('No linked invoices found — create and link an invoice in the Billing module');
        } else {
          // Check if there is at least one "sent" billing for the whole project (no linkedTaskId)
          const wholeProjectSent = invoices.some(inv => !inv.linkedTaskId && ['Sent', 'Partially Paid', 'Paid'].includes(inv.status));
          if (!wholeProjectSent) {
            // Fallback: check if we have any invoice at all that is Sent, Partially Paid, or Paid
            const anySent = invoices.some(inv => ['Sent', 'Partially Paid', 'Paid'].includes(inv.status));
            if (!anySent) {
              canTransition = false;
              missing.push('At least one linked invoice must be Sent, Partially Paid, or Paid');
            }
          }
        }
        // Rule 4b: Disbursement-related tasks must have linked disbursement records
        // Accept either task-level link or WR-level link (linkedWorkRequestId / linkedDisbursementIds)
        const wrLevelDisbursements = DB.getWhere('disbursements', d => d.linkedWorkRequestId === wrId || (wr.linkedDisbursementIds || []).includes(d.id));
        tasks.forEach(t => {
          const title = t.title.toLowerCase();
          if (title.includes('expense') || title.includes('disburse') || title.includes('payment') || title.includes('reimburse')) {
            const hasTaskDisb = DB.getWhere('disbursements', d => d.linkedTaskId === t.id).length > 0;
            const hasWrDisb = wrLevelDisbursements.length > 0;
            if (!hasTaskDisb && !hasWrDisb) {
              canTransition = false;
              missing.push(`Task "${t.title}" requires a linked Disbursement record before routing`);
            }
          }
        });
        break;

      case 'Disbursement':
        // Rule 5: Actual completion requires 100% compliance/payment of all finances attached
        if (invoices.length > 0 && !invoices.every(inv => inv.status === 'Paid')) {
          canTransition = false;
          const unpaid = invoices.filter(inv => inv.status !== 'Paid');
          unpaid.forEach(inv => {
            missing.push(`Invoice ${inv.invoiceNumber || inv.id} is "${inv.status}" — must be Paid for completion`);
          });
        }
        if (disbursements.length > 0 && !disbursements.every(d => d.status === 'Released')) {
          canTransition = false;
          const unreleased = disbursements.filter(d => d.status !== 'Released');
          unreleased.forEach(d => {
            missing.push(`Disbursement for ${d.category} is "${d.status}" — must be Released for completion`);
          });
        }
        break;
    }

    return { canTransition, missing, nextPhase };
  },

  /**
   * Returns actionable hint text and optional route for a routing blocker message.
   */
  getRoutingHint(blockerMessage) {
    const msg = blockerMessage.toLowerCase();
    if (msg.includes('invoice')) return { text: 'Go to Billing module to create and link an invoice.', route: '#billing' };
    if (msg.includes('disbursement') || msg.includes('expense') || msg.includes('reimburse')) return { text: 'Go to Disbursement module to file and link an expense.', route: '#disbursement' };
    if (msg.includes('task') && msg.includes('completed')) return { text: 'Mark all tasks as Completed in the task list below.', route: null };
    if (msg.includes('requirement')) return { text: 'Complete the requirement gathering tasks below.', route: null };
    if (msg.includes('client assignment')) return { text: 'Edit the work request and assign a client.', route: null };
    if (msg.includes('employee assignment')) return { text: 'Edit the work request and assign an employee.', route: null };
    if (msg.includes('released')) return { text: 'Wait for admin to approve and release all linked disbursements.', route: '#disbursement' };
    return null;
  },

  transitionWorkRequest(wrId) {
    const status = this.getPhaseTransitionStatus(wrId);
    if (!status || !status.canTransition) {
      this.showMessage('Routing Error', 'Cannot transition phase:\n- ' + (status?.missing.join('\n- ') || 'Requirements not met'), 'danger');
      return;
    }

    this.showConfirm('Confirm Routing', `Are you sure you want to transition this Work Request to ${status.nextPhase}?`, () => {
      DB.update('workRequests', wrId, {
        status: status.nextPhase,
        updatedAt: new Date().toISOString()
      });
      App.handleRoute();
    }, 'success');
  },

  cancelWorkRequest(wrId) {
    const wr = DB.getById('workRequests', wrId);
    if (!wr) return;
    if (wr.status === 'Completed' || wr.status === 'Cancelled') {
      this.showMessage('Error', 'Work Request is already in a terminal state.', 'danger');
      return;
    }

    this.showConfirm('Cancel Work Request',
      `Are you sure you want to cancel "${wr.title}"? All non-completed tasks will also be cancelled.`,
      () => {
        const now = new Date().toISOString();
        const tasks = DB.getWhere('tasks', t => t.workRequestId === wrId);
        let cancelledCount = 0;

        tasks.forEach(t => {
          if (t.status !== 'Completed' && t.status !== 'Cancelled') {
            DB.update('tasks', t.id, { status: 'Cancelled', updatedAt: now });
            cancelledCount++;
          }
        });

        DB.update('workRequests', wrId, {
          status: 'Cancelled',
          updatedAt: now
        });

        this.showMessage('Work Request Cancelled',
          `Work Request moved to Cancelled. ${cancelledCount} task(s) were also cancelled.`,
          'warning'
        );
        App.handleRoute();
      },
      'danger'
    );
  },

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

  showMessage(title, message, type = 'info') {
    const wrapper = el('div', { class: `modal-message-wrapper type-${type}` });
    
    const iconMap = { 'info': 'ℹ️', 'success': '✅', 'warning': '⚠️', 'danger': '!' };
    const icon = el('div', { class: 'modal-icon-v2', text: iconMap[type] || 'i' });
    wrapper.appendChild(icon);

    wrapper.appendChild(el('p', { text: message, class: 'modal-text' }));
    
    const footer = el('div', { class: 'modal-footer' });
    const okBtn = el('button', { class: 'btn btn-primary modal-btn-sure', text: 'OK' });
    footer.appendChild(okBtn);
    wrapper.appendChild(footer);

    const overlay = this.showModal(title, wrapper);
    okBtn.addEventListener('click', () => overlay.remove());
  },

  showConfirm(title, message, onConfirm, type = 'warning', onCancel = null) {
    const wrapper = el('div', { class: `modal-message-wrapper type-${type}` });

    const iconMap = { 'info': 'ℹ️', 'success': '✅', 'warning': '⚠️', 'danger': '!' };
    const icon = el('div', { class: 'modal-icon-v2', text: iconMap[type] || '?' });
    wrapper.appendChild(icon);

    wrapper.appendChild(el('p', { text: message, class: 'modal-text' }));

    const footer = el('div', { class: 'modal-footer' });
    const cancelBtn = el('button', { class: 'modal-btn-cancel', text: 'No, cancel' });
    const confirmBtn = el('button', {
        class: `btn modal-btn-sure ${type === 'danger' ? 'btn-danger' : 'btn-primary'}`,
        text: "Yes, I'm sure"
    });

    footer.appendChild(confirmBtn);
    footer.appendChild(cancelBtn);
    wrapper.appendChild(footer);

    const overlay = this.showModal(title, wrapper);
    cancelBtn.addEventListener('click', () => {
      overlay.remove();
      if (onCancel) onCancel();
    });
    confirmBtn.addEventListener('click', () => {
      overlay.remove();
      if (onConfirm) onConfirm();
    });
  },

  render() {
    const container = el('div', { class: 'page' });
    
    if (this.view === 'detail' && this.detailWrId) {
      const wr = DB.getById('workRequests', this.detailWrId);
      const isManagerial = Auth.user.role === 'Admin' || Auth.user.role === 'Manager';
      const isArchived = wr && wr.status === 'Cancelled';
      const titleBar = el('div', { class: 'page-title-bar-v2' });
      const h1 = el('h1', { class: 'breadcrumb-h1' });
      const opLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Operations' });
      opLink.addEventListener('click', () => { this.view = 'list'; this.detailWrId = null; App.handleRoute(); });
      h1.appendChild(opLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      h1.appendChild(document.createTextNode(wr?.title || 'Detail'));
      titleBar.appendChild(h1);
      
      const actions = el('div', { class: 'title-bar-actions' });
      if (isManagerial && wr && !isArchived) {
        if (wr.status === 'Draft') {
          const editWrBtn = el('button', { class: 'btn btn-outline btn-sm', text: 'Edit Work Request', style: 'margin-right: var(--spacing-sm);' });
          editWrBtn.addEventListener('click', () => { this.view = 'form'; this.editingId = wr.id; App.handleRoute(); });
          actions.appendChild(editWrBtn);
        }
        const addBtn = el('button', { class: 'btn btn-primary btn-sm', text: '+ Add Task', style: 'margin-right: var(--spacing-sm);' });
        addBtn.addEventListener('click', () => { this.showAddTaskModal(wr.id, () => App.handleRoute()); });
        actions.appendChild(addBtn);
      }
      const backBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to List' });
      backBtn.addEventListener('click', () => { this.view = 'list'; this.detailWrId = null; App.handleRoute(); });
      actions.appendChild(backBtn);
      titleBar.appendChild(actions);
      container.appendChild(titleBar);
    } else if (this.view === 'templates' || this.view === 'templateForm') {
        // Do nothing here, these views render their own breadcrumb title bar
    } else if (this.view !== 'archive') {
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
    } else if (this.view === 'archive') {
      container.appendChild(this.renderArchive());
    }

    return container;
  },

  init() {
    document.addEventListener('click', () => {
      document.querySelectorAll('.multi-select-menu.show').forEach(m => m.classList.remove('show'));
    });
  },

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
    const archiveBtn = el('button', { class: 'btn btn-ghost', text: 'Archive' });
    archiveBtn.addEventListener('click', () => { this.view = 'archive'; App.handleRoute(); });
    topActions.appendChild(archiveBtn);
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
    DB.getWhere('users', u => {
      const userEnts = (u.entities || []).map(e => e.toUpperCase());
      if (entity === 'ALL') {
        return userEnts.some(e => Auth.user.entities.map(ae => ae.toUpperCase()).includes(e));
      }
      return userEnts.includes(entity.toUpperCase());
    }).forEach(u => {
      empFilter.appendChild(el('option', { value: u.id, text: u.name }));
    });
    filters.appendChild(empFilter);

    const clientFilter = el('select', { class: 'form-select' });
    clientFilter.appendChild(el('option', { value: '', text: 'All Clients' }));
    DB.getWhere('clients', c => {
      const clientEnt = (c.entity || '').toUpperCase();
      if (entity === 'ALL') {
        return Auth.user.entities.map(ae => ae.toUpperCase()).includes(clientEnt);
      }
      return clientEnt === entity.toUpperCase();
    }).forEach(c => {
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
    ['Draft', 'Pre-processing', 'Processing', 'Billing', 'Disbursement', 'Completed'].forEach(s => {
      statusFilter.appendChild(el('option', { value: s, text: s }));
    });
    filters.appendChild(statusFilter);

    const clearBtn = el('button', {
      class: 'btn btn-ghost btn-sm',
      html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>Clear'
    });
    clearBtn.addEventListener('click', () => {
      priorityFilter.value = '';
      empFilter.value = '';
      clientFilter.value = '';
      dateFrom.value = '';
      dateTo.value = '';
      statusFilter.value = '';
      refresh();
    });
    filters.appendChild(clearBtn);

    wrapper.appendChild(filters);

    // View mode toggle
    const viewMode = App.getPreferredViewMode('operations');
    const vmToggle = el('div', { class: 'view-mode-toggle', style: 'margin-bottom:var(--spacing-md);' });
    const vmTable = el('button', { html: ViewIcons.table + ' Table', class: viewMode === 'table' ? 'active' : '' });
    const vmBoard = el('button', { html: ViewIcons.board + ' Board', class: viewMode === 'board' ? 'active' : '' });
    const vmList = el('button', { html: ViewIcons.list + ' List', class: viewMode === 'list' ? 'active' : '' });
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
      let wrs = DB.getWhere('workRequests', r => {
        const matchesEntity = (entity === 'ALL' ? Auth.user.entities.includes(r.entity) : r.entity === entity);
        return matchesEntity && r.status !== 'Cancelled';
      });
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
    const isManagerial = Auth.user.role === 'Admin' || Auth.user.role === 'Manager';
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
      const tdTitle = el('td');
      tdTitle.appendChild(el('div', { text: wr.title, style: 'font-weight: 600; color: #1e293b;' }));
      const badgeRow = el('div', { style: 'display: flex; gap: 6px; margin-top: 4px;' });
      badgeRow.appendChild(this.getFinanceBadgeForWr(wr));
      badgeRow.appendChild(this.getDocBadgeForWr(wr));
      tdTitle.appendChild(badgeRow);
      tr.appendChild(tdTitle);
      tr.appendChild(el('td', { text: client?.name || '—' }));
      tr.appendChild(el('td', { text: wr.priority || '—' }));
      tr.appendChild(el('td')).appendChild(this.statusBadge(wr.status));
      tr.appendChild(el('td', { text: wr.dueDate ? formatDate(wr.dueDate) : '—' }));
      tr.appendChild(el('td', { text: assignedUser?.name || '—' }));
      const tdAct = el('td');
      const viewBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { this.view = 'detail'; this.detailWrId = wr.id; App.handleRoute(); });
      tdAct.appendChild(viewBtn);
      if (isManagerial && wr.status === 'Draft') {
        const editBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'Edit' });
        editBtn.addEventListener('click', (e) => { e.stopPropagation(); this.view = 'form'; this.editingId = wr.id; App.handleRoute(); });
        tdAct.appendChild(editBtn);
      }
      if (isManagerial && wr.status !== 'Completed' && wr.status !== 'Cancelled') {
        const ts = this.getPhaseTransitionStatus(wr.id);
        if (ts && ts.canTransition && ts.nextPhase) {
          const routeBtn = el('button', { 
            html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg> Route',
            style: 'color:#10b981;font-weight:600;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);border-radius:6px;padding:2px 8px;margin-left:4px;cursor:pointer;font-size:11px;display:inline-flex;align-items:center;gap:3px;'
          });
          routeBtn.title = 'Route to ' + ts.nextPhase;
          routeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.transitionWorkRequest(wr.id); });
          tdAct.appendChild(routeBtn);
        } else if (ts && ts.missing && ts.missing.length > 0) {
          const blockerBadge = el('span', {
            html: '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg> ' + ts.missing.length + ' blocker' + (ts.missing.length > 1 ? 's' : ''),
            style: 'color:#f59e0b;font-size:10px;display:inline-flex;align-items:center;gap:3px;padding:2px 6px;background:rgba(245,158,11,0.08);border-radius:6px;margin-left:4px;cursor:help;'
          });
          blockerBadge.title = ts.missing.join('\n');
          tdAct.appendChild(blockerBadge);
        }
      }
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
    // Exclude cancelled from board
    wrs = wrs.filter(wr => wr.status !== 'Cancelled');
    const board = el('div', { class: 'board-v2' });
    const statuses = ['Draft', 'Pre-processing', 'Processing', 'Billing', 'Disbursement', 'Completed'];
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

        const card = el('div', { class: 'board-card board-card-v2' });
        card.style.borderLeftColor = colColor;
        card.addEventListener('click', () => { this.view = 'detail'; this.detailWrId = wr.id; App.handleRoute(); });

        const transition = this.getPhaseTransitionStatus(wr.id);

        // Top: Priority path and Due Date
        const topRow = el('div', { class: 'card-v2-top' });
        const categoryPath = el('span', { class: 'card-v2-category', text: `${wr.priority} >` });
        topRow.appendChild(categoryPath);
        if (transition && transition.canTransition) {
          const readyBadge = el('span', { 
            html: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg> Ready to route',
            class: 'badge-success btn-xs', 
            style: 'margin-left:8px;font-size:10px;border-radius:10px;display:inline-flex;align-items:center;gap:3px;cursor:pointer;' 
          });
          readyBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            this.transitionWorkRequest(wr.id);
          });
          topRow.appendChild(readyBadge);
        } else if (transition && transition.missing && transition.missing.length > 0 && wr.status !== 'Completed' && wr.status !== 'Cancelled') {
          const blockerBadge = el('span', {
            html: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg> ' + transition.missing.length + ' pending',
            style: 'margin-left:8px;font-size:10px;border-radius:10px;display:inline-flex;align-items:center;gap:3px;color:#f59e0b;background:rgba(245,158,11,0.1);padding:2px 6px;cursor:help;'
          });
          blockerBadge.title = transition.missing.join('\n');
          topRow.appendChild(blockerBadge);
        }
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

        // Dynamic badges row on Board Card
        const badgeRow = el('div', { style: 'display:flex; gap:6px; margin-top:6px; margin-bottom:8px; flex-wrap:wrap;' });
        badgeRow.appendChild(this.getFinanceBadgeForWr(wr));
        badgeRow.appendChild(this.getDocBadgeForWr(wr));
        card.appendChild(badgeRow);

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
    const isManagerial = Auth.user.role === 'Admin' || Auth.user.role === 'Manager';
    if (wrs.length === 0) {
      container.appendChild(el('p', { text: 'No work requests found.', class: 'empty-state' }));
      return;
    }
    const list = el('div', { class: 'list-view operations-list-view' });
    wrs.forEach(wr => {
      const client = DB.getById('clients', wr.clientId);
      const row = el('div', { class: 'list-item' });
      const textCol = el('div');
      textCol.appendChild(el('div', { class: 'list-item-title', text: wr.title }));
      textCol.appendChild(el('div', { class: 'list-item-meta', text: (client?.name || '—') + ' | Due: ' + (wr.dueDate ? formatDate(wr.dueDate) : '—') }));
      
      const badgeRow = el('div', { style: 'display: flex; gap: 6px; margin-top: 4px;' });
      badgeRow.appendChild(this.getPriorityBadgeForWr(wr));
      badgeRow.appendChild(this.getFinanceBadgeForWr(wr));
      badgeRow.appendChild(this.getDocBadgeForWr(wr));
      textCol.appendChild(badgeRow);
      
      row.appendChild(textCol);
      row.appendChild(this.statusBadge(wr.status));
      if (isManagerial && wr.status !== 'Completed' && wr.status !== 'Cancelled') {
        const ts = this.getPhaseTransitionStatus(wr.id);
        if (ts && ts.canTransition && ts.nextPhase) {
          const readyBadge = el('span', {
            html: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg> Ready to route',
            style: 'color:#10b981;font-size:10px;display:inline-flex;align-items:center;gap:3px;padding:2px 8px;background:rgba(16,185,129,0.08);border-radius:10px;font-weight:500;cursor:pointer;'
          });
          readyBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            this.transitionWorkRequest(wr.id);
          });
          row.appendChild(readyBadge);
        } else if (ts && ts.missing && ts.missing.length > 0) {
          const blockerChip = el('span', {
            html: '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg> ' + ts.missing.length + ' pending',
            style: 'color:#f59e0b;font-size:10px;display:inline-flex;align-items:center;gap:3px;padding:2px 8px;background:rgba(245,158,11,0.08);border-radius:10px;cursor:help;font-weight:500;'
          });
          blockerChip.title = ts.missing.join('\n');
          row.appendChild(blockerChip);
        }
      }
      row.addEventListener('click', () => { this.view = 'detail'; this.detailWrId = wr.id; App.handleRoute(); });
      list.appendChild(row);
    });
    container.appendChild(list);
  },

  statusBadge(status) {
    const map = {
      'Draft': 'badge-draft',
      'Pre-processing': 'badge-preprocessing',
      'Processing': 'badge-processing',
      'Billing': 'badge-billing',
      'Disbursement': 'badge-disbursement',
      'Completed': 'badge-success',
      'Cancelled': 'badge-danger'
    };
    return el('span', { class: 'badge ' + (map[status] || 'badge-neutral'), text: status });
  },

  getFinanceBadgeForWr(wr) {
    const invoices = DB.getWhere('invoices', inv => inv.workRequestId === wr.id || wr.linkedInvoiceId === inv.id);
    const disbursements = DB.getWhere('disbursements', d => d.linkedWorkRequestId === wr.id || (wr.linkedDisbursementIds || []).includes(d.id));
    
    let text = 'No Finances';
    let bg = '#f1f5f9';
    let fg = '#475569';
    
    if (invoices.length > 0 || disbursements.length > 0) {
      const allInvoicesPaid = invoices.every(inv => inv.status === 'Paid');
      const allDisbursementsReleased = disbursements.every(d => d.status === 'Released');
      
      if (allInvoicesPaid && allDisbursementsReleased) {
        text = 'Finances: Settled';
        bg = '#dcfce7';
        fg = '#166534';
      } else {
        const anyOverdue = invoices.some(inv => inv.status === 'Overdue');
        const anyDraftOrPending = invoices.some(inv => ['Draft', 'Pending'].includes(inv.status)) ||
                                  disbursements.some(d => ['Submitted', 'Under Review'].includes(d.status));
        
        if (anyOverdue) {
          text = 'Finances: Overdue';
          bg = '#fee2e2';
          fg = '#991b1b';
        } else if (anyDraftOrPending) {
          text = 'Finances: Pending Approval';
          bg = '#fef3c7';
          fg = '#b45309';
        } else {
          text = 'Finances: Active';
          bg = '#dbeafe';
          fg = '#1e40af';
        }
      }
    }
    
    return el('span', {
      text,
      style: 'font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: ' + bg + '; color: ' + fg + '; display: inline-flex; align-items: center; border: 1px solid rgba(0,0,0,0.05);'
    });
  },

  getDocBadgeForWr(wr) {
    const documents = DB.getWhere('documents', doc => doc.workRequestId === wr.id);
    
    let text = 'No Documents';
    let bg = '#f1f5f9';
    let fg = '#475569';
    
    if (documents.length > 0) {
      const storedCount = documents.filter(d => d.lifecycleState === 'stored').length;
      if (storedCount === documents.length) {
        text = 'Docs: Stored';
        bg = '#dcfce7';
        fg = '#166534';
      } else {
        text = `Docs: ${storedCount}/${documents.length} Stored`;
        bg = '#dbeafe';
        fg = '#1e40af';
      }
    }
    
    return el('span', {
      text,
      style: 'font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: ' + bg + '; color: ' + fg + '; display: inline-flex; align-items: center; border: 1px solid rgba(0,0,0,0.05);'
    });
  },

  getPriorityBadgeForWr(wr) {
    const priority = wr.priority || 'Normal';
    const pMap = {
      'Urgent': { text: 'Urgent', bg: '#fee2e2', fg: '#991b1b' },
      'Priority': { text: 'Priority', bg: '#fef3c7', fg: '#92400e' },
      'Low Priority': { text: 'Low Priority', bg: '#dcfce7', fg: '#166534' },
      'Normal': { text: 'Normal', bg: '#f1f5f9', fg: '#475569' }
    };
    const pConfig = pMap[priority] || pMap['Normal'];
    return el('span', {
      text: 'Priority: ' + pConfig.text,
      style: 'font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 4px; background: ' + pConfig.bg + '; color: ' + pConfig.fg + '; display: inline-flex; align-items: center; border: 1px solid rgba(0,0,0,0.05);'
    });
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

    // Use Retainer Template button (only on creation, not edit)
    const templates = DB.getWhere('retainerTemplates', t => t.entity === entity);
    let selectedTemplateId = null;
    let templateBtnRef = null;
    if (!wr && templates.length > 0) {
      const templateWrapper = el('div', { class: 'template-btn-wrapper' });
      const templateBtn = el('button', { type: 'button', class: 'btn btn-outline', text: 'Use Retainer Template' });
      templateBtnRef = templateBtn;
      const templateDropdown = el('div', { class: 'template-dropdown hidden' });

      // "None" option to clear template
      const noneItem = el('div', { class: 'template-dropdown-item active', text: '— None —' });
      noneItem.dataset.templateId = '';
      templateDropdown.appendChild(noneItem);

      templates.forEach(t => {
        const item = el('div', { class: 'template-dropdown-item', text: t.name });
        item.dataset.templateId = t.id;
        templateDropdown.appendChild(item);
      });

      templateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        templateDropdown.classList.toggle('hidden');
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', () => {
        templateDropdown.classList.add('hidden');
      });
      templateDropdown.addEventListener('click', (e) => e.stopPropagation());

      templateWrapper.appendChild(templateBtn);
      templateWrapper.appendChild(templateDropdown);
      topActions.appendChild(templateWrapper);
    }

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

    // Template dropdown item click handler (wired after form fields exist)
    if (!wr && templates.length > 0) {
      const templateDropdown = topActions.querySelector('.template-dropdown');
      const dropdownItems = templateDropdown.querySelectorAll('.template-dropdown-item');
      dropdownItems.forEach(item => {
        item.addEventListener('click', () => {
          const templateId = item.dataset.templateId;
          selectedTemplateId = templateId;
          const tasksList = document.getElementById('task-rows');
          const template = templateId ? DB.getById('retainerTemplates', templateId) : null;

          // Update active state on dropdown items
          dropdownItems.forEach(di => di.classList.remove('active'));
          item.classList.add('active');

          // Update button text
          if (templateBtnRef) {
            templateBtnRef.textContent = template ? template.name : 'Use Retainer Template';
          }

          // Close dropdown
          templateDropdown.classList.add('hidden');

          if (tasksList) {
            if (template) {
              // Fill form fields from template
              const titleInput = form.querySelector('input[name="title"]');
              const descInput = form.querySelector('input[name="description"]');
              const dueDateInput = form.querySelector('input[name="dueDate"]');
              const now = new Date();
              const titleSuffix = now.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });

              if (titleInput) titleInput.value = `${template.name} (${titleSuffix})`;
              if (descInput) descInput.value = template.description || '';

              // Set due date: monthly = 1 month, quarterly = 3 months
              if (dueDateInput) {
                const dueDate = new Date(now);
                if (template.schedule === 'quarterly') {
                  dueDate.setMonth(dueDate.getMonth() + 3);
                } else {
                  dueDate.setMonth(dueDate.getMonth() + 1);
                }
                dueDateInput.value = dueDate.toISOString().slice(0, 10);
              }

              // Set client
              if (clientSel && template.clientId) clientSel.value = template.clientId;

              // Set priority to Normal for template-generated WRs
              if (prioritySel) prioritySel.value = 'Normal';

              // Load template tasks
              this.loadTemplateTasks(templateId, tasksList);

              // Lock fields
              this.setTemplateFieldsLocked(form, tasksList, true);
            } else {
              // "None" selected — clear and unlock
              const titleInput = form.querySelector('input[name="title"]');
              const descInput = form.querySelector('input[name="description"]');
              const dueDateInput = form.querySelector('input[name="dueDate"]');

              if (titleInput) titleInput.value = '';
              if (descInput) descInput.value = '';
              if (dueDateInput) dueDateInput.value = '';
              if (clientSel) clientSel.value = '';
              if (prioritySel) prioritySel.value = 'Urgent';

              while (tasksList.firstChild) tasksList.removeChild(tasksList.firstChild);
              this.addTaskRow(tasksList);
              this.addTaskRow(tasksList);
              this.updatePredecessorOptions(tasksList);

              this.setTemplateFieldsLocked(form, tasksList, false);
            }
          }
        });
      });
    }

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



    const addTaskBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: '+ Add Task' });
    addTaskBtn.setAttribute('data-role', 'add-task');
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

    // Detect if existing task depends on every previous task -> show as "All (*)"
    const existingPreds = taskData?.predecessors || taskData?.dependencies || [];
    const previousTaskKeys = Array.from(container.querySelectorAll('.task-row')).map(r => r.dataset.taskKey);
    const dependsOnAllPrevious = previousTaskKeys.length > 0 && previousTaskKeys.every(k => existingPreds.includes(k));
    if (dependsOnAllPrevious) {
      row.dataset.predKeys = '*';
    } else {
      row.dataset.predKeys = existingPreds.join(',');
    }

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

    // Manual employee name option
    assigneeSel.appendChild(el('option', { value: 'others', text: 'Others' }));
    const assigneeOtherInput = el('input', {
      type: 'text',
      class: 'task-assignee-other',
      placeholder: 'Enter employee name',
      style: 'display: none;'
    });
    assigneeSel.addEventListener('change', () => {
      const isOthers = assigneeSel.value === 'others';
      assigneeOtherInput.style.display = isOthers ? 'inline-block' : 'none';
      assigneeOtherInput.required = isOthers;
      if (!isOthers) {
        assigneeOtherInput.value = '';
        assigneeOtherInput.classList.remove('input-error');
      }
    });
    if (taskData?.assigneeName) {
      assigneeSel.value = 'others';
      assigneeOtherInput.value = taskData.assigneeName;
      assigneeOtherInput.style.display = 'inline-block';
      assigneeOtherInput.required = true;
    }

    row.appendChild(assigneeSel);
    row.appendChild(assigneeOtherInput);

    // Custom Multi-select Dropdown
    const predWrapper = el('div', { class: 'multi-select-dropdown task-pred' });
    const predBtn = el('button', { type: 'button', class: 'multi-select-btn', text: '— No dependency —' });
    const predMenu = el('div', { class: 'multi-select-menu' });
    predWrapper.appendChild(predBtn);
    predWrapper.appendChild(predMenu);

    predBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.multi-select-menu.show').forEach(m => {
        if (m !== predMenu) m.classList.remove('show');
      });
      predMenu.classList.toggle('show');
    });
    predMenu.addEventListener('click', (e) => e.stopPropagation());

    row.appendChild(predWrapper);

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
      const predWrapper = row.querySelector('.task-pred');
      if (!predWrapper) return;
      const predBtn = predWrapper.querySelector('.multi-select-btn');
      const predMenu = predWrapper.querySelector('.multi-select-menu');
      if (!predBtn || !predMenu) return;

      const currentKeys = (row.dataset.predKeys || '').split(',').filter(Boolean);
      predMenu.innerHTML = '';

      const updateSelection = () => {
        const checkedOptions = Array.from(predMenu.querySelectorAll('.multi-select-option input:checked'));
        let selectedKeys = checkedOptions.map(opt => opt.value);

        if (selectedKeys.includes('*')) {
          row.dataset.predKeys = '*';
          predBtn.textContent = 'All previous tasks (*)';
          predMenu.querySelectorAll('.multi-select-option input').forEach(input => {
            if (input.value !== '*') input.checked = true;
          });
        } else if (selectedKeys.length > 0) {
          row.dataset.predKeys = selectedKeys.join(',');
          const selectedLabels = selectedKeys.map(k => {
            const t = tasks.find(tsk => tsk.key === k);
            return t ? t.label : 'Task';
          });
          predBtn.textContent = selectedLabels.join(', ');
        } else {
          row.dataset.predKeys = '';
          predBtn.textContent = '— No dependency —';
        }
      };

      // 1. Add "All previous tasks (*)"
      if (idx > 0) {
        const optionEl = el('label', { class: 'multi-select-option' });
        const checkbox = el('input', { type: 'checkbox', value: '*' });
        if (currentKeys.includes('*')) checkbox.checked = true;
        checkbox.addEventListener('change', () => {
          if (checkbox.checked) {
            predMenu.querySelectorAll('.multi-select-option input').forEach(input => {
              if (input !== checkbox) input.checked = true;
            });
          } else {
            predMenu.querySelectorAll('.multi-select-option input').forEach(input => {
              input.checked = false;
            });
          }
          updateSelection();
        });
        optionEl.appendChild(checkbox);
        optionEl.appendChild(document.createTextNode('All previous tasks (*)'));
        predMenu.appendChild(optionEl);
      }

      // 2. Add individual tasks
      tasks.forEach((task, tIdx) => {
        if (task.key === row.dataset.taskKey) return;

        const optionEl = el('label', { class: 'multi-select-option' });
        const checkbox = el('input', { type: 'checkbox', value: task.key });
        
        const isPrevious = tIdx < idx;
        const shouldBeChecked = currentKeys.includes(task.key) || (currentKeys.includes('*') && isPrevious);
        if (shouldBeChecked) checkbox.checked = true;

        checkbox.addEventListener('change', () => {
          if (!checkbox.checked) {
            const allCheckbox = predMenu.querySelector('.multi-select-option input[value="*"]');
            if (allCheckbox) allCheckbox.checked = false;
          }
          updateSelection();
        });
        optionEl.appendChild(checkbox);
        optionEl.appendChild(document.createTextNode(task.label));
        predMenu.appendChild(optionEl);
      });

      updateSelection();
    });
  },

  validateManualAssignees(form) {
    const taskRows = form.querySelectorAll('.task-row');
    let firstInvalid = null;
    taskRows.forEach(row => {
      const title = row.querySelector('.task-title-input')?.value.trim();
      if (!title) return;
      const assigneeSel = row.querySelector('.task-assignee');
      const assigneeOtherInput = row.querySelector('.task-assignee-other');
      if (assigneeSel?.value === 'others' && !assigneeOtherInput?.value.trim()) {
        assigneeOtherInput.classList.add('input-error');
        if (!firstInvalid) firstInvalid = assigneeOtherInput;
      } else if (assigneeOtherInput) {
        assigneeOtherInput.classList.remove('input-error');
      }
    });
    if (firstInvalid) {
      this.showMessage('Validation Error', 'Please enter an employee name for tasks marked as Others.', 'danger');
      firstInvalid.focus();
      return false;
    }
    return true;
  },

  loadTemplateTasks(templateId, container) {
    if (!templateId) {
      this.showMessage('Error', 'Please select a retainer template first.', 'danger');
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

  setTemplateFieldsLocked(form, tasksList, locked) {
    // Lock/unlock form-level fields (title, description, dueDate, client, priority)
    const fieldNames = ['title', 'description', 'dueDate', 'clientId', 'priority'];
    fieldNames.forEach(name => {
      const field = form.querySelector(`[name="${name}"]`);
      if (field) {
        const group = field.closest('.form-group');
        if (locked) {
          field.disabled = true;
          if (field.tagName === 'INPUT') field.readOnly = true;
          if (group) group.classList.add('template-locked');
        } else {
          field.disabled = false;
          if (field.tagName === 'INPUT') field.readOnly = false;
          if (group) group.classList.remove('template-locked');
        }
      }
    });

    // Lock/unlock task rows
    const tasksSection = tasksList.closest('.form-section');
    if (locked) {
      tasksSection.classList.add('tasks-template-locked');
      tasksList.querySelectorAll('.task-row').forEach(row => {
        row.classList.add('template-locked');
        const titleInput = row.querySelector('.task-title-input');
        const predBtn = row.querySelector('.task-pred .multi-select-btn');
        if (titleInput) { titleInput.disabled = true; titleInput.readOnly = true; }
        if (predBtn) predBtn.disabled = true;
      });
    } else {
      tasksSection.classList.remove('tasks-template-locked');
      tasksList.querySelectorAll('.task-row').forEach(row => {
        row.classList.remove('template-locked');
        const titleInput = row.querySelector('.task-title-input');
        const predBtn = row.querySelector('.task-pred .multi-select-btn');
        if (titleInput) { titleInput.disabled = false; titleInput.readOnly = false; }
        if (predBtn) predBtn.disabled = false;
      });
    }
  },

  submitForm(form) {
    // Temporarily enable disabled fields so FormData picks them up
    const disabledFields = form.querySelectorAll('[disabled]');
    disabledFields.forEach(f => f.disabled = false);
    if (!validateRequiredFields(form)) { disabledFields.forEach(f => f.disabled = true); return; }
    if (!this.validateManualAssignees(form)) { disabledFields.forEach(f => f.disabled = true); return; }
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
      const assigneeSel = row.querySelector('.task-assignee');
      const assigneeOtherInput = row.querySelector('.task-assignee-other');
      const isManualAssignee = assigneeSel.value === 'others';
      const predKeysStr = row.dataset.predKeys || '';
      const predecessorKeys = predKeysStr.split(',').filter(Boolean);
      tasks.push({
        key: row.dataset.taskKey || generateId('tmp'),
        title,
        assigneeId: isManualAssignee ? null : (assigneeSel.value || null),
        assigneeName: isManualAssignee ? (assigneeOtherInput.value.trim() || null) : null,
        predecessorKeys: predecessorKeys
      });
    });

    const cycleCheck = tasks.map((t, i) => {
      let preds = [];
      if (t.predecessorKeys.includes('*')) {
        preds = tasks.slice(0, i).map(pt => pt.key);
      } else {
        preds = t.predecessorKeys;
      }
      return { id: t.key, predecessors: preds };
    });
    if (this.detectCycle(cycleCheck)) {
      this.showMessage('Dependency Error', 'Task dependencies contain a cycle. Please fix before saving.', 'danger');
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

    const resolvePredecessors = (t, i) => {
      if (t.predecessorKeys.includes('*')) {
        return tasks.slice(0, i).map(pt => idMap.get(pt.key)).filter(Boolean);
      }
      return t.predecessorKeys.map(k => idMap.get(k)).filter(Boolean);
    };

    const taskRecords = tasks.map((t, i) => {
      const existing = existingTasksById[t.key];
      return {
        id: idMap.get(t.key),
        workRequestId: recordId,
        title: t.title,
        assigneeId: t.assigneeId || null,
        assigneeName: t.assigneeName || null,
        predecessors: resolvePredecessors(t, i),
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
          assigneeName: t.assigneeName || null,
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

    const finDiv = el('div', { class: 'detail-info-item' });
    finDiv.appendChild(el('span', { class: 'detail-info-label', text: 'Finance Status' }));
    const finVal = el('span', { class: 'detail-info-value' });
    finVal.appendChild(this.getFinanceBadgeForWr(wr));
    finDiv.appendChild(finVal);
    subHeader.appendChild(finDiv);

    const docDiv = el('div', { class: 'detail-info-item' });
    docDiv.appendChild(el('span', { class: 'detail-info-label', text: 'Documents Status' }));
    const docVal = el('span', { class: 'detail-info-value' });
    docVal.appendChild(this.getDocBadgeForWr(wr));
    docDiv.appendChild(docVal);
    subHeader.appendChild(docDiv);

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
    const isArchived = wr.status === 'Cancelled';

    // End-of-day time log reminder banner (Manila 5 PM+)
    const now = new Date();
    const manilaHour = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' })).getHours();
    if (manilaHour >= 17 && !isArchived) {
      const myTasks = sortedTasks.filter(t => (t.assigneeId || t.assignedTo) === Auth.user.id && t.status !== 'Completed' && t.status !== 'Cancelled');
      const todayStr = now.toISOString().slice(0, 10);
      const missingLogTasks = myTasks.filter(t => !(t.timeLogs || []).some(l => l.date === todayStr));
      if (missingLogTasks.length > 0) {
        const reminderBanner = el('div', {
          style: 'background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:12px 16px;margin-bottom:16px;display:flex;align-items:center;gap:12px;'
        });
        reminderBanner.appendChild(el('div', {
          html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#b45309" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
          style: 'flex-shrink:0;'
        }));
        const reminderText = el('div', { style: 'flex:1;' });
        reminderText.appendChild(el('div', {
          text: `⏰ End of day reminder: You haven't logged time today for ${missingLogTasks.length} assigned task(s).`,
          style: 'font-weight:600;color:#92400e;font-size:13px;'
        }));
        const logBtn = el('button', {
          text: 'Log Time Now',
          class: 'btn btn-sm',
          style: 'margin-top:6px;background:#f59e0b;color:#fff;border:none;border-radius:6px;padding:4px 12px;font-weight:600;cursor:pointer;font-size:12px;'
        });
        logBtn.addEventListener('click', () => { this.showAddTimeLogModal(missingLogTasks[0].id); });
        reminderText.appendChild(logBtn);
        reminderBanner.appendChild(reminderText);
        container.appendChild(reminderBanner);
      }
    }

    const groups = { 'General Tasks': sortedTasks };
    for (const [groupName, groupTasks] of Object.entries(groups)) {
      const groupEl = el('div', { class: 'task-group-v2' });
      const groupHeader = el('div', { class: 'task-group-header' });
      groupHeader.appendChild(el('span', { text: groupName }));
      groupHeader.appendChild(el('span', { class: 'task-group-count', text: ` — ${groupTasks.length} tasks` }));

      // Action Buttons: Route + Cancel Work Request
      if (wr) {
        const ts = this.getPhaseTransitionStatus(wr.id);
        const showRouteButton = ts && ts.nextPhase && ts.nextPhase !== 'Cancelled';
        const canCancel = isManagerial && wr.status !== 'Completed' && wr.status !== 'Cancelled';
        const phaseColors = {
          'Draft': '#94a3b8',
          'Pre-processing': '#3b82f6',
          'Processing': '#f59e0b',
          'Billing': '#a855f7',
          'Disbursement': '#6366f1',
          'Completed': '#10b981',
          'Cancelled': '#ef4444'
        };

        if (showRouteButton || canCancel) {
          const actionsWrap = el('div', { style: 'display:flex; gap:8px; margin-left:auto; align-items:center;' });

          if (canCancel) {
            const cancelWrBtn = el('button', {
              class: 'btn btn-sm',
              text: 'Cancel Work Request',
              style: 'background: transparent; border: none; color: var(--color-danger); font-weight: 600; padding: 4px 8px; cursor: pointer;'
            });
            cancelWrBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              this.cancelWorkRequest(wr.id);
            });
            actionsWrap.appendChild(cancelWrBtn);
          }

          if (showRouteButton) {
            const routeColor = phaseColors[ts.nextPhase] || '#94a3b8';
            const routeBtn = el('button', {
              class: 'btn btn-sm',
              text: `Route to ${ts.nextPhase}`,
              style: `background: transparent; border: none; color: ${routeColor}; font-weight: 600; padding: 4px 8px; cursor: ${ts.canTransition ? 'pointer' : 'not-allowed'}; opacity: ${ts.canTransition ? '1' : '0.5'};`,
              disabled: !ts.canTransition
            });
            if (ts.canTransition) {
              routeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.transitionWorkRequest(wr.id);
              });
            }
            actionsWrap.appendChild(routeBtn);
          }

          groupHeader.appendChild(actionsWrap);
        }

        // Routing dependency checklist — shows blockers + actionable hints
        if (ts && !ts.canTransition && ts.missing && ts.missing.length > 0 && wr.status !== 'Completed' && wr.status !== 'Cancelled') {
          const blockWrapper = el('div', {
            style: 'width:100%; display:flex; justify-content:flex-end; margin-top:8px;'
          });
          const depPanel = el('div', {
            style: 'background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.15);border-radius:8px;padding:10px 14px;font-size:12px;max-width:65%;'
          });
          depPanel.appendChild(el('div', {
            html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg> <strong>Routing blocked</strong> — Resolve these to route to ' + (ts.nextPhase || 'next phase') + ':',
            style: 'display:flex;align-items:center;gap:6px;margin-bottom:6px;color:#92400e;font-weight:500;'
          }));
          const depList = el('ul', { style: 'margin:0;padding-left:24px;color:#78350f;' });
          ts.missing.forEach(m => {
            const li = el('li', { style: 'margin-bottom:4px;' });
            li.appendChild(el('div', { text: m, style: 'font-weight:500;' }));
            const hint = this.getRoutingHint(m);
            if (hint) {
              const hintEl = el('div', { style: 'font-size:11px;color:#b45309;margin-top:2px;' });
              hintEl.appendChild(el('span', { text: '→ ' + hint.text, style: 'font-style:italic;' }));
              if (hint.route) {
                const goBtn = el('button', {
                  text: 'Go',
                  class: 'btn btn-xs',
                  style: 'margin-left:6px;padding:1px 6px;font-size:10px;background:rgba(245,158,11,0.15);color:#92400e;border:none;border-radius:4px;cursor:pointer;font-weight:600;'
                });
                goBtn.addEventListener('click', () => {
                  if (hint.route === '#billing') { Billing.view = 'list'; Billing.detailId = null; }
                  if (hint.route === '#disbursement') { Disbursement.view = 'list'; Disbursement.detailId = null; }
                  location.hash = hint.route;
                });
                hintEl.appendChild(goBtn);
              }
              li.appendChild(hintEl);
            }
            depList.appendChild(li);
          });
          depPanel.appendChild(depList);
          blockWrapper.appendChild(depPanel);
          groupHeader.appendChild(blockWrapper);
        } else if (ts && ts.canTransition && ts.nextPhase && wr.status !== 'Completed' && wr.status !== 'Cancelled') {
          const readyWrapper = el('div', {
            style: 'width:100%; display:flex; justify-content:flex-end; margin-top:8px;'
          });
          const readyPanel = el('div', {
            style: 'background:rgba(16,185,129,0.06);border:1px solid rgba(16,185,129,0.15);border-radius:8px;padding:10px 14px;font-size:12px;max-width:65%;'
          });
          readyPanel.appendChild(el('div', {
            html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> <strong>Ready to route</strong> — All requirements met. Click "Route to ' + ts.nextPhase + '" above to proceed.',
            style: 'display:flex;align-items:center;gap:6px;color:#166534;font-weight:500;'
          }));
          readyWrapper.appendChild(readyPanel);
          groupHeader.appendChild(readyWrapper);
        }
      }

      groupEl.appendChild(groupHeader);

      const table = el('table', { class: 'task-table-v2' });
      const thead = el('thead');
      const thr = el('tr');
      ['Task', 'Assigned To', 'Due Date', 'Progress Status', 'Linked Records', 'Priority', 'Est. Amount', 'Hours'].forEach(h => {
        thr.appendChild(el('th', { text: h }));
      });
      thead.appendChild(thr);
      table.appendChild(thead);

      const tbody = el('tbody');
      let totalAmount = 0;
      let totalHours = 0;

      groupTasks.forEach(t => {
        const assignee = t.assigneeName
          ? { name: t.assigneeName }
          : DB.getById('users', t.assigneeId || t.assignedTo);
        const tr = el('tr', { class: 'task-row-v2 task-expand' });
        
        // Totals calculation
        const hours = (t.timeLogs || []).reduce((acc, l) => acc + (l.hours || 0), 0);
        totalHours += hours;
        totalAmount += 1200; // Mock amount per task

        // Task Title Cell (With collapsible indicator)
        const tdTitle = el('td');
        const titleWrap = el('div', { class: 'task-v2-title-cell', style: 'display: flex; align-items: flex-start; gap: 8px;' });
        titleWrap.appendChild(el('span', { class: 'task-v2-row-caret', text: '›', style: 'margin-top: 2px;' }));
        
        const titleAndDeps = el('div', { style: 'display: flex; flex-direction: column;' });
        titleAndDeps.appendChild(el('div', { class: 'task-v2-title' + (t.status === 'Completed' ? ' completed' : ''), text: t.title }));
        
        // Show dependencies if they exist
        const preds = t.predecessors || [];
        if (preds.length > 0) {
          const predTitles = preds.map(pid => {
            const pt = DB.getById('tasks', pid);
            return pt ? pt.title : null;
          }).filter(Boolean);
          if (predTitles.length > 0) {
            const depLabel = el('span', { 
              text: 'Blocking dependencies: ' + predTitles.join(', '), 
              style: 'font-size: 11px; color: var(--color-text-muted, #7c7c8a); margin-top: 2px; font-style: italic;' 
            });
            titleAndDeps.appendChild(depLabel);
          }
        }
        titleWrap.appendChild(titleAndDeps);
        tdTitle.appendChild(titleWrap);
        tr.appendChild(tdTitle);

        // Assigned To
        const tdAssignee = el('td');
        tdAssignee.addEventListener('click', (e) => e.stopPropagation()); // Prevent accordion toggle
        
        if (wr.status === 'Draft') {
          const assigneeSel = el('select', { class: 'form-select inline-assignee-select', style: 'width: 100%; min-width: 130px; font-size: 13px; padding: 4px;' });
          assigneeSel.appendChild(el('option', { value: '', text: '— Unassigned —' }));
          
          const wrEntity = wr.entity || Auth.activeEntity;
          const staffPool = DB.getWhere('users', u => u.entities.includes(wrEntity) || u.entities.includes(wrEntity.toLowerCase()) || wrEntity === 'ALL');
          
          staffPool.forEach(u => {
            const opt = el('option', { value: u.id, text: u.name });
            if (t.assigneeId === u.id || t.assignedTo === u.id) opt.selected = true;
            assigneeSel.appendChild(opt);
          });
          
          assigneeSel.appendChild(el('option', { value: 'others', text: 'Others...' }));
          
          const assigneeOtherInput = el('input', {
            type: 'text',
            class: 'form-control',
            placeholder: 'Enter name',
            value: t.assigneeName || '',
            style: (t.assigneeName ? 'display: block;' : 'display: none;') + 'margin-top: 4px; font-size: 12px; padding: 2px 4px;'
          });
          
          if (t.assigneeName) {
            assigneeSel.value = 'others';
          }
          
          assigneeSel.addEventListener('change', () => {
            const isOthers = assigneeSel.value === 'others';
            assigneeOtherInput.style.display = isOthers ? 'block' : 'none';
            if (!isOthers) {
              assigneeOtherInput.value = '';
              DB.update('tasks', t.id, { 
                assigneeId: assigneeSel.value || null, 
                assigneeName: null, 
                status: assigneeSel.value ? 'Assigned' : 'Draft',
                updatedAt: new Date().toISOString() 
              });
              App.handleRoute();
            }
          });
          
          assigneeOtherInput.addEventListener('change', () => {
            const val = assigneeOtherInput.value.trim();
            if (val) {
              DB.update('tasks', t.id, { 
                assigneeId: null, 
                assigneeName: val, 
                status: 'Assigned',
                updatedAt: new Date().toISOString() 
              });
              App.handleRoute();
            }
          });
          
          const assigneeWrap = el('div', { style: 'display: flex; flex-direction: column;' });
          assigneeWrap.appendChild(assigneeSel);
          assigneeWrap.appendChild(assigneeOtherInput);
          tdAssignee.appendChild(assigneeWrap);
        } else {
          const assigneeWrap = el('div', { style: 'display:flex; align-items:center; gap:var(--spacing-xs);' });
          const av = el('div', { class: 'avatar-xs' });
          if (assignee?.avatarUrl) av.style.backgroundImage = `url('${assignee.avatarUrl}')`;
          assigneeWrap.appendChild(av);
          assigneeWrap.appendChild(el('span', { text: assignee?.name || 'Unassigned', style: !assignee ? 'color:var(--color-text-muted);font-style:italic;' : '' }));
          tdAssignee.appendChild(assigneeWrap);
        }
        tr.appendChild(tdAssignee);

        // Due Date
        tr.appendChild(el('td', { text: t.dueDate ? formatDate(t.dueDate) : 'N/A' }));

        // Progress Status (Dropdown with Left Arrow)
        const tdStatus = el('td');
        const statusWrapper = el('div', { class: 'status-dropdown-wrapper-v2' });
        const statusSel = el('select', { class: 'form-select status-dropdown-v2' });
        statusSel.addEventListener('click', (e) => e.stopPropagation()); // Prevent accordion toggle

        const validStatuses = this.getValidNextStatuses(t);
        const flow = ['Draft', 'Assigned', 'In Progress', 'For Review', 'Completed', 'Cancelled'];
        flow.forEach(s => {
          const opt = el('option', { value: s, text: s });
          if (s === t.status) opt.selected = true;
          if (!validStatuses.includes(s) || isArchived) {
            opt.disabled = true;
          }
          statusSel.appendChild(opt);
        });
        if (isArchived) statusSel.disabled = true;

        const sColors = { 'Completed': '#10b981', 'In Progress': '#f59e0b', 'Draft': '#94a3b8', 'For Review': '#a855f7', 'Assigned': '#3b82f6', 'Cancelled': '#ef4444' };
        statusSel.style.color = sColors[t.status] || '#1e293b';

        statusSel.addEventListener('change', () => {
          const newStatus = statusSel.value;
          const originalStatus = t.status;
          const resetDropdown = () => {
            statusSel.value = originalStatus;
            statusSel.style.color = sColors[originalStatus] || '#1e293b';
          };
          if (newStatus === 'Completed' || newStatus === 'Cancelled') {
            this.showConfirm('Confirm Status Change',
              `Are you sure you want to mark this task as "${newStatus}"? This may affect dependencies and routing.`,
              () => {
                const res = this.updateTaskStatus(t.id, newStatus);
                if (res.error) {
                  this.showMessage('Error', res.error, 'danger');
                  resetDropdown();
                } else {
                  App.handleRoute();
                }
              },
              newStatus === 'Cancelled' ? 'danger' : 'warning',
              resetDropdown
            );
          } else {
            const res = this.updateTaskStatus(t.id, newStatus);
            if (res.error) {
              this.showMessage('Error', res.error, 'danger');
              resetDropdown();
            } else {
              App.handleRoute();
            }
          }
        });

        statusWrapper.appendChild(statusSel);
        tdStatus.appendChild(statusWrapper);
        tr.appendChild(tdStatus);

        // Linked Records Column
        const tdLinked = el('td');
        const linkedWrap = el('div', { style: 'display:flex; flex-direction:column; gap:4px;' });
        
        let linkedInv = DB.getWhere('invoices', inv => inv.linkedTaskId === t.id)[0];
        if (!linkedInv) {
          const pc = DB.getWhere('pendingChanges', p => p.table === 'invoices' && p.status === 'pending' && p.proposedData && p.proposedData.linkedTaskId === t.id)[0];
          if (pc) {
            linkedInv = deepClone(pc.proposedData);
            linkedInv.status = 'Pending';
            linkedInv.pendingChangeId = pc.id;
          }
        }
        const linkedDisb = DB.getWhere('disbursements', d => d.linkedTaskId === t.id);
        
        if (linkedInv) {
          const badgeText = '📄 ' + linkedInv.invoiceNumber + (linkedInv.status === 'Pending' ? ' (Pending)' : '');
          const badge = el('span', { class: 'badge badge-info', text: badgeText, style: 'cursor:pointer; font-size:10px;' });
          badge.addEventListener('click', (e) => { e.stopPropagation(); Billing.detailId = linkedInv.id; Billing.view = 'detail'; location.hash = '#billing'; App.handleRoute(); });
          linkedWrap.appendChild(badge);
        }
        linkedDisb.forEach(d => {
          const badge = el('span', { class: 'badge badge-warning', text: '💸 ' + d.category, style: 'cursor:pointer; font-size:10px;' });
          badge.addEventListener('click', (e) => { e.stopPropagation(); Disbursement.detailId = d.id; Disbursement.view = 'detail'; App.handleRoute(); });
          linkedWrap.appendChild(badge);
        });
        
        // Show actionable link hints for routing-critical tasks
        const needsInvoice = t.title.toLowerCase().includes('invoice') || t.title.toLowerCase().includes('bill');
        const needsDisbursement = t.title.toLowerCase().includes('expense') || t.title.toLowerCase().includes('disburse') || t.title.toLowerCase().includes('payment') || t.title.toLowerCase().includes('reimburse');
        if (!isArchived && needsInvoice && !linkedInv) {
          const linkHint = el('span', {
            text: '⚠ Link invoice required',
            style: 'font-size:10px;color:#f59e0b;font-weight:500;cursor:pointer;'
          });
          linkHint.addEventListener('click', (e) => { e.stopPropagation(); this.showLinkFinancialModal(t.id); });
          linkedWrap.appendChild(linkHint);
        }
        if (!isArchived && needsDisbursement && linkedDisb.length === 0) {
          const linkHint = el('span', {
            text: '⚠ Link expense required',
            style: 'font-size:10px;color:#f59e0b;font-weight:500;cursor:pointer;'
          });
          linkHint.addEventListener('click', (e) => { e.stopPropagation(); this.showLinkFinancialModal(t.id); });
          linkedWrap.appendChild(linkHint);
        }

        if (!linkedInv && linkedDisb.length === 0 && !needsInvoice && !needsDisbursement) {
          linkedWrap.appendChild(el('span', { text: 'N/A', style: 'color:var(--color-text-muted);' }));
        }
        tdLinked.appendChild(linkedWrap);
        tr.appendChild(tdLinked);

        // Priority
        const tdPriority = el('td');
        const pColors = { 'Urgent': '#ef4444', 'Priority': '#f59e0b', 'Low Priority': '#10b981', 'Normal': '#94a3b8' };
        const pText = t.priority === 'Urgent' ? '● Critical' : t.priority === 'Priority' ? '↑ High' : t.priority || 'Normal';
        tdPriority.appendChild(el('span', { class: 'priority-badge-v2', style: `color:${pColors[t.priority] || '#94a3b8'}`, text: pText }));
        tr.appendChild(tdPriority);

        // Financials (Aligned)
        tr.appendChild(el('td', { text: formatPHP(1200) }));

        // Hours (Aligned)
        tr.appendChild(el('td', { text: hours > 0 ? `${hours}h` : 'N/A' }));

        tbody.appendChild(tr);

        // Accordion Details Row
        const detailsTr = el('tr', { class: 'task-details-row hidden accordion-panel collapsed' });
        const detailsTd = el('td', { colspan: 8 });
        const detailsContainer = el('div', { class: 'task-details-container' });
        
        const detailsGrid = el('div', { class: 'task-details-grid' });
        
        // Attached Documents Section
        const isAdmin = Auth.user.role === 'Admin';
        const isDocStaff = Auth.user.role === 'Staff' && Auth.can('dms:handover');
        
        const docsSection = el('div', { class: 'task-details-col' });
        const docsHeader = el('div', { class: 'details-section-title' });
        docsHeader.appendChild(el('span', { text: 'Attached Documents' }));
        
        // Only Documentation Staff can upload (disabled in archive)
        if (isDocStaff && !isArchived) {
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
                this.showConfirm('Confirm Removal', `Are you sure you want to remove "${fName}" from this task?`, () => {
                  const updatedTaskDocs = t.taskDocuments.filter((_, i) => i !== dIdx);
                  DB.update('tasks', t.id, { taskDocuments: updatedTaskDocs });
                  const dmsMatch = DB.getWhere('documents', doc => 
                    doc.fileName === fName && doc.workRequestId === wr.id
                  )[0];
                  if (dmsMatch) DB.delete('documents', dmsMatch.id);
                  App.handleRoute();
                }, 'danger');
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

                  // Admin Actions: Edit/Delete (disabled in archive)
                  if (isAdmin && !isArchived) {
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
                      this.showConfirm('Delete Comment', 'Are you sure you want to delete this comment?', () => {
                        d.comments.splice(cIdx, 1);
                        DB.update('tasks', t.id, { taskDocuments: t.taskDocuments });
                        renderComments();
                        commentToggle.textContent = '💬 Comments' + (d.comments?.length ? ` (${d.comments.length})` : '');
                      }, 'danger');
                    });
                    
                    cActions.appendChild(editBtn);
                    cActions.appendChild(delBtn);
                    commentRow.appendChild(cActions);
                  }
                  list.appendChild(commentRow);
                });
              }
              commentContainer.appendChild(list);

              if (isAdmin && !isArchived) {
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

        // Time Log Section
        const timeSection = el('div', { class: 'task-details-col' });
        const timeHeader = el('div', { class: 'details-section-title' });
        timeHeader.appendChild(el('span', { text: 'Time Logs' }));
        const canLogTime = ((t.assigneeId || t.assignedTo) === Auth.user.id) && !isArchived;
        if (canLogTime) {
          const addTimeBtn = el('button', { class: 'btn btn-primary btn-xs btn-add-inline', text: '+ Add Log' });
          addTimeBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showAddTimeLogModal(t.id); });
          timeHeader.appendChild(addTimeBtn);
        }
        timeSection.appendChild(timeHeader);

        const timeList = el('div', { class: 'details-content-list' });
        const logs = t.timeLogs || [];
        if (logs.length === 0) {
          const emptyText = isArchived ? 'Archived — time logging disabled.' : 'No logs recorded.';
          timeList.appendChild(el('div', { class: 'empty-state', text: emptyText }));
        } else {
          // Sort logs: latest date first, then latest start time first
          const sortedLogs = [...logs].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
          sortedLogs.forEach(l => {
            const [y, m, d] = l.date.split('-').map(Number);
            const logDate = new Date(y, m - 1, d);
            const dateStr = logDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', weekday: 'short' });
            
            const item = el('div', { class: 'detail-item-v2', style: 'display:flex; flex-direction:column; gap:4px; margin-bottom:8px; padding-bottom:8px; border-bottom:1px solid #e2e8f0;' });
            
            const mainRow = el('div', { style: 'display:flex; justify-content:space-between; align-items:center; width:100%;' });
            mainRow.appendChild(el('span', { text: `${dateStr} • ${l.startTime} - ${l.endTime}`, style: 'font-weight:600;' }));
            mainRow.appendChild(el('span', { class: 'kpi-label', text: `${l.hours}h`, style: 'font-size:11px;' }));
            
            item.appendChild(mainRow);
            
            if (l.note) {
              item.appendChild(el('span', { text: l.note, style: 'font-size:11px; color:var(--color-text-muted); font-style:italic;' }));
            }
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
          detailsTr.classList.toggle('collapsed');
        });
      });
      table.appendChild(tbody);

      // Aligned Footer Totals
      const tfoot = el('tfoot');
      const footTr = el('tr', { style: 'font-weight: bold;' });
      for(let i=0; i<6; i++) footTr.appendChild(el('td')); // Empty placeholders (columns 1 to 6)
      footTr.appendChild(el('td', { text: formatPHP(totalAmount) })); // Est. Amount (column 7)
      footTr.appendChild(el('td', { text: `${totalHours} hrs` })); // Hours (column 8)
      tfoot.appendChild(footTr);
      table.appendChild(tfoot);

      groupEl.appendChild(table);
      listWrapper.appendChild(groupEl);
    }
    
    container.appendChild(listWrapper);

    // Related Records Panel (Section 3B.7)
    const relatedSection = el('div', { class: 'form-section', style: 'margin-top: 32px; border-top: 1px solid #e2e8f0; padding-top: 24px;' });
    relatedSection.appendChild(el('h3', { text: 'Related Financials & Documents' }));

    const grid = el('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 16px; margin-top: 16px;' });

    // Fetch related records
    const approvedInvs = DB.getWhere('invoices', inv => inv.workRequestId === wr.id || wr.linkedInvoiceId === inv.id);
    const pendingInvs = DB.getWhere('pendingChanges', pc => {
      if (pc.table !== 'invoices' || pc.status !== 'pending') return false;
      const inv = pc.proposedData;
      return inv && (inv.workRequestId === wr.id || wr.linkedInvoiceId === inv.id);
    }).map(pc => {
      const inv = deepClone(pc.proposedData);
      inv.status = 'Pending';
      inv.pendingChangeId = pc.id;
      return inv;
    });

    const seenIds = new Set();
    const invoices = [];
    [...approvedInvs, ...pendingInvs].forEach(inv => {
      if (!seenIds.has(inv.id)) {
        seenIds.add(inv.id);
        invoices.push(inv);
      }
    });

    const disbursements = DB.getWhere('disbursements', d => d.linkedWorkRequestId === wr.id || (wr.linkedDisbursementIds || []).includes(d.id));
    const transmittals = DB.getWhere('transmittals', t => t.workRequestId === wr.id || (wr.linkedTransmittalIds || []).includes(t.id));

    // Invoices Column
    const invCol = el('div', { class: 'card', style: 'padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; background: white;' });
    invCol.appendChild(el('h4', { text: '📄 Invoices / Billings', style: 'margin-bottom: 12px; color: #1e3a8a; font-size: 0.95rem; font-weight: 600; border-bottom: 2px solid #3b82f6; padding-bottom: 6px;' }));
    if (invoices.length === 0) {
      invCol.appendChild(el('p', { text: 'No linked invoices.', class: 'empty-state', style: 'font-size: 0.8125rem;' }));
    } else {
      const invList = el('div', { style: 'display: flex; flex-direction: column; gap: 8px;' });
      invoices.forEach(inv => {
        const item = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; font-size: 0.8125rem; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0;' });
        const left = el('div');
        const link = el('a', { href: 'javascript:void(0)', text: inv.invoiceNumber, style: 'color: #2563eb; font-weight: 600; text-decoration: none;' });
        link.addEventListener('click', (e) => { e.stopPropagation(); Billing.detailId = inv.id; Billing.view = 'detail'; location.hash = '#billing'; App.handleRoute(); });
        link.addEventListener('mouseenter', () => { link.style.textDecoration = 'underline'; });
        link.addEventListener('mouseleave', () => { link.style.textDecoration = 'none'; });
        left.appendChild(link);
        
        let scopeText = ' (Entire WR)';
        if (inv.linkedTaskId) {
          const task = DB.getById('tasks', inv.linkedTaskId);
          if (task) scopeText = ` (Task: ${task.title})`;
        }
        left.appendChild(el('span', { text: scopeText, style: 'color: #64748b; font-size: 0.75rem; font-style: italic;' }));
        left.appendChild(el('div', { text: `${formatDate(inv.issueDate)} • ${formatPHP(inv.total)}`, style: 'color: #64748b; font-size: 0.75rem; margin-top: 2px;' }));
        
        item.appendChild(left);
        
        let bg = '#f1f5f9';
        let fg = '#475569';
        if (inv.status === 'Paid') { bg = '#dcfce7'; fg = '#166534'; }
        else if (inv.status === 'Approved') { bg = '#dbeafe'; fg = '#1e40af'; }
        else if (inv.status === 'Sent') { bg = '#e0f2fe'; fg = '#0369a1'; }
        else if (inv.status === 'Pending') { bg = '#fef3c7'; fg = '#b45309'; }
        else if (inv.status === 'Draft') { bg = '#f1f5f9'; fg = '#475569'; }

        const stBadge = el('span', { 
          class: 'badge', 
          text: inv.status, 
          style: `font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${bg}; color: ${fg};`
        });
        item.appendChild(stBadge);
        invList.appendChild(item);
      });
      invCol.appendChild(invList);
    }
    grid.appendChild(invCol);

    // Disbursements Column
    const disbCol = el('div', { class: 'card', style: 'padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; background: white;' });
    disbCol.appendChild(el('h4', { text: '💸 Expenses / Disbursements', style: 'margin-bottom: 12px; color: #b45309; font-size: 0.95rem; font-weight: 600; border-bottom: 2px solid #f59e0b; padding-bottom: 6px;' }));
    if (disbursements.length === 0) {
      disbCol.appendChild(el('p', { text: 'No linked disbursements.', class: 'empty-state', style: 'font-size: 0.8125rem;' }));
    } else {
      const disbList = el('div', { style: 'display: flex; flex-direction: column; gap: 8px;' });
      disbursements.forEach(d => {
        const item = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; font-size: 0.8125rem; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0;' });
        const left = el('div');
        const link = el('a', { href: 'javascript:void(0)', text: d.category, style: 'color: #2563eb; font-weight: 600; text-decoration: none;' });
        link.addEventListener('click', (e) => { e.stopPropagation(); Disbursement.detailId = d.id; Disbursement.view = 'detail'; location.hash = '#disbursement'; App.handleRoute(); });
        link.addEventListener('mouseenter', () => { link.style.textDecoration = 'underline'; });
        link.addEventListener('mouseleave', () => { link.style.textDecoration = 'none'; });
        left.appendChild(link);
        
        let scopeText = ' (Entire WR)';
        if (d.linkedTaskId) {
          const task = DB.getById('tasks', d.linkedTaskId);
          if (task) scopeText = ` (Task: ${task.title})`;
        }
        left.appendChild(el('span', { text: scopeText, style: 'color: #64748b; font-size: 0.75rem; font-style: italic;' }));
        left.appendChild(el('div', { text: `${formatDate(d.submittedAt)} • ${formatPHP(d.amount)}`, style: 'color: #64748b; font-size: 0.75rem; margin-top: 2px;' }));
        
        item.appendChild(left);
        const stBadge = el('span', { 
          class: 'badge', 
          text: d.status, 
          style: `font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${d.status === 'Released' ? '#dcfce7' : d.status === 'Approved' ? '#dbeafe' : '#fef3c7'}; color: ${d.status === 'Released' ? '#166534' : d.status === 'Approved' ? '#1e40af' : '#b45309'};`
        });
        item.appendChild(stBadge);
        disbList.appendChild(item);
      });
      disbCol.appendChild(disbList);
    }
    grid.appendChild(disbCol);

    // Transmittals Column
    const transCol = el('div', { class: 'card', style: 'padding: 16px; border: 1px solid #e2e8f0; border-radius: 8px; background: white;' });
    transCol.appendChild(el('h4', { text: '📦 Transmittals', style: 'margin-bottom: 12px; color: #065f46; font-size: 0.95rem; font-weight: 600; border-bottom: 2px solid #10b981; padding-bottom: 6px;' }));
    if (transmittals.length === 0) {
      transCol.appendChild(el('p', { text: 'No linked transmittals.', class: 'empty-state', style: 'font-size: 0.8125rem;' }));
    } else {
      const transList = el('div', { style: 'display: flex; flex-direction: column; gap: 8px;' });
      transmittals.forEach(t => {
        const item = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; font-size: 0.8125rem; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0;' });
        const left = el('div');
        const link = el('a', { href: 'javascript:void(0)', text: t.trackingNumber, style: 'color: #2563eb; font-weight: 600; text-decoration: none;' });
        link.addEventListener('click', (e) => { e.stopPropagation(); Transmittal.detailId = t.id; Transmittal.view = 'detail'; location.hash = '#transmittal'; App.handleRoute(); });
        link.addEventListener('mouseenter', () => { link.style.textDecoration = 'underline'; });
        link.addEventListener('mouseleave', () => { link.style.textDecoration = 'none'; });
        left.appendChild(link);
        left.appendChild(el('div', { text: `Sent: ${formatDate(t.sentAt)}`, style: 'color: #64748b; font-size: 0.75rem; margin-top: 2px;' }));
        
        item.appendChild(left);
        const stBadge = el('span', { 
          class: 'badge', 
          text: t.status, 
          style: `font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${t.status === 'Acknowledged' ? '#dcfce7' : '#f1f5f9'}; color: ${t.status === 'Acknowledged' ? '#166534' : '#475569'};`
        });
        item.appendChild(stBadge);
        transList.appendChild(item);
      });
      transCol.appendChild(transList);
    }
    grid.appendChild(transCol);

    relatedSection.appendChild(grid);
    container.appendChild(relatedSection);

    return container;
  },

  showLinkFinancialModal(taskId) {
    const task = DB.getById('tasks', taskId);
    if (!task) return;
    const wr = DB.getById('workRequests', task.workRequestId);

    const form = el('form', { class: 'form-stacked' });
    
    // Type Select
    const typeGroup = el('div', { class: 'form-group' });
    typeGroup.appendChild(el('label', { text: 'Record Type *' }));
    const typeSel = el('select', { required: true });
    typeSel.appendChild(el('option', { value: '', text: '— Select Type —' }));
    typeSel.appendChild(el('option', { value: 'invoice', text: 'Service Invoice (Billing)' }));
    typeSel.appendChild(el('option', { value: 'disbursement', text: 'Expense / Disbursement' }));
    typeGroup.appendChild(typeSel);
    form.appendChild(typeGroup);

    // Record Select
    const recGroup = el('div', { class: 'form-group' });
    recGroup.appendChild(el('label', { text: 'Select Record *' }));
    const recSel = el('select', { required: true, disabled: true });
    recGroup.appendChild(recSel);
    form.appendChild(recGroup);

    typeSel.addEventListener('change', () => {
      recSel.innerHTML = '';
      recSel.disabled = false;
      if (typeSel.value === 'invoice') {
        const invs = DB.getWhere('invoices', inv => inv.clientId === wr.clientId && !inv.linkedTaskId);
        if (invs.length === 0) {
          recSel.appendChild(el('option', { value: '', text: 'No available invoices for this client' }));
          recSel.disabled = true;
        } else {
          invs.forEach(inv => recSel.appendChild(el('option', { value: inv.id, text: `${inv.invoiceNumber} (${formatPHP(inv.total)})` })));
        }
      } else if (typeSel.value === 'disbursement') {
        // Disbursements might not be strictly tied to client, but let's just show those not linked to a task
        const disbs = DB.getWhere('disbursements', d => !d.linkedTaskId);
        if (disbs.length === 0) {
          recSel.appendChild(el('option', { value: '', text: 'No available disbursements' }));
          recSel.disabled = true;
        } else {
          disbs.forEach(d => recSel.appendChild(el('option', { value: d.id, text: `${d.category} - ${formatPHP(d.amount)}` })));
        }
      } else {
        recSel.disabled = true;
      }
    });

    const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Link Record' });
    form.appendChild(submitBtn);

    const overlay = this.showModal('Link Financial Record', form, null);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const recId = recSel.value;
      if (!recId) return;

      if (typeSel.value === 'invoice') {
        DB.update('invoices', recId, { linkedTaskId: taskId, workRequestId: task.workRequestId });
        if (wr && !wr.linkedInvoiceId) {
          DB.update('workRequests', wr.id, { linkedInvoiceId: recId });
        }
      } else if (typeSel.value === 'disbursement') {
        DB.update('disbursements', recId, { linkedTaskId: taskId, linkedWorkRequestId: task.workRequestId });
        if (wr) {
          const linkedIds = new Set(wr.linkedDisbursementIds || []);
          linkedIds.add(recId);
          DB.update('workRequests', wr.id, { linkedDisbursementIds: Array.from(linkedIds) });
        }
      }
      overlay.remove();
      App.handleRoute();
    });
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
    
    // Date field
    const dateInput = el('input', { type: 'date', name: 'date', required: true, value: new Date().toISOString().slice(0, 10) });
    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Date *' }),
      dateInput
    ]));

    // Start Time field
    const startInput = el('input', { type: 'time', name: 'start', required: true });
    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Start Time *' }),
      startInput
    ]));

    // End Time field
    const endInput = el('input', { type: 'time', name: 'end', required: true });
    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'End Time *' }),
      endInput
    ]));

    // Note / Activity field
    const noteInput = el('input', { type: 'text', name: 'note', placeholder: 'What did you work on?', required: false });
    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Note / Activity' }),
      noteInput
    ]));

    // Hours (read-only, auto-calculated)
    const hoursInput = el('input', { type: 'text', name: 'hours', readOnly: true, value: '0.00', style: 'background: #f1f5f9; cursor: not-allowed;' });
    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Calculated Hours' }),
      hoursInput
    ]));

    // Update hours calculation dynamically
    function updateHours() {
      const start = startInput.value;
      const end = endInput.value;
      if (start && end) {
        const [sh, sm] = start.split(':').map(Number);
        const [eh, em] = end.split(':').map(Number);
        if (eh > sh || (eh === sh && em > sm)) {
          const hours = Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 4) / 4;
          hoursInput.value = hours.toFixed(2);
        } else {
          hoursInput.value = '0.00';
        }
      } else {
        hoursInput.value = '0.00';
      }
    }
    startInput.addEventListener('change', updateHours);
    endInput.addEventListener('change', updateHours);

    const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Save Log' });
    form.appendChild(submitBtn);

    const overlay = this.showModal('Add Time Log', form, null);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const dateVal = dateInput.value;
      const start = startInput.value;
      const end = endInput.value;
      const noteVal = noteInput.value;
      
      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      if (eh < sh || (eh === sh && em <= sm)) {
        this.showMessage('Routing Error', 'End time must be after start time.', 'danger');
        return;
      }
      const hours = Math.round(((eh * 60 + em) - (sh * 60 + sm)) / 60 * 4) / 4;
      const entry = {
        userId: Auth.user.id,
        startTime: start,
        endTime: end,
        date: dateVal,
        note: noteVal,
        hours
      };
      const task = DB.getById('tasks', taskId);
      
      // Guard: prevent double time log for the same day by the same user
      const alreadyLogged = (task.timeLogs || []).some(l => l.date === entry.date && l.userId === Auth.user.id);
      if (alreadyLogged) {
        this.showMessage('Warning', `You have already logged time for this task on ${dateVal}.`, 'warning');
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
    assigneeSel.appendChild(el('option', { value: 'others', text: 'Others' }));
    const assigneeOtherInput = el('input', {
      type: 'text',
      name: 'assigneeName',
      placeholder: 'Enter employee name',
      style: 'display: none; margin-top: var(--spacing-sm);'
    });
    assigneeSel.addEventListener('change', () => {
      const isOthers = assigneeSel.value === 'others';
      assigneeOtherInput.style.display = isOthers ? 'block' : 'none';
      assigneeOtherInput.required = isOthers;
      if (!isOthers) {
        assigneeOtherInput.value = '';
        assigneeOtherInput.classList.remove('input-error');
      }
    });
    assigneeGroup.appendChild(assigneeSel);
    assigneeGroup.appendChild(assigneeOtherInput);
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

    const dependencyGroup = el('div', { class: 'form-group' });
    dependencyGroup.appendChild(el('label', { text: 'Dependency' }));

    const predWrapper = el('div', { class: 'multi-select-dropdown', style: 'width: 100%;' });
    const predBtn = el('button', { type: 'button', class: 'multi-select-btn', text: '— No dependency —', style: 'width: 100%;' });
    const predMenu = el('div', { class: 'multi-select-menu', style: 'width: 100%;' });

    predWrapper.appendChild(predBtn);
    predWrapper.appendChild(predMenu);
    dependencyGroup.appendChild(predWrapper);
    form.appendChild(dependencyGroup);

    predBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.multi-select-menu.show').forEach(m => {
        if (m !== predMenu) m.classList.remove('show');
      });
      predMenu.classList.toggle('show');
    });

    predMenu.addEventListener('click', (e) => e.stopPropagation());

    const existingTasks = DB.getWhere('tasks', t => t.workRequestId === wrId);
    let selectedPreds = [];

    const updateModalSelectionText = () => {
      if (selectedPreds.includes('*')) {
        predBtn.textContent = 'All existing tasks (*)';
        predMenu.querySelectorAll('.multi-select-option input').forEach(input => {
          if (input.value !== '*') input.checked = true;
        });
      } else if (selectedPreds.length > 0) {
        const selectedLabels = selectedPreds.map(id => {
          const t = existingTasks.find(x => x.id === id);
          return t ? (t.title || 'Untitled task') : 'Task';
        });
        predBtn.textContent = selectedLabels.join(', ');
      } else {
        predBtn.textContent = '— No dependency —';
      }
    };

    if (existingTasks.length > 0) {
      const optionEl = el('label', { class: 'multi-select-option' });
      const checkbox = el('input', { type: 'checkbox', value: '*' });
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          predMenu.querySelectorAll('.multi-select-option input').forEach(input => {
            if (input !== checkbox) input.checked = true;
          });
          selectedPreds = ['*'];
        } else {
          predMenu.querySelectorAll('.multi-select-option input').forEach(input => {
            input.checked = false;
          });
          selectedPreds = [];
        }
        updateModalSelectionText();
      });
      optionEl.appendChild(checkbox);
      optionEl.appendChild(document.createTextNode('All existing tasks (*)'));
      predMenu.appendChild(optionEl);
    }

    existingTasks.forEach(t => {
      const optionEl = el('label', { class: 'multi-select-option' });
      const checkbox = el('input', { type: 'checkbox', value: t.id });
      checkbox.addEventListener('change', () => {
        if (!checkbox.checked) {
          const allCheckbox = predMenu.querySelector('input[value="*"]');
          if (allCheckbox) allCheckbox.checked = false;
          selectedPreds = selectedPreds.filter(id => id !== t.id && id !== '*');
        } else {
          if (selectedPreds.includes('*')) {
            selectedPreds = existingTasks.map(x => x.id);
            const allCheckbox = predMenu.querySelector('input[value="*"]');
            if (allCheckbox) allCheckbox.checked = false;
          }
          if (!selectedPreds.includes(t.id)) {
            selectedPreds.push(t.id);
          }
        }
        updateModalSelectionText();
      });
      optionEl.appendChild(checkbox);
      optionEl.appendChild(document.createTextNode(t.title || 'Untitled task'));
      predMenu.appendChild(optionEl);
    });

    const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Add Task' });
    form.appendChild(submitBtn);

    const overlay = this.showModal('Add New Task', form, null);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validateRequiredFields(form)) return;
      if (assigneeSel.value === 'others' && !assigneeOtherInput.value.trim()) {
        assigneeOtherInput.classList.add('input-error');
        assigneeOtherInput.focus();
        this.showMessage('Validation Error', 'Please enter an employee name.', 'danger');
        return;
      }
      assigneeOtherInput.classList.remove('input-error');
      const data = Object.fromEntries(new FormData(form).entries());
      const isManualAssignee = data.assigneeId === 'others';
      const allExistingIds = existingTasks.map(t => t.id);
      const predecessors = selectedPreds.includes('*') ? allExistingIds : selectedPreds;

      const newTask = {
        id: generateId('t'),
        workRequestId: wrId,
        title: data.title.trim(),
        assigneeId: isManualAssignee ? null : (data.assigneeId || null),
        assigneeName: isManualAssignee ? (data.assigneeName?.trim() || null) : null,
        status: (isManualAssignee || data.assigneeId) ? 'Assigned' : 'Draft',
        priority: data.priority || 'Normal',
        dueDate: data.dueDate || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        predecessors,
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

    const phaseColors = {
      'Draft': '#94a3b8',
      'Pre-processing': '#3b82f6',
      'Processing': '#f59e0b',
      'Billing': '#a855f7',
      'Disbursement': '#6366f1',
      'Completed': '#10b981',
      'Cancelled': '#ef4444'
    };
    const activeColor = phaseColors[status] || '#94a3b8';

    const wrapper = el('div', { class: 'modern-progress-wrapper' });
    const track = el('div', { class: 'modern-progress-track' });

    // Calculate fill width
    const fillPercent = (current / (stages.length - 1)) * 100;
    const fill = el('div', { class: 'modern-progress-fill', style: `width: ${fillPercent}%; background: ${activeColor};` });
    track.appendChild(fill);

    stages.forEach((s, i) => {
      const step = el('div', { class: 'modern-progress-step' });
      const dot = el('div', { class: 'modern-progress-dot' });
      if (i <= current) {
        dot.classList.add('completed');
        dot.style.background = activeColor;
        dot.style.borderColor = activeColor;
      }
      if (i === current) {
        dot.classList.add('active');
        dot.style.borderColor = activeColor;
        dot.style.boxShadow = `0 0 0 4px ${activeColor}33`;
      }

      const label = el('div', { class: 'modern-progress-label', text: s });
      if (i === current) {
        label.classList.add('active');
        label.style.color = activeColor;
      }

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
      return { error: 'Dependency tasks must be completed first.' };
    }

    const now = new Date().toISOString();
    const cascaded = [];

    if (newStatus === 'Cancelled') {
      // Recursively cancel all downstream dependents (full dependency chain)
      const toCancel = new Set();
      const queue = [taskId];
      const visited = new Set();

      while (queue.length > 0) {
        const currentId = queue.shift();
        if (visited.has(currentId)) continue;
        visited.add(currentId);

        const dependents = DB.getWhere('tasks', t =>
          (t.predecessors || t.dependencies || []).includes(currentId)
        );

        dependents.forEach(d => {
          if (d.status !== 'Completed' && d.status !== 'Cancelled' && d.id !== taskId) {
            toCancel.add(d.id);
          }
          if (!visited.has(d.id)) {
            queue.push(d.id);
          }
        });
      }

      toCancel.forEach(id => {
        DB.update('tasks', id, { status: 'Cancelled', updatedAt: now });
        cascaded.push(id);
      });
    }

    DB.update('tasks', taskId, { status: newStatus, updatedAt: now });
    return { success: true, cascaded };
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

    const wrapper = el('div', { class: 'page' });

    // Breadcrumb Title Bar
    const titleBar = el('div', { class: 'page-title-bar-v2' });
    const h1 = el('h1', { class: 'breadcrumb-h1' });
    const opLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Operations' });
    opLink.addEventListener('click', () => { this.view = 'list'; this.templateEditingId = null; App.handleRoute(); });
    h1.appendChild(opLink);
    h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
    h1.appendChild(document.createTextNode('Retainer Templates'));
    titleBar.appendChild(h1);

    const backBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to List' });
    backBtn.addEventListener('click', () => { this.view = 'list'; this.templateEditingId = null; App.handleRoute(); });
    titleBar.appendChild(backBtn);
    wrapper.appendChild(titleBar);

    const actions = el('div', { class: 'actions-bar' });
    const addBtn = el('button', { class: 'btn btn-primary', text: 'Create Template' });
    addBtn.addEventListener('click', () => { this.view = 'templateForm'; this.templateEditingId = null; App.handleRoute(); });
    actions.appendChild(addBtn);
    wrapper.appendChild(actions);

    if (templates.length === 0) {
      wrapper.appendChild(el('p', { class: 'empty-state', text: 'No retainer templates found.' }));
      return wrapper;
    }

    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Template', 'Client', 'Schedule', 'Professional Fee Amount', 'Tasks', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
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
    const container = el('div', { class: 'page' });

    // Breadcrumb Title Bar
    const titleBar = el('div', { class: 'page-title-bar-v2' });
    const h1 = el('h1', { class: 'breadcrumb-h1' });
    const opLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Operations' });
    opLink.addEventListener('click', () => { this.view = 'list'; this.templateEditingId = null; App.handleRoute(); });
    h1.appendChild(opLink);
    h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
    
    const tplLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Templates' });
    tplLink.addEventListener('click', () => { this.view = 'templates'; this.templateEditingId = null; App.handleRoute(); });
    h1.appendChild(tplLink);
    h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
    
    h1.appendChild(document.createTextNode(template ? template.name : 'Create Template'));
    titleBar.appendChild(h1);

    const backBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to Templates' });
    backBtn.addEventListener('click', () => { this.view = 'templates'; this.templateEditingId = null; App.handleRoute(); });
    titleBar.appendChild(backBtn);
    container.appendChild(titleBar);

    const form = el('form', { id: 'template-form', class: 'form-stacked' });

    const headerBar = el('div', { class: 'form-header-bar' });
    headerBar.appendChild(el('h3', { text: template ? 'Edit Template Details' : 'Template Details' }));

    const topActions = el('div', { class: 'form-actions-top' });
    const saveBtn = el('button', { type: 'submit', form: 'template-form', class: 'btn btn-primary', text: 'Save Template' });
    topActions.appendChild(saveBtn);
    
    if (template) {
      const delBtn = el('button', { type: 'button', class: 'btn btn-danger', text: 'Delete', style: 'margin-left: 8px;' });
      delBtn.addEventListener('click', () => {
        this.showConfirm('Delete Template', 'Are you sure you want to delete this template?', () => {
          DB.delete('retainerTemplates', template.id);
          this.view = 'templates'; 
          this.templateEditingId = null; 
          App.handleRoute();
        }, 'danger');
      });
      topActions.appendChild(delBtn);
    }

    headerBar.appendChild(topActions);
    form.appendChild(headerBar);

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
      if (!this.validateManualAssignees(form)) return;
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
      const assigneeSel = row.querySelector('.task-assignee');
      const assigneeOtherInput = row.querySelector('.task-assignee-other');
      const isManualAssignee = assigneeSel?.value === 'others';
      const predKeysStr = row.dataset.predKeys || '';
      const predecessorKeys = predKeysStr.split(',').filter(Boolean);
      tasks.push({
        key: row.dataset.taskKey || generateId('tmp'),
        title,
        assigneeId: isManualAssignee ? null : (assigneeSel?.value || null),
        assigneeName: isManualAssignee ? (assigneeOtherInput?.value.trim() || null) : null,
        predecessorKeys: predecessorKeys
      });
    });

    const cycleCheck = tasks.map((t, i) => {
      let preds = [];
      if (t.predecessorKeys.includes('*')) {
        preds = tasks.slice(0, i).map(pt => pt.key);
      } else {
        preds = t.predecessorKeys;
      }
      return { id: t.key, predecessors: preds };
    });
    if (this.detectCycle(cycleCheck)) {
      this.showMessage('Dependency Error', 'Template tasks contain a cycle. Please fix before saving.', 'danger');
      return;
    }

    const idMap = new Map();
    tasks.forEach(t => idMap.set(t.key, generateId('rtt')));

    const resolvePredecessors = (t, i) => {
      if (t.predecessorKeys.includes('*')) {
        return tasks.slice(0, i).map(pt => idMap.get(pt.key)).filter(Boolean);
      }
      return t.predecessorKeys.map(k => idMap.get(k)).filter(Boolean);
    };

    const taskRecords = tasks.map((t, i) => ({
      id: idMap.get(t.key),
      title: t.title,
      assigneeId: t.assigneeId || null,
      assigneeName: t.assigneeName || null,
      predecessors: resolvePredecessors(t, i)
    }));

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

  renderArchive() {
    const entity = Auth.activeEntity;
    const isManagerial = Auth.user.role === 'Admin' || Auth.user.role === 'Manager';
    const archived = DB.getWhere('workRequests', wr => wr.entity === entity && wr.status === 'Cancelled');

    const container = el('div', { class: 'page' });
    const titleBar = el('div', { class: 'page-title-bar-v2' });
    const h1 = el('h1', { class: 'breadcrumb-h1' });
    const baseLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Operations' });
    baseLink.addEventListener('click', () => { this.view = 'list'; App.handleRoute(); });
    h1.appendChild(baseLink);
    h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
    h1.appendChild(document.createTextNode('Archive'));
    titleBar.appendChild(h1);

    const backBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to Work Requests' });
    backBtn.addEventListener('click', () => { this.view = 'list'; App.handleRoute(); });
    titleBar.appendChild(backBtn);
    container.appendChild(titleBar);

    if (archived.length === 0) {
      container.appendChild(el('p', { text: 'Archive is empty.', class: 'empty-state' }));
      return container;
    }

    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Title', 'Client', 'Priority', 'Status', 'Cancelled At', 'Actions'].forEach(h => thr.appendChild(el('th', { text: h })));
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = el('tbody');
    archived.forEach(wr => {
      const client = DB.getById('clients', wr.clientId);
      const tr = el('tr');
      tr.appendChild(el('td', { text: wr.title }));
      tr.appendChild(el('td', { text: client?.name || '—' }));
      tr.appendChild(el('td', { text: wr.priority || '—' }));
      tr.appendChild(el('td')).appendChild(this.statusBadge(wr.status));
      tr.appendChild(el('td', { text: formatDate(wr.updatedAt) }));
      const tdAct = el('td');
      const viewBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { this.view = 'detail'; this.detailWrId = wr.id; App.handleRoute(); });
      tdAct.appendChild(viewBtn);
      if (isManagerial) {
        const restoreBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Restore', style: 'margin-left:4px;' });
        restoreBtn.addEventListener('click', () => {
          this.showConfirm('Restore Work Request',
            `Restore "${wr.title}" to Draft? All tasks will remain Cancelled and must be reassigned manually.`,
            () => {
              DB.update('workRequests', wr.id, { status: 'Draft', updatedAt: new Date().toISOString() });
              App.handleRoute();
            }, 'warning');
        });
        tdAct.appendChild(restoreBtn);
      }
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);

    return container;
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
        assigneeName: t.assigneeName || null,
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
