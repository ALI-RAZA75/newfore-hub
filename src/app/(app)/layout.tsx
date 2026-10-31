import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { getMe, supabaseServer } from "@/lib/supabase-server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe();
  if (!me) redirect("/login");
  const { count } = await supabaseServer()
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("assignee_id", me.id)
    .neq("status", "done");
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar name={me.full_name || me.email} role={me.role} myOpen={count ?? 0} />
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
