// Builds seed/seed.json: the schema (block types, collections), Sections, Menus, settings and the
// sample content for every page. Edit here, then:
//
//   npm run build-seed      # writes seed/seed.json and validates it
//   npm run sync-seed       # pushes schema and new entries to a running site (see that script)
//
// Text helpers: p() paragraph, li() bullet, h2()/h3() headings; [label](url) inside text becomes a
// link. b(type, key, data) makes a page-content block; keep keys stable (photos.json targets them).
import fs from "node:fs";

let k = 0;
const key = (p = "k") => `${p}${(++k).toString(36)}`;

// Portable Text helpers. Text may contain [label](url) links.
function spans(text, markDefs) {
  const out = [];
  const re = /\[([^\]]+)\]\(([^)]+)\)/g;
  let last = 0, m;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push({ _type: "span", _key: key("s"), text: text.slice(last, m.index), marks: [] });
    const mk = key("l");
    markDefs.push({ _type: "link", _key: mk, href: m[2] });
    out.push({ _type: "span", _key: key("s"), text: m[1], marks: [mk] });
    last = re.lastIndex;
  }
  if (last < text.length) out.push({ _type: "span", _key: key("s"), text: text.slice(last), marks: [] });
  return out;
}
const p = (text, style = "normal") => {
  const markDefs = [];
  return { _type: "block", _key: key("b"), style, markDefs, children: spans(text, markDefs) };
};
const li = (text) => ({ ...p(text), listItem: "bullet", level: 1 });
const h3 = (t) => p(t, "h3");
const h2 = (t) => p(t, "h2");

const JOIN = "https://go.dsausa.org/fort-worth-f26";
const ST = "https://fortworthdsa.solidarity.tech";
const GET_INVOLVED = `${ST}/get-involved-with-dsa-fort-worth`;
const CALENDAR = `${ST}/dsa-fort-worth-calendar`;
const DSA101 = `${ST}/dsa-101`;
const NEWSLETTER = `${ST}/subscribe-to-our-newsletter`;
const DONATE = `${ST}/donate-to-dsa-fort-worth`;
const DUES_WAIVER = "https://dsausa.org/dueswaiver";

// ------------------------------------------------------------------ field helpers
const f = (slug, label, type, extra = {}) => ({ slug, label, type, ...extra });
const sel = (slug, label, options, extra = {}) => f(slug, label, "select", { validation: { options }, ...extra });
const buttons = (label = "Buttons") =>
  f("buttons", label, "repeater", {
    validation: {
      subFields: [
        f("label", "Label", "string", { required: true }),
        f("url", "Link (a path like /about or a full URL)", "string", { required: true }),
        { slug: "style", label: "Style", type: "select", options: ["primary", "secondary"] },
      ],
    },
  });
const photo = (label) => [
  f("image", label, "image"),
  f("image_brief", `${label}: shot description (shown as a placeholder until there’s a photo)`, "string"),
  f("image_focus", `${label}: focal point (CSS object-position, e.g. "50% 30%")`, "string"),
];
const block = (slug, label, description, category, fields) => ({
  slug,
  label,
  description,
  category,
  currentVersion: 1,
  versions: [{ version: 1, fields }],
});

