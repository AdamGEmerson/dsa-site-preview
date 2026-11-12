// Bring a running site up to date with seed/seed.json without wiping it. A seed only applies to a
// new site, so schema and new sample entries added to the seed later go in through the REST API:
//
//   1. Block types: create missing ones; update changed ones (compatible changes only; a breaking
//      change is reported, not forced).
//   2. Collections: add missing fields; update a field's label, required, searchable or validation.
//   3. Entries: create seed entries that don't exist yet (matched by collection + slug), published.
//      On entries that do exist, fill seed fields that are still unset. Nothing set is overwritten.
//   4. Sections: create seed sections that don't exist yet. Existing ones are left as edited.
//      (The REST API can't mark a section as a theme section; only a new site's seed can.)
//
//   npm run sync-seed                                  # the local dev server (dev bypass)
//   EMDASH_URL=… EMDASH_TOKEN=… npm run sync-seed      # any other site, with an admin API token
//   … -- --dry-run                                     # report only
//
// It does not touch menus, settings, media or existing sections, and never deletes anything. Field flags are
// compared only where the seed states them, so to drop one (e.g. required) set it to false explicitly.
import { readFile } from "node:fs/promises";

const base = (process.env.EMDASH_URL ?? "http://localhost:4330").replace(/\/$/, "");
const dryRun = process.argv.includes("--dry-run");
const seed = JSON.parse(await readFile(new URL("../seed/seed.json", import.meta.url), "utf8"));

async function token() {
  if (process.env.EMDASH_TOKEN) return process.env.EMDASH_TOKEN;
  const res = await fetch(`${base}/_emdash/api/setup/dev-bypass?token=1&content=0`, { method: "POST", headers: { "X-EmDash-Request": "1", Origin: base } });
  const body = await res.json().catch(() => ({}));
  if (!body.data?.token) throw new Error(`No EMDASH_TOKEN and the dev bypass failed (${res.status}). Is \`npm run dev\` running at ${base}?`);
  return body.data.token;
}
const headers = { Authorization: `Bearer ${await token()}`, "X-EmDash-Request": "1", "Content-Type": "application/json" };

async function api(path, init = {}, { allow404 = false } = {}) {
  const res = await fetch(`${base}/_emdash/api${path}`, { ...init, headers });
  if (allow404 && res.status === 404) return null;
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new Error(`${init.method ?? "GET"} ${path}: ${res.status} ${JSON.stringify(body.error ?? body).slice(0, 400)}`);
  return body.data;
}
const write = (path, method, body) => (dryRun ? Promise.resolve(null) : api(path, { method, body: JSON.stringify(body) }));
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/** Does `live` already have everything `want` sets? (EmDash fills defaults the seed leaves out.) */
const covers = (live, want) =>
  want === null || want === undefined
    ? true
    : Array.isArray(want)
      ? Array.isArray(live) && live.length === want.length && want.every((v, i) => covers(live[i], v))
      : typeof want !== "object"
        ? same(live, want)
        : Object.entries(want).every(([k, v]) => covers(live?.[k], v));
const log = (s) => console.log(`${dryRun ? "[dry run] " : ""}${s}`);

// ---------------------------------------------------------------- 1. block types
for (const bt of seed.blockTypes ?? []) {
  const fields = bt.versions.find((v) => v.version === bt.currentVersion).fields;
  const live = await api(`/schema/block-types/${bt.slug}`, {}, { allow404: true });
  if (!live) {
    await write("/schema/block-types", "POST", { slug: bt.slug, label: bt.label, description: bt.description, category: bt.category, fields });
    log(`+ block type ${bt.slug}`);
    continue;
  }
  const item = live.item ?? live;
  const liveFields = item.versions?.find((v) => v.version === item.currentVersion)?.fields;
  if (covers(liveFields, fields) && item.label === bt.label && (item.description ?? "") === (bt.description ?? "") && (item.category ?? "") === (bt.category ?? "")) continue;
  try {
    await write(`/schema/block-types/${bt.slug}`, "PUT", { expectedFingerprint: item.versions?.find((v) => v.version === item.currentVersion)?.fingerprint, label: bt.label, description: bt.description ?? null, category: bt.category ?? null, fields });
    log(`~ block type ${bt.slug}`);
  } catch (error) {
    console.warn(`! block type ${bt.slug} not updated (breaking change? make it in the admin): ${error.message}`);
  }
}

// ---------------------------------------------------------------- 2. collection fields
for (const col of seed.collections ?? []) {
  const live = await api(`/schema/collections/${col.slug}?includeFields=true`, {}, { allow404: true });
  if (!live) {
    console.warn(`! collection ${col.slug} is missing; create it in the admin (Content Types), then re-run`);
    continue;
  }
  const liveFields = new Map((live.item.fields ?? []).map((f) => [f.slug, f]));
  for (const [i, field] of col.fields.entries()) {
    const have = liveFields.get(field.slug);
    const wanted = { label: field.label, required: field.required ?? false, searchable: field.searchable ?? false, validation: field.validation ?? null };
    if (!have) {
      await write(`/schema/collections/${col.slug}/fields`, "POST", { slug: field.slug, type: field.type, sortOrder: i, ...wanted });
      log(`+ field ${col.slug}.${field.slug}`);
    } else if (!covers({ label: have.label, required: have.required, searchable: have.searchable, validation: have.validation ?? null }, wanted)) {
      await write(`/schema/collections/${col.slug}/fields/${field.slug}`, "PUT", wanted);
      log(`~ field ${col.slug}.${field.slug}`);
    }
  }
}

// ---------------------------------------------------------------- 3. entries
for (const [collection, entries] of Object.entries(seed.content ?? {})) {
  for (const entry of entries) {
    const live = await api(`/content/${collection}/${entry.slug}`, {}, { allow404: true });
    if (!live) {
      const created = await write(`/content/${collection}`, "POST", { slug: entry.slug, data: entry.data });
      if (created && entry.status === "published") await write(`/content/${collection}/${created.item.id}/publish`, "POST", {});
      log(`+ entry ${collection}/${entry.slug}`);
      continue;
    }
    const item = live.item;
    const missing = Object.fromEntries(Object.entries(entry.data).filter(([k, v]) => (item.data[k] === undefined || item.data[k] === null) && v !== "" && v != null));
    if (!Object.keys(missing).length) continue;
    await write(`/content/${collection}/${item.id}`, "PUT", { data: missing });
    if (item.status === "published") await write(`/content/${collection}/${item.id}/publish`, "POST", {});
    log(`~ entry ${collection}/${entry.slug}: filled ${Object.keys(missing).join(", ")}`);
  }
}
// ---------------------------------------------------------------- 4. sections
for (const section of seed.sections ?? []) {
  const live = await api(`/sections/${section.slug}`, {}, { allow404: true });
  if (live) continue;
  await write("/sections", "POST", { slug: section.slug, title: section.title, description: section.description, keywords: section.keywords, content: section.content });
  log(`+ section ${section.slug}`);
}
log("Done.");
