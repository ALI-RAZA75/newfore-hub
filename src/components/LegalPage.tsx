import Link from "next/link";

/** Plain public page (no sidebar, no login) for the privacy policy and terms. */
export default function LegalPage({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-paper px-4 py-12">
      <article className="mx-auto max-w-2xl rounded-2xl bg-white p-8 shadow-sm">
        <Link href="/login" className="font-display text-xl font-extrabold">
          newfore<span className="text-brand">.</span> hub
        </Link>
        <h1 className="mt-6 text-3xl font-extrabold">{title}</h1>
        <div className="mt-4 flex flex-col gap-4 leading-relaxed">{children}</div>
        <p className="mt-8 text-sm text-ink-muted">Last updated: {updated}</p>
        <p className="mt-6 text-sm text-ink-muted">
          <Link href="/privacy" className="underline">Privacy</Link> · <Link href="/terms" className="underline">Terms</Link>
        </p>
      </article>
    </main>
  );
}
