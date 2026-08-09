"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AuthModal from "@/components/AuthModal";
import { useDemoAuth } from "@/lib/auth";
import {
  fetchFavoriteBooks,
  fetchReadingProgressBooks,
  getAccessLabel,
  type FavoriteBook,
} from "@/lib/supabase/readerFeatures";

const FALLBACK_COVER_CLASS = "from-blue-950 via-slate-950 to-purple-950";
const FALLBACK_ACCENT_CLASS = "border-blue-500/40";

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

function roleLabel(role?: string) {
  if (role === "admin") return "Admin";
  if (role === "author") return "Auteur";
  return "Lezer";
}

function planLabel(plan?: string) {
  if (plan === "author_pro") return "Author Pro";
  if (plan === "reader_plus") return "Reader Plus";
  return "Gratis";
}

function planDescription(plan?: string) {
  if (plan === "author_pro") return "Je kunt premium boeken lezen, publiceren en auteursfuncties gebruiken.";
  if (plan === "reader_plus") return "Je kunt gratis én premium boeken lezen.";
  return "Je kunt gratis boeken lezen, favorieten opslaan en leesvoortgang bewaren.";
}

function Badge({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <span className={light ? "rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black" : "rounded-full bg-black/45 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/90 ring-1 ring-white/10"}>
      {children}
    </span>
  );
}

function SmallBookCard({ book, mode }: { book: FavoriteBook; mode: "progress" | "favorite" }) {
  const coverClass = book.coverClass || FALLBACK_COVER_CLASS;
  const accentClass = book.accentClass || FALLBACK_ACCENT_CLASS;
  const progress = Math.max(0, Math.min(100, book.progressPercent ?? 0));
  const statusLabel = book.published ? "Live" : book.status;

  return (
    <Link href={`/books/${book.id}`} className={`group overflow-hidden rounded-3xl border ${accentClass} bg-neutral-950 shadow-2xl transition hover:-translate-y-1 hover:border-white/60`}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-neutral-950 px-4 py-3">
        <Badge>{book.primaryGenre}</Badge>
        <Badge light>{statusLabel}</Badge>
      </div>

      <div className={`relative h-52 overflow-hidden bg-gradient-to-br ${coverClass}`}>
        {book.coverImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={book.coverImage} alt={`Cover van ${book.title}`} className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.16),transparent_28%),linear-gradient(180deg,rgba(0,0,0,0.04),rgba(0,0,0,0.28))]" />
        {!book.coverImage && <div className="absolute left-5 top-5 text-[10px] font-black uppercase tracking-[0.35em] text-white/30">DiBooks</div>}
      </div>

      <div className="border-t border-white/10 bg-black/55 p-5">
        <div className="flex flex-wrap gap-2">
          <Badge>{getAccessLabel(book.accessType)}</Badge>
          {mode === "progress" && <Badge light>{progress}% gelezen</Badge>}
          {mode === "favorite" && <Badge light>Favoriet</Badge>}
        </div>
        <p className="mt-4 text-[10px] font-black uppercase tracking-[0.34em] text-blue-300/80">
          {mode === "progress" ? "Verder lezen" : "Opgeslagen"}
        </p>
        <h2 className="mt-2 line-clamp-2 text-2xl font-black leading-none text-white">{book.title}</h2>
        {mode === "progress" && (
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-blue-400" style={{ width: `${progress}%` }} />
          </div>
        )}
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="truncate text-xs font-black uppercase tracking-widest text-neutral-500">{book.author}</span>
          <span className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white group-hover:bg-blue-500">Bekijk</span>
        </div>
      </div>
    </Link>
  );
}

function FeaturePlaceholder({ title, body, icon }: { title: string; body: string; icon: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-2xl">{icon}</div>
      <h3 className="mt-4 text-xl font-black text-white">{title}</h3>
      <p className="mt-2 text-sm font-semibold leading-6 text-neutral-400">{body}</p>
      <span className="mt-4 inline-flex rounded-full border border-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-neutral-400">
        Komt later
      </span>
    </div>
  );
}

