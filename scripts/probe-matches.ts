import { findMatchingJobs } from "../lib/jobs/queries";

async function main() {
  // No filters — exercises the bare /matches page path. The page caps
  // limit at 50 by default.
  const out = await findMatchingJobs({ limit: 50 });
  console.log("findMatchingJobs({ limit: 50 }) returned:", out.length, "jobs");
  process.exit(0);
}
main();
