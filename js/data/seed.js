// Demo workspace, generated relative to "today" so it always looks current.
// Seller: a retired couple who sold their rentals with seller financing.
import { addDays, addMonths, firstOfNextMonth, isoOf, rng, daysBetween } from '../core/util.js';
import { pmt } from '../core/finance.js';
import { computeLoan, payoffQuote, pendingAutopay, installmentCount, dueDateOf } from '../core/servicing.js';
import { simulateScreening } from '../core/qualify.js';
import { MARKET_DEFAULTS, AFR_DEFAULTS } from '../core/rates.js';

const C = (d) => Math.round(d * 100);
export const SCHEMA_VERSION = 4;

function closingMonthsAgo(today, months, day = 15) {
  const d = addMonths(today, -months);
  return isoOf(+d.slice(0, 4), +d.slice(5, 7), day);
}
// First payment one full month after the first of the month following closing.
const firstDueAfter = (closing, day = 1) => {
  const f = addMonths(firstOfNextMonth(closing), 1);
  return isoOf(+f.slice(0, 4), +f.slice(5, 7), day);
};

function makeLoan(o) {
  const principal = o.salePrice - o.downPayment;
  const terms = {
    salePrice: o.salePrice,
    downPayment: o.downPayment,
    principal,
    ratePct: o.ratePct,
    rateType: 'fixed',
    amortMonths: o.amortMonths,
    balloonMonths: o.balloonMonths || null,
    closingDate: o.closingDate,
    firstDue: o.firstDue,
    payment: pmt(principal, o.ratePct, o.amortMonths),
    graceDays: 15,
    lateFee: { type: 'pct', pct: 5 },
    escrow: !!o.escrow,
  };
  return {
    id: o.id,
    number: o.number,
    dealId: o.dealId || null,
    applicationId: o.applicationId || null,
    createdAt: o.closingDate,
    plan: o.escrow ? 'complete' : 'essentials',
    borrower: o.borrower,
    property: o.property,
    terms,
    escrow: o.escrow
      ? { enabled: true, monthly: Math.round((o.escrow.taxes + o.escrow.insurance) / 12), taxesAnnual: o.escrow.taxes, insuranceAnnual: o.escrow.insurance, taxDueMonths: o.escrow.taxMonths, insuranceMonth: o.escrow.insuranceMonth, startBalance: 0, taxPayee: o.escrow.taxPayee, insurancePayee: o.escrow.insurancePayee }
      : { enabled: false },
    autopay: o.autopay || { enabled: false },
    insurance: o.insurance || null,
    tax: o.tax || null,
    transactions: [],
    notes: o.notes || [],
    release: null,
  };
}

// Next occurrence of month/day strictly after `today`.
function nextAnnual(today, month, day) {
  const y = +today.slice(0, 4);
  const d = isoOf(y, month, day);
  return d > today ? d : isoOf(y + 1, month, day);
}

let txn = 0;
const tid = (loan) => `tx_${loan.number}_${++txn}`;

// Pay installment k on `date` (amount = installment + any charges outstanding).
function pay(loan, k, date, method, memo, extra = {}) {
  const st = computeLoan(loan, date);
  const inst = st.unpaid.find((u) => u.n === k);
  if (!inst) return null;
  const tx = { id: tid(loan), type: 'payment', date, amount: inst.total + st.feesOutstanding, method, memo, status: 'cleared', ...extra };
  loan.transactions.push(tx);
  return tx;
}

