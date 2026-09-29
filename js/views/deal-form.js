// Deal Builder: the terms form and live results panel, shared by the seller
// workspace (with property details) and the public calculator.
import { html, raw } from '../ui/html.js';
import { ic } from '../ui/icons.js';
import { field, moneyField, toggle, meter } from '../ui/components.js';
import { onLive } from '../ui/actions.js';
import { lineChart } from '../ui/charts.js';
import { amortize } from '../core/finance.js';
import { money, money0, moneyCompact, ratePct, fmtDate, durationLabel, parseMoneyInput, parseNum, dollarsInput, addMonths, firstOfNextMonth, localToday } from '../core/util.js';
import { PROPERTY_TYPES } from '../core/compliance.js';
import { getState } from '../data/store.js';
import { compliance, complianceBlock } from './shared.js';

export const STATES = ['AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'];
const AMORT = [[120, '10 years'], [180, '15 years'], [240, '20 years'], [300, '25 years'], [360, '30 years'], [480, '40 years']];
const BALLOON = [['', 'None (fully amortizing)'], [36, '3 years'], [60, '5 years'], [84, '7 years'], [120, '10 years'], [180, '15 years']];

export function blankDeal() {
  const s = getState();
  const st = s.profile.state || 'WA';
  return {
    id: null,
    code: null,
    status: 'draft',
    property: { address: '', city: '', state: st, zip: '', type: 'sfr', beds: 3, baths: 2, sqft: 1600, yearBuilt: '', lot: '', description: '', hue: Math.floor(Math.random() * 360) },
    terms: {
      salePrice: 35000000, downPct: 10, ratePct: 7.5, rateType: 'fixed', amortMonths: 360, balloonMonths: null,
      taxesAnnual: 360000, insuranceAnnual: 150000, hoaMonthly: 0, escrow: s.settings.defaults.escrow !== false,
      graceDays: s.settings.defaults.graceDays || 15, lateFee: { type: 'pct', pct: s.settings.defaults.lateFeePct || 5 }, occupancy: 'owner',
      minCredit: 620, minDownPct: 10,
    },
    screeningPaidBy: 'applicant',
  };
}

