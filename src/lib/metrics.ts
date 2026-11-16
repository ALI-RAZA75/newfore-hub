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

/** Each data source gets its own date range: Search Console and Business Profile report days late. */
export type Src = "ga4" | "gsc" | "gbp";
export const SOURCES: Src[] = ["ga4", "gsc", "gbp"];
export type Range = { start: Date; end: Date };
export type Win = Record<Src, Range>;

const rangeDays = (r: Range) => Math.max(0, Math.round((r.end.getTime() - r.start.getTime()) / 86400000) + 1);

/** Days of the week starting `mon` that have data (`days` caps it, e.g. to match a partial week). */
export function weekWindow(mon: Date, days = 7): Win {
  const yesterday = subDays(new Date(), 1);
  const gLatest = subDays(new Date(), GSC_SHIFT);
  const site = { start: mon, end: minDate(addDays(mon, days - 1), yesterday) };
  return {
    ga4: site,
    gbp: site,
    gsc: { start: subDays(mon, GSC_SHIFT), end: minDate(subDays(addDays(mon, days - 1), GSC_SHIFT), gLatest) },
  };
}

/** `len` days ending `offset` days before each source's latest date with data. */
export function rollingWindow(latest: Record<Src, Date>, len: number, offset = 0): Win {
  const r = (d: Date): Range => { const end = subDays(d, offset); return { start: subDays(end, len - 1), end }; };
  return { ga4: r(latest.ga4), gsc: r(latest.gsc), gbp: r(latest.gbp) };
}

/** Number of days with data so far in a window (7 for complete weeks, 0 for a week that hasn't started). */
export const daysIn = (w: Win) => rangeDays(w.ga4);

/** Each source's rows for its own range (manual numbers follow the website range). */
export async function rowsFor(w: Win): Promise<MRow[]> {
  const key = (r: Range) => `${ymd(r.start)}|${ymd(r.end)}`;
  const ranges = new Map(SOURCES.map((s) => [key(w[s]), w[s]] as const));
  const got = new Map(await Promise.all([...ranges].map(async ([k, r]) =>
    [k, r.end >= r.start ? await sumBetween(r.start, r.end) : []] as const)));
  return [
    ...SOURCES.flatMap((s) => (got.get(key(w[s])) || []).filter((r) => r.source === s)),
    ...(got.get(key(w.ga4)) || []).filter((r) => !SOURCES.includes(r.source as Src)),
  ];
}

/** 28 days ending on each source's last day in the window. */
export const window28 = (w: Win): Win =>
  Object.fromEntries(SOURCES.map((s) => [s, { start: subDays(w[s].end, 27), end: w[s].end }])) as Win;

/** The latest day each source has real data (values above zero; review snapshots are dated daily, so they don't count). */
export async function latestDates(): Promise<Record<Src, Date>> {
  const sb = supabaseServer();
  const fallback = subDays(new Date(), 1);
  const found = await Promise.all(SOURCES.map(async (s) => {
    const { data } = await sb.from("metrics_daily").select("date").eq("source", s).gt("value", 0)
      .not("metric", "in", "(reviews_snap,rating_snap)").order("date", { ascending: false }).limit(1).maybeSingle();
    return [s, data?.date ? new Date(data.date + "T00:00:00") : fallback] as const;
  }));
  return Object.fromEntries(found) as Record<Src, Date>;
}

/** "Nov 9–15", or "Oct 31–Nov 6" across months. */
export function fmtRange(r: Range) {
  if (r.end < r.start) return "no days yet";
  return format(r.start, "MMM") === format(r.end, "MMM")
    ? `${format(r.start, "MMM d")}–${format(r.end, "d")}`
    : `${format(r.start, "MMM d")}–${format(r.end, "MMM d")}`;
}

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
export async function loadWeeks(weekParam?: string, count = SPARK_WEEKS) {
  const options = weekOptions();
  const sel = options.find((o) => o.iso === weekParam) ?? options[1];
  const selMon = new Date(sel.iso + "T00:00:00");
  const mondays = Array.from({ length: count + 1 }, (_, i) => subWeeks(selMon, count - i));
  const wins = mondays.map((m) => weekWindow(m));
  const curWin = wins[count];
  const days = daysIn(curWin);
  const prevWin = days < 7 ? weekWindow(mondays[count - 1], days) : wins[count - 1];
  const [rows, partialPrev] = await Promise.all([
    Promise.all(wins.map(rowsFor)),
    days < 7 ? rowsFor(prevWin) : Promise.resolve(null),
  ]);
  return {
    options, sel, mondays, wins, rows, days, curWin, prevWin,
    isos: mondays.map(ymd),
    cur: rows[count],
    prev: partialPrev ?? rows[count - 1],
  };
}
export type Weeks = Awaited<ReturnType<typeof loadWeeks>>;