const blockTypes = [
  block("split", "Text and photo", "Eyebrow, heading, rich text and buttons beside a photo. Paper, white or dark band.", "Sections", [
    f("eyebrow", "Eyebrow (the small slanted line above the heading)", "string"),
    f("heading", "Heading", "string", { required: true }),
    f("body", "Text", "portableText"),
    ...photo("Photo"),
    sel("image_side", "Photo side", ["right", "left"]),
    f("sticker", "Sticker on the photo's corner (optional, one to three short words, e.g. Free)", "string", { validation: { maxLength: 24 } }),
    sel("tone", "Background", ["paper", "white", "dark"]),
    buttons(),
  ]),
  block("callout", "Callout band", "The loud full-width strip: a featured action, a newsletter ask. On red and dark, the eyebrow becomes a starburst sticker (keep it to two or three words). Actions are big ruled links (whole sentences are fine); buttons are short.", "Sections", [
    sel("tone", "Colour", ["red", "dark", "soft"]),
    f("eyebrow", "Eyebrow", "string"),
    f("heading", "Heading", "string", { required: true }),
    f("body", "Text", "portableText"),
    f("image", "Background photo (optional; duotoned into the band colour)", "image"),
    f("image_focus", 'Background photo: focal point (CSS object-position, e.g. "50% 30%")', "string"),
    f("actions", "Action links (large rows with an arrow)", "repeater", {
      validation: { subFields: [f("label", "Label", "string", { required: true }), f("url", "Link", "string", { required: true })] },
    }),
    buttons(),
  ]),
  block("events", "Upcoming events", "The next events from the chapter calendar (the calendar feed in Chapter details). Past events drop off on their own.", "Automatic", [
    f("eyebrow", "Eyebrow", "string"),
    f("heading", "Heading", "string", { required: true }),
    f("intro", "Intro", "text"),
    f("count", "How many events (3 to 6)", "integer", { validation: { min: 3, max: 6 } }),
    f("button_label", "Button label", "string"),
    f("button_url", "Button link", "string"),
    f("empty_text", "Shown when no upcoming events are posted", "string"),
  ]),
  block("featured_events", "Featured events", "A carousel of hand-picked events from the calendar. Paste each event's Solidarity Tech link; past events drop off on their own. With no upcoming picks it shows the next few events instead.", "Automatic", [
    f("eyebrow", "Eyebrow", "string"),
    f("heading", "Heading (optional)", "string"),
    f("picks", "Featured events (Solidarity Tech event links)", "repeater", {
      validation: { subFields: [f("url", "Event link, e.g. https://fortworthdsa.solidarity.tech/dsa-101", "url", { required: true })] },
    }),
    f("fallback_count", "When no picks are upcoming, show this many next events (0 hides the carousel)", "integer", { validation: { min: 0, max: 8 } }),
    f("banners", "Show each event's banner image from Solidarity Tech", "boolean"),
  ]),
  block("event_list", "Event calendar", "Every upcoming event from the calendar feed, grouped by month, with category filters (categories come from Chapter details).", "Automatic", [
    f("eyebrow", "Eyebrow", "string"),
    f("heading", "Heading", "string", { required: true }),
    f("intro", "Intro", "text"),
    f("days", "How far ahead, in days", "integer", { validation: { min: 7, max: 365 } }),
    f("button_label", "Button label", "string"),
    f("button_url", "Button link", "string"),
    f("empty_text", "Shown when no upcoming events are posted", "string"),
  ]),
  block("groups", "Group list", "Campaigns, working groups or committees: a heading and intro, then one card each. In a card's text, a paragraph that is only a link ([Sign the petition](https://…)) becomes a big action row. Give a card meeting words (e.g. housing working group) and it shows that group's next meeting from the calendar.", "Sections", [
    f("anchor", "Anchor (lets menus link to /page#anchor; lowercase, dashes)", "string", { validation: { pattern: "^[a-z0-9-]*$" } }),
    f("eyebrow", "Eyebrow", "string"),
    f("heading", "Heading", "string", { required: true }),
    f("intro", "Intro", "portableText"),
    sel("style", "Layout", ["feature", "cards"]),
    sel("tone", "Background", ["white", "paper", "dark"]),
    f("items", "Cards", "repeater", {
      validation: {
        subFields: [
          f("heading", "Name", "string", { required: true }),
          f("body", "Text (blank line between paragraphs; a paragraph that is only a link becomes an action row)", "text"),
          f("sticker", "Sticker (optional, one to three words)", "string"),
          f("meeting_match", "Meeting words from the calendar title (shows the next meeting)", "string"),
        ],
      },
    }),
  ]),
  block("embed_form", "Embedded form", "A Solidarity Tech form (donate, sign up, petition, contact) shown right on the page, beside a heading, text and an optional photo. Paste the form's normal Solidarity Tech link; the page loads its embed version and sizes it to fit.", "Sections", [
    f("anchor", "Anchor (lets links point to /page#anchor; lowercase, dashes)", "string", { validation: { pattern: "^[a-z0-9-]*$" } }),
    sel("tone", "Background", ["paper", "white", "dark"]),
    f("eyebrow", "Eyebrow", "string"),
    f("heading", "Heading", "string", { required: true }),
    f("body", "Text", "portableText"),
    ...photo("Photo (optional, under the text)"),
    f("form_url", "Solidarity Tech form link, e.g. https://fortworthdsa.solidarity.tech/donate-to-dsa-fort-worth", "url", { required: true }),
    f("form_title", "Form name for screen readers, e.g. Donate to DSA Fort Worth", "string"),
    f("payments", "Takes payments (allows card and wallet payments inside the form)", "boolean"),
  ]),
  block("notice", "Open or closed notice", "A boxed notice that switches between two messages, e.g. an application window. Tick Open to show the open message and its button; untick to show the closed message.", "Sections", [
    f("anchor", "Anchor (lowercase, dashes)", "string", { validation: { pattern: "^[a-z0-9-]*$" } }),
    f("open", "Open", "boolean"),
    f("open_heading", "Heading when open", "string"),
    f("open_text", "Text when open (**bold**, [links](https://…))", "text"),
    f("button_label", "Button label (when open)", "string"),
    f("button_url", "Button link (when open)", "string"),
    f("closed_heading", "Heading when closed", "string"),
    f("closed_text", "Text when closed (**bold**, [links](https://…))", "text"),
  ]),
  block("logos", "Organization logos", "A wall of organizations, each a logo linked to their website or Instagram. Without a logo the name shows instead. Hidden until it has at least one organization.", "Sections", [
    f("anchor", "Anchor (lowercase, dashes)", "string", { validation: { pattern: "^[a-z0-9-]*$" } }),
    f("eyebrow", "Eyebrow", "string"),
    f("heading", "Heading", "string", { required: true }),
    f("intro", "Intro", "text"),
    f("orgs", "Organizations", "repeater", {
      validation: {
        subFields: [
          f("name", "Name", "string", { required: true }),
          f("logo", "Logo (set its alt text to the organization's name)", "image"),
          f("url", "Website or Instagram link", "url"),
          f("note", "One line about them (optional)", "string"),
        ],
      },
    }),
  ]),
  block("cards", "Numbered cards", "Three or so steps or options, each with a short heading, a sentence and a button.", "Sections", [
    f("anchor", "Anchor (lets menus link to /page#anchor; lowercase, dashes)", "string", { validation: { pattern: "^[a-z0-9-]*$" } }),
    f("eyebrow", "Eyebrow", "string"),
    f("heading", "Heading", "string", { required: true }),
    f("intro", "Intro", "text"),
    f("items", "Cards", "repeater", {
      validation: {
        subFields: [
          f("heading", "Heading", "string", { required: true }),
          f("body", "Text", "text"),
          f("button_label", "Button label", "string"),
          f("button_url", "Button link", "string"),
        ],
      },
    }),
  ]),
  block("checklist", "Heading and checklist", "A big heading beside rich text; bulleted lists render as checkmarks.", "Sections", [
    sel("tone", "Background", ["white", "paper", "red"]),
    f("eyebrow", "Eyebrow", "string"),
    f("heading", "Heading", "string", { required: true }),
    f("body", "Text (use a bulleted list for the checklist)", "portableText"),
    buttons(),
  ]),
  block("faq", "FAQ", "Questions and answers, shown as an accordion and published as FAQ structured data. Answers take **bold**, *italic* and [links](https://…).", "Sections", [
    f("eyebrow", "Eyebrow", "string"),
    f("heading", "Heading", "string"),
    f("items", "Questions", "repeater", {
      validation: { subFields: [f("question", "Question", "string", { required: true }), f("answer", "Answer (a question without one stays hidden from visitors)", "text", { required: false })] },
    }),
  ]),
  block("text", "Text", "Eyebrow and heading beside rich text, with optional key figures underneath (e.g. 300+ / members in Tarrant County).", "Sections", [
    f("anchor", "Anchor (lets links point to /page#anchor; lowercase, dashes)", "string", { validation: { pattern: "^[a-z0-9-]*$" } }),
    sel("tone", "Background", ["white", "paper", "dark"]),
    f("eyebrow", "Eyebrow", "string"),
    f("heading", "Heading", "string"),
    f("body", "Text", "portableText"),
    f("stats", "Key figures (optional)", "repeater", {
      validation: { subFields: [f("figure", "Figure, e.g. 300+", "string", { required: true }), f("label", "Label, e.g. members in Tarrant County", "string", { required: true })] },
    }),
    buttons(),
  ]),
  block("gallery", "Photo slideshow", "Photos that rotate on their own (visitors can pause or step through). Each needs a photo with alt text describing it, a date and a short caption naming the activity. Hidden from visitors until at least one photo is added.", "Sections", [
    f("eyebrow", "Eyebrow", "string"),
    f("heading", "Heading", "string", { required: true }),
    f("slides", "Photos", "repeater", {
      validation: {
        subFields: [
          f("image", "Photo (set its alt text: what's in the picture)", "image"),
          f("caption", "Caption: the activity, e.g. Canvassing for a data center moratorium", "string"),
          f("date", "Date, e.g. October 2026", "string"),
        ],
      },
    }),
  ]),
  block("contact", "Contact", "How to reach the chapter: rich text on the left (use Heading 3 for each topic), a contact panel on the right with the form button and the email from Chapter details.", "Sections", [
    f("eyebrow", "Eyebrow", "string"),
    f("heading", "Heading", "string", { required: true }),
    f("body", "Text (Heading 3 per topic)", "portableText"),
    f("form_label", "Form button label", "string"),
    f("form_url", "Form link (Solidarity Tech form page)", "url"),
  ]),
  block("final_cta", "Get involved band", "The site-wide closing call to action. Its wording lives in Sections → “Final call to action”, so one edit changes every page.", "Automatic", [
    f("image", "Background photo (optional; duotoned into red)", "image"),
    f("image_focus", 'Background photo: focal point (CSS object-position, e.g. "50% 30%")', "string"),
  ]),
];
const allowedTypes = blockTypes.map((b) => b.slug);

