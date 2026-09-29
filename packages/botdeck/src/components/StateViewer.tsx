import { JsonEditor, githubDarkTheme } from "json-edit-react";
import type { CollectedState } from "@/emulator/collectState";

interface StateViewerProps {
  data: CollectedState | null;
  onClose: () => void;
}

/**
 * Renders the snapshot produced by the "Collect state" process as collapsible
 * JSON via json-edit-react's JsonEditor (read-only). Collapsed to one level by
 * default so the huge cpu/papu arrays stay tucked away until you open them.
 */
export function StateViewer({ data, onClose }: StateViewerProps) {
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-black/60">
      <div className="flex h-full w-full max-w-2xl flex-col gap-3 border-l border-neutral-800 bg-neutral-950 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
            Game State{data ? ` · ${data.capturedAt}` : ""}
          </h2>
          <button
            onClick={onClose}
            className="rounded bg-neutral-700 px-3 py-1 text-sm hover:bg-neutral-600"
          >
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm">
          {data ? (
            <JsonEditor
              data={data as unknown as object}
              viewOnly
              collapse={2}
              rootName="state"
              theme={[githubDarkTheme, {}]}
              showCollectionCount="when-closed"
              maxWidth="100%"
            />
          ) : (
            <p className="text-neutral-500">
              No snapshot collected yet. Load a ROM and hit "Collect state".
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
