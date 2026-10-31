"use client";
import {
  Bar, BarChart, CartesianGrid, Layer, Line, LineChart, Rectangle, ResponsiveContainer, Sankey, Tooltip, XAxis, YAxis,
} from "recharts";

export const CHANNEL_COLORS: Record<string, string> = {
  "AI Assistants": "#F15D26",
  "Google Maps": "#2E9E6B",
  "Organic Search": "#3B6FD8",
  "Paid Search": "#8B5CF6",
  Direct: "#2C3338",
  Referral: "#D9A21B",
  "Organic Social": "#E0559A",
  Email: "#0EA5A5",
  Other: "#A3ABB3",
};

const axis = { fontSize: 12, fill: "#6A7179" };
const fmt = (n: number) => new Intl.NumberFormat("en", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);

function TipBox({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p: any) => p.value);
  return (
    <div className="rounded-lg border border-paper-line bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-ink-muted">{label}</p>
      {rows.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 tnum">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color || p.fill }} />
          {p.name}: <b>{fmt(Number(p.value))}</b>
        </p>
      ))}
    </div>
  );
}

export function StackedWeeks({ data, keys, height = 280 }: { data: any[]; keys: string[]; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#E3E7EB" />
        <XAxis dataKey="week" tick={axis} tickLine={false} axisLine={{ stroke: "#C9D0D6" }} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={fmt} />
        <Tooltip content={<TipBox />} cursor={{ fill: "rgba(44,51,56,0.05)" }} />
        {keys.map((k, i) => (
          <Bar key={k} dataKey={k} name={k} stackId="a" fill={CHANNEL_COLORS[k] || "#A3ABB3"} maxBarSize={36}
            radius={i === keys.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function Lines({ data, series, height = 240, reversed = false }: {
  data: any[]; series: { key: string; name: string; color: string }[]; height?: number; reversed?: boolean;
}) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
        <CartesianGrid vertical={false} stroke="#E3E7EB" />
        <XAxis dataKey="week" tick={axis} tickLine={false} axisLine={{ stroke: "#C9D0D6" }} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={fmt} reversed={reversed} />
        <Tooltip content={<TipBox />} />
        {series.map((s) => (
          <Line key={s.key} type="linear" dataKey={s.key} name={s.name} stroke={s.color} strokeWidth={2}
            dot={{ r: 2.5 }} activeDot={{ r: 4 }} strokeLinecap="round" connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function Spark({ values, color = "#F15D26", height = 36 }: { values: (number | null)[]; color?: string; height?: number }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
        <Line type="linear" dataKey="v" stroke={color} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function MiniBars({ values, color = "#F15D26", height = 48 }: { values: number[]; color?: string; height?: number }) {
  const data = values.map((v, i) => ({ i, v }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <Bar dataKey="v" fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Where visitors come from and how many become leads. */
export function Flow({ channels }: { channels: { name: string; sessions: number; leads: number }[] }) {
  const ch = channels.filter((c) => c.sessions > 0).sort((a, b) => b.sessions - a.sessions);
  if (!ch.length) return <p className="muted py-10 text-center text-sm">No visits in this period yet.</p>;
  const nodes = [...ch.map((c) => ({ name: c.name })), { name: "Became a lead" }, { name: "Browsed only" }];
  const L = ch.length;
  const links = ch.flatMap((c, i) => [
    ...(c.leads > 0 ? [{ source: i, target: L, value: c.leads }] : []),
    ...(c.sessions - c.leads > 0 ? [{ source: i, target: L + 1, value: c.sessions - c.leads }] : []),
  ]);
  const color = (name: string) => (name === "Became a lead" ? "#F15D26" : name === "Browsed only" ? "#C9D0D6" : CHANNEL_COLORS[name] || "#A3ABB3");

  const Node = ({ x, y, width, height, payload }: any) => {
    return (
      <Layer>
        <Rectangle x={x} y={y} width={width} height={height} fill={color(payload.name)} radius={2} />
        <text x={x + width + 8} y={y + height / 2} textAnchor="start" dominantBaseline="middle" fontSize={12} fill="#2C3338"
          paintOrder="stroke" stroke="#FFFFFF" strokeWidth={3}>
          {payload.name} · {fmt(payload.value)}
        </text>
      </Layer>
    );
  };
  const Link = ({ sourceX, sourceY, sourceControlX, targetX, targetY, targetControlX, linkWidth, payload }: any) => (
    <path
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={payload.target.name === "Became a lead" ? "#F15D26" : color(payload.source.name)}
      strokeOpacity={payload.target.name === "Became a lead" ? 0.55 : 0.18}
      strokeWidth={Math.max(1, linkWidth)}
    />
  );
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, ch.length * 42)}>
      <Sankey data={{ nodes, links }} node={<Node />} link={<Link />} nodePadding={18} nodeWidth={10}
        margin={{ top: 8, right: 150, bottom: 8, left: 8 }} iterations={32}>
        <Tooltip content={({ active, payload }: any) => {
          if (!active || !payload?.length) return null;
          const p = payload[0].payload;
          const label = p.source && p.target ? `${p.source.name} → ${p.target.name}` : p.name;
          return <div className="rounded-lg border border-paper-line bg-white px-3 py-2 text-xs shadow-lg">{label}: <b>{fmt(p.value)}</b></div>;
        }} />
      </Sankey>
    </ResponsiveContainer>
  );
}
