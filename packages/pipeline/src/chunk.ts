/** Above this many characters a single analysis pass is risky; chunk first. */
export const MAX_CHUNK_CHARS = 100_000;

export interface Chunk {
  index: number;
  /** Heading line of the chunk's first chapter marker, if any. */
  heading: string | null;
  text: string;
}

/**
 * Splits on explicit chapter/part/act markers. Returns null when the text has
 * fewer than two markers (caller falls back to boundary detection).
 */
export function splitByChapterMarkers(text: string): Chunk[] | null {
  const markerRe = /^\s*(chapter|part|act|prologue|epilogue|scene|interlude)\b.*$/i;
  const lines = text.split(/\r?\n/);
  const markerIndexes: number[] = [];
  lines.forEach((line, i) => {
    if (markerRe.test(line)) markerIndexes.push(i);
  });
  if (markerIndexes.length < 2) return null;

  const chunks: Chunk[] = [];
  markerIndexes.forEach((start, i) => {
    const end = i + 1 < markerIndexes.length ? markerIndexes[i + 1] : lines.length;
    const body = lines.slice(start, end).join("\n").trim();
    if (!body) return;
    chunks.push({ index: chunks.length, heading: lines[start].trim(), text: body });
  });
  return chunks.length > 0 ? chunks : null;
}

export function needsChunking(text: string): boolean {
  return text.length > MAX_CHUNK_CHARS;
}