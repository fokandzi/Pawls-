/**
 * Safety/Admin — server-only core (Pawls Phase-1, owner directive rev 14 §9;
 * LAUNCH BLOCKER #8). Mirrors match-core.ts / message-core.ts: everything runs
 * server-side, identity ALWAYS comes from the session, and no entitlement or
 * role claim is ever accepted from the client.
 *
 * ZERO-REWORK EXTENSION of the proven Messaging gates:
 *  - A row in `blocks` ALREADY severs conversation access on both sides
 *    (message-core.blockedBetween) and hides the other user from discovery
 *    (match-core candidateWhere). This phase adds the endpoints/UI that
 *    CREATE and DELETE block rows — the gate code is untouched.
 *  - Flipping matches.state to 'unmatched' ALREADY closes conversation access
 *    (message-core.genuineActiveMatchBetween requires state='active'). This
 *    phase adds the endpoint/UI that flips it.
 *  - Removing a message sets messages.moderation_state='removed', which
 *    message-core ALREADY filters out of every read path.
 *  - Suspending a user (users.suspended_at) is enforced at the auth gates
 *    (login rejection + inert sessions) — added in this phase.
 *
 * REPORTS are a moderation QUEUE, not an auto-action: creating a report NEVER
 * claims "we took action". Statuses are honest: open -> reviewing ->
 * resolved / dismissed, each transition recorded by a human admin in the
 * append-only audit_log (user_id, action, details JSONB, created_at).
 *
 * PROVENANCE RULE: demo / seed / UNKNOWN-source dogs and users are excluded
 * from every real surface (is_demo=false, source='user' and is_test parity),
 * exactly like match-core/message-core. UNKNOWN is NOT real.
 *
 * ADMIN GATING: users.role='admin' is set ONLY by migration/ops (see
 * migration 004) — never by the client, never self-grantable. requireAdmin()
 * in authz.ts is the single gate on every admin endpoint.
 */
import { sql } from "../db";
import { writeAudit } from "./auth/ensure";
import { revokeAllSessions } from "./auth/session";

const q = sql();

