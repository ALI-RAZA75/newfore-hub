import Link from "next/link";
import { addDays, format, formatDistanceToNow } from "date-fns";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import {
  byDim, goalWeekly, loadWeeks, METRICS, MRow, newReviews, newReviewsAll, pick, reviews28, reviews28All, reviewSnaps, rowsFor, snap, SPARK_WEEKS,
  weekLabel, window28,
} from "@/lib/metrics";
import { CHANNELS } from "@/lib/classify";
import { GOAL_SOURCE, MANUAL_SOURCE, SCORECARD } from "@/lib/scorecard";
import { weekEndOf } from "@/lib/goals";
import Kpi, { Delta, fmtNum } from "@/components/Kpi";
import LiveNow from "@/components/LiveNow";
import SyncButton from "@/components/SyncButton";
import { Flow, Lines, StackedWeeks } from "@/components/charts";
import GoalBar from "@/components/GoalBar";
import WeekPicker from "@/components/WeekPicker";
import Scorecard, { ScoreRow } from "@/components/Scorecard";

export const dynamic = "force-dynamic";

const SCORE_WEEKS = 8;

/** Sum of the numbers present; null when there are none. */
const sumOf = (xs: (number | null | undefined)[]) => {
  const ns = xs.filter((n): n is number => n !== null && n !== undefined);
  return ns.length ? ns.reduce((s, n) => s + n, 0) : null;
};

/** +/- badge for reviews gained: green up, red down. */
function NewBadge({ n }: { n: number | null }) {
  if (n === null) return <span className="text-ink-muted">—</span>;
  return (
    <span className={n > 0 ? "chip bg-emerald-50 text-emerald-700" : n < 0 ? "chip bg-red-50 text-red-700" : "chip bg-paper text-ink-muted"}>
      {n > 0 ? "+" : ""}{fmtNum(n)}
    </span>
  );
}

