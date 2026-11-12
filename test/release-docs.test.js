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

const releaseYml = readFileSync(new URL("../.github/workflows/release.yml", import.meta.url), "utf8");
test("release.yml upgrades npm so OIDC Trusted Publishing works", () => {
  assert.match(releaseYml, /npm install -g npm@/, "release.yml must upgrade npm (>=11.5.1) for tokenless OIDC publish");
});
test("RELEASE.md notes the npm version requirement", () => {
  assert.match(md, /11\.5/, "RELEASE.md should state npm >=11.5.1 is required for Trusted Publishing");
});
