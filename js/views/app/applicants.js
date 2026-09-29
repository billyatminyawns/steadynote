import { html, raw, esc } from '../../ui/html.js';
import { ic } from '../../ui/icons.js';
import { card, badge, empty, kv, meter, openModal, toast, gradeBadge, alertBox, field, moneyField, checkbox, closeModal } from '../../ui/components.js';
import { onAction, onSubmit, onLive, readForm, showErrors } from '../../ui/actions.js';
import { getState, update, today, dealById, appById, appsForDeal, logActivity, loanStates } from '../../data/store.js';
import { money, money0, fmtDate, pct, ratePct, durationLabel, addDays, addMonths, firstOfNextMonth, uid, parseMoneyInput, parseNum, dollarsInput, isoOf } from '../../core/util.js';
import { analyzeApplication, simulateScreening, EMPLOYMENT_TYPES, DEBT_FIELDS, ASSET_FIELDS, HISTORY_OPTIONS, bandOf, housingFor } from '../../core/qualify.js';
import { pmt } from '../../core/finance.js';
import { hasBalloon } from '../../core/servicing.js';
import { applicantNames, appBadge } from './deals.js';
import { compliance } from '../shared.js';

const toneOf = (an) => an.tone;
const dtiTone = (v) => (v <= 36 ? 'good' : v <= 43 ? 'warning' : v <= 50 ? 'serious' : 'critical');

// ---------------- list ----------------
export const applicantsView = {
  layout: 'app',
  nav: 'applicants',
  title: 'Applicants',
  render(ctx) {
    const s = getState();
    const f = ctx.query.f || 'open';
    const rows = s.applications
      .map((a) => ({ a, d: dealById(a.dealId) }))
      .filter((x) => x.d)
      .map((x) => ({ ...x, an: analyzeApplication(x.a, x.d) }))
      .filter(({ a }) => f === 'all' || (f === 'open' ? ['new', 'review'].includes(a.status) : f === 'decided' ? !['new', 'review'].includes(a.status) : true))
      .sort((x, y) => (x.a.submittedAt < y.a.submittedAt ? 1 : -1));
    const count = (pred) => s.applications.filter(pred).length;
    const chip = (id, label, n) => html`<a class="chip" href="#/app/applicants?f=${id}"${f === id ? raw(' aria-current="true"') : ''}>${label}<span class="n">${n}</span></a>`;
    return html`
    <div class="page-head"><div><h1>Applicants</h1><p>Every buyer who applied to one of your listings, with their scorecard.</p></div></div>
    <div class="chip-row mb-3" role="navigation" aria-label="Filter applicants">
      ${chip('open', 'Needs review', count((a) => ['new', 'review'].includes(a.status)))}
      ${chip('decided', 'Decided', count((a) => !['new', 'review'].includes(a.status)))}
      ${chip('all', 'All', s.applications.length)}
    </div>
    ${rows.length ? html`<div class="card flush"><div class="table-wrap"><table class="tbl">
      <thead><tr><th>Applicant</th><th>Property</th><th>Grade</th><th class="num">DTI</th><th class="num">Down</th><th class="num">Credit</th><th>Status</th></tr></thead>
      <tbody>${rows.map(({ a, d, an }) => html`<tr>
        <td><a class="cell-main" href="#/app/applicants/${a.id}">${applicantNames(a)}</a><span class="cell-sub">Applied ${fmtDate(a.submittedAt)}</span></td>
        <td><a href="#/app/deals/${d.id}" class="cell-main" style="font-weight:500">${d.property.address}</a><span class="cell-sub">${d.property.city}, ${d.property.state}</span></td>
        <td>${gradeBadge(an.grade, `${an.score}`)}</td>
        <td class="num">${an.back.toFixed(1)}%</td>
        <td class="num">${an.downPct.toFixed(0)}%</td>
        <td class="num">${an.credit}${an.creditVerified ? '' : '*'}</td>
        <td>${appBadge(a.status)}</td></tr>`)}</tbody></table></div></div>
      <p class="xs muted mt-1">* Self-reported until screening completes.</p>`
      : html`<div class="card">${empty({ icon: 'users', title: f === 'open' ? 'You’re all caught up' : 'No applicants yet', text: 'Publish a listing and share its application link. Applications appear here with a scorecard.', action: html`<a class="btn btn-secondary" href="#/app/deals">Go to deals</a>` })}</div>`}`;
  },
};

