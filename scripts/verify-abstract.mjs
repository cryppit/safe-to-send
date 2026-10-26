#!/usr/bin/env node
// Check the built archive against Abstract itself, while Abstract still runs:
//   - wallets picked at random from the scan are AGWs per the AGW registry (isAGW) and have code on Abstract, and the
//     shards find each of them;
//   - random addresses are not found (no false matches);
//   - the known wallets passed with --known are found.
// Usage: node scripts/verify-abstract.mjs [--sample 100] [--known 0x…,0x…]
import { readFileSync, readdirSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { makeRpc } from "../src/rpc.js";
import { ABSTRACT, inShard, shardOf } from "../src/archive.js";

const root = new URL("../data/abstract/", import.meta.url);
const flag = (name, d) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : d; };
const rpc = makeRpc(ABSTRACT.rpcs);
const shard = (a) => new Uint8Array(readFileSync(new URL(`agw/${shardOf(a)}.bin`, root)));
const isAgw = async (a) => BigInt(await rpc("eth_call", [{ to: ABSTRACT.registry, data: "0x932bdb47" + a.slice(2).padStart(64, "0") }, "latest"])) === 1n;

// Random wallets from the raw scan files.
const rawDir = new URL(".scan/raw/", root);
const files = readdirSync(rawDir).filter((f) => f.endsWith(".bin"));
const n = Number(flag("sample", 100));
const picks = [];
while (picks.length < n) {
  const raw = readFileSync(new URL(files[Math.floor(Math.random() * files.length)], rawDir));
  const i = Math.floor(Math.random() * (raw.length / 20)) * 20;
  picks.push("0x" + raw.subarray(i, i + 20).toString("hex"));
}
let bad = 0;
for (const a of picks) {
  const [agw, code] = await Promise.all([isAgw(a), rpc("eth_getCode", [a, "latest"])]);
  const found = inShard(shard(a), a);
  if (!agw || code === "0x" || !found) { bad++; console.log(`  FAIL ${a}: isAGW=${agw} code=${code === "0x" ? "none" : "yes"} found=${found}`); }
}
console.log(`${n - bad}/${n} sampled wallets: registered as AGW, have code on Abstract, found in the archive.`);

let falseHits = 0;
for (let i = 0; i < 1000; i++) { const a = "0x" + randomBytes(20).toString("hex"); if (inShard(shard(a), a)) falseHits++; }
console.log(`${falseHits}/1000 random addresses matched (expected 0).`);

for (const a of (flag("known", "") || "").split(",").filter(Boolean)) {
  console.log(`known ${a}: found=${inShard(shard(a), a)} isAGW=${await isAgw(a)}`);
}
process.exit(bad || falseHits ? 1 : 0);
