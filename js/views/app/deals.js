import { html, raw } from '../../ui/html.js';
import { ic } from '../../ui/icons.js';
import { card, badge, empty, kv, propertyArt, toast, copyText, openModal, alertBox, gradeBadge, closeModal } from '../../ui/components.js';
import { onAction, onSubmit, showErrors } from '../../ui/actions.js';
import { getState, update, today, dealById, appsForDeal, logActivity, loanById } from '../../data/store.js';
import { money, money0, fmtDate, ratePct, durationLabel, uid, hashStr } from '../../core/util.js';
import { analyzeApplication, housingFor, offerOf } from '../../core/qualify.js';
import { hasBalloon } from '../../core/servicing.js';
import { compliance, complianceBlock, termsLine, propertyFacts } from '../shared.js';
import { blankDeal, builderLayout, mountBuilder, readDealForm, dealMath } from '../deal-form.js';

export const DEAL_STATUS = {
  draft: ['neutral', 'Draft', 'pencil'],
  listed: ['good', 'Listed', 'tag'],
  closed: ['brand', 'Closed', 'check'],
  archived: ['outline', 'Archived', 'x'],
};
export const dealBadge = (st) => { const [t, l, i] = DEAL_STATUS[st] || DEAL_STATUS.draft; return badge(t, l, i); };
export const APP_STATUS = {
  new: ['info', 'New'],
  review: ['info', 'Ready to review'],
  approved: ['good', 'Approved'],
  declined: ['critical', 'Declined'],
  closed: ['brand', 'Closed'],
  not_selected: ['neutral', 'Not selected'],
  withdrawn: ['neutral', 'Withdrawn'],
};
export const appBadge = (st) => { const [t, l] = APP_STATUS[st] || APP_STATUS.new; return badge(t, l); };
export const applyUrl = (code) => `${location.origin}${location.pathname}#/apply/${code}`;
export const applicantNames = (a) => {
  const ap = a.applicants || [];
  if (ap.length === 2 && ap[0].last === ap[1].last) return `${ap[0].first} & ${ap[1].first} ${ap[0].last}`;
  return ap.map((x) => `${x.first} ${x.last}`).join(' & ');
};

function makeCode(deal) {
  const s = getState();
  const words = (deal.property.address || 'listing').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim().split(/\s+/);
  const num = words.find((w) => /^\d+$/.test(w)) || String(hashStr(deal.id) % 9000 + 1000);
  const name = words.filter((w) => !/^\d+$/.test(w) && !['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se', 'st', 'rd', 'dr', 'ave', 'ln', 'ct', 'way', 'blvd', 'lot'].includes(w)).slice(0, 2).join('-') || 'home';
  let code = `${name}-${num}`;
  let i = 2;
  while (s.deals.some((d) => d.code === code && d.id !== deal.id)) code = `${name}-${num}-${i++}`;
  return code;
}

// ---------------- list ----------------
export const dealsView = {
  layout: 'app',
  nav: 'deals',
  title: 'Deals & listings',
  render(ctx) {
    const s = getState();
    const f = ctx.query.f || 'all';
    const counts = { all: s.deals.length, listed: 0, draft: 0, closed: 0 };
    s.deals.forEach((d) => { if (counts[d.status] != null) counts[d.status]++; });
    const list = s.deals.filter((d) => f === 'all' || d.status === f);
    const chip = (id, label) => html`<a class="chip" href="#/app/deals?f=${id}"${f === id ? raw(' aria-current="true"') : ''}>${label}<span class="n">${counts[id] ?? 0}</span></a>`;
    return html`
    <div class="page-head">
      <div><h1>Deals & listings</h1><p>Structure offers, publish a listing, and collect applications.</p></div>
      <a class="btn btn-primary" href="#/app/deals/new">${ic('plus', { size: 16 })} New deal</a>
    </div>
    <div class="chip-row mb-3" role="navigation" aria-label="Filter deals">${chip('all', 'All')}${chip('listed', 'Listed')}${chip('draft', 'Drafts')}${chip('closed', 'Closed')}</div>
    ${list.length ? html`<div class="deal-cards">${list.map((d) => {
      const apps = appsForDeal(d.id);
      const m = dealMath(d);
      const c = d.status === 'draft' ? compliance(d) : null;
      return html`<a class="deal-card" href="#/app/deals/${d.id}">
        ${propertyArt(d.property)}
        <div class="deal-card-body">
          <div class="spread">${dealBadge(d.status)}<span class="strong">${money0(d.terms.salePrice)}</span></div>
          <h3>${d.property.address}</h3>
          <div class="small muted">${[d.property.city, d.property.state].filter(Boolean).join(', ')} · ${propertyFacts(d.property)}</div>
          <div class="terms-line">${termsLine(d.terms)} · ${money(m.a.payment)}/mo P&I</div>
          <div class="foot">
            ${d.status === 'listed' ? html`<span>${ic('users', { size: 14 })} ${apps.length} applicant${apps.length === 1 ? '' : 's'}</span><span>Listed ${fmtDate(d.listedAt, 'short')}</span>` : ''}
            ${d.status === 'draft' ? html`<span>${c.verdict.tone === 'critical' ? html`<span class="bad-text">${ic('alert', { size: 14 })} Needs changes</span>` : html`<span class="good-text">${ic('shield', { size: 14 })} Compliance OK</span>`}</span><span>Created ${fmtDate(d.createdAt, 'short')}</span>` : ''}
            ${d.status === 'closed' ? html`<span>${ic('file', { size: 14 })} ${loanById(d.loanId)?.number || 'Loan'}</span><span>Closed ${fmtDate(d.closedAt, 'short')}</span>` : ''}
            ${d.status === 'archived' ? html`<span>Archived</span>` : ''}
          </div>
        </div>
      </a>`;
    })}</div>` : card({ body: empty({ icon: 'tag', title: f === 'all' ? 'No deals yet' : 'Nothing here', text: 'Structure an offer to see the payment, what you’ll collect and a compliance check.', action: html`<a class="btn btn-primary" href="#/app/deals/new">New deal</a>` }) })}`;
  },
};