// ---------------- detail ----------------
function scoreCard(an) {
  return card({
    title: 'SteadyNote score',
    sub: 'Weighted on what predicts repayment in owner-financed deals.',
    body: html`
      <div class="score-hero">
        <span class="grade big grade-${an.grade}"><span class="grade-letter">${an.grade}</span></span>
        <div><div class="score-num">${an.score}<small>/100</small></div><div class="strong">${an.gradeLabel}</div></div>
      </div>
      <p class="mt-2">${an.recommendation}</p>
      <div class="mt-2">${an.comps.map((c) => html`<div class="meter-row">
        <div><div class="label">${c.label}</div><div class="xs muted">${c.value}</div></div>
        ${meter({ value: c.points, max: c.max, tone: c.points / c.max >= 0.7 ? 'good' : c.points / c.max >= 0.4 ? 'warning' : 'critical', label: `${c.label} points`, text: `${c.points} of ${c.max} points` })}
        <div class="val">${c.points}<span class="muted xs"> / ${c.max}</span></div>
      </div>`)}</div>
      ${an.strengths.length || an.concerns.length ? html`<div class="grid g-2 mt-2" style="gap:16px">
        <div><h3 class="xs muted" style="text-transform:uppercase;letter-spacing:.06em">Strengths</h3><ul class="factor-list">${an.strengths.map((x) => html`<li><span class="plus">${ic('check', { size: 16 })}</span>${x}</li>`)}${an.strengths.length ? '' : html`<li class="muted">None stand out</li>`}</ul></div>
        <div><h3 class="xs muted" style="text-transform:uppercase;letter-spacing:.06em">Concerns</h3><ul class="factor-list">${an.concerns.map((x) => html`<li><span class="minus">${ic('alert', { size: 16 })}</span>${x}</li>`)}${an.concerns.length ? '' : html`<li class="muted">None</li>`}</ul></div>
      </div>` : ''}
      ${an.flags.length ? html`<div class="stack-sm mt-2">${an.flags.map((f) => alertBox({ tone: f.tone === 'neutral' ? 'info' : f.tone, text: f.text }))}</div>` : ''}`,
  });
}

function affordability(an, deal) {
  const h = an.housing;
  const wi = an.whatIf;
  return card({
    title: 'Can they afford it?',
    body: html`
      <div class="grid g-2" style="gap:24px">
        <div>
          ${kv([
            ['Principal & interest', money(h.pi)],
            ['Property taxes', money(h.taxes)],
            ['Insurance', money(h.insurance)],
            h.hoa ? ['HOA', money(h.hoa)] : null,
            ['Housing payment', html`<strong>${money(h.total)}</strong>`],
            ['Other monthly debts', money(an.debts)],
            ['Gross monthly income used', html`${money(an.income)}${an.verified != null ? html` <span class="badge good">${ic('check', { size: 12 })}verified</span>` : ''}`],
          ], 'one rows')}
        </div>
        <div class="stack">
          <div><div class="spread"><span class="strong small">Debt-to-income (back-end)</span><span class="strong">${pct(an.back)}</span></div>
            ${meter({ value: Math.min(an.back, 70), max: 70, tone: dtiTone(an.back), marks: [{ at: 36, label: '36%' }, { at: 43, label: '43%' }, { at: 50, label: '50%' }], label: 'Debt-to-income ratio', text: pct(an.back) })}</div>
          <div class="mt-1"><div class="spread"><span class="strong small">Housing ratio (front-end)</span><span class="strong">${pct(an.front)}</span></div>
            ${meter({ value: Math.min(an.front, 60), max: 60, tone: an.front <= 31 ? 'good' : an.front <= 36 ? 'warning' : 'critical', marks: [{ at: 31, label: '31%' }], label: 'Housing ratio', text: pct(an.front) })}</div>
          ${kv([['Cash after closing', money0(Math.max(0, an.afterClose))], ['Reserves', `${Math.max(0, an.reserveMonths).toFixed(1)} months`], ['Residual income (est.)', money0(an.residual)], ['Down payment', `${money0(an.down)} (${an.downPct.toFixed(1)}%)`]], 'mt-2')}
        </div>
      </div>
      ${an.back > wi.target ? html`<div class="alert info mt-2">${ic('sparkles', { size: 20 })}<div class="alert-body"><strong>What would make this work</strong>
        <p>At ${ratePct(deal.terms.ratePct)} over ${durationLabel(deal.terms.amortMonths)}, a ${wi.target}% DTI supports a loan of about ${money0(wi.maxLoan)}. That means ${wi.downNeededPct < 60 ? html`a down payment of <strong>${money0(wi.downNeeded)} (${wi.downNeededPct.toFixed(0)}%)</strong>` : 'a much larger down payment than they have'}, or verified income of <strong>${money0(wi.incomeNeeded)}/mo</strong> at the current down payment.</p></div></div>` : ''}`,
  });
}

