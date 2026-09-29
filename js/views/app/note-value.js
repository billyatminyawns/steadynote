// What would an investor pay for this note? Risk-adjusted yield → PV of the
// remaining scheduled cash flows (full sale or the next N payments).
import { html } from '../../ui/html.js';
import { ic } from '../../ui/icons.js';
import { card, stat, empty, field, toast, alertBox } from '../../ui/components.js';
import { onLive, onAction } from '../../ui/actions.js';
import { getState, loanStates, today, loanById } from '../../data/store.js';
import { money0, money, pct, ratePct, fmtDate, monthsBetween, clamp, durationLabel } from '../../core/util.js';
import { presentValue } from '../../core/finance.js';
import { hasBalloon } from '../../core/servicing.js';

let sel = { loanId: null, yieldPct: null, mode: 'full', count: 60 };

export function yieldFactors(loan, st) {
  const f = [];
  const add = (label, bump, why) => f.push({ label, bump, why });
  add('Base yield for performing, owner-financed notes', 8.0, 'Starting point before adjustments');
  const seasoning = st.paidCount;
  add('Seasoning', seasoning < 12 ? 1.0 : seasoning < 24 ? 0.5 : 0, `${seasoning} payments made${seasoning < 12 ? ' (buyers prefer 12+)' : ''}`);
  const late = ['late', 'd30', 'd60', 'd90', 'default'].includes(st.status);
  add('Payment history', late ? 2.0 : st.onTimeRate < 0.9 ? 0.75 : 0, late ? `Currently ${st.dpd} days past due` : `${pct(st.onTimeRate * 100, 0)} on time`);
  const dp = loan.terms.salePrice ? (loan.terms.downPayment / loan.terms.salePrice) * 100 : 0;
  add('Borrower equity', dp < 10 ? 1.5 : dp < 20 ? 0.5 : 0, `${dp.toFixed(0)}% down at purchase`);
  add('Collateral type', loan.property.type === 'land' ? 1.5 : loan.property.type === 'multi' ? 0.25 : 0, loan.property.type === 'land' ? 'Vacant land is harder to resell' : loan.property.type === 'multi' ? 'Small multifamily' : 'Owner-occupied home');
  const remaining = st.unpaid.length;
  add('Time to payoff', hasBalloon(loan.terms) && remaining <= 60 ? -0.25 : remaining > 240 ? 0.5 : 0, hasBalloon(loan.terms) ? `Balloon in ${durationLabel(remaining)}` : `${durationLabel(remaining)} remaining`);
  const y = clamp(f.reduce((s, x) => s + x.bump, 0), 6.5, 16);
  return { factors: f, yieldPct: Math.round(y * 4) / 4 };
}

function flows(loan, st, count) {
  const t = today();
  const list = st.unpaid.map((m) => ({ t: Math.max(1, monthsBetween(t, m.due)), amount: m.pi }));
  return count ? list.slice(0, count) : list;
}

function valuation(loan, st) {
  const y = sel.yieldPct;
  const all = flows(loan, st, 0);
  const full = presentValue(all, y);
  const part = sel.mode === 'partial' ? presentValue(all.slice(0, sel.count), y) : null;
  const upb = st.principalBalance;
  const scheduled = all.reduce((s, x) => s + x.amount, 0);
  return { all, full, part, upb, scheduled, discount: upb ? 1 - full / upb : 0 };
}

function outputHTML(loan, st) {
  const v = valuation(loan, st);
  const keepCount = Math.max(0, v.all.length - sel.count);
  return html`
    <div class="stats s3">
      ${stat({ label: 'Unpaid principal', value: money0(v.upb), sub: `${v.all.length} scheduled payments left`, icon: 'bank' })}
      ${stat({ label: sel.mode === 'full' ? 'Estimated sale price' : `Price for the next ${sel.count} payments`, value: money0(Math.round(sel.mode === 'full' ? v.full : v.part)), sub: sel.mode === 'full' ? `${pct(v.discount * 100, 1)} ${v.discount >= 0 ? 'discount to' : 'premium over'} balance` : `You keep payments ${sel.count + 1}–${v.all.length}`, icon: 'handCoins' })}
      ${stat({ label: 'Investor yield', value: ratePct(sel.yieldPct), sub: `vs. ${ratePct(loan.terms.ratePct)} note rate`, icon: 'percent' })}
    </div>
    ${sel.mode === 'partial' ? html`<div class="mt-2">${alertBox({ tone: 'info', title: 'Partial sale', text: `You get cash today for the next ${sel.count} payments; the investor collects them, then payments ${keepCount ? `${sel.count + 1} through ${v.all.length}` : ''} revert to you. Partials usually get better pricing than a full sale because the investor’s risk window is shorter.` })}</div>` : ''}
    <div class="table-wrap card flush mt-2"><table class="tbl compact">
      <thead><tr><th>Investor yield</th><th class="num">Full note</th>${sel.mode === 'partial' ? html`<th class="num">Next ${sel.count} payments</th>` : ''}<th class="num">vs. balance</th></tr></thead>
      <tbody>${[8, 9, 10, 11, 12, 13].map((yy) => { const full = presentValue(v.all, yy); return html`<tr class="${yy === Math.round(sel.yieldPct) ? 'hl' : ''}"><td>${yy}%</td><td class="num">${money0(Math.round(full))}</td>${sel.mode === 'partial' ? html`<td class="num">${money0(Math.round(presentValue(v.all.slice(0, sel.count), yy)))}</td>` : ''}<td class="num">${pct((full / v.upb) * 100, 0)}</td></tr>`; })}</tbody>
    </table></div>`;
}

