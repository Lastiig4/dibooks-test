"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  books,
  getBookDetailPath,
  getBookReadPath,
  type BookStatus,
  type DiBook,
} from "@/lib/books";
import AuthModal from "@/components/AuthModal";
import { canAccessOwnedResource, useDemoAuth } from "@/lib/auth";
import {
  deleteDashboardBookFromSupabase,
  fetchDashboardBooksFromSupabase,
  publishDashboardBookInSupabase,
  removeDashboardBookFromLibraryInSupabase,
  saveDashboardBookToSupabase,
} from "@/lib/supabase/dashboardBooks";

type DashboardBook = DiBook & {
  source?: "library" | "dashboard";
  ownerId?: string;
  ownerName?: string;
  ownerEmail?: string;
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string;
  removedFromLibraryAt?: string;
  projectData?: any;
  colorTheme?: string;
};

type NewBookForm = {
  title: string;
  author: string;
  subtitle: string;
  description: string;
  genres: string[];
  genreInput: string;
  primaryGenre: string;
  status: BookStatus;
  ageRating: string;
  readTime: string;
  colorTheme: string;
};

const DASHBOARD_BOOKS_STORAGE_KEY = "dibooks-dashboard-books-v1";

const defaultForm: NewBookForm = {
  title: "",
  author: "Giovanni",
  subtitle: "",
  description: "",
  genres: ["Interactief"],
  genreInput: "",
  primaryGenre: "Interactief",
  status: "Concept",
  ageRating: "12+",
  readTime: "Concept",
  colorTheme: "blue",
};

const ageRatings = ["AL", "6+", "9+", "12+", "16+", "18+"];
const suggestedGenres = [
  "Sci-fi",
  "Fantasy",
  "Mystery",
  "Thriller",
  "Romance",
  "Horror",
  "Avontuur",
  "Dystopie",
  "Interactief",
  "Keuzeverhaal",
  "Dossier",
  "Medieval",
];

const colorThemes: Record<
  string,
  { label: string; coverClass: string; accentClass: string; coverImage: string; bannerImage: string }
> = {
  blue: {
    label: "Blauw / sci-fi",
    coverClass: "from-blue-950 via-slate-950 to-purple-950",
    accentClass: "border-blue-500/60",
    coverImage: "/books/the-sovereign/cover.svg",
    bannerImage: "/books/the-sovereign/banner.svg",
  },
  gold: {
    label: "Goud / dossier",
    coverClass: "from-yellow-950 via-neutral-950 to-stone-900",
    accentClass: "border-yellow-400/40",
    coverImage: "/books/briars-logs/cover.svg",
    bannerImage: "/books/briars-logs/banner.svg",
  },
  red: {
    label: "Rood / fantasy",
    coverClass: "from-red-950 via-stone-950 to-yellow-950",
    accentClass: "border-red-400/40",
    coverImage: "/books/crown-of-ash/cover.svg",
    bannerImage: "/books/crown-of-ash/banner.svg",
  },
  green: {
    label: "Groen / mystery",
    coverClass: "from-cyan-950 via-neutral-950 to-emerald-950",
    accentClass: "border-cyan-400/40",
    coverImage: "/books/echoes-of-lumina/cover.svg",
    bannerImage: "/books/echoes-of-lumina/banner.svg",
  },
  orange: {
    label: "Oranje / thriller",
    coverClass: "from-orange-950 via-stone-950 to-red-950",
    accentClass: "border-orange-400/40",
    coverImage: "/books/the-dust-protocol/cover.svg",
    bannerImage: "/books/the-dust-protocol/banner.svg",
  },
};

function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || `boek-${Date.now()}`;
}

