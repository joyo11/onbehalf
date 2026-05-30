import { eq } from "drizzle-orm";
import { db } from "../lib/db/client";
import { application, user } from "../lib/db/schema";

async function main() {
  const id = process.argv[2] ?? "5537b392-cc11-4fbd-a39c-5617e14be3a8";
  const [a] = await db.select().from(application).where(eq(application.id, id)).limit(1);
  if (!a) { console.log("not found"); process.exit(1); }
  console.log("before:", a.status, "attempts:", a.attempts);

  await db.update(application).set({ status: "queued" }).where(eq(application.id, id));
  console.log("flipped to queued");

  const [u] = await db.select().from(user).where(eq(user.id, a.userId)).limit(1);
  const baseUrl = process.env.URL ?? "https://onbehalfai.vercel.app";
  const token = process.env.SCRAPE_TOKEN ?? process.env.CRON_SECRET;
  console.log(`POST ${baseUrl}/api/process-queue ...`);
  const res = await fetch(`${baseUrl}/api/process-queue`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ userId: u!.id }),
  });
  console.log("status:", res.status);
  const text = await res.text();
  console.log("body (first 800):", text.slice(0, 800));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
