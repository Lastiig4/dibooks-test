export type VisualEffectKind = 'fog' | 'shake' | 'alarm';
export type VisualEffect = {
    id: string;
    kind: VisualEffectKind;
    start: string;
    end: string;
    color: string;
    intensity: number;
};
export type EffectNodeData = {
    effectKind?: VisualEffectKind;
    effectStart?: string;
    effectEnd?: string;
    effectColor?: string;
    effectIntensity?: number;
};
export function readVisualEffects(project: {
    nodes?: any[];
    effects?: any[];
}): VisualEffect[] {
    const input = (Array.isArray(project.effects) ? project.effects : undefined) ?? (Array.isArray(project.nodes) ? project.nodes : []).filter(n => n && (n.data?.type ?? n.type) === 'effect').map(n => ({ id: n.id, ...(n.data ?? n.content ?? n) }));
    return input.flatMap(e => {
        if (!e || typeof e !== "object")
            return [];
        const kind = e.kind ?? e.effectKind, start = e.start ?? e.effectStart, end = e.end ?? e.effectEnd;
        if (!['fog', 'shake', 'alarm'].includes(kind) || typeof start !== 'string' || typeof end !== 'string' || !start || !end || start === end)
            return [];
        const color = e.color ?? e.effectColor;
        const amount = Number(e.intensity ?? e.effectIntensity ?? 0.35);
        return [{ id: String(e.id), kind, start, end, color: /^#[0-9a-f]{6}$/i.test(color) ? color : '#ef4444', intensity: Number.isFinite(amount) ? Math.max(0.1, Math.min(0.65, amount)) : 0.35 }];
    });
}
export function activeVisualEffects(effects: VisualEffect[], visited: string[], validIds?: Set<string>): VisualEffect[] { return effects.filter(e => { if (validIds && (!validIds.has(e.start) || !validIds.has(e.end)))
    return false; let on = false; for (const id of visited) {
    if (id === e.start)
        on = true;
    if (id === e.end)
        on = false;
} return on; }); }
export function isEffectBoundary(effects: VisualEffect[], id: string) { return effects.some(e => e.start === id || e.end === id); }
