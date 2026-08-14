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
import type { RestoredBatch, RestoredHook } from "@/lib/studio/load";

/**
 * The Studio session state machine, extracted so BOTH surfaces — the chat feed
 * and the node board — drive the exact same pipeline. Two copies of this logic
 * would drift the moment either one changed, and the board is meant to be a
 * different VIEW of a session, not a second implementation of it.
 */

export type FeedItem =
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
export function restore(b: RestoredBatch): FeedItem[] {
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

export interface StudioSession {
  feed: FeedItem[];
  batchId: string | null;
  creativeId: string | null;
  category: string | null;
  productName: string | null;
  master: string;
  setMaster: (v: string) => void;
  brief: string;
  setBrief: (v: string) => void;
  files: File[];
  previews: string[];
  addFiles: (f: File[]) => void;
  removeFile: (i: number) => void;
  clearFiles: () => void;
  pending: boolean;
  /** True while the composer must stay locked (catalog brand, no product yet). */
  needsProduct: boolean;
  chooseCategory: (c: string) => void;
  chooseProduct: (p: SuggestedProduct) => void;
  send: () => void;
  approve: () => void;
  generateHooks: () => void;
  applyHookToImage: (h: RestoredHook) => void;
  generateCopy: () => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}

export function useStudioSession(opts: {
  brandId: string;
  initialBatch?: RestoredBatch | null;
  categories: string[];
}): StudioSession {
  const { brandId, initialBatch, categories } = opts;
  const router = useRouter();

  const [feed, setFeed] = useState<FeedItem[]>(() => {
    if (initialBatch) return restore(initialBatch);
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
  const [pending, start] = useTransition();
  const bottomRef = useRef<HTMLDivElement | null>(null);

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
  const removeFile = (i: number) =>
    setFiles((prev) => {
      const next = prev.filter((_, j) => j !== i);
      setPreviews(next.map((f) => URL.createObjectURL(f)));
      return next;
    });
  const clearFiles = () => {
    setFiles([]);
    setPreviews([]);
  };

  const chooseCategory = (cat: string) => {
    if (pending || batchId) return;
    setCategory(cat);
    setFeed((f) => f.map((i) => (i.kind === "categories" ? { ...i, selected: cat } : i)));
    push({ kind: "status", text: `Finding the best ${cat} to advertise…` });
    start(async () => {
      try {
        const res = await suggestProducts({ brandId, category: cat });
        if (res.error || !res.products?.length) {
          push({ kind: "error", text: res.error ?? `No products found in ${cat}.` });
          return;
        }
        push({ kind: "products", products: res.products });
      } catch (e) {
        push({ kind: "error", text: errText(e) });
      }
    });
  };

  const chooseProduct = (p: SuggestedProduct) => {
    if (pending || batchId) return;
    setProductId(p.id);
    setProductName(p.name);
    setFeed((f) => f.map((i) => (i.kind === "products" ? { ...i, selected: p.name } : i)));
  };

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
        // Binary-safe upload via route handler (never a server action — gotcha #1).
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
        router.refresh(); // the session now appears in the list
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

  const generateHooks = () => {
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

  const applyHookToImage = (hook: RestoredHook) => {
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

  const generateCopy = () => {
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

  return {
    feed,
    batchId,
    creativeId,
    category,
    productName,
    master,
    setMaster,
    brief,
    setBrief,
    files,
    previews,
    addFiles,
    removeFile,
    clearFiles,
    pending,
    needsProduct: categories.length > 0 && !productName,
    chooseCategory,
    chooseProduct,
    send,
    approve,
    generateHooks,
    applyHookToImage,
    generateCopy,
    bottomRef,
  };
}
