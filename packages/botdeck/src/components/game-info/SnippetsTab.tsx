import { useEffect, useState } from "react";
import { snippetsUrl } from "@/play";
import type { PlaySnippet } from "@/types";
import { SectionTitle } from "./shared";

interface SnippetDescriptor {
  id: string;
  name: string;
}

interface SnippetsTabProps {
  playId: string;
  disabled?: boolean;
  onRun: (snippet: PlaySnippet) => void;
}

export function SnippetsTab({ playId, disabled, onRun }: SnippetsTabProps) {
  const [snippets, setSnippets] = useState<SnippetDescriptor[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlaySnippet | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch(snippetsUrl(playId))
      .then(async (r) => {
        if (!r.ok) throw new Error(`list snippets failed: ${r.status}`);
        return (await r.json()) as SnippetDescriptor[];
      })
      .then((list) => {
        if (cancelled) return;
        setSnippets(list);
        setError(undefined);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playId]);

  useEffect(() => {
    if (!selected) return;
    const { game, id } = (() => {
      const [game, id] = playId.split("/");
      return { game: game!, id: id! };
    })();
    let cancelled = false;
    fetch(`/api/plays/${encodeURIComponent(game)}/${encodeURIComponent(id)}/snippets/${encodeURIComponent(selected)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`read snippet failed: ${r.status}`);
        return (await r.json()) as PlaySnippet;
      })
      .then((snippet) => {
        if (!cancelled) setDetail(snippet);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [selected, playId]);

  return (
    <div className="flex h-full flex-col gap-3 text-sm">
      <SectionTitle>Play Snippets</SectionTitle>
      <p className="text-xs text-neutral-400">
        Reproducible button sequences that start from a saved snapshot. Select a snippet to preview,
        then click Run to load its start state and play the steps.
      </p>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      {loading ? (
        <p className="text-xs text-neutral-500">Loading snippets...</p>
      ) : snippets.length === 0 ? (
        <p className="text-xs text-neutral-500">No snippets found for this play.</p>
      ) : (
        <ul className="flex flex-col gap-1">
          {snippets.map((s) => (
            <li
              key={s.id}
              className={`flex items-center justify-between rounded border px-2 py-1 text-xs ${
                selected === s.id
                  ? "border-emerald-500/50 bg-emerald-500/10"
                  : "border-neutral-700 bg-neutral-800"
              }`}
            >
              <button
                onClick={() => setSelected(s.id)}
                className="flex-1 text-left text-neutral-200 hover:text-neutral-100"
              >
                {s.name}
              </button>
              <button
                onClick={() => detail && onRun(detail)}
                disabled={disabled || selected !== s.id || !detail}
                className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                Run
              </button>
            </li>
          ))}
        </ul>
      )}

      {detail && (
        <div className="min-h-0 flex-1 overflow-auto rounded border border-neutral-800 bg-neutral-950 p-2">
          <h4 className="text-xs font-medium text-neutral-300">{detail.name}</h4>
          <p className="mt-1 text-xs text-neutral-400">{detail.description}</p>
          <p className="mt-2 text-xs text-neutral-500">
            Start state: <span className="text-neutral-300">{detail.startState}</span>
          </p>
          {detail.expectedEndState && (
            <p className="text-xs text-neutral-500">
              Expected end: <span className="text-neutral-300">{detail.expectedEndState}</span>
            </p>
          )}
          <ol className="mt-2 list-decimal pl-4 text-xs text-neutral-400">
            {detail.steps.map((step, i) => (
              <li key={i}>
                {step.kind === "command" && (
                  <>
                    command: <span className="text-neutral-200">{step.command.name}</span>
                    {step.command.args && (
                      <span className="text-neutral-500">
                        {" "}
                        {JSON.stringify(step.command.args)}
                      </span>
                    )}
                  </>
                )}
                {step.kind === "macro" && (
                  <>
                    macro: <span className="text-neutral-200">{step.buttonSteps.length} steps</span>
                  </>
                )}
                {step.kind === "wait" && (
                  <>
                    wait: <span className="text-neutral-200">{step.frames} frames</span>
                  </>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
