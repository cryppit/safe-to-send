// Record and replay fetch() so XRP/Stellar ledger reads (ledgers.js) are deterministic in tests and the conformance
// suite. Keyed by URL + request body, because XRP posts different JSON-RPC bodies to the same URL.
const keyOf = (url, init) => `${url}\n${init?.body ?? ""}`;
const fakeResponse = ({ status, body }) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => JSON.parse(body),
  text: async () => body,
});

/** Wrap a real fetch so each response is captured into `store` by url+body. */
export function recordingFetch(real, store) {
  return async (url, init) => {
    const res = await real(url, init);
    store[keyOf(url, init)] = { status: res.status, body: await res.clone().text() };
    return res;
  };
}

/** A fetch that returns recorded responses; an unrecorded request throws (a loud miss, never a silent pass). */
export function replayingFetch(store) {
  return async (url, init) => {
    const rec = store[keyOf(url, init)];
    if (!rec) throw new Error(`no recorded fetch for ${url}`);
    return fakeResponse(rec);
  };
}
