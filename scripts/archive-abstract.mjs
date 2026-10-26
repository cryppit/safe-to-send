#!/usr/bin/env node
// Archive every Abstract Global Wallet before Abstract shuts down (15 Dec 2026).
//
//   node scripts/archive-abstract.mjs scan [--to <block>]   read the AGW factory's deployments, resumable
//   node scripts/archive-abstract.mjs build                 write data/abstract/agw/<xx>.bin and manifest.json
//
// The scan pins a target block (Abstract's "finalized" block unless --to is given) and appends each new wallet's
// 20-byte address to data/abstract/.scan/raw/<first byte>.bin, checkpointing after every window, so a stopped scan
// resumes where it left off and a re-run later only reads the blocks since. Duplicates from a resumed window are
// removed at build time. Only the public RPC is used; no keys.
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync, readdirSync, renameSync } from "node:fs";
import { createHash } from "node:crypto";
import { makeRpc } from "../src/rpc.js";
import { ABSTRACT, factoryFilter, parseDeployed, scanLogs, buildShards, RECORD } from "../src/archive.js";

const root = new URL("../data/abstract/", import.meta.url);
const scanDir = new URL(".scan/", root);
const rawDir = new URL("raw/", scanDir);
const statePath = new URL("state.json", scanDir);
const rpc = makeRpc(ABSTRACT.rpcs, { timeoutMs: 60_000 });

const readJson = (u) => JSON.parse(readFileSync(u, "utf8"));
function writeJson(u, value) {
  const tmp = new URL(u.href + ".tmp");
  writeFileSync(tmp, JSON.stringify(value, null, 1) + "\n");
  renameSync(tmp, u);
}
const flag = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };

// The blocks still to read are cut into SEGMENTS pieces, read WORKERS at a time; each piece keeps its own checkpoint.
const SEGMENTS = 8;
const WORKERS = 4;
const remaining = (state) => state.segments.filter((s) => s.next <= s.to);

/** Cut [from, to] into n segments of about the same number of blocks. */
function cut(from, to, n) {
  const out = [];
  const step = Math.ceil((to - from + 1) / n);
  for (let a = from; a <= to; a += step) out.push({ from: a, to: Math.min(to, a + step - 1), next: a });
  return out;
}

async function scan() {
  mkdirSync(rawDir, { recursive: true });
  const state = existsSync(statePath) ? readJson(statePath) : { wallets: 0, codeHashes: {}, segments: [] };
  const pinned = flag("to")
    ? await rpc("eth_getBlockByNumber", ["0x" + Number(flag("to")).toString(16), false])
    : await rpc("eth_getBlockByNumber", ["finalized", false]);
  const target = Number(pinned.number);
  // A checkpoint from the single-window scan ({ next }) becomes segments from where it stopped.
  if (!state.segments) state.segments = [];
  if (state.next !== undefined) {
    state.segments.push(...cut(state.next, state.target, SEGMENTS));
    delete state.next;
  }
  const covered = state.segments.length ? Math.max(...state.segments.map((s) => s.to)) : ABSTRACT.factoryFromBlock - 1;
  if (target > covered) state.segments.push(...cut(covered + 1, target, remaining(state).length ? 1 : SEGMENTS));
  if (!remaining(state).length) return console.log(`Already scanned to block ${covered}. Nothing to do.`);
  Object.assign(state, { target: Math.max(target, covered), targetHash: pinned.hash, targetTime: new Date(Number(pinned.timestamp) * 1000).toISOString() });
  writeJson(statePath, state);

  const total = remaining(state).reduce((n, s) => n + (s.to - s.next + 1), 0);
  console.log(`Scanning ${total.toLocaleString("en-US")} blocks of Abstract (up to ${state.target}) in ${remaining(state).length} segments, ${WORKERS} at a time…`);
  const started = Date.now();
  let pages = 0;
  const onPage = (segment) => (logs, end) => {
    const byShard = {};
    for (const log of logs) {
      const d = parseDeployed(log);
      if (d.deployer !== ABSTRACT.factory) throw new Error(`unexpected deployer ${d.deployer} in block ${d.block}`);
      (byShard[d.address.slice(2, 4)] ??= []).push(Buffer.from(d.address.slice(2), "hex"));
      state.codeHashes[d.bytecodeHash] = (state.codeHashes[d.bytecodeHash] ?? 0) + 1;
    }
    for (const [k, list] of Object.entries(byShard)) appendFileSync(new URL(`${k}.bin`, rawDir), Buffer.concat(list));
    state.wallets += logs.length;
    segment.next = end + 1;
    writeJson(statePath, state);
    if (++pages % 50 === 0) {
      const left = remaining(state).reduce((n, s) => n + (s.to - s.next + 1), 0);
      console.log(`  ${(((total - left) / total) * 100).toFixed(1)}% of the blocks, ${state.wallets.toLocaleString("en-US")} deployments so far, ${Math.round((Date.now() - started) / 1000)} s`);
    }
  };
  const queue = [...remaining(state)];
  await Promise.all(Array.from({ length: WORKERS }, async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      await scanLogs(rpc, { filter: factoryFilter(), from: s.next, to: s.to, span: 200_000, onPage: onPage(s) });
    }
  }));
  console.log(`Done: ${state.wallets.toLocaleString("en-US")} deployments up to block ${state.target} (${state.targetTime}), ${Math.round((Date.now() - started) / 1000)} s.`);
}

function build() {
  const state = readJson(statePath);
  if (!state.segments || remaining(state).length) throw new Error("scan incomplete: run `scan` until it says Done");
  const outDir = new URL("agw/", root);
  mkdirSync(outDir, { recursive: true });
  const shards = {};
  let wallets = 0;
  for (const name of readdirSync(rawDir).filter((f) => f.endsWith(".bin")).sort()) {
    const raw = readFileSync(new URL(name, rawDir));
    const addresses = [];
    for (let i = 0; i < raw.length; i += 20) addresses.push("0x" + raw.subarray(i, i + 20).toString("hex"));
    const unique = new Set(addresses).size;
    const [key, bytes] = Object.entries(buildShards(addresses))[0];
    writeFileSync(new URL(`${key}.bin`, outDir), bytes);
    shards[key] = { wallets: unique, records: bytes.length / RECORD, sha256: createHash("sha256").update(bytes).digest("hex") };
    wallets += unique;
  }
  const manifest = {
    what: "Every Abstract Global Wallet deployed by the AGW factory on Abstract, as 8-byte address prefixes",
    chainId: ABSTRACT.chainId,
    factory: ABSTRACT.factory,
    registry: ABSTRACT.registry,
    fromBlock: ABSTRACT.factoryFromBlock,
    toBlock: state.target,
    toBlockHash: state.targetHash,
    toBlockTime: state.targetTime,
    wallets,
    deploymentLogs: state.wallets,
    codeHashes: state.codeHashes,
    format: `shard <xx>.bin holds the sorted, distinct bytes 2-${RECORD + 1} of every wallet whose address starts with 0x<xx>; ${RECORD} bytes per record`,
    source: ABSTRACT.rpcs[0],
    shards,
  };
  writeJson(new URL("manifest.json", root), manifest);
  console.log(`Built ${Object.keys(shards).length} shards: ${wallets.toLocaleString("en-US")} distinct wallets up to block ${state.target}.`);
}

const cmd = process.argv[2];
if (cmd === "scan") await scan();
else if (cmd === "build") build();
else { console.error("Usage: node scripts/archive-abstract.mjs scan [--to <block>] | build"); process.exit(2); }
