"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Underline } from "@tiptap/extension-underline";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import { Extension } from "@tiptap/core";

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    fontSize: {
      setFontSize: (fontSize: string) => ReturnType;
      unsetFontSize: () => ReturnType;
    };
  }
}

const FontSize = Extension.create({
  name: "fontSize",

  addOptions() {
    return {
      types: ["textStyle"],
    };
  },

  addGlobalAttributes() {
    return [
      {
        types: this.options.types,
        attributes: {
          fontSize: {
            default: null,
            parseHTML: (element) => element.style.fontSize || null,
            renderHTML: (attributes) => {
              if (!attributes.fontSize) return {};
              return {
                style: `font-size: ${attributes.fontSize}`,
              };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setFontSize:
        (fontSize: string) =>
        ({ chain }: any) =>
          chain().setMark("textStyle", { fontSize }).run(),
      unsetFontSize:
        () =>
        ({ chain }: any) =>
          chain()
            .setMark("textStyle", { fontSize: null })
            .removeEmptyTextStyle()
            .run(),
    };
  },
});

type DiNodeType = "text" | "special" | "cutscene" | "choice" | "minigame";

type MiniGameDifficulty = "easy" | "normal" | "hard";

type DiNodeData = {
  label: string;
  type: DiNodeType;
  isStart?: boolean;
  text?: string;
  textHtml?: string;
  specialSubtype?: string;
  videoUrl?: string;
  videoFileName?: string;
  videoDuration?: number;
  choices?: {
    label: string;
    targetNodeId?: string;
  }[];
  miniGameType?: string;
  miniGameDuration?: number;
  miniGameDifficulty?: MiniGameDifficulty;
  miniGameAllowRetry?: boolean;
  miniGameSuccessTargetNodeId?: string;
  miniGameFailTargetNodeId?: string;
};

const nodeColors: Record<DiNodeType, string> = {
  text: "#2563eb",
  special: "#eab308",
  cutscene: "#16a34a",
  choice: "#f97316",
  minigame: "#9333ea",
};

const nodeLabels: Record<DiNodeType, string> = {
  text: "Tekst",
  special: "Speciale pagina",
  cutscene: "Cutscene",
  choice: "Keuze",
  minigame: "Mini game",
};

function stripHtml(html: string) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function BulletNode({ data }: NodeProps<Node<DiNodeData>>) {
  return (
    <div
      style={{
        width: 140,
        height: 140,
        position: "relative",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transform: "translate(-50%, -50%)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: data.isStart ? -46 : -18,
          left: "50%",
          transform: "translateX(-50%)",
          color: "#111",
          fontSize: 18,
          fontWeight: 900,
          whiteSpace: "nowrap",
          userSelect: "none",
          pointerEvents: "none",
          background: "rgba(247, 243, 234, 0.9)",
          padding: "2px 8px",
          borderRadius: 6,
          zIndex: 2,
          textAlign: "center",
        }}
      >
        {data.isStart && (
          <div style={{ color: "#d97706", fontSize: 26, lineHeight: 1 }}>★</div>
        )}
        {data.label}
      </div>

      <Handle
        id="in"
        type="target"
        position={Position.Left}
        style={{
          opacity: 0,
          width: 1,
          height: 1,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      <Handle
        id="out"
        type="source"
        position={Position.Right}
        style={{
          opacity: 0,
          width: 1,
          height: 1,
          left: "50%",
          top: "50%",
          transform: "translate(-50%, -50%)",
          pointerEvents: "none",
        }}
      />

      <div
        style={{
          color: nodeColors[data.type],
          fontSize: 170,
          fontWeight: 450,
          lineHeight: 1,
          userSelect: "none",
          pointerEvents: "none",
          zIndex: 1,
        }}
      >
        ×
      </div>
    </div>
  );
}

const initialNodes: Node<DiNodeData>[] = [
  {
    id: "node_1",
    type: "bullet",
    position: { x: 256, y: 256 },
    data: {
      label: "Intro",
      type: "text",
      text: "",
      textHtml: "",
    },
  },
];

function isNodeComplete(node: Node<DiNodeData> | undefined) {
  if (!node) return false;

  if (node.data.type === "text" || node.data.type === "special") {
    const plainText = node.data.text ?? stripHtml(node.data.textHtml ?? "");
    return plainText.trim().length > 0;
  }

  if (node.data.type === "cutscene") {
    return !!node.data.videoUrl && node.data.videoUrl.trim().length > 0;
  }

  if (node.data.type === "choice") {
    return (
      !!node.data.choices &&
      node.data.choices.length > 0 &&
      node.data.choices.some((choice) => choice.label.trim().length > 0)
    );
  }

  if (node.data.type === "minigame") {
    return (
      !!node.data.miniGameType &&
      node.data.miniGameType.trim().length > 0 &&
      (node.data.miniGameDuration ?? 5) > 0
    );
  }

  return false;
}

type RichTextEditorModalProps = {
  title: string;
  initialHtml: string;
  onSave: (html: string, plainText: string) => void;
  onClose: () => void;
};

function RichTextEditorModal({
  title,
  initialHtml,
  onSave,
  onClose,
}: RichTextEditorModalProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color.configure({ types: ["textStyle"] }),
      FontFamily.configure({ types: ["textStyle"] }),
      FontSize,
    ],
    content: initialHtml || "<p></p>",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class:
          "min-h-[62vh] rounded-xl bg-neutral-950 p-6 text-lg leading-relaxed text-white outline-none",
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.commands.setContent(initialHtml || "<p></p>");
  }, [editor, initialHtml]);

  if (!editor) return null;

  const buttonClass =
    "rounded-lg bg-neutral-800 px-3 py-2 text-sm font-black hover:bg-neutral-700";
  const activeButtonClass =
    "rounded-lg bg-blue-600 px-3 py-2 text-sm font-black hover:bg-blue-500";

  return (
    <div className="fixed inset-0 z-50 bg-black/75 p-6">
      <div className="mx-auto flex h-full max-w-6xl flex-col rounded-2xl border-4 border-black bg-neutral-900 shadow-2xl">
        <div className="flex items-center justify-between border-b-4 border-black p-4">
          <div>
            <h2 className="text-2xl font-black">Tekst editor</h2>
            <p className="text-sm text-neutral-400">{title}</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => {
                onSave(editor.getHTML(), editor.getText());
                onClose();
              }}
              className="rounded-xl bg-blue-600 px-5 py-3 font-black hover:bg-blue-500"
            >
              Opslaan
            </button>
            <button
              onClick={onClose}
              className="rounded-xl bg-neutral-700 px-5 py-3 font-black hover:bg-neutral-600"
            >
              Sluiten
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-b-4 border-black p-4">
          <button
            onClick={() => editor.chain().focus().toggleBold().run()}
            className={
              editor.isActive("bold") ? activeButtonClass : buttonClass
            }
          >
            B
          </button>
          <button
            onClick={() => editor.chain().focus().toggleItalic().run()}
            className={
              editor.isActive("italic") ? activeButtonClass : buttonClass
            }
          >
            I
          </button>
          <button
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            className={
              editor.isActive("underline") ? activeButtonClass : buttonClass
            }
          >
            U
          </button>

          <button
            onClick={() => editor.chain().focus().setParagraph().run()}
            className={
              editor.isActive("paragraph") ? activeButtonClass : buttonClass
            }
          >
            Tekst
          </button>
          <button
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 1 }).run()
            }
            className={
              editor.isActive("heading", { level: 1 })
                ? activeButtonClass
                : buttonClass
            }
          >
            Kop 1
          </button>
          <button
            onClick={() =>
              editor.chain().focus().toggleHeading({ level: 2 }).run()
            }
            className={
              editor.isActive("heading", { level: 2 })
                ? activeButtonClass
                : buttonClass
            }
          >
            Kop 2
          </button>
          <button
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            className={
              editor.isActive("bulletList") ? activeButtonClass : buttonClass
            }
          >
            Lijst
          </button>

          <select
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              editor.chain().focus().setFontFamily(value).run();
            }}
            defaultValue=""
            className="rounded-lg bg-neutral-800 px-3 py-2 text-sm font-black outline-none"
          >
            <option value="" disabled>
              Lettertype
            </option>
            <option value="Inter, Arial, sans-serif">Modern</option>
            <option value="Georgia, serif">Serif</option>
            <option value="Courier New, monospace">Terminal</option>
            <option value="Trebuchet MS, sans-serif">Trebuchet</option>
          </select>

          <select
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return;
              editor.chain().focus().setFontSize(value).run();
            }}
            defaultValue=""
            className="rounded-lg bg-neutral-800 px-3 py-2 text-sm font-black outline-none"
          >
            <option value="" disabled>
              Grootte
            </option>
            <option value="14px">14</option>
            <option value="16px">16</option>
            <option value="18px">18</option>
            <option value="22px">22</option>
            <option value="28px">28</option>
            <option value="36px">36</option>
          </select>

          <label className="flex items-center gap-2 rounded-lg bg-neutral-800 px-3 py-2 text-sm font-black">
            Kleur
            <input
              type="color"
              defaultValue="#ffffff"
              onChange={(event) =>
                editor.chain().focus().setColor(event.target.value).run()
              }
              className="h-7 w-10 cursor-pointer border-0 bg-transparent"
            />
          </label>

          <button
            onClick={() =>
              editor.chain().focus().unsetAllMarks().clearNodes().run()
            }
            className="rounded-lg bg-red-700 px-3 py-2 text-sm font-black hover:bg-red-600"
          >
            Reset stijl
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-neutral-950 p-4">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getTextLengthFromHtml(html: string) {
  if (typeof window === "undefined") return html.length;

  const temp = document.createElement("div");
  temp.innerHTML = html;
  return (temp.textContent || temp.innerText || "").trim().length;
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

  if (current) {
    pages.push(`<p>${escapeHtml(current)}</p>`);
  }

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

        splitPlainTextIntoParagraphPages(trimmedSentence, safeMax).forEach(
          (page) => pages.push(page),
        );
        return;
      }

      current = next;
    });

    if (current) {
      pages.push(`<${tagName}>${escapeHtml(current)}</${tagName}>`);
    }
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

      // Sections are wrappers from the node-chain. Their own text can be huge,
      // so we flatten their children instead of turning the whole section into
      // one plain-text block. That keeps paragraph spacing, headings and colors.
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
    return splitPlainTextIntoParagraphPages(
      container.textContent || "",
      safeMax,
    );
  }

  blocks.forEach((element) => {
    const tagName = element.tagName.toLowerCase();
    const elementHtml = element.outerHTML;
    const elementLength = (element.textContent || "").trim().length;

    if (!elementLength && tagName !== "br") return;

    if (
      tagName === "section" &&
      element.getAttribute("data-node-type") === "special"
    ) {
      pushCurrentPage();
      pages.push(element.outerHTML);
      currentHtml = "";
      currentLength = 0;
      return;
    }

    // Big paragraphs are split, but only after the current page is closed.
    // This preserves spacing between normal paragraphs instead of gluing the
    // whole section together.
    if (elementLength > safeMax) {
      pushCurrentPage();
      splitLongTextIntoPages(
        element.textContent || "",
        tagName === "h1" || tagName === "h2" || tagName === "h3"
          ? tagName
          : "p",
      );
      return;
    }

    appendBlock(elementHtml, elementLength);
  });

  pushCurrentPage();

  return pages.length > 0 ? pages : ["<p>Deze tekst is nog leeg.</p>"];
}

