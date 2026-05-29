export type SubmissionProfile = {
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  workAuthorization: string | null;
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
  ats: "greenhouse" | "lever" | "unknown";
  steps: SubmissionStep[];
  finalUrl: string;
  liveViewUrl: string;
  realSubmitted: boolean;
  error: string | null;
};
