// The page: the form, the two tabs and the result cards. Moved out of index.html so the page can forbid inline scripts.
import { lookup } from "./lookup.js";
import { CHAINS, NETWORKS, chainName, chainById, targetById } from "./chains.js";
import { mountFlow } from "./flow.js";
import { parseLists } from "./lists.js";
import { mountPicker } from "./picker.js";

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, text) => { const e = document.createElement(tag); Object.assign(e, attrs); if (text != null) e.textContent = text; return e; };
const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
const logo = (id, size = 18) => { const c = targetById(id); return c?.logo ? el("img", { className: "lg", src: `logos/${c.logo}.svg`, alt: "", width: size, height: size }) : null; };

const select = $("chain");
const group = (label, list) => { const g = el("optgroup", { label }); for (const c of list) g.append(el("option", { value: String(c.id) }, c.name)); select.append(g); };
group("Full check, read live", CHAINS);
group("Address format check", NETWORKS);
// No chain is picked for you: an answer is only about the chain you're really sending on.
select.prepend(el("option", { value: "" }, "Pick a chain"));
select.value = "";
const targetOf = (v) => (/^\d+$/.test(v) ? Number(v) : v);
const picker = mountPicker({
  select, button: $("pick-btn"), name: $("pick-name"), logo: $("chain-logo"),
  groups: [
    { label: "Full check", note: "format check + live read", items: CHAINS },
    { label: "Format check", note: "typos and wrong network", items: NETWORKS, pointer: { text: "Ethereum, Base, BNB Chain and other EVM chains get the full check, which includes this format check.", action: "See full check →", to: 0 } },
  ],
  popular: [1, "bitcoin", "solana", 56, 8453, "tron"],
  kindOf: (c) => (typeof c.id === "number" ? "Live" : c.reads ? "Format + tag" : "Format"),
  onPick: () => syncLogo(),
});
const syncLogo = () => { picker.sync(); scopeLine(); };
const scopeLine = () => {
  const t = targetById(targetOf(select.value));
  $("scope").textContent = !t ? "Pick the chain you're about to send on. The answer depends on it."
    : typeof t.id === "number" ? `Full check: format check, plus asking public services on ${CHAINS.length} EVM chains about this address.`
    : t.reads ? `Format check, plus a read of the ${t.reads} for tag and memo settings.`
    : "Format check only: wrong network and typos. The address never leaves your browser.";
};
select.addEventListener("change", syncLogo);
syncLogo();
$("stat-chains").textContent = `${CHAINS.length + NETWORKS.length} networks`;
$("stat-chains-dd").textContent = `${CHAINS.length} read live`;
$("flow-read").textContent = `the address on all ${CHAINS.length} EVM chains at once, or only its format on other networks`;
for (const c of CHAINS) {
  const li = el("li"); li.append(el("span", {}, c.name), logo(c.id, 26));
  if (c.until) li.append(el("small", {}, `until ${new Date(c.until + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}`));
  $("chainrow").append(li);
}
for (const n of NETWORKS) { const li = el("li"); li.append(el("span", {}, n.name), logo(n.id, 26)); $("netrow").append(li); }

// Days left before Abstract shuts down (UTC); after that the banner says it is gone and the archive answers alone.
const abs = chainById(2741);
if (abs?.until) {
  const days = Math.ceil((Date.parse(abs.until + "T00:00:00Z") - Date.now()) / 86400000);
  $("countdown").textContent = days > 1 ? `Abstract shuts down in ${days} days` : days === 1 ? "Abstract shuts down tomorrow" : "Abstract has shut down";
}

// The archive: one small file per first byte of the address, fetched only when needed.
const loadShard = async (key) => {
  const r = await fetch(`data/abstract/agw/${key}.bin`);
  return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
};
fetch("data/abstract/manifest.json").then((r) => (r.ok ? r.json() : null)).then((m) => {
  if (!m) return;
  $("tag-agw").textContent = `${(m.wallets / 1e6).toFixed(2)}M Abstract wallets`;
}).catch(() => {});

const LABEL = { safe: "Safe", caution: "Caution", stop: "Stop", unknown: "Can't tell", format: "Format OK" };
const chip = (id, c, target) => {
  const k = c.code == null ? "unread" : c.code === "0x" ? (c.nonce > 0 ? "key" : "none") : /^0xef0100/i.test(c.code) ? "key" : "contract";
  const what = { unread: "no answer", key: c.code === "0x" ? `key wallet, ${c.nonce} tx` : "EIP-7702", none: "unused", contract: c.safe ? `Safe ${c.safe.threshold}-of-${c.safe.owners}` : c.token ? `${c.token.symbol} token` : "contract" }[k];
  const li = el("li", { className: `c-${k}${id === target ? " c-target" : ""}`, title: id === target ? "the chain you are sending on" : "" });
  const img = logo(id, 20); if (img) li.append(img);
  li.append(`${chainName(id)}: ${what}`);
  return li;
};

