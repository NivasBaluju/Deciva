// =============================================================================
// Deciva — Frontend Application
// Premium White Aesthetic · Playfair Display + Inter
// =============================================================================

// ---------------------------------------------------------------------------
// SVG Icon Library (Heroicons stroke style, 24px viewBox)
// ---------------------------------------------------------------------------
const Icon = {
  shield:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  scales:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18"/><path d="M3 9l9-6 9 6"/><path d="M5 11l-2 5h4L5 11z"/><path d="M19 11l-2 5h4l-2-5z"/><path d="M8 21h8"/></svg>`,
  document: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  upload:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>`,
  grid:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
  chat:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>`,
  calendar: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
  pen:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
  lock:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>`,
  check:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  alert:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`,
  trending: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`,
  compare:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/></svg>`,
  share:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>`,
  download: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="8 17 12 21 16 17"/><line x1="12" y1="12" x2="12" y2="21"/><path d="M20.88 18.09A5 5 0 0018 9h-1.26A8 8 0 103 16.3"/></svg>`,
  logout:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
  trash:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
  link:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/></svg>`,
  eye:      `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
  star:     `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>`,
  settings: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
};

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
const State = {
  user: null,
  trust: null,
  documents: [],
  currentDoc: null
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function toast(message, type = 'info') {
  const root = document.getElementById('toast-root');
  const el = document.createElement('div');
  el.className = `toast badge-${type === 'error' ? 'danger' : type}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => el.remove(), 3800);
}

function esc(str) {
  return (str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso.includes('Z') || iso.includes('+') ? iso : iso + 'Z').toLocaleString();
}

function fmtBytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return `${n.toFixed(1)} ${units[i]}`;
}

// Show/hide footer for public vs. authenticated pages
function setPageMode(mode) {
  const footer = document.getElementById('main-footer');
  if (footer) footer.style.display = mode === 'auth' ? 'none' : '';
}

// ---------------------------------------------------------------------------
// Sidebar & Layout helpers
// ---------------------------------------------------------------------------
function sidebarNav(active) {
  const navItems = [
    { route: '#/dashboard',  icon: Icon.grid,     label: 'Dashboard'         },
    { route: '#/documents',  icon: Icon.document,  label: 'Documents'         },
    { route: '#/upload',     icon: Icon.upload,    label: 'Upload Document'   },
    { route: '#/contracts',  icon: Icon.pen,       label: 'Generate Contract' },
    { route: '#/deadlines',  icon: Icon.calendar,  label: 'Deadlines'         },
  ];
  const secItems = [
    { route: '#/security',   icon: Icon.shield,    label: 'Security Center'   },
  ];
  const isDoc = active.startsWith('#/document');

  function item(i) {
    const isActive = active === i.route || (isDoc && i.route === '#/documents');
    return `<button class="sidebar-item ${isActive ? 'active' : ''}" onclick="Router.go('${i.route}')">${i.icon} ${i.label}</button>`;
  }

  return `
    <div class="sidebar-label">Menu</div>
    ${navItems.map(item).join('')}
    <div class="sidebar-divider"></div>
    <div class="sidebar-label">Security</div>
    ${secItems.map(item).join('')}
    <div class="sidebar-bottom">
      <button class="sidebar-item" onclick="logout()">${Icon.logout} Sign out</button>
    </div>
  `;
}

function wrapAuth(activeRoute, html) {
  setPageMode('auth');
  return `
    <div class="authenticated-layout">
      <aside class="sidebar">${sidebarNav(activeRoute)}</aside>
      <div class="page-content fade-up">${html}</div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const Router = {
  routes: {},
  register(path, handler) { this.routes[path] = handler; },
  go(hash) { window.location.hash = hash; },
  async resolve() {
    const hash = window.location.hash || '#/';
    const parts = hash.replace('#/', '').split('/').filter(Boolean);
    const base = '#/' + (parts[0] || '');

    renderNav(base);

    const protectedRoutes = ['#/dashboard', '#/upload', '#/documents', '#/document', '#/compare', '#/contracts', '#/deadlines', '#/security', '#/share'];
    if (protectedRoutes.includes(base) && !State.user) {
      Router.go('#/login');
      return;
    }

    const handler = this.routes[base] || this.routes['#/notfound'];
    const app = document.getElementById('app');
    app.innerHTML = `<div class="spinner-center"><div class="spinner"></div></div>`;
    try {
      await handler(parts.slice(1));
    } catch (e) {
      console.error(e);
      app.innerHTML = emptyState(Icon.alert, 'Something went wrong', esc(e.message || 'Please try again.'));
    }
  }
};
window.addEventListener('hashchange', () => Router.resolve());

// ---------------------------------------------------------------------------
// Nav render
// ---------------------------------------------------------------------------
function renderNav(active) {
  const nav = document.getElementById('topnav');
  const actions = document.getElementById('topbar-actions');

  if (State.user) {
    // Sidebar handles navigation — topnav is minimal
    nav.innerHTML = '';
    const trustTone = State.trust >= 70 ? 'ok' : State.trust >= 40 ? 'warn' : 'danger';
    actions.innerHTML = `
      <span class="badge badge-${trustTone}" title="Zero-Trust Session Score">${Icon.shield} ${State.trust ?? '—'}</span>
      <span class="text-mid small bold" style="font-size:13px">${esc(State.user.name)}</span>
      <button class="btn btn-ghost btn-sm" onclick="logout()">${Icon.logout} Sign out</button>
    `;
  } else {
    setPageMode('public');
    nav.innerHTML = [
      ['#/', 'Home'],
      ['#/register', 'Features'],
      ['#/register', 'Security'],
    ].map(([href, label]) =>
      `<button class="${active === href ? 'active' : ''}" onclick="Router.go('${href}')">${label}</button>`
    ).join('');

    actions.innerHTML = `
      <button class="btn btn-ghost btn-sm" onclick="Router.go('#/login')">Log in</button>
      <button class="btn btn-primary btn-sm" onclick="Router.go('#/register')">Get Started</button>
    `;
  }
}

async function logout() {
  try { await Api.post('/api/auth/logout'); } catch (e) {}
  Api.clearToken();
  State.user = null;
  toast('Signed out securely', 'ok');
  Router.go('#/');
}

async function refreshMe() {
  if (!Api.getToken()) return;
  try {
    const { user, trust } = await Api.get('/api/auth/me');
    State.user = user;
    State.trust = trust.score;
  } catch (e) {
    Api.clearToken();
    State.user = null;
  }
}

// ---------------------------------------------------------------------------
// VIEW: Landing
// ---------------------------------------------------------------------------
Router.register('#/', async () => {
  setPageMode('public');
  document.getElementById('app').innerHTML = `
    <div class="landing-root">

      <!-- Scattered floating legal-insight cards -->
      <div class="landing-float landing-float--tl fade-up">
        ${floatCard('⚖️', 'Contract Review', 'AI clause extraction')}
      </div>
      <div class="landing-float landing-float--tr fade-up fade-up-1">
        ${floatCard('🔒', 'AES-256 Encrypted', 'Zero-trust security')}
      </div>
      <div class="landing-float landing-float--ml fade-up fade-up-2">
        ${floatCard('📄', '9 AI Capabilities', 'All in one platform')}
      </div>
      <div class="landing-float landing-float--mr fade-up fade-up-1">
        ${floatCard('🛡️', 'Compliance', 'GDPR · IT Act · ICA')}
      </div>
      <div class="landing-float landing-float--bl fade-up fade-up-3">
        ${floatCard('✍️', 'e-Contracts', 'RSA-2048 digital sig')}
      </div>
      <div class="landing-float landing-float--br fade-up fade-up-2">
        ${floatCard('📊', 'Risk Score', '0–100 instant analysis')}
      </div>

      <!-- Dead-centre content -->
      <div class="landing-center">
        <p class="landing-eyebrow fade-up">Enterprise Legal Intelligence</p>
        <h1 class="landing-headline fade-up fade-up-1">
          Secure Legal AI<br>for Modern Law
        </h1>
        <p class="landing-tagline fade-up fade-up-2">
          Analyze, compare &amp; generate legal documents — in seconds.
        </p>
        <div class="landing-actions fade-up fade-up-3">
          <button class="btn-hero" onclick="Router.go('${State.user ? '#/dashboard' : '#/register'}')">
            ${State.user ? 'Open Dashboard' : 'Get Started'}
          </button>
          <button class="btn-hero-ghost" onclick="Router.go('#/login')">Sign in →</button>
        </div>
      </div>

      <!-- Bottom security strip -->
      <div class="landing-bottom fade-up fade-up-4">
        <span>AES-256-GCM</span><span class="lbar-dot"></span>
        <span>Zero-Trust Sessions</span><span class="lbar-dot"></span>
        <span>Immutable Audit Ledger</span><span class="lbar-dot"></span>
        <span>RSA-2048 Signatures</span><span class="lbar-dot"></span>
        <span>GDPR · IT Act · ICA</span>
      </div>
    </div>
  `;
});

function floatCard(emoji, title, sub) {
  return `<div class="lf-card">
    <div class="lf-emoji">${emoji}</div>
    <div class="lf-title">${title}</div>
    <div class="lf-sub">${sub}</div>
  </div>`;
}

function featureCard(color, icon, title, desc) {
  const cls = { blue: 'feature-icon-blue', gold: 'feature-icon-gold', green: 'feature-icon-green', navy: 'feature-icon-navy' }[color] || 'feature-icon-blue';
  return `<div class="card feature-card">
    <div class="feature-icon ${cls}">${icon}</div>
    <h3>${title}</h3>
    <p>${desc}</p>
  </div>`;
}

function animateCounters() {
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = Number(el.dataset.count);
    let cur = 0;
    const step = Math.max(1, Math.round(target / 40));
    const iv = setInterval(() => {
      cur += step;
      if (cur >= target) { cur = target; clearInterval(iv); }
      el.textContent = cur;
    }, 20);
  });
}

