"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { format, isBefore, parseISO, startOfToday, startOfWeek } from "date-fns";
import { CalendarDays, Columns3, List, MessageSquare, Plus, Search, Trash2, X } from "lucide-react";
import { addComment, deleteTask, listComments, saveTask, setTaskStatus } from "@/app/actions";

export type Task = {
  id: string; title: string; description: string | null; area: string | null; priority: string; status: string;
  assignee_id: string | null; plan_id: string | null; due_date: string | null; created_by: string | null; completed_at: string | null;
};
export type Person = { id: string; email: string; full_name: string | null };
export type PlanLite = { id: string; name: string };

const STATUSES = [
  { key: "todo", label: "To do" },
  { key: "in_progress", label: "In progress" },
  { key: "review", label: "Review" },
  { key: "done", label: "Done" },
];
const PRIORITIES = [
  { key: "urgent", label: "Urgent", cls: "bg-red-100 text-red-700" },
  { key: "high", label: "High", cls: "bg-orange-100 text-orange-700" },
  { key: "medium", label: "Medium", cls: "bg-sky-100 text-sky-700" },
  { key: "low", label: "Low", cls: "bg-slate-100 text-slate-600" },
];
const prioRank: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

const name = (p?: Person) => (p ? p.full_name || p.email.split("@")[0] : "Unassigned");
const initials = (p?: Person) => name(p).split(/\s+/).map((s) => s[0]).slice(0, 2).join("").toUpperCase();
const isLate = (t: Task) => t.status !== "done" && !!t.due_date && isBefore(parseISO(t.due_date), startOfToday());

function Prio({ p }: { p: string }) {
  const x = PRIORITIES.find((q) => q.key === p) || PRIORITIES[2];
  return <span className={clsx("chip", x.cls)}>{x.label}</span>;
}

