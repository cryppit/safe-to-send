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

// Rate limit: /v1/check is the only route that reaches upstream RPCs, so it is the one the CHECK_RL binding guards.
const limiter = (success) => {
  const keys = [];
  return { keys, limit: async ({ key }) => { keys.push(key); return { success }; } };
};
const reqFrom = (path, ip) => new Request(`https://api.example${path}`, { headers: { "cf-connecting-ip": ip } });

test("GET /v1/check over the rate limit returns 429 and never calls the library", async () => {
  const rl = limiter(false);
  const res = await handle(reqFrom(`/v1/check?address=${fx.address}&chain=56`, "203.0.113.7"), { ...env, CHECK_RL: rl });
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "60");
  assert.equal(res.headers.get("access-control-allow-origin"), "*");
  assert.deepEqual(rl.keys, ["203.0.113.7"]);
  assert.equal((await res.json()).error, "rate-limited");
});
test("GET /v1/check under the rate limit answers normally, keyed by the caller's IP", async () => {
  const rl = limiter(true);
  const res = await handle(reqFrom(`/v1/check?address=${fx.address}&chain=56`, "198.51.100.2"), { ...env, CHECK_RL: rl });
  assert.equal(res.status, 200);
  assert.deepEqual(rl.keys, ["198.51.100.2"]);
});
test("/v1/chains and /v1/health are not rate limited", async () => {
  const rl = limiter(false);
  assert.equal((await handle(reqFrom("/v1/chains", "203.0.113.7"), { CHECK_RL: rl })).status, 200);
  assert.equal((await handle(reqFrom("/v1/health", "203.0.113.7"), { CHECK_RL: rl })).status, 200);
  assert.deepEqual(rl.keys, []);
});

test("GET /.well-known/security.txt serves the site's security.txt, with the API as its canonical address", async () => {
  const site = readFileSync(new URL("../public/.well-known/security.txt", import.meta.url), "utf8");
  const res = await handle(req("/.well-known/security.txt"));
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /^text\/plain/);
  const body = await res.text();
  const strip = (t) => t.split("\n").filter((l) => l && !l.startsWith("Canonical:")).join("\n");
  assert.equal(strip(body), strip(site));
  assert.match(body, /^Canonical: https:\/\/safe-to-send-api\.station-wheres-my-swap\.workers\.dev\/\.well-known\/security\.txt$/m);
});