// ---------------------------------------------------------------------------
// VIEW: Register
// ---------------------------------------------------------------------------
Router.register('#/register', async () => {
  setPageMode('public');
  document.getElementById('app').innerHTML = `
    <div class="auth-cinematic">
      <div class="auth-visual">
        <div class="auth-visual-inner">
          <div class="auth-visual-logo">
            <div class="avc-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="22" height="22"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span class="avc-brand">Deciva</span>
          </div>
          <div class="auth-visual-quote">
            <div class="auth-visual-mark">"</div>
            <p>Legal intelligence that protects your firm as fiercely as you protect your clients.</p>
            <div class="auth-visual-rule"></div>
            <div class="auth-trust-pills">
              <span class="auth-pill">AES-256-GCM</span>
              <span class="auth-pill">Zero-Trust</span>
              <span class="auth-pill">GDPR Ready</span>
            </div>
          </div>
        </div>
      </div>
      <div class="auth-panel">
        <div class="auth-form-card fade-up">
          <p class="auth-step-label">New account</p>
          <h2 class="auth-form-title">Create your account</h2>
          <p class="auth-form-sub">Start your free trial. No credit card required.</p>
          <form id="regForm" class="auth-form">
            <div class="input-group">
              <label for="reg-name">Full name</label>
              <input id="reg-name" name="name" placeholder="Jane Smith" autocomplete="name" required />
            </div>
            <div class="input-group">
              <label for="reg-email">Work email</label>
              <input id="reg-email" type="email" name="email" placeholder="jane@lawfirm.com" autocomplete="email" required />
            </div>
            <div class="input-group">
              <label for="reg-pw">Password</label>
              <input id="reg-pw" type="password" name="password" placeholder="Min. 8 characters" minlength="8" autocomplete="new-password" required />
            </div>
            <button class="btn-auth-submit" type="submit">Create Account</button>
          </form>
          <p class="auth-switch">Already have an account? <a href="#/login">Sign in</a></p>
        </div>
      </div>
    </div>
  `;
  document.getElementById('regForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await Api.post('/api/auth/register', Object.fromEntries(fd));
      toast('Account created — please sign in', 'ok');
      Router.go('#/login');
    } catch (err) { toast(err.message, 'error'); }
  };
});

// ---------------------------------------------------------------------------
// VIEW: Login
// ---------------------------------------------------------------------------
Router.register('#/login', async () => {
  setPageMode('public');
  document.getElementById('app').innerHTML = `
    <div class="auth-cinematic">
      <div class="auth-visual">
        <div class="auth-visual-inner">
          <div class="auth-visual-logo">
            <div class="avc-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="22" height="22"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span class="avc-brand">Deciva</span>
          </div>
          <div class="auth-visual-quote">
            <div class="auth-visual-mark">"</div>
            <p>The gold standard in AI-powered legal document intelligence.</p>
            <div class="auth-visual-rule"></div>
            <div class="auth-trust-pills">
              <span class="auth-pill">Zero-Trust</span>
              <span class="auth-pill">MFA Ready</span>
              <span class="auth-pill">Audit Ledger</span>
            </div>
          </div>
        </div>
      </div>
      <div class="auth-panel">
        <div class="auth-form-card fade-up">
          <p class="auth-step-label">Welcome back</p>
          <h2 class="auth-form-title">Sign in</h2>
          <p class="auth-form-sub">Access your encrypted legal workspace.</p>
          <form id="loginForm" class="auth-form">
            <div class="input-group">
              <label for="login-email">Email address</label>
              <input id="login-email" type="email" name="email" placeholder="jane@lawfirm.com" autocomplete="email" required />
            </div>
            <div class="input-group">
              <label for="login-pw">Password</label>
              <input id="login-pw" type="password" name="password" placeholder="••••••••" autocomplete="current-password" required />
            </div>
            <button class="btn-auth-submit" type="submit">Sign In Securely</button>
          </form>
          <p class="auth-switch">New here? <a href="#/register">Create an account</a></p>
        </div>
      </div>
    </div>
  `;
  document.getElementById('loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      const result = await Api.post('/api/auth/login', Object.fromEntries(fd));
      if (result.mfaRequired) {
        sessionStorage.setItem('preToken', result.preToken);
        Router.go('#/mfa');
        return;
      }
      Api.setToken(result.token);
      await refreshMe();
      toast('Signed in securely', 'ok');
      Router.go('#/dashboard');
    } catch (err) { toast(err.message, 'error'); }
  };
});

