"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ensureSupabaseProfile, type DemoAuthUser } from "@/lib/auth";

export type DashboardBookStatus = "Concept" | "Testversie" | "Binnenkort";

export type BookSeries = {
  id: string;
  ownerId: string;
  title: string;
  description: string;
  createdAt?: string;
  updatedAt?: string;
};

export type DashboardBookInput = {
  id?: string | null;
  title: string;
  author: string;
  subtitle: string;
  description: string;
  genres: string[];
  primaryGenre: string;
  status: DashboardBookStatus;
  ageRating: string;
  readTime: string;
  coverImage?: string;
  bannerImage?: string;
  coverClass?: string;
  accentClass?: string;
  colorTheme?: string;
  published?: boolean;
  featured?: boolean;
  mostRead?: boolean;
  publishedAt?: string | null;
  removedFromLibraryAt?: string | null;
  accessType?: "free" | "premium";
  seriesId?: string | null;
  seriesOrder?: number | null;
  projectData?: any;
};

function formatSupabaseError(error: any) {
  if (!error) return "Onbekende Supabase fout.";
  return [error.message, error.details, error.hint, error.code ? `code: ${error.code}` : ""]
    .filter(Boolean)
    .join("\n");
}

function throwSupabaseError(error: any): never {
  throw new Error(formatSupabaseError(error));
}

function slugify(value: string) {
  return (
    value
      .normalize("NFD")
      .toLowerCase()
      .trim()
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `boek-${Date.now()}`
  );
}

function mapRowToDashboardBook(row: any) {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    subtitle: row.subtitle,
    description: row.description,
    genres: Array.isArray(row.genres) ? row.genres : ["Interactief"],
    primaryGenre: row.primary_genre ?? row.primaryGenre ?? "Interactief",
    status: row.status ?? "Concept",
    ageRating: row.age_rating ?? "12+",
    readTime: row.read_time ?? "Concept",
    coverImage: row.cover_image ?? "",
    bannerImage: row.banner_image ?? "",
    coverClass: row.cover_class ?? "from-blue-950 via-slate-950 to-purple-950",
    accentClass: row.accent_class ?? "border-blue-500/60",
    colorTheme: row.color_theme ?? "blue",
    accessType: row.access_type ?? "free",
    published: !!row.published,
    featured: !!row.featured,
    mostRead: !!row.most_read,
    storyFile: row.story_file ?? undefined,
    source: "dashboard" as const,
    ownerId: row.owner_id,
    ownerName: row.owner_name ?? "Auteur",
    ownerEmail: row.owner_email ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at ?? undefined,
    removedFromLibraryAt: row.removed_from_library_at ?? undefined,
    seriesId: row.series_id ?? null,
    seriesOrder: row.series_order ?? null,
    projectData: row.project_data ?? undefined,
    projectVersion: row.project_version ?? undefined,
    projectUpdatedAt: row.project_updated_at ?? undefined,
  };
}

async function getUniqueSlug(ownerId: string, title: string, existingBookId?: string | null) {
  const supabase = createSupabaseBrowserClient();
  const baseSlug = slugify(title);

  const { data, error } = await supabase
    .from("books")
    .select("id, slug")
    .eq("owner_id", ownerId);

  if (error) throw error;

  const usedSlugs = new Set(
    (data ?? [])
      .filter((book: any) => !existingBookId || book.id !== existingBookId)
      .map((book: any) => book.slug),
  );

  let nextSlug = baseSlug;
  let counter = 2;

  while (usedSlugs.has(nextSlug)) {
    nextSlug = `${baseSlug}-${counter}`;
    counter += 1;
  }

  return nextSlug;
}

export async function fetchDashboardBooksFromSupabase(user?: DemoAuthUser) {
  const supabase = createSupabaseBrowserClient();

  // We lezen rechtstreeks uit books + book_projects. Daardoor zijn nieuwe
  // metadata-kolommen (zoals series_id) meteen beschikbaar zonder dat een
  // bestaande dashboard_books-view opnieuw gemaakt hoeft te worden.
  let booksQuery = supabase
    .from("books")
    .select("*")
    .order("updated_at", { ascending: false });

  if (user?.id) {
    booksQuery = booksQuery.eq("owner_id", user.id);
  }

  const { data: books, error: booksError } = await booksQuery;

  if (booksError) throw booksError;

  const bookIds = (books ?? []).map((book: any) => book.id).filter(Boolean);
  let projectByBookId = new Map<string, any>();

  if (bookIds.length > 0) {
    const { data: projects, error: projectsError } = await supabase
      .from("book_projects")
      .select("book_id, project_data, version")
      .in("book_id", bookIds);

    if (projectsError) throw projectsError;
    projectByBookId = new Map((projects ?? []).map((project: any) => [project.book_id, project]));
  }

  return (books ?? []).map((book: any) => {
    const project = projectByBookId.get(book.id);
    return mapRowToDashboardBook({
      ...book,
      project_data: project?.project_data,
      project_version: project?.version,
    });
  });
}

