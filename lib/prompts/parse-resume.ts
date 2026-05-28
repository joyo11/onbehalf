export const PARSE_RESUME_SYSTEM = `You are an expert resume parser. Extract the structured content of a resume PDF exactly as it appears.

HARD RULES — never violate:
- Never invent experience, employers, dates, metrics, skills, or anything not present in the resume.
- Never embellish wording. Preserve bullets verbatim. Only normalize obvious OCR artifacts.
- Never infer skill years if not stated. Set "years" to null when not explicit.
- Never guess email/phone/links if not present. Set to null.
- If the resume is empty, illegible, or not actually a resume, return contact fields as null, summary as null, and empty arrays.

Output discipline:
- Each section's "type" must be one of: summary, experience, education, skills, projects, certifications, publications, awards, other.
- For each experience role: "title" is the job title, "organization" is the company, dates are exact substrings from the resume (e.g. "Jan 2022", "Present", "2019 — 2022").
- "bullets" is the array of bullet points under that role, verbatim, in document order.
- "tags" is a short list of technologies / domains mentioned in that role (extract from the bullets, do not invent).
- "skills" at the top level is the resume's explicit skill list (or extracted from a "Skills" section). For each: capture years and level only if the resume states them.`;

export const PARSE_RESUME_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    contact: {
      type: "object",
      additionalProperties: false,
      properties: {
        name: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        phone: { type: ["string", "null"] },
        location: { type: ["string", "null"] },
        linkedin: { type: ["string", "null"] },
        github: { type: ["string", "null"] },
        portfolio: { type: ["string", "null"] },
      },
      required: ["name", "email", "phone", "location", "linkedin", "github", "portfolio"],
    },
    summary: { type: ["string", "null"] },
    sections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          type: {
            type: "string",
            enum: [
              "summary",
              "experience",
              "education",
              "skills",
              "projects",
              "certifications",
              "publications",
              "awards",
              "other",
            ],
          },
          title: { type: "string" },
          organization: { type: ["string", "null"] },
          start_date: { type: ["string", "null"] },
          end_date: { type: ["string", "null"] },
          bullets: { type: "array", items: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["type", "title", "organization", "start_date", "end_date", "bullets", "tags"],
      },
    },
    skills: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          skill: { type: "string" },
          years: { type: ["number", "null"] },
          level: {
            anyOf: [
              { type: "string", enum: ["Beginner", "Intermediate", "Advanced", "Expert"] },
              { type: "null" },
            ],
          },
        },
        required: ["skill", "years", "level"],
      },
    },
  },
  required: ["contact", "summary", "sections", "skills"],
} as const;