// ---------------------------------------------------------------------------
// VIEW: MFA
// ---------------------------------------------------------------------------
Router.register('#/mfa', async () => {
  const preToken = sessionStorage.getItem('preToken');
  if (!preToken) { Router.go('#/login'); return; }
  setPageMode('public');
  document.getElementById('app').innerHTML = `
    <div class="auth-cinematic">
      <div class="auth-visual">
        <div class="auth-visual-inner">
          <div class="auth-visual-logo">
            <div class="avc-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.5" width="22" height="22"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            </div>
            <span class="avc-brand">Deciva</span>
          </div>
          <div class="auth-visual-quote">
            <div class="auth-visual-mark">"</div>
            <p>Two-factor verification active for zero-trust enterprise security.</p>
            <div class="auth-visual-rule"></div>
            <div class="auth-trust-pills">
              <span class="auth-pill">TOTP MFA</span>
              <span class="auth-pill">AES-256-GCM</span>
              <span class="auth-pill">Zero-Trust</span>
            </div>
          </div>
        </div>
      </div>
      <div class="auth-panel">
        <div class="auth-form-card fade-up">
          <p class="auth-step-label">Verification</p>
          <h2 class="auth-form-title">Two-Factor Authentication</h2>
          <p class="auth-form-sub">Enter the 6-digit code from your authenticator app.</p>
          <form id="totpForm" class="auth-form">
            <div class="input-group">
              <label for="mfa-code">Authenticator Code</label>
              <input id="mfa-code" name="code" maxlength="6" inputmode="numeric" required autofocus placeholder="000000" class="mfa-code-input" />
            </div>
            <button class="btn-auth-submit" type="submit">Verify &amp; Sign In</button>
          </form>
          <button class="btn btn-outline btn-block mt-12" id="reqOtpBtn" style="border-radius:var(--radius);padding:12px">${Icon.chat} Send Email OTP instead</button>
          <div id="otpArea"></div>
        </div>
      </div>
    </div>
  `;
  document.getElementById('totpForm').onsubmit = async (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get('code');
    try {
      const result = await Api.post('/api/auth/mfa/totp/verify', { preToken, code });
      Api.setToken(result.token);
      sessionStorage.removeItem('preToken');
      await refreshMe();
      toast('MFA verified — signed in', 'ok');
      Router.go('#/dashboard');
    } catch (err) { toast(err.message, 'error'); }
  };
  document.getElementById('reqOtpBtn').onclick = async () => {
    try {
      const r = await Api.post('/api/auth/mfa/otp/request', { preToken });
      document.getElementById('otpArea').innerHTML = `
        <form id="otpForm" class="mt-16 auth-form">
          <div class="input-group">
            <label>Email OTP ${r.devMode ? `<span class="badge badge-warn">DEV: ${r.devCode}</span>` : ''}</label>
            <input name="code" maxlength="6" inputmode="numeric" required placeholder="000000" class="mfa-code-input"/>
          </div>
          <button class="btn-auth-submit" type="submit">Verify OTP</button>
        </form>`;
      document.getElementById('otpForm').onsubmit = async (e) => {
        e.preventDefault();
        const code = new FormData(e.target).get('code');
        try {
          const result = await Api.post('/api/auth/mfa/otp/verify', { preToken, code });
          Api.setToken(result.token);
          sessionStorage.removeItem('preToken');
          await refreshMe();
          toast('MFA verified — signed in', 'ok');
          Router.go('#/dashboard');
        } catch (err) { toast(err.message, 'error'); }
      };
      toast(r.devMode ? 'Dev mode: OTP shown on screen' : 'OTP sent to your email', 'info');
    } catch (err) { toast(err.message, 'error'); }
  };
});

// ---------------------------------------------------------------------------
// VIEW: Dashboard
// ---------------------------------------------------------------------------
Router.register('#/dashboard', async () => {
  const d = await Api.get('/api/security/dashboard');
  const audit = await Api.get('/api/security/audit?limit=5');

  document.getElementById('app').innerHTML = wrapAuth('#/dashboard', `
    <div class="flex-between mb-24">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-sub">Welcome back, ${esc(State.user?.name?.split(' ')[0] || 'Counsellor')}. Here's your security & activity overview.</p>
      </div>
      <button class="btn btn-primary" onclick="Router.go('#/upload')">${Icon.upload} Upload Document</button>
    </div>

    <!-- Row 1: 4 metric cards -->
    <div class="grid grid-4">
      ${metricCard(Icon.document, 'metric-icon-blue',  d.documentsUploaded, 'Documents Uploaded', null)}
      ${metricCard(Icon.alert,    d.avgRiskScore > 50 ? 'metric-icon-red' : d.avgRiskScore > 25 ? 'metric-icon-amber' : 'metric-icon-green',
                   d.avgRiskScore + '%', 'Avg. Risk Score',
                   d.avgRiskScore > 50 ? 'badge-danger' : d.avgRiskScore > 25 ? 'badge-warn' : 'badge-ok')}
      ${metricCard(Icon.shield,   d.trustScore >= 70 ? 'metric-icon-green' : d.trustScore >= 40 ? 'metric-icon-amber' : 'metric-icon-red',
                   d.trustScore, 'Zero-Trust Score',
                   d.trustScore >= 70 ? 'badge-ok' : d.trustScore >= 40 ? 'badge-warn' : 'badge-danger')}
      ${metricCard(Icon.alert,    d.threatAlerts > 0 ? 'metric-icon-amber' : 'metric-icon-green',
                   d.threatAlerts, 'Threat Alerts',
                   d.threatAlerts > 0 ? 'badge-warn' : 'badge-ok')}
    </div>

    <!-- Row 2: 4 more metrics -->
    <div class="grid grid-4 mt-16">
      ${metricCard(Icon.chat,     'metric-icon-blue',  d.chatInteractions,  'AI Chat Sessions', null)}
      ${metricCard(Icon.pen,      'metric-icon-gold',  d.contractsGenerated,'Contracts Generated', null)}
      ${metricCard(Icon.lock,     'metric-icon-navy',  d.activeSessions,    'Active Sessions', null)}
      ${metricCard(Icon.check,    'metric-icon-green', (d.complianceGauge !== null && d.complianceGauge !== undefined) ? d.complianceGauge + '%' : 'N/A', 'Compliance Score', d.complianceGauge !== null ? 'badge-ok' : 'badge-warn')}
    </div>

    <!-- Row 3: Audit Ledger + Quick Actions -->
    <div class="grid grid-2 mt-24">
      <div class="card">
        <div class="card-title"><span class="dot dot-emerald"></span>Immutable Audit Ledger</div>
        <div class="flex-between mb-16">
          <span class="text-lo small">${d.auditLedger.totalBlocks} blocks</span>
          <span class="badge ${d.auditLedger.valid ? 'badge-ok' : 'badge-danger'}">
            ${d.auditLedger.valid ? `${Icon.check} Chain Verified` : `${Icon.alert} Tampered`}
          </span>
        </div>
        ${audit.blocks.slice(0, 4).map(auditBlockHtml).join('')}
        <button class="btn btn-ghost btn-sm mt-16" onclick="Router.go('#/security')">
          ${Icon.shield} View Full Ledger
        </button>
      </div>

      <div class="card">
        <div class="card-title"><span class="dot dot-gold"></span>Quick Actions</div>
        <div class="grid" style="gap:10px">
          <button class="btn btn-primary" onclick="Router.go('#/upload')">${Icon.upload} Upload &amp; Analyze Document</button>
          <button class="btn btn-outline" onclick="Router.go('#/contracts')">${Icon.pen} Generate a Contract</button>
          <button class="btn btn-outline" onclick="Router.go('#/deadlines')">${Icon.calendar} View Deadlines</button>
          <button class="btn btn-outline" onclick="Router.go('#/security')">${Icon.shield} Security Center</button>
        </div>
      </div>
    </div>
  `);
});