export function dealFormHTML(deal, { mode = 'app' } = {}) {
  const p = deal.property, t = deal.terms;
  const down = Math.round((t.salePrice * t.downPct) / 100);
  return html`
  <form class="card deal-form" data-live="deal-form" data-form="${mode === 'app' ? 'save-deal' : 'calc-save'}" novalidate>
    ${mode === 'app' ? html`
    <div class="form-section">
      <h3>Property</h3>
      <div class="form-grid">
        ${field({ label: 'Street address', name: 'address', value: p.address === 'New listing' ? '' : p.address, required: true, cls: 'full', autocomplete: 'street-address', placeholder: 'e.g. 1200 Oak St' })}
        ${field({ label: 'City', name: 'city', value: p.city, required: true })}
        <div class="form-grid" style="gap:12px">
          ${field({ label: 'State', name: 'state', type: 'select', value: p.state, options: STATES.map((s) => [s, s]) })}
          ${field({ label: 'ZIP', name: 'zip', value: p.zip, inputmode: 'numeric', maxlength: 10 })}
        </div>
        ${field({ label: 'Property type', name: 'type', type: 'select', value: p.type, options: Object.entries(PROPERTY_TYPES) })}
        <div class="form-grid g3" style="gap:12px">
          ${field({ label: 'Beds', name: 'beds', value: p.beds ?? '', inputmode: 'decimal' })}
          ${field({ label: 'Baths', name: 'baths', value: p.baths ?? '', inputmode: 'decimal' })}
          ${field({ label: 'Sq ft', name: 'sqft', value: p.sqft ?? '', inputmode: 'numeric' })}
        </div>
        ${field({ label: 'Listing description', name: 'description', type: 'textarea', value: p.description, cls: 'full', rows: 3, placeholder: 'What makes it a good home, and why you’re offering owner financing.' })}
      </div>
    </div>` : html`
    <div class="form-section">
      <h3>You & the property</h3>
      <div class="form-grid">
        ${field({ label: 'Selling as', name: 'sellerEntity', type: 'select', value: deal.sellerOverride?.entityType || 'individual', options: [['individual', 'An individual or couple'], ['trust', 'A trust'], ['estate', 'An estate'], ['llc', 'An LLC or company']] })}
        ${field({ label: 'Other seller-financed sales, last 12 months', name: 'sellerPrior', type: 'select', value: String(deal.sellerOverride?.financedLast12 ?? 0), options: [['0', 'None'], ['1', 'One'], ['2', 'Two'], ['3', 'Three or more']] })}
        ${field({ label: 'Property type', name: 'type', type: 'select', value: p.type, options: Object.entries(PROPERTY_TYPES) })}
        ${field({ label: 'State', name: 'state', type: 'select', value: p.state, options: STATES.map((s) => [s, s]) })}
      </div>
    </div>`}
    <div class="form-section">
      <h3>Price & down payment</h3>
      <div class="form-grid">
        ${moneyField({ label: 'Sale price', name: 'salePrice', value: dollarsInput(t.salePrice), required: true })}
        <div class="form-grid" style="gap:12px">
          ${field({ label: 'Down payment', name: 'downPct', value: +t.downPct.toFixed(2), suffix: '%', inputmode: 'decimal' })}
          ${moneyField({ label: 'Down ($)', name: 'downAmt', value: dollarsInput(down) })}
        </div>
      </div>
    </div>
    <div class="form-section">
      <h3>Note terms</h3>
      <div class="form-grid">
        ${field({ label: 'Interest rate', name: 'ratePct', value: t.ratePct, suffix: '%', inputmode: 'decimal', help: `30-yr market avg ${getState().settings.market.pmms30}%` })}
        ${field({ label: 'Amortization', name: 'amortMonths', type: 'select', value: t.amortMonths, options: AMORT })}
        ${field({ label: 'Balloon payment due after', name: 'balloonMonths', type: 'select', value: t.balloonMonths || '', options: BALLOON, help: 'A balloon shortens your wait for the full payoff.' })}
        ${field({ label: 'Buyer will', name: 'occupancy', type: 'select', value: t.occupancy || 'owner', options: [['owner', 'Live in the home'], ['investment', 'Rent it out (investor)']] })}
      </div>
    </div>
    <div class="form-section">
      <h3>Taxes, insurance & servicing</h3>
      <div class="form-grid">
        ${moneyField({ label: 'Property taxes / year', name: 'taxesAnnual', value: dollarsInput(t.taxesAnnual) })}
        ${moneyField({ label: 'Insurance / year', name: 'insuranceAnnual', value: dollarsInput(t.insuranceAnnual) })}
        ${moneyField({ label: 'HOA dues / month', name: 'hoaMonthly', value: dollarsInput(t.hoaMonthly || 0) })}
        <div class="field"><span class="field-label">Escrow</span>${toggle({ name: 'escrow', checked: t.escrow, label: 'Collect taxes & insurance', desc: 'Buyer pays them monthly; SteadyNote pays the bills.' })}</div>
        ${field({ label: 'Grace period', name: 'graceDays', value: t.graceDays ?? 15, suffix: 'days', inputmode: 'numeric' })}
        ${field({ label: 'Late charge', name: 'lateFeePct', value: t.lateFee?.pct ?? 5, suffix: '% of P&I', inputmode: 'decimal' })}
      </div>
    </div>
    ${mode === 'app' ? html`
    <div class="form-section">
      <h3>Buyer requirements (shown on your listing)</h3>
      <div class="form-grid">
        ${field({ label: 'Minimum credit score', name: 'minCredit', value: t.minCredit ?? '', inputmode: 'numeric', help: 'Guidance only; you decide.' })}
        ${field({ label: 'Minimum down payment', name: 'minDownPct', value: t.minDownPct ?? '', suffix: '%', inputmode: 'decimal' })}
        ${field({ label: 'Screening fee paid by', name: 'screeningPaidBy', type: 'select', value: deal.screeningPaidBy || 'applicant', options: [['applicant', 'Applicant ($49, typical)'], ['seller', 'Me (seller)']] })}
      </div>
    </div>` : ''}
    <div class="form-section btn-row wrap">
      ${mode === 'app'
        ? html`<button class="btn btn-primary" type="submit" name="intent" value="save">${ic('check', { size: 16 })} Save deal</button>
               ${deal.status === 'draft' ? html`<button class="btn btn-accent" type="submit" data-publish="1">${ic('send', { size: 16 })} Save & publish listing</button>` : ''}
               <a class="btn btn-ghost" href="${deal.id ? `#/app/deals/${deal.id}` : '#/app/deals'}">Cancel</a>`
        : html`<button class="btn btn-primary" type="submit">${ic('plus', { size: 16 })} Save as a deal in the demo</button><span class="small muted">Opens the seller workspace with these terms.</span>`}
    </div>
  </form>`;
}

