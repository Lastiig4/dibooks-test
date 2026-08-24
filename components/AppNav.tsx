"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, type ReactNode, type Ref } from "react";
import AuthModal from "@/components/AuthModal";
import NotificationBell from "@/components/NotificationBell";
import { useDemoAuth, type PublicSignupPlan } from "@/lib/auth";
import {
  DIBOOKS_OPEN_AUTH_EVENT,
  type OpenAuthDetail,
} from "@/lib/plans";

function DiBooksMiniLogo() {
  return (
    <Link href="/" className="group flex items-end leading-none" aria-label="DiBooks Library">
      <span className="text-4xl font-black tracking-tight text-white transition group-hover:text-blue-200 sm:text-5xl">DI</span>
      <span className="ml-1 text-4xl italic text-white transition group-hover:text-blue-200 sm:text-5xl" style={{ fontFamily: "Georgia, Times New Roman, serif" }}>Books</span>
    </Link>
  );
}

type MenuPosition = { top: number; left: number };

function MenuPanel({ children, position, panelRef }: { children: ReactNode; position: MenuPosition | null; panelRef: Ref<HTMLDivElement> }) {
  if (typeof document === "undefined" || !position) return null;
  return createPortal(
    <div ref={panelRef} style={{ top: position.top, left: position.left }} className="fixed z-[2147483000] w-[min(22rem,calc(100vw-2rem))] rounded-3xl border border-white/10 bg-[#080b12]/95 p-3 shadow-2xl shadow-black/70 backdrop-blur-xl">
      {children}
    </div>,
    document.body,
  );
}

function MenuLink({ href, icon, title, subtitle }: { href: string; icon: string; title: string; subtitle?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/10">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/8 text-lg ring-1 ring-white/10">{icon}</span>
      <span className="min-w-0">
        <span className="block text-sm font-black text-white">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-xs font-bold text-neutral-500">{subtitle}</span>}
      </span>
    </Link>
  );
}

