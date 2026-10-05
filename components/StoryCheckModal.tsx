"use client";

import { useEffect, useRef } from "react";
import type { CheckNode, StoryIssue } from "@/lib/storyCheck";

export default function StoryCheckModal({ issues, nodes, locked, onClose, onJump, onEnd }: {
  issues: StoryIssue[]; nodes: CheckNode[]; locked: boolean;
  onClose: () => void; onJump: (id: string) => void; onEnd: (id: string, value: boolean) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const focus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog?.showModal();
    return () => { dialog?.close(); document.body.style.overflow = overflow; if (focus?.isConnected) focus.focus(); };
  }, []);
  const errors = issues.filter(i => i.severity === "error").length;
  const names = new Map(nodes.map(n => [n.id, n.data.label]));
  const endings = nodes.filter(n => n.data.intentionalEnd && n.data.type !== "scratchpad" && n.data.type !== "effect");
  return (
    <dialog ref={ref} onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="story-check-title" className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%_-_1rem)] max-w-3xl overflow-hidden rounded-2xl border border-amber-400/30 bg-[#090c13] p-0 text-white shadow-2xl backdrop:bg-black/75">
      <div className="flex max-h-[90dvh] flex-col">
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 p-5">
          <div><h2 id="story-check-title" className="text-xl font-bold text-amber-200">Verhaalcontrole</h2><p role="status" className="mt-1 text-sm text-neutral-300">{errors} fouten · {issues.length - errors} aandachtspunten</p></div>
          <button type="button" autoFocus onClick={onClose} className="rounded-lg bg-white/10 px-4 py-2 focus-visible:outline-2 focus-visible:outline-amber-300">Sluiten</button>
        </header>
        <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain p-5">
          <p className="text-sm text-neutral-400">De resultaten worden direct bijgewerkt. Kladblokken tellen niet mee. Illustraties worden op afbeelding en tekst gecontroleerd. Effect-nodes worden op instellingen en begin-/eindroutes gecontroleerd; ze tellen niet als verhaalpagina. Media worden gecontroleerd op aanwezigheid, niet op online bereikbaarheid. Voorwaarden worden niet uitgespeeld; mogelijke vertakkingen worden gevolgd.</p>
          {locked && <p className="text-sm text-amber-200">Alleen lezen: ontgrendel de editor om bewuste eindes te wijzigen.</p>}
          {!issues.length && <p className="rounded-xl bg-emerald-500/10 p-4 text-emerald-200">✓ Geen problemen gevonden in deze structuur- en mediacontrole. Speel je verhaal ook door in de preview.</p>}
          {issues.map(issue => <article key={issue.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <p className={`text-xs font-bold ${issue.severity === "error" ? "text-red-300" : "text-amber-200"}`}>{issue.severity === "error" ? "Fout" : "Aandachtspunt"}</p>
            {issue.nodeId && <h3 className="mt-1 break-words font-bold">{names.get(issue.nodeId) || issue.nodeId}</h3>}
            <p className="mt-1 text-sm text-neutral-300">{issue.message}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {issue.nodeId && <button type="button" onClick={() => onJump(issue.nodeId!)} className="rounded-lg bg-blue-500/20 px-3 py-2 text-sm text-blue-200">Ga naar node →</button>}
              {issue.canMarkEnd && issue.nodeId && <button type="button" disabled={locked} onClick={() => onEnd(issue.nodeId!, true)} className="rounded-lg border border-amber-300/30 px-3 py-2 text-sm text-amber-200 disabled:opacity-40">Dit is bewust een einde</button>}
            </div>
          </article>)}
          {endings.length > 0 && <section className="border-t border-white/10 pt-4"><h3 className="font-bold">Bewuste eindes</h3><p className="mb-2 text-xs text-neutral-400">Deze markering verandert de leesroutes niet.</p>{endings.map(n => <div key={n.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="break-words">{n.data.label}</span><button type="button" disabled={locked} onClick={() => onEnd(n.id, false)} className="rounded-lg bg-white/10 px-3 py-2 text-sm disabled:opacity-40">Markering opheffen</button></div>)}</section>}
        </div>
      </div>
    </dialog>
  );
}
