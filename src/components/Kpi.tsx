import clsx from "clsx";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { Spark } from "./charts";

export function fmtNum(n: number | null | undefined, decimals = 0) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en", { maximumFractionDigits: decimals, minimumFractionDigits: decimals }).format(n);
}

export function Delta({ cur, prev, lowerIsBetter = false }: { cur: number | null; prev: number | null; lowerIsBetter?: boolean }) {
  if (cur === null || prev === null) return <span className="text-xs text-ink-muted">no data last week</span>;
  if (prev === 0 && cur === 0) return <span className="chip bg-paper text-ink-muted"><Minus size={12} /> same</span>;
  const diff = cur - prev;
  const pct = prev === 0 ? null : (diff / prev) * 100;
  const good = lowerIsBetter ? diff < 0 : diff > 0;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  return (
    <span className={clsx("chip tnum", diff === 0 ? "bg-paper text-ink-muted" : good ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700")}>
      <Icon size={12} />
      {pct === null ? `+${fmtNum(diff)}` : `${diff > 0 ? "+" : ""}${fmtNum(pct)}%`}
    </span>
  );
}

export default function Kpi({
  label, cur, prev, spark, color = "#F15D26", decimals = 0, lowerIsBetter = false, note,
}: {
  label: string; cur: number | null; prev: number | null; spark: (number | null)[]; color?: string;
  decimals?: number; lowerIsBetter?: boolean; note?: string;
}) {
  return (
    <div className="card flex min-w-0 flex-col gap-2">
      <p className="text-sm font-semibold text-ink-muted">{label}</p>
      <div className="flex items-baseline justify-between gap-2">
        <p className="font-display text-3xl font-extrabold tnum">{fmtNum(cur, decimals)}</p>
        <Delta cur={cur} prev={prev} lowerIsBetter={lowerIsBetter} />
      </div>
      <p className="text-xs text-ink-muted tnum">Week before: {fmtNum(prev, decimals)}{note ? ` · ${note}` : ""}</p>
      <Spark values={spark} color={color} />
    </div>
  );
}
