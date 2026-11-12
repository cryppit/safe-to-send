// Safe to Send — hosted API. Keyless, read-only, no storage. Wraps the library; all egress goes through the host
// allowlist. GET /v1/check?address=&chain= · /v1/chains · /v1/health. For tests, env may inject clients/fetch/loadShard.
import { checkAddress, CHAINS, NETWORKS } from "../src/index.js";
import { makeRpc } from "../src/rpc.js";
import { defaultLoadShard } from "../src/resolve.js";
import { guardedFetch } from "./allowlist.js";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "*",
};
const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", ...CORS } });

export async function handle(request, env = {}) {
  const url = new URL(request.url);
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (request.method !== "GET") return json({ error: "method-not-allowed" }, 405);

  if (url.pathname === "/v1/health") return json({ ok: true });
  if (url.pathname === "/v1/chains") {
    return json({ chains: CHAINS.map((c) => ({ id: c.id, name: c.name })), networks: NETWORKS.map((n) => ({ id: n.id, name: n.name })) });
  }
  if (url.pathname === "/v1/check") {
    const address = url.searchParams.get("address");
    const chain = url.searchParams.get("chain");
    if (!address || !chain) return json({ error: "missing-params", message: "address and chain are required" }, 400);
    const options = env.clients
      ? { clients: env.clients, fetch: env.fetch, loadShard: env.loadShard }
      : (() => { const g = guardedFetch(); return { clients: (c) => makeRpc(c.rpcs, { fetch: g, timeoutMs: 6000 }), fetch: g, loadShard: defaultLoadShard({ fetch: g }) }; })();
    const result = await checkAddress(address, chain, options);
    return json(result, result.error === "bad-chain" ? 400 : 200);
  }
  return json({ error: "not-found" }, 404);
}

export default { fetch: (request, env) => handle(request, env) };
