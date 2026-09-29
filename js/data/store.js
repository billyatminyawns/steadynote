// Workspace state, persisted to localStorage (this browser only).
// An untouched demo workspace is regenerated each day so it always looks
// current; once the visitor changes anything, their copy is kept as-is.
import { buildSeed, emptyWorkspace, SCHEMA_VERSION } from './seed.js';
import { localToday, addDays, daysBetween } from '../core/util.js';
import { computeLoan, pendingAutopay } from '../core/servicing.js';

const KEY = 'steadynote:workspace';
let state = null;
let version = 0;
let storageOk = true;
const subs = new Set();
let cache = { v: -1, asOf: null, states: null };

function readRaw() {
  try { return localStorage.getItem(KEY); } catch { storageOk = false; return null; }
}
function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); storageOk = true; } catch { storageOk = false; }
}
const emit = () => subs.forEach((f) => { try { f(); } catch (e) { console.error(e); } });

export function initStore() {
  const real = localToday();
  let s = null;
  const raw = readRaw();
  if (raw) {
    try { s = JSON.parse(raw); } catch { s = null; }
  }
  const stale = s && s.demo && !s.dirty && s.seededOn !== real;
  if (!s || s.version !== SCHEMA_VERSION || stale) s = buildSeed(real);
  state = s;
  runAutopay();
  persist();
}

export const getState = () => state;
export const storageAvailable = () => storageOk;
export const today = () => addDays(localToday(), state?.settings?.clockOffset || 0);
export const subscribe = (fn) => { subs.add(fn); return () => subs.delete(fn); };

export function update(fn, { dirty = true, silent = false } = {}) {
  fn(state);
  if (dirty) state.dirty = true;
  version++;
  persist();
  if (!silent) emit();
}

export function loanStates() {
  const asOf = today();
  if (cache.v === version && cache.asOf === asOf) return cache.states;
  const states = {};
  for (const l of state.loans) states[l.id] = computeLoan(l, asOf);
  cache = { v: version, asOf, states };
  return states;
}
export const loanState = (id) => loanStates()[id];

export function runAutopay() {
  const asOf = today();
  let added = 0;
  for (const loan of state.loans) {
    const drafts = pendingAutopay(loan, asOf);
    if (!drafts.length) continue;
    if ((state.settings.clockOffset || 0) > 0) drafts.forEach((d) => { d.simulated = true; });
    loan.transactions.push(...drafts);
    added += drafts.length;
  }
  if (added) version++;
  return added;
}

// Demo clock: move "today" forward to watch autopay, reminders and late
// charges happen. Moving back removes simulated drafts dated in the future.
export function setClock(offsetDays) {
  const old = state.settings.clockOffset || 0;
  state.settings.clockOffset = Math.max(0, Math.round(offsetDays));
  const t = today();
  if (state.settings.clockOffset < old) {
    for (const loan of state.loans) loan.transactions = loan.transactions.filter((tx) => !(tx.simulated && tx.date > t));
  }
  const added = runAutopay();
  state.dirty = true;
  version++;
  persist();
  emit();
  return added;
}

export function resetDemo() {
  state = buildSeed(localToday());
  runAutopay();
  version++;
  persist();
  emit();
}

export function startEmpty() {
  state = emptyWorkspace(localToday());
  version++;
  persist();
  emit();
}

export const exportJSON = () => JSON.stringify(state, null, 2);

export function importJSON(text) {
  const s = JSON.parse(text);
  if (!s || typeof s !== 'object' || !Array.isArray(s.loans) || !Array.isArray(s.deals) || !s.profile || !s.settings) {
    throw new Error('That file isn’t a SteadyNote workspace export.');
  }
  s.version = SCHEMA_VERSION;
  s.dirty = true;
  state = s;
  runAutopay();
  version++;
  persist();
  emit();
}

export function logActivity(text, link) {
  state.activity.unshift({ date: today(), text, link });
  if (state.activity.length > 200) state.activity.length = 200;
}

// Seller-financed closings in the 12 months before `date` (for Reg Z limits).
export function financedLast12(excludeLoanId = null, date = today()) {
  const own = state.loans.filter((l) => l.id !== excludeLoanId && l.terms.closingDate && daysBetween(l.terms.closingDate, date) >= 0 && daysBetween(l.terms.closingDate, date) < 365).length;
  return own + Number(state.profile.otherFinancedLast12 || 0);
}

export const dealById = (id) => state.deals.find((d) => d.id === id);
export const dealByCode = (code) => state.deals.find((d) => d.code === code);
export const loanById = (id) => state.loans.find((l) => l.id === id);
export const appById = (id) => state.applications.find((a) => a.id === id);
export const appsForDeal = (id) => state.applications.filter((a) => a.dealId === id);
