"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

export default function SyncButton({ days = 35, label = "Sync now" }: { days?: number; label?: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        className="btn-ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setMsg(null);
          try {
            const r = await fetch(`/api/sync?days=${days}`);
            const j = await r.json();
            setMsg(j.error || (j.log || []).join(" · "));
            router.refresh();
          } catch {
            setMsg("Sync failed. Check Settings.");
          }
          setBusy(false);
        }}
      >
        <RefreshCw size={16} className={busy ? "animate-spin" : ""} /> {busy ? "Syncing…" : label}
      </button>
      {msg && <p className="max-w-md text-right text-xs text-ink-muted">{msg}</p>}
    </div>
  );
}
