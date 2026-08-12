import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { seoHead } from "../lib/seo";
import { t, normalizeLang, type Lang } from "../lib/i18n";
import { LangToggle } from "../lib/lang-toggle";

type MyDog = {
  id: number; dog_name: string; breed: string; size: string | null;
  energy_level: string | null; temperament: string | null; bio: string | null;
  sex: string | null; date_of_birth: string | null; weight_kg: number | null;
  dog_friendly: boolean | null; child_friendly: boolean | null;
  vaccination_status: string | null; neutered_spayed: boolean | null;
  profile_visibility: string; location: string | null;
};

export const Route = createFileRoute("/match/my-dogs")({
  head: () => seoHead({ title: "My dogs — Pawls", description: "Manage your dog profiles on Pawls.", path: "/match/my-dogs" }),
  component: MyDogsPage,
});

const inputClass =
  "w-full rounded-lg border border-[var(--pawls-cream-200)] bg-white px-3 py-2 text-sm text-gray-900 focus:border-[var(--pawls-terracotta-500)] focus:outline-none focus:ring-2 focus:ring-[var(--pawls-terracotta-500)]/30";
const labelClass = "mb-1 block text-xs font-semibold text-gray-600";

function MyDogsPage() {
  const search = (useSearch({ strict: false }) as any) ?? {};
  const [lang, setLang] = useState<Lang>("fr");
  const [dogs, setDogs] = useState<MyDog[]>([]);
  const [status, setStatus] = useState<"loading" | "loggedOut" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [updated, setUpdated] = useState(search.updated === "1");
  const [deleted, setDeleted] = useState(search.deleted === "1");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/match/mine", { headers: { accept: "application/json" } });
        const data = await res.json();
        if (cancelled) return;
        if (!data.user) { setStatus("loggedOut"); return; }
        setLang(normalizeLang(data.user.lang));
        setDogs(data.dogs);
        setStatus("ready");
      } catch {
        if (!cancelled) { setStatus("error"); setError(""); }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const L = lang;

  return (
    <>
      <AppHeader active="match" />
      <section className="flex-1 bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-12">
        <div className="mx-auto max-w-2xl">
          <div className="mb-8 text-center">
            <LangToggle lang={lang} className="mb-4" />
            <span className="block text-5xl">🐕</span>
            <h1 className="mt-4 text-3xl font-extrabold tracking-tight text-gray-900">{t("mydogs.heading", L)}</h1>
            <p className="mt-2 text-gray-600">{t("mydogs.subtitle", L)}</p>
          </div>

          {updated && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">{t("mydogs.updated", L)}</div>}
          {deleted && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">{t("mydogs.deleted", L)}</div>}

          {status === "loading" && (
            <div className="flex justify-center py-12">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--pawls-cream-200)] border-t-[var(--pawls-terracotta-500)]" />
            </div>
          )}
          {status === "loggedOut" && (
            <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{t("match.loggedOutTitle", L)}</h2>
              <Link to="/login" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white">{t("match.logIn", L)}</Link>
            </div>
          )}
          {status === "error" && (
            <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{t("match.error", L)}</h2>
              {error && <p className="mt-2 text-sm text-gray-600">{error}</p>}
            </div>
          )}
          {status === "ready" && dogs.length === 0 && (
            <div className="rounded-2xl border border-[var(--pawls-cream-200)] bg-white px-6 py-12 text-center">
              <h2 className="text-xl font-bold text-gray-900">{t("mydogs.empty", L)}</h2>
              <Link to="/match/create" className="mt-4 inline-flex items-center gap-2 rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-2.5 text-sm font-semibold text-white">{t("match.createProfile", L)}</Link>
            </div>
          )}
          {status === "ready" && dogs.length > 0 && (
            <div className="space-y-6">
              {dogs.map((dog) => <DogCard key={dog.id} dog={dog} lang={L} />)}
            </div>
          )}

          <div className="mt-8 text-center">
            <Link to="/match" className="text-sm font-medium text-[var(--pawls-terracotta-500)]">{t("mydogs.back", L)}</Link>
          </div>
        </div>
      </section>
      <AppFooter />
    </>
  );
}

