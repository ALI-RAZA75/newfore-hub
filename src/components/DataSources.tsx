"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { saveSettings } from "@/app/actions";

type Opt<T> = { ok: true; data: T } | { ok: false; error: string };
type Loc = { name: string; account: string; title: string; address?: string };

export default function DataSources({ settings, connected }: { settings: any; connected: boolean }) {
  const [opts, setOpts] = useState<{ ga4: Opt<{ id: string; name: string }[]>; gsc: Opt<string[]>; gbp: Opt<Loc[]> } | null>(null);
  const [locs, setLocs] = useState<Loc[]>(settings.gbp_locations || []);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (connected) fetch("/api/google/options").then((r) => r.json()).then(setOpts).catch(() => setMsg("Couldn't load your Google accounts."));
  }, [connected]);

  const toggle = (l: Loc) =>
    setLocs((xs) => (xs.some((x) => x.name === l.name) ? xs.filter((x) => x.name !== l.name) : [...xs, { name: l.name, account: l.account, title: l.title }]));

  return (
    <form className="flex flex-col gap-5" onSubmit={async (e) => {
      e.preventDefault();
      const fd = new FormData(e.currentTarget);
      fd.set("gbp_locations", JSON.stringify(locs));
      const r = await saveSettings(fd);
      setMsg(r.ok ? "Saved. Run a sync to pull the data." : r.error);
      router.refresh();
    }}>
      <div>
        <label className="label" htmlFor="ga4">Google Analytics 4 property</label>
        {opts?.ga4.ok ? (
          <select id="ga4" name="ga4_property_id" className="input" defaultValue={settings.ga4_property_id || ""}>
            <option value="">Choose a property</option>
            {opts.ga4.data.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.id}</option>)}
          </select>
        ) : (
          <input id="ga4" name="ga4_property_id" className="input" placeholder="e.g. 540352974" defaultValue={settings.ga4_property_id || ""} />
        )}
        {opts && !opts.ga4.ok && <p className="mt-1 text-xs text-red-600">{"error" in opts.ga4 ? opts.ga4.error : ""}</p>}
        <p className="mt-1 text-xs text-ink-muted">Use the property Seif confirms as official (for example “Newfore Clean Data”).</p>
      </div>

      <div>
        <label className="label" htmlFor="gsc">Search Console site</label>
        {opts?.gsc.ok ? (
          <select id="gsc" name="gsc_site_url" className="input" defaultValue={settings.gsc_site_url || ""}>
            <option value="">Choose a site</option>
            {opts.gsc.data.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <input id="gsc" name="gsc_site_url" className="input" placeholder="sc-domain:newfore.com" defaultValue={settings.gsc_site_url || ""} />
        )}
        {opts && !opts.gsc.ok && <p className="mt-1 text-xs text-red-600">{"error" in opts.gsc ? opts.gsc.error : ""}</p>}
      </div>

      <div>
        <p className="label">Google Business Profile locations</p>
        {opts?.gbp.ok ? (
          <div className="flex flex-col gap-2">
            {opts.gbp.data.map((l) => (
              <label key={l.name} className="flex items-start gap-2 rounded-lg border border-paper-line p-3 text-sm">
                <input type="checkbox" className="mt-1" checked={locs.some((x) => x.name === l.name)} onChange={() => toggle(l)} />
                <span><b>{l.title}</b><br /><span className="text-ink-muted">{l.address}</span></span>
              </label>
            ))}
            {!opts.gbp.data.length && <p className="text-sm text-ink-muted">No locations found on this Google account.</p>}
          </div>
        ) : (
          <p className="rounded-lg bg-paper p-3 text-sm text-ink-muted">
            {opts ? <>Business Profile isn’t available yet: <span className="text-red-600">{"error" in opts.gbp ? opts.gbp.error : ""}</span>. This usually means Google hasn’t approved API access for your Cloud project yet (see the setup guide).</> : connected ? "Loading locations…" : "Connect Google first."}
            {locs.length > 0 && <><br />Saved: {locs.map((l) => l.title).join(", ")}</>}
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="label" htmlFor="kw">Key searches to track (one per line)</label>
          <p className="mb-1 text-xs text-ink-muted">The first 4 are the goal searches for Seif’s “top 5” goal. Close variants count too (plurals, “near me”, “ontario”).</p>
          <textarea id="kw" name="tracked_keywords" rows={4} className="input" defaultValue={(settings.tracked_keywords || []).join("\n")} />
        </div>
        <div>
          <label className="label" htmlFor="brand">Brand words (one per line)</label>
          <textarea id="brand" name="brand_terms" rows={4} className="input" defaultValue={(settings.brand_terms || []).join("\n")} />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary">Save data sources</button>
        {msg && <p className="text-sm text-ink-muted">{msg}</p>}
      </div>
    </form>
  );
}
