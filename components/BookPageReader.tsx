"use client";
import type React from "react";
import {useEffect,useRef,useState} from "react";
type ReaderTextSize = "small" | "normal" | "large";

type ReaderPageMode = "auto" | "single" | "double";

type ReaderTheme = "dark" | "light" | "sepia";

type ReaderLineSpacing = "compact" | "normal" | "relaxed";

type ReaderFontFamily = "serif" | "sans";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const MANUAL_PAGE_BREAK_MARKER = "[[NIEUWE_PAGINA]]";

const SCENE_INFO_MARKER_ATTR = "data-dibooks-scene-info";

function extractSceneInfoMarker(html: string) {
  const expression = new RegExp(
    `${SCENE_INFO_MARKER_ATTR}="([^"]*)"`,
    "gi",
  );
  let match: RegExpExecArray | null = null;
  let latestValue: string | null = null;

  while ((match = expression.exec(html)) !== null) {
    try {
      latestValue = decodeURIComponent(match[1] ?? "");
    } catch {
      latestValue = match[1] ?? "";
    }
  }

  return latestValue;
}

function buildPageSceneInfos(pages: string[], initialSceneInfo = "") {
  let activeSceneInfo = initialSceneInfo;

  return pages.map((pageHtml) => {
    const markerValue = extractSceneInfoMarker(pageHtml);
    if (markerValue !== null) activeSceneInfo = markerValue;
    return activeSceneInfo;
  });
}

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

    if (
      new RegExp(`${SCENE_INFO_MARKER_ATTR}="`, "i").test(
        withoutMarkers,
      )
    ) {
      blocks.push(withoutMarkers);
      return;
    }

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

