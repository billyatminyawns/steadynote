// Compliance guardrails for seller financing. Informational, not legal advice.
//
// Federal: Regulation Z excludes certain seller financiers from the definition
// of "loan originator" (12 CFR 1026.36(a)(4) and (a)(5)). Outside those
// exclusions a residential seller-financed loan to a consumer should be
// originated through a licensed mortgage loan originator (RMLO).
// Tax: notes charging less than the Applicable Federal Rate can have interest
// imputed by the IRS (IRC §§ 483, 1274).
import { installmentCount, hasBalloon } from './servicing.js';
import { afrBucket, AFR_BUCKETS } from './rates.js';
import { durationLabel } from './util.js';

export const ENTITY_TYPES = {
  individual: 'Individual (natural person)',
  trust: 'Trust',
  estate: 'Estate',
  llc: 'LLC or corporation',
  partnership: 'Partnership',
};
export const PROPERTY_TYPES = {
  sfr: 'Single-family home',
  condo: 'Condo / townhome',
  multi: '2–4 unit',
  manufactured: 'Manufactured home',
  land: 'Vacant land',
  commercial: 'Commercial',
};

export function checkCompliance({ seller, property, occupancy, terms, atrDone = null, market, afr }) {
  const dwelling = !['land', 'commercial'].includes(property.type);
  const consumer = occupancy !== 'investment';
  const N = installmentCount(terms);
  const balloon = hasBalloon(terms);
  const interestOnly = terms.interestOnly === true;
  const fixed = (terms.rateType || 'fixed') === 'fixed';
  const priorCount = Number(seller.financedLast12 || 0);
  const naturalish = ['individual', 'trust', 'estate'].includes(seller.entityType);
  const builder = !!seller.builder;

  const one = {
    id: 'one',
    title: 'One-property exclusion',
    ref: '12 CFR 1026.36(a)(5)',
    checks: [
      { label: 'Seller is a natural person, estate, or trust', pass: naturalish, detail: ENTITY_TYPES[seller.entityType] || '—' },
      { label: 'Only property you seller-finance in any 12-month period', pass: priorCount === 0, detail: priorCount === 0 ? 'No other seller-financed sales in the last 12 months' : `${priorCount} other seller-financed sale${priorCount > 1 ? 's' : ''} in the last 12 months` },
      { label: 'You didn’t build the home as a builder or contractor', pass: !builder, detail: builder ? 'You indicated you build homes in the ordinary course of business' : 'Confirmed in your profile' },
      { label: 'No negative amortization', pass: true, detail: interestOnly ? 'Interest-only payments cover all interest due' : 'Level payments cover all interest due' },
      { label: 'Fixed rate (or adjustable only after 5+ years with caps)', pass: fixed, detail: fixed ? 'Fixed rate' : 'Adjustable rate' },
    ],
  };
  const three = {
    id: 'three',
    title: 'Three-property exclusion',
    ref: '12 CFR 1026.36(a)(4)',
    checks: [
      { label: 'Three or fewer properties seller-financed in any 12-month period', pass: priorCount + 1 <= 3, detail: `This would be #${priorCount + 1} in 12 months` },
      { label: 'You didn’t build the home as a builder or contractor', pass: !builder, detail: builder ? 'You build homes in the ordinary course of business' : 'Confirmed in your profile' },
      { label: 'Fully amortizing (no balloon, no interest-only)', pass: !balloon && !interestOnly, detail: balloon ? `Balloon due after ${durationLabel(N)}` : interestOnly ? 'Interest-only' : `Pays off in full over ${durationLabel(terms.amortMonths)}` },
      { label: 'Good-faith determination of the buyer’s ability to repay', pass: atrDone, detail: atrDone === true ? 'ATR worksheet attested' : atrDone === false ? 'Approved without an ATR attestation' : 'Done in SteadyNote when you approve a buyer' },
      { label: 'Fixed rate (or adjustable only after 5+ years with caps)', pass: fixed, detail: fixed ? 'Fixed rate' : 'Adjustable rate' },
    ],
  };
  for (const p of [one, three]) {
    p.eligible = p.checks.every((c) => c.pass !== false);
    p.pending = p.eligible && p.checks.some((c) => c.pass == null);
  }

  let verdict;
  if (!dwelling) {
    verdict = { tone: 'neutral', title: 'Federal loan-originator rules don’t apply', text: `${PROPERTY_TYPES[property.type]} isn’t a dwelling, so Reg Z’s seller-financing limits don’t apply. State law may still regulate the sale.`, path: null };
  } else if (!consumer) {
    verdict = { tone: 'neutral', title: 'Business-purpose credit', text: 'Financing a buyer who won’t live in the property is business-purpose credit under Reg Z, so the seller-financing limits generally don’t apply. Keep a signed business-purpose statement from the buyer.', path: null };
  } else if (one.eligible) {
    verdict = { tone: 'good', title: 'You qualify as an exempt seller financer', text: 'Your deal fits the one-property exclusion, so you can offer these terms without a licensed loan originator. Balloon payments are permitted on this path.', path: 'one' };
  } else if (three.eligible) {
    verdict = three.pending
      ? { tone: 'good', title: 'Exempt once you document ability to repay', text: 'This fits the three-property exclusion. Keep it fully amortizing and complete the ATR worksheet when you approve a buyer.', path: 'three' }
      : { tone: 'good', title: 'You qualify as an exempt seller financer', text: 'This deal fits the three-property exclusion.', path: 'three' };
  } else {
    const failed = (p) => p.checks.filter((c) => c.pass === false).map((c) => c.label.charAt(0).toLowerCase() + c.label.slice(1));
    verdict = {
      tone: 'critical',
      title: 'Use a licensed loan originator',
      text: `As structured, this deal falls outside both seller-financer exclusions. One-property path fails on: ${failed(one).join('; ')}. Three-property path fails on: ${failed(three).join('; ')}.`,
      path: null,
      fixes: [
        (balloon || interestOnly) && three.checks.filter((c) => c.pass === false).length === 1 && 'Make the loan fully amortizing (remove the balloon) to use the three-property exclusion',
        'Have a licensed loan originator (RMLO) originate the loan. SteadyNote partners do it for $249',
      ].filter(Boolean),
    };
  }

  // AFR (minimum interest for tax purposes)
  const bucket = afrBucket(N);
  const afrRate = afr.monthly[bucket];
  const afrCheck = {
    bucket,
    bucketLabel: AFR_BUCKETS[bucket],
    termMonths: N,
    rate: afrRate,
    pass: terms.ratePct >= afrRate,
    text: terms.ratePct >= afrRate
      ? `Your ${terms.ratePct}% rate clears the ${afr.month} ${bucket}-term AFR of ${afrRate}% (monthly compounding).`
      : `${terms.ratePct}% is below the ${bucket}-term AFR of ${afrRate}%. The IRS can recharacterize part of your principal as interest (IRC §§ 483, 1274). Set the rate at ${afrRate}% or higher.`,
  };

  // Pricing vs. the market (rough HPML / HOEPA screens using PMMS as a proxy for APOR)
  const spread = terms.ratePct - market.pmms30;
  const pricing = {
    market: market.pmms30,
    spread,
    hpml: spread >= 1.5,
    highCost: spread >= 6.5,
    text: spread >= 6.5
      ? `At ${spread.toFixed(2)} points over the 30-year average, this could be a high-cost mortgage under HOEPA (balloons are generally prohibited and counseling is required). Lower the rate.`
      : spread >= 1.5
        ? `${spread.toFixed(2)} points over the ${market.pmms30}% market average: higher-priced mortgage territory. If you make more than five seller-financed loans a year, escrow and appraisal rules may apply.`
        : spread >= 0
          ? `${spread.toFixed(2)} points over the ${market.pmms30}% 30-year average. Competitive for a buyer who can’t get a bank loan.`
          : `${Math.abs(spread).toFixed(2)} points under the ${market.pmms30}% 30-year average. Attractive to buyers; make sure it’s worth it to you.`,
  };

  const notes = [];
  if (balloon) {
    notes.push({ tone: 'warning', title: `Balloon due in ${durationLabel(N)}`, text: 'The buyer must refinance or sell by then. Give them enough runway (7–10 years is common) and a written reminder schedule. SteadyNote sends one starting 12 months out.' });
  }
  const lf = terms.lateFee || {};
  if (lf.type === 'pct' && lf.pct > 5) notes.push({ tone: 'warning', title: 'Late charge above 5%', text: 'Many states cap late charges on home loans (often at 4–5%). Check your state’s limit.' });
  if (terms.ratePct >= 10) notes.push({ tone: 'warning', title: 'Check state usury limits', text: `At ${terms.ratePct}%, confirm the rate is allowed in ${property.state || 'your state'}.` });
  if (seller.hasMortgage) notes.push({ tone: 'serious', title: 'Existing mortgage (due-on-sale)', text: 'If the property still has a mortgage, your lender can call it due when you sell. Pay it off at closing or get written consent before offering a wrap.' });
  if (!terms.escrow && dwelling && consumer) notes.push({ tone: 'neutral', title: 'Taxes & insurance paid by the buyer', text: 'Unpaid property taxes can take priority over your lien. Turn on escrow, or let SteadyNote monitor tax and insurance status.' });
  notes.push({ tone: 'neutral', title: 'State rules', text: `Some states add licensing, disclosure or foreclosure requirements for seller financing. Have closing documents prepared by a ${property.state || 'local'} attorney or title company.` });

  return { scope: { dwelling, consumer }, paths: [one, three], verdict, afr: afrCheck, pricing, notes };
}
