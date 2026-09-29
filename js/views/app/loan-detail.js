// Loan servicing workspace: overview, ledger, schedule, escrow, documents, activity.
import { html, raw, esc } from '../../ui/html.js';
import { ic } from '../../ui/icons.js';
import { card, stat, statusBadge, badge, empty, kv, tabs, meter, openModal, toast, alertBox, field, moneyField, propertyArt, checkbox, closeModal } from '../../ui/components.js';
import { onAction, onSubmit, onLive, readForm, showErrors } from '../../ui/actions.js';
import { lineChart, legend } from '../../ui/charts.js';
import { getState, update, loanById, loanState, today, logActivity } from '../../data/store.js';
import { money, money0, moneyCompact, fmtDate, ratePct, durationLabel, pct, addDays, addMonths, daysBetween, uid, parseMoneyInput, dollarsInput, yearOf } from '../../core/util.js';
import { payoffQuote, previewTransaction, escrowAnalysis, hasBalloon, installmentCount, STATUS } from '../../core/servicing.js';
import { automationFeed, RULES } from '../../core/automations.js';
import { PROPERTY_TYPES } from '../../core/compliance.js';
import { planOf, planPrice } from '../../core/pricing.js';
import { METHODS, balanceSeries, historyStrip, ledgerRows, csv, downloadFile, centsToStr, propertyFacts } from '../shared.js';

const TABS = (loan, st) => [
  { id: 'overview', label: 'Overview', href: `#/app/loans/${loan.id}` },
  { id: 'payments', label: 'Payments', href: `#/app/loans/${loan.id}/payments`, count: loan.transactions.filter((t) => t.type === 'payment').length },
  { id: 'schedule', label: 'Schedule', href: `#/app/loans/${loan.id}/schedule` },
  ...(loan.escrow?.enabled ? [{ id: 'escrow', label: 'Escrow', href: `#/app/loans/${loan.id}/escrow` }] : []),
  { id: 'documents', label: 'Documents', href: `#/app/loans/${loan.id}/documents` },
  { id: 'activity', label: 'Activity', href: `#/app/loans/${loan.id}/activity` },
];

function statusAlert(loan, st) {
  const t = today();
  if (st.paidOffDate) {
    const refund = st.escrowBalance > 0 ? ` ${money(st.escrowBalance)} is still in escrow and is owed back to the borrower.` : '';
    return alertBox({
      tone: 'good',
      title: `Paid off ${fmtDate(st.paidOffDate)}`,
      text: (loan.release ? `${loan.release.document} recorded ${fmtDate(loan.release.recordedAt)} with ${loan.release.county}. This loan is closed.` : 'Record the lien release so the buyer has clear title.') + refund,
      actions: html`${st.escrowBalance > 0 ? html`<button type="button" class="btn btn-secondary btn-sm" data-action="escrow-refund" data-id="${loan.id}">Refund escrow</button>` : ''}${loan.release ? '' : html`<button type="button" class="btn btn-secondary btn-sm" data-action="record-release" data-id="${loan.id}">Record lien release</button>`}`,
    });
  }
  if (['late', 'd30', 'd60', 'd90', 'default'].includes(st.status)) {
    const m = st.nextInstallment;
    return alertBox({
      tone: st.status === 'late' ? 'serious' : 'critical',
      title: `${money(st.amountDue)} past due · ${st.dpd} days`,
      text: `The ${fmtDate(m.due)} installment is unpaid. A ${money(st.lateFee)} late charge was added after the ${st.grace}-day grace period, and the borrower got a reminder and a late notice.${st.dpd >= 30 ? ' A 30-day delinquency letter has been mailed.' : ''}${st.suspense ? ` ${money(st.suspense)} received so far is held in suspense until the full installment arrives.` : ''}`,
      actions: html`<button type="button" class="btn btn-primary btn-sm" data-action="record-payment" data-id="${loan.id}">Record payment</button><a class="btn btn-secondary btn-sm" href="#/doc/late-notice/${loan.id}" target="_blank" rel="noopener">Late notice</a>`,
    });
  }
  if (st.status === 'grace') {
    return alertBox({ tone: 'warning', title: `Payment due ${fmtDate(st.nextInstallment.due)}: in grace period`, text: `No late charge unless it’s still unpaid after ${fmtDate(addDays(st.nextInstallment.due, st.grace))}.` });
  }
  if (st.suspense > 0) return alertBox({ tone: 'info', title: `${money(st.suspense)} held in suspense`, text: 'A partial payment is waiting until enough arrives to cover a full installment.' });
  if (st.matured) return alertBox({ tone: 'critical', title: 'Loan has matured', text: `The final payment was due ${fmtDate(st.maturityDate)}.` });
  const bal = st.balloon;
  if (bal && daysBetween(t, bal.due) <= 365) return alertBox({ tone: 'warning', title: `Balloon of ${money0(bal.total)} due ${fmtDate(bal.due)}`, text: 'The borrower is getting reminders to line up refinancing. Offer an extension early if they need one.' });
  return '';
}

