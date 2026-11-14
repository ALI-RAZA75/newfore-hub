import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of Service · Newfore Hub" };

export default function Terms() {
  return (
    <LegalPage title="Terms of Service" updated="November 14, 2026">
      <p>Newfore Hub is for internal use by Newfore Inc. staff only. Access is by invitation.</p>
      <p>Data shown is for business reporting and is provided as-is.</p>
      <p>Newfore Inc., 435 McNeilly Rd, Unit 104, Stoney Creek, ON L8E 5E3.</p>
    </LegalPage>
  );
}