function splitPlainTextIntoSentences(value: string) {
  const cleanValue = String(value ?? "").trim();
  if (!cleanValue) return [];

  // Intl.Segmenter begrijpt afkortingen en leestekens beter dan alleen regex.
  // De any-cast houdt dit compatibel met TypeScript builds die Segmenter nog
  // niet in hun lib-definities hebben staan.
  const SegmenterCtor = (Intl as any)?.Segmenter;

  if (SegmenterCtor) {
    try {
      const segmenter = new SegmenterCtor("nl", { granularity: "sentence" });
      const sentences = Array.from(
        segmenter.segment(cleanValue),
        (entry: any) => String(entry?.segment ?? "").trim(),
      ).filter(Boolean);

      if (sentences.length) return sentences;
    } catch {
      // Regex fallback hieronder.
    }
  }

  return (
    cleanValue.match(/[^.!?…]+(?:[.!?…]+["'”’)]*)?|.+$/g) ?? [cleanValue]
  )
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function splitLongPlainBlock(blockHtml: string, maxCharacters: number) {
  const plainText = stripHtml(blockHtml);
  if (plainText.length <= maxCharacters) return [blockHtml];

  const sentences = splitPlainTextIntoSentences(plainText);
  const pages: string[] = [];
  let current = "";

  function pushCurrent() {
    if (!current.trim()) return;
    pages.push(`<p>${escapeHtml(current.trim())}</p>`);
    current = "";
  }

  sentences.forEach((sentence) => {
    const cleanSentence = sentence.trim();
    if (!cleanSentence) return;

    const next = current ? `${current} ${cleanSentence}` : cleanSentence;

    // Normale situatie: hele zin naar de volgende pagina verplaatsen.
    if (next.length > maxCharacters && current) {
      pushCurrent();
    }

    // Alleen een uitzonderlijk lange zin mag uiteindelijk op woorden worden
    // gesplitst; zo voorkomen we normale afbrekingen midden in een zin.
    if (cleanSentence.length > maxCharacters) {
      cleanSentence.split(/\s+/).forEach((word) => {
        const nextWord = current ? `${current} ${word}` : word;
        if (nextWord.length > maxCharacters && current) pushCurrent();
        current = current ? `${current} ${word}` : word;
      });
      return;
    }

    current = current ? `${current} ${cleanSentence}` : cleanSentence;
  });

  pushCurrent();
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

function getReaderTypography(
  textSize: ReaderTextSize,
  lineSpacing: ReaderLineSpacing,
  fontFamily: ReaderFontFamily,
) {
  const fontSize =
    textSize === "small" ? 18 : textSize === "large" ? 24 : 20;

  const lineHeightMultiplier =
    lineSpacing === "compact" ? 1.72 : lineSpacing === "relaxed" ? 2.2 : 2;

  const paragraphGap =
    lineSpacing === "compact" ? 16 : lineSpacing === "relaxed" ? 32 : 24;

  return {
    fontSize,
    lineHeight: Math.round(fontSize * lineHeightMultiplier),
    paragraphGap,
    fontFamily:
      fontFamily === "serif"
        ? 'Georgia, "Times New Roman", Times, serif'
        : 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  };
}

function paginateTextHtmlMeasured(
  html: string,
  options: {
    maxCharacters: number;
    pageWidth: number;
    pageHeight: number;
    textSize: ReaderTextSize;
    theme: ReaderTheme;
    lineSpacing: ReaderLineSpacing;
    fontFamily: ReaderFontFamily;
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
  const typography = getReaderTypography(
    options.textSize,
    options.lineSpacing,
    options.fontFamily,
  );
  measuringBox.className = `dibooks-reader-content prose max-w-none ${options.theme === "light" ? "prose-neutral" : "prose-invert"}`;
  measuringBox.style.position = "fixed";
  measuringBox.style.left = "-100000px";
  measuringBox.style.top = "0";
  measuringBox.style.visibility = "hidden";
  measuringBox.style.pointerEvents = "none";
  measuringBox.style.zIndex = "-1";
  measuringBox.style.boxSizing = "border-box";
  measuringBox.style.width = `${Math.max(1, Math.floor(options.pageWidth))}px`;
  measuringBox.style.fontSize = `${typography.fontSize}px`;
  measuringBox.style.lineHeight = `${typography.lineHeight}px`;
  measuringBox.style.fontFamily = typography.fontFamily;
  measuringBox.style.maxWidth = "none";
  measuringBox.style.padding = "0";
  measuringBox.style.margin = "0";
  document.body.appendChild(measuringBox);

  function setAndMeasure(value: string) {
    measuringBox.innerHTML = value;
    measuringBox.querySelectorAll("p").forEach((paragraph) => {
      const element = paragraph as HTMLElement;
      element.style.marginTop = "0";
      element.style.marginBottom = `${typography.paragraphGap}px`;
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
  const maxHeight = Math.max(1, Math.floor(options.pageHeight) - 2);

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

    // Fit oversized paragraphs by measured height, preserving their inline markup.
    const source = document.createElement("div");
    source.innerHTML = blockHtml;
    const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let textNode: Node | null;
    while ((textNode = walker.nextNode())) textNodes.push(textNode as Text);
    const text = source.textContent || "";
    const fragment = (from: number, to: number) => {
      const clone = source.cloneNode(true) as HTMLDivElement;
      const cloneTexts: Text[] = [];
      const cloneWalker = document.createTreeWalker(clone, NodeFilter.SHOW_TEXT);
      let n: Node | null;
      while ((n = cloneWalker.nextNode())) cloneTexts.push(n as Text);
      let offset = 0;
      for (const node of cloneTexts) {
        const length = node.length;
        node.data = node.data.slice(Math.max(0, from - offset), Math.max(0, Math.min(length, to - offset)));
        offset += length;
      }
      return clone.innerHTML;
    };
    if (!textNodes.length || !text.length) { pages.push(blockHtml); return; }
    let from = 0;
    while (from < text.length) {
      let low = from + 1, high = text.length, fit = from;
      while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (setAndMeasure(fragment(from, mid)) <= maxHeight) { fit = mid; low = mid + 1; }
        else high = mid - 1;
      }
      // Always advance, even if one line is taller than a very small viewport.
      fit = Math.max(from + 1, fit);
      if (fit < text.length) {
        const boundary = text.slice(from, fit).search(/\s+\S*$/);
        if (boundary > 0) fit = from + boundary + 1;
      }
      const piece = fragment(from, fit);
      if (fit < text.length) pages.push(piece);
      else currentHtml = piece;
      from = fit;
    }
  });

  if (currentHtml.trim()) pages.push(currentHtml.trim());
  document.body.removeChild(measuringBox);

  return pages.length ? pages : paginateTextHtml(html, options.maxCharacters);
}

const noop = () => {};

export default function BookPageReader({
  onAnchorConsumed = noop,
  onTextOffset = noop,
  requestedAnchor,
  pageWidthMode,
  html,
  pageIndex,
  setPageIndex,
  onPageCountChange,
  onVisiblePageCountChange,
  textSize,
  pageMode,
  theme,
  lineSpacing,
  fontFamily,
  globalPageOffset,
  isSpecialPage = false,
  initialSceneInfo = "",
  onSceneInfoChange,
}: {
  onAnchorConsumed?: (value: undefined) => void;
  onTextOffset?: (offset: number) => void;
  requestedAnchor?: { offset: number; token: string };
  pageWidthMode: "compact" | "wide" | "full";
  html: string;
  pageIndex: number;
  setPageIndex: React.Dispatch<React.SetStateAction<number>>;
  onPageCountChange: (pageCount: number) => void;
  onVisiblePageCountChange: (visiblePageCount: number) => void;
  textSize: ReaderTextSize;
  pageMode: ReaderPageMode;
  theme: ReaderTheme;
  lineSpacing: ReaderLineSpacing;
  fontFamily: ReaderFontFamily;
  globalPageOffset: number;
  isSpecialPage?: boolean;
  initialSceneInfo?: string;
  onSceneInfoChange?: (sceneInfo: string) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const appliedAnchor = useRef<string | null>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [visiblePageCount, setVisiblePageCount] = useState(1);
  const [pageSceneInfos, setPageSceneInfos] = useState<string[]>([]);
  const layoutRef = useRef<{ html: string; pages: string[]; index: number; offset: number } | null>(null);
  const currentIndexRef = useRef(pageIndex);
  currentIndexRef.current = pageIndex;
  const maxSpreadWidth = pageWidthMode === "compact" ? 1500 : pageWidthMode === "wide" ? 2200 : undefined;
  const maxSingleWidth = pageWidthMode === "compact" ? 860 : pageWidthMode === "wide" ? 1100 : 1400;

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      const width = viewport.clientWidth;
      const height = viewport.clientHeight;
      if (width <= 0 || height <= 0) return;

      const shouldDouble =
        width >= 900 && (pageMode === "double" || (pageMode === "auto" && width >= 1120));
      const nextVisiblePageCount = shouldDouble ? 2 : 1;

      setVisiblePageCount(nextVisiblePageCount);
      onVisiblePageCountChange(nextVisiblePageCount);


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
      const pageHorizontalPadding = window.innerWidth >= 640 ? 64 : 32;
      const pageVerticalPadding = 76;
      const gridWidth = Math.min(width, nextVisiblePageCount === 2 ? (maxSpreadWidth ?? width) : maxSingleWidth);
      const pageOuterWidth = nextVisiblePageCount === 2 ? (gridWidth - 24) / 2 : gridWidth;
      const pageContentWidth = Math.max(1, pageOuterWidth - pageHorizontalPadding);
      const pageContentHeight = Math.max(1, height - pageVerticalPadding);
      const maxCharacters = Math.floor(baseMaxCharacters * fontMultiplier * heightMultiplier);
      const nextPages = paginateTextHtmlMeasured(html, {
        maxCharacters,
        pageWidth: pageContentWidth,
        pageHeight: pageContentHeight,
        textSize,
        theme,
        lineSpacing,
        fontFamily,
      });

      const previous = layoutRef.current;
      let nextIndex = currentIndexRef.current;
      const textLength = (value: string) => stripHtml(value).replace(/\s/g, "").length;
      let anchorOffset = 0;
      if (previous?.html === html && previous.pages.length) {
        // Follow the text at the start of the current page rather than its old number.
        const offset = nextIndex === previous.index ? previous.offset : previous.pages.slice(0, nextIndex).reduce((sum, page) => sum + textLength(page), 0);
        anchorOffset = offset;
        let consumed = 0;
        nextIndex = Math.max(0, nextPages.length - 1);
        for (let i = 0; i < nextPages.length; i++) {
          consumed += textLength(nextPages[i]);
          if (consumed > offset) { nextIndex = i; break; }
        }
      }
      nextIndex = Math.min(nextIndex, Math.max(0, nextPages.length - 1));
      if (previous?.html !== html) anchorOffset = nextPages.slice(0, nextIndex).reduce((sum, page) => sum + textLength(page), 0);
      if (requestedAnchor && appliedAnchor.current !== requestedAnchor.token) {
        anchorOffset = requestedAnchor.offset;
        let length = 0;
        nextIndex = Math.max(0, nextPages.length - 1);
        for (let i = 0; i < nextPages.length; i++) {
          length += textLength(nextPages[i]);
          if (length > anchorOffset) { nextIndex = i; break; }
        }
        appliedAnchor.current = requestedAnchor.token;
        onAnchorConsumed(undefined);
      }
      if (nextVisiblePageCount === 2) nextIndex -= nextIndex % 2;
      currentIndexRef.current = nextIndex;
      layoutRef.current = { html, pages: nextPages, index: nextIndex, offset: anchorOffset };
      setPageIndex(nextIndex);
      setPages(nextPages);
      setPageSceneInfos(buildPageSceneInfos(nextPages, initialSceneInfo));
      onPageCountChange(nextPages.length);
    };

    measure();
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewport);
    return () => resizeObserver.disconnect();
  }, [
    fontFamily,
    html,
    isSpecialPage,
    lineSpacing,
    onPageCountChange,
    onVisiblePageCountChange,
    pageMode,
    setPageIndex,
    textSize,
    theme,
    initialSceneInfo,
    maxSpreadWidth,
    maxSingleWidth,
    requestedAnchor,
    onAnchorConsumed,
  ]);

  useEffect(() => {
    onTextOffset(pages.slice(0, pageIndex).reduce((sum, page) => sum + stripHtml(page).replace(/\s/g, "").length, 0));
  }, [pages, pageIndex, onTextOffset]);

  useEffect(() => {
    onSceneInfoChange?.(
      pageSceneInfos[pageIndex] ?? initialSceneInfo ?? "",
    );
  }, [
    initialSceneInfo,
    onSceneInfoChange,
    pageIndex,
    pageSceneInfos,
  ]);

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
      ? "bg-[#fffaf0] text-neutral-950"
      : theme === "sepia"
        ? "bg-[#3a2a19] text-[#f3e4c9]"
        : "bg-neutral-950/95 text-white";

  const typography = getReaderTypography(
    textSize,
    lineSpacing,
    fontFamily,
  );

  const paragraphSpacingClass =
    lineSpacing === "compact"
      ? "[&_p]:mb-4"
      : lineSpacing === "relaxed"
        ? "[&_p]:mb-8"
        : "[&_p]:mb-6";

  const pageNumberClass =
    theme === "light"
      ? "text-neutral-500"
      : theme === "sepia"
        ? "text-[#c8ab80]/75"
        : "text-neutral-500";

  return (
    <div className="mx-auto flex h-full w-full flex-col px-2 py-1 sm:px-5">
      <div ref={viewportRef} className="min-h-0 flex-1 overflow-hidden">
        <div
          className={
            visiblePageCount === 2
              ? "mx-auto grid h-full grid-cols-2 gap-6"
              : "mx-auto grid h-full grid-cols-1"
          }
          style={{ maxWidth: visiblePageCount === 2 ? maxSpreadWidth : maxSingleWidth }}
        >
          {visiblePages.map((pageHtml, index) => (
            <article
              key={`${pageIndex}-${index}`}
              className={`relative h-full overflow-hidden rounded-sm px-4 pb-[52px] pt-6 shadow-none sm:px-8 ${pageClass}`}
            >
              <div
                className={`dibooks-reader-content prose max-w-none ${theme === "light" ? "prose-neutral" : "prose-invert"} ${paragraphSpacingClass} [&_p]:mt-0 [&_h1]:mb-4 [&_h1]:mt-0 [&_h2]:mb-4 [&_h2]:mt-0 [&_h3]:mb-4 [&_h3]:mt-0`}
                style={{
                  fontSize: `${typography.fontSize}px`,
                  lineHeight: `${typography.lineHeight}px`,
                  fontFamily: typography.fontFamily,
                }}
                dangerouslySetInnerHTML={{ __html: pageHtml }}
              />
              <div
                className={`pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 text-[11px] font-black tabular-nums ${pageNumberClass}`}
                aria-hidden="true"
              >
                {globalPageOffset + pageIndex + index + 1}
              </div>
            </article>
          ))}

          {visiblePageCount === 2 && visiblePages.length === 1 && (
            <article className={`h-full rounded-sm ${pageClass}`} />
          )}
        </div>
      </div>
    </div>
  );
}