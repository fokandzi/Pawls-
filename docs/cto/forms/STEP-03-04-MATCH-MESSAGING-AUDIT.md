# CTO Work Form — Steps 03–04: Real Match + Messaging

## Work identity
- Audit: Pawls Audit #001
- Priority: P0 launch gate
- Owner:
- Reviewer:
- Branch:
- PR:

## Current code-review result
The current `match-core.ts` and `message-core.ts` show strong server-side authorization design: session-derived identity, dog ownership checks, candidate eligibility re-checks, canonical mutual matches, participant-only conversation access, block/match gates, and server-derived message sender identity.

This is a **provisional PASS from static code review**, not final production acceptance. Runtime negative tests are still mandatory.

## Required runtime acceptance suite

### Real Match
- [ ] Unauthenticated swipe rejected.
- [ ] User A cannot swipe as User B or select User B's dog as swiper identity.
- [ ] User A cannot swipe own dog.
- [ ] Forged/ineligible target dog rejected without DB write.
- [ ] Test/demo/seed/unknown entities excluded from real-user discovery.
- [ ] Hidden/out-of-market/unverified/blocked targets excluded.
- [ ] Duplicate same-direction swipe is idempotent.
- [ ] Mutual likes create exactly one canonical match.
- [ ] Pass never creates match.
- [ ] User A cannot edit/delete User B dog.
- [ ] Deleting own dog does not corrupt another user's data.

### Messaging
- [ ] Unauthenticated conversation list/view/send/read rejected.
- [ ] User C cannot enumerate/read Conversation A-B by changing conversation ID.
- [ ] User C cannot send into Conversation A-B.
- [ ] Client-supplied sender identity cannot impersonate another user.
- [ ] Optional sender dog context is accepted only for a dog owned by session user.
- [ ] Conversation cannot be created without genuine active match.
- [ ] Blocked users cannot list/view/send.
- [ ] Unmatched users cannot continue conversation if policy requires active match.
- [ ] Opening/GET does not mutate read state; dedicated POST marks counterpart messages only.
- [ ] Message length boundaries enforced.
- [ ] Deleted/hidden/removed messages do not appear to normal participants.

## Evidence required
- Test command(s):
- Test users/fixtures used:
- Test output:
- Preview environment:
- Production-safe smoke result:
- Commit SHA:
- Reviewer sign-off:

## Exit gate
PASS only after all negative and happy-path tests above succeed against the integrated HTTP/API layer and the target database schema. A static code-review pass alone cannot close this work item.

## Commercial proof
If runtime testing confirms the controls, record this as a **passing control** rather than inventing a vulnerability:

> The audit independently verified server-side identity, ownership and participant-isolation controls across matching and private messaging, while still requiring adversarial cross-account tests before launch approval.

This demonstrates that the commercial audit can verify good architecture as well as detect defects.