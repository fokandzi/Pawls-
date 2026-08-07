import { AppHeader, AppFooter } from "../lib/app-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { createMatchTables } from "../db/schema";
import { parisDogProfiles } from "../db/dog-seed";
import { seoHead, SEO } from "../lib/seo";

type DogProfile = { id:number; owner_name:string; dog_name:string; breed:string; age:number; size:string; energy_level:string; temperament:string; bio:string|null; photo_url:string|null; location:string; email:string|null; instagram:string|null; tiktok:string|null; twitter:string|null; youtube:string|null };
const sizeEmoji: Record<string,string> = {small:"🐶",medium:"🐕",large:"🦮"};
const energyBadge: Record<string,{bg:string;text:string;label:string}> = {low:{bg:"bg-blue-100",text:"text-blue-700",label:"Low Energy"},medium:{bg:"bg-[var(--pawls-cream-100)]",text:"text-[var(--pawls-gold-500)]",label:"Medium Energy"},high:{bg:"bg-red-100",text:"text-red-700",label:"High Energy"}};
const sizeLabel: Record<string,string> = {small:"Small",medium:"Medium",large:"Large"};
function staticProfiles(): DogProfile[] { return parisDogProfiles.map((p,i)=>({id:1000+i,owner_name:p[0],dog_name:p[1],breed:p[2],age:p[3],size:p[4],energy_level:p[5],temperament:(p[6] as string[]).join(", "),bio:p[7],photo_url:`https://placedog.net/400/400?id=${i+1}`,location:p[8],email:null,instagram:null,tiktok:null,twitter:null,youtube:null})); }

/** Parse comma-separated IDs from a URL search param. TanStack may auto-parse
 * values as strings, numbers, or arrays — coerce to string first. */
function parseIds(raw: unknown): number[] {
  if (raw == null) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  return values
    .flatMap((value) => String(value).split(","))
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isSafeInteger(value) && value > 0);
}

export const Route = createFileRoute("/match")({
  head:()=>seoHead(SEO.match),
  loader: async (ctx:any) => {
    const rawSearch = ctx.location?.search;
    // Depending on the SSR entry point, search can be the router object or a
    // raw query string. Normalize both so swipe state survives every request.
    const search = (typeof rawSearch === "string"
      ? Object.fromEntries(new URLSearchParams(rawSearch.startsWith("?") ? rawSearch.slice(1) : rawSearch).entries())
      : (rawSearch ?? {})) as Record<string, unknown>;
    // Swipe state from URL params — no cookies, no client JS needed
    const swiped = parseIds(search.swiped);
    const liked  = parseIds(search.liked);
    const matched = parseIds(search.matched);
    const swipe = search.swipe === "left" || search.swipe === "right" ? search.swipe : null;
    const target = Number(search.target)||0;

    if (swipe && target) {
      const nextSwiped = [...swiped, target];
      const nextLiked  = swipe === "right" ? [...liked, target] : liked;
      const nextMatched = swipe === "right" && liked.includes(target) ? [...matched, target] : matched;
      // Return filtered profiles with updated URL state (caller includes params in links)
      return {
        profiles: staticProfiles().filter(p => !nextSwiped.includes(p.id)),
        currentIndex: 0, profileId: null, matchResult: null, isPlus: false, error: "",
        swiped: nextSwiped, liked: nextLiked, matched: nextMatched,
        justMatched: swipe === "right" && liked.includes(target) ? target : null,
      };
    }

    let profiles: DogProfile[] = [];
    try { profiles = staticProfiles(); await createMatchTables(); } catch { profiles = staticProfiles(); }
    profiles = profiles.filter(p => !swiped.includes(p.id));
    return { profiles, currentIndex: 0, profileId: null, matchResult: null, isPlus: false, error: "", swiped, liked, matched, justMatched: null };
  }, component: MatchPage,
});

function buildSwipeUrl(swiped: number[], liked: number[], matched: number[], direction: string, targetId: number): string {
  const s = swiped.join(",");
  const l = liked.join(",");
  const m = matched.join(",");
  return `/match?swipe=${direction}&target=${targetId}&swiped=${s}&liked=${l}&matched=${m}`;
}