export default async function Performance({ searchParams }: { searchParams: { week?: string } }) {
  const me = await getMe();
  const sb = supabaseServer();
  const { data: s } = await sb.from("settings").select("*").eq("id", 1).single();
  const keywords: string[] = s?.tracked_keywords || [];

  // Selected week (default: last complete week) and the 12 weeks before it, oldest first.
  // A week still in progress is compared with the same days of the week before.
  const w = await loadWeeks(searchParams.week);
  const { options, sel, mondays, days, curWin, prevWin, cur, prev } = w;
  const weekRows = w.rows;
  const [d28, goalRows, snaps] = await Promise.all([
    rowsFor(window28(curWin)),
    sb.from("metrics_daily").select("metric,value").eq("source", GOAL_SOURCE).then((r) => r.data || []),
    reviewSnaps(),
  ]);
  const lastWeekFull = weekRows[SPARK_WEEKS - 1];
  const sparkRows = weekRows.slice(1);
  const sparkWeeks = w.isos.slice(1).map(weekLabel);

  const { data: plan } = await sb.from("plans").select("id,name,start_date,end_date").eq("status", "active").order("start_date").limit(1).maybeSingle();
  const { data: goals } = plan
    ? await sb.from("goals").select("*").eq("plan_id", plan.id).order("sort").limit(4)
    : { data: [] as any[] };

  const hasData = weekRows.some((r) => r.length > 0) || d28.length > 0;
  const v = (rows: MRow[], key: string) => METRICS[key].fn(rows, { keywords });
  const series = (key: string) => sparkRows.map((rows) => v(rows, key));
  const profileActions = (rows: MRow[]) => pick(rows, "gbp", "calls") + pick(rows, "gbp", "website_clicks") + pick(rows, "gbp", "directions");
  const has = (rows: MRow[], source: string) => rows.some((r) => r.source === source);

  // Weekly scorecard: last 8 weeks ending with the selected week
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
  };
  const manual = (rows: MRow[], key: string) => rows.find((r) => r.source === MANUAL_SOURCE && r.metric === key)?.value ?? null;
  const scoreIdx = Array.from({ length: SCORE_WEEKS }, (_, i) => SPARK_WEEKS - SCORE_WEEKS + 1 + i);
  const scoreWeeks = scoreIdx.map((i) => ({ iso: format(mondays[i], "yyyy-MM-dd"), range: `${format(mondays[i], "MMM d")} – ${format(addDays(mondays[i], 6), "MMM d")}` }));
  const scoreRows: ScoreRow[] = SCORECARD.map((m) => ({
    ...m,
    goal: goalRows.find((g: any) => g.metric === m.key)?.value ?? null,
    values: scoreIdx.map((i) => (m.manual ? manual(weekRows[i], m.key) : scoreFn[m.key](weekRows[i], weekRows[i - 1], w.isos[i]))),
  }));

  // Weekly visits by channel
  const channelWeeks = sparkRows.map((rows, i) => {
    const row: Record<string, any> = { week: sparkWeeks[i] };
    for (const c of CHANNELS) row[c] = pick(rows, "ga4", "sessions", c);
    return row;
  });
  const activeChannels = CHANNELS.filter((c) => channelWeeks.some((r) => r[c] > 0));
  const flow = CHANNELS.map((c) => ({ name: c, sessions: pick(cur, "ga4", "sessions", c), leads: pick(cur, "ga4", "leads", c) }));

  // AI platforms, this week vs the week before
  const aiNow = byDim(cur, "ga4", "ai_sessions"), aiPrev = byDim(prev, "ga4", "ai_sessions");
  const aiLeads = byDim(cur, "ga4", "ai_leads"), aiLeadsPrev = byDim(prev, "ga4", "ai_leads");
  const aiList = [...new Set([...aiNow.keys(), ...aiPrev.keys()])]
    .map((name) => ({ name, n: aiNow.get(name) || 0, p: aiPrev.get(name) || 0 }))
    .filter((a) => a.n > 0 || a.p > 0)
    .sort((a, b) => b.n - a.n || b.p - a.p);
  const aiMax = Math.max(1, ...aiList.map((a) => a.n));
  const aiWeekly = sparkRows.map((rows, i) => ({ week: sparkWeeks[i], ai: pick(rows, "ga4", "ai_sessions") }));

  // Maps by location
  const locNames = [...new Set([...cur, ...prev].filter((r) => r.source === "gbp").map((r) => r.dim))].sort();
  const siteVisits = (rows: MRow[], l: string) =>
    [...byDim(rows, "ga4", "gbp_sessions").entries()]
      .filter(([k]) => l.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(l.toLowerCase().split(" ")[0]))
      .reduce((sum, [, n]) => sum + n, 0);
  // Reviews gained over 28 days, per location, as of the end of the selected week
  const reviewsAsOf = weekEndOf(sel.iso);
  const rev28 = (() => {
    const byLoc = new Map(locNames.map((l) => [l, reviews28(snaps, l, reviewsAsOf)] as const));
    const fallbackDates = [...new Set([...byLoc.values()].filter((r) => r?.fallback && r.past !== null).map((r) => r!.pastDate))].sort();
    return {
      byLoc,
      anyFallback: fallbackDates.length > 0,
      mixedDates: fallbackDates.length > 1,
      sinceLabel: fallbackDates.length ? format(new Date(fallbackDates[0] + "T00:00:00"), "MMM d") : "",
    };
  })();
  const ratingAll = (() => {
    const both = locNames
      .map((l) => ({ n: snap(cur, "reviews_snap", l), r: snap(cur, "rating_snap", l) }))
      .filter((x): x is { n: number; r: number } => x.n !== null && x.r !== null && x.n > 0 && x.r > 0);
    const total = both.reduce((s, x) => s + x.n, 0);
    return total ? both.reduce((s, x) => s + x.r * x.n, 0) / total : null;
  })();
  const mapsCols: { label: string; fn: (rows: MRow[], l: string) => number }[] = [
    { label: "Profile views", fn: (r, l) => pick(r, "gbp", "views", l) },
    { label: "Calls", fn: (r, l) => pick(r, "gbp", "calls", l) },
    { label: "Website clicks", fn: (r, l) => pick(r, "gbp", "website_clicks", l) },
    { label: "Directions", fn: (r, l) => pick(r, "gbp", "directions", l) },
    { label: "Site visits", fn: siteVisits },
  ];

  // Search
  const searchWeekly = sparkRows.map((rows, i) => ({
    week: sparkWeeks[i], brand: pick(rows, "gsc", "clicks", "brand"), question: pick(rows, "gsc", "clicks", "question"), short: pick(rows, "gsc", "clicks", "short"),
  }));
  const kwPos = (rows: MRow[], k: string) => {
    const imp = pick(rows, "gsc", "kw_impr", k.toLowerCase());
    return imp ? pick(rows, "gsc", "kw_posw", k.toLowerCase()) / imp : null;
  };
  const kwViews = (rows: MRow[], k: string) => pick(rows, "gsc", "kw_impr", k.toLowerCase());

  const span = (w: { start: Date; end: Date }) => w.end < w.start ? "no days yet" : `${format(w.start, "MMM d")} – ${format(w.end, "MMM d")}`;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">Performance</p>
          <h1 className="text-3xl font-extrabold">{sel.label === sel.range ? `Week of ${sel.range}` : `${sel.label} at Newfore`}</h1>
          <p className="muted mt-1 text-sm">
            {span(curWin)} compared with {span(prevWin)}{days > 0 && days < 7 ? " (same days, since this week isn’t over)" : ""}.
            {" "}Search Console uses {span({ start: curWin.gStart, end: curWin.gEnd })}, 3 days earlier, because Google reports it late.
            {s?.last_sync_at && <> · Synced {formatDistanceToNow(new Date(s.last_sync_at))} ago</>}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <WeekPicker weeks={options} value={sel.iso} />
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
      {hasData && days === 0 && (
        <div className="card border-brand/40 bg-brand-soft text-sm">This week has just started, so there’s no data for it yet. Pick “Last week” to see the latest full week.</div>
      )}

      <Scorecard weeks={scoreWeeks} rows={scoreRows} isAdmin={me?.role === "admin"} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1"><LiveNow /></div>
        <section className="card flex flex-col gap-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="card-title">{plan ? plan.name : "Plan goals"}</h2>
            <Link href={plan ? `/plans/${plan.id}` : "/plans"} className="text-sm font-semibold text-brand-dark hover:underline">All goals →</Link>
          </div>
          {(goals || []).length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {(goals || []).map((g: any) => {
                const r = goalWeekly(g, w, keywords, plan ?? undefined);
                return <GoalBar key={g.id} goal={g} agg={r.agg} value={r.value} ctx={r.ctx} spark={r.spark} hits={r.hits} counted={r.counted} compact />;
              })}
            </div>
          ) : <p className="muted text-sm">No goals yet. Add them on the Plans page.</p>}
        </section>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Leads (forms, calls, emails)" cur={v(cur, "total_leads_28d")} prev={v(prev, "total_leads_28d")} spark={series("total_leads_28d")} />
        <Kpi label="Visits from AI assistants" cur={v(cur, "ai_sessions_28d")} prev={v(prev, "ai_sessions_28d")} spark={series("ai_sessions_28d")} />
        <Kpi label="Google profile actions" cur={profileActions(cur)} prev={profileActions(prev)} spark={sparkRows.map(profileActions)} color="#2E9E6B" note="calls, website, directions" />
        <Kpi label="Website visits" cur={v(cur, "sessions_28d")} prev={v(prev, "sessions_28d")} spark={series("sessions_28d")} color="#2C3338" />
        <Kpi label="Google Search clicks" cur={v(cur, "gsc_clicks_28d")} prev={v(prev, "gsc_clicks_28d")} spark={series("gsc_clicks_28d")} color="#3B6FD8" />
        <Kpi label="Avg ranking, question searches" cur={v(cur, "question_position_28d")} prev={v(prev, "question_position_28d")} spark={series("question_position_28d")} color="#3B6FD8" decimals={1} lowerIsBetter note="lower is better" />
      </section>

      <div className="grid gap-4 xl:grid-cols-5">
        <section className="card xl:col-span-3">
          <h2 className="card-title">Website visits by channel, per week</h2>
          <p className="muted mb-3 text-xs">AI assistants and Google Maps are split out from the usual GA4 channels. The last bar is the selected week.</p>
          <StackedWeeks data={channelWeeks} keys={activeChannels as unknown as string[]} />
        </section>
        <section className="card xl:col-span-2">
          <h2 className="card-title">Where visitors come from, and who becomes a lead</h2>
          <p className="muted mb-3 text-xs">Selected week ({span(curWin)}).</p>
          <Flow channels={flow} />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="card-title">AI assistants</h2>
          <p className="muted mb-4 text-xs">Visits and leads by platform, selected week vs the week before.</p>
          {aiList.length ? (
            <div className="flex flex-col gap-3">
              {aiList.map((a) => (
                <div key={a.name}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold">{a.name}</span>
                    <span className="flex items-center gap-2 tnum">
                      {fmtNum(a.n)} visits · {fmtNum(aiLeads.get(a.name) || 0)} leads
                      <span className="text-xs text-ink-muted">(week before: {fmtNum(a.p)} · {fmtNum(aiLeadsPrev.get(a.name) || 0)})</span>
                      <Delta cur={a.n} prev={a.p} />
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-paper"><div className="h-2 rounded-full bg-brand" style={{ width: `${(a.n / aiMax) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          ) : <p className="muted text-sm">No AI visits in the selected week or the week before.</p>}
          <div className="mt-5">
            <p className="label">AI visits per week</p>
            <Lines data={aiWeekly} series={[{ key: "ai", name: "AI visits", color: "#F15D26" }]} height={160} />
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Google Search</h2>
          <p className="muted mb-3 text-xs">Clicks per week by search type (weeks run 3 days earlier).</p>
          <Lines data={searchWeekly} series={[
            { key: "brand", name: "Searching “Newfore”", color: "#2C3338" },
            { key: "question", name: "Questions & long searches", color: "#F15D26" },
            { key: "short", name: "Short non-brand", color: "#3B6FD8" },
          ]} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm tnum">
              <thead><tr className="text-left text-xs text-ink-muted"><th className="py-1.5">Key search</th><th className="text-right">This week</th><th className="text-right">Week before</th><th className="text-right">28 days</th><th className="text-right">Views this week</th></tr></thead>
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
        <p className="muted mb-3 text-xs">
          Selected week from the Business Profile API, with the change vs the week before. “Site visits” are GA4 sessions tagged with each profile’s UTM link.
          “New this week” is the latest review count this week minus last week’s. “Reviews now” is the latest count by the end of the selected week,
          compared with the count 28 days before it{rev28.anyFallback ? ", or with the oldest count we have until 28 days of history exist" : ""}.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm tnum">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="py-2">Location</th>
                {mapsCols.map((c) => <th key={c.label} className="text-right">{c.label}</th>)}
                <th className="text-right">Reviews now</th>
                <th className="text-right">{rev28.anyFallback ? `Since ${rev28.sinceLabel}` : "28 days ago"}</th>
                <th className="text-right">{rev28.anyFallback ? `New since ${rev28.sinceLabel}` : "New (28 days)"}</th>
                <th className="text-right">New this week</th><th className="text-right">Rating</th>
              </tr>
            </thead>
            <tbody>
              {locNames.length ? locNames.map((l) => {
                const nr = newReviews(cur, lastWeekFull, l);
                const r = rev28.byLoc.get(l);
                const odd = r && r.fallback && rev28.mixedDates;
                return (
                  <tr key={l} className="border-t border-paper-line align-top">
                    <td className="py-2 font-semibold">{l}</td>
                    {mapsCols.map((c) => (
                      <td key={c.label} className="py-2 text-right">
                        <div>{fmtNum(c.fn(cur, l))}</div>
                        <div className="mt-0.5"><Delta cur={c.fn(cur, l)} prev={c.fn(prev, l)} /></div>
                      </td>
                    ))}
                    <td className="py-2 text-right">{fmtNum(r?.now ?? null)}</td>
                    <td className="py-2 text-right text-ink-muted">
                      {fmtNum(r?.past ?? null)}
                      {odd && <div className="text-[11px]">{format(new Date(r!.pastDate + "T00:00:00"), "MMM d")}</div>}
                    </td>
                    <td className="py-2 text-right"><NewBadge n={r?.diff ?? null} /></td>
                    <td className="py-2 text-right">{nr === null ? "—" : `${nr > 0 ? "+" : ""}${fmtNum(nr)}`}</td>
                    <td className="py-2 text-right">{fmtNum(snap(cur, "rating_snap", l), 1)}</td>
                  </tr>
                );
              }) : (
                <tr><td colSpan={mapsCols.length + 6} className="py-6 text-center text-ink-muted">No Maps data for this week. Choose your locations in Settings (needs Business Profile API access).</td></tr>
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
                  <td className="py-2 text-right">{fmtNum(sumOf(locNames.map((l) => rev28.byLoc.get(l)?.now ?? null)))}</td>
                  <td className="py-2 text-right text-ink-muted">{fmtNum(sumOf(locNames.map((l) => rev28.byLoc.get(l)?.past ?? null)))}</td>
                  <td className="py-2 text-right"><NewBadge n={sumOf(locNames.map((l) => rev28.byLoc.get(l)?.diff ?? null))} /></td>
                  <td className="py-2 text-right">{(() => { const n = sumOf(locNames.map((l) => newReviews(cur, lastWeekFull, l))); return n === null ? "—" : `${n > 0 ? "+" : ""}${fmtNum(n)}`; })()}</td>
                  <td className="py-2 text-right" title="Average weighted by each location's review count">{fmtNum(ratingAll, 1)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