function metricCard(icon, iconCls, value, label, badgeCls) {
  return `<div class="card">
    <div class="metric-row">
      <div class="metric-icon-wrap ${iconCls}">${icon}</div>
      <div>
        <div class="metric-value">${value}</div>
        <div class="metric-label">${label}</div>
        ${badgeCls ? `<div class="mt-8"><span class="badge ${badgeCls}" style="font-size:10.5px">${label}</span></div>` : ''}
      </div>
    </div>
  </div>`;
}

function auditBlockHtml(b) {
  return `<div class="audit-block">
    <span class="action">#${b.block_index} ${b.action}</span><br/>
    <span class="text-lo">${fmtDate(b.created_at)}</span><br/>
    <span style="font-size:11px">hash: ${b.hash.slice(0, 28)}…</span>
  </div>`;
}

// ---------------------------------------------------------------------------
// VIEW: Upload
// ---------------------------------------------------------------------------
Router.register('#/upload', async () => {
  document.getElementById('app').innerHTML = wrapAuth('#/upload', `
    <h1 class="page-title">Upload Document</h1>
    <p class="page-sub">Files are hashed (SHA-256), encrypted at rest (AES-256-GCM), and text-extracted for AI analysis. Supported: .txt, .pdf, .docx</p>

    <div class="card" style="max-width:680px">
      <div class="dropzone" id="dropzone">
        <div class="dropzone-icon">${Icon.upload}</div>
        <h3>Drag &amp; drop a file here</h3>
        <p>or click to browse — max 25 MB</p>
        <input type="file" id="fileInput" style="display:none" accept=".txt,.pdf,.docx,.doc,image/*" />
      </div>

      <div id="uploadProgress" class="hidden mt-16">
        <div class="progress-bar"><div id="progressFill" style="width:0%"></div></div>
        <p id="progressLabel" class="text-mid small mt-8">Scanning…</p>
      </div>
      <div id="uploadResult" class="mt-16"></div>
    </div>
  `);

  const dz = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  dz.onclick = () => fileInput.click();
  dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('drag'); };
  dz.ondragleave = () => dz.classList.remove('drag');
  dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('drag'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); };
  fileInput.onchange = () => { if (fileInput.files[0]) handleFile(fileInput.files[0]); };

  async function handleFile(file) {
    const progress = document.getElementById('uploadProgress');
    const fill = document.getElementById('progressFill');
    const label = document.getElementById('progressLabel');
    progress.classList.remove('hidden');
    document.getElementById('uploadResult').innerHTML = '';

    const steps = [
      [20, 'Computing SHA-256 hash…'],
      [45, 'Encrypting with AES-256-GCM…'],
      [70, 'Extracting text (OCR / parse)…'],
      [90, 'Running AI risk scan…'],
    ];
    for (const [pct, msg] of steps) {
      fill.style.width = pct + '%'; label.textContent = msg;
      await new Promise(r => setTimeout(r, 280));
    }

    try {
      const fd = new FormData();
      fd.append('file', file);
      const result = await Api.upload('/api/documents/upload', fd);
      fill.style.width = '100%'; label.textContent = 'Complete.';
      document.getElementById('uploadResult').innerHTML = `
        <div class="card" style="border-color:var(--emerald)">
          <div class="card-title"><span class="dot dot-emerald"></span>Upload Secured</div>
          <p class="bold">${esc(result.name)}</p>
          <p class="text-lo small">${fmtBytes(result.size)} · SHA-256: ${result.sha256.slice(0, 24)}…</p>
          <div class="flex gap-8 mt-12">
            <span class="badge badge-ok">${Icon.check} AES-256 Encrypted</span>
            <span class="badge badge-info">OCR ${Math.round(result.ocrConfidence * 100)}%</span>
            <span class="badge ${result.riskScore > 50 ? 'badge-danger' : result.riskScore > 25 ? 'badge-warn' : 'badge-ok'}">
              Risk ${result.riskScore ?? '—'}/100
            </span>
          </div>
          <button class="btn btn-primary mt-16" onclick="Router.go('#/document/${result.id}')">
            ${Icon.eye} Open AI Analysis
          </button>
        </div>
      `;
      toast('Document uploaded and secured', 'ok');
    } catch (err) {
      progress.classList.add('hidden');
      toast(err.message, 'error');
    }
  }
});

// ---------------------------------------------------------------------------
// VIEW: Documents list
// ---------------------------------------------------------------------------
Router.register('#/documents', async () => {
  const { documents } = await Api.get('/api/documents');
  State.documents = documents;

  document.getElementById('app').innerHTML = wrapAuth('#/documents', `
    <div class="flex-between mb-24">
      <div>
        <h1 class="page-title">Documents</h1>
        <p class="page-sub">All files are encrypted at rest with AES-256-GCM.</p>
      </div>
      <button class="btn btn-primary" onclick="Router.go('#/upload')">${Icon.upload} Upload</button>
    </div>

    <div class="card" style="padding:8px">
      ${documents.length === 0 ? emptyState(Icon.document, 'No documents yet', 'Upload your first contract to begin AI analysis.') :
        documents.map(docRowHtml).join('')}
    </div>

    ${documents.length >= 2 ? `
    <div class="card mt-24">
      <div class="card-title"><span class="dot"></span>Compare Document Versions</div>
      <div class="grid grid-2">
        <div>
          <label>Document A</label>
          <select id="cmpA">${documents.map(d => `<option value="${d.id}">${esc(d.original_name)}</option>`).join('')}</select>
        </div>
        <div>
          <label>Document B</label>
          <select id="cmpB">${documents.map((d, i) => `<option value="${d.id}" ${i === 1 ? 'selected' : ''}>${esc(d.original_name)}</option>`).join('')}</select>
        </div>
      </div>
      <button class="btn btn-royal mt-16" onclick="runCompare()">${Icon.compare} Compare Documents</button>
      <div id="compareResult" class="mt-16"></div>
    </div>` : ''}
  `);
});

function docRowHtml(d) {
  const tone = d.risk_score > 50 ? 'badge-danger' : d.risk_score > 25 ? 'badge-warn' : 'badge-ok';
  return `<div class="doc-row" onclick="Router.go('#/document/${d.id}')">
    <div class="doc-row-inner">
      <div class="doc-row-icon">${Icon.document}</div>
      <div class="truncate">
        <div class="doc-name truncate">${esc(d.original_name)}</div>
        <div class="doc-meta">${fmtBytes(d.size)} · ${fmtDate(d.created_at)} · SHA-256 ${d.sha256.slice(0, 12)}…</div>
      </div>
    </div>
    <div class="flex gap-8" style="flex-shrink:0;margin-left:12px">
      ${d.risk_score != null ? `<span class="badge ${tone}">Risk ${d.risk_score}</span>` : ''}
      <button class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); deleteDoc('${d.id}')" title="Delete">${Icon.trash}</button>
    </div>
  </div>`;
}

async function deleteDoc(id) {
  if (!confirm('Permanently delete this document?')) return;
  try {
    await Api.del(`/api/documents/${id}`);
    toast('Document deleted', 'ok');
    Router.resolve();
  } catch (e) { toast(e.message, 'error'); }
}

