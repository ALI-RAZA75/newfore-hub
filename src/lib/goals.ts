/** Weekly goal logic shared by the server pages and client components (no server-only imports). */
import { addDays, format } from "date-fns";

/** How a metric turns into one number per Monday–Sunday week. */
export type Agg = "sum" | "count" | "avg" | "snapshot";

export const AGG_TEXT: Record<Agg, string> = {
  sum: "sum per week",
  count: "count per week",
  avg: "average for the week (weighted by views)",
  snapshot: "running total (latest at the end of the week)",
};

export type Goal = {
  id: string; label: string; metric_key: string | null; baseline: number; target: number;
  lower_is_better: boolean; manual_value: number | null;
};

/** The week a goal is judged on. Dates are yyyy-MM-dd. */
export type WeekCtx = { weekStart: string; days: number; planStart?: string; planEnd?: string };

const day = (s: string) => new Date(s + "T00:00:00").getTime();
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/**
 * "sum" and "count" goals are rates: the target applies to every week (pro rata while a week is in progress).
 * "avg", "snapshot" and hand-entered goals are levels heading for the target by the plan's end date.
 */
export const isRate = (agg: Agg | null) => agg === "sum" || agg === "count";

/** Share of the way from baseline to target we should be at by the end of this week. */
export function expectedShare(agg: Agg | null, ctx: WeekCtx) {
  if (isRate(agg)) return agg === "sum" ? ctx.days / 7 : ctx.days > 0 ? 1 : 0;
  if (!ctx.planStart || !ctx.planEnd) return 1;
  const s = day(ctx.planStart), e = day(ctx.planEnd), end = addDays(new Date(day(ctx.weekStart)), 7).getTime();
  return e > s ? clamp((end - s) / (e - s)) : 1;
}

/** The value that counts as on target for this week. */
export function expectedValue(goal: Goal, agg: Agg | null, ctx: WeekCtx) {
  const base = Number(goal.baseline), tgt = Number(goal.target);
  return isRate(agg) ? tgt * expectedShare(agg, ctx) : base + (tgt - base) * expectedShare(agg, ctx);
}

export function onTarget(goal: Goal, agg: Agg | null, value: number | null, ctx: WeekCtx) {
  if (value === null || value === undefined || ctx.days === 0) return null;
  const exp = expectedValue(goal, agg, ctx);
  return goal.lower_is_better ? value <= exp : value >= exp;
}

/** The first two weeks of a plan (and any week before it starts) are too early to call someone behind. */
export function tooEarly(ctx: WeekCtx) {
  if (!ctx.planStart) return false;
  return day(ctx.weekStart) < addDays(new Date(day(ctx.planStart)), 14).getTime();
}

export function goalStatus(goal: Goal, agg: Agg | null, value: number | null, ctx: WeekCtx) {
  const base = Number(goal.baseline), tgt = Number(goal.target);
  const pace = expectedShare(agg, ctx);
  if (value === null || value === undefined || ctx.days === 0) return { pct: 0, pace, label: "Waiting for data", tone: "muted" as const };
  // Rate goals fill up from zero to the weekly target; level goals (and anything lower-is-better)
  // against the move from baseline to target
  const fromZero = isRate(agg) && !goal.lower_is_better;
  const span = fromZero ? tgt : tgt - base;
  const from = fromZero ? 0 : base;
  const pct = span === 0 ? 1 : clamp((value - from) / span);
  const reached = goal.lower_is_better ? value <= tgt : value >= tgt;
  if (reached) return { pct: 1, pace, label: "Goal reached", tone: "good" as const };
  if (onTarget(goal, agg, value, ctx)) return { pct, pace, label: "On track", tone: "good" as const };
  if (tooEarly(ctx)) return { pct, pace, label: "Too early to tell", tone: "muted" as const };
  if (pct >= pace * 0.5) return { pct, pace, label: "A bit behind", tone: "warn" as const };
  return { pct, pace, label: "Behind", tone: "bad" as const };
}

export const weekEndOf = (weekStart: string) => format(addDays(new Date(day(weekStart)), 6), "yyyy-MM-dd");
