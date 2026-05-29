export type Status =
  | "queued"
  | "tailoring"
  | "pending"
  | "submitting"
  | "submitted"
  | "confirmed"
  | "failed"
  | "needsHuman"
  | "draft";

export type Confidence = "high" | "medium" | "low";

export type Job = {
  id: string;
  company: string;
  role: string;
  location: string;
  salary: string;
  score: number;
  posted: string;
  summary: string;
  jd: string[];
};

export type QueueItem = {
  id: string;
  company: string;
  role: string;
  score: number;
  status: Status;
  time: string;
  via: string;
  note: string;
};

export type GmailItem = {
  sender: string;
  from: string;
  subject: string;
  preview: string;
  time: string;
};

export type DiffKind = "keep" | "add" | "remove";

export type DiffSegmentT = {
  k: DiffKind;
  t: string;
  r?: string;
};

export type ScreenerQ = {
  q: string;
  a: string;
  confidence: Confidence;
};

export type TimelineStage = {
  stage: Status | "tailored" | "approved";
  label: string;
  time: string;
  desc: string;
  icon: string;
};

export type SkillYear = {
  skill: string;
  years: number;
  level: "Beginner" | "Intermediate" | "Advanced" | "Expert";
};

export type Company = {
  name: string;
  industry: string;
  size: string;
};

export type ResumeSectionType =
  | "summary"
  | "experience"
  | "education"
  | "skills"
  | "projects"
  | "certifications"
  | "publications"
  | "awards"
  | "other";

export type ParsedResumeContact = {
  name: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedin: string | null;
  github: string | null;
  portfolio: string | null;
};

export type ParsedResumeSection = {
  type: ResumeSectionType;
  title: string;
  organization: string | null;
  start_date: string | null;
  end_date: string | null;
  bullets: string[];
  tags: string[];
};

export type ParsedResumeSkill = {
  skill: string;
  years: number | null;
  level: "Beginner" | "Intermediate" | "Advanced" | "Expert" | null;
};

export type ParsedResume = {
  contact: ParsedResumeContact;
  summary: string | null;
  sections: ParsedResumeSection[];
  skills: ParsedResumeSkill[];
};

export type TrackerRow = {
  id: string;
  n: number;
  company: Company;
  role: string;
  location: string;
  salary: string;
  appliedAt: Date;
  appliedAtLabel: string;
  applyUrl: string;
  jdTextClean: string;
  resumeFile: string;
  coverLetterText: string;
  changes: string;
  changesCount: number;
  status: Status;
  matchScore: number;
  confirmation: string | null;
};
