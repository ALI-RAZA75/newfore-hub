import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { authUrl } from "@/lib/google";
import { getMe } from "@/lib/supabase-server";

export async function GET() {
  const me = await getMe();
  if (me?.role !== "admin") return NextResponse.json({ error: "Only admins can connect Google." }, { status: 403 });
  const state = randomBytes(16).toString("hex");
  cookies().set("g_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(authUrl(state));
}