// The route, left to right: what the address is, where it lives, and what happens on the chain you picked.
const KIND = { "abstract-wallet": "Abstract wallet", eip7702: "EIP-7702 account", "key-wallet": "Key wallet", "safe-here": "Safe multisig", "safe-differs": "Safe multisig", "safe-elsewhere": "Safe multisig",
  "token-contract": "Token contract", "contract-here": "Contract", "contract-elsewhere": "Contract", unused: "Never used", unreadable: "Not read" };
const END = { safe: ["s-ok", "✓", "Reachable"], caution: ["s-maybe", "!", "Careful"], stop: ["s-lost", "✕", "Lost"], unknown: ["s-unknown", "?", "Can't tell"], format: ["s-format", "✓", "Format OK"] };
const shorten = (a) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);
const ico = (name) => el("span", { className: `ico i-${name}` });
const bar = (broken) => el("span", { className: `bar${broken ? " broken" : ""}` });
function routeList() {
  const ol = el("ol", { className: "route" });
  const node = (cls, dotKids, title, sub, badge, barEl) => {
    const li = el("li", { className: `stop-n ${cls}` });
    const dot = el("span", { className: "dot" }); dot.setAttribute("aria-hidden", "true"); dot.append(...dotKids);
    if (badge) dot.append(el("span", { className: "badge" }, badge));
    li.append(dot, el("b", {}, title), el("small", {}, sub));
    if (barEl) li.append(barEl);
    ol.append(li);
  };
  return { ol, node };
}

// The same picture for an answer that comes from the address itself: your address, where it belongs, where you're sending it.
function formatRoute(r) {
  const v = r.verdict, here = chainName(r.target), { ol, node } = routeList();
  const wrong = v.kind === "wrong-network";
  const known = !["bad-address", "not-an-address", "ens-unresolved"].includes(v.kind);
  const belongs = wrong ? r.belongs : here;
  const homeLogo = () => { const l = wrong ? (r.suggest !== undefined ? logo(r.suggest, 30) : null) : logo(r.target, 30); return l ?? ico("wallet"); };
  const belongsTo = (sub, cls = "s-ok", badge = "✓") => [cls, [homeLogo()], `Belongs to ${belongs}`, sub, badge];
  const middle = {
    "wrong-network": belongsTo("a different network"),
    "bad-address": ["s-lost", [ico("wallet")], "Typo check", "failed", "✕"],
    "not-an-address": ["s-unknown", [ico("wallet")], "Not recognised", "on any network", "?"],
    "ens-unresolved": ["s-unknown", [ico("wallet")], "No address", "for this name", "?"],
    "old-style": ["s-maybe", [homeLogo()], "Bitcoin or Bitcoin Cash", "can't tell which", "!"],
    "tag-required": belongsTo("needs a tag", "s-maybe", "!"),
    "tag-likely": belongsTo("probably needs a tag", "s-maybe", "!"),
    "memo-required": belongsTo("asks for a memo", "s-maybe", "!"),
    "not-active": belongsTo("not active yet", "s-maybe", "!"),
    sanctioned: ["s-lost", [ico("wallet")], "On the OFAC list", "exact match", "✕"],
  }[v.kind] ?? belongsTo("right network");
  const [endCls, endMark, plain] = END[v.level];
  const endWord = wrong ? "Wrong network" : v.level === "stop" ? "Don't send" : plain;
  const broken = v.level === "stop";
  const first = bar(false); first.style.setProperty("--c2", "var(--blue)");
  node("s-plain", [ico("wallet")], r.ens?.name ?? shorten(r.address), v.kind === "old-style" ? "Old-style address" : known ? `${belongs} address` : "Address", null, first);
  node(...middle, bar(broken));
  node(endCls, [logo(r.target, 30)], `Sent on ${here}`, endWord, endMark);
  ol.setAttribute("aria-label", `${known ? `${belongs} address` : "Address"}; sent on ${here}: ${endWord}`);
  return ol;
}

