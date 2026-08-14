"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  startBrief,
  approveAndGenerate,
  makeHooks,
  applyHook,
  makeCopy,
  suggestProducts,
  type SuggestedProduct,
} from "./actions";
import type { AdCopy } from "@/lib/ai/creative";
import type { BatchSummary, RestoredBatch, RestoredHook } from "@/lib/studio/load";

type FeedItem =
  | { kind: "categories"; categories: string[]; selected?: string }
  | { kind: "products"; products: SuggestedProduct[]; selected?: string }
  | { kind: "user"; text: string; thumbs: string[] }
  | { kind: "engine"; visualSystem: string; masterPrompt: string; approved: boolean }
  | { kind: "image"; url: string }
  | { kind: "hooks"; hooks: RestoredHook[]; selected?: string }
  | { kind: "overlay"; url: string }
  | { kind: "copy"; copy: AdCopy }
  | { kind: "status"; text: string }
  | { kind: "info"; text: string }
  | { kind: "error"; text: string };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Rebuild the visible feed from a persisted session. */
function restore(b: RestoredBatch): FeedItem[] {
  const items: FeedItem[] = [];
  if (b.category) {
    items.push({ kind: "categories", categories: [b.category], selected: b.category });
  }
  if (b.productName) {
    items.push({
      kind: "products",
      products: [{ id: "restored", name: b.productName }],
      selected: b.productName,
    });
  }
  items.push(
    { kind: "user", text: b.brief, thumbs: b.refUrls },
    {
      kind: "engine",
      visualSystem: b.visualSystem,
      masterPrompt: b.masterPrompt,
      approved: b.masterPromptApproved,
    },
  );
  if (b.imageUrl) items.push({ kind: "image", url: b.imageUrl });
  if (b.hooks.length) {
    items.push({ kind: "hooks", hooks: b.hooks, selected: b.selectedHookText });
  }
  if (b.overlayUrl) items.push({ kind: "overlay", url: b.overlayUrl });
  if (b.copy) items.push({ kind: "copy", copy: b.copy });
  return items;
}

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
  const [feed, setFeed] = useState<FeedItem[]>(() => {
    if (initialBatch) return restore(initialBatch);
    // A brand with a catalog starts by choosing a category.
    return categories.length ? [{ kind: "categories", categories }] : [];
  });
  const [category, setCategory] = useState<string | null>(initialBatch?.category ?? null);
  const [productId, setProductId] = useState<string | null>(null);
  const [productName, setProductName] = useState<string | null>(
    initialBatch?.productName ?? null,
  );
  const [batchId, setBatchId] = useState<string | null>(initialBatch?.id ?? null);
  const [creativeId, setCreativeId] = useState<string | null>(
    initialBatch?.creativeId ?? null,
  );
  const [master, setMaster] = useState(initialBatch?.masterPrompt ?? "");
  const [brief, setBrief] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const push = (item: FeedItem) =>
    setFeed((f) => {
      const next = [...f.filter((i) => i.kind !== "status"), item];
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
      return next;
    });

  const addFiles = (incoming: File[]) => {
    const imgs = incoming.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return;
    setFiles((prev) => {
      const merged = [...prev, ...imgs].slice(0, 4);
      setPreviews(merged.map((f) => URL.createObjectURL(f)));
      return merged;
    });
  };

  const clearFiles = () => {
    setFiles([]);
    setPreviews([]);
    if (fileInput.current) fileInput.current.value = "";
  };

  // Step 0a — pick a category, get five product suggestions.
  const chooseCategory = (cat: string) => {
    if (pending || batchId) return;
    setCategory(cat);
    setFeed((f) => f.map((i) => (i.kind === "categories" ? { ...i, selected: cat } : i)));
    push({ kind: "status", text: `Finding the best ${cat} to advertise…` });
    start(async () => {
      try {
        const res = await suggestProducts({ brandId, category: cat });
        if (res.error || !res.products?.length) {
          push({
            kind: "error",
            text: res.error ?? `No products found in ${cat}.`,
          });
          return;
        }
        push({ kind: "products", products: res.products });
      } catch (e) {
        push({ kind: "error", text: errText(e) });
      }
    });
  };

  // Step 0b — pick the product the ad will feature.
  const chooseProduct = (p: SuggestedProduct) => {
    if (pending || batchId) return;
    setProductId(p.id);
    setProductName(p.name);
    setFeed((f) => f.map((i) => (i.kind === "products" ? { ...i, selected: p.name } : i)));
  };

  // Step 1 — brief (+ product photos) -> engine, and CREATE the session.
  const send = () => {
    if (!brief.trim() || pending) return;
    const text = brief.trim();
    const sending = files;
    push({ kind: "user", text, thumbs: previews });
    push({
      kind: "status",
      text: sending.length
        ? "Uploading product photo(s)…"
        : "Prompt engine is engineering your shot…",
    });
    setBrief("");
    start(async () => {
      try {
        // Binary-safe upload via route handler (never a server action).
        let uploadedRefs: { path: string; visionB64: string }[] = [];
        if (sending.length) {
          const fd = new FormData();
          sending.forEach((f) => fd.append("images", f));
          const up = await fetch("/api/upload", { method: "POST", body: fd });
          const uj = await up.json();
          if (!up.ok) {
            push({ kind: "error", text: uj.error ?? "Upload failed." });
            return;
          }
          uploadedRefs = (uj.refs ?? []).map((r: { path: string; visionB64: string }) => ({
            path: r.path,
            visionB64: r.visionB64,
          }));
          push({ kind: "status", text: "Prompt engine is engineering your shot…" });
        }
        const res = await startBrief({
          brandId,
          brief: text,
          refs: uploadedRefs,
          category: category ?? undefined,
          productId: productId ?? undefined,
        });
        if (res.error || !res.masterPrompt || !res.batchId) {
          push({ kind: "error", text: res.error ?? "Engine returned nothing." });
          return;
        }
        setBatchId(res.batchId);
        setMaster(res.masterPrompt);
        push({
          kind: "engine",
          visualSystem: res.visualSystem ?? "",
          masterPrompt: res.masterPrompt,
          approved: false,
        });
        clearFiles();
        router.refresh(); // session now appears in the list
      } catch (e) {
        push({ kind: "error", text: errText(e) });
      }
    });
  };

  const approve = () => {
    if (pending || !batchId) return;
    setFeed((f) =>
      f.map((i) => (i.kind === "engine" ? { ...i, approved: true, masterPrompt: master } : i)),
    );
    push({ kind: "status", text: "Generating the image (~30s)…" });
    start(async () => {
      try {
        const res = await approveAndGenerate({ batchId, masterPrompt: master });
        if (res.error || !res.imageUrl) {
          push({ kind: "error", text: res.error ?? "Generation failed." });
          return;
        }
        push({ kind: "image", url: res.imageUrl });
        if (res.note) push({ kind: "info", text: res.note });
      } catch (e) {
        push({ kind: "error", text: errText(e) });
      }
    });
  };

  const hooks = () => {
    if (pending || !batchId) return;
    push({ kind: "status", text: "Writing hook options (~40s)…" });
    start(async () => {
      try {
        const res = await makeHooks({ batchId });
        if (res.error || !res.hooks) {
          push({ kind: "error", text: res.error ?? "Hook generation failed." });
          return;
        }
        push({ kind: "hooks", hooks: res.hooks });
      } catch (e) {
        push({ kind: "error", text: errText(e) });
      }
    });
  };

  const overlay = (hook: RestoredHook) => {
    if (pending || !batchId) return;
    setFeed((f) => f.map((i) => (i.kind === "hooks" ? { ...i, selected: hook.text } : i)));
    push({ kind: "status", text: "Art-directing the text onto the image…" });
    start(async () => {
      try {
        const res = await applyHook({ batchId, hookId: hook.id });
        const url = res.overlayDataUrl ?? res.overlayUrl;
        if (res.error || !url) {
          push({ kind: "error", text: res.error ?? "Overlay failed." });
          return;
        }
        if (res.creativeId) setCreativeId(res.creativeId);
        push({ kind: "overlay", url });
        if (res.diag) push({ kind: "info", text: `Overlay render: ${res.diag}` });
      } catch (e) {
        push({ kind: "error", text: errText(e) });
      }
    });
  };

  const copy = () => {
    if (pending || !batchId || !creativeId) return;
    push({ kind: "status", text: "Writing the Meta copy…" });
    start(async () => {
      try {
        const res = await makeCopy({ batchId, creativeId });
        if (res.error || !res.copy) {
          push({ kind: "error", text: res.error ?? "Copy generation failed." });
          return;
        }
        push({ kind: "copy", copy: res.copy });
      } catch (e) {
        push({ kind: "error", text: errText(e) });
      }
    });
  };

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
                      onClick={() => {
                        const nf = files.filter((_, j) => j !== i);
                        setFiles(nf);
                        setPreviews(nf.map((f) => URL.createObjectURL(f)));
                      }}
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
                  : categories.length && !productName
                    ? "Pick a category and product above first…"
                    : productName
                      ? `Describe the scene for the ${productName}…`
                      : "Describe the image you need…  (drop or paste a product photo)"
              }
              disabled={!!batchId || (categories.length > 0 && !productName)}
              className="w-full bg-transparent outline-none text-sm px-2 py-2 disabled:opacity-50"
            />

            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-2">
                <button onClick={() => fileInput.current?.click()} title="Attach product photos" disabled={!!batchId || (categories.length > 0 && !productName)}
                  className="h-9 w-9 rounded-full bg-raised border border-line text-lg leading-none hover:bg-line disabled:opacity-40">+</button>
                <span className="rounded-full px-3 py-1.5 text-xs font-medium bg-raised border border-line">Image</span>
                <span className="rounded-full px-3 py-1.5 text-xs text-text-faint border border-transparent" title="Coming soon">Video</span>
              </div>
              <button onClick={send} disabled={pending || !brief.trim() || !!batchId || (categories.length > 0 && !productName)}
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
