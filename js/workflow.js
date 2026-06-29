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
  expandedTaskIds: new Set(),
  lastRenderedWrId: null,

  standardTaskTemplates: [
    { title: 'Gathering requirements and preparing documents for preprocessing', defaultChecklist: ['SEC Certificate', 'Articles of Incorporation', "Mayor's Permit", 'BIR Form 1901/1903'] },
    { title: 'Gather requirements and prepare documents needed for processing', defaultChecklist: ['SEC Certificate', "Mayor's Permit", 'BIR Form 1901/1903', 'Articles of Incorporation'], coAssignees: ['Employee 1', 'Employee 2', 'Employee 3'] },
    { title: 'Creation of ORUS account', defaultChecklist: [] },
    { title: 'Registration of Books of Accounts', defaultChecklist: [] },
    { title: 'Application and Received of Authority to Print', defaultChecklist: [] },
    { title: 'Pickup of Sales/Service Invoice', defaultChecklist: [] },
    { title: 'Billing', defaultChecklist: [] },
    { title: 'Disbursement', defaultChecklist: [] },
    { title: 'Transmittal', defaultChecklist: [] }
  ],

  /**
   * Builds a typable employee assignee dropdown like the filter tray.
   * Existing ground workers are offered; typing a new name shows an
   * "Add employee: X" option and auto-registers it on selection/Enter/blur.
   * Returns the dropdown wrapper. `onChange` receives { assigneeId: null, assigneeName }.
   */
  createGroundWorkerDropdown({ selectedGroundWorkerName, onChange, placeholder = 'Employee...', maxWidth, className, priorityNames = [] } = {}) {
    const prioritySet = new Set((priorityNames || []).filter(Boolean));

    const buildOptions = () => {
      const groundWorkers = (DB.getAll('groundWorkers') || []);
      const existingNames = new Set(groundWorkers.map(gw => gw.name));
      const allNames = new Set([...existingNames, ...prioritySet]);

      const sortedNames = Array.from(allNames).sort((a, b) => a.localeCompare(b));
      const priority = sortedNames.filter(n => prioritySet.has(n));
      const others = sortedNames.filter(n => !prioritySet.has(n));

      const options = [];
      priority.forEach(name => {
        const gw = groundWorkers.find(g => g.name === name);
        options.push({ value: gw ? gw.id : name, text: name });
      });
      others.forEach(name => {
        const gw = groundWorkers.find(g => g.name === name);
        options.push({ value: gw.id, text: name });
      });
      return options;
    };

    const dropdown = createSearchableDropdown({
      placeholder,
      options: buildOptions(),
      allowFreeText: true,
      maxWidth,
      addNewLabel: (text) => `Add employee: ${text}`
    });
    if (className) dropdown.classList.add(className);

    let lastAppliedName = (selectedGroundWorkerName || '').trim();

    const applyValue = () => {
      const val = dropdown.value;
      const text = dropdown.searchText.trim();
      let name = '';
      if (val) {
        const gw = (DB.getAll('groundWorkers') || []).find(g => g.id === val);
        name = gw ? gw.name : val;
      } else if (text) {
        name = text;
      }
      if (name === lastAppliedName) return;
      if (name) {
        const existing = (DB.getAll('groundWorkers') || []).find(gw => gw.name.toLowerCase() === name.toLowerCase());
        if (!existing) {
          DB.insert('groundWorkers', { id: generateId('gw'), name });
        }
      }
      lastAppliedName = name;
      onChange({ assigneeId: null, assigneeName: name || null });
    };

    dropdown.value = selectedGroundWorkerName || '';

    const input = dropdown.querySelector('input');
    let blurTimeout;
    const cancelBlurCommit = () => { if (blurTimeout) clearTimeout(blurTimeout); };

    // Apply only on explicit selection, Enter, or blur — not on every keystroke.
    dropdown.addEventListener('change', () => {
      cancelBlurCommit();
      applyValue();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        cancelBlurCommit();
        applyValue();
      }
    });
    input.addEventListener('blur', () => {
      cancelBlurCommit();
      blurTimeout = setTimeout(applyValue, 150);
    });
    input.addEventListener('focus', cancelBlurCommit);

    return dropdown;
  },

  // ============================================================
  // Phase Transition Logic (Robust Business Accounting Logic)
  // ============================================================
  getPhaseTransitionStatus(wrId) {
    let wr = DB.getById('workRequests', wrId);
    if (!wr) {
      const pc = DB.getById('pendingChanges', wrId) || 
                 DB.getWhere('pendingChanges', p => p.proposedData && p.proposedData.id === wrId)[0];
      if (pc && pc.table === 'workRequests') {
        return { canTransition: false, reason: 'This Work Request is currently staged and awaiting administrator approval.' };
      }
      return null;
    }
    
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
        const wrAssigned = !!wr.assignedTo;
        const allTasksAssigned = tasks.length > 0 && tasks.every(t => t.assigneeId || t.assignedTo || t.assigneeName);
        if (!wrAssigned && !allTasksAssigned) {
          canTransition = false;
          missing.push('Employee assignment');
        }
        // Rule 1: Requires signed proposal/retainer placeholder
        if (!tasks.some(t => t.taskDocuments?.length > 0)) { 
            // In real world, we'd check for a specific 'Proposal' doc type
        }
        break;

      case 'Pre-processing':
        // Rule 2: All requirements gathered
        const reqTasks = tasks.filter(t => t.title.toLowerCase().includes('requirement') || t.title.toLowerCase().includes('gather'));
        reqTasks.forEach(t => {
          if (t.status !== 'Completed') {
            canTransition = false;
            const incompleteNames = getIncompleteChecklistNames(t);
            if (incompleteNames.length > 0) {
              missing.push(`Requirement task "${t.title}" is blocked: ${incompleteNames.join(', ')}`);
            } else {
              missing.push(`Requirement task "${t.title}" is not completed`);
            }
          }
        });
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
    // Prevent duplicate modals with the same title
    const existing = Array.from(document.querySelectorAll('.modal-overlay')).find(o => {
      const titleEl = o.querySelector('.modal-title');
      return titleEl && titleEl.textContent.trim() === title.trim();
    });
    if (existing) return existing;

    const overlay = el('div', { class: 'modal-overlay' });
    const modal = el('div', { class: 'modal' });
    const header = el('div', { class: 'modal-header' });
    header.appendChild(el('h3', { class: 'modal-title', text: title }));
    const closeBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '✕' });
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

  /**
   * Open a modal with the full billing/invoice creation form,
   * pre-populated from the given work request.
   */
  openGenerateBillingModal(wr, preselectedTask) {
    const entity = Auth.activeEntity;
    const client = DB.getById('clients', wr.clientId);
    const tasks = DB.getWhere('tasks', t => t.workRequestId === wr.id);

    const wrapper = el('div', { style: 'display: flex; flex-direction: column; gap: 16px;' });
    const form = el('form', { id: 'gen-billing-form' });

    // ---------- Client (read-only, auto-filled) ----------
    const clientGroup = el('div', { class: 'form-group' });
    clientGroup.appendChild(el('label', { text: 'Client' }));
    const clientDisplay = el('input', {
      type: 'text',
      value: client ? client.name : '—',
      readonly: true,
      style: 'background: #f1f5f9; cursor: default;'
    });
    clientGroup.appendChild(clientDisplay);
    // hidden field so FormData picks it up
    clientGroup.appendChild(el('input', { type: 'hidden', name: 'clientId', value: wr.clientId || '' }));
    form.appendChild(clientGroup);

    // ---------- Work Request (read-only, auto-filled) ----------
    const wrGroup = el('div', { class: 'form-group' });
    wrGroup.appendChild(el('label', { text: 'Work Request' }));
    const wrDisplay = el('input', {
      type: 'text',
      value: wr.title || '—',
      readonly: true,
      style: 'background: #f1f5f9; cursor: default;'
    });
    wrGroup.appendChild(wrDisplay);
    wrGroup.appendChild(el('input', { type: 'hidden', name: 'workRequestId', value: wr.id }));
    form.appendChild(wrGroup);

    // ---------- Task link (optional) ----------
    if (tasks.length > 0) {
      const taskGroup = el('div', { class: 'form-group' });
      taskGroup.appendChild(el('label', { text: 'Link to Specific Task' }));
      const taskSel = el('select', { name: 'linkedTaskId' });
      taskSel.appendChild(el('option', { value: '', text: '— Whole Project —' }));
      tasks.forEach(t => {
        const opt = el('option', { value: t.id, text: t.title });
        if (preselectedTask && preselectedTask.id === t.id) opt.selected = true;
        taskSel.appendChild(opt);
      });
      taskGroup.appendChild(taskSel);
      form.appendChild(taskGroup);
    }

    // ---------- Dates ----------
    const dateRow = el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: 12px;' });

    const issueDateGroup = el('div', { class: 'form-group' });
    issueDateGroup.appendChild(el('label', { text: 'Issue Date *' }));
    issueDateGroup.appendChild(el('input', {
      type: 'date', name: 'issueDate',
      value: new Date().toISOString().slice(0, 10),
      required: true
    }));
    dateRow.appendChild(issueDateGroup);

    const dueDateGroup = el('div', { class: 'form-group' });
    dueDateGroup.appendChild(el('label', { text: 'Due Date *' }));
    dueDateGroup.appendChild(el('input', {
      type: 'date', name: 'dueDate',
      value: '', required: true
    }));
    dateRow.appendChild(dueDateGroup);
    form.appendChild(dateRow);

    // ---------- Invoice Number (auto-generated, read-only) ----------
    const numGroup = el('div', { class: 'form-group' });
    numGroup.appendChild(el('label', { text: 'Invoice Number' }));
    numGroup.appendChild(el('input', {
      type: 'text', name: 'invoiceNumber',
      value: Billing.nextInvoiceNumber(entity),
      readonly: true,
      style: 'background: #f1f5f9; cursor: default;'
    }));
    form.appendChild(numGroup);

    // ---------- Line Items ----------
    const itemsSection = el('div', { class: 'form-section', style: 'margin-top: 4px;' });
    itemsSection.appendChild(el('h4', { text: 'Line Items', style: 'margin-bottom: 8px; font-size: 0.9rem;' }));
    const itemsList = el('div', { id: 'modal-line-item-rows' });
    itemsSection.appendChild(itemsList);

    const recalcModalTotals = () => {
      const rows = itemsList.querySelectorAll('.line-item-row');
      let subtotal = 0;
      rows.forEach(row => {
        subtotal += parseFloat(row.querySelector('.item-amt').value) || 0;
      });
      const subEl = form.querySelector('#modal-inv-subtotal');
      const totEl = form.querySelector('#modal-inv-total');
      if (subEl) subEl.textContent = formatPHP(subtotal);
      if (totEl) totEl.textContent = formatPHP(subtotal);
    };

    const addModalLineItem = (item) => {
      const row = el('div', { class: 'line-item-row' });
      const typeSel = el('select', { class: 'item-type' });
      ['Professional Fee', 'Government Fee'].forEach(t => {
        const opt = el('option', { value: t, text: t });
        if (item?.type === t) opt.selected = true;
        typeSel.appendChild(opt);
      });
      row.appendChild(typeSel);
      row.appendChild(el('input', { type: 'text', placeholder: 'Description', class: 'item-desc', value: item?.description || '' }));
      row.appendChild(el('input', { type: 'number', placeholder: 'Amount', class: 'item-amt', value: item?.amount || '', min: 0, step: 0.01 }));
      const removeBtn = el('button', { type: 'button', class: 'btn btn-danger btn-sm', text: '×' });
      removeBtn.addEventListener('click', () => { row.remove(); recalcModalTotals(); });
      row.appendChild(removeBtn);
      itemsList.appendChild(row);
    };

    // Default line items
    addModalLineItem({ type: 'Professional Fee', description: '', amount: '' });
    addModalLineItem({ type: 'Government Fee', description: '', amount: '' });

    const addItemBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '+ Add Line Item', style: 'margin-top: 6px;' });
    addItemBtn.addEventListener('click', () => addModalLineItem());
    itemsSection.appendChild(addItemBtn);
    form.appendChild(itemsSection);

    // ---------- Totals ----------
    const totals = el('div', { style: 'display: flex; flex-direction: column; gap: 4px; align-items: flex-end; margin-top: 8px; padding: 12px; background: #f8fafc; border-radius: 8px;' });
    const subRow = el('div', { style: 'display: flex; gap: 12px; font-size: 0.85rem; color: #64748b;' });
    subRow.appendChild(el('span', { text: 'Subtotal:' }));
    subRow.appendChild(el('span', { id: 'modal-inv-subtotal', text: '₱0.00' }));
    totals.appendChild(subRow);
    const grandRow = el('div', { style: 'display: flex; gap: 12px; font-size: 1rem; font-weight: 700; color: #1e293b;' });
    grandRow.appendChild(el('span', { text: 'Total:' }));
    grandRow.appendChild(el('span', { id: 'modal-inv-total', text: '₱0.00' }));
    totals.appendChild(grandRow);
    form.appendChild(totals);

    // Live recalculation
    form.addEventListener('input', () => recalcModalTotals());

    wrapper.appendChild(form);

    // ---------- Footer buttons ----------
    const footer = el('div', { style: 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;' });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel' });
    const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: 'Save Invoice' });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    wrapper.appendChild(footer);

    // Open modal
    const overlay = this.showModal('Generate Billing', wrapper);
    overlay.querySelector('.modal').classList.add('modal-wide');

    cancelBtn.addEventListener('click', () => overlay.remove());

    saveBtn.addEventListener('click', () => {
      // Basic validation
      const issueDate = form.querySelector('[name="issueDate"]').value;
      const dueDate = form.querySelector('[name="dueDate"]').value;
      if (!issueDate || !dueDate) {
        this.showMessage('Validation Error', 'Please fill in both Issue Date and Due Date.', 'warning');
        return;
      }

      const data = Object.fromEntries(new FormData(form).entries());
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

      const record = {
        id: generateId('inv'),
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
        status: 'Draft',
        payments: [],
        createdBy: Auth.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      DB.insert('invoices', record);

      // Link invoice back to WR
      if (data.workRequestId) {
        const linkedWr = DB.getById('workRequests', data.workRequestId);
        if (linkedWr) {
          DB.update('workRequests', linkedWr.id, { linkedInvoiceId: record.id });
        }
      }

      overlay.remove();

      this.showMessage(
        'Invoice Created',
        'Invoice ' + record.invoiceNumber + ' has been created successfully and linked to "' + wr.title + '".',
        'success'
      );

      // Refresh WR detail
      App.handleRoute();
    });
  },

  /**
   * Open a modal with the disbursement/expense creation form,
   * pre-populated from the given work request.
   */
  openGenerateDisbursementModal(wr, preselectedTask) {
    const entity = Auth.activeEntity;
    const client = DB.getById('clients', wr.clientId);
    const tasks = DB.getWhere('tasks', t => t.workRequestId === wr.id);

    const wrapper = el('div', { style: 'display: flex; flex-direction: column; gap: 16px;' });
    const form = el('form', { id: 'gen-disbursement-form' });

    // ---------- Client (read-only, auto-filled) ----------
    const clientGroup = el('div', { class: 'form-group' });
    clientGroup.appendChild(el('label', { text: 'Client' }));
    clientGroup.appendChild(el('input', {
      type: 'text',
      value: client ? client.name : '—',
      readonly: true,
      style: 'background: #f1f5f9; cursor: default;'
    }));
    form.appendChild(clientGroup);

    // ---------- Work Request (read-only, auto-filled) ----------
    const wrGroup = el('div', { class: 'form-group' });
    wrGroup.appendChild(el('label', { text: 'Work Request' }));
    wrGroup.appendChild(el('input', {
      type: 'text',
      value: wr.title || '—',
      readonly: true,
      style: 'background: #f1f5f9; cursor: default;'
    }));
    wrGroup.appendChild(el('input', { type: 'hidden', name: 'linkedWorkRequestId', value: wr.id }));
    form.appendChild(wrGroup);

    // ---------- Task link (optional) ----------
    if (tasks.length > 0) {
      const taskGroup = el('div', { class: 'form-group' });
      taskGroup.appendChild(el('label', { text: 'Link to Specific Task' }));
      const taskSel = el('select', { name: 'linkedTaskId' });
      taskSel.appendChild(el('option', { value: '', text: '— Whole Project —' }));
      tasks.forEach(t => {
        const opt = el('option', { value: t.id, text: t.title });
        if (preselectedTask && preselectedTask.id === t.id) opt.selected = true;
        taskSel.appendChild(opt);
      });
      taskGroup.appendChild(taskSel);
      form.appendChild(taskGroup);
    }

    // ---------- Category ----------
    const catGroup = el('div', { class: 'form-group' });
    catGroup.appendChild(el('label', { text: 'Category *' }));
    const catSel = el('select', { name: 'category', required: true, class: 'form-select' });
    ['Transportation', 'Notary', 'Meals', 'Government Fee', 'Other'].forEach(c => {
      catSel.appendChild(el('option', { value: c, text: c }));
    });
    catGroup.appendChild(catSel);
    form.appendChild(catGroup);

    // ---------- Description ----------
    const descGroup = el('div', { class: 'form-group' });
    descGroup.appendChild(el('label', { text: 'Description *' }));
    descGroup.appendChild(el('input', { type: 'text', name: 'description', required: true, placeholder: 'e.g. BIR filing fee' }));
    form.appendChild(descGroup);

    // ---------- Amount ----------
    const amtGroup = el('div', { class: 'form-group' });
    amtGroup.appendChild(el('label', { text: 'Amount (₱) *' }));
    const amtIn = el('input', { type: 'text', inputmode: 'decimal', name: 'amount', placeholder: '0.00', required: true });
    amtIn.addEventListener('input', () => { amtIn.value = amtIn.value.replace(/[^0-9.,]/g, ''); });
    amtIn.addEventListener('focus', () => { const n = parseFloat(String(amtIn.value).replace(/[₱$,\s]/g, '')) || 0; amtIn.value = n > 0 ? String(n) : ''; });
    amtIn.addEventListener('blur', () => { const n = parseFloat(String(amtIn.value).replace(/[₱$,\s]/g, '')) || 0; amtIn.value = n > 0 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''; });
    amtGroup.appendChild(amtIn);
    form.appendChild(amtGroup);

    // ---------- Fund Source ----------
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

    // ---------- Linked Invoice (visible only for Client Fund) ----------
    const invGroup = el('div', { class: 'form-group hidden', id: 'modal-linked-invoice-group' });
    invGroup.appendChild(el('label', { text: 'Linked Billing Invoice' }));
    const invSel = el('select', { name: 'linkedInvoiceId', class: 'form-select' });
    invSel.appendChild(el('option', { value: '', text: '— Select Invoice —' }));
    DB.getWhere('invoices', inv => inv.entity === entity && inv.status !== 'Cancelled').forEach(inv => {
      const invClient = DB.getById('clients', inv.clientId);
      invSel.appendChild(el('option', { value: inv.id, text: inv.invoiceNumber + ' — ' + (invClient?.name || '—') }));
    });
    invGroup.appendChild(invSel);
    form.appendChild(invGroup);

    // Toggle linked invoice visibility
    form.querySelectorAll('input[name="fundSource"]').forEach(r => {
      r.addEventListener('change', () => {
        const isClient = form.querySelector('input[name="fundSource"]:checked')?.value === 'Client Fund';
        invGroup.classList.toggle('hidden', !isClient);
      });
    });

    // ---------- Receipt (optional) ----------
    const receiptGroup = el('div', { class: 'form-group' });
    receiptGroup.appendChild(el('label', { text: 'Receipt (optional)' }));
    receiptGroup.appendChild(el('input', { type: 'file', name: 'receipt' }));
    form.appendChild(receiptGroup);

    wrapper.appendChild(form);

    // ---------- Footer buttons ----------
    const footer = el('div', { style: 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;' });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel' });
    const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: 'Submit Expense' });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    wrapper.appendChild(footer);

    // Open modal
    const overlay = this.showModal('Generate Disbursement', wrapper);

    cancelBtn.addEventListener('click', () => overlay.remove());

    saveBtn.addEventListener('click', () => {
      // Validation
      const desc = form.querySelector('[name="description"]').value.trim();
      const amtVal = form.querySelector('[name="amount"]').value;
      if (!desc) {
        this.showMessage('Validation Error', 'Please enter a description.', 'warning');
        return;
      }
      const amount = parseFloat(String(amtVal).replace(/[₱$,\s]/g, '')) || 0;
      if (amount <= 0) {
        this.showMessage('Validation Error', 'Please enter a valid amount.', 'warning');
        return;
      }

      const data = Object.fromEntries(new FormData(form).entries());
      const receiptInput = form.querySelector('input[name="receipt"]');
      const receiptFile = receiptInput?.files?.[0];

      const record = {
        id: generateId('d'),
        category: data.category,
        description: desc,
        amount: amount,
        fundSource: data.fundSource,
        linkedInvoiceId: data.linkedInvoiceId || null,
        linkedWorkRequestId: data.linkedWorkRequestId || null,
        linkedTaskId: data.linkedTaskId || null,
        entity: entity,
        employeeId: Auth.user.id,
        requestedBy: Auth.user.id,
        status: 'Submitted',
        submittedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        receiptFilename: receiptFile ? receiptFile.name : null
      };

      DB.insert('disbursements', record);

      // Link disbursement back to WR
      if (record.linkedWorkRequestId) {
        const linkedWr = DB.getById('workRequests', record.linkedWorkRequestId);
        if (linkedWr) {
          const linkedIds = new Set(linkedWr.linkedDisbursementIds || []);
          linkedIds.add(record.id);
          DB.update('workRequests', linkedWr.id, { linkedDisbursementIds: Array.from(linkedIds) });
        }
      }

      overlay.remove();

      this.showMessage(
        'Expense Filed',
        'Disbursement for ' + data.category + ' (₱' + amount.toLocaleString('en-US', { minimumFractionDigits: 2 }) + ') has been submitted and linked to "' + wr.title + '".',
        'success'
      );

      // Refresh WR detail
      App.handleRoute();
    });
  },

  /**
   * Open a modal with the transmittal creation form,
   * pre-populated from the given work request.
   */
  openGenerateTransmittalModal(wr, preselectedTask = null, prefilledRequestId = null) {
    const entity = Auth.activeEntity;
    const client = DB.getById('clients', wr.clientId);

    const wrapper = el('div', { style: 'display: flex; flex-direction: column; gap: 16px;' });
    const form = el('form', { id: 'gen-transmittal-form' });

    // ---------- Client (read-only, auto-filled) ----------
    const clientGroup = el('div', { class: 'form-group' });
    clientGroup.appendChild(el('label', { text: 'Client' }));
    clientGroup.appendChild(el('input', {
      type: 'text',
      value: client ? client.name : '—',
      readonly: true,
      style: 'background: #f1f5f9; cursor: default;'
    }));
    clientGroup.appendChild(el('input', { type: 'hidden', name: 'clientId', value: wr.clientId || '' }));
    form.appendChild(clientGroup);

    // ---------- Work Request (read-only, auto-filled) ----------
    const wrGroup = el('div', { class: 'form-group' });
    wrGroup.appendChild(el('label', { text: 'Work Request' }));
    wrGroup.appendChild(el('input', {
      type: 'text',
      value: wr.title || '—',
      readonly: true,
      style: 'background: #f1f5f9; cursor: default;'
    }));
    wrGroup.appendChild(el('input', { type: 'hidden', name: 'workRequestId', value: wr.id }));
    form.appendChild(wrGroup);

    // ---------- Tracking Number (auto-generated, read-only) ----------
    const tnGroup = el('div', { class: 'form-group' });
    tnGroup.appendChild(el('label', { text: 'Tracking Number' }));
    tnGroup.appendChild(el('input', {
      type: 'text', name: 'trackingNumber',
      value: Transmittal.generateTrackingNumber(entity),
      readonly: true,
      style: 'background: #f1f5f9; cursor: default;'
    }));
    form.appendChild(tnGroup);

    // ---------- Itemized Document List ----------
    const itemsSection = el('div', { class: 'form-section', style: 'margin-top: 4px;' });
    itemsSection.appendChild(el('h4', { text: 'Document Items', style: 'margin-bottom: 8px; font-size: 0.9rem;' }));

    // Column headers
    const headerLabelStyle = 'font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; padding-left: 13px;';
    const colHeaders = el('div', { class: 'line-item-row', style: 'margin-bottom: 4px; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px;' });
    colHeaders.appendChild(el('span', { text: 'Document Type', class: 'item-type', style: headerLabelStyle }));
    colHeaders.appendChild(el('span', { text: 'Description', class: 'item-desc', style: headerLabelStyle }));
    colHeaders.appendChild(el('span', { class: 'btn btn-sm', style: 'visibility: hidden;', text: '×' }));
    itemsSection.appendChild(colHeaders);

    const itemsList = el('div', { id: 'modal-transmittal-item-rows' });
    itemsSection.appendChild(itemsList);

    const addTransmittalItem = (item) => {
      const row = el('div', { class: 'line-item-row' });

      const typeSel = el('select', { class: 'item-type' });
      ['Original Scan', 'Generated Copy', 'Government Receipt', 'Final Deliverable', 'Other'].forEach(t => {
        const opt = el('option', { value: t, text: t });
        if (item?.documentType === t) opt.selected = true;
        typeSel.appendChild(opt);
      });
      row.appendChild(typeSel);

      row.appendChild(el('input', { type: 'text', placeholder: 'Description', class: 'item-desc', value: item?.description || '' }));

      const removeBtn = el('button', { type: 'button', class: 'btn btn-danger btn-sm', text: '×' });
      removeBtn.addEventListener('click', () => {
        if (itemsList.querySelectorAll('.line-item-row').length > 1) {
          row.remove();
        }
      });
      row.appendChild(removeBtn);

      itemsList.appendChild(row);
    };

    // Retrieve operations request if fulfilling
    const opReq = prefilledRequestId ? DB.getById('operationsRequests', prefilledRequestId) : DB.getWhere('operationsRequests', r => r.workRequestId === wr.id && r.type === 'transmittal' && r.status === 'pending')[0];

    // Default items
    if (opReq && Array.isArray(opReq.documents) && opReq.documents.length > 0) {
      opReq.documents.forEach(docName => {
        addTransmittalItem({ documentType: 'Generated Copy', description: docName });
      });
    } else {
      addTransmittalItem();
    }

    const addItemBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '+ Add Item', style: 'margin-top: 6px;' });
    addItemBtn.addEventListener('click', () => addTransmittalItem());
    itemsSection.appendChild(addItemBtn);
    form.appendChild(itemsSection);

    // ---------- Notes ----------
    const notesGroup = el('div', { class: 'form-group' });
    notesGroup.appendChild(el('label', { text: 'Notes' }));
    const notesTextarea = el('textarea', { name: 'notes', rows: 3, placeholder: 'Optional notes for the recipient...' });
    if (opReq) {
      notesTextarea.value = `Recipient: ${opReq.recipientDetails || ''}\nNotes: ${opReq.notes || ''}`;
    }
    notesGroup.appendChild(notesTextarea);
    form.appendChild(notesGroup);

    wrapper.appendChild(form);

    // ---------- Footer buttons ----------
    const footer = el('div', { style: 'display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px;' });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel' });
    const saveBtn = el('button', { type: 'button', class: 'btn btn-primary', text: 'Create Transmittal' });
    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
    wrapper.appendChild(footer);

    // Open modal
    const overlay = this.showModal('Generate Transmittal', wrapper);
    overlay.querySelector('.modal').classList.add('modal-wide');

    cancelBtn.addEventListener('click', () => overlay.remove());

    saveBtn.addEventListener('click', () => {
      // Collect items
      const rows = itemsList.querySelectorAll('.line-item-row');
      const items = [];
      rows.forEach(row => {
        const desc = row.querySelector('.item-desc')?.value?.trim();
        const docType = row.querySelector('.item-type')?.value;
        if (desc && docType) {
          items.push({ description: desc, documentType: docType });
        }
      });

      if (items.length === 0) {
        this.showMessage('Validation Error', 'Please add at least one document item with a description.', 'warning');
        return;
      }

      const data = Object.fromEntries(new FormData(form).entries());

      const record = {
        id: generateId('tx'),
        workRequestId: data.workRequestId,
        clientId: data.clientId,
        trackingNumber: data.trackingNumber || Transmittal.generateTrackingNumber(entity),
        status: 'Draft',
        items,
        notes: data.notes || '',
        entity,
        sentAt: '',
        acknowledgedAt: '',
        sentBy: '',
        acknowledgedBy: '',
        createdAt: new Date().toISOString(),
        createdBy: Auth.user.id
      };

      DB.insert('transmittals', record);

      // Fulfill pending operations request if any
      const reqId = prefilledRequestId || (record.workRequestId ? DB.getWhere('operationsRequests', r => r.workRequestId === record.workRequestId && r.type === 'transmittal' && r.status === 'pending')[0]?.id : null);
      if (reqId) {
        DB.update('operationsRequests', reqId, {
          status: 'fulfilled',
          fulfilledBy: Auth.user.id,
          fulfilledAt: new Date().toISOString(),
          linkedRecordId: record.id
        });
      }

      // Link transmittal back to WR
      if (record.workRequestId) {
        const linkedWr = DB.getById('workRequests', record.workRequestId);
        if (linkedWr) {
          const linkedIds = new Set(linkedWr.linkedTransmittalIds || []);
          linkedIds.add(record.id);
          DB.update('workRequests', linkedWr.id, { linkedTransmittalIds: Array.from(linkedIds) });
        }
      }

      overlay.remove();

      this.showMessage(
        'Transmittal Created',
        'Transmittal ' + record.trackingNumber + ' has been created and linked to "' + wr.title + '".',
        'success'
      );

      // Refresh WR detail
      App.handleRoute();
    });
  },

  submitOperationsRequest(type, wr, preselectedTask = null) {
    const existing = DB.getWhere('operationsRequests', r => r.workRequestId === wr.id && r.type === type && r.status === 'pending');
    if (existing.length > 0) {
      this.showMessage('Already Requested', 'A request for this action is already pending review.', 'info');
      return;
    }

    const wrapper = el('div', { style: 'display: flex; flex-direction: column; gap: var(--spacing-md); min-width: 420px; max-width: 500px;' });
    const form = el('form', { class: 'form-stacked' });

    const client = DB.getById('clients', wr.clientId);
    const contextRow = el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: var(--spacing-sm); border-bottom: 1px solid var(--color-border); padding-bottom: var(--spacing-sm); margin-bottom: var(--spacing-xs);' }, [
      el('div', { class: 'form-group' }, [
        el('label', { text: 'Client' }),
        el('span', { text: client ? client.name : '—', style: 'font-weight: 500; font-size: 0.875rem;' })
      ]),
      el('div', { class: 'form-group' }, [
        el('label', { text: 'Work Request' }),
        el('span', { text: wr.title || '—', style: 'font-weight: 500; font-size: 0.875rem;' })
      ])
    ]);
    form.appendChild(contextRow);

    const rejectedReq = DB.getWhere('operationsRequests', r => r.workRequestId === wr.id && r.type === type && r.status === 'rejected').sort((a,b) => new Date(b.requestedAt) - new Date(a.requestedAt))[0];
    if (rejectedReq && rejectedReq.rejectionReason) {
      const rejectNote = el('div', { 
        style: 'background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius-sm); padding: var(--spacing-sm); margin-bottom: var(--spacing-xs); font-size: 0.8125rem; color: #b91c1c;' 
      }, [
        el('strong', { text: 'Previous Request Rejected: ' }),
        el('span', { text: `"${rejectedReq.rejectionReason}"` })
      ]);
      form.appendChild(rejectNote);
    }

    if (type === 'billing') {
      // 1. Link to Specific Task
      const tasks = DB.getWhere('tasks', t => t.workRequestId === wr.id) || [];
      const taskGroup = el('div', { class: 'form-group' });
      taskGroup.appendChild(el('label', { text: 'Link to Specific Task' }));
      const taskSel = el('select', { name: 'linkedTaskId', class: 'form-select' });
      taskSel.appendChild(el('option', { value: '', text: '— Whole Project —' }));
      tasks.forEach(t => {
        const opt = el('option', { value: t.id, text: t.title });
        if (preselectedTask && preselectedTask.id === t.id) opt.selected = true;
        taskSel.appendChild(opt);
      });
      taskGroup.appendChild(taskSel);
      form.appendChild(taskGroup);

      // 2. Billing Amount
      const amtGroup = el('div', { class: 'form-group' });
      amtGroup.appendChild(el('label', { text: 'Billing Amount (₱) *' }));
      const amtIn = el('input', { type: 'text', inputmode: 'decimal', name: 'amount', placeholder: '0.00', required: true });
      amtIn.addEventListener('input', () => { amtIn.value = amtIn.value.replace(/[^0-9.,]/g, ''); });
      amtIn.addEventListener('focus', () => { const n = parseFloat(String(amtIn.value).replace(/[₱$,\s]/g, '')) || 0; amtIn.value = n > 0 ? String(n) : ''; });
      amtIn.addEventListener('blur', () => { const n = parseFloat(String(amtIn.value).replace(/[₱$,\s]/g, '')) || 0; amtIn.value = n > 0 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''; });
      amtGroup.appendChild(amtIn);
      form.appendChild(amtGroup);

      // 3. Attachment / Proof
      const fileGroup = el('div', { class: 'form-group' });
      fileGroup.appendChild(el('label', { text: 'Proof of Completion (optional)' }));
      const fileIn = el('input', { type: 'file', name: 'receipt' });
      fileGroup.appendChild(fileIn);
      form.appendChild(fileGroup);

      // 4. Notes
      const notesGroup = el('div', { class: 'form-group' });
      notesGroup.appendChild(el('label', { text: 'Billing Notes (Optional)' }));
      const notesArea = el('textarea', { name: 'notes', class: 'form-control', style: 'min-height: 80px;', placeholder: 'e.g. Requesting milestone Downpayment billing...' });
      notesGroup.appendChild(notesArea);
      form.appendChild(notesGroup);
    }
    else if (type === 'disbursement') {
      // 1. Request Type Toggle (Reimbursement vs Cash Advance)
      const typeGroup = el('div', { class: 'form-group' });
      typeGroup.appendChild(el('label', { text: 'Disbursement Type *' }));
      const typeWrap = el('div', { class: 'radio-group', style: 'display: flex; gap: var(--spacing-md);' });
      
      const rLabel = el('label', { class: 'radio-label', style: 'font-weight: normal; cursor: pointer;' });
      const rRadio = el('input', { type: 'radio', name: 'disbursementType', value: 'reimbursement', checked: true });
      rLabel.appendChild(rRadio);
      rLabel.appendChild(document.createTextNode(' Reimbursement (Already Spent)'));
      
      const caLabel = el('label', { class: 'radio-label', style: 'font-weight: normal; cursor: pointer;' });
      const caRadio = el('input', { type: 'radio', name: 'disbursementType', value: 'cash_advance' });
      caLabel.appendChild(caRadio);
      caLabel.appendChild(document.createTextNode(' Cash Advance (Needed in Advance)'));
      
      typeWrap.appendChild(rLabel);
      typeWrap.appendChild(caLabel);
      typeGroup.appendChild(typeWrap);
      form.appendChild(typeGroup);

      // 2. Category Select
      const catGroup = el('div', { class: 'form-group' });
      catGroup.appendChild(el('label', { text: 'Category *' }));
      const catSel = el('select', { name: 'category', required: true, class: 'form-select' });
      ['Government Fee', 'Notarization', 'Transportation / Travel', 'Meals / Client Meeting', 'Other'].forEach(c => {
        catSel.appendChild(el('option', { value: c, text: c }));
      });
      catGroup.appendChild(catSel);
      form.appendChild(catGroup);

      // 3. Amount
      const amtGroup = el('div', { class: 'form-group' });
      amtGroup.appendChild(el('label', { text: 'Amount (₱) *' }));
      const amtIn = el('input', { type: 'text', inputmode: 'decimal', name: 'amount', placeholder: '0.00', required: true });
      amtIn.addEventListener('input', () => { amtIn.value = amtIn.value.replace(/[^0-9.,]/g, ''); });
      amtIn.addEventListener('focus', () => { const n = parseFloat(String(amtIn.value).replace(/[₱$,\s]/g, '')) || 0; amtIn.value = n > 0 ? String(n) : ''; });
      amtIn.addEventListener('blur', () => { const n = parseFloat(String(amtIn.value).replace(/[₱$,\s]/g, '')) || 0; amtIn.value = n > 0 ? n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''; });
      amtGroup.appendChild(amtIn);
      form.appendChild(amtGroup);

      // 4. Payment Method
      const payGroup = el('div', { class: 'form-group' });
      payGroup.appendChild(el('label', { text: 'Preferred Payment Method *' }));
      const paySel = el('select', { name: 'paymentMethod', class: 'form-select', required: true });
      ['Cash', 'Bank Transfer', 'GCash / E-Wallet', 'Check'].forEach(m => {
        paySel.appendChild(el('option', { value: m, text: m }));
      });
      payGroup.appendChild(paySel);
      form.appendChild(payGroup);

      // 5. File upload for Receipt/Assessment
      const fileGroup = el('div', { class: 'form-group' });
      const fileLabel = el('label', { text: 'Receipt (Recommended)' });
      fileGroup.appendChild(fileLabel);
      const fileIn = el('input', { type: 'file', name: 'receipt' });
      fileGroup.appendChild(fileIn);
      form.appendChild(fileGroup);

      // Toggle receipt label based on Reimbursement vs Cash Advance
      rRadio.addEventListener('change', () => { fileLabel.textContent = 'Receipt (Recommended)'; });
      caRadio.addEventListener('change', () => { fileLabel.textContent = 'Assessment Statement / Quote (optional)'; });

      // 6. Notes
      const notesGroup = el('div', { class: 'form-group' });
      notesGroup.appendChild(el('label', { text: 'Disbursement Notes (Optional)' }));
      const notesArea = el('textarea', { name: 'notes', class: 'form-control', style: 'min-height: 80px;', placeholder: 'e.g. Bank details or specific breakdown details...' });
      notesGroup.appendChild(notesArea);
      form.appendChild(notesGroup);
    }
    else if (type === 'transmittal') {
      // 1. Documents listing (Hybrid)
      const docGroup = el('div', { class: 'form-group' });
      docGroup.appendChild(el('label', { text: 'Documents to Transmit *', style: 'margin-bottom: var(--spacing-xs);' }));
      
      const docListContainer = el('div', { style: 'display: flex; flex-direction: column; gap: var(--spacing-xs); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: var(--spacing-sm); max-height: 150px; overflow-y: auto; background: var(--color-surface);' });
      
      // Load DMS documents
      const dmsDocs = DB.getWhere('documents', doc => doc.workRequestId === wr.id) || [];
      if (dmsDocs.length === 0) {
        docListContainer.appendChild(el('span', { text: 'No uploaded DMS documents found.', style: 'font-size: 0.75rem; color: var(--color-text-muted); font-style: italic;' }));
      } else {
        dmsDocs.forEach(doc => {
          const row = el('label', { style: 'display: flex; align-items: center; gap: var(--spacing-sm); font-size: 0.8125rem; font-weight: normal; cursor: pointer; margin-bottom: 0;' });
          const chk = el('input', { type: 'checkbox', class: 'dms-doc-checkbox', value: doc.fileName });
          row.appendChild(chk);
          row.appendChild(document.createTextNode(' ' + doc.fileName + (doc.documentType ? ` (${doc.documentType})` : '')));
          docListContainer.appendChild(row);
        });
      }
      docGroup.appendChild(docListContainer);
      form.appendChild(docGroup);

      // 2. Add manual documents text
      const manualGroup = el('div', { class: 'form-group' });
      manualGroup.appendChild(el('label', { text: 'Additional / Physical Items to Transmit' }));
      const manualIn = el('input', { type: 'text', name: 'manualDocs', placeholder: 'e.g. Original Barangay Clearance, Official Receipt (comma separated)...', class: 'form-control' });
      manualGroup.appendChild(manualIn);
      form.appendChild(manualGroup);

      // 3. Recipient & Delivery Details
      const recGroup = el('div', { class: 'form-group' });
      recGroup.appendChild(el('label', { text: 'Recipient & Delivery Details *' }));
      const recArea = el('textarea', { name: 'recipientDetails', class: 'form-control', required: true, style: 'min-height: 80px;', placeholder: 'Recipient Name, Phone, and Delivery Address...' });
      recGroup.appendChild(recArea);
      form.appendChild(recGroup);

      // 4. Additional Notes
      const notesGroup = el('div', { class: 'form-group' });
      notesGroup.appendChild(el('label', { text: 'Additional Delivery Notes (Optional)' }));
      const notesArea = el('textarea', { name: 'notes', class: 'form-control', style: 'min-height: 60px;', placeholder: 'e.g. Rush delivery, call before arrival...' });
      notesGroup.appendChild(notesArea);
      form.appendChild(notesGroup);
    }

    // Footer actions
    const footer = el('div', { style: 'display: flex; justify-content: flex-end; gap: 8px; margin-top: var(--spacing-md); border-top: 1px solid var(--color-border); padding-top: var(--spacing-sm);' }, [
      el('button', { id: 'btn-cancel-opreq', class: 'btn btn-ghost', type: 'button', text: 'Cancel' }),
      el('button', { id: 'btn-save-opreq', class: 'btn btn-primary', type: 'submit', text: 'Submit Request' })
    ]);
    form.appendChild(footer);
    wrapper.appendChild(form);

    const label = type === 'billing' ? 'Billing' : type === 'disbursement' ? 'Disbursement' : 'Transmittal';
    const overlay = this.showModal(`Submit Request for ${label}`, wrapper);

    overlay.querySelector('#btn-cancel-opreq').addEventListener('click', () => overlay.remove());

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const record = {
        id: generateId('opreq'),
        type,
        workRequestId: wr.id,
        clientId: wr.clientId,
        requestedBy: Auth.user.id,
        requestedAt: new Date().toISOString(),
        status: 'pending',
        rejectionReason: ''
      };

      if (type === 'billing') {
        const linkedTaskId = form.querySelector('[name="linkedTaskId"]').value;
        const amtStr = form.querySelector('[name="amount"]').value;
        const amount = parseFloat(amtStr.replace(/[₱$,\s]/g, '')) || 0;
        if (amount <= 0) {
          this.showMessage('Validation Error', 'Please enter a valid billing amount.', 'warning');
          return;
        }
        const notes = form.querySelector('[name="notes"]').value.trim();
        const receiptInput = form.querySelector('input[name="receipt"]');
        const receiptFile = receiptInput?.files?.[0];

        record.linkedTaskId = linkedTaskId || '';
        record.amount = amount;
        record.notes = notes;
        record.receiptFilename = receiptFile ? receiptFile.name : null;
      }
      else if (type === 'disbursement') {
        const disType = form.querySelector('input[name="disbursementType"]:checked').value;
        const category = form.querySelector('[name="category"]').value;
        const amtStr = form.querySelector('[name="amount"]').value;
        const amount = parseFloat(amtStr.replace(/[₱$,\s]/g, '')) || 0;
        if (amount <= 0) {
          this.showMessage('Validation Error', 'Please enter a valid disbursement amount.', 'warning');
          return;
        }
        const payMethod = form.querySelector('[name="paymentMethod"]').value;
        const notes = form.querySelector('[name="notes"]').value.trim();
        const receiptInput = form.querySelector('input[name="receipt"]');
        const receiptFile = receiptInput?.files?.[0];

        record.disbursementType = disType;
        record.category = category;
        record.amount = amount;
        record.paymentMethod = payMethod;
        record.notes = notes;
        record.receiptFilename = receiptFile ? receiptFile.name : null;
        record.linkedTaskId = preselectedTask ? preselectedTask.id : '';
      }
      else if (type === 'transmittal') {
        const checkedDocs = Array.from(form.querySelectorAll('.dms-doc-checkbox:checked')).map(chk => chk.value);
        const manualDocsStr = form.querySelector('[name="manualDocs"]').value.trim();
        const manualDocs = manualDocsStr ? manualDocsStr.split(',').map(s => s.trim()).filter(Boolean) : [];
        const documents = [...checkedDocs, ...manualDocs];

        if (documents.length === 0) {
          this.showMessage('Validation Error', 'Please select or enter at least one document to transmit.', 'warning');
          return;
        }

        const recipientDetails = form.querySelector('[name="recipientDetails"]').value.trim();
        if (!recipientDetails) {
          this.showMessage('Validation Error', 'Please enter recipient and delivery details.', 'warning');
          return;
        }
        const notes = form.querySelector('[name="notes"]').value.trim();

        record.documents = documents;
        record.recipientDetails = recipientDetails;
        record.notes = notes;
      }

      DB.insert('operationsRequests', record);
      overlay.remove();

      this.showMessage(
        'Request Submitted',
        `Your request for ${label} has been submitted to Accounting/Documentation for review.`,
        'success'
      );

      App.handleRoute();
    });
  },

  render() {
    const container = el('div', { class: 'page' });
    if (this.view === 'list') {
      container.classList.add('operations-list-page');
    }
    
    if (this.view === 'detail' && this.detailWrId) {
      let wr = DB.getById('workRequests', this.detailWrId);
      if (!wr) {
        const pc = DB.getById('pendingChanges', this.detailWrId) || 
                   DB.getWhere('pendingChanges', p => p.proposedData && p.proposedData.id === this.detailWrId)[0];
        if (pc && pc.table === 'workRequests') {
          wr = { ...pc.proposedData };
          wr.id = pc.proposedData.id || pc.id;
          wr.isPendingApproval = true;
          wr.pendingChangeId = pc.id;
          wr.submittedBy = pc.submittedBy;
          wr.status = 'Draft';
        }
      }
      if (!wr) {
        this.view = 'list';
        App.handleRoute();
        return el('div');
      }
      // Breadcrumb title bar consistent with the rest of the system
      const client = DB.getById('clients', wr.clientId);
      const canEdit = Auth.can('workflow:edit') && !wr.isPendingApproval;
      const isArchived = wr && wr.status === 'Cancelled';
      const titleBar = el('div', { class: 'page-title-bar-v2' });
      const h1 = el('h1', { class: 'breadcrumb-h1' });
      const opLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Operations' });
      opLink.addEventListener('click', () => { location.hash = '#operations'; });
      h1.appendChild(opLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      h1.appendChild(document.createTextNode(wr.title || 'Untitled Work Request'));
      titleBar.appendChild(h1);
      const actions = el('div', { class: 'title-bar-actions' });
      if (canEdit && wr && !isArchived) {
        const addBtn = el('button', { class: 'btn btn-primary btn-sm', text: '+ Add Task', style: 'margin-right: var(--spacing-sm);' });
        addBtn.addEventListener('click', () => { this.showAddTaskModal(wr.id, () => App.handleRoute()); });
        actions.appendChild(addBtn);
      }
      const badges = el('div', { class: 'identity-badges', style: 'margin-right:12px;' });
      const statusBadgeClass = {
        'Draft': 'badge-info',
        'Pre-processing': 'badge-info',
        'Processing': 'badge-warn',
        'Billing': 'badge-info',
        'Disbursement': 'badge-info',
        'Completed': 'badge-success',
        'Cancelled': 'badge-danger'
      }[wr.status] || 'badge-info';
      if (wr.isPendingApproval) {
        badges.appendChild(el('span', { class: 'badge badge-warn', text: 'Awaiting Approval' }));
      } else {
        badges.appendChild(el('span', { class: `badge ${statusBadgeClass}`, text: wr.status }));
      }

      if (wr?.priority && wr.priority !== 'Normal') {
        const priorityClass = { 'Urgent': 'badge-danger', 'Priority': 'badge-warn', 'Low Priority': 'badge-info' }[wr.priority] || 'badge-muted';
        badges.appendChild(el('span', { class: `badge ${priorityClass}`, text: wr.priority }));
      }

      const finBadge = this.getFinanceBadgeForWr(wr);
      const docBadge = this.getDocBadgeForWr(wr);
      if (finBadge) badges.appendChild(finBadge);
      if (docBadge) badges.appendChild(docBadge);
      actions.appendChild(badges);

      if (wr.isPendingApproval && (Auth.user.id === wr.submittedBy || Auth.isManagerial())) {
        const cancelBtn = el('button', { class: 'btn btn-danger btn-sm', text: 'Cancel Request', style: 'margin-right: 8px;' });
        cancelBtn.addEventListener('click', () => {
          Workflow.showConfirm('Confirm Cancellation', 'Are you sure you want to cancel and withdraw this request?', () => {
            PendingChanges.delete(wr.pendingChangeId);
            this.view = 'list';
            this.detailWrId = null;
            App.handleRoute();
          }, 'danger');
        });
        actions.appendChild(cancelBtn);
      }
      const backBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '← Back to Work Requests' });
      backBtn.addEventListener('click', () => { location.hash = '#operations'; });
      actions.appendChild(backBtn);
      titleBar.appendChild(actions);
      container.appendChild(titleBar);

      // Sub-header with WR id and client name
      const subHeader = el('div', { class: 'detail-sub-header-v2' });
      subHeader.appendChild(el('div', { class: 'detail-info-item' }, [
        el('span', { class: 'detail-info-label', text: 'Work Request' }),
        el('span', { class: 'detail-info-value font-mono', text: (wr.id || '').toString().toUpperCase() })
      ]));
      subHeader.appendChild(el('div', { class: 'detail-info-item' }, [
        el('span', { class: 'detail-info-label', text: 'Client' }),
        el('span', { class: 'detail-info-value', text: client?.name || 'Unknown Client' })
      ]));
      container.appendChild(subHeader);
    } else if (this.view === 'list' || this.view === 'templates' || this.view === 'archive') {
      container.classList.add('operations-tab-page');
      const titleBar = el('div', { class: 'page-title-bar-v2' });
      titleBar.appendChild(el('h1', { text: 'Operations' }));
      container.appendChild(titleBar);
      container.appendChild(this.renderTabNav());
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

    setTimeout(() => this.updateStickyOffsets(), 0);
    return container;
  },

  init() {
    this.updateStickyOffsets();
    window.addEventListener('resize', () => this.updateStickyOffsets());
    window.addEventListener('scroll', () => this.updateStickyOffsets());
    window.addEventListener('load', () => this.updateStickyOffsets());

    document.addEventListener('click', () => {
      document.querySelectorAll('.multi-select-menu.show').forEach(m => m.classList.remove('show'));
      document.querySelectorAll('.action-menu-list').forEach(m => {
        m.classList.add('hidden');
        m.classList.remove('open');
      });
    });
    if (this.view === 'detail' && this.prefilledTransmittalRequestId) {
      const reqId = this.prefilledTransmittalRequestId;
      this.prefilledTransmittalRequestId = null;
      const wr = DB.getById('workRequests', this.detailWrId);
      if (wr) {
        setTimeout(() => this.openGenerateTransmittalModal(wr, null, reqId), 100);
      }
    }
  },

  updateStickyOffsets() {
    const titleBar = document.querySelector('.page-title-bar-v2');
    let titleBarHeight = 48; // default fallback
    if (titleBar) {
      // Subtract the -20px top offset
      titleBarHeight = titleBar.getBoundingClientRect().height - 20;
    }
    document.documentElement.style.setProperty('--operations-title-bar-height', `${titleBarHeight}px`);

    const tabNav = document.querySelector('.module-tab-nav');
    let tabNavHeight = 45; // default fallback
    if (tabNav) {
      tabNavHeight = tabNav.getBoundingClientRect().height;
    }
    document.documentElement.style.setProperty('--operations-tab-nav-height', `${tabNavHeight}px`);

    const toolbar = document.querySelector('.operations-tab-page .toolbar-sticky-container');
    let toolbarHeight = 0;
    if (toolbar) {
      toolbarHeight = toolbar.getBoundingClientRect().height;
    }
    document.documentElement.style.setProperty('--operations-toolbar-height', `${toolbarHeight}px`);
  },

  renderTabNav() {
    const tabNav = el('div', { class: 'module-tab-nav' });

    const entity = Auth.activeEntity;
    const wrCount = DB.getWhere('workRequests', wr => {
      const wrEnt = (wr.entity || '').toUpperCase();
      if (entity === 'ALL') {
        return Auth.user.entities.map(ae => ae.toUpperCase()).includes(wrEnt);
      }
      return wrEnt === entity.toUpperCase();
    }).filter(wr => wr.status !== 'Cancelled').length;

    const templateCount = DB.getWhere('retainerTemplates', t => {
      const tEnt = (t.entity || '').toUpperCase();
      if (entity === 'ALL') {
        return Auth.user.entities.map(ae => ae.toUpperCase()).includes(tEnt);
      }
      return tEnt === entity.toUpperCase();
    }).length;

    const trashCount = DB.getWhere('workRequests', wr => {
      const wrEnt = (wr.entity || '').toUpperCase();
      if (entity === 'ALL') {
        return Auth.user.entities.map(ae => ae.toUpperCase()).includes(wrEnt);
      }
      return wrEnt === entity.toUpperCase();
    }).filter(wr => wr.status === 'Cancelled').length;

    const tabs = [
      { key: 'list', label: 'Work Requests', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>', count: wrCount },
      { key: 'templates', label: 'Retainer Templates', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/></svg>', count: templateCount },
      { key: 'archive', label: 'Trash', icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>', count: trashCount }
    ];

    tabs.forEach(tab => {
      const btn = el('button', { class: 'module-tab-link' + (this.view === tab.key ? ' active' : '') });
      btn.innerHTML = tab.icon + ' ' + tab.label;
      if (tab.count !== undefined) {
        btn.innerHTML += ' <span class="module-badge-count">' + tab.count + '</span>';
      }
      btn.addEventListener('click', () => {
        this.view = tab.key;
        App.handleRoute();
      });
      tabNav.appendChild(btn);
    });

    if (Auth.can('workflow:edit')) {
      const addBtn = el('button', {
        class: 'btn btn-primary btn-sm',
        style: 'margin-left: 16px; display: inline-flex; align-items: center; gap: 6px;',
        html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> New Work Request'
      });
      addBtn.addEventListener('click', () => {
        this.editingId = null;
        openFormPanel({
          icon: '📝', title: 'Add Work Request',
          formContent: this.renderForm(), formId: 'wr-form',
          actions: [
            { text: 'Save Work Request', class: 'btn btn-primary', type: 'submit', form: 'wr-form' },
            { text: 'Cancel', class: 'btn btn-secondary', onClick: () => { closeFormPanelAndRoute('#operations'); } }
          ]
        });
      });
      tabNav.appendChild(addBtn);
    }

    return tabNav;
  },

  // ============================================================
  // List View
  // ============================================================
  renderList() {
    const entity = Auth.activeEntity;
    const canApprove = Auth.can('workflow:approve');
    const canEdit = Auth.can('workflow:edit');

    const wrapper = el('div');
    const stickyContainer = el('div', { class: 'toolbar-sticky-container' });
    const filters = el('div', { class: 'filters-bar' });

    // View mode toggle
    const viewMode = App.getPreferredViewMode('operations') || 'table';
    const vmToggle = el('div', { class: 'view-mode-toggle' });
    const vmTable = el('button', { html: ViewIcons.table + ' Table', class: viewMode === 'table' ? 'active' : '', type: 'button' });
    const vmBoard = el('button', { html: ViewIcons.board + ' Board', class: viewMode === 'board' ? 'active' : '', type: 'button' });
    const vmList = el('button', { html: ViewIcons.list + ' List', class: viewMode === 'list' ? 'active' : '', type: 'button' });
    vmTable.addEventListener('click', () => { saveCurrentFilters(); App.setPreferredViewMode('operations', 'table'); App.handleRoute(); });
    vmBoard.addEventListener('click', () => { saveCurrentFilters(); App.setPreferredViewMode('operations', 'board'); App.handleRoute(); });
    vmList.addEventListener('click', () => { saveCurrentFilters(); App.setPreferredViewMode('operations', 'list'); App.handleRoute(); });
    vmToggle.appendChild(vmTable);
    vmToggle.appendChild(vmBoard);
    vmToggle.appendChild(vmList);

    // Filters inside the toolbar
    const priorityFilter = el('select', { class: 'form-select' });
    priorityFilter.appendChild(el('option', { value: '', text: 'All Priorities' }));
    ['Urgent', 'Priority', 'Low Priority'].forEach(p => priorityFilter.appendChild(el('option', { value: p, text: p })));
    filters.appendChild(wrapFilterFieldWithClear(priorityFilter));

    const empOptions = [{ value: '', text: 'All Employees' }];
    DB.getWhere('users', u => {
      const userEnts = (u.entities || []).map(e => e.toUpperCase());
      if (entity === 'ALL') {
        return userEnts.some(e => Auth.user.entities.map(ae => ae.toUpperCase()).includes(e));
      }
      return userEnts.includes(entity.toUpperCase());
    }).forEach(u => {
      empOptions.push({ value: u.id, text: u.name });
    });
    (DB.getAll('tasks') || []).forEach(t => {
      const name = (t.assigneeName || '').trim();
      if (name && !empOptions.some(opt => opt.value === name || opt.text === name)) {
        empOptions.push({ value: name, text: name });
      }
    });
    const empFilter = createSearchableDropdown({ placeholder: 'All Employees', options: empOptions });
    filters.appendChild(empFilter);

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
    const clientFilter = createSearchableDropdown({ placeholder: 'All Clients', options: clientOptions });
    filters.appendChild(clientFilter);

    const dateFrom = el('input', { type: 'date', class: 'form-select' });
    const dateTo = el('input', { type: 'date', class: 'form-select' });
    filters.appendChild(el('span', { text: 'Due From', style: 'font-size:0.875rem;color:var(--color-text-muted);' }));
    filters.appendChild(wrapFilterFieldWithClear(dateFrom));
    filters.appendChild(el('span', { text: 'Due To', style: 'font-size:0.875rem;color:var(--color-text-muted);' }));
    filters.appendChild(wrapFilterFieldWithClear(dateTo));

    const statusFilter = el('select', { class: 'form-select' });
    statusFilter.appendChild(el('option', { value: '', text: 'All Statuses' }));
    ['Draft', 'Pre-processing', 'Processing', 'Billing', 'Disbursement', 'Completed'].forEach(s => {
      statusFilter.appendChild(el('option', { value: s, text: s }));
    });
    filters.appendChild(wrapFilterFieldWithClear(statusFilter));

    const clearBtn = el('button', {
      class: 'btn btn-secondary btn-sm',
      html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 .49-3.5"></path></svg>Clear'
    });
    clearBtn.addEventListener('click', () => {
      priorityFilter.value = '';
      empFilter.value = '';
      clientFilter.value = '';
      dateFrom.value = '';
      dateTo.value = '';
      statusFilter.value = '';
      App.clearSavedFilters('operations');
      refresh();
    });
    filters.appendChild(clearBtn);

    stickyContainer.appendChild(filters);
    stickyContainer.appendChild(vmToggle);
    wrapper.appendChild(stickyContainer);

    // Restore saved filters
    const savedFilters = App.restoreFilters('operations');
    if (savedFilters) {
      if (savedFilters.priority) priorityFilter.value = savedFilters.priority;
      if (savedFilters.employee) empFilter.value = savedFilters.employee;
      if (savedFilters.client) clientFilter.value = savedFilters.client;
      if (savedFilters.dateFrom) dateFrom.value = savedFilters.dateFrom;
      if (savedFilters.dateTo) dateTo.value = savedFilters.dateTo;
      if (savedFilters.status) statusFilter.value = savedFilters.status;
    }

    const saveCurrentFilters = () => {
      App.saveFilters('operations', {
        priority: priorityFilter.value,
        employee: empFilter.value,
        client: clientFilter.value,
        dateFrom: dateFrom.value,
        dateTo: dateTo.value,
        status: statusFilter.value
      });
    };

    const contentContainer = el('div');
    wrapper.appendChild(contentContainer);

    const refresh = () => {
      while (contentContainer.firstChild) contentContainer.removeChild(contentContainer.firstChild);
      const pendingChanges = DB.getWhere('pendingChanges', pc => pc.status === 'pending' && pc.table === 'workRequests' && !pc.parentRecordId);
      const pendingWrs = pendingChanges.map(pc => {
        const wr = { ...pc.proposedData };
        wr.isPendingApproval = true;
        wr.pendingChangeId = pc.id;
        wr.submittedBy = pc.submittedBy;
        wr.status = 'Draft'; // Staged creations are draft
        return wr;
      });

      let wrs = DB.getWhere('workRequests', r => {
        const matchesEntity = (entity === 'ALL' ? Auth.user.entities.includes(r.entity) : r.entity === entity);
        return matchesEntity && r.status !== 'Cancelled';
      });

      wrs = wrs.concat(pendingWrs.filter(r => {
        const matchesEntity = (entity === 'ALL' ? Auth.user.entities.includes(r.entity) : r.entity === entity);
        return matchesEntity;
      }));

      // Scope visibility for all non-managerial staff roles to only show work requests they are added to
      if (!canApprove) {
        const myTasks = DB.getWhere('tasks', t => t.assigneeId === Auth.user.id || t.assignedTo === Auth.user.id);
        const myWrIds = new Set(myTasks.map(t => t.workRequestId));
        wrs = wrs.filter(r => {
          if (r.isPendingApproval) {
            const tasks = r.tasks || [];
            const isAssignedToStagedTasks = tasks.some(t => t.assigneeId === Auth.user.id || t.assigneeName === Auth.user.name || (t.coAssignees || []).includes(Auth.user.name));
            return r.submittedBy === Auth.user.id || r.assignedTo === Auth.user.id || isAssignedToStagedTasks;
          }
          return myWrIds.has(r.id) || r.assignedTo === Auth.user.id || r.requestedBy === Auth.user.id;
        });
      }
      if (priorityFilter.value) wrs = wrs.filter(r => r.priority === priorityFilter.value);
      if (empFilter.searchText && empFilter.searchText.trim() !== '') {
        const query = empFilter.searchText.trim().toLowerCase();
        wrs = wrs.filter(r => {
          const assignedUser = r.assignedTo ? DB.getById('users', r.assignedTo) : null;
          if (assignedUser && assignedUser.name.toLowerCase().includes(query)) return true;
          const tasks = DB.getWhere('tasks', t => t.workRequestId === r.id);
          return tasks.some(t => {
            if (t.assigneeId) {
              const u = DB.getById('users', t.assigneeId);
              if (u && u.name.toLowerCase().includes(query)) return true;
            }
            if (t.assigneeName && t.assigneeName.toLowerCase().includes(query)) return true;
            return false;
          });
        });
      } else if (empFilter.value) {
        wrs = wrs.filter(r => r.assignedTo === empFilter.value);
      }
      const selectedClient = clientFilter.value ? DB.getById('clients', clientFilter.value) : null;
      if (selectedClient && selectedClient.name === clientFilter.searchText) {
        wrs = wrs.filter(r => r.clientId === clientFilter.value);
      } else if (clientFilter.searchText && clientFilter.searchText.trim() !== '') {
        const query = clientFilter.searchText.trim().toLowerCase();
        wrs = wrs.filter(r => {
          const client = DB.getById('clients', r.clientId);
          return client && client.name.toLowerCase().includes(query);
        });
      }
      if (dateFrom.value) wrs = wrs.filter(r => r.dueDate && r.dueDate >= dateFrom.value);
      if (dateTo.value) wrs = wrs.filter(r => r.dueDate && r.dueDate <= dateTo.value);
      if (statusFilter.value) wrs = wrs.filter(r => r.status === statusFilter.value);

      if (viewMode === 'table') this.refreshTable(contentContainer, wrs);
      else if (viewMode === 'board') this.refreshBoard(contentContainer, wrs);
      else this.refreshListCompact(contentContainer, wrs);
    };

    [priorityFilter, empFilter, clientFilter, dateFrom, dateTo, statusFilter].forEach(el => el.addEventListener('change', () => { saveCurrentFilters(); refresh(); }));
    [empFilter, clientFilter].forEach(el => el.addEventListener('input', () => { saveCurrentFilters(); refresh(); }));
    refresh();

    return wrapper;
  },

  refreshTable(container, wrs) {
    const canEdit = Auth.can('workflow:edit');
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
      const titleWrapper = el('div', { style: 'display: flex; align-items: center; gap: 8px;' });
      titleWrapper.appendChild(el('div', { text: wr.title, style: 'font-weight: 600; color: #1e293b;' }));
      if (wr.isPendingApproval) {
        titleWrapper.appendChild(el('span', {
          text: 'Awaiting Approval',
          style: 'font-size: 10px; border-radius: 4px; display: inline-block; padding: 1px 4px; background: #fffbeb; color: #d97706; font-weight: 600; border: 1px solid #fef3c7;'
        }));
      }
      tdTitle.appendChild(titleWrapper);
      const badgeRow = el('div', { style: 'display: flex; gap: 6px; margin-top: 4px;' });
      badgeRow.appendChild(this.getFinanceBadgeForWr(wr));
      badgeRow.appendChild(this.getDocBadgeForWr(wr));
      tdTitle.appendChild(badgeRow);
      tr.appendChild(tdTitle);
      tr.appendChild(el('td', { text: client?.name || '—' }));
      tr.appendChild(el('td', { text: wr.priority || '—' }));
      
      const statusTd = el('td');
      if (wr.isPendingApproval) {
        statusTd.appendChild(el('span', {
          text: 'Awaiting Approval',
          style: 'background: #fef3c7; color: #d97706; font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px;'
        }));
      } else {
        statusTd.appendChild(this.statusBadge(wr.status));
      }
      tr.appendChild(statusTd);
      
      tr.appendChild(el('td', { text: wr.dueDate ? formatDate(wr.dueDate) : '—' }));
      tr.appendChild(el('td', { text: assignedUser?.name || '—' }));
      const tdAct = el('td');
      const viewBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { location.hash = '#operations/detail/' + wr.id; });
      tdAct.appendChild(viewBtn);
      
      if (!wr.isPendingApproval) {
        if (canEdit && wr.status === 'Draft') {
          const editBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Edit' });
          editBtn.addEventListener('click', (e) => { e.stopPropagation(); location.hash = '#operations/form/' + wr.id; });
          tdAct.appendChild(editBtn);
        }
        if (canEdit && wr.status !== 'Completed' && wr.status !== 'Cancelled') {
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
      } else if (Auth.user.id === wr.submittedBy || Auth.isManagerial()) {
        const cancelBtn = el('button', { class: 'btn btn-danger btn-sm', text: 'Cancel', style: 'margin-left: 4px;' });
        cancelBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          Workflow.showConfirm('Confirm Cancellation', 'Are you sure you want to cancel and withdraw this request?', () => {
            PendingChanges.delete(wr.pendingChangeId);
            App.handleRoute();
          }, 'danger');
        });
        tdAct.appendChild(cancelBtn);
      }
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
      col.style.setProperty('--column-phase-color', colColor);
      
      const colWrs = wrs.filter(wr => wr.status === st);

      const header = el('div', { class: 'board-column-header-v2' });
      const titleWrap = el('div', { class: 'board-column-title' });
      titleWrap.appendChild(el('span', { class: 'board-column-dot', style: 'background:' + colColor + ';' }));
      titleWrap.appendChild(document.createTextNode(st));
      titleWrap.appendChild(el('span', { class: 'board-column-count', text: String(colWrs.length) }));
      header.appendChild(titleWrap);
      col.appendChild(header);

      const cardContainer = el('div', { class: 'board-cards-scroll' });

      if (colWrs.length === 0) {
        cardContainer.appendChild(el('div', { class: 'empty-state', text: 'No work requests' }));
      }

      colWrs.forEach(wr => {
        const tasks = wr.isPendingApproval ? (wr.tasks || []) : DB.getWhere('tasks', t => t.workRequestId === wr.id);
        const completedTasks = tasks.filter(t => t.status === 'Completed').length;
        const totalTasks = tasks.length;
        const progress = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;
        
        const allComments = tasks.reduce((acc, t) => acc + (t.comments?.length || 0), 0);
        const allDocs = tasks.reduce((acc, t) => acc + (t.taskDocuments?.length || 0), 0);

        const assigneeIds = [...new Set(tasks.map(t => t.assigneeId || t.assignedTo).filter(Boolean))];
        let assignees = assigneeIds.map(id => DB.getById('users', id)).filter(Boolean);
        if (wr.isPendingApproval && assignees.length === 0) {
          const names = [...new Set(tasks.map(t => t.assigneeName).filter(Boolean))];
          names.forEach(name => {
            const u = DB.getWhere('users', usr => usr.name.toLowerCase() === name.toLowerCase())[0];
            if (u) assignees.push(u);
          });
        }

        const card = el('div', { class: 'board-card board-card-v2' });
        card.style.borderLeftColor = colColor;
        card.addEventListener('click', () => { location.hash = '#operations/detail/' + wr.id; });

        const transition = this.getPhaseTransitionStatus(wr.id);

        // Top: Priority path and Due Date
        const topRow = el('div', { class: 'card-v2-top' });
        const categoryPath = el('span', { class: 'card-v2-category', text: `${wr.priority || 'Normal'} >` });
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

        if (wr.isPendingApproval) {
          const pendingBadge = el('span', {
            text: 'Awaiting Approval',
            class: 'badge-warning',
            style: 'margin-left: 28px; font-size: 10px; border-radius: 4px; display: inline-block; padding: 2px 6px; background: #fef3c7; color: #d97706; font-weight: 600; margin-top: 2px;'
          });
          card.appendChild(pendingBadge);

          // Banner inside the card
          const statusNote = el('div', {
            text: 'Status Note: Staged for Approval',
            style: 'margin: 6px 0 6px 28px; font-size: 11px; font-weight: 500; color: #d97706; background: #fffbeb; border-left: 3px solid #f59e0b; padding: 4px 8px; border-radius: 2px;'
          });
          card.appendChild(statusNote);
        }

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
    const canEdit = Auth.can('workflow:edit');
    if (wrs.length === 0) {
      container.appendChild(el('p', { text: 'No work requests found.', class: 'empty-state' }));
      return;
    }
    const list = el('div', { class: 'list-view operations-list-view' });
    wrs.forEach(wr => {
      const client = DB.getById('clients', wr.clientId);
      const row = el('div', { class: 'list-item' });
      const textCol = el('div');
      
      const titleDiv = el('div', { class: 'list-item-title', text: wr.title });
      if (wr.isPendingApproval) {
        titleDiv.appendChild(el('span', {
          text: 'Awaiting Approval',
          style: 'font-size: 10px; border-radius: 4px; display: inline-block; padding: 1px 4px; background: #fffbeb; color: #d97706; font-weight: 600; border: 1px solid #fef3c7; margin-left: 8px; vertical-align: middle;'
        }));
      }
      textCol.appendChild(titleDiv);
      
      textCol.appendChild(el('div', { class: 'list-item-meta', text: (client?.name || '—') + ' | Due: ' + (wr.dueDate ? formatDate(wr.dueDate) : '—') }));
      
      const badgeRow = el('div', { style: 'display: flex; gap: 6px; margin-top: 4px;' });
      badgeRow.appendChild(this.getPriorityBadgeForWr(wr));
      badgeRow.appendChild(this.getFinanceBadgeForWr(wr));
      badgeRow.appendChild(this.getDocBadgeForWr(wr));
      textCol.appendChild(badgeRow);
      
      row.appendChild(textCol);
      
      if (wr.isPendingApproval) {
        row.appendChild(el('span', {
          text: 'Awaiting Approval',
          style: 'background: #fef3c7; color: #d97706; font-size: 11px; font-weight: 600; padding: 2px 6px; border-radius: 4px; align-self: center;'
        }));
      } else {
        row.appendChild(this.statusBadge(wr.status));
      }
      
      if (!wr.isPendingApproval) {
        if (canEdit && wr.status !== 'Completed' && wr.status !== 'Cancelled') {
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
      } else if (Auth.user.id === wr.submittedBy || Auth.isManagerial()) {
        const cancelBtn = el('button', {
          class: 'btn btn-danger btn-xs',
          text: 'Cancel',
          style: 'align-self: center; margin-left: 8px;'
        });
        cancelBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          Workflow.showConfirm('Confirm Cancellation', 'Are you sure you want to cancel and withdraw this request?', () => {
            PendingChanges.delete(wr.pendingChangeId);
            App.handleRoute();
          }, 'danger');
        });
        row.appendChild(cancelBtn);
      }
      row.addEventListener('click', () => { location.hash = '#operations/detail/' + wr.id; });
      list.appendChild(row);
    });
    container.appendChild(list);
  },

  showTaskSidePane(taskId, triggerElement) {
    let task = DB.getById('tasks', taskId);
    let pendingWr = null;
    if (!task) {
      const pendingChanges = DB.getWhere('pendingChanges', pc => pc.status === 'pending' && pc.table === 'workRequests');
      for (const pc of pendingChanges) {
        const t = (pc.proposedData.tasks || []).find(tk => tk.id === taskId || tk.key === taskId);
        if (t) {
          task = t;
          pendingWr = { ...pc.proposedData };
          pendingWr.id = pc.proposedData.id || pc.id;
          pendingWr.isPendingApproval = true;
          pendingWr.pendingChangeId = pc.id;
          pendingWr.submittedBy = pc.submittedBy;
          pendingWr.status = 'Draft';
          break;
        }
      }
    }
    if (!task) return;

    const assignedUser = task.assignedTo || task.assigneeId ? DB.getById('users', task.assignedTo || task.assigneeId) : null;
    const assigneeName = task.assigneeName || assignedUser?.name || '—';
    const wr = pendingWr || (task.workRequestId ? DB.getById('workRequests', task.workRequestId) : null);

    const paneContent = el('div');

    // Title Section
    const titleSec = el('div', { class: 'side-pane-title-section' });
    titleSec.appendChild(el('div', { class: 'side-pane-icon', text: '📝' }));
    titleSec.appendChild(el('h2', { class: 'side-pane-title', text: task.title || 'Untitled Task' }));
    
    if (wr) {
      const openWrLink = el('button', { class: 'side-pane-view-details' });
      openWrLink.innerHTML = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20M4 19.5v-13A2.5 2.5 0 0 1 6.5 4H20v13H6.5a2.5 2.5 0 0 0-2.5 2.5z"></path></svg> Work Request: ${(wr.id || '').toString().toUpperCase()}`;
      openWrLink.addEventListener('click', () => {
        window.SidePaneInstance.close();
      });
      titleSec.appendChild(openWrLink);
    }
    paneContent.appendChild(titleSec);

    // Properties Section
    const propsSec = el('div', { class: 'side-pane-properties' });

    const propLabel = (label, svg) => {
      const lbl = el('div', { class: 'side-pane-prop-label' });
      lbl.innerHTML = `${svg}<span>${label}</span>`;
      return lbl;
    };

    const statusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>`;
    const priorityIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>`;
    const dateIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`;
    const assigneeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;

    // Status Row
    propsSec.appendChild(propLabel('Status', statusIcon));
    const statusValEl = el('div', { class: 'side-pane-prop-value' });
    const statusSel = el('select', { class: 'status-select form-select', style: 'padding: 2px 6px; font-size: 0.8125rem; font-weight: 600;' });
    
    const validStatuses = this.getValidNextStatuses(task);
    const flow = ['Draft', 'Assigned', 'In Progress', 'For Review', 'Completed', 'Cancelled'];
    const checklistCompletion = getTaskChecklistCompletion(task);
    const hasIncompleteChecklist = checklistCompletion.total > 0 && checklistCompletion.done < checklistCompletion.total;
    const isArchived = wr && (wr.status === 'Completed' || wr.status === 'Cancelled' || wr.isPendingApproval);
    const isDraft = wr && wr.status === 'Draft';
    const allowAssignChecklist = !wr || wr.status === 'Draft' || wr.status === 'Pre-processing';
    const allowAddRequirements = allowAssignChecklist;

    flow.forEach(s => {
      const opt = el('option', { value: s, text: s });
      if (s === task.status) opt.selected = true;
      const blockedByChecklist = hasIncompleteChecklist && (s === 'Completed' || s === 'For Review');
      const noAssignee = !(task.assigneeId || task.assignedTo || task.assigneeName);
      
      if (isArchived) {
        opt.disabled = true;
        opt.title = 'Work request is archived';
      } else if (blockedByChecklist) {
        opt.disabled = true;
        opt.title = `${checklistCompletion.total - checklistCompletion.done} of ${checklistCompletion.total} requirement items incomplete`;
      } else if (s === 'Assigned' && noAssignee) {
        opt.disabled = true;
        opt.title = 'Assign an employee first';
      } else if (!validStatuses.includes(s)) {
        opt.disabled = true;
        opt.title = `Cannot change to ${s}`;
      }
      statusSel.appendChild(opt);
    });
    if (isArchived) statusSel.disabled = true;

    const sColors = { 'Completed': '#17a34a', 'In Progress': '#eab308', 'Draft': '#6b6b6b', 'For Review': '#2f6feb', 'Assigned': '#2f6feb', 'Cancelled': '#dc2626' };
    statusSel.style.color = sColors[task.status] || 'var(--fg)';

    statusSel.addEventListener('change', () => {
      const newStatus = statusSel.value;
      const originalStatus = task.status;
      const resetDropdown = () => {
        statusSel.value = originalStatus;
        statusSel.style.color = sColors[originalStatus] || 'var(--fg)';
      };

      if (newStatus === 'Completed' || newStatus === 'Cancelled') {
        this.showConfirm('Confirm Status Change',
          `Are you sure you want to mark this task as "${newStatus}"? This may affect dependencies and routing.`,
          () => {
            const res = this.updateTaskStatus(task.id, newStatus);
            if (res.error) {
              this.showMessage('Error', res.error, 'danger');
              resetDropdown();
            } else {
              this.showTaskSidePane(taskId, triggerElement);
              App.handleRoute(); // Refresh background
            }
          },
          newStatus === 'Cancelled' ? 'danger' : 'warning',
          resetDropdown
        );
      } else {
        const res = this.updateTaskStatus(task.id, newStatus);
        if (res.error) {
          this.showMessage('Error', res.error, 'danger');
          resetDropdown();
        } else {
          this.showTaskSidePane(taskId, triggerElement);
          App.handleRoute(); // Refresh background
        }
      }
    });
    statusValEl.appendChild(statusSel);
    propsSec.appendChild(statusValEl);

    // Priority Row
    propsSec.appendChild(propLabel('Priority', priorityIcon));
    const priorityClass = { 'Urgent': 'badge-danger', 'Priority': 'badge-warn', 'Low Priority': 'badge-info' }[task.priority] || 'badge-muted';
    propsSec.appendChild(el('div', { class: 'side-pane-prop-value' }, [
      el('span', { class: `badge ${priorityClass}`, text: task.priority || 'Normal' })
    ]));

    // Due Date Row
    propsSec.appendChild(propLabel('Due Date', dateIcon));
    propsSec.appendChild(el('div', { class: 'side-pane-prop-value' }, [
      el('span', { text: task.dueDate ? formatDate(task.dueDate) : '—' })
    ]));

    // Assignee Row
    propsSec.appendChild(propLabel('Assignee', assigneeIcon));
    const assigneeValEl = el('div', { class: 'side-pane-prop-value', style: 'display: flex; flex-direction: column; gap: var(--space-2); min-width: 0; width: 100%; align-items: flex-start;' });

    if (wr && wr.status === 'Draft' && !wr.isPendingApproval) {
      // Editable mode: dropdown for primary assignee + co-assignee picker
      const gwDropdown = this.createGroundWorkerDropdown({
        selectedGroundWorkerName: task.assigneeName || '',
        placeholder: 'Assign primary employee...',
        className: 'side-pane-primary-assignee-dropdown',
        onChange: ({ assigneeName }) => {
          const name = (assigneeName || '').trim();
          const existing = name ? (DB.getAll('groundWorkers') || []).find(gw => gw.name.toLowerCase() === name.toLowerCase()) : null;
          DB.update('tasks', task.id, {
            assigneeId: existing ? existing.id : null,
            assigneeName: name || null,
            status: name ? 'Assigned' : 'Draft',
            updatedAt: new Date().toISOString()
          });
          this.showTaskSidePane(task.id, triggerElement);
          App.handleRoute();
        }
      });
      assigneeValEl.appendChild(gwDropdown);

      const coPicker = this.renderTaskCoAssigneePicker(
        task,
        { primaryName: task.assigneeName || '', className: 'side-pane-coassignee-dropdown' },
        true,
        true,
        () => {
          this.showTaskSidePane(task.id, triggerElement);
        }
      );
      assigneeValEl.appendChild(coPicker);
    } else {
      // Read-only mode: display standard stacked avatars list
      const names = getTaskAllAssigneeNames(task);
      assigneeValEl.appendChild(this.renderAssigneeAvatarsList(names));
    }
    propsSec.appendChild(assigneeValEl);

    paneContent.appendChild(propsSec);

    // Accordion helper function
    const createCollapsibleSection = (title, defaultExpanded, renderContentFn) => {
      const header = el('div', { class: 'side-pane-toggle-header' + (defaultExpanded ? '' : ' collapsed'), text: title });
      const content = el('div', { class: 'side-pane-toggle-content' + (defaultExpanded ? '' : ' collapsed') });
      
      header.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        content.classList.toggle('collapsed');
      });
      
      renderContentFn(content);
      return [header, content];
    };

    // 1. Task Description Section (Non-collapsible)
    const descSection = el('div', { class: 'side-pane-section' });
    descSection.appendChild(el('h3', { class: 'side-pane-section-title', text: 'Task description' }));
    descSection.appendChild(el('div', { class: 'side-pane-description', text: task.description || 'Provide an overview of the task and related details.' }));
    paneContent.appendChild(descSection);

    const [checklistHeaderToggle, checklistContentToggle] = createCollapsibleSection('Sub-tasks / Requirements Checklist', true, (cont) => {
      const listContainer = el('div', { class: 'details-content-list' });
      let populatePrereqSelect = () => {};
      
      const normalizedChecklist = (task.checklist || []).map(item => {
        if (typeof item === 'string') return { id: generateId('chk'), text: item, completed: false, assigneeId: null, assigneeName: null, dependsOn: null, timeLogs: [] };
        return item;
      });

      const renderChecklist = () => {
        listContainer.innerHTML = '';
        if (normalizedChecklist.length === 0) {
          listContainer.appendChild(el('div', { class: 'empty-state', text: 'No checklist items.' }));
        } else {
          normalizedChecklist.forEach((item, idx) => {
            const blocked = isChecklistBlocked(item, normalizedChecklist);
            const prereq = item.dependsOn === '*' ? null : normalizedChecklist.find(c => c.id === item.dependsOn);
            const row = el('div', { class: 'checklist-item' + (blocked ? ' locked' : '') + (item.completed ? ' completed' : '') });
            
            const cb = el('input', { type: 'checkbox' });
            cb.checked = !!item.completed;
            cb.disabled = blocked || (wr && wr.isPendingApproval);
            
            cb.addEventListener('change', () => {
              const now = new Date().toISOString();
              if (cb.checked) {
                item.completed = true;
              } else {
                item.completed = false;
                normalizedChecklist.forEach(other => {
                  if (other.dependsOn === item.id || other.dependsOn === '*') other.completed = false;
                });
              }
              DB.update('tasks', task.id, { checklist: normalizedChecklist, updatedAt: now });
              this.showTaskSidePane(taskId, triggerElement);
              App.handleRoute(); // Refresh background
            });

            const textValue = blocked ? ('🔒 Waiting for: ' + (item.dependsOn === '*' ? 'All Task (*)' : (prereq ? prereq.text : 'Unknown'))) : item.text;
            const textWrap = el('div', { class: 'checklist-text' });
            textWrap.appendChild(el('span', { text: textValue, class: item.completed ? 'completed' : '', title: textValue }));
            row.appendChild(cb);
            row.appendChild(textWrap);

            if (allowAssignChecklist) {
              const assigneeWrap = el('div', { class: 'task-assignee-wrapper' });
              const assigneeDropdown = this.createGroundWorkerDropdown({
                selectedGroundWorkerName: item.assigneeName,
                placeholder: 'Assign...',
                className: 'checklist-assignee-dropdown',
                priorityNames: getTaskAllAssigneeNames(task),
                onChange: ({ assigneeName }) => {
                  const name = (assigneeName || '').trim();
                  const existing = name ? (DB.getAll('groundWorkers') || []).find(gw => gw.name.toLowerCase() === name.toLowerCase()) : null;
                  item.assigneeName = name || null;
                  item.assigneeId = existing ? existing.id : null;
                  DB.update('tasks', task.id, { checklist: normalizedChecklist, updatedAt: new Date().toISOString() });
                  this.showTaskSidePane(taskId, triggerElement);
                  App.handleRoute();
                }
              });
              assigneeWrap.appendChild(assigneeDropdown);

              const coAssigneePicker = this.renderChecklistCoAssigneePicker(
                task,
                item,
                { primaryName: item.assigneeName || '', className: 'inline-coassignee-dropdown' },
                !isArchived,
                true,
                () => {
                  DB.update('tasks', task.id, { checklist: normalizedChecklist, updatedAt: new Date().toISOString() });
                  this.showTaskSidePane(taskId, triggerElement);
                  App.handleRoute();
                }
              );
              assigneeWrap.appendChild(coAssigneePicker);
              row.appendChild(assigneeWrap);
            } else {
              const itemAssigneeNames = [];
              if (item.assigneeName) {
                itemAssigneeNames.push(item.assigneeName);
              }
              if (item.coAssignees && Array.isArray(item.coAssignees)) {
                item.coAssignees.forEach(name => {
                  if (name && !itemAssigneeNames.includes(name)) {
                    itemAssigneeNames.push(name);
                  }
                });
              }
              const assigneeWrap = this.renderAssigneeAvatarsList(itemAssigneeNames);
              row.appendChild(assigneeWrap);
            }

            const itemHours = getChecklistItemTotalHours(item);
            const timePill = el('span', { class: 'hours-pill', text: itemHours + 'h' });
            row.appendChild(timePill);

            const actionsDiv = el('div', { style: 'display:flex; gap: 4px;' });
            const logBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-xs', text: 'Log' });
            logBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              this.showAddTimeLogModal(task.id, item.id);
            });
            actionsDiv.appendChild(logBtn);

            const delBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-xs', text: '×', style: 'color:var(--color-text-muted); font-size: 14px;' });
            delBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              if (!item.timeLogs || item.timeLogs.length === 0) {
                normalizedChecklist.splice(idx, 1);
                DB.update('tasks', task.id, { checklist: normalizedChecklist, updatedAt: new Date().toISOString() });
                this.showTaskSidePane(taskId, triggerElement);
                App.handleRoute();
              } else {
                const content = el('div');
                content.appendChild(el('p', { text: `This item has ${item.timeLogs.length} logged time record(s). Choose how to proceed:` }));
                const actions = el('div', { class: 'checklist-delete-modal-actions', style: 'display:flex; gap:8px; margin-top:12px;' });
                const reassignBtn = el('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'Reassign to task' });
                const deleteAllBtn = el('button', { type: 'button', class: 'btn btn-danger btn-sm', text: 'Delete logs & item' });
                actions.appendChild(reassignBtn);
                actions.appendChild(deleteAllBtn);
                content.appendChild(actions);
                
                const overlay = this.showModal('Delete Checklist Item', content, null);
                
                reassignBtn.addEventListener('click', () => {
                  overlay.remove();
                  const tObj = DB.getById('tasks', task.id) || task;
                  const logsToMove = (item.timeLogs || []).map(l => ({ ...l, checklistItemId: null }));
                  tObj.timeLogs = [...(tObj.timeLogs || []), ...logsToMove];
                  tObj.checklist = (tObj.checklist || []).filter(c => c.id !== item.id);
                  DB.update('tasks', tObj.id, { checklist: tObj.checklist, timeLogs: tObj.timeLogs, updatedAt: new Date().toISOString() });
                  this.showTaskSidePane(taskId, triggerElement);
                  App.handleRoute();
                });
                
                deleteAllBtn.addEventListener('click', () => {
                  overlay.remove();
                  const tObj = DB.getById('tasks', task.id) || task;
                  tObj.checklist = (tObj.checklist || []).filter(c => c.id !== item.id);
                  DB.update('tasks', tObj.id, { checklist: tObj.checklist, updatedAt: new Date().toISOString() });
                  this.showTaskSidePane(taskId, triggerElement);
                  App.handleRoute();
                });
              }
            });
            actionsDiv.appendChild(delBtn);
            row.appendChild(actionsDiv);

            listContainer.appendChild(row);
          });
        }
      };

      cont.appendChild(listContainer);

      if (allowAddRequirements) {
        const addChecklistRow = el('div', { class: 'add-checklist', style: 'margin-top: 12px; display: flex; gap: 8px; align-items: center;' });
        const newItemInput = el('input', { type: 'text', placeholder: 'Add sub-task...', class: 'form-control', style: 'flex: 1;' });
        
        // Custom single-select styled as dependency selector
        const predWrapper = el('div', { class: 'multi-select-dropdown', style: 'width: 160px;' });
        const predBtn = el('button', { type: 'button', class: 'multi-select-btn', text: '— Dependency —', style: 'width: 100%; height: 32px;' });
        const predMenu = el('div', { class: 'multi-select-menu', style: 'width: 100%;' });
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

        let selectedPrereqId = null;

        populatePrereqSelect = () => {
          predMenu.innerHTML = '';
          
          // Option for None
          const noneOption = el('label', { class: 'multi-select-option' });
          const noneCheckbox = el('input', { type: 'checkbox', value: '' });
          if (!selectedPrereqId) noneCheckbox.checked = true;
          noneCheckbox.addEventListener('change', () => {
            selectedPrereqId = null;
            predBtn.textContent = '— Dependency —';
            predMenu.querySelectorAll('.multi-select-option input').forEach(input => {
              if (input !== noneCheckbox) input.checked = false;
            });
            predMenu.classList.remove('show');
          });
          noneOption.appendChild(noneCheckbox);
          noneOption.appendChild(document.createTextNode('— Dependency —'));
          predMenu.appendChild(noneOption);

          // Option for All Task (*)
          const allOption = el('label', { class: 'multi-select-option' });
          const allCheckbox = el('input', { type: 'checkbox', value: '*' });
          if (selectedPrereqId === '*') allCheckbox.checked = true;
          allCheckbox.addEventListener('change', () => {
            if (allCheckbox.checked) {
              selectedPrereqId = '*';
              predBtn.textContent = 'All Task (*)';
              predMenu.querySelectorAll('.multi-select-option input').forEach(input => {
                if (input !== allCheckbox) input.checked = false;
              });
            } else {
              selectedPrereqId = null;
              predBtn.textContent = '— Dependency —';
            }
            predMenu.classList.remove('show');
          });
          allOption.appendChild(allCheckbox);
          allOption.appendChild(document.createTextNode('All Task (*)'));
          predMenu.appendChild(allOption);

          normalizedChecklist.forEach(item => {
            const option = el('label', { class: 'multi-select-option' });
            const checkbox = el('input', { type: 'checkbox', value: item.id });
            if (selectedPrereqId === item.id) checkbox.checked = true;
            checkbox.addEventListener('change', () => {
              if (checkbox.checked) {
                selectedPrereqId = item.id;
                predBtn.textContent = item.text;
                predMenu.querySelectorAll('.multi-select-option input').forEach(input => {
                  if (input !== checkbox) input.checked = false;
                });
              } else {
                selectedPrereqId = null;
                predBtn.textContent = '— Dependency —';
              }
              predMenu.classList.remove('show');
            });
            option.appendChild(checkbox);
            option.appendChild(document.createTextNode(item.text));
            predMenu.appendChild(option);
          });
        };
        populatePrereqSelect();

        const addItemBtn = el('button', { type: 'button', class: 'btn btn-primary btn-sm', text: 'Add' });
        addItemBtn.addEventListener('click', () => {
          const val = newItemInput.value.trim();
          if (!val) return;
          const prereqId = selectedPrereqId || null;
          normalizedChecklist.push({ id: generateId('chk'), text: val, completed: false, assigneeId: null, assigneeName: null, dependsOn: prereqId, timeLogs: [] });
          DB.update('tasks', task.id, { checklist: normalizedChecklist, updatedAt: new Date().toISOString() });
          this.showTaskSidePane(taskId, triggerElement);
          App.handleRoute();
        });

        addChecklistRow.appendChild(newItemInput);
        addChecklistRow.appendChild(predWrapper);
        addChecklistRow.appendChild(addItemBtn);
        cont.appendChild(addChecklistRow);
      }

      renderChecklist();
    });
    paneContent.appendChild(checklistHeaderToggle);
    paneContent.appendChild(checklistContentToggle);

    // 3. Supporting Files / Documents Collapsible Section
    const [docsHeaderToggle, docsContentToggle] = createCollapsibleSection('Supporting Files', false, (cont) => {
      const docHeaderActions = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;' });
      const docCount = (task.taskDocuments || []).length;
      docHeaderActions.appendChild(el('span', { text: `${docCount} attached files`, style: 'font-size: 0.8125rem; color: var(--color-text-muted);' }));
      
      const isDocStaff = Auth.user?.name?.toLowerCase().includes('documentation') ||
                         Auth.user?.email?.toLowerCase().startsWith('docs@');
      const isArchived = wr && (wr.status === 'Completed' || wr.status === 'Cancelled' || wr.isPendingApproval);

      if (isDocStaff && !isArchived) {
        const addDocBtn = el('button', { class: 'btn btn-primary btn-xs', text: '+ Upload File' });
        addDocBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showAddDocumentModal(task.id);
        });
        docHeaderActions.appendChild(addDocBtn);
      }
      cont.appendChild(docHeaderActions);

      const docsList = el('div', { class: 'details-content-list' });
      if ((task.taskDocuments || []).length === 0) {
        docsList.appendChild(el('div', { class: 'empty-state', text: 'No documents attached.', style: 'margin-bottom: 8px;' }));
      } else {
        const canEditDms = Auth.can('dms:edit');
        task.taskDocuments.forEach((d, dIdx) => {
          const item = el('div', { class: 'detail-item-v2', style: 'display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom: 1px solid var(--color-border);' });
          const leftSide = el('div', { style: 'display:flex; flex-direction:column; gap: 2px;' });
          const fName = d.fileName || d.filename;

          if (d.isFigma) {
            const figmaLink = el('a', {
              href: d.figmaUrl,
              target: '_blank',
              style: 'color: #a855f7; font-weight:600; text-decoration:underline; cursor:pointer; font-size: 0.8125rem; display: flex; align-items: center; gap: 6px;'
            });
            figmaLink.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #a855f7;"><path d="M5 5.5A2.5 2.5 0 0 1 7.5 3H12v5H7.5A2.5 2.5 0 0 1 5 5.5z"></path><path d="M12 3h4.5A2.5 2.5 0 0 1 19 5.5 2.5 2.5 0 0 1 16.5 8H12V3z"></path><path d="M5 12.5A2.5 2.5 0 0 1 7.5 10H12v5H7.5A2.5 2.5 0 0 1 5 12.5z"></path><path d="M12 10h4.5a2.5 2.5 0 0 1 0 5H12v-5z"></path><path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H12v5H7.5A2.5 2.5 0 0 1 5 19.5z"></path></svg>
              <span>${fName}</span>
            `;
            leftSide.appendChild(figmaLink);
          } else if (d.isGoogleDrive) {
            const driveLink = el('span', {
              style: 'color: #22c55e; font-weight:600; font-size: 0.8125rem; display: flex; align-items: center; gap: 6px;'
            });
            driveLink.innerHTML = `
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #22c55e;"><path d="M2.5 17h19M4.5 14l3.5-6h8l3.5 6M9 9h6M12 3v3"></path></svg>
              <span>${fName} (Google Drive)</span>
            `;
            leftSide.appendChild(driveLink);
          } else {
            if (canEditDms) {
              const dmsDoc = DB.getWhere('documents', doc => (doc.fileName === fName) && doc.workRequestId === wr.id)[0];
              if (dmsDoc && dmsDoc.dataUrl) {
                const link = el('a', {
                  href: '#',
                  text: '📎 ' + fName,
                  style: 'color:var(--color-primary); font-weight:600; text-decoration:underline; cursor:pointer; font-size: 0.8125rem;'
                });
                link.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const win = window.open();
                  if (win) win.document.write('<iframe src="' + dmsDoc.dataUrl + '" frameborder="0" style="position:fixed; top:0; left:0; bottom:0; right:0; width:100%; height:100%; border:none; margin:0; padding:0; overflow:hidden; z-index:999999;" allowfullscreen></iframe>');
                });
                leftSide.appendChild(link);
              } else {
                leftSide.appendChild(el('span', { text: '📎 ' + fName, style: 'font-size: 0.8125rem; font-weight: 500;' }));
              }
            } else {
              leftSide.appendChild(el('span', { text: '📎 ' + fName, style: 'font-size: 0.8125rem; font-weight: 500;' }));
            }
          }
          leftSide.appendChild(el('span', { text: `Uploaded: ${formatDate(d.uploadDate)}`, style: 'font-size: 10px; color: var(--color-text-muted);' }));
          item.appendChild(leftSide);

          if (isDocStaff || isAdmin) {
            const delBtn = el('button', { class: 'btn btn-ghost btn-xs', text: '×', style: 'color:var(--color-danger); font-size:1.2rem; padding:0 4px;' });
            delBtn.addEventListener('click', (e) => {
              e.stopPropagation();
              this.showConfirm('Confirm Removal', `Are you sure you want to remove "${fName}" from this task?`, () => {
                const updatedTaskDocs = task.taskDocuments.filter((_, i) => i !== dIdx);
                DB.update('tasks', task.id, { taskDocuments: updatedTaskDocs });
                const dmsMatch = DB.getWhere('documents', doc => doc.fileName === fName && doc.workRequestId === wr.id)[0];
                if (dmsMatch) DB.delete('documents', dmsMatch.id);
                this.showTaskSidePane(taskId, triggerElement);
                App.handleRoute();
              }, 'danger');
            });
            item.appendChild(delBtn);
          }
          docsList.appendChild(item);
        });
      }
      cont.appendChild(docsList);

      // Notion-style Embed Options
      if (!isArchived) {
        const embedContainer = el('div', { class: 'embed-options', style: 'margin-top: 16px; display: flex; flex-direction: column; gap: 8px;' });
        
        // 1. Upload Document
        const pdfOpt = el('button', { class: 'notion-embed-option', type: 'button' });
        pdfOpt.innerHTML = `
          <span class="notion-embed-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #ef4444;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
          </span>
          <span style="flex: 1; text-align: left;">Upload Document</span>
        `;
        pdfOpt.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showAttachmentPopover(task.id, pdfOpt, 'upload');
        });
        
        // 2. Link GDrive File
        const gdOpt = el('button', { class: 'notion-embed-option', type: 'button' });
        gdOpt.innerHTML = `
          <span class="notion-embed-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color: #22c55e;"><path d="M2.5 17h19M4.5 14l3.5-6h8l3.5 6M9 9h6M12 3v3"></path></svg>
          </span>
          <span style="flex: 1; text-align: left;">Link GDrive File</span>
        `;
        gdOpt.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showAttachmentPopover(task.id, gdOpt, 'gdrive');
        });

        embedContainer.appendChild(pdfOpt);
        embedContainer.appendChild(gdOpt);
        cont.appendChild(embedContainer);
      }
    });
    paneContent.appendChild(docsHeaderToggle);
    paneContent.appendChild(docsContentToggle);

    // 4. Time Log History Collapsible Section
    const [timeHeaderToggle, timeContentToggle] = createCollapsibleSection('Time Log History', false, (cont) => {
      const timeHeaderActions = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;' });
      const totalHours = getTaskTotalHours(task);
      timeHeaderActions.appendChild(el('span', { text: `Total: ${totalHours} hrs`, style: 'font-size: 0.8125rem; color: var(--color-text-muted);' }));
      
      const isArchived = wr && (wr.status === 'Completed' || wr.status === 'Cancelled' || wr.isPendingApproval);
      if (!isArchived) {
        const logTimeBtn = el('button', { class: 'btn btn-primary btn-xs', text: '+ Log Time' });
        logTimeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showAddTimeLogModal(task.id);
        });
        timeHeaderActions.appendChild(logTimeBtn);
      }
      cont.appendChild(timeHeaderActions);

      const timeList = el('div', { class: 'details-content-list' });
      const logs = task.timeLogs || [];
      const checklistLogGroups = [];
      (task.checklist || []).forEach(item => {
        if (item.timeLogs && item.timeLogs.length > 0) checklistLogGroups.push({ item, logs: item.timeLogs });
      });

      if (logs.length === 0 && checklistLogGroups.length === 0) {
        timeList.appendChild(el('div', { class: 'empty-state', text: 'No logs recorded.' }));
      } else {
        const buildTimeLogEntry = (l, subtaskName = null) => {
          const [y, m, d] = l.date.split('-').map(Number);
          const logDate = new Date(y, m - 1, d);
          const dateStr = logDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
          const workerLabel = l.workerName || (DB.getById('users', l.userId)?.name || l.userId || 'Unknown');
          const noteText = l.note ? ` — ${l.note}` : '';
          const subtaskContext = subtaskName ? ` [Sub-task: ${subtaskName}]` : '';

          return el('div', { 
            class: 'history-item', 
            style: 'display: flex; justify-content: space-between; align-items: center; padding: var(--space-2) 0; border-bottom: 1px solid var(--color-border); font-size: 0.8125rem;' 
          }, [
            el('div', {}, [
              el('strong', { text: workerLabel, style: 'color: var(--color-text);' }),
              el('span', { text: subtaskContext, style: 'color: var(--color-primary); font-size: 11px; font-weight: 600;' }),
              el('span', { text: noteText, style: 'color: var(--color-text-muted);' }),
              el('div', { class: 'history-meta', text: `${dateStr} • ${l.startTime}–${l.endTime}`, style: 'font-size: 10px; color: var(--color-text-muted);' })
            ]),
            el('span', { class: 'font-mono', text: `${l.hours}h`, style: 'font-weight: 700; color: var(--color-text);' })
          ]);
        };

        const taskLevelLogs = logs.filter(l => !l.checklistItemId);
        if (taskLevelLogs.length > 0) {
          const sorted = [...taskLevelLogs].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
          sorted.forEach(l => {
            timeList.appendChild(buildTimeLogEntry(l));
          });
        }

        checklistLogGroups.forEach(({ item, logs: itemLogs }) => {
          const sorted = [...itemLogs].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
          sorted.forEach(l => {
            timeList.appendChild(buildTimeLogEntry(l, item.text));
          });
        });
      }
      cont.appendChild(timeList);
    });
    paneContent.appendChild(timeHeaderToggle);
    paneContent.appendChild(timeContentToggle);

    // 5. Dependency Map Collapsible Section
    const [depHeaderToggle, depContentToggle] = createCollapsibleSection('Dependency Map', false, (cont) => {
      const depHeaderActions = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;' });
      depHeaderActions.appendChild(el('span', { text: 'Blocking / Pre-requisites', style: 'font-size: 0.8125rem; color: var(--color-text-muted);' }));
      
      const isArchived = wr && (wr.status === 'Completed' || wr.status === 'Cancelled' || wr.isPendingApproval);
      if (!isArchived) {
        const editDepBtn = el('button', { class: 'btn btn-secondary btn-xs', text: 'Edit Dependencies' });
        editDepBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showEditTaskModal(task.id, () => {
            this.showTaskSidePane(task.id, triggerElement);
            App.handleRoute();
          });
        });
        depHeaderActions.appendChild(editDepBtn);
      }
      cont.appendChild(depHeaderActions);

      const depList = el('div', { class: 'dep-list', style: 'display: flex; flex-direction: column; gap: 8px;' });
      const taskPreds = task.predecessors || [];
      const checklistDeps = (task.checklist || []).filter(item => item.dependsOn);

      if (taskPreds.length === 0 && checklistDeps.length === 0) {
        depList.appendChild(el('div', { class: 'empty-state', text: 'No dependencies.' }));
      } else {
        taskPreds.forEach(pid => {
          const pTask = DB.getById('tasks', pid);
          const pStatus = pTask ? pTask.status : 'Unknown';
          const pStatusColors = {
            'Completed': 'var(--color-success)',
            'In Progress': 'var(--color-warning)',
            'Draft': '#6b6b6b',
            'For Review': 'var(--color-primary)',
            'Assigned': 'var(--color-primary)',
            'Cancelled': 'var(--color-danger)'
          };

          const depItem = el('div', { 
            class: 'dep-item', 
            style: 'display: flex; align-items: center; gap: 8px; font-size: 0.8125rem;' 
          });
          depItem.appendChild(el('span', { text: pTask ? pTask.title : 'Unknown', style: 'font-weight: 600;' }));
          
          const statusBadge = el('span', { 
            text: pStatus, 
            class: 'badge',
            style: `font-size: 9px; padding: 1px 6px; background-color: color-mix(in srgb, ${pStatusColors[pStatus] || '#94a3b8'}, transparent 85%); color: ${pStatusColors[pStatus] || '#475569'}; border: 1px solid color-mix(in srgb, ${pStatusColors[pStatus] || '#94a3b8'}, transparent 70%); border-radius: 4px;` 
          });
          depItem.appendChild(statusBadge);
          
          depItem.appendChild(el('span', { class: 'dep-arrow', text: '→', style: 'color: var(--color-text-muted);' }));
          depItem.appendChild(el('span', { class: 'text-muted', text: task.title, style: 'color: var(--color-text-muted);' }));
          depList.appendChild(depItem);
        });

        checklistDeps.forEach(item => {
          const isAllCompleted = item.dependsOn === '*' && (task.checklist || []).every(c => c.id === item.id || c.completed);
          const prereq = item.dependsOn === '*' ? null : (task.checklist || []).find(c => c.id === item.dependsOn);
          const pStatus = (item.dependsOn === '*' ? isAllCompleted : (prereq && prereq.completed)) ? 'Completed' : 'Pending';

          const depItem = el('div', { 
            class: 'dep-item', 
            style: 'display: flex; align-items: center; gap: 8px; font-size: 0.8125rem;' 
          });
          depItem.appendChild(el('span', { text: item.dependsOn === '*' ? 'All Task (*)' : (prereq ? prereq.text : 'Unknown'), style: 'font-weight: 600;' }));
          
          const statusBadge = el('span', { 
            text: pStatus, 
            class: 'badge',
            style: `font-size: 9px; padding: 1px 6px; background-color: color-mix(in srgb, ${pStatus === 'Completed' ? 'var(--color-success)' : 'var(--color-warning)'}, transparent 85%); color: ${pStatus === 'Completed' ? 'var(--color-success)' : 'var(--color-warning)'}; border: 1px solid color-mix(in srgb, ${pStatus === 'Completed' ? 'var(--color-success)' : 'var(--color-warning)'}, transparent 70%); border-radius: 4px;` 
          });
          depItem.appendChild(statusBadge);
          
          depItem.appendChild(el('span', { class: 'dep-arrow', text: '→', style: 'color: var(--color-text-muted);' }));
          depItem.appendChild(el('span', { class: 'text-muted', text: `${task.title}: ${item.text}`, style: 'color: var(--color-text-muted);' }));
          depList.appendChild(depItem);
        });
      }
      cont.appendChild(depList);
    });
    paneContent.appendChild(depHeaderToggle);
    paneContent.appendChild(depContentToggle);

    if (!isArchived) {
      const [transRequestsHeaderToggle, transRequestsContentToggle] = createCollapsibleSection('Transaction Requests', false, (cont) => {
        const actionsWrap = el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-top: var(--space-2);' });

        const createActionCard = (icon, title, type, handler, isSpan = false) => {
          let cardStyle = `
            position: relative;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: var(--space-2);
            padding: var(--space-3);
            background: var(--color-surface);
            border: 1px solid var(--color-border);
            border-radius: var(--radius-md);
            cursor: pointer;
            font-family: inherit;
            font-size: 0.875rem;
            font-weight: 600;
            color: var(--color-text);
            transition: all 0.2s ease-in-out;
            min-height: 70px;
            text-align: center;
          `;
          if (isSpan) {
            cardStyle += ' grid-column: span 2;';
          }

          const card = el('button', { type: 'button', style: cardStyle, class: 'quick-action-card' });
          
          card.addEventListener('mouseenter', () => {
            card.style.borderColor = 'var(--color-primary)';
            card.style.boxShadow = 'var(--shadow-sm)';
            card.style.transform = 'translateY(-1px)';
          });
          card.addEventListener('mouseleave', () => {
            card.style.borderColor = 'var(--color-border)';
            card.style.boxShadow = 'none';
            card.style.transform = 'none';
          });

          const iconEl = el('span', { text: icon, style: 'font-size: 1.25rem;' });
          const titleEl = el('span', { text: title, style: 'line-height: 1.2;' });
          card.appendChild(iconEl);
          card.appendChild(titleEl);

          card.addEventListener('click', (e) => {
            e.stopPropagation();
            handler();
          });

          // Status Badge Overlay
          const req = DB.getWhere('operationsRequests', r => r.workRequestId === wr.id && r.type === type).sort((a,b) => new Date(b.requestedAt) - new Date(a.requestedAt))[0];
          if (req) {
            let dotColor = '';
            let badgeText = '';
            if (req.status === 'pending') {
              dotColor = '#eab308'; // Amber yellow
              badgeText = 'Pending';
            } else if (req.status === 'fulfilled') {
              dotColor = '#22c55e'; // Emerald green
              badgeText = 'Fulfilled';
            } else if (req.status === 'rejected') {
              dotColor = '#ef4444'; // Red
              badgeText = 'Rejected';
            }

            if (badgeText) {
              const badge = el('span', { 
                style: `
                  position: absolute;
                  top: 6px;
                  right: 6px;
                  display: flex;
                  align-items: center;
                  gap: 4px;
                  font-size: 0.6875rem;
                  font-weight: 500;
                  padding: 2px 6px;
                  border-radius: 9999px;
                  background: ${dotColor}15;
                  color: ${dotColor};
                  border: 1px solid ${dotColor}30;
                `
              });
              
              const dot = el('span', {
                style: `
                  width: 6px;
                  height: 6px;
                  border-radius: 50%;
                  background: ${dotColor};
                `
              });
              badge.appendChild(dot);
              badge.appendChild(document.createTextNode(badgeText));
              card.appendChild(badge);
            }
          }

          return card;
        };

        // Billing Card
        let billingTitle = 'Billing';
        let billingHandler = null;
        if (Auth.can('billing:edit')) {
          billingTitle = 'Generate Billing';
          billingHandler = () => this.openGenerateBillingModal(wr, task);
        } else if (Auth.can('billing:request')) {
          billingTitle = 'Request Billing';
          billingHandler = () => this.submitOperationsRequest('billing', wr, task);
        }

        // Disbursement Card
        let disbTitle = 'Disbursement';
        let disbHandler = null;
        if (Auth.can('disbursement:create')) {
          disbTitle = 'Generate Disbursement';
          disbHandler = () => this.openGenerateDisbursementModal(wr, task);
        } else if (Auth.can('disbursement:request')) {
          disbTitle = 'Request Disbursement';
          disbHandler = () => this.submitOperationsRequest('disbursement', wr, task);
        }

        // Transmittal Card
        let transTitle = 'Transmittal';
        let transHandler = null;
        if (Auth.can('transmittal:edit')) {
          transTitle = 'Generate Transmittal';
          transHandler = () => this.openGenerateTransmittalModal(wr, task);
        } else if (Auth.can('transmittal:request')) {
          transTitle = 'Request Transmittal';
          transHandler = () => this.submitOperationsRequest('transmittal', wr, task);
        }

        const cardsToRender = [];
        if (billingHandler) cardsToRender.push({ icon: '📄', title: billingTitle, type: 'billing', handler: billingHandler });
        if (disbHandler) cardsToRender.push({ icon: '💸', title: disbTitle, type: 'disbursement', handler: disbHandler });
        if (transHandler) cardsToRender.push({ icon: '📦', title: transTitle, type: 'transmittal', handler: transHandler });

        cardsToRender.forEach((c, idx) => {
          const isSpan = (cardsToRender.length === 3 && idx === 2) || (cardsToRender.length === 1);
          const card = createActionCard(c.icon, c.title, c.type, c.handler, isSpan);
          actionsWrap.appendChild(card);
        });

        cont.appendChild(actionsWrap);
      });

      paneContent.appendChild(transRequestsHeaderToggle);
      paneContent.appendChild(transRequestsContentToggle);
    }

    window.SidePaneInstance.recordId = task.id;
    window.SidePaneInstance.open({
      title: `Task Details`,
      content: paneContent,
      onClose: () => {
        window.SidePaneInstance.recordId = null;
      },
      triggerElement: triggerElement
    });
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
    let cls = 'badge-muted';

    if (invoices.length > 0 || disbursements.length > 0) {
      const allInvoicesPaid = invoices.every(inv => inv.status === 'Paid');
      const allDisbursementsReleased = disbursements.every(d => d.status === 'Released');

      if (allInvoicesPaid && allDisbursementsReleased) {
        text = 'Finances: Settled';
        cls = 'badge-success';
      } else {
        const anyOverdue = invoices.some(inv => inv.status === 'Overdue');
        const anyDraftOrPending = invoices.some(inv => ['Draft', 'Pending'].includes(inv.status)) ||
                                  disbursements.some(d => ['Submitted', 'Under Review'].includes(d.status));

        if (anyOverdue) {
          text = 'Finances: Overdue';
          cls = 'badge-danger';
        } else if (anyDraftOrPending) {
          text = 'Finances: Pending Approval';
          cls = 'badge-warn';
        } else {
          text = 'Finances: Active';
          cls = 'badge-info';
        }
      }
    }

    return el('span', { class: 'badge ' + cls, text });
  },

  getDocBadgeForWr(wr) {
    const documents = DB.getWhere('documents', doc => doc.workRequestId === wr.id);

    let text = 'No Documents';
    let cls = 'badge-danger';

    if (documents.length > 0) {
      const storedCount = documents.filter(d => d.lifecycleState === 'stored').length;
      if (storedCount === documents.length) {
        text = 'Docs: Stored';
        cls = 'badge-success';
      } else {
        text = `Docs: ${storedCount}/${documents.length} Stored`;
        cls = 'badge-warn';
      }
    }

    return el('span', { class: 'badge ' + cls, text });
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
    if (!Auth.can('workflow:edit')) {
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
    topActions.appendChild(saveBtn);

    // Use Retainer Template button (only on creation, not edit)
    const templates = DB.getWhere('retainerTemplates', t => t.entity === entity);
    let selectedTemplateId = null;
    let templateBtnRef = null;
    if (!wr && templates.length > 0) {
      const templateWrapper = el('div', { class: 'template-btn-wrapper' });
      const templateBtn = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Use Retainer Template' });
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

    const cancelBtn = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => { location.hash = '#operations'; });
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

    // Assignee dropdown
    const assigneeGroup = el('div', { class: 'form-group' });
    assigneeGroup.appendChild(el('label', { text: 'Assignee' }));
    const assigneeSel = el('select', { name: 'assignedTo' });
    assigneeSel.appendChild(el('option', { value: '', text: '— Select Assignee —' }));
    DB.getWhere('users', u => u.entities.includes(entity) || u.entities.includes(entity.toLowerCase())).forEach(u => {
      const opt = el('option', { value: u.id, text: u.name });
      if (wr && wr.assignedTo === u.id) opt.selected = true;
      assigneeSel.appendChild(opt);
    });
    assigneeGroup.appendChild(assigneeSel);
    form.appendChild(assigneeGroup);

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

    // Ground worker assignee — typable dropdown like the filter tray
    const gwDropdown = this.createGroundWorkerDropdown({
      selectedGroundWorkerName: taskData?.assigneeName || '',
      placeholder: 'Employee...',
      className: 'task-assignee-groundworker',
      onChange: () => {} // value is read at submit time
    });

    const assigneeWrapper = el('div', { class: 'task-assignee-wrapper' });
    assigneeWrapper.appendChild(gwDropdown);
    row.appendChild(assigneeWrapper);

    // Inline co-assignees (closure state on the row element)
    const coAssignees = taskData?.coAssignees ? [...taskData.coAssignees] : [];
    row._coAssignees = coAssignees;

    const coAssigneeWrap = el('div', { class: 'wr-task-row-coassignees' });
    const chipsWrap = el('div', { class: 'co-assignee-chips' });
    const renderCoChips = () => {
      chipsWrap.innerHTML = '';
      coAssignees.forEach((name, idx) => {
        const chip = el('span', { class: 'co-assignee-chip', text: name });
        const remove = el('span', { class: 'co-assignee-chip-remove', text: '×' });
        remove.addEventListener('click', () => {
          coAssignees.splice(idx, 1);
          renderCoChips();
        });
        chip.appendChild(remove);
        chipsWrap.appendChild(chip);
      });
    };
    renderCoChips();

    const coAssigneeDropdown = this.createGroundWorkerDropdown({
      placeholder: '+ Co-assignee',
      className: 'inline-coassignee-dropdown',
      onChange: ({ assigneeName }) => {
        const name = assigneeName?.trim();
        if (!name) return;
        const primaryName = (gwDropdown.searchText || '').trim();
        if (name === primaryName) { coAssigneeDropdown.value = ''; return; }
        if (!coAssignees.includes(name)) {
          coAssignees.push(name);
          const existing = (DB.getAll('groundWorkers') || []).find(gw => gw.name.toLowerCase() === name.toLowerCase());
          if (!existing) DB.insert('groundWorkers', { id: generateId('gw'), name });
          renderCoChips();
        }
        coAssigneeDropdown.value = '';
      }
    });
    coAssigneeWrap.appendChild(chipsWrap);
    coAssigneeWrap.appendChild(coAssigneeDropdown);
    row.appendChild(coAssigneeWrap);

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
        // Auto-check All Tasks (*) if all individual tasks are checked
        const allCheckbox = predMenu.querySelector('.multi-select-option input[value="*"]');
        const individualCheckboxes = Array.from(predMenu.querySelectorAll('.multi-select-option input')).filter(input => input.value !== '*');
        if (allCheckbox && !allCheckbox.checked && individualCheckboxes.length > 0 && individualCheckboxes.every(cb => cb.checked)) {
          allCheckbox.checked = true;
        }

        const checkedOptions = Array.from(predMenu.querySelectorAll('.multi-select-option input:checked'));
        let selectedKeys = checkedOptions.map(opt => opt.value);

        if (selectedKeys.includes('*')) {
          row.dataset.predKeys = '*';
          predBtn.textContent = 'All Tasks (*)';
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

      // 1. Add "All Tasks (*)"
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
        optionEl.appendChild(document.createTextNode('All Tasks (*)'));
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
    // With the typable ground-worker-only dropdown, assignment is optional.
    // Just clear any lingering input-error states.
    const taskRows = form.querySelectorAll('.task-row');
    taskRows.forEach(row => {
      const gwAutocomplete = row.querySelector('.task-assignee-groundworker');
      if (gwAutocomplete) {
        const gwInput = gwAutocomplete.querySelector('input');
        gwInput?.classList.remove('input-error');
      }
    });
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
      assignedTo: data.assignedTo || null,
      status: this.editingId ? (DB.getById('workRequests', this.editingId)?.status || 'Draft') : 'Draft',
      updatedAt: now
    };

    if (!this.editingId) {
      record.requestedBy = Auth.user.id;
    }

    // Collect tasks from rows
    const taskRows = form.querySelectorAll('.task-row');
    const tasks = [];
    taskRows.forEach(row => {
      const title = row.querySelector('.task-title-input').value.trim();
      if (!title) return;
      const gwAutocomplete = row.querySelector('.task-assignee-groundworker');
      const groundWorkerName = gwAutocomplete?.searchText?.trim() || '';

      // Auto-register new ground workers
      if (groundWorkerName) {
        const existing = (DB.getAll('groundWorkers') || []).find(gw => gw.name.toLowerCase() === groundWorkerName.toLowerCase());
        if (!existing) {
          DB.insert('groundWorkers', { id: generateId('gw'), name: groundWorkerName });
        }
      }

      const predKeysStr = row.dataset.predKeys || '';
      const predecessorKeys = predKeysStr.split(',').filter(Boolean);
      tasks.push({
        key: row.dataset.taskKey || generateId('tmp'),
        title,
        assigneeId: null,
        assigneeName: groundWorkerName || null,
        coAssignees: row._coAssignees || [],
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
        coAssignees: t.coAssignees?.length ? t.coAssignees : (existing?.coAssignees || []),
        predecessors: resolvePredecessors(t, i),
        status: existing?.status || 'Draft',
        dueDate: record.dueDate,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        sortOrder: i,
        checklist: existing?.checklist || [],
        timeLogs: existing?.timeLogs || [],
        taskDocuments: existing?.taskDocuments || [],
        comments: existing?.comments || []
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
      record.requestedBy = existingWr?.requestedBy || null;
      record.createdAt = existingWr?.createdAt || now;
      record.linkedInvoiceId = existingWr?.linkedInvoiceId || null;
      record.linkedDisbursementIds = existingWr?.linkedDisbursementIds || [];
      record.linkedTransmittalIds = existingWr?.linkedTransmittalIds || [];
    }

    record.tasks = taskRecords;
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
      // Staged tasks are stored inside record.tasks in the pending changes proposedData.
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

    closeFormPanelAndRoute('#operations');
    this.showMessage(
      isNew ? 'Work Request Created' : 'Work Request Saved',
      isNew ? 'Work Request has been successfully created.' : 'Work Request has been successfully updated.',
      'success'
    );
  },

  /**
   * Renders an editable co-assignee chip list + dropdown for a saved task row.
   */
  clearDropdown(dd) {
    dd.value = '';
    const input = dd.querySelector('input');
    if (input) { input.value = ''; input.title = ''; }
    const clear = dd.querySelector('.searchable-dropdown-clear');
    if (clear) clear.style.display = 'none';
  },

  renderTaskCoAssigneePicker(t, { primaryName = '', className = 'inline-coassignee-dropdown' } = {}, editable = false, showChips = true, onChange) {
    const wrap = el('div', { class: 'task-coassignee-wrap', style: 'margin-top:4px;' });
    const chipsWrap = el('div', { class: 'co-assignee-chips' });

    const renderChips = () => {
      chipsWrap.innerHTML = '';
      const coAssignees = t.coAssignees || [];
      coAssignees.forEach((name, idx) => {
        const chip = el('span', { class: 'co-assignee-chip' + (editable ? '' : ' readonly'), text: name });
        if (editable) {
          const remove = el('span', { class: 'co-assignee-chip-remove', text: '×' });
          remove.addEventListener('click', () => {
            const updated = coAssignees.filter((_, i) => i !== idx);
            DB.update('tasks', t.id, { coAssignees: updated, updatedAt: new Date().toISOString() });
            if (onChange) onChange();
            App.handleRoute();
          });
          chip.appendChild(remove);
        }
        chipsWrap.appendChild(chip);
      });
    };
    renderChips();

    if (showChips) wrap.appendChild(chipsWrap);
    if (editable) {
      const addDropdown = this.createGroundWorkerDropdown({
        placeholder: '+ Co-assignee',
        className,
        onChange: ({ assigneeName }) => {
          const name = assigneeName?.trim();
          if (!name) return;
          const coAssignees = t.coAssignees || [];
          if (coAssignees.includes(name)) { this.clearDropdown(addDropdown); return; }
          if (name === primaryName) { this.clearDropdown(addDropdown); return; }
          const existing = (DB.getAll('groundWorkers') || []).find(gw => gw.name.toLowerCase() === name.toLowerCase());
          if (!existing) DB.insert('groundWorkers', { id: generateId('gw'), name });
          const updated = [...coAssignees, name];
          DB.update('tasks', t.id, { coAssignees: updated, updatedAt: new Date().toISOString() });
          this.clearDropdown(addDropdown);
          if (onChange) onChange();
          App.handleRoute();
        }
      });
      wrap.appendChild(addDropdown);
    }
    return wrap;
  },

  renderChecklistCoAssigneePicker(task, item, { primaryName = '', className = 'inline-coassignee-dropdown' } = {}, editable = false, showChips = true, onUpdate) {
    const wrap = el('div', { class: 'task-coassignee-wrap', style: 'margin-top:4px;' });
    const chipsWrap = el('div', { class: 'co-assignee-chips' });

    const renderChips = () => {
      chipsWrap.innerHTML = '';
      const coAssignees = item.coAssignees || [];
      coAssignees.forEach((name, idx) => {
        const chip = el('span', { class: 'co-assignee-chip' + (editable ? '' : ' readonly'), text: name });
        if (editable) {
          const remove = el('span', { class: 'co-assignee-chip-remove', text: '×' });
          remove.addEventListener('click', () => {
            const updated = coAssignees.filter((_, i) => i !== idx);
            item.coAssignees = updated;
            onUpdate();
          });
          chip.appendChild(remove);
        }
        chipsWrap.appendChild(chip);
      });
    };
    renderChips();

    if (showChips) wrap.appendChild(chipsWrap);
    if (editable) {
      const addDropdown = this.createGroundWorkerDropdown({
        placeholder: '+ Co-assignee',
        className,
        onChange: ({ assigneeName }) => {
          const name = assigneeName?.trim();
          if (!name) return;
          const coAssignees = item.coAssignees || [];
          if (coAssignees.includes(name)) { this.clearDropdown(addDropdown); return; }
          if (name === primaryName) { this.clearDropdown(addDropdown); return; }
          const existing = (DB.getAll('groundWorkers') || []).find(gw => gw.name.toLowerCase() === name.toLowerCase());
          if (!existing) DB.insert('groundWorkers', { id: generateId('gw'), name });
          const updated = [...coAssignees, name];
          item.coAssignees = updated;
          this.clearDropdown(addDropdown);
          onUpdate();
        }
      });
      wrap.appendChild(addDropdown);
    }
    return wrap;
  },

  renderAssigneeAvatarsList(allAssigneeNames) {
    const assigneeWrap = el('div', { class: 'assignee-avatars-list' });
    const displayNames = allAssigneeNames.slice(0, 5);
    const avatarColors = [
      { bg: 'color-mix(in oklab, var(--accent), transparent 80%)', fg: 'var(--accent)' },
      { bg: 'color-mix(in oklab, var(--success), transparent 80%)', fg: 'var(--success)' },
      { bg: 'color-mix(in oklab, var(--warn), transparent 80%)', fg: 'color-mix(in oklab, var(--warn), black 30%)' },
      { bg: 'color-mix(in oklab, var(--danger), transparent 80%)', fg: 'var(--danger)' },
      { bg: '#e5e5e5', fg: '#6b6b6b' }
    ];
    displayNames.forEach((name, idx) => {
      const user = DB.getWhere('users', u => u.name === name)[0];
      const row = el('div', { class: 'assignee-avatar-row' });
      const av = el('div', { class: 'avatar-xs', title: name });
      const theme = avatarColors[idx % avatarColors.length];
      av.style.background = theme.bg;
      av.style.color = theme.fg;
      if (user?.avatarUrl) av.style.backgroundImage = `url('${user.avatarUrl}')`;
      else av.textContent = name.charAt(0).toUpperCase();
      row.appendChild(av);
      row.appendChild(el('span', { class: 'assignee-name', text: name }));
      assigneeWrap.appendChild(row);
    });
    if (allAssigneeNames.length > 5) {
      const overflow = el('span', {
        class: 'assignee-overflow',
        text: `+${allAssigneeNames.length - 5}`,
        title: allAssigneeNames.slice(5).join(', ')
      });
      assigneeWrap.appendChild(overflow);
    }
    if (allAssigneeNames.length === 0) {
      assigneeWrap.appendChild(el('span', { text: 'Unassigned', style: 'color:var(--muted);font-style:italic;' }));
    }
    return assigneeWrap;
  },

  renderDetail() {
    let wr = DB.getById('workRequests', this.detailWrId);
    if (!wr) {
      const pc = DB.getById('pendingChanges', this.detailWrId) || 
                 DB.getWhere('pendingChanges', p => p.proposedData && p.proposedData.id === this.detailWrId)[0];
      if (pc && pc.table === 'workRequests') {
        wr = { ...pc.proposedData };
        wr.id = pc.proposedData.id || pc.id;
        wr.isPendingApproval = true;
        wr.pendingChangeId = pc.id;
        wr.submittedBy = pc.submittedBy;
        wr.status = 'Draft';
      }
    }
    if (!wr) {
      this.view = 'list';
      App.handleRoute();
      return el('div');
    }
    if (this.lastRenderedWrId !== this.detailWrId) {
      this.lastRenderedWrId = this.detailWrId;
      this.expandedTaskIds.clear();
    }
    const client = DB.getById('clients', wr.clientId);
    const tasks = wr.isPendingApproval ? (wr.tasks || []) : DB.getWhere('tasks', t => t.workRequestId === wr.id);
    const canApprove = Auth.can('workflow:approve');
    const isDraft = wr.status === 'Draft';

    const container = el('div', { class: 'project-detail-v2' });
    container.selectedTaskIds = new Set();
    container.groupBy = 'phase';
    container.activeFilters = new Set();
    container.searchQuery = '';
    container.employeeFilter = null;

    // Lifecycle Card Redesign
    const lifecycleCard = el('div', { class: 'lifecycle-card' });
    const lifecycleHeader = el('div', { class: 'lifecycle-header' });
    lifecycleHeader.appendChild(el('div', { class: 'lifecycle-label', text: 'Lifecycle' }));

    const lifecycleActions = el('div', { class: 'lifecycle-actions' });
    
    const ts = this.getPhaseTransitionStatus(wr.id);
    const showRouteButton = ts && ts.nextPhase && ts.nextPhase !== 'Cancelled';
    const canCancel = canApprove && wr.status !== 'Completed' && wr.status !== 'Cancelled';
    const phaseColors = {
      'Draft': '#6b6b6b',
      'Pre-processing': '#2f6feb',
      'Processing': '#eab308',
      'Billing': '#2f6feb',
      'Disbursement': '#2f6feb',
      'Completed': '#17a34a',
      'Cancelled': '#dc2626'
    };

    if (canCancel) {
      const cancelWrBtn = el('button', {
        class: 'btn btn-sm btn-danger',
        text: 'Cancel Work Request',
        style: 'font-weight: 600; cursor: pointer;'
      });
      cancelWrBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.cancelWorkRequest(wr.id);
      });
      lifecycleActions.appendChild(cancelWrBtn);
    }

    if (showRouteButton) {
      const routeBtn = el('button', {
        class: 'btn btn-sm btn-primary',
        text: `Route to ${ts.nextPhase}`,
        style: `font-weight: 600; cursor: ${ts.canTransition ? 'pointer' : 'not-allowed'};`,
        disabled: !ts.canTransition
      });
      if (ts.canTransition) {
        routeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.transitionWorkRequest(wr.id);
        });
      }
      lifecycleActions.appendChild(routeBtn);
    }

    lifecycleHeader.appendChild(lifecycleActions);
    lifecycleCard.appendChild(lifecycleHeader);

    // Modern Centered Progress Indicator
    lifecycleCard.appendChild(this.renderModernProgressBar(wr.status));

    // Routing dependency checklist — shows blockers + actionable hints
    if (ts && !ts.canTransition && ts.missing && ts.missing.length > 0 && wr.status !== 'Completed' && wr.status !== 'Cancelled') {
      const blockWrapper = el('div', { class: 'routing-block blocked' });
      const depPanel = el('div', { style: 'width: 100%;' });
      depPanel.appendChild(el('div', {
        html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2"><path d="M12 9v4M12 17h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg> <strong>Routing blocked</strong> — Resolve these to route to ' + (ts.nextPhase || 'next phase') + ':',
        class: 'routing-title',
        style: 'color:var(--fg);'
      }));
      const depList = el('ul', { class: 'routing-list', style: 'color:var(--muted);' });
      ts.missing.forEach(m => {
        const li = el('li');
        li.appendChild(el('span', { text: m, style: 'font-weight:600;' }));
        const hint = this.getRoutingHint(m);
        if (hint) {
          const hintEl = el('span', { style: 'font-size:11px;color:var(--muted);margin-left:8px;display:inline-block;' });
          hintEl.appendChild(el('span', { text: '→ ' + hint.text, style: 'font-style:italic;' }));
          if (hint.route) {
            const goBtn = el('button', {
              text: 'Go',
              class: 'btn btn-xs',
              style: 'margin-left:6px;padding:1px 6px;font-size:10px;background:color-mix(in oklab, var(--warn), transparent 85%);color:color-mix(in oklab, var(--warn), black 30%);border:none;border-radius:4px;cursor:pointer;font-weight:600;'
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
      lifecycleCard.appendChild(blockWrapper);
    } else if (ts && ts.canTransition && ts.nextPhase && wr.status !== 'Completed' && wr.status !== 'Cancelled') {
      const readyWrapper = el('div', { class: 'routing-block ready' });
      const readyPanel = el('div', { style: 'width: 100%;' });
      readyPanel.appendChild(el('div', {
        html: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> <strong>Ready to route</strong> — All requirements met. Click "Route to ' + ts.nextPhase + '" above to proceed.',
        class: 'routing-title'
      }));
      readyWrapper.appendChild(readyPanel);
      lifecycleCard.appendChild(readyWrapper);
    }

    if (wr.isPendingApproval) {
      const pendingWrapper = el('div', { class: 'routing-block blocked' });
      const msgPanel = el('div', { style: 'width: 100%;' });
      msgPanel.appendChild(el('div', {
        html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#d97706" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg> <strong>Staged for Review</strong> — This work request is awaiting administrator approval. Clicking tasks, editing details, or routing is disabled.',
        class: 'routing-title',
        style: 'color:#d97706;'
      }));
      pendingWrapper.appendChild(msgPanel);
      lifecycleCard.appendChild(pendingWrapper);
    }

    container.appendChild(lifecycleCard);

    // Task List (Grouped div redesign)
    const listWrapper = el('div', { class: 'task-list', id: 'taskList' });
    
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

    const isDocStaff = Auth.can('dms:handover');
    const isArchived = wr.status === 'Cancelled';

    // End-of-day time log reminder banner (Manila 5 PM+)
    // Show to the Work Request owner (assignedTo or requestedBy) when ground worker checklist items are missing today's log.
    const now = new Date();
    const manilaHour = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Manila' })).getHours();
    const isWrOwner = wr.assignedTo === Auth.user.id || wr.requestedBy === Auth.user.id;
    const todayStr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })).toISOString().slice(0, 10);
    if (manilaHour >= 17 && !isArchived && isWrOwner) {
      const missingItems = [];
      sortedTasks.forEach(t => {
        if (t.status === 'Completed' || t.status === 'Cancelled') return;
        (t.checklist || []).forEach(item => {
          if (item.assigneeName && !item.assigneeId && !(item.timeLogs || []).some(l => l.date === todayStr)) {
            missingItems.push({ task: t, item });
          }
        });
      });
      if (missingItems.length > 0) {
        const reminderBanner = el('div', { class: 'eod-banner' });
        reminderBanner.appendChild(el('div', {
          html: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eab308" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
          style: 'flex-shrink:0;'
        }));
        const reminderText = el('div', { style: 'flex:1;' });
        reminderText.appendChild(el('div', {
          text: `⏰ End of day reminder: ${missingItems.length} checklist item(s) assigned to ground workers are missing a time log for today.`,
          style: 'font-weight:600;color:var(--fg);font-size:13px;'
        }));
        const logBtn = el('button', {
          text: 'Log Time Now',
          class: 'btn btn-primary btn-xs'
        });
        logBtn.addEventListener('click', () => { this.showAddTimeLogModal(missingItems[0].task.id, missingItems[0].item.id); });
        reminderText.appendChild(logBtn);
        const requestLink = el('button', {
          type: 'button',
          class: 'btn btn-ghost btn-xs',
          text: 'Request all missing logs'
        });
        requestLink.addEventListener('click', () => {
          const lines = missingItems.map(({ task: t, item }) => `- ${t.title}: ${item.text} (assigned to ${item.assigneeName})`);
          const subject = `Time Log Request: ${wr.title}`;
          const body = `Hi,\n\nPlease reply with your time logs for today (${todayStr}) for the following items:\n\n${lines.join('\n')}\n\nPlease include:\n- Start Time:\n- End Time:\n- Brief description of what you accomplished:\n\nThank you!`;
          navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`).then(() => {
            this.showMessage('Copied', 'Time log request copied to clipboard.', 'success');
          }).catch(() => {
            this.showMessage('Error', 'Could not copy to clipboard.', 'danger');
          });
        });
        reminderText.appendChild(requestLink);
        reminderBanner.appendChild(reminderText);
        container.appendChild(reminderBanner);
      }
    }

    // Task view toolbar
    const toolbar = el('div', { class: 'task-view-toolbar' });

    // Initialize task view mode
    this.taskViewMode = this.taskViewMode || 'table';

    const viewToggle = el('div', { class: 'group-toggle', style: 'margin-right: 8px;' });
    const viewButtons = {};
    ['table', 'board', 'list'].forEach(mode => {
      const btn = el('button', {
        type: 'button',
        html: ViewIcons[mode] + ' ' + (mode === 'table' ? 'Table' : mode === 'board' ? 'Board' : 'List'),
        class: this.taskViewMode === mode ? 'active' : ''
      });
      viewButtons[mode] = btn;
      btn.addEventListener('click', () => {
        if (this.taskViewMode === mode) return;
        this.taskViewMode = mode;
        Object.keys(viewButtons).forEach(m => {
          viewButtons[m].classList.toggle('active', m === mode);
        });
        renderGroups();
      });
      viewToggle.appendChild(btn);
    });
    toolbar.appendChild(viewToggle);

    // Employee Filter Options
    const empOptions = [{ value: '', text: 'All Employees' }];
    const uniqueEmpNames = new Set();
    (DB.getAll('users') || []).forEach(u => {
      if (u.name) uniqueEmpNames.add(u.name.trim());
    });
    (DB.getAll('groundWorkers') || []).forEach(gw => {
      if (gw.name) uniqueEmpNames.add(gw.name.trim());
    });
    sortedTasks.forEach(t => {
      const names = getTaskAllAssigneeNames(t);
      names.forEach(name => {
        if (name) uniqueEmpNames.add(name.trim());
      });
    });
    Array.from(uniqueEmpNames).sort().forEach(name => {
      empOptions.push({ value: name, text: name });
    });

    const empFilter = createSearchableDropdown({
      placeholder: 'Filter Employee...',
      options: empOptions,
      maxWidth: '180px'
    });
    empFilter.value = container.employeeFilter || '';
    const updateEmpFilter = () => {
      container.employeeFilter = (empFilter.searchText || '').trim() || empFilter.value || null;
      renderGroups();
    };
    empFilter.addEventListener('change', updateEmpFilter);
    empFilter.addEventListener('input', updateEmpFilter);
    toolbar.appendChild(empFilter);



    // Compute filter counts from tasks
    const todayStrChip = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })).toISOString().slice(0, 10);
    const filterCounts = {
      'Missing logs': sortedTasks.filter(t => {
        if (t.status === 'Completed' || t.status === 'Cancelled') return false;
        const taskIsGround = t.assigneeName && !t.assigneeId;
        if (taskIsGround && !(t.timeLogs || []).some(l => l.date === todayStrChip)) return true;
        return (t.checklist || []).some(item => item.assigneeName && !item.assigneeId && !(item.timeLogs || []).some(l => l.date === todayStrChip));
      }).length,
      'Blocked': sortedTasks.filter(t => {
        const preds = t.predecessors || [];
        if (preds.some(pid => { const pt = DB.getById('tasks', pid); return pt && pt.status !== 'Completed'; })) return true;
        return (t.checklist || []).some(item => isChecklistBlocked(item, t.checklist));
      }).length,
      'Incomplete checklist': sortedTasks.filter(t => {
        const comp = getTaskChecklistCompletion(t);
        return comp.total > 0 && comp.done < comp.total;
      }).length,
      'Mine': sortedTasks.filter(t => {
        if (t.assigneeId === Auth.user.id || t.assignedTo === Auth.user.id) return true;
        if (t.assigneeName && Auth.user?.name && t.assigneeName === Auth.user.name) return true;
        return false;
      }).length
    };

    const filterChips = el('div', { class: 'filter-chips' });
    const filterButtons = {};
    ['Missing logs', 'Blocked', 'Incomplete checklist', 'Mine'].forEach(filter => {
      const chip = el('button', {
        type: 'button',
        class: 'filter-chip' + (container.activeFilters.has(filter) ? ' active' : '')
      });
      const count = filterCounts[filter] || 0;
      if (count > 0) {
        chip.appendChild(el('span', { class: 'count', text: String(count) }));
      }
      chip.appendChild(document.createTextNode(filter));
      filterButtons[filter] = chip;
      chip.addEventListener('click', () => {
        if (container.activeFilters.has(filter)) {
          container.activeFilters.delete(filter);
        } else {
          container.activeFilters.clear();
          container.activeFilters.add(filter);
        }
        updateToolbar();
        renderGroups();
      });
      filterChips.appendChild(chip);
    });
    toolbar.appendChild(filterChips);

    const updateToolbar = () => {
      Object.keys(filterButtons).forEach(filter => {
        filterButtons[filter].classList.toggle('active', container.activeFilters.has(filter));
      });
    };

    const actionsWrap = el('div', {
      style: 'margin-left: auto; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;'
    });

    const searchInput = el('input', {
      type: 'search',
      class: 'search-input form-control',
      placeholder: 'Search tasks, assignees, records…',
      id: 'taskSearch'
    });
    searchInput.addEventListener('input', (e) => {
      container.searchQuery = e.target.value.toLowerCase();
      renderGroups();
    });

    const addTaskBtn = el('button', {
      type: 'button',
      class: 'btn btn-primary btn-sm',
      text: '+ Add Task'
    });
    addTaskBtn.addEventListener('click', () => {
      this.showAddTaskModal(wr.id, () => App.handleRoute());
    });

    actionsWrap.appendChild(searchInput);
    actionsWrap.appendChild(addTaskBtn);
    toolbar.appendChild(actionsWrap);

    container.appendChild(toolbar);

    // Bulk action bar
    const bulkBar = el('div', { class: 'bulk-action-bar' });
    container.appendChild(bulkBar);

    // Empty-state guidance when WR has no tasks
    if (tasks.length === 0) {
      const emptyState = el('div', { class: 'task-empty-state' });
      emptyState.appendChild(el('div', {
        html: '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M17.636 18.364l-.707-.707M6.343 5.343l-.707-.707M3 12h1M5.343 18.364l.707-.707M12 21v-1M12 7a5 5 0 110 10 5 5 0 010-10z"/></svg>'
      }));
      emptyState.appendChild(el('p', { text: 'No tasks have been added to this work request yet.' }));
      const addFirstBtn = el('button', { type: 'button', class: 'btn btn-primary', text: '+ Add First Task' });
      addFirstBtn.addEventListener('click', () => { this.showAddTaskModal(wr.id, () => App.handleRoute()); });
      emptyState.appendChild(addFirstBtn);
      container.appendChild(emptyState);
    }

    const updateBulkBar = () => {
      bulkBar.innerHTML = '';
      const count = container.selectedTaskIds.size;
      if (count === 0) {
        bulkBar.style.display = 'none';
        return;
      }
      bulkBar.style.display = 'flex';
      bulkBar.appendChild(el('span', { class: 'bulk-selection-label', text: `${count} task${count === 1 ? '' : 's'} selected` }));

      const requestLogsBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Request Logs' });
      requestLogsBtn.addEventListener('click', () => {
        const todayStr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })).toISOString().slice(0, 10);
        const selected = sortedTasks.filter(t => container.selectedTaskIds.has(t.id));
        const lines = [];
        selected.forEach(t => {
          if (t.status === 'Completed' || t.status === 'Cancelled') return;
          const taskIsGround = t.assigneeName && !t.assigneeId;
          const taskMissing = taskIsGround && !(t.timeLogs || []).some(l => l.date === todayStr);
          if (taskMissing) {
            lines.push(`- ${t.title} (assigned to ${t.assigneeName})`);
          }
          (t.checklist || []).forEach(item => {
            const itemIsGround = item.assigneeName && !item.assigneeId;
            const itemMissing = itemIsGround && !(item.timeLogs || []).some(l => l.date === todayStr);
            if (itemMissing) {
              lines.push(`- ${t.title}: ${item.text} (assigned to ${item.assigneeName})`);
            }
          });
        });
        const subject = `Time Log Request: ${wr.title}`;
        const body = lines.length > 0
          ? `Hi,\n\nPlease reply with your time logs for today (${todayStr}) for the following items:\n\n${lines.join('\n')}\n\nPlease include:\n- Start Time:\n- End Time:\n- Brief description of what you accomplished:\n\nThank you!`
          : `Hi,\n\nPlease reply with your time logs for today (${todayStr}).\n\nPlease include:\n- Start Time:\n- End Time:\n- Brief description of what you accomplished:\n\nThank you!`;
        navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`).then(() => {
          this.showMessage('Copied', 'Time log request copied to clipboard.', 'success');
        }).catch(() => {
          this.showMessage('Error', 'Could not copy to clipboard.', 'danger');
        });
      });
      bulkBar.appendChild(requestLogsBtn);

      const assignWrap = el('div', { class: 'bulk-assign-wrap', style: 'display:flex; align-items:center; gap:8px;' });
      const assignDropdown = this.createGroundWorkerDropdown({
        selectedGroundWorkerName: '',
        placeholder: 'Assign to...',
        maxWidth: '180px',
        className: 'bulk-assign-dropdown',
        onChange: () => {}
      });
      assignWrap.appendChild(assignDropdown);
      const assignBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Assign' });
      assignBtn.addEventListener('click', () => {
        const name = (assignDropdown.searchText || '').trim();
        const selected = sortedTasks.filter(t => container.selectedTaskIds.has(t.id));
        // Bulk assign dropdown is single-select, so only one name can be chosen.
        // Treat that single name as the primary assignee and clear any co-assignees.
        selected.forEach(t => {
          DB.update('tasks', t.id, {
            assigneeId: null,
            assigneeName: name || null,
            coAssignees: [],
            status: name ? 'Assigned' : 'Draft',
            updatedAt: new Date().toISOString()
          });
        });
        if (name && !DB.getAll('groundWorkers').some(gw => gw.name.toLowerCase() === name.toLowerCase())) {
          DB.insert('groundWorkers', { id: generateId('gw'), name });
        }
        App.handleRoute();
      });
      assignWrap.appendChild(assignBtn);
      bulkBar.appendChild(assignWrap);

      const markDoneBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Mark Done' });
      markDoneBtn.addEventListener('click', () => {
        const selected = sortedTasks.filter(t => container.selectedTaskIds.has(t.id));
        let success = 0;
        const errors = [];
        selected.forEach(t => {
          const res = this.updateTaskStatus(t.id, 'Completed');
          if (res.error) {
            errors.push(`${t.title}: ${res.error}`);
          } else {
            success++;
          }
        });
        if (errors.length > 0) {
          this.showMessage('Bulk Mark Done', `${success} updated, ${errors.length} failed. ${errors.join(' ')}`, 'warning');
        } else {
          this.showMessage('Bulk Mark Done', `${success} task${success === 1 ? '' : 's'} marked Completed.`, 'success');
        }
        App.handleRoute();
      });
      bulkBar.appendChild(markDoneBtn);

      const logTimeBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Log Time' });
      logTimeBtn.addEventListener('click', () => {
        const selected = sortedTasks.filter(t => container.selectedTaskIds.has(t.id));
        if (selected.length === 0) return;
        const form = el('form', { class: 'form-stacked' });
        const workerInput = el('input', { type: 'text', name: 'workerName', placeholder: 'Worker name', value: Auth.user?.name || '' });
        form.appendChild(el('div', { class: 'form-group' }, [el('label', { text: 'Worker Name' }), workerInput]));
        const dateInput = el('input', { type: 'date', name: 'date', required: true, value: manilaToday() });
        form.appendChild(el('div', { class: 'form-group' }, [el('label', { text: 'Date *' }), dateInput]));
        const startInput = el('input', { type: 'time', name: 'start', required: true });
        form.appendChild(el('div', { class: 'form-group' }, [el('label', { text: 'Start Time *' }), startInput]));
        const endInput = el('input', { type: 'time', name: 'end', required: true });
        form.appendChild(el('div', { class: 'form-group' }, [el('label', { text: 'End Time *' }), endInput]));
        const noteInput = el('input', { type: 'text', name: 'note', placeholder: 'What did you work on?' });
        form.appendChild(el('div', { class: 'form-group' }, [el('label', { text: 'Note / Activity' }), noteInput]));
        const hoursInput = el('input', { type: 'text', name: 'hours', readOnly: true, value: '0.00', style: 'background: var(--bg); cursor: not-allowed;' });
        form.appendChild(el('div', { class: 'form-group' }, [el('label', { text: 'Calculated Hours' }), hoursInput]));

        function nextManilaDate(dateStr) {
          const d = new Date(dateStr + 'T00:00:00');
          d.setDate(d.getDate() + 1);
          return d.toISOString().slice(0, 10);
        }

        function updateHours() {
          const start = startInput.value;
          const end = endInput.value;
          if (start && end) {
            const [sh, sm] = start.split(':').map(Number);
            const [eh, em] = end.split(':').map(Number);
            const startMin = sh * 60 + sm;
            const endMin = eh * 60 + em;
            const totalMin = endMin > startMin ? endMin - startMin : endMin + 1440 - startMin;
            const hours = Math.round(totalMin / 60 * 4) / 4;
            hoursInput.value = hours.toFixed(2);
          } else {
            hoursInput.value = '0.00';
          }
        }
        startInput.addEventListener('change', updateHours);
        endInput.addEventListener('change', updateHours);
        const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Save Logs' });
        form.appendChild(submitBtn);
        const overlay = this.showModal('Bulk Log Time', form, null);
        form.addEventListener('submit', (e) => {
          e.preventDefault();
          const dateVal = dateInput.value;
          const start = startInput.value;
          const end = endInput.value;
          const noteVal = noteInput.value;

          if (!dateVal || !start || !end) return;

          const [sh, sm] = start.split(':').map(Number);
          const [eh, em] = end.split(':').map(Number);
          const startMin = sh * 60 + sm;
          const endMin = eh * 60 + em;
          const workerName = workerInput.value.trim() || (DB.getById('users', Auth.user.id)?.name || '');

          let entries = [];
          if (endMin > startMin) {
            const hours = Math.round((endMin - startMin) / 60 * 4) / 4;
            if (hours > 0) entries.push({ date: dateVal, startTime: start, endTime: end, hours });
          } else {
            const hours1 = Math.round((1440 - startMin) / 60 * 4) / 4;
            const nextDate = nextManilaDate(dateVal);
            const hours2 = Math.round(endMin / 60 * 4) / 4;
            if (hours1 > 0) entries.push({ date: dateVal, startTime: start, endTime: '23:59', hours: hours1 });
            if (hours2 > 0) entries.push({ date: nextDate, startTime: '00:00', endTime: end, hours: hours2 });
          }

          if (entries.length === 0) {
            this.showMessage('Log too short', 'Log too short to record.', 'warning');
            return;
          }

          let skipped = 0;
          let saved = 0;
          selected.forEach(t => {
            const taskLogs = t.timeLogs || [];
            const alreadyLogged = entries.some(entry => taskLogs.some(l => l.date === entry.date && (l.workerName || '') === workerName));
            if (alreadyLogged) {
              skipped++;
              return;
            }
            const newEntries = entries.map(entry => ({
              userId: Auth.user.id,
              loggedByUserId: Auth.user.id,
              workerName,
              startTime: entry.startTime,
              endTime: entry.endTime,
              date: entry.date,
              note: noteVal,
              hours: entry.hours,
              checklistItemId: null
            }));
            DB.update('tasks', t.id, {
              timeLogs: [...taskLogs, ...newEntries],
              updatedAt: new Date().toISOString()
            });
            saved++;
          });
          overlay.remove();
          this.showMessage('Bulk Log Time', `${saved} log${saved === 1 ? '' : 's'} saved, ${skipped} skipped (already logged).`, 'success');
          App.handleRoute();
        });
      });
      bulkBar.appendChild(logTimeBtn);

      const clearLink = el('a', { href: 'javascript:void(0)', class: 'bulk-clear-link', text: 'Clear' });
      clearLink.addEventListener('click', () => {
        container.selectedTaskIds.clear();
        updateBulkBar();
        renderGroups();
      });
      bulkBar.appendChild(clearLink);
    };

    const renderGroups = () => {
      listWrapper.innerHTML = '';
      if (tasks.length === 0) return;

      const todayStr = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' })).toISOString().slice(0, 10);

      const activeFilters = Array.from(container.activeFilters);
      const query = (container.searchQuery || '').trim();
      const filteredTasks = sortedTasks.filter(t => {
        if (query) {
          const titleText = (t.title || '').toLowerCase();
          const assigneeText = (t.assigneeName || '').toLowerCase();
          const coAssigneeText = (t.coAssignees || []).map(name => (name || '').toLowerCase());
          
          const matchTitle = titleText.includes(query);
          const matchAssignee = assigneeText.includes(query);
          const matchCoAssignees = coAssigneeText.some(name => name.includes(query));
          
          if (!matchTitle && !matchAssignee && !matchCoAssignees) {
            return false;
          }
        }

        // Employee filter (matches primary, co-assignees, and sub-task assignees/co-assignees)
        if (container.employeeFilter) {
          const emp = container.employeeFilter.trim().toLowerCase();
          const primaryName = (t.assigneeName || '').trim().toLowerCase();
          const coAssignees = (t.coAssignees || []).map(name => (name || '').trim().toLowerCase());
          const checklistAssignees = (t.checklist || []).flatMap(item => {
            const names = [];
            if (item.assigneeName) names.push(item.assigneeName.trim().toLowerCase());
            if (item.coAssignees && Array.isArray(item.coAssignees)) {
              item.coAssignees.forEach(n => names.push(n.trim().toLowerCase()));
            }
            return names;
          });
          
          const matchPrimary = primaryName.includes(emp);
          const matchCo = coAssignees.some(name => name.includes(emp));
          const matchChecklist = checklistAssignees.some(name => name.includes(emp));
          if (!matchPrimary && !matchCo && !matchChecklist) return false;
        }



        if (activeFilters.length === 0) return true;

        const checks = {
          'Missing logs': () => {
            if (t.status === 'Completed' || t.status === 'Cancelled') return false;
            const taskIsGround = t.assigneeName && !t.assigneeId;
            const taskMissing = taskIsGround && !(t.timeLogs || []).some(l => l.date === todayStr);
            if (taskMissing) return true;
            return (t.checklist || []).some(item => {
              const itemIsGround = item.assigneeName && !item.assigneeId;
              if (!itemIsGround) return false;
              return !(item.timeLogs || []).some(l => l.date === todayStr);
            });
          },
          'Blocked': () => {
            const preds = t.predecessors || [];
            if (preds.some(pid => {
              const pt = DB.getById('tasks', pid);
              return pt && pt.status !== 'Completed';
            })) return true;
            return (t.checklist || []).some(item => isChecklistBlocked(item, t.checklist));
          },
          'Incomplete checklist': () => {
            const comp = getTaskChecklistCompletion(t);
            return comp.total > 0 && comp.done < comp.total;
          },
          'Mine': () => {
            if (t.assigneeId === Auth.user.id || t.assignedTo === Auth.user.id) return true;
            if (t.assigneeName && Auth.user?.name && t.assigneeName === Auth.user.name) return true;
            if ((t.coAssignees || []).some(n => n && n === Auth.user?.name)) return true;
            return (t.checklist || []).some(item => item.assigneeName && item.assigneeName === Auth.user.name);
          }
        };

        return activeFilters.every(f => checks[f]());
      });

      if (this.taskViewMode === 'board') {
        const board = el('div', { class: 'board-v2', style: 'margin-top: 0;' });
        const statuses = ['Draft', 'Assigned', 'In Progress', 'For Review', 'Completed', 'Cancelled'];
        const statusColors = {
          'Draft': '#94a3b8',
          'Assigned': '#2f6feb',
          'In Progress': '#eab308',
          'For Review': '#a855f7',
          'Completed': '#17a34a',
          'Cancelled': '#dc2626'
        };

        statuses.forEach(st => {
          const colColor = statusColors[st] || '#cbd5e1';
          const colTasks = filteredTasks.filter(t => t.status === st);
          const col = el('div', { class: 'board-column-v2' });
          col.style.setProperty('--column-phase-color', colColor);
          
          const header = el('div', { class: 'board-column-header-v2' });
          const titleWrap = el('div', { class: 'board-column-title' });
          titleWrap.appendChild(el('span', { class: 'board-column-dot', style: 'background:' + colColor + ';' }));
          titleWrap.appendChild(document.createTextNode(st));
          titleWrap.appendChild(el('span', { class: 'board-column-count', text: String(colTasks.length) }));
          header.appendChild(titleWrap);
          col.appendChild(header);

          const cardContainer = el('div', { class: 'board-cards-scroll', style: 'display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-3);' });

          if (colTasks.length === 0) {
            cardContainer.appendChild(el('div', { class: 'empty-state', text: 'No tasks' }));
          }

          colTasks.forEach(t => {
            const card = el('div', { class: 'board-card board-card-v2', style: 'cursor: pointer;' });
            card.style.borderLeftColor = colColor;
            
            if (window.SidePaneInstance && window.SidePaneInstance.isOpen() && window.SidePaneInstance.recordId === t.id) {
              card.classList.add('side-pane-active');
              window.SidePaneInstance.activeElement = card;
            }

            card.addEventListener('click', () => {
              this.showTaskSidePane(t.id, card);
            });

            const topRow = el('div', { class: 'card-v2-top' });
            const pClass = { 'Urgent': 'badge-danger', 'Priority': 'badge-warn', 'Low Priority': 'badge-info' }[t.priority] || 'badge-muted';
            topRow.appendChild(el('span', { class: `badge ${pClass}`, text: t.priority || 'Normal' }));
            if (t.dueDate) {
              topRow.appendChild(el('span', { class: 'card-v2-date', text: formatDate(t.dueDate) }));
            }
            card.appendChild(topRow);

            const titleRow = el('div', { class: 'card-v2-title-row' });
            titleRow.appendChild(el('div', { class: 'card-v2-title', text: t.title }));
            card.appendChild(titleRow);

            const comp = getTaskChecklistCompletion(t);
            const metaRow = el('div', { class: 'card-v2-meta', style: 'margin-top: 8px;' });
            if (comp.total > 0) {
              const metaLeft = el('div', { class: 'card-v2-meta-left' });
              const progBar = el('div', { class: 'card-v2-progress' });
              progBar.appendChild(el('div', { class: 'card-v2-progress-fill', style: `width: ${comp.percent}%; background-color: ${colColor};` }));
              metaLeft.appendChild(progBar);
              metaLeft.appendChild(el('span', { class: 'card-v2-meta-text', text: `${comp.done}/${comp.total}` }));
              metaRow.appendChild(metaLeft);
            }

            const assigneeName = t.assigneeName || (t.assigneeId || t.assignedTo ? DB.getById('users', t.assigneeId || t.assignedTo)?.name : null);
            if (assigneeName) {
              const avatars = el('div', { class: 'card-v2-avatars' });
              const av = el('div', { class: 'avatar-xs', title: assigneeName });
              av.textContent = assigneeName.slice(0, 1).toUpperCase();
              av.style.background = 'color-mix(in oklab, var(--accent), transparent 85%)';
              av.style.color = 'var(--accent)';
              av.style.fontWeight = '700';
              av.style.display = 'flex';
              av.style.alignItems = 'center';
              av.style.justifyContent = 'center';
              av.style.borderRadius = '50%';
              av.style.fontSize = '10px';
              avatars.appendChild(av);
              metaRow.appendChild(avatars);
            }
            card.appendChild(metaRow);

            cardContainer.appendChild(card);
          });

          col.appendChild(cardContainer);
          board.appendChild(col);
        });

        listWrapper.appendChild(board);
        return;
      }

      if (this.taskViewMode === 'list') {
        const list = el('div', { class: 'list-view operations-list-view', style: 'margin-top: 16px; display: flex; flex-direction: column; gap: var(--space-2);' });
        
        filteredTasks.forEach(t => {
          const row = el('div', { class: 'list-item', style: 'cursor: pointer; display: flex; align-items: center; justify-content: space-between; padding: var(--space-3) var(--space-4); border-radius: var(--radius-sm); border: 1px solid var(--border); background: var(--surface);' });
          
          if (window.SidePaneInstance && window.SidePaneInstance.isOpen() && window.SidePaneInstance.recordId === t.id) {
            row.classList.add('side-pane-active');
            window.SidePaneInstance.activeElement = row;
          }

          row.addEventListener('click', () => {
            this.showTaskSidePane(t.id, row);
          });

          const textCol = el('div');
          textCol.appendChild(el('div', { class: 'list-item-title', text: t.title }));
          
          const assigneeName = t.assigneeName || (t.assigneeId || t.assignedTo ? DB.getById('users', t.assigneeId || t.assignedTo)?.name : null);
          const metaText = (assigneeName ? `${assigneeName} | ` : '') + (t.dueDate ? `Due: ${formatDate(t.dueDate)}` : 'No due date');
          textCol.appendChild(el('div', { class: 'list-item-meta', text: metaText }));
          
          const badgeRow = el('div', { style: 'display: flex; gap: 6px; margin-top: 4px;' });
          const pClass = { 'Urgent': 'badge-danger', 'Priority': 'badge-warn', 'Low Priority': 'badge-info' }[t.priority] || 'badge-muted';
          badgeRow.appendChild(el('span', { class: `badge ${pClass}`, text: t.priority || 'Normal' }));
          
          const comp = getTaskChecklistCompletion(t);
          if (comp.total > 0) {
            badgeRow.appendChild(el('span', { class: 'badge badge-info', text: `Checklist: ${comp.done}/${comp.total}` }));
          }
          textCol.appendChild(badgeRow);

          row.appendChild(textCol);
          
          const statusBadgeClass = {
            'Draft': 'badge-draft',
            'Assigned': 'badge-preprocessing',
            'In Progress': 'badge-processing',
            'For Review': 'badge-billing',
            'Completed': 'badge-success',
            'Cancelled': 'badge-danger'
          }[t.status] || 'badge-draft';
          row.appendChild(el('span', { class: `badge ${statusBadgeClass}`, text: t.status }));

          list.appendChild(row);
        });

        listWrapper.appendChild(list);
        return;
      }

      let groups = {};
      if (container.groupBy === 'phase') {
        const name = wr.status ? `${wr.status} Tasks` : 'General Tasks';
        groups[name] = filteredTasks;
      } else if (container.groupBy === 'assignee') {
        filteredTasks.forEach(t => {
          const assignee = t.assigneeName
            ? { name: t.assigneeName }
            : DB.getById('users', t.assigneeId || t.assignedTo);
          const name = assignee?.name || 'Unassigned';
          groups[name] = groups[name] || [];
          groups[name].push(t);
        });
      } else {
        groups['All Tasks'] = filteredTasks;
      }

      for (const [groupName, groupTasks] of Object.entries(groups)) {
        const groupEl = el('div', { class: 'task-group-v2' });
        const groupHeader = el('div', { class: 'task-group-header' });
        groupHeader.appendChild(el('span', { text: groupName }));
        const totalCheckDone = groupTasks.reduce((sum, t) => sum + getTaskChecklistCompletion(t).done, 0);
        const totalCheckTotal = groupTasks.reduce((sum, t) => sum + getTaskChecklistCompletion(t).total, 0);
        const groupHours = groupTasks.reduce((sum, t) => sum + getTaskTotalHours(t), 0);
        const statsText = `${groupTasks.length} tasks${totalCheckTotal > 0 ? ` • ${totalCheckDone}/${totalCheckTotal} items done` : ''}${groupHours > 0 ? ` • ${groupHours} hrs` : ''}`;
        groupHeader.appendChild(el('span', { class: 'task-group-count group-header-stats', text: statsText }));

      groupEl.appendChild(groupHeader);

      const tableHeader = el('div', { class: 'table-header' });
      ['', 'Task', 'Assigned To', 'Due Date', 'Status', 'Checklist', 'Linked Records', 'Time', 'Actions'].forEach(h => {
        tableHeader.appendChild(el('span', { text: h }));
      });
      groupEl.appendChild(tableHeader);

      let totalHours = 0;

      groupTasks.forEach(t => {
        const assignee = t.assigneeName
          ? { name: t.assigneeName }
          : DB.getById('users', t.assigneeId || t.assignedTo);
        const hours = getTaskTotalHours(t);
        totalHours += hours;

        const expanded = this.expandedTaskIds.has(t.id);
        const selected = container.selectedTaskIds.has(t.id);
        const rowEl = el('div', { class: 'task-row' + (expanded ? ' expanded' : '') + (selected ? ' selected' : '') });
        rowEl.dataset.id = t.id;

        // 1. Checkbox cell
        const cellCheckbox = el('div', { class: 'cell' });
        cellCheckbox.addEventListener('click', (e) => e.stopPropagation()); // Prevent accordion toggle
        const rowCheckbox = el('input', {
          type: 'checkbox',
          class: 'row-check',
          title: 'Select task'
        });
        rowCheckbox.checked = selected;
        rowCheckbox.addEventListener('click', (e) => {
          e.stopPropagation();
          if (rowCheckbox.checked) {
            container.selectedTaskIds.add(t.id);
            rowEl.classList.add('selected');
          } else {
            container.selectedTaskIds.delete(t.id);
            rowEl.classList.remove('selected');
          }
          updateBulkBar();
        });
        cellCheckbox.appendChild(rowCheckbox);
        rowEl.appendChild(cellCheckbox);

        // 2. Title cell
        const cellTitle = el('div', { class: 'cell cell-title' });
        const caret = el('span', { class: 'caret', text: '›' });
        cellTitle.appendChild(caret);

        const titleStack = el('div', { class: 'title-stack' });
        const titleMain = el('span', {
          class: 'title-main' + (t.status === 'Completed' ? ' done' : ''),
          text: t.title
        });
        titleStack.appendChild(titleMain);

        // Show dependencies if they exist
        const preds = t.predecessors || [];
        if (preds.length > 0) {
          const predTitles = preds.map(pid => {
            const pt = DB.getById('tasks', pid);
            return pt ? pt.title : null;
          }).filter(Boolean);
          if (predTitles.length > 0) {
            const depLabel = el('span', {
              class: 'title-sub',
              text: 'Blocking dependencies: ' + predTitles.join(', ')
            });
            titleStack.appendChild(depLabel);
          }
        }
        cellTitle.appendChild(titleStack);
        rowEl.appendChild(cellTitle);

        // 3. Assignee cell
        const cellAssignee = el('div', { class: 'cell assignee-cell' });
        cellAssignee.addEventListener('click', (e) => e.stopPropagation()); // Prevent accordion toggle

        const allAssigneeNames = getTaskAllAssigneeNames(t);

        if (wr.status === 'Draft') {
          // Ground worker assignee — typable dropdown like the filter tray
          const gwDropdown = this.createGroundWorkerDropdown({
            selectedGroundWorkerName: t.assigneeName || '',
            placeholder: 'Employee...',
            className: 'inline-ground-worker-autocomplete',
            onChange: ({ assigneeName }) => {
              const name = assigneeName || '';
              DB.update('tasks', t.id, {
                assigneeId: null,
                assigneeName: name || null,
                status: name ? 'Assigned' : 'Draft',
                updatedAt: new Date().toISOString()
              });
              App.handleRoute();
            }
          });

          const assigneeWrap = el('div', { class: 'task-assignee-wrapper' });
          assigneeWrap.appendChild(gwDropdown);
          assigneeWrap.appendChild(this.renderTaskCoAssigneePicker(t, { primaryName: t.assigneeName || '', className: 'inline-coassignee-dropdown' }, isDraft, true));
          cellAssignee.appendChild(assigneeWrap);
        } else {
          cellAssignee.appendChild(this.renderAssigneeAvatarsList(allAssigneeNames));
        }
        rowEl.appendChild(cellAssignee);

        // 4. Due Date cell
        const cellDueDate = el('div', {
          class: 'cell time-cell',
          text: t.dueDate ? formatDate(t.dueDate) : 'N/A'
        });
        rowEl.appendChild(cellDueDate);

        // 5. Status cell
        const cellStatus = el('div', { class: 'cell' });
        cellStatus.addEventListener('click', (e) => e.stopPropagation()); // Prevent accordion toggle
        const statusWrapper = el('div', { class: 'status-dropdown-wrapper-v2' });
        const statusSel = el('select', { class: 'status-select' });

        const validStatuses = this.getValidNextStatuses(t);
        const flow = ['Draft', 'Assigned', 'In Progress', 'For Review', 'Completed', 'Cancelled'];
        const checklistCompletion = getTaskChecklistCompletion(t);
        const hasIncompleteChecklist = checklistCompletion.total > 0 && checklistCompletion.done < checklistCompletion.total;
        flow.forEach(s => {
          const opt = el('option', { value: s, text: s });
          if (s === t.status) opt.selected = true;
          const blockedByChecklist = hasIncompleteChecklist && (s === 'Completed' || s === 'For Review');
          const noAssignee = !(t.assigneeId || t.assignedTo || t.assigneeName);
          if (isArchived) {
            opt.disabled = true;
            opt.title = 'Work request is archived';
          } else if (blockedByChecklist) {
            opt.disabled = true;
            opt.title = `${checklistCompletion.total - checklistCompletion.done} of ${checklistCompletion.total} requirement items incomplete`;
          } else if (s === 'Assigned' && noAssignee) {
            opt.disabled = true;
            opt.title = 'Assign an employee first';
          } else if (!validStatuses.includes(s)) {
            opt.disabled = true;
            opt.title = `Cannot change to ${s} in this phase`;
          }
          statusSel.appendChild(opt);
        });
        if (isArchived) statusSel.disabled = true;

        const sColors = { 'Completed': '#17a34a', 'In Progress': '#eab308', 'Draft': '#6b6b6b', 'For Review': '#2f6feb', 'Assigned': '#2f6feb', 'Cancelled': '#dc2626' };
        statusSel.style.color = sColors[t.status] || 'var(--fg)';

        statusSel.addEventListener('change', () => {
          const newStatus = statusSel.value;
          const originalStatus = t.status;
          const resetDropdown = () => {
            statusSel.value = originalStatus;
            statusSel.style.color = sColors[originalStatus] || 'var(--fg)';
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
        cellStatus.appendChild(statusWrapper);
        rowEl.appendChild(cellStatus);

        // 6. Checklist cell
        const cellChecklist = el('div', { class: 'cell checklist-cell' });
        if (checklistCompletion.total === 0) {
          cellChecklist.appendChild(el('span', { text: 'N/A', class: 'text-muted' }));
        } else {
          const radius = 8;
          const circumference = 2 * Math.PI * radius; // ~50.27
          const offset = circumference - (checklistCompletion.percent / 100) * circumference;
          const ring = el('div', {
            class: 'progress-ring-wrapper',
            html: `<svg class="progress-ring" viewBox="0 0 20 20" style="width:18px; height:18px;"><circle cx="10" cy="10" r="${radius}" fill="none" stroke="var(--border)" stroke-width="3" /><circle cx="10" cy="10" r="${radius}" fill="none" stroke="var(--success)" stroke-width="3" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round" transform="rotate(-90 10 10)" /></svg>`
          });
          const progressText = el('span', { class: 'progress-text', text: `${checklistCompletion.done}/${checklistCompletion.total}` });
          const incompleteNames = getIncompleteChecklistNames(t);
          cellChecklist.title = incompleteNames.length > 0 ? `Remaining: ${incompleteNames.join(', ')}` : 'All checklist items complete';
          cellChecklist.appendChild(ring);
          cellChecklist.appendChild(progressText);
        }
        rowEl.appendChild(cellChecklist);

        // 7. Linked Records cell
        const cellLinked = el('div', { class: 'cell' });
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
          badge.addEventListener('click', (e) => { e.stopPropagation(); location.hash = '#billing/detail/' + linkedInv.id; });
          linkedWrap.appendChild(badge);
        }
        linkedDisb.forEach(d => {
          const badge = el('span', { class: 'badge badge-warning', text: '💸 ' + d.category, style: 'cursor:pointer; font-size:10px;' });
          badge.addEventListener('click', (e) => { e.stopPropagation(); location.hash = '#disbursement/detail/' + d.id; });
          linkedWrap.appendChild(badge);
        });
        
        const needsInvoice = t.title.toLowerCase().includes('invoice') || t.title.toLowerCase().includes('bill');
        const needsDisbursement = t.title.toLowerCase().includes('expense') || t.title.toLowerCase().includes('disburse') || t.title.toLowerCase().includes('payment') || t.title.toLowerCase().includes('reimburse');
        if (!isArchived && needsInvoice && !linkedInv) {
          const linkHint = el('span', {
            text: '⚠ Link invoice required',
            style: 'font-size:10px;color:var(--warn);font-weight:500;cursor:pointer;'
          });
          linkHint.addEventListener('click', (e) => { e.stopPropagation(); this.showLinkFinancialModal(t.id); });
          linkedWrap.appendChild(linkHint);
        }
        if (!isArchived && needsDisbursement && linkedDisb.length === 0) {
          const linkHint = el('span', {
            text: '⚠ Link expense required',
            style: 'font-size:10px;color:var(--warn);font-weight:500;cursor:pointer;'
          });
          linkHint.addEventListener('click', (e) => { e.stopPropagation(); this.showLinkFinancialModal(t.id); });
          linkedWrap.appendChild(linkHint);
        }

        if (!linkedInv && linkedDisb.length === 0 && !needsInvoice && !needsDisbursement) {
          linkedWrap.appendChild(el('span', { text: 'N/A', style: 'color:var(--muted);' }));
        }
        cellLinked.appendChild(linkedWrap);
        rowEl.appendChild(cellLinked);

        // 8. Time cell
        const cellTime = el('div', {
          class: 'cell time-cell font-mono',
          text: hours > 0 ? `${hours}h` : 'N/A'
        });
        rowEl.appendChild(cellTime);

        // 9. Actions cell
        const cellActions = el('div', { class: 'cell actions-cell' });
        cellActions.addEventListener('click', (e) => e.stopPropagation()); // Prevent accordion toggle

        // Log Time button
        const logTimeBtn = el('button', {
          class: 'action-icon primary',
          title: 'Log Time',
          html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>`
        });
        logTimeBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showAddTimeLogModal(t.id);
        });

        // More Actions button and its dropdown menu
        const actionMenu = el('div', { class: 'action-menu' });

        const moreActionsBtn = el('button', {
          class: 'action-icon action-menu-toggle',
          title: 'More actions',
          html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="19" r="1.5" fill="currentColor"/></svg>`
        });

        const menuList = el('div', { class: 'action-menu-list hidden' });

        // Bind click event to toggle classes
        moreActionsBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          document.querySelectorAll('.action-menu-list').forEach(m => {
            if (m !== menuList) {
              m.classList.add('hidden');
              m.classList.remove('open');
            }
          });
          if (menuList.classList.contains('hidden')) {
            menuList.classList.remove('hidden');
            setTimeout(() => {
              menuList.classList.add('open');
            }, 10);
          } else {
            menuList.classList.remove('open');
            menuList.classList.add('hidden');
          }
        });

        // Request Log item
        if (t.assigneeName && !t.assigneeId) {
          const reqLogItem = el('button', {
            class: 'action-menu-item',
            html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> Request Log`
          });
          reqLogItem.addEventListener('click', (e) => {
            e.stopPropagation();
            menuList.classList.remove('open');
            menuList.classList.add('hidden');
            const text = `Subject: Time Log Request: ${t.title}\n\nHi ${t.assigneeName},\n\nPlease reply with your time log for today for the task: ${t.title} (Work Request: ${wr.title}).\n\nPlease include:\n- Start Time:\n- End Time:\n- Brief description of what you accomplished:\n\nThank you!`;
            navigator.clipboard.writeText(text).then(() => {
              this.showMessage('Copied', `Time log request copied for ${t.assigneeName}.`, 'success');
            }).catch(() => {
              this.showMessage('Error', 'Could not copy to clipboard.', 'danger');
            });
          });
          menuList.appendChild(reqLogItem);
        }

        // Link Record item
        const linkRecordItem = el('button', {
          class: 'action-menu-item',
          html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Link Record`
        });
        linkRecordItem.addEventListener('click', (e) => {
          e.stopPropagation();
          menuList.classList.remove('open');
          menuList.classList.add('hidden');
          this.showLinkFinancialModal(t.id);
        });
        menuList.appendChild(linkRecordItem);

        // Edit Task item
        const editTaskItem = el('button', {
          class: 'action-menu-item',
          html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit Task`
        });
        editTaskItem.addEventListener('click', (e) => {
          e.stopPropagation();
          menuList.classList.remove('open');
          menuList.classList.add('hidden');
          this.showEditTaskModal(t.id, () => App.handleRoute());
        });
        menuList.appendChild(editTaskItem);

        // Delete item
        const deleteItem = el('button', {
          class: 'action-menu-item danger',
          html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg> Delete`
        });
        deleteItem.addEventListener('click', (e) => {
          e.stopPropagation();
          menuList.classList.remove('open');
          menuList.classList.add('hidden');
          this.showConfirm('Delete Task', 'Are you sure you want to delete this task? This will remove the task and all its checklist items.', () => {
            DB.delete('tasks', t.id);
            App.handleRoute();
          }, 'danger');
        });
        menuList.appendChild(deleteItem);

        actionMenu.appendChild(moreActionsBtn);
        actionMenu.appendChild(menuList);

        cellActions.appendChild(logTimeBtn);
        cellActions.appendChild(actionMenu);
        rowEl.appendChild(cellActions);

        groupEl.appendChild(rowEl);

        // Accordion Details Row (div layout)
        const detailsDiv = el('div', { class: 'detail-panel accordion-panel' + (expanded ? '' : ' hidden collapsed') });
        
        // Two-pane layout direct children of detail-panel
        const leftPane = el('div');
        const rightPane = el('div', { class: 'detail-pane' });

        // --- Left Pane: Requirements Checklist ---
        const checklistSection = el('div', { class: 'task-details-col' });
        const checklistHeader = el('div', { class: 'detail-section-title' });
        checklistHeader.appendChild(el('span', { text: 'Requirements Checklist' }));
        checklistSection.appendChild(checklistHeader);

        const checklistList = el('div', { class: 'details-content-list' });
        let populatePrereqSelect = () => {};
        const allowAssignChecklist = !wr || wr.status === 'Draft' || wr.status === 'Pre-processing';
        const allowAddRequirements = allowAssignChecklist;
        const normalizedChecklist = (t.checklist || []).map(item => {
          if (typeof item === 'string') return { id: generateId('chk'), text: item, completed: false, assigneeId: null, assigneeName: null, dependsOn: null, timeLogs: [] };
          return item;
        });

        const renderChecklist = () => {
          checklistList.innerHTML = '';
          if (normalizedChecklist.length === 0) {
            checklistList.appendChild(el('div', { class: 'empty-state', text: 'No checklist items.' }));
          } else {
            normalizedChecklist.forEach((item, idx) => {
              const blocked = isChecklistBlocked(item, normalizedChecklist);
              const prereq = item.dependsOn === '*' ? null : normalizedChecklist.find(c => c.id === item.dependsOn);
              const row = el('div', { class: 'checklist-item' + (blocked ? ' locked' : '') + (item.completed ? ' completed' : '') });
              const cb = el('input', { type: 'checkbox' });
              cb.checked = !!item.completed;
              cb.disabled = blocked;
              
              const textValue = blocked ? ('🔒 Waiting for: ' + (item.dependsOn === '*' ? 'All Task (*)' : (prereq ? prereq.text : 'Unknown'))) : item.text;
              
              // Wrapping text in checklist-text span/div structure
              const textWrap = el('div', { class: 'checklist-text' });
              textWrap.appendChild(el('span', { text: textValue, class: item.completed ? 'completed' : '', title: textValue }));
              
              cb.addEventListener('change', (e) => {
                e.stopPropagation();
                const now = new Date().toISOString();
                if (cb.checked) {
                  item.completed = true;
                } else {
                  item.completed = false;
                  normalizedChecklist.forEach(other => {
                    if (other.dependsOn === item.id || other.dependsOn === '*') other.completed = false;
                  });
                }
                DB.update('tasks', t.id, { checklist: normalizedChecklist, updatedAt: now });
                renderChecklist();
              });
              row.appendChild(cb);
              row.appendChild(textWrap);

              if (allowAssignChecklist) {
                const assigneeWrap = el('div', { class: 'task-assignee-wrapper' });
                const assigneeDropdown = this.createGroundWorkerDropdown({
                  selectedGroundWorkerName: item.assigneeName,
                  placeholder: 'Assign...',
                  className: 'checklist-assignee-dropdown',
                  priorityNames: getTaskAllAssigneeNames(t),
                  onChange: ({ assigneeName }) => {
                    const name = (assigneeName || '').trim();
                    const existing = name ? (DB.getAll('groundWorkers') || []).find(gw => gw.name.toLowerCase() === name.toLowerCase()) : null;
                    item.assigneeName = name || null;
                    item.assigneeId = existing ? existing.id : null;
                    DB.update('tasks', t.id, { checklist: normalizedChecklist, updatedAt: new Date().toISOString() });
                    renderChecklist();
                    App.handleRoute();
                  }
                });
                assigneeWrap.appendChild(assigneeDropdown);

                const coAssigneePicker = this.renderChecklistCoAssigneePicker(
                  t,
                  item,
                  { primaryName: item.assigneeName || '', className: 'inline-coassignee-dropdown' },
                  !isArchived,
                  true,
                  () => {
                    DB.update('tasks', t.id, { checklist: normalizedChecklist, updatedAt: new Date().toISOString() });
                    renderChecklist();
                    App.handleRoute();
                  }
                );
                assigneeWrap.appendChild(coAssigneePicker);
                row.appendChild(assigneeWrap);
              } else {
                const itemAssigneeNames = [];
                if (item.assigneeName) {
                  itemAssigneeNames.push(item.assigneeName);
                }
                if (item.coAssignees && Array.isArray(item.coAssignees)) {
                  item.coAssignees.forEach(name => {
                    if (name && !itemAssigneeNames.includes(name)) {
                      itemAssigneeNames.push(name);
                    }
                  });
                }
                const assigneeWrap = this.renderAssigneeAvatarsList(itemAssigneeNames);
                row.appendChild(assigneeWrap);
              }

              const itemHours = getChecklistItemTotalHours(item);
              const timePill = el('span', { class: 'hours-pill', text: itemHours + 'h' });
              row.appendChild(timePill);

              const checklistActions = el('div', { style: 'display:flex;gap:var(--space-1);' });
              const logBtn = el('button', { type: 'button', class: 'action-btn', text: 'Log Time' });
              logBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showAddTimeLogModal(t.id, item.id);
              });
              checklistActions.appendChild(logBtn);

              const delBtn = el('button', { type: 'button', class: 'action-btn', text: '×', style: 'border-color:transparent;color:var(--muted);' });
              delBtn.title = 'Delete checklist item';
              delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (!item.timeLogs || item.timeLogs.length === 0) {
                  normalizedChecklist.splice(idx, 1);
                  DB.update('tasks', t.id, { checklist: normalizedChecklist, updatedAt: new Date().toISOString() });
                  renderChecklist();
                  populatePrereqSelect();
                } else {
                  const content = el('div');
                  content.appendChild(el('p', { text: `This item has ${item.timeLogs.length} logged time record(s). Choose how to proceed:` }));
                  const actions = el('div', { class: 'checklist-delete-modal-actions' });
                  const reassignBtn = el('button', { type: 'button', class: 'btn btn-primary', text: 'Reassign to task' });
                  const deleteAllBtn = el('button', { type: 'button', class: 'btn btn-danger', text: 'Delete logs & item' });
                  actions.appendChild(reassignBtn);
                  actions.appendChild(deleteAllBtn);
                  content.appendChild(actions);
                  const overlay = this.showModal('Delete Checklist Item', content, null);
                  reassignBtn.addEventListener('click', () => {
                    overlay.remove();
                    const task = DB.getById('tasks', t.id) || t;
                    const logsToMove = (item.timeLogs || []).map(l => ({ ...l, checklistItemId: null }));
                    task.timeLogs = [...(task.timeLogs || []), ...logsToMove];
                    task.checklist = (task.checklist || []).filter(c => c.id !== item.id);
                    DB.update('tasks', task.id, { checklist: task.checklist, timeLogs: task.timeLogs, updatedAt: new Date().toISOString() });
                    App.handleRoute();
                  });
                  deleteAllBtn.addEventListener('click', () => {
                    overlay.remove();
                    const task = DB.getById('tasks', t.id) || t;
                    task.checklist = (task.checklist || []).filter(c => c.id !== item.id);
                    DB.update('tasks', task.id, { checklist: task.checklist, updatedAt: new Date().toISOString() });
                    App.handleRoute();
                  });
                }
              });
              checklistActions.appendChild(delBtn);
              row.appendChild(checklistActions);

              checklistList.appendChild(row);
            });
          }
        };

        const checklistCard = el('div', { class: 'card card-compact', style: 'padding:0;' });
        checklistCard.appendChild(checklistList);
        checklistSection.appendChild(checklistCard);

        if (allowAddRequirements) {
          const addChecklistRow = el('div', { class: 'add-checklist', style: 'display: flex; gap: 8px; align-items: center;' });
          const newItemInput = el('input', { type: 'text', placeholder: 'Add checklist item...', id: 'newCheckInput', style: 'flex: 1;' });
          
          // Custom single-select styled as dependency selector
          const predWrapper = el('div', { class: 'multi-select-dropdown', style: 'width: 160px;' });
          const predBtn = el('button', { type: 'button', class: 'multi-select-btn', text: '— Dependency —', style: 'width: 100%; height: 32px;' });
          const predMenu = el('div', { class: 'multi-select-menu', style: 'width: 100%;' });
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

          let selectedPrereqId = null;

          populatePrereqSelect = () => {
            predMenu.innerHTML = '';
            
            // Option for None
            const noneOption = el('label', { class: 'multi-select-option' });
            const noneCheckbox = el('input', { type: 'checkbox', value: '' });
            if (!selectedPrereqId) noneCheckbox.checked = true;
            noneCheckbox.addEventListener('change', () => {
              selectedPrereqId = null;
              predBtn.textContent = '— Dependency —';
              predMenu.querySelectorAll('.multi-select-option input').forEach(input => {
                if (input !== noneCheckbox) input.checked = false;
              });
              predMenu.classList.remove('show');
            });
            noneOption.appendChild(noneCheckbox);
            noneOption.appendChild(document.createTextNode('— Dependency —'));
            predMenu.appendChild(noneOption);

            // Option for All Task (*)
            const allOption = el('label', { class: 'multi-select-option' });
            const allCheckbox = el('input', { type: 'checkbox', value: '*' });
            if (selectedPrereqId === '*') allCheckbox.checked = true;
            allCheckbox.addEventListener('change', () => {
              if (allCheckbox.checked) {
                selectedPrereqId = '*';
                predBtn.textContent = 'All Task (*)';
                predMenu.querySelectorAll('.multi-select-option input').forEach(input => {
                  if (input !== allCheckbox) input.checked = false;
                });
              } else {
                selectedPrereqId = null;
                predBtn.textContent = '— Dependency —';
              }
              predMenu.classList.remove('show');
            });
            allOption.appendChild(allCheckbox);
            allOption.appendChild(document.createTextNode('All Task (*)'));
            predMenu.appendChild(allOption);

            normalizedChecklist.forEach(item => {
              const option = el('label', { class: 'multi-select-option' });
              const checkbox = el('input', { type: 'checkbox', value: item.id });
              if (selectedPrereqId === item.id) checkbox.checked = true;
              checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                  selectedPrereqId = item.id;
                  predBtn.textContent = item.text;
                  predMenu.querySelectorAll('.multi-select-option input').forEach(input => {
                    if (input !== checkbox) input.checked = false;
                  });
                } else {
                  selectedPrereqId = null;
                  predBtn.textContent = '— Dependency —';
                }
                predMenu.classList.remove('show');
              });
              option.appendChild(checkbox);
              option.appendChild(document.createTextNode(item.text));
              predMenu.appendChild(option);
            });
          };
          populatePrereqSelect();

          const addItemBtn = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Add' });
          addItemBtn.addEventListener('click', () => {
            const val = newItemInput.value.trim();
            if (!val) return;
            const prereqId = selectedPrereqId || null;
            normalizedChecklist.push({ id: generateId('chk'), text: val, completed: false, assigneeId: null, assigneeName: null, dependsOn: prereqId, timeLogs: [] });
            DB.update('tasks', t.id, { checklist: normalizedChecklist, updatedAt: new Date().toISOString() });
            newItemInput.value = '';
            selectedPrereqId = null;
            predBtn.textContent = '— Dependency —';
            populatePrereqSelect();
            renderChecklist();
          });
          addChecklistRow.appendChild(newItemInput);
          addChecklistRow.appendChild(predWrapper);
          addChecklistRow.appendChild(addItemBtn);
          checklistSection.appendChild(addChecklistRow);
        }
        leftPane.appendChild(checklistSection);
        renderChecklist();

        // --- Right Pane: Attached Documents, Time Logs, Dependencies ---
        const detailHeaderActions = el('div', { class: 'detail-header-actions' });
        
        const logTimeHeaderBtn = el('button', {
          class: 'btn btn-primary btn-xs',
          html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; vertical-align: middle;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> Log Time`
        });
        logTimeHeaderBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showAddTimeLogModal(t.id); });
        detailHeaderActions.appendChild(logTimeHeaderBtn);

        if (t.assigneeName && !t.assigneeId) {
          const reqLogHeaderBtn = el('button', {
            class: 'btn btn-secondary btn-xs',
            html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; vertical-align: middle;"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg> Request Log`
          });
          reqLogHeaderBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const text = `Subject: Time Log Request: ${t.title}\n\nHi ${t.assigneeName},\n\nPlease reply with your time log for today for the task: ${t.title} (Work Request: ${wr.title}).\n\nPlease include:\n- Start Time:\n- End Time:\n- Brief description of what you accomplished:\n\nThank you!`;
            navigator.clipboard.writeText(text).then(() => {
              this.showMessage('Copied', `Time log request copied for ${t.assigneeName}.`, 'success');
            }).catch(() => {
              this.showMessage('Error', 'Could not copy to clipboard.', 'danger');
            });
          });
          detailHeaderActions.appendChild(reqLogHeaderBtn);
        }

        const linkRecordHeaderBtn = el('button', {
          class: 'btn btn-secondary btn-xs',
          html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; vertical-align: middle;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg> Link Record`
        });
        linkRecordHeaderBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showLinkFinancialModal(t.id); });
        detailHeaderActions.appendChild(linkRecordHeaderBtn);

        const editTaskHeaderBtn = el('button', {
          class: 'btn btn-ghost btn-xs',
          html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px; vertical-align: middle;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Edit`
        });
        editTaskHeaderBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showEditTaskModal(t.id, () => App.handleRoute()); });
        detailHeaderActions.appendChild(editTaskHeaderBtn);

        rightPane.appendChild(detailHeaderActions);

        // Attached Documents Section
        const canHandover = Auth.can('dms:handover');
        const canEditDms = Auth.can('dms:edit');
        
        const docsSection = el('div', { class: 'detail-block' });
        const docsHeader = el('div', { class: 'detail-section-title' });
        docsHeader.appendChild(el('span', { text: 'Attached Documents' }));
        if (canHandover && !isArchived) {
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
            if (canEditDms) {
              const dmsDoc = DB.getWhere('documents', doc => 
                (doc.fileName === fName) && doc.workRequestId === wr.id
              )[0];
              if (dmsDoc && dmsDoc.dataUrl) {
                const link = el('a', {
                  href: '#',
                  text: fName,
                  style: 'color:var(--accent); font-weight:600; text-decoration:underline; cursor:pointer;'
                });
                link.addEventListener('click', (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const win = window.open();
                  if (win) win.document.write('<iframe src="' + dmsDoc.dataUrl + '" frameborder="0" style="position:fixed; top:0; left:0; bottom:0; right:0; width:100%; height:100%; border:none; margin:0; padding:0; overflow:hidden; z-index:999999;" allowfullscreen></iframe>');
                });
                leftSide.appendChild(link);
              } else {
                leftSide.appendChild(el('span', { text: fName }));
              }
            } else {
              leftSide.appendChild(el('span', { text: fName }));
            }
            leftSide.appendChild(el('span', { class: 'kpi-label', text: formatDate(d.uploadDate) }));
            item.appendChild(leftSide);

            // Delete Button: Documentation and Admin can remove
            if (Auth.can('dms:handover')) {
              const delBtn = el('button', { 
                class: 'btn btn-ghost btn-xs', 
                text: '×', 
                style: 'color:var(--danger); font-size:1.2rem; padding:0 4px; line-height:1;' 
              });
              delBtn.title = 'Remove Attachment';
              delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.showConfirm('Confirm Removal', `Are you sure you want to remove "${fName}" from this task?`, () => {
                  const updatedTaskDocs = t.taskDocuments.filter((_, i) => i !== dIdx);
                  DB.update('tasks', t.id, { taskDocuments: updatedTaskDocs });
                  const dmsMatch = DB.getWhere('documents', doc => doc.fileName === fName && doc.workRequestId === wr.id)[0];
                  if (dmsMatch) DB.delete('documents', dmsMatch.id);
                  App.handleRoute();
                }, 'danger');
              });
              item.appendChild(delBtn);
            }
            docsList.appendChild(item);

            // Comments
            const commentToggle = el('button', { class: 'btn btn-ghost btn-xs', text: '💬 Comments' + (d.comments?.length ? ` (${d.comments.length})` : ''), style: 'margin-left: 10px; font-size: var(--text-xs); color: var(--muted);' });
            const commentContainer = el('div', { class: 'doc-comments-container hidden', style: 'margin: 8px 0 16px 20px; padding: 12px; background: var(--bg); border-radius: var(--radius-sm); border-left: 3px solid var(--border);' });
            commentToggle.addEventListener('click', (e) => { e.stopPropagation(); commentContainer.classList.toggle('hidden'); });

            const renderComments = () => {
              commentContainer.innerHTML = '';
              const list = el('div', { style: 'display:flex; flex-direction:column; gap:8px;' });
              if (!d.comments || d.comments.length === 0) {
                list.appendChild(el('div', { class: 'empty-state', text: 'No comments for this document.', style: 'padding: 4px 0;' }));
              } else {
                d.comments.forEach((c, cIdx) => {
                  const commentRow = el('div', { style: 'background:var(--surface); padding:8px 12px; border-radius:var(--radius-sm); border: 1px solid var(--border); position:relative;' });
                  const cUser = DB.getById('users', c.userId);
                  const header = el('div', { style: 'display:flex; justify-content:space-between; margin-bottom:4px; font-size:0.75rem;' });
                  header.appendChild(el('span', { text: cUser?.name || 'Unknown', style: 'font-weight:600; color:var(--accent);' }));
                  header.appendChild(el('span', { text: formatDate(c.date), style: 'color:var(--muted);' }));
                  commentRow.appendChild(header);

                  const contentArea = el('div', { style: 'font-size:var(--text-sm); color:var(--fg); line-height:1.4;' });
                  contentArea.textContent = c.text;
                  commentRow.appendChild(contentArea);

                  // Admin Actions: Edit/Delete (disabled in archive)
                  if (Auth.can('workflow:approve') && !isArchived) {
                    const cActions = el('div', { style: 'display:flex; gap:8px; margin-top:8px; border-top:1px solid var(--border); padding-top:4px;' });
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
                      const cancelEditBtn = el('button', { class: 'btn btn-secondary btn-xs', text: 'Cancel' });
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
                      cancelEditBtn.addEventListener('click', (ev) => { ev.stopPropagation(); renderComments(); });
                      editActions.appendChild(saveEditBtn);
                      editActions.appendChild(cancelEditBtn);
                      contentArea.appendChild(editActions);
                    });
                    const delCommentBtn = el('button', { class: 'btn btn-link btn-xs', text: 'Delete', style: 'padding:0; font-size:var(--text-xs); color:var(--danger);' });
                    delCommentBtn.addEventListener('click', (e) => {
                      e.stopPropagation();
                      this.showConfirm('Delete Comment', 'Are you sure you want to delete this comment?', () => {
                        d.comments.splice(cIdx, 1);
                        DB.update('tasks', t.id, { taskDocuments: t.taskDocuments });
                        renderComments();
                        commentToggle.textContent = '💬 Comments' + (d.comments?.length ? ` (${d.comments.length})` : '');
                      }, 'danger');
                    });
                    cActions.appendChild(editBtn);
                    cActions.appendChild(delCommentBtn);
                    commentRow.appendChild(cActions);
                  }
                  list.appendChild(commentRow);
                });
              }
              commentContainer.appendChild(list);

              if (Auth.can('workflow:approve') && !isArchived) {
                const addForm = el('div', { style: 'margin-top:12px; padding-top:12px; border-top: 1px solid var(--border);' });
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
          });
        }
        docsSection.appendChild(docsList);
        rightPane.appendChild(docsSection);

        // Time Log History Section
        const timeSection = el('div', { class: 'detail-block' });
        const timeHeader = el('div', { class: 'detail-section-title' });
        timeHeader.appendChild(el('span', { text: 'Time Log History' }));
        timeSection.appendChild(timeHeader);

        const timeList = el('div', { class: 'details-content-list' });
        const logs = t.timeLogs || [];
        const checklistLogGroups = [];
        (t.checklist || []).forEach(item => {
          if (item.timeLogs && item.timeLogs.length > 0) checklistLogGroups.push({ item, logs: item.timeLogs });
        });
        if (logs.length === 0 && checklistLogGroups.length === 0) {
          timeList.appendChild(el('div', { class: 'empty-state', text: isArchived ? 'Archived — time logging disabled.' : 'No logs recorded.' }));
        } else {
          const buildTimeLogEntry = (l) => {
            const [y, m, d] = l.date.split('-').map(Number);
            const logDate = new Date(y, m - 1, d);
            const dateStr = logDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
            const workerLabel = l.workerName || (DB.getById('users', l.userId)?.name || l.userId || 'Unknown');
            const noteText = l.note ? ` — ${l.note}` : '';
            return el('div', { class: 'history-item' }, [
              el('div', {}, [
                el('strong', { text: workerLabel }),
                el('span', { text: noteText }),
                el('div', { class: 'history-meta', text: `${dateStr} • ${l.startTime}–${l.endTime}` })
              ]),
              el('span', { class: 'font-mono', text: `${l.hours}h` })
            ]);
          };
          const taskLevelLogs = logs.filter(l => !l.checklistItemId);
          if (taskLevelLogs.length > 0) {
            const sorted = [...taskLevelLogs].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
            sorted.forEach(l => timeList.appendChild(buildTimeLogEntry(l)));
          }
          checklistLogGroups.forEach(({ item, logs: itemLogs }) => {
            const sorted = [...itemLogs].sort((a, b) => b.date.localeCompare(a.date) || b.startTime.localeCompare(a.startTime));
            sorted.forEach(l => timeList.appendChild(buildTimeLogEntry(l)));
          });
        }
        timeSection.appendChild(timeList);
        rightPane.appendChild(timeSection);

        // Dependency map section
        const depSection = el('div', { class: 'detail-block' });
        const depHeader = el('div', { class: 'detail-section-title' });
        depHeader.appendChild(el('span', { text: 'Dependency Map' }));
        depSection.appendChild(depHeader);

        // Generate action buttons inside task detail pane
        if (!isArchived) {
          const genActionsBar = el('div', { class: 'detail-block', style: 'border-top: 1px solid var(--border); padding-top: var(--space-4); margin-top: var(--space-4);' });
          const genHeader = el('div', { class: 'detail-section-title' });
          genHeader.appendChild(el('span', { text: 'Quick Actions' }));
          genActionsBar.appendChild(genHeader);

          const actionsWrap = el('div', { style: 'display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3); margin-top: var(--space-2);' });

          const createActionCard = (icon, title, type, handler, isSpan = false) => {
            let cardStyle = `
              position: relative;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              gap: var(--space-2);
              padding: var(--space-3);
              background: var(--color-surface);
              border: 1px solid var(--color-border);
              border-radius: var(--radius-md);
              cursor: pointer;
              font-family: inherit;
              font-size: 0.875rem;
              font-weight: 600;
              color: var(--color-text);
              transition: all 0.2s ease-in-out;
              min-height: 70px;
              text-align: center;
            `;
            if (isSpan) {
              cardStyle += ' grid-column: span 2;';
            }

            const card = el('button', { type: 'button', style: cardStyle, class: 'quick-action-card' });
            
            card.addEventListener('mouseenter', () => {
              card.style.borderColor = 'var(--color-primary)';
              card.style.boxShadow = 'var(--shadow-sm)';
              card.style.transform = 'translateY(-1px)';
            });
            card.addEventListener('mouseleave', () => {
              card.style.borderColor = 'var(--color-border)';
              card.style.boxShadow = 'none';
              card.style.transform = 'none';
            });

            const iconEl = el('span', { text: icon, style: 'font-size: 1.25rem;' });
            const titleEl = el('span', { text: title, style: 'line-height: 1.2;' });
            card.appendChild(iconEl);
            card.appendChild(titleEl);

            card.addEventListener('click', (e) => {
              e.stopPropagation();
              handler();
            });

            // Status Badge Overlay
            const req = DB.getWhere('operationsRequests', r => r.workRequestId === wr.id && r.type === type).sort((a,b) => new Date(b.requestedAt) - new Date(a.requestedAt))[0];
            if (req) {
              let dotColor = '';
              let badgeText = '';
              if (req.status === 'pending') {
                dotColor = '#eab308'; // Amber yellow
                badgeText = 'Pending';
              } else if (req.status === 'fulfilled') {
                dotColor = '#22c55e'; // Emerald green
                badgeText = 'Fulfilled';
              } else if (req.status === 'rejected') {
                dotColor = '#ef4444'; // Red
                badgeText = 'Rejected';
              }

              if (badgeText) {
                const badge = el('span', { 
                  style: `
                    position: absolute;
                    top: 6px;
                    right: 6px;
                    display: flex;
                    align-items: center;
                    gap: 4px;
                    font-size: 0.6875rem;
                    font-weight: 500;
                    padding: 2px 6px;
                    border-radius: 9999px;
                    background: ${dotColor}15;
                    color: ${dotColor};
                    border: 1px solid ${dotColor}30;
                  `
                });
                
                const dot = el('span', {
                  style: `
                    width: 6px;
                    height: 6px;
                    border-radius: 50%;
                    background: ${dotColor};
                  `
                });
                badge.appendChild(dot);
                badge.appendChild(document.createTextNode(badgeText));
                card.appendChild(badge);
              }
            }

            return card;
          };

          // Billing Card
          let billingTitle = 'Billing';
          let billingHandler = null;
          if (Auth.can('billing:edit')) {
            billingTitle = 'Generate Billing';
            billingHandler = () => this.openGenerateBillingModal(wr, t);
          } else if (Auth.can('billing:request')) {
            billingTitle = 'Request Billing';
            billingHandler = () => this.submitOperationsRequest('billing', wr, t);
          }

          // Disbursement Card
          let disbTitle = 'Disbursement';
          let disbHandler = null;
          if (Auth.can('disbursement:create')) {
            disbTitle = 'Generate Disbursement';
            disbHandler = () => this.openGenerateDisbursementModal(wr, t);
          } else if (Auth.can('disbursement:request')) {
            disbTitle = 'Request Disbursement';
            disbHandler = () => this.submitOperationsRequest('disbursement', wr, t);
          }

          // Transmittal Card
          let transTitle = 'Transmittal';
          let transHandler = null;
          if (Auth.can('transmittal:edit')) {
            transTitle = 'Generate Transmittal';
            transHandler = () => this.openGenerateTransmittalModal(wr, t);
          } else if (Auth.can('transmittal:request')) {
            transTitle = 'Request Transmittal';
            transHandler = () => this.submitOperationsRequest('transmittal', wr, t);
          }

          const cardsToRender = [];
          if (billingHandler) cardsToRender.push({ icon: '📄', title: billingTitle, type: 'billing', handler: billingHandler });
          if (disbHandler) cardsToRender.push({ icon: '💸', title: disbTitle, type: 'disbursement', handler: disbHandler });
          if (transHandler) cardsToRender.push({ icon: '📦', title: transTitle, type: 'transmittal', handler: transHandler });

          cardsToRender.forEach((c, idx) => {
            const isSpan = (cardsToRender.length === 3 && idx === 2) || (cardsToRender.length === 1);
            const card = createActionCard(c.icon, c.title, c.type, c.handler, isSpan);
            actionsWrap.appendChild(card);
          });

          genActionsBar.appendChild(actionsWrap);
          rightPane.appendChild(genActionsBar);
        }

        const depContent = el('div', { class: 'dep-list' });
        const taskPreds = t.predecessors || [];
        const checklistDeps = (t.checklist || []).filter(item => item.dependsOn);
        if (taskPreds.length === 0 && checklistDeps.length === 0) {
          depContent.appendChild(el('div', { class: 'empty-state', text: 'No dependencies.' }));
        } else {
          taskPreds.forEach(pid => {
            const pTask = DB.getById('tasks', pid);
            const depItem = el('div', { class: 'dep-item' });
            depItem.appendChild(el('span', { text: pTask ? pTask.title : 'Unknown' }));
            depItem.appendChild(el('span', { class: 'dep-arrow', text: '→' }));
            depItem.appendChild(el('span', { class: 'text-muted', text: t.title }));
            depContent.appendChild(depItem);
          });
           checklistDeps.forEach(item => {
             const prereq = item.dependsOn === '*' ? null : (t.checklist || []).find(c => c.id === item.dependsOn);
             const depItem = el('div', { class: 'dep-item' });
             depItem.appendChild(el('span', { text: item.dependsOn === '*' ? 'All Task (*)' : (prereq ? prereq.text : 'Unknown') }));
             depItem.appendChild(el('span', { class: 'dep-arrow', text: '→' }));
             depItem.appendChild(el('span', { class: 'text-muted', text: `${t.title}: ${item.text}` }));
             depContent.appendChild(depItem);
           });
        }
        depSection.appendChild(depContent);
        rightPane.appendChild(depSection);

        detailsDiv.appendChild(leftPane);
        detailsDiv.appendChild(rightPane);
        groupEl.appendChild(detailsDiv);

        // Row expand listener
        rowEl.addEventListener('click', (e) => {
          if (e.target.closest('input, select, button, .actions-cell, .inline-coassignee-dropdown, .inline-ground-worker-autocomplete')) return;
          const isNowExpanded = rowEl.classList.toggle('expanded');
          detailsDiv.classList.toggle('hidden');
          detailsDiv.classList.toggle('collapsed');
          if (isNowExpanded) {
            this.expandedTaskIds.add(t.id);
          } else {
            this.expandedTaskIds.delete(t.id);
          }
        });
      });

      // Footer totals row
      const footerRow = el('div', {
        class: 'task-row-footer',
        style: 'display: grid; grid-template-columns: 36px minmax(180px, 2fr) minmax(160px, 1.5fr) 110px 120px 100px 110px 80px 100px; font-weight: bold; border-top: 2px solid var(--border); padding: 12px 16px;'
      });
      for (let i = 0; i < 7; i++) {
        footerRow.appendChild(el('div'));
      }
      footerRow.appendChild(el('div', { text: `${totalHours} hrs` }));
      footerRow.appendChild(el('div'));
      groupEl.appendChild(footerRow);

      listWrapper.appendChild(groupEl);
    }

    updateBulkBar();
    };

    renderGroups();

    container.appendChild(listWrapper);

    // Related Financials & Documents (Redesign card pattern)
    const relatedSection = el('div', { class: 'card', style: 'margin-top: 32px;' });
    const relatedHeader = el('div', { class: 'card-header' });
    relatedHeader.appendChild(el('div', { class: 'card-title', text: 'Related Financials & Documents' }));
    relatedSection.appendChild(relatedHeader);

    const grid = el('div', { class: 'financials-grid' });

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
    const invCol = el('div', { class: 'financial-card' });
    invCol.appendChild(el('h4', { text: '📄 Invoices / Billings' }));
    if (invoices.length === 0) {
      invCol.appendChild(el('p', { text: 'No linked invoices.', class: 'empty-state', style: 'font-size: 0.8125rem;' }));
    } else {
      const invList = el('div', { style: 'display: flex; flex-direction: column; gap: 8px;' });
      invoices.forEach(inv => {
        const item = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; font-size: 0.8125rem; background: var(--bg); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); border: 1px solid var(--border);' });
        const left = el('div');
        const link = el('a', { href: 'javascript:void(0)', text: inv.invoiceNumber, style: 'color: var(--accent); font-weight: 600; text-decoration: none;' });
        link.addEventListener('click', (e) => { e.stopPropagation(); location.hash = '#billing/detail/' + inv.id; });
        link.addEventListener('mouseenter', () => { link.style.textDecoration = 'underline'; });
        link.addEventListener('mouseleave', () => { link.style.textDecoration = 'none'; });
        left.appendChild(link);
        
        let scopeText = ' (Entire WR)';
        if (inv.linkedTaskId) {
          const task = DB.getById('tasks', inv.linkedTaskId);
          if (task) scopeText = ` (Task: ${task.title})`;
        }
        left.appendChild(el('span', { text: scopeText, style: 'color: var(--muted); font-size: var(--text-xs); font-style: italic;' }));
        left.appendChild(el('div', { text: `${formatDate(inv.issueDate)} • ${formatPHP(inv.total)}`, style: 'color: var(--muted); font-size: var(--text-xs); margin-top: 2px;' }));
        
        item.appendChild(left);
        
        let bg = 'var(--bg)';
        let fg = 'var(--muted)';
        if (inv.status === 'Paid') { bg = 'color-mix(in oklab, var(--success), transparent 88%)'; fg = 'var(--success)'; }
        else if (inv.status === 'Approved') { bg = 'color-mix(in oklab, var(--accent), transparent 88%)'; fg = 'var(--accent)'; }
        else if (inv.status === 'Sent') { bg = 'color-mix(in oklab, var(--accent), transparent 92%)'; fg = 'var(--accent)'; }
        else if (inv.status === 'Pending') { bg = 'color-mix(in oklab, var(--warn), transparent 88%)'; fg = 'color-mix(in oklab, var(--warn), black 30%)'; }
        else if (inv.status === 'Draft') { bg = 'var(--bg)'; fg = 'var(--muted)'; }

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
    const disbCol = el('div', { class: 'financial-card' });
    disbCol.appendChild(el('h4', { text: '💸 Expenses / Disbursements' }));
    if (disbursements.length === 0) {
      disbCol.appendChild(el('p', { text: 'No linked disbursements.', class: 'empty-state', style: 'font-size: 0.8125rem;' }));
    } else {
      const disbList = el('div', { style: 'display: flex; flex-direction: column; gap: 8px;' });
      disbursements.forEach(d => {
        const item = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; font-size: 0.8125rem; background: var(--bg); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); border: 1px solid var(--border);' });
        const left = el('div');
        const link = el('a', { href: 'javascript:void(0)', text: d.category, style: 'color: var(--accent); font-weight: 600; text-decoration: none;' });
        link.addEventListener('click', (e) => { e.stopPropagation(); location.hash = '#disbursement/detail/' + d.id; });
        link.addEventListener('mouseenter', () => { link.style.textDecoration = 'underline'; });
        link.addEventListener('mouseleave', () => { link.style.textDecoration = 'none'; });
        left.appendChild(link);
        
        let scopeText = ' (Entire WR)';
        if (d.linkedTaskId) {
          const task = DB.getById('tasks', d.linkedTaskId);
          if (task) scopeText = ` (Task: ${task.title})`;
        }
        left.appendChild(el('span', { text: scopeText, style: 'color: var(--muted); font-size: var(--text-xs); font-style: italic;' }));
        left.appendChild(el('div', { text: `${formatDate(d.submittedAt)} • ${formatPHP(d.amount)}`, style: 'color: var(--muted); font-size: var(--text-xs); margin-top: 2px;' }));
        
        item.appendChild(left);
        const stBadge = el('span', { 
          class: 'badge', 
          text: d.status, 
          style: `font-size: 10px; padding: 2px 6px; border-radius: var(--radius-sm); background: ${d.status === 'Released' ? 'color-mix(in oklab, var(--success), transparent 88%)' : d.status === 'Approved' ? 'color-mix(in oklab, var(--accent), transparent 88%)' : 'color-mix(in oklab, var(--warn), transparent 88%)'}; color: ${d.status === 'Released' ? 'var(--success)' : d.status === 'Approved' ? 'var(--accent)' : 'color-mix(in oklab, var(--warn), black 30%)'};`
        });
        item.appendChild(stBadge);
        disbList.appendChild(item);
      });
      disbCol.appendChild(disbList);
    }
    grid.appendChild(disbCol);

    // Transmittals Column
    const transCol = el('div', { class: 'financial-card' });
    transCol.appendChild(el('h4', { text: '📦 Transmittals' }));
    if (transmittals.length === 0) {
      transCol.appendChild(el('p', { text: 'No linked transmittals.', class: 'empty-state', style: 'font-size: 0.8125rem;' }));
    } else {
      const transList = el('div', { style: 'display: flex; flex-direction: column; gap: 8px;' });
      transmittals.forEach(t => {
        const item = el('div', { style: 'display: flex; justify-content: space-between; align-items: center; font-size: 0.8125rem; background: var(--bg); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); border: 1px solid var(--border);' });
        const left = el('div');
        const link = el('a', { href: 'javascript:void(0)', text: t.trackingNumber, style: 'color: var(--accent); font-weight: 600; text-decoration: none;' });
        link.addEventListener('click', (e) => { e.stopPropagation(); location.hash = '#transmittal/detail/' + t.id; });
        link.addEventListener('mouseenter', () => { link.style.textDecoration = 'underline'; });
        link.addEventListener('mouseleave', () => { link.style.textDecoration = 'none'; });
        left.appendChild(link);
        left.appendChild(el('div', { text: `Sent: ${formatDate(t.sentAt)}`, style: 'color: var(--muted); font-size: var(--text-xs); margin-top: 2px;' }));
        
        item.appendChild(left);
        const stBadge = el('span', { 
          class: 'badge', 
          text: t.status, 
          style: `font-size: 10px; padding: 2px 6px; border-radius: var(--radius-sm); background: ${t.status === 'Acknowledged' ? 'color-mix(in oklab, var(--success), transparent 88%)' : 'var(--bg)'}; color: ${t.status === 'Acknowledged' ? 'var(--success)' : 'var(--muted)'};`
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

  showAttachmentPopover(taskId, triggerEl, mode) {
    const task = DB.getById('tasks', taskId);
    if (!task) return;
    const wr = DB.getById('workRequests', task.workRequestId);

    // Remove any existing popover
    const existing = document.querySelector('.notion-embed-popover');
    if (existing) existing.remove();

    const popover = el('div', { class: 'notion-embed-popover' });
    
    // Create tabs header
    const tabsHeader = el('div', { class: 'notion-popover-tabs' });
    const contentArea = el('div', { class: 'notion-popover-content' });
    
    let activeTab = 'tab1';
    
    const renderContent = () => {
      contentArea.innerHTML = '';
      if (mode === 'upload') {
        if (activeTab === 'tab1') {
          // Upload panel
          const panel = el('div', { class: 'notion-popover-panel' });
          const fileInput = el('input', { type: 'file', style: 'display: none;' });
          const chooseBtn = el('button', { class: 'notion-popover-submit', text: 'Choose a file' });
          
          chooseBtn.addEventListener('click', () => fileInput.click());
          fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
              const dataUrl = ev.target.result;
              const now = new Date().toISOString();
              
              const entry = {
                fileName: file.name,
                uploadDate: now.slice(0, 10),
                uploaderId: Auth.user.id
              };
              const updatedDocs = [...(task.taskDocuments || []), entry];
              DB.update('tasks', taskId, { taskDocuments: updatedDocs, updatedAt: now });

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
              
              popover.remove();
              this.showTaskSidePane(taskId, null); // Refresh side pane!
              App.handleRoute();
            };
            reader.readAsDataURL(file);
          });
          
          panel.appendChild(fileInput);
          panel.appendChild(chooseBtn);
          contentArea.appendChild(panel);
        } else {
          // Link panel
          const panel = el('div', { class: 'notion-popover-panel' });
          const linkInput = el('input', { type: 'text', class: 'notion-popover-input', placeholder: 'Paste in link...' });
          const submitBtn = el('button', { class: 'notion-popover-submit', text: 'Link file' });
          
          submitBtn.addEventListener('click', () => {
            const val = linkInput.value.trim();
            if (!val) return;
            
            let fileName = 'Linked Document';
            try {
              const url = new URL(val);
              const pathParts = url.pathname.split('/');
              const lastPart = pathParts[pathParts.length - 1];
              if (lastPart && lastPart.includes('.')) {
                fileName = lastPart;
              }
            } catch(e) {}

            const now = new Date().toISOString();
            const entry = {
              fileName: fileName,
              uploadDate: now.slice(0, 10),
              uploaderId: Auth.user.id,
              linkUrl: val
            };
            const updatedDocs = [...(task.taskDocuments || []), entry];
            DB.update('tasks', taskId, { taskDocuments: updatedDocs, updatedAt: now });

            const dmsRecord = {
              id: generateId('doc'),
              fileName: fileName,
              workRequestId: task.workRequestId,
              document_type: 'original_scan',
              category: 'Requirement Docs',
              uploader: Auth.user.id,
              uploadDate: now,
              description: `Linked via task: ${task.title}`,
              handover_log: [],
              entity: wr?.entity || Auth.activeEntity,
              dataUrl: val,
              versions: [],
              comments: [],
              documentLifecycle: 'collected',
              scannedBy: '',
              envelopeId: '',
              storedLocation: ''
            };
            DB.insert('documents', dmsRecord);
            
            popover.remove();
            this.showTaskSidePane(taskId, null);
            App.handleRoute();
          });
          
          panel.appendChild(linkInput);
          panel.appendChild(submitBtn);
          contentArea.appendChild(panel);
        }
      } else {
        // GDrive mode
        if (activeTab === 'tab1') {
          // Link GDrive panel
          const panel = el('div', { class: 'notion-popover-panel' });
          const linkInput = el('input', { type: 'text', class: 'notion-popover-input', placeholder: 'Paste in https://...' });
          const submitBtn = el('button', { class: 'notion-popover-submit', text: 'Embed Google Drive file' });
          const hint = el('div', { class: 'notion-popover-hint', text: 'Works with any file in your Google Drive' });
          
          submitBtn.addEventListener('click', () => {
            const val = linkInput.value.trim();
            if (!val) return;
            
            let fileName = 'GDrive Document';
            try {
              const url = new URL(val);
              const pathParts = url.pathname.split('/');
              const lastPart = pathParts[pathParts.length - 1];
              if (lastPart && lastPart.includes('.')) {
                fileName = lastPart;
              }
            } catch(e) {}

            const now = new Date().toISOString();
            const entry = {
              fileName: fileName,
              uploadDate: now.slice(0, 10),
              uploaderId: Auth.user.id,
              isGoogleDrive: true,
              linkUrl: val
            };
            const updatedDocs = [...(task.taskDocuments || []), entry];
            DB.update('tasks', taskId, { taskDocuments: updatedDocs, updatedAt: now });

            const dmsRecord = {
              id: generateId('doc'),
              fileName: fileName,
              workRequestId: task.workRequestId,
              document_type: 'original_scan',
              category: 'Requirement Docs',
              uploader: Auth.user.id,
              uploadDate: now,
              description: `GDrive link via task: ${task.title}`,
              handover_log: [],
              entity: wr?.entity || Auth.activeEntity,
              dataUrl: val,
              versions: [],
              comments: [],
              documentLifecycle: 'collected',
              scannedBy: '',
              envelopeId: '',
              storedLocation: ''
            };
            DB.insert('documents', dmsRecord);
            
            popover.remove();
            this.showTaskSidePane(taskId, null);
            App.handleRoute();
          });
          
          panel.appendChild(linkInput);
          panel.appendChild(submitBtn);
          panel.appendChild(hint);
          contentArea.appendChild(panel);
        } else {
          // Browse Google Drive panel
          const panel = el('div', { class: 'notion-popover-panel' });
          const fileList = el('div', { class: 'notion-popover-file-list' });
          
          const driveFiles = [
            { name: 'Operations_Handbook.pdf', size: '2.4 MB' },
            { name: 'Q2_Strategy_Presentation.pdf', size: '5.1 MB' },
            { name: 'WR_Vendor_Contracts.xlsx', size: '1.2 MB' },
            { name: 'Client_Receipts_Archive.zip', size: '15.8 MB' }
          ];
          
          driveFiles.forEach(f => {
            const item = el('div', { class: 'notion-popover-file-item' });
            item.innerHTML = `
              <div style="display: flex; align-items: center; gap: 8px;">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" style="color: #22c55e;"><path d="M2.5 17h19M4.5 14l3.5-6h8l3.5 6M9 9h6M12 3v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span style="font-weight: 500;">${f.name}</span>
              </div>
              <span style="font-size: 0.75rem; color: var(--color-text-muted);">${f.size}</span>
            `;
            item.addEventListener('click', () => {
              const now = new Date().toISOString();
              const entry = {
                fileName: f.name,
                uploadDate: now.slice(0, 10),
                uploaderId: Auth.user.id,
                isGoogleDrive: true
              };
              const updatedDocs = [...(task.taskDocuments || []), entry];
              DB.update('tasks', taskId, { taskDocuments: updatedDocs, updatedAt: now });

              const dmsRecord = {
                id: generateId('doc'),
                fileName: f.name,
                workRequestId: task.workRequestId,
                document_type: 'original_scan',
                category: 'Requirement Docs',
                uploader: Auth.user.id,
                uploadDate: now,
                description: `Embedded via Google Drive: ${f.name}`,
                handover_log: [],
                entity: wr?.entity || Auth.activeEntity,
                dataUrl: 'mock-google-drive-data-url',
                versions: [],
                comments: [],
                documentLifecycle: 'collected',
                scannedBy: '',
                envelopeId: '',
                storedLocation: ''
              };
              DB.insert('documents', dmsRecord);
              
              popover.remove();
              this.showTaskSidePane(taskId, null);
              App.handleRoute();
            });
            fileList.appendChild(item);
          });
          panel.appendChild(fileList);
          contentArea.appendChild(panel);
        }
      }
    };

    // Build tabs
    const tab1Label = mode === 'upload' ? 'Upload' : 'Link';
    const tab2Label = mode === 'upload' ? 'Link' : 'Browse Google Drive';
    
    const tab1Btn = el('button', { class: 'notion-tab-btn active', text: tab1Label });
    const tab2Btn = el('button', { class: 'notion-tab-btn', text: tab2Label });
    
    tab1Btn.addEventListener('click', () => {
      if (activeTab === 'tab1') return;
      activeTab = 'tab1';
      tab1Btn.classList.add('active');
      tab2Btn.classList.remove('active');
      renderContent();
    });
    
    tab2Btn.addEventListener('click', () => {
      if (activeTab === 'tab2') return;
      activeTab = 'tab2';
      tab2Btn.classList.add('active');
      tab1Btn.classList.remove('active');
      renderContent();
    });
    
    tabsHeader.appendChild(tab1Btn);
    tabsHeader.appendChild(tab2Btn);
    
    popover.appendChild(tabsHeader);
    popover.appendChild(contentArea);
    
    document.body.appendChild(popover);
    renderContent();
    
    // Position popover with edge awareness
    const position = () => {
      const triggerRect = triggerEl.getBoundingClientRect();
      const popoverWidth = 360;
      
      let left = triggerRect.left + window.scrollX;
      let top = triggerRect.bottom + window.scrollY + 6;
      
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      if (left + popoverWidth > viewportWidth - 16) {
        left = viewportWidth - popoverWidth - 16;
      }
      if (left < 16) {
        left = 16;
      }
      
      const popoverHeight = popover.offsetHeight || 150;
      if (triggerRect.bottom + popoverHeight > viewportHeight - 16) {
        top = triggerRect.top + window.scrollY - popoverHeight - 6;
      }
      
      popover.style.left = `${left}px`;
      popover.style.top = `${top}px`;
    };
    
    position();
    requestAnimationFrame(position);
    
    // Click outside handler
    const onMouseDown = (e) => {
      if (!popover.contains(e.target) && !triggerEl.contains(e.target)) {
        popover.remove();
        document.removeEventListener('mousedown', onMouseDown);
      }
    };
    document.addEventListener('mousedown', onMouseDown);
  },

  showGoogleDriveChooser(taskId) {
    const task = DB.getById('tasks', taskId);
    if (!task) return;
    
    const driveFiles = [
      { name: 'Operations_Handbook.pdf', size: '2.4 MB' },
      { name: 'Q2_Strategy_Presentation.pdf', size: '5.1 MB' },
      { name: 'WR_Vendor_Contracts.xlsx', size: '1.2 MB' },
      { name: 'Client_Receipts_Archive.zip', size: '15.8 MB' }
    ];
    
    const container = el('div', { style: 'display: flex; flex-direction: column; gap: 12px; padding: 8px;' });
    container.appendChild(el('p', { text: 'Select a file from your connected Google Drive to embed:', style: 'font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: 8px;' }));
    
    const list = el('div', { style: 'display: flex; flex-direction: column; gap: 8px;' });
    driveFiles.forEach(f => {
      const item = el('div', { 
        style: 'display: flex; justify-content: space-between; align-items: center; padding: 12px; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 6px; cursor: pointer; transition: all 0.15s ease;'
      });
      item.addEventListener('mouseenter', () => {
        item.style.borderColor = 'var(--color-primary)';
        item.style.background = 'color-mix(in srgb, var(--color-primary), transparent 95%)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.borderColor = 'var(--color-border)';
        item.style.background = 'var(--color-bg)';
      });
      
      const fileLeft = el('div', { style: 'display: flex; align-items: center; gap: 10px;' });
      fileLeft.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style="color: #22c55e;"><path d="M2.5 17h19M4.5 14l3.5-6h8l3.5 6M9 9h6M12 3v3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <span style="font-weight: 500; font-size: 0.875rem; color: var(--color-text);">${f.name}</span>
      `;
      item.appendChild(fileLeft);
      item.appendChild(el('span', { text: f.size, style: 'font-size: 0.75rem; color: var(--color-text-muted);' }));
      
      item.addEventListener('click', () => {
        const now = new Date().toISOString();
        const entry = {
          fileName: f.name,
          uploadDate: now.slice(0, 10),
          uploaderId: Auth.user.id,
          isGoogleDrive: true
        };
        const updatedDocs = [...(task.taskDocuments || []), entry];
        DB.update('tasks', taskId, { taskDocuments: updatedDocs, updatedAt: now });
        
        const dmsRecord = {
          id: generateId('doc'),
          fileName: f.name,
          workRequestId: task.workRequestId,
          document_type: 'original_scan',
          category: 'Requirement Docs',
          uploader: Auth.user.id,
          uploadDate: now,
          description: `Embedded via Google Drive: ${f.name}`,
          handover_log: [],
          entity: Auth.activeEntity,
          dataUrl: 'mock-google-drive-data-url',
          versions: [],
          comments: [],
          documentLifecycle: 'collected',
          scannedBy: '',
          envelopeId: '',
          storedLocation: ''
        };
        DB.insert('documents', dmsRecord);
        
        overlay.remove();
        this.showTaskSidePane(taskId, null);
        App.handleRoute();
      });
      list.appendChild(item);
    });
    
    container.appendChild(list);
    const overlay = this.showModal('Google Drive File Chooser', container, null);
  },

  showFigmaEmbedModal(taskId) {
    const task = DB.getById('tasks', taskId);
    if (!task) return;
    
    const container = el('div', { style: 'display: flex; flex-direction: column; gap: 12px; padding: 8px;' });
    container.appendChild(el('label', { text: 'Figma File URL:', style: 'font-weight: 500; font-size: 0.875rem;' }));
    const input = el('input', { type: 'text', placeholder: 'https://www.figma.com/file/...', class: 'form-control', style: 'width: 100%;' });
    container.appendChild(input);
    
    const btnRow = el('div', { style: 'display: flex; gap: 8px; justify-content: flex-end; margin-top: 8px;' });
    const cancelBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Cancel' });
    const submitBtn = el('button', { class: 'btn btn-primary btn-sm', text: 'Embed' });
    
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(submitBtn);
    container.appendChild(btnRow);
    
    const overlay = this.showModal('Embed Figma File', container, null);
    
    cancelBtn.addEventListener('click', () => overlay.remove());
    submitBtn.addEventListener('click', () => {
      const url = input.value.trim();
      if (!url) return;
      
      const now = new Date().toISOString();
      const entry = {
        fileName: url.startsWith('http') ? 'Figma Design File' : url,
        uploadDate: now.slice(0, 10),
        uploaderId: Auth.user.id,
        isFigma: true,
        figmaUrl: url
      };
      
      const updatedDocs = [...(task.taskDocuments || []), entry];
      DB.update('tasks', taskId, { taskDocuments: updatedDocs, updatedAt: now });
      
      overlay.remove();
      this.showTaskSidePane(taskId, null);
      App.handleRoute();
    });
  },

  showAddTimeLogModal(taskId, checklistItemId = null) {
    const task = DB.getById('tasks', taskId);
    let defaultWorkerName = '';
    if (checklistItemId) {
      const item = (task?.checklist || []).find(c => c.id === checklistItemId);
      defaultWorkerName = item?.assigneeName || task?.assigneeName || '';
    } else {
      defaultWorkerName = task?.assigneeName
        ? task.assigneeName
        : (task?.assigneeId || task?.assignedTo)
          ? (DB.getById('users', task.assigneeId || task.assignedTo)?.name || '')
          : '';
    }

    function nextManilaDate(dateStr) {
      const d = new Date(dateStr + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    }

    const form = el('form', { class: 'form-stacked' });

    // Worker Name field
    const workerInput = el('input', { type: 'text', name: 'workerName', placeholder: 'Worker name', value: defaultWorkerName });
    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Worker Name' }),
      workerInput
    ]));

    // Date field
    const dateInput = el('input', { type: 'date', name: 'date', required: true, value: manilaToday() });
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
    const hoursInput = el('input', { type: 'text', name: 'hours', readOnly: true, value: '0.00', style: 'background: var(--bg); cursor: not-allowed;' });
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
        const startMin = sh * 60 + sm;
        const endMin = eh * 60 + em;
        const totalMin = endMin > startMin ? endMin - startMin : endMin + 1440 - startMin;
        const hours = Math.round(totalMin / 60 * 4) / 4;
        hoursInput.value = hours.toFixed(2);
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

      if (!dateVal || !start || !end) return;

      const [sh, sm] = start.split(':').map(Number);
      const [eh, em] = end.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin = eh * 60 + em;
      const workerName = workerInput.value.trim() || (DB.getById('users', Auth.user.id)?.name || '');

      let entries = [];
      if (endMin > startMin) {
        const hours = Math.round((endMin - startMin) / 60 * 4) / 4;
        if (hours > 0) entries.push({ date: dateVal, startTime: start, endTime: end, hours });
      } else {
        const hours1 = Math.round((1440 - startMin) / 60 * 4) / 4;
        const nextDate = nextManilaDate(dateVal);
        const hours2 = Math.round(endMin / 60 * 4) / 4;
        if (hours1 > 0) entries.push({ date: dateVal, startTime: start, endTime: '23:59', hours: hours1 });
        if (hours2 > 0) entries.push({ date: nextDate, startTime: '00:00', endTime: end, hours: hours2 });
      }

      if (entries.length === 0) {
        this.showMessage('Log too short', 'Log too short to record.', 'warning');
        return;
      }

      const currentTask = DB.getById('tasks', taskId);
      const checklist = currentTask.checklist || [];
      const item = checklistItemId ? checklist.find(c => c.id === checklistItemId) : null;

      // Guard: prevent the same worker from logging twice on the same day for the same scope.
      // Scope is either a checklist item or the task itself.
      const scopeLogs = item ? (item.timeLogs || []) : (currentTask.timeLogs || []);
      const alreadyLogged = entries.some(entry => scopeLogs.some(l =>
        l.date === entry.date &&
        (l.workerName || '') === workerName
      ));
      if (alreadyLogged) {
        this.showMessage('Warning', `${workerName} has already logged time for this scope on one of the selected dates.`, 'warning');
        return;
      }

      const newEntries = entries.map(entry => ({
        userId: Auth.user.id,
        loggedByUserId: Auth.user.id,
        workerName,
        startTime: entry.startTime,
        endTime: entry.endTime,
        date: entry.date,
        note: noteVal,
        hours: entry.hours,
        checklistItemId: checklistItemId || null
      }));

      const updates = { updatedAt: new Date().toISOString() };
      if (item) {
        item.timeLogs = [...(item.timeLogs || []), ...newEntries];
        updates.checklist = checklist;
      } else {
        updates.timeLogs = [...(currentTask.timeLogs || []), ...newEntries];
      }
      DB.update('tasks', taskId, updates);
      overlay.remove();
      App.handleRoute();
    });
  },

  showAddTaskModal(wrId, onAdded) {
    const form = el('form', { class: 'form-stacked' });

    // Standard Task Template state
    let checklistItems = [];
    let checklistFromTemplate = false;
    const wr = DB.getById('workRequests', wrId);
    const isDraft = wr?.status === 'Draft';

    // Standard Task Template dropdown
    const templateGroup = el('div', { class: 'form-group' });
    templateGroup.appendChild(el('label', { text: 'Standard Task Template' }));
    const templateSel = el('select', { name: 'template' });
    templateSel.appendChild(el('option', { value: '', text: '— Custom —' }));
    this.standardTaskTemplates.forEach((tmpl, idx) => {
      templateSel.appendChild(el('option', { value: String(idx), text: tmpl.title }));
    });
    templateGroup.appendChild(templateSel);
    form.appendChild(templateGroup);

    // Task Title
    const titleInput = el('input', { type: 'text', name: 'title', required: true });
    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Task Title *' }),
      titleInput
    ]));

    // Checklist builder
    const checklistGroup = el('div', { class: 'form-group' });
    checklistGroup.appendChild(el('label', { text: 'Checklist Items' }));
    const checklistContainer = el('div', { class: 'checklist-items-container' });

    const checklistBuilder = el('div', { style: 'display:flex; gap:8px; align-items:center;' });
    const checklistInput = el('input', { type: 'text', placeholder: 'Add a checklist item...', style: 'flex:1;' });
    const addChecklistBtn = el('button', { type: 'button', class: 'btn btn-secondary btn-sm', text: 'Add' });
    checklistBuilder.appendChild(checklistInput);
    checklistBuilder.appendChild(addChecklistBtn);
    checklistContainer.appendChild(checklistBuilder);
    checklistGroup.appendChild(checklistContainer);
    form.appendChild(checklistGroup);

    const renderChecklist = () => {
      const existingList = checklistContainer.querySelector('.checklist-items-list');
      if (existingList) existingList.remove();
      if (checklistItems.length === 0) return;

      const list = el('div', { class: 'checklist-items-list', style: 'display:flex; flex-direction:column; gap:6px; margin-top:8px;' });
      checklistItems.forEach((item, idx) => {
        const row = el('div', { style: 'display:flex; align-items:center; gap:8px; padding:6px 8px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:6px;' });
        row.appendChild(el('span', { text: item.text, style: 'flex:1; font-size:0.85rem;' }));

        const prereqSelect = el('select', { style: 'font-size:0.8rem; max-width:140px;' });
        prereqSelect.appendChild(el('option', { value: '', text: '— None —' }));
        prereqSelect.appendChild(el('option', { value: '*', text: 'All Task (*)' }));
        checklistItems.slice(0, idx).forEach((prev, pIdx) => {
          if (!prev.id) prev.id = generateId('chk');
          prereqSelect.appendChild(el('option', { value: prev.id, text: `${pIdx + 1}. ${prev.text}` }));
        });
        if (checklistItems.length <= 1) {
          prereqSelect.disabled = true;
        }
        prereqSelect.value = item.dependsOn || '';
        prereqSelect.addEventListener('change', () => {
          item.dependsOn = prereqSelect.value || null;
        });
        row.appendChild(prereqSelect);

        const assigneeDropdown = this.createGroundWorkerDropdown({
          selectedGroundWorkerName: item.assigneeName,
          placeholder: 'Assign...',
          maxWidth: '140px',
          className: 'modal-checklist-assignee',
          onChange: ({ assigneeName }) => {
            item.assigneeId = null;
            item.assigneeName = assigneeName || null;
          }
        });
        row.appendChild(assigneeDropdown);

        const delBtn = el('button', { type: 'button', class: 'btn btn-danger btn-sm', text: '×' });
        delBtn.addEventListener('click', () => {
          checklistItems.splice(idx, 1);
          checklistFromTemplate = false;
          renderChecklist();
        });
        row.appendChild(delBtn);
        list.appendChild(row);
      });
      checklistContainer.insertBefore(list, checklistBuilder);
    };

    const addChecklistItem = () => {
      const val = checklistInput.value.trim();
      if (!val) return;
      checklistItems.push({ id: generateId('chk'), text: val, assigneeId: null, assigneeName: null, dependsOn: null, timeLogs: [] });
      checklistFromTemplate = false;
      checklistInput.value = '';
      renderChecklist();
    };
    addChecklistBtn.addEventListener('click', addChecklistItem);
    checklistInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addChecklistItem();
      }
    });

    templateSel.addEventListener('change', () => {
      const idx = parseInt(templateSel.value, 10);
      if (!isNaN(idx) && this.standardTaskTemplates[idx]) {
        const tmpl = this.standardTaskTemplates[idx];
        titleInput.value = tmpl.title;
        checklistItems = tmpl.defaultChecklist.map(text => ({ id: generateId('chk'), text, assigneeId: null, assigneeName: null, dependsOn: null, timeLogs: [] }));
        coAssignees = (tmpl.coAssignees || []).slice();
        checklistFromTemplate = true;
      } else {
        if (checklistFromTemplate) {
          checklistItems = [];
          coAssignees = [];
        }
        checklistFromTemplate = false;
      }
      renderChecklist();
      renderCoAssigneeChips();
    });

    const assigneeGroup = el('div', { class: 'form-group' });
    assigneeGroup.appendChild(el('label', { text: 'Assignee' }));

    // Ground worker assignee — typable dropdown like the filter tray
    const gwDropdown = this.createGroundWorkerDropdown({
      placeholder: 'Employee...',
      className: 'modal-task-assignee',
      onChange: () => {} // value read at submit time
    });

    const assigneeWrapper = el('div', { class: 'task-assignee-wrapper' });
    assigneeWrapper.appendChild(gwDropdown);
    assigneeGroup.appendChild(assigneeWrapper);
    form.appendChild(assigneeGroup);

    // Co-assignees
    let coAssignees = [];
    const coAssigneeGroup = el('div', { class: 'form-group' });
    coAssigneeGroup.appendChild(el('label', { text: 'Co-assignees' }));

    const coAssigneeChips = el('div', { class: 'co-assignee-chips' });
    const coAssigneeDropdown = this.createGroundWorkerDropdown({
      placeholder: 'Add co-assignee...',
      className: 'modal-co-assignee',
      onChange: ({ assigneeName }) => {
        const name = assigneeName?.trim();
        if (!name) return;
        const primaryName = (gwDropdown.searchText || '').trim();
        if (name === primaryName) {
          coAssigneeDropdown.value = '';
          return;
        }
        if (!coAssignees.includes(name)) {
          coAssignees.push(name);
          const existing = (DB.getAll('groundWorkers') || []).find(gw => gw.name.toLowerCase() === name.toLowerCase());
          if (!existing) {
            DB.insert('groundWorkers', { id: generateId('gw'), name });
          }
          renderCoAssigneeChips();
        }
        coAssigneeDropdown.value = '';
      }
    });

    const renderCoAssigneeChips = () => {
      coAssigneeChips.innerHTML = '';
      coAssignees.forEach((name, idx) => {
        const chip = el('span', { class: 'co-assignee-chip', text: name });
        const remove = el('span', { class: 'co-assignee-chip-remove', text: '×' });
        remove.addEventListener('click', () => {
          coAssignees.splice(idx, 1);
          renderCoAssigneeChips();
        });
        chip.appendChild(remove);
        coAssigneeChips.appendChild(chip);
      });
    };

    coAssigneeGroup.appendChild(coAssigneeChips);
    coAssigneeGroup.appendChild(coAssigneeDropdown);
    if (isDraft) {
      form.appendChild(coAssigneeGroup);
    }

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
      // Auto-check All Tasks (*) if all individual tasks are checked
      const allCheckbox = predMenu.querySelector('.multi-select-option input[value="*"]');
      const individualCheckboxes = Array.from(predMenu.querySelectorAll('.multi-select-option input')).filter(input => input.value !== '*');
      if (allCheckbox && !allCheckbox.checked && individualCheckboxes.length > 0 && individualCheckboxes.every(cb => cb.checked)) {
        allCheckbox.checked = true;
        if (!selectedPreds.includes('*')) {
          selectedPreds = ['*'];
        }
      }

      if (selectedPreds.includes('*')) {
        predBtn.textContent = 'All Tasks (*)';
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
      optionEl.appendChild(document.createTextNode('All Tasks (*)'));
      predMenu.appendChild(optionEl);
    }

    existingTasks.forEach(t => {
      const optionEl = el('label', { class: 'multi-select-option' });
      const checkbox = el('input', { type: 'checkbox', value: t.id });
      checkbox.addEventListener('change', () => {
        if (!checkbox.checked) {
          const allCheckbox = predMenu.querySelector('.multi-select-option input[value="*"]');
          if (allCheckbox) allCheckbox.checked = false;
          if (selectedPreds.includes('*')) {
            selectedPreds = existingTasks.map(x => x.id);
          }
          selectedPreds = selectedPreds.filter(id => id !== t.id);
        } else {
          if (selectedPreds.includes('*')) {
            selectedPreds = existingTasks.map(x => x.id);
            const allCheckbox = predMenu.querySelector('.multi-select-option input[value="*"]');
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
      const groundWorkerName = gwDropdown.searchText.trim();
      const data = Object.fromEntries(new FormData(form).entries());
      const allExistingIds = existingTasks.map(t => t.id);
      const predecessors = selectedPreds.includes('*') ? allExistingIds : selectedPreds;

      // Auto-register new ground workers
      if (groundWorkerName) {
        const existing = (DB.getAll('groundWorkers') || []).find(gw => gw.name.toLowerCase() === groundWorkerName.toLowerCase());
        if (!existing) {
          DB.insert('groundWorkers', { id: generateId('gw'), name: groundWorkerName });
        }
      }

      const newTask = {
        id: generateId('t'),
        workRequestId: wrId,
        title: data.title.trim(),
        assigneeId: null,
        assigneeName: groundWorkerName || null,
        coAssignees: isDraft ? coAssignees.filter(Boolean) : [],
        status: (groundWorkerName || coAssignees.length > 0) ? 'Assigned' : 'Draft',
        priority: data.priority || 'Normal',
        dueDate: data.dueDate || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        predecessors,
        checklist: checklistItems.map(item => ({
          id: item.id || generateId('chk'),
          text: item.text,
          completed: false,
          assigneeId: item.assigneeId || null,
          assigneeName: item.assigneeName || null,
          dependsOn: item.dependsOn || null,
          timeLogs: []
        })),
        timeLogs: [],
        taskDocuments: [],
        comments: []
      };
      DB.insert('tasks', newTask);
      overlay.remove();
      if (onAdded) onAdded();
    });
  },

  showEditTaskModal(taskId, onSaved) {
    const task = DB.getById('tasks', taskId);
    if (!task) return;
    const wr = DB.getById('workRequests', task.workRequestId);
    const isDraft = wr?.status === 'Draft';

    const form = el('form', { class: 'form-stacked' });

    // Task Title
    const titleInput = el('input', { type: 'text', name: 'title', required: true, value: task.title || '' });
    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Task Title *' }),
      titleInput
    ]));

    // Assignee Group
    const assigneeGroup = el('div', { class: 'form-group' });
    assigneeGroup.appendChild(el('label', { text: 'Assignee' }));
    const gwDropdown = this.createGroundWorkerDropdown({
      placeholder: 'Employee...',
      className: 'modal-task-assignee',
      selectedGroundWorkerName: task.assigneeName || '',
      onChange: () => {}
    });
    const assigneeWrapper = el('div', { class: 'task-assignee-wrapper' });
    assigneeWrapper.appendChild(gwDropdown);
    assigneeGroup.appendChild(assigneeWrapper);
    form.appendChild(assigneeGroup);

    // Co-assignees
    let coAssignees = [...(task.coAssignees || [])];
    const coAssigneeGroup = el('div', { class: 'form-group' });
    coAssigneeGroup.appendChild(el('label', { text: 'Co-assignees' }));
    const coAssigneeChips = el('div', { class: 'co-assignee-chips' });
    const coAssigneeDropdown = this.createGroundWorkerDropdown({
      placeholder: 'Add co-assignee...',
      className: 'modal-co-assignee',
      onChange: ({ assigneeName }) => {
        const name = assigneeName?.trim();
        if (!name) return;
        const primaryName = (gwDropdown.searchText || '').trim();
        if (name === primaryName) {
          coAssigneeDropdown.value = '';
          return;
        }
        if (!coAssignees.includes(name)) {
          coAssignees.push(name);
          const existing = (DB.getAll('groundWorkers') || []).find(gw => gw.name.toLowerCase() === name.toLowerCase());
          if (!existing) DB.insert('groundWorkers', { id: generateId('gw'), name });
          renderCoAssigneeChips();
        }
        coAssigneeDropdown.value = '';
      }
    });

    const renderCoAssigneeChips = () => {
      coAssigneeChips.innerHTML = '';
      coAssignees.forEach((name, idx) => {
        const chip = el('span', { class: 'co-assignee-chip', text: name });
        const remove = el('span', { class: 'co-assignee-chip-remove', text: '×' });
        remove.addEventListener('click', () => {
          coAssignees.splice(idx, 1);
          renderCoAssigneeChips();
        });
        chip.appendChild(remove);
        coAssigneeChips.appendChild(chip);
      });
    };
    renderCoAssigneeChips();
    coAssigneeGroup.appendChild(coAssigneeChips);
    coAssigneeGroup.appendChild(coAssigneeDropdown);
    if (isDraft) {
      form.appendChild(coAssigneeGroup);
    }

    // Due Date
    form.appendChild(el('div', { class: 'form-group' }, [
      el('label', { text: 'Due Date' }),
      el('input', { type: 'date', name: 'dueDate', value: task.dueDate || '' })
    ]));

    // Priority
    const priorityGroup = el('div', { class: 'form-group' });
    priorityGroup.appendChild(el('label', { text: 'Priority' }));
    const prioritySel = el('select', { name: 'priority' });
    ['Normal', 'Low Priority', 'Priority', 'Urgent'].forEach(p => {
      const opt = el('option', { value: p, text: p });
      if (p === task.priority) opt.selected = true;
      prioritySel.appendChild(opt);
    });
    priorityGroup.appendChild(prioritySel);
    form.appendChild(priorityGroup);

    // Dependencies selector
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

    const existingTasks = DB.getWhere('tasks', t => t.workRequestId === task.workRequestId && t.id !== task.id);
    let selectedPreds = [...(task.predecessors || [])];

    const updateModalSelectionText = () => {
      // Auto-check All Tasks (*) if all individual tasks are checked
      const allCheckbox = predMenu.querySelector('.multi-select-option input[value="*"]');
      const individualCheckboxes = Array.from(predMenu.querySelectorAll('.multi-select-option input')).filter(input => input.value !== '*');
      if (allCheckbox && !allCheckbox.checked && individualCheckboxes.length > 0 && individualCheckboxes.every(cb => cb.checked)) {
        allCheckbox.checked = true;
        if (!selectedPreds.includes('*')) {
          selectedPreds = ['*'];
        }
      }

      if (selectedPreds.includes('*')) {
        predBtn.textContent = 'All Tasks (*)';
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
      if (selectedPreds.includes('*')) checkbox.checked = true;
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
      optionEl.appendChild(document.createTextNode('All Tasks (*)'));
      predMenu.appendChild(optionEl);
    }

    existingTasks.forEach(t => {
      const optionEl = el('label', { class: 'multi-select-option' });
      const checkbox = el('input', { type: 'checkbox', value: t.id });
      if (selectedPreds.includes(t.id) || selectedPreds.includes('*')) checkbox.checked = true;
      checkbox.addEventListener('change', () => {
        if (!checkbox.checked) {
          const allCheckbox = predMenu.querySelector('.multi-select-option input[value="*"]');
          if (allCheckbox) allCheckbox.checked = false;
          if (selectedPreds.includes('*')) {
            selectedPreds = existingTasks.map(x => x.id);
          }
          selectedPreds = selectedPreds.filter(id => id !== t.id);
        } else {
          if (selectedPreds.includes('*')) {
            selectedPreds = existingTasks.map(x => x.id);
            const allCheckbox = predMenu.querySelector('.multi-select-option input[value="*"]');
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
    updateModalSelectionText();

    const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Save Changes' });
    form.appendChild(submitBtn);

    const overlay = this.showModal('Edit Task', form, null);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validateRequiredFields(form)) return;
      const groundWorkerName = gwDropdown.searchText.trim();
      const data = Object.fromEntries(new FormData(form).entries());
      const allExistingIds = existingTasks.map(t => t.id);
      const predecessors = selectedPreds.includes('*') ? allExistingIds : selectedPreds;

      // Auto-register new ground workers
      if (groundWorkerName) {
        const existing = (DB.getAll('groundWorkers') || []).find(gw => gw.name.toLowerCase() === groundWorkerName.toLowerCase());
        if (!existing) {
          DB.insert('groundWorkers', { id: generateId('gw'), name: groundWorkerName });
        }
      }

      DB.update('tasks', task.id, {
        title: data.title.trim(),
        assigneeId: null,
        assigneeName: groundWorkerName || null,
        coAssignees: isDraft ? coAssignees.filter(Boolean) : task.coAssignees || [],
        priority: data.priority || 'Normal',
        dueDate: data.dueDate || '',
        predecessors: predecessors,
        updatedAt: new Date().toISOString()
      });

      overlay.remove();
      if (onSaved) onSaved();
    });
  },

  renderModernProgressBar(status) {
    const stages = ['Work Request', 'Pre-processing', 'Processing', 'Billing', 'Disbursement', 'Documentation'];
    const map = { 'Draft': 0, 'Pre-processing': 1, 'Processing': 2, 'Billing': 3, 'Disbursement': 4, 'Completed': 5, 'Cancelled': 5 };
    const currentIdx = map[status] ?? 0;

    const tracker = el('div', { class: 'stage-tracker', 'aria-label': 'Work request stage' });

    stages.forEach((stageName, i) => {
      let stageClass = 'stage';
      if (i < currentIdx) {
        stageClass = 'stage completed';
      } else if (i === currentIdx) {
        stageClass = 'stage active';
      }

      const stageEl = el('div', { class: stageClass });
      
      const dotEl = i < currentIdx 
        ? el('div', { class: 'stage-dot', html: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` })
        : el('div', { class: 'stage-dot', text: String(i + 1) });

      const labelEl = el('span', { class: 'stage-label', text: stageName });

      stageEl.appendChild(dotEl);
      stageEl.appendChild(labelEl);
      tracker.appendChild(stageEl);

      if (i < stages.length - 1) {
        let connClass = 'stage-connector';
        if (i < currentIdx) {
          connClass = 'stage-connector completed';
        }
        const connectorEl = el('div', { class: connClass });
        tracker.appendChild(connectorEl);
      }
    });

    return tracker;
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

    // Retrieve associated Work Request, if any
    const wr = task.workRequestId ? DB.getById('workRequests', task.workRequestId) : null;
    let result;
    if (wr) {
      if (wr.status === 'Completed' || wr.status === 'Cancelled') {
        return [task.status];
      }
      let capStatus = null;
      if (wr.status === 'Draft') {
        capStatus = 'Assigned';
      } else if (wr.status === 'Pre-processing') {
        const title = (task.title || '').toLowerCase();
        if (title.includes('requirement') || title.includes('gather')) {
          capStatus = 'Completed';
        } else {
          capStatus = 'Assigned';
        }
      } else if (wr.status === 'Processing') {
        capStatus = 'Completed';
      } else if (wr.status === 'Billing' || wr.status === 'Disbursement') {
        capStatus = task.status;
      }

      if (capStatus) {
        const capIdx = flow.indexOf(capStatus);
        if (capIdx !== -1) {
          const capFlow = flow.slice(0, capIdx + 1);
          const filtered = new Set();
          allowed.forEach(status => {
            if (capFlow.includes(status) || status === 'Cancelled') {
              filtered.add(status);
            }
          });
          result = Array.from(filtered);
        }
      }
    }

    if (!result) result = Array.from(allowed);

    // Block terminal statuses if checklist has incomplete items
    const checklist = task.checklist || [];
    const hasIncomplete = checklist.some(item => {
      if (typeof item === 'string') return true;
      return !item.completed;
    });
    if (hasIncomplete) {
      result = result.filter(s => s !== 'Completed' && s !== 'For Review');
    }

    return result;
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
    const allowed = this.getValidNextStatuses(task);
    if (!allowed.includes(newStatus)) {
      const wr = task.workRequestId ? DB.getById('workRequests', task.workRequestId) : null;
      if (wr) {
        return { error: `Task status cannot be set to "${newStatus}" in the "${wr.status}" phase.` };
      }
      return { error: `Task status cannot be set to "${newStatus}".` };
    }
    if ((newStatus === 'In Progress' || newStatus === 'Completed') && !this.canStart(taskId)) {
      return { error: 'Dependency tasks must be completed first.' };
    }
    if (newStatus === 'Assigned' && !(task.assigneeId || task.assignedTo || task.assigneeName)) {
      return { error: 'A task cannot be marked Assigned without an assignee.' };
    }

    if (newStatus === 'Completed' || newStatus === 'For Review') {
      const checklist = task.checklist || [];
      const hasIncomplete = checklist.some(item => {
        if (typeof item === 'string') return true;
        return !item.completed;
      });
      if (hasIncomplete) {
        return { error: `All checklist items must be completed before marking this task as ${newStatus}.` };
      }
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
    if (!Auth.can('workflow:approve')) {
      this.view = 'list';
      App.handleRoute();
      return el('div');
    }

    const entity = Auth.activeEntity;
    const templates = DB.getWhere('retainerTemplates', t => t.entity === entity);

    const wrapper = el('div');

    const actions = el('div', { class: 'actions-bar' });
    const addBtn = el('button', { class: 'btn btn-primary', text: 'Create Template' });
    addBtn.addEventListener('click', () => {
      this.templateEditingId = null;
      openFormPanel({
        icon: '📋', title: 'Create Template',
        formContent: this.renderTemplateForm(), formId: 'template-form',
        actions: [
          { text: 'Save Template', class: 'btn btn-primary', type: 'submit', form: 'template-form' },
          { text: 'Cancel', class: 'btn btn-secondary', onClick: () => closeFormPanelAndRoute() }
        ]
      });
    });
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

      const editBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Edit' });
      editBtn.addEventListener('click', () => {
        this.templateEditingId = t.id;
        const tpl = DB.getById('retainerTemplates', t.id);
        openFormPanel({
          icon: '📋', title: tpl ? tpl.name : 'Edit Template',
          formContent: this.renderTemplateForm(), formId: 'template-form',
          actions: [
            { text: 'Save Template', class: 'btn btn-primary', type: 'submit', form: 'template-form' },
            { text: 'Cancel', class: 'btn btn-secondary', onClick: () => closeFormPanelAndRoute() }
          ]
        });
      });
      tdAct.appendChild(editBtn);
      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    wrapper.appendChild(table);
    return wrapper;
  },

  renderTemplateForm() {
    if (!Auth.can('workflow:approve')) {
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

    const backBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '← Back to Templates' });
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
      const gwAutocomplete = row.querySelector('.task-assignee-groundworker');
      const groundWorkerName = gwAutocomplete?.searchText?.trim() || '';

      // Auto-register new ground workers
      if (groundWorkerName) {
        const existing = (DB.getAll('groundWorkers') || []).find(gw => gw.name.toLowerCase() === groundWorkerName.toLowerCase());
        if (!existing) {
          DB.insert('groundWorkers', { id: generateId('gw'), name: groundWorkerName });
        }
      }

      const predKeysStr = row.dataset.predKeys || '';
      const predecessorKeys = predKeysStr.split(',').filter(Boolean);
      tasks.push({
        key: row.dataset.taskKey || generateId('tmp'),
        title,
        assigneeId: null,
        assigneeName: groundWorkerName || null,
        coAssignees: row._coAssignees || [],
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
      coAssignees: t.coAssignees || [],
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
    closeFormPanelAndRoute();
  },

  renderArchive() {
    const entity = Auth.activeEntity;
    const canApprove = Auth.can('workflow:approve');
    const archived = DB.getWhere('workRequests', wr => {
      const wrEnt = (wr.entity || '').toUpperCase();
      if (entity === 'ALL') {
        return Auth.user.entities.map(ae => ae.toUpperCase()).includes(wrEnt);
      }
      return wrEnt === entity.toUpperCase();
    }).filter(wr => wr.status === 'Cancelled');

    const container = el('div');

    if (archived.length === 0) {
      container.appendChild(el('p', { text: 'Trash is empty.', class: 'empty-state' }));
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
      const viewBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { location.hash = '#operations/detail/' + wr.id; });
      tdAct.appendChild(viewBtn);
      if (canApprove) {
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

    location.hash = '#operations/detail/' + workRequest.id;
  }
};
