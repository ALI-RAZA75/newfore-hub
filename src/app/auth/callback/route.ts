import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const next = req.nextUrl.searchParams.get("next") || "/";
  if (code) await supabaseServer().auth.exchangeCodeForSession(code);
  return NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", req.url));
}
