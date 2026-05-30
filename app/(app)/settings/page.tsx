import { eq } from "drizzle-orm";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import { profile, user as userTable } from "@/lib/db/schema";
import SettingsScreen, { type SettingsData } from "./client";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="max-w-[760px] mx-auto px-9 py-16">
        <div className="bg-white rounded-xl3 border border-sand-200 ob-card-shadow p-8 text-center">
          <p>Please sign in.</p>
        </div>
      </div>
    );
  }

  const email = user.email;
  const memberSince = new Date(user.createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const [[p], [u]] = await Promise.all([
    db
      .select({
        fullName: profile.fullName,
        preferredName: profile.preferredName,
        phone: profile.phone,
        location: profile.location,
        linkedinUrl: profile.linkedinUrl,
        githubUrl: profile.githubUrl,
        portfolioUrl: profile.portfolioUrl,
        targetRoleTitles: profile.targetRoleTitles,
        preferredLocations: profile.preferredLocations,
        excludedCompanies: profile.excludedCompanies,
        desiredSalaryMin: profile.desiredSalaryMin,
        totalYearsExperience: profile.totalYearsExperience,
        seniorityLevel: profile.seniorityLevel,
        workAuthorization: profile.workAuthorization,
        needsSponsorship: profile.needsSponsorship,
        employmentRestrictions: profile.employmentRestrictions,
        previouslyWorkedHere: profile.previouslyWorkedHere,
        countryOfResidence: profile.countryOfResidence,
        countryOfWork: profile.countryOfWork,
        accommodationsNeeded: profile.accommodationsNeeded,
        voiceSample: profile.voiceSample,
        eeoGender: profile.eeoGender,
        eeoHispanicLatino: profile.eeoHispanicLatino,
        eeoRaceEthnicity: profile.eeoRaceEthnicity,
        eeoVeteranStatus: profile.eeoVeteranStatus,
        eeoDisabilityStatus: profile.eeoDisabilityStatus,
        eeoSexualOrientation: profile.eeoSexualOrientation,
        currentCompany: profile.currentCompany,
        currentJobTitle: profile.currentJobTitle,
        currentlyAuthorizedUS: profile.currentlyAuthorizedUS,
        resumeFileName: profile.resumeFileName,
      })
      .from(profile)
      .where(eq(profile.userId, user.id))
      .limit(1),
    db
      .select({ gmailConnectedAt: userTable.gmailConnectedAt })
      .from(userTable)
      .where(eq(userTable.id, user.id))
      .limit(1),
  ]);

  const data: SettingsData = {
    email,
    memberSince,
    plan: "Free",
    gmailConnectedAt: u?.gmailConnectedAt
      ? new Date(u.gmailConnectedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })
      : null,
    profile: {
      fullName: p?.fullName ?? "",
      preferredName: p?.preferredName ?? "",
      phone: p?.phone ?? "",
      location: p?.location ?? "",
      linkedinUrl: p?.linkedinUrl ?? "",
      githubUrl: p?.githubUrl ?? "",
      portfolioUrl: p?.portfolioUrl ?? "",
      targetRoleTitles: p?.targetRoleTitles ?? [],
      preferredLocations: p?.preferredLocations ?? [],
      excludedCompanies: p?.excludedCompanies ?? [],
      desiredSalaryMin: p?.desiredSalaryMin ?? null,
      totalYearsExperience: p?.totalYearsExperience ?? null,
      seniorityLevel: p?.seniorityLevel ?? null,
      workAuthorization: p?.workAuthorization ?? null,
      needsSponsorship: p?.needsSponsorship ?? null,
      employmentRestrictions: p?.employmentRestrictions ?? false,
      previouslyWorkedHere: p?.previouslyWorkedHere ?? false,
      countryOfResidence: p?.countryOfResidence ?? "",
      countryOfWork: p?.countryOfWork ?? "",
      accommodationsNeeded: p?.accommodationsNeeded ?? "",
      voiceSample: p?.voiceSample ?? "",
      eeoGender: p?.eeoGender ?? "decline",
      eeoHispanicLatino: p?.eeoHispanicLatino ?? "decline",
      eeoRaceEthnicity: p?.eeoRaceEthnicity ?? "decline",
      eeoVeteranStatus: p?.eeoVeteranStatus ?? "decline",
      eeoDisabilityStatus: p?.eeoDisabilityStatus ?? "decline",
      eeoSexualOrientation: p?.eeoSexualOrientation ?? "decline",
      currentCompany: p?.currentCompany ?? "",
      currentJobTitle: p?.currentJobTitle ?? "",
      currentlyAuthorizedUS: p?.currentlyAuthorizedUS ?? true,
      resumeFileName: p?.resumeFileName ?? null,
    },
  };

  return <SettingsScreen data={data} />;
}
