import { html } from '../../ui/html.js';
import { ic } from '../../ui/icons.js';
import { card, field, moneyField, checkbox, toggle, toast, openModal, closeModal } from '../../ui/components.js';
import { onAction, onSubmit, onLive, readForm, showErrors } from '../../ui/actions.js';
import { getState, update, today, setClock, startEmpty, exportJSON, importJSON, financedLast12 } from '../../data/store.js';
import { fmtDate, parseNum, localToday } from '../../core/util.js';
import { ENTITY_TYPES } from '../../core/compliance.js';
import { MARKET_DEFAULTS, AFR_DEFAULTS } from '../../core/rates.js';
import { STATES } from '../deal-form.js';
import { downloadFile } from '../shared.js';

export const settingsView = {
  layout: 'app',
  nav: 'settings',
  title: 'Settings',
  render() {
    const s = getState();
    const p = s.profile, m = s.settings.market, a = s.settings.afr, d = s.settings.defaults;
    const own = financedLast12() - Number(p.otherFinancedLast12 || 0);
    return html`
    <div class="page-head"><div><h1>Settings</h1><p>Your seller profile drives the compliance checks on every deal.</p></div></div>
    <div class="grid g-main">
      <div class="stack-lg">
        <form class="card" data-form="save-profile" novalidate>
          <div class="card-head"><div><h2 class="card-title">Seller profile</h2><p class="card-sub">Who holds the notes. Used for Reg Z seller-financer limits and on documents.</p></div></div>
          <div class="form-grid">
            ${field({ label: 'Your name(s)', name: 'name', value: p.name, required: true })}
            ${field({ label: 'First name (for greetings)', name: 'first', value: p.first })}
            ${field({ label: 'Selling entity', name: 'entityName', value: p.entityName, placeholder: 'e.g. Smith Family Trust' })}
            ${field({ label: 'Entity type', name: 'entityType', type: 'select', value: p.entityType, options: Object.entries(ENTITY_TYPES) })}
            ${field({ label: 'Email', name: 'email', type: 'email', value: p.email })}
            ${field({ label: 'Phone', name: 'phone', type: 'tel', value: p.phone })}
            ${field({ label: 'City', name: 'city', value: p.city })}
            ${field({ label: 'State', name: 'state', type: 'select', value: p.state || 'WA', options: STATES.map((x) => [x, x]) })}
            ${field({ label: 'Deposit account', name: 'payoutAccount', value: p.payoutAccount, cls: 'full', help: 'Where autopay collections land (demo).' })}
            ${field({ label: 'Seller-financed sales outside SteadyNote (last 12 months)', name: 'otherFinancedLast12', value: p.otherFinancedLast12 || 0, inputmode: 'numeric', cls: 'full', help: `SteadyNote already counts ${own} closing${own === 1 ? '' : 's'} from your loans in the last 12 months.` })}
            <div class="full stack-sm">
              ${checkbox({ name: 'builder', checked: p.builder, label: 'I build homes (or act as a contractor) in the ordinary course of business', desc: 'Builders can’t use either Reg Z seller-financer exclusion.' })}
              ${checkbox({ name: 'hasMortgage', checked: p.hasMortgage, label: 'Some properties I sell still have a mortgage', desc: 'Adds due-on-sale warnings to deals.' })}
            </div>
          </div>
          <div class="btn-row mt-3"><button class="btn btn-primary" type="submit">Save profile</button></div>
        </form>
        <form class="card" data-form="save-market" novalidate>
          <div class="card-head"><div><h2 class="card-title">Market data</h2><p class="card-sub">Used for rate guardrails. Update monthly.</p></div><button type="button" class="btn btn-ghost btn-sm" data-action="market-defaults">Restore defaults</button></div>
          <div class="form-grid">
            ${field({ label: '30-year fixed average', name: 'pmms30', value: m.pmms30, suffix: '%', inputmode: 'decimal', help: `${m.source}, ${fmtDate(m.asOf)}` })}
            ${field({ label: 'As of', name: 'asOf', type: 'date', value: m.asOf })}
            ${field({ label: 'AFR month', name: 'month', value: a.month, help: `${a.ruling}` })}
            <div></div>
            ${field({ label: 'Short-term AFR (monthly)', name: 'short', value: a.monthly.short, suffix: '%', inputmode: 'decimal' })}
            ${field({ label: 'Mid-term AFR (monthly)', name: 'mid', value: a.monthly.mid, suffix: '%', inputmode: 'decimal' })}
            ${field({ label: 'Long-term AFR (monthly)', name: 'long', value: a.monthly.long, suffix: '%', inputmode: 'decimal' })}
          </div>
          <p class="xs muted mt-2">Find the current table at <a href="https://www.irs.gov/applicable-federal-rates" target="_blank" rel="noopener">irs.gov/applicable-federal-rates</a>. For a sale, you may use the lowest AFR from the three months ending with the month of the signed contract.</p>
          <div class="btn-row"><button class="btn btn-primary" type="submit">Save market data</button></div>
        </form>
        <form class="card" data-form="save-defaults" novalidate>
          <div class="card-head"><div><h2 class="card-title">Deal defaults</h2><p class="card-sub">Starting values for new deals.</p></div></div>
          <div class="form-grid">
            ${field({ label: 'Grace period', name: 'graceDays', value: d.graceDays, suffix: 'days', inputmode: 'numeric' })}
            ${field({ label: 'Late charge', name: 'lateFeePct', value: d.lateFeePct, suffix: '% of P&I', inputmode: 'decimal' })}
            <div class="full">${toggle({ name: 'escrow', checked: d.escrow !== false, label: 'Escrow taxes & insurance by default' })}</div>
          </div>
          <div class="btn-row mt-3"><button class="btn btn-primary" type="submit">Save defaults</button></div>
        </form>
      </div>
      <div class="stack-lg">
        ${card({ title: 'Demo clock', sub: 'Jump ahead to watch autopay, reminders and late charges happen.', body: html`
          <p class="mb-2">Workspace date: <strong>${fmtDate(today(), 'long')}</strong>${s.settings.clockOffset ? html` <span class="muted">(+${s.settings.clockOffset} days)</span>` : ''}</p>
          <div class="btn-row wrap"><button type="button" class="btn btn-secondary btn-sm" data-action="clock" data-days="7">+1 week</button><button type="button" class="btn btn-secondary btn-sm" data-action="clock" data-days="30">+1 month</button><button type="button" class="btn btn-ghost btn-sm" data-action="clock" data-days="reset"${s.settings.clockOffset ? '' : ' disabled'}>Back to today</button></div>` })}
        ${card({ title: 'Your data', sub: 'Everything is stored in this browser only.', body: html`<div class="stack-sm">
          <button type="button" class="btn btn-secondary btn-block" data-action="export-data">${ic('download', { size: 16 })} Export workspace (JSON)</button>
          <button type="button" class="btn btn-secondary btn-block" data-action="pick-import">${ic('upload', { size: 16 })} Import workspace</button>
          <input type="file" id="import-file" accept="application/json,.json" hidden data-live="import-data">
          <button type="button" class="btn btn-secondary btn-block" data-action="reset-demo">${ic('refresh', { size: 16 })} Reset demo data</button>
          <button type="button" class="btn btn-ghost btn-block" data-action="start-empty">${ic('trash', { size: 16 })} Start an empty workspace</button>
        </div>` })}
        ${card({ title: 'About', body: html`<p class="small">SteadyNote is a prototype for a seller-financing servicing platform. It isn’t a lender, loan originator, law firm or tax advisor.</p><p class="xs muted mb-0">Compliance references: 12 CFR 1026.36(a)(4)–(5), 12 CFR 1026.43(c), IRC §§ 453, 483, 1274. Market data: ${MARKET_DEFAULTS.source}; IRS ${AFR_DEFAULTS.ruling}.</p>` })}
      </div>
    </div>`;
  },
};

