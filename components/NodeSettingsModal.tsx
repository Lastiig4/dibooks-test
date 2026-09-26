"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Declared outside the editor so typing never remounts the form or loses focus.
export default function NodeSettingsModal({
  title, nodeType, locked, suspended, onClose, children, quickNote = false, onDelete, canDelete = true,
}: {
  title: string;
  nodeType: string;
  locked: boolean;
  suspended: boolean;
  onClose: () => void;
  children: ReactNode;
  quickNote?: boolean;
  onDelete?: () => void;
  canDelete?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  useEffect(() => {
    if (suspended) return;
    const dialog = dialogRef.current;
    closeRef.current?.focus();
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
      }
      if (event.key !== "Tab" || !dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
        'button, input, textarea, select, a[href], [tabindex], [contenteditable="true"]',
      )).filter((element) => !element.matches(':disabled, [tabindex="-1"]') && element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        first?.focus();
      }
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [suspended]);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-2 backdrop-blur-sm sm:p-6" inert={suspended}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="node-settings-title" aria-describedby="node-settings-description"
        className="flex max-h-[calc(100dvh-1rem)] w-full min-w-0 max-w-4xl flex-col overflow-hidden rounded-2xl border border-indigo-400/20 bg-[#080b13] text-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]">
        <header className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-white/10 p-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="node-settings-title" className="text-xl font-bold">{quickNote ? "Kladblok" : "Node instellingen"}</h2>
            <p id="node-settings-description" className="mt-1 text-xs text-neutral-400">{quickNote ? "Privénotities · wijzigingen worden direct bewaard in je project." : "Wijzigingen worden direct verwerkt."}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {!quickNote && <span className="rounded-full border border-indigo-300/20 bg-indigo-400/10 px-3 py-1 text-xs font-bold text-indigo-200">{nodeType}</span>}
            {onDelete && <button type="button" disabled={locked || !canDelete} onClick={onDelete} className="rounded-lg border border-red-400/20 px-3 py-2 text-sm font-bold text-red-300 hover:bg-red-500/10 disabled:opacity-40">Verwijderen</button>}
            <button ref={closeRef} type="button" onClick={onClose} className="shrink-0 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white">Sluiten</button>
          </div>
        </header>
        {locked && <p role="status" className="shrink-0 border-b border-amber-300/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">🔒 Editor vergrendeld. Sluit dit venster en ontgrendel via het slotje links om instellingen te wijzigen.</p>}
        <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-6">
          <fieldset disabled={locked} className="min-w-0 border-0 p-0 disabled:opacity-60 [&_input]:min-w-0 [&_select]:min-w-0 [&_textarea]:min-w-0 [&_video]:max-w-full [&_img]:max-w-full [&_p]:break-words [&>div>div]:min-w-0">
            <legend className="sr-only">Instellingen voor {title}</legend>
            {children}
          </fieldset>
        </div>
      </div>
    </div>
  );
}
