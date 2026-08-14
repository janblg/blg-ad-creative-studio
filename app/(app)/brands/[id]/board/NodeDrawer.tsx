"use client";
import type { StudioSession } from "../studio/useStudioSession";
import type { GraphNodeState, StepId } from "@/lib/studio/graph";
import { STATUS_LABEL, STATUS_STYLE } from "@/lib/studio/graph";
import type { RestoredHook } from "@/lib/studio/load";
import type { AdCopy } from "@/lib/ai/creative";
import type { SuggestedProduct } from "../studio/actions";

/**
 * The detail panel for a selected node. This is where a step is actually
 * worked: editing the master prompt, choosing a hook, reading the copy. The
 * node card stays a summary; the drawer holds the controls.
 */
export function NodeDrawer({
  node,
  session,
  onClose,
}: {
  node: GraphNodeState;
  session: StudioSession;
  onClose: () => void;
}) {
  const s = STATUS_STYLE[node.status];
  const find = <T extends string>(kind: T) =>
    [...session.feed].reverse().find((i) => i.kind === kind);

  return (
    <aside className="w-[400px] shrink-0 border-l border-line bg-surface flex flex-col">
      <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <div className="text-sm font-semibold">{node.title}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
            <span className={`text-[11px] ${s.text}`}>{STATUS_LABEL[node.status]}</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-md border border-line px-2 py-1 text-xs text-text-dim hover:bg-raised"
        >
          Close
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {node.id === "product" && <ProductPanel session={session} />}
        {node.id === "engine" && <EnginePanel session={session} />}
        {node.id === "image" && <ImagePanel session={session} find={find} />}
        {node.id === "hooks" && <HooksPanel session={session} find={find} />}
        {node.id === "overlay" && <OverlayPanel session={session} find={find} />}
        {node.id === "copy" && <CopyPanel session={session} find={find} />}
        {node.id === "review" && (
          <p className="text-sm text-text-dim">
            Manager review, comment threads and export land here in the next phase.
            The finished creative and copy are already saved to this session.
          </p>
        )}
      </div>
    </aside>
  );
}

const Label = ({ children }: { children: React.ReactNode }) => (
  <div className="text-[11px] uppercase tracking-widest text-text-faint mb-1.5">{children}</div>
);

