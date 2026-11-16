"use client";
import { usePathname, useRouter } from "next/navigation";

/**
 * Period selector shared by Performance and Plans: "Last 7 days", "Last 28 days" or one Mon–Sun week.
 * Kept in the URL as ?period=7d|28d or ?week=yyyy-MM-dd.
 */
export default function PeriodPicker({ options, value }: { options: { value: string; label: string }[]; value: string }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <div className="max-w-xs">
      <label className="label" htmlFor="period">Period</label>
      <select id="period" className="input min-w-[240px]" value={value}
        onChange={(e) => {
          const v = e.target.value;
          router.push(`${path}?${v === "7d" || v === "28d" ? `period=${v}` : `week=${v}`}`);
        }}>
        <optgroup label="Rolling">
          {options.filter((o) => o.value === "7d" || o.value === "28d").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
        <optgroup label="Weeks (Mon–Sun)">
          {options.filter((o) => o.value !== "7d" && o.value !== "28d").map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
      </select>
      <p className="mt-1 text-xs text-ink-muted">
        Last 7 days uses the latest complete data for each source. Google Maps and Search Console report 2–5 days late.
      </p>
    </div>
  );
}
