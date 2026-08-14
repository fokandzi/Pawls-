/**
 * Messaging — server-only core (Pawls Phase-1, owner directive rev 14 §7; the
 * Messaging phase after Real Match acceptance). Mirrors match-core.ts:
 * everything runs server-side, identity ALWAYS comes from the session, and
 * conversation access derives ONLY from authenticated membership in
 * `conversation_participants` — never from sender_id/user_id/ownership/role
 * supplied by the browser.
 *
 * Schema: migration 002 already provides `conversations`,
 * `conversation_participants` and `messages` — this phase reuses them as-is
 * (no migration 004 needed). Unread/read state is derived from
 * `messages.read_at` (NULL = unread for the other party); opening a
 * conversation marks the counterpart's messages read via a dedicated POST
 * (GETs never mutate).
 *
 * SAFETY HANDOFF: the two gates below — participantConversation() and
 * blockedBetween() — are the single choke points the Safety phase extends
 * (block/unmatch/moderation) WITHOUT reworking the data flow. If a block
 * row exists, conversations are already inert today (hidden from lists,
 * 404 on view, 403 on send); the Safety phase only needs to add the admin/UI
 * that CREATES block rows.
 *
 * NOTIFICATIONS BOUNDARY: onMessageEvent() is the single hook point the
 * Notifications phase attaches to (message.created / conversation.read).
 * Currently inert — never throws into the message path.
 *
 * UNKNOWN rule (owner, 2026-08-12): demo / seed / UNKNOWN-source dogs and
 * users are excluded exactly like match-core (is_demo=false, source='user').
 * A conversation can only be created on top of a genuine active match
 * between two REAL dogs — so demo entities can never participate.
 */
import { sql } from "../db";

const q = sql();

export const MESSAGE_MAX_LENGTH = 4000;

export interface ConversationSummary {
  id: number;
  other_user_id: number;
  other_dog_id: number | null;
  dog_name: string | null;
  breed: string | null;
  photo_url: string | null;
  location: string | null;
  city: string | null;
  owner_name: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_user_id: number | null;
  unread_count: number;
}

