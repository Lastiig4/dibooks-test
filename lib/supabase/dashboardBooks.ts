"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DemoAuthUser } from "@/lib/auth";

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
  projectData?: any;
};

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

export async function fetchDashboardBooksFromSupabase() {
  const supabase = createSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("dashboard_books")
    .select("*")
    .order("updated_at", { ascending: false });

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
