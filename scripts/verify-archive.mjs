#!/usr/bin/env node
// Verify a frozen Abstract archive OFFLINE: re-hash every agw/<xx>.bin against manifest.json's sha256, confirm every
// manifest shard exists and no extra shard is unlisted, and that toBlock/toBlockHash are recorded. No network, never
// reads .scan. This is the integrity gate a reviewer runs against each mirror.
// Usage: node scripts/verify-archive.mjs <archive dir>   (e.g. data/abstract)
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2];
  if (!dir) { console.error("Usage: node scripts/verify-archive.mjs <archive dir>"); process.exit(2); }
  const { ok, checked, failures } = verifyArchive(dir);
  if (ok) { console.log(`OK: ${checked} shards verified against the manifest.`); process.exit(0); }
  console.error(`FAIL (${failures.length}):`); for (const f of failures) console.error("  " + f);
  process.exit(1);
}
