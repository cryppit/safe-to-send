// The flow picture must never promise an answer the tool doesn't give.
import { test } from "node:test";
import assert from "node:assert/strict";
import { SCENES, GATES } from "../src/scenes.js";
import { lookup } from "../src/lookup.js";
import { targetById } from "../src/chains.js";
import { existsSync } from "node:fs";

test("every scene has a known target, a real gate and a logo", () => {
  const levels = new Set(GATES.map((g) => g.level));
  for (const s of SCENES) {
    assert.ok(targetById(s.target), s.label);
    assert.ok(levels.has(s.level), s.label);
    assert.ok(existsSync(new URL(`../logos/${s.icon}.svg`, import.meta.url)), s.icon);
  }
});

test("every gate is reached by at least one scene", () => {
  for (const g of GATES) assert.ok(SCENES.some((s) => s.level === g.level), g.level);
});

test("the scenes that need no chain get exactly the answer they show", async () => {
  const offline = SCENES.filter((s) => !/^0x|\.eth$/.test(s.address));
  assert.equal(offline.length, 3);
  const clients = () => async () => { throw new Error("no network"); };
  for (const s of offline) assert.equal((await lookup(s.address, s.target, { clients })).verdict.level, s.level, s.title);
});
