"use client";
import type { KeyboardEvent } from "react";

export function MetricTabs<T extends string>({ id, label, value, options, onChange }: {
  id: string; label: string; value: T; options: { value: T; label: string }[]; onChange: (value: T) => void;
}) {
  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % options.length;
    else if (event.key === "ArrowLeft") next = (index + options.length - 1) % options.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else return;
    event.preventDefault();
    onChange(options[next].value);
    document.getElementById(id + "-" + options[next].value)?.focus();
  };
  return <div role="tablist" aria-label={label} className="inline-flex max-w-full flex-wrap rounded bg-surface-secondary p-0.5">
    {options.map((option, index) => <button type="button" role="tab" id={id + "-" + option.value}
      aria-controls={id + "-panel"} aria-selected={value === option.value} tabIndex={value === option.value ? 0 : -1}
      key={option.value} onClick={() => onChange(option.value)} onKeyDown={event => move(event, index)}
      className={"min-h-8 rounded px-2.5 text-[11px] focus-visible:outline-2 focus-visible:outline-yearn-blue " + (value === option.value ? "bg-surface font-bold shadow-sm" : "text-text-secondary hover:text-text-primary")}>{option.label}</button>)}
  </div>;
}
