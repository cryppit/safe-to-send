// Rebuilds data/lists/ from its two public sources. Run it by hand: node scripts/update-lists.mjs
//  - OFAC: the addresses in the US sanctions list, through 0xB10C's extractor (MIT).
//  - Exchanges: reserve wallets each exchange published itself, through GraphSense's packs (MIT). These date from
//    November 2022. BitMEX's packs are skipped: they list millions of per-user addresses, not reserve wallets.
import { mkdirSync, writeFileSync } from "node:fs";
import { checkAddress } from "../src/addresses.js";

const OFAC = "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists";
const PACKS = "https://raw.githubusercontent.com/graphsense/graphsense-tagpacks/master/packs";
const OFAC_LISTS = ["ETH", "BSC", "ARB", "ETC", "USDT", "USDC", "XBT", "TRX", "LTC", "BCH", "DASH", "SOL", "XRP", "ZEC"];
const EXCHANGES = { binance: "Binance", bitfinexcom: "Bitfinex", bybit: "Bybit", cryptocom: "Crypto.com", deribit: "Deribit", huobi: "Huobi", kucoin: "KuCoin", okx: "OKX", swissborg: "SwissBorg" };
const out = new URL("../data/lists/", import.meta.url);
const get = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.text(); };
// Downloaded text is only ever matched against address formats; anything else is dropped.
const real = (a) => checkAddress(a).some((v) => v.valid);
const keyOf = (a) => (/^0x/i.test(a) ? a.toLowerCase() : a);

const sanctioned = new Set();
for (const name of OFAC_LISTS) for (const line of (await get(`${OFAC}/sanctioned_addresses_${name}.txt`)).split("\n")) { const a = line.trim(); if (a && real(a)) sanctioned.add(keyOf(a)); }

const wallets = {};
let newest = "";
for (const [pack, name] of Object.entries(EXCHANGES)) {
  const text = await get(`${PACKS}/exchange-wallets-${pack}.yaml`);
  const mod = /^lastmod:\s*(\S+)/m.exec(text)?.[1] ?? "";
  if (mod > newest) newest = mod;
  for (const m of text.matchAll(/^- address:\s*'?([^'\s]+)'?/gm)) if (real(m[1])) wallets[keyOf(m[1])] = name;
}

const today = new Date().toISOString().slice(0, 10);
mkdirSync(out, { recursive: true });
writeFileSync(new URL("ofac.json", out), JSON.stringify({ source: "US OFAC SDN list via github.com/0xB10C/ofac-sanctioned-digital-currency-addresses", asOf: process.argv[2] ?? today, addresses: [...sanctioned].sort() }) + "\n");
writeFileSync(new URL("exchanges.json", out), JSON.stringify({ source: "Exchange-published reserve wallets via github.com/graphsense/graphsense-tagpacks", asOf: newest.slice(0, 4), wallets: Object.fromEntries(Object.entries(wallets).sort()) }) + "\n");
console.log(`${sanctioned.size} sanctioned addresses, ${Object.keys(wallets).length} exchange wallets (latest ${newest})`);
