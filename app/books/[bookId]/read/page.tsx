"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getBookById, getBookDetailPath } from "@/lib/books";

type DiNodeType = "text" | "special" | "cutscene" | "choice" | "minigame";
type MiniGameDifficulty = "easy" | "normal" | "hard";

type DiNodeData = {
  label: string;
  type: DiNodeType;
  text?: string;
  textHtml?: string;
  specialSubtype?: string;
  videoUrl?: string;
  videoFileName?: string;
  videoDuration?: number;
  choices?: { label: string; targetNodeId?: string }[];
  miniGameType?: string;
  miniGameDuration?: number;
  miniGameDifficulty?: MiniGameDifficulty;
  miniGameAllowRetry?: boolean;
  miniGameSuccessTargetNodeId?: string;
  miniGameFailTargetNodeId?: string;
};

type DiNode = {
  id: string;
  type?: string;
  position?: { x: number; y: number };
  data: DiNodeData;
};

type ReaderTextSize = "small" | "normal" | "large";
type ReaderPageMode = "auto" | "single" | "double";
type ReaderTheme = "dark" | "light" | "sepia";

type DiEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
  data?: { choiceIndex?: number; miniGameResult?: "success" | "fail" | string };
};

type ProjectData = {
  bookTitle?: string;
  startNodeId?: string;
  nodes?: any[];
  edges?: DiEdge[];
};


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

function splitPlainTextIntoParagraphPages(text: string, maxCharacters: number) {
  const cleanText = text.trim();
  if (!cleanText) return ["<p>Deze tekst is nog leeg.</p>"];

  const words = cleanText.split(/\s+/);
  const pages: string[] = [];
  let current = "";

  words.forEach((word) => {
    const next = current ? `${current} ${word}` : word;

    if (next.length > maxCharacters && current) {
      pages.push(`<p>${escapeHtml(current)}</p>`);
      current = word;
      return;
    }

    current = next;
  });

  if (current) pages.push(`<p>${escapeHtml(current)}</p>`);
  return pages;
}

function paginateHtml(html: string, maxCharacters: number) {
  if (typeof window === "undefined") return ["<p>Deze tekst is nog leeg.</p>"];

  const safeMax = Math.max(450, maxCharacters);
  const container = document.createElement("div");
  container.innerHTML = html || "<p>Deze tekst is nog leeg.</p>";

  const pages: string[] = [];
  let currentHtml = "";
  let currentLength = 0;

  function pushCurrentPage() {
    if (!currentHtml.trim()) return;
    pages.push(currentHtml);
    currentHtml = "";
    currentLength = 0;
  }

  function appendBlock(blockHtml: string, blockLength: number) {
    if (currentLength + blockLength > safeMax && currentHtml.trim()) {
      pushCurrentPage();
    }

    currentHtml += blockHtml;
    currentLength += blockLength;
  }

  function splitLongTextIntoPages(text: string, tagName = "p") {
    const cleanText = text.trim();
    if (!cleanText) return;

    const sentences = cleanText.match(/[^.!?…]+[.!?…"]*|.+$/g) ?? [cleanText];
    let current = "";

    sentences.forEach((sentence) => {
      const trimmedSentence = sentence.trim();
      if (!trimmedSentence) return;

      const next = current ? `${current} ${trimmedSentence}` : trimmedSentence;

      if (next.length > safeMax && current) {
        pages.push(`<${tagName}>${escapeHtml(current)}</${tagName}>`);
        current = trimmedSentence;
        return;
      }

      if (trimmedSentence.length > safeMax) {
        if (current) {
          pages.push(`<${tagName}>${escapeHtml(current)}</${tagName}>`);
          current = "";
        }

        splitPlainTextIntoParagraphPages(trimmedSentence, safeMax).forEach((page) =>
          pages.push(page),
        );
        return;
      }

      current = next;
    });

    if (current) pages.push(`<${tagName}>${escapeHtml(current)}</${tagName}>`);
  }

  function flattenBlocks(parent: Element) {
    const blocks: HTMLElement[] = [];

    Array.from(parent.childNodes).forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent?.trim();
        if (text) {
          const paragraph = document.createElement("p");
          paragraph.textContent = text;
          blocks.push(paragraph);
        }
        return;
      }

      if (child.nodeType !== Node.ELEMENT_NODE) return;

      const element = child as HTMLElement;
      const tagName = element.tagName.toLowerCase();

      if (tagName === "section") {
        if (element.getAttribute("data-node-type") === "special") {
          blocks.push(element);
          return;
        }

        blocks.push(...flattenBlocks(element));
        return;
      }

      blocks.push(element);
    });

    return blocks;
  }

  const blocks = flattenBlocks(container);

  if (blocks.length === 0) {
    return splitPlainTextIntoParagraphPages(container.textContent || "", safeMax);
  }

  blocks.forEach((element) => {
    const tagName = element.tagName.toLowerCase();
    const elementLength = (element.textContent || "").trim().length;

    if (!elementLength && tagName !== "br") return;

    if (tagName === "section" && element.getAttribute("data-node-type") === "special") {
      pushCurrentPage();
      pages.push(element.outerHTML);
      currentHtml = "";
      currentLength = 0;
      return;
    }

    if (elementLength > safeMax) {
      pushCurrentPage();
      splitLongTextIntoPages(
        element.textContent || "",
        tagName === "h1" || tagName === "h2" || tagName === "h3" ? tagName : "p",
      );
      return;
    }

    appendBlock(element.outerHTML, elementLength);
  });

  pushCurrentPage();
  return pages.length > 0 ? pages : ["<p>Deze tekst is nog leeg.</p>"];
}

