// How much sits at Abstract Global Wallet addresses on other chains, where nobody can reach it? A seeded random sample of
// the archive's full addresses (same seed, same sample), balances read through Multicall3 on keyless public RPCs, scaled to
// the whole archive. Writes every holder found to result.json so each number can be re-checked.
// Usage: node at-risk.mjs [sample size] [seed]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
// Full addresses come from the archive scan (`node scripts/archive-abstract.mjs scan`), kept out of git.
const RAW = new URL("../../data/abstract/.scan/raw/", import.meta.url).pathname;
const TOTAL = 4_251_573, N = Number(process.argv[2] ?? 50000), SEED = Number(process.argv[3] ?? 20261026);
// mulberry32: a small seeded generator, so the sample can be drawn again exactly.
let st = SEED >>> 0; const rand = () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const MC = "0xcA11bde05977b3631167028862bE2a173976CA11";
const CH = [
  { name: "Ethereum", rpc: "https://ethereum-rpc.publicnode.com", native: "ethereum", tokens: [["USDC", "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", 6], ["USDT", "0xdAC17F958D2ee523a2206206994597C13D831ec7", 6]] },
  { name: "BNB Chain", rpc: "https://bsc-rpc.publicnode.com", native: "binancecoin", tokens: [["USDC", "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", 18], ["USDT", "0x55d398326f99059fF775485246999027B3197955", 18]] },
  { name: "Base", rpc: "https://base-rpc.publicnode.com", native: "ethereum", tokens: [["USDC", "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", 6], ["USDT", "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2", 6]] },
  { name: "Arbitrum One", rpc: "https://arbitrum-one-rpc.publicnode.com", native: "ethereum", tokens: [["USDC", "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", 6], ["USDT", "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", 6]] },
  { name: "OP Mainnet", rpc: "https://optimism-rpc.publicnode.com", native: "ethereum", tokens: [["USDC", "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", 6], ["USDT", "0x94b008aA00579c1307B0EF2c499aD98a8ce58e58", 6]] },
  { name: "Avalanche", rpc: "https://avalanche-c-chain-rpc.publicnode.com", native: "avalanche-2", tokens: [["USDC", "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E", 6], ["USDT", "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7", 6]] },
];
const prices = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=ethereum,binancecoin,avalanche-2&vs_currencies=usd").then((r) => r.json());
const usd = (id) => prices[id].usd;

// Random sample of full addresses, spread over all 256 raw files in proportion to their size.
const files = readdirSync(RAW).filter((f) => f.endsWith(".bin")).sort();
const bufs = files.map((f) => readFileSync(RAW + f));
const sizes = bufs.map((b) => b.length / 20), sum = sizes.reduce((a, b) => a + b, 0);
const pick = new Set();
while (pick.size < N) { let r = rand() * sum, i = 0; while (r >= sizes[i]) r -= sizes[i++]; const j = Math.floor(r); pick.add(bufs[i].subarray(j * 20, j * 20 + 20).toString("hex")); }
const addrs = [...pick];

const pad = (h) => h.padStart(64, "0");
// aggregate3((address,bool,bytes)[]) with allowFailure = true; every inner call is 36 bytes of calldata.
function aggregate3(calls) {
  const n = calls.length, tupleSize = 32 * 6; // target, allow, offset, len, 64 bytes of data
  let head = pad("20") + pad(n.toString(16)), offs = "", body = "";
  for (let i = 0; i < n; i++) {
    offs += pad((n * 32 + i * tupleSize).toString(16));
    const [target, data] = calls[i];
    body += pad(target.slice(2).toLowerCase()) + pad("1") + pad("60") + pad("24") + data.slice(2).padEnd(128, "0");
  }
  return "0x82ad56cb" + head + offs + body;
}
function decode(ret, n) { // (bool success, bytes data)[] -> BigInt or null
  const h = ret.slice(2), w = (i) => h.slice(i * 64, i * 64 + 64);
  const base = parseInt(w(0), 16) / 32; // array start (words)
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = base + 1 + parseInt(w(base + 1 + i), 16) / 32;
    const ok = parseInt(w(t), 16) === 1, len = parseInt(w(t + 2), 16);
    out.push(ok && len >= 32 ? BigInt("0x" + w(t + 3)) : null);
  }
  return out;
}
const rpc = async (url, data) => { for (let k = 0; k < 4; k++) { const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: MC, data }, "latest"] }) }).then((x) => x.json()).catch(() => ({})); if (r.result) return r.result; await new Promise((s) => setTimeout(s, 1000 * (k + 1))); } throw new Error("rpc failed " + url); };

