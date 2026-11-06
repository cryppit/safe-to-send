import { test } from "node:test";
import assert from "node:assert/strict";
import { matchGroups } from "../src/picker.js";

const groups = [{ label: "Live", items: [{ id: 1, name: "Ethereum" }, { id: 56, name: "BNB Chain" }] }, { label: "Format", items: [{ id: "bitcoin", name: "Bitcoin" }, { id: "bitcoincash", name: "Bitcoin Cash" }] }];

test("nothing typed shows every group", () => assert.equal(matchGroups(groups, "  ").length, 2));
test("search ignores case and spaces", () => assert.deepEqual(matchGroups(groups, "bnbch")[0].items.map((c) => c.id), [56]));
test("a group with no match is dropped", () => {
  const r = matchGroups(groups, "bitcoin");
  assert.equal(r.length, 1);
  assert.equal(r[0].items.length, 2);
});
test("no match at all is an empty list", () => assert.equal(matchGroups(groups, "dogs").length, 0));
