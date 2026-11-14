import "server-only";
import { addDays, format, startOfWeek, subDays, subWeeks } from "date-fns";
import { supabaseServer } from "./supabase-server";
import { Agg, Goal, onTarget, WeekCtx } from "./goals";

export type MRow = { source: string; metric: string; dim: string; value: number };

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

/**
 * Every live metric a goal can point at. Values are for whatever window `rows` covers (normally one
 * Monday–Sunday week). The keys keep their old "_28d" names so existing goals stay linked.
 */
export const METRICS: Record<string, { label: string; agg: Agg; fn: (rows: MRow[], ctx: { keywords: string[] }) => number | null; decimals?: number }> = {
  ai_sessions_28d: { label: "AI assistant visits", agg: "sum", fn: (r) => pick(r, "ga4", "ai_sessions") },
  ai_platforms_28d: { label: "AI platforms sending visits", agg: "count", fn: (r) => [...byDim(r, "ga4", "ai_sessions").values()].filter((v) => v > 0).length },
  ai_leads_28d: { label: "Leads from AI", agg: "sum", fn: (r) => pick(r, "ga4", "ai_leads") },
  total_leads_28d: { label: "All leads (key events)", agg: "sum", fn: (r) => pick(r, "ga4", "leads") },
  sessions_28d: { label: "All website visits", agg: "sum", fn: (r) => pick(r, "ga4", "sessions") },
  maps_sessions_28d: { label: "Visits from Google Maps", agg: "sum", fn: (r) => pick(r, "ga4", "sessions", "Google Maps") },
  organic_sessions_28d: { label: "Visits from Google Search", agg: "sum", fn: (r) => pick(r, "ga4", "sessions", "Organic Search") },
  question_impressions_28d: { label: "Views on question searches", agg: "sum", fn: (r) => pick(r, "gsc", "impressions", "question") },
  question_position_28d: { label: "Avg ranking, question searches", agg: "avg", fn: (r) => wpos(r, "question"), decimals: 1 },
  brand_clicks_28d: { label: "Brand search clicks", agg: "sum", fn: (r) => pick(r, "gsc", "clicks", "brand") },
  nonbrand_clicks_28d: { label: "Non-brand search clicks", agg: "sum", fn: (r) => pick(r, "gsc", "clicks", ["question", "short"]) },
  gsc_clicks_28d: { label: "Google Search clicks", agg: "sum", fn: (r) => pick(r, "gsc", "clicks", "all") },
  gsc_impressions_28d: { label: "Google Search views", agg: "sum", fn: (r) => pick(r, "gsc", "impressions", "all") },
  top5_keywords: {
    label: "Key searches in the top 5 (first 4 tracked searches)",
    agg: "count",
    fn: (r, ctx) =>
      ctx.keywords.slice(0, 4).filter((k) => {
        const imp = pick(r, "gsc", "kw_impr", k.toLowerCase());
        return imp > 0 && pick(r, "gsc", "kw_posw", k.toLowerCase()) / imp <= 5;
      }).length,
  },
  gbp_reviews_total: { label: "Google reviews, all locations", agg: "snapshot", fn: (r) => pick(r, "gbp", "reviews_snap") || null },
  gbp_calls_28d: { label: "Calls from Google profiles", agg: "sum", fn: (r) => pick(r, "gbp", "calls") },
  gbp_website_28d: { label: "Website clicks from Google profiles", agg: "sum", fn: (r) => pick(r, "gbp", "website_clicks") },
  gbp_directions_28d: { label: "Direction requests", agg: "sum", fn: (r) => pick(r, "gbp", "directions") },
  gbp_views_28d: { label: "Google profile views", agg: "sum", fn: (r) => pick(r, "gbp", "views") },
};

export const weekLabel = (iso: string) => format(new Date(iso + "T00:00:00"), "MMM d");

// ---------- Monday–Sunday weeks ----------
export const GSC_SHIFT = 3; // Search Console reports late, so its week runs 3 days earlier

const minDate = (a: Date, b: Date) => (a < b ? a : b);
export const mondayOf = (d: Date) => startOfWeek(d, { weekStartsOn: 1 });
export const weekRange = (mon: Date) => `${format(mon, "MMM d")} – ${format(addDays(mon, 6), "MMM d")}`;

