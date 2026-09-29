/**
 * Dog photo display primitives (P0 batch B).
 *
 * One honest way to show a dog photo — and one honest way to show that there is
 * none. Before this, the Match deck fell back to a size emoji and the list
 * avatars to "🐶", which implies a picture the user never uploaded. A neutral
 * paw MARK plus the words "Aucune photo" is a placeholder, not a claim, and it
 * never pretends to be the dog.
 *
 * Also degrades honestly at render time: if a stored URL 404s (a file removed
 * from storage, an old dead link), the image is replaced by the same placeholder
 * instead of a broken-image glyph — the surface never lies about what it has.
 *
 * No CSS file changes: sizing is entirely Tailwind classes passed by the caller
 * (see the pawls CSS-cascade gotcha: app.css rules must stay inside @layer).
 */
import { useState } from "react";

/** Neutral paw mark used wherever a dog photo is missing. Never an emoji. */
export function PawGlyph({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" focusable="false" className={className} fill="currentColor">
      <ellipse cx="18" cy="22" rx="6.5" ry="8.5" />
      <ellipse cx="31" cy="15" rx="6.5" ry="9" />
      <ellipse cx="44" cy="20" rx="6.5" ry="8.5" />
      <ellipse cx="52" cy="33" rx="6" ry="7.5" />
      <path d="M32 27c8.6 0 15.8 6.4 15.8 14 0 6.5-5.6 10.2-15.8 10.2S16.2 47.5 16.2 41C16.2 33.4 23.4 27 32 27Z" />
    </svg>
  );
}

export interface DogPhotoProps {
  src: string | null | undefined;
  /** Accessible description of the dog (used as alt text). */
  alt: string;
  /** Classes for the <img> (sizing / rounding / object-fit). */
  className?: string;
  /** Classes for the placeholder wrapper (usually the same box as the img). */
  placeholderClassName?: string;
  glyphClassName?: string;
  /** Optional visible caption under the mark, e.g. "Aucune photo". */
  label?: string;
  labelClassName?: string;
}

/**
 * Renders the dog photo when there is a usable one, and an honest placeholder
 * otherwise (missing URL, or an image that fails to load).
 */
export function DogPhoto({
  src,
  alt,
  className = "h-full w-full object-cover",
  placeholderClassName = "flex h-full w-full flex-col items-center justify-center gap-1 text-[var(--pawls-terracotta-500)]",
  glyphClassName = "h-8 w-8 opacity-50",
  label,
  labelClassName = "text-xs font-medium text-[var(--pawls-ink-700)]",
}: DogPhotoProps) {
  const [broken, setBroken] = useState(false);

  if (src && !broken) {
    return (
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={className}
        onError={() => setBroken(true)}
      />
    );
  }

  return (
    <div className={placeholderClassName} role="img" aria-label={`${alt} — ${label ?? ""}`.trim()}>
      <PawGlyph className={glyphClassName} />
      {label ? <span className={labelClassName}>{label}</span> : null}
    </div>
  );
}