export const REPORT_CATEGORIES = [
  "spam",
  "harassment",
  "inappropriate_content",
  "fake_profile",
  "other",
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const TARGET_TYPES = ["user", "dog", "message", "provider"] as const;
export type TargetType = (typeof TARGET_TYPES)[number];

export const ADMIN_ACTIONS = [
  "warn_user",
  "suspend_user",
  "reinstate_user",
  "remove_message",
  "unmatch",
  "block_user",
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

// ── Visibility helpers: what can a reporter legitimately see? ───────────────

/**
 * The target user must be a real, email-verified user in the reporter's own
 * test-parity class (real users never interact with test users). UNKNOWN /
 * demo concepts don't exist at the user level, but the same parity rule keeps
 * harness traffic isolated. The reporter cannot report themself.
 */
async function realVisibleUser(
  targetUserId: number,
  reporterUserId: number,
  reporterIsTest: boolean,
): Promise<boolean> {
  const rows = await q`
    SELECT 1 FROM users u
    WHERE u.id = ${targetUserId}
      AND u.id <> ${reporterUserId}
      AND u.is_test = ${reporterIsTest}
      AND u.email_verified_at IS NOT NULL
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * The target dog must be REAL (is_demo=false, source='user', owned by a real
 * user in the reporter's test-parity class) and publicly visible
 * (profile_visibility='public' — discovery only ever shows public dogs, so a
 * reporter can legitimately see any such dog). Never the reporter's own dog.
 */
async function realVisibleDog(
  targetDogId: number,
  reporterUserId: number,
  reporterIsTest: boolean,
): Promise<boolean> {
  const rows = await q`
    SELECT 1
    FROM dog_profiles dp
    JOIN users u ON u.id = dp.user_id
    WHERE dp.id = ${targetDogId}
      AND dp.is_demo = false
      AND dp.source = ANY('{"user"}'::text[])
      AND dp.user_id <> ${reporterUserId}
      AND dp.profile_visibility = 'public'
      AND u.is_test = ${reporterIsTest}
      AND u.email_verified_at IS NOT NULL
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * The target message must be in a conversation where the reporter is a
 * participant (membership is the only way the message was ever visible to
 * them) and must still be a live message (not deleted / not already removed).
 */
async function visibleMessageToReporter(messageId: number, reporterUserId: number): Promise<boolean> {
  const rows = await q`
    SELECT 1
    FROM messages m
    JOIN conversation_participants cp ON cp.conversation_id = m.conversation_id
    WHERE m.id = ${messageId}
      AND cp.user_id = ${reporterUserId}
      AND m.deleted_at IS NULL
      AND m.moderation_state = 'visible'
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * A reportable provider is a real (non-demo) provider owned by a real user.
 * Book is pre-launch, so today there are zero such providers — the surface
 * exists and returns 404 for every id until real supply arrives.
 */
async function realProvider(providerId: number): Promise<boolean> {
  const rows = await q`
    SELECT 1 FROM providers
    WHERE id = ${providerId} AND is_demo = false AND owner_user_id IS NOT NULL
    LIMIT 1
  `;
  return rows.length > 0;
}

// ── Report flow (user-facing, free) ─────────────────────────────────────────

export interface ReportResult {
  ok: boolean;
  status: number;
  error?: string;
  reportId?: number;
}

/**
 * Create a moderation report. The reporter must be authenticated (enforced by
 * the caller), the target must be real AND visible to the reporter under the
 * rules above, the category must be from the whitelist, and details are
 * bounded. Inserting a report NEVER takes automatic action — status starts
 * 'open' and only a human admin changes it. Rate limiting is the caller's job.
 */
export async function createReport(
  sessionUserId: number,
  sessionUserIsTest: boolean,
  input: { targetType: unknown; targetId: unknown; category: unknown; details: unknown },
): Promise<ReportResult> {
  const targetType = String(input.targetType ?? "");
  const targetId = Number(input.targetId);
  const category = String(input.category ?? "");
  const details = String(input.details ?? "").trim().slice(0, 2000);

  if (!(TARGET_TYPES as readonly string[]).includes(targetType)) {
    return { ok: false, status: 400, error: "targetType must be user, dog, message or provider" };
  }
  if (!Number.isSafeInteger(targetId) || targetId <= 0) {
    return { ok: false, status: 400, error: "targetId must be a positive integer" };
  }
  if (!(REPORT_CATEGORIES as readonly string[]).includes(category)) {
    return { ok: false, status: 400, error: "invalid report category" };
  }
  if (details.length > 2000) {
    return { ok: false, status: 400, error: "details must be 2000 characters or fewer" };
  }

  // Visibility: the reporter can only report what they could legitimately see.
  if (targetType === "user") {
    if (!(await realVisibleUser(targetId, sessionUserId, sessionUserIsTest))) {
      return { ok: false, status: 404, error: "target user is not available" };
    }
  } else if (targetType === "dog") {
    if (!(await realVisibleDog(targetId, sessionUserId, sessionUserIsTest))) {
      return { ok: false, status: 404, error: "target dog is not available" };
    }
  } else if (targetType === "message") {
    if (!(await visibleMessageToReporter(targetId, sessionUserId))) {
      return { ok: false, status: 404, error: "target message is not available" };
    }
  } else if (targetType === "provider") {
    if (!(await realProvider(targetId))) {
      return { ok: false, status: 404, error: "target provider is not available" };
    }
  }

  try {
    const ins = await q`
      INSERT INTO reports (reporter_user_id, target_type, target_id, category, details, status)
      VALUES (${sessionUserId}, ${targetType}, ${targetId}, ${category}, ${details || null}, 'open')
      RETURNING id
    `;
    const reportId = Number((ins[0] as any).id);
    writeAudit(sessionUserId, "report_created", {
      report_id: reportId,
      target_type: targetType,
      target_id: targetId,
      category,
    });
    return { ok: true, status: 201, reportId };
  } catch (err) {
    console.error("[safety-core] createReport failed", err);
    return { ok: false, status: 503, error: "We couldn't save your report right now." };
  }
}

// ── Block / unblock / unmatch (user-facing, wired to existing gates) ────────

export interface BlockResult {
  ok: boolean;
  status: number;
  error?: string;
  alreadyBlocked?: boolean;
}

/**
 * Block a user: inserts the blocks row that ALREADY severs conversation
 * access on both sides and removes them from discovery. Recoverable via
 * unblockUser. Never blocks yourself.
 */
export async function blockUser(
  sessionUserId: number,
  sessionUserIsTest: boolean,
  targetUserId: number,
): Promise<BlockResult> {
  const target = Number(targetUserId);
  if (!Number.isSafeInteger(target) || target <= 0) {
    return { ok: false, status: 400, error: "invalid user id" };
  }
  if (target === sessionUserId) {
    return { ok: false, status: 400, error: "you cannot block yourself" };
  }
  if (!(await realVisibleUser(target, sessionUserId, sessionUserIsTest))) {
    return { ok: false, status: 404, error: "user not found" };
  }
  try {
    const ins = await q`
      INSERT INTO blocks (blocker_user_id, blocked_user_id)
      VALUES (${sessionUserId}, ${target})
      ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING
      RETURNING id
    `;
    writeAudit(sessionUserId, "user_blocked", { target_user_id: target });
    return { ok: true, status: 200, alreadyBlocked: ins.length === 0 };
  } catch (err) {
    console.error("[safety-core] blockUser failed", err);
    return { ok: false, status: 503, error: "We couldn't block this user right now." };
  }
}

/** Unblock: only the original blocker can remove their own block row. */
export async function unblockUser(sessionUserId: number, targetUserId: number): Promise<BlockResult> {
  const target = Number(targetUserId);
  if (!Number.isSafeInteger(target) || target <= 0) {
    return { ok: false, status: 400, error: "invalid user id" };
  }
  try {
    await q`
      DELETE FROM blocks
      WHERE blocker_user_id = ${sessionUserId} AND blocked_user_id = ${target}
    `;
    writeAudit(sessionUserId, "user_unblocked", { target_user_id: target });
    return { ok: true, status: 200 };
  } catch (err) {
    console.error("[safety-core] unblockUser failed", err);
    return { ok: false, status: 503, error: "We couldn't unblock this user right now." };
  }
}

export interface UnmatchResult {
  ok: boolean;
  status: number;
  error?: string;
  unmatchedCount?: number;
}

/**
 * Unmatch: flip every ACTIVE canonical match between the two users' real dogs
 * to state='unmatched'. The messaging gate (genuineActiveMatchBetween) then
 * closes the conversation with ZERO rework. Intended to be irreversible from
 * the user side (there is no user-facing re-match; a new mutual swipe can
 * create a fresh match later).
 */
export async function unmatchUser(
  sessionUserId: number,
  sessionUserIsTest: boolean,
  targetUserId: number,
): Promise<UnmatchResult> {
  const target = Number(targetUserId);
  if (!Number.isSafeInteger(target) || target <= 0) {
    return { ok: false, status: 400, error: "invalid user id" };
  }
  if (target === sessionUserId) {
    return { ok: false, status: 400, error: "you cannot unmatch yourself" };
  }
  if (!(await realVisibleUser(target, sessionUserId, sessionUserIsTest))) {
    return { ok: false, status: 404, error: "user not found" };
  }
  try {
    const upd = await q`
      UPDATE matches m
      SET state = 'unmatched', unmatched_at = NOW()
      WHERE m.state = 'active'
        AND EXISTS (
          SELECT 1 FROM dog_profiles md
          WHERE (md.id = m.profile_id_1 OR md.id = m.profile_id_2)
            AND md.user_id = ${sessionUserId} AND md.is_demo = false AND md.source = ANY('{"user"}'::text[])
        )
        AND EXISTS (
          SELECT 1 FROM dog_profiles td
          WHERE (td.id = m.profile_id_1 OR td.id = m.profile_id_2)
            AND td.user_id = ${target} AND td.is_demo = false AND td.source = ANY('{"user"}'::text[])
        )
      RETURNING id
    `;
    writeAudit(sessionUserId, "match_unmatched", {
      target_user_id: target,
      matches: upd.length,
    });
    return { ok: true, status: 200, unmatchedCount: upd.length };
  } catch (err) {
    console.error("[safety-core] unmatchUser failed", err);
    return { ok: false, status: 503, error: "We couldn't close this match right now." };
  }
}

export interface RelationStatus {
  blockedByMe: boolean;
  blockedMe: boolean;
  matchState: "active" | "unmatched" | "none";
}

/**
 * Relation status between the session user and another user, for UI wiring
 * (block → show "unblock", etc.). Only disclosed when the two users actually
 * share a real relationship the session user can see (active match or
 * conversation membership or prior unmatch) — otherwise 404, no leak.
 */
export async function relationStatus(
  sessionUserId: number,
  sessionUserIsTest: boolean,
  otherUserId: number,
): Promise<{ ok: true; status: 200; rel: RelationStatus } | { ok: false; status: number; error: string }> {
  const other = Number(otherUserId);
  if (!Number.isSafeInteger(other) || other <= 0) {
    return { ok: false, status: 400, error: "invalid user id" };
  }
  // The relationship must exist for the status to be meaningful/visible.
  const rel = await q`
    SELECT 1
    FROM users u
    WHERE u.id = ${other}
      AND u.is_test = ${sessionUserIsTest}
      AND u.email_verified_at IS NOT NULL
      AND (
        EXISTS (
          SELECT 1 FROM conversation_participants cp
          WHERE cp.user_id = ${sessionUserId}
            AND cp.conversation_id IN (
              SELECT conversation_id FROM conversation_participants WHERE user_id = ${other}
            )
        )
        OR EXISTS (
          SELECT 1 FROM matches m
          JOIN dog_profiles d1 ON d1.id = m.profile_id_1
          JOIN dog_profiles d2 ON d2.id = m.profile_id_2
          WHERE ((d1.user_id = ${sessionUserId} AND d2.user_id = ${other})
              OR (d1.user_id = ${other} AND d2.user_id = ${sessionUserId}))
            AND d1.is_demo = false AND d1.source = ANY('{"user"}'::text[])
            AND d2.is_demo = false AND d2.source = ANY('{"user"}'::text[])
        )
      )
    LIMIT 1
  `;
  if (!rel.length) return { ok: false, status: 404, error: "no relationship with this user" };

  // Directional block state for the UI labels (blockedByMe vs blockedMe).
  const [b1] = await q`
    SELECT
      EXISTS (SELECT 1 FROM blocks WHERE blocker_user_id = ${sessionUserId} AND blocked_user_id = ${other}) AS by_me,
      EXISTS (SELECT 1 FROM blocks WHERE blocker_user_id = ${other} AND blocked_user_id = ${sessionUserId}) AS on_me
  `;
  const [m] = await q`
    SELECT m.state
    FROM matches m
    JOIN dog_profiles d1 ON d1.id = m.profile_id_1
    JOIN dog_profiles d2 ON d2.id = m.profile_id_2
    WHERE ((d1.user_id = ${sessionUserId} AND d2.user_id = ${other})
        OR (d1.user_id = ${other} AND d2.user_id = ${sessionUserId}))
      AND d1.is_demo = false AND d1.source = ANY('{"user"}'::text[])
      AND d2.is_demo = false AND d2.source = ANY('{"user"}'::text[])
    ORDER BY m.id DESC
    LIMIT 1
  `;
  return {
    ok: true,
    status: 200,
    rel: {
      blockedByMe: !!((b1 as any)?.by_me),
      blockedMe: !!((b1 as any)?.on_me),
      matchState: ((m as any)?.state as "active" | "unmatched") ?? "none",
    },
  };
}

// ── Admin: moderation queue + actions + audit trail ─────────────────────────

export interface AdminReportRow {
  id: number;
  reporter_user_id: number;
  reporter_name: string | null;
  reporter_email: string | null;
  target_type: string;
  target_id: number;
  target_summary: string | null;
  category: string;
  details: string | null;
  status: string;
  admin_action: string | null;
  created_at: string;
  resolved_at: string | null;
}

/** Open-first moderation queue with honest entity context (admin only). */
export async function adminListReports(): Promise<AdminReportRow[]> {
  const rows = await q`
    SELECT
      r.id, r.reporter_user_id, r.target_type, r.target_id, r.category,
      r.details, r.status, r.admin_action, r.created_at, r.resolved_at,
      u.name AS reporter_name, u.email AS reporter_email,
      CASE r.target_type
        WHEN 'user' THEN (
          SELECT tu.email FROM users tu WHERE tu.id = r.target_id
        )
        WHEN 'dog' THEN (
          SELECT td.dog_name || ' (' || tu.email || ')'
          FROM dog_profiles td JOIN users tu ON tu.id = td.user_id
          WHERE td.id = r.target_id
        )
        WHEN 'message' THEN (
          SELECT left(m.body, 80)
          FROM messages m WHERE m.id = r.target_id
        )
        WHEN 'provider' THEN (
          SELECT p.name FROM providers p WHERE p.id = r.target_id
        )
        ELSE NULL
      END AS target_summary
    FROM reports r
    LEFT JOIN users u ON u.id = r.reporter_user_id
    ORDER BY (r.status = 'open') DESC, r.id DESC
    LIMIT 500
  `;
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    reporter_user_id: Number(r.reporter_user_id),
    reporter_name: r.reporter_name ?? null,
    reporter_email: r.reporter_email ?? null,
    target_type: String(r.target_type),
    target_id: Number(r.target_id),
    target_summary: r.target_summary ?? null,
    category: String(r.category),
    details: r.details ?? null,
    status: String(r.status),
    admin_action: r.admin_action ?? null,
    created_at: String(r.created_at),
    resolved_at: r.resolved_at ? String(r.resolved_at) : null,
  }));
}

export interface AdminActionResult {
  ok: boolean;
  status: number;
  error?: string;
}

/**
 * Resolve / dismiss a report without punitive action. Honest statuses only:
 * 'resolved' = no action needed, 'dismissed' = spam/unfounded. Both are
 * recorded with the admin id and an optional note in the report row AND the
 * append-only audit trail.
 */
export async function adminResolveReport(
  adminUserId: number,
  reportId: number,
  outcome: string,
  note: string | null,
): Promise<AdminActionResult> {
  const rid = Number(reportId);
  if (!Number.isSafeInteger(rid) || rid <= 0) return { ok: false, status: 400, error: "invalid report id" };
  if (outcome !== "resolved" && outcome !== "dismissed") {
    return { ok: false, status: 400, error: "outcome must be 'resolved' or 'dismissed'" };
  }
  const cleanNote = String(note ?? "").trim().slice(0, 500) || null;
  try {
    const upd = await q`
      UPDATE reports
      SET status = ${outcome}, admin_user_id = ${adminUserId},
          admin_action = ${cleanNote}, resolved_at = NOW()
      WHERE id = ${rid} AND status IN ('open', 'reviewing')
      RETURNING id
    `;
    if (!upd.length) return { ok: false, status: 404, error: "report not found or already handled" };
    writeAudit(adminUserId, `report_${outcome}`, { report_id: rid, note: cleanNote });
    return { ok: true, status: 200 };
  } catch (err) {
    console.error("[safety-core] adminResolveReport failed", err);
    return { ok: false, status: 503, error: "We couldn't update this report right now." };
  }
}

/**
 * Resolve the target user of a report (user -> target_id, dog -> owner,
 * message -> sender, provider -> owner). Null when the target no longer
 * resolves (deleted) — actions that need a user then fail honestly.
 */
async function reportTargetUserId(reportId: number): Promise<number | null> {
  const [r] = await q`SELECT target_type, target_id FROM reports WHERE id = ${reportId}` as any;
  if (!r) return null;
  const tt = String(r.target_type);
  const tid = Number(r.target_id);
  if (tt === "user") return tid;
  if (tt === "dog") {
    const [d] = await q`SELECT user_id FROM dog_profiles WHERE id = ${tid}` as any;
    return d?.user_id != null ? Number(d.user_id) : null;
  }
  if (tt === "message") {
    const [m] = await q`SELECT sender_user_id FROM messages WHERE id = ${tid}` as any;
    return m?.sender_user_id != null ? Number(m.sender_user_id) : null;
  }
  if (tt === "provider") {
    const [p] = await q`SELECT owner_user_id FROM providers WHERE id = ${tid}` as any;
    return p?.owner_user_id != null ? Number(p.owner_user_id) : null;
  }
  return null;
}

/**
 * Apply a punitive admin action to the report's target, record it on the
 * report row (admin_action) and close the report. Every action maps to a real
 * DB state change (never cosmetic):
 *   warn_user       -> audit only (the warning IS the record)
 *   suspend_user    -> users.suspended_at/reason set, all sessions revoked
 *   reinstate_user  -> suspension cleared
 *   remove_message  -> messages.moderation_state='removed' (already filtered)
 *   unmatch         -> matches between reporter and target closed
 *   block_user      -> blocks row inserted (reporter blocks target)
 */
export async function adminActOnReport(
  adminUserId: number,
  reportId: number,
  action: string,
  note: string | null,
): Promise<AdminActionResult> {
  const rid = Number(reportId);
  if (!Number.isSafeInteger(rid) || rid <= 0) return { ok: false, status: 400, error: "invalid report id" };
  if (!(ADMIN_ACTIONS as readonly string[]).includes(action)) {
    return { ok: false, status: 400, error: "invalid admin action" };
  }
  const cleanNote = String(note ?? "").trim().slice(0, 500) || null;

  const [report] = await q`SELECT reporter_user_id, status FROM reports WHERE id = ${rid}` as any;
  if (!report) return { ok: false, status: 404, error: "report not found" };
  if (report.status !== "open" && report.status !== "reviewing") {
    return { ok: false, status: 409, error: "report already handled" };
  }
  const reporterUserId = Number(report.reporter_user_id);

  try {
    if (action === "remove_message") {
      const [r] = await q`SELECT target_type, target_id FROM reports WHERE id = ${rid}` as any;
      if (String(r.target_type) !== "message") {
        return { ok: false, status: 400, error: "remove_message requires a message report" };
      }
      await q`UPDATE messages SET moderation_state = 'removed' WHERE id = ${Number(r.target_id)}`;
    } else {
      const targetUserId = await reportTargetUserId(rid);
      if (action === "suspend_user" || action === "warn_user" || action === "unmatch" || action === "block_user") {
        if (targetUserId === null) return { ok: false, status: 404, error: "report target user no longer exists" };
      }
      if (action === "suspend_user") {
        await q`UPDATE users SET suspended_at = NOW(), suspended_reason = ${cleanNote ?? "suspended by moderator"} WHERE id = ${targetUserId}`;
        await revokeAllSessions(targetUserId!);
      } else if (action === "reinstate_user") {
        await q`UPDATE users SET suspended_at = NULL, suspended_reason = NULL WHERE id = ${targetUserId}`;
      } else if (action === "unmatch") {
        await q`
          UPDATE matches m
          SET state = 'unmatched', unmatched_at = NOW()
          WHERE m.state = 'active'
            AND EXISTS (SELECT 1 FROM dog_profiles md WHERE (md.id = m.profile_id_1 OR md.id = m.profile_id_2) AND md.user_id = ${reporterUserId})
            AND EXISTS (SELECT 1 FROM dog_profiles td WHERE (td.id = m.profile_id_1 OR td.id = m.profile_id_2) AND td.user_id = ${targetUserId})
        `;
      } else if (action === "block_user") {
        await q`
          INSERT INTO blocks (blocker_user_id, blocked_user_id)
          VALUES (${reporterUserId}, ${targetUserId})
          ON CONFLICT (blocker_user_id, blocked_user_id) DO NOTHING
        `;
      }
      // warn_user: no state change beyond the audit trail — the warning IS the record.
    }

    await q`
      UPDATE reports
      SET status = 'resolved', admin_user_id = ${adminUserId},
          admin_action = ${action + (cleanNote ? ` — ${cleanNote}` : "")}, resolved_at = NOW()
      WHERE id = ${rid}
    `;
    writeAudit(adminUserId, `admin_action_${action}`, { report_id: rid, note: cleanNote });
    return { ok: true, status: 200 };
  } catch (err) {
    console.error("[safety-core] adminActOnReport failed", err);
    return { ok: false, status: 503, error: "We couldn't apply this action right now." };
  }
}

export interface AuditRow {
  id: number;
  user_id: number | null;
  actor_email: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

/** Append-only audit trail view (admin only). Immutable: never updated/deleted. */
export async function adminAuditLog(): Promise<AuditRow[]> {
  const rows = await q`
    SELECT a.id, a.user_id, a.action, a.details, a.created_at, u.email AS actor_email
    FROM audit_log a
    LEFT JOIN users u ON u.id = a.user_id
    ORDER BY a.id DESC
    LIMIT 200
  `;
  return (rows as any[]).map((r) => ({
    id: Number(r.id),
    user_id: r.user_id === null || r.user_id === undefined ? null : Number(r.user_id),
    actor_email: r.actor_email ?? null,
    action: String(r.action),
    details: r.details ? JSON.parse(JSON.stringify(r.details)) : null,
    created_at: String(r.created_at),
  }));
}