function overview(loan, st) {
  const t = loan.terms;
  const paidDown = t.principal ? (1 - st.principalBalance / t.principal) * 100 : 0;
  const m = st.nextInstallment;
  const escrowAmt = loan.escrow?.enabled ? loan.escrow.monthly : 0;
  const ins = loan.insurance;
  const insLeft = ins?.expires ? daysBetween(today(), ins.expires) : null;
  return html`
  <div class="stats mb-3">
    ${stat({ label: 'Principal balance', value: money0(st.principalBalance), sub: `${pct(paidDown, 1)} of ${money0(t.principal)} repaid`, icon: 'bank' })}
    ${stat({ label: st.paidOffDate ? 'Paid off' : 'Next payment', value: st.paidOffDate ? fmtDate(st.paidOffDate) : m ? money(m.total) : '—', sub: st.paidOffDate ? 'Loan closed' : m ? `${fmtDate(m.due)} · ${loan.autopay?.enabled ? 'autopay' : 'manual'}` : '', icon: 'calendar' })}
    ${stat({ label: 'Rate & P&I', value: ratePct(t.ratePct), sub: `${money(st.payment)} P&I${escrowAmt ? ` + ${money(escrowAmt)} escrow` : ''}`, icon: 'percent' })}
    ${stat({ label: 'Paid through', value: st.paidThrough ? fmtDate(st.paidThrough, 'month') : '—', sub: `${st.paidCount} of ${st.installments} installments`, icon: 'check' })}
  </div>
  <div class="grid g-main">
    <div class="stack-lg">
      ${card({ title: 'Balance over time', sub: `${hasBalloon(t) ? `Balloon ${fmtDate(st.maturityDate, 'month')}` : `Paid off ${fmtDate(st.maturityDate, 'month')}`} if payments stay on schedule.`, action: html`<a class="btn btn-ghost btn-sm" href="#/app/loans/${loan.id}/schedule">Schedule ${ic('chevronRight', { size: 16 })}</a>`, body: html`
        ${raw(legend([{ label: 'Actual', color: 'var(--series-1)', shape: 'line' }, { label: 'Projected', color: 'var(--series-1)', shape: 'dash' }]))}
        <div class="loan-chart"></div>
        ${meter({ value: paidDown, max: 100, tone: 'blue', label: 'Share of principal repaid', text: pct(paidDown, 1) })}
        <p class="xs muted mt-1 mb-0">${pct(paidDown, 1)} of the principal repaid · ${money0(loan.terms.downPayment)} down at closing</p>` })}
      ${card({ title: 'Payment history', sub: `On-time rate ${pct(st.onTimeRate * 100, 0)} over the last ${Math.min(12, st.history.length)} installments`, body: historyStrip(st, 12) })}
      ${card({ title: 'Note terms', body: html`<div class="grid g-2" style="gap:24px">
        ${kv([['Sale price', money0(t.salePrice)], ['Down payment', money0(t.downPayment)], ['Amount financed', money0(t.principal)], ['Interest rate', `${ratePct(t.ratePct)} fixed`], ['Amortization', durationLabel(t.amortMonths)], ['Balloon', hasBalloon(t) ? `${durationLabel(t.balloonMonths)} · ${fmtDate(st.maturityDate)}` : 'None']], 'one rows')}
        ${kv([['Closing date', fmtDate(t.closingDate)], ['First payment', fmtDate(t.firstDue)], ['Maturity', fmtDate(st.maturityDate)], ['Grace period', `${st.grace} days`], ['Late charge', `${money(st.lateFee)} (${t.lateFee?.pct ?? 5}% of P&I)`], ['Servicing plan', `${planOf(loan) === 'complete' ? 'Complete' : 'Essentials'} · ${money0(planPrice(planOf(loan)))}/mo`]], 'one rows')}
      </div>` })}
    </div>
    <div class="stack-lg">
      ${card({ title: 'Borrower', action: html`<a class="btn btn-ghost btn-sm" href="#/borrower/${loan.id}">${ic('eye', { size: 15 })} Their view</a>`, body: html`
        ${kv([['Name', loan.borrower.name], loan.borrower.contact ? ['Contact', loan.borrower.contact] : null, ['Email', loan.borrower.email || '—'], ['Phone', loan.borrower.phone || '—'], ['Taxpayer ID', loan.borrower.tinOnFile ? `On file (•••-••-${loan.borrower.tinLast4 || '••••'})` : html`<span class="warn-text">Not collected</span>`]], 'one rows')}
        ${!loan.borrower.tinOnFile ? html`<button type="button" class="btn btn-secondary btn-sm mt-2" data-action="request-tin" data-id="${loan.id}">${ic('mail', { size: 15 })} Request W-9 / SSN securely</button>` : ''}` })}
      ${card({ title: 'Autopay', body: loan.autopay?.enabled ? html`<p class="mb-1"><span class="badge good">${ic('repeat', { size: 13 })}On</span> since ${fmtDate(loan.autopay.since)}</p><p class="small muted">Drafts ${loan.autopay.account || 'the buyer’s bank account'} on each due date. Funds reach you in about 2 business days.</p><button type="button" class="btn btn-ghost btn-sm" data-action="pause-autopay" data-id="${loan.id}">Pause autopay</button>`
        : html`<p class="small">${loan.autopay?.invited ? 'Invitation sent. The buyer hasn’t linked a bank account yet.' : 'This buyer pays manually. Autopay means no chasing, and the buyer can’t forget.'}</p>${st.paidOffDate ? '' : html`<button type="button" class="btn btn-secondary btn-sm" data-action="invite-autopay" data-id="${loan.id}">${ic('send', { size: 15 })} ${loan.autopay?.invited ? 'Resend invitation' : 'Invite to autopay'}</button>`}` })}
      ${card({ title: 'Collateral', body: html`
        <div class="prop-hero mb-2">${propertyArt(loan.property)}</div>
        ${kv([['Property', `${loan.property.address}, ${loan.property.city}, ${loan.property.state}`], ['Type', propertyFacts(loan.property)], ['Buyer', loan.property.occupancy === 'investment' ? 'Investor (rental)' : 'Owner-occupant'],
          ins ? ['Insurance', html`${ins.carrier || 'Carrier not set'}${ins.policy ? ` · ${ins.policy}` : ''}<br><span class="${insLeft != null && insLeft <= 30 && !ins.renewalReceived ? 'warn-text' : 'muted'}">${ins.renewalReceived ? 'Renewal received' : `Expires ${fmtDate(ins.expires)}`}</span>`] : ['Insurance', loan.property.type === 'land' ? 'Not required (vacant land)' : 'Not tracked'],
          loan.escrow?.enabled ? ['Taxes', `Paid from escrow · ${money0(loan.escrow.taxesAnnual)}/yr`] : ['Taxes', 'Paid by the buyer'],
        ], 'one rows')}
        ${ins && !ins.renewalReceived && insLeft != null && insLeft <= 45 ? html`<button type="button" class="btn btn-secondary btn-sm mt-2" data-action="insurance-renewed" data-id="${loan.id}">${ic('check', { size: 15 })} Mark renewal received</button>` : ''}` })}
      ${card({ title: 'Notes', action: html`<button type="button" class="btn btn-ghost btn-sm" data-action="add-note" data-id="${loan.id}">${ic('plus', { size: 15 })} Add</button>`, body: (loan.notes || []).length ? html`<ul class="note-list">${[...loan.notes].reverse().slice(0, 4).map((n) => html`<li><time>${fmtDate(n.date)}</time>${n.text}</li>`)}</ul>` : html`<p class="muted small mb-0">Private notes about this loan (calls, promises to pay, agreements).</p>` })}
    </div>
  </div>`;
}

