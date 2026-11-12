// Title case for display labels (eyebrows): capitalise each word except short articles,
// conjunctions and prepositions in the middle; words already in capitals (DSA, ICE) and numbers stay.
const SMALL = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "per", "the", "to", "vs", "via", "with"]);

export function titleCase(text: string): string {
  const words = text.trim().split(/(\s+|[-–—/]\s*)/);
  const real = words.map((w, i) => ({ w, i })).filter(({ w }) => /\p{L}/u.test(w));
  const first = real[0]?.i;
  const last = real.at(-1)?.i;
  return words
    .map((w, i) => {
      if (!/\p{L}/u.test(w)) return w;
      if (w.length > 1 && w === w.toUpperCase()) return w; // acronym
      const lower = w.toLowerCase();
      if (i !== first && i !== last && SMALL.has(lower)) return lower;
      return lower.replace(/^(\P{L}*)(\p{L})/u, (_, pre: string, ch: string) => pre + ch.toUpperCase());
    })
    .join("");
}

/** Heading text → URL fragment: "Code of Conduct" → "code-of-conduct". */
export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
