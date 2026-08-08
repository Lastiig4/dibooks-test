import Link from "next/link";
import { notFound } from "next/navigation";
import { getBookById, getBookReadPath } from "@/lib/books";

type BookDetailPageProps = {
  params: Promise<{ bookId: string }> | { bookId: string };
};

export default async function BookDetailPage({ params }: BookDetailPageProps) {
  const resolvedParams = await params;
  const book = getBookById(resolvedParams.bookId);

  if (!book) notFound();

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(37,99,235,0.18),transparent_36%),radial-gradient(circle_at_top_right,rgba(168,85,247,0.12),transparent_35%),linear-gradient(180deg,#05070d_0%,#05070d_55%,#020308_100%)]" />

      <header className="border-b border-white/5 bg-[#05070d]/85 px-5 py-4 backdrop-blur-xl sm:px-8 lg:px-10">
        <div className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-end leading-none">
            <span className="text-4xl font-black tracking-tight text-white sm:text-5xl">DI</span>
            <span
              className="ml-1 text-4xl italic text-white sm:text-5xl"
              style={{ fontFamily: "Georgia, Times New Roman, serif" }}
            >
              Books
            </span>
          </Link>
          <div className="flex gap-3">
            <Link href="/" className="rounded-full border border-white/10 px-4 py-2 text-sm font-black text-neutral-300 hover:border-white/30 hover:text-white">
              Terug naar Library
            </Link>
            <Link href="/editor" className="hidden rounded-full border border-white/10 px-4 py-2 text-sm font-black text-neutral-300 hover:border-white/30 hover:text-white sm:block">
              Auteur Studio
            </Link>
          </div>
        </div>
      </header>

      <section className="grid gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[420px_1fr] lg:px-10 lg:py-14">
        <div className={`overflow-hidden rounded-[2rem] border ${book.accentClass} bg-neutral-950 shadow-2xl`}>
          <div className={`relative flex h-[520px] flex-col justify-between bg-gradient-to-br ${book.coverClass} p-7`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.22),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(59,130,246,0.22),transparent_32%)]" />
            <div className="relative flex items-start justify-between gap-3">
              <span className="rounded-full bg-black/45 px-3 py-1 text-xs font-black uppercase tracking-widest text-white/90">
                {book.primaryGenre}
              </span>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-black">
                {book.status}
              </span>
            </div>
            <div className="relative">
              <h1 className="text-5xl font-black leading-none text-white drop-shadow-lg">
                {book.title}
              </h1>
              <p className="mt-3 text-xs font-bold uppercase tracking-[0.25em] text-white/55">
                Interactive book
              </p>
            </div>
          </div>
        </div>

        <div className="flex max-w-4xl flex-col justify-center">
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
              <p className="mt-1 font-black">{book.status}</p>
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
            {book.published && book.storyFile ? (
              <Link href={getBookReadPath(book)} className="rounded-2xl bg-white px-8 py-4 text-lg font-black text-black hover:bg-neutral-200">
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
        </div>
      </section>
    </main>
  );
}
