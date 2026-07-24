"use client";
import { useRef, useState, useTransition } from "react";
import {
  startBrief,
  approveAndGenerate,
  makeHooks,
  applyHook,
  makeCopy,
} from "./actions";
import type { AdCopy } from "@/lib/ai/creative";

type FeedItem =
  | { kind: "user"; text: string; thumbs: string[] }
  | { kind: "engine"; visualSystem: string; masterPrompt: string; approved: boolean }
  | { kind: "image"; url: string; path: string }
  | { kind: "hooks"; hooks: string[]; selected?: string }
  | { kind: "overlay"; url: string }
  | { kind: "copy"; copy: AdCopy }
  | { kind: "status"; text: string }
  | { kind: "info"; text: string }
  | { kind: "error"; text: string };

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function StudioFeed({
  brandId,
  brandName,
}: {
  brandId: string;
  brandName: string;
}) {
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [brief, setBrief] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [refPaths, setRefPaths] = useState<string[]>([]);
  const [master, setMaster] = useState("");
  const [dragging, setDragging] = useState(false);
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

  // Step 1 — brief (+ product photos) -> engine.
  const send = () => {
    if (!brief.trim() || pending) return;
    const text = brief.trim();
    const sending = files;
    push({ kind: "user", text, thumbs: previews });
    push({ kind: "status", text: sending.length ? "Uploading product photo(s)…" : "Prompt engine is engineering your shot…" });
    setBrief("");
    start(async () => {
      try {
        // 1) Binary-safe upload via route handler (not the server action).
        let uploadedPaths: string[] = [];
        if (sending.length) {
          const fd = new FormData();
          sending.forEach((f) => fd.append("images", f));
          const up = await fetch("/api/upload", { method: "POST", body: fd });
          const uj = await up.json();
          if (!up.ok) {
            push({ kind: "error", text: uj.error ?? "Upload failed." });
            return;
          }
          uploadedPaths = (uj.refs ?? []).map((r: { path: string }) => r.path);
          push({ kind: "status", text: "Prompt engine is engineering your shot…" });
        }
        // 2) Engine step (JSON args only).
        const res = await startBrief({ brief: text, refPaths: uploadedPaths });
        if (res.error || !res.masterPrompt) {
          push({ kind: "error", text: res.error ?? "Engine returned nothing." });
          return;
        }
        setRefPaths(res.refPaths ?? []);
        setMaster(res.masterPrompt);
        push({
          kind: "engine",
          visualSystem: res.visualSystem ?? "",
          masterPrompt: res.masterPrompt,
          approved: false,
        });
        clearFiles();
      } catch (e) {
        push({ kind: "error", text: errText(e) });
      }
    });
  };

  const approve = () => {
    if (pending) return;
    setFeed((f) =>
      f.map((i) => (i.kind === "engine" ? { ...i, approved: true, masterPrompt: master } : i)),
    );
    push({ kind: "status", text: "Generating the image (~30s)…" });
    start(async () => {
      try {
        const res = await approveAndGenerate({ masterPrompt: master, refPaths });
        if (res.error || !res.imageUrl || !res.imagePath) {
          push({ kind: "error", text: res.error ?? "Generation failed." });
          return;
        }
        push({ kind: "image", url: res.imageUrl, path: res.imagePath });
        if (res.note) push({ kind: "info", text: res.note });
      } catch (e) {
        push({ kind: "error", text: errText(e) });
      }
    });
  };

  const lastUser = () =>
    [...feed].reverse().find((i) => i.kind === "user") as { text: string } | undefined;

  const hooks = () => {
    if (pending) return;
    push({ kind: "status", text: "Writing hook options…" });
    start(async () => {
      try {
        const res = await makeHooks({ brandId, brandName, brief: lastUser()?.text ?? "" });
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

  const overlay = (hook: string) => {
    if (pending) return;
    const img = [...feed].reverse().find((i) => i.kind === "image") as { path: string } | undefined;
    if (!img) return;
    setFeed((f) => f.map((i) => (i.kind === "hooks" ? { ...i, selected: hook } : i)));
    push({ kind: "status", text: "Art-directing the text onto the image…" });
    start(async () => {
      try {
        const res = await applyHook({ brandId, imagePath: img.path, hook });
        if (res.error || !res.overlayUrl) {
          push({ kind: "error", text: res.error ?? "Overlay failed." });
          return;
        }
        push({ kind: "overlay", url: res.overlayUrl });
      } catch (e) {
        push({ kind: "error", text: errText(e) });
      }
    });
  };

  const copy = () => {
    if (pending) return;
    const hooksItem = [...feed].reverse().find((i) => i.kind === "hooks") as
      | { selected?: string }
      | undefined;
    push({ kind: "status", text: "Writing the Meta copy…" });
    start(async () => {
      try {
        const res = await makeCopy({
          brandName,
          brief: lastUser()?.text ?? "",
          hook: hooksItem?.selected ?? "",
        });
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
    "rounded-full px-4 py-2 text-sm font-medium bg-white/70 dark:bg-white/10 backdrop-blur border border-black/5 dark:border-white/10 hover:bg-white transition disabled:opacity-40";

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
        <div className="absolute inset-0 z-20 m-3 rounded-3xl border-2 border-dashed border-neutral-400/70 bg-white/50 dark:bg-black/40 backdrop-blur-sm flex items-center justify-center pointer-events-none">
          <span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">
            Drop product photo(s) to attach
          </span>
        </div>
      )}

      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {feed.length === 0 && (
            <div className="text-center mt-20">
              <div className="text-3xl font-semibold tracking-tight mb-2">{brandName}</div>
              <p className="text-sm text-neutral-500 max-w-sm mx-auto">
                Drop the real product, describe the scene, and build the ad step by
                step — image → hook → copy.
              </p>
            </div>
          )}

          {feed.map((item, i) => {
            switch (item.kind) {
              case "user":
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-neutral-900 text-white px-4 py-3 shadow-sm">
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
                  <div key={i} className="rounded-3xl bg-neutral-950 text-neutral-100 p-5 border border-black/5 shadow-sm">
                    <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-2">Visual system</div>
                    <p className="text-xs text-neutral-300 whitespace-pre-wrap mb-4">{item.visualSystem}</p>
                    <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-2">
                      Master prompt {item.approved ? "· approved ✓" : "· review & edit before generating"}
                    </div>
                    {item.approved ? (
                      <p className="text-xs text-neutral-300 whitespace-pre-wrap">{item.masterPrompt}</p>
                    ) : (
                      <>
                        <textarea
                          value={master}
                          onChange={(e) => setMaster(e.target.value)}
                          rows={9}
                          className="w-full rounded-2xl bg-neutral-900 border border-neutral-700 p-3 text-xs text-neutral-100 font-mono leading-relaxed"
                        />
                        <div className="mt-3 flex justify-end">
                          <button onClick={approve} disabled={pending} className="rounded-full px-5 py-2 text-sm font-medium bg-white text-neutral-900 hover:bg-neutral-200 disabled:opacity-40">
                            Approve & generate image →
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              case "image":
                return (
                  <div key={i} className="rounded-3xl overflow-hidden bg-neutral-950 border border-black/5 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt="generated" className="w-full" />
                    <div className="p-3 flex justify-end">
                      <button onClick={hooks} disabled={pending} className={ctaPill}>Generate hooks →</button>
                    </div>
                  </div>
                );
              case "hooks":
                return (
                  <div key={i} className="rounded-3xl bg-neutral-950 text-neutral-100 p-5 border border-black/5 shadow-sm">
                    <div className="text-[11px] uppercase tracking-widest text-neutral-500 mb-3">Pick a hook to design onto the image</div>
                    <div className="flex flex-wrap gap-2">
                      {item.hooks.map((h, j) => (
                        <button key={j} onClick={() => overlay(h)} disabled={pending}
                          className={`rounded-full px-4 py-2 text-sm border transition ${
                            item.selected === h
                              ? "bg-white text-neutral-900 border-white"
                              : "bg-neutral-900 border-neutral-700 text-neutral-100 hover:border-neutral-400"
                          }`}>
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              case "overlay":
                return (
                  <div key={i} className="rounded-3xl overflow-hidden bg-neutral-950 border border-black/5 shadow-sm">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt="creative" className="w-full" />
                    <div className="p-3 flex justify-end">
                      <button onClick={copy} disabled={pending} className={ctaPill}>Generate Meta copy →</button>
                    </div>
                  </div>
                );
              case "copy":
                return (
                  <div key={i} className="rounded-3xl bg-neutral-950 text-neutral-100 p-5 border border-black/5 shadow-sm space-y-3">
                    <div className="text-[11px] uppercase tracking-widest text-neutral-500">Meta ad copy</div>
                    <div>
                      <div className="text-xs text-neutral-500 mb-1">Primary text</div>
                      <p className="text-sm whitespace-pre-wrap">{item.copy.primaryText}</p>
                    </div>
                    <div className="flex gap-8">
                      <div><div className="text-xs text-neutral-500 mb-1">Headline</div><p className="text-sm font-medium">{item.copy.headline}</p></div>
                      <div><div className="text-xs text-neutral-500 mb-1">CTA</div><p className="text-sm font-medium">{item.copy.cta}</p></div>
                    </div>
                  </div>
                );
              case "status":
                return (
                  <div key={i} className="flex items-center gap-2 text-sm text-neutral-500 px-2">
                    <span className="h-2 w-2 rounded-full bg-neutral-400 animate-pulse" />
                    {item.text}
                  </div>
                );
              case "info":
                return (
                  <div key={i} className="rounded-2xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800 whitespace-pre-wrap">
                    {item.text}
                  </div>
                );
              case "error":
                return (
                  <div key={i} className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 whitespace-pre-wrap">
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
          <div className="absolute -inset-1 rounded-[32px] bg-gradient-to-r from-blue-400/30 via-fuchsia-400/30 to-amber-300/30 blur-2xl" />
          <div className="relative rounded-[28px] border border-white/70 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl shadow-[0_10px_50px_rgba(0,0,0,0.15)] p-3">
            {previews.length > 0 && (
              <div className="flex gap-2 mb-2 px-1">
                {previews.map((p, i) => (
                  <div key={i} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p} alt="" className="h-14 w-14 rounded-xl object-cover border border-black/10 dark:border-white/20" />
                    <button
                      onClick={() => {
                        const nf = files.filter((_, j) => j !== i);
                        setFiles(nf);
                        setPreviews(nf.map((f) => URL.createObjectURL(f)));
                      }}
                      className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-neutral-900 text-white text-xs leading-none opacity-0 group-hover:opacity-100"
                    >
                      ×
                    </button>
                  </div>
                ))}
                <button onClick={clearFiles} className="text-xs text-neutral-500 hover:text-neutral-800 self-center">clear</button>
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
              placeholder="Describe the image you need…  (drop or paste a product photo)"
              className="w-full bg-transparent outline-none text-sm px-2 py-2"
            />

            <div className="flex items-center justify-between mt-1">
              <div className="flex items-center gap-2">
                <button onClick={() => fileInput.current?.click()} title="Attach product photos"
                  className="h-9 w-9 rounded-full bg-white/70 dark:bg-white/10 border border-black/5 dark:border-white/10 text-lg leading-none hover:bg-white">+</button>
                <span className="rounded-full px-3 py-1.5 text-xs font-medium bg-white/70 dark:bg-white/10 border border-black/5 dark:border-white/10">Image</span>
                <span className="rounded-full px-3 py-1.5 text-xs text-neutral-400 border border-transparent" title="Coming soon">Video</span>
              </div>
              <button onClick={send} disabled={pending || !brief.trim()}
                className="h-10 w-10 rounded-full bg-neutral-900 text-white grid place-items-center hover:bg-neutral-700 disabled:opacity-40 dark:bg-white dark:text-neutral-900">
                {pending ? "…" : "↑"}
              </button>
            </div>
            <div className="mt-2 h-1 rounded-full bg-gradient-to-r from-blue-400 via-fuchsia-400 to-amber-300 opacity-70" />
          </div>
          <input ref={fileInput} type="file" accept="image/*" multiple hidden onChange={(e) => addFiles(Array.from(e.target.files ?? []))} />
        </div>
      </div>
    </div>
  );
}
