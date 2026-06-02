/**
 * Authentication, Session & RBAC
 * Login, logout, session persistence, role-based access control, entity switching.
 */

const Auth = {
  user: null,
  activeEntity: null,

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
      Manager: ['clients:view','clients:edit','workflow:view','workflow:edit','workflow:approve','billing:view','billing:edit','billing:approve','disbursement:view','disbursement:approve','dms:view','dms:edit','reports:view','users:view'],
      Staff: ['clients:view','workflow:view','workflow:edit','billing:view','disbursement:view','disbursement:create','dms:view','dms:edit','reports:view'],
      Viewer: ['clients:view','workflow:view','billing:view','disbursement:view','dms:view','reports:view']
    };
    let allowed = perms[role]?.includes(action) || false;
    
    // Special case: dms:handover for Documentation Staff
    if (action === 'dms:handover' && role === 'Staff') {
      if (this.user.name.toLowerCase().includes('documentation')) allowed = true;
    }
    
    return allowed;
  },

  isSelfApprover(recordUserId) {
    return this.user?.id === recordUserId;
  },

  switchEntity(entity) {
    const upper = entity.toUpperCase();
    if (this.user?.entities.includes(upper)) {
      this.activeEntity = upper;
      sessionStorage.setItem('erp_session', JSON.stringify({ userId: this.user.id, activeEntity: upper }));
    }
  }
};
