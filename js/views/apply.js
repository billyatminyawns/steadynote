// Public buyer application for a listing: a six-step, phone-friendly wizard.
import { html, raw, esc } from '../ui/html.js';
import { ic } from '../ui/icons.js';
import { card, field, moneyField, checkbox, empty, propertyArt, toast, alertBox, kv } from '../ui/components.js';
import { onAction, onSubmit, onLive, readForm, showErrors } from '../ui/actions.js';
import { getState, update, today, dealByCode, logActivity } from '../data/store.js';
import { money, money0, ratePct, durationLabel, fmtDate, parseMoneyInput, parseNum, dollarsInput, uid, addDays } from '../core/util.js';
import { CREDIT_BANDS, EMPLOYMENT_TYPES, DEBT_FIELDS, ASSET_FIELDS, HISTORY_OPTIONS, housingFor, simulateScreening } from '../core/qualify.js';
import { hasBalloon } from '../core/servicing.js';
import { PRICING } from '../core/pricing.js';
import { propertyFacts } from './shared.js';

const STEPS = ['About you', 'Income', 'Debts & housing', 'Assets & offer', 'History', 'Review & submit'];
const KEY = 'steadynote:apply';
let wiz = null;

function load(code) {
  if (wiz && wiz.code === code) return wiz;
  try {
    const raw = sessionStorage.getItem(KEY);
    const w = raw && JSON.parse(raw);
    if (w && w.code === code) { wiz = w; return wiz; }
  } catch { /* storage blocked */ }
  wiz = { code, step: 0, done: null, data: { coApplicant: false, applicants: [{ employmentType: 'w2' }, { employmentType: 'w2' }], debts: {}, assets: {}, household: { currentHousing: 'rent' }, credit: { band: 'unknown', bankruptcy: 'none', foreclosure: 'none', eviction: 'none' }, offer: {} } };
  return wiz;
}
function save() { try { sessionStorage.setItem(KEY, JSON.stringify(wiz)); } catch { /* ignore */ } }

function listingHeader(d) {
  const t = d.terms;
  const down = Math.round((t.salePrice * t.downPct) / 100);
  const h = housingFor(t, t.salePrice, down);
  const s = getState();
  return html`<section class="apply-hero">
    ${propertyArt(d.property)}
    <div class="apply-hero-body">
      <span class="badge good" style="align-self:flex-start">${ic('key', { size: 13 })}Owner financing available</span>
      <h1>${d.property.address}</h1>
      <p class="muted mb-0">${d.property.city}, ${d.property.state} ${d.property.zip || ''} · ${propertyFacts(d.property)}</p>
      <div class="big-number mt-1">${money0(t.salePrice)}</div>
      <div class="term-pills"><span>${+t.downPct.toFixed(1)}% down (${money0(down)})</span><span>${ratePct(t.ratePct)} fixed</span><span>${durationLabel(t.amortMonths)}${hasBalloon(t) ? ` · ${durationLabel(t.balloonMonths)} balloon` : ''}</span><span>≈ ${money0(h.total)}/mo incl. taxes & insurance</span></div>
      ${d.property.description ? html`<p class="small mb-0">${d.property.description}</p>` : ''}
      <p class="xs muted mb-0">Offered by ${s.profile.name || 'the owner'}${t.minCredit ? ` · seller asks for ${t.minCredit}+ credit` : ''}${t.minDownPct ? ` and ${t.minDownPct}% down` : ''}. No bank needed. The seller reviews every application personally.</p>
    </div>
  </section>`;
}

