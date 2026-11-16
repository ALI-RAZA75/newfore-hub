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

/**
 * The period a goal is judged on: it starts `weekStart` (yyyy-MM-dd), lasts `len` days (7 by default;
 * 28 for "Last 28 days") and has data for `days` of them so far.
 */
export type WeekCtx = { weekStart: string; days: number; len?: number; planStart?: string; planEnd?: string };

const lenOf = (ctx: WeekCtx) => ctx.len ?? 7;

/** The target for the whole period: weekly "sum" targets scale with its length (×4 for 28 days); others don't. */
export const periodTarget = (goal: Goal, agg: Agg | null, ctx: WeekCtx) =>
  agg === "sum" ? Number(goal.target) * (lenOf(ctx) / 7) : Number(goal.target);

const day = (s: string) => new Date(s + "T00:00:00").getTime();
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/**
 * "sum" and "count" goals are rates: the target applies to every week (pro rata while a week is in progress).
 * "avg", "snapshot" and hand-entered goals are levels heading for the target by the plan's end date.
 */
export const isRate = (agg: Agg | null) => agg === "sum" || agg === "count";

/**
 * Rate goals: share of the period's target due by now (days so far ÷ period length for sums).
 * Level goals: share of the way from baseline to target we should be by the end of the period.
 */
export function expectedShare(agg: Agg | null, ctx: WeekCtx) {
  if (isRate(agg)) return agg === "sum" ? ctx.days / lenOf(ctx) : ctx.days > 0 ? 1 : 0;
  if (!ctx.planStart || !ctx.planEnd) return 1;
  const s = day(ctx.planStart), e = day(ctx.planEnd), end = addDays(new Date(day(ctx.weekStart)), lenOf(ctx)).getTime();
  return e > s ? clamp((end - s) / (e - s)) : 1;
}

/** The value that counts as on target for this period. */
export function expectedValue(goal: Goal, agg: Agg | null, ctx: WeekCtx) {
  const base = Number(goal.baseline), tgt = periodTarget(goal, agg, ctx);
  return isRate(agg) ? tgt * expectedShare(agg, ctx) : base + (tgt - base) * expectedShare(agg, ctx);
}

export function onTarget(goal: Goal, agg: Agg | null, value: number | null, ctx: WeekCtx) {
  if (value === null || value === undefined || ctx.days === 0) return null;
  const exp = expectedValue(goal, agg, ctx);
  return goal.lower_is_better ? value <= exp : value >= exp;
}

/** A period ending within a plan's first two weeks (or before it starts) is too early to call anyone behind. */
export function tooEarly(ctx: WeekCtx) {
  if (!ctx.planStart) return false;
  return addDays(new Date(day(ctx.weekStart)), lenOf(ctx)).getTime() <= addDays(new Date(day(ctx.planStart)), 14).getTime();
}

export function goalStatus(goal: Goal, agg: Agg | null, value: number | null, ctx: WeekCtx) {
  const base = Number(goal.baseline), tgt = periodTarget(goal, agg, ctx);
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
