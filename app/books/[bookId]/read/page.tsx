"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppNavActions } from "@/components/AppNav";
import { useParams } from "next/navigation";
import { books } from "@/lib/books";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useDemoAuth } from "@/lib/auth";
import { getReadingProgress, resetReadingProgress } from "@/lib/supabase/readerFeatures";
import { resolveDiBooksMediaUrl } from "@/lib/supabase/mediaStorage";

type MiniGameDifficulty = "easy" | "normal" | "hard";
type ReaderNodeType =
  | "text"
  | "special"
  | "chapter"
  | "cutscene"
  | "choice"
  | "minigame"
  | "function"
  | "condition"
  | "scratchpad";

type StoryVariableType = "boolean" | "number" | "text";
type StoryVariableValue = boolean | number | string;
type ReaderStoryState = Record<string, StoryVariableValue>;

type ReaderStoryVariable = {
  id: string;
  name: string;
  type: StoryVariableType;
  defaultValue: StoryVariableValue;
  description?: string;
};

type ReaderChoice = {
  label: string;
  targetNodeId?: string;
  effects?: ReaderFunctionAction[];
};

type ReaderFunctionActionType =
  | "set_flag"
  | "clear_flag"
  | "increment"
  | "decrement"
  | "set_number"
  | "set_text";

type ReaderFeedbackType =
  | "item_received"
  | "item_lost"
  | "relationship_up"
  | "relationship_down"
  | "stat_up"
  | "stat_down"
  | "info";

type ReaderFeedbackToast = {
  id: string;
  type: ReaderFeedbackType;
  text: string;
};

type ReaderFunctionAction = {
  id?: string;
  type: ReaderFunctionActionType;
  key: string;
  variableId?: string;
  amount?: number;
  textValue?: string;
  notifyReader?: boolean;
  notificationType?: ReaderFeedbackType;
  notificationText?: string;
};

type ConditionOperator =
  | "is_true"
  | "is_false"
  | "equals"
  | "not_equals"
  | "greater_than"
  | "greater_or_equal"
  | "less_than"
  | "less_or_equal"
  | "contains";

