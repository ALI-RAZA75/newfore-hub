"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import Modal from "./Modal";
import { savePlan } from "@/app/actions";

export default function PlanForm({ plan }: { plan?: any }) {
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  return (
    <>
      <button className={plan ? "btn-ghost" : "btn-primary"} onClick={() => setOpen(true)}>
        {plan ? <><Pencil size={15} /> Edit plan</> : <><Plus size={16} /> New plan</>}
      </button>
      {open && (
        <Modal title={plan ? "Edit plan" : "New plan"} onClose={() => setOpen(false)}>
          <form className="flex flex-col gap-4" onSubmit={async (e) => {
            e.preventDefault();
            const r = await savePlan(new FormData(e.currentTarget));
            if (r.ok) { setOpen(false); router.refresh(); } else setErr(r.error);
          }}>
            {plan && <input type="hidden" name="id" value={plan.id} />}
            <div><label className="label" htmlFor="p-name">Name</label><input id="p-name" name="name" className="input" required defaultValue={plan?.name} /></div>
            <div><label className="label" htmlFor="p-desc">What this plan is for</label><textarea id="p-desc" name="description" rows={3} className="input" defaultValue={plan?.description || ""} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label" htmlFor="p-start">Starts</label><input id="p-start" name="start_date" type="date" className="input" required defaultValue={plan?.start_date} /></div>
              <div><label className="label" htmlFor="p-end">Ends</label><input id="p-end" name="end_date" type="date" className="input" required defaultValue={plan?.end_date} /></div>
            </div>
            <div><label className="label" htmlFor="p-status">Status</label>
              <select id="p-status" name="status" className="input" defaultValue={plan?.status || "active"}>
                <option value="planned">Planned</option><option value="active">Active</option><option value="done">Done</option><option value="archived">Archived</option>
              </select>
            </div>
            {err && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{err}</p>}
            <button className="btn-primary self-start">{plan ? "Save plan" : "Create plan"}</button>
          </form>
        </Modal>
      )}
    </>
  );
}
