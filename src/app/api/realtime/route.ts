import { NextResponse } from "next/server";
import { getMe, supabaseAdmin } from "@/lib/supabase-server";
import { ga4Realtime } from "@/lib/sync";

export async function GET() {
  const me = await getMe();
  if (!me) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const { data: s } = await supabaseAdmin().from("settings").select("ga4_property_id").eq("id", 1).single();
  if (!s?.ga4_property_id) return NextResponse.json({ error: "GA4 not set up" }, { status: 200 });
  try {
    return NextResponse.json(await ga4Realtime(s.ga4_property_id));
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 200 });
  }
}
