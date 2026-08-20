export interface SanitizeResult {
  text: string;
  language: string;
  wordCount: number;
}

/**
 * Cleans raw pasted story text (Wattpad/Facebook/etc copy-paste artifacts):
 * HTML, markdown syntax, ad/nav boilerplate, and whitespace noise.
 * Chapter/scene heading lines are preserved — the chunker keys off them.
 */
export function sanitizeStory(raw: string): SanitizeResult {
  let text = raw;
  text = stripHtml(text);
  text = stripMarkdown(text);
  text = stripBoilerplate(text);
  text = normalizeWhitespace(text);
  const language = detectLanguage(text);
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  return { text, language, wordCount };
}

function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ");
}

function stripMarkdown(input: string): string {
  return input
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_>`~]+/g, "");
}

function stripBoilerplate(input: string): string {
  const lines = input.split(/\r?\n/);
  const kept = lines.filter((line) => {
    const t = line.trim();
    if (!t) return true;
    if (/^(advertisement|advertising|sponsored)/i.test(t)) return false;
    if (/^(back to (top|previous)|next (chapter|page) *[>»]?|prev *[<«])/i.test(t)) return false;
    if (/^(posted (by|in)|share this|like this|sign in|sign up|log in|subscribe)/i.test(t)) return false;
    if (/^(home|categories|tags|menu|download the app)/i.test(t)) return false;
    return true;
  });
  return kept.join("\n");
}

function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/** Coarse script-based detection; English is the fallback. Good enough for MVP. */
function detectLanguage(input: string): string {
  const sample = input.slice(0, 5000);
  if (/[\u4e00-\u9fff]/.test(sample)) return "zh";
  if (/[\u3040-\u30ff]/.test(sample)) return "ja";
  if (/[\uac00-\ud7af]/.test(sample)) return "ko";
  if (/[\u0600-\u06ff]/.test(sample)) return "ar";
  if (/[\u0400-\u04ff]/.test(sample)) return "ru";
  if (/[\u0e00-\u0e7f]/.test(sample)) return "th";
  if (/[\u0900-\u097f]/.test(sample)) return "hi";
  if (/[\u1e00-\u1eff]/.test(sample)) return "vi";
  return "en";
}