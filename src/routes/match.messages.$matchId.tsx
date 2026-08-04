import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { sql } from "../db";
import { createMatchTables } from "../db/schema";
import { sendMessage, getMessages } from "../db/messages";

// ── Get match details ──────────────────────────────────────────────────────────

const getMatchDetails = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    if (typeof data !== "object" || data === null || !("matchId" in data)) {
      throw new Error("matchId is required");
    }
    return { matchId: (data as { matchId: number }).matchId };
  })
  .handler(async ({ data }) => {
    await createMatchTables();

    const [match] = await sql()`
      SELECT
        m.id,
        m.profile_id_1,
        m.profile_id_2,
        dp1.dog_name AS dog1_name,
        dp1.breed AS dog1_breed,
        dp1.size AS dog1_size,
        dp2.dog_name AS dog2_name,
        dp2.breed AS dog2_breed,
        dp2.size AS dog2_size
      FROM matches m
      JOIN dog_profiles dp1 ON m.profile_id_1 = dp1.id
      JOIN dog_profiles dp2 ON m.profile_id_2 = dp2.id
      WHERE m.id = ${data.matchId}
    `;

    if (!match) throw new Error("Match not found");

    const m = match as any;
    return {
      id: m.id,
      profileId1: m.profile_id_1,
      profileId2: m.profile_id_2,
      dog1Name: m.dog1_name,
      dog1Breed: m.dog1_breed,
      dog1Size: m.dog1_size,
      dog2Name: m.dog2_name,
      dog2Breed: m.dog2_breed,
      dog2Size: m.dog2_size,
    };
  });

// ── Types ──────────────────────────────────────────────────────────────────────

type MatchDetails = {
  id: number;
  profileId1: number;
  profileId2: number;
  dog1Name: string;
  dog1Breed: string;
  dog1Size: string;
  dog2Name: string;
  dog2Breed: string;
  dog2Size: string;
};

type Message = {
  id: number;
  matchId: number;
  senderProfileId: number;
  message: string;
  createdAt: string;
};

const sizeEmoji: Record<string, string> = {
  small: "",
  medium: "",
  large: "",
};

// ── Route ──────────────────────────────────────────────────────────────────────

import { seoHead } from "../lib/seo";

export const Route = createFileRoute("/match/messages/$matchId")({
  head: () => seoHead({ title: "Messages — Pawls", description: "Chat with your dog's playdate match on Pawls.", path: "/match/messages", noIndex: true }),
  component: ChatPage,
});

