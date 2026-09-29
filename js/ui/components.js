// Reusable UI pieces rendered as escaped HTML strings.
import { html, raw, esc, attr } from './html.js';
import { ic } from './icons.js';
import { onAction } from './actions.js';
import { STATUS } from '../core/servicing.js';
import { hashStr } from '../core/util.js';

export const badge = (tone, text, icon) =>
  html`<span class="badge ${tone}">${icon ? ic(icon, { size: 14 }) : ''}<span>${text}</span></span>`;

export function statusBadge(status) {
  const s = STATUS[status] || STATUS.current;
  return badge(s.tone, s.label, s.icon);
}

export const GRADE_TONE = { A: 'good', B: 'good', C: 'warning', D: 'serious', E: 'critical' };
export const gradeBadge = (g, label) =>
  html`<span class="grade grade-${g}" title="${label || ''}"><span class="grade-letter">${g}</span>${label ? html`<span class="grade-label">${label}</span>` : ''}</span>`;

export const stat = ({ label, value, sub, tone = '', icon, hero = false }) =>
  html`<div class="stat ${hero ? 'stat-hero' : ''}">
    <div class="stat-label">${icon ? ic(icon, { size: 16 }) : ''}<span>${label}</span></div>
    <div class="stat-value">${value}</div>
    ${sub ? html`<div class="stat-sub ${tone}">${sub}</div>` : ''}
  </div>`;

export const card = ({ title, action, body, cls = '', sub, id }) =>
  html`<section class="card ${cls}"${attr('id', id)}>
    ${title ? html`<header class="card-head"><div><h2 class="card-title">${title}</h2>${sub ? html`<p class="card-sub">${sub}</p>` : ''}</div>${action || ''}</header>` : ''}
    ${body}
  </section>`;

export function field(o) {
  const {
    label, name, value = '', type = 'text', prefix, suffix, help, required, placeholder, inputmode,
    min, max, step, id, options, rows = 3, cls = '', autocomplete, disabled, readonly, pattern, maxlength,
  } = o;
  const fid = id || `f-${name}`;
  const common = html`id="${fid}" name="${name}"${attr('required', !!required)}${attr('disabled', !!disabled)}${attr('readonly', !!readonly)}${help ? attr('aria-describedby', `${fid}-help`) : ''}${attr('autocomplete', autocomplete)}`;
  let control;
  if (type === 'select') {
    control = html`<select ${common}>${options.map(([v, l]) => html`<option value="${v}"${attr('selected', String(v) === String(value))}>${l}</option>`)}</select>`;
  } else if (type === 'textarea') {
    control = html`<textarea ${common} rows="${rows}"${attr('placeholder', placeholder)}${attr('maxlength', maxlength)}>${value}</textarea>`;
  } else {
    control = html`<input ${common} type="${type}" value="${value}"${attr('placeholder', placeholder)}${attr('inputmode', inputmode)}${attr('min', min)}${attr('max', max)}${attr('step', step)}${attr('pattern', pattern)}${attr('maxlength', maxlength)}>`;
  }
  if (prefix || suffix) {
    control = html`<div class="input-group">${prefix ? html`<span class="affix" aria-hidden="true">${prefix}</span>` : ''}${control}${suffix ? html`<span class="affix" aria-hidden="true">${suffix}</span>` : ''}</div>`;
  }
  return html`<div class="field ${cls}">
    <label for="${fid}">${label}${required ? html`<span class="req" aria-hidden="true"> *</span>` : ''}</label>
    ${control}
    ${help ? html`<p class="help" id="${fid}-help">${help}</p>` : ''}
    <p class="error" id="${fid}-err" hidden></p>
  </div>`;
}

export const moneyField = (o) => field({ ...o, prefix: '$', inputmode: 'decimal', type: 'text' });

export const toggle = ({ name, checked, label, desc, id, disabled, action, data = {} }) => {
  const fid = id || `t-${name}`;
  const dataAttrs = raw(Object.entries(data).map(([k, v]) => ` data-${k}="${esc(v)}"`).join(''));
  return html`<label class="switch" for="${fid}">
    <input type="checkbox" role="switch" id="${fid}" name="${name}"${attr('checked', !!checked)}${attr('disabled', !!disabled)}${attr('data-action', action)}${dataAttrs}>
    <span class="switch-ui" aria-hidden="true"></span>
    <span class="switch-text"><span class="switch-label">${label}</span>${desc ? html`<span class="switch-desc">${desc}</span>` : ''}</span>
  </label>`;
};

