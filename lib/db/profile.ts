import { eq } from "drizzle-orm";
import type { ParsedResume } from "../types";
import { db } from "./client";
import { profile, resumeSection, type User } from "./schema";

/**
 * Get the user's profile row, creating one if it doesn't exist.
 */
export async function getOrCreateProfile(user: User) {
  const [existing] = await db
    .select()
    .from(profile)
    .where(eq(profile.userId, user.id))
    .limit(1);
  if (existing) return existing;

  const [created] = await db.insert(profile).values({ userId: user.id }).returning();
  return created;
}

/**
 * Persist a parsed resume: update profile contact fields (without clobbering
 * anything the user already typed) and replace all resume_section rows.
 */
export async function saveParsedResume(user: User, parsed: ParsedResume) {
  const existing = await getOrCreateProfile(user);
  const c = parsed.contact;

  // Only fill profile fields that are currently empty — never overwrite
  // values the user typed in onboarding.
  await db
    .update(profile)
    .set({
      fullName: existing.fullName || c.name || null,
      phone: existing.phone || c.phone || null,
      location: existing.location || c.location || null,
      linkedinUrl: existing.linkedinUrl || c.linkedin || null,
      githubUrl: existing.githubUrl || c.github || null,
      portfolioUrl: existing.portfolioUrl || c.portfolio || null,
      skillYears:
        parsed.skills.length > 0
          ? Object.fromEntries(parsed.skills.map((s) => [s.skill, s.years ?? null]))
          : existing.skillYears,
      updatedAt: new Date(),
    })
    .where(eq(profile.id, existing.id));

  // Replace resume_section rows. We're treating the parsed result as the
  // source of truth on each upload.
  await db.delete(resumeSection).where(eq(resumeSection.userId, user.id));

  if (parsed.sections.length === 0) return;

  await db.insert(resumeSection).values(
    parsed.sections.map((s) => ({
      userId: user.id,
      type: s.type,
      title: s.title || s.organization || s.type,
      organization: s.organization,
      startDate: s.start_date,
      endDate: s.end_date,
      bullets: s.bullets,
      tags: s.tags,
    })),
  );
}
