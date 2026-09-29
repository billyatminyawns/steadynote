// Business model page: the pitch, revenue streams and an interactive model.
import { html, raw } from '../../ui/html.js';
import { ic } from '../../ui/icons.js';
import { onLive, onAction } from '../../ui/actions.js';
import { stackedColumns, legend } from '../../ui/charts.js';
import { PRICING } from '../../core/pricing.js';
import { getState } from '../../data/store.js';
import { money0, moneyCompact, fmtDate, num } from '../../core/util.js';

const DEFAULTS = { listings: 40, applicants: 4, conversion: 55, complete: 45, addon: 60, growth: 6, churn: 1.2 };
let model = { ...DEFAULTS };

// 36-month cohort model. Listings grow monthly; each listing brings applicants
// (screening revenue), converts to a loan at `conversion`, and loans pay a
// monthly servicing fee until they churn (payoff/refi/sale).
function runModel(m) {
  const months = [];
  let loans = 0;
  let listings = m.listings;
  const essentials = PRICING.plans.find((p) => p.id === 'essentials').price / 100;
  const complete = PRICING.plans.find((p) => p.id === 'complete').price / 100;
  const blended = essentials * (1 - m.complete / 100) + complete * (m.complete / 100);
  const docs = PRICING.addons.find((a) => a.id === 'docs').price / 100;
  const payoff = PRICING.addons.find((a) => a.id === 'payoff').price / 100;
  const screenFee = PRICING.screening.price / 100;
  for (let i = 0; i < 36; i++) {
    const newLoans = listings * (m.conversion / 100);
    const churned = loans * (m.churn / 100);
    loans = loans + newLoans - churned;
    const screening = listings * m.applicants * screenFee * 0.72; // net of bureau/verification costs
    const servicing = loans * blended;
    const addons = newLoans * docs * (m.addon / 100) * 0.35 + churned * payoff; // docs revenue share + payoff/release
    months.push({ i, listings, newLoans, loans, screening, servicing, addons, total: screening + servicing + addons });
    listings *= 1 + m.growth / 100;
  }
  const last = months[months.length - 1];
  const years = [0, 1, 2].map((y) => {
    const ms = months.slice(y * 12, y * 12 + 12);
    return { label: `Year ${y + 1}`, screening: ms.reduce((s, x) => s + x.screening, 0), servicing: ms.reduce((s, x) => s + x.servicing, 0), addons: ms.reduce((s, x) => s + x.addons, 0) };
  });
  const lifeMonths = m.churn > 0 ? 100 / m.churn : 120;
  return { months, last, years, arr: last.total * 12, loans: last.loans, blended, ltv: blended * Math.min(lifeMonths, 120) };
}

function outputs(r) {
  return html`
    <div class="stats s3">
      <div class="stat"><div class="stat-label">Run-rate revenue, month 36</div><div class="stat-value">${moneyCompact(Math.round(r.arr * 100))}</div><div class="stat-sub">annualized</div></div>
      <div class="stat"><div class="stat-label">Loans under servicing</div><div class="stat-value">${num(Math.round(r.loans))}</div><div class="stat-sub">${money0(Math.round(r.blended * 100))} blended per loan / month</div></div>
      <div class="stat"><div class="stat-label">Servicing lifetime value</div><div class="stat-value">${money0(Math.round(r.ltv * 100))}</div><div class="stat-sub">per loan, before add-ons</div></div>
    </div>
    <div class="card mt-2">
      <div class="card-head"><div><h3 class="card-title">Revenue by stream</h3><p class="card-sub">Annual totals from the model.</p></div></div>
      ${raw(legend([{ label: 'Servicing subscriptions', color: 'var(--series-1)' }, { label: 'Buyer screening (net)', color: 'var(--series-2)' }, { label: 'Add-ons', color: 'var(--series-3)' }]))}
      <div class="biz-chart"></div>
      <details class="table-view"><summary>View as table</summary>
        <div class="table-wrap"><table class="tbl compact"><thead><tr><th>Year</th><th class="num">Servicing</th><th class="num">Screening</th><th class="num">Add-ons</th><th class="num">Total</th></tr></thead>
        <tbody>${r.years.map((y) => html`<tr><td>${y.label}</td><td class="num">${money0(Math.round(y.servicing * 100))}</td><td class="num">${money0(Math.round(y.screening * 100))}</td><td class="num">${money0(Math.round(y.addons * 100))}</td><td class="num">${money0(Math.round((y.servicing + y.screening + y.addons) * 100))}</td></tr>`)}</tbody></table></div>
      </details>
    </div>`;
}

