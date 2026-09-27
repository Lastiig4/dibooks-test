export type ReaderBookmark = { id: string; nodeId: string; stepIndex: number; enteredAt: string; offset: number; pageIndex: number; label: string; createdAt: string };
export function bookmarkKey(userId: string, bookId: string) { return `dibooks:bookmarks:v1:${userId}:${bookId}`; }
export function parseBookmarks(raw: string | null): ReaderBookmark[] {
  try {
    const value: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(value)) return [];
    return value.filter((b): b is ReaderBookmark => !!b && typeof b.id === "string" && typeof b.nodeId === "string" && typeof b.enteredAt === "string" && !!b.enteredAt && typeof b.label === "string" && typeof b.createdAt === "string" && Number.isInteger(b.stepIndex) && b.stepIndex >= 0 && Number.isInteger(b.pageIndex) && b.pageIndex >= 0 && Number.isInteger(b.offset) && b.offset >= 0);
  } catch { return []; }
}
export function bookmarkAvailable(b: ReaderBookmark, history: { nodeId: string; enteredAt?: string }[]) {
  const step = history[b.stepIndex];
  return !!step && step.nodeId === b.nodeId && step.enteredAt === b.enteredAt;
}
