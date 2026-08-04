import { createServerFn } from "@tanstack/react-start";
import { sql } from "../db";
import { createMessagesTable, createMatchTables } from "./schema";

export const sendMessage = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null) throw new Error("Invalid data");
    const d = data as Record<string, unknown>;
    if (!d.matchId || !d.senderProfileId || !d.message) {
      throw new Error("matchId, senderProfileId, and message are required");
    }
    const msg = String(d.message).trim();
    if (msg.length === 0) throw new Error("Message cannot be empty");
    return {
      matchId: d.matchId as number,
      senderProfileId: d.senderProfileId as number,
      message: msg,
    };
  })
  .handler(async ({ data }) => {
    await createMessagesTable();
    await createMatchTables();

    // Verify the sender is one of the two matched profiles
    const [match] = await sql()`
      SELECT profile_id_1, profile_id_2 FROM matches WHERE id = ${data.matchId}
    `;
    if (!match) throw new Error("Match not found");

    const p1 = (match as any).profile_id_1 as number;
    const p2 = (match as any).profile_id_2 as number;

    if (data.senderProfileId !== p1 && data.senderProfileId !== p2) {
      throw new Error("You are not part of this match");
    }

    const [row] = await sql()`
      INSERT INTO messages (match_id, sender_profile_id, message)
      VALUES (${data.matchId}, ${data.senderProfileId}, ${data.message})
      RETURNING id, match_id, sender_profile_id, message, created_at
    `;

    return {
      id: (row as any).id,
      matchId: (row as any).match_id,
      senderProfileId: (row as any).sender_profile_id,
      message: (row as any).message,
      createdAt: String((row as any).created_at),
    };
  });

export const getMessages = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null || !("matchId" in data)) {
      throw new Error("matchId is required");
    }
    return { matchId: (data as { matchId: number }).matchId };
  })
  .handler(async ({ data }) => {
    await createMessagesTable();

    const rows = await sql()`
      SELECT id, match_id, sender_profile_id, message, created_at
      FROM messages
      WHERE match_id = ${data.matchId}
      ORDER BY created_at ASC
    `;

    return (rows as any[]).map((r) => ({
      id: r.id,
      matchId: r.match_id,
      senderProfileId: r.sender_profile_id,
      message: r.message,
      createdAt: String(r.created_at),
    }));
  });