function route(v, f) {
  const short = shorten(f.address);
  const keyed = v.kind === "key-wallet" || v.kind === "eip7702";
  const homes = v.kind === "abstract-wallet" ? [2741] : Object.entries(f.chains).filter(([, c]) => c.code && c.code !== "0x" && !/^0xef0100/i.test(c.code)).map(([id]) => Number(id));
  const { ol, node } = routeList();
  const [endCls, endMark, plainWord] = END[v.level];
  const endWord = v.kind === "sanctioned" ? "Don't send" : plainWord;
  const broken = v.level === "stop";
  const first = bar(false); first.style.setProperty("--c2", "var(--blue)");
  node("s-plain", [ico(keyed ? "key" : "wallet")], short, KIND[v.kind] ?? "Address", null, first);
  if (v.kind === "sanctioned") node("s-lost", [ico("wallet")], "On the OFAC list", "exact match", "✕", bar(true));
  else if (keyed) node("s-ok", [ico("key")], "One key", "works on every chain", "✓", bar(broken));
  else if (homes.length) node("s-ok", [logo(homes[0], 30)], `Lives on ${chainName(homes[0])}${homes.length > 1 ? ` +${homes.length - 1}` : ""}`, homes.includes(f.target) ? "and here" : "only there", "✓", bar(broken));
  else node("s-unknown", [ico("wallet")], "Lives nowhere yet", "no code, no history", "?", bar(true));
  node(endCls, [logo(f.target, 30)], `Sent on ${chainName(f.target)}`, endWord, endMark);
  ol.setAttribute("aria-label", `${KIND[v.kind] ?? "Address"}; sent on ${chainName(f.target)}: ${endWord}`);
  return ol;
}

function play(ol, level) {
  if (still || typeof ol.animate !== "function") return;
  let t = 0;
  for (const li of ol.children) {
    const dot = li.querySelector(".dot"), bar = li.querySelector(".bar");
    dot.animate([{ opacity: 0.15, transform: "scale(0.6)" }, { opacity: 1, transform: "scale(1.15)", offset: 0.6 }, { opacity: 1, transform: "scale(1)" }], { duration: 380, delay: t, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" });
    for (const x of li.querySelectorAll("b, small")) x.animate([{ opacity: 0.15 }, { opacity: 1 }], { duration: 300, delay: t + 80, fill: "backwards" });
    if (bar) bar.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], { duration: 360, delay: t + 220, easing: "ease-in-out", fill: "backwards" });
    t += 460;
  }
  const end = ol.lastElementChild.querySelector(".dot");
  if (level === "stop") end.animate([{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(5px)" }, { transform: "translateX(-3px)" }, { transform: "translateX(0)" }], { duration: 420, delay: t });
  const ring = { stop: "255,107,107", safe: "221,242,74", caution: "255,181,71", unknown: "143,180,255", format: "94,224,240" }[level];
  end.animate([{ boxShadow: `0 0 0 0 rgba(${ring},0.65)` }, { boxShadow: `0 0 0 16px rgba(${ring},0)` }], { duration: 900, delay: t, iterations: 3, easing: "ease-out" });
}

function render(r) {
  const out = $("out");
  out.replaceChildren();
  if (r.error) { out.append(el("div", { className: "card err" }, r.message)); return; }
  if (r.scope === "format") { const { card, steps } = formatCard(r); out.append(card); play(steps, r.verdict.level); return; }
  const v = r.verdict, f = r.facts;
  const card = el("article", { className: `card ${v.level}` });
  const head = el("header");
  head.append(el("span", { className: `pill l-${v.level}` }, LABEL[v.level]), el("span", { className: "addr" }, `${f.address} on ${chainName(f.target)}`));
  const steps = route(v, f);
  card.append(head);
  if (r.ens) card.append(el("p", { className: "foot" }, `${r.ens.name} points to this address on Ethereum.`));
  card.append(steps, el("p", { className: "title" }, v.title));
  for (const n of r.notices ?? []) card.append(el("p", { className: "notice" }, n));
  const ul = el("ul", { className: "reasons" });
  for (const reason of v.reasons) ul.append(el("li", {}, reason));
  card.append(ul);
  const seen = Object.entries(f.chains).map(([id, c]) => [Number(id), c]).filter(([id, c]) => id === f.target || c.code == null || c.code !== "0x" || c.nonce > 0);
  card.append(el("p", { className: "hint" }, "What each chain says about this address (only chains where it was seen, plus the one you picked):"));
  const chains = el("ul", { className: "chains" });
  for (const [id, c] of seen) chains.append(chip(id, c, f.target));
  card.append(chains);
  if (f.abstractWallet) card.append(el("p", { className: "foot" }, f.abstractSource === "archive" ? "Found in the archive of Abstract wallets." : "Confirmed by Abstract's wallet registry."));
  card.append(el("p", { className: "foot" }, `Read from public RPCs on ${Object.keys(f.chains).length} chains, at the latest block. Nothing was signed.`));
  out.append(card);
  play(steps, v.level);
  if (!still) for (const [i, li] of [...chains.children].entries()) li.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "none" }], { duration: 300, delay: 1400 + i * 70, fill: "backwards" });
}