async function runCompare() {
  const a = document.getElementById('cmpA').value;
  const b = document.getElementById('cmpB').value;
  if (a === b) { toast('Choose two different documents', 'error'); return; }
  const btn = document.querySelector('#compareResult');
  btn.innerHTML = `<div class="spinner-center"><div class="spinner"></div></div>`;
  try {
    const result = await Api.post('/api/ai/compare', { documentIdA: a, documentIdB: b });
    document.getElementById('compareResult').innerHTML = `
      <p class="text-mid small mb-16">
        Comparing <strong>${esc(result.docA)}</strong> → <strong>${esc(result.docB)}</strong>
        · ${result.totalChanges} changes detected
      </p>
      ${result.changes.length === 0 ? '<p class="text-lo">No differences detected.</p>' :
        result.changes.map(c => `
          <div class="diff-item ${c.type}">
            <span class="badge ${c.type === 'added' ? 'badge-ok' : 'badge-danger'}">${c.type.toUpperCase()}</span>
            <span class="badge badge-neutral" style="margin-left:4px">${esc(c.section)}</span>
            <p style="margin:8px 0 0">${esc(c.text)}</p>
            <span class="diff-impact">${esc(c.impact)}</span>
          </div>`).join('')}
    `;
  } catch (e) { toast(e.message, 'error'); }
}

function emptyState(icon, title, sub) {
  return `<div class="empty-state">
    <div class="empty-icon">${icon}</div>
    <h3>${title}</h3>
    <p>${sub}</p>
  </div>`;
}

// ---------------------------------------------------------------------------
// VIEW: Document detail (split-screen + AI tabs)
// ---------------------------------------------------------------------------
const DOC_TABS = ['overview', 'chat', 'negotiation', 'risk', 'compliance', 'deadlines', 'pii'];

Router.register('#/document', async (parts) => {
  const id = parts[0];
  const tab = parts[1] || 'overview';
  const { document: doc } = await Api.get(`/api/documents/${id}`);
  State.currentDoc = doc;

  document.getElementById('app').innerHTML = wrapAuth('#/documents', `
    <div class="flex-between mb-16">
      <div class="truncate" style="max-width:60%">
        <h1 class="page-title truncate">${esc(doc.original_name)}</h1>
        <p class="page-sub" style="margin-bottom:0">
          ${fmtBytes(doc.size)} · SHA-256 ${doc.sha256.slice(0, 16)}… · OCR ${Math.round((doc.ocr_confidence || 0) * 100)}%
        </p>
      </div>
      <button class="btn btn-outline btn-sm" onclick="verifyIntegrity('${doc.id}')">${Icon.eye} Verify Integrity</button>
    </div>

    <div class="tab-bar">
      ${DOC_TABS.map(t => `<button class="tab-btn ${t === tab ? 'active' : ''}" onclick="Router.go('#/document/${id}/${t}')">${t[0].toUpperCase() + t.slice(1)}</button>`).join('')}
    </div>

    <div id="docTabContent"><div class="spinner-center"><div class="spinner"></div></div></div>
  `);

  const content = document.getElementById('docTabContent');
  switch (tab) {
    case 'overview':    await renderOverviewTab(doc, content); break;
    case 'chat':        await renderChatTab(doc, content); break;
    case 'negotiation': await renderNegotiationTab(doc, content); break;
    case 'risk':        await renderRiskTab(doc, content); break;
    case 'compliance':  await renderComplianceTab(doc, content); break;
    case 'deadlines':   await renderDeadlinesTab(doc, content); break;
    case 'pii':         await renderPiiTab(doc, content); break;
  }
});

async function verifyIntegrity(id) {
  try {
    const r = await Api.get(`/api/documents/${id}/verify`);
    toast(r.valid ? '✓ File integrity verified — SHA-256 match' : '✗ Integrity check failed!', r.valid ? 'ok' : 'error');
  } catch (e) { toast(e.message, 'error'); }
}

function highlightText(text, excerpts) {
  let html = esc(text);
  for (const ex of excerpts) {
    const escaped = esc(ex.text);
    html = html.split(escaped).join(`<mark>${escaped}</mark>`);
  }
  return html;
}

async function renderOverviewTab(doc, content) {
  const { clauses } = await Api.get(`/api/ai/documents/${doc.id}/clauses`);
  const allExcerpts = Object.values(clauses).flatMap(c => c.excerpts);

  content.innerHTML = `
    <div class="split">
      <div class="card">
        <div class="card-title"><span class="dot"></span>Document Text</div>
        <div class="doc-text">${highlightText(doc.extracted_text || '(no extractable text)', allExcerpts)}</div>
        <button class="btn btn-outline btn-sm mt-16" onclick="showSimplified('${doc.id}')">${Icon.chat} Plain-Language Translation</button>
        <div id="simplifiedArea" class="mt-16"></div>
      </div>
      <div class="card">
        <div class="card-title"><span class="dot dot-gold"></span>Extracted Clauses</div>
        ${Object.entries(clauses).map(([key, c]) => `
          <div class="clause-item ${c.found ? '' : 'not-found'}">
            <h4>${c.label}${c.found ? '' : ' — not found'}</h4>
            ${c.excerpts.map(e => `<p>${esc(e.text)}</p>`).join('') || '<p class="text-lo">No matching clause detected.</p>'}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function showSimplified(id) {
  const area = document.getElementById('simplifiedArea');
  area.innerHTML = '<div class="spinner-center"><div class="spinner"></div></div>';
  const { simplified } = await Api.get(`/api/ai/documents/${id}/simplify`);
  area.innerHTML = `<div class="card" style="background:var(--emerald-bg);border-color:rgba(5,150,105,0.2)">
    <div class="card-title"><span class="dot dot-emerald"></span>Plain English Summary</div>
    <div class="doc-text">${esc(simplified)}</div>
  </div>`;
}

async function renderChatTab(doc, content) {
  const { messages } = await Api.get(`/api/ai/documents/${doc.id}/chat`);
  const suggestions = ['Who are the parties to this contract?', 'When does this contract terminate?', 'What are the payment terms?', 'Are there any high-risk clauses?'];

  content.innerHTML = `
    <div class="card">
      <div class="card-title"><span class="dot"></span>AI Document Chatbot</div>
      <div class="chat-suggestions">
        ${suggestions.map(s => `<button class="chat-suggestion-btn" onclick="document.getElementById('chatInput').value='${s}'">${s}</button>`).join('')}
      </div>
      <div class="divider"></div>
      <div class="chat-window" id="chatWindow">
        ${messages.length === 0
          ? `<p class="text-lo" style="text-align:center;padding:24px 0">Ask a question about this document — try the suggestions above.</p>`
          : messages.map(chatMsgHtml).join('')}
      </div>
      <div class="chat-input-row">
        <input id="chatInput" placeholder="Ask about parties, payment, termination, jurisdiction…" />
        <button class="btn btn-primary" id="chatSendBtn">${Icon.chat} Send</button>
      </div>
    </div>
  `;
  const send = async () => {
    const input = document.getElementById('chatInput');
    const q = input.value.trim();
    if (!q) return;
    input.value = '';
    const win = document.getElementById('chatWindow');
    win.innerHTML += `<div class="chat-msg user">${esc(q)}</div>`;
    win.scrollTop = win.scrollHeight;
    const typingId = Date.now();
    win.innerHTML += `<div class="chat-msg assistant" id="typing-${typingId}" style="color:var(--text-lo);font-style:italic">Thinking…</div>`;
    win.scrollTop = win.scrollHeight;
    try {
      const r = await Api.post(`/api/ai/documents/${doc.id}/chat`, { question: q });
      const typing = document.getElementById(`typing-${typingId}`);
      if (typing) typing.remove();
      win.innerHTML += `<div class="chat-msg assistant">${esc(r.answer)}
        <div class="mt-8">
          <span class="badge badge-ok">${r.provider === 'gemini' ? '✨ Gemini AI' : 'AI Engine'} · Confidence ${Math.round(r.confidence * 100)}%</span>
          ${(r.sources || []).map(s => `<span class="source-tag">${s.text || ('pg. ' + s.pageRef)}</span>`).join('')}
        </div>
      </div>`;
      win.scrollTop = win.scrollHeight;
    } catch (e) { toast(e.message, 'error'); }
  };
  document.getElementById('chatSendBtn').onclick = send;
  document.getElementById('chatInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') send(); });
}

