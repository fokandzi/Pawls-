/**
 * Account deletion — server-authorised cascade. Policy rationale in
 * docs/auth-deletion-policy.md. Runs in a single Neon transaction; tables that
 * don't exist yet are skipped (to_regclass) so this stays safe as the schema
 * evolves. Payments records are RETAINED by design (legal requirement).
 */
import { sql } from "../../db";
import { ensureAuthTables, writeAudit } from "./ensure";
import type { SessionUser } from "./session";

async function tableExists(name: string): Promise<boolean> {
  const rows = await sql()`SELECT to_regclass(${'public.' + name}) AS t`;
  return !!((rows[0] as any)?.t);
}

export interface DeleteResult {
  ok: boolean;
  error?: string;
  details?: { dogs: number };
}

export async function deleteUserAccount(user: SessionUser): Promise<DeleteResult> {
  try {
    await ensureAuthTables();
    const dogRows = await sql()`
      SELECT id FROM dog_profiles
      WHERE user_id = ${user.id} OR (user_id IS NULL AND lower(email) = lower(${user.email}))
    ` as any;
    const dogIds = (dogRows as Array<{ id: number }>).map((r) => Number(r.id));
    const [hasSwipes, hasMatches, hasMessages, hasBookings, hasSubscriptions, hasReferrals, hasConversations] =
      await Promise.all([
        tableExists("swipes"),
        tableExists("matches"),
        tableExists("messages"),
        tableExists("bookings"),
        tableExists("subscriptions"),
        tableExists("referrals"),
        tableExists("conversations"),
      ]);
    await sql().transaction((tx) => {
      const q: any[] = [
        tx`INSERT INTO audit_log (user_id, action, details)
           VALUES (${user.id}, 'account_deleted',
                   ${JSON.stringify({ email: user.email, dogProfileCount: dogIds.length })}::jsonb)`,
      ];
      if (dogIds.length > 0) {
        if (hasMessages) q.push(tx`DELETE FROM messages WHERE sender_profile_id = ANY(${dogIds})`);
        if (hasSwipes) q.push(tx`DELETE FROM swipes WHERE swiper_profile_id = ANY(${dogIds}) OR target_profile_id = ANY(${dogIds})`);
        if (hasMatches) q.push(tx`DELETE FROM matches WHERE profile_id_1 = ANY(${dogIds}) OR profile_id_2 = ANY(${dogIds})`);
        q.push(tx`DELETE FROM dog_profiles WHERE id = ANY(${dogIds})`);
      }
      if (hasBookings) {
        q.push(tx`UPDATE bookings SET customer_name = 'Deleted user', customer_email = 'deleted@example.invalid'
                  WHERE lower(customer_email) = lower(${user.email})`);
      }
      // Conversations the user participated in are deleted with the account
      // (messages + participant rows cascade via FK). This is the documented
      // deletion policy: a deleted user leaves no conversation artifacts.
      if (hasConversations) {
        q.push(tx`DELETE FROM conversations WHERE id IN (
          SELECT conversation_id FROM conversation_participants WHERE user_id = ${user.id}
        )`);
      }
      // Security Finding #13: entitlement lives on the IMMUTABLE subscriptions.user_id
      // (Findings #8/#9); email is informational only and nullable. Deleting by email
      // could orphan the deleted user's row or — worse — delete a DIFFERENT user's
      // subscription on a shared/legacy email, violating the deletion boundary.
      // Resolve by user_id; keep the lower(email) match ONLY for legacy rows that
      // never carried a user binding (identical to the dog_profiles pattern above).
      if (hasSubscriptions) {
        q.push(tx`DELETE FROM subscriptions
                  WHERE user_id = ${user.id}
                     OR (user_id IS NULL AND lower(email) = lower(${user.email}))`);
      }
      // referrals: the schema has no user_id column (legacy table is keyed by
      // referrer_code / referred_email, both email-shaped). We keep the email-based
      // row removal (the only identity this table exposes) AND also remove rows whose
      // referred_profile_id is one of the deleted user's dogs, so no referral dangles
      // on a removed profile (existing column — nothing invented).
      if (hasReferrals) {
        if (dogIds.length > 0) {
          q.push(tx`DELETE FROM referrals
                    WHERE lower(referrer_code) = lower(${user.email})
                       OR lower(referred_email) = lower(${user.email})
                       OR referred_profile_id = ANY(${dogIds})`);
        } else {
          q.push(tx`DELETE FROM referrals
                    WHERE lower(referrer_code) = lower(${user.email})
                       OR lower(referred_email) = lower(${user.email})`);
        }
      }
      q.push(tx`DELETE FROM sessions WHERE user_id = ${user.id}`);
      q.push(tx`DELETE FROM users WHERE id = ${user.id}`);
      return q;
    }) as any;
    writeAudit(user.id, "account_deleted_done", { email: user.email });
    return { ok: true, details: { dogs: dogIds.length } };
  } catch (err: any) {
    console.error("[auth] account deletion failed", err);
    return { ok: false, error: "We couldn't delete your account right now. Please try again in a moment." };
  }
}