export default function AccountPage() {
  const { user, isLoggedIn, permissions, loginWithCredentials, registerWithCredentials, logout } = useDemoAuth();
  const [authModalMode, setAuthModalMode] = useState<"login" | "register" | null>(null);
  const [favoriteBooks, setFavoriteBooks] = useState<FavoriteBook[]>([]);
  const [progressBooks, setProgressBooks] = useState<FavoriteBook[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadAccountData() {
      if (!user) {
        setFavoriteBooks([]);
        setProgressBooks([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [favorites, progress] = await Promise.all([
          fetchFavoriteBooks(user),
          fetchReadingProgressBooks(user),
        ]);

        if (!cancelled) {
          setFavoriteBooks(favorites);
          setProgressBooks(progress);
        }
      } catch (loadError: any) {
        console.error("Accountgegevens laden mislukt.", loadError);
        if (!cancelled) setError(loadError?.message ?? "Accountgegevens konden niet worden geladen.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadAccountData();

    return () => {
      cancelled = true;
    };
  }, [user]);

  const topProgressBooks = useMemo(() => progressBooks.slice(0, 4), [progressBooks]);
  const topFavoriteBooks = useMemo(() => favoriteBooks.slice(0, 4), [favoriteBooks]);

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#05070d]/85 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10">
        <div className="flex items-center justify-between gap-4">
          <DiBooksLogo />
          <nav className="flex items-center gap-3">
            <Link href="/" className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-neutral-300 hover:border-white/30 hover:text-white">Library</Link>
            <Link href="/favorites" className="rounded-full border border-yellow-400/30 bg-yellow-500/10 px-4 py-2 text-sm font-black text-yellow-100 hover:bg-yellow-500/20" title="Favorieten">★</Link>
            {permissions.canUseDashboard && <Link href="/dashboard" className="hidden rounded-full border border-white/10 px-4 py-2 text-sm font-black text-neutral-300 hover:border-white/30 hover:text-white sm:block">Dashboard</Link>}
            {!isLoggedIn ? (
              <button onClick={() => setAuthModalMode("login")} className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-500">Login</button>
            ) : (
              <button onClick={logout} className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-black text-red-100 hover:bg-red-500/20">Uitloggen</button>
            )}
          </nav>
        </div>
      </header>

      <section className="px-5 py-10 sm:px-8 lg:px-10">
        <div className="rounded-[2rem] border border-blue-400/20 bg-gradient-to-br from-blue-950/70 via-neutral-950 to-purple-950/45 p-8 shadow-2xl sm:p-12">
          <p className="text-sm font-black uppercase tracking-[0.32em] text-blue-300">Account</p>
          <h1 className="mt-4 text-5xl font-black leading-none sm:text-7xl">Mijn DiBooks</h1>
          <p className="mt-5 max-w-3xl text-base font-semibold leading-7 text-neutral-300">
            Je persoonlijke plek voor lezen, favorieten, voortgang en later ook delen, chatten en testlezers uitnodigen.
          </p>
        </div>

        {!isLoggedIn && (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl">
            <h2 className="text-3xl font-black">Login nodig</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-6 text-neutral-400">
              Maak gratis een account aan om boeken te lezen, voortgang op te slaan en favorieten te bewaren.
            </p>
            <div className="mt-6 flex justify-center gap-3">
              <button onClick={() => setAuthModalMode("login")} className="rounded-2xl border border-white/15 bg-white/5 px-6 py-4 font-black text-white hover:bg-white/10">Login</button>
              <button onClick={() => setAuthModalMode("register")} className="rounded-2xl bg-blue-600 px-6 py-4 font-black text-white hover:bg-blue-500">Registreer gratis</button>
            </div>
          </div>
        )}

        {isLoggedIn && user && (
          <>
            <div className="mt-8 grid gap-5 lg:grid-cols-[1fr_1.2fr]">
              <section className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-2xl">
                <p className="text-xs font-black uppercase tracking-[0.32em] text-neutral-500">Profiel</p>
                <div className="mt-5 flex items-center gap-4">
                  <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-600 text-3xl font-black text-white">
                    {(user.name || user.email || "D").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate text-3xl font-black">{user.name || "DiBooks gebruiker"}</h2>
                    <p className="mt-1 truncate text-sm font-bold text-neutral-400">{user.email}</p>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Rol</p>
                    <p className="mt-1 text-xl font-black text-white">{roleLabel(user.role)}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/25 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Plan</p>
                    <p className="mt-1 text-xl font-black text-white">{planLabel(user.plan)}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 text-sm font-semibold leading-6 text-blue-100">
                  {planDescription(user.plan)}
                </div>
              </section>

              <section className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
                  <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Favorieten</p>
                  <p className="mt-2 text-4xl font-black text-yellow-300">{favoriteBooks.length}</p>
                  <Link href="/favorites" className="mt-4 inline-flex rounded-2xl border border-yellow-400/30 bg-yellow-500/10 px-4 py-3 text-sm font-black text-yellow-100 hover:bg-yellow-500/20">Open favorieten</Link>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
                  <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Verder lezen</p>
                  <p className="mt-2 text-4xl font-black text-blue-300">{progressBooks.length}</p>
                  <Link href="/" className="mt-4 inline-flex rounded-2xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-sm font-black text-blue-100 hover:bg-blue-500/20">Zoek boeken</Link>
                </div>
                <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl">
                  <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Auteur</p>
                  <p className="mt-2 text-4xl font-black text-emerald-300">{permissions.canUseDashboard ? "✓" : "—"}</p>
                  {permissions.canUseDashboard ? (
                    <Link href="/dashboard" className="mt-4 inline-flex rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-500/20">Dashboard</Link>
                  ) : (
                    <Link href="/editor" className="mt-4 inline-flex rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white hover:bg-white/10">Studio proberen</Link>
                  )}
                </div>
              </section>
            </div>

            {loading && <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8 font-black text-neutral-300">Accountgegevens laden...</div>}
            {error && <div className="mt-8 rounded-3xl border border-red-500/25 bg-red-500/10 p-8 font-black text-red-100">{error}</div>}

            {!loading && !error && topProgressBooks.length > 0 && (
              <section className="mt-10">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.32em] text-neutral-500">Lees verder</p>
                    <h2 className="mt-2 text-3xl font-black">Verder lezen</h2>
                  </div>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {topProgressBooks.map((book) => <SmallBookCard key={book.id} book={book} mode="progress" />)}
                </div>
              </section>
            )}

            {!loading && !error && topFavoriteBooks.length > 0 && (
              <section className="mt-10">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-black uppercase tracking-[0.32em] text-neutral-500">Opgeslagen</p>
                    <h2 className="mt-2 text-3xl font-black">Favorieten</h2>
                  </div>
                  <Link href="/favorites" className="rounded-full border border-yellow-400/30 bg-yellow-500/10 px-4 py-2 text-sm font-black text-yellow-100 hover:bg-yellow-500/20">Alles bekijken</Link>
                </div>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                  {topFavoriteBooks.map((book) => <SmallBookCard key={book.id} book={book} mode="favorite" />)}
                </div>
              </section>
            )}

            {!loading && !error && topFavoriteBooks.length === 0 && topProgressBooks.length === 0 && (
              <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-neutral-300">
                <h2 className="text-3xl font-black text-white">Nog geen activiteit</h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-neutral-400">Lees een boek of zet iets als favoriet. Dan verschijnt het hier.</p>
                <Link href="/" className="mt-5 inline-flex rounded-2xl bg-blue-600 px-6 py-4 font-black text-white hover:bg-blue-500">Naar Library</Link>
              </div>
            )}

            <section className="mt-10">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.32em] text-neutral-500">Later</p>
                <h2 className="mt-2 text-3xl font-black">Delen, contacten en chat</h2>
              </div>
              <div className="mt-5 grid gap-5 md:grid-cols-3">
                <FeaturePlaceholder title="Contacten toevoegen" icon="👥" body="Voeg andere lezers, auteurs of testlezers toe om boeken met elkaar te delen." />
                <FeaturePlaceholder title="Boek delen" icon="↗" body="Deel een boek of concept rechtstreeks met een contact, eventueel met lees- of feedbackrechten." />
                <FeaturePlaceholder title="Chat" icon="💬" body="Praat straks met contacten of testlezers over een boek, hoofdstuk of interactieve route." />
              </div>
            </section>
          </>
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
