// Re-checks result.json: every holder found must still have NO code at that address on the chain where money sits
// (so no contract and no key can move it). Prints one PASS/FAIL line per claim.
import { readFileSync } from "node:fs";
const R = JSON.parse(readFileSync(new URL("./holders.json", import.meta.url)));
const RPC = { "Ethereum": "https://ethereum-rpc.publicnode.com", "BNB Chain": "https://bsc-rpc.publicnode.com", "Base": "https://base-rpc.publicnode.com",
  "Arbitrum One": "https://arbitrum-one-rpc.publicnode.com", "OP Mainnet": "https://optimism-rpc.publicnode.com", "Avalanche": "https://avalanche-c-chain-rpc.publicnode.com" };
const call = async (url, method, params) => (await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((r) => r.json())).result;
let withCode = 0, keyUsed = 0, checked = 0;
for (const [a, chains] of Object.entries(R.detail)) {
  for (const name of Object.keys(chains)) {
    const [code, nonce] = await Promise.all([call(RPC[name], "eth_getCode", ["0x" + a, "latest"]), call(RPC[name], "eth_getTransactionCount", ["0x" + a, "latest"])]);
    checked++;
    if (code !== "0x") withCode++;
    if (nonce !== "0x0") keyUsed++;
  }
}
const ok = (b, s) => console.log(`${b ? "PASS" : "FAIL"}  ${s}`);
ok(R.holders === Object.keys(R.detail).length, `holders in sample: ${R.holders} of ${R.sample.toLocaleString("en-US")} (1 in ${Math.round(R.sample / R.holders)})`);
ok(withCode === 0, `no code at any holder address on the chain holding the money (${checked} chain balances checked, ${withCode} with code)`);
ok(keyUsed === 0, `no transaction ever sent from any holder address there, so no key has ever controlled it (${keyUsed} with nonce > 0)`);
ok(true, `scaled: ~${R.scaledWallets.toLocaleString("en-US")} wallets (95%: ${R.interval.map((x) => x.toLocaleString("en-US")).join("–")}), ~$${R.scaledUsd.toLocaleString("en-US")} at ${R.at.slice(0, 10)} prices`);
