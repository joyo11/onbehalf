import { and, eq, isNull, ne } from "drizzle-orm";
import { db } from "./db/client";
import { application, job, type Application } from "./db/schema";
import { gmailForUser, listConfirmationCandidates, type GmailMessageSummary } from "./gmail";

export type MatchOutcome = {
  emailId: string;
  matched: boolean;
  applicationId: string | null;
  reason: string;
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function companyMatch(email: GmailMessageSummary, companyName: string): boolean {
  const c = normalize(companyName);
  if (!c) return false;
  const haystack = normalize(`${email.subject} ${email.snippet} ${email.from}`);
  // Match on company name appearing as a whole token
  return new RegExp(`\\b${c}\\b`).test(haystack);
}

/**
 * Find ATS confirmation emails for this user, match them to submitted-but-not-
 * yet-confirmed applications, and mark matched applications as `confirmed`.
 */
export async function matchAndConfirm(userId: string): Promise<{
  scanned: number;
  matched: number;
  outcomes: MatchOutcome[];
}> {
  // Pull the user's refresh token
  const userRow = await db.query.user
    .findFirst({ where: (u, { eq }) => eq(u.id, userId) })
    .catch(() => null);
  if (!userRow?.gmailRefreshToken) {
    throw new Error("Gmail is not connected for this user.");
  }

  const gmail = gmailForUser(userRow.gmailRefreshToken);
  const messages = await listConfirmationCandidates(gmail);

  // Pull all of the user's applications that are submitted but not yet confirmed
  const candidates = await db
    .select({
      app: application,
      jobRow: job,
    })
    .from(application)
    .innerJoin(job, eq(application.jobId, job.id))
    .where(
      and(
        eq(application.userId, userId),
        ne(application.status, "confirmed"),
        isNull(application.confirmedAt),
      ),
    );

  const outcomes: MatchOutcome[] = [];
  let matchedCount = 0;
  const consumedAppIds = new Set<string>();

  for (const email of messages) {
    // Skip explicit rejection / interview emails (lightweight heuristic)
    const subj = email.subject.toLowerCase();
    if (/reject|unfortunately|not moving|not move|interview|next steps/.test(subj)) {
      outcomes.push({
        emailId: email.id,
        matched: false,
        applicationId: null,
        reason: "skipped (looks like rejection or interview)",
      });
      continue;
    }

    // Try to find an application this email belongs to
    let best: (typeof candidates)[number] | null = null;
    let bestScore = 0;
    for (const c of candidates) {
      if (consumedAppIds.has(c.app.id)) continue;
      let score = 0;
      if (companyMatch(email, c.jobRow.company)) score += 10;
      // Bonus for ATS sender domain matching the job's source
      if (c.jobRow.source === "greenhouse" && email.fromDomain.includes("greenhouse")) score += 3;
      if (c.jobRow.source === "lever" && email.fromDomain.includes("lever")) score += 3;
      if (c.jobRow.source === "ashby" && email.fromDomain.includes("ashby")) score += 3;
      // Only consider applications whose submit predates the email
      if (c.app.submittedAt && c.app.submittedAt.getTime() <= email.receivedAt.getTime() + 60_000) {
        score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }

    if (best && bestScore >= 10) {
      await db
        .update(application)
        .set({
          status: "confirmed",
          confirmationEmailId: email.id,
          confirmedAt: email.receivedAt,
        })
        .where(eq(application.id, best.app.id));
      consumedAppIds.add(best.app.id);
      matchedCount += 1;
      outcomes.push({
        emailId: email.id,
        matched: true,
        applicationId: best.app.id,
        reason: `matched ${best.jobRow.company} (score ${bestScore})`,
      });
    } else {
      outcomes.push({
        emailId: email.id,
        matched: false,
        applicationId: null,
        reason: "no application matched",
      });
    }
  }

  return {
    scanned: messages.length,
    matched: matchedCount,
    outcomes,
  };
}

// Suppress unused-import warning on Application — re-exported for future
// consumers (Vercel cron, admin tools).
export type { Application };