// ------------------------------------------------------------------ collections
const hero = [
  f("eyebrow", "Hero eyebrow", "string"),
  f("h1", "Headline (H1)", "string", { required: true, searchable: true }),
  f("lead", "Subtitle (blank line between paragraphs)", "text", { searchable: true }),
  f("primary_label", "Primary button label", "string"),
  f("primary_url", "Primary button link", "string"),
  f("secondary_label", "Secondary button label", "string"),
  f("secondary_url", "Secondary button link", "string"),
  f("hero_image", "Hero photo", "image"),
  f("hero_image_brief", "Hero photo: shot description (shown as a placeholder until there’s a photo)", "string"),
  f("hero_image_focus", 'Hero photo: focal point (CSS object-position, e.g. "50% 30%")', "string"),
];
const content = f("content", "Page content", "blocks", { validation: { allowedTypes, maxItems: 40 } });

const collections = [
  {
    slug: "homepage",
    label: "Homepage",
    labelSingular: "Homepage",
    description: "One entry only (slug: home).",
    icon: "house",
    titleField: "title",
    urlPattern: "/",
    sortOrder: 1,
    supports: ["drafts", "revisions", "preview", "seo"],
    admin: { quickCreate: false },
    fields: [f("title", "Name (admin only)", "string", { required: true }), ...hero, content],
  },
  {
    slug: "pages",
    label: "Pages",
    labelSingular: "Page",
    description: "About, Events, Our Work, Resources and their sub-pages, at /{slug}.",
    icon: "file-text",
    titleField: "title",
    urlPattern: "/{slug}",
    sortOrder: 2,
    supports: ["drafts", "revisions", "preview", "seo", "search"],
    fields: [f("title", "Title", "string", { required: true, searchable: true }), ...hero, content],
  },
  {
    slug: "chapter",
    label: "Chapter details",
    labelSingular: "Chapter details",
    description: "One entry (slug: fort-worth). Links and facts used in the header, footer, events and structured data.",
    icon: "info",
    titleField: "title",
    sortOrder: 9,
    supports: ["revisions"],
    admin: { quickCreate: false },
    fields: [
      f("title", "Chapter name", "string", { required: true }),
      f("area", "Area we organize", "string"),
      f("join_url", "Join DSA link", "url"),
      f("get_involved_url", "Get Involved form link", "url"),
      f("newsletter_url", "Newsletter signup link", "url"),
      f("calendar_url", "Full calendar page", "url"),
      f("calendar_ics_url", "Calendar feed (.ics) from Solidarity Tech: Settings → Chapter Structure → Calendar Subscription", "url"),
      f("dsa_101_url", "DSA 101 RSVP link", "url"),
      f("donate_url", "Donate link", "url"),
      f("email", "Contact email", "string"),
      f("event_categories", "Event categories (the feed has none, so events are tagged by words in their titles; first match wins)", "repeater", {
        validation: {
          subFields: [
            f("name", "Category", "string", { required: true }),
            f("keywords", "Title words, comma-separated (e.g. canvass, petition)", "text", { required: true }),
            f("members_only", "Members only (badge, no RSVP button, no address)", "boolean"),
          ],
        },
      }),
      f("social", "Social accounts", "repeater", {
        validation: {
          subFields: [
            { slug: "network", label: "Network", type: "select", options: ["instagram", "facebook", "x", "bluesky", "tiktok", "youtube", "threads"] },
            f("url", "Profile link", "url", { required: true }),
          ],
        },
      }),
    ],
  },
];

// ------------------------------------------------------------------ sections
const sections = [
  {
    slug: "final-cta",
    title: "Final call to action",
    description:
      "The closing “Get involved” band (add it to a page with the Get involved band block). Heading 2 = headline. Paragraphs = text. A paragraph that is only a link becomes a button: the first is the primary button, the rest secondary.",
    keywords: ["cta", "join", "get involved", "global"],
    source: "theme",
    content: [
      h2("Help Build a Better World For Tarrant County"),
      p("No matter how you want to make a difference, you have a place in this work. Tell us what you care about, and we’ll help connect you to work that matters."),
      p(`[Get Involved](${GET_INVOLVED})`),
      p(`[Join DSA](${JOIN})`),
    ],
  },
  {
    slug: "issue-ticker",
    title: "Issue ticker",
    description: "The scrolling strip under the homepage hero. One short issue per bullet.",
    keywords: ["ticker", "issues", "global"],
    source: "theme",
    content: ["Housing", "Healthcare", "Strong Unions", "Economic Justice", "Immigrant Rights", "Democracy"].map(li),
  },
  {
    slug: "not-found",
    title: "Page not found",
    description: "The 404 page (shown for any address with no page, including pages not built yet). Heading 2 = headline. Paragraphs = text. A paragraph that is only a link becomes a button.",
    keywords: ["404", "not found", "global"],
    source: "theme",
    content: [h2("Pardon Our Mess"), p("We’re currently revolutionizing our web presence."), p("[Back to Home](/)"), p("[Upcoming Events](/events)")],
  },
  {
    slug: "footer",
    title: "Footer",
    description: "Footer wording. First paragraph: the line under the logo. Second paragraph: the sign-off at the bottom right.",
    keywords: ["footer", "global"],
    source: "theme",
    content: [p("Tarrant County’s democratic socialists. Member-funded, member-led."), p("No one is free until we are all free.")],
  },
];

// ------------------------------------------------------------------ menus
const c = (label, url, children) => ({ type: "custom", label, url, ...(children ? { children } : {}) });
const menus = [
  {
    name: "primary",
    label: "Header",
    items: [
      c("Events", "/events"),
      c("About Us", "/about-us"),
      c("Our Work", "/our-work", [c("Campaigns", "/our-work#campaigns"), c("Working Groups", "/our-work#working-groups"), c("Committees", "/our-work#committees")]),
      c("Resources", "/resources", [c("Bylaws", "/resources#bylaws"), c("Endorsements", "/resources#endorsements"), c("Chapter Structure", "/about-us#how-our-chapter-works"), c("Code of Conduct", "/resources#code-of-conduct"), c("Donate", "/join#donate")]),
    ],
  },
  { name: "footer_organize", label: "Footer: Organize", items: [c("Events", "/events"), c("Campaigns", "/our-work#campaigns"), c("Working Groups", "/our-work#working-groups"), c("Committees", "/our-work#committees")] },
  { name: "footer_learn", label: "Footer: Learn", items: [c("About Us", "/about-us"), c("Our Work", "/our-work"), c("Resources", "/resources"), c("DSA 101", DSA101)] },
  { name: "footer_connect", label: "Footer: Connect", items: [c("Join DSA", "/join"), c("Get Involved", GET_INVOLVED), c("Newsletter", NEWSLETTER), c("Full Calendar", CALENDAR)] },
];