function payments(loan, st) {
  const rows = ledgerRows(loan, st);
  return card({
    cls: 'flush',
    title: 'Ledger',
    sub: 'Every payment applied in order: interest, principal, escrow, then charges. Extra funds go to principal.',
    action: html`<div class="btn-row"><button type="button" class="btn btn-secondary btn-sm" data-action="export-ledger" data-id="${loan.id}">${ic('download', { size: 15 })} CSV</button>${st.paidOffDate ? '' : html`<button type="button" class="btn btn-primary btn-sm" data-action="record-payment" data-id="${loan.id}">${ic('plus', { size: 15 })} Record payment</button>`}</div>`,
    body: rows.length ? html`<div class="table-wrap"><table class="tbl">
      <thead><tr><th>Date</th><th>Activity</th><th class="num">Amount</th><th>Applied to</th><th class="num">Principal balance</th></tr></thead>
      <tbody>${rows.map((r) => html`<tr class="${r.tone === 'void' ? 'muted-row' : ''}">
        <td class="nowrap">${fmtDate(r.date)}</td>
        <td><span class="cell-main" style="font-weight:600">${r.desc}</span>${r.sub ? html`<span class="cell-sub">${r.sub}</span>` : ''}</td>
        <td class="num ${r.tone === 'in' ? 'money-in' : r.tone === 'charge' ? 'money-out' : ''}">${r.tone === 'void' ? html`<s>${money(r.amount)}</s>` : r.tone === 'charge' ? `+${money(r.amount)}` : money(r.amount)}</td>
        <td>${r.kind === 'payment' ? html`<span class="alloc">${r.interest ? html`<span>Interest <b>${money(r.interest)}</b></span>` : ''}${r.principal ? html`<span>Principal <b>${money(r.principal)}</b></span>` : ''}${r.escrow ? html`<span>Escrow <b>${money(r.escrow)}</b></span>` : ''}${r.fees ? html`<span>Charges <b>${money(r.fees)}</b></span>` : ''}</span>` : r.kind === 'charge' ? html`<span class="alloc">Owed by borrower</span>` : r.kind === 'escrow' ? html`<span class="alloc">From escrow · balance <b>${money(r.escrowBalance ?? 0)}</b></span>` : ''}</td>
        <td class="num">${money(r.balance)}</td></tr>`)}</tbody></table></div>` : html`<div style="padding:0 20px 20px">${empty({ icon: 'receipt', title: 'No activity yet', text: `The first payment is due ${fmtDate(loan.terms.firstDue)}.` })}</div>`,
  });
}

function schedule(loan, st) {
  const t = today();
  const all = [...st.paid.map((p) => ({ ...p, state: 'paid' })), ...st.unpaid.map((u) => ({ ...u, state: u.due < t ? 'past' : 'future' }))];
  const byYear = new Map();
  for (const r of all) { const y = r.due.slice(0, 4); if (!byYear.has(y)) byYear.set(y, []); byYear.get(y).push(r); }
  const thisYear = t.slice(0, 4);
  const sumI = all.reduce((s, r) => s + r.interest, 0);
  return html`
  <div class="stats s3 mb-3">
    ${stat({ label: 'Installments', value: `${st.paidCount} / ${st.installments}`, sub: `${st.installments - st.paidCount} remaining`, icon: 'calendar' })}
    ${stat({ label: 'Total interest over the life', value: money0(sumI), sub: 'paid + projected', icon: 'trending' })}
    ${stat({ label: hasBalloon(loan.terms) ? 'Balloon' : 'Final payment', value: st.balloon ? money0(st.balloon.total) : st.unpaid.length ? money(st.unpaid[st.unpaid.length - 1].total) : '—', sub: fmtDate(st.maturityDate), icon: 'flag' })}
  </div>
  <div class="card flush">
    <div class="card-head" style="padding:18px 20px 0"><div><h2 class="card-title">Amortization schedule</h2><p class="card-sub">Paid installments show actual dates. Future ones are projected from today’s balance.</p></div><a class="btn btn-secondary btn-sm" href="#/doc/schedule/${loan.id}" target="_blank" rel="noopener">${ic('printer', { size: 15 })} Print</a></div>
    <div style="padding:0 20px 20px">
    ${[...byYear.entries()].map(([y, rows]) => html`<details class="path mt-1"${y === thisYear ? raw(' open') : ''}>
      <summary>${y} <span class="muted small" style="font-weight:500">${rows.length} payment${rows.length === 1 ? '' : 's'} · ${money0(rows.reduce((s, r) => s + r.interest, 0))} interest · ${money0(rows.reduce((s, r) => s + r.principal, 0))} principal</span></summary>
      <div class="table-wrap"><table class="tbl compact">
        <thead><tr><th>#</th><th>Due</th><th class="num">Interest</th><th class="num">Principal</th>${loan.escrow?.enabled ? html`<th class="num">Escrow</th>` : ''}<th class="num">Total</th><th class="num">Balance after</th><th>Status</th></tr></thead>
        <tbody>${rows.map((r) => {
          const balAfter = r.state === 'paid' ? r.balanceAfter : null;
          return html`<tr class="${r.balloon ? 'hl' : ''}">
          <td class="num">${r.n}</td><td class="nowrap">${fmtDate(r.due)}</td>
          <td class="num">${money(r.interest)}</td><td class="num">${money(r.principal)}</td>${loan.escrow?.enabled ? html`<td class="num">${money(r.escrow)}</td>` : ''}
          <td class="num strong">${money(r.total)}</td><td class="num">${balAfter != null ? money(balAfter) : html`<span class="muted">projected</span>`}</td>
          <td>${r.state === 'paid' ? (r.boarded ? badge('neutral', 'Prior history') : r.late ? badge('serious', `Paid ${fmtDate(r.paidDate, 'short')} · late`, 'alert') : badge('good', `Paid ${fmtDate(r.paidDate, 'short')}`, 'check')) : r.state === 'past' ? badge('critical', 'Past due', 'alert') : r.balloon ? badge('warning', 'Balloon', 'flag') : html`<span class="muted small">Scheduled</span>`}</td></tr>`;
        })}</tbody></table></div></details>`)}
    </div>
  </div>`;
}