export const noteValueView = {
  layout: 'app',
  nav: 'note-value',
  title: 'Note value',
  render() {
    const s = getState();
    const st = loanStates();
    const active = s.loans.filter((l) => !st[l.id].paidOffDate);
    if (!active.length) return html`<div class="page-head"><div><h1>Note value</h1></div></div>${card({ body: empty({ icon: 'trending', title: 'No active notes', text: 'Once you hold a note, see what investors would pay for it here.' }) })}`;
    if (!sel.loanId || !active.some((l) => l.id === sel.loanId)) { sel.loanId = active[0].id; sel.yieldPct = null; }
    const loan = loanById(sel.loanId);
    const x = st[loan.id];
    const yf = yieldFactors(loan, x);
    if (sel.yieldPct == null) sel.yieldPct = yf.yieldPct;
    return html`
    <div class="page-head"><div><h1>Note value</h1><p>What your note is worth to an investor today, if you ever want a lump sum instead of monthly payments.</p></div></div>
    <div class="grid g-main-r">
      <form class="card stack" data-live="note-value">
        ${field({ label: 'Note', name: 'loanId', type: 'select', value: sel.loanId, options: active.map((l) => [l.id, `${l.number} · ${l.borrower.name}`]) })}
        <fieldset class="seg-field"><legend>Sell</legend><div class="seg">
          <label class="seg-opt"><input type="radio" name="mode" value="full"${sel.mode === 'full' ? ' checked' : ''}><span>Whole note</span></label>
          <label class="seg-opt"><input type="radio" name="mode" value="partial"${sel.mode === 'partial' ? ' checked' : ''}><span>Next N payments</span></label>
        </div></fieldset>
        <div class="field ${sel.mode === 'partial' ? '' : 'hide'}" data-partial><label for="nv-count">Payments to sell: <strong class="num" data-out="count">${sel.count}</strong></label><input id="nv-count" type="range" name="count" min="12" max="${Math.max(12, x.unpaid.length)}" step="6" value="${Math.min(sel.count, x.unpaid.length)}" style="accent-color:var(--brand)"></div>
        <div class="field"><label for="nv-yield">Investor yield: <strong class="num" data-out="yield">${sel.yieldPct}%</strong></label><input id="nv-yield" type="range" name="yieldPct" min="6" max="16" step="0.25" value="${sel.yieldPct}" style="accent-color:var(--brand)"><p class="help">Our estimate for this note is ${yf.yieldPct}%. Drag to see other offers.</p></div>
        <div>
          <h3 class="small mb-1">How we estimated ${yf.yieldPct}%</h3>
          <dl class="kv rows">${yf.factors.map((f) => html`<div><dt>${f.label}<span class="cell-sub">${f.why}</span></dt><dd>${f.bump > 0 ? '+' : ''}${f.bump.toFixed(2)}%</dd></div>`)}</dl>
        </div>
      </form>
      <div class="stack-lg">
        <div class="nv-out">${outputHTML(loan, x)}</div>
        ${card({ title: 'Selling a note', body: html`<ul class="checklist" style="margin-top:0">
          <li>${ic('check')}<span><strong>Investors pay less than the balance</strong> when your note rate is below their target yield. Seasoning, a clean payment history and a bigger down payment all narrow the discount.</span></li>
          <li>${ic('check')}<span><strong>Partials</strong> sell a block of payments and return the rest to you, often the best of both worlds.</span></li>
          <li>${ic('check')}<span><strong>SteadyNote’s ledger</strong> is the payment history investors ask for, which is one reason serviced notes sell faster.</span></li>
        </ul>
        <button type="button" class="btn btn-primary" data-action="request-offers">${ic('send', { size: 16 })} Request offers from note buyers</button>
        <p class="xs muted mt-1 mb-0">Marketplace fee: 2% of the sale price, paid at closing. Estimates are illustrative.</p>` })}
      </div>
    </div>`;
  },
};

onLive({
  'note-value': (form, e) => {
    const n = e.target.name;
    if (n === 'loanId') { sel.loanId = e.target.value; sel.yieldPct = null; document.dispatchEvent(new CustomEvent('sn:rerender')); return; }
    if (n === 'mode') sel.mode = e.target.value;
    if (n === 'count') sel.count = Number(e.target.value);
    if (n === 'yieldPct') sel.yieldPct = Number(e.target.value);
    form.querySelector('[data-partial]').classList.toggle('hide', sel.mode !== 'partial');
    const oy = form.querySelector('[data-out="yield"]'); if (oy) oy.textContent = `${sel.yieldPct}%`;
    const oc = form.querySelector('[data-out="count"]'); if (oc) oc.textContent = String(sel.count);
    const loan = loanById(sel.loanId);
    const st = loanStates()[loan.id];
    document.querySelector('.nv-out').innerHTML = String(outputHTML(loan, st));
  },
});

onAction({
  'request-offers': () => toast('Thanks! Offers from vetted note buyers are coming soon (demo).', 'info'),
});

export { money, fmtDate };
