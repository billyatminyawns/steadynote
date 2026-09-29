// Tax helpers for the note holder and the buyer. Informational only.
import { computeLoan } from './servicing.js';
import { yearOf } from './util.js';

// Installment-sale view (IRC §453 / Form 6252): gain is recognized as
// principal is received, at the gross profit percentage.
export function installmentSale(loan, st) {
  const t = loan.terms;
  const x = loan.tax || {};
  if (x.adjustedBasis == null) return null;
  const price = t.salePrice;
  const expenses = x.sellingExpenses || 0;
  const grossProfit = price - x.adjustedBasis - expenses;
  const contractPrice = price;
  const gpPct = contractPrice > 0 ? Math.max(0, grossProfit) / contractPrice : 0;
  const saleYear = yearOf(t.closingDate || t.firstDue);
  const byYear = new Map();
  const add = (y, k, v) => {
    const row = byYear.get(y) || { year: y, principal: 0, interest: 0, projected: false };
    row[k] += v;
    byYear.set(y, row);
  };
  add(saleYear, 'principal', t.downPayment || 0);
  for (const [y, v] of Object.entries(st.years)) {
    add(+y, 'principal', v.principal);
    add(+y, 'interest', v.interest);
  }
  const thisYear = yearOf(st.asOf);
  for (const m of st.unpaid) {
    const y = yearOf(m.due);
    add(y, 'principal', m.principal);
    add(y, 'interest', m.interest);
    if (y > thisYear || m.due > st.asOf) byYear.get(y).projected = true;
  }
  const years = [...byYear.values()].sort((a, b) => a.year - b.year).map((r) => ({
    ...r,
    gain: Math.round(r.principal * gpPct),
    status: r.year < thisYear ? 'actual' : r.year === thisYear ? 'ytd' : 'projected',
  }));
  return { price, basis: x.adjustedBasis, expenses, grossProfit, contractPrice, gpPct, saleYear, years, depreciation: x.depreciationTaken || 0 };
}

// Year-end mortgage interest statement for one loan and tax year.
export function interestStatement(loan, year) {
  const end = `${year}-12-31`;
  const st = computeLoan(loan, end);
  const prev = computeLoan(loan, `${year - 1}-12-31`);
  const y = st.years[String(year)] || { interest: 0, principal: 0, taxesPaid: 0, insurancePaid: 0, fees: 0, received: 0, escrowIn: 0, escrowOut: 0 };
  const started = (loan.terms.closingDate || loan.terms.firstDue) <= end;
  return {
    year,
    started,
    interest: y.interest,
    principal: y.principal,
    lateCharges: y.fees,
    taxesPaid: y.taxesPaid,
    insurancePaid: y.insurancePaid,
    received: y.received,
    balanceStart: (loan.terms.closingDate || '') > `${year - 1}-12-31` ? loan.terms.principal : prev.principalBalance,
    balanceEnd: st.principalBalance,
    escrowEnd: st.escrowBalance,
  };
}
