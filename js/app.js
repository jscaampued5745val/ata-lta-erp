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
    this.setupLogout();
    const defaultRoute = Auth.user.role === 'Admin' || Auth.user.role === 'Manager' ? '#dashboard' : '#operations';
    location.hash = defaultRoute;
    this.handleRoute();
    this.updateSidebarNotifications();
  },

  updateSidebarNotifications() {
    const role = Auth.user.role;
    const isAdmin = role === 'Admin';
    const entity = Auth.activeEntity;

    const items = DB.getWhere('disbursements', d => d.entity === entity);
    let count = 0;

    items.forEach(d => {
      // Admin sees count of submissions awaiting their approval
      if (isAdmin && (d.status === 'Submitted' || d.status === 'Under Review')) {
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

    // Also badge the Admin nav link for pending disbursement submissions
    if (isAdmin) {
      const adminNav = document.querySelector('nav a[href="#admin"]');
      if (adminNav) {
        let adminBadge = adminNav.querySelector('.nav-badge');
        if (count > 0) {
          if (!adminBadge) {
            adminBadge = document.createElement('span');
            adminBadge.className = 'nav-badge';
            adminNav.appendChild(adminBadge);
          }
          adminBadge.textContent = count > 99 ? '99+' : count;
        } else if (adminBadge) {
          adminBadge.remove();
        }
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

    // Hide Admin nav link for non-Admin users
    const adminNav = document.querySelector('nav a[href="#admin"]');
    if (adminNav) {
      adminNav.parentElement.style.display = Auth.user.role === 'Admin' ? '' : 'none';
    }
  },

  renderEntitySwitcher() {
    const sel = document.getElementById('entity-switcher');
    sel.innerHTML = '';
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
