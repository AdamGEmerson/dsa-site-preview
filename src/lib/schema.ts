// JSON-LD alongside EmDash's own node (WebSite, or BlogPosting on a News article): the chapter as
// an Organization, and FAQPage from FAQ blocks.
import type { Chapter } from "./site";

type Node = Record<string, unknown>;

export const graph = (nodes: Node[]) => ({ "@context": "https://schema.org", "@graph": nodes });

export function organization(site: URL, chapter: Chapter): Node {
  return {
    "@type": "Organization",
    "@id": new URL("/#organization", site).href,
    name: chapter.name,
    alternateName: "Fort Worth Democratic Socialists of America",
    url: site.href,
    logo: new URL("/logo.png", site).href,
    areaServed: { "@type": "AdministrativeArea", name: `${chapter.area}, Texas` },
    parentOrganization: { "@type": "Organization", name: "Democratic Socialists of America", url: "https://www.dsausa.org/" },
    ...(chapter.email ? { email: chapter.email } : {}),
    sameAs: chapter.social.map((s) => s.url),
  };
}

/** Markdown-ish answer text → plain text for structured data. */
const plain = (s: string) => s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*?([^*]+)\*\*?/g, "$1");

export function faqPage(blocks: { _type: string; items?: { question: string; answer: string }[] }[] = []): Node | null {
  const items = blocks.filter((b) => b._type === "faq").flatMap((b) => b.items ?? []).filter((i) => i.question && i.answer);
  if (!items.length) return null;
  return {
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.question, acceptedAnswer: { "@type": "Answer", text: plain(i.answer) } })),
  };
}
