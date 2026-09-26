"use client";

import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { TextStyle } from "@tiptap/extension-text-style";
import { Color } from "@tiptap/extension-color";
import { FontFamily } from "@tiptap/extension-font-family";
import { Extension } from "@tiptap/core";

const NoteFontSize = Extension.create({
  name: "noteFontSize",
  addGlobalAttributes() {
    return [{ types: ["textStyle"], attributes: { fontSize: {
      default: null,
      parseHTML: (element: HTMLElement) => element.style.fontSize || null,
      renderHTML: (attributes: Record<string, unknown>) => attributes.fontSize ? { style: `font-size: ${attributes.fontSize}` } : {},
    } } }];
  },
});

export default function ScratchpadEditor({ title, html, text, locked, onTitleChange, onChange }: {
  title: string; html: string; text: string; locked: boolean;
  onTitleChange: (title: string) => void;
  onChange: (html: string, text: string) => void;
}) {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  const [initialContent] = useState(() => /<\/?[a-z][^>]*>/i.test(html) ? html : ((html || text) ? (html || text).split(/\r?\n/).map(line => `<p>${line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>`).join("") : "<p></p>"));
  const editor = useEditor({
    extensions: [StarterKit, TextStyle, Color, FontFamily, NoteFontSize],
    content: initialContent,
    immediatelyRender: false,
    editable: !locked,
    onUpdate: ({ editor }) => onChangeRef.current(editor.getHTML(), editor.getText()),
    editorProps: { attributes: {
      "aria-label": "Notities",
      role: "textbox",
      "aria-multiline": "true",
      "aria-readonly": locked ? "true" : "false",
      class: "min-h-[42vh] rounded-xl border border-white/10 bg-neutral-950 p-4 text-base leading-7 text-neutral-100 outline-none focus:border-indigo-400 [&_p]:mb-3 [&_h2]:text-xl [&_h2]:font-bold [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6",
    } },
  });
  useEffect(() => { editor?.setEditable(!locked, false); }, [editor, locked]);
  useEffect(() => {
    if (editor && !locked) editor.commands.focus("end");
    // Focus once when the editor becomes ready, never on every note change.
  }, [editor, locked]);
  return <div className="grid gap-3">
    <label className="grid gap-2 text-sm font-semibold">Titel
      <input value={title} disabled={locked} onChange={event => onTitleChange(event.target.value)} className="w-full rounded-lg border border-white/15 bg-neutral-950 px-3 py-2 text-white outline-none focus:border-indigo-400" />
    </label>
    <EditorContent editor={editor} />
  </div>;
}

