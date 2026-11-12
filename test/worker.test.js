// The hosted API handler, exercised directly with injected recorded replays. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { handle } from "../worker/index.js";
import { guardedFetch } from "../worker/allowlist.js";
import { replaying } from "../src/rpc.js";
import { replayingFetch } from "../src/record.js";
import { buildShards } from "../src/archive.js";

const fx = JSON.parse(readFileSync(new URL("../fixtures/agw-on-bnb.json", import.meta.url)));
const archive = buildShards([fx.address]);
const env = {
  clients: (c) => replaying(fx.store[c.id] ?? {}),
  fetch: replayingFetch({}),
  loadShard: async (k) => archive[k] ?? new Uint8Array(0),
};
const req = (path) => new Request(`https://api.example${path}`);

test("GET /v1/check returns the library verdict as JSON", async () => {
  const res = await handle(req(`/v1/check?address=${fx.address}&chain=56`), env);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  const body = await res.json();
  assert.equal(body.verdict.level, "stop");
});
test("GET /v1/check with no address returns 400, not 500", async () => {
  const res = await handle(req("/v1/check?chain=56"), env);
  assert.equal(res.status, 400);
});
test("GET /v1/check with an unknown chain returns 400", async () => {
  const res = await handle(req("/v1/check?address=0xd8b17dbd34391993ee11b501e6275bbc715e2529&chain=basee"), env);
  assert.equal(res.status, 400);
});
test("GET /v1/chains lists chains and networks", async () => {
  const res = await handle(req("/v1/chains"));
  const body = await res.json();
  assert.ok(Array.isArray(body.chains) && body.chains.some((c) => c.id === 8453));
  assert.ok(Array.isArray(body.networks) && body.networks.some((n) => n.id === "xrp"));
});
test("an upstream host not in the allowlist is refused (SSRF guard)", async () => {
  const f = guardedFetch(async () => "called");
  await assert.rejects(() => f("https://evil.example/x"), /not allowed/);
  assert.equal(await f("https://ethereum-rpc.publicnode.com"), "called");
});
test("OPTIONS preflight returns permissive CORS headers", async () => {
  const res = await handle(new Request("https://api.example/v1/check", { method: "OPTIONS" }));
  assert.equal(res.status, 204);
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
});
test("an unknown path returns 404", async () => {
  const res = await handle(req("/nope"));
  assert.equal(res.status, 404);
});
