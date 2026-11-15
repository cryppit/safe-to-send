// A JSON-RPC client over plain fetch that tries each public endpoint in turn. It works the same in a browser and in
// Node. `recording` and `replaying` wrap a client so the tests run on real responses without the network.

export class RpcError extends Error {}

const isRevert = (err) => err && (err.code === 3 || /revert/i.test(err.message ?? ""));

// Public RPCs cap requests per IP. A shared IP (a Cloudflare Worker, an office NAT) hits that cap often, so a pass
// over the list that failed only because of rate limits earns one more pass after a short random wait.
const isRateLimit = (status, err) =>
  status === 429 || (err != null && ([429, -32005, -32007, -32016].includes(err.code) || /rate.?limit|too many requests|request limit|exceeded its request/i.test(err.message ?? "")));

export function makeRpc(urls, {
  fetch: doFetch = globalThis.fetch,
  timeoutMs = 20_000,
  retryDelayMs = 400,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  random = Math.random,
} = {}) {
  let id = 0;
  return async function call(method, params) {
    const problems = [];
    for (let pass = 0; pass < 2; pass++) {
      let limited = false;
      for (const url of urls) {
        try {
          const res = await doFetch(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }),
            signal: AbortSignal.timeout(timeoutMs),
          });
          if (!res.ok) {
            if (isRateLimit(res.status)) limited = true;
            throw new Error(`HTTP ${res.status}`);
          }
          const body = await res.json();
          // A revert is an answer, not an outage: the next endpoint would say the same.
          if (body.error && method === "eth_call" && isRevert(body.error)) return { reverted: true };
          if (body.error) {
            if (isRateLimit(res.status, body.error)) limited = true;
            throw new Error(body.error.message ?? JSON.stringify(body.error));
          }
          return body.result;
        } catch (e) {
          problems.push(`${new URL(url).host}: ${e.message}`);
        }
      }
      if (!limited || pass === 1) break;
      await sleep(retryDelayMs * (0.5 + random()));
    }
    throw new RpcError(`${method} failed on every endpoint (${problems.join("; ")})`);
  };
}

const key = (method, params) => `${method} ${JSON.stringify(params)}`;

export function recording(call, store) {
  return async (method, params) => {
    const result = await call(method, params);
    store[key(method, params)] = result;
    return result;
  };
}

export function replaying(store) {
  return async (method, params) => {
    const k = key(method, params);
    if (!(k in store)) throw new RpcError(`not in fixture: ${k}`);
    return store[k];
  };
}
