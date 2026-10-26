// The Abstract wallet archive: reading deployments, scanning the chain in windows the RPC accepts, and the sharded
// address list the page looks up. No network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseDeployed, scanLogs, buildShards, shardOf, inShard, normalize, RECORD } from "../src/archive.js";

const logs = JSON.parse(readFileSync(new URL("../fixtures/abstract-deployed-logs.json", import.meta.url)));

test("a ContractDeployed log from the AGW factory names the new wallet, its code hash and its block", () => {
  const d = parseDeployed(logs[0]);
  assert.equal(d.address, "0xea7175b8e240aba8ca4632b160918597c7a0d12d");
  assert.equal(d.deployer, "0x9b947df68d35281c972511b3e7bc875926f26c1a");
  assert.equal(d.bytecodeHash, "0x0100003316a98e88b9e8931575675eed8e30eee97abeff3816fb98333ab085bc");
  assert.equal(d.block, 76858);
});

// A fake RPC with the Abstract endpoint's rule: more than `cap` logs in one answer is refused with the same message.
function fakeRpc({ perBlock, cap = 10_000 }) {
  const calls = [];
  const rpc = async (method, [filter]) => {
    assert.equal(method, "eth_getLogs");
    const from = Number(filter.fromBlock), to = Number(filter.toBlock);
    calls.push([from, to]);
    let n = 0;
    for (let b = from; b <= to; b++) n += perBlock(b);
    if (n > cap) throw new Error("eth_getLogs failed on every endpoint (api.mainnet.abs.xyz: Query returned more than 10000 results. Try with this block range [0x1, 0x2].)");
    const out = [];
    for (let b = from; b <= to; b++) for (let i = 0; i < perBlock(b); i++) out.push({ blockNumber: "0x" + b.toString(16), logIndex: "0x" + i.toString(16) });
    return out;
  };
  return { rpc, calls };
}

test("the scan covers every block exactly once, shrinking the window where the RPC refuses and growing it back", async () => {
  // Busy at launch (50 a block for the first 1,000 blocks), then one every 10 blocks.
  const { rpc, calls } = fakeRpc({ perBlock: (b) => (b < 1_000 ? 50 : b % 10 === 0 ? 1 : 0) });
  const got = [];
  const end = await scanLogs(rpc, { filter: {}, from: 0, to: 99_999, span: 50_000, onPage: (page) => got.push(...page) });
  assert.equal(end, 99_999);
  assert.equal(got.length, 1_000 * 50 + 9_900);
  // Refused windows are retried smaller from the same start; the accepted ones tile [0, 99999] without gaps.
  const accepted = [];
  let next = 0;
  for (let i = 0; i < calls.length; i++) {
    const [f, t] = calls[i];
    const retried = calls[i + 1] && calls[i + 1][0] === f;
    if (!retried) { assert.equal(f, next); accepted.push([f, t]); next = t + 1; }
  }
  assert.equal(next, 100_000);
  // It shrank below 200 blocks in the busy part, and grew back past 10,000 blocks in the quiet part.
  assert.ok(accepted.some(([f, t]) => t < 1_000 && t - f + 1 <= 200));
  assert.ok(accepted.some(([f, t]) => f >= 1_000 && t - f + 1 >= 10_000));
});

test("on a steady chain the window settles near the target size, so only the first probes are refused", async () => {
  // One wallet every 5 blocks: a 200,000-block window would hold 40,000 logs.
  const { rpc, calls } = fakeRpc({ perBlock: (b) => (b % 5 === 0 ? 1 : 0) });
  let logs = 0;
  await scanLogs(rpc, { filter: {}, from: 0, to: 999_999, span: 200_000, target: 5_000, onPage: (page) => { logs += page.length; } });
  assert.equal(logs, 200_000);
  const refused = calls.filter(([f], i) => calls[i + 1] && calls[i + 1][0] === f).length;
  assert.ok(refused <= 3, `refused ${refused} windows`);
  assert.ok(calls.length <= 45, `${calls.length} calls`);
});

test("the scan resumes from a checkpoint and reports where it got to", async () => {
  const { rpc } = fakeRpc({ perBlock: () => 1 });
  const seen = [];
  const end = await scanLogs(rpc, { filter: {}, from: 500, to: 2_000, span: 1_000, onPage: (page, to) => seen.push(to) });
  assert.equal(end, 2_000);
  assert.deepEqual(seen, [1_499, 2_000]);
});

test("any other RPC error stops the scan instead of being skipped", async () => {
  const rpc = async () => { throw new Error("eth_getLogs failed on every endpoint (HTTP 503)"); };
  await assert.rejects(scanLogs(rpc, { filter: {}, from: 0, to: 10, span: 5, onPage: () => {} }), /503/);
});

test("addresses go to the shard named by their first byte, as sorted 7-byte records without duplicates", () => {
  const shards = buildShards(["0xEA7175B8E240ABA8CA4632B160918597C7A0D12D", "0xea0000000000000000000000000000000000000b", "0xea7175b8e240aba8ca4632b160918597c7a0d12d", "0x0100000000000000000000000000000000000001"]);
  assert.deepEqual(Object.keys(shards).sort(), ["01", "ea"]);
  assert.equal(RECORD, 7);
  // Bytes 2-8 of each address: 00000000000000 sorts before 7175b8e240aba8.
  assert.equal(Buffer.from(shards.ea).toString("hex"), "00000000000000" + "7175b8e240aba8");
  assert.equal(shards["01"].length, 7);
  assert.equal(shardOf("0xEA7175B8E240ABA8CA4632B160918597C7A0D12D"), "ea");
});

test("lookups match on the first 8 bytes and miss anything else", () => {
  const { ea } = buildShards(["0xea7175b8e240aba8ca4632b160918597c7a0d12d", "0xea0000000000000000000000000000000000000b", "0xeaffffffffffffff000000000000000000000000"]);
  assert.equal(inShard(ea, "0xEA7175B8E240ABA8CA4632B160918597C7A0D12D"), true);
  assert.equal(inShard(ea, "0xea0000000000000000000000000000000000000b"), true);
  assert.equal(inShard(ea, "0xeaffffffffffffff000000000000000000000000"), true);
  assert.equal(inShard(ea, "0xea7175b8e240aba9ca4632b160918597c7a0d12d"), false); // differs in byte 8
  assert.equal(inShard(new Uint8Array(0), "0xea7175b8e240aba8ca4632b160918597c7a0d12d"), false);
  // Only the first 8 bytes are kept: a different tail still matches (about 1 in 3 trillion by chance).
  assert.equal(inShard(ea, "0xea7175b8e240aba8000000000000000000000000"), true);
});

test("anything that is not a 20-byte hex address is refused", () => {
  assert.equal(normalize("0xea7175b8e240aba8ca4632b160918597c7a0d12d"), "ea7175b8e240aba8ca4632b160918597c7a0d12d");
  for (const bad of ["", "0x123", "ea7175b8e240aba8ca4632b160918597c7a0d12d", "0xzz7175b8e240aba8ca4632b160918597c7a0d12d", "0xea7175b8e240aba8ca4632b160918597c7a0d12d00"]) {
    assert.throws(() => normalize(bad), /not an address/);
  }
});