function escrowTab(loan, st) {
  const ea = escrowAnalysis(loan, st, today());
  const rows = ledgerRows(loan, st).filter((r) => r.kind === 'escrow');
  return html`
  <div class="stats mb-3">
    ${stat({ label: 'Escrow balance', value: money(st.escrowBalance), sub: st.escrowBalance < 0 ? 'Advanced by you. Recovered from the borrower' : 'Held for taxes & insurance', tone: st.escrowBalance < 0 ? 'bad' : '', icon: 'shield' })}
    ${stat({ label: 'Monthly deposit', value: money(ea.currentMonthly), sub: 'collected with each payment', icon: 'repeat' })}
    ${stat({ label: 'Annual disbursements', value: money0(ea.annual), sub: `${money0(loan.escrow.taxesAnnual)} taxes · ${money0(loan.escrow.insuranceAnnual)} insurance`, icon: 'landmark' })}
    ${stat({ label: 'Projected low point', value: money0(ea.lowPoint), sub: `${fmtDate(ea.lowMonth, 'month')} · cushion ${money0(ea.cushion)}`, tone: ea.shortage ? 'bad' : 'good', icon: 'gauge' })}
  </div>
  <div class="grid g-main">
    <div class="stack-lg">
      ${card({ title: 'Annual escrow analysis', sub: 'Next 12 months, with a two-month cushion (the RESPA maximum).', action: html`<a class="btn btn-ghost btn-sm" href="#/doc/escrow/${loan.id}" target="_blank" rel="noopener">${ic('printer', { size: 15 })} Statement</a>`, body: html`
        ${ea.shortage ? alertBox({ tone: 'warning', title: `Shortage of ${money(ea.shortage)}`, text: `Raise the monthly escrow to ${money(ea.recommended)} to rebuild the cushion over 12 months.`, actions: html`<button type="button" class="btn btn-secondary btn-sm" data-action="apply-escrow" data-id="${loan.id}" data-amount="${ea.recommended}">Apply ${money(ea.recommended)}</button>` })
          : ea.surplus >= 5000 ? alertBox({ tone: 'info', title: `Surplus of ${money(ea.surplus)}`, text: 'Surpluses of $50 or more are refunded to the borrower after the analysis.' })
          : alertBox({ tone: 'good', text: 'The escrow account is on track. No change to the monthly deposit.' })}
        <div class="table-wrap mt-2"><table class="tbl compact"><thead><tr><th>Month</th><th class="num">Deposit</th><th class="num">Disbursement</th><th class="num">Balance</th></tr></thead>
        <tbody>${ea.months.map((m) => html`<tr class="${m.date === ea.lowMonth ? 'hl' : ''}"><td>${fmtDate(m.date, 'month')}</td><td class="num">${money(m.deposit)}</td><td class="num">${m.out ? money(m.out) : '—'}</td><td class="num">${money(m.balance)}</td></tr>`)}</tbody></table></div>` })}
    </div>
    <div class="stack-lg">
      ${card({ title: 'Disbursements', action: html`<button type="button" class="btn btn-secondary btn-sm" data-action="escrow-disburse" data-id="${loan.id}">${ic('plus', { size: 15 })} Record</button>`, body: rows.length ? html`<ul class="feed">${rows.slice(0, 12).map((r) => html`<li><span class="feed-icon">${ic(r.desc.includes('tax') ? 'landmark' : 'shield', { size: 15 })}</span><span class="feed-body"><strong>${money(r.amount)}</strong> ${r.desc.replace('Escrow disbursement · ', '')}<span class="feed-meta">${r.sub}</span></span><span class="feed-date">${fmtDate(r.date, 'short')}</span></li>`)}</ul>` : html`<p class="muted small mb-0">No disbursements yet.</p>` })}
      ${card({ title: 'Payees', body: kv([['Property tax', loan.escrow.taxPayee || 'County treasurer'], ['Tax due months', (loan.escrow.taxDueMonths || [4, 10]).map((m) => fmtDate(`2000-${String(m).padStart(2, '0')}-01`, 'month').split(' ')[0]).join(' & ')], ['Insurance', loan.escrow.insurancePayee || loan.insurance?.carrier || '—']], 'one rows') })}
    </div>
  </div>`;
}

function documents(loan, st) {
  const y = yearOf(today());
  const docs = [
    !st.paidOffDate && { href: `#/doc/statement/${loan.id}`, icon: 'file', title: 'Monthly statement', sub: st.nextInstallment ? `For the ${fmtDate(st.nextInstallment.due)} payment` : '' },
    { href: `#/doc/payoff/${loan.id}?date=${addDays(today(), 10)}`, icon: 'receipt', title: 'Payoff statement', sub: st.paidOffDate ? `Final payoff ${fmtDate(st.paidOffDate)}` : `Good through ${fmtDate(addDays(today(), 10))}` },
    { href: `#/doc/interest/${loan.id}?year=${y - 1}`, icon: 'landmark', title: `${y - 1} interest statement`, sub: 'For your return and the buyer’s' },
    { href: `#/doc/interest/${loan.id}?year=${y}`, icon: 'landmark', title: `${y} interest to date`, sub: 'Year-to-date summary' },
    { href: `#/doc/schedule/${loan.id}`, icon: 'calendar', title: 'Amortization schedule', sub: `${st.installments} installments` },
    { href: `#/doc/terms/${loan.id}`, icon: 'file', title: 'Loan terms summary', sub: 'One page for your records' },
    loan.escrow?.enabled && { href: `#/doc/escrow/${loan.id}`, icon: 'shield', title: 'Escrow account statement', sub: 'Annual analysis' },
    ['late', 'd30', 'd60', 'd90', 'default'].includes(st.status) && { href: `#/doc/late-notice/${loan.id}`, icon: 'alert', title: 'Late payment notice', sub: `${st.dpd} days past due` },
    st.dpd >= 30 && { href: `#/doc/default-notice/${loan.id}`, icon: 'alert', title: 'Notice of default & right to cure', sub: 'Have an attorney review before sending' },
    { href: `#/doc/note/${loan.id}`, icon: 'pencil', title: 'Promissory note (sample)', sub: 'Template for attorney review' },
  ].filter(Boolean);
  return card({ title: 'Documents', sub: 'Generated from the live ledger. Open one to print or save as PDF.', body: html`<div class="doc-list">${docs.map((d) => html`<a class="doc-item" href="${d.href}" target="_blank" rel="noopener"><span class="dicon">${ic(d.icon, { size: 18 })}</span><span><strong>${d.title}</strong><span>${d.sub}</span></span></a>`)}</div>` });
}

