import Link from "next/link";
import { addDays, eachDayOfInterval, format, formatDistanceToNow, subDays } from "date-fns";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import {
  byDim, fmtRange, goalPeriod, latestDates, loadPeriod, loadWeeks, METRICS, MRow, newReviewsAll, periodDates, periodQuery, pick, ReviewFlow, reviewFlow,
  reviewFlowAll, reviews28All, reviewSnaps, rollingWindow, rowsFor, snapAt, SOURCE_NAMES, SOURCES, window28,
} from "@/lib/metrics";
import { CHANNELS } from "@/lib/classify";
import { GOAL_SOURCE, goalFor, MANUAL_SOURCE, SCORECARD } from "@/lib/scorecard";
import { weekEndOf } from "@/lib/goals";
import Kpi, { Delta, fmtNum } from "@/components/Kpi";
import LiveNow from "@/components/LiveNow";
import SyncButton from "@/components/SyncButton";
import { Flow, Lines, StackedWeeks } from "@/components/charts";
import GoalBar from "@/components/GoalBar";
import PeriodPicker from "@/components/PeriodPicker";
import Scorecard, { ScoreRow } from "@/components/Scorecard";
import ReviewFlowChart from "@/components/ReviewFlowChart";

export const dynamic = "force-dynamic";

const SCORE_WEEKS = 8;
const FLOW_NOTE = "Counted from daily totals, so gained/removed are minimums. Exact counts come once the Google reviews API is approved.";

/** Sum of the numbers present; null when there are none. */
const sumOf = (xs: (number | null | undefined)[]) => {
  const ns = xs.filter((n): n is number => n !== null && n !== undefined);
  return ns.length ? ns.reduce((s, n) => s + n, 0) : null;
};

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const day = (s: string) => new Date(s + "T00:00:00");
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);

