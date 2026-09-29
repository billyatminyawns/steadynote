// Helpers shared by several views.
import { html, raw } from '../ui/html.js';
import { ic } from '../ui/icons.js';
import { badge } from '../ui/components.js';
import { getState, financedLast12 } from '../data/store.js';
import { checkCompliance, PROPERTY_TYPES } from '../core/compliance.js';
import { installmentCount, hasBalloon } from '../core/servicing.js';
import { money, money0, ratePct, fmtDate, durationLabel, addDays } from '../core/util.js';

export const METHODS = {
  autopay: 'Autopay (ACH)',
  ach: 'ACH / online',
  check: 'Check',
  zelle: 'Zelle',
  wire: 'Wire',
  cash: 'Cash',
  money_order: 'Cashier’s check / money order',
};

export function sellerForCompliance(excludeLoanId = null) {
  const s = getState();
  return { ...s.profile, financedLast12: financedLast12(excludeLoanId) };
}

export function compliance(deal, { atrDone = null } = {}) {
  const s = getState();
  return checkCompliance({
    seller: sellerForCompliance(),
    property: deal.property,
    occupancy: deal.terms.occupancy || 'owner',
    terms: deal.terms,
    atrDone,
    market: s.settings.market,
    afr: s.settings.afr,
  });
}

export function termsLine(t) {
  const parts = [];
  if (t.downPct != null) parts.push(`${+t.downPct.toFixed(1)}% down`);
  parts.push(`${ratePct(t.ratePct)} fixed`);
  parts.push(`${durationLabel(t.amortMonths)} amortization`);
  parts.push(hasBalloon(t) ? `${durationLabel(t.balloonMonths)} balloon` : 'no balloon');
  return parts.join(' · ');
}

const checkIcon = (pass) =>
  pass === true ? html`<span class="ci pass">${ic('check', { size: 14 })}<span class="sr-only">Pass</span></span>`
    : pass === false ? html`<span class="ci fail">${ic('x', { size: 14 })}<span class="sr-only">Fail</span></span>`
      : html`<span class="ci pending">${ic('clock', { size: 14 })}<span class="sr-only">Pending</span></span>`;

export function complianceBlock(c, { open = false } = {}) {
  const v = c.verdict;
  return html`
    <div class="stack">
      <div class="verdict ${v.tone}">${ic(v.tone === 'good' ? 'shield' : v.tone === 'critical' ? 'alert' : 'info', { size: 22 })}
        <div><strong>${v.title}</strong><p>${v.text}</p>
        ${v.fixes && v.fixes.length ? html`<ul class="mt-1" style="margin:6px 0 0;padding-left:18px">${v.fixes.map((f) => html`<li>${f}</li>`)}</ul>` : ''}</div>
      </div>
      ${c.scope.dwelling && c.scope.consumer ? html`<div>${c.paths.map((p) => html`
        <details class="path"${open || p.id === v.path ? raw(' open') : ''}>
          <summary>${p.eligible ? badge('good', p.pending ? 'Eligible*' : 'Eligible', 'check') : badge('critical', 'Not eligible', 'x')} ${p.title}<span class="ref">${p.ref}</span></summary>
          <ul class="checks">${p.checks.map((ch) => html`<li>${checkIcon(ch.pass)}<span>${ch.label}<small>${ch.detail}</small></span></li>`)}</ul>
        </details>`)}</div>` : ''}
      <ul class="checks">
        <li>${checkIcon(c.afr.pass)}<span><strong>IRS minimum rate (AFR)</strong><small>${c.afr.text}</small></span></li>
        <li>${checkIcon(!c.pricing.highCost && !c.pricing.hpml ? true : c.pricing.highCost ? false : null)}<span><strong>Rate vs. market</strong><small>${c.pricing.text}</small></span></li>
      </ul>
      ${c.notes.length ? html`<div class="stack-sm">${c.notes.map((n) => html`<div class="alert ${n.tone === 'neutral' ? 'neutral' : n.tone}" style="padding:10px 12px">${ic(n.tone === 'neutral' ? 'info' : 'alert', { size: 18 })}<div class="alert-body"><strong style="font-size:.88rem">${n.title}</strong><p style="font-size:.84rem">${n.text}</p></div></div>`)}</div>` : ''}
      <p class="xs muted mb-0">Guardrails, not legal advice. Based on 12 CFR 1026.36(a)(4)–(5), IRC §§ 483 and 1274 and ${getState().settings.afr.ruling}. Confirm with a real-estate attorney in your state.</p>
    </div>`;
}

