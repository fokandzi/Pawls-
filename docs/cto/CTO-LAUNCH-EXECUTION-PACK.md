# Pawls CTO Launch Execution Pack

This pack is the standing engineering workflow for getting Pawls to a functional, secure, monetisable Paris V1. Every work item must use `.github/ISSUE_TEMPLATE/cto-launch-work.md` and include evidence before it is considered complete.

## Non-negotiable operating rule

**Reproduce → Fix → Test → Review → Deploy → Production verify → Close.**

Never mark a feature complete because code exists. Completion means the real user flow works in the target environment and the required negative/security tests pass.

---

# STEP 01 — Book payments and booking state — P0

## Objective
Make payment amount, currency, booking ownership and payment state server-authoritative before production payments are enabled.

## CTO form requirements
- Related issue: #1
- Inspect `src/db/payments.ts`, `src/db/bookings.ts`, Stripe webhook code, booking UI and schema.
- Client must not control charge amount, provider identity, service identity or payment state.
- Server loads authoritative booking/service/provider/price/currency.
- Define state machine such as `pending_payment → paid/confirmed → completed`, with cancellation/refund states as needed.
- Prevent duplicate checkout/payment and payment of another user's booking.
- Verify Stripe webhook signature, event idempotency, expected amount/currency and booking correspondence.
- Regression tests must tamper with client values and prove they cannot change the amount or booking ownership.

## Exit gate
No production Book payment until all P0 acceptance tests pass.

---

# STEP 02 — Book authorization and data isolation — P0

## Objective
Prove customers and providers can access or mutate only records they are authorized to use.

## CTO form requirements
- Inventory every Book read/write endpoint/server function.
- For bookings, services, provider profiles, availability, cancellations and refunds: identify actor and authorization rule.
- Test User A versus User B for read/update/delete/cancel/payment actions.
- Provider A cannot modify Provider B catalog, availability or bookings.
- Customer cannot promote themselves to provider/admin or alter privileged fields.
- IDs supplied by the browser are treated only as references; authorization is resolved server-side.
- Add automated negative tests for cross-account access.

## Exit gate
Zero known IDOR/cross-user P0 findings in Book.

---

# STEP 03 — Real Match authorization and integrity — P0

## Objective
Make persisted swipes, mutual matches and dog-profile operations ownership-safe and resistant to client manipulation.

## CTO form requirements
- Inventory profile creation/edit/delete, feed, swipe and match functions.
- Require authenticated ownership for private mutations.
- User cannot swipe as another profile or edit/delete another user's dog.
- Mutual match is derived server-side from persisted valid swipes.
- Demo/test/staff profiles do not leak into public production discovery unless explicitly intended.
- Duplicate/replayed swipes cannot corrupt match state.
- Add two-user and three-user abuse tests.

## Exit gate
Real Match works end-to-end with server-enforced ownership and deterministic mutual-match behavior.

---

# STEP 04 — Messaging authorization and privacy — P0

## Objective
Ensure only legitimate conversation participants can read/send messages and unread state cannot leak across accounts.

## CTO form requirements
- Inventory conversation creation, participant lookup, message read/write, unread counters and attachments if present.
- Server verifies membership for every conversation read and message mutation.
- User A cannot enumerate/read/send into User B/C conversations by changing IDs.
- Conversation creation follows product rules (for example valid match/booking relationship where required).
- Validate attachment type/size/storage access if attachments are enabled.
- Test deletion/account lifecycle behavior against documented policy.

## Exit gate
Cross-user conversation access is denied and covered by regression tests.

---

# STEP 05 — Accounts, sessions and privileged roles — P0/P1

## Objective
Complete authentication lifecycle and verify no client-side path can grant account privileges.

## CTO form requirements
- Register, email verification, login, logout, password reset/change, session revocation and account deletion tested end-to-end.
- Confirm suspension/disabled-account behavior.
- Confirm role/provider/admin privileges are server-controlled.
- Test CSRF, rate limits, session expiration and cookie flags.
- Account deletion must require authenticated confirmation and execute documented cleanup/anonymization.
- No localStorage/client flag may grant Plus/provider/admin access.

## Exit gate
Full account lifecycle passes production-like QA and privilege escalation tests.

---

