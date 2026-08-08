import Link from "next/link";
import {
  books,
  getBookDetailPath,
  getBookReadPath,
  getFeaturedBook,
  getGenreRows,
  getMostReadBooks,
  type DiBook,
} from "@/lib/books";

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

function BookCover({ book, large = false }: { book: DiBook; large?: boolean }) {
  return (
    <div
      className={`relative flex ${large ? "h-56" : "h-40"} flex-col justify-between overflow-hidden rounded-t-2xl bg-gradient-to-br ${book.coverClass} p-5`}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.2),transparent_32%)]" />
      <div className="relative flex items-start justify-between gap-3">
        <span className="rounded-full bg-black/45 px-3 py-1 text-xs font-black uppercase tracking-widest text-white/90">
          {book.primaryGenre}
        </span>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">
          {book.status}
        </span>
      </div>
      <div className="relative">
        <h3 className={`${large ? "text-5xl" : "text-3xl"} font-black leading-none text-white drop-shadow-lg`}>
          {book.title}
        </h3>
        <p className="mt-2 text-xs font-bold uppercase tracking-[0.25em] text-white/55">
          Interactive book
        </p>
      </div>
    </div>
  );
}

function BookCard({ book, large = false }: { book: DiBook; large?: boolean }) {
  const href = getBookDetailPath(book);

  return (
    <Link
      href={href}
      className={`group relative shrink-0 overflow-hidden rounded-2xl border ${book.accentClass} bg-neutral-900 shadow-2xl transition hover:-translate-y-1 hover:scale-[1.01] hover:border-white/60 ${
        large ? "w-[330px] sm:w-[400px]" : "w-[250px] sm:w-[290px]"
      }`}
    >
      <BookCover book={book} large={large} />
      <div className="min-h-[142px] bg-neutral-950 p-5">
        <p className="line-clamp-3 text-sm font-semibold leading-6 text-neutral-300">
          {book.subtitle}
        </p>
        <div className="mt-4 flex items-center justify-between gap-3">
          <span className="text-xs font-black uppercase tracking-widest text-neutral-500">
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

function BookRow({ title, rowBooks }: { title: string; rowBooks: DiBook[] }) {
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
          <BookCard key={`${title}-${book.id}`} book={book} />
        ))}
      </div>
    </section>
  );
}

export default function LibraryPage() {
  const featuredBook = getFeaturedBook();
  const mostReadBooks = getMostReadBooks();
  const genreRows = getGenreRows();

  return (
    <main className="min-h-screen overflow-hidden bg-[#05070d] text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_36%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_35%),linear-gradient(180deg,#05070d_0%,#05070d_45%,#020308_100%)]" />

      <header className="sticky top-0 z-30 border-b border-white/5 bg-[#05070d]/85 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10">
        <div className="flex items-center justify-between gap-4">
          <DiBooksLogo />
          <nav className="flex items-center gap-3">
            <Link
              href="/editor"
              className="hidden rounded-full border border-white/10 px-4 py-2 text-sm font-black text-neutral-300 hover:border-white/30 hover:text-white sm:block"
            >
              Auteur Studio
            </Link>
            <button className="rounded-full border border-white/15 px-4 py-2 text-sm font-black text-white hover:bg-white/10">
              Login
            </button>
            <button className="rounded-full bg-blue-600 px-4 py-2 text-sm font-black text-white hover:bg-blue-500">
              Registreer
            </button>
          </nav>
        </div>
      </header>

      <section className="px-5 pt-10 sm:px-8 sm:pt-14 lg:px-10">
        <div className="relative overflow-hidden rounded-[2rem] border border-white/10 bg-neutral-950 shadow-2xl">
          <div className={`absolute inset-0 bg-gradient-to-br ${featuredBook.coverClass}`} />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.22),transparent_28%),linear-gradient(90deg,rgba(0,0,0,0.92),rgba(0,0,0,0.58),rgba(0,0,0,0.18))]" />
          <div className="relative grid min-h-[430px] items-end gap-8 p-6 sm:p-10 lg:grid-cols-[1fr_420px] lg:p-12">
            <div className="max-w-3xl">
              <div className="mb-5 flex flex-wrap gap-2">
                {featuredBook.genres.map((genre) => (
                  <span key={genre} className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-white/80">
                    {genre}
                  </span>
                ))}
              </div>
              <h1 className="text-5xl font-black leading-none sm:text-7xl lg:text-8xl">
                {featuredBook.title}
              </h1>
              <p className="mt-5 max-w-2xl text-base font-semibold leading-7 text-neutral-200 sm:text-lg">
                {featuredBook.subtitle}
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                {featuredBook.published && featuredBook.storyFile ? (
                  <Link
                    href={getBookReadPath(featuredBook)}
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
                  href={getBookDetailPath(featuredBook)}
                  className="rounded-2xl border border-white/15 bg-black/30 px-7 py-4 text-lg font-black text-white hover:bg-white/10"
                >
                  Meer informatie
                </Link>
              </div>
            </div>

            <Link href={getBookDetailPath(featuredBook)} className="hidden lg:block">
              <div className={`rounded-3xl border ${featuredBook.accentClass} bg-black/30 p-4 shadow-2xl backdrop-blur-md transition hover:-translate-y-1`}>
                <BookCover book={featuredBook} large />
                <div className="rounded-b-2xl bg-neutral-950 p-5">
                  <p className="text-sm font-bold leading-6 text-neutral-300">{featuredBook.description}</p>
                </div>
              </div>
            </Link>
          </div>
        </div>
      </section>

      <BookRow title="Meest gelezen boeken" rowBooks={mostReadBooks} />

      {genreRows.map((row) => (
        <BookRow key={row.genre} title={row.genre} rowBooks={row.books} />
      ))}

      <section className="mx-5 mb-12 mt-12 rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:mx-8 lg:mx-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-black uppercase tracking-widest text-blue-300">Auteur?</p>
            <h2 className="mt-2 text-2xl font-black">Open de DiBooks Auteur Studio</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
              Bouw interactieve hoofdstukken met tekst, keuzes, cutscenes en minigames. Later koppelen we dit aan echte accounts.
            </p>
          </div>
          <Link href="/editor" className="rounded-2xl bg-blue-600 px-6 py-4 text-center font-black text-white hover:bg-blue-500">
            Naar Auteur Studio
          </Link>
        </div>
      </section>

      <footer className="border-t border-white/5 px-5 py-8 text-sm font-bold text-neutral-500 sm:px-8 lg:px-10">
        DiBooks Library • {books.length} testboeken in catalogus
      </footer>
    </main>
  );
}
