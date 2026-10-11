import { useState } from "react";
import { MarkdownView } from "./MarkdownView";
import { Accordion } from "./Accordion";

export type ViewMode = "rendered" | "raw";

/**
 * The single rendered/raw choice for the whole markdown tab. It lives here so
 * every section shares it; the parent owns the state and passes it down, so the
 * user toggles the display mode once rather than clicking every accordion.
 */
export function ViewToggle({
  mode,
  onMode,
}: {
  mode: ViewMode;
  onMode: (m: ViewMode) => void;
}) {
  return (
    <div className="flex gap-1">
      {(["rendered", "raw"] as ViewMode[]).map((m) => (
        <button
          key={m}
          onClick={() => onMode(m)}
          className={`rounded px-2 py-0.5 text-[11px] font-medium ${
            mode === m
              ? "bg-neutral-700 text-neutral-100"
              : "text-neutral-400 hover:bg-neutral-700/50"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export function CharChip({ value, limit }: { value: string; limit: string }) {
  const max = parseInt(limit, 10);
  const over = Number.isFinite(max) && value.length > max;
  return (
    <span className={`text-[11px] ${over ? "text-rose-400" : "text-neutral-500"}`}>
      {value.length}
      {Number.isFinite(max) ? `/${max}` : ""}
    </span>
  );
}

interface GoalsSectionProps {
  goals: string;
  limit: string;
  /** Global view mode from the parent. */
  mode: ViewMode;
  disabled?: boolean;
  onSave: (content: string) => Promise<void>;
}

/** Goals are a single fixed file (`goals/goals.md`), so one accordion. */
export function GoalsSection({ goals, limit, mode, disabled, onSave }: GoalsSectionProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(goals);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const startEdit = () => {
    setDraft(goals);
    setError(undefined);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await onSave(draft);
      setEditing(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Accordion
      title="Goals"
      subtitle={`plays/<game>/<id>/goals/goals.md · limit ${limit} chars`}
      badge={<CharChip value={goals} limit={limit} />}
    >
      {error && <p className="mb-1 text-xs text-rose-400">{error}</p>}
      <div className="mb-2 flex justify-end gap-2">
        {editing ? (
          <>
            <button
              onClick={() => {
                setEditing(false);
                setDraft(goals);
              }}
              className="rounded bg-neutral-700 px-2 py-0.5 text-xs text-neutral-200 hover:bg-neutral-600"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={disabled || saving}
              className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </>
        ) : (
          <button
            onClick={startEdit}
            disabled={disabled}
            className="rounded bg-neutral-600 px-2 py-0.5 text-xs text-white hover:bg-neutral-500 disabled:opacity-50"
          >
            Edit
          </button>
        )}
      </div>
      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="h-48 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 focus:border-neutral-500 focus:outline-none"
        />
      ) : mode === "rendered" ? (
        goals.trim() ? (
          <MarkdownView content={goals} />
        ) : (
          <p className="text-xs text-neutral-500">(no goals set)</p>
        )
      ) : (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-neutral-950 p-2 text-xs text-neutral-300">
          {goals || "(empty)"}
        </pre>
      )}
    </Accordion>
  );
}
