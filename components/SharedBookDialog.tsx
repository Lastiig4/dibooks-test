"use client";
import {useEffect,useRef,type ReactNode} from "react";
export default function SharedBookDialog({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{const el=dialog.current;const previous=document.activeElement as HTMLElement|null;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';el?.showModal();return()=>{el?.close();document.body.style.overflow=overflow;previous?.focus();}},[]);
 return <dialog ref={dialog} aria-labelledby="shared-book-title" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}} className="m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-3xl overflow-y-auto rounded-3xl border border-cyan-300/20 bg-[#080b13] p-0 text-white backdrop:bg-black/80"><header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-[#080b13] p-5"><h2 id="shared-book-title" className="text-xl font-bold">{title}</h2><button type="button" onClick={onClose} className="rounded-lg bg-white/10 px-4 py-2">Sluiten</button></header><div className="p-5">{children}</div></dialog>;
}
