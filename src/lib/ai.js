import "server-only";
import { query } from "./db";
import { getSettings } from "./settings";
import { aiProvider, modelsFor, markModelDown } from "./assistant";

/*
  Writing help for the agents (returns triage, marketing writer, catalogue checker, inbox drafts).

  Uses the same model as the customer assistant (one key in the environment: GEMINI_API_KEY or GROQ_API_KEY,
  both have free tiers, or ANTHROPIC_API_KEY / AI_BASE_URL + AI_API_KEY). Without a key, or once the daily
  limit in Admin -> Agents is reached, aiWrite() returns null and every agent falls back to its own built-in
  wording, so nothing ever depends on it.
*/

const today = () => new Date().toISOString().slice(0, 10);

/** Which model is connected (or null) and how many calls are left today. */
export async function aiStatus() {
  const provider = aiProvider();
  const settings = await getSettings();
  const limit = Math.max(0, Number(settings.agents.ai_daily_limit) || 0);
  const [row] = await query("SELECT calls FROM ai_usage WHERE day = $1", [today()]);
  const used = row?.calls || 0;
  return {
    provider: provider ? { label: provider.label, model: provider.model } : null,
    enabled: Boolean(settings.agents.ai), limit, used, left: Math.max(0, limit - used),
  };
}

/**
 * Asks the model for a short piece of writing. Returns the text, or null when no model is connected,
 * AI is switched off, the daily limit is used up, or the call fails (callers then use their own wording).
 */
export async function aiWrite({ system, prompt, maxTokens = 400 }) {
  const provider = aiProvider();
  const models = modelsFor(provider); // a model that failed in the last few minutes is skipped
  if (!models.length) return null; // none available: the built-in wording is used at once
  const status = await aiStatus();
  if (!status.enabled || status.left <= 0) return null;
  await query(
    "INSERT INTO ai_usage (day, calls) VALUES ($1, 1) ON CONFLICT (day) DO UPDATE SET calls = ai_usage.calls + 1",
    [today()]
  );

  // the main model first; when it is busy or fails, the backup writes it (Gemini Flash -> Flash-Lite)
  for (const model of models) {
    const out = await write(provider, model, { system, prompt, maxTokens });
    if (out) return out;
    markModelDown(model);
  }
  return null;
}

async function write(provider, model, { system, prompt, maxTokens }) {
  const anthropic = provider.kind === "anthropic";
  const body = anthropic
    ? { model, system, max_tokens: maxTokens, messages: [{ role: "user", content: prompt }] }
    : { model, max_tokens: maxTokens, temperature: 0.5, messages: [{ role: "system", content: system }, { role: "user", content: prompt }] };
  const headers = anthropic ? { "x-api-key": provider.key, "anthropic-version": "2023-06-01" } : { Authorization: `Bearer ${provider.key}` };
  try {
    const res = await fetch(provider.url, {
      method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`AI ${res.status}: ${(await res.text()).slice(0, 160)}`);
    const data = await res.json();
    const text = anthropic
      ? (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n")
      : data.choices?.[0]?.message?.content || "";
    // plain text only: no markdown, no surrounding quotes
    const clean = String(text).replace(/\*\*|__|^#+\s*/gm, "").replace(/^["“]|["”]$/g, "").trim();
    return clean || null;
  } catch (err) {
    console.error("[ai]", err.message);
    return null;
  }
}

/** The house style every agent writes in, from the store's own settings. */
export function voice(settings) {
  return `You write for ${settings.store.name}, a clothing shop in Pakistan (${settings.store.tagline}). ` +
    "Write warm, short, plain English that a customer reads on WhatsApp or email. No markdown, no emojis unless asked, " +
    `no made-up facts, prices, dates or promises, and nothing beyond what you are asked to write. Prices are in ${settings.store.currency}.`;
}