function addEscrowDisbursements(loan, today) {
  const e = loan.escrow;
  if (!e.enabled) return;
  const start = loan.terms.closingDate;
  const half = Math.round(e.taxesAnnual / e.taxDueMonths.length);
  for (let d = firstOfNextMonth(start); d <= today; d = addMonths(d, 1)) {
    const m = +d.slice(5, 7), y = +d.slice(0, 4);
    if (e.taxDueMonths.includes(m)) {
      const date = isoOf(y, m, 20);
      if (date > start && date <= today) loan.transactions.push({ id: tid(loan), type: 'escrow_disbursement', date, amount: half, category: 'tax', payee: e.taxPayee, memo: `Property tax installment` });
    }
    if (m === e.insuranceMonth && daysBetween(start, d) > 300) {
      const date = isoOf(y, m, 8);
      if (date <= today) loan.transactions.push({ id: tid(loan), type: 'escrow_disbursement', date, amount: e.insuranceAnnual, category: 'insurance', payee: e.insurancePayee, memo: 'Annual homeowners premium' });
    }
  }
}

// Size the initial escrow deposit so the account never dips below a 2-month cushion.
function sizeEscrow(loan, today) {
  if (!loan.escrow.enabled) return;
  loan.escrow.startBalance = 0;
  const st = computeLoan(loan, today);
  let low = 0;
  for (const e of st.ledger) low = Math.min(low, e.escrowBalance);
  const cushion = loan.escrow.monthly * 2;
  loan.escrow.startBalance = Math.ceil((cushion - low) / 10000) * 10000;
}

function runAutopay(loan, today) {
  const drafts = pendingAutopay(loan, today);
  loan.transactions.push(...drafts);
}

