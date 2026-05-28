import type { SVGProps } from "react";

export type IconName =
  | "home"
  | "search"
  | "list"
  | "check"
  | "check-circle"
  | "mail"
  | "user"
  | "settings"
  | "sparkles"
  | "sparkle"
  | "briefcase"
  | "arrow-right"
  | "arrow-up"
  | "plus"
  | "minus"
  | "x"
  | "upload"
  | "file"
  | "file-text"
  | "edit"
  | "clock"
  | "bolt"
  | "shield"
  | "globe"
  | "chevron-down"
  | "chevron-up"
  | "chevron-left"
  | "chevron-right"
  | "paper-plane"
  | "lightning-bolt"
  | "gauge"
  | "cards"
  | "play"
  | "eye"
  | "external"
  | "external-link"
  | "download"
  | "g-mail"
  | "lock"
  | "menu-dots"
  | "pin"
  | "star"
  | "layout-dashboard"
  | "table-2"
  | "help-circle"
  | "bell"
  | "refresh-cw"
  | "calendar"
  | "filter-x"
  | "inbox"
  | "info"
  | "git-pull-request"
  | "link"
  | "tag"
  | "archive"
  | "alert-circle"
  | "loader-2"
  | "rocket"
  | "zap"
  | "shield-check"
  | "trash"
  | "credit-card"
  | "log-out"
  | "users"
  | "trending-up"
  | "pencil"
  | "thumbs-up"
  | "linkedin"
  | "github"
  | "twitter";

type IconProps = SVGProps<SVGSVGElement> & {
  name: IconName;
  size?: number;
  strokeWidth?: number;
};

