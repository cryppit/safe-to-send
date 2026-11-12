// Guard: the deploy runbook stays in sync with the things a release actually touches.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const md = readFileSync(new URL("../RELEASE.md", import.meta.url), "utf8");
test("RELEASE.md documents every deploy target", () => {
  for (const s of ["Trusted Publishing", "npm audit signatures", "wrangler deploy", "WAF", "R2", "Arweave", "verify-archive", "re-freeze", "SHA"]) {
    assert.match(md, new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), `RELEASE.md should mention ${s}`);
  }
});