export async function fetchDashboardBookFromSupabase(bookId: string) {
  const supabase = createSupabaseBrowserClient();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("*")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) throw bookError;
  if (!book) return null;

  const { data: project, error: projectError } = await supabase
    .from("book_projects")
    .select("book_id, project_data, version")
    .eq("book_id", bookId)
    .maybeSingle();

  if (projectError) throw projectError;

  return mapRowToDashboardBook({
    ...book,
    project_data: project?.project_data,
    project_version: project?.version,
  });
}

export async function fetchBookSeriesFromSupabase(user: DemoAuthUser) {
  const supabase = createSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("book_series")
    .select("*")
    .eq("owner_id", user.id)
    .order("title", { ascending: true });

  if (error) throw error;

  return (data ?? []).map((row: any): BookSeries => ({
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    description: row.description ?? "",
    createdAt: row.created_at ?? undefined,
    updatedAt: row.updated_at ?? undefined,
  }));
}

export async function createBookSeriesInSupabase(
  user: DemoAuthUser,
  input: { title: string; description?: string },
) {
  const profileResult = await ensureSupabaseProfile(user);
  if (!profileResult.ok) {
    throw new Error(profileResult.message || "DiBooks profile kon niet worden aangemaakt.");
  }

  const title = input.title.trim();
  if (!title) throw new Error("Geef de serie eerst een naam.");

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("book_series")
    .insert({
      owner_id: user.id,
      title,
      description: input.description?.trim() ?? "",
    })
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Je hebt al een serie met deze naam.");
    }
    throwSupabaseError(error);
  }

  return {
    id: data.id,
    ownerId: data.owner_id,
    title: data.title,
    description: data.description ?? "",
    createdAt: data.created_at ?? undefined,
    updatedAt: data.updated_at ?? undefined,
  } satisfies BookSeries;
}

export async function updateBookSeriesInSupabase(
  user: DemoAuthUser,
  seriesId: string,
  input: { title: string; description?: string },
) {
  const title = input.title.trim();
  if (!title) throw new Error("Geef de serie eerst een naam.");

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("book_series")
    .update({
      title,
      description: input.description?.trim() ?? "",
      updated_at: new Date().toISOString(),
    })
    .eq("id", seriesId)
    .eq("owner_id", user.id)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505") {
      throw new Error("Je hebt al een serie met deze naam.");
    }
    throwSupabaseError(error);
  }

  return {
    id: data.id,
    ownerId: data.owner_id,
    title: data.title,
    description: data.description ?? "",
    createdAt: data.created_at ?? undefined,
    updatedAt: data.updated_at ?? undefined,
  } satisfies BookSeries;
}

export async function deleteBookSeriesFromSupabase(user: DemoAuthUser, seriesId: string) {
  const supabase = createSupabaseBrowserClient();

  // Eerst de boekvolgorde opruimen. De FK zet series_id ook op NULL,
  // maar zo blijft er geen los series_order-getal achter.
  const { error: unlinkError } = await supabase
    .from("books")
    .update({ series_id: null, series_order: null })
    .eq("owner_id", user.id)
    .eq("series_id", seriesId);

  if (unlinkError) throwSupabaseError(unlinkError);

  const { error } = await supabase
    .from("book_series")
    .delete()
    .eq("id", seriesId)
    .eq("owner_id", user.id);

  if (error) throwSupabaseError(error);
}

export async function saveDashboardBookToSupabase(user: DemoAuthUser, input: DashboardBookInput) {
  const profileResult = await ensureSupabaseProfile(user);
  if (!profileResult.ok) {
    throw new Error(profileResult.message || "DiBooks profile kon niet worden aangemaakt.");
  }

  const supabase = createSupabaseBrowserClient();
  const existingBookId = input.id || null;
  const slug = existingBookId ? undefined : await getUniqueSlug(user.id, input.title, existingBookId);

  const bookPayload: Record<string, any> = {
    owner_id: user.id,
    title: input.title,
    author: input.author || user.name || "Onbekende auteur",
    subtitle: input.subtitle || "Nieuw interactief boek in concept.",
    description: input.description || "Nog geen beschrijving ingevuld.",
    genres: input.genres?.length ? input.genres : ["Interactief"],
    primary_genre: input.primaryGenre || input.genres?.[0] || "Interactief",
    status: input.status || "Concept",
    age_rating: input.ageRating || "12+",
    read_time: input.readTime || "Concept",
    cover_image: input.coverImage || "",
    banner_image: input.bannerImage || "",
    cover_class: input.coverClass || "from-blue-950 via-slate-950 to-purple-950",
    accent_class: input.accentClass || "border-blue-500/60",
    color_theme: input.colorTheme || "blue",
    published: !!input.published,
    featured: !!input.featured,
    most_read: !!input.mostRead,
    published_at: input.publishedAt ?? null,
    removed_from_library_at: input.removedFromLibraryAt ?? null,
    access_type: input.accessType || "free",
    series_id: input.seriesId || null,
    series_order: input.seriesId ? Math.max(1, Number(input.seriesOrder) || 1) : null,
  };

  if (slug) bookPayload.slug = slug;

  const bookQuery = existingBookId
    ? supabase.from("books").update(bookPayload).eq("id", existingBookId).select("*").single()
    : supabase.from("books").insert(bookPayload).select("*").single();

  const { data: savedBook, error: bookError } = await bookQuery;
  if (bookError) throw bookError;

  if (input.projectData) {
    const { error: projectError } = await supabase.from("book_projects").upsert(
      {
        book_id: savedBook.id,
        owner_id: user.id,
        project_data: input.projectData,
        version: input.projectData?.version ?? 1,
      },
      { onConflict: "book_id" },
    );

    if (projectError) throw projectError;
  }

  const freshBook = await fetchDashboardBookFromSupabase(savedBook.id);
  return freshBook ?? mapRowToDashboardBook(savedBook);
}

