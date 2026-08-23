"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AppNav from "@/components/AppNav";
import { useDemoAuth } from "@/lib/auth";
import {
  fetchAdminModerationQueue,
  triggerAutomaticModerationScan,
  type ModerationQueueItem,
} from "@/lib/supabase/moderation";

function formatDate(value?: string) {
  if (!value) return "Onbekend";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Onbekend";
  return date.toLocaleString("nl-NL", { dateStyle: "medium", timeStyle: "short" });
}

function statusLabel(status: string) {
  if (status === "pending") return "In afwachting";
  if (status === "approved") return "Goedgekeurd";
  if (status === "rejected") return "Afgewezen";
  return status;
}

export default function AdminModerationPage() {
  const { user, loading: authLoading } = useDemoAuth();
  const [items, setItems] = useState<ModerationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [scanningSubmissionId, setScanningSubmissionId] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSelectedSubmissionId(params.get("submission"));
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadQueue() {
      if (authLoading) return;
      if (!user || user.role !== "admin") { setLoading(false); return; }
      try {
        setError("");
        const queue = await fetchAdminModerationQueue(user);
        if (!cancelled) setItems(queue);
      } catch (queueError: any) {
        if (!cancelled) setError(queueError?.message ?? "Moderatiequeue kon niet worden geladen.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void loadQueue();
    return () => { cancelled = true; };
  }, [authLoading, user]);

  async function rescanSubmission(submissionId: string) {
    if (!user || user.role !== "admin" || scanningSubmissionId) return;

    setScanningSubmissionId(submissionId);

    try {
      const result = await triggerAutomaticModerationScan(user, submissionId);
      const queue = await fetchAdminModerationQueue(user);
      setItems(queue);

      alert(
        result.flagCount > 0
          ? `AI-scan klaar: ${result.flagCount} markering${result.flagCount === 1 ? "" : "en"} gevonden.`
          : "AI-scan klaar: geen automatische markeringen gevonden.",
      );
    } catch (scanError: any) {
      alert(`AI-scan mislukt: ${scanError?.message ?? "onbekende fout"}`);
    } finally {
      setScanningSubmissionId(null);
    }
  }

  const pendingItems = useMemo(() => items.filter((item) => item.status === "pending"), [items]);
  const completedItems = useMemo(() => items.filter((item) => item.status !== "pending"), [items]);

  if (authLoading) {
    return <main className="flex min-h-screen items-center justify-center bg-[#05070d] text-white">Adminrechten controleren...</main>;
  }

  if (!user || user.role !== "admin") {
    return (
      <main className="min-h-screen bg-[#05070d] text-white">
        <AppNav title="Boekmoderatie" subtitle="Admin" />
        <section className="mx-auto max-w-3xl px-5 py-16 text-center">
          <div className="rounded-3xl border border-red-500/25 bg-red-500/10 p-10">
            <div className="text-5xl">🔒</div>
            <h1 className="mt-5 text-4xl font-black">Alleen voor admins</h1>
            <p className="mt-4 font-semibold text-neutral-300">Deze pagina is alleen zichtbaar voor accounts met de DiBooks adminrol.</p>
            <Link href="/" className="mt-7 inline-flex rounded-2xl bg-white px-5 py-3 font-black text-black">Terug naar Library</Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#05070d] text-white">
      <AppNav title="Boekmoderatie" subtitle="Admin reviewcentrum" />
      <section className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        <div className="rounded-[2rem] border border-purple-400/20 bg-gradient-to-br from-purple-950/55 via-neutral-950 to-blue-950/40 p-8 shadow-2xl sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.45em] text-purple-300">Admin</p>
          <div className="mt-4 flex flex-wrap items-end justify-between gap-5">
            <div>
              <h1 className="text-4xl font-black sm:text-6xl">Boekmoderatie</h1>
              <p className="mt-4 max-w-3xl font-semibold leading-7 text-neutral-300">Controleer de bevroren versie die een auteur heeft ingediend. De Auteur Studio opent in een speciale alleen-lezen reviewmodus.</p>
            </div>
            <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 px-5 py-4 text-center">
              <p className="text-3xl font-black text-amber-100">{pendingItems.length}</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-amber-300">wachten op review</p>
            </div>
          </div>
        </div>

        {error && <div className="mt-6 rounded-2xl border border-red-500/30 bg-red-500/10 p-5 font-bold text-red-100">{error}</div>}
        {loading ? (
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center font-black text-neutral-400">Moderatiequeue laden...</div>
        ) : (
          <>
            <section className="mt-10">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.35em] text-amber-300">In afwachting</p>
                  <h2 className="mt-2 text-3xl font-black">Te beoordelen boeken</h2>
                </div>
              </div>

              {pendingItems.length === 0 ? (
                <div className="mt-5 rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center text-neutral-400">Geen boeken in afwachting. 🎉</div>
              ) : (
                <div className="mt-5 grid gap-5 lg:grid-cols-2">
                  {pendingItems.map((item) => {
                    const selected = selectedSubmissionId === item.submissionId;
                    return (
                      <article key={item.submissionId} className={`rounded-3xl border p-5 shadow-2xl ${selected ? "border-yellow-300/55 bg-yellow-300/[0.07]" : "border-white/10 bg-white/[0.035]"}`}>
                        <div className="flex gap-4">
                          <div className="h-32 w-24 shrink-0 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
                            {item.coverImage ? <img src={item.coverImage} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full items-center justify-center text-3xl">📕</div>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap gap-2">
                              <span className="rounded-full bg-amber-400 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-black">In afwachting</span>
                              {item.flagCount > 0 && <span className="rounded-full bg-red-500 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-white">⚠ {item.flagCount} gemarkeerd</span>}
                            </div>
                            <h3 className="mt-3 truncate text-2xl font-black">{item.bookTitle}</h3>
                            <p className="mt-1 text-sm font-bold text-purple-200">{item.bookAuthor}</p>
                            <p className="mt-3 text-xs font-semibold leading-5 text-neutral-400">Ingediend door {item.ownerName}{item.ownerEmail ? ` • ${item.ownerEmail}` : ""}<br />{formatDate(item.submittedAt)} • {item.nodeCount} nodes</p>
                          </div>
                        </div>
                        <div className="mt-5 flex flex-wrap gap-3">
                          <Link href={`/editor?review=${item.submissionId}`} className="rounded-2xl bg-purple-500 px-5 py-3 text-sm font-black text-white hover:bg-purple-400">🛡️ Open in reviewmodus</Link>
                          <button
                            type="button"
                            onClick={() => void rescanSubmission(item.submissionId)}
                            disabled={scanningSubmissionId !== null}
                            className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-5 py-3 text-sm font-black text-cyan-100 hover:bg-cyan-500/20 disabled:cursor-wait disabled:opacity-50"
                          >
                            {scanningSubmissionId === item.submissionId ? "AI-scan bezig..." : "✨ AI opnieuw scannen"}
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>

            {completedItems.length > 0 && (
              <section className="mt-12 border-t border-white/10 pt-8">
                <p className="text-xs font-black uppercase tracking-[0.35em] text-neutral-500">Geschiedenis</p>
                <h2 className="mt-2 text-2xl font-black">Recent beoordeeld</h2>
                <div className="mt-5 grid gap-3">
                  {completedItems.slice(0, 20).map((item) => (
                    <div key={item.submissionId} className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.025] p-4">
                      <div>
                        <p className="font-black">{item.bookTitle}</p>
                        <p className="mt-1 text-xs font-bold text-neutral-500">{statusLabel(item.status)} • {formatDate(item.reviewedAt ?? item.submittedAt)}</p>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-xs font-black ${item.status === "approved" ? "bg-emerald-500/15 text-emerald-200" : "bg-red-500/15 text-red-200"}`}>{statusLabel(item.status)}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </section>
    </main>
  );
}