// ---------------- detail ----------------
export const dealDetailView = {
  layout: 'app',
  nav: 'deals',
  title: (ctx) => dealById(ctx.params.id)?.property.address || 'Deal',
  render(ctx) {
    const d = dealById(ctx.params.id);
    if (!d) return card({ body: empty({ icon: 'tag', title: 'Deal not found', action: html`<a class="btn btn-primary" href="#/app/deals">Back to deals</a>` }) });
    const t = d.terms;
    const m = dealMath(d);
    const apps = appsForDeal(d.id).map((a) => ({ a, an: analyzeApplication(a, d) })).sort((x, y) => y.an.score - x.an.score);
    const atrDone = apps.some(({ a }) => a.decision?.status === 'approved' && a.decision.atrAttested) || null;
    const c = compliance(d, { atrDone });
    const url = d.code ? applyUrl(d.code) : '';
    return html`
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/app/deals">Deals & listings</a>${ic('chevronRight', { size: 14 })}<span>${d.property.address}</span></nav>
    <div class="page-head">
      <div class="prop-head">
        <div class="prop-thumb">${propertyArt(d.property)}</div>
        <div><div class="title-row"><h1>${d.property.address}</h1>${dealBadge(d.status)}</div><p>${[d.property.city, d.property.state, d.property.zip].filter(Boolean).join(', ')} · ${propertyFacts(d.property)}</p></div>
      </div>
      <div class="btn-row wrap">
        ${d.status !== 'closed' ? html`<a class="btn btn-secondary" href="#/app/deals/${d.id}/edit">${ic('pencil', { size: 16 })} Edit terms</a>` : ''}
        ${d.status === 'draft' ? html`<button type="button" class="btn btn-primary" data-action="publish-deal" data-id="${d.id}">${ic('send', { size: 16 })} Publish listing</button>` : ''}
        ${d.status === 'listed' ? html`<a class="btn btn-primary" href="#/apply/${d.code}" target="_blank" rel="noopener">${ic('eye', { size: 16 })} Preview application</a>` : ''}
        ${d.status === 'closed' && d.loanId ? html`<a class="btn btn-primary" href="#/app/loans/${d.loanId}">${ic('file', { size: 16 })} Open loan</a>` : ''}
        ${['draft', 'listed'].includes(d.status) ? html`<button type="button" class="btn btn-ghost" data-action="archive-deal" data-id="${d.id}">Archive</button>` : ''}
      </div>
    </div>
    <div class="grid g-main">
      <div class="stack-lg">
        ${d.status !== 'draft' ? card({
          title: 'Applicants',
          sub: apps.length ? 'Ranked by SteadyNote score. Open one to see the full scorecard and ATR worksheet.' : 'No applications yet.',
          body: apps.length ? html`<div class="table-wrap"><table class="tbl">
            <thead><tr><th>Applicant</th><th>Grade</th><th class="num">DTI</th><th class="num">Down</th><th class="num">Credit</th><th>Status</th></tr></thead>
            <tbody>${apps.map(({ a, an }) => html`<tr>
              <td><a class="cell-main" href="#/app/applicants/${a.id}">${applicantNames(a)}</a><span class="cell-sub">Applied ${fmtDate(a.submittedAt)} · ${(a.applicants || []).map((p) => p.jobTitle).filter(Boolean).join(', ')}</span></td>
              <td>${gradeBadge(an.grade, `${an.score}/100`)}</td>
              <td class="num ${an.back > 43 ? 'bad-text' : ''}">${an.back.toFixed(1)}%</td>
              <td class="num">${an.downPct.toFixed(0)}%</td>
              <td class="num">${an.credit}${an.creditVerified ? '' : '*'}</td>
              <td>${appBadge(a.status)}</td></tr>`)}</tbody></table></div>`
            : empty({ icon: 'users', title: 'Share your application link', text: 'Buyers apply from their phone and pay their own screening fee. You’ll see a scorecard for each one here.' }),
        }) : ''}
        ${card({ title: 'Offer terms', action: d.status !== 'closed' ? html`<a class="btn btn-ghost btn-sm" href="#/app/deals/${d.id}/edit">Edit</a>` : '', body: html`
          <div class="grid g-2" style="gap:24px">
            ${kv([
              ['Sale price', money0(t.salePrice)],
              ['Down payment', `${money0(m.down)} (${+t.downPct.toFixed(2)}%)`],
              ['Seller-financed amount', money0(m.principal)],
              ['Interest rate', `${ratePct(t.ratePct)} fixed`],
              ['Amortization', durationLabel(t.amortMonths)],
              ['Balloon', hasBalloon(t) ? `After ${durationLabel(t.balloonMonths)} · ${money0(m.a.balloonAmount)}` : 'None, fully amortizing'],
            ], 'one rows')}
            ${kv([
              ['Principal & interest', money(m.a.payment)],
              ['Taxes & insurance', `${money(m.taxes + m.ins)}/mo${t.escrow ? ' (escrowed)' : ' (paid by buyer)'}`],
              ['Total housing payment', money(m.piti)],
              ['Grace period / late charge', `${t.graceDays} days · ${t.lateFee?.pct ?? 5}% of P&I`],
              ['Buyer occupancy', t.occupancy === 'investment' ? 'Investor (rental)' : 'Owner-occupant'],
              ['Minimums', `${t.minCredit ? `${t.minCredit}+ credit` : 'No credit minimum'}${t.minDownPct ? ` · ${t.minDownPct}% down` : ''}`],
            ], 'one rows')}
          </div>` })}
        ${d.property.description ? card({ title: 'Listing description', body: html`<p class="mb-0">${d.property.description}</p>` }) : ''}
      </div>
      <div class="stack-lg">
        ${d.status === 'listed' ? card({ title: 'Share your listing', sub: 'Send this link to interested buyers or add it to your listing on Zillow, Craigslist or a yard sign QR code.', body: html`
          <div class="share-box"><label class="sr-only" for="share-url">Application link</label><input id="share-url" type="text" readonly value="${url}"><button type="button" class="btn btn-secondary" data-action="copy" data-text="${url}">${ic('copy', { size: 16 })}<span class="sr-only">Copy link</span></button></div>
          <div class="btn-row wrap mt-2"><a class="btn btn-ghost btn-sm" href="#/apply/${d.code}">${ic('external', { size: 15 })} Open application page</a></div>
          <p class="xs muted mt-2 mb-0">${d.screeningPaidBy === 'seller' ? 'You pay the $49 screening fee per applicant.' : 'Applicants pay the $49 screening fee (ID, credit and income verification).'} Listed ${fmtDate(d.listedAt)}.</p>` }) : ''}
        ${d.status === 'draft' ? card({ title: 'Ready to publish?', body: html`<p class="small">Publishing creates a listing page and a buyer application link. You can keep editing terms afterward.</p><button type="button" class="btn btn-primary btn-block" data-action="publish-deal" data-id="${d.id}">${ic('send', { size: 16 })} Publish listing</button>` }) : ''}
        ${d.status === 'closed' && d.loanId ? card({ title: 'Closed and in servicing', body: html`<p class="small">Closed ${fmtDate(d.closedAt)}. Payments, escrow and reminders are running on ${loanById(d.loanId)?.number}.</p><a class="btn btn-secondary btn-block" href="#/app/loans/${d.loanId}">Open loan</a>` }) : ''}
        ${card({ title: 'Compliance', sub: 'Updated live from your profile and these terms.', body: complianceBlock(c) })}
      </div>
    </div>`;
  },
};