type ReaderNode = {
  id: string;
  type: ReaderNodeType;
  title: string;
  text: string;
  textHtml: string;
  specialSubtype?: string;
  chapterNumber?: string;
  chapterTitle?: string;
  chapterSubtitle?: string;
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
  miniGameSuccessEffects?: ReaderFunctionAction[];
  miniGameFailEffects?: ReaderFunctionAction[];
  functionActions?: ReaderFunctionAction[];
  conditionVariableId?: string;
  conditionKey?: string;
  conditionOperator?: ConditionOperator;
  conditionValue?: StoryVariableValue;
  conditionTrueTargetNodeId?: string;
  conditionFalseTargetNodeId?: string;
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
  variables: ReaderStoryVariable[];
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
type ReaderLineSpacing = "compact" | "normal" | "relaxed";
type ReaderFontFamily = "serif" | "sans";

type ReaderRunStep = {
  nodeId: string;
  nodeType?: ReaderNodeType;
  enteredAt?: string;
  lastPageIndex?: number;
  lastPageCount?: number;
  exitSourceNodeId?: string;
  exitTargetNodeId?: string;
  exitKind?:
    | "path"
    | "choice"
    | "minigame"
    | "function"
    | "condition"
    | "chapter"
    | "cutscene";
  edgeLabel?: string;
  choiceIndex?: number;
  choiceLabel?: string;
  miniGameResult?: "success" | "fail";
  conditionResult?: boolean;
};

type ReaderTransitionMeta = Omit<
  Partial<ReaderRunStep>,
  "nodeId" | "nodeType" | "enteredAt" | "exitTargetNodeId"
> & {
  sourceNodeId?: string;
};

type ReaderReplayReturnPoint = {
  nodeId: string;
  pageIndex: number;
  progressPercent: number;
};

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
    chapterNumber:
      data.chapterNumber ?? content.chapterNumber ?? rawNode?.chapterNumber ?? "",
    chapterTitle:
      data.chapterTitle ?? content.chapterTitle ?? rawNode?.chapterTitle ?? "",
    chapterSubtitle:
      data.chapterSubtitle ?? content.chapterSubtitle ?? rawNode?.chapterSubtitle ?? "",
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
    miniGameSuccessEffects:
      data.miniGameSuccessEffects ?? content.miniGameSuccessEffects ?? rawNode?.miniGameSuccessEffects ?? [],
    miniGameFailEffects:
      data.miniGameFailEffects ?? content.miniGameFailEffects ?? rawNode?.miniGameFailEffects ?? [],
    functionActions: data.functionActions ?? content.functionActions ?? rawNode?.functionActions ?? [],
    conditionVariableId:
      data.conditionVariableId ?? content.conditionVariableId ?? rawNode?.conditionVariableId ?? "",
    conditionKey:
      data.conditionKey ?? content.conditionKey ?? rawNode?.conditionKey ?? "",
    conditionOperator:
      data.conditionOperator ?? content.conditionOperator ?? rawNode?.conditionOperator ?? undefined,
    conditionValue:
      data.conditionValue ?? content.conditionValue ?? rawNode?.conditionValue ?? undefined,
    conditionTrueTargetNodeId:
      data.conditionTrueTargetNodeId ?? content.conditionTrueTargetNodeId ?? rawNode?.conditionTrueTargetNodeId ?? "",
    conditionFalseTargetNodeId:
      data.conditionFalseTargetNodeId ?? content.conditionFalseTargetNodeId ?? rawNode?.conditionFalseTargetNodeId ?? "",
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

  const variables: ReaderStoryVariable[] = Array.isArray(rawProject?.variables)
    ? rawProject.variables
        .filter((variable: any) => variable?.id && variable?.name)
        .map((variable: any) => ({
          id: String(variable.id),
          name: String(variable.name),
          type:
            variable.type === "number"
              ? "number"
              : variable.type === "text"
                ? "text"
                : "boolean",
          defaultValue:
            variable.type === "number"
              ? Number(variable.defaultValue ?? 0)
              : variable.type === "text"
                ? String(variable.defaultValue ?? "")
                : variable.defaultValue === true,
          description: typeof variable.description === "string" ? variable.description : "",
        }))
    : [];

  return {
    id: fallback.id ?? rawProject?.bookId ?? "unknown-book",
    title: fallback.title ?? rawProject?.bookTitle ?? rawProject?.title ?? "DiBooks verhaal",
    author: fallback.author ?? rawProject?.author ?? "Auteur",
    subtitle: fallback.subtitle ?? rawProject?.subtitle ?? "",
    description: fallback.description ?? rawProject?.description ?? "",
    accessType: (fallback as any).accessType ?? rawProject?.accessType ?? "free",
    startNodeId: safeStartNodeId,
    variables,
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


function createReaderRunStep(
  book: ReaderBook,
  nodeId: string,
): ReaderRunStep {
  const node = book.nodes.find((item) => item.id === nodeId);

  return {
    nodeId,
    nodeType: node?.type,
    enteredAt: new Date().toISOString(),
    lastPageIndex: 0,
    lastPageCount: undefined,
  };
}

function normalizeReaderRunHistory(
  value: unknown,
  book: ReaderBook,
): ReaderRunStep[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter(
      (entry: any) =>
        entry &&
        typeof entry === "object" &&
        typeof entry.nodeId === "string" &&
        book.nodes.some((node) => node.id === entry.nodeId),
    )
    .map((entry: any) => {
      const node = book.nodes.find((item) => item.id === entry.nodeId);

      return {
        nodeId: entry.nodeId,
        nodeType: node?.type,
        enteredAt:
          typeof entry.enteredAt === "string"
            ? entry.enteredAt
            : undefined,
        lastPageIndex: Math.max(
          0,
          Number(entry.lastPageIndex) || 0,
        ),
        lastPageCount:
          Number(entry.lastPageCount) > 0
            ? Math.max(1, Math.floor(Number(entry.lastPageCount)))
            : undefined,
        exitSourceNodeId:
          typeof entry.exitSourceNodeId === "string"
            ? entry.exitSourceNodeId
            : undefined,
        exitTargetNodeId:
          typeof entry.exitTargetNodeId === "string"
            ? entry.exitTargetNodeId
            : undefined,
        exitKind:
          typeof entry.exitKind === "string"
            ? entry.exitKind
            : undefined,
        edgeLabel:
          typeof entry.edgeLabel === "string"
            ? entry.edgeLabel
            : undefined,
        choiceIndex:
          typeof entry.choiceIndex === "number"
            ? entry.choiceIndex
            : undefined,
        choiceLabel:
          typeof entry.choiceLabel === "string"
            ? entry.choiceLabel
            : undefined,
        miniGameResult:
          entry.miniGameResult === "success" ||
          entry.miniGameResult === "fail"
            ? entry.miniGameResult
            : undefined,
        conditionResult:
          typeof entry.conditionResult === "boolean"
            ? entry.conditionResult
            : undefined,
      } satisfies ReaderRunStep;
    });
}

async function loadReaderRunHistory(
  userId: string,
  bookId: string,
  book: ReaderBook,
) {
  const supabase = createSupabaseBrowserClient();

  const { data, error } = await supabase
    .from("reading_progress")
    .select("run_history")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (error) throw error;

  return normalizeReaderRunHistory(data?.run_history, book);
}

async function saveReaderProgressSnapshot(
  userId: string,
  bookId: string,
  currentNodeId: string,
  pageIndex: number,
  progressPercent: number,
  storyState: ReaderStoryState,
  runHistory: ReaderRunStep[],
) {
  if (!bookId || !currentNodeId) return;

  const supabase = createSupabaseBrowserClient();

  const { error } = await supabase
    .from("reading_progress")
    .upsert(
      {
        user_id: userId,
        book_id: bookId,
        current_node_id: currentNodeId,
        page_index: Math.max(0, Number(pageIndex) || 0),
        progress_percent: Math.max(
          0,
          Math.min(100, Math.round(Number(progressPercent) || 0)),
        ),
        story_state: storyState,
        run_history: runHistory,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,book_id" },
    );

  if (error) throw error;
}

function isReaderReplayVisibleNode(node: ReaderNode | undefined | null) {
  if (!node) return false;

  return (
    node.type === "text" ||
    node.type === "special" ||
    node.type === "choice" ||
    node.type === "minigame" ||
    node.type === "cutscene"
  );
}

function findReplayVisibleStepIndex(
  history: ReaderRunStep[],
  book: ReaderBook,
  startIndex: number,
  direction: 1 | -1,
) {
  for (
    let index = startIndex;
    index >= 0 && index < history.length;
    index += direction
  ) {
    const node = book.nodes.find(
      (item) => item.id === history[index]?.nodeId,
    );

    if (isReaderReplayVisibleNode(node)) return index;
  }

  return -1;
}

function getChapterFromRunHistory(
  history: ReaderRunStep[],
  book: ReaderBook,
  stepIndex: number,
) {
  for (
    let index = Math.min(stepIndex, history.length - 1);
    index >= 0;
    index -= 1
  ) {
    const node = book.nodes.find(
      (item) => item.id === history[index]?.nodeId,
    );

    if (node?.type === "chapter") return node;
  }

  return null;
}

function getReaderRunStepPageCount(
  step: ReaderRunStep | undefined,
  book: ReaderBook,
) {
  if (!step) return 0;

  const node = book.nodes.find((item) => item.id === step.nodeId);
  if (!node || (node.type !== "text" && node.type !== "special")) {
    return 0;
  }

  if (Number(step.lastPageCount) > 0) {
    return Math.max(1, Math.floor(Number(step.lastPageCount)));
  }

  // Oude run-history van vóór Global Page Numbers V1 kent alleen
  // lastPageIndex. Dit is een veilige eenmalige fallback.
  return Math.max(1, Math.floor(Number(step.lastPageIndex) || 0) + 1);
}

function getReaderGlobalPageOffset(
  history: ReaderRunStep[],
  book: ReaderBook,
  stepIndex: number,
) {
  const safeEndIndex = Math.max(
    0,
    Math.min(stepIndex, history.length),
  );

  return history
    .slice(0, safeEndIndex)
    .reduce(
      (total, step) =>
        total + getReaderRunStepPageCount(step, book),
      0,
    );
}

function withCurrentReaderPageMetrics(
  history: ReaderRunStep[],
  book: ReaderBook,
  currentNodeId: string,
  pageIndex: number,
  pageCount: number,
) {
  const nextHistory = [...history];

  for (let index = nextHistory.length - 1; index >= 0; index -= 1) {
    const step = nextHistory[index];
    if (step?.nodeId !== currentNodeId) continue;

    const node = book.nodes.find((item) => item.id === step.nodeId);
    if (!node || (node.type !== "text" && node.type !== "special")) {
      return nextHistory;
    }

    nextHistory[index] = {
      ...step,
      lastPageIndex: Math.max(0, Math.floor(pageIndex)),
      lastPageCount: Math.max(1, Math.floor(pageCount)),
    };

    return nextHistory;
  }

  return nextHistory;
}

function getLegacyReaderFlagsStorageKey(bookId: string) {
  return `dibooks-reader-flags:${bookId}`;
}

function loadLegacyReaderFlags(bookId: string): ReaderStoryState {
  if (typeof window === "undefined") return {};

  try {
    const raw = window.localStorage.getItem(getLegacyReaderFlagsStorageKey(bookId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as ReaderStoryState)
      : {};
  } catch {
    return {};
  }
}

function clearLegacyReaderFlags(bookId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(getLegacyReaderFlagsStorageKey(bookId));
}

function coerceStoryValue(type: StoryVariableType, value: unknown): StoryVariableValue {
  if (type === "boolean") {
    return value === true || value === 1 || value === "1" || value === "true";
  }

  if (type === "number") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  return String(value ?? "");
}

function createDefaultReaderStoryState(book: ReaderBook): ReaderStoryState {
  return Object.fromEntries(
    book.variables.map((variable) => [
      variable.id,
      coerceStoryValue(variable.type, variable.defaultValue),
    ]),
  ) as ReaderStoryState;
}

function mergeReaderStoryState(
  book: ReaderBook,
  savedState?: Record<string, unknown> | null,
  legacyState?: Record<string, unknown> | null,
) {
  const nextState = createDefaultReaderStoryState(book);
  const safeSavedState =
    savedState && typeof savedState === "object" && !Array.isArray(savedState)
      ? savedState
      : {};
  const safeLegacyState =
    legacyState && typeof legacyState === "object" && !Array.isArray(legacyState)
      ? legacyState
      : {};

  book.variables.forEach((variable) => {
    if (Object.prototype.hasOwnProperty.call(safeSavedState, variable.id)) {
      nextState[variable.id] = coerceStoryValue(
        variable.type,
        safeSavedState[variable.id],
      );
      return;
    }

    if (Object.prototype.hasOwnProperty.call(safeSavedState, variable.name)) {
      nextState[variable.id] = coerceStoryValue(
        variable.type,
        safeSavedState[variable.name],
      );
      return;
    }

    if (Object.prototype.hasOwnProperty.call(safeLegacyState, variable.id)) {
      nextState[variable.id] = coerceStoryValue(
        variable.type,
        safeLegacyState[variable.id],
      );
      return;
    }

    if (Object.prototype.hasOwnProperty.call(safeLegacyState, variable.name)) {
      nextState[variable.id] = coerceStoryValue(
        variable.type,
        safeLegacyState[variable.name],
      );
    }
  });

  // Oude boeken zonder centrale variabelen blijven werken met key-based flags.
  if (book.variables.length === 0) {
    Object.entries({ ...safeLegacyState, ...safeSavedState }).forEach(
      ([key, value]) => {
        if (
          typeof value === "boolean" ||
          typeof value === "number" ||
          typeof value === "string"
        ) {
          nextState[key] = value;
        }
      },
    );
  }

  return nextState;
}

function findStoryVariable(
  book: ReaderBook,
  variableId?: string,
  variableKey?: string,
) {
  return (
    book.variables.find((variable) => variable.id === variableId) ??
    book.variables.find((variable) => variable.name === variableKey)
  );
}

function getReaderStoryValue(
  book: ReaderBook,
  storyState: ReaderStoryState,
  variableId?: string,
  variableKey?: string,
) {
  const variable = findStoryVariable(book, variableId, variableKey);

  if (variable) {
    if (Object.prototype.hasOwnProperty.call(storyState, variable.id)) {
      return storyState[variable.id];
    }

    if (Object.prototype.hasOwnProperty.call(storyState, variable.name)) {
      return storyState[variable.name];
    }

    return coerceStoryValue(variable.type, variable.defaultValue);
  }

  if (variableKey && Object.prototype.hasOwnProperty.call(storyState, variableKey)) {
    return storyState[variableKey];
  }

  return undefined;
}

function applyReaderFunctionActions(
  book: ReaderBook,
  currentState: ReaderStoryState,
  actions: ReaderFunctionAction[] = [],
) {
  const nextState: ReaderStoryState = { ...currentState };

  actions.forEach((action) => {
    const variable = findStoryVariable(book, action.variableId, action.key);
    const fallbackKey = String(action?.key ?? "").trim();
    const stateKey = variable?.id || fallbackKey;

    if (!stateKey) return;

    const currentValue = variable
      ? getReaderStoryValue(book, nextState, variable.id, variable.name)
      : nextState[stateKey];

    const currentNumber =
      typeof currentValue === "number"
        ? currentValue
        : Number(currentValue) || 0;
    const amount = Number(action.amount ?? 1);

    if (action.type === "set_flag") nextState[stateKey] = true;
    if (action.type === "clear_flag") nextState[stateKey] = false;
    if (action.type === "increment") {
      nextState[stateKey] = currentNumber + (Number.isFinite(amount) ? amount : 1);
    }
    if (action.type === "decrement") {
      nextState[stateKey] = currentNumber - (Number.isFinite(amount) ? amount : 1);
    }
    if (action.type === "set_number") {
      nextState[stateKey] = Number.isFinite(amount) ? amount : 0;
    }
    if (action.type === "set_text") {
      nextState[stateKey] = action.textValue ?? "";
    }
  });

  return nextState;
}

function getReaderFeedbackPresentation(type: ReaderFeedbackType) {
  if (type === "item_received") return { icon: "🎒", title: "Item ontvangen" };
  if (type === "item_lost") return { icon: "🗑️", title: "Item verloren" };
  if (type === "relationship_up") return { icon: "❤️", title: "Relatie verbeterd" };
  if (type === "relationship_down") return { icon: "💔", title: "Relatie verslechterd" };
  if (type === "stat_up") return { icon: "⬆️", title: "Stat verhoogd" };
  if (type === "stat_down") return { icon: "⬇️", title: "Stat verlaagd" };
  return { icon: "ℹ️", title: "Update" };
}

function formatReaderFeedbackVariableLabel(value?: string) {
  const clean = String(value ?? "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (!clean) return "Verhaalstatus gewijzigd";

  return clean
    .split(" ")
    .map((part) =>
      part.length > 0
        ? part.slice(0, 1).toUpperCase() + part.slice(1)
        : part,
    )
    .join(" ");
}

function buildReaderFeedbackItems(
  book: ReaderBook,
  actions: ReaderFunctionAction[] = [],
): Omit<ReaderFeedbackToast, "id">[] {
  return actions.flatMap((action) => {
    if (!action.notifyReader) return [];

    const variable = findStoryVariable(book, action.variableId, action.key);

    return [
      {
        type: action.notificationType ?? "info",
        text:
          action.notificationText?.trim() ||
          formatReaderFeedbackVariableLabel(variable?.name || action.key),
      },
    ];
  });
}

function enqueueReaderFeedbackToasts(
  setFeedbacks: (
    value:
      | ReaderFeedbackToast[]
      | ((current: ReaderFeedbackToast[]) => ReaderFeedbackToast[]),
  ) => void,
  book: ReaderBook,
  actions: ReaderFunctionAction[] = [],
) {
  const feedbackItems = buildReaderFeedbackItems(book, actions);

  feedbackItems.forEach((item, index) => {
    const id = `reader_feedback_${Date.now()}_${index}_${Math.random()
      .toString(36)
      .slice(2, 7)}`;

    setFeedbacks((current) => [
      ...current,
      {
        ...item,
        id,
      },
    ]);

    window.setTimeout(() => {
      setFeedbacks((current) =>
        current.filter((feedback) => feedback.id !== id),
      );
    }, 3600 + index * 220);
  });
}

function evaluateReaderCondition(
  book: ReaderBook,
  node: ReaderNode,
  storyState: ReaderStoryState,
) {
  const variable = findStoryVariable(
    book,
    node.conditionVariableId,
    node.conditionKey,
  );
  const actualValue = getReaderStoryValue(
    book,
    storyState,
    node.conditionVariableId,
    node.conditionKey,
  );
  const operator = node.conditionOperator ?? (
    variable?.type === "boolean" ? "is_true" : "equals"
  );
  const expectedValue =
    node.conditionValue ??
    (variable?.type === "number"
      ? 0
      : variable?.type === "text"
        ? ""
        : true);

  if (operator === "is_true") return actualValue === true;
  if (operator === "is_false") return actualValue === false;

  const valueType =
    variable?.type ??
    (typeof expectedValue === "number"
      ? "number"
      : typeof expectedValue === "boolean"
        ? "boolean"
        : "text");

  if (valueType === "number") {
    const actual = Number(actualValue);
    const expected = Number(expectedValue);

    if (operator === "equals") return actual === expected;
    if (operator === "not_equals") return actual !== expected;
    if (operator === "greater_than") return actual > expected;
    if (operator === "greater_or_equal") return actual >= expected;
    if (operator === "less_than") return actual < expected;
    if (operator === "less_or_equal") return actual <= expected;
    return false;
  }

  if (valueType === "boolean") {
    if (operator === "equals") return actualValue === expectedValue;
    if (operator === "not_equals") return actualValue !== expectedValue;
    return false;
  }

  const actual = String(actualValue ?? "");
  const expected = String(expectedValue ?? "");

  if (operator === "equals") return actual === expected;
  if (operator === "not_equals") return actual !== expected;
  if (operator === "contains") return actual.includes(expected);

  return false;
}

function getConditionTargetNodeId(
  book: ReaderBook,
  node: ReaderNode,
  result: boolean,
) {
  const explicitTarget = result
    ? node.conditionTrueTargetNodeId
    : node.conditionFalseTargetNodeId;

  if (explicitTarget) return explicitTarget;

  const wantedResult = result ? "true" : "false";
  const conditionEdge = book.edges.find(
    (edge) =>
      edge.source === node.id &&
      String(edge.data?.conditionResult ?? "").toLowerCase() === wantedResult,
  );

  if (conditionEdge?.target) return conditionEdge.target;

  const fallbackLabel = result ? "true" : "else";
  return (
    book.edges.find(
      (edge) =>
        edge.source === node.id &&
        String(edge.label ?? "").trim().toLowerCase() === fallbackLabel,
    )?.target ?? ""
  );
}


function calculateBookProgressPercent(book: ReaderBook, currentNodeId: string, pageIndex: number, pageCount: number) {
  const progressNodes = book.nodes.filter((node) => node.type !== "chapter");
  const totalNodes = Math.max(1, progressNodes.length);
  const nodeIndex = Math.max(
    0,
    progressNodes.findIndex((node) => node.id === currentNodeId),
  );
  const safePageCount = Math.max(1, pageCount);
  const pageFraction = Math.max(0, Math.min(1, (pageIndex + 1) / safePageCount));
  const percent = ((nodeIndex + pageFraction) / totalNodes) * 100;
  return clampProgressPercent(percent);
}


function formatReaderChapterLabel(node: ReaderNode | null | undefined) {
  if (!node || node.type !== "chapter") return "";

  const number = String(node.chapterNumber ?? "").trim();
  const title = String(node.chapterTitle ?? "").trim();

  if (number && title) return `Hoofdstuk ${number} — ${title}`;
  if (number) return `Hoofdstuk ${number}`;
  if (title) return `Hoofdstuk — ${title}`;
  return "Hoofdstuk";
}

function findNearestReaderChapter(
  book: ReaderBook,
  currentNodeId: string,
): ReaderNode | null {
  const startNode = book.nodes.find((node) => node.id === currentNodeId);
  if (!startNode) return null;
  if (startNode.type === "chapter") return startNode;

  const visited = new Set<string>([currentNodeId]);
  let frontier = [currentNodeId];

  // Zoek per afstandsniveau terug door inkomende paden.
  // Hierdoor krijgt de reader de dichtstbijzijnde hoofdstuk-marker.
  for (let depth = 0; depth < Math.max(1, book.nodes.length); depth += 1) {
    const nextFrontier: string[] = [];

    for (const targetId of frontier) {
      const incoming = book.edges.filter((edge) => edge.target === targetId);

      for (const edge of incoming) {
        if (visited.has(edge.source)) continue;
        visited.add(edge.source);

        const sourceNode = book.nodes.find((node) => node.id === edge.source);
        if (!sourceNode) continue;
        if (sourceNode.type === "chapter") return sourceNode;

        nextFrontier.push(sourceNode.id);
      }
    }

    if (!nextFrontier.length) break;
    frontier = nextFrontier;
  }

  return null;
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
  measuringBox.style.width = `${Math.max(260, Math.floor(options.pageWidth))}px`;
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
  lineSpacing,
  fontFamily,
  globalPageOffset,
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
  lineSpacing: ReaderLineSpacing;
  fontFamily: ReaderFontFamily;
  globalPageOffset: number;
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
        lineSpacing,
        fontFamily,
      });

      setPages(nextPages);
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
      ? "border-neutral-300 bg-[#fffaf0] text-neutral-950 shadow-xl"
      : theme === "sepia"
        ? "border-[#8f6b38]/35 bg-[#3a2a19] text-[#f3e4c9] shadow-2xl"
        : "border-white/10 bg-neutral-950/95 text-white shadow-2xl";

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
              className={`relative h-full overflow-hidden rounded-2xl border px-8 pb-20 pt-8 sm:px-12 sm:pb-24 sm:pt-10 md:px-16 ${pageClass}`}
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
  const [lineSpacing, setLineSpacing] = useState<ReaderLineSpacing>("normal");
  const [fontFamily, setFontFamily] = useState<ReaderFontFamily>("sans");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [contentsOpen, setContentsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [cutsceneFading, setCutsceneFading] = useState(false);
  const [resetProgressBusy, setResetProgressBusy] = useState(false);
  const [interactionBusy, setInteractionBusy] = useState(false);
  const interactionBusyRef = useRef(false);
  const [storyState, setStoryState] = useState<ReaderStoryState>({});
  const [readerFeedbacks, setReaderFeedbacks] = useState<ReaderFeedbackToast[]>([]);
  const storyStateRef = useRef<ReaderStoryState>({});
  const storyStateReadyRef = useRef(false);
  const [runHistory, setRunHistory] = useState<ReaderRunStep[]>([]);
  const runHistoryRef = useRef<ReaderRunStep[]>([]);
  const runHistoryReadyRef = useRef(false);
  const [replayStepIndex, setReplayStepIndex] = useState<number | null>(null);
  const replayReturnPointRef = useRef<ReaderReplayReturnPoint | null>(null);
  const lastExecutedFunctionNodeRef = useRef<string | null>(null);
  const lastEvaluatedConditionNodeRef = useRef<string | null>(null);
  const cutsceneShellRef = useRef<HTMLDivElement | null>(null);
  const readerShellRef = useRef<HTMLElement | null>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);
  const { user, loading: authLoading } = useDemoAuth();

  useEffect(() => {
    let active = true;

    async function loadBook() {
      setLoadState({ status: "loading" });
      storyStateReadyRef.current = false;
      storyStateRef.current = {};
      setStoryState({});
      setReaderFeedbacks([]);
      runHistoryReadyRef.current = false;
      runHistoryRef.current = [];
      setRunHistory([]);
      setReplayStepIndex(null);
      replayReturnPointRef.current = null;

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

        const [progress, storedRunHistory] = await Promise.all([
          getReadingProgress(user, book.id),
          loadReaderRunHistory(user.id, book.id, book),
        ]);

        const progressNodeExists = progress?.currentNodeId
          ? book.nodes.some((node) => node.id === progress.currentNodeId)
          : false;

        const activeNodeId = progressNodeExists
          ? progress!.currentNodeId
          : book.startNodeId;

        const restoredRunHistory =
          storedRunHistory.length > 0
            ? [...storedRunHistory]
            : [createReaderRunStep(book, activeNodeId)];

        if (
          restoredRunHistory[restoredRunHistory.length - 1]?.nodeId !==
          activeNodeId
        ) {
          restoredRunHistory.push(
            createReaderRunStep(book, activeNodeId),
          );
        }

        runHistoryRef.current = restoredRunHistory;
        runHistoryReadyRef.current = true;
        setRunHistory(restoredRunHistory);

        const legacyFlags = loadLegacyReaderFlags(book.id);
        const restoredStoryState = mergeReaderStoryState(
          book,
          progress?.storyState ?? null,
          legacyFlags,
        );

        storyStateRef.current = restoredStoryState;
        storyStateReadyRef.current = true;
        setStoryState(restoredStoryState);
        lastExecutedFunctionNodeRef.current = null;
        lastEvaluatedConditionNodeRef.current = null;

        setLoadState({ status: "ready", book });
        setCurrentNodeId(activeNodeId);
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
    const savedLineSpacing = window.localStorage.getItem("dibooks-reader-line-spacing") as ReaderLineSpacing | null;
    const savedFontFamily = window.localStorage.getItem("dibooks-reader-font-family") as ReaderFontFamily | null;

    if (savedTextSize === "small" || savedTextSize === "normal" || savedTextSize === "large") setTextSize(savedTextSize);
    if (savedPageMode === "auto" || savedPageMode === "single" || savedPageMode === "double") setPageMode(savedPageMode);
    if (savedTheme === "dark" || savedTheme === "light" || savedTheme === "sepia") setTheme(savedTheme);
    if (savedLineSpacing === "compact" || savedLineSpacing === "normal" || savedLineSpacing === "relaxed") setLineSpacing(savedLineSpacing);
    if (savedFontFamily === "serif" || savedFontFamily === "sans") setFontFamily(savedFontFamily);
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
    window.localStorage.setItem("dibooks-reader-line-spacing", lineSpacing);
  }, [lineSpacing]);

  useEffect(() => {
    window.localStorage.setItem("dibooks-reader-font-family", fontFamily);
  }, [fontFamily]);

  useEffect(() => {
    function handleFullscreenChange() {
      const fullscreenElement = document.fullscreenElement;
      const shell = readerShellRef.current;

      setIsFullscreen(
        !!fullscreenElement &&
          !!shell &&
          (fullscreenElement === shell || shell.contains(fullscreenElement)),
      );
    }

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    handleFullscreenChange();

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);


  useEffect(() => {
    if (
      loadState.status !== "ready" ||
      !user ||
      !currentNodeId ||
      !storyStateReadyRef.current ||
      !runHistoryReadyRef.current ||
      replayStepIndex !== null
    ) {
      return;
    }

    const timeout = window.setTimeout(() => {
      const progressPercent = calculateBookProgressPercent(
        loadState.book,
        currentNodeId,
        pageIndex,
        readerPageCount,
      );

      const historyWithPageMetrics =
        withCurrentReaderPageMetrics(
          runHistoryRef.current,
          loadState.book,
          currentNodeId,
          pageIndex,
          readerPageCount,
        );

      runHistoryRef.current = historyWithPageMetrics;

      saveReaderProgressSnapshot(
        user.id,
        loadState.book.id,
        currentNodeId,
        pageIndex,
        progressPercent,
        storyStateRef.current,
        historyWithPageMetrics,
      )
        .then(() => {
          clearLegacyReaderFlags(loadState.book.id);
        })
        .catch((progressError) => {
          console.warn("Leesvoortgang/verhaalstatus opslaan mislukt.", progressError);
        });
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [
    currentNodeId,
    loadState,
    pageIndex,
    readerPageCount,
    replayStepIndex,
    runHistory,
    storyState,
    user,
  ]);

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
      activeChapter: findNearestReaderChapter(book, node.id),
      textHtml: htmlParts.join(""),
      textNodes,
      nextNodeAfterChain,
      branchPaths,
      outgoingPaths: book.edges.filter((edge) => edge.source === node.id),
    };
  }, [currentNodeId, loadState]);

  useEffect(() => {
    if (!reader || reader.node.type !== "text" && reader.node.type !== "special") {
      return;
    }

    // TypeScript behoudt narrowing van React-state niet altijd binnen
    // geneste event callbacks. Deze vaste referentie is hier non-null.
    const activeReader = reader;

    function handleReaderKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tagName = target?.tagName?.toLowerCase();

      if (
        target?.isContentEditable ||
        tagName === "input" ||
        tagName === "textarea" ||
        tagName === "select" ||
        settingsOpen
      ) {
        return;
      }

      if (event.key === "ArrowLeft") {
        if (pageIndex > 0) {
          event.preventDefault();
          setPageIndex((current) =>
            Math.max(0, current - readerVisiblePageCount),
          );
          return;
        }

        if (replayStepIndex !== null) {
          event.preventDefault();
          goToPreviousReplayStep();
          return;
        }

        if (canEnterPreviousReplayStep()) {
          event.preventDefault();
          enterPreviousReplayStep();
        }
      }

      if (event.key === "ArrowRight") {
        const hasNextPage =
          pageIndex <
          Math.max(1, readerPageCount) - readerVisiblePageCount;

        if (hasNextPage) {
          event.preventDefault();
          setPageIndex((current) =>
            Math.min(
              Math.max(0, readerPageCount - 1),
              current + readerVisiblePageCount,
            ),
          );
          return;
        }

        if (replayStepIndex !== null) {
          event.preventDefault();
          goToNextReplayStep();
          return;
        }

        const lastTextNode =
          activeReader.textNodes[activeReader.textNodes.length - 1];

        if (activeReader.nextNodeAfterChain) {
          event.preventDefault();
          goToNode(activeReader.nextNodeAfterChain.id, {
            sourceNodeId: lastTextNode?.id ?? activeReader.node.id,
            exitKind: "path",
          });
          return;
        }

        // Alleen automatisch doorgaan als er exact één route is.
        // Bij echte keuzes beslist de lezer via de knoppen.
        if (activeReader.branchPaths.length === 1) {
          event.preventDefault();
          const edge = activeReader.branchPaths[0];
          goToNode(edge.target, {
            sourceNodeId: lastTextNode?.id ?? activeReader.node.id,
            exitKind: "path",
            edgeLabel: edge.label,
          });
        }
      }
    }

    window.addEventListener("keydown", handleReaderKeyDown);
    return () => window.removeEventListener("keydown", handleReaderKeyDown);
  }, [
    pageIndex,
    reader,
    readerPageCount,
    readerVisiblePageCount,
    replayStepIndex,
    runHistory,
    settingsOpen,
  ]);




  useEffect(() => {
    if (!reader || reader.node.type !== "chapter") return;
    if (replayStepIndex !== null) return;

    const activeReader = reader;

    if (
      !user ||
      loadState.status !== "ready" ||
      !runHistoryReadyRef.current
    ) {
      return;
    }

    // Capture pas NA de null-check. Zo ziet strict TypeScript deze waarde
    // ook binnen de geneste async callback gegarandeerd als non-null.
    const activeUser = user;

    const nextTargetId = activeReader.outgoingPaths[0]?.target;
    if (!nextTargetId) {
      console.warn(
        `Hoofdstuk-marker "${activeReader.node.title}" heeft geen vervolgpath.`,
      );
      return;
    }

    let cancelled = false;

    async function continueFromChapter() {
      const nextHistory = buildNextRunHistory(
        activeReader.book,
        activeReader.node.id,
        nextTargetId,
        {
          sourceNodeId: activeReader.node.id,
          exitKind: "chapter",
        },
      );

      try {
        await saveReaderProgressSnapshot(
          activeUser.id,
          activeReader.book.id,
          nextTargetId,
          0,
          calculateBookProgressPercent(
            activeReader.book,
            nextTargetId,
            0,
            1,
          ),
          storyStateRef.current,
          nextHistory,
        );
      } catch (progressError) {
        console.warn(
          "Hoofdstuk-overgang opslaan mislukt.",
          progressError,
        );
      }

      if (cancelled) return;

      commitRunHistory(nextHistory);
      lastExecutedFunctionNodeRef.current = null;
      lastEvaluatedConditionNodeRef.current = null;
      setCurrentNodeId(nextTargetId);
      setPageIndex(0);
    }

    void continueFromChapter();

    return () => {
      cancelled = true;
    };
  }, [reader, loadState, replayStepIndex, user]);

  useEffect(() => {
    if (
      !reader ||
      reader.node.type !== "function" ||
      loadState.status !== "ready" ||
      !user ||
      !storyStateReadyRef.current ||
      !runHistoryReadyRef.current ||
      replayStepIndex !== null
    ) {
      return;
    }

    const activeReader = reader;
    const activeUser = user;

    if (lastExecutedFunctionNodeRef.current === activeReader.node.id) return;
    lastExecutedFunctionNodeRef.current = activeReader.node.id;

    let cancelled = false;

    async function executeFunctionNode() {
      const nextStoryState = applyReaderFunctionActions(
        activeReader.book,
        storyStateRef.current,
        activeReader.node.functionActions ?? [],
      );

      storyStateRef.current = nextStoryState;
      setStoryState(nextStoryState);

      const nextTargetId = activeReader.outgoingPaths[0]?.target;
      if (!nextTargetId) {
        lastExecutedFunctionNodeRef.current = null;
        return;
      }

      let functionStateSaved = false;

      try {
        const progressPercent = calculateBookProgressPercent(
          activeReader.book,
          nextTargetId,
          0,
          1,
        );

        // Eerst status + volgende node opslaan. Daardoor kan een refresh op een
        // functie-node een +1/increment niet per ongeluk dubbel uitvoeren.
        const nextHistory = buildNextRunHistory(
          activeReader.book,
          activeReader.node.id,
          nextTargetId,
          {
            sourceNodeId: activeReader.node.id,
            exitKind: "function",
          },
        );

        await saveReaderProgressSnapshot(
          activeUser.id,
          activeReader.book.id,
          nextTargetId,
          0,
          progressPercent,
          nextStoryState,
          nextHistory,
        );

        commitRunHistory(nextHistory);
        clearLegacyReaderFlags(activeReader.book.id);
        functionStateSaved = true;
      } catch (progressError) {
        console.warn(
          "Functie uitgevoerd, maar directe story-state save mislukte.",
          progressError,
        );
      }

      if (cancelled) return;

      if (functionStateSaved) {
        enqueueReaderFeedbackToasts(
          setReaderFeedbacks,
          activeReader.book,
          activeReader.node.functionActions ?? [],
        );
      }

      lastExecutedFunctionNodeRef.current = null;
      lastEvaluatedConditionNodeRef.current = null;
      setCurrentNodeId(nextTargetId);
      setPageIndex(0);
    }

    void executeFunctionNode();

    return () => {
      cancelled = true;
    };
  }, [reader, loadState, replayStepIndex, user]);

  useEffect(() => {
    if (
      !reader ||
      reader.node.type !== "condition" ||
      loadState.status !== "ready" ||
      !user ||
      !storyStateReadyRef.current ||
      !runHistoryReadyRef.current ||
      replayStepIndex !== null
    ) {
      return;
    }

    const activeReader = reader;
    const activeUser = user;

    if (lastEvaluatedConditionNodeRef.current === activeReader.node.id) return;
    lastEvaluatedConditionNodeRef.current = activeReader.node.id;

    const result = evaluateReaderCondition(
      activeReader.book,
      activeReader.node,
      storyStateRef.current,
    );
    const nextTargetId = getConditionTargetNodeId(
      activeReader.book,
      activeReader.node,
      result,
    );

    if (!nextTargetId) {
      console.warn(
        `Voorwaarde-node "${activeReader.node.title}" mist een ${result ? "TRUE" : "ELSE"}-route.`,
      );
      return;
    }

    let cancelled = false;

    async function continueFromCondition() {
      try {
        const progressPercent = calculateBookProgressPercent(
          activeReader.book,
          nextTargetId,
          0,
          1,
        );

        const nextHistory = buildNextRunHistory(
          activeReader.book,
          activeReader.node.id,
          nextTargetId,
          {
            sourceNodeId: activeReader.node.id,
            exitKind: "condition",
            conditionResult: result,
          },
        );

        await saveReaderProgressSnapshot(
          activeUser.id,
          activeReader.book.id,
          nextTargetId,
          0,
          progressPercent,
          storyStateRef.current,
          nextHistory,
        );

        commitRunHistory(nextHistory);
      } catch (progressError) {
        console.warn("Voorwaarde-route opslaan mislukt.", progressError);
      }

      if (cancelled) return;

      lastEvaluatedConditionNodeRef.current = null;
      lastExecutedFunctionNodeRef.current = null;
      setCurrentNodeId(nextTargetId);
      setPageIndex(0);
    }

    void continueFromCondition();

    return () => {
      cancelled = true;
    };
  }, [reader, loadState, replayStepIndex, user]);


  function commitRunHistory(nextHistory: ReaderRunStep[]) {
    runHistoryRef.current = nextHistory;
    setRunHistory(nextHistory);
  }

  function buildNextRunHistory(
    book: ReaderBook,
    activeNodeId: string,
    targetNodeId: string,
    transitionMeta: ReaderTransitionMeta = {},
  ) {
    const nextHistory = [...runHistoryRef.current];
    let currentStepIndex = nextHistory.length - 1;

    if (
      currentStepIndex < 0 ||
      nextHistory[currentStepIndex]?.nodeId !== activeNodeId
    ) {
      nextHistory.push(createReaderRunStep(book, activeNodeId));
      currentStepIndex = nextHistory.length - 1;
    }

    const currentStep = nextHistory[currentStepIndex];
    const activeNode = book.nodes.find(
      (item) => item.id === activeNodeId,
    );
    const activeStepIsText =
      activeNode?.type === "text" || activeNode?.type === "special";

    nextHistory[currentStepIndex] = {
      ...currentStep,
      lastPageIndex: Math.max(0, pageIndex),
      lastPageCount: activeStepIsText
        ? Math.max(1, readerPageCount)
        : currentStep?.lastPageCount,
      exitSourceNodeId:
        transitionMeta.sourceNodeId ??
        transitionMeta.exitSourceNodeId ??
        activeNodeId,
      exitTargetNodeId: targetNodeId,
      exitKind: transitionMeta.exitKind ?? "path",
      edgeLabel: transitionMeta.edgeLabel,
      choiceIndex: transitionMeta.choiceIndex,
      choiceLabel: transitionMeta.choiceLabel,
      miniGameResult: transitionMeta.miniGameResult,
      conditionResult: transitionMeta.conditionResult,
    };

    nextHistory.push(createReaderRunStep(book, targetNodeId));
    return nextHistory;
  }

  function navigateToNodeWithoutHistory(
    nodeId: string,
    targetPageIndex = 0,
  ) {
    if (loadState.status !== "ready") return;

    const exists = loadState.book.nodes.some(
      (node) => node.id === nodeId,
    );

    if (!exists) {
      alert("Deze doel-node bestaat niet meer.");
      return;
    }

    lastExecutedFunctionNodeRef.current = null;
    lastEvaluatedConditionNodeRef.current = null;
    setCurrentNodeId(nodeId);
    setPageIndex(Math.max(0, targetPageIndex));
  }

  function goToNode(
    nodeId: string,
    transitionMeta: ReaderTransitionMeta = {},
  ) {
    if (loadState.status !== "ready") return;
    if (replayStepIndex !== null) return;

    const exists = loadState.book.nodes.some(
      (node) => node.id === nodeId,
    );

    if (!exists) {
      alert("Deze doel-node bestaat niet meer.");
      return;
    }

    const nextHistory = buildNextRunHistory(
      loadState.book,
      currentNodeId,
      nodeId,
      transitionMeta,
    );

    commitRunHistory(nextHistory);
    navigateToNodeWithoutHistory(nodeId);
  }

  function goToFirstOutgoingNode() {
    if (!reader?.outgoingPaths.length) return;

    const edge = reader.outgoingPaths[0];

    goToNode(edge.target, {
      sourceNodeId: reader.node.id,
      exitKind: reader.node.type === "cutscene" ? "cutscene" : "path",
      edgeLabel: edge.label,
    });
  }

  function getCurrentHistoryStepIndex() {
    if (replayStepIndex !== null) return replayStepIndex;

    for (
      let index = runHistoryRef.current.length - 1;
      index >= 0;
      index -= 1
    ) {
      if (runHistoryRef.current[index]?.nodeId === currentNodeId) {
        return index;
      }
    }

    return runHistoryRef.current.length - 1;
  }

  function canEnterPreviousReplayStep() {
    if (loadState.status !== "ready") return false;

    const currentIndex = getCurrentHistoryStepIndex();

    return (
      findReplayVisibleStepIndex(
        runHistoryRef.current,
        loadState.book,
        currentIndex - 1,
        -1,
      ) >= 0
    );
  }

  function openReplayAtStep(
    stepIndex: number,
    targetPageIndex = 0,
  ) {
    if (loadState.status !== "ready") return;

    const safeIndex = findReplayVisibleStepIndex(
      runHistoryRef.current,
      loadState.book,
      stepIndex,
      1,
    );

    if (safeIndex < 0) return;

    if (replayStepIndex === null) {
      replayReturnPointRef.current = {
        nodeId: currentNodeId,
        pageIndex,
        progressPercent: calculateBookProgressPercent(
          loadState.book,
          currentNodeId,
          pageIndex,
          readerPageCount,
        ),
      };
    }

    setContentsOpen(false);
    setSettingsOpen(false);
    setReplayStepIndex(safeIndex);
    navigateToNodeWithoutHistory(
      runHistoryRef.current[safeIndex].nodeId,
      targetPageIndex,
    );
  }

  function enterPreviousReplayStep() {
    if (loadState.status !== "ready") return;

    const currentIndex = getCurrentHistoryStepIndex();
    const previousIndex = findReplayVisibleStepIndex(
      runHistoryRef.current,
      loadState.book,
      currentIndex - 1,
      -1,
    );

    if (previousIndex < 0) return;

    const savedPage =
      runHistoryRef.current[previousIndex]?.lastPageIndex ?? 0;

    openReplayAtStep(previousIndex, savedPage);
  }

  function goToPreviousReplayStep() {
    if (
      loadState.status !== "ready" ||
      replayStepIndex === null
    ) {
      return;
    }

    const previousIndex = findReplayVisibleStepIndex(
      runHistoryRef.current,
      loadState.book,
      replayStepIndex - 1,
      -1,
    );

    if (previousIndex < 0) return;

    setReplayStepIndex(previousIndex);
    navigateToNodeWithoutHistory(
      runHistoryRef.current[previousIndex].nodeId,
      runHistoryRef.current[previousIndex]?.lastPageIndex ?? 0,
    );
  }

  function goToNextReplayStep() {
    if (
      loadState.status !== "ready" ||
      replayStepIndex === null
    ) {
      return;
    }

    const nextIndex = findReplayVisibleStepIndex(
      runHistoryRef.current,
      loadState.book,
      replayStepIndex + 1,
      1,
    );

    if (nextIndex < 0) return;

    setReplayStepIndex(nextIndex);
    navigateToNodeWithoutHistory(
      runHistoryRef.current[nextIndex].nodeId,
      0,
    );
  }

  function exitReplayMode() {
    const returnPoint = replayReturnPointRef.current;
    replayReturnPointRef.current = null;
    setReplayStepIndex(null);
    setContentsOpen(false);

    if (!returnPoint) return;

    navigateToNodeWithoutHistory(
      returnPoint.nodeId,
      returnPoint.pageIndex,
    );
  }

  function handleCutsceneLoadedMetadata(event: React.SyntheticEvent<HTMLVideoElement>) {
    setCutsceneFading(false);

    const shell = cutsceneShellRef.current;
    if (
      replayStepIndex === null &&
      shell &&
      !document.fullscreenElement &&
      shell.requestFullscreen
    ) {
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

    if (replayStepIndex !== null) {
      goToNextReplayStep();
      return;
    }

    goToFirstOutgoingNode();
  }

  async function applyEffectsAndGoToNode(
    targetNodeId: string,
    effects: ReaderFunctionAction[] = [],
    transitionMeta: ReaderTransitionMeta = {},
  ) {
    if (
      loadState.status !== "ready" ||
      !user ||
      interactionBusyRef.current ||
      replayStepIndex !== null
    ) {
      return;
    }

    const activeBook = loadState.book;
    const activeUser = user;
    const exists = activeBook.nodes.some(
      (node) => node.id === targetNodeId,
    );

    if (!exists) {
      alert("Deze doel-node bestaat niet meer.");
      return;
    }

    interactionBusyRef.current = true;
    setInteractionBusy(true);

    const nextStoryState = applyReaderFunctionActions(
      activeBook,
      storyStateRef.current,
      effects,
    );

    const nextHistory = buildNextRunHistory(
      activeBook,
      currentNodeId,
      targetNodeId,
      transitionMeta,
    );

    try {
      const progressPercent = calculateBookProgressPercent(
        activeBook,
        targetNodeId,
        0,
        1,
      );

      // Effect + routekeuze + nieuwe node worden samen opgeslagen.
      await saveReaderProgressSnapshot(
        activeUser.id,
        activeBook.id,
        targetNodeId,
        0,
        progressPercent,
        nextStoryState,
        nextHistory,
      );

      storyStateRef.current = nextStoryState;
      setStoryState(nextStoryState);
      commitRunHistory(nextHistory);
      enqueueReaderFeedbackToasts(
        setReaderFeedbacks,
        activeBook,
        effects,
      );
      clearLegacyReaderFlags(activeBook.id);
      navigateToNodeWithoutHistory(targetNodeId);
    } catch (effectError: any) {
      console.warn(
        "Variable effects / leesgeschiedenis opslaan mislukt.",
        effectError,
      );
      alert(
        `Verhaalstatus opslaan mislukt: ${
          effectError?.message ?? "onbekende fout"
        }`,
      );
    } finally {
      interactionBusyRef.current = false;
      setInteractionBusy(false);
    }
  }

  async function toggleReaderFullscreen() {
    const shell = readerShellRef.current;
    if (!shell) return;

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else if (shell.requestFullscreen) {
        await shell.requestFullscreen();
      }
    } catch (fullscreenError) {
      console.warn("Fullscreen kon niet worden gewijzigd.", fullscreenError);
    }
  }

  function handleReaderTouchStart(event: React.TouchEvent<HTMLElement>) {
    if (event.touches.length !== 1) {
      swipeStartRef.current = null;
      return;
    }

    swipeStartRef.current = {
      x: event.touches[0].clientX,
      y: event.touches[0].clientY,
    };
  }

  function handleReaderTouchEnd(event: React.TouchEvent<HTMLElement>) {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;

    if (!start || !reader || !isTextNode || event.changedTouches.length !== 1) {
      return;
    }

    const endTouch = event.changedTouches[0];
    const deltaX = endTouch.clientX - start.x;
    const deltaY = endTouch.clientY - start.y;

    // Verticale scroll/touch blijft normaal werken. Alleen duidelijke
    // horizontale swipes worden als pagina-navigatie gezien.
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) {
      return;
    }

    if (deltaX > 0) {
      if (pageIndex > 0) {
        setPageIndex((current) =>
          Math.max(0, current - readerVisiblePageCount),
        );
        return;
      }

      if (replayStepIndex !== null) {
        goToPreviousReplayStep();
        return;
      }

      if (canEnterPreviousReplayStep()) {
        enterPreviousReplayStep();
      }

      return;
    }

    const hasNextPage =
      pageIndex < Math.max(1, readerPageCount) - readerVisiblePageCount;

    if (hasNextPage) {
      setPageIndex((current) =>
        Math.min(
          Math.max(0, readerPageCount - 1),
          current + readerVisiblePageCount,
        ),
      );
      return;
    }

    if (replayStepIndex !== null) {
      goToNextReplayStep();
      return;
    }

    const lastTextNode =
      reader.textNodes[reader.textNodes.length - 1];

    if (reader.nextNodeAfterChain) {
      goToNode(reader.nextNodeAfterChain.id, {
        sourceNodeId: lastTextNode?.id ?? reader.node.id,
        exitKind: "path",
      });
      return;
    }

    if (reader.branchPaths.length === 1) {
      const edge = reader.branchPaths[0];

      goToNode(edge.target, {
        sourceNodeId: lastTextNode?.id ?? reader.node.id,
        exitKind: "path",
        edgeLabel: edge.label,
      });
    }
  }

  async function handleRestartReading() {
    if (loadState.status !== "ready" || !user) return;

    const activeBook = loadState.book;
    const activeUser = user;

    const confirmed = window.confirm(
      "Weet je dit zeker? Je leesvoortgang voor dit boek wordt gewist en je begint opnieuw bij het begin.",
    );

    if (!confirmed) return;

    setResetProgressBusy(true);

    try {
      await resetReadingProgress(activeUser, activeBook.id);
      clearLegacyReaderFlags(activeBook.id);

      const resetStoryState = createDefaultReaderStoryState(activeBook);
      storyStateRef.current = resetStoryState;
      storyStateReadyRef.current = true;
      setStoryState(resetStoryState);
      setReaderFeedbacks([]);

      const resetRunHistory = [
        createReaderRunStep(activeBook, activeBook.startNodeId),
      ];
      runHistoryRef.current = resetRunHistory;
      runHistoryReadyRef.current = true;
      setRunHistory(resetRunHistory);
      setReplayStepIndex(null);
      replayReturnPointRef.current = null;

      lastExecutedFunctionNodeRef.current = null;
      lastEvaluatedConditionNodeRef.current = null;
      setCurrentNodeId(activeBook.startNodeId);
      setPageIndex(0);
      setReaderPageCount(1);
      setReaderVisiblePageCount(1);
      setSettingsOpen(false);
      setContentsOpen(false);
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
  const isReadOnlyReplay = replayStepIndex !== null;
  const activeReplayStep =
    replayStepIndex !== null
      ? runHistory[replayStepIndex] ?? null
      : null;
  const displayedChapter = isReadOnlyReplay
    ? getChapterFromRunHistory(
        runHistory,
        book,
        replayStepIndex ?? 0,
      )
    : reader.activeChapter;

  const reachedChapters = (() => {
    const seen = new Set<string>();
    const chapters: Array<{
      stepIndex: number;
      node: ReaderNode;
    }> = [];

    runHistory.forEach((step, stepIndex) => {
      const chapterNode = book.nodes.find(
        (item) => item.id === step.nodeId && item.type === "chapter",
      );

      if (!chapterNode || seen.has(chapterNode.id)) return;
      seen.add(chapterNode.id);
      chapters.push({ stepIndex, node: chapterNode });
    });

    return chapters;
  })();

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

  const readerSettingsPanelClass =
    theme === "light"
      ? "border-neutral-300 bg-[#fffaf0] text-neutral-950"
      : theme === "sepia"
        ? "border-[#8f6b38]/40 bg-[#2b2116] text-[#f3e4c9]"
        : "border-white/10 bg-[#090c13] text-white";

  const readerSettingsFieldClass =
    theme === "light"
      ? "border-neutral-300 bg-white text-neutral-950"
      : theme === "sepia"
        ? "border-[#8f6b38]/35 bg-[#23190f] text-[#f3e4c9]"
        : "border-white/10 bg-white/[0.06] text-white";

  const currentProgressPercent =
    isReadOnlyReplay && replayReturnPointRef.current
      ? replayReturnPointRef.current.progressPercent
      : calculateBookProgressPercent(
          book,
          currentNodeId,
          pageIndex,
          readerPageCount,
        );

  const hideReaderChromeForCutscene =
    isCutsceneNode && !isReadOnlyReplay;

  const currentHistoryIndex = getCurrentHistoryStepIndex();
  const globalPageOffset = getReaderGlobalPageOffset(
    runHistory,
    book,
    currentHistoryIndex,
  );
  const globalPageStart = globalPageOffset + pageIndex + 1;
  const visibleGlobalPageCount = isTextNode
    ? Math.max(
        1,
        Math.min(
          readerVisiblePageCount,
          Math.max(1, readerPageCount - pageIndex),
        ),
      )
    : 0;
  const globalPageEnd =
    globalPageStart + Math.max(0, visibleGlobalPageCount - 1);

  const canGoToPreviousVisitedScene =
    findReplayVisibleStepIndex(
      runHistory,
      book,
      currentHistoryIndex - 1,
      -1,
    ) >= 0;
  const canGoToNextReplayScene =
    isReadOnlyReplay &&
    findReplayVisibleStepIndex(
      runHistory,
      book,
      (replayStepIndex ?? 0) + 1,
      1,
    ) >= 0;
  const canGoToPreviousReplayScene =
    isReadOnlyReplay &&
    findReplayVisibleStepIndex(
      runHistory,
      book,
      (replayStepIndex ?? 0) - 1,
      -1,
    ) >= 0;

  return (
    <main
      ref={readerShellRef}
      className={`relative flex h-screen flex-col overflow-hidden ${readerShellClass}`}
    >
      {!hideReaderChromeForCutscene && (
      <header className={`shrink-0 border-b px-4 py-3 backdrop-blur-xl sm:px-6 ${readerChromeClass}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-300">
              DiBooks Reader
            </p>
            <h1 className="truncate text-xl font-black sm:text-2xl">{book.title}</h1>
            {displayedChapter && (
              <p className="mt-0.5 truncate text-[11px] font-black tracking-wide text-blue-300/80 sm:text-xs">
                {formatReaderChapterLabel(displayedChapter)}
                {displayedChapter.chapterSubtitle
                  ? ` • ${displayedChapter.chapterSubtitle}`
                  : ""}
              </p>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={() => {
                setSettingsOpen((current) => !current);
                setContentsOpen(false);
              }}
              className="rounded-full border border-white/10 px-4 py-2 text-xs font-black hover:bg-white/10"
              title="Reader instellingen"
            >
              Aa
            </button>
            <button
              onClick={() => {
                setContentsOpen((current) => !current);
                setSettingsOpen(false);
              }}
              className="rounded-full border border-white/10 px-4 py-2 text-xs font-black hover:bg-white/10"
              title="Bereikte hoofdstukken"
            >
              Inhoud
            </button>
            <button
              onClick={() => void toggleReaderFullscreen()}
              className="rounded-full border border-white/10 px-4 py-2 text-xs font-black hover:bg-white/10"
              title={isFullscreen ? "Fullscreen verlaten" : "Fullscreen lezen"}
              aria-label={isFullscreen ? "Fullscreen verlaten" : "Fullscreen lezen"}
            >
              {isFullscreen ? "⤢" : "⛶"}
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

      </header>
      )}

      {readerFeedbacks.length > 0 && replayStepIndex === null && (
        <div className="pointer-events-none fixed right-4 top-20 z-[70] flex w-[min(22rem,calc(100vw-2rem))] flex-col gap-2 sm:right-6 sm:top-24">
          {readerFeedbacks.map((feedback) => {
            const presentation = getReaderFeedbackPresentation(feedback.type);

            return (
              <div
                key={feedback.id}
                className="rounded-2xl border border-blue-300/20 bg-[#0b1020]/95 p-4 text-white shadow-2xl shadow-black/55 backdrop-blur-xl"
              >
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{presentation.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-[0.24em] text-blue-200">
                      {presentation.title}
                    </p>
                    <p className="mt-1 text-sm font-bold leading-5 text-white">
                      {feedback.text}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {settingsOpen && !hideReaderChromeForCutscene && (
        <div
          className={`absolute right-4 top-[5.25rem] z-50 w-[min(24rem,calc(100vw-2rem))] rounded-3xl border p-4 shadow-2xl backdrop-blur-xl sm:right-6 ${readerSettingsPanelClass}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-400">
                Reader
              </p>
              <h2 className="mt-1 text-xl font-black">Leesinstellingen</h2>
              <p className="mt-1 text-xs font-semibold opacity-55">
                Deze voorkeuren worden automatisch onthouden.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              className="rounded-full border border-current/10 px-3 py-2 text-xs font-black opacity-70 hover:opacity-100"
              aria-label="Sluit leesinstellingen"
              title="Sluit leesinstellingen"
            >
              ✕
            </button>
          </div>

          <div className="mt-5 grid gap-3">
            <label className="grid grid-cols-[1fr_9.5rem] items-center gap-3">
              <span className="text-sm font-black">Tekstgrootte</span>
              <select
                value={textSize}
                onChange={(event) => setTextSize(event.target.value as ReaderTextSize)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-black outline-none focus:border-blue-500 ${readerSettingsFieldClass}`}
                style={{
                  colorScheme: theme === "light" ? "light" : "dark",
                }}
              >
                <option value="small">Klein</option>
                <option value="normal">Normaal</option>
                <option value="large">Groot</option>
              </select>
            </label>

            <label className="grid grid-cols-[1fr_9.5rem] items-center gap-3">
              <span className="text-sm font-black">Paginaweergave</span>
              <select
                value={pageMode}
                onChange={(event) => setPageMode(event.target.value as ReaderPageMode)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-black outline-none focus:border-blue-500 ${readerSettingsFieldClass}`}
                style={{
                  colorScheme: theme === "light" ? "light" : "dark",
                }}
              >
                <option value="auto">Automatisch</option>
                <option value="single">Enkel</option>
                <option value="double">Dubbel</option>
              </select>
            </label>

            <label className="grid grid-cols-[1fr_9.5rem] items-center gap-3">
              <span className="text-sm font-black">Thema</span>
              <select
                value={theme}
                onChange={(event) => setTheme(event.target.value as ReaderTheme)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-black outline-none focus:border-blue-500 ${readerSettingsFieldClass}`}
                style={{
                  colorScheme: theme === "light" ? "light" : "dark",
                }}
              >
                <option value="dark">Donker</option>
                <option value="sepia">Oud boek</option>
                <option value="light">Licht</option>
              </select>
            </label>

            <label className="grid grid-cols-[1fr_9.5rem] items-center gap-3">
              <span className="text-sm font-black">Regelafstand</span>
              <select
                value={lineSpacing}
                onChange={(event) => setLineSpacing(event.target.value as ReaderLineSpacing)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-black outline-none focus:border-blue-500 ${readerSettingsFieldClass}`}
                style={{
                  colorScheme: theme === "light" ? "light" : "dark",
                }}
              >
                <option value="compact">Compact</option>
                <option value="normal">Normaal</option>
                <option value="relaxed">Ruim</option>
              </select>
            </label>

            <label className="grid grid-cols-[1fr_9.5rem] items-center gap-3">
              <span className="text-sm font-black">Lettertype</span>
              <select
                value={fontFamily}
                onChange={(event) => setFontFamily(event.target.value as ReaderFontFamily)}
                className={`rounded-xl border px-3 py-2.5 text-sm font-black outline-none focus:border-blue-500 ${readerSettingsFieldClass}`}
                style={{
                  colorScheme: theme === "light" ? "light" : "dark",
                }}
              >
                <option value="serif">Boek / serif</option>
                <option value="sans">Strak / sans</option>
              </select>
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-current/10 bg-black/10 px-4 py-3 text-[11px] font-semibold opacity-55">
            Tip: gebruik ← → op pc of swipe links/rechts op mobiel en tablet.
          </div>
        </div>
      )}

      {contentsOpen && !hideReaderChromeForCutscene && (
        <div className="absolute right-4 top-[5.25rem] z-50 w-[min(24rem,calc(100vw-2rem))] rounded-3xl border border-white/10 bg-[#090c13]/98 p-4 text-white shadow-2xl backdrop-blur-xl sm:right-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-300">
                Inhoud
              </p>
              <h2 className="mt-1 text-xl font-black">
                Bereikte hoofdstukken
              </h2>
              <p className="mt-1 text-xs font-semibold leading-5 text-neutral-500">
                Alleen hoofdstukken uit jouw huidige verhaalpad worden getoond.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setContentsOpen(false)}
              className="rounded-full border border-white/10 px-3 py-2 text-xs font-black text-neutral-300 hover:bg-white/10"
            >
              ✕
            </button>
          </div>

          <div className="mt-4 grid max-h-[55vh] gap-2 overflow-y-auto pr-1">
            {reachedChapters.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm font-semibold text-neutral-400">
                Er is in deze leesrun nog geen hoofdstuk-marker opgeslagen.
              </div>
            )}

            {reachedChapters.map(({ stepIndex, node: chapterNode }) => {
              const targetIndex = findReplayVisibleStepIndex(
                runHistory,
                book,
                stepIndex + 1,
                1,
              );

              return (
                <button
                  key={`${chapterNode.id}-${stepIndex}`}
                  type="button"
                  disabled={targetIndex < 0}
                  onClick={() => openReplayAtStep(stepIndex + 1, 0)}
                  className="rounded-2xl border border-white/10 bg-white/[0.045] p-4 text-left transition hover:border-blue-400/30 hover:bg-blue-500/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="block text-sm font-black text-white">
                    {formatReaderChapterLabel(chapterNode)}
                  </span>
                  {chapterNode.chapterSubtitle && (
                    <span className="mt-1 block text-xs font-semibold text-neutral-500">
                      {chapterNode.chapterSubtitle}
                    </span>
                  )}
                  <span className="mt-2 block text-[10px] font-black uppercase tracking-widest text-blue-300/70">
                    Teruglezen
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {isReadOnlyReplay && !hideReaderChromeForCutscene && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-amber-400/20 bg-amber-500/10 px-4 py-2 text-amber-100 sm:px-6">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-300">
              Terugleesmodus
            </p>
            <p className="text-xs font-semibold text-amber-100/70">
              Je bekijkt je eerder gelezen pad. Keuzes en verhaalstatus kunnen hier niet veranderen.
            </p>
          </div>
          <button
            type="button"
            onClick={exitReplayMode}
            className="rounded-full bg-amber-300 px-4 py-2 text-xs font-black text-amber-950 hover:bg-amber-200"
          >
            Terug naar waar ik was
          </button>
        </div>
      )}

      {!hideReaderChromeForCutscene && (
        <div
          className={`h-1 shrink-0 ${
            theme === "light"
              ? "bg-neutral-300"
              : theme === "sepia"
                ? "bg-[#1b130c]"
                : "bg-white/5"
          }`}
          aria-label={`${currentProgressPercent}% gelezen`}
        >
          <div
            className="h-full bg-blue-500 transition-[width] duration-300"
            style={{ width: `${currentProgressPercent}%` }}
          />
        </div>
      )}

      <section
        className={`min-h-0 flex-1 overflow-hidden ${isTextNode ? "touch-pan-y" : ""}`}
        onTouchStart={isTextNode ? handleReaderTouchStart : undefined}
        onTouchEnd={isTextNode ? handleReaderTouchEnd : undefined}
      >
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
            lineSpacing={lineSpacing}
            fontFamily={fontFamily}
            globalPageOffset={globalPageOffset}
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

        {node.type === "chapter" && (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-xl rounded-3xl border border-rose-500/20 bg-rose-500/10 p-8 text-center text-rose-100 shadow-2xl">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">
                Hoofdstuk laden
              </p>
              <h1 className="mt-3 text-3xl font-black">
                {formatReaderChapterLabel(node)}
              </h1>
              <p className="mt-3 text-sm font-semibold leading-6 text-rose-100/70">
                Deze structuurmarker hoort automatisch door te sturen. Als dit blijft staan, mist het hoofdstuk een vervolgpath.
              </p>
            </div>
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

        {node.type === "condition" && (
          <div className="flex h-full items-center justify-center p-6">
            <div className="max-w-xl rounded-3xl border border-teal-500/20 bg-teal-500/10 p-8 text-center text-teal-100 shadow-2xl">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-teal-300">DiBooks voorwaarde</p>
              <h1 className="mt-3 text-3xl font-black">Route bepalen...</h1>
              <p className="mt-3 text-sm font-semibold leading-6 text-teal-100/70">
                De reader controleert je eerdere keuzes en stuurt automatisch naar TRUE of ELSE.
              </p>
            </div>
          </div>
        )}

        {node.type === "choice" && (
          <div className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-4 p-6">
            <div className="rounded-[2rem] border border-orange-500/20 bg-orange-950/20 p-7 shadow-2xl sm:p-9">
              <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">
                {isReadOnlyReplay ? "Eerder keuzemoment" : "Keuze moment"}
              </p>
              <h1 className="mt-3 text-3xl font-black sm:text-5xl">{node.title}</h1>

              {isReadOnlyReplay && (
                <p className="mt-3 text-sm font-semibold leading-6 text-orange-100/65">
                  Je kunt je gemaakte keuze terugzien, maar niet wijzigen.
                </p>
              )}

              <div className="mt-8 grid gap-3">
                {node.choices
                  .slice(0, 3)
                  .filter((choice) => choice.label?.trim())
                  .map((choice, index) => {
                    const wasSelected =
                      isReadOnlyReplay &&
                      (
                        activeReplayStep?.choiceIndex === index ||
                        (
                          activeReplayStep?.choiceLabel &&
                          activeReplayStep.choiceLabel === choice.label
                        ) ||
                        (
                          activeReplayStep?.exitTargetNodeId &&
                          activeReplayStep.exitTargetNodeId ===
                            choice.targetNodeId
                        )
                      );

                    return (
                      <button
                        key={`${choice.label}-${index}`}
                        onClick={() => {
                          if (isReadOnlyReplay || !choice.targetNodeId) return;

                          void applyEffectsAndGoToNode(
                            choice.targetNodeId,
                            choice.effects ?? [],
                            {
                              sourceNodeId: node.id,
                              exitKind: "choice",
                              choiceIndex: index,
                              choiceLabel: choice.label,
                            },
                          );
                        }}
                        disabled={
                          isReadOnlyReplay ||
                          !choice.targetNodeId ||
                          interactionBusy
                        }
                        className={`rounded-2xl border px-5 py-4 text-left text-lg font-black transition ${
                          wasSelected
                            ? "border-emerald-300/50 bg-emerald-500/20 text-emerald-50 ring-2 ring-emerald-300/20"
                            : isReadOnlyReplay
                              ? "border-white/10 bg-white/[0.035] text-neutral-500 opacity-55"
                              : "border-orange-400/25 bg-orange-500/15 text-orange-50 hover:bg-orange-500/25"
                        } disabled:cursor-default`}
                      >
                        <span className={`mr-3 ${wasSelected ? "text-emerald-300" : "text-orange-300"}`}>
                          {["A", "B", "C"][index]}.
                        </span>
                        {choice.label}
                        {wasSelected && (
                          <span className="ml-3 rounded-full bg-emerald-300 px-2 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-950">
                            Jouw keuze
                          </span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </div>
          </div>
        )}

        {node.type === "minigame" && (
          isReadOnlyReplay ? (
            <div className="mx-auto flex h-full max-w-3xl items-center justify-center p-6">
              <div className="w-full rounded-[2rem] border border-purple-500/25 bg-purple-950/25 p-7 shadow-2xl sm:p-9">
                <p className="text-xs font-black uppercase tracking-[0.28em] text-purple-300">
                  Eerdere minigame
                </p>
                <h1 className="mt-3 text-3xl font-black sm:text-5xl">
                  {node.title}
                </h1>
                <p className="mt-4 text-sm font-semibold leading-6 text-neutral-400">
                  Minigames worden in terugleesmodus niet opnieuw gespeeld.
                </p>

                <div
                  className={`mt-7 rounded-2xl border p-5 ${
                    activeReplayStep?.miniGameResult === "success"
                      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-100"
                      : activeReplayStep?.miniGameResult === "fail"
                        ? "border-red-400/30 bg-red-500/10 text-red-100"
                        : "border-white/10 bg-white/5 text-neutral-300"
                  }`}
                >
                  <p className="text-xs font-black uppercase tracking-widest opacity-70">
                    Jouw resultaat
                  </p>
                  <p className="mt-2 text-2xl font-black">
                    {activeReplayStep?.miniGameResult === "success"
                      ? "Gelukt"
                      : activeReplayStep?.miniGameResult === "fail"
                        ? "Mislukt"
                        : "Resultaat onbekend"}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <StabilizeLineMiniGame
              node={node}
              onSuccess={() => {
                const targetId =
                  node.miniGameSuccessTargetNodeId ||
                  book.edges.find(
                    (edge) =>
                      edge.source === node.id &&
                      edge.data?.miniGameResult === "success",
                  )?.target;

                if (!targetId) {
                  alert("Deze minigame heeft nog geen success route.");
                  return;
                }

                void applyEffectsAndGoToNode(
                  targetId,
                  node.miniGameSuccessEffects ?? [],
                  {
                    sourceNodeId: node.id,
                    exitKind: "minigame",
                    miniGameResult: "success",
                  },
                );
              }}
              onFail={() => {
                const targetId =
                  node.miniGameFailTargetNodeId ||
                  book.edges.find(
                    (edge) =>
                      edge.source === node.id &&
                      edge.data?.miniGameResult === "fail",
                  )?.target;

                if (!targetId) {
                  alert("Deze minigame heeft nog geen fail route.");
                  return;
                }

                void applyEffectsAndGoToNode(
                  targetId,
                  node.miniGameFailEffects ?? [],
                  {
                    sourceNodeId: node.id,
                    exitKind: "minigame",
                    miniGameResult: "fail",
                  },
                );
              }}
            />
          )
        )}
      </section>

      {!hideReaderChromeForCutscene && (
      <footer className={`shrink-0 border-t px-4 py-3 sm:px-6 ${readerChromeClass}`}>
        {isReadOnlyReplay ? (
          isTextNode ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => {
                  if (pageIndex > 0) {
                    setPageIndex((current) =>
                      Math.max(0, current - readerVisiblePageCount),
                    );
                    return;
                  }

                  goToPreviousReplayStep();
                }}
                disabled={
                  pageIndex <= 0 && !canGoToPreviousReplayScene
                }
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-black text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
              >
                Vorige
              </button>

              <div className="text-center text-sm font-bold text-neutral-400">
                <div>
                  {globalPageEnd > globalPageStart
                    ? `Pagina ${globalPageStart}–${globalPageEnd}`
                    : `Pagina ${globalPageStart}`}
                </div>
                <div className="text-xs text-amber-400/70">
                  Alleen teruglezen • je echte voortgang blijft op {currentProgressPercent}%
                </div>
              </div>

              {canGoNextPage ? (
                <button
                  onClick={() =>
                    setPageIndex((current) =>
                      Math.min(
                        Math.max(0, readerPageCount - 1),
                        current + readerVisiblePageCount,
                      ),
                    )
                  }
                  className="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-500"
                >
                  Volgende pagina
                </button>
              ) : (
                <button
                  onClick={goToNextReplayStep}
                  disabled={!canGoToNextReplayScene}
                  className="rounded-2xl bg-amber-400 px-5 py-3 font-black text-amber-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  Verder teruglezen
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                type="button"
                onClick={goToPreviousReplayStep}
                disabled={!canGoToPreviousReplayScene}
                className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-black text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
              >
                Vorige scène
              </button>

              <div className="text-center text-xs font-black uppercase tracking-widest text-amber-400/70">
                Terugleesmodus
              </div>

              <button
                type="button"
                onClick={goToNextReplayStep}
                disabled={!canGoToNextReplayScene}
                className="rounded-2xl bg-amber-400 px-5 py-3 font-black text-amber-950 hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-35"
              >
                Volgende scène
              </button>
            </div>
          )
        ) : isTextNode ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              onClick={() => {
                if (pageIndex > 0) {
                  setPageIndex((current) =>
                    Math.max(0, current - readerVisiblePageCount),
                  );
                  return;
                }

                enterPreviousReplayStep();
              }}
              disabled={
                pageIndex <= 0 && !canGoToPreviousVisitedScene
              }
              className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-black text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {pageIndex > 0 ? "Vorige pagina" : "Teruglezen"}
            </button>

            <div className="text-center text-sm font-bold text-neutral-400">
              <div>
                {globalPageEnd > globalPageStart
                    ? `Pagina ${globalPageStart}–${globalPageEnd}`
                    : `Pagina ${globalPageStart}`}
              </div>
              <div className="text-xs text-neutral-600">
                {currentProgressPercent}% gelezen
                {" • "}
                {displayedChapter
                  ? formatReaderChapterLabel(displayedChapter)
                  : book.title}
              </div>
              <button
                onClick={handleRestartReading}
                disabled={resetProgressBusy}
                className="mt-2 rounded-full border border-red-400/20 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-300 hover:bg-red-500/10 disabled:opacity-50"
              >
                {resetProgressBusy ? "Resetten..." : "Opnieuw lezen"}
              </button>
            </div>

            {canGoNextPage && (
              <button
                onClick={() =>
                  setPageIndex((current) =>
                    Math.min(
                      Math.max(0, readerPageCount - 1),
                      current + readerVisiblePageCount,
                    ),
                  )
                }
                className="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-500"
              >
                Volgende pagina
              </button>
            )}

            {!canGoNextPage && reader.nextNodeAfterChain && (
              <button
                onClick={() => {
                  const lastTextNode =
                    reader.textNodes[reader.textNodes.length - 1];

                  goToNode(reader.nextNodeAfterChain!.id, {
                    sourceNodeId:
                      lastTextNode?.id ?? reader.node.id,
                    exitKind: "path",
                  });
                }}
                className="rounded-2xl bg-emerald-600 px-5 py-3 font-black text-white hover:bg-emerald-500"
              >
                Ga verder
              </button>
            )}

            {!canGoNextPage &&
              !reader.nextNodeAfterChain &&
              reader.branchPaths.length > 0 && (
                <div className="flex flex-wrap justify-end gap-3">
                  {reader.branchPaths.map((edge, index) => {
                    const targetNode = book.nodes.find(
                      (item) => item.id === edge.target,
                    );
                    const lastTextNode =
                      reader.textNodes[
                        reader.textNodes.length - 1
                      ];

                    return (
                      <button
                        key={edge.id}
                        onClick={() =>
                          goToNode(edge.target, {
                            sourceNodeId:
                              lastTextNode?.id ?? reader.node.id,
                            exitKind: "path",
                            edgeLabel: edge.label,
                          })
                        }
                        className="rounded-2xl bg-emerald-600 px-5 py-3 text-left font-black text-white hover:bg-emerald-500"
                      >
                        {edge.label
                          ? `${edge.label}: `
                          : reader.branchPaths.length > 1
                            ? `Optie ${index + 1}: `
                            : "Ga verder naar "}
                        {targetNode?.title ?? "volgende scène"}
                      </button>
                    );
                  })}
                </div>
              )}

            {!canGoNextPage &&
              !reader.nextNodeAfterChain &&
              reader.branchPaths.length === 0 && (
                <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-black text-neutral-300">
                  Einde bereikt
                </div>
              )}
          </div>
        ) : node.type !== "choice" &&
          node.type !== "minigame" &&
          node.type !== "function" &&
          node.type !== "condition" &&
          node.type !== "chapter" ? (
          <div className="flex flex-wrap justify-end gap-3">
            {reader.outgoingPaths.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-5 py-3 font-black text-neutral-300">
                Einde bereikt
              </div>
            )}

            {reader.outgoingPaths.map((edge) => {
              const targetNode = book.nodes.find(
                (item) => item.id === edge.target,
              );

              return (
                <button
                  key={edge.id}
                  onClick={() =>
                    goToNode(edge.target, {
                      sourceNodeId: node.id,
                      exitKind:
                        node.type === "cutscene"
                          ? "cutscene"
                          : "path",
                      edgeLabel: edge.label,
                    })
                  }
                  className="rounded-2xl bg-blue-600 px-5 py-3 font-black text-white hover:bg-blue-500"
                >
                  Ga verder naar {targetNode?.title ?? "volgende scène"}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center text-xs font-black uppercase tracking-widest text-neutral-600">
            {node.type === "chapter"
              ? "Hoofdstuk laden…"
              : "Interactieve scène"}
          </div>
        )}
      </footer>
      )}
    </main>
  );
}
