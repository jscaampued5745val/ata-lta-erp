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
  openGenerateBillingModal(wr) {
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
        taskSel.appendChild(el('option', { value: t.id, text: t.title }));
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

  render() {
    const container = el('div', { class: 'page' });
    
    if (this.view === 'detail' && this.detailWrId) {
      const wr = DB.getById('workRequests', this.detailWrId);

      // Breadcrumb title bar consistent with the rest of the system
      const client = DB.getById('clients', wr.clientId);
      const titleBar = el('div', { class: 'page-title-bar-v2' });
      const h1 = el('h1', { class: 'breadcrumb-h1' });
      const opLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Operations' });
      opLink.addEventListener('click', () => { this.view = 'list'; this.detailWrId = null; App.handleRoute(); });
      h1.appendChild(opLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      h1.appendChild(document.createTextNode(wr.title || 'Untitled Work Request'));
      titleBar.appendChild(h1);

      const actions = el('div', { class: 'title-bar-actions' });
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
      badges.appendChild(el('span', { class: `badge ${statusBadgeClass}`, text: wr.status }));

      if (wr?.priority && wr.priority !== 'Normal') {
        const priorityClass = { 'Urgent': 'badge-danger', 'Priority': 'badge-warn', 'Low Priority': 'badge-info' }[wr.priority] || 'badge-muted';
        badges.appendChild(el('span', { class: `badge ${priorityClass}`, text: wr.priority }));
      }

      const finBadge = this.getFinanceBadgeForWr(wr);
      const docBadge = this.getDocBadgeForWr(wr);
      if (finBadge) badges.appendChild(finBadge);
      if (docBadge) badges.appendChild(docBadge);
      actions.appendChild(badges);

      const backBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '← Back to Work Requests' });
      backBtn.addEventListener('click', () => { this.view = 'list'; this.detailWrId = null; App.handleRoute(); });
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
      document.querySelectorAll('.action-menu-list').forEach(m => {
        m.classList.add('hidden');
        m.classList.remove('open');
      });
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
      const templateBtn = el('button', { class: 'btn btn-secondary', text: 'Retainer Templates' });
      templateBtn.addEventListener('click', () => { this.view = 'templates'; this.templateEditingId = null; App.handleRoute(); });
      topActions.appendChild(templateBtn);
    }
    const archiveBtn = el('button', { class: 'btn btn-secondary', text: 'Archive' });
    archiveBtn.addEventListener('click', () => { this.view = 'archive'; App.handleRoute(); });
    topActions.appendChild(archiveBtn);
    headerBar.appendChild(topActions);
    wrapper.appendChild(headerBar);

    // Filters
    const filters = el('div', { class: 'filters-bar' });
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
      html: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="margin-right: 4px; vertical-align: middle;"><path d="M23 4v6h-6"></path><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>Clear'
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

    wrapper.appendChild(filters);

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

    // View mode toggle
    const viewMode = App.getPreferredViewMode('operations');
    const vmToggle = el('div', { class: 'view-mode-toggle', style: 'margin-bottom:var(--spacing-md);' });
    const vmTable = el('button', { html: ViewIcons.table + ' Table', class: viewMode === 'table' ? 'active' : '' });
    const vmBoard = el('button', { html: ViewIcons.board + ' Board', class: viewMode === 'board' ? 'active' : '' });
    const vmList = el('button', { html: ViewIcons.list + ' List', class: viewMode === 'list' ? 'active' : '' });
    vmTable.addEventListener('click', () => { saveCurrentFilters(); App.setPreferredViewMode('operations', 'table'); App.handleRoute(); });
    vmBoard.addEventListener('click', () => { saveCurrentFilters(); App.setPreferredViewMode('operations', 'board'); App.handleRoute(); });
    vmList.addEventListener('click', () => { saveCurrentFilters(); App.setPreferredViewMode('operations', 'list'); App.handleRoute(); });
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
      const viewBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { this.view = 'detail'; this.detailWrId = wr.id; App.handleRoute(); });
      tdAct.appendChild(viewBtn);
      if (isManagerial && wr.status === 'Draft') {
        const editBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Edit' });
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
    cancelBtn.addEventListener('click', () => { this.view = 'list'; this.editingId = null; App.handleRoute(); });
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

  /**
   * Renders an editable co-assignee chip list + dropdown for a saved task row.
   */
  renderTaskCoAssigneePicker(t, { primaryName = '', className = 'inline-coassignee-dropdown' } = {}, editable = false) {
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
            App.handleRoute();
          });
          chip.appendChild(remove);
        }
        chipsWrap.appendChild(chip);
      });
    };
    renderChips();

    wrap.appendChild(chipsWrap);
    if (editable) {
      const addDropdown = this.createGroundWorkerDropdown({
        placeholder: '+ Co-assignee',
        className,
        onChange: ({ assigneeName }) => {
          const name = assigneeName?.trim();
          if (!name) return;
          const coAssignees = t.coAssignees || [];
          if (coAssignees.includes(name)) { addDropdown.value = ''; return; }
          if (name === primaryName) { addDropdown.value = ''; return; }
          const existing = (DB.getAll('groundWorkers') || []).find(gw => gw.name.toLowerCase() === name.toLowerCase());
          if (!existing) DB.insert('groundWorkers', { id: generateId('gw'), name });
          const updated = [...coAssignees, name];
          DB.update('tasks', t.id, { coAssignees: updated, updatedAt: new Date().toISOString() });
          App.handleRoute();
        }
      });
      wrap.appendChild(addDropdown);
    }
    return wrap;
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
    const isDraft = wr.status === 'Draft';

    const container = el('div', { class: 'project-detail-v2' });
    container.selectedTaskIds = new Set();
    container.groupBy = 'phase';
    container.activeFilters = new Set();
    container.searchQuery = '';

    // Lifecycle Card Redesign
    const lifecycleCard = el('div', { class: 'lifecycle-card' });
    const lifecycleHeader = el('div', { class: 'lifecycle-header' });
    lifecycleHeader.appendChild(el('div', { class: 'lifecycle-label', text: 'Lifecycle' }));

    const lifecycleActions = el('div', { class: 'lifecycle-actions' });
    
    const ts = this.getPhaseTransitionStatus(wr.id);
    const showRouteButton = ts && ts.nextPhase && ts.nextPhase !== 'Cancelled';
    const canCancel = isManagerial && wr.status !== 'Completed' && wr.status !== 'Cancelled';
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

    const isDocStaff = Auth.user?.name?.toLowerCase().includes('documentation') ||
                       Auth.user?.email?.toLowerCase().startsWith('docs@');
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

    const groupToggle = el('div', { class: 'group-toggle' });
    const groupButtons = {};
    ['phase', 'assignee', 'flat'].forEach(mode => {
      const btn = el('button', {
        type: 'button',
        text: mode === 'phase' ? 'Phase' : mode === 'assignee' ? 'Assignee' : 'Flat List'
      });
      if (container.groupBy === mode) btn.classList.add('active');
      groupButtons[mode] = btn;
      btn.dataset.group = mode;
      btn.addEventListener('click', () => {
        if (container.groupBy === mode) return;
        container.groupBy = mode;
        updateToolbar();
        renderGroups();
      });
      groupToggle.appendChild(btn);
    });
    toolbar.appendChild(groupToggle);

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
          container.activeFilters.add(filter);
        }
        updateToolbar();
        renderGroups();
      });
      filterChips.appendChild(chip);
    });
    toolbar.appendChild(filterChips);

    const updateToolbar = () => {
      Object.keys(groupButtons).forEach(mode => {
        groupButtons[mode].classList.toggle('active', container.groupBy === mode);
      });
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

        const expanded = false;
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
          assigneeWrap.appendChild(this.renderTaskCoAssigneePicker(t, { primaryName: t.assigneeName || '', className: 'inline-coassignee-dropdown' }, isDraft));
          cellAssignee.appendChild(assigneeWrap);
        } else {
          const assigneeWrap = el('div', { class: 'assignee-avatars' });
          const displayNames = allAssigneeNames.slice(0, 3);
          displayNames.forEach(name => {
            const user = DB.getWhere('users', u => u.name === name)[0];
            const av = el('div', { class: 'avatar-xs', title: name });
            if (user?.avatarUrl) av.style.backgroundImage = `url('${user.avatarUrl}')`;
            else if (!user) av.textContent = name.charAt(0).toUpperCase();
            assigneeWrap.appendChild(av);
            const label = el('span', { class: 'assignee-name', text: name });
            assigneeWrap.appendChild(label);
          });
          if (allAssigneeNames.length > 3) {
            const overflow = el('span', { class: 'assignee-overflow', text: `+${allAssigneeNames.length - 3}`, title: allAssigneeNames.slice(3).join(', ') });
            assigneeWrap.appendChild(overflow);
          }
          if (allAssigneeNames.length === 0) {
            assigneeWrap.appendChild(el('span', { text: 'Unassigned', style: 'color:var(--muted);font-style:italic;' }));
          }
          cellAssignee.appendChild(assigneeWrap);
          cellAssignee.appendChild(this.renderTaskCoAssigneePicker(t, { primaryName: t.assigneeName || '', className: 'inline-coassignee-dropdown' }, isDraft));
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
          if (isArchived) {
            opt.disabled = true;
            opt.title = 'Work request is archived';
          } else if (blockedByChecklist) {
            opt.disabled = true;
            opt.title = `${checklistCompletion.total - checklistCompletion.done} of ${checklistCompletion.total} requirement items incomplete`;
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
          badge.addEventListener('click', (e) => { e.stopPropagation(); Billing.detailId = linkedInv.id; Billing.view = 'detail'; location.hash = '#billing'; App.handleRoute(); });
          linkedWrap.appendChild(badge);
        }
        linkedDisb.forEach(d => {
          const badge = el('span', { class: 'badge badge-warning', text: '💸 ' + d.category, style: 'cursor:pointer; font-size:10px;' });
          badge.addEventListener('click', (e) => { e.stopPropagation(); Disbursement.detailId = d.id; Disbursement.view = 'detail'; App.handleRoute(); });
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
        const detailsDiv = el('div', { class: 'detail-panel hidden accordion-panel collapsed' });
        
        // Two-pane layout direct children of detail-panel
        const leftPane = el('div');
        const rightPane = el('div', { class: 'detail-pane' });

        // --- Left Pane: Requirements Checklist ---
        const checklistSection = el('div', { class: 'task-details-col' });
        const checklistHeader = el('div', { class: 'detail-section-title' });
        checklistHeader.appendChild(el('span', { text: 'Requirements Checklist' }));
        checklistSection.appendChild(checklistHeader);

        const checklistList = el('div', { class: 'details-content-list' });
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
              const prereq = normalizedChecklist.find(c => c.id === item.dependsOn);
              const row = el('div', { class: 'checklist-item' + (blocked ? ' locked' : '') });
              const cb = el('input', { type: 'checkbox' });
              cb.checked = !!item.completed;
              cb.disabled = blocked;
              
              const textValue = blocked ? ('🔒 Waiting for: ' + (prereq ? prereq.text : 'Unknown')) : item.text;
              
              // Wrapping text in checklist-text span/div structure
              const textWrap = el('div', { class: 'checklist-text' });
              textWrap.appendChild(el('span', { text: textValue, class: item.completed ? 'completed' : '' }));
              
              cb.addEventListener('change', (e) => {
                e.stopPropagation();
                const now = new Date().toISOString();
                if (cb.checked) {
                  item.completed = true;
                } else {
                  item.completed = false;
                  normalizedChecklist.forEach(other => {
                    if (other.dependsOn === item.id) other.completed = false;
                  });
                }
                DB.update('tasks', t.id, { checklist: normalizedChecklist, updatedAt: now });
                renderChecklist();
              });
              row.appendChild(cb);
              row.appendChild(textWrap);

              const assigneeDropdown = this.createGroundWorkerDropdown({
                selectedGroundWorkerName: item.assigneeName,
                placeholder: 'Assign...',
                maxWidth: '160px',
                className: 'checklist-assignee-dropdown',
                priorityNames: getTaskAllAssigneeNames(t),
                onChange: ({ assigneeName }) => {
                  item.assigneeId = null;
                  item.assigneeName = assigneeName || null;
                  DB.update('tasks', t.id, { checklist: normalizedChecklist, updatedAt: new Date().toISOString() });
                }
              });
              row.appendChild(assigneeDropdown);

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

        const addChecklistRow = el('div', { class: 'add-checklist' });
        const newItemInput = el('input', { type: 'text', placeholder: 'Add checklist item...', id: 'newCheckInput' });
        const prereqSelect = el('select', { id: 'newCheckDep' });
        const populatePrereqSelect = () => {
          prereqSelect.innerHTML = '';
          prereqSelect.appendChild(el('option', { value: '', text: '— None —' }));
          normalizedChecklist.forEach(item => {
            prereqSelect.appendChild(el('option', { value: item.id, text: item.text }));
          });
        };
        populatePrereqSelect();
        const addItemBtn = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Add' });
        addItemBtn.addEventListener('click', () => {
          const val = newItemInput.value.trim();
          if (!val) return;
          const prereqId = prereqSelect.value || null;
          normalizedChecklist.push({ id: generateId('chk'), text: val, completed: false, assigneeId: null, assigneeName: null, dependsOn: prereqId, timeLogs: [] });
          DB.update('tasks', t.id, { checklist: normalizedChecklist, updatedAt: new Date().toISOString() });
          newItemInput.value = '';
          populatePrereqSelect();
          prereqSelect.value = '';
          renderChecklist();
        });
        addChecklistRow.appendChild(newItemInput);
        addChecklistRow.appendChild(prereqSelect);
        addChecklistRow.appendChild(addItemBtn);

        const checklistCard = el('div', { class: 'card card-compact', style: 'padding:0;' });
        checklistCard.appendChild(checklistList);
        checklistSection.appendChild(checklistCard);
        checklistSection.appendChild(addChecklistRow);
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
        const docsSection = el('div', { class: 'detail-block' });
        const docsHeader = el('div', { class: 'detail-section-title' });
        docsHeader.appendChild(el('span', { text: 'Attached Documents' }));
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

            if (isAdmin) {
              const dmsDoc = DB.getWhere('documents', doc => (doc.fileName === fName) && doc.workRequestId === wr.id)[0];
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

            if (isDocStaff || isAdmin) {
              const delBtn = el('button', { class: 'btn btn-ghost btn-xs', text: '×', style: 'color:var(--danger); font-size:1.2rem; padding:0 4px; line-height:1;' });
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

                  if (isAdmin && !isArchived) {
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

              if (isAdmin && !isArchived) {
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
        const logTimeTopBtn = el('button', { class: 'btn btn-primary btn-xs btn-add-inline', text: '+ Log Time' });
        logTimeTopBtn.addEventListener('click', (e) => { e.stopPropagation(); this.showAddTimeLogModal(t.id); });
        timeHeader.appendChild(logTimeTopBtn);
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
            const prereq = (t.checklist || []).find(c => c.id === item.dependsOn);
            const depItem = el('div', { class: 'dep-item' });
            depItem.appendChild(el('span', { text: prereq ? prereq.text : 'Unknown' }));
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
          rowEl.classList.toggle('expanded');
          detailsDiv.classList.toggle('hidden');
          detailsDiv.classList.toggle('collapsed');
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
        link.addEventListener('click', (e) => { e.stopPropagation(); Billing.detailId = inv.id; Billing.view = 'detail'; location.hash = '#billing'; App.handleRoute(); });
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

    // Generate Billing button
    const genBillingBtn = el('button', {
      class: 'btn btn-primary btn-sm',
      text: '+ Generate Billing',
      style: 'margin-top: 12px; width: 100%;'
    });
    genBillingBtn.addEventListener('click', () => {
      this.openGenerateBillingModal(wr);
    });
    invCol.appendChild(genBillingBtn);

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
        link.addEventListener('click', (e) => { e.stopPropagation(); Disbursement.detailId = d.id; Disbursement.view = 'detail'; location.hash = '#disbursement'; App.handleRoute(); });
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
        link.addEventListener('click', (e) => { e.stopPropagation(); Transmittal.detailId = t.id; Transmittal.view = 'detail'; location.hash = '#transmittal'; App.handleRoute(); });
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
        checklistItems.slice(0, idx).forEach((prev, pIdx) => {
          if (!prev.id) prev.id = generateId('chk');
          prereqSelect.appendChild(el('option', { value: prev.id, text: `${pIdx + 1}. ${prev.text}` }));
        });
        if (idx === 0) prereqSelect.disabled = true;
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

    const backBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '← Back to List' });
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

      const editBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Edit' });
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

    const backBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '← Back to Work Requests' });
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
      const viewBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'View' });
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