const holders = new Map(); // addr -> usd total
const detail = {}; // addr -> { chain: usd }
const perChain = {};
await Promise.all(CH.map(async (c) => {
  perChain[c.name] = { wallets: 0, usd: 0 };
  const B = 300;
  for (let s = 0; s < addrs.length; s += B) {
    const chunk = addrs.slice(s, s + B);
    const calls = [];
    for (const a of chunk) {
      calls.push([MC, "0x4d2301cc" + pad(a)]); // getEthBalance
      for (const [, t] of c.tokens) calls.push([t, "0x70a08231" + pad(a)]); // balanceOf
    }
    const vals = decode(await rpc(c.rpc, aggregate3(calls)), calls.length);
    const per = 1 + c.tokens.length;
    chunk.forEach((a, i) => {
      let v = 0;
      const nat = vals[i * per]; if (nat) v += Number(nat) / 1e18 * usd(c.native);
      c.tokens.forEach(([, , dec], k) => { const b = vals[i * per + 1 + k]; if (b) v += Number(b) / 10 ** dec; });
      if (v >= 1) { perChain[c.name].wallets++; perChain[c.name].usd += v; holders.set(a, (holders.get(a) ?? 0) + v); (detail[a] ??= {})[c.name] = Math.round(v * 100) / 100; }
    });
  }
}));
const scale = TOTAL / N;
const totalUsd = [...holders.values()].reduce((a, b) => a + b, 0);
console.log(`Sample: ${N.toLocaleString()} of ${TOTAL.toLocaleString()} Abstract wallets (scale x${scale.toFixed(1)}). Prices: ETH $${usd("ethereum")}, BNB $${usd("binancecoin")}, AVAX $${usd("avalanche-2")}`);
for (const [name, p] of Object.entries(perChain)) console.log(`  ${name.padEnd(13)} wallets with >= $1: ${p.wallets}  ($${p.usd.toFixed(0)})`);
console.log(`Wallets in sample with >= $1 stuck on these chains: ${holders.size}  ($${totalUsd.toFixed(0)})`);
console.log(`Scaled to all wallets: ~${Math.round(holders.size * scale).toLocaleString()} wallets, ~$${Math.round(totalUsd * scale).toLocaleString()}`);
console.log("Largest in sample ($):", [...holders.values()].sort((a, b) => b - a).slice(0, 8).map((v) => Math.round(v)).join(", "));

// Wilson 95% interval for the share of wallets holding >= $1, scaled to the archive.
const p = holders.size / N, z = 1.96, den = 1 + z * z / N, mid = (p + z * z / (2 * N)) / den, half = z * Math.sqrt(p * (1 - p) / N + z * z / (4 * N * N)) / den;
console.log(`95% interval for the wallet count: ${Math.round((mid - half) * TOTAL).toLocaleString()} to ${Math.round((mid + half) * TOTAL).toLocaleString()}`);
writeFileSync(new URL("./holders.json", import.meta.url), JSON.stringify({ at: new Date().toISOString(), sample: N, seed: SEED, total: TOTAL, prices: { eth: usd("ethereum"), bnb: usd("binancecoin"), avax: usd("avalanche-2") },
  perChain, holders: holders.size, usd: Math.round(totalUsd), scaledWallets: Math.round(holders.size * scale), scaledUsd: Math.round(totalUsd * scale),
  interval: [Math.round((mid - half) * TOTAL), Math.round((mid + half) * TOTAL)], detail }, null, 1));
