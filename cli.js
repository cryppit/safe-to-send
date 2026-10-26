#!/usr/bin/env node
// Usage: node cli.js <address> --chain <chain id or name> [--json]
// Checks, from public RPCs only, whether funds sent to <address> on that chain can be reached. Nothing is signed.
import { readFileSync, existsSync } from "node:fs";
import { check } from "./src/check.js";
import { CHAINS, chainName } from "./src/chains.js";

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : undefined; };
const address = args.find((a) => a.startsWith("0x"));
const chainArg = flag("chain");
const chain = CHAINS.find((c) => String(c.id) === chainArg || c.name.toLowerCase().replace(/\s+/g, "") === chainArg?.toLowerCase().replace(/\s+/g, ""));
if (!address || !chain) {
  console.error(`Usage: node cli.js <address> --chain <id or name> [--json]\nChains: ${CHAINS.map((c) => `${c.id} ${c.name}`).join(", ")}`);
  process.exit(2);
}

const shardDir = new URL("./data/abstract/agw/", import.meta.url);
const loadShard = async (key) => {
  const f = new URL(`${key}.bin`, shardDir);
  return existsSync(f) ? new Uint8Array(readFileSync(f)) : null;
};

const r = await check(address, chain.id, { loadShard });
if (r.error) {
  console.error(r.message);
  process.exit(1);
}
if (args.includes("--json")) {
  console.log(JSON.stringify(r, null, 2));
  process.exit(0);
}
const mark = { safe: "SAFE", caution: "CAUTION", stop: "STOP", unknown: "CAN'T TELL" }[r.verdict.level];
console.log(`${r.facts.address} on ${chain.name}\n`);
console.log(`${mark}  ${r.verdict.title}`);
for (const reason of r.verdict.reasons) console.log(`  - ${reason}`);
const seen = Object.entries(r.facts.chains)
  .filter(([, c]) => c.code && (c.code !== "0x" || c.nonce > 0))
  .map(([id, c]) => `${chainName(Number(id))} (${c.code === "0x" ? `key, ${c.nonce} tx` : /^0xef0100/.test(c.code) ? "EIP-7702" : c.safe ? `Safe ${c.safe.threshold}-of-${c.safe.owners}` : "contract"})`);
console.log(`\n  seen on: ${seen.length ? seen.join(", ") : "no chain checked"}`);
if (r.facts.abstractWallet) console.log(`  Abstract Global Wallet (from the ${r.facts.abstractSource})`);
if (r.verdict.unread.length) console.log(`  could not read: ${r.verdict.unread.map(chainName).join(", ")}`);
console.log(`\nRead from public RPCs on ${CHAINS.length} chains. Nothing was signed.`);
