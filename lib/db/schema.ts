import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/* ---------------- Custom types ---------------- */

// pgvector — embeddings produced by text-embedding-3-small (1536 dims)
const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return "vector(1536)";
  },
  toDriver(value: number[]) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value: string) {
    return value
      .replace(/^\[|\]$/g, "")
      .split(",")
      .map(Number);
  },
});

/* ---------------- Enums ---------------- */

export const planEnum = pgEnum("plan", ["free", "pro", "unlimited"]);

export const applicationStatusEnum = pgEnum("application_status", [
  "queued",
  "tailoring",
  "pending",
  "submitting",
  "submitted",
  "confirmed",
  "failed",
  "needsHuman",
  "draft",
]);

export const resumeSectionTypeEnum = pgEnum("resume_section_type", [
  "summary",
  "experience",
  "education",
  "skills",
  "projects",
  "certifications",
  "publications",
  "awards",
  "other",
]);

export const jobSourceEnum = pgEnum("job_source", ["greenhouse", "lever", "ashby"]);

export const searchModeEnum = pgEnum("search_mode", [
  "review_each",
  "auto_above_85",
  "auto_all",
]);

/* ---------------- Tables ---------------- */

export const user = pgTable(
  "user",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkId: text("clerk_id").notNull(),
    email: text("email").notNull(),
    gmailConnectedAt: timestamp("gmail_connected_at", { withTimezone: true }),
    gmailRefreshToken: text("gmail_refresh_token"), // encrypted at rest later
    stripeCustomerId: text("stripe_customer_id"),
    plan: planEnum("plan").notNull().default("free"),
    applicationsThisMonth: integer("applications_this_month").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("user_clerk_id_unique").on(t.clerkId)],
);

export const profile = pgTable("profile", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  fullName: text("full_name"),
  phone: text("phone"),
  location: text("location"),
  linkedinUrl: text("linkedin_url"),
  githubUrl: text("github_url"),
  portfolioUrl: text("portfolio_url"),

  targetRoleTitles: text("target_role_titles").array().notNull().default(sql`'{}'::text[]`),
  totalYearsExperience: text("total_years_experience"), // bucket: 0-2 / 3-5 / 6-8 / 9-12 / 13+
  // Self-identified job-title level — used as a hard filter on matches so
  // a Mid candidate doesn't see Staff/Principal listings.
  seniorityLevel: text("seniority_level"), // junior | mid | senior | staff | principal
  yearsAtCurrentRole: integer("years_at_current_role"),
  skillYears: jsonb("skill_years").notNull().default(sql`'{}'::jsonb`),

  workAuthorization: text("work_authorization"),
  needsSponsorship: boolean("needs_sponsorship"),

  openToRemote: boolean("open_to_remote").notNull().default(true),
  openToHybrid: boolean("open_to_hybrid").notNull().default(true),
  openToOnsite: boolean("open_to_onsite").notNull().default(false),
  willingToRelocate: boolean("willing_to_relocate").notNull().default(false),
  preferredLocations: text("preferred_locations").array().notNull().default(sql`'{}'::text[]`),

  desiredSalaryMin: integer("desired_salary_min"),
  noticePeriodWeeks: integer("notice_period_weeks"),
  earliestStartDate: date("earliest_start_date"),
  excludedCompanies: text("excluded_companies").array().notNull().default(sql`'{}'::text[]`),

  voiceSample: text("voice_sample"),
  tailoringEnabled: boolean("tailoring_enabled").notNull().default(true),
  resumeEmbedding: vector("resume_embedding"),
  resumePdf: bytea("resume_pdf"),
  resumeFileName: text("resume_file_name"),

  // Personal answers reused across applications so the submission agent
  // doesn't have to guess. Most are EEO/demographic survey defaults — we
  // default to 'decline' so an unconfigured user still passes required-
  // field checks without leaking attributes.
  preferredName: text("preferred_name"),
  countryOfResidence: text("country_of_residence"),
  countryOfWork: text("country_of_work"),
  employmentRestrictions: boolean("employment_restrictions").notNull().default(false),
  previouslyWorkedHere: boolean("previously_worked_here").notNull().default(false),
  accommodationsNeeded: text("accommodations_needed"),
  eeoGender: text("eeo_gender").notNull().default("decline"),
  eeoHispanicLatino: text("eeo_hispanic_latino").notNull().default("decline"),
  eeoRaceEthnicity: text("eeo_race_ethnicity").notNull().default("decline"),
  eeoVeteranStatus: text("eeo_veteran_status").notNull().default("decline"),
  eeoDisabilityStatus: text("eeo_disability_status").notNull().default("decline"),

  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const resumeSection = pgTable(
  "resume_section",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: resumeSectionTypeEnum("type").notNull(),

    title: text("title").notNull(),
    organization: text("organization"),
    startDate: text("start_date"),
    endDate: text("end_date"),
    bullets: text("bullets").array().notNull().default(sql`'{}'::text[]`),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),

    embedding: vector("embedding"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("resume_section_user_idx").on(t.userId),
    // HNSW vector index for fast similarity search
    index("resume_section_embedding_idx")
      .using("hnsw", t.embedding.op("vector_cosine_ops")),
  ],
);

