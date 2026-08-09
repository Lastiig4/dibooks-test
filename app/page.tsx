"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { books, type DiBook } from "@/lib/books";
import { fetchPublishedDashboardBooksFromSupabase } from "@/lib/supabase/dashboardBooks";
import AuthModal from "@/components/AuthModal";
import { useDemoAuth } from "@/lib/auth";

type DashboardBook = DiBook & {
  source?: "library" | "dashboard";
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  projectData?: any;
  colorTheme?: string;
};

const FALLBACK_COVER_CLASS = "from-blue-950 via-slate-950 to-purple-950";
const FALLBACK_ACCENT_CLASS = "border-blue-500/50";

function DiBooksLogo() {
  return (
    <Link href="/" className="group flex items-end leading-none" aria-label="DiBooks home">
      <span className="text-5xl font-black tracking-tight text-white transition group-hover:text-blue-200 sm:text-6xl">
        DI
      </span>
      <span
        className="ml-1 text-5xl italic text-white transition group-hover:text-blue-200 sm:text-6xl"
        style={{ fontFamily: "Georgia, Times New Roman, serif" }}
      >
        Books
      </span>
    </Link>
  );
}

function getBookStatusLabel(book: DashboardBook) {
  if (book.source === "dashboard") return book.published ? "Live" : book.status;
  return book.status;
}

function BookBadge({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <span
      className={
        light
          ? "rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black shadow-sm"
          : "rounded-full bg-black/45 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/90 ring-1 ring-white/10 backdrop-blur-sm"
      }
    >
      {children}
    </span>
  );
}

function GeneratedCover({ book, large = false }: { book: DashboardBook; large?: boolean }) {
  const coverClass = book.coverClass || FALLBACK_COVER_CLASS;
  const titleSize = large ? "text-5xl sm:text-6xl" : "text-3xl";
  const hasCustomCover = !!book.coverImage;

  return (
    <div
      className={`relative isolate flex ${large ? "h-72" : "h-44"} flex-col justify-between overflow-hidden rounded-t-2xl bg-gradient-to-br ${coverClass} p-5`}
    >
      {hasCustomCover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={book.coverImage} alt={`Cover van ${book.title}`} className="absolute inset-0 -z-10 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.16),transparent_28%),linear-gradient(180deg,rgba(0,0,0,0.18),rgba(0,0,0,0.78))]" />
      {!hasCustomCover && (
        <>
          <div className="absolute -right-16 top-7 -z-10 h-44 w-44 rounded-full border border-white/10" />
          <div className="absolute -right-8 top-20 -z-10 h-64 w-64 rounded-full border border-white/10" />
        </>
      )}
      <div className="absolute bottom-0 left-0 right-0 -z-10 h-24 bg-black/45" />

      <div className="flex items-start justify-between gap-3">
        <BookBadge>{book.primaryGenre}</BookBadge>
        <BookBadge light>{getBookStatusLabel(book)}</BookBadge>
      </div>

      <div>
        <h3 className={`${titleSize} max-w-[90%] font-black leading-[0.95] text-white drop-shadow-lg`}>
          {book.title}
        </h3>
        <p className="mt-3 text-[11px] font-black uppercase tracking-[0.32em] text-white/55">
          Interactive story
        </p>
      </div>
    </div>
  );
}

function BookCard({ book, large = false }: { book: DashboardBook; large?: boolean }) {
  const href = `/books/${book.id}`;
  const accentClass = book.accentClass || FALLBACK_ACCENT_CLASS;

  return (
    <Link
      href={href}
      className={`group relative shrink-0 overflow-hidden rounded-2xl border ${accentClass} bg-neutral-950 shadow-2xl transition hover:-translate-y-1 hover:scale-[1.01] hover:border-white/60 ${
        large ? "w-[330px] sm:w-[400px]" : "w-[250px] sm:w-[290px]"
      }`}
    >
      <GeneratedCover book={book} large={large} />
      <div className="min-h-[154px] bg-neutral-950 p-5">
        <p className="line-clamp-3 text-sm font-semibold leading-6 text-neutral-300">
          {book.subtitle}
        </p>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="truncate text-xs font-black uppercase tracking-widest text-neutral-500">
            {book.author}
          </span>
          <span className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white group-hover:bg-blue-500">
            Bekijk
          </span>
        </div>
      </div>
    </Link>
  );
}

function FeaturedPanel({ book }: { book: DashboardBook }) {
  const accentClass = book.accentClass || FALLBACK_ACCENT_CLASS;

  return (
    <Link href={`/books/${book.id}`} className="hidden lg:block">
      <div className={`rounded-3xl border ${accentClass} bg-black/25 p-4 shadow-2xl backdrop-blur-md transition hover:-translate-y-1`}>
        <GeneratedCover book={book} large />
        <div className="rounded-b-2xl bg-neutral-950 p-5">
          <p className="line-clamp-4 text-sm font-bold leading-6 text-neutral-300">
            {book.description}
          </p>
        </div>
      </div>
    </Link>
  );
}

function BookRow({ title, rowBooks }: { title: string; rowBooks: DashboardBook[] }) {
  if (rowBooks.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <h2 className="text-xl font-black text-white sm:text-2xl">{title}</h2>
        <button className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-neutral-300 hover:border-white/30 hover:text-white">
          Meer bekijken
        </button>
      </div>
      <div className="flex gap-5 overflow-x-auto px-5 pb-3 sm:px-8 lg:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {rowBooks.map((book) => (
          <BookCard key={`${title}-${book.source ?? "library"}-${book.id}`} book={book} />
        ))}
      </div>
    </section>
  );
}