function chatMsgHtml(m) {
  if (m.role === 'user') return `<div class="chat-msg user">${esc(m.content)}</div>`;
  let sources = [];
  try { sources = JSON.parse(m.source_ref || '[]'); } catch (e) {}
  return `<div class="chat-msg assistant">${esc(m.content)}
    <div class="mt-8">
      ${m.confidence != null ? `<span class="badge badge-ok">AI Response · Confidence ${Math.round(m.confidence * 100)}%</span>` : ''}
      ${sources.map(s => `<span class="source-tag">${s.text || ('pg. ' + s.pageRef)}</span>`).join('')}
    </div>
  </div>`;
}

async function renderNegotiationTab(doc, content) {
  const { suggestions } = await Api.get(`/api/ai/documents/${doc.id}/negotiation`);
  content.innerHTML = `
    <div class="card">
      <div class="card-title"><span class="dot dot-gold"></span>Negotiation Assistant</div>
      ${suggestions.length === 0 ? emptyState(Icon.check, 'No high-risk clauses flagged', 'This document looks balanced based on our heuristic scan.') :
        suggestions.map(s => `
          <div class="neg-card risk-${s.risk}">
            <div class="flex-between mb-8">
              <strong>${esc(s.issue)}</strong>
              <span class="badge ${s.risk === 'high' ? 'badge-danger' : 'badge-warn'}">${s.risk.toUpperCase()} RISK</span>
            </div>
            <blockquote>"${esc(s.clause)}"</blockquote>
            <p class="text-mid small">${esc(s.recommendation)}</p>
            <div class="neg-suggested">${Icon.check} Suggested: ${esc(s.suggestedText)}</div>
          </div>
        `).join('')}
    </div>
  `;
}

async function renderRiskTab(doc, content) {
  const r = await Api.get(`/api/ai/documents/${doc.id}/risk`);
  const labels = { termination: 'Termination', liability: 'Liability', confidentiality: 'Confidentiality', payment: 'Payment', compliance: 'Compliance' };
  const riskColor = r.overall > 50 ? 'var(--red)' : r.overall > 25 ? 'var(--amber)' : 'var(--emerald)';
  const riskBadge = r.overall > 50 ? 'badge-danger' : r.overall > 25 ? 'badge-warn' : 'badge-ok';

  content.innerHTML = `
    <div class="grid grid-2">
      <div class="card" style="text-align:center">
        <div class="card-title" style="justify-content:center"><span class="dot"></span>Overall Risk Score</div>
        <div style="font-family:var(--font-head);font-size:72px;font-weight:700;color:${riskColor};line-height:1">${r.overall}</div>
        <p class="text-lo" style="margin:4px 0 16px">out of 100</p>
        <span class="badge ${riskBadge}" style="font-size:13px">${r.overall > 50 ? 'High Risk' : r.overall > 25 ? 'Medium Risk' : 'Low Risk'}</span>
      </div>
      <div class="card">
        <div class="card-title"><span class="dot"></span>Risk Breakdown</div>
        ${Object.entries(r.breakdown).map(([k, v]) => {
          const c = v > 50 ? 'var(--red)' : v > 25 ? 'var(--amber)' : 'var(--emerald)';
          return `<div class="risk-bar-row">
            <div class="label">${labels[k] || k}</div>
            <div class="risk-bar-track"><div class="risk-bar-fill" style="width:${v}%;background:${c}"></div></div>
            <div class="val" style="color:${c}">${v}</div>
          </div>`;
        }).join('')}
      </div>
    </div>
  `;
}

async function renderComplianceTab(doc, content) {
  const { frameworks } = await Api.get(`/api/ai/documents/${doc.id}/compliance`);
  content.innerHTML = `
    <div class="card">
      <div class="card-title"><span class="dot dot-emerald"></span>Compliance Checker</div>
      ${Object.values(frameworks).map(fw => `
        <div class="compliance-row">
          <div class="flex-between mb-8">
            <strong>${esc(fw.label)}</strong>
            <span class="badge ${fw.score >= 70 ? 'badge-ok' : fw.score >= 40 ? 'badge-warn' : 'badge-danger'}">${fw.score}%</span>
          </div>
          ${fw.checks.map(c => `
            <div class="compliance-check">
              <span class="${c.pass ? 'icon-pass' : 'icon-fail'}" style="width:16px;flex-shrink:0">
                ${c.pass ? Icon.check : '✗'}
              </span>
              ${esc(c.name)}
            </div>`).join('')}
        </div>
      `).join('')}
    </div>
  `;
}

async function renderDeadlinesTab(doc, content) {
  const { deadlines } = await Api.get(`/api/ai/documents/${doc.id}/deadlines`);
  content.innerHTML = `
    <div class="card">
      <div class="card-title"><span class="dot dot-gold"></span>Deadlines in This Document</div>
      ${deadlines.length === 0 ? emptyState(Icon.calendar, 'No dates detected', 'No renewal, expiry, or payment dates found in this document.') :
        deadlines.map(d => `
          <div class="deadline-item">
            <div class="deadline-date">${esc(d.date)}</div>
            <div>
              <span class="badge badge-info">${d.category.replace('_', ' ')}</span>
              <p class="text-mid small mt-8">${esc(d.context)}</p>
            </div>
          </div>
        `).join('')}
    </div>
  `;
}

async function renderPiiTab(doc, content) {
  const { items } = await Api.get(`/api/ai/documents/${doc.id}/pii`);
  content.innerHTML = `
    <div class="card">
      <div class="card-title"><span class="dot"></span>AI Privacy Mode — PII Detection</div>
      ${items.length === 0 ? emptyState(Icon.shield, 'No PII detected', 'No Aadhaar, PAN, passport, phone, email or card numbers found.') : `
        ${items.map(i => `<div class="pii-item"><span>${esc(i.label)}</span><span class="mono">${esc(i.value)}</span></div>`).join('')}
        <button class="btn btn-danger mt-16" onclick="doRedact('${doc.id}')">${Icon.lock} Redact All PII</button>
      `}
      <div id="redactResult" class="mt-16"></div>
    </div>
  `;
}

async function doRedact(id) {
  try {
    const r = await Api.post(`/api/ai/documents/${id}/redact`, {});
    document.getElementById('redactResult').innerHTML = `
      <div class="card" style="background:var(--emerald-bg);border-color:rgba(5,150,105,0.2)">
        <div class="card-title"><span class="dot dot-emerald"></span>Redacted Output (${r.itemsFound} items masked)</div>
        <div class="doc-text">${esc(r.redacted)}</div>
      </div>`;
    toast(`${r.itemsFound} PII items redacted`, 'ok');
  } catch (e) { toast(e.message, 'error'); }
}

