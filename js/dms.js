/**
 * Document Management System (DMS)
 * Upload, version tracking, handover log.
 */

const DMS = {
  view: 'list',
  detailId: null,

  render() {
    const container = el('div', { class: 'page' });
    container.appendChild(el('h1', { text: 'Documents' }));

    if (this.view === 'list') container.appendChild(this.renderList());
    else if (this.view === 'form') container.appendChild(this.renderForm());
    else if (this.view === 'detail') container.appendChild(this.renderDetail());

    return container;
  },

  init() {},

  // ============================================================
  // List View
  // ============================================================
  renderList() {
    const entity = Auth.activeEntity;

    const actions = el('div', { class: 'actions-bar' });
    const addBtn = el('button', { class: 'btn btn-primary', text: 'Upload Document' });
    addBtn.addEventListener('click', () => { this.view = 'form'; this.detailId = null; App.handleRoute(); });
    actions.appendChild(addBtn);

    const typeFilter = el('select', { class: 'form-select', style: 'max-width:180px' });
    typeFilter.appendChild(el('option', { value: '', text: 'All Types' }));
    typeFilter.appendChild(el('option', { value: 'original_scan', text: 'Original Scan' }));
    typeFilter.appendChild(el('option', { value: 'generated_copy', text: 'Generated Copy' }));
    typeFilter.addEventListener('change', () => this.refreshList(listContainer, typeFilter.value, entityFilter.value));
    actions.appendChild(typeFilter);

    const entityFilter = el('select', { class: 'form-select', style: 'max-width:180px' });
    entityFilter.appendChild(el('option', { value: '', text: 'All Entities' }));
    ['ATA', 'LTA'].forEach(e => entityFilter.appendChild(el('option', { value: e, text: e })));
    entityFilter.value = entity;
    entityFilter.addEventListener('change', () => this.refreshList(listContainer, typeFilter.value, entityFilter.value));
    actions.appendChild(entityFilter);

    const listContainer = el('div');
    this.refreshList(listContainer, '', entity);

    const wrapper = el('div');
    wrapper.appendChild(actions);
    wrapper.appendChild(listContainer);
    return wrapper;
  },

  refreshList(container, typeFilter, entityFilter) {
    while (container.firstChild) container.removeChild(container.firstChild);

    let docs = DB.getWhere('documents', d => {
      // Only show documents with the new DMS schema (fileName property)
      if (!d.fileName) return false;
      if (entityFilter && d.entity !== entityFilter) return false;
      if (typeFilter && d.document_type !== typeFilter) return false;
      return true;
    });

    if (docs.length === 0) {
      container.appendChild(el('p', { text: 'No documents found.', class: 'empty-state' }));
      return;
    }

    const table = el('table', { class: 'data-table' });
    const thead = el('thead');
    const thr = el('tr');
    ['Filename', 'Work Request', 'Type', 'Uploader', 'Upload Date', 'Handover Status', 'Actions'].forEach(h => {
      thr.appendChild(el('th', { text: h }));
    });
    thead.appendChild(thr);
    table.appendChild(thead);

    const tbody = el('tbody');
    docs.forEach(doc => {
      const tr = el('tr');

      // Filename
      tr.appendChild(el('td', { text: doc.fileName }));

      // Work Request link
      const wr = DB.getById('workRequests', doc.workRequestId);
      const tdWr = el('td');
      if (wr) {
        const wrLink = el('a', { href: '#workflow', text: wr.title });
        wrLink.addEventListener('click', (e) => {
          e.preventDefault();
          Workflow.view = 'detail';
          Workflow.detailWrId = wr.id;
          location.hash = '#workflow';
        });
        tdWr.appendChild(wrLink);
      } else {
        tdWr.textContent = '—';
      }
      tr.appendChild(tdWr);

      // Document type badge
      const tdType = el('td');
      tdType.appendChild(this.docTypeBadge(doc.document_type));
      tr.appendChild(tdType);

      // Uploader
      const uploader = DB.getById('users', doc.uploader);
      tr.appendChild(el('td', { text: uploader?.name || '—' }));

      // Upload date
      tr.appendChild(el('td', { text: formatDate(doc.uploadDate) }));

      // Handover status
      const tdHandover = el('td');
      if (doc.document_type === 'original_scan') {
        const hasLog = doc.handover_log && doc.handover_log.length > 0;
        tdHandover.appendChild(el('span', {
          class: hasLog ? 'handover-completed' : 'handover-pending',
          text: hasLog ? 'Logged (' + doc.handover_log.length + ')' : 'Pending'
        }));
      } else {
        tdHandover.textContent = 'N/A';
      }
      tr.appendChild(tdHandover);

      // Actions
      const tdAct = el('td');
      const viewBtn = el('button', { class: 'btn btn-ghost btn-sm', text: 'View' });
      viewBtn.addEventListener('click', () => { this.view = 'detail'; this.detailId = doc.id; App.handleRoute(); });
      tdAct.appendChild(viewBtn);
      tr.appendChild(tdAct);

      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    container.appendChild(table);
  },

  docTypeBadge(type) {
    const map = {
      'original_scan': { cls: 'badge doc-type-badge-original', text: 'Original Scan' },
      'generated_copy': { cls: 'badge doc-type-badge-generated', text: 'Generated Copy' }
    };
    const cfg = map[type] || { cls: 'badge', text: type };
    return el('span', { class: cfg.cls, text: cfg.text });
  },

  // ============================================================
  // Upload Form
  // ============================================================
  renderForm() {
    const entity = Auth.activeEntity;
    const container = el('div');
    container.appendChild(el('h2', { text: 'Upload Document' }));

    const form = el('form', { class: 'form-stacked' });

    // File
    const fileGroup = el('div', { class: 'form-group' });
    fileGroup.appendChild(el('label', { text: 'File *' }));
    const fileInput = el('input', { type: 'file', name: 'file', required: true });
    fileGroup.appendChild(fileInput);
    const sizeWarning = el('span', { class: 'field-error hidden', text: '' });
    sizeWarning.id = 'file-size-warning';
    fileGroup.appendChild(sizeWarning);

    fileInput.addEventListener('change', () => {
      const file = fileInput.files[0];
      if (file && file.size > 2 * 1024 * 1024) {
        sizeWarning.textContent = 'Warning: File exceeds 2MB. Large files may impact browser performance.';
        sizeWarning.classList.remove('hidden');
      } else {
        sizeWarning.classList.add('hidden');
      }
    });

    form.appendChild(fileGroup);

    // Work Request
    const wrGroup = el('div', { class: 'form-group' });
    wrGroup.appendChild(el('label', { text: 'Work Request *' }));
    const wrSel = el('select', { name: 'workRequestId', required: true });
    wrSel.appendChild(el('option', { value: '', text: '— Select Work Request —' }));
    DB.getWhere('workRequests', wr => wr.entity === entity).forEach(wr => {
      wrSel.appendChild(el('option', { value: wr.id, text: wr.title }));
    });
    wrGroup.appendChild(wrSel);
    form.appendChild(wrGroup);

    // Document Type
    const typeGroup = el('div', { class: 'form-group' });
    typeGroup.appendChild(el('label', { text: 'Document Type *' }));
    const typeWrap = el('div', { class: 'radio-group' });
    [
      { value: 'original_scan', label: 'Original Scan' },
      { value: 'generated_copy', label: 'Generated Copy' }
    ].forEach(opt => {
      const label = el('label', { class: 'radio-label' });
      const radio = el('input', { type: 'radio', name: 'document_type', value: opt.value, required: true });
      label.appendChild(radio);
      label.appendChild(document.createTextNode(' ' + opt.label));
      typeWrap.appendChild(label);
    });
    typeGroup.appendChild(typeWrap);
    form.appendChild(typeGroup);

    // Category
    const catGroup = el('div', { class: 'form-group' });
    catGroup.appendChild(el('label', { text: 'Category *' }));
    const catSel = el('select', { name: 'category', required: true });
    catSel.appendChild(el('option', { value: '', text: '— Select Category —' }));
    ['Requirement Docs', 'Processed Forms', 'Government Receipts', 'Final Deliverables', 'Other'].forEach(c => {
      catSel.appendChild(el('option', { value: c, text: c }));
    });
    catGroup.appendChild(catSel);
    form.appendChild(catGroup);

    // Description
    const descGroup = el('div', { class: 'form-group' });
    descGroup.appendChild(el('label', { text: 'Description' }));
    descGroup.appendChild(el('textarea', { name: 'description', rows: 3 }));
    form.appendChild(descGroup);

    const btnGroup = el('div', { class: 'form-group form-actions' });
    const submitBtn = el('button', { type: 'submit', class: 'btn btn-primary', text: 'Upload' });
    const cancelBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel' });
    cancelBtn.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
    btnGroup.appendChild(submitBtn);
    btnGroup.appendChild(cancelBtn);
    form.appendChild(btnGroup);

    form.addEventListener('submit', (e) => { e.preventDefault(); this.submitUpload(form); });

    container.appendChild(form);
    return container;
  },

  submitUpload(form) {
    const fileInput = form.querySelector('input[name="file"]');
    const file = fileInput.files[0];
    if (!file) {
      alert('Please select a file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      this.saveDocument(form, file.name, dataUrl);
    };
    reader.onerror = () => {
      alert('Failed to read file.');
    };
    reader.readAsDataURL(file);
  },

  saveDocument(form, fileName, dataUrl) {
    const entity = Auth.activeEntity;
    const data = Object.fromEntries(new FormData(form).entries());
    const now = new Date().toISOString();

    const existing = DB.getWhere('documents', d =>
      d.fileName === fileName && d.workRequestId === data.workRequestId
    )[0];

    if (existing) {
      const versionEntry = {
        version: (existing.versions || []).length + 1,
        fileName: existing.fileName,
        uploader: existing.uploader,
        uploadDate: existing.uploadDate,
        dataUrl: existing.dataUrl
      };
      const versions = [...(existing.versions || []), versionEntry];

      DB.update('documents', existing.id, {
        fileName,
        workRequestId: data.workRequestId,
        document_type: data.document_type,
        category: data.category,
        uploader: Auth.user.id,
        uploadDate: now,
        description: data.description || '',
        dataUrl,
        versions,
        handover_log: existing.handover_log || []
      });
    } else {
      const record = {
        id: generateId('doc'),
        fileName,
        workRequestId: data.workRequestId,
        document_type: data.document_type,
        category: data.category,
        uploader: Auth.user.id,
        uploadDate: now,
        description: data.description || '',
        handover_log: [],
        entity,
        dataUrl,
        versions: []
      };
      DB.insert('documents', record);
    }

    this.view = 'list';
    this.detailId = null;
    App.handleRoute();
  },

  // ============================================================
  // Detail View
  // ============================================================
  renderDetail() {
    const doc = DB.getById('documents', this.detailId);
    if (!doc || !doc.fileName) {
      this.view = 'list';
      App.handleRoute();
      return el('div');
    }

    const container = el('div', { class: 'invoice-detail' });
    
    // Top actions bar
    const topActions = el('div', { class: 'actions-bar', style: 'margin-bottom: var(--spacing-lg);' });
    const topBackBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '← Back to List' });
    topBackBtn.addEventListener('click', () => { this.view = 'list'; this.detailId = null; App.handleRoute(); });
    topActions.appendChild(topBackBtn);
    container.appendChild(topActions);

    const uploader = DB.getById('users', doc.uploader);

    // Document info
    container.appendChild(el('h2', { text: doc.fileName }));

    const meta = el('div', { class: 'invoice-meta' });
    const wr = DB.getById('workRequests', doc.workRequestId);
    meta.appendChild(el('p', { text: 'Work Request: ' + (wr?.title || '—') }));

    const pType = el('p', { text: 'Type: ' });
    pType.appendChild(this.docTypeBadge(doc.document_type));
    meta.appendChild(pType);

    meta.appendChild(el('p', { text: 'Category: ' + (doc.category || '—') }));
    meta.appendChild(el('p', { text: 'Uploader: ' + (uploader?.name || '—') }));
    meta.appendChild(el('p', { text: 'Upload Date: ' + formatDate(doc.uploadDate) }));
    if (doc.description) meta.appendChild(el('p', { text: 'Description: ' + doc.description }));
    container.appendChild(meta);

    // Version History
    const versionSection = el('div', { class: 'dms-detail-section' });
    versionSection.appendChild(el('h3', { text: 'Version History' }));

    const versionCount = (doc.versions || []).length + 1;
    const versionTable = el('table', { class: 'data-table version-table' });
    const vThead = el('thead');
    const vThr = el('tr');
    ['Version', 'Filename', 'Uploader', 'Upload Date'].forEach(h => vThr.appendChild(el('th', { text: h })));
    vThead.appendChild(vThr);
    versionTable.appendChild(vThead);

    const vTbody = el('tbody');
    // Previous versions
    (doc.versions || []).forEach(v => {
      const vUploader = DB.getById('users', v.uploader);
      const vTr = el('tr');
      vTr.appendChild(el('td', { text: String(v.version) }));
      vTr.appendChild(el('td', { text: v.fileName }));
      vTr.appendChild(el('td', { text: vUploader?.name || '—' }));
      vTr.appendChild(el('td', { text: formatDate(v.uploadDate) }));
      vTbody.appendChild(vTr);
    });
    // Current version
    const curTr = el('tr');
    curTr.appendChild(el('td', { text: String(versionCount) }));
    curTr.appendChild(el('td', { text: doc.fileName }));
    curTr.appendChild(el('td', { text: uploader?.name || '—' }));
    curTr.appendChild(el('td', { text: formatDate(doc.uploadDate) }));
    vTbody.appendChild(curTr);
    versionTable.appendChild(vTbody);
    versionSection.appendChild(versionTable);
    container.appendChild(versionSection);

    // Handover Log (original scans only)
    if (doc.document_type === 'original_scan') {
      const handoverSection = el('div', { class: 'dms-detail-section' });
      handoverSection.appendChild(el('h3', { text: 'Handover Log' }));

      const logTable = el('table', { class: 'data-table handover-table' });
      const hThead = el('thead');
      const hThr = el('tr');
      ['Recipient', 'Date', 'Method'].forEach(h => hThr.appendChild(el('th', { text: h })));
      hThead.appendChild(hThr);
      logTable.appendChild(hThead);

      const hTbody = el('tbody');
      if (doc.handover_log && doc.handover_log.length > 0) {
        doc.handover_log.forEach(entry => {
          const hTr = el('tr');
          hTr.appendChild(el('td', { text: entry.handed_to }));
          hTr.appendChild(el('td', { text: formatDate(entry.handed_date) }));
          hTr.appendChild(el('td', { text: entry.method }));
          hTbody.appendChild(hTr);
        });
      } else {
        const emptyTr = el('tr');
        const emptyTd = el('td', { colspan: '3', text: 'No handover records yet.' });
        emptyTd.style.color = 'var(--color-text-muted)';
        emptyTd.style.fontStyle = 'italic';
        emptyTr.appendChild(emptyTd);
        hTbody.appendChild(emptyTr);
      }
      logTable.appendChild(hTbody);
      handoverSection.appendChild(logTable);

      // Record Handover button and inline form
      const recordBtn = el('button', { class: 'btn btn-primary', text: 'Record Handover' });
      const handoverForm = el('form', { class: 'form-stacked hidden' });

      const recGroup = el('div', { class: 'form-group' });
      recGroup.appendChild(el('label', { text: 'Recipient Name *' }));
      recGroup.appendChild(el('input', { type: 'text', name: 'recipient', required: true }));
      handoverForm.appendChild(recGroup);

      const dateGroup = el('div', { class: 'form-group' });
      dateGroup.appendChild(el('label', { text: 'Handover Date *' }));
      dateGroup.appendChild(el('input', { type: 'date', name: 'handoverDate', value: new Date().toISOString().slice(0, 10), required: true }));
      handoverForm.appendChild(dateGroup);

      const methodGroup = el('div', { class: 'form-group' });
      methodGroup.appendChild(el('label', { text: 'Method *' }));
      const methodSel = el('select', { name: 'method', required: true });
      methodSel.appendChild(el('option', { value: '', text: '— Select Method —' }));
      ['Pickup', 'Courier', 'Email', 'In-Person'].forEach(m => {
        methodSel.appendChild(el('option', { value: m, text: m }));
      });
      methodGroup.appendChild(methodSel);
      handoverForm.appendChild(methodGroup);

      const hfBtnGroup = el('div', { class: 'form-group form-actions' });
      const saveBtn = el('button', { type: 'submit', class: 'btn btn-success', text: 'Save Handover' });
      const cancelHfBtn = el('button', { type: 'button', class: 'btn btn-ghost', text: 'Cancel' });
      cancelHfBtn.addEventListener('click', () => {
        handoverForm.classList.add('hidden');
        recordBtn.classList.remove('hidden');
      });
      hfBtnGroup.appendChild(saveBtn);
      hfBtnGroup.appendChild(cancelHfBtn);
      handoverForm.appendChild(hfBtnGroup);

      handoverForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.recordHandover(this.detailId, new FormData(handoverForm));
      });

      recordBtn.addEventListener('click', () => {
        handoverForm.classList.remove('hidden');
        recordBtn.classList.add('hidden');
      });

      handoverSection.appendChild(recordBtn);
      handoverSection.appendChild(handoverForm);
      container.appendChild(handoverSection);
    }

    return container;
  },

  recordHandover(docId, formData) {
    const doc = DB.getById('documents', docId);
    if (!doc) return;

    const entry = {
      handed_to: formData.get('recipient'),
      handed_date: formData.get('handoverDate'),
      method: formData.get('method')
    };

    const handover_log = [...(doc.handover_log || []), entry];
    DB.update('documents', docId, { handover_log });
    App.handleRoute();
  }
};
