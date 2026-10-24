import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { seoHead } from "../lib/seo";
import { t, normalizeLang, DEFAULT_LANG, type Lang } from "../lib/i18n";
import { LangToggle } from "../lib/lang-toggle";
import { DogPhoto } from "../lib/dog-photo-ui";

type MyDog = {
  id: number; dog_name: string; breed: string; size: string | null;
  energy_level: string | null; temperament: string | null; bio: string | null;
  photo_url: string | null;
  sex: string | null; date_of_birth: string | null; weight_kg: number | null;
  dog_friendly: boolean | null; child_friendly: boolean | null;
  vaccination_status: string | null; neutered_spayed: boolean | null;
  profile_visibility: string; location: string | null;
};

export const Route = createFileRoute("/match/my-dogs")({
  // FR-first SSR title/meta (P2 item 5): t("mydogs.title") already existed and
  // was only used inside the page — the <title> was hard-coded EN.
  head: () =>
    seoHead({
      title: t("mydogs.title", DEFAULT_LANG),
      description: t("mydogs.seoDesc", DEFAULT_LANG),
      path: "/match/my-dogs",
    }),
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
  // Photo notices come from the server redirect
  // (?photo=saved|removed|failed|unavailable) — "failed" is the honest outcome
  // when a photo could not be stored, so the owner is told instead of silently
  // losing their upload. "unavailable" means object storage is not configured
  // here (503): nothing was saved, and retrying cannot help until it is set up.
  const [photoNotice] = useState<string>(
    search.photo === "saved" ||
      search.photo === "removed" ||
      search.photo === "failed" ||
      search.photo === "unavailable"
      ? String(search.photo)
      : "",
  );

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
          {photoNotice === "saved" && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">{t("photo.saved", L)}</div>}
          {photoNotice === "removed" && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-700">{t("photo.removed", L)}</div>}
          {photoNotice === "failed" && <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-800">{t("photo.failed", L)}</div>}
          {photoNotice === "unavailable" && <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-semibold text-amber-800">{t("photo.unavailable", L)}</div>}

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
      <div className="rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-xl bg-[var(--pawls-cream-50)]">
            <DogPhoto src={dog.photo_url} alt={dog.dog_name} glyphClassName="h-8 w-8 opacity-50" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900">{dog.dog_name}</h3>
            <p className="text-sm text-gray-500">{dog.breed}</p>
            <p className="mt-0.5 text-xs text-gray-400">{dog.profile_visibility === "hidden" ? t("mydogs.visibilityHidden", L) : t("mydogs.visibilityPublic", L)}</p>
          </div>
          <button onClick={() => setEditing(true)} className="rounded-full bg-[var(--pawls-terracotta-500)] px-4 py-1.5 text-xs font-semibold text-white">{t("mydogs.edit", L)}</button>
        </div>
        <DogPhotoAdmin dog={dog} lang={L} />
      </div>
    );
  }

  return (
    <>
    <DogPhotoAdmin dog={dog} lang={L} boxed />
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
    </>
  );
}

/**
 * Owner-only photo control: replace (upload) or remove the dog's photo.
 *
 * Two separate, plain HTML forms POSTing to the authenticated native endpoint
 * /api/match/dog/photo (multipart). Served only to the owner — but note the
 * authority is the SERVER: the endpoint re-checks the session and dog ownership
 * on every request, so hiding or hand-crafting this control changes nothing.
 * On failure the endpoint answers an honest FR page and photo_url is untouched.
 */
function DogPhotoAdmin({ dog, lang, boxed = false }: { dog: MyDog; lang: Lang; boxed?: boolean }) {
  const L = lang;
  const fileClass =
    "block w-full min-w-[11rem] flex-1 text-xs text-gray-500 file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-[var(--pawls-cream-100)] file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--pawls-ink-700)]";
  const body = (
    <>
      <div className="flex items-start gap-3">
        <div className="h-14 w-14 flex-shrink-0 overflow-hidden rounded-xl bg-[var(--pawls-cream-50)]">
          <DogPhoto src={dog.photo_url} alt={dog.dog_name} glyphClassName="h-7 w-7 opacity-50" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-gray-600">{t("photo.label", L)}</p>
          <form
            method="POST"
            action="/api/match/dog/photo"
            encType="multipart/form-data"
            className="mt-1.5 flex flex-wrap items-center gap-2"
          >
            <input type="hidden" name="dogId" value={dog.id} />
            <input type="hidden" name="action" value="upload" />
            <input type="hidden" name="next" value="/match/my-dogs?photo=saved" />
            <input
              type="file"
              name="photo"
              required
              accept="image/jpeg,image/png,image/webp"
              aria-label={t("photo.label", L)}
              className={fileClass}
            />
            <button
              type="submit"
              className="rounded-full bg-[var(--pawls-terracotta-500)] px-4 py-1.5 text-xs font-semibold text-white"
            >
              {dog.photo_url ? t("photo.replace", L) : t("photo.add", L)}
            </button>
          </form>
          <p className="mt-1.5 text-xs text-gray-400">{t("photo.hint", L)}</p>
          {dog.photo_url ? (
            <form method="POST" action="/api/match/dog/photo" className="mt-1.5">
              <input type="hidden" name="dogId" value={dog.id} />
              <input type="hidden" name="action" value="remove" />
              <input type="hidden" name="next" value="/match/my-dogs?photo=removed" />
              <button type="submit" className="text-xs font-medium text-gray-400 underline">
                {t("photo.remove", L)}
              </button>
            </form>
          ) : (
            <p className="mt-1.5 text-xs text-gray-400">{t("photo.noneHint", L)}</p>
          )}
        </div>
      </div>
    </>
  );
  if (boxed) {
    return (
      <div className="mb-3 rounded-2xl border border-[var(--pawls-cream-100)] bg-white p-5 shadow-sm">
        {body}
      </div>
    );
  }
  return <div className="mt-4 border-t border-[var(--pawls-cream-100)] pt-4">{body}</div>;
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
