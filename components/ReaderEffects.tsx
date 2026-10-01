"use client";
import { useEffect, useRef, useState } from 'react';
import type { VisualEffect } from '@/lib/visualEffects';
export default function ReaderEffects({ effects }: {
    effects: VisualEffect[];
}) {
    const [disabled, setDisabled] = useState(false);
    const [reduced, setReduced] = useState(true);
    const root = useRef<HTMLDivElement>(null);
    useEffect(() => { const media = window.matchMedia('(prefers-reduced-motion: reduce)'); const sync = () => setReduced(media.matches); sync(); media.addEventListener('change', sync); try {
        setDisabled(localStorage.getItem('dibooks-effects-disabled') === 'true');
    }
    catch { } return () => media.removeEventListener('change', sync); }, []);
    const enabled = !disabled && !reduced;
    const shake = enabled && effects.some(e => e.kind === 'shake');
    useEffect(() => { const shell = root.current?.parentElement; if (shake)
        shell?.classList.add('dibooks-effects-shake'); return () => shell?.classList.remove('dibooks-effects-shake'); }, [shake]);
    function toggle() { setDisabled(v => { try {
        localStorage.setItem('dibooks-effects-disabled', String(!v));
    }
    catch { } return !v; }); }
    return <div ref={root} className="pointer-events-none absolute inset-0 z-20" aria-hidden={effects.length ? undefined : true}>{enabled && effects.filter((e, i, a) => a.findIndex(x => x.kind === e.kind) === i).map(e => e.kind === 'fog' ? <div key={e.id} aria-hidden="true" className="dibooks-fog absolute -inset-16" style={{ opacity: e.intensity, background: 'radial-gradient(ellipse at 20% 65%, #cbd5e1 0%, transparent 52%), radial-gradient(ellipse at 80% 35%, #e2e8f0 0%, transparent 50%)' }}/> : e.kind === 'alarm' ? <div key={e.id} aria-hidden="true" className="dibooks-alarm absolute inset-0" style={{ opacity: e.intensity, background: `radial-gradient(ellipse at top left, ${e.color}, transparent 35%),radial-gradient(ellipse at top right, ${e.color}, transparent 35%),radial-gradient(ellipse at bottom left, ${e.color}, transparent 35%),radial-gradient(ellipse at bottom right, ${e.color}, transparent 35%)` }}/> : null)}{effects.length > 0 && <button type="button" onClick={toggle} disabled={reduced} className="pointer-events-auto absolute bottom-20 right-3 rounded-full border border-white/20 bg-neutral-950/85 px-3 py-2 text-xs text-white" aria-pressed={!disabled && !reduced}>{reduced ? 'Effecten uit · minder beweging' : disabled ? 'Effecten aan' : 'Effecten uit'}</button>}</div>;
}
