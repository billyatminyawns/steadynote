import { html } from '../../ui/html.js';
import { ic } from '../../ui/icons.js';
import { card, stat, badge } from '../../ui/components.js';
import { getState, loanStates, today } from '../../data/store.js';
import { money, money0, fmtDate, addMonths, sum, monthName } from '../../core/util.js';
import { PRICING, planOf, planPrice } from '../../core/pricing.js';

export const billingView = {
  layout: 'app',
  nav: 'billing',
  title: 'Billing',
  render() {
    const s = getState();
    const st = loanStates();
    const t = today();
    const month = t.slice(0, 7);
    const active = s.loans.filter((l) => !st[l.id].paidOffDate);
    const lines = active.map((l) => ({ l, plan: planOf(l), price: planPrice(planOf(l)) }));
    const servicing = sum(lines, (x) => x.price);
    const apps = s.applications.filter((a) => (a.submittedAt || '').slice(0, 7) === month);
    const sellerPaid = apps.filter((a) => a.fee?.paidBy === 'seller');
    const addons = s.loans.filter((l) => l.release && l.release.recordedAt.slice(0, 7) >= addMonths(t, -3).slice(0, 7)).map((l) => ({ label: `Payoff & lien release · ${l.number}`, date: l.release.recordedAt, amount: PRICING.addons.find((a) => a.id === 'payoff').price }));
    const total = servicing + sellerPaid.length * PRICING.screening.price + sum(addons.filter((a) => a.date.slice(0, 7) === month), (a) => a.amount);
    const history = [1, 2, 3].map((k) => {
      const d = addMonths(`${month}-01`, -k);
      const extra = sum(addons.filter((a) => a.date.slice(0, 7) === d.slice(0, 7)), (a) => a.amount);
      return { period: `${monthName(+d.slice(5, 7), true)} ${d.slice(0, 4)}`, date: addMonths(d, 1), amount: servicing + extra };
    });
    const collected = sum(active, (l) => st[l.id].payment);
    return html`
    <div class="page-head"><div><h1>Billing</h1><p>You pay per active loan. Buyers pay their own screening fees.</p></div></div>
    <div class="stats s3 mb-3">
      ${stat({ label: `Estimated bill for ${monthName(+month.slice(5, 7), true)}`, value: money(total), sub: `billed ${fmtDate(addMonths(`${month}-01`, 1))}`, icon: 'card' })}
      ${stat({ label: 'Active loans', value: String(active.length), sub: `${lines.filter((x) => x.plan === 'complete').length} on Complete · ${lines.filter((x) => x.plan === 'essentials').length} on Essentials`, icon: 'file' })}
      ${stat({ label: 'Cost vs. what you collect', value: collected ? `${((servicing / collected) * 100).toFixed(1)}%` : '—', sub: `${money0(servicing)} of ${money0(collected)} scheduled P&I`, icon: 'percent' })}
    </div>
    <div class="grid g-main">
      <div class="stack-lg">
        ${card({ cls: 'flush', title: 'This month', body: html`<div class="table-wrap"><table class="tbl">
          <thead><tr><th>Item</th><th>Plan</th><th class="num">Amount</th></tr></thead>
          <tbody>
            ${lines.map((x) => html`<tr><td><a class="cell-main" href="#/app/loans/${x.l.id}">${x.l.number} · ${x.l.borrower.name}</a><span class="cell-sub">${x.l.property.address}</span></td><td>${x.plan === 'complete' ? badge('brand', 'Servicing Complete') : badge('neutral', 'Servicing Essentials')}</td><td class="num">${money(x.price)}</td></tr>`)}
            ${apps.map((a) => html`<tr><td>Buyer screening · ${a.applicants[0].first} ${a.applicants[0].last}<span class="cell-sub">${fmtDate(a.submittedAt)}</span></td><td>${a.fee?.paidBy === 'seller' ? badge('neutral', 'Paid by you') : badge('good', 'Paid by applicant')}</td><td class="num">${a.fee?.paidBy === 'seller' ? money(PRICING.screening.price) : money(0)}</td></tr>`)}
            ${addons.filter((a) => a.date.slice(0, 7) === month).map((a) => html`<tr><td>${a.label}</td><td>${badge('outline', 'Add-on')}</td><td class="num">${money(a.amount)}</td></tr>`)}
          </tbody>
          <tfoot><tr><td colspan="2">Estimated total</td><td class="num">${money(total)}</td></tr></tfoot>
        </table></div>` })}
        ${card({ cls: 'flush', title: 'Invoice history', body: html`<div class="table-wrap"><table class="tbl"><thead><tr><th>Period</th><th>Paid</th><th class="num">Amount</th><th></th></tr></thead>
          <tbody>${history.map((h) => html`<tr><td>${h.period}</td><td>${fmtDate(h.date)}</td><td class="num">${money(h.amount)}</td><td>${badge('good', 'Paid', 'check')}</td></tr>`)}</tbody></table></div>` })}
      </div>
      <div class="stack-lg">
        ${card({ title: 'Payment method', body: html`<p class="mb-1"><strong>${s.profile.payoutAccount || 'Bank account on file'}</strong></p><p class="small muted mb-0">SteadyNote deducts fees from your first deposit each month, so there’s no card to keep current.</p>` })}
        ${card({ title: 'Plans', body: html`<dl class="kv rows">${PRICING.plans.map((p) => html`<div><dt>${p.name}</dt><dd>${p.price ? `${money0(p.price)} ${p.unit}` : 'Free'}</dd></div>`)}<div><dt>Buyer screening</dt><dd>${money0(PRICING.screening.price)} per applicant</dd></div></dl><a class="btn btn-ghost btn-sm mt-2" href="#/pricing">${ic('external', { size: 15 })} Full pricing</a>` })}
      </div>
    </div>`;
  },
};