# STEP 06 — Provider onboarding and marketplace operations — P1

## Objective
Make Pawls Book commercially operable from provider application through a completed service.

## CTO form requirements
- Provider application/onboarding.
- Approval/rejection controlled by authorized admin workflow.
- Provider catalog/service creation.
- Pricing and availability management.
- Customer discovery → service → booking → payment → confirmation.
- Provider sees legitimate booking and can progress allowed status.
- Cancellation/refund rules implemented and auditable.
- Pawls commission calculation is server-authoritative.
- Stripe Connect onboarding/payout state is honest and verified where enabled.

## Exit gate
A real approved provider and test customer can complete the full marketplace lifecycle without manual database edits.

---

# STEP 07 — Revenue, payments and financial reconciliation — P1

## Objective
Ensure Pawls can trust its own financial records.

## CTO form requirements
- Define authoritative records for gross booking value, Pawls commission, provider amount, refunds and payment status.
- Stripe identifiers stored and unique where appropriate.
- Webhook replay is safe/idempotent.
- Refund/cancellation cannot produce impossible financial states.
- Create reconciliation procedure/report against Stripe.
- Test failed payment, abandoned checkout, duplicate webhook, partial/full refund and payout edge cases.

## Exit gate
A booking can be reconciled from Pawls DB to Stripe without relying on client-submitted financial values.

---

# STEP 08 — Paris launch UX, French copy and honesty — P1

## Objective
Make the production product understandable and truthful for the first Paris launch market.

## CTO form requirements
- Review every public route and CTA.
- French is coherent across launch-critical flows.
- No fake counters, ratings, testimonials, provider inventory or unsupported claims.
- Coming-soon features are clearly separated from working features.
- Every visible primary CTA leads to a functioning destination/action.
- Mobile QA on common viewport sizes.
- Empty/error/loading states are usable.

## Exit gate
No dead primary CTA or misleading production claim in the launch path.

---

# STEP 09 — Production readiness, observability and recovery — P1

## Objective
Make failures diagnosable and deployments recoverable.

## CTO form requirements
- Production env configuration inventory without exposing secret values.
- Build/typecheck/test pipeline green.
- Error logging for auth, booking, payment and messaging critical paths.
- Health checks where appropriate.
- Database migration and rollback procedure documented.
- Backup/recovery assumptions documented and tested where practical.
- Deployment rollback procedure verified.
- Rate limits and abuse controls reviewed.

## Exit gate
Team can identify a critical failure and roll back/recover without guessing.

---

# STEP 10 — Commercial launch end-to-end acceptance — P0 launch gate

## Objective
Prove Pawls is a functional commercial V1, not merely a collection of implemented components.

## Required test personas
1. New customer A
2. New customer B
3. Approved provider A
4. Approved provider B
5. Authorized admin

## Required journeys
- Customer registration → verification → dog profile → discovery/swipe → mutual match → messaging.
- Provider onboarding → approval → service/catalog → availability.
- Customer discovers service → books → pays → receives confirmation.
- Provider receives legitimate booking → progresses service state.
- Cancellation/refund scenario.
- Cross-user abuse suite across Match, Book and Messaging.
- Account/password/session/deletion lifecycle.
- Production URLs, mobile flows and key French copy.

## Launch decision
### GO only if
- No unresolved P0.
- All revenue-critical flows pass.
- Payment reconciliation passes.
- Authorization isolation passes.
- Primary production CTAs work.
- Evidence is attached to the work forms.

### NO-GO if
Any known defect can cause unauthorized access, incorrect charges, false payment/booking state, loss of critical user data, or a broken primary revenue flow.

---

# CTO weekly handoff form

Use this at the end of every paid work cycle.

## Cycle
- Dates:
- Engineers:
- Starting commit:
- Ending commit:

## Completed
- Work forms/issues closed:
- Production changes:
- Evidence:

## Still blocked
- Blocker:
- Why:
- External credential/payment/dependency needed:
- Can work continue without it? yes/no

## Quality
- Tests added:
- Tests passing:
- P0 open:
- P1 open:
- Production regressions found:

## Next cycle priority
1.
2.
3.

## Revenue/launch impact
State what became newly sellable, bookable, payable, safer or more reliable during this cycle.
