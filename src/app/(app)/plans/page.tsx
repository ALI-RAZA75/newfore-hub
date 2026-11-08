import Link from "next/link";
import { format, parseISO } from "date-fns";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import { goalWeekly, loadWeeks } from "@/lib/metrics";
import { onTarget, weekEndOf } from "@/lib/goals";
import { doneIn, dueIn } from "@/lib/tasks";
import PlanForm from "@/components/PlanForm";
import WeekPicker from "@/components/WeekPicker";

export const dynamic = "force-dynamic";

export default async function PlansPage({ searchParams }: { searchParams: { week?: string } }) {
  const me = (await getMe())!;
  const sb = supabaseServer();
  const [{ data: plans }, { data: tasks }, { data: goals }, { data: s }, w] = await Promise.all([
    sb.from("plans").select("*").order("start_date", { ascending: false }),
    sb.from("tasks").select("plan_id,status,due_date,completed_at"),
    sb.from("goals").select("*").order("sort"),
    sb.from("settings").select("tracked_keywords").eq("id", 1).single(),
    loadWeeks(searchParams.week),
  ]);
  const keywords: string[] = s?.tracked_keywords || [];
  const today = new Date().toISOString().slice(0, 10);
  const mon = w.sel.iso, sun = weekEndOf(mon);
  const thisWeek = w.sel.label === "This week" || w.sel.label === "Last week" ? w.sel.label.toLowerCase() : `the week of ${w.sel.range}`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">Plans & goals</p>
          <h1 className="text-3xl font-extrabold">Our plans</h1>
          <p className="muted mt-1 text-sm">Each plan has weekly goals, linked to live numbers, and its own tasks. Figures below are for {thisWeek}.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <WeekPicker weeks={w.options} value={w.sel.iso} />
          {me.role === "admin" && <PlanForm />}
        </div>
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {(plans || []).map((p: any) => {
          const ts = (tasks || []).filter((t: any) => t.plan_id === p.id);
          const done = ts.filter((t: any) => t.status === "done").length;
          const late = ts.filter((t: any) => t.status !== "done" && t.due_date && t.due_date < today).length;
          const pct = ts.length ? done / ts.length : 0;
          const gs = (goals || []).filter((g: any) => g.plan_id === p.id);
          const results = gs.map((g: any) => { const r = goalWeekly(g, w, keywords, p); return onTarget(g, r.agg, r.value, r.ctx); });
          const judged = results.filter((r) => r !== null).length;
          const hit = results.filter((r) => r === true).length;
          const dueWk = ts.filter((t: any) => dueIn(t, mon, sun));
          const doneWk = ts.filter((t: any) => doneIn(t, mon, sun)).length;
          return (
            <Link key={p.id} href={`/plans/${p.id}?week=${mon}`} className="card flex flex-col gap-3 transition hover:border-brand/50">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold">{p.name}</h2>
                <span className="chip bg-paper capitalize text-ink-muted">{p.status}</span>
              </div>
              {p.description && <p className="line-clamp-2 text-sm text-ink-muted">{p.description}</p>}
              <p className="text-xs text-ink-muted">{format(parseISO(p.start_date), "MMM d, yyyy")} – {format(parseISO(p.end_date), "MMM d, yyyy")}</p>
              <div className="grid grid-cols-3 gap-2 rounded-lg bg-paper p-3 text-sm tnum">
                <div>
                  <p className="text-xs text-ink-muted">Goals on target</p>
                  <p className="font-bold">{gs.length ? (judged ? `${hit} of ${gs.length}` : "no data") : "no goals"}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted">Tasks done</p>
                  <p className="font-bold">{doneWk}</p>
                </div>
                <div>
                  <p className="text-xs text-ink-muted">Tasks due</p>
                  <p className="font-bold">{dueWk.length}{dueWk.length ? <span className="font-normal text-ink-muted"> ({dueWk.filter((t: any) => t.status === "done").length} done)</span> : null}</p>
                </div>
              </div>
              <div className="h-2 rounded-full bg-paper"><div className="h-2 rounded-full bg-brand" style={{ width: `${pct * 100}%` }} /></div>
              <p className="text-sm tnum">{done} of {ts.length} tasks done overall{late ? <span className="font-semibold text-red-600"> · {late} overdue</span> : null}</p>
            </Link>
          );
        })}
        {!plans?.length && <p className="muted">No plans yet.</p>}
      </div>
    </div>
  );
}
