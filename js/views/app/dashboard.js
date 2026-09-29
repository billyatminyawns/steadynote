import { html, raw } from '../../ui/html.js';
import { ic } from '../../ui/icons.js';
import { stat, card, statusBadge, badge, empty } from '../../ui/components.js';
import { stackedColumns, legend } from '../../ui/charts.js';
import { getState, loanStates, today, appsForDeal } from '../../data/store.js';
import { money, money0, moneyCompact, fmtDate, addDays, addMonths, daysBetween, sum, pct, monthName, ratePct } from '../../core/util.js';
import { analyzeApplication } from '../../core/qualify.js';
import { STATUS } from '../../core/servicing.js';
import { compliance } from '../shared.js';

function greeting(first) {
  const h = new Date().getHours();
  const part = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  return first ? `${part}, ${first}` : part;
}

export function attentionItems() {
  const s = getState();
  const st = loanStates();
  const t = today();
  const items = [];
  for (const l of s.loans) {
    const x = st[l.id];
    if (x.paidOffDate) continue;
    const who = l.borrower.name;
    if (['late', 'd30', 'd60', 'd90', 'default'].includes(x.status)) {
      items.push({ tone: x.status === 'late' ? 'serious' : 'critical', icon: 'alert', rank: 0,
        title: `${who} is ${x.dpd} days past due`,
        text: `${money(x.amountDue)} owed on ${l.number}, including ${money(x.feesOutstanding)} in late charges. Reminders and a late notice already went out.`,
        href: `#/app/loans/${l.id}`, cta: 'Open loan' });
    } else if (x.status === 'grace') {
      items.push({ tone: 'warning', icon: 'clock', rank: 2, title: `${who}’s payment is in the grace period`, text: `${money(x.nextInstallment.total)} was due ${fmtDate(x.nextInstallment.due)}. No late charge unless it’s still unpaid after day ${x.grace}.`, href: `#/app/loans/${l.id}`, cta: 'View' });
    }
    if (l.insurance?.expires && !l.insurance.renewalReceived) {
      const left = daysBetween(t, l.insurance.expires);
      if (left < 0) items.push({ tone: 'critical', icon: 'shield', rank: 0, title: `Insurance may have lapsed on ${l.property.address}`, text: `The policy expired ${fmtDate(l.insurance.expires)} and no renewal is on file. Your collateral may be uninsured.`, href: `#/app/loans/${l.id}`, cta: 'Review' });
      else if (left <= 30) items.push({ tone: 'warning', icon: 'shield', rank: 1, title: `Insurance expires in ${left} days`, text: `${l.property.address}: ${l.insurance.carrier || 'policy'} ends ${fmtDate(l.insurance.expires)}. We’ve asked ${l.borrower.contact || l.borrower.first || 'the buyer'} for proof of renewal.`, href: `#/app/loans/${l.id}`, cta: 'View' });
    }
    if (x.balloon) {
      const left = daysBetween(t, x.balloon.due);
      if (left <= 365) items.push({ tone: 'info', icon: 'flag', rank: 2, title: `Balloon of ${money0(x.balloon.total)} due ${fmtDate(x.balloon.due)}`, text: `${who} needs to refinance or sell within ${Math.max(0, Math.round(left / 30))} months.`, href: `#/app/loans/${l.id}`, cta: 'View' });
    }
    if (!l.borrower.tinOnFile) {
      items.push({ tone: 'info', icon: 'landmark', rank: 3, title: `Collect ${who}’s taxpayer ID`, text: 'You and the buyer each list the other’s SSN/TIN on your tax returns for seller-financed interest. Request it before year-end.', href: `#/app/loans/${l.id}`, cta: 'Request' });
    }
  }
  for (const d of s.deals) {
    if (d.status === 'listed') {
      const open = appsForDeal(d.id).filter((a) => ['new', 'review'].includes(a.status));
      if (open.length) items.push({ tone: 'info', icon: 'users', rank: 1, title: `${open.length} applicant${open.length > 1 ? 's' : ''} waiting on ${d.property.address}`, text: 'Scorecards and ATR worksheets are ready to review.', href: `#/app/deals/${d.id}`, cta: 'Review' });
    }
    if (d.status === 'draft') {
      const c = compliance(d);
      if (c.verdict.tone === 'critical') items.push({ tone: 'warning', icon: 'scale', rank: 1, title: `${d.property.address} needs changes before listing`, text: c.verdict.title + '. Remove the balloon or add an RMLO.', href: `#/app/deals/${d.id}`, cta: 'Fix terms' });
    }
  }
  return items.sort((a, b) => a.rank - b.rank);
}

