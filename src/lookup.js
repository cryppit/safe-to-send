// Any address, on any chain or network. EVM chains get the live check in check.js. Everything else is judged by its
// address format alone, and the answer says so: a valid format is never called safe, because no chain was read.
import { check, clientsFor, view } from "./check.js";
import { checkAddress, keccak256 } from "./addresses.js";
import { CHAIN_NAME, plainAddress } from "./address-advice.js";
import { chainById, chainName, networkById } from "./chains.js";
import { readXrp, readStellar } from "./ledgers.js";
import { sanctioned, walletOwner } from "./lists.js";

const ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const ENS_NAME = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/;
// An XRP address written with its destination tag, as some exchanges show it.
const XRP_TAGGED = /^(r[1-9A-HJ-NP-Za-km-z]{24,34})\?dt=(\d{1,20})$/;
const XRP_MAX_TAG = 4294967295;
const SELECTOR = { resolver: "0x0178b8bf", addr: "0x3b3b57de" };

const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

/** ENS namehash (ENSIP-1). The name must already be lower case. */
export function namehash(name) {
  let node = new Uint8Array(32);
  for (const label of name.split(".").reverse()) {
    const joined = new Uint8Array(64);
    joined.set(node);
    joined.set(keccak256(new TextEncoder().encode(label)), 32);
    node = keccak256(joined);
  }
  return "0x" + hex(node);
}

/** The Ethereum address an ENS name points to, or null when it has none or it could not be read. */
async function resolveEns(name, clients) {
  try {
    const rpc = clients(chainById(1));
    const node = namehash(name).slice(2);
    const resolver = await view(rpc, ENS_REGISTRY, SELECTOR.resolver + node);
    const to = resolver && "0x" + resolver.slice(-40);
    if (!to || /^0x0+$/.test(to)) return null;
    const answer = await view(rpc, to, SELECTOR.addr + node);
    const address = answer && "0x" + answer.slice(-40);
    return address && !/^0x0+$/.test(address) ? address : null;
  } catch {
    return null;
  }
}

const article = (name) => `${/^([AEIO]|XRP)/.test(name) ? "an" : "a"} ${name}`;
const alternatives = (names) => (names.length > 1 ? `${names.slice(0, -1).join(", ")} or ${names[names.length - 1]}` : names[0]);
const scopeNote = (name) => `This only checked the address's format. It did not read ${name}, so it can't say who owns this address or whether it is still in use.`;

const answer = (address, target, verdict, extra = {}) => ({
  scope: "format", address, target,
  verdict: { recovery: null, unread: [], reasons: [], ...verdict },
  ...extra,
});

/** Where the address does belong: an EVM address goes to Ethereum, anything else to its own network if we list it. */
function suggestionFor(verdicts) {
  for (const v of verdicts.filter((x) => x.valid)) {
    if (v.chain === "evm") return 1;
    if (networkById(v.chain)) return v.chain;
  }
  return undefined;
}

function wrongNetwork(address, target, verdicts) {
  const name = chainName(target);
  const fits = verdicts.filter((v) => v.valid);
  if (!fits.length) return mistake(address, target, verdicts);
  // A lower-case 0x address is also a legal NEAR name, but nobody means that.
  const valid = fits.some((v) => v.chain === "evm") ? fits.filter((v) => v.chain === "evm") : fits;
  const looks = alternatives([...new Set(valid.map((v) => CHAIN_NAME[v.chain].replace(" (EVM)", "")))]);
  return answer(address, target, {
    level: "stop", kind: "wrong-network",
    title: `Stop: this is not ${article(name)} address`,
    reasons: [`It looks like ${article(looks)} address. Sending on ${name} would likely lose the funds, or fail.`, `Ask the recipient for their ${name} address.`],
  }, { suggest: suggestionFor(verdicts), belongs: looks });
}

function mistake(address, target, verdicts) {
  const p = plainAddress(address, verdicts[0].chain);
  return answer(address, target, { level: "stop", kind: "bad-address", title: p.headline, reasons: p.steps });
}