// Read the form into a deal (property + terms), keeping unknown fields.
export function readDealForm(form, base) {
  const v = Object.fromEntries([...form.elements].filter((e) => e.name).map((e) => [e.name, e.type === 'checkbox' ? e.checked : e.value]));
  const price = parseMoneyInput(v.salePrice);
  const t = {
    ...base.terms,
    salePrice: price,
    downPct: Math.max(0, Math.min(100, parseNum(v.downPct, base.terms.downPct))),
    ratePct: Math.max(0, Math.min(30, parseNum(v.ratePct, base.terms.ratePct))),
    amortMonths: +v.amortMonths || base.terms.amortMonths,
    balloonMonths: v.balloonMonths ? +v.balloonMonths : null,
    occupancy: v.occupancy || 'owner',
    taxesAnnual: parseMoneyInput(v.taxesAnnual),
    insuranceAnnual: parseMoneyInput(v.insuranceAnnual),
    hoaMonthly: parseMoneyInput(v.hoaMonthly),
    escrow: !!v.escrow,
    graceDays: Math.max(0, Math.round(parseNum(v.graceDays, 15))),
    lateFee: { type: 'pct', pct: Math.max(0, parseNum(v.lateFeePct, 5)) },
  };
  if ('minCredit' in v) t.minCredit = v.minCredit ? Math.round(parseNum(v.minCredit)) : null;
  if ('minDownPct' in v) t.minDownPct = v.minDownPct ? parseNum(v.minDownPct) : null;
  const p = { ...base.property, type: v.type || base.property.type, state: v.state || base.property.state };
  for (const k of ['address', 'city', 'zip', 'description']) if (k in v) p[k] = v[k].trim();
  for (const k of ['beds', 'baths', 'sqft']) if (k in v) p[k] = v[k] === '' ? null : parseNum(v[k], null);
  const deal = { ...base, property: p, terms: t };
  if ('screeningPaidBy' in v) deal.screeningPaidBy = v.screeningPaidBy;
  if ('sellerEntity' in v) deal.sellerOverride = { entityType: v.sellerEntity, financedLast12: Number(v.sellerPrior) || 0 };
  return deal;
}

export function dealMath(deal) {
  const t = deal.terms;
  const down = Math.round((t.salePrice * t.downPct) / 100);
  const principal = Math.max(0, t.salePrice - down);
  const firstDue = addMonths(firstOfNextMonth(localToday()), 1);
  const a = amortize({ principal, ratePct: t.ratePct, amortMonths: t.amortMonths, balloonMonths: t.balloonMonths, firstDue });
  const taxes = Math.round((t.taxesAnnual || 0) / 12), ins = Math.round((t.insuranceAnnual || 0) / 12), hoa = t.hoaMonthly || 0;
  const piti = a.payment + taxes + ins + hoa;
  const incomeNeeded = Math.round((piti + 40000) / 0.43);
  return { down, principal, a, taxes, ins, hoa, piti, incomeNeeded, firstDue, totalReceived: down + a.rows.reduce((s, r) => s + r.payment, 0) };
}

