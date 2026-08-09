"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { canReadPremiumBooks, type DemoAuthUser } from "@/lib/auth";

export type BookAccessType = "free" | "premium";

export type ReadingProgress = {
  bookId: string;
  currentNodeId: string;
  pageIndex: number;
  progressPercent: number;
  updatedAt?: string;
};

export type FavoriteBook = {
  id: string;
  title: string;
  author: string;
  subtitle: string;
  description: string;
  genres: string[];
  primaryGenre: string;
  status: string;
  ageRating: string;
  readTime: string;
  coverImage: string;
  bannerImage: string;
  coverClass: string;
  accentClass: string;
  accessType: BookAccessType;
  published: boolean;
  source: "dashboard";
  favoriteCreatedAt?: string;
  progressCurrentNodeId?: string;
  progressPageIndex?: number;
  progressPercent?: number;
};

export function normalizeAccessType(value: unknown): BookAccessType {
  return value === "premium" ? "premium" : "free";
}

export function getAccessLabel(accessType?: string) {
  return normalizeAccessType(accessType) === "premium" ? "Premium" : "Gratis";
}

export function canUserReadBookAccess(user: DemoAuthUser | null, accessType?: string) {
  if (!user) return false;
  if (normalizeAccessType(accessType) === "free") return true;
  return canReadPremiumBooks(user);
}

export function getReadBlockReason(user: DemoAuthUser | null, accessType?: string) {
  if (!user) return "Login gratis om te lezen";
  if (normalizeAccessType(accessType) === "premium" && !canReadPremiumBooks(user)) {
    return "Reader Plus nodig";
  }
  return null;
}

function mapFavoriteRow(row: any): FavoriteBook {
  return {
    id: row.id,
    title: row.title,
    author: row.author ?? row.owner_name ?? "Auteur",
    subtitle: row.subtitle ?? "Nieuw interactief boek.",
    description: row.description ?? "Nog geen beschrijving ingevuld.",
    genres: Array.isArray(row.genres) ? row.genres : ["Interactief"],
    primaryGenre: row.primary_genre ?? "Interactief",
    status: row.status ?? "Testversie",
    ageRating: row.age_rating ?? "12+",
    readTime: row.read_time ?? "Concept",
    coverImage: row.cover_image ?? "",
    bannerImage: row.banner_image ?? "",
    coverClass: row.cover_class ?? "from-blue-950 via-slate-950 to-purple-950",
    accentClass: row.accent_class ?? "border-blue-500/50",
    accessType: normalizeAccessType(row.access_type),
    published: !!row.published,
    source: "dashboard",
    favoriteCreatedAt: row.favorite_created_at ?? undefined,
    progressCurrentNodeId: row.progress_current_node_id ?? undefined,
    progressPageIndex: typeof row.progress_page_index === "number" ? row.progress_page_index : undefined,
    progressPercent: typeof row.progress_percent === "number" ? row.progress_percent : undefined,
  };
}

export async function isBookFavorite(user: DemoAuthUser | null, bookId: string) {
  if (!user || !bookId) return false;
  const supabase = createSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("book_favorites")
    .select("book_id")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .maybeSingle();

  if (error) throw error;
  return !!data;
}

export async function setBookFavorite(user: DemoAuthUser, bookId: string, favorite: boolean) {
  const supabase = createSupabaseBrowserClient();

  if (favorite) {
    const { error } = await supabase.from("book_favorites").upsert(
      {
        user_id: user.id,
        book_id: bookId,
      },
      { onConflict: "user_id,book_id" },
    );
    if (error) throw error;
    return true;
  }

  const { error } = await supabase
    .from("book_favorites")
    .delete()
    .eq("user_id", user.id)
    .eq("book_id", bookId);

  if (error) throw error;
  return false;
}

export async function fetchFavoriteBooks(user: DemoAuthUser | null) {
  if (!user) return [] as FavoriteBook[];
  const supabase = createSupabaseBrowserClient();

  const { data, error } = await supabase.rpc("get_favorite_books");
  if (error) throw error;

  return (data ?? []).map(mapFavoriteRow);
}

export async function getReadingProgress(user: DemoAuthUser | null, bookId: string) {
  if (!user || !bookId) return null;
  const supabase = createSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("reading_progress")
    .select("book_id,current_node_id,page_index,progress_percent,updated_at")
    .eq("user_id", user.id)
    .eq("book_id", bookId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    bookId: data.book_id,
    currentNodeId: data.current_node_id ?? "",
    pageIndex: data.page_index ?? 0,
    progressPercent: data.progress_percent ?? 0,
    updatedAt: data.updated_at ?? undefined,
  } satisfies ReadingProgress;
}

export async function upsertReadingProgress(
  user: DemoAuthUser,
  bookId: string,
  currentNodeId: string,
  pageIndex: number,
  progressPercent = 0,
) {
  if (!bookId || !currentNodeId) return;
  const supabase = createSupabaseBrowserClient();

  const { error } = await supabase.from("reading_progress").upsert(
    {
      user_id: user.id,
      book_id: bookId,
      current_node_id: currentNodeId,
      page_index: Math.max(0, Number(pageIndex) || 0),
      progress_percent: Math.max(0, Math.min(100, Math.round(Number(progressPercent) || 0))),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,book_id" },
  );

  if (error) throw error;
}

export async function fetchReadingProgressBooks(user: DemoAuthUser | null) {
  if (!user) return [] as FavoriteBook[];
  const supabase = createSupabaseBrowserClient();

  const { data, error } = await supabase.rpc("get_reading_progress_books");
  if (error) throw error;

  return (data ?? []).map(mapFavoriteRow);
}