export interface MessageRow {
  id: number;
  conversation_id: number;
  sender_user_id: number;
  sender_profile_id: number | null;
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface ConversationView {
  id: number;
  other_user_id: number;
  other_dog_id: number | null;
  dog_name: string | null;
  breed: string | null;
  photo_url: string | null;
  location: string | null;
  city: string | null;
  owner_name: string | null;
  created_at: string;
  last_message_at: string | null;
}

export interface StartConversationResult {
  ok: boolean;
  status: number;
  error?: string;
  conversationId?: number;
}

export interface SendMessageResult {
  ok: boolean;
  status: number;
  error?: string;
  message?: MessageRow;
}

// ── Notifications boundary (inert until the Notifications phase) ──────────────
export type MessageEvent =
  | {
      type: "message.created";
      conversationId: number;
      messageId: number;
      senderUserId: number;
      recipientUserId: number;
      body: string;
    }
  | { type: "conversation.read"; conversationId: number; readerUserId: number; markedReadCount: number };

type MessageEventSink = (event: MessageEvent) => void;

let messageEventSink: MessageEventSink | null = null;

/** Notifications phase calls this once at boot to receive message events. */
export function onMessageEvent(sink: MessageEventSink): void {
  messageEventSink = sink;
}

function emit(event: MessageEvent): void {
  try {
    messageEventSink?.(event);
  } catch (err) {
    // The message path must never break because a notification listener threw.
    console.error("[message-core] event sink failed", err);
  }
}

// ── Authz gates (the ONLY places conversation access is decided) ──────────────
// Safety phase extends these; nothing else should re-derive access.

/** True when a block row exists between the two users (either direction). */
export async function blockedBetween(a: number, b: number): Promise<boolean> {
  const rows = await q`
    SELECT 1 FROM blocks
    WHERE (blocker_user_id = ${a} AND blocked_user_id = ${b})
       OR (blocker_user_id = ${b} AND blocked_user_id = ${a})
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * Membership gate: returns the conversation row ONLY if userId is an
 * authenticated participant. This is the single source of truth for "can
 * this user see/send in this conversation" — no other query path exists.
 */
async function participantConversation(conversationId: number, userId: number): Promise<{ id: number; created_at: string; last_message_at: string | null } | null> {
  const rows = await q`
    SELECT c.id, c.created_at, c.last_message_at
    FROM conversations c
    JOIN conversation_participants cp ON cp.conversation_id = c.id AND cp.user_id = ${userId}
    WHERE c.id = ${conversationId}
    LIMIT 1
  `;
  if (!rows.length) return null;
  const r = rows[0] as any;
  return {
    id: Number(r.id),
    created_at: String(r.created_at),
    last_message_at: r.last_message_at ? String(r.last_message_at) : null,
  };
}

/** Other participant of a conversation (caller must have passed the gate). */
async function otherParticipant(conversationId: number, userId: number): Promise<number | null> {
  const rows = await q`
    SELECT cp.user_id FROM conversation_participants cp
    WHERE cp.conversation_id = ${conversationId} AND cp.user_id <> ${userId}
    LIMIT 1
  `;
  return rows.length ? Number((rows[0] as any).user_id) : null;
}

/**
 * A genuine ACTIVE match between two REAL dogs (is_demo=false, source='user')
 * must still exist for the pair — mirrors matchesForUser visibility exactly.
 * This is what makes Safety's future "unmatch" (matches.state='unmatched')
 * kill conversation access with ZERO rework: flip the state, the gate closes.
 */
export async function genuineActiveMatchBetween(a: number, b: number): Promise<boolean> {
  const rows = await q`
    SELECT m.id
    FROM matches m
    JOIN dog_profiles dp1 ON dp1.id = m.profile_id_1
    JOIN dog_profiles dp2 ON dp2.id = m.profile_id_2
    WHERE m.state = 'active'
      AND dp1.is_demo = false AND dp1.source = ANY('{"user"}'::text[])
      AND dp2.is_demo = false AND dp2.source = ANY('{"user"}'::text[])
      AND ((dp1.user_id = ${a} AND dp2.user_id = ${b})
        OR (dp1.user_id = ${b} AND dp2.user_id = ${a}))
    LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * THE single conversation-access gate. Every message entry point (start, list,
 * view, send, mark-read) goes through this: membership in
 * conversation_participants AND no block row AND a live genuine match.
 * Returns null for ANY denial → callers respond 404 (uniform, no existence
 * leak). Safety extends by adding block rows or flipping match state.
 */
async function conversationAccess(conversationId: number, userId: number): Promise<{ conv: { id: number; created_at: string; last_message_at: string | null }; otherId: number } | null> {
  const conv = await participantConversation(conversationId, userId);
  if (!conv) return null;
  const otherId = await otherParticipant(conversationId, userId);
  if (otherId === null) return null;
  if (await blockedBetween(userId, otherId)) return null;
  if (!(await genuineActiveMatchBetween(userId, otherId))) return null;
  return { conv, otherId };
}

// ── Conversation lifecycle ────────────────────────────────────────────────────

/**
 * Get-or-create the 1:1 conversation between the session user and otherUserId.
 * Creation is ONLY possible on top of a genuine active match between two REAL
 * dogs (is_demo=false, source='user'), same is_test parity, both users
 * email-verified, and no block row. Every denial returns 404 "no match" —
 * uniform, so outsiders cannot distinguish "user doesn't exist" from
 * "user exists but we're not matched".
 */
export async function getOrCreateConversation(sessionUserId: number, sessionUserIsTest: boolean, otherUserId: number): Promise<StartConversationResult> {
  const otherId = Number(otherUserId);
  if (!Number.isSafeInteger(otherId) || otherId <= 0) {
    return { ok: false, status: 400, error: "invalid user id" };
  }
  if (otherId === sessionUserId) {
    return { ok: false, status: 400, error: "you cannot message yourself" };
  }

  // Other user must exist, be email-verified, and share the session's test parity.
  const otherRows = await q`
    SELECT id, is_test, email_verified_at FROM users WHERE id = ${otherId}
  `;
  if (!otherRows.length) return { ok: false, status: 404, error: "no match" };
  const other = otherRows[0] as any;
  if (!!other.is_test !== sessionUserIsTest) return { ok: false, status: 404, error: "no match" };
  if (!other.email_verified_at) return { ok: false, status: 404, error: "no match" };

  // A genuine active match between two REAL dogs must exist.
  if (!(await genuineActiveMatchBetween(sessionUserId, otherId))) {
    return { ok: false, status: 404, error: "no match" };
  }

  if (await blockedBetween(sessionUserId, otherId)) {
    return { ok: false, status: 403, error: "this conversation is not available" };
  }

  // Existing conversation between the pair (either direction), else create
  // atomically (race-safe: the anti-join guard prevents duplicate pairs).
  const existing = await q`
    SELECT cp1.conversation_id
    FROM conversation_participants cp1
    JOIN conversation_participants cp2 ON cp2.conversation_id = cp1.conversation_id
    WHERE cp1.user_id = ${sessionUserId} AND cp2.user_id = ${otherId}
    LIMIT 1
  `;
  if (existing.length) {
    return { ok: true, status: 200, conversationId: Number((existing[0] as any).conversation_id) };
  }

  const created = await q`
    WITH conv AS (
      INSERT INTO conversations (created_at)
      SELECT NOW()
      WHERE NOT EXISTS (
        SELECT 1 FROM conversation_participants x1
        JOIN conversation_participants x2 ON x2.conversation_id = x1.conversation_id
        WHERE x1.user_id = ${sessionUserId} AND x2.user_id = ${otherId}
      )
      RETURNING id
    )
    INSERT INTO conversation_participants (conversation_id, user_id)
    SELECT conv.id, v.user_id FROM conv
    CROSS JOIN (VALUES (${sessionUserId}::integer), (${otherId}::integer)) AS v(user_id)
    RETURNING conversation_id
  `;
  if (!created.length) {
    // Lost a race — re-read.
    const again = await q`
      SELECT cp1.conversation_id
      FROM conversation_participants cp1
      JOIN conversation_participants cp2 ON cp2.conversation_id = cp1.conversation_id
      WHERE cp1.user_id = ${sessionUserId} AND cp2.user_id = ${otherId}
      LIMIT 1
    `;
    if (!again.length) return { ok: false, status: 500, error: "could not create conversation" };
    return { ok: true, status: 200, conversationId: Number((again[0] as any).conversation_id) };
  }
  return { ok: true, status: 200, conversationId: Number((created[0] as any).conversation_id) };
}

/** Conversations visible to the session user, newest activity first. */
export async function conversationsForUser(sessionUserId: number, sessionUserIsTest: boolean): Promise<ConversationSummary[]> {
  const rows = await q`
    SELECT
      c.id AS cid,
      c.last_message_at,
      u.id AS other_user_id,
      u.name AS owner_name,
      d.id AS dog_id,
      d.dog_name,
      d.breed,
      d.photo_url,
      d.location,
      d.city,
      lm.id AS last_msg_id,
      lm.body AS last_body,
      lm.sender_user_id AS last_sender,
      lm.created_at AS last_at,
      (SELECT count(*)::int FROM messages m
        WHERE m.conversation_id = c.id AND m.sender_user_id = u.id
          AND m.read_at IS NULL AND m.deleted_at IS NULL AND m.moderation_state = 'visible'
      ) AS unread
    FROM conversations c
    JOIN conversation_participants me ON me.conversation_id = c.id AND me.user_id = ${sessionUserId}
    JOIN conversation_participants other_p ON other_p.conversation_id = c.id AND other_p.user_id <> ${sessionUserId}
    JOIN users u ON u.id = other_p.user_id
    LEFT JOIN LATERAL (
      SELECT id, body, sender_user_id, created_at FROM messages
      WHERE conversation_id = c.id AND deleted_at IS NULL AND moderation_state = 'visible'
      ORDER BY id DESC LIMIT 1
    ) lm ON true
    LEFT JOIN LATERAL (
      SELECT id, dog_name, breed, photo_url, location, city FROM dog_profiles
      WHERE user_id = u.id AND is_demo = false AND source = ANY('{"user"}'::text[])
      ORDER BY id ASC LIMIT 1
    ) d ON true
    WHERE u.is_test = ${sessionUserIsTest}
      AND NOT EXISTS (
        SELECT 1 FROM blocks b
        WHERE (b.blocker_user_id = ${sessionUserId} AND b.blocked_user_id = u.id)
           OR (b.blocker_user_id = u.id AND b.blocked_user_id = ${sessionUserId})
      )
      AND EXISTS (
        SELECT 1 FROM matches gm
        JOIN dog_profiles gx1 ON gx1.id = gm.profile_id_1
        JOIN dog_profiles gx2 ON gx2.id = gm.profile_id_2
        WHERE gm.state = 'active'
          AND gx1.is_demo = false AND gx1.source = ANY('{"user"}'::text[])
          AND gx2.is_demo = false AND gx2.source = ANY('{"user"}'::text[])
          AND ((gx1.user_id = ${sessionUserId} AND gx2.user_id = u.id)
            OR (gx1.user_id = u.id AND gx2.user_id = ${sessionUserId}))
      )
    ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
  `;
  return (rows as any[]).map((r) => ({
    id: Number(r.cid),
    other_user_id: Number(r.other_user_id),
    other_dog_id: r.dog_id === null || r.dog_id === undefined ? null : Number(r.dog_id),
    dog_name: r.dog_name ?? null,
    breed: r.breed ?? null,
    photo_url: r.photo_url ?? null,
    location: r.location ?? null,
    city: r.city ?? null,
    owner_name: r.owner_name ?? null,
    last_message: r.last_body ?? null,
    last_message_at: r.last_at ? String(r.last_at) : null,
    last_sender_user_id: r.last_sender === null || r.last_sender === undefined ? null : Number(r.last_sender),
    unread_count: Number(r.unread ?? 0),
  }));
}

/**
 * View one conversation (metadata + messages) for the session user.
 * Returns null when the user is not a participant, the conversation doesn't
 * exist, or a block row is present — the caller maps null to 404. GETs do NOT
 * mutate: read-state changes only happen via markConversationRead().
 */
export async function conversationView(sessionUserId: number, conversationId: number): Promise<{ conversation: ConversationView; messages: MessageRow[] } | null> {
  const access = await conversationAccess(conversationId, sessionUserId);
  if (!access) return null;
  const { conv, otherId } = access;

  const rows = await q`
    SELECT
      u.id AS other_user_id,
      u.name AS owner_name,
      d.id AS dog_id,
      d.dog_name,
      d.breed,
      d.photo_url,
      d.location,
      d.city
    FROM users u
    LEFT JOIN LATERAL (
      SELECT id, dog_name, breed, photo_url, location, city FROM dog_profiles
      WHERE user_id = u.id AND is_demo = false AND source = ANY('{"user"}'::text[])
      ORDER BY id ASC LIMIT 1
    ) d ON true
    WHERE u.id = ${otherId}
  `;
  const info = (rows[0] ?? {}) as any;

  const msgs = await q`
    SELECT id, conversation_id, sender_user_id, sender_profile_id, body, created_at, read_at
    FROM messages
    WHERE conversation_id = ${conversationId} AND deleted_at IS NULL AND moderation_state = 'visible'
    ORDER BY id ASC
  `;

  return {
    conversation: {
      id: conv.id,
      other_user_id: otherId,
      other_dog_id: info.dog_id === null || info.dog_id === undefined ? null : Number(info.dog_id),
      dog_name: info.dog_name ?? null,
      breed: info.breed ?? null,
      photo_url: info.photo_url ?? null,
      location: info.location ?? null,
      city: info.city ?? null,
      owner_name: info.owner_name ?? null,
      created_at: conv.created_at,
      last_message_at: conv.last_message_at,
    },
    messages: (msgs as any[]).map((r) => ({
      id: Number(r.id),
      conversation_id: Number(r.conversation_id),
      sender_user_id: Number(r.sender_user_id),
      sender_profile_id: r.sender_profile_id === null || r.sender_profile_id === undefined ? null : Number(r.sender_profile_id),
      body: String(r.body),
      created_at: String(r.created_at),
      read_at: r.read_at ? String(r.read_at) : null,
    })),
  };
}

/**
 * Send a message as the SESSION user. sender_user_id is ALWAYS the session
 * identity — any sender id supplied by the client is ignored. An optional
 * senderProfileId is honored only when it is one of the session user's own
 * dogs (context for the message, never an identity claim).
 */
export async function sendMessage(sessionUserId: number, conversationId: number, rawBody: unknown, rawSenderProfileId?: unknown): Promise<SendMessageResult> {
  const access = await conversationAccess(conversationId, sessionUserId);
  if (!access) return { ok: false, status: 404, error: "conversation not found" };
  const { otherId } = access;

  const body = String(rawBody ?? "").trim();
  if (body.length === 0 || body.length > MESSAGE_MAX_LENGTH) {
    return { ok: false, status: 400, error: `message must be 1-${MESSAGE_MAX_LENGTH} characters` };
  }

  // sender_profile_id is optional dog context; must be one of the session
  // user's own dogs or it is dropped (NULL). Never an identity claim.
  let senderProfileId: number | null = null;
  const pid = Number(rawSenderProfileId);
  if (Number.isSafeInteger(pid) && pid > 0) {
    const owned = await q`SELECT id FROM dog_profiles WHERE id = ${pid} AND user_id = ${sessionUserId} LIMIT 1`;
    if (owned.length) senderProfileId = pid;
  }

  const ins = await q`
    WITH ins AS (
      INSERT INTO messages (conversation_id, sender_user_id, sender_profile_id, body)
      VALUES (${conversationId}, ${sessionUserId}, ${senderProfileId}, ${body})
      RETURNING id
    )
    UPDATE conversations c
    SET last_message_at = NOW(), updated_at = NOW()
    WHERE c.id = ${conversationId}
    RETURNING c.id, (SELECT ins.id FROM ins) AS new_message_id
  `;
  if (!ins.length) return { ok: false, status: 500, error: "could not save message" };
  const newId = Number((ins[0] as any).new_message_id);

  const [msgRow] = await q`
    SELECT id, conversation_id, sender_user_id, sender_profile_id, body, created_at, read_at
    FROM messages WHERE id = ${newId}
  `;
  const message: MessageRow = {
    id: Number(msgRow.id),
    conversation_id: Number(msgRow.conversation_id),
    sender_user_id: Number(msgRow.sender_user_id),
    sender_profile_id: msgRow.sender_profile_id === null || msgRow.sender_profile_id === undefined ? null : Number(msgRow.sender_profile_id),
    body: String(msgRow.body),
    created_at: String(msgRow.created_at),
    read_at: msgRow.read_at ? String(msgRow.read_at) : null,
  };

  // Notifications boundary — single hook point for new-message delivery.
  emit({ type: "message.created", conversationId, messageId: message.id, senderUserId: sessionUserId, recipientUserId: otherId, body });

  return { ok: true, status: 200, message };
}

/**
 * Mark the counterpart's messages as read (called by POST, never by GET).
 * Returns the number of messages transitioned; emits the read-state event
 * for the Notifications boundary.
 */
export async function markConversationRead(sessionUserId: number, conversationId: number): Promise<{ ok: boolean; status: number; error?: string; readCount?: number }> {
  const access = await conversationAccess(conversationId, sessionUserId);
  if (!access) return { ok: false, status: 404, error: "conversation not found" };
  const { otherId } = access;
  const upd = await q`
    UPDATE messages SET read_at = NOW()
    WHERE conversation_id = ${conversationId}
      AND sender_user_id <> ${sessionUserId}
      AND read_at IS NULL AND deleted_at IS NULL AND moderation_state = 'visible'
    RETURNING id
  `;
  const readCount = upd.length;
  if (readCount > 0) {
    emit({ type: "conversation.read", conversationId, readerUserId: sessionUserId, markedReadCount: readCount });
  }
  return { ok: true, status: 200, readCount };
}