export function propertyTypeLabel(p) {
  if (p.type === 'multi') return `${p.units || 2}-unit`;
  if (p.type === 'land') return `Land${p.acres ? ` · ${p.acres} acres` : ''}`;
  return PROPERTY_TYPES[p.type] || 'Property';
}
export function propertyFacts(p) {
  const bits = [propertyTypeLabel(p)];
  if (p.beds) bits.push(`${p.beds} bd`);
  if (p.baths) bits.push(`${p.baths} ba`);
  if (p.sqft) bits.push(`${p.sqft.toLocaleString('en-US')} sq ft`);
  return bits.join(' · ');
}

// Principal balance over the life of the loan: actual to date, projected after.
export function balanceSeries(loan, st) {
  const pts = [{ x: loan.terms.closingDate || addDays(loan.terms.firstDue, -45), y: loan.terms.principal, kind: 'start' }];
  for (const p of st.paid) pts.push({ x: p.paidDate < p.due && p.boarded ? p.due : p.due, y: p.balanceAfter, kind: 'paid', inst: p });
  let b = st.principalBalance;
  for (const m of st.unpaid) {
    b -= m.principal;
    pts.push({ x: m.due, y: Math.max(0, b), kind: 'projected', inst: m });
  }
  pts.sort((a, b2) => (a.x < b2.x ? -1 : a.x > b2.x ? 1 : 0));
  return pts;
}

const H_ICON = { ontime: 'check', grace: 'check', late: 'alert', late30: 'alert', open: 'clock', openlate: 'alert', open30: 'alert' };
const H_LABEL = { ontime: 'Paid on time', grace: 'Paid within grace period', late: 'Paid late', late30: 'Paid 30+ days late', open: 'Due, not yet paid', openlate: 'Past due', open30: '30+ days past due' };
export function historyStrip(st, n = 12) {
  const h = st.history.slice(-n);
  if (!h.length) return html`<p class="muted small mb-0">No payments due yet.</p>`;
  return html`<div class="history-strip" role="list" aria-label="Payment history, last ${h.length} installments">
    ${h.map((x) => html`<div class="hcell" role="listitem" title="${fmtDate(x.due)}: ${H_LABEL[x.status]}${x.paidDate ? ` (${fmtDate(x.paidDate)})` : ''}">
      <span class="hbox ${x.status}">${ic(H_ICON[x.status], { size: 15 })}<span class="sr-only">${fmtDate(x.due)}: ${H_LABEL[x.status]}</span></span>
      <span aria-hidden="true">${fmtDate(x.due, 'short').split(' ')[0]}</span>
    </div>`)}
  </div>
  <div class="legend mt-2"><span class="legend-item"><span class="hbox ontime" style="width:12px;height:12px;border-radius:3px"></span>On time</span><span class="legend-item"><span class="hbox late" style="width:12px;height:12px;border-radius:3px"></span>Late</span><span class="legend-item"><span class="hbox open" style="width:12px;height:12px;border-radius:3px"></span>Due now</span><span class="legend-item"><span class="hbox openlate" style="width:12px;height:12px;border-radius:3px"></span>Past due</span></div>`;
}

