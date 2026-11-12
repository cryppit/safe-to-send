#!/usr/bin/env node
// Render the conformance result as a static, self-contained page (a dated pass/fail board) and, as a CLI, run the
// suite and write conformance/index.html. Neutral: it states what the engine returned for public addresses; any
// correct validator would pass the same vectors. Usage: node scripts/conformance-page.mjs
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runConformance } from "./conformance.mjs";

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/** A static HTML page for a conformance result. `dateISO` is the run date shown on the board. */
export function renderConformancePage(result, dateISO) {
  const overall = result.fail > 0 ? "FAIL" : "PASS";
  const rows = result.results.map((r) => `      <tr class="${r.ok ? "ok" : "bad"}">
        <td><code>${esc(r.id)}</code></td><td>${esc(r.chain)}</td>
        <td>${esc(r.expect)}</td><td>${esc(r.actual)}</td>
        <td>${r.ok ? "PASS" : "FAIL"}</td></tr>`).join("\n");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Safe to Send — conformance board</title>
<style>
  :root { color-scheme: dark; --bg:#0b0f14; --fg:#e6edf3; --mut:#8b98a5; --ok:#36d07a; --bad:#f2b84a; --line:#1c2430; }
  body { background:var(--bg); color:var(--fg); font:15px/1.5 system-ui,sans-serif; margin:0; padding:24px; }
  main { max-width:860px; margin:0 auto; }
  h1 { font-size:20px; margin:0 0 4px; } p { color:var(--mut); margin:0 0 20px; }
  .status { font-weight:700; } .status.PASS { color:var(--ok); } .status.FAIL { color:var(--bad); }
  table { width:100%; border-collapse:collapse; } th,td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); }
  th { color:var(--mut); font-weight:600; } tr.bad td { color:var(--bad); } code { color:var(--fg); }
</style></head>
<body><main>
  <h1>Safe to Send — conformance board</h1>
  <p>Known address vectors across the chains, replayed through the checker. <span class="status ${overall}">${overall}</span>
     — ${result.pass}/${result.total} pass · run ${esc(dateISO)}.</p>
  <table>
    <thead><tr><th>vector</th><th>chain</th><th>expect</th><th>actual</th><th>result</th></tr></thead>
    <tbody>
${rows}
    </tbody>
  </table>
</main></body></html>
`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.argv[2] ?? "conformance";
  const result = await runConformance(join(dir, "vectors.json"), join(dir, "recorded"));
  const html = renderConformancePage(result, new Date().toISOString().slice(0, 10));
  writeFileSync(join(dir, "index.html"), html);
  console.log(`wrote ${join(dir, "index.html")} — ${result.pass}/${result.total} pass`);
  process.exit(result.fail ? 1 : 0);
}
