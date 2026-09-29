// Borrower (buyer) portal: pay, autopay, balance, documents, payoff, messages.
import { html, raw, esc } from '../ui/html.js';
import { ic } from '../ui/icons.js';
import { card, statusBadge, empty, kv, meter, openModal, toast, alertBox, field, moneyField, checkbox, propertyArt, closeModal } from '../ui/components.js';
import { onAction, onSubmit, onLive, readForm, showErrors } from '../ui/actions.js';
import { getState, update, loanStates, loanById, loanState, today, logActivity } from '../data/store.js';
import { money, money0, fmtDate, ratePct, pct, durationLabel, daysBetween, addDays, addMonths, uid, parseMoneyInput, dollarsInput, yearOf } from '../core/util.js';
import { payoffQuote, hasBalloon } from '../core/servicing.js';
import { METHODS, propertyFacts } from './shared.js';

export const borrowerPickerView = {
  layout: 'borrower',
  title: 'Borrower portal',
  render() {
    const s = getState();
    const st = loanStates();
    return html`
      <h1>Borrower portal</h1>
      <p class="lead">This is what your buyers see. Pick a borrower to view the portal as them (demo, no sign-in).</p>
      ${s.loans.length ? html`<div class="picker mt-3">${s.loans.map((l) => html`<a class="deal-card" href="#/borrower/${l.id}">
        ${propertyArt(l.property)}
        <div class="deal-card-body"><div class="spread">${statusBadge(st[l.id].status)}<span class="xs muted">${l.number}</span></div><h3>${l.borrower.name}</h3><div class="small muted">${l.property.address}, ${l.property.city}</div></div>
      </a>`)}</div>` : card({ body: empty({ title: 'No loans yet', text: 'Borrowers appear here once a loan is boarded.' }) })}`;
  },
};

