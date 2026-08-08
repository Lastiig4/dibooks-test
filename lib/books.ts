export type BookStatus = "Testversie" | "Concept" | "Binnenkort";

export type DiBook = {
  id: string;
  title: string;
  author: string;
  subtitle: string;
  description: string;
  genres: string[];
  primaryGenre: string;
  status: BookStatus;
  ageRating?: string;
  readTime?: string;
  storyFile?: string;
  coverClass: string;
  accentClass: string;
  featured?: boolean;
  mostRead?: boolean;
  published?: boolean;
};

export const books: DiBook[] = [
  {
    id: "the-sovereign",
    title: "The Sovereign",
    author: "Giovanni",
    subtitle:
      "Een interactief sci-fi verhaal over macht, waarheid en overleven aan boord van een generatie-schip.",
    description:
      "Al tachtig jaar leeft de mensheid aan boord van The Sovereign, een gigantisch kolonieschip boven een verloren aarde. Sarah Logan groeit op tussen de elite, maar haar Aura-Keuring trekt haar langzaam een wereld in van verborgen logboeken, lagere ringen, verboden keuzes en gevaarlijke waarheden.",
    genres: ["Sci-fi", "Interactief", "Dystopie"],
    primaryGenre: "Sci-fi",
    status: "Testversie",
    ageRating: "12+",
    readTime: "± 30 min testversie",
    // Voor nu gebruiken we je bestaande bestand in public/The Sovereign.json.
    // Later kunnen we dit verplaatsen naar /books/the-sovereign/story.json.
    storyFile: "/The%20Sovereign.json",
    coverClass: "from-blue-950 via-slate-950 to-purple-950",
    accentClass: "border-blue-500/60",
    featured: true,
    mostRead: true,
    published: true,
  },
  {
    id: "echoes-of-lumina",
    title: "Echoes of Lumina",
    author: "DiBooks Studio",
    subtitle: "Een mysterie tussen de bovenste ringen van The Sovereign.",
    description:
      "Een conceptboek voor de library-test. Later kan dit vervangen worden door een echt interactief verhaal.",
    genres: ["Mystery", "Sci-fi"],
    primaryGenre: "Mystery",
    status: "Binnenkort",
    ageRating: "12+",
    readTime: "Binnenkort",
    coverClass: "from-cyan-950 via-neutral-950 to-emerald-950",
    accentClass: "border-cyan-400/40",
    mostRead: true,
    published: false,
  },
  {
    id: "the-dust-protocol",
    title: "The Dust Protocol",
    author: "DiBooks Studio",
    subtitle: "Keuzes, sabotage en overleven in de onderste ringen.",
    description:
      "Een placeholder voor toekomstige boeken. Zo kun je de library alvast testen met meerdere titels.",
    genres: ["Thriller", "Sci-fi"],
    primaryGenre: "Thriller",
    status: "Binnenkort",
    ageRating: "16+",
    readTime: "Binnenkort",
    coverClass: "from-orange-950 via-stone-950 to-red-950",
    accentClass: "border-orange-400/40",
    mostRead: true,
    published: false,
  },
  {
    id: "briars-logs",
    title: "Briar's Logs",
    author: "DiBooks Studio",
    subtitle: "Verborgen logboeken die de officiële geschiedenis tegenspreken.",
    description:
      "Een dossier-achtig conceptboek dat later als extra verhaal of companion-book kan dienen.",
    genres: ["Dossier", "Mystery"],
    primaryGenre: "Dossier",
    status: "Concept",
    ageRating: "12+",
    readTime: "Concept",
    coverClass: "from-yellow-950 via-neutral-950 to-stone-900",
    accentClass: "border-yellow-400/40",
    mostRead: true,
    published: false,
  },
  {
    id: "orbit-zero",
    title: "Orbit Zero",
    author: "DiBooks Studio",
    subtitle: "Een verloren schip reageert na jaren stilte.",
    description: "Conceptboek voor de categorie Sci-fi & ruimte.",
    genres: ["Sci-fi", "Ruimte"],
    primaryGenre: "Sci-fi",
    status: "Concept",
    ageRating: "12+",
    readTime: "Concept",
    coverClass: "from-indigo-950 via-black to-sky-950",
    accentClass: "border-indigo-400/40",
    published: false,
  },
  {
    id: "last-signal",
    title: "Last Signal",
    author: "DiBooks Studio",
    subtitle: "Elke keuze brengt het noodsignaal dichterbij.",
    description: "Conceptboek voor de categorie Sci-fi & ruimte.",
    genres: ["Sci-fi", "Interactief"],
    primaryGenre: "Sci-fi",
    status: "Concept",
    ageRating: "12+",
    readTime: "Concept",
    coverClass: "from-slate-950 via-blue-950 to-black",
    accentClass: "border-sky-400/40",
    published: false,
  },
  {
    id: "room-17",
    title: "Room 17",
    author: "DiBooks Studio",
    subtitle: "Een kamer die alleen bestaat als niemand kijkt.",
    description: "Conceptboek voor de categorie Mystery & keuzes.",
    genres: ["Mystery", "Keuzeverhaal"],
    primaryGenre: "Mystery",
    status: "Concept",
    ageRating: "12+",
    readTime: "Concept",
    coverClass: "from-zinc-950 via-neutral-900 to-teal-950",
    accentClass: "border-teal-400/40",
    published: false,
  },
  {
    id: "the-silent-vote",
    title: "The Silent Vote",
    author: "DiBooks Studio",
    subtitle: "Drie keuzes. Eén verrader. Geen weg terug.",
    description: "Conceptboek voor de categorie Mystery & keuzes.",
    genres: ["Keuzeverhaal", "Thriller"],
    primaryGenre: "Keuzeverhaal",
    status: "Concept",
    ageRating: "12+",
    readTime: "Concept",
    coverClass: "from-amber-950 via-neutral-950 to-red-950",
    accentClass: "border-amber-400/40",
    published: false,
  },
  {
    id: "crown-of-ash",
    title: "Crown of Ash",
    author: "DiBooks Studio",
    subtitle: "Een kroon die alleen door keuzes kan branden.",
    description: "Conceptboek voor de categorie Fantasy & avontuur.",
    genres: ["Fantasy", "Avontuur"],
    primaryGenre: "Fantasy",
    status: "Concept",
    ageRating: "12+",
    readTime: "Concept",
    coverClass: "from-red-950 via-stone-950 to-yellow-950",
    accentClass: "border-red-400/40",
    published: false,
  },
  {
    id: "lion-of-murcia",
    title: "Lion of Murcia",
    author: "DiBooks Studio",
    subtitle: "Een vergeten koninkrijk vecht om zijn naam.",
    description: "Conceptboek voor de categorie Fantasy & avontuur.",
    genres: ["Medieval", "Fantasy"],
    primaryGenre: "Medieval",
    status: "Concept",
    ageRating: "12+",
    readTime: "Concept",
    coverClass: "from-yellow-900 via-orange-950 to-stone-950",
    accentClass: "border-yellow-500/40",
    published: false,
  },
];

export function getBookById(bookId: string) {
  return books.find((book) => book.id === bookId);
}

export function getBookDetailPath(book: DiBook) {
  return `/books/${book.id}`;
}

export function getBookReadPath(book: DiBook) {
  return `/books/${book.id}/read`;
}

export function getMostReadBooks() {
  return books.filter((book) => book.mostRead);
}

export function getFeaturedBook() {
  return books.find((book) => book.featured) ?? books[0];
}

export function getGenreRows() {
  const preferredGenres = ["Sci-fi", "Mystery", "Fantasy", "Thriller", "Keuzeverhaal"];

  return preferredGenres
    .map((genre) => ({
      genre,
      books: books.filter((book) => book.genres.includes(genre)),
    }))
    .filter((row) => row.books.length > 0);
}
