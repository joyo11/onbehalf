"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "./ui/icon";
import { Wordmark } from "./ui/wordmark";

type NavItem = {
  href: string;
  name: string;
  icon: IconName;
  badge?: number;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const NAV: NavSection[] = [
  {
    label: "Marketing",
    items: [{ href: "/", name: "Home", icon: "globe" }],
  },
  {
    label: "Onboarding",
    items: [{ href: "/onboarding", name: "Sign-up flow", icon: "sparkles" }],
  },
  {
    label: "Product",
    items: [
      { href: "/dashboard", name: "Dashboard", icon: "layout-dashboard" },
      { href: "/search", name: "New search", icon: "search" },
      { href: "/matches", name: "Job matches", icon: "list" },
      { href: "/review", name: "Review & approve", icon: "sparkles", badge: 2 },
      { href: "/tracker", name: "Tracker", icon: "table-2" },
      { href: "/detail", name: "Application", icon: "check-circle" },
    ],
  },
  {
    label: "Account",
    items: [{ href: "/settings", name: "Profile & settings", icon: "user" }],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed top-0 bottom-0 left-0 w-[244px] z-20 bg-[#F4F2EC] border-r border-line flex flex-col">
      <div className="px-5 h-16 flex items-center justify-between border-b border-line/60">
        <Link href="/" className="focus-ring rounded-ctrl">
          <Wordmark size={18} />
        </Link>
        <button
          className="w-7 h-7 rounded-ctrl hover:bg-black/[0.05] text-mute flex items-center justify-center"
          title="Search (⌘K)"
        >
          <Icon name="search" size={14} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto scrollbar-thin py-4">
        {NAV.map((sec, i) => (
          <div key={sec.label} className={i ? "mt-5" : ""}>
            <div className="px-5 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-mute/80">
              {sec.label}
            </div>
            <ul className="px-2">
              {sec.items.map((item) => {
                const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`w-full flex items-center gap-2.5 h-9 px-3 rounded-ctrl text-[13px] transition-colors ${
                        active
                          ? "bg-white text-ink shadow-card font-medium"
                          : "text-mute hover:text-ink hover:bg-black/[0.03]"
                      }`}
                    >
                      <Icon name={item.icon} size={14} className="shrink-0" />
                      <span className="flex-1 text-left">{item.name}</span>
                      {item.badge && (
                        <span
                          className="text-[10.5px] font-semibold tabular px-1.5 h-[18px] inline-flex items-center rounded-full"
                          style={{ background: "var(--accent)", color: "#fff" }}
                        >
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-line/60">
        <button className="w-full flex items-center gap-2.5 p-2 rounded-ctrl hover:bg-black/[0.04] transition-colors">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[12px] font-semibold"
            style={{ background: "var(--accent)" }}
          >
            MC
          </div>
          <div className="text-left min-w-0 flex-1">
            <div className="text-[12.5px] font-medium truncate">Maya Chen</div>
            <div className="text-[11px] text-mute truncate">Pro plan</div>
          </div>
          <Icon name="settings" size={13} className="text-mute" />
        </button>
      </div>
    </aside>
  );
}
