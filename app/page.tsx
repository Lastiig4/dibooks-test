"use client";

import Link from "next/link";
import AppNav from "@/components/AppNav";
import { useEffect, useMemo, useState } from "react";
import type { DiBook } from "@/lib/books";
import {
  fetchComingSoonDashboardBooksFromSupabase,
  fetchPublishedDashboardBooksFromSupabase,
} from "@/lib/supabase/dashboardBooks";
import { useDemoAuth } from "@/lib/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  PUBLIC_PLANS,
  openDiBooksAuth,
  type PublicPlanDefinition,
} from "@/lib/plans";

type DashboardBook = DiBook & {
  source?: "library" | "dashboard";
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  projectData?: any;
  colorTheme?: string;
  accessType?: "free" | "premium";
  mostRead?: boolean;
  readCount?: number;
  readerCount?: number;
  viewCount?: number;
  favoritesCount?: number;
};

type PopularityRow = {
  book_id?: string;
  bookId?: string;
  reader_count?: number | string;
  readerCount?: number | string;
};

const FALLBACK_COVER_CLASS = "from-blue-950 via-slate-950 to-purple-950";
const FALLBACK_ACCENT_CLASS = "border-blue-500/50";

function getPopularityCount(
  book: DashboardBook,
  popularityByBookId: Record<string, number>,
) {
  const storedCount = popularityByBookId[book.id];

  if (Number.isFinite(storedCount)) {
    return Math.max(0, Number(storedCount));
  }

  return Math.max(
    0,
    Number(book.readerCount) ||
      Number(book.readCount) ||
      Number(book.viewCount) ||
      Number(book.favoritesCount) ||
      0,
  );
}

function sortBooksByPopularity(
  books: DashboardBook[],
  popularityByBookId: Record<string, number>,
) {
  return [...books].sort((left, right) => {
    const popularityDifference =
      getPopularityCount(right, popularityByBookId) -
      getPopularityCount(left, popularityByBookId);

    if (popularityDifference !== 0) return popularityDifference;

    if (!!right.mostRead !== !!left.mostRead) {
      return right.mostRead ? 1 : -1;
    }

    const rightDate = Date.parse(
      right.publishedAt || right.updatedAt || right.createdAt || "",
    );
    const leftDate = Date.parse(
      left.publishedAt || left.updatedAt || left.createdAt || "",
    );

    return (Number.isFinite(rightDate) ? rightDate : 0) -
      (Number.isFinite(leftDate) ? leftDate : 0);
  });
}

function getBookStatusLabel(book: DashboardBook) {
  if (book.source === "dashboard") return book.published ? "Live" : book.status;
  return book.status;
}

function getAccessLabel(book: DashboardBook) {
  return book.accessType === "premium" ? "Premium" : "Gratis";
}

function getAccessBadgeClass(book: DashboardBook) {
  return book.accessType === "premium"
    ? "border-yellow-400/35 bg-yellow-500/15 text-yellow-100"
    : "border-emerald-400/30 bg-emerald-500/12 text-emerald-100";
}