const attItem = (i) => html`<div class="att-item">
  <span class="att-icon ${i.tone}">${ic(i.icon, { size: 18 })}</span>
  <div class="att-body"><strong>${i.title}</strong><p>${i.text}</p></div>
  <a class="btn btn-secondary btn-sm" href="${i.href}">${i.cta}</a>
</div>`;

function incomeProjection(months = 12) {
  const s = getState();
  const st = loanStates();
  const t = today();
  const start = `${t.slice(0, 7)}-01`;
  const cats = [];
  for (let i = 0; i <= months; i++) {
    const m0 = addMonths(start, i);
    cats.push({ key: m0.slice(0, 7), label: +m0.slice(5, 7) === 1 ? `${monthName(1)} '${m0.slice(2, 4)}` : monthName(+m0.slice(5, 7)), title: `${monthName(+m0.slice(5, 7), true)} ${m0.slice(0, 4)}`, interest: 0, principal: 0, balloon: false });
  }
  for (const l of s.loans) {
    const x = st[l.id];
    if (x.paidOffDate) continue;
    for (const m of x.unpaid) {
      if (m.due < t) continue;
      const c = cats.find((k) => k.key === m.due.slice(0, 7));
      if (!c) continue;
      c.interest += m.interest;
      c.principal += m.principal;
      if (m.balloon) c.balloon = true;
    }
  }
  // Show 12 months: skip the current month once all of its installments are behind us.
  return cats[0].interest + cats[0].principal === 0 ? cats.slice(1) : cats.slice(0, months);
}

