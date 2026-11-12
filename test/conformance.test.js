// Conformance runner: replay recorded answers through the engine and compare each verdict level to the vector's
// expect. A vector whose recorded data is incomplete must fail loudly, never silently pass. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runConformance } from "../scripts/conformance.mjs";
import { replayingFetch } from "../src/record.js";

const fx = JSON.parse(readFileSync(new URL("../fixtures/agw-on-bnb.json", import.meta.url)));

function makeSet({ expect = "stop", emptyStore = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sts-conf-"));
  mkdirSync(join(dir, "recorded"));
  writeFileSync(join(dir, "recorded", "agw.json"), JSON.stringify({
    store: emptyStore ? {} : fx.store, fetch: {}, agwArchive: emptyStore ? [] : [fx.address],
  }));
  writeFileSync(join(dir, "vectors.json"), JSON.stringify([
    { id: "agw", input: fx.address, chain: 56, expect, why: "AGW on BNB is unreachable", recorded: "agw.json" },
  ]));
  return dir;
}
const run = async (opts) => { const d = makeSet(opts); try { return await runConformance(join(d, "vectors.json"), join(d, "recorded")); } finally { rmSync(d, { recursive: true, force: true }); } };

test("runConformance passes when a vector's actual level equals expect", async () => {
  const r = await run({ expect: "stop" });
  assert.equal(r.total, 1);
  assert.equal(r.pass, 1);
  assert.equal(r.results[0].actual, "stop");
});
test("a vector with a wrong expect is reported as fail", async () => {
  const r = await run({ expect: "safe" });
  assert.equal(r.fail, 1);
  assert.equal(r.results[0].ok, false);
});
test("a vector missing its recorded reads is reported as fail, not pass", async () => {
  const r = await run({ expect: "stop", emptyStore: true });
  assert.equal(r.results[0].ok, false);
  assert.notEqual(r.results[0].actual, "stop");
});
test("replayingFetch returns the recorded response keyed by url+body", async () => {
  const f = replayingFetch({ "https://x/\n{\"a\":1}": { status: 200, body: "{\"ok\":true}" } });
  const res = await f("https://x/", { body: "{\"a\":1}" });
  assert.equal(res.ok, true);
  assert.deepEqual(await res.json(), { ok: true });
});
