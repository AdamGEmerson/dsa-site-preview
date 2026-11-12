// One-off (Nov 2026): on an existing site, swap the Join page's donate Text block for the Embedded
// form block, and fix "501(c)4" → "501(c)(4)". Run after sync-seed (which adds the block type).
// Safe to re-run. EMDASH_URL + EMDASH_TOKEN, or the local dev bypass.
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
const DONATE = "https://fortworthdsa.solidarity.tech/donate-to-dsa-fort-worth";
const page = (await api(`/content/pages/join`)).item;
const content = JSON.parse(JSON.stringify(page.data.content).replaceAll("501(c)4", "501(c)(4)")).map((b) => {
  if (b._key !== "donate") return b;
  const { stats, buttons, ...rest } = b;
  return { ...rest, _key: "donate-form", _type: "embed_form", _version: 1, image_brief: "Marchers holding red Socialism Beats Fascism! signs", form_url: DONATE, form_title: "Donate to DSA Fort Worth", payments: true };
});
await api(`/content/pages/${page.id}`, { method: "PUT", body: JSON.stringify({ data: { content } }) });
await api(`/content/pages/${page.id}/publish`, { method: "POST", body: "{}" });
console.log("~ join: donate section is an embedded form; 501(c)(4)");
