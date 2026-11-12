#!/usr/bin/env node
// Assemble conformance/vectors.json from the recorded answers: each vector's `expect` is the engine's current verdict
// level (verified correct at record time), pinned so CI catches a regression. Usage: node scripts/build-vectors.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { lookup } from "../src/lookup.js";
import { replaying } from "../src/rpc.js";
import { buildShards } from "../src/archive.js";
import { replayingFetch } from "../src/record.js";
import { resolveChain } from "../src/resolve.js";

const base = new URL("../", import.meta.url);
const fx = (name) => JSON.parse(readFileSync(new URL(`fixtures/${name}.json`, base)));
// Fixture-derived vectors: input + chain come from the fixture file of the same name.
const FROM_FIXTURE = {
  "agw-on-bnb": "AGW on BNB Chain: the real ~$20k loss case; unreachable, lost for good",
  "agw-on-zksync": "AGW on ZKsync Era: shares Abstract's factory, owner can most likely recreate it",
  "eip7702-on-base": "EIP-7702 delegated EOA on Base: still a key wallet, safe",
  "key-wallet-on-bnb": "plain key wallet with history on BNB: safe",
  "safe-eth-only-on-bnb": "a Safe that exists only on another chain: stop",
  "unused-on-bnb": "never used on any chain checked: can't tell",
  "usdc-contract-on-ethereum": "USDC token contract on Ethereum: funds sent here usually stick",
  "vitalik-7702-on-bnb": "well-known EIP-7702 account on BNB: safe",
};
// Live-recorded vectors: explicit input + chain.
const LIVE = [
  ["agw-on-arbitrum", "0xd8b17dbd34391993ee11b501e6275bbc715e2529", 42161, "AGW on Arbitrum One (grant chain): unreachable smart wallet"],
  ["safe-eoa-on-op", "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", 10, "a key wallet (EIP-7702) on OP Mainnet: safe"],
  ["usdc-contract-on-arbitrum", "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", 42161, "USDC token contract on Arbitrum One: stop"],
  ["usdc-contract-on-op", "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", 10, "USDC token contract on OP Mainnet: stop"],
  ["usdc-contract-on-linea", "0x176211869cA2b568f2A7D4EE941E073a821EE1ff", 59144, "USDC token contract on Linea: stop"],
  ["usdc-contract-on-celo", "0xcebA9300f2b948710d2653dD7B07f33A8B32118C", 42220, "USDC token contract on Celo: stop"],
  ["usdc-contract-on-mantle", "0x09Bc4E0D864854c6aFB6eB9A9cdF58aC190D0dF9", 5000, "USDC token contract on Mantle: stop"],
  ["weth-contract-on-ink", "0x4200000000000000000000000000000000000006", 57073, "WETH token contract on Ink: stop"],
  ["unused-on-robinhood", "0x7f3a9c2e5b1d8460af2e9c7b35d10e4f6a8b2c91", 4663, "unused address on Robinhood Chain: can't tell"],
  ["wrongnetwork-btc-on-base", "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", 8453, "a Bitcoin address pasted on Base: wrong network, stop"],
  ["badchecksum-on-ethereum", "0xd8dA6BF26964aF9D7eEd9e03E53415D37AA96045", 1, "an address that fails the EIP-55 checksum: a typo, stop"],
  ["xrp-exchange-tag", "rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh", "xrp", "an XRP account that requires a destination tag: caution"],
  ["stellar-exchange-memo", "GA5XIGA5C7QTPTWXQHY6MCJRMTRZDOSHR6EFIBNDQTCQHG262N4GGKTM", "stellar", "a Stellar account, format valid (no memo flag set at record time)"],
];

async function expectOf(id, input, chain) {
  const rec = JSON.parse(readFileSync(new URL(`conformance/recorded/${id}.json`, base)));
  const archive = buildShards(rec.agwArchive ?? []);
  const r = await lookup(input, resolveChain(chain), {
    clients: (c) => replaying(rec.store?.[c.id] ?? {}),
    fetch: replayingFetch(rec.fetch ?? {}),
    loadShard: async (k) => archive[k] ?? new Uint8Array(0),
  });
  return r.error ? `error:${r.error}` : r.verdict.level;
}

const vectors = [];
for (const [name, why] of Object.entries(FROM_FIXTURE)) {
  const f = fx(name);
  vectors.push({ id: name, input: f.address, chain: f.target, expect: await expectOf(name, f.address, f.target), why, recorded: `${name}.json` });
}
for (const [id, input, chain, why] of LIVE) {
  vectors.push({ id, input, chain, expect: await expectOf(id, input, chain), why, recorded: `${id}.json` });
}
vectors.sort((a, b) => a.id.localeCompare(b.id));
writeFileSync(new URL("conformance/vectors.json", base), JSON.stringify(vectors, null, 1) + "\n");
const classes = [...new Set(vectors.map((v) => v.expect))];
console.log(`${vectors.length} vectors; classes: ${classes.join(", ")}; chains: ${[...new Set(vectors.map((v) => v.chain))].join(", ")}`);
