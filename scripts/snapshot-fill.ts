/**
 * Snapshot harness for the form-fill detector.
 *
 * Navigates to a job URL via Browserbase, waits for the React form to
 * mount, then asks: which visible required fields does our current
 * detector catch, and which does it miss?
 *
 * Output goes to `tests/snapshots/<slug>.json`. Re-running compares
 * against the saved snapshot and exits non-zero on diff (use --update
 * to overwrite). This is the harness for verifying Phase 2B (broader
 * required detection) lands without regressing other forms.
 *
 * Usage:
 *   tsx scripts/snapshot-fill.ts <slug> <url>           — verify
 *   tsx scripts/snapshot-fill.ts <slug> <url> --update  — overwrite
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { startSession } from "../lib/submit/browserbase";

const SNAPSHOT_DIR = "tests/snapshots";

type DetectedField = {
  tag: string;
  name: string | null;
  id: string | null;
  label: string;
};

type MissedField = DetectedField & {
  required: boolean;
  ariaRequired: string | null;
  labelEndsWithStar: boolean;
  inRequiredParent: boolean;
};

type Snapshot = {
  url: string;
  capturedAt: string;
  detectedCount: number;
  missedCount: number;
  detected: DetectedField[];
  missed: MissedField[];
};

async function captureFormDetection(url: string): Promise<Snapshot> {
  const session = await startSession();
  try {
    await session.page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await session.page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
    // Let the React form mount.
    await session.page
      .waitForSelector("input[name='first_name'], input[type='email'], textarea, input[type='file']", {
        timeout: 12_000,
      })
      .catch(() => {});
    await session.page.waitForTimeout(1_500);

    // Pass the body as a string so tsx/esbuild doesn't __name-decorate
    // anything inside it (Playwright's page.evaluate accepts strings).
    const result = (await session.page.evaluate(
      `(() => {
        var isVisible = function (el) {
          if (!(el instanceof HTMLElement)) return false;
          var r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return false;
          var cs = window.getComputedStyle(el);
          return cs.display !== 'none' && cs.visibility !== 'hidden' && cs.opacity !== '0';
        };

        var findLabel = function (el) {
          if (el.id) {
            var l = document.querySelector("label[for='" + CSS.escape(el.id) + "']");
            if (l && l.textContent) return l.textContent.trim().slice(0, 200);
          }
          var wrap = el.closest('label');
          if (wrap && wrap.textContent) return wrap.textContent.trim().slice(0, 200);
          var aria = el.getAttribute('aria-label');
          if (aria) return aria.trim();
          var p = el.parentElement;
          for (var i = 0; i < 4 && p; i++) {
            var heading = p.querySelector('label, legend, .question, .label, h3, h4');
            if (heading && heading.textContent && heading.textContent.trim()) {
              return heading.textContent.trim().slice(0, 200);
            }
            p = p.parentElement;
          }
          return '';
        };

        // Selector mirror of fillEmptyRequiredTextInputs (Phase 2B
        // broadened this from native [required] to also catch
        // aria-required, .required parents, and all visible textareas).
        var detectedAll = document.querySelectorAll(
          "input[required][type='text'], input[required]:not([type]), " +
          "input[aria-required='true'][type='text'], input[aria-required='true']:not([type]), " +
          "input[type='text'][class*='required' i], input:not([type])[class*='required' i], " +
          "textarea[required], textarea[aria-required='true'], textarea"
        );
        var detected = [];
        for (var i = 0; i < detectedAll.length; i++) {
          var el = detectedAll[i];
          if (!isVisible(el)) continue;
          detected.push({
            tag: el.tagName.toLowerCase(),
            name: el.getAttribute('name'),
            id: el.id || null,
            label: findLabel(el),
          });
        }

        // Every visible textarea + non-trivial text input that LOOKS
        // required by ANY signal — attribute, aria-required, label *,
        // or parent flagged required.
        var allCandidates = document.querySelectorAll(
          "textarea, input[type='text'], input:not([type])"
        );
        var candidates = [];
        for (var j = 0; j < allCandidates.length; j++) {
          var c = allCandidates[j];
          if (!isVisible(c)) continue;
          var label = findLabel(c);
          var ariaRequired = c.getAttribute('aria-required');
          var required = !!c.required;
          var labelEndsWithStar = /\\*\\s*$/.test(label);
          var parentRequired = !!c.closest("[class*='required' i], [data-required]");
          var looksRequired = required || ariaRequired === 'true' || labelEndsWithStar || parentRequired;
          if (!looksRequired) continue;
          candidates.push({
            tag: c.tagName.toLowerCase(),
            name: c.getAttribute('name'),
            id: c.id || null,
            label: label,
            required: required,
            ariaRequired: ariaRequired,
            labelEndsWithStar: labelEndsWithStar,
            inRequiredParent: parentRequired,
          });
        }

        var detectedKeys = {};
        for (var k = 0; k < detected.length; k++) {
          var d = detected[k];
          detectedKeys[d.tag + '|' + (d.name || '') + '|' + (d.id || '')] = true;
        }
        var missed = [];
        for (var m = 0; m < candidates.length; m++) {
          var cand = candidates[m];
          var key = cand.tag + '|' + (cand.name || '') + '|' + (cand.id || '');
          if (!detectedKeys[key]) missed.push(cand);
        }
        return { detected: detected, missed: missed };
      })()` as unknown as () => { detected: DetectedField[]; missed: MissedField[] },
    )) as { detected: DetectedField[]; missed: MissedField[] };

    return {
      url,
      capturedAt: new Date().toISOString(),
      detectedCount: result.detected.length,
      missedCount: result.missed.length,
      detected: result.detected,
      missed: result.missed,
    };
  } finally {
    await session.close();
  }
}

function stableJson(snap: Snapshot): string {
  // Don't write capturedAt into the diff'd file — pure structural snapshot.
  const stripped = {
    url: snap.url,
    detectedCount: snap.detectedCount,
    missedCount: snap.missedCount,
    detected: [...snap.detected].sort((a, b) =>
      (a.label || a.name || "").localeCompare(b.label || b.name || ""),
    ),
    missed: [...snap.missed].sort((a, b) =>
      (a.label || a.name || "").localeCompare(b.label || b.name || ""),
    ),
  };
  return JSON.stringify(stripped, null, 2) + "\n";
}

function jsonEqual(a: string, b: string): boolean {
  return a.trim() === b.trim();
}

async function main() {
  const [, , slug, url, ...rest] = process.argv;
  if (!slug || !url) {
    console.error("usage: snapshot-fill.ts <slug> <url> [--update]");
    process.exit(2);
  }
  const update = rest.includes("--update");
  const path = `${SNAPSHOT_DIR}/${slug}.json`;
  mkdirSync(dirname(path), { recursive: true });

  console.log(`capturing ${url}…`);
  const snap = await captureFormDetection(url);
  const next = stableJson(snap);

  console.log(`\n=== ${slug} ===`);
  console.log(`detected:  ${snap.detectedCount}`);
  console.log(`missed:    ${snap.missedCount}`);
  if (snap.missed.length > 0) {
    console.log("\nmissed required fields (Phase 2B targets):");
    for (const m of snap.missed) {
      const signals: string[] = [];
      if (m.ariaRequired === "true") signals.push("aria-required");
      if (m.labelEndsWithStar) signals.push("label*");
      if (m.inRequiredParent) signals.push("parent.required");
      if (m.required) signals.push("attr-required");
      console.log(
        `  • [${m.tag}] ${m.label.slice(0, 70) || `name=${m.name}`}  (${signals.join(", ")})`,
      );
    }
  }

  if (!existsSync(path)) {
    writeFileSync(path, next);
    console.log(`\n→ snapshot CREATED at ${path}`);
    process.exit(0);
  }

  const prev = readFileSync(path, "utf8");
  if (jsonEqual(prev, next)) {
    console.log(`\n✓ snapshot MATCHES (${path})`);
    process.exit(0);
  }

  if (update) {
    writeFileSync(path, next);
    console.log(`\n→ snapshot UPDATED at ${path}`);
    process.exit(0);
  }

  console.log(`\n✗ snapshot CHANGED from ${path}`);
  console.log("   run with --update to overwrite");
  // Print a tight diff summary
  const prevSnap = JSON.parse(prev) as { detectedCount: number; missedCount: number };
  console.log(
    `   detected ${prevSnap.detectedCount} → ${snap.detectedCount}  ·  missed ${prevSnap.missedCount} → ${snap.missedCount}`,
  );
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
