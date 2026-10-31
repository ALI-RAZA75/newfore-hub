import { getMe, supabaseServer } from "@/lib/supabase-server";
import TaskBoard from "@/components/TaskBoard";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const me = (await getMe())!;
  const sb = supabaseServer();
  const [{ data: tasks }, { data: people }, { data: plans }] = await Promise.all([
    sb.from("tasks").select("*").order("due_date", { nullsFirst: false }),
    sb.from("profiles").select("id,email,full_name").order("full_name"),
    sb.from("plans").select("id,name").neq("status", "archived").order("start_date", { ascending: false }),
  ]);
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">Tasks</p>
        <h1 className="text-3xl font-extrabold">Everything we’re working on</h1>
        <p className="muted mt-1 text-sm">Drag cards between columns, or open one to change the owner, priority and date, or to leave a comment.</p>
      </header>
      <TaskBoard tasks={(tasks || []) as any} people={(people || []) as any} plans={(plans || []) as any} meId={me.id} isAdmin={me.role === "admin"} />
    </div>
  );
}
