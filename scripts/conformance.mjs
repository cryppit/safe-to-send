#!/usr/bin/env node
// Replay each conformance vector through the engine from recorded answers (no network) and compare the verdict level
// to the vector's `expect`. For a live (numeric) chain the recorded store must be non-empty, so an incomplete
// recording is counted FAIL (not silently "unknown"); any replay error is also FAIL.
// Usage: node scripts/conformance.mjs [dir]   (default: conformance/)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { lookup } from "../src/lookup.js";
import { replaying } from "../src/rpc.js";
import { buildShards } from "../src/archive.js";
import { replayingFetch } from "../src/record.js";
import { resolveChain } from "../src/resolve.js";

/** { total, pass, fail, results:[{id,chain,expect,actual,ok}] } for a vectors file + a recorded dir. */
export async function runConformance(vectorsPath, recordedDir) {
  const vectors = JSON.parse(readFileSync(vectorsPath, "utf8"));
  const results = [];
  for (const v of vectors) {
    let actual;
    try {
      const rec = JSON.parse(readFileSync(join(recordedDir, v.recorded), "utf8"));
      const archive = buildShards(rec.agwArchive ?? []);
      const target = resolveChain(v.chain);
      // An "unknown" verdict can come from chains that were never read; require the recording to have actually read
      // the target chain, so an empty store can't masquerade as a genuine "never used" result.
      if (typeof target === "number" && v.expect === "unknown") {
        const s = rec.store?.[target];
        if (!s || Object.keys(s).length === 0) throw new Error(`incomplete-recording: empty store for chain ${target}`);
      }
      const r = await lookup(v.input, target, {
        clients: (c) => replaying(rec.store?.[c.id] ?? {}),
        fetch: replayingFetch(rec.fetch ?? {}),
        loadShard: async (key) => archive[key] ?? new Uint8Array(0),
      });
      actual = r.error ? `error:${r.error}` : r.verdict.level;
    } catch (e) {
      actual = `error:${e.message}`;
    }
    results.push({ id: v.id, chain: v.chain, expect: v.expect, actual, ok: actual === v.expect });
  }
  const pass = results.filter((r) => r.ok).length;
  return { total: results.length, pass, fail: results.length - pass, results };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] ?? "conformance";
  const r = await runConformance(join(dir, "vectors.json"), join(dir, "recorded"));
  for (const x of r.results) console.log(`${x.ok ? "PASS" : "FAIL"}  ${String(x.id).padEnd(26)} [${x.chain}] expect=${x.expect} actual=${x.actual}`);
  console.log(`\n${r.pass}/${r.total} pass`);
  process.exit(r.fail ? 1 : 0);
}
