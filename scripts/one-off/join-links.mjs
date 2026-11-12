// One-off: Join page links. Menus (Resources → Donate, footer Join DSA → /join) and the homepage's
// event links (→ /events). Safe to re-run. EMDASH_URL + EMDASH_TOKEN, or the local dev bypass.
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
const urlOf = (i) => i.customUrl ?? i.custom_url ?? i.url;

// Resources dropdown: Donate → /join#donate (after the other children)
const primary = (await api(`/menus/primary`)).items;
const resources = primary.find((i) => i.label === "Resources" && !(i.parentId ?? i.parent_id));
const kids = primary.filter((i) => (i.parentId ?? i.parent_id) === resources.id);
if (!kids.some((i) => urlOf(i) === "/join#donate")) {
  const maxOrder = Math.max(0, ...kids.map((i) => i.sortOrder ?? i.sort_order ?? 0));
  await api(`/menus/primary/items`, { method: "POST", body: JSON.stringify({ type: "custom", label: "Donate", customUrl: "/join#donate", parentId: resources.id, sortOrder: maxOrder + 1 }) });
  console.log("+ menu Resources → Donate");
}
// Footer: Join DSA → /join
for (const i of (await api(`/menus/footer_connect`)).items) {
  if (i.label === "Join DSA" && urlOf(i) !== "/join") {
    await api(`/menus/footer_connect/items/${i.id}`, { method: "PUT", body: JSON.stringify({ customUrl: "/join" }) });
    console.log("~ footer Join DSA → /join");
  }
}
// Homepage: event links to /events instead of the Solidarity Tech calendar
const CAL = "https://fortworthdsa.solidarity.tech/dsa-fort-worth-calendar";
const home = (await api(`/content/homepage/home`)).item;
const content = home.data.content.map((b) => {
  if (b._key === "upcoming-events" && b.button_url === CAL) return { ...b, button_url: "/events" };
  if (b._key === "get-involved") return { ...b, items: b.items.map((i) => (i.button_url === CAL ? { ...i, button_url: "/events" } : i)) };
  return b;
});
if (JSON.stringify(content) !== JSON.stringify(home.data.content)) {
  await api(`/content/homepage/${home.id}`, { method: "PUT", body: JSON.stringify({ data: { content } }) });
  await api(`/content/homepage/${home.id}/publish`, { method: "POST", body: "{}" });
  console.log("~ homepage event links → /events");
}
console.log("Done.");
