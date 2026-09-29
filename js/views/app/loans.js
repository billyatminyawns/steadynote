import { html, raw } from '../../ui/html.js';
import { ic } from '../../ui/icons.js';
import { card, stat, statusBadge, empty, field, moneyField, toggle, toast } from '../../ui/components.js';
import { onSubmit, onLive, readForm, showErrors } from '../../ui/actions.js';
import { getState, update, loanStates, today, logActivity } from '../../data/store.js';
import { money, money0, moneyCompact, fmtDate, ratePct, sum, uid, parseMoneyInput, parseNum, dollarsInput, addMonths, firstOfNextMonth, daysBetween } from '../../core/util.js';
import { pmt, amortize } from '../../core/finance.js';
import { PROPERTY_TYPES } from '../../core/compliance.js';
import { STATES } from '../deal-form.js';

const ATTN = ['grace', 'late', 'd30', 'd60', 'd90', 'default'];

export const loansView = {
  layout: 'app',
  nav: 'loans',
  title: 'Loans',
  render(ctx) {
    const s = getState();
    const st = loanStates();
    const f = ctx.query.f || 'all';
    const active = s.loans.filter((l) => !st[l.id].paidOffDate);
    const bal = sum(active, (l) => st[l.id].principalBalance);
    const monthly = sum(active, (l) => st[l.id].payment);
    const behind = active.filter((l) => ['late', 'd30', 'd60', 'd90', 'default'].includes(st[l.id].status));
    const list = s.loans.filter((l) => {
      const x = st[l.id];
      if (f === 'current') return x.status === 'current';
      if (f === 'attention') return ATTN.includes(x.status);
      if (f === 'paid') return !!x.paidOffDate;
      return true;
    });
    const n = (pred) => s.loans.filter((l) => pred(st[l.id])).length;
    const chip = (id, label, count) => html`<a class="chip" href="#/app/loans?f=${id}"${f === id ? raw(' aria-current="true"') : ''}>${label}<span class="n">${count}</span></a>`;
    return html`
    <div class="page-head">
      <div><h1>Loans</h1><p>Every note you hold, serviced automatically.</p></div>
      <a class="btn btn-primary" href="#/app/loans/new">${ic('upload', { size: 16 })} Board an existing note</a>
    </div>
    <div class="stats mb-3">
      ${stat({ label: 'Principal outstanding', value: moneyCompact(bal), sub: `${active.length} active loan${active.length === 1 ? '' : 's'}`, icon: 'bank' })}
      ${stat({ label: 'Scheduled P&I per month', value: money0(monthly), sub: 'excluding escrow', icon: 'wallet' })}
      ${stat({ label: 'On autopay', value: `${active.filter((l) => l.autopay?.enabled).length} of ${active.length}`, sub: 'collected automatically', icon: 'repeat' })}
      ${stat({ label: 'Behind on payments', value: String(behind.length), sub: behind.length ? `${money(sum(behind, (l) => st[l.id].amountDue))} owed` : 'Everyone is current', tone: behind.length ? 'bad' : 'good', icon: 'alert' })}
    </div>
    <div class="chip-row mb-2" role="navigation" aria-label="Filter loans">
      ${chip('all', 'All', s.loans.length)}${chip('current', 'Current', n((x) => x.status === 'current'))}${chip('attention', 'Needs attention', n((x) => ATTN.includes(x.status)))}${chip('paid', 'Paid off', n((x) => !!x.paidOffDate))}
    </div>
    ${list.length ? html`<div class="card flush"><div class="table-wrap"><table class="tbl">
      <thead><tr><th>Loan</th><th>Property</th><th class="num">Balance</th><th class="num">Rate</th><th class="num">Payment</th><th>Next due</th><th>Status</th></tr></thead>
      <tbody>${list.map((l) => {
        const x = st[l.id];
        return html`<tr>
          <td><a class="cell-main" href="#/app/loans/${l.id}">${l.borrower.name}</a><span class="cell-sub">${l.number}${l.autopay?.enabled ? ' · autopay' : ''}</span></td>
          <td>${l.property.address}<span class="cell-sub">${l.property.city}, ${l.property.state}</span></td>
          <td class="num">${x.paidOffDate ? '—' : money0(x.principalBalance)}</td>
          <td class="num">${ratePct(l.terms.ratePct)}</td>
          <td class="num">${money(x.payment)}${l.escrow?.enabled ? html`<span class="cell-sub">+ ${money(l.escrow.monthly)} escrow</span>` : ''}</td>
          <td class="nowrap">${x.paidOffDate ? html`<span class="muted">Paid off ${fmtDate(x.paidOffDate)}</span>` : x.nextInstallment ? fmtDate(x.nextInstallment.due) : '—'}</td>
          <td>${statusBadge(x.status)}</td></tr>`;
      })}</tbody></table></div></div>` : html`<div class="card">${empty({ icon: 'file', title: 'No loans here', text: 'Board a note you already hold, or close a deal to start servicing.', action: html`<a class="btn btn-primary" href="#/app/loans/new">Board an existing note</a>` })}</div>`}`;
  },
};

