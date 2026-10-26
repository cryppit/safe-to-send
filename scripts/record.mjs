#!/usr/bin/env node
// Record the real RPC answers for one check into fixtures/<name>.json, so tests replay them offline.
// Usage: node scripts/record.mjs <name> <address> <chain id>
import { writeFileSync } from "node:fs";
import { check, clientsFor } from "../src/check.js";
import { recording } from "../src/rpc.js";

const [name, address, target] = process.argv.slice(2);
if (!name || !address || !target) {
  console.error("Usage: node scripts/record.mjs <name> <address> <chain id>");
  process.exit(2);
}
const store = {};
const r = await check(address, Number(target), { clients: (c) => recording(clientsFor(c), (store[c.id] ??= {})) });
writeFileSync(new URL(`../fixtures/${name}.json`, import.meta.url), JSON.stringify({ address, target: Number(target), recordedAt: new Date().toISOString(), store }, null, 1) + "\n");
console.log(name, "->", r.verdict ? `${r.verdict.level} / ${r.verdict.kind}: ${r.verdict.title}` : r.error, r.verdict?.unread?.length ? `(unread: ${r.verdict.unread})` : "");
