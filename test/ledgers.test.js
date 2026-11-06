// XRP tags and Stellar memos, from recorded-shape answers. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readXrp, readStellar, looksShared } from "../src/ledgers.js";
import { lookup } from "../src/lookup.js";

const XRP = "rPVMhWBsfF9iMXYj3aAzJVkPDTFNSyWdKy";
const STELLAR = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const noNetwork = () => async () => { throw new Error("no network"); };
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

const payment = (i, tag) => ({ tx: { TransactionType: "Payment", Account: `rSender${i % 12}`, Destination: XRP, Amount: "5000000", ...(tag ? { DestinationTag: tag } : {}) } });
const xrpFetch = ({ flag = false, found = true, txs = [] } = {}) => async (_url, init) => {
  const { method } = JSON.parse(init.body);
  if (method === "account_info") return json({ result: found ? { status: "success", account_flags: { requireDestinationTag: flag }, account_data: { Flags: flag ? 131072 : 0 } } : { status: "error", error: "actNotFound" } });
  return json({ result: { status: "success", transactions: txs } });
};
const shared = Array.from({ length: 30 }, (_, i) => payment(i, 100000 + i));
const stellarFetch = ({ memo = false, found = true } = {}) => async () => (found ? json({ data: memo ? { "config.memo_required": "MQ==" } : {} }) : json({ status: 404 }, 404));
const on = (address, target, fetch) => lookup(address, target, { clients: noNetwork, fetch });

test("many senders with varied high tags looks shared; a personal account does not", () => {
  assert.equal(looksShared(shared, XRP), true);
  assert.equal(looksShared(Array.from({ length: 30 }, (_, i) => payment(i)), XRP), false);
  assert.equal(looksShared(Array.from({ length: 30 }, (_, i) => payment(0, 100000 + i)), XRP), false, "one sender is not many");
  assert.equal(looksShared(shared.slice(0, 5), XRP), false, "too few payments to say");
});

test("XRP: the flag is read, and a missing account says so", async () => {
  assert.equal((await readXrp(XRP, { fetch: xrpFetch({ flag: true }) })).requireTag, true);
  assert.equal((await readXrp(XRP, { fetch: xrpFetch({ found: false }) })).exists, false);
});

test("XRP: the second service is tried when the first fails, and total failure is null", async () => {
  let calls = 0;
  const flaky = async (url, init) => { calls += 1; if (url.includes("xrplcluster")) throw new Error("down"); return xrpFetch({ flag: true })(url, init); };
  assert.equal((await readXrp(XRP, { fetch: flaky })).requireTag, true);
  assert.ok(calls >= 2);
  assert.equal(await readXrp(XRP, { fetch: async () => { throw new Error("down"); } }), null);
});

test("Stellar: config.memo_required is read, a 404 is a missing account, a failure is null", async () => {
  assert.equal((await readStellar(STELLAR, { fetch: stellarFetch({ memo: true }) })).memoRequired, true);
  assert.equal((await readStellar(STELLAR, { fetch: stellarFetch() })).memoRequired, false);
  assert.equal((await readStellar(STELLAR, { fetch: stellarFetch({ found: false }) })).exists, false);
  assert.equal(await readStellar(STELLAR, { fetch: async () => { throw new Error("down"); } }), null);
});

test("XRP needing a tag, with none given: caution, and it says the ledger rejects it", async () => {
  const r = await on(XRP, "xrp", xrpFetch({ flag: true }));
  assert.equal(r.verdict.level, "caution");
  assert.equal(r.verdict.kind, "tag-required");
  assert.match(r.verdict.reasons.join(" "), /rejects the payment/);
  assert.equal(r.read, "XRP Ledger");
});

test("XRP needing a tag, with one given: never calls the tag valid", async () => {
  const r = await on(`${XRP}?dt=123456`, "xrp", xrpFetch({ flag: true }));
  assert.equal(r.verdict.level, "format");
  assert.doesNotMatch(JSON.stringify(r.verdict), /tag (looks|is) (valid|correct|right)/i);
  assert.match(r.verdict.reasons.join(" "), /Only the recipient/);
});

test("XRP that looks shared, with no tag: caution, and it says probably", async () => {
  const r = await on(XRP, "xrp", xrpFetch({ txs: shared }));
  assert.equal(r.verdict.kind, "tag-likely");
  assert.match(r.verdict.title, /probably/);
});

test("XRP with no sign of a tag never says no tag is needed", async () => {
  const r = await on(XRP, "xrp", xrpFetch());
  assert.equal(r.verdict.level, "format");
  const words = r.verdict.reasons.join(" ");
  assert.match(words, /no sign/i);
  assert.match(words, /Exchanges often don't declare it/);
  assert.doesNotMatch(words, /no tag (is )?(needed|required)/i);
});

test("an inactive XRP or Stellar account says so", async () => {
  assert.equal((await on(XRP, "xrp", xrpFetch({ found: false }))).verdict.kind, "not-active");
  assert.equal((await on(STELLAR, "stellar", stellarFetch({ found: false }))).verdict.kind, "not-active");
});

test("when the ledger can't be read, the answer stays format only and says so", async () => {
  const r = await on(XRP, "xrp", async () => { throw new Error("down"); });
  assert.equal(r.verdict.level, "format");
  assert.equal(r.read, undefined);
  assert.match(r.verdict.reasons.join(" "), /couldn't be read/);
});

test("Stellar asking for a memo: caution, and it says the network won't stop it", async () => {
  const r = await on(STELLAR, "stellar", stellarFetch({ memo: true }));
  assert.equal(r.verdict.level, "caution");
  assert.equal(r.verdict.kind, "memo-required");
  assert.match(r.verdict.reasons.join(" "), /network won't stop/);
});

test("Stellar with no flag never says no memo is needed", async () => {
  const r = await on(STELLAR, "stellar", stellarFetch());
  assert.equal(r.verdict.level, "format");
  assert.match(r.verdict.reasons.join(" "), /no sign/i);
  assert.doesNotMatch(r.verdict.reasons.join(" "), /no memo (is )?(needed|required)/i);
});

test("Bitcoin is never read", async () => {
  const r = await lookup("bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq", "bitcoin", { clients: noNetwork, fetch: async () => { throw new Error("must not fetch"); } });
  assert.equal(r.verdict.level, "format");
  assert.equal(r.read, undefined);
});
