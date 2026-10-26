import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { CHAINS } from "../src/chains.js";

test("every chain has a logo file", () => {
  for (const c of CHAINS) assert.ok(c.logo && existsSync(new URL(`../logos/${c.logo}.svg`, import.meta.url)), `${c.name}: logos/${c.logo}.svg`);
});