export const checkbox = ({ name, checked, label, desc, id, required }) => {
  const fid = id || `c-${name}`;
  return html`<div class="field field-check"><label class="check" for="${fid}">
    <input type="checkbox" id="${fid}" name="${name}"${attr('checked', !!checked)}${attr('required', !!required)}>
    <span><span class="check-label">${label}</span>${desc ? html`<span class="check-desc">${desc}</span>` : ''}</span>
  </label><p class="error" id="${fid}-err" hidden></p></div>`;
};

export function segmented({ name, value, options, label }) {
  return html`<fieldset class="seg-field"><legend>${label}</legend><div class="seg">
    ${options.map(([v, l]) => html`<label class="seg-opt"><input type="radio" name="${name}" value="${v}"${attr('checked', String(v) === String(value))}><span>${l}</span></label>`)}
  </div></fieldset>`;
}

export function meter({ value, max = 100, marks = [], tone = 'brand', label, text }) {
  const pctW = Math.max(0, Math.min(100, (value / max) * 100));
  return html`<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="${Math.round(value * 10) / 10}" aria-label="${label}"${text ? attr('aria-valuetext', text) : ''}>
    <div class="meter-track tone-${tone}"><div class="meter-fill" style="width:${pctW.toFixed(2)}%"></div>
      ${marks.map((m) => html`<span class="meter-mark" style="left:${Math.min(100, (m.at / max) * 100).toFixed(2)}%"><span class="meter-mark-label">${m.label}</span></span>`)}
    </div>
  </div>`;
}

export const empty = ({ icon = 'inbox', title, text, action }) =>
  html`<div class="empty">${ic(icon, { size: 28 })}<h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action || ''}</div>`;

export const alertBox = ({ tone = 'info', title, text, actions, icon }) =>
  html`<div class="alert ${tone}" role="${tone === 'critical' || tone === 'serious' ? 'alert' : 'status'}">
    ${ic(icon || (tone === 'good' ? 'check' : tone === 'info' || tone === 'neutral' ? 'info' : 'alert'), { size: 20 })}
    <div class="alert-body">${title ? html`<strong>${title}</strong>` : ''}${text ? html`<p>${text}</p>` : ''}</div>
    ${actions ? html`<div class="alert-actions">${actions}</div>` : ''}
  </div>`;

export const kv = (rows, cls = '') =>
  html`<dl class="kv ${cls}">${rows.filter(Boolean).map(([k, v]) => html`<div><dt>${k}</dt><dd>${v}</dd></div>`)}</dl>`;

export const tabs = (items, active, label = 'Sections') =>
  html`<nav class="tabs" aria-label="${label}">${items.map((t) => html`<a href="${t.href}"${attr('aria-current', t.id === active ? 'page' : null)}>${t.label}${t.count != null ? html`<span class="tab-count">${t.count}</span>` : ''}</a>`)}</nav>`;

