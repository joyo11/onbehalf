import { MobileTopBar } from "@/components/ob/mobile-nav";
import { ObSidebar } from "@/components/ob/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-cream">
      <ObSidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <MobileTopBar />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
