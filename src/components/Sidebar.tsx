"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CheckSquare, FolderKanban, LogOut, Settings } from "lucide-react";
import clsx from "clsx";
import { supabaseBrowser } from "@/lib/supabase-browser";

const NAV = [
  { href: "/", label: "Performance", icon: BarChart3 },
  { href: "/plans", label: "Plans & goals", icon: FolderKanban },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/settings", label: "Settings", icon: Settings },
];

export default function Sidebar({ name, role, myOpen }: { name: string; role: string; myOpen: number }) {
  const path = usePathname();
  return (
    <aside className="flex w-full shrink-0 flex-col bg-ink text-white md:sticky md:top-0 md:h-screen md:w-60">
      <div className="flex items-center justify-between px-5 py-5 md:block">
        <Link href="/" className="font-display text-xl font-extrabold">
          newfore<span className="text-brand">.</span> hub
        </Link>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:pb-0">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? path === "/" : path.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-3 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition",
                active ? "bg-brand text-white" : "text-white/70 hover:bg-white/10 hover:text-white"
              )}
            >
              <Icon size={18} />
              {label}
              {href === "/tasks" && myOpen > 0 && (
                <span className="ml-auto rounded-full bg-white/15 px-2 text-xs tnum">{myOpen}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="mt-auto hidden border-t border-white/10 p-4 md:block">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="text-xs capitalize text-white/50">{role}</p>
        <button
          className="mt-3 flex items-center gap-2 text-xs text-white/60 hover:text-white"
          onClick={async () => {
            await supabaseBrowser().auth.signOut();
            location.href = "/login";
          }}
        >
          <LogOut size={14} /> Sign out
        </button>
      </div>
    </aside>
  );
}
