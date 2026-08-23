"use client";

import { AppNavActions } from "@/components/AppNav";
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
import AuthModal from "@/components/AuthModal";
import { FREE_NODE_LIMIT, getPlanLabel, getMaxNodesForUser, canAccessOwnedResource, useDemoAuth } from "@/lib/auth";
import {
  fetchBookSeriesFromSupabase,
  fetchDashboardBookFromSupabase,
  saveDashboardBookToSupabase,
  updateDashboardBookProjectInSupabase,
  type BookSeries,
} from "@/lib/supabase/dashboardBooks";
import BookSeriesManagerModal from "@/components/BookSeriesManagerModal";
import {
  fetchSharedBookForEditor,
  submitBookRevision,
} from "@/lib/supabase/socialFeatures";
import {
  resolveDiBooksMediaUrl,
  uploadCutsceneVideoToStorage,
} from "@/lib/supabase/mediaStorage";

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

type DiNodeType = "text" | "special" | "cutscene" | "choice" | "minigame" | "function" | "condition" | "scratchpad";

type MiniGameDifficulty = "easy" | "normal" | "hard";

type StoryVariableType = "boolean" | "number" | "text";
type StoryVariableValue = boolean | number | string;

type StoryVariable = {
  id: string;
  name: string;
  type: StoryVariableType;
  defaultValue: StoryVariableValue;
  description?: string;
};

type FunctionActionType =
  | "set_flag"
  | "clear_flag"
  | "increment"
  | "decrement"
  | "set_number"
  | "set_text";

type FunctionAction = {
  id: string;
  type: FunctionActionType;
  key: string;
  variableId?: string;
  amount?: number;
  textValue?: string;
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

function getDefaultConditionOperatorForType(type: StoryVariableType): ConditionOperator {
  if (type === "boolean") return "is_true";
  return "equals";
}

function getDefaultConditionValueForType(type: StoryVariableType): StoryVariableValue {
  if (type === "number") return 0;
  if (type === "text") return "";
  return true;
}

function getDefaultStoryVariableValue(type: StoryVariableType): StoryVariableValue {
  if (type === "boolean") return false;
  if (type === "number") return 0;
  return "";
}

function getRequiredVariableTypeForAction(actionType: FunctionActionType): StoryVariableType {
  if (actionType === "set_flag" || actionType === "clear_flag") return "boolean";
  if (actionType === "set_text") return "text";
  return "number";
}

function normalizeStoryVariableName(value: string) {
  const normalized = value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^([0-9])/, "_$1");

  return normalized || "variabele";
}

type DiNodeData = {
  label: string;
  type: DiNodeType;
  isStart?: boolean;
  text?: string;
  textHtml?: string;
  specialSubtype?: string;
  videoUrl?: string;
  videoStoragePath?: string;
  videoFileName?: string;
  videoDuration?: number;
  choices?: {
    label: string;
    targetNodeId?: string;
    effects?: FunctionAction[];
  }[];
  miniGameType?: string;
  miniGameDuration?: number;
  miniGameDifficulty?: MiniGameDifficulty;
  miniGameAllowRetry?: boolean;
  miniGameSuccessTargetNodeId?: string;
  miniGameFailTargetNodeId?: string;
  miniGameSuccessEffects?: FunctionAction[];
  miniGameFailEffects?: FunctionAction[];
  functionActions?: FunctionAction[];
  conditionVariableId?: string;
  conditionKey?: string;
  conditionOperator?: ConditionOperator;
  conditionValue?: StoryVariableValue;
  conditionTrueTargetNodeId?: string;
  conditionFalseTargetNodeId?: string;
};

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

const nodeColors: Record<DiNodeType, string> = {
  text: "#2563eb",
  special: "#eab308",
  cutscene: "#16a34a",
  choice: "#f97316",
  minigame: "#9333ea",
  function: "#06b6d4",
  condition: "#14b8a6",
  scratchpad: "#f8fafc",
};

const nodeLabels: Record<DiNodeType, string> = {
  text: "Tekst",
  special: "Speciale pagina",
  cutscene: "Cutscene",
  choice: "Keuze",
  minigame: "Mini game",
  function: "Functie",
  condition: "Voorwaarde / IF",
  scratchpad: "Kladblok",
};

function isScratchpadNode(node: Node<DiNodeData> | undefined | null) {
  return node?.data?.type === "scratchpad";
}

function getStoryNodes(currentNodes: Node<DiNodeData>[]) {
  return currentNodes.filter((node) => !isScratchpadNode(node));
}

function getStoryNodeIds(currentNodes: Node<DiNodeData>[]) {
  return new Set(getStoryNodes(currentNodes).map((node) => node.id));
}

function getStoryEdges(currentEdges: Edge[], currentNodes: Node<DiNodeData>[]) {
  const storyNodeIds = getStoryNodeIds(currentNodes);
  return currentEdges.filter(
    (edge) => storyNodeIds.has(edge.source) && storyNodeIds.has(edge.target),
  );
}

function getSafeStartNodeId(currentNodes: Node<DiNodeData>[], preferredStartId?: string | null) {
  const storyNodes = getStoryNodes(currentNodes);
  if (preferredStartId && storyNodes.some((node) => node.id === preferredStartId)) {
    return preferredStartId;
  }
  return storyNodes[0]?.id ?? "";
}


