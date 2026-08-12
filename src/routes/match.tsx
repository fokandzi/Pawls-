import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link, Outlet, useRouterState, useSearch } from "@tanstack/react-router";
import { seoHead, SEO } from "../lib/seo";
import { t, normalizeLang, type Lang } from "../lib/i18n";
import { LangToggle } from "../lib/lang-toggle";
import { useEffect, useMemo, useState } from "react";

type DiscoveryDog = {
  id: number; dog_name: string; breed: string; age: number | null;
  size: string | null; energy_level: string | null; temperament: string | null;
  bio: string | null; photo_url: string | null; location: string | null;
  city: string | null; owner_name: string | null;
};

const sizeEmoji: Record<string, string> = { small: "🐶", medium: "🐕", large: "🦮" };
const sizeLabel: Record<string, { fr: string; en: string }> = {
  small: { fr: "Petit", en: "Small" }, medium: { fr: "Moyen", en: "Medium" }, large: { fr: "Grand", en: "Large" },
};

export const Route = createFileRoute("/match")({
  head: () => seoHead(SEO.match),
  component: MatchPage,
});

function MatchPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname.startsWith("/match/")) return <Outlet />;
  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader active="match" />
      <SwipeUI />
      <AppFooter />
    </div>
  );
}

function SwipeUI() {
  const search = (useSearch({ strict: false }) as any) ?? {};
  const justMatched = search.justMatched === "1";
  const [lang, setLang] = useState<Lang>("fr");
  const [dogs, setDogs] = useState<DiscoveryDog[]>([]);
  const [status, setStatus] = useState<"loading" | "loggedOut" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [matchBanner, setMatchBanner] = useState(justMatched);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const mineRes = await fetch("/api/match/mine", { headers: { accept: "application/json" } });
        const mine = await mineRes.json();
        if (cancelled) return;
        if (!mine.user) { setStatus("loggedOut"); return; }
        setLang(normalizeLang(mine.user.lang));
        if (!mine.dogs.length) { setStatus("ready"); setDogs([]); return; }
        const discRes = await fetch("/api/match/discovery", { headers: { accept: "application/json" } });
        const disc = await discRes.json();
        if (cancelled) return;
        if (disc.error) { setStatus("error"); setError(disc.message ?? disc.error); return; }
        setDogs(disc.dogs);
        setStatus("ready");
      } catch {
        if (!cancelled) { setStatus("error"); setError(""); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const current = dogs[0];
  const L = lang;

  if (status === "loading") {
    return (
      <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--pawls-cream-200)] border-t-[var(--pawls-terracotta-500)]" />
      </section>
    );
  }
  if (status === "loggedOut") {
    return (
      <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
        <div className="max-w-sm text-center">
          <span className="text-5xl">🐶</span>
          <h2 className="mt-4 text-2xl font-bold text-gray-900">{t("match.loggedOutTitle", L)}</h2>
          <p className="mt-2 text-gray-600">{t("match.loggedOutBody", L)}</p>
          <div className="mt-6 flex justify-center gap-3">
            <Link to="/login" className="inline-flex rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white">{t("match.logIn", L)}</Link>
            <Link to="/register" className="inline-flex rounded-full border border-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-[var(--pawls-terracotta-500)]">{t("match.signUp", L)}</Link>
          </div>
        </div>
      </section>
    );
  }
  if (status === "error") {
    return (
      <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
        <div className="max-w-sm text-center">
          <h2 className="text-2xl font-bold text-gray-900">{t("match.error", L)}</h2>
          {error && <p className="mt-2 text-sm text-gray-600">{error}</p>}
        </div>
      </section>
    );
  }

  if (!current) {
    const hasDog = status === "ready" && dogs.length === 0 && (current === undefined);
    return (
      <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20">
        <div className="max-w-sm text-center">
          <LangToggle lang={lang} />
          <span className="mt-4 inline-block text-5xl">🐾</span>
          <h2 className="mt-4 text-2xl font-bold text-gray-900">{t("match.noCandidatesTitle", L)}</h2>
          <p className="mt-2 text-gray-600">{t("match.noCandidatesBody", L)}</p>
          <div className="mt-6 flex flex-col items-center gap-3">
            <Link to="/match/create" className="inline-flex rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white">{t("match.createProfile", L)}</Link>
            <Link to="/match/matches" className="text-sm text-gray-400">{t("match.viewMatches", L)} →</Link>
            <Link to="/match/my-dogs" className="text-sm text-gray-400">{t("match.manageDogs", L)}</Link>
          </div>
          {hasDog && <p className="mt-4 text-xs text-gray-400">{t("match.noDogsTitle", L)}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="relative flex flex-1 flex-col items-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-8">
      <div className="mb-3 flex w-full max-w-sm items-center justify-between">
        <LangToggle lang={lang} />
        <span className="text-sm text-gray-400">{t("match.swipedCount", L).replace("{n}", "—")}</span>
      </div>
      {matchBanner && (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center">
          <p className="font-bold text-emerald-700">{t("match.itIsAMatch", L)}</p>
          <p className="text-sm text-emerald-600">{t("match.itIsAMatchBody", L).replace("{name}", current.dog_name)}</p>
        </div>
      )}
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--pawls-cream-100)] bg-white shadow-lg">
        <div className="relative flex h-56 items-center justify-center overflow-hidden bg-gradient-to-br from-[var(--pawls-cream-100)] to-[var(--pawls-cream-50)]">
          <span className="absolute text-8xl">{sizeEmoji[current.size ?? "medium"] ?? "🐶"}</span>
          {current.photo_url && <img src={current.photo_url} alt={current.dog_name} className="relative z-10 h-full w-full object-cover" />}
        </div>
        <div className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">{current.dog_name}</h2>
              <p className="text-sm text-gray-500">{current.breed}</p>
            </div>
            {current.age !== null && <span className="text-2xl font-bold text-[var(--pawls-terracotta-500)]">{current.age}y</span>}
          </div>
          <div className="my-3 flex flex-wrap gap-2">
            {current.size && (
              <span className="rounded-full bg-[var(--pawls-cream-50)] px-2.5 py-1 text-xs">
                {sizeEmoji[current.size]} {sizeLabel[current.size]?.[L] ?? current.size}
              </span>
            )}
            {current.energy_level && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">{current.energy_level}</span>}
            {current.temperament && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">{current.temperament}</span>}
          </div>
          <p className="text-sm text-gray-500">{current.location ?? current.city ?? ""}</p>
          {current.bio && <p className="mt-3 text-sm leading-relaxed text-gray-700">{current.bio}</p>}
          {current.owner_name && <p className="mt-3 text-xs text-gray-400">{t("match.owner", L)}: {current.owner_name}</p>}
        </div>
      </div>
      <div className="mt-8 flex items-center gap-8">
        <SwipeButton dogId={current.id} direction="pass" label={t("match.pass", L)} emoji="✕" style="border-red-300 text-red-400" lang={lang} onDone={() => setDogs((d) => d.slice(1))} />
        <SwipeButton dogId={current.id} direction="like" label={t("match.like", L)} emoji="♥" style="border-emerald-300 text-emerald-400" lang={lang} onDone={(matchCreated) => { setDogs((d) => d.slice(1)); if (matchCreated) setMatchBanner(true); }} />
      </div>
      <Link to="/match/matches" className="mt-4 text-sm text-gray-400">{t("match.viewMatches", L)} →</Link>
    </section>
  );
}

function SwipeButton({ dogId, direction, label, emoji, style, lang, onDone }: {
  dogId: number; direction: string; label: string; emoji: string; style: string; lang: Lang; onDone: (matchCreated: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/match/swipe", {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ targetDogId: dogId, direction }),
      });
      const data = await res.json();
      if (data.ok) {
        onDone(!!data.matchCreated);
      } else {
        window.location.href = "/match";
      }
    } catch {
      window.location.href = "/match";
    }
  }
  return (
    <form method="POST" action="/api/match/swipe" onSubmit={submit} className="inline-flex flex-col items-center gap-1">
      <input type="hidden" name="targetDogId" value={dogId} />
      <input type="hidden" name="direction" value={direction} />
      <button type="submit" disabled={busy} aria-label={label}
        className={`flex h-16 w-16 items-center justify-center rounded-full border-2 bg-white text-3xl shadow-md ${style} ${busy ? "opacity-50" : ""}`}>
        {emoji}
      </button>
      <span className="text-xs text-gray-400">{label}</span>
    </form>
  );
}
