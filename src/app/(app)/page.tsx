import Link from "next/link";
import { format, formatDistanceToNow } from "date-fns";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { byDim, current28, METRICS, MRow, pick, sumBetween, weekly, weeklySeries, weekLabel, windows } from "@/lib/metrics";
import { CHANNELS } from "@/lib/classify";
import Kpi, { fmtNum } from "@/components/Kpi";
import LiveNow from "@/components/LiveNow";
import SyncButton from "@/components/SyncButton";
import { Flow, Lines, StackedWeeks } from "@/components/charts";
import GoalBar from "@/components/GoalBar";

export const dynamic = "force-dynamic";

export default async function Performance() {
  const me = await getMe();
  const sb = supabaseServer();
  const { data: s } = await sb.from("settings").select("*").eq("id", 1).single();
  const keywords: string[] = s?.tracked_keywords || [];
  const w = windows();

  const [wk, cur, prev, gCur, gPrev, d28, g28, now28] = await Promise.all([
    weekly(12),
    sumBetween(w.cur.start, w.cur.end),
    sumBetween(w.prev.start, w.prev.end),
    sumBetween(w.gscCur.start, w.gscCur.end),
    sumBetween(w.gscPrev.start, w.gscPrev.end),
    sumBetween(w.d28.start, w.d28.end),
    sumBetween(w.gsc28.start, w.gsc28.end),
    current28(keywords),
  ]);

  const { data: plan } = await sb.from("plans").select("id,name,start_date,end_date").eq("status", "active").order("start_date").limit(1).maybeSingle();
  const { data: goals } = plan
    ? await sb.from("goals").select("*").eq("plan_id", plan.id).order("sort").limit(4)
    : { data: [] as any[] };

  const hasData = wk.length > 0;
  const series = (key: string) => weeklySeries(wk, key, keywords).map((p) => p.value);
  const v = (rows: MRow[], key: string) => METRICS[key].fn(rows, { keywords });
  const profileActions = (rows: MRow[]) => pick(rows, "gbp", "calls") + pick(rows, "gbp", "website_clicks") + pick(rows, "gbp", "directions");

  // Weekly visits by channel
  const weeks = [...new Set(wk.map((r) => r.week))].sort();
  const channelWeeks = weeks.map((wkStart) => {
    const row: Record<string, any> = { week: weekLabel(wkStart) };
    for (const c of CHANNELS) row[c] = pick(wk.filter((r) => r.week === wkStart), "ga4", "sessions", c);
    return row;
  });
  const activeChannels = CHANNELS.filter((c) => channelWeeks.some((r) => r[c] > 0));
  const flow = CHANNELS.map((c) => ({ name: c, sessions: pick(d28, "ga4", "sessions", c), leads: pick(d28, "ga4", "leads", c) }));

  // AI platforms
  const aiNow = byDim(d28, "ga4", "ai_sessions");
  const aiLeads = byDim(d28, "ga4", "ai_leads");
  const aiList = [...aiNow.entries()].filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const aiMax = Math.max(1, ...aiList.map(([, n]) => n));
  const aiWeekly = weeks.map((wkStart) => ({ week: weekLabel(wkStart), ai: pick(wk.filter((r) => r.week === wkStart), "ga4", "ai_sessions") }));

  // Maps by location
  const locNames = [...new Set(d28.filter((r) => r.source === "gbp").map((r) => r.dim))].sort();
  const mapsVisits = byDim(d28, "ga4", "gbp_sessions");

  // Search
  const searchWeekly = weeks.map((wkStart) => {
    const rows = wk.filter((r) => r.week === wkStart);
    return { week: weekLabel(wkStart), brand: pick(rows, "gsc", "clicks", "brand"), question: pick(rows, "gsc", "clicks", "question"), short: pick(rows, "gsc", "clicks", "short") };
  });
  const kwPos = (rows: MRow[], k: string) => {
    const imp = pick(rows, "gsc", "kw_impr", k.toLowerCase());
    return imp ? pick(rows, "gsc", "kw_posw", k.toLowerCase()) / imp : null;
  };
  const kwViews = (rows: MRow[], k: string) => pick(rows, "gsc", "kw_impr", k.toLowerCase());

  const range = `${format(w.cur.start, "MMM d")} – ${format(w.cur.end, "MMM d")}`;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">Performance</p>
          <h1 className="text-3xl font-extrabold">This week at Newfore</h1>
          <p className="muted mt-1 text-sm">
            Last 7 days ({range}) compared with the 7 days before. Search Console runs 2–3 days behind.
            {s?.last_sync_at && <> · Synced {formatDistanceToNow(new Date(s.last_sync_at))} ago</>}
          </p>
        </div>
        {me?.role === "admin" && <SyncButton />}
      </header>

      {!hasData && (
        <div className="card border-brand/40 bg-brand-soft">
          <p className="font-semibold">No data yet.</p>
          <p className="mt-1 text-sm">
            {me?.role === "admin" ? <>Open <Link className="underline" href="/settings">Settings</Link>, connect Google, pick the GA4 property, Search Console site and Maps locations, then run the first sync (it backfills 16 weeks).</> : "An admin needs to connect Google in Settings."}
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-1"><LiveNow /></div>
        <section className="card flex flex-col gap-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="card-title">{plan ? plan.name : "Plan goals"}</h2>
            <Link href={plan ? `/plans/${plan.id}` : "/plans"} className="text-sm font-semibold text-brand-dark hover:underline">All goals →</Link>
          </div>
          {(goals || []).length ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {(goals || []).map((g: any) => (
                <GoalBar key={g.id} goal={g} value={g.metric_key ? now28[g.metric_key] ?? null : g.manual_value} start={plan?.start_date} end={plan?.end_date} compact />
              ))}
            </div>
          ) : <p className="muted text-sm">No goals yet. Add them on the Plans page.</p>}
        </section>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Kpi label="Leads (forms, calls, emails)" cur={v(cur, "total_leads_28d")} prev={v(prev, "total_leads_28d")} spark={series("total_leads_28d")} />
        <Kpi label="Visits from AI assistants" cur={v(cur, "ai_sessions_28d")} prev={v(prev, "ai_sessions_28d")} spark={series("ai_sessions_28d")} />
        <Kpi label="Google profile actions" cur={profileActions(cur)} prev={profileActions(prev)} spark={weeks.map((wkStart) => profileActions(wk.filter((r) => r.week === wkStart)))} color="#2E9E6B" note="calls, website, directions" />
        <Kpi label="Website visits" cur={v(cur, "sessions_28d")} prev={v(prev, "sessions_28d")} spark={series("sessions_28d")} color="#2C3338" />
        <Kpi label="Google Search clicks" cur={v(gCur, "gsc_clicks_28d")} prev={v(gPrev, "gsc_clicks_28d")} spark={series("gsc_clicks_28d")} color="#3B6FD8" />
        <Kpi label="Avg ranking, question searches" cur={v(gCur, "question_position_28d")} prev={v(gPrev, "question_position_28d")} spark={series("question_position_28d")} color="#3B6FD8" decimals={1} lowerIsBetter note="lower is better" />
      </section>

      <div className="grid gap-4 xl:grid-cols-5">
        <section className="card xl:col-span-3">
          <h2 className="card-title">Website visits by channel, per week</h2>
          <p className="muted mb-3 text-xs">AI assistants and Google Maps are split out from the usual GA4 channels. The last bar is the current week so far.</p>
          <StackedWeeks data={channelWeeks} keys={activeChannels as unknown as string[]} />
        </section>
        <section className="card xl:col-span-2">
          <h2 className="card-title">Where visitors come from, and who becomes a lead</h2>
          <p className="muted mb-3 text-xs">Last 28 days.</p>
          <Flow channels={flow} />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="card-title">AI assistants</h2>
          <p className="muted mb-4 text-xs">Visits and leads by platform, last 28 days.</p>
          {aiList.length ? (
            <div className="flex flex-col gap-3">
              {aiList.map(([name, n]) => (
                <div key={name}>
                  <div className="mb-1 flex justify-between text-sm"><span className="font-semibold">{name}</span><span className="tnum">{fmtNum(n)} visits · {fmtNum(aiLeads.get(name) || 0)} leads</span></div>
                  <div className="h-2 rounded-full bg-paper"><div className="h-2 rounded-full bg-brand" style={{ width: `${(n / aiMax) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          ) : <p className="muted text-sm">No AI visits in the last 28 days.</p>}
          <div className="mt-5">
            <p className="label">AI visits per week</p>
            <Lines data={aiWeekly} series={[{ key: "ai", name: "AI visits", color: "#F15D26" }]} height={160} />
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Google Search</h2>
          <p className="muted mb-3 text-xs">Clicks per week by search type.</p>
          <Lines data={searchWeekly} series={[
            { key: "brand", name: "Searching “Newfore”", color: "#2C3338" },
            { key: "question", name: "Questions & long searches", color: "#F15D26" },
            { key: "short", name: "Short non-brand", color: "#3B6FD8" },
          ]} />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm tnum">
              <thead><tr className="text-left text-xs text-ink-muted"><th className="py-1.5">Key search</th><th className="text-right">This week</th><th className="text-right">Week before</th><th className="text-right">28 days</th><th className="text-right">Views (28d)</th></tr></thead>
              <tbody>
                {keywords.map((k) => {
                  const a = kwPos(gCur, k), b = kwPos(gPrev, k), m = kwPos(g28, k), n = kwViews(g28, k);
                  return (
                    <tr key={k} className="border-t border-paper-line">
                      <td className="py-1.5">{k}</td>
                      <td className="text-right font-semibold">{a ? fmtNum(a, 1) : <span className="font-normal text-ink-muted">no views</span>}{a && a <= 5 ? " ✓" : ""}</td>
                      <td className="text-right text-ink-muted">{b ? fmtNum(b, 1) : "—"}</td>
                      <td className="text-right">{m ? fmtNum(m, 1) : "—"}</td>
                      <td className="text-right text-ink-muted">{n ? fmtNum(n) : n === 0 ? "0" : "—"}</td>
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
        <p className="muted mb-3 text-xs">Last 28 days from the Business Profile API. “Site visits” are GA4 sessions tagged with each profile’s UTM link.</p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm tnum">
            <thead>
              <tr className="text-left text-xs text-ink-muted">
                <th className="py-2">Location</th><th className="text-right">Profile views</th><th className="text-right">Calls</th>
                <th className="text-right">Website clicks</th><th className="text-right">Directions</th><th className="text-right">Site visits</th>
                <th className="text-right">Reviews</th><th className="text-right">Rating</th>
              </tr>
            </thead>
            <tbody>
              {locNames.length ? locNames.map((l) => (
                <tr key={l} className="border-t border-paper-line">
                  <td className="py-2 font-semibold">{l}</td>
                  <td className="text-right">{fmtNum(pick(d28, "gbp", "views", l))}</td>
                  <td className="text-right">{fmtNum(pick(d28, "gbp", "calls", l))}</td>
                  <td className="text-right">{fmtNum(pick(d28, "gbp", "website_clicks", l))}</td>
                  <td className="text-right">{fmtNum(pick(d28, "gbp", "directions", l))}</td>
                  <td className="text-right">{fmtNum([...mapsVisits.entries()].filter(([k]) => l.toLowerCase().includes(k.toLowerCase()) || k.toLowerCase().includes(l.toLowerCase().split(" ")[0])).reduce((s, [, n]) => s + n, 0))}</td>
                  <td className="text-right">{fmtNum(pick(d28, "gbp", "reviews_snap", l) || null)}</td>
                  <td className="text-right">{fmtNum(pick(d28, "gbp", "rating_snap", l) || null, 1)}</td>
                </tr>
              )) : (
                <tr><td colSpan={8} className="py-6 text-center text-ink-muted">No Maps data yet. Choose your locations in Settings (needs Business Profile API access).</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
