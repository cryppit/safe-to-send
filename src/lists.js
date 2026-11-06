// The lists shipped in data/lists/, built by scripts/update-lists.mjs. Both are one-way: a match adds a warning, and an
// address that isn't listed gets no comment, because neither list comes close to covering everything.
const keyOf = (address) => (/^0x[0-9a-f]+$/i.test(address) ? address.toLowerCase() : address);

export function parseLists(ofac, exchanges) {
  return {
    ofacAsOf: ofac.asOf,
    exchangesAsOf: exchanges.asOf,
    sanctioned: new Set(ofac.addresses.map(keyOf)),
    wallets: new Map(Object.entries(exchanges.wallets).map(([a, name]) => [keyOf(a), name])),
  };
}

export const sanctioned = (lists, address) => lists.sanctioned.has(keyOf(address));
export const walletOwner = (lists, address) => lists.wallets.get(keyOf(address));
