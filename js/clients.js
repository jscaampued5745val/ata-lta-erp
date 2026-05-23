/**
 * Client Management Module
 * List, search, create, edit clients scoped to active entity.
 */

const Clients = {
  editingId: null,

  render() {
    const container = el('div', { class: 'page' });
    container.appendChild(el('h1', { text: 'Clients' }));

    const actions = el('div', { class: 'actions-bar' });
    const addBtn = el('button', { class: 'btn btn-primary', text: 'Add Client' });
    addBtn.addEventListener('click', () => this.showForm());
    actions.appendChild(addBtn);

    const search = el('input', { type: 'text', placeholder: 'Search by name or TIN...', class: 'search-input' });
    search.addEventListener('input', debounce(() => this.renderList(listContainer, search.value.trim()), 200));
    actions.appendChild(search);
    container.appendChild(actions);

    const listContainer = el('div', { class: 'list-container' });
    container.appendChild(listContainer);
    this.renderList(listContainer, '');

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
    let clients = DB.getWhere('clients', c => c.entity === entity);
    if (query) {
      const q = query.toLowerCase();
      clients = clients.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.tin.toLowerCase().includes(q)
      );
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
    ['Name', 'TIN', 'Contact', 'Entity', 'Retainer', 'Actions'].forEach(h => {
      headerRow.appendChild(el('th', { text: h }));
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = el('tbody');
    clients.forEach(c => {
      const row = el('tr');
      row.appendChild(el('td', { text: c.name }));
      row.appendChild(el('td', { text: c.tin }));
      row.appendChild(el('td', { text: c.contactPerson || '—' }));
      const badge = el('span', { class: 'badge badge-' + (c.entity === 'ATA' ? 'info' : 'success'), text: c.entity });
      const tdEntity = el('td');
      tdEntity.appendChild(badge);
      row.appendChild(tdEntity);
      row.appendChild(el('td', { text: c.retainer ? 'Yes' : 'No' }));
      const actions = el('td');
      const editBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'Edit' });
      editBtn.addEventListener('click', () => this.showForm(c.id));
      actions.appendChild(editBtn);
      row.appendChild(actions);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  },

  showForm(clientId) {
    const container = document.querySelector('.form-container');
    const list = document.querySelector('.list-container');
    const actions = document.querySelector('.actions-bar');
    if (container) container.classList.remove('hidden');
    if (list) list.classList.add('hidden');
    if (actions) actions.classList.add('hidden');

    this.editingId = clientId || null;
    const client = clientId ? DB.getById('clients', clientId) : null;

    this.clearNode(container);
    container.appendChild(el('h2', { text: clientId ? 'Edit Client' : 'Add Client' }));

    const form = el('form', { class: 'form-stacked' });
    const fields = [
      { label: 'Name', name: 'name', type: 'text', required: true },
      { label: 'TIN', name: 'tin', type: 'text', required: true, placeholder: 'XXX-XXX-XXX-XXXX' },
      { label: 'Business Address', name: 'address', type: 'text' },
      { label: 'Contact Person', name: 'contactPerson', type: 'text' },
      { label: 'Phone', name: 'phone', type: 'text' },
      { label: 'Email', name: 'email', type: 'email' },
    ];

    fields.forEach(f => {
      const group = el('div', { class: 'form-group' });
      group.appendChild(el('label', { text: f.label + (f.required ? ' *' : '') }));
      const input = el('input', {
        type: f.type,
        name: f.name,
        value: client ? (client[f.name] || '') : '',
        required: f.required,
        placeholder: f.placeholder || ''
      });
      group.appendChild(input);
      const error = el('span', { class: 'field-error hidden', text: '' });
      error.dataset.for = f.name;
      group.appendChild(error);
      form.appendChild(group);
    });

    // Entity radio
    const entityGroup = el('div', { class: 'form-group' });
    entityGroup.appendChild(el('label', { text: 'Entity *' }));
    const radioWrap = el('div', { class: 'radio-group' });
    ['ATA', 'LTA'].forEach(e => {
      const label = el('label', { class: 'radio-label' });
      const radio = el('input', { type: 'radio', name: 'entity', value: e });
      if (client ? client.entity === e : Auth.activeEntity === e) radio.checked = true;
      label.appendChild(radio);
      label.appendChild(document.createTextNode(' ' + e));
      radioWrap.appendChild(label);
    });
    entityGroup.appendChild(radioWrap);
    const entityError = el('span', { class: 'field-error hidden', text: '' });
    entityError.dataset.for = 'entity';
    entityGroup.appendChild(entityError);
    form.appendChild(entityGroup);

    // Retainer checkbox
    const retainerGroup = el('div', { class: 'form-group' });
    const retainerLabel = el('label', { class: 'checkbox-label' });
    const retainerCb = el('input', { type: 'checkbox', name: 'retainer' });
    if (client && client.retainer) retainerCb.checked = true;
    retainerLabel.appendChild(retainerCb);
    retainerLabel.appendChild(document.createTextNode(' This client is on retainer'));
    retainerGroup.appendChild(retainerLabel);
    form.appendChild(retainerGroup);

    const btnGroup = el('div', { class: 'form-group form-actions' });
    const saveBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Save Client' });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => this.showList());
    btnGroup.appendChild(saveBtn);
    btnGroup.appendChild(cancelBtn);
    form.appendChild(btnGroup);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitForm(form);
    });

    container.appendChild(form);
  },

  showList() {
    this.editingId = null;
    const container = document.querySelector('.form-container');
    const list = document.querySelector('.list-container');
    const actions = document.querySelector('.actions-bar');
    if (container) { this.clearNode(container); container.classList.add('hidden'); }
    if (list) list.classList.remove('hidden');
    if (actions) actions.classList.remove('hidden');
    const search = document.querySelector('.search-input');
    this.renderList(list, search ? search.value.trim() : '');
  },

  submitForm(form) {
    const data = Object.fromEntries(new FormData(form).entries());
    const errors = [];

    // Clear previous errors
    form.querySelectorAll('.field-error').forEach(e => { e.classList.add('hidden'); e.textContent = ''; });

    if (!data.name || data.name.trim().length < 2) {
      errors.push({ field: 'name', msg: 'Name is required (min 2 characters).' });
    }
    if (!data.tin || !/^\d{3}-\d{3}-\d{3}-\d{4}$/.test(data.tin)) {
      errors.push({ field: 'tin', msg: 'TIN must be in format XXX-XXX-XXX-XXXX.' });
    }
    const emailVal = form.querySelector('[name="email"]').value.trim();
    if (emailVal && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailVal)) {
      errors.push({ field: 'email', msg: 'Please enter a valid email address.' });
    }
    const entityRadio = form.querySelector('input[name="entity"]:checked');
    if (!entityRadio) {
      errors.push({ field: 'entity', msg: 'Entity is required.' });
    }

    if (errors.length > 0) {
      errors.forEach(err => {
        const elErr = form.querySelector('.field-error[data-for="' + err.field + '"]');
        if (elErr) { elErr.textContent = err.msg; elErr.classList.remove('hidden'); }
      });
      return;
    }

    const record = {
      name: data.name.trim(),
      tin: data.tin.trim(),
      address: data.address ? data.address.trim() : '',
      contactPerson: data.contactPerson ? data.contactPerson.trim() : '',
      phone: data.phone ? data.phone.trim() : '',
      email: emailVal,
      entity: entityRadio.value,
      retainer: !!form.querySelector('input[name="retainer"]:checked')
    };

    if (this.editingId) {
      DB.update('clients', this.editingId, record);
    } else {
      record.id = generateId('c');
      record.createdAt = new Date().toISOString();
      DB.insert('clients', record);
    }

    this.showList();
  }
};
