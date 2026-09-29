// Engine tests. Run: ./tests/run.sh  (uses macOS JavaScriptCore, no Node needed)
import { pmt, amortize, aprPct, principalForPayment, presentValue, yieldForPrice } from '../js/core/finance.js';
import { computeLoan, payoffQuote, pendingAutopay, withTransactions, previewTransaction, lateFeeFor, escrowAnalysis } from '../js/core/servicing.js';
import { addMonths, addDays, daysBetween, roundDiv, money } from '../js/core/util.js';

const log = typeof print === 'function' ? print : console.log;
let passed = 0, failed = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++; else { failed++; log(`FAIL ${name}\n   got:  ${JSON.stringify(got)}\n   want: ${JSON.stringify(want)}`); }
}
function ok(name, cond, detail = '') {
  if (cond) passed++; else { failed++; log(`FAIL ${name} ${detail}`); }
}

// ---- util ----
eq('roundDiv half up', roundDiv(5, 10), 1);
eq('roundDiv below half', roundDiv(4, 10), 0);
eq('roundDiv negative', roundDiv(-5, 10), -1);
eq('addMonths clamp', addMonths('2026-01-31', 1), '2026-02-28');
eq('addMonths anchor restore', addMonths('2026-02-28', 1, 31), '2026-03-31');
eq('addMonths negative', addMonths('2026-01-15', -1), '2025-12-15');
eq('addMonths leap', addMonths('2024-01-31', 1), '2024-02-29');
eq('daysBetween', daysBetween('2026-01-01', '2026-03-01'), 59);

// ---- finance ----
eq('pmt 200k 6% 30y', pmt(20000000, 6, 360), 119910);
eq('pmt 100k 5% 30y', pmt(10000000, 5, 360), 53682);
eq('pmt 0%', pmt(1200000, 0, 12), 100000);
{
  const a = amortize({ principal: 20000000, ratePct: 6, amortMonths: 360, firstDue: '2026-01-01' });
  eq('amort rows', a.rows.length, 360);
  eq('amort first interest', a.rows[0].interest, 100000);
  eq('amort first principal', a.rows[0].principal, 19910);
  eq('amort final balance', a.rows[359].balance, 0);
  eq('amort principal sum', a.rows.reduce((s, r) => s + r.principal, 0), 20000000);
  ok('amort final payment close to P', Math.abs(a.rows[359].payment - 119910) < 200, a.rows[359].payment);
  eq('amort due dates', [a.rows[0].due, a.rows[1].due, a.rows[12].due], ['2026-01-01', '2026-02-01', '2027-01-01']);
  eq('apr equals note rate w/o fees', Math.round(aprPct(20000000, a.rows.map((r) => r.payment)) * 1000) / 1000, 6);
  ok('apr with 1% fee > rate', aprPct(19800000, a.rows.map((r) => r.payment)) > 6.09);
}
{
  const b = amortize({ principal: 37080000, ratePct: 7.25, amortMonths: 360, balloonMonths: 84, firstDue: '2024-09-01' });
  eq('balloon installments', b.rows.length, 84);
  ok('balloon flagged', b.rows[83].balloon);
  eq('balloon clears', b.rows[83].balance, 0);
  ok('balloon big', b.balloonAmount > 30000000, money(b.balloonAmount));
}
eq('principalForPayment inverse', Math.abs(principalForPayment(119910, 6, 360) - 20000000) < 200, true);
{
  const flows = Array.from({ length: 12 }, (_, i) => ({ t: i + 1, amount: 100000 }));
  const pv = presentValue(flows, 12);
  ok('yieldForPrice inverse', Math.abs(yieldForPrice(flows, pv) - 12) < 1e-6);
}

// ---- servicing ----
const baseLoan = () => ({
  id: 'ln_t',
  terms: { principal: 20000000, ratePct: 6, amortMonths: 360, firstDue: '2026-01-01', graceDays: 15, lateFee: { type: 'pct', pct: 5 } },
  escrow: { enabled: true, monthly: 40000, startBalance: 80000, taxesAnnual: 360000, insuranceAnnual: 120000 },
  transactions: [],
});
const sched = amortize({ principal: 20000000, ratePct: 6, amortMonths: 360, firstDue: '2026-01-01' });

