"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AppNav from "@/components/AppNav";
import ExclusiveManager from "@/components/ExclusiveManager";
import TalkBookReviews from "@/components/TalkBookReviews";
import { useDemoAuth } from "@/lib/auth";
import { openDiBooksAuth } from "@/lib/plans";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchPublishedDashboardBooksFromSupabase } from "@/lib/supabase/dashboardBooks";

type Book = { id: string; title: string; author: string; coverImage?: string };
type Space = { id: string; title: string; description: string };
type Post = { id: string; title?: string; body: string; author_id: string; author_name: string; contains_spoilers: boolean; book_ids?: string[]; space_id?: string; created_at: string };
const field = "w-full rounded-xl border border-white/15 bg-[#111827] p-3 text-sm text-white focus:outline-2 focus:outline-cyan-300";
const button = "rounded-xl border border-cyan-300/25 bg-cyan-500/10 px-4 py-2.5 text-sm font-bold text-cyan-100 hover:bg-cyan-500/20 disabled:opacity-40";

function PostBody({ post }: { post: Post }) {
  const [revealed, setRevealed] = useState(false);
  if (post.contains_spoilers && !revealed) return <div className="mt-4 rounded-xl bg-amber-400/5 p-4"><p className="text-sm text-amber-200">⚠ Dit bericht bevat spoilers</p><button onClick={()=>setRevealed(true)} className={`${button} mt-3`}>Bekijken</button></div>;
  return <><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-neutral-200">{post.body}</p>{post.contains_spoilers && <button onClick={()=>setRevealed(false)} className="mt-2 text-xs text-amber-200">Weer verbergen</button>}</>;
}

