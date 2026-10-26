// Real addresses, replayed from RPC answers recorded on 26 Oct 2026 (scripts/record.mjs). No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { check } from "../src/check.js";
import { replaying } from "../src/rpc.js";
import { buildShards, shardOf } from "../src/archive.js";

const AGW = "0xd8b17dbd34391993ee11b501e6275bbc715e2529";
const load = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url)));
// A one-wallet archive, so the tests do not depend on the full scan.
const archive = buildShards([AGW]);
const loadShard = async (key) => archive[key] ?? new Uint8Array(0);

async function replay(name) {
  const fx = load(name);
  return check(fx.address, fx.target, { clients: (c) => replaying(fx.store[c.id] ?? {}), loadShard });
}

test("an Abstract Global Wallet, sending on BNB Chain: stop, lost for good", async () => {
  const r = await replay("agw-on-bnb");
  assert.equal(r.verdict.level, "stop");
  assert.equal(r.verdict.kind, "abstract-wallet");
  assert.equal(r.facts.abstractWallet, true);
  assert.equal(r.facts.abstractSource, "archive");
  assert.equal(r.facts.chains[56].code, "0x");
  assert.notEqual(r.facts.chains[2741].code, "0x");
});

test("the same wallet, sending on ZKsync Era: don't send, but its owner can most likely recover it", async () => {
  const r = await replay("agw-on-zksync");
  assert.equal(r.verdict.level, "caution");
  assert.equal(r.verdict.recovery, "owner");
});

test("an Abstract Global Wallet missing from the archive is still caught live, through Abstract's AGW registry", async () => {
  const fx = load("agw-on-bnb");
  const r = await check(fx.address, fx.target, { clients: (c) => replaying(fx.store[c.id] ?? {}), loadShard: async () => new Uint8Array(0) });
  assert.equal(r.verdict.kind, "abstract-wallet");
  assert.equal(r.facts.abstractSource, "registry");
});

test("an EIP-7702 account, sending on Base: safe, it is still a key wallet", async () => {
  const r = await replay("eip7702-on-base");
  assert.equal(r.verdict.level, "safe");
  assert.equal(r.verdict.kind, "eip7702");
});

test("a key wallet used for years (Binance's hot wallet), sending on BNB Chain: safe", async () => {
  const r = await replay("key-wallet-on-bnb");
  assert.equal(r.verdict.level, "safe");
  assert.equal(r.verdict.kind, "key-wallet");
});

test("vitalik.eth, with EIP-7702 delegations on Ethereum, OP, BNB Chain and Base: safe, not mistaken for a contract", async () => {
  const r = await replay("vitalik-7702-on-bnb");
  assert.equal(r.verdict.level, "safe");
  assert.equal(r.verdict.kind, "eip7702");
  assert.match(r.facts.chains[56].code, /^0xef0100/);
});

test("a 3-of-5 Safe created on Ethereum only, sending on BNB Chain: stop, with the redeploy risk", async () => {
  const r = await replay("safe-eth-only-on-bnb");
  assert.equal(r.verdict.level, "stop");
  assert.equal(r.verdict.kind, "safe-elsewhere");
  assert.deepEqual(r.facts.chains[1].safe, { threshold: 3, owners: 5 });
});

test("the USDC contract itself on Ethereum: stop, it is the token's own contract", async () => {
  const r = await replay("usdc-contract-on-ethereum");
  assert.equal(r.verdict.level, "stop");
  assert.equal(r.verdict.kind, "token-contract");
  assert.equal(r.facts.chains[1].token.symbol, "USDC");
});

test("an address never used anywhere: can't tell, send a small test first", async () => {
  const r = await replay("unused-on-bnb");
  assert.equal(r.verdict.level, "unknown");
  assert.equal(r.verdict.kind, "unused");
});

test("a malformed address is refused before any RPC call", async () => {
  const r = await check("0x1234", 56, { clients: () => { throw new Error("no RPC expected"); }, loadShard });
  assert.equal(r.error, "bad-address");
});

test("an unknown chain is refused", async () => {
  const r = await check(AGW, 12345, { clients: () => { throw new Error("no RPC expected"); }, loadShard });
  assert.equal(r.error, "bad-chain");
});
