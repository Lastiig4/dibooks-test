"use client";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Review = { review_id: string; author_name: string; rating: number | null; body: string | null; contains_spoilers: boolean; created_at: string };
function ReviewText({ review, bookId }: { review: Review; bookId: string }) {
  const [visible, setVisible] = useState(false);
  const [text, setText] = useState<string | null>(review.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function reveal() {
    if (text !== null) { setVisible(true); return; }
    setBusy(true); setError(false);
    try {
      const { data, error } = await createSupabaseBrowserClient().rpc("talk_reveal_review", { input_book_id: bookId, input_review_id: review.review_id });
      if (error || typeof data !== "string") throw error;
      setText(data); setVisible(true);
    } catch { setError(true); } finally { setBusy(false); }
  }
  if (!review.contains_spoilers) return <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-neutral-300">{review.body}</p>;
  return <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-400/5 p-3">
    {!visible ? <><p className="text-sm text-amber-200">⚠ Deze recensie bevat spoilers</p><button disabled={busy} onClick={() => void reveal()} className="mt-2 rounded-lg bg-white/10 px-3 py-2 text-sm">{busy ? "Laden…" : "Bekijken"}</button></> : <><p className="whitespace-pre-wrap break-words text-sm leading-6">{text}</p><button onClick={() => setVisible(false)} className="mt-2 text-xs text-amber-200">Weer verbergen</button></>}
    {error && <p role="alert" className="mt-2 text-xs text-red-300">Kon recensie niet laden. Probeer opnieuw.</p>}
  </div>;
}
export default function TalkBookReviews({ bookId }: { bookId: string }) {
  const [rows, setRows] = useState<Review[]>([]);
  const [offset, setOffset] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setBusy(true); setError(false);
    Promise.resolve(createSupabaseBrowserClient().rpc("talk_book_reviews", { input_book_id: bookId, page_offset: offset })).then(({ data, error }) => {
      if (!active) return;
      setError(!!error); setRows(error ? [] : data ?? []); setBusy(false);
    }).catch(() => { if (active) { setError(true); setBusy(false); } });
    return () => { active = false; };
  }, [bookId, offset, retry]);
  return <section aria-label="Recensies" className="space-y-3"><h2 className="text-xl font-bold">Recensies</h2>
    {busy ? <p role="status">Recensies laden…</p> : error ? <button onClick={() => setRetry(v=>v+1)} className="text-amber-200">Recensies niet bereikbaar. Opnieuw proberen</button> : <>
      {!rows.length && <p className="text-sm text-neutral-400">{offset ? "Geen verdere recensies." : "Nog geen recensies voor dit boek."}</p>}
      {rows.map(r => <article key={`${bookId}:${r.review_id}`} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="flex flex-wrap justify-between gap-2"><span className="font-bold">{r.author_name}</span><span aria-label={r.rating ? `${r.rating} van 5 sterren` : "Zonder sterren"} className="text-amber-300">{r.rating ? "★".repeat(r.rating) + "☆".repeat(5-r.rating) : "Recensie"}</span></div><ReviewText review={r} bookId={bookId}/></article>)}
      <div className="flex gap-4">{offset > 0 && <button onClick={()=>setOffset(v=>Math.max(0,v-30))}>← Vorige recensies</button>}{rows.length === 30 && <button onClick={()=>setOffset(v=>v+30)}>Meer recensies →</button>}</div>
    </>}
  </section>;
}