export function dealResultsHTML(deal) {
  const t = deal.terms;
  const m = dealMath(deal);
  const s = getState();
  const c = compliance(deal);
  const valid = t.salePrice > 0 && m.principal > 0;
  if (!valid) return html`<div class="card"><p class="muted mb-0">Enter a sale price and a down payment under 100% to see the numbers.</p></div>`;
  return html`
  <div class="result-card">
    <div class="spread"><span class="small" style="color:#9fbcaf;font-weight:600">Buyer’s monthly payment</span>${t.escrow ? html`<span class="badge brand">${ic('shield', { size: 13 })}Escrowed</span>` : ''}</div>
    <div class="big-number mt-1">${money(m.a.payment)} <small style="color:#9fbcaf">principal & interest</small></div>
    <dl class="kv rows mt-2">
      <div><dt>Principal & interest</dt><dd>${money(m.a.payment)}</dd></div>
      <div><dt>Taxes + insurance${m.hoa ? ' + HOA' : ''}</dt><dd>${money(m.taxes + m.ins + m.hoa)}</dd></div>
      <div><dt><strong style="color:#fff">Total housing payment</strong></dt><dd>${money(m.piti)}</dd></div>
    </dl>
  </div>
  <div class="card">
    <div class="card-head"><div><h2 class="card-title">What you receive</h2><p class="card-sub">If every payment is made as scheduled.</p></div></div>
    <dl class="kv rows">
      <div><dt>Down payment at closing</dt><dd>${money0(m.down)}</dd></div>
      <div><dt>Amount you finance</dt><dd>${money0(m.principal)}</dd></div>
      <div><dt>Monthly payments (${m.a.installments}${m.a.balloonAmount ? ' incl. balloon' : ''})</dt><dd>${money0(m.a.rows.reduce((x, r) => x + r.payment, 0))}</dd></div>
      <div><dt>Interest you earn</dt><dd class="good-text">${money0(m.a.totalInterest)}</dd></div>
      ${m.a.balloonAmount ? html`<div><dt>Balloon due ${fmtDate(m.a.maturity, 'month')}</dt><dd>${money0(m.a.balloonAmount)}</dd></div>` : html`<div><dt>Paid off</dt><dd>${fmtDate(m.a.maturity, 'month')}</dd></div>`}
      <div><dt><strong>Total you collect</strong></dt><dd><strong>${money0(m.totalReceived)}</strong></dd></div>
    </dl>
    <p class="small muted mt-2 mb-0">Your note earns <strong>${ratePct(t.ratePct)}</strong>, versus the ${c.afr.rate}% ${c.afr.bucket}-term AFR (the IRS minimum for this term) and a ${s.settings.market.pmms30}% average 30-year mortgage.</p>
  </div>
  <div class="card">
    <div class="card-head"><div><h2 class="card-title">Balance over time</h2><p class="card-sub">Projected remaining principal${m.a.balloonAmount ? ', with the balloon payoff' : ''}.</p></div></div>
    <div class="deal-chart"></div>
  </div>
  <div class="card">
    <div class="card-head"><div><h2 class="card-title">Compliance check</h2><p class="card-sub">Based on your seller profile and these terms.</p></div>${ic('scale', { size: 20 })}</div>
    ${complianceBlock(c)}
  </div>
  <div class="card tint">
    <div class="card-head"><div><h2 class="card-title">Who can afford it</h2></div></div>
    <p class="small mb-1">At a 43% debt-to-income ratio (assuming $400/mo of other debts), a buyer needs about <strong>${money0(m.incomeNeeded * 12)}/yr</strong> gross income.</p>
    ${meter({ value: t.downPct, max: 30, marks: [{ at: 10, label: '10%' }, { at: 20, label: '20%' }], tone: t.downPct >= 10 ? 'good' : 'warning', label: 'Down payment percentage', text: `${t.downPct}% down` })}
    <p class="xs muted mt-3 mb-0">Sellers typically ask for 10–20% down. More equity means less risk if you ever have to take the property back.</p>
  </div>`;
}

