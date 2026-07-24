"use client";
import { useActionState } from "react";
import { generate, type GenState } from "./actions";

const initial: GenState = {};

export function StudioForm() {
  const [state, formAction, pending] = useActionState(generate, initial);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1" htmlFor="images">
          Product photo(s) <span className="text-neutral-400">(optional — locks the real product)</span>
        </label>
        <input
          id="images"
          name="images"
          type="file"
          accept="image/*"
          multiple
          className="block w-full text-sm text-neutral-600 dark:text-neutral-300 file:mr-3 file:rounded-md file:border-0 file:bg-neutral-900 file:text-white file:px-3 file:py-1.5 file:text-sm dark:file:bg-white dark:file:text-neutral-900"
        />
        <p className="mt-1 text-xs text-neutral-500">
          Upload the customer&apos;s actual product and the generated scene will feature it.
        </p>
      </div>

      <div className="flex gap-2">
        <input
          name="brief"
          defaultValue={state.brief}
          placeholder="e.g. this bounce house at a sunny backyard birthday, kids rushing toward it"
          className="flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm dark:bg-neutral-900 dark:border-neutral-700"
        />
        <button
          disabled={pending}
          className="rounded-md bg-neutral-900 text-white px-5 py-2 text-sm font-medium hover:bg-neutral-800 disabled:opacity-50 dark:bg-white dark:text-neutral-900"
        >
          {pending ? "Generating…" : "Generate"}
        </button>
      </div>

      {pending && (
        <p className="text-sm text-neutral-500">
          Engineering the prompt and generating the image (~30–45s)…
        </p>
      )}

      {state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 border border-red-200">
          {state.error}
        </p>
      )}

      {state.visualSystem && (
        <details className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
          <summary className="cursor-pointer text-sm font-medium">
            Visual system (what the engine resolved)
            {state.usedReference && " · using your product photo"}
          </summary>
          <pre className="mt-3 whitespace-pre-wrap text-xs text-neutral-600 dark:text-neutral-300 font-mono">
            {state.visualSystem}
          </pre>
        </details>
      )}

      {state.masterPrompt && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
          <div className="text-sm font-medium mb-2">Master prompt → image generator</div>
          <p className="text-xs text-neutral-600 dark:text-neutral-300">{state.masterPrompt}</p>
        </div>
      )}

      {state.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={state.imageUrl}
          alt={state.brief ?? "generated creative"}
          className="w-full max-w-md rounded-lg border border-neutral-200 dark:border-neutral-800"
        />
      )}
    </form>
  );
}