export const dashboardView = {
  layout: 'app',
  nav: 'dashboard',
  title: 'Dashboard',
  render() {
    const s = getState();
    const st = loanStates();
    const t = today();
    const y = t.slice(0, 4);
    const active = s.loans.filter((l) => !st[l.id].paidOffDate);
    const monthly = sum(active, (l) => st[l.id].payment);
    const principal = sum(active, (l) => st[l.id].principalBalance);
    const wRate = principal ? sum(active, (l) => st[l.id].principalBalance * l.terms.ratePct) / principal : 0;
    const ytdInt = sum(s.loans, (l) => st[l.id].years[y]?.interest || 0);
    const ytdPrin = sum(s.loans, (l) => st[l.id].years[y]?.principal || 0);
    const hist = active.flatMap((l) => st[l.id].history.filter((h) => h.status !== 'open' && h.due >= addDays(t, -365)));
    const onTime = hist.length ? hist.filter((h) => ['ontime', 'grace'].includes(h.status)).length / hist.length : 1;
    const lates = hist.length - hist.filter((h) => ['ontime', 'grace'].includes(h.status)).length;
    const nextUp = active.map((l) => ({ l, m: st[l.id].unpaid.find((u) => u.due >= t) })).filter((x) => x.m).sort((a, b) => (a.m.due < b.m.due ? -1 : 1));
    const items = attentionItems();
    const proj = incomeProjection(12);
    const projTotal = sum(proj, (c) => c.interest + c.principal);
    const pipeline = s.deals.filter((d) => ['listed', 'draft'].includes(d.status));
    const recent = [
      ...s.activity.slice(0, 8).map((a) => ({ date: a.date, text: a.text, link: a.link, icon: 'sparkles' })),
      ...s.loans.flatMap((l) => (l.transactions || []).filter((tx) => tx.type === 'payment' && tx.date <= t && tx.date >= addDays(t, -30)).map((tx) => ({
        date: tx.date, text: `${tx.status === 'returned' ? 'Returned payment' : 'Payment received'} · ${l.borrower.name} · ${money(tx.amount)}`, link: `#/app/loans/${l.id}/payments`, icon: tx.status === 'returned' ? 'alert' : tx.method === 'autopay' ? 'repeat' : 'dollar', tone: tx.status === 'returned' ? 'serious' : 'good',
      }))),
    ].filter((r) => r.date <= t).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 8);

    return html`
    <div class="page-head">
      <div><h1>${greeting(s.profile.first)}</h1><p>Your seller-financing portfolio as of ${fmtDate(t, 'long')}.</p></div>
      <div class="btn-row"><a class="btn btn-secondary" href="#/app/loans/new">${ic('upload', { size: 16 })} Board an existing note</a></div>
    </div>
    ${s.loans.length === 0 && s.deals.length === 0 ? card({ body: empty({ icon: 'home', title: 'Welcome to SteadyNote', text: 'Start by structuring a deal for a property you want to sell, or board a note you already hold.', action: html`<div class="btn-row wrap" style="justify-content:center"><a class="btn btn-primary" href="#/app/deals/new">Structure a deal</a><a class="btn btn-secondary" href="#/app/loans/new">Board an existing note</a></div>` }) }) : html`
    <div class="hero-income">
      ${stat({ label: 'Scheduled monthly income', value: money0(monthly), sub: `${active.length} active note${active.length === 1 ? '' : 's'}${nextUp[0] ? ` · next deposit ${fmtDate(nextUp[0].m.due, 'short')}` : ''}`, icon: 'wallet', hero: true })}
      ${stat({ label: 'Principal outstanding', value: moneyCompact(principal), sub: `Weighted average rate ${pct(wRate, 2)}`, icon: 'bank' })}
      ${stat({ label: `Interest earned in ${y}`, value: money0(ytdInt), sub: `${money0(ytdPrin)} principal returned`, icon: 'trending' })}
      ${stat({ label: 'On-time payments (12 mo)', value: pct(onTime * 100, 0), sub: lates ? `${lates} late payment${lates > 1 ? 's' : ''} in 12 months` : 'No late payments', tone: lates ? 'warn' : 'good', icon: 'check' })}
    </div>
    <div class="grid g-main">
      <div class="stack-lg">
        ${card({ title: 'Needs your attention', sub: items.length ? `${items.length} item${items.length > 1 ? 's' : ''}` : 'All clear', body: items.length ? html`<div class="attention">${items.slice(0, 6).map(attItem)}</div>` : html`<p class="muted mb-0">Nothing needs you right now. Payments, reminders and statements are running on schedule.</p>` })}
        ${card({ title: 'Projected income, next 12 months', sub: `${money0(projTotal)} scheduled · interest is your earnings, principal is your equity coming back`, body: html`
          ${raw(legend([{ label: 'Interest', color: 'var(--series-1)' }, { label: 'Principal', color: 'var(--series-2)' }]))}
          <div class="dash-chart"></div>
          <details class="table-view"><summary>View as table</summary><div class="table-wrap"><table class="tbl compact"><thead><tr><th>Month</th><th class="num">Interest</th><th class="num">Principal</th><th class="num">Total</th></tr></thead><tbody>${proj.map((c) => html`<tr><td>${c.title}${c.balloon ? ' (balloon)' : ''}</td><td class="num">${money(c.interest)}</td><td class="num">${money(c.principal)}</td><td class="num">${money(c.interest + c.principal)}</td></tr>`)}</tbody></table></div></details>` })}
        ${card({ title: 'Your notes', action: html`<a class="btn btn-ghost btn-sm" href="#/app/loans">All loans ${ic('chevronRight', { size: 16 })}</a>`, body: html`
          <div class="table-wrap"><table class="tbl">
            <thead><tr><th>Borrower</th><th class="num">Balance</th><th class="num">Payment</th><th>Next due</th><th>Status</th></tr></thead>
            <tbody>${s.loans.map((l) => {
              const x = st[l.id];
              return html`<tr><td><a class="cell-main" href="#/app/loans/${l.id}">${l.borrower.name}</a><span class="cell-sub">${l.number} · ${l.property.address}, ${l.property.city}</span></td>
                <td class="num">${x.paidOffDate ? '—' : money0(x.principalBalance)}</td>
                <td class="num">${x.paidOffDate ? '—' : money(x.nextInstallment ? x.nextInstallment.total : x.payment)}</td>
                <td class="nowrap">${x.paidOffDate ? fmtDate(x.paidOffDate) : x.nextInstallment ? html`${fmtDate(x.nextInstallment.due)}${l.autopay?.enabled ? html` <span title="Autopay" class="muted">${ic('repeat', { size: 14 })}<span class="sr-only">autopay</span></span>` : ''}` : '—'}</td>
                <td>${statusBadge(x.status)}</td></tr>`;
            })}</tbody></table></div>` })}
      </div>
      <div class="stack-lg">
        ${card({ title: 'Deals in progress', action: html`<a class="btn btn-ghost btn-sm" href="#/app/deals">All deals ${ic('chevronRight', { size: 16 })}</a>`, body: pipeline.length ? html`<div class="stack-sm">${pipeline.map((d) => {
          const apps = appsForDeal(d.id);
          const best = apps.map((a) => analyzeApplication(a, d)).sort((a, b) => b.score - a.score)[0];
          return html`<a class="doc-item" href="#/app/deals/${d.id}"><span class="dicon">${ic(d.status === 'draft' ? 'pencil' : 'tag', { size: 18 })}</span><span class="grow"><strong>${d.property.address}</strong><span>${d.status === 'draft' ? 'Draft' : `${apps.length} applicant${apps.length === 1 ? '' : 's'}${best ? ` · top grade ${best.grade}` : ''}`} · ${money0(d.terms.salePrice)}</span></span>${d.status === 'listed' ? badge('good', 'Listed') : badge('neutral', 'Draft')}</a>`;
        })}</div>` : html`<p class="muted small">No active listings.</p><a class="btn btn-primary btn-sm" href="#/app/deals/new">Structure a deal</a>` })}
        ${card({ title: 'Coming up', sub: 'Next scheduled installments', body: nextUp.length ? html`<ul class="feed">${nextUp.slice(0, 5).map(({ l, m }) => html`<li><span class="feed-icon ${l.autopay?.enabled ? 'scheduled' : ''}">${ic(l.autopay?.enabled ? 'repeat' : 'calendar', { size: 15 })}</span><span class="feed-body"><strong>${money(m.total)}</strong> from ${l.borrower.name}<span class="feed-meta">${l.autopay?.enabled ? 'Autopay draft' : 'Manual payment'} · ${l.number}${m.balloon ? ' · balloon' : ''}</span></span><span class="feed-date">${fmtDate(m.due, 'short')}</span></li>`)}</ul>` : html`<p class="muted small mb-0">Nothing scheduled.</p>` })}
        ${card({ title: 'Recent activity', body: recent.length ? html`<ul class="feed">${recent.map((r) => html`<li><span class="feed-icon ${r.tone || ''}">${ic(r.icon, { size: 15 })}</span><span class="feed-body">${r.link ? html`<a href="${r.link}" style="color:inherit;text-decoration:none">${r.text}</a>` : r.text}</span><span class="feed-date">${fmtDate(r.date, 'short')}</span></li>`)}</ul>` : html`<p class="muted small mb-0">No activity yet.</p>` })}
      </div>
    </div>`}`;
  },
  mount(main) {
    const el = main.querySelector('.dash-chart');
    if (!el) return null;
    const proj = incomeProjection(12);
    return stackedColumns(el, {
      categories: proj.map((c) => ({ label: c.label, title: c.title + (c.balloon ? ' · includes balloon' : '') })),
      series: [
        { name: 'Interest', color: 'var(--series-1)', values: proj.map((c) => c.interest) },
        { name: 'Principal', color: 'var(--series-2)', values: proj.map((c) => c.principal) },
      ],
      height: 230,
      label: 'Projected monthly income for the next 12 months, interest and principal',
      yFormat: (v, precise) => (precise ? money(v) : moneyCompact(v)),
    });
  },
};

export { STATUS };