async function renderShareTab(doc, content) {
  content.innerHTML = `
    <div class="card">
      <div class="card-title"><span class="dot dot-gold"></span>Secure Link Sharing</div>
      <form id="shareForm">
        <div class="grid grid-3">
          <div><label>Password (optional)</label><input name="password" placeholder="Leave blank for none" /></div>
          <div><label>Expires in (hours)</label><input name="expiresInHours" type="number" placeholder="e.g. 48" /></div>
          <div><label>Max downloads</label><input name="maxDownloads" type="number" placeholder="e.g. 3" /></div>
        </div>
        <button class="btn btn-royal mt-16" type="submit">${Icon.link} Generate Secure Link</button>
      </form>
      <div id="shareResult" class="mt-16"></div>
    </div>
  `;
  document.getElementById('shareForm').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try {
      const r = await Api.post('/api/share', { documentId: doc.id, ...fd });
      const fullUrl = `${window.location.origin}${r.url}`;
      document.getElementById('shareResult').innerHTML = `
        <div class="card" style="background:var(--emerald-bg);border-color:rgba(5,150,105,0.2)">
          <p class="mono small" style="word-break:break-all">${fullUrl}</p>
          <p class="text-mid small mt-8">
            ${r.passwordProtected ? `${Icon.lock} Password protected · ` : ''}
            ${r.expiresAt ? 'Expires ' + fmtDate(r.expiresAt) : 'No expiry'} ·
            ${r.maxDownloads ? r.maxDownloads + ' downloads max' : 'Unlimited downloads'}
          </p>
        </div>`;
      toast('Secure share link created', 'ok');
    } catch (err) { toast(err.message, 'error'); }
  };
}

// ---------------------------------------------------------------------------
// VIEW: Contract Generator
// ---------------------------------------------------------------------------
Router.register('#/contracts', async () => {
  const { types } = await Api.get('/api/contracts/types');
  document.getElementById('app').innerHTML = wrapAuth('#/contracts', `
    <h1 class="page-title">Contract Generator</h1>
    <p class="page-sub">Choose a contract type, fill in the details, and generate a digitally signed document.</p>

    <div class="card" style="max-width:720px">
      <div class="card-title"><span class="dot dot-gold"></span>Contract Configuration</div>
      <div class="input-group">
        <label for="ctypeSelect">Contract type</label>
        <select id="ctypeSelect">
          ${types.map(t => `<option value="${t.id}">${t.label}</option>`).join('')}
        </select>
      </div>
      <div id="ctypeFields"></div>
      <button class="btn btn-primary mt-16" id="genBtn">${Icon.pen} Generate Contract</button>
    </div>

    <div id="contractPreviewWrap" class="mt-24"></div>
  `);

  function renderFields() {
    const type = types.find(t => t.id === document.getElementById('ctypeSelect').value);
    document.getElementById('ctypeFields').innerHTML = `<div class="grid grid-2">${type.fields.map(f => `
      <div class="input-group">
        <label>${f.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase())}</label>
        <input name="${f}" />
      </div>
    `).join('')}</div>`;
  }
  document.getElementById('ctypeSelect').onchange = renderFields;
  renderFields();

  document.getElementById('genBtn').onclick = async () => {
    const type = document.getElementById('ctypeSelect').value;
    const inputs = document.querySelectorAll('#ctypeFields input');
    const params = {};
    inputs.forEach(i => { if (i.value) params[i.name] = i.value; });
    const btn = document.getElementById('genBtn');
    btn.disabled = true; btn.textContent = 'Generating…';
    try {
      const r = await Api.post('/api/contracts/generate', { type, params });
      document.getElementById('contractPreviewWrap').innerHTML = `
        <div class="card">
          <div class="flex-between mb-16">
            <div class="card-title"><span class="dot dot-emerald"></span>Generated Contract — Digitally Signed</div>
            <button class="btn btn-outline btn-sm" onclick="downloadContract('${r.id}')">${Icon.download} Download .txt</button>
          </div>
          <div class="contract-preview">${esc(r.content)}</div>
          <p class="text-lo small mt-16 mono">RSA-SHA256 signature: ${r.signature.slice(0, 52)}…</p>
        </div>`;
      toast('Contract generated and signed', 'ok');
    } catch (err) { toast(err.message, 'error'); }
    finally { btn.disabled = false; btn.innerHTML = `${Icon.pen} Generate Contract`; }
  };
});