// ------------------------------------------------------------------ content
const b = (type, _key, data) => ({ _type: type, _version: 1, _key, ...data });
const btn = (label, url, style = "primary") => ({ label, url, style });

const home = {
  id: "homepage-home",
  slug: "home",
  status: "published",
  data: {
    title: "Home",
    eyebrow: "Democratic Socialists of America - Tarrant County",
    h1: "Building Socialism Across Tarrant County",
    lead: "DSA Fort Worth brings working-class people together to fight for economic justice, strengthen democracy, and create a Tarrant County where everyone can live with dignity.",
    primary_label: "Join DSA",
    primary_url: JOIN,
    secondary_label: "Get Involved",
    secondary_url: GET_INVOLVED,
    hero_image_brief: "Members and neighbors rallying in Fort Worth, signs up",
    content: [
      b("split", "who-we-are", {
        eyebrow: "Who We Are",
        heading: "Building Working-Class Power",
        body: [
          p("DSA Fort Worth is a member-funded, member-driven organization building working-class power across Tarrant County. Our work is shaped and funded by everyday people and not corporations or wealthy donors. Members help decide our priorities, elect chapter leaders, develop campaigns, and carry out the work necessary to win change."),
          p("We organize for economic justice by championing housing, healthcare, strong unions, and public institutions that meet people’s needs. Our politics are anti-imperialist because we believe every person, everywhere, has the right to live a free, humane, and dignified life."),
          p("We believe people are capable of making the decisions that affect their workplaces, neighborhoods, communities, and government. By organizing together, we can build a more democratic society and economy that works for everyone."),
        ],
        image_brief: "Members at a general meeting at Finn’s Place",
        image_side: "right",
        tone: "paper",
        buttons: [btn("Learn About DSA Fort Worth", "/about-us", "secondary")],
      }),
      b("callout", "featured-action", {
        tone: "red",
        eyebrow: "Featured Action",
        heading: "Help Stop Data Center Expansion in Fort Worth",
        body: [
          p("Data centers are expanding across Fort Worth, consuming our water and energy while polluting our environment. DSA Fort Worth is organizing residents to push Fort Worth City Council to adopt a moratorium on new data center developments."),
        ],
        actions: [
          { label: "Sign the petition to demand a stop to new data center development in Fort Worth", url: `${ST}/stop-data-center-development-in-fort-worth` },
          { label: "Join an upcoming canvass to take action with DSA", url: `${ST}/no-data-centers-in-fort-worth-canvass-for-a-moratorium?event_session_ids=97013` },
        ],
        buttons: [],
      }),
      b("events", "upcoming-events", {
        eyebrow: "Upcoming Events",
        heading: "Organize, Learn, and Build Community",
        intro: "From campaign actions and political education to chapter meetings and social events, there are plenty of ways to meet local organizers and get involved with DSA Fort Worth.",
        count: 6,
        button_label: "View Full Calendar",
        button_url: "/events",
        empty_text: "New events are posted every week. Check the full calendar.",
      }),
      b("split", "dsa-101", {
        eyebrow: "DSA Fort Worth 101",
        heading: "New to DSA Fort Worth? Start Here.",
        body: [
          p("DSA Fort Worth 101 introduces you to democratic socialism, our chapter, and the work we’re doing across Tarrant County. You’ll learn how DSA operates as a member-led organization, how our chapter makes decisions, and how members and supporters can get involved in campaigns, working groups, committees, events, and political education."),
          p("Whether you are ready to join or simply curious about DSA, this session will help you understand who we are and find your place in the chapter."),
        ],
        image_brief: "Comrades at a DSA 101 session",
        image_side: "left",
        sticker: "Come Say Hi!",
        tone: "dark",
        buttons: [btn("Attend DSA 101", DSA101)],
      }),
      b("cards", "get-involved", {
        eyebrow: "Ways to Get Involved",
        heading: "Get Involved, Stay Connected",
        intro: "Ready to make a difference in Tarrant County? Below are a few ways you can plug in and get involved.",
        items: [
          { heading: "Join DSA", body: "Become a dues-paying member and help shape the priorities, leadership, and work of your local DSA chapter.", button_label: "Become a Member", button_url: JOIN },
          { heading: "Attend an Upcoming Event", body: "Meet local organizers through campaign actions, political education, chapter meetings, and community events.", button_label: "Explore Upcoming Events", button_url: "/events" },
          { heading: "Find Your Place", body: "Tell us about your interests, skills, and availability. We’ll help connect you with a campaign, working group, committee, or upcoming opportunity.", button_label: "Fill Out the Get Involved Form", button_url: GET_INVOLVED },
        ],
      }),
      b("checklist", "why-join", {
        tone: "white",
        eyebrow: "Why Join DSA?",
        heading: "Join the Largest, Socialist Organization in U.S. History",
        body: [
          p("Our power comes from people choosing to organize together. When you join DSA, you become part of shaping what our chapter does and what we can accomplish across Tarrant County."),
          p("As a member of DSA Fort Worth, you can:"),
          li("Propose new projects and areas of work"),
          li("Vote on chapter priorities, resolutions, endorsements, and leadership"),
          li("Help develop campaigns and organizing strategies"),
          li("Join working groups and committees"),
          li("Build organizing efforts, communications, research, and leadership skills"),
          li("Organize alongside people committed to working to build socialism in our community"),
        ],
        buttons: [btn("Join DSA", JOIN), btn("Attend DSA 101 to Learn More", DSA101, "secondary")],
      }),
      b("callout", "newsletter", {
        tone: "soft",
        eyebrow: "Newsletter Signup",
        heading: "Know What’s Happening. Be Ready to Act.",
        body: [
          p("Decisions affecting our neighborhoods, workplaces, public resources, and rights can move quickly. Subscribe to the DSA Fort Worth newsletter for local campaign updates, upcoming events, political education, community resources, and opportunities to take action."),
        ],
        actions: [],
        buttons: [btn("Sign Up for Updates", NEWSLETTER)],
      }),
      b("final_cta", "final-cta", {}),
      b("faq", "faq", {
        heading: "Frequently Asked Questions",
        items: [
          { question: "What is DSA?", answer: "The Democratic Socialists of America is a member-funded, member-led political organization. DSA members organize in their workplaces, communities, and political institutions to build a society and economy that meets people’s needs democratically. [Democratic Socialists of America →](https://www.dsausa.org/)" },
          { question: "What does DSA Fort Worth do?", answer: "DSA Fort Worth organizes people across Tarrant County through campaigns, working groups, community events, and other forms of collective action. Our priorities and activities are determined by our members." },
          { question: "How do I join DSA Fort Worth?", answer: `Join DSA through [go.dsausa.org/fort-worth-f26](${JOIN}). After joining the national organization, your membership information will be shared with the local chapter through regular membership updates.` },
        ],
      }),
    ],
  },
};