export function buildSeed(today) {
  txn = 0;
  const r = rng(`seed:${today.slice(0, 7)}`);
  const jitter = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));

  // ---------------- Loans ----------------
  // A: owner-occupied SFR, escrow, autopay after one late payment early on.
  const aClose = closingMonthsAgo(today, 25);
  const A = makeLoan({
    id: 'ln_reyes', number: 'SN-1001', dealId: null,
    salePrice: C(412000), downPayment: C(41200), ratePct: 7.25, amortMonths: 360, balloonMonths: 84,
    closingDate: aClose, firstDue: firstDueAfter(aClose),
    borrower: { name: 'Marcus & Jolene Reyes', first: 'Marcus', email: 'marcus.reyes@example.com', phone: '(253) 555-0164', tinLast4: '4417', tinOnFile: true, mailing: null },
    property: { address: '1418 N Alder St', city: 'Tacoma', state: 'WA', zip: '98406', type: 'sfr', beds: 3, baths: 2, sqft: 1640, yearBuilt: 1954, occupancy: 'owner', hue: 205 },
    escrow: { taxes: C(4380), insurance: C(1452), taxMonths: [4, 10], insuranceMonth: +aClose.slice(5, 7), taxPayee: 'Pierce County Treasurer', insurancePayee: 'Evergreen Mutual Insurance' },
    insurance: { carrier: 'Evergreen Mutual Insurance', policy: 'HO3-88120457', expires: nextAnnual(today, +aClose.slice(5, 7), 8), mortgageeListed: true, renewalReceived: false },
    tax: { adjustedBasis: C(196000), sellingExpenses: C(6200), depreciationTaken: C(41800) },
    notes: [{ date: addDays(aClose, 300), text: 'Jolene called after the June payment ran late (medical bills). Waived nothing; they enrolled in autopay the same week.' }],
  });
  {
    const N = installmentCount(A.terms);
    const lateK = 9;
    const autopayFrom = 10;
    for (let k = 1; k < autopayFrom && k <= N; k++) {
      const due = dueDateOf(A.terms, k);
      const date = k === lateK ? addDays(due, 18) : addDays(due, jitter(-3, 2));
      if (date > today) break;
      pay(A, k, date, 'ach', k === lateK ? 'Paid after the grace period, with late charge' : '');
    }
    A.autopay = { enabled: true, since: dueDateOf(A.terms, autopayFrom), account: 'Sound checking ••2291' };
    addEscrowDisbursements(A, today);
    runAutopay(A, today);
    sizeEscrow(A, today);
  }

  // B: investor-owned duplex, no escrow, pays by Zelle, currently late.
  // Due day chosen so the open installment is ~24 days past due.
  const bDueDay = Math.min(28, +addDays(today, -24).slice(8, 10));
  const bClose = closingMonthsAgo(today, 14, Math.min(bDueDay, 28));
  const B = makeLoan({
    id: 'ln_whitfield', number: 'SN-1002',
    salePrice: C(540000), downPayment: C(108000), ratePct: 8.0, amortMonths: 300, balloonMonths: 60,
    closingDate: bClose, firstDue: firstDueAfter(bClose, bDueDay),
    borrower: { name: 'Whitfield Rentals LLC', contact: 'Dana Whitfield', first: 'Dana', email: 'dana@whitfieldrentals.example.com', phone: '(541) 555-0139', tinLast4: '8830', tinOnFile: true, entity: true },
    property: { address: '22 Juniper Ct', city: 'Bend', state: 'OR', zip: '97701', type: 'multi', units: 2, beds: 4, baths: 2, sqft: 1920, yearBuilt: 1987, occupancy: 'investment', hue: 32 },
    insurance: { carrier: 'Cascade Landlord Insurance', policy: 'DP3-5510923', expires: addDays(today, 20), mortgageeListed: true, renewalReceived: false },
    tax: { adjustedBasis: C(310000), sellingExpenses: C(12400), depreciationTaken: C(58000) },
    notes: [{ date: addDays(today, -6), text: 'Texted Dana about the late payment. Said a tenant paid late; expects to send it by the end of the month.' }],
  });
  {
    const N = installmentCount(B.terms);
    let lastDue = 0;
    for (let k = 1; k <= N; k++) if (dueDateOf(B.terms, k) <= today) lastDue = k;
    const lateK = Math.max(2, lastDue - 7);
    for (let k = 1; k < lastDue; k++) {
      const due = dueDateOf(B.terms, k);
      const date = k === lateK ? addDays(due, 20) : addDays(due, jitter(2, 9));
      if (date > today) break;
      pay(B, k, date, 'zelle', k === lateK ? 'Paid after the grace period, with late charge' : '');
    }
  }

  // C: newest loan, owner-occupied, escrow + autopay from day one, extra principal.
  const cClose = closingMonthsAgo(today, 5);
  const C_ = makeLoan({
    id: 'ln_natarajan', number: 'SN-1003', dealId: 'deal_cedar', applicationId: 'app_natarajan',
    salePrice: C(329000), downPayment: C(49350), ratePct: 6.875, amortMonths: 360,
    closingDate: cClose, firstDue: firstDueAfter(cClose),
    borrower: { name: 'Priya Natarajan', first: 'Priya', email: 'priya.natarajan@example.com', phone: '(208) 555-0176', tinLast4: '2208', tinOnFile: true },
    property: { address: '905 Cedar Hollow Rd', city: 'Boise', state: 'ID', zip: '83709', type: 'sfr', beds: 3, baths: 2, sqft: 1510, yearBuilt: 2004, occupancy: 'owner', hue: 150 },
    escrow: { taxes: C(2640), insurance: C(1260), taxMonths: [6, 12], insuranceMonth: +cClose.slice(5, 7), taxPayee: 'Ada County Treasurer', insurancePayee: 'Gem State Home Insurance' },
    insurance: { carrier: 'Gem State Home Insurance', policy: 'HO3-40177812', expires: addMonths(cClose, 12), mortgageeListed: true, renewalReceived: false },
    tax: { adjustedBasis: C(142000), sellingExpenses: C(5100), depreciationTaken: C(22400) },
    autopay: { enabled: true, since: firstDueAfter(cClose), account: 'Idaho Central checking ••0934' },
  });
  {
    addEscrowDisbursements(C_, today);
    const extraDate = addDays(dueDateOf(C_.terms, 3), 19);
    if (extraDate <= today) C_.transactions.push({ id: tid(C_), type: 'payment', date: extraDate, amount: C(2000), method: 'ach', applyTo: 'principal', status: 'cleared', memo: 'Extra principal from borrower portal' });
    runAutopay(C_, today);
    sizeEscrow(C_, today);
  }

  // D: land contract, paid by check, one bounced check this spring.
  const dClose = closingMonthsAgo(today, 38);
  const D = makeLoan({
    id: 'ln_brandt', number: 'SN-1004',
    salePrice: C(89000), downPayment: C(17800), ratePct: 9.0, amortMonths: 120,
    closingDate: dClose, firstDue: firstDueAfter(dClose),
    borrower: { name: 'Tom Brandt', first: 'Tom', email: 'tom.brandt@example.com', phone: '(541) 555-0158', tinLast4: '5521', tinOnFile: false },
    property: { address: 'Lot 7, Sagebrush Rd', city: 'Prineville', state: 'OR', zip: '97754', type: 'land', acres: 5.2, occupancy: 'owner', hue: 45 },
    tax: { adjustedBasis: C(38000), sellingExpenses: C(2300), depreciationTaken: 0 },
  });
  {
    const N = installmentCount(D.terms);
    let lastDue = 0;
    for (let k = 1; k <= N; k++) if (dueDateOf(D.terms, k) <= today) lastDue = k;
    const nsfK = Math.max(1, lastDue - 4);
    let check = 1017;
    for (let k = 1; k <= lastDue; k++) {
      const due = dueDateOf(D.terms, k);
      if (k === nsfK) {
        const st = computeLoan(D, addDays(due, 2));
        const inst = st.unpaid.find((u) => u.n === k);
        D.transactions.push({ id: tid(D), type: 'payment', date: addDays(due, 2), amount: inst.total, method: 'check', ref: `#${check++}`, status: 'returned', returnedDate: addDays(due, 11), memo: `Check #${check - 1} returned: insufficient funds` });
        D.transactions.push({ id: tid(D), type: 'fee', date: addDays(due, 11), amount: C(25), kind: 'nsf', memo: 'Returned check fee' });
        pay(D, k, addDays(due, 21), 'money_order', `Cashier’s check replacing returned check #${check - 1}, with charges`);
        continue;
      }
      const date = addDays(due, jitter(-4, 3));
      if (date > today) break;
      pay(D, k, date, 'check', '', { ref: `#${check++}` });
    }
  }

  // E: paid off early through a refinance.
  const eClose = closingMonthsAgo(today, 46);
  const E = makeLoan({
    id: 'ln_osei', number: 'SN-0998',
    salePrice: C(265000), downPayment: C(26500), ratePct: 6.5, amortMonths: 360, balloonMonths: 60,
    closingDate: eClose, firstDue: firstDueAfter(eClose),
    borrower: { name: 'Grace Osei', first: 'Grace', email: 'grace.osei@example.com', phone: '(425) 555-0121', tinLast4: '7003', tinOnFile: true },
    property: { address: '3300 Harbor View Dr #204', city: 'Everett', state: 'WA', zip: '98201', type: 'condo', beds: 2, baths: 2, sqft: 1080, yearBuilt: 2008, occupancy: 'owner', hue: 260 },
    tax: { adjustedBasis: C(168000), sellingExpenses: C(4400), depreciationTaken: C(30500) },
    autopay: null,
  });
  {
    const payoffDate = addDays(today, -58);
    E.autopay = { enabled: true, since: E.terms.firstDue, account: 'Chase checking ••6120' };
    runAutopay(E, addDays(payoffDate, -1));
    E.autopay = { enabled: false, since: E.terms.firstDue, account: 'Chase checking ••6120' };
    const st = computeLoan(E, payoffDate);
    const q = payoffQuote(E, st, payoffDate);
    E.transactions.push({ id: tid(E), type: 'payment', date: payoffDate, amount: q.total, method: 'wire', applyTo: 'payoff', status: 'cleared', memo: 'Payoff wire: buyer refinanced with a conventional lender' });
    E.release = { recordedAt: addDays(payoffDate, 9), document: 'Deed of reconveyance', county: 'Snohomish County' };
  }

  const loans = [A, B, C_, D, E];

  // ---------------- Deals & applications ----------------
  const listed = addDays(today, -12);
  const sunset = {
    id: 'deal_sunset',
    code: 'sunset-ridge-4471',
    status: 'listed',
    createdAt: addDays(today, -16),
    listedAt: listed,
    property: {
      address: '4471 W Sunset Ridge Dr', city: 'Spokane', state: 'WA', zip: '99224', type: 'sfr',
      beds: 4, baths: 2.5, sqft: 2180, yearBuilt: 1998, lot: '0.24 acre', hue: 18,
      description: 'Our longtime rental, renovated in 2023: new roof, LVP floors, quartz kitchen. Fenced yard, 2-car garage, 10 minutes to downtown. Offered with owner financing, so no bank approval is needed.',
    },
    terms: {
      salePrice: C(389000), downPct: 10, ratePct: 7.5, rateType: 'fixed', amortMonths: 360, balloonMonths: null,
      taxesAnnual: C(3890), insuranceAnnual: C(1380), hoaMonthly: 0, escrow: true,
      graceDays: 15, lateFee: { type: 'pct', pct: 5 }, occupancy: 'owner',
      minCredit: 620, minDownPct: 10,
    },
    screeningPaidBy: 'applicant',
  };
  const pine = {
    id: 'deal_pine',
    code: 'pine-hollow-88',
    status: 'draft',
    createdAt: addDays(today, -3),
    property: {
      address: '88 Pine Hollow Ln', city: 'Sandpoint', state: 'ID', zip: '83864', type: 'sfr',
      beds: 2, baths: 1, sqft: 1120, yearBuilt: 1979, lot: '1.1 acres', hue: 120,
      description: 'Lake cabin on a wooded acre. Our last rental. Thinking about owner financing with a 5-year balloon.',
    },
    terms: {
      salePrice: C(275000), downPct: 15, ratePct: 8.25, rateType: 'fixed', amortMonths: 240, balloonMonths: 60,
      taxesAnnual: C(2150), insuranceAnnual: C(1650), hoaMonthly: 0, escrow: true,
      graceDays: 15, lateFee: { type: 'pct', pct: 5 }, occupancy: 'owner',
      minCredit: 640, minDownPct: 15,
    },
    screeningPaidBy: 'applicant',
  };
  const cedar = {
    id: 'deal_cedar',
    code: 'cedar-hollow-905',
    status: 'closed',
    createdAt: addDays(cClose, -48),
    listedAt: addDays(cClose, -45),
    closedAt: cClose,
    loanId: C_.id,
    property: { ...C_.property, description: 'Three-bedroom rental in a quiet cul-de-sac.' },
    terms: {
      salePrice: C_.terms.salePrice, downPct: 15, ratePct: 6.875, rateType: 'fixed', amortMonths: 360, balloonMonths: null,
      taxesAnnual: C(2640), insuranceAnnual: C(1260), hoaMonthly: 0, escrow: true, graceDays: 15, lateFee: { type: 'pct', pct: 5 }, occupancy: 'owner',
    },
    screeningPaidBy: 'applicant',
  };

  const app = (o) => ({
    status: 'review',
    fee: { amount: 4900, paidBy: 'applicant', paidAt: o.submittedAt },
    consent: { creditCheck: true, terms: true, signature: `${o.applicants[0].first} ${o.applicants[0].last}`, at: o.submittedAt },
    decision: null,
    notes: [],
    simultaneousLoan: 0,
    ...o,
  });
  const alvarez = app({
    id: 'app_alvarez', dealId: sunset.id, submittedAt: addDays(today, -9),
    applicants: [
      { first: 'Jordan', last: 'Alvarez', email: 'jordan.alvarez@example.com', phone: '(509) 555-0187', employer: 'Pinecrest Medical Center', jobTitle: 'Respiratory therapist', employmentType: 'w2', years: 6, monthlyIncome: C(6200), otherIncome: 0 },
      { first: 'Kim', last: 'Alvarez', email: 'kim.alvarez@example.com', phone: '(509) 555-0112', employer: 'Riverside School District', jobTitle: 'Teacher', employmentType: 'w2', years: 4, monthlyIncome: C(4350), otherIncome: 0 },
    ],
    household: { size: 4, currentHousing: 'rent', currentPayment: C(1950), yearsAtAddress: 5 },
    debts: { auto: C(420), student: C(180), cards: C(65), personal: 0, support: 0, other: 0 },
    assets: { checking: C(14200), savings: C(71800), investments: C(9000), retirement: C(48000) },
    offer: { price: C(389000), downPayment: C(58350), occupancy: 'owner', moveIn: addDays(today, 45), note: 'We’ve rented in the neighborhood for five years and our kids’ school is five minutes away. We can put 15% down.' },
    credit: { band: '700-759', bankruptcy: 'none', foreclosure: 'none', eviction: 'none' },
    documents: [
      { name: 'Alvarez_paystubs_Aug.pdf', kind: 'Income', size: '412 KB' },
      { name: 'Kim_Alvarez_W2_2025.pdf', kind: 'Income', size: '96 KB' },
      { name: 'Savings_statements_Jul-Aug.pdf', kind: 'Assets', size: '1.2 MB' },
    ],
  });
  alvarez.screening = { ...simulateScreening(alvarez, alvarez.submittedAt), creditScore: 748, incomeVerified: C(10400) };

  const okafor = app({
    id: 'app_okafor', dealId: sunset.id, submittedAt: addDays(today, -6),
    applicants: [
      { first: 'Sam', last: 'Okafor', email: 'sam.okafor@example.com', phone: '(509) 555-0143', employer: 'Okafor Remodeling LLC', jobTitle: 'Owner, general contractor', employmentType: 'self', years: 3.5, monthlyIncome: C(9200), otherIncome: 0 },
    ],
    household: { size: 2, currentHousing: 'rent', currentPayment: C(1700), yearsAtAddress: 3 },
    debts: { auto: C(610), student: 0, cards: C(140), personal: 0, support: 0, other: 0 },
    assets: { checking: C(21500), savings: C(34000), investments: 0, retirement: C(12000) },
    offer: { price: C(389000), downPayment: C(38900), occupancy: 'owner', moveIn: addDays(today, 30), note: 'I’m a self-employed contractor. Banks want two years of tax returns showing more income than I report after write-offs. I can handle repairs myself.' },
    credit: { band: '660-699', bankruptcy: 'none', foreclosure: 'none', eviction: 'none' },
    documents: [
      { name: 'Okafor_2025_Schedule_C.pdf', kind: 'Income', size: '688 KB' },
      { name: 'Business_bank_statements_24mo.pdf', kind: 'Income', size: '3.4 MB' },
    ],
  });
  okafor.screening = { ...simulateScreening(okafor, okafor.submittedAt), creditScore: 684, incomeVerified: C(8300) };

  const cole = app({
    id: 'app_cole', dealId: sunset.id, submittedAt: addDays(today, -2),
    applicants: [
      { first: 'Brittany', last: 'Cole', email: 'brittany.cole@example.com', phone: '(509) 555-0105', employer: 'Northside Logistics', jobTitle: 'Dispatcher', employmentType: 'w2', years: 1.1, monthlyIncome: C(5400), otherIncome: C(800), otherIncomeSource: 'Child support' },
    ],
    household: { size: 3, currentHousing: 'rent', currentPayment: C(1450), yearsAtAddress: 1 },
    debts: { auto: C(385), student: 0, cards: C(210), personal: C(260), support: 0, other: 0 },
    assets: { checking: C(4200), savings: C(21800), investments: 0, retirement: 0 },
    offer: { price: C(389000), downPayment: C(19450), occupancy: 'owner', moveIn: addDays(today, 30), note: 'Could you consider 5% down? I’d like to stop renting.' },
    credit: { band: '580-619', bankruptcy: 'none', foreclosure: 'none', eviction: '<3y' },
    documents: [{ name: 'Cole_paystubs.pdf', kind: 'Income', size: '233 KB' }],
  });
  cole.screening = { ...simulateScreening(cole, cole.submittedAt), creditScore: 611, incomeVerified: C(6150) };

  const natarajan = app({
    id: 'app_natarajan', dealId: cedar.id, submittedAt: addDays(cClose, -38), status: 'closed',
    applicants: [{ first: 'Priya', last: 'Natarajan', email: 'priya.natarajan@example.com', phone: '(208) 555-0176', employer: 'Treasure Valley Software', jobTitle: 'QA engineer', employmentType: 'w2', years: 5, monthlyIncome: C(8900), otherIncome: 0 }],
    household: { size: 1, currentHousing: 'rent', currentPayment: C(1600), yearsAtAddress: 4 },
    debts: { auto: C(310), student: C(240), cards: C(40), personal: 0, support: 0, other: 0 },
    assets: { checking: C(9800), savings: C(61500), investments: C(12000), retirement: C(88000) },
    offer: { price: C(329000), downPayment: C(49350), occupancy: 'owner', note: 'Relocating for work. I’m a recent immigrant with a thin U.S. credit file.' },
    credit: { band: '700-759', bankruptcy: 'none', foreclosure: 'none', eviction: 'none' },
    documents: [{ name: 'Offer_letter.pdf', kind: 'Income', size: '120 KB' }],
    decision: { status: 'approved', at: addDays(cClose, -30), atrAttested: true, notes: 'Strong income; thin credit file offset by 15% down and reserves.' },
  });
  natarajan.screening = { ...simulateScreening(natarajan, natarajan.submittedAt), creditScore: 721, incomeVerified: C(8900) };

  const activity = [
    { date: addDays(today, -2), text: 'New application from Brittany Cole for 4471 W Sunset Ridge Dr', link: '#/app/applicants/app_cole' },
    { date: addDays(today, -3), text: 'Draft created: 88 Pine Hollow Ln', link: '#/app/deals/deal_pine' },
    { date: addDays(today, -6), text: 'New application from Sam Okafor for 4471 W Sunset Ridge Dr', link: '#/app/applicants/app_okafor' },
    { date: addDays(today, -9), text: 'New application from Jordan & Kim Alvarez for 4471 W Sunset Ridge Dr', link: '#/app/applicants/app_alvarez' },
    { date: listed, text: 'Listing published: 4471 W Sunset Ridge Dr', link: '#/app/deals/deal_sunset' },
    { date: addDays(today, -58), text: 'SN-0998 paid off by Grace Osei. Reconveyance recorded 9 days later.', link: '#/app/loans/ln_osei' },
  ];

  return {
    version: SCHEMA_VERSION,
    seededOn: today,
    dirty: false,
    demo: true,
    profile: {
      name: 'Judy & Walt Hendricks',
      first: 'Judy',
      entityName: 'Hendricks Family Trust',
      entityType: 'trust',
      email: 'judy.hendricks@example.com',
      phone: '(253) 555-0142',
      city: 'Gig Harbor',
      state: 'WA',
      otherFinancedLast12: 0,
      builder: false,
      hasMortgage: false,
      payoutAccount: 'Harbor Credit Union checking ••4471',
    },
    settings: {
      clockOffset: 0,
      market: { ...MARKET_DEFAULTS },
      afr: JSON.parse(JSON.stringify(AFR_DEFAULTS)),
      automations: {},
      defaults: { graceDays: 15, lateFeePct: 5, escrow: true },
    },
    deals: [sunset, pine, cedar],
    applications: [alvarez, okafor, cole, natarajan],
    loans,
    activity,
  };
}

export function emptyWorkspace(today) {
  const s = buildSeed(today);
  return {
    ...s,
    demo: false,
    dirty: true,
    profile: { ...s.profile, name: '', first: '', entityName: '', entityType: 'individual', email: '', phone: '', city: '', state: '', payoutAccount: '' },
    deals: [],
    applications: [],
    loans: [],
    activity: [],
  };
}
