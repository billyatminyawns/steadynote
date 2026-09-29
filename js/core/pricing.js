// SteadyNote's revenue model. One source of truth for the marketing pages,
// the seller's billing page and the business model page.
export const PRICING = {
  screening: { price: 4900, name: 'Buyer screening', unit: 'per applicant', paidBy: 'applicant', desc: 'Identity check, soft-pull credit, bank-verified income and assets, and an Ability-to-Repay report.' },
  plans: [
    {
      id: 'free',
      name: 'Deal Builder',
      price: 0,
      unit: 'free forever',
      desc: 'Structure an offer, check compliance and publish a listing with an application link.',
      features: ['Seller-financing calculator', 'Dodd-Frank & AFR guardrails', 'Listing page + buyer application link', 'Applicant scorecards'],
    },
    {
      id: 'essentials',
      name: 'Servicing Essentials',
      price: 2900,
      unit: 'per loan / month',
      desc: 'Everything to collect and track payments without chasing anyone.',
      features: ['Autopay (ACH) collection, no per-draft fees', 'Borrower portal & payment reminders', 'Automatic interest/principal ledger', 'Late notices & receipts', 'Payoff quotes', 'Year-end interest statements'],
      popular: true,
    },
    {
      id: 'complete',
      name: 'Servicing Complete',
      price: 4900,
      unit: 'per loan / month',
      desc: 'Essentials plus escrow and collateral protection.',
      features: ['Everything in Essentials', 'Escrow for taxes & insurance', 'Annual escrow analysis', 'Insurance & property-tax monitoring', 'Form 1098 e-filing', 'Default & cure notices'],
    },
  ],
  addons: [
    { id: 'docs', name: 'Closing document package', price: 34900, unit: 'one-time', desc: 'Promissory note, deed of trust or mortgage and disclosures, prepared by a partner attorney in your state.' },
    { id: 'rmlo', name: 'RMLO origination review', price: 24900, unit: 'one-time', desc: 'A licensed loan originator reviews and originates deals outside the seller-financer exclusions.' },
    { id: 'payoff', name: 'Payoff & lien release', price: 9900, unit: 'one-time', desc: 'Final payoff statement plus preparation and recording of the reconveyance or satisfaction.' },
    { id: 'notesale', name: 'Note sale marketplace', price: null, pct: 2, unit: 'of sale price', desc: 'Sell all or part of your note to vetted note buyers when you want a lump sum.' },
  ],
};

export const planOf = (loan) => (loan.escrow?.enabled || loan.plan === 'complete' ? 'complete' : 'essentials');
export const planPrice = (id) => PRICING.plans.find((p) => p.id === id)?.price || 0;