function normalizeProject(projectData: ProjectData) {
  const rawNodes = projectData.nodes ?? [];
  const nodes: DiNode[] = rawNodes.map((node: any) => {
    if (node.data) return node as DiNode;

    return {
      id: node.id,
      position: node.position,
      data: {
        label: node.title ?? node.id,
        type: node.type,
        text: node.content?.text ?? "",
        textHtml: node.content?.textHtml ?? node.content?.text ?? "",
        specialSubtype: node.content?.specialSubtype ?? "",
        videoUrl: node.content?.videoUrl ?? "",
        videoFileName: node.content?.videoFileName ?? "",
        videoDuration: node.content?.videoDuration ?? 0,
        choices: node.content?.choices ?? [],
        miniGameType: node.content?.miniGameType ?? "",
        miniGameDuration: node.content?.miniGameDuration ?? 5,
        miniGameDifficulty: node.content?.miniGameDifficulty ?? "normal",
        miniGameAllowRetry: node.content?.miniGameAllowRetry ?? true,
        miniGameSuccessTargetNodeId: node.content?.miniGameSuccessTargetNodeId ?? "",
        miniGameFailTargetNodeId: node.content?.miniGameFailTargetNodeId ?? "",
      },
    };
  });

  return {
    bookTitle: projectData.bookTitle || "The Sovereign",
    startNodeId: projectData.startNodeId || nodes[0]?.id || "",
    nodes,
    edges: projectData.edges ?? [],
  };
}

function BookPageReader({
  html,
  pageIndex,
  setPageIndex,
  onPageCountChange,
  onVisiblePageCountChange,
  textSize,
  pageMode,
  theme,
}: {
  html: string;
  pageIndex: number;
  setPageIndex: React.Dispatch<React.SetStateAction<number>>;
  onPageCountChange: (pageCount: number) => void;
  onVisiblePageCountChange: (visiblePageCount: number) => void;
  textSize: ReaderTextSize;
  pageMode: ReaderPageMode;
  theme: ReaderTheme;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [pages, setPages] = useState<string[]>(["<p>Deze tekst is nog leeg.</p>"]);
  const [visiblePageCount, setVisiblePageCount] = useState(1);

  const textSizeClass =
    textSize === "small"
      ? "text-[15px] leading-7 sm:text-[17px] sm:leading-8"
      : textSize === "large"
        ? "text-[18px] leading-8 sm:text-[21px] sm:leading-10"
        : "text-[16px] leading-7 sm:text-[18px] sm:leading-8";

  const pageThemeClass =
    theme === "light"
      ? "border-neutral-300 bg-[#fbfaf6] text-neutral-950 shadow-lg"
      : theme === "sepia"
        ? "border-[#d8c49d] bg-[#f3e4c6] text-[#24170d] shadow-lg"
        : "border-neutral-800 bg-neutral-950/95 text-white shadow-inner";

  const proseThemeClass = theme === "dark" ? "prose-invert" : "";

  useEffect(() => {
    setPageIndex(0);
  }, [html, setPageIndex]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      const viewportWidth = viewport.clientWidth;
      const viewportHeight = viewport.clientHeight;
      if (viewportWidth <= 0 || viewportHeight <= 0) return;

      const nextVisiblePageCount =
        pageMode === "single"
          ? 1
          : pageMode === "double" && viewportWidth >= 900
            ? 2
            : viewportWidth >= 1100
              ? 2
              : 1;
      setVisiblePageCount(nextVisiblePageCount);
      onVisiblePageCountChange(nextVisiblePageCount);

      if (nextVisiblePageCount === 2) {
        setPageIndex((current) => current - (current % 2));
      }

      const pageGap = nextVisiblePageCount === 2 ? 28 : 0;
      const singlePageWidth =
        nextVisiblePageCount === 2
          ? Math.floor((viewportWidth - pageGap - 32) / 2)
          : Math.floor(Math.min(viewportWidth - 32, 820));
      const singlePageHeight = Math.floor(viewportHeight - 32);

      const usableWidth = Math.max(260, singlePageWidth - (viewportWidth < 700 ? 64 : 94));
      const usableHeight = Math.max(260, singlePageHeight - (viewportWidth < 700 ? 170 : 150));
      const fontScale = textSize === "small" ? 0.9 : textSize === "large" ? 1.12 : 1;
      const averageCharacterWidth = (viewportWidth < 700 ? 9.8 : 10.4) * fontScale;
      const lineHeight = (viewportWidth < 700 ? 32 : 34) * fontScale;

      const charactersPerLine = Math.max(22, Math.floor(usableWidth / averageCharacterWidth));
      const linesPerPage = Math.max(7, Math.floor(usableHeight / lineHeight));

      // Iets voller dan de vorige versie, omdat de reader anders te veel lege bladruimte kreeg.
      const density = viewportWidth < 700 ? 0.76 : nextVisiblePageCount === 1 ? 0.9 : 0.78;
      const maxCharacters = Math.floor(charactersPerLine * linesPerPage * density);

      const nextPages = paginateHtml(html, maxCharacters);
      setPages(nextPages);
      onPageCountChange(nextPages.length);
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewport);

    return () => resizeObserver.disconnect();
  }, [html, onPageCountChange, onVisiblePageCountChange, pageMode, setPageIndex, textSize]);

  useEffect(() => {
    if (pageIndex > pages.length - 1) {
      setPageIndex(Math.max(0, pages.length - 1));
    }
  }, [pageIndex, pages.length, setPageIndex]);

  const visiblePages = pages.slice(pageIndex, pageIndex + visiblePageCount);

  return (
    <div className="mx-auto flex h-full w-full flex-col px-2 py-2 sm:px-6 sm:py-3">
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-hidden">
        <div
          className={
            visiblePageCount === 2
              ? "mx-auto grid h-full max-w-[1500px] grid-cols-2 gap-7"
              : "mx-auto grid h-full max-w-[840px] grid-cols-1"
          }
        >
          {visiblePages.map((pageHtml, index) => (
            <article
              key={`${pageIndex}-${index}`}
              className={`h-full overflow-hidden rounded-2xl border px-4 pb-12 pt-4 sm:px-8 sm:pb-16 sm:pt-6 md:px-10 md:py-8 ${pageThemeClass}`}
            >
              <div
                className={`dibooks-reader-content prose ${proseThemeClass} max-w-none ${textSizeClass} [&_p]:mb-5 sm:[&_p]:mb-5 [&_p]:mt-0 [&_h1]:mb-4 [&_h1]:mt-0 [&_h2]:mb-4 [&_h2]:mt-0 [&_h3]:mb-4 [&_h3]:mt-0`}
                dangerouslySetInnerHTML={{ __html: pageHtml }}
              />
            </article>
          ))}

          {visiblePageCount === 2 && visiblePages.length === 1 && (
            <article className={`h-full rounded-2xl border ${theme === "dark" ? "border-neutral-900 bg-neutral-950/40" : theme === "sepia" ? "border-[#d8c49d] bg-[#ead7ae]/60" : "border-neutral-300 bg-white/50"}`} />
          )}
        </div>
      </div>
    </div>
  );
}

