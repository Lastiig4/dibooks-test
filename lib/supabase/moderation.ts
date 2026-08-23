"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DemoAuthUser } from "@/lib/auth";

export type ModerationStatus = "draft" | "pending" | "approved" | "rejected";
export type ModerationDecision = "approved" | "rejected";

export type ModerationFlag = {
  flagId: string;
  submissionId?: string;
  nodeId: string;
  category: string;
  severity: "low" | "medium" | "high" | string;
  reason: string;
  source: string;
  resolution?: "pending" | "cleared" | string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNote?: string;
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
  reviewerName?: string;
  reviewerEmail?: string;
  aiScanStatus?: "not_started" | "running" | "completed" | "failed" | string;
  aiScanProvider?: string;
  aiScanModel?: string;
  aiScanStartedAt?: string;
  aiScannedAt?: string;
  aiScanError?: string;
  aiScannedNodeCount?: number;
  aiReusedNodeCount?: number;
  aiChangedNodeCount?: number;
  aiTotalNodeCount?: number;
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

export async function verifyCurrentUserIsAdmin(
  user: DemoAuthUser | null | undefined,
) {
  if (!user) return false;

  const supabase = createSupabaseBrowserClient();

  // Authoritative check: browser/user cache kan vlak na login nog tijdelijk
  // "author" bevatten terwijl profiles.role in Supabase al "admin" is.
  const { data, error } = await supabase.rpc("is_current_dibooks_admin");

  if (!error) return data === true;

  // Fallback voor oudere Supabase schemas / tijdelijke PostgREST cache.
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    console.warn("Kon adminrol niet autoritatief controleren.", {
      rpcError: error,
      profileError,
    });
    return user.role === "admin";
  }

  return profile?.role === "admin";
}

async function ensureAdminAccess(
  user: DemoAuthUser | null | undefined,
) {
  if (!(await verifyCurrentUserIsAdmin(user))) {
    throw new Error("Alleen DiBooks admins hebben toegang tot boekmoderatie.");
  }
}

export async function triggerAutomaticModerationScan(
  user: DemoAuthUser,
  submissionId: string,
) {
  if (!user || !submissionId) throw new Error("Reviewinzending ontbreekt.");

  const supabase = createSupabaseBrowserClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

  if (sessionError) throw new Error(formatSupabaseError(sessionError));
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) throw new Error("Geen actieve DiBooks sessie gevonden voor de moderatiescan.");

  const response = await fetch("/api/moderation/scan-submission", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ submissionId }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      payload?.message ||
        payload?.error ||
        `Automatische moderatiescan mislukt (${response.status}).`,
    );
  }

  return {
    ok: true,
    flagCount: Number(payload?.flagCount ?? 0),
    scannedNodeCount: Number(payload?.scannedNodeCount ?? 0),
    reusedNodeCount: Number(payload?.reusedNodeCount ?? 0),
    changedNodeCount: Number(payload?.changedNodeCount ?? payload?.scannedNodeCount ?? 0),
    totalNodeCount: Number(payload?.totalNodeCount ?? 0),
  };
}

export async function submitBookForModeration(user: DemoAuthUser, bookId: string) {
  if (!user || !bookId) throw new Error("Boek of gebruiker ontbreekt.");
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("submit_book_for_moderation", {
    input_book_id: bookId,
  });
  if (error) throw new Error(formatSupabaseError(error));

  const submissionId = String(data ?? "");

  // We wachten de eerste scan bewust af. Zo kan een browsernavigatie de
  // automatische scan niet stilletjes afbreken. Een scannerfout blokkeert de
  // inzending zelf niet; de admin ziet dan "AI-scan mislukt" en kan opnieuw scannen.
  if (submissionId) {
    try {
      await triggerAutomaticModerationScan(user, submissionId);
    } catch (scanError) {
      console.warn("Automatische node-moderatiescan kon niet worden afgerond.", scanError);
    }
  }

  return submissionId;
}

export async function fetchAdminModerationQueue(user: DemoAuthUser) {
  await ensureAdminAccess(user);
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
    reviewerName: row.reviewer_name ?? undefined,
    reviewerEmail: row.reviewer_email ?? undefined,
    aiScanStatus: row.ai_scan_status ?? "not_started",
    aiScanProvider: row.ai_scan_provider ?? undefined,
    aiScanModel: row.ai_scan_model ?? undefined,
    aiScanStartedAt: row.ai_scan_started_at ?? undefined,
    aiScannedAt: row.ai_scanned_at ?? undefined,
    aiScanError: row.ai_scan_error ?? undefined,
    aiScannedNodeCount: Number(row.ai_scanned_node_count ?? 0),
    aiReusedNodeCount: Number(row.ai_reused_node_count ?? 0),
    aiChangedNodeCount: Number(row.ai_changed_node_count ?? 0),
    aiTotalNodeCount: Number(row.ai_total_node_count ?? 0),
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
  await ensureAdminAccess(user);
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
    reviewerName: row.reviewer_name ?? undefined,
    reviewerEmail: row.reviewer_email ?? undefined,
    aiScanStatus: row.ai_scan_status ?? "not_started",
    aiScanProvider: row.ai_scan_provider ?? undefined,
    aiScanModel: row.ai_scan_model ?? undefined,
    aiScanStartedAt: row.ai_scan_started_at ?? undefined,
    aiScannedAt: row.ai_scanned_at ?? undefined,
    aiScanError: row.ai_scan_error ?? undefined,
    aiScannedNodeCount: Number(row.ai_scanned_node_count ?? 0),
    aiReusedNodeCount: Number(row.ai_reused_node_count ?? 0),
    aiChangedNodeCount: Number(row.ai_changed_node_count ?? 0),
    aiTotalNodeCount: Number(row.ai_total_node_count ?? 0),
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
      submissionId: flag.submission_id ?? row.submission_id ?? undefined,
      nodeId: flag.node_id ?? "",
      category: flag.category ?? "Controle",
      severity: flag.severity ?? "medium",
      reason: flag.reason ?? "Deze node is gemarkeerd voor menselijke controle.",
      source: flag.source ?? "manual",
      resolution: flag.resolution ?? "pending",
      reviewedBy: flag.reviewed_by ?? undefined,
      reviewedAt: flag.reviewed_at ?? undefined,
      reviewNote: flag.review_note ?? undefined,
      createdAt: flag.created_at ?? undefined,
    })),
  } satisfies ModerationSubmissionDetail;
}

export async function clearModerationFlag(
  user: DemoAuthUser,
  flagId: string,
  note = "",
) {
  await ensureAdminAccess(user);
  if (!flagId) throw new Error("Moderatiemelding ontbreekt.");

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("clear_moderation_flag", {
    input_flag_id: flagId,
    input_note: note.trim(),
  });

  if (error) throw new Error(formatSupabaseError(error));
  return !!data;
}

export async function reopenModerationFlag(
  user: DemoAuthUser,
  flagId: string,
) {
  await ensureAdminAccess(user);
  if (!flagId) throw new Error("Moderatiemelding ontbreekt.");

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("reopen_moderation_flag", {
    input_flag_id: flagId,
  });

  if (error) throw new Error(formatSupabaseError(error));
  return !!data;
}

export async function reviewModerationSubmission(
  user: DemoAuthUser,
  submissionId: string,
  decision: ModerationDecision,
  feedback = "",
) {
  await ensureAdminAccess(user);
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
