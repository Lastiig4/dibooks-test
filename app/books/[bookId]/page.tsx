"use client";

import Link from "next/link";
import AppNav from "@/components/AppNav";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import type { DiBook } from "@/lib/books";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import AuthModal from "@/components/AuthModal";
import { useDemoAuth } from "@/lib/auth";
import {
  canUserReadBookAccess,
  getAccessLabel,
  getReadingProgress,
  getReadBlockReason,
  resetReadingProgress,
  isBookFavorite,
  setBookFavorite,
  type BookAccessType,
  type ReadingProgress,
} from "@/lib/supabase/readerFeatures";

type DetailBook = DiBook & {
  source?: "library" | "dashboard";
  ownerId?: string;
  ownerName?: string;
  ownerEmail?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  projectData?: any;
  colorTheme?: string;
  accessType?: BookAccessType;
};

type PublicSeriesBook = {
  id: string;
  title: string;
  subtitle: string;
  coverImage: string;
  status: string;
  published: boolean;
  seriesId: string;
  seriesTitle: string;
  seriesOrder: number | null;
};

const FALLBACK_COVER_CLASS = "from-blue-950 via-slate-950 to-purple-950";
const FALLBACK_ACCENT_CLASS = "border-blue-500/50";

function mapSupabaseBook(row: any): DetailBook {
  return {
    id: row.id,
    title: row.title,
    author: row.author ?? row.owner_name ?? "Auteur",
    subtitle: row.subtitle ?? "Nieuw interactief boek.",
    description: row.description ?? "Nog geen beschrijving ingevuld.",
    genres: Array.isArray(row.genres) && row.genres.length > 0 ? row.genres : ["Interactief"],
    primaryGenre: row.primary_genre ?? "Interactief",
    status: row.status ?? "Testversie",
    ageRating: row.age_rating ?? "12+",
    readTime: row.read_time ?? "Concept",
    storyFile: row.story_file ?? undefined,
    coverImage: row.cover_image ?? "",
    bannerImage: row.banner_image ?? "",
    coverClass: row.cover_class ?? FALLBACK_COVER_CLASS,
    accentClass: row.accent_class ?? FALLBACK_ACCENT_CLASS,
    featured: !!row.featured,
    mostRead: !!row.most_read,
    published: !!row.published,
    accessType: row.access_type === "premium" ? "premium" : "free",
    source: "dashboard",
    ownerId: row.owner_id,
    ownerName: row.owner_name ?? "Auteur",
    ownerEmail: row.owner_email ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at ?? undefined,
    projectData: row.project_data ?? undefined,
    colorTheme: row.color_theme ?? "blue",
  };
}

function DiBooksLogo() {
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

function Badge({ children, light = false }: { children: React.ReactNode; light?: boolean }) {
  return (
    <span
      className={
        light
          ? "rounded-full bg-white px-3 py-1 text-[11px] font-black uppercase tracking-widest text-black shadow-sm"
          : "rounded-full bg-black/45 px-3 py-1 text-[11px] font-black uppercase tracking-widest text-white/90 ring-1 ring-white/10 backdrop-blur-sm"
      }
    >
      {children}
    </span>
  );
}

function getStatusLabel(book: DetailBook) {
  if (book.source === "dashboard") return book.published ? "Live" : book.status;
  return book.status;
}

function getAccessPillClass(book: DetailBook) {
  return book.accessType === "premium"
    ? "border-yellow-400/35 bg-yellow-500/15 text-yellow-100"
    : "border-emerald-400/30 bg-emerald-500/12 text-emerald-100";
}

function AccessPill({ book }: { book: DetailBook }) {
  return (
    <span className={`rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-widest ${getAccessPillClass(book)}`}>
      {getAccessLabel(book.accessType)}
    </span>
  );
}

function isPublishedBook(book: DetailBook) {
  return !!book.published;
}

function ArtworkPanel({ book }: { book: DetailBook }) {
  const coverClass = book.coverClass || FALLBACK_COVER_CLASS;
  const image = book.coverImage || book.bannerImage;

  return (
    <div className={`relative isolate overflow-hidden rounded-[2rem] border ${book.accentClass || FALLBACK_ACCENT_CLASS} bg-gradient-to-br ${coverClass} shadow-2xl`}>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt={`Cover van ${book.title}`} className="absolute inset-0 -z-10 h-full w-full object-contain bg-black" />
      )}
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_15%,rgba(255,255,255,0.16),transparent_30%),linear-gradient(180deg,rgba(0,0,0,0.04),rgba(0,0,0,0.16))]" />
      {!image && (
        <>
          <div className="absolute -right-20 top-10 -z-10 h-56 w-56 rounded-full border border-white/10" />
          <div className="absolute -right-10 top-28 -z-10 h-80 w-80 rounded-full border border-white/10" />
        </>
      )}

      <div className="min-h-[480px] p-5 sm:min-h-[560px] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <Badge>{book.primaryGenre}</Badge>
          <Badge light>{getStatusLabel(book)}</Badge>
        </div>
      </div>
    </div>
  );
}