function atrCard(a, an) {
  const att = a.decision?.atrAttested;
  return card({
    title: 'Ability-to-Repay worksheet',
    sub: 'The eight factors in 12 CFR 1026.43(c)(2), documented for your good-faith determination.',
    action: html`<a class="btn btn-ghost btn-sm" href="#/doc/atr/${a.id}" target="_blank" rel="noopener">${ic('printer', { size: 15 })} Print</a>`,
    body: html`<div class="table-wrap"><table class="tbl compact">
      <thead><tr><th>Factor</th><th>Finding</th><th>Source</th></tr></thead>
      <tbody>${an.atr.map((f, i) => html`<tr><td><span class="strong">${i + 1}. ${f.factor}</span></td><td>${f.value}${f.ok ? '' : html` <span class="badge critical">${ic('alert', { size: 12 })}concern</span>`}</td><td>${f.verified ? badge('good', 'Verified', 'check') : badge('warning', 'Stated')}<span class="cell-sub">${f.source}</span></td></tr>`)}</tbody>
    </table></div>
    <div class="mt-2">${att ? alertBox({ tone: 'good', title: 'Good-faith determination recorded', text: `Attested by ${getState().profile.name || 'you'} on ${fmtDate(a.decision.at)}.` }) : alertBox({ tone: an.atrPass ? 'info' : 'warning', text: an.atrPass ? 'All eight factors support repayment. You’ll attest to your determination when you approve.' : 'One or more factors raise concerns. Document why you still believe the buyer can repay, or decline.' })}</div>`,
  });
}

function screeningCard(a, an) {
  const sc = a.screening;
  if (!sc) {
    return card({ title: 'Screening', body: html`<p class="small">This applicant hasn’t been screened yet. Screening verifies identity, pulls a soft credit report and checks income from bank deposits.</p><button type="button" class="btn btn-primary btn-block" data-action="run-screening" data-id="${a.id}">${ic('shield', { size: 16 })} Run screening${a.fee?.paidBy === 'applicant' ? ' (paid by applicant)' : ' · $49'}</button>` });
  }
  const tl = sc.tradelines || {};
  const stated = an.stated;
  return card({
    title: 'Screening results',
    sub: `Completed ${fmtDate(sc.completedAt)} · fee ${a.fee?.paidBy === 'applicant' ? 'paid by applicant' : 'paid by you'}`,
    body: html`
      <ul class="checks">
        <li><span class="ci pass">${ic('check', { size: 14 })}</span><span><strong>Identity verified</strong><small>${sc.identityMethod}</small></span></li>
        <li><span class="ci ${sc.creditScore >= 620 ? 'pass' : 'fail'}">${ic(sc.creditScore >= 620 ? 'check' : 'alert', { size: 14 })}</span><span><strong>Credit score ${sc.creditScore}</strong><small>${sc.creditBureau}. Applicant self-reported ${bandOf(a.credit?.band).label}.</small></span></li>
        <li><span class="ci ${sc.incomeVerified >= stated * 0.9 ? 'pass' : 'pending'}">${ic(sc.incomeVerified >= stated * 0.9 ? 'check' : 'alert', { size: 14 })}</span><span><strong>Income ${money0(sc.incomeVerified)}/mo verified</strong><small>${sc.incomeSource}. Stated ${money0(stated)}/mo.</small></span></li>
        <li><span class="ci pass">${ic('check', { size: 14 })}</span><span><strong>Liquid assets ${money0(sc.assetsVerified)}</strong><small>${sc.assetsSource}</small></span></li>
      </ul>
      ${kv([['Open accounts', tl.open], ['Card utilization', `${tl.utilization}%`], ['Late payments (24 mo)', tl.lates24], ['Collections', tl.collections], ['Oldest account', `${tl.oldestYears} yrs`]], 'mt-2')}
      <p class="xs muted mt-2 mb-0">Demo data: a production account connects to a credit bureau, an identity service and bank-data aggregation.</p>`,
  });
}

