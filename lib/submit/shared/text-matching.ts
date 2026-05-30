/**
 * Pure text-matching helpers used across the server fill code AND the
 * extension content script. No Node, no Playwright, no DOM.
 *
 * - textSimilarity: bag-of-words Jaccard, stopword-filtered. Used by
 *   fuzzy matchers in fillReactSelect and fillRadioGroup.
 * - answerSynonyms: yes/no synonyms so a "Yes" answer also matches
 *   "Yes, I am", "Affirmative", etc.
 * - isDeclineAnswer: matches the decline-style EEO answers ("Decline
 *   to self-identify", "Prefer not to say", "Wish to answer").
 * - isUrl: looser URL detection so we don't fill GitHub/Website with
 *   raw text the user typed.
 * - isBasicField: identity questions ("first name", "email") that the
 *   server-side dispatch already handles in tryFill; the labelled-field
 *   walk should skip these.
 */

const STOPWORDS = new Set([
  "the", "and", "for", "you", "are", "with", "that", "this", "what",
  "have", "your", "from", "will", "any", "our", "can", "into", "would",
  "about", "which", "their", "there", "where", "when", "been", "more",
  "they", "them", "but", "out", "all", "some", "has", "had", "was",
  "were", "not", "one", "other", "than",
]);

export function textSimilarity(a: string, b: string): number {
  const wordsOf = (s: string) =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^a-z0-9 ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOPWORDS.has(w)),
    );
  const wa = wordsOf(a);
  const wb = wordsOf(b);
  if (wa.size === 0 || wb.size === 0) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size);
}

export function isDeclineAnswer(answer: string): boolean {
  return /decline|prefer not|wish to answer|not to disclose|not to say/i.test(answer);
}

export function answerSynonyms(answer: string): string[] {
  const a = answer.trim();
  if (/^yes$/i.test(a)) return ["Yes", "Yes, I am", "Yes I do", "I am", "Affirmative"];
  if (/^no$/i.test(a))
    return [
      "No",
      "No, I am not",
      "I am not",
      "Not at this time",
      "I am NOT a protected veteran",
      "I do not have a disability",
    ];
  return [];
}

export function isUrl(s: string | null | undefined): s is string {
  if (!s) return false;
  return /^https?:\/\/|^[a-z0-9-]+\.[a-z]{2,}/.test(s.toLowerCase().trim());
}

export function isBasicField(q: string): boolean {
  return /^(first name|last name|email|phone|country|resume|cv|cover letter)$/i.test(q.trim());
}
