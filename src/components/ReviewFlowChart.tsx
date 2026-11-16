"use client";
import { useState } from "react";
import { format } from "date-fns";
import { Bar, BarChart, CartesianGrid, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type Day = { gained: number; removed: number };

/** Daily reviews gained (green, up) and removed (red, down), all locations or one. */
export default function ReviewFlowChart({ days, byLoc }: { days: string[]; byLoc: Record<string, Record<string, Day>> }) {
  const locs = Object.keys(byLoc).sort();
  const [loc, setLoc] = useState("all");
  const data = days.map((d) => {
    const picked = loc === "all" ? locs : [loc];
    const gained = picked.reduce((s, l) => s + (byLoc[l]?.[d]?.gained || 0), 0);
    const removed = picked.reduce((s, l) => s + (byLoc[l]?.[d]?.removed || 0), 0);
    return { day: format(new Date(d + "T00:00:00"), "MMM d"), gained, removed: -removed };
  });
  const axis = { fontSize: 12, fill: "#6A7179" };
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="label mb-0">Reviews gained and removed per day</p>
        <select className="input w-auto py-1 text-sm" value={loc} onChange={(e) => setLoc(e.target.value)} aria-label="Location">
          <option value="all">All locations</option>
          {locs.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={data} stackOffset="sign" margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#E3E7EB" />
          <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={{ stroke: "#C9D0D6" }} interval="preserveStartEnd" minTickGap={16} />
          <YAxis tick={axis} tickLine={false} axisLine={false} allowDecimals={false} tickFormatter={(n: number) => String(Math.abs(n))} />
          <ReferenceLine y={0} stroke="#C9D0D6" />
          <Tooltip
            cursor={{ fill: "rgba(44,51,56,0.05)" }}
            content={({ active, payload, label }: any) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload;
              return (
                <div className="rounded-lg border border-paper-line bg-white px-3 py-2 text-xs shadow-lg tnum">
                  <p className="mb-1 font-semibold text-ink-muted">{label}</p>
                  <p className="text-emerald-700">Gained: <b>{p.gained}</b></p>
                  <p className="text-red-700">Removed: <b>{-p.removed}</b></p>
                </div>
              );
            }}
          />
          <Bar dataKey="gained" name="Gained" stackId="r" fill="#2E9E6B" maxBarSize={28} isAnimationActive={false} />
          <Bar dataKey="removed" name="Removed" stackId="r" fill="#DC2626" maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
