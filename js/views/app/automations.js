import { html } from '../../ui/html.js';
import { ic } from '../../ui/icons.js';
import { card, stat, toggle, toast } from '../../ui/components.js';
import { onAction } from '../../ui/actions.js';
import { getState, update, loanStates, today } from '../../data/store.js';
import { fmtDate, addDays, sum } from '../../core/util.js';
import { RULES, ruleOn, automationFeed, MINUTES_SAVED } from '../../core/automations.js';

const ruleIcon = Object.fromEntries(RULES.map((r) => [r.id, r.icon]));
const ruleName = Object.fromEntries(RULES.map((r) => [r.id, r.name]));

const feedList = (items, empty) => items.length
  ? html`<ul class="feed">${items.map((e) => html`<li>
      <span class="feed-icon ${e.status === 'scheduled' ? 'scheduled' : e.tone || ''}">${ic(ruleIcon[e.rule] || 'info', { size: 15 })}</span>
      <span class="feed-body"><strong>${e.title}</strong> · <a href="#/app/loans/${e.loanId}/activity">${e.who}</a><span class="feed-meta">${e.detail} · ${ruleName[e.rule]}</span></span>
      <span class="feed-date">${e.status === 'alert' ? 'Now' : fmtDate(e.date, 'short')}</span></li>`)}</ul>`
  : html`<p class="muted small mb-0">${empty}</p>`;

export const automationsView = {
  layout: 'app',
  nav: 'automations',
  title: 'Automations',
  render() {
    const s = getState();
    const st = loanStates();
    const t = today();
    const loans = s.loans.filter((l) => !st[l.id].paidOffDate);
    const feed = automationFeed(loans, st, s.settings, t, { back: 30, ahead: 21 });
    const alerts = feed.filter((e) => e.status === 'alert');
    const upcoming = feed.filter((e) => e.status === 'scheduled').sort((a, b) => (a.date < b.date ? -1 : 1));
    const sent = feed.filter((e) => e.status === 'sent');
    const minutes = sum(sent, (e) => MINUTES_SAVED[e.rule] || 5);
    const ap = loans.filter((l) => l.autopay?.enabled);
    return html`
    <div class="page-head"><div><h1>Automations</h1><p>The servicing work SteadyNote does for you. Every rule can be switched off.</p></div></div>
    <div class="stats mb-3">
      ${stat({ label: 'Actions in the last 30 days', value: String(sent.length), sub: 'reminders, drafts, receipts, notices', icon: 'zap' })}
      ${stat({ label: 'Time saved (30 days)', value: `${(minutes / 60).toFixed(1)} hrs`, sub: 'vs. doing it by hand', icon: 'clock' })}
      ${stat({ label: 'Loans on autopay', value: `${ap.length} of ${loans.length}`, sub: 'collected without anyone lifting a finger', icon: 'repeat' })}
      ${stat({ label: 'Alerts for you', value: String(alerts.length), sub: alerts.length ? 'needs a decision' : 'nothing to do', tone: alerts.length ? 'warn' : 'good', icon: 'bell' })}
    </div>
    <div class="grid g-main">
      <div class="stack-lg">
        ${card({ title: 'Rules', sub: 'Applied to every active loan.', body: html`<div>${RULES.map((r) => html`<div class="rule-row">
          <span class="rule-icon">${ic(r.icon, { size: 18 })}</span>
          <div class="grow"><strong>${r.name}</strong><p class="small muted mb-0">${r.desc}</p><div class="rule-meta"><span>${ic('clock', { size: 13 })} ${r.timing}</span><span>${ic('send', { size: 13 })} ${r.channel}</span></div></div>
          ${toggle({ name: `rule-${r.id}`, id: `rule-${r.id}`, checked: ruleOn(s.settings, r.id), label: html`<span class="sr-only">${r.name}</span>`, action: 'toggle-rule', data: { rule: r.id } })}
        </div>`)}</div>` })}
      </div>
      <div class="stack-lg">
        ${alerts.length ? card({ title: 'Needs you', body: feedList(alerts, '') }) : ''}
        ${card({ title: 'Coming up', sub: 'Next 3 weeks', body: feedList(upcoming.slice(0, 10), 'Nothing scheduled.') })}
        ${card({ title: 'Recently done', sub: 'Last 30 days', body: feedList(sent.slice(0, 14), 'Nothing yet.') })}
      </div>
    </div>`;
  },
};

onAction({
  'toggle-rule': (el) => {
    const on = el.checked;
    update((s) => { s.settings.automations = { ...(s.settings.automations || {}), [el.dataset.rule]: on }; });
    toast(`${ruleName[el.dataset.rule]} ${on ? 'on' : 'off'}`, on ? 'good' : 'info');
  },
});

export { addDays };
