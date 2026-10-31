"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { inviteMember, setRole } from "@/app/actions";

export default function Team({ people, meId }: { people: any[]; meId: string }) {
  const [email, setEmail] = useState("");
  const [nm, setNm] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-col gap-4">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs text-ink-muted"><th className="py-1.5">Person</th><th>Role</th></tr></thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.id} className="border-t border-paper-line">
              <td className="py-2"><b>{p.full_name || p.email}</b><br /><span className="text-xs text-ink-muted">{p.email}</span></td>
              <td>
                <select className="input w-32 py-1" defaultValue={p.role} disabled={p.id === meId} aria-label={`Role for ${p.email}`}
                  onChange={async (e) => { const r = await setRole(p.id, e.target.value as any); setMsg(r.ok ? "Role updated." : r.error); router.refresh(); }}>
                  <option value="admin">Admin</option><option value="member">Member</option>
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="flex flex-wrap gap-2" onSubmit={async (e) => {
        e.preventDefault();
        const r = await inviteMember(email, nm);
        setMsg(r.ok ? `Invite sent to ${email}.` : r.error);
        if (r.ok) { setEmail(""); setNm(""); router.refresh(); }
      }}>
        <input className="input flex-1" placeholder="Name" value={nm} onChange={(e) => setNm(e.target.value)} aria-label="Name" />
        <input className="input flex-1" type="email" required placeholder="email@newfore.com" value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Email" />
        <button className="btn-primary">Invite</button>
      </form>
      {msg && <p className="text-sm text-ink-muted">{msg}</p>}
    </div>
  );
}