export function mountDealResults(container, deal) {
  if (container._cleanup) { container._cleanup(); container._cleanup = null; }
  const el = container.querySelector('.deal-chart');
  if (!el) return;
  const m = dealMath(deal);
  if (!m.a.rows.length) return;
  const pts = [{ x: m.a.rows[0].due.slice(0, 8) + '01', y: m.principal }].concat(m.a.rows.map((r) => ({ x: r.due, y: r.balance, r })));
  pts[0].x = addMonths(m.a.rows[0].due, -1);
  const markers = [];
  if (m.a.balloonAmount) {
    const before = m.a.rows[m.a.rows.length - 1];
    markers.push({ x: before.due, y: before.principal, label: `Balloon ${moneyCompact(m.a.balloonBalance)}` });
  }
  const cleanup = lineChart(el, {
    points: pts,
    height: 200,
    label: 'Projected principal balance',
    markers,
    tip: (p) => ({ title: p.r ? `Payment ${p.r.n} · ${fmtDate(p.x)}` : 'At closing', rows: p.r ? [{ label: 'balance after', value: money0(p.y), color: 'var(--series-1)' }, { label: 'interest', value: money(p.r.interest) }, { label: 'principal', value: money(p.r.principal) }] : [{ label: 'financed', value: money0(p.y), color: 'var(--series-1)' }] }),
  });
  container._cleanup = cleanup;
}

// Live recalculation for any .deal-builder with a form + results region.
onLive({
  'deal-form': (form, e) => {
    const builder = form.closest('.deal-builder');
    if (!builder || !builder._base) return;
    const n = e.target.name;
    const price = parseMoneyInput(form.elements.salePrice.value);
    if (n === 'downPct' || n === 'salePrice') {
      const pct = parseNum(form.elements.downPct.value, 0);
      form.elements.downAmt.value = dollarsInput(Math.round((price * pct) / 100));
    } else if (n === 'downAmt') {
      const amt = parseMoneyInput(form.elements.downAmt.value);
      if (price > 0) form.elements.downPct.value = +((amt / price) * 100).toFixed(2);
    }
    const deal = readDealForm(form, builder._base);
    builder._deal = deal;
    clearTimeout(builder._t);
    builder._t = setTimeout(() => {
      const res = builder.querySelector('.deal-results');
      res.innerHTML = String(dealResultsHTML(deal));
      mountDealResults(res, deal);
      const say = builder.querySelector('[data-announce]');
      const m = dealMath(deal);
      if (say && m.principal > 0) say.textContent = `Monthly principal and interest ${money(m.a.payment)}. ${compliance(deal).verdict.title}.`;
    }, 250);
  },
});

export function builderLayout(deal, mode) {
  return html`<div class="grid g-main deal-builder">
    <div>${dealFormHTML(deal, { mode })}</div>
    <div class="stack deal-results sticky">${dealResultsHTML(deal)}</div>
    <p class="sr-only" aria-live="polite" data-announce></p>
  </div>`;
}

export function mountBuilder(main, deal) {
  const b = main.querySelector('.deal-builder');
  if (!b) return null;
  b._base = deal;
  b._deal = deal;
  const res = b.querySelector('.deal-results');
  mountDealResults(res, deal);
  return () => { if (res._cleanup) res._cleanup(); };
}

export { raw, durationLabel };
