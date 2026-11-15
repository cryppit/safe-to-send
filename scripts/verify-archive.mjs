#!/usr/bin/env node
// Verify a frozen Abstract archive: re-hash every agw/<xx>.bin against manifest.json's sha256, confirm every manifest
// shard exists (and, for a folder, that no extra shard is unlisted), and that toBlock/toBlockHash are recorded. Never
// reads .scan. This is the integrity gate a reviewer runs against each mirror, a folder or a mirror's URL.
// Usage: node scripts/verify-archive.mjs <archive dir | https://mirror/abstract>
//   e.g. data/abstract, https://cryppit.github.io/safe-to-send/data/abstract
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** { ok, checked, failures } for an archive directory holding manifest.json and agw/<xx>.bin shards. */
export function verifyArchive(dir) {
  const failures = [];
  const manifestPath = join(dir, "manifest.json");
  if (!existsSync(manifestPath)) return { ok: false, checked: 0, failures: ["manifest.json missing"] };
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.toBlock == null || !manifest.toBlockHash) failures.push("manifest missing toBlock/toBlockHash");
  const shards = manifest.shards ?? {};
  const agwDir = join(dir, "agw");
  let checked = 0;
  for (const [key, meta] of Object.entries(shards)) {
    const f = join(agwDir, `${key}.bin`);
    if (!existsSync(f)) { failures.push(`shard ${key}: file missing`); continue; }
    const hash = createHash("sha256").update(readFileSync(f)).digest("hex");
    checked++;
    if (hash !== meta.sha256) failures.push(`shard ${key}: sha256 mismatch`);
  }
  if (existsSync(agwDir)) {
    for (const name of readdirSync(agwDir)) {
      if (!name.endsWith(".bin")) continue;
      const key = name.slice(0, -4);
      if (!shards[key]) failures.push(`shard ${key}: file not in manifest`);
    }
  }
  return { ok: failures.length === 0, checked, failures };
}

/** The same check over HTTPS: fetch manifest.json, then every shard it lists, and compare hashes. */
export async function verifyArchiveUrl(base, { fetch: doFetch = globalThis.fetch } = {}) {
  const root = base.replace(/\/+$/, "");
  const get = async (path) => {
    const res = await doFetch(`${root}/${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  };
  let manifest;
  try { manifest = JSON.parse(new TextDecoder().decode(await get("manifest.json"))); }
  catch (e) { return { ok: false, checked: 0, failures: [`manifest.json: ${e.message}`] }; }
  const failures = [];
  if (manifest.toBlock == null || !manifest.toBlockHash) failures.push("manifest missing toBlock/toBlockHash");
  let checked = 0;
  for (const [key, meta] of Object.entries(manifest.shards ?? {})) {
    let bytes;
    try { bytes = await get(`agw/${key}.bin`); } catch (e) { failures.push(`shard ${key}: ${e.message}`); continue; }
    checked++;
    if (createHash("sha256").update(bytes).digest("hex") !== meta.sha256) failures.push(`shard ${key}: sha256 mismatch`);
  }
  return { ok: failures.length === 0, checked, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) { console.error("Usage: node scripts/verify-archive.mjs <archive dir | https://mirror/abstract>"); process.exit(2); }
  const { ok, checked, failures } = /^https?:\/\//.test(dir) ? await verifyArchiveUrl(dir) : verifyArchive(dir);
  if (ok) { console.log(`OK: ${checked} shards verified against the manifest.`); process.exit(0); }
  console.error(`FAIL (${failures.length}):`); for (const f of failures) console.error("  " + f);
  process.exit(1);
}