{
  const L = baseLoan();
  // 6 on-time payments of P&I + escrow
  for (let k = 0; k < 6; k++) L.transactions.push({ id: 'p' + k, type: 'payment', date: addMonths('2026-01-01', k), amount: 119910 + 40000 });
  const st = computeLoan(L, '2026-06-20');
  eq('on-time status', st.status, 'current');
  eq('on-time balance matches schedule', st.principalBalance, sched.rows[5].balance);
  eq('on-time paid count', st.paidCount, 6);
  eq('escrow accumulates', st.escrowBalance, 80000 + 6 * 40000);
  eq('next due', st.nextInstallment.due, '2026-07-01');
  eq('no fees', st.feesOutstanding, 0);
  eq('year interest', st.years['2026'].interest, sched.rows.slice(0, 6).reduce((s, r) => s + r.interest, 0));
  eq('late fee amount', lateFeeFor(L.terms), 5996);
  // Payoff on Jul 15: interest is paid through Jun 1 (the June installment
  // covers May in arrears), so 44 days accrue per diem.
  const q = payoffQuote(L, st, '2026-07-15');
  eq('payoff days', q.days, 44);
  eq('payoff interest', q.interest, Math.round((st.principalBalance * 6 * 44) / 36500));
  const L2 = withTransactions(L, [{ id: 'po', type: 'payment', date: '2026-07-15', amount: q.total, applyTo: 'payoff' }]);
  const st2 = computeLoan(L2, '2026-07-20');
  eq('payoff zeroes principal', st2.principalBalance, 0);
  eq('payoff status', st2.status, 'paid_off');
  eq('payoff credit', st2.credit, 0);
  eq('payoff fees', st2.feesOutstanding, 0);
}
{
  // Late payment: Jan paid on time, Feb paid Feb 20 (grace 15 -> late on Feb 17)
  const L = baseLoan();
  L.transactions.push({ id: 'a', type: 'payment', date: '2026-01-01', amount: 159910 });
  let st = computeLoan(L, '2026-02-16');
  eq('in grace on Feb 16', st.status, 'grace');
  eq('dpd Feb 16', st.dpd, 15);
  st = computeLoan(L, '2026-02-17');
  eq('late on Feb 17', st.status, 'late');
  eq('late fee assessed', st.feesOutstanding, 5996);
  L.transactions.push({ id: 'b', type: 'payment', date: '2026-02-20', amount: 159910 + 5996 });
  st = computeLoan(L, '2026-02-21');
  eq('caught up status', st.status, 'current');
  eq('fee paid', st.feesOutstanding, 0);
  eq('history late mark', st.history.map((h) => h.status), ['ontime', 'late']);
  eq('balance still on schedule', st.principalBalance, sched.rows[1].balance);
  // 35 days late -> d30
  st = computeLoan(L, '2026-04-05');
  eq('d30 status', st.status, 'd30');
  eq('amount due includes fee', st.amountDue, 159910 * 2 + 5996);
}
{
  // Partial payment goes to suspense, then completes
  const L = baseLoan();
  L.transactions.push({ id: 'a', type: 'payment', date: '2025-12-28', amount: 100000 });
  let st = computeLoan(L, '2025-12-30');
  eq('partial -> suspense', st.suspense, 100000);
  eq('partial not applied', st.paidCount, 0);
  L.transactions.push({ id: 'b', type: 'payment', date: '2026-01-02', amount: 59910 });
  st = computeLoan(L, '2026-01-03');
  eq('suspense consumed', st.suspense, 0);
  eq('installment 1 paid', st.paidCount, 1);
}
{
  // Extra principal reduces future interest
  const L = baseLoan();
  L.transactions.push({ id: 'a', type: 'payment', date: '2026-01-01', amount: 159910 });
  L.transactions.push({ id: 'x', type: 'payment', date: '2026-01-10', amount: 200000, applyTo: 'principal' });
  const st = computeLoan(L, '2026-01-11');
  eq('extra principal applied', st.principalBalance, sched.rows[0].balance - 200000);
  eq('next interest lower', st.nextInstallment.interest, roundDiv((sched.rows[0].balance - 200000) * 6000, 1200000));
  eq('payment unchanged', st.nextInstallment.pi, 119910);
}
{
  // Overpayment with regular apply: installment + extra -> extra to principal
  const L = baseLoan();
  L.transactions.push({ id: 'a', type: 'payment', date: '2025-12-29', amount: 159910 + 50000 });
  const st = computeLoan(L, '2025-12-30');
  eq('early payment applies to Jan', st.paidCount, 1);
  eq('extra to principal', st.principalBalance, sched.rows[0].balance - 50000);
}
{
  // Returned payment is ignored and leads to a late charge; NSF fee is added
  const L = baseLoan();
  L.transactions.push({ id: 'a', type: 'payment', date: '2026-01-02', amount: 159910, status: 'returned', returnedDate: '2026-01-08' });
  L.transactions.push({ id: 'f', type: 'fee', date: '2026-01-08', amount: 2500, kind: 'nsf', memo: 'Returned payment fee' });
  let st = computeLoan(L, '2026-01-20');
  eq('returned not applied', st.paidCount, 0);
  eq('late + nsf', st.feesOutstanding, 5996 + 2500);
  L.transactions.push({ id: 'w', type: 'waiver', date: '2026-01-21', amount: 5996, feeId: 'late-1' });
  st = computeLoan(L, '2026-01-22');
  eq('waiver removes late fee', st.feesOutstanding, 2500);
}
{
  // Autopay drafts installments on due dates
  const L = baseLoan();
  L.autopay = { enabled: true, since: '2026-01-01', account: 'Test ••1234' };
  const drafts = pendingAutopay(L, '2026-03-15');
  eq('autopay drafts count', drafts.length, 3);
  eq('autopay dates', drafts.map((d) => d.date), ['2026-01-01', '2026-02-01', '2026-03-01']);
  const st = computeLoan(withTransactions(L, drafts), '2026-03-15');
  eq('autopay keeps current', st.status, 'current');
  eq('autopay balance', st.principalBalance, sched.rows[2].balance);
}
{
  // Balloon maturity
  const L = baseLoan();
  L.terms.balloonMonths = 24;
  L.escrow = { enabled: false };
  const b = amortize({ principal: 20000000, ratePct: 6, amortMonths: 360, balloonMonths: 24, firstDue: '2026-01-01' });
  for (let k = 0; k < 24; k++) L.transactions.push({ id: 'p' + k, type: 'payment', date: addMonths('2026-01-01', k), amount: b.rows[k].payment });
  const st = computeLoan(L, '2028-01-05');
  eq('balloon paid off', st.status, 'paid_off');
  eq('balloon zero', st.principalBalance, 0);
  const L2 = { ...L, transactions: L.transactions.slice(0, 23) };
  const st2 = computeLoan(L2, '2027-11-20');
  ok('balloon due flagged', st2.balloon && st2.balloon.n === 24 && st2.balloon.due === '2027-12-01');
  eq('matured false before due', st2.matured, false);
  const st3 = computeLoan(L2, '2027-12-20');
  eq('matured after due', st3.matured, true);
}
{
  // Boarded loan: 10 prior payments imported
  const L = baseLoan();
  L.terms.boardedPaid = 10;
  L.escrow = { enabled: false };
  const st = computeLoan(L, '2026-10-20');
  eq('boarded balance', st.principalBalance, sched.rows[9].balance);
  eq('boarded next', st.nextInstallment.n, 11);
  eq('boarded status', st.status, 'current');
  eq('boarded next due', st.nextInstallment.due, '2026-11-01');
}
{
  // Preview matches committed result
  const L = baseLoan();
  const tx = { id: 'pv', type: 'payment', date: '2026-01-01', amount: 159910 };
  const { entry } = previewTransaction(L, tx, '2026-01-01');
  eq('preview alloc', [entry.alloc.interest, entry.alloc.principal, entry.alloc.escrow], [100000, 19910, 40000]);
}
{
  const L = baseLoan();
  L.escrow.taxDueMonths = [4, 10];
  L.escrow.insuranceMonth = 6;
  const st = computeLoan(L, '2025-12-15');
  const ea = escrowAnalysis(L, st, '2025-12-15');
  eq('escrow annual', ea.annual, 480000);
  eq('escrow cushion', ea.cushion, 80000);
  ok('escrow months 12', ea.months.length === 12);
}

log(`\n${passed} passed, ${failed} failed`);
if (failed) throw new Error(`${failed} test(s) failed`);
