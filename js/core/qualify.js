// Buyer qualification: housing ratios, reserves, credit, stability, a
// 100-point score and an Ability-to-Repay (ATR) worksheet covering the eight
// factors in 12 CFR 1026.43(c)(2).
import { pmt, principalForPayment } from './finance.js';
import { sum, clamp, rng } from './util.js';

export const CREDIT_BANDS = [
  { id: '760+', label: '760 or higher', mid: 775, lo: 760, hi: 850 },
  { id: '700-759', label: '700 – 759', mid: 730, lo: 700, hi: 759 },
  { id: '660-699', label: '660 – 699', mid: 680, lo: 660, hi: 699 },
  { id: '620-659', label: '620 – 659', mid: 640, lo: 620, hi: 659 },
  { id: '580-619', label: '580 – 619', mid: 600, lo: 580, hi: 619 },
  { id: '<580', label: 'Below 580', mid: 560, lo: 500, hi: 579 },
  { id: 'unknown', label: "I'm not sure", mid: 640, lo: 560, hi: 720 },
];
export const bandOf = (id) => CREDIT_BANDS.find((b) => b.id === id) || CREDIT_BANDS[CREDIT_BANDS.length - 1];

export const EMPLOYMENT_TYPES = {
  w2: 'Employee (W-2)',
  self: 'Self-employed / 1099',
  retired: 'Retired (pension / Social Security)',
  other: 'Other income',
};

export const DEBT_FIELDS = [
  ['auto', 'Auto loans / leases'],
  ['student', 'Student loans'],
  ['cards', 'Credit card minimums'],
  ['personal', 'Personal loans'],
  ['support', 'Child support / alimony'],
  ['other', 'Other monthly debts'],
];
export const ASSET_FIELDS = [
  ['checking', 'Checking'],
  ['savings', 'Savings'],
  ['investments', 'Brokerage / investments'],
  ['retirement', 'Retirement (401k, IRA)'],
];

export const HISTORY_OPTIONS = {
  bankruptcy: { none: 'None', '<2y': 'Within 2 years', '2-4y': '2 – 4 years ago', '>4y': 'Over 4 years ago' },
  foreclosure: { none: 'None', '<3y': 'Within 3 years', '3-7y': '3 – 7 years ago', '>7y': 'Over 7 years ago' },
  eviction: { none: 'None', '<3y': 'Within 3 years', '>3y': 'Over 3 years ago' },
};

export const GRADES = [
  { min: 85, grade: 'A', label: 'Strong', tone: 'good', rec: 'Strong candidate. Approve at the listed terms.' },
  { min: 70, grade: 'B', label: 'Good', tone: 'good', rec: 'Solid candidate. Approve; confirm documents before closing.' },
  { min: 55, grade: 'C', label: 'Acceptable with conditions', tone: 'warning', rec: 'Workable with conditions, such as a larger down payment, a co-borrower, or escrow for taxes and insurance.' },
  { min: 40, grade: 'D', label: 'High risk', tone: 'serious', rec: 'High risk at these terms. Restructure (more down, lower price) or decline.' },
  { min: 0, grade: 'E', label: 'Does not qualify', tone: 'critical', rec: 'Does not show ability to repay at these terms. Decline and send an adverse action notice.' },
];

export function housingFor(terms, price, down) {
  const loan = Math.max(0, price - down);
  const pi = pmt(loan, terms.ratePct, terms.amortMonths);
  const taxes = Math.round((terms.taxesAnnual || 0) / 12);
  const insurance = Math.round((terms.insuranceAnnual || 0) / 12);
  const hoa = terms.hoaMonthly || 0;
  return { loan, pi, taxes, insurance, hoa, total: pi + taxes + insurance + hoa };
}

export function offerOf(app, deal) {
  const t = deal.terms;
  const price = app.offer?.price || t.salePrice;
  const down = app.offer?.downPayment ?? Math.round((price * (t.downPct || 10)) / 100);
  return { price, down, downPct: price ? (down / price) * 100 : 0 };
}

export const statedIncome = (app) => sum(app.applicants || [], (a) => (a.monthlyIncome || 0) + (a.otherIncome || 0));
export const monthlyDebts = (app) => sum(DEBT_FIELDS, ([k]) => app.debts?.[k] || 0);
export const liquidAssets = (app) => (app.assets?.checking || 0) + (app.assets?.savings || 0) + (app.assets?.investments || 0);

