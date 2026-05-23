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
    this.setupLogout();
    const defaultRoute = Auth.user.role === 'Admin' || Auth.user.role === 'Manager' ? '#dashboard' : '#workflow';
    location.hash = defaultRoute;
    this.handleRoute();
  },

  renderShell() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-shell').classList.remove('hidden');
    document.getElementById('user-name').textContent = Auth.user.name;
    this.renderEntitySwitcher();
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
      '#workflow': Workflow,
      '#billing': Billing,
      '#disbursement': Disbursement,
      '#documents': DMS,
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
    }
  },

  highlightNav(hash) {
    document.querySelectorAll('nav a').forEach(a => {
      a.classList.toggle('active', a.getAttribute('href') === hash);
    });
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
