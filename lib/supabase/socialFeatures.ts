"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { DemoAuthUser } from "@/lib/auth";

export type ConnectionStatus = "pending" | "accepted" | "declined" | "blocked";
export type ConnectionDirection = "incoming" | "outgoing";

export type ConnectableProfile = {
  id: string;
  email: string;
  displayName: string;
  role: string;
  plan: string;
};

export type UserConnection = {
  connectionId: string;
  otherUserId: string;
  otherEmail: string;
  otherDisplayName: string;
  otherRole: string;
  otherPlan: string;
  requesterId: string;
  receiverId: string;
  status: ConnectionStatus;
  direction: ConnectionDirection;
  createdAt: string;
  updatedAt: string;
};

function mapProfile(row: any): ConnectableProfile {
  return {
    id: row.id,
    email: row.email ?? "",
    displayName: row.display_name ?? row.email ?? "DiBooks gebruiker",
    role: row.role ?? "reader",
    plan: row.plan ?? "free",
  };
}

function mapConnection(row: any): UserConnection {
  return {
    connectionId: row.connection_id,
    otherUserId: row.other_user_id,
    otherEmail: row.other_email ?? "",
    otherDisplayName: row.other_display_name ?? row.other_email ?? "DiBooks gebruiker",
    otherRole: row.other_role ?? "reader",
    otherPlan: row.other_plan ?? "free",
    requesterId: row.requester_id,
    receiverId: row.receiver_id,
    status: (row.status ?? "pending") as ConnectionStatus,
    direction: (row.direction ?? "outgoing") as ConnectionDirection,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function searchUsersForConnection(user: DemoAuthUser | null, query: string) {
  const trimmed = query.trim();
  if (!user || trimmed.length < 3) return [] as ConnectableProfile[];

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("search_connectable_profiles", {
    search_query: trimmed,
  });

  if (error) throw error;
  return (data ?? []).map(mapProfile);
}

export async function fetchUserConnections(user: DemoAuthUser | null) {
  if (!user) return [] as UserConnection[];

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_user_connections");

  if (error) throw error;
  return (data ?? []).map(mapConnection);
}

export async function sendConnectionRequest(user: DemoAuthUser | null, targetUserId: string) {
  if (!user || !targetUserId) return null;

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("send_connection_request", {
    target_user_id: targetUserId,
  });

  if (error) throw error;
  return data as string | null;
}

export async function acceptConnectionRequest(user: DemoAuthUser | null, connectionId: string) {
  if (!user || !connectionId) return false;

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("respond_to_connection_request", {
    target_connection_id: connectionId,
    new_status: "accepted",
  });

  if (error) throw error;
  return !!data;
}

export async function declineConnectionRequest(user: DemoAuthUser | null, connectionId: string) {
  if (!user || !connectionId) return false;

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("respond_to_connection_request", {
    target_connection_id: connectionId,
    new_status: "declined",
  });

  if (error) throw error;
  return !!data;
}

export async function removeConnection(user: DemoAuthUser | null, connectionId: string) {
  if (!user || !connectionId) return false;

  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from("user_connections")
    .delete()
    .eq("id", connectionId);

  if (error) throw error;
  return true;
}

export type SharePermission = "read" | "comment" | "edit";

export type ShareableContact = {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  plan: string;
};

export type OwnerBookShare = {
  shareId: string;
  bookId: string;
  bookTitle: string;
  sharedWithUserId: string;
  sharedWithEmail: string;
  sharedWithDisplayName: string;
  permission: SharePermission;
  status: "active" | "revoked";
  createdAt: string;
  updatedAt: string;
};

export type SharedBook = {
  shareId: string;
  permission: SharePermission;
  shareStatus: "active" | "revoked";
  sharedAt: string;
  id: string;
  slug?: string;
  title: string;
  author: string;
  subtitle: string;
  description: string;
  genres: string[];
  primaryGenre: string;
  status: string;
  published: boolean;
  accessType: "free" | "premium";
  ageRating: string;
  readTime: string;
  coverImage: string;
  bannerImage: string;
  coverClass: string;
  accentClass: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  projectData?: any;
  projectUpdatedAt?: string;
};

export type BookFeedbackItem = {
  feedbackId: string;
  bookId: string;
  bookTitle: string;
  fromUserId: string;
  fromEmail: string;
  fromDisplayName: string;
  ownerId: string;
  message: string;
  nodeId?: string | null;
  pageIndex?: number | null;
  status: string;
  createdAt: string;
};

export type BookRevisionItem = {
  revisionId: string;
  bookId: string;
  bookTitle: string;
  ownerId: string;
  editorUserId: string;
  editorEmail: string;
  editorDisplayName: string;
  note?: string | null;
  status: "submitted" | "accepted" | "rejected";
  createdAt: string;
  updatedAt: string;
};

function mapShareableContact(row: any): ShareableContact {
  return {
    userId: row.user_id,
    email: row.email ?? "",
    displayName: row.display_name ?? row.email ?? "DiBooks gebruiker",
    role: row.role ?? "reader",
    plan: row.plan ?? "free",
  };
}

function mapOwnerBookShare(row: any): OwnerBookShare {
  return {
    shareId: row.share_id,
    bookId: row.book_id,
    bookTitle: row.book_title ?? "Naamloos boek",
    sharedWithUserId: row.shared_with_user_id,
    sharedWithEmail: row.shared_with_email ?? "",
    sharedWithDisplayName: row.shared_with_display_name ?? row.shared_with_email ?? "DiBooks gebruiker",
    permission: (row.permission ?? "read") as SharePermission,
    status: (row.status ?? "active") as "active" | "revoked",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSharedBook(row: any): SharedBook {
  return {
    shareId: row.share_id,
    permission: (row.permission ?? "read") as SharePermission,
    shareStatus: (row.share_status ?? "active") as "active" | "revoked",
    sharedAt: row.shared_at,
    id: row.id,
    slug: row.slug ?? undefined,
    title: row.title ?? "Naamloos boek",
    author: row.author ?? "Auteur",
    subtitle: row.subtitle ?? "",
    description: row.description ?? "",
    genres: Array.isArray(row.genres) ? row.genres : ["Interactief"],
    primaryGenre: row.primary_genre ?? "Interactief",
    status: row.status ?? "Concept",
    published: !!row.published,
    accessType: (row.access_type ?? "free") as "free" | "premium",
    ageRating: row.age_rating ?? "12+",
    readTime: row.read_time ?? "Concept",
    coverImage: row.cover_image ?? "",
    bannerImage: row.banner_image ?? "",
    coverClass: row.cover_class ?? "from-blue-950 via-slate-950 to-purple-950",
    accentClass: row.accent_class ?? "border-blue-500/60",
    ownerId: row.owner_id,
    ownerName: row.owner_name ?? "Auteur",
    ownerEmail: row.owner_email ?? "",
    projectData: row.project_data ?? undefined,
    projectUpdatedAt: row.project_updated_at ?? undefined,
  };
}

function mapFeedback(row: any): BookFeedbackItem {
  return {
    feedbackId: row.feedback_id,
    bookId: row.book_id,
    bookTitle: row.book_title ?? "Naamloos boek",
    fromUserId: row.from_user_id,
    fromEmail: row.from_email ?? "",
    fromDisplayName: row.from_display_name ?? row.from_email ?? "DiBooks gebruiker",
    ownerId: row.owner_id,
    message: row.message ?? "",
    nodeId: row.node_id ?? null,
    pageIndex: row.page_index ?? null,
    status: row.status ?? "open",
    createdAt: row.created_at,
  };
}

function mapRevision(row: any): BookRevisionItem {
  return {
    revisionId: row.revision_id,
    bookId: row.book_id,
    bookTitle: row.book_title ?? "Naamloos boek",
    ownerId: row.owner_id,
    editorUserId: row.editor_user_id,
    editorEmail: row.editor_email ?? "",
    editorDisplayName: row.editor_display_name ?? row.editor_email ?? "DiBooks gebruiker",
    note: row.note ?? null,
    status: (row.status ?? "submitted") as "submitted" | "accepted" | "rejected",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchShareableContacts(user: DemoAuthUser | null) {
  if (!user) return [] as ShareableContact[];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_shareable_contacts");
  if (error) throw error;
  return (data ?? []).map(mapShareableContact);
}

export async function shareBookWithContact(
  user: DemoAuthUser | null,
  bookId: string,
  targetUserId: string,
  permission: SharePermission,
) {
  if (!user) return null;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("share_book_with_user", {
    input_book_id: bookId,
    target_user_id: targetUserId,
    input_permission: permission,
  });
  if (error) throw error;
  return data as string | null;
}

export async function revokeBookShare(user: DemoAuthUser | null, shareId: string) {
  if (!user) return false;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("revoke_book_share", { input_share_id: shareId });
  if (error) throw error;
  return !!data;
}

export async function fetchBookSharesForOwner(user: DemoAuthUser | null) {
  if (!user) return [] as OwnerBookShare[];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_book_shares_for_owner");
  if (error) throw error;
  return (data ?? []).map(mapOwnerBookShare);
}

export async function fetchSharedBooks(user: DemoAuthUser | null) {
  if (!user) return [] as SharedBook[];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_shared_books");
  if (error) throw error;
  return (data ?? []).map(mapSharedBook);
}

export async function fetchSharedBookForEditor(user: DemoAuthUser | null, bookId: string) {
  if (!user) return null as SharedBook | null;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_shared_book", { input_book_id: bookId });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return row ? mapSharedBook({ ...row, share_status: "active", shared_at: row.created_at }) : null;
}

export async function submitBookFeedback(
  user: DemoAuthUser | null,
  bookId: string,
  message: string,
  nodeId?: string | null,
  pageIndex?: number | null,
) {
  if (!user) return null;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("submit_book_feedback", {
    input_book_id: bookId,
    input_message: message,
    input_node_id: nodeId ?? null,
    input_page_index: pageIndex ?? null,
  });
  if (error) throw error;
  return data as string | null;
}

export async function fetchBookFeedbackForUser(user: DemoAuthUser | null) {
  if (!user) return [] as BookFeedbackItem[];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_book_feedback_for_user");
  if (error) throw error;
  return (data ?? []).map(mapFeedback);
}

export async function submitBookRevision(
  user: DemoAuthUser | null,
  bookId: string,
  projectData: any,
  note: string,
) {
  if (!user) return null;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("submit_book_revision", {
    input_book_id: bookId,
    input_project_data: projectData,
    input_note: note,
  });
  if (error) throw error;
  return data as string | null;
}

export async function fetchBookRevisionsForUser(user: DemoAuthUser | null) {
  if (!user) return [] as BookRevisionItem[];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_book_revisions_for_user");
  if (error) throw error;
  return (data ?? []).map(mapRevision);
}

export async function respondToBookRevision(
  user: DemoAuthUser | null,
  revisionId: string,
  status: "accepted" | "rejected",
) {
  if (!user) return false;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("respond_to_book_revision", {
    input_revision_id: revisionId,
    input_status: status,
  });
  if (error) throw error;
  return !!data;
}

export type ChatConversation = {
  conversationId: string;
  otherUserId: string;
  otherEmail: string;
  otherDisplayName: string;
  otherRole: string;
  otherPlan: string;
  relatedBookId?: string | null;
  relatedBookTitle?: string | null;
  lastMessage?: string | null;
  lastMessageAt?: string | null;
  updatedAt: string;
};

export type ChatMessage = {
  messageId: string;
  conversationId: string;
  senderId: string;
  senderEmail: string;
  senderDisplayName: string;
  message: string;
  relatedBookId?: string | null;
  relatedBookTitle?: string | null;
  createdAt: string;
};

function mapChatConversation(row: any): ChatConversation {
  return {
    conversationId: row.conversation_id,
    otherUserId: row.other_user_id,
    otherEmail: row.other_email ?? "",
    otherDisplayName: row.other_display_name ?? row.other_email ?? "DiBooks gebruiker",
    otherRole: row.other_role ?? "reader",
    otherPlan: row.other_plan ?? "free",
    relatedBookId: row.related_book_id ?? null,
    relatedBookTitle: row.related_book_title ?? null,
    lastMessage: row.last_message ?? null,
    lastMessageAt: row.last_message_at ?? null,
    updatedAt: row.updated_at,
  };
}

function mapChatMessage(row: any): ChatMessage {
  return {
    messageId: row.message_id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    senderEmail: row.sender_email ?? "",
    senderDisplayName: row.sender_display_name ?? row.sender_email ?? "DiBooks gebruiker",
    message: row.message ?? "",
    relatedBookId: row.related_book_id ?? null,
    relatedBookTitle: row.related_book_title ?? null,
    createdAt: row.created_at,
  };
}

export async function fetchChatConversations(user: DemoAuthUser | null) {
  if (!user) return [] as ChatConversation[];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_user_chat_conversations");
  if (error) throw error;
  return (data ?? []).map(mapChatConversation);
}

export async function getOrCreateDirectConversation(user: DemoAuthUser | null, targetUserId: string) {
  if (!user || !targetUserId) return null;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_or_create_direct_conversation", {
    target_user_id: targetUserId,
  });
  if (error) throw error;
  return data as string | null;
}

export async function fetchChatMessages(user: DemoAuthUser | null, conversationId: string) {
  if (!user || !conversationId) return [] as ChatMessage[];
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("get_chat_messages", {
    input_conversation_id: conversationId,
  });
  if (error) throw error;
  return (data ?? []).map(mapChatMessage);
}

export async function sendChatMessage(
  user: DemoAuthUser | null,
  conversationId: string,
  message: string,
  relatedBookId?: string | null,
) {
  if (!user || !conversationId) return null;
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("send_chat_message", {
    input_conversation_id: conversationId,
    input_message: message,
    input_related_book_id: relatedBookId ?? null,
  });
  if (error) throw error;
  return data as string | null;
}
