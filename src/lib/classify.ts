// Shared rules for grouping traffic. Mirrors the Data Studio report's calculated fields.

export const AI_PLATFORMS: [string, RegExp][] = [
  ["ChatGPT", /chatgpt|openai/i],
  ["Claude", /claude\.ai|anthropic/i],
  ["Perplexity", /perplexity/i],
  ["Gemini", /gemini\.google|bard\.google/i],
  ["Copilot", /copilot\.microsoft|edgeservices\.bing|copilot/i],
  ["DeepSeek", /deepseek/i],
  ["Grok", /grok|x\.ai/i],
  ["Meta AI", /meta\.ai/i],
  ["Other AI", /mistral|poe\.com|you\.com/i],
];

export function aiPlatform(source: string): string | null {
  for (const [name, re] of AI_PLATFORMS) if (re.test(source)) return name;
  return null;
}

export const CHANNELS = [
  "AI Assistants",
  "Google Maps",
  "Organic Search",
  "Paid Search",
  "Direct",
  "Referral",
  "Organic Social",
  "Email",
  "Other",
] as const;
export type Channel = (typeof CHANNELS)[number];

/** Channel for one GA4 row. Campaign tags like ?utm_campaign=gbp-hamilton count as Google Maps. */
export function channelOf(source: string, campaign: string, defaultGroup: string): Channel {
  if (aiPlatform(source)) return "AI Assistants";
  if (/gbp/i.test(campaign)) return "Google Maps";
  const g = defaultGroup.toLowerCase();
  if (g.includes("organic search")) return "Organic Search";
  if (g.includes("paid")) return "Paid Search";
  if (g === "direct") return "Direct";
  if (g.includes("referral")) return "Referral";
  if (g.includes("social")) return "Organic Social";
  if (g.includes("email")) return "Email";
  return "Other";
}

/** Maps profile for a GBP campaign tag, e.g. gbp-stoneycreek -> Stoney Creek. */
export function gbpLocationOf(campaign: string): string {
  const c = campaign.toLowerCase();
  if (c.includes("stoney")) return "Stoney Creek";
  if (c.includes("hamilton")) return "Hamilton";
  if (c.includes("brant")) return "Brantford";
  if (c.includes("cath")) return "St. Catharines";
  return "Untagged";
}

export const BOT_CITIES = ["Council Bluffs", "Singapore", "Larnaca"];

const QUESTION = /^(how|what|why|when|where|which|who|can|do|does|is|are|should|best|cost|average|price)\b/i;

export function queryClass(query: string, brandTerms: string[]): "brand" | "question" | "short" {
  const q = query.toLowerCase();
  if (brandTerms.some((b) => q.includes(b.toLowerCase()))) return "brand";
  if (QUESTION.test(q) || q.split(/\s+/).length >= 5) return "question";
  return "short";
}

// ---------- Tracked keyword matching ----------
const STOP = new Set(["on", "ontario", "in", "near", "me", "the", "a", "for", "of", "ca"]);
const norm = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter(Boolean)
    .filter((w) => !STOP.has(w))
    .map((w) => (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w));

/**
 * True when every important word of the tracked keyword appears in the search,
 * ignoring plurals and filler words. "home addition stoney creek" matches
 * "home additions stoney creek on" and "stoney creek home addition contractor".
 */
export function matchesKeyword(query: string, keyword: string): boolean {
  const q = new Set(norm(query));
  const k = norm(keyword);
  return k.length > 0 && k.every((w) => q.has(w));
}