function activity(loan, st) {
  const s = getState();
  const feed = automationFeed([loan], { [loan.id]: st }, s.settings, today(), { back: 120, ahead: 30 });
  const notes = (loan.notes || []).map((n) => ({ date: n.date, title: 'Note', detail: n.text, status: 'note' }));
  const items = [...feed, ...notes].sort((a, b) => (a.status === 'scheduled') - (b.status === 'scheduled') || (a.date < b.date ? 1 : -1));
  const ruleIcon = Object.fromEntries(RULES.map((r) => [r.id, r.icon]));
  return html`<div class="grid g-main">
    ${card({ title: 'Servicing activity', sub: 'Automated messages, drafts and alerts for this loan.', body: items.length ? html`<ul class="feed">${items.map((e) => html`<li><span class="feed-icon ${e.status === 'scheduled' ? 'scheduled' : e.tone || ''}">${ic(e.status === 'note' ? 'pencil' : ruleIcon[e.rule] || 'info', { size: 15 })}</span><span class="feed-body"><strong>${e.title}</strong>${e.status === 'scheduled' ? html` <span class="badge info">Scheduled</span>` : ''}<span class="feed-meta">${e.detail}</span></span><span class="feed-date">${fmtDate(e.date, 'short')}</span></li>`)}</ul>` : html`<p class="muted small mb-0">Nothing yet.</p>` })}
    ${card({ title: 'Add a note', body: html`<form data-form="loan-note" data-id="${loan.id}" class="stack-sm">${field({ label: 'Note', name: 'text', type: 'textarea', rows: 3, placeholder: 'e.g. Called about the late payment; promised to pay by the 30th.' })}<button type="submit" class="btn btn-secondary">Save note</button></form>` })}
  </div>`;
}

export const loanDetailView = {
  layout: 'app',
  nav: 'loans',
  title: (ctx) => { const l = loanById(ctx.params.id); return l ? `${l.number} · ${l.borrower.name}` : 'Loan'; },
  render(ctx) {
    const loan = loanById(ctx.params.id);
    if (!loan) return card({ body: empty({ icon: 'file', title: 'Loan not found', action: html`<a class="btn btn-primary" href="#/app/loans">Back to loans</a>` }) });
    const st = loanState(loan.id);
    const tab = ctx.params.tab || 'overview';
    const body = { overview, payments, schedule, escrow: escrowTab, documents, activity }[tab] || overview;
    return html`
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/app/loans">Loans</a>${ic('chevronRight', { size: 14 })}<span>${loan.number}</span></nav>
    <div class="page-head">
      <div class="prop-head">
        <div class="prop-thumb">${propertyArt(loan.property)}</div>
        <div><div class="title-row"><h1>${loan.borrower.name}</h1>${statusBadge(st.status)}${loan.autopay?.enabled && !st.paidOffDate ? badge('brand', 'Autopay', 'repeat') : ''}</div>
        <p>${loan.number} · ${loan.property.address}, ${loan.property.city}, ${loan.property.state}</p></div>
      </div>
      ${st.paidOffDate ? '' : html`<div class="btn-row wrap">
        <button type="button" class="btn btn-primary" data-action="record-payment" data-id="${loan.id}">${ic('plus', { size: 16 })} Record payment</button>
        <button type="button" class="btn btn-secondary" data-action="payoff-quote" data-id="${loan.id}">${ic('receipt', { size: 16 })} Payoff quote</button>
        <button type="button" class="btn btn-ghost" data-action="loan-more" data-id="${loan.id}" aria-label="More actions">${ic('moreH')}<span class="hide-sm">More</span></button>
      </div>`}
    </div>
    ${statusAlert(loan, st) ? html`<div class="mb-3">${statusAlert(loan, st)}</div>` : ''}
    ${tabs(TABS(loan, st), tab, 'Loan sections')}
    ${body(loan, st)}`;
  },
  mount(main, ctx) {
    const el = main.querySelector('.loan-chart');
    if (!el) return null;
    const loan = loanById(ctx.params.id);
    const st = loanState(loan.id);
    const pts = balanceSeries(loan, st);
    const markers = [{ x: today(), kind: 'rule', label: 'Today' }];
    if (st.balloon) {
      const before = pts.filter((p) => p.x <= st.balloon.due).slice(-2)[0];
      if (before) markers.push({ x: st.balloon.due, y: before.y, label: `Balloon ${moneyCompact(st.balloon.principal)}` });
    }
    return lineChart(el, {
      points: pts,
      height: 220,
      label: `Principal balance for ${loan.number}`,
      splitAt: today(),
      markers,
      tip: (p) => ({
        title: p.kind === 'start' ? `Closing · ${fmtDate(p.x)}` : `${p.kind === 'paid' ? 'Paid' : 'Projected'} · ${fmtDate(p.x)}`,
        rows: [{ label: 'balance', value: money0(p.y), color: 'var(--series-1)' }].concat(p.inst ? [{ label: 'interest', value: money(p.inst.interest) }, { label: 'principal', value: money(p.inst.principal) }] : []),
      }),
    });
  },
};

