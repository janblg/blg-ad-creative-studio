/**
 * Image generation behind a single interface so the model is swappable per
 * brand / A-B test. Default is Higgsfield Soul (hyper-real, text-free photos)
 * via a REST gateway; gpt-image-1 is the alternate. The hook TEXT is never
 * generated here — it is composited later by the render engine.
 */

export type AspectRatio = "1:1" | "4:5" | "9:16" | "16:9";

export interface GenerateImageParams {
  prompt: string;
  /** Steer the model away from artifacts; we always forbid text/lettering. */
  negativePrompt?: string;
  aspectRatio?: AspectRatio;
  n?: number;
  seed?: number;
  /** gpt-image-1 render quality. Lower = faster/cheaper. */
  quality?: "low" | "medium" | "high" | "auto";
}

export interface GeneratedImage {
  buffer: Buffer;
  mime: string;
  meta?: Record<string, unknown>;
}

export interface ImageProvider {
  id: string;
  generate(params: GenerateImageParams): Promise<GeneratedImage[]>;
}

const NO_TEXT =
  "no text, no words, no lettering, no captions, no watermark, no logo, no typography";

// --- OpenAI gpt-image-1 (accurate, alternate provider) --------------------
function openaiSize(aspect: AspectRatio = "4:5"): string {
  switch (aspect) {
    case "1:1": return "1024x1024";
    case "16:9": return "1536x1024";
    default: return "1024x1536"; // 4:5, 9:16 -> portrait; renderer cover-crops
  }
}

class OpenAIProvider implements ImageProvider {
  id = "openai";
  constructor(private apiKey: string) {}

  async generate(p: GenerateImageParams): Promise<GeneratedImage[]> {
    const res = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-image-1",
        prompt: `${p.prompt}\n\nStrictly: ${NO_TEXT}. ${p.negativePrompt ?? ""}`,
        n: p.n ?? 3,
        size: openaiSize(p.aspectRatio),
        quality: p.quality ?? "medium",
      }),
    });
    if (!res.ok) {
      throw new Error(`OpenAI images ${res.status}: ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { b64_json: string }[] };
    return json.data.map((d) => ({
      buffer: Buffer.from(d.b64_json, "base64"),
      mime: "image/png",
    }));
  }
}

// --- Higgsfield Soul via REST gateway (default) ---------------------------
//
// NOTE: gateway request/response contracts differ (WaveSpeed vs Segmind vs
// eachlabs) and must be CONFIRMED against the chosen gateway's live docs at
// integration time (see RUNBOOK / plan open items). The HTTP call is isolated
// in `callGateway` so only that method changes. It handles the common shapes:
// sync {images:[{url|b64}]} and async {id|polling_url} + polling.
class HiggsfieldSoulProvider implements ImageProvider {
  id = "higgsfield_soul";
  constructor(private apiKey: string, private baseUrl: string) {}

  async generate(p: GenerateImageParams): Promise<GeneratedImage[]> {
    const n = p.n ?? 3;
    const results = await Promise.all(
      Array.from({ length: n }, (_, i) =>
        this.callGateway({ ...p, seed: p.seed ? p.seed + i : undefined }),
      ),
    );
    return results.flat();
  }

  private async callGateway(p: GenerateImageParams): Promise<GeneratedImage[]> {
    const submit = await fetch(`${this.baseUrl.replace(/\/$/, "")}/higgsfield/soul`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        prompt: p.prompt,
        negative_prompt: `${NO_TEXT}. ${p.negativePrompt ?? ""}`,
        aspect_ratio: p.aspectRatio ?? "4:5",
        seed: p.seed,
      }),
    });
    if (!submit.ok) {
      throw new Error(`Soul gateway ${submit.status}: ${await submit.text()}`);
    }
    const body = (await submit.json()) as GatewayResponse;
    const urlOrData = await this.resolve(body);
    return [urlOrData];
  }

  private async resolve(body: GatewayResponse): Promise<GeneratedImage> {
    // Sync shapes
    const first = body.images?.[0] ?? body.data?.[0] ?? body.output?.[0];
    if (first && typeof first !== "string" && first.b64_json) {
      return { buffer: Buffer.from(first.b64_json, "base64"), mime: "image/png" };
    }
    const url = typeof first === "string" ? first : first?.url;
    if (url) return this.download(url);
    // Async shape: poll
    const pollUrl = body.polling_url ?? (body.id ? `${this.baseUrl}/results/${body.id}` : null);
    if (pollUrl) return this.poll(pollUrl);
    throw new Error("Unrecognized gateway response shape (confirm gateway contract).");
  }

  private async poll(url: string, attempts = 30, delayMs = 2000): Promise<GeneratedImage> {
    for (let i = 0; i < attempts; i++) {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (res.ok) {
        const body = (await res.json()) as GatewayResponse;
        const first = body.images?.[0] ?? body.data?.[0] ?? body.output?.[0];
        const imgUrl = typeof first === "string" ? first : first?.url;
        if (first && typeof first !== "string" && first.b64_json) {
          return { buffer: Buffer.from(first.b64_json, "base64"), mime: "image/png" };
        }
        if (imgUrl) return this.download(imgUrl);
      }
      await new Promise((r) => setTimeout(r, delayMs));
    }
    throw new Error("Soul generation timed out.");
  }

  private async download(url: string): Promise<GeneratedImage> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to download image: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return { buffer: buf, mime: res.headers.get("content-type") ?? "image/png" };
  }
}

interface GatewayImage { url?: string; b64_json?: string }
interface GatewayResponse {
  images?: (GatewayImage | string)[];
  data?: (GatewayImage | string)[];
  output?: (GatewayImage | string)[];
  id?: string;
  polling_url?: string;
}

export type ProviderName = "higgsfield_soul" | "openai";

/** Construct providers directly from a key (used by scripts and the factory). */
export function createOpenAIProvider(apiKey: string): ImageProvider {
  return new OpenAIProvider(apiKey);
}
export function createSoulProvider(apiKey: string, baseUrl: string): ImageProvider {
  return new HiggsfieldSoulProvider(apiKey, baseUrl);
}
