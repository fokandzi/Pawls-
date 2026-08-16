import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { seoHead, SEO } from "../lib/seo";
import { t, normalizeLang, type Lang } from "../lib/i18n";
import { LangToggle } from "../lib/lang-toggle";
import { ReportModal, safetyPost } from "../lib/safety-ui";

type MatchRow = {
  id: number;
  other_dog_id: number;
  owner_user_id: number | null;
  dog_name: string;
  breed: string;
  size: string | null;
  energy_level: string | null;
  temperament: string | null;
  bio: string | null;
  photo_url: string | null;
  location: string | null;
  city: string | null;
  owner_name: string | null;
  created_at: string;
};

type RelStatus = { blockedByMe: boolean; blockedMe: boolean; matchState: "active" | "unmatched" | "none" };

export const Route = createFileRoute("/match/matches")({
  head: () => seoHead(SEO["match/matches"]),
  component: MatchesPage,
});

function MatchesPage() {
  const [lang, setLang] = useState<Lang>("fr");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [status, setStatus] = useState<"loading" | "loggedOut" | "ready" | "noDog" | "error">("loading");
  const [error, setError] = useState("");

  // Safety: per-card menu + report modal
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const [relByOwner, setRelByOwner] = useState<Record<number, RelStatus>>({});
  const [reportTarget, setReportTarget] = useState<{ ownerId: number; name: string } | null>(null);
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mineRes = await fetch("/api/match/mine", { headers: { accept: "application/json" } });
        const mine = await mineRes.json();
        if (cancelled) return;
        if (!mine.user) { setStatus("loggedOut"); return; }
        setLang(normalizeLang(mine.user.lang));
        if (!mine.dogs.length) { setStatus("noDog"); return; }
        const res = await fetch("/api/match/matches", { headers: { accept: "application/json" } });
        const data = await res.json();
        if (cancelled) return;
        if (data.error) { setStatus("error"); setError(data.message ?? data.error); return; }
        setMatches(data.matches);
        setStatus("ready");
      } catch {
        if (!cancelled) { setStatus("error"); setError(""); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const L = lang;

  function formatDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleDateString(L === "fr" ? "fr-FR" : "en-GB", { year: "numeric", month: "long", day: "numeric" });
    } catch {
      return dateStr;
    }
  }

  /** Load relation status for a card's owner when its menu opens. */
  async function ensureRel(ownerId: number) {
    if (ownerId == null || relByOwner[ownerId]) return;
    try {
      const res = await fetch(`/api/safety/status?userId=${encodeURIComponent(ownerId)}`, { headers: { accept: "application/json" } });
      if (!res.ok) return;
      const data = await res.json();
      if (data?.ok) setRelByOwner((prev) => ({ ...prev, [ownerId]: { blockedByMe: data.blockedByMe, blockedMe: data.blockedMe, matchState: data.matchState } }));
    } catch { /* non-fatal */ }
  }

  async function runAction(match: MatchRow, path: string, okKey: string) {
    if (match.owner_user_id == null || busyId !== null) return;
    setBusyId(match.id);
    setToast(null);
    try {
      const res = await safetyPost(path, { userId: match.owner_user_id });
      if (!res.ok) {
        setToast({ kind: "err", text: res.status === 429 ? t("safety.tooMany", L) : t("safety.genericError", L) });
        return;
      }
      setToast({ kind: "ok", text: t(okKey, L).replace("{name}", match.dog_name) });
      // Remove the card locally: the server has already severed the
      // conversation access and the match is closed/unhidden server-side.
      setMatches((prev) => prev.filter((m) => m.id !== match.id));
      setOpenMenu(null);
    } catch {
      setToast({ kind: "err", text: t("safety.genericError", L) });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <AppHeader active="match" />
      <section className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-12">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 text-center">
            <LangToggle lang={lang} className="mb-4" />
            <span className="block text-5xl">🐾</span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900">{t("matches.heading", L)}</h1>
            <p className="mt-2 text-gray-600">{t("matches.subtitle", L)}</p>
          </div>

          {toast && (
            <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${toast.kind === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{toast.text}</div>
          )}

          {status === "loading" && (
            <div className="flex justify-center py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--pawls-cream-200)] border-t-[var(--pawls-terracotta-500)]" />
            </div>
          )}
          {status === "loggedOut" && (
            <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{t("matches.loggedOutTitle", L)}</h2>
              <p className="mt-2 text-gray-600">{t("matches.loggedOutBody", L)}</p>
              <Link to="/login" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white">{t("match.logIn", L)}</Link>
            </div>
          )}
          {status === "noDog" && (
            <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{t("matches.noDogsTitle", L)}</h2>
              <p className="mt-2 text-gray-600">{t("matches.noDogsBody", L)}</p>
              <Link to="/match/create" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white">{t("matches.noDogsCta", L)}</Link>
            </div>
          )}
          {status === "error" && (
            <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{t("match.error", L)}</h2>
              {error && <p className="mt-2 text-sm text-gray-600">{error}</p>}
            </div>
          )}
          {status === "ready" && matches.length === 0 && (
            <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{t("matches.emptyTitle", L)}</h2>
              <p className="mt-2 text-gray-600">{t("matches.emptyBody", L)}</p>
              <Link to="/match" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white">{t("matches.backToSwiping", L)}</Link>
            </div>
          )}
          {status === "ready" && matches.length > 0 && (
            <div className="space-y-4">
              {matches.map((m) => (
                <div key={m.id} className="flex items-center gap-4 rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-5 shadow-sm">
                  <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--pawls-cream-50)] text-3xl">
                    {m.photo_url ? <img src={m.photo_url} alt={m.dog_name} className="h-full w-full object-cover" /> : "🐶"}
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-bold text-gray-900">
                      {m.dog_name}
                      {relByOwner[m.owner_user_id ?? -1]?.blockedByMe && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{t("safety.blockedBadge", L)}</span>}
                    </h3>
                    <p className="text-sm text-gray-500">{m.breed}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{t("matches.matchedOn", L).replace("{date}", formatDate(m.created_at))}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {m.owner_user_id ? (
                      <Link
                        to="/match/conversations"
                        search={{ with: m.owner_user_id }}
                        className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-[var(--pawls-terracotta-500)] px-4 py-1.5 text-xs font-semibold text-white"
                      >
                        💬 {t("msg.send", L)}
                      </Link>
                    ) : (
                      <span className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-[var(--pawls-cream-200)] px-4 py-1.5 text-xs font-semibold text-gray-400">
                        💬 {t("msg.send", L)}
                      </span>
                    )}

                    {/* Safety actions menu */}
                    {m.owner_user_id != null && (
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => { setOpenMenu((o) => (o === m.id ? null : m.id)); ensureRel(m.owner_user_id!); }}
                          aria-label={t("safety.actions", L)}
                          aria-expanded={openMenu === m.id}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-[var(--pawls-cream-50)] hover:text-gray-600"
                        >⋯</button>
                        {openMenu === m.id && (
                          <div className="absolute right-0 z-20 mt-1 w-52 rounded-xl border border-[var(--pawls-cream-100)] bg-white py-1 shadow-lg">
                            <button
                              type="button"
                              onClick={() => { setOpenMenu(null); setReportTarget({ ownerId: m.owner_user_id!, name: m.dog_name }); }}
                              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-[var(--pawls-cream-50)]"
                            >{t("safety.reportUser", L).replace("{name}", m.dog_name)}</button>
                            {relByOwner[m.owner_user_id]?.blockedByMe ? (
                              <button
                                type="button"
                                disabled={busyId !== null}
                                onClick={() => runAction(m, "/api/safety/unblock", "safety.unblockDone")}
                                className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-[var(--pawls-cream-50)] disabled:opacity-50"
                              >{t("safety.unblock", L)}</button>
                            ) : (
                              <button
                                type="button"
                                disabled={busyId !== null}
                                onClick={() => {
                                  setOpenMenu(null);
                                  if (!window.confirm(t("safety.blockConfirm", L).replace("{name}", m.dog_name))) return;
                                  runAction(m, "/api/safety/block", "safety.blockDone");
                                }}
                                className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-[var(--pawls-cream-50)] disabled:opacity-50"
                              >{t("safety.blockUser", L).replace("{name}", m.dog_name)}</button>
                            )}
                            <button
                              type="button"
                              disabled={busyId !== null}
                              onClick={() => {
                                setOpenMenu(null);
                                if (!window.confirm(t("safety.unmatchConfirm", L).replace("{name}", m.dog_name))) return;
                                runAction(m, "/api/safety/unmatch", "safety.unmatchDone");
                              }}
                              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-[var(--pawls-cream-50)] disabled:opacity-50"
                            >{t("safety.unmatch", L)}</button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-8 text-center">
            <Link to="/match/conversations" className="text-sm font-medium text-[var(--pawls-terracotta-500)]">💬 {t("msg.heading", L)}</Link>
            <span className="mx-2 text-gray-300">·</span>
            <Link to="/match" className="text-sm font-medium text-[var(--pawls-terracotta-500)]">{t("matches.backToSwiping", L)}</Link>
            <span className="mx-2 text-gray-300">·</span>
            <Link to="/match/my-dogs" className="text-sm font-medium text-[var(--pawls-terracotta-500)]">{t("match.manageDogs", L)}</Link>
          </div>
        </div>
      </section>
      {reportTarget && (
        <ReportModal
          lang={lang}
          targetType="user"
          targetId={reportTarget.ownerId}
          targetName={reportTarget.name}
          onClose={() => setReportTarget(null)}
        />
      )}
      <AppFooter />
    </>
  );
}
