"use server";
import { revalidatePath } from "next/cache";
import { getMe, supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import { GOAL_DATE, GOAL_SOURCE, MANUAL_SOURCE, SCORECARD } from "@/lib/scorecard";

type Res = { ok: true } | { ok: false; error: string };
const fail = (e: unknown): Res => ({ ok: false, error: e instanceof Error ? e.message : String(e) });
const done = (...paths: string[]): Res => { paths.forEach((p) => revalidatePath(p, "layout")); return { ok: true }; };

const clean = (v: FormDataEntryValue | null) => {
  const s = (v ?? "").toString().trim();
  return s === "" ? null : s;
};

// ---------- Tasks ----------
export async function saveTask(fd: FormData): Promise<Res> {
  try {
    const me = await getMe();
    if (!me) throw new Error("Sign in first.");
    const sb = supabaseServer();
    const id = clean(fd.get("id"));
    const row = {
      title: clean(fd.get("title")) ?? "Untitled task",
      description: clean(fd.get("description")),
      area: clean(fd.get("area")),
      priority: clean(fd.get("priority")) ?? "medium",
      status: clean(fd.get("status")) ?? "todo",
      assignee_id: clean(fd.get("assignee_id")),
      plan_id: clean(fd.get("plan_id")),
      due_date: clean(fd.get("due_date")),
    };
    const { error } = id
      ? await sb.from("tasks").update(row).eq("id", id)
      : await sb.from("tasks").insert({ ...row, created_by: me.id });
    if (error) throw error;
    return done("/");
  } catch (e) { return fail(e); }
}

export async function setTaskStatus(id: string, status: string): Promise<Res> {
  try {
    const { error } = await supabaseServer().from("tasks").update({ status }).eq("id", id);
    if (error) throw error;
    return done("/");
  } catch (e) { return fail(e); }
}

export async function deleteTask(id: string): Promise<Res> {
  try {
    const { error } = await supabaseServer().from("tasks").delete().eq("id", id);
    if (error) throw error;
    return done("/");
  } catch (e) { return fail(e); }
}

export async function addComment(taskId: string, body: string): Promise<Res> {
  try {
    const me = await getMe();
    if (!me) throw new Error("Sign in first.");
    if (!body.trim()) return { ok: true };
    const { error } = await supabaseServer().from("task_comments").insert({ task_id: taskId, body: body.trim(), author_id: me.id });
    if (error) throw error;
    return done("/tasks");
  } catch (e) { return fail(e); }
}

export async function listComments(taskId: string) {
  const { data } = await supabaseServer()
    .from("task_comments")
    .select("id, body, created_at, author:profiles(full_name,email)")
    .eq("task_id", taskId)
    .order("created_at");
  return (data || []) as any[];
}

// ---------- Plans & goals (admins) ----------
export async function savePlan(fd: FormData): Promise<Res> {
  try {
    const me = await getMe();
    if (me?.role !== "admin") throw new Error("Only admins can change plans.");
    const sb = supabaseServer();
    const id = clean(fd.get("id"));
    const row = {
      name: clean(fd.get("name")) ?? "New plan",
      description: clean(fd.get("description")),
      start_date: clean(fd.get("start_date")),
      end_date: clean(fd.get("end_date")),
      status: clean(fd.get("status")) ?? "active",
    };
    const { error } = id ? await sb.from("plans").update(row).eq("id", id) : await sb.from("plans").insert({ ...row, created_by: me.id });
    if (error) throw error;
    return done("/plans");
  } catch (e) { return fail(e); }
}

export async function saveGoal(fd: FormData): Promise<Res> {
  try {
    const me = await getMe();
    if (me?.role !== "admin") throw new Error("Only admins can change goals.");
    const sb = supabaseServer();
    const id = clean(fd.get("id"));
    const num = (k: string) => { const v = clean(fd.get(k)); return v === null ? null : Number(v); };
    const row = {
      plan_id: clean(fd.get("plan_id")),
      label: clean(fd.get("label")) ?? "Goal",
      metric_key: clean(fd.get("metric_key")),
      baseline: num("baseline") ?? 0,
      target: num("target") ?? 0,
      lower_is_better: fd.get("lower_is_better") === "on",
      manual_value: num("manual_value"),
    };
    const { error } = id ? await sb.from("goals").update(row).eq("id", id) : await sb.from("goals").insert(row);
    if (error) throw error;
    return done("/plans");
  } catch (e) { return fail(e); }
}

export async function deleteGoal(id: string): Promise<Res> {
  try {
    const { error } = await supabaseServer().from("goals").delete().eq("id", id);
    if (error) throw error;
    return done("/plans");
  } catch (e) { return fail(e); }
}

// ---------- Weekly scorecard ----------
// metrics_daily is written by the server only (no RLS write policies), so these use the service role.
const scoreValue = (v: string) => {
  const s = v.trim();
  if (s === "") return null;
  const n = Number(s);
  if (!Number.isFinite(n)) throw new Error("Enter a number.");
  return n;
};

/** Anyone on the team can enter a manual weekly number. Empty clears it. */
export async function saveScoreValue(week: string, key: string, value: string): Promise<Res> {
  try {
    const me = await getMe();
    if (!me) throw new Error("Sign in first.");
    if (!SCORECARD.some((m) => m.key === key && m.manual)) throw new Error("That number is filled in automatically.");
    const d = new Date(week + "T00:00:00");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || Number.isNaN(d.getTime()) || d.getDay() !== 1) throw new Error("Pick a week starting on a Monday.");
    const n = scoreValue(value);
    const db = supabaseAdmin().from("metrics_daily");
    const { error } = n === null
      ? await db.delete().match({ date: week, source: MANUAL_SOURCE, metric: key, dim: "" })
      : await db.upsert({ date: week, source: MANUAL_SOURCE, metric: key, dim: "", value: n }, { onConflict: "date,source,metric,dim" });
    if (error) throw error;
    return done("/");
  } catch (e) { return fail(e); }
}

