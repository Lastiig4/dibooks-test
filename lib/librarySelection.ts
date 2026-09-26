import type { DiBook } from "@/lib/books";

export type LibraryBook = DiBook & {
  source?: "library" | "dashboard";
  publishedAt?: string;
  createdAt?: string;
  updatedAt?: string;
  accessType?: "free" | "premium";
  readerCount?: number;
  readCount?: number;
};

export function isLibraryTutorial(book: LibraryBook) {
  return [book.primaryGenre, ...(book.genres ?? [])].some(
    (genre) => genre?.trim().toLowerCase() === "tutorial",
  );
}

export function libraryReaderCount(book: LibraryBook, counts: Record<string, number>) {
  // A known zero is authoritative. Views/favourites are not reader counts.
  const count = counts[book.id] ?? book.readerCount ?? book.readCount ?? 0;
  return Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
}

function publicationTime(book: LibraryBook) {
  for (const value of [book.publishedAt, book.createdAt]) {
    const time = Date.parse(value ?? "");
    if (Number.isFinite(time)) return time;
  }
  return 0;
}

export function selectLibraryHighlights(books: LibraryBook[], counts: Record<string, number>) {
  const unique = [...new Map(books.map((book) => [book.id, book])).values()]
    .filter((book) => !isLibraryTutorial(book));
  const latest = unique.filter((book) => book.published).sort(
    (a, b) => publicationTime(b) - publicationTime(a) || a.id.localeCompare(b.id),
  );
  const popular = latest.filter((book) => libraryReaderCount(book, counts) > 0).sort(
    (a, b) => libraryReaderCount(b, counts) - libraryReaderCount(a, counts) ||
      publicationTime(b) - publicationTime(a) || a.id.localeCompare(b.id),
  );
  const upcoming = unique.filter((book) => !book.published && book.status === "Binnenkort");
  return { latest, popular, upcoming };
}
