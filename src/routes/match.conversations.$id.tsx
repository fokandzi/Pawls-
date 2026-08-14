import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { seoHead, SEO } from "../lib/seo";
import { t, normalizeLang, type Lang } from "../lib/i18n";
import { LangToggle } from "../lib/lang-toggle";
import { ReportModal, safetyPost } from "../lib/safety-ui";

type Message = {
  id: number;
  conversation_id: number;
  sender_user_id: number;
  sender_profile_id: number | null;
  body: string;
  created_at: string;
  read_at: string | null;
};

type ConversationMeta = {
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
};

type RelStatus = { blockedByMe: boolean; blockedMe: boolean; matchState: "active" | "unmatched" | "none" };

export const Route = createFileRoute("/match/conversations/$id")({
  head: () => seoHead(SEO["match/conversations/$id"]),
  component: ConversationThreadPage,
});

function ConversationThreadPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [lang, setLang] = useState<Lang>("fr");
  const [meId, setMeId] = useState<number | null>(null);
  const [conversation, setConversation] = useState<ConversationMeta | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<"loading" | "loggedOut" | "ready" | "notFound" | "error">("loading");
  const [error, setError] = useState("");
  const [newMsg, setNewMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sendFailed, setSendFailed] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Safety: relation status + action UI
  const [rel, setRel] = useState<RelStatus | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: "user" | "message"; id: number; name: string | null } | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const conversationId = Number(id);

  // Load mine + conversation, then mark read. Polls for new messages.
  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | null = null;

    async function loadConversation() {
      try {
        const res = await fetch(`/api/match/conversations/${conversationId}`, { headers: { accept: "application/json" } });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error) {
          if (res.status === 401) { setStatus("loggedOut"); return; }
          setStatus("notFound");
          return;
        }
        setConversation(data.conversation);
        setMessages(data.messages);
        setStatus("ready");
        // Relation status for block/unblock/unmatch buttons (404 = no
        // relationship: leave rel null, buttons stay hidden).
        fetch(`/api/safety/status?userId=${encodeURIComponent(data.conversation.other_user_id)}`, { headers: { accept: "application/json" } })
          .then((r) => (r.ok ? r.json() : null))
          .then((s) => { if (s?.ok) setRel({ blockedByMe: s.blockedByMe, blockedMe: s.blockedMe, matchState: s.matchState }); })
          .catch(() => {});
        // Opening a conversation marks the counterpart's messages read.
        // GETs never mutate — this is the dedicated read endpoint.
        fetch(`/api/match/conversations/${conversationId}/read`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        }).catch(() => {});
      } catch {
        if (!cancelled) { setStatus("error"); setError(""); }
      }
    }

    (async () => {
      try {
        const mineRes = await fetch("/api/match/mine", { headers: { accept: "application/json" } });
        const mine = await mineRes.json();
        if (cancelled) return;
        if (!mine.user) { setStatus("loggedOut"); return; }
        setLang(normalizeLang(mine.user.lang));
        setMeId(mine.user.id);
        await loadConversation();
        pollTimer = setInterval(loadConversation, 5000);
      } catch {
        if (!cancelled) { setStatus("error"); setError(""); }
      }
    })();

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [conversationId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = newMsg.trim();
    if (!body || sending) return;
    setSending(true);
    setSendFailed(false);
    try {
      const res = await fetch(`/api/match/conversations/${conversationId}/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setSendFailed(true);
        if (res.status === 404) setStatus("notFound");
        return;
      }
      setNewMsg("");
      setMessages((prev) => [...prev, data.message]);
    } catch {
      setSendFailed(true);
    } finally {
      setSending(false);
    }
  }

  const L = lang;
  const otherName = conversation?.dog_name ?? conversation?.owner_name ?? "…";

  async function runAction(path: string, okKey: string) {
    if (!conversation || busy) return;
    setBusy(true);
    setActionMsg(null);
    setActionErr(null);
    try {
      const res = await safetyPost(path, { userId: conversation.other_user_id });
      if (!res.ok) {
        setActionErr(res.status === 429 ? t("safety.tooMany", L) : t("safety.genericError", L));
        return;
      }
      setActionMsg(t(okKey, L).replace("{name}", otherName));
      setTimeout(() => navigate({ to: "/match/conversations" }), 1200);
    } catch {
      setActionErr(t("safety.genericError", L));
    } finally {
      setBusy(false);
    }
  }

  function formatTime(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleTimeString(L === "fr" ? "fr-FR" : "en-GB", { hour: "2-digit", minute: "2-digit" });
    } catch {
      return dateStr;
    }
  }

  return (
    <>
      <AppHeader active="match" />
      <section className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-2xl">
          <div className="mb-4 flex items-center justify-between">
            <Link to="/match/conversations" className="text-sm font-medium text-[var(--pawls-terracotta-500)]">{t("msg.backToConversations", L)}</Link>
            <LangToggle lang={lang} />
          </div>

          {status === "loading" && (
            <div className="flex justify-center py-16">
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
          {status === "notFound" && (
            <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{t("msg.notFoundTitle", L)}</h2>
              <p className="mt-2 text-gray-600">{t("msg.notFoundBody", L)}</p>
              <Link to="/match/conversations" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white">{t("msg.backToConversations", L)}</Link>
            </div>
          )}
          {status === "error" && (
            <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{t("msg.loadFailed", L)}</h2>
              {error && <p className="mt-2 text-sm text-gray-600">{error}</p>}
            </div>
          )}
          {status === "ready" && conversation && (
            <div className="overflow-hidden rounded-2xl border border-[var(--pawls-cream-100)] bg-white shadow-sm">
              <div className="flex items-center gap-3 border-b border-[var(--pawls-cream-100)] bg-white px-4 py-3">
                <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--pawls-cream-50)] text-xl">
                  {conversation.photo_url ? <img src={conversation.photo_url} alt={conversation.dog_name ?? ""} className="h-full w-full object-cover" /> : "🐶"}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-base font-bold text-gray-900">
                    {conversation.dog_name ?? conversation.owner_name ?? "—"}
                    {rel?.blockedByMe && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{t("safety.blockedBadge", L)}</span>}
                  </h2>
                  <p className="truncate text-xs text-gray-500">
                    {[conversation.breed, conversation.city ?? conversation.location].filter(Boolean).join(" · ") || "…"}
                  </p>
                </div>

                {/* Safety actions menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((o) => !o)}
                    aria-label={t("safety.actions", L)}
                    aria-expanded={menuOpen}
                    className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-[var(--pawls-cream-50)] hover:text-gray-600"
                  >⋯</button>
                  {menuOpen && (
                    <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-[var(--pawls-cream-100)] bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => { setMenuOpen(false); setReportTarget({ type: "user", id: conversation.other_user_id, name: otherName }); }}
                        className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-[var(--pawls-cream-50)]"
                      >{t("safety.reportUser", L).replace("{name}", otherName)}</button>
                      {rel?.blockedByMe ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => { setMenuOpen(false); runAction("/api/safety/unblock", "safety.unblockDone"); }}
                          className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-[var(--pawls-cream-50)] disabled:opacity-50"
                        >{t("safety.unblock", L)}</button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => {
                            setMenuOpen(false);
                            if (!window.confirm(t("safety.blockConfirm", L).replace("{name}", otherName))) return;
                            runAction("/api/safety/block", "safety.blockDone");
                          }}
                          className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-[var(--pawls-cream-50)] disabled:opacity-50"
                        >{t("safety.blockUser", L).replace("{name}", otherName)}</button>
                      )}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => {
                          setMenuOpen(false);
                          if (!window.confirm(t("safety.unmatchConfirm", L).replace("{name}", otherName))) return;
                          runAction("/api/safety/unmatch", "safety.unmatchDone");
                        }}
                        className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-[var(--pawls-cream-50)] disabled:opacity-50"
                      >{t("safety.unmatch", L)}</button>
                    </div>
                  )}
                </div>
              </div>

              {(actionMsg || actionErr) && (
                <div className={`px-4 py-2 text-xs font-medium ${actionErr ? "bg-red-50 text-red-600" : "bg-green-50 text-green-700"}`}>
                  {actionMsg ?? actionErr}
                </div>
              )}

              <div className="flex h-[50vh] flex-col overflow-y-auto bg-[var(--pawls-cream-50)]/40 px-4 py-4">
                {messages.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <div className="text-center">
                      <span className="text-5xl">👋</span>
                      <p className="mt-3 text-sm text-gray-500">{t("msg.emptyThread", L)}</p>
                    </div>
                  </div>
                ) : (
                  <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
                    {messages.map((msg) => {
                      const isMine = meId !== null && msg.sender_user_id === meId;
                      return (
                        <div key={msg.id} className={`group flex items-end gap-1.5 ${isMine ? "justify-end" : "justify-start"}`}>
                          {!isMine && (
                            <button
                              type="button"
                              onClick={() => setReportTarget({ type: "message", id: msg.id, name: otherName })}
                              aria-label={t("safety.reportMessage", L)}
                              className="mb-1 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full text-xs text-gray-300 opacity-0 transition-opacity hover:bg-white hover:text-[var(--pawls-terracotta-500)] group-hover:opacity-100"
                            >⚑</button>
                          )}
                          <div
                            className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${
                              isMine
                                ? "rounded-br-md bg-[var(--pawls-terracotta-500)] text-white"
                                : "rounded-bl-md border border-[var(--pawls-cream-100)] bg-white text-gray-800"
                            }`}
                          >
                            <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.body}</p>
                            <p className={`mt-1 text-right text-[10px] ${isMine ? "text-[var(--pawls-cream-200)]" : "text-gray-400"}`}>
                              {formatTime(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={endRef} />
                  </div>
                )}
              </div>

              {sendFailed && (
                <p className="border-t border-[var(--pawls-cream-100)] bg-red-50 px-4 py-2 text-xs font-medium text-red-600">{t("msg.sendFailed", L)}</p>
              )}
              <form onSubmit={handleSend} className="border-t border-[var(--pawls-cream-100)] bg-white px-4 py-3">
                <div className="mx-auto flex max-w-lg items-center gap-2">
                  <input
                    type="text"
                    value={newMsg}
                    onChange={(e) => setNewMsg(e.target.value)}
                    placeholder={t("msg.placeholder", L)}
                    maxLength={4000}
                    className="flex-1 rounded-full border border-[var(--pawls-cream-200)] bg-[var(--pawls-cream-50)]/50 px-4 py-2.5 text-sm text-gray-800 placeholder-gray-400 outline-none transition-colors focus:border-[var(--pawls-terracotta-500)] focus:bg-white"
                  />
                  <button
                    type="submit"
                    disabled={!newMsg.trim() || sending}
                    className="flex-shrink-0 rounded-full bg-[var(--pawls-terracotta-500)] p-2.5 text-white shadow-md shadow-[var(--pawls-terracotta-500)]/25 transition-colors hover:bg-[var(--pawls-terracotta-700)] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={t("msg.send", L)}
                  >
                    {sending ? (
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                        <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                      </svg>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </section>
      {reportTarget && (
        <ReportModal
          lang={lang}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          targetName={reportTarget.name}
          onClose={() => setReportTarget(null)}
        />
      )}
      <AppFooter />
    </>
  );
}
