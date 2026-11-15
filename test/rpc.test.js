import { test } from "node:test";
import assert from "node:assert/strict";
import { makeRpc, RpcError } from "../src/rpc.js";

// A fake fetch that answers from a script of responses per URL, in order, and records every call.
function scripted(byUrl) {
  const calls = [];
  const fetch = async (url) => {
    calls.push(url);
    const next = byUrl[url].shift();
    if (next instanceof Error) throw next;
    return new Response(JSON.stringify(next.body ?? {}), { status: next.status ?? 200 });
  };
  return { fetch, calls };
}
const ok = (result) => ({ body: { jsonrpc: "2.0", id: 1, result } });
const http429 = { status: 429, body: { error: "Too Many Requests" } };
const rpc429 = (code, message) => ({ body: { jsonrpc: "2.0", id: 1, error: { code, message } } });
const noSleep = { sleep: async () => {}, random: () => 0.5 };

test("when every endpoint is rate limited, it waits and tries the list once more", async () => {
  const f = scripted({ "https://a.example": [http429, ok("0x1")], "https://b.example": [http429] });
  const slept = [];
  const call = makeRpc(["https://a.example", "https://b.example"], { fetch: f.fetch, sleep: async (ms) => slept.push(ms), random: () => 0.5, retryDelayMs: 400 });
  assert.equal(await call("eth_getTransactionCount", []), "0x1");
  assert.deepEqual(f.calls, ["https://a.example", "https://b.example", "https://a.example"]);
  assert.equal(slept.length, 1);
  assert.ok(slept[0] >= 200 && slept[0] <= 600);
});

test("JSON-RPC rate-limit errors (the Base, OP and Polygon public RPC answers) also earn the retry", async () => {
  for (const err of [rpc429(-32007, "25/second request limit reached"), rpc429(-32016, "Your IP has exceeded its requests per second capacity"), rpc429(-32005, "rate limit exceeded")]) {
    const f = scripted({ "https://a.example": [err, ok("0x")] });
    const call = makeRpc(["https://a.example"], { fetch: f.fetch, ...noSleep });
    assert.equal(await call("eth_getCode", []), "0x");
    assert.equal(f.calls.length, 2);
  }
});

test("other failures do not retry: one pass over the list, then RpcError", async () => {
  const f = scripted({ "https://a.example": [{ status: 502 }], "https://b.example": [new Error("connect failed")] });
  const call = makeRpc(["https://a.example", "https://b.example"], { fetch: f.fetch, ...noSleep });
  await assert.rejects(call("eth_getCode", []), RpcError);
  assert.equal(f.calls.length, 2);
});

test("it retries at most once", async () => {
  const f = scripted({ "https://a.example": [http429, http429, ok("0x2")] });
  const call = makeRpc(["https://a.example"], { fetch: f.fetch, ...noSleep });
  await assert.rejects(call("eth_getCode", []), RpcError);
  assert.equal(f.calls.length, 2);
});

test("an endpoint that answers on the first pass is used with no wait", async () => {
  const f = scripted({ "https://a.example": [http429], "https://b.example": [ok("0x3")] });
  const slept = [];
  const call = makeRpc(["https://a.example", "https://b.example"], { fetch: f.fetch, sleep: async (ms) => slept.push(ms) });
  assert.equal(await call("eth_getCode", []), "0x3");
  assert.equal(slept.length, 0);
});
