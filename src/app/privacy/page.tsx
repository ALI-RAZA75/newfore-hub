import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy Policy · Newfore Hub" };

export default function Privacy() {
  return (
    <LegalPage title="Privacy Policy" updated="November 14, 2026">
      <p>
        Newfore Hub is an internal reporting tool for Newfore Inc. It uses Google sign-in with read-only access to
        Google Analytics, Search Console and Business Profile data for Newfore&apos;s own properties, to show performance
        reports to the Newfore team.
      </p>
      <p>Data is stored securely in our database (Supabase) and is not sold or shared with third parties.</p>
      <p>
        Access can be revoked any time at{" "}
        <a className="underline" href="https://myaccount.google.com/permissions">https://myaccount.google.com/permissions</a>.
      </p>
      <p>Contact: <a className="underline" href="mailto:info@newfore.com">info@newfore.com</a>.</p>
    </LegalPage>
  );
}