function DiBooksLogo() {
  return (
    <Link href="/" className="group flex items-end leading-none" aria-label="Terug naar DiBooks Library">
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

function statusClass(book: DashboardBook) {
  if (book.published) return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
  if (book.status === "Concept") return "border-yellow-500/40 bg-yellow-500/10 text-yellow-200";
  if (book.status === "Binnenkort") return "border-purple-500/40 bg-purple-500/10 text-purple-200";
  return "border-blue-500/40 bg-blue-500/10 text-blue-200";
}

function BookDashboardCard({
  book,
  onPublish,
  onRemoveFromLibrary,
  onDeleteDraft,
}: {
  book: DashboardBook;
  onPublish: (bookId: string) => void;
  onRemoveFromLibrary: (bookId: string) => void;
  onDeleteDraft: (bookId: string) => void;
}) {
  const isPublished = !!book.published;
  const canEdit = !isPublished;
  const isDashboardBook = book.source === "dashboard";
  const detailHref = book.source === "dashboard" ? "/dashboard" : getBookDetailPath(book);
  const readHref = book.source === "dashboard" ? "" : getBookReadPath(book);

  return (
    <article className="overflow-hidden rounded-3xl border border-white/10 bg-white/[0.035] shadow-2xl">
      <div className={`relative h-40 overflow-hidden bg-gradient-to-br ${book.coverClass}`}>
        {book.bannerImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.bannerImage}
            alt={`Banner van ${book.title}`}
            className="absolute inset-0 h-full w-full object-cover opacity-75"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-transparent" />
        <div className="absolute bottom-4 left-4 right-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs font-black uppercase tracking-widest ${statusClass(book)}`}>
              {isPublished ? "Live / vergrendeld" : book.status}
            </span>
            <span className="rounded-full bg-black/55 px-3 py-1 text-xs font-black uppercase tracking-widest text-white/85">
              {book.primaryGenre}
            </span>
            {book.source === "dashboard" && (
              <span className="rounded-full border border-blue-400/25 bg-blue-500/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-blue-200">
                Dashboard concept
              </span>
            )}
          </div>
          <h2 className="mt-3 line-clamp-1 text-3xl font-black text-white">{book.title}</h2>
        </div>
      </div>

      <div className="grid gap-5 p-5">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-blue-300">{book.author}</p>
          <p className="mt-2 line-clamp-2 text-sm font-semibold leading-6 text-neutral-300">{book.subtitle}</p>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Status</p>
            <p className="mt-1 font-black text-white">{isPublished ? "Live" : book.status}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Bewerken</p>
            <p className="mt-1 font-black text-white">{canEdit ? "Open" : "Locked"}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Leeftijd</p>
            <p className="mt-1 font-black text-white">{book.ageRating ?? "-"}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/25 p-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">Leestijd</p>
            <p className="mt-1 font-black text-white">{book.readTime ?? "-"}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {book.genres.map((genre) => (
            <span key={genre} className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-neutral-200">
              {genre}
            </span>
          ))}
        </div>

        {isPublished ? (
          <div className="rounded-2xl border border-emerald-500/25 bg-emerald-500/10 p-4 text-sm leading-6 text-emerald-100">
            <strong>Live in de Library = vergrendeld.</strong> Dit boek kan niet worden aangepast zolang het live staat. Wil je toch wijzigen, dan moet het boek eerst uit de Library worden gehaald. Zo voorkom je dat lezers midden in een veranderend verhaal zitten.
          </div>
        ) : (
          <div className="rounded-2xl border border-yellow-500/25 bg-yellow-500/10 p-4 text-sm leading-6 text-yellow-100">
            <strong>Concept / testfase.</strong> Dit boek mag je vrij aanpassen in de Studio. Pas bij publiceren wordt het vergrendeld.
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {canEdit ? (
            <Link
              href={`/editor?book=${book.id}`}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500"
            >
              Bewerk in Studio
            </Link>
          ) : (
            <button
              disabled
              className="cursor-not-allowed rounded-2xl bg-neutral-800 px-5 py-3 text-sm font-black text-neutral-500"
              title="Live boeken kun je niet aanpassen. Haal het boek eerst uit de Library."
            >
              Bewerken vergrendeld
            </button>
          )}

          {book.source === "dashboard" ? (
            <button
              disabled
              className="cursor-not-allowed rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-neutral-500"
              title="Boekpagina komt zodra dit boek echt gepubliceerd is."
            >
              Boekpagina later
            </button>
          ) : (
            <Link
              href={detailHref}
              className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white hover:bg-white/10"
            >
              Boekpagina
            </Link>
          )}

          {book.storyFile && readHref && (
            <Link
              href={readHref}
              className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white hover:bg-white/10"
            >
              Preview lezen
            </Link>
          )}

          {canEdit && isDashboardBook && (
            <button
              onClick={() => onPublish(book.id)}
              className="rounded-2xl border border-emerald-500/35 bg-emerald-500/15 px-5 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-500/25"
              title="Publiceer dit boek naar de Library en vergrendel het."
            >
              Publiceer naar Library
            </button>
          )}

          {canEdit && isDashboardBook && (
            <button
              onClick={() => onDeleteDraft(book.id)}
              className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-3 text-sm font-black text-red-100 hover:bg-red-500/20"
              title="Verwijder dit concept uit je dashboard."
            >
              Verwijder concept
            </button>
          )}

          {isPublished && isDashboardBook && (
            <button
              onClick={() => onRemoveFromLibrary(book.id)}
              className="rounded-2xl border border-red-500/35 bg-red-500/15 px-5 py-3 text-sm font-black text-red-100 hover:bg-red-500/25"
              title="Haal dit boek uit de Library. Daarna kun je het weer aanpassen als concept."
            >
              Verwijder uit Library
            </button>
          )}

          {isPublished && !isDashboardBook && (
            <button
              disabled
              className="cursor-not-allowed rounded-2xl border border-red-500/20 bg-red-500/10 px-5 py-3 text-sm font-black text-red-300/60"
              title="Dit live boek komt nu nog uit lib/books.ts. Later verwijderen we live boeken via het dashboard/admin systeem."
            >
              Verwijderen later
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function NewBookModal({
  form,
  setForm,
  onClose,
  onSave,
}: {
  form: NewBookForm;
  setForm: React.Dispatch<React.SetStateAction<NewBookForm>>;
  onClose: () => void;
  onSave: () => void;
}) {
  function updateField<K extends keyof NewBookForm>(key: K, value: NewBookForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addGenre(genre: string) {
    const cleanGenre = genre.trim();
    if (!cleanGenre) return;

    setForm((current) => {
      if (current.genres.includes(cleanGenre)) {
        return { ...current, genreInput: "" };
      }

      const nextGenres = [...current.genres, cleanGenre];
      return {
        ...current,
        genres: nextGenres,
        primaryGenre: current.primaryGenre || cleanGenre,
        genreInput: "",
      };
    });
  }

  function removeGenre(genre: string) {
    setForm((current) => {
      const nextGenres = current.genres.filter((item) => item !== genre);
      return {
        ...current,
        genres: nextGenres,
        primaryGenre: current.primaryGenre === genre ? nextGenres[0] ?? "" : current.primaryGenre,
      };
    });
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:p-6">
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-[#080b13] p-5 shadow-2xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.32em] text-blue-300">Nieuw boek</p>
            <h2 className="mt-2 text-3xl font-black sm:text-5xl">Boek opslaan in dashboard</h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-neutral-400">
              Dit maakt nu alvast een dashboard-concept aan. Later koppelen we deze flow aan echte accounts, database en editor-save.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-500"
          >
            Sluiten
          </button>
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Titel</label>
              <input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder="Bijv. The Sovereign"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Auteur</label>
              <input
                value={form.author}
                onChange={(event) => updateField("author", event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Korte ondertitel</label>
              <input
                value={form.subtitle}
                onChange={(event) => updateField("subtitle", event.target.value)}
                placeholder="Een zin die op de boekkaart komt."
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Beschrijving</label>
              <textarea
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Korte omschrijving voor de boekpagina."
                className="h-32 w-full resize-none rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold leading-6 text-white outline-none focus:border-blue-400"
              />
            </div>
          </div>

          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Genre labels</label>
              <div className="flex gap-2">
                <input
                  value={form.genreInput}
                  onChange={(event) => updateField("genreInput", event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addGenre(form.genreInput);
                    }
                  }}
                  placeholder="Bijv. Sci-fi"
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
                />
                <button
                  onClick={() => addGenre(form.genreInput)}
                  className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-500"
                >
                  Voeg toe
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {form.genres.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => removeGenre(genre)}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-white hover:bg-red-600"
                    title="Klik om te verwijderen"
                  >
                    {genre} ×
                  </button>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {suggestedGenres.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => addGenre(genre)}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-neutral-300 hover:bg-white/10"
                  >
                    + {genre}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Hoofdgenre</label>
              <select
                value={form.primaryGenre}
                onChange={(event) => updateField("primaryGenre", event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
              >
                {form.genres.length === 0 && <option value="">Voeg eerst genre labels toe</option>}
                {form.genres.map((genre) => (
                  <option key={genre} value={genre}>{genre}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-sm font-black text-neutral-300">Leeftijd</label>
                <select
                  value={form.ageRating}
                  onChange={(event) => updateField("ageRating", event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
                >
                  {ageRatings.map((rating) => (
                    <option key={rating} value={rating}>{rating}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-black text-neutral-300">Status</label>
                <select
                  value={form.status}
                  onChange={(event) => updateField("status", event.target.value as BookStatus)}
                  className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
                >
                  <option value="Concept">Concept</option>
                  <option value="Testversie">Testversie</option>
                  <option value="Binnenkort">Binnenkort</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Leestijd</label>
              <input
                value={form.readTime}
                onChange={(event) => updateField("readTime", event.target.value)}
                placeholder="Bijv. ± 30 min testversie"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Coverstijl</label>
              <select
                value={form.colorTheme}
                onChange={(event) => updateField("colorTheme", event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-blue-400"
              >
                {Object.entries(colorThemes).map(([value, theme]) => (
                  <option key={value} value={value}>{theme.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 text-sm leading-6 text-blue-100">
          Later wordt dit: <strong>Nieuw boek → metadata invullen → boek verschijnt in dashboard → openen in Studio → opslaan als concept → publiceren naar Library.</strong>
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white hover:bg-white/10"
          >
            Annuleren
          </button>
          <button
            onClick={onSave}
            className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-black hover:bg-neutral-200"
          >
            Opslaan in dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { permissions, loginWithCredentials, registerWithCredentials, logout, user, role } = useDemoAuth();
  const [authModalMode, setAuthModalMode] = useState<"login" | "register" | null>(null);
  const [draftDashboardBooks, setDraftDashboardBooks] = useState<DashboardBook[]>([]);
  const [newBookOpen, setNewBookOpen] = useState(false);
  const [form, setForm] = useState<NewBookForm>(defaultForm);

  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  async function refreshDashboardBooks() {
    if (!user) {
      setDraftDashboardBooks([]);
      return;
    }

    setDashboardLoading(true);
    setDashboardError(null);

    try {
      const supabaseBooks = await fetchDashboardBooksFromSupabase();
      setDraftDashboardBooks(supabaseBooks as DashboardBook[]);
    } catch (error) {
      console.error("Kon dashboard boeken niet laden uit Supabase", error);
      setDashboardError(
        error instanceof Error ? error.message : "Kon dashboard boeken niet laden uit Supabase.",
      );
    } finally {
      setDashboardLoading(false);
    }
  }

  useEffect(() => {
    void refreshDashboardBooks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const visibleDashboardBooks = useMemo<DashboardBook[]>(() => {
    return draftDashboardBooks.filter((book) => canAccessOwnedResource(user, book.ownerId));
  }, [draftDashboardBooks, user]);

  const allBooks = useMemo<DashboardBook[]>(() => {
    const staticBooks: DashboardBook[] = books.map((book) => ({ ...book, source: "library" }));
    return [...visibleDashboardBooks, ...staticBooks];
  }, [visibleDashboardBooks]);

  const liveBooks = allBooks.filter((book) => book.published);
  const draftBooks = allBooks.filter((book) => !book.published);

  async function saveNewBook() {
    if (!user) {
      setAuthModalMode("login");
      return;
    }

    const title = form.title.trim();
    if (!title) {
      alert("Geef je boek eerst een titel.");
      return;
    }

    if (form.genres.length === 0) {
      alert("Voeg minimaal één genre label toe.");
      return;
    }

    const theme = colorThemes[form.colorTheme] ?? colorThemes.blue;

    try {
      const savedBook = await saveDashboardBookToSupabase(user, {
        title,
        author: form.author.trim() || user.name || "Onbekende auteur",
        subtitle: form.subtitle.trim() || "Nieuw interactief boek in concept.",
        description: form.description.trim() || "Nog geen beschrijving ingevuld.",
        genres: form.genres,
        primaryGenre: form.primaryGenre || form.genres[0],
        status: form.status,
        ageRating: form.ageRating,
        readTime: form.readTime.trim() || "Concept",
        coverImage: theme.coverImage,
        bannerImage: theme.bannerImage,
        coverClass: theme.coverClass,
        accentClass: theme.accentClass,
        colorTheme: form.colorTheme,
        published: false,
        featured: false,
        mostRead: false,
        projectData: {
          version: 1,
          type: "dibooks-project",
          bookTitle: title,
          startNodeId: "node_1",
          nodes: [],
          edges: [],
          savedAt: new Date().toISOString(),
        },
      });

      setDraftDashboardBooks((currentBooks) => [
        savedBook as DashboardBook,
        ...currentBooks.filter((book) => book.id !== savedBook.id),
      ]);
      setForm(defaultForm);
      setNewBookOpen(false);
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? `Opslaan in Supabase mislukt: ${error.message}`
          : "Opslaan in Supabase mislukt.",
      );
    }
  }



  async function publishBookToLibrary(bookId: string) {
    const targetBook = draftDashboardBooks.find((book) => book.id === bookId);
    if (!targetBook) return;
    if (!canAccessOwnedResource(user, targetBook.ownerId)) {
      alert("Je kunt alleen je eigen dashboardboeken beheren.");
      return;
    }

    const confirmed = window.confirm(
      `Weet je zeker dat je "${targetBook.title}" naar de Library wilt publiceren?\n\nNa publicatie wordt dit boek vergrendeld. Je kunt het dan niet meer aanpassen zolang het live staat.`,
    );

    if (!confirmed) return;

    try {
      await publishDashboardBookInSupabase(bookId);
      await refreshDashboardBooks();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? `Publiceren mislukt: ${error.message}` : "Publiceren mislukt.");
    }
  }

  async function removeBookFromLibrary(bookId: string) {
    const targetBook = draftDashboardBooks.find((book) => book.id === bookId);
    if (!targetBook) return;

    if (!canAccessOwnedResource(user, targetBook.ownerId)) {
      alert("Je kunt alleen je eigen dashboardboeken beheren.");
      return;
    }

    const confirmed = window.confirm(
      `Weet je zeker dat je "${targetBook.title}" uit de Library wilt verwijderen?\n\nLezers kunnen dit boek daarna niet meer als live boek openen. Daarna wordt het weer een bewerkbaar concept.`,
    );

    if (!confirmed) return;

    try {
      await removeDashboardBookFromLibraryInSupabase(bookId);
      await refreshDashboardBooks();
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? `Verwijderen uit Library mislukt: ${error.message}` : "Verwijderen uit Library mislukt.");
    }
  }

  async function deleteDraftBook(bookId: string) {
    const targetBook = draftDashboardBooks.find((book) => book.id === bookId);
    if (!targetBook) return;

    if (!canAccessOwnedResource(user, targetBook.ownerId)) {
      alert("Je kunt alleen je eigen dashboardboeken beheren.");
      return;
    }

    if (targetBook.published) {
      alert("Een live boek kun je niet als concept verwijderen. Haal het eerst uit de Library.");
      return;
    }

    const confirmed = window.confirm(
      `Weet je zeker dat je concept "${targetBook.title}" wilt verwijderen uit je dashboard?`,
    );

    if (!confirmed) return;

    try {
      await deleteDashboardBookFromSupabase(bookId);
      setDraftDashboardBooks((currentBooks) => currentBooks.filter((book) => book.id !== bookId));
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? `Concept verwijderen mislukt: ${error.message}` : "Concept verwijderen mislukt.");
    }
  }


  if (!permissions.canUseDashboard) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070d] p-5 text-white">
        <div className="max-w-2xl rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.32em] text-blue-300">Auteur Dashboard</p>
          <h1 className="mt-4 text-4xl font-black sm:text-6xl">Login nodig</h1>
          <p className="mt-5 text-base font-semibold leading-7 text-neutral-300">
            Je kunt zonder account wel schrijven in de Auteur Studio en lokaal opslaan. Dashboard-opslag, boekbeheer en publiceren zijn alleen beschikbaar voor ingelogde auteurs. Boeken worden straks gekoppeld aan jouw account.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button
              onClick={() => setAuthModalMode("login")}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-black text-white hover:bg-blue-500"
            >
              Login als auteur
            </button>
            <button
              onClick={() => setAuthModalMode("register")}
              className="rounded-2xl border border-blue-400/35 bg-blue-500/10 px-5 py-3 text-sm font-black text-blue-100 hover:bg-blue-500/20"
            >
              Registreer als auteur
            </button>
            <Link
              href="/editor"
              className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white hover:bg-white/10"
            >
              Open Auteur Studio lokaal
            </Link>
            <Link
              href="/"
              className="rounded-2xl border border-white/15 px-5 py-3 text-sm font-black text-neutral-300 hover:bg-white/10 hover:text-white"
            >
              Terug naar Library
            </Link>
          </div>
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
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#05070d]/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8">
          <div>
            <DiBooksLogo />
            <p className="mt-1 text-xs font-black uppercase tracking-[0.32em] text-neutral-500">Auteur Dashboard</p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/" className="rounded-2xl border border-white/15 px-4 py-3 text-sm font-black text-white hover:bg-white/10">
              Library
            </Link>
            <Link href="/editor" className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-black text-white hover:bg-blue-500">
              Studio openen
            </Link>
            <button
              onClick={logout}
              className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-black text-red-100 hover:bg-red-500/20"
              title={user?.email ?? "Uitloggen"}
            >
              Uitloggen
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-stretch">
          <div className="rounded-3xl border border-white/10 bg-gradient-to-br from-blue-950/70 via-neutral-950 to-purple-950/55 p-6 shadow-2xl sm:p-8">
            <p className="text-sm font-black uppercase tracking-[0.32em] text-blue-300">Dashboard v3</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-black leading-tight sm:text-6xl">
              Beheer concepten en live boeken veilig.
            </h1>
            <p className="mt-5 max-w-3xl text-lg font-semibold leading-8 text-neutral-300">
              Nieuwe boeken start je als concept. Zodra je publiceert naar de Library wordt dat boek vergrendeld. Wil je later iets wijzigen, dan haal je het eerst uit de Library.
            </p>
          </div>

          <div className="grid gap-3 rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-2xl sm:p-6">
            <h2 className="text-xl font-black">Publicatie-regel</h2>
            <div className="rounded-2xl border border-yellow-500/25 bg-yellow-500/10 p-4 text-sm leading-6 text-yellow-100">
              <strong>Concepten mag je bewerken.</strong> Zodra een boek live is gepusht naar de Library, wordt die versie vergrendeld.
            </div>
            <div className="rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 text-sm leading-6 text-blue-100">
              Aanpassen kan pas nadat een boek <strong>uit de Library is verwijderd</strong>. Zo blijft een live verhaal stabiel voor lezers.
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Totaal boeken</p>
            <p className="mt-2 text-4xl font-black">{allBooks.length}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Live</p>
            <p className="mt-2 text-4xl font-black text-emerald-300">{liveBooks.length}</p>
          </div>
          <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5">
            <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Niet live</p>
            <p className="mt-2 text-4xl font-black text-yellow-300">{draftBooks.length}</p>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.32em] text-neutral-500">Mijn boeken</p>
            <h2 className="mt-2 text-3xl font-black sm:text-4xl">Auteurcollectie</h2>
          </div>
          <button
            onClick={() => setNewBookOpen(true)}
            className="rounded-2xl bg-white px-5 py-3 text-sm font-black text-black hover:bg-neutral-200"
          >
            + Nieuw boek
          </button>
        </div>

        {dashboardLoading && (
          <div className="mt-6 rounded-2xl border border-blue-500/25 bg-blue-500/10 p-4 text-sm font-bold text-blue-100">
            Dashboardboeken laden uit Supabase...
          </div>
        )}

        {dashboardError && (
          <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm font-bold text-red-100">
            Supabase fout: {dashboardError}
          </div>
        )}

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          {allBooks.map((book) => (
            <BookDashboardCard key={`${book.source}-${book.id}`} book={book} onPublish={publishBookToLibrary} onRemoveFromLibrary={removeBookFromLibrary} onDeleteDraft={deleteDraftBook} />
          ))}
        </div>
      </section>

      {newBookOpen && (
        <NewBookModal
          form={form}
          setForm={setForm}
          onClose={() => setNewBookOpen(false)}
          onSave={saveNewBook}
        />
      )}
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
