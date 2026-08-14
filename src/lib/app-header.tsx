import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { AppIcon, type AppIconName } from "./app-icon";
import { t, DEFAULT_LANG, type Lang } from "./i18n";

interface AppHeaderProps {
  active?: string;
  /** Defaults to FR (public pages). Full-site i18n phase wires real lang state. */
  lang?: Lang;
}

export function AppHeader({ active, lang = DEFAULT_LANG }: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  // Navigation is deliberately route-based: the landing page is logged-out,
  // while every interior route gets the complete product toolbar.
  const isLanding = pathname === "/";
  const closeMenu = () => setMenuOpen(false);
  const iconLink = (to: string, icon: AppIconName, label: string, opts?: { highlight?: boolean }) => {
    const isActive = opts?.highlight ?? active === to;
    return <Link to={to} aria-current={isActive ? "page" : undefined} onClick={closeMenu} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-[var(--pawls-cream-50)] hover:text-[var(--pawls-terracotta-500)]"><AppIcon name={icon} /><span className="hidden sm:inline">{label}</span></Link>;
  };
  const dropdownLink = (to: string, icon: AppIconName, label: string) => active === to ? null : <Link to={to} onClick={closeMenu} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-gray-600 hover:bg-[var(--pawls-cream-50)] hover:text-[var(--pawls-terracotta-500)]"><AppIcon name={icon} />{label}</Link>;
  const coreLinks = [{ to: "/match", icon: "match" as const, label: t("nav.match", lang), highlight: active === "match" || active === "matches" }, { to: "/breed", icon: "breed" as const, label: t("nav.breed", lang), highlight: active === "breed" }, { to: "/book", icon: "book" as const, label: t("nav.book", lang), highlight: active === "book" }, { to: "/rescue", icon: "rescue" as const, label: t("nav.rescue", lang), highlight: active === "rescue" }];
  const secondaryLinks = [{ to: "/connect", icon: "connect" as const, label: t("nav.connect", lang) }, { to: "/venues", icon: "venues" as const, label: t("nav.venues", lang) }, { to: "/viral", icon: "viral" as const, label: t("nav.viral", lang) }, { to: "/invite", icon: "invite" as const, label: t("nav.invite", lang) }, { to: "/settings", icon: "settings" as const, label: t("nav.settings", lang) }];
  return <header className="sticky top-0 z-50 isolate border-b-2 border-[var(--pawls-cream-200)] bg-white shadow-sm"><div className="mx-auto flex min-h-14 max-w-6xl items-center justify-between gap-1 px-3 py-2 sm:min-h-16 sm:px-6 sm:py-3">
    <Link to="/" className="flex shrink-0 items-center" onClick={closeMenu}><img src="/logo-full.png" alt="Pawls" className="block h-10 w-10 object-contain sm:h-12 sm:w-12" /></Link>
    <nav className={`flex items-center gap-0.5 sm:gap-1 ${isLanding ? "ml-auto" : ""}`}>
      {(isLanding ? coreLinks.slice(0, 4) : coreLinks).map(l => iconLink(l.to, l.icon, l.label, { highlight: l.highlight }))}
      {!isLanding && <span className="hidden md:contents">{secondaryLinks.map(l => iconLink(l.to, l.icon, l.label))}</span>}
      {isLanding ? <Link to="/register" className="ml-1 rounded-full bg-[var(--pawls-terracotta-500)] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[var(--pawls-terracotta-600)] sm:px-4 sm:text-sm">{t("nav.signUp", lang)}</Link> : active !== "plus" && <Link to="/plus" onClick={closeMenu} className="ml-1 flex items-center gap-1 rounded-full bg-gradient-to-r from-[var(--pawls-gold-400)] to-[var(--pawls-terracotta-500)] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:from-[var(--pawls-gold-500)] hover:to-[var(--pawls-terracotta-600)]"><AppIcon name="plus" /><span className="hidden sm:inline">{t("nav.plus", lang)}</span></Link>}
      {!isLanding && <button type="button" onClick={() => setMenuOpen(o => !o)} className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pawls-cream-50)] text-[var(--pawls-terracotta-500)] hover:bg-[var(--pawls-cream-100)] md:hidden" aria-label={menuOpen ? t("nav.closeMenu", lang) : t("nav.openMenu", lang)} aria-expanded={menuOpen}><AppIcon name="menu" active={menuOpen} /></button>}
    </nav></div>
    {menuOpen && <div className="border-t border-[var(--pawls-cream-200)] bg-white px-4 py-3 shadow-md md:hidden"><nav className="mx-auto flex max-w-6xl flex-col gap-0.5">{secondaryLinks.map(l => dropdownLink(l.to, l.icon, l.label))}</nav></div>}
  </header>;
}

export function AppFooter({ lang = DEFAULT_LANG }: { lang?: Lang }) {
  return <footer className="mt-auto border-t border-[var(--pawls-cream-200)] bg-white px-6 py-8"><div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row"><img src="/logo-full.png" alt="Pawls" className="h-8" /><p className="text-sm text-gray-500">{t("footer.tagline", lang)} <Link to="/privacy" className="underline hover:text-[var(--pawls-terracotta-500)]">{t("footer.privacy", lang)}</Link> · <Link to="/terms" className="underline hover:text-[var(--pawls-terracotta-500)]">{t("footer.terms", lang)}</Link> · <Link to="/settings" className="underline hover:text-[var(--pawls-terracotta-500)]">{t("footer.settings", lang)}</Link></p></div></footer>;
}