// ---------------- modals & actions ----------------
function paymentPreview(form, loan) {
  const v = readForm(form);
  const amount = parseMoneyInput(v.amount);
  const out = form.querySelector('[data-pay-preview]');
  if (!out) return;
  if (!(amount > 0) || !v.date) { out.innerHTML = '<p class="muted small mb-0">Enter an amount and date to preview how it applies.</p>'; return; }
  if (v.date > today()) { out.innerHTML = '<p class="small warn-text mb-0">Payments can’t be dated in the future.</p>'; return; }
  const tx = { id: 'preview', type: 'payment', date: v.date, amount, method: v.method, applyTo: v.applyTo === 'regular' ? undefined : v.applyTo, status: 'cleared' };
  const { entry, after } = previewTransaction(loan, tx, today());
  const a = entry?.alloc || {};
  const lines = [];
  if (a.installments?.length) lines.push(`Satisfies installment${a.installments.length > 1 ? 's' : ''} ${a.installments.join(', ')}`);
  if (a.fromSuspense) lines.push(`Combined with ${money(a.fromSuspense)} held from an earlier partial payment`);
  const parts = [['Interest', a.interest], ['Principal', a.principal], ['Escrow', a.escrow], ['Late & other charges', a.fees], ['Extra principal', a.extra], ['Held in suspense', a.suspense], ['Overpayment (refund due)', a.credit]].filter(([, x]) => x);
  out.innerHTML = `<h3>How it applies</h3>${lines.length ? `<p class="small mb-1">${esc(lines.join(' · '))}</p>` : ''}
    <dl class="kv rows">${parts.map(([k, x]) => `<div><dt>${esc(k)}</dt><dd>${esc(money(x))}</dd></div>`).join('')}</dl>
    <p class="small mt-1 mb-0">After this payment: balance <strong>${esc(money(after.principalBalance))}</strong> · status <strong>${esc(STATUS[after.status].label)}</strong>${after.paidOffDate ? ' · <strong>paid in full</strong>' : ''}</p>
    ${a.suspense ? '<p class="xs muted mt-1 mb-0">Partial payments wait in suspense until a full installment is covered. That’s standard servicing practice.</p>' : ''}`;
}

onLive({
  'pay-form': (form, e) => {
    const loan = loanById(form.dataset.id);
    if (e && e.target.name === 'applyTo' && e.target.value === 'payoff') {
      const q = payoffQuote(loan, loanState(loan.id), form.elements.date.value || today());
      form.elements.amount.value = dollarsInput(q.total);
    }
    paymentPreview(form, loan);
  },
  'payoff-form': (form) => {
    const loan = loanById(form.dataset.id);
    const d = form.elements.date.value;
    const out = form.querySelector('[data-payoff]');
    if (!d) return;
    const q = payoffQuote(loan, loanState(loan.id), d);
    out.innerHTML = String(payoffTable(q, loan));
  },
});

function payoffTable(q, loan) {
  return html`<dl class="kv rows mt-2">
    <div><dt>Unpaid principal</dt><dd>${money(q.principal)}</dd></div>
    <div><dt>Interest ${q.days >= 0 ? `from ${fmtDate(q.through)} (${q.days} days × ${money(Math.round(q.perDiem))}/day)` : '(prepaid interest credit)'}</dt><dd>${money(q.interest)}</dd></div>
    ${q.fees ? html`<div><dt>Late & other charges</dt><dd>${money(q.fees)}</dd></div>` : ''}
    ${q.escrowShortage ? html`<div><dt>Escrow shortage</dt><dd>${money(q.escrowShortage)}</dd></div>` : ''}
    ${q.suspense ? html`<div><dt>Less funds in suspense</dt><dd>−${money(q.suspense)}</dd></div>` : ''}
    <div><dt><strong>Total to pay off on ${fmtDate(q.date)}</strong></dt><dd><strong>${money(q.total)}</strong></dd></div>
  </dl>${q.escrowRefund ? html`<p class="small muted mt-1 mb-0">The ${money(q.escrowRefund)} escrow balance is refunded to the borrower after payoff.</p>` : ''}
  <p class="xs muted mt-1 mb-0">Per-diem interest accrues at ${money(Math.round(q.perDiem))} per day after this date.</p>`;
}