function mountChart(root, r) {
  const el = root.querySelector('.biz-chart');
  if (!el) return null;
  return stackedColumns(el, {
    categories: r.years.map((y) => ({ label: y.label })),
    series: [
      { name: 'Servicing', color: 'var(--series-1)', values: r.years.map((y) => Math.round(y.servicing * 100)) },
      { name: 'Screening', color: 'var(--series-2)', values: r.years.map((y) => Math.round(y.screening * 100)) },
      { name: 'Add-ons', color: 'var(--series-3)', values: r.years.map((y) => Math.round(y.addons * 100)) },
    ],
    height: 220,
    label: 'Annual revenue by stream',
    highlight: [0, 1, 2],
    yFormat: (v) => moneyCompact(v),
  });
}

const slider = (name, label, min, max, step, suffix, help) => html`<div class="field">
  <label for="m-${name}">${label}: <strong class="num" data-out="${name}">${model[name]}${suffix}</strong></label>
  <input id="m-${name}" name="${name}" type="range" min="${min}" max="${max}" step="${step}" value="${model[name]}" style="accent-color:var(--brand)">
  ${help ? html`<p class="help">${help}</p>` : ''}
</div>`;

export const businessView = {
  layout: 'marketing',
  nav: 'business',
  title: 'Business model',
  render() {
    const s = getState();
    const m = s.settings.market;
    const r = runModel(model);
    return html`
    <section class="hero" style="padding-bottom:40px">
      <div class="container">
        <div class="eyebrow">${ic('briefcase', { size: 16 })} For investors & partners</div>
        <h1 style="max-width:900px">The servicing layer for the <em>seller-financing comeback</em>.</h1>
        <p class="lead">Owners selling rentals want steady income, not a lump sum and a tax bill. Buyers priced out at ${m.pmms30}% want another way in. Between them sits a note that someone has to structure, underwrite and service for 5–30 years. SteadyNote is that someone.</p>
      </div>
    </section>
    <section class="section alt tight" aria-labelledby="prob-h">
      <div class="container">
        <h2 class="section-title display" id="prob-h">The gap</h2>
        <div class="features" style="margin-top:20px">
          <div class="feature"><div class="ficon">${ic('home', { size: 20 })}</div><h3>Sellers want income, not a job</h3><p>Retiring landlords sell to escape tenants and repairs, but they still want monthly cash flow. Carrying the note gives them that, plus interest and installment-sale tax treatment.</p></div>
          <div class="feature"><div class="ficon">${ic('users', { size: 20 })}</div><h3>Buyers fall outside the bank box</h3><p>Self-employed, gig-income, thin-file and newly arrived buyers can often afford the payment but can’t pass automated underwriting, especially with rates above 7%.</p></div>
          <div class="feature"><div class="ficon">${ic('sliders', { size: 20 })}</div><h3>No DIY tooling in between</h3><p>Institutional servicers are built for lenders with portfolios. Individual sellers make do with spreadsheets, Venmo and guesswork on compliance, taxes and late charges.</p></div>
        </div>
      </div>
    </section>
    <section class="section tight" aria-labelledby="rev-h">
      <div class="container">
        <h2 class="section-title display" id="rev-h">Revenue is built into the workflow</h2>
        <p class="lead">Every step a seller needs is also a place SteadyNote earns: qualifying the buyer up front, then automated servicing for the life of the loan, then the exit.</p>
        <div class="table-wrap card flush mt-3">
          <table class="tbl">
            <thead><tr><th>Stream</th><th>Price</th><th>Who pays</th><th>When</th></tr></thead>
            <tbody>
              <tr><td><span class="cell-main">Buyer screening</span><span class="cell-sub">ID, credit, bank-verified income, ATR report</span></td><td class="nowrap">${money0(PRICING.screening.price)} / applicant</td><td>Applicant</td><td>Every application, ~3–5 per listing</td></tr>
              ${PRICING.plans.filter((p) => p.price).map((p) => html`<tr><td><span class="cell-main">${p.name}</span><span class="cell-sub">${p.desc}</span></td><td class="nowrap">${money0(p.price)} / loan / mo</td><td>Seller (or buyer via the note)</td><td>Monthly, for the life of the loan</td></tr>`)}
              ${PRICING.addons.map((a) => html`<tr><td><span class="cell-main">${a.name}</span><span class="cell-sub">${a.desc}</span></td><td class="nowrap">${a.price ? money0(a.price) : `${a.pct}% of sale`}</td><td>Seller</td><td>${a.id === 'notesale' ? 'At exit' : a.id === 'payoff' ? 'At payoff' : 'At closing'}</td></tr>`)}
            </tbody>
          </table>
        </div>
      </div>
    </section>
    <section class="section alt tight" aria-labelledby="model-h">
      <div class="container">
        <h2 class="section-title display" id="model-h">Model it</h2>
        <p class="lead">Drag the assumptions. Servicing revenue compounds because loans stay on the books for years.</p>
        <div class="grid g-main-r mt-3">
          <form class="card stack" data-live="biz-model">
            ${slider('listings', 'New listings per month (start)', 5, 400, 5, '', 'Sellers who publish a listing through SteadyNote.')}
            ${slider('growth', 'Monthly listing growth', 0, 20, 1, '%')}
            ${slider('applicants', 'Applicants per listing', 1, 10, 1, '')}
            ${slider('conversion', 'Listings that close as a loan', 10, 90, 5, '%')}
            ${slider('complete', 'Loans on Servicing Complete', 0, 100, 5, '%', 'Escrow and monitoring tier.')}
            ${slider('addon', 'Closings using partner documents', 0, 100, 5, '%', 'We keep ~35% of the document fee.')}
            ${slider('churn', 'Monthly loan runoff', 0.2, 4, 0.1, '%', 'Payoffs, refinances and balloons. 1.2% ≈ 7-year average life.')}
            <button type="button" class="btn btn-ghost btn-sm" data-action="biz-reset">Reset assumptions</button>
          </form>
          <div class="biz-out">${outputs(r)}</div>
        </div>
        <p class="xs muted mt-2">Illustrative model, not a forecast. Screening shown net of estimated verification costs (≈28%).</p>
      </div>
    </section>
    <section class="section tight" aria-labelledby="moat-h">
      <div class="container split">
        <div>
          <h2 class="section-title display" id="moat-h">Why SteadyNote wins</h2>
          <ul class="checklist">
            <li>${ic('check')}<span><strong>Owns the loan from offer to payoff.</strong> The Deal Builder and buyer application feed servicing, so there’s no re-keying and no reason to leave.</span></li>
            <li>${ic('check')}<span><strong>Payment data compounds.</strong> Years of per-loan performance make note pricing, and a note marketplace, more accurate than anyone else’s.</span></li>
            <li>${ic('check')}<span><strong>Compliance as a feature.</strong> Reg Z exclusions, ATR documentation and AFR checks turn a scary process into a guided one.</span></li>
            <li>${ic('check')}<span><strong>Partner network.</strong> Attorneys, title companies, RMLOs and note buyers plug in at the moments sellers need them, each one a revenue share.</span></li>
          </ul>
        </div>
        <div class="card">
          <h3>Roadmap</h3>
          <ol class="stack-sm" style="padding-left:18px;margin:0">
            <li><strong>Now:</strong> prototype with Deal Builder, applications, servicing engine, buyer portal and tax center.</li>
            <li><strong>Next:</strong> real ACH (Plaid + a payments partner), credit and identity vendors, and e-sign.</li>
            <li><strong>Then:</strong> a partner attorney network with state-specific closing packages, plus Form 1098 e-filing.</li>
            <li><strong>Later:</strong> a note marketplace, and default servicing with foreclosure-attorney referrals.</li>
          </ol>
          <p class="xs muted mt-2 mb-0">Market data: ${m.source}, ${fmtDate(m.asOf, 'long')}.</p>
        </div>
      </div>
    </section>`;
  },
  mount(main) {
    const out = main.querySelector('.biz-out');
    let cleanup = mountChart(out, runModel(model));
    main._bizCleanup = () => cleanup && cleanup();
    return () => main._bizCleanup && main._bizCleanup();
  },
};

onLive({
  'biz-model': (form, e) => {
    const t = e.target;
    if (!t.name) return;
    model[t.name] = Number(t.value);
    const outEl = form.querySelector(`[data-out="${t.name}"]`);
    if (outEl) outEl.textContent = `${t.value}${['growth', 'conversion', 'complete', 'addon', 'churn'].includes(t.name) ? '%' : ''}`;
    const main = document.getElementById('main');
    const out = main.querySelector('.biz-out');
    if (main._bizCleanup) main._bizCleanup();
    const r = runModel(model);
    out.innerHTML = String(outputs(r));
    const c = mountChart(out, r);
    main._bizCleanup = () => c && c();
  },
});

onAction({
  'biz-reset': () => {
    model = { ...DEFAULTS };
    const main = document.getElementById('main');
    const form = main.querySelector('[data-live="biz-model"]');
    for (const [k, v] of Object.entries(model)) {
      const input = form.elements[k];
      if (input) { input.value = v; input.dispatchEvent(new Event('input', { bubbles: true })); }
    }
  },
});
