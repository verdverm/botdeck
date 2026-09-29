import { JsonEditor, githubDarkTheme } from "json-edit-react";
import type { CollectedState } from "@/emulator/collectState";

interface StateViewerProps {
  data: CollectedState | null;
}

/**
 * Renders the snapshot produced by the "Collect state" process as collapsible
 * JSON via json-edit-react's JsonEditor (read-only). Docked in the right-hand
 * column of the layout; collapsed to one level by default so the huge
 * cpu/papu arrays stay tucked away until you open them.
 */
export function StateViewer({ data }: StateViewerProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
          Game State
        </h2>
        {data && (
          <span className="text-xs text-neutral-500">{data.capturedAt}</span>
        )}
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
            No snapshot collected yet. Use "Collect state" to sample the
            emulator.
          </p>
        )}
      </div>
    </div>
  );
}
