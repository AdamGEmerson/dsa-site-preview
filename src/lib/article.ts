// News articles (the "news" collection: statements, resolutions, bylaws, essays).
// The body is a list of blocks: text (rich text), pull quotes and photos. From it we build the
// table of contents (every Heading 2 and Heading 3 in the text) and give those headings link
// anchors. Who wrote or issued an article comes from EmDash's bylines (profiles under Bylines in
// the admin, credited in the article's Bylines panel). The News list block uses latestNews.
import { plain, type PtBlock } from "./sections";
import { getAll, type Entry } from "./site";

export type TocItem = { id: string; text: string; level: 2 | 3 };
export type BodyBlock = Record<string, any> & { _type: string; _key: string };

/** Ids already used by the page shell; a heading called "Main" becomes #main-2. */
const reserved = ["main", "h1", "site-nav", "article-toc", "toc-panel", "h-article-cta", "final-cta"];

/** "Article IV. Officers & Duties" → "article-iv-officers-duties" */
export function slugify(text: string): string {
  const slug = text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  return slug || "section";
}

/**
 * Walks the body once. Returns the blocks with an `anchor` on each rich-text heading (copies; the
 * entry's own data is left alone) and the table of contents.
 */
export function prepareBody(body: BodyBlock[] | null | undefined): { blocks: BodyBlock[]; toc: TocItem[] } {
  const used = new Set(reserved);
  const toc: TocItem[] = [];

  const blocks = (body ?? []).map((block) => {
    if (block._type !== "article_text" || !Array.isArray(block.body)) return block;
    const text = (block.body as PtBlock[]).map((pt) => {
      const level = pt._type !== "block" ? 0 : pt.style === "h2" ? 2 : pt.style === "h3" ? 3 : 0;
      const label = level ? plain(pt).trim() : "";
      if (!level || !label) return pt;
      const base = slugify(label);
      let id = base;
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
      used.add(id);
      toc.push({ id, text: label, level: level as 2 | 3 });
      return { ...pt, anchor: id };
    });
    return { ...block, body: text };
  });

  return { blocks, toc };
}

/** An article's own date: the one an editor set, or else the day it was published. */
export const articleDate = (d: Record<string, any>) => d.date || d.publishedAt;

/** Published News articles, newest first. */
export async function latestNews(): Promise<Entry[]> {
  const time = (e: Entry) => new Date(articleDate(e.data) ?? 0).getTime() || 0;
  return (await getAll("news")).sort((a, b) => time(b) - time(a));
}

/** "October 18, 2026" in the site's timezone; empty for a missing or unreadable date. */
export function longDate(value: unknown, timeZone: string): { iso: string; label: string } | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return { iso: date.toISOString(), label: new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone }).format(date) };
}

// ---------------------------------------------------------------- bylines
export type Credit = {
  name: string;
  /** The credit's role on this article, e.g. "Photographer"; empty for a plain byline */
  role: string;
  bio: string;
  website: string;
  /** The profile picture as an image value for <Image>, when the byline has one */
  avatar: { provider: "local"; id: string; alt: string; meta: { storageKey: string } } | null;
};

/** An article's byline credits, in the order set in its Bylines panel. With no credit given,
 *  EmDash supplies the byline linked to the editor who wrote it, if they have one. */
export function creditsOf(d: Record<string, any>): Credit[] {
  return ((d.bylines ?? []) as { byline?: Record<string, any>; roleLabel?: string | null }[])
    .filter((c) => c.byline?.displayName)
    .map(({ byline: b, roleLabel }) => ({
      name: b!.displayName as string,
      role: roleLabel?.trim() ?? "",
      bio: (b!.bio as string | null)?.trim() ?? "",
      website: (b!.websiteUrl as string | null) ?? "",
      avatar: b!.avatarMediaId && b!.avatarStorageKey ? { provider: "local", id: b!.avatarMediaId, alt: b!.avatarAlt ?? "", meta: { storageKey: b!.avatarStorageKey } } : null,
    }));
}

/** Dates and author for EmDash's article metadata (Open Graph article tags, BlogPosting JSON-LD). */
export function articleMeta(d: Record<string, any>): { publishedTime?: string; modifiedTime?: string; author?: string } {
  const iso = (value: unknown) => {
    const date = value ? new Date(value as string) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toISOString() : undefined;
  };
  return { publishedTime: iso(articleDate(d)), modifiedTime: iso(d.updatedAt), author: creditsOf(d)[0]?.name };
}