onSubmit({
  'save-profile': (form) => {
    const v = readForm(form);
    if (!showErrors(form, v.name.trim() ? {} : { name: 'Enter your name.' })) return;
    update((s) => {
      Object.assign(s.profile, {
        name: v.name.trim(), first: v.first.trim() || v.name.trim().split(/\s+/)[0], entityName: v.entityName.trim(), entityType: v.entityType,
        email: v.email.trim(), phone: v.phone.trim(), city: v.city.trim(), state: v.state, payoutAccount: v.payoutAccount.trim(),
        otherFinancedLast12: Math.max(0, Math.round(parseNum(v.otherFinancedLast12, 0))), builder: !!v.builder, hasMortgage: !!v.hasMortgage,
      });
    });
    toast('Profile saved. Compliance checks updated.');
  },
  'save-market': (form) => {
    const v = readForm(form);
    const nums = { pmms30: parseNum(v.pmms30, NaN), short: parseNum(v.short, NaN), mid: parseNum(v.mid, NaN), long: parseNum(v.long, NaN) };
    const errors = {};
    for (const [k, x] of Object.entries(nums)) if (!(x > 0 && x < 30)) errors[k] = 'Enter a rate between 0 and 30%.';
    if (!showErrors(form, errors)) return;
    update((s) => {
      s.settings.market = { ...s.settings.market, pmms30: nums.pmms30, asOf: v.asOf || s.settings.market.asOf };
      s.settings.afr = { ...s.settings.afr, month: v.month || s.settings.afr.month, monthly: { short: nums.short, mid: nums.mid, long: nums.long } };
    });
    toast('Market data saved');
  },
  'save-defaults': (form) => {
    const v = readForm(form);
    update((s) => {
      s.settings.defaults = { graceDays: Math.max(0, Math.round(parseNum(v.graceDays, 15))), lateFeePct: Math.max(0, parseNum(v.lateFeePct, 5)), escrow: !!v.escrow };
    });
    toast('Defaults saved');
  },
});

onAction({
  'market-defaults': () => {
    update((s) => { s.settings.market = { ...MARKET_DEFAULTS }; s.settings.afr = JSON.parse(JSON.stringify(AFR_DEFAULTS)); });
    toast('Market data restored');
  },
  'pick-import': () => { const f = document.getElementById('import-file'); if (f) f.click(); },
  'export-data': () => downloadFile(`steadynote-workspace-${localToday()}.json`, exportJSON(), 'application/json'),
  'start-empty': () => {
    openModal({
      title: 'Start an empty workspace?',
      size: 'sm',
      body: '<p>This removes the demo portfolio so you can enter your own deals and notes. Export first if you want to keep your changes.</p>',
      footer: '<button type="button" class="btn btn-secondary" data-action="modal-close">Cancel</button><button type="button" class="btn btn-danger" data-action="confirm-empty">Start empty</button>',
    });
  },
  'confirm-empty': (el) => {
    closeModal(el);
    startEmpty();
    toast('Empty workspace ready. Set up your profile first.');
    location.hash = '#/app/settings';
  },
});

onLive({
  'import-data': async (el) => {
    const file = el.files && el.files[0];
    if (!file) return;
    try {
      importJSON(await file.text());
      toast('Workspace imported');
    } catch (err) {
      toast(err.message || 'Couldn’t import that file', 'warning');
    }
    el.value = '';
  },
});

export { setClock };
