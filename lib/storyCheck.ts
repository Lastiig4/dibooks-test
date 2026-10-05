export type CheckNode = { id: string; data: {
  effectStart?: string; effectEnd?: string; effectKind?: string;
  text?: string; textHtml?: string;
  type: string; label: string; intentionalEnd?: boolean;
  imageUrl?: string; videoUrl?: string; videoStoragePath?: string;
  choices?: { label: string; targetNodeId?: string }[];
  conditionTrueTargetNodeId?: string; conditionFalseTargetNodeId?: string;
  miniGameSuccessTargetNodeId?: string; miniGameFailTargetNodeId?: string;
} };
export type StoryIssue = { id: string; severity: "error" | "warning"; message: string; nodeId?: string; canMarkEnd?: boolean };

export function checkStory(nodes: CheckNode[], edges: { source: string; target: string }[], startId: string | null): StoryIssue[] {
  const story = nodes.filter(n => n.data.type !== "scratchpad" && n.data.type !== "effect");
  const ids = new Set(story.map(n => n.id));
  const issues: StoryIssue[] = [];
  const graph = new Map<string, string[]>();
  const add = (id: string, severity: StoryIssue["severity"], message: string, nodeId?: string, canMarkEnd = false) => issues.push({ id, severity, message, nodeId, canMarkEnd });
  for (const node of nodes.filter(n => n.data.type === "effect")) {
    const {effectStart, effectEnd, effectKind} = node.data;
    if (!effectKind || !["fog", "shake", "alarm"].includes(effectKind))
      add(node.id + ":effect-kind", "error", "Kies een geldig effect: mist, schuddend scherm of alarmlichten.", node.id);
    if (!effectStart || !effectEnd || !ids.has(effectStart) || !ids.has(effectEnd) || effectStart === effectEnd)
      add(node.id + ":effect", "error", "Kies twee verschillende, bestaande verhaalnodes als begin en einde van het effect.", node.id);
  }
  if (!startId || !ids.has(startId)) add("start", "error", "Een geldige start-node ontbreekt.");
  for (const edge of edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      add(`edge:${edge.source}:${edge.target}`, "error", "Een path verwijst naar een ontbrekende node of een kladblok/effect-node.", ids.has(edge.source) ? edge.source : ids.has(edge.target) ? edge.target : undefined);
    }
  }
  for (const node of story) {
    const d = node.data;
    let routes: { label: string; target?: string }[];
    if (d.type === "choice") {
      routes = (d.choices ?? []).map((c, i) => ({ label: `Keuze ${i + 1}`, target: c.targetNodeId }));
      if (!routes.length) add(`${node.id}:choices`, "error", "Deze keuze-node heeft geen keuzes.", node.id);
      (d.choices ?? []).forEach((c, i) => { if (!c.label.trim()) add(`${node.id}:label:${i}`, "warning", `Keuze ${i + 1} heeft nog geen tekst.`, node.id); });
    } else if (d.type === "condition") {
      routes = [{ label: "Waar-route", target: d.conditionTrueTargetNodeId }, { label: "Onwaar-route", target: d.conditionFalseTargetNodeId }];
    } else if (d.type === "minigame") {
      routes = [{ label: "Succes-route", target: d.miniGameSuccessTargetNodeId }, { label: "Mislukt-route", target: d.miniGameFailTargetNodeId }];
    } else {
      routes = edges.filter(e => e.source === node.id).map(e => ({ label: "Path", target: e.target }));
      if (!routes.length && !d.intentionalEnd) add(`${node.id}:end`, "warning", "Hier stopt de route. Is dit een bewust einde?", node.id, true);
    }
    for (const [i, route] of routes.entries()) {
      if (!route.target || !ids.has(route.target)) add(`${node.id}:route:${i}`, "error", `${route.label} heeft geen geldige bestemming.`, node.id);
    }
    graph.set(node.id, routes.flatMap(r => r.target && ids.has(r.target) ? [r.target] : []));
    if ((d.type === "image" || d.type === "illustration") && !d.imageUrl?.trim()) add(`${node.id}:image`, "error", "Deze afbeeldingsnode heeft geen afbeelding.", node.id);
    if (d.type === "illustration") {
      const content = (d.textHtml || d.text || "").replace(/<[^>]*>/g, "").replace(/&nbsp;|&#160;|&#x0*a0;/gi, " ").replace(/[\s\u200b-\u200d\ufeff]/g, "");
      if (!content) add(node.id + ":illustration-text", "warning", "Deze illustratiespread heeft nog geen tekst voor de tekstpagina.", node.id);
    }
    if (d.type === "cutscene" && !d.videoUrl?.trim() && !d.videoStoragePath?.trim()) add(`${node.id}:video`, "error", "Deze cutscene heeft geen video.", node.id);
  }
  // Follow the same choice/condition/minigame routes as the structure check.
  // Stop at the configured endpoint: paths after it cannot keep this effect active.
  for (const node of nodes.filter(n => n.data.type === "effect")) {
    const { effectStart: start, effectEnd: end } = node.data;
    if (!start || !end || start === end || !ids.has(start) || !ids.has(end)) continue;
    const seen = new Set<string>();
    const queue = [start];
    let reachesEnd = false;
    let bypassesEnd = false;
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      if (id === end) { reachesEnd = true; continue; }
      if (seen.has(id)) continue;
      seen.add(id);
      const next = graph.get(id) ?? [];
      if (!next.length) bypassesEnd = true;
      for (const target of next) if (!seen.has(target)) queue.push(target);
    }
    if (!reachesEnd) add(node.id + ":effect-route", "warning", "Het eindpunt van dit effect is niet bereikbaar vanaf het beginpunt. Controleer de volgorde en de paths.", node.id);
    else if (bypassesEnd) add(node.id + ":effect-bypass", "warning", "Een route kan eindigen zonder het eindpunt van dit effect te passeren. Op die route blijft het effect actief.", node.id);
  }
  if (startId && ids.has(startId)) {
    const seen = new Set<string>();
    const queue = [startId];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      if (seen.has(id)) continue;
      seen.add(id);
      for (const next of graph.get(id) ?? []) if (!seen.has(next)) queue.push(next);
    }
    for (const node of story) if (!seen.has(node.id)) add(`${node.id}:unreachable`, "warning", "Niet bereikbaar vanaf de start-node.", node.id);
  }
  return issues.sort((a, b) => Number(a.severity === "warning") - Number(b.severity === "warning"));
}
