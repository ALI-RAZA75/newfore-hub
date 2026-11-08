import "server-only";
import { format, subDays } from "date-fns";
import { gfetch } from "./google";
import { supabaseAdmin } from "./supabase-server";
import { aiPlatform, BOT_CITIES, channelOf, gbpLocationOf, matchesKeyword, queryClass } from "./classify";

type Row = { date: string; source: string; metric: string; dim: string; value: number };

class Acc {
  map = new Map<string, Row>();
  add(date: string, source: string, metric: string, dim: string, value: number) {
    const k = `${date}|${source}|${metric}|${dim}`;
    const r = this.map.get(k);
    if (r) r.value += value;
    else this.map.set(k, { date, source, metric, dim, value });
  }
  set(date: string, source: string, metric: string, dim: string, value: number) {
    this.map.set(`${date}|${source}|${metric}|${dim}`, { date, source, metric, dim, value });
  }
  rows() { return [...this.map.values()]; }
}

const ymd = (d: Date) => format(d, "yyyy-MM-dd");
const ga4Date = (s: string) => `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;

async function save(rows: Row[]) {
  const db = supabaseAdmin();
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("metrics_daily").upsert(rows.slice(i, i + 500), { onConflict: "date,source,metric,dim" });
    if (error) throw new Error(`Saving metrics failed: ${error.message}`);
  }
}

// ---------- GA4 ----------
export async function syncGa4(propertyId: string, start: Date, end: Date) {
  const acc = new Acc();
  let offset = 0;
  const limit = 50000;
  for (;;) {
    const j: any = await gfetch(`https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`, {
      method: "POST",
      body: JSON.stringify({
        dateRanges: [{ startDate: ymd(start), endDate: ymd(end) }],
        dimensions: [
          { name: "date" }, { name: "sessionSource" }, { name: "sessionCampaignName" },
          { name: "sessionDefaultChannelGroup" }, { name: "city" },
        ],
        metrics: [{ name: "sessions" }, { name: "keyEvents" }],
        limit, offset,
      }),
    });
    for (const r of j.rows || []) {
      const [date, source, campaign, group, city] = r.dimensionValues.map((d: any) => d.value as string);
      if (BOT_CITIES.includes(city)) continue;
      const sessions = Number(r.metricValues[0].value) || 0;
      const leads = Number(r.metricValues[1].value) || 0;
      const d = ga4Date(date);
      const ch = channelOf(source, campaign, group);
      acc.add(d, "ga4", "sessions", ch, sessions);
      acc.add(d, "ga4", "leads", ch, leads);
      const ai = aiPlatform(source);
      if (ai) {
        acc.add(d, "ga4", "ai_sessions", ai, sessions);
        acc.add(d, "ga4", "ai_leads", ai, leads);
      }
      if (ch === "Google Maps") {
        acc.add(d, "ga4", "gbp_sessions", gbpLocationOf(campaign), sessions);
        acc.add(d, "ga4", "gbp_leads", gbpLocationOf(campaign), leads);
      }
    }
    const total = Number(j.rowCount || 0);
    offset += limit;
    if (offset >= total) break;
  }
  const rows = acc.rows();
  await save(rows);
  return rows.length;
}

export async function ga4Realtime(propertyId: string) {
  const base = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runRealtimeReport`;
  const [byMin, byPage, byCity] = await Promise.all([
    gfetch<any>(base, { method: "POST", body: JSON.stringify({ dimensions: [{ name: "minutesAgo" }], metrics: [{ name: "activeUsers" }] }) }),
    gfetch<any>(base, { method: "POST", body: JSON.stringify({ dimensions: [{ name: "unifiedScreenName" }], metrics: [{ name: "activeUsers" }], limit: 5 }) }),
    gfetch<any>(base, { method: "POST", body: JSON.stringify({ dimensions: [{ name: "city" }], metrics: [{ name: "activeUsers" }], limit: 5 }) }),
  ]);
  const perMinute = Array.from({ length: 30 }, (_, i) => ({ minutesAgo: 29 - i, users: 0 }));
  for (const r of byMin.rows || []) {
    const m = Number(r.dimensionValues[0].value);
    const slot = perMinute.find((p) => p.minutesAgo === m);
    if (slot) slot.users = Number(r.metricValues[0].value);
  }
  const pick = (j: any) => (j.rows || []).map((r: any) => ({ name: r.dimensionValues[0].value as string, users: Number(r.metricValues[0].value) }));
  return {
    activeUsers: perMinute.reduce((s, p) => s + p.users, 0),
    perMinute,
    pages: pick(byPage),
    cities: pick(byCity).filter((c: { name: string }) => !BOT_CITIES.includes(c.name)),
  };
}

