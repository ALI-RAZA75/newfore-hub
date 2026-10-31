import clsx from "clsx";
import { fmtNum } from "./Kpi";

export type Goal = {
  id: string; label: string; metric_key: string | null; baseline: number; target: number;
  target_high: number | null; lower_is_better: boolean; manual_value: number | null;
};

export function goalState(goal: Goal, value: number | null, start?: string, end?: string) {
  const base = Number(goal.baseline), tgt = Number(goal.target);
  if (value === null || value === undefined) return { pct: 0, pace: 0, label: "Waiting for data", tone: "muted" as const };
  const span = tgt - base;
  const pct = span === 0 ? 1 : Math.max(0, Math.min(1, (value - base) / span));
  const s = start ? new Date(start).getTime() : Date.now();
  const e = end ? new Date(end).getTime() : Date.now();
  const pace = e > s ? Math.max(0, Math.min(1, (Date.now() - s) / (e - s))) : 1;
  const reached = goal.lower_is_better ? value <= tgt : value >= tgt;
  if (reached) return { pct: 1, pace, label: "Goal reached", tone: "good" as const };
  if (pct >= pace * 0.8 || pace < 0.05) return { pct, pace, label: "On track", tone: "good" as const };
  if (pct >= pace * 0.5) return { pct, pace, label: "A bit behind", tone: "warn" as const };
  return { pct, pace, label: "Behind", tone: "bad" as const };
}

export default function GoalBar({ goal, value, start, end, compact = false }: {
  goal: Goal; value: number | null; start?: string; end?: string; compact?: boolean;
}) {
  const st = goalState(goal, value, start, end);
  const dec = goal.metric_key === "question_position_28d" ? 1 : 0;
  const target = goal.target_high != null
    ? `${fmtNum(goal.lower_is_better ? goal.target_high : goal.target)}–${fmtNum(goal.lower_is_better ? goal.target : goal.target_high)}`
    : fmtNum(goal.target);
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
        <span className="text-xs text-ink-muted">start {fmtNum(goal.baseline, dec)} · goal {target}{goal.lower_is_better ? " (lower is better)" : ""}</span>
      </div>
      <div className="relative h-2 rounded-full bg-paper">
        <div className={clsx("h-2 rounded-full", st.tone === "bad" ? "bg-red-500" : st.tone === "warn" ? "bg-amber-500" : "bg-brand")} style={{ width: `${st.pct * 100}%` }} />
        <div className="absolute -top-1 h-4 w-0.5 rounded bg-ink/40" style={{ left: `calc(${st.pace * 100}% - 1px)` }} title="Where we should be by now" />
      </div>
    </div>
  );
}
