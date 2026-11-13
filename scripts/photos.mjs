// Upload the sample photos in seed/photos/ to the media library and put each in its slot
// (seed/photos.json), then publish. For a fresh local site, after the seed: a seed's $media can
// only download from a public URL, so local files go in through the REST API instead.
//
//   npm run photos                                  # the local dev server (dev bypass)
//   EMDASH_URL=… EMDASH_TOKEN=… npm run photos      # any other site, with an API token
//
// Re-running is safe: uploads are deduplicated by content and slots are overwritten.
import { readFile } from "node:fs/promises";

const base = (process.env.EMDASH_URL ?? "http://localhost:4330").replace(/\/$/, "");
const dir = new URL("../seed/photos/", import.meta.url);
const { photos } = JSON.parse(await readFile(new URL("../seed/photos.json", import.meta.url), "utf8"));

async function token() {
  if (process.env.EMDASH_TOKEN) return process.env.EMDASH_TOKEN;
  const res = await fetch(`${base}/_emdash/api/setup/dev-bypass?token=1&content=0`, { method: "POST", headers: { "X-EmDash-Request": "1", Origin: base } });
  const body = await res.json().catch(() => ({}));
  if (!body.data?.token) throw new Error(`No EMDASH_TOKEN and the dev bypass failed (${res.status}). Is \`npm run dev\` running at ${base}?`);
  return body.data.token;
}
const auth = { Authorization: `Bearer ${await token()}`, "X-EmDash-Request": "1" };

async function api(path, init = {}) {
  const res = await fetch(`${base}/_emdash/api${path}`, { ...init, headers: { ...auth, ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${JSON.stringify(body.error ?? body).slice(0, 300)}`);
  return body.data;
}

async function upload(p) {
  const form = new FormData();
  form.set("file", new Blob([await readFile(new URL(p.file, dir))], { type: "image/jpeg" }), p.file);
  form.set("alt", p.alt);
  form.set("deduplicate", "true");
  const { item } = await api("/media", { method: "POST", body: form });
  return {
    provider: "local",
    id: item.id,
    alt: p.alt,
    width: item.width ?? undefined,
    height: item.height ?? undefined,
    mimeType: item.mimeType,
    filename: item.filename,
    meta: { storageKey: item.storageKey },
  };
}

// Group by entry so each entry is written and published once
const byEntry = Map.groupBy(photos, (p) => p.entry);
for (const [ref, list] of byEntry) {
  const [collection, slug] = ref.split("/");
  const { item } = await api(`/content/${collection}/${slug}`);
  const data = structuredClone(item.data);
  for (const p of list) {
    const value = await upload(p);
    // Blocks live in a page's Page content or an article's Body
    const target = p.block ? [...(data.content ?? []), ...(data.body ?? [])].find((b) => b._key === p.block) : data;
    if (!target) throw new Error(`${ref}: no block with key "${p.block}"`);
    target[p.field] = value;
    if (p.focus) target[`${p.field}_focus`] = p.focus;
    console.log(`  ${p.file} → ${ref}${p.block ? ` [${p.block}]` : ""}.${p.field}`);
  }
  await api(`/content/${collection}/${item.id}`, { method: "PUT", body: JSON.stringify({ data }) });
  await api(`/content/${collection}/${item.id}/publish`, { method: "POST", body: "{}" });
  console.log(`Published ${ref}`);
}