export const borrowerView = {
  layout: 'borrower',
  title: (ctx) => { const l = loanById(ctx.params.id); return l ? `${l.borrower.first || l.borrower.name} · Borrower portal` : 'Borrower portal'; },
  render(ctx) {
    const s = getState();
    const loan = loanById(ctx.params.id);
    if (!loan) return card({ body: empty({ title: 'Loan not found', action: html`<a class="btn btn-primary" href="#/borrower">Choose a borrower</a>` }) });
    const st = loanState(loan.id);
    const t = today();
    const first = loan.borrower.contact ? loan.borrower.contact.split(' ')[0] : loan.borrower.first || loan.borrower.name;
    const due = st.amountDue > 0 ? st.amountDue : st.nextInstallment ? st.nextInstallment.total : 0;
    const paidDown = loan.terms.principal ? (1 - st.principalBalance / loan.terms.principal) * 100 : 0;
    const payments = loan.transactions.filter((x) => x.type === 'payment' && x.date <= t).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 6);
    const ledgerByTx = new Map(st.ledger.filter((e) => e.tx).map((e) => [e.tx.id, e]));
    const y = yearOf(t);
    const ins = loan.insurance;
    const insLeft = ins?.expires ? daysBetween(t, ins.expires) : null;
    const seller = s.profile.entityName || s.profile.name || 'your seller';
    return html`
      <div class="spread mb-3">
        <div><h1 class="mb-0">Hi, ${first}</h1><p class="muted mb-0">${loan.property.address}, ${loan.property.city} · Loan ${loan.number} · serviced for ${seller}</p></div>
        ${statusBadge(st.status)}
      </div>
      ${st.paidOffDate ? html`<div class="mb-3">${alertBox({ tone: 'good', title: `Paid in full on ${fmtDate(st.paidOffDate)}. Congratulations!`, text: loan.release ? `Your ${loan.release.document.toLowerCase()} was recorded ${fmtDate(loan.release.recordedAt)}. The home is yours free and clear.` : 'Your lien release is being prepared.' })}</div>` : ''}
      ${['late', 'd30', 'd60', 'd90', 'default'].includes(st.status) ? html`<div class="mb-3">${alertBox({ tone: 'critical', title: `Your payment is ${st.dpd} days past due`, text: `Please pay ${money(st.amountDue)} as soon as you can. That includes ${money(st.feesOutstanding)} in late charges. Having trouble? Send a message and we’ll pass it to ${seller}.` })}</div>` : ''}
      ${st.status === 'grace' ? html`<div class="mb-3">${alertBox({ tone: 'warning', title: 'Your payment is due', text: `Pay by ${fmtDate(addDays(st.nextInstallment.due, st.grace))} to avoid a ${money(st.lateFee)} late charge.` })}</div>` : ''}
      <div class="grid g-main">
        <div class="stack-lg">
          ${st.paidOffDate ? '' : html`<div class="pay-card">
            <div class="spread"><span class="sub">${st.amountDue > 0 ? 'Amount due now' : 'Next payment'}</span>${loan.autopay?.enabled ? html`<span class="badge good">${ic('repeat', { size: 13 })}Autopay on</span>` : ''}</div>
            <div class="amount">${money(due)}</div>
            <div class="sub">${st.amountDue > 0 ? `Includes ${st.pastDue.length} installment${st.pastDue.length === 1 ? '' : 's'}${st.feesOutstanding ? ` and ${money(st.feesOutstanding)} in charges` : ''}` : st.nextInstallment ? `Due ${fmtDate(st.nextInstallment.due, 'long')}${loan.autopay?.enabled ? `. We’ll draft ${loan.autopay.account || 'your account'} that day.` : ''}` : ''}</div>
            <div class="btn-row wrap">
              <button type="button" class="btn btn-primary" data-action="b-pay" data-id="${loan.id}">${ic('dollar', { size: 16 })} Make a payment</button>
              ${loan.autopay?.enabled ? html`<button type="button" class="btn btn-secondary" data-action="b-autopay-off" data-id="${loan.id}">Manage autopay</button>` : html`<button type="button" class="btn btn-secondary" data-action="b-autopay" data-id="${loan.id}">${ic('repeat', { size: 16 })} Set up autopay</button>`}
            </div>
          </div>`}
          ${card({ title: 'Your loan', body: html`
            <div class="grid g-2" style="gap:20px">
              ${kv([['Principal balance', money(st.principalBalance)], ['Interest rate', `${ratePct(loan.terms.ratePct)} fixed`], ['Monthly payment', `${money(st.payment)} + ${money(loan.escrow?.enabled ? loan.escrow.monthly : 0)} escrow`], ['Paid through', st.paidThrough ? fmtDate(st.paidThrough) : '—']], 'one rows')}
              ${kv([['Original amount', money0(loan.terms.principal)], ['Started', fmtDate(loan.terms.closingDate)], [hasBalloon(loan.terms) ? 'Balloon due' : 'Final payment', `${fmtDate(st.maturityDate)}${st.balloon ? ` · ${money0(st.balloon.total)}` : ''}`], [`Interest paid in ${y}`, money(st.years[String(y)]?.interest || 0)]], 'one rows')}
            </div>
            <div class="mt-3"><div class="spread mb-1"><span class="small strong">You’ve paid off ${pct(paidDown, 1)}</span><span class="small muted">${money0(loan.terms.principal - st.principalBalance)} of ${money0(loan.terms.principal)}</span></div>
            ${meter({ value: paidDown, max: 100, tone: 'good', label: 'Loan paid off', text: pct(paidDown, 1) })}</div>
            ${st.balloon && !st.paidOffDate ? html`<div class="balloon-callout mt-3">${ic('flag', { size: 22 })}<div><strong>Plan ahead for your balloon payment</strong><p class="small mb-0">${money0(st.balloon.total)} is due ${fmtDate(st.balloon.due)} (${durationLabel(Math.max(0, Math.round(daysBetween(t, st.balloon.due) / 30.44)))} from now). Most buyers refinance with a bank. Keeping your payment history on time here helps.</p></div></div>` : ''}` })}
          ${card({ title: 'Recent payments', body: payments.length ? html`<ul class="feed">${payments.map((p) => {
            const e = ledgerByTx.get(p.id);
            const a = e?.alloc;
            return html`<li><span class="feed-icon ${p.status === 'returned' ? 'critical' : 'good'}">${ic(p.status === 'returned' ? 'alert' : 'check', { size: 15 })}</span>
              <span class="feed-body"><strong>${money(p.amount)}</strong> ${p.status === 'returned' ? html`<span class="badge critical">Returned</span>` : ''}<span class="feed-meta">${METHODS[p.method] || 'Payment'}${a ? ` · ${[a.interest && `${money(a.interest)} interest`, (a.principal + (a.extra || 0)) && `${money(a.principal + (a.extra || 0))} principal`, a.escrow && `${money(a.escrow)} escrow`, a.fees && `${money(a.fees)} charges`].filter(Boolean).join(' · ')}` : ''}</span></span>
              <span class="feed-date">${fmtDate(p.date, 'short')}</span></li>`;
          })}</ul>` : html`<p class="muted small mb-0">No payments yet. Your first payment is due ${fmtDate(loan.terms.firstDue)}.</p>` })}
        </div>
        <div class="stack-lg">
          ${card({ title: 'Documents', body: html`<div class="stack-sm">
            ${!st.paidOffDate ? html`<a class="doc-item" href="#/doc/statement/${loan.id}" target="_blank" rel="noopener"><span class="dicon">${ic('file', { size: 18 })}</span><span><strong>Current statement</strong><span>${st.nextInstallment ? `For ${fmtDate(st.nextInstallment.due, 'month')}` : ''}</span></span></a>` : ''}
            <a class="doc-item" href="#/doc/interest/${loan.id}?year=${y - 1}" target="_blank" rel="noopener"><span class="dicon">${ic('landmark', { size: 18 })}</span><span><strong>${y - 1} interest statement</strong><span>For Schedule A</span></span></a>
            <a class="doc-item" href="#/doc/schedule/${loan.id}" target="_blank" rel="noopener"><span class="dicon">${ic('calendar', { size: 18 })}</span><span><strong>Payment schedule</strong><span>Every payment through ${fmtDate(st.maturityDate, 'month')}</span></span></a>
          </div>` })}
          ${st.paidOffDate ? '' : card({ title: 'Payoff amount', sub: 'Refinancing or selling? Get your exact payoff.', body: html`<form data-live="b-payoff" data-id="${loan.id}" onsubmit="return false">
            ${field({ label: 'Payoff date', name: 'date', type: 'date', value: addDays(t, 10), min: t })}
            <div data-b-payoff class="mt-2">${payoffBlock(loan, addDays(t, 10))}</div>
          </form>` })}
          ${ins && !st.paidOffDate ? card({ title: 'Homeowners insurance', body: html`<p class="small mb-1">${ins.carrier || 'Your policy'}${ins.policy ? ` · ${ins.policy}` : ''}</p><p class="small ${insLeft != null && insLeft <= 30 ? 'warn-text' : 'muted'}">${insLeft != null && insLeft < 0 ? `Expired ${fmtDate(ins.expires)}` : `Renews ${fmtDate(ins.expires)}`}${insLeft != null && insLeft <= 45 && insLeft >= 0 ? `. Upload your renewal within ${insLeft} days.` : ''}</p>${insLeft != null && insLeft <= 45 ? html`<button type="button" class="btn btn-secondary btn-sm" data-action="b-upload-insurance" data-id="${loan.id}">${ic('upload', { size: 15 })} Upload renewal</button>` : ''}` }) : ''}
          ${card({ title: 'Message your servicer', body: html`<form data-form="b-message" data-id="${loan.id}" class="stack-sm">${field({ label: 'Message', name: 'text', type: 'textarea', rows: 3, placeholder: 'Questions about your payment, escrow or payoff?' })}<button type="submit" class="btn btn-secondary">${ic('send', { size: 15 })} Send</button></form>` })}
        </div>
      </div>`;
  },
};

