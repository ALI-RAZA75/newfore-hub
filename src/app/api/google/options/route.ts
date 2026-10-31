import { NextResponse } from "next/server";
import { getMe } from "@/lib/supabase-server";
import { listGa4Properties, listGbpLocations, listGscSites } from "@/lib/google";

export async function GET() {
  const me = await getMe();
  if (me?.role !== "admin") return NextResponse.json({ error: "Admins only" }, { status: 403 });
  const settle = async <T,>(p: Promise<T>) => {
    try { return { ok: true as const, data: await p }; } catch (e: any) { return { ok: false as const, error: String(e.message || e) }; }
  };
  const [ga4, gsc, gbp] = await Promise.all([settle(listGa4Properties()), settle(listGscSites()), settle(listGbpLocations())]);
  return NextResponse.json({ ga4, gsc, gbp });
}
