// Safe to Send — public library entry. Keyless, read-only. Paste an address and a chain; get one honest verdict on
// whether funds sent there can be reached, before you send. Zero runtime dependencies.
import { lookup } from "./lookup.js";
import { resolveChain, defaultLoadShard } from "./resolve.js";

export { resolveChain, defaultLoadShard } from "./resolve.js";
export { CHAINS, NETWORKS, chainName } from "./chains.js";

/**
 * Check sending to `input` (an address or ENS name) on `chain` (a chain id, numeric string, chain name, or network
 * id). Returns the engine's union result: an EVM result `{facts, verdict, ens?, notices?}`, a format result
 * `{scope:"format", verdict, ...}`, or `{error, message}` for an unknown chain. Options: `{clients?, loadShard?,
 * lists?, fetch?, archiveBaseURL?}` — all injectable; a missing `loadShard` defaults to fetching from the mirror.
 */
export async function checkAddress(input, chain, options = {}) {
  const target = resolveChain(chain);
  if (target === null) return { error: "bad-chain", message: `Unknown chain ${chain}.` };
  const opts = options.loadShard ? options : { ...options, loadShard: defaultLoadShard(options) };
  return lookup(input, target, opts);
}