function onNetwork(address, target, verdicts) {
  const name = chainName(target);
  const legacy = target === "bitcoincash" && verdicts.find((v) => v.chain === "bitcoin" && v.valid && /^P2/.test(v.kind));
  if (legacy) {
    return answer(address, target, {
      level: "caution", kind: "old-style",
      title: "Caution: this old-style address could be Bitcoin or Bitcoin Cash",
      reasons: ["Both coins used this form, so the address can't show which one it is for.", "Ask the recipient for an address starting with bitcoincash: or q.", scopeNote(name)],
    });
  }
  if (!verdicts.some((v) => v.chain === target)) return wrongNetwork(address, target, verdicts);
  const p = plainAddress(address, target);
  if (p.zcash) {
    const { next, transparent, shielded } = p.zcash;
    const payable = p.valid && (transparent.can !== "no" || shielded.can !== "no");
    return answer(address, target, {
      level: payable ? "format" : "stop", kind: payable ? "format-ok" : "bad-address", title: next,
      reasons: [`From a transparent wallet: ${transparent.why}`, `From a shielded balance: ${shielded.why}`, scopeNote(name)],
    });
  }
  if (!p.valid) return answer(address, target, { level: "stop", kind: "bad-address", title: p.headline, reasons: p.steps });
  return answer(address, target, { level: "format", kind: "format-ok", title: `The format is right for ${name}`, reasons: [...p.steps, scopeNote(name)] }, { what: p.what });
}

const readNote = (ledger) => `This read the ${ledger} for one thing: whether this account asks for a tag or memo. It can't say who owns it.`;
const couldNotRead = (ledger) => `The ${ledger} couldn't be read just now, so its tag and memo settings weren't checked.`;
const NO_SIGN = "Exchanges often don't declare it, so if this is an exchange address, ask them.";

const swapNote = (r, name, note) => r.verdict.reasons.map((x) => (x === scopeNote(name) ? note : x));

/** XRP: what the ledger says about tags. It may add a warning; it never says a tag isn't needed. */
async function xrpSettings(r, address, tag, options) {
  const ledger = "XRP Ledger", a = await readXrp(address, options);
  if (!a) return { ...r, verdict: { ...r.verdict, reasons: swapNote(r, "XRP", couldNotRead(ledger)) } };
  const done = (verdict) => ({ ...r, read: ledger, verdict: { ...r.verdict, ...verdict } });
  if (!a.exists) return done({ level: "caution", kind: "not-active", title: "This XRP account isn't active yet", reasons: ["A first payment has to cover the network's minimum reserve, or it fails.", "Check that you have the right address.", readNote(ledger)] });
  if (a.requireTag && !tag) return done({ level: "caution", kind: "tag-required", title: "This account requires a destination tag", reasons: ["Without one the ledger rejects the payment, so the funds stay with you.", "Ask the recipient for their tag.", readNote(ledger)] });
  if (a.requireTag) return done({ title: "This account requires a tag, and one is included", reasons: ["Only the recipient can say whether this tag is the right one, so check it with them.", readNote(ledger)] });
  if (a.shared && !tag) return done({ level: "caution", kind: "tag-likely", title: "Treat this as a shared address: you probably need a tag", reasons: ["Most recent payments to it, from many senders, carry different tags.", "The ledger won't stop a payment without one. Ask the recipient for their tag.", readNote(ledger)] });
  return done({ reasons: [...swapNote(r, "XRP", ""), `We saw no sign a tag is needed. ${NO_SIGN}`, readNote(ledger)].filter(Boolean) });
}

/** Stellar: only the on-chain flag. The pattern test has no false-alarm data on Stellar yet, so it isn't used. */
async function stellarSettings(r, address, options) {
  const ledger = "Stellar network", a = await readStellar(address, options);
  if (!a) return { ...r, verdict: { ...r.verdict, reasons: swapNote(r, "Stellar", couldNotRead(ledger)) } };
  const done = (verdict) => ({ ...r, read: ledger, verdict: { ...r.verdict, ...verdict } });
  if (!a.exists) return done({ level: "caution", kind: "not-active", title: "This Stellar account isn't active yet", reasons: ["A first payment has to create the account, or it fails.", "Check that you have the right address.", readNote(ledger)] });
  if (a.memoRequired) return done({ level: "caution", kind: "memo-required", title: "This account asks for a memo", reasons: ["The network won't stop a payment without one, and the funds may not be credited.", "Ask the recipient for their memo.", readNote(ledger)] });
  return done({ reasons: [...swapNote(r, "Stellar", ""), `We saw no sign a memo is needed. ${NO_SIGN}`, readNote(ledger)].filter(Boolean) });
}