export function Icon({ name, size = 16, strokeWidth = 1.5, className = "", ...rest }: IconProps) {
  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
    ...rest,
  };

  switch (name) {
    case "home":
      return <svg {...props}><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" /></svg>;
    case "search":
      return <svg {...props}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
    case "list":
      return <svg {...props}><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>;
    case "check":
      return <svg {...props}><path d="m20 6-11 11L4 12" /></svg>;
    case "check-circle":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>;
    case "mail":
    case "g-mail":
      return <svg {...props}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 7 9-7" /></svg>;
    case "user":
      return <svg {...props}><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 4-6 8-6s8 2 8 6" /></svg>;
    case "users":
      return <svg {...props}><circle cx="9" cy="8" r="4" /><path d="M2 21c0-4 3.5-6 7-6s7 2 7 6" /><circle cx="17" cy="9" r="3" /><path d="M22 20c0-3-2-5-5-5" /></svg>;
    case "settings":
      return <svg {...props}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1A2 2 0 1 1 4.4 17l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8L4.2 7A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1A2 2 0 1 1 19.7 7l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>;
    case "sparkles":
    case "sparkle":
      return <svg {...props}><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" /><path d="M12 8c0 2-2 4-4 4 2 0 4 2 4 4 0-2 2-4 4-4-2 0-4-2-4-4Z" /></svg>;
    case "briefcase":
      return <svg {...props}><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M3 13h18" /></svg>;
    case "arrow-right":
      return <svg {...props}><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>;
    case "arrow-up":
      return <svg {...props}><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></svg>;
    case "plus":
      return <svg {...props}><path d="M12 5v14M5 12h14" /></svg>;
    case "minus":
      return <svg {...props}><path d="M5 12h14" /></svg>;
    case "x":
      return <svg {...props}><path d="M18 6 6 18M6 6l12 12" /></svg>;
    case "upload":
      return <svg {...props}><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" /></svg>;
    case "file":
      return <svg {...props}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></svg>;
    case "file-text":
      return <svg {...props}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /><path d="M8 13h8M8 17h6" /></svg>;
    case "edit":
    case "pencil":
      return <svg {...props}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
    case "clock":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "bolt":
    case "lightning-bolt":
    case "zap":
      return <svg {...props}><path d="m13 2-9 12h7l-1 8 9-12h-7z" /></svg>;
    case "shield":
      return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></svg>;
    case "shield-check":
      return <svg {...props}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /><path d="m9 12 2 2 4-4" /></svg>;
    case "globe":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>;
    case "chevron-down":
      return <svg {...props}><path d="m6 9 6 6 6-6" /></svg>;
    case "chevron-up":
      return <svg {...props}><path d="m6 15 6-6 6 6" /></svg>;
    case "chevron-left":
      return <svg {...props}><path d="m15 6-6 6 6 6" /></svg>;
    case "chevron-right":
      return <svg {...props}><path d="m9 6 6 6-6 6" /></svg>;
    case "paper-plane":
      return <svg {...props}><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4Z" /></svg>;
    case "gauge":
      return <svg {...props}><path d="M12 14 9 9" /><circle cx="12" cy="13" r="9" /><path d="M3 13a9 9 0 0 1 18 0" /></svg>;
    case "cards":
      return <svg {...props}><rect x="3" y="6" width="13" height="14" rx="2" /><path d="M8 3h11a2 2 0 0 1 2 2v11" /></svg>;
    case "play":
      return <svg {...props}><path d="m7 4 14 8L7 20Z" /></svg>;
    case "eye":
      return <svg {...props}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></svg>;
    case "external":
    case "external-link":
      return <svg {...props}><path d="M14 4h6v6" /><path d="M20 4 10 14" /><path d="M20 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" /></svg>;
    case "download":
      return <svg {...props}><path d="M12 4v12" /><path d="m7 12 5 5 5-5" /><path d="M4 20h16" /></svg>;
    case "lock":
      return <svg {...props}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>;
    case "menu-dots":
      return <svg {...props}><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>;
    case "pin":
      return <svg {...props}><path d="M12 22V12" /><path d="M5 9c0-3 3-7 7-7s7 4 7 7c0 1.5-1 3-2 3H7c-1 0-2-1.5-2-3Z" /></svg>;
    case "star":
      return <svg {...props}><path d="m12 3 2.7 5.7 6.3.9-4.5 4.4 1 6.3L12 17.8 6.5 20.3l1-6.3L3 9.6l6.3-.9Z" /></svg>;
    case "layout-dashboard":
      return <svg {...props}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>;
    case "table-2":
      return <svg {...props}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 4v16" /></svg>;
    case "help-circle":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.8.3-1 1-1 1.7" /><path d="M12 17h.01" /></svg>;
    case "bell":
      return <svg {...props}><path d="M6 9a6 6 0 0 1 12 0v4l1.5 3h-15L6 13Z" /><path d="M10 20a2 2 0 0 0 4 0" /></svg>;
    case "refresh-cw":
      return <svg {...props}><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M8 16H3v5" /></svg>;
    case "calendar":
      return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 11h18" /></svg>;
    case "filter-x":
      return <svg {...props}><path d="M3 5h18M6 12h12M10 19h4" /><path d="m18 5 4 4M22 5l-4 4" /></svg>;
    case "inbox":
      return <svg {...props}><path d="M22 13H16l-2 3h-4l-2-3H2" /><path d="M5 4h14l3 9v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6Z" /></svg>;
    case "info":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></svg>;
    case "git-pull-request":
      return <svg {...props}><circle cx="6" cy="6" r="3" /><circle cx="6" cy="18" r="3" /><path d="M6 9v6" /><path d="M13 6h3a2 2 0 0 1 2 2v7" /><circle cx="18" cy="18" r="3" /></svg>;
    case "link":
      return <svg {...props}><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 1 0 5.7 5.7l1-1" /></svg>;
    case "tag":
      return <svg {...props}><path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9z" /><circle cx="7" cy="7" r="1.5" /></svg>;
    case "archive":
      return <svg {...props}><rect x="2" y="4" width="20" height="5" rx="1.5" /><path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" /><path d="M9 13h6" /></svg>;
    case "alert-circle":
      return <svg {...props}><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5h.01" /></svg>;
    case "loader-2":
      return <svg {...props}><path d="M21 12a9 9 0 1 1-6.2-8.6" /></svg>;
    case "rocket":
      return <svg {...props}><path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2.1 0-2.9a2.1 2.1 0 0 0-3-.1Z" /><path d="M12 15 9 12a11 11 0 0 1 4-8 6 6 0 0 1 6-1 6 6 0 0 1-1 6 11 11 0 0 1-8 4Z" /><circle cx="15" cy="9" r="1" /></svg>;
    case "trash":
      return <svg {...props}><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>;
    case "credit-card":
      return <svg {...props}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>;
    case "log-out":
      return <svg {...props}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>;
    case "trending-up":
      return <svg {...props}><path d="m3 17 6-6 4 4 8-8" /><path d="M14 7h7v7" /></svg>;
    case "thumbs-up":
      return <svg {...props}><path d="M7 22V11" /><path d="M7 11h10a3 3 0 0 1 3 3l-1 5a3 3 0 0 1-3 2H7" /><path d="M7 11 11 2a3 3 0 0 1 3 3v6" /></svg>;
    case "linkedin":
      return <svg {...props}><rect x="2" y="2" width="20" height="20" rx="3" /><path d="M7 10v7M7 7v.01M11 17v-5a2 2 0 0 1 4 0v5M11 17v-7" /></svg>;
    case "github":
      return <svg {...props}><path d="M9 19c-4 1.5-4-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C7.4 2.8 6.4 3 6.4 3a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 5 9.5c0 4.6 2.7 5.6 5.5 6-.6.6-.6 1.2-.5 2V21" /></svg>;
    case "twitter":
      return <svg {...props}><path d="M22 6c-1 .5-2 .8-3 1a4.5 4.5 0 0 0-7.8 4 12.7 12.7 0 0 1-9.2-4.7c-1.4 2.4-.7 5.5 1.6 7-1 0-2-.3-2.8-.7v.1c0 2.4 1.7 4.4 4 4.9-.6.1-1.3.2-2 .1.6 1.8 2.2 3 4.1 3a9 9 0 0 1-5.6 1.9c-.4 0-.7 0-1-.1A12.7 12.7 0 0 0 7 22c8.3 0 12.8-6.9 12.8-12.8v-.6A9 9 0 0 0 22 6Z" /></svg>;
    default:
      return null;
  }
}