function TalkContent() {
  const params = useSearchParams();
  const router = useRouter();
  const bookId = params.get("book") || "";
  const spaceId = params.get("space") || "";
  const topicId = params.get("topic") || "";
  const { user } = useDemoAuth();
  const [permission, setPermission] = useState({ userId: "", allowed: false });
  const [manageExclusive, setManageExclusive] = useState(false);
  const canCreateSubject = !!user && permission.userId === user.id && permission.allowed;
  const [books, setBooks] = useState<Book[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [topics, setTopics] = useState<Post[]>([]);
  const [topic, setTopic] = useState<Post | null>(null);
  const [replies, setReplies] = useState<Post[]>([]);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [search, setSearch] = useState("");
  const [compose, setCompose] = useState<"space" | "topic" | "reply" | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [spoilers, setSpoilers] = useState(false);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [formError, setFormError] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const selectedBook = books.find(b => b.id === bookId);
  const selectedSpace = spaces.find(s => s.id === spaceId);
  useEffect(() => { setOffset(0); setCompose(null); setDeleteId(null); }, [bookId,spaceId,topicId,user?.id]);
  useEffect(() => {
    let active = true;
    setLoading(true); setError("");
    async function load() {
      try {
        const db = createSupabaseBrowserClient();
        const [catalog, spaceRows] = await Promise.all([fetchPublishedDashboardBooksFromSupabase(), db.from("talk_spaces").select("id,title,description").order("created_at", {ascending:false})]);
        if (spaceRows.error) throw spaceRows.error;
        if (!active) return;
        setBooks(catalog); setSpaces(spaceRows.data ?? []);
        if (topicId) {
          const [one, responses] = await Promise.all([db.from("talk_topics").select("*").eq("id",topicId).maybeSingle(),db.from("talk_replies").select("*").eq("topic_id",topicId).order("created_at").order("id").range(offset,offset+29)]);
          if (one.error || responses.error) throw one.error || responses.error;
          if (!one.data) throw new Error("Topic niet gevonden.");
          if (active) { setTopic(one.data); setReplies(responses.data ?? []); }
        } else {
          let query = db.from("talk_topics").select("*").order("created_at",{ascending:false}).order("id");
          if (bookId) query = query.contains("book_ids",[bookId]);
          if (spaceId) query = query.eq("space_id",spaceId);
          const result = await query.range(offset,offset+29);
          if (result.error) throw result.error;
          if (active) { setTopics(result.data ?? []); setTopic(null); }
        }
      } catch { if (active) setError("Talk about kon niet worden geladen. Probeer het opnieuw."); }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [bookId,spaceId,topicId,offset,refresh]);
  useEffect(() => {
    let active = true;
    setPermission({ userId: "", allowed: false });
    setManageExclusive(false);
    async function check() {
      if (!user?.id) return;
      try {
        const { data, error } = await createSupabaseBrowserClient().rpc("talk_can_create_subject");
        if (active) setPermission({ userId: user.id, allowed: !error && data === true });
      } catch { if (active) setPermission({ userId: user.id, allowed: false }); }
    }
    void check();
    return () => { active = false; };
  }, [user?.id, user?.role, refresh]);
  function start(kind: "space" | "topic" | "reply") {
    if (!user) { openDiBooksAuth("login"); return; }
    if (kind === "space" && !canCreateSubject) return;
    if (kind === "topic" && !selectedSpace) return;
    setCompose(kind); setTitle(""); setBody(""); setTags(bookId ? [bookId] : []); setSpoilers(false); setFormError("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!user || !compose || submitting.current) return;
    if (compose === "space" && !canCreateSubject) { setFormError("Alleen admins en Exclusive-gebruikers kunnen onderwerpen maken."); return; }
    if (compose === "topic" && !selectedSpace) { setFormError("Kies eerst een onderwerp."); return; }
    submitting.current = true; setBusy(true); setFormError("");
    try {
      const db = createSupabaseBrowserClient();
      const result = compose === "space" ? await db.from("talk_spaces").insert({title:title.trim(), description:body.trim()}).select("id").single()
        : compose === "topic" ? await db.from("talk_topics").insert({title:title.trim(),body:body.trim(),space_id:spaceId,book_ids:tags,contains_spoilers:spoilers}).select("id").single()
        : await db.from("talk_replies").insert({topic_id:topicId,body:body.trim(),contains_spoilers:spoilers});
      if (result.error) throw result.error;
      const created = result.data as {id:string} | null;
      setCompose(null); setRefresh(v=>v+1);
      if (compose === "space" && created) router.push(`/talk-about?space=${created.id}`);
      if (compose === "topic" && created) router.push(`/talk-about?topic=${created.id}`);
    } catch { setFormError("Plaatsen is niet gelukt. Je tekst is bewaard; controleer je verbinding en probeer opnieuw."); }
    finally { submitting.current=false; setBusy(false); }
  }
  async function remove(id: string, isTopic: boolean) {
    if (submitting.current) return;
    submitting.current=true; setBusy(true);
    try {
      const {error} = await createSupabaseBrowserClient().from(isTopic ? "talk_topics" : "talk_replies").delete().eq("id",id);
      if (error) throw error;
      setDeleteId(null); setRefresh(v=>v+1);
      if (isTopic) router.push("/talk-about");
    } catch { setError("Verwijderen is niet gelukt."); } finally { submitting.current=false; setBusy(false); }
  }
  function deletion(post: Post, isTopic: boolean) {
    if (!user || (post.author_id !== user.id && user.role !== "admin")) return null;
    return deleteId === post.id ? <div className="mt-3 flex flex-wrap gap-3 text-xs"><span>{isTopic ? "Topic en alle berichten verwijderen?" : "Bericht verwijderen?"}</span><button disabled={busy} onClick={()=>void remove(post.id,isTopic)} className="text-red-300">Verwijderen</button><button onClick={()=>setDeleteId(null)}>Annuleren</button></div> : <button onClick={()=>setDeleteId(post.id)} className="mt-3 text-xs text-neutral-500">Verwijderen</button>;
  }
  const visibleBooks = books.filter(b=>`${b.title} ${b.author}`.toLowerCase().includes(search.toLowerCase()));
  return <main className="min-h-screen bg-[#070a12] text-white"><AppNav title="Talk about" subtitle="Praat over jouw volgende verhaal"/>
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><Link href="/talk-about" className="text-xs font-bold uppercase tracking-widest text-cyan-300">DiBooks community</Link><h1 className="mt-2 text-4xl font-black">Talk about</h1><p className="mt-3 text-sm text-neutral-400">Lees mee, deel je theorieën en praat met lezers en auteurs.</p></div><div className="flex flex-wrap gap-2">{user?.role === "admin" && <button className={button} onClick={()=>setManageExclusive(v=>!v)} aria-expanded={manageExclusive}>Exclusive beheren</button>}{canCreateSubject && <button className={button} onClick={()=>start("space")}>+ Onderwerp</button>}{(topicId || selectedSpace) && <button className={button} onClick={()=>start(topicId ? "reply" : "topic")}>{topicId ? "+ Bericht" : "+ Topic"}</button>}</div></div>
      {manageExclusive && user?.role === "admin" && <ExclusiveManager key={user.id}/>}
      {!user && <p className="mb-6 rounded-xl border border-blue-300/15 bg-blue-500/5 p-4 text-sm">Iedereen kan meelezen. <button className="font-bold text-cyan-200 underline" onClick={()=>openDiBooksAuth("login")}>Log in</button> of <button className="font-bold text-cyan-200 underline" onClick={()=>openDiBooksAuth("register")}>maak een account</button> om mee te praten.</p>}
      <div className="grid items-start gap-8 lg:grid-cols-[250px_1fr]">
        <aside className="space-y-6"><Link href="/talk-about" className={button}>Forumoverzicht</Link><section><h2 className="mb-3 mt-5 font-bold">Boeken</h2><input aria-label="Zoek een boek" className={field} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Zoek titel of auteur"/><div className="mt-3 max-h-80 space-y-2 overflow-y-auto">{visibleBooks.map(b=><Link key={b.id} href={`/talk-about?book=${b.id}`} className={`flex items-center gap-3 rounded-xl p-2 ${bookId===b.id ? "bg-blue-500/20" : "hover:bg-white/5"}`}>{b.coverImage && <img src={b.coverImage} alt="" className="h-14 w-9 rounded object-cover"/>}<span className="min-w-0"><span className="block text-sm font-bold">{b.title}</span><span className="text-xs text-neutral-400">{b.author}</span></span></Link>)}{!visibleBooks.length && !loading && <p className="text-sm text-neutral-500">Geen boeken gevonden.</p>}</div></section>
          <section><h2 className="mb-3 font-bold">Onderwerpen</h2><div className="max-h-64 space-y-2 overflow-y-auto">{spaces.map(s=><Link key={s.id} className={`block rounded-xl p-3 text-sm ${spaceId===s.id ? "bg-cyan-500/15" : "bg-white/5"}`} href={`/talk-about?space=${s.id}`}>{s.title}</Link>)}{!spaces.length && !loading && <p className="text-sm text-neutral-500">Er zijn nog geen onderwerpen.</p>}</div></section></aside>
        <div className="min-w-0 space-y-6">
          {compose && user && <form onSubmit={submit} className="space-y-4 rounded-2xl border border-cyan-300/25 bg-[#0d1421] p-5"><h2 className="text-xl font-bold">{compose === "space" ? "Nieuw onderwerp" : compose === "topic" ? "Nieuw topic" : "Nieuw bericht"}</h2><fieldset disabled={busy} className="space-y-4">
            {compose!=="reply" && <label className="block text-sm">Titel <input required minLength={3} maxLength={compose==="space" ? 80 : 160} value={title} onChange={e=>setTitle(e.target.value)} className={`${field} mt-2`}/><span className="text-xs text-neutral-400">Houd spoilers uit de titel.</span></label>}
            <label className="block text-sm">{compose==="space" ? "Beschrijving" : "Bericht"}<textarea required={compose!=="space"} maxLength={compose==="space" ? 500 : 8000} rows={5} value={body} onChange={e=>setBody(e.target.value)} className={`${field} mt-2`}/></label>
            {compose==="topic" && <fieldset className="text-sm"><legend>Boeken taggen ({tags.length}/5)</legend><div className="mt-2 max-h-44 space-y-2 overflow-y-auto rounded-xl border border-white/15 p-3">{books.map(b=><label key={b.id} className="flex items-center gap-2"><input type="checkbox" checked={tags.includes(b.id)} disabled={!tags.includes(b.id) && tags.length >= 5} onChange={e=>setTags(current=>e.target.checked ? [...current,b.id] : current.filter(id=>id!==b.id))}/>{b.title}</label>)}</div></fieldset>}
            {compose!=="space" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={spoilers} onChange={e=>setSpoilers(e.target.checked)}/>Bevat spoilers</label>}
            {formError && <p role="alert" className="text-sm text-red-300">{formError}</p>}<div className="flex gap-3"><button className={button} type="submit">{busy ? "Plaatsen…" : "Plaatsen"}</button><button type="button" onClick={()=>setCompose(null)}>Annuleren</button></div>
          </fieldset></form>}
          {loading ? <p role="status">Gesprekken laden…</p> : error ? <div role="alert"><p>{error}</p><button className={`${button} mt-3`} onClick={()=>setRefresh(v=>v+1)}>Opnieuw proberen</button></div> : <>
            {bookId && !selectedBook ? <p>Dit boek staat niet meer in de openbare library.</p> : spaceId && !selectedSpace ? <p>Onderwerp niet gevonden.</p> : <>
              {selectedBook && <section className="flex items-center gap-5 rounded-2xl border border-white/10 bg-white/[0.03] p-5">{selectedBook.coverImage && <img src={selectedBook.coverImage} alt="" className="w-20 rounded-lg"/>}<div><h2 className="text-2xl font-bold">{selectedBook.title}</h2><p className="text-neutral-400">{selectedBook.author}</p><Link className="mt-2 inline-block text-sm text-cyan-200" href={`/books/${selectedBook.id}`}>Naar boekpagina →</Link></div></section>}
              {selectedSpace && <div><h2 className="text-2xl font-bold">{selectedSpace.title}</h2><p className="mt-2 break-words text-sm text-neutral-400">{selectedSpace.description}</p></div>}
              {!bookId && !spaceId && !topicId ? <section className="space-y-3"><h2 className="text-2xl font-bold">Onderwerpen</h2><p className="text-sm text-neutral-400">Kies een onderwerp om topics te lezen of een eigen topic te starten.</p>{spaces.map(s=><Link key={s.id} href={`/talk-about?space=${s.id}`} className="block rounded-2xl border border-white/10 bg-white/[0.03] p-5 hover:border-cyan-300/30"><h3 className="text-xl font-bold">{s.title}</h3><p className="mt-2 text-sm text-neutral-400">{s.description}</p><span className="mt-3 block text-xs text-cyan-200">Bekijk topics →</span></Link>)}{!spaces.length && <p className="text-neutral-400">Een admin of Exclusive-gebruiker kan het eerste onderwerp maken.</p>}</section> : topic ? <><article className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">{topic.space_id && <Link className="mb-3 block text-sm text-cyan-200" href={`/talk-about?space=${topic.space_id}`}>← {spaces.find(s=>s.id===topic.space_id)?.title || "Naar onderwerp"}</Link>}<p className="text-xs text-neutral-400">{topic.author_name}</p><h2 className="mt-2 break-words text-2xl font-bold">{topic.title}</h2><div className="mt-3 flex flex-wrap gap-2">{topic.book_ids?.map(id=>{const b=books.find(b=>b.id===id);return b ? <Link key={id} className="rounded-full bg-blue-500/15 px-3 py-1 text-xs text-blue-200" href={`/talk-about?book=${id}`}>#{b.title}</Link>:null;})}</div><PostBody key={topic.id} post={topic}/>{deletion(topic,true)}</article><h3 className="text-xl font-bold">Berichten</h3>{!replies.length && <p className="text-sm text-neutral-400">Nog geen berichten op deze pagina.</p>}{replies.map(r=><article key={r.id} className="rounded-2xl border border-white/10 p-5"><p className="text-sm font-bold">{r.author_name}</p><PostBody post={r}/>{deletion(r,false)}</article>)}<button className={button} onClick={()=>start("reply")}>Bericht plaatsen</button></> : <><h2 className="text-xl font-bold">Topics</h2>{!topics.length && <p className="text-sm text-neutral-400">Nog geen topics op deze pagina.</p>}{topics.map(t=><Link key={t.id} href={`/talk-about?topic=${t.id}`} className="block rounded-2xl border border-white/10 bg-white/[0.025] p-5 hover:border-cyan-300/30"><span className="text-xs text-neutral-400">{t.author_name}{t.contains_spoilers ? " · ⚠ Spoilers" : ""}</span><h3 className="mt-2 break-words text-lg font-bold">{t.title}</h3><span className="mt-2 block text-xs text-blue-200">Open gesprek →</span></Link>)}</>}
              <div className="flex gap-4">{offset>0 && <button className={button} onClick={()=>setOffset(v=>Math.max(0,v-30))}>← Vorige</button>}{(bookId || spaceId || topicId) && (topic ? replies : topics).length===30 && <button className={button} onClick={()=>setOffset(v=>v+30)}>Volgende →</button>}</div>
              {selectedBook && <TalkBookReviews key={selectedBook.id} bookId={selectedBook.id}/>}
            </>}
          </>}
        </div>
      </div>
    </div>
  </main>;
}
export default function TalkAboutPage() { return <Suspense fallback={<main className="min-h-screen bg-[#070a12] p-8 text-white">Talk about laden…</main>}><TalkContent/></Suspense>; }


