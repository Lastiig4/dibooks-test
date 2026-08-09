"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ensureSupabaseProfile, type DemoAuthUser } from "@/lib/auth";

export type DashboardBookStatus = "Concept" | "Testversie" | "Binnenkort";

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

export async function fetchDashboardBooksFromSupabase(user?: DemoAuthUser | null) {
  const supabase = createSupabaseBrowserClient();

  // Dashboard = "Mijn boeken". Ook admins zien hier alleen hun eigen boeken.
  // Een apart adminbeheer komt later, zodat oude/testboeken niet tussen eigen werk staan.
  let query = supabase
    .from("dashboard_books")
    .select("*")
    .order("updated_at", { ascending: false });

  if (user?.id) {
    query = query.eq("owner_id", user.id);
  }

  const { data, error } = await query;

  if (error) throw error;

  return (data ?? []).map(mapRowToDashboardBook);
}

export async function fetchDashboardBookFromSupabase(bookId: string) {
  const supabase = createSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("dashboard_books")
    .select("*")
    .eq("id", bookId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return mapRowToDashboardBook(data);
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

export async function fetchLibraryDashboardBooksFromSupabase() {
  const supabase = createSupabaseBrowserClient();

  // Belangrijk: publieke Library-boeken worden via een SECURITY DEFINER RPC geladen.
  // Daardoor zijn Binnenkort-boeken zichtbaar voor iedereen, ook zonder account,
  // terwijl conceptboeken privé blijven.
  const { data, error } = await supabase.rpc("get_public_library_books");

  if (error) throw error;

  return (data ?? []).map(mapRowToDashboardBook);
}

export async function fetchPublishedDashboardBooksFromSupabase() {
  const allBooks = await fetchLibraryDashboardBooksFromSupabase();
  return allBooks.filter((book: any) => !!book.published);
}

export async function fetchComingSoonDashboardBooksFromSupabase() {
  const allBooks = await fetchLibraryDashboardBooksFromSupabase();
  return allBooks.filter((book: any) => !book.published && book.status === "Binnenkort");
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