// ---------- Periods: last 7 days, last 28 days, or one Mon–Sun week ----------
export type PeriodKind = "7d" | "28d" | "week";

/** Choices for the period selector: the two rolling periods, then the weeks. */
export function periodOptions() {
  return [
    { value: "7d", label: "Last 7 days" },
    { value: "28d", label: "Last 28 days" },
    ...weekOptions().map((o) => ({ value: o.iso, label: o.label === o.range ? o.range : `${o.label} (${o.range})` })),
  ];
}

/** Query string that keeps the selected period on links between pages. */
export const periodQuery = (p: { kind: PeriodKind; value: string }) => (p.kind === "week" ? `week=${p.value}` : `period=${p.value}`);

/**
 * The selected period (default: last 7 days) with its comparison period, plus 13 seven-day blocks
 * (oldest first, the last one ending with the period) for sparklines, weekly charts and goal history.
 * Rolling periods end on each source's latest day with data, so late data never reads as a drop.
 */
export async function loadPeriod(params: { period?: string; week?: string }) {
  const options = periodOptions();
  const weekIso = weekOptions().find((o) => o.iso === params.week)?.iso;
  const kind: PeriodKind = params.period === "28d" ? "28d" : !params.period && weekIso ? "week" : "7d";
  const today = new Date();

  if (kind === "week") {
    const w = await loadWeeks(weekIso);
    return {
      kind, value: w.sel.iso, options, len: 7, days: w.days,
      label: w.sel.label === w.sel.range ? `Week of ${w.sel.range}` : `${w.sel.label} (${w.sel.range})`,
      curWin: w.curWin, prevWin: w.prevWin, cur: w.cur, prev: w.prev,
      blocks: { wins: w.wins, rows: w.rows },
      weeks: w,
      boardWeek: w.sel.iso,
      tasks: { start: w.sel.iso, end: ymd(addDays(w.mondays[SPARK_WEEKS], 6)), blockEnds: w.mondays.map((m) => addDays(m, 6)) },
    };
  }

  const len = kind === "28d" ? 28 : 7;
  const latest = await latestDates();
  const blockWins = Array.from({ length: SPARK_WEEKS + 1 }, (_, i) => rollingWindow(latest, 7, 7 * (SPARK_WEEKS - i)));
  const curWin = len === 7 ? blockWins[SPARK_WEEKS] : rollingWindow(latest, len);
  const prevWin = len === 7 ? blockWins[SPARK_WEEKS - 1] : rollingWindow(latest, len, len);
  const [blockRows, cur28, prev28] = await Promise.all([
    Promise.all(blockWins.map(rowsFor)),
    len === 28 ? rowsFor(curWin) : Promise.resolve(null),
    len === 28 ? rowsFor(prevWin) : Promise.resolve(null),
  ]);
  return {
    kind, value: kind as string, options, len, days: len,
    label: kind === "28d" ? "Last 28 days" : "Last 7 days",
    curWin, prevWin,
    cur: cur28 ?? blockRows[SPARK_WEEKS],
    prev: prev28 ?? blockRows[SPARK_WEEKS - 1],
    blocks: { wins: blockWins, rows: blockRows },
    weeks: null,
    boardWeek: ymd(mondayOf(today)),
    // Tasks aren't reported late: their period ends today
    tasks: {
      start: ymd(subDays(today, len - 1)), end: ymd(today),
      blockEnds: Array.from({ length: SPARK_WEEKS + 1 }, (_, i) => subDays(today, 7 * (SPARK_WEEKS - i))),
    },
  };
}
export type Period = Awaited<ReturnType<typeof loadPeriod>>;

/** "Website: Nov 9–15 vs Nov 2–8 · Search Console: … · Google Maps: …" */
export const SOURCE_NAMES: Record<Src, string> = { ga4: "Website", gsc: "Search Console", gbp: "Google Maps" };
export const periodDates = (p: Period, s: Src) => `${fmtRange(p.curWin[s])} vs ${fmtRange(p.prevWin[s])}`;

/** A goal's agg type: hand-entered goals have none and are treated as a level heading for the target. */
export const aggOf = (g: Goal): Agg | null => (g.metric_key ? METRICS[g.metric_key]?.agg ?? null : null);

/** The source a goal's metric comes from, so its dates follow that source's window. */
const srcOf = (g: Goal): Src =>
  g.metric_key && /question|brand|nonbrand|gsc_|top5/.test(g.metric_key) ? "gsc" : g.metric_key?.startsWith("gbp_") ? "gbp" : "ga4";

