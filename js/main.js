// App bootstrap: hash router, layouts, global actions.
import { html, raw, esc } from './ui/html.js';
import { ic, logo } from './ui/icons.js';
import { installDelegation, onAction } from './ui/actions.js';
import { openModal, toast, closeModal } from './ui/components.js';
import { initStore, getState, subscribe, today, setClock, resetDemo, storageAvailable } from './data/store.js';
import { fmtDate, localToday, daysBetween } from './core/util.js';

import { landingView } from './views/marketing/landing.js';
import { pricingView } from './views/marketing/pricing.js';
import { calculatorView } from './views/marketing/calculator.js';
import { businessView } from './views/marketing/business.js';
import { dashboardView } from './views/app/dashboard.js';
import { dealsView, dealDetailView, dealEditorView } from './views/app/deals.js';
import { applicantsView, applicantDetailView } from './views/app/applicants.js';
import { loansView, boardLoanView } from './views/app/loans.js';
import { loanDetailView } from './views/app/loan-detail.js';
import { automationsView } from './views/app/automations.js';
import { taxView } from './views/app/tax.js';
import { noteValueView } from './views/app/note-value.js';
import { billingView } from './views/app/billing.js';
import { settingsView } from './views/app/settings.js';
import { applyView } from './views/apply.js';
import { borrowerPickerView, borrowerView } from './views/borrower.js';
import { docView } from './views/doc.js';