function payoffBlock(loan, date) {
  const q = payoffQuote(loan, loanState(loan.id), date);
  return html`<div class="big-number" style="font-size:1.8rem">${money(q.total)}</div><p class="small muted mb-0">Good through ${fmtDate(date)}: ${money(q.principal)} principal + ${money(q.interest)} interest${q.fees ? ` + ${money(q.fees)} charges` : ''}. Adds ${money(Math.round(q.perDiem))} per day after that.</p><a class="btn btn-ghost btn-sm mt-1" href="#/doc/payoff/${loan.id}?date=${date}" target="_blank" rel="noopener">${ic('printer', { size: 15 })} Payoff letter</a>`;
}

onLive({
  'b-payoff': (form) => {
    const loan = loanById(form.dataset.id);
    const d = form.elements.date.value;
    if (d) form.querySelector('[data-b-payoff]').innerHTML = String(payoffBlock(loan, d));
  },
});

onAction({
  'b-pay': (el) => {
    const loan = loanById(el.dataset.id);
    const st = loanState(loan.id);
    const due = st.amountDue > 0 ? st.amountDue : st.nextInstallment ? st.nextInstallment.total : 0;
    openModal({
      title: 'Make a payment',
      body: `<form data-form="b-pay" data-id="${loan.id}" id="bpay-form" novalidate><div class="stack-sm">
        ${moneyField({ label: 'Payment amount', name: 'amount', value: dollarsInput(due), required: true, help: st.amountDue > 0 ? 'Amount due now, including charges' : `Your ${fmtDate(st.nextInstallment?.due)} payment` })}
        ${moneyField({ label: 'Extra toward principal (optional)', name: 'extra', value: '', help: 'Pays your loan down faster and saves interest.' })}
        ${field({ label: 'From', name: 'account', type: 'select', value: 'primary', options: [['primary', loan.autopay?.account || 'Checking ••6789 (demo)']] })}
      </div>
      <p class="xs muted mt-2 mb-0">By paying, you authorize a one-time ACH debit today. Demo: no money moves.</p></form>`,
      footer: `<button type="button" class="btn btn-secondary" data-action="modal-close">Cancel</button><button type="submit" form="bpay-form" class="btn btn-primary">Pay now</button>`,
    });
  },
  'b-autopay': (el) => {
    const loan = loanById(el.dataset.id);
    const st = loanState(loan.id);
    openModal({
      title: 'Set up autopay',
      body: `<form data-form="b-autopay" data-id="${loan.id}" id="bap-form" novalidate><div class="stack-sm">
        <p class="small">We’ll draft your scheduled payment of <strong>${esc(money(st.nextInstallment ? st.nextInstallment.total : st.payment))}</strong> on each due date. You can turn it off anytime.</p>
        <div class="form-grid">${field({ label: 'Bank', name: 'bank', value: 'Checking', required: true })}${field({ label: 'Account ending in', name: 'last4', value: '6789', inputmode: 'numeric', maxlength: 4, required: true })}</div>
        ${checkbox({ name: 'auth', required: true, label: 'I authorize SteadyNote to debit this account for each scheduled payment', desc: 'Until I cancel in the portal. Demo: no bank is actually linked.' })}
      </div></form>`,
      footer: `<button type="button" class="btn btn-secondary" data-action="modal-close">Cancel</button><button type="submit" form="bap-form" class="btn btn-primary">Turn on autopay</button>`,
    });
  },
  'b-autopay-off': (el) => {
    const loan = loanById(el.dataset.id);
    openModal({
      title: 'Autopay',
      size: 'sm',
      body: `<p>Autopay drafts ${esc(loan.autopay.account || 'your account')} on each due date. If you turn it off, you’ll need to pay each month yourself.</p>`,
      footer: `<button type="button" class="btn btn-secondary" data-action="modal-close">Keep autopay</button><button type="button" class="btn btn-danger" data-action="b-autopay-confirm-off" data-id="${loan.id}">Turn off</button>`,
    });
  },
  'b-autopay-confirm-off': (el) => {
    closeModal(el);
    update((s) => {
      const l = s.loans.find((x) => x.id === el.dataset.id);
      l.autopay = { ...l.autopay, enabled: false };
      logActivity(`${l.borrower.name} turned off autopay`, `#/app/loans/${l.id}`);
    });
    toast('Autopay turned off', 'info');
  },
  'b-upload-insurance': (el) => {
    update((s) => {
      const l = s.loans.find((x) => x.id === el.dataset.id);
      l.insurance = { ...l.insurance, expires: addMonths(l.insurance.expires, 12), renewalReceived: false, renewedAt: today() };
      l.notes = l.notes || [];
      l.notes.push({ date: today(), text: `Borrower uploaded a renewed declarations page (runs to ${fmtDate(l.insurance.expires)}).` });
      logActivity(`${l.borrower.name} uploaded proof of insurance renewal`, `#/app/loans/${l.id}`);
    });
    toast('Thanks! Your renewal is on file.');
  },
});

