// The two ledgers that say on chain whether an account wants a tag or a memo. Public services, no keys. These reads can
// only ever add a warning: most exchange accounts declare nothing, so "no sign" is never "not needed".
export const XRP_SERVICES = ["https://xrplcluster.com", "https://xrpl.ws"];
export const HORIZON = "https://horizon.stellar.org";

const TIMEOUT = 6_000;
const signal = () => AbortSignal.timeout(TIMEOUT);

// Our own test of the idea Xaman uses, kept strict because it was measured at 0 of 40 on personal accounts: at least 10
// different senders, and more than half of incoming payments carrying a tag above 9999.
const MIN_SENDERS = 10, MIN_TAG = 9999;

/** Do recent incoming payments look like a shared account that sorts customers by tag? */
export function looksShared(transactions, account) {
  const incoming = transactions.map((t) => t.tx ?? t.tx_json ?? t).filter((t) => t?.TransactionType === "Payment" && t.Destination === account);
  const senders = new Set(incoming.map((t) => t.Account));
  if (senders.size < MIN_SENDERS) return false;
  const tagged = incoming.filter((t) => t.DestinationTag > MIN_TAG);
  return tagged.length > incoming.length / 2;
}

async function xrpCall(doFetch, method, params) {
  for (const url of XRP_SERVICES) {
    try {
      const res = await doFetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ method, params: [params] }), signal: signal() });
      if (res.ok) { const { result } = await res.json(); if (result) return result; }
    } catch { /* try the next service */ }
  }
  return null;
}

/** { exists, requireTag, shared } for an XRP account, or null when no service answered. */
export async function readXrp(account, { fetch: doFetch = globalThis.fetch } = {}) {
  const info = await xrpCall(doFetch, "account_info", { account, ledger_index: "validated" });
  if (!info) return null;
  if (info.error === "actNotFound") return { exists: false, requireTag: false, shared: false };
  if (info.status !== "success") return null;
  const requireTag = Boolean(info.account_flags?.requireDestinationTag ?? (info.account_data?.Flags & 0x00020000));
  if (requireTag) return { exists: true, requireTag, shared: false };
  const history = await xrpCall(doFetch, "account_tx", { account, limit: 200, forward: false });
  return { exists: true, requireTag, shared: looksShared(history?.transactions ?? [], account) };
}

/** { exists, memoRequired } for a Stellar account (SEP-29), or null when Horizon didn't answer. */
export async function readStellar(account, { fetch: doFetch = globalThis.fetch } = {}) {
  try {
    const res = await doFetch(`${HORIZON}/accounts/${account}`, { signal: signal() });
    if (res.status === 404) return { exists: false, memoRequired: false };
    if (!res.ok) return null;
    const body = await res.json();
    return { exists: true, memoRequired: body.data?.["config.memo_required"] === "MQ==" }; // base64 of "1"
  } catch {
    return null;
  }
}