onAction({
  'record-payment': (el) => {
    const loan = loanById(el.dataset.id);
    const st = loanState(loan.id);
    const def = st.amountDue > 0 ? st.amountDue : st.nextInstallment ? st.nextInstallment.total : 0;
    openModal({
      title: `Record a payment · ${loan.borrower.name}`,
      size: 'lg',
      body: `<form data-form="record-payment" data-live="pay-form" data-id="${loan.id}" id="pay-form" novalidate>
        <div class="grid g-2" style="gap:20px;align-items:start">
          <div class="stack-sm">
            ${moneyField({ label: 'Amount received', name: 'amount', value: dollarsInput(def), required: true })}
            ${field({ label: 'Date received', name: 'date', type: 'date', value: today(), max: today(), required: true })}
            ${field({ label: 'Method', name: 'method', type: 'select', value: loan.autopay?.enabled ? 'ach' : 'check', options: Object.entries(METHODS).filter(([k]) => k !== 'autopay') })}
            ${field({ label: 'Reference (check #, confirmation)', name: 'ref', placeholder: 'Optional' })}
            ${field({ label: 'Apply as', name: 'applyTo', type: 'select', value: 'regular', options: [['regular', 'Regular payment'], ['principal', 'Extra principal only'], ['installment', 'Next installment (pay ahead)'], ['payoff', 'Payoff in full']] })}
          </div>
          <div class="alloc-preview" data-pay-preview></div>
        </div>
      </form>`,
      footer: `<button type="button" class="btn btn-secondary" data-action="modal-close">Cancel</button><button type="submit" form="pay-form" class="btn btn-primary">Record payment</button>`,
      onMount: (dlg) => paymentPreview(dlg.querySelector('form'), loan),
    });
  },
  'payoff-quote': (el) => {
    const loan = loanById(el.dataset.id);
    const d = addDays(today(), 10);
    const q = payoffQuote(loan, loanState(loan.id), d);
    openModal({
      title: 'Payoff quote',
      body: `<form data-live="payoff-form" data-id="${loan.id}" onsubmit="return false">
        ${field({ label: 'Good through', name: 'date', type: 'date', value: d, min: today() })}
        <div data-payoff>${payoffTable(q, loan)}</div>
      </form>`,
      footer: `<button type="button" class="btn btn-secondary" data-action="open-payoff-doc" data-id="${loan.id}">${ic('printer', { size: 15 })} Printable statement</button><button type="button" class="btn btn-primary" data-action="modal-close">Done</button>`,
    });
  },
  'open-payoff-doc': (el) => {
    const dlg = el.closest('dialog');
    const d = dlg.querySelector('[name=date]').value || addDays(today(), 10);
    window.open(`#/doc/payoff/${el.dataset.id}?date=${d}`, '_blank', 'noopener');
  },
  'loan-more': (el) => {
    const loan = loanById(el.dataset.id);
    const st = loanState(loan.id);
    const item = (action, icon, label, desc) => `<button type="button" class="doc-item" style="width:100%;text-align:left;cursor:pointer" data-action="${action}" data-id="${loan.id}"><span class="dicon">${ic(icon, { size: 18 })}</span><span><strong>${label}</strong><span>${desc}</span></span></button>`;
    openModal({
      title: 'More actions',
      size: 'sm',
      body: `<div class="stack-sm">
        ${item('add-charge', 'plus', 'Add a charge', 'Returned-payment fee or other charge allowed by the note')}
        ${st.feesOutstanding ? item('waive-charge', 'x', 'Waive a charge', `${money(st.feesOutstanding)} in charges outstanding`) : ''}
        ${loan.escrow?.enabled ? item('escrow-disburse', 'landmark', 'Record escrow disbursement', 'Tax or insurance bill paid from escrow') : ''}
        ${item('add-note', 'pencil', 'Add a note', 'Private servicing note')}
        ${item('send-statement', 'send', 'Send statement now', 'Email the current statement to the borrower')}
      </div>`,
    });
  },
  'add-charge': (el) => {
    closeModal(el);
    const loan = loanById(el.dataset.id);
    openModal({
      title: 'Add a charge',
      size: 'sm',
      body: `<form data-form="add-charge" data-id="${loan.id}" id="charge-form" novalidate>
        <div class="stack-sm">
          ${field({ label: 'Type', name: 'kind', type: 'select', value: 'nsf', options: [['nsf', 'Returned-payment fee'], ['other', 'Other charge']] })}
          ${moneyField({ label: 'Amount', name: 'amount', value: '25', required: true })}
          ${field({ label: 'Date', name: 'date', type: 'date', value: today(), max: today() })}
          ${field({ label: 'Memo', name: 'memo', placeholder: 'Shown on the borrower’s statement' })}
        </div>
        <p class="xs muted mt-2 mb-0">Only charge fees your note allows. Late charges are added automatically after the grace period.</p>
      </form>`,
      footer: `<button type="button" class="btn btn-secondary" data-action="modal-close">Cancel</button><button type="submit" form="charge-form" class="btn btn-primary">Add charge</button>`,
    });
  },
  'waive-charge': (el) => {
    closeModal(el);
    const loan = loanById(el.dataset.id);
    const st = loanState(loan.id);
    const open = st.fees.filter((f) => f.remaining > 0);
    openModal({
      title: 'Waive a charge',
      size: 'sm',
      body: `<form data-form="waive-charge" data-id="${loan.id}" id="waive-form" novalidate>
        ${field({ label: 'Charge', name: 'feeId', type: 'select', value: open[0]?.id, options: open.map((f) => [f.id, `${f.kind === 'late' ? `Late charge (${fmtDate(f.installmentDue, 'short')})` : f.memo || 'Charge'} · ${money(f.remaining)}`]) })}
        ${field({ label: 'Reason', name: 'memo', value: 'Courtesy waiver' })}
      </form>`,
      footer: `<button type="button" class="btn btn-secondary" data-action="modal-close">Cancel</button><button type="submit" form="waive-form" class="btn btn-primary">Waive charge</button>`,
    });
  },
  'escrow-disburse': (el) => {
    closeModal(el);
    const loan = loanById(el.dataset.id);
    openModal({
      title: 'Record escrow disbursement',
      size: 'sm',
      body: `<form data-form="escrow-disburse" data-id="${loan.id}" id="disb-form" novalidate><div class="stack-sm">
        ${field({ label: 'Bill', name: 'category', type: 'select', value: 'tax', options: [['tax', 'Property tax'], ['insurance', 'Homeowners insurance'], ['other', 'Other']] })}
        ${moneyField({ label: 'Amount paid', name: 'amount', value: dollarsInput(Math.round((loan.escrow.taxesAnnual || 0) / 2)), required: true })}
        ${field({ label: 'Date paid', name: 'date', type: 'date', value: today(), max: today() })}
        ${field({ label: 'Payee', name: 'payee', value: loan.escrow.taxPayee || '' })}
      </div></form>`,
      footer: `<button type="button" class="btn btn-secondary" data-action="modal-close">Cancel</button><button type="submit" form="disb-form" class="btn btn-primary">Record</button>`,
    });
  },
  'add-note': (el) => {
    closeModal(el);
    const loan = loanById(el.dataset.id);
    openModal({
      title: 'Add a note',
      size: 'sm',
      body: `<form data-form="loan-note" data-id="${loan.id}" id="note-form">${field({ label: 'Note', name: 'text', type: 'textarea', rows: 4 })}</form>`,
      footer: `<button type="button" class="btn btn-secondary" data-action="modal-close">Cancel</button><button type="submit" form="note-form" class="btn btn-primary">Save</button>`,
    });
  },
  'send-statement': (el) => {
    closeModal(el);
    const loan = loanById(el.dataset.id);
    update((s) => { logActivity(`Statement emailed to ${loan.borrower.name}`, `#/app/loans/${loan.id}`); }, { dirty: false });
    toast(`Statement sent to ${loan.borrower.email || loan.borrower.name} (demo)`);
  },
  'request-tin': (el) => {
    const loan = loanById(el.dataset.id);
    update((s) => {
      const l = s.loans.find((x) => x.id === loan.id);
      l.notes = l.notes || [];
      l.notes.push({ date: today(), text: 'Sent a secure W-9 request for the borrower’s taxpayer ID.' });
    });
    toast('Secure W-9 request sent (demo)');
  },
  'invite-autopay': (el) => {
    const loan = loanById(el.dataset.id);
    update((s) => {
      const l = s.loans.find((x) => x.id === loan.id);
      l.autopay = { ...(l.autopay || {}), enabled: false, invited: true };
      logActivity(`Autopay invitation sent to ${l.borrower.name}`, `#/app/loans/${l.id}`);
    });
    toast('Invitation sent. The buyer links their bank in the borrower portal.');
  },
  'pause-autopay': (el) => {
    const loan = loanById(el.dataset.id);
    update((s) => {
      const l = s.loans.find((x) => x.id === loan.id);
      l.autopay = { ...l.autopay, enabled: false };
      logActivity(`Autopay paused for ${l.borrower.name}`, `#/app/loans/${l.id}`);
    });
    toast('Autopay paused', 'info');
  },
  'insurance-renewed': (el) => {
    update((s) => {
      const l = s.loans.find((x) => x.id === el.dataset.id);
      l.insurance = { ...l.insurance, renewalReceived: false, expires: addMonths(l.insurance.expires, 12), renewedAt: today() };
      l.notes = l.notes || [];
      l.notes.push({ date: today(), text: `Insurance renewal received; policy now runs to ${fmtDate(l.insurance.expires)}.` });
    });
    toast('Insurance renewal recorded');
  },
  'record-release': (el) => {
    update((s) => {
      const l = s.loans.find((x) => x.id === el.dataset.id);
      l.release = { recordedAt: today(), document: 'Lien release', county: 'the county recorder' };
      logActivity(`Lien release recorded for ${l.number}`, `#/app/loans/${l.id}`);
    });
    toast('Lien release recorded');
  },
  'escrow-refund': (el) => {
    const st = loanState(el.dataset.id);
    const amt = st.escrowBalance;
    if (!(amt > 0)) return;
    update((s) => {
      const l = s.loans.find((x) => x.id === el.dataset.id);
      l.transactions.push({ id: uid('tx'), type: 'escrow_refund', date: today(), amount: amt, memo: 'Escrow balance refunded after payoff' });
      logActivity(`Escrow refund of ${money(amt)} sent to ${l.borrower.name}`, `#/app/loans/${l.id}/payments`);
    });
    toast(`Refunded ${money(amt)} from escrow`);
  },
  'apply-escrow': (el) => {
    const amt = Number(el.dataset.amount);
    update((s) => {
      const l = s.loans.find((x) => x.id === el.dataset.id);
      const st = loanState(l.id);
      const eff = st.nextInstallment ? st.nextInstallment.due : today();
      l.escrow.changes = [...(l.escrow.changes || []), { effective: eff, monthly: amt }];
      l.escrow.monthly = l.escrow.monthly;
      logActivity(`Escrow payment changed to ${money(amt)} effective ${fmtDate(eff)}`, `#/app/loans/${l.id}/escrow`);
    });
    toast('New escrow payment scheduled. The borrower will be notified.');
  },
  'export-ledger': (el) => {
    const loan = loanById(el.dataset.id);
    const st = loanState(loan.id);
    const rows = ledgerRows(loan, st).reverse();
    const out = [['Date', 'Activity', 'Detail', 'Amount', 'Interest', 'Principal', 'Escrow', 'Charges', 'Principal balance']]
      .concat(rows.map((r) => [r.date, r.desc, r.sub || '', centsToStr(r.amount), centsToStr(r.interest), centsToStr(r.principal), centsToStr(r.escrow), centsToStr(r.fees), centsToStr(r.balance)]));
    downloadFile(`${loan.number}-ledger.csv`, csv(out));
  },
});

