"use client";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

// Mount with a user/topic key so account changes cannot retain another user's preferences.
export default function TalkTopicPreferences({topicId,userId}:{topicId:string;userId:string}) {
  const [preference,setPreference] = useState<{is_following:boolean;is_muted:boolean}|null>(null);
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState("");
  const [reload,setReload] = useState(0);
  const saving = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current=true;
    let active=true;
    setPreference(null); setError("");
    void (async()=>{
      try {
        const {data,error} = await createSupabaseBrowserClient().from("talk_topic_preferences").select("is_following,is_muted").eq("topic_id",topicId).eq("user_id",userId).maybeSingle();
        if(error) throw error;
        if(active) setPreference(data ?? {is_following:false,is_muted:false});
      } catch { if(active) setError("Topicvoorkeuren konden niet worden geladen."); }
    })();
    return ()=>{active=false;mounted.current=false;};
  },[topicId,userId,reload]);
  async function update(action:"follow"|"mute", enabled:boolean) {
    if(saving.current || !preference) return;
    saving.current=true;setBusy(true);setError("");
    try {
      const {error}=await createSupabaseBrowserClient().rpc("talk_set_preference",{input_topic:topicId,input_action:action,input_enabled:enabled});
      if(error) throw error;
      if(mounted.current) setPreference(p=>p ? {...p,[action==="follow"?"is_following":"is_muted"]:enabled} : p);
    } catch { if(mounted.current) setError("Opslaan is niet gelukt. Probeer het opnieuw."); }
    finally {saving.current=false;if(mounted.current)setBusy(false);}
  }
  const button="rounded-xl border border-cyan-300/25 px-4 py-2 text-sm font-bold text-cyan-100 hover:bg-cyan-500/10 disabled:opacity-40";
  return <section aria-label="Topic volgen en meldingen" className="mt-4 space-y-3 border-t border-white/10 pt-4">
    {preference ? <><div className="flex flex-wrap gap-2">
      <button type="button" className={button} disabled={busy} aria-pressed={preference.is_following} onClick={()=>void update("follow",!preference.is_following)}>{preference.is_following?"Niet meer volgen":"Topic volgen"}</button>
      <button type="button" className={button} disabled={busy} aria-pressed={preference.is_muted} onClick={()=>void update("mute",!preference.is_muted)}>{preference.is_muted?"Dempen opheffen":"Topic dempen"}</button>
    </div><p role="status" className="text-xs leading-5 text-neutral-400">{preference.is_muted?"Gedempt: geen nieuwe meldingen uit dit topic, ook niet bij reacties op jouw berichten.":preference.is_following?"Je volgt dit topic en krijgt een melding bij nieuwe berichten van anderen.":"Je krijgt alleen meldingen wanneer iemand op jouw bericht reageert."}</p></> : !error && <p role="status" className="text-sm text-neutral-400">Voorkeuren laden…</p>}
    {error && <div role="alert" className="text-sm text-amber-200">{error}{!preference&&<button className="ml-3 underline" onClick={()=>setReload(v=>v+1)}>Opnieuw proberen</button>}</div>}
  </section>;
}
