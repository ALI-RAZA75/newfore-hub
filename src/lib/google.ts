import "server-only";
import { supabaseAdmin } from "./supabase-server";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/business.manage",
];

export function redirectUri() {
  return `${process.env.APP_URL}/api/google/callback`;
}

export function authUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function exchangeCode(code: string) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
  });
  if (!r.ok) throw new Error(`Google token exchange failed: ${await r.text()}`);
  return (await r.json()) as {
    access_token: string; refresh_token?: string; expires_in: number; scope: string; id_token?: string;
  };
}

/** Returns a valid access token, refreshing it when needed. */
export async function accessToken(): Promise<string> {
  const db = supabaseAdmin();
  const { data: tok } = await db.from("google_tokens").select("*").eq("id", 1).maybeSingle();
  if (!tok) throw new Error("Google is not connected yet. Open Settings and click Connect Google.");
  if (tok.access_token && tok.expires_at && new Date(tok.expires_at).getTime() - Date.now() > 120_000) {
    return tok.access_token;
  }
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: tok.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) throw new Error(`Google refresh failed (reconnect Google in Settings): ${await r.text()}`);
  const j = await r.json();
  const expires_at = new Date(Date.now() + j.expires_in * 1000).toISOString();
  await db.from("google_tokens").update({ access_token: j.access_token, expires_at, updated_at: new Date().toISOString() }).eq("id", 1);
  return j.access_token as string;
}

export async function gfetch<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const r = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`${r.status} from ${new URL(url).host}: ${text.slice(0, 400)}`);
  }
  return (await r.json()) as T;
}

// ---------- Discovery (for the Settings pickers) ----------

export async function listGa4Properties() {
  const out: { id: string; name: string }[] = [];
  let pageToken = "";
  do {
    const j: any = await gfetch(
      `https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ""}`
    );
    for (const a of j.accountSummaries || [])
      for (const p of a.propertySummaries || [])
        out.push({ id: String(p.property).replace("properties/", ""), name: `${p.displayName} (${a.displayName})` });
    pageToken = j.nextPageToken || "";
  } while (pageToken);
  return out;
}

export async function listGscSites() {
  const j: any = await gfetch("https://www.googleapis.com/webmasters/v3/sites");
  return ((j.siteEntry || []) as any[]).map((s) => s.siteUrl as string);
}

export async function listGbpLocations() {
  const out: { name: string; account: string; title: string; address: string }[] = [];
  const accts: any = await gfetch("https://mybusinessaccountmanagement.googleapis.com/v1/accounts?pageSize=20");
  for (const a of accts.accounts || []) {
    let pageToken = "";
    do {
      const j: any = await gfetch(
        `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title,storefrontAddress&pageSize=100${pageToken ? `&pageToken=${pageToken}` : ""}`
      );
      for (const l of j.locations || []) {
        const ad = l.storefrontAddress;
        out.push({
          name: l.name,
          account: a.name,
          title: l.title,
          address: ad ? [...(ad.addressLines || []), ad.locality].filter(Boolean).join(", ") : "",
        });
      }
      pageToken = j.nextPageToken || "";
    } while (pageToken);
  }
  return out;
}
