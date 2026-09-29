import { html } from '../../ui/html.js';
import { ic } from '../../ui/icons.js';
import { getState, loanStates, today } from '../../data/store.js';
import { money, money0, fmtDate, sum, localToday } from '../../core/util.js';
import { buildSeed } from '../../data/seed.js';
import { computeLoan } from '../../core/servicing.js';
import { PRICING } from '../../core/pricing.js';

function heroMock() {
  let s = getState();
  let st = loanStates();
  let active = s.loans.filter((l) => !st[l.id].paidOffDate);
  if (!active.length) {
    // Visitor cleared their workspace: show the sample portfolio instead.
    s = buildSeed(localToday());
    st = Object.fromEntries(s.loans.map((l) => [l.id, computeLoan(l, localToday())]));
    active = s.loans.filter((l) => !st[l.id].paidOffDate);
  }
  const monthly = sum(active, (l) => st[l.id].payment);
  const bal = sum(active, (l) => st[l.id].principalBalance);
  const recent = s.loans.flatMap((l) => (l.transactions || []).filter((t) => t.type === 'payment' && t.status !== 'returned' && t.date <= today() && t.applyTo !== 'payoff').map((t) => ({ l, t }))).sort((a, b) => (a.t.date < b.t.date ? 1 : -1))[0];
  const bars = [62, 64, 63, 66, 65, 68, 67, 70, 69, 72, 71, 74];
  return html`<div class="mock" aria-hidden="true">
    <div class="mock-card">
      <div class="spread"><span class="small muted strong">Hendricks Family Trust</span><span class="badge good">${ic('check', { size: 13 })}All loans serviced</span></div>
      <div class="mt-2 small muted">Monthly income from your notes</div>
      <div class="big-number">${money0(monthly)}<small> /mo</small></div>
      <svg viewBox="0 0 240 64" width="100%" height="64" class="mt-2" style="display:block">
        ${bars.map((h, i) => html`<rect x="${i * 20 + 3}" y="${64 - h * 0.8}" width="14" height="${h * 0.8}" rx="3" fill="${i === bars.length - 1 ? '#0b6b4f' : '#cfe7dc'}"/>`)}
      </svg>
      <div class="grid g-3 mt-2" style="gap:10px">
        <div><div class="xs muted">Principal out</div><div class="strong">${money0(bal)}</div></div>
        <div><div class="xs muted">Active notes</div><div class="strong">${active.length}</div></div>
        <div><div class="xs muted">Collected by autopay</div><div class="strong">${active.filter((l) => l.autopay?.enabled).length} of ${active.length}</div></div>
      </div>
    </div>
    ${recent ? html`<div class="mock-float f1"><span class="dot">${ic('check', { size: 18 })}</span><span><strong>Payment received · ${money(recent.t.amount)}</strong><span class="muted xs">${recent.l.borrower.name} · ${fmtDate(recent.t.date)}</span></span></div>` : ''}
    <div class="mock-float f2"><span class="dot" style="background:#e8f0fb;color:#1b4e8f">${ic('users', { size: 18 })}</span><span><strong>New applicant scored A</strong><span class="muted xs">748 credit · 33% DTI · 15% down</span></span></div>
  </div>`;
}

