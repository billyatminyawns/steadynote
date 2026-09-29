// Loan servicing engine.
//
// computeLoan() replays a loan's transactions against its contractual schedule
// and derives everything a servicer needs as of a given date: balances,
// satisfied / unpaid installments, late charges, escrow, suspense (partial
// payments), delinquency status and per-year totals for tax reporting.
//
// Payment application follows the Fannie Mae/Freddie Mac uniform instrument
// order: each periodic payment goes to interest, then principal, then escrow;
// installments are satisfied oldest-first; only amounts left over go to late
// charges and then to principal. Partial payments are held in suspense until a
// full installment accumulates. Interest is monthly (30/360) in arrears; payoff
// interest accrues per diem (actual/365) from the paid-through date.
import { roundDiv, addMonths, addDays, daysBetween, sum } from './util.js';
import { pmt, monthlyInterest } from './finance.js';

export const scheduledPayment = (t) => t.payment ?? pmt(t.principal, t.ratePct, t.amortMonths);
export const installmentCount = (t) => (t.balloonMonths && t.balloonMonths < t.amortMonths ? t.balloonMonths : t.amortMonths);
export const hasBalloon = (t) => !!(t.balloonMonths && t.balloonMonths < t.amortMonths);
export const dueDateOf = (t, k) => addMonths(t.firstDue, k - 1, Number(t.firstDue.slice(8, 10)));

export function lateFeeFor(t) {
  const lf = t.lateFee || { type: 'pct', pct: 5 };
  if (lf.type === 'none') return 0;
  let fee = lf.type === 'flat' ? lf.flat || 0 : roundDiv(scheduledPayment(t) * Math.round((lf.pct || 0) * 100), 10000);
  if (lf.max) fee = Math.min(fee, lf.max);
  return fee;
}

export function escrowMonthlyAt(loan, date) {
  const e = loan.escrow;
  if (!e || !e.enabled) return 0;
  let m = e.monthly || 0;
  for (const ch of e.changes || []) if (ch.effective <= date) m = ch.monthly;
  return m;
}

// Installment k given the principal balance outstanding before it.
export function makeInstallment(loan, k, balance) {
  const t = loan.terms;
  const P = scheduledPayment(t);
  const N = installmentCount(t);
  const interest = monthlyInterest(balance, t.ratePct);
  let principal;
  let balloon = false;
  if (k >= t.amortMonths || P - interest >= balance) principal = balance;
  else if (k === N && N < t.amortMonths) { principal = balance; balloon = true; }
  else principal = Math.max(0, P - interest);
  const due = dueDateOf(t, k);
  const escrow = escrowMonthlyAt(loan, due);
  return { n: k, due, interest, principal, pi: interest + principal, escrow, total: interest + principal + escrow, balloon };
}

export const accruedInterest = (balance, ratePct, from, to) =>
  Math.round((balance * ratePct * daysBetween(from, to)) / 36500);

const PRIORITY = { late: 0, fee: 1, waiver: 2, payment: 3, escrow_disbursement: 4, escrow_refund: 5 };

export const STATUS = {
  current: { label: 'Current', tone: 'good', icon: 'check' },
  grace: { label: 'In grace period', tone: 'warning', icon: 'clock' },
  late: { label: 'Late', tone: 'serious', icon: 'alert' },
  d30: { label: '30+ days delinquent', tone: 'critical', icon: 'alert' },
  d60: { label: '60+ days delinquent', tone: 'critical', icon: 'alert' },
  d90: { label: '90+ days delinquent', tone: 'critical', icon: 'alert' },
  default: { label: 'Default (120+ days)', tone: 'critical', icon: 'x' },
  paid_off: { label: 'Paid off', tone: 'neutral', icon: 'star' },
};

