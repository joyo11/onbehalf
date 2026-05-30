/**
 * Snapshot test for the abstain decisions added in Phase 2B (final
 * batch). Each test case is a pure call into the abstain-check
 * helpers — no browser, no LLM. The result gets snapshotted to
 * tests/snapshots/abstain-cases.json. Re-running diffs.
 *
 * Usage:
 *   tsx scripts/snapshot-abstain.ts          — verify
 *   tsx scripts/snapshot-abstain.ts --update — overwrite
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  classifyFileInput,
  isOtherStylePick,
  parseCityForResolver,
} from "../lib/submit/abstain-checks";

const SNAPSHOT_PATH = "tests/snapshots/abstain-cases.json";

type CaseResult = { name: string; input: unknown; output: unknown };

const cases: CaseResult[] = [];

// ── (2) City needs state/country before we attempt autocomplete ─────────
function cityCase(name: string, location: string | null) {
  cases.push({
    name: `city/${name}`,
    input: { location },
    output: parseCityForResolver(location),
  });
}
cityCase("brooklyn-no-state", "Brooklyn");
cityCase("brooklyn-with-state", "Brooklyn, NY");
cityCase("new-york-full", "New York, New York, USA");
cityCase("null-location", null);
cityCase("empty-string", "");
cityCase("trailing-comma", "Brooklyn,");
cityCase("city-comma-country", "London, UK");

// ── (1) Other-style picks ────────────────────────────────────────────────
function otherCase(name: string, value: string) {
  cases.push({
    name: `other/${name}`,
    input: { value },
    output: { isOther: isOtherStylePick(value) },
  });
}
otherCase("plain-other", "Other");
otherCase("other-with-paren", "Other (please specify)");
otherCase("prefer-not-to-say", "Prefer not to say");
otherCase("rather-not-specify", "I'd rather not specify");
otherCase("none-of-the-above", "None of the above");
otherCase("something-else", "Something else");
// negatives — substantive options must NOT flag
otherCase("yes", "Yes");
otherCase("software-engineer", "Software Engineer");
otherCase("asian", "Asian");
otherCase("decline-real-eeo", "Decline to self-identify"); // real EEO option, NOT a junk catch-all

// ── (4) Classify file inputs ─────────────────────────────────────────────
function fileCase(
  name: string,
  meta: { name?: string | null; id?: string | null; label?: string | null },
) {
  cases.push({
    name: `file/${name}`,
    input: meta,
    output: { kind: classifyFileInput(meta) },
  });
}
fileCase("resume-by-name", { name: "resume", id: null, label: null });
fileCase("resume-by-label", { name: null, id: null, label: "Resume / CV" });
fileCase("cv-keyword", { name: null, id: null, label: "Upload your CV" });
fileCase("cover-letter-by-name", { name: "cover_letter", id: null, label: null });
fileCase("cover-letter-by-label", { name: "file_2", id: null, label: "Cover Letter" });
fileCase("transcript", { name: "transcript", id: null, label: "Academic Transcript" });
fileCase("portfolio", { name: null, id: null, label: "Portfolio (PDF)" });
fileCase("work-sample", { name: "work_sample", id: null, label: "Work sample" });
fileCase("unlabelled", { name: null, id: null, label: null });

function stableJson(): string {
  return (
    JSON.stringify(
      [...cases].sort((a, b) => a.name.localeCompare(b.name)),
      null,
      2,
    ) + "\n"
  );
}

function summarize(): { totalCases: number; abstain: number; allow: number } {
  let abstain = 0;
  let allow = 0;
  for (const c of cases) {
    const out = c.output as Record<string, unknown>;
    if (c.name.startsWith("city/")) {
      const ok = (out as { ok?: boolean }).ok;
      if (ok === false) abstain++;
      else allow++;
    } else if (c.name.startsWith("other/")) {
      if ((out as { isOther?: boolean }).isOther) abstain++;
      else allow++;
    } else if (c.name.startsWith("file/")) {
      if ((out as { kind?: string }).kind === "unknown") abstain++;
      else allow++;
    }
  }
  return { totalCases: cases.length, abstain, allow };
}

function main(): number {
  const update = process.argv.includes("--update");
  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });

  const next = stableJson();
  const summary = summarize();

  console.log(
    `\nabstain snapshot — ${summary.totalCases} cases · ${summary.abstain} abstain · ${summary.allow} allow`,
  );

  if (!existsSync(SNAPSHOT_PATH)) {
    writeFileSync(SNAPSHOT_PATH, next);
    console.log(`→ snapshot CREATED at ${SNAPSHOT_PATH}`);
    return 0;
  }

  const prev = readFileSync(SNAPSHOT_PATH, "utf8");
  if (prev.trim() === next.trim()) {
    console.log(`✓ snapshot MATCHES (${SNAPSHOT_PATH})`);
    return 0;
  }

  if (update) {
    writeFileSync(SNAPSHOT_PATH, next);
    console.log(`→ snapshot UPDATED at ${SNAPSHOT_PATH}`);
    return 0;
  }

  console.log(`✗ snapshot CHANGED. Run with --update to overwrite.`);
  return 1;
}

process.exit(main());
