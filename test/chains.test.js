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

test("retired chains carry their shutdown date and no RPCs, and LIVE_CHAINS leaves them out", async () => {
  const { LIVE_CHAINS } = await import("../src/chains.js");
  const retired = CHAINS.filter((c) => c.retired);
  assert.deepEqual(retired.map((c) => [c.id, c.retired]).sort(), [[1101, "2026-07-01"], [1135, "2026-11-02"], [81457, "2026-11-04"]]);
  for (const c of retired) assert.deepEqual(c.rpcs, []);
  assert.equal(LIVE_CHAINS.length, CHAINS.length - 3);
  assert.ok(LIVE_CHAINS.every((c) => !c.retired && c.rpcs.length > 0));
});
