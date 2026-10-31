import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode } from "@/lib/google";
import { getMe, supabaseAdmin } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const me = await getMe();
  const back = new URL("/settings", process.env.APP_URL);
  if (me?.role !== "admin") return NextResponse.redirect(back);

  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");
  const saved = cookies().get("g_state")?.value;
  cookies().delete("g_state");
  if (!code || !state || state !== saved) {
    back.searchParams.set("google", "error");
    return NextResponse.redirect(back);
  }
  try {
    const t = await exchangeCode(code);
    const db = supabaseAdmin();
    const { data: existing } = await db.from("google_tokens").select("refresh_token").eq("id", 1).maybeSingle();
    const refresh = t.refresh_token || existing?.refresh_token;
    if (!refresh) throw new Error("Google did not return a refresh token.");
    await db.from("google_tokens").upsert({
      id: 1,
      refresh_token: refresh,
      access_token: t.access_token,
      expires_at: new Date(Date.now() + t.expires_in * 1000).toISOString(),
      scope: t.scope,
      updated_at: new Date().toISOString(),
    });
    let email: string | null = null;
    if (t.id_token) {
      try {
        email = JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()).email ?? null;
      } catch { /* ignore */ }
    }
    await db.from("settings").update({ google_email: email }).eq("id", 1);
    back.searchParams.set("google", "connected");
  } catch {
    back.searchParams.set("google", "error");
  }
  return NextResponse.redirect(back);
}
