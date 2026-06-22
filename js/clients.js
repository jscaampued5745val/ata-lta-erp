/**
 * Client Management Module
 * List, search, create, edit clients scoped to active entity.
 */

const Clients = {
  editingId: null,
  activeTab: 'active',

  render() {
    if (!this.activeTab) this.activeTab = 'active';
    const container = el('div', { class: 'page' });
    
    if (this.editingId) {
      const isNew = this.editingId === 'new';
      const c = isNew ? null : DB.getById('clients', this.editingId);
      const titleBar = el('div', { class: 'page-title-bar-v2' });
      const h1 = el('h1', { class: 'breadcrumb-h1' });
      const baseLink = el('a', { href: 'javascript:void(0)', class: 'breadcrumb-base', text: 'Clients' });
      baseLink.addEventListener('click', () => { this.editingId = null; App.handleRoute(); });
      h1.appendChild(baseLink);
      h1.appendChild(el('span', { class: 'breadcrumb-sep', text: ' / ' }));
      h1.appendChild(document.createTextNode(isNew ? 'New Client' : (c?.name || 'Edit Client')));
      titleBar.appendChild(h1);
      
      const backBtn = el('button', { class: 'btn btn-secondary btn-sm', text: '← Back to List' });
      backBtn.addEventListener('click', () => { this.editingId = null; App.handleRoute(); });
      titleBar.appendChild(backBtn);
      container.appendChild(titleBar);

      const formContainer = el('div', { class: 'form-container' });
      container.appendChild(formContainer);
      this.renderForm(formContainer, this.editingId);

      return container;
    } else {
      container.appendChild(el('h1', { text: 'Clients' }));
    }

    // Tabs
    const tabs = el('div', { class: 'admin-tabs clients-tabs-bar', style: 'margin-bottom: 20px;' });
    const activeTabBtn = el('button', {
      class: 'btn ' + (this.activeTab === 'active' ? 'btn-primary' : 'btn-secondary'),
      text: 'Active Clients'
    });
    activeTabBtn.addEventListener('click', () => {
      this.activeTab = 'active';
      this.showList();
    });
    tabs.appendChild(activeTabBtn);

    const archivedTabBtn = el('button', {
      class: 'btn ' + (this.activeTab === 'archived' ? 'btn-primary' : 'btn-secondary'),
      text: 'Archived Clients'
    });
    archivedTabBtn.addEventListener('click', () => {
      this.activeTab = 'archived';
      this.showList();
    });
    tabs.appendChild(archivedTabBtn);
    container.appendChild(tabs);

    const actions = el('div', { class: 'actions-bar' + (this.activeTab === 'archived' ? ' hidden' : '') });

    if (Auth.can('clients:edit')) {
      const addBtn = el('button', { class: 'btn btn-primary', text: 'Add Client' });
      addBtn.addEventListener('click', () => this.showForm());
      actions.appendChild(addBtn);
    }

    const search = el('input', { type: 'text', placeholder: 'Search by taxpayer or TIN...', class: 'search-input' });
    search.addEventListener('input', debounce(() => this.renderList(listContainer, search.value.trim()), 200));
    actions.appendChild(search);
    container.appendChild(actions);

    const listContainer = el('div', { class: 'list-container' + (this.activeTab === 'archived' ? ' hidden' : '') });
    container.appendChild(listContainer);
    if (this.activeTab === 'active') {
      this.renderList(listContainer, '');
    }

    const archiveContainer = el('div', { class: 'archive-container' + (this.activeTab === 'active' ? ' hidden' : '') });
    container.appendChild(archiveContainer);
    if (this.activeTab === 'archived') {
      this.renderArchive(archiveContainer);
    }

    const formContainer = el('div', { class: 'form-container hidden' });
    container.appendChild(formContainer);

    return container;
  },

  init() {},

  clearNode(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  },

  getFilteredClients(query) {
    const entity = Auth.activeEntity;
    let clients = DB.getWhere('clients', c => {
      const matchesEntity = (entity === 'ALL' ? Auth.user.entities.includes(c.entity) : c.entity === entity);
      return matchesEntity && c.status !== 'Archived';
    });
    if (query) {
      const q = query.toLowerCase();
      clients = clients.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.tradeName || '').toLowerCase().includes(q) ||
        (c.tin || '').toLowerCase().includes(q)
      );
    }

    // Staff-level visibility filter: only see clients they're assigned to
    if (!Auth.can('clients:edit')) {
      const userId = Auth.user.id;
      const tasks = DB.getAll('tasks');
      const workRequests = DB.getAll('workRequests');
      // Find clients where user is assigned to any task
      const assignedClientIds = new Set();
      tasks.forEach(t => {
        if (t.assigneeId === userId) {
          const wr = workRequests.find(w => w.id === t.workRequestId);
          if (wr) assignedClientIds.add(wr.clientId);
        }
      });
      clients = clients.filter(c => c.contactUserId === userId || assignedClientIds.has(c.id));
    }

    return clients;
  },

  renderList(container, query) {
    this.clearNode(container);
    const clients = this.getFilteredClients(query);

    if (clients.length === 0) {
      container.appendChild(el('p', { text: 'No clients found.', class: 'empty-state' }));
      return;
    }

    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const headerRow = el('tr');
    ['Taxpayer', 'TIN', 'Point of Contact', 'Trade Name', 'Address', 'Related Companies', 'Contact Details', 'Entity', 'Retainer', 'Actions'].forEach(h => {
      headerRow.appendChild(el('th', { text: h }));
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = el('tbody');
    clients.forEach(c => {
      const pocUser = DB.getById('users', c.contactUserId);
      const row = el('tr');
      row.appendChild(el('td', { text: c.name }));
      row.appendChild(el('td', { text: c.tin }));
      row.appendChild(el('td', { text: pocUser?.name || c.contactPerson || '—' }));
      row.appendChild(el('td', { text: c.tradeName || '—' }));
      row.appendChild(el('td', { text: c.address || '—' }));

      // Related Companies
      const rcList = (c.relatedCompanies || []).map(rc => {
        const rcClient = DB.getById('clients', rc.clientId);
        return (rcClient?.name || '—') + ' (' + rc.relationType + ')';
      }).join(', ');
      row.appendChild(el('td', { text: rcList || '—' }));

      // Contact Details
      const cdList = (c.contactDetails || []).map(cd => cd.type + ': ' + cd.value).join(', ');
      row.appendChild(el('td', { text: cdList || '—' }));

      const badge = el('span', { class: 'badge badge-' + (c.entity === 'ATA' ? 'info' : 'success'), text: c.entity });
      const tdEntity = el('td');
      tdEntity.appendChild(badge);
      row.appendChild(tdEntity);
      row.appendChild(el('td', { text: (c.retainer || c.isRetainer) ? 'Yes' : 'No' }));
      const actions = el('td');
      if (Auth.can('clients:edit')) {
        const editBtn = el('button', { class: 'btn btn-secondary btn-sm', text: 'Edit' });
        editBtn.addEventListener('click', () => this.showForm(c.id));
        actions.appendChild(editBtn);
      }
      
      if (Auth.can('clients:edit')) {
        const archiveBtn = el('button', { 
          class: 'btn btn-secondary btn-sm text-danger', 
          text: 'Archive', 
          style: 'margin-left: 8px;' 
        });
        archiveBtn.addEventListener('click', () => {
          // Admin bypasses PendingChanges — intentional direct-role check (Gap 6)
          if (Auth.user.role === 'Admin') {
            this.archiveClientDirectly(c.id);
          } else {
            this.archiveClientRequest(c.id);
          }
        });
        actions.appendChild(archiveBtn);
      }

      row.appendChild(actions);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  },

  showForm(clientId) {
    this.editingId = clientId || 'new';
    App.handleRoute();
  },

  renderForm(container, clientId) {
    const client = clientId && clientId !== 'new' ? DB.getById('clients', clientId) : null;
    this.clearNode(container);

    // Form header bar
    const headerBar = el('div', { class: 'form-header-bar' });
    headerBar.appendChild(el('h2', { text: client ? 'Edit Client' : 'Add Client' }));
    const headerActions = el('div', { class: 'form-actions-top' });
    const saveBtnTop = el('button', { type: 'submit', form: 'client-form', class: 'btn btn-primary', text: client ? 'Save Changes' : 'Save Client' });
    headerActions.appendChild(saveBtnTop);
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-secondary', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.showList());
    headerActions.appendChild(cancelBtn);
    headerBar.appendChild(headerActions);
    container.appendChild(headerBar);

    const form = el('form', { id: 'client-form', class: 'form-stacked' });

    // Taxpayer name
    const nameGroup = el('div', { class: 'form-group' });
    nameGroup.appendChild(el('label', { text: 'Taxpayer *' }));
    const nameInput = el('input', { type: 'text', name: 'name', required: true, value: client ? (client.name || '') : '' });
    nameGroup.appendChild(nameInput);
    form.appendChild(nameGroup);

    // TIN
    const tinGroup = el('div', { class: 'form-group' });
    tinGroup.appendChild(el('label', { text: 'TIN *' }));
    const tinInput = el('input', { type: 'text', name: 'tin', required: true, placeholder: 'XXX-XXX-XXX-XXXX', value: client ? (client.tin || '') : '' });
    tinGroup.appendChild(tinInput);
    form.appendChild(tinGroup);

    // Trade Name
    const tradeGroup = el('div', { class: 'form-group' });
    tradeGroup.appendChild(el('label', { text: 'Trade Name' }));
    const tradeInput = el('input', { type: 'text', name: 'tradeName', value: client ? (client.tradeName || '') : '' });
    tradeGroup.appendChild(tradeInput);
    form.appendChild(tradeGroup);

    // Business Address
    const addrGroup = el('div', { class: 'form-group' });
    addrGroup.appendChild(el('label', { text: 'Business Address' }));
    const addrInput = el('input', { type: 'text', name: 'address', value: client ? (client.address || '') : '' });
    addrGroup.appendChild(addrInput);
    form.appendChild(addrGroup);

    // Point of Contact (combobox)
    const pocGroup = el('div', { class: 'form-group' });
    pocGroup.appendChild(el('label', { text: 'Point of Contact' }));
    
    const pocInput = el('input', { 
      type: 'text', 
      name: 'pointOfContactInput', 
      list: 'staff-list', 
      placeholder: '— Select or type Staff —'
    });
    const datalist = el('datalist', { id: 'staff-list' });

    const entityUsers = DB.getWhere('users', u => {
      const userEntities = (u.entities || []).map(e => e.toUpperCase());
      return Auth.ALL_ROLES.includes(u.role) && userEntities.includes(Auth.activeEntity);
    });
    entityUsers.forEach(u => {
      datalist.appendChild(el('option', { value: u.name + ' (' + u.role + ')' }));
    });
    
    if (client) {
      if (client.contactUserId) {
        const u = DB.getById('users', client.contactUserId);
        if (u) pocInput.value = u.name + ' (' + u.role + ')';
      } else if (client.contactPerson) {
        pocInput.value = client.contactPerson;
      }
    }
    
    pocGroup.appendChild(pocInput);
    pocGroup.appendChild(datalist);
    form.appendChild(pocGroup);

    // Contact Details (multi-entry)
    const cdSection = el('div', { class: 'form-section' });
    cdSection.appendChild(el('h3', { text: 'Contact Details' }));
    const cdContainer = el('div', { id: 'contact-details-container' });
    const contactDetails = client && Array.isArray(client.contactDetails) ? client.contactDetails : [];
    contactDetails.forEach((cd, idx) => this.addContactDetailRow(cdContainer, cd, idx));
    cdSection.appendChild(cdContainer);
    const addCdBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '+ Add Contact Detail' });
    addCdBtn.addEventListener('click', () => this.addContactDetailRow(cdContainer, null, cdContainer.childElementCount));
    cdSection.appendChild(addCdBtn);
    form.appendChild(cdSection);

    // Related Companies (multi-entry)
    const rcSection = el('div', { class: 'form-section' });
    rcSection.appendChild(el('h3', { text: 'Related Companies' }));
    const rcContainer = el('div', { id: 'related-companies-container' });
    const relatedCompanies = client && Array.isArray(client.relatedCompanies) ? client.relatedCompanies : [];
    relatedCompanies.forEach((rc, idx) => this.addRelatedCompanyRow(rcContainer, rc, idx));
    rcSection.appendChild(rcContainer);
    const addRcBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: '+ Add Related Company' });
    addRcBtn.addEventListener('click', () => this.addRelatedCompanyRow(rcContainer, null, rcContainer.childElementCount));
    rcSection.appendChild(addRcBtn);
    form.appendChild(rcSection);

    // Entity radio
    const entityGroup = el('div', { class: 'form-group' });
    entityGroup.appendChild(el('label', { text: 'Entity *' }));
    const radioWrap = el('div', { class: 'radio-group' });
    ['ATA', 'LTA'].forEach(e => {
      const label = el('label', { class: 'radio-label' });
      const radio = el('input', { type: 'radio', name: 'entity', value: e, required: true });
      if (client ? client.entity === e : Auth.activeEntity === e) radio.checked = true;
      label.appendChild(radio);
      label.appendChild(document.createTextNode(' ' + e));
      radioWrap.appendChild(label);
    });
    entityGroup.appendChild(radioWrap);
    form.appendChild(entityGroup);

    // Retainer checkbox
    const retainerGroup = el('div', { class: 'form-group' });
    const retainerLabel = el('label', { class: 'checkbox-label' });
    const retainerCb = el('input', { type: 'checkbox', name: 'retainer' });
    if (client && (client.retainer || client.isRetainer)) retainerCb.checked = true;
    retainerLabel.appendChild(retainerCb);
    retainerLabel.appendChild(document.createTextNode(' This client is on retainer'));
    retainerGroup.appendChild(retainerLabel);
    form.appendChild(retainerGroup);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitForm(form);
    });

    container.appendChild(form);
  },

  addContactDetailRow(container, data, idx) {
    const row = el('div', { class: 'multi-entry-row' });
    const typeSel = el('select', { class: 'form-select', name: 'cd-type-' + idx, style: 'flex: 0 0 120px;' });
    ['mobile', 'landline', 'email'].forEach(t => {
      typeSel.appendChild(el('option', { value: t, text: t.charAt(0).toUpperCase() + t.slice(1) }));
    });
    if (data && data.type) typeSel.value = data.type;
    const valueInput = el('input', { type: 'text', placeholder: 'Value', name: 'cd-value-' + idx, value: data ? (data.value || '') : '' });
    
    const updatePlaceholder = () => {
      if (typeSel.value === 'mobile') {
        valueInput.placeholder = 'e.g. 09123456789 (11 digits)';
        valueInput.maxLength = 11;
      } else if (typeSel.value === 'landline') {
        valueInput.placeholder = 'e.g. 123456789 (9 digits)';
        valueInput.maxLength = 9;
      } else if (typeSel.value === 'email') {
        valueInput.placeholder = 'e.g. user@theiremail.com';
        valueInput.removeAttribute('maxLength');
      }
      // Re-trigger restriction on type change if value exists
      if (valueInput.value) {
        valueInput.dispatchEvent(new Event('input'));
      }
    };
    
    valueInput.addEventListener('input', (e) => {
      if (typeSel.value === 'mobile' || typeSel.value === 'landline') {
        e.target.value = e.target.value.replace(/\D/g, ''); // Remove non-digits
      }
    });

    typeSel.addEventListener('change', updatePlaceholder);
    updatePlaceholder();

    const labelInput = el('input', { type: 'text', placeholder: 'Label (e.g. Work, Home)', name: 'cd-label-' + idx, value: data ? (data.label || '') : '' });
    const removeBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Remove' });
    removeBtn.addEventListener('click', () => row.remove());
    row.appendChild(typeSel);
    row.appendChild(valueInput);
    row.appendChild(labelInput);
    row.appendChild(removeBtn);
    container.appendChild(row);
  },

  addRelatedCompanyRow(container, data, idx) {
    const row = el('div', { class: 'multi-entry-row' });
    const entity = Auth.activeEntity;
    const clientSel = el('select', { class: 'form-select', name: 'rc-client-' + idx });
    clientSel.appendChild(el('option', { value: '', text: '— Select Client —' }));
    DB.getWhere('clients', c => c.entity === entity).forEach(c => {
      if (this.editingId && c.id === this.editingId) return; // skip self
      clientSel.appendChild(el('option', { value: c.id, text: c.name }));
    });
    if (data && data.clientId) clientSel.value = data.clientId;
    const relSel = el('select', { class: 'form-select', name: 'rc-relation-' + idx, style: 'flex: 0 0 160px;' });
    ['Parent', 'Subsidiary', 'Sister Company', 'Affiliate'].forEach(r => {
      relSel.appendChild(el('option', { value: r, text: r }));
    });
    if (data && data.relationType) relSel.value = data.relationType;
    const removeBtn = el('button', { type: 'button', class: 'btn btn-ghost btn-sm', text: 'Remove' });
    removeBtn.addEventListener('click', () => row.remove());
    row.appendChild(clientSel);
    row.appendChild(relSel);
    row.appendChild(removeBtn);
    container.appendChild(row);
  },

  showList() {
    this.editingId = null;
    App.handleRoute();
  },

  submitForm(form) {
    if (!validateRequiredFields(form)) return;

    const data = Object.fromEntries(new FormData(form).entries());

    if (!data.tin || !/^\d{3}-\d{3}-\d{3}-\d{4}$/.test(data.tin)) {
      const tinField = form.querySelector('[name="tin"]');
      showFieldError(tinField, 'TIN must be in format XXX-XXX-XXX-XXXX.');
      return;
    }

    const entityRadio = form.querySelector('input[name="entity"]:checked');
    if (!entityRadio) {
      showFieldError(form.querySelector('input[name="entity"]'), 'Entity is required.');
      return;
    }

    // Collect contact details
    const contactDetails = [];
    let hasContactError = false;
    const cdContainer = document.getElementById('contact-details-container');
    if (cdContainer) {
      cdContainer.querySelectorAll('.multi-entry-row').forEach(row => {
        const valueInput = row.querySelector('input[name^="cd-value-"]');
        const labelInput = row.querySelector('input[name^="cd-label-"]');
        if (!valueInput || !labelInput) return;

        const type = row.querySelector('select[name^="cd-type-"]')?.value;
        const value = valueInput.value.trim();
        const label = labelInput.value.trim();

        if (value || label) {
          if (!label) {
            showFieldError(labelInput, 'Label is required.');
            hasContactError = true;
          }
          if (!value) {
            showFieldError(valueInput, 'Value is required.');
            hasContactError = true;
          } else {
            if (type === 'mobile' && !/^\d{11}$/.test(value)) {
              showFieldError(valueInput, 'Mobile must be exactly 11 digits.');
              hasContactError = true;
            } else if (type === 'landline' && !/^\d{9}$/.test(value)) {
              showFieldError(valueInput, 'Landline must be exactly 9 digits.');
              hasContactError = true;
            } else if (type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
              showFieldError(valueInput, 'Please enter a valid email address.');
              hasContactError = true;
            }
          }
          contactDetails.push({ type, value, label });
        }
      });
    }

    if (hasContactError) return;

    // Collect related companies
    const relatedCompanies = [];
    const rcContainer = document.getElementById('related-companies-container');
    if (rcContainer) {
      rcContainer.querySelectorAll('.multi-entry-row').forEach(row => {
        const clientId = row.querySelector('select[name^="rc-client-"]')?.value;
        const relationType = row.querySelector('select[name^="rc-relation-"]')?.value;
        if (clientId && relationType) {
          relatedCompanies.push({ clientId, relationType });
        }
      });
    }

    const pocInputValue = (data.pointOfContactInput || '').trim();
    let contactUserId = '';
    let contactPerson = '';

    if (pocInputValue) {
      const matchedUser = DB.getWhere('users', u => (u.name + ' (' + u.role + ')') === pocInputValue)[0];
      if (matchedUser) {
        contactUserId = matchedUser.id;
      } else {
        contactPerson = pocInputValue;
      }
    }

    const record = {
      name: data.name.trim(),
      tin: data.tin.trim(),
      address: data.address ? data.address.trim() : '',
      tradeName: data.tradeName ? data.tradeName.trim() : '',
      contactUserId,
      entity: entityRadio.value,
      retainer: !!form.querySelector('input[name="retainer"]:checked'),
      contactDetails,
      relatedCompanies
    };

    if (this.editingId && this.editingId !== 'new') {
      record.id = this.editingId;
      const old = DB.getById('clients', this.editingId);
      if (old) {
        record.createdAt = old.createdAt;
        // Preserve legacy fields no longer in form
        record.phone = old.phone || '';
        record.email = old.email || '';
      }
      record.contactPerson = contactPerson;
      PendingChanges.submit('clients', record, false);
    } else {
      record.id = generateId('c');
      record.createdAt = new Date().toISOString();
      record.contactPerson = contactPerson;
      PendingChanges.submit('clients', record, true);
    }

    this.showList();
  },

  archiveClientDirectly(clientId) {
    if (!confirm('Are you sure you want to archive this client? This will cancel all related work requests and archive all associated documents.')) return;
    
    // 1. Update the client status to 'Archived'
    const client = DB.getById('clients', clientId);
    if (!client) return;
    client.status = 'Archived';
    client.updatedAt = new Date().toISOString();
    DB.update('clients', clientId, client);

    // 2. Cascade to Work Requests and Documents
    const wrs = DB.getWhere('workRequests', wr => wr.clientId === clientId);
    wrs.forEach(wr => {
      DB.update('workRequests', wr.id, { status: 'Cancelled', updatedAt: new Date().toISOString() });

      // Cascade to Documents
      const docs = DB.getWhere('documents', doc => doc.workRequestId === wr.id);
      docs.forEach(doc => {
        DB.update('documents', doc.id, { status: 'Archived', archived: true });
      });
    });

    alert('Client archived successfully.');
    App.handleRoute();
  },

  archiveClientRequest(clientId) {
    // Check if there is already a pending change to archive this client
    const pending = DB.getWhere('pendingChanges', pc => 
      pc.table === 'clients' && 
      pc.parentRecordId === clientId && 
      pc.status === 'pending' && 
      pc.proposedData && 
      pc.proposedData.status === 'Archived'
    );
    if (pending.length > 0) {
      alert('An archive request for this client is already pending approval.');
      return;
    }

    if (!confirm('Are you sure you want to request archiving this client? This requires Admin approval.')) return;

    const client = DB.getById('clients', clientId);
    if (!client) return;

    const proposed = deepClone(client);
    proposed.status = 'Archived';
    proposed.updatedAt = new Date().toISOString();

    const pc = {
      id: generateId('pc'),
      table: 'clients',
      parentRecordId: clientId,
      proposedData: proposed,
      submittedBy: Auth.user.id,
      submittedAt: new Date().toISOString(),
      status: 'pending',
      rejectionReason: '',
      reviewedBy: '',
      reviewedAt: ''
    };
    DB.insert('pendingChanges', pc);

    alert('Archive request submitted for Admin approval.');
    App.handleRoute();
  },

  getArchivedClients() {
    const entity = Auth.activeEntity;
    let clients = DB.getWhere('clients', c => {
      const matchesEntity = (entity === 'ALL' ? Auth.user.entities.includes(c.entity) : c.entity === entity);
      return matchesEntity && c.status === 'Archived';
    });

    // Staff-level visibility filter
    if (!Auth.can('clients:edit')) {
      const userId = Auth.user.id;
      const tasks = DB.getAll('tasks');
      const workRequests = DB.getAll('workRequests');
      const assignedClientIds = new Set();
      tasks.forEach(t => {
        if (t.assigneeId === userId) {
          const wr = workRequests.find(w => w.id === t.workRequestId);
          if (wr) assignedClientIds.add(wr.clientId);
        }
      });
      clients = clients.filter(c => c.contactUserId === userId || assignedClientIds.has(c.id));
    }
    return clients;
  },

  renderArchive(container) {
    this.clearNode(container);
    const archivedClients = this.getArchivedClients();

    if (archivedClients.length === 0) {
      container.appendChild(el('p', { text: 'No archived clients found.', class: 'empty-state' }));
      return;
    }

    const wrapper = el('div', { class: 'archive-list' });

    archivedClients.forEach(c => {
      const pocUser = DB.getById('users', c.contactUserId);
      const panel = el('div', { class: 'accordion-panel collapsed', style: 'margin-bottom: var(--spacing-md); border-color: var(--color-border);' });
      
      // Accordion Header
      const header = el('div', { class: 'accordion-header', style: 'display: flex; justify-content: space-between; align-items: center; padding: 12px 16px;' });
      
      const titleWrap = el('div', {}, [
        el('strong', { text: c.name, style: 'font-size: 1rem; color: var(--color-text);' }),
        el('span', { text: ' (TIN: ' + c.tin + ')', style: 'color: var(--color-text-muted); font-size: 0.875rem; margin-left: 8px;' })
      ]);
      
      header.appendChild(titleWrap);
      panel.appendChild(header);

      // Accordion Content
      const content = el('div', { class: 'accordion-content', style: 'padding: 16px; background: #fafafa;' });

      // Client info block
      const infoBlock = el('div', { style: 'display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-bottom: 20px; font-size: 0.875rem;' }, [
        el('div', {}, [ el('strong', { text: 'Trade Name: ' }), el('span', { text: c.tradeName || '—' }) ]),
        el('div', {}, [ el('strong', { text: 'Address: ' }), el('span', { text: c.address || '—' }) ]),
        el('div', {}, [ el('strong', { text: 'Point of Contact: ' }), el('span', { text: pocUser?.name || c.contactPerson || '—' }) ]),
        el('div', {}, [ el('strong', { text: 'Retainer Client: ' }), el('span', { text: (c.retainer || c.isRetainer) ? 'Yes' : 'No' }) ])
      ]);
      content.appendChild(infoBlock);

      // Fetch cancelled work requests
      const wrs = DB.getWhere('workRequests', wr => wr.clientId === c.id);
      
      // Work Requests Sub-section
      content.appendChild(el('h4', { text: 'Cancelled Work Requests', style: 'margin: 16px 0 8px 0; border-bottom: 1px solid var(--color-border); padding-bottom: 4px; font-size: 0.9rem; color: #374151;' }));
      if (wrs.length === 0) {
        content.appendChild(el('p', { text: 'No work requests found.', class: 'empty-state', style: 'font-size: 0.8125rem; color: var(--color-text-muted);' }));
      } else {
        const wrTable = el('table', { class: 'data-table', style: 'width: 100%; font-size: 0.8125rem; margin-bottom: 16px;' }, [
          el('thead', {}, [
            el('tr', {}, [
              el('th', { text: 'Title' }),
              el('th', { text: 'Priority' }),
              el('th', { text: 'Due Date' }),
              el('th', { text: 'Status' })
            ])
          ])
        ]);
        const wrTbody = el('tbody');
        wrs.forEach(wr => {
          wrTbody.appendChild(el('tr', {}, [
            el('td', { text: wr.title }),
            el('td', { text: wr.priority }),
            el('td', { text: wr.dueDate }),
            el('td', {}, [ el('span', { class: 'badge badge-danger', text: wr.status }) ])
          ]));
        });
        wrTable.appendChild(wrTbody);
        content.appendChild(wrTable);
      }

      // Fetch archived documents
      const wrIds = wrs.map(wr => wr.id);
      const docs = DB.getWhere('documents', d => wrIds.includes(d.workRequestId) && (d.status === 'Archived' || d.archived === true));

      // Documents Sub-section
      content.appendChild(el('h4', { text: 'Archived Documents', style: 'margin: 16px 0 8px 0; border-bottom: 1px solid var(--color-border); padding-bottom: 4px; font-size: 0.9rem; color: #374151;' }));
      if (docs.length === 0) {
        content.appendChild(el('p', { text: 'No archived documents found.', class: 'empty-state', style: 'font-size: 0.8125rem; color: var(--color-text-muted);' }));
      } else {
        const docTable = el('table', { class: 'data-table', style: 'width: 100%; font-size: 0.8125rem;' }, [
          el('thead', {}, [
            el('tr', {}, [
              el('th', { text: 'File Name' }),
              el('th', { text: 'Type' }),
              el('th', { text: 'Category' }),
              el('th', { text: 'Upload Date' })
            ])
          ])
        ]);
        const docTbody = el('tbody');
        docs.forEach(d => {
          docTbody.appendChild(el('tr', {}, [
            el('td', { text: d.fileName }),
            el('td', { text: d.document_type || '—' }),
            el('td', { text: d.category || '—' }),
            el('td', { text: new Date(d.uploadDate).toLocaleDateString() })
          ]));
        });
        docTable.appendChild(docTbody);
        content.appendChild(docTable);
      }

      panel.appendChild(content);

      // Event listener to toggle panel collapse
      header.addEventListener('click', () => {
        panel.classList.toggle('collapsed');
      });

      wrapper.appendChild(panel);
    });

    container.appendChild(wrapper);
  }
};
