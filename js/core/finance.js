// Loan math: payments, amortization, APR, present value, affordability.
import { roundDiv, addMonths } from './util.js';

// Rate as an exact integer in thousandths of a percent (7.25% -> 7250).
export const rateMilli = (ratePct) => Math.round(ratePct * 1000);

// One month of interest on a balance (30/360 convention), rounded to the cent.
export function monthlyInterest(balanceCents, ratePct) {
  return roundDiv(balanceCents * rateMilli(ratePct), 1200 * 1000);
}

// Level monthly principal-and-interest payment that fully amortizes `principal`
// over `n` months. Rounded to the cent; the final installment absorbs rounding.
export function pmt(principalCents, ratePct, n) {
  if (!n || n <= 0 || principalCents <= 0) return 0;
  const r = ratePct / 1200;
  if (r === 0) return Math.ceil(principalCents / n);
  return Math.round((principalCents * r) / (1 - Math.pow(1 + r, -n)));
}

// Largest principal a level payment can amortize over n months.
export function principalForPayment(paymentCents, ratePct, n) {
  if (paymentCents <= 0 || n <= 0) return 0;
  const r = ratePct / 1200;
  if (r === 0) return paymentCents * n;
  return Math.floor((paymentCents * (1 - Math.pow(1 + r, -n))) / r);
}

// Contractual schedule. Balloon (if any) is due with installment `balloonMonths`.
export function amortize({ principal, ratePct, amortMonths, balloonMonths, firstDue, payment }) {
  const P = payment ?? pmt(principal, ratePct, amortMonths);
  const N = balloonMonths && balloonMonths < amortMonths ? balloonMonths : amortMonths;
  const anchor = firstDue ? Number(firstDue.slice(8, 10)) : 1;
  let bal = principal;
  let totalInterest = 0;
  const rows = [];
  for (let k = 1; k <= N && bal > 0; k++) {
    const interest = monthlyInterest(bal, ratePct);
    let prin;
    let balloon = false;
    if (k >= amortMonths || P - interest >= bal) prin = bal;
    else if (k === N && N < amortMonths) { prin = bal; balloon = true; }
    else prin = Math.max(0, P - interest);
    bal -= prin;
    totalInterest += interest;
    rows.push({
      n: k,
      due: firstDue ? addMonths(firstDue, k - 1, anchor) : null,
      payment: interest + prin,
      interest,
      principal: prin,
      balance: bal,
      balloon,
    });
  }
  const last = rows[rows.length - 1];
  return {
    payment: P,
    rows,
    installments: rows.length,
    totalInterest,
    totalPaid: principal + totalInterest,
    balloonAmount: last && last.balloon ? last.payment : 0,
    balloonBalance: last && last.balloon ? last.principal : 0,
    maturity: last ? last.due : null,
  };
}

// Actuarial APR (Reg Z Appendix J, monthly unit period) given the amount
// financed and the stream of scheduled payments starting one period out.
export function aprPct(amountFinanced, payments) {
  if (!payments.length || amountFinanced <= 0) return 0;
  const pv = (i) => payments.reduce((s, p, idx) => s + p / Math.pow(1 + i, idx + 1), 0);
  let lo = 0, hi = 0.1;
  if (pv(lo) <= amountFinanced) return 0;
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2;
    if (pv(mid) > amountFinanced) lo = mid; else hi = mid;
  }
  return ((lo + hi) / 2) * 1200;
}

// Present value of monthly cash flows [{t: months from now (>=1), amount}].
export function presentValue(flows, annualYieldPct) {
  const i = annualYieldPct / 1200;
  return flows.reduce((s, f) => s + f.amount / Math.pow(1 + i, f.t), 0);
}

// Annual yield (monthly compounding, nominal) that prices `flows` at `price`.
export function yieldForPrice(flows, price) {
  if (price <= 0 || !flows.length) return 0;
  let lo = -0.05, hi = 0.2;
  for (let it = 0; it < 200; it++) {
    const mid = (lo + hi) / 2;
    const pv = flows.reduce((s, f) => s + f.amount / Math.pow(1 + mid, f.t), 0);
    if (pv > price) lo = mid; else hi = mid;
  }
  return ((lo + hi) / 2) * 1200;
}

// Future value of a lump sum compounding monthly.
export const futureValue = (c, annualPct, months) => c * Math.pow(1 + annualPct / 1200, months);
