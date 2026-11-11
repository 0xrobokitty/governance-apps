"use client";
import {useState} from "react";
import {Modal} from "@/components/ui/Modal";
import {liveCopy as c} from "./messages";

export function SourceDetails({title,children,label=c.details,testId,notice}:{title:string;children:React.ReactNode;label?:string;testId?:string;notice?:string}) {
  const [open,setOpen]=useState(false);
  return <>
    {notice&&<button type="button" onClick={()=>setOpen(true)} className="mt-1 block text-left text-[10px] text-text-secondary underline underline-offset-2" data-testid="pulse-tvl-annotation">{notice}</button>}
    <button type="button" aria-label={label===c.details?c.details+": "+title:label} onClick={()=>setOpen(true)} className="mt-1 min-h-6 rounded text-left text-[11px] text-text-secondary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-yearn-blue" data-testid={testId}>{label}</button>
    <Modal isOpen={open} onClose={()=>setOpen(false)} title={title+" · "+c.sourceMethod} fitVisualViewport className="max-w-2xl">
      <div className="max-h-[70dvh] space-y-3 overflow-auto pr-2 text-sm leading-relaxed text-text-secondary">{children}</div>
    </Modal>
  </>;
}
