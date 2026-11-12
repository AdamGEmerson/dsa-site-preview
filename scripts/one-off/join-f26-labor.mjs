// One-off (Nov 2026): on an existing site, swap the old Join DSA link (go.dsausa.org/fortworth) for
// the new one (go.dsausa.org/fort-worth-f26) wherever it's stored (page content, Chapter details,
// Sections, Menus), and add the Labor Working Group card to Our Work. Safe to re-run.
// EMDASH_URL + EMDASH_TOKEN, or the local dev bypass.
const base = (process.env.EMDASH_URL ?? "http://localhost:4330").replace(/\/$/, "");
let token = process.env.EMDASH_TOKEN;
if (!token) token = (await (await fetch(`${base}/_emdash/api/setup/dev-bypass?token=1&content=0`, { method: "POST", headers: { "X-EmDash-Request": "1", Origin: base } })).json()).data.token;
const headers = { Authorization: `Bearer ${token}`, "X-EmDash-Request": "1", "Content-Type": "application/json" };
const api = async (path, init = {}) => {
  const r = await fetch(`${base}/_emdash/api${path}`, { headers, ...init });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${init.method ?? "GET"} ${path}: ${r.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body.data;
};

// Matches the link with or without https:// and www, so both hrefs and link text change
const OLD = /(https?:\/\/)?(www\.)?go\.dsausa\.org\/fortworth(?![\w-])/g;
const NEW_URL = "https://go.dsausa.org/fort-worth-f26";
const swap = (value) => JSON.parse(JSON.stringify(value).replace(OLD, (_match, scheme) => (scheme ? NEW_URL : "go.dsausa.org/fort-worth-f26")));
const changed = (a, b) => JSON.stringify(a) !== JSON.stringify(b);

const LABOR = {
  heading: "Labor Working Group",
  body: "The Labor Working Group works with labor unions, organizes to create new unions, and supports striking workers. We seek to strengthen labor in Tarrant County by merging the militant & socialist currents within the labor movement to build working class power.",
  sticker: "",
  meeting_match: "",
};

// Page content and Chapter details
const entries = [["homepage", "home"], ["chapter", "fort-worth"], ...["events", "our-work", "about-us", "resources", "join"].map((s) => ["pages", s])];
for (const [collection, slug] of entries) {
  const item = (await api(`/content/${collection}/${slug}`)).item;
  let data = swap(item.data);
  if (collection === "pages" && slug === "our-work") {
    data.content = data.content.map((b) =>
      b._key === "working-groups" && !b.items.some((i) => i.heading === LABOR.heading) ? { ...b, items: [...b.items, LABOR] } : b,
    );
  }
  if (!changed(item.data, data)) continue;
  const patch = Object.fromEntries(Object.keys(data).filter((k) => changed(item.data[k], data[k])).map((k) => [k, data[k]]));
  await api(`/content/${collection}/${item.id}`, { method: "PUT", body: JSON.stringify({ data: patch }) });
  if (item.status === "published") await api(`/content/${collection}/${item.id}/publish`, { method: "POST", body: "{}" });
  console.log(`~ ${collection}/${slug}: ${Object.keys(patch).join(", ")}`);
}

// Sections (the closing call to action carries a Join DSA link)
for (const slug of ["final-cta", "footer", "not-found", "issue-ticker"]) {
  const section = await api(`/sections/${slug}`).catch(() => null);
  const s = section?.item ?? section;
  if (!s?.content) continue;
  const content = swap(s.content);
  if (!changed(s.content, content)) continue;
  await api(`/sections/${slug}`, { method: "PUT", body: JSON.stringify({ content }) });
  console.log(`~ section ${slug}`);
}

// Menus
for (const name of ["primary", "footer_organize", "footer_learn", "footer_connect"]) {
  for (const i of (await api(`/menus/${name}`)).items ?? []) {
    const url = i.customUrl ?? i.custom_url;
    if (url && OLD.test(url)) {
      OLD.lastIndex = 0;
      await api(`/menus/${name}/items/${i.id}`, { method: "PUT", body: JSON.stringify({ customUrl: NEW_URL }) });
      console.log(`~ menu ${name}: ${i.label}`);
    }
    OLD.lastIndex = 0;
  }
}
console.log("Done.");
