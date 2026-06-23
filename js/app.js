/**
 * App Shell — Task 4
 * Hash router, navigation, module loader with placeholder stubs.
 */

const App = {
  currentModule: null,

  init() {
    if (!Auth.restoreSession()) return;
    this.renderShell();
    this.setupRouting();
    this.setupNavigation();
    this.setupResponsiveMenu();
    this.setupSidebarCollapse();
    this.setupLogout();
    
    // Default route is dashboard for all users
    const defaultRoute = '#dashboard';
    
    if (!location.hash || location.hash === '') {
       location.hash = defaultRoute;
    }
    
    this.handleRoute();
    this.updateSidebarNotifications();
    this.setupStickyTrayResize();
  },

  updateStickyTrayOffset() {
    const content = document.getElementById('content');
    if (!content) return;
    const tray = content.querySelector('.filters-bar, .task-view-toolbar');

    const setHeight = (el) => {
      const height = el ? el.getBoundingClientRect().height : 0;
      content.style.setProperty('--sticky-tray-height', `${height}px`);
    };

    if (typeof ResizeObserver !== 'undefined') {
      if (!this._trayObserver) {
        this._trayObserver = new ResizeObserver((entries) => {
          for (const entry of entries) setHeight(entry.target);
        });
      }
      if (this._trayTarget && this._trayTarget !== tray) {
        this._trayObserver.unobserve(this._trayTarget);
      }
      if (tray) {
        this._trayObserver.observe(tray);
        this._trayTarget = tray;
      } else {
        this._trayTarget = null;
      }
    }

    setHeight(tray);
  },

  setupStickyTrayResize() {
    let raf = 0;
    window.addEventListener('resize', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => this.updateStickyTrayOffset());
    });
  },

  updateSidebarNotifications() {
    const canApprove = Auth.can('disbursement:approve');
    const entity = Auth.activeEntity;

    const items = DB.getWhere('disbursements', d => d.entity === entity);
    let count = 0;

    items.forEach(d => {
      // Users with disbursement:approve permission see count of submissions awaiting approval
      if (canApprove && (d.status === 'Submitted' || d.status === 'Under Review')) {
        count++;
      }
      // Handlers see count of disbursements awaiting their final release
      if (d.status === 'Approved' && d.paymentHandledBy === Auth.user.id) {
        count++;
      }
    });

    const navLink = document.querySelector('nav a[href="#disbursement"]');
    if (navLink) {
      let badge = navLink.querySelector('.nav-badge');
      if (count > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'nav-badge';
          navLink.appendChild(badge);
        }
        badge.textContent = count > 99 ? '99+' : count;
      } else if (badge) {
        badge.remove();
      }
    }

    // Also badge the Admin nav link for pending changes and disbursement submissions
    if (canApprove) {
      const pendingChanges = (typeof PendingChanges !== 'undefined' && typeof PendingChanges.getAllPending === 'function') ? PendingChanges.getAllPending() : [];
      const adminCount = count + pendingChanges.length;
      const adminNav = document.querySelector('nav a[href="#admin"]');
      if (adminNav) {
        let adminBadge = adminNav.querySelector('.nav-badge');
        if (adminCount > 0) {
          if (!adminBadge) {
            adminBadge = document.createElement('span');
            adminBadge.className = 'nav-badge';
            adminNav.appendChild(adminBadge);
          }
          adminBadge.textContent = adminCount > 99 ? '99+' : adminCount;
        } else if (adminBadge) {
          adminBadge.remove();
        }
      }
    } else {
      // Staff-level: badge count of user's own pending changes, rejected changes, and pending requests
      const pendingChanges = (typeof PendingChanges !== 'undefined' && typeof PendingChanges.getPendingForUser === 'function') ? PendingChanges.getPendingForUser(Auth.user.id) : [];
      const rejectedChanges = (typeof PendingChanges !== 'undefined' && typeof PendingChanges.getRejectedForUser === 'function') ? PendingChanges.getRejectedForUser(Auth.user.id) : [];
      const myReqs = (typeof DB !== 'undefined' && typeof DB.getWhere === 'function') ? DB.getWhere('operationsRequests', r => r.requestedBy === Auth.user.id && r.status === 'pending') : [];
      const staffCount = pendingChanges.length + rejectedChanges.length + myReqs.length;
      const adminNav = document.querySelector('nav a[href="#admin"]');
      if (adminNav) {
        let adminBadge = adminNav.querySelector('.nav-badge');
        if (staffCount > 0) {
          if (!adminBadge) {
            adminBadge = document.createElement('span');
            adminBadge.className = 'nav-badge';
            adminNav.appendChild(adminBadge);
          }
          adminBadge.textContent = staffCount > 99 ? '99+' : staffCount;
        } else if (adminBadge) {
          adminBadge.remove();
        }
      }
    }

    // Badge Billing nav for pending billing operations requests
    const billingReqRole = Auth.user?.role;
    if (billingReqRole === 'Accounting' || billingReqRole === 'Admin' || billingReqRole === 'Manager') {
      const billingReqs = DB.getWhere('operationsRequests', r => r.status === 'pending' && r.type === 'billing');
      const billingNav = document.querySelector('nav a[href="#billing"]');
      if (billingNav) {
        let bBadge = billingNav.querySelector('.nav-badge');
        if (billingReqs.length > 0) {
          if (!bBadge) { bBadge = document.createElement('span'); bBadge.className = 'nav-badge'; billingNav.appendChild(bBadge); }
          bBadge.textContent = billingReqs.length > 99 ? '99+' : billingReqs.length;
        } else if (bBadge) { bBadge.remove(); }
      }
    }

    // Badge Disbursement nav for pending disbursement operations requests
    if (billingReqRole === 'Accounting' || billingReqRole === 'Admin' || billingReqRole === 'Manager') {
      const disbReqs = DB.getWhere('operationsRequests', r => r.status === 'pending' && r.type === 'disbursement');
      const disbNav = document.querySelector('nav a[href="#disbursement"]');
      if (disbNav) {
        let dBadge = disbNav.querySelector('.nav-badge');
        if (disbReqs.length > 0) {
          if (!dBadge) { dBadge = document.createElement('span'); dBadge.className = 'nav-badge'; disbNav.appendChild(dBadge); }
          dBadge.textContent = disbReqs.length > 99 ? '99+' : disbReqs.length;
        } else if (dBadge) { dBadge.remove(); }
      }
    }

    // Badge Transmittal nav for pending transmittal operations requests
    if (billingReqRole === 'Documentation' || billingReqRole === 'Admin' || billingReqRole === 'Manager') {
      const transReqs = DB.getWhere('operationsRequests', r => r.status === 'pending' && r.type === 'transmittal');
      const transNav = document.querySelector('nav a[href="#transmittal"]');
      if (transNav) {
        let tBadge = transNav.querySelector('.nav-badge');
        if (transReqs.length > 0) {
          if (!tBadge) { tBadge = document.createElement('span'); tBadge.className = 'nav-badge'; transNav.appendChild(tBadge); }
          tBadge.textContent = transReqs.length > 99 ? '99+' : transReqs.length;
        } else if (tBadge) { tBadge.remove(); }
      }
    }
  },

  renderShell() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    document.getElementById('user-name').textContent = Auth.user.name;
    const avatar = document.getElementById('user-avatar');
    if (avatar) {
      avatar.textContent = '';
      if (Auth.user.avatarUrl) {
        avatar.style.backgroundImage = `url('${Auth.user.avatarUrl}')`;
      } else {
        avatar.style.backgroundImage = `url('https://ui-avatars.com/api/?name=${encodeURIComponent(Auth.user.name)}&background=2563eb&color=fff')`;
      }
    }
    this.renderEntitySwitcher();

    // Configure Admin / My Submissions nav link dynamically based on role/permissions
    const adminNav = document.querySelector('nav a[href="#admin"]');
    if (adminNav) {
      const canManageUsers = Auth.can('users:view');
      const labelEl = adminNav.querySelector('.nav-link-text');
      if (canManageUsers) {
        adminNav.parentElement.style.display = '';
        if (labelEl) labelEl.textContent = 'Admin';
      } else {
        // Staff-level user: show as "My Submissions"
        adminNav.parentElement.style.display = '';
        if (labelEl) labelEl.textContent = 'My Submissions';
      }
    }

    // Hide Reports nav link for non-Managerial users
    const reportsNav = document.querySelector('nav a[href="#reports"]');
    if (reportsNav) {
      const canViewReports = Auth.can('reports:view');
      reportsNav.parentElement.style.display = canViewReports ? '' : 'none';
    }
  },

  renderEntitySwitcher() {
    const sel = document.getElementById('entity-switcher');
    sel.innerHTML = '';
    
    if (Auth.user.entities.length > 1 && Auth.isManagerial()) {
      const opt = document.createElement('option');
      opt.value = 'ALL';
      opt.textContent = 'Consolidated View';
      if ('ALL' === Auth.activeEntity) opt.selected = true;
      sel.appendChild(opt);
    }
    
    Auth.user.entities.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e;
      opt.textContent = e === 'ATA' ? 'ATA Accounting' : 'LTA Accounting';
      if (e === Auth.activeEntity) opt.selected = true;
      sel.appendChild(opt);
    });
    
    sel.onchange = (ev) => {
      Auth.switchEntity(ev.target.value);
      this.updateEntityBadge();
      this.handleRoute();
    };
  },

  updateEntityBadge() {
    const badge = document.getElementById('entity-badge');
    if (!badge) return;
    badge.textContent = Auth.activeEntity || '';
    badge.className = 'badge';
    if (Auth.activeEntity === 'ATA') badge.classList.add('badge-ata');
    else if (Auth.activeEntity === 'LTA') badge.classList.add('badge-lta');
  },

  setupRouting() {
    window.addEventListener('hashchange', () => this.handleRoute());
  },

  setupNavigation() {
    document.querySelectorAll('nav a[data-module]').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        location.hash = link.getAttribute('href');
      });
    });
  },

  setupResponsiveMenu() {
    const toggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const headerActions = document.querySelector('.header-actions');
    if (!toggle || !sidebar) return;

    toggle.addEventListener('click', () => {
      sidebar.classList.toggle('open');
      if (headerActions) headerActions.classList.toggle('show');
    });

    document.querySelectorAll('nav a[data-module]').forEach(link => {
      link.addEventListener('click', () => {
        sidebar.classList.remove('open');
        if (headerActions) headerActions.classList.remove('show');
      });
    });
  },

  setupSidebarCollapse() {
    const sidebar = document.getElementById('sidebar');
    const btn = document.getElementById('sidebar-collapse-btn');
    if (!sidebar || !btn) return;

    // Restore persisted state
    if (localStorage.getItem('erp_sidebar_collapsed') === 'true') {
      sidebar.classList.add('collapsed');
      btn.title = 'Expand sidebar';
    }

    btn.addEventListener('click', () => {
      sidebar.classList.toggle('collapsed');
      const isCollapsed = sidebar.classList.contains('collapsed');
      btn.title = isCollapsed ? 'Expand sidebar' : 'Collapse sidebar';
      localStorage.setItem('erp_sidebar_collapsed', isCollapsed);
    });
  },

  setupLogout() {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        Auth.logout();
        document.getElementById('app-shell').classList.add('hidden');
        document.getElementById('login-screen').classList.remove('hidden');
        const form = document.getElementById('login-form');
        if (form) form.reset();
        const errorEl = document.getElementById('login-error');
        if (errorEl) errorEl.classList.add('hidden');
      });
    }
  },

  handleRoute() {
    if (window.SidePaneInstance) window.SidePaneInstance.close();
    const hash = location.hash || '#dashboard';
    const moduleMap = {
      '#dashboard': Dashboard,
      '#clients': Clients,
      '#operations': Workflow,
      '#billing': Billing,
      '#disbursement': Disbursement,
      '#transmittal': Transmittal,
      '#reports': Reports,
      '#admin': Users
    };

    // RBAC: Restricted modules
    if (hash === '#reports' && !Auth.can('reports:view')) {
       location.hash = '#dashboard';
       return;
    }


    const module = moduleMap[hash];
    const content = document.getElementById('content');

    if (module && module.render) {
      content.innerHTML = '';
      const rendered = module.render();
      if (typeof rendered === 'string') {
        content.innerHTML = rendered;
      } else {
        content.appendChild(rendered);
      }
      if (module.init) module.init();
      this.highlightNav(hash);
      this.updateEntityBadge();
      this.updateSidebarNotifications();
      requestAnimationFrame(() => this.updateStickyTrayOffset());
    }
  },

  highlightNav(hash) {
    document.querySelectorAll('nav a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === hash);
    });
  },

  getPreferredViewMode(module) {
    const key = `erp_preferred_view_${module}`;
    const stored = localStorage.getItem(key);
    if (module === 'operations' || module === 'billing' || module === 'disbursement' || module === 'transmittals') {
      if (!stored || stored === 'card') return 'board';
    }
    if (stored === 'list' || stored === 'table' || stored === 'board') return stored;
    return 'list';
  },

  setPreferredViewMode(module, mode) {
    const key = `erp_preferred_view_${module}`;
    if (mode === 'list' || mode === 'table' || mode === 'board') {
      localStorage.setItem(key, mode);
    }
  },

  saveFilters(module, filterMap) {
    const key = `erp_filters_${module}`;
    try { sessionStorage.setItem(key, JSON.stringify(filterMap)); } catch (e) { /* ignore */ }
  },

  restoreFilters(module) {
    const key = `erp_filters_${module}`;
    try {
      const stored = sessionStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch (e) { return null; }
  },

  clearSavedFilters(module) {
    const key = `erp_filters_${module}`;
    try { sessionStorage.removeItem(key); } catch (e) { /* ignore */ }
  }
};

// Login form wiring
document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('email').value.trim();
      const password = document.getElementById('password').value;
      const errorEl = document.getElementById('login-error');

      if (Auth.login(email, password)) {
        if (errorEl) errorEl.classList.add('hidden');
        document.getElementById('login-screen').classList.add('hidden');
        document.getElementById('app-shell').classList.remove('hidden');
        App.init();
      } else {
        if (errorEl) {
          errorEl.textContent = 'Invalid email or password.';
          errorEl.classList.remove('hidden');
        }
      }
    });
  }

  if (Auth.restoreSession()) {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    App.init();
  }
});
