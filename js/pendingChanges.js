/**
 * Admin Review Gate — Pending Changes
 * Structural mutations are staged for Admin/Manager approval.
 * Staff-level roles (Accounting, Operations, Documentation, HR)
 * stage changes in pendingChanges for managerial review.
 */

const PendingChanges = {
  /**
   * Submit a structural change for review.
   * Admin/Manager bypass the gate and save directly.
   * Staff-level roles stage changes in pendingChanges.
   */
  submit(table, record, isNew) {
    const role = Auth.user?.role;
    if (role === 'Admin' || role === 'Manager') {
      if (isNew) {
        DB.insert(table, record);
      } else {
        DB.update(table, record.id, record);
      }
      return { approved: true };
    }

    const pc = {
      id: generateId('pc'),
      table,
      parentRecordId: isNew ? null : record.id,
      proposedData: deepClone(record),
      submittedBy: Auth.user.id,
      submittedAt: new Date().toISOString(),
      status: 'pending',
      rejectionReason: '',
      reviewedBy: '',
      reviewedAt: ''
    };
    DB.insert('pendingChanges', pc);
    return { approved: false, pendingId: pc.id };
  },

  getAllPending() {
    return DB.getWhere('pendingChanges', pc => pc.status === 'pending');
  },

  getPendingForUser(userId) {
    return DB.getWhere('pendingChanges', pc => pc.submittedBy === userId && pc.status === 'pending');
  },

  getRejectedForUser(userId) {
    return DB.getWhere('pendingChanges', pc => pc.submittedBy === userId && pc.status === 'rejected');
  },

  getById(id) {
    return DB.getById('pendingChanges', id);
  },

  approve(pendingId) {
    const pc = DB.getById('pendingChanges', pendingId);
    if (!pc || pc.status !== 'pending') return false;

    if (pc.parentRecordId) {
      DB.update(pc.table, pc.parentRecordId, pc.proposedData);
    } else {
      DB.insert(pc.table, pc.proposedData);
    }

    // Back-linking logic upon approval
    if (pc.table === 'invoices') {
      const record = pc.proposedData;
      const isNew = !pc.parentRecordId;
      const inv = isNew ? null : DB.getById('invoices', pc.parentRecordId);

      // Clean up old WR back-link if WR changed during edit
      if (!isNew && inv && inv.workRequestId && inv.workRequestId !== (record.workRequestId || null)) {
        const oldWr = DB.getById('workRequests', inv.workRequestId);
        if (oldWr && oldWr.linkedInvoiceId === record.id) {
          DB.update('workRequests', oldWr.id, { linkedInvoiceId: null });
        }
      }

      // Link to WR if selected
      if (record.workRequestId) {
        const wr = DB.getById('workRequests', record.workRequestId);
        if (wr) {
          DB.update('workRequests', wr.id, { linkedInvoiceId: record.id });
        }
      }
    } else if (pc.table === 'transmittals') {
      const record = pc.proposedData;
      const isNew = !pc.parentRecordId;
      const old = isNew ? null : DB.getById('transmittals', pc.parentRecordId);

      // Clean up old WR link if WR changed
      if (old && old.workRequestId && old.workRequestId !== (record.workRequestId || null)) {
        const oldWr = DB.getById('workRequests', old.workRequestId);
        if (oldWr) {
          const linkedIds = (oldWr.linkedTransmittalIds || []).filter(id => id !== record.id);
          DB.update('workRequests', oldWr.id, { linkedTransmittalIds: linkedIds });
        }
      }

      // Link to Work Request
      if (record.workRequestId) {
        const wr = DB.getById('workRequests', record.workRequestId);
        if (wr) {
          const linkedIds = new Set(wr.linkedTransmittalIds || []);
          linkedIds.add(record.id);
          DB.update('workRequests', wr.id, { linkedTransmittalIds: Array.from(linkedIds) });
        }
      }
    } else if (pc.table === 'clients') {
      const record = pc.proposedData;
      if (record.status === 'Archived' && pc.parentRecordId) {
        const clientId = pc.parentRecordId;
        // Cascade to Work Requests (set status to 'Cancelled')
        const wrs = DB.getWhere('workRequests', wr => wr.clientId === clientId);
        wrs.forEach(wr => {
          DB.update('workRequests', wr.id, { status: 'Cancelled', updatedAt: new Date().toISOString() });

          // Cascade to Documents
          const docs = DB.getWhere('documents', doc => doc.workRequestId === wr.id);
          docs.forEach(doc => {
            DB.update('documents', doc.id, { status: 'Archived', archived: true });
          });
        });
      }
    }

    DB.update('pendingChanges', pendingId, {
      status: 'approved',
      reviewedBy: Auth.user.id,
      reviewedAt: new Date().toISOString()
    });

    return true;
  },

  reject(pendingId, reason) {
    const pc = DB.getById('pendingChanges', pendingId);
    if (!pc || pc.status !== 'pending') return false;

    if (pc.table === 'invoices' && pc.parentRecordId) {
      DB.update('invoices', pc.parentRecordId, { status: 'Draft', rejectionReason: reason || '' });
    }

    DB.update('pendingChanges', pendingId, {
      status: 'rejected',
      rejectionReason: reason,
      reviewedBy: Auth.user.id,
      reviewedAt: new Date().toISOString()
    });

    return true;
  },

  resubmit(pendingId) {
    const pc = DB.getById('pendingChanges', pendingId);
    if (!pc || pc.status !== 'rejected') return false;

    DB.update('pendingChanges', pendingId, {
      status: 'pending',
      rejectionReason: '',
      reviewedBy: '',
      reviewedAt: ''
    });

    return true;
  },

  delete(pendingId) {
    DB.delete('pendingChanges', pendingId);
  },

  /**
   * Build a simple key-value diff between current and proposed records.
   */
  buildDiff(pc) {
    const current = pc.parentRecordId ? DB.getById(pc.table, pc.parentRecordId) : null;
    const proposed = pc.proposedData;
    const diffs = [];

    const allKeys = new Set([
      ...(current ? Object.keys(current) : []),
      ...Object.keys(proposed)
    ]);

    for (const key of allKeys) {
      if (['id', 'createdAt', 'updatedAt'].includes(key)) continue;
      const oldVal = current ? current[key] : undefined;
      const newVal = proposed[key];
      const oldStr = oldVal === undefined ? '(none)' : JSON.stringify(oldVal);
      const newStr = newVal === undefined ? '(none)' : JSON.stringify(newVal);
      if (oldStr !== newStr) {
        diffs.push({ key, old: oldStr, new: newStr });
      }
    }

    return { current, proposed, diffs, isNew: !pc.parentRecordId };
  },

  renderDiffTable(pc, container) {
    const { current, proposed, diffs, isNew } = this.buildDiff(pc);
    container.innerHTML = '';

    const grid = el('div', { class: 'diff-panel' }, [
      el('div', { class: 'diff-current' }, [
        el('h4', { text: isNew ? '(New Record)' : 'Current (Approved)' }),
        isNew && !current
          ? el('p', { class: 'empty-state', text: 'This is a new record.' })
          : this._renderRecordTable(current)
      ]),
      el('div', { class: 'diff-proposed' }, [
        el('h4', { text: 'Proposed (Pending)' }),
        this._renderRecordTable(proposed)
      ])
    ]);

    container.appendChild(grid);

    if (diffs.length > 0) {
      const diffSection = el('div', { style: 'margin-top:20px;' }, [
        el('h4', { text: 'Changed Fields' }),
        el('table', { class: 'report-table' }, [
          el('thead', {}, [
            el('tr', {}, [
              el('th', { text: 'Field' }),
              el('th', { text: 'Current' }),
              el('th', { text: 'Proposed' })
            ])
          ]),
          el('tbody', {}, diffs.map(d =>
            el('tr', {}, [
              el('td', { text: d.key }),
              el('td', { text: d.old }),
              el('td', { style: 'color:var(--color-warning); font-weight:600;', text: d.new })
            ])
          ))
        ])
      ]);
      container.appendChild(diffSection);
    }
  },

  _renderRecordTable(record) {
    if (!record) return el('p', { class: 'empty-state', text: 'No data' });
    const rows = Object.entries(record)
      .filter(([k]) => !['id', 'createdAt', 'updatedAt'].includes(k))
      .map(([k, v]) => {
        const valStr = typeof v === 'object' ? JSON.stringify(v) : String(v);
        return el('div', { style: 'display:flex; justify-content:space-between; padding:4px 0; border-bottom:1px solid var(--color-border); font-size:0.8125rem;' }, [
          el('span', { style: 'color:var(--color-text-muted);', text: k }),
          el('span', { text: valStr.length > 80 ? valStr.slice(0, 80) + '…' : valStr })
        ]);
      });
    return el('div', {}, rows);
  }
};
