// The only hosts the API may contact: the public RPCs in chains.js, the XRP/Stellar ledger services, and the archive
// mirror. Egress to anything else is refused (defence in depth; hosts come from our own lists, not user input).
import { CHAINS } from "../src/chains.js";
import { XRP_SERVICES, HORIZON } from "../src/ledgers.js";
import { DEFAULT_ARCHIVE_BASE } from "../src/resolve.js";

const host = (u) => new URL(u).host;
export const ALLOWED_HOSTS = new Set([
  ...CHAINS.flatMap((c) => c.rpcs.map(host)),
  ...XRP_SERVICES.map(host),
  host(HORIZON),
  host(DEFAULT_ARCHIVE_BASE),
]);

/** Wrap a fetch so it only reaches allowlisted hosts; anything else throws. */
export function guardedFetch(realFetch = globalThis.fetch) {
  return async (url, init) => {
    const h = host(typeof url === "string" ? url : url.url);
    if (!ALLOWED_HOSTS.has(h)) throw new Error(`host not allowed: ${h}`);
    return realFetch(url, init);
  };
}
