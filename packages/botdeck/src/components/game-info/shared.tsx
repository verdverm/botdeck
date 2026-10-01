import type { ReactNode } from "react";

export function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded px-3 py-1 text-xs font-medium ${
        active
          ? "bg-neutral-700 text-neutral-100"
          : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"
      }`}
    >
      {label}
    </button>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
      {children}
    </h3>
  );
}
