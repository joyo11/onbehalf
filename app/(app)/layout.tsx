import { ObSidebar } from "@/components/ob/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-cream">
      <ObSidebar />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
