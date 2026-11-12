// Upcoming events from the chapter's Solidarity Tech calendar feed (.ics), the URL in Chapter
// details. Fetched on the server when a page with an Upcoming events block renders, through
// Cloudflare's cache for a few minutes so the feed isn't hit on every visit. Events that have ended
// are dropped at render time, so the list moves on by itself.
//
// Solidarity Tech's feed (checked against a live chapter feed, Nov 2026): one VEVENT per session,
// DTSTART/DTEND with a TZID and no VTIMEZONE block, SUMMARY often carrying a "11/18" date, URL = the
// RSVP page, DESCRIPTION ending in "RSVP: <url>" with HTML entities, LOCATION "Virtual Event" or
// "City – RSVP to see address", no CATEGORIES, no images. A hybrid meeting comes as two sessions
// (in person + virtual) with the same time and RSVP link; those are merged into one card.
//
// What the feed lacks we add: a category from keyword rules in Chapter details (matched against the
// title), and for featured cards the banner image from the event's Solidarity Tech page (og:image).

export type ChapterEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  location: string;
  /** Street address after the venue name, when the feed gives "Venue - Address" */
  address: string;
  virtual: boolean;
  /** In person with a virtual option (merged sessions) */
  hybrid: boolean;
  category: string;
  /** From a members-only category: shown with a badge, without RSVP or address */
  membersOnly: boolean;
  summary: string;
  url: string;
};

const CACHE_SECONDS = 300;

export type CategoryRule = { name: string; keywords: string[]; membersOnly: boolean };

/** Every upcoming event, categorised, fetched once per request and shared by all event blocks. */
export function eventFeed(locals: object, icsUrl: string, rules: CategoryRule[]): Promise<ChapterEvent[]> {
  const memo = locals as { __events?: Promise<ChapterEvent[]> };
  memo.__events ??= upcomingEvents(icsUrl, Infinity).then((events) => categorize(events, rules));
  return memo.__events;
}

/** First rule whose keyword appears in the title wins; a CATEGORIES value from the feed wins over rules. */
export function categorize(events: ChapterEvent[], rules: CategoryRule[]): ChapterEvent[] {
  return events.map((e) => {
    if (e.category) return e;
    const hit = rules.find((r) => r.keywords.some((k) => titleHas(e.title, k)));
    return hit ? { ...e, category: hit.name, membersOnly: hit.membersOnly } : e;
  });
}

/** Whole-word, case-insensitive phrase match on titles ("watch" matches "Let's Watch", not "Watchdog"). */
const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
export const titleHas = (title: string, phrase: string) => Boolean(words(phrase).trim()) && words(title).includes(words(phrase));

/** The next upcoming event whose title contains the phrase (a group's next meeting). */
export const nextMatching = (events: ChapterEvent[], phrase: string) => events.find((e) => titleHas(e.title, phrase));

/** Compare event links loosely: no scheme, query, fragment or trailing slash. */
export const sameUrl = (a: string, b: string) => {
  const norm = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/[?#].*$/, "").replace(/\/+$/, "");
  return Boolean(a && b) && norm(a) === norm(b);
};

/** The banner image on an event's Solidarity Tech page (its og:image), resized for a card. */
export async function eventBanner(url: string): Promise<string> {
  if (!/^https:\/\/[a-z0-9-]+\.solidarity\.tech\//i.test(url)) return "";
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(2500), cf: { cacheTtl: 3600, cacheEverything: true } } as RequestInit);
    if (!res.ok) return "";
    const html = await res.text();
    const src = html.match(/<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i)?.[1] ?? "";
    return src.replace(/&amp;/g, "&").replace("/fit-in/1200x0/", "/fit-in/960x0/");
  } catch {
    return "";
  }
}

export async function upcomingEvents(icsUrl: string, count: number, now = new Date()): Promise<ChapterEvent[]> {
  if (!icsUrl) return [];
  const url = icsUrl.replace(/^webcal:/i, "https:");
  let text: string;
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/calendar" },
      // Cloudflare: cache the upstream response at the edge (ignored outside Workers)
      cf: { cacheTtl: CACHE_SECONDS, cacheEverything: true },
    } as RequestInit);
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    text = await res.text();
  } catch (error) {
    // A calendar outage shouldn't take the page down: log it and show the empty state.
    console.error(`[events] calendar feed failed: ${url}`, error);
    return [];
  }
  return mergeSessions(parseIcs(text).filter((e) => e.end > now))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .slice(0, count);
}

/** One card per event: sessions with the same RSVP link and start time are one hybrid event. */
function mergeSessions(events: ChapterEvent[]): ChapterEvent[] {
  const byKey = new Map<string, ChapterEvent>();
  for (const e of events) {
    const key = `${e.url || e.title}|${e.start.getTime()}`;
    const seen = byKey.get(key);
    if (!seen) byKey.set(key, e);
    else if (seen.virtual !== e.virtual) {
      const inPerson = seen.virtual ? e : seen;
      byKey.set(key, { ...inPerson, hybrid: true });
    }
  }
  return [...byKey.values()];
}

// ---------------------------------------------------------------- ICS parsing (RFC 5545 subset)

type Prop = { name: string; params: Record<string, string>; value: string };

export function parseIcs(ics: string): ChapterEvent[] {
  // Unfold continuation lines (CRLF followed by a space or tab)
  const lines = ics.replace(/\r?\n[ \t]/g, "").split(/\r?\n/);
  const events: ChapterEvent[] = [];
  let props: Prop[] | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") props = [];
    else if (line === "END:VEVENT") {
      if (props) {
        const event = toEvent(props);
        if (event) events.push(event);
      }
      props = null;
    } else if (props) {
      const prop = parseLine(line);
      if (prop) props.push(prop);
    }
  }
  return events;
}