// ---------- Search Console ----------
export async function syncGsc(site: string, start: Date, end: Date, brandTerms: string[], keywords: string[]) {
  const acc = new Acc();
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`;
  const kw = keywords.map((k) => k.toLowerCase().trim()).filter(Boolean);

  // Totals per day (includes anonymised queries)
  const totals: any = await gfetch(url, {
    method: "POST",
    body: JSON.stringify({ startDate: ymd(start), endDate: ymd(end), dimensions: ["date"], rowLimit: 1000 }),
  });
  for (const r of totals.rows || []) {
    const d = r.keys[0];
    acc.set(d, "gsc", "clicks", "all", r.clicks);
    acc.set(d, "gsc", "impressions", "all", r.impressions);
    acc.set(d, "gsc", "posw", "all", r.position * r.impressions);
  }

  // Per query
  let startRow = 0;
  for (;;) {
    const j: any = await gfetch(url, {
      method: "POST",
      body: JSON.stringify({ startDate: ymd(start), endDate: ymd(end), dimensions: ["date", "query"], rowLimit: 25000, startRow }),
    });
    const rows = j.rows || [];
    for (const r of rows) {
      const [d, q] = r.keys as [string, string];
      const cls = queryClass(q, brandTerms);
      acc.add(d, "gsc", "clicks", cls, r.clicks);
      acc.add(d, "gsc", "impressions", cls, r.impressions);
      acc.add(d, "gsc", "posw", cls, r.position * r.impressions);
      for (const k of kw) {
        if (!matchesKeyword(q, k)) continue;
        acc.add(d, "gsc", "kw_clicks", k, r.clicks);
        acc.add(d, "gsc", "kw_impr", k, r.impressions);
        acc.add(d, "gsc", "kw_posw", k, r.position * r.impressions);
      }
    }
    if (rows.length < 25000) break;
    startRow += 25000;
  }
  const rows = acc.rows();
  await save(rows);
  return rows.length;
}

// ---------- Business Profile ----------
type Loc = { name: string; account: string; title: string; address?: string; placeId?: string };

/** One row per profile: name it by city (several profiles can share the same title). */
const locLabel = (l: Loc) => {
  const city = gbpLocationOf(l.address || "");
  return city !== "Untagged" ? city : l.title;
};

export let gbpWarning = "";

/** Fallback until the My Business v4 reviews API is approved: Places API (New), keyed by API key. */
async function placesReviews(placeId: string) {
  const key = process.env.GOOGLE_PLACES_KEY!;
  const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": "rating,userRatingCount" },
    cache: "no-store",
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) {
    // Never let the key end up in the sync status
    throw new Error(`${r.status}: ${String(j.error?.message || r.statusText).split(key).join("***").slice(0, 120)}`);
  }
  return { count: Number(j.userRatingCount || 0), rating: Number(j.rating || 0) };
}

const PERF = {
  CALL_CLICKS: "calls",
  WEBSITE_CLICKS: "website_clicks",
  BUSINESS_DIRECTION_REQUESTS: "directions",
  BUSINESS_IMPRESSIONS_DESKTOP_MAPS: "views",
  BUSINESS_IMPRESSIONS_MOBILE_MAPS: "views",
  BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: "views",
  BUSINESS_IMPRESSIONS_MOBILE_SEARCH: "views",
  BUSINESS_CONVERSATIONS: "messages",
} as const;

export async function syncGbp(locations: Loc[], start: Date, end: Date) {
  const acc = new Acc();
  const snapDate = ymd(end); // inside the dashboard's "last 28 days" window
  gbpWarning = "";
  let placeIdsFound = false;
  const placesOk: string[] = [];
  const placesFailed: string[] = [];
  let v4Error = "";
  for (const loc of locations) {
    if (!loc.address) {
      // Locations saved before addresses were stored: look the address up once
      try {
        const info: any = await gfetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${loc.name}?readMask=storefrontAddress`);
        const ad = info.storefrontAddress;
        loc.address = ad ? [...(ad.addressLines || []), ad.locality].filter(Boolean).join(", ") : "";
      } catch { /* fall back to the profile title */ }
    }
    if (!loc.placeId) {
      // Needed for the Places API reviews fallback; saved to settings below so it's looked up once
      try {
        const info: any = await gfetch(`https://mybusinessbusinessinformation.googleapis.com/v1/${loc.name}?readMask=metadata`);
        if (info.metadata?.placeId) { loc.placeId = info.metadata.placeId; placeIdsFound = true; }
      } catch { /* retried on the next sync */ }
    }
    const label = locLabel(loc);
    const p = new URLSearchParams();
    Object.keys(PERF).forEach((m) => p.append("dailyMetrics", m));
    p.set("dailyRange.startDate.year", String(start.getFullYear()));
    p.set("dailyRange.startDate.month", String(start.getMonth() + 1));
    p.set("dailyRange.startDate.day", String(start.getDate()));
    p.set("dailyRange.endDate.year", String(end.getFullYear()));
    p.set("dailyRange.endDate.month", String(end.getMonth() + 1));
    p.set("dailyRange.endDate.day", String(end.getDate()));
    const j: any = await gfetch(
      `https://businessprofileperformance.googleapis.com/v1/${loc.name}:fetchMultiDailyMetricsTimeSeries?${p}`
    );
    for (const series of j.multiDailyMetricTimeSeries || []) {
      for (const s of series.dailyMetricTimeSeries || []) {
        const metric = PERF[s.dailyMetric as keyof typeof PERF];
        if (!metric) continue;
        for (const dv of s.timeSeries?.datedValues || []) {
          const { year, month, day } = dv.date;
          const d = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          acc.add(d, "gbp", metric, label, Number(dv.value || 0));
        }
      }
    }
    // Reviews (count and rating) as a snapshot on the last synced day
    try {
      const id = loc.name.split("/")[1];
      const rv: any = await gfetch(`https://mybusiness.googleapis.com/v4/${loc.account}/locations/${id}/reviews?pageSize=1`);
      acc.set(snapDate, "gbp", "reviews_snap", label, Number(rv.totalReviewCount || 0));
      acc.set(snapDate, "gbp", "rating_snap", label, Number(rv.averageRating || 0));
    } catch (e: any) {
      v4Error = String(e.message).slice(0, 120);
      if (process.env.GOOGLE_PLACES_KEY) {
        try {
          if (!loc.placeId) throw new Error("no Place ID");
          const pr = await placesReviews(loc.placeId);
          acc.set(snapDate, "gbp", "reviews_snap", label, pr.count);
          acc.set(snapDate, "gbp", "rating_snap", label, pr.rating);
          placesOk.push(label);
        } catch (pe: any) {
          placesFailed.push(`${label} (${pe.message})`);
        }
      }
    }
  }
  if (placesFailed.length) gbpWarning = `Places API reviews failed for ${placesFailed.join(", ")}`;
  else if (placesOk.length) gbpWarning = "reviews from Places API";
  else if (v4Error) gbpWarning = `reviews not available (${v4Error})`;

  if (placeIdsFound) {
    const { error } = await supabaseAdmin().from("settings").update({ gbp_locations: locations }).eq("id", 1);
    if (error) gbpWarning += `${gbpWarning ? " · " : ""}couldn't save Place IDs (${error.message})`;
  }
  // Replace this date range so rows saved under old profile names disappear.
  // Review snapshots are only written for one day per sync, so keep earlier ones for current
  // profiles: "new reviews this week" compares them week to week.
  const db = supabaseAdmin();
  const SNAPS = "(reviews_snap,rating_snap)";
  const labels = `(${locations.map((l) => `"${locLabel(l).replace(/"/g, "")}"`).join(",")})`;
  const del1 = await db.from("metrics_daily").delete()
    .eq("source", "gbp").gte("date", ymd(start)).lte("date", ymd(end)).not("metric", "in", SNAPS);
  const del2 = await db.from("metrics_daily").delete()
    .eq("source", "gbp").gte("date", ymd(start)).lte("date", ymd(end)).in("metric", ["reviews_snap", "rating_snap"]).not("dim", "in", labels);
  const error = del1.error || del2.error;
  if (error) throw new Error(`Clearing old profile rows failed: ${error.message}`);
  const rows = acc.rows();
  await save(rows);
  return rows.length;
}

