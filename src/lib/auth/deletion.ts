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
    const [hasSwipes, hasMatches, hasMessages, hasBookings, hasSubscriptions, hasReferrals] =
      await Promise.all([
        tableExists("swipes"),
        tableExists("matches"),
        tableExists("messages"),
        tableExists("bookings"),
        tableExists("subscriptions"),
        tableExists("referrals"),
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
      if (hasSubscriptions) q.push(tx`DELETE FROM subscriptions WHERE lower(email) = lower(${user.email})`);
      if (hasReferrals) {
        q.push(tx`DELETE FROM referrals
                  WHERE lower(referrer_id) = lower(${user.email}) OR lower(referred_email) = lower(${user.email})`);
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
