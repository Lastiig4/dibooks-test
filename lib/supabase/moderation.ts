"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DemoAuthUser } from "@/lib/auth";

export type ModerationStatus = "draft" | "pending" | "approved" | "rejected";
export type ModerationDecision = "approved" | "rejected";

export type ModerationFlag = {
  flagId: string;
  nodeId: string;
  category: string;
  severity: "low" | "medium" | "high" | string;
  reason: string;
  source: string;
  createdAt?: string;
};

export type ModerationQueueItem = {
  submissionId: string;
  bookId: string;
  ownerId: string;
  status: string;
  submittedAt?: string;
  reviewedAt?: string;
  reviewFeedback?: string;
  bookTitle: string;
  bookAuthor: string;
  ownerName: string;
  ownerEmail: string;
  coverImage: string;
  nodeCount: number;
  flagCount: number;
};

export type ModerationSubmissionDetail = ModerationQueueItem & {
  snapshot: any;
  flags: ModerationFlag[];
};

function formatSupabaseError(error: any) {
  if (!error) return "Onbekende Supabase fout.";
  return [error.message, error.details, error.hint, error.code ? `code: ${error.code}` : ""]
    .filter(Boolean)
    .join("\n");
}

function assertAdmin(user: DemoAuthUser | null | undefined) {
  if (!user || user.role !== "admin") {
    throw new Error("Alleen DiBooks admins hebben toegang tot boekmoderatie.");
  }
}

export async function submitBookForModeration(user: DemoAuthUser, bookId: string) {
  if (!user || !bookId) throw new Error("Boek of gebruiker ontbreekt.");
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("submit_book_for_moderation", {
    input_book_id: bookId,
  });
  if (error) throw new Error(formatSupabaseError(error));
  return String(data ?? "");
}

export async function fetchAdminModerationQueue(user: DemoAuthUser) {
  assertAdmin(user);
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_admin_moderation_queue");
  if (error) throw new Error(formatSupabaseError(error));

  return (data ?? []).map((row: any): ModerationQueueItem => ({
    submissionId: row.submission_id,
    bookId: row.book_id,
    ownerId: row.owner_id,
    status: row.status ?? "pending",
    submittedAt: row.submitted_at ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    reviewFeedback: row.review_feedback ?? undefined,
    bookTitle: row.book_title ?? "Ongetiteld boek",
    bookAuthor: row.book_author ?? "Auteur",
    ownerName: row.owner_name ?? "Auteur",
    ownerEmail: row.owner_email ?? "",
    coverImage: row.cover_image ?? "",
    nodeCount: Number(row.node_count ?? 0),
    flagCount: Number(row.flag_count ?? 0),
  }));
}

export async function fetchAdminModerationSubmission(user: DemoAuthUser, submissionId: string) {
  assertAdmin(user);
  if (!submissionId) return null;

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_admin_moderation_submission", {
    input_submission_id: submissionId,
  });
  if (error) throw new Error(formatSupabaseError(error));

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const rawFlags = Array.isArray(row.flags) ? row.flags : [];

  return {
    submissionId: row.submission_id,
    bookId: row.book_id,
    ownerId: row.owner_id,
    status: row.status ?? "pending",
    submittedAt: row.submitted_at ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    reviewFeedback: row.review_feedback ?? undefined,
    bookTitle: row.book_title ?? "Ongetiteld boek",
    bookAuthor: row.book_author ?? "Auteur",
    ownerName: row.owner_name ?? "Auteur",
    ownerEmail: row.owner_email ?? "",
    coverImage: row.cover_image ?? "",
    nodeCount: Number(row.node_count ?? 0),
    flagCount: Number(row.flag_count ?? rawFlags.length ?? 0),
    snapshot: row.snapshot ?? {},
    flags: rawFlags.map((flag: any): ModerationFlag => ({
      flagId: flag.flag_id ?? flag.id ?? "",
      nodeId: flag.node_id ?? "",
      category: flag.category ?? "Controle",
      severity: flag.severity ?? "medium",
      reason: flag.reason ?? "Deze node is gemarkeerd voor menselijke controle.",
      source: flag.source ?? "manual",
      createdAt: flag.created_at ?? undefined,
    })),
  } satisfies ModerationSubmissionDetail;
}

export async function reviewModerationSubmission(
  user: DemoAuthUser,
  submissionId: string,
  decision: ModerationDecision,
  feedback = "",
) {
  assertAdmin(user);
  const normalizedFeedback = feedback.trim();
  if (decision === "rejected" && !normalizedFeedback) {
    throw new Error("Feedback is verplicht wanneer je een boek afwijst.");
  }

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("review_moderation_submission", {
    input_submission_id: submissionId,
    input_decision: decision,
    input_feedback: normalizedFeedback,
  });
  if (error) throw new Error(formatSupabaseError(error));
  return !!data;
}