function ProductPanel({ session }: { session: StudioSession }) {
  const cats = [...session.feed].reverse().find((i) => i.kind === "categories") as
    | { categories: string[]; selected?: string }
    | undefined;
  const prods = [...session.feed].reverse().find((i) => i.kind === "products") as
    | { products: SuggestedProduct[]; selected?: string }
    | undefined;

  return (
    <>
      {cats && (
        <div>
          <Label>Category</Label>
          <div className="flex flex-wrap gap-1.5">
            {cats.categories.map((c) => (
              <button
                key={c}
                onClick={() => session.chooseCategory(c)}
                disabled={session.pending || !!session.batchId}
                className={`rounded-full border px-3 py-1.5 text-xs transition disabled:opacity-60 ${
                  cats.selected === c
                    ? "bg-text text-canvas border-text"
                    : "bg-surface-2 border-line text-text hover:border-line-strong"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}
      {prods && (
        <div>
          <Label>Product</Label>
          <div className="space-y-1.5">
            {prods.products.map((p) => (
              <button
                key={p.id}
                onClick={() => session.chooseProduct(p)}
                disabled={session.pending || !!session.batchId}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left text-xs transition disabled:opacity-60 ${
                  prods.selected === p.name
                    ? "bg-text text-canvas border-text"
                    : "bg-surface-2 border-line text-text hover:border-line-strong"
                }`}
              >
                {p.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.imageUrl}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-md object-cover border border-line-strong"
                  />
                )}
                <span className="min-w-0">
                  <span className="block font-medium truncate">{p.name}</span>
                  {p.why && (
                    <span
                      className={`block truncate ${
                        prods.selected === p.name ? "text-canvas/70" : "text-text-faint"
                      }`}
                    >
                      {p.why}
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
      {!cats && !prods && (
        <p className="text-sm text-text-dim">
          Describe the ad in the composer to start a session.
        </p>
      )}
    </>
  );
}

function EnginePanel({ session }: { session: StudioSession }) {
  const engine = [...session.feed].reverse().find((i) => i.kind === "engine") as
    | { visualSystem: string; masterPrompt: string; approved: boolean }
    | undefined;
  if (!engine) {
    return (
      <p className="text-sm text-text-dim">
        Send a brief and the engine will resolve the visual system and master prompt here.
      </p>
    );
  }
  return (
    <>
      <div>
        <Label>Visual system</Label>
        <p className="text-xs text-text-dim whitespace-pre-wrap">{engine.visualSystem}</p>
      </div>
      <div>
        <Label>Master prompt {engine.approved ? "· approved" : "· editable"}</Label>
        {engine.approved ? (
          <p className="text-xs text-text-dim whitespace-pre-wrap">{engine.masterPrompt}</p>
        ) : (
          <>
            <textarea
              value={session.master}
              onChange={(e) => session.setMaster(e.target.value)}
              rows={14}
              className="w-full rounded-xl border border-line bg-surface-2 p-2.5 text-[11px] font-mono leading-relaxed text-text"
            />
            <button
              onClick={session.approve}
              disabled={session.pending}
              className="mt-2 w-full rounded-full bg-text px-4 py-2 text-sm font-medium text-canvas hover:opacity-90 disabled:opacity-40"
            >
              Approve &amp; generate image →
            </button>
          </>
        )}
      </div>
    </>
  );
}

type Finder = (kind: string) => unknown;

function ImagePanel({ session, find }: { session: StudioSession; find: Finder }) {
  const image = find("image") as { url: string } | undefined;
  const engine = find("engine") as { approved: boolean } | undefined;
  return (
    <>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image.url} alt="generated" className="w-full rounded-xl border border-line" />
      ) : (
        <p className="text-sm text-text-dim">
          {engine?.approved
            ? "Ready to generate."
            : "Approve the master prompt first."}
        </p>
      )}
      {image && (
        <button
          onClick={session.generateHooks}
          disabled={session.pending}
          className="w-full rounded-full bg-raised border border-line px-4 py-2 text-sm font-medium hover:bg-line disabled:opacity-40"
        >
          Generate hooks →
        </button>
      )}
    </>
  );
}

function HooksPanel({ session, find }: { session: StudioSession; find: Finder }) {
  const hooks = find("hooks") as { hooks: RestoredHook[]; selected?: string } | undefined;
  if (!hooks) {
    return <p className="text-sm text-text-dim">Generate the image, then the hook library.</p>;
  }
  return (
    <div className="space-y-1.5">
      <Label>Pick the hook to design on</Label>
      {hooks.hooks.map((h) => (
        <button
          key={h.id}
          onClick={() => session.applyHookToImage(h)}
          disabled={session.pending}
          title={`${h.visual}\n\n${h.why}`}
          className={`flex w-full items-start justify-between gap-2 rounded-xl border px-3 py-2 text-left text-xs transition disabled:opacity-60 ${
            hooks.selected === h.text
              ? "bg-text text-canvas border-text"
              : "bg-surface-2 border-line text-text hover:border-line-strong"
          }`}
        >
          <span className="min-w-0">
            <span className="block font-medium">{h.text}</span>
            {h.emphasis && (
              <span
                className={
                  hooks.selected === h.text ? "text-canvas/70" : "text-text-faint"
                }
              >
                accent: {h.emphasis}
              </span>
            )}
          </span>
          <span
            className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
              hooks.selected === h.text ? "border-canvas/30" : "border-line text-text-faint"
            }`}
          >
            {h.framework}
          </span>
        </button>
      ))}
    </div>
  );
}

function OverlayPanel({ session, find }: { session: StudioSession; find: Finder }) {
  const overlay = find("overlay") as { url: string } | undefined;
  if (!overlay) {
    return <p className="text-sm text-text-dim">Choose a hook and the creative renders here.</p>;
  }
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={overlay.url} alt="creative" className="w-full rounded-xl border border-line" />
      <button
        onClick={session.generateCopy}
        disabled={session.pending || !session.creativeId}
        className="w-full rounded-full bg-raised border border-line px-4 py-2 text-sm font-medium hover:bg-line disabled:opacity-40"
      >
        Generate Meta copy →
      </button>
    </>
  );
}

function CopyPanel({ find }: { session: StudioSession; find: Finder }) {
  const copy = find("copy") as { copy: AdCopy } | undefined;
  if (!copy) return <p className="text-sm text-text-dim">Render the creative first.</p>;
  return (
    <>
      <div>
        <Label>Primary text</Label>
        <p className="text-sm whitespace-pre-wrap text-text-dim">{copy.copy.primaryText}</p>
      </div>
      <div>
        <Label>Headline</Label>
        <p className="text-sm font-medium">{copy.copy.headline}</p>
      </div>
      <div>
        <Label>CTA</Label>
        <p className="text-sm font-medium">{copy.copy.cta}</p>
      </div>
    </>
  );
}