function applicantFields(i, a, co) {
  const p = `a${i}_`;
  return html`<div class="applicant-block"><h3>${co ? 'Co-applicant' : 'You'}</h3><div class="form-grid">
    ${field({ label: 'First name', name: `${p}first`, value: a.first || '', required: true, autocomplete: co ? 'off' : 'given-name' })}
    ${field({ label: 'Last name', name: `${p}last`, value: a.last || '', required: true, autocomplete: co ? 'off' : 'family-name' })}
    ${field({ label: 'Email', name: `${p}email`, type: 'email', value: a.email || '', required: true, autocomplete: co ? 'off' : 'email' })}
    ${field({ label: 'Mobile phone', name: `${p}phone`, type: 'tel', value: a.phone || '', required: true, autocomplete: co ? 'off' : 'tel' })}
  </div></div>`;
}
function incomeFields(i, a, co) {
  const p = `a${i}_`;
  return html`<div class="applicant-block"><h3>${co ? `${a.first || 'Co-applicant'}’s income` : 'Your income'}</h3><div class="form-grid">
    ${field({ label: 'Employment', name: `${p}employmentType`, type: 'select', value: a.employmentType || 'w2', options: Object.entries(EMPLOYMENT_TYPES) })}
    ${field({ label: 'Years in this line of work', name: `${p}years`, value: a.years ?? '', inputmode: 'decimal', required: true })}
    ${field({ label: 'Employer or business', name: `${p}employer`, value: a.employer || '' })}
    ${field({ label: 'Job title', name: `${p}jobTitle`, value: a.jobTitle || '' })}
    ${moneyField({ label: 'Gross monthly income (before taxes)', name: `${p}monthlyIncome`, value: a.monthlyIncome != null ? dollarsInput(a.monthlyIncome) : '', required: !co, help: 'Self-employed? Use your average monthly deposits.' })}
    ${moneyField({ label: 'Other monthly income', name: `${p}otherIncome`, value: a.otherIncome ? dollarsInput(a.otherIncome) : '', help: 'Child support, Social Security, rental income…' })}
  </div></div>`;
}

