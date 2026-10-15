# AI App Pre-Launch Technical Audit — Sell-Now Pack

## Positioning
For founders who built an application quickly with AI coding tools and need evidence that it is ready for real users, payments and private data.

**Core promise:** Before you put customers, payments or private data through your AI-built app, identify the launch blockers your coding agent may have missed.

This is a technical launch-readiness review. It is not a formal penetration-test certification, legal/compliance certification, or guarantee that software is vulnerability-free.

## Founding-client offer
### €299 — first 3 paid audits
Includes:
- authentication and session review
- authorization / cross-user data isolation review
- payment and business-logic review where applicable
- database / Supabase / Firebase access-control review where applicable
- secrets and production configuration review
- critical customer-flow QA
- dependency and deployment hygiene review
- prioritized P0 / P1 / P2 findings
- evidence and business impact for confirmed findings
- CTO-ready remediation instructions
- GO / CONDITIONAL GO / NO-GO launch verdict
- one focused retest of agreed critical findings after remediation

### Standard price after founding clients
- Audit: €499
- Audit + remediation support + retest: €799
- Future continuous launch guard: €99–€199/month, only after recurring delivery is proven

## Best-fit customer
- founder close to launch
- AI-built or AI-heavy codebase
- React / Next / Vite or similar web stack
- Supabase / Firebase / Postgres
- Stripe or other payment flow
- Vercel / Replit / similar deployment
- app will handle real users, private data, bookings, subscriptions or payments

## Not a fit
- requests for unauthorized testing of third-party systems
- customers unwilling to establish ownership/authorization
- requests for compliance certification we are not qualified to issue
- destructive testing against production

## Intake requirements
1. Founder/company name
2. Application name and short description
3. Repository access or authorized code export
4. Live/preview URL if available
5. Stack and deployment provider
6. Database/auth provider
7. Payment provider if any
8. Critical commercial flows
9. Known issues
10. Explicit written authorization to review the supplied application/repository
11. Confirmation not to provide passwords, production secrets, private customer data or database dumps through intake forms

## Delivery workflow
1. Scope and authorization
2. Automated candidate scans where appropriate
3. Structured human/code review
4. Critical-flow tracing
5. Safe negative/authorization tests in authorized environment
6. Confirm or reject candidate findings
7. Rank by technical severity + business impact
8. Produce CTO remediation forms
9. Issue launch verdict
10. Retest agreed critical fixes

## Finding format
**Finding ID / Severity / Category / Affected flow**

- What was detected
- Evidence
- Why it matters to the business
- Safe remediation requirement
- Regression/negative test required
- Status: Detected / Fix in progress / Retest required / Verified fixed

## Launch verdicts
### GO
No known P0 blockers within audited scope; critical commercial and authorization tests pass.

### CONDITIONAL GO
No immediate catastrophic blocker, but named P1 work must be completed on a defined timeline and residual risk is explicitly accepted.

### NO-GO
Confirmed P0 such as unauthorized data access, charge-integrity failure, false payment state, critical auth bypass, severe secret exposure, destructive data risk, or broken primary revenue flow.

## Proof standard
Never manufacture findings. Passing controls are evidence too.

A public/sales proof statement must be sanitized and must never disclose exploit instructions, credentials, private data, production secrets or customer-sensitive implementation details.

Example internal proof from Audit #001 methodology:
- payment/business-logic defects can be detected and translated into launch blockers
- marketplace ownership/approval defects can be detected
- strong matching and private-messaging authorization architecture can also receive a provisional/static pass rather than a fabricated vulnerability

Only say a risk was **prevented** after remediation and required regression/negative tests pass. Only say **verified fixed** after retest and review.

## Outreach message
Built your app with Claude Code, Cursor, Lovable, Bolt, Replit or another AI builder and getting ready to launch?

I'm opening 3 founding-client slots for an **AI App Pre-Launch Technical Audit** at **€299**.

I review the parts that can look fine in a demo but fail with real customers: authentication, cross-user access, database permissions, payments, business logic, secrets/configuration and critical customer flows.

You receive evidence-backed P0/P1/P2 findings, CTO-ready fixes and a clear GO / CONDITIONAL GO / NO-GO launch assessment. This is a launch-readiness technical review, not a security certification.

If you're close to putting real users, payments or private data through the app, reply **AUDIT** and I'll send the scope/intake requirements.

## Short founder DM
Before you launch your AI-built app, do you know whether another user can access data they shouldn't, whether your payment amount is truly server-controlled, and whether your production config is safe?

I'm taking 3 founding clients for a €299 pre-launch technical audit. Evidence-backed findings + CTO remediation plan + launch verdict. Reply **AUDIT** if you want the scope.

## Sales-call close
The goal isn't to produce a long vulnerability list. The goal is to answer: **what can lose you money, expose customer data, break launch, or create an authorization failure — and what must your developer fix first?**

Founding-client price is €299 upfront for the defined audit scope. Expanded remediation support is quoted separately unless included in a higher package.

## First-3-client success criteria
For every customer capture:
- amount collected
- source/channel
- time from first contact to payment
- audit delivery hours
- confirmed findings by severity
- passing controls
- fixes completed
- retest result
- customer outcome
- testimonial/case-study permission
- reusable methodology improvement

After 3 paid audits, review delivery time, conversion, customer outcomes and evidence before raising the standard price to €499.