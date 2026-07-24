import Link from "next/link";
import { notFound } from "next/navigation";
import { requireContext } from "@/lib/auth";
import { supabaseServer } from "@/lib/supabase/server";
import { getSecret } from "@/lib/secrets";
import { buildMasterPrompt, type MasterPromptResult } from "@/lib/prompt-engine/engine";

export const maxDuration = 60;

export default async function StudioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ brief?: string }>;
}) {
  const { id } = await params;
  const { brief } = await searchParams;
  const { orgId } = await requireContext();
  const supabase = await supabaseServer();

  const { data: brand } = await supabase
    .from("brands")
    .select("id, name")
    .eq("id", id)
    .maybeSingle();
  if (!brand) notFound();

  // Run the prompt engine when a brief is provided.
  let engine: MasterPromptResult | null = null;
  let engineError: string | null = null;
  if (brief) {
    const key = await getSecret(orgId, "anthropic_api_key");
    if (!key) {
      engineError = "No Anthropic key configured. Set ANTHROPIC_API_KEY in the environment.";
    } else {
      try {
        engine = await buildMasterPrompt({ brief, apiKey: key });
      } catch (e) {
        engineError = e instanceof Error ? e.message : "Prompt engine failed.";
      }
    }
  }

  return (
    <div className="max-w-3xl">
      <Link href={`/brands/${id}`} className="text-sm text-neutral-500 hover:underline">
        ← {brand.name}
      </Link>
      <h1 className="text-xl font-semibold mt-2 mb-1">Image Studio</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Describe what you need. The Hyperrealism Prompt Engine turns it into a
        photographer&apos;s master prompt, then generates the image.
      </p>

      <form className="flex gap-2 mb-6">
        <input
          name="brief"
          defaultValue={brief ?? ""}
          placeholder="e.g. kids on a mechanical bull at a summer block party, pure joy"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:bg-neutral-900 dark:border-neutral-700"
        />
        <button className="rounded-md bg-neutral-900 text-white px-5 py-2 text-sm font-medium hover:bg-neutral-800 dark:bg-white dark:text-neutral-900">
          Generate
        </button>
      </form>

      {engineError && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
          {engineError}
        </p>
      )}

      {engine && (
        <div className="space-y-5">
          <details className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
            <summary className="cursor-pointer text-sm font-medium">
              Visual system (what the engine resolved)
            </summary>
            <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-300 font-mono">
              {engine.visualSystem}
            </pre>
          </details>

          <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
            <div className="text-sm font-medium mb-2">Master prompt → image generator</div>
            <p className="text-xs text-neutral-600 dark:text-neutral-300">{engine.masterPrompt}</p>
          </div>

          <div>
            <p className="text-sm text-neutral-500 mb-2">Generating image (~20–30s)…</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/studio-image?master=${encodeURIComponent(engine.masterPrompt)}`}
              alt={brief}
              className="w-full max-w-md rounded-lg border border-neutral-200 dark:border-neutral-800"
            />
          </div>
        </div>
      )}
    </div>
  );
}
