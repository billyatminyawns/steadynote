// Market reference data used for guardrails. Editable in Settings.
export const MARKET_DEFAULTS = {
  pmms30: 7.03,
  pmms15: 6.42,
  pmms30YearAgo: 6.3,
  asOf: '2026-09-24',
  source: 'Freddie Mac Primary Mortgage Market Survey®',
  sourceUrl: 'https://www.freddiemac.com/pmms',
};

// IRS Applicable Federal Rates, Rev. Rul. 2026-19 (October 2026), Table 1.
// Seller-financed notes paying monthly compare against the monthly column.
export const AFR_DEFAULTS = {
  month: 'October 2026',
  ruling: 'Rev. Rul. 2026-19',
  url: 'https://www.irs.gov/pub/irs-drop/rr-26-19.pdf',
  annual: { short: 4.25, mid: 4.61, long: 5.22 },
  monthly: { short: 4.17, mid: 4.52, long: 5.1 },
};

export const AFR_BUCKETS = {
  short: 'Short-term (3 years or less)',
  mid: 'Mid-term (over 3, up to 9 years)',
  long: 'Long-term (over 9 years)',
};

export function afrBucket(termMonths) {
  if (termMonths <= 36) return 'short';
  if (termMonths <= 108) return 'mid';
  return 'long';
}
