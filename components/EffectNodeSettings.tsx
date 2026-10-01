"use client";
import { useState } from 'react';
import type { EffectNodeData, VisualEffectKind } from '@/lib/visualEffects';
import ReaderEffects from '@/components/ReaderEffects';
export default function EffectNodeSettings({ data, nodes, onChange, onDelete }: {
    data: EffectNodeData & {
        label: string;
    };
    nodes: {
        id: string;
        label: string;
    }[];
    onChange: (patch: Partial<EffectNodeData> & {
        label?: string;
    }) => void;
    onDelete: () => void;
}) { const [preview, setPreview] = useState(false); const field = 'mt-2 w-full rounded-xl border border-white/15 bg-neutral-900 p-3 text-white'; return <div className="space-y-5"><label className="block text-sm font-bold">Titel<input className={field} value={data.label} onChange={e => onChange({ label: e.target.value })}/></label><label className="block text-sm font-bold">Effect<select className={field} value={data.effectKind ?? 'fog'} onChange={e => onChange({ effectKind: e.target.value as VisualEffectKind })}><option value="fog">Mist</option><option value="shake">Schuddend scherm</option><option value="alarm">Pulserende alarmlichten in vier hoeken</option></select></label>{(['effectStart', 'effectEnd'] as const).map(key => <label key={key} className="block text-sm font-bold">{key === 'effectStart' ? 'Begin bij node' : 'Stop bij node'}<select className={field} value={data[key] ?? ''} onChange={e => onChange({ [key]: e.target.value })}><option value="">Kies een node…</option>{nodes.map(n => <option key={n.id} value={n.id}>{n.label} · {n.id}</option>)}</select></label>)}<p className="text-sm leading-6 text-neutral-400">Begint zodra de lezer de beginnode bereikt. Bij de eindnode is het effect uit. Geen paths nodig voor deze regelnode. Kies twee verschillende nodes op de leesroute.</p>{data.effectStart === data.effectEnd && data.effectStart && <p className="text-amber-200">Begin en einde moeten verschillend zijn.</p>}{data.effectKind === 'alarm' && <label className="block text-sm font-bold">Kleur<input type="color" className="ml-3 h-10 w-16" value={data.effectColor ?? '#ef4444'} onChange={e => onChange({ effectColor: e.target.value })}/></label>}{data.effectKind !== 'shake' && <label className="block text-sm font-bold">Sterkte<input type="range" min="0.1" max="0.65" step="0.05" value={data.effectIntensity ?? 0.35} onChange={e => onChange({ effectIntensity: Number(e.target.value) })} className="mt-3 block w-full"/></label>}<button type="button" onClick={() => setPreview(v => !v)} className="rounded-xl bg-blue-600 px-4 py-3 font-bold">{preview ? 'Voorbeeld sluiten' : 'Effect bekijken'}</button>{preview && <div className="relative h-64 overflow-hidden rounded-xl bg-neutral-950"><div data-sfx-surface className="p-8 text-lg">Een voorbeeld van je leesscène. De tekst blijft leesbaar terwijl het effect op de achtergrond speelt.</div><ReaderEffects effects={[{ id: 'demo', kind: data.effectKind ?? 'fog', start: 'a', end: 'b', color: data.effectColor ?? '#ef4444', intensity: data.effectIntensity ?? 0.35 }]}/></div>}<button type="button" onClick={onDelete} className="block text-sm text-red-300">Effect-node verwijderen</button></div>; }