// ---------------- editor ----------------
let editing = null;
export const dealEditorView = {
  layout: 'app',
  nav: 'deals',
  title: (ctx) => (ctx.params.id ? 'Edit deal' : 'New deal'),
  render(ctx) {
    const existing = ctx.params.id ? dealById(ctx.params.id) : null;
    if (ctx.params.id && !existing) return card({ body: empty({ title: 'Deal not found', action: html`<a class="btn btn-primary" href="#/app/deals">Back to deals</a>` }) });
    const key = ctx.params.id || 'new';
    if (!editing || editing.key !== key) editing = { key, deal: existing ? JSON.parse(JSON.stringify(existing)) : blankDeal() };
    const d = editing.deal;
    const apps = existing ? appsForDeal(existing.id) : [];
    return html`
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/app/deals">Deals & listings</a>${ic('chevronRight', { size: 14 })}<span>${existing ? existing.property.address : 'New deal'}</span></nav>
    <div class="page-head"><div><h1>${existing ? 'Edit deal terms' : 'Structure a new deal'}</h1><p>Everything on the right updates as you type, including the compliance check.</p></div></div>
    ${apps.length ? html`<div class="mb-2">${alertBox({ tone: 'info', text: `${apps.length} applicant${apps.length > 1 ? 's are' : ' is'} already scored against these terms. Saving re-scores them with the new terms.` })}</div>` : ''}
    ${builderLayout(d, 'app')}`;
  },
  mount(main) {
    return mountBuilder(main, editing.deal);
  },
};