// ---------- modal (native <dialog>) ----------
export function openModal({ title, body, footer, size = 'md', onMount, onClose, cls = '' }) {
  const dlg = document.createElement('dialog');
  dlg.className = `modal modal-${size} ${cls}`;
  const tid = `mt-${Math.random().toString(36).slice(2, 8)}`;
  dlg.setAttribute('aria-labelledby', tid);
  dlg.innerHTML = `<div class="modal-card">
      <header class="modal-head"><h2 id="${tid}">${esc(title)}</h2><button type="button" class="icon-btn" data-action="modal-close" aria-label="Close">${ic('x')}</button></header>
      <div class="modal-body">${body}</div>
      ${footer ? `<footer class="modal-foot">${footer}</footer>` : ''}
    </div>`;
  // Drop any dialogs left behind (e.g. a browser that skipped the close event).
  document.querySelectorAll('dialog.modal').forEach((d) => { if (!d.open) d.remove(); });
  document.body.appendChild(dlg);
  const opener = document.activeElement;
  // Cleanup runs synchronously so it never depends on the async close event.
  dlg._finalize = () => {
    if (dlg._done) return;
    dlg._done = true;
    if (dlg.open) dlg.close();
    dlg.remove();
    onClose && onClose();
    if (opener && document.contains(opener)) opener.focus();
  };
  dlg.addEventListener('close', dlg._finalize);
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); dlg._finalize(); });
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) dlg._finalize(); });
  dlg.showModal();
  const firstInput = dlg.querySelector('.modal-body input:not([type=hidden]), .modal-body select, .modal-body textarea');
  if (firstInput) firstInput.focus();
  onMount && onMount(dlg);
  return dlg;
}
export function closeModal(el) {
  const d = el && el.closest && el.closest('dialog');
  if (!d) return;
  if (d._finalize) d._finalize(); else { d.close(); d.remove(); }
}
onAction({ 'modal-close': (el) => closeModal(el) });

// ---------- toast ----------
export function toast(message, tone = 'good') {
  let region = document.getElementById('toasts');
  if (!region) {
    region = document.createElement('div');
    region.id = 'toasts';
    region.className = 'toasts';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    document.body.appendChild(region);
  }
  const t = document.createElement('div');
  t.className = `toast ${tone}`;
  t.innerHTML = `${ic(tone === 'good' ? 'check' : tone === 'info' ? 'info' : 'alert', { size: 18 })}<span></span>`;
  t.querySelector('span').textContent = message;
  region.appendChild(t);
  setTimeout(() => t.classList.add('out'), 3800);
  setTimeout(() => t.remove(), 4300);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied to clipboard');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* ignore */ }
    ta.remove();
    toast(ok ? 'Copied to clipboard' : 'Couldn’t copy. Select the link and copy it manually.', ok ? 'good' : 'warning');
  }
}

// ---------- property illustration ----------
const TYPE_WORD = { sfr: 'a single-family home', condo: 'a condo building', multi: 'a duplex', manufactured: 'a manufactured home', land: 'a parcel of land', commercial: 'a commercial building' };

