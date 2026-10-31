"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import Modal from "./Modal";
import { deleteGoal, saveGoal } from "@/app/actions";

export default function GoalForm({ planId, metrics, goal }: { planId: string; metrics: { key: string; label: string }[]; goal?: any }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [metric, setMetric] = useState<string>(goal?.metric_key || "");
  const router = useRouter();
  return (
    <>
      {goal ? (
        <button className="self-start text-xs font-semibold text-ink-muted hover:text-ink" onClick={() => setOpen(true)}><Pencil size={12} className="mr-1 inline" />Edit goal</button>
      ) : (
        <button className="btn-ghost" onClick={() => setOpen(true)}><Plus size={15} /> Add goal</button>
      )}
      {open && (
        <Modal title={goal ? "Edit goal" : "Add goal"} onClose={() => setOpen(false)}>
          <form className="flex flex-col gap-4" onSubmit={async (e) => {
            e.preventDefault();
            const r = await saveGoal(new FormData(e.currentTarget));
            if (r.ok) { setOpen(false); router.refresh(); } else setErr(r.error);
          }}>
            {goal && <input type="hidden" name="id" value={goal.id} />}
            <input type="hidden" name="plan_id" value={planId} />
            <div><label className="label" htmlFor="g-label">Goal</label><input id="g-label" name="label" className="input" required defaultValue={goal?.label} /></div>
            <div>
              <label className="label" htmlFor="g-metric">Measured by</label>
              <select id="g-metric" name="metric_key" className="input" value={metric} onChange={(e) => setMetric(e.target.value)}>
                <option value="">I’ll update it by hand</option>
                {metrics.map((m) => <option key={m.key} value={m.key}>{m.label} (live)</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><label className="label" htmlFor="g-base">Start</label><input id="g-base" name="baseline" type="number" step="any" className="input" required defaultValue={goal?.baseline ?? 0} /></div>
              <div><label className="label" htmlFor="g-t">Goal</label><input id="g-t" name="target" type="number" step="any" className="input" required defaultValue={goal?.target} /></div>
              <div><label className="label" htmlFor="g-th">Goal (top)</label><input id="g-th" name="target_high" type="number" step="any" className="input" placeholder="optional" defaultValue={goal?.target_high ?? ""} /></div>
            </div>
            {!metric && <div><label className="label" htmlFor="g-m">Current value</label><input id="g-m" name="manual_value" type="number" step="any" className="input" defaultValue={goal?.manual_value ?? ""} /></div>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="lower_is_better" defaultChecked={goal?.lower_is_better} /> Lower is better (like a ranking)</label>
            {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
            <div className="flex gap-2">
              <button className="btn-primary">{goal ? "Save goal" : "Add goal"}</button>
              {goal && <button type="button" className="btn-ghost ml-auto text-red-600" onClick={async () => { const r = await deleteGoal(goal.id); if (r.ok) { setOpen(false); router.refresh(); } else setErr(r.error); }}>Remove goal</button>}
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
