// Resolve a chain argument (number, numeric string, chain name, or network id) to the engine's target,
// and a default archive-shard loader that fetches from a mirror and degrades to "miss" when offline.
import { CHAINS, NETWORKS, chainById, networkById } from "./chains.js";

const squash = (s) => s.toLowerCase().replace(/\s+/g, "");
// The published archive mirror; set to the deployed base at release (see RELEASE.md). Fetched only in the browser
// or when a caller gives no loadShard; a miss is harmless while Abstract's live isAGW registry still answers.
export const DEFAULT_ARCHIVE_BASE = "https://cryppit.github.io/safe-to-send/data/abstract";

/** A chain id (number) or network id (string) the engine accepts, or null when unknown. */
export function resolveChain(chain) {
  if (typeof chain === "number") return chainById(chain) ? chain : null;
  if (typeof chain !== "string") return null;
  if (/^\d+$/.test(chain)) { const n = Number(chain); return chainById(n) ? n : null; }
  if (networkById(chain)) return chain;
  const want = squash(chain);
  const c = CHAINS.find((x) => squash(x.name) === want);
  if (c) return c.id;
  const n = NETWORKS.find((x) => squash(x.name) === want || squash(x.id) === want);
  return n ? n.id : null;
}

/** A loadShard(key) that fetches `${base}/agw/<key>.bin`; any failure returns empty bytes (a miss, never a throw). */
export function defaultLoadShard({ fetch: doFetch = globalThis.fetch, archiveBaseURL = DEFAULT_ARCHIVE_BASE } = {}) {
  return async (key) => {
    try {
      const res = await doFetch(`${archiveBaseURL}/agw/${key}.bin`);
      if (!res || !res.ok) return new Uint8Array(0);
      return new Uint8Array(await res.arrayBuffer());
    } catch {
      return new Uint8Array(0);
    }
  };
}