// Ledger rows for tables and CSV.
export function ledgerRows(loan, st) {
  const rows = [];
  for (const e of st.ledger) {
    const tx = e.tx || {};
    const a = e.alloc || {};
    if (e.kind === 'payment') {
      const inst = a.installments && a.installments.length ? `${a.installments.length > 1 ? 'Installments' : 'Installment'} ${a.installments.join(', ')}` : '';
      let desc = tx.applyTo === 'payoff' ? 'Payoff' : tx.applyTo === 'principal' ? 'Extra principal' : 'Payment';
      desc += ` · ${METHODS[tx.method] || 'Payment'}${tx.ref ? ` ${tx.ref}` : ''}`;
      rows.push({
        date: e.date, kind: 'payment', desc, sub: [inst, a.suspense ? `${money(a.suspense)} held in suspense` : '', a.fromSuspense ? `${money(a.fromSuspense)} from suspense` : '', a.credit ? `${money(a.credit)} overpayment` : '', a.payoff ? `${a.payoff.days} days per-diem interest` : '', tx.memo && !tx.memo.startsWith('Autopay') ? tx.memo : ''].filter(Boolean).join(' · '),
        amount: e.amount, interest: a.interest, principal: (a.principal || 0) + (a.extra || 0), escrow: a.escrow, fees: a.fees, balance: e.principalBalance, tone: 'in',
      });
    } else if (e.kind === 'payment_returned') {
      rows.push({ date: e.date, kind: 'returned', desc: `Returned payment · ${METHODS[tx.method] || ''}${tx.ref ? ` ${tx.ref}` : ''}`, sub: tx.memo || 'Not applied', amount: e.amount, balance: e.principalBalance, tone: 'void' });
    } else if (e.kind === 'late_fee') {
      rows.push({ date: e.date, kind: 'charge', desc: 'Late charge assessed', sub: `${fmtDate(e.installmentDue)} installment unpaid after grace period`, amount: e.amount, balance: e.principalBalance, tone: 'charge' });
    } else if (e.kind === 'fee') {
      rows.push({ date: e.date, kind: 'charge', desc: tx.kind === 'nsf' ? 'Returned-payment fee' : 'Charge', sub: tx.memo || '', amount: e.amount, balance: e.principalBalance, tone: 'charge' });
    } else if (e.kind === 'waiver') {
      rows.push({ date: e.date, kind: 'waiver', desc: 'Charge waived', sub: tx.memo || '', amount: e.amount, balance: e.principalBalance, tone: 'waiver' });
    } else if (e.kind === 'escrow_disbursement') {
      rows.push({ date: e.date, kind: 'escrow', desc: `Escrow disbursement · ${tx.category === 'tax' ? 'Property tax' : tx.category === 'insurance' ? 'Insurance' : 'Other'}`, sub: tx.payee || '', amount: e.amount, balance: e.principalBalance, escrowBalance: e.escrowBalance, tone: 'out' });
    } else if (e.kind === 'escrow_refund') {
      rows.push({ date: e.date, kind: 'escrow', desc: 'Escrow refund to borrower', sub: tx.memo || '', amount: e.amount, balance: e.principalBalance, tone: 'out' });
    } else if (e.kind === 'boarded') {
      rows.push({ date: e.date, kind: 'boarded', desc: `Loan boarded onto SteadyNote`, sub: `${e.count} prior payments imported from your records`, amount: 0, balance: e.principalBalance, tone: 'void' });
    }
  }
  return rows.reverse();
}

export function nextDueText(st) {
  if (st.paidOffDate) return `Paid off ${fmtDate(st.paidOffDate)}`;
  const m = st.nextInstallment;
  if (!m) return '—';
  return `${money(m.total)} · ${fmtDate(m.due)}`;
}

export function loanHeadline(loan) {
  return `${loan.borrower.name}`;
}

export function maturityText(loan, st) {
  const t = loan.terms;
  if (hasBalloon(t)) return `Balloon ${fmtDate(st.maturityDate, 'month')}`;
  return `Matures ${fmtDate(st.maturityDate, 'month')}`;
}

export function downloadFile(name, text, type = 'text/csv') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
export const csv = (rows) => rows.map((r) => r.map((v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}).join(',')).join('\n');
export const centsToStr = (c) => (c == null ? '' : (c / 100).toFixed(2));

export { installmentCount, money0 };
