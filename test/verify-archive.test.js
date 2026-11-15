// Offline archive verifier: re-hash shards against the manifest. Tiny temp archives, no network, not the 29MB one.
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { verifyArchive } from "../scripts/verify-archive.mjs";

function makeArchive({ tamper = false, missing = false, extra = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "sts-arch-"));
  mkdirSync(join(dir, "agw"));
  const data = Buffer.from([1, 2, 3, 4, 5, 6, 7]);
  const sha = createHash("sha256").update(data).digest("hex");
  const shards = { ab: { wallets: 1, records: 1, sha256: sha } };
  if (!missing) writeFileSync(join(dir, "agw", "ab.bin"), tamper ? Buffer.from([9, 9, 9, 9, 9, 9, 9]) : data);
  if (extra) writeFileSync(join(dir, "agw", "cd.bin"), data);
  writeFileSync(join(dir, "manifest.json"), JSON.stringify({ toBlock: 123, toBlockHash: "0xabc", shards }));
  return dir;
}
const run = (opts) => { const d = makeArchive(opts); try { return verifyArchive(d); } finally { rmSync(d, { recursive: true, force: true }); } };

test("verifyArchive passes on a manifest+shard whose hash matches", () => {
  const r = run();
  assert.equal(r.ok, true);
  assert.deepEqual(r.failures, []);
  assert.equal(r.checked, 1);
});
test("verifyArchive fails on a tampered shard byte", () => {
  const r = run({ tamper: true });
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => /ab/.test(f) && /sha256/.test(f)));
});
test("verifyArchive fails when a manifest shard file is missing", () => {
  assert.equal(run({ missing: true }).ok, false);
});
test("verifyArchive fails when a shard file is not in the manifest", () => {
  assert.equal(run({ extra: true }).ok, false);
});

// The same check against a mirror's URL (GitHub Pages, R2): a fake fetch serves a tiny archive, no network.
import { verifyArchiveUrl } from "../scripts/verify-archive.mjs";
function served({ tamper = false, missing = false, status = 200 } = {}) {
  const data = Buffer.from([1, 2, 3, 4, 5, 6, 7]);
  const sha = createHash("sha256").update(data).digest("hex");
  const files = {
    "https://mirror.example/abstract/manifest.json": Buffer.from(JSON.stringify({ toBlock: 123, toBlockHash: "0xabc", shards: { ab: { sha256: sha } } })),
    "https://mirror.example/abstract/agw/ab.bin": tamper ? Buffer.from([9]) : data,
  };
  if (missing) delete files["https://mirror.example/abstract/agw/ab.bin"];
  const asked = [];
  const fetch = async (url) => { asked.push(url); const b = files[url]; return b && status === 200 ? new Response(b) : new Response("no", { status: b ? status : 404 }); };
  return { fetch, asked };
}
test("verifyArchiveUrl passes a mirror whose shards match, fetching manifest then every shard", async () => {
  const { fetch, asked } = served();
  const r = await verifyArchiveUrl("https://mirror.example/abstract/", { fetch });
  assert.deepEqual(r, { ok: true, checked: 1, failures: [] });
  assert.deepEqual(asked, ["https://mirror.example/abstract/manifest.json", "https://mirror.example/abstract/agw/ab.bin"]);
});
test("verifyArchiveUrl fails on a tampered or missing shard, and on a missing manifest", async () => {
  assert.equal((await verifyArchiveUrl("https://mirror.example/abstract", served({ tamper: true }))).ok, false);
  const gone = await verifyArchiveUrl("https://mirror.example/abstract", served({ missing: true }));
  assert.ok(gone.failures.some((f) => /ab/.test(f) && /404/.test(f)));
  const none = await verifyArchiveUrl("https://mirror.example/nothing", served());
  assert.deepEqual(none, { ok: false, checked: 0, failures: ["manifest.json: HTTP 404"] });
});