async function downloadContract(id) {
  const { contract } = await Api.get(`/api/contracts/${id}`);
  const blob = new Blob([contract.content], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${contract.contract_type}_${id.slice(0, 8)}.txt`;
  a.click();
}

// ---------------------------------------------------------------------------
// VIEW: Deadlines (global)
// ---------------------------------------------------------------------------
Router.register('#/deadlines', async () => {
  const { deadlines } = await Api.get('/api/ai/deadlines');
  const grouped = { renewal: [], expiry: [], payment_due: [], notice_period: [], general: [] };
  deadlines.forEach(d => (grouped[d.category] || grouped.general).push(d));

  document.getElementById('app').innerHTML = wrapAuth('#/deadlines', `
    <h1 class="page-title">Deadline Calendar</h1>
    <p class="page-sub">Automatically extracted renewal, expiry, payment, and notice dates across all your documents.</p>

    ${deadlines.length === 0 ? `<div class="card">${emptyState(Icon.calendar, 'No deadlines found', 'Upload documents with dates to populate this calendar.')}</div>` : `
    <div class="grid grid-2">
      ${Object.entries(grouped).filter(([, v]) => v.length).map(([cat, items]) => `
        <div class="card">
          <div class="card-title"><span class="dot"></span>${cat.replace('_', ' ').toUpperCase()}</div>
          ${items.map(d => `
            <div class="deadline-item">
              <div class="deadline-date">${esc(d.date)}</div>
              <div>
                <a href="#/document/${d.documentId}/deadlines" class="small bold text-royal">${esc(d.documentName)}</a>
                <p class="text-mid small mt-8">${esc(d.context)}</p>
              </div>
            </div>
          `).join('')}
        </div>
      `).join('')}
    </div>`}
  `);
});

// ---------------------------------------------------------------------------
// VIEW: Security Center
// ---------------------------------------------------------------------------
Router.register('#/security', async () => {
  const [dash, sessions, audit, threats, zt] = await Promise.all([
    Api.get('/api/security/dashboard'),
    Api.get('/api/security/sessions'),
    Api.get('/api/security/audit?limit=40'),
    Api.get('/api/security/threats'),
    Api.get('/api/security/zero-trust')
  ]);

  document.getElementById('app').innerHTML = wrapAuth('#/security', `
    <div class="flex-between mb-24">
      <div>
        <h1 class="page-title">Security Center</h1>
        <p class="page-sub">Encryption monitor, zero-trust status, sessions, MFA, and the immutable audit ledger.</p>
      </div>
      <span class="badge ${dash.auditLedger.valid ? 'badge-ok' : 'badge-danger'}" style="font-size:13px">
        ${dash.auditLedger.valid ? `${Icon.check} Chain Verified` : `${Icon.alert} Chain Broken`}
      </span>
    </div>

    <!-- Status Row -->
    <div class="grid grid-3">
      <div class="card">
        <div class="card-title"><span class="dot"></span>Zero-Trust Score</div>
        <div class="metric-row">
          <div class="metric-icon-wrap ${zt.score >= 70 ? 'metric-icon-green' : zt.score >= 40 ? 'metric-icon-amber' : 'metric-icon-red'}">${Icon.shield}</div>
          <div>
            <div class="metric-value">${zt.score}</div>
            <div class="metric-label">out of 100</div>
          </div>
        </div>
        <p class="text-lo small mt-12">${zt.reasons.length ? zt.reasons.join(' · ') : 'All security checks passed'}</p>
      </div>

      <div class="card">
        <div class="card-title"><span class="dot dot-gold"></span>MFA Status</div>
        <div class="metric-row">
          <div class="metric-icon-wrap ${zt.mfaEnabled ? 'metric-icon-green' : 'metric-icon-amber'}">${Icon.lock}</div>
          <div>
            <span class="badge ${zt.mfaEnabled ? 'badge-ok' : 'badge-warn'}">
              ${zt.mfaEnabled ? `${Icon.check} TOTP Enabled` : 'Not Enabled'}
            </span>
            ${!zt.mfaEnabled ? `<div class="mt-8"><button class="btn btn-royal btn-sm" onclick="Router.go('#/security/mfa-setup')">Enable MFA</button></div>` : ''}
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-title"><span class="dot dot-emerald"></span>Encryption Monitor</div>
        <div class="metric-row">
          <div class="metric-icon-wrap metric-icon-green">${Icon.lock}</div>
          <div>
            <span class="badge badge-ok">${Icon.check} AES-256-GCM Active</span>
            <p class="text-lo small mt-8">All documents encrypted at rest. Integrity via SHA-256.</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Sessions -->
    <div class="card mt-24">
      <div class="card-title"><span class="dot"></span>Active Sessions Manager</div>
      ${sessions.sessions.map(s => `
        <div class="session-row">
          <div>
            <strong>${s.id === sessions.currentSessionId ? '📍 This device' : 'Remote session'}</strong>
            ${s.mfa_verified ? '<span class="badge badge-ok" style="margin-left:8px">MFA</span>' : ''}
            <p class="text-lo small">IP hash ${s.ip} · Trust ${s.trust_score} · Last seen ${fmtDate(s.last_seen)}</p>
          </div>
          ${s.revoked
            ? '<span class="badge badge-danger">Revoked</span>'
            : s.id === sessions.currentSessionId
              ? '<span class="badge badge-ok">Current</span>'
              : `<button class="btn btn-sm btn-danger" onclick="revokeSession('${s.id}')">Revoke</button>`}
        </div>
      `).join('')}
    </div>

    <!-- Threats + Sig -->
    <div class="grid grid-2 mt-24">
      <div class="card">
        <div class="card-title"><span class="dot"></span>Threat Alerts</div>
        ${threats.threats.length === 0 ? emptyState(Icon.shield, 'No threats detected', 'Your account has no active security alerts.') :
          threats.threats.map(t => `
            <div class="session-row">
              <div>
                <span class="badge ${t.severity === 'high' ? 'badge-danger' : 'badge-warn'}">${t.severity}</span>
                <span style="margin-left:8px">${esc(t.message)}</span>
                <p class="text-lo small mt-8">${fmtDate(t.created_at)}</p>
              </div>
            </div>`).join('')}
      </div>
      <div class="card">
        <div class="card-title"><span class="dot dot-gold"></span>Digital Signature Verification</div>
        <p class="text-mid small mb-8">Public signing key (RSA-2048):</p>
        <textarea readonly rows="5" class="mono small" style="resize:none"></textarea>
        <button class="btn btn-outline btn-sm mt-8" id="loadKeyBtn">${Icon.eye} Load Public Key</button>
      </div>
    </div>

    <!-- Audit Ledger -->
    <div class="card mt-24">
      <div class="flex-between mb-12">
        <div class="card-title" style="margin-bottom:0"><span class="dot dot-emerald"></span>Immutable Blockchain Audit Ledger</div>
        <button class="btn btn-outline btn-sm" onclick="verifyChain()">${Icon.eye} Re-verify Chain</button>
      </div>
      <div id="chainVerifyResult"></div>
      <div class="mt-16">${audit.blocks.map(auditBlockHtml).join('')}</div>
    </div>
  `);

  document.getElementById('loadKeyBtn').onclick = async () => {
    const { publicKey } = await Api.get('/api/security/signing-key');
    document.querySelector('textarea.mono.small').value = publicKey;
  };
});

async function revokeSession(id) {
  try {
    await Api.post(`/api/security/sessions/${id}/revoke`);
    toast('Session revoked', 'ok');
    Router.resolve();
  } catch (e) { toast(e.message, 'error'); }
}

async function verifyChain() {
  const r = await Api.get('/api/security/audit/verify');
  document.getElementById('chainVerifyResult').innerHTML = `
    <p class="mt-8"><span class="badge ${r.valid ? 'badge-ok' : 'badge-danger'}">
      ${r.valid ? `${Icon.check} Chain integrity confirmed` : `${Icon.alert} TAMPERING DETECTED`}
    </span> — ${r.totalBlocks} blocks checked${r.problems.length ? ': ' + JSON.stringify(r.problems) : ''}</p>
  `;
}

// ---------------------------------------------------------------------------
// VIEW: MFA Setup
// ---------------------------------------------------------------------------
Router.register('#/security/mfa-setup', async () => {
  const { secret, qrDataUrl } = await Api.post('/api/auth/mfa/totp/setup');
  document.getElementById('app').innerHTML = wrapAuth('#/security', `
    <h1 class="page-title">Enable Two-Factor Authentication</h1>
    <p class="page-sub">Scan the QR code with your authenticator app, then enter the 6-digit code to confirm.</p>

    <div class="card" style="max-width:480px">
      <div style="text-align:center">
        <img src="${qrDataUrl}" alt="TOTP QR code"
             style="width:180px;border-radius:12px;margin:8px auto 16px;display:block;border:1px solid var(--border)" />
        <p class="text-mid small">Or enter manually:</p>
        <p class="mono bold" style="font-size:15px;margin-top:4px">${secret}</p>
      </div>
      <div class="divider"></div>
      <form id="enableForm">
        <div class="input-group">
          <label for="mfa-confirm-code">6-digit code from your authenticator app</label>
          <input id="mfa-confirm-code" name="code" maxlength="6" required
                 placeholder="000000" class="mfa-code-input"/>
        </div>
        <button class="btn btn-primary btn-block mt-8" type="submit" style="padding:12px;border-radius:var(--radius)">${Icon.check} Enable MFA</button>
      </form>
    </div>
  `);
  document.getElementById('enableForm').onsubmit = async (e) => {
    e.preventDefault();
    const code = new FormData(e.target).get('code');
    try {
      await Api.post('/api/auth/mfa/totp/enable', { code });
      toast('MFA enabled successfully', 'ok');
      Router.go('#/security');
    } catch (err) { toast(err.message, 'error'); }
  };
});

// ---------------------------------------------------------------------------
// VIEW: 404
// ---------------------------------------------------------------------------
Router.register('#/notfound', async () => {
  setPageMode('public');
  document.getElementById('app').innerHTML = `
    <div style="max-width:480px;margin:80px auto;text-align:center;padding:0 20px">
      ${emptyState(Icon.alert, 'Page not found', 'The page you\'re looking for doesn\'t exist.')}
      <button class="btn btn-primary mt-16" onclick="Router.go('#/')">Go Home</button>
    </div>
  `;
});

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------
(async function init() {
  await refreshMe();
  Router.resolve();
})();
