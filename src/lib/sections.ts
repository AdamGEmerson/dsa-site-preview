// Site-wide copy from EmDash Sections (Sections in the admin). Each band that carries shared wording
// reads one section by slug and renders it live, so an edit to the section shows on every page.
// Parts are picked by block style so editors can write naturally: the first heading, plain
// paragraphs, bullets, and paragraphs that are nothing but a link (those become buttons).
// A missing section hides its band; there is no hard-coded fallback copy.
import { getSection } from "emdash";

export type PtBlock = {
  _type: string;
  _key?: string;
  style?: string;
  listItem?: string;
  markDefs?: { _key: string; _type: string; href?: string }[];
  children?: { _type: string; text?: string; marks?: string[] }[];
  [k: string]: unknown;
};

export type Copy = {
  found: boolean;
  heading: string;
  paragraphs: PtBlock[];
  items: string[];
  buttons: { label: string; url: string }[];
};

export const plain = (b: PtBlock) => (b.children ?? []).map((c) => c.text ?? "").join("");

/** A paragraph whose only text is one link, e.g. "[Join DSA](https://…)". */
function linkOnly(b: PtBlock): { label: string; url: string } | null {
  const spans = (b.children ?? []).filter((c) => (c.text ?? "").trim());
  if (spans.length !== 1) return null;
  const def = b.markDefs?.find((d) => d._type === "link" && spans[0]!.marks?.includes(d._key));
  return def?.href ? { label: spans[0]!.text!.trim(), url: def.href } : null;
}

export async function useCopy(slug: string): Promise<Copy> {
  const section = await getSection(slug);
  const copy: Copy = { found: Boolean(section), heading: "", paragraphs: [], items: [], buttons: [] };
  for (const b of (section?.content ?? []) as PtBlock[]) {
    if (b._type !== "block") continue;
    const text = plain(b);
    const button = linkOnly(b);
    if (b.listItem) copy.items.push(text);
    else if (b.style?.match(/^h[1-6]$/)) copy.heading ||= text;
    else if (button) copy.buttons.push(button);
    else if (text.trim()) copy.paragraphs.push(b);
  }
  return copy;
}