/** The weeks the page can show, newest first: this week, last week and the 12 before. */
export function weekOptions() {
  const thisMon = mondayOf(new Date());
  return Array.from({ length: 14 }, (_, i) => {
    const mon = subWeeks(thisMon, i);
    return { iso: ymd(mon), label: i === 0 ? "This week" : i === 1 ? "Last week" : weekRange(mon), range: weekRange(mon) };
  });
}

export type Win = { start: Date; end: Date; gStart: Date; gEnd: Date };

/** Days of the week starting `mon` that have data (`days` caps it, e.g. to match a partial week). */
export function weekWindow(mon: Date, days = 7): Win {
  const yesterday = subDays(new Date(), 1);
  const gLatest = subDays(new Date(), GSC_SHIFT);
  return {
    start: mon,
    end: minDate(addDays(mon, days - 1), yesterday),
    gStart: subDays(mon, GSC_SHIFT),
    gEnd: minDate(subDays(addDays(mon, days - 1), GSC_SHIFT), gLatest),
  };
}

/** Number of days with data so far in a week (7 for complete weeks, 0 for a week that hasn't started). */
export const daysIn = (w: Win) => Math.max(0, Math.round((w.end.getTime() - w.start.getTime()) / 86400000) + 1);

/** GA4, Business Profile and manual rows for the window, plus Search Console rows for its shifted window. */
export async function rowsFor(w: Win): Promise<MRow[]> {
  const [a, g] = await Promise.all([
    w.end >= w.start ? sumBetween(w.start, w.end) : Promise.resolve([]),
    w.gEnd >= w.gStart ? sumBetween(w.gStart, w.gEnd) : Promise.resolve([]),
  ]);
  return [...a.filter((r) => r.source !== "gsc"), ...g.filter((r) => r.source === "gsc")];
}

/** 28 days ending on the window's last day (Search Console shifted the same way). */
export const window28 = (w: Win): Win => ({ start: subDays(w.end, 27), end: w.end, gStart: subDays(w.gEnd, 27), gEnd: w.gEnd });

/** A point-in-time value (e.g. review count), or null if there's no snapshot in these rows. */
export const snap = (rows: MRow[], metric: string, dim: string) => {
  const r = rows.find((x) => x.source === "gbp" && x.metric === metric && x.dim === dim);
  return r ? r.value : null;
};

export const SPARK_WEEKS = 12;

/**
 * The selected week (from ?week=, default last complete week) plus the 12 weeks before it, oldest first.
 * `prev` is the week before, cut to the same days while the selected week is still in progress.
 */
export async function loadWeeks(weekParam?: string) {
  const options = weekOptions();
  const sel = options.find((o) => o.iso === weekParam) ?? options[1];
  const selMon = new Date(sel.iso + "T00:00:00");
  const mondays = Array.from({ length: SPARK_WEEKS + 1 }, (_, i) => subWeeks(selMon, SPARK_WEEKS - i));
  const wins = mondays.map((m) => weekWindow(m));
  const curWin = wins[SPARK_WEEKS];
  const days = daysIn(curWin);
  const prevWin = days < 7 ? weekWindow(mondays[SPARK_WEEKS - 1], days) : wins[SPARK_WEEKS - 1];
  const [rows, partialPrev] = await Promise.all([
    Promise.all(wins.map(rowsFor)),
    days < 7 ? rowsFor(prevWin) : Promise.resolve(null),
  ]);
  return {
    options, sel, mondays, wins, rows, days, curWin, prevWin,
    isos: mondays.map(ymd),
    cur: rows[SPARK_WEEKS],
    prev: partialPrev ?? rows[SPARK_WEEKS - 1],
  };
}
export type Weeks = Awaited<ReturnType<typeof loadWeeks>>;

/** A goal's agg type: hand-entered goals have none and are treated as a level heading for the target. */
export const aggOf = (g: Goal): Agg | null => (g.metric_key ? METRICS[g.metric_key]?.agg ?? null : null);