/** The shipped lists add to an answer. An address that isn't listed gets no comment. */
async function withLists(r, options) {
  if (r.error || !options.lists) return r;
  const lists = await options.lists().catch(() => null);
  if (!lists) return r;
  const address = r.ens?.address ?? r.facts?.address ?? r.address;
  if (sanctioned(lists, address)) {
    const { suggest, ...rest } = r;
    return { ...rest, verdict: { ...r.verdict, level: "stop", kind: "sanctioned", title: "Stop: this address is on the US OFAC sanctions list", reasons: [`It matches an address on OFAC's list, as of ${lists.ofacAsOf}.`] } };
  }
  const owner = walletOwner(lists, address);
  if (owner) return { ...r, notices: [`Listed as a ${owner} reserve wallet (${owner}'s own list, ${lists.exchangesAsOf}). This may not be your deposit address. Exchanges usually credit only the address shown in your account.`] };
  return r;
}

/**
 * Check sending to `input` on `target`: a chain ID (a live EVM check) or a network id from NETWORKS (by format, plus
 * tag and memo settings where a ledger declares them). Takes the same options as check(), plus `lists` and `fetch`.
 */
export async function lookup(input, target, options = {}) {
  return withLists(await answerFor(input, target, options), options);
}

async function answerFor(input, target, options) {
  const live = typeof target === "number";
  if (live ? !chainById(target) : !networkById(target)) return { error: "bad-chain", message: `Unknown chain ${target}.` };
  const typed = input.trim();
  const lower = typed.toLowerCase();
  const name = chainName(target);

  let address = typed;
  let ens;
  if (ENS_NAME.test(lower) && target !== "near") {
    const resolved = await resolveEns(lower, options.clients ?? clientsFor);
    if (!resolved) {
      return answer(typed, target, {
        level: "unknown", kind: "ens-unresolved", title: `Can't tell: ${lower} did not give an address`,
        reasons: ["The ENS name has no Ethereum address set, or Ethereum could not be read just now.", "Ask the recipient for the 0x address itself."],
      });
    }
    address = resolved;
    ens = { name: lower, address: resolved };
  }

  const tagged = XRP_TAGGED.exec(address);
  if (tagged) {
    if (Number(tagged[2]) > XRP_MAX_TAG) {
      return answer(typed, target, { level: "stop", kind: "bad-address", title: "Don't send: this destination tag is too large", reasons: ["XRP destination tags stop at 4,294,967,295, so this one has a mistake. Copy it again from the source."] });
    }
    address = tagged[1];
  }

  const verdicts = checkAddress(address);
  if (!verdicts.length) {
    return answer(typed, target, {
      level: "stop", kind: "not-an-address", title: "Stop: this isn't an address on any network we know",
      reasons: ["Check that you copied the whole address, with nothing added or missing."],
    });
  }
  if (!live) {
    let r = onNetwork(address, target, verdicts);
    if (tagged && r.verdict.level === "format") r.verdict.reasons.unshift(`It carries destination tag ${tagged[2]}. Enter that tag as well, or the funds may not be credited.`);
    if (r.verdict.level === "format" && target === "xrp") r = await xrpSettings(r, address, tagged?.[2], options);
    if (r.verdict.level === "format" && target === "stellar") r = await stellarSettings(r, address, options);
    return { ...r, ...(ens && { ens }) };
  }

  const evm = verdicts.find((v) => v.chain === "evm");
  if (!evm) return wrongNetwork(address, target, verdicts);
  if (!evm.valid) return mistake(address, target, verdicts);
  return { ...(await check(address, target, options)), ...(ens && { ens }) };
}
