/**
 * Test the CAPTCHA completion flow against the Reddit application that's
 * currently in `awaitingCode` status. Hits /api/complete-with-code with the
 * SCRAPE_TOKEN bearer auth — the route will fetch the code from Gmail,
 * reopen a Browserbase session, refill the Reddit form, type the code,
 * and click Submit.
 */
async function main() {
  const url = process.env.URL ?? "https://onbehalfai.vercel.app";
  const token = process.env.SCRAPE_TOKEN ?? process.env.CRON_SECRET;
  if (!token) {
    console.error("Set SCRAPE_TOKEN or CRON_SECRET in env.");
    process.exit(1);
  }

  console.log(`POST ${url}/api/complete-with-code`);
  const res = await fetch(`${url}/api/complete-with-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  });
  const text = await res.text();
  console.log("status:", res.status);
  console.log("body:", text);
  process.exit(res.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