function detailsCard(a) {
  const ap = a.applicants || [];
  return card({
    title: 'Application',
    body: html`
      ${ap.map((p) => html`<div class="applicant-block">
        <h3>${p.first} ${p.last}</h3>
        ${kv([['Employment', EMPLOYMENT_TYPES[p.employmentType] || '—'], ['Employer', p.employer || '—'], ['Role', p.jobTitle || '—'], ['Time in line of work', p.years ? `${p.years} years` : '—'], ['Gross income', `${money0(p.monthlyIncome)}/mo`], ['Other income', p.otherIncome ? `${money0(p.otherIncome)}/mo · ${p.otherIncomeSource || 'other'}` : 'None'], ['Email', p.email], ['Phone', p.phone]])}
      </div>`)}
      <div class="grid g-2 mt-2" style="gap:20px">
        <div><h3 class="small">Monthly debts</h3>${kv(DEBT_FIELDS.filter(([k]) => a.debts?.[k]).map(([k, l]) => [l, money0(a.debts[k])]).concat([['Total', money0(DEBT_FIELDS.reduce((s, [k]) => s + (a.debts?.[k] || 0), 0))]]), 'one rows')}</div>
        <div><h3 class="small">Assets</h3>${kv(ASSET_FIELDS.filter(([k]) => a.assets?.[k]).map(([k, l]) => [l, money0(a.assets[k])]), 'one rows')}</div>
      </div>
      <div class="grid g-2 mt-2" style="gap:20px">
        <div><h3 class="small">Housing & history</h3>${kv([['Household size', a.household?.size || '—'], ['Current housing', a.household?.currentHousing === 'rent' ? `Renting · ${money0(a.household.currentPayment)}/mo` : a.household?.currentHousing || '—'], ['Bankruptcy', HISTORY_OPTIONS.bankruptcy[a.credit?.bankruptcy || 'none']], ['Foreclosure', HISTORY_OPTIONS.foreclosure[a.credit?.foreclosure || 'none']], ['Eviction', HISTORY_OPTIONS.eviction[a.credit?.eviction || 'none']]], 'one rows')}</div>
        <div><h3 class="small">Documents</h3>${(a.documents || []).length ? html`<ul class="feed">${a.documents.map((d) => html`<li><span class="feed-icon">${ic('file', { size: 15 })}</span><span class="feed-body"><strong>${d.name}</strong><span class="feed-meta">${d.kind} · ${d.size}</span></span></li>`)}</ul>` : html`<p class="muted small">None uploaded.</p>`}</div>
      </div>
      ${a.offer?.note ? html`<div class="mt-2"><h3 class="small">Note to you</h3><blockquote class="note-list" style="margin:0"><li style="list-style:none">“${a.offer.note}”</li></blockquote></div>` : ''}`,
  });
}