// ---------------- board an existing note ----------------
function boardDefaults() {
  const t = today();
  const close = addMonths(t, -14);
  const firstDue = addMonths(firstOfNextMonth(close), 1);
  return { closingDate: close, firstDue };
}

function boardPreview(form) {
  const v = readForm(form);
  const price = parseMoneyInput(v.salePrice), down = parseMoneyInput(v.downPayment);
  const principal = price - down;
  const rate = parseNum(v.ratePct, 0), amort = +v.amortMonths || 360, balloon = v.balloonMonths ? +v.balloonMonths : null;
  const out = form.querySelector('[data-board-preview]');
  if (!out) return;
  if (!(principal > 0) || !v.firstDue) { out.innerHTML = '<p class="muted small mb-0">Enter the price, down payment and first payment date.</p>'; return; }
  const a = amortize({ principal, ratePct: rate, amortMonths: amort, balloonMonths: balloon, firstDue: v.firstDue });
  const paidN = Math.max(0, Math.min(a.rows.length, Math.round(parseNum(v.paidCount, 0))));
  const bal = paidN ? a.rows[paidN - 1].balance : principal;
  const next = a.rows[paidN];
  const expected = a.rows.filter((r) => r.due < today()).length;
  out.innerHTML = String(html`<dl class="kv rows">
    <div><dt>Principal & interest</dt><dd>${money(a.payment)}</dd></div>
    <div><dt>Balance after ${paidN} payment${paidN === 1 ? '' : 's'}</dt><dd>${money(bal)}</dd></div>
    <div><dt>Next installment</dt><dd>${next ? `${fmtDate(next.due)} · ${money(next.payment)}` : 'Paid off'}</dd></div>
    ${a.balloonAmount ? html`<div><dt>Balloon</dt><dd>${money0(a.balloonAmount)} · ${fmtDate(a.maturity, 'month')}</dd></div>` : ''}
  </dl>${paidN < expected ? html`<p class="small warn-text mt-1 mb-0">${ic('alert', { size: 14 })} ${expected} installments have come due. With ${paidN} paid, this loan boards as past due.</p>` : ''}`);
}

onLive({ 'board-form': (form) => boardPreview(form) });