function pointsFor(value, table) {
  for (const [limit, pts] of table) if (value <= limit) return pts;
  return table[table.length - 1][1];
}

export function analyzeApplication(app, deal) {
  const t = deal.terms;
  const { price, down, downPct } = offerOf(app, deal);
  const housing = housingFor(t, price, down);
  const stated = statedIncome(app);
  const verified = app.screening?.incomeVerified ?? null;
  const income = verified != null ? Math.min(stated, verified) : stated;
  const debts = monthlyDebts(app);
  const front = income > 0 ? (housing.total / income) * 100 : 999;
  const back = income > 0 ? ((housing.total + debts) / income) * 100 : 999;
  const closingCosts = Math.round(price * 0.02);
  const liquid = app.screening?.assetsVerified ?? liquidAssets(app);
  const retirement = app.assets?.retirement || 0;
  const afterClose = liquid - down - closingCosts;
  const reserveMonths = housing.total > 0 ? afterClose / housing.total : 0;
  const scoreVerified = app.screening?.creditScore ?? null;
  const band = bandOf(app.credit?.band);
  const credit = scoreVerified ?? band.mid;
  const primary = (app.applicants || [])[0] || {};
  const years = Math.max(...(app.applicants || [{ years: 0 }]).map((a) => a.years || 0));
  const empType = primary.employmentType || 'w2';
  const residual = Math.round(income * 0.78) - housing.total - debts; // rough after-tax estimate
  const hist = app.credit || {};

  // ---- score (100 points) ----
  const comps = [];
  const dtiPts = pointsFor(back, [[36, 30], [43, 23], [50, 12], [55, 5], [Infinity, 0]]);
  comps.push({ key: 'dti', label: 'Debt-to-income', points: dtiPts, max: 30, value: `${back.toFixed(1)}%`, detail: 'Housing plus all monthly debts ÷ gross monthly income. Under 43% is the traditional qualified-mortgage line.' });
  const crPts = credit >= 740 ? 25 : credit >= 700 ? 21 : credit >= 660 ? 16 : credit >= 620 ? 10 : credit >= 580 ? 5 : 0;
  comps.push({ key: 'credit', label: 'Credit', points: crPts, max: 25, value: scoreVerified ? `${scoreVerified}` : `~${band.mid} (self-reported)`, detail: 'Score from the soft-pull credit report, or the applicant’s self-reported range until screening completes.' });
  const dpPts = downPct >= 20 ? 20 : downPct >= 15 ? 16 : downPct >= 10 ? 12 : downPct >= 5 ? 6 : 0;
  comps.push({ key: 'down', label: 'Down payment', points: dpPts, max: 20, value: `${downPct.toFixed(1)}%`, detail: 'Skin in the game. Sellers typically ask for 10–20% down.' });
  const rsPts = reserveMonths >= 6 ? 10 : reserveMonths >= 3 ? 7 : reserveMonths >= 1 ? 4 : 0;
  comps.push({ key: 'reserves', label: 'Cash reserves', points: rsPts, max: 10, value: `${Math.max(0, reserveMonths).toFixed(1)} mo`, detail: 'Liquid funds left after the down payment and ~2% closing costs, in months of housing payment.' });
  let stPts;
  if (empType === 'retired') stPts = 8;
  else if (empType === 'self') stPts = years >= 2 ? 8 : years >= 1 ? 4 : 2;
  else stPts = years >= 2 ? 10 : years >= 1 ? 6 : 3;
  comps.push({ key: 'stability', label: 'Income stability', points: stPts, max: 10, value: empType === 'retired' ? 'Retired' : `${years} yr${years === 1 ? '' : 's'}`, detail: 'Time in current job or line of work. Two years is the usual benchmark; self-employed income is weighted more cautiously.' });
  const derogs = [];
  if (hist.bankruptcy && hist.bankruptcy !== 'none') derogs.push(`Bankruptcy ${HISTORY_OPTIONS.bankruptcy[hist.bankruptcy].toLowerCase()}`);
  if (hist.foreclosure && hist.foreclosure !== 'none') derogs.push(`Foreclosure ${HISTORY_OPTIONS.foreclosure[hist.foreclosure].toLowerCase()}`);
  if (hist.eviction && hist.eviction !== 'none') derogs.push(`Eviction ${HISTORY_OPTIONS.eviction[hist.eviction].toLowerCase()}`);
  const recentDerog = ['<2y'].includes(hist.bankruptcy) || ['<3y'].includes(hist.foreclosure) || ['<3y'].includes(hist.eviction);
  const hsPts = derogs.length === 0 ? 5 : recentDerog ? 0 : 2;
  comps.push({ key: 'history', label: 'Housing & credit history', points: hsPts, max: 5, value: derogs.length ? `${derogs.length} event${derogs.length > 1 ? 's' : ''}` : 'Clean', detail: 'Bankruptcies, foreclosures and evictions the applicant disclosed or the report shows.' });

  let score = sum(comps, (c) => c.points);
  const flags = [];
  if (back > 55) flags.push({ tone: 'critical', text: `Debt-to-income of ${back.toFixed(0)}% leaves little room for the payment.` });
  if (downPct < 5) flags.push({ tone: 'critical', text: 'Down payment under 5%. Very little equity protects you if you have to foreclose.' });
  if (afterClose < 0) flags.push({ tone: 'serious', text: 'Stated funds don’t cover the down payment plus estimated closing costs.' });
  if (recentDerog) flags.push({ tone: 'serious', text: `Recent derogatory event: ${derogs.join('; ')}.` });
  if (verified != null && stated > 0 && verified < stated * 0.9) flags.push({ tone: 'warning', text: `Verified income is ${Math.round((1 - verified / stated) * 100)}% below stated income; the analysis uses the verified figure.` });
  if (!app.screening) flags.push({ tone: 'warning', text: 'Screening not run yet. Figures are self-reported.' });
  if (app.offer?.occupancy === 'investment') flags.push({ tone: 'neutral', text: 'Buyer plans to rent the property out (business-purpose credit).' });
  if (flags.some((f) => f.tone === 'critical')) score = Math.min(score, 45);
  score = clamp(Math.round(score), 0, 100);
  const g = GRADES.find((x) => score >= x.min);

  // ---- what would make it work ----
  const target = 43;
  const maxHousing = Math.round((income * target) / 100) - debts;
  const maxPI = maxHousing - housing.taxes - housing.insurance - housing.hoa;
  const maxLoan = maxPI > 0 ? principalForPayment(maxPI, t.ratePct, t.amortMonths) : 0;
  const downNeeded = Math.max(0, price - maxLoan);
  const incomeNeeded = Math.ceil(((housing.total + debts) * 100) / target);

  // ---- ATR worksheet (12 CFR 1026.43(c)(2)) ----
  const scr = app.screening;
  const atr = [
    {
      factor: 'Current or reasonably expected income or assets',
      value: `${fmt$(income)}/mo gross${retirement ? ` · ${fmt$(retirement)} retirement assets` : ''}`,
      source: scr?.incomeSource || 'Stated by applicant',
      verified: !!scr?.incomeVerified,
      ok: income > 0,
    },
    {
      factor: 'Current employment status',
      value: (app.applicants || []).map((a) => `${a.first}: ${EMPLOYMENT_TYPES[a.employmentType] || '—'}${a.employer ? `, ${a.employer}` : ''}${a.years ? ` (${a.years} yr)` : ''}`).join(' · '),
      source: scr ? 'Employment confirmed from payroll deposits' : 'Stated by applicant',
      verified: !!scr,
      ok: true,
    },
    { factor: 'Monthly payment on this loan', value: `${fmt$(housing.pi)} principal & interest`, source: 'Calculated from the note terms (fully indexed, fixed rate)', verified: true, ok: true },
    { factor: 'Monthly payment on simultaneous loans', value: app.simultaneousLoan ? fmt$(app.simultaneousLoan) : 'None', source: 'Stated; confirmed by credit report', verified: !!scr, ok: true },
    { factor: 'Mortgage-related obligations', value: `${fmt$(housing.taxes + housing.insurance + housing.hoa)} taxes, insurance${housing.hoa ? ', HOA' : ''}`, source: 'County tax record and insurance quote on the listing', verified: true, ok: true },
    { factor: 'Current debt obligations, alimony & child support', value: `${fmt$(debts)}/mo`, source: scr ? 'Soft-pull credit report' : 'Stated by applicant', verified: !!scr, ok: true },
    { factor: 'Monthly debt-to-income ratio or residual income', value: `${back.toFixed(1)}% DTI · ${fmt$(residual)} residual`, source: 'Calculated', verified: true, ok: back <= 50 || residual > 150000 },
    { factor: 'Credit history', value: `${scoreVerified ?? `~${band.mid}`}${derogs.length ? ` · ${derogs.join('; ')}` : ' · no major derogatories'}`, source: scr ? scr.creditBureau : 'Self-reported range', verified: !!scr, ok: credit >= 580 && !recentDerog },
  ];
  const atrPass = atr.every((a) => a.ok);

  const strengths = [], concerns = [];
  if (back <= 36) strengths.push(`Low debt-to-income (${back.toFixed(0)}%)`); else if (back > 43) concerns.push(`Debt-to-income above 43% (${back.toFixed(0)}%)`);
  if (credit >= 700) strengths.push(`Good credit (${credit})`); else if (credit < 640) concerns.push(`Credit below 640 (${credit})`);
  if (downPct >= 15) strengths.push(`${downPct.toFixed(0)}% down`); else if (downPct < 10) concerns.push(`Only ${downPct.toFixed(0)}% down`);
  if (reserveMonths >= 6) strengths.push(`${reserveMonths.toFixed(0)} months of reserves`); else if (reserveMonths < 2) concerns.push('Thin cash reserves');
  if (years >= 3 && empType !== 'retired') strengths.push(`${years} years in line of work`);
  if (empType === 'self' && years < 2) concerns.push('Self-employed under 2 years');
  derogs.forEach((d) => concerns.push(d));

  return {
    price, down, downPct, housing, stated, verified, income, debts, front, back,
    closingCosts, liquid, afterClose, reserveMonths, credit, creditVerified: !!scoreVerified,
    residual, years, empType, derogs, comps, score, grade: g.grade, gradeLabel: g.label, tone: g.tone,
    recommendation: g.rec, flags, strengths, concerns, atr, atrPass,
    whatIf: { target, maxLoan, downNeeded, downNeededPct: price ? (downNeeded / price) * 100 : 0, incomeNeeded, maxPI },
  };
}

