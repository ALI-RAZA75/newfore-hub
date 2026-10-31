"use client";
import { useEffect, useState } from "react";
import { MiniBars } from "./charts";

type RT = { activeUsers: number; perMinute: { minutesAgo: number; users: number }[]; pages: { name: string; users: number }[]; cities: { name: string; users: number }[] };

export default function LiveNow() {
  const [d, setD] = useState<RT | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [at, setAt] = useState<Date | null>(null);

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const r = await fetch("/api/realtime", { cache: "no-store" });
        const j = await r.json();
        if (stop) return;
        if (j.error) setErr(j.error); else { setD(j); setErr(null); }
        setAt(new Date());
      } catch { if (!stop) setErr("Couldn't reach Google Analytics."); }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { stop = true; clearInterval(t); };
  }, []);

  return (
    <section className="card flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="card-title flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60 motion-reduce:hidden" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          On the website now
        </h2>
        <span className="text-xs text-ink-muted">{at ? `Updated ${at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Loading…"}</span>
      </div>
      {err ? (
        <p className="text-sm text-ink-muted">{err}</p>
      ) : (
        <>
          <div className="flex items-end gap-4">
            <p className="font-display text-5xl font-extrabold tnum">{d ? d.activeUsers : "—"}</p>
            <p className="pb-1.5 text-sm text-ink-muted">people in the last 30 minutes</p>
          </div>
          <MiniBars values={d ? d.perMinute.map((p) => p.users) : []} color="#2E9E6B" />
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div>
              <p className="label">Top pages</p>
              {(d?.pages || []).slice(0, 4).map((p) => (
                <p key={p.name} className="flex justify-between gap-2 py-0.5"><span className="truncate">{p.name}</span><b className="tnum">{p.users}</b></p>
              ))}
              {d && !d.pages.length && <p className="text-ink-muted">Nobody right now</p>}
            </div>
            <div>
              <p className="label">Cities</p>
              {(d?.cities || []).slice(0, 4).map((p) => (
                <p key={p.name} className="flex justify-between gap-2 py-0.5"><span className="truncate">{p.name}</span><b className="tnum">{p.users}</b></p>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}