/** Admins set the weekly goal for each measurable. Empty clears it. */
export async function saveScoreGoal(key: string, value: string): Promise<Res> {
  try {
    const me = await getMe();
    if (me?.role !== "admin") throw new Error("Only admins can change scorecard goals.");
    if (!SCORECARD.some((m) => m.key === key)) throw new Error("Unknown measurable.");
    const n = scoreValue(value);
    const db = supabaseAdmin().from("metrics_daily");
    const { error } = n === null
      ? await db.delete().match({ date: GOAL_DATE, source: GOAL_SOURCE, metric: key, dim: "" })
      : await db.upsert({ date: GOAL_DATE, source: GOAL_SOURCE, metric: key, dim: "", value: n }, { onConflict: "date,source,metric,dim" });
    if (error) throw error;
    return done("/");
  } catch (e) { return fail(e); }
}

// ---------- Settings & team (admins) ----------
export async function saveSettings(fd: FormData): Promise<Res> {
  try {
    const me = await getMe();
    if (me?.role !== "admin") throw new Error("Only admins can change settings.");
    const list = (k: string) => (clean(fd.get(k)) ?? "").split(/\n|,/).map((s) => s.trim()).filter(Boolean);
    const locs = clean(fd.get("gbp_locations"));
    const { error } = await supabaseServer().from("settings").update({
      ga4_property_id: clean(fd.get("ga4_property_id")),
      gsc_site_url: clean(fd.get("gsc_site_url")),
      gbp_locations: locs ? JSON.parse(locs) : [],
      tracked_keywords: list("tracked_keywords"),
      brand_terms: list("brand_terms"),
    }).eq("id", 1);
    if (error) throw error;
    return done("/");
  } catch (e) { return fail(e); }
}

export async function setRole(userId: string, role: "admin" | "member"): Promise<Res> {
  try {
    const me = await getMe();
    if (me?.role !== "admin") throw new Error("Only admins can change roles.");
    if (userId === me.id && role !== "admin") throw new Error("You can't remove your own admin role.");
    const { error } = await supabaseServer().from("profiles").update({ role }).eq("id", userId);
    if (error) throw error;
    return done("/settings");
  } catch (e) { return fail(e); }
}

export async function inviteMember(email: string, fullName: string): Promise<Res> {
  try {
    const me = await getMe();
    if (me?.role !== "admin") throw new Error("Only admins can invite people.");
    const { error } = await supabaseAdmin().auth.admin.inviteUserByEmail(email.trim(), {
      data: { full_name: fullName.trim() || undefined },
      redirectTo: `${process.env.APP_URL}/auth/callback?next=/settings/password`,
    });
    if (error) throw error;
    return done("/settings");
  } catch (e) { return fail(e); }
}

export async function setPassword(password: string): Promise<Res> {
  try {
    if (password.length < 8) throw new Error("Use at least 8 characters.");
    const { error } = await supabaseServer().auth.updateUser({ password });
    if (error) throw error;
    return { ok: true };
  } catch (e) { return fail(e); }
}
