// lib/claudeClient.ts
// -----------------------------------------------------------------------------
// Thin wrapper around the Anthropic SDK so the rest of the app never touches
// the SDK directly. Centralising it here means model names and defaults live
// in ONE place — change them once, everything updates.
// -----------------------------------------------------------------------------

import Anthropic from "@anthropic-ai/sdk";

// Model choices (verified current as of mid-2026):
//   - Sonnet 4.6 for extraction: strong vision, fast, cheap. Perfect for the
//     high-volume "read every document" job.
//   - Opus 4.8 for the reasoning narrative: most capable, used sparingly to
//     explain the deterministic decision in plain English.
export const MODELS = {
  EXTRACTOR: "claude-sonnet-4-6",
  REASONER: "claude-opus-4-8",
} as const;

let _client: Anthropic | null = null;

/** Lazily create a single shared client. */
export function getClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set. Copy .env.example to .env.local and add your key.",
      );
    }
    _client = new Anthropic({ apiKey });
  }
  return _client;
}

/** Pull the concatenated text out of a Messages API response. */
export function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

/** Best-effort JSON extraction: models sometimes wrap JSON in ```json fences
 *  or add a sentence before it. This strips that and parses safely. */
export function parseJsonLoose<T>(raw: string): T {
  let s = raw.trim();
  // Remove code fences if present.
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  // If there's leading prose, grab the first {...} or [...] block.
  const firstBrace = s.search(/[[{]/);
  if (firstBrace > 0) s = s.slice(firstBrace);
  return JSON.parse(s) as T;
}
