"use client";
import {useEffect,useRef,useState,type ReactNode} from "react";
export type IllustrationData = {imageUrl?:string;imageAlt?:string;illustrationSide?:"left"|"right";illustrationMotion?:boolean;illustrationFocusX?:number;illustrationFocusY?:number};
export default function IllustrationSpread({data,pageMode="auto",previewLayout,children}:{data?:IllustrationData;previewLayout?:"single"|"double";pageMode?:"auto"|"single"|"double";children:ReactNode}) {
 const root=useRef<HTMLDivElement>(null);
 const [double,setDouble]=useState(false);
 const [showImage,setShowImage]=useState(false);
 const [paused,setPaused]=useState(false);
 useEffect(()=>{const el=root.current;if(!el||!data)return;const measure=()=>setDouble(previewLayout ? previewLayout==="double" : el.clientWidth>=900&&(pageMode==="double"||(pageMode==="auto"&&el.clientWidth>=1120)));measure();const observer=new ResizeObserver(measure);observer.observe(el);return()=>observer.disconnect();},[!!data,pageMode,previewLayout]);
 if(!data)return children;
 const position=(value:number|undefined)=>Number.isFinite(value)?Math.max(0,Math.min(100,value!)):50;
 const imageVisible=double||showImage;
 return <div ref={root} className="relative h-full min-h-0 w-full overflow-hidden" data-illustration-spread>
  <div className="h-full min-h-0" style={{width:double?"50%":"100%",marginLeft:double&&data.illustrationSide==="left"?"50%":0,visibility:!double&&showImage?"hidden":"visible"}} inert={!double&&showImage}>{children}</div>
  <figure className="absolute inset-y-0 m-0 overflow-hidden bg-neutral-950" style={{width:double?"50%":"100%",left:double&&data.illustrationSide!=="left"?"50%":0,visibility:imageVisible?"visible":"hidden"}} inert={!imageVisible} onTouchStart={e=>e.stopPropagation()} onTouchEnd={e=>e.stopPropagation()} onKeyDown={e=>{if(["ArrowLeft","ArrowRight"," "].includes(e.key))e.stopPropagation();}}>
   {data.imageUrl ? <img src={data.imageUrl} alt={data.imageAlt||"Illustratie bij deze scène"} className={`h-full w-full object-cover ${data.illustrationMotion!==false?"dibooks-illustration-motion":""}`} style={{objectPosition:`${position(data.illustrationFocusX)}% ${position(data.illustrationFocusY)}%`,transformOrigin:`${position(data.illustrationFocusX)}% ${position(data.illustrationFocusY)}%`,animationPlayState:paused||!imageVisible?"paused":"running"}}/> : <p className="p-8 text-neutral-300">Geen illustratie beschikbaar.</p>}
   {data.imageUrl&&data.illustrationMotion!==false&&<button type="button" className="absolute left-3 top-3 rounded-full bg-black/80 px-3 py-2 text-xs text-white" onClick={()=>setPaused(v=>!v)} aria-pressed={paused}>{paused?"Beweging hervatten":"Beweging pauzeren"}</button>}
  </figure>
  {!double&&<button type="button" className="absolute bottom-3 right-3 z-30 rounded-full border border-white/20 bg-neutral-950 px-4 py-2 text-sm font-bold text-white shadow-lg" onClick={()=>setShowImage(v=>!v)} aria-pressed={showImage}>{showImage?"Terug naar tekst":"Bekijk illustratie"}</button>}
 </div>;
}
