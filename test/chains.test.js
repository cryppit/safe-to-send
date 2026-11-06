import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { CHAINS } from "../src/chains.js";

test("every chain has a logo file", () => {
  for (const c of CHAINS) assert.ok(c.logo && existsSync(new URL(`../logos/${c.logo}.svg`, import.meta.url)), `${c.name}: logos/${c.logo}.svg`);
});

test("every network without a live check has a logo, and its id is a chain the address checker knows", async () => {
  const { NETWORKS } = await import("../src/chains.js");
  const { CHAIN_NAME } = await import("../src/address-advice.js");
  for (const n of NETWORKS) {
    assert.ok(n.id in CHAIN_NAME, n.id);
    assert.ok(n.logo && existsSync(new URL(`../logos/${n.logo}.svg`, import.meta.url)), `${n.name}: logos/${n.logo}.svg`);
  }
});

test("no RPC uses a banned provider, and chain IDs are unique", () => {
  for (const c of CHAINS) for (const u of c.rpcs) assert.doesNotMatch(u, /drpc|1rpc/i, u);
  assert.equal(new Set(CHAINS.map((c) => c.id)).size, CHAINS.length);
});
