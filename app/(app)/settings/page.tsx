import { requireContext } from "@/lib/auth";
import { listSecretHints } from "@/lib/secrets";
import { saveIntegrations, testAnthropic } from "./actions";

const FIELDS = [
  {
    name: "anthropic_api_key",
    label: "Anthropic API key",
    placeholder: "sk-ant-…",
    help: "Powers hooks, copy, image prompts, and the vision text-design step.",
  },
  {
    name: "image_gateway_api_key",
    label: "Image gateway API key",
    placeholder: "your WaveSpeed / Segmind key",
    help: "Generates the hyper-real ad photos (Higgsfield Soul).",
  },
  {
    name: "image_gateway_base_url",
    label: "Image gateway base URL",
    placeholder: "https://api.wavespeed.ai/api/v3",
    help: "The gateway's API endpoint. Leave blank to use the default.",
  },
  {
    name: "openai_api_key",
    label: "OpenAI API key (optional)",
    placeholder: "sk-…",
    help: "Alternate image model (gpt-image-1).",
  },
] as const;

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; test?: string }>;
}) {
  const { saved, test } = await searchParams;
  const { orgId, role } = await requireContext();
  const hints = await listSecretHints(orgId);

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-semibold mb-1">Settings · Integrations</h1>
      <p className="text-sm text-neutral-500 mb-6">
        API keys are encrypted before they&apos;re stored. You&apos;ll only ever
        see a masked hint after saving.
      </p>

      {saved && (
        <p className="mb-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 border border-emerald-200">
          Saved {saved} key{saved === "1" ? "" : "s"}.
        </p>
      )}
      {test && (
        <p className="mb-4 rounded-md bg-neutral-100 dark:bg-neutral-900 px-3 py-2 text-sm border border-neutral-200 dark:border-neutral-800">
          {test}
        </p>
      )}

      {role !== "admin" && (
        <p className="mb-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800 border border-amber-200">
          Only admins should manage workspace keys.
        </p>
      )}

      <form action={saveIntegrations} className="space-y-5">
        {FIELDS.map((f) => (
          <div key={f.name}>
            <label className="block text-sm font-medium mb-1" htmlFor={f.name}>
              {f.label}
              {hints[f.name] && (
                <span className="ml-2 text-xs text-emerald-600">
                  saved: {hints[f.name]}
                </span>
              )}
            </label>
            <input
              id={f.name}
              name={f.name}
              type="password"
              autoComplete="off"
              placeholder={hints[f.name] ? "•••••• (leave blank to keep)" : f.placeholder}
              className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm dark:bg-neutral-900 dark:border-neutral-700"
            />
            <p className="mt-1 text-xs text-neutral-500">{f.help}</p>
          </div>
        ))}

        <div className="flex items-center gap-3">
          <button className="rounded-md bg-neutral-900 text-white px-4 py-2 text-sm font-medium hover:bg-neutral-800 dark:bg-white dark:text-neutral-900">
            Save keys
          </button>
          <button
            formAction={testAnthropic}
            className="rounded-md border border-neutral-300 dark:border-neutral-700 px-4 py-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-900"
          >
            Test Anthropic connection
          </button>
        </div>
      </form>
    </div>
  );
}
