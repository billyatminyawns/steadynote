// Tiny escaping template helper. Interpolated values are HTML-escaped unless
// they are SafeHTML (from html`` or raw()). Arrays are joined.
export class SafeHTML {
  constructor(s) { this.s = s; }
  toString() { return this.s; }
}
export const raw = (s) => new SafeHTML(String(s ?? ''));
const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (v) => String(v).replace(/[&<>"']/g, (c) => MAP[c]);

function val(v) {
  if (v == null || v === false || v === true) return '';
  if (v instanceof SafeHTML) return v.s;
  if (Array.isArray(v)) return v.map(val).join('');
  return esc(v);
}
export function html(strings, ...vals) {
  let out = strings[0];
  for (let i = 0; i < vals.length; i++) out += val(vals[i]) + strings[i + 1];
  return new SafeHTML(out);
}
export const when = (cond, a, b = '') => (cond ? (typeof a === 'function' ? a() : a) : typeof b === 'function' ? b() : b);
export const attr = (name, v) => (v == null || v === false ? '' : raw(v === true ? ` ${name}` : ` ${name}="${esc(v)}"`));
