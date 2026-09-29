import { html, raw } from '../../ui/html.js';
import { ic } from '../../ui/icons.js';
import { card, stat, badge, openModal, toast, moneyField, alertBox, closeModal } from '../../ui/components.js';
import { onAction, onSubmit, readForm, showErrors } from '../../ui/actions.js';
import { getState, update, loanStates, today, loanById } from '../../data/store.js';
import { money, money0, pct, sum, yearOf, parseMoneyInput, dollarsInput, fmtDate } from '../../core/util.js';
import { installmentSale, interestStatement } from '../../core/tax.js';
import { csv, downloadFile, centsToStr } from '../shared.js';

function rowsFor(year) {
  const s = getState();
  const st = loanStates();
  return s.loans
    .filter((l) => (l.terms.closingDate || l.terms.firstDue) <= `${year}-12-31`)
    .map((l) => {
      const is = interestStatement(l, year);
      const sale = installmentSale(l, st[l.id]);
      // Payments received in the year; the down payment counts in the year of sale.
      const principalForGain = is.principal + (sale && sale.saleYear === year ? l.terms.downPayment || 0 : 0);
      return { l, is, sale, principalForGain, gain: sale ? Math.round(principalForGain * sale.gpPct) : null };
    })
    .filter((r) => r.is.interest || r.principalForGain);
}

export const taxView = {
  layout: 'app',
  nav: 'tax',
  title: 'Tax center',
  render(ctx) {
    const t = today();
    const cy = yearOf(t);
    const year = Number(ctx.query.y) || cy;
    const rows = rowsFor(year);
    const interest = sum(rows, (r) => r.is.interest);
    const principal = sum(rows, (r) => r.is.principal);
    const gain = sum(rows, (r) => r.gain || 0);
    const late = sum(rows, (r) => r.is.lateCharges);
    const missingBasis = rows.filter((r) => !r.sale);
    const missingTin = rows.filter((r) => !r.l.borrower.tinOnFile && r.l.property.occupancy !== 'investment');
    const chip = (y) => html`<a class="chip" href="#/app/tax?y=${y}"${y === year ? raw(' aria-current="true"') : ''}>${y}${y === cy ? ' (to date)' : ''}</a>`;
    return html`
    <div class="page-head">
      <div><h1>Tax center</h1><p>Interest income, principal received and installment-sale gain for each note, ready for your CPA.</p></div>
      <button type="button" class="btn btn-secondary" data-action="export-tax" data-year="${year}">${ic('download', { size: 16 })} CPA packet (CSV)</button>
    </div>
    <div class="chip-row mb-3" role="navigation" aria-label="Tax year">${chip(cy)}${chip(cy - 1)}${chip(cy - 2)}</div>
    <div class="stats mb-3">
      ${stat({ label: 'Interest income', value: money0(interest), sub: 'Schedule B, ordinary income', icon: 'trending' })}
      ${stat({ label: 'Principal received', value: money0(principal), sub: 'return of your sale price', icon: 'bank' })}
      ${stat({ label: 'Gain recognized', value: money0(gain), sub: 'installment method (Form 6252)', icon: 'landmark' })}
      ${stat({ label: 'Late charges received', value: money0(late), sub: 'generally taxable as income', icon: 'receipt' })}
    </div>
    ${missingBasis.length || missingTin.length ? html`<div class="stack-sm mb-3">
      ${missingBasis.length ? alertBox({ tone: 'warning', title: `Add your cost basis for ${missingBasis.length} loan${missingBasis.length > 1 ? 's' : ''}`, text: 'Gain can’t be calculated without the adjusted basis and selling expenses from the sale.' }) : ''}
      ${missingTin.length ? alertBox({ tone: 'info', title: `Taxpayer ID missing for ${missingTin.map((r) => r.l.borrower.name).join(', ')}`, text: 'For seller-financed home loans, you and the buyer each list the other’s name, address and SSN on your returns.' }) : ''}
    </div>` : ''}
    <div class="card flush mb-3">
      <div class="card-head" style="padding:18px 20px 0"><div><h2 class="card-title">By loan · ${year}${year === cy ? ' to date' : ''}</h2><p class="card-sub">From the live ledger. Interest is counted when received.</p></div></div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Loan</th><th class="num">Interest</th><th class="num">Principal</th><th class="num">Gross profit %</th><th class="num">Gain</th><th>Buyer TIN</th><th></th></tr></thead>
        <tbody>${rows.length ? rows.map((r) => html`<tr>
          <td><a class="cell-main" href="#/app/loans/${r.l.id}">${r.l.borrower.name}</a><span class="cell-sub">${r.l.number} · ${r.l.property.address}</span></td>
          <td class="num">${money(r.is.interest)}</td>
          <td class="num">${money(r.principalForGain ?? r.is.principal)}${r.sale && r.sale.saleYear === year ? html`<span class="cell-sub">incl. down payment</span>` : ''}</td>
          <td class="num">${r.sale ? pct(r.sale.gpPct * 100, 1) : html`<button type="button" class="link-btn" data-action="edit-basis" data-id="${r.l.id}">Add basis</button>`}</td>
          <td class="num">${r.gain != null ? money(r.gain) : '—'}</td>
          <td>${r.l.borrower.tinOnFile ? badge('good', 'On file', 'check') : r.l.property.occupancy === 'investment' ? badge('neutral', 'Business') : badge('warning', 'Missing')}</td>
          <td class="nowrap"><a class="btn btn-ghost btn-sm" href="#/doc/interest/${r.l.id}?year=${year}" target="_blank" rel="noopener">${ic('file', { size: 15 })} Statement</a>${r.sale ? html`<button type="button" class="btn btn-ghost btn-sm" data-action="edit-basis" data-id="${r.l.id}" aria-label="Edit basis for ${r.l.number}">${ic('pencil', { size: 15 })}</button>` : ''}</td>
        </tr>`) : html`<tr><td colspan="7" class="muted">No activity in ${year}.</td></tr>`}</tbody>
        ${rows.length ? html`<tfoot><tr><td>Total</td><td class="num">${money(interest)}</td><td class="num">${money(sum(rows, (r) => r.principalForGain ?? r.is.principal))}</td><td></td><td class="num">${money(gain)}</td><td colspan="2"></td></tr></tfoot>` : ''}
      </table></div>
    </div>
    <div class="grid g-2">
      ${card({ title: 'What goes where', body: html`<ul class="checklist" style="margin-top:0">
        <li>${ic('check')}<span><strong>Interest you received</strong> is ordinary income on <strong>Schedule B</strong>. For a buyer who lives in the home, list the buyer’s name, address and SSN there.</span></li>
        <li>${ic('check')}<span><strong>Gain on the sale</strong> is reported on <strong>Form 6252</strong> each year you receive principal, at your gross profit percentage.</span></li>
        <li>${ic('check')}<span><strong>Depreciation recapture</strong> on a former rental follows its own rules. Unrecaptured §1250 gain is recognized first as payments come in. Your CPA splits it out.</span></li>
        <li>${ic('check')}<span><strong>Form 1098</strong> is required only if you receive $600+ of mortgage interest in a trade or business. Most individual sellers send an interest statement instead. SteadyNote generates both.</span></li>
      </ul><p class="xs muted mb-0">General information, not tax advice.</p>` })}
      ${card({ title: 'Your buyers get this too', body: html`<p class="small">Each January, SteadyNote sends every buyer a year-end statement with the interest they paid (and property taxes paid from escrow), so they can deduct it on Schedule A. They list your name, address and SSN, which SteadyNote supplies securely.</p><a class="btn btn-secondary btn-sm" href="#/borrower">${ic('eye', { size: 15 })} See the buyer portal</a>` })}
    </div>`;
  },
};