export default async function Performance({ searchParams }: { searchParams: { week?: string; period?: string } }) {
  const me = await getMe();
  const sb = supabaseServer();
  const { data: s } = await sb.from("settings").select("*").eq("id", 1).single();
  const keywords: string[] = s?.tracked_keywords || [];

  // Selected period (default: last 7 days, ending on each source's latest data) and its comparison
  const p = await loadPeriod(searchParams);
  const { cur, prev, curWin, prevWin, kind, len, days } = p;
  const [d28, goalRows, snaps, ratings, sc, live] = await Promise.all([
    rowsFor(window28(curWin)),
    sb.from("metrics_daily").select("metric,value").eq("source", GOAL_SOURCE).then((r) => r.data || []),
    reviewSnaps(),
    reviewSnaps("rating_snap"),
    // The EOS scorecard always shows Mon–Sun weeks (the last 8 complete ones for rolling periods)
    p.weeks ? Promise.resolve(p.weeks) : loadWeeks(undefined, SCORE_WEEKS),
    // Its "live" column: the rolling period (last 7 days when a week is selected)
    kind === "week"
      ? latestDates().then(async (l) => { const win = rollingWindow(l, 7); return { win, rows: await rowsFor(win), len: 7 }; })
      : Promise.resolve({ win: curWin, rows: cur, len }),
  ]);
  const blockRows = p.blocks.rows.slice(1);
  const blockWins = p.blocks.wins.slice(1);

  const { data: plan } = await sb.from("plans").select("id,name,start_date,end_date").eq("status", "active").order("start_date").limit(1).maybeSingle();
  const { data: goals } = plan
    ? await sb.from("goals").select("*").eq("plan_id", plan.id).order("sort").limit(4)
    : { data: [] as any[] };

  const words = kind === "28d"
    ? { cur: "Last 28 days", prev: "Previous 28 days", in: "the last 28 days" }
    : kind === "7d"
      ? { cur: "Last 7 days", prev: "7 days before", in: "the last 7 days" }
      : { cur: "This week", prev: "Week before", in: "this week" };
  const dates = (src: "ga4" | "gsc" | "gbp") => periodDates(p, src);

  const hasData = p.blocks.rows.some((r) => r.length > 0) || d28.length > 0;
  const v = (rows: MRow[], key: string) => METRICS[key].fn(rows, { keywords });
  const series = (key: string) => blockRows.map((rows) => v(rows, key));
  const profileActions = (rows: MRow[]) => pick(rows, "gbp", "calls") + pick(rows, "gbp", "website_clicks") + pick(rows, "gbp", "directions");
  const has = (rows: MRow[], source: string) => rows.some((r) => r.source === source);

  // Weekly scorecard (EOS): last 8 Mon–Sun weeks
  const snapLocs = (rows: MRow[]) => [...new Set(rows.filter((r) => r.source === "gbp" && r.metric === "reviews_snap").map((r) => r.dim))];
  const scoreFn: Record<string, (rows: MRow[], before: MRow[], mon: string) => number | null> = {
    leads: (r) => (has(r, "ga4") ? pick(r, "ga4", "leads") : null),
    organic_sessions: (r) => (has(r, "ga4") ? pick(r, "ga4", "sessions", "Organic Search") : null),
    gsc_clicks: (r) => (has(r, "gsc") ? pick(r, "gsc", "clicks", "all") : null),
    gsc_position: (r) => { const imp = pick(r, "gsc", "impressions", "all"); return imp ? pick(r, "gsc", "posw", "all") / imp : null; },
    ai_sessions: (r) => (has(r, "ga4") ? pick(r, "ga4", "ai_sessions") : null),
    gbp_actions: (r) => (has(r, "gbp") ? profileActions(r) : null),
    new_reviews: (r, before) => newReviewsAll(r, before),
    // Strict 28 days to the week's end: blank until 28 days of snapshots exist
    new_reviews_28d: (r, _before, mon) => reviews28All(snaps, snapLocs(r), weekEndOf(mon)),
    reviews_gained: (_r, _before, mon) => reviewFlowAll(snaps, mon, weekEndOf(mon))?.gained ?? null,
    reviews_removed: (_r, _before, mon) => reviewFlowAll(snaps, mon, weekEndOf(mon))?.removed ?? null,
  };
  const manual = (rows: MRow[], key: string) => rows.find((r) => r.source === MANUAL_SOURCE && r.metric === key)?.value ?? null;
  const scLast = sc.rows.length - 1;
  const scoreIdx = Array.from({ length: SCORE_WEEKS }, (_, i) => scLast - SCORE_WEEKS + 1 + i);
  const scoreWeeks = scoreIdx.map((i) => ({ iso: sc.isos[i], range: `${format(sc.mondays[i], "MMM d")} – ${format(addDays(sc.mondays[i], 6), "MMM d")}` }));
  // Live column: reviews use their own window ending on the latest snapshot; hand-entered rows are weekly only
  const liveSnapEnd = snaps.length ? snaps[snaps.length - 1].date : ymd(subDays(new Date(), 1));
  const liveRev = { start: ymd(subDays(day(liveSnapEnd), live.len - 1)), end: liveSnapEnd };
  const liveFlow = reviewFlowAll(snaps, liveRev.start, liveRev.end);
  const liveSnapLocs = [...new Set(snaps.filter((x) => x.date >= liveRev.start && x.date <= liveRev.end).map((x) => x.dim))];
  const liveValue = (key: string): number | null => {
    if (key === "new_reviews") return liveFlow ? liveFlow.gained - liveFlow.removed : null;
    if (key === "new_reviews_28d") return reviews28All(snaps, liveSnapLocs, liveRev.end);
    if (key === "reviews_gained") return liveFlow?.gained ?? null;
    if (key === "reviews_removed") return liveFlow?.removed ?? null;
    return scoreFn[key](live.rows, [], "");
  };
  const liveColumn = {
    label: `Last ${live.len} days (live)`,
    title: `${SOURCES.map((src) => `${SOURCE_NAMES[src]}: ${fmtRange(live.win[src])}`).join(" · ")} · Reviews: ${fmtRange({ start: day(liveRev.start), end: day(liveRev.end) })}`,
  };
  const scoreRows: ScoreRow[] = SCORECARD.map((m) => {
    const goal = goalRows.find((g: any) => g.metric === m.key)?.value ?? null;
    return {
      ...m,
      goal,
      values: scoreIdx.map((i) => (m.manual ? manual(sc.rows[i], m.key) : scoreFn[m.key](sc.rows[i], sc.rows[i - 1], sc.isos[i]))),
      live: m.manual ? null : liveValue(m.key),
      liveGoal: goalFor(m, goal, live.len),
    };
  });

  // Weekly visits by channel (7-day blocks ending with the period)
  const blockLabel = (i: number, src: "ga4" | "gsc") => format(blockWins[i][src].start, "MMM d");
  const channelWeeks = blockRows.map((rows, i) => {
    const row: Record<string, any> = { week: blockLabel(i, "ga4") };
    for (const c of CHANNELS) row[c] = pick(rows, "ga4", "sessions", c);
    return row;
  });
  const activeChannels = CHANNELS.filter((c) => channelWeeks.some((r) => r[c] > 0));
  const flow = CHANNELS.map((c) => ({ name: c, sessions: pick(cur, "ga4", "sessions", c), leads: pick(cur, "ga4", "leads", c) }));

  // AI platforms, this period vs the one before
  const aiNow = byDim(cur, "ga4", "ai_sessions"), aiPrev = byDim(prev, "ga4", "ai_sessions");
  const aiLeads = byDim(cur, "ga4", "ai_leads"), aiLeadsPrev = byDim(prev, "ga4", "ai_leads");
  const aiList = [...new Set([...aiNow.keys(), ...aiPrev.keys()])]
    .map((name) => ({ name, n: aiNow.get(name) || 0, p: aiPrev.get(name) || 0 }))
    .filter((a) => a.n > 0 || a.p > 0)
    .sort((a, b) => b.n - a.n || b.p - a.p);
  const aiMax = Math.max(1, ...aiList.map((a) => a.n));
  const aiWeekly = blockRows.map((rows, i) => ({ week: blockLabel(i, "ga4"), ai: pick(rows, "ga4", "ai_sessions") }));

  // Reviews: their own window, ending on the latest snapshot (one a day per location)
  const lastSnap = snaps.length ? snaps[snaps.length - 1].date : ymd(subDays(new Date(), 1));
  const revRange = kind === "week"
    ? { start: p.value, end: weekEndOf(p.value) }
    : { start: ymd(subDays(day(lastSnap), len - 1)), end: lastSnap };
  const perfLocs = [...cur, ...prev].filter((r) => r.source === "gbp" && !r.metric.endsWith("_snap")).map((r) => r.dim);
  const snapLocsInRange = snaps.filter((x) => x.date >= revRange.start && x.date <= revRange.end).map((x) => x.dim);
  const locNames = [...new Set([...perfLocs, ...snapLocsInRange])].sort();
  const flows = new Map(locNames.map((l) => [l, reviewFlow(snaps, l, revRange.start, revRange.end)] as const));
  const flowList = [...flows.values()].filter((f): f is ReviewFlow => f !== null);
  const sinceDates = [...new Set(flowList.filter((f) => f.fallback).map((f) => f.startDate))].sort();
  const startHeader = sinceDates.length ? `Since ${format(day(sinceDates[0]), "MMM d")}` : "Start of period";
  const total = {
    now: sumOf(flowList.map((f) => f.now)), start: sumOf(flowList.map((f) => f.start)),
    gained: sumOf(flowList.map((f) => f.gained)), removed: sumOf(flowList.map((f) => f.removed)),
  };
  const totalNet = total.gained === null || total.removed === null ? null : total.gained - total.removed;
  const ratingNow = (l: string) => snapAt(ratings, l, revRange.end);
  const ratingAll = (() => {
    const both = locNames.map((l) => ({ n: flows.get(l)?.now ?? null, r: ratingNow(l) }))
      .filter((x): x is { n: number; r: number } => x.n !== null && x.r !== null && x.n > 0 && x.r > 0);
    const n = both.reduce((sum, x) => sum + x.n, 0);
    return n ? both.reduce((sum, x) => sum + x.r * x.n, 0) / n : null;
  })();
  const chartDays = revRange.end >= revRange.start
    ? eachDayOfInterval({ start: day(revRange.start), end: day(revRange.end) }).map(ymd) : [];
  const byLoc = Object.fromEntries(flowList.length
    ? locNames.filter((l) => flows.get(l)).map((l) => [l, Object.fromEntries(flows.get(l)!.daily)])
    : []);

  const siteVisits = (rows: MRow[], l: string) =>
    [...byDim(rows, "ga4", "gbp_sessions").entries()]
      .filter(([k]) => l.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(l.toLowerCase().split(" ")[0]))
      .reduce((sum, [, n]) => sum + n, 0);
  const mapsCols: { label: string; fn: (rows: MRow[], l: string) => number }[] = [
    { label: "Profile views", fn: (r, l) => pick(r, "gbp", "views", l) },
    { label: "Calls", fn: (r, l) => pick(r, "gbp", "calls", l) },
    { label: "Website clicks", fn: (r, l) => pick(r, "gbp", "website_clicks", l) },
    { label: "Directions", fn: (r, l) => pick(r, "gbp", "directions", l) },
    { label: "Site visits", fn: siteVisits },
  ];

  // Search
  const searchWeekly = blockRows.map((rows, i) => ({
    week: blockLabel(i, "gsc"), brand: pick(rows, "gsc", "clicks", "brand"), question: pick(rows, "gsc", "clicks", "question"), short: pick(rows, "gsc", "clicks", "short"),
  }));
  const kwPos = (rows: MRow[], k: string) => {
    const imp = pick(rows, "gsc", "kw_impr", k.toLowerCase());
    return imp ? pick(rows, "gsc", "kw_posw", k.toLowerCase()) / imp : null;
  };
  const kwViews = (rows: MRow[], k: string) => pick(rows, "gsc", "kw_impr", k.toLowerCase());

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">Performance</p>
          <h1 className="text-3xl font-extrabold">{p.label} at Newfore</h1>
          <p className="muted mt-1 text-sm tnum">
            {SOURCES.map((src) => `${SOURCE_NAMES[src]}: ${dates(src)}`).join(" · ")}
            {" · "}Reviews: {fmtRange({ start: day(revRange.start), end: day(revRange.end) })}
            {kind === "week" && days > 0 && days < 7 ? " (compared with the same days of the week before)" : ""}
            {s?.last_sync_at && <> · Synced {formatDistanceToNow(new Date(s.last_sync_at))} ago</>}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker options={p.options} value={p.value} />
          {me?.role === "admin" && <SyncButton />}
        </div>
      </header>

      {!hasData && (
        <div className="card border-brand/40 bg-brand-soft">
          <p className="font-semibold">No data yet.</p>
          <p className="mt-1 text-sm">
            {me?.role === "admin" ? <>Open <Link className="underline" href="/settings">Settings</Link>, connect Google, pick the GA4 property, Search Console site and Maps locations, then run the first sync (it backfills 16 weeks).</> : "An admin needs to connect Google in Settings."}
          </p>
        </div>
      )}
      {hasData && kind === "week" && days === 0 && (
        <div className="card border-brand/40 bg-brand-soft text-sm">This week has just started, so there’s no data for it yet. Pick “Last 7 days” or “Last week”.</div>
      )}

      <Scorecard weeks={scoreWeeks} rows={scoreRows} isAdmin={me?.role === "admin"} live={liveColumn} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1"><LiveNow /></div>
        <section className="card flex flex-col gap-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="card-title">{plan ? plan.name : "Plan goals"}</h2>
            <Link href={plan ? `/plans/${plan.id}?${periodQuery(p)}` : "/plans"} className="text-sm font-semibold text-brand-dark hover:underline">All goals →</Link>
          </div>
          {(goals || []).length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {(goals || []).map((g: any) => {
                const r = goalPeriod(g, p, keywords, plan ?? undefined);
                return <GoalBar key={g.id} goal={g} agg={r.agg} value={r.value} ctx={r.ctx} spark={r.spark} hits={r.hits} counted={r.counted} period={words.in} compact />;
              })}
            </div>
          ) : <p className="muted text-sm">No goals yet. Add them on the Plans page.</p>}
        </section>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Leads (forms, calls, emails)" cur={v(cur, "total_leads_28d")} prev={v(prev, "total_leads_28d")} spark={series("total_leads_28d")} prevLabel={words.prev} dates={dates("ga4")} />
        <Kpi label="Visits from AI assistants" cur={v(cur, "ai_sessions_28d")} prev={v(prev, "ai_sessions_28d")} spark={series("ai_sessions_28d")} prevLabel={words.prev} dates={dates("ga4")} />
        <Kpi label="Google profile actions" cur={profileActions(cur)} prev={profileActions(prev)} spark={blockRows.map(profileActions)} color="#2E9E6B" note="calls, website, directions" prevLabel={words.prev} dates={dates("gbp")} />
        <Kpi label="Website visits" cur={v(cur, "sessions_28d")} prev={v(prev, "sessions_28d")} spark={series("sessions_28d")} color="#2C3338" prevLabel={words.prev} dates={dates("ga4")} />
        <Kpi label="Google Search clicks" cur={v(cur, "gsc_clicks_28d")} prev={v(prev, "gsc_clicks_28d")} spark={series("gsc_clicks_28d")} color="#3B6FD8" prevLabel={words.prev} dates={dates("gsc")} />
        <Kpi label="Avg ranking, question searches" cur={v(cur, "question_position_28d")} prev={v(prev, "question_position_28d")} spark={series("question_position_28d")} color="#3B6FD8" decimals={1} lowerIsBetter note="lower is better" prevLabel={words.prev} dates={dates("gsc")} />
      </section>

      <div className="grid gap-4 xl:grid-cols-5">
        <section className="card xl:col-span-3">
          <h2 className="card-title">Website visits by channel, per week</h2>
          <p className="muted mb-3 text-xs">
            AI assistants and Google Maps are split out from the usual GA4 channels.
            {kind === "week" ? " The last bar is the selected week." : ` 7-day blocks ending ${format(curWin.ga4.end, "MMM d")}, the latest day with website data.`}
          </p>
          <StackedWeeks data={channelWeeks} keys={activeChannels as unknown as string[]} />
        </section>
        <section className="card xl:col-span-2">
          <h2 className="card-title">Where visitors come from, and who becomes a lead</h2>
          <p className="muted mb-3 text-xs tnum">{words.cur}: {fmtRange(curWin.ga4)}.</p>
          <Flow channels={flow} />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="card-title">AI assistants</h2>
          <p className="muted mb-4 text-xs tnum">Visits and leads by platform. Website: {dates("ga4")}.</p>
          {aiList.length ? (
            <div className="flex flex-col gap-3">
              {aiList.map((a) => (
                <div key={a.name}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold">{a.name}</span>
                    <span className="flex items-center gap-2 tnum">
                      {fmtNum(a.n)} visits · {fmtNum(aiLeads.get(a.name) || 0)} leads
                      <span className="text-xs text-ink-muted">({words.prev.toLowerCase()}: {fmtNum(a.p)} · {fmtNum(aiLeadsPrev.get(a.name) || 0)})</span>
                      <Delta cur={a.n} prev={a.p} />
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-paper"><div className="h-2 rounded-full bg-brand" style={{ width: `${(a.n / aiMax) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          ) : <p className="muted text-sm">No AI visits in this period or the one before.</p>}
          <div className="mt-5">
            <p className="label">AI visits per week</p>
            <Lines data={aiWeekly} series={[{ key: "ai", name: "AI visits", color: "#F15D26" }]} height={160} />
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Google Search</h2>
          <p className="muted mb-3 text-xs tnum">Clicks per week by search type. Search Console: {dates("gsc")}.</p>
          <Lines data={searchWeekly} series={[
            { key: "brand", name: "Searching “Newfore”", color: "#2C3338" },
            { key: "question", name: "Questions & long searches", color: "#F15D26" },
            { key: "short", name: "Short non-brand", color: "#3B6FD8" },
          ]} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm tnum">
              <thead><tr className="text-left text-xs text-ink-muted">
                <th className="py-1.5">Key search</th><th className="text-right">{words.cur}</th><th className="text-right">{words.prev}</th>
                <th className="text-right">28 days</th><th className="text-right">Views ({words.cur.toLowerCase()})</th>
              </tr></thead>
              <tbody>
                {keywords.map((k) => {
                  const a = kwPos(cur, k), b = kwPos(prev, k), m = kwPos(d28, k), n = kwViews(cur, k);
                  return (
                    <tr key={k} className="border-t border-paper-line">
                      <td className="py-1.5">{k}</td>
                      <td className="text-right font-semibold">{a ? fmtNum(a, 1) : <span className="font-normal text-ink-muted">no views</span>}{a && a <= 5 ? " ✓" : ""}</td>
                      <td className="text-right text-ink-muted">{b ? fmtNum(b, 1) : "—"}</td>
                      <td className="text-right">{m ? fmtNum(m, 1) : "—"}</td>
                      <td className="text-right text-ink-muted">{has(cur, "gsc") ? fmtNum(n) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="card">
        <h2 className="card-title">Google Maps, by location</h2>
        <p className="muted mb-3 text-xs tnum">
          Business Profile figures for Google Maps: {dates("gbp")}, with the change vs {words.prev.toLowerCase()}. “Site visits” are GA4 sessions tagged with each
          profile’s UTM link (website dates). Reviews: {fmtRange({ start: day(revRange.start), end: day(revRange.end) })}
          {sinceDates.length ? `, from ${format(day(sinceDates[0]), "MMM d")} where there’s no earlier count yet` : ""}.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-sm tnum">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="py-2">Location</th>
                {mapsCols.map((c) => <th key={c.label} className="text-right">{c.label}</th>)}
                <th className="text-right">Reviews now</th>
                <th className="text-right">{startHeader}</th>
                <th className="text-right" title={FLOW_NOTE}>Gained <span aria-hidden>ⓘ</span></th>
                <th className="text-right" title={FLOW_NOTE}>Removed <span aria-hidden>ⓘ</span></th>
                <th className="text-right">Net</th>
                <th className="text-right" title="Net ÷ gained">Kept %</th>
                <th className="text-right">Rating</th>
              </tr>
            </thead>
            <tbody>
              {locNames.length ? locNames.map((l) => {
                const f = flows.get(l);
                return (
                  <tr key={l} className="border-t border-paper-line align-top">
                    <td className="py-2 font-semibold">{l}</td>
                    {mapsCols.map((c) => (
                      <td key={c.label} className="py-2 text-right">
                        <div>{fmtNum(c.fn(cur, l))}</div>
                        <div className="mt-0.5"><Delta cur={c.fn(cur, l)} prev={c.fn(prev, l)} /></div>
                      </td>
                    ))}
                    <td className="py-2 text-right">{fmtNum(f?.now ?? null)}</td>
                    <td className="py-2 text-right text-ink-muted">
                      {fmtNum(f?.start ?? null)}
                      {f?.fallback && sinceDates.length > 1 && <div className="text-[11px]">{format(day(f.startDate), "MMM d")}</div>}
                    </td>
                    <td className="py-2 text-right text-emerald-700" title={FLOW_NOTE}>{f ? `+${fmtNum(f.gained)}` : "—"}</td>
                    <td className="py-2 text-right text-red-700" title={FLOW_NOTE}>{f ? fmtNum(f.removed) : "—"}</td>
                    <td className="py-2 text-right">{f ? `${f.net > 0 ? "+" : ""}${fmtNum(f.net)}` : "—"}</td>
                    <td className="py-2 text-right">{pct(f?.kept ?? null)}</td>
                    <td className="py-2 text-right">{fmtNum(ratingNow(l), 1)}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={mapsCols.length + 8} className="py-6 text-center text-ink-muted">No Maps data for this period. Choose your locations in Settings (needs Business Profile API access).</td></tr>
              )}
              {locNames.length > 1 && (
                <tr className="border-t-2 border-ink/20 align-top font-semibold">
                  <td className="py-2">Total</td>
                  {mapsCols.map((c) => {
                    const a = sumOf(locNames.map((l) => c.fn(cur, l))), b = sumOf(locNames.map((l) => c.fn(prev, l)));
                    return (
                      <td key={c.label} className="py-2 text-right">
                        <div>{fmtNum(a)}</div>
                        <div className="mt-0.5 font-normal"><Delta cur={a} prev={b} /></div>
                      </td>
                    );
                  })}
                  <td className="py-2 text-right">{fmtNum(total.now)}</td>
                  <td className="py-2 text-right text-ink-muted">{fmtNum(total.start)}</td>
                  <td className="py-2 text-right text-emerald-700" title={FLOW_NOTE}>{total.gained === null ? "—" : `+${fmtNum(total.gained)}`}</td>
                  <td className="py-2 text-right text-red-700" title={FLOW_NOTE}>{fmtNum(total.removed)}</td>
                  <td className="py-2 text-right">{totalNet === null ? "—" : `${totalNet > 0 ? "+" : ""}${fmtNum(totalNet)}`}</td>
                  <td className="py-2 text-right">{pct(total.gained ? (totalNet ?? 0) / total.gained : null)}</td>
                  <td className="py-2 text-right" title="Average weighted by each location's review count">{fmtNum(ratingAll, 1)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-muted">{FLOW_NOTE}</p>
        {chartDays.length > 0 && Object.keys(byLoc).length > 0 && (
          <div className="mt-4">
            <ReviewFlowChart days={chartDays} byLoc={byLoc} />
          </div>
        )}
      </section>
    </div>
  );
}
