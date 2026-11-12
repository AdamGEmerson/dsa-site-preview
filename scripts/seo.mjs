// Apply seed/seo.json to a running site through the EmDash REST API: each entry's SEO panel values
// (title, description, "Hide from search engines") and the redirects. Run it once after the seed has
// been applied locally; a seed can carry neither without blocking a site-package import.
//
//   npm run seo                      # the local dev server (signs in through the dev bypass)
//   EMDASH_URL=… EMDASH_TOKEN=… npm run seo   # any other site, with an API token (content:write, admin)
//
// Safe to re-run: SEO values are overwritten, redirects that already exist are skipped.
import { readFile } from "node:fs/promises";

const base = (process.env.EMDASH_URL ?? "http://localhost:4330").replace(/\/$/, "");
const { seo, redirects } = JSON.parse(await readFile(new URL("../seed/seo.json", import.meta.url), "utf8"));

async function token() {
  if (process.env.EMDASH_TOKEN) return process.env.EMDASH_TOKEN;
  const res = await fetch(`${base}/_emdash/api/setup/dev-bypass?token=1&content=0`, { method: "POST", headers: { "X-EmDash-Request": "1", Origin: base } });
  const body = await res.json().catch(() => ({}));
  if (!body.data?.token) throw new Error(`No EMDASH_TOKEN and the dev bypass failed (${res.status}). Is \`npm run dev\` running at ${base}?`);
  return body.data.token;
}

const headers = { Authorization: `Bearer ${await token()}`, "X-EmDash-Request": "1", "Content-Type": "application/json" };
async function api(path, init = {}) {
  const res = await fetch(`${base}/_emdash/api${path}`, { ...init, headers });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${JSON.stringify(body.error ?? body).slice(0, 300)}`);
  return body.data;
}

let applied = 0;
const missing = [];
for (const [ref, values] of Object.entries(seo)) {
  const [collection, slug] = ref.split("/");
  const found = await api(`/content/${collection}/${slug}`).catch(() => null);
  if (!found) {
    missing.push(ref);
    continue;
  }
  await api(`/content/${collection}/${found.item.id}`, { method: "PUT", body: JSON.stringify({ seo: values }) });
  applied++;
}

const existing = new Set(((await api("/redirects?limit=100")).items ?? []).map((r) => r.source));
let added = 0;
for (const r of redirects) {
  if (existing.has(r.source)) continue;
  await api("/redirects", { method: "POST", body: JSON.stringify(r) });
  added++;
}

console.log(`SEO panel: ${applied} entries updated${missing.length ? `; not found: ${missing.join(", ")}` : ""}`);
console.log(`Redirects: ${added} added, ${redirects.length - added} already there`);
if (missing.length) process.exitCode = 1;
