// Shared primitives: integer-cent money, ISO calendar dates, formatting.
// Money is always stored and computed as integer cents. Dates are 'YYYY-MM-DD'
// strings interpreted as calendar days (no time zone drift).

export const toCents = (dollars) => Math.round(Number(dollars || 0) * 100);
export const toDollars = (c) => c / 100;

// Integer division rounded half away from zero (exact for |num| < 2^53).
export function roundDiv(num, den) {
  if (den < 0) { num = -num; den = -den; }
  if (num >= 0) return Math.floor((2 * num + den) / (2 * den));
  return -Math.floor((-2 * num + den) / (2 * den));
}

export const sum = (arr, f = (x) => x) => arr.reduce((s, x) => s + f(x), 0);
export const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// ---------- dates ----------
const pad = (n) => String(n).padStart(2, '0');
export const isoOf = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

export function dnum(iso) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}
export function diso(n) {
  return new Date(n * 86400000).toISOString().slice(0, 10);
}
export const addDays = (iso, k) => diso(dnum(iso) + k);
export const daysBetween = (a, b) => dnum(b) - dnum(a);
export const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const yearOf = (iso) => +iso.slice(0, 4);
export const monthKey = (iso) => iso.slice(0, 7);

// Add k months, pinning the day to `anchorDay` (clamped to month length) so a
// loan due on the 31st stays on the last day of shorter months.
export function addMonths(iso, k, anchorDay) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
  const day = anchorDay ?? d;
  const idx = (m - 1) + k;
  const yy = y + Math.floor(idx / 12);
  const mm = ((idx % 12) + 12) % 12 + 1;
  return isoOf(yy, mm, Math.min(day, daysInMonth(yy, mm)));
}
export function monthsBetween(a, b) {
  return (yearOf(b) - yearOf(a)) * 12 + (+b.slice(5, 7) - +a.slice(5, 7));
}
export function firstOfNextMonth(iso) {
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7);
  return m === 12 ? isoOf(y + 1, 1, 1) : isoOf(y, m + 1, 1);
}
export function localToday() {
  const n = new Date();
  return isoOf(n.getFullYear(), n.getMonth() + 1, n.getDate());
}
export const maxDate = (a, b) => (a > b ? a : b);
export const minDate = (a, b) => (a < b ? a : b);

// ---------- formatting ----------
const USD = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const USD0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0, minimumFractionDigits: 0 });
const NUM = new Intl.NumberFormat('en-US');

export const money = (c) => (c == null || Number.isNaN(c) ? '—' : USD.format(c / 100));
export const money0 = (c) => (c == null || Number.isNaN(c) ? '—' : USD0.format(Math.round(c / 100)));
export const num = (n) => NUM.format(n);
export function moneyCompact(c) {
  const d = c / 100, a = Math.abs(d);
  if (a >= 1e6) return `${d < 0 ? '-' : ''}$${(a / 1e6).toFixed(a >= 1e7 ? 1 : 2).replace(/\.?0+$/, '')}M`;
  if (a >= 1e4) return `${d < 0 ? '-' : ''}$${Math.round(a / 1e3)}K`;
  if (a >= 1e3) return `${d < 0 ? '-' : ''}$${(a / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
  return USD0.format(d);
}
export function pct(x, digits = 1) {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${x.toFixed(digits)}%`;
}
export function ratePct(x) {
  // 7.25 -> "7.25%", 7.5 -> "7.50%", 7.125 -> "7.125%"
  if (x == null || !Number.isFinite(x)) return '—';
  const s = x.toFixed(3).replace(/0$/, '');
  return `${s}%`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function fmtDate(iso, style = 'medium') {
  if (!iso) return '—';
  const y = +iso.slice(0, 4), m = +iso.slice(5, 7), d = +iso.slice(8, 10);
  if (style === 'short') return `${MONTHS[m - 1]} ${d}`;
  if (style === 'month') return `${MONTHS[m - 1]} ${y}`;
  if (style === 'monthShort') return `${MONTHS[m - 1]} '${String(y).slice(2)}`;
  if (style === 'long') return `${MONTHS_LONG[m - 1]} ${d}, ${y}`;
  if (style === 'numeric') return `${m}/${d}/${y}`;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}
export const monthName = (m, long = false) => (long ? MONTHS_LONG : MONTHS)[m - 1];

export function relDays(n) {
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${-n} days ago`;
}

export function durationLabel(months) {
  if (!months) return '—';
  if (months % 12 === 0) return `${months / 12} yr`;
  if (months < 12) return `${months} mo`;
  return `${Math.floor(months / 12)} yr ${months % 12} mo`;
}

// ---------- ids ----------
let _seq = 0;
export function uid(prefix = 'id') {
  _seq = (_seq + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${_seq.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

// Deterministic PRNG (mulberry32) for reproducible demo data.
export function rng(seed) {
  let a = typeof seed === 'string' ? hashStr(seed) : seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export function parseMoneyInput(v) {
  if (typeof v === 'number') return Math.round(v * 100);
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  if (s === '' || s === '-' || s === '.') return 0;
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export function parseNum(v, fallback = 0) {
  const s = String(v ?? '').replace(/[,%\s]/g, '');
  const n = Number(s);
  return s !== '' && Number.isFinite(n) ? n : fallback;
}
export const dollarsInput = (c) => (c == null ? '' : (c / 100).toLocaleString('en-US', { maximumFractionDigits: 2 }));
