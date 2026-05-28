CREATE TYPE "public"."application_status" AS ENUM('queued', 'tailoring', 'pending', 'submitting', 'submitted', 'confirmed', 'failed', 'needsHuman', 'draft');--> statement-breakpoint
CREATE TYPE "public"."job_source" AS ENUM('greenhouse', 'lever', 'ashby');--> statement-breakpoint
CREATE TYPE "public"."plan" AS ENUM('free', 'pro', 'unlimited');--> statement-breakpoint
CREATE TYPE "public"."resume_section_type" AS ENUM('summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'publications', 'awards', 'other');--> statement-breakpoint
CREATE TYPE "public"."search_mode" AS ENUM('review_each', 'auto_above_85', 'auto_all');--> statement-breakpoint
CREATE TABLE "application" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"job_id" uuid NOT NULL,
	"status" "application_status" DEFAULT 'queued' NOT NULL,
	"match_score" integer DEFAULT 0 NOT NULL,
	"tailored_resume_url" text,
	"cover_letter_text" text,
	"custom_answers_json" jsonb,
	"tailoring_summary" text DEFAULT '' NOT NULL,
	"submitted_at" timestamp with time zone,
	"confirmation_email_id" text,
	"confirmed_at" timestamp with time zone,
	"failure_reason" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "application_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"application_id" uuid NOT NULL,
	"step" text NOT NULL,
	"payload_json" jsonb,
	"screenshot_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" "job_source" NOT NULL,
	"source_job_id" text NOT NULL,
	"company" text NOT NULL,
	"title" text NOT NULL,
	"location" text,
	"jd_text" text NOT NULL,
	"salary_min" integer,
	"salary_max" integer,
	"posted_at" timestamp with time zone,
	"apply_url" text NOT NULL,
	"jd_embedding" vector(1536),
	"scraped_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"full_name" text,
	"phone" text,
	"location" text,
	"linkedin_url" text,
	"github_url" text,
	"portfolio_url" text,
	"target_role_titles" text[] DEFAULT '{}'::text[] NOT NULL,
	"total_years_experience" text,
	"years_at_current_role" integer,
	"skill_years" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"work_authorization" text,
	"needs_sponsorship" boolean,
	"open_to_remote" boolean DEFAULT true NOT NULL,
	"open_to_hybrid" boolean DEFAULT true NOT NULL,
	"open_to_onsite" boolean DEFAULT false NOT NULL,
	"willing_to_relocate" boolean DEFAULT false NOT NULL,
	"preferred_locations" text[] DEFAULT '{}'::text[] NOT NULL,
	"desired_salary_min" integer,
	"notice_period_weeks" integer,
	"earliest_start_date" date,
	"excluded_companies" text[] DEFAULT '{}'::text[] NOT NULL,
	"voice_sample" text,
	"tailoring_enabled" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resume_section" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" "resume_section_type" NOT NULL,
	"title" text NOT NULL,
	"organization" text,
	"start_date" text,
	"end_date" text,
	"bullets" text[] DEFAULT '{}'::text[] NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"embedding" vector(1536),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "search_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"role_keywords" text[] DEFAULT '{}'::text[] NOT NULL,
	"locations" text[] DEFAULT '{}'::text[] NOT NULL,
	"salary_min" integer,
	"company_sizes" text[] DEFAULT '{}'::text[] NOT NULL,
	"excluded_companies" text[] DEFAULT '{}'::text[] NOT NULL,
	"batch_size" integer DEFAULT 10 NOT NULL,
	"mode" "search_mode" DEFAULT 'review_each' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"clerk_id" text NOT NULL,
	"email" text NOT NULL,
	"gmail_connected_at" timestamp with time zone,
	"gmail_refresh_token" text,
	"stripe_customer_id" text,
	"plan" "plan" DEFAULT 'free' NOT NULL,
	"applications_this_month" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application" ADD CONSTRAINT "application_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_event" ADD CONSTRAINT "application_event_application_id_application_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."application"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profile" ADD CONSTRAINT "profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resume_section" ADD CONSTRAINT "resume_section_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "search_criteria" ADD CONSTRAINT "search_criteria_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "application_user_idx" ON "application" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "application_status_idx" ON "application" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "application_user_job_unique" ON "application" USING btree ("user_id","job_id");--> statement-breakpoint
CREATE INDEX "application_event_application_idx" ON "application_event" USING btree ("application_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_source_unique" ON "job" USING btree ("source","source_job_id");--> statement-breakpoint
CREATE INDEX "job_company_idx" ON "job" USING btree ("company");--> statement-breakpoint
CREATE INDEX "job_jd_embedding_idx" ON "job" USING hnsw ("jd_embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "resume_section_user_idx" ON "resume_section" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "resume_section_embedding_idx" ON "resume_section" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "user_clerk_id_unique" ON "user" USING btree ("clerk_id");