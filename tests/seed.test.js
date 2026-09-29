// Demo seed sanity across several "today" dates.
import { buildSeed } from '../js/data/seed.js';
import { computeLoan } from '../js/core/servicing.js';
import { analyzeApplication } from '../js/core/qualify.js';
import { checkCompliance } from '../js/core/compliance.js';
import { money } from '../js/core/util.js';

const log = typeof print === 'function' ? print : console.log;
let passed = 0, failed = 0;
const ok = (name, cond, detail = '') => { if (cond) passed++; else { failed++; log(`FAIL ${name} ${detail}`); } };

for (const today of ['2026-09-29', '2026-10-03', '2026-10-17', '2026-12-31', '2027-02-28', '2027-07-01']) {
  const s = buildSeed(today);
  const st = Object.fromEntries(s.loans.map((l) => [l.id, computeLoan(l, today)]));
  const summary = s.loans.map((l) => `${l.number}:${st[l.id].status}/${st[l.id].dpd}d bal ${money(st[l.id].principalBalance)} esc ${money(st[l.id].escrowBalance)} fees ${money(st[l.id].feesOutstanding)} susp ${money(st[l.id].suspense)} credit ${money(st[l.id].credit)}`).join('\n   ');
  log(`${today}\n   ${summary}`);
  ok(`${today} reyes current`, st.ln_reyes.status === 'current', st.ln_reyes.status);
  ok(`${today} whitfield late`, st.ln_whitfield.status === 'late', `${st.ln_whitfield.status} ${st.ln_whitfield.dpd}`);
  ok(`${today} natarajan current`, st.ln_natarajan.status === 'current', st.ln_natarajan.status);
  ok(`${today} brandt current-ish`, ['current', 'grace'].includes(st.ln_brandt.status), st.ln_brandt.status);
  ok(`${today} osei paid off`, st.ln_osei.status === 'paid_off', st.ln_osei.status);
  for (const l of s.loans) {
    const x = st[l.id];
    ok(`${today} ${l.number} no credit`, x.credit === 0, money(x.credit));
    ok(`${today} ${l.number} no suspense`, x.suspense === 0, money(x.suspense));
    ok(`${today} ${l.number} escrow >= 0`, x.escrowBalance >= 0, money(x.escrowBalance));
  }
  ok(`${today} brandt nsf fee cleared`, st.ln_brandt.feesOutstanding === 0, money(st.ln_brandt.feesOutstanding));
  ok(`${today} whitfield late fee outstanding`, st.ln_whitfield.feesOutstanding > 0);
  const deal = s.deals.find((d) => d.id === 'deal_sunset');
  const grades = s.applications.filter((a) => a.dealId === deal.id).map((a) => {
    const an = analyzeApplication(a, deal);
    return `${a.applicants[0].last}:${an.grade}(${an.score}) dti ${an.back.toFixed(1)}%`;
  });
  if (today === '2026-09-29') log('   grades ' + grades.join(', '));
  ok(`${today} grades`, grades[0].includes(':A(') && grades[1].includes(':C(') && grades[2].includes(':E('), grades.join(' '));
  const cfg = { market: s.settings.market, afr: s.settings.afr };
  const seller = { ...s.profile, financedLast12: 1 };
  const c1 = checkCompliance({ seller, property: deal.property, occupancy: 'owner', terms: deal.terms, ...cfg });
  const pine = s.deals.find((d) => d.id === 'deal_pine');
  const c2 = checkCompliance({ seller, property: pine.property, occupancy: 'owner', terms: pine.terms, ...cfg });
  ok(`${today} sunset exempt`, c1.verdict.tone === 'good', c1.verdict.title);
  ok(`${today} pine needs rmlo`, c2.verdict.tone === 'critical', c2.verdict.title);
  if (today === '2026-09-29') log('   pine: ' + c2.verdict.text);
}

log(`\n${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} test(s) failed`);
