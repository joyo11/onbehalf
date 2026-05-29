import type { SkillYear } from "./types";

/**
 * Default chip options shown in onboarding before the user customises them.
 * These are seed values, not mock data — they're presented as suggestions and
 * fully overwritten by the user's actual choices.
 */

export const SKILL_YEARS: SkillYear[] = [
  { skill: "React", years: 6, level: "Expert" },
  { skill: "TypeScript", years: 5, level: "Expert" },
  { skill: "Node.js", years: 5, level: "Expert" },
  { skill: "Kubernetes", years: 3, level: "Intermediate" },
  { skill: "AWS / EKS", years: 3, level: "Intermediate" },
  { skill: "GraphQL", years: 4, level: "Advanced" },
  { skill: "PostgreSQL", years: 5, level: "Advanced" },
  { skill: "Design systems", years: 4, level: "Expert" },
];

export const TARGET_ROLES = [
  "Senior Product Engineer",
  "Staff Product Engineer",
  "Founding Engineer",
];

export const TARGET_LOCATIONS = ["Remote (US)", "New York", "San Francisco"];

export const EXCLUDE_COMPANIES: string[] = [];