onAction({
  'edit-basis': (el) => {
    const loan = loanById(el.dataset.id);
    const x = loan.tax || {};
    openModal({
      title: `Cost basis · ${loan.property.address}`,
      size: 'sm',
      body: `<form data-form="save-basis" data-id="${loan.id}" id="basis-form" novalidate><div class="stack-sm">
        <p class="small">From your records at the sale (${money0(loan.terms.salePrice)} on ${fmtDate(loan.terms.closingDate)}).</p>
        ${moneyField({ label: 'Adjusted basis', name: 'adjustedBasis', value: x.adjustedBasis != null ? dollarsInput(x.adjustedBasis) : '', required: true, help: 'Purchase price + improvements − depreciation taken.' })}
        ${moneyField({ label: 'Selling expenses', name: 'sellingExpenses', value: x.sellingExpenses != null ? dollarsInput(x.sellingExpenses) : '', help: 'Commissions, escrow and legal fees you paid.' })}
        ${moneyField({ label: 'Depreciation taken (for reference)', name: 'depreciationTaken', value: x.depreciationTaken ? dollarsInput(x.depreciationTaken) : '' })}
      </div></form>`,
      footer: `<button type="button" class="btn btn-secondary" data-action="modal-close">Cancel</button><button type="submit" form="basis-form" class="btn btn-primary">Save</button>`,
    });
  },
  'export-tax': (el) => {
    const year = Number(el.dataset.year);
    const rows = rowsFor(year);
    const out = [['Tax year', 'Loan', 'Borrower', 'Property', 'Interest received', 'Principal received', 'Gross profit %', 'Gain recognized', 'Late charges', 'Property tax paid from escrow', 'Buyer TIN on file']]
      .concat(rows.map((r) => [year, r.l.number, r.l.borrower.name, `${r.l.property.address}, ${r.l.property.city} ${r.l.property.state}`, centsToStr(r.is.interest), centsToStr(r.principalForGain ?? r.is.principal), r.sale ? (r.sale.gpPct * 100).toFixed(2) : '', r.gain != null ? centsToStr(r.gain) : '', centsToStr(r.is.lateCharges), centsToStr(r.is.taxesPaid), r.l.borrower.tinOnFile ? 'yes' : 'no']));
    downloadFile(`steadynote-tax-${year}.csv`, csv(out));
    toast('CPA packet downloaded');
  },
});

onSubmit({
  'save-basis': (form) => {
    const v = readForm(form);
    const basis = parseMoneyInput(v.adjustedBasis);
    if (!showErrors(form, v.adjustedBasis.trim() ? {} : { adjustedBasis: 'Enter your adjusted basis.' })) return;
    closeModal(form);
    update((s) => {
      const l = s.loans.find((x) => x.id === form.dataset.id);
      l.tax = { adjustedBasis: basis, sellingExpenses: parseMoneyInput(v.sellingExpenses), depreciationTaken: parseMoneyInput(v.depreciationTaken) };
    });
    toast('Cost basis saved');
  },
});
