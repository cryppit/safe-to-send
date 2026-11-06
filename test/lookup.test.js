// Any address, any chain: what a check says before it ever reads a chain. Real addresses, no network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { lookup, namehash } from "../src/lookup.js";

const noNetwork = () => async () => { throw new Error("this check must not touch the network"); };
const VITALIK = "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045";
const BTC = "bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq";
const SATOSHI = "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa";
const SOL = "vines1vzrYbzLMRdu58ou5XTby4qAqVRLmqo36NKPTg";
const SUI = "0x" + "ab".repeat(32);

test("a Bitcoin address on BNB Chain: stop, wrong network, and it offers Bitcoin instead", async () => {
  const r = await lookup(BTC, 56, { clients: noNetwork });
  assert.equal(r.verdict.level, "stop");
  assert.equal(r.verdict.kind, "wrong-network");
  assert.match(r.verdict.title, /not a BNB Chain address/);
  assert.match(r.verdict.reasons.join(" "), /Bitcoin/);
  assert.equal(r.suggest, "bitcoin");
});

test("a Bitcoin address on Bitcoin: format only, never the word safe", async () => {
  const r = await lookup(BTC, "bitcoin", { clients: noNetwork });
  assert.equal(r.verdict.level, "format");
  assert.equal(r.scope, "format");
  assert.doesNotMatch(r.verdict.title, /safe/i);
  assert.match(r.verdict.reasons.join(" "), /did not read Bitcoin/);
});

test("a mistyped Bitcoin address: stop", async () => {
  const r = await lookup("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb", "bitcoin", { clients: noNetwork });
  assert.equal(r.verdict.level, "stop");
  assert.equal(r.verdict.kind, "bad-address");
});

test("a mistyped Bitcoin address on an EVM chain says it has a mistake, and offers nothing", async () => {
  const r = await lookup("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb", 1, { clients: noNetwork });
  assert.equal(r.verdict.level, "stop");
  assert.equal(r.verdict.kind, "bad-address");
  assert.equal(r.suggest, undefined);
});

test("a Solana address on Solana warns that it has no typo check", async () => {
  const r = await lookup(SOL, "solana", { clients: noNetwork });
  assert.equal(r.verdict.level, "format");
  assert.match(r.verdict.reasons.join(" "), /no built-in check/);
});

test("an EVM address on Bitcoin: stop, and it offers Ethereum instead", async () => {
  const r = await lookup(VITALIK, "bitcoin", { clients: noNetwork });
  assert.equal(r.verdict.kind, "wrong-network");
  assert.equal(r.suggest, 1);
});

test("a mistyped EVM address fails its checksum before any chain is read", async () => {
  const r = await lookup("0xd8da6BF26964aF9D7eEd9e03E53415D37aA96045", 1, { clients: noNetwork });
  assert.equal(r.verdict.level, "stop");
  assert.equal(r.verdict.kind, "bad-address");
});

test("a Sui address on Base is not an EVM address, even though it starts with 0x", async () => {
  const r = await lookup(SUI, 8453, { clients: noNetwork });
  assert.equal(r.verdict.kind, "wrong-network");
  assert.match(r.verdict.reasons.join(" "), /Sui/);
});

test("something that is no address at all: stop", async () => {
  const r = await lookup("hello there", 1, { clients: noNetwork });
  assert.equal(r.verdict.level, "stop");
  assert.equal(r.verdict.kind, "not-an-address");
});

test("an old-style address on Bitcoin Cash: caution, it could be either coin", async () => {
  const r = await lookup(SATOSHI, "bitcoincash", { clients: noNetwork });
  assert.equal(r.verdict.level, "caution");
  assert.match(r.verdict.reasons.join(" "), /Bitcoin Cash/);
});

test("a valid EVM address goes on to the live check", async () => {
  const r = await lookup(VITALIK, 1, { clients: () => async (m) => (m === "eth_getCode" ? "0x" : "0x5"), chains: [{ id: 1, name: "Ethereum" }] });
  assert.equal(r.verdict.level, "safe");
  assert.equal(r.verdict.kind, "key-wallet");
  assert.equal(r.facts.address, VITALIK.toLowerCase());
});

test("namehash matches the ENS specification", () => {
  assert.equal(namehash("eth"), "0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae");
  assert.equal(namehash("foo.eth"), "0xde9b09fd7c5f901e23a3f19fecc54828e9c848539801e86591bd9801b019f84f");
});

const ens = (resolver, addr) => () => async (method, params) => {
  if (method !== "eth_call") return method === "eth_getCode" ? "0x" : "0x5";
  const to = params[0].to.toLowerCase();
  if (to === "0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e") return "0x" + resolver.padStart(64, "0");
  return "0x" + addr.padStart(64, "0");
};

test("an ENS name is resolved, then checked as its address", async () => {
  const r = await lookup("Vitalik.eth", 8453, { clients: ens("11".repeat(20), VITALIK.slice(2).toLowerCase()), chains: [{ id: 8453, name: "Base" }, { id: 1, name: "Ethereum" }] });
  assert.equal(r.ens.name, "vitalik.eth");
  assert.equal(r.ens.address, VITALIK.toLowerCase());
  assert.equal(r.facts.address, VITALIK.toLowerCase());
  assert.equal(r.verdict.level, "safe");
});

test("an ENS name with no resolver: can't tell, nothing else is claimed", async () => {
  const r = await lookup("nobody-owns-this.eth", 1, { clients: ens("0", "0") });
  assert.equal(r.verdict.level, "unknown");
  assert.equal(r.verdict.kind, "ens-unresolved");
});

test("an unreadable ENS lookup says so", async () => {
  const r = await lookup("vitalik.eth", 1, { clients: noNetwork });
  assert.equal(r.verdict.level, "unknown");
  assert.equal(r.verdict.kind, "ens-unresolved");
});

test("a lower-case EVM address on Bitcoin is called Ethereum, not NEAR", async () => {
  const r = await lookup(VITALIK.toLowerCase(), "bitcoin", { clients: noNetwork });
  assert.doesNotMatch(r.verdict.reasons.join(" "), /NEAR/);
});

const XRP = "rPVMhWBsfF9iMXYj3aAzJVkPDTFNSyWdKy";

test("an XRP address with its tag in the ?dt= form is a good address, and the tag is kept", async () => {
  const r = await lookup(`${XRP}?dt=123456`, "xrp", { clients: noNetwork, fetch: async () => { throw new Error("down"); } });
  assert.equal(r.verdict.level, "format");
  assert.match(r.verdict.reasons.join(" "), /destination tag 123456/);
});

test("a tag too large for the XRP Ledger: stop", async () => {
  const r = await lookup(`${XRP}?dt=4294967296`, "xrp", { clients: noNetwork });
  assert.equal(r.verdict.level, "stop");
  assert.equal(r.verdict.kind, "bad-address");
});

test("an XRP address with a tag on an EVM chain is the wrong network", async () => {
  const r = await lookup(`${XRP}?dt=123456`, 56, { clients: noNetwork });
  assert.equal(r.verdict.kind, "wrong-network");
  assert.equal(r.suggest, "xrp");
});

test("a Zcash address on Zcash says who can pay it", async () => {
  const r = await lookup("t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs", "zcash", { clients: noNetwork });
  assert.equal(r.verdict.level, "format");
  assert.match(r.verdict.reasons.join(" "), /shielded balance/);
});

test("a Zcash address on an EVM chain is the wrong network, and offers Zcash", async () => {
  const r = await lookup("t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs", 1, { clients: noNetwork });
  assert.equal(r.verdict.kind, "wrong-network");
  assert.equal(r.suggest, "zcash");
});
