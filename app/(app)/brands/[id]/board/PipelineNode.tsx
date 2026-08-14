"use client";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { STATUS_LABEL, STATUS_STYLE, type GraphNodeState } from "@/lib/studio/graph";

/**
 * One step of the pipeline as a node card: title, status, real parameter rows,
 * labeled ports, and a thumbnail for the steps that produce an image.
 *
 * Every row shown here is a parameter that genuinely exists in the pipeline —
 * BUILD_PLAN decision #2 rules out decorative seed/sampler knobs copied from
 * the reference screenshots.
 */
export function PipelineNode({ data, selected }: NodeProps) {
  const n = data as unknown as GraphNodeState;
  const s = STATUS_STYLE[n.status];
  const dim = n.status === "locked";

  return (
    <div
      className={`w-[268px] rounded-2xl border bg-surface/95 backdrop-blur transition-shadow ${
        selected ? "border-accent shadow-[0_0_0_3px_rgba(110,168,255,0.18)]" : s.ring
      } ${dim ? "opacity-55" : ""}`}
    >
      {/* ports */}
      <Handle
        type="target"
        position={Position.Left}
        className="!h-2.5 !w-2.5 !border-0 !bg-line-strong"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2.5 !w-2.5 !border-0 !bg-accent"
      />

      <div className="flex items-start justify-between gap-2 px-3.5 pt-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold leading-tight text-text">{n.title}</div>
          <div className="text-[11px] text-text-faint leading-tight mt-0.5">{n.subtitle}</div>
        </div>
        <span className={`flex shrink-0 items-center gap-1.5 text-[10px] ${s.text}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
          {STATUS_LABEL[n.status]}
        </span>
      </div>

      {n.thumbUrl && (
        <div className="mt-2.5 px-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={n.thumbUrl}
            alt=""
            className="w-full rounded-lg border border-line object-cover max-h-36"
          />
        </div>
      )}

      <div className="mt-2.5 px-3.5 pb-3 space-y-1">
        {n.params.map((p) => (
          <div
            key={p.label}
            className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-2 py-1"
          >
            <span className="text-[10px] uppercase tracking-wider text-text-faint">
              {p.label}
            </span>
            <span className="text-[11px] text-text-dim truncate max-w-[140px]">{p.value}</span>
          </div>
        ))}
      </div>

      {n.isFocus && (
        <div className="border-t border-warn/25 bg-warn/10 px-3.5 py-1.5 text-[10px] text-warn rounded-b-2xl">
          Click to continue
        </div>
      )}
    </div>
  );
}
