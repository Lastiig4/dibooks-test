"use client";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const CUTSCENE_BUCKET = "book-assets";
const SIGNED_URL_SECONDS = 60 * 60 * 24;

function safeSegment(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
}

function getFileExtension(fileName: string, mimeType: string) {
  const fromName = fileName.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,6}$/.test(fromName)) return fromName;
  if (mimeType.includes("webm")) return "webm";
  if (mimeType.includes("quicktime")) return "mov";
  return "mp4";
}

export function isSupabaseStoragePath(value?: string | null) {
  return !!value && !/^https?:\/\//i.test(value) && !value.startsWith("data:") && !value.startsWith("blob:");
}

export async function resolveDiBooksMediaUrl(storagePath?: string | null, fallbackUrl = "") {
  if (!storagePath || !isSupabaseStoragePath(storagePath)) return fallbackUrl;

  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.storage
    .from(CUTSCENE_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_SECONDS);

  if (error) {
    console.warn("Kon DiBooks media niet ondertekenen", error);
    return fallbackUrl;
  }

  return data?.signedUrl ?? fallbackUrl;
}

export async function uploadCutsceneVideoToStorage({
  userId,
  bookId,
  nodeId,
  file,
}: {
  userId: string;
  bookId?: string | null;
  nodeId: string;
  file: File;
}) {
  const supabase = createSupabaseBrowserClient();
  const extension = getFileExtension(file.name, file.type);
  const projectSegment = safeSegment(bookId || "drafts");
  const nodeSegment = safeSegment(nodeId);
  const path = `${userId}/${projectSegment}/cutscenes/${nodeSegment}-${Date.now()}.${extension}`;

  const { error } = await supabase.storage
    .from(CUTSCENE_BUCKET)
    .upload(path, file, {
      cacheControl: "31536000",
      contentType: file.type || "video/mp4",
      upsert: true,
    });

  if (error) throw error;

  const signedUrl = await resolveDiBooksMediaUrl(path);

  return {
    storagePath: path,
    signedUrl,
  };
}
