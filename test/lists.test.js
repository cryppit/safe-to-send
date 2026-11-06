// The two shipped lists. They only ever add a warning: an address that isn't listed gets no comment at all.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { lookup } from "../src/lookup.js";
import { parseLists } from "../src/lists.js";

const noNetwork = () => async () => { throw new Error("no network"); };
const BAD = "0x" + "ab".repeat(20), BIN = "0x" + "cd".repeat(20), BTC = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
const lists = async () => parseLists({ asOf: "2026-10-29", addresses: [BAD, BTC] }, { asOf: "November 2022", wallets: { [BIN]: "Binance" } });
const key = () => async (m) => (m === "eth_getCode" ? "0x" : "0x5");
const chain = [{ id: 1, name: "Ethereum" }];

test("an exact OFAC match: stop, naming the list and its date, nothing more", async () => {
  const r = await lookup(BAD.toUpperCase().replace("0X", "0x"), 1, { clients: key, chains: chain, lists });
  assert.equal(r.verdict.level, "stop");
  assert.equal(r.verdict.kind, "sanctioned");
  assert.match(r.verdict.title, /US OFAC sanctions list/);
  assert.match(r.verdict.reasons.join(" "), /2026-10-29/);
});

test("OFAC also matches on networks that aren't read", async () => {
  const r = await lookup(BTC, "bitcoin", { clients: noNetwork, lists });
  assert.equal(r.verdict.kind, "sanctioned");
});

test("a listed exchange wallet keeps its answer and adds a dated warning", async () => {
  const r = await lookup(BIN, 1, { clients: key, chains: chain, lists });
  assert.equal(r.verdict.level, "safe");
  assert.match(r.notices[0], /Listed as a Binance reserve wallet/);
  assert.match(r.notices[0], /November 2022/);
  assert.match(r.notices[0], /may not be your deposit address/);
});

test("an address on neither list gets no comment", async () => {
  const r = await lookup("0x" + "ef".repeat(20), 1, { clients: key, chains: chain, lists });
  assert.equal(r.notices, undefined);
  assert.doesNotMatch(JSON.stringify(r), /exchange wallet|sanction/i);
});

test("if the lists don't load, the check still answers", async () => {
  const r = await lookup(BAD, 1, { clients: key, chains: chain, lists: async () => { throw new Error("no file"); } });
  assert.equal(r.verdict.level, "safe");
});

test("the shipped lists are present and carry their sources and dates", () => {
  const read = (f) => JSON.parse(readFileSync(new URL(`../data/lists/${f}`, import.meta.url)));
  assert.ok(existsSync(new URL("../data/lists/LICENSE", import.meta.url)));
  const o = read("ofac.json"), e = read("exchanges.json");
  assert.ok(o.addresses.length > 300 && o.asOf && o.source);
  assert.ok(Object.keys(e.wallets).length > 100 && e.asOf && e.source);
  for (const a of Object.keys(e.wallets)) if (a.startsWith("0x")) assert.equal(a, a.toLowerCase());
  assert.ok(!Object.values(e.wallets).some((n) => /bitmex/i.test(n)), "per-user BitMEX deposit addresses stay out");
});