export function computeLoan(loan, asOf) {
  const t = loan.terms;
  const N = installmentCount(t);
  const grace = t.graceDays ?? 15;
  const feeAmt = lateFeeFor(t);
  const anchor = Number(t.firstDue.slice(8, 10));
  const due = (k) => addMonths(t.firstDue, k - 1, anchor);
  const interestStart = addMonths(t.firstDue, -1, anchor);
  const escrowOn = !!(loan.escrow && loan.escrow.enabled);

  const S = { bal: t.principal, escrow: escrowOn ? loan.escrow.startBalance || 0 : 0, suspense: 0, credit: 0, next: 1, paidOffDate: null };
  const paid = [];
  const lateMarks = {}; // installment -> date it went late (grace expired unpaid)
  const fees = [];
  const ledger = [];
  const years = {};
  const Y = (d) =>
    (years[d.slice(0, 4)] ||= { interest: 0, principal: 0, escrowIn: 0, escrowOut: 0, taxesPaid: 0, insurancePaid: 0, fees: 0, received: 0, lateFeesAssessed: 0 });
  const snap = () => ({ principalBalance: S.bal, escrowBalance: S.escrow, suspense: S.suspense });
  const newAlloc = () => ({ interest: 0, principal: 0, escrow: 0, fees: 0, extra: 0, suspense: 0, credit: 0, fromSuspense: 0, installments: [] });

  function satisfy(m, date, alloc) {
    S.bal -= m.principal;
    S.escrow += m.escrow;
    alloc.interest += m.interest;
    alloc.principal += m.principal;
    alloc.escrow += m.escrow;
    alloc.installments.push(m.n);
    const y = Y(date);
    y.interest += m.interest;
    y.principal += m.principal;
    y.escrowIn += m.escrow;
    paid.push({ ...m, paidDate: date, daysLate: daysBetween(m.due, date), late: !!lateMarks[m.n], balanceAfter: S.bal });
    S.next++;
    if (S.bal <= 0) { S.bal = 0; S.paidOffDate ||= date; }
  }
  function payFees(date, avail, alloc) {
    for (const f of fees) {
      if (avail <= 0) break;
      if (f.remaining <= 0) continue;
      const x = Math.min(avail, f.remaining);
      f.remaining -= x;
      avail -= x;
      alloc.fees += x;
      Y(date).fees += x;
    }
    return avail;
  }
  function toPrincipal(date, avail, alloc) {
    if (avail > 0 && S.bal > 0) {
      const x = Math.min(avail, S.bal);
      S.bal -= x;
      avail -= x;
      alloc.extra += x;
      Y(date).principal += x;
      if (S.bal === 0) S.paidOffDate ||= date;
    }
    if (avail > 0) { S.credit += avail; alloc.credit += avail; }
  }
  const hasDue = (date) => S.next <= N && due(S.next) <= date;

  // Installments paid before the loan was boarded onto the platform.
  const boarded = Math.min(t.boardedPaid || 0, N);
  for (let k = 1; k <= boarded; k++) {
    const m = makeInstallment(loan, k, S.bal);
    m.escrow = 0;
    m.total = m.pi;
    satisfy(m, m.due, newAlloc());
    paid[paid.length - 1].boarded = true;
  }
  if (boarded) ledger.push({ date: due(boarded), kind: 'boarded', amount: 0, count: boarded, ...snap() });

  const events = [];
  (loan.transactions || []).forEach((tx, i) => events.push({ date: tx.date, pri: PRIORITY[tx.type] ?? 8, i, tx }));
  for (let k = boarded + 1; k <= N; k++) {
    const d = addDays(due(k), grace + 1);
    if (d > asOf) break;
    events.push({ date: d, pri: PRIORITY.late, i: -1, late: k });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.pri - b.pri || a.i - b.i));

  for (const ev of events) {
    if (ev.date > asOf) break;
    if (ev.late) {
      const k = ev.late;
      if (S.paidOffDate || S.next > k) continue;
      lateMarks[k] = ev.date;
      if (feeAmt > 0) {
        const f = { id: `late-${k}`, date: ev.date, amount: feeAmt, remaining: feeAmt, waived: 0, kind: 'late', installment: k, installmentDue: due(k) };
        fees.push(f);
        Y(ev.date).lateFeesAssessed += feeAmt;
        ledger.push({ date: ev.date, kind: 'late_fee', amount: feeAmt, installment: k, installmentDue: due(k), feeId: f.id, ...snap() });
      }
      continue;
    }
    const tx = ev.tx;
    if (tx.type === 'payment') {
      if (tx.status === 'returned') {
        ledger.push({ date: tx.date, kind: 'payment_returned', amount: tx.amount, tx, ...snap() });
        continue;
      }
      Y(tx.date).received += tx.amount;
      const alloc = newAlloc();
      alloc.fromSuspense = S.suspense;
      let avail = S.suspense + tx.amount;
      S.suspense = 0;
      if (S.paidOffDate) {
        S.credit += avail;
        alloc.credit = avail;
      } else if (tx.applyTo === 'payoff') {
        const through = S.next > 1 ? due(S.next - 1) : interestStart;
        const accrued = accruedInterest(S.bal, t.ratePct, through, tx.date);
        alloc.payoff = { through, days: daysBetween(through, tx.date), accrued };
        if (accrued >= 0) {
          const x = Math.min(avail, accrued);
          avail -= x;
          alloc.interest += x;
          Y(tx.date).interest += x;
        } else {
          avail += -accrued;
          alloc.interestCredit = -accrued;
          Y(tx.date).interest += accrued;
        }
        const x = Math.min(avail, S.bal);
        S.bal -= x;
        avail -= x;
        alloc.principal += x;
        Y(tx.date).principal += x;
        avail = payFees(tx.date, avail, alloc);
        if (S.escrow < 0 && avail > 0) {
          const y = Math.min(avail, -S.escrow);
          S.escrow += y;
          avail -= y;
          alloc.escrow += y;
        }
        if (S.bal === 0) S.paidOffDate ||= tx.date;
        if (avail > 0) { S.credit += avail; alloc.credit += avail; }
      } else if (tx.applyTo === 'principal' && !hasDue(tx.date)) {
        toPrincipal(tx.date, avail, alloc);
      } else {
        // Regular payment: satisfy installments that are due (or come due
        // within the next month) oldest-first.
        const horizon = addMonths(tx.date, 1);
        const force = tx.applyTo === 'installment';
        let blockedOn = null;
        let applied = 0;
        while (S.next <= N && S.bal > 0) {
          const k = S.next;
          if (due(k) > horizon && !(force && applied === 0)) break;
          const m = makeInstallment(loan, k, S.bal);
          if (avail < m.total) { blockedOn = m; break; }
          satisfy(m, tx.date, alloc);
          avail -= m.total;
          applied++;
        }
        if (blockedOn) {
          // Short of a full installment. If that installment is not yet due,
          // settle outstanding charges first; the rest waits in suspense.
          if (blockedOn.due > tx.date) avail = payFees(tx.date, avail, alloc);
          S.suspense += avail;
          alloc.suspense = avail;
        } else {
          avail = payFees(tx.date, avail, alloc);
          toPrincipal(tx.date, avail, alloc);
        }
      }
      ledger.push({ date: tx.date, kind: 'payment', amount: tx.amount, tx, alloc, ...snap() });
    } else if (tx.type === 'fee') {
      fees.push({ id: tx.id, date: tx.date, amount: tx.amount, remaining: tx.amount, waived: 0, kind: tx.kind || 'other', memo: tx.memo });
      ledger.push({ date: tx.date, kind: 'fee', amount: tx.amount, tx, ...snap() });
    } else if (tx.type === 'waiver') {
      let amt = tx.amount;
      for (const f of fees) {
        if (amt <= 0) break;
        if (tx.feeId && f.id !== tx.feeId) continue;
        const x = Math.min(amt, f.remaining);
        f.remaining -= x;
        f.waived += x;
        amt -= x;
      }
      ledger.push({ date: tx.date, kind: 'waiver', amount: tx.amount - amt, tx, ...snap() });
    } else if (tx.type === 'escrow_disbursement') {
      S.escrow -= tx.amount;
      const y = Y(tx.date);
      y.escrowOut += tx.amount;
      if (tx.category === 'tax') y.taxesPaid += tx.amount;
      if (tx.category === 'insurance') y.insurancePaid += tx.amount;
      ledger.push({ date: tx.date, kind: 'escrow_disbursement', amount: tx.amount, tx, ...snap() });
    } else if (tx.type === 'escrow_refund') {
      S.escrow -= tx.amount;
      ledger.push({ date: tx.date, kind: 'escrow_refund', amount: tx.amount, tx, ...snap() });
    }
  }

  // Remaining installments, projected from today's balance assuming on-time payment.
  const unpaid = [];
  if (!S.paidOffDate) {
    let b = S.bal;
    for (let k = S.next; k <= N && b > 0; k++) {
      const m = makeInstallment(loan, k, b);
      m.lateMarked = lateMarks[k] || null;
      unpaid.push(m);
      b -= m.principal;
    }
  }

  const feesOutstanding = sum(fees, (f) => f.remaining);
  const nextInstallment = unpaid[0] || null;
  const pastDue = unpaid.filter((m) => m.due < asOf);
  const dueNow = unpaid.filter((m) => m.due <= asOf);
  const dpd = nextInstallment && nextInstallment.due < asOf ? daysBetween(nextInstallment.due, asOf) : 0;
  let status;
  if (S.paidOffDate) status = 'paid_off';
  else if (dpd === 0) status = 'current';
  else if (dpd <= grace) status = 'grace';
  else if (dpd < 30) status = 'late';
  else if (dpd < 60) status = 'd30';
  else if (dpd < 90) status = 'd60';
  else if (dpd < 120) status = 'd90';
  else status = 'default';

  const amountDue = Math.max(0, sum(dueNow, (m) => m.total) + feesOutstanding - S.suspense);
  const paidThrough = S.next > 1 ? due(S.next - 1) : null;
  const maturityDate = due(N);
  const balloonInst = hasBalloon(t) ? unpaid.find((m) => m.balloon) || null : null;

  // Installment-level payment history (credit-report style), oldest first.
  const history = [];
  for (const p of paid) {
    if (p.boarded) continue;
    let s = 'ontime';
    if (p.daysLate >= 30) s = 'late30';
    else if (p.late) s = 'late';
    else if (p.daysLate > 0) s = 'grace';
    history.push({ n: p.n, due: p.due, paidDate: p.paidDate, daysLate: p.daysLate, status: s });
  }
  for (const m of unpaid) {
    if (m.due > asOf) break;
    const d = daysBetween(m.due, asOf);
    history.push({ n: m.n, due: m.due, paidDate: null, daysLate: d, status: d >= 30 ? 'open30' : m.lateMarked ? 'openlate' : 'open' });
  }
  const recent = history.filter((h) => h.status !== 'open').slice(-12);
  const onTime = recent.filter((h) => h.status === 'ontime' || h.status === 'grace').length;

  return {
    asOf,
    payment: scheduledPayment(t),
    installments: N,
    grace,
    lateFee: feeAmt,
    interestStart,
    maturityDate,
    principalBalance: S.bal,
    escrowBalance: S.escrow,
    suspense: S.suspense,
    credit: S.credit,
    paidOffDate: S.paidOffDate,
    status,
    dpd,
    matured: !S.paidOffDate && maturityDate < asOf,
    paidCount: S.next - 1,
    paidThrough,
    paid,
    unpaid,
    nextInstallment,
    pastDue,
    amountDue,
    fees,
    feesOutstanding,
    ledger,
    years,
    history,
    onTimeRate: recent.length ? onTime / recent.length : 1,
    balloon: balloonInst,
  };
}