function IconButton({ children, title, active = false, onClick, buttonRef }: { children: ReactNode; title: string; active?: boolean; onClick?: () => void; buttonRef?: Ref<HTMLButtonElement> }) {
  return (
    <button type="button" ref={buttonRef} onClick={onClick} title={title} aria-label={title} className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-lg font-black shadow-lg transition hover:-translate-y-0.5 ${active ? "border-blue-300/40 bg-blue-500/20 text-blue-100" : "border-white/10 bg-white/[0.035] text-white hover:border-white/30 hover:bg-white/10"}`}>
      {children}
    </button>
  );
}

function GuestAuthButtons({ compact, onLogin, onRegister }: { compact?: boolean; onLogin: () => void; onRegister: () => void }) {
  return (
    <div className={`flex items-center gap-2 ${compact ? "scale-[0.96] origin-right" : ""}`}>
      <Link href="/editor" title="Probeer Auteur Studio" aria-label="Probeer Auteur Studio" className="hidden h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-500/12 text-xl font-black text-cyan-100 shadow-lg transition hover:-translate-y-0.5 hover:bg-cyan-500/20 sm:flex">✒️</Link>
      <button type="button" onClick={onLogin} className="rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-white/10 sm:px-5">Login</button>
      <button type="button" onClick={onRegister} className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/30 transition hover:-translate-y-0.5 hover:bg-blue-500 sm:px-5">Registreer</button>
    </div>
  );
}

export function AppNavActions({ compact = false }: { compact?: boolean }) {
  const { isLoggedIn, permissions, user, loginWithCredentials, registerWithCredentials, logout } = useDemoAuth();
  const [openMenu, setOpenMenu] = useState<"reader" | "settings" | null>(null);
  const [menuPosition, setMenuPosition] = useState<MenuPosition | null>(null);
  const [authModalMode, setAuthModalMode] = useState<"login" | "register" | null>(null);
  const [authInitialPlan, setAuthInitialPlan] = useState<PublicSignupPlan>("free");
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const readerButtonRef = useRef<HTMLButtonElement | null>(null);
  const settingsButtonRef = useRef<HTMLButtonElement | null>(null);

  function getMenuPosition(button: HTMLButtonElement | null): MenuPosition | null {
    if (!button || typeof window === "undefined") return null;
    const rect = button.getBoundingClientRect();
    const menuWidth = Math.min(352, window.innerWidth - 32);
    const left = Math.min(window.innerWidth - menuWidth - 16, Math.max(16, rect.left + rect.width / 2 - menuWidth / 2));
    return { top: rect.bottom + 12, left };
  }

  function toggleMenu(menu: "reader" | "settings", button: HTMLButtonElement | null) {
    if (openMenu === menu) { setOpenMenu(null); return; }
    setMenuPosition(getMenuPosition(button));
    setOpenMenu(menu);
  }

  function openAuth(mode: "login" | "register", plan: PublicSignupPlan = "free") {
    setOpenMenu(null);
    setAuthInitialPlan(plan);
    setAuthModalMode(mode);
  }

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpenMenu(null);
    }
    function handleKey(event: KeyboardEvent) { if (event.key === "Escape") setOpenMenu(null); }
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  useEffect(() => {
    function handleOpenAuth(event: Event) {
      const detail = (event as CustomEvent<OpenAuthDetail>).detail;
      if (!detail) return;
      openAuth(detail.mode, detail.plan ?? "free");
    }

    window.addEventListener(DIBOOKS_OPEN_AUTH_EVENT, handleOpenAuth as EventListener);
    return () => window.removeEventListener(DIBOOKS_OPEN_AUTH_EVENT, handleOpenAuth as EventListener);
  }, []);

  useEffect(() => {
    if (!openMenu) return;
    function updateFloatingMenuPosition() {
      const button = openMenu === "reader" ? readerButtonRef.current : settingsButtonRef.current;
      setMenuPosition(getMenuPosition(button));
    }
    updateFloatingMenuPosition();
    window.addEventListener("resize", updateFloatingMenuPosition);
    window.addEventListener("scroll", updateFloatingMenuPosition, true);
    return () => {
      window.removeEventListener("resize", updateFloatingMenuPosition);
      window.removeEventListener("scroll", updateFloatingMenuPosition, true);
    };
  }, [openMenu]);

  return (
    <>
      <div ref={wrapRef} className={`relative flex items-center gap-2 ${compact ? "scale-[0.96] origin-right" : ""}`}>
        {isLoggedIn ? (
          <>
            {permissions.canUseEditor && (
              <Link href="/editor" title="Auteur Studio" aria-label="Auteur Studio" className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-500/12 text-xl font-black text-cyan-100 shadow-lg transition hover:-translate-y-0.5 hover:bg-cyan-500/20">✒️</Link>
            )}
            <NotificationBell variant="inline" />
            <div className="relative">
              <IconButton title="Menu" active={openMenu === "reader"} buttonRef={readerButtonRef} onClick={() => toggleMenu("reader", readerButtonRef.current)}>👤</IconButton>
              {openMenu === "reader" && (
                <MenuPanel position={menuPosition} panelRef={menuRef}>
                  <p className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.32em] text-neutral-500">Menu</p>
                  <MenuLink href="/" icon="📚" title="Library" subtitle="Alle boeken" />
                  {permissions.canUseDashboard && <MenuLink href="/dashboard" icon="🗂️" title="Dashboard" subtitle="Mijn boeken" />}
                  <MenuLink href="/favorites" icon="★" title="Favorieten" subtitle="Bewaarde boeken" />
                  <MenuLink href="/chat" icon="💬" title="Chat" subtitle="Berichten met contacten" />
                </MenuPanel>
              )}
            </div>
            <div className="relative">
              <IconButton title="Account en instellingen" active={openMenu === "settings"} buttonRef={settingsButtonRef} onClick={() => toggleMenu("settings", settingsButtonRef.current)}>⚙️</IconButton>
              {openMenu === "settings" && (
                <MenuPanel position={menuPosition} panelRef={menuRef}>
                  <p className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.32em] text-neutral-500">Account</p>
                  <MenuLink href="/account" icon="⚙️" title="Account" subtitle={user?.email ?? "Profiel en plan"} />
                  {user?.role === "admin" && (
                    <MenuLink href="/admin/moderation" icon="🛡️" title="Boekmoderatie" subtitle="Boeken in beoordeling" />
                  )}
                  <button type="button" onClick={() => { setOpenMenu(null); logout(); }} className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 px-3 py-3 text-left text-sm font-black text-red-100 hover:bg-red-500/20">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/15">⎋</span>
                    Uitloggen
                  </button>
                </MenuPanel>
              )}
            </div>
          </>
        ) : (
          <GuestAuthButtons compact={compact} onLogin={() => openAuth("login")} onRegister={() => openAuth("register", "free")} />
        )}
      </div>
      {authModalMode && (
        <AuthModal
          mode={authModalMode}
          initialPlan={authInitialPlan}
          onModeChange={setAuthModalMode}
          onClose={() => { setAuthModalMode(null); setAuthInitialPlan("free"); }}
          onLogin={loginWithCredentials}
          onRegister={registerWithCredentials}
        />
      )}
    </>
  );
}

export default function AppNav({ title, subtitle, compact = false }: { title?: string; subtitle?: string; compact?: boolean }) {
  return (
    <header className="sticky top-0 z-[5000] border-b border-white/5 bg-[#05070d]/90 px-4 py-3 backdrop-blur-xl sm:px-6 lg:px-8">
      <div className="flex w-full items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <DiBooksMiniLogo />
          {(title || subtitle) && (
            <div className="hidden min-w-0 border-l border-white/10 pl-4 md:block">
              {title && <p className="truncate text-sm font-black uppercase tracking-[0.28em] text-white">{title}</p>}
              {subtitle && <p className="mt-0.5 truncate text-xs font-bold text-neutral-500">{subtitle}</p>}
            </div>
          )}
        </div>
        <AppNavActions compact={compact} />
      </div>
    </header>
  );
}
