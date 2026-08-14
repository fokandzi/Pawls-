import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { seoHead, SEO } from "../lib/seo";
import { t, normalizeLang, type Lang } from "../lib/i18n";

type AdminReport = {
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
};

type AuditEntry = {
  id: number;
  user_id: number | null;
  actor_email: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

export const Route = createFileRoute("/admin/moderation")({
  head: () => seoHead(SEO["admin/moderation"]),
  component: ModerationPage,
});

const STATUS_LABEL: Record<string, string> = {
  open: "admin.open",
  reviewing: "admin.reviewing",
  resolved: "admin.resolved",
  dismissed: "admin.dismissed",
};

const CATEGORY_LABEL: Record<string, string> = {
  spam: "safety.categorySpam",
  harassment: "safety.categoryHarassment",
  inappropriate_content: "safety.categoryInappropriate",
  fake_profile: "safety.categoryFake",
  other: "safety.categoryOther",
};

const TARGET_LABEL: Record<string, string> = {
  user: "Utilisateur",
  dog: "Chien",
  message: "Message",
  provider: "Prestataire",
};

function ModerationPage() {
  const [lang, setLang] = useState<Lang>("fr");
  const [phase, setPhase] = useState<"loading" | "loggedOut" | "denied" | "ready">("loading");
  const [reports, setReports] = useState<AdminReport[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [banner, setBanner] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  async function loadQueue() {
    const res = await fetch("/api/safety/admin/reports", { headers: { accept: "application/json" } });
    if (res.status === 401) { setPhase("loggedOut"); return; }
    if (res.status === 403) { setPhase("denied"); return; }
    if (!res.ok) { setError(t("admin.failed", lang)); return; }
    const data = await res.json();
    setReports(data.reports);
    setOpenCount(data.openCount);
    const auditRes = await fetch("/api/safety/admin/audit", { headers: { accept: "application/json" } });
    if (auditRes.ok) {
      const ad = await auditRes.json();
      setAudit(ad.entries);
    }
    setPhase("ready");
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const meRes = await fetch("/auth/me", { headers: { accept: "application/json" } });
        const me = await meRes.json();
        if (cancelled) return;
        if (!me.user) { setPhase("loggedOut"); return; }
        setLang(normalizeLang(me.user.preferred_language));
        if (me.user.role !== "admin") { setPhase("denied"); return; }
        await loadQueue();
      } catch {
        if (!cancelled) { setError(t("admin.failed", lang)); setPhase("ready"); }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function act(path: string, body: Record<string, unknown>) {
    setBanner(null);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setBanner({ kind: "err", text: data.error ?? t("admin.failed", lang) });
        return false;
      }
      setBanner({ kind: "ok", text: t("admin.done", lang) });
      await loadQueue();
      return true;
    } catch {
      setBanner({ kind: "err", text: t("admin.failed", lang) });
      return false;
    }
  }

  const L = lang;
  const fmt = (s: string) => {
    try { return new Date(s).toLocaleString(L === "fr" ? "fr-FR" : "en-GB"); } catch { return s; }
  };

  return (
    <>
      <AppHeader active="match" />
      <section className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-4 py-8 sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">{t("admin.heading", L)}</h1>
              <p className="mt-1 text-sm text-gray-500">{openCount} ouvert(s) · {reports.length} au total</p>
            </div>
            <Link to="/match" className="text-sm font-medium text-[var(--pawls-terracotta-500)]">← Match</Link>
          </div>

          {phase === "loading" && (
            <div className="flex justify-center py-16">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--pawls-cream-200)] border-t-[var(--pawls-terracotta-500)]" />
            </div>
          )}
          {phase === "loggedOut" && (
            <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{t("admin.loggedOut", L)}</h2>
              <Link to="/login" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white">{t("match.logIn", L)}</Link>
            </div>
          )}
          {phase === "denied" && (
            <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{t("admin.denied", L)}</h2>
              <p className="mt-2 text-gray-600">{t("admin.deniedBody", L)}</p>
            </div>
          )}
          {phase === "ready" && (
            <>
              {banner && (
                <div className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${banner.kind === "ok" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{banner.text}</div>
              )}
              {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}

              {reports.length === 0 ? (
                <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-14 text-center">
                  <span className="block text-5xl">🛡️</span>
                  <h2 className="mt-4 text-xl font-bold text-gray-900">{t("admin.noReports", L)}</h2>
                  <p className="mt-2 text-gray-600">{t("admin.noReportsBody", L)}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {reports.map((r) => (
                    <div key={r.id} className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-5 shadow-sm">
                      <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-bold text-gray-900">#{r.id}</span>
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${r.status === "open" ? "bg-amber-100 text-amber-800" : r.status === "resolved" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                          {t(STATUS_LABEL[r.status] ?? r.status, L)}
                        </span>
                        <span className="rounded-full bg-[var(--pawls-cream-50)] px-2.5 py-0.5 text-xs font-medium text-gray-600">
                          {TARGET_LABEL[r.target_type] ?? r.target_type} #{r.target_id}
                        </span>
                        <span className="text-xs text-gray-400">{fmt(r.created_at)}</span>
                      </div>
                      <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
                        <p><span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t("admin.reporter", L)}</span><br />{r.reporter_name ?? "—"} · {r.reporter_email ?? "—"}</p>
                        <p><span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t("admin.target", L)}</span><br />{r.target_summary ?? "—"}</p>
                        <p><span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t("admin.category", L)}</span><br />{t(CATEGORY_LABEL[r.category] ?? r.category, L)}</p>
                        <p><span className="text-xs font-semibold uppercase tracking-wide text-gray-400">{t("admin.details", L)}</span><br />{r.details ?? "—"}</p>
                      </div>
                      {r.admin_action && <p className="mt-2 rounded-lg bg-[var(--pawls-cream-50)] px-3 py-2 text-xs text-gray-600">Action : {r.admin_action}</p>}

                      {(r.status === "open" || r.status === "reviewing") && (
                        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--pawls-cream-100)] pt-4">
                          <button
                            disabled={busyId === r.id}
                            onClick={async () => { setBusyId(r.id); await act(`/api/safety/admin/reports/${r.id}/resolve`, { outcome: "resolved", note: "" }); setBusyId(null); }}
                            className="rounded-full border border-[var(--pawls-cream-200)] px-4 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-[var(--pawls-cream-50)] disabled:opacity-50"
                          >{t("admin.resolve", L)}</button>
                          <button
                            disabled={busyId === r.id}
                            onClick={async () => { setBusyId(r.id); await act(`/api/safety/admin/reports/${r.id}/resolve`, { outcome: "dismissed", note: "" }); setBusyId(null); }}
                            className="rounded-full border border-[var(--pawls-cream-200)] px-4 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-[var(--pawls-cream-50)] disabled:opacity-50"
                          >{t("admin.dismiss", L)}</button>
                          {(["warn_user", "suspend_user", "reinstate_user", "remove_message", "unmatch", "block_user"] as const).map((a) => (
                            <button
                              key={a}
                              disabled={busyId === r.id}
                              onClick={async () => {
                                const note = window.prompt(t("admin.note", L) + (a === "suspend_user" ? " (raison de suspension)" : ""));
                                if (note === null) return;
                                setBusyId(r.id);
                                await act(`/api/safety/admin/reports/${r.id}/action`, { action: a, note });
                                setBusyId(null);
                              }}
                              className="rounded-full border border-[var(--pawls-terracotta-500)]/30 px-4 py-1.5 text-xs font-semibold text-[var(--pawls-terracotta-700)] transition-colors hover:bg-[var(--pawls-terracotta-500)] hover:text-white disabled:opacity-50"
                            >{t(`admin.action${a.charAt(0).toUpperCase()}${a.slice(1).replace(/_/g, "")}`, L)}</button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-10">
                <h2 className="text-lg font-bold text-gray-900">{t("admin.audit", L)}</h2>
                {audit.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">{t("admin.auditEmpty", L)}</p>
                ) : (
                  <div className="mt-3 overflow-x-auto rounded-2xl border border-[var(--pawls-cream-100)] bg-white shadow-sm">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-[var(--pawls-cream-100)] bg-[var(--pawls-cream-50)]/50 text-xs uppercase tracking-wide text-gray-400">
                        <tr>
                          <th className="px-4 py-2">#</th>
                          <th className="px-4 py-2">{t("admin.date", L)}</th>
                          <th className="px-4 py-2">Acteur</th>
                          <th className="px-4 py-2">Action</th>
                          <th className="px-4 py-2">Détails</th>
                        </tr>
                      </thead>
                      <tbody>
                        {audit.slice(0, 100).map((e) => (
                          <tr key={e.id} className="border-b border-[var(--pawls-cream-50)]">
                            <td className="px-4 py-2 text-gray-400">{e.id}</td>
                            <td className="px-4 py-2 text-gray-500">{fmt(e.created_at)}</td>
                            <td className="px-4 py-2">{e.actor_email ?? `#${e.user_id ?? "?"}`}</td>
                            <td className="px-4 py-2 font-medium text-gray-800">{e.action}</td>
                            <td className="max-w-xs truncate px-4 py-2 text-gray-500">{e.details ? JSON.stringify(e.details) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>
      <AppFooter />
    </>
  );
}
