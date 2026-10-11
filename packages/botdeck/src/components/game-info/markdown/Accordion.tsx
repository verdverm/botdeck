import { useState, type ReactNode } from "react";

interface AccordionProps {
  title: ReactNode;
  /** Short right-aligned chip (e.g. layer/source label). */
  badge?: ReactNode;
  subtitle?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * A single expand/collapse panel. The markdown tab renders many of these and
 * allows multiple to stay open at once ("multi-display") because each holds
 * its own open state, so they compose freely.
 */
export function Accordion({ title, badge, subtitle, defaultOpen = false, children }: AccordionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded border border-neutral-700 bg-neutral-800">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
      >
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-xs font-medium text-neutral-200">{title}</span>
          {subtitle && <span className="truncate text-[11px] text-neutral-500">{subtitle}</span>}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {badge}
          <span className="text-xs text-neutral-500">{open ? "▾" : "▸"}</span>
        </span>
      </button>
      {open && <div className="border-t border-neutral-700 p-2">{children}</div>}
    </div>
  );
}
