"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useStudioSession } from "../studio/useStudioSession";
import { deriveGraph, STEP_ORDER, type GraphNodeState, type StepId } from "@/lib/studio/graph";
import type { BatchSummary, RestoredBatch } from "@/lib/studio/load";
import { PipelineNode } from "./PipelineNode";
import { NodeDrawer } from "./NodeDrawer";

const NODE_TYPES = { pipeline: PipelineNode };

/** Two rows so a 7-step pipeline stays readable without endless horizontal pan. */
const POSITIONS: Record<StepId, { x: number; y: number }> = {
  product: { x: 0, y: 0 },
  engine: { x: 330, y: 0 },
  image: { x: 660, y: 0 },
  hooks: { x: 990, y: 0 },
  overlay: { x: 330, y: 330 },
  copy: { x: 660, y: 330 },
  review: { x: 990, y: 330 },
};

export function BoardShell({
  brandId,
  brandName,
  initialBatch,
  batches,
  categories,
}: {
  brandId: string;
  brandName: string;
  initialBatch?: RestoredBatch | null;
  batches: BatchSummary[];
  categories: string[];
}) {
  const router = useRouter();
  const session = useStudioSession({ brandId, initialBatch, categories });
  const [selected, setSelected] = useState<StepId | null>(null);

  const graph = useMemo(
    () =>
      deriveGraph({
        feed: session.feed,
        pending: session.pending,
        category: session.category,
        productName: session.productName,
        hasCatalog: categories.length > 0,
      }),
    [session.feed, session.pending, session.category, session.productName, categories.length],
  );

  const byId = useMemo(
    () => new Map(graph.map((n) => [n.id, n])),
    [graph],
  );

  // Auto-follow the step that needs attention, until the user picks one.
  const focus = graph.find((n) => n.isFocus)?.id ?? null;
  const active = selected ?? focus;

  const nodes: Node[] = useMemo(
    () =>
      graph.map((n) => ({
        id: n.id,
        type: "pipeline",
        position: POSITIONS[n.id],
        data: n as unknown as Record<string, unknown>,
        selected: active === n.id,
      })),
    [graph, active],
  );

  const edges: Edge[] = useMemo(() => {
    const out: Edge[] = [];
    for (let i = 0; i < STEP_ORDER.length - 1; i++) {
      const from = STEP_ORDER[i];
      const to = STEP_ORDER[i + 1];
      const fromDone = byId.get(from)?.status === "done";
      out.push({
        id: `${from}->${to}`,
        source: from,
        target: to,
        type: "smoothstep",
        animated: byId.get(to)?.status === "running",
        style: {
          stroke: fromDone ? "var(--ok)" : "var(--line-strong)",
          strokeWidth: fromDone ? 2 : 1.5,
        },
      });
    }
    return out;
  }, [byId]);

  const activeNode: GraphNodeState | null = active ? byId.get(active) ?? null : null;

  return (
    <div className="flex h-full">
      {/* ---------- left: conversation ---------- */}
      <aside className="w-[340px] shrink-0 border-r border-line bg-surface flex flex-col">
        <header className="border-b border-line px-4 py-3">
          <div className="text-sm font-semibold">{brandName}</div>
          <div className="text-[11px] text-text-faint">
            {session.batchId ? "Session in progress" : "New session"}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
          {session.feed.length === 0 && (
            <p className="text-xs text-text-dim px-1 pt-2">
              {categories.length
                ? "Pick a category on the Product node to begin."
                : "Describe the ad you want below."}
            </p>
          )}
          {session.feed.map((item, i) => {
            if (item.kind === "user") {
              return (
                <div key={i} className="rounded-xl rounded-br-sm bg-accent/15 border border-accent/25 px-3 py-2 text-xs">
                  {item.text}
                </div>
              );
            }
            if (item.kind === "status") {
              return (
                <div key={i} className="flex items-center gap-2 px-1 text-xs text-text-dim">
                  <span className="h-1.5 w-1.5 rounded-full bg-warn animate-pulse" />
                  {item.text}
                </div>
              );
            }
            if (item.kind === "error") {
              return (
                <div key={i} className="rounded-xl border border-bad/30 bg-bad/10 px-3 py-2 text-xs text-bad whitespace-pre-wrap">
                  {item.text}
                </div>
              );
            }
            if (item.kind === "info") {
              return (
                <div key={i} className="rounded-xl border border-warn/25 bg-warn/10 px-3 py-2 text-xs text-warn whitespace-pre-wrap">
                  {item.text}
                </div>
              );
            }
            // Pipeline output lives on the nodes; the log just marks progress.
            const note: Record<string, string> = {
              categories: "Categories loaded",
              products: "Products suggested",
              engine: "Master prompt ready",
              image: "Image generated",
              hooks: "Hook library written",
              overlay: "Creative rendered",
              copy: "Meta copy written",
            };
            return (
              <div key={i} className="flex items-center gap-2 px-1 text-xs text-text-faint">
                <span className="h-1.5 w-1.5 rounded-full bg-ok" />
                {note[item.kind] ?? item.kind}
              </div>
            );
          })}
          <div ref={session.bottomRef} />
        </div>

        {/* composer */}
        <div className="border-t border-line p-3">
          {session.previews.length > 0 && (
            <div className="flex gap-1.5 mb-2">
              {session.previews.map((p, i) => (
                <button
                  key={i}
                  onClick={() => session.removeFile(i)}
                  title="Remove"
                  className="relative"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt="" className="h-10 w-10 rounded-md object-cover border border-line-strong" />
                </button>
              ))}
            </div>
          )}
          <textarea
            value={session.brief}
            onChange={(e) => session.setBrief(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                session.send();
              }
            }}
            rows={2}
            disabled={!!session.batchId || session.needsProduct}
            placeholder={
              session.batchId
                ? "Start a new session for another ad…"
                : session.needsProduct
                  ? "Pick a category and product first…"
                  : session.productName
                    ? `Describe the scene for the ${session.productName}…`
                    : "Describe the image you need…"
            }
            className="w-full resize-none rounded-xl border border-line bg-surface-2 px-3 py-2 text-xs text-text disabled:opacity-50"
          />
          <div className="mt-2 flex items-center justify-between">
            <label className="cursor-pointer rounded-full border border-line bg-raised px-2.5 py-1 text-xs text-text-dim hover:bg-line">
              + photo
              <input
                type="file"
                accept="image/*"
                multiple
                hidden
                disabled={!!session.batchId || session.needsProduct}
                onChange={(e) => session.addFiles(Array.from(e.target.files ?? []))}
              />
            </label>
            <button
              onClick={session.send}
              disabled={session.pending || !session.brief.trim() || !!session.batchId || session.needsProduct}
              className="rounded-full bg-text px-3.5 py-1.5 text-xs font-medium text-canvas hover:opacity-90 disabled:opacity-40"
            >
              {session.pending ? "Working…" : "Send"}
            </button>
          </div>
        </div>
      </aside>

      {/* ---------- centre: canvas ---------- */}
      <div className="relative flex-1">
        {/* session tabs */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center gap-1.5 overflow-x-auto border-b border-line bg-canvas/85 px-3 py-2 backdrop-blur">
          {batches.slice(0, 8).map((b) => (
            <button
              key={b.id}
              onClick={() => router.push(`/brands/${brandId}/board?batch=${b.id}`)}
              className={`shrink-0 rounded-t-lg border-b-2 px-3 py-1.5 text-xs transition ${
                b.id === session.batchId
                  ? "border-accent text-text"
                  : "border-transparent text-text-faint hover:text-text-dim"
              }`}
              title={`step ${b.currentStep} · ${b.status}`}
            >
              {b.name.length > 26 ? `${b.name.slice(0, 25)}…` : b.name}
            </button>
          ))}
          <button
            onClick={() => router.push(`/brands/${brandId}/board`)}
            className="shrink-0 rounded-full border border-line px-2.5 py-1 text-xs text-text-dim hover:bg-raised"
          >
            + new
          </button>
        </div>

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          onNodeClick={(_, node) => setSelected(node.id as StepId)}
          onPaneClick={() => setSelected(null)}
          fitView
          fitViewOptions={{ padding: 0.22 }}
          proOptions={{ hideAttribution: true }}
          minZoom={0.35}
          nodesDraggable={false}
          nodesConnectable={false}
          className="pt-11"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={22}
            size={1.4}
            color="var(--line-strong)"
          />
          <Controls
            showInteractive={false}
            className="!border !border-line !bg-surface [&_button]:!border-line [&_button]:!bg-surface-2 [&_button]:!fill-text-dim [&_button:hover]:!bg-raised"
          />
        </ReactFlow>
      </div>

      {/* ---------- right: node detail ---------- */}
      {activeNode && (
        <NodeDrawer node={activeNode} session={session} onClose={() => setSelected(null)} />
      )}
    </div>
  );
}