// ---------- Everything ----------
export async function syncAll(days = 35) {
  const db = supabaseAdmin();
  const { data: s } = await db.from("settings").select("*").eq("id", 1).single();
  const end = subDays(new Date(), 1);
  const start = subDays(end, days - 1);
  const log: string[] = [];
  let ok = true;

  const run = async (label: string, fn: () => Promise<number>) => {
    try {
      const n = await fn();
      log.push(`${label}: ${n} rows`);
    } catch (e: any) {
      ok = false;
      log.push(`${label}: ${e.message}`);
    }
  };

  if (s?.ga4_property_id) await run("GA4", () => syncGa4(s.ga4_property_id, start, end));
  else log.push("GA4: not set up");
  if (s?.gsc_site_url) await run("Search Console", () => syncGsc(s.gsc_site_url, start, end, s.brand_terms || [], s.tracked_keywords || []));
  else log.push("Search Console: not set up");
  if (s?.gbp_locations?.length) {
    await run("Business Profile", () => syncGbp(s.gbp_locations, start, end));
    if (gbpWarning) log.push(`Business Profile: ${gbpWarning}`);
  }
  else log.push("Business Profile: no locations chosen");

  const status = (ok ? "OK · " : "Problem · ") + log.join(" · ");
  await db.from("settings").update({ last_sync_at: new Date().toISOString(), last_sync_status: status }).eq("id", 1);
  return { ok, log };
}