// Payoff good through `date`, from a computed state.
export function payoffQuote(loan, st, date) {
  const t = loan.terms;
  const through = st.paidThrough || st.interestStart;
  const days = daysBetween(through, date);
  const interest = accruedInterest(st.principalBalance, t.ratePct, through, date);
  const escrowShortage = Math.max(0, -st.escrowBalance);
  const total = st.principalBalance + interest + st.feesOutstanding + escrowShortage - st.suspense;
  return {
    date,
    through,
    days,
    perDiem: (st.principalBalance * t.ratePct) / 36500,
    principal: st.principalBalance,
    interest,
    fees: st.feesOutstanding,
    escrowShortage,
    suspense: st.suspense,
    escrowRefund: Math.max(0, st.escrowBalance),
    total: Math.max(0, total),
  };
}

export const withTransactions = (loan, txs) => ({ ...loan, transactions: [...(loan.transactions || []), ...txs] });

// How a prospective transaction would be applied, without saving it.
export function previewTransaction(loan, tx, asOf) {
  const at = tx.date > asOf ? tx.date : asOf;
  const after = computeLoan(withTransactions(loan, [tx]), at);
  const entry = [...after.ledger].reverse().find((e) => e.tx === tx);
  return { after, entry };
}

// Autopay drafts that should exist by `asOf` but haven't been created yet.
// Drafts pull the scheduled installment on its due date once enrolled.
export function pendingAutopay(loan, asOf) {
  const ap = loan.autopay;
  if (!ap || !ap.enabled) return [];
  const out = [];
  let L = loan;
  for (let guard = 0; guard < 600; guard++) {
    const st = computeLoan(L, asOf);
    const m = st.nextInstallment;
    if (!m || st.paidOffDate) break;
    if (m.due > asOf || m.due < ap.since) break;
    if ((L.transactions || []).some((tx) => tx.autopayFor === m.n)) break;
    const stBefore = computeLoan(L, addDays(m.due, -1));
    const inst = stBefore.unpaid.find((u) => u.n === m.n) || m;
    const tx = {
      id: `ap-${loan.id}-${m.n}`,
      type: 'payment',
      date: m.due,
      amount: inst.total,
      method: 'autopay',
      autopayFor: m.n,
      status: 'cleared',
      memo: `Autopay ACH draft · ${ap.account || 'bank account on file'}`,
    };
    out.push(tx);
    L = withTransactions(L, [tx]);
  }
  return out;
}

