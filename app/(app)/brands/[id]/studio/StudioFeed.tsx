"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudioSession, type FeedItem } from "./useStudioSession";
import type { SuggestedProduct } from "./actions";
import type { BatchSummary, RestoredBatch, RestoredHook } from "@/lib/studio/load";

/**
 * The chat-feed view of a session. State and pipeline calls live in
 * useStudioSession so this file and the node board stay in lockstep.
 */
export function StudioFeed({
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
  const {
    feed,
    batchId,
    creativeId,
    productName,
    master,
    setMaster,
    brief,
    setBrief,
    previews,
    addFiles,
    removeFile,
    clearFiles,
    pending,
    needsProduct,
    chooseCategory,
    chooseProduct,
    send,
    approve,
    generateHooks,
    applyHookToImage,
    generateCopy,
    bottomRef,
  } = session;

  const [dragging, setDragging] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  // Local aliases so the existing markup below keeps reading naturally.
  const hooks = generateHooks;
  const overlay = applyHookToImage;
  const copy = generateCopy;

  const ctaPill =
    "rounded-full px-4 py-2 text-sm font-medium bg-raised backdrop-blur border border-line hover:bg-line transition disabled:opacity-40";

  return (
    <div
      className="flex flex-col h-full relative"
      onDragEnter={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        addFiles(Array.from(e.dataTransfer.files));
      }}
    >
      {dragging && (
        <div className="absolute inset-0 z-20 m-3 rounded-3xl border-2 border-dashed border-line-strong/70 bg-canvas/70 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <span className="text-sm font-medium text-text-dim">
            Drop product photo(s) to attach
          </span>
        </div>
      )}

      {/* Sessions control */}
      <div className="absolute top-0 right-4 z-10 flex items-center gap-2">
        {batchId && (
          <button
            onClick={() => router.push(`/brands/${brandId}/studio`)}
            className="rounded-full border border-line bg-raised backdrop-blur px-3 py-1.5 text-xs font-medium hover:bg-line"
          >
            + New session
          </button>
        )}
        <div className="relative">
          <button
            onClick={() => setShowSessions((v) => !v)}
            className="rounded-full border border-line bg-raised backdrop-blur px-3 py-1.5 text-xs font-medium hover:bg-line"
          >
            Sessions ({batches.length})
          </button>
          {showSessions && (
            <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-2xl border border-black/10 dark:border-white/10 bg-surface shadow-xl p-2">
              {batches.length === 0 && (
                <p className="px-3 py-2 text-xs text-text-dim">
                  No saved sessions yet.
                </p>
              )}
              {batches.map((b) => (
                <button
                  key={b.id}
                  onClick={() => {
                    setShowSessions(false);
                    router.push(`/brands/${brandId}/studio?batch=${b.id}`);
                  }}
                  className={`w-full text-left rounded-xl px-3 py-2 text-sm hover:bg-raised ${
                    b.id === batchId ? "bg-raised" : ""
                  }`}
                >
                  <div className="truncate font-medium">{b.name}</div>
                  <div className="text-[11px] text-text-dim">
                    step {b.currentStep} · {b.status}
                    {b.hookCount ? ` · ${b.hookCount} hooks` : ""} ·{" "}
                    {new Date(b.createdAt).toLocaleDateString()}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {feed.length === 0 && (
            <div className="text-center mt-20">
              <div className="text-3xl font-semibold tracking-tight mb-2">{brandName}</div>
              <p className="text-sm text-text-dim max-w-sm mx-auto">
                Drop the real product, describe the scene, and build the ad step by
                step — image → hook → copy. Every session is saved.
              </p>
            </div>
          )}

          {feed.map((item, i) => {
            switch (item.kind) {
              case "categories":
                return (
                  <div key={i} className="rounded-3xl bg-surface text-text p-5 border border-black/5 shadow-sm">
                    <div className="text-[11px] uppercase tracking-widest text-text-dim mb-3">
                      Which category are we advertising?
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.categories.map((c) => (
                        <button
                          key={c}
                          onClick={() => chooseCategory(c)}
                          disabled={pending || !!batchId}
                          className={`rounded-full px-4 py-2 text-sm border transition disabled:opacity-60 ${
                            item.selected === c
                              ? "bg-text text-canvas border-text"
                              : "bg-surface-2 border-line text-text hover:border-line-strong"
                          }`}
                        >
                          {c}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              case "products":
                return (
                  <div key={i} className="rounded-3xl bg-surface text-text p-5 border border-black/5 shadow-sm">
                    <div className="text-[11px] uppercase tracking-widest text-text-dim mb-3">
                      Pick the product this ad features
                    </div>
                    <div className="flex flex-col gap-2">
                      {item.products.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => chooseProduct(p)}
                          disabled={pending || !!batchId}
                          className={`flex items-start justify-between gap-3 rounded-2xl px-4 py-2.5 text-left text-sm border transition disabled:opacity-60 ${
                            item.selected === p.name
                              ? "bg-text text-canvas border-text"
                              : "bg-surface-2 border-line text-text hover:border-line-strong"
                          }`}
                        >
                          <span className="flex items-center gap-3 min-w-0">
                            {p.imageUrl && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={p.imageUrl}
                                alt=""
                                className="h-14 w-14 shrink-0 rounded-xl object-cover border border-line-strong bg-surface-2"
                              />
                            )}
                            <span className="min-w-0">
                              <span className="font-medium">{p.name}</span>
                              {p.why && (
                                <span className={`block text-xs mt-0.5 ${item.selected === p.name ? "text-text-dim" : "text-text-faint"}`}>
                                  {p.why}
                                </span>
                              )}
                            </span>
                          </span>
                          {p.priceText && (
                            <span className="shrink-0 text-xs text-text-faint">{p.priceText}</span>
                          )}
                        </button>
                      ))}
                    </div>
                    {item.selected && (
                      <p className="mt-3 text-xs text-text-faint">
                        Now describe the scene you want in the box below.
                      </p>
                    )}
                  </div>
                );
              case "user":
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-surface-2 text-text px-4 py-3 shadow-sm">
                      {item.thumbs.length > 0 && (
                        <div className="flex gap-2 mb-2">
                          {item.thumbs.map((t, j) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={j} src={t} alt="" className="h-16 w-16 rounded-xl object-cover border border-white/20" />
                          ))}
                        </div>
                      )}
                      <p className="text-sm leading-relaxed">{item.text}</p>
                    </div>
                  </div>
                );
              case "engine":
                return (
                  <div key={i} className="rounded-3xl bg-surface text-text p-5 border border-black/5 shadow-sm">
                    <div className="text-[11px] uppercase tracking-widest text-text-dim mb-2">Visual system</div>
                    <p className="text-xs text-text-dim whitespace-pre-wrap mb-4">{item.visualSystem}</p>
                    <div className="text-[11px] uppercase tracking-widest text-text-dim mb-2">
                      Master prompt {item.approved ? "· approved ✓" : "· review & edit before generating"}
                    </div>
                    {item.approved ? (
                      <p className="text-xs text-text-dim whitespace-pre-wrap">{item.masterPrompt}</p>
                    ) : (
                      <>
                        <textarea
                          value={master}
                          onChange={(e) => setMaster(e.target.value)}
                          rows={9}
                          className="w-full rounded-2xl bg-surface-2 border border-line p-3 text-xs text-text font-mono leading-relaxed"
                        />
                        <div className="mt-3 flex justify-end">
                          <button onClick={approve} disabled={pending} className="rounded-full px-5 py-2 text-sm font-medium bg-text text-canvas hover:opacity-90 disabled:opacity-40">
                            Approve & generate image →
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              case "image":
                return (
                  <div key={i} className="rounded-3xl overflow-hidden bg-surface border border-black/5 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt="generated" className="w-full" />
                    <div className="p-3 flex justify-end">
                      <button onClick={hooks} disabled={pending} className={ctaPill}>Generate hooks →</button>
                    </div>
                  </div>
                );
              case "hooks":
                return (
                  <div key={i} className="rounded-3xl bg-surface text-text p-5 border border-black/5 shadow-sm">
                    <div className="text-[11px] uppercase tracking-widest text-text-dim mb-3">Pick a hook to design onto the image</div>
                    <div className="flex flex-col gap-2">
                      {item.hooks.map((h) => (
                        <button key={h.id} onClick={() => overlay(h)} disabled={pending}
                          title={`${h.visual}\n\n${h.why}`}
                          className={`group flex items-center justify-between gap-3 rounded-2xl px-4 py-2.5 text-left text-sm border transition ${
                            item.selected === h.text
                              ? "bg-text text-canvas border-text"
                              : "bg-surface-2 border-line text-text hover:border-line-strong"
                          }`}>
                          <span>
                            {h.text}
                            {h.emphasis && (
                              <span className={`ml-2 text-xs ${item.selected === h.text ? "text-text-dim" : "text-text-faint"}`}>
                                accent: {h.emphasis}
                              </span>
                            )}
                          </span>
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wider border ${
                            item.selected === h.text
                              ? "border-line text-text-dim"
                              : "border-line-strong text-text-faint"
                          }`}>
                            {h.framework}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                );
              case "overlay":
                return (
                  <div key={i} className="rounded-3xl overflow-hidden bg-surface border border-black/5 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt="creative" className="w-full" />
                    <div className="p-3 flex justify-end">
                      <button onClick={copy} disabled={pending || !creativeId} className={ctaPill}>Generate Meta copy →</button>
                    </div>
                  </div>
                );
              case "copy":
                return (
                  <div key={i} className="rounded-3xl bg-surface text-text p-5 border border-black/5 shadow-sm space-y-3">
                    <div className="text-[11px] uppercase tracking-widest text-text-dim">Meta ad copy</div>
                    <div>
                      <div className="text-xs text-text-dim mb-1">Primary text</div>
                      <p className="text-sm whitespace-pre-wrap">{item.copy.primaryText}</p>
                    </div>
                    <div className="flex gap-8">
                      <div><div className="text-xs text-text-dim mb-1">Headline</div><p className="text-sm font-medium">{item.copy.headline}</p></div>
                      <div><div className="text-xs text-text-dim mb-1">CTA</div><p className="text-sm font-medium">{item.copy.cta}</p></div>
                    </div>
                  </div>
                );
              case "status":
                return (
                  <div key={i} className="flex items-center gap-2 text-sm text-text-dim px-2">
                    <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                    {item.text}
                  </div>
                );
              case "info":
                return (
                  <div key={i} className="rounded-2xl bg-warn/10 border border-warn/30 px-4 py-3 text-sm text-warn whitespace-pre-wrap">
                    {item.text}
                  </div>
                );
              case "error":
                return (
                  <div key={i} className="rounded-2xl bg-bad/10 border border-bad/30 px-4 py-3 text-sm text-bad whitespace-pre-wrap">
                    {item.text}
                  </div>
                );
            }
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Floating glass composer with gradient glow */}
      <div className="px-4 pb-6">
        <div className="mx-auto max-w-2xl relative">
          <div className="absolute -inset-1 rounded-[32px] bg-gradient-to-r from-accent/25 via-accent-2/20 to-warn/15 blur-2xl" />
          <div className="relative rounded-[28px] border border-line bg-surface/80 backdrop-blur-xl shadow-[0_10px_50px_rgba(0,0,0,0.15)] p-3">
            {previews.length > 0 && (
              <div className="flex gap-2 mb-2 px-1">
                {previews.map((p, i) => (
                  <div key={i} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" className="h-14 w-14 rounded-xl object-cover border border-line-strong" />
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-text text-canvas text-xs leading-none opacity-0 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button onClick={clearFiles} className="text-xs text-text-dim hover:text-text self-center">clear</button>
              </div>
            )}

            <input
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              onPaste={(e) => {
                const imgs = Array.from(e.clipboardData.files);
                if (imgs.some((f) => f.type.startsWith("image/"))) addFiles(imgs);
              }}
              placeholder={
                batchId
                  ? "Start a new session to describe a different image…"
                  : needsProduct
                    ? "Pick a category and product above first…"
                    : productName
                      ? `Describe the scene for the ${productName}…`
                      : "Describe the image you need…  (drop or paste a product photo)"
              }
              disabled={!!batchId || (needsProduct)}
              className="w-full bg-transparent outline-none text-sm px-2 py-2 disabled:opacity-50"
            />

            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-2">
                <button onClick={() => fileInput.current?.click()} title="Attach product photos" disabled={!!batchId || (needsProduct)}
                  className="h-9 w-9 rounded-full bg-raised border border-line text-lg leading-none hover:bg-line disabled:opacity-40">+</button>
                <span className="rounded-full px-3 py-1.5 text-xs font-medium bg-raised border border-line">Image</span>
                <span className="rounded-full px-3 py-1.5 text-xs text-text-faint border border-transparent" title="Coming soon">Video</span>
              </div>
              <button onClick={send} disabled={pending || !brief.trim() || !!batchId || (needsProduct)}
                className="h-10 w-10 rounded-full bg-text text-canvas grid place-items-center hover:opacity-90 disabled:opacity-40">
                {pending ? "…" : "↑"}
              </button>
            </div>
            <div className="mt-2 h-1 rounded-full bg-gradient-to-r from-accent via-accent-2 to-warn opacity-60" />
          </div>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(Array.from(e.target.files ?? []))} />
        </div>
      </div>
    </div>
  );
}
