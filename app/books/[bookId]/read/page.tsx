"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { books } from "@/lib/books";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type MiniGameDifficulty = "easy" | "normal" | "hard";
type ReaderNodeType = "text" | "special" | "cutscene" | "choice" | "minigame";

type ReaderChoice = {
  label: string;
  targetNodeId?: string;
};

type ReaderNode = {
  id: string;
  type: ReaderNodeType;
  title: string;
  text: string;
  textHtml: string;
  specialSubtype?: string;
  videoUrl?: string;
  videoFileName?: string;
  videoDuration?: number;
  choices: ReaderChoice[];
  miniGameType?: string;
  miniGameDuration?: number;
  miniGameDifficulty?: MiniGameDifficulty;
  miniGameAllowRetry?: boolean;
  miniGameSuccessTargetNodeId?: string;
  miniGameFailTargetNodeId?: string;
};

type ReaderEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  data?: any;
};

type ReaderBook = {
  id: string;
  title: string;
  author: string;
  subtitle?: string;
  description?: string;
  startNodeId: string;
  nodes: ReaderNode[];
  edges: ReaderEdge[];
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; book: ReaderBook };

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function slugFallbackTitle(value: string | undefined) {
  if (!value) return "DiBooks verhaal";
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeNode(rawNode: any): ReaderNode {
  const data = rawNode?.data ?? {};
  const content = rawNode?.content ?? {};
  const type = (data.type ?? rawNode?.type ?? "text") as ReaderNodeType;
  const title = data.label ?? rawNode?.title ?? rawNode?.label ?? "Onbekende node";
  const text = data.text ?? content.text ?? rawNode?.text ?? "";
  const textHtml = data.textHtml ?? content.textHtml ?? rawNode?.textHtml ?? text ?? "";

  return {
    id: rawNode.id,
    type,
    title,
    text,
    textHtml,
    specialSubtype: data.specialSubtype ?? content.specialSubtype ?? rawNode?.specialSubtype,
    videoUrl: data.videoUrl ?? content.videoUrl ?? rawNode?.videoUrl ?? "",
    videoFileName: data.videoFileName ?? content.videoFileName ?? rawNode?.videoFileName ?? "",
    videoDuration: data.videoDuration ?? content.videoDuration ?? rawNode?.videoDuration ?? 0,
    choices: data.choices ?? content.choices ?? rawNode?.choices ?? [],
    miniGameType: data.miniGameType ?? content.miniGameType ?? rawNode?.miniGameType ?? "",
    miniGameDuration: data.miniGameDuration ?? content.miniGameDuration ?? rawNode?.miniGameDuration ?? 5,
    miniGameDifficulty: data.miniGameDifficulty ?? content.miniGameDifficulty ?? rawNode?.miniGameDifficulty ?? "normal",
    miniGameAllowRetry: data.miniGameAllowRetry ?? content.miniGameAllowRetry ?? rawNode?.miniGameAllowRetry ?? true,
    miniGameSuccessTargetNodeId:
      data.miniGameSuccessTargetNodeId ?? content.miniGameSuccessTargetNodeId ?? rawNode?.miniGameSuccessTargetNodeId ?? "",
    miniGameFailTargetNodeId:
      data.miniGameFailTargetNodeId ?? content.miniGameFailTargetNodeId ?? rawNode?.miniGameFailTargetNodeId ?? "",
  };
}

function normalizeBook(rawProject: any, fallback: Partial<ReaderBook>): ReaderBook {
  const nodes = Array.isArray(rawProject?.nodes) ? rawProject.nodes.map(normalizeNode) : [];
  const edges = Array.isArray(rawProject?.edges)
    ? rawProject.edges.map((edge: any) => ({
        id: edge.id ?? `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        label: typeof edge.label === "string" ? edge.label : undefined,
        data: edge.data,
      }))
    : [];

  return {
    id: fallback.id ?? rawProject?.bookId ?? "unknown-book",
    title: fallback.title ?? rawProject?.bookTitle ?? rawProject?.title ?? "DiBooks verhaal",
    author: fallback.author ?? rawProject?.author ?? "Auteur",
    subtitle: fallback.subtitle ?? rawProject?.subtitle ?? "",
    description: fallback.description ?? rawProject?.description ?? "",
    startNodeId: rawProject?.startNodeId ?? nodes[0]?.id ?? "",
    nodes,
    edges,
  };
}

async function loadStaticBook(bookId: string) {
  const staticBook = books.find((book) => book.id === bookId);
  if (!staticBook?.storyFile) return null;

  const response = await fetch(staticBook.storyFile, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Story bestand kon niet geladen worden: ${response.status}`);
  }

  const rawProject = await response.json();
  return normalizeBook(rawProject, {
    id: staticBook.id,
    title: staticBook.title,
    author: staticBook.author,
    subtitle: staticBook.subtitle,
    description: staticBook.description,
  });
}

async function loadSupabaseBook(bookId: string) {
  const supabase = createSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("dashboard_books")
    .select("*")
    .eq("id", bookId)
    .eq("published", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  if (!data.project_data) {
    throw new Error("Dit boek is gepubliceerd, maar er is nog geen reader/project-data opgeslagen.");
  }

  return normalizeBook(data.project_data, {
    id: data.id,
    title: data.title,
    author: data.author,
    subtitle: data.subtitle,
    description: data.description,
  });
}

function paginateTextHtml(html: string, maxCharacters = 1450) {
  const plainText = stripHtml(html);
  if (!plainText) return ["<p>Deze pagina is nog leeg.</p>"];

  if (plainText.length <= maxCharacters) return [html || `<p>${escapeHtml(plainText)}</p>`];

  const paragraphs = plainText.split(/\n{2,}/).filter(Boolean);
  const chunks = paragraphs.length > 1 ? paragraphs : plainText.match(/[^.!?…]+[.!?…"]*|.+$/g) ?? [plainText];
  const pages: string[] = [];
  let current = "";

  chunks.forEach((chunk) => {
    const cleanChunk = chunk.trim();
    if (!cleanChunk) return;

    const next = current ? `${current} ${cleanChunk}` : cleanChunk;
    if (next.length > maxCharacters && current) {
      pages.push(`<p>${escapeHtml(current)}</p>`);
      current = cleanChunk;
      return;
    }

    if (cleanChunk.length > maxCharacters) {
      const words = cleanChunk.split(/\s+/);
      words.forEach((word) => {
        const nextWord = current ? `${current} ${word}` : word;
        if (nextWord.length > maxCharacters && current) {
          pages.push(`<p>${escapeHtml(current)}</p>`);
          current = word;
        } else {
          current = nextWord;
        }
      });
      return;
    }

    current = next;
  });

  if (current) pages.push(`<p>${escapeHtml(current)}</p>`);
  return pages.length ? pages : ["<p>Deze pagina is nog leeg.</p>"];
}

function StabilizeLineMiniGame({
  node,
  onSuccess,
  onFail,
}: {
  node: ReaderNode;
  onSuccess: () => void;
  onFail: () => void;
}) {
  const [result, setResult] = useState<"success" | "fail" | null>(null);
  const [progress, setProgress] = useState(0);
  const [running, setRunning] = useState(false);
  const timerRef = useRef<number | null>(null);
  const duration = Math.max(3, Math.min(12, node.miniGameDuration ?? 5));

  useEffect(() => {
    if (!running || result) return;

    const startTime = Date.now();
    timerRef.current = window.setInterval(() => {
      const nextProgress = Math.min(100, ((Date.now() - startTime) / (duration * 1000)) * 100);
      setProgress(nextProgress);
      if (nextProgress >= 100) {
        setResult("success");
        setRunning(false);
      }
    }, 80);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [duration, result, running]);

  function reset() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setProgress(0);
    setResult(null);
    setRunning(false);
  }

  return (
    <div className="mx-auto flex h-full max-w-4xl flex-col justify-center p-5">
      <div className="rounded-[2rem] border border-purple-500/25 bg-purple-950/25 p-6 shadow-2xl sm:p-8">
        <p className="text-xs font-black uppercase tracking-[0.28em] text-purple-300">Mini game</p>
        <h1 className="mt-3 text-3xl font-black sm:text-5xl">{node.title}</h1>
        <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-neutral-300">
          Houd het signaal stabiel tot de balk vol is. Deze v1-reader gebruikt een simpele speelbare versie; later koppelen we hier dezelfde volledige minigame aan als in de Studio-preview.
        </p>

        <div className="mt-8 rounded-3xl border border-purple-400/20 bg-black/40 p-5">
          <div className="h-6 overflow-hidden rounded-full bg-neutral-800">
            <div className="h-full bg-cyan-300 transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-3 flex justify-between text-xs font-black uppercase tracking-widest text-neutral-500">
            <span>Signal</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {!running && !result && (
            <button onClick={() => setRunning(true)} className="rounded-2xl bg-cyan-400 px-6 py-4 font-black text-black hover:bg-cyan-300">
              Start mini game
            </button>
          )}

          {result === "success" && (
            <button onClick={onSuccess} className="rounded-2xl bg-emerald-500 px-6 py-4 font-black text-white hover:bg-emerald-400">
              Gelukt — ga verder
            </button>
          )}

          {result === "fail" && (
            <button onClick={onFail} className="rounded-2xl bg-red-600 px-6 py-4 font-black text-white hover:bg-red-500">
              Mislukt — ga verder
            </button>
          )}

          <button onClick={() => setResult("fail")} className="rounded-2xl border border-red-400/25 bg-red-500/10 px-6 py-4 font-black text-red-100 hover:bg-red-500/20">
            Forceer fail route
          </button>

          {(node.miniGameAllowRetry ?? true) && (running || result) && (
            <button onClick={reset} className="rounded-2xl border border-white/10 bg-white/5 px-6 py-4 font-black text-white hover:bg-white/10">
              Opnieuw
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ReadBookPage() {
  const params = useParams<{ bookId: string }>();
  const bookId = String(params?.bookId ?? "");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [currentNodeId, setCurrentNodeId] = useState<string>("");
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadBook() {
      setLoadState({ status: "loading" });

      try {
        const staticBook = await loadStaticBook(bookId);
        const book = staticBook ?? (await loadSupabaseBook(bookId));

        if (!active) return;

        if (!book) {
          setLoadState({ status: "error", message: "Dit boek is niet gevonden of staat nog niet live." });
          return;
        }

        if (!book.nodes.length || !book.startNodeId) {
          setLoadState({ status: "error", message: "Dit boek heeft nog geen geldige start-node." });
          return;
        }

        setLoadState({ status: "ready", book });
        setCurrentNodeId(book.startNodeId);
        setPageIndex(0);
      } catch (error: any) {
        console.error(error);
        if (!active) return;
        setLoadState({
          status: "error",
          message: error?.message ?? "Dit boek kon niet geladen worden.",
        });
      }
    }

    loadBook();

    return () => {
      active = false;
    };
  }, [bookId]);

  const reader = useMemo(() => {
    if (loadState.status !== "ready") return null;
    const { book } = loadState;
    const node = book.nodes.find((item) => item.id === currentNodeId) ?? book.nodes.find((item) => item.id === book.startNodeId) ?? book.nodes[0];
    if (!node) return null;

    const textNodes: ReaderNode[] = [];
    const htmlParts: string[] = [];
    const visited = new Set<string>();
    let cursor: ReaderNode | undefined = node;
    let nextNodeAfterChain: ReaderNode | null = null;

    while (cursor && (cursor.type === "text" || cursor.type === "special") && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      textNodes.push(cursor);
      const nodeHtml = cursor.textHtml || cursor.text || "Deze tekst-node is nog leeg.";
      const className = cursor.type === "special" ? "dibooks-special-page" : "dibooks-reader-section";
      htmlParts.push(`<section class="${className}">${nodeHtml}</section>`);

      const outgoing = book.edges.filter((edge) => edge.source === cursor!.id);
      if (outgoing.length !== 1) break;
      const maybeNext = book.nodes.find((item) => item.id === outgoing[0].target);
      if (!maybeNext) break;
      if (maybeNext.type !== "text" && maybeNext.type !== "special") {
        nextNodeAfterChain = maybeNext;
        break;
      }
      cursor = maybeNext;
    }

    const lastTextNode = textNodes[textNodes.length - 1];
    const branchPaths = lastTextNode ? book.edges.filter((edge) => edge.source === lastTextNode.id) : [];

    return {
      book,
      node,
      textHtml: htmlParts.join(""),
      textNodes,
      nextNodeAfterChain,
      branchPaths,
      outgoingPaths: book.edges.filter((edge) => edge.source === node.id),
    };
  }, [currentNodeId, loadState]);

  const textPages = useMemo(() => {
    if (!reader?.textHtml) return [];
    return paginateTextHtml(reader.textHtml, 1500);
  }, [reader?.textHtml]);

  function goToNode(nodeId: string) {
    if (loadState.status !== "ready") return;
    const exists = loadState.book.nodes.some((node) => node.id === nodeId);
    if (!exists) {
      alert("Deze doel-node bestaat niet meer.");
      return;
    }

    setCurrentNodeId(nodeId);
    setPageIndex(0);
  }

  if (loadState.status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070d] p-5 text-white">
        <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-8 text-center shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.32em] text-blue-300">DiBooks Reader</p>
          <h1 className="mt-3 text-4xl font-black">Boek laden...</h1>
        </div>
      </main>
    );
  }

  if (loadState.status === "error" || !reader) {
    const errorMessage =
      loadState.status === "error"
        ? loadState.message
        : "De reader kon geen geldige start-node of boekdata vinden.";

    return (
      <main className="flex min-h-screen items-center justify-center bg-[#05070d] p-5 text-white">
        <div className="max-w-2xl rounded-3xl border border-red-500/25 bg-red-500/10 p-8 text-center shadow-2xl">
          <p className="text-sm font-black uppercase tracking-[0.32em] text-red-200">Reader fout</p>
          <h1 className="mt-3 text-4xl font-black">Kan boek niet openen</h1>
          <p className="mt-4 text-sm font-semibold leading-6 text-red-100/85">{errorMessage}</p>
          <Link href={`/books/${bookId}`} className="mt-6 inline-flex rounded-2xl bg-white px-5 py-3 font-black text-black hover:bg-neutral-200">
            Terug naar boekpagina
          </Link>
        </div>
      </main>
    );
  }

  const { book, node } = reader;
  const isTextNode = node.type === "text" || node.type === "special";
  const canGoPreviousPage = isTextNode && pageIndex > 0;
  const canGoNextPage = isTextNode && pageIndex < textPages.length - 1;
  const visiblePage = textPages[pageIndex] ?? "<p>Deze pagina is nog leeg.</p>";

  return (
    <main className="flex h-screen flex-col overflow-hidden bg-[#05070d] text-white">
      <header className="shrink-0 border-b border-white/10 bg-[#05070d]/90 px-4 py-3 backdrop-blur-xl sm:px-6">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-300">DiBooks Reader</p>
            <h1 className="truncate text-xl font-black sm:text-2xl">{book.title}</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href={`/books/${book.id}`} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-neutral-200 hover:bg-white/10">
              Boekinfo
            </Link>
            <Link href="/" className="rounded-full border border-white/10 px-4 py-2 text-xs font-black text-neutral-200 hover:bg-white/10">
              Library
            </Link>
          </div>
        </div>
      </header>

      <section className="min-h-0 flex-1 overflow-hidden">
        {isTextNode && (
          <div className="mx-auto flex h-full max-w-5xl flex-col p-3 sm:p-6">
            <article className="min-h-0 flex-1 overflow-y-auto rounded-[2rem] border border-white/10 bg-neutral-950/95 px-7 py-8 shadow-2xl sm:px-12 sm:py-10 md:px-16">
              <div
                className="dibooks-reader-content prose prose-invert max-w-none text-[18px] leading-8 sm:text-[20px] sm:leading-9 [&_p]:mb-6 [&_p]:mt-0 [&_h1]:mb-5 [&_h1]:mt-0 [&_h2]:mb-4 [&_h2]:mt-0"
                dangerouslySetInnerHTML={{ __html: visiblePage }}
              />
            </article>
          </div>
        )}

        {node.type === "cutscene" && (
          <div className="flex h-full items-center justify-center bg-black p-4 sm:p-6">
            {node.videoUrl ? (
              <div className="w-full max-w-6xl">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-green-300">Cutscene</p>
                <h1 className="mb-4 mt-2 text-3xl font-black">{node.title}</h1>
                <video src={node.videoUrl} controls playsInline autoPlay className="max-h-[72vh] w-full rounded-3xl bg-black object-contain shadow-2xl" />
              </div>
            ) : (
              <div className="rounded-3xl border border-red-500/25 bg-red-500/10 p-6 text-red-100">Deze cutscene heeft nog geen video.</div>
            )}
          </div>
        )}

        {node.type === "choice" && (
          <div className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-4 p-6">
            <div className="rounded-[2rem] border border-orange-500/20 bg-orange-950/20 p-7 shadow-2xl sm:p-9">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">Keuze moment</p>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">{node.title}</h1>
              <div className="mt-8 grid gap-3">
                {node.choices
                  .slice(0, 3)
                  .filter((choice) => choice.label?.trim())
                  .map((choice, index) => (
                    <button
                      key={`${choice.label}-${index}`}
                      onClick={() => choice.targetNodeId && goToNode(choice.targetNodeId)}
                      disabled={!choice.targetNodeId}
                      className="rounded-2xl border border-orange-400/25 bg-orange-500/15 px-5 py-4 text-left text-lg font-black text-orange-50 hover:bg-orange-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="mr-3 text-orange-300">{["A", "B", "C"][index]}.</span>
                      {choice.label}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}

        {node.type === "minigame" && (
          <StabilizeLineMiniGame
            node={node}
            onSuccess={() => {
              const targetId =
                node.miniGameSuccessTargetNodeId ||
                book.edges.find((edge) => edge.source === node.id && edge.data?.miniGameResult === "success")?.target;
              if (!targetId) {
                alert("Deze minigame heeft nog geen success route.");
                return;
              }
              goToNode(targetId);
            }}
            onFail={() => {
              const targetId =
                node.miniGameFailTargetNodeId ||
                book.edges.find((edge) => edge.source === node.id && edge.data?.miniGameResult === "fail")?.target;
              if (!targetId) {
                alert("Deze minigame heeft nog geen fail route.");
                return;
              }
              goToNode(targetId);
            }}
          />
        )}
      </section>

      <footer className="shrink-0 border-t border-white/10 bg-[#05070d]/95 px-4 py-3 sm:px-6">
        {isTextNode ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
              disabled={!canGoPreviousPage}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-black text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
            >
              Vorige pagina
            </button>

            <div className="text-center text-sm font-bold text-neutral-400">
              <div>Pagina {pageIndex + 1} van {Math.max(1, textPages.length)}</div>
              <div className="text-xs text-neutral-600">{book.author}</div>
            </div>

            {canGoNextPage && (
              <button onClick={() => setPageIndex((current) => current + 1)} className="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-500">
                Volgende pagina
              </button>
            )}

            {!canGoNextPage && reader.nextNodeAfterChain && (
              <button onClick={() => goToNode(reader.nextNodeAfterChain!.id)} className="rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white hover:bg-emerald-500">
                Ga verder
              </button>
            )}

            {!canGoNextPage && !reader.nextNodeAfterChain && reader.branchPaths.length > 0 && (
              <div className="flex flex-wrap justify-end gap-3">
                {reader.branchPaths.map((edge, index) => {
                  const targetNode = book.nodes.find((item) => item.id === edge.target);
                  return (
                    <button key={edge.id} onClick={() => goToNode(edge.target)} className="rounded-2xl bg-emerald-600 px-5 py-3 text-left font-black text-white hover:bg-emerald-500">
                      {edge.label ? `${edge.label}: ` : reader.branchPaths.length > 1 ? `Optie ${index + 1}: ` : "Ga verder naar "}
                      {targetNode?.title ?? "volgende scène"}
                    </button>
                  );
                })}
              </div>
            )}

            {!canGoNextPage && !reader.nextNodeAfterChain && reader.branchPaths.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-black text-neutral-300">Einde bereikt</div>
            )}
          </div>
        ) : node.type !== "choice" && node.type !== "minigame" ? (
          <div className="flex flex-wrap justify-end gap-3">
            {reader.outgoingPaths.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-black text-neutral-300">Einde bereikt</div>}
            {reader.outgoingPaths.map((edge) => {
              const targetNode = book.nodes.find((item) => item.id === edge.target);
              return (
                <button key={edge.id} onClick={() => goToNode(edge.target)} className="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-500">
                  Ga verder naar {targetNode?.title ?? "volgende scène"}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-xs font-black uppercase tracking-widest text-neutral-600">Interactieve scène</div>
        )}
      </footer>
    </main>
  );
}
