"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Ic } from "./icons";
import { Eyebrow, ObLogo } from "./primitives";

type NavItem = { href: string; label: string; icon: (p: { className?: string }) => React.JSX.Element };

const PRODUCT: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Ic.grid },
  { href: "/search", label: "New search", icon: Ic.search },
  { href: "/matches", label: "Job matches", icon: Ic.list },
  { href: "/review", label: "Review & approve", icon: Ic.spark },
  { href: "/tracker", label: "Tracker", icon: Ic.table },
];

export function MobileTopBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useUser();
  const initials =
    (user?.firstName?.[0] ?? user?.primaryEmailAddress?.emailAddress?.[0] ?? "U")
      .toUpperCase() + (user?.lastName?.[0] ?? "").toUpperCase();

  // Close drawer on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  return (
    <>
      <header className="md:hidden sticky top-0 z-40 bg-cream/90 backdrop-blur border-b border-sand-200">
        <div className="h-14 px-4 flex items-center justify-between gap-3">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open menu"
            className="h-11 w-11 -ml-2 grid place-items-center text-ink hover:bg-sand-100 rounded-full transition-colors"
          >
            <Hamburger />
          </button>
          <Link href="/dashboard" className="text-ink">
            <ObLogo />
          </Link>
          <Link
            href="/settings"
            className="h-9 w-9 rounded-full bg-teal-500 text-white grid place-items-center font-bold text-[12px]"
          >
            {initials || "U"}
          </Link>
        </div>
      </header>

      {/* Drawer */}
      <div
        className={
          "md:hidden fixed inset-0 z-50 transition-opacity duration-200 " +
          (open ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none")
        }
      >
        <div
          className="absolute inset-0 bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
        <aside
          className={
            "absolute left-0 top-0 bottom-0 w-[280px] bg-panel text-panel-text flex flex-col transition-transform duration-300 " +
            (open ? "translate-x-0" : "-translate-x-full")
          }
        >
          <div className="flex items-center justify-between px-5 pt-5 pb-4">
            <Link href="/dashboard" className="block text-white" onClick={() => setOpen(false)}>
              <ObLogo />
            </Link>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              className="h-11 w-11 -mr-2 grid place-items-center text-panel-text hover:text-white"
            >
              <Ic.x className="h-5 w-5" />
            </button>
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
                        "w-full flex items-center gap-3 rounded-xl2 px-3 py-3 text-[15px] font-semibold transition-colors " +
                        (on
                          ? "bg-panel-hover text-white"
                          : "text-panel-text hover:text-white hover:bg-panel-hover/60")
                      }
                    >
                      <Icon className={"h-[18px] w-[18px] " + (on ? "text-teal-300" : "")} />
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
                    "w-full flex items-center gap-3 rounded-xl2 px-3 py-3 text-[15px] font-semibold transition-colors " +
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

          {user && (
            <div className="m-3 mt-2 flex items-center gap-3 rounded-xl2 px-3 py-3 border-t border-panel-line/60">
              <div className="h-10 w-10 rounded-full bg-teal-500 text-white grid place-items-center font-bold text-[13px]">
                {initials || "U"}
              </div>
              <div className="leading-tight min-w-0 flex-1">
                <p className="font-semibold text-[14px] text-white truncate">
                  {user.fullName ?? user.firstName ?? "You"}
                </p>
                <p className="text-[12px] text-panel-dim truncate">
                  {user.primaryEmailAddress?.emailAddress ?? ""}
                </p>
              </div>
            </div>
          )}
        </aside>
      </div>
    </>
  );
}

function Hamburger() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  );
}
