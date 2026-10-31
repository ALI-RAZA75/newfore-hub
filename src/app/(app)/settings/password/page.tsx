"use client";
import { useState } from "react";
import { setPassword } from "@/app/actions";

export default function PasswordPage() {
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="mx-auto max-w-md">
      <form className="card flex flex-col gap-4" onSubmit={async (e) => {
        e.preventDefault();
        const r = await setPassword(pw);
        setMsg(r.ok ? "Password saved. You can sign in with it from now on." : r.error);
      }}>
        <h1 className="text-2xl font-extrabold">Set your password</h1>
        <div><label className="label" htmlFor="pw">New password</label><input id="pw" type="password" minLength={8} required className="input" value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <button className="btn-primary self-start">Save password</button>
        {msg && <p className="text-sm text-ink-muted">{msg}</p>}
      </form>
    </div>
  );
}
