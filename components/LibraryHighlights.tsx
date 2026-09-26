"use client";

import Link from "next/link";
import { useState } from "react";
import { isLibraryTutorial, libraryReaderCount, selectLibraryHighlights, type LibraryBook } from "@/lib/librarySelection";

function BookCover({ book }: { book: LibraryBook }) {
  return (
    <div className={`relative aspect-[2/3] overflow-hidden rounded-lg bg-gradient-to-br ${book.coverClass || "from-blue-950 to-slate-950"}`}>
      {book.coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={book.coverImage} alt={`Cover van ${book.title}`} loading="lazy" className="h-full w-full object-contain" />
      ) : (
        <div className="flex h-full flex-col justify-between p-4">
          <span className="text-xs font-bold tracking-widest text-white/50">DiBooks</span>
          <span className="break-words text-xl font-black text-white">{book.title}</span>
        </div>
      )}
    </div>
  );
}

export function LibraryBackdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-56 top-12 h-[650px] w-[650px] rounded-full bg-blue-700/[0.07] blur-[120px]" />
      <svg viewBox="0 0 1600 1000" preserveAspectRatio="xMidYMid slice" className="h-full w-full opacity-[0.09] blur-[3px]">
        <g fill="none" stroke="#60a5fa" strokeWidth="2">
          <path d="M-80 120 Q80 120 140 260 T300 470 M140 260 Q-20 400 80 600 T240 880 M300 470 Q220 680 240 880" />
          <path d="M1680 90 Q1490 180 1460 330 T1310 560 M1460 330 Q1600 500 1510 730 T1640 1030 M1310 560 Q1350 750 1510 730" />
        </g>
        <g fill="none" strokeWidth="7" strokeLinecap="round">
          <path stroke="#3b82f6" d="M128 248l24 24m0-24l-24 24 M228 868l24 24m0-24l-24 24 M1498 718l24 24m0-24l-24 24" />
          <path stroke="#22d3ee" d="M288 458l24 24m0-24l-24 24 M1448 318l24 24m0-24l-24 24" />
          <path stroke="#a78bfa" d="M68 588l24 24m0-24l-24 24 M1298 548l24 24m0-24l-24 24" />
        </g>
      </svg>
    </div>
  );
}

export function LibraryBookCard({ book }: { book: LibraryBook }) {
  return (
    <Link href={`/books/${book.id}`} className="group w-[220px] shrink-0 snap-start rounded-2xl border border-white/10 bg-[#0c1019]/95 p-3 transition hover:-translate-y-1 hover:border-blue-300/40 focus-visible:outline-2 focus-visible:outline-cyan-300 sm:w-[260px] xl:w-[280px] motion-reduce:transform-none">
      <BookCover book={book} />
      <div className="px-1 pb-1 pt-4">
        <div className="flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider">
          <span className="text-blue-200/80">{isLibraryTutorial(book) ? "Tutorial" : book.primaryGenre}</span>
          <span className={book.accessType === "premium" ? "text-amber-200" : "text-emerald-300"}>{book.accessType === "premium" ? "Premium" : "Gratis"}</span>
          {!book.published && <span className="text-neutral-400">{book.status}</span>}
        </div>
        <h3 className="mt-2 line-clamp-2 text-xl font-bold leading-tight text-white">{book.title}</h3>
        <div className="mt-3 flex items-center justify-between gap-3">
          <span className="truncate text-xs text-neutral-400">{book.author}</span>
          <span className="shrink-0 text-xs font-bold text-blue-200 group-hover:text-white">Bekijk →</span>
        </div>
      </div>
    </Link>
  );
}

export default function LibraryHighlights({ books, counts }: { books: LibraryBook[]; counts: Record<string, number> }) {
  const [preference, setPreference] = useState<"popular" | "latest">("popular");
  const { latest, popular, upcoming } = selectLibraryHighlights(books, counts);
  const mode = latest.length === 0 ? "upcoming" : preference === "popular" && popular.length > 0 ? "popular" : "latest";
  const selected = (mode === "upcoming" ? upcoming : mode === "popular" ? popular : latest).slice(0, 3);
  if (!selected.length) return null;

  return (
    <section aria-labelledby="library-highlights-title" className="px-5 pt-8 sm:px-8 lg:px-10">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.26em] text-cyan-200/75">Ontdek je volgende verhaal</p>
          <h1 id="library-highlights-title" className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{mode === "popular" ? "Meest gelezen" : mode === "latest" ? "Nieuwe uitgaven" : "Binnenkort op DiBooks"}</h1>
        </div>
        {latest.length > 0 && (
          <div role="group" aria-label="Boekselectie" className="flex rounded-full border border-white/10 bg-[#0c1019] p-1 text-xs font-semibold">
            <button type="button" aria-pressed={mode === "popular"} disabled={!popular.length} title={!popular.length ? "Nog geen leescijfers beschikbaar" : undefined} onClick={() => setPreference("popular")} className={`rounded-full px-4 py-2.5 transition focus-visible:outline-2 focus-visible:outline-cyan-300 disabled:opacity-40 ${mode === "popular" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white"}`}>Meest gelezen</button>
            <button type="button" aria-pressed={mode === "latest"} onClick={() => setPreference("latest")} className={`rounded-full px-4 py-2.5 transition focus-visible:outline-2 focus-visible:outline-cyan-300 ${mode === "latest" ? "bg-white/10 text-white" : "text-neutral-400 hover:text-white"}`}>Nieuwe uitgaven</button>
          </div>
        )}
      </div>
      <div key={mode} className="grid auto-cols-[min(86vw,360px)] grid-flow-col snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:auto-cols-auto lg:grid-flow-row lg:grid-cols-3">
        {selected.map((book, index) => (
          <article key={book.id} className="flex min-w-0 snap-start gap-4 rounded-2xl border border-white/10 bg-[#0c1019]/95 p-4 sm:gap-5">
            <Link href={`/books/${book.id}`} aria-label={`Bekijk ${book.title}`} className="w-[104px] shrink-0 self-start rounded-lg shadow-xl shadow-black/30 transition hover:-translate-y-1 focus-visible:outline-2 focus-visible:outline-cyan-300 sm:w-[128px] motion-reduce:transform-none"><BookCover book={book} /></Link>
            <div className="flex min-w-0 flex-1 flex-col items-start py-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-200/70">{mode === "popular" ? `#${index + 1} · ${libraryReaderCount(book, counts).toLocaleString("nl-NL")} lezers` : mode === "latest" ? "Nieuw verschenen" : "Binnenkort"}</p>
              <h2 className="mt-2 line-clamp-2 break-words text-lg font-bold leading-tight sm:text-xl"><Link href={`/books/${book.id}`} className="hover:text-blue-200">{book.title}</Link></h2>
              <p className="mt-2 max-w-full truncate text-xs text-neutral-400">{book.author}</p>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-400">{book.subtitle}</p>
              <Link href={`/books/${book.id}`} className="mt-auto pt-4 text-xs font-bold text-blue-200 hover:text-white">{book.published ? "Ontdek dit boek" : "Meer informatie"} <span aria-hidden="true">↗</span></Link>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