type StabilizeLineMiniGameProps = {
  title: string;
  duration: number;
  difficulty: MiniGameDifficulty;
  allowRetry: boolean;
  onSuccess: () => void;
  onFail: () => void;
};

function StabilizeLineMiniGame({
  title,
  duration,
  difficulty,
  allowRetry,
  onSuccess,
  onFail,
}: StabilizeLineMiniGameProps) {
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number | null>(null);
  const pointerActiveRef = useRef(false);
  const pointerPositionRef = useRef(50);
  const signalPositionRef = useRef(50);

  const [signalPosition, setSignalPosition] = useState(50);
  const [stableSeconds, setStableSeconds] = useState(0);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<"success" | "fail" | null>(null);

  const requiredSeconds = Math.max(3, Math.min(12, duration || 5));
  const timeLimitSeconds = Math.max(requiredSeconds + 6, requiredSeconds * 2);
  const tolerance = difficulty === "easy" ? 15 : difficulty === "hard" ? 8 : 11;
  const safeZoneWidth = tolerance * 2;

  function updatePointerFromEvent(event: React.PointerEvent<HTMLDivElement>) {
    const arena = arenaRef.current;
    if (!arena) return;

    const rect = arena.getBoundingClientRect();
    const rawPercentage = ((event.clientX - rect.left) / rect.width) * 100;
    pointerPositionRef.current = Math.max(0, Math.min(100, rawPercentage));
  }

  function resetGame() {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    pointerActiveRef.current = false;
    pointerPositionRef.current = 50;
    signalPositionRef.current = 50;
    lastFrameTimeRef.current = null;
    setSignalPosition(50);
    setStableSeconds(0);
    setElapsedSeconds(0);
    setResult(null);
    setRunning(false);
  }

  useEffect(() => {
    if (!running || result) return;

    function tick(timestamp: number) {
      const lastTimestamp = lastFrameTimeRef.current ?? timestamp;
      const deltaSeconds = Math.min(0.05, (timestamp - lastTimestamp) / 1000);
      lastFrameTimeRef.current = timestamp;

      setElapsedSeconds((currentElapsed) => {
        const nextElapsed = currentElapsed + deltaSeconds;
        if (nextElapsed >= timeLimitSeconds) {
          setResult("fail");
          setRunning(false);
          return timeLimitSeconds;
        }
        return nextElapsed;
      });

      const wobble =
        Math.sin(timestamp / 230) * (difficulty === "hard" ? 5 : 3.2) +
        Math.sin(timestamp / 97) * (difficulty === "hard" ? 2.6 : 1.7);

      if (pointerActiveRef.current) {
        signalPositionRef.current +=
          (pointerPositionRef.current + wobble - signalPositionRef.current) * 0.22;
      } else {
        signalPositionRef.current += (50 + wobble * 2 - signalPositionRef.current) * 0.035;
      }

      signalPositionRef.current = Math.max(0, Math.min(100, signalPositionRef.current));
      const isStable = Math.abs(signalPositionRef.current - 50) <= tolerance;

      setSignalPosition(signalPositionRef.current);
      setStableSeconds((currentStableSeconds) => {
        const nextStableSeconds =
          isStable && pointerActiveRef.current
            ? currentStableSeconds + deltaSeconds
            : Math.max(0, currentStableSeconds - deltaSeconds * 1.4);

        if (nextStableSeconds >= requiredSeconds) {
          setResult("success");
          setRunning(false);
          return requiredSeconds;
        }

        return nextStableSeconds;
      });

      animationRef.current = requestAnimationFrame(tick);
    }

    animationRef.current = requestAnimationFrame(tick);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [difficulty, requiredSeconds, result, running, timeLimitSeconds, tolerance]);

  const progressPercentage = Math.min(100, (stableSeconds / requiredSeconds) * 100);
  const timePercentage = Math.min(100, (elapsedSeconds / timeLimitSeconds) * 100);
  const isStable = Math.abs(signalPosition - 50) <= tolerance;

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col justify-center p-6">
      <div className="rounded-3xl border border-purple-800 bg-purple-950/30 p-6 shadow-2xl sm:p-8">
        <div className="mb-6">
          <p className="text-sm font-black uppercase tracking-widest text-purple-300">Mini game</p>
          <h1 className="mt-2 text-3xl font-black">{title}</h1>
          <p className="mt-3 text-neutral-300">
            Houd de signaallijn {requiredSeconds.toFixed(0)} seconden binnen de veilige zone.
          </p>
        </div>

        <div
          ref={arenaRef}
          onPointerDown={(event) => {
            pointerActiveRef.current = true;
            updatePointerFromEvent(event);
            event.currentTarget.setPointerCapture(event.pointerId);
            if (!running && !result) {
              lastFrameTimeRef.current = null;
              setRunning(true);
            }
          }}
          onPointerMove={updatePointerFromEvent}
          onPointerUp={() => {
            pointerActiveRef.current = false;
          }}
          onPointerCancel={() => {
            pointerActiveRef.current = false;
          }}
          className="relative h-64 touch-none overflow-hidden rounded-3xl border-2 border-purple-700 bg-neutral-950"
        >
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 border-l border-purple-500/50" />
          <div
            className="absolute top-0 h-full bg-cyan-500/15 ring-2 ring-cyan-300/40"
            style={{ left: `${50 - safeZoneWidth / 2}%`, width: `${safeZoneWidth}%` }}
          />
          <div className="absolute left-0 right-0 top-1/2 h-px bg-purple-500/30" />
          <div
            className={`absolute top-0 h-full w-1 -translate-x-1/2 rounded-full shadow-[0_0_24px_rgba(34,211,238,0.85)] ${
              isStable ? "bg-cyan-200" : "bg-red-400"
            }`}
            style={{ left: `${signalPosition}%` }}
          />
          <div
            className={`absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-black ${
              isStable && pointerActiveRef.current
                ? "bg-cyan-500 text-black"
                : "bg-neutral-800 text-neutral-300"
            }`}
          >
            {running
              ? isStable && pointerActiveRef.current
                ? "STABIEL"
                : "CORRIGEER DE LIJN"
              : result === "success"
                ? "SIGNAL LOCK"
                : result === "fail"
                  ? "SIGNAL LOST"
                  : "HOUD VAST OM TE STARTEN"}
          </div>
        </div>

        <div className="mt-6 grid gap-4">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm font-bold text-neutral-400">
              <span>Stabiliteit</span>
              <span>{stableSeconds.toFixed(1)} / {requiredSeconds.toFixed(0)} sec</span>
            </div>
            <div className="h-4 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full bg-cyan-400 transition-[width]" style={{ width: `${progressPercentage}%` }} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-sm font-bold text-neutral-500">
              <span>Tijdslimiet</span>
              <span>{elapsedSeconds.toFixed(1)} / {timeLimitSeconds.toFixed(0)} sec</span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full bg-purple-500 transition-[width]" style={{ width: `${timePercentage}%` }} />
            </div>
          </div>
        </div>

        {result && (
          <div
            className={`mt-6 rounded-2xl border p-4 ${
              result === "success"
                ? "border-cyan-500 bg-cyan-950/40 text-cyan-100"
                : "border-red-600 bg-red-950/40 text-red-100"
            }`}
          >
            <p className="text-xl font-black">{result === "success" ? "Gelukt." : "Mislukt."}</p>
            <p className="mt-1 text-sm opacity-80">
              {result === "success"
                ? "Het signaal is stabiel genoeg om verder te gaan."
                : "Het signaal is weggevallen. De fail-route wordt geactiveerd."}
            </p>

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={result === "success" ? onSuccess : onFail}
                className={`rounded-xl px-5 py-3 font-black ${
                  result === "success"
                    ? "bg-cyan-500 text-black hover:bg-cyan-400"
                    : "bg-red-600 text-white hover:bg-red-500"
                }`}
              >
                Ga verder
              </button>

              {allowRetry && (
                <button
                  onClick={resetGame}
                  className="rounded-xl bg-neutral-800 px-5 py-3 font-black text-white hover:bg-neutral-700"
                >
                  Opnieuw proberen
                </button>
              )}

              {!allowRetry && result === "fail" && (
                <div className="rounded-xl bg-neutral-900 px-4 py-3 text-sm font-bold text-neutral-300">
                  Geen herkansing beschikbaar.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ReaderOnlyPage() {
  const params = useParams<{ bookId: string }>();
  const bookId = Array.isArray(params?.bookId) ? params.bookId[0] : params?.bookId;
  const libraryBook = getBookById(bookId ?? "");

  const [bookTitle, setBookTitle] = useState(libraryBook?.title ?? "DiBooks");
  const [nodes, setNodes] = useState<DiNode[]>([]);
  const [edges, setEdges] = useState<DiEdge[]>([]);
  const [startNodeId, setStartNodeId] = useState("");
  const [currentNodeId, setCurrentNodeId] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCount, setPageCount] = useState(1);
  const [visiblePageCount, setVisiblePageCount] = useState(1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [readerTextSize, setReaderTextSize] = useState<ReaderTextSize>("normal");
  const [readerPageMode, setReaderPageMode] = useState<ReaderPageMode>("auto");
  const [readerTheme, setReaderTheme] = useState<ReaderTheme>("dark");

  useEffect(() => {
    const savedTextSize = window.localStorage.getItem("dibooks-reader-text-size") as ReaderTextSize | null;
    const savedPageMode = window.localStorage.getItem("dibooks-reader-page-mode") as ReaderPageMode | null;
    const savedTheme = window.localStorage.getItem("dibooks-reader-theme") as ReaderTheme | null;

    if (savedTextSize === "small" || savedTextSize === "normal" || savedTextSize === "large") {
      setReaderTextSize(savedTextSize);
    }

    if (savedPageMode === "auto" || savedPageMode === "single" || savedPageMode === "double") {
      setReaderPageMode(savedPageMode);
    }

    if (savedTheme === "dark" || savedTheme === "light" || savedTheme === "sepia") {
      setReaderTheme(savedTheme);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem("dibooks-reader-text-size", readerTextSize);
    window.localStorage.setItem("dibooks-reader-page-mode", readerPageMode);
    window.localStorage.setItem("dibooks-reader-theme", readerTheme);
    setPageIndex(0);
  }, [readerTextSize, readerPageMode, readerTheme]);

  const currentNode = nodes.find((node) => node.id === currentNodeId);

  useEffect(() => {
    async function loadBook() {
      try {
        setLoading(true);
        setLoadError("");

        if (!libraryBook) {
          setLoadError("Dit boek staat niet in de DiBooks library.");
          return;
        }

        if (!libraryBook.storyFile) {
          setLoadError("Dit boek heeft nog geen gekoppeld verhaalbestand.");
          return;
        }

        const response = await fetch(libraryBook.storyFile, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Kon ${libraryBook.storyFile} niet laden. Status: ${response.status}`);
        }

        const projectData = (await response.json()) as ProjectData;
        const normalized = normalizeProject(projectData);

        setBookTitle(normalized.bookTitle || libraryBook.title);
        setNodes(normalized.nodes);
        setEdges(normalized.edges);
        setStartNodeId(normalized.startNodeId);
        setCurrentNodeId(normalized.startNodeId);
      } catch (error) {
        console.error(error);
        setLoadError(
          "Kon het boekbestand niet laden. Controleer of public/books/the-sovereign/story.json bestaat en of storyFile in lib/books.ts klopt.",
        );
      } finally {
        setLoading(false);
      }
    }

    loadBook();
  }, [libraryBook]);

  function goToNode(nodeId: string) {
    const targetNode = nodes.find((node) => node.id === nodeId);
    if (!targetNode) {
      alert("Deze doel-node bestaat niet meer.");
      return;
    }

    setCurrentNodeId(nodeId);
    setPageIndex(0);
    setPageCount(1);
    setVisiblePageCount(1);
  }

  function collectTextChain(startId: string | null) {
    if (!startId) {
      return {
        textNodes: [] as DiNode[],
        html: "",
        nextNodeAfterChain: null as DiNode | null,
      };
    }

    const textNodes: DiNode[] = [];
    const htmlParts: string[] = [];
    const visited = new Set<string>();
    let node = nodes.find((item) => item.id === startId);

    while (node && (node.data.type === "text" || node.data.type === "special")) {
      if (visited.has(node.id)) break;

      visited.add(node.id);
      textNodes.push(node);

      const nodeHtml =
        node.data.textHtml ||
        `<p>${escapeHtml(node.data.text || "Deze tekst-node is nog leeg.")}</p>`;

      const sectionClass =
        node.data.type === "special"
          ? "dibooks-reader-section dibooks-special-page"
          : "dibooks-reader-section";

      htmlParts.push(`
        <section class="${sectionClass}" data-node-id="${node.id}" data-node-type="${node.data.type}">
          ${nodeHtml}
        </section>
      `);

      const outgoingPaths = edges.filter((edge) => edge.source === node!.id);

      if (outgoingPaths.length !== 1) {
        return { textNodes, html: htmlParts.join(""), nextNodeAfterChain: null };
      }

      const nextNode = nodes.find((item) => item.id === outgoingPaths[0].target);
      if (!nextNode) return { textNodes, html: htmlParts.join(""), nextNodeAfterChain: null };

      if (nextNode.data.type !== "text" && nextNode.data.type !== "special") {
        return { textNodes, html: htmlParts.join(""), nextNodeAfterChain: nextNode };
      }

      node = nextNode;
    }

    return {
      textNodes,
      html: htmlParts.join(""),
      nextNodeAfterChain:
        node && node.data.type !== "text" && node.data.type !== "special" ? node : null,
    };
  }

  const textChain =
    currentNode?.data.type === "text" || currentNode?.data.type === "special"
      ? collectTextChain(currentNode.id)
      : { textNodes: [] as DiNode[], html: "", nextNodeAfterChain: null as DiNode | null };

  const textChainBranchPaths =
    currentNode?.data.type === "text" || currentNode?.data.type === "special"
      ? edges.filter((edge) => {
          const lastTextNode = textChain.textNodes[textChain.textNodes.length - 1];
          return !!lastTextNode && edge.source === lastTextNode.id;
        })
      : [];

  const previewPaths = currentNode ? edges.filter((edge) => edge.source === currentNode.id) : [];

  const estimatedTotalBookPages = Math.max(
    1,
    Math.ceil(
      nodes
        .filter((node) => node.data.type === "text" || node.data.type === "special")
        .reduce((total, node) => total + stripHtml(node.data.textHtml || node.data.text || "").length, 0) /
        1800,
    ),
  );

  const readerShellClass =
    readerTheme === "light"
      ? "bg-[#f5f5f2] text-neutral-950"
      : readerTheme === "sepia"
        ? "bg-[#d9c39a] text-[#24170d]"
        : "bg-neutral-950 text-white";

  const readerChromeClass =
    readerTheme === "light"
      ? "border-neutral-300 bg-[#fbfaf6]/95"
      : readerTheme === "sepia"
        ? "border-[#b99b67] bg-[#ead7ae]/95"
        : "border-neutral-800 bg-neutral-950/95";

  const mutedTextClass =
    readerTheme === "dark" ? "text-neutral-500" : readerTheme === "sepia" ? "text-[#705638]" : "text-neutral-500";

  if (loading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-neutral-950 p-4 text-white sm:p-6">
        <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-8 text-center shadow-2xl">
          <p className="text-sm font-black uppercase tracking-widest text-neutral-500">DiBooks Reader</p>
          <h1 className="mt-3 text-3xl font-black">Boek laden...</h1>
        </div>
      </main>
    );
  }

  if (loadError || !currentNode) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-neutral-950 p-4 text-white sm:p-6">
        <div className="max-w-xl rounded-3xl border border-red-900 bg-red-950/40 p-8 shadow-2xl">
          <p className="text-sm font-black uppercase tracking-widest text-red-300">Reader fout</p>
          <h1 className="mt-3 text-3xl font-black">Boek niet gevonden</h1>
          <p className="mt-4 text-red-100">{loadError || "Start-node niet gevonden."}</p>
          <p className="mt-4 text-sm text-red-100/70">
            Controleer in <strong>lib/books.ts</strong> of dit boek een correcte storyFile heeft, bijvoorbeeld <strong>/books/the-sovereign/story.json</strong>.
          </p>
        </div>
      </main>
    );
  }

  if (!started) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center overflow-hidden bg-neutral-950 p-4 text-white sm:p-6">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.18),transparent_35%),radial-gradient(circle_at_bottom,rgba(147,51,234,0.12),transparent_35%)]" />
        <div className="relative max-w-3xl rounded-3xl border border-neutral-800 bg-neutral-950/90 p-8 text-center shadow-2xl sm:p-12">
          <p className="text-sm font-black uppercase tracking-[0.35em] text-neutral-500">DiBooks Reader</p>
          <h1 className="mt-5 text-5xl font-black sm:text-7xl">{bookTitle}</h1>
          <p className="mx-auto mt-5 max-w-xl text-neutral-300">
            Reader-only testversie. Je kunt lezen, keuzes maken, cutscenes bekijken en minigames spelen.
          </p>
          <button
            onClick={() => {
              setStarted(true);
              goToNode(startNodeId);
            }}
            className="mt-8 rounded-2xl bg-blue-600 px-8 py-4 text-xl font-black text-white hover:bg-blue-500"
          >
            Start verhaal
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className={`fixed inset-0 flex h-[100dvh] min-h-[100dvh] flex-col overflow-hidden ${readerShellClass}`}>
      <div className={`flex shrink-0 items-center justify-between gap-3 border-b px-3 py-2 sm:px-6 sm:py-3 ${readerChromeClass}`}>
        <div>
          <p className={`text-xs font-bold uppercase tracking-widest ${mutedTextClass}`}>Reader mode</p>
          <h2 className="line-clamp-1 text-base font-black sm:text-2xl">
            {currentNode.data.type === "text" || currentNode.data.type === "special"
              ? bookTitle
              : currentNode.data.label}
          </h2>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setSettingsOpen((current) => !current)}
            className="flex h-11 min-w-11 items-center justify-center rounded-full bg-neutral-800 px-3 text-lg font-black text-white hover:bg-neutral-700"
            aria-label="Leesinstellingen"
            title="Leesinstellingen"
          >
            Aa
          </button>

          <button
            onClick={() => {
              setStarted(false);
              goToNode(startNodeId);
            }}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-2xl font-black leading-none text-white shadow-lg hover:bg-red-500"
            aria-label="Terug naar start"
            title="Terug naar start"
          >
            ×
          </button>
        </div>
      </div>

      {settingsOpen && (
        <div className="absolute right-3 top-16 z-20 w-[min(92vw,360px)] rounded-2xl border border-neutral-700 bg-neutral-900 p-4 shadow-2xl sm:right-6 sm:top-20">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-neutral-500">Leesinstellingen</p>
              <h3 className="text-lg font-black">Reader weergave</h3>
            </div>
            <button
              onClick={() => setSettingsOpen(false)}
              className="rounded-lg bg-neutral-800 px-3 py-2 text-sm font-black hover:bg-neutral-700"
            >
              Sluit
            </button>
          </div>

          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Tekstgrootte</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ["small", "Klein"],
                  ["normal", "Normaal"],
                  ["large", "Groot"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setReaderTextSize(value)}
                    className={`rounded-xl px-3 py-2 text-sm font-black ${
                      readerTextSize === value
                        ? "bg-blue-600 text-white"
                        : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Paginaweergave</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ["auto", "Auto"],
                  ["single", "1 pagina"],
                  ["double", "2 pagina’s"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setReaderPageMode(value)}
                    className={`rounded-xl px-3 py-2 text-sm font-black ${
                      readerPageMode === value
                        ? "bg-blue-600 text-white"
                        : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Op smalle schermen blijft 2 pagina’s automatisch veilig op 1 pagina.
              </p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Leeskleur</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  ["dark", "Donker"],
                  ["light", "Licht"],
                  ["sepia", "Boek"],
                ] as const).map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setReaderTheme(value)}
                    className={`rounded-xl px-3 py-2 text-sm font-black ${
                      readerTheme === value
                        ? "bg-blue-600 text-white"
                        : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-neutral-500">
                Donker, licht of een oude boekkleur voor rustiger lezen.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden">
        {(currentNode.data.type === "text" || currentNode.data.type === "special") && (
          <BookPageReader
            html={textChain.html}
            pageIndex={pageIndex}
            setPageIndex={setPageIndex}
            onPageCountChange={setPageCount}
            onVisiblePageCountChange={setVisiblePageCount}
            textSize={readerTextSize}
            pageMode={readerPageMode}
            theme={readerTheme}
          />
        )}

        {currentNode.data.type === "cutscene" && (
          <div className="flex h-full min-h-0 items-center justify-center overflow-y-auto bg-black p-2 sm:p-6">
            {currentNode.data.videoUrl ? (
              <div className="flex max-h-full w-full max-w-6xl flex-col">
                <div className="mb-2 flex shrink-0 flex-wrap items-end justify-between gap-2 sm:mb-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-green-400">Cutscene</p>
                    <h1 className="text-lg font-black sm:text-2xl">{currentNode.data.label}</h1>
                  </div>
                  <p className="text-sm font-bold text-neutral-400">
                    Max 12 sec{currentNode.data.videoDuration ? ` • ${currentNode.data.videoDuration.toFixed(1)} sec` : ""}
                  </p>
                </div>

                <video
                  src={currentNode.data.videoUrl}
                  controls
                  playsInline
                  autoPlay
                  className="max-h-[52dvh] w-full rounded-xl bg-black object-contain shadow-2xl sm:max-h-[70dvh] sm:rounded-2xl"
                />
              </div>
            ) : (
              <div className="rounded-xl border border-red-700 bg-red-950/40 p-5 text-red-200">
                Deze cutscene heeft nog geen video.
              </div>
            )}
          </div>
        )}

        {currentNode.data.type === "choice" && (
          <div className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-4 overflow-y-auto p-4 sm:p-6">
            <div className="rounded-2xl bg-neutral-900 p-8">
              <p className="text-sm font-bold uppercase tracking-widest text-orange-400">Keuze moment</p>
              <h1 className="mt-2 text-3xl font-black">{currentNode.data.label}</h1>
              <div className="mt-6 grid gap-3">
                {(currentNode.data.choices ?? [])
                  .slice(0, 3)
                  .filter((choice) => choice.label.trim().length > 0)
                  .map((choice, choiceIndex) => (
                    <button
                      key={choiceIndex}
                      onClick={() => {
                        if (!choice.targetNodeId) return;
                        goToNode(choice.targetNodeId);
                      }}
                      disabled={!choice.targetNodeId}
                      className="rounded-xl border border-orange-700 bg-orange-600 px-5 py-4 text-left text-lg font-black text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="mr-3 text-orange-200">{["A", "B", "C"][choiceIndex]}.</span>
                      {choice.label}
                    </button>
                  ))}
              </div>
            </div>
          </div>
        )}

        {currentNode.data.type === "minigame" && (
          <>
            {currentNode.data.miniGameType === "stabilize_line" ||
            currentNode.data.miniGameType === "tap_symbol" ||
            !currentNode.data.miniGameType ? (
              <StabilizeLineMiniGame
                key={currentNode.id}
                title={currentNode.data.label}
                duration={currentNode.data.miniGameDuration ?? 5}
                difficulty={currentNode.data.miniGameDifficulty ?? "normal"}
                allowRetry={currentNode.data.miniGameAllowRetry ?? true}
                onSuccess={() => {
                  const targetId =
                    currentNode.data.miniGameSuccessTargetNodeId ||
                    edges.find(
                      (edge) =>
                        edge.source === currentNode.id && edge.data?.miniGameResult === "success",
                    )?.target;

                  if (!targetId) {
                    alert("Deze minigame heeft nog geen success route.");
                    return;
                  }

                  goToNode(targetId);
                }}
                onFail={() => {
                  const targetId =
                    currentNode.data.miniGameFailTargetNodeId ||
                    edges.find(
                      (edge) => edge.source === currentNode.id && edge.data?.miniGameResult === "fail",
                    )?.target;

                  if (!targetId) {
                    alert("Deze minigame heeft nog geen fail route.");
                    return;
                  }

                  goToNode(targetId);
                }}
              />
            ) : (
              <div className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-4 overflow-y-auto p-4 sm:p-6">
                <p className="text-xl font-bold">Mini game</p>
                <div className="rounded-xl bg-purple-950/50 p-5 text-purple-200">
                  Dit minigame type is nog niet gebouwd: {currentNode.data.miniGameType || "niet ingesteld"}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className={`shrink-0 border-t px-3 py-2 sm:px-6 sm:py-3 ${readerChromeClass}`}>
        {(currentNode.data.type === "text" || currentNode.data.type === "special") && (
          <div className="flex flex-wrap items-center justify-between gap-2 sm:gap-3">
            <button
              onClick={() => setPageIndex((current) => Math.max(0, current - visiblePageCount))}
              disabled={pageIndex === 0}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-3xl font-black leading-none text-white shadow-lg hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:opacity-40"
              aria-label="Vorige pagina"
              title="Vorige pagina"
            >
              ←
            </button>

            <div className="min-w-[110px] flex-1 text-center text-xs font-bold text-neutral-400 sm:text-sm">
              <div>
                {visiblePageCount === 2 && pageIndex + 1 < pageCount
                  ? `Pagina ${pageIndex + 1}–${Math.min(pageIndex + 2, pageCount)} van ${pageCount}`
                  : `Pagina ${pageIndex + 1} van ${pageCount}`}
              </div>
              <div className="text-xs text-neutral-500">Geschat totaal boek: ±{estimatedTotalBookPages} pagina’s</div>
            </div>

            {pageIndex < pageCount - visiblePageCount && (
              <button
                onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + visiblePageCount))}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600 text-3xl font-black leading-none text-white shadow-lg hover:bg-blue-500"
                aria-label="Volgende pagina"
                title="Volgende pagina"
              >
                →
              </button>
            )}

            {pageIndex >= pageCount - visiblePageCount && textChain.nextNodeAfterChain && (
              <button
                onClick={() => goToNode(textChain.nextNodeAfterChain!.id)}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm font-black text-white hover:bg-emerald-500 sm:px-4 sm:py-3 sm:text-base"
              >
                Ga verder naar {textChain.nextNodeAfterChain.data.type === "minigame" ? "mini game" : textChain.nextNodeAfterChain.data.label}
              </button>
            )}

            {pageIndex >= pageCount - visiblePageCount &&
              !textChain.nextNodeAfterChain &&
              textChainBranchPaths.length > 0 && (
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {textChainBranchPaths.map((edge, branchIndex) => {
                    const targetNode = nodes.find((node) => node.id === edge.target);

                    return (
                      <button
                        key={edge.id}
                        onClick={() => goToNode(edge.target)}
                        className="rounded-xl bg-emerald-600 px-3 py-2 text-left text-sm font-black text-white hover:bg-emerald-500 sm:px-4 sm:py-3 sm:text-base"
                      >
                        {edge.label
                          ? `${edge.label}: `
                          : textChainBranchPaths.length > 1
                            ? `Optie ${branchIndex + 1}: `
                            : "Ga verder naar "}
                        {targetNode?.data.type === "minigame" ? "mini game" : targetNode?.data.label ?? "Onbekende node"}
                      </button>
                    );
                  })}
                </div>
              )}

            {pageIndex >= pageCount - visiblePageCount &&
              !textChain.nextNodeAfterChain &&
              textChainBranchPaths.length === 0 && (
                <div className="rounded-xl bg-neutral-900 px-4 py-3 text-neutral-300">Einde bereikt.</div>
              )}
          </div>
        )}

        {currentNode.data.type !== "text" &&
          currentNode.data.type !== "special" &&
          currentNode.data.type !== "choice" &&
          currentNode.data.type !== "minigame" && (
            <>
              {previewPaths.length === 0 && (
                <div className="rounded-xl bg-neutral-900 p-4 text-neutral-300">
                  Einde bereikt. Deze node heeft geen volgende path.
                </div>
              )}

              {previewPaths.length > 0 && (
                <div className="grid gap-3">
                  <p className="text-sm font-bold text-neutral-400">Volgende:</p>
                  {previewPaths.map((edge) => {
                    const targetNode = nodes.find((node) => node.id === edge.target);
                    return (
                      <button
                        key={edge.id}
                        onClick={() => goToNode(edge.target)}
                        className="rounded-xl bg-blue-600 px-4 py-3 text-left font-black text-white hover:bg-blue-500"
                      >
                        {targetNode?.data.label ?? "Onbekende node"}
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}
      </div>
    </main>
  );
}
