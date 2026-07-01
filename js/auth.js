/**
 * Authentication, Session & RBAC
 * Login, logout, session persistence, role-based access control, entity switching.
 *
 * Roles:
 *   Admin         – unrestricted, always ['ATA','LTA']
 *                   Creates WRs directly; approves Manager WRs; approves all phase routing.
 *   Manager       – Creates WRs (requires Admin approval); approves tasks added by staff;
 *                   view-only for clients; cannot route phases.
 *                   Billing: can view all invoices for assigned WRs; request invoices
 *                   from Accounting; mark as paid (pending Admin approval).
 *                   Cannot create or edit invoices directly.
 *   Accounting    – per-entity staff, either ['ATA'] or ['LTA'] (never both)
 *                   Can add tasks (pending Manager approval); view WR details.
 *   Operations    – per-entity staff, either ['ATA'] or ['LTA'] (never both)
 *                   Can add tasks (pending Manager approval); upload documents for tasks; view WR details.
 *   Documentation – cross-entity staff, always ['ATA','LTA']
 *                   Can add tasks (pending Manager approval); view WR details.
 *   HR            – (placeholder) view-only, always ['ATA','LTA']
 *                   ⚠️ HR permissions are UNCONFIRMED — minimal/view-only pending
 *                   business confirmation of actual permission set.
 */

const Auth = {
  user: null,
  activeEntity: null,

  /** All non-Admin, non-Manager roles (i.e. staff-level roles). */
  STAFF_ROLES: ['Accounting', 'Operations', 'Documentation', 'HR'],

  /** Convenience: every valid role in the system. */
  ALL_ROLES: ['Admin', 'Manager', 'Accounting', 'Operations', 'Documentation', 'HR'],

  login(email, password) {
    const users = DB.getAll('users');
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) return false;
    this.user = user;
    // Normalize entity values to uppercase for consistency
    this.user.entities = this.user.entities.map(e => e.toUpperCase());
    this.activeEntity = this.user.entities.includes('ATA') ? 'ATA' : 'LTA';
    sessionStorage.setItem('erp_session', JSON.stringify({ userId: user.id, activeEntity: this.activeEntity }));
    return true;
  },

  logout() {
    this.user = null;
    this.activeEntity = null;
    sessionStorage.removeItem('erp_session');
  },

  restoreSession() {
    const s = JSON.parse(sessionStorage.getItem('erp_session') || 'null');
    if (!s) return false;
    this.user = DB.getById('users', s.userId);
    if (this.user) {
      this.user.entities = this.user.entities.map(e => e.toUpperCase());
    }
    this.activeEntity = s.activeEntity;
    return !!this.user;
  },

  can(action, entity) {
    if (!this.user) return false;
    entity = (entity || this.activeEntity || '').toUpperCase();
    const role = this.user.role;
    if (role === 'Admin') return true;
    if (!this.user.entities.includes(entity)) return false;
    const perms = {
      Manager: ['clients:view','workflow:view','workflow:edit','workflow:task_approve','billing:view','billing:request','billing:mark_paid','disbursement:view','disbursement:approve','dms:view','dms:edit','dms:handover','reports:view','users:view','audit:view_all','transmittal:view','transmittal:edit'],
      Accounting: ['clients:view','workflow:view','workflow:task_add','billing:view','billing:edit','disbursement:view','disbursement:create','dms:view','transmittal:view'],
      Operations: ['clients:view','workflow:view','workflow:task_add','workflow:task_upload','billing:view','billing:request','disbursement:view','disbursement:request','dms:view','transmittal:view','transmittal:request'],
      Documentation: ['clients:view','workflow:view','workflow:task_add','billing:view','disbursement:view','dms:view','dms:edit','dms:handover','transmittal:view','transmittal:edit'],
      // ⚠️ HR: UNCONFIRMED placeholder — minimal view-only across all modules
      // pending business owner confirmation of actual HR permission requirements.
      HR: ['clients:view','workflow:view','billing:view','disbursement:view','dms:view']
    };
    // Note: audit:view_all is shared by Admin and Manager (Admin always returns true).
    return perms[role]?.includes(action) || false;
  },

  isManagerial() {
    const role = this.user?.role;
    return role === 'Admin' || role === 'Manager';
  },

  /** Returns true if the current user has a staff-level role. */
  isStaff() {
    return this.STAFF_ROLES.includes(this.user?.role);
  },

  isSelfApprover(recordUserId) {
    return this.user?.id === recordUserId;
  },

  switchEntity(entity) {
    const upper = entity.toUpperCase();
    if (upper === 'ALL' || this.user?.entities.includes(upper)) {
      this.activeEntity = upper;
      sessionStorage.setItem('erp_session', JSON.stringify({ userId: this.user.id, activeEntity: upper }));
    }
  },
};