// Upcoming scheduled cash flow for the note holder (P&I only, escrow excluded).
export function projectedCashflows(loan, st, fromDate, months) {
  const end = addMonths(fromDate, months);
  return st.unpaid
    .filter((m) => m.due >= fromDate && m.due < end)
    .map((m) => ({ due: m.due, interest: m.interest, principal: m.principal, balloon: m.balloon }));
}

// Escrow analysis for the next 12 months (RESPA-style, 2-month cushion).
export function escrowAnalysis(loan, st, asOf) {
  const e = loan.escrow;
  if (!e || !e.enabled) return null;
  const items = [];
  const taxes = e.taxesAnnual || 0, ins = e.insuranceAnnual || 0;
  const taxMonths = e.taxDueMonths && e.taxDueMonths.length ? e.taxDueMonths : [4, 10];
  const insMonth = e.insuranceMonth || 1;
  const start = st.nextInstallment ? st.nextInstallment.due : asOf;
  let bal = st.escrowBalance;
  let low = bal, lowMonth = start;
  const annual = taxes + ins;
  const deposit = escrowMonthlyAt(loan, start);
  const months = [];
  for (let i = 0; i < 12; i++) {
    const d = addMonths(start, i);
    const m = +d.slice(5, 7);
    let out = 0;
    if (taxMonths.includes(m)) out += Math.round(taxes / taxMonths.length);
    if (m === insMonth) out += ins;
    bal += deposit - out;
    months.push({ date: d, deposit, out, balance: bal });
    if (bal < low) { low = bal; lowMonth = d; }
  }
  const cushion = Math.round(annual / 6);
  const shortage = Math.max(0, cushion - low);
  const surplus = Math.max(0, low - cushion);
  const baseMonthly = Math.round(annual / 12);
  const recommended = baseMonthly + Math.round(shortage / 12);
  items.push({ label: 'Property taxes', annual: taxes }, { label: 'Hazard insurance', annual: ins });
  return { items, annual, cushion, lowPoint: low, lowMonth, shortage, surplus, currentMonthly: deposit, recommended, months };
}