export const boardLoanView = {
  layout: 'app',
  nav: 'loans',
  title: 'Board an existing note',
  render() {
    const s = getState();
    const d = boardDefaults();
    const expected = amortize({ principal: 27000000, ratePct: 7, amortMonths: 360, firstDue: d.firstDue }).rows.filter((r) => r.due < today()).length;
    return html`
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/app/loans">Loans</a>${ic('chevronRight', { size: 14 })}<span>Board an existing note</span></nav>
    <div class="page-head"><div><h1>Board an existing note</h1><p>Already carrying a note? Enter the original terms and how many payments have been made. SteadyNote rebuilds the schedule and takes over from the next payment.</p></div></div>
    <form class="grid g-main" data-form="board-loan" data-live="board-form" novalidate>
      <div class="card">
        <div class="form-section"><h3>Borrower</h3><div class="form-grid">
          ${field({ label: 'Borrower name(s)', name: 'name', required: true, cls: 'full', placeholder: 'e.g. Alex & Sam Rivera' })}
          ${field({ label: 'Email', name: 'email', type: 'email', autocomplete: 'off' })}
          ${field({ label: 'Phone', name: 'phone', type: 'tel', autocomplete: 'off' })}
        </div></div>
        <div class="form-section"><h3>Property</h3><div class="form-grid">
          ${field({ label: 'Street address', name: 'address', required: true, cls: 'full' })}
          ${field({ label: 'City', name: 'city', required: true })}
          <div class="form-grid" style="gap:12px">${field({ label: 'State', name: 'state', type: 'select', value: s.profile.state || 'WA', options: STATES.map((x) => [x, x]) })}${field({ label: 'ZIP', name: 'zip', inputmode: 'numeric' })}</div>
          ${field({ label: 'Property type', name: 'type', type: 'select', value: 'sfr', options: Object.entries(PROPERTY_TYPES) })}
          ${field({ label: 'Buyer', name: 'occupancy', type: 'select', value: 'owner', options: [['owner', 'Lives in the home'], ['investment', 'Rents it out']] })}
        </div></div>
        <div class="form-section"><h3>Original note terms</h3><div class="form-grid">
          ${moneyField({ label: 'Sale price', name: 'salePrice', value: dollarsInput(30000000), required: true })}
          ${moneyField({ label: 'Down payment', name: 'downPayment', value: dollarsInput(3000000), required: true })}
          ${field({ label: 'Interest rate', name: 'ratePct', value: '7', suffix: '%', inputmode: 'decimal', required: true })}
          ${field({ label: 'Amortization', name: 'amortMonths', type: 'select', value: 360, options: [[120, '10 years'], [180, '15 years'], [240, '20 years'], [300, '25 years'], [360, '30 years']] })}
          ${field({ label: 'Balloon', name: 'balloonMonths', type: 'select', value: '', options: [['', 'None'], [36, '3 years'], [60, '5 years'], [84, '7 years'], [120, '10 years']] })}
          ${field({ label: 'Closing date', name: 'closingDate', type: 'date', value: d.closingDate, required: true })}
          ${field({ label: 'First payment was due', name: 'firstDue', type: 'date', value: d.firstDue, required: true })}
          ${field({ label: 'Payments made so far', name: 'paidCount', value: String(expected), inputmode: 'numeric', help: 'Installments fully paid before today. We’ll import them as history.' })}
        </div></div>
        <div class="form-section"><h3>Escrow & servicing</h3><div class="form-grid">
          <div class="full">${toggle({ name: 'escrow', label: 'I collect taxes & insurance (escrow)', desc: 'Adds Servicing Complete features for this loan.' })}</div>
          ${moneyField({ label: 'Property taxes / year', name: 'taxesAnnual', value: '' })}
          ${moneyField({ label: 'Insurance / year', name: 'insuranceAnnual', value: '' })}
          ${moneyField({ label: 'Current escrow balance', name: 'escrowBalance', value: '' })}
          ${field({ label: 'Grace period', name: 'graceDays', value: '15', suffix: 'days', inputmode: 'numeric' })}
          ${field({ label: 'Late charge', name: 'lateFeePct', value: '5', suffix: '% of P&I', inputmode: 'decimal' })}
          <div class="full">${toggle({ name: 'invite', label: 'Invite the borrower to the portal and autopay', checked: true })}</div>
        </div></div>
      </div>
      <div class="stack sticky">
        <div class="card"><div class="card-head"><h2 class="card-title">Schedule check</h2></div><div data-board-preview></div></div>
        <button type="submit" class="btn btn-primary btn-lg">${ic('upload', { size: 18 })} Board loan</button>
        <p class="xs muted">You can record past-due payments, charges and escrow activity after boarding.</p>
      </div>
    </form>`;
  },
  mount(main) {
    const f = main.querySelector('[data-form="board-loan"]');
    if (f) boardPreview(f);
  },
};

