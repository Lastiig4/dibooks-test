"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import AuthModal from "@/components/AuthModal";
import NotificationBell from "@/components/NotificationBell";
import { useDemoAuth } from "@/lib/auth";

function DiBooksMiniLogo() {
  return (
    <Link href="/" className="group flex items-end leading-none" aria-label="DiBooks Library">
      <span className="text-4xl font-black tracking-tight text-white transition group-hover:text-blue-200 sm:text-5xl">
        DI
      </span>
      <span
        className="ml-1 text-4xl italic text-white transition group-hover:text-blue-200 sm:text-5xl"
        style={{ fontFamily: "Georgia, Times New Roman, serif" }}
      >
        Books
      </span>
    </Link>
  );
}

function MenuPanel({ children, align = "right" }: { children: ReactNode; align?: "left" | "right" }) {
  return (
    <div
      className={`absolute top-full z-[6000] mt-3 min-w-72 rounded-3xl border border-white/10 bg-[#080b12]/95 p-3 shadow-2xl backdrop-blur-xl ${
        align === "right" ? "right-0" : "left-0"
      }`}
    >
      {children}
    </div>
  );
}

function MenuLink({ href, icon, title, subtitle }: { href: string; icon: string; title: string; subtitle?: string }) {
  return (
    <Link
      href={href}
      className="flex items-center gap-3 rounded-2xl px-3 py-3 text-left transition hover:bg-white/10"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white/8 text-lg ring-1 ring-white/10">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black text-white">{title}</span>
        {subtitle && <span className="mt-0.5 block truncate text-xs font-bold text-neutral-500">{subtitle}</span>}
      </span>
    </Link>
  );
}

function IconButton({
  children,
  title,
  active = false,
  onClick,
}: {
  children: ReactNode;
  title: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-label={title}
      className={`flex h-11 w-11 items-center justify-center rounded-2xl border text-lg font-black shadow-lg transition hover:-translate-y-0.5 ${
        active
          ? "border-blue-300/40 bg-blue-500/20 text-blue-100"
          : "border-white/10 bg-white/[0.035] text-white hover:border-white/30 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}

function GuestAuthButtons({
  compact,
  onLogin,
  onRegister,
}: {
  compact?: boolean;
  onLogin: () => void;
  onRegister: () => void;
}) {
  return (
    <div className={`flex items-center gap-2 ${compact ? "scale-[0.96] origin-right" : ""}`}>
      <Link
        href="/editor"
        title="Auteur Studio"
        aria-label="Auteur Studio"
        className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-500/12 text-xl font-black text-cyan-100 shadow-lg transition hover:-translate-y-0.5 hover:bg-cyan-500/20"
      >
        ✒️
      </Link>
      <button
        type="button"
        onClick={onLogin}
        className="rounded-2xl border border-white/12 bg-white/[0.05] px-4 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-white/10 sm:px-5"
      >
        Login
      </button>
      <button
        type="button"
        onClick={onRegister}
        className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white shadow-lg shadow-blue-950/30 transition hover:-translate-y-0.5 hover:bg-blue-500 sm:px-5"
      >
        Registreer
      </button>
    </div>
  );
}

export function AppNavActions({ compact = false }: { compact?: boolean }) {
  const { isLoggedIn, permissions, user, loginWithCredentials, registerWithCredentials, logout } = useDemoAuth();
  const [openMenu, setOpenMenu] = useState<"reader" | "settings" | null>(null);
  const [authModalMode, setAuthModalMode] = useState<"login" | "register" | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpenMenu(null);
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenu(null);
    }

    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <>
      <div ref={wrapRef} className={`relative flex items-center gap-2 ${compact ? "scale-[0.96] origin-right" : ""}`}>
        {isLoggedIn ? (
          <>
            <Link
              href="/editor"
              title="Auteur Studio"
              aria-label="Auteur Studio"
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/25 bg-cyan-500/12 text-xl font-black text-cyan-100 shadow-lg transition hover:-translate-y-0.5 hover:bg-cyan-500/20"
            >
              ✒️
            </Link>

            <NotificationBell variant="inline" />

            <div className="relative">
              <IconButton title="Menu" active={openMenu === "reader"} onClick={() => setOpenMenu(openMenu === "reader" ? null : "reader")}>
                👤
              </IconButton>
              {openMenu === "reader" && (
                <MenuPanel>
                  <p className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.32em] text-neutral-500">
                    Menu
                  </p>
                  <MenuLink href="/" icon="📚" title="Library" subtitle="Alle boeken" />
                  {permissions.canUseDashboard && <MenuLink href="/dashboard" icon="🗂️" title="Dashboard" subtitle="Mijn boeken" />}
                  <MenuLink href="/favorites" icon="★" title="Favorieten" subtitle="Bewaarde boeken" />
                  <MenuLink href="/chat" icon="💬" title="Chat" subtitle="Berichten met contacten" />
                </MenuPanel>
              )}
            </div>

            <div className="relative">
              <IconButton title="Account en instellingen" active={openMenu === "settings"} onClick={() => setOpenMenu(openMenu === "settings" ? null : "settings")}>
                ⚙️
              </IconButton>
              {openMenu === "settings" && (
                <MenuPanel>
                  <p className="px-3 pb-2 pt-1 text-[10px] font-black uppercase tracking-[0.32em] text-neutral-500">
                    Account
                  </p>
                  <MenuLink href="/account" icon="⚙️" title="Account" subtitle={user?.email ?? "Profiel en plan"} />
                  <button
                    type="button"
                    onClick={() => {
                      setOpenMenu(null);
                      logout();
                    }}
                    className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-red-400/25 bg-red-500/10 px-3 py-3 text-left text-sm font-black text-red-100 hover:bg-red-500/20"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-red-500/15">⎋</span>
                    Uitloggen
                  </button>
                </MenuPanel>
              )}
            </div>
          </>
        ) : (
          <GuestAuthButtons
            compact={compact}
            onLogin={() => setAuthModalMode("login")}
            onRegister={() => setAuthModalMode("register")}
          />
        )}
      </div>

      {authModalMode && (
        <AuthModal
          mode={authModalMode}
          onModeChange={setAuthModalMode}
          onClose={() => setAuthModalMode(null)}
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
