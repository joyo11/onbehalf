export type SubmissionProfile = {
  fullName: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  email: string;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  workAuthorization: string | null;
  needsSponsorship: boolean;
  countryOfResidence: string | null;
  countryOfWork: string | null;
  employmentRestrictions: boolean;
  previouslyWorkedHere: boolean;
  accommodationsNeeded: string | null;
  eeoGender: string;
  eeoHispanicLatino: string;
  eeoRaceEthnicity: string;
  eeoVeteranStatus: string;
  eeoDisabilityStatus: string;
  eeoSexualOrientation: string;
  currentCompany: string | null;
  currentJobTitle: string | null;
  currentlyAuthorizedUS: boolean;
  skillYears: Record<string, number | null>;
  voiceSample: string | null;
  resumePdfBytes: Buffer | null;
  resumeFileName: string;
  coverLetter: string;
  screeners: Array<{ question: string; answer: string; confidence: string }>;
};

export type SubmissionStep = {
  step: string;
  detail: string;
  ok: boolean;
};

export type SubmissionResult = {
  ok: boolean;
  ats: "greenhouse" | "lever" | "ashby" | "unknown";
  steps: SubmissionStep[];
  finalUrl: string;
  liveViewUrl: string;
  realSubmitted: boolean;
  error: string | null;
};
