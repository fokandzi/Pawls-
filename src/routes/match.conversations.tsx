import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { seoHead, SEO } from "../lib/seo";
import { t, normalizeLang, type Lang } from "../lib/i18n";
import { LangToggle } from "../lib/lang-toggle";

type ConversationRow = {
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
};

export const Route = createFileRoute("/match/conversations")({
  head: () => seoHead(SEO["match/conversations"]),
  component: ConversationsPage,
});

function ConversationsPage() {
  const [lang, setLang] = useState<Lang>("fr");
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [status, setStatus] = useState<"loading" | "loggedOut" | "ready" | "noDog" | "error">("loading");
  const [error, setError] = useState("");
  const [meId, setMeId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // If the caller asked to start a conversation with a matched user
        // (?with=<userId>), create-or-fetch it first, then land in the thread.
        const params = new URLSearchParams(window.location.search);
        const withUserId = params.get("with");
        if (withUserId) {
          const startRes = await fetch("/api/match/conversations/start", {
            method: "POST",
            headers: { "content-type": "application/json" },
            // Tolerate both plain (?with=89) and JSON-quoted (?with="89") legacy
            // params — the match-card link previously emitted JSON-encoded values.
            body: JSON.stringify({ otherUserId: Number(String(withUserId).replace(/^"|"$/g, "")) }),
          });
          const startData = await startRes.json();
          if (cancelled) return;
          if (!startRes.ok || !startData.ok) {
            setStatus("error");
            setError(startData.message ?? startData.error ?? "");
            return;
          }
          window.location.replace(`/match/conversations/${startData.conversationId}`);
          return;
        }

        const mineRes = await fetch("/api/match/mine", { headers: { accept: "application/json" } });
        const mine = await mineRes.json();
        if (cancelled) return;
        if (!mine.user) { setStatus("loggedOut"); return; }
        setLang(normalizeLang(mine.user.lang));
        setMeId(mine.user.id);
        if (!mine.dogs.length) { setStatus("noDog"); return; }
        const res = await fetch("/api/match/conversations", { headers: { accept: "application/json" } });
        const data = await res.json();
        if (cancelled) return;
        if (data.error) { setStatus("error"); setError(data.message ?? data.error); return; }
        setRows(data.conversations);
        setStatus("ready");
      } catch {
        if (!cancelled) { setStatus("error"); setError(""); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const L = lang;

  function formatTime(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleString(L === "fr" ? "fr-FR" : "en-GB", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <>
      <AppHeader active="match" />
      <section className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-12">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 text-center">
            <LangToggle lang={lang} className="mb-4" />
            <span className="block text-5xl">💬</span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900">{t("msg.heading", L)}</h1>
            <p className="mt-2 text-gray-600">{t("msg.subtitle", L)}</p>
          </div>

          {status === "loading" && (
            <div className="flex justify-center py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--pawls-cream-200)] border-t-[var(--pawls-terracotta-500)]" />
            </div>
          )}
          {status === "loggedOut" && (
            <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{t("msg.loggedOutTitle", L)}</h2>
              <p className="mt-2 text-gray-600">{t("msg.loggedOutBody", L)}</p>
              <Link to="/login" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white">{t("match.logIn", L)}</Link>
            </div>
          )}
          {status === "noDog" && (
            <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{t("msg.noDogsTitle", L)}</h2>
              <p className="mt-2 text-gray-600">{t("msg.noDogsBody", L)}</p>
              <Link to="/match/create" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white">{t("create.submit", L)}</Link>
            </div>
          )}
          {status === "error" && (
            <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{t("match.error", L)}</h2>
              {error && <p className="mt-2 text-sm text-gray-600">{error}</p>}
            </div>
          )}
          {status === "ready" && rows.length === 0 && (
            <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{t("msg.emptyTitle", L)}</h2>
              <p className="mt-2 text-gray-600">{t("msg.emptyBody", L)}</p>
              <Link to="/match/matches" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white">{t("msg.backToMatches", L)}</Link>
            </div>
          )}
          {status === "ready" && rows.length > 0 && (
            <div className="space-y-3">
              {rows.map((c) => (
                <Link
                  key={c.id}
                  to="/match/conversations/$id"
                  params={{ id: String(c.id) }}
                  className={`flex items-center gap-4 rounded-2xl border p-4 shadow-sm transition-colors hover:border-[var(--pawls-terracotta-300)] ${
                    c.unread_count > 0 ? "border-[var(--pawls-terracotta-200)] bg-[var(--pawls-cream-50)]" : "border-[var(--pawls-cream-100)] bg-white"
                  }`}
                >
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--pawls-cream-50)] text-2xl">
                    {c.photo_url ? <img src={c.photo_url} alt={c.dog_name ?? ""} className="h-full w-full object-cover" /> : "🐶"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className={`truncate text-base ${c.unread_count > 0 ? "font-bold text-gray-900" : "font-semibold text-gray-900"}`}>
                        {c.dog_name ?? c.owner_name ?? "—"}
                      </h3>
                      {c.last_message_at && <span className="flex-shrink-0 text-[11px] text-gray-400">{formatTime(c.last_message_at)}</span>}
                    </div>
                    <p className={`mt-0.5 truncate text-sm ${c.unread_count > 0 ? "font-medium text-gray-800" : "text-gray-500"}`}>
                      {c.last_message ?? "…"}
                    </p>
                  </div>
                  {c.unread_count > 0 && (
                    <span className="flex h-6 min-w-6 flex-shrink-0 items-center justify-center rounded-full bg-[var(--pawls-terracotta-500)] px-1.5 text-xs font-bold text-white">
                      {c.unread_count > 99 ? "99+" : c.unread_count}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )}

          <div className="mt-8 text-center">
            <Link to="/match/matches" className="text-sm font-medium text-[var(--pawls-terracotta-500)]">{t("msg.backToMatches", L)}</Link>
            <span className="mx-2 text-gray-300">·</span>
            <Link to="/match" className="text-sm font-medium text-[var(--pawls-terracotta-500)]">{t("matches.backToSwiping", L)}</Link>
          </div>
        </div>
      </section>
      <AppFooter />
    </>
  );
}