/** Everything a goal shows for the selected period: value, 12-week spark and how often it hit target. */
export function goalPeriod(g: Goal, p: Period, keywords: string[], plan?: { start_date: string; end_date: string }) {
  const agg = aggOf(g), src = srcOf(g);
  const ctxFor = (w: Win, len: number): WeekCtx =>
    ({ weekStart: ymd(w[src].start), days: Math.min(len, daysIn(w)), len, planStart: plan?.start_date, planEnd: plan?.end_date });
  const valueOf = (rows: MRow[]) =>
    !g.metric_key ? g.manual_value : rows.length ? METRICS[g.metric_key]?.fn(rows, { keywords }) ?? null : null;
  const idx = Array.from({ length: SPARK_WEEKS }, (_, i) => i + 1);
  const { wins, rows } = p.blocks;
  // Count complete 7-day blocks with data since the plan started
  const counted = g.metric_key
    ? idx.filter((i) => daysIn(wins[i]) === 7 && rows[i].length > 0 && (!plan || ymd(wins[i][src].end) >= plan.start_date) && valueOf(rows[i]) !== null)
    : [];
  return {
    agg,
    ctx: { ...ctxFor(p.curWin, p.len), days: p.days },
    value: valueOf(p.cur),
    spark: g.metric_key ? idx.map((i) => valueOf(rows[i])) : [],
    hits: counted.filter((i) => onTarget(g, agg, valueOf(rows[i]), ctxFor(wins[i], 7))).length,
    counted: counted.length,
  };
}

// ---------- Review count history (daily reviews_snap per location) ----------
export type Snap = { date: string; dim: string; value: number };

/** Every review-count (or rating) snapshot, oldest first (a few rows per day, so this stays small). */
export async function reviewSnaps(metric: "reviews_snap" | "rating_snap" = "reviews_snap"): Promise<Snap[]> {
  const sb = supabaseServer();
  const out: Snap[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from("metrics_daily").select("date,dim,value")
      .eq("source", "gbp").eq("metric", metric).order("date").range(from, from + 999);
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

/** Latest snapshot value on or before `asOf` (yyyy-MM-dd), or null. */
export function snapAt(snaps: Snap[], loc: string, asOf: string) {
  let v: number | null = null;
  for (const s of snaps) if (s.dim === loc && s.date <= asOf) v = s.value;
  return v;
}

export type ReviewFlow = {
  now: number; nowDate: string; start: number; startDate: string;
  /** No snapshot before the period, so it starts from the oldest one inside it ("Since <date>"). */
  fallback: boolean;
  gained: number; removed: number; net: number; kept: number | null;
  daily: Map<string, { gained: number; removed: number }>;
};

/**
 * Reviews gained and removed at one location between `start` and `end` (yyyy-MM-dd, inclusive).
 *
 * Today this walks the daily review totals: each day's change from the previous existing day is a
 * gain or a removal, so both are minimums (a gain and a removal on the same day cancel out). When
 * the Google reviews API is approved, this is the one place to switch to comparing review IDs.
 */
export function reviewFlow(snaps: Snap[], loc: string, start: string, end: string): ReviewFlow | null {
  const mine = snaps.filter((s) => s.dim === loc && s.date <= end);
  const nowSnap = mine[mine.length - 1];
  if (!nowSnap || nowSnap.date < start) return null; // no snapshot in the period (e.g. a renamed profile)
  const before = mine.filter((s) => s.date < start);
  const fallback = before.length === 0;
  const startSnap = fallback ? mine.find((s) => s.date >= start)! : before[before.length - 1];

  const daily = new Map<string, { gained: number; removed: number }>();
  let gained = 0, removed = 0, prev = startSnap.value;
  for (const s of mine) {
    if (s.date <= startSnap.date) continue;
    const d = s.value - prev;
    prev = s.value;
    if (d === 0) continue;
    const day = daily.get(s.date) || { gained: 0, removed: 0 };
    if (d > 0) { gained += d; day.gained += d; } else { removed -= d; day.removed -= d; }
    daily.set(s.date, day);
  }
  const net = gained - removed;
  if (net !== nowSnap.value - startSnap.value) {
    // Can't happen: the daily changes add up to now − start. Logged rather than thrown so the page still loads.
    console.error(`reviewFlow: net ${net} ≠ now − start ${nowSnap.value - startSnap.value} for ${loc} ${start}..${end}`);
  }
  return {
    now: nowSnap.value, nowDate: nowSnap.date, start: startSnap.value, startDate: startSnap.date, fallback,
    gained, removed, net, kept: gained ? net / gained : null, daily,
  };
}

/** Gained and removed added up over every location with snapshots in the period. */
export function reviewFlowAll(snaps: Snap[], start: string, end: string) {
  const locs = [...new Set(snaps.filter((s) => s.date >= start && s.date <= end).map((s) => s.dim))];
  const flows = locs.map((l) => reviewFlow(snaps, l, start, end)).filter((f): f is ReviewFlow => f !== null);
  return flows.length
    ? { gained: flows.reduce((s, f) => s + f.gained, 0), removed: flows.reduce((s, f) => s + f.removed, 0) }
    : null;
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