export const job = pgTable(
  "job",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    source: jobSourceEnum("source").notNull(),
    sourceJobId: text("source_job_id").notNull(),

    company: text("company").notNull(),
    title: text("title").notNull(),
    location: text("location"),
    jdText: text("jd_text").notNull(),

    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),

    postedAt: timestamp("posted_at", { withTimezone: true }),
    applyUrl: text("apply_url").notNull(),

    jdEmbedding: vector("jd_embedding"),

    isActive: boolean("is_active").notNull().default(true),
    scrapedAt: timestamp("scraped_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("job_source_unique").on(t.source, t.sourceJobId),
    index("job_company_idx").on(t.company),
    index("job_jd_embedding_idx").using("hnsw", t.jdEmbedding.op("vector_cosine_ops")),
  ],
);

export const application = pgTable(
  "application",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => job.id),

    status: applicationStatusEnum("status").notNull().default("queued"),
    matchScore: integer("match_score").notNull().default(0),

    tailoredResumeUrl: text("tailored_resume_url"),
    coverLetterText: text("cover_letter_text"),
    customAnswersJson: jsonb("custom_answers_json"),
    tailoringSummary: text("tailoring_summary").notNull().default(""),

    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    confirmationEmailId: text("confirmation_email_id"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    attempts: integer("attempts").notNull().default(0),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("application_user_idx").on(t.userId),
    index("application_status_idx").on(t.status),
    uniqueIndex("application_user_job_unique").on(t.userId, t.jobId),
  ],
);

export const applicationEvent = pgTable(
  "application_event",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    applicationId: uuid("application_id")
      .notNull()
      .references(() => application.id, { onDelete: "cascade" }),
    step: text("step").notNull(),
    payloadJson: jsonb("payload_json"),
    screenshotUrl: text("screenshot_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("application_event_application_idx").on(t.applicationId)],
);

export const searchCriteria = pgTable("search_criteria", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),

  roleKeywords: text("role_keywords").array().notNull().default(sql`'{}'::text[]`),
  locations: text("locations").array().notNull().default(sql`'{}'::text[]`),
  salaryMin: integer("salary_min"),
  companySizes: text("company_sizes").array().notNull().default(sql`'{}'::text[]`),
  excludedCompanies: text("excluded_companies").array().notNull().default(sql`'{}'::text[]`),
  batchSize: integer("batch_size").notNull().default(10),
  mode: searchModeEnum("mode").notNull().default("review_each"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------- Inferred row types ---------------- */

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;
export type Profile = typeof profile.$inferSelect;
export type NewProfile = typeof profile.$inferInsert;
export type ResumeSectionRow = typeof resumeSection.$inferSelect;
export type Job = typeof job.$inferSelect;
export type Application = typeof application.$inferSelect;
export type ApplicationEvent = typeof applicationEvent.$inferSelect;
export type SearchCriteria = typeof searchCriteria.$inferSelect;
