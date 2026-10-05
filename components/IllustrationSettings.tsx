"use client";
import {useState} from "react";
import IllustrationSpread,{type IllustrationData} from "@/components/IllustrationSpread";
export default function IllustrationSettings({data,text,onChange}:{data:IllustrationData;text:string;onChange:(patch:Partial<IllustrationData>)=>void}){
 const [layout,setLayout]=useState<"single"|"double">("double");
 return <section className="space-y-4 rounded-xl border border-amber-400/20 p-4">
 <h3 className="font-bold text-amber-200">Illustratiespread</h3>
 <label className="block text-sm">Plaats afbeelding<select className="mt-2 block w-full rounded-lg bg-neutral-900 p-3" value={data.illustrationSide??"right"} onChange={e=>onChange({illustrationSide:e.target.value as "left"|"right"})}><option value="right">Afbeelding rechts · tekst links</option><option value="left">Afbeelding links · tekst rechts</option></select></label>
 <label className="flex gap-3 text-sm"><input type="checkbox" checked={data.illustrationMotion!==false} onChange={e=>onChange({illustrationMotion:e.target.checked})}/>Langzame beweging</label>
 <p className="text-xs text-neutral-400">Rustige zoom van 40 seconden. Dezelfde afbeelding blijft naast alle tekstpagina’s van deze node staan. Een volgende node vervangt de spread.</p>
 {([['illustrationFocusX','Focus horizontaal'],['illustrationFocusY','Focus verticaal']] as const).map(([key,label])=><label className="block text-sm" key={key}>{label}<input className="mt-2 block w-full" type="range" min="0" max="100" value={data[key]??50} onChange={e=>onChange({[key]:Number(e.target.value)})}/></label>)}
 <div className="flex flex-wrap gap-2">{(['double','single'] as const).map(mode=><button type="button" key={mode} aria-pressed={layout===mode} className="rounded-lg bg-white/10 px-3 py-2 text-sm" onClick={()=>setLayout(mode)}>{mode==='double'?'Dubbele pagina':'Enkele pagina / telefoon'}</button>)}</div>
 <div className="h-80 overflow-hidden rounded-xl border border-white/10"><IllustrationSpread data={data} previewLayout={layout}><div className="h-full overflow-auto whitespace-pre-wrap p-5 pb-16 text-sm leading-6">{text||'Je tekst verschijnt hier. Gebruik de grote teksteditor om deze scène te schrijven.'}</div></IllustrationSpread></div>
 <p className="text-xs text-neutral-400">Voorbeeld van de indeling. Gebruik Reader mode voor de volledige paginering. Bij enkele pagina’s wisselt de lezer met de knop rechtsonder tussen tekst en illustratie.</p>
 </section>;
}