export function propertyArt(p, { cls = '' } = {}) {
  const h = p.hue ?? (hashStr(p.address || 'x') % 360);
  const gid = `sky${hashStr(`${p.address}|${h}`).toString(36)}`;
  const sky1 = `hsl(${h} 62% 89%)`, sky2 = `hsl(${h} 50% 97%)`;
  const wall = `hsl(${h} 32% 96%)`, wall2 = `hsl(${h} 18% 86%)`, roof = `hsl(${h} 32% 30%)`, trim = `hsl(${h} 22% 42%)`;
  const door = `hsl(${(h + 180) % 360} 38% 36%)`, win = `hsl(${(h + 200) % 360} 55% 82%)`;
  const tree = (x, y, s = 1, c = 'hsl(150 30% 40%)') =>
    `<rect x="${x - 2 * s}" y="${y - 6 * s}" width="${4 * s}" height="${12 * s}" fill="hsl(28 30% 34%)"/><ellipse cx="${x}" cy="${y - 20 * s}" rx="${13 * s}" ry="${18 * s}" fill="${c}"/>`;
  let b = '';
  const t = p.type || 'sfr';
  if (t === 'condo' || t === 'commercial') {
    b += `<rect x="116" y="46" width="88" height="104" rx="2" fill="${wall}"/><rect x="116" y="46" width="88" height="7" fill="${roof}"/><rect x="198" y="53" width="6" height="97" fill="${wall2}"/>`;
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b += `<rect x="${126 + c * 24}" y="${62 + r * 20}" width="16" height="12" rx="1.5" fill="${win}" stroke="${trim}" stroke-width="1.2"/>`;
    b += `<rect x="150" y="136" width="20" height="14" fill="${door}"/>`;
  } else if (t === 'multi') {
    b += `<rect x="186" y="66" width="10" height="22" fill="${trim}"/><rect x="92" y="98" width="136" height="52" fill="${wall}"/><rect x="159" y="98" width="2" height="52" fill="${wall2}"/><polygon points="84,100 160,64 236,100" fill="${roof}"/>`;
    b += `<rect x="124" y="118" width="18" height="32" rx="2" fill="${door}"/><rect x="178" y="118" width="18" height="32" rx="2" fill="${door}"/>`;
    for (const x of [100, 146, 164, 204]) b += `<rect x="${x}" y="108" width="14" height="14" rx="1.5" fill="${win}" stroke="${trim}" stroke-width="1.2"/>`;
  } else if (t === 'manufactured') {
    b += `<rect x="86" y="112" width="148" height="38" rx="3" fill="${wall}"/><polygon points="80,114 160,98 240,114" fill="${roof}"/><rect x="152" y="122" width="16" height="28" rx="2" fill="${door}"/>`;
    for (const x of [98, 122, 180, 206]) b += `<rect x="${x}" y="122" width="16" height="12" rx="1.5" fill="${win}" stroke="${trim}" stroke-width="1.2"/>`;
  } else if (t === 'land') {
    for (let i = 0; i < 6; i++) b += `<path d="M${20 + i * 56} 176 L${80 + i * 40} 150" stroke="hsl(95 26% 52%)" stroke-width="2" opacity=".5"/>`;
    for (let x = 16; x < 320; x += 26) b += `<rect x="${x}" y="136" width="3" height="16" fill="hsl(30 30% 40%)"/>`;
    b += `<rect x="12" y="140" width="300" height="2" fill="hsl(30 30% 45%)"/><rect x="12" y="146" width="300" height="2" fill="hsl(30 30% 45%)"/>`;
    b += `<rect x="208" y="104" width="3" height="46" fill="hsl(30 30% 35%)"/><rect x="188" y="100" width="44" height="22" rx="2" fill="${wall}" stroke="${trim}" stroke-width="1.5"/><rect x="195" y="107" width="30" height="3" rx="1" fill="${trim}"/><rect x="195" y="113" width="20" height="3" rx="1" fill="${wall2}"/>`;
  } else {
    b += `<rect x="184" y="70" width="10" height="22" fill="${trim}"/><rect x="112" y="98" width="96" height="52" fill="${wall}"/><rect x="200" y="100" width="8" height="50" fill="${wall2}"/><polygon points="104,100 160,62 216,100" fill="${roof}"/>`;
    b += `<rect x="150" y="116" width="20" height="34" rx="2" fill="${door}"/><circle cx="165" cy="134" r="1.4" fill="${wall}"/>`;
    b += `<rect x="122" y="110" width="20" height="16" rx="1.5" fill="${win}" stroke="${trim}" stroke-width="1.4"/><rect x="178" y="110" width="20" height="16" rx="1.5" fill="${win}" stroke="${trim}" stroke-width="1.4"/>`;
    b += `<polygon points="152,150 168,150 176,180 144,180" fill="hsl(40 20% 82%)"/>`;
  }
  const svg = `<svg class="prop-art ${cls}" viewBox="0 0 320 180" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration of ${TYPE_WORD[t] || 'a property'}">
    <defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient></defs>
    <rect width="320" height="180" fill="url(#${gid})"/>
    <circle cx="262" cy="40" r="15" fill="hsl(44 92% 72%)" opacity=".85"/>
    <path d="M0 118 C 60 96 110 104 160 112 S 260 96 320 108 V180 H0Z" fill="hsl(150 18% 82%)"/>
    <path d="M0 136 C 70 120 140 130 200 134 S 290 124 320 130 V180 H0Z" fill="hsl(140 22% 72%)"/>
    <rect y="150" width="320" height="30" fill="hsl(100 24% 64%)"/>
    ${t === 'land' ? tree(70, 150, 1.1) + tree(250, 146, 0.9, 'hsl(140 32% 34%)') + tree(284, 150, 1.2) : tree(58, 150, 1.1) + tree(262, 150, 1.25, 'hsl(140 32% 34%)') + tree(292, 152, 0.8)}
    ${b}
  </svg>`;
  return raw(svg);
}

export const propertyLine = (p) => `${p.address}, ${p.city}, ${p.state}${p.zip ? ' ' + p.zip : ''}`;