const eventsPage = {
  id: "pages-events",
  slug: "events",
  status: "published",
  data: {
    title: "Events",
    eyebrow: "Events",
    h1: "Organize, Learn, and Build Community",
    lead: "DSA Fort Worth hosts campaign actions, political education, chapter meetings, and social events throughout Tarrant County. Whether you are a longtime member or learning about DSA for the first time, our events offer a way to meet local organizers, explore socialist politics, and find your place in the chapter.",
    primary_label: "View Upcoming Events",
    primary_url: CALENDAR,
    hero_image_brief: "Members at a chapter event",
    content: [
      b("featured_events", "featured-events", {
        eyebrow: "Featured Events",
        heading: "",
        picks: [
          { url: `${ST}/dsa-101` },
          { url: `${ST}/coffee-with-comrades` },
          { url: `${ST}/rose-buddy-mentorship-program-graduation-celebration` },
        ],
        fallback_count: 4,
        banners: true,
      }),
      b("event_list", "event-calendar", {
        eyebrow: "Upcoming Events Calendar",
        heading: "Find an Upcoming Event",
        intro: "From campaign actions and political education to chapter meetings and social events, there are plenty of ways to meet local organizers and get involved with DSA Fort Worth.",
        days: 90,
        button_label: "View Full Calendar",
        button_url: CALENDAR,
        empty_text: "New events are posted every week. Check the full calendar.",
      }),
      b("split", "dsa-101", {
        eyebrow: "DSA Fort Worth 101",
        heading: "New to DSA? Start Here.",
        body: [
          p("DSA Fort Worth 101 introduces you to democratic socialism, our chapter, and the work we are building across Tarrant County."),
          p("During the session, you will learn:"),
          li("What DSA is and what democratic socialists believe"),
          li("How DSA Fort Worth is organized"),
          li("How members make chapter decisions"),
          li("What our campaigns, working groups, and committees do"),
          li("How to join DSA and become active"),
          p("You do not need to be a member or have previous organizing experience to attend."),
        ],
        image_brief: "Comrades at a DSA 101 session",
        image_side: "left",
        tone: "dark",
        sticker: "Come Say Hi!",
        buttons: [btn("Attend DSA 101", DSA101)],
      }),
      b("final_cta", "final-cta", {}),
      b("faq", "faq", {
        heading: "Frequently Asked Questions",
        items: [
          { question: "Do I have to be a member to attend events?", answer: "Many DSA Fort Worth events and activities are open to non-members. Certain votes, elections, meetings, and internal activities are limited to members in good standing." },
          { question: "Does DSA do social events outside of chapter meetings?" },
          { question: "What types of political education events are available?" },
        ],
      }),
    ],
  },
};

const ourWorkPage = {
  id: "pages-our-work",
  slug: "our-work",
  status: "published",
  data: {
    title: "Our Work",
    eyebrow: "Our Work",
    h1: "What We Do",
    lead: "DSA Fort Worth members are organizing across Tarrant County. Our chapter’s campaigns and initiatives fight for lasting change in our communities and work to build working-class power.",
    primary_label: "Get Involved",
    primary_url: GET_INVOLVED,
    secondary_label: "View Upcoming Events",
    secondary_url: CALENDAR,
    hero_image_brief: "Members canvassing a Fort Worth neighborhood",
    content: [
      b("groups", "campaigns", {
        anchor: "campaigns",
        eyebrow: "Campaigns",
        heading: "Turning Our Vision Into Action",
        intro: [
          p("Campaigns are chapter-wide efforts meant to achieve a specific political or organizing goal. They give members and community supporters a way to transform shared concerns into collective power through research, political education, canvassing, public pressure, coalition work, and direct action."),
          p("Our campaigns address immediate conditions while building the relationships, skills, and organizational power needed to fight for a more democratic and socialist future."),
        ],
        style: "feature",
        tone: "paper",
        items: [
          {
            heading: "No More Data Centers in Fort Worth",
            body: `Data centers are expanding across Fort Worth, consuming our water and energy while polluting our environment. DSA Fort Worth is organizing residents to push Fort Worth City Council to adopt a moratorium on new data center developments.\n\n[Sign the petition to demand a stop to new data center development in Fort Worth](${ST}/stop-data-center-development-in-fort-worth)\n\n[Join an upcoming canvass to take action with DSA](${ST}/no-data-centers-in-fort-worth-canvass-for-a-moratorium?event_session_ids=97013)`,
            sticker: "Featured Campaign",
            meeting_match: "",
          },
          {
            heading: "Power to the Tenants",
            body: "Tenants across Tarrant County are facing rising housing costs, unsafe living conditions, and unresponsive property management. DSA Fort Worth is organizing to build united tenant power across Tarrant County so that working-class people can transform their neighborhoods and communities.",
            sticker: "",
            meeting_match: "",
          },
        ],
      }),
      b("groups", "working-groups", {
        anchor: "working-groups",
        eyebrow: "Working Groups",
        heading: "Building Working Class Power",
        intro: [p("Our Working Groups are organized around ongoing political issues such as housing, immigrant justice, and electoral power. Working groups provide a lasting home where members can study an issue, develop strategy, and propose campaigns.")],
        style: "cards",
        tone: "white",
        items: [
          { heading: "Housing Working Group", body: "The Housing Working Group organizes alongside Tarrant Tenants United and local tenant associations to help build a powerful, fighting, and socialist-oriented tenant movement in Tarrant County.", sticker: "", meeting_match: "" },
          { heading: "Abolish ICE Working Group", body: "The Abolish ICE Working Group organizes around immigrant rights, detention and deportation, surveillance, political repression, and the broader systems that criminalize immigrant communities.", sticker: "", meeting_match: "" },
          { heading: "Electoral Working Group", body: "The Electoral Working Group organizes to build an independent socialist political bloc in local and state government that represents people over profit and advances economic justice, anti-imperialism, and democracy for all.", sticker: "", meeting_match: "" },
          { heading: "Labor Working Group", body: "The Labor Working Group works with labor unions, organizes to create new unions, and supports striking workers. We seek to strengthen labor in Tarrant County by merging the militant & socialist currents within the labor movement to build working class power.", sticker: "", meeting_match: "" },
        ],
      }),
      b("groups", "committees", {
        anchor: "committees",
        eyebrow: "Committees",
        heading: "Fueling Our Work",
        intro: [
          p("Campaigns and working groups depend on strong internal infrastructure. DSA Fort Worth’s committees provide the communications, education, technology, membership development, and administrative support needed to sustain our organizing."),
          p("Committees are open to members who want to contribute their skills, learn something new, and help build an organization capable of winning a better world."),
        ],
        style: "cards",
        tone: "dark",
        items: [
          { heading: "Communications and Design Committee", body: "The Communications and Design Committee shapes how DSA Fort Worth communicates with members, supporters, and the broader public.", sticker: "", meeting_match: "" },
          { heading: "Growth and Development Committee", body: "The Growth and Development Committee helps recruit, onboard, and develop members in the chapter. The committee develops the chapter’s recruitment, onboarding, retention, mentorship, community outreach, and fundraising strategies.", sticker: "", meeting_match: "" },
          { heading: "Political Education Committee", body: "The Political Education Committee creates accessible opportunities for members to study socialist history, theory, and strategy. By developing members as both teachers and learners, the committee helps build the shared knowledge needed to understand local conditions, evaluate strategy, and connect the chapter’s campaigns to a broader socialist vision.", sticker: "", meeting_match: "" },
          { heading: "Technology and Information Security Committee", body: "The Technology and Information Security Committee maintains the digital tools and infrastructure that support DSA Fort Worth’s organizing. The committee manages systems used for chapter communications, websites, membership information, data management, and internal collaboration while promoting strong privacy, security, accessibility, and maintenance practices.", sticker: "", meeting_match: "" },
        ],
      }),
      b("final_cta", "final-cta", {}),
      b("faq", "faq", {
        heading: "Frequently Asked Questions",
        items: [
          { question: "What is the difference between a working group and a committee?", answer: "Working groups organize around political issues such as housing, immigrant justice, labor, and electoral power. Committees build the internal administrative capacity needed to sustain the chapter, including communications, political education, technology, and membership development." },
          { question: "How do I join a working group or committee?", answer: "Attend an upcoming meeting or complete the chapter’s Get Involved form. You can identify the areas that interest you and a chapter organizer will help connect you with the appropriate group." },
          { question: "Can members propose new work?", answer: "Yes. DSA Fort Worth members can develop ideas, organize with other members, and use the chapter’s democratic processes to propose campaigns, projects, working groups, and other initiatives." },
          { question: "How can I become active in the chapter?", answer: `You can attend DSA Fort Worth 101, come to an event or meeting, or complete the Get Involved form. The Get Involved form helps us to identify and connect you to campaigns, working groups, committees, and activities that interest you. [Get Involved Form](${GET_INVOLVED}).` },
          { question: "Do I need experience to participate?", answer: "No. Members with all levels of experience can attend meetings, learn new skills, and contribute based on their interests and capacity. Working groups and committees should help members develop and do not expect everyone to arrive as an expert." },
        ],
      }),
    ],
  },
};