export const applicantDetailView = {
  layout: 'app',
  nav: 'applicants',
  title: (ctx) => { const a = appById(ctx.params.id); return a ? applicantNames(a) : 'Applicant'; },
  render(ctx) {
    const a = appById(ctx.params.id);
    const d = a && dealById(a.dealId);
    if (!a || !d) return card({ body: empty({ title: 'Applicant not found', action: html`<a class="btn btn-primary" href="#/app/applicants">Back to applicants</a>` }) });
    const an = analyzeApplication(a, d);
    const others = appsForDeal(d.id).filter((x) => x.id !== a.id).map((x) => ({ x, an: analyzeApplication(x, d) })).sort((p, q) => q.an.score - p.an.score);
    const open = ['new', 'review'].includes(a.status);
    const dec = a.decision;
    return html`
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/app/applicants">Applicants</a>${ic('chevronRight', { size: 14 })}<a href="#/app/deals/${d.id}">${d.property.address}</a>${ic('chevronRight', { size: 14 })}<span>${applicantNames(a)}</span></nav>
    <div class="page-head">
      <div><div class="title-row"><h1>${applicantNames(a)}</h1>${appBadge(a.status)}</div>
        <p>Applied ${fmtDate(a.submittedAt)} for <a href="#/app/deals/${d.id}">${d.property.address}</a> · offering ${money0(an.price)} with ${an.downPct.toFixed(0)}% down${a.offer?.occupancy === 'investment' ? ' · investor' : ''}</p></div>
      <div class="btn-row wrap">
        ${open ? html`
          <button type="button" class="btn btn-primary" data-action="approve-app" data-id="${a.id}">${ic('check', { size: 16 })} Approve</button>
          <button type="button" class="btn btn-secondary" data-action="request-info" data-id="${a.id}">${ic('mail', { size: 16 })} Request info</button>
          <button type="button" class="btn btn-ghost" data-action="decline-app" data-id="${a.id}">${ic('x', { size: 16 })} Decline</button>` : ''}
        ${a.status === 'approved' && d.status !== 'closed' ? html`<button type="button" class="btn btn-primary" data-action="close-loan" data-id="${a.id}">${ic('key', { size: 16 })} Close & start servicing</button>` : ''}
        ${a.status === 'declined' || a.status === 'not_selected' ? html`<a class="btn btn-secondary" href="#/doc/adverse/${a.id}" target="_blank" rel="noopener">${ic('file', { size: 16 })} Adverse action notice</a>` : ''}
        ${a.status === 'closed' && d.loanId ? html`<a class="btn btn-secondary" href="#/app/loans/${d.loanId}">${ic('file', { size: 16 })} Open loan</a>` : ''}
      </div>
    </div>
    ${a.status === 'approved' && d.status !== 'closed' ? html`<div class="mb-3">${alertBox({ tone: 'good', title: 'Approved. Next: closing', text: 'Your partner attorney or title company prepares the note and deed of trust. When it records, click “Close & start servicing” and SteadyNote takes it from there.' })}</div>` : ''}
    ${dec && dec.status === 'declined' ? html`<div class="mb-3">${alertBox({ tone: 'neutral', title: `Declined ${fmtDate(dec.at)}`, text: `Reasons: ${(dec.reasons || []).join('; ') || '—'}. ${dec.adverseActionSentAt ? `Adverse action notice sent ${fmtDate(dec.adverseActionSentAt)}.` : ''}` })}</div>` : ''}
    <div class="grid g-main">
      <div class="stack-lg">
        ${scoreCard(an)}
        ${affordability(an, d)}
        ${atrCard(a, an)}
        ${detailsCard(a)}
      </div>
      <div class="stack-lg">
        ${screeningCard(a, an)}
        ${card({ title: 'Their offer', body: kv([
          ['Price', money0(an.price)],
          ['Down payment', `${money0(an.down)} (${an.downPct.toFixed(1)}%)`],
          ['Financed', money0(an.housing.loan)],
          ['Terms', `${ratePct(d.terms.ratePct)} · ${durationLabel(d.terms.amortMonths)}${hasBalloon(d.terms) ? ` · ${durationLabel(d.terms.balloonMonths)} balloon` : ''}`],
          ['Payment (P&I)', money(an.housing.pi)],
          ['Move-in', a.offer?.moveIn ? fmtDate(a.offer.moveIn) : 'Flexible'],
          ['Will', a.offer?.occupancy === 'investment' ? 'Rent it out' : 'Live in the home'],
        ], 'one rows') })}
        ${others.length ? card({ title: 'Other applicants', sub: d.property.address, body: html`<div class="stack-sm">${others.map(({ x, an: o }) => html`<a class="doc-item" href="#/app/applicants/${x.id}">${gradeBadge(o.grade)}<span class="grow"><strong>${applicantNames(x)}</strong><span>${o.score}/100 · DTI ${o.back.toFixed(0)}% · ${o.downPct.toFixed(0)}% down</span></span>${appBadge(x.status)}</a>`)}</div>` }) : ''}
      </div>
    </div>`;
  },
};

// ---------------- actions ----------------
const DECLINE_REASONS = [
  ['dti', 'Excessive obligations in relation to income'],
  ['income', 'Income insufficient for amount of credit requested'],
  ['funds', 'Insufficient funds for down payment and closing costs'],
  ['delinquent', 'Delinquent past or present credit obligations'],
  ['limited', 'Limited credit experience'],
  ['employment', 'Length of employment'],
  ['verify', 'Unable to verify income'],
  ['eviction', 'Eviction or unsatisfactory rental history'],
  ['terms', 'We do not grant credit on the terms you requested'],
];

function suggestedReasons(an) {
  const out = new Set();
  if (an.back > 43) out.add('dti');
  if (an.afterClose < 0) out.add('funds');
  if (an.credit < 620) out.add('delinquent');
  if (an.years < 2 && an.empType !== 'retired') out.add('employment');
  if (an.derogs.some((d) => d.startsWith('Eviction'))) out.add('eviction');
  if (an.downPct < 10) out.add('terms');
  return out;
}

