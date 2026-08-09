"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AuthModal from "@/components/AuthModal";
import { useDemoAuth } from "@/lib/auth";
import { fetchFavoriteBooks, getAccessLabel, type FavoriteBook } from "@/lib/supabase/readerFeatures";

const FALLBACK_COVER_CLASS = "from-blue-950 via-slate-950 to-purple-950";
const FALLBACK_ACCENT_CLASS = "border-yellow-400/40";

function DiBooksLogo() {
  return (
    <Link href="/" className="group flex items-end leading-none" aria-label="DiBooks home">
      <span className="text-5xl font-black tracking-tight text-white transition group-hover:text-blue-200 sm:text-6xl">DI</span>
      <span className="ml-1 text-5xl italic text-white transition group-hover:text-blue-200 sm:text-6xl" style={{ fontFamily: "Georgia, Times New Roman, serif" }}>
        Books
      </span>
    </Link>
  );
}

function Badge({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <span className={light ? "rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black" : "rounded-full bg-black/45 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/90 ring-1 ring-white/10"}>
      {children}
    </span>
  );
}

function FavoriteCard({ book }: { book: FavoriteBook }) {
  const coverClass = book.coverClass || FALLBACK_COVER_CLASS;
  const accentClass = book.accentClass || FALLBACK_ACCENT_CLASS;
  const statusLabel = book.published ? "Live" : book.status;

  return (
    <Link href={`/books/${book.id}`} className={`group overflow-hidden rounded-3xl border ${accentClass} bg-neutral-950 shadow-2xl transition hover:-translate-y-1 hover:border-white/60`}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-neutral-950 px-4 py-3">
        <Badge>{book.primaryGenre}</Badge>
        <Badge light>{statusLabel}</Badge>
      </div>

      <div className={`relative h-64 overflow-hidden bg-gradient-to-br ${coverClass}`}>
        {book.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.coverImage} alt={`Cover van ${book.title}`} className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.16),transparent_28%),linear-gradient(180deg,rgba(0,0,0,0.05),rgba(0,0,0,0.26))]" />
        {!book.coverImage && <div className="absolute left-5 top-5 text-[10px] font-black uppercase tracking-[0.35em] text-white/30">DiBooks</div>}
      </div>

      <div className="border-t border-white/10 bg-black/55 p-5">
        <div className="flex flex-wrap gap-2">
          <Badge>{getAccessLabel(book.accessType)}</Badge>
          {book.progressCurrentNodeId && <Badge light>{book.progressPercent ?? 0}% gelezen</Badge>}
        </div>
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.34em] text-yellow-300/80">Favoriet</p>
        <h2 className="mt-2 line-clamp-2 text-3xl font-black leading-none text-white">{book.title}</h2>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="truncate text-xs font-black uppercase tracking-widest text-neutral-500">{book.author}</span>
          <span className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white group-hover:bg-blue-500">Bekijk</span>
        </div>
      </div>
    </Link>
  );
}

export default function FavoritesPage() {
  const { user, isLoggedIn, permissions, loginWithCredentials, registerWithCredentials, logout } = useDemoAuth();
  const [authModalMode, setAuthModalMode] = useState<"login" | "register" | null>(null);
  const [books, setBooks] = useState<FavoriteBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadFavorites() {
      if (!user) {
        setBooks([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const nextBooks = await fetchFavoriteBooks(user);
        if (!cancelled) setBooks(nextBooks);
      } catch (loadError: any) {
        console.error("Favorieten laden mislukt.", loadError);
        if (!cancelled) setError(loadError?.message ?? "Favorieten konden niet worden geladen.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadFavorites();

    return () => {
      cancelled = true;
    };
  }, [user]);

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#05070d]/85 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10">
        <div className="flex items-center justify-between gap-4">
          <DiBooksLogo />
          <nav className="flex items-center gap-3">
            <Link href="/" className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-neutral-300 hover:border-white/30 hover:text-white">Library</Link>
            {permissions.canUseDashboard && <Link href="/dashboard" className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-neutral-300 hover:border-white/30 hover:text-white">Dashboard</Link>}
            {!isLoggedIn ? (
              <button onClick={() => setAuthModalMode("login")} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-500">Login</button>
            ) : (
              <button onClick={logout} className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-black text-red-100 hover:bg-red-500/20">Uitloggen</button>
            )}
          </nav>
        </div>
      </header>

      <section className="px-5 py-10 sm:px-8 lg:px-10">
        <div className="rounded-[2rem] border border-yellow-400/20 bg-yellow-500/10 p-8 shadow-2xl sm:p-12">
          <p className="text-sm font-black uppercase tracking-[0.32em] text-yellow-300">★ Favorieten</p>
          <h1 className="mt-4 text-5xl font-black leading-none sm:text-7xl">Mijn favoriete boeken</h1>
          <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-yellow-50/80">
            Bewaar boeken die je later wilt lezen. Als je al bent begonnen, kan DiBooks hier later ook je voortgang tonen.
          </p>
        </div>

        {!isLoggedIn && (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl">
            <h2 className="text-3xl font-black">Login nodig</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-6 text-neutral-400">
              Favorieten horen bij je account. Maak gratis een account aan om boeken op te slaan en je leesvoortgang later terug te vinden.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => setAuthModalMode("login")} className="rounded-2xl border border-white/15 bg-white/5 px-6 py-4 font-black text-white hover:bg-white/10">Login</button>
              <button onClick={() => setAuthModalMode("register")} className="rounded-2xl bg-blue-600 px-6 py-4 font-black text-white hover:bg-blue-500">Registreer gratis</button>
            </div>
          </div>
        )}

        {isLoggedIn && loading && <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8 font-black text-neutral-300">Favorieten laden...</div>}
        {isLoggedIn && error && <div className="mt-8 rounded-3xl border border-red-500/25 bg-red-500/10 p-8 font-black text-red-100">{error}</div>}
        {isLoggedIn && !loading && !error && books.length === 0 && (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-neutral-300">
            <h2 className="text-3xl font-black text-white">Nog geen favorieten</h2>
            <p className="mt-3 text-sm font-semibold leading-6 text-neutral-400">Ga naar een boekpagina en klik op ☆ Favoriet om hem hier op te slaan.</p>
          </div>
        )}
        {isLoggedIn && books.length > 0 && (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {books.map((book) => <FavoriteCard key={book.id} book={book} />)}
          </div>
        )}
      </section>

      {authModalMode && (
        <AuthModal
          mode={authModalMode}
          onModeChange={setAuthModalMode}
          onClose={() => setAuthModalMode(null)}
          onLogin={loginWithCredentials}
          onRegister={registerWithCredentials}
        />
      )}
    </main>
  );
}