export const landingView = {
  layout: 'marketing',
  nav: 'home',
  title: '',
  render() {
    const s = getState();
    const m = s.settings.market, afr = s.settings.afr;
    const plans = PRICING.plans;
    return html`
    <section class="hero">
      <div class="container hero-grid">
        <div>
          <div class="eyebrow">${ic('home', { size: 16 })} Seller-financing platform</div>
          <h1>Sell the property.<br><em>Keep the paycheck.</em></h1>
          <p class="lead">You don’t have to be a bank to offer seller financing. SteadyNote helps you structure a compliant note, vet buyers yourself, and collect every payment on autopilot.</p>
          <div class="hero-cta">
            <a class="btn btn-primary btn-lg" href="#/app">Open the seller demo ${ic('arrowRight', { size: 18 })}</a>
            <a class="btn btn-secondary btn-lg" href="#/calculator">${ic('calculator', { size: 18 })} Run your numbers</a>
          </div>
          <div class="hero-proof">
            <span>${ic('shield', { size: 16 })} Dodd-Frank & AFR guardrails</span>
            <span>${ic('repeat', { size: 16 })} Autopay + escrow</span>
            <span>${ic('landmark', { size: 16 })} Year-end tax statements</span>
          </div>
        </div>
        ${heroMock()}
      </div>
    </section>

    <section class="section dark" id="why" tabindex="-1" aria-labelledby="why-h">
      <div class="container">
        <div class="eyebrow">Why now</div>
        <h2 class="section-title display" id="why-h">Mortgage rates are back above 7%. Owners who want income, not a lump sum, can offer buyers another way to pay.</h2>
        <div class="rate-band mt-3">
          <div class="rate-card"><div class="big">${m.pmms30}%</div><p>Average 30-year fixed mortgage rate for the week of ${fmtDate(m.asOf, 'long')}. It’s the first time above 7% since January 2025, up from ${m.pmms30YearAgo}% a year earlier.</p><p class="source mt-1">Source: <a href="${m.sourceUrl}" target="_blank" rel="noopener">${m.source}</a></p></div>
          <div class="rate-card"><div class="big">${afr.annual.long}%</div><p>Long-term Applicable Federal Rate for ${afr.month}, the IRS floor for a seller note. At 7–8%, your note clears it and competes with bank loans.</p><p class="source mt-1">Source: <a href="${afr.url}" target="_blank" rel="noopener">IRS ${afr.ruling}</a></p></div>
          <div class="rate-card"><div class="big">No tenants</div><p>Retiring landlords sell to stop fixing toilets, not to stop earning. A note turns a rental into monthly income, and capital-gains tax is spread over the years principal comes in.</p><p class="source mt-1">Installment-sale reporting: IRC §453 · Form 6252</p></div>
        </div>
      </div>
    </section>

    <section class="section" id="how" tabindex="-1" aria-labelledby="how-h">
      <div class="container">
        <div class="eyebrow">How it works</div>
        <h2 class="section-title display" id="how-h">From “for sale” to a monthly deposit in four steps.</h2>
        <div class="steps">
          <div class="step"><span class="step-num">1</span><h3>Structure the deal</h3><p>Set price, down payment, rate, term and balloon. Guardrails check Reg Z seller-financer limits, the IRS minimum rate, and state-rule flags as you type.</p><span class="who">You · 10 minutes</span></div>
          <div class="step"><span class="step-num">2</span><h3>Qualify buyers yourself</h3><p>Share an application link. Buyers apply from their phone, verify identity, income and credit, and you get a scorecard plus an Ability-to-Repay worksheet.</p><span class="who">Buyer applies · you decide</span></div>
          <div class="step"><span class="step-num">3</span><h3>Close with confidence</h3><p>Partner attorneys and title companies in your state prepare the note and deed of trust. The approved terms flow straight into servicing.</p><span class="who">Partner attorney</span></div>
          <div class="step"><span class="step-num">4</span><h3>Get paid on autopilot</h3><p>Autopay pulls each installment into your account. Escrow, reminders, late notices, payoff quotes and year-end tax statements run in the background.</p><span class="who">SteadyNote · every month</span></div>
        </div>
      </div>
    </section>

    <section class="section alt" aria-labelledby="feat-h">
      <div class="container">
        <div class="eyebrow">Everything a note holder needs</div>
        <h2 class="section-title display" id="feat-h">Bank-grade servicing, sized for someone with one to ten notes.</h2>
        <div class="features">
          ${[
            ['calculator', 'Deal Builder', 'Payment, balloon, total interest and a live compliance check for every version of the offer.'],
            ['users', 'Buyer applications', 'Mobile application with identity check, soft-pull credit and bank-verified income. The buyer pays the $49 screening fee.'],
            ['clipboard', 'Ability-to-Repay worksheet', 'All eight Reg Z ATR factors documented with sources, plus adverse-action notices when you say no.'],
            ['repeat', 'Autopay & borrower portal', 'ACH autopay, one-time payments, statements, payoff quotes and balance history for your buyer.'],
            ['shield', 'Escrow & collateral protection', 'Taxes and insurance collected monthly and paid on time, with annual escrow analysis and lapse alerts.'],
            ['landmark', 'Tax center', 'Interest income, principal received and installment-sale gain by year, plus interest statements for you and the buyer.'],
            ['alert', 'Late & default workflow', 'Grace periods, late charges, returned-payment handling and 30-day letters, all tracked in one ledger.'],
            ['receipt', 'Clean, auditable ledger', 'Every dollar applied to interest, principal, escrow and fees in the same order as standard mortgage documents.'],
            ['trending', 'Note value & exit', 'See what your note is worth to investors today, and sell all or part of it when you want a lump sum.'],
          ].map(([i, t, d]) => html`<div class="feature"><div class="ficon">${ic(i === 'clipboard' ? 'file' : i, { size: 20 })}</div><h3>${t}</h3><p>${d}</p></div>`)}
        </div>
      </div>
    </section>

    <section class="section" aria-labelledby="comp-h">
      <div class="container split">
        <div>
          <div class="eyebrow">Guardrails built in</div>
          <h2 class="section-title display" id="comp-h">Stay on the right side of the rules without hiring a compliance department.</h2>
          <p class="lead">Seller financing is regulated. Federal rules let individuals, estates and trusts finance a limited number of sales without a license. SteadyNote checks every deal against those limits before you publish it.</p>
          <ul class="checklist">
            <li>${ic('check')}<span><strong>Reg Z seller-financer exclusions.</strong> The one-property and three-property tests, including balloon, amortization and rate rules.</span></li>
            <li>${ic('check')}<span><strong>IRS minimum interest.</strong> Warns you before a below-AFR rate lets the IRS recharacterize principal as interest.</span></li>
            <li>${ic('check')}<span><strong>Ability to repay.</strong> A documented, good-faith determination for every approved buyer.</span></li>
            <li>${ic('check')}<span><strong>A licensed originator when you need one.</strong> Deals outside the exclusions route to a partner RMLO.</span></li>
          </ul>
        </div>
        <div class="card" aria-hidden="true">
          <div class="verdict good">${ic('shield', { size: 22 })}<div><strong>You qualify as an exempt seller financer</strong><p>This fits the three-property exclusion. Keep it fully amortizing and complete the ATR worksheet when you approve a buyer.</p></div></div>
          <ul class="checks mt-2">
            <li><span class="ci pass">${ic('check', { size: 14 })}</span><span>Three or fewer properties seller-financed in any 12-month period<small>This would be #2 in 12 months</small></span></li>
            <li><span class="ci pass">${ic('check', { size: 14 })}</span><span>Fully amortizing (no balloon, no interest-only)<small>Pays off in full over 30 yr</small></span></li>
            <li><span class="ci pending">${ic('clock', { size: 14 })}</span><span>Good-faith determination of the buyer’s ability to repay<small>Done in SteadyNote when you approve a buyer</small></span></li>
            <li><span class="ci pass">${ic('check', { size: 14 })}</span><span>IRS minimum rate (AFR)<small>7.5% clears the ${afr.month} long-term AFR of ${afr.monthly.long}%</small></span></li>
          </ul>
        </div>
      </div>
    </section>

    <section class="section alt" aria-labelledby="price-h">
      <div class="container">
        <div class="eyebrow">Pricing</div>
        <h2 class="section-title display" id="price-h">Free to structure. Pay per loan once the money starts moving.</h2>
        <div class="price-grid">
          ${plans.map((p) => html`<div class="price-card ${p.popular ? 'popular' : ''}">${p.popular ? html`<span class="tag">Most sellers</span>` : ''}<h3>${p.name}</h3><div class="price">${p.price ? money0(p.price) : '$0'}<small> ${p.unit}</small></div><p class="small muted mb-0">${p.desc}</p><ul>${p.features.slice(0, 4).map((f) => html`<li>${ic('check', { size: 16 })}<span>${f}</span></li>`)}</ul></div>`)}
        </div>
        <p class="center mt-3"><a href="#/pricing" class="btn btn-secondary">See full pricing & add-ons ${ic('arrowRight', { size: 16 })}</a></p>
      </div>
    </section>

    <section class="section" id="faq" tabindex="-1" aria-labelledby="faq-h">
      <div class="container">
        <div class="center"><div class="eyebrow">Questions</div><h2 class="section-title display" id="faq-h" style="margin:0 auto">Seller financing, plainly explained.</h2></div>
        <div class="faq">
          <details><summary>What is seller financing?</summary><p>Instead of the buyer getting a bank mortgage, you act as the lender. The buyer makes a down payment, signs a promissory note, and pays you monthly. A deed of trust or mortgage on the property secures the note, just like a bank loan.</p></details>
          <details><summary>Do I need a license to offer seller financing?</summary><p>Usually not, if you fit a federal exclusion. Under Regulation Z, a natural person, estate or trust can finance one property in any 12 months (balloons allowed). Any seller can finance up to three in 12 months if the loan is fully amortizing and they make a good-faith ability-to-repay determination. Either way, you can’t have built the home as a contractor, and the rate must be fixed or adjustable only after five years with caps. Outside those limits, a licensed loan originator (RMLO) should originate the loan. States can add their own rules, so SteadyNote flags them and partner attorneys handle closing documents.</p></details>
          <details><summary>What happens if the buyer stops paying?</summary><p>You hold a lien on the property. SteadyNote tracks the grace period, assesses the late charge in your note, sends notices, and alerts you at 30 days. If a loan heads toward default, we connect you with a local foreclosure attorney. A healthy down payment is your cushion, so the Deal Builder encourages 10–20%.</p></details>
          <details><summary>Who pays property taxes and insurance?</summary><p>The buyer. With escrow on, they pay one-twelfth each month with their installment and SteadyNote pays the county and the insurer on time. Without escrow, we still track insurance expiration and tax status so an unpaid bill doesn’t get ahead of your lien.</p></details>
          <details><summary>How do I receive payments?</summary><p>Buyers enroll in autopay (ACH) or pay one-time from the portal. Funds land in your bank account. Checks, Zelle and wires can be recorded too, and every payment is applied to interest, principal, escrow and charges automatically.</p></details>
          <details><summary>How is the income taxed?</summary><p>Interest is ordinary income. Gain on the sale can usually be reported on the installment method (Form 6252), recognized as principal comes in rather than all in the year of sale. The Tax center tracks both by year for your CPA. This isn’t tax advice.</p></details>
          <details><summary>Can I cash out later?</summary><p>Yes. Performing notes can be sold, whole or in part, to note investors at a discount. The Note value tool estimates what yours is worth today based on payment history, equity and term.</p></details>
          <details><summary>Is SteadyNote live?</summary><p>This is a working prototype. The demo runs entirely in your browser with fictional data, so you can click through every workflow: listing, applications, approval, servicing, the buyer portal and tax reporting.</p></details>
        </div>
      </div>
    </section>

    <section class="section tight">
      <div class="container">
        <div class="cta-band">
          <div><h2 class="display">See it with a real-looking portfolio.</h2><p>Five notes, a live listing with three applicants, and every automation switched on.</p></div>
          <div class="btn-row wrap"><a class="btn btn-primary btn-lg" href="#/app">Open the seller demo</a><a class="btn btn-secondary btn-lg" href="#/apply/sunset-ridge-4471">Try the buyer application</a></div>
        </div>
      </div>
    </section>`;
  },
};