onSubmit({
  'b-pay': (form) => {
    const v = readForm(form);
    const amount = parseMoneyInput(v.amount), extra = parseMoneyInput(v.extra);
    if (!showErrors(form, amount > 0 || extra > 0 ? {} : { amount: 'Enter an amount.' })) return;
    const loan = loanById(form.dataset.id);
    closeModal(form);
    update((s) => {
      const l = s.loans.find((x) => x.id === loan.id);
      const acct = l.autopay?.account || 'Checking ••6789';
      if (amount > 0) l.transactions.push({ id: uid('tx'), type: 'payment', date: today(), amount, method: 'ach', status: 'cleared', memo: `Borrower portal · ${acct}` });
      if (extra > 0) l.transactions.push({ id: uid('tx'), type: 'payment', date: today(), amount: extra, method: 'ach', applyTo: 'principal', status: 'cleared', memo: 'Extra principal from borrower portal' });
      logActivity(`${l.borrower.name} paid ${money(amount + extra)} in the portal`, `#/app/loans/${l.id}/payments`);
    });
    toast(`Payment of ${money(amount + extra)} received. Receipt emailed.`);
  },
  'b-autopay': (form) => {
    const v = readForm(form);
    const errors = {};
    if (!v.bank.trim()) errors.bank = 'Enter the account type or bank.';
    if (!/^\d{4}$/.test(v.last4)) errors.last4 = 'Enter the last 4 digits.';
    if (!v.auth) errors.auth = 'Authorization is required.';
    if (!showErrors(form, errors)) return;
    closeModal(form);
    const loan = loanById(form.dataset.id);
    const st = loanState(loan.id);
    const since = st.nextInstallment && st.nextInstallment.due >= today() ? st.nextInstallment.due : addDays(today(), 1);
    update((s) => {
      const l = s.loans.find((x) => x.id === loan.id);
      l.autopay = { enabled: true, since, account: `${v.bank.trim()} ••${v.last4}` };
      logActivity(`${l.borrower.name} enrolled in autopay`, `#/app/loans/${l.id}`);
    });
    toast(`Autopay is on, starting ${fmtDate(since)}`);
  },
  'b-message': (form) => {
    const v = readForm(form);
    if (!v.text.trim()) { showErrors(form, { text: 'Write a message first.' }); return; }
    update((s) => {
      const l = s.loans.find((x) => x.id === form.dataset.id);
      l.notes = l.notes || [];
      l.notes.push({ date: today(), text: `Message from borrower: “${v.text.trim()}”` });
      logActivity(`Message from ${l.borrower.name}`, `#/app/loans/${l.id}/activity`);
    });
    toast('Message sent. We’ll reply by email.');
  },
});

export { raw, propertyFacts };