function DogCard({ dog, lang }: { dog: MyDog; lang: Lang }) {
  const L = lang;
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center gap-4 rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-5 shadow-sm">
        <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-xl bg-[var(--pawls-cream-50)] text-3xl">🐶</div>
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-900">{dog.dog_name}</h3>
          <p className="text-sm text-gray-500">{dog.breed}</p>
          <p className="mt-0.5 text-xs text-gray-400">{dog.profile_visibility === "hidden" ? t("mydogs.visibilityHidden", L) : t("mydogs.visibilityPublic", L)}</p>
        </div>
        <button onClick={() => setEditing(true)} className="rounded-full bg-[var(--pawls-terracotta-500)] px-4 py-1.5 text-xs font-semibold text-white">{t("mydogs.edit", L)}</button>
      </div>
    );
  }

  return (
    <form method="POST" action="/api/match/dog/edit" className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-5 shadow-sm">
      <input type="hidden" name="dogId" value={dog.id} />
      <input type="hidden" name="next" value="/match/my-dogs?updated=1" />
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-900">{dog.dog_name}</h3>
        <button type="button" onClick={() => setEditing(false)} className="text-xs font-medium text-gray-400">{t("mydogs.cancel", L)}</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={labelClass}>{t("create.dogName", L)}</label>
          <input className={inputClass} name="dog_name" defaultValue={dog.dog_name} maxLength={120} /></div>
        <div><label className={labelClass}>{t("create.breed", L)}</label>
          <input className={inputClass} name="breed" defaultValue={dog.breed} maxLength={120} /></div>
        <div><label className={labelClass}>{t("mydogs.sex", L)}</label>
          <select className={inputClass} name="sex" defaultValue={dog.sex ?? ""}>
            <option value="">{t("mydogs.notSpecified", L)}</option>
            <option value="male">{t("mydogs.male", L)}</option>
            <option value="female">{t("mydogs.female", L)}</option>
          </select></div>
        <div><label className={labelClass}>{t("mydogs.birthDate", L)}</label>
          <input className={inputClass} type="date" name="date_of_birth" defaultValue={dog.date_of_birth ?? ""} /></div>
        <div><label className={labelClass}>{t("mydogs.weight", L)}</label>
          <input className={inputClass} type="number" step="0.1" min="0.5" max="150" name="weight_kg" defaultValue={dog.weight_kg ?? ""} /></div>
        <div><label className={labelClass}>{t("create.energy", L)}</label>
          <select className={inputClass} name="energy_level" defaultValue={dog.energy_level ?? "medium"}>
            <option value="low">{t("create.energyLow", L)}</option>
            <option value="medium">{t("create.energyMedium", L)}</option>
            <option value="high">{t("create.energyHigh", L)}</option>
          </select></div>
        <div><label className={labelClass}>{t("create.temperament", L)}</label>
          <input className={inputClass} name="temperament" defaultValue={dog.temperament ?? ""} maxLength={300} /></div>
        <div><label className={labelClass}>{t("mydogs.vaccination", L)}</label>
          <input className={inputClass} name="vaccination_status" defaultValue={dog.vaccination_status ?? ""} maxLength={60} /></div>
        <div><label className={labelClass}>{t("mydogs.dogFriendly", L)}</label>
          <select className={inputClass} name="dog_friendly" defaultValue={dog.dog_friendly === null ? "" : String(dog.dog_friendly)}>
            <option value="">—</option><option value="true">{t("mydogs.yes", L)}</option><option value="false">{t("mydogs.no", L)}</option>
          </select></div>
        <div><label className={labelClass}>{t("mydogs.childFriendly", L)}</label>
          <select className={inputClass} name="child_friendly" defaultValue={dog.child_friendly === null ? "" : String(dog.child_friendly)}>
            <option value="">—</option><option value="true">{t("mydogs.yes", L)}</option><option value="false">{t("mydogs.no", L)}</option>
          </select></div>
        <div><label className={labelClass}>{t("mydogs.neutered", L)}</label>
          <select className={inputClass} name="neutered_spayed" defaultValue={dog.neutered_spayed === null ? "" : String(dog.neutered_spayed)}>
            <option value="">—</option><option value="true">{t("mydogs.yes", L)}</option><option value="false">{t("mydogs.no", L)}</option>
          </select></div>
        <div><label className={labelClass}>{t("mydogs.visibility", L)}</label>
          <select className={inputClass} name="profile_visibility" defaultValue={dog.profile_visibility}>
            <option value="public">{t("mydogs.visibilityPublic", L)}</option>
            <option value="hidden">{t("mydogs.visibilityHidden", L)}</option>
          </select></div>
        <div className="col-span-2"><label className={labelClass}>{t("create.bio", L)}</label>
          <textarea className={inputClass} name="bio" rows={2} maxLength={1000} defaultValue={dog.bio ?? ""} /></div>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <button type="submit" className="rounded-full bg-[var(--pawls-terracotta-500)] px-5 py-2 text-sm font-semibold text-white">{t("mydogs.save", L)}</button>
        <DeleteDogForm dogId={dog.id} lang={L} />
      </div>
    </form>
  );
}

function DeleteDogForm({ dogId, lang }: { dogId: number; lang: Lang }) {
  const [confirm, setConfirm] = useState(false);
  const L = lang;
  return (
    <form method="POST" action="/api/match/dog/delete" className="flex items-center gap-2">
      <input type="hidden" name="dogId" value={dogId} />
      <input type="hidden" name="next" value="/match/my-dogs?deleted=1" />
      <label className="flex items-center gap-1 text-xs text-gray-500">
        <input type="checkbox" name="confirm" value="1" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
        {t("mydogs.confirmDelete", L)}
      </label>
      <button type="submit" disabled={!confirm} className={`rounded-full border px-4 py-1.5 text-xs font-semibold ${confirm ? "border-red-300 text-red-500 hover:bg-red-50" : "cursor-not-allowed border-gray-200 text-gray-300"}`}>
        {t("mydogs.delete", L)}
      </button>
    </form>
  );
}
