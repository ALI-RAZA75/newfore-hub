"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"password" | "link">("password");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const sb = supabaseBrowser();
    if (mode === "link") {
      const { error } = await sb.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${location.origin}/auth/callback` },
      });
      setMsg(error ? error.message : "Check your email for a sign-in link.");
    } else {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
      else location.href = "/";
    }
    setBusy(false);
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-ink p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-8 shadow-xl">
        <div>
          <p className="font-display text-2xl font-extrabold">
            newfore<span className="text-brand">.</span> hub
          </p>
          <p className="muted mt-1 text-sm">Performance, plans and tasks in one place.</p>
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {mode === "password" && (
          <div>
            <label className="label" htmlFor="password">Password</label>
            <input id="password" className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        )}
        <button className="btn-primary w-full justify-center" disabled={busy}>
          {mode === "password" ? "Sign in" : "Email me a sign-in link"}
        </button>
        <button type="button" className="w-full text-center text-sm text-ink-muted underline" onClick={() => setMode(mode === "password" ? "link" : "password")}>
          {mode === "password" ? "Use an email link instead" : "Use a password instead"}
        </button>
        {msg && <p className="rounded-lg bg-paper p-3 text-sm">{msg}</p>}
      </form>
      <footer className="mt-4 text-center text-xs text-white/70">
        <a href="/privacy" className="hover:text-white hover:underline">Privacy</a> · <a href="/terms" className="hover:text-white hover:underline">Terms</a>
      </footer>
    </main>
  );
}