function stepBody(d, w) {
  const x = w.data;
  const t = d.terms;
  switch (w.step) {
    case 0: return html`
      <h2>Tell the seller about you</h2>
      <p class="muted">Takes about 8 minutes. You can go back and change anything before you submit.</p>
      ${applicantFields(0, x.applicants[0], false)}
      <div class="mt-2">${checkbox({ name: 'coApplicant', checked: x.coApplicant, label: 'Add a co-applicant', desc: 'A spouse or partner who’ll be on the loan. Combined income is considered.' })}</div>
      ${x.coApplicant ? html`<div class="mt-2">${applicantFields(1, x.applicants[1], true)}</div>` : ''}`;
    case 1: return html`
      <h2>Income</h2>
      <p class="muted">After you submit, you’ll link your bank so income can be verified from deposits. No tax returns needed to get started.</p>
      ${incomeFields(0, x.applicants[0], false)}
      ${x.coApplicant ? html`<div class="mt-2">${incomeFields(1, x.applicants[1], true)}</div>` : ''}`;
    case 2: return html`
      <h2>Monthly debts & housing</h2>
      <p class="muted">Minimum monthly payments only. Your credit report fills in anything missed.</p>
      <div class="form-grid">
        ${DEBT_FIELDS.map(([k, l]) => moneyField({ label: l, name: `debt_${k}`, value: x.debts[k] ? dollarsInput(x.debts[k]) : '' }))}
      </div>
      <div class="form-grid mt-3">
        ${field({ label: 'Where do you live now?', name: 'currentHousing', type: 'select', value: x.household.currentHousing || 'rent', options: [['rent', 'I rent'], ['own', 'I own'], ['family', 'With family']] })}
        ${moneyField({ label: 'Current monthly rent or mortgage', name: 'currentPayment', value: x.household.currentPayment ? dollarsInput(x.household.currentPayment) : '' })}
        ${field({ label: 'Years at current address', name: 'yearsAtAddress', value: x.household.yearsAtAddress ?? '', inputmode: 'decimal' })}
        ${field({ label: 'People in your household', name: 'size', value: x.household.size ?? '', inputmode: 'numeric' })}
      </div>`;
    case 3: {
      const price = x.offer.price ?? t.salePrice;
      const down = x.offer.downPayment ?? Math.round((price * t.downPct) / 100);
      return html`
      <h2>Savings & your offer</h2>
      <div class="form-grid">
        ${ASSET_FIELDS.map(([k, l]) => moneyField({ label: l, name: `asset_${k}`, value: x.assets[k] ? dollarsInput(x.assets[k]) : '' }))}
      </div>
      <div class="form-grid mt-3">
        ${moneyField({ label: 'Offer price', name: 'offerPrice', value: dollarsInput(price), required: true, help: `Asking ${money0(t.salePrice)}` })}
        ${moneyField({ label: 'Down payment you can make', name: 'offerDown', value: dollarsInput(down), required: true, help: t.minDownPct ? `The seller asks for at least ${t.minDownPct}% (${money0(Math.round((price * t.minDownPct) / 100))}).` : '' })}
        ${field({ label: 'Target move-in date', name: 'moveIn', type: 'date', value: x.offer.moveIn || addDays(today(), 45), min: today() })}
        ${field({ label: 'You plan to', name: 'occupancy', type: 'select', value: x.offer.occupancy || 'owner', options: [['owner', 'Live in the home'], ['investment', 'Rent it out']] })}
        ${field({ label: 'A note to the seller (optional)', name: 'note', type: 'textarea', value: x.offer.note || '', cls: 'full', rows: 3, maxlength: 600, placeholder: 'Why this home, and anything that helps explain your situation.' })}
      </div>`;
    }
    case 4: return html`
      <h2>Credit & rental history</h2>
      <p class="muted">Honesty helps. Past issues don’t automatically disqualify you, and the seller sees your explanation.</p>
      <div class="form-grid">
        ${field({ label: 'Your credit score (best guess)', name: 'band', type: 'select', value: x.credit.band, options: CREDIT_BANDS.map((b) => [b.id, b.label]) })}
        ${field({ label: 'Bankruptcy', name: 'bankruptcy', type: 'select', value: x.credit.bankruptcy, options: Object.entries(HISTORY_OPTIONS.bankruptcy) })}
        ${field({ label: 'Foreclosure', name: 'foreclosure', type: 'select', value: x.credit.foreclosure, options: Object.entries(HISTORY_OPTIONS.foreclosure) })}
        ${field({ label: 'Eviction', name: 'eviction', type: 'select', value: x.credit.eviction, options: Object.entries(HISTORY_OPTIONS.eviction) })}
      </div>`;
    case 5: {
      const a0 = x.applicants[0];
      const price = x.offer.price ?? t.salePrice;
      const down = x.offer.downPayment ?? 0;
      const h = housingFor(t, price, down);
      const income = x.applicants.slice(0, x.coApplicant ? 2 : 1).reduce((s, a) => s + (a.monthlyIncome || 0) + (a.otherIncome || 0), 0);
      const debts = DEBT_FIELDS.reduce((s, [k]) => s + (x.debts[k] || 0), 0);
      const dti = income ? ((h.total + debts) / income) * 100 : 0;
      return html`
      <h2>Review & submit</h2>
      <div class="review-list">
        ${card({ title: 'Your offer', body: kv([['Price', money0(price)], ['Down payment', `${money0(down)} (${((down / price) * 100).toFixed(1)}%)`], ['Estimated payment', `${money(h.total)}/mo`], ['Principal & interest', money(h.pi)]], 'one rows') })}
        ${card({ title: 'Snapshot', body: kv([['Applicants', x.applicants.slice(0, x.coApplicant ? 2 : 1).map((a) => `${a.first} ${a.last}`).join(' & ')], ['Monthly income', money0(income)], ['Monthly debts', money0(debts)], ['Debt-to-income', `${dti.toFixed(0)}%`]], 'one rows') })}
      </div>
      ${dti > 45 ? html`<div class="mt-2">${alertBox({ tone: 'warning', text: `At about ${dti.toFixed(0)}% debt-to-income, the payment may be a stretch. A larger down payment or co-applicant can help. You can still apply.` })}</div>` : ''}
      <div class="card tint mt-2">
        <h3>Screening fee: ${money0(PRICING.screening.price)}</h3>
        <p class="small mb-0">Covers identity verification, a soft credit pull (no impact on your score) and bank-verified income. <strong>Demo: no charge.</strong></p>
      </div>
      <div class="stack-sm mt-2">
        ${checkbox({ name: 'consentCredit', label: 'I authorize a soft credit check and verification of my identity, income and assets', desc: 'For the purpose of evaluating this purchase. Results are shared only with this seller.', required: true })}
        ${checkbox({ name: 'consentTerms', label: 'I agree to receive disclosures electronically and confirm my answers are true', required: true })}
      </div>
      <div class="mt-2">${field({ label: 'Type your full name to sign', name: 'signature', value: '', required: true, autocomplete: 'name', help: `${a0.first || ''} ${a0.last || ''}`.trim() ? `Must match: ${a0.first} ${a0.last}` : '' })}</div>`;
    }
    default: return '';
  }
}

