import { Sidebar } from "@/components/sidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-sand">
      <Sidebar />
      <main className="flex-1 min-w-0 ml-[244px]">
        <div className="anim-pop">{children}</div>
      </main>
    </div>
  );
}
