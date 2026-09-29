# SteadyNote: seller financing, handled

**Live demo:** https://billyatminyawns.github.io/steadynote/

SteadyNote is a working prototype of a seller-financing platform. Property owners who'd rather have monthly income than a lump sum can use it to:

1. **Structure a deal.** The Deal Builder shows the buyer's payment, what the seller collects, any balloon, and a live compliance check: the Reg Z seller-financer exclusions (12 CFR 1026.36(a)(4)–(5)), the IRS minimum rate (AFR), and rate-vs-market screens.
2. **Qualify buyers themselves.** Each listing gets a phone-friendly application link. The buyer pays a $49 screening fee. The seller gets a 100-point scorecard, DTI/reserves analysis, an Ability-to-Repay worksheet covering the eight factors in 12 CFR 1026.43(c)(2), and adverse-action notices for declines.
3. **Service the note on autopilot.** Autopay (ACH), a borrower portal, a ledger that applies payments in standard mortgage order (interest → principal → escrow → charges), late charges after the grace period, partial payments held in suspense, escrow with annual analysis, payoff quotes, year-end interest statements, installment-sale (Form 6252) gain tracking, and note valuation for a later sale.

The revenue model is built into the workflow: per-applicant screening, per-loan monthly servicing ($29 Essentials / $49 Complete), one-time add-ons (closing docs, RMLO review, payoff & lien release), and a note-sale marketplace fee. See `#/business` in the app.

## Try it

- **Seller demo:** `#/app`. A retired couple (Hendricks Family Trust) holds five notes: one late, one paid off, one with a bounced check. They also have a live listing with three applicants who grade A, C and E.
- **Buyer application:** `#/apply/sunset-ridge-4471`
- **Borrower portal:** `#/borrower`
- **Demo clock:** click the date in the top bar to jump ahead a week or a month and watch autopay drafts, reminders and late charges happen.

All data is fictional and lives in your browser's `localStorage`. **Reset demo** restores it. An untouched demo regenerates each day so dates stay current.

## How it's built

No build step: plain ES modules, served as static files (GitHub Pages).

```
index.html            app shell
css/app.css           the design system
js/main.js            hash router + layouts
js/core/              pure logic (no DOM): money/date utils, amortization, servicing engine,
                      qualification, compliance, tax, automations, pricing, market rates
js/data/              demo seed + localStorage store
js/ui/                escaping html`` templates, components, SVG charts, event delegation
js/views/             screens (marketing, seller app, apply, borrower portal, documents)
tests/                engine + seed tests (run with macOS JavaScriptCore, no Node needed)
```

Run locally:

```bash
python3 server.py            # http://localhost:8650
./tests/run.sh               # 229 engine and seed checks
```

The servicing engine (`js/core/servicing.js`) is deterministic. It replays a loan's transactions against its contractual schedule to derive balances, installment status, fees, escrow, suspense and delinquency as of any date. Money is integer cents throughout.

## Reference data

- 30-year fixed average **7.03%** (week of Sept 24, 2026): Freddie Mac Primary Mortgage Market Survey.
- Applicable Federal Rates for **October 2026**: IRS Rev. Rul. 2026-19 (long-term 5.22% annual / 5.10% monthly).
- Both are editable in **Settings → Market data**.

## Not included yet (what production would need)

Real ACH and bank linking (e.g. Plaid plus a payments partner), credit-bureau and identity vendors, e-signature, a backend with accounts and multi-party access, state-specific closing documents via partner attorneys, and Form 1098 e-filing.

---

SteadyNote is a prototype. It isn't a lender, loan originator, law firm or tax advisor, and nothing in it is legal or tax advice.