export default function TaskBoard({
  tasks, people, plans, meId, isAdmin, planId, initialView = "board",
}: {
  tasks: Task[]; people: Person[]; plans: PlanLite[]; meId: string; isAdmin: boolean; planId?: string; initialView?: "board" | "list" | "week";
}) {
  const router = useRouter();
  const [items, setItems] = useState(tasks);
  useEffect(() => setItems(tasks), [tasks]);
  const [view, setView] = useState(initialView);
  const [q, setQ] = useState("");
  const [who, setWho] = useState("all");
  const [prio, setPrio] = useState("all");
  const [plan, setPlan] = useState(planId || "all");
  const [hideDone, setHideDone] = useState(false);
  const [editing, setEditing] = useState<Task | "new" | null>(null);
  const [, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const canEdit = (t: Task) => isAdmin || t.assignee_id === meId || t.created_by === meId;

  const shown = items
    .filter((t) => plan === "all" || t.plan_id === plan)
    .filter((t) => who === "all" || (who === "me" ? t.assignee_id === meId : who === "none" ? !t.assignee_id : t.assignee_id === who))
    .filter((t) => prio === "all" || t.priority === prio)
    .filter((t) => !hideDone || t.status !== "done")
    .filter((t) => !q || `${t.title} ${t.area || ""} ${t.description || ""}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999") || prioRank[a.priority] - prioRank[b.priority]);

  const move = (t: Task, status: string) => {
    if (!canEdit(t)) { setError("You can only change tasks assigned to you or that you created."); return; }
    setItems((xs) => xs.map((x) => (x.id === t.id ? { ...x, status } : x)));
    start(async () => {
      const r = await setTaskStatus(t.id, status);
      if (!r.ok) { setError(r.error); setItems(tasks); }
      router.refresh();
    });
  };

  const total = shown.length, done = shown.filter((t) => t.status === "done").length, late = shown.filter(isLate).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-paper-line bg-white p-0.5">
          {([["board", Columns3, "Board"], ["list", List, "List"], ["week", CalendarDays, "By week"]] as const).map(([k, Icon, l]) => (
            <button key={k} onClick={() => setView(k)} aria-pressed={view === k}
              className={clsx("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold", view === k ? "bg-ink text-white" : "text-ink-muted hover:text-ink")}>
              <Icon size={15} /> {l}
            </button>
          ))}
        </div>
        <label className="relative min-w-[10rem] flex-1 sm:max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
          <input className="input pl-9" placeholder="Search tasks" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search tasks" />
        </label>
        <select className="input w-auto" value={who} onChange={(e) => setWho(e.target.value)} aria-label="Assignee">
          <option value="all">Everyone</option>
          <option value="me">My tasks</option>
          <option value="none">Unassigned</option>
          {people.map((p) => <option key={p.id} value={p.id}>{name(p)}</option>)}
        </select>
        <select className="input w-auto" value={prio} onChange={(e) => setPrio(e.target.value)} aria-label="Priority">
          <option value="all">All priorities</option>
          {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
        </select>
        {!planId && (
          <select className="input w-auto" value={plan} onChange={(e) => setPlan(e.target.value)} aria-label="Plan">
            <option value="all">All plans</option>
            {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide done
        </label>
        <button className="btn-primary ml-auto" onClick={() => setEditing("new")}><Plus size={16} /> New task</button>
      </div>

      <p className="text-sm text-ink-muted tnum">
        {total} tasks · {done} done · <span className={late ? "font-semibold text-red-600" : ""}>{late} overdue</span>
      </p>
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700" onClick={() => setError(null)}>{error}</p>}

      {view === "board" && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {STATUSES.map((s) => {
            const col = shown.filter((t) => t.status === s.key);
            return (
              <div key={s.key}
                className="flex min-h-[200px] flex-col gap-2 rounded-xl bg-paper-line/50 p-3"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => { const t = items.find((x) => x.id === e.dataTransfer.getData("id")); if (t && t.status !== s.key) move(t, s.key); }}>
                <p className="flex items-center justify-between px-1 text-sm font-bold">{s.label}<span className="text-ink-muted tnum">{col.length}</span></p>
                {col.map((t) => (
                  <button key={t.id} draggable={canEdit(t)} onDragStart={(e) => e.dataTransfer.setData("id", t.id)} onClick={() => setEditing(t)}
                    className={clsx("flex flex-col gap-2 rounded-lg border bg-white p-3 text-left shadow-sm transition hover:border-brand/50",
                      isLate(t) ? "border-red-300" : "border-paper-line")}>
                    <div className="flex items-center justify-between gap-2">
                      <Prio p={t.priority} />
                      {t.area && <span className="truncate text-xs text-ink-muted">{t.area}</span>}
                    </div>
                    <p className={clsx("text-sm font-semibold leading-snug", t.status === "done" && "text-ink-muted line-through")}>{t.title}</p>
                    <div className="flex items-center justify-between text-xs text-ink-muted">
                      <span className={clsx(isLate(t) && "font-semibold text-red-600")}>{t.due_date ? format(parseISO(t.due_date), "MMM d") : "No date"}</span>
                      <span title={name(byId.get(t.assignee_id || ""))}
                        className={clsx("grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold", t.assignee_id ? "bg-ink text-white" : "border border-dashed border-ink-muted")}>
                        {t.assignee_id ? initials(byId.get(t.assignee_id)) : ""}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {(view === "list" || view === "week") && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-paper-line text-left text-xs text-ink-muted">
                <th className="px-4 py-2.5">Task</th><th>Priority</th><th>Owner</th><th>Due</th><th className="pr-4">Status</th>
              </tr>
            </thead>
            {(view === "week"
              ? groupBy(shown, (t) => (t.due_date ? format(startOfWeek(parseISO(t.due_date), { weekStartsOn: 1 }), "yyyy-MM-dd") : "none"))
              : [["all", shown] as [string, Task[]]]
            ).map(([g, rows]) => (
              <tbody key={g}>
                {view === "week" && (
                  <tr className="bg-paper">
                    <td colSpan={5} className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink-muted">
                      {g === "none" ? "No due date" : `Week of ${format(parseISO(g), "MMM d")}`} · {rows.filter((t) => t.status === "done").length}/{rows.length} done
                    </td>
                  </tr>
                )}
                {rows.map((t) => (
                  <tr key={t.id} className={clsx("border-b border-paper-line", isLate(t) && "bg-red-50/60")}>
                    <td className="px-4 py-2.5">
                      <button className="text-left font-semibold hover:text-brand-dark" onClick={() => setEditing(t)}>{t.title}</button>
                      {t.area && <p className="text-xs text-ink-muted">{t.area}</p>}
                    </td>
                    <td><Prio p={t.priority} /></td>
                    <td className="text-ink-muted">{name(byId.get(t.assignee_id || ""))}</td>
                    <td className={clsx("tnum", isLate(t) ? "font-semibold text-red-600" : "text-ink-muted")}>{t.due_date ? format(parseISO(t.due_date), "MMM d") : "—"}</td>
                    <td className="pr-4">
                      <select className="input w-36 py-1" value={t.status} disabled={!canEdit(t)} onChange={(e) => move(t, e.target.value)} aria-label="Status">
                        {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
          {!shown.length && <p className="p-8 text-center text-sm text-ink-muted">No tasks match these filters.</p>}
        </div>
      )}

      {editing && (
        <TaskEditor
          task={editing === "new" ? null : editing}
          people={people} plans={plans} defaultPlan={planId || (plan !== "all" ? plan : plans[0]?.id)}
          canEdit={editing === "new" || canEdit(editing)} canDelete={editing !== "new" && (isAdmin || editing.created_by === meId)}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function groupBy<T>(xs: T[], key: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  xs.forEach((x) => { const k = key(x); m.set(k, [...(m.get(k) || []), x]); });
  return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function TaskEditor({ task, people, plans, defaultPlan, canEdit, canDelete, onClose, onSaved }: {
  task: Task | null; people: Person[]; plans: PlanLite[]; defaultPlan?: string; canEdit: boolean; canDelete: boolean;
  onClose: () => void; onSaved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [comments, setComments] = useState<any[]>([]);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { if (task) listComments(task.id).then(setComments); }, [task]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Task">
        <div className="flex items-center justify-between border-b border-paper-line px-6 py-4">
          <h2 className="text-lg font-bold">{task ? "Task" : "New task"}</h2>
          <button onClick={onClose} aria-label="Close" className="rounded p-1 hover:bg-paper"><X size={18} /></button>
        </div>
        <form
          className="flex flex-col gap-4 px-6 py-5"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const r = await saveTask(new FormData(e.currentTarget));
            setBusy(false);
            if (r.ok) onSaved(); else setErr(r.error);
          }}
        >
          {task && <input type="hidden" name="id" value={task.id} />}
          <fieldset disabled={!canEdit} className="flex flex-col gap-4">
            <div>
              <label className="label" htmlFor="t-title">Title</label>
              <input id="t-title" name="title" className="input" required defaultValue={task?.title} autoFocus={!task} />
            </div>
            <div>
              <label className="label" htmlFor="t-desc">Details</label>
              <textarea id="t-desc" name="description" rows={4} className="input" defaultValue={task?.description || ""} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="t-status">Status</label>
                <select id="t-status" name="status" className="input" defaultValue={task?.status || "todo"}>
                  {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="t-prio">Priority</label>
                <select id="t-prio" name="priority" className="input" defaultValue={task?.priority || "medium"}>
                  {PRIORITIES.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="t-who">Owner</label>
                <select id="t-who" name="assignee_id" className="input" defaultValue={task?.assignee_id || ""}>
                  <option value="">Unassigned</option>
                  {people.map((p) => <option key={p.id} value={p.id}>{name(p)}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="t-due">Due date</label>
                <input id="t-due" name="due_date" type="date" className="input" defaultValue={task?.due_date || ""} />
              </div>
              <div>
                <label className="label" htmlFor="t-plan">Plan</label>
                <select id="t-plan" name="plan_id" className="input" defaultValue={task?.plan_id || defaultPlan || ""}>
                  <option value="">No plan</option>
                  {plans.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="t-area">Area</label>
                <input id="t-area" name="area" className="input" list="areas" defaultValue={task?.area || ""} />
                <datalist id="areas">
                  {["Website", "Maps & reviews", "AI visibility", "Content", "Pages", "Reputation", "Tracking", "Reporting"].map((a) => <option key={a} value={a} />)}
                </datalist>
              </div>
            </div>
          </fieldset>
          {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
          <div className="flex items-center gap-2">
            {canEdit && <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : task ? "Save changes" : "Create task"}</button>}
            {!canEdit && <p className="text-sm text-ink-muted">Only the owner, the creator or an admin can edit this task.</p>}
            {canDelete && task && (
              confirmDelete ? (
                <span className="ml-auto flex items-center gap-2 text-sm">
                  Delete for good?
                  <button type="button" className="btn bg-red-600 text-white hover:bg-red-700" onClick={async () => { const r = await deleteTask(task.id); if (r.ok) onSaved(); else setErr(r.error); }}>Delete</button>
                  <button type="button" className="btn-ghost" onClick={() => setConfirmDelete(false)}>Keep</button>
                </span>
              ) : (
                <button type="button" className="btn-ghost ml-auto text-red-600" onClick={() => setConfirmDelete(true)}><Trash2 size={15} /> Delete</button>
              )
            )}
          </div>
        </form>

        {task && (
          <div className="border-t border-paper-line px-6 py-5">
            <p className="mb-3 flex items-center gap-2 text-sm font-bold"><MessageSquare size={15} /> Comments</p>
            <div className="flex flex-col gap-3">
              {comments.map((c) => (
                <div key={c.id} className="rounded-lg bg-paper p-3 text-sm">
                  <p className="mb-1 text-xs text-ink-muted">{c.author?.full_name || c.author?.email || "Someone"} · {format(new Date(c.created_at), "MMM d, h:mm a")}</p>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </div>
              ))}
              {!comments.length && <p className="text-sm text-ink-muted">No comments yet.</p>}
            </div>
            <div className="mt-3 flex gap-2">
              <input className="input" placeholder="Add an update or question" value={note} onChange={(e) => setNote(e.target.value)} aria-label="Comment" />
              <button className="btn-ghost" onClick={async () => {
                const r = await addComment(task.id, note);
                if (r.ok) { setNote(""); setComments(await listComments(task.id)); }
              }}>Post</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