function approvePreview(form, a, d) {
  const down = parseMoneyInput(form.elements.downPayment.value);
  const rate = parseNum(form.elements.ratePct.value, d.terms.ratePct);
  const deal2 = { ...d, terms: { ...d.terms, ratePct: rate } };
  const app2 = { ...a, offer: { ...a.offer, downPayment: down } };
  const an = analyzeApplication(app2, deal2);
  const out = form.querySelector('[data-approve-preview]');
  if (out) out.innerHTML = `P&amp;I <strong>${esc(money(an.housing.pi))}</strong> · housing ${esc(money(an.housing.total))} · DTI <strong>${an.back.toFixed(1)}%</strong> · grade <strong>${an.grade}</strong>`;
}

onLive({
  'approve-form': (form) => {
    const a = appById(form.dataset.id);
    approvePreview(form, a, dealById(a.dealId));
  },
});

onAction({
  'run-screening': (el) => {
    const id = el.dataset.id;
    update((s) => {
      const a = s.applications.find((x) => x.id === id);
      a.screening = simulateScreening(a, today());
      a.status = 'review';
      logActivity(`Screening completed for ${applicantNames(a)}`, `#/app/applicants/${a.id}`);
    });
    toast('Screening complete');
  },
  'approve-app': (el) => {
    const a = appById(el.dataset.id);
    const d = dealById(a.dealId);
    const an = analyzeApplication(a, d);
    const c = compliance(d, { atrDone: null });
    const atrRequired = c.verdict.path === 'three' || (c.scope.dwelling && c.scope.consumer && c.verdict.path !== 'one');
    openModal({
      title: `Approve ${applicantNames(a)}?`,
      size: 'md',
      body: `<form data-form="approve" data-live="approve-form" data-id="${a.id}" id="approve-form" novalidate>
        <p class="small">Confirm the terms you’re approving. You can counter on the down payment or rate.</p>
        <div class="form-grid">
          ${moneyField({ label: 'Down payment', name: 'downPayment', value: dollarsInput(an.down) })}
          ${field({ label: 'Interest rate', name: 'ratePct', value: d.terms.ratePct, suffix: '%', inputmode: 'decimal' })}
        </div>
        <p class="small mt-2 mb-2" data-approve-preview></p>
        ${checkbox({ name: 'atr', label: 'I’ve reviewed the Ability-to-Repay worksheet', desc: `I determined in good faith that the buyer has a reasonable ability to repay this loan.${atrRequired ? ' Required to use the three-property exclusion.' : ''}`, required: atrRequired })}
        ${field({ label: 'Message to the buyer (optional)', name: 'message', type: 'textarea', rows: 2, placeholder: 'Congratulations! Our attorney will reach out to schedule closing.' })}
      </form>`,
      footer: `<button type="button" class="btn btn-secondary" data-action="modal-close">Cancel</button><button type="submit" form="approve-form" class="btn btn-primary">Approve & notify buyer</button>`,
      onMount: (dlg) => approvePreview(dlg.querySelector('form'), a, d),
    });
  },
  'request-info': (el) => {
    const a = appById(el.dataset.id);
    openModal({
      title: 'Request more information',
      body: `<form data-form="request-info" data-id="${a.id}" id="ri-form">
        <p class="small">We’ll email ${esc(a.applicants[0].first)} a secure upload link.</p>
        <div class="stack-sm">
          ${['Two most recent pay stubs', 'Last two years of tax returns', 'Two months of bank statements', 'Landlord reference', 'Letter explaining credit events'].map((x, i) => checkbox({ name: `doc${i}`, label: x, checked: i === 0 }))}
        </div>
        ${field({ label: 'Message', name: 'message', type: 'textarea', rows: 2, value: 'Thanks for applying! Could you upload the items above so I can finish reviewing?' })}
      </form>`,
      footer: `<button type="button" class="btn btn-secondary" data-action="modal-close">Cancel</button><button type="submit" form="ri-form" class="btn btn-primary">Send request</button>`,
    });
  },
  'decline-app': (el) => {
    const a = appById(el.dataset.id);
    const d = dealById(a.dealId);
    const an = analyzeApplication(a, d);
    const sug = suggestedReasons(an);
    openModal({
      title: `Decline ${applicantNames(a)}?`,
      size: 'md',
      body: `<form data-form="decline" data-id="${a.id}" id="decline-form">
        <p class="small">Choose the principal reasons. The Equal Credit Opportunity Act requires a written notice with specific reasons; because a credit report was used, it also includes the score and the applicant’s FCRA rights.</p>
        <fieldset><legend class="field-label mb-1">Reasons</legend><div class="stack-sm">${DECLINE_REASONS.map(([k, l]) => checkbox({ name: `r_${k}`, label: l, checked: sug.has(k) }))}</div></fieldset>
        <div class="mt-2">${checkbox({ name: 'send', label: 'Send the adverse action notice now', desc: 'Emailed and available as a printable letter.', checked: true })}</div>
      </form>`,
      footer: `<button type="button" class="btn btn-secondary" data-action="modal-close">Cancel</button><button type="submit" form="decline-form" class="btn btn-danger">Decline applicant</button>`,
    });
  },
  'close-loan': (el) => {
    const a = appById(el.dataset.id);
    const d = dealById(a.dealId);
    const close = addDays(today(), 14);
    const firstDue = addMonths(firstOfNextMonth(close), 1);
    openModal({
      title: 'Close & start servicing',
      body: `<form data-form="close-loan" data-id="${a.id}" id="close-form" novalidate>
        <p class="small">Enter the dates from your closing documents. SteadyNote boards the loan, builds the schedule and invites the buyer to their portal and autopay.</p>
        <div class="form-grid">
          ${field({ label: 'Closing (recording) date', name: 'closingDate', type: 'date', value: close, required: true })}
          ${field({ label: 'First payment due', name: 'firstDue', type: 'date', value: firstDue, required: true })}
        </div>
        <div class="mt-2 stack-sm">
          ${checkbox({ name: 'invite', label: 'Invite the buyer to autopay', desc: 'They link a bank account in the borrower portal.', checked: true })}
          ${d.terms.escrow ? checkbox({ name: 'escrow', label: 'Open an escrow account for taxes & insurance', desc: 'Initial deposit: two months of escrow, collected at closing.', checked: true }) : ''}
          ${checkbox({ name: 'others', label: 'Mark the other applicants as not selected', checked: true })}
        </div>
      </form>`,
      footer: `<button type="button" class="btn btn-secondary" data-action="modal-close">Cancel</button><button type="submit" form="close-form" class="btn btn-primary">Board loan</button>`,
    });
  },
});

