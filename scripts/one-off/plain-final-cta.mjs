// One-off (Nov 2026): take the background photo off the closing "Get involved band" on every page,
// so it's back to plain red. Safe to re-run. EMDASH_URL + EMDASH_TOKEN, or the local dev bypass.
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
const entries = [["homepage", "home"], ...["events", "our-work", "about-us", "resources", "join"].map((s) => ["pages", s])];
for (const [collection, slug] of entries) {
  const item = (await api(`/content/${collection}/${slug}`)).item;
  if (!item.data.content?.some((b) => b._type === "final_cta" && b.image)) continue;
  const content = item.data.content.map((b) => (b._type === "final_cta" ? { ...b, image: null, image_focus: "" } : b));
  await api(`/content/${collection}/${item.id}`, { method: "PUT", body: JSON.stringify({ data: { content } }) });
  await api(`/content/${collection}/${item.id}/publish`, { method: "POST", body: "{}" });
  console.log(`~ ${collection}/${slug}: closing band is plain again`);
}
console.log("Done.");