// No chain was read: an answer from the address format alone, with a way to check it where it belongs.
function formatCard(r) {
  const v = r.verdict;
  const card = el("article", { className: `card ${v.level}` });
  const head = el("header");
  head.append(el("span", { className: `pill l-${v.level}` }, LABEL[v.level]), el("span", { className: "addr" }, `${r.address} on ${chainName(r.target)}`));
  card.append(head);
  if (r.ens) card.append(el("p", { className: "foot" }, `${r.ens.name} points to this address on Ethereum.`));
  const steps = formatRoute(r);
  card.append(steps, el("p", { className: "title" }, v.title));
  if (r.what) card.append(el("p", { className: "hint" }, r.what));
  for (const n of r.notices ?? []) card.append(el("p", { className: "notice" }, n));
  const ul = el("ul", { className: "reasons" });
  for (const reason of v.reasons) ul.append(el("li", {}, reason));
  card.append(ul);
  if (r.suggest !== undefined) {
    const b = el("button", { type: "button", className: "switch" });
    b.append(logo(r.suggest, 20), `Check it on ${chainName(r.suggest)} instead →`);
    b.addEventListener("click", () => { select.value = String(r.suggest); syncLogo(); run(r.address, String(r.suggest)); });
    card.append(b);
  }
  card.append(el("p", { className: "foot" }, r.read ? `Read from the ${r.read}. Nothing was signed.` : "No chain was read for this answer. Nothing was signed."));
  return { card, steps };
}

function reading() {
  const p = el("div", { className: "card reading" });
  const orbit = el("span", { className: "orbit" });
  for (const id of [1, 56, 8453, 42161, 2741]) orbit.append(logo(id, 20));
  const text = el("div");
  text.append(el("b", {}, "Reading the chain…"), el("span", { className: "ld-detail" }, `The address on ${CHAINS.length} chains: is it a contract, a wallet with its own key, or nothing yet.`));
  const bar = el("span", { className: "ld-bar" });
  bar.setAttribute("aria-hidden", "true");
  p.setAttribute("role", "status");
  p.append(orbit, text, bar);
  $("out").replaceChildren(p);
}

async function run(address, chainId) {
  if (!chainId) { picker.open(); return; }
  const go = $("go");
  go.disabled = true; go.textContent = `Reading ${CHAINS.length} chains…`;
  reading();
  $("out").scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  try {
    const result = lookup(address, targetOf(String(chainId)), { loadShard, lists });
    flow.show(address.trim(), targetOf(String(chainId)), result);
    render(await result);
  }
  catch (e) { render({ error: "failed", message: `Something went wrong: ${e.message}` }); }
  finally { go.disabled = false; go.textContent = "Check address →"; }
}

$("f").addEventListener("submit", (e) => { e.preventDefault(); run($("addr").value, select.value); });
for (const b of document.querySelectorAll("button[data-a]")) {
  b.addEventListener("click", () => { $("addr").value = b.dataset.a; select.value = b.dataset.c; syncLogo(); run(b.dataset.a, b.dataset.c); });
}

// The two shipped lists, fetched whole from this site, so the address never goes with the request.
let listsOnce;
const lists = () => (listsOnce ??= Promise.all(["ofac", "exchanges"].map((n) => fetch(`data/lists/${n}.json`).then((r) => (r.ok ? r.json() : Promise.reject(new Error(n)))))).then(([o, e]) => parseLists(o, e)).catch((e) => { listsOnce = null; throw e; }));

const flow = mountFlow({
  rig: $("rig"), dests: $("dests"), readout: $("readout"), toggle: $("flow-toggle"), chains: CHAINS, networks: NETWORKS, targetById, still,
  check: (address, target) => lookup(address, target, { loadShard, lists }),
  onPlay: () => $("out").replaceChildren(),
  onOpen: (address, target) => { $("addr").value = address; select.value = String(target); syncLogo(); run(address, String(target)); },
});

// Sections rise in as they come into view.
const io = new IntersectionObserver((entries) => { for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }, { threshold: 0.12 });
for (const s of document.querySelectorAll(".reveal")) io.observe(s);

// Two tabs. Any link into the guide opens the Explained tab; everything else opens Check.
const guide = new Set(["explained", ...[...$("view-explained").querySelectorAll("[id]")].map((e) => e.id)]);
function showTab() {
  const hash = location.hash.slice(1), explained = guide.has(hash);
  $("view-explained").hidden = !explained;
  $("view-check").hidden = explained;
  $("tab-explained").toggleAttribute("aria-current", false); $("tab-check").toggleAttribute("aria-current", false);
  (explained ? $("tab-explained") : $("tab-check")).setAttribute("aria-current", "page");
  if (explained && hash !== "explained") $(hash)?.scrollIntoView();
  else if (hash === "explained" || hash === "top" || !hash) scrollTo(0, 0);
}
addEventListener("hashchange", showTab);
showTab();

// A link can carry the check: ?address=0x…&chain=56
const q = new URLSearchParams(location.search);
if (q.get("address")) { $("addr").value = q.get("address"); if (q.get("chain")) select.value = q.get("chain"); syncLogo(); run($("addr").value, select.value); }
