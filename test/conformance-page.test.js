// The conformance page: a static board rendered from the runner's result.
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderConformancePage } from "../scripts/conformance-page.mjs";

const PASSING = { total: 2, pass: 2, fail: 0, results: [
  { id: "agw-on-bnb", chain: 56, expect: "stop", actual: "stop", ok: true },
  { id: "safe-eoa-on-op", chain: 10, expect: "safe", actual: "safe", ok: true },
] };
const FAILING = { total: 1, pass: 0, fail: 1, results: [
  { id: "x", chain: 1, expect: "safe", actual: "stop", ok: false },
] };

test("renderConformancePage shows a row per vector with expect and actual", () => {
  const html = renderConformancePage(PASSING, "2026-11-12");
  assert.match(html, /agw-on-bnb/);
  assert.match(html, /safe-eoa-on-op/);
  assert.match(html, /stop/);
  assert.match(html, /safe/);
  assert.ok((html.match(/<tr/g) || []).length >= 3); // header + 2 rows
});
test("the page marks an overall FAIL when any vector failed", () => {
  assert.match(renderConformancePage(FAILING, "2026-11-12"), /FAIL/);
});
test("the page shows an overall PASS when all vectors pass", () => {
  assert.match(renderConformancePage(PASSING, "2026-11-12"), /PASS/);
});
test("the page includes the run date", () => {
  assert.match(renderConformancePage({ total: 0, pass: 0, fail: 0, results: [] }, "2026-11-12"), /2026-11-12/);
});
