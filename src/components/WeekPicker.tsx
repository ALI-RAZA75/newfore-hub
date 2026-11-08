"use client";
import { usePathname, useRouter } from "next/navigation";

/** Monday–Sunday week selector, kept in ?week= on whichever page it sits on. */
export default function WeekPicker({ weeks, value }: { weeks: { iso: string; label: string; range: string }[]; value: string }) {
  const router = useRouter();
  const path = usePathname();
  return (
    <div>
      <label className="label" htmlFor="week">Week (Mon–Sun)</label>
      <select id="week" className="input min-w-[220px]" value={value} onChange={(e) => router.push(`${path}?week=${e.target.value}`)}>
        {weeks.map((w) => (
          <option key={w.iso} value={w.iso}>{w.label === w.range ? w.range : `${w.label} (${w.range})`}</option>
        ))}
      </select>
    </div>
  );
}
