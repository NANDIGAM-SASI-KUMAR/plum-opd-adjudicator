// lib/llmClient.ts
// -----------------------------------------------------------------------------
// Provider-agnostic LLM layer. The rest of the app never knows or cares which
// model is behind it. Switch providers with ONE environment variable:
//
//   LLM_PROVIDER=ollama     (default) — free, local, no API key, no billing
//   LLM_PROVIDER=anthropic            — Claude API (needs ANTHROPIC_API_KEY)
//   LLM_PROVIDER=demo                 — no LLM at all; tiny built-in parser
//
// Why this design matters (interview point): the extractor is just a function
// that turns documents into JSON. Nothing downstream depends on the provider,
// so we can run free locally and swap to Claude in production by flipping a flag.
// -----------------------------------------------------------------------------

export type Provider = "ollama" | "anthropic" | "demo";

export function getProvider(): Provider {
  const p = (process.env.LLM_PROVIDER ?? "ollama").toLowerCase();
  if (p === "anthropic" || p === "demo") return p;
  return "ollama";
}

// Model names per provider. Ollama models must be pulled first (ollama pull ...).
export const MODELS = {
  ollama: {
    // llava reads images AND text; works across Ollama versions; one model for both jobs.
    EXTRACTOR: process.env.OLLAMA_VISION_MODEL ?? "llava",
    REASONER: process.env.OLLAMA_TEXT_MODEL ?? "llava",
  },
  anthropic: {
    EXTRACTOR: "claude-sonnet-4-6",
    REASONER: "claude-opus-4-8",
  },
} as const;

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? "http://localhost:11434";

// A document the extractor can read: base64 image/PDF.
export interface DocInput {
  media_type: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  data: string; // base64, no "data:" prefix
}

// ---------------------------------------------------------------------------
// Unified call: send a text prompt + optional images, get text back.
// Each provider implements this the same way from the caller's view.
// ---------------------------------------------------------------------------
export async function llmComplete(opts: {
  role: "EXTRACTOR" | "REASONER";
  prompt: string;
  images?: DocInput[]; // ignored by text-only calls
  maxTokens?: number;
}): Promise<string> {
  const provider = getProvider();
  if (provider === "anthropic") return callAnthropic(opts);
  if (provider === "ollama") return callOllama(opts);
  throw new Error("DEMO provider does not call an LLM."); // handled in agents.ts
}

// ---- Ollama (local, free) -------------------------------------------------
async function callOllama(opts: {
  role: "EXTRACTOR" | "REASONER";
  prompt: string;
  images?: DocInput[];
  maxTokens?: number;
}): Promise<string> {
  const model = MODELS.ollama[opts.role];

  // Ollama's native /api/chat takes images as an array of base64 strings on
  // the message (no data: prefix), which is exactly what DocInput holds.
  const message: any = { role: "user", content: opts.prompt };
  const imgs = (opts.images ?? []).filter((d) => d.media_type !== "application/pdf");
  if (imgs.length > 0) message.images = imgs.map((d) => d.data);

  const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [message],
      stream: false,
      options: { temperature: 0 }, // deterministic-ish extraction
    }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(
      `Ollama request failed (${res.status}). Is Ollama running and is "${model}" pulled? ` +
        `Try: ollama pull ${model}. Details: ${txt.slice(0, 200)}`,
    );
  }
  const json = await res.json();
  return json?.message?.content ?? "";
}

// ---- Anthropic (production) ----------------------------------------------
async function callAnthropic(opts: {
  role: "EXTRACTOR" | "REASONER";
  prompt: string;
  images?: DocInput[];
  maxTokens?: number;
}): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not set. Set LLM_PROVIDER=ollama to run free locally.");
  }
  // Dynamic import so the SDK is only loaded when actually used.
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic({ apiKey });

  const content: any[] = [];
  for (const d of opts.images ?? []) {
    if (d.media_type === "application/pdf") {
      content.push({ type: "document", source: { type: "base64", media_type: d.media_type, data: d.data } });
    } else {
      content.push({ type: "image", source: { type: "base64", media_type: d.media_type, data: d.data } });
    }
  }
  content.push({ type: "text", text: opts.prompt });

  const msg = await client.messages.create({
    model: MODELS.anthropic[opts.role],
    max_tokens: opts.maxTokens ?? 1500,
    messages: [{ role: "user", content }],
  });
  return msg.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("\n");
}

// ---- JSON parsing helper (shared) ----------------------------------------
export function parseJsonLoose<T>(raw: string): T {
  let s = raw.trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const firstBrace = s.search(/[[{]/);
  if (firstBrace > 0) s = s.slice(firstBrace);
  return JSON.parse(s) as T;
}
