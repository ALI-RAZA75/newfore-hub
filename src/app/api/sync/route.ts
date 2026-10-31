import { NextResponse, type NextRequest } from "next/server";
import { syncAll } from "@/lib/sync";
import { getMe } from "@/lib/supabase-server";

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const isCron = req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}` && !!process.env.CRON_SECRET;
  if (!isCron) {
    const me = await getMe();
    if (me?.role !== "admin") return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const days = Math.min(400, Math.max(3, Number(req.nextUrl.searchParams.get("days")) || 35));
  const result = await syncAll(days);
  return NextResponse.json(result, { status: result.ok ? 200 : 207 });
}