function BookPageReader({
  html,
  pageIndex,
  setPageIndex,
  onPageCountChange,
  onVisiblePageCountChange,
}: {
  html: string;
  pageIndex: number;
  setPageIndex: React.Dispatch<React.SetStateAction<number>>;
  onPageCountChange: (pageCount: number) => void;
  onVisiblePageCountChange: (visiblePageCount: number) => void;
}) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [pages, setPages] = useState<string[]>([
    "<p>Deze tekst is nog leeg.</p>",
  ]);
  const [visiblePageCount, setVisiblePageCount] = useState(1);

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

      const nextVisiblePageCount = viewportWidth >= 1100 ? 2 : 1;
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

      // Veiligere paginaberekening: iets minder tekst per bladzijde,
      // zodat de laatste regel niet onderaan wordt afgesneden.
      // Later maken we dit slimmer met breken op zin/alinea.
      const usableWidth = Math.max(280, singlePageWidth - 118);
      const usableHeight = Math.max(240, singlePageHeight - 210);
      const averageCharacterWidth = viewportWidth < 700 ? 10.4 : 11.2;
      const lineHeight = viewportWidth < 700 ? 36 : 40;

      const charactersPerLine = Math.max(
        22,
        Math.floor(usableWidth / averageCharacterWidth),
      );
      const linesPerPage = Math.max(6, Math.floor(usableHeight / lineHeight));

      // Extra conservatief: liever wat witruimte onderaan dan tekst die wegvalt.
      const maxCharacters = Math.floor(charactersPerLine * linesPerPage * 0.52);

      const nextPages = paginateHtml(html, maxCharacters);
      setPages(nextPages);
      onPageCountChange(nextPages.length);
    };

    measure();

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(viewport);

    return () => resizeObserver.disconnect();
  }, [html, onPageCountChange, onVisiblePageCountChange, setPageIndex]);

  useEffect(() => {
    if (pageIndex > pages.length - 1) {
      setPageIndex(Math.max(0, pages.length - 1));
    }
  }, [pageIndex, pages.length, setPageIndex]);

  const visiblePages = pages.slice(pageIndex, pageIndex + visiblePageCount);

  return (
    <div className="mx-auto flex h-full w-full flex-col px-3 py-3 sm:px-6">
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
              className="h-full overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/95 px-8 pb-20 pt-8 shadow-inner sm:px-12 sm:pb-24 sm:pt-10 md:px-16"
            >
              <div
                className="dibooks-reader-content prose prose-invert max-w-none text-[18px] leading-8 sm:text-[20px] sm:leading-9 [&_p]:mb-6 [&_p]:mt-0 [&_h1]:mb-4 [&_h1]:mt-0 [&_h2]:mb-4 [&_h2]:mt-0 [&_h3]:mb-4 [&_h3]:mt-0"
                dangerouslySetInnerHTML={{ __html: pageHtml }}
              />
            </article>
          ))}

          {visiblePageCount === 2 && visiblePages.length === 1 && (
            <article className="h-full rounded-2xl border border-neutral-900 bg-neutral-950/40" />
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
  const tolerance =
    difficulty === "easy" ? 15 : difficulty === "hard" ? 8 : 11;
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
          (pointerPositionRef.current + wobble - signalPositionRef.current) *
          0.22;
      } else {
        signalPositionRef.current +=
          (50 + wobble * 2 - signalPositionRef.current) * 0.035;
      }

      signalPositionRef.current = Math.max(
        0,
        Math.min(100, signalPositionRef.current),
      );

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

  const progressPercentage = Math.min(
    100,
    (stableSeconds / requiredSeconds) * 100,
  );
  const timePercentage = Math.min(
    100,
    (elapsedSeconds / timeLimitSeconds) * 100,
  );
  const isStable = Math.abs(signalPosition - 50) <= tolerance;

  return (
    <div className="mx-auto flex h-full max-w-5xl flex-col justify-center p-6">
      <div className="rounded-3xl border border-purple-800 bg-purple-950/30 p-6 shadow-2xl sm:p-8">
        <div className="mb-6">
          <p className="text-sm font-black uppercase tracking-widest text-purple-300">
            Mini game
          </p>
          <h1 className="mt-2 text-3xl font-black">{title}</h1>
          <p className="mt-3 text-neutral-300">
            Houd de signaallijn {requiredSeconds.toFixed(0)} seconden binnen de
            veilige zone. Werkt met muis én touch.
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
            style={{
              left: `${signalPosition}%`,
            }}
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
              <span>
                {stableSeconds.toFixed(1)} / {requiredSeconds.toFixed(0)} sec
              </span>
            </div>
            <div className="h-4 overflow-hidden rounded-full bg-neutral-800">
              <div
                className="h-full bg-cyan-400 transition-[width]"
                style={{ width: `${progressPercentage}%` }}
              />
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
              <div
                className="h-full bg-purple-500 transition-[width]"
                style={{ width: `${timePercentage}%` }}
              />
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
            <p className="text-xl font-black">
              {result === "success" ? "Gelukt." : "Mislukt."}
            </p>
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

export default function Home() {
  const [nodes, setNodes, onNodesChange] =
    useNodesState<Node<DiNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [startNodeId, setStartNodeId] = useState<string>("node_1");
  const [editingTextNodeId, setEditingTextNodeId] = useState<string | null>(
    null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewPageCount, setPreviewPageCount] = useState(1);
  const [readerVisiblePageCount, setReaderVisiblePageCount] = useState(1);
  const nodeTypes = useMemo(() => ({ bullet: BulletNode }), []);
  const previewNode = nodes.find((node) => node.id === previewNodeId);

  const textChain =
    previewNode?.data.type === "text" || previewNode?.data.type === "special"
      ? collectTextChain(previewNode.id)
      : {
          textNodes: [] as Node<DiNodeData>[],
          html: "",
          nextNodeAfterChain: null as Node<DiNodeData> | null,
        };

  const estimatedTotalBookPages = useMemo(() => {
    const totalCharacters = nodes
      .filter(
        (node) => node.data.type === "text" || node.data.type === "special",
      )
      .reduce((total, node) => {
        const rawText = stripHtml(node.data.textHtml || node.data.text || "");
        return total + rawText.length;
      }, 0);

    return Math.max(1, Math.ceil(totalCharacters / 1800));
  }, [nodes]);

  useEffect(() => {
    if (previewPageIndex > previewPageCount - 1) {
      setPreviewPageIndex(Math.max(0, previewPageCount - 1));
    }
  }, [previewPageIndex, previewPageCount]);

  const previewPaths = previewNode
    ? edges.filter((edge) => edge.source === previewNode.id)
    : [];

  const textChainBranchPaths =
    previewNode?.data.type === "text" || previewNode?.data.type === "special"
      ? edges.filter((edge) => {
          const lastTextNode = textChain.textNodes[textChain.textNodes.length - 1];
          return !!lastTextNode && edge.source === lastTextNode.id;
        })
      : [];

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const editingTextNode = nodes.find((node) => node.id === editingTextNodeId);

  const flowNodes = nodes.map((node) => ({
    ...node,
    draggable: true,
    data: {
      ...node.data,
      isStart: node.id === startNodeId,
    },
  }));

  const selectedNodePaths = selectedNode
    ? edges.filter((edge) => edge.source === selectedNode.id)
    : [];

  const availableTargetNodes = selectedNode
    ? [...nodes.filter((node) => node.id !== selectedNode.id)].sort((a, b) => {
        const aHasIncomingPath = edges.some((edge) => edge.target === a.id);
        const bHasIncomingPath = edges.some((edge) => edge.target === b.id);

        // Nodes zonder inkomend path eerst, zodat losse/vergeten nodes bovenaan staan.
        if (aHasIncomingPath !== bHasIncomingPath) {
          return aHasIncomingPath ? 1 : -1;
        }

        const distanceA = Math.hypot(
          a.position.x - selectedNode.position.x,
          a.position.y - selectedNode.position.y,
        );
        const distanceB = Math.hypot(
          b.position.x - selectedNode.position.x,
          b.position.y - selectedNode.position.y,
        );

        // Daarna de dichtstbijzijnde nodes rond de geselecteerde node.
        return distanceA - distanceB;
      })
    : [];

  function getValidatedEdges(
    currentEdges: Edge[],
    currentNodes: Node<DiNodeData>[],
  ) {
    return currentEdges.map((edge) => {
      const targetNode = currentNodes.find((node) => node.id === edge.target);
      const valid = isNodeComplete(targetNode);

      return {
        ...edge,
        animated: valid,
        style: {
          stroke: valid ? "#16a34a" : "#dc2626",
          strokeWidth: 5,
        },
      };
    });
  }

  function collectTextChain(startId: string | null) {
    if (!startId) {
      return {
        textNodes: [] as Node<DiNodeData>[],
        html: "",
        nextNodeAfterChain: null as Node<DiNodeData> | null,
      };
    }

    const textNodes: Node<DiNodeData>[] = [];
    const htmlParts: string[] = [];
    const visited = new Set<string>();

    let currentNode = nodes.find((node) => node.id === startId);

    while (
      currentNode &&
      (currentNode.data.type === "text" || currentNode.data.type === "special")
    ) {
      if (visited.has(currentNode.id)) break;

      visited.add(currentNode.id);
      textNodes.push(currentNode);

      const nodeHtml =
        currentNode.data.textHtml ||
        `<p>${escapeHtml(currentNode.data.text || "Deze tekst-node is nog leeg.")}</p>`;

      const sectionClass =
        currentNode.data.type === "special"
          ? "dibooks-reader-section dibooks-special-page"
          : "dibooks-reader-section";

      // Belangrijk: de node-titel is alleen voor de map/editor.
      // In reader mode tonen we alleen de inhoud die de auteur in de editor schrijft.
      htmlParts.push(`
        <section class="${sectionClass}" data-node-id="${currentNode.id}" data-node-type="${currentNode.data.type}">
          ${nodeHtml}
        </section>
      `);

      const outgoingPaths = edges.filter(
        (edge) => edge.source === currentNode!.id,
      );

      if (outgoingPaths.length !== 1) {
        return {
          textNodes,
          html: htmlParts.join(""),
          nextNodeAfterChain: null,
        };
      }

      const nextNode = nodes.find(
        (node) => node.id === outgoingPaths[0].target,
      );

      if (!nextNode) {
        return {
          textNodes,
          html: htmlParts.join(""),
          nextNodeAfterChain: null,
        };
      }

      if (nextNode.data.type !== "text" && nextNode.data.type !== "special") {
        return {
          textNodes,
          html: htmlParts.join(""),
          nextNodeAfterChain: nextNode,
        };
      }

      currentNode = nextNode;
    }

    return {
      textNodes,
      html: htmlParts.join(""),
      nextNodeAfterChain:
        currentNode &&
        currentNode.data.type !== "text" &&
        currentNode.data.type !== "special"
          ? currentNode
          : null,
    };
  }

  function saveProject() {
    const projectData = {
      version: 1,
      type: "dibooks-project",
      bookTitle: "Nieuw DiBooks verhaal",
      startNodeId,
      nodes,
      edges,
      savedAt: new Date().toISOString(),
    };

    const json = JSON.stringify(projectData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const fileName = `dibooks-project-${new Date()
      .toISOString()
      .slice(0, 10)}.dibooks-project.json`;

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();

    URL.revokeObjectURL(url);
  }

  function loadProject(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      try {
        const result = reader.result;

        if (typeof result !== "string") {
          alert("Kon het bestand niet lezen.");
          return;
        }

        const projectData = JSON.parse(result);

        if (projectData.type !== "dibooks-project") {
          alert("Dit is geen geldig DiBooks projectbestand.");
          return;
        }

        setNodes(projectData.nodes ?? []);
        setEdges(projectData.edges ?? []);
        setStartNodeId(projectData.startNodeId ?? "");

        alert("Project geladen.");
      } catch (error) {
        console.error(error);
        alert("Er ging iets mis met het laden van dit projectbestand.");
      }
    };

    reader.readAsText(file);

    event.target.value = "";
  }

  function openPreview() {
    if (!startNodeId) {
      alert("Kies eerst een start-node.");
      return;
    }

    const startNode = nodes.find((node) => node.id === startNodeId);

    if (!startNode) {
      alert("Start-node niet gevonden.");
      return;
    }

    setPreviewNodeId(startNodeId);
    setPreviewPageIndex(0);
    setPreviewPageCount(1);
    setReaderVisiblePageCount(1);
    setPreviewOpen(true);
  }

  function closePreview() {
    setPreviewOpen(false);
    setPreviewNodeId(null);
    setPreviewPageIndex(0);
    setPreviewPageCount(1);
    setReaderVisiblePageCount(1);
  }

  function goToPreviewNode(nodeId: string) {
    const targetNode = nodes.find((node) => node.id === nodeId);

    if (!targetNode) {
      alert("Deze doel-node bestaat niet meer.");
      return;
    }

    // Belangrijk: interactieve nodes zoals minigames moeten nooit worden
    // meegenomen alsof ze gewone tekstflow zijn. Daarom resetten we hier
    // altijd de reader-state voordat we naar een nieuwe node springen.
    setPreviewNodeId(nodeId);
    setPreviewPageIndex(0);
    setPreviewPageCount(1);
    setReaderVisiblePageCount(1);
  }

  function createNode(type: DiNodeType) {
    const id = `node_${Date.now()}`;

    const newNode: Node<DiNodeData> = {
      id,
      type: "bullet",
      position: {
        x: 256 + nodes.length * 96,
        y: 256 + nodes.length * 64,
      },
      data: {
        label: nodeLabels[type],
        type,
        text: type === "text" || type === "special" ? "" : undefined,
        textHtml: type === "text" || type === "special" ? "" : undefined,
        specialSubtype: type === "special" ? "Logboek" : undefined,
        videoUrl: type === "cutscene" ? "" : undefined,
        videoFileName: type === "cutscene" ? "" : undefined,
        videoDuration: type === "cutscene" ? 0 : undefined,
        choices:
          type === "choice"
            ? [
                { label: "Keuze A", targetNodeId: "" },
                { label: "Keuze B", targetNodeId: "" },
                { label: "Keuze C", targetNodeId: "" },
              ]
            : undefined,
        miniGameType: type === "minigame" ? "stabilize_line" : undefined,
        miniGameDuration: type === "minigame" ? 5 : undefined,
        miniGameDifficulty: type === "minigame" ? "normal" : undefined,
        miniGameAllowRetry: type === "minigame" ? true : undefined,
        miniGameSuccessTargetNodeId: type === "minigame" ? "" : undefined,
        miniGameFailTargetNodeId: type === "minigame" ? "" : undefined,
      },
    };

    setNodes((currentNodes) => [...currentNodes, newNode]);
    setSelectedNodeId(id);
  }

  function updateSelectedNodeLabel(label: string) {
    if (!selectedNodeId) return;

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                label,
              },
            }
          : node,
      ),
    );
  }

  function updateSelectedNodeText(text: string) {
    if (!selectedNodeId) return;

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                text,
                textHtml: text,
              },
            }
          : node,
      ),
    );
  }

  function updateNodeRichText(
    nodeId: string,
    textHtml: string,
    plainText: string,
  ) {
    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              data: {
                ...node.data,
                text: plainText,
                textHtml,
              },
            }
          : node,
      ),
    );
  }
  function updateSelectedCutsceneData(
    updates: Pick<Partial<DiNodeData>, "videoUrl" | "videoFileName" | "videoDuration">,
  ) {
    if (!selectedNodeId) return;

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                ...updates,
              },
            }
          : node,
      ),
    );
  }

  function handleCutsceneFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) return;

    if (!file.type.startsWith("video/")) {
      alert("Kies een videobestand, bijvoorbeeld .mp4, .webm of .mov.");
      return;
    }

    const maxFileSizeMb = 35;
    if (file.size > maxFileSizeMb * 1024 * 1024) {
      alert(`Deze video is groter dan ${maxFileSizeMb}MB. Voor nu is kort en gecomprimeerd beter.`);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      URL.revokeObjectURL(objectUrl);

      if (duration > 12.25) {
        alert(
          `Deze cutscene is ${duration.toFixed(1)} seconden. Maak hem maximaal 12 seconden.`,
        );
        return;
      }

      const reader = new FileReader();

      reader.onload = () => {
        updateSelectedCutsceneData({
          videoUrl: String(reader.result ?? ""),
          videoFileName: file.name,
          videoDuration: duration,
        });
      };

      reader.onerror = () => {
        alert("Deze video kon niet worden ingeladen.");
      };

      reader.readAsDataURL(file);
    };

    video.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      alert("Ik kon de lengte van deze video niet lezen. Probeer een .mp4 of .webm bestand.");
    };

    video.src = objectUrl;
  }

  function clearSelectedCutsceneVideo() {
    updateSelectedCutsceneData({
      videoUrl: "",
      videoFileName: "",
      videoDuration: 0,
    });
  }


  function addPathFromSelectedNode(targetNodeId: string) {
    if (!selectedNodeId) return;
    if (!targetNodeId) return;
    if (selectedNodeId === targetNodeId) return;

    const existingOutgoingEdges = edges.filter(
      (edge) => edge.source === selectedNodeId,
    );

    if (existingOutgoingEdges.length >= 10) {
      alert("Deze node heeft al het maximale aantal van 10 paths.");
      return;
    }

    const pathAlreadyExists = edges.some(
      (edge) => edge.source === selectedNodeId && edge.target === targetNodeId,
    );

    if (pathAlreadyExists) {
      alert("Deze path bestaat al.");
      return;
    }

    const newEdge: Edge = {
      id: `edge_${selectedNodeId}_${targetNodeId}_${Date.now()}`,
      source: selectedNodeId,
      target: targetNodeId,
      sourceHandle: "out",
      targetHandle: "in",
      animated: false,
      style: {
        stroke: "#dc2626",
        strokeWidth: 5,
      },
    };

    setEdges((currentEdges) => [...currentEdges, newEdge]);
  }

  function deletePath(edgeId: string) {
    setEdges((currentEdges) =>
      currentEdges.filter((edge) => edge.id !== edgeId),
    );
  }

  function deleteSelectedNode() {
    if (!selectedNode) return;

    if (nodes.length <= 1) {
      alert("Je kunt de laatste node niet verwijderen.");
      return;
    }

    const confirmed = window.confirm(
      `Weet je zeker dat je node "${selectedNode.data.label}" wilt verwijderen? Alle paths van en naar deze node worden ook verwijderd.`,
    );

    if (!confirmed) return;

    const deletedNodeId = selectedNode.id;
    const remainingNodes = nodes.filter((node) => node.id !== deletedNodeId);
    const nextStartNodeId =
      startNodeId === deletedNodeId ? remainingNodes[0]?.id ?? "" : startNodeId;

    setNodes((currentNodes) =>
      currentNodes
        .filter((node) => node.id !== deletedNodeId)
        .map((node) => {
          if (node.data.type === "choice") {
            return {
              ...node,
              data: {
                ...node.data,
                choices: (node.data.choices ?? []).map((choice) =>
                  choice.targetNodeId === deletedNodeId
                    ? { ...choice, targetNodeId: "" }
                    : choice,
                ),
              },
            };
          }

          if (node.data.type === "minigame") {
            return {
              ...node,
              data: {
                ...node.data,
                miniGameSuccessTargetNodeId:
                  node.data.miniGameSuccessTargetNodeId === deletedNodeId
                    ? ""
                    : node.data.miniGameSuccessTargetNodeId,
                miniGameFailTargetNodeId:
                  node.data.miniGameFailTargetNodeId === deletedNodeId
                    ? ""
                    : node.data.miniGameFailTargetNodeId,
              },
            };
          }

          return node;
        }),
    );

    setEdges((currentEdges) =>
      currentEdges.filter(
        (edge) => edge.source !== deletedNodeId && edge.target !== deletedNodeId,
      ),
    );

    setStartNodeId(nextStartNodeId);
    setSelectedNodeId(null);

    if (editingTextNodeId === deletedNodeId) {
      setEditingTextNodeId(null);
    }

    if (previewNodeId === deletedNodeId) {
      setPreviewOpen(false);
      setPreviewNodeId(null);
      setPreviewPageIndex(0);
    }
  }

  function updateSelectedChoice(
    choiceIndex: number,
    updates: { label?: string; targetNodeId?: string },
  ) {
    if (!selectedNodeId) return;

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== selectedNodeId) return node;

        const nextChoices = [
          ...(node.data.choices ?? [
            { label: "Keuze A", targetNodeId: "" },
            { label: "Keuze B", targetNodeId: "" },
            { label: "Keuze C", targetNodeId: "" },
          ]),
        ];

        nextChoices[choiceIndex] = {
          ...(nextChoices[choiceIndex] ?? { label: `Keuze ${choiceIndex + 1}` }),
          ...updates,
        };

        return {
          ...node,
          data: {
            ...node.data,
            choices: nextChoices.slice(0, 3),
          },
        };
      }),
    );

    if (updates.targetNodeId !== undefined) {
      setEdges((currentEdges) => {
        const edgePrefix = `choice_${selectedNodeId}_${choiceIndex}_`;
        const filteredEdges = currentEdges.filter((edge) => {
          const edgeChoiceIndex = (edge.data as { choiceIndex?: number } | undefined)
            ?.choiceIndex;

          return !(
            edge.source === selectedNodeId &&
            (edge.id.startsWith(edgePrefix) || edgeChoiceIndex === choiceIndex)
          );
        });

        if (!updates.targetNodeId) return filteredEdges;

        const choiceLetters = ["A", "B", "C"];

        const nextEdge: Edge = {
          id: `${edgePrefix}${updates.targetNodeId}_${Date.now()}`,
          source: selectedNodeId,
          target: updates.targetNodeId,
          sourceHandle: "out",
          targetHandle: "in",
          label: choiceLetters[choiceIndex] ?? `Keuze ${choiceIndex + 1}`,
          data: { choiceIndex },
          animated: false,
          style: {
            stroke: "#dc2626",
            strokeWidth: 5,
          },
        };

        return [...filteredEdges, nextEdge];
      });
    }
  }


  function updateSelectedMiniGameData(updates: Partial<DiNodeData>) {
    if (!selectedNodeId) return;

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selectedNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                ...updates,
              },
            }
          : node,
      ),
    );
  }

  function updateSelectedMiniGameRoute(
    routeType: "success" | "fail",
    targetNodeId: string,
  ) {
    if (!selectedNodeId) return;

    const dataKey =
      routeType === "success"
        ? "miniGameSuccessTargetNodeId"
        : "miniGameFailTargetNodeId";

    updateSelectedMiniGameData({
      [dataKey]: targetNodeId,
    } as Partial<DiNodeData>);

    setEdges((currentEdges) => {
      const filteredEdges = currentEdges.filter((edge) => {
        const miniGameResult = (edge.data as { miniGameResult?: string } | undefined)
          ?.miniGameResult;

        return !(
          edge.source === selectedNodeId && miniGameResult === routeType
        );
      });

      if (!targetNodeId) return filteredEdges;

      const nextEdge: Edge = {
        id: `minigame_${selectedNodeId}_${routeType}_${targetNodeId}_${Date.now()}`,
        source: selectedNodeId,
        target: targetNodeId,
        sourceHandle: "out",
        targetHandle: "in",
        label: routeType === "success" ? "Success" : "Fail",
        data: { miniGameResult: routeType },
        animated: false,
        style: {
          stroke: "#dc2626",
          strokeWidth: 5,
        },
      };

      return [...filteredEdges, nextEdge];
    });
  }

  function exportJson() {
    const storyData = {
      bookTitle: "Nieuw DiBooks verhaal",
      startNodeId,
      nodes: nodes.map((node) => ({
        id: node.id,
        type: node.data.type,
        title: node.data.label,
        position: node.position,
        content: {
          text: node.data.text ?? "",
          textHtml: node.data.textHtml ?? node.data.text ?? "",
          videoUrl: node.data.videoUrl ?? "",
          videoFileName: node.data.videoFileName ?? "",
          videoDuration: node.data.videoDuration ?? 0,
          choices: node.data.choices ?? [],
          miniGameType: node.data.miniGameType ?? "",
          miniGameDuration: node.data.miniGameDuration ?? 0,
          miniGameDifficulty: node.data.miniGameDifficulty ?? "",
          miniGameSuccessTargetNodeId: node.data.miniGameSuccessTargetNodeId ?? "",
          miniGameFailTargetNodeId: node.data.miniGameFailTargetNodeId ?? "",
          specialSubtype: node.data.specialSubtype ?? "",
        },
      })),
      edges: edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
      })),
    };

    console.log(JSON.stringify(storyData, null, 2));
    alert("Export staat in de browser console.");
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-neutral-950 text-white">
      <div className="flex h-full">
        <aside className="w-72 border-r-4 border-black bg-neutral-950 p-4">
          <div className="mb-6">
            <div className="flex items-baseline leading-none">
              <span className="text-4xl font-black tracking-tight text-white">
                DI
              </span>
              <span
                className="ml-1 text-4xl italic text-white"
                style={{ fontFamily: "Georgia, Times New Roman, serif" }}
              >
                Books
              </span>
            </div>
            <p className="mt-2 text-sm text-neutral-400">Auteur Studio</p>
          </div>

          <div className="grid gap-3">
            <button
              onClick={() => createNode("text")}
              className="rounded-xl bg-blue-600 px-4 py-3 font-bold hover:bg-blue-500"
            >
              + Tekst
            </button>

            <button
              onClick={() => createNode("special")}
              className="rounded-xl bg-yellow-500 px-4 py-3 font-bold text-black hover:bg-yellow-400"
            >
              + Speciale pagina
            </button>

            <button
              onClick={() => createNode("cutscene")}
              className="rounded-xl bg-green-600 px-4 py-3 font-bold hover:bg-green-500"
            >
              + Cutscene
            </button>

            <button
              onClick={() => createNode("choice")}
              className="rounded-xl bg-orange-500 px-4 py-3 font-bold hover:bg-orange-400"
            >
              + Keuze menu
            </button>

            <button
              onClick={() => createNode("minigame")}
              className="rounded-xl bg-purple-600 px-4 py-3 font-bold hover:bg-purple-500"
            >
              + Mini game
            </button>

            <button
              onClick={saveProject}
              className="mt-6 rounded-xl bg-cyan-600 px-4 py-3 font-black text-white hover:bg-cyan-500"
            >
              Save project
            </button>

            <label className="cursor-pointer rounded-xl bg-sky-700 px-4 py-3 text-center font-black text-white hover:bg-sky-600">
              Load project
              <input
                type="file"
                accept=".json,.dibooks-project.json"
                onChange={loadProject}
                className="hidden"
              />
            </label>

            <button
              onClick={openPreview}
              className="rounded-xl bg-emerald-600 px-4 py-3 font-black text-white hover:bg-emerald-500"
            >
              Play project
            </button>

            <button
              onClick={exportJson}
              className="mt-6 rounded-xl bg-white px-4 py-3 font-black text-black hover:bg-neutral-200"
            >
              Export JSON
            </button>
          </div>

          <div className="mt-6 rounded-xl bg-neutral-900 p-3 text-sm text-neutral-300">
            Sleep nodes over het raster. Klik op een node en gebruik rechts Add
            path om de flow te maken.
          </div>
        </aside>

        <section className="flex-1 bg-[#f7f3ea]">
          <ReactFlow
            nodes={flowNodes}
            edges={getValidatedEdges(edges, nodes)}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            nodesConnectable={false}
            nodesDraggable={true}
            elementsSelectable={true}
            defaultViewport={{ x: 0, y: 0, zoom: 1 }}
            minZoom={0.4}
            maxZoom={1.4}
            nodeTypes={nodeTypes}
            nodeOrigin={[0.5, 0.5]}
            snapToGrid={true}
            snapGrid={[64, 64]}
          >
            <Background
              variant={BackgroundVariant.Lines}
              gap={64}
              lineWidth={2}
              color="#350a0a"
            />
            <Controls />
            <MiniMap />
          </ReactFlow>
        </section>

        <aside className="w-80 overflow-y-auto border-l-4 border-black bg-neutral-950 p-4">
          <h2 className="mb-4 text-xl font-black">Node instellingen</h2>

          {!selectedNode && (
            <p className="text-neutral-400">
              Klik op een node om deze te bewerken.
            </p>
          )}

          {selectedNode && (
            <div className="grid gap-4">
              <div>
                <label className="mb-2 block text-sm font-bold">Titel</label>
                <input
                  value={selectedNode.data.label}
                  onChange={(event) =>
                    updateSelectedNodeLabel(event.target.value)
                  }
                  className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-900 p-3 text-white outline-none focus:border-white"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-bold">Type</label>
                <div
                  className="rounded-lg border-2 border-black p-3 font-black"
                  style={{
                    background: nodeColors[selectedNode.data.type],
                  }}
                >
                  {nodeLabels[selectedNode.data.type]}
                </div>
              </div>

              {selectedNode.data.type === "special" && (
                <div>
                  <label className="mb-2 block text-sm font-bold">
                    Sub-type / stijlnaam
                  </label>
                  <input
                    value={selectedNode.data.specialSubtype ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      setNodes((currentNodes) =>
                        currentNodes.map((node) =>
                          node.id === selectedNode.id
                            ? {
                                ...node,
                                data: {
                                  ...node.data,
                                  specialSubtype: value,
                                },
                              }
                            : node,
                        ),
                      );
                    }}
                    placeholder="Bijv. Logboek, Brief, Dossier, Dagboek..."
                    className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-900 p-3 text-white outline-none focus:border-yellow-500"
                  />
                  <p className="mt-2 text-xs text-neutral-500">
                    Speciale pagina wordt in reader mode altijd als eigen
                    bladzijde getoond.
                  </p>
                </div>
              )}

              <button
                onClick={() => setStartNodeId(selectedNode.id)}
                className={`rounded-xl px-4 py-3 font-black ${
                  selectedNode.id === startNodeId
                    ? "bg-yellow-500 text-black"
                    : "bg-neutral-800 text-white hover:bg-neutral-700"
                }`}
              >
                {selectedNode.id === startNodeId
                  ? "Dit is de start-node ★"
                  : "Maak start-node"}
              </button>

              <div className="rounded-xl border border-red-900/70 bg-red-950/30 p-3">
                <div className="mb-2 text-sm font-black text-red-200">
                  Gevarenzone
                </div>
                <button
                  onClick={deleteSelectedNode}
                  disabled={nodes.length <= 1}
                  className="w-full rounded-xl bg-red-700 px-4 py-3 font-black text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
                >
                  Delete node
                </button>
                <p className="mt-2 text-xs text-red-200/70">
                  Verwijdert deze node plus alle paths van en naar deze node.
                </p>
              </div>

              {selectedNode.data.type !== "choice" &&
                selectedNode.data.type !== "minigame" && (
              <div className="rounded-xl bg-neutral-900 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-black">Paths</h3>
                  <span className="text-sm text-neutral-400">
                    {selectedNodePaths.length}/10
                  </span>
                </div>

                <label className="mb-2 block text-sm font-bold">
                  Add path naar node
                </label>

                <select
                  defaultValue=""
                  onChange={(event) => {
                    addPathFromSelectedNode(event.target.value);
                    event.target.value = "";
                  }}
                  className="mb-4 w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-white"
                >
                  <option value="" disabled>
                    Kies een node...
                  </option>

                  {availableTargetNodes.map((node) => (
                    <option key={node.id} value={node.id}>
                      {node.data.label} — {node.data.type}
                    </option>
                  ))}
                </select>

                {selectedNodePaths.length === 0 && (
                  <p className="text-sm text-neutral-500">
                    Deze node heeft nog geen paths.
                  </p>
                )}

                <div className="grid gap-2">
                  {selectedNodePaths.map((edge) => {
                    const targetNode = nodes.find(
                      (node) => node.id === edge.target,
                    );

                    return (
                      <div
                        key={edge.id}
                        className="rounded-lg border border-neutral-700 bg-neutral-950 p-3"
                      >
                        <div className="mb-2 text-sm">
                          Naar:{" "}
                          <span className="font-bold text-white">
                            {targetNode?.data.label ?? "Onbekende node"}
                          </span>
                        </div>

                        <button
                          onClick={() => deletePath(edge.id)}
                          className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-500"
                        >
                          Verwijder path
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              )}

              {(selectedNode.data.type === "text" ||
                selectedNode.data.type === "special") && (
                <div>
                  <label className="mb-2 block text-sm font-bold">
                    Tekst / inhoud
                  </label>

                  <button
                    onClick={() => setEditingTextNodeId(selectedNode.id)}
                    className="mb-3 w-full rounded-xl bg-blue-600 px-4 py-3 font-black hover:bg-blue-500"
                  >
                    Open grote tekst editor
                  </button>

                  <textarea
                    value={selectedNode.data.text ?? ""}
                    onChange={(event) =>
                      updateSelectedNodeText(event.target.value)
                    }
                    placeholder="Schrijf hier kort, of open de grote editor..."
                    className="h-40 w-full resize-none rounded-lg border-2 border-neutral-700 bg-neutral-900 p-3 text-white outline-none focus:border-blue-500"
                  />

                  {selectedNode.data.textHtml && (
                    <div className="mt-3 rounded-lg bg-neutral-900 p-3 text-sm text-neutral-400">
                      Rich text opgeslagen. Open de grote editor om stijl en
                      opmaak aan te passen.
                    </div>
                  )}
                </div>
              )}

              {selectedNode.data.type === "cutscene" && (
                <div className="rounded-xl bg-neutral-900 p-3">
                  <div className="mb-4">
                    <h3 className="font-black text-green-300">Cutscene</h3>
                    <p className="mt-1 text-sm text-neutral-400">
                      Voeg een kort videofragment toe. Voor DiBooks houden we cutscenes maximaal 12 seconden.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    <div>
                      <label className="mb-2 block text-sm font-black">
                        Video uploaden
                      </label>
                      <input
                        type="file"
                        accept="video/*"
                        onChange={handleCutsceneFileUpload}
                        className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-sm text-white file:mr-3 file:rounded-lg file:border-0 file:bg-green-600 file:px-3 file:py-2 file:font-black file:text-white hover:file:bg-green-500"
                      />
                      <p className="mt-2 text-xs text-neutral-500">
                        Tip: gebruik een gecomprimeerde .mp4 of .webm van maximaal 12 seconden.
                      </p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-black">
                        Of plak een video URL
                      </label>
                      <input
                        value={selectedNode.data.videoUrl ?? ""}
                        onChange={(event) =>
                          updateSelectedCutsceneData({
                            videoUrl: event.target.value,
                            videoFileName: event.target.value ? "Video URL" : "",
                            videoDuration: 0,
                          })
                        }
                        placeholder="https://.../cutscene.mp4"
                        className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-green-400"
                      />
                      <p className="mt-2 text-xs text-yellow-400/80">
                        Bij een URL kan de editor niet altijd vooraf controleren of hij onder 12 seconden blijft.
                      </p>
                    </div>

                    {selectedNode.data.videoUrl && (
                      <div className="rounded-xl border border-green-800 bg-green-950/30 p-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-black text-green-200">
                              {selectedNode.data.videoFileName || "Cutscene video"}
                            </p>
                            <p className="text-xs text-neutral-400">
                              {selectedNode.data.videoDuration
                                ? `${selectedNode.data.videoDuration.toFixed(1)} sec / max 12 sec`
                                : "Lengte onbekend"}
                            </p>
                          </div>

                          <button
                            onClick={clearSelectedCutsceneVideo}
                            className="rounded-lg bg-red-700 px-3 py-2 text-xs font-black text-white hover:bg-red-600"
                          >
                            Video verwijderen
                          </button>
                        </div>

                        <video
                          src={selectedNode.data.videoUrl}
                          controls
                          className="max-h-48 w-full rounded-lg bg-black"
                        />
                      </div>
                    )}

                    {!selectedNode.data.videoUrl && (
                      <div className="rounded-xl border border-dashed border-neutral-700 bg-neutral-950 p-4 text-sm text-neutral-400">
                        Nog geen video toegevoegd. Deze cutscene-node wordt rood totdat er een video is gekoppeld.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedNode.data.type === "choice" && (
                <div className="rounded-xl bg-neutral-900 p-3">
                  <div className="mb-4">
                    <h3 className="font-black">Keuze menu</h3>
                    <p className="mt-1 text-sm text-neutral-400">
                      Maximaal 3 keuzes. Elke keuze maakt automatisch een path/lijn naar de gekozen node.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    {(selectedNode.data.choices ?? [
                      { label: "Keuze A", targetNodeId: "" },
                      { label: "Keuze B", targetNodeId: "" },
                      { label: "Keuze C", targetNodeId: "" },
                    ]).slice(0, 3).map((choice, choiceIndex) => {
                      const choiceLetter = ["A", "B", "C"][choiceIndex];

                      return (
                        <div
                          key={choiceIndex}
                          className="rounded-xl border border-neutral-700 bg-neutral-950 p-3"
                        >
                          <label className="mb-2 block text-sm font-black text-orange-300">
                            Keuze {choiceLetter}
                          </label>

                          <input
                            value={choice.label}
                            onChange={(event) =>
                              updateSelectedChoice(choiceIndex, {
                                label: event.target.value,
                              })
                            }
                            placeholder={`Tekst voor keuze ${choiceLetter}...`}
                            className="mb-3 w-full rounded-lg border-2 border-neutral-700 bg-neutral-900 p-3 text-white outline-none focus:border-orange-400"
                          />

                          <label className="mb-2 block text-sm font-bold">
                            Gaat naar node
                          </label>

                          <select
                            value={choice.targetNodeId ?? ""}
                            onChange={(event) =>
                              updateSelectedChoice(choiceIndex, {
                                targetNodeId: event.target.value,
                              })
                            }
                            className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-900 p-3 text-white outline-none focus:border-orange-400"
                          >
                            <option value="">Nog geen doel gekozen...</option>
                            {availableTargetNodes.map((node) => (
                              <option key={node.id} value={node.id}>
                                {node.data.label} — {nodeLabels[node.data.type]}
                              </option>
                            ))}
                          </select>

                          {choice.targetNodeId && (
                            <button
                              onClick={() =>
                                updateSelectedChoice(choiceIndex, {
                                  targetNodeId: "",
                                })
                              }
                              className="mt-3 rounded-lg bg-red-600 px-3 py-2 text-sm font-bold text-white hover:bg-red-500"
                            >
                              Verwijder keuze-path
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedNode.data.type === "minigame" && (
                <div className="rounded-xl bg-neutral-900 p-3">
                  <div className="mb-4">
                    <h3 className="font-black text-purple-300">Mini game</h3>
                    <p className="mt-1 text-sm text-neutral-400">
                      Voor nu bouwen we de eerste basisgame: Stabiliseer lijn. Later kunnen Reactie klik, Code invoeren en plugin-games erbij.
                    </p>
                  </div>

                  <div className="grid gap-4">
                    <div>
                      <label className="mb-2 block text-sm font-black">
                        Mini game type
                      </label>
                      <select
                        value={
                          selectedNode.data.miniGameType === "reaction_click" ||
                          selectedNode.data.miniGameType === "code_input"
                            ? selectedNode.data.miniGameType
                            : "stabilize_line"
                        }
                        onChange={(event) =>
                          updateSelectedMiniGameData({
                            miniGameType: event.target.value,
                          })
                        }
                        className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-purple-400"
                      >
                        <option value="stabilize_line">Stabiliseer lijn</option>
                        <option value="reaction_click" disabled>
                          Reactie klik — komt later
                        </option>
                        <option value="code_input" disabled>
                          Code invoeren — komt later
                        </option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="mb-2 block text-sm font-black">
                          Duur
                        </label>
                        <input
                          type="number"
                          min={3}
                          max={12}
                          value={selectedNode.data.miniGameDuration ?? 5}
                          onChange={(event) =>
                            updateSelectedMiniGameData({
                              miniGameDuration: Math.max(
                                3,
                                Math.min(12, Number(event.target.value) || 5),
                              ),
                            })
                          }
                          className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-purple-400"
                        />
                      </div>

                      <div>
                        <label className="mb-2 block text-sm font-black">
                          Moeilijkheid
                        </label>
                        <select
                          value={selectedNode.data.miniGameDifficulty ?? "normal"}
                          onChange={(event) =>
                            updateSelectedMiniGameData({
                              miniGameDifficulty: event.target
                                .value as MiniGameDifficulty,
                            })
                          }
                          className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-purple-400"
                        >
                          <option value="easy">Makkelijk</option>
                          <option value="normal">Normaal</option>
                          <option value="hard">Moeilijk</option>
                        </select>
                      </div>
                    </div>

                    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-purple-800 bg-purple-950/30 p-3">
                      <input
                        type="checkbox"
                        checked={selectedNode.data.miniGameAllowRetry ?? true}
                        onChange={(event) =>
                          updateSelectedMiniGameData({
                            miniGameAllowRetry: event.target.checked,
                          })
                        }
                        className="mt-1 h-5 w-5 accent-purple-500"
                      />
                      <div>
                        <div className="font-black text-purple-100">
                          Speler mag opnieuw proberen
                        </div>
                        <p className="mt-1 text-xs text-neutral-400">
                          Zet dit uit als falen direct een andere verhaallijn moet starten.
                        </p>
                      </div>
                    </label>

                    <div className="rounded-xl border border-cyan-800 bg-cyan-950/20 p-3">
                      <label className="mb-2 block text-sm font-black text-cyan-200">
                        Success route
                      </label>
                      <select
                        value={selectedNode.data.miniGameSuccessTargetNodeId ?? ""}
                        onChange={(event) =>
                          updateSelectedMiniGameRoute(
                            "success",
                            event.target.value,
                          )
                        }
                        className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-cyan-400"
                      >
                        <option value="">Nog geen success doel...</option>
                        {availableTargetNodes.map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.data.label} — {nodeLabels[node.data.type]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-xl border border-red-900 bg-red-950/20 p-3">
                      <label className="mb-2 block text-sm font-black text-red-200">
                        Fail route
                      </label>
                      <select
                        value={selectedNode.data.miniGameFailTargetNodeId ?? ""}
                        onChange={(event) =>
                          updateSelectedMiniGameRoute("fail", event.target.value)
                        }
                        className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-red-400"
                      >
                        <option value="">Nog geen fail doel...</option>
                        {availableTargetNodes.map((node) => (
                          <option key={node.id} value={node.id}>
                            {node.data.label} — {nodeLabels[node.data.type]}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="rounded-xl border border-purple-800 bg-purple-950/30 p-3 text-sm text-purple-100/80">
                      In reader mode krijgt deze minigame fullscreen gameplay.
                      Bij succes of fail stuurt hij automatisch door naar de gekozen route.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {editingTextNode &&
        (editingTextNode.data.type === "text" ||
          editingTextNode.data.type === "special") && (
          <RichTextEditorModal
            title={editingTextNode.data.label}
            initialHtml={
              editingTextNode.data.textHtml || editingTextNode.data.text || ""
            }
            onSave={(html, plainText) =>
              updateNodeRichText(editingTextNode.id, html, plainText)
            }
            onClose={() => setEditingTextNodeId(null)}
          />
        )}
      {previewOpen && previewNode && (
        <div className="fixed inset-0 z-50 flex min-h-screen flex-col bg-neutral-950 text-white">
          <div className="flex shrink-0 items-center justify-between border-b border-neutral-800 px-4 py-3 sm:px-6">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                Reader mode
              </p>
              <h2 className="text-xl font-black sm:text-2xl">
                {previewNode.data.type === "text" ||
                previewNode.data.type === "special"
                  ? "The Sovereign"
                  : previewNode.data.label}
              </h2>
            </div>

            <button
              onClick={closePreview}
              className="rounded-xl bg-red-600 px-4 py-2 font-black text-white hover:bg-red-500"
            >
              Sluiten
            </button>
          </div>

          <div className="min-h-0 flex-1">
            {(previewNode.data.type === "text" ||
              previewNode.data.type === "special") && (
              <BookPageReader
                html={textChain.html}
                pageIndex={previewPageIndex}
                setPageIndex={setPreviewPageIndex}
                onPageCountChange={setPreviewPageCount}
                onVisiblePageCountChange={setReaderVisiblePageCount}
              />
            )}

            {previewNode.data.type === "cutscene" && (
              <div className="flex h-full items-center justify-center bg-black p-4 sm:p-6">
                {previewNode.data.videoUrl ? (
                  <div className="w-full max-w-6xl">
                    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <p className="text-xs font-black uppercase tracking-widest text-green-400">
                          Cutscene
                        </p>
                        <h1 className="text-2xl font-black">
                          {previewNode.data.label}
                        </h1>
                      </div>
                      <p className="text-sm font-bold text-neutral-400">
                        Max 12 sec
                        {previewNode.data.videoDuration
                          ? ` • ${previewNode.data.videoDuration.toFixed(1)} sec`
                          : ""}
                      </p>
                    </div>

                    <video
                      src={previewNode.data.videoUrl}
                      controls
                      playsInline
                      autoPlay
                      className="max-h-[76vh] w-full rounded-2xl bg-black object-contain shadow-2xl"
                    />
                  </div>
                ) : (
                  <div className="rounded-xl border border-red-700 bg-red-950/40 p-5 text-red-200">
                    Deze cutscene heeft nog geen video.
                  </div>
                )}
              </div>
            )}

            {previewNode.data.type === "choice" && (
              <div className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-4 p-6">
                <div className="rounded-2xl bg-neutral-900 p-8">
                  <p className="text-sm font-bold uppercase tracking-widest text-orange-400">
                    Keuze moment
                  </p>
                  <h1 className="mt-2 text-3xl font-black">
                    {previewNode.data.label}
                  </h1>
                  <div className="mt-6 grid gap-3">
                    {(previewNode.data.choices ?? [])
                      .slice(0, 3)
                      .filter((choice) => choice.label.trim().length > 0)
                      .map((choice, choiceIndex) => {
                        const targetNode = nodes.find(
                          (node) => node.id === choice.targetNodeId,
                        );

                        return (
                          <button
                            key={choiceIndex}
                            onClick={() => {
                              if (!choice.targetNodeId) return;
                              goToPreviewNode(choice.targetNodeId);
                            }}
                            disabled={!choice.targetNodeId}
                            className="rounded-xl border border-orange-700 bg-orange-600 px-5 py-4 text-left text-lg font-black text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <span className="mr-3 text-orange-200">
                              {["A", "B", "C"][choiceIndex]}.
                            </span>
                            {choice.label}
                            {targetNode && (
                              <span className="mt-1 block text-sm font-bold text-orange-100/80">
                                Naar: {targetNode.data.label}
                              </span>
                            )}
                          </button>
                        );
                      })}

                    {(previewNode.data.choices ?? []).filter(
                      (choice) => choice.label.trim().length > 0,
                    ).length === 0 && (
                      <p className="rounded-xl bg-neutral-950 p-4 text-neutral-400">
                        Deze keuze-node heeft nog geen keuzes ingevuld.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {previewNode.data.type === "minigame" && (
              <>
                {previewNode.data.miniGameType === "stabilize_line" ||
                previewNode.data.miniGameType === "tap_symbol" ||
                !previewNode.data.miniGameType ? (
                  <StabilizeLineMiniGame
                    key={previewNode.id}
                    title={previewNode.data.label}
                    duration={previewNode.data.miniGameDuration ?? 5}
                    difficulty={previewNode.data.miniGameDifficulty ?? "normal"}
                    allowRetry={previewNode.data.miniGameAllowRetry ?? true}
                    onSuccess={() => {
                      const targetId =
                        previewNode.data.miniGameSuccessTargetNodeId ||
                        edges.find(
                          (edge) =>
                            edge.source === previewNode.id &&
                            (edge.data as { miniGameResult?: string } | undefined)
                              ?.miniGameResult === "success",
                        )?.target;

                      if (!targetId) {
                        alert("Deze minigame heeft nog geen success route.");
                        return;
                      }

                      goToPreviewNode(targetId);
                    }}
                    onFail={() => {
                      const targetId =
                        previewNode.data.miniGameFailTargetNodeId ||
                        edges.find(
                          (edge) =>
                            edge.source === previewNode.id &&
                            (edge.data as { miniGameResult?: string } | undefined)
                              ?.miniGameResult === "fail",
                        )?.target;

                      if (!targetId) {
                        alert("Deze minigame heeft nog geen fail route.");
                        return;
                      }

                      goToPreviewNode(targetId);
                    }}
                  />
                ) : (
                  <div className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-4 p-6">
                    <p className="text-xl font-bold">Mini game</p>
                    <div className="rounded-xl bg-purple-950/50 p-5 text-purple-200">
                      Dit minigame type is nog niet gebouwd:{" "}
                      {previewNode.data.miniGameType || "niet ingesteld"}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="shrink-0 border-t border-neutral-800 px-4 py-3 sm:px-6">
            {(previewNode.data.type === "text" ||
              previewNode.data.type === "special") && (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  onClick={() =>
                    setPreviewPageIndex((current) =>
                      Math.max(0, current - readerVisiblePageCount),
                    )
                  }
                  disabled={previewPageIndex === 0}
                  className="rounded-xl bg-neutral-800 px-4 py-3 font-black text-white hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Vorige pagina
                </button>

                <div className="text-center text-sm font-bold text-neutral-400">
                  <div>
                    {readerVisiblePageCount === 2 &&
                    previewPageIndex + 1 < previewPageCount
                      ? `Pagina ${previewPageIndex + 1}–${Math.min(
                          previewPageIndex + 2,
                          previewPageCount,
                        )} van ${previewPageCount}`
                      : `Pagina ${previewPageIndex + 1} van ${previewPageCount}`}
                  </div>
                  <div className="text-xs text-neutral-500">
                    Geschat totaal boek: ±{estimatedTotalBookPages} pagina’s
                  </div>
                </div>

                {previewPageIndex <
                  previewPageCount - readerVisiblePageCount && (
                  <button
                    onClick={() =>
                      setPreviewPageIndex((current) =>
                        Math.min(
                          previewPageCount - 1,
                          current + readerVisiblePageCount,
                        ),
                      )
                    }
                    className="rounded-xl bg-blue-600 px-4 py-3 font-black text-white hover:bg-blue-500"
                  >
                    Volgende pagina
                  </button>
                )}

                {previewPageIndex >=
                  previewPageCount - readerVisiblePageCount &&
                  textChain.nextNodeAfterChain && (
                    <button
                      onClick={() => {
                        goToPreviewNode(textChain.nextNodeAfterChain!.id);
                      }}
                      className="rounded-xl bg-emerald-600 px-4 py-3 font-black text-white hover:bg-emerald-500"
                    >
                      Ga verder naar {textChain.nextNodeAfterChain.data.type === "minigame" ? "mini game" : textChain.nextNodeAfterChain.data.label}
                    </button>
                  )}

                {previewPageIndex >=
                  previewPageCount - readerVisiblePageCount &&
                  !textChain.nextNodeAfterChain &&
                  textChainBranchPaths.length > 0 && (
                    <div className="flex flex-wrap items-center justify-end gap-3">
                      {textChainBranchPaths.map((edge, branchIndex) => {
                        const targetNode = nodes.find(
                          (node) => node.id === edge.target,
                        );

                        return (
                          <button
                            key={edge.id}
                            onClick={() => goToPreviewNode(edge.target)}
                            className="rounded-xl bg-emerald-600 px-4 py-3 text-left font-black text-white hover:bg-emerald-500"
                          >
                            {edge.label
                              ? `${edge.label}: `
                              : textChainBranchPaths.length > 1
                                ? `Optie ${branchIndex + 1}: `
                                : "Ga verder naar "}
                            {targetNode?.data.type === "minigame"
                              ? "mini game"
                              : targetNode?.data.label ?? "Onbekende node"}
                          </button>
                        );
                      })}
                    </div>
                  )}

                {previewPageIndex >=
                  previewPageCount - readerVisiblePageCount &&
                  !textChain.nextNodeAfterChain &&
                  textChainBranchPaths.length === 0 && (
                    <div className="rounded-xl bg-neutral-900 px-4 py-3 text-neutral-300">
                      Einde bereikt.
                    </div>
                  )}
              </div>
            )}

            {previewNode.data.type !== "text" &&
              previewNode.data.type !== "special" &&
              previewNode.data.type !== "choice" &&
              previewNode.data.type !== "minigame" && (
                <>
                  {previewPaths.length === 0 && (
                    <div className="rounded-xl bg-neutral-900 p-4 text-neutral-300">
                      Einde bereikt. Deze node heeft geen volgende path.
                    </div>
                  )}

                  {previewPaths.length > 0 && (
                    <div className="grid gap-3">
                      <p className="text-sm font-bold text-neutral-400">
                        Volgende:
                      </p>

                      {previewPaths.map((edge) => {
                        const targetNode = nodes.find(
                          (node) => node.id === edge.target,
                        );

                        return (
                          <button
                            key={edge.id}
                            onClick={() => {
                              goToPreviewNode(edge.target);
                            }}
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
        </div>
      )}
    </main>
  );
}
