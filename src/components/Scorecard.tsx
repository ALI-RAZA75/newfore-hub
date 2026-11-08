"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { Download } from "lucide-react";
import { saveScoreGoal, saveScoreValue } from "@/app/actions";
import { fmtNum } from "./Kpi";

export type ScoreRow = {
  key: string; label: string; lowerIsBetter?: boolean; decimals?: number; manual?: boolean;
  goal: number | null; values: (number | null)[];
};

const hit = (r: ScoreRow, v: number | null) =>
  r.goal === null || v === null ? null : r.lowerIsBetter ? v <= r.goal : v >= r.goal;

const tone = (ok: boolean | null) =>
  ok === null ? "" : ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700";

const round = (v: number | null, decimals = 0) => (v === null ? "" : String(Number(v.toFixed(decimals))));

export default function Scorecard({ weeks, rows, isAdmin }: {
  weeks: { iso: string; range: string }[]; rows: ScoreRow[]; isAdmin: boolean;
}) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);

  const save = async (p: Promise<{ ok: true } | { ok: false; error: string }>) => {
    const r = await p;
    if (r.ok) { setErr(null); router.refresh(); } else setErr(r.error);
  };

  const exportCsv = () => {
    const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const lines = [
      ["Measurable", "Weekly goal", ...weeks.map((w) => w.range)].map(q).join(","),
      ...rows.map((r) => [
        q(r.label),
        r.goal === null ? "" : `${r.lowerIsBetter ? "<=" : ">="} ${round(r.goal, r.decimals)}`,
        ...r.values.map((v) => round(v, r.decimals)),
      ].join(",")),
    ];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `newfore-scorecard-${weeks[weeks.length - 1]?.iso || "weeks"}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <section className="card">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="card-title">Weekly scorecard (EOS)</h2>
          <p className="muted text-xs">
            Monday–Sunday weeks, newest on the right. Green meets the weekly goal, red misses it. Search Console weeks run 3 days earlier.
            {isAdmin ? " Click a goal to change it." : ""}
          </p>
        </div>
        <button className="btn-ghost" onClick={exportCsv}><Download size={15} /> Export CSV</button>
      </div>
      {err && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm tnum">
          <thead>
            <tr className="text-left text-xs text-ink-muted">
              <th className="py-2 pr-3">Measurable</th>
              <th className="pr-3 text-right">Goal</th>
              {weeks.map((w) => <th key={w.iso} className="px-1 text-right" title={w.range}>{w.range.split(" – ")[0]}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-paper-line">
                <td className="py-1.5 pr-3 font-semibold">
                  {r.label}
                  {r.manual && <span className="ml-1 text-xs font-normal text-ink-muted">(entered by hand)</span>}
                </td>
                <td className="pr-3 text-right text-ink-muted">
                  {isAdmin ? (
                    <span className="inline-flex items-center gap-1">
                      {r.lowerIsBetter ? "≤" : "≥"}
                      <input key={`${r.key}-${r.goal}`} type="number" step="any" aria-label={`Weekly goal: ${r.label}`}
                        className="w-16 rounded border border-paper-line px-1 py-0.5 text-right" placeholder="set"
                        defaultValue={r.goal ?? ""}
                        onBlur={(e) => { if (e.target.value !== String(r.goal ?? "")) save(saveScoreGoal(r.key, e.target.value)); }} />
                    </span>
                  ) : r.goal === null ? "—" : `${r.lowerIsBetter ? "≤" : "≥"} ${fmtNum(r.goal, r.decimals)}`}
                </td>
                {r.values.map((v, i) => (
                  <td key={weeks[i].iso} className={clsx("px-1 py-1 text-right", tone(hit(r, v)))}>
                    {r.manual ? (
                      <input key={`${r.key}-${weeks[i].iso}-${v}`} type="number" step="any" aria-label={`${r.label}, week of ${weeks[i].range}`}
                        className="w-14 rounded border border-paper-line bg-white/70 px-1 py-0.5 text-right" placeholder="—"
                        defaultValue={v ?? ""}
                        onBlur={(e) => { if (e.target.value !== String(v ?? "")) save(saveScoreValue(weeks[i].iso, r.key, e.target.value)); }} />
                    ) : fmtNum(v, r.decimals)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