/** Everything a goal shows for the selected week: value, 12-week spark and how often it hit target. */
export function goalWeekly(g: Goal, w: Weeks, keywords: string[], plan?: { start_date: string; end_date: string }) {
  const agg = aggOf(g);
  const ctxAt = (i: number): WeekCtx => ({ weekStart: w.isos[i], days: daysIn(w.wins[i]), planStart: plan?.start_date, planEnd: plan?.end_date });
  const valueAt = (i: number) =>
    !g.metric_key ? g.manual_value : w.rows[i].length ? METRICS[g.metric_key]?.fn(w.rows[i], { keywords }) ?? null : null;
  const idx = Array.from({ length: SPARK_WEEKS }, (_, i) => i + 1);
  // Count complete weeks with data since the plan started
  const planMon = plan ? ymd(mondayOf(new Date(plan.start_date + "T00:00:00"))) : "";
  const counted = g.metric_key
    ? idx.filter((i) => daysIn(w.wins[i]) === 7 && w.rows[i].length > 0 && w.isos[i] >= planMon && valueAt(i) !== null)
    : [];
  return {
    agg,
    ctx: ctxAt(SPARK_WEEKS),
    value: valueAt(SPARK_WEEKS),
    spark: g.metric_key ? idx.map(valueAt) : [],
    hits: counted.filter((i) => onTarget(g, agg, valueAt(i), ctxAt(i))).length,
    counted: counted.length,
  };
}

// ---------- Review count history (daily reviews_snap per location) ----------
export type Snap = { date: string; dim: string; value: number };

/** Every review-count snapshot, oldest first (a few rows per day, so this stays small). */
export async function reviewSnaps(): Promise<Snap[]> {
  const sb = supabaseServer();
  const out: Snap[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("metrics_daily").select("date,dim,value")
      .eq("source", "gbp").eq("metric", "reviews_snap").order("date").range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []).map((r: any) => ({ date: r.date as string, dim: r.dim as string, value: Number(r.value) })));
    if (!data || data.length < 1000) break;
  }
  return out;
}

/**
 * Reviews gained over the 28 days to the latest snapshot on or before `asOf`. Compares with the
 * snapshot 28 days earlier (or the nearest before it); until one exists, with the oldest snapshot
 * (`fallback`). `strict` returns null instead of falling back.
 */
export function reviews28(snaps: Snap[], loc: string, asOf: string, strict = false) {
  const mine = snaps.filter((s) => s.dim === loc && s.date <= asOf);
  const now = mine[mine.length - 1];
  if (!now) return null;
  const cutoff = format(subDays(new Date(now.date + "T00:00:00"), 28), "yyyy-MM-dd");
  const earlier = mine.filter((s) => s.date <= cutoff);
  const fallback = earlier.length === 0;
  if (fallback && strict) return null;
  const past = fallback ? mine[0] : earlier[earlier.length - 1];
  return { now: now.value, past: past === now ? null : past.value, pastDate: past.date, fallback, diff: past === now ? null : now.value - past.value };
}

/** All locations' 28-day gain added up; null when no location has a strict 28-day comparison. */
export function reviews28All(snaps: Snap[], locs: string[], asOf: string) {
  const diffs = locs.map((l) => reviews28(snaps, l, asOf, true)?.diff).filter((n): n is number => n !== null && n !== undefined);
  return diffs.length ? diffs.reduce((s, n) => s + n, 0) : null;
}

/** Reviews gained between two weeks' latest snapshots, per location; null when either week has none. */
export function newReviews(cur: MRow[], prev: MRow[], loc: string) {
  const a = snap(cur, "reviews_snap", loc), b = snap(prev, "reviews_snap", loc);
  return a === null || b === null ? null : a - b;
}

export function newReviewsAll(cur: MRow[], prev: MRow[]) {
  const locs = [...new Set(cur.filter((r) => r.source === "gbp" && r.metric === "reviews_snap").map((r) => r.dim))];
  const diffs = locs.map((l) => newReviews(cur, prev, l)).filter((n): n is number => n !== null);
  return diffs.length ? diffs.reduce((s, n) => s + n, 0) : null;
}
