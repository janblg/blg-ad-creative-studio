import type { FeedItem } from "@/app/(app)/brands/[id]/studio/useStudioSession";

/**
 * The board's graph is DERIVED from session state, never stored.
 *
 * BUILD_PLAN is explicit that there are no nodes/edges tables: the pipeline is
 * a fixed spine, so the board is a projection of the batch. That keeps freeform
 * wiring a future UI capability rather than a schema migration, and means the
 * feed and the board can never disagree about where a session actually is.
 */

export type NodeStatus = "locked" | "ready" | "running" | "awaiting" | "done";

export type StepId =
  | "product"
  | "engine"
  | "image"
  | "hooks"
  | "overlay"
  | "copy"
  | "review";

export interface GraphNodeState {
  id: StepId;
  title: string;
  /** What this step does, one short line — shown under the title. */
  subtitle: string;
  status: NodeStatus;
  /** Compact key/value rows rendered inside the node card. */
  params: { label: string; value: string }[];
  /** Thumbnail for image-producing steps. */
  thumbUrl?: string;
  /** True when the operator has to act here next. */
  isFocus: boolean;
}

export const STEP_ORDER: StepId[] = [
  "product",
  "engine",
  "image",
  "hooks",
  "overlay",
  "copy",
  "review",
];

const truncate = (s: string, n: number) =>
  s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;

export interface DeriveInput {
  feed: FeedItem[];
  pending: boolean;
  category: string | null;
  productName: string | null;
  hasCatalog: boolean;
}

export function deriveGraph(input: DeriveInput): GraphNodeState[] {
  const { feed, pending, category, productName, hasCatalog } = input;
  const last = <T extends FeedItem["kind"]>(kind: T) =>
    [...feed].reverse().find((i) => i.kind === kind) as
      | Extract<FeedItem, { kind: T }>
      | undefined;

  const user = last("user");
  const engine = last("engine");
  const image = last("image");
  const hooks = last("hooks");
  const overlay = last("overlay");
  const copy = last("copy");
  const status = feed.find((i) => i.kind === "status") as
    | Extract<FeedItem, { kind: "status" }>
    | undefined;

  // Which step is the in-flight one? The status line is the only signal that
  // says WHICH request is running, so it is matched rather than guessed.
  const runningStep: StepId | null = (() => {
    if (!pending || !status) return null;
    const t = status.text.toLowerCase();
    if (t.includes("finding the best")) return "product";
    if (t.includes("prompt engine") || t.includes("uploading")) return "engine";
    if (t.includes("generating the image")) return "image";
    if (t.includes("hook options")) return "hooks";
    if (t.includes("art-directing")) return "overlay";
    if (t.includes("meta copy")) return "copy";
    return null;
  })();

  const nodes: GraphNodeState[] = [];
  const at = (id: StepId, s: NodeStatus) => (runningStep === id ? "running" : s);

  // --- product ---
  const productDone = hasCatalog ? !!productName : !!user;
  nodes.push({
    id: "product",
    title: hasCatalog ? "Product" : "Brief",
    subtitle: hasCatalog ? "Category → catalog item" : "What to advertise",
    status: at("product", productDone ? "done" : "ready"),
    params: [
      ...(category ? [{ label: "category", value: truncate(category, 28) }] : []),
      ...(productName ? [{ label: "item", value: truncate(productName, 30) }] : []),
      ...(!hasCatalog && user ? [{ label: "brief", value: truncate(user.text, 30) }] : []),
    ],
    isFocus: !productDone,
  });

  // --- prompt engine ---
  const engineReady = productDone;
  nodes.push({
    id: "engine",
    title: "Prompt Engine",
    subtitle: "Hyperrealism master prompt",
    status: at(
      "engine",
      !engine ? (engineReady ? "ready" : "locked") : engine.approved ? "done" : "awaiting",
    ),
    params: engine
      ? [
          { label: "visual system", value: engine.visualSystem ? "resolved" : "—" },
          { label: "master prompt", value: `${engine.masterPrompt.split(/\s+/).length} words` },
          { label: "approval", value: engine.approved ? "approved" : "needs review" },
        ]
      : [{ label: "waiting on", value: hasCatalog ? "product + brief" : "brief" }],
    isFocus: !!engine && !engine.approved,
  });

  // --- image ---
  nodes.push({
    id: "image",
    title: "Image",
    subtitle: "gpt-image-1 · 4:5",
    status: at("image", image ? "done" : engine?.approved ? "ready" : "locked"),
    params: [
      { label: "size", value: "1080×1350" },
      { label: "variants", value: "1" },
      { label: "reference", value: productName ? "catalog photo" : "prompt only" },
    ],
    thumbUrl: image?.url,
    isFocus: !!engine?.approved && !image,
  });

  // --- hooks ---
  nodes.push({
    id: "hooks",
    title: "Hooks",
    subtitle: "Hook Engine · 10 options",
    status: at(
      "hooks",
      !hooks ? (image ? "ready" : "locked") : hooks.selected ? "done" : "awaiting",
    ),
    params: hooks
      ? [
          { label: "generated", value: `${hooks.hooks.length}` },
          {
            label: "frameworks",
            value: `${new Set(hooks.hooks.map((h) => h.framework)).size}`,
          },
          { label: "chosen", value: hooks.selected ? truncate(hooks.selected, 26) : "—" },
        ]
      : [{ label: "waiting on", value: "image" }],
    isFocus: !!hooks && !hooks.selected,
  });

  // --- overlay ---
  nodes.push({
    id: "overlay",
    title: "Overlay",
    subtitle: "Vision layout → vector text",
    status: at("overlay", overlay ? "done" : hooks?.selected ? "ready" : "locked"),
    params: [
      { label: "renderer", value: "satori + resvg" },
      { label: "style", value: "flyer" },
      { label: "accent", value: "brand" },
    ],
    thumbUrl: overlay?.url,
    isFocus: false,
  });

  // --- copy ---
  nodes.push({
    id: "copy",
    title: "Meta Copy",
    subtitle: "Primary · headline · CTA",
    status: at("copy", copy ? "done" : overlay ? "ready" : "locked"),
    params: copy
      ? [
          { label: "headline", value: truncate(copy.copy.headline, 26) },
          { label: "cta", value: copy.copy.cta },
        ]
      : [{ label: "waiting on", value: "creative" }],
    isFocus: !!overlay && !copy,
  });

  // --- review (Phase 6 lands here) ---
  nodes.push({
    id: "review",
    title: "Review",
    subtitle: "Manager approval · export",
    status: copy ? "ready" : "locked",
    params: [{ label: "status", value: copy ? "ready to review" : "—" }],
    isFocus: false,
  });

  return nodes;
}

export const STATUS_LABEL: Record<NodeStatus, string> = {
  locked: "waiting",
  ready: "ready",
  running: "running",
  awaiting: "needs you",
  done: "done",
};

/** Tailwind classes per status — one place so the canvas and drawer agree. */
export const STATUS_STYLE: Record<NodeStatus, { dot: string; text: string; ring: string }> = {
  locked: { dot: "bg-text-faint", text: "text-text-faint", ring: "border-line" },
  ready: { dot: "bg-accent", text: "text-accent", ring: "border-accent/40" },
  running: { dot: "bg-warn animate-pulse", text: "text-warn", ring: "border-warn/60" },
  awaiting: { dot: "bg-warn", text: "text-warn", ring: "border-warn/60" },
  done: { dot: "bg-ok", text: "text-ok", ring: "border-ok/40" },
};