onSubmit({
  approve: (form) => {
    const a = appById(form.dataset.id);
    const d = dealById(a.dealId);
    const v = readForm(form);
    const errors = {};
    const down = parseMoneyInput(v.downPayment);
    const rate = parseNum(v.ratePct, NaN);
    if (!(down >= 0 && down < (a.offer?.price || d.terms.salePrice))) errors.downPayment = 'Enter a down payment below the price.';
    if (!(rate >= 0 && rate <= 30)) errors.ratePct = 'Enter a rate between 0 and 30%.';
    const box = form.querySelector('[name=atr]');
    if (box.required && !box.checked) errors.atr = 'Required for the three-property exclusion.';
    if (!showErrors(form, errors)) return;
    closeModal(form);
    update((s) => {
      const x = s.applications.find((y) => y.id === a.id);
      x.status = 'approved';
      x.decision = { status: 'approved', at: today(), atrAttested: !!v.atr, counter: { downPayment: down, ratePct: rate }, message: v.message || '' };
      x.offer = { ...x.offer, downPayment: down };
      const deal = s.deals.find((y) => y.id === d.id);
      if (rate !== deal.terms.ratePct) deal.terms.ratePct = rate;
      deal.acceptedAppId = x.id;
      logActivity(`Approved ${applicantNames(x)} for ${deal.property.address}`, `#/app/applicants/${x.id}`);
    });
    toast(`Approved. We emailed ${a.applicants[0].first} the next steps (demo).`);
  },
  'request-info': (form) => {
    const a = appById(form.dataset.id);
    const v = readForm(form);
    closeModal(form);
    update((s) => {
      const x = s.applications.find((y) => y.id === a.id);
      x.notes = x.notes || [];
      x.notes.push({ date: today(), text: `Requested documents: ${Object.entries(v).filter(([k, val]) => k.startsWith('doc') && val).length} item(s). ${v.message || ''}` });
      logActivity(`Requested more info from ${applicantNames(x)}`, `#/app/applicants/${x.id}`);
    });
    toast('Request sent (demo)');
  },
  decline: (form) => {
    const a = appById(form.dataset.id);
    const v = readForm(form);
    const reasons = DECLINE_REASONS.filter(([k]) => v[`r_${k}`]).map(([, l]) => l);
    if (!reasons.length) { showErrors(form, { r_dti: 'Choose at least one reason.' }); return; }
    closeModal(form);
    update((s) => {
      const x = s.applications.find((y) => y.id === a.id);
      x.status = 'declined';
      x.decision = { status: 'declined', at: today(), reasons, adverseActionSentAt: v.send ? today() : null };
      logActivity(`Declined ${applicantNames(x)}${v.send ? ' · adverse action notice sent' : ''}`, `#/app/applicants/${x.id}`);
    });
    toast(v.send ? 'Declined. Adverse action notice sent.' : 'Declined');
  },
  'close-loan': (form) => {
    const a = appById(form.dataset.id);
    const d = dealById(a.dealId);
    const v = readForm(form);
    const errors = {};
    if (!v.closingDate) errors.closingDate = 'Enter the closing date.';
    if (!v.firstDue || v.firstDue <= v.closingDate) errors.firstDue = 'First payment must be after closing.';
    if (!showErrors(form, errors)) return;
    closeModal(form);
    const loanId = uid('ln');
    update((s) => {
      const t = d.terms;
      const price = a.offer?.price || t.salePrice;
      const down = a.decision?.counter?.downPayment ?? a.offer?.downPayment ?? Math.round((price * t.downPct) / 100);
      const principal = price - down;
      const n = 1001 + s.loans.filter((l) => /^SN-1\d{3}$/.test(l.number)).length;
      let num = `SN-${n}`;
      while (s.loans.some((l) => l.number === num)) num = `SN-${Number(num.slice(3)) + 1}`;
      const escrowOn = !!(t.escrow && v.escrow);
      const monthlyEsc = Math.round(((t.taxesAnnual || 0) + (t.insuranceAnnual || 0)) / 12);
      const ap = a.applicants || [];
      s.loans.push({
        id: loanId,
        number: num,
        dealId: d.id,
        applicationId: a.id,
        createdAt: today(),
        plan: escrowOn ? 'complete' : 'essentials',
        borrower: { name: applicantNames(a), first: ap[0]?.first, email: ap[0]?.email, phone: ap[0]?.phone, tinLast4: null, tinOnFile: false },
        property: { ...d.property, occupancy: a.offer?.occupancy || t.occupancy || 'owner' },
        terms: { salePrice: price, downPayment: down, principal, ratePct: t.ratePct, rateType: 'fixed', amortMonths: t.amortMonths, balloonMonths: t.balloonMonths || null, closingDate: v.closingDate, firstDue: v.firstDue, payment: pmt(principal, t.ratePct, t.amortMonths), graceDays: t.graceDays ?? 15, lateFee: t.lateFee || { type: 'pct', pct: 5 }, escrow: escrowOn },
        escrow: escrowOn ? { enabled: true, monthly: monthlyEsc, startBalance: monthlyEsc * 2, taxesAnnual: t.taxesAnnual, insuranceAnnual: t.insuranceAnnual, taxDueMonths: [4, 10], insuranceMonth: +v.closingDate.slice(5, 7) } : { enabled: false },
        autopay: { enabled: false, invited: !!v.invite },
        insurance: { carrier: '', policy: '', expires: addMonths(v.closingDate, 12), mortgageeListed: false, renewalReceived: false },
        tax: { adjustedBasis: null, sellingExpenses: null },
        transactions: [],
        notes: [{ date: today(), text: `Boarded from ${d.property.address} closing. ATR ${a.decision?.atrAttested ? 'attested' : 'not attested'}.` }],
        release: null,
      });
      const deal = s.deals.find((y) => y.id === d.id);
      deal.status = 'closed';
      deal.closedAt = v.closingDate;
      deal.loanId = loanId;
      const x = s.applications.find((y) => y.id === a.id);
      x.status = 'closed';
      if (v.others) s.applications.filter((y) => y.dealId === d.id && y.id !== a.id && ['new', 'review'].includes(y.status)).forEach((y) => { y.status = 'not_selected'; });
      logActivity(`Loan boarded: ${num} for ${applicantNames(a)}`, `#/app/loans/${loanId}`);
    });
    toast('Loan boarded. The buyer has been invited to their portal.');
    location.hash = `#/app/loans/${loanId}`;
  },
});

export { housingFor, loanStates, isoOf, toneOf };
