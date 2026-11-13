// One-off: News in the menus of a site that already exists (a seed only sets menus on a new site).
// Header: News after Events. Footer → Learn: News after Our Work. Safe to re-run.
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
const urlOf = (i) => i.customUrl ?? i.custom_url ?? i.url;
const parentOf = (i) => i.parentId ?? i.parent_id ?? null;
const orderOf = (i) => i.sortOrder ?? i.sort_order ?? 0;

/** Add a top-level News link to a menu, straight after the item labelled `after` (or at the end). */
async function addNews(menu, after) {
  const items = (await api(`/menus/${menu}`)).items;
  if (items.some((i) => urlOf(i) === "/news")) return;
  const top = items.filter((i) => !parentOf(i)).sort((a, b) => orderOf(a) - orderOf(b));
  const created = await api(`/menus/${menu}/items`, { method: "POST", body: JSON.stringify({ type: "custom", label: "News", customUrl: "/news", sortOrder: top.length }) });
  const news = created.item ?? created;
  const at = top.findIndex((i) => i.label === after);
  const order = at < 0 ? [...top, news] : [...top.slice(0, at + 1), news, ...top.slice(at + 1)];
  await api(`/menus/${menu}/reorder`, { method: "POST", body: JSON.stringify({ items: order.map((i, n) => ({ id: i.id, parentId: null, sortOrder: n })) }) });
  console.log(`+ menu ${menu}: News${at < 0 ? "" : ` after ${after}`}`);
}

await addNews("primary", "Events");
await addNews("footer_learn", "Our Work");
console.log("Done.");
