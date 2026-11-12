#!/usr/bin/env node
// Record a full lookup for one conformance vector: EVM per-chain store + ledger fetch responses + whether the input
// is in the real Abstract archive (to seed agwArchive for offline replay). Prints the verdict level so you can set
// `expect` in conformance/vectors.json. Needs live RPC. Usage: node scripts/record-vector.mjs <id> <input> <chain>
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { lookup } from "../src/lookup.js";
import { clientsFor } from "../src/check.js";
import { recording } from "../src/rpc.js";
import { recordingFetch } from "../src/record.js";
import { resolveChain } from "../src/resolve.js";
import { shardOf, inShard } from "../src/archive.js";

const [id, input, chainArg] = process.argv.slice(2);
if (!id || !input || !chainArg) { console.error("Usage: node scripts/record-vector.mjs <id> <input> <chain>"); process.exit(2); }
const target = resolveChain(/^\d+$/.test(chainArg) ? Number(chainArg) : chainArg);
if (target === null) { console.error(`unknown chain ${chainArg}`); process.exit(2); }

const store = {}, fetchLog = {};
const shardDir = new URL("../data/abstract/agw/", import.meta.url);
const loadShard = async (key) => { const f = new URL(`${key}.bin`, shardDir); return existsSync(f) ? new Uint8Array(readFileSync(f)) : new Uint8Array(0); };

const r = await lookup(input, target, {
  clients: (c) => recording(clientsFor(c), (store[c.id] ??= {})),
  fetch: recordingFetch(globalThis.fetch, fetchLog),
  loadShard,
});
let agwArchive = [];
const addr = r.facts?.address ?? (/^0x[0-9a-fA-F]{40}$/.test(input) ? input.toLowerCase() : null);
if (addr) { try { if (inShard(await loadShard(shardOf(addr)), addr)) agwArchive = [addr]; } catch {} }

writeFileSync(new URL(`../conformance/recorded/${id}.json`, import.meta.url),
  JSON.stringify({ recordedAt: new Date().toISOString(), store, fetch: fetchLog, agwArchive }, null, 1) + "\n");
console.log(`${id} -> ${r.error ? `error:${r.error}` : r.verdict.level}  (${r.verdict?.kind ?? r.message ?? ""})`);
