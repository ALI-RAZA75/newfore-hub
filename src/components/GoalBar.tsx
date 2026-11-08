import clsx from "clsx";
import { fmtNum } from "./Kpi";
import { Spark } from "./charts";
import { Agg, AGG_TEXT, Goal, goalStatus, isRate, WeekCtx } from "@/lib/goals";

export type { Goal } from "@/lib/goals";

/** One goal judged on the selected week: value, progress to the weekly target, 12-week trend. */
export default function GoalBar({ goal, agg, value, ctx, spark = [], hits, counted, compact = false }: {
  goal: Goal; agg: Agg | null; value: number | null; ctx: WeekCtx;
  spark?: (number | null)[]; hits?: number; counted?: number; compact?: boolean;
}) {
  const st = goalStatus(goal, agg, value, ctx);
  const dec = agg === "avg" ? 1 : 0;
  const kind = agg ? AGG_TEXT[agg] : "entered by hand";
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-start justify-between gap-2">
        <p className={clsx("font-semibold", compact ? "text-sm" : "text-[15px]")}>{goal.label}</p>
        <span className={clsx("chip shrink-0",
          st.tone === "good" && "bg-emerald-50 text-emerald-700",
          st.tone === "warn" && "bg-amber-50 text-amber-700",
          st.tone === "bad" && "bg-red-50 text-red-700",
          st.tone === "muted" && "bg-paper text-ink-muted")}>{st.label}</span>
      </div>
      <div className="flex items-baseline gap-2 tnum">
        <span className={clsx("font-display font-extrabold", compact ? "text-2xl" : "text-3xl")}>{fmtNum(value, dec)}</span>
        <span className="text-xs text-ink-muted">
          {isRate(agg) ? "this week" : "end of week"} · Weekly target: {fmtNum(goal.target, dec)}{goal.lower_is_better ? " (lower is better)" : ""}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-paper">
        <div className={clsx("h-2 rounded-full", st.tone === "bad" ? "bg-red-500" : st.tone === "warn" ? "bg-amber-500" : "bg-brand")} style={{ width: `${st.pct * 100}%` }} />
        {st.pace > 0 && st.pace < 1 && (
          <div className="absolute -top-1 h-4 w-0.5 rounded bg-ink/40" style={{ left: `calc(${st.pace * 100}% - 1px)` }}
            title={isRate(agg) ? "Where we should be by now this week" : "Where we should be by the end of this week"} />
        )}
      </div>
      {spark.length > 1 && (
        <div title="Last 12 weeks; the dashed line is the weekly target">
          <Spark values={spark} target={Number(goal.target)} height={compact ? 28 : 32} />
        </div>
      )}
      <p className="text-xs text-ink-muted tnum">
        {counted ? <>Hit target {hits} of the last {counted} week{counted === 1 ? "" : "s"} · </> : null}
        Start: {fmtNum(goal.baseline, dec)} · {kind}
      </p>
    </div>
  );
}
