"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppNavActions } from "@/components/AppNav";
import { useParams } from "next/navigation";
import { books } from "@/lib/books";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useDemoAuth } from "@/lib/auth";
import { getReadingProgress, resetReadingProgress, upsertReadingProgress } from "@/lib/supabase/readerFeatures";
import { resolveDiBooksMediaUrl } from "@/lib/supabase/mediaStorage";

type MiniGameDifficulty = "easy" | "normal" | "hard";
type ReaderNodeType = "text" | "special" | "cutscene" | "choice" | "minigame" | "function" | "scratchpad";

type ReaderChoice = {
  label: string;
  targetNodeId?: string;
};

type ReaderFunctionActionType = "set_flag" | "clear_flag" | "increment" | "decrement" | "set_number";

type ReaderFunctionAction = {
  id?: string;
  type: ReaderFunctionActionType;
  key: string;
  amount?: number;
};

type ReaderFlags = Record<string, boolean | number | string>;

type ReaderNode = {
  id: string;
  type: ReaderNodeType;
  title: string;
  text: string;
  textHtml: string;
  specialSubtype?: string;
  videoUrl?: string;
  videoStoragePath?: string;
  videoFileName?: string;
  videoDuration?: number;
  choices: ReaderChoice[];
  miniGameType?: string;
  miniGameDuration?: number;
  miniGameDifficulty?: MiniGameDifficulty;
  miniGameAllowRetry?: boolean;
  miniGameSuccessTargetNodeId?: string;
  miniGameFailTargetNodeId?: string;
  functionActions?: ReaderFunctionAction[];
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
  accessType?: "free" | "premium";
  startNodeId: string;
  nodes: ReaderNode[];
  edges: ReaderEdge[];
};

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; book: ReaderBook };

type ReaderTextSize = "small" | "normal" | "large";
type ReaderPageMode = "auto" | "single" | "double";
type ReaderTheme = "dark" | "light" | "sepia";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


const MANUAL_PAGE_BREAK_MARKER = "[[NIEUWE_PAGINA]]";
const MANUAL_PAGE_BREAK_BLOCK_REGEX = /<p[^>]*>\s*(?:<(?:code|strong|em|span)[^>]*>\s*)*\[\[NIEUWE_PAGINA\]\](?:\s*<\/(?:code|strong|em|span)>)*\s*<\/p>/gi;

function normalizeManualPageBreakMarkers(value: string) {
  return value.replace(MANUAL_PAGE_BREAK_BLOCK_REGEX, MANUAL_PAGE_BREAK_MARKER);
}

function removeManualPageBreakMarkers(value: string) {
  return normalizeManualPageBreakMarkers(value)
    .split(MANUAL_PAGE_BREAK_MARKER)
    .join("")
    .replace(/<p>\s*<\/p>/gi, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .split(MANUAL_PAGE_BREAK_MARKER)
    .join(" ")
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
    videoStoragePath: data.videoStoragePath ?? content.videoStoragePath ?? rawNode?.videoStoragePath ?? "",
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
    functionActions: data.functionActions ?? content.functionActions ?? rawNode?.functionActions ?? [],
  };
}

function normalizeBook(rawProject: any, fallback: Partial<ReaderBook>): ReaderBook {
  const nodes: ReaderNode[] = Array.isArray(rawProject?.nodes)
    ? rawProject.nodes.map(normalizeNode).filter((node: ReaderNode) => node.type !== "scratchpad")
    : [];
  const nodeIds = new Set(nodes.map((node: ReaderNode) => node.id));
  const edges = Array.isArray(rawProject?.edges)
    ? rawProject.edges
        .filter((edge: any) => nodeIds.has(edge?.source) && nodeIds.has(edge?.target))
        .map((edge: any) => ({
          id: edge.id ?? `${edge.source}-${edge.target}`,
          source: edge.source,
          target: edge.target,
          label: typeof edge.label === "string" ? edge.label : undefined,
          data: edge.data,
        }))
    : [];
  const preferredStartNodeId = rawProject?.startNodeId;
  const safeStartNodeId = preferredStartNodeId && nodeIds.has(preferredStartNodeId)
    ? preferredStartNodeId
    : nodes[0]?.id ?? "";

  return {
    id: fallback.id ?? rawProject?.bookId ?? "unknown-book",
    title: fallback.title ?? rawProject?.bookTitle ?? rawProject?.title ?? "DiBooks verhaal",
    author: fallback.author ?? rawProject?.author ?? "Auteur",
    subtitle: fallback.subtitle ?? rawProject?.subtitle ?? "",
    description: fallback.description ?? rawProject?.description ?? "",
    accessType: (fallback as any).accessType ?? rawProject?.accessType ?? "free",
    startNodeId: safeStartNodeId,
    nodes,
    edges,
  };
}


