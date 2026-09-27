"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useDemoAuth } from "@/lib/auth";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { LibraryBook } from "@/lib/librarySelection";

type Progress = { book_id: string; current_node_id: string; progress_percent: number; run_history?: { nodeId: string; nodeType?: string }[] };
export default function ContinueReading({ books }: { books: (LibraryBook & { projectData?: { nodes?: { id: string; data?: { chapterTitle?: string; chapterNumber?: string; label?: string } }[] } })[] }) {
  const { user } = useDemoAuth();
  const [result, setResult] = useState<{ owner: string; rows: Progress[] }>({ owner: "", rows: [] });
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!user?.id) return;
    let active = true;
    setFailed(false);
    createSupabaseBrowserClient().from("reading_progress")
      .select("book_id,current_node_id,progress_percent,run_history").eq("user_id", user.id).order("updated_at", { ascending: false })
      .then(({ data, error }) => {
        if (!active) return;
        setFailed(!!error);
        setResult({ owner: user.id, rows: error ? [] : data ?? [] });
      });
    return () => { active = false; };
  }, [user?.id, retry]);
  if (!user) return null;
  const rows = result.owner === user.id ? result.rows.flatMap(progress => {
    const book = books.find(b => b.id === progress.book_id && b.published);
    return book && progress.current_node_id ? [{ book, progress }] : [];
  }).slice(0, 3) : [];
  if (!rows.length && !failed) return null;
  return <section aria-labelledby="continue-reading-title" className="px-5 pt-8 sm:px-8 lg:px-10">
    <h2 id="continue-reading-title" className="mb-4 text-2xl font-bold">Verder lezen</h2>
    {failed && <button onClick={() => setRetry(v => v + 1)} className="text-sm text-amber-200">Leesvoortgang kon niet worden geladen. Opnieuw proberen</button>}
    <div className="grid gap-4 md:grid-cols-3">{rows.map(({ book, progress }) => {
      const chapterStep = [...(progress.run_history ?? [])].reverse().find(s => s.nodeType === "chapter");
      const chapter = book.projectData?.nodes?.find(n => n.id === chapterStep?.nodeId)?.data;
      const percent = Math.max(0, Math.min(100, Number(progress.progress_percent) || 0));
      return <Link key={book.id} href={`/books/${book.id}/read`} className="flex min-w-0 gap-4 rounded-2xl border border-blue-300/20 bg-[#0c1019] p-4 focus-visible:outline-2 focus-visible:outline-cyan-300">
        {book.coverImage && <img src={book.coverImage} alt="" className="h-36 w-24 shrink-0 rounded-lg object-cover" />}
        <div className="flex min-w-0 flex-1 flex-col justify-center"><h3 className="line-clamp-2 font-bold">{book.title}</h3><p className="mt-1 text-xs text-neutral-400">{chapter ? [chapter.chapterNumber && `Hoofdstuk ${chapter.chapterNumber}`, chapter.chapterTitle || chapter.label].filter(Boolean).join(" — ") : "Je laatst bewaarde leesplek"}</p><p className="mt-3 text-xs text-blue-200">{Math.round(percent)}% gelezen</p><div role="progressbar" aria-label={`Leesvoortgang ${book.title}`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-blue-400" style={{ width: `${percent}%` }} /></div><span className="mt-3 text-sm font-bold text-cyan-200">Verder lezen →</span></div>
      </Link>;
    })}</div>
  </section>;
}
