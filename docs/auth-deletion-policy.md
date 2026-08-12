# Pawls Account Deletion Policy (P0 Auth, 2026-08-12)

Server-authorised cascade in `src/lib/auth/deletion.ts`, invoked only from
`POST /auth/delete-account` (authenticated session + typed-email + checkbox
confirmation, CSRF-checked). No client can delete an account by id.

| Data | Disposition | Rationale |
|---|---|---|
| dog_profiles | DELETE (user_id-owned + legacy rows whose stored email matches) | User content |
| swipes / matches | DELETE (rows referencing the user's dogs) | User content; no legal need |
| messages | DELETE | User content; full GDPR-style removal |
| bookings | RETAIN minimal record; PII anonymised (customer_name → "Deleted user", customer_email → deleted@example.invalid) | Service history / liability |
| providers | RETAIN business records (no owner-PII column exists yet) | NOTE: providers table gains an owner linkage column in the services phase; anonymization for provider-owned listings will be added then |
| payments | RETAIN in full (stripe refs, amounts, status) | Legal/tax requirement (no payments table exists yet; policy applies when it lands) |
| subscriptions | DELETE | No payment records stored here |
| referrals | DELETE | User content |
| sessions / email_tokens | DELETE / FK ON DELETE CASCADE | Session hygiene |
| users | DELETE (last) | — |
| audit_log | INSERT `account_deleted` entry, KEPT forever | Audit trail (GDPR Art. 30 / internal accountability) |

Execution: single Neon transaction; missing tables are skipped via
to_regclass so the cascade stays safe as the schema evolves. On any failure the
whole transaction rolls back and the user sees a controlled 500 — never a fake
"deleted".