onSubmit({
  'board-loan': (form) => {
    const v = readForm(form);
    const price = parseMoneyInput(v.salePrice), down = parseMoneyInput(v.downPayment);
    const rate = parseNum(v.ratePct, NaN);
    const errors = {};
    if (!v.name.trim()) errors.name = 'Enter the borrower’s name.';
    if (!v.address.trim()) errors.address = 'Enter the property address.';
    if (!v.city.trim()) errors.city = 'Enter the city.';
    if (!(price > 0)) errors.salePrice = 'Enter the sale price.';
    if (!(down >= 0 && down < price)) errors.downPayment = 'Down payment must be less than the price.';
    if (!(rate >= 0 && rate <= 30)) errors.ratePct = 'Enter a rate between 0 and 30%.';
    if (!v.closingDate) errors.closingDate = 'Enter the closing date.';
    if (!v.firstDue || v.firstDue <= v.closingDate) errors.firstDue = 'First payment must be after closing.';
    if (!showErrors(form, errors)) return;
    const principal = price - down;
    const amort = +v.amortMonths, balloon = v.balloonMonths ? +v.balloonMonths : null;
    const N = balloon && balloon < amort ? balloon : amort;
    const paid = Math.max(0, Math.min(N, Math.round(parseNum(v.paidCount, 0))));
    const id = uid('ln');
    const escrowOn = !!v.escrow;
    const taxes = parseMoneyInput(v.taxesAnnual), ins = parseMoneyInput(v.insuranceAnnual);
    update((s) => {
      let n = 1001;
      while (s.loans.some((l) => l.number === `SN-${n}`)) n++;
      s.loans.push({
        id,
        number: `SN-${n}`,
        createdAt: today(),
        plan: escrowOn ? 'complete' : 'essentials',
        borrower: { name: v.name.trim(), first: v.name.trim().split(/\s+/)[0], email: v.email.trim(), phone: v.phone.trim(), tinOnFile: false },
        property: { address: v.address.trim(), city: v.city.trim(), state: v.state, zip: v.zip.trim(), type: v.type, occupancy: v.occupancy, hue: Math.floor(Math.random() * 360) },
        terms: { salePrice: price, downPayment: down, principal, ratePct: rate, rateType: 'fixed', amortMonths: amort, balloonMonths: balloon, closingDate: v.closingDate, firstDue: v.firstDue, payment: pmt(principal, rate, amort), graceDays: Math.round(parseNum(v.graceDays, 15)), lateFee: { type: 'pct', pct: parseNum(v.lateFeePct, 5) }, escrow: escrowOn, boardedPaid: paid },
        escrow: escrowOn ? { enabled: true, monthly: Math.round((taxes + ins) / 12), startBalance: parseMoneyInput(v.escrowBalance), taxesAnnual: taxes, insuranceAnnual: ins, taxDueMonths: [4, 10], insuranceMonth: +v.closingDate.slice(5, 7) } : { enabled: false },
        autopay: { enabled: false, invited: !!v.invite },
        insurance: null,
        tax: { adjustedBasis: null, sellingExpenses: null },
        transactions: [],
        notes: [{ date: today(), text: `Boarded with ${paid} prior payment${paid === 1 ? '' : 's'} imported.` }],
        release: null,
      });
      logActivity(`Existing note boarded: ${v.name.trim()}`, `#/app/loans/${id}`);
    });
    toast('Loan boarded');
    location.hash = `#/app/loans/${id}`;
  },
});