onSubmit({
  'record-payment': (form) => {
    const loan = loanById(form.dataset.id);
    const v = readForm(form);
    const amount = parseMoneyInput(v.amount);
    const errors = {};
    if (!(amount > 0)) errors.amount = 'Enter the amount received.';
    if (!v.date) errors.date = 'Enter the date received.';
    else if (v.date > today()) errors.date = 'The date can’t be in the future.';
    if (!showErrors(form, errors)) return;
    closeModal(form);
    update((s) => {
      const l = s.loans.find((x) => x.id === loan.id);
      l.transactions.push({ id: uid('tx'), type: 'payment', date: v.date, amount, method: v.method, ref: v.ref || undefined, applyTo: v.applyTo === 'regular' ? undefined : v.applyTo, status: 'cleared', memo: v.applyTo === 'payoff' ? 'Payoff' : '' });
      logActivity(`Payment recorded · ${l.borrower.name} · ${money(amount)}`, `#/app/loans/${l.id}/payments`);
    });
    const st = loanState(loan.id);
    toast(st.paidOffDate ? 'Loan paid in full. Next, record the lien release.' : `Payment recorded. Receipt sent to ${loan.borrower.first || loan.borrower.name}.`);
  },
  'add-charge': (form) => {
    const v = readForm(form);
    const amount = parseMoneyInput(v.amount);
    if (!showErrors(form, amount > 0 ? {} : { amount: 'Enter an amount.' })) return;
    closeModal(form);
    update((s) => {
      const l = s.loans.find((x) => x.id === form.dataset.id);
      l.transactions.push({ id: uid('tx'), type: 'fee', date: v.date || today(), amount, kind: v.kind, memo: v.memo || (v.kind === 'nsf' ? 'Returned payment fee' : 'Charge') });
      logActivity(`Charge added · ${l.borrower.name} · ${money(amount)}`, `#/app/loans/${l.id}/payments`);
    });
    toast('Charge added');
  },
  'waive-charge': (form) => {
    const v = readForm(form);
    const loan = loanById(form.dataset.id);
    const fee = loanState(loan.id).fees.find((f) => f.id === v.feeId);
    if (!fee) return;
    closeModal(form);
    update((s) => {
      const l = s.loans.find((x) => x.id === loan.id);
      l.transactions.push({ id: uid('tx'), type: 'waiver', date: today(), amount: fee.remaining, feeId: fee.id, memo: v.memo });
      logActivity(`Charge waived · ${l.borrower.name} · ${money(fee.remaining)}`, `#/app/loans/${l.id}/payments`);
    });
    toast('Charge waived');
  },
  'escrow-disburse': (form) => {
    const v = readForm(form);
    const amount = parseMoneyInput(v.amount);
    if (!showErrors(form, amount > 0 ? {} : { amount: 'Enter the amount paid.' })) return;
    closeModal(form);
    update((s) => {
      const l = s.loans.find((x) => x.id === form.dataset.id);
      l.transactions.push({ id: uid('tx'), type: 'escrow_disbursement', date: v.date || today(), amount, category: v.category, payee: v.payee, memo: '' });
      logActivity(`Escrow disbursement · ${money(amount)} to ${v.payee || v.category}`, `#/app/loans/${l.id}/escrow`);
    });
    toast('Disbursement recorded');
  },
  'loan-note': (form) => {
    const v = readForm(form);
    if (!v.text.trim()) { showErrors(form, { text: 'Write a note first.' }); return; }
    closeModal(form);
    update((s) => {
      const l = s.loans.find((x) => x.id === form.dataset.id);
      l.notes = l.notes || [];
      l.notes.push({ date: today(), text: v.text.trim() });
    });
    toast('Note saved');
  },
});

export { PROPERTY_TYPES, installmentCount, checkbox };
