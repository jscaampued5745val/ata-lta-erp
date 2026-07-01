/**
 * Authentication, Session & RBAC
 * Login, logout, session persistence, role-based access control, entity switching.
 *
 * Roles:
 *   Admin         – unrestricted, always ['ATA','LTA']
 *   Manager       – unrestricted, either ['ATA'] or ['ATA','LTA'] (no LTA-only)
 *   Accounting    – per-entity staff, either ['ATA'] or ['LTA'] (never both)
 *   Operations    – per-entity staff, either ['ATA'] or ['LTA'] (never both)
 *   Documentation – cross-entity staff, always ['ATA','LTA']
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

  updateSessionClasses(hasSession) {
    if (hasSession) {
      document.documentElement.classList.add('has-session');
      document.documentElement.classList.remove('no-session');
    } else {
      document.documentElement.classList.add('no-session');
      document.documentElement.classList.remove('has-session');
    }
  },

  login(email, password) {
    const users = DB.getAll('users');
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) return false;
    this.user = user;
    // Normalize entity values to uppercase for consistency
    this.user.entities = this.user.entities.map(e => e.toUpperCase());
    this.activeEntity = this.user.entities.includes('ATA') ? 'ATA' : 'LTA';
    sessionStorage.setItem('erp_session', JSON.stringify({ userId: user.id, activeEntity: this.activeEntity }));
    this.updateSessionClasses(true);
    return true;
  },

  logout() {
    this.user = null;
    this.activeEntity = null;
    sessionStorage.removeItem('erp_session');
    this.updateSessionClasses(false);
  },

  restoreSession() {
    const s = JSON.parse(sessionStorage.getItem('erp_session') || 'null');
    if (!s) {
      this.updateSessionClasses(false);
      return false;
    }
    this.user = DB.getById('users', s.userId);
    if (this.user) {
      this.user.entities = this.user.entities.map(e => e.toUpperCase());
      this.activeEntity = s.activeEntity;
      this.updateSessionClasses(true);
      return true;
    } else {
      this.updateSessionClasses(false);
      return false;
    }
  },

  can(action, entity) {
    if (!this.user) return false;
    entity = (entity || this.activeEntity || '').toUpperCase();
    const role = this.user.role;
    if (role === 'Admin') return true;
    if (!this.user.entities.includes(entity)) return false;
    const perms = {
      Manager: ['clients:view','clients:edit','workflow:view','workflow:edit','workflow:approve','billing:view','billing:edit','billing:approve','disbursement:view','disbursement:approve','dms:view','dms:edit','dms:handover','reports:view','users:view','audit:view_all','transmittal:view','transmittal:edit'],
      Accounting: ['clients:view','workflow:view','workflow:edit','billing:view','billing:edit','disbursement:view','disbursement:create','dms:view','transmittal:view'],
      Operations: ['clients:view','workflow:view','workflow:edit','billing:view','billing:request','disbursement:view','disbursement:request','dms:view','transmittal:view','transmittal:request'],
      Documentation: ['clients:view','workflow:view','workflow:edit','billing:view','disbursement:view','dms:view','dms:edit','dms:handover','transmittal:view','transmittal:edit'],
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