const aboutPage = {
  id: "pages-about-us",
  slug: "about-us",
  status: "published",
  data: {
    title: "About Us",
    h1: "About DSA Fort Worth",
    lead: "DSA Fort Worth is a member-funded, member-led democratic socialist organization building working-class power throughout Tarrant County.",
    primary_label: "Join DSA",
    primary_url: JOIN,
    secondary_label: "Get Involved",
    secondary_url: GET_INVOLVED,
    hero_image_brief: "Members at a general meeting",
    content: [
      b("text", "about", {
        tone: "white",
        eyebrow: "About Us",
        heading: "Building Socialist Power in Tarrant County",
        body: [
          p("DSA Fort Worth is a chapter of the Democratic Socialists of America, the largest socialist organization in the United States. As of 2026, DSA has more than 120,000 members nationally. Locally, we’re more than 300 members in Tarrant County."),
          p("Together, we organize for economic justice by championing housing, healthcare, strong unions, and public institutions that meet people’s needs and are building a more democratic society and economy that works for everyone."),
        ],
        stats: [
          { figure: "120,000+", label: "DSA members nationally" },
          { figure: "300+", label: "members in Tarrant County" },
        ],
        buttons: [],
      }),
      b("gallery", "gallery", {
        eyebrow: "Gallery",
        heading: "Organizing Across Tarrant County",
        slides: [],
      }),
      b("text", "democratic-socialism", {
        tone: "paper",
        eyebrow: "What Is Democratic Socialism?",
        heading: "Democracy Should Extend to Every Part of Our Lives",
        body: [
          p("Democratic socialism is the belief that people should have a meaningful voice in the decisions that shape their lives. This extends past government and into our workplaces, neighborhoods, and economy."),
          p("Democratic socialists seek an economy around human needs rather than private profit. That includes expanding democratic control over essential institutions and resources, strengthening the power of workers and tenants, and ensuring that everyone has access to housing, healthcare, education, transportation, and the conditions necessary for a dignified life."),
          p("We believe ordinary people are capable of governing their communities, shaping public priorities, and making collective decisions about the institutions on which they depend."),
        ],
        stats: [],
        buttons: [btn("Learn More About Democratic Socialism", "https://www.dsausa.org/about-us/what-is-democratic-socialism/")],
      }),
      b("checklist", "program", {
        tone: "white",
        eyebrow: "Our Values and Political Program",
        heading: "What We Are Working Toward",
        body: [
          p("National DSA’s Workers Deserve More program presents a shared vision organized around three broad areas:"),
          li("Thriving working-class communities"),
          li("A working-class foreign policy"),
          li("Working-class democracy"),
          p("The program includes housing and healthcare for all, labor rights, socialist feminism, an end to mass incarceration, environmental justice, opposition to U.S. military intervention, abolishing ICE, and greater democratic control of government, workplaces, and the economy."),
        ],
        buttons: [btn("Learn More About Workers Deserve More", "https://program.dsausa.org/")],
      }),
      b("groups", "how-it-works", {
        anchor: "how-our-chapter-works",
        eyebrow: "How Our Chapter Works",
        heading: "A Chapter Governed by Its Members",
        intro: [
          p("DSA Fort Worth is a democratic, member-led organization. Members in good standing collectively determine the chapter’s political direction, priorities, leadership, and use of resources."),
          p("Members exercise that authority through chapter meetings and elections. They may introduce proposals, deliberate on chapter business, vote on resolutions and endorsements, amend the bylaws, and elect chapter officers."),
        ],
        style: "cards",
        tone: "dark",
        items: [
          { heading: "Chapter General Meetings", body: `General meetings are the highest decision-making body of DSA Fort Worth. They provide members with a regular opportunity to receive updates, discuss chapter business, introduce proposals, and vote on decisions affecting the organization.\n\nWhile open to members and supporters, voting rights are reserved for members in good standing. [To become a member, click here](${JOIN}).`, sticker: "", meeting_match: "" },
          { heading: "Working Groups", body: "Working groups organize around specific political issues or areas of work, such as housing, electoral organizing, labor, and immigrant justice.\n\nThese bodies may research local conditions, develop proposals, organize events, recruit volunteers, and coordinate campaigns. Their work remains accountable to the chapter and the authority granted to them through chapter decisions and governing documents. [Learn more about working groups here](/our-work#working-groups).", sticker: "", meeting_match: "" },
          { heading: "Committees", body: "Committees build and maintain the chapter’s internal organizing capacity. Their responsibilities may include communications, membership development, political education, technology and security, fundraising, and other operational needs.\n\nMembers can join committees to develop skills, contribute to chapter operations, and help create the infrastructure needed to sustain organizing over time. [Learn more about committees here](/our-work#committees).", sticker: "", meeting_match: "" },
          { heading: "Campaigns", body: "Campaigns are coordinated efforts to achieve specific political or organizing objectives. A campaign may be developed by any member in good standing with DSA Fort Worth, proposed to, and approved by the chapter.\n\nCampaigns translate the chapter’s political priorities into concrete action through activities such as canvassing, public education, coalition work, petitions, direct action, and engagement with public institutions. [Learn more about chapter campaigns here](/our-work#campaigns).", sticker: "", meeting_match: "" },
          { heading: "Steering Committee", body: "DSA Fort Worth’s Steering Committee is composed of ten officers elected by the chapter’s members. Together, they are responsible for maintaining the organization between chapter meetings and carrying out the duties assigned to them by the bylaws. [Learn more about our chapter structure here](/resources#bylaws).", sticker: "", meeting_match: "" },
        ],
      }),
      b("text", "grievance", {
        anchor: "grievance-policy",
        tone: "paper",
        eyebrow: "Accountability and Member Safety",
        heading: "Our Grievance Policy",
        body: [
          p("DSA Fort Worth is committed to maintaining an organizing environment where members and participants are treated with dignity and respect. Our grievance policy provides a formal process for addressing harassment, discrimination, retaliation, violations of the Code of Conduct, and other conduct covered by the policy."),
          p("If you have a question about the grievance process or need to raise a concern, contact [DSAFortWorthHGOs@gmail.com](mailto:DSAFortWorthHGOs@gmail.com). Messages sent to this address are handled and managed by our chapter’s elected Harassment Grievance Officers."),
        ],
        stats: [],
        buttons: [btn("Read the Policy", "https://drive.google.com/file/d/1NmGDQqUTqrY5QXY0M_CP7z1-UatUhGn1/view?usp=sharing")],
      }),
      b("text", "dfw", {
        tone: "white",
        eyebrow: "DSA Across DFW",
        heading: "Find a DSA Chapter or Branch Near You",
        body: [
          p("DSA Fort Worth organizes throughout Tarrant County, but DSA chapters and branches are active in communities across the metroplex:"),
          li("[DSA North Texas](https://dsa-ntx.org/)"),
          li("[DSA Denton](https://www.instagram.com/dsadenton)"),
          li("[UNT YDSA](https://www.instagram.com/untydsa)"),
          p("If you live outside of North Texas, access our [National Chapter Directory](https://www.dsausa.org/chapters/) to find a chapter near you."),
        ],
        stats: [],
        buttons: [],
      }),
      b("contact", "contact", {
        eyebrow: "Contact Us",
        heading: "Get Connected with DSA Fort Worth",
        body: [
          h3("Reach our Chapter"),
          p("Have a question about DSA Fort Worth, membership, an upcoming event, or our work in Tarrant County? Email [steering@dsafw.com](mailto:steering@dsafw.com) or use the contact form below."),
          h3("Partnership Requests"),
          p("Community organizations interested in collaborating with DSA Fort Worth can use the contact form and select Partnership or coalition requests."),
          h3("Press and Media"),
          p("For press and media inquiries, please contact [steering@dsafw.com](mailto:steering@dsafw.com)."),
        ],
        form_label: "Open the Contact Form",
        form_url: `${ST}/contact-us`,
      }),
      b("final_cta", "final-cta", {}),
      b("faq", "faq", {
        heading: "Frequently Asked Questions",
        items: [
          { question: "What area does DSA Fort Worth serve?", answer: "DSA Fort Worth is the Tarrant County chapter of the Democratic Socialists of America. We organize in Fort Worth and cities within Tarrant County." },
          { question: "How Decisions Are Made", answer: "DSA Fort Worth is governed by its members. Members vote on chapter priorities, elect chapter leaders, and participate in decisions through the processes established in the chapter’s bylaws." },
          { question: "How is DSA Fort Worth funded?", answer: "The chapter is funded by members and individual supporters. It does not rely on corporate funding. Membership dues and local donations support organizing, events, and chapter activities." },
          { question: "Do I need to agree with every DSA position?", answer: "DSA is a democratic membership organization whose positions are established through member deliberation and voting. Members may hold different views about strategy and particular issues while organizing around democratically adopted priorities." },
        ],
      }),
    ],
  },
};

