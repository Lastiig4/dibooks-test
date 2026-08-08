"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getBookById, type DiBook } from "@/lib/books";

type DashboardBook = DiBook & {
  source?: "library" | "dashboard";
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  projectData?: any;
  colorTheme?: string;
};

const DASHBOARD_BOOKS_STORAGE_KEY = "dibooks-dashboard-books-v1";

function getPublishedDashboardBook(bookId: string) {
  if (typeof window === "undefined") return null;

  try {
    const savedBooks = window.localStorage.getItem(DASHBOARD_BOOKS_STORAGE_KEY);
    if (!savedBooks) return null;

    const parsedBooks = JSON.parse(savedBooks) as DashboardBook[];
    if (!Array.isArray(parsedBooks)) return null;

    const book = parsedBooks.find((item) => item.id === bookId && item.published);
    return book ? { ...book, source: "dashboard" as const, status: "Testversie" as const } : null;
  } catch (error) {
    console.error("Kon dashboardboek niet laden.", error);
    return null;
  }
}

function DiBooksLogo() {
  return (
    <Link href="/" className="flex items-end leading-none" aria-label="Terug naar DiBooks Library">
      <span className="text-4xl font-black tracking-tight text-white sm:text-5xl">DI</span>
      <span
        className="ml-1 text-4xl italic text-white sm:text-5xl"
        style={{ fontFamily: "Georgia, Times New Roman, serif" }}
      >
        Books
      </span>
    </Link>
  );
}

export default function BookDetailPage() {
  const params = useParams<{ bookId: string }>();
  const bookId = Array.isArray(params?.bookId) ? params.bookId[0] : params?.bookId;
  const [dashboardBook, setDashboardBook] = useState<DashboardBook | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!bookId) return;
    setDashboardBook(getPublishedDashboardBook(bookId));
    setMounted(true);
  }, [bookId]);

  const staticBook = getBookById(bookId ?? "");
  const book = dashboardBook ?? (staticBook ? { ...staticBook, source: "library" as const } : null);

  if (!book && mounted) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070d] p-6 text-white">
        <div className="max-w-xl rounded-3xl border border-red-900/70 bg-red-950/30 p-8 text-center shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-red-300">Boek niet gevonden</p>
          <h1 className="mt-4 text-4xl font-black">Deze publicatie bestaat niet.</h1>
          <p className="mt-4 text-red-100/80">
            Het boek staat niet in lib/books.ts en is ook niet live gepubliceerd vanuit je dashboard.
          </p>
          <Link href="/" className="mt-6 inline-flex rounded-2xl bg-white px-6 py-4 font-black text-black hover:bg-neutral-200">
            Terug naar Library
          </Link>
        </div>
      </main>
    );
  }

  if (!book) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070d] p-6 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-8 text-center shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.3em] text-neutral-500">DiBooks</p>
          <h1 className="mt-4 text-4xl font-black">Boek laden...</h1>
        </div>
      </main>
    );
  }

  const canRead = !!book.published && (!!book.storyFile || !!book.projectData);

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_36%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_35%),linear-gradient(180deg,#05070d_0%,#05070d_55%,#020308_100%)]" />

      <header className="border-b border-white/5 bg-[#05070d]/85 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10">
        <div className="flex items-center justify-between gap-4">
          <DiBooksLogo />
          <div className="flex gap-3">
            <Link href="/" className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-neutral-300 hover:border-white/30 hover:text-white">
              Terug naar Library
            </Link>
            <Link href="/dashboard" className="hidden rounded-full border border-white/10 px-4 py-2 text-sm font-black text-neutral-300 hover:border-white/30 hover:text-white sm:block">
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[420px_1fr] lg:px-10 lg:py-14">
        <div className={`overflow-hidden rounded-[2rem] border ${book.accentClass} bg-neutral-950 shadow-2xl`}>
          <div className={`relative flex h-[520px] flex-col justify-between bg-gradient-to-br ${book.coverClass} p-7`}>
            {book.coverImage && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={book.coverImage}
                alt={`Cover van ${book.title}`}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.18),transparent_34%),linear-gradient(180deg,rgba(0,0,0,0.12),rgba(0,0,0,0.78))]" />
            <div className="relative flex items-start justify-between gap-3">
              <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-black uppercase tracking-widest text-white/90 backdrop-blur-sm">
                {book.primaryGenre}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">
                {book.source === "dashboard" ? "Live" : book.status}
              </span>
            </div>
            <div className="relative">
              <h1 className="text-5xl font-black leading-none text-white drop-shadow-lg">
                {book.title}
              </h1>
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.25em] text-white/65">
                {book.source === "dashboard" ? "Dashboard publicatie" : "Interactive book"}
              </p>
            </div>
          </div>
        </div>

        <div className="flex max-w-4xl flex-col justify-center">
          {book.source === "dashboard" && (
            <div className="mb-5 inline-flex w-fit rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.25em] text-emerald-200">
              Live gepubliceerd vanuit Dashboard
            </div>
          )}

          <div className="mb-5 flex flex-wrap gap-2">
            {book.genres.map((genre) => (
              <span key={genre} className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-white/80">
                {genre}
              </span>
            ))}
          </div>

          <p className="text-sm font-black uppercase tracking-[0.35em] text-blue-300">{book.author}</p>
          <h2 className="mt-4 text-5xl font-black leading-none sm:text-7xl">{book.title}</h2>
          <p className="mt-6 text-xl font-bold leading-8 text-neutral-200">{book.subtitle}</p>
          <p className="mt-5 max-w-3xl text-base leading-8 text-neutral-400">{book.description}</p>

          <div className="mt-7 grid max-w-2xl grid-cols-2 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Status</p>
              <p className="mt-1 font-black">{book.source === "dashboard" ? "Live" : book.status}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Leeftijd</p>
              <p className="mt-1 font-black">{book.ageRating ?? "12+"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Leestijd</p>
              <p className="mt-1 font-black">{book.readTime ?? "Onbekend"}</p>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            {canRead ? (
              <Link href={`/books/${book.id}/read`} className="rounded-2xl bg-white px-8 py-4 text-lg font-black text-black hover:bg-neutral-200">
                Lees boek
              </Link>
            ) : (
              <button disabled className="cursor-not-allowed rounded-2xl bg-neutral-700 px-8 py-4 text-lg font-black text-neutral-300">
                Binnenkort beschikbaar
              </button>
            )}
            <Link href="/" className="rounded-2xl border border-white/15 bg-black/30 px-8 py-4 text-lg font-black text-white hover:bg-white/10">
              Terug naar library
            </Link>
          </div>

          {book.source === "dashboard" && (
            <div className="mt-8 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
              Dit boek komt nu uit je lokale dashboard-publicaties. Later vervangen we deze localStorage-flow door echte account/database opslag.
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
