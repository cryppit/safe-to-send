// The verdict for one (address, chain) pair, from facts read on every chain. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { classify, kindOfCode } from "../src/classify.js";

const A = "0xd8b17dbd34391993ee11b501e6275bbc715e2529";
const EMPTY = { code: "0x", nonce: 0 };
// Facts on four chains; `over` replaces some of them. Chain IDs: 1 Ethereum, 56 BNB, 8453 Base, 324 ZKsync Era.
const facts = (target, over = {}, extra = {}) => ({
  address: A,
  target,
  chains: { 1: EMPTY, 56: EMPTY, 8453: EMPTY, 324: EMPTY, ...over },
  abstractWallet: false,
  ...extra,
});
const DELEGATED = "0xef0100" + "63c0c19a282a1b52b07dd5a65b58948a07dae32b";
const CONTRACT = "0x6080604052" + "00".repeat(200);

test("code kinds: none, an EIP-7702 delegation (a key wallet), or a contract", () => {
  assert.equal(kindOfCode("0x"), "none");
  assert.equal(kindOfCode(DELEGATED), "eip7702");
  assert.equal(kindOfCode(CONTRACT), "contract");
  assert.equal(kindOfCode(null), "unknown");
});

test("an Abstract Global Wallet on BNB Chain: stop, funds sent there are lost for good", () => {
  const v = classify(facts(56, {}, { abstractWallet: true }));
  assert.equal(v.level, "stop");
  assert.equal(v.kind, "abstract-wallet");
  assert.match(v.title, /Abstract/);
  assert.equal(v.recovery, "none");
  assert.ok(v.reasons.some((r) => /EraVM/.test(r)));
});

test("an Abstract Global Wallet on ZKsync Era: don't send, but its owner can most likely recover it there", () => {
  const v = classify(facts(324, {}, { abstractWallet: true }));
  assert.equal(v.level, "caution");
  assert.equal(v.kind, "abstract-wallet");
  assert.equal(v.recovery, "owner");
  assert.ok(v.reasons.some((r) => /same addresses on ZKsync Era/.test(r)));
});

test("an Abstract Global Wallet on Abstract itself: works until Abstract shuts down on 15 Dec 2026", () => {
  const v = classify(facts(2741, { 2741: { code: CONTRACT, nonce: 83 } }, { abstractWallet: true }));
  assert.equal(v.level, "caution");
  assert.match(v.title, /15 Dec 2026/);
});

test("a key wallet that has sent transactions on the target chain: safe", () => {
  const v = classify(facts(8453, { 8453: { code: "0x", nonce: 12 } }));
  assert.equal(v.level, "safe");
  assert.equal(v.kind, "key-wallet");
  assert.ok(v.reasons.some((r) => /12 transactions/.test(r)));
});

test("a key wallet used only on another chain: safe, the same key controls it everywhere", () => {
  const v = classify(facts(56, { 1: { code: "0x", nonce: 3 } }));
  assert.equal(v.level, "safe");
  assert.equal(v.kind, "key-wallet");
  assert.ok(v.reasons.some((r) => /Ethereum/.test(r)));
});

test("an EIP-7702 account (a key wallet with smart features), here or elsewhere: safe, not mistaken for a contract", () => {
  assert.equal(classify(facts(1, { 1: { code: DELEGATED, nonce: 5 } })).kind, "eip7702");
  const v = classify(facts(56, { 1: { code: DELEGATED, nonce: 5 } }));
  assert.equal(v.level, "safe");
  assert.equal(v.kind, "eip7702");
});

test("a contract on another chain only: stop, nobody may ever reach funds sent here", () => {
  const v = classify(facts(56, { 8453: { code: CONTRACT, nonce: 1 } }));
  assert.equal(v.level, "stop");
  assert.equal(v.kind, "contract-elsewhere");
  assert.ok(v.reasons.some((r) => /Base/.test(r)));
});

test("a Safe deployed on another chain only: stop, and the redeploy risk is explained", () => {
  const v = classify(facts(56, { 1: { code: CONTRACT, nonce: 1, safe: { threshold: 2, owners: 3 } } }));
  assert.equal(v.level, "stop");
  assert.equal(v.kind, "safe-elsewhere");
  assert.equal(v.recovery, "maybe");
  assert.ok(v.reasons.some((r) => /2-of-3/.test(r)));
  assert.ok(v.reasons.some((r) => /stranger/.test(r)));
});

test("a Safe on the target chain: safe to send to that Safe", () => {
  const v = classify(facts(1, { 1: { code: CONTRACT, nonce: 1, safe: { threshold: 2, owners: 3 } } }));
  assert.equal(v.level, "safe");
  assert.equal(v.kind, "safe-here");
});

test("a token's own contract on the target chain: stop, tokens sent to it are usually lost", () => {
  const v = classify(facts(1, { 1: { code: CONTRACT, nonce: 1, token: { symbol: "USDC" } } }));
  assert.equal(v.level, "stop");
  assert.equal(v.kind, "token-contract");
  assert.match(v.title, /USDC/);
});

test("some other contract on the target chain: caution, it must be a wallet that can move funds", () => {
  const v = classify(facts(1, { 1: { code: CONTRACT, nonce: 1 } }));
  assert.equal(v.level, "caution");
  assert.equal(v.kind, "contract-here");
});

test("never used on any chain checked: can't tell, send a small test first", () => {
  const v = classify(facts(56));
  assert.equal(v.level, "unknown");
  assert.equal(v.kind, "unused");
  assert.ok(v.reasons.some((r) => /small test/.test(r)));
});

test("the target chain could not be read: can't tell, and it says so", () => {
  const v = classify(facts(56, { 56: { code: null, nonce: null } }));
  assert.equal(v.level, "unknown");
  assert.equal(v.kind, "unreadable");
});

test("chains that could not be read are listed, and a key wallet verdict still holds", () => {
  const v = classify(facts(8453, { 8453: { code: "0x", nonce: 2 }, 324: { code: null, nonce: null } }));
  assert.equal(v.level, "safe");
  assert.deepEqual(v.unread, [324]);
});
