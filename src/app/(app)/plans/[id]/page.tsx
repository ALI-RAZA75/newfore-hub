import { notFound } from "next/navigation";
import clsx from "clsx";
import { addDays, format, parseISO, subDays } from "date-fns";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { goalPeriod, loadPeriod, METRICS, SPARK_WEEKS } from "@/lib/metrics";
import { goalStatus, periodTarget } from "@/lib/goals";
import { doneIn, dueIn, overdueAt } from "@/lib/tasks";
import GoalBar from "@/components/GoalBar";
import GoalForm from "@/components/GoalForm";
import PlanForm from "@/components/PlanForm";
import TaskBoard from "@/components/TaskBoard";
import PeriodPicker from "@/components/PeriodPicker";
import { fmtNum } from "@/components/Kpi";
import { Lines } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params, searchParams }: { params: { id: string }; searchParams: { week?: string; period?: string } }) {
  const me = (await getMe())!;
  const sb = supabaseServer();
  const { data: plan } = await sb.from("plans").select("*").eq("id", params.id).maybeSingle();
  if (!plan) notFound();
  const [{ data: goals }, { data: tasks }, { data: people }, { data: plans }, { data: s }, per] = await Promise.all([
    sb.from("goals").select("*").eq("plan_id", plan.id).order("sort"),
    sb.from("tasks").select("*").eq("plan_id", plan.id).order("due_date"),
    sb.from("profiles").select("id,email,full_name").order("full_name"),
    sb.from("plans").select("id,name").neq("status", "archived"),
    sb.from("settings").select("tracked_keywords").eq("id", 1).single(),
    loadPeriod(searchParams),
  ]);
  const keywords: string[] = s?.tracked_keywords || [];
  const isAdmin = me.role === "admin";
  const metricOptions = Object.entries(METRICS).map(([k, m]) => ({ key: k, label: m.label, agg: m.agg }));
  const ts = (tasks || []) as any[];

  // Tasks use calendar dates: "Last 7/28 days" end today, a week runs Mon–Sun
  const { start: from, end: to } = per.tasks;
  const today = format(new Date(), "yyyy-MM-dd");
  // Overdue as of the end of the selected period (or today, if it hasn't ended)
  const asOf = to < today ? format(addDays(parseISO(to), 1), "yyyy-MM-dd") : today;
  const results = (goals || []).map((g: any) => ({ g, r: goalPeriod(g, per, keywords, plan) }));
  const dueWk = ts.filter((t) => dueIn(t, from, to));
  const doneWk = ts.filter((t) => doneIn(t, from, to));
  const overdue = ts.filter((t) => overdueAt(t, asOf));

  // 12 seven-day blocks ending with the period's last day
  const taskWeeks = per.tasks.blockEnds.slice(1).map((end) => {
    const s = format(subDays(end, 6), "yyyy-MM-dd"), e = format(end, "yyyy-MM-dd");
    return { week: format(subDays(end, 6), "MMM d"), planned: ts.filter((t) => dueIn(t, s, e)).length, done: ts.filter((t) => doneIn(t, s, e)).length };
  });
  const span = `${format(parseISO(from), "MMM d")} – ${format(parseISO(to), "MMM d")}`;
  const inPeriod = per.kind === "week" ? "this week" : per.kind === "28d" ? "in the last 28 days" : "in the last 7 days";

  const TaskList = ({ items, empty }: { items: any[]; empty: string }) =>
    items.length ? (
      <ul className="flex flex-col gap-1.5 text-sm">
        {items.slice(0, 8).map((t) => (
          <li key={t.id} className="flex justify-between gap-2">
            <span className={clsx("min-w-0 truncate", t.status === "done" && "text-ink-muted line-through")}>{t.title}</span>
            <span className="shrink-0 text-xs text-ink-muted tnum">{t.due_date ? format(parseISO(t.due_date), "MMM d") : ""}</span>
          </li>
        ))}
        {items.length > 8 && <li className="text-xs text-ink-muted">and {items.length - 8} more</li>}
      </ul>
    ) : <p className="text-sm text-ink-muted">{empty}</p>;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">Plan</p>
          <h1 className="text-3xl font-extrabold">{plan.name}</h1>
          <p className="muted mt-1 max-w-3xl text-sm">{plan.description}</p>
          <p className="mt-1 text-xs text-ink-muted">{format(parseISO(plan.start_date), "MMM d, yyyy")} – {format(parseISO(plan.end_date), "MMM d, yyyy")}</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <PeriodPicker options={per.options} value={per.value} />
          {isAdmin && <PlanForm plan={plan} />}
        </div>
      </header>

      <section className="card flex flex-col gap-4">
        <div>
          <h2 className="card-title">{per.kind === "week" ? "This week" : per.label}</h2>
          <p className="muted text-xs tnum">
            {per.kind === "week" ? per.label : `Tasks: ${span}`}{per.kind === "week" && per.days > 0 && per.days < 7 ? `, ${per.days} day${per.days === 1 ? "" : "s"} so far` : ""}.
            {per.kind !== "week" && " Goals use each source’s latest complete data."}
          </p>
        </div>
        <div className="grid gap-6 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <p className="label">Goals</p>
            {results.length ? (
              <ul className="flex flex-col gap-1.5 text-sm">
                {results.map(({ g, r }) => {
                  const st = goalStatus(g, r.agg, r.value, r.ctx);
                  return (
                    <li key={g.id} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate">{g.label}</span>
                      <span className={clsx("chip shrink-0 tnum",
                        st.tone === "good" && "bg-emerald-50 text-emerald-700",
                        st.tone === "warn" && "bg-amber-50 text-amber-700",
                        st.tone === "bad" && "bg-red-50 text-red-700",
                        st.tone === "muted" && "bg-paper text-ink-muted")} title={st.label}>
                        {fmtNum(r.value, r.agg === "avg" ? 1 : 0)} / {fmtNum(periodTarget(g, r.agg, r.ctx), r.agg === "avg" ? 1 : 0)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="text-sm text-ink-muted">No goals yet.</p>}
          </div>
          <div>
            <p className="label">Due {inPeriod} ({dueWk.length})</p>
            <TaskList items={dueWk} empty={`Nothing due ${inPeriod}.`} />
          </div>
          <div>
            <p className="label">Completed {inPeriod} ({doneWk.length})</p>
            <TaskList items={doneWk} empty="Nothing completed yet." />
          </div>
          <div>
            <p className={clsx("label", overdue.length && "text-red-600")}>Overdue ({overdue.length})</p>
            <TaskList items={overdue} empty="Nothing overdue." />
          </div>
        </div>
        <div>
          <p className="label">Tasks completed per week vs planned (due), last {SPARK_WEEKS} weeks</p>
          <Lines data={taskWeeks} height={180} series={[
            { key: "planned", name: "Planned (due that week)", color: "#A3ABB3" },
            { key: "done", name: "Completed", color: "#F15D26" },
          ]} />
        </div>
      </section>

      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="card-title">Goals</h2>
            <p className="muted text-xs">
              Weekly targets, judged on the selected period (sums count ×4 over 28 days). Sums and counts must reach the target every week;
              rankings and running totals should be on course for it by the end of the plan. The first two weeks of a plan are “too early to tell”.
            </p>
          </div>
          {isAdmin && <GoalForm planId={plan.id} metrics={metricOptions} />}
        </div>
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
          {results.map(({ g, r }) => (
            <div key={g.id} className="flex flex-col gap-2">
              <GoalBar goal={g} agg={r.agg} value={r.value} ctx={r.ctx} spark={r.spark} hits={r.hits} counted={r.counted} period={per.kind === "week" ? "this week" : `the ${per.label.toLowerCase()}`} />
              <p className="text-xs text-ink-muted">{g.metric_key ? `Live: ${METRICS[g.metric_key]?.label ?? g.metric_key}` : "Updated by hand"}</p>
              {isAdmin && <GoalForm planId={plan.id} metrics={metricOptions} goal={g} />}
            </div>
          ))}
          {!goals?.length && <p className="muted text-sm">No goals yet.</p>}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Tasks in this plan</h2>
        <TaskBoard tasks={ts as any} people={(people || []) as any} plans={(plans || []) as any} meId={me.id} isAdmin={isAdmin} planId={plan.id} initialView="week" week={per.boardWeek} />
      </section>
    </div>
  );
}