function fmt$(c) {
  return `$${Math.round(c / 100).toLocaleString('en-US')}`;
}

// Simulated screening results (identity, soft-pull credit, bank-verified
// income and assets). Deterministic per application so the demo is stable.
export function simulateScreening(app, completedAt) {
  const r = rng(`screen:${app.id}`);
  const band = bandOf(app.credit?.band);
  const creditScore = Math.round(clamp(band.mid + (r() - 0.5) * 30, band.lo, band.hi));
  const stated = statedIncome(app);
  const primary = (app.applicants || [])[0] || {};
  const selfEmp = primary.employmentType === 'self';
  const factor = selfEmp ? 0.86 + r() * 0.1 : 0.94 + r() * 0.07;
  const incomeVerified = Math.round((stated * Math.min(1, factor)) / 100) * 100;
  const assetsVerified = Math.round((liquidAssets(app) * (0.95 + r() * 0.05)) / 100) * 100;
  const cardBalanceUtil = Math.round(12 + r() * 50 + (creditScore < 640 ? 25 : 0));
  return {
    status: 'complete',
    completedAt,
    identity: 'verified',
    identityMethod: 'Government ID + selfie match',
    creditScore,
    creditBureau: 'Soft-pull credit report (demo data)',
    tradelines: {
      open: 3 + Math.floor(r() * 9),
      utilization: Math.min(99, cardBalanceUtil),
      lates24: creditScore < 620 ? 2 + Math.floor(r() * 3) : creditScore < 680 ? Math.floor(r() * 2) : 0,
      collections: creditScore < 600 ? 1 : 0,
      oldestYears: 3 + Math.floor(r() * 15),
    },
    incomeVerified,
    incomeSource: selfEmp ? 'Bank-linked deposits, 24-month average' : 'Bank-linked payroll deposits, 12 months',
    assetsVerified,
    assetsSource: 'Bank-linked balances, 60-day average',
  };
}