async function resolveReaderBookMedia(book: ReaderBook) {
  const nodes = await Promise.all(
    book.nodes.map(async (node) => {
      if (node.type !== "cutscene" || !node.videoStoragePath) return node;
      const signedUrl = await resolveDiBooksMediaUrl(node.videoStoragePath, node.videoUrl ?? "");
      return {
        ...node,
        videoUrl: signedUrl || node.videoUrl,
      };
    }),
  );

  return {
    ...book,
    nodes,
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
  return resolveReaderBookMedia(normalizeBook(rawProject, {
    id: staticBook.id,
    title: staticBook.title,
    author: staticBook.author,
    subtitle: staticBook.subtitle,
    description: staticBook.description,
  }));
}

async function loadSupabaseBook(bookId: string) {
  const supabase = createSupabaseBrowserClient();

  const { data, error } = await supabase.rpc("get_reader_book", {
    input_book_id: bookId,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  if (!row.project_data) {
    throw new Error("Dit boek is gepubliceerd, maar er is nog geen reader/project-data opgeslagen.");
  }

  return resolveReaderBookMedia(normalizeBook(row.project_data, {
    id: row.id,
    title: row.title,
    author: row.author,
    subtitle: row.subtitle,
    description: row.description,
    accessType: row.access_type === "premium" ? "premium" : "free",
  } as any));
}

function clampProgressPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}


function getReaderFlagsStorageKey(bookId: string) {
  return `dibooks-reader-flags:${bookId}`;
}

function loadReaderFlags(bookId: string): ReaderFlags {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(getReaderFlagsStorageKey(bookId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveReaderFlags(bookId: string, flags: ReaderFlags) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getReaderFlagsStorageKey(bookId), JSON.stringify(flags));
}

function clearReaderFlags(bookId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(getReaderFlagsStorageKey(bookId));
}

function applyReaderFunctionActions(currentFlags: ReaderFlags, actions: ReaderFunctionAction[] = []) {
  const nextFlags: ReaderFlags = { ...currentFlags };

  actions.forEach((action) => {
    const key = String(action?.key ?? "").trim();
    if (!key) return;

    const amount = Number(action.amount ?? 1) || 0;
    const currentValue = nextFlags[key];
    const currentNumber = typeof currentValue === "number" ? currentValue : Number(currentValue) || 0;

    if (action.type === "set_flag") nextFlags[key] = true;
    if (action.type === "clear_flag") nextFlags[key] = false;
    if (action.type === "increment") nextFlags[key] = currentNumber + amount;
    if (action.type === "decrement") nextFlags[key] = currentNumber - amount;
    if (action.type === "set_number") nextFlags[key] = amount;
  });

  return nextFlags;
}

function calculateBookProgressPercent(book: ReaderBook, currentNodeId: string, pageIndex: number, pageCount: number) {
  const totalNodes = Math.max(1, book.nodes.length);
  const nodeIndex = Math.max(0, book.nodes.findIndex((node) => node.id === currentNodeId));
  const safePageCount = Math.max(1, pageCount);
  const pageFraction = Math.max(0, Math.min(1, (pageIndex + 1) / safePageCount));
  const percent = ((nodeIndex + pageFraction) / totalNodes) * 100;
  return clampProgressPercent(percent);
}


function plainTextToReaderHtml(value: string) {
  const paragraphs = String(value || "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  if (!paragraphs.length) return "<p>Deze pagina is nog leeg.</p>";

  return paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br />")}</p>`)
    .join("");
}

function unwrapReaderSectionTags(html: string) {
  // De reader combineert opeenvolgende tekstnodes in <section>-wrappers.
  // Voor paginering willen we de echte alinea's/blokken splitsen, niet één complete section.
  return html
    .replace(/<section\b[^>]*>/gi, "")
    .replace(/<\/section>/gi, "");
}

function splitHtmlIntoReadableBlocks(html: string) {
  const cleanedHtml = unwrapReaderSectionTags(html || "").trim();
  if (!cleanedHtml) return [];

  if (typeof document === "undefined") {
    return [cleanedHtml];
  }

  const container = document.createElement("div");
  container.innerHTML = cleanedHtml;

  const blocks: string[] = [];
  const blockTags = new Set([
    "P",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "BLOCKQUOTE",
    "UL",
    "OL",
    "PRE",
    "TABLE",
    "HR",
    "DIV",
  ]);

  function pushHtmlBlock(value: string) {
    const withoutMarkers = removeManualPageBreakMarkers(value);
    if (!stripHtml(withoutMarkers)) return;
    blocks.push(withoutMarkers);
  }

  function walk(node: ChildNode) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? "";
      if (text.trim()) pushHtmlBlock(plainTextToReaderHtml(text));
      return;
    }

    if (!(node instanceof HTMLElement)) return;

    const tagName = node.tagName.toUpperCase();
    if (tagName === "BR") return;

    if (blockTags.has(tagName)) {
      pushHtmlBlock(node.outerHTML);
      return;
    }

    if (node.childNodes.length) {
      node.childNodes.forEach(walk);
      return;
    }

    pushHtmlBlock(node.outerHTML);
  }

  container.childNodes.forEach(walk);

  if (!blocks.length && stripHtml(cleanedHtml)) return [cleanedHtml];
  return blocks;
}

function splitLongPlainBlock(blockHtml: string, maxCharacters: number) {
  const plainText = stripHtml(blockHtml);
  if (plainText.length <= maxCharacters) return [blockHtml];

  const chunks = plainText.match(/[^.!?…]+[.!?…"]*|.+$/g) ?? [plainText];
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
      cleanChunk.split(/\s+/).forEach((word) => {
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
  return pages.length ? pages : [blockHtml];
}

function paginateTextHtml(html: string, maxCharacters = 1450) {
  const normalizedHtml = normalizeManualPageBreakMarkers(html || "");
  const manualBreakSegments = normalizedHtml.split(MANUAL_PAGE_BREAK_MARKER);

  if (manualBreakSegments.length > 1) {
    const manualPages: string[] = [];

    manualBreakSegments.forEach((segment) => {
      const cleanedSegment = removeManualPageBreakMarkers(segment);
      if (!stripHtml(cleanedSegment)) return;
      manualPages.push(...paginateTextHtml(cleanedSegment, maxCharacters));
    });

    return manualPages.length > 0 ? manualPages : ["<p>Deze pagina is nog leeg.</p>"];
  }

  const cleanedHtml = removeManualPageBreakMarkers(html || "");
  const plainText = stripHtml(cleanedHtml);
  if (!plainText) return ["<p>Deze pagina is nog leeg.</p>"];

  const safeHtml = /<[^>]+>/.test(cleanedHtml)
    ? cleanedHtml
    : plainTextToReaderHtml(cleanedHtml);

  const blocks = splitHtmlIntoReadableBlocks(safeHtml);
  if (!blocks.length) return [plainTextToReaderHtml(plainText)];

  const pages: string[] = [];
  let currentHtml = "";
  let currentTextLength = 0;

  blocks.forEach((blockHtml) => {
    const blockLength = Math.max(1, stripHtml(blockHtml).length);

    if (blockLength > maxCharacters && currentTextLength === 0) {
      pages.push(...splitLongPlainBlock(blockHtml, maxCharacters));
      return;
    }

    if (currentTextLength > 0 && currentTextLength + blockLength > maxCharacters) {
      pages.push(currentHtml.trim());
      currentHtml = "";
      currentTextLength = 0;
    }

    if (blockLength > maxCharacters) {
      pages.push(...splitLongPlainBlock(blockHtml, maxCharacters));
      return;
    }

    currentHtml += blockHtml;
    currentTextLength += blockLength;
  });

  if (currentHtml.trim()) pages.push(currentHtml.trim());
  return pages.length ? pages : ["<p>Deze pagina is nog leeg.</p>"];
}

function getReaderContentSize(textSize: ReaderTextSize) {
  if (textSize === "small") return { fontSize: "18px", lineHeight: "36px" };
  if (textSize === "large") return { fontSize: "24px", lineHeight: "46px" };
  return { fontSize: "20px", lineHeight: "40px" };
}

function paginateTextHtmlMeasured(
  html: string,
  options: {
    maxCharacters: number;
    pageWidth: number;
    pageHeight: number;
    textSize: ReaderTextSize;
    theme: ReaderTheme;
  },
) {
  if (typeof document === "undefined") return paginateTextHtml(html, options.maxCharacters);

  const normalizedHtml = normalizeManualPageBreakMarkers(html || "");
  const manualBreakSegments = normalizedHtml.split(MANUAL_PAGE_BREAK_MARKER);

  if (manualBreakSegments.length > 1) {
    const manualPages: string[] = [];
    manualBreakSegments.forEach((segment) => {
      const cleanedSegment = removeManualPageBreakMarkers(segment);
      if (!stripHtml(cleanedSegment)) return;
      manualPages.push(...paginateTextHtmlMeasured(cleanedSegment, options));
    });
    return manualPages.length ? manualPages : ["<p>Deze pagina is nog leeg.</p>"];
  }

  const cleanedHtml = removeManualPageBreakMarkers(html || "");
  const plainText = stripHtml(cleanedHtml);
  if (!plainText) return ["<p>Deze pagina is nog leeg.</p>"];

  const safeHtml = /<[^>]+>/.test(cleanedHtml)
    ? cleanedHtml
    : plainTextToReaderHtml(cleanedHtml);

  const blocks = splitHtmlIntoReadableBlocks(safeHtml);
  if (!blocks.length) return [plainTextToReaderHtml(plainText)];

  const measuringBox = document.createElement("div");
  const size = getReaderContentSize(options.textSize);
  measuringBox.className = `dibooks-reader-content prose max-w-none ${options.theme === "light" ? "prose-neutral" : "prose-invert"}`;
  measuringBox.style.position = "fixed";
  measuringBox.style.left = "-100000px";
  measuringBox.style.top = "0";
  measuringBox.style.visibility = "hidden";
  measuringBox.style.pointerEvents = "none";
  measuringBox.style.zIndex = "-1";
  measuringBox.style.boxSizing = "border-box";
  measuringBox.style.width = `${Math.max(260, Math.floor(options.pageWidth))}px`;
  measuringBox.style.fontSize = size.fontSize;
  measuringBox.style.lineHeight = size.lineHeight;
  measuringBox.style.maxWidth = "none";
  measuringBox.style.padding = "0";
  measuringBox.style.margin = "0";
  document.body.appendChild(measuringBox);

  function setAndMeasure(value: string) {
    measuringBox.innerHTML = value;
    measuringBox.querySelectorAll("p").forEach((paragraph) => {
      const element = paragraph as HTMLElement;
      element.style.marginTop = "0";
      element.style.marginBottom = "24px";
    });
    measuringBox.querySelectorAll("h1,h2,h3,h4,h5,h6").forEach((heading) => {
      const element = heading as HTMLElement;
      element.style.marginTop = "0";
      element.style.marginBottom = "16px";
    });
    return measuringBox.scrollHeight;
  }

  const pages: string[] = [];
  let currentHtml = "";
  const maxHeight = Math.max(260, Math.floor(options.pageHeight));

  blocks.forEach((blockHtml) => {
    const candidateHtml = currentHtml ? `${currentHtml}${blockHtml}` : blockHtml;
    const candidateHeight = setAndMeasure(candidateHtml);

    if (candidateHeight <= maxHeight) {
      currentHtml = candidateHtml;
      return;
    }

    if (currentHtml.trim()) {
      pages.push(currentHtml.trim());
      currentHtml = "";
    }

    const singleBlockHeight = setAndMeasure(blockHtml);
    if (singleBlockHeight <= maxHeight) {
      currentHtml = blockHtml;
      return;
    }

    const splitBlocks = splitLongPlainBlock(blockHtml, Math.max(280, Math.floor(options.maxCharacters * 0.72)));
    splitBlocks.forEach((splitBlock) => {
      const splitCandidate = currentHtml ? `${currentHtml}${splitBlock}` : splitBlock;
      if (setAndMeasure(splitCandidate) > maxHeight && currentHtml.trim()) {
        pages.push(currentHtml.trim());
        currentHtml = splitBlock;
      } else {
        currentHtml = splitCandidate;
      }
    });
  });

  if (currentHtml.trim()) pages.push(currentHtml.trim());
  document.body.removeChild(measuringBox);

  return pages.length ? pages : paginateTextHtml(html, options.maxCharacters);
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
  isSpecialPage = false,
}: {
  html: string;
  pageIndex: number;
  setPageIndex: React.Dispatch<React.SetStateAction<number>>;
  onPageCountChange: (pageCount: number) => void;
  onVisiblePageCountChange: (visiblePageCount: number) => void;
  textSize: ReaderTextSize;
  pageMode: ReaderPageMode;
  theme: ReaderTheme;
  isSpecialPage?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [visiblePageCount, setVisiblePageCount] = useState(1);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      if (width <= 0 || height <= 0) return;

      const shouldDouble =
        pageMode === "double" || (pageMode === "auto" && width >= 1120);
      const nextVisiblePageCount = shouldDouble ? 2 : 1;

      setVisiblePageCount(nextVisiblePageCount);
      onVisiblePageCountChange(nextVisiblePageCount);

      if (nextVisiblePageCount === 2) {
        setPageIndex((current) => current - (current % 2));
      }

      const fontMultiplier = textSize === "small" ? 1.12 : textSize === "large" ? 0.78 : 0.95;
      // Speciale pagina's moeten altijd hun eigen reader-pagina's behouden.
      // Daarom gebruiken ze een lagere pagineringsdrempel dan normale tekstnodes.
      // Zo kan een lange logboek/chat/dossier-pagina netjes over meerdere pagina's
      // verdergaan, zonder dat de volgende tekstnode op dezelfde pagina terechtkomt.
      const baseMaxCharacters = isSpecialPage
        ? nextVisiblePageCount === 2
          ? 720
          : 950
        : nextVisiblePageCount === 2
          ? 1180
          : 1450;
      const heightMultiplier = Math.max(0.65, Math.min(1.3, height / 760));
      const pageHorizontalPadding = window.innerWidth >= 768 ? 128 : window.innerWidth >= 640 ? 96 : 64;
      const pageVerticalPadding = window.innerWidth >= 640 ? 136 : 112;
      const gridWidth = nextVisiblePageCount === 2 ? Math.min(width, 1500) : Math.min(width, 860);
      const pageOuterWidth = nextVisiblePageCount === 2 ? (gridWidth - 28) / 2 : gridWidth;
      const pageContentWidth = Math.max(260, pageOuterWidth - pageHorizontalPadding);
      const pageContentHeight = Math.max(260, height - pageVerticalPadding);
      const maxCharacters = Math.floor(baseMaxCharacters * fontMultiplier * heightMultiplier);
      const nextPages = paginateTextHtmlMeasured(html, {
        maxCharacters,
        pageWidth: pageContentWidth,
        pageHeight: pageContentHeight,
        textSize,
        theme,
      });

      setPages(nextPages);
      onPageCountChange(nextPages.length);
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, [html, isSpecialPage, onPageCountChange, onVisiblePageCountChange, pageMode, setPageIndex, textSize, theme]);

  useEffect(() => {
    // Wacht tot de echte paginering klaar is. Anders wordt een opgeslagen
    // pagina-index zoals 4 direct teruggezet naar 0 omdat de reader vóór
    // de eerste meting nog 0 pagina's kent.
    if (pages.length === 0) return;

    if (pageIndex > pages.length - 1) {
      setPageIndex(Math.max(0, pages.length - 1));
    }
  }, [pageIndex, pages.length, setPageIndex]);

  const visiblePages = pages.length
    ? pages.slice(pageIndex, pageIndex + visiblePageCount)
    : ["<p>Pagina wordt geladen...</p>"];

  const pageClass =
    theme === "light"
      ? "border-neutral-300 bg-[#fffaf0] text-neutral-950 shadow-xl"
      : theme === "sepia"
        ? "border-[#8f6b38]/35 bg-[#3a2a19] text-[#f3e4c9] shadow-2xl"
        : "border-white/10 bg-neutral-950/95 text-white shadow-2xl";

  const contentSizeClass =
    textSize === "small"
      ? "text-[16px] leading-8 sm:text-[18px] sm:leading-9"
      : textSize === "large"
        ? "text-[22px] leading-10 sm:text-[24px] sm:leading-[2.9rem]"
        : "text-[18px] leading-9 sm:text-[20px] sm:leading-10";

  return (
    <div className="mx-auto flex h-full w-full flex-col px-3 py-3 sm:px-6">
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-hidden">
        <div
          className={
            visiblePageCount === 2
              ? "mx-auto grid h-full max-w-[1500px] grid-cols-2 gap-7"
              : "mx-auto grid h-full max-w-[860px] grid-cols-1"
          }
        >
          {visiblePages.map((pageHtml, index) => (
            <article
              key={`${pageIndex}-${index}`}
              className={`h-full overflow-hidden rounded-2xl border px-8 pb-20 pt-8 sm:px-12 sm:pb-24 sm:pt-10 md:px-16 ${pageClass}`}
            >
              <div
                className={`dibooks-reader-content prose max-w-none ${theme === "light" ? "prose-neutral" : "prose-invert"} ${contentSizeClass} [&_p]:mb-6 [&_p]:mt-0 [&_h1]:mb-4 [&_h1]:mt-0 [&_h2]:mb-4 [&_h2]:mt-0 [&_h3]:mb-4 [&_h3]:mt-0`}
                dangerouslySetInnerHTML={{ __html: pageHtml }}
              />
            </article>
          ))}

          {visiblePageCount === 2 && visiblePages.length === 1 && (
            <article className="h-full rounded-2xl border border-white/5 bg-black/10" />
          )}
        </div>
      </div>
    </div>
  );
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

  const difficulty = node.miniGameDifficulty ?? "normal";
  const requiredSeconds = Math.max(3, Math.min(12, node.miniGameDuration ?? 5));
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
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }

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
        signalPositionRef.current +=
          (50 + wobble * 2 - signalPositionRef.current) * 0.035;
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

  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  const progressPercentage = Math.min(100, (stableSeconds / requiredSeconds) * 100);
  const timePercentage = Math.min(100, (elapsedSeconds / timeLimitSeconds) * 100);
  const isStable = Math.abs(signalPosition - 50) <= tolerance;
  const allowRetry = node.miniGameAllowRetry ?? true;

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col justify-center p-5 sm:p-6">
      <div className="rounded-[2rem] border border-purple-500/25 bg-purple-950/25 p-6 shadow-2xl sm:p-8">
        <div className="mb-6">
          <p className="text-xs font-black uppercase tracking-[0.28em] text-purple-300">Mini game</p>
          <h1 className="mt-3 text-3xl font-black sm:text-5xl">{node.title}</h1>
          <p className="mt-4 max-w-2xl text-sm font-semibold leading-7 text-neutral-300">
            Houd de signaallijn {requiredSeconds.toFixed(0)} seconden binnen de veilige zone. Werkt met muis én touch.
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
            style={{
              left: `${50 - safeZoneWidth / 2}%`,
              width: `${safeZoneWidth}%`,
            }}
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
              isStable && pointerActiveRef.current ? "bg-cyan-500 text-black" : "bg-neutral-800 text-neutral-300"
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
              <span>
                {stableSeconds.toFixed(1)} / {requiredSeconds.toFixed(0)} sec
              </span>
            </div>
            <div className="h-4 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full bg-cyan-400 transition-[width]" style={{ width: `${progressPercentage}%` }} />
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between text-sm font-bold text-neutral-500">
              <span>Tijdslimiet</span>
              <span>
                {elapsedSeconds.toFixed(1)} / {timeLimitSeconds.toFixed(0)} sec
              </span>
            </div>
            <div className="h-3 overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full bg-purple-500 transition-[width]" style={{ width: `${timePercentage}%` }} />
            </div>
          </div>
        </div>

        {result && (
          <div
            className={`mt-6 rounded-2xl border p-4 ${
              result === "success" ? "border-cyan-500 bg-cyan-950/40 text-cyan-100" : "border-red-600 bg-red-950/40 text-red-100"
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
                  result === "success" ? "bg-cyan-500 text-black hover:bg-cyan-400" : "bg-red-600 text-white hover:bg-red-500"
                }`}
              >
                Ga verder
              </button>

              {allowRetry && (
                <button onClick={resetGame} className="rounded-xl bg-neutral-800 px-5 py-3 font-black text-white hover:bg-neutral-700">
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

export default function ReadBookPage() {
  const params = useParams<{ bookId: string }>();
  const bookId = String(params?.bookId ?? "");
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [currentNodeId, setCurrentNodeId] = useState<string>("");
  const [pageIndex, setPageIndex] = useState(0);
  const [readerPageCount, setReaderPageCount] = useState(1);
  const [readerVisiblePageCount, setReaderVisiblePageCount] = useState(1);
  const [textSize, setTextSize] = useState<ReaderTextSize>("normal");
  const [pageMode, setPageMode] = useState<ReaderPageMode>("auto");
  const [theme, setTheme] = useState<ReaderTheme>("dark");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [cutsceneFading, setCutsceneFading] = useState(false);
  const [resetProgressBusy, setResetProgressBusy] = useState(false);
  const [readerFlags, setReaderFlags] = useState<ReaderFlags>({});
  const lastExecutedFunctionNodeRef = useRef<string | null>(null);
  const cutsceneShellRef = useRef<HTMLDivElement | null>(null);
  const { user, loading: authLoading } = useDemoAuth();

  useEffect(() => {
    let active = true;

    async function loadBook() {
      setLoadState({ status: "loading" });

      try {
        if (authLoading) return;

        if (!user) {
          setLoadState({ status: "error", message: "Login gratis om dit boek te lezen. Zo kan DiBooks ook je leesvoortgang opslaan." });
          return;
        }

        const staticBook = await loadStaticBook(bookId);
        const book = staticBook ?? (await loadSupabaseBook(bookId));

        if (!active) return;

        if (!book) {
          setLoadState({ status: "error", message: "Dit boek is niet gevonden, staat nog niet live, of je account heeft geen toegang." });
          return;
        }

        if (!book.nodes.length || !book.startNodeId) {
          setLoadState({ status: "error", message: "Dit boek heeft nog geen geldige start-node." });
          return;
        }

        const progress = await getReadingProgress(user, book.id);
        const progressNodeExists = progress?.currentNodeId
          ? book.nodes.some((node) => node.id === progress.currentNodeId)
          : false;

        setLoadState({ status: "ready", book });
        setCurrentNodeId(progressNodeExists ? progress!.currentNodeId : book.startNodeId);
        setPageIndex(progressNodeExists ? progress?.pageIndex ?? 0 : 0);
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
  }, [bookId, authLoading, user]);

  useEffect(() => {
    const savedTextSize = window.localStorage.getItem("dibooks-reader-text-size") as ReaderTextSize | null;
    const savedPageMode = window.localStorage.getItem("dibooks-reader-page-mode") as ReaderPageMode | null;
    const savedTheme = window.localStorage.getItem("dibooks-reader-theme") as ReaderTheme | null;

    if (savedTextSize === "small" || savedTextSize === "normal" || savedTextSize === "large") setTextSize(savedTextSize);
    if (savedPageMode === "auto" || savedPageMode === "single" || savedPageMode === "double") setPageMode(savedPageMode);
    if (savedTheme === "dark" || savedTheme === "light" || savedTheme === "sepia") setTheme(savedTheme);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("dibooks-reader-text-size", textSize);
  }, [textSize]);

  useEffect(() => {
    window.localStorage.setItem("dibooks-reader-page-mode", pageMode);
  }, [pageMode]);

  useEffect(() => {
    window.localStorage.setItem("dibooks-reader-theme", theme);
  }, [theme]);


  useEffect(() => {
    if (loadState.status !== "ready") return;
    setReaderFlags(loadReaderFlags(loadState.book.id));
    lastExecutedFunctionNodeRef.current = null;
  }, [loadState]);


  useEffect(() => {
    if (loadState.status !== "ready" || !user || !currentNodeId) return;

    const timeout = window.setTimeout(() => {
      const progressPercent = calculateBookProgressPercent(loadState.book, currentNodeId, pageIndex, readerPageCount);
      upsertReadingProgress(user, loadState.book.id, currentNodeId, pageIndex, progressPercent).catch((progressError) => {
        console.warn("Leesvoortgang opslaan mislukt.", progressError);
      });
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [currentNodeId, loadState, pageIndex, readerPageCount, user]);

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

    // Normale tekst-nodes mogen automatisch doorlopen in één leesflow.
    // Speciale pagina's moeten juist als een eigen pagina/scène blijven staan
    // en mogen niet samen met gewone tekst op dezelfde reader-pagina komen.
    const chainMode = node.type;

    while (cursor && (cursor.type === "text" || cursor.type === "special") && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      textNodes.push(cursor);
      const nodeHtml = cursor.textHtml || cursor.text || "Deze tekst-node is nog leeg.";
      const className = cursor.type === "special" ? "dibooks-special-page" : "dibooks-reader-section";
      htmlParts.push(`<section class="${className}" data-node-type="${cursor.type}">${nodeHtml}</section>`);

      const outgoing = book.edges.filter((edge) => edge.source === cursor!.id);
      if (outgoing.length !== 1) break;
      const maybeNext = book.nodes.find((item) => item.id === outgoing[0].target);
      if (!maybeNext) break;

      const mayAutoChainNextNode = chainMode === "text" && maybeNext.type === "text";
      if (!mayAutoChainNextNode) {
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




  useEffect(() => {
    if (!reader || reader.node.type !== "function" || loadState.status !== "ready") return;
    if (lastExecutedFunctionNodeRef.current === reader.node.id) return;

    lastExecutedFunctionNodeRef.current = reader.node.id;

    const nextFlags = applyReaderFunctionActions(readerFlags, reader.node.functionActions ?? []);
    setReaderFlags(nextFlags);
    saveReaderFlags(reader.book.id, nextFlags);

    const nextTargetId = reader.outgoingPaths[0]?.target;
    if (!nextTargetId) return;

    const timeout = window.setTimeout(() => {
      lastExecutedFunctionNodeRef.current = null;
      setCurrentNodeId(nextTargetId);
      setPageIndex(0);
    }, 80);

    return () => window.clearTimeout(timeout);
  }, [reader, readerFlags, loadState]);


  function goToFirstOutgoingNode() {
    if (!reader?.outgoingPaths.length) return;
    goToNode(reader.outgoingPaths[0].target);
  }

  function handleCutsceneLoadedMetadata(event: React.SyntheticEvent<HTMLVideoElement>) {
    setCutsceneFading(false);

    const shell = cutsceneShellRef.current;
    if (shell && !document.fullscreenElement && shell.requestFullscreen) {
      shell.requestFullscreen().catch(() => {
        // Browsers mogen echte fullscreen blokkeren zonder directe user gesture.
        // De reader blijft dan alsnog in full-viewport zonder HUD.
      });
    }

    event.currentTarget.play().catch(() => {
      // Autoplay met audio kan door sommige browsers worden geblokkeerd.
    });
  }

  function handleCutsceneTimeUpdate(event: React.SyntheticEvent<HTMLVideoElement>) {
    const video = event.currentTarget;
    if (!Number.isFinite(video.duration) || video.duration <= 0) return;
    setCutsceneFading(video.duration - video.currentTime <= 1.65);
  }

  function handleCutsceneEnded() {
    setCutsceneFading(false);

    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => undefined);
    }

    goToFirstOutgoingNode();
  }

  function goToNode(nodeId: string) {
    if (loadState.status !== "ready") return;
    const exists = loadState.book.nodes.some((node) => node.id === nodeId);
    if (!exists) {
      alert("Deze doel-node bestaat niet meer.");
      return;
    }

    lastExecutedFunctionNodeRef.current = null;
    setCurrentNodeId(nodeId);
    setPageIndex(0);
  }

  async function handleRestartReading() {
    if (loadState.status !== "ready" || !user) return;

    const confirmed = window.confirm(
      "Weet je dit zeker? Je leesvoortgang voor dit boek wordt gewist en je begint opnieuw bij het begin.",
    );

    if (!confirmed) return;

    setResetProgressBusy(true);

    try {
      await resetReadingProgress(user, loadState.book.id);
      clearReaderFlags(loadState.book.id);
      setReaderFlags({});
      lastExecutedFunctionNodeRef.current = null;
      setCurrentNodeId(loadState.book.startNodeId);
      setPageIndex(0);
      setReaderPageCount(1);
      setReaderVisiblePageCount(1);
      setSettingsOpen(false);
    } catch (resetError: any) {
      alert(`Leesvoortgang resetten mislukt: ${resetError?.message ?? "onbekende fout"}`);
    } finally {
      setResetProgressBusy(false);
    }
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
  const isCutsceneNode = node.type === "cutscene";
  const canGoPreviousPage = isTextNode && pageIndex > 0;
  const canGoNextPage = isTextNode && pageIndex < Math.max(1, readerPageCount) - readerVisiblePageCount;
  const readerShellClass =
    theme === "light"
      ? "bg-[#efe9dc] text-neutral-950"
      : theme === "sepia"
        ? "bg-[#2b2116] text-[#f3e4c9]"
        : "bg-[#05070d] text-white";
  const readerChromeClass =
    theme === "light"
      ? "border-neutral-300 bg-[#f8f5ee]/90 text-neutral-950"
      : theme === "sepia"
        ? "border-[#8f6b38]/35 bg-[#23190f]/90 text-[#f3e4c9]"
        : "border-white/10 bg-[#05070d]/90 text-white";

  return (
    <main className={`flex h-screen flex-col overflow-hidden ${readerShellClass}`}>
      {!isCutsceneNode && (
      <header className={`shrink-0 border-b px-4 py-3 backdrop-blur-xl sm:px-6 ${readerChromeClass}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-300">DiBooks Reader</p>
            <h1 className="truncate text-xl font-black sm:text-2xl">{book.title}</h1>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => setSettingsOpen((current) => !current)}
              className="rounded-full border border-white/10 px-4 py-2 text-xs font-black hover:bg-white/10"
              title="Reader instellingen"
            >
              Aa
            </button>
            <Link href={`/books/${book.id}`} className="rounded-full border border-white/10 px-4 py-2 text-xs font-black hover:bg-white/10">
              Boekinfo
            </Link>
            <button
              onClick={handleRestartReading}
              disabled={resetProgressBusy}
              className="rounded-full border border-red-400/30 bg-red-500/10 px-4 py-2 text-xs font-black text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              title="Leesvoortgang wissen en opnieuw beginnen"
            >
              {resetProgressBusy ? "Resetten..." : "↻ Opnieuw"}
            </button>
            <AppNavActions compact />
          </div>
        </div>

        {settingsOpen && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-black/20 p-3 text-xs font-black uppercase tracking-widest">
            <div className="flex items-center gap-2">
              <span className="opacity-60">Tekst</span>
              {(["small", "normal", "large"] as ReaderTextSize[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setTextSize(value)}
                  className={`rounded-full px-3 py-2 ${textSize === value ? "bg-blue-600 text-white" : "bg-white/5 hover:bg-white/10"}`}
                >
                  {value === "small" ? "Klein" : value === "large" ? "Groot" : "Normaal"}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="opacity-60">Pagina</span>
              {(["auto", "single", "double"] as ReaderPageMode[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setPageMode(value)}
                  className={`rounded-full px-3 py-2 ${pageMode === value ? "bg-blue-600 text-white" : "bg-white/5 hover:bg-white/10"}`}
                >
                  {value === "single" ? "Enkel" : value === "double" ? "Dubbel" : "Auto"}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="opacity-60">Thema</span>
              {(["dark", "sepia", "light"] as ReaderTheme[]).map((value) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`rounded-full px-3 py-2 ${theme === value ? "bg-blue-600 text-white" : "bg-white/5 hover:bg-white/10"}`}
                >
                  {value === "dark" ? "Donker" : value === "sepia" ? "Oud boek" : "Licht"}
                </button>
              ))}
            </div>
          </div>
        )}
      </header>
      )}

      <section className="min-h-0 flex-1 overflow-hidden">
        {isTextNode && (
          <BookPageReader
            html={reader.textHtml}
            pageIndex={pageIndex}
            setPageIndex={setPageIndex}
            onPageCountChange={setReaderPageCount}
            onVisiblePageCountChange={setReaderVisiblePageCount}
            textSize={textSize}
            pageMode={pageMode}
            theme={theme}
            isSpecialPage={node.type === "special"}
          />
        )}

        {node.type === "cutscene" && (
          <div ref={cutsceneShellRef} className="relative flex h-full w-full items-center justify-center overflow-hidden bg-black">
            {node.videoUrl ? (
              <>
                <video
                  key={`${node.id}-${node.videoUrl}`}
                  src={node.videoUrl}
                  autoPlay
                  playsInline
                  preload="auto"
                  controls={false}
                  onLoadedMetadata={handleCutsceneLoadedMetadata}
                  onTimeUpdate={handleCutsceneTimeUpdate}
                  onEnded={handleCutsceneEnded}
                  className={`h-full w-full bg-black object-contain transition-opacity duration-[1600ms] ${cutsceneFading ? "opacity-0" : "opacity-100"}`}
                />
                <div className={`pointer-events-none absolute inset-0 bg-black transition-opacity duration-[1600ms] ${cutsceneFading ? "opacity-100" : "opacity-0"}`} />
              </>
            ) : (
              <div className="rounded-3xl border border-red-500/25 bg-red-500/10 p-6 text-red-100">Deze cutscene heeft nog geen video.</div>
            )}
          </div>
        )}

        {node.type === "function" && (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-xl rounded-3xl border border-cyan-500/20 bg-cyan-500/10 p-8 text-center text-cyan-100 shadow-2xl">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">DiBooks functie</p>
              <h1 className="mt-3 text-3xl font-black">Verhaalstatus bijwerken...</h1>
              <p className="mt-3 text-sm font-semibold leading-6 text-cyan-100/70">
                Deze node is normaal onzichtbaar en stuurt automatisch door.
              </p>
            </div>
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

      {!isCutsceneNode && (
      <footer className={`shrink-0 border-t px-4 py-3 sm:px-6 ${readerChromeClass}`}>
        {isTextNode ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => setPageIndex((current) => Math.max(0, current - readerVisiblePageCount))}
              disabled={!canGoPreviousPage}
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-black text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
            >
              Vorige pagina
            </button>

            <div className="text-center text-sm font-bold text-neutral-400">
              <div>{readerVisiblePageCount === 2 && pageIndex + 1 < readerPageCount ? `Pagina ${pageIndex + 1}–${Math.min(pageIndex + 2, readerPageCount)} van ${readerPageCount}` : `Pagina ${pageIndex + 1} van ${readerPageCount}`}</div>
              <div className="text-xs text-neutral-600">{calculateBookProgressPercent(book, currentNodeId, pageIndex, readerPageCount)}% gelezen • {book.author}</div>
              <button
                onClick={handleRestartReading}
                disabled={resetProgressBusy}
                className="mt-2 rounded-full border border-red-400/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                {resetProgressBusy ? "Resetten..." : "Opnieuw lezen"}
              </button>
            </div>

            {canGoNextPage && (
              <button onClick={() => setPageIndex((current) => Math.min(Math.max(0, readerPageCount - 1), current + readerVisiblePageCount))} className="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-500">
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
      )}
    </main>
  );
}
