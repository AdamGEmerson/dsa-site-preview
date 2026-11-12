// Data access for the public site. Everything comes from EmDash (D1 in production, local D1 in dev),
// queried live per request, so an edit published in the admin shows on the next page load.
import { getEmDashCollection, getEmDashEntry, getMenu, getSeoMeta, getSiteSettings } from "emdash";
import type { AstroGlobal } from "astro";
import { eventFeed } from "./events";

type Astro = AstroGlobal;
export type Entry = { id: string; data: Record<string, any>; edit?: Record<string, Record<string, string>> };
export type Link = { label: string; href: string; children?: Link[] };
export type Btn = { label: string; url: string; style?: string };

/** EmDash returns operational errors instead of throwing; a missing entry is not one. Surface real
 *  failures as a 500 rather than letting them look like a 404. */
const check = (error: unknown, what: string) => {
  if (error) throw new Error(`EmDash query failed: ${what}`, { cause: error });
};

/** Per-request memo on Astro.locals, so several components can ask for the same thing. */
function memo<T>(Astro: Astro, key: string, load: () => Promise<T>): Promise<T> {
  const locals = Astro.locals as unknown as Record<string, unknown>;
  locals[key] ??= load();
  return locals[key] as Promise<T>;
}

// ---------------------------------------------------------------- URLs
/** Searchable collections and their public URLs, for WebMcpSearch. Its result URLs ignore each
 *  collection's urlPattern, so every searchable collection needs an entry here. */
export const searchCollections = ["pages"];
export const searchRouteMap = { pages: "/:slug" };

/** External links open in the same tab but are marked for screen readers and styling. */
export const isExternal = (href: string) => /^https?:\/\//.test(href) && !/^https?:\/\/(www\.)?dsafw\.com(\/|$)/.test(href);

// ---------------------------------------------------------------- queries
export async function getEntry(collection: string, slug: string): Promise<Entry | null> {
  const { entry, error } = await getEmDashEntry(collection as any, slug);
  check(error, `${collection}/${slug}`);
  return (entry as unknown as Entry) ?? null;
}

export async function getAll(collection: string): Promise<Entry[]> {
  const { entries, error } = await getEmDashCollection(collection as any, { limit: 100 });
  check(error, collection);
  return entries as unknown as Entry[];
}

export async function menu(Astro: Astro, name: string): Promise<{ label: string; items: Link[] }> {
  return memo(Astro, `__menu_${name}`, async () => {
    const data = await getMenu(name);
    const map = (items: any[] = []): Link[] => items.map((i) => ({ label: i.label, href: i.url, children: i.children?.length ? map(i.children) : undefined }));
    return { label: data?.label ?? "", items: map(data?.items) };
  });
}

// ---------------------------------------------------------------- site settings + SEO
export async function useSettings(Astro: Astro): Promise<{ siteTitle: string; separator: string; siteUrl: string; timezone: string }> {
  return memo(Astro, "__settings", async () => {
    const d = ((await getSiteSettings()) ?? {}) as Record<string, any>;
    return {
      siteTitle: d.title?.trim() || "DSA Fort Worth",
      separator: d.seo?.titleSeparator?.trim() ? ` ${d.seo.titleSeparator.trim()} ` : " | ",
      siteUrl: (d.url?.trim() || Astro.site?.origin || Astro.url.origin).replace(/\/$/, ""),
      timezone: d.timezone?.trim() || "America/Chicago",
    };
  });
}

export type PageSeo = { title: string; description?: string; canonical: string; image: string; robots?: string };

/**
 * SEO for a content page through EmDash: the entry's SEO panel (title, description, image, canonical,
 * "Hide from search engines"), falling back to the H1. Pages read "{page} | DSA Fort Worth"; the
 * homepage leads with the chapter name: "DSA Fort Worth | {panel title}".
 */
export async function seoFor(Astro: Astro, entry: Entry, path: string): Promise<PageSeo> {
  const { siteTitle, separator, siteUrl } = await useSettings(Astro);
  const isHome = path === "/";
  const seo = getSeoMeta(entry as any, {
    siteTitle: isHome ? undefined : siteTitle,
    titleSeparator: separator,
    siteUrl,
    path,
    defaultTitle: entry.data.h1 || undefined,
    defaultDescription: entry.data.lead || undefined,
    defaultOgImage: `${siteUrl}/og-default.png`,
  });
  return {
    title: isHome ? `${siteTitle}${separator}${seo.title}` : seo.title,
    description: seo.description ?? undefined,
    canonical: seo.canonical ?? `${siteUrl}${path}`,
    image: seo.ogImage ?? `${siteUrl}/og-default.png`,
    robots: seo.robots ?? undefined,
  };
}

/** Upcoming events from the calendar feed in Chapter details, categorised, once per request. */
export async function useEvents(Astro: Astro) {
  const chapter = await useChapter(Astro);
  return eventFeed(Astro.locals, chapter.calendarIcsUrl, chapter.eventCategories);
}

// ---------------------------------------------------------------- chapter details
/** The single "Chapter details" entry, cached per request. */
export async function useChapter(Astro: Astro) {
  return memo(Astro, "__chapter", async () => {
    const e = (await getEntry("chapter", "fort-worth")) ?? (await getAll("chapter"))[0] ?? null;
    const d = e?.data ?? {};
    return {
      name: d.title || "DSA Fort Worth",
      area: d.area || "Tarrant County",
      joinUrl: d.join_url || "https://go.dsausa.org/fort-worth-f26",
      getInvolvedUrl: d.get_involved_url || "",
      newsletterUrl: d.newsletter_url || "",
      calendarUrl: d.calendar_url || "",
      calendarIcsUrl: d.calendar_ics_url || "",
      dsa101Url: d.dsa_101_url || "",
      donateUrl: d.donate_url || "",
      email: d.email || "",
      social: ((d.social ?? []) as { network: string; url: string }[]).filter((s) => s.url),
      eventCategories: ((d.event_categories ?? []) as { name: string; keywords: string; members_only?: boolean }[])
        .filter((r) => r.name && r.keywords)
        .map((r) => ({
          name: r.name.trim(),
          keywords: r.keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean),
          membersOnly: Boolean(r.members_only),
        })),
    };
  });
}
export type Chapter = Awaited<ReturnType<typeof useChapter>>;