const resourcesPage = {
  id: "pages-resources",
  slug: "resources",
  status: "published",
  data: {
    title: "Resources",
    eyebrow: "Resources",
    h1: "Explore Chapter Resources",
    lead: "Find DSA Fort Worth’s governing documents, candidate endorsement information, and gain access to community organizations and resources serving people across Tarrant County.",
    hero_image_brief: "",
    content: [
      b("groups", "chapter-documents", {
        anchor: "chapter-documents",
        eyebrow: "Chapter Documents",
        heading: "How Our Chapter Operates",
        intro: [p("DSA Fort Worth’s governing documents explain how members make decisions, elect leaders, and maintain organizational standards.")],
        style: "cards",
        tone: "white",
        items: [
          { heading: "Bylaws", body: "Our bylaws establish the chapter’s membership requirements, leadership structure, elections, meetings, decision-making processes, and other governing rules.\n\n[Read Our Bylaws](https://drive.google.com/file/d/1GUE706ANpMzgLXCc4xDumOdQZzXAQdwK/view)", sticker: "", meeting_match: "" },
          { heading: "Code of Conduct", body: "The DSA Code of Conduct establishes expectations for how members treat one another at chapter meetings, events, and organizing activities as well as in chapter communications.\n\n[Read the Code of Conduct](https://www.dsausa.org/dsa-code-of-conduct-for-members/)", sticker: "", meeting_match: "" },
          { heading: "Grievance Policy", body: "Our Grievance Policy explains how members can raise concerns about conduct regarding harm and harassment and explains how those concerns are reviewed and addressed.\n\n[Read the Grievance Policy](https://drive.google.com/file/d/1NmGDQqUTqrY5QXY0M_CP7z1-UatUhGn1/view?usp=sharing)", sticker: "", meeting_match: "" },
        ],
      }),
      b("cards", "endorsements", {
        anchor: "endorsements",
        eyebrow: "Electoral Endorsements",
        heading: "Seeking DSA Fort Worth’s Endorsement",
        intro: "Candidates interested in DSA Fort Worth’s endorsement must complete the chapter’s endorsement process.",
        items: [
          { heading: "Application and Questionnaire", body: "To begin the endorsement process, a candidate seeking the endorsement of DSA Fort Worth must submit an application and, shortly after, complete a candidate questionnaire.", button_label: "", button_url: "" },
          { heading: "Engagement with Membership", body: "Upon completing the questionnaire, it is mandatory that the candidate seeking an endorsement hold a Candidate Forum with membership prior to the general meeting where voting will take place. These meetings will be an opportunity for the candidate to introduce themselves and field questions from general membership.", button_label: "", button_url: "" },
          { heading: "Voting", body: "Following the Candidate Forum, a resolution to endorse the candidate will be brought up before a vote at a general meeting. An endorsement resolution will require a majority vote in favor of voters who are present to pass.", button_label: "", button_url: "" },
        ],
      }),
      b("notice", "endorsement-window", {
        anchor: "apply-for-endorsement",
        open: false,
        open_heading: "Apply For Endorsement",
        open_text: "Submit an application to DSA Fort Worth. A representative will contact you within 14 business days to begin the endorsement process.",
        button_label: "Apply",
        button_url: "",
        closed_heading: "Candidate Endorsement Application",
        closed_text: "Thank you for your interest in our endorsement. We are not accepting endorsement applications at this time. If you would like more information on our endorsement process, please reach out to [steering@dsafw.com](mailto:steering@dsafw.com).",
      }),
      b("logos", "community-resources", {
        anchor: "community-resources",
        eyebrow: "Community Resources",
        heading: "Community Resources",
        intro: "",
        orgs: [],
      }),
      b("faq", "faq", {
        heading: "Frequently Asked Questions",
        items: [
          { question: "How are chapter bylaws updated?" },
          { question: "How do I report harassment or misconduct?", answer: "DSA Fort Worth maintains a grievance process for reporting harm or harassment covered by the chapter’s Code of Conduct and grievance policy. Reports should be submitted through the designated grievance channel rather than the chapter’s general contact methods." },
          { question: "Can a candidate also be endorsed by National DSA?" },
        ],
      }),
    ],
  },
};