function successView(d, appId) {
  const s = getState();
  const a = s.applications.find((x) => x.id === appId);
  return html`<div class="success">
    <div class="big-check">${ic('check', { size: 30 })}</div>
    <h1>Application sent</h1>
    <p class="lead" style="margin:0 auto 16px">${s.profile.name || 'The seller'} will review it and get back to you, usually within a few days. We emailed a copy to ${a?.applicants[0].email || 'you'}.</p>
    <div class="card" style="text-align:left">
      <h2 class="card-title mb-1">Screening complete</h2>
      <ul class="checks">
        <li><span class="ci pass">${ic('check', { size: 14 })}</span><span>Identity verified</span></li>
        <li><span class="ci pass">${ic('check', { size: 14 })}</span><span>Soft credit check (no effect on your score)</span></li>
        <li><span class="ci pass">${ic('check', { size: 14 })}</span><span>Income and assets verified from bank data</span></li>
      </ul>
    </div>
    <div class="alert info mt-3" style="text-align:left">${ic('eye', { size: 20 })}<div class="alert-body"><strong>Demo: see what the seller sees</strong><p>Your application is now in the seller’s workspace with a scorecard and an Ability-to-Repay worksheet.</p></div><div class="alert-actions"><a class="btn btn-primary btn-sm" href="#/app/applicants/${appId}">Open seller view</a></div></div>
    <p class="mt-3"><button type="button" class="link-btn" data-action="apply-again">Start another application</button></p>
  </div>`;
}

export const applyView = {
  layout: 'apply',
  title: (ctx) => { const d = dealByCode(ctx.params.code); return d ? `Apply · ${d.property.address}` : 'Application'; },
  render(ctx) {
    const d = dealByCode(ctx.params.code);
    if (!d || d.status !== 'listed') {
      return html`<div class="card" style="max-width:640px;margin:40px auto">${empty({ icon: 'tag', title: 'This listing isn’t accepting applications', text: 'The link may be old, or the seller created it in a different browser (demo data lives in each browser).', action: html`<a class="btn btn-primary" href="#/apply/sunset-ridge-4471">See a sample listing</a>` })}</div>`;
    }
    const w = load(d.code);
    if (w.done) return successView(d, w.done);
    return html`
      ${listingHeader(d)}
      <div class="wizard">
        <div class="spread mb-1"><span class="small strong">Step ${w.step + 1} of ${STEPS.length} · ${STEPS[w.step]}</span><span class="xs muted">${ic('lock', { size: 13 })} Encrypted · shared only with this seller</span></div>
        <div class="progress-steps" aria-hidden="true">${STEPS.map((_, i) => html`<span class="${i < w.step ? 'done' : i === w.step ? 'current' : ''}"></span>`)}</div>
        <form class="card" data-form="apply-step" data-live="apply-live" data-code="${d.code}" novalidate>
          ${stepBody(d, w)}
          <div class="wizard-nav">
            ${w.step > 0 ? html`<button type="button" class="btn btn-secondary" data-action="apply-back" data-code="${d.code}">${ic('arrowLeft', { size: 16 })} Back</button>` : html`<span></span>`}
            <button type="submit" class="btn btn-primary">${w.step === STEPS.length - 1 ? html`${ic('send', { size: 16 })} Submit application` : html`Continue ${ic('arrowRight', { size: 16 })}`}</button>
          </div>
        </form>
      </div>`;
  },
};

