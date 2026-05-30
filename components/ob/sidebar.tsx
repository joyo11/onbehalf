"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Eyebrow, ObLogo } from "./primitives";
import { Ic } from "./icons";

type NavItem = {
  href: string;
  label: string;
  icon: (p: { className?: string; style?: React.CSSProperties }) => React.JSX.Element;
};

const PRODUCT: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Ic.grid },
  { href: "/search", label: "New search", icon: Ic.search },
  { href: "/matches", label: "Job matches", icon: Ic.list },
  { href: "/review", label: "Review & approve", icon: Ic.spark },
  { href: "/tracker", label: "Tracker", icon: Ic.table },
];

export function ObSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden md:flex w-[256px] shrink-0 h-screen flex-col bg-panel text-panel-text sticky top-0">
      <div className="px-6 pt-7 pb-6">
        <Link href="/" className="block text-white">
          <ObLogo />
        </Link>
      </div>

      <nav className="px-3 flex-1 overflow-y-auto">
        <Eyebrow tone="panel" className="px-3 mb-2.5">
          Product
        </Eyebrow>
        <ul className="space-y-1">
          {PRODUCT.map((n) => {
            const on = pathname?.startsWith(n.href);
            const Icon = n.icon;
            return (
              <li key={n.href}>
                <Link
                  href={n.href}
                  className={
                    "group w-full flex items-center gap-3 rounded-xl2 px-3 py-2.5 text-[15px] font-semibold transition-colors " +
                    (on
                      ? "bg-panel-hover text-white"
                      : "text-panel-text hover:text-white hover:bg-panel-hover/60")
                  }
                >
                  <Icon className="h-[18px] w-[18px]" style={on ? { color: "#2DD4BF" } : undefined} />
                  <span className="flex-1 text-left">{n.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <Eyebrow tone="panel" className="px-3 mt-7 mb-2.5">
          Account
        </Eyebrow>
        <ul className="space-y-1">
          <li>
            <Link
              href="/settings"
              className={
                "group w-full flex items-center gap-3 rounded-xl2 px-3 py-2.5 text-[15px] font-semibold transition-colors " +
                (pathname?.startsWith("/settings")
                  ? "bg-panel-hover text-white"
                  : "text-panel-text hover:text-white hover:bg-panel-hover/60")
              }
            >
              <Ic.user className="h-[18px] w-[18px]" />
              <span>Profile &amp; settings</span>
            </Link>
          </li>
        </ul>
      </nav>

      <SidebarUser />
    </aside>
  );
}

function SidebarUser() {
  const { isLoaded, user } = useUser();
  if (!isLoaded || !user) {
    return (
      <div className="m-3 mt-2 h-[60px] rounded-xl2 px-3 py-3 border-t border-panel-line/60" />
    );
  }
  const name = user.fullName ?? user.firstName ?? user.primaryEmailAddress?.emailAddress ?? "You";
  const email = user.primaryEmailAddress?.emailAddress ?? "";
  const initials =
    (user.firstName?.[0] ?? name[0] ?? "U").toUpperCase() +
    (user.lastName?.[0] ?? name.split(" ")[1]?.[0] ?? "").toUpperCase();
  return (
    <Link
      href="/settings"
      className="m-3 mt-2 flex items-center gap-3 rounded-xl2 px-3 py-3 hover:bg-panel-hover transition-colors border-t border-panel-line/60"
    >
      <div className="h-9 w-9 rounded-full bg-teal-500 text-white grid place-items-center font-bold text-[13px]">
        {initials || "U"}
      </div>
      <div className="leading-tight min-w-0 flex-1">
        <p className="font-semibold text-[14px] text-white truncate">{name}</p>
        <p className="text-[12px] text-panel-dim truncate">{email}</p>
      </div>
      <Ic.gear className="h-[17px] w-[17px] text-panel-dim shrink-0" />
    </Link>
  );
}
