#!/usr/bin/env node
// Usage: node cli.js <address or ENS name> --chain <chain id or name> [--json]
// On an EVM chain it checks, from public RPCs only, whether funds sent to the address can be reached.
// On any other network it checks the address format only. Nothing is signed.
import { readFileSync, existsSync } from "node:fs";
import { lookup } from "./src/lookup.js";
import { parseLists } from "./src/lists.js";
import { CHAINS, NETWORKS, chainName } from "./src/chains.js";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const squash = (x) => x?.toLowerCase().replace(/\s+/g, "");
const flagged = new Set(args.flatMap((a, i) => (a === "--chain" ? [i, i + 1] : a === "--json" ? [i] : [])));
const address = args.find((_, i) => !flagged.has(i));
const chainArg = flag("chain");
const target = [...CHAINS, ...NETWORKS].find((c) => String(c.id) === chainArg || squash(c.name) === squash(chainArg));
if (!address || !target) {
  console.error(`Usage: node cli.js <address or ENS name> --chain <id or name> [--json]\nRead live: ${CHAINS.map((c) => `${c.id} ${c.name}`).join(", ")}\nFormat only: ${NETWORKS.map((n) => n.id).join(", ")}`);
  process.exit(2);
}

const shardDir = new URL("./data/abstract/agw/", import.meta.url);
const loadShard = async (key) => {
  const f = new URL(`${key}.bin`, shardDir);
  return existsSync(f) ? new Uint8Array(readFileSync(f)) : null;
};

const listFile = (n) => JSON.parse(readFileSync(new URL(`./data/lists/${n}.json`, import.meta.url)));
const lists = async () => parseLists(listFile("ofac"), listFile("exchanges"));
const r = await lookup(address, target.id, { loadShard, lists });
if (r.error) {
  console.error(r.message);
  process.exit(1);
}
if (args.includes("--json")) {
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}
const mark = { safe: "SAFE", caution: "CAUTION", stop: "STOP", unknown: "CAN'T TELL", format: "FORMAT OK" }[r.verdict.level];
if (r.ens) console.log(`${r.ens.name} points to ${r.ens.address} on Ethereum`);
console.log(`${r.facts?.address ?? r.address} on ${target.name}\n`);
console.log(`${mark}  ${r.verdict.title}`);
for (const reason of r.verdict.reasons) console.log(`  - ${reason}`);
for (const notice of r.notices ?? []) console.log(`\n  NOTE ${notice}`);
if (r.scope === "format") {
  if (r.suggest !== undefined) console.log(`\n  try: --chain ${r.suggest}`);
  console.log(r.read ? `\nRead from the ${r.read}. Nothing was signed.` : "\nNo chain was read. Nothing was signed.");
  process.exit(0);
}
const seen = Object.entries(r.facts.chains)
  .filter(([, c]) => c.code && (c.code !== "0x" || c.nonce > 0))
  .map(([id, c]) => `${chainName(Number(id))} (${c.code === "0x" ? `key, ${c.nonce} tx` : /^0xef0100/.test(c.code) ? "EIP-7702" : c.safe ? `Safe ${c.safe.threshold}-of-${c.safe.owners}` : "contract"})`);
console.log(`\n  seen on: ${seen.length ? seen.join(", ") : "no chain checked"}`);
if (r.facts.abstractWallet) console.log(`  Abstract Global Wallet (from the ${r.facts.abstractSource})`);
if (r.verdict.unread.length) console.log(`  could not read: ${r.verdict.unread.map(chainName).join(", ")}`);
console.log(`\nRead from public RPCs on ${CHAINS.length} chains. Nothing was signed.`);
