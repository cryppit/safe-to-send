// What the page can do with an address is fixed here: no third-party code, and no host beyond the public RPCs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { CHAINS } from "../src/chains.js";
import { XRP_SERVICES, HORIZON } from "../src/ledgers.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "";
const directive = (name) => csp.split(";").map((d) => d.trim()).find((d) => d.startsWith(`${name} `))?.split(" ").slice(1) ?? [];
const code = readdirSync(new URL("../src/", import.meta.url)).filter((f) => f.endsWith(".js")).map((f) => readFileSync(new URL(`../src/${f}`, import.meta.url), "utf8")).join("\n");

test("the page can reach only itself and the chains' own RPCs", () => {
  const allowed = directive("connect-src").filter((h) => h !== "'self'").sort();
  const rpcs = [...new Set([...CHAINS.flatMap((c) => c.rpcs), ...XRP_SERVICES, HORIZON].map((u) => new URL(u).origin))].sort();
  assert.deepEqual(allowed, rpcs);
});

test("everything else is shut", () => {
  assert.deepEqual(directive("default-src"), ["'none'"]);
  assert.deepEqual(directive("script-src"), ["'self'"]);
  assert.deepEqual(directive("base-uri"), ["'none'"]);
  assert.deepEqual(directive("form-action"), ["'none'"]);
  assert.match(html, /<meta name="referrer" content="no-referrer">/);
});

test("no inline script, and no script, font or stylesheet from anywhere else", () => {
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc="src\/)/);
  assert.doesNotMatch(html, /<link[^>]+rel="stylesheet"/);
  assert.doesNotMatch(html, /fonts\.g|cdn\.|unpkg|jsdelivr|googletagmanager/);
});

test("nothing is stored, tracked or beaconed", () => {
  assert.doesNotMatch(code, /localStorage|sessionStorage|indexedDB|document\.cookie|sendBeacon|XMLHttpRequest|WebSocket/);
});
