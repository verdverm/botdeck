import { useCallback, useEffect, useState } from "react";
import type { AgentMode, PromptConfig } from "@/types";
import {
  loadGameConfig,
  loadPlayConfig,
  parsePlayId,
  saveGameConfig,
  savePlayConfig,
} from "@/play";

type Layer = "game" | "play";

interface PromptGroupsSectionProps {
  playId: string;
  game: string;
  /** The effective resolved prompt config from the context bundle. */
  resolved: PromptConfig;
  /** Every template name available to add into a group. */
  availableNames: string[];
  disabled?: boolean;
  onChanged: () => void;
}

/**
 * Edit the per-mode snippet groups (`prompt.modes[].systemSnippets` and
 * `.userSnippets`). Changes persist to either the game config (shared) or the
 * play config (per-run override), which is the shadowing `resolvePromptConfig`
 * applies at render time. Config owns the system/user split; there is no
 * default or filename-based convention.
 */
export function PromptGroupsSection({
  playId,
  game,
  resolved,
  availableNames,
  disabled,
  onChanged,
}: PromptGroupsSectionProps) {
  const [layer, setLayer] = useState<Layer>("play");
  const [prompt, setPrompt] = useState<PromptConfig>(resolved);
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const reload = useCallback(async () => {
    setLoading(true);
    setError(undefined);
    try {
      const cfg = layer === "game" ? await loadGameConfig(game) : await loadPlayConfig(playId);
      const p = isPromptConfig(cfg.prompt) ? cfg.prompt : {};
      setPrompt(p);
      setDirty(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layer, game, playId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      if (layer === "game") {
        const cfg = await loadGameConfig(game);
        await saveGameConfig(game, { ...cfg, prompt });
      } else {
        const cfg = await loadPlayConfig(playId);
        await savePlayConfig(playId, { ...cfg, prompt });
      }
      setDirty(false);
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const updateMode = (index: number, next: AgentMode) => {
    setPrompt((p) => {
      const modes = [...(p.modes ?? [])];
      modes[index] = next;
      return { ...p, modes };
    });
    setDirty(true);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Prompt groups
        </h3>
        <div className="flex items-center gap-1">
          {(["game", "play"] as Layer[]).map((l) => (
            <button
              key={l}
              onClick={() => setLayer(l)}
              disabled={disabled}
              className={`rounded px-2 py-0.5 text-[11px] font-medium ${
                layer === l
                  ? "bg-neutral-700 text-neutral-100"
                  : "text-neutral-400 hover:bg-neutral-700/50"
              }`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      <p className="text-[11px] text-neutral-500">
        Editing the <span className="text-neutral-300">{layer}</span> config (
        {layer === "game" ? `games/${game}/config.json` : `plays/${game}/${parsePlayId(playId).id}/config.json`}). The
        play config shadows the game config at render time.
      </p>

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {loading ? (
        <p className="text-xs text-neutral-500">Loading config...</p>
      ) : (
        <>
          {(prompt.modes ?? []).map((mode, i) => (
            <div key={mode.id} className="flex flex-col gap-2">
              <h4 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300">
                Mode: {mode.label} ({mode.id})
              </h4>
              <SnippetList
                label="System snippets"
                names={mode.systemSnippets}
                available={availableNames}
                onChange={(next) => updateMode(i, { ...mode, systemSnippets: next })}
              />
              <SnippetList
                label="User snippets"
                names={mode.userSnippets}
                available={availableNames}
                onChange={(next) => updateMode(i, { ...mode, userSnippets: next })}
              />
            </div>
          ))}
          <div className="flex items-center justify-end gap-2">
            {dirty && <span className="text-[11px] text-amber-400">unsaved changes</span>}
            <button
              onClick={reload}
              disabled={disabled}
              className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-600 disabled:opacity-50"
            >
              Revert
            </button>
            <button
              onClick={save}
              disabled={disabled || saving || !dirty}
              className="rounded bg-blue-600 px-2 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save groups"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function isPromptConfig(value: unknown): value is PromptConfig {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function SnippetList({
  label,
  names,
  available,
  onChange,
}: {
  label: string;
  names: string[];
  available: string[];
  onChange: (next: string[]) => void;
}) {
  const [addName, setAddName] = useState("");

  const move = (index: number, delta: number) => {
    const next = [...names];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    const [item] = next.splice(index, 1);
    if (item === undefined) return;
    next.splice(target, 0, item);
    onChange(next);
  };

  const remove = (index: number) => {
    onChange(names.filter((_, i) => i !== index));
  };

  const add = () => {
    if (!addName) return;
    onChange([...names, addName]);
    setAddName("");
  };

  const remaining = available.filter((n) => !names.includes(n));

  return (
    <div className="rounded border border-neutral-700 bg-neutral-800 p-2">
      <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
        {label}
      </h4>
      <ul className="flex flex-col gap-1">
        {names.map((name, i) => (
          <li key={`${name}-${i}`} className="flex items-center justify-between rounded bg-neutral-900 px-2 py-1">
            <span className="text-xs text-neutral-200">{name}</span>
            <span className="flex items-center gap-1">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="rounded px-1 text-xs text-neutral-400 hover:bg-neutral-700 disabled:opacity-30">
                ↑
              </button>
              <button onClick={() => move(i, 1)} disabled={i === names.length - 1} className="rounded px-1 text-xs text-neutral-400 hover:bg-neutral-700 disabled:opacity-30">
                ↓
              </button>
              <button onClick={() => remove(i)} className="rounded px-1 text-xs text-rose-400 hover:bg-neutral-700">
                ✕
              </button>
            </span>
          </li>
        ))}
        {names.length === 0 && <li className="text-[11px] text-neutral-500">(empty)</li>}
      </ul>
      <div className="mt-2 flex items-center gap-1">
        <select
          value={addName}
          onChange={(e) => setAddName(e.target.value)}
          className="flex-1 rounded border border-neutral-700 bg-neutral-900 px-1 py-0.5 text-xs text-neutral-200"
        >
          <option value="">add template...</option>
          {remaining.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          onClick={add}
          disabled={!addName}
          className="rounded bg-neutral-700 px-2 py-0.5 text-xs text-neutral-200 hover:bg-neutral-600 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}