const ROUTES = [
  ['/', landingView],
  ['/pricing', pricingView],
  ['/calculator', calculatorView],
  ['/business', businessView],
  ['/app', dashboardView],
  ['/app/deals', dealsView],
  ['/app/deals/new', dealEditorView],
  ['/app/deals/:id', dealDetailView],
  ['/app/deals/:id/edit', dealEditorView],
  ['/app/applicants', applicantsView],
  ['/app/applicants/:id', applicantDetailView],
  ['/app/loans', loansView],
  ['/app/loans/new', boardLoanView],
  ['/app/loans/:id', loanDetailView],
  ['/app/loans/:id/:tab', loanDetailView],
  ['/app/automations', automationsView],
  ['/app/tax', taxView],
  ['/app/note-value', noteValueView],
  ['/app/billing', billingView],
  ['/app/settings', settingsView],
  ['/apply/:code', applyView],
  ['/borrower', borrowerPickerView],
  ['/borrower/:id', borrowerView],
  ['/doc/:kind/:id', docView],
].map(([pattern, view]) => {
  const keys = [];
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; })}/?$`);
  return { re, keys, view };
});

const notFoundView = {
  layout: 'marketing',
  title: 'Page not found',
  render: () => html`<section class="container section narrow center"><h1 tabindex="-1">We couldn’t find that page</h1><p class="lead">The link may be out of date.</p><p><a class="btn btn-primary" href="#/">Go to the homepage</a></p></section>`,
};

export function parseHash() {
  const h = decodeURI(location.hash.replace(/^#/, '')) || '/';
  const [path, qs = ''] = h.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs));
  return { path: path || '/', query };
}

function match(path) {
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) return { view: r.view, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return { view: notFoundView, params: {} };
}

// ---------- layouts ----------
const NAV = [
  ['dashboard', '#/app', 'Dashboard', 'dashboard'],
  ['deals', '#/app/deals', 'Deals & listings', 'tag'],
  ['applicants', '#/app/applicants', 'Applicants', 'users'],
  ['loans', '#/app/loans', 'Loans', 'file'],
  ['automations', '#/app/automations', 'Automations', 'zap'],
  ['tax', '#/app/tax', 'Tax center', 'landmark'],
  ['note-value', '#/app/note-value', 'Note value', 'trending'],
  null,
  ['billing', '#/app/billing', 'Billing', 'card'],
  ['settings', '#/app/settings', 'Settings', 'sliders'],
];

function marketingLayout(content, view) {
  const active = view.nav || '';
  const link = (id, href, label) => html`<a href="${href}"${id === active ? raw(' aria-current="page"') : ''}>${label}</a>`;
  return html`
  <button type="button" class="skip" data-action="skip-to-main">Skip to content</button>
  <header class="site-header">
    <div class="container site-header-inner">
      ${logo('#/')}
      <nav class="site-nav" aria-label="Main">
        ${link('how', '#/?s=how', 'How it works')}
        ${link('calculator', '#/calculator', 'Calculator')}
        ${link('pricing', '#/pricing', 'Pricing')}
        ${link('business', '#/business', 'Business model')}
      </nav>
      <div class="site-cta">
        <a class="btn btn-ghost btn-sm hide-sm" href="#/borrower">Buyer login</a>
        <a class="btn btn-primary btn-sm" href="#/app">Open seller demo</a>
      </div>
    </div>
  </header>
  <main id="main" tabindex="-1">${content}</main>
  <footer class="site-footer">
    <div class="container footer-grid">
      <div class="footer-brand">${logo('#/')}<p>Seller financing, handled. Structure the deal, qualify the buyer and get paid on autopilot.</p></div>
      <nav aria-label="Product"><h2>Product</h2><a href="#/app">Seller demo</a><a href="#/calculator">Seller-financing calculator</a><a href="#/pricing">Pricing</a><a href="#/borrower">Buyer portal</a><a href="#/apply/sunset-ridge-4471">Sample buyer application</a></nav>
      <nav aria-label="Company"><h2>Company</h2><a href="#/business">Business model</a><a href="#/?s=why">Why now</a><a href="#/?s=faq">FAQ</a></nav>
      <div class="footer-note"><h2>Important</h2><p>SteadyNote is a working prototype. It is not a lender, loan originator, law firm or tax advisor, and nothing here is legal or tax advice. Demo data is fictional and stays in your browser.</p></div>
    </div>
    <div class="container footer-bottom"><span>© ${localToday().slice(0, 4)} SteadyNote</span><span>Rates: Freddie Mac PMMS · IRS Rev. Rul. 2026-19</span></div>
  </footer>`;
}

function appLayout(content, view) {
  const s = getState();
  const newApps = s.applications.filter((a) => ['new', 'review'].includes(a.status)).length;
  const counts = { applicants: newApps || null, deals: s.deals.filter((d) => ['draft', 'listed'].includes(d.status)).length || null };
  const t = today();
  const offset = s.settings.clockOffset || 0;
  const initials = (s.profile.name || 'You').split(/[\s&]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return html`
  <button type="button" class="skip" data-action="skip-to-main">Skip to content</button>
  <div class="app-shell">
    <aside class="sidebar" id="sidebar" aria-label="Seller workspace">
      <div class="sidebar-top">${logo('#/')}<button type="button" class="icon-btn sidebar-close" data-action="toggle-sidebar" aria-label="Close menu">${ic('x')}</button></div>
      <div class="workspace">
        <span class="avatar" aria-hidden="true">${initials || 'SN'}</span>
        <span><strong>${s.profile.entityName || s.profile.name || 'Your workspace'}</strong><small>${s.demo ? 'Demo workspace' : 'Seller workspace'}</small></span>
      </div>
      <nav class="side-nav" aria-label="Seller sections">
        ${NAV.map((n) => (n === null ? html`<div class="nav-sep" role="separator"></div>` : html`<a href="${n[1]}"${n[0] === view.nav ? raw(' aria-current="page"') : ''}>${ic(n[3])}<span>${n[2]}</span>${counts[n[0]] ? html`<span class="nav-count">${counts[n[0]]}</span>` : ''}</a>`))}
      </nav>
      <div class="sidebar-foot">
        <a href="#/borrower">${ic('user')}<span>Buyer portal (demo)</span></a>
        <a href="#/">${ic('arrowLeft')}<span>Back to website</span></a>
      </div>
    </aside>
    <div class="scrim" data-action="toggle-sidebar" aria-hidden="true"></div>
    <div class="app-main">
      <header class="topbar">
        <button type="button" class="icon-btn menu-btn" data-action="toggle-sidebar" aria-label="Open menu" aria-controls="sidebar" aria-expanded="false">${ic('menu')}</button>
        <button type="button" class="clock-chip ${offset ? 'shifted' : ''}" data-action="open-clock" title="Demo clock">
          ${ic('calendar', { size: 16 })}<span>${fmtDate(t)}</span>${offset ? html`<span class="clock-shift">+${offset}d</span>` : ''}
        </button>
        <div class="topbar-right">
          <a class="btn btn-secondary btn-sm hide-sm" href="#/calculator">${ic('calculator', { size: 16 })}<span>Calculator</span></a>
          <a class="btn btn-primary btn-sm" href="#/app/deals/new">${ic('plus', { size: 16 })}<span>New deal</span></a>
        </div>
      </header>
      ${s.demo ? html`<div class="demo-banner" role="note">${ic('info', { size: 16 })}<span><strong>Demo workspace.</strong> Fictional data, saved only in this browser. Change anything you like.</span><button type="button" class="link-btn" data-action="reset-demo">Reset demo</button></div>` : ''}
      ${!storageAvailable() ? html`<div class="demo-banner warn" role="note">${ic('alert', { size: 16 })}<span>This browser is blocking storage, so changes won’t be saved after you leave.</span></div>` : ''}
      <main id="main" class="page" tabindex="-1">${content}</main>
    </div>
  </div>`;
}

function borrowerLayout(content) {
  return html`
  <button type="button" class="skip" data-action="skip-to-main">Skip to content</button>
  <header class="portal-header"><div class="container portal-header-inner">${logo('#/')}<span class="portal-tag">Borrower portal</span><nav class="portal-links" aria-label="Demo navigation"><a href="#/borrower">Switch borrower</a><a href="#/app">Seller view</a></nav></div></header>
  <main id="main" class="portal-main" tabindex="-1">${content}</main>
  <footer class="portal-footer container"><p>Payments are processed by SteadyNote on behalf of your seller. Questions? Use the message box or reply to any SteadyNote email. <strong>Demo:</strong> no real money moves.</p></footer>`;
}

function applyLayout(content) {
  return html`
  <button type="button" class="skip" data-action="skip-to-main">Skip to content</button>
  <header class="portal-header"><div class="container portal-header-inner">${logo('#/')}<span class="portal-tag">${ic('lock', { size: 14 })} Secure application</span></div></header>
  <main id="main" class="portal-main" tabindex="-1">${content}</main>
  <footer class="portal-footer container"><p>Your information goes only to the seller and is used to evaluate this purchase. SteadyNote never sells your data. <strong>Demo:</strong> nothing is sent anywhere; it stays in this browser.</p></footer>`;
}

const docLayout = (content) => html`<main id="main" class="doc-main" tabindex="-1">${content}</main>`;

const LAYOUTS = { marketing: marketingLayout, app: appLayout, borrower: borrowerLayout, apply: applyLayout, doc: docLayout };

// ---------- render loop ----------
const root = document.getElementById('app');
let cleanup = null;

function render(routeChange) {
  const { path, query } = parseHash();
  const { view, params } = match(path);
  const ctx = { params, query, path };
  const y = window.scrollY;
  const focusId = !routeChange && document.activeElement && document.activeElement.id;
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  let content;
  try {
    content = view.render(ctx);
  } catch (err) {
    console.error(err);
    content = html`<section class="container section narrow"><h1 tabindex="-1">Something went wrong</h1><p class="lead">${String(err && err.message)}</p><p><a class="btn btn-primary" href="#/app">Back to dashboard</a> <button type="button" class="btn btn-secondary" data-action="reset-demo">Reset demo data</button></p></section>`;
  }
  const layout = LAYOUTS[view.layout || 'marketing'];
  try {
    root.innerHTML = String(layout(content, view, ctx));
  } catch (err) {
    console.error(err);
    root.innerHTML = String(html`<main id="main" class="container section narrow" tabindex="-1"><h1>Something went wrong</h1><p class="lead">${String(err && err.message)}</p><p><button type="button" class="btn btn-secondary" data-action="confirm-reset">Reset demo data</button></p></main>`);
  }
  const title = typeof view.title === 'function' ? view.title(ctx) : view.title;
  document.title = title ? `${title} · SteadyNote` : 'SteadyNote · Seller financing, handled';
  const main = document.getElementById('main');
  try {
    cleanup = view.mount ? view.mount(main, ctx) : null;
  } catch (err) {
    console.error(err);
  }
  if (routeChange) {
    if (query.s) {
      const target = document.getElementById(query.s);
      if (target) { target.scrollIntoView({ behavior: 'instant' }); target.focus && target.focus({ preventScroll: true }); return; }
    }
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    const h1 = main && main.querySelector('h1');
    if (h1) { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
  } else {
    window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    if (focusId) {
      const el = document.getElementById(focusId);
      if (el) el.focus({ preventScroll: true });
    }
  }
}

// ---------- global actions ----------
onAction({
  'skip-to-main': () => { const m = document.getElementById('main'); if (m) m.focus(); },
  'toggle-sidebar': () => {
    const open = document.body.classList.toggle('nav-open');
    const btn = document.querySelector('.menu-btn');
    if (btn) btn.setAttribute('aria-expanded', String(open));
    if (open) { const first = document.querySelector('.side-nav a'); if (first) first.focus(); }
  },
  'reset-demo': () => {
    openModal({
      title: 'Reset the demo workspace?',
      body: '<p>This restores the sample portfolio, listings and applicants, and discards changes you made in this browser.</p>',
      footer: `<button type="button" class="btn btn-secondary" data-action="modal-close">Cancel</button><button type="button" class="btn btn-danger" data-action="confirm-reset">Reset demo</button>`,
      size: 'sm',
    });
  },
  'confirm-reset': (el) => {
    closeModal(el);
    resetDemo();
    toast('Demo workspace restored');
    location.hash = '#/app';
  },
  'open-clock': () => {
    const s = getState();
    const off = s.settings.clockOffset || 0;
    openModal({
      title: 'Demo clock',
      size: 'sm',
      body: `<p>Move the workspace forward in time to watch SteadyNote work: autopay drafts post on due dates, reminders and statements go out, and late charges hit buyers who pay by hand.</p>
        <p class="clock-now">Workspace date: <strong>${esc(fmtDate(today(), 'long'))}</strong>${off ? ` <span class="muted">(${off} days ahead of today)</span>` : ''}</p>
        <div class="btn-row wrap">
          <button type="button" class="btn btn-secondary" data-action="clock" data-days="7">+1 week</button>
          <button type="button" class="btn btn-secondary" data-action="clock" data-days="30">+1 month</button>
          <button type="button" class="btn btn-secondary" data-action="clock" data-days="90">+3 months</button>
          <button type="button" class="btn btn-ghost" data-action="clock" data-days="reset"${off ? '' : ' disabled'}>Back to today</button>
        </div>`,
    });
  },
  clock: (el) => {
    const s = getState();
    const d = el.dataset.days;
    const next = d === 'reset' ? 0 : (s.settings.clockOffset || 0) + Number(d);
    closeModal(el);
    const added = setClock(next);
    toast(d === 'reset' ? 'Back to today' : `Jumped to ${fmtDate(today())}${added ? `: ${added} autopay draft${added > 1 ? 's' : ''} posted` : ''}`, 'info');
  },
});

document.addEventListener('sn:rerender', () => render(false));
window.addEventListener('hashchange', () => {
  document.body.classList.remove('nav-open');
  render(true);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.body.classList.contains('nav-open')) {
    document.body.classList.remove('nav-open');
    const b = document.querySelector('.menu-btn');
    if (b) b.focus();
  }
});

initStore();
installDelegation();
subscribe(() => render(false));
render(true);

// Midnight rollover for a tab left open across days.
let lastDay = localToday();
setInterval(() => {
  const d = localToday();
  if (d !== lastDay && daysBetween(lastDay, d) > 0) { lastDay = d; render(false); }
}, 60000);

