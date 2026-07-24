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
  | { kind: "error"; text: string };

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
  const [pending, start] = useTransition();
  const fileInput = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const push = (item: FeedItem) =>
    setFeed((f) => {
      const next = [...f.filter((i) => i.kind !== "status"), item];
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
      return next;
    });

  const onFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list).slice(0, 4);
    setFiles(arr);
    setPreviews(arr.map((f) => URL.createObjectURL(f)));
  };

  // Step 1 — send brief (+ product photos) to the engine.
  const send = () => {
    if (!brief.trim() || pending) return;
    const text = brief.trim();
    push({ kind: "user", text, thumbs: previews });
    push({ kind: "status", text: "Prompt engine is engineering your shot…" });
    const fd = new FormData();
    fd.set("brief", text);
    files.forEach((f) => fd.append("images", f));
    setBrief("");
    start(async () => {
      const res = await startBrief(fd);
      if (res.error || !res.masterPrompt) {
        push({ kind: "error", text: res.error ?? "Engine failed." });
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
    });
  };

  // Step 2 — approve (possibly edited) master prompt -> image.
  const approve = () => {
    if (pending) return;
    setFeed((f) =>
      f.map((i) => (i.kind === "engine" ? { ...i, approved: true, masterPrompt: master } : i)),
    );
    push({ kind: "status", text: "Generating the image (~30s)…" });
    start(async () => {
      const res = await approveAndGenerate({ masterPrompt: master, refPaths });
      if (res.error || !res.imageUrl || !res.imagePath) {
        push({ kind: "error", text: res.error ?? "Generation failed." });
        return;
      }
      push({ kind: "image", url: res.imageUrl, path: res.imagePath });
    });
  };

  // Step 3 — hooks.
  const lastUser = () => [...feed].reverse().find((i) => i.kind === "user") as
    | { text: string }
    | undefined;

  const hooks = () => {
    if (pending) return;
    push({ kind: "status", text: "Writing hook options…" });
    start(async () => {
      const res = await makeHooks({
        brandId,
        brandName,
        brief: lastUser()?.text ?? "",
      });
      if (res.error || !res.hooks) {
        push({ kind: "error", text: res.error ?? "Hook generation failed." });
        return;
      }
      push({ kind: "hooks", hooks: res.hooks });
    });
  };

  // Step 4 — overlay selected hook.
  const overlay = (hook: string) => {
    if (pending) return;
    const img = [...feed].reverse().find((i) => i.kind === "image") as
      | { path: string }
      | undefined;
    if (!img) return;
    setFeed((f) => f.map((i) => (i.kind === "hooks" ? { ...i, selected: hook } : i)));
    push({ kind: "status", text: "Art-directing the text onto the image…" });
    start(async () => {
      const res = await applyHook({ brandId, imagePath: img.path, hook });
      if (res.error || !res.overlayUrl) {
        push({ kind: "error", text: res.error ?? "Overlay failed." });
        return;
      }
      push({ kind: "overlay", url: res.overlayUrl });
    });
  };

  // Step 5 — copy.
  const copy = () => {
    if (pending) return;
    const hooksItem = [...feed].reverse().find((i) => i.kind === "hooks") as
      | { selected?: string }
      | undefined;
    push({ kind: "status", text: "Writing the Meta copy…" });
    start(async () => {
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
    });
  };

  const pill =
    "rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:opacity-40";
  const darkPill = `${pill} bg-neutral-900 text-white hover:bg-neutral-700 dark:bg-white dark:text-neutral-900`;
  const glassPill = `${pill} bg-white/70 backdrop-blur border border-neutral-200 hover:bg-white dark:bg-white/10 dark:border-white/10 dark:text-white`;

  return (
    <div className="flex flex-col h-full">
      {/* Feed */}
      <div className="flex-1 overflow-y-auto px-4 py-8">
        <div className="mx-auto max-w-2xl space-y-4">
          {feed.length === 0 && (
            <div className="text-center mt-24">
              <div className="text-2xl font-semibold tracking-tight mb-2">
                {brandName} · Studio
              </div>
              <p className="text-sm text-neutral-500">
                Attach the real product, describe the scene, and build the ad step
                by step — image, hook, copy.
              </p>
            </div>
          )}

          {feed.map((item, i) => {
            switch (item.kind) {
              case "user":
                return (
                  <div key={i} className="flex justify-end">
                    <div className="max-w-[85%] rounded-3xl rounded-br-lg bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 px-4 py-3">
                      {item.thumbs.length > 0 && (
                        <div className="flex gap-2 mb-2">
                          {item.thumbs.map((t, j) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={j}
                              src={t}
                              alt=""
                              className="h-14 w-14 rounded-xl object-cover border border-white/20"
                            />
                          ))}
                        </div>
                      )}
                      <p className="text-sm">{item.text}</p>
                    </div>
                  </div>
                );
              case "engine":
                return (
                  <div
                    key={i}
                    className="rounded-3xl bg-neutral-950 text-neutral-100 p-5 border border-neutral-800"
                  >
                    <div className="text-[11px] uppercase tracking-widest text-neutral-400 mb-2">
                      Visual system
                    </div>
                    <p className="text-xs text-neutral-300 whitespace-pre-wrap mb-4">
                      {item.visualSystem}
                    </p>
                    <div className="text-[11px] uppercase tracking-widest text-neutral-400 mb-2">
                      Master prompt {item.approved ? "· approved ✓" : "· review & edit"}
                    </div>
                    {item.approved ? (
                      <p className="text-xs text-neutral-300 whitespace-pre-wrap">
                        {item.masterPrompt}
                      </p>
                    ) : (
                      <>
                        <textarea
                          value={master}
                          onChange={(e) => setMaster(e.target.value)}
                          rows={8}
                          className="w-full rounded-2xl bg-neutral-900 border border-neutral-700 p-3 text-xs text-neutral-100 font-mono"
                        />
                        <div className="mt-3 flex justify-end">
                          <button onClick={approve} disabled={pending} className={`${pill} bg-white text-neutral-900 hover:bg-neutral-200`}>
                            Approve & generate image
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              case "image":
                return (
                  <div key={i} className="rounded-3xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt="generated" className="w-full" />
                    <div className="p-3 flex justify-end gap-2">
                      <button onClick={hooks} disabled={pending} className={glassPill}>
                        Generate hooks →
                      </button>
                    </div>
                  </div>
                );
              case "hooks":
                return (
                  <div key={i} className="rounded-3xl bg-neutral-950 text-neutral-100 p-5 border border-neutral-800">
                    <div className="text-[11px] uppercase tracking-widest text-neutral-400 mb-3">
                      Pick a hook to design onto the image
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {item.hooks.map((h, j) => (
                        <button
                          key={j}
                          onClick={() => overlay(h)}
                          disabled={pending}
                          className={`${pill} border ${
                            item.selected === h
                              ? "bg-white text-neutral-900 border-white"
                              : "bg-neutral-900 border-neutral-700 text-neutral-100 hover:border-neutral-400"
                          }`}
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              case "overlay":
                return (
                  <div key={i} className="rounded-3xl overflow-hidden border border-neutral-200 dark:border-neutral-800 bg-neutral-950">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.url} alt="creative" className="w-full" />
                    <div className="p-3 flex justify-end">
                      <button onClick={copy} disabled={pending} className={glassPill}>
                        Generate Meta copy →
                      </button>
                    </div>
                  </div>
                );
              case "copy":
                return (
                  <div key={i} className="rounded-3xl bg-neutral-950 text-neutral-100 p-5 border border-neutral-800 space-y-3">
                    <div className="text-[11px] uppercase tracking-widest text-neutral-400">
                      Meta ad copy
                    </div>
                    <div>
                      <div className="text-xs text-neutral-400 mb-1">Primary text</div>
                      <p className="text-sm whitespace-pre-wrap">{item.copy.primaryText}</p>
                    </div>
                    <div className="flex gap-8">
                      <div>
                        <div className="text-xs text-neutral-400 mb-1">Headline</div>
                        <p className="text-sm font-medium">{item.copy.headline}</p>
                      </div>
                      <div>
                        <div className="text-xs text-neutral-400 mb-1">CTA</div>
                        <p className="text-sm font-medium">{item.copy.cta}</p>
                      </div>
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
              case "error":
                return (
                  <div key={i} className="rounded-2xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                    {item.text}
                  </div>
                );
            }
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Floating glass composer */}
      <div className="px-4 pb-6">
        <div className="mx-auto max-w-2xl rounded-[28px] border border-neutral-200 dark:border-white/10 bg-white/70 dark:bg-neutral-900/70 backdrop-blur-xl shadow-lg p-3">
          {previews.length > 0 && (
            <div className="flex gap-2 mb-2 px-1">
              {previews.map((p, i) => (
                <div key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p} alt="" className="h-12 w-12 rounded-xl object-cover border border-neutral-300 dark:border-white/20" />
                </div>
              ))}
              <button
                onClick={() => {
                  setFiles([]);
                  setPreviews([]);
                  if (fileInput.current) fileInput.current.value = "";
                }}
                className="text-xs text-neutral-500 hover:text-neutral-800 self-center"
              >
                clear
              </button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInput.current?.click()}
              title="Attach product photos"
              className="h-10 w-10 shrink-0 rounded-full bg-neutral-100 dark:bg-white/10 border border-neutral-200 dark:border-white/10 text-lg leading-none hover:bg-neutral-200"
            >
              +
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => onFiles(e.target.files)}
            />
            <input
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()}
              placeholder="Describe the image you need…"
              className="flex-1 bg-transparent outline-none text-sm px-2"
            />
            <button onClick={send} disabled={pending || !brief.trim()} className={darkPill}>
              {pending ? "Working…" : "Send ↑"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