function makeGenreRows(allBooks: DashboardBook[]) {
  const preferredGenres = ["Sci-fi", "Mystery", "Fantasy", "Thriller", "Keuzeverhaal", "Interactief"];

  return preferredGenres
    .map((genre) => ({
      genre,
      books: allBooks.filter((book) => book.genres.includes(genre)),
    }))
    .filter((row) => row.books.length > 0);
}

export default function LibraryPage() {
  const [dashboardBooks, setDashboardBooks] = useState<DashboardBook[]>([]);
  const { isLoggedIn, permissions, loginWithCredentials, registerWithCredentials, logout } = useDemoAuth();
  const [authModalMode, setAuthModalMode] = useState<"login" | "register" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboardBooks() {
      try {
        const publishedBooks = await fetchPublishedDashboardBooksFromSupabase();
        if (!cancelled) setDashboardBooks(publishedBooks as DashboardBook[]);
      } catch (error) {
        console.error("Kon gepubliceerde dashboardboeken niet laden uit Supabase.", error);
      }
    }

    void loadDashboardBooks();

    return () => {
      cancelled = true;
    };
  }, []);

  const allBooks = useMemo<DashboardBook[]>(() => {
    const staticBooks: DashboardBook[] = books.map((book) => ({ ...book, source: "library" }));
    return [...dashboardBooks, ...staticBooks];
  }, [dashboardBooks]);

  const featuredBook = dashboardBooks[0] ?? allBooks.find((book) => book.featured) ?? allBooks[0];
  const mostReadBooks = allBooks.filter((book) => book.mostRead || book.source === "dashboard").slice(0, 12);
  const genreRows = makeGenreRows(allBooks);

  return (
    <main className="min-h-screen overflow-hidden bg-[#05070d] text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_36%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_35%),linear-gradient(180deg,#05070d_0%,#05070d_45%,#020308_100%)]" />

      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#05070d]/85 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10">
        <div className="flex items-center justify-between gap-4">
          <DiBooksLogo />
          <nav className="flex items-center gap-3">
            {permissions.canUseDashboard && (
              <Link
                href="/dashboard"
                className="hidden rounded-full border border-white/10 px-4 py-2 text-sm font-black text-neutral-300 hover:border-white/30 hover:text-white sm:block"
              >
                Dashboard
              </Link>
            )}

            <Link
              href="/editor"
              className="hidden rounded-full border border-white/10 px-4 py-2 text-sm font-black text-neutral-300 hover:border-white/30 hover:text-white sm:block"
            >
              Auteur Studio
            </Link>

            {!isLoggedIn ? (
              <>
                <button
                  onClick={() => setAuthModalMode("login")}
                  className="rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white hover:bg-white/10"
                >
                  Login
                </button>
                <button
                  onClick={() => setAuthModalMode("register")}
                  className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-500"
                >
                  Registreer
                </button>
              </>
            ) : (
              <button
                onClick={logout}
                className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-sm font-black text-red-100 hover:bg-red-500/20"
              >
                Uitloggen
              </button>
            )}
          </nav>
        </div>
      </header>

      <section className="px-5 pt-10 sm:px-8 sm:pt-14 lg:px-10">
        <div className={`relative isolate overflow-hidden rounded-[2rem] border border-white/10 bg-gradient-to-br ${featuredBook.coverClass || FALLBACK_COVER_CLASS} shadow-2xl`}>
          {featuredBook.bannerImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={featuredBook.bannerImage} alt={`Banner van ${featuredBook.title}`} className="absolute inset-0 -z-10 h-full w-full object-cover opacity-85" />
          )}
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.16),transparent_30%),radial-gradient(circle_at_88%_18%,rgba(37,99,235,0.26),transparent_34%),linear-gradient(90deg,rgba(0,0,0,0.90),rgba(0,0,0,0.62),rgba(0,0,0,0.24))]" />
          <div className="absolute -right-28 top-10 -z-10 h-[480px] w-[480px] rounded-full border border-white/10" />
          <div className="absolute -right-8 top-28 -z-10 h-[620px] w-[620px] rounded-full border border-white/5" />

          <div className="relative grid min-h-[430px] items-end gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_420px] lg:p-12">
            <div className="max-w-3xl">
              {featuredBook.source === "dashboard" && (
                <div className="mb-4 inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.25em] text-emerald-200">
                  Nieuw gepubliceerd vanuit Dashboard
                </div>
              )}
              <div className="mb-5 flex flex-wrap gap-2">
                {featuredBook.genres.map((genre) => (
                  <BookBadge key={genre}>{genre}</BookBadge>
                ))}
              </div>
              <h1 className="text-5xl font-black leading-none sm:text-7xl lg:text-8xl">
                {featuredBook.title}
              </h1>
              <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-neutral-200 sm:text-lg">
                {featuredBook.subtitle}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                {featuredBook.published && (featuredBook.storyFile || featuredBook.projectData) ? (
                  <Link
                    href={`/books/${featuredBook.id}/read`}
                    className="rounded-2xl bg-white px-7 py-4 text-lg font-black text-black hover:bg-neutral-200"
                  >
                    Lees nu
                  </Link>
                ) : (
                  <span className="rounded-2xl bg-neutral-700 px-7 py-4 text-lg font-black text-neutral-300">
                    Binnenkort
                  </span>
                )}
                <Link
                  href={`/books/${featuredBook.id}`}
                  className="rounded-2xl border border-white/15 bg-black/30 px-7 py-4 text-lg font-black text-white hover:bg-white/10"
                >
                  Meer informatie
                </Link>
              </div>
            </div>

            <FeaturedPanel book={featuredBook} />
          </div>
        </div>
      </section>

      {dashboardBooks.length > 0 && <BookRow title="Nieuw uit het Dashboard" rowBooks={dashboardBooks} />}

      <BookRow title="Meest gelezen boeken" rowBooks={mostReadBooks} />

      {genreRows.map((row) => (
        <BookRow key={row.genre} title={row.genre} rowBooks={row.books} />
      ))}

      <section className="mx-5 mb-12 mt-12 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:mx-8 lg:mx-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-blue-300">Auteur?</p>
            <h2 className="mt-2 text-2xl font-black">Open je Dashboard of Auteur Studio</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
              Iedereen kan in de Auteur Studio een boek maken en lokaal opslaan. Met account krijg je Dashboard-opslag en publicatie naar de Library.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {permissions.canUseDashboard && (
              <Link href="/dashboard" className="rounded-2xl border border-white/15 bg-white/5 px-6 py-4 text-center font-black text-white hover:bg-white/10">
                Naar Dashboard
              </Link>
            )}
            <Link href="/editor" className="rounded-2xl bg-blue-600 px-6 py-4 text-center font-black text-white hover:bg-blue-500">
              Naar Auteur Studio
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 px-5 py-8 text-sm font-bold text-neutral-500 sm:px-8 lg:px-10">
        DiBooks Library • {allBooks.length} boeken in catalogus • {dashboardBooks.length} dashboard publicaties
      </footer>

      {authModalMode && (
        <AuthModal
          initialMode={authModalMode}
          onClose={() => setAuthModalMode(null)}
          onLogin={loginWithCredentials}
          onRegister={registerWithCredentials}
        />
      )}
    </main>
  );
}
