import { eq } from "drizzle-orm";
import Link from "next/link";
import { Card, SectionLabel } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { profile, resumeSection } from "@/lib/db/schema";
import GoClient from "./client";

export default async function GoPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (
      <div className="px-10 py-9">
        <Card className="p-8 text-center">Please sign in.</Card>
      </div>
    );
  }

  const [profileRow, sections] = await Promise.all([
    db.select().from(profile).where(eq(profile.userId, user.id)).limit(1).then((r) => r[0]),
    db.select().from(resumeSection).where(eq(resumeSection.userId, user.id)),
  ]);

  if (!profileRow || sections.length === 0) {
    return (
      <div className="px-10 py-16 max-w-[680px] mx-auto">
        <Card className="p-8 text-center">
          <Icon name="alert-circle" size={22} className="text-warning mx-auto" />
          <h2 className="text-[17px] font-semibold mt-3">No resume on file yet</h2>
          <p className="text-[13.5px] text-mute mt-2 max-w-md mx-auto">
            Go through onboarding first so we know who to apply for.
          </p>
          <div className="mt-5">
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-2 h-9 px-4 text-[13px] rounded-ctrl text-white font-medium"
              style={{ background: "var(--accent)" }}
            >
              Open onboarding <Icon name="arrow-right" size={13} />
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  const experienceCount = sections.filter((s) => s.type === "experience").length;
  const educationCount = sections.filter((s) => s.type === "education").length;
  const projectsCount = sections.filter((s) => s.type === "projects").length;
  const skillsObj = (profileRow.skillYears as Record<string, number | null>) ?? {};
  const skillsList = Object.keys(skillsObj).slice(0, 12);

  const summary = {
    name: profileRow.fullName ?? user.email.split("@")[0],
    email: user.email,
    phone: profileRow.phone,
    location: profileRow.location,
    linkedin: profileRow.linkedinUrl,
    github: profileRow.githubUrl,
    portfolio: profileRow.portfolioUrl,
    targetRoles: profileRow.targetRoleTitles,
    salaryMin: profileRow.desiredSalaryMin,
    locations: profileRow.preferredLocations,
    workAuth: profileRow.workAuthorization,
    remote: profileRow.openToRemote,
    hybrid: profileRow.openToHybrid,
    onsite: profileRow.openToOnsite,
    voiceSample: profileRow.voiceSample,
    resumeFileName: profileRow.resumeFileName,
    experienceCount,
    educationCount,
    projectsCount,
    skillsList,
    totalSkills: Object.keys(skillsObj).length,
  };

  return <GoClient summary={summary} />;
}