const joinPage = {
  id: "pages-join",
  slug: "join",
  status: "published",
  data: {
    title: "Join DSA",
    eyebrow: "Join DSA",
    h1: "Become a Member of DSA",
    lead: "With over 120,000 members and counting, the Democratic Socialists of America is the largest socialist organization in the United States. Chapters like ours across the country are organizing together for a better world.\n\nUpon joining DSA, you are sorted into a chapter based on where you live and gain access to membership rights like voting, proposing new work, and shaping your local chapter.",
    primary_label: "Join DSA",
    primary_url: JOIN,
    hero_image_brief: "",
    content: [
      b("embed_form", "donate-form", {
        anchor: "donate",
        tone: "paper",
        eyebrow: "Donate to DSA Fort Worth",
        heading: "Support DSA Fort Worth with Local Dues",
        image_brief: "Marchers holding red Socialism Beats Fascism! signs",
        form_url: DONATE,
        form_title: "Donate to DSA Fort Worth",
        payments: true,
        body: [
          p("As a membership organization, dues are the backbone of our national and local operations. While national dues are required to become a member of DSA, Local dues provide a way to directly fund the work of our chapter and are a 100% contribution to DSA Fort Worth."),
          p("The Democratic Socialists of America Fort Worth is a 501(c)(4) organization. Donations are not tax-deductible."),
        ],
      }),
      b("faq", "faq", {
        heading: "Frequently Asked Questions",
        items: [
          { question: "How much does DSA membership cost?", answer: `Members may pay monthly or annual dues, with multiple sliding scale options to meet members' financial needs. DSA also provides dues-waiver options for people experiencing financial hardship. [Dues Waiver](${DUES_WAIVER}).` },
          { question: "Can I donate without becoming a member?", answer: "Yes. You can make a one-time or recurring donation directly to DSA Fort Worth. Donations support local organizing but do not provide DSA membership or chapter voting rights. [Donate to DSA Fort Worth](/join#donate)." },
          { question: "Are donations tax-deductible?", answer: "No. DSA Fort Worth is organized as a 501(c)(4), and donations are not tax-deductible." },
        ],
      }),
    ],
  },
};

const chapter = {
  id: "chapter-fort-worth",
  slug: "fort-worth",
  status: "published",
  data: {
    title: "DSA Fort Worth",
    area: "Tarrant County",
    join_url: JOIN,
    get_involved_url: GET_INVOLVED,
    newsletter_url: NEWSLETTER,
    calendar_url: CALENDAR,
    calendar_ics_url: "https://www.solidarity.tech/calendar/o/GdI5nnneUqgOeh2bdyVI3lxtpBE8L9WLAn3PIXinKfQ.ics",
    dsa_101_url: DSA101,
    donate_url: DONATE,
    email: "steering@dsafw.com",
    social: [{ network: "instagram", url: "https://www.instagram.com/dsafortworth/" }],
    event_categories: [
      { name: "General Meeting", keywords: "general meeting, general body, gbm", members_only: false },
      { name: "DSA 101", keywords: "dsa 101, orientation, new member", members_only: false },
      { name: "Working Group", keywords: "working group, working session, abolish ice monthly", members_only: true },
      { name: "Committee", keywords: "committee, steering, commission, monthly meeting, quarterly meeting", members_only: true },
      { name: "Campaign Action", keywords: "canvass, petition, phonebank, phone bank, rally, march, protest, picket, testify, city council, door knock", members_only: false },
      { name: "Political Education", keywords: "let's watch, let's read, reading group, political education, pol ed, book club, teach-in, study group, workshop, training", members_only: false },
      { name: "Social", keywords: "coffee, watch, social, happy hour, party, potluck, celebration, bowling, run club, picnic", members_only: false },
    ],
  },
};

const seed = {
  $schema: "https://emdashcms.com/seed.schema.json",
  version: "1",
  meta: { name: "DSA Fort Worth", description: "dsafw.com: schema, block types, sections, menus and the homepage.", author: "DSA Fort Worth" },
  settings: { title: "DSA Fort Worth", tagline: "Building Socialism Across Tarrant County", url: "https://dsafw.com", timezone: "America/Chicago", seo: { titleSeparator: "|" } },
  blockTypes,
  collections,
  sections,
  menus,
  content: { homepage: [home], pages: [eventsPage, ourWorkPage, aboutPage, resourcesPage, joinPage], chapter: [chapter] },
};

const out = process.argv[2] ?? new URL("../seed/seed.json", import.meta.url);
fs.writeFileSync(out, JSON.stringify(seed, null, 2) + "\n");
console.log(`wrote ${out}`);
