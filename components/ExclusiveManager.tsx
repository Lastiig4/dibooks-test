"use client";
import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
type Member = {user_id:string; display_name:string; email:string; is_exclusive:boolean};
export default function ExclusiveManager() {
  const [search,setSearch]=useState("");
  const [rows,setRows]=useState<Member[]>([]);
  const [busy,setBusy]=useState(false);
  const pending=useRef(false);
  const [message,setMessage]=useState("");
  async function find(event: React.FormEvent) {
    event.preventDefault(); if(pending.current || search.trim().length<2) return;
    pending.current=true;setBusy(true);setMessage("");
    try {const {data,error}=await createSupabaseBrowserClient().rpc("talk_admin_find_members",{search_text:search.trim()});if(error)throw error;setRows(data??[]);setMessage(data?.length ? "Maximaal 30 resultaten. Verfijn je zoekopdracht indien nodig." : "Geen accounts gevonden.");}
    catch {setRows([]);setMessage("Accounts konden niet worden geladen.");}finally{pending.current=false;setBusy(false);}
  }
  async function toggle(member:Member) {
    if(pending.current)return;pending.current=true;setBusy(true);setMessage("");
    try {const {error}=await createSupabaseBrowserClient().rpc("talk_admin_set_exclusive",{target_user_id:member.user_id,enabled:!member.is_exclusive});if(error)throw error;setRows(current=>current.map(row=>row.user_id===member.user_id?{...row,is_exclusive:!row.is_exclusive}:row));setMessage(member.is_exclusive?"Exclusive-status ingetrokken. Bestaande gesprekken blijven behouden.":"Exclusive-status toegekend.");}
    catch{setMessage("Wijzigen is niet gelukt. Controleer je adminrechten.");}finally{pending.current=false;setBusy(false);}
  }
  return <section className="mb-6 rounded-2xl border border-amber-300/25 bg-amber-400/5 p-5"><h2 className="text-xl font-bold text-amber-200">Exclusive beheren</h2><p className="mt-2 text-sm text-neutral-400">Geef actieve auteurs toegang om forumonderwerpen te maken. Dit verandert hun abonnement niet.</p><form onSubmit={find} className="mt-4 flex flex-wrap gap-2"><input aria-label="Zoek account op naam of e-mail" required minLength={2} maxLength={100} value={search} onChange={e=>setSearch(e.target.value)} className="min-w-0 flex-1 rounded-xl border border-white/20 bg-neutral-950 p-3 text-sm" placeholder="Naam of e-mail"/><button disabled={busy} className="rounded-xl bg-white/10 px-4 py-2">Zoeken</button></form><p role="status" className="mt-3 text-sm">{message}</p><div className="mt-3 space-y-3">{rows.map(member=><div key={member.user_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-black/20 p-3"><div className="min-w-0"><p className="break-words font-bold">{member.display_name}</p><p className="break-all text-xs text-neutral-400">{member.email}</p></div><button disabled={busy} onClick={()=>void toggle(member)} className="rounded-lg border border-amber-300/30 px-3 py-2 text-sm text-amber-200">{member.is_exclusive?"Exclusive intrekken":"Exclusive toekennen"}</button></div>)}</div></section>;
}
