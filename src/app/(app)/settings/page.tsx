import { formatDistanceToNow } from "date-fns";
import { getMe, supabaseAdmin, supabaseServer } from "@/lib/supabase-server";
import DataSources from "@/components/DataSources";
import SyncButton from "@/components/SyncButton";
import Team from "@/components/Team";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: { searchParams: { google?: string } }) {
  const me = (await getMe())!;
  const sb = supabaseServer();
  const [{ data: s }, { data: people }] = await Promise.all([
    sb.from("settings").select("*").eq("id", 1).single(),
    sb.from("profiles").select("id,email,full_name,role").order("created_at"),
  ]);
  const isAdmin = me.role === "admin";
  const { data: tok } = isAdmin ? await supabaseAdmin().from("google_tokens").select("updated_at,scope").eq("id", 1).maybeSingle() : { data: null };
  const connected = !!tok;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6">
      <header>
        <p className="text-sm font-semibold uppercase tracking-wider text-brand-dark">Settings</p>
        <h1 className="text-3xl font-extrabold">Data sources and team</h1>
      </header>

      {!isAdmin && <p className="card text-sm">Only admins can change settings. You can still change your password below.</p>}

      {isAdmin && (
        <>
          <section className="card flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="card-title">Google connection</h2>
                <p className="text-sm text-ink-muted">
                  {connected ? <>Connected{s?.google_email ? <> as <b>{s.google_email}</b></> : null}. Read-only access to Analytics, Search Console and Business Profile.</> : "Not connected. Sign in with the Google account that manages Newfore’s Analytics, Search Console and Business Profiles."}
                </p>
              </div>
              <a className={connected ? "btn-ghost" : "btn-primary"} href="/api/google/connect">{connected ? "Reconnect Google" : "Connect Google"}</a>
            </div>
            {searchParams.google === "connected" && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">Google connected. Now choose the property, site and locations below.</p>}
            {searchParams.google === "error" && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Google connection didn’t finish. Try again, and make sure you tick every permission.</p>}
          </section>

          <section className="card">
            <h2 className="card-title mb-4">What to pull</h2>
            <DataSources settings={s || {}} connected={connected} />
          </section>

          <section className="card flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-md">
              <h2 className="card-title">Sync</h2>
              <p className="text-sm text-ink-muted">
                Data refreshes automatically every morning. {s?.last_sync_at ? <>Last sync {formatDistanceToNow(new Date(s.last_sync_at))} ago.</> : "No sync yet."}
              </p>
              {s?.last_sync_status && <p className="mt-2 text-xs text-ink-muted">{s.last_sync_status}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <SyncButton />
              <SyncButton days={120} label="Backfill 16 weeks" />
            </div>
          </section>

          <section className="card">
            <h2 className="card-title mb-3">Team</h2>
            <Team people={people || []} meId={me.id} />
          </section>
        </>
      )}

      <section className="card flex items-center justify-between gap-3">
        <div>
          <h2 className="card-title">Your password</h2>
          <p className="text-sm text-ink-muted">Signed in as {me.email}.</p>
        </div>
        <a className="btn-ghost" href="/settings/password">Change password</a>
      </section>
    </div>
  );
}
