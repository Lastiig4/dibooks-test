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
