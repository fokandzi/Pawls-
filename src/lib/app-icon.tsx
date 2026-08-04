import type { CSSProperties } from "react";

export type AppIconName =
  | "match" | "breed" | "book" | "rescue" | "connect" | "venues" | "viral"
  | "invite" | "settings" | "plus" | "menu" | "logo" | "empty-no-community"
  | "empty-no-matches" | "empty-no-trending";

const files = import.meta.glob("../styles/icons/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

function svgFor(name: AppIconName, active: boolean) {
  const suffix = active ? "-active" : "";
  return files[`../styles/icons/${name.startsWith("empty-") ? name : `icon-${name}`}${suffix}.svg`];
}

/** The shared Pawls icon. SVGs are bundled inline so they work offline in the PWA. */
export function AppIcon({ name, active = false, size, className = "", label }: {
  name: AppIconName;
  active?: boolean;
  size?: number;
  className?: string;
  label?: string;
}) {
  const raw = svgFor(name, active) || svgFor(name, false);
  if (!raw) return null;
  const style: CSSProperties | undefined = size ? { width: size, height: size } : undefined;
  return <span className={`pawls-icon ${active ? "pawls-icon--active" : ""} ${className}`} style={style} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true} dangerouslySetInnerHTML={{ __html: raw }} />;
}