function HeroBackground({ book }: { book: DetailBook }) {
  const coverClass = book.coverClass || FALLBACK_COVER_CLASS;
  const image = book.bannerImage || book.coverImage;

  return (
    <div className={`absolute inset-0 -z-10 bg-gradient-to-br ${coverClass}`}>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="h-full w-full object-cover opacity-70" />
      )}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(255,255,255,0.14),transparent_26%),linear-gradient(90deg,rgba(0,0,0,0.96),rgba(0,0,0,0.68),rgba(0,0,0,0.34)),linear-gradient(180deg,rgba(5,7,13,0.08),#05070d_92%)]" />
    </div>
  );
}

function SeriesShelf({
  currentBookId,
  books,
}: {
  currentBookId: string;
  books: PublicSeriesBook[];
}) {
  if (books.length === 0) return null;

  const seriesTitle = books[0]?.seriesTitle || "Serie";

  return (
    <section className="mx-auto max-w-7xl px-5 pb-8 sm:px-8 lg:px-10">
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.035] p-5 shadow-2xl sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.32em] text-purple-300">
              Onderdeel van serie
            </p>
            <h2 className="mt-2 text-2xl font-black text-white sm:text-3xl">
              {seriesTitle}
            </h2>
          </div>
          <p className="text-xs font-bold text-neutral-500">
            {books.length} {books.length === 1 ? "publiek deel" : "publieke delen"}
          </p>
        </div>

        <div className="mt-5 flex gap-4 overflow-x-auto pb-2">
          {books.map((seriesBook) => {
            const isCurrent = seriesBook.id === currentBookId;
            const orderLabel = seriesBook.seriesOrder
              ? `Boek ${seriesBook.seriesOrder}`
              : "Deel";

            const card = (
              <div
                className={`w-[132px] shrink-0 rounded-2xl border p-2 transition sm:w-[150px] ${
                  isCurrent
                    ? "border-purple-300/70 bg-purple-500/15 shadow-[0_0_28px_rgba(192,132,252,0.12)]"
                    : "border-white/10 bg-black/25 hover:border-white/25 hover:bg-white/[0.07]"
                }`}
              >
                <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-black">
                  {seriesBook.coverImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={seriesBook.coverImage}
                      alt={`Cover van ${seriesBook.title}`}
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-slate-950 via-neutral-950 to-purple-950 p-3 text-center text-xs font-black text-neutral-500">
                      Geen cover
                    </div>
                  )}

                  <span className="absolute left-2 top-2 rounded-full bg-black/75 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-white backdrop-blur-sm">
                    {orderLabel}
                  </span>

                  {!seriesBook.published && (
                    <span className="absolute bottom-2 left-2 rounded-full bg-yellow-400 px-2 py-1 text-[9px] font-black uppercase tracking-widest text-black">
                      Binnenkort
                    </span>
                  )}
                </div>

                <p className="mt-2 line-clamp-2 text-xs font-black leading-4 text-white">
                  {seriesBook.title}
                </p>
                {isCurrent && (
                  <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-purple-300">
                    Dit boek
                  </p>
                )}
              </div>
            );

            return isCurrent ? (
              <div key={seriesBook.id}>{card}</div>
            ) : (
              <Link
                key={seriesBook.id}
                href={`/books/${seriesBook.id}`}
                title={`Open ${seriesBook.title}`}
              >
                {card}
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function InfoTile({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-neutral-500">{label}</p>
      <p className="mt-1 text-sm font-black text-white">{value || "-"}</p>
    </div>
  );
}

export default function BookDetailPage() {
  const params = useParams<{ bookId: string }>();
  const bookId = Array.isArray(params?.bookId) ? params.bookId[0] : params?.bookId;
  const [book, setBook] = useState<DetailBook | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, isLoggedIn, permissions, loginWithCredentials, registerWithCredentials, logout } = useDemoAuth();
  const [authModalMode, setAuthModalMode] = useState<"login" | "register" | null>(null);
  const [favorite, setFavorite] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [readingProgress, setReadingProgress] = useState<ReadingProgress | null>(null);
  const [resetProgressBusy, setResetProgressBusy] = useState(false);
  const [seriesBooks, setSeriesBooks] = useState<PublicSeriesBook[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadBook() {
      if (!bookId) return;

      setLoading(true);
      setError(null);

      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error: supabaseError } = await supabase.rpc("get_public_library_book", {
          input_book_id: bookId,
        });

        if (supabaseError) throw supabaseError;

        const publicBook = Array.isArray(data) ? data[0] : data;

        if (!cancelled) {
          setBook(publicBook ? mapSupabaseBook(publicBook) : null);
          setLoading(false);
        }
      } catch (loadError) {
        console.error("Kon boekdetail niet laden.", loadError);
        if (!cancelled) {
          setError("Dit boek kon niet geladen worden.");
          setLoading(false);
        }
      }
    }

    void loadBook();

    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    let cancelled = false;

    async function loadSeries() {
      if (!book?.id) {
        setSeriesBooks([]);
        return;
      }

      try {
        const supabase = createSupabaseBrowserClient();
        const { data, error: seriesError } = await supabase.rpc(
          "get_public_book_series",
          { input_book_id: book.id },
        );

        if (seriesError) {
          console.warn("Kon publieke serie niet laden.", seriesError);
          if (!cancelled) setSeriesBooks([]);
          return;
        }

        const mappedBooks: PublicSeriesBook[] = (data ?? []).map((row: any) => ({
          id: row.book_id,
          title: row.title ?? "Ongetiteld boek",
          subtitle: row.subtitle ?? "",
          coverImage: row.cover_image ?? "",
          status: row.status ?? "Concept",
          published: !!row.published,
          seriesId: row.series_id,
          seriesTitle: row.series_title ?? "Serie",
          seriesOrder:
            row.series_order === null || row.series_order === undefined
              ? null
              : Number(row.series_order),
        }));

        if (!cancelled) setSeriesBooks(mappedBooks);
      } catch (seriesLoadError) {
        console.warn("Kon publieke serie niet laden.", seriesLoadError);
        if (!cancelled) setSeriesBooks([]);
      }
    }

    void loadSeries();

    return () => {
      cancelled = true;
    };
  }, [book?.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadReaderData() {
      if (!book?.id || !user) {
        setFavorite(false);
        setReadingProgress(null);
        return;
      }

      try {
        const [nextFavorite, nextProgress] = await Promise.all([
          isBookFavorite(user, book.id),
          getReadingProgress(user, book.id),
        ]);

        if (!cancelled) {
          setFavorite(nextFavorite);
          setReadingProgress(nextProgress);
        }
      } catch (readerDataError) {
        console.warn("Kon favoriet/leesvoortgang niet laden.", readerDataError);
      }
    }

    void loadReaderData();

    return () => {
      cancelled = true;
    };
  }, [book?.id, user]);

  const readHref = useMemo(() => (book ? `/books/${book.id}/read` : "#"), [book]);
  const canReadThisBook = !!book && isPublishedBook(book) && canUserReadBookAccess(user, book.accessType);
  const readBlockReason = book ? getReadBlockReason(user, book.accessType) : null;
  const progressPercent = Math.max(0, Math.min(100, readingProgress?.progressPercent ?? 0));
  const hasReadingProgress = !!readingProgress && (progressPercent > 0 || (readingProgress.pageIndex ?? 0) > 0);

  async function handleRestartReading() {
    if (!user || !book) return;

    const confirmed = window.confirm(
      "Weet je dit zeker? Je leesvoortgang voor dit boek wordt gewist en je begint opnieuw bij het begin.",
    );

    if (!confirmed) return;

    setResetProgressBusy(true);

    try {
      await resetReadingProgress(user, book.id);
      setReadingProgress(null);
      window.location.href = readHref;
    } catch (resetError: any) {
      alert(`Leesvoortgang resetten mislukt: ${resetError?.message ?? "onbekende fout"}`);
    } finally {
      setResetProgressBusy(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070d] p-5 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.32em] text-blue-300">DiBooks</p>
          <h1 className="mt-3 text-3xl font-black">Boek laden...</h1>
        </div>
      </main>
    );
  }

  if (!book || error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070d] p-5 text-white">
        <div className="max-w-2xl rounded-3xl border border-white/10 bg-white/[0.04] p-8 text-center shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.32em] text-red-300">Niet gevonden</p>
          <h1 className="mt-3 text-4xl font-black">Dit boek bestaat niet of staat niet in de Library.</h1>
          <p className="mt-4 text-sm font-semibold leading-6 text-neutral-400">
            Conceptboeken zijn alleen zichtbaar in het Dashboard. Boeken met status Binnenkort mogen wel als aankondiging in de Library staan, maar zijn nog niet leesbaar.
          </p>
          <Link href="/" className="mt-6 inline-flex rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500">
            Terug naar Library
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen overflow-hidden bg-[#05070d] text-white">
      <AppNav title="Boekpagina" subtitle={book.title} />

      <section className="relative isolate px-5 py-8 sm:px-8 sm:py-12 lg:px-10">
        <HeroBackground book={book} />

        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_420px] lg:items-center xl:grid-cols-[1fr_470px]">
          <div className="max-w-4xl">
            {book.source === "dashboard" && (
              <div
                className={`mb-5 inline-flex rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.25em] ${
                  book.status === "Binnenkort" && !book.published
                    ? "border-yellow-400/30 bg-yellow-500/10 text-yellow-100"
                    : "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                }`}
              >
                {book.status === "Binnenkort" && !book.published
                  ? "Aangekondigd door auteur"
                  : "Nieuw gepubliceerd vanuit Dashboard"}
              </div>
            )}

            <div className="mb-5 flex flex-wrap gap-2">
              {book.genres.map((genre) => (
                <Badge key={genre}>{genre}</Badge>
              ))}
              <Badge light>{getStatusLabel(book)}</Badge>
              <AccessPill book={book} />
            </div>

            <h1 className="max-w-4xl text-5xl font-black leading-none sm:text-7xl lg:text-8xl">
              {book.title}
            </h1>
            <p className="mt-5 max-w-3xl text-lg font-bold leading-8 text-neutral-200 sm:text-xl">
              {book.subtitle}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              {canReadThisBook ? (
                <Link href={readHref} className="rounded-2xl bg-white px-7 py-4 text-lg font-black text-black hover:bg-neutral-200">
                  {hasReadingProgress ? `Verder lezen (${progressPercent}%)` : "Lees nu"}
                </Link>
              ) : book.status === "Binnenkort" && !book.published ? (
                <span className="rounded-2xl bg-neutral-700 px-7 py-4 text-lg font-black text-neutral-300">
                  Nog niet leesbaar
                </span>
              ) : !isLoggedIn ? (
                <button onClick={() => setAuthModalMode("register")} className="rounded-2xl bg-white px-7 py-4 text-lg font-black text-black hover:bg-neutral-200">
                  Login gratis om te lezen
                </button>
              ) : (
                <button onClick={() => alert("Reader Plus is straks het goedkopere lezersabonnement voor premium boeken. Voor nu kun je dit testen door je account-plan in Supabase op reader_plus te zetten.")} className="rounded-2xl bg-yellow-500 px-7 py-4 text-lg font-black text-black hover:bg-yellow-400">
                  {readBlockReason || "Reader Plus nodig"}
                </button>
              )}
              {canReadThisBook && hasReadingProgress && (
                <button
                  onClick={handleRestartReading}
                  disabled={resetProgressBusy}
                  className="rounded-2xl border border-red-400/30 bg-red-500/10 px-7 py-4 text-lg font-black text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {resetProgressBusy ? "Resetten..." : "↻ Opnieuw lezen"}
                </button>
              )}
              <Link href="/" className="rounded-2xl border border-white/15 bg-black/30 px-7 py-4 text-lg font-black text-white hover:bg-white/10">
                Terug naar Library
              </Link>
              {isLoggedIn ? (
                <button
                  onClick={async () => {
                    if (!user || !book) return;
                    setFavoriteBusy(true);
                    try {
                      const nextFavorite = await setBookFavorite(user, book.id, !favorite);
                      setFavorite(nextFavorite);
                    } catch (favoriteError: any) {
                      alert(`Favoriet aanpassen mislukt: ${favoriteError?.message ?? "onbekende fout"}`);
                    } finally {
                      setFavoriteBusy(false);
                    }
                  }}
                  disabled={favoriteBusy}
                  className={`rounded-2xl border px-7 py-4 text-lg font-black transition disabled:opacity-50 ${
                    favorite
                      ? "border-yellow-400/40 bg-yellow-500/20 text-yellow-100 hover:bg-yellow-500/30"
                      : "border-white/15 bg-black/30 text-white hover:bg-white/10"
                  }`}
                >
                  {favorite ? "★ Favoriet" : "☆ Favoriet"}
                </button>
              ) : (
                <button onClick={() => setAuthModalMode("login")} className="rounded-2xl border border-yellow-400/25 bg-yellow-500/10 px-7 py-4 text-lg font-black text-yellow-100 hover:bg-yellow-500/20">
                  ☆ Favoriet
                </button>
              )}
            </div>
          </div>

          <ArtworkPanel book={book} />
        </div>
      </section>

      <SeriesShelf currentBookId={book.id} books={seriesBooks} />

      <section className="mx-auto grid max-w-7xl gap-8 px-5 pb-14 sm:px-8 lg:grid-cols-[1fr_360px] lg:px-10">
        <article className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-2xl sm:p-8">
          <p className="text-sm font-black uppercase tracking-[0.32em] text-blue-300">Over dit boek</p>
          <h2 className="mt-3 text-3xl font-black sm:text-4xl">Beschrijving</h2>
          <p className="mt-5 whitespace-pre-line text-base font-semibold leading-8 text-neutral-300 sm:text-lg">
            {book.description || "Nog geen beschrijving ingevuld."}
          </p>

          <div className="mt-8 rounded-3xl border border-blue-500/20 bg-blue-500/10 p-5 text-sm font-semibold leading-7 text-blue-100">
            DiBooks-boeken kunnen tekst, keuzes, cutscenes en mini-games bevatten. Boeken met de status Binnenkort zijn alleen een aankondiging; lezen kan pas zodra de auteur het boek publiceert.
          </div>

          <div className={`mt-4 rounded-3xl border p-5 text-sm font-semibold leading-7 ${
            book.accessType === "premium"
              ? "border-yellow-500/20 bg-yellow-500/10 text-yellow-100"
              : "border-emerald-500/20 bg-emerald-500/10 text-emerald-100"
          }`}>
            {book.accessType === "premium"
              ? "Premium boek: zichtbaar in de Library, maar lezen vereist straks Reader Plus, Author Pro of Admin."
              : "Gratis boek: zichtbaar in de Library en leesbaar met een gratis DiBooks-account, zodat je voortgang en favorieten bewaard blijven."}
          </div>

          {readingProgress && (
            <div className="mt-4 rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5 text-sm font-semibold leading-7 text-emerald-100">
              Je bent ongeveer <strong>{progressPercent}%</strong> van dit boek onderweg. Klik op <strong>Verder lezen</strong> om door te gaan waar je gebleven was, of kies <strong>Opnieuw lezen</strong> om vanaf het begin te starten.
            </div>
          )}
        </article>

        <aside className="grid content-start gap-4">
          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
            <p className="text-sm font-black uppercase tracking-[0.32em] text-neutral-500">Boekinfo</p>
            <div className="mt-4 grid gap-3">
              <InfoTile label="Auteur" value={book.author} />
              <InfoTile label="Hoofdgenre" value={book.primaryGenre} />
              <InfoTile label="Status" value={getStatusLabel(book)} />
              <InfoTile label="Toegang" value={getAccessLabel(book.accessType)} />
              <InfoTile label="Leeftijd" value={book.ageRating} />
              <InfoTile label="Leestijd" value={book.readTime} />
              {book.source === "dashboard" && <InfoTile label="Bron" value="Dashboard publicatie" />}
            </div>
          </div>

          <div className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-5 shadow-2xl">
            <p className="text-sm font-black uppercase tracking-[0.32em] text-neutral-500">Genres</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {book.genres.map((genre) => (
                <span key={genre} className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-neutral-200">
                  {genre}
                </span>
              ))}
            </div>
          </div>
        </aside>
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
