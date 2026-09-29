import { html } from '../../ui/html.js';
import { ic } from '../../ui/icons.js';
import { money0 } from '../../core/util.js';
import { PRICING } from '../../core/pricing.js';

export const pricingView = {
  layout: 'marketing',
  nav: 'pricing',
  title: 'Pricing',
  render() {
    const { plans, addons, screening } = PRICING;
    return html`
    <section class="section tight">
      <div class="container center">
        <div class="eyebrow">Pricing</div>
        <h1 class="section-title display" style="margin:0 auto 14px;font-size:clamp(2rem,4vw,3rem)">Free to structure. About a dollar a day per note to service.</h1>
        <p class="lead" style="margin:0 auto">No setup fees and no per-payment fees. Buyers pay for their own screening, the way renters pay application fees.</p>
      </div>
      <div class="container">
        <div class="price-grid">
          ${plans.map((p) => html`<div class="price-card ${p.popular ? 'popular' : ''}">
            ${p.popular ? html`<span class="tag">Most sellers</span>` : ''}
            <h2 style="font-size:1.1rem;margin:0">${p.name}</h2>
            <div class="price">${p.price ? money0(p.price) : '$0'}<small> ${p.unit}</small></div>
            <p class="small muted mb-0">${p.desc}</p>
            <ul>${p.features.map((f) => html`<li>${ic('check', { size: 16 })}<span>${f}</span></li>`)}</ul>
            <a class="btn ${p.popular ? 'btn-primary' : 'btn-secondary'} btn-block mt-2" href="${p.id === 'free' ? '#/calculator' : '#/app/loans'}">${p.id === 'free' ? 'Start structuring' : 'See it in the demo'}</a>
          </div>`)}
        </div>
      </div>
    </section>
    <section class="section alt tight">
      <div class="container split">
        <div>
          <div class="eyebrow">Buyer screening</div>
          <h2 class="section-title display">${money0(screening.price)} per applicant, usually paid by the applicant.</h2>
          <p class="lead">${screening.desc} You see a scorecard and a documented Ability-to-Repay worksheet. Your applicant sees a clear, respectful process.</p>
        </div>
        <div class="card">
          <h3>What a screening includes</h3>
          <ul class="checklist">
            <li>${ic('check')}<span>Identity verification (ID + selfie match)</span></li>
            <li>${ic('check')}<span>Soft-pull credit report with no impact on the applicant’s score</span></li>
            <li>${ic('check')}<span>Bank-verified income and assets (12–24 months of deposits)</span></li>
            <li>${ic('check')}<span>100-point scorecard, DTI and reserves analysis</span></li>
            <li>${ic('check')}<span>ATR worksheet and adverse-action notice templates</span></li>
          </ul>
        </div>
      </div>
    </section>
    <section class="section tight">
      <div class="container">
        <div class="eyebrow">One-time add-ons</div>
        <h2 class="section-title display">Help when you need it, priced per job.</h2>
        <div class="addon-grid mt-3">
          ${addons.map((a) => html`<div class="addon"><div class="amt">${a.price ? money0(a.price) : `${a.pct}%`}</div><div class="xs muted">${a.unit}</div><h3 class="mt-1">${a.name}</h3><p class="small muted mb-0">${a.desc}</p></div>`)}
        </div>
        <div class="card tint mt-4">
          <div class="spread"><div><h3 class="mb-0">Example: three notes on Servicing Essentials</h3><p class="small muted mb-0">3 × $29 = <strong>$87/month</strong>. On notes paying $2,500/month each, that’s about 1.2% of what you collect. Many sellers write the servicing fee into the note so the buyer pays it.</p></div><a class="btn btn-primary" href="#/app">Open the seller demo</a></div>
        </div>
      </div>
    </section>`;
  },
};
