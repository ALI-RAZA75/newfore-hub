import Link from "next/link";
import { format, parseISO } from "date-fns";
import { getMe, supabaseServer } from "@/lib/supabase-server";
import PlanForm from "@/components/PlanForm";

export const dynamic = "force-dynamic";

export default async function PlansPage() {
  const me = (await getMe())!;
  const sb = supabaseServer();
  const [{ data: plans }, { data: tasks }] = await Promise.all([
    sb.from("plans").select("*").order("start_date", { ascending: false }),
    sb.from("tasks").select("plan_id,status,due_date"),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">Plans & goals</p>
          <h1 className="text-3xl font-extrabold">Our plans</h1>
          <p className="muted mt-1 text-sm">Each plan has its own goals, linked to live numbers, and its own tasks.</p>
        </div>
        {me.role === "admin" && <PlanForm />}
      </header>
      <div className="grid gap-4 md:grid-cols-2">
        {(plans || []).map((p: any) => {
          const ts = (tasks || []).filter((t: any) => t.plan_id === p.id);
          const done = ts.filter((t: any) => t.status === "done").length;
          const late = ts.filter((t: any) => t.status !== "done" && t.due_date && t.due_date < today).length;
          const pct = ts.length ? done / ts.length : 0;
          return (
            <Link key={p.id} href={`/plans/${p.id}`} className="card flex flex-col gap-3 transition hover:border-brand/50">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold">{p.name}</h2>
                <span className="chip bg-paper capitalize text-ink-muted">{p.status}</span>
              </div>
              {p.description && <p className="line-clamp-2 text-sm text-ink-muted">{p.description}</p>}
              <p className="text-xs text-ink-muted">{format(parseISO(p.start_date), "MMM d, yyyy")} – {format(parseISO(p.end_date), "MMM d, yyyy")}</p>
              <div className="h-2 rounded-full bg-paper"><div className="h-2 rounded-full bg-brand" style={{ width: `${pct * 100}%` }} /></div>
              <p className="text-sm tnum">{done} of {ts.length} tasks done{late ? <span className="font-semibold text-red-600"> · {late} overdue</span> : null}</p>
            </Link>
          );
        })}
        {!plans?.length && <p className="muted">No plans yet.</p>}
      </div>
    </div>
  );
}