function parseLine(line: string): Prop | null {
  // NAME;PARAM=a;PARAM2="b:c":VALUE (the first colon outside quotes ends the name/params part)
  let quoted = false;
  let split = -1;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') quoted = !quoted;
    else if (ch === ":" && !quoted) {
      split = i;
      break;
    }
  }
  if (split < 0) return null;
  const [name, ...rawParams] = line.slice(0, split).split(";");
  const params: Record<string, string> = {};
  for (const p of rawParams) {
    const eq = p.indexOf("=");
    if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, "");
  }
  return { name: name!.toUpperCase(), params, value: line.slice(split + 1) };
}

function toEvent(props: Prop[]): ChapterEvent | null {
  const get = (name: string) => props.find((p) => p.name === name);
  const status = get("STATUS")?.value.toUpperCase();
  if (status === "CANCELLED") return null;
  const dtStart = get("DTSTART");
  if (!dtStart) return null;
  const start = parseDate(dtStart);
  if (!start) return null;
  const allDay = dtStart.params.VALUE === "DATE" || /^\d{8}$/.test(dtStart.value);
  const dtEnd = get("DTEND");
  const end = (dtEnd && parseDate(dtEnd)) || new Date(start.getTime() + (allDay ? 86_400_000 : 2 * 3_600_000));

  const description = cleanText(get("DESCRIPTION")?.value ?? "");
  const rsvpInText = description.match(/RSVP:\s*(https?:\/\/\S+)/i)?.[1] ?? "";
  const rawLocation = cleanText(get("LOCATION")?.value ?? "").replace(/,\s*(USA|United States)$/i, "");
  const virtual = /^(virtual|online|zoom)\b/i.test(rawLocation) || /^virtual event$/i.test(rawLocation);
  const category = cleanText(get("CATEGORIES")?.value ?? "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean)[0];

  return {
    id: get("UID")?.value ?? `${dtStart.value}-${get("SUMMARY")?.value ?? ""}`,
    title: tidyTitle(cleanText(get("SUMMARY")?.value ?? "Event")),
    start,
    end,
    allDay,
    ...splitLocation(virtual ? "Virtual" : rawLocation),
    virtual,
    hybrid: false,
    category: category ?? "",
    membersOnly: false,
    summary: summarize(description.replace(/RSVP:\s*https?:\/\/\S+/gi, "")),
    url: get("URL")?.value || rsvpInText,
  };
}

/** Text values: ICS escapes, then the HTML entities and tags Solidarity Tech leaves in. */
function cleanText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\([,;\\])/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "’")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .trim();
}

/** The card shows the date, so drop dates written into titles: "11/18 Meeting", "Meeting - 10/12". */
function tidyTitle(title: string): string {
  return title
    .replace(/^\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*[-–:|]?\s*/, "")
    .replace(/\s*[-–:|(]\s*\d{1,2}\/\d{1,2}(\/\d{2,4})?\)?$/, "")
    .trim();
}

/** "Finn's Place - 5860 Interstate 20 Service Road, Fort Worth, TX 76119" → venue + address. */
function splitLocation(location: string): { location: string; address: string } {
  const m = location.match(/^(.{2,60}?)\s+[-–]\s+(\d.*)$/);
  return m ? { location: m[1]!, address: m[2]! } : { location, address: "" };
}

/** Descriptions often open with a heading line ("Join Us for DSA 101"); skip short unpunctuated
 *  lines and take the first sentence of the first real paragraph. */
function summarize(text: string): string {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const body = lines.find((l) => l.length >= 48 || /[.!?]$/.test(l)) ?? lines[0] ?? "";
  return firstSentence(body);
}

function firstSentence(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const match = flat.match(/^(.{20,240}?[.!?])(\s|$)/);
  const sentence = match?.[1] ?? flat;
  return sentence.length > 240 ? `${sentence.slice(0, 237).replace(/\s+\S*$/, "")}…` : sentence;
}

/** DATE, DATE-TIME in UTC (Z), or floating/TZID local time converted with Intl. */
function parseDate(prop: Prop): Date | null {
  const m = prop.value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0", s = "0", z] = m;
  const wall = Date.UTC(+y!, +mo! - 1, +d!, +h, +mi, +s);
  if (z) return new Date(wall);
  const tz = prop.params.TZID;
  if (!tz) return new Date(wall); // floating time: treat as UTC wall time
  return new Date(wall - offsetMs(tz, wall));
}

/** Offset of a time zone from UTC at (approximately) a wall-clock instant, in ms. */
function offsetMs(timeZone: string, wallUtc: number): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const at = (t: number) => {
      const parts = Object.fromEntries(fmt.formatToParts(new Date(t)).map((p) => [p.type, p.value]));
      return Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!) - t;
    };
    // Two passes settle the guess across a DST change
    const first = at(wallUtc);
    return at(wallUtc - first);
  } catch {
    return 0;
  }
}

// ---------------------------------------------------------------- display

export function formatWhen(e: ChapterEvent, timeZone: string) {
  const part = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone, ...opts }).format(e.start);
  const time = (d: Date) =>
    new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" })
      .format(d)
      .replace(":00", "")
      .replace(/[\s\u202f]AM$/, " a.m.")
      .replace(/[\s\u202f]PM$/, " p.m.")
      .replace(/^12 p\.m\.$/, "noon");
  return {
    weekday: part({ weekday: "short" }),
    month: part({ month: "short" }),
    monthLong: part({ month: "long", year: "numeric" }),
    day: part({ day: "numeric" }),
    long: part({ weekday: "long", month: "long", day: "numeric" }),
    time: e.allDay ? "All day" : `${time(e.start)} – ${time(e.end)}`,
    iso: e.start.toISOString(),
  };
}
