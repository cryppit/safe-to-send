// Public library entry: checkAddress wraps lookup, resolveChain maps id/name, defaultLoadShard degrades offline.
// Replays recorded RPC answers; no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkAddress, resolveChain, defaultLoadShard } from "../src/index.js";
import { lookup } from "../src/lookup.js";
import { replaying } from "../src/rpc.js";
import { buildShards } from "../src/archive.js";

const AGW = "0xd8b17dbd34391993ee11b501e6275bbc715e2529";
const load = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}.json`, import.meta.url)));
const archive = buildShards([AGW]);
const loadShard = async (key) => archive[key] ?? new Uint8Array(0);
const optsFor = (fx) => ({ clients: (c) => replaying(fx.store[c.id] ?? {}), loadShard });

test("checkAddress resolves a chain by numeric id (same result as lookup)", async () => {
  const fx = load("agw-on-bnb");
  const viaCheck = await checkAddress(fx.address, 56, optsFor(fx));
  const viaLookup = await lookup(fx.address, 56, optsFor(fx));
  assert.deepEqual(viaCheck, viaLookup);
  assert.equal(viaCheck.verdict.level, "stop");
});

test("checkAddress resolves a chain by squashed name", async () => {
  const fx = load("agw-on-bnb"); // 56 is "BNB Chain"
  const byName = await checkAddress(fx.address, "BNB Chain", optsFor(fx));
  const byId = await checkAddress(fx.address, 56, optsFor(fx));
  assert.deepEqual(byName, byId);
});

test("resolveChain accepts id, numeric string, exact/squashed name, network id; rejects unknown", () => {
  assert.equal(resolveChain(56), 56);
  assert.equal(resolveChain("56"), 56);
  assert.equal(resolveChain("OP Mainnet"), 10);
  assert.equal(resolveChain("op mainnet"), 10);
  assert.equal(resolveChain("opmainnet"), 10);
  assert.equal(resolveChain("xrp"), "xrp");
  assert.equal(resolveChain("basee"), null);
  assert.equal(resolveChain(99999), null);
});

test("checkAddress on an unknown chain returns the error shape, not a throw", async () => {
  const r1 = await checkAddress(AGW, "basee");
  assert.equal(r1.error, "bad-chain");
  const r2 = await checkAddress(AGW, 99999);
  assert.equal(r2.error, "bad-chain");
});

test("defaultLoadShard returns empty bytes when fetch fails", async () => {
  const loader = defaultLoadShard({ fetch: async () => { throw new Error("offline"); } });
  const bytes = await loader("ab");
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(bytes.length, 0);
});