function AccessBadge({ book }: { book: DashboardBook }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-widest ${getAccessBadgeClass(book)}`}>
      {getAccessLabel(book)}
    </span>
  );
}

function BookBadge({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <span className={light ? "rounded-full bg-white px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black shadow-sm" : "rounded-full bg-black/45 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white/90 ring-1 ring-white/10 backdrop-blur-sm"}>
      {children}
    </span>
  );
}

function CoverArtwork({ book, large = false }: { book: DashboardBook; large?: boolean }) {
  const coverClass = book.coverClass || FALLBACK_COVER_CLASS;
  const hasCustomCover = !!book.coverImage;
  return (
    <div className={`relative isolate ${large ? "h-80" : "h-64"} overflow-hidden bg-gradient-to-br ${coverClass}`}>
      {hasCustomCover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={book.coverImage} alt={`Cover van ${book.title}`} className="absolute inset-0 -z-10 h-full w-full object-cover" />
      )}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_18%,rgba(255,255,255,0.16),transparent_28%),linear-gradient(180deg,rgba(0,0,0,0.04),rgba(0,0,0,0.20))]" />
      {!hasCustomCover && (
        <>
          <div className="absolute -right-16 top-7 -z-10 h-44 w-44 rounded-full border border-white/10" />
          <div className="absolute -right-8 top-20 -z-10 h-64 w-64 rounded-full border border-white/10" />
          <div className="absolute left-5 top-5 text-[10px] font-black uppercase tracking-[0.35em] text-white/30">DiBooks</div>
        </>
      )}
    </div>
  );
}

function BookCard({ book, large = false }: { book: DashboardBook; large?: boolean }) {
  const href = `/books/${book.id}`;
  const accentClass = book.accentClass || FALLBACK_ACCENT_CLASS;
  return (
    <Link href={href} className={`group relative shrink-0 overflow-hidden rounded-2xl border ${accentClass} bg-neutral-950 shadow-2xl transition hover:-translate-y-1 hover:scale-[1.01] hover:border-white/60 ${large ? "w-[330px] sm:w-[400px]" : "w-[250px] sm:w-[290px]"}`}>
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-neutral-950 px-4 py-3">
        <BookBadge>{book.primaryGenre}</BookBadge>
        <div className="flex items-center gap-2">
          <AccessBadge book={book} />
          <BookBadge light>{getBookStatusLabel(book)}</BookBadge>
        </div>
      </div>
      <CoverArtwork book={book} large={large} />
      <div className="flex min-h-[136px] flex-col border-t border-white/10 bg-gradient-to-t from-black/70 via-black/32 to-transparent p-5 backdrop-blur-[2px]">
        <p className="text-[10px] font-black uppercase tracking-[0.34em] text-blue-300/80">Interactief verhaal</p>
        <h3 className="mt-2 line-clamp-2 text-3xl font-black leading-none text-white">{book.title}</h3>
        <div className="mt-5 flex items-center justify-between gap-3">
          <span className="truncate text-xs font-black uppercase tracking-widest text-neutral-500">{book.author}</span>
          <span className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white group-hover:bg-blue-500">Bekijk</span>
        </div>
      </div>
    </Link>
  );
}

function GuestPopularCover({
  book,
  rank,
  readerCount,
}: {
  book: DashboardBook;
  rank: number;
  readerCount: number;
}) {
  const coverClass = book.coverClass || FALLBACK_COVER_CLASS;

  return (
    <Link
      href={`/books/${book.id}`}
      className="group min-w-0 overflow-hidden rounded-[1.6rem] border border-white/10 bg-neutral-950 shadow-2xl transition duration-300 hover:-translate-y-2 hover:border-blue-300/35"
    >
      <div className={`relative aspect-[2/3] overflow-hidden bg-gradient-to-br ${coverClass}`}>
        {book.coverImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.coverImage}
            alt={`Cover van ${book.title}`}
            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-[1.035]"
          />
        ) : (
          <>
            <div className="absolute left-5 top-5 text-[10px] font-black uppercase tracking-[0.32em] text-white/30">
              DiBooks
            </div>
            <div className="absolute -right-12 top-16 h-40 w-40 rounded-full border border-white/10" />
            <div className="absolute -right-3 top-28 h-56 w-56 rounded-full border border-white/10" />
          </>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/10 to-transparent" />

        <div className="absolute left-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/55 text-xs font-black text-white backdrop-blur">
          #{rank}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-4">
          <div className="flex flex-wrap gap-1.5">
            <AccessBadge book={book} />
            {readerCount > 0 && (
              <span className="rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-white/80 backdrop-blur">
                {readerCount} lezer{readerCount === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="p-4">
        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300/75">
          {book.primaryGenre}
        </p>
        <h3 className="mt-2 line-clamp-2 text-xl font-black leading-tight text-white">
          {book.title}
        </h3>
        <p className="mt-2 truncate text-xs font-bold text-neutral-500">
          {book.author}
        </p>
      </div>
    </Link>
  );
}

function FeaturedPanel({ book }: { book: DashboardBook }) {
  const accentClass = book.accentClass || FALLBACK_ACCENT_CLASS;
  const coverClass = book.coverClass || FALLBACK_COVER_CLASS;
  const hasCustomCover = !!book.coverImage;
  return (
    <Link href={`/books/${book.id}`} className="hidden w-[190px] justify-self-end xl:block">
      <div className={`overflow-hidden rounded-[1.25rem] border ${accentClass} bg-neutral-950/80 shadow-xl backdrop-blur-md transition hover:-translate-y-1`}>
        <div className={`relative h-56 overflow-hidden bg-gradient-to-br ${coverClass}`}>
          {hasCustomCover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={book.coverImage} alt={`Cover van ${book.title}`} className="absolute inset-0 h-full w-full object-cover opacity-90" />
          )}
          {!hasCustomCover && (
            <>
              <div className="absolute left-4 top-4 text-[9px] font-black uppercase tracking-[0.34em] text-white/28">DiBooks</div>
              <div className="absolute -right-12 top-10 h-36 w-36 rounded-full border border-white/10" />
              <div className="absolute -right-5 top-24 h-48 w-48 rounded-full border border-white/8" />
            </>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          <div className="absolute left-3 right-3 top-3 flex flex-wrap gap-1.5">
            <BookBadge>{book.primaryGenre}</BookBadge>
            <AccessBadge book={book} />
          </div>
          <div className="absolute bottom-3 left-3 right-3">
            <p className="text-[8px] font-black uppercase tracking-[0.30em] text-blue-300/80">Uitgelicht</p>
            <h3 className="mt-1 line-clamp-2 text-xl font-black leading-none text-white">{book.title}</h3>
          </div>
        </div>
      </div>
    </Link>
  );
}

function GuestHero({
  popularBooks,
  popularityByBookId,
}: {
  popularBooks: DashboardBook[];
  popularityByBookId: Record<string, number>;
}) {
  const heroBooks = popularBooks.slice(0, 3);
  const cardTransforms = [
    "lg:-rotate-6 lg:translate-y-8",
    "lg:z-10 lg:scale-110",
    "lg:rotate-6 lg:translate-y-8",
  ];

  return (
    <section className="px-4 pt-7 sm:px-6 sm:pt-10 lg:px-8">
      <div className="relative isolate overflow-hidden rounded-[2.4rem] border border-blue-300/15 bg-[#080c18] shadow-2xl shadow-blue-950/25">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(circle_at_10%_10%,rgba(37,99,235,0.32),transparent_34%),radial-gradient(circle_at_88%_18%,rgba(168,85,247,0.22),transparent_30%),linear-gradient(135deg,#080c18_0%,#070912_52%,#05070d_100%)]" />
        <div className="absolute -right-32 -top-32 -z-10 h-[430px] w-[430px] rounded-full border border-blue-300/10" />
        <div className="absolute -right-12 top-10 -z-10 h-[360px] w-[360px] rounded-full border border-violet-300/10" />

        <div className="grid min-h-[610px] items-center gap-12 p-6 sm:p-10 lg:grid-cols-[1.02fr_0.98fr] lg:p-14 xl:p-16">
          <div className="max-w-4xl">
            <div className="inline-flex rounded-full border border-cyan-300/25 bg-cyan-400/10 px-4 py-2 text-xs font-black uppercase tracking-[0.30em] text-cyan-100">
              Lezen • kiezen • beleven
            </div>

            <h1 className="mt-7 text-5xl font-black leading-[0.93] sm:text-7xl xl:text-[5.6rem]">
              Jouw keuzes.{" "}
              <span className="bg-gradient-to-r from-blue-300 via-cyan-200 to-violet-300 bg-clip-text text-transparent">
                Jouw verhaal.
              </span>
            </h1>

            <p className="mt-6 max-w-2xl text-base font-semibold leading-8 text-neutral-300 sm:text-xl">
              DiBooks maakt van lezen een interactieve ervaring. Kies je route,
              bekijk cutscenes, speel minigames en ontdek scènes die reageren op
              wat jij eerder hebt gedaan.
            </p>

            <div className="mt-7 flex flex-wrap gap-2">
              {["Keuzes", "Vertakkingen", "Cutscenes", "Minigames", "Flags & gevolgen"].map(
                (feature) => (
                  <span
                    key={feature}
                    className="rounded-full border border-white/10 bg-white/[0.045] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-neutral-300"
                  >
                    {feature}
                  </span>
                ),
              )}
            </div>

            <div className="mt-9 flex flex-wrap gap-3">
              <a
                href="#populair"
                className="rounded-2xl bg-white px-7 py-4 text-base font-black text-black shadow-xl transition hover:-translate-y-0.5 hover:bg-neutral-200"
              >
                Ontdek populaire boeken
              </a>

              <Link
                href="/editor"
                className="rounded-2xl border border-cyan-400/30 bg-cyan-500/12 px-7 py-4 text-base font-black text-cyan-100 transition hover:-translate-y-0.5 hover:bg-cyan-500/20"
              >
                Probeer Studio gratis
              </Link>

              <button
                type="button"
                onClick={() => openDiBooksAuth("register", "free")}
                className="rounded-2xl border border-white/12 bg-white/[0.04] px-7 py-4 text-base font-black text-white transition hover:bg-white/10"
              >
                Account maken
              </button>
            </div>

            <p className="mt-4 text-xs font-bold text-neutral-500">
              Geen account nodig voor de Studio • proefmodus met maximaal 15 verhaalnodes
            </p>
          </div>

          <div className="relative">
            {heroBooks.length > 0 ? (
              <>
                <div className="mb-5 flex items-center justify-between gap-3 lg:px-6">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.32em] text-blue-300">
                      Nu populair
                    </p>
                    <p className="mt-1 text-sm font-bold text-neutral-400">
                      Gebaseerd op echte leesactiviteit
                    </p>
                  </div>
                  <a
                    href="#populair"
                    className="text-xs font-black text-white/70 hover:text-white"
                  >
                    Bekijk lijst →
                  </a>
                </div>

                <div className="grid grid-cols-3 items-center gap-2 sm:gap-4 lg:px-5">
                  {heroBooks.map((book, index) => (
                    <Link
                      key={`hero-${book.id}`}
                      href={`/books/${book.id}`}
                      className={`group relative overflow-hidden rounded-[1.25rem] border border-white/15 bg-neutral-950 shadow-2xl transition duration-300 hover:z-20 hover:-translate-y-3 ${cardTransforms[index]}`}
                    >
                      <div className={`relative aspect-[2/3] overflow-hidden bg-gradient-to-br ${book.coverClass || FALLBACK_COVER_CLASS}`}>
                        {book.coverImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={book.coverImage}
                            alt={`Cover van ${book.title}`}
                            className="absolute inset-0 h-full w-full object-cover transition duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <>
                            <div className="absolute left-3 top-3 text-[8px] font-black uppercase tracking-[0.28em] text-white/30">
                              DiBooks
                            </div>
                            <div className="absolute -right-10 top-14 h-32 w-32 rounded-full border border-white/10" />
                          </>
                        )}

                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-transparent to-black/10" />

                        <div className="absolute left-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-[10px] font-black text-white ring-1 ring-white/15 backdrop-blur">
                          #{index + 1}
                        </div>

                        <div className="absolute bottom-0 left-0 right-0 p-3">
                          <h3 className="line-clamp-2 text-sm font-black leading-tight text-white sm:text-base">
                            {book.title}
                          </h3>
                          {getPopularityCount(book, popularityByBookId) > 0 && (
                            <p className="mt-1 text-[9px] font-black uppercase tracking-wider text-blue-200/80">
                              {getPopularityCount(book, popularityByBookId)} lezers
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-8 text-center shadow-2xl">
                <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-3xl bg-blue-500/10 text-4xl ring-1 ring-blue-300/20">
                  📚
                </div>
                <h2 className="mt-5 text-2xl font-black">
                  De eerste verhalen komen eraan
                </h2>
                <p className="mt-3 text-sm font-semibold leading-6 text-neutral-400">
                  Zodra boeken live zijn verschijnen de populairste covers hier automatisch.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function GuestPopularSection({
  books,
  popularityByBookId,
}: {
  books: DashboardBook[];
  popularityByBookId: Record<string, number>;
}) {
  if (books.length === 0) return null;

  return (
    <section id="populair" className="scroll-mt-28 px-5 py-16 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.32em] text-blue-300">
              Populair op DiBooks
            </p>
            <h2 className="mt-3 text-4xl font-black sm:text-6xl">
              Waar lezers nu in verdwijnen.
            </h2>
            <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-neutral-400 sm:text-base">
              Automatisch gerangschikt op echte leesactiviteit van gepubliceerde DiBooks.
            </p>
          </div>

          <a
            href="#library"
            className="w-fit rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-black text-white hover:bg-white/10"
          >
            Hele Library ↓
          </a>
        </div>

        <div className="mt-9 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
          {books.slice(0, 5).map((book, index) => (
            <GuestPopularCover
              key={`popular-${book.id}`}
              book={book}
              rank={index + 1}
              readerCount={getPopularityCount(book, popularityByBookId)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function GuestHowItWorks() {
  const cards = [
    { number: "01", title: "Lees", text: "Een DiBook voelt als een echt boek, maar kan op precies het juiste moment interactief worden." },
    { number: "02", title: "Kies & speel", text: "Maak keuzes, bekijk korte cutscenes of voltooi een minigame zonder uit het verhaal te worden gehaald." },
    { number: "03", title: "Leef met de gevolgen", text: "Flags en verhaalroutes onthouden wat jij hebt gedaan. Een volgende scène kan daardoor compleet anders verlopen." },
  ];
  return (
    <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10">
      <div className="max-w-3xl">
        <p className="text-xs font-black uppercase tracking-[0.32em] text-blue-300">Meer dan een ebook</p>
        <h2 className="mt-3 text-4xl font-black sm:text-6xl">Een verhaal dat op jou reageert.</h2>
      </div>
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {cards.map((card) => (
          <article key={card.number} className="rounded-3xl border border-white/10 bg-white/[0.035] p-6 shadow-xl">
            <p className="text-3xl font-black text-white/15">{card.number}</p>
            <h3 className="mt-5 text-2xl font-black">{card.title}</h3>
            <p className="mt-3 text-sm font-semibold leading-7 text-neutral-400">{card.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function GuestAuthorStudio() {
  return (
    <section id="auteur-studio" className="scroll-mt-28 px-5 pb-16 sm:px-8 lg:px-10">
      <div className="mx-auto grid max-w-7xl gap-8 overflow-hidden rounded-[2rem] border border-cyan-300/15 bg-[linear-gradient(135deg,rgba(8,145,178,0.10),rgba(8,10,18,0.96)_45%,rgba(124,58,237,0.10))] p-6 sm:p-9 lg:grid-cols-[0.9fr_1.1fr] lg:p-12">
        <div className="flex flex-col justify-center">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-cyan-300">DiBooks Auteur Studio</p>
          <h2 className="mt-4 text-4xl font-black leading-none sm:text-6xl">Schrijf niet alleen een boek. Bouw een verhaalwereld.</h2>
          <p className="mt-5 max-w-2xl text-base font-semibold leading-8 text-neutral-300">
            Maak tekst, keuzes, media en logica visueel aan elkaar vast. Met nodes, paths, variabelen en IF-voorwaarden bouw je vertakkingen zonder zelf te programmeren.
          </p>
          <div className="mt-7 flex flex-wrap gap-2 text-xs font-black uppercase tracking-widest text-neutral-400">
            <span className="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-2">Nodes</span>
            <span className="rounded-full border border-cyan-300/20 bg-cyan-500/10 px-3 py-2">Paths</span>
            <span className="rounded-full border border-violet-300/20 bg-violet-500/10 px-3 py-2">Flags & variabelen</span>
            <span className="rounded-full border border-violet-300/20 bg-violet-500/10 px-3 py-2">IF / ELSE</span>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/editor" className="w-fit rounded-2xl bg-cyan-500 px-6 py-4 text-sm font-black text-black transition hover:-translate-y-0.5 hover:bg-cyan-400">
              Probeer Studio gratis
            </Link>
            <a href="#plannen" className="w-fit rounded-2xl border border-violet-400/25 bg-violet-500/10 px-6 py-4 text-sm font-black text-violet-100 transition hover:-translate-y-0.5 hover:bg-violet-500/20">
              Bekijk Auteur-plan
            </a>
          </div>
          <p className="mt-3 text-xs font-semibold leading-5 text-neutral-500">
            Proefmodus: maximaal 15 verhaalnodes en alleen lokaal opslaan. Author Pro ontgrendelt onbeperkt bouwen, Dashboard en publiceren.
          </p>
        </div>

        <div className="rounded-[1.75rem] border border-white/10 bg-[#080b12] p-5 shadow-2xl">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.30em] text-neutral-500">Auteur Studio</p>
              <p className="mt-1 text-lg font-black">Visuele verhaalmap</p>
            </div>
            <span className="rounded-full border border-emerald-300/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-200">No-code</span>
          </div>
          <div className="relative mt-5 min-h-[330px] overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(rgba(51,65,85,0.35)_1px,transparent_1px),linear-gradient(90deg,rgba(51,65,85,0.35)_1px,transparent_1px)] bg-[size:42px_42px] p-5">
            <div className="absolute left-[42%] top-10 rounded-2xl border border-blue-400/40 bg-blue-600 px-5 py-3 text-sm font-black shadow-xl">Hoofdstuk 1</div>
            <div className="absolute left-[47%] top-[83px] h-10 w-1 bg-blue-400/40" />
            <div className="absolute left-[36%] top-[120px] rounded-2xl border border-white/15 bg-neutral-900 px-6 py-4 text-sm font-black shadow-xl">Tekstscene</div>
            <div className="absolute left-[47%] top-[170px] h-9 w-1 bg-violet-400/40" />
            <div className="absolute left-[37%] top-[205px] rounded-2xl border border-orange-400/35 bg-orange-500/15 px-5 py-4 text-sm font-black text-orange-100 shadow-xl">Keuzemenu</div>
            <div className="absolute left-[29%] top-[257px] h-10 w-1 -rotate-[38deg] bg-white/20" />
            <div className="absolute left-[65%] top-[257px] h-10 w-1 rotate-[38deg] bg-white/20" />
            <div className="absolute bottom-5 left-[10%] rounded-xl border border-cyan-400/35 bg-cyan-500/15 px-4 py-3 text-xs font-black text-cyan-100">Fx: vertrouwen +1</div>
            <div className="absolute bottom-5 right-[7%] rounded-xl border border-teal-400/35 bg-teal-500/15 px-4 py-3 text-xs font-black text-teal-100">IF: geheim bekend?</div>
          </div>
        </div>
      </div>
    </section>
  );
}

function planAccent(plan: PublicPlanDefinition) {
  if (plan.accent === "emerald") return "border-emerald-400/25 bg-emerald-500/[0.07]";
  if (plan.accent === "blue") return "border-blue-400/30 bg-blue-500/[0.08]";
  return "border-violet-400/30 bg-violet-500/[0.08]";
}

function planButton(plan: PublicPlanDefinition) {
  if (plan.accent === "emerald") return "bg-emerald-400 text-black hover:bg-emerald-300";
  if (plan.accent === "blue") return "bg-blue-600 text-white hover:bg-blue-500";
  return "bg-violet-600 text-white hover:bg-violet-500";
}

function GuestPlans() {
  return (
    <section id="plannen" className="scroll-mt-28 px-5 pb-20 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-7xl">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.32em] text-blue-300">Kies jouw DiBooks</p>
          <h2 className="mt-4 text-4xl font-black sm:text-6xl">Eén account. Drie manieren om te beginnen.</h2>
          <p className="mx-auto mt-4 max-w-3xl text-sm font-semibold leading-7 text-neutral-400 sm:text-base">
            Gratis en Reader zijn allebei gemaakt om te lezen. Reader voegt straks premiumboeken toe, terwijl Auteur ook de volledige Auteur Studio en publicatieflow opent.
          </p>
        </div>
        <div className="mt-9 grid gap-5 lg:grid-cols-3">
          {PUBLIC_PLANS.map((plan) => (
            <article key={plan.id} className={`relative flex min-h-[420px] flex-col rounded-[2rem] border p-7 shadow-2xl ${planAccent(plan)}`}>
              {plan.id === "reader_plus" && (
                <span className="absolute right-5 top-5 rounded-full border border-blue-300/25 bg-blue-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-100">Voor lezers</span>
              )}
              {plan.id === "author_pro" && (
                <span className="absolute right-5 top-5 rounded-full border border-violet-300/25 bg-violet-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-violet-100">Studio</span>
              )}
              <p className="text-xs font-black uppercase tracking-[0.28em] text-neutral-500">{plan.eyebrow}</p>
              <h3 className="mt-3 text-4xl font-black">{plan.name}</h3>
              <p className="mt-3 text-xl font-black text-white/80">{plan.priceLabel}</p>
              {plan.paid && <p className="mt-1 text-xs font-bold text-neutral-500">Betaling wordt later gekoppeld.</p>}
              <p className="mt-5 text-sm font-semibold leading-7 text-neutral-300">{plan.description}</p>
              <div className="mt-6 grid gap-3">
                {plan.features.map((feature) => (
                  <div key={feature} className="flex items-start gap-3 text-sm font-bold text-neutral-200">
                    <span className="mt-0.5 text-emerald-300">✓</span>
                    <span>{feature}</span>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => openDiBooksAuth("register", plan.id)} className={`mt-auto rounded-2xl px-5 py-4 text-sm font-black transition hover:-translate-y-0.5 ${planButton(plan)}`}>
                {plan.id === "free" ? "Gratis account maken" : `${plan.name} kiezen`}
              </button>
            </article>
          ))}
        </div>
        <p className="mt-5 text-center text-xs font-bold leading-6 text-neutral-600">
          Admin is een interne beheerrol en verschijnt nooit als registratieoptie.
        </p>
      </div>
    </section>
  );
}

function BookRow({ title, rowBooks }: { title: string; rowBooks: DashboardBook[] }) {
  if (rowBooks.length === 0) return null;
  return (
    <section className="mt-10">
      <div className="mb-4 flex items-center justify-between gap-4 px-5 sm:px-8 lg:px-10">
        <h2 className="text-xl font-black text-white sm:text-2xl">{title}</h2>
        <span className="rounded-full border border-white/10 px-4 py-2 text-xs font-black uppercase tracking-widest text-neutral-500">{rowBooks.length} boeken</span>
      </div>
      <div className="flex gap-5 overflow-x-auto px-5 pb-3 sm:px-8 lg:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {rowBooks.map((book) => <BookCard key={`${title}-${book.source ?? "library"}-${book.id}`} book={book} />)}
      </div>
    </section>
  );
}

function makeGenreRows(allBooks: DashboardBook[]) {
  const preferredGenres = ["Sci-fi", "Mystery", "Fantasy", "Thriller", "Keuzeverhaal", "Interactief"];
  return preferredGenres
    .map((genre) => ({ genre, books: allBooks.filter((book) => book.genres.includes(genre)) }))
    .filter((row) => row.books.length > 0);
}

export default function LibraryPage() {
  const [publishedBooks, setPublishedBooks] = useState<DashboardBook[]>([]);
  const [comingSoonBooks, setComingSoonBooks] = useState<DashboardBook[]>([]);
  const [popularityByBookId, setPopularityByBookId] = useState<Record<string, number>>({});
  const { isLoggedIn, permissions } = useDemoAuth();

  useEffect(() => {
    let cancelled = false;
    async function loadDashboardBooks() {
      try {
        const [nextPublishedBooks, nextComingSoonBooks] = await Promise.all([
          fetchPublishedDashboardBooksFromSupabase(),
          fetchComingSoonDashboardBooksFromSupabase(),
        ]);
        if (!cancelled) {
          setPublishedBooks(nextPublishedBooks as DashboardBook[]);
          setComingSoonBooks(nextComingSoonBooks as DashboardBook[]);
        }
      } catch (error) {
        console.error("Kon gepubliceerde dashboardboeken niet laden uit Supabase.", error);
      }
    }
    void loadDashboardBooks();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPopularity() {
      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error } = await supabase.rpc(
          "get_public_book_popularity",
        );

        if (error) throw error;
        if (cancelled) return;

        const nextPopularity = Object.fromEntries(
          ((data ?? []) as PopularityRow[])
            .map((row) => {
              const bookId = String(row.book_id ?? row.bookId ?? "").trim();
              const readerCount = Number(
                row.reader_count ?? row.readerCount ?? 0,
              );

              return [
                bookId,
                Number.isFinite(readerCount)
                  ? Math.max(0, readerCount)
                  : 0,
              ] as const;
            })
            .filter(([bookId]) => !!bookId),
        );

        setPopularityByBookId(nextPopularity);
      } catch (error) {
        console.warn(
          "Kon publieke DiBooks-populariteit niet laden.",
          error,
        );
      }
    }

    void loadPopularity();

    return () => {
      cancelled = true;
    };
  }, []);

  const allBooks = useMemo<DashboardBook[]>(() => [...publishedBooks, ...comingSoonBooks], [publishedBooks, comingSoonBooks]);
  const liveBooks = useMemo(
    () => publishedBooks.filter((book) => book.published),
    [publishedBooks],
  );
  const popularBooks = useMemo(
    () => sortBooksByPopularity(liveBooks, popularityByBookId),
    [liveBooks, popularityByBookId],
  );
  const featuredBook =
    popularBooks[0] ?? liveBooks[0] ?? comingSoonBooks[0] ?? null;
  const mostReadBooks = popularBooks.slice(0, 12);
  const genreRows = makeGenreRows(liveBooks);

  return (
    <main className="min-h-screen overflow-hidden bg-[#05070d] text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_36%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_35%),linear-gradient(180deg,#05070d_0%,#05070d_45%,#020308_100%)]" />
      <AppNav title={isLoggedIn ? "Library" : "DiBooks"} subtitle={isLoggedIn ? "Ontdek interactieve boeken" : "Lees, kies en bouw interactieve verhalen"} />

      {!isLoggedIn && (
        <>
          <GuestHero
            popularBooks={popularBooks}
            popularityByBookId={popularityByBookId}
          />
          <GuestPopularSection
            books={popularBooks}
            popularityByBookId={popularityByBookId}
          />
          <GuestHowItWorks />
          <GuestAuthorStudio />
          <GuestPlans />
        </>
      )}

      <div id="library" className="scroll-mt-28">
        {!isLoggedIn && (
          <div className="mx-auto max-w-7xl px-5 pt-2 sm:px-8 lg:px-10">
            <p className="text-xs font-black uppercase tracking-[0.32em] text-blue-300">DiBooks Library</p>
            <h2 className="mt-3 text-4xl font-black sm:text-6xl">Ontdek wat er nu te lezen is.</h2>
          </div>
        )}

        {featuredBook ? (
          <section className="px-4 pt-6 sm:px-6 sm:pt-8 lg:px-8">
            <div className={`relative isolate overflow-hidden rounded-[1.5rem] border border-white/10 bg-gradient-to-br ${featuredBook.coverClass || FALLBACK_COVER_CLASS} shadow-2xl`}>
              {featuredBook.bannerImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={featuredBook.bannerImage} alt={`Banner van ${featuredBook.title}`} className="absolute inset-0 -z-10 h-full w-full object-cover opacity-85" />
              )}
              <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_20%,rgba(255,255,255,0.08),transparent_30%),radial-gradient(circle_at_88%_18%,rgba(37,99,235,0.10),transparent_34%),linear-gradient(90deg,rgba(0,0,0,0.88),rgba(0,0,0,0.72),rgba(0,0,0,0.50))]" />
              <div className="absolute -right-20 top-8 -z-10 h-[280px] w-[280px] rounded-full border border-white/8" />
              <div className="absolute -right-4 top-20 -z-10 h-[380px] w-[380px] rounded-full border border-white/5" />
              <div className="relative grid min-h-[285px] items-center gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_210px] lg:p-9">
                <div className="max-w-3xl">
                  {featuredBook.source === "dashboard" && (
                    <div className="mb-4 inline-flex rounded-full border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-black uppercase tracking-[0.25em] text-emerald-200">Nieuw gepubliceerd vanuit Dashboard</div>
                  )}
                  <div className="mb-5 flex flex-wrap gap-2">
                    {featuredBook.genres.map((genre) => <BookBadge key={genre}>{genre}</BookBadge>)}
                    <AccessBadge book={featuredBook} />
                    <BookBadge light>{getBookStatusLabel(featuredBook)}</BookBadge>
                  </div>
                  <h1 className="max-w-4xl text-4xl font-black leading-none sm:text-5xl lg:text-6xl">{featuredBook.title}</h1>
                  <p className="mt-4 max-w-2xl text-base font-semibold leading-7 text-neutral-300 sm:text-lg">{featuredBook.subtitle}</p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    {featuredBook.published ? (
                      <Link href={`/books/${featuredBook.id}/read`} className="rounded-2xl bg-white px-7 py-4 text-lg font-black text-black hover:bg-neutral-200">Lees nu</Link>
                    ) : (
                      <span className="rounded-2xl bg-neutral-700 px-7 py-4 text-lg font-black text-neutral-300">Binnenkort</span>
                    )}
                    <Link href={`/books/${featuredBook.id}`} className="rounded-2xl border border-white/15 bg-black/30 px-7 py-4 text-lg font-black text-white hover:bg-white/10">Meer informatie</Link>
                  </div>
                </div>
                <FeaturedPanel book={featuredBook} />
              </div>
            </div>
          </section>
        ) : (
          <section className="px-5 pt-10 sm:px-8 sm:pt-14 lg:px-10">
            <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-8 shadow-2xl sm:p-12">
              <p className="text-sm font-black uppercase tracking-[0.32em] text-blue-300">DiBooks Library</p>
              <h1 className="mt-4 max-w-4xl text-5xl font-black leading-none sm:text-7xl">Nog geen boeken live.</h1>
              <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-neutral-300 sm:text-lg">Zodra auteurs hun eerste DiBooks publiceren, verschijnen ze hier automatisch in de Library.</p>
            </div>
          </section>
        )}

        {comingSoonBooks.length > 0 && <BookRow title="Binnenkort" rowBooks={comingSoonBooks} />}
        {liveBooks.length > 0 && <BookRow title="Nieuw in de Library" rowBooks={liveBooks} />}
        <BookRow title="Populair bij lezers" rowBooks={mostReadBooks} />
        {genreRows.map((row) => <BookRow key={row.genre} title={row.genre} rowBooks={row.books} />)}
      </div>

      <section className="mx-5 mb-12 mt-14 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:mx-8 lg:mx-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-cyan-300">Auteur Studio</p>
            <h2 className="mt-2 text-2xl font-black">Van idee naar interactief boek</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
              {permissions.canUseDashboard
                ? "Je Auteur-plan is actief. Je kunt onbeperkt bouwen, online opslaan en publiceren."
                : isLoggedIn
                  ? "Je kunt de Auteur Studio nu al proberen met maximaal 15 verhaalnodes en lokaal opslaan. Author Pro ontgrendelt Dashboard en publiceren."
                  : "Iedereen kan de Auteur Studio gratis proberen met maximaal 15 verhaalnodes. Voor online opslag en publiceren heb je Author Pro nodig."}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            {permissions.canUseDashboard && (
              <Link href="/dashboard" className="rounded-2xl border border-white/15 bg-white/5 px-6 py-4 text-center font-black text-white hover:bg-white/10">
                Naar Dashboard
              </Link>
            )}
            <Link href="/editor" className="rounded-2xl bg-cyan-500 px-6 py-4 text-center font-black text-black hover:bg-cyan-400">
              {permissions.canUseDashboard ? "Naar Auteur Studio" : "Probeer Auteur Studio"}
            </Link>
            {!permissions.canUseDashboard && (
              isLoggedIn ? (
                <Link href="/account" className="rounded-2xl bg-violet-600 px-6 py-4 text-center font-black text-white hover:bg-violet-500">
                  Bekijk Auteur-plan
                </Link>
              ) : (
                <button type="button" onClick={() => openDiBooksAuth("register", "author_pro")} className="rounded-2xl bg-violet-600 px-6 py-4 text-center font-black text-white hover:bg-violet-500">
                  Kies Auteur
                </button>
              )
            )}
          </div>
        </div>
      </section>

      <footer className="border-t border-white/5 px-5 py-8 text-sm font-bold text-neutral-500 sm:px-8 lg:px-10">
        DiBooks Library • {allBooks.length} boeken in catalogus • {liveBooks.length} live • {comingSoonBooks.length} binnenkort
      </footer>
    </main>
  );
}