function MatchPage(){ return <div className="flex min-h-dvh flex-col"><AppHeader active="match"/><SwipeUI/><AppFooter/></div>; }

function SwipeUI(){
 const data = Route.useLoaderData() as any;
 const profiles: DogProfile[] = data.profiles;
 const swipedNums: number[] = data.swiped || [];
 const likedNums: number[] = data.liked || [];
 const matchedNums: number[] = data.matched || [];
 const justMatched: number | null = data.justMatched || null;

 if (!profiles.length) return <section className="flex flex-1 items-center justify-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-20"><div className="text-center"><h2 className="text-2xl font-bold text-gray-900">No more dogs in your area</h2><p className="mt-2 text-gray-600">Check back soon — new playmates join every day!</p><Link to="/match/matches" className="mt-6 inline-flex rounded-full bg-[var(--pawls-terracotta-500)] px-6 py-3 font-semibold text-white">View Your Matches</Link></div></section>;

 const current = profiles[0];
 const energy = energyBadge[current.energy_level]??energyBadge.medium;
 const leftUrl = buildSwipeUrl(swipedNums, likedNums, matchedNums, "left", current.id);
 const rightUrl = buildSwipeUrl(swipedNums, likedNums, matchedNums, "right", current.id);

 return <section className="relative flex flex-1 flex-col items-center bg-gradient-to-b from-[var(--pawls-cream-50)] to-white px-6 py-8">
   {justMatched && <div className="mb-4 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-center"><span className="text-2xl">🎉</span><p className="font-bold text-emerald-700">It's a match!</p></div>}
   <p className="mb-4 text-sm text-gray-400">1 of {profiles.length} · {swipedNums.length} swiped</p>
   <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--pawls-cream-100)] bg-white shadow-lg">
     <div className="relative flex h-56 items-center justify-center overflow-hidden bg-gradient-to-br from-[var(--pawls-cream-100)] to-[var(--pawls-cream-50)]">
       <span className="absolute text-8xl">{sizeEmoji[current.size]??"🐶"}</span>
       {current.photo_url&&<img src={current.photo_url} alt={current.dog_name} className="relative z-10 h-full w-full object-cover"/>}
     </div>
     <div className="p-5">
       <div className="flex items-start justify-between">
         <div><h2 className="text-2xl font-bold text-gray-900">{current.dog_name}</h2><p className="text-sm text-gray-500">{current.breed}</p></div>
         <span className="text-2xl font-bold text-[var(--pawls-terracotta-500)]">{current.age}y</span>
       </div>
       <div className="my-3 flex flex-wrap gap-2">
         <span className="rounded-full bg-[var(--pawls-cream-50)] px-2.5 py-1 text-xs">{sizeEmoji[current.size]} {sizeLabel[current.size]}</span>
         <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${energy.bg} ${energy.text}`}>{energy.label}</span>
         <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs">{current.temperament}</span>
       </div>
       <p className="text-sm text-gray-500">{current.location}</p>
       {current.bio&&<p className="mt-3 text-sm leading-relaxed text-gray-700">{current.bio}</p>}
       <p className="mt-3 text-xs text-gray-400">Owner: {current.owner_name}</p>
     </div>
   </div>
   <div className="mt-8 flex items-center gap-8">
     {/* Plain full-navigation links: rel=external + target=_self guarantee the
         browser performs a full page load with the swipe query params intact —
         no router/client-side interception can drop or mangle them. */}
     <a href={leftUrl} aria-label="Pass" rel="external" target="_self" className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-red-300 bg-white text-3xl text-red-400 shadow-md">✕</a>
     <a href={rightUrl} aria-label="Like" rel="external" target="_self" className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-emerald-300 bg-white text-3xl text-emerald-400 shadow-md">♥</a>
   </div>
   <Link to="/match/matches" className="mt-4 text-sm text-gray-400">View matches →</Link>
 </section>;
}