// Read the current step's fields into wiz.data. Returns validation errors.
function collect(form, d) {
  const v = readForm(form);
  const x = wiz.data;
  const errors = {};
  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
  const phoneOk = (p) => (p || '').replace(/\D/g, '').length >= 10;
  if (wiz.step === 0) {
    x.coApplicant = !!v.coApplicant;
    for (const i of x.coApplicant ? [0, 1] : [0]) {
      const a = x.applicants[i];
      for (const k of ['first', 'last', 'email', 'phone']) if (`a${i}_${k}` in v) a[k] = v[`a${i}_${k}`].trim();
      if (`a${i}_first` in v) {
        if (!a.first) errors[`a${i}_first`] = 'Enter a first name.';
        if (!a.last) errors[`a${i}_last`] = 'Enter a last name.';
        if (!emailOk(a.email)) errors[`a${i}_email`] = 'Enter a valid email.';
        if (!phoneOk(a.phone)) errors[`a${i}_phone`] = 'Enter a 10-digit phone number.';
      }
    }
  } else if (wiz.step === 1) {
    for (const i of x.coApplicant ? [0, 1] : [0]) {
      const a = x.applicants[i];
      a.employmentType = v[`a${i}_employmentType`];
      a.years = v[`a${i}_years`] === '' ? null : parseNum(v[`a${i}_years`], null);
      a.employer = v[`a${i}_employer`].trim();
      a.jobTitle = v[`a${i}_jobTitle`].trim();
      a.monthlyIncome = parseMoneyInput(v[`a${i}_monthlyIncome`]);
      a.otherIncome = parseMoneyInput(v[`a${i}_otherIncome`]);
      if (a.years == null || a.years < 0) errors[`a${i}_years`] = 'Enter years (0 is fine).';
      if (i === 0 && !(a.monthlyIncome > 0) && !(a.otherIncome > 0)) errors[`a${i}_monthlyIncome`] = 'Enter your gross monthly income.';
    }
  } else if (wiz.step === 2) {
    for (const [k] of DEBT_FIELDS) x.debts[k] = parseMoneyInput(v[`debt_${k}`]);
    x.household = { currentHousing: v.currentHousing, currentPayment: parseMoneyInput(v.currentPayment), yearsAtAddress: parseNum(v.yearsAtAddress, null), size: parseNum(v.size, null) };
  } else if (wiz.step === 3) {
    for (const [k] of ASSET_FIELDS) x.assets[k] = parseMoneyInput(v[`asset_${k}`]);
    const price = parseMoneyInput(v.offerPrice), down = parseMoneyInput(v.offerDown);
    x.offer = { price, downPayment: down, moveIn: v.moveIn, occupancy: v.occupancy, note: v.note.trim() };
    if (!(price > 0)) errors.offerPrice = 'Enter your offer price.';
    if (!(down > 0)) errors.offerDown = 'Enter the down payment you can make.';
    else if (down >= price) errors.offerDown = 'The down payment must be less than the price.';
  } else if (wiz.step === 4) {
    x.credit = { band: v.band, bankruptcy: v.bankruptcy, foreclosure: v.foreclosure, eviction: v.eviction };
  } else if (wiz.step === 5) {
    const a0 = x.applicants[0];
    if (!v.consentCredit) errors.consentCredit = 'Required to evaluate your application.';
    if (!v.consentTerms) errors.consentTerms = 'Please confirm.';
    const sig = v.signature.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!sig) errors.signature = 'Type your full name.';
    else if (sig !== `${a0.first} ${a0.last}`.trim().toLowerCase().replace(/\s+/g, ' ')) errors.signature = `Type your name exactly as entered: ${a0.first} ${a0.last}.`;
    x.signature = v.signature.trim();
  }
  return errors;
}

onSubmit({
  'apply-step': (form) => {
    const d = dealByCode(form.dataset.code);
    load(d.code);
    const errors = collect(form, d);
    if (!showErrors(form, errors)) return;
    if (wiz.step < STEPS.length - 1) {
      wiz.step++;
      save();
      document.dispatchEvent(new CustomEvent('sn:rerender'));
      document.querySelector('.wizard')?.scrollIntoView({ block: 'start' });
      const h = document.querySelector('.wizard h2');
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
      return;
    }
    // Submit
    const x = wiz.data;
    const id = uid('app');
    const now = today();
    const applicants = x.applicants.slice(0, x.coApplicant ? 2 : 1).map((a) => ({ ...a }));
    const appRec = {
      id, dealId: d.id, status: 'review', submittedAt: now,
      applicants, household: x.household, debts: x.debts, assets: x.assets, offer: x.offer, credit: x.credit,
      consent: { creditCheck: true, terms: true, signature: x.signature, at: now },
      fee: { amount: PRICING.screening.price, paidBy: d.screeningPaidBy === 'seller' ? 'seller' : 'applicant', paidAt: now },
      documents: [], notes: [], decision: null, simultaneousLoan: 0,
    };
    appRec.screening = simulateScreening(appRec, now);
    update((s) => {
      s.applications.push(appRec);
      logActivity(`New application from ${applicants.map((a) => a.first).join(' & ')} ${applicants[0].last} for ${d.property.address}`, `#/app/applicants/${id}`);
    });
    wiz.done = id;
    save();
    document.dispatchEvent(new CustomEvent('sn:rerender'));
    window.scrollTo(0, 0);
    toast('Application submitted');
  },
});

onLive({
  'apply-live': (form, e) => {
    if (e.target.name !== 'coApplicant') return;
    const d = dealByCode(form.dataset.code);
    load(d.code);
    collect(form, d);
    save();
    document.dispatchEvent(new CustomEvent('sn:rerender'));
  },
});

onAction({
  'apply-back': (el) => {
    const d = dealByCode(el.dataset.code);
    load(d.code);
    const form = el.closest('form');
    collect(form, d);
    wiz.step = Math.max(0, wiz.step - 1);
    save();
    document.dispatchEvent(new CustomEvent('sn:rerender'));
  },
  'apply-again': () => {
    const code = wiz?.code;
    wiz = null;
    try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
    if (code) load(code);
    document.dispatchEvent(new CustomEvent('sn:rerender'));
  },
});

export { raw, esc, fmtDate };
