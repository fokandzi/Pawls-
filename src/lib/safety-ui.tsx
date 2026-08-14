/**
 * Shared user-facing Safety UI: report modal + small action primitives.
 * All logic stays in the API — these components only collect honest input and
 * surface honest results ("sent to our team", never "we took action").
 */
import { useState } from "react";
import { t, type Lang } from "./i18n";

const CATEGORIES = ["spam", "harassment", "inappropriate_content", "fake_profile", "other"] as const;

export interface ReportModalProps {
  lang: Lang;
  targetType: "user" | "dog" | "message" | "provider";
  targetId: number;
  targetName?: string | null;
  onClose: () => void;
  onSubmitted?: () => void;
}

export function ReportModal({ lang, targetType, targetId, targetName, onClose, onSubmitted }: ReportModalProps) {
  const [category, setCategory] = useState<string>(CATEGORIES[0]);
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const L = lang;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError("");
    try {
      const res = await fetch("/api/safety/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetType, targetId, category, details }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(res.status === 429 ? t("safety.tooMany", L) : (data.error ?? t("safety.submitFailed", L)));
        return;
      }
      setDone(true);
      onSubmitted?.();
    } catch {
      setError(t("safety.submitFailed", L));
    } finally {
      setSending(false);
    }
  }

  const title =
    targetType === "message"
      ? t("safety.reportMessage", L)
      : targetType === "dog"
        ? t("safety.reportDog", L)
        : t("safety.reportUser", L).replace("{name}", targetName ?? "…");

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" onClick={onClose} role="dialog" aria-modal="true">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        {done ? (
          <div className="py-8 text-center">
            <span className="block text-5xl">📨</span>
            <p className="mt-4 font-medium text-gray-800">{t("safety.submitted", L)}</p>
            <button onClick={onClose} className="mt-5 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2 text-sm font-semibold text-white">{t("safety.close", L)}</button>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-bold text-gray-900">{title}</h3>
              <button onClick={onClose} aria-label={t("safety.close", L)} className="rounded-full p-1 text-gray-400 hover:bg-[var(--pawls-cream-50)] hover:text-gray-600">✕</button>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-gray-500">{t("safety.reportIntro", L)}</p>
            <form onSubmit={submit} className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">{t("safety.category", L)}</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-xl border border-[var(--pawls-cream-200)] bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-[var(--pawls-terracotta-500)]"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{t(`safety.category${c.charAt(0).toUpperCase()}${c.slice(1).replace(/_/g, "")}`, L)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-400">{t("safety.details", L)}</label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  maxLength={2000}
                  rows={3}
                  placeholder={t("safety.detailsPlaceholder", L)}
                  className="w-full rounded-xl border border-[var(--pawls-cream-200)] bg-white px-3 py-2.5 text-sm text-gray-800 outline-none focus:border-[var(--pawls-terracotta-500)]"
                />
              </div>
              {error && <p className="text-xs font-medium text-red-600">{error}</p>}
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={onClose} className="rounded-full px-4 py-2 text-sm font-medium text-gray-500 hover:bg-[var(--pawls-cream-50)]">{t("safety.cancel", L)}</button>
                <button type="submit" disabled={sending} className="rounded-full bg-[var(--pawls-terracotta-500)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {sending ? "…" : t("safety.submit", L)}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/** POST helper shared by block/unblock/unmatch actions. */
export async function safetyPost(path: string, body: Record<string, unknown>): Promise<{ ok: boolean; status: number; error?: string }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    return { ok: res.ok && !!data.ok, status: res.status, error: data.error };
  } catch {
    return { ok: false, status: 0, error: "network" };
  }
}
