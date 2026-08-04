import { useState } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { AppIcon, type AppIconName } from "./app-icon";

interface AppHeaderProps { active?: string; }
export function AppHeader({ active }: AppHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  // Navigation is deliberately route-based: the landing page is logged-out,
  // while every interior route gets the complete product toolbar.
  const isLanding = pathname === "/";
  const closeMenu = () => setMenuOpen(false);
  const iconLink = (to: string, icon: AppIconName, label: string, opts?: { highlight?: boolean }) => {
    const isActive = opts?.highlight ?? active === to;
    return <Link to={to} aria-current={isActive ? "page" : undefined} onClick={closeMenu} className="flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-sm font-medium text-gray-600 transition-all hover:bg-[var(--pawls-cream-50)] hover:text-[var(--pawls-terracotta-500)]"><AppIcon name={icon} /><span className="hidden md:inline">{label}</span></Link>;
  };
  const dropdownLink = (to: string, icon: AppIconName, label: string) => active === to ? null : <Link to={to} onClick={closeMenu} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-base font-medium text-gray-600 hover:bg-[var(--pawls-cream-50)] hover:text-[var(--pawls-terracotta-500)]"><AppIcon name={icon} />{label}</Link>;
  const coreLinks = [{ to: "/match", icon: "match" as const, label: "Match", highlight: active === "match" || active === "matches" }, { to: "/breed", icon: "breed" as const, label: "Breed", highlight: active === "breed" }, { to: "/book", icon: "book" as const, label: "Book", highlight: active === "book" }, { to: "/rescue", icon: "rescue" as const, label: "Rescue", highlight: active === "rescue" }];
  const secondaryLinks = [{ to: "/connect", icon: "connect" as const, label: "Connect" }, { to: "/venues", icon: "venues" as const, label: "Venues" }, { to: "/viral", icon: "viral" as const, label: "Viral" }, { to: "/invite", icon: "invite" as const, label: "Invite" }, { to: "/settings", icon: "settings" as const, label: "Settings" }];
  return <header className="sticky top-0 z-50 border-b border-[var(--pawls-cream-200)] bg-white/95 backdrop-blur-md"><div className="mx-auto flex max-w-6xl items-center justify-between gap-1 px-2 py-2 sm:px-6 sm:py-3">
    <Link to="/" className="flex shrink-0 items-center" onClick={closeMenu}><img src="/logo-full.png" alt="Pawls" className="h-6 sm:h-7" /></Link>
    <nav className={`flex items-center gap-0.5 sm:gap-1 ${isLanding ? "ml-auto" : ""}`}>
      {(isLanding ? coreLinks.slice(0, 2) : coreLinks).map(l => iconLink(l.to, l.icon, l.label, { highlight: l.highlight }))}
      {!isLanding && <span className="hidden md:contents">{secondaryLinks.map(l => iconLink(l.to, l.icon, l.label))}</span>}
      {isLanding ? <a href="#waitlist" className="ml-1 rounded-full bg-[var(--pawls-terracotta-500)] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-colors hover:bg-[var(--pawls-terracotta-600)] sm:px-4 sm:text-sm">Join waitlist</a> : active !== "plus" && <Link to="/plus" onClick={closeMenu} className="ml-1 flex items-center gap-1 rounded-full bg-gradient-to-r from-[var(--pawls-gold-400)] to-[var(--pawls-terracotta-500)] px-3 py-1.5 text-xs font-bold text-white shadow-sm transition-all hover:from-[var(--pawls-gold-500)] hover:to-[var(--pawls-terracotta-600)]"><AppIcon name="plus" /><span className="hidden sm:inline">Plus</span></Link>}
      {!isLanding && <button type="button" onClick={() => setMenuOpen(o => !o)} className="ml-0.5 flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--pawls-cream-50)] text-[var(--pawls-terracotta-500)] hover:bg-[var(--pawls-cream-100)] md:hidden" aria-label={menuOpen ? "Close menu" : "Open menu"} aria-expanded={menuOpen}><AppIcon name="menu" active={menuOpen} /></button>}
    </nav></div>
    {menuOpen && <div className="border-t border-[var(--pawls-cream-200)] bg-white px-4 py-3 shadow-md md:hidden"><nav className="mx-auto flex max-w-6xl flex-col gap-0.5">{secondaryLinks.map(l => dropdownLink(l.to, l.icon, l.label))}</nav></div>}
  </header>;
}
export function AppFooter() { return <footer className="mt-auto border-t border-[var(--pawls-cream-200)] bg-white px-6 py-8"><div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row"><img src="/logo-full.png" alt="Pawls" className="h-8" /><p className="text-sm text-gray-500">The all-in-one platform for dog people. <Link to="/privacy" className="underline hover:text-[var(--pawls-terracotta-500)]">Privacy</Link> · <Link to="/terms" className="underline hover:text-[var(--pawls-terracotta-500)]">Terms</Link> · <Link to="/settings" className="underline hover:text-[var(--pawls-terracotta-500)]">Settings</Link></p></div></footer>; }
