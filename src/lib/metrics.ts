import "server-only";
import { addDays, format, startOfWeek, subDays, subWeeks } from "date-fns";
import { supabaseServer } from "./supabase-server";

export type MRow = { source: string; metric: string; dim: string; value: number };
export type WRow = MRow & { week: string };

const ymd = (d: Date) => format(d, "yyyy-MM-dd");

async function rpcAll<T>(fn: string, args: Record<string, unknown>): Promise<T[]> {
  const sb = supabaseServer();
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.rpc(fn, args).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data as T[]) || []));
    if (!data || data.length < 1000) break;
  }
  return out.map((r: any) => ({ ...r, value: Number(r.value) }));
}

export async function sumBetween(start: Date, end: Date) {
  return rpcAll<MRow>("metrics_sum", { p_start: ymd(start), p_end: ymd(end) });
}

export async function weekly(weeks = 12) {
  const end = subDays(new Date(), 1);
  const start = startOfWeek(subWeeks(end, weeks - 1), { weekStartsOn: 1 });
  return rpcAll<WRow>("metrics_weekly", { p_start: ymd(start), p_end: ymd(end), p_source: null });
}

// ---------- Reading values out of rows ----------
export const pick = (rows: MRow[], source: string, metric: string, dim?: string | string[]) =>
  rows
    .filter((r) => r.source === source && r.metric === metric && (dim === undefined || (Array.isArray(dim) ? dim.includes(r.dim) : r.dim === dim)))
    .reduce((s, r) => s + r.value, 0);

export const byDim = (rows: MRow[], source: string, metric: string) => {
  const m = new Map<string, number>();
  rows.filter((r) => r.source === source && r.metric === metric).forEach((r) => m.set(r.dim, (m.get(r.dim) || 0) + r.value));
  return m;
};

const wpos = (rows: MRow[], dim: string | string[]) => {
  const imp = pick(rows, "gsc", "impressions", dim);
  return imp ? pick(rows, "gsc", "posw", dim) / imp : null;
};

/** Every live metric a goal can point at. Values are for whatever window `rows` covers. */
export const METRICS: Record<string, { label: string; fn: (rows: MRow[], ctx: { keywords: string[] }) => number | null; decimals?: number }> = {
  ai_sessions_28d: { label: "AI assistant visits", fn: (r) => pick(r, "ga4", "ai_sessions") },
  ai_platforms_28d: { label: "AI platforms sending visits", fn: (r) => [...byDim(r, "ga4", "ai_sessions").values()].filter((v) => v > 0).length },
  ai_leads_28d: { label: "Leads from AI", fn: (r) => pick(r, "ga4", "ai_leads") },
  total_leads_28d: { label: "All leads (key events)", fn: (r) => pick(r, "ga4", "leads") },
  sessions_28d: { label: "All website visits", fn: (r) => pick(r, "ga4", "sessions") },
  maps_sessions_28d: { label: "Visits from Google Maps", fn: (r) => pick(r, "ga4", "sessions", "Google Maps") },
  organic_sessions_28d: { label: "Visits from Google Search", fn: (r) => pick(r, "ga4", "sessions", "Organic Search") },
  question_impressions_28d: { label: "Views on question searches", fn: (r) => pick(r, "gsc", "impressions", "question") },
  question_position_28d: { label: "Avg ranking, question searches", fn: (r) => wpos(r, "question"), decimals: 1 },
  brand_clicks_28d: { label: "Brand search clicks", fn: (r) => pick(r, "gsc", "clicks", "brand") },
  nonbrand_clicks_28d: { label: "Non-brand search clicks", fn: (r) => pick(r, "gsc", "clicks", ["question", "short"]) },
  gsc_clicks_28d: { label: "Google Search clicks", fn: (r) => pick(r, "gsc", "clicks", "all") },
  gsc_impressions_28d: { label: "Google Search views", fn: (r) => pick(r, "gsc", "impressions", "all") },
  top5_keywords: {
    label: "Key searches in the top 5 (first 4 tracked searches)",
    fn: (r, ctx) =>
      ctx.keywords.slice(0, 4).filter((k) => {
        const imp = pick(r, "gsc", "kw_impr", k.toLowerCase());
        return imp > 0 && pick(r, "gsc", "kw_posw", k.toLowerCase()) / imp <= 5;
      }).length,
  },
  gbp_reviews_total: { label: "Google reviews, all locations", fn: (r) => pick(r, "gbp", "reviews_snap") || null },
  gbp_calls_28d: { label: "Calls from Google profiles", fn: (r) => pick(r, "gbp", "calls") },
  gbp_website_28d: { label: "Website clicks from Google profiles", fn: (r) => pick(r, "gbp", "website_clicks") },
  gbp_directions_28d: { label: "Direction requests", fn: (r) => pick(r, "gbp", "directions") },
  gbp_views_28d: { label: "Google profile views", fn: (r) => pick(r, "gbp", "views") },
};

export function windows() {
  const y = subDays(new Date(), 1);
  const g = subDays(new Date(), 3); // Search Console lags 2–3 days
  return {
    cur: { start: subDays(y, 6), end: y },
    prev: { start: subDays(y, 13), end: subDays(y, 7) },
    gscCur: { start: subDays(g, 6), end: g },
    gscPrev: { start: subDays(g, 13), end: subDays(g, 7) },
    d28: { start: subDays(y, 27), end: y },
    gsc28: { start: subDays(g, 27), end: g },
  };
}

/** Current 28-day value for every metric (GSC metrics use the lagged window). */
export async function current28(keywords: string[]) {
  const w = windows();
  const [a, g] = await Promise.all([sumBetween(w.d28.start, w.d28.end), sumBetween(w.gsc28.start, w.gsc28.end)]);
  const rows = [...a.filter((r) => r.source !== "gsc"), ...g.filter((r) => r.source === "gsc")];
  const out: Record<string, number | null> = {};
  for (const [k, m] of Object.entries(METRICS)) out[k] = m.fn(rows, { keywords });
  return out;
}

/** Weekly series for one metric, oldest first. */
export function weeklySeries(rows: WRow[], key: string, keywords: string[]) {
  const weeks = [...new Set(rows.map((r) => r.week))].sort();
  return weeks.map((w) => ({ week: w, value: METRICS[key]?.fn(rows.filter((r) => r.week === w), { keywords }) ?? null }));
}

export const weekLabel = (iso: string) => format(new Date(iso + "T00:00:00"), "MMM d");
export const nextMonday = (d: Date) => addDays(startOfWeek(d, { weekStartsOn: 1 }), 7);