function ChatPage() {
  const { matchId } = Route.useParams();
  const matchIdNum = parseInt(matchId, 10);

  const [profileId, setProfileId] = useState<number | null>(null);
  const [isPlus, setIsPlus] = useState(false);
  const [match, setMatch] = useState<MatchDetails | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load profile ID and Plus status from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("pawnder-profile-id");
      if (stored) {
        const id = parseInt(stored, 10);
        if (!isNaN(id)) setProfileId(id);
      }
      if (localStorage.getItem("pawnder-plus") === "true") setIsPlus(true);
    }
  }, []);

  // Load match details
  useEffect(() => {
    if (isNaN(matchIdNum)) {
      setError("Invalid match ID");
      setLoading(false);
      return;
    }

    getMatchDetails({ data: { matchId: matchIdNum } })
      .then((m) => {
        setMatch(m);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load match");
        setLoading(false);
      });
  }, [matchIdNum]);

  // Load messages and start polling
  const fetchMessages = useCallback(() => {
    if (isNaN(matchIdNum)) return;

    getMessages({ data: { matchId: matchIdNum } })
      .then((msgs) => setMessages(msgs))
      .catch(() => {
        // silently ignore polling errors
      });
  }, [matchIdNum]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 3000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profileId || !newMsg.trim() || sending || !isPlus) return;

    setSending(true);
    try {
      await sendMessage({
        data: {
          matchId: matchIdNum,
          senderProfileId: profileId,
          message: newMsg.trim(),
        },
      });
      setNewMsg("");
      // Refresh immediately
      await fetchMessages();
      inputRef.current?.focus();
    } catch (err: any) {
      // silently handle
    } finally {
      setSending(false);
    }
  };

  // ── Determine other dog ──────────────────────────────────────────────────────

  const otherDog = match && profileId
    ? match.profileId1 === profileId
      ? { name: match.dog2Name, breed: match.dog2Breed, size: match.dog2Size }
      : match.profileId2 === profileId
        ? { name: match.dog1Name, breed: match.dog1Breed, size: match.dog1Size }
        : null
    : null;

  // Is this profile part of the match?
  const isPartOfMatch = match && profileId
    ? (match.profileId1 === profileId || match.profileId2 === profileId)
    : false;

  // ── Loading ──────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
        <div className="text-center">
          <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-[var(--pawls-cream-200)] border-t-[var(--pawls-terracotta-500)]" />
          <p className="text-gray-600">Loading chat...</p>
        </div>
      </section>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────────

  if (error || !match) {
    return (
      <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
        <div className="max-w-sm text-center">
          <span className="text-5xl"></span>
          <h2 className="mt-4 text-xl font-bold text-gray-900">
            {error || "Match not found"}
          </h2>
          <Link
            to="/match/matches"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
          >
            ← Back to Matches
          </Link>
        </div>
      </section>
    );
  }

  // ── No profile ───────────────────────────────────────────────────────────────

  if (!profileId) {
    return (
      <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
        <div className="max-w-sm text-center">
          <span className="text-5xl"></span>
          <h2 className="mt-4 text-xl font-bold text-gray-900">No profile set</h2>
          <p className="mt-2 text-gray-600">
            Create your dog's profile to start chatting.
          </p>
          <Link
            to="/match/create"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
          >
             Create Profile
          </Link>
        </div>
      </section>
    );
  }

  // ── Not part of match ────────────────────────────────────────────────────────

  if (!isPartOfMatch) {
    return (
      <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
        <div className="max-w-sm text-center">
          <span className="text-5xl"></span>
          <h2 className="mt-4 text-xl font-bold text-gray-900">Not your match</h2>
          <p className="mt-2 text-gray-600">
            You are not part of this match.
          </p>
          <Link
            to="/match/matches"
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)]"
          >
            ← Back to Matches
          </Link>
        </div>
      </section>
    );
  }

  // ── Not Plus ─────────────────────────────────────────────────────────────────

  if (!isPlus) {
    return (
      <>
        <AppHeader active="match" />
      <section className="flex flex-1 flex-col bg-gradient-to-b from-[var(--pawls-cream-50)] to-white">
        {/* Chat header */}
        <div className="flex items-center gap-4 border-b border-[var(--pawls-cream-100)] bg-white px-6 py-4">
          <Link
            to="/match/matches"
            className="flex-shrink-0 text-[var(--pawls-terracotta-500)] transition-colors hover:text-[var(--pawls-terracotta-700)]"
          >
            ← Back
          </Link>
          {otherDog && (
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--pawls-cream-100)]">
                <img
                  src={`/dogs/${otherDog.name.toLowerCase()}.jpg`}
                  alt={otherDog.name}
                  className="h-full w-full rounded-full object-cover"
                  onError={(e) => {
                    const img = e.target as HTMLImageElement;
                    img.style.display = "none";
                    const fb = img.parentElement?.querySelector(".emoji-fallback");
                    if (fb) fb.classList.remove("hidden");
                  }}
                />
                <span className="emoji-fallback hidden text-xl">
                  {sizeEmoji[otherDog.size] ?? ""}
                </span>
              </div>
              <div>
                <h3 className="font-bold text-gray-900">{otherDog.name}</h3>
                <p className="text-xs text-gray-500">{otherDog.breed}</p>
              </div>
            </div>
          )}
        </div>

        {/* Plus gate message */}
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-12">
          <div className="max-w-sm text-center">
            <span className="text-6xl"></span>
            <h2 className="mt-4 text-2xl font-bold text-gray-900">
              Pawls Plus Required
            </h2>
            <p className="mt-2 text-gray-600">
              Messaging is a premium feature. Upgrade to Pawls Plus to chat with{" "}
              {otherDog ? <strong>{otherDog.name}</strong> : "your match"}!
            </p>
            <Link
              to="/plus"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[var(--pawls-gold-400)] to-[var(--pawls-terracotta-500)] px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-[var(--pawls-cream-50)]0/25 transition-all hover:from-[var(--pawls-cream-50)]0 hover:to-[var(--pawls-terracotta-700)]"
            >
               Get Pawls Plus — €8/mo
            </Link>
            <Link
              to="/match/matches"
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-gray-400 transition-colors hover:text-gray-600"
            >
              ← Back to Matches
            </Link>
          </div>
        </div>
      </section>
        <AppFooter />
      </>
    );
  }

  // ── Chat UI ──────────────────────────────────────────────────────────────────

  return (
    <>
      <AppHeader active="match" />
      <section className="flex flex-1 flex-col bg-gradient-to-b from-[var(--pawls-cream-50)] to-white">
      {/* Chat header */}
      <div className="flex items-center gap-4 border-b border-[var(--pawls-cream-100)] bg-white px-6 py-4">
        <Link
          to="/match/matches"
          className="flex-shrink-0 text-[var(--pawls-terracotta-500)] transition-colors hover:text-[var(--pawls-terracotta-700)]"
        >
          ← Back
        </Link>
        {otherDog && (
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--pawls-cream-100)]">
              <img
                src={`/dogs/${otherDog.name.toLowerCase()}.jpg`}
                alt={otherDog.name}
                className="h-full w-full rounded-full object-cover"
                onError={(e) => {
                  const img = e.target as HTMLImageElement;
                  img.style.display = "none";
                  const fb = img.parentElement?.querySelector(".emoji-fallback");
                  if (fb) fb.classList.remove("hidden");
                }}
              />
              <span className="emoji-fallback hidden text-xl">
                {sizeEmoji[otherDog.size] ?? ""}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-gray-900">{otherDog.name}</h3>
              <p className="text-xs text-gray-500">{otherDog.breed}</p>
            </div>
          </div>
        )}
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[var(--pawls-gold-400)] to-[var(--pawls-terracotta-500)] px-2.5 py-0.5 text-xs font-semibold text-white">
           Plus
        </span>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <span className="text-5xl"></span>
              <p className="mt-3 text-gray-500">No messages yet — say hello!</p>
            </div>
          </div>
        ) : (
          <div className="mx-auto flex max-w-lg flex-col gap-3">
            {messages.map((msg) => {
              const isMine = msg.senderProfileId === profileId;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${
                      isMine
                        ? "rounded-br-md bg-[var(--pawls-terracotta-500)] text-white"
                        : "rounded-bl-md border border-[var(--pawls-cream-100)] bg-white text-gray-800"
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{msg.message}</p>
                    <p
                      className={`mt-1 text-right text-[10px] ${
                        isMine ? "text-[var(--pawls-cream-200)]" : "text-gray-400"
                      }`}
                    >
                      {new Date(msg.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <form
        onSubmit={handleSend}
        className="border-t border-[var(--pawls-cream-100)] bg-white px-4 py-3"
      >
        <div className="mx-auto flex max-w-lg items-center gap-2">
          <input
            ref={inputRef}
            type="text"
            value={newMsg}
            onChange={(e) => setNewMsg(e.target.value)}
            placeholder="Type a message..."
            maxLength={500}
            className="flex-1 rounded-full border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition-colors focus:border-[var(--pawls-terracotta-500)] focus:bg-white"
          />
          <button
            type="submit"
            disabled={!newMsg.trim() || sending}
            className="flex-shrink-0 rounded-full bg-[var(--pawls-terracotta-500)] p-2.5 text-white shadow-md shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? (
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
            ) : (
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="h-5 w-5"
              >
                <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
              </svg>
            )}
          </button>
        </div>
      </form>
    </section>
      <AppFooter />
    </>
  );
}
