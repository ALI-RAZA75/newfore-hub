import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { current28, METRICS, weekly, weeklySeries } from "@/lib/metrics";
import GoalBar from "@/components/GoalBar";
import GoalForm from "@/components/GoalForm";
import PlanForm from "@/components/PlanForm";
import TaskBoard from "@/components/TaskBoard";
import { Spark } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function PlanPage({ params }: { params: { id: string } }) {
  const me = (await getMe())!;
  const sb = supabaseServer();
  const { data: plan } = await sb.from("plans").select("*").eq("id", params.id).maybeSingle();
  if (!plan) notFound();
  const [{ data: goals }, { data: tasks }, { data: people }, { data: plans }, { data: s }] = await Promise.all([
    sb.from("goals").select("*").eq("plan_id", plan.id).order("sort"),
    sb.from("tasks").select("*").eq("plan_id", plan.id).order("due_date"),
    sb.from("profiles").select("id,email,full_name").order("full_name"),
    sb.from("plans").select("id,name").neq("status", "archived"),
    sb.from("settings").select("tracked_keywords").eq("id", 1).single(),
  ]);
  const keywords: string[] = s?.tracked_keywords || [];
  const [now, wk] = await Promise.all([current28(keywords), weekly(14)]);
  const isAdmin = me.role === "admin";
  const metricOptions = Object.entries(METRICS).map(([k, m]) => ({ key: k, label: m.label }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">Plan</p>
          <h1 className="text-3xl font-extrabold">{plan.name}</h1>
          <p className="muted mt-1 max-w-3xl text-sm">{plan.description}</p>
          <p className="mt-1 text-xs text-ink-muted">{format(parseISO(plan.start_date), "MMM d, yyyy")} – {format(parseISO(plan.end_date), "MMM d, yyyy")}</p>
        </div>
        {isAdmin && <PlanForm plan={plan} />}
      </header>

      <section className="card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="card-title">Goals</h2>
            <p className="muted text-xs">Live figures for the last 28 days. The thin line on each bar shows where we should be by today.</p>
          </div>
          {isAdmin && <GoalForm planId={plan.id} metrics={metricOptions} />}
        </div>
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2 xl:grid-cols-3">
          {(goals || []).map((g: any) => {
            const val = g.metric_key ? now[g.metric_key] ?? null : g.manual_value;
            const trend = g.metric_key ? weeklySeries(wk, g.metric_key, keywords).map((p) => p.value) : [];
            return (
              <div key={g.id} className="flex flex-col gap-2">
                <GoalBar goal={g} value={val} start={plan.start_date} end={plan.end_date} />
                {trend.length > 1 && <Spark values={trend} color="#F15D26" height={32} />}
                <p className="text-xs text-ink-muted">{g.metric_key ? `Live: ${METRICS[g.metric_key]?.label ?? g.metric_key}` : "Updated by hand"}</p>
                {isAdmin && <GoalForm planId={plan.id} metrics={metricOptions} goal={g} />}
              </div>
            );
          })}
          {!goals?.length && <p className="muted text-sm">No goals yet.</p>}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">Tasks in this plan</h2>
        <TaskBoard tasks={(tasks || []) as any} people={(people || []) as any} plans={(plans || []) as any} meId={me.id} isAdmin={isAdmin} planId={plan.id} initialView="week" />
      </section>
    </div>
  );
}
