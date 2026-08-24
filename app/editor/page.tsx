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
import {
  FREE_NODE_LIMIT,
  getMaxNodesForUser,
  canAccessOwnedResource,
  useDemoAuth,
  type PublicSignupPlan,
} from "@/lib/auth";
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
import {
  fetchAdminModerationSubmission,
  clearModerationFlag,
  reopenModerationFlag,
  reviewModerationSubmission,
  verifyCurrentUserIsAdmin,
  type ModerationFlag,
  type ModerationSubmissionDetail,
} from "@/lib/supabase/moderation";

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

type DiNodeType = "text" | "special" | "chapter" | "cutscene" | "choice" | "minigame" | "function" | "condition" | "scratchpad";

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
  chapterNumber?: string;
  chapterTitle?: string;
  chapterSubtitle?: string;
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
  reviewFlagCount?: number;
  reviewFlagSeverity?: string;
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
  chapter: "#e11d48",
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
  chapter: "Hoofdstuk-marker",
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

function countLimitedStoryNodes(currentNodes: Node<DiNodeData>[]) {
  return getStoryNodes(currentNodes).filter(
    (node) =>
      node.data.type !== "function" &&
      node.data.type !== "condition" &&
      node.data.type !== "chapter",
  ).length;
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

type SidebarGroupId = "text" | "media" | "logic" | "project";

function SidebarMenuItem({
  title,
  description,
  accentClass,
  icon,
  onClick,
}: {
  title: string;
  description: string;
  accentClass: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border border-white/8 bg-white/[0.035] p-3 text-left transition hover:border-white/15 hover:bg-white/[0.075]"
    >
      <span
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${accentClass}`}
      >
        <span className="flex h-6 w-6 items-center justify-center">{icon}</span>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-black text-white">{title}</span>
        <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-neutral-500">
          {description}
        </span>
      </span>
    </button>
  );
}

function SidebarGroupButton({
  open,
  label,
  className,
  icon,
  onToggle,
  children,
}: {
  open: boolean;
  label: string;
  className: string;
  icon: React.ReactNode;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        title={label}
        aria-label={label}
        aria-expanded={open}
        className={`group flex h-14 w-14 items-center justify-center rounded-2xl font-black shadow-sm transition hover:scale-[1.06] active:scale-[0.96] ${className} ${
          open ? "ring-2 ring-white/70 ring-offset-2 ring-offset-neutral-950" : ""
        }`}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center transition group-hover:scale-110">
          {icon}
        </span>
        <span className="sr-only">{label}</span>
      </button>

      {open && (
        <div className="absolute left-[4.6rem] top-0 z-[70] w-[280px] rounded-2xl border border-white/10 bg-[#090c13]/98 p-3 text-white shadow-2xl backdrop-blur-xl">
          <div className="mb-2 px-1">
            <p className="text-[10px] font-black uppercase tracking-[0.28em] text-neutral-500">
              {label}
            </p>
          </div>
          <div className="grid gap-2">{children}</div>
        </div>
      )}
    </div>
  );
}

function EditorTopMenu({
  label,
  icon,
  children,
}: {
  label: string;
  icon: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-white/10 bg-white/[0.055] px-3 py-2 text-xs font-black text-neutral-200 transition hover:bg-white/10 [&::-webkit-details-marker]:hidden">
        <span>{icon}</span>
        <span>{label}</span>
        <span className="text-[9px] text-neutral-500 transition group-open:rotate-180">▼</span>
      </summary>
      <div className="absolute right-0 top-[calc(100%+0.5rem)] z-[65] w-72 rounded-2xl border border-white/10 bg-[#090c13]/98 p-3 text-white shadow-2xl backdrop-blur-xl">
        {children}
      </div>
    </details>
  );
}

function TopMenuRow({
  label,
  value,
  valueClassName = "text-white",
}: {
  label: string;
  value: React.ReactNode;
  valueClassName?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl px-3 py-2.5 hover:bg-white/[0.04]">
      <span className="text-xs font-bold text-neutral-500">{label}</span>
      <span className={`max-w-[170px] text-right text-xs font-black ${valueClassName}`}>
        {value}
      </span>
    </div>
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
      {(data.reviewFlagCount ?? 0) > 0 && (
        <div
          title={`${data.reviewFlagCount} moderatiemarkering${data.reviewFlagCount === 1 ? "" : "en"}`}
          style={{
            position: "absolute",
            top: data.isStart ? -88 : -60,
            left: "50%",
            transform: "translateX(-50%)",
            minWidth: 38,
            height: 38,
            borderRadius: 999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
            padding: "0 10px",
            background: data.reviewFlagSeverity === "high" ? "#dc2626" : "#f59e0b",
            color: "white",
            border: "3px solid #111827",
            fontSize: 18,
            fontWeight: 900,
            zIndex: 5,
            boxShadow: "0 8px 24px rgba(0,0,0,.35)",
            pointerEvents: "none",
          }}
        >
          ⚠ {data.reviewFlagCount}
        </div>
      )}

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
      label: "Hoofdstuk 1",
      type: "chapter",
      chapterNumber: "1",
      chapterTitle: "",
      chapterSubtitle: "",
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

  // Hoofdstuk-markers zijn metadata/structuur en blokkeren nooit
  // boekvereisten of pad-validatie. De reader gebruikt alleen hun metadata.
  if (node.data.type === "chapter") {
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
  globalPageOffset,
}: {
  html: string;
  pageIndex: number;
  setPageIndex: React.Dispatch<React.SetStateAction<number>>;
  onPageCountChange: (pageCount: number) => void;
  onVisiblePageCountChange: (visiblePageCount: number) => void;
  globalPageOffset: number;
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
              className="relative h-full overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/95 px-8 pb-20 pt-8 shadow-inner sm:px-12 sm:pb-24 sm:pt-10 md:px-16"
            >
              <div
                className="dibooks-reader-content prose prose-invert max-w-none text-[18px] leading-8 sm:text-[20px] sm:leading-9 [&_p]:mb-6 [&_p]:mt-0 [&_h1]:mb-4 [&_h1]:mt-0 [&_h2]:mb-4 [&_h2]:mt-0 [&_h3]:mb-4 [&_h3]:mt-0"
                dangerouslySetInnerHTML={{ __html: pageHtml }}
              />
              <div
                className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 text-[11px] font-black tabular-nums text-neutral-500"
                aria-hidden="true"
              >
                {globalPageOffset + pageIndex + index + 1}
              </div>
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
  canUseAuthorTools,
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
  canUseAuthorTools: boolean;
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

  if (!canUseAuthorTools) {
    return (
      <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/75 p-4 backdrop-blur-sm sm:p-6">
        <div className="mx-auto max-w-2xl rounded-3xl border border-cyan-400/15 bg-[#080b13] p-5 text-white shadow-2xl sm:p-8">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.30em] text-cyan-300">
                Gratis Studio • proefmodus
              </p>
              <h2 className="mt-2 text-3xl font-black sm:text-4xl">
                Lokaal opslaan
              </h2>
              <p className="mt-3 max-w-xl text-sm font-semibold leading-6 text-neutral-400">
                {isLoggedIn
                  ? "Je Reader/Gratis-account mag de Auteur Studio uitproberen met maximaal 15 verhaalnodes."
                  : "Als gast mag je de Auteur Studio uitproberen met maximaal 15 verhaalnodes."}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl bg-red-600 px-4 py-3 text-sm font-black text-white hover:bg-red-500"
            >
              Sluiten
            </button>
          </div>

          <div className="mt-6 rounded-3xl border border-cyan-400/20 bg-cyan-500/10 p-5">
            <p className="text-sm font-black uppercase tracking-widest text-cyan-200">
              Jouw werkbestand
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-cyan-50/75">
              Download je project als <strong>.dibooks-project.json</strong>.
              Je kunt dit bestand later opnieuw laden. Het wordt niet in je
              DiBooks Dashboard opgeslagen.
            </p>
            <button
              type="button"
              onClick={onDownloadProject}
              className="mt-5 w-full rounded-2xl bg-cyan-500 px-5 py-4 text-sm font-black text-black hover:bg-cyan-400"
            >
              💾 Download lokaal werkbestand
            </button>
          </div>

          <div className="mt-5 rounded-2xl border border-violet-400/20 bg-violet-500/10 p-4">
            <p className="text-sm font-black text-violet-100">
              Author Pro ontgrendelt de volledige Studio
            </p>
            <p className="mt-1 text-xs font-semibold leading-5 text-violet-100/65">
              Onbeperkt verhaalnodes, Dashboard-opslag, reader-export,
              seriesbeheer en de publicatie-/reviewflow.
            </p>
            <button
              type="button"
              onClick={() => {
                window.location.href = isLoggedIn ? "/account" : "/#plannen";
              }}
              className="mt-4 rounded-xl border border-violet-300/25 bg-violet-500/15 px-4 py-3 text-xs font-black text-violet-100 hover:bg-violet-500/25"
            >
              Bekijk Auteur-plan
            </button>
          </div>
        </div>
      </div>
    );
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
                <option value="free">Gratis leesbaar — geen royalty</option>
                <option value="premium">Reader / abonnement — royalty</option>
              </select>
              <p className="mt-2 text-xs font-semibold leading-5 text-neutral-500">
                {form.accessType === "free"
                  ? "Gratis: iedereen kan dit boek lezen. Gratis leestijd bouwt geen royalty op — ideaal als demo, proloog of instapdeel van een serie."
                  : "Reader: alleen Reader Plus, Author Pro of Admin kan dit boek lezen. Geverifieerde leestijd telt mee voor de maandelijkse auteursroyalty’s zodra het royaltysysteem actief is."}
              </p>
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
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpView, setHelpView] = useState<"overview" | "tutorial">("overview");
  const [helpAutoShowDisabled, setHelpAutoShowDisabled] = useState(false);
  const [editorDarkMode, setEditorDarkMode] = useState(false);
  const { isLoggedIn, permissions, loginWithCredentials, registerWithCredentials, logout, user, role } = useDemoAuth();
  const [authModalMode, setAuthModalMode] = useState<"login" | "register" | null>(null);
  const [authInitialPlan, setAuthInitialPlan] = useState<PublicSignupPlan>("free");
  const [saveDashboardOpen, setSaveDashboardOpen] = useState(false);
  const [dashboardSeries, setDashboardSeries] = useState<BookSeries[]>([]);
  const [seriesManagerOpen, setSeriesManagerOpen] = useState(false);
  const [dashboardBookId, setDashboardBookId] = useState<string | null>(null);
  const [sharedEditBookId, setSharedEditBookId] = useState<string | null>(null);
  const [sharedEditOwnerName, setSharedEditOwnerName] = useState<string>("");
  const [sharedEditPermission, setSharedEditPermission] = useState<string>("");
  const [reviewSubmissionId, setReviewSubmissionId] = useState<string | null>(null);
  const [reviewSubmission, setReviewSubmission] = useState<ModerationSubmissionDetail | null>(null);
  const [reviewFlags, setReviewFlags] = useState<ModerationFlag[]>([]);
  const [reviewAlertsCollapsed, setReviewAlertsCollapsed] = useState(false);
  const [reviewInspectorOpen, setReviewInspectorOpen] = useState(false);
  const [reviewActionBusy, setReviewActionBusy] = useState(false);
  const [dashboardSaveForm, setDashboardSaveForm] = useState<DashboardSaveForm>(defaultDashboardSaveForm);
  const [startNodeId, setStartNodeId] = useState<string>("node_1");
  const [editingTextNodeId, setEditingTextNodeId] = useState<string | null>(
    null,
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewNodeId, setPreviewNodeId] = useState<string | null>(null);
  const [previewPageIndex, setPreviewPageIndex] = useState(0);
  const [previewPageCount, setPreviewPageCount] = useState(1);
  const [previewGlobalPageOffset, setPreviewGlobalPageOffset] = useState(0);
  const [readerVisiblePageCount, setReaderVisiblePageCount] = useState(1);
  const flowWrapperRef = useRef<HTMLDivElement | null>(null);
  const reviewFlowInstanceRef = useRef<any>(null);
  const reviewInspectionAsideRef = useRef<HTMLElement | null>(null);
  const [flowViewport, setFlowViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const nodeTypes = useMemo(() => ({ bullet: BulletNode }), []);

  useEffect(() => {
    const disabled =
      window.localStorage.getItem(
        "dibooks-editor-help-auto-show-disabled",
      ) === "1";

    setHelpAutoShowDisabled(disabled);

    if (!disabled) {
      setHelpOpen(true);
    }
  }, []);

  function toggleHelpAutoShow() {
    setHelpAutoShowDisabled((current) => {
      const next = !current;

      window.localStorage.setItem(
        "dibooks-editor-help-auto-show-disabled",
        next ? "1" : "0",
      );

      return next;
    });
  }
  const maxNodesForCurrentUser = getMaxNodesForUser(user);
  const runtimeNodeCount = getStoryNodes(nodes).length;
  const functionNodeCount = nodes.filter((node) => node.data.type === "function").length;
  const conditionNodeCount = nodes.filter((node) => node.data.type === "condition").length;
  const chapterNodeCount = nodes.filter((node) => node.data.type === "chapter").length;
  // Structuurnodes (functie / IF / hoofdstuk) tellen niet mee voor
  // verhaalnode-limieten of de vereisten van een boek.
  const storyNodeCount =
    runtimeNodeCount - functionNodeCount - conditionNodeCount - chapterNodeCount;
  const scratchpadNodeCount = nodes.length - runtimeNodeCount;
  const nodeLimitReached = maxNodesForCurrentUser !== null && storyNodeCount >= maxNodesForCurrentUser;
  const autosaveReadyRef = useRef(false);
  const lastAutosavePayloadRef = useRef<string>("");
  const [autosaveStatus, setAutosaveStatus] = useState("Sessiesave wordt geladen...");
  const [cutsceneUploadStatus, setCutsceneUploadStatus] = useState("");
  const [storyVariables, setStoryVariables] = useState<StoryVariable[]>([]);
  const [variablesOpen, setVariablesOpen] = useState(false);
  const [sidebarGroupOpen, setSidebarGroupOpen] = useState<SidebarGroupId | null>(null);
  const [previewVariableValues, setPreviewVariableValues] = useState<Record<string, StoryVariableValue>>({});
  const reviewMode = Boolean(reviewSubmissionId);
  const isStudioTrial =
    !reviewMode &&
    maxNodesForCurrentUser !== null &&
    !permissions.canSaveToDashboard;

  useEffect(() => {
    const savedMode = window.localStorage.getItem("dibooks-editor-dark-grid");
    if (savedMode === "true") setEditorDarkMode(true);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("dibooks-editor-dark-grid", String(editorDarkMode));
  }, [editorDarkMode]);

  useEffect(() => {
    if (!user?.name && !user?.authorName) return;

    setDashboardSaveForm((current) =>
      current.author.trim()
        ? current
        : {
            ...current,
            author: user?.authorName || user?.name || "",
          },
    );
  }, [user?.authorName, user?.name]);

  useEffect(() => {
    let cancelled = false;

    async function loadSeries() {
      if (!user || !permissions.canUseDashboard) {
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
  }, [permissions.canUseDashboard, user]);


  useEffect(() => {
    let cancelled = false;

    async function openDashboardBook() {
      const params = new URLSearchParams(window.location.search);
      const reviewId = params.get("review");
      const sharedBookId = params.get("shared");
      const bookId = params.get("book");

      if (reviewId) {
        setReviewSubmissionId(reviewId);
        // Nieuwe review = altijd eerst schone lokale reviewstate.
        // Zo kunnen flags van een eerder geopende/rejected submission nooit
        // de goedkeuringsknop van deze submission blokkeren.
        setReviewSubmission(null);
        setReviewFlags([]);
        setSelectedNodeId(null);
        setReviewInspectorOpen(false);

        if (!user) {
          autosaveReadyRef.current = false;
          setAutosaveStatus("Reviewmodus wacht op adminlogin...");
          return;
        }

        try {
          setAutosaveStatus("Adminrechten controleren...");

          const hasAdminAccess = await verifyCurrentUserIsAdmin(user);
          if (cancelled) return;

          if (!hasAdminAccess) {
            alert("Alleen DiBooks admins kunnen een boek in reviewmodus openen.");
            window.location.href = "/";
            return;
          }

          const submission = await fetchAdminModerationSubmission(user, reviewId);
          if (cancelled || !submission) {
            if (!submission) alert("Deze moderatie-inzending bestaat niet meer.");
            return;
          }

          const snapshot = submission.snapshot ?? {};
          const snapshotBook = snapshot.book ?? {};
          const projectData = await resolveProjectCutsceneUrls(snapshot.projectData ?? {});
          const projectNodes = Array.isArray(projectData?.nodes) ? projectData.nodes : [];
          const safeStartNodeId = getSafeStartNodeId(projectNodes, projectData?.startNodeId ?? projectNodes?.[0]?.id ?? "");

          setReviewSubmission(submission);
          setReviewFlags(submission.flags ?? []);
          setReviewAlertsCollapsed(false);
          setReviewInspectorOpen(false);
          setHelpOpen(false);
          setDashboardBookId(null);
          setSharedEditBookId(null);
          setSharedEditOwnerName("");
          setSharedEditPermission("");
          setDashboardSaveForm({
            title: snapshotBook.title ?? submission.bookTitle ?? "",
            author: snapshotBook.author ?? submission.bookAuthor ?? "",
            subtitle: snapshotBook.subtitle ?? "",
            description: snapshotBook.description ?? "",
            genres: Array.isArray(snapshotBook.genres) && snapshotBook.genres.length > 0 ? snapshotBook.genres : ["Interactief"],
            genreInput: "",
            primaryGenre: snapshotBook.primary_genre ?? snapshotBook.primaryGenre ?? snapshotBook.genres?.[0] ?? "Interactief",
            status: (snapshotBook.status as any) ?? "Concept",
            ageRating: snapshotBook.age_rating ?? snapshotBook.ageRating ?? "12+",
            readTime: snapshotBook.read_time ?? snapshotBook.readTime ?? "Concept",
            colorTheme: snapshotBook.color_theme ?? snapshotBook.colorTheme ?? "blue",
            accessType: snapshotBook.access_type === "premium" ? "premium" : "free",
            seriesId: snapshotBook.series_id ?? "",
            seriesOrder: snapshotBook.series_order ? String(snapshotBook.series_order) : "1",
          });
          setNodes(projectNodes);
          setEdges(projectData?.edges ?? []);
          setStartNodeId(safeStartNodeId);
          setSelectedNodeId((safeStartNodeId || projectNodes?.[0]?.id) ?? null);
          setStoryVariables(Array.isArray(projectData?.variables) ? projectData.variables : []);
          autosaveReadyRef.current = false;
          setAutosaveStatus("🔒 Reviewmodus • geen wijzigingen opgeslagen");
          return;
        } catch (reviewError) {
          console.error("Kon reviewversie niet openen", reviewError);
          alert(reviewError instanceof Error ? `Review openen mislukt: ${reviewError.message}` : "Review openen mislukt.");
          return;
        }
      }

      setReviewSubmissionId(null);
      setReviewSubmission(null);
      setReviewFlags([]);

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

      if (!permissions.canEditConceptBook) {
        alert(
          "Een actief Auteur-plan is nodig om Dashboardboeken of gedeelde concepten in de editor te wijzigen. De gratis Studio blijft beschikbaar voor lokale projecten tot 15 verhaalnodes.",
        );
        window.location.href = "/editor";
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
          author: dashboardBook.author ?? user.authorName ?? user.name ?? "",
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
  }, [role, setEdges, setNodes, user]);

  useEffect(() => {
    if (reviewMode) return;
    if (!autosaveReadyRef.current) return;

    const timeout = window.setTimeout(() => {
      writeEditorAutosaveDraft();
    }, 900);

    return () => window.clearTimeout(timeout);
  }, [nodes, edges, startNodeId, selectedNodeId, dashboardSaveForm, dashboardBookId, sharedEditBookId, sharedEditOwnerName, sharedEditPermission, flowViewport, storyVariables, reviewMode]);

  useEffect(() => {
    function saveBeforeLeaving() {
      if (reviewMode) return;
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
  }, [nodes, edges, startNodeId, selectedNodeId, dashboardSaveForm, dashboardBookId, sharedEditBookId, sharedEditOwnerName, sharedEditPermission, flowViewport, storyVariables, reviewMode]);

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

  const previewGlobalPageStart =
    previewGlobalPageOffset + previewPageIndex + 1;
  const previewVisibleGlobalPageCount = Math.max(
    1,
    Math.min(
      readerVisiblePageCount,
      Math.max(1, previewPageCount - previewPageIndex),
    ),
  );
  const previewGlobalPageEnd =
    previewGlobalPageStart + previewVisibleGlobalPageCount - 1;

  useEffect(() => {
    if (!previewOpen || previewNode?.data.type !== "chapter") return;

    const chapterPaths = getStoryEdges(edges, nodes).filter(
      (edge) => edge.source === previewNode.id,
    );

    if (chapterPaths.length !== 1) return;

    const nextTarget = nodes.find((node) => node.id === chapterPaths[0].target);
    if (!nextTarget || isScratchpadNode(nextTarget)) return;

    setPreviewNodeId(nextTarget.id);
    setPreviewPageIndex(0);
    setPreviewPageCount(1);
    setReaderVisiblePageCount(1);
  }, [edges, nodes, previewNode, previewOpen]);

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

  // Alleen flags van de ACTIEVE submission mogen ooit tellen. Oudere
  // reviewmeldingen zijn historisch en horen niet bij een nieuwe inzending.
  const activeReviewFlags = reviewSubmission
    ? reviewFlags.filter(
        (flag) => !flag.submissionId || flag.submissionId === reviewSubmission.submissionId,
      )
    : [];

  const selectedReviewFlags = selectedNode
    ? activeReviewFlags.filter((flag) => flag.nodeId === selectedNode.id)
    : [];

  const reviewScanComplete = reviewSubmission?.aiScanStatus === "completed";

  function getReviewFlagKey(flag: ModerationFlag) {
    return flag.flagId || `${flag.nodeId}-${flag.category}-${flag.reason}`;
  }

  const isReviewFlagCleared = (flag: ModerationFlag) =>
    String(flag.resolution ?? "pending").toLowerCase() === "cleared";

  const severeReviewFlags = activeReviewFlags.filter(
    (flag) => String(flag.severity ?? "").toLowerCase() === "high",
  );
  const attentionReviewFlags = activeReviewFlags.filter(
    (flag) => String(flag.severity ?? "").toLowerCase() !== "high",
  );
  const orderedReviewFlags = [...severeReviewFlags, ...attentionReviewFlags];
  const unresolvedReviewFlags = orderedReviewFlags.filter(
    (flag) => !isReviewFlagCleared(flag),
  );
  const unresolvedReviewFlagCount = unresolvedReviewFlags.length;
  const clearedReviewFlagCount = activeReviewFlags.length - unresolvedReviewFlagCount;

  const flowNodes = nodes.map((node) => {
    const nodeFlags = activeReviewFlags.filter((flag) => flag.nodeId === node.id);
    const severity = nodeFlags.some((flag) => flag.severity === "high")
      ? "high"
      : nodeFlags.some((flag) => flag.severity === "medium")
        ? "medium"
        : nodeFlags[0]?.severity;

    return {
      ...node,
      draggable: !reviewMode,
      data: {
        ...node.data,
        isStart: node.id === startNodeId,
        reviewFlagCount: nodeFlags.length,
        reviewFlagSeverity: severity,
      },
    };
  });

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
    const maxNodes = getMaxNodesForUser(user);
    const limitedNodeCount = countLimitedStoryNodes(projectNodes);

    if (maxNodes !== null && limitedNodeCount > maxNodes) {
      setAutosaveStatus(
        `Sessiesave geblokkeerd • ${limitedNodeCount}/${maxNodes} verhaalnodes • Auteur-plan nodig`,
      );
      return false;
    }

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
    setAuthInitialPlan("free");
    setAuthModalMode("login");
  }

  function openAuthorUpgrade() {
    if (isLoggedIn) {
      window.open("/#plannen", "_blank", "noopener,noreferrer");
      return;
    }

    setAuthInitialPlan("author_pro");
    setAuthModalMode("register");
  }

  function handleDemoLogout() {
    const confirmed = window.confirm(
      "Weet je zeker dat je wilt uitloggen? Vergeet niet eerst lokaal op te slaan of in je Dashboard op te slaan.",
    );

    if (!confirmed) return;

    logout();
  }

  async function saveCurrentBookToDashboard() {
    if (reviewMode) {
      alert("Reviewmodus is alleen-lezen. De bevroren inzending kan niet worden gewijzigd.");
      return;
    }

    if (!user) {
      alert("Je gebruikt de gratis Studio als gast. Je kunt je project alleen lokaal downloaden. Author Pro is nodig voor Dashboard-opslag.");
      return;
    }

    if (!permissions.canSaveToDashboard) {
      alert(
        "Dashboard-opslag is onderdeel van Author Pro. Je huidige project kun je wel lokaal als .dibooks-project.json bewaren.",
      );
      return;
    }

    if (!sharedEditBookId && !permissions.canSaveToDashboard) {
      alert("Je moet ingelogd zijn als auteur om op te slaan in je Dashboard. Download je werkbestand lokaal of log eerst in.");
      setAuthModalMode("login");
      return;
    }

    const maxNodes = getMaxNodesForUser(user);
    if (!sharedEditBookId && maxNodes !== null && storyNodeCount > maxNodes) {
      alert(`Gratis accounts kunnen maximaal ${FREE_NODE_LIMIT} verhaalnodes opslaan in Dashboard. Kladblok-, functie-, voorwaarde- en hoofdstuk-markers tellen niet mee. Verwijder verhaalnodes of upgrade later naar Author Pro voor onbeperkt bouwen.`);
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
        author: dashboardSaveForm.author.trim() || user.authorName || user.name || "Onbekende auteur",
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
        const maxNodes = getMaxNodesForUser(user);
        const limitedNodeCount = countLimitedStoryNodes(projectNodes);

        if (maxNodes !== null && limitedNodeCount > maxNodes) {
          alert(
            `Dit project bevat ${limitedNodeCount} verhaalnodes. De gratis Studio ondersteunt maximaal ${maxNodes}. Activeer Author Pro om grotere projecten te openen en bewerken.`,
          );
          return;
        }

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
    setPreviewGlobalPageOffset(0);
    setReaderVisiblePageCount(1);
    setPreviewOpen(true);
  }

  function closePreview() {
    setPreviewOpen(false);
    setPreviewNodeId(null);
    setPreviewPageIndex(0);
    setPreviewPageCount(1);
    setPreviewGlobalPageOffset(0);
    setReaderVisiblePageCount(1);
    setPreviewVariableValues({});
  }

  function goToPreviewNode(
    nodeId: string,
    completedTextPageCount = 0,
  ) {
    const targetNode = nodes.find((node) => node.id === nodeId);

    if (!targetNode || isScratchpadNode(targetNode)) {
      alert("Deze doel-node bestaat niet meer of is een kladblok-node.");
      return;
    }

    // Alleen een volledig verlaten tekstflow verhoogt de globale teller.
    // Keuzes, minigames, cutscenes, IF/Function en hoofdstuk-markers
    // zijn geen fysieke readerpagina's.
    if (completedTextPageCount > 0) {
      setPreviewGlobalPageOffset(
        (current) =>
          current + Math.max(1, Math.floor(completedTextPageCount)),
      );
    }

    setPreviewNodeId(nodeId);
    setPreviewPageIndex(0);
    setPreviewPageCount(1);
    setReaderVisiblePageCount(1);
  }

  function createNode(type: DiNodeType) {
    const maxNodes = getMaxNodesForUser(user);
    const isUtilityNode =
      type === "scratchpad" ||
      type === "function" ||
      type === "condition" ||
      type === "chapter";
    if (!isUtilityNode && maxNodes !== null && storyNodeCount >= maxNodes) {
      alert(`De proefmodus ondersteunt maximaal ${FREE_NODE_LIMIT} verhaalnodes. Kladblok-, functie-, voorwaarde- en hoofdstuk-markers tellen niet mee. Met het Auteur-plan kun je onbeperkt verder bouwen.`);
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
        chapterNumber: type === "chapter" ? "" : undefined,
        chapterTitle: type === "chapter" ? "" : undefined,
        chapterSubtitle: type === "chapter" ? "" : undefined,
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

  function updateSelectedChapterData(
    updates: Pick<
      Partial<DiNodeData>,
      "chapterNumber" | "chapterTitle" | "chapterSubtitle"
    >,
  ) {
    if (!selectedNodeId) return;

    setNodes((currentNodes) =>
      currentNodes.map((node) => {
        if (node.id !== selectedNodeId || node.data.type !== "chapter") {
          return node;
        }

        const nextData = {
          ...node.data,
          ...updates,
        };

        const number = String(nextData.chapterNumber ?? "").trim();
        const title = String(nextData.chapterTitle ?? "").trim();
        const generatedLabel = number
          ? `Hoofdstuk ${number}${title ? ` — ${title}` : ""}`
          : title
            ? `Hoofdstuk — ${title}`
            : "Hoofdstuk";

        return {
          ...node,
          data: {
            ...nextData,
            label: generatedLabel,
          },
        };
      }),
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

      if (!user?.id || !permissions.canSaveToDashboard) {
        alert(
          "Uploads naar DiBooks Storage zijn onderdeel van Author Pro. In de gratis Studio kun je voor een proefcutscene wel een externe video-URL gebruiken.",
        );
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

    const isSinglePathNode =
      sourceNode?.data.type === "function" || sourceNode?.data.type === "chapter";
    const maxOutgoingPaths = isSinglePathNode ? 1 : 10;

    if (existingOutgoingEdges.length >= maxOutgoingPaths) {
      alert(
        sourceNode?.data.type === "function"
          ? "Een functie-node gebruikt één vervolgpath. Verwijder eerst de bestaande path."
          : sourceNode?.data.type === "chapter"
            ? "Een hoofdstuk-marker gebruikt precies één vervolgpath. Verwijder eerst de bestaande path."
            : "Deze node heeft al het maximale aantal van 10 paths.",
      );
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
          chapterNumber: node.data.chapterNumber ?? "",
          chapterTitle: node.data.chapterTitle ?? "",
          chapterSubtitle: node.data.chapterSubtitle ?? "",
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

  function jumpToReviewFlag(flag: ModerationFlag) {
    const targetNode = nodes.find((node) => node.id === flag.nodeId);

    if (!targetNode) {
      alert(`De gemarkeerde node ${flag.nodeId} bestaat niet in deze review-snapshot.`);
      return;
    }

    setSelectedNodeId(targetNode.id);
    setReviewInspectorOpen(true);

    window.requestAnimationFrame(() => {
      const instance = reviewFlowInstanceRef.current;
      if (instance?.setCenter) {
        instance.setCenter(
          Number(targetNode.position?.x ?? 0),
          Number(targetNode.position?.y ?? 0),
          {
            zoom: 1.05,
            duration: 450,
          },
        );
      }

      reviewInspectionAsideRef.current?.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    });
  }

  function jumpToNextReviewFlag() {
    const nextFlag = unresolvedReviewFlags[0] ?? orderedReviewFlags[0];
    if (nextFlag) jumpToReviewFlag(nextFlag);
  }

  async function handleClearReviewFlag(flag: ModerationFlag) {
    if (!user || !flag.flagId || reviewActionBusy) return;
    if (isReviewFlagCleared(flag)) return;

    setReviewActionBusy(true);

    try {
      await clearModerationFlag(user, flag.flagId);
      setReviewFlags((current) =>
        current.map((item) =>
          item.flagId === flag.flagId
            ? {
                ...item,
                resolution: "cleared",
                reviewedBy: user.id,
                reviewedAt: new Date().toISOString(),
                reviewNote: "",
              }
            : item,
        ),
      );
    } catch (clearError) {
      console.error(clearError);
      alert(
        `Melding afhandelen mislukt: ${
          clearError instanceof Error ? clearError.message : "onbekende fout"
        }`,
      );
    } finally {
      setReviewActionBusy(false);
    }
  }

  async function handleReopenReviewFlag(flag: ModerationFlag) {
    if (!user || !flag.flagId || reviewActionBusy) return;
    if (!isReviewFlagCleared(flag)) return;

    setReviewActionBusy(true);

    try {
      await reopenModerationFlag(user, flag.flagId);
      setReviewFlags((current) =>
        current.map((item) =>
          item.flagId === flag.flagId
            ? {
                ...item,
                resolution: "pending",
                reviewedBy: undefined,
                reviewedAt: undefined,
                reviewNote: "",
              }
            : item,
        ),
      );
    } catch (reopenError) {
      console.error(reopenError);
      alert(
        `Melding heropenen mislukt: ${
          reopenError instanceof Error ? reopenError.message : "onbekende fout"
        }`,
      );
    } finally {
      setReviewActionBusy(false);
    }
  }

  async function handleReviewDecision(decision: "approved" | "rejected") {
    if (!user || !reviewSubmission) return;
    if (reviewSubmission.status !== "pending") {
      alert("Deze inzending is al verwerkt.");
      return;
    }

    if (decision === "approved" && !reviewScanComplete) {
      alert(
        reviewSubmission.aiScanStatus === "failed"
          ? "De AI-scan van deze inzending is mislukt. Ga terug naar Boekmoderatie en klik op AI opnieuw scannen."
          : "Deze inzending heeft nog geen afgeronde AI-scan. Rond de DeepSeek-scan eerst af.",
      );
      return;
    }

    if (decision === "approved" && unresolvedReviewFlagCount > 0) {
      alert(
        `Je kunt dit boek nog niet goedkeuren. Handel eerst alle ${unresolvedReviewFlagCount} openstaande moderatiemelding${unresolvedReviewFlagCount === 1 ? "" : "en"} af.`,
      );
      jumpToNextReviewFlag();
      return;
    }

    let feedback = "";
    if (decision === "rejected") {
      feedback = window.prompt(
        "Waarom wijs je dit boek af? Deze feedback wordt naar de auteur gestuurd:",
        "",
      )?.trim() ?? "";
      if (!feedback) {
        alert("Feedback is verplicht bij afwijzen.");
        return;
      }
    } else if (severeReviewFlags.length > 0) {
      feedback = window.prompt(
        `Dit boek bevat ${severeReviewFlags.length} ernstige moderatiemelding${severeReviewFlags.length === 1 ? "" : "en"} die je hebt beoordeeld en toegestaan. Geef één korte algemene motivatie waarom het boek toch gepubliceerd mag worden:`,
        "",
      )?.trim() ?? "";

      if (!feedback) {
        alert("Bij een boek met ernstige meldingen is één algemene motivatie verplicht.");
        return;
      }
    } else {
      const confirmed = window.confirm(
        `"${reviewSubmission.bookTitle}" goedkeuren? Exact deze bevroren reviewversie wordt live gepubliceerd.`,
      );
      if (!confirmed) return;
    }

    setReviewActionBusy(true);
    try {
      await reviewModerationSubmission(user, reviewSubmission.submissionId, decision, feedback);
      alert(decision === "approved" ? "Boek goedgekeurd en gepubliceerd." : "Boek afgewezen. De auteur heeft je feedback ontvangen.");
      window.location.href = "/admin/moderation";
    } catch (reviewError) {
      console.error(reviewError);
      alert(reviewError instanceof Error ? reviewError.message : "Moderatiebeslissing kon niet worden opgeslagen.");
    } finally {
      setReviewActionBusy(false);
    }
  }

  function downloadReaderStoryFile() {
    if (!permissions.canPublishBook) {
      alert(
        "Reader-export en publiceren zijn onderdeel van Author Pro. In de gratis Studio kun je alleen het lokale .dibooks-project.json werkbestand downloaden.",
      );
      return;
    }

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
        <aside className="relative flex w-24 flex-col items-center border-r-4 border-black bg-neutral-950 p-3">
          {reviewMode && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-neutral-950/70 backdrop-blur-[1px]" title="Reviewmodus is alleen-lezen">
              <div className="-rotate-90 whitespace-nowrap rounded-full border border-purple-400/30 bg-purple-500/15 px-4 py-2 text-[10px] font-black uppercase tracking-widest text-purple-200">🔒 Alleen lezen</div>
            </div>
          )}
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
            <SidebarGroupButton
              open={sidebarGroupOpen === "text"}
              onToggle={() =>
                setSidebarGroupOpen((current) => (current === "text" ? null : "text"))
              }
              label="Tekst & schrijven"
              className="bg-blue-600 text-white hover:bg-blue-500"
              icon={<BookIcon />}
            >
              <SidebarMenuItem
                title="Normale tekst"
                description="Gewone leesbare verhaalpagina."
                accentClass="bg-blue-600 text-white"
                icon={<BookIcon />}
                onClick={() => {
                  setSidebarGroupOpen(null);
                  createNode("text");
                }}
              />
              <SidebarMenuItem
                title="Speciale tekst"
                description="Bijv. logboek, dossier, brief of dagboek."
                accentClass="bg-yellow-500 text-black"
                icon={<BookIcon sparkle />}
                onClick={() => {
                  setSidebarGroupOpen(null);
                  createNode("special");
                }}
              />
              <SidebarMenuItem
                title="Hoofdstuk-marker"
                description="Markeert een nieuw hoofdstuk zonder een reader-pagina te tonen."
                accentClass="bg-rose-600 text-white"
                icon={<span className="text-sm font-black">H</span>}
                onClick={() => {
                  setSidebarGroupOpen(null);
                  createNode("chapter");
                }}
              />
              <SidebarMenuItem
                title="Kladblok / lore"
                description="Interne notities; verschijnt nooit in het verhaal."
                accentClass="bg-white text-slate-950"
                icon={<ScratchpadIcon />}
                onClick={() => {
                  setSidebarGroupOpen(null);
                  createNode("scratchpad");
                }}
              />
            </SidebarGroupButton>

            <SidebarGroupButton
              open={sidebarGroupOpen === "media"}
              onToggle={() =>
                setSidebarGroupOpen((current) => (current === "media" ? null : "media"))
              }
              label="Media & interactie"
              className="bg-emerald-600 text-white hover:bg-emerald-500"
              icon={<VideoIcon />}
            >
              <SidebarMenuItem
                title="Cutscene"
                description="Video of filmfragment tussen verhaalonderdelen."
                accentClass="bg-green-600 text-white"
                icon={<VideoIcon />}
                onClick={() => {
                  setSidebarGroupOpen(null);
                  createNode("cutscene");
                }}
              />
              <SidebarMenuItem
                title="Minigame"
                description="Interactieve opdracht met succes- en failroute."
                accentClass="bg-purple-600 text-white"
                icon={<JoystickIcon />}
                onClick={() => {
                  setSidebarGroupOpen(null);
                  createNode("minigame");
                }}
              />
              <SidebarMenuItem
                title="Keuzemenu"
                description="Laat de lezer uit meerdere routes kiezen."
                accentClass="bg-orange-500 text-white"
                icon={
                  <span className="text-[10px] font-black tracking-tight">ABC</span>
                }
                onClick={() => {
                  setSidebarGroupOpen(null);
                  createNode("choice");
                }}
              />
            </SidebarGroupButton>

            <SidebarGroupButton
              open={sidebarGroupOpen === "logic"}
              onToggle={() =>
                setSidebarGroupOpen((current) => (current === "logic" ? null : "logic"))
              }
              label="Logica & tools"
              className="bg-cyan-600 text-white hover:bg-cyan-500"
              icon={<FunctionIcon />}
            >
              <SidebarMenuItem
                title="Flags & variabelen"
                description="Beheer centrale booleans, getallen en tekstwaarden."
                accentClass="bg-indigo-600 text-white"
                icon={<FlagVariablesIcon />}
                onClick={() => {
                  setSidebarGroupOpen(null);
                  setVariablesOpen(true);
                }}
              />
              <SidebarMenuItem
                title="Functie"
                description="Verander variabelen tijdens het verhaal."
                accentClass="bg-cyan-500 text-slate-950"
                icon={<FunctionIcon />}
                onClick={() => {
                  setSidebarGroupOpen(null);
                  createNode("function");
                }}
              />
              <SidebarMenuItem
                title="Voorwaarde / IF"
                description="Stuur de route op basis van een variabele."
                accentClass="bg-teal-600 text-white"
                icon={<ConditionIcon />}
                onClick={() => {
                  setSidebarGroupOpen(null);
                  createNode("condition");
                }}
              />
            </SidebarGroupButton>

            <SidebarGroupButton
              open={sidebarGroupOpen === "project"}
              onToggle={() =>
                setSidebarGroupOpen((current) => (current === "project" ? null : "project"))
              }
              label="Project"
              className="bg-sky-700 text-white hover:bg-sky-600"
              icon={<FolderIcon />}
            >
              <SidebarMenuItem
                title="Opslaan"
                description="Open het DiBooks opslaan- en exportmenu."
                accentClass="bg-cyan-600 text-white"
                icon={<SaveIcon />}
                onClick={() => {
                  setSidebarGroupOpen(null);
                  saveProject();
                }}
              />

              <label className="group flex w-full cursor-pointer items-center gap-3 rounded-xl border border-white/8 bg-white/[0.035] p-3 text-left transition hover:border-white/15 hover:bg-white/[0.075]">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-700 text-white">
                  <span className="flex h-6 w-6 items-center justify-center">
                    <FolderIcon />
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black text-white">Project laden</span>
                  <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-neutral-500">
                    Open een lokale DiBooks projectfile.
                  </span>
                </span>
                <input
                  type="file"
                  accept=".json,.dibooks-project.json"
                  onChange={(event) => {
                    setSidebarGroupOpen(null);
                    loadProject(event);
                  }}
                  className="hidden"
                />
              </label>

            </SidebarGroupButton>

            <SidebarButton
              onClick={() => {
                setSidebarGroupOpen(null);
                openPreview();
              }}
              label="Hele boek previewen"
              icon={<PlayIcon />}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
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
          <div
            className={`flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-black/15 px-4 py-2.5 sm:px-5 ${
              editorDarkMode
                ? "bg-slate-950/70 text-white"
                : "bg-[#fffaf0]/90 text-neutral-950"
            }`}
          >
            <div className="min-w-0 flex-1">
              <p
                className={`text-[9px] font-black uppercase tracking-[0.25em] ${
                  editorDarkMode ? "text-cyan-300" : "text-blue-700"
                }`}
              >
                Auteur Studio
              </p>
              <h1 className="truncate text-lg font-black sm:text-xl">
                {dashboardSaveForm.title.trim() || "Naamloos boek"}
              </h1>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {isStudioTrial && (
                <>
                  <div
                    className="flex items-center gap-2 rounded-xl border border-cyan-400/20 bg-cyan-500/10 px-3 py-2 text-xs font-black text-cyan-100"
                    title="Gratis proefmodus: maximaal 15 echte verhaalnodes. Function, IF, hoofdstuk-markers en kladblokken tellen niet mee."
                  >
                    <span className="text-cyan-300">Proefmodus</span>
                    <span className="tabular-nums text-white">
                      {storyNodeCount}/{FREE_NODE_LIMIT}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={openAuthorUpgrade}
                    className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-black text-white shadow-lg shadow-violet-950/25 transition hover:-translate-y-0.5 hover:bg-violet-500"
                    title="Auteur-plan: onbeperkt bouwen, Dashboard-opslag en publiceren"
                  >
                    Auteur worden
                  </button>
                </>
              )}

              <EditorTopMenu label="Opslag" icon="💾">
                <div className="grid gap-1">
                  <TopMenuRow
                    label="Werkmodus"
                    value={
                      reviewMode
                        ? "🔒 Admin review"
                        : sharedEditBookId
                          ? "Voorstelmodus"
                          : permissions.canUseDashboard
                            ? "Dashboard"
                            : "Lokaal • proefmodus"
                    }
                    valueClassName={
                      reviewMode
                        ? "text-purple-300"
                        : permissions.canUseDashboard
                          ? "text-emerald-300"
                          : "text-yellow-300"
                    }
                  />
                  <TopMenuRow label="Sessiesave" value={autosaveStatus} valueClassName="text-emerald-300" />
                  <TopMenuRow
                    label="Dashboardconcept"
                    value={dashboardBookId ? "Gekoppeld ✓" : "Niet gekoppeld"}
                    valueClassName={dashboardBookId ? "text-blue-300" : "text-neutral-400"}
                  />
                  {sharedEditBookId && (
                    <TopMenuRow
                      label="Gedeeld door"
                      value={sharedEditOwnerName || "Eigenaar"}
                      valueClassName="text-yellow-200"
                    />
                  )}
                  <div className="mt-2 border-t border-white/10 pt-2">
                    <button
                      type="button"
                      onClick={saveProject}
                      disabled={reviewMode}
                      className="w-full rounded-xl bg-cyan-600 px-3 py-2.5 text-xs font-black text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      💾 Opslaan / exporteren
                    </button>
                  </div>
                </div>
              </EditorTopMenu>

              <EditorTopMenu label="Structuur" icon="◫">
                <div className="grid gap-1">
                  <TopMenuRow
                    label="Verhaalnodes"
                    value={
                      maxNodesForCurrentUser !== null
                        ? `${storyNodeCount} / ${maxNodesForCurrentUser}`
                        : storyNodeCount
                    }
                    valueClassName={
                      maxNodesForCurrentUser !== null
                        ? "text-cyan-200"
                        : "text-white"
                    }
                  />
                  <TopMenuRow label="Paths" value={getStoryEdges(edges, nodes).length} />
                  <TopMenuRow label="Variabelen" value={storyVariables.length} valueClassName="text-indigo-200" />
                  <TopMenuRow label="Functies" value={functionNodeCount} valueClassName="text-cyan-200" />
                  <TopMenuRow label="Voorwaarden / IF" value={conditionNodeCount} valueClassName="text-teal-200" />
                  <TopMenuRow label="Hoofdstukken" value={chapterNodeCount} valueClassName="text-rose-200" />
                  <TopMenuRow label="Kladblokken" value={scratchpadNodeCount} />
                  {!reviewMode && (
                    <div className="mt-2 border-t border-white/10 pt-2">
                      <button
                        type="button"
                        onClick={() => setVariablesOpen(true)}
                        className="w-full rounded-xl border border-indigo-400/20 bg-indigo-500/10 px-3 py-2.5 text-xs font-black text-indigo-100 hover:bg-indigo-500/20"
                      >
                        ⚑ Flags & variabelen openen
                      </button>
                    </div>
                  )}
                </div>
              </EditorTopMenu>

              <AppNavActions compact />
            </div>
          </div>
          {reviewMode && reviewSubmission && (
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-purple-400/20 bg-purple-500/10 px-5 py-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.25em] text-purple-200">🛡️ Reviewmodus • alleen lezen</p>
                <p className="mt-1 text-xs font-semibold text-neutral-300">Ingediend door {reviewSubmission.ownerName} • {activeReviewFlags.length} actuele melding{activeReviewFlags.length === 1 ? "" : "en"}</p>
                <p className={`mt-1 text-[11px] font-black ${
                  reviewSubmission.aiScanStatus === "completed"
                    ? "text-cyan-300"
                    : reviewSubmission.aiScanStatus === "failed"
                      ? "text-red-300"
                      : "text-amber-300"
                }`}>
                  {reviewSubmission.aiScanStatus === "completed"
                    ? `✨ DeepSeek-scan afgerond • ${reviewSubmission.aiChangedNodeCount ?? 0} nieuw/gewijzigd • ${reviewSubmission.aiReusedNodeCount ?? 0} hergebruikt`
                    : reviewSubmission.aiScanStatus === "running"
                      ? "✨ DeepSeek-scan bezig..."
                      : reviewSubmission.aiScanStatus === "failed"
                        ? "⚠ DeepSeek-scan mislukt — opnieuw scannen via Boekmoderatie"
                        : "⚠ DeepSeek-scan ontbreekt — eerst scannen via Boekmoderatie"}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button onClick={openPreview} className="rounded-xl border border-blue-400/30 bg-blue-500/15 px-4 py-2 text-xs font-black text-blue-100 hover:bg-blue-500/25">▶ Hele boek previewen</button>
                <button disabled={reviewActionBusy || reviewSubmission.status !== "pending"} onClick={() => handleReviewDecision("rejected")} className="rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2 text-xs font-black text-red-100 hover:bg-red-500/25 disabled:opacity-40">✕ Afwijzen + feedback</button>
                <button
                  disabled={
                    reviewActionBusy ||
                    reviewSubmission.status !== "pending" ||
                    !reviewScanComplete ||
                    unresolvedReviewFlagCount > 0
                  }
                  onClick={() => handleReviewDecision("approved")}
                  title={
                    !reviewScanComplete
                      ? "De AI-scan van deze submission moet eerst succesvol zijn afgerond"
                      : unresolvedReviewFlagCount > 0
                        ? `Nog ${unresolvedReviewFlagCount} moderatiemelding${unresolvedReviewFlagCount === 1 ? "" : "en"} afhandelen`
                        : "Goedkeuren en publiceren"
                  }
                  className="rounded-xl bg-emerald-500 px-4 py-2 text-xs font-black text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {!reviewScanComplete
                    ? "🔒 Eerst AI-scan afronden"
                    : unresolvedReviewFlagCount > 0
                      ? `🔒 Eerst ${unresolvedReviewFlagCount} melding${unresolvedReviewFlagCount === 1 ? "" : "en"} afhandelen`
                      : "✓ Goedkeuren & publiceren"}
                </button>
              </div>
            </div>
          )}

          {reviewMode && reviewSubmission && (
            <div className="shrink-0 border-b border-white/10 bg-[#090b11] px-5 py-3 text-white">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.25em] text-neutral-500">
                      Moderatiemeldingen
                    </p>
                    <p className="mt-1 text-sm font-black">
                      {activeReviewFlags.length === 0
                        ? "Geen actuele AI-markeringen"
                        : `${clearedReviewFlagCount}/${activeReviewFlags.length} afgehandeld`}
                    </p>
                  </div>

                  {severeReviewFlags.length > 0 && (
                    <span className="rounded-full border border-red-400/30 bg-red-500/15 px-3 py-1 text-xs font-black text-red-200">
                      🔴 {severeReviewFlags.length} ernstig
                    </span>
                  )}

                  {attentionReviewFlags.length > 0 && (
                    <span className="rounded-full border border-amber-400/30 bg-amber-500/15 px-3 py-1 text-xs font-black text-amber-100">
                      🟠 {attentionReviewFlags.length} controle
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {activeReviewFlags.length > 0 && (
                    <button
                      type="button"
                      onClick={jumpToNextReviewFlag}
                      className="rounded-xl border border-purple-400/30 bg-purple-500/15 px-4 py-2 text-xs font-black text-purple-100 hover:bg-purple-500/25"
                    >
                      {unresolvedReviewFlagCount > 0
                        ? `Volgende open melding (${unresolvedReviewFlagCount})`
                        : "Alle meldingen afgehandeld ✓"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setReviewAlertsCollapsed((current) => !current)}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-neutral-200 hover:bg-white/10"
                  >
                    {reviewAlertsCollapsed ? "Meldingen tonen" : "Meldingen inklappen"}
                  </button>
                </div>
              </div>

              {!reviewAlertsCollapsed && activeReviewFlags.length > 0 && (
                <div className="mt-3 grid gap-3">
                  {severeReviewFlags.length > 0 && (
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="w-24 shrink-0 pt-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-red-300">
                          Ernstig
                        </p>
                      </div>

                      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                        {severeReviewFlags.map((flag) => {
                          const targetNode = nodes.find((node) => node.id === flag.nodeId);
                          const flagKey = getReviewFlagKey(flag);
                          const cleared = isReviewFlagCleared(flag);

                          return (
                            <button
                              key={flagKey}
                              type="button"
                              onClick={() => jumpToReviewFlag(flag)}
                              className={`min-w-[270px] max-w-[340px] shrink-0 rounded-2xl border p-3 text-left transition ${
                                cleared
                                  ? "border-emerald-400/25 bg-emerald-500/10 opacity-70"
                                  : "border-red-400/40 bg-red-500/15 hover:bg-red-500/25"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-[10px] font-black uppercase tracking-widest ${cleared ? "text-emerald-200" : "text-red-200"}`}>
                                  {cleared ? "✓ Akkoord" : "⚠ Ernstig"} • {flag.category}
                                </p>
                                <span className="shrink-0 text-[10px] font-black text-neutral-500">
                                  {flag.nodeId}
                                </span>
                              </div>
                              <p className="mt-1 truncate text-sm font-black text-white">
                                {targetNode?.data.label || "Onbekende node"}
                              </p>
                              <p className="mt-1 truncate text-xs font-semibold text-neutral-300">
                                {flag.reason}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {attentionReviewFlags.length > 0 && (
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="w-24 shrink-0 pt-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-amber-300">
                          Controle
                        </p>
                      </div>

                      <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1">
                        {attentionReviewFlags.map((flag) => {
                          const targetNode = nodes.find((node) => node.id === flag.nodeId);
                          const flagKey = getReviewFlagKey(flag);
                          const cleared = isReviewFlagCleared(flag);

                          return (
                            <button
                              key={flagKey}
                              type="button"
                              onClick={() => jumpToReviewFlag(flag)}
                              className={`min-w-[270px] max-w-[340px] shrink-0 rounded-2xl border p-3 text-left transition ${
                                cleared
                                  ? "border-emerald-400/25 bg-emerald-500/10 opacity-70"
                                  : "border-amber-400/35 bg-amber-500/10 hover:bg-amber-500/20"
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className={`text-[10px] font-black uppercase tracking-widest ${cleared ? "text-emerald-200" : "text-amber-200"}`}>
                                  {cleared ? "✓ Akkoord" : "⚠ Controle"} • {flag.category}
                                </p>
                                <span className="shrink-0 text-[10px] font-black text-neutral-500">
                                  {flag.nodeId}
                                </span>
                              </div>
                              <p className="mt-1 truncate text-sm font-black text-white">
                                {targetNode?.data.label || "Onbekende node"}
                              </p>
                              <p className="mt-1 truncate text-xs font-semibold text-neutral-300">
                                {flag.reason}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {!reviewAlertsCollapsed && activeReviewFlags.length === 0 && (
                <div className="mt-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-100">
                  Geen automatische of handmatige markeringen gevonden. De admin kan het boek nog steeds volledig handmatig controleren.
                </div>
              )}
            </div>
          )}

          <div className="min-h-0 flex-1">
          <ReactFlow
            nodes={flowNodes}
            edges={getValidatedEdges(edges, nodes)}
            onNodesChange={reviewMode ? undefined : onNodesChange}
            onEdgesChange={reviewMode ? undefined : onEdgesChange}
            onNodeClick={(_, node) => {
              setSelectedNodeId(node.id);
              if (reviewMode) setReviewInspectorOpen(true);
            }}
            onInit={(instance) => {
              reviewFlowInstanceRef.current = instance;
            }}
            onMoveEnd={(_, viewport) => { if (!reviewMode) setFlowViewport(viewport); }}
            nodesConnectable={false}
            nodesDraggable={!reviewMode}
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

        <aside ref={reviewInspectionAsideRef} className="w-80 overflow-y-auto border-l-4 border-black bg-neutral-950 p-4">
          <h2 className="mb-4 text-xl font-black">{reviewMode ? "Review inspectie" : "Node instellingen"}</h2>

          {reviewMode ? (
            <div className="grid gap-4">
              {!selectedNode ? (
                <div className="rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-sm font-semibold leading-6 text-neutral-400">
                  Klik op een node of op een moderatiemelding. De volledige review opent centraal in beeld.
                </div>
              ) : (
                <>
                  <div className="rounded-2xl border border-purple-400/20 bg-purple-500/10 p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-purple-300">Geselecteerde node</p>
                    <h3 className="mt-2 text-lg font-black">{selectedNode.data.label}</h3>
                    <p className="mt-1 break-all text-[10px] font-bold text-neutral-500">
                      {nodeLabels[selectedNode.data.type]} • {selectedNode.id}
                    </p>
                  </div>

                  <div className={`rounded-2xl border p-4 ${
                    selectedReviewFlags.some((flag) => !isReviewFlagCleared(flag))
                      ? selectedReviewFlags.some((flag) => flag.severity === "high" && !isReviewFlagCleared(flag))
                        ? "border-red-400/30 bg-red-500/10"
                        : "border-amber-400/30 bg-amber-500/10"
                      : "border-emerald-400/20 bg-emerald-500/10"
                  }`}>
                    <p className="text-xs font-black uppercase tracking-widest text-neutral-300">
                      {selectedReviewFlags.length === 0
                        ? "Geen waarschuwingen"
                        : `${selectedReviewFlags.filter((flag) => !isReviewFlagCleared(flag)).length} open • ${selectedReviewFlags.length} totaal`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setReviewInspectorOpen(true)}
                    className="rounded-2xl bg-purple-500 px-4 py-3 text-sm font-black text-white hover:bg-purple-400"
                  >
                    🔎 Open grote reviewinspectie
                  </button>

                  {unresolvedReviewFlagCount > 0 && (
                    <button
                      type="button"
                      onClick={jumpToNextReviewFlag}
                      className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-neutral-200 hover:bg-white/10"
                    >
                      Volgende open melding ({unresolvedReviewFlagCount})
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <>
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

              {selectedNode.data.type === "chapter" && (
                <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 p-4">
                  <div className="mb-4">
                    <h3 className="font-black text-rose-200">Hoofdstuk-marker</h3>
                    <p className="mt-1 text-xs font-semibold leading-5 text-rose-100/70">
                      Onzichtbare structuur-node. De Reader toont de hoofdstukinformatie
                      bij de pagina's erna en gaat automatisch via één vervolgpath door.
                      Deze marker telt niet mee als verhaalnode of boekvereiste.
                    </p>
                  </div>

                  <div className="grid gap-3">
                    <div>
                      <label className="mb-2 block text-sm font-bold">Hoofdstuknummer</label>
                      <input
                        value={selectedNode.data.chapterNumber ?? ""}
                        onChange={(event) =>
                          updateSelectedChapterData({ chapterNumber: event.target.value })
                        }
                        placeholder="Bijv. 4, IV of Proloog"
                        className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-rose-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold">Hoofdstuktitel</label>
                      <input
                        value={selectedNode.data.chapterTitle ?? ""}
                        onChange={(event) =>
                          updateSelectedChapterData({ chapterTitle: event.target.value })
                        }
                        placeholder="Bijv. De Hallows"
                        className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-rose-500"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-bold">
                        Ondertitel <span className="text-neutral-500">(optioneel)</span>
                      </label>
                      <input
                        value={selectedNode.data.chapterSubtitle ?? ""}
                        onChange={(event) =>
                          updateSelectedChapterData({ chapterSubtitle: event.target.value })
                        }
                        placeholder="Bijv. Cycle 64 • Day 83"
                        className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-950 p-3 text-white outline-none focus:border-rose-500"
                      />
                    </div>
                  </div>
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
                    {selectedNodePaths.length}/{
                      selectedNode.data.type === "function" ||
                      selectedNode.data.type === "chapter"
                        ? 1
                        : 10
                    }
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

                {selectedNode.data.type === "chapter" && (
                  <p className="mb-3 rounded-lg border border-rose-500/20 bg-rose-500/10 p-3 text-xs font-bold leading-5 text-rose-100/80">
                    Hoofdstuk-markers zijn onzichtbaar voor lezers en gebruiken precies één vervolgpath. Plaats hem vóór de eerste node van het hoofdstuk.
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
            </>
          )}
        </aside>
      </div>

      {helpOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 p-4 sm:p-8">
          <div className="mx-auto flex max-h-full max-w-6xl flex-col overflow-hidden rounded-3xl border border-neutral-700 bg-neutral-950 text-white shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-neutral-800 p-5">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-widest text-neutral-500">
                  DiBooks Auteur Studio
                </p>
                <h2 className="truncate text-2xl font-black">
                  {helpView === "overview" ? "Handleiding" : "Volledige tutorial"}
                </h2>
              </div>

              <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={toggleHelpAutoShow}
                  className={`rounded-full border px-4 py-2 text-xs font-black transition ${
                    helpAutoShowDisabled
                      ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200 hover:bg-emerald-500/20"
                      : "border-white/10 bg-white/5 text-neutral-300 hover:bg-white/10"
                  }`}
                  title={
                    helpAutoShowDisabled
                      ? "Handleiding weer automatisch tonen bij openen"
                      : "Handleiding niet meer automatisch tonen"
                  }
                >
                  {helpAutoShowDisabled
                    ? "✓ Niet automatisch tonen"
                    : "Niet meer automatisch tonen"}
                </button>

                {helpView === "tutorial" && (
                  <button
                    type="button"
                    onClick={() => setHelpView("overview")}
                    className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-neutral-200 hover:bg-white/10"
                  >
                    ← Overzicht
                  </button>
                )}

                <button
                  onClick={() => {
                    setHelpOpen(false);
                    setHelpView("overview");
                  }}
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-red-600 text-2xl font-black leading-none text-white hover:bg-red-500"
                  aria-label="Sluit handleiding"
                  title="Sluit handleiding"
                >
                  ×
                </button>
              </div>
            </div>

            <div className="overflow-y-auto p-5 sm:p-7">
              {helpView === "overview" ? (
                <div className="grid gap-5">
                  <section className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.055] p-5">
                    <div className="mb-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-blue-300">
                        Tekst & schrijven
                      </p>
                      <h3 className="mt-1 text-xl font-black">
                        Verhaal en structuur
                      </h3>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-600">
                          <BookIcon />
                        </span>
                        <span className="text-sm text-neutral-300">
                          <strong className="text-white">Normale tekst</strong>
                          <br />
                          Gewone verhaaltekst. Opeenvolgende tekstnodes vormen in de Reader één leesflow.
                        </span>
                      </div>

                      <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-yellow-500 text-black">
                          <BookIcon sparkle />
                        </span>
                        <span className="text-sm text-neutral-300">
                          <strong className="text-white">Speciale tekst</strong>
                          <br />
                          Voor logboeken, dossiers, brieven of dagboeken. Blijft een eigen readerpagina.
                        </span>
                      </div>

                      <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600 text-sm font-black text-white">
                          H
                        </span>
                        <span className="text-sm text-neutral-300">
                          <strong className="text-white">Hoofdstuk-marker</strong>
                          <br />
                          Markeert het begin van een hoofdstuk. Niet zichtbaar als eigen pagina en telt niet mee als verhaalnode.
                        </span>
                      </div>

                      <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-slate-950">
                          <ScratchpadIcon />
                        </span>
                        <span className="text-sm text-neutral-300">
                          <strong className="text-white">Kladblok / lore</strong>
                          <br />
                          Privé-notities, lore en ideeën voor de auteur. Nooit zichtbaar voor lezers.
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.055] p-5">
                    <div className="mb-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-emerald-300">
                        Media & interactie
                      </p>
                      <h3 className="mt-1 text-xl font-black">
                        Momenten waar de lezer actief meedoet
                      </h3>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-600">
                          <VideoIcon />
                        </span>
                        <span className="text-sm text-neutral-300">
                          <strong className="text-white">Cutscene</strong>
                          <br />
                          Kort videofragment dat automatisch naar de volgende route doorgaat.
                        </span>
                      </div>

                      <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-600">
                          <JoystickIcon />
                        </span>
                        <span className="text-sm text-neutral-300">
                          <strong className="text-white">Minigame</strong>
                          <br />
                          Interactieve opdracht met een aparte success- en failroute.
                        </span>
                      </div>

                      <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-[11px] font-black">
                          ABC
                        </span>
                        <span className="text-sm text-neutral-300">
                          <strong className="text-white">Keuzemenu</strong>
                          <br />
                          Laat de lezer kiezen uit maximaal drie verhaalroutes en kan variabelen aanpassen.
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-cyan-500/20 bg-cyan-500/[0.055] p-5">
                    <div className="mb-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300">
                        Logica & tools
                      </p>
                      <h3 className="mt-1 text-xl font-black">
                        Geheugen en vertakkingen van het verhaal
                      </h3>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600">
                          <FlagVariablesIcon />
                        </span>
                        <span className="text-sm text-neutral-300">
                          <strong className="text-white">Flags & variabelen</strong>
                          <br />
                          Centrale lijst met booleans, getallen en tekstwaarden die het verhaal kan onthouden.
                        </span>
                      </div>

                      <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500 text-slate-950">
                          <FunctionIcon />
                        </span>
                        <span className="text-sm text-neutral-300">
                          <strong className="text-white">Functie</strong>
                          <br />
                          Onzichtbare node die variabelen aanpast en daarna automatisch doorgaat.
                        </span>
                      </div>

                      <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600">
                          <ConditionIcon />
                        </span>
                        <span className="text-sm text-neutral-300">
                          <strong className="text-white">Voorwaarde / IF</strong>
                          <br />
                          Controleert een variabele en kiest automatisch TRUE of ELSE.
                        </span>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-2xl border border-sky-500/20 bg-sky-500/[0.055] p-5">
                    <div className="mb-4">
                      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-sky-300">
                        Project & vaste knoppen
                      </p>
                      <h3 className="mt-1 text-xl font-black">
                        Opslaan, testen en de editor bedienen
                      </h3>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-600">
                          <SaveIcon />
                        </span>
                        <span className="text-sm text-neutral-300">
                          <strong className="text-white">Opslaan</strong>
                          <br />
                          Dashboard-opslag, lokale backup en reader-export.
                        </span>
                      </div>

                      <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-700">
                          <FolderIcon />
                        </span>
                        <span className="text-sm text-neutral-300">
                          <strong className="text-white">Project laden</strong>
                          <br />
                          Open een lokaal opgeslagen DiBooks-project.
                        </span>
                      </div>

                      <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-600">
                          <PlayIcon />
                        </span>
                        <span className="text-sm text-neutral-300">
                          <strong className="text-white">Play / Preview</strong>
                          <br />
                          Test het boek vanaf de start-node zoals een lezer het ervaart.
                        </span>
                      </div>

                      <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-200 text-slate-950">
                          <MoonIcon darkMode={false} />
                        </span>
                        <span className="text-sm text-neutral-300">
                          <strong className="text-white">Grid thema</strong>
                          <br />
                          Wissel alleen de editor-grid tussen licht en donker.
                        </span>
                      </div>

                      <div className="flex items-start gap-3 rounded-xl border border-white/8 bg-black/20 p-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-950 text-red-100">
                          <ResetEditorIcon />
                        </span>
                        <span className="text-sm text-neutral-300">
                          <strong className="text-white">Reset editor</strong>
                          <br />
                          Wis bewust de huidige lokale editorsessie en begin opnieuw met een Hoofdstuk 1-marker.
                        </span>
                      </div>
                    </div>
                  </section>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <section className="rounded-2xl border border-indigo-900/70 bg-indigo-950/20 p-5">
                      <h3 className="mb-3 text-lg font-black">
                        Nieuwe pagina in tekst
                      </h3>
                      <p className="text-sm leading-6 text-neutral-300">
                        Gebruik in de teksteditor <strong className="text-white">Nieuwe pagina</strong>.
                        DiBooks plaatst{" "}
                        <code className="rounded bg-black/40 px-2 py-1 text-indigo-200">
                          [[NIEUWE_PAGINA]]
                        </code>{" "}
                        op die plek. De code is in de Reader onzichtbaar en forceert daar een nieuwe boekpagina.
                      </p>
                    </section>

                    <section className="rounded-2xl border border-emerald-900/70 bg-emerald-950/20 p-5">
                      <h3 className="mb-3 text-lg font-black">Sessiesave</h3>
                      <p className="text-sm leading-6 text-neutral-300">
                        De Studio bewaart automatisch je recente browsersessie.
                        Dashboard-opslag blijft de veilige online versie van je boek.
                      </p>
                    </section>
                  </div>

                  <section className="rounded-3xl border border-blue-400/25 bg-gradient-to-br from-blue-600/15 to-indigo-600/10 p-6 text-center">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-300">
                      Meer uitleg nodig?
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      Lees de volledige Auteur Studio tutorial
                    </h3>
                    <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold leading-6 text-neutral-400">
                      Hier leggen we niet alleen uit wat de knoppen zijn, maar ook hoe nodes,
                      paths, keuzes, variabelen, Function en IF samen één interactief verhaal vormen.
                    </p>
                    <button
                      type="button"
                      onClick={() => setHelpView("tutorial")}
                      className="mt-5 rounded-2xl bg-blue-600 px-6 py-3 text-sm font-black text-white shadow-lg hover:bg-blue-500"
                    >
                      Volledige tutorial openen →
                    </button>
                  </section>
                </div>
              ) : (
                <div className="mx-auto grid max-w-4xl gap-6">
                  <section className="rounded-3xl border border-blue-500/20 bg-blue-500/[0.055] p-6 sm:p-8">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-300">
                      1 • Hoe DiBooks werkt
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      Je boek is een netwerk van nodes
                    </h3>
                    <div className="mt-4 grid gap-4 text-sm font-semibold leading-7 text-neutral-300">
                      <p>
                        Iedere node stelt een onderdeel van je boek voor. Tekstnodes bevatten verhaal,
                        een keuzemenu vraagt iets aan de lezer en logica-nodes onthouden of controleren wat eerder is gebeurd.
                      </p>
                      <p>
                        Je verbindt nodes met <strong className="text-white">paths</strong>. De Reader volgt
                        die verbindingen vanaf de start-node. Een normale tekstflow kan uit meerdere tekstnodes bestaan zonder dat
                        de lezer merkt waar de ene node eindigt en de volgende begint.
                      </p>
                    </div>

                    <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 font-mono text-sm text-blue-100">
                      Hoofdstuk → Tekst → Tekst → Keuze → Tekst → Minigame → Tekst
                    </div>
                  </section>

                  <section className="rounded-3xl border border-blue-500/20 bg-neutral-900/70 p-6 sm:p-8">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-blue-300">
                      2 • Tekst, speciale tekst en hoofdstukken
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      Bouw de leesbare laag van het boek
                    </h3>
                    <div className="mt-5 grid gap-5">
                      <div>
                        <h4 className="font-black text-white">Normale tekst</h4>
                        <p className="mt-1 text-sm font-semibold leading-6 text-neutral-400">
                          Gebruik dit voor het grootste deel van je verhaal. Wanneer één tekstnode precies één path naar een volgende
                          tekstnode heeft, voegt de Reader die automatisch samen tot één doorlopende leesflow.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-black text-white">Speciale tekst</h4>
                        <p className="mt-1 text-sm font-semibold leading-6 text-neutral-400">
                          Gebruik dit wanneer een onderdeel bewust als een aparte pagina moet voelen, bijvoorbeeld een logboek,
                          chat, brief of dossier. Speciale tekst wordt nooit automatisch met gewone tekst samengevoegd.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-black text-white">Hoofdstuk-marker</h4>
                        <p className="mt-1 text-sm font-semibold leading-6 text-neutral-400">
                          Plaats deze vóór de eerste node van een nieuw hoofdstuk. Vul nummer, titel en eventueel een ondertitel in.
                          De marker verschijnt niet als eigen pagina, telt niet mee als verhaalnode en gebruikt precies één vervolgpath.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-black text-white">Nieuwe pagina</h4>
                        <p className="mt-1 text-sm font-semibold leading-6 text-neutral-400">
                          Wil je binnen één tekstflow bewust een pagina-afbreking? Gebruik dan de knop Nieuwe pagina in de teksteditor.
                          De marker is alleen voor de editor; de lezer ziet hem niet.
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-orange-500/20 bg-orange-500/[0.055] p-6 sm:p-8">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-300">
                      3 • Keuzemenu
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      Laat de lezer het verhaal sturen
                    </h3>
                    <div className="mt-4 grid gap-4 text-sm font-semibold leading-7 text-neutral-300">
                      <p>
                        Een keuzemenu kan maximaal drie opties bevatten. Iedere optie krijgt zijn eigen doel-node.
                        Daardoor kan één verhaalpunt zich opsplitsen in verschillende routes.
                      </p>
                      <p>
                        Een keuze kan daarnaast meteen een variabele veranderen. Bijvoorbeeld:
                        keuze A zet <strong className="text-white">vertrouwen_sarah</strong> +1,
                        terwijl keuze B een flag <strong className="text-white">kael_verdacht</strong> aanzet.
                      </p>
                      <p>
                        Die informatie kan veel later door een IF-node worden gebruikt. Zo hoeft een keuze niet direct
                        naar een compleet ander hoofdstuk te leiden om toch gevolgen te hebben.
                      </p>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-purple-500/20 bg-purple-500/[0.055] p-6 sm:p-8">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-purple-300">
                      4 • Minigames en cutscenes
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      Voeg interactieve scènes toe
                    </h3>
                    <div className="mt-5 grid gap-5">
                      <div>
                        <h4 className="font-black text-white">Minigame</h4>
                        <p className="mt-1 text-sm font-semibold leading-6 text-neutral-400">
                          Een minigame heeft een successroute en een failroute. Beide resultaten kunnen ook variabelen aanpassen.
                          Zet herkansing uit wanneer falen echt onderdeel van het verhaal moet worden.
                        </p>
                      </div>

                      <div>
                        <h4 className="font-black text-white">Cutscene</h4>
                        <p className="mt-1 text-sm font-semibold leading-6 text-neutral-400">
                          Gebruik een cutscene voor een kort filmisch moment. Zodra de video is afgelopen volgt de Reader automatisch
                          het vervolgpath. Zet belangrijke verhaalkeuzes daarom niet ín een cutscene, maar in een node erna.
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-indigo-500/20 bg-indigo-500/[0.055] p-6 sm:p-8">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-indigo-300">
                      5 • Flags & variabelen
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      Het geheugen van je verhaal
                    </h3>
                    <p className="mt-4 text-sm font-semibold leading-7 text-neutral-300">
                      Maak variabelen centraal aan voordat je ze in Function-, IF-, keuze- of minigame-nodes gebruikt.
                    </p>

                    <div className="mt-5 grid gap-3 md:grid-cols-3">
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <h4 className="font-black text-white">Boolean / flag</h4>
                        <p className="mt-1 text-xs font-semibold leading-5 text-neutral-400">
                          Alleen aan of uit. Bijvoorbeeld: heeft_sleutel = true.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <h4 className="font-black text-white">Getal</h4>
                        <p className="mt-1 text-xs font-semibold leading-5 text-neutral-400">
                          Voor tellers en relaties. Bijvoorbeeld: vertrouwen = 3.
                        </p>
                      </div>
                      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                        <h4 className="font-black text-white">Tekst</h4>
                        <p className="mt-1 text-xs font-semibold leading-5 text-neutral-400">
                          Voor een opgeslagen tekstwaarde. Bijvoorbeeld: factie = "Dust".
                        </p>
                      </div>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-cyan-500/20 bg-cyan-500/[0.055] p-6 sm:p-8">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-cyan-300">
                      6 • Function node
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      Verander verhaalstatus zonder een zichtbare scène
                    </h3>
                    <p className="mt-4 text-sm font-semibold leading-7 text-neutral-300">
                      Een Function-node is onzichtbaar voor de lezer. Zodra de Reader hem bereikt, worden de ingestelde acties uitgevoerd
                      en gaat het verhaal automatisch via de enige vervolgpath verder.
                    </p>

                    <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 font-mono text-sm text-cyan-100">
                      Keuze → Function: vertrouwen +1 → Tekst
                    </div>

                    <p className="mt-4 text-sm font-semibold leading-6 text-neutral-400">
                      Gebruik Function wanneer een statuswijziging onderdeel is van de route zelf. Voor simpele gevolgen van een keuze
                      kun je het effect ook direct op die keuze instellen.
                    </p>
                  </section>

                  <section className="rounded-3xl border border-teal-500/20 bg-teal-500/[0.055] p-6 sm:p-8">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-teal-300">
                      7 • Voorwaarde / IF
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      Laat eerder gedrag bepalen wat er nu gebeurt
                    </h3>
                    <p className="mt-4 text-sm font-semibold leading-7 text-neutral-300">
                      Een IF-node controleert een variabele en stuurt de lezer automatisch naar TRUE of ELSE.
                      De node zelf wordt nooit als pagina getoond.
                    </p>

                    <div className="mt-5 rounded-2xl border border-white/10 bg-black/25 p-4 font-mono text-sm text-teal-100">
                      IF vertrouwen ≥ 3
                      <br />
                      ├─ TRUE → Sarah vertrouwt de speler
                      <br />
                      └─ ELSE → Sarah houdt afstand
                    </div>

                    <p className="mt-4 text-sm font-semibold leading-6 text-neutral-400">
                      Combineer Keuze → variabele → IF om gevolgen pas veel later zichtbaar te maken.
                      Dat voorkomt dat iedere keuze meteen een volledig gescheiden verhaallijn nodig heeft.
                    </p>
                  </section>

                  <section className="rounded-3xl border border-neutral-700 bg-neutral-900/70 p-6 sm:p-8">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-neutral-400">
                      8 • Paths en vertakkingen
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      Verbind nodes bewust
                    </h3>
                    <div className="mt-4 grid gap-4 text-sm font-semibold leading-7 text-neutral-300">
                      <p>
                        Een gewone verhaalnode kan meerdere paths hebben. Wanneer de Reader niet weet welke route automatisch bedoeld is,
                        worden de beschikbare routes aan de lezer aangeboden.
                      </p>
                      <p>
                        Voor echte verhaalkeuzes is een <strong className="text-white">Keuzemenu</strong> meestal duidelijker.
                        Function- en hoofdstuk-nodes gebruiken bewust maar één vervolgpath. Een IF-node gebruikt TRUE en ELSE.
                      </p>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.055] p-6 sm:p-8">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-emerald-300">
                      9 • Testen met Play
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      Test niet alleen één route
                    </h3>
                    <div className="mt-4 grid gap-4 text-sm font-semibold leading-7 text-neutral-300">
                      <p>
                        Play start het boek vanaf de start-node. Controleer tekst, paginering, keuzes, minigames,
                        hoofdstukken en de effecten van variabelen zoals een echte lezer ze krijgt.
                      </p>
                      <p>
                        Test bij vertakkingen minimaal de belangrijkste alternatieve routes. Vooral IF-nodes kunnen fouten verbergen
                        wanneer je tijdens testen telkens dezelfde keuze maakt.
                      </p>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-sky-500/20 bg-sky-500/[0.055] p-6 sm:p-8">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-sky-300">
                      10 • Opslaan
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      Sessiesave is handig, Dashboard-opslag is je veilige versie
                    </h3>
                    <div className="mt-4 grid gap-4 text-sm font-semibold leading-7 text-neutral-300">
                      <p>
                        De Studio bewaart automatisch je recente browsersessie. Daarmee kun je meestal verder waar je gebleven was.
                      </p>
                      <p>
                        Gebruik Dashboard-opslag regelmatig voor de online versie van je boek en download eventueel een lokale backup
                        voordat je grote wijzigingen aan je verhaalstructuur maakt.
                      </p>
                    </div>
                  </section>

                  <section className="rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.06] to-white/[0.02] p-6 text-center sm:p-8">
                    <p className="text-xs font-black uppercase tracking-[0.28em] text-neutral-500">
                      Klaar
                    </p>
                    <h3 className="mt-2 text-2xl font-black">
                      Je hoeft de tutorial niet te onthouden
                    </h3>
                    <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold leading-6 text-neutral-400">
                      Gebruik het overzicht voor snelle herkenning en kom hier terug zodra je met keuzes,
                      variabelen of voorwaarden gaat werken.
                    </p>
                    <button
                      type="button"
                      onClick={() => setHelpView("overview")}
                      className="mt-5 rounded-2xl border border-white/10 bg-white/10 px-6 py-3 text-sm font-black text-white hover:bg-white/15"
                    >
                      ← Terug naar overzicht
                    </button>
                  </section>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {!reviewMode && variablesOpen && (
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

      {!reviewMode && editingTextNode &&
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
      {!reviewMode && saveDashboardOpen && (
        <SaveToDashboardModal
          form={dashboardSaveForm}
          setForm={setDashboardSaveForm}
          existingBookId={sharedEditBookId ? sharedEditBookId : dashboardBookId}
          isLoggedIn={isLoggedIn}
          canUseAuthorTools={permissions.canSaveToDashboard}
          series={dashboardSeries}
          onOpenSeries={() => setSeriesManagerOpen(true)}
          onClose={() => setSaveDashboardOpen(false)}
          onSaveDashboard={saveCurrentBookToDashboard}
          onDownloadProject={downloadProjectFile}
          onDownloadReaderStory={downloadReaderStoryFile}
        />
      )}
      {!reviewMode && seriesManagerOpen && user && permissions.canUseDashboard && (
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
      {reviewMode && reviewInspectorOpen && selectedNode && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReviewInspectorOpen(false);
          }}
        >
          <div className="flex max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/15 bg-[#0b0d13] text-white shadow-2xl">
            <div className="flex shrink-0 flex-wrap items-start justify-between gap-4 border-b border-white/10 px-6 py-5 sm:px-7">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.32em] text-purple-300">
                  Review inspectie • alleen lezen
                </p>
                <h2 className="mt-2 text-2xl font-black sm:text-3xl">
                  {selectedNode.data.label}
                </h2>
                <p className="mt-1 break-all text-xs font-bold text-neutral-500">
                  {nodeLabels[selectedNode.data.type]} • node {selectedNode.id}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedReviewFlags.length > 0 && (
                  <span className={`rounded-full px-3 py-2 text-xs font-black ${
                    selectedReviewFlags.some((flag) => flag.severity === "high" && !isReviewFlagCleared(flag))
                      ? "bg-red-500/15 text-red-200"
                      : selectedReviewFlags.some((flag) => !isReviewFlagCleared(flag))
                        ? "bg-amber-500/15 text-amber-100"
                        : "bg-emerald-500/15 text-emerald-100"
                  }`}>
                    {selectedReviewFlags.filter((flag) => !isReviewFlagCleared(flag)).length} open • {selectedReviewFlags.length} totaal
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => setReviewInspectorOpen(false)}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-black text-white hover:bg-white/10"
                >
                  ✕ Sluiten
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="grid min-h-full gap-0 lg:grid-cols-[390px_minmax(0,1fr)]">
                <section className="border-b border-white/10 bg-black/20 p-5 sm:p-6 lg:border-b-0 lg:border-r">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.25em] text-neutral-500">
                        Moderatiemeldingen
                      </p>
                      <h3 className="mt-1 text-xl font-black">
                        {selectedReviewFlags.length || "Geen"} waarschuwing{selectedReviewFlags.length === 1 ? "" : "en"}
                      </h3>
                    </div>
                  </div>

                  {selectedReviewFlags.length > 0 ? (
                    <div className="mt-4 grid gap-3">
                      {[...selectedReviewFlags]
                        .sort((a, b) => {
                          const rank = (flag: ModerationFlag) =>
                            flag.severity === "high" ? 0 : flag.severity === "medium" ? 1 : 2;
                          return rank(a) - rank(b);
                        })
                        .map((flag) => (
                          <div
                            key={flag.flagId || `${flag.nodeId}-${flag.category}`}
                            className={`rounded-2xl border p-4 ${
                              isReviewFlagCleared(flag)
                                ? "border-emerald-400/30 bg-emerald-500/10"
                                : flag.severity === "high"
                                  ? "border-red-400/40 bg-red-500/10"
                                  : "border-amber-400/35 bg-amber-500/10"
                            }`}
                          >
                            <p className={`text-[11px] font-black uppercase tracking-widest ${
                              isReviewFlagCleared(flag)
                                ? "text-emerald-200"
                                : flag.severity === "high"
                                  ? "text-red-200"
                                  : "text-amber-200"
                            }`}>
                              {isReviewFlagCleared(flag)
                                ? "✓ Beoordeeld & akkoord"
                                : flag.severity === "high"
                                  ? "🔴 Ernstig"
                                  : "🟠 Controle"}{" "}
                              • {flag.category}
                            </p>

                            <p className="mt-3 text-sm font-semibold leading-6 text-neutral-200">
                              {flag.reason}
                            </p>
                            <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-neutral-500">
                              Bron: {flag.source}
                            </p>

                            {isReviewFlagCleared(flag) ? (
                              <button
                                type="button"
                                disabled={reviewActionBusy}
                                onClick={() => void handleReopenReviewFlag(flag)}
                                className="mt-3 w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-black text-neutral-300 hover:bg-white/10 disabled:opacity-50"
                              >
                                ↶ Heropen melding
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={reviewActionBusy}
                                onClick={() => void handleClearReviewFlag(flag)}
                                className={`mt-3 w-full rounded-xl px-4 py-3 text-xs font-black disabled:cursor-wait disabled:opacity-50 ${
                                  flag.severity === "high"
                                    ? "bg-red-500 text-white hover:bg-red-400"
                                    : "bg-emerald-500 text-black hover:bg-emerald-400"
                                }`}
                              >
                                ✓ Beoordeeld & akkoord
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 p-4 text-sm font-semibold leading-6 text-emerald-100">
                      Deze node heeft geen automatische of handmatige waarschuwingen.
                    </div>
                  )}

                  {unresolvedReviewFlagCount > 0 && (
                    <button
                      type="button"
                      onClick={jumpToNextReviewFlag}
                      className="mt-4 w-full rounded-xl border border-purple-400/30 bg-purple-500/15 px-4 py-3 text-sm font-black text-purple-100 hover:bg-purple-500/25"
                    >
                      Volgende open melding ({unresolvedReviewFlagCount})
                    </button>
                  )}
                </section>

                <section className="min-w-0 p-5 sm:p-7">
                  <p className="text-[10px] font-black uppercase tracking-[0.25em] text-neutral-500">
                    Volledige node-inhoud
                  </p>

                  {(selectedNode.data.type === "text" ||
                    selectedNode.data.type === "special" ||
                    selectedNode.data.type === "scratchpad") && (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.035] p-5 sm:p-6">
                      <div
                        className="prose prose-invert max-w-none text-base leading-8 sm:text-lg sm:leading-9"
                        dangerouslySetInnerHTML={{
                          __html:
                            selectedNode.data.textHtml ||
                            selectedNode.data.text ||
                            "<p>Lege node.</p>",
                        }}
                      />
                    </div>
                  )}

                  {selectedNode.data.type === "chapter" && (
                    <div className="mt-4 rounded-2xl border border-rose-400/20 bg-rose-500/10 p-5">
                      <p className="text-xs font-black uppercase tracking-widest text-rose-200">
                        Hoofdstuk-marker
                      </p>
                      <p className="mt-3 text-lg font-black text-white">
                        {selectedNode.data.chapterNumber
                          ? `Hoofdstuk ${selectedNode.data.chapterNumber}`
                          : "Hoofdstuk"}
                        {selectedNode.data.chapterTitle
                          ? ` — ${selectedNode.data.chapterTitle}`
                          : ""}
                      </p>
                      {selectedNode.data.chapterSubtitle && (
                        <p className="mt-2 text-sm font-semibold text-rose-100/70">
                          {selectedNode.data.chapterSubtitle}
                        </p>
                      )}
                      <p className="mt-3 text-xs font-semibold text-rose-100/60">
                        Structuurmarker; verschijnt niet als aparte pagina en wordt niet door de tekstscanner beoordeeld.
                      </p>
                    </div>
                  )}

                  {selectedNode.data.type === "choice" && (
                    <div className="mt-4 rounded-2xl border border-orange-400/20 bg-orange-500/10 p-5">
                      <p className="text-xs font-black uppercase tracking-widest text-orange-200">
                        Keuzes
                      </p>
                      <div className="mt-4 grid gap-3">
                        {(selectedNode.data.choices ?? []).map((choice, index) => (
                          <div
                            key={`${index}-${choice.label}`}
                            className="rounded-xl border border-white/10 bg-black/25 p-4 text-base font-bold leading-7"
                          >
                            {String.fromCharCode(65 + index)}. {choice.label || "Lege keuze"}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedNode.data.type === "cutscene" && (
                    <div className="mt-4 rounded-2xl border border-green-400/20 bg-green-500/10 p-5 text-base font-semibold leading-7 text-green-100">
                      <p className="font-black">Cutscene</p>
                      <p className="mt-2">
                        {selectedNode.data.videoFileName ||
                          (selectedNode.data.videoUrl ? "Video gekoppeld" : "Geen video")}
                        {" • "}
                        {Number(selectedNode.data.videoDuration || 0).toFixed(1)} sec.
                      </p>
                      <p className="mt-2 text-sm text-green-100/70">
                        Gebruik Hele boek previewen om de video volledig te beoordelen.
                      </p>
                    </div>
                  )}

                  {selectedNode.data.type === "minigame" && (
                    <div className="mt-4 rounded-2xl border border-purple-400/20 bg-purple-500/10 p-5 text-base font-semibold leading-7 text-purple-100">
                      <p className="font-black">Minigame</p>
                      <p className="mt-2">
                        Moeilijkheid: {selectedNode.data.miniGameDifficulty || "normal"}
                      </p>
                      <p className="mt-2 text-sm text-purple-100/70">
                        Gebruik Hele boek previewen om de interactie te testen.
                      </p>
                    </div>
                  )}

                  {selectedNode.data.type === "function" && (
                    <div className="mt-4 rounded-2xl border border-cyan-400/20 bg-cyan-500/10 p-5">
                      <p className="text-xs font-black uppercase tracking-widest text-cyan-200">
                        Functie-acties
                      </p>
                      <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-xl bg-black/25 p-4 text-sm text-cyan-50/85">
                        {JSON.stringify(selectedNode.data.functionActions ?? [], null, 2)}
                      </pre>
                    </div>
                  )}

                  {selectedNode.data.type === "condition" && (
                    <div className="mt-4 rounded-2xl border border-teal-400/20 bg-teal-500/10 p-5">
                      <p className="text-xs font-black uppercase tracking-widest text-teal-200">
                        Voorwaarde / IF
                      </p>
                      <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-xl bg-black/25 p-4 text-sm text-teal-50/85">
                        {JSON.stringify(
                          {
                            variable: selectedNode.data.conditionKey,
                            operator: selectedNode.data.conditionOperator,
                            value: selectedNode.data.conditionValue,
                            trueTarget: selectedNode.data.conditionTrueTargetNodeId,
                            elseTarget: selectedNode.data.conditionFalseTargetNodeId,
                          },
                          null,
                          2,
                        )}
                      </pre>
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      {authModalMode && (
        <AuthModal
          mode={authModalMode}
          initialPlan={authInitialPlan}
          onModeChange={setAuthModalMode}
          onClose={() => {
            setAuthModalMode(null);
            setAuthInitialPlan("free");
          }}
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
                globalPageOffset={previewGlobalPageOffset}
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

            {previewNode.data.type === "chapter" && (
              <div className="flex h-full items-center justify-center p-6">
                <div className="max-w-xl rounded-3xl border border-rose-500/25 bg-rose-500/10 p-8 text-center text-rose-100 shadow-2xl">
                  <p className="text-xs font-black uppercase tracking-[0.28em] text-rose-300">
                    Hoofdstuk-marker
                  </p>
                  <h1 className="mt-3 text-3xl font-black">
                    {previewNode.data.chapterNumber
                      ? `Hoofdstuk ${previewNode.data.chapterNumber}`
                      : "Hoofdstuk"}
                    {previewNode.data.chapterTitle
                      ? ` — ${previewNode.data.chapterTitle}`
                      : ""}
                  </h1>
                  <p className="mt-3 text-sm font-semibold leading-6 text-rose-100/70">
                    Deze marker wordt normaal automatisch overgeslagen. Controleer of hij precies één vervolgpath heeft.
                  </p>
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
                    {previewGlobalPageEnd > previewGlobalPageStart
                      ? `Pagina ${previewGlobalPageStart}–${previewGlobalPageEnd}`
                      : `Pagina ${previewGlobalPageStart}`}
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
                        goToPreviewNode(
                          textChain.nextNodeAfterChain!.id,
                          previewPageCount,
                        );
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
                            onClick={() =>
                              goToPreviewNode(
                                edge.target,
                                previewPageCount,
                              )
                            }
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
              previewNode.data.type !== "condition" &&
              previewNode.data.type !== "chapter" && (
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
