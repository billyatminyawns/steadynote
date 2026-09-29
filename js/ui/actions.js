// Delegated event wiring. Views register named handlers once at import time;
// markup refers to them with data-action / data-form / data-live attributes,
// so handlers survive re-renders without per-element listeners.
const actions = {};
const forms = {};
const lives = {};

export const onAction = (map) => Object.assign(actions, map);
export const onSubmit = (map) => Object.assign(forms, map);
export const onLive = (map) => Object.assign(lives, map);

export function installDelegation() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.action];
    if (fn) {
      const toggleInput = el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio');
      if (!toggleInput) e.preventDefault();
      fn(el, e);
    }
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-form]');
    if (!f) return;
    const fn = forms[f.dataset.form];
    if (fn) {
      e.preventDefault();
      fn(f, e);
    }
  });
  document.addEventListener('input', (e) => {
    const f = e.target.closest('[data-live]');
    if (!f) return;
    const fn = lives[f.dataset.live];
    if (fn) fn(f, e);
  });
}

// Read a form (or any container) into a plain object.
export function readForm(root) {
  const out = {};
  for (const el of root.querySelectorAll('input[name], select[name], textarea[name]')) {
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
    else out[el.name] = el.value;
  }
  return out;
}

// Show/clear inline validation errors. `errors` maps field name -> message.
// aria-describedby is a token list; keep help text ids when adding errors.
function describedBy(el, id, add) {
  const ids = (el.getAttribute('aria-describedby') || '').split(/\s+/).filter((x) => x && x !== id);
  if (add) ids.push(id);
  if (ids.length) el.setAttribute('aria-describedby', ids.join(' ')); else el.removeAttribute('aria-describedby');
}

export function showErrors(root, errors) {
  root.querySelectorAll('.field.invalid').forEach((f) => f.classList.remove('invalid'));
  root.querySelectorAll('.error').forEach((p) => {
    p.hidden = true;
    p.textContent = '';
    const input = p.closest('.field') && p.closest('.field').querySelector('input, select, textarea');
    if (input && p.id) describedBy(input, p.id, false);
  });
  root.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  let first = null;
  for (const [name, msg] of Object.entries(errors)) {
    const el = root.querySelector(`[name="${name}"]`);
    if (!el) continue;
    const field = el.closest('.field');
    const err = field && field.querySelector('.error');
    if (field) field.classList.add('invalid');
    el.setAttribute('aria-invalid', 'true');
    if (err) {
      err.textContent = msg;
      err.hidden = false;
      describedBy(el, err.id, true);
    }
    first ||= el;
  }
  if (first) first.focus();
  return !first;
}