function createVariableEffectAction(prefix = "effect"): FunctionAction {
  return {
    id: `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: "set_flag",
    key: "",
    variableId: "",
    amount: 1,
    textValue: "",
  };
}

function VariableEffectsEditor({
  title,
  description,
  actions,
  variables,
  onChange,
  accent = "orange",
}: {
  title: string;
  description?: string;
  actions: FunctionAction[];
  variables: StoryVariable[];
  onChange: (actions: FunctionAction[]) => void;
  accent?: "orange" | "cyan" | "red" | "purple";
}) {
  const accentClasses = {
    orange: "border-orange-500/25 bg-orange-950/20 text-orange-200 focus:border-orange-400",
    cyan: "border-cyan-500/25 bg-cyan-950/20 text-cyan-200 focus:border-cyan-400",
    red: "border-red-500/25 bg-red-950/20 text-red-200 focus:border-red-400",
    purple: "border-purple-500/25 bg-purple-950/20 text-purple-200 focus:border-purple-400",
  }[accent];

  function updateAction(actionId: string, updates: Partial<FunctionAction>) {
    onChange(actions.map((action) => (action.id === actionId ? { ...action, ...updates } : action)));
  }

  return (
    <div className={`rounded-xl border p-3 ${accentClasses}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-black">{title}</div>
          {description && <p className="mt-1 text-xs font-bold leading-5 text-neutral-400">{description}</p>}
        </div>
        <span className="shrink-0 rounded-full bg-black/25 px-2 py-1 text-[10px] font-black uppercase tracking-wider">
          {actions.length}/4
        </span>
      </div>

      {actions.length > 0 && (
        <div className="mt-3 grid gap-3">
          {actions.map((action, actionIndex) => {
            const requiredType = getRequiredVariableTypeForAction(action.type);
            const compatibleVariables = variables.filter((variable) => variable.type === requiredType);
            const selectedVariableId =
              variables.find((variable) => variable.id === action.variableId)?.id ??
              variables.find((variable) => variable.name === action.key && variable.type === requiredType)?.id ??
              "";

            return (
              <div key={action.id} className="rounded-xl border border-white/10 bg-black/25 p-3 text-white">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-neutral-400">
                    Effect {actionIndex + 1}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChange(actions.filter((item) => item.id !== action.id))}
                    className="rounded-lg bg-red-600 px-2 py-1 text-[10px] font-black text-white hover:bg-red-500"
                  >
                    Verwijder
                  </button>
                </div>

                <select
                  value={action.type}
                  onChange={(event) =>
                    updateAction(action.id, {
                      type: event.target.value as FunctionActionType,
                      variableId: "",
                      key: "",
                      amount: 1,
                      textValue: "",
                    })
                  }
                  className="mb-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-xs font-bold text-white outline-none"
                >
                  <option value="set_flag">Flag aanzetten</option>
                  <option value="clear_flag">Flag uitzetten</option>
                  <option value="increment">Getal verhogen</option>
                  <option value="decrement">Getal verlagen</option>
                  <option value="set_number">Getal instellen</option>
                  <option value="set_text">Tekst instellen</option>
                </select>

                <select
                  value={selectedVariableId}
                  onChange={(event) => {
                    const variable = variables.find((item) => item.id === event.target.value);
                    updateAction(action.id, {
                      variableId: variable?.id ?? "",
                      key: variable?.name ?? "",
                    });
                  }}
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-xs font-bold text-white outline-none"
                >
                  <option value="">Kies variabele...</option>
                  {compatibleVariables.map((variable) => (
                    <option key={variable.id} value={variable.id}>{variable.name}</option>
                  ))}
                </select>

                {compatibleVariables.length === 0 && (
                  <p className="mt-2 text-[11px] font-bold leading-4 text-neutral-400">
                    Maak eerst een {requiredType === "boolean" ? "boolean" : requiredType === "number" ? "getal" : "tekst"}-variabele via Flags & Variabelen.
                  </p>
                )}

                {(action.type === "increment" || action.type === "decrement" || action.type === "set_number") && (
                  <input
                    type="number"
                    value={action.amount ?? (action.type === "set_number" ? 0 : 1)}
                    onChange={(event) => updateAction(action.id, { amount: Number(event.target.value) || 0 })}
                    className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-xs font-bold text-white outline-none"
                    placeholder={action.type === "set_number" ? "Waarde" : "Aantal"}
                  />
                )}

                {action.type === "set_text" && (
                  <input
                    value={action.textValue ?? ""}
                    onChange={(event) => updateAction(action.id, { textValue: event.target.value })}
                    className="mt-2 w-full rounded-lg border border-neutral-700 bg-neutral-950 p-2 text-xs font-bold text-white outline-none"
                    placeholder="Nieuwe tekstwaarde..."
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange([...actions, createVariableEffectAction()])}
        disabled={actions.length >= 4}
        className="mt-3 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-black text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
      >
        + Variable effect
      </button>
    </div>
  );
}

function SidebarButton({
  icon,
  label,
  className,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  className: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`group flex h-14 w-14 items-center justify-center rounded-2xl font-black shadow-sm transition hover:scale-[1.06] active:scale-[0.96] ${className}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center transition group-hover:scale-110">
        {icon}
      </span>
      <span className="sr-only">{label}</span>
    </button>
  );
}

function BookIcon({ sparkle = false }: { sparkle?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7 fill-none stroke-current stroke-[2.4]"
      aria-hidden="true"
    >
      <path d="M5 4h10a4 4 0 0 1 4 4v12H8a3 3 0 0 0-3 3V4Z" />
      <path d="M8 4v15" />
      <path d="M10 8h5" />
      <path d="M10 12h4" />
      {sparkle && (
        <path d="M16 3.5l.9 1.9 2.1.3-1.5 1.5.4 2.1-1.9-1-1.9 1 .4-2.1L13 5.7l2.1-.3.9-1.9Z" />
      )}
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7 fill-none stroke-current stroke-[2.4]"
      aria-hidden="true"
    >
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="M16 10l5-3v10l-5-3v-4Z" />
      <path d="M8 10l4 2-4 2v-4Z" />
    </svg>
  );
}

function JoystickIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7 fill-none stroke-current stroke-[2.4]"
      aria-hidden="true"
    >
      <path d="M7 10h10a5 5 0 0 1 4.7 6.7l-.6 1.7a2.2 2.2 0 0 1-3.8.6L15.5 17h-7L6.7 19a2.2 2.2 0 0 1-3.8-.6l-.6-1.7A5 5 0 0 1 7 10Z" />
      <path d="M8 13v4" />
      <path d="M6 15h4" />
      <circle cx="16.5" cy="14" r="0.7" />
      <circle cx="18.5" cy="16" r="0.7" />
    </svg>
  );
}

function FunctionIcon() {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/20 text-sm font-black tracking-tight">
      Fx
    </div>
  );
}

function ConditionIcon() {
  return (
    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/20 text-[12px] font-black tracking-tight">
      IF
    </div>
  );
}

function FlagVariablesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7 fill-none stroke-current stroke-[2.4]"
      aria-hidden="true"
    >
      <path d="M6 21V4" />
      <path d="M6 5h10l-2 4 2 4H6" />
      <circle cx="6" cy="4" r="1" />
    </svg>
  );
}

function ScratchpadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-7 w-7 fill-none stroke-current stroke-[2.4]"
      aria-hidden="true"
    >
      <path d="M6 4h9l3 3v13H6V4Z" />
      <path d="M15 4v4h4" />
      <path d="M9 11h6" />
      <path d="M9 15h5" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current stroke-[2.4]" aria-hidden="true">
      <path d="M5 4h12l2 2v14H5V4Z" />
      <path d="M8 4v6h8V4" />
      <path d="M8 20v-6h8v6" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current stroke-[2.4]" aria-hidden="true">
      <path d="M3 7h7l2 2h9v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M3 7V5a2 2 0 0 1 2-2h4l2 2h5a2 2 0 0 1 2 2" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 fill-current" aria-hidden="true">
      <path d="M8 5v14l11-7-11-7Z" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7 fill-none stroke-current stroke-[2.4]" aria-hidden="true">
      <path d="M6 3h9l3 3v15H6V3Z" />
      <path d="M14 3v4h4" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 fill-none stroke-current stroke-[2.6]" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.8 9.2a2.5 2.5 0 0 1 4.7 1.2c0 1.9-2.5 2.2-2.5 4" />
      <path d="M12 18h.01" />
    </svg>
  );
}

function MoonIcon({ darkMode }: { darkMode: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={darkMode ? "h-8 w-8 fill-current stroke-current stroke-[2.2]" : "h-8 w-8 fill-none stroke-current stroke-[2.4]"}
      aria-hidden="true"
    >
      {darkMode ? (
        <>
          <circle cx="12" cy="12" r="7" />
          <path d="M12 2v2.2M12 19.8V22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2 12h2.2M19.8 12H22M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6" />
        </>
      ) : (
        <path d="M20.2 15.3A8.1 8.1 0 0 1 8.7 3.8 8.7 8.7 0 1 0 20.2 15.3Z" />
      )}
    </svg>
  );
}

function ResetEditorIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-8 w-8 fill-none stroke-current stroke-[2.5]" aria-hidden="true">
      <path d="M4 7v5h5" />
      <path d="M5.5 11A7 7 0 1 0 7 5.8L4 7" />
      <path d="M9 9l6 6M15 9l-6 6" />
    </svg>
  );
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

      {data.type !== "scratchpad" && (
        <>
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
        </>
      )}

      <div
        style={{
          color: nodeColors[data.type],
          WebkitTextStroke: data.type === "scratchpad" ? "3px #111827" : undefined,
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


async function resolveProjectCutsceneUrls(projectData: any) {
  if (!projectData?.nodes || !Array.isArray(projectData.nodes)) return projectData;

  const resolvedNodes = await Promise.all(
    projectData.nodes.map(async (node: Node<DiNodeData>) => {
      const storagePath = node?.data?.videoStoragePath;
      if (!storagePath) return node;

      const signedUrl = await resolveDiBooksMediaUrl(storagePath, node.data.videoUrl ?? "");
      if (!signedUrl) return node;

      return {
        ...node,
        data: {
          ...node.data,
          videoUrl: signedUrl,
        },
      };
    }),
  );

  return {
    ...projectData,
    nodes: resolvedNodes,
  };
}

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

  if (node.data.type === "function") {
    return true;
  }

  if (node.data.type === "condition") {
    return (
      !!(node.data.conditionVariableId || node.data.conditionKey) &&
      !!node.data.conditionOperator &&
      !!node.data.conditionTrueTargetNodeId &&
      !!node.data.conditionFalseTargetNodeId
    );
  }

  if (node.data.type === "scratchpad") {
    return true;
  }

  return false;
}

type RichTextEditorModalProps = {
  title: string;
  initialHtml: string;
  allowManualPageBreak?: boolean;
  onSave: (html: string, plainText: string) => void;
  onClose: () => void;
};

function RichTextEditorModal({
  title,
  initialHtml,
  allowManualPageBreak = false,
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
                onSave(editor.getHTML(), removeManualPageBreakMarkers(editor.getText()));
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

          {allowManualPageBreak && (
            <button
              onClick={() =>
                editor
                  .chain()
                  .focus()
                  .insertContent(`<p><code>${MANUAL_PAGE_BREAK_MARKER}</code></p>`)
                  .run()
              }
              className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-black hover:bg-indigo-600"
              title="Zet vanaf hier de volgende tekst op een nieuwe pagina"
            >
              Nieuwe pagina
            </button>
          )}

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

  const normalizedHtml = normalizeManualPageBreakMarkers(html || "");
  const manualBreakSegments = normalizedHtml.split(MANUAL_PAGE_BREAK_MARKER);
  if (manualBreakSegments.length > 1) {
    const manualPages: string[] = [];

    manualBreakSegments.forEach((segment) => {
      const cleanedSegment = removeManualPageBreakMarkers(segment);
      if (!stripHtml(cleanedSegment)) return;
      manualPages.push(...paginateHtml(cleanedSegment, maxCharacters));
    });

    return manualPages.length > 0 ? manualPages : ["<p>Deze tekst is nog leeg.</p>"];
  }

  html = removeManualPageBreakMarkers(html || "");
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
      if (child.nodeType === window.Node.TEXT_NODE) {
        const text = child.textContent?.trim();

        if (text) {
          const paragraph = document.createElement("p");
          paragraph.textContent = text;
          blocks.push(paragraph);
        }

        return;
      }

      if (child.nodeType !== window.Node.ELEMENT_NODE) return;

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


type DashboardBookStatus = "Concept" | "Testversie" | "Binnenkort";

type DashboardSaveForm = {
  title: string;
  author: string;
  subtitle: string;
  description: string;
  genres: string[];
  genreInput: string;
  primaryGenre: string;
  status: DashboardBookStatus;
  ageRating: string;
  readTime: string;
  colorTheme: string;
  accessType: "free" | "premium";
  seriesId: string;
  seriesOrder: string;
};

const DASHBOARD_BOOKS_STORAGE_KEY = "dibooks-dashboard-books-v1";

const dashboardAgeRatings = ["AL", "6+", "9+", "12+", "16+", "18+"];
const dashboardSuggestedGenres = [
  "Sci-fi",
  "Fantasy",
  "Mystery",
  "Thriller",
  "Romance",
  "Horror",
  "Avontuur",
  "Dystopie",
  "Interactief",
  "Keuzeverhaal",
  "Dossier",
  "Medieval",
];

const dashboardColorThemes: Record<
  string,
  { label: string; coverClass: string; accentClass: string; coverImage: string; bannerImage: string }
> = {
  blue: {
    label: "Blauw / sci-fi",
    coverClass: "from-blue-950 via-slate-950 to-purple-950",
    accentClass: "border-blue-500/60",
    coverImage: "",
    bannerImage: "",
  },
  gold: {
    label: "Goud / dossier",
    coverClass: "from-yellow-950 via-neutral-950 to-stone-900",
    accentClass: "border-yellow-400/40",
    coverImage: "",
    bannerImage: "",
  },
  red: {
    label: "Rood / fantasy",
    coverClass: "from-red-950 via-stone-950 to-yellow-950",
    accentClass: "border-red-400/40",
    coverImage: "",
    bannerImage: "",
  },
  green: {
    label: "Groen / mystery",
    coverClass: "from-cyan-950 via-neutral-950 to-emerald-950",
    accentClass: "border-cyan-400/40",
    coverImage: "",
    bannerImage: "",
  },
  orange: {
    label: "Oranje / thriller",
    coverClass: "from-orange-950 via-stone-950 to-red-950",
    accentClass: "border-orange-400/40",
    coverImage: "",
    bannerImage: "",
  },
};

const defaultDashboardSaveForm: DashboardSaveForm = {
  title: "",
  author: "",
  subtitle: "",
  description: "",
  genres: ["Interactief"],
  genreInput: "",
  primaryGenre: "Interactief",
  status: "Concept",
  ageRating: "12+",
  readTime: "Concept",
  colorTheme: "blue",
  accessType: "free",
  seriesId: "",
  seriesOrder: "1",
};

function slugifyDashboardBook(value: string) {
  return (
    value
      .normalize("NFD")
      .toLowerCase()
      .trim()
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `boek-${Date.now()}`
  );
}

function formatSaveError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const maybeError = error as { message?: string; details?: string; hint?: string; code?: string };
    return [maybeError.message, maybeError.details, maybeError.hint, maybeError.code ? `code: ${maybeError.code}` : ""]
      .filter(Boolean)
      .join("\n");
  }
  return "Onbekende fout.";
}

function SaveToDashboardModal({
  form,
  setForm,
  existingBookId,
  isLoggedIn,
  series,
  onOpenSeries,
  onClose,
  onSaveDashboard,
  onDownloadProject,
  onDownloadReaderStory,
}: {
  form: DashboardSaveForm;
  setForm: React.Dispatch<React.SetStateAction<DashboardSaveForm>>;
  existingBookId: string | null;
  isLoggedIn: boolean;
  series: BookSeries[];
  onOpenSeries: () => void;
  onClose: () => void;
  onSaveDashboard: () => void;
  onDownloadProject: () => void;
  onDownloadReaderStory: () => void;
}) {
  function updateField<K extends keyof DashboardSaveForm>(key: K, value: DashboardSaveForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function addGenre(genre: string) {
    const cleanGenre = genre.trim();
    if (!cleanGenre) return;

    setForm((current) => {
      if (current.genres.includes(cleanGenre)) return { ...current, genreInput: "" };
      const nextGenres = [...current.genres, cleanGenre];
      return {
        ...current,
        genres: nextGenres,
        primaryGenre: current.primaryGenre || cleanGenre,
        genreInput: "",
      };
    });
  }

  function removeGenre(genre: string) {
    setForm((current) => {
      const nextGenres = current.genres.filter((item) => item !== genre);
      return {
        ...current,
        genres: nextGenres,
        primaryGenre: current.primaryGenre === genre ? nextGenres[0] ?? "" : current.primaryGenre,
      };
    });
  }

  if (existingBookId) {
    return (
      <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:p-6">
        <div className="mx-auto max-w-3xl rounded-3xl border border-white/10 bg-[#080b13] p-5 text-white shadow-2xl sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <p className="text-sm font-black uppercase tracking-[0.32em] text-cyan-300">Bestaand dashboardconcept</p>
              <h2 className="mt-2 text-3xl font-black sm:text-5xl">Concept bijwerken</h2>
              <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-neutral-400">
                Je werkt al aan <strong>{form.title || "dit boek"}</strong>. Daarom hoef je de boekgegevens niet opnieuw in te vullen.
                Deze actie overschrijft alleen je huidige nodes, teksten, paden, keuzes, cutscenes en minigames.
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-500"
            >
              Sluiten
            </button>
          </div>

          {!isLoggedIn && (
            <div className="mt-6 rounded-2xl border border-yellow-400/30 bg-yellow-500/10 p-4 text-sm font-semibold leading-6 text-yellow-100">
              <strong>Niet ingelogd:</strong> je kunt dit concept pas bijwerken wanneer je bent ingelogd. Download eventueel eerst een backup.
            </div>
          )}

          <div className="mt-6 grid gap-3 lg:grid-cols-4">
            <button
              onClick={onSaveDashboard}
              disabled={!isLoggedIn}
              className="rounded-2xl bg-white px-5 py-4 text-sm font-black text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
            >
              Concept bijwerken
            </button>
            <button
              onClick={onDownloadProject}
              className="rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-5 py-4 text-sm font-black text-cyan-100 hover:bg-cyan-500/20"
            >
              Download backup
            </button>
            <button
              onClick={onDownloadReaderStory}
              className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-5 py-4 text-sm font-black text-emerald-100 hover:bg-emerald-500/20"
            >
              Export reader story
            </button>
            <button
              onClick={() => { window.location.href = "/dashboard"; }}
              className="rounded-2xl border border-white/15 bg-white/5 px-5 py-4 text-sm font-black text-white hover:bg-white/10"
            >
              Naar Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:p-6">
      <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-[#080b13] p-5 text-white shadow-2xl sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.32em] text-cyan-300">Save menu</p>
            <h2 className="mt-2 text-3xl font-black sm:text-5xl">
              Opslaan & exporteren
            </h2>
            <p className="mt-3 max-w-2xl text-sm font-semibold leading-6 text-neutral-400">
              Kies bewust wat je wilt bewaren: een werkbestand voor de editor, een reader-versie voor publicatie, of een dashboard-concept wanneer je bent ingelogd.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-500"
          >
            Sluiten
          </button>
        </div>

        {!isLoggedIn && (
          <div className="mt-6 rounded-2xl border border-yellow-400/30 bg-yellow-500/10 p-4 text-sm font-semibold leading-6 text-yellow-100">
            <strong>Niet ingelogd:</strong> opslaan in Dashboard is uitgeschakeld. Download je werkbestand lokaal en bewaar het veilig op je eigen computer.
          </div>
        )}

        <div className={`mt-6 grid gap-5 lg:grid-cols-2 ${!isLoggedIn ? "opacity-45" : ""}`}>
          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Titel</label>
              <input
                value={form.title}
                onChange={(event) => updateField("title", event.target.value)}
                placeholder="Bijv. De laatste reis"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-cyan-400"
              />
            </div>

            <div className="rounded-2xl border border-purple-400/20 bg-purple-500/[0.07] p-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-0 flex-1">
                  <span className="mb-2 block text-sm font-black text-neutral-300">Serie</span>
                  <select
                    value={form.seriesId}
                    onChange={(event) => {
                      updateField("seriesId", event.target.value);
                      if (event.target.value && !form.seriesOrder) updateField("seriesOrder", "1");
                    }}
                    className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-purple-400"
                  >
                    <option value="">Geen serie / losstaand boek</option>
                    {series.map((item) => (
                      <option key={item.id} value={item.id}>{item.title}</option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={onOpenSeries}
                  disabled={!isLoggedIn}
                  className="rounded-2xl border border-purple-400/30 bg-purple-500/10 px-4 py-3 text-sm font-black text-purple-100 hover:bg-purple-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  + Nieuwe serie
                </button>
              </div>
              <label className="mt-3 block">
                <span className="mb-2 block text-sm font-black text-neutral-300">Deel in serie</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.seriesOrder}
                  disabled={!form.seriesId}
                  onChange={(event) => updateField("seriesOrder", event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-purple-400 disabled:cursor-not-allowed disabled:opacity-40"
                />
                <p className="mt-2 text-xs font-semibold text-neutral-500">
                  Bijvoorbeeld: serie <strong>De Sterrenkronieken</strong>, boek <strong>De laatste reis</strong>, deel <strong>1</strong>.
                </p>
              </label>
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Auteur</label>
              <input
                value={form.author}
                onChange={(event) => updateField("author", event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Korte ondertitel</label>
              <input
                value={form.subtitle}
                onChange={(event) => updateField("subtitle", event.target.value)}
                placeholder="Een zin die op de boekkaart komt."
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Beschrijving</label>
              <textarea
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
                placeholder="Korte omschrijving voor de boekpagina."
                className="h-32 w-full resize-none rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold leading-6 text-white outline-none focus:border-cyan-400"
              />
            </div>
          </div>

          <div className="grid gap-4">
            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Genre labels</label>
              <div className="flex gap-2">
                <input
                  value={form.genreInput}
                  onChange={(event) => updateField("genreInput", event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addGenre(form.genreInput);
                    }
                  }}
                  placeholder="Bijv. Sci-fi"
                  className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-cyan-400"
                />
                <button
                  onClick={() => addGenre(form.genreInput)}
                  className="rounded-2xl bg-cyan-600 px-4 py-3 text-sm font-black text-white hover:bg-cyan-500"
                >
                  Voeg toe
                </button>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {form.genres.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => removeGenre(genre)}
                    className="rounded-full bg-white/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-white hover:bg-red-600"
                    title="Klik om te verwijderen"
                  >
                    {genre} ×
                  </button>
                ))}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {dashboardSuggestedGenres.map((genre) => (
                  <button
                    key={genre}
                    onClick={() => addGenre(genre)}
                    className="rounded-full border border-white/10 px-3 py-1 text-xs font-black uppercase tracking-widest text-neutral-300 hover:bg-white/10"
                  >
                    + {genre}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Hoofdgenre</label>
              <select
                value={form.primaryGenre}
                onChange={(event) => updateField("primaryGenre", event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-cyan-400"
              >
                {form.genres.length === 0 && <option value="">Voeg eerst genre labels toe</option>}
                {form.genres.map((genre) => (
                  <option key={genre} value={genre}>{genre}</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-2 block text-sm font-black text-neutral-300">Leeftijd</label>
                <select
                  value={form.ageRating}
                  onChange={(event) => updateField("ageRating", event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-cyan-400"
                >
                  {dashboardAgeRatings.map((rating) => (
                    <option key={rating} value={rating}>{rating}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-black text-neutral-300">Status</label>
                <select
                  value={form.status}
                  onChange={(event) => updateField("status", event.target.value as DashboardBookStatus)}
                  className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-cyan-400"
                >
                  <option value="Concept">Concept</option>
                  <option value="Testversie">Testversie</option>
                  <option value="Binnenkort">Binnenkort</option>
                </select>
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Toegang</label>
              <select
                value={form.accessType}
                onChange={(event) => updateField("accessType", event.target.value as "free" | "premium")}
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-cyan-400"
              >
                <option value="free">Gratis leesbaar</option>
                <option value="premium">Premium / abonnement</option>
              </select>
              <p className="mt-2 text-xs font-semibold leading-5 text-neutral-500">Concept is alleen voor jou. Binnenkort verschijnt als aankondiging. Premium-lezen koppelen we aan Reader Plus/Author Pro.</p>
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Leestijd</label>
              <input
                value={form.readTime}
                onChange={(event) => updateField("readTime", event.target.value)}
                placeholder="Bijv. ± 30 min testversie"
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-cyan-400"
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-black text-neutral-300">Coverstijl</label>
              <select
                value={form.colorTheme}
                onChange={(event) => updateField("colorTheme", event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-cyan-400"
              >
                {Object.entries(dashboardColorThemes).map(([value, theme]) => (
                  <option key={value} value={value}>{theme.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 lg:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 text-sm font-black uppercase tracking-widest text-cyan-300">1. Werkbestand</div>
            <p className="text-sm font-semibold leading-6 text-neutral-400">
              Download een <strong>.dibooks-project.json</strong>. Dit is je bewerkbare bestand voor later in de Auteur Studio.
            </p>
            <button
              onClick={onDownloadProject}
              className="mt-4 w-full rounded-2xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-3 text-sm font-black text-cyan-100 hover:bg-cyan-500/20"
            >
              Download werkbestand
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 text-sm font-black uppercase tracking-widest text-emerald-300">2. Reader-versie</div>
            <p className="text-sm font-semibold leading-6 text-neutral-400">
              Download een schone <strong>story.json</strong>. Dit is het bestand dat de Reader gebruikt voor publicatie.
            </p>
            <button
              onClick={onDownloadReaderStory}
              className="mt-4 w-full rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm font-black text-emerald-100 hover:bg-emerald-500/20"
            >
              Export reader story
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 text-sm font-black uppercase tracking-widest text-yellow-300">3. Dashboard</div>
            <p className="text-sm font-semibold leading-6 text-neutral-400">
              Bewaar metadata, nodes en paths als dashboard-concept. Publiceren blijft een aparte vergrendelde stap.
            </p>
            <button
              onClick={onSaveDashboard}
              disabled={!isLoggedIn}
              className="mt-4 w-full rounded-2xl bg-white px-4 py-3 text-sm font-black text-black hover:bg-neutral-200 disabled:cursor-not-allowed disabled:bg-neutral-700 disabled:text-neutral-400"
            >
              {!isLoggedIn ? "Login nodig" : existingBookId ? "Bijwerken in dashboard" : "Opslaan in dashboard"}
            </button>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border border-cyan-500/25 bg-cyan-500/10 p-4 text-sm leading-6 text-cyan-100">
          <strong>Belangrijk:</strong> publiceren naar de Library doe je vanuit het Dashboard. Zodra een boek live staat, is het vergrendeld totdat je het uit de Library haalt.
        </div>

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            onClick={onClose}
            className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white hover:bg-white/10"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [nodes, setNodes, onNodesChange] =
    useNodesState<Node<DiNodeData>>(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(true);
  const [editorDarkMode, setEditorDarkMode] = useState(false);
  const { isLoggedIn, permissions, loginWithCredentials, registerWithCredentials, logout, user, role } = useDemoAuth();
  const [authModalMode, setAuthModalMode] = useState<"login" | "register" | null>(null);
  const [saveDashboardOpen, setSaveDashboardOpen] = useState(false);
  const [dashboardSeries, setDashboardSeries] = useState<BookSeries[]>([]);
  const [seriesManagerOpen, setSeriesManagerOpen] = useState(false);
  const [dashboardBookId, setDashboardBookId] = useState<string | null>(null);
  const [sharedEditBookId, setSharedEditBookId] = useState<string | null>(null);
  const [sharedEditOwnerName, setSharedEditOwnerName] = useState<string>("");
  const [sharedEditPermission, setSharedEditPermission] = useState<string>("");
  const [dashboardSaveForm, setDashboardSaveForm] = useState<DashboardSaveForm>(defaultDashboardSaveForm);
  const [startNodeId, setStartNodeId] = useState<string>("node_1");
  const [editingTextNodeId, setEditingTextNodeId] = useState<string | null>(
    null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewPageCount, setPreviewPageCount] = useState(1);
  const [readerVisiblePageCount, setReaderVisiblePageCount] = useState(1);
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const [flowViewport, setFlowViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const nodeTypes = useMemo(() => ({ bullet: BulletNode }), []);
  const maxNodesForCurrentUser = getMaxNodesForUser(user);
  const runtimeNodeCount = getStoryNodes(nodes).length;
  const functionNodeCount = nodes.filter((node) => node.data.type === "function").length;
  const conditionNodeCount = nodes.filter((node) => node.data.type === "condition").length;
  const storyNodeCount = runtimeNodeCount - functionNodeCount - conditionNodeCount;
  const scratchpadNodeCount = nodes.length - runtimeNodeCount;
  const nodeLimitReached = maxNodesForCurrentUser !== null && storyNodeCount >= maxNodesForCurrentUser;
  const autosaveReadyRef = useRef(false);
  const lastAutosavePayloadRef = useRef<string>("");
  const [autosaveStatus, setAutosaveStatus] = useState("Sessiesave wordt geladen...");
  const [cutsceneUploadStatus, setCutsceneUploadStatus] = useState("");
  const [storyVariables, setStoryVariables] = useState<StoryVariable[]>([]);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [previewVariableValues, setPreviewVariableValues] = useState<Record<string, StoryVariableValue>>({});

  useEffect(() => {
    const savedMode = window.localStorage.getItem("dibooks-editor-dark-grid");
    if (savedMode === "true") setEditorDarkMode(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("dibooks-editor-dark-grid", String(editorDarkMode));
  }, [editorDarkMode]);

  useEffect(() => {
    if (!user?.name) return;

    setDashboardSaveForm((current) =>
      current.author.trim()
        ? current
        : {
            ...current,
            author: user.name,
          },
    );
  }, [user?.name]);

  useEffect(() => {
    let cancelled = false;

    async function loadSeries() {
      if (!user) {
        setDashboardSeries([]);
        return;
      }

      try {
        const series = await fetchBookSeriesFromSupabase(user);
        if (!cancelled) setDashboardSeries(series);
      } catch (error) {
        console.warn("Kon series niet laden in de editor.", error);
      }
    }

    void loadSeries();
    return () => {
      cancelled = true;
    };
  }, [user]);


  useEffect(() => {
    let cancelled = false;

    async function openDashboardBook() {
      const params = new URLSearchParams(window.location.search);
      const sharedBookId = params.get("shared");
      const bookId = params.get("book");

      if (!bookId && !sharedBookId) {
        restoreEditorAutosaveDraftIfNeeded();
        autosaveReadyRef.current = true;
        setAutosaveStatus((current) => current === "Sessiesave wordt geladen..." ? "Sessiesave actief" : current);
        return;
      }

      if (!user) {
        restoreEditorAutosaveDraftIfNeeded();
        autosaveReadyRef.current = true;
        return;
      }

      try {
        const dashboardBook = sharedBookId
          ? await fetchSharedBookForEditor(user, sharedBookId)
          : await fetchDashboardBookFromSupabase(bookId as string);
        if (cancelled || !dashboardBook) return;

        if (sharedBookId) {
          const sharedDashboardBook = dashboardBook as Awaited<ReturnType<typeof fetchSharedBookForEditor>>;

          if (!sharedDashboardBook || sharedDashboardBook.permission !== "edit") {
            alert("Je hebt alleen lees-/feedbacktoegang. Vraag de eigenaar om bewerkrechten.");
            return;
          }
          setDashboardBookId(null);
          setSharedEditBookId(sharedDashboardBook.id);
          setSharedEditOwnerName(sharedDashboardBook.ownerName ?? "de eigenaar");
          setSharedEditPermission(sharedDashboardBook.permission ?? "edit");
        } else {
          if (!canAccessOwnedResource(user, (dashboardBook as any).ownerId)) {
            alert("Je kunt dit dashboardboek niet openen, omdat het niet van jouw account is.");
            return;
          }
          setSharedEditBookId(null);
          setSharedEditOwnerName("");
          setSharedEditPermission("");
          setDashboardBookId(dashboardBook.id);
        }

        setDashboardSaveForm({
          title: dashboardBook.title ?? "",
          author: dashboardBook.author ?? user.name ?? "",
          subtitle: dashboardBook.subtitle ?? "",
          description: "description" in dashboardBook ? (dashboardBook.description ?? "") : "",
          genres: Array.isArray(dashboardBook.genres) && dashboardBook.genres.length > 0 ? dashboardBook.genres : ["Interactief"],
          genreInput: "",
          primaryGenre: dashboardBook.primaryGenre ?? dashboardBook.genres?.[0] ?? "Interactief",
          status: (dashboardBook.status as any) ?? "Concept",
          ageRating: dashboardBook.ageRating ?? "12+",
          readTime: dashboardBook.readTime ?? "Concept",
          colorTheme: (dashboardBook as any).colorTheme ?? "blue",
          accessType: dashboardBook.accessType ?? "free",
          seriesId: (dashboardBook as any).seriesId ?? "",
          seriesOrder: (dashboardBook as any).seriesOrder ? String((dashboardBook as any).seriesOrder) : "1",
        });

        const projectData = await resolveProjectCutsceneUrls(dashboardBook.projectData);
        if (projectData?.type === "dibooks-project") {
          const projectNodes = projectData.nodes ?? [];
          const safeStartNodeId = getSafeStartNodeId(projectNodes, projectData.startNodeId ?? projectNodes?.[0]?.id ?? "");
          setNodes(projectNodes);
          setEdges(projectData.edges ?? []);
          setStartNodeId(safeStartNodeId);
          setSelectedNodeId((safeStartNodeId || projectNodes?.[0]?.id) ?? null);
          setStoryVariables(Array.isArray(projectData.variables) ? projectData.variables : []);
        }

        restoreEditorAutosaveDraftIfNeeded();
        autosaveReadyRef.current = true;
        setAutosaveStatus((current) => current === "Sessiesave wordt geladen..." ? "Sessiesave actief" : current);
      } catch (error) {
        console.error("Kon boek niet openen in de editor", error);
        alert(error instanceof Error ? `Kon boek niet openen: ${error.message}` : "Kon boek niet openen.");
        restoreEditorAutosaveDraftIfNeeded();
        autosaveReadyRef.current = true;
      }
    }

    void openDashboardBook();

    return () => {
      cancelled = true;
    };
  }, [setEdges, setNodes, user]);

  useEffect(() => {
    if (!autosaveReadyRef.current) return;

    const timeout = window.setTimeout(() => {
      writeEditorAutosaveDraft();
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [nodes, edges, startNodeId, selectedNodeId, dashboardSaveForm, dashboardBookId, sharedEditBookId, sharedEditOwnerName, sharedEditPermission, flowViewport, storyVariables]);

  useEffect(() => {
    function saveBeforeLeaving() {
      if (autosaveReadyRef.current) writeEditorAutosaveDraft();
    }

    function saveWhenHidden() {
      if (document.visibilityState === "hidden") saveBeforeLeaving();
    }

    window.addEventListener("beforeunload", saveBeforeLeaving);
    window.addEventListener("pagehide", saveBeforeLeaving);
    document.addEventListener("visibilitychange", saveWhenHidden);

    return () => {
      window.removeEventListener("beforeunload", saveBeforeLeaving);
      window.removeEventListener("pagehide", saveBeforeLeaving);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [nodes, edges, startNodeId, selectedNodeId, dashboardSaveForm, dashboardBookId, sharedEditBookId, sharedEditOwnerName, sharedEditPermission, flowViewport, storyVariables]);

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

  const previewPaths = previewNode && !isScratchpadNode(previewNode)
    ? getStoryEdges(edges, nodes).filter((edge) => edge.source === previewNode.id)
    : [];

  const textChainBranchPaths =
    previewNode?.data.type === "text" || previewNode?.data.type === "special"
      ? getStoryEdges(edges, nodes).filter((edge) => {
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

  const selectedNodePaths = selectedNode && !isScratchpadNode(selectedNode)
    ? getStoryEdges(edges, nodes).filter((edge) => edge.source === selectedNode.id)
    : [];

  const availableTargetNodes = selectedNode && !isScratchpadNode(selectedNode)
    ? [...nodes.filter((node) => node.id !== selectedNode.id && !isScratchpadNode(node))].sort((a, b) => {
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
    const storyNodeIds = getStoryNodeIds(currentNodes);
    return currentEdges
      .filter((edge) => storyNodeIds.has(edge.source) && storyNodeIds.has(edge.target))
      .map((edge) => {
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

      const outgoingPaths = getStoryEdges(edges, nodes).filter(
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

  function getCurrentProjectData() {
    return {
      version: 1,
      type: "dibooks-project",
      bookTitle: dashboardSaveForm.title.trim() || "Nieuw DiBooks verhaal",
      startNodeId: getSafeStartNodeId(nodes, startNodeId),
      variables: storyVariables,
      nodes,
      edges,
      savedAt: new Date().toISOString(),
    };
  }

  function getEditorAutosaveKey() {
    if (typeof window === "undefined") return "dibooks-editor-session:v3:server:new";

    const params = new URLSearchParams(window.location.search);
    const sharedBookId = params.get("shared");
    const bookId = params.get("book");
    const scope = sharedBookId ? `shared:${sharedBookId}` : bookId ? `book:${bookId}` : "new";
    const userScope = user?.id || user?.email || "guest";

    return `dibooks-editor-session:v3:${userScope}:${scope}`;
  }

  function getEditorAutosavePayload() {
    return {
      version: 3,
      updatedAt: new Date().toISOString(),
      dashboardBookId,
      sharedEditBookId,
      sharedEditOwnerName,
      sharedEditPermission,
      selectedNodeId,
      startNodeId,
      flowViewport,
      dashboardSaveForm,
      projectData: getCurrentProjectData(),
    };
  }

  function applyEditorAutosaveDraft(draft: any) {
    const projectData = draft?.projectData;
    if (!projectData || projectData.type !== "dibooks-project") return false;

    const projectNodes = projectData.nodes ?? [];
    const safeStartNodeId = getSafeStartNodeId(projectNodes, projectData.startNodeId ?? projectNodes?.[0]?.id ?? "node_1");
    setNodes(projectNodes);
    setEdges(projectData.edges ?? []);
    setStartNodeId(safeStartNodeId);
    setSelectedNodeId(draft.selectedNodeId ?? safeStartNodeId ?? projectNodes?.[0]?.id ?? null);
    setStoryVariables(Array.isArray(projectData.variables) ? projectData.variables : []);
    setDashboardSaveForm((current) => ({
      ...current,
      ...(draft.dashboardSaveForm ?? {}),
      genreInput: "",
    }));

    if (draft.dashboardBookId) setDashboardBookId(draft.dashboardBookId);
    if (draft.sharedEditBookId) setSharedEditBookId(draft.sharedEditBookId);
    if (draft.sharedEditOwnerName) setSharedEditOwnerName(draft.sharedEditOwnerName);
    if (draft.sharedEditPermission) setSharedEditPermission(draft.sharedEditPermission);
    if (draft.flowViewport) setFlowViewport(draft.flowViewport);

    return true;
  }

  function restoreEditorAutosaveDraftIfNeeded() {
    if (typeof window === "undefined") return false;

    const key = getEditorAutosaveKey();
    const rawDraft = window.sessionStorage.getItem(key);
    if (!rawDraft) return false;

    try {
      const draft = JSON.parse(rawDraft);
      const updatedAt = draft?.updatedAt ? new Date(draft.updatedAt) : null;
      const updatedLabel = updatedAt && !Number.isNaN(updatedAt.getTime())
        ? updatedAt.toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })
        : "onbekend moment";

      const restored = applyEditorAutosaveDraft(draft);
      if (restored) {
        lastAutosavePayloadRef.current = rawDraft;
        setAutosaveStatus(`Sessiesave hersteld • ${updatedLabel}`);
        return true;
      }
    } catch (error) {
      console.warn("Kon editor-sessiesave niet herstellen", error);
      window.sessionStorage.removeItem(key);
    }

    return false;
  }

  function writeEditorAutosaveDraft() {
    if (typeof window === "undefined") return;

    const payload = getEditorAutosavePayload();
    const serialized = JSON.stringify(payload);

    if (serialized === lastAutosavePayloadRef.current) return;

    window.sessionStorage.setItem(getEditorAutosaveKey(), serialized);
    lastAutosavePayloadRef.current = serialized;
    setAutosaveStatus(`Sessiesave • ${new Date().toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}`);
  }

  function clearEditorAutosaveDraft() {
    if (typeof window === "undefined") return;

    window.sessionStorage.removeItem(getEditorAutosaveKey());
    lastAutosavePayloadRef.current = "";
    setAutosaveStatus("Opgeslagen • sessiesave schoon");
  }


  function resetEditorToBlankProject() {
    const confirmed = window.confirm(
      "Weet je zeker dat je de editor wilt resetten? Je huidige sessiesave wordt gewist en je krijgt weer een leeg startproject.",
    );

    if (!confirmed) return;

    if (typeof window !== "undefined") {
      window.sessionStorage.removeItem(getEditorAutosaveKey());
    }

    setNodes(initialNodes);
    setEdges([]);
    setStartNodeId("node_1");
    setSelectedNodeId("node_1");
    setDashboardBookId(null);
    setSharedEditBookId(null);
    setSharedEditOwnerName("");
    setSharedEditPermission("");
    setDashboardSaveForm(defaultDashboardSaveForm);
    setStoryVariables([]);
    setEditingTextNodeId(null);
    setPreviewOpen(false);
    setPreviewNodeId(null);
    setFlowViewport({ x: 0, y: 0, zoom: 1 });
    lastAutosavePayloadRef.current = "";
    autosaveReadyRef.current = true;
    setAutosaveStatus("Nieuwe sessie gestart");
  }

  function downloadProjectFile() {
    const projectData = getCurrentProjectData();
    const json = JSON.stringify(projectData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const safeTitle = slugifyDashboardBook(dashboardSaveForm.title || "dibooks-project");
    const fileName = `${safeTitle}-${new Date()
      .toISOString()
      .slice(0, 10)}.dibooks-project.json`;

    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();

    URL.revokeObjectURL(url);
  }

  function saveProject() {
    setSaveDashboardOpen(true);
  }

  function handleDemoLogin() {
    setAuthModalMode("login");
  }

  function handleDemoLogout() {
    const confirmed = window.confirm(
      "Weet je zeker dat je wilt uitloggen? Vergeet niet eerst lokaal op te slaan of in je Dashboard op te slaan.",
    );

    if (!confirmed) return;

    logout();
  }

  async function saveCurrentBookToDashboard() {
    if (!user) {
      alert("Login nodig om op te slaan of een voorstel terug te sturen.");
      setAuthModalMode("login");
      return;
    }

    if (!sharedEditBookId && !permissions.canSaveToDashboard) {
      alert("Je moet ingelogd zijn als auteur om op te slaan in je Dashboard. Download je werkbestand lokaal of log eerst in.");
      setAuthModalMode("login");
      return;
    }

    const maxNodes = getMaxNodesForUser(user);
    if (!sharedEditBookId && maxNodes !== null && storyNodeCount > maxNodes) {
      alert(`Gratis accounts kunnen maximaal ${FREE_NODE_LIMIT} verhaalnodes opslaan in Dashboard. Kladblok-, functie- en voorwaarde-nodes tellen niet mee. Verwijder verhaalnodes of upgrade later naar Author Pro voor onbeperkt bouwen.`);
      return;
    }

    const projectData = getCurrentProjectData();

    if (sharedEditBookId) {
      const note = window.prompt("Korte notitie voor de eigenaar bij dit bewerkingsvoorstel:", "Ik heb een voorstel teruggestuurd.") ?? "";
      try {
        await submitBookRevision(user, sharedEditBookId, projectData, note);
        setSaveDashboardOpen(false);
        clearEditorAutosaveDraft();
        alert("Voorstel teruggestuurd naar de eigenaar. Het originele boek is niet overschreven.");
      } catch (error) {
        console.error(error);
        alert(`Voorstel versturen mislukt:
${formatSaveError(error)}`);
      }
      return;
    }

    // Bestaand dashboardconcept: alleen project_data overschrijven.
    // Metadata zoals titel, genres, cover/banner en status blijft intact.
    if (dashboardBookId) {
      try {
        await updateDashboardBookProjectInSupabase(user, dashboardBookId, projectData);
        setSaveDashboardOpen(false);
        clearEditorAutosaveDraft();
        alert("Concept bijgewerkt in je Dashboard.");
      } catch (error) {
        console.error(error);
        alert(`Opslaan in Supabase mislukt:
${formatSaveError(error)}`);
      }
      return;
    }

    const title = dashboardSaveForm.title.trim();
    if (!title) {
      alert("Geef je boek eerst een titel.");
      return;
    }

    if (dashboardSaveForm.genres.length === 0) {
      alert("Voeg minimaal één genre label toe.");
      return;
    }

    try {
      const theme = dashboardColorThemes[dashboardSaveForm.colorTheme] ?? dashboardColorThemes.blue;

      const savedBook = await saveDashboardBookToSupabase(user, {
        id: null,
        title,
        author: dashboardSaveForm.author.trim() || user.name || "Onbekende auteur",
        subtitle: dashboardSaveForm.subtitle.trim() || "Nieuw interactief boek in concept.",
        description: dashboardSaveForm.description.trim() || "Nog geen beschrijving ingevuld.",
        genres: dashboardSaveForm.genres,
        primaryGenre: dashboardSaveForm.primaryGenre || dashboardSaveForm.genres[0],
        status: dashboardSaveForm.status,
        ageRating: dashboardSaveForm.ageRating,
        readTime: dashboardSaveForm.readTime.trim() || "Concept",
        coverImage: "",
        bannerImage: "",
        coverClass: theme.coverClass,
        accentClass: theme.accentClass,
        colorTheme: dashboardSaveForm.colorTheme,
        accessType: dashboardSaveForm.accessType,
        seriesId: dashboardSaveForm.seriesId || null,
        seriesOrder: dashboardSaveForm.seriesId ? Math.max(1, Number.parseInt(dashboardSaveForm.seriesOrder || "1", 10) || 1) : null,
        published: false,
        featured: false,
        mostRead: false,
        projectData,
      });

      setDashboardBookId(savedBook.id);
      setSaveDashboardOpen(false);
      clearEditorAutosaveDraft();
      alert("Boek opgeslagen in Supabase Dashboard.");
    } catch (error) {
      console.error(error);
      alert(`Opslaan in Supabase mislukt:
${formatSaveError(error)}`);
    }
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

        const projectNodes = projectData.nodes ?? [];
        const safeStartNodeId = getSafeStartNodeId(projectNodes, projectData.startNodeId ?? "");
        setNodes(projectNodes);
        setEdges(projectData.edges ?? []);
        setStartNodeId(safeStartNodeId);
        setStoryVariables(Array.isArray(projectData.variables) ? projectData.variables : []);
        setDashboardBookId(null);
        setDashboardSaveForm((current) => ({
          ...current,
          title: projectData.bookTitle && projectData.bookTitle !== "Nieuw DiBooks verhaal" ? projectData.bookTitle : current.title,
        }));

        autosaveReadyRef.current = true;
        setAutosaveStatus("Project geladen • sessiesave actief");
        alert("Project geladen.");
      } catch (error) {
        console.error(error);
        alert("Er ging iets mis met het laden van dit projectbestand.");
      }
    };

    reader.readAsText(file);

    event.target.value = "";
  }

  function createInitialPreviewVariableValues() {
    return Object.fromEntries(
      storyVariables.map((variable) => [variable.id, variable.defaultValue]),
    ) as Record<string, StoryVariableValue>;
  }

  function getPreviewVariableValue(variableId?: string, variableKey?: string) {
    const variable =
      storyVariables.find((item) => item.id === variableId) ??
      storyVariables.find((item) => item.name === variableKey);

    if (!variable) return undefined;
    return previewVariableValues[variable.id] ?? variable.defaultValue;
  }

  function evaluatePreviewCondition(node: Node<DiNodeData>) {
    const variable =
      storyVariables.find((item) => item.id === node.data.conditionVariableId) ??
      storyVariables.find((item) => item.name === node.data.conditionKey);

    if (!variable) return false;

    const actualValue = previewVariableValues[variable.id] ?? variable.defaultValue;
    const operator = node.data.conditionOperator ?? getDefaultConditionOperatorForType(variable.type);
    const expectedValue = node.data.conditionValue ?? getDefaultConditionValueForType(variable.type);

    if (operator === "is_true") return actualValue === true;
    if (operator === "is_false") return actualValue === false;

    if (variable.type === "number") {
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

    const actual = String(actualValue ?? "");
    const expected = String(expectedValue ?? "");
    if (operator === "equals") return actual === expected;
    if (operator === "not_equals") return actual !== expected;
    if (operator === "contains") return actual.includes(expected);
    return false;
  }

  function executePreviewActions(actions: FunctionAction[] = []) {
    setPreviewVariableValues((current) => {
      const next = { ...current };

      for (const action of actions) {
        const variable =
          storyVariables.find((item) => item.id === action.variableId) ??
          storyVariables.find((item) => item.name === action.key);

        if (!variable) continue;

        const currentValue = next[variable.id] ?? variable.defaultValue;

        if (action.type === "set_flag") next[variable.id] = true;
        if (action.type === "clear_flag") next[variable.id] = false;
        if (action.type === "increment") next[variable.id] = Number(currentValue) + (action.amount ?? 1);
        if (action.type === "decrement") next[variable.id] = Number(currentValue) - (action.amount ?? 1);
        if (action.type === "set_number") next[variable.id] = action.amount ?? 0;
        if (action.type === "set_text") next[variable.id] = action.textValue ?? "";
      }

      return next;
    });
  }

  function executePreviewFunctionActions(node: Node<DiNodeData>) {
    executePreviewActions(node.data.functionActions ?? []);
  }

  function openPreview() {
    if (!startNodeId) {
      alert("Kies eerst een start-node.");
      return;
    }

    const startNode = nodes.find((node) => node.id === startNodeId);

    if (!startNode || isScratchpadNode(startNode)) {
      alert("Start-node niet gevonden of is een kladblok-node. Kies een verhaalnode als start.");
      return;
    }

    setPreviewVariableValues(createInitialPreviewVariableValues());
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
    setPreviewVariableValues({});
  }

  function goToPreviewNode(nodeId: string) {
    const targetNode = nodes.find((node) => node.id === nodeId);

    if (!targetNode || isScratchpadNode(targetNode)) {
      alert("Deze doel-node bestaat niet meer of is een kladblok-node.");
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
    const maxNodes = getMaxNodesForUser(user);
    const isUtilityNode = type === "scratchpad" || type === "function" || type === "condition";
    if (!isUtilityNode && maxNodes !== null && storyNodeCount >= maxNodes) {
      alert(`Gratis accounts en gasten kunnen maximaal ${FREE_NODE_LIMIT} verhaalnodes gebruiken. Kladblok-, functie- en voorwaarde-nodes tellen niet mee. Upgrade later naar Author Pro voor onbeperkt bouwen.`);
      return;
    }

    const id = `node_${Date.now()}`;
    const wrapperBounds = flowWrapperRef.current?.getBoundingClientRect();
    const centerScreenX = (wrapperBounds?.width ?? 900) / 2;
    const centerScreenY = (wrapperBounds?.height ?? 700) / 2;
    const viewportZoom = flowViewport.zoom || 1;

    // Zet nieuwe nodes in het midden van het huidige canvas-beeld.
    // Daardoor hoef je niet meer terug te zoeken naar de oude startpositie
    // wanneer je ver ingezoomd of ver in je verhaal bent.
    const staggerIndex = nodes.length % 5;
    const staggerX = (staggerIndex - 2) * 64;
    const staggerY = Math.floor((nodes.length % 10) / 5) * 64;
    const nextPosition = {
      x:
        Math.round(
          ((centerScreenX - flowViewport.x) / viewportZoom + staggerX) / 64,
        ) * 64,
      y:
        Math.round(
          ((centerScreenY - flowViewport.y) / viewportZoom + staggerY) / 64,
        ) * 64,
    };

    const newNode: Node<DiNodeData> = {
      id,
      type: "bullet",
      position: nextPosition,
      data: {
        label: nodeLabels[type],
        type,
        text: type === "text" || type === "special" || type === "scratchpad" ? "" : undefined,
        textHtml: type === "text" || type === "special" || type === "scratchpad" ? "" : undefined,
        specialSubtype: type === "special" ? "Logboek" : undefined,
        videoUrl: type === "cutscene" ? "" : undefined,
        videoStoragePath: type === "cutscene" ? "" : undefined,
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
        miniGameSuccessEffects: type === "minigame" ? [] : undefined,
        miniGameFailEffects: type === "minigame" ? [] : undefined,
        functionActions:
          type === "function"
            ? [{ id: `function_action_${Date.now()}`, type: "set_flag", key: "", variableId: "", amount: 1 }]
            : undefined,
        conditionVariableId: type === "condition" ? "" : undefined,
        conditionKey: type === "condition" ? "" : undefined,
        conditionOperator: type === "condition" ? "is_true" : undefined,
        conditionValue: type === "condition" ? true : undefined,
        conditionTrueTargetNodeId: type === "condition" ? "" : undefined,
        conditionFalseTargetNodeId: type === "condition" ? "" : undefined,
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
    updates: Pick<Partial<DiNodeData>, "videoUrl" | "videoStoragePath" | "videoFileName" | "videoDuration">,
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

    if (!selectedNodeId) {
      alert("Selecteer eerst de cutscene-node waarin je de video wilt plaatsen.");
      return;
    }

    if (!file.type.startsWith("video/")) {
      alert("Kies een videobestand, bijvoorbeeld .mp4, .webm of .mov.");
      return;
    }

    const maxFileSizeMb = 100;
    if (file.size > maxFileSizeMb * 1024 * 1024) {
      alert(`Deze video is groter dan ${maxFileSizeMb}MB. Comprimeer hem eerst of gebruik een kortere cutscene.`);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";

    video.onloadedmetadata = async () => {
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      URL.revokeObjectURL(objectUrl);

      if (duration > 12.25) {
        alert(
          `Deze cutscene is ${duration.toFixed(1)} seconden. Maak hem maximaal 12 seconden.`,
        );
        return;
      }

      if (!user?.id) {
        alert("Log eerst in om cutscene-video's veilig op te slaan in DiBooks Storage.");
        return;
      }

      try {
        setCutsceneUploadStatus("Video uploaden naar DiBooks Storage...");

        const upload = await uploadCutsceneVideoToStorage({
          userId: user.id,
          bookId: dashboardBookId || sharedEditBookId || "drafts",
          nodeId: selectedNodeId,
          file,
        });

        updateSelectedCutsceneData({
          videoUrl: upload.signedUrl,
          videoStoragePath: upload.storagePath,
          videoFileName: file.name,
          videoDuration: duration,
        });

        setCutsceneUploadStatus("Video opgeslagen in DiBooks Storage.");
      } catch (error: any) {
        console.error(error);
        setCutsceneUploadStatus("");
        alert(error?.message ? `Video uploaden mislukt: ${error.message}` : "Video uploaden mislukt.");
      }
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
      videoStoragePath: "",
      videoFileName: "",
      videoDuration: 0,
    });
  }


  function addPathFromSelectedNode(targetNodeId: string) {
    if (!selectedNodeId) return;
    if (!targetNodeId) return;
    if (selectedNodeId === targetNodeId) return;

    const sourceNode = nodes.find((node) => node.id === selectedNodeId);
    const targetNode = nodes.find((node) => node.id === targetNodeId);

    if (isScratchpadNode(sourceNode) || isScratchpadNode(targetNode)) {
      alert("Kladblok-nodes zijn alleen voor notities en kunnen niet met paths worden verbonden.");
      return;
    }

    const existingOutgoingEdges = edges.filter(
      (edge) => edge.source === selectedNodeId,
    );

    const maxOutgoingPaths = sourceNode?.data.type === "function" ? 1 : 10;

    if (existingOutgoingEdges.length >= maxOutgoingPaths) {
      alert(sourceNode?.data.type === "function" ? "Een functie-node gebruikt één vervolgpath. Verwijder eerst de bestaande path." : "Deze node heeft al het maximale aantal van 10 paths.");
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
      startNodeId === deletedNodeId ? getSafeStartNodeId(remainingNodes, remainingNodes[0]?.id ?? "") : startNodeId;

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

          if (node.data.type === "condition") {
            return {
              ...node,
              data: {
                ...node.data,
                conditionTrueTargetNodeId: node.data.conditionTrueTargetNodeId === deletedNodeId ? "" : node.data.conditionTrueTargetNodeId,
                conditionFalseTargetNodeId: node.data.conditionFalseTargetNodeId === deletedNodeId ? "" : node.data.conditionFalseTargetNodeId,
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
    updates: { label?: string; targetNodeId?: string; effects?: FunctionAction[] },
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


  function updateSelectedFunctionAction(actionId: string, updates: Partial<FunctionAction>) {
    if (!selectedNodeId) return;

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== selectedNodeId) return node;

        const nextActions = (node.data.functionActions ?? []).map((action) =>
          action.id === actionId ? { ...action, ...updates } : action,
        );

        return {
          ...node,
          data: {
            ...node.data,
            functionActions: nextActions,
          },
        };
      }),
    );
  }

  function addSelectedFunctionAction() {
    if (!selectedNodeId) return;

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== selectedNodeId) return node;

        const currentActions = node.data.functionActions ?? [];
        if (currentActions.length >= 8) return node;

        return {
          ...node,
          data: {
            ...node.data,
            functionActions: [
              ...currentActions,
              {
                id: `function_action_${Date.now()}`,
                type: "set_flag",
                key: "",
                variableId: "",
                amount: 1,
              },
            ],
          },
        };
      }),
    );
  }

  function deleteSelectedFunctionAction(actionId: string) {
    if (!selectedNodeId) return;

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== selectedNodeId) return node;

        return {
          ...node,
          data: {
            ...node.data,
            functionActions: (node.data.functionActions ?? []).filter((action) => action.id !== actionId),
          },
        };
      }),
    );
  }

  function updateSelectedConditionData(updates: Partial<DiNodeData>) {
    if (!selectedNodeId) return;

    setNodes((currentNodes) =>
      currentNodes.map((node) =>
        node.id === selectedNodeId
          ? { ...node, data: { ...node.data, ...updates } }
          : node,
      ),
    );
  }

  function updateSelectedConditionRoute(routeType: "true" | "false", targetNodeId: string) {
    if (!selectedNodeId) return;
    const dataKey = routeType === "true" ? "conditionTrueTargetNodeId" : "conditionFalseTargetNodeId";
    updateSelectedConditionData({ [dataKey]: targetNodeId } as Partial<DiNodeData>);

    setEdges((currentEdges) => {
      const filteredEdges = currentEdges.filter((edge) => {
        const conditionResult = (edge.data as { conditionResult?: string } | undefined)?.conditionResult;
        return !(edge.source === selectedNodeId && conditionResult === routeType);
      });
      if (!targetNodeId) return filteredEdges;
      const nextEdge: Edge = {
        id: `condition_${selectedNodeId}_${routeType}_${targetNodeId}_${Date.now()}`,
        source: selectedNodeId,
        target: targetNodeId,
        sourceHandle: "out",
        targetHandle: "in",
        label: routeType === "true" ? "TRUE" : "ELSE",
        data: { conditionResult: routeType },
        animated: false,
        style: { stroke: "#dc2626", strokeWidth: 5 },
      };
      return [...filteredEdges, nextEdge];
    });
  }

  function addStoryVariable() {
    const existingNames = new Set(storyVariables.map((variable) => variable.name));
    let index = storyVariables.length + 1;
    let name = `variabele_${index}`;

    while (existingNames.has(name)) {
      index += 1;
      name = `variabele_${index}`;
    }

    const newVariable: StoryVariable = {
      id: `variable_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      name,
      type: "boolean",
      defaultValue: false,
      description: "",
    };

    setStoryVariables((current) => [...current, newVariable]);
  }

  function updateStoryVariable(variableId: string, updates: Partial<StoryVariable>) {
    const previousVariable = storyVariables.find((variable) => variable.id === variableId);
    if (!previousVariable) return;

    const nextName =
      updates.name !== undefined
        ? normalizeStoryVariableName(updates.name)
        : previousVariable.name;
    const nextType = updates.type ?? previousVariable.type;

    if (
      storyVariables.some(
        (variable) => variable.id !== variableId && variable.name === nextName,
      )
    ) {
      alert(`Er bestaat al een variabele met de naam "${nextName}".`);
      return;
    }

    const nextUpdates: Partial<StoryVariable> = {
      ...updates,
      name: nextName,
    };

    setStoryVariables((current) =>
      current.map((variable) =>
        variable.id === variableId
          ? {
              ...variable,
              ...nextUpdates,
            }
          : variable,
      ),
    );

    function updateActionReferences(actions: FunctionAction[] | undefined) {
      return (actions ?? []).map((action) => {
        if (action.variableId !== variableId) return action;

        if (getRequiredVariableTypeForAction(action.type) !== nextType) {
          return { ...action, variableId: "", key: "" };
        }

        return { ...action, key: nextName };
      });
    }

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const nextData: DiNodeData = { ...node.data };

        if (node.data.type === "condition" && node.data.conditionVariableId === variableId) {
          nextData.conditionKey = nextName;
          nextData.conditionOperator =
            previousVariable.type === nextType
              ? node.data.conditionOperator
              : getDefaultConditionOperatorForType(nextType);
          nextData.conditionValue =
            previousVariable.type === nextType
              ? node.data.conditionValue
              : getDefaultConditionValueForType(nextType);
        }

        if (node.data.type === "function") {
          nextData.functionActions = updateActionReferences(node.data.functionActions);
        }

        if (node.data.type === "choice") {
          nextData.choices = (node.data.choices ?? []).map((choice) => ({
            ...choice,
            effects: updateActionReferences(choice.effects),
          }));
        }

        if (node.data.type === "minigame") {
          nextData.miniGameSuccessEffects = updateActionReferences(node.data.miniGameSuccessEffects);
          nextData.miniGameFailEffects = updateActionReferences(node.data.miniGameFailEffects);
        }

        return { ...node, data: nextData };
      }),
    );
  }

  function deleteStoryVariable(variableId: string) {
    const variable = storyVariables.find((item) => item.id === variableId);
    if (!variable) return;

    const actionReferencesVariable = (action: FunctionAction) =>
      action.variableId === variableId || (!action.variableId && action.key === variable.name);

    const referenceCount = nodes.reduce((total, node) => {
      const functionReferences = (node.data.functionActions ?? []).filter(actionReferencesVariable).length;
      const choiceReferences = (node.data.choices ?? []).reduce(
        (count, choice) => count + (choice.effects ?? []).filter(actionReferencesVariable).length,
        0,
      );
      const miniGameReferences =
        (node.data.miniGameSuccessEffects ?? []).filter(actionReferencesVariable).length +
        (node.data.miniGameFailEffects ?? []).filter(actionReferencesVariable).length;
      const conditionReference =
        node.data.type === "condition" &&
        (node.data.conditionVariableId === variableId ||
          (!node.data.conditionVariableId && node.data.conditionKey === variable.name))
          ? 1
          : 0;

      return total + functionReferences + choiceReferences + miniGameReferences + conditionReference;
    }, 0);

    const confirmed = window.confirm(
      referenceCount > 0
        ? `Variabele "${variable.name}" wordt op ${referenceCount} plek(ken) gebruikt. Verwijderen wist die koppelingen. Doorgaan?`
        : `Variabele "${variable.name}" verwijderen?`,
    );

    if (!confirmed) return;

    setStoryVariables((current) => current.filter((item) => item.id !== variableId));

    function clearActionReferences(actions: FunctionAction[] | undefined) {
      return (actions ?? []).map((action) =>
        actionReferencesVariable(action)
          ? { ...action, variableId: "", key: "" }
          : action,
      );
    }

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        const nextData: DiNodeData = { ...node.data };

        if (
          node.data.type === "condition" &&
          (node.data.conditionVariableId === variableId ||
            (!node.data.conditionVariableId && node.data.conditionKey === variable.name))
        ) {
          nextData.conditionVariableId = "";
          nextData.conditionKey = "";
        }

        if (node.data.type === "function") {
          nextData.functionActions = clearActionReferences(node.data.functionActions);
        }

        if (node.data.type === "choice") {
          nextData.choices = (node.data.choices ?? []).map((choice) => ({
            ...choice,
            effects: clearActionReferences(choice.effects),
          }));
        }

        if (node.data.type === "minigame") {
          nextData.miniGameSuccessEffects = clearActionReferences(node.data.miniGameSuccessEffects);
          nextData.miniGameFailEffects = clearActionReferences(node.data.miniGameFailEffects);
        }

        return { ...node, data: nextData };
      }),
    );
  }

  function getReaderStoryData() {
    const storyNodes = getStoryNodes(nodes);
    const storyNodeIds = new Set(storyNodes.map((node) => node.id));
    const storyEdges = edges.filter((edge) => storyNodeIds.has(edge.source) && storyNodeIds.has(edge.target));
    const safeStartNodeId = getSafeStartNodeId(storyNodes, startNodeId);

    return {
      bookTitle: dashboardSaveForm.title.trim() || "Nieuw DiBooks verhaal",
      startNodeId: safeStartNodeId,
      variables: storyVariables,
      nodes: storyNodes.map((node) => ({
        id: node.id,
        type: node.data.type,
        title: node.data.label,
        position: node.position,
        content: {
          text: node.data.text ?? "",
          textHtml: node.data.textHtml ?? node.data.text ?? "",
          videoUrl: node.data.videoUrl ?? "",
          videoStoragePath: node.data.videoStoragePath ?? "",
          videoFileName: node.data.videoFileName ?? "",
          videoDuration: node.data.videoDuration ?? 0,
          choices: node.data.choices ?? [],
          miniGameType: node.data.miniGameType ?? "",
          miniGameDuration: node.data.miniGameDuration ?? 0,
          miniGameDifficulty: node.data.miniGameDifficulty ?? "",
          miniGameSuccessTargetNodeId: node.data.miniGameSuccessTargetNodeId ?? "",
          miniGameFailTargetNodeId: node.data.miniGameFailTargetNodeId ?? "",
          miniGameSuccessEffects: node.data.miniGameSuccessEffects ?? [],
          miniGameFailEffects: node.data.miniGameFailEffects ?? [],
          functionActions: node.data.functionActions ?? [],
          conditionVariableId: node.data.conditionVariableId ?? "",
          conditionKey: node.data.conditionKey ?? "",
          conditionOperator: node.data.conditionOperator ?? "",
          conditionValue: node.data.conditionValue ?? null,
          conditionTrueTargetNodeId: node.data.conditionTrueTargetNodeId ?? "",
          conditionFalseTargetNodeId: node.data.conditionFalseTargetNodeId ?? "",
          specialSubtype: node.data.specialSubtype ?? "",
        },
      })),
      edges: storyEdges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        label: edge.label,
        data: edge.data,
      })),
    };
  }

  function downloadReaderStoryFile() {
    const storyData = getReaderStoryData();
    const json = JSON.stringify(storyData, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const safeTitle = slugifyDashboardBook(dashboardSaveForm.title || "story");

    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeTitle || "story"}.story.json`;
    link.click();

    URL.revokeObjectURL(url);
  }

  function exportJson() {
    downloadReaderStoryFile();
  }

  return (
    <main className="h-screen w-screen overflow-hidden bg-neutral-950 text-white">
      <div className="flex h-full">
        <aside className="flex w-24 flex-col items-center border-r-4 border-black bg-neutral-950 p-3">
          <button
            onClick={() => {
              const confirmed = window.confirm(
                "Weet je zeker dat je terug wilt naar de Library? Vergeet niet eerst je project op te slaan.",
              );
              if (confirmed) window.location.href = "/";
            }}
            className="mb-6 flex flex-col items-center rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500"
            title="Terug naar Library"
            aria-label="Terug naar Library"
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 shadow-inner transition hover:border-blue-400 hover:bg-neutral-800">
              <span className="text-2xl font-black tracking-tight text-white">DI</span>
            </div>
            <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-neutral-500">Studio</p>
          </button>

          <div className="grid justify-items-center gap-3">
            <SidebarButton
              onClick={() => createNode("text")}
              label="Tekst"
              className="bg-blue-600 text-white hover:bg-blue-500"
              icon={<BookIcon />}
            />

            <SidebarButton
              onClick={() => createNode("special")}
              label="Speciale pagina"
              className="bg-yellow-500 text-black hover:bg-yellow-400"
              icon={<BookIcon sparkle />}
            />

            <SidebarButton
              onClick={() => createNode("cutscene")}
              label="Cutscene"
              className="bg-green-600 text-white hover:bg-green-500"
              icon={<VideoIcon />}
            />

            <SidebarButton
              onClick={() => createNode("choice")}
              label="Keuze menu"
              className="bg-orange-500 text-white hover:bg-orange-400"
              icon={
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-black/20 text-[11px] font-black tracking-tight">
                  ABC
                </div>
              }
            />

            <SidebarButton
              onClick={() => createNode("minigame")}
              label="Mini game"
              className="bg-purple-600 text-white hover:bg-purple-500"
              icon={<JoystickIcon />}
            />

            <SidebarButton
              onClick={() => setVariablesOpen(true)}
              label="Flags & variabelen"
              className="bg-indigo-600 text-white hover:bg-indigo-500"
              icon={<FlagVariablesIcon />}
            />

            <SidebarButton
              onClick={() => createNode("function")}
              label="Functie / flags"
              className="bg-cyan-500 text-slate-950 hover:bg-cyan-300"
              icon={<FunctionIcon />}
            />

            <SidebarButton
              onClick={() => createNode("condition")}
              label="Voorwaarde / IF"
              className="bg-teal-600 text-white hover:bg-teal-500"
              icon={<ConditionIcon />}
            />

            <SidebarButton
              onClick={() => createNode("scratchpad")}
              label="Kladblok / lore"
              className="bg-white text-slate-950 hover:bg-slate-200"
              icon={<ScratchpadIcon />}
            />

            <SidebarButton
              onClick={saveProject}
              label="Save menu"
              className="mt-6 bg-cyan-600 text-white hover:bg-cyan-500"
              icon={<SaveIcon />}
            />

            <label
              title="Load project"
              aria-label="Load project"
              className="group flex h-14 w-14 cursor-pointer items-center justify-center rounded-2xl bg-sky-700 text-white shadow-sm transition hover:scale-[1.06] hover:bg-sky-600 active:scale-[0.96]"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center transition group-hover:scale-110">
                <FolderIcon />
              </span>
              <span className="sr-only">Load project</span>
              <input
                type="file"
                accept=".json,.dibooks-project.json"
                onChange={loadProject}
                className="hidden"
              />
            </label>

            <SidebarButton
              onClick={openPreview}
              label="Play project"
              className="bg-emerald-600 text-white hover:bg-emerald-500"
              icon={<PlayIcon />}
            />

          </div>

          <div className="mt-6 grid justify-items-center gap-3 border-t border-neutral-800 pt-5">
            <SidebarButton
              onClick={() => setHelpOpen(true)}
              label="Handleiding"
              className="bg-neutral-800 text-white hover:bg-neutral-700"
              icon={<HelpIcon />}
            />

            <SidebarButton
              onClick={() => setEditorDarkMode((current) => !current)}
              label={editorDarkMode ? "Grid light mode" : "Grid dark mode"}
              className={
                editorDarkMode
                  ? "bg-slate-200 text-slate-950 hover:bg-white"
                  : "bg-slate-900 text-slate-100 hover:bg-slate-800"
              }
              icon={<MoonIcon darkMode={editorDarkMode} />}
            />


            <SidebarButton
              onClick={resetEditorToBlankProject}
              label="Reset editor"
              className="bg-red-950 text-red-100 hover:bg-red-900"
              icon={<ResetEditorIcon />}
            />
          </div>
        </aside>

        <section
          ref={flowWrapperRef}
          className={`flex flex-1 flex-col transition-colors ${editorDarkMode ? "bg-[#101521]" : "bg-[#f7f3ea]"}`}
        >
          <div className={`flex shrink-0 items-center justify-between gap-4 border-b border-black/15 px-5 py-3 ${editorDarkMode ? "bg-slate-950/70 text-white" : "bg-[#fffaf0]/90 text-neutral-950"}`}>
            <div className="min-w-0">
              <p className={`text-[10px] font-black uppercase tracking-[0.25em] ${editorDarkMode ? "text-cyan-300" : "text-blue-700"}`}>Auteur Studio</p>
              <h1 className="truncate text-lg font-black sm:text-2xl">
                {dashboardSaveForm.title.trim() || "Naamloos boek"}
              </h1>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 text-xs font-black">
              <span className={`rounded-full px-3 py-1 ${isLoggedIn ? "bg-emerald-500/15 text-emerald-300" : "bg-yellow-500/15 text-yellow-300"}`}>
                {sharedEditBookId ? "Voorstelmodus • origineel blijft veilig" : isLoggedIn ? "Ingelogd • dashboard opslag" : "Gast • lokaal opslaan"}
              </span>
              <span
                title="Automatische sessie-opslag. Wordt direct hersteld zolang deze browsersessie open blijft."
                className={`rounded-full px-3 py-1 ${editorDarkMode ? "bg-emerald-500/15 text-emerald-200" : "bg-emerald-600/10 text-emerald-700"}`}
              >
                {autosaveStatus}
              </span>
              <AppNavActions compact />
              <span className={`rounded-full px-3 py-1 ${editorDarkMode ? "bg-cyan-500/15 text-cyan-200" : "bg-cyan-600/10 text-cyan-700"}`}>
                {getPlanLabel(user)}
              </span>
              <span className={`rounded-full px-3 py-1 ${nodeLimitReached ? "bg-red-500/15 text-red-300" : editorDarkMode ? "bg-white/10 text-neutral-300" : "bg-black/10 text-neutral-700"}`}>
                {storyNodeCount}{maxNodesForCurrentUser !== null ? `/${maxNodesForCurrentUser}` : ""} verhaalnodes
              </span>
              <span className={`rounded-full px-3 py-1 ${editorDarkMode ? "bg-white/10 text-neutral-300" : "bg-black/10 text-neutral-700"}`}>
                {getStoryEdges(edges, nodes).length} paths
              </span>
              {storyVariables.length > 0 && (
                <span className={`rounded-full px-3 py-1 ${editorDarkMode ? "bg-indigo-500/15 text-indigo-200" : "bg-indigo-600/10 text-indigo-700"}`}>
                  {storyVariables.length} variabele{storyVariables.length === 1 ? "" : "n"}
                </span>
              )}
              {functionNodeCount > 0 && (
                <span className={`rounded-full px-3 py-1 ${editorDarkMode ? "bg-cyan-500/15 text-cyan-200" : "bg-cyan-600/10 text-cyan-700"}`}>
                  {functionNodeCount} functie
                </span>
              )}
              {conditionNodeCount > 0 && (
                <span className={`rounded-full px-3 py-1 ${editorDarkMode ? "bg-teal-500/15 text-teal-200" : "bg-teal-600/10 text-teal-700"}`}>
                  {conditionNodeCount} voorwaarde
                </span>
              )}
              {scratchpadNodeCount > 0 && (
                <span className={`rounded-full px-3 py-1 ${editorDarkMode ? "bg-white/10 text-neutral-200" : "bg-black/10 text-neutral-700"}`}>
                  {scratchpadNodeCount} kladblok
                </span>
              )}
              {sharedEditBookId && (
                <span className={`rounded-full px-3 py-1 ${editorDarkMode ? "bg-yellow-500/15 text-yellow-200" : "bg-yellow-500/20 text-yellow-800"}`}>
                  Gedeeld door {sharedEditOwnerName || "eigenaar"}
                </span>
              )}
              {dashboardBookId && (
                <span className={`rounded-full px-3 py-1 ${editorDarkMode ? "bg-blue-500/15 text-blue-200" : "bg-blue-600/10 text-blue-700"}`}>
                  Dashboard: {dashboardBookId}
                </span>
              )}
            </div>
          </div>
          <div className="min-h-0 flex-1">
          <ReactFlow
            nodes={flowNodes}
            edges={getValidatedEdges(edges, nodes)}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            onMoveEnd={(_, viewport) => setFlowViewport(viewport)}
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
              color={editorDarkMode ? "#334155" : "#350a0a"}
            />
            <Controls />
            <MiniMap />
          </ReactFlow>
          </div>
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
                    color: selectedNode.data.type === "scratchpad" ? "#0f172a" : undefined,
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

              {selectedNode.data.type === "scratchpad" ? (
                <div className="rounded-xl border border-white/15 bg-white/10 p-3 text-sm text-neutral-300">
                  <div className="font-black text-white">Kladblok-node</div>
                  <p className="mt-1 text-neutral-400">
                    Deze node is alleen voor notities/lore. Hij kan geen start-node zijn en krijgt geen paths.
                  </p>
                </div>
              ) : (
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
              )}

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
                selectedNode.data.type !== "minigame" &&
                selectedNode.data.type !== "condition" &&
                selectedNode.data.type !== "scratchpad" && (
              <div className="rounded-xl bg-neutral-900 p-3">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-black">Paths</h3>
                  <span className="text-sm text-neutral-400">
                    {selectedNodePaths.length}/{selectedNode.data.type === "function" ? 1 : 10}
                  </span>
                </div>

                <label className="mb-2 block text-sm font-bold">
                  Add path naar node
                </label>

                {selectedNode.data.type === "function" && (
                  <p className="mb-3 rounded-lg border border-cyan-500/20 bg-cyan-500/10 p-3 text-xs font-bold leading-5 text-cyan-100/80">
                    Functie-nodes zijn onzichtbaar voor lezers. Zodra de reader deze node bereikt, worden de acties uitgevoerd en gaat het verhaal automatisch door via de eerste path.
                  </p>
                )}

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
                selectedNode.data.type === "special" ||
                selectedNode.data.type === "scratchpad") && (
                <div>
                  <label className="mb-2 block text-sm font-bold">
                    {selectedNode.data.type === "scratchpad" ? "Notities / lore" : "Tekst / inhoud"}
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
                        Tip: gebruik een gecomprimeerde .mp4 of .webm van maximaal 12 seconden. Uploads worden opgeslagen in DiBooks Storage.
                      </p>
                      {cutsceneUploadStatus && (
                        <p className="mt-2 rounded-lg border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-200">
                          {cutsceneUploadStatus}
                        </p>
                      )}
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
                            videoStoragePath: "",
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
                            {selectedNode.data.videoStoragePath && (
                              <p className="mt-1 max-w-lg truncate text-xs text-cyan-300/80">
                                Storage: {selectedNode.data.videoStoragePath}
                              </p>
                            )}
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

              {selectedNode.data.type === "scratchpad" && (
                <div className="rounded-xl border border-white/15 bg-white/10 p-3 text-sm text-neutral-300">
                  <div className="font-black text-white">Niet zichtbaar voor lezers</div>
                  <p className="mt-1 text-neutral-400">
                    Kladblok-nodes worden opgeslagen in je project, maar niet meegenomen in de reader-export,
                    publicatie-eisen, paden, voortgang of node-limiet.
                  </p>
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

                          <div className="mt-3">
                            <VariableEffectsEditor
                              title="Effect van deze keuze"
                              description="Wordt direct uitgevoerd voordat de gekozen route opent."
                              actions={choice.effects ?? []}
                              variables={storyVariables}
                              onChange={(effects) => updateSelectedChoice(choiceIndex, { effects })}
                              accent="orange"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {selectedNode.data.type === "function" && (
                <div className="rounded-xl border border-cyan-500/25 bg-cyan-950/30 p-4">
                  <div className="mb-4">
                    <h3 className="font-black text-cyan-200">Functie / flags</h3>
                    <p className="mt-1 text-sm leading-6 text-neutral-400">
                      Deze node is onzichtbaar voor lezers. Hij voert acties uit, bijvoorbeeld een vlag aanzetten of een teller verhogen, en stuurt daarna automatisch door via zijn path.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    {(selectedNode.data.functionActions ?? []).map((action, actionIndex) => (
                      <div key={action.id} className="rounded-xl border border-cyan-500/20 bg-neutral-950 p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <span className="text-xs font-black uppercase tracking-widest text-cyan-300">Actie {actionIndex + 1}</span>
                          <button
                            onClick={() => deleteSelectedFunctionAction(action.id)}
                            className="rounded-lg bg-red-600 px-3 py-2 text-xs font-black text-white hover:bg-red-500"
                          >
                            Verwijder
                          </button>
                        </div>

                        <label className="mb-2 block text-sm font-black">Wat moet er gebeuren?</label>
                        <select
                          value={action.type}
                          onChange={(event) =>
                            updateSelectedFunctionAction(action.id, {
                              type: event.target.value as FunctionActionType,
                              variableId: "",
                              key: "",
                            })
                          }
                          className="mb-3 w-full rounded-lg border-2 border-neutral-700 bg-neutral-900 p-3 text-white outline-none focus:border-cyan-400"
                        >
                          <option value="set_flag">Flag aanzetten</option>
                          <option value="clear_flag">Flag uitzetten</option>
                          <option value="increment">Getal verhogen</option>
                          <option value="decrement">Getal verlagen</option>
                          <option value="set_number">Getal instellen</option>
                          <option value="set_text">Tekst instellen</option>
                        </select>

                        <label className="mb-2 block text-sm font-black">Variabele</label>
                        <select
                          value={
                            storyVariables.find((variable) => variable.id === action.variableId)?.id ??
                            storyVariables.find(
                              (variable) =>
                                variable.name === action.key &&
                                variable.type === getRequiredVariableTypeForAction(action.type),
                            )?.id ??
                            ""
                          }
                          onChange={(event) => {
                            const variable = storyVariables.find(
                              (item) => item.id === event.target.value,
                            );

                            updateSelectedFunctionAction(action.id, {
                              variableId: variable?.id ?? "",
                              key: variable?.name ?? "",
                            });
                          }}
                          className="mb-2 w-full rounded-lg border-2 border-neutral-700 bg-neutral-900 p-3 text-white outline-none focus:border-cyan-400"
                        >
                          <option value="">Kies een variabele...</option>
                          {storyVariables
                            .filter(
                              (variable) =>
                                variable.type === getRequiredVariableTypeForAction(action.type),
                            )
                            .map((variable) => (
                              <option key={variable.id} value={variable.id}>
                                {variable.name}
                              </option>
                            ))}
                        </select>

                        {storyVariables.filter(
                          (variable) =>
                            variable.type === getRequiredVariableTypeForAction(action.type),
                        ).length === 0 && (
                          <p className="mb-3 rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-3 text-xs font-bold leading-5 text-indigo-100/80">
                            Maak eerst een passende variabele via de paarse vlagknop links.
                          </p>
                        )}

                        {(action.type === "increment" || action.type === "decrement" || action.type === "set_number") && (
                          <div>
                            <label className="mb-2 block text-sm font-black">
                              {action.type === "set_number" ? "Waarde" : "Aantal"}
                            </label>
                            <input
                              type="number"
                              value={action.amount ?? 1}
                              onChange={(event) =>
                                updateSelectedFunctionAction(action.id, {
                                  amount: Number(event.target.value) || 0,
                                })
                              }
                              className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-900 p-3 text-white outline-none focus:border-cyan-400"
                            />
                          </div>
                        )}

                        {action.type === "set_text" && (
                          <div>
                            <label className="mb-2 block text-sm font-black">Tekstwaarde</label>
                            <input
                              value={action.textValue ?? ""}
                              onChange={(event) =>
                                updateSelectedFunctionAction(action.id, {
                                  textValue: event.target.value,
                                })
                              }
                              placeholder="Bijv. toegang_verleend"
                              className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-900 p-3 text-white outline-none focus:border-cyan-400"
                            />
                          </div>
                        )}
                      </div>
                    ))}

                    {(selectedNode.data.functionActions ?? []).length === 0 && (
                      <p className="rounded-xl bg-neutral-950 p-3 text-sm text-neutral-400">
                        Nog geen acties. Voeg een actie toe om een flag of teller te wijzigen.
                      </p>
                    )}

                    <button
                      onClick={addSelectedFunctionAction}
                      disabled={(selectedNode.data.functionActions ?? []).length >= 8}
                      className="rounded-xl bg-cyan-500 px-4 py-3 font-black text-slate-950 hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      + Actie toevoegen
                    </button>
                  </div>
                </div>
              )}

              {selectedNode.data.type === "condition" && (
                <div className="rounded-xl border border-teal-500/25 bg-teal-950/30 p-4">
                  <div className="mb-4">
                    <h3 className="font-black text-teal-200">Voorwaarde / IF</h3>
                    <p className="mt-1 text-sm leading-6 text-neutral-400">
                      Controleer een bestaande variabele. Klopt de voorwaarde, dan volgt TRUE; anders automatisch ELSE.
                    </p>
                  </div>

                  {storyVariables.length === 0 ? (
                    <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/10 p-4 text-sm font-bold leading-6 text-indigo-100/80">
                      Maak eerst een variabele via de paarse vlagknop links.
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      <div>
                        <label className="mb-2 block text-sm font-black">Variabele</label>
                        <select
                          value={storyVariables.find((v) => v.id === selectedNode.data.conditionVariableId)?.id ?? storyVariables.find((v) => v.name === selectedNode.data.conditionKey)?.id ?? ""}
                          onChange={(event) => {
                            const variable = storyVariables.find((item) => item.id === event.target.value);
                            updateSelectedConditionData({
                              conditionVariableId: variable?.id ?? "",
                              conditionKey: variable?.name ?? "",
                              conditionOperator: variable ? getDefaultConditionOperatorForType(variable.type) : "is_true",
                              conditionValue: variable ? getDefaultConditionValueForType(variable.type) : true,
                            });
                          }}
                          className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-teal-400"
                        >
                          <option value="">Kies een variabele...</option>
                          {storyVariables.map((variable) => (
                            <option key={variable.id} value={variable.id}>
                              {variable.name} — {variable.type === "boolean" ? "ja/nee" : variable.type === "number" ? "getal" : "tekst"}
                            </option>
                          ))}
                        </select>
                      </div>

                      {(() => {
                        const conditionVariable = storyVariables.find((v) => v.id === selectedNode.data.conditionVariableId) ?? storyVariables.find((v) => v.name === selectedNode.data.conditionKey);
                        if (!conditionVariable) return null;
                        return (
                          <>
                            <div>
                              <label className="mb-2 block text-sm font-black">Voorwaarde</label>
                              <select
                                value={selectedNode.data.conditionOperator ?? getDefaultConditionOperatorForType(conditionVariable.type)}
                                onChange={(event) => updateSelectedConditionData({ conditionOperator: event.target.value as ConditionOperator })}
                                className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-teal-400"
                              >
                                {conditionVariable.type === "boolean" && <><option value="is_true">Is waar / aan</option><option value="is_false">Is niet waar / uit</option></>}
                                {conditionVariable.type === "number" && <><option value="equals">Is gelijk aan</option><option value="not_equals">Is niet gelijk aan</option><option value="greater_than">Is groter dan</option><option value="greater_or_equal">Is groter dan of gelijk aan</option><option value="less_than">Is kleiner dan</option><option value="less_or_equal">Is kleiner dan of gelijk aan</option></>}
                                {conditionVariable.type === "text" && <><option value="equals">Is gelijk aan</option><option value="not_equals">Is niet gelijk aan</option><option value="contains">Bevat tekst</option></>}
                              </select>
                            </div>
                            {conditionVariable.type === "number" && (
                              <div>
                                <label className="mb-2 block text-sm font-black">Vergelijk met</label>
                                <input type="number" value={typeof selectedNode.data.conditionValue === "number" ? selectedNode.data.conditionValue : 0} onChange={(event) => updateSelectedConditionData({ conditionValue: Number(event.target.value) || 0 })} className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-teal-400" />
                              </div>
                            )}
                            {conditionVariable.type === "text" && (
                              <div>
                                <label className="mb-2 block text-sm font-black">Vergelijk met</label>
                                <input value={typeof selectedNode.data.conditionValue === "string" ? selectedNode.data.conditionValue : ""} onChange={(event) => updateSelectedConditionData({ conditionValue: event.target.value })} placeholder="Bijv. Dust" className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-teal-400" />
                              </div>
                            )}
                          </>
                        );
                      })()}

                      <div className="rounded-xl border border-emerald-800 bg-emerald-950/20 p-3">
                        <label className="mb-2 block text-sm font-black text-emerald-200">TRUE route</label>
                        <select value={selectedNode.data.conditionTrueTargetNodeId ?? ""} onChange={(event) => updateSelectedConditionRoute("true", event.target.value)} className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-emerald-400">
                          <option value="">Nog geen TRUE-doel...</option>
                          {availableTargetNodes.map((node) => <option key={node.id} value={node.id}>{node.data.label} — {nodeLabels[node.data.type]}</option>)}
                        </select>
                      </div>

                      <div className="rounded-xl border border-rose-900 bg-rose-950/20 p-3">
                        <label className="mb-2 block text-sm font-black text-rose-200">ELSE / FALSE route</label>
                        <select value={selectedNode.data.conditionFalseTargetNodeId ?? ""} onChange={(event) => updateSelectedConditionRoute("false", event.target.value)} className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-rose-400">
                          <option value="">Nog geen ELSE-doel...</option>
                          {availableTargetNodes.map((node) => <option key={node.id} value={node.id}>{node.data.label} — {nodeLabels[node.data.type]}</option>)}
                        </select>
                      </div>

                      <p className="rounded-xl border border-teal-500/20 bg-black/20 p-3 text-xs font-bold leading-5 text-teal-100/80">ELSE is geen aparte variabele of node: hij wordt gevolgd als de IF-voorwaarde niet klopt.</p>
                    </div>
                  )}
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

                    <VariableEffectsEditor
                      title="Success effects"
                      description="Uitvoeren zodra de speler slaagt, vóór de Success-route opent."
                      actions={selectedNode.data.miniGameSuccessEffects ?? []}
                      variables={storyVariables}
                      onChange={(miniGameSuccessEffects) => updateSelectedMiniGameData({ miniGameSuccessEffects })}
                      accent="cyan"
                    />

                    <VariableEffectsEditor
                      title="Fail effects"
                      description="Uitvoeren zodra de speler faalt, vóór de Fail-route opent."
                      actions={selectedNode.data.miniGameFailEffects ?? []}
                      variables={storyVariables}
                      onChange={(miniGameFailEffects) => updateSelectedMiniGameData({ miniGameFailEffects })}
                      accent="red"
                    />

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

      {helpOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 p-4 sm:p-8">
          <div className="mx-auto flex max-h-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-neutral-700 bg-neutral-950 text-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-neutral-800 p-5">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-neutral-500">DiBooks Auteur Studio</p>
                <h2 className="text-2xl font-black">Handleiding</h2>
              </div>
              <button
                onClick={() => setHelpOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-2xl font-black leading-none text-white hover:bg-red-500"
                aria-label="Sluit handleiding"
                title="Sluit handleiding"
              >
                ×
              </button>
            </div>

            <div className="overflow-y-auto p-5 sm:p-7">
              <div className="grid gap-5 md:grid-cols-2">
                <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5">
                  <h3 className="mb-4 text-lg font-black">Iconen links</h3>
                  <div className="grid gap-3 text-sm text-neutral-300">
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600"><BookIcon /></span><span><strong className="text-white">Tekst</strong><br />Normale verhaaltekst.</span></div>
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500 text-black"><BookIcon sparkle /></span><span><strong className="text-white">Speciale pagina</strong><br />Brief, logboek, dossier of dagboek. Krijgt een eigen pagina.</span></div>
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-600"><VideoIcon /></span><span><strong className="text-white">Cutscene</strong><br />Kort videofragment van maximaal 12 seconden.</span></div>
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500 text-[11px] font-black">ABC</span><span><strong className="text-white">Keuze menu</strong><br />Lezer kiest uit maximaal drie routes.</span></div>
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600"><JoystickIcon /></span><span><strong className="text-white">Mini game</strong><br />Interactief moment met success/fail route.</span></div>
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-white"><FlagVariablesIcon /></span><span><strong className="text-white">Flags & variabelen</strong><br />Centrale lijst met alle flags, tellers en tekstvariabelen van dit boek.</span></div>
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-500 text-slate-950"><FunctionIcon /></span><span><strong className="text-white">Functie / flags</strong><br />Onzichtbare node die centrale variabelen aanpast en automatisch doorgaat.</span></div>
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white"><ConditionIcon /></span><span><strong className="text-white">Voorwaarde / IF</strong><br />Controleert een variabele en kiest TRUE of ELSE.</span></div>
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-950"><ScratchpadIcon /></span><span><strong className="text-white">Kladblok</strong><br />Notities, lore en ideeën. Geen paths en niet zichtbaar voor lezers.</span></div>
                  </div>
                </section>

                <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5">
                  <h3 className="mb-4 text-lg font-black">Project knoppen</h3>
                  <div className="grid gap-3 text-sm text-neutral-300">
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-cyan-600"><SaveIcon /></span><span><strong className="text-white">Save menu</strong><br />Sla op in Dashboard, download een backup of exporteer een reader-versie.</span></div>
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-700"><FolderIcon /></span><span><strong className="text-white">Load project</strong><br />Laadt een eerder opgeslagen DiBooks projectbestand.</span></div>
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600"><PlayIcon /></span><span><strong className="text-white">Play project</strong><br />Test je verhaal vanuit de start-node.</span></div>
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-200 text-slate-950"><MoonIcon darkMode={false} /></span><span><strong className="text-white">Grid thema</strong><br />Wissel tussen lichte en donkere editor-grid.</span></div>
                    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-950 text-red-100"><ResetEditorIcon /></span><span><strong className="text-white">Reset editor</strong><br />Wist de huidige sessie en start weer met een lege begin-node.</span></div>
                  </div>
                </section>

                <section className="rounded-2xl border border-indigo-900/70 bg-indigo-950/20 p-5 md:col-span-2">
                  <h3 className="mb-3 text-lg font-black">Nieuwe pagina in tekst</h3>
                  <p className="text-sm leading-6 text-neutral-300">
                    In een tekst-node kun je in de teksteditor op <strong className="text-white">Nieuwe pagina</strong> klikken.
                    De editor plaatst dan <code className="rounded bg-black/40 px-2 py-1 text-indigo-200">[[NIEUWE_PAGINA]]</code> op die plek.
                    In de reader wordt deze code verborgen en begint de tekst daarna op een nieuwe boekpagina. Handig voor hoofdstukken, titels of grote tekstblokken.
                  </p>
                </section>

                <section className="rounded-2xl border border-emerald-900/70 bg-emerald-950/20 p-5 md:col-span-2">
                  <h3 className="mb-3 text-lg font-black">Sessiesave</h3>
                  <p className="text-sm leading-6 text-neutral-300">
                    De editor herstelt automatisch de meest recente versie uit deze browsersessie. Je krijgt dus geen herstelvraag meer. Sluit je browser helemaal af of klik <strong className="text-white">Reset editor</strong> om de sessie te wissen.
                    Dashboard opslaan blijft de veilige online opslag.
                  </p>
                </section>

                <section className="rounded-2xl border border-neutral-800 bg-neutral-900/70 p-5 md:col-span-2">
                  <h3 className="mb-3 text-lg font-black">Basis workflow</h3>
                  <ol className="grid gap-2 pl-5 text-sm text-neutral-300 md:grid-cols-2">
                    <li className="list-decimal">Maak nodes aan met de iconen links.</li>
                    <li className="list-decimal">Klik op een node om rechts de instellingen te openen.</li>
                    <li className="list-decimal">Gebruik <strong className="text-white">Paths</strong> om verhaalnodes met elkaar te verbinden.</li>
                    <li className="list-decimal">Gebruik <strong className="text-white">Keuze menu</strong> voor echte lezerskeuzes.</li>
                    <li className="list-decimal">Gebruik <strong className="text-white">Mini game</strong> voor success/fail-routes.</li>
                    <li className="list-decimal">Klik <strong className="text-white">Play</strong> om je verhaal te testen.</li>
                    <li className="list-decimal">Gebruik <strong className="text-white">Nieuwe pagina</strong> in tekstnodes om hoofdstukken of titels netjes op een nieuwe pagina te starten.</li>
                    <li className="list-decimal">Gebruik <strong className="text-white">Kladblok</strong> voor lore/notities; deze telt niet mee voor publiceren.</li>
                    <li className="list-decimal">Gebruik <strong className="text-white">Save menu</strong> voor Dashboard opslag, backup of export.</li>
                    <li className="list-decimal">Gebruik <strong className="text-white">Reset editor</strong> alleen als je bewust opnieuw wilt beginnen.</li>
                  </ol>
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      {variablesOpen && (
        <div className="fixed inset-0 z-[70] overflow-y-auto bg-black/80 p-4 backdrop-blur-sm sm:p-6">
          <div className="mx-auto max-w-5xl rounded-3xl border border-indigo-400/20 bg-[#080b13] p-5 text-white shadow-2xl sm:p-8">
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-sm font-black uppercase tracking-[0.32em] text-indigo-300">
                  Story state
                </p>
                <h2 className="mt-2 text-3xl font-black sm:text-5xl">
                  Flags & variabelen
                </h2>
                <p className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-neutral-400">
                  Maak hier één centrale lijst voor dit boek. Functie-nodes kiezen daarna een variabele uit deze lijst,
                  zodat auteurs niet steeds losse namen hoeven over te typen.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={addStoryVariable}
                  className="rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-black text-white hover:bg-indigo-500"
                >
                  + Nieuwe variabele
                </button>
                <button
                  onClick={() => setVariablesOpen(false)}
                  className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-black text-white hover:bg-red-500"
                >
                  Sluiten
                </button>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-indigo-400/20 bg-indigo-500/10 p-4 text-sm font-semibold leading-6 text-indigo-100">
              <strong>Boolean</strong> gebruik je voor ja/nee-flags, <strong>Getal</strong> voor vertrouwen, reputatie of tellers
              en <strong>Tekst</strong> voor een tekstwaarde. De startwaarde wordt gebruikt wanneer een lezer een nieuw verhaal begint.
            </div>

            {storyVariables.length === 0 ? (
              <div className="mt-6 rounded-3xl border border-dashed border-white/15 bg-white/[0.03] p-10 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600/20 text-indigo-200">
                  <FlagVariablesIcon />
                </div>
                <h3 className="mt-4 text-xl font-black">Nog geen variabelen</h3>
                <p className="mt-2 text-sm font-semibold text-neutral-400">
                  Maak bijvoorbeeld <code className="rounded bg-black/30 px-2 py-1 text-indigo-200">has_key</code> of{" "}
                  <code className="rounded bg-black/30 px-2 py-1 text-indigo-200">xander_trust</code>.
                </p>
              </div>
            ) : (
              <div className="mt-6 grid gap-4">
                {storyVariables.map((variable, variableIndex) => {
                  const referenceCount = nodes.reduce((total, node) => {
                    const functionReferences = (node.data.functionActions ?? []).filter(
                      (action) =>
                        action.variableId === variable.id ||
                        (!action.variableId && action.key === variable.name),
                    ).length;
                    const conditionReference =
                      node.data.type === "condition" &&
                      (node.data.conditionVariableId === variable.id ||
                        (!node.data.conditionVariableId && node.data.conditionKey === variable.name))
                        ? 1
                        : 0;
                    return total + functionReferences + conditionReference;
                  }, 0);

                  return (
                    <div
                      key={variable.id}
                      className="rounded-3xl border border-white/10 bg-white/[0.035] p-5"
                    >
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-xs font-black uppercase tracking-[0.25em] text-indigo-300">
                            Variabele {variableIndex + 1}
                          </p>
                          <p className="mt-1 text-xs font-semibold text-neutral-500">
                            {referenceCount} koppeling{referenceCount === 1 ? "" : "en"} met functie/IF
                          </p>
                        </div>
                        <button
                          onClick={() => deleteStoryVariable(variable.id)}
                          className="rounded-xl bg-red-700 px-4 py-2 text-sm font-black text-white hover:bg-red-600"
                        >
                          Verwijder
                        </button>
                      </div>

                      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr_1fr]">
                        <div>
                          <label className="mb-2 block text-sm font-black text-neutral-300">
                            Naam
                          </label>
                          <input
                            value={variable.name}
                            onChange={(event) =>
                              updateStoryVariable(variable.id, {
                                name: event.target.value,
                              })
                            }
                            className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-mono font-bold text-white outline-none focus:border-indigo-400"
                          />
                          <p className="mt-2 text-xs font-semibold text-neutral-500">
                            Spaties en vreemde tekens worden automatisch omgezet naar underscores.
                          </p>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-black text-neutral-300">
                            Type
                          </label>
                          <select
                            value={variable.type}
                            onChange={(event) => {
                              const nextType = event.target.value as StoryVariableType;
                              updateStoryVariable(variable.id, {
                                type: nextType,
                                defaultValue: getDefaultStoryVariableValue(nextType),
                              });
                            }}
                            className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-indigo-400"
                          >
                            <option value="boolean">Boolean / ja-nee</option>
                            <option value="number">Getal</option>
                            <option value="text">Tekst</option>
                          </select>
                        </div>

                        <div>
                          <label className="mb-2 block text-sm font-black text-neutral-300">
                            Startwaarde
                          </label>

                          {variable.type === "boolean" && (
                            <label className="flex min-h-[50px] cursor-pointer items-center gap-3 rounded-2xl border border-white/10 bg-black/35 px-4 py-3">
                              <input
                                type="checkbox"
                                checked={Boolean(variable.defaultValue)}
                                onChange={(event) =>
                                  updateStoryVariable(variable.id, {
                                    defaultValue: event.target.checked,
                                  })
                                }
                                className="h-5 w-5 accent-indigo-500"
                              />
                              <span className="font-black">
                                {Boolean(variable.defaultValue) ? "True / aan" : "False / uit"}
                              </span>
                            </label>
                          )}

                          {variable.type === "number" && (
                            <input
                              type="number"
                              value={Number(variable.defaultValue) || 0}
                              onChange={(event) =>
                                updateStoryVariable(variable.id, {
                                  defaultValue: Number(event.target.value) || 0,
                                })
                              }
                              className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-indigo-400"
                            />
                          )}

                          {variable.type === "text" && (
                            <input
                              value={String(variable.defaultValue ?? "")}
                              onChange={(event) =>
                                updateStoryVariable(variable.id, {
                                  defaultValue: event.target.value,
                                })
                              }
                              placeholder="Bijv. onbekend"
                              className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-bold text-white outline-none focus:border-indigo-400"
                            />
                          )}
                        </div>
                      </div>

                      <div className="mt-4">
                        <label className="mb-2 block text-sm font-black text-neutral-300">
                          Omschrijving
                        </label>
                        <input
                          value={variable.description ?? ""}
                          onChange={(event) =>
                            updateStoryVariable(variable.id, {
                              description: event.target.value,
                            })
                          }
                          placeholder="Waar gebruik je deze variabele voor?"
                          className="w-full rounded-2xl border border-white/10 bg-black/35 px-4 py-3 font-semibold text-white outline-none focus:border-indigo-400"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {editingTextNode &&
        (editingTextNode.data.type === "text" ||
          editingTextNode.data.type === "special" ||
          editingTextNode.data.type === "scratchpad") && (
          <RichTextEditorModal
            title={editingTextNode.data.label}
            initialHtml={
              editingTextNode.data.textHtml || editingTextNode.data.text || ""
            }
            allowManualPageBreak={
              editingTextNode.data.type === "text" ||
              editingTextNode.data.type === "special"
            }
            onSave={(html, plainText) =>
              updateNodeRichText(editingTextNode.id, html, plainText)
            }
            onClose={() => setEditingTextNodeId(null)}
          />
        )}
      {saveDashboardOpen && (
        <SaveToDashboardModal
          form={dashboardSaveForm}
          setForm={setDashboardSaveForm}
          existingBookId={sharedEditBookId ? sharedEditBookId : dashboardBookId}
          isLoggedIn={isLoggedIn}
          series={dashboardSeries}
          onOpenSeries={() => setSeriesManagerOpen(true)}
          onClose={() => setSaveDashboardOpen(false)}
          onSaveDashboard={saveCurrentBookToDashboard}
          onDownloadProject={downloadProjectFile}
          onDownloadReaderStory={downloadReaderStoryFile}
        />
      )}
      {seriesManagerOpen && user && (
        <BookSeriesManagerModal
          user={user}
          series={dashboardSeries}
          onClose={() => setSeriesManagerOpen(false)}
          onChanged={async () => {
            const nextSeries = await fetchBookSeriesFromSupabase(user);
            setDashboardSeries(nextSeries);
          }}
          onCreated={(createdSeries) => {
            setDashboardSaveForm((current) => ({
              ...current,
              seriesId: createdSeries.id,
              seriesOrder: current.seriesOrder || "1",
            }));
          }}
          onDeleted={(seriesId) => {
            setDashboardSaveForm((current) =>
              current.seriesId === seriesId
                ? { ...current, seriesId: "", seriesOrder: "1" }
                : current,
            );
          }}
        />
      )}
      {authModalMode && (
        <AuthModal
          mode={authModalMode}
          onModeChange={setAuthModalMode}
          onClose={() => setAuthModalMode(null)}
          onLogin={loginWithCredentials}
          onRegister={registerWithCredentials}
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
                  ? dashboardSaveForm.title.trim() || "Naamloos boek"
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
                              executePreviewActions(choice.effects ?? []);
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

            {previewNode.data.type === "function" && (
              <div className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-4 p-6">
                <div className="rounded-2xl border border-cyan-500/25 bg-cyan-950/30 p-8">
                  <p className="text-sm font-bold uppercase tracking-widest text-cyan-300">Functie-node</p>
                  <h1 className="mt-2 text-3xl font-black">{previewNode.data.label}</h1>
                  <p className="mt-4 text-sm leading-6 text-cyan-100/80">
                    In de echte reader wordt deze node onzichtbaar uitgevoerd. Voor de preview zie je hem hier zodat je kunt controleren welke acties actief zijn.
                  </p>
                  <div className="mt-5 grid gap-2">
                    {(previewNode.data.functionActions ?? []).map((action) => (
                      <div key={action.id} className="rounded-xl bg-black/25 p-3 text-sm font-bold text-cyan-50">
                        {action.type} → {action.key || "geen naam"}{" "}
                        {(action.type === "increment" || action.type === "decrement" || action.type === "set_number")
                          ? `(${action.amount ?? 1})`
                          : action.type === "set_text"
                            ? `("${action.textValue ?? ""}")`
                            : ""}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      const targetId = edges.find((edge) => edge.source === previewNode.id)?.target;
                      if (!targetId) {
                        alert("Deze functie-node heeft nog geen vervolgpath.");
                        return;
                      }
                      executePreviewFunctionActions(previewNode);
                      goToPreviewNode(targetId);
                    }}
                    className="mt-6 rounded-xl bg-cyan-500 px-5 py-3 font-black text-slate-950 hover:bg-cyan-300"
                  >
                    Functie uitvoeren en doorgaan
                  </button>
                </div>
              </div>
            )}

            {previewNode.data.type === "condition" && (() => {
              const variable = storyVariables.find((item) => item.id === previewNode.data.conditionVariableId) ?? storyVariables.find((item) => item.name === previewNode.data.conditionKey);
              const result = evaluatePreviewCondition(previewNode);
              const targetId = result ? previewNode.data.conditionTrueTargetNodeId : previewNode.data.conditionFalseTargetNodeId;
              const currentValue = getPreviewVariableValue(previewNode.data.conditionVariableId, previewNode.data.conditionKey);
              return (
                <div className="mx-auto flex h-full max-w-3xl flex-col justify-center gap-4 p-6">
                  <div className="rounded-2xl border border-teal-500/25 bg-teal-950/30 p-8">
                    <p className="text-sm font-bold uppercase tracking-widest text-teal-300">Voorwaarde / IF</p>
                    <h1 className="mt-2 text-3xl font-black">{previewNode.data.label}</h1>
                    <p className="mt-4 text-sm leading-6 text-teal-100/80">In de echte reader gebeurt deze controle onzichtbaar. In preview zie je de uitkomst zodat je de logica kunt testen.</p>
                    <div className="mt-5 grid gap-3">
                      <div className="rounded-xl bg-black/25 p-3 text-sm font-bold text-teal-50">Variabele: {variable?.name ?? "niet gekoppeld"}</div>
                      <div className="rounded-xl bg-black/25 p-3 text-sm font-bold text-teal-50">Huidige waarde: {String(currentValue ?? "onbekend")}</div>
                      <div className={`rounded-xl p-4 text-lg font-black ${result ? "bg-emerald-500/20 text-emerald-200" : "bg-rose-500/20 text-rose-200"}`}>Uitkomst: {result ? "TRUE" : "ELSE / FALSE"}</div>
                    </div>
                    <button
                      onClick={() => {
                        if (!variable) { alert("Deze voorwaarde heeft geen geldige variabele gekoppeld."); return; }
                        if (!targetId) { alert(result ? "Deze voorwaarde heeft nog geen TRUE-route." : "Deze voorwaarde heeft nog geen ELSE-route."); return; }
                        goToPreviewNode(targetId);
                      }}
                      className={`mt-6 rounded-xl px-5 py-3 font-black text-white ${result ? "bg-emerald-600 hover:bg-emerald-500" : "bg-rose-600 hover:bg-rose-500"}`}
                    >
                      Volg {result ? "TRUE" : "ELSE"} route
                    </button>
                  </div>
                </div>
              );
            })()}

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

                      executePreviewActions(previewNode.data.miniGameSuccessEffects ?? []);
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

                      executePreviewActions(previewNode.data.miniGameFailEffects ?? []);
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
              previewNode.data.type !== "minigame" &&
              previewNode.data.type !== "function" &&
              previewNode.data.type !== "condition" && (
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