export type DashboardBookMediaInput = {
  coverImage?: string;
  bannerImage?: string;
  coverClass?: string;
  accentClass?: string;
  colorTheme?: string;
};

export async function updateDashboardBookMediaInSupabase(
  user: DemoAuthUser,
  bookId: string,
  media: DashboardBookMediaInput,
) {
  const profileResult = await ensureSupabaseProfile(user);
  if (!profileResult.ok) {
    throw new Error(profileResult.message || "DiBooks profile kon niet worden aangemaakt.");
  }

  const supabase = createSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("books")
    .update({
      cover_image: media.coverImage ?? "",
      banner_image: media.bannerImage ?? "",
      cover_class: media.coverClass || "from-blue-950 via-slate-950 to-purple-950",
      accent_class: media.accentClass || "border-blue-500/60",
      color_theme: media.colorTheme || "blue",
    })
    .eq("id", bookId)
    .eq("owner_id", user.id)
    .select("*")
    .single();

  if (error) throw error;

  const freshBook = await fetchDashboardBookFromSupabase(bookId);
  return freshBook ?? mapRowToDashboardBook(data);
}

export async function fetchPublishedDashboardBooksFromSupabase() {
  const supabase = createSupabaseBrowserClient();

  // Publieke Library gebruikt bewust de books-tabel, niet de dashboard_books-view.
  // De view joinet project_data en die hoeft voor cards/shelves niet publiek mee.
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("published", true)
    .order("published_at", { ascending: false, nullsFirst: false });

  if (error) throw error;

  return (data ?? []).map(mapRowToDashboardBook);
}

export async function fetchComingSoonDashboardBooksFromSupabase() {
  const supabase = createSupabaseBrowserClient();

  // Binnenkort-boeken moeten zichtbaar zijn voor iedereen, maar niet leesbaar.
  // Daarom halen we alleen publieke boekmetadata uit books op.
  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("published", false)
    .eq("status", "Binnenkort")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map(mapRowToDashboardBook);
}

export async function fetchLibraryDashboardBooksFromSupabase() {
  const supabase = createSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("books")
    .select("*")
    .or("published.eq.true,status.eq.Binnenkort")
    .order("updated_at", { ascending: false });

  if (error) throw error;

  return (data ?? []).map(mapRowToDashboardBook);
}

export async function publishDashboardBookInSupabase(bookId: string) {
  const supabase = createSupabaseBrowserClient();

  const { error } = await supabase
    .from("books")
    .update({
      published: true,
      status: "Testversie",
      published_at: new Date().toISOString(),
      removed_from_library_at: null,
    })
    .eq("id", bookId);

  if (error) throw error;
}

export async function removeDashboardBookFromLibraryInSupabase(bookId: string) {
  const supabase = createSupabaseBrowserClient();

  const { error } = await supabase
    .from("books")
    .update({
      published: false,
      status: "Concept",
      removed_from_library_at: new Date().toISOString(),
    })
    .eq("id", bookId);

  if (error) throw error;
}

export async function deleteDashboardBookFromSupabase(bookId: string) {
  const supabase = createSupabaseBrowserClient();

  const { error } = await supabase.from("books").delete().eq("id", bookId);
  if (error) throw error;
}


export async function updateDashboardBookProjectInSupabase(
  user: DemoAuthUser,
  bookId: string,
  projectData: any,
) {
  const profileResult = await ensureSupabaseProfile(user);
  if (!profileResult.ok) {
    throw new Error(profileResult.message || "DiBooks profile kon niet worden aangemaakt.");
  }

  const supabase = createSupabaseBrowserClient();

  const { data: book, error: bookError } = await supabase
    .from("books")
    .select("id, owner_id, published")
    .eq("id", bookId)
    .maybeSingle();

  if (bookError) throwSupabaseError(bookError);
  if (!book) throw new Error("Dashboardboek niet gevonden of geen toegang.");
  if (book.published) {
    throw new Error("Dit boek staat live. Haal het eerst uit de Library voordat je het concept overschrijft.");
  }

  const projectPayload = {
    book_id: book.id,
    owner_id: book.owner_id || user.id,
    project_data: projectData,
    version: projectData?.version ?? 1,
  };

  const { error: projectError } = await supabase
    .from("book_projects")
    .upsert(projectPayload, { onConflict: "book_id" });

  if (projectError) throwSupabaseError(projectError);

  const { error: updateError } = await supabase
    .from("books")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", book.id);

  if (updateError) throwSupabaseError(updateError);

  return true;
}
