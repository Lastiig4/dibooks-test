"use client";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function BookCompletion({ bookId, userId, title, author, cover, runId }: {
  bookId: string; userId: string; title: string; author: string; cover?: string; runId: string;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "done" | "error">("loading");
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState<number | null>(null);
  const [body, setBody] = useState("");
  const [spoilers, setSpoilers] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const saving = useRef(false);
  const skipKey = `dibooks:review-dismissed:${userId}:${bookId}:${runId}`;
  useEffect(() => {
    let active = true;
    setStatus("loading");
    Promise.resolve(createSupabaseBrowserClient().from("book_reviews").select("book_id").eq("book_id", bookId).eq("user_id", userId).maybeSingle())
      .then(({ data, error }) => {
        if (!active) return;
        if (error) { setStatus("error"); return; }
        let skipped = false;
        try { skipped = localStorage.getItem(skipKey) === "1"; } catch { /* Optional dismissal memory. */ }
        setStatus(data || skipped ? "done" : "ready");
      }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [bookId, userId, skipKey, retry]);
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = overflow; triggerRef.current?.focus(); };
  }, [open]);
  function dismiss() {
    if (saving.current) return;
    try { localStorage.setItem(skipKey, "1"); } catch { /* Still dismiss in this session. */ }
    setOpen(false); setStatus("done");
  }
  async function submit() {
    if (saving.current || (!rating && !body.trim())) return;
    saving.current = true; setBusy(true); setError("");
    try {
      const { error } = await createSupabaseBrowserClient().from("book_reviews").insert({ book_id: bookId, user_id: userId, rating, body: body.trim(), contains_spoilers: spoilers });
      // The unique key also handles simultaneous submissions from another device.
      if (error && error.code !== "23505") throw error;
      setOpen(false); setStatus("done");
    } catch { setError("Opslaan is niet gelukt. Je tekst staat er nog; probeer het opnieuw."); }
    finally { saving.current = false; setBusy(false); }
  }
  return <>
    <div className="text-right">
      <button ref={triggerRef} type="button" disabled={status === "loading" || status === "done"} onClick={() => status === "error" ? setRetry(v => v + 1) : setOpen(true)} className="rounded-2xl bg-amber-300 px-5 py-3 font-black text-amber-950 disabled:bg-white/5 disabled:text-neutral-300">
        {status === "done" ? "✓ Boek uitgelezen" : status === "error" ? "Beoordeling controleren" : "Boek afronden"}
      </button>
      {status === "error" && <p role="status" className="mt-2 text-xs text-neutral-400">Beoordelingen zijn nu niet bereikbaar. Verder lezen blijft mogelijk.</p>}
    </div>
    {open && <dialog ref={dialogRef} onCancel={event => { event.preventDefault(); dismiss(); }} aria-labelledby="completion-title" className="fixed inset-0 m-auto max-h-[92dvh] w-[calc(100%-1rem)] max-w-2xl overflow-y-auto rounded-3xl border border-blue-300/20 bg-[#090d1b] p-6 text-white shadow-2xl backdrop:bg-black/80 sm:p-8">
      <div className="flex items-center gap-6">
        {cover && <img src={cover} alt={`Cover van ${title}`} className="w-24 shrink-0 -rotate-3 rounded-lg shadow-xl sm:w-36" />}
        <div><p className="text-xs font-bold uppercase tracking-widest text-blue-300">DiBooks · Uitgelezen</p><h2 id="completion-title" className="mt-2 text-2xl font-black">Wat vond je van dit verhaal?</h2><p className="mt-3 font-bold">{title}</p><p className="text-sm text-neutral-400">{author}</p></div>
      </div>
      <p className="mt-6 text-sm text-neutral-300">Een beoordeling is helemaal vrijwillig. Geef sterren, schrijf een recensie, of sla deze stap over.</p>
      <fieldset disabled={busy} className="mt-5"><legend className="text-sm font-bold">Jouw beoordeling</legend><div className="mt-2 flex flex-wrap gap-2">{[1,2,3,4,5].map(value => <button key={value} type="button" aria-label={`${value} ${value === 1 ? "ster" : "sterren"}`} aria-pressed={rating === value} onClick={() => setRating(value)} className={`rounded-lg px-2 py-1 text-3xl focus-visible:outline-2 focus-visible:outline-amber-200 ${rating && value <= rating ? "text-amber-300" : "text-neutral-500"}`}>★</button>)}{rating && <button type="button" onClick={() => setRating(null)} className="text-xs text-neutral-400">Wissen</button>}</div>
        <label className="mt-5 block text-sm font-bold">Recensie (optioneel)<textarea value={body} onChange={event => setBody(event.target.value)} maxLength={4000} rows={4} className="mt-2 w-full rounded-xl border border-white/20 bg-black/30 p-3 font-normal" placeholder="Wat bleef je bij?" /></label>
        <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={spoilers} onChange={event => setSpoilers(event.target.checked)} />Bevat spoilers</label>
      </fieldset>
      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
      <div className="mt-6 flex flex-wrap justify-end gap-3"><button type="button" disabled={busy} onClick={dismiss} className="rounded-xl border border-white/20 px-4 py-3">Niet nu</button><button type="button" disabled={busy || (!rating && !body.trim())} onClick={() => void submit()} className="rounded-xl bg-blue-600 px-4 py-3 font-bold disabled:opacity-40">{busy ? "Opslaan…" : "Beoordeling plaatsen"}</button></div>
    </dialog>}
  </>;
}