onSubmit({
  'save-deal': (form, e) => {
    const builder = form.closest('.deal-builder');
    const d = readDealForm(form, builder._base);
    const errors = {};
    if (!d.property.address || d.property.address === 'New listing') errors.address = 'Enter the street address.';
    if (!d.property.city) errors.city = 'Enter the city.';
    if (!(d.terms.salePrice > 0)) errors.salePrice = 'Enter a sale price.';
    if (!(d.terms.downPct < 100)) errors.downPct = 'Down payment must be less than the price.';
    if (!showErrors(form, errors)) return;
    const publish = e.submitter && e.submitter.dataset.publish === '1';
    let id = d.id;
    update((s) => {
      if (!id) {
        id = uid('deal');
        s.deals.unshift({ ...d, id, createdAt: today(), status: 'draft' });
        logActivity(`Draft created: ${d.property.address}`, `#/app/deals/${id}`);
      } else {
        const i = s.deals.findIndex((x) => x.id === id);
        s.deals[i] = { ...s.deals[i], property: d.property, terms: d.terms, screeningPaidBy: d.screeningPaidBy, updatedAt: today() };
      }
      if (publish) {
        const deal = s.deals.find((x) => x.id === id);
        deal.status = 'listed';
        deal.listedAt = today();
        deal.code ||= makeCode(deal);
        logActivity(`Listing published: ${deal.property.address}`, `#/app/deals/${id}`);
      }
    });
    editing = null;
    toast(publish ? 'Listing published. Share the application link with buyers.' : 'Deal saved');
    location.hash = `#/app/deals/${id}`;
  },
});

onAction({
  'publish-deal': (el) => {
    const d = dealById(el.dataset.id);
    if (!d) return;
    const c = compliance(d);
    const doPublish = () => {
      update((s) => {
        const deal = s.deals.find((x) => x.id === d.id);
        deal.status = 'listed';
        deal.listedAt = today();
        deal.code ||= makeCode(deal);
        logActivity(`Listing published: ${deal.property.address}`, `#/app/deals/${deal.id}`);
      });
      toast('Listing published. Share the application link with buyers.');
    };
    if (c.verdict.tone === 'critical') {
      openModal({
        title: 'Publish with a compliance issue?',
        size: 'sm',
        body: `<p><strong>${c.verdict.title}.</strong> As structured, this deal should be originated by a licensed loan originator. Consider removing the balloon first.</p>`,
        footer: `<a class="btn btn-secondary" href="#/app/deals/${d.id}/edit" data-action="modal-close-nav">Edit terms</a><button type="button" class="btn btn-danger" data-action="publish-anyway" data-id="${d.id}">Publish anyway</button>`,
      });
      return;
    }
    doPublish();
  },
  'publish-anyway': (el) => {
    closeModal(el);
    update((s) => {
      const deal = s.deals.find((x) => x.id === el.dataset.id);
      deal.status = 'listed';
      deal.listedAt = today();
      deal.code ||= makeCode(deal);
      deal.rmloRequired = true;
      logActivity(`Listing published (RMLO review needed): ${deal.property.address}`, `#/app/deals/${deal.id}`);
    });
    toast('Published. Add an RMLO review before closing.', 'warning');
  },
  'modal-close-nav': (el) => {
    const href = el.getAttribute('href');
    closeModal(el);
    location.hash = href;
  },
  'archive-deal': (el) => {
    update((s) => {
      const deal = s.deals.find((x) => x.id === el.dataset.id);
      deal.status = 'archived';
      logActivity(`Archived: ${deal.property.address}`, `#/app/deals/${deal.id}`);
    });
    toast('Deal archived');
  },
  copy: (el) => copyText(el.dataset.text),
});

export { housingFor, offerOf };
